// premium-background.js
// Módulo del modo "Formulario Premium". Se carga con importScripts() desde
// background.js y vive en el mismo contexto de service worker, pero no
// toca ninguna variable/función de Auto Action: registra su propio
// listener de mensajes y solo reacciona a tipos "PREMIUM_*".
//
// Responsabilidades:
//  - CRUD de formularios guardados (chrome.storage.local: "premiumForms").
//  - Relevo del progreso de ejecución ("premiumRuntime") para que el popup
//    pueda reflejarlo aunque se haya cerrado y vuelto a abrir a mitad de
//    una corrida (mismo patrón que "runtime" de Auto Action).
//  - Recordar qué formulario se estaba editando ("premiumUiState") para
//    que, al capturar un campo (lo cual cierra el popup porque el usuario
//    tiene que clickear la página), al reabrir el popup se retome donde
//    quedó.
//
// La ejecución real de los campos (DOM) ocurre en premium-content.js; este
// archivo nunca toca el DOM de la página.

const PREMIUM_DEFAULT_RUNTIME = {
  formId: null,
  status: "idle", // idle | capturing | running | done | error
  currentIndex: -1,
  totalFields: 0,
  currentFieldLabel: null,
  currentAction: null,
  message: null,
  startedAt: null,
  finishedAt: null,
};

