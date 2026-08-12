// popup-premium.js
// UI del modo "Formulario Premium". Archivo totalmente separado de
// popup.js: no lee ni modifica ninguna de sus variables. Habla con
// background.js exclusivamente mediante mensajes "PREMIUM_*" (atendidos
// por premium-background.js) y con el content script de la pestaña activa
// para capturar campos y ejecutar formularios.

const ACTION_LABELS = {
  type: "✏️ Escribir texto",
  click: "🖱️ Click izquierdo",
  holdClick: "🖱️ Click mantenido 3s",
  space: "␣ Presionar ESPACIO",
  enter: "↵ Presionar ENTER",
  numpadEnter: "⌨️ ENTER numérico",
  selectOption: "▾ Seleccionar opción",
  toggle: "☑ Marcar / desmarcar",
};

const VALUE_KIND = {
  type: "text",
  selectOption: "text",
  toggle: "toggle-select",
  click: "none",
  holdClick: "none",
  space: "none",
  enter: "none",
  numpadEnter: "none",
};

const pel = {
  tabs: document.getElementById("tabs"),
  autoMain: document.getElementById("autoActionMain"),
  premiumMain: document.getElementById("premiumMain"),
  pageWarning: document.getElementById("pageWarning"),

  listView: document.getElementById("premiumListView"),
  editorView: document.getElementById("premiumEditorView"),
  newFormBtn: document.getElementById("newFormBtn"),
  formList: document.getElementById("formList"),
  formListEmpty: document.getElementById("formListEmpty"),

  backToListBtn: document.getElementById("backToListBtn"),
  formNameInput: document.getElementById("formNameInput"),
  registerFieldBtn: document.getElementById("registerFieldBtn"),
  fieldList: document.getElementById("fieldList"),
  fieldListEmpty: document.getElementById("fieldListEmpty"),

  stopOnMissingCheck: document.getElementById("stopOnMissingCheck"),
  delaySelect: document.getElementById("delaySelect"),
  delayCustomInput: document.getElementById("delayCustomInput"),
  waitTimeoutSelect: document.getElementById("waitTimeoutSelect"),
  reloadCheck: document.getElementById("reloadCheck"),
  reloadDelayRow: document.getElementById("reloadDelayRow"),
  reloadDelaySelect: document.getElementById("reloadDelaySelect"),

  saveFormBtn: document.getElementById("saveFormBtn"),
  runFormBtn: document.getElementById("runFormBtn"),
  stopFormBtn: document.getElementById("stopFormBtn"),

  statusBox: document.getElementById("premiumStatusBox"),
  statusDot: document.getElementById("premiumStatusDot"),
  statusText: document.getElementById("premiumStatusText"),
  progressLine: document.getElementById("premiumProgressLine"),
  errorLine: document.getElementById("premiumErrorLine"),
};

let currentForm = null; // formulario abierto en el editor (copia local)
let premiumRestrictedPage = false;

function sendPremiumMessage(message) {
  return chrome.runtime.sendMessage(message);
}

