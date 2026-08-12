// background.js (service worker, Manifest V3)
//
// El popup puede cerrarse en cualquier momento (Chrome lo hace
// automáticamente al perder el foco), así que NO puede ser el dueño del
// temporizador. Todo el estado "fuente de verdad" vive en
// chrome.storage.local y el reloj lo lleva chrome.alarms, que Chrome
// puede despertar aunque el service worker esté dormido o el popup
// cerrado. Cada vez que una acción termina, se reprograma la siguiente
// alarma desde cero (delay dinámico), en vez de usar un periodo fijo, para
// poder soportar "el intervalo reinicia después de completar la acción"
// (relevante sobre todo para el click mantenido 3s).

const ALARM_NAME = "autoAction";
const MIN_INTERVAL_MS = 5000;

const DEFAULT_CONFIG = {
  zone: null, // { x, y, width, height, tabId, url, title }
  intervalMs: 60000,
  intervalValue: 1,
  intervalUnit: "minutes",
  action: "click",
};

const DEFAULT_RUNTIME = {
  status: "idle", // idle | running | error
  nextActionAt: null,
  lastError: null,
  lastRunAt: null,
  actionInProgress: false,
};

async function getState() {
  const data = await chrome.storage.local.get(["config", "runtime"]);
  return {
    config: { ...DEFAULT_CONFIG, ...(data.config || {}) },
    runtime: { ...DEFAULT_RUNTIME, ...(data.runtime || {}) },
  };
}

async function setConfig(patch) {
  const { config } = await getState();
  const next = { ...config, ...patch };
  await chrome.storage.local.set({ config: next });
  return next;
}

async function setRuntime(patch) {
  const { runtime } = await getState();
  const next = { ...runtime, ...patch };
  await chrome.storage.local.set({ runtime: next });
  return next;
}

chrome.runtime.onInstalled.addListener(async () => {
  const data = await chrome.storage.local.get(["config", "runtime"]);
  if (!data.config) await chrome.storage.local.set({ config: DEFAULT_CONFIG });
  if (!data.runtime) await chrome.storage.local.set({ runtime: DEFAULT_RUNTIME });
});

// ---------------------------------------------------------------------
// Start / Stop
// ---------------------------------------------------------------------

async function startAutomation() {
  const { config, runtime } = await getState();
  if (runtime.status === "running") return { ok: true }; // ya estaba activo
  if (!config.zone) return { ok: false, error: "no_zone" };
  if (!config.intervalMs || config.intervalMs < MIN_INTERVAL_MS) {
    return { ok: false, error: "invalid_interval" };
  }

  await chrome.alarms.clear(ALARM_NAME);
  const nextActionAt = Date.now() + config.intervalMs;
  await chrome.alarms.create(ALARM_NAME, { when: nextActionAt });
  await setRuntime({
    status: "running",
    nextActionAt,
    lastError: null,
    actionInProgress: false,
  });
  return { ok: true };
}

async function stopAutomation() {
  await chrome.alarms.clear(ALARM_NAME);
  const { config, runtime } = await getState();
  if (runtime.actionInProgress && config.zone?.tabId != null) {
    try {
      await chrome.tabs.sendMessage(config.zone.tabId, { type: "CANCEL_ACTION" });
    } catch (e) {
      // La pestaña ya no existe o no tiene el content script: no hay nada que liberar.
    }
  }
  await setRuntime({ status: "idle", nextActionAt: null, actionInProgress: false });
  return { ok: true };
}

async function failAutomation(message) {
  await chrome.alarms.clear(ALARM_NAME);
  await setRuntime({
    status: "error",
    lastError: message,
    actionInProgress: false,
    nextActionAt: null,
  });
}