function premiumId() {
  return `f_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

async function getPremiumState() {
  const data = await chrome.storage.local.get(["premiumForms", "premiumRuntime", "premiumUiState"]);
  return {
    forms: data.premiumForms || {},
    runtime: { ...PREMIUM_DEFAULT_RUNTIME, ...(data.premiumRuntime || {}) },
    uiState: data.premiumUiState || { currentFormId: null },
  };
}

async function savePremiumForms(forms) {
  await chrome.storage.local.set({ premiumForms: forms });
}

async function setPremiumRuntime(patch) {
  const { runtime } = await getPremiumState();
  const next = { ...runtime, ...patch };
  await chrome.storage.local.set({ premiumRuntime: next });
  return next;
}

async function setPremiumUiState(patch) {
  const { uiState } = await getPremiumState();
  const next = { ...uiState, ...patch };
  await chrome.storage.local.set({ premiumUiState: next });
  return next;
}

function newForm(name) {
  const now = Date.now();
  return {
    id: premiumId(),
    name: name || "Nuevo formulario",
    fields: [],
    delayMs: 500,
    reloadOnFinish: false,
    reloadDelayMs: 1000,
    stopOnMissing: true,
    waitTimeoutMs: 5000,
    createdAt: now,
    updatedAt: now,
  };
}

function newField(capture) {
  return {
    id: premiumId(),
    label: capture.suggestedLabel || "Campo sin nombre",
    elementKind: capture.elementKind,
    action: capture.suggestedAction,
    value: "",
    selectors: capture.selectors,
    meta: capture.meta,
  };
}

// ---------------------------------------------------------------------
// Mensajería (solo tipos "PREMIUM_*")
// ---------------------------------------------------------------------

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg.type !== "string" || !msg.type.startsWith("PREMIUM_")) return;

  (async () => {
    switch (msg.type) {
      case "PREMIUM_LIST_FORMS": {
        const { forms, uiState } = await getPremiumState();
        const list = Object.values(forms)
          .sort((a, b) => b.updatedAt - a.updatedAt)
          .map((f) => ({ id: f.id, name: f.name, fieldCount: f.fields.length, updatedAt: f.updatedAt }));
        sendResponse({ ok: true, forms: list, currentFormId: uiState.currentFormId });
        break;
      }

      case "PREMIUM_GET_FORM": {
        const { forms } = await getPremiumState();
        const form = forms[msg.formId];
        if (!form) {
          sendResponse({ ok: false, error: "not_found" });
          break;
        }
        sendResponse({ ok: true, form });
        break;
      }

      case "PREMIUM_CREATE_FORM": {
        const { forms } = await getPremiumState();
        const form = newForm(msg.name);
        forms[form.id] = form;
        await savePremiumForms(forms);
        await setPremiumUiState({ currentFormId: form.id });
        sendResponse({ ok: true, form });
        break;
      }

      case "PREMIUM_SAVE_FORM": {
        if (!msg.form || !msg.form.id) {
          sendResponse({ ok: false, error: "invalid_form" });
          break;
        }
        const { forms } = await getPremiumState();
        const existing = forms[msg.form.id];
        const merged = { ...existing, ...msg.form, updatedAt: Date.now() };
        forms[merged.id] = merged;
        await savePremiumForms(forms);
        sendResponse({ ok: true, form: merged });
        break;
      }

      case "PREMIUM_DELETE_FORM": {
        const { forms, uiState } = await getPremiumState();
        delete forms[msg.formId];
        await savePremiumForms(forms);
        if (uiState.currentFormId === msg.formId) {
          await setPremiumUiState({ currentFormId: null });
        }
        sendResponse({ ok: true });
        break;
      }

      case "PREMIUM_DUPLICATE_FORM": {
        const { forms } = await getPremiumState();
        const original = forms[msg.formId];
        if (!original) {
          sendResponse({ ok: false, error: "not_found" });
          break;
        }
        const now = Date.now();
        const copy = {
          ...original,
          id: premiumId(),
          name: `${original.name} (copia)`,
          fields: original.fields.map((f) => ({ ...f, id: premiumId() })),
          createdAt: now,
          updatedAt: now,
        };
        forms[copy.id] = copy;
        await savePremiumForms(forms);
        sendResponse({ ok: true, form: copy });
        break;
      }

      case "PREMIUM_SET_CURRENT_FORM": {
        await setPremiumUiState({ currentFormId: msg.formId });
        sendResponse({ ok: true });
        break;
      }

      case "PREMIUM_UPDATE_FIELD": {
        const { forms } = await getPremiumState();
        const form = forms[msg.formId];
        if (!form) {
          sendResponse({ ok: false, error: "not_found" });
          break;
        }
        const field = form.fields.find((f) => f.id === msg.fieldId);
        if (!field) {
          sendResponse({ ok: false, error: "field_not_found" });
          break;
        }
        Object.assign(field, msg.patch || {});
        form.updatedAt = Date.now();
        await savePremiumForms(forms);
        sendResponse({ ok: true, form });
        break;
      }

      case "PREMIUM_DELETE_FIELD": {
        const { forms } = await getPremiumState();
        const form = forms[msg.formId];
        if (!form) {
          sendResponse({ ok: false, error: "not_found" });
          break;
        }
        form.fields = form.fields.filter((f) => f.id !== msg.fieldId);
        form.updatedAt = Date.now();
        await savePremiumForms(forms);
        sendResponse({ ok: true, form });
        break;
      }

      case "PREMIUM_REORDER_FIELD": {
        const { forms } = await getPremiumState();
        const form = forms[msg.formId];
        if (!form) {
          sendResponse({ ok: false, error: "not_found" });
          break;
        }
        const idx = form.fields.findIndex((f) => f.id === msg.fieldId);
        const target = msg.direction === "up" ? idx - 1 : idx + 1;
        if (idx === -1 || target < 0 || target >= form.fields.length) {
          sendResponse({ ok: true, form }); // no-op, ya está en el extremo
          break;
        }
        const [field] = form.fields.splice(idx, 1);
        form.fields.splice(target, 0, field);
        form.updatedAt = Date.now();
        await savePremiumForms(forms);
        sendResponse({ ok: true, form });
        break;
      }

      case "PREMIUM_FIELD_CAPTURED": {
        const { forms } = await getPremiumState();
        const form = forms[msg.formId];
        if (!form) {
          sendResponse({ ok: false, error: "not_found" });
          break;
        }
        const field = newField(msg.capture);
        if (msg.fieldId) {
          // Re-selección de un campo existente: conserva label/acción/valor,
          // solo actualiza cómo se localiza el elemento.
          const existing = form.fields.find((f) => f.id === msg.fieldId);
          if (existing) {
            existing.selectors = field.selectors;
            existing.meta = field.meta;
            existing.elementKind = field.elementKind;
          } else {
            form.fields.push(field);
          }
        } else {
          form.fields.push(field);
        }
        form.updatedAt = Date.now();
        await savePremiumForms(forms);
        await setPremiumRuntime({ status: "idle" });
        sendResponse({ ok: true, form, field });
        break;
      }

      case "PREMIUM_GET_RUNTIME": {
        const { runtime } = await getPremiumState();
        sendResponse({ ok: true, runtime });
        break;
      }

      case "PREMIUM_SET_RUNTIME": {
        const runtime = await setPremiumRuntime(msg.patch || {});
        sendResponse({ ok: true, runtime });
        break;
      }

      default:
        sendResponse({ ok: false, error: "unknown_premium_message" });
    }
  })();
  return true;
});