function escapeHtml(str) {
  return String(str ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

function isPremiumRestrictedUrl(url) {
  if (!url) return true;
  return !/^https?:\/\//i.test(url);
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

// ---------------------------------------------------------------------
// Tabs (Auto Action / Premium)
// ---------------------------------------------------------------------

pel.tabs.addEventListener("click", (e) => {
  const btn = e.target.closest(".tab-btn");
  if (!btn) return;
  [...pel.tabs.querySelectorAll(".tab-btn")].forEach((b) => b.classList.toggle("active", b === btn));
  const isPremium = btn.dataset.tab === "premium";
  pel.autoMain.classList.toggle("hidden", isPremium);
  pel.premiumMain.classList.toggle("hidden", !isPremium);
  if (isPremium) refreshListOrResume();
});

// ---------------------------------------------------------------------
// Inicialización
// ---------------------------------------------------------------------

async function initPremium() {
  const tab = await getActiveTab();
  premiumRestrictedPage = isPremiumRestrictedUrl(tab?.url);
  if (premiumRestrictedPage) {
    pel.newFormBtn.disabled = true;
    pel.registerFieldBtn.disabled = true;
  }
}

async function refreshListOrResume() {
  const res = await sendPremiumMessage({ type: "PREMIUM_LIST_FORMS" });
  if (!res?.ok) return;
  if (res.currentFormId && res.forms.some((f) => f.id === res.currentFormId)) {
    await openForm(res.currentFormId);
  } else {
    renderFormList(res.forms);
    showListView();
  }
}

function showListView() {
  pel.listView.classList.remove("hidden");
  pel.editorView.classList.add("hidden");
}

function showEditorView() {
  pel.listView.classList.add("hidden");
  pel.editorView.classList.remove("hidden");
}

// ---------------------------------------------------------------------
// Lista de formularios
// ---------------------------------------------------------------------

function renderFormList(forms) {
  pel.formList.querySelectorAll(".form-card").forEach((n) => n.remove());
  pel.formListEmpty.classList.toggle("hidden", forms.length > 0);

  for (const form of forms) {
    const card = document.createElement("div");
    card.className = "form-card";
    card.dataset.formId = form.id;
    card.innerHTML = `
      <div class="form-card-info" data-action="open">
        <div class="form-card-name">📋 ${escapeHtml(form.name)}</div>
        <div class="form-card-meta">${form.fieldCount} campo${form.fieldCount === 1 ? "" : "s"}</div>
      </div>
      <div class="form-card-actions">
        <button class="icon-btn" data-action="duplicate" title="Duplicar">⧉</button>
        <button class="icon-btn" data-action="delete" title="Eliminar">🗑</button>
      </div>
    `;
    pel.formList.appendChild(card);
  }
}

pel.formList.addEventListener("click", async (e) => {
  const card = e.target.closest(".form-card");
  if (!card) return;
  const formId = card.dataset.formId;
  const action = e.target.closest("[data-action]")?.dataset.action;

  if (action === "open") {
    await openForm(formId);
  } else if (action === "duplicate") {
    await sendPremiumMessage({ type: "PREMIUM_DUPLICATE_FORM", formId });
    refreshListOrResume();
  } else if (action === "delete") {
    if (!confirm("¿Eliminar este formulario? No se puede deshacer.")) return;
    await sendPremiumMessage({ type: "PREMIUM_DELETE_FORM", formId });
    refreshListOrResume();
  }
});

pel.newFormBtn.addEventListener("click", async () => {
  if (premiumRestrictedPage) return;
  const res = await sendPremiumMessage({ type: "PREMIUM_CREATE_FORM", name: "Nuevo formulario" });
  if (res?.ok) await openForm(res.form.id);
});

pel.backToListBtn.addEventListener("click", async () => {
  await sendPremiumMessage({ type: "PREMIUM_SET_CURRENT_FORM", formId: null });
  currentForm = null;
  refreshListOrResume();
});

// ---------------------------------------------------------------------
// Editor de formulario
// ---------------------------------------------------------------------

async function openForm(formId) {
  const res = await sendPremiumMessage({ type: "PREMIUM_GET_FORM", formId });
  if (!res?.ok) {
    refreshListOrResume();
    return;
  }
  await sendPremiumMessage({ type: "PREMIUM_SET_CURRENT_FORM", formId });
  currentForm = res.form;
  renderEditor();
  showEditorView();
  await refreshRuntime();
}

function renderEditor() {
  pel.formNameInput.value = currentForm.name;
  pel.stopOnMissingCheck.checked = !!currentForm.stopOnMissing;
  pel.waitTimeoutSelect.value = String(currentForm.waitTimeoutMs || 5000);
  pel.reloadCheck.checked = !!currentForm.reloadOnFinish;
  pel.reloadDelaySelect.value = String(currentForm.reloadDelayMs || 1000);
  pel.reloadDelayRow.classList.toggle("hidden", !currentForm.reloadOnFinish);

  const knownDelays = ["0", "100", "250", "500", "1000", "2000"];
  const delayStr = String(currentForm.delayMs ?? 500);
  if (knownDelays.includes(delayStr)) {
    pel.delaySelect.value = delayStr;
    pel.delayCustomInput.classList.add("hidden");
  } else {
    pel.delaySelect.value = "custom";
    pel.delayCustomInput.value = delayStr;
    pel.delayCustomInput.classList.remove("hidden");
  }

  renderFieldList();
}

function renderFieldList() {
  pel.fieldList.querySelectorAll(".field-card").forEach((n) => n.remove());
  pel.fieldListEmpty.classList.toggle("hidden", currentForm.fields.length > 0);

  currentForm.fields.forEach((field, index) => {
    const card = document.createElement("div");
    card.className = "field-card";
    card.dataset.fieldId = field.id;

    const valueKind = VALUE_KIND[field.action] || "text";
    let valueControlHtml = "";
    if (valueKind === "text") {
      valueControlHtml = `<input type="text" class="text-input field-value-input" placeholder="Valor" value="${escapeHtml(
        field.value
      )}" />`;
    } else if (valueKind === "toggle-select") {
      valueControlHtml = `
        <select class="select-input field-value-input">
          <option value="check" ${field.value === "check" ? "selected" : ""}>Marcar</option>
          <option value="uncheck" ${field.value === "uncheck" ? "selected" : ""}>Desmarcar</option>
          <option value="toggle" ${field.value === "toggle" || !field.value ? "selected" : ""}>Alternar</option>
        </select>`;
    }

    const bestSelector = (field.selectors && field.selectors[0]?.value) || "(sin selector)";

    card.innerHTML = `
      <div class="field-card-head">
        <span class="field-index">${index + 1}.</span>
        <input type="text" class="field-label-input" value="${escapeHtml(field.label)}" />
        <div class="field-card-actions">
          <button class="icon-btn" data-action="up" ${index === 0 ? "disabled" : ""} title="Subir">↑</button>
          <button class="icon-btn" data-action="down" ${
            index === currentForm.fields.length - 1 ? "disabled" : ""
          } title="Bajar">↓</button>
          <button class="icon-btn" data-action="recapture" title="Volver a seleccionar">🎯</button>
          <button class="icon-btn" data-action="delete" title="Eliminar">🗑</button>
        </div>
      </div>
      <div class="field-card-selector">${escapeHtml(bestSelector)}</div>
      <div class="field-card-body">
        <select class="select-input field-action-select">
          ${Object.entries(ACTION_LABELS)
            .map(
              ([value, label]) =>
                `<option value="${value}" ${field.action === value ? "selected" : ""}>${label}</option>`
            )
            .join("")}
        </select>
        ${valueControlHtml}
      </div>
    `;
    pel.fieldList.appendChild(card);
  });
}

function getFieldById(fieldId) {
  return currentForm.fields.find((f) => f.id === fieldId);
}

pel.fieldList.addEventListener("click", async (e) => {
  const card = e.target.closest(".field-card");
  if (!card) return;
  const fieldId = card.dataset.fieldId;
  const action = e.target.closest("[data-action]")?.dataset.action;
  if (!action) return;

  if (action === "delete") {
    if (!confirm("¿Eliminar este campo?")) return;
    const res = await sendPremiumMessage({ type: "PREMIUM_DELETE_FIELD", formId: currentForm.id, fieldId });
    if (res?.ok) {
      currentForm = res.form;
      renderFieldList();
    }
  } else if (action === "up" || action === "down") {
    const res = await sendPremiumMessage({
      type: "PREMIUM_REORDER_FIELD",
      formId: currentForm.id,
      fieldId,
      direction: action,
    });
    if (res?.ok) {
      currentForm = res.form;
      renderFieldList();
    }
  } else if (action === "recapture") {
    await startCapture(fieldId);
  }
});

pel.fieldList.addEventListener("change", async (e) => {
  const card = e.target.closest(".field-card");
  if (!card) return;
  const fieldId = card.dataset.fieldId;
  const field = getFieldById(fieldId);
  if (!field) return;

  if (e.target.classList.contains("field-action-select")) {
    field.action = e.target.value;
    field.value = ""; // el valor anterior ya no tiene sentido con la nueva acción
    await sendPremiumMessage({
      type: "PREMIUM_UPDATE_FIELD",
      formId: currentForm.id,
      fieldId,
      patch: { action: field.action, value: field.value },
    });
    renderFieldList(); // el control de "valor" cambia según la acción elegida
  } else if (e.target.classList.contains("field-value-input")) {
    field.value = e.target.value;
    await sendPremiumMessage({ type: "PREMIUM_UPDATE_FIELD", formId: currentForm.id, fieldId, patch: { value: field.value } });
  } else if (e.target.classList.contains("field-label-input")) {
    field.label = e.target.value;
    await sendPremiumMessage({ type: "PREMIUM_UPDATE_FIELD", formId: currentForm.id, fieldId, patch: { label: field.label } });
  }
});

// Los inputs de texto libre (valor) conviene guardarlos también al tipear,
// no solo al perder el foco.
pel.fieldList.addEventListener("input", (e) => {
  if (!e.target.classList.contains("field-value-input") && !e.target.classList.contains("field-label-input")) return;
  const card = e.target.closest(".field-card");
  const field = getFieldById(card?.dataset.fieldId);
  if (!field) return;
  if (e.target.classList.contains("field-value-input")) field.value = e.target.value;
  if (e.target.classList.contains("field-label-input")) field.label = e.target.value;
});

// ---------------------------------------------------------------------
// Captura de campos
// ---------------------------------------------------------------------

pel.registerFieldBtn.addEventListener("click", () => startCapture(null));

async function startCapture(fieldId) {
  if (premiumRestrictedPage || !currentForm) return;
  const tab = await getActiveTab();
  if (isPremiumRestrictedUrl(tab?.url)) return;
  try {
    await chrome.tabs.sendMessage(tab.id, {
      type: "PREMIUM_START_CAPTURE",
      formId: currentForm.id,
      fieldId,
    });
    window.close(); // el usuario tiene que clickear la página
  } catch (e) {
    pel.pageWarning.textContent =
      "No se pudo activar la captura en esta pestaña. Recargá la página e intentá de nuevo.";
    pel.pageWarning.classList.remove("hidden");
  }
}

// ---------------------------------------------------------------------
// Configuración de ejecución
// ---------------------------------------------------------------------

function currentDelayMs() {
  if (pel.delaySelect.value === "custom") {
    return Math.max(0, Number(pel.delayCustomInput.value) || 0);
  }
  return Number(pel.delaySelect.value);
}

pel.delaySelect.addEventListener("change", () => {
  pel.delayCustomInput.classList.toggle("hidden", pel.delaySelect.value !== "custom");
});

pel.reloadCheck.addEventListener("change", () => {
  pel.reloadDelayRow.classList.toggle("hidden", !pel.reloadCheck.checked);
});

pel.formNameInput.addEventListener("input", () => {
  if (currentForm) currentForm.name = pel.formNameInput.value;
});

pel.saveFormBtn.addEventListener("click", async () => {
  if (!currentForm) return;
  const patch = {
    id: currentForm.id,
    name: pel.formNameInput.value.trim() || "Formulario sin nombre",
    delayMs: currentDelayMs(),
    waitTimeoutMs: Number(pel.waitTimeoutSelect.value),
    reloadOnFinish: pel.reloadCheck.checked,
    reloadDelayMs: Number(pel.reloadDelaySelect.value),
    stopOnMissing: pel.stopOnMissingCheck.checked,
    fields: currentForm.fields,
  };
  const res = await sendPremiumMessage({ type: "PREMIUM_SAVE_FORM", form: patch });
  if (res?.ok) {
    currentForm = res.form;
    pel.saveFormBtn.textContent = "✓ GUARDADO";
    setTimeout(() => (pel.saveFormBtn.textContent = "GUARDAR"), 1200);
  }
});

// ---------------------------------------------------------------------
// Ejecutar / Detener
// ---------------------------------------------------------------------

pel.runFormBtn.addEventListener("click", async () => {
  if (!currentForm || currentForm.fields.length === 0) return;
  const tab = await getActiveTab();
  if (isPremiumRestrictedUrl(tab?.url)) {
    pel.pageWarning.textContent = "Esta página no admite Formulario Premium.";
    pel.pageWarning.classList.remove("hidden");
    return;
  }

  const form = {
    ...currentForm,
    name: pel.formNameInput.value.trim() || currentForm.name,
    delayMs: currentDelayMs(),
    waitTimeoutMs: Number(pel.waitTimeoutSelect.value),
    reloadOnFinish: pel.reloadCheck.checked,
    reloadDelayMs: Number(pel.reloadDelaySelect.value),
    stopOnMissing: pel.stopOnMissingCheck.checked,
  };

  // Guardamos también la config de ejecución antes de correr, para que
  // quede consistente si el popup se cierra durante la corrida.
  await sendPremiumMessage({ type: "PREMIUM_SAVE_FORM", form });

  try {
    const res = await chrome.tabs.sendMessage(tab.id, { type: "PREMIUM_RUN_FORM", form });
    if (!res?.ok) {
      pel.errorLine.textContent =
        res?.error === "already_running" ? "Ya hay un formulario ejecutándose en esta pestaña." : "No se pudo iniciar.";
      pel.errorLine.classList.remove("hidden");
      return;
    }
  } catch (e) {
    pel.pageWarning.textContent = "No se pudo ejecutar en esta pestaña. Recargá la página e intentá de nuevo.";
    pel.pageWarning.classList.remove("hidden");
    return;
  }

  refreshRuntime();
});

pel.stopFormBtn.addEventListener("click", async () => {
  const tab = await getActiveTab();
  if (!tab) return;
  try {
    await chrome.tabs.sendMessage(tab.id, { type: "PREMIUM_STOP_RUN" });
  } catch (e) {
    /* si la pestaña ya no tiene el content script, no hay nada que detener */
  }
});

// ---------------------------------------------------------------------
// Estado de ejecución (progreso en vivo)
// ---------------------------------------------------------------------

let runtimePoll = null;

async function refreshRuntime() {
  const res = await sendPremiumMessage({ type: "PREMIUM_GET_RUNTIME" });
  if (!res?.ok) return;
  renderRuntime(res.runtime);
}

function renderRuntime(runtime) {
  if (!currentForm || runtime.formId !== currentForm.id) {
    pel.statusBox.classList.add("hidden");
    pel.runFormBtn.classList.remove("hidden");
    pel.stopFormBtn.classList.add("hidden");
    stopPolling();
    return;
  }

  const isRunning = runtime.status === "running";
  pel.statusBox.classList.remove("hidden");
  pel.runFormBtn.classList.toggle("hidden", isRunning);
  pel.stopFormBtn.classList.toggle("hidden", !isRunning);

  pel.statusDot.className = "dot";
  pel.errorLine.classList.add("hidden");
  pel.progressLine.classList.add("hidden");

  if (isRunning) {
    pel.statusDot.classList.add("dot-running");
    pel.statusText.textContent = "🟢 Ejecutando formulario...";
    if (runtime.currentIndex >= 0) {
      const step = `${runtime.currentIndex + 1} / ${runtime.totalFields}`;
      const actionLabel =
        { esperando: "Esperando elemento...", ejecutando: "Ejecutando...", "no-encontrado": "⚠ No se encontró" }[
          runtime.currentAction
        ] || runtime.currentAction || "";
      pel.progressLine.textContent = `${step} — ${runtime.currentFieldLabel || ""} — ${actionLabel}`;
      pel.progressLine.classList.remove("hidden");
    }
    startPolling();
  } else if (runtime.status === "error") {
    pel.statusDot.classList.add("dot-error");
    pel.statusText.textContent = "🔴 Error";
    pel.errorLine.textContent = runtime.message || "Ocurrió un error.";
    pel.errorLine.classList.remove("hidden");
    stopPolling();
  } else if (runtime.status === "done") {
    pel.statusDot.classList.add("dot-idle");
    pel.statusText.textContent = runtime.message?.includes("Recargando")
      ? "🔄 Recargando página..."
      : "✅ Formulario completado";
    stopPolling();
  } else {
    pel.statusBox.classList.add("hidden");
    stopPolling();
  }
}

function startPolling() {
  if (runtimePoll) return;
  runtimePoll = setInterval(refreshRuntime, 700);
}

function stopPolling() {
  if (!runtimePoll) return;
  clearInterval(runtimePoll);
  runtimePoll = null;
}

// Si el popup se reabre mientras hay una corrida en curso (o recién
// terminada) en la pestaña activa, reflejarlo apenas se abre la vista.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes.premiumRuntime && currentForm) {
    renderRuntime({ ...changes.premiumRuntime.newValue });
  }
});

window.addEventListener("unload", stopPolling);

initPremium();