// ---------------------------------------------------------------------
// Ciclo principal: se dispara cada vez que la alarma suena
// ---------------------------------------------------------------------

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== ALARM_NAME) return;

  const { config, runtime } = await getState();
  if (runtime.status !== "running") return; // se detuvo mientras tanto

  if (!config.zone) {
    await failAutomation("No hay ninguna zona configurada.");
    return;
  }

  let tab;
  try {
    tab = await chrome.tabs.get(config.zone.tabId);
  } catch (e) {
    await failAutomation("La pestaña con la zona seleccionada ya no existe.");
    return;
  }

  try {
    const tabOrigin = new URL(tab.url).origin;
    const zoneOrigin = new URL(config.zone.url).origin;
    if (tabOrigin !== zoneOrigin) {
      await failAutomation("La página cambió de dirección; automatización detenida por seguridad.");
      return;
    }
  } catch (e) {
    // Si no se puede parsear la URL (p. ej. about:blank) seguimos igual,
    // el propio sendMessage fallará más abajo si la pestaña no es válida.
  }

  await setRuntime({ actionInProgress: true });

  try {
    const response = await chrome.tabs.sendMessage(config.zone.tabId, {
      type: "DO_ACTION",
      action: config.action,
      zone: config.zone,
    });
    if (!response || !response.ok) {
      throw new Error(response?.error || "La página no respondió a la acción.");
    }

    const fresh = await getState();
    if (fresh.runtime.status !== "running") return; // detenido durante la acción

    const nextActionAt = Date.now() + fresh.config.intervalMs;
    await chrome.alarms.create(ALARM_NAME, { when: nextActionAt });
    await setRuntime({
      status: "running",
      nextActionAt,
      lastRunAt: Date.now(),
      actionInProgress: false,
      lastError: null,
    });
  } catch (e) {
    await failAutomation(
      "No se pudo ejecutar la acción en la página (¿recargaste la pestaña? ¿es una página restringida?): " +
        e.message
    );
  }
});

// Si cierran la pestaña de la zona mientras está activo, detenemos al instante
// en vez de esperar a la próxima alarma.
chrome.tabs.onRemoved.addListener(async (tabId) => {
  const { config, runtime } = await getState();
  if (runtime.status === "running" && config.zone?.tabId === tabId) {
    await failAutomation("La pestaña seleccionada fue cerrada.");
  }
});

// Si navegan a otro origen en esa misma pestaña, detenemos por seguridad.
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
  if (!changeInfo.url) return;
  const { config, runtime } = await getState();
  if (runtime.status !== "running" || config.zone?.tabId !== tabId) return;
  try {
    const newOrigin = new URL(changeInfo.url).origin;
    const zoneOrigin = new URL(config.zone.url).origin;
    if (newOrigin !== zoneOrigin) {
      await failAutomation("La página cambió de dirección; automatización detenida por seguridad.");
    }
  } catch (e) {
    /* URL no parseable, se ignora */
  }
});

// ---------------------------------------------------------------------
// Mensajería con popup.js y content.js
// ---------------------------------------------------------------------

// Tipos que este listener conoce. Los demás (p. ej. "PREMIUM_*") se dejan
// pasar sin responder, para que otro listener registrado en el mismo
// contexto del service worker (ver premium-background.js, cargado abajo
// con importScripts) pueda atenderlos. Si este listener respondiera a todo
// por defecto, le "robaría" la respuesta a esos otros listeners: Chrome
// entrega el mensaje a TODOS los listeners registrados, pero solo la
// primera llamada a sendResponse() cuenta.
const KNOWN_MESSAGE_TYPES = new Set([
  "GET_STATE",
  "SET_CONFIG",
  "START",
  "STOP",
  "ZONE_SELECTED",
  "ZONE_SELECTION_CANCELLED",
]);

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!KNOWN_MESSAGE_TYPES.has(msg?.type)) return; // lo maneja otro listener

  (async () => {
    switch (msg.type) {
      case "GET_STATE":
        sendResponse(await getState());
        break;
      case "SET_CONFIG": {
        const config = await setConfig(msg.patch || {});
        sendResponse({ ok: true, config });
        break;
      }
      case "START":
        sendResponse(await startAutomation());
        break;
      case "STOP":
        sendResponse(await stopAutomation());
        break;
      case "ZONE_SELECTED": {
        if (!sender.tab) {
          sendResponse({ ok: false, error: "no_tab" });
          break;
        }
        const zone = {
          x: msg.zone.x,
          y: msg.zone.y,
          width: msg.zone.width,
          height: msg.zone.height,
          tabId: sender.tab.id,
          url: msg.url,
          title: msg.title,
        };
        await setConfig({ zone });
        sendResponse({ ok: true, zone });
        break;
      }
      case "ZONE_SELECTION_CANCELLED":
        sendResponse({ ok: true });
        break;
    }
  })();
  return true; // todas las respuestas son asíncronas
});

// Módulo adicional del modo "Formulario Premium". Vive en su propio archivo
// y registra su propio listener de mensajes (solo para tipos "PREMIUM_*");
// no toca ni depende de nada de arriba.
importScripts("premium-background.js");
