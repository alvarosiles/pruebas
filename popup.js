// popup.js
// El popup es "tonto": solo lee/escribe estado en background.js y refleja
// lo que hay. No ejecuta ningún temporizador real aquí, para que todo
// siga funcionando aunque el popup esté cerrado.

const MIN_INTERVAL_MS = 5000;
const MULTIPLIER = { seconds: 1000, minutes: 60000, hours: 3600000 };

const el = {
  pageWarning: document.getElementById("pageWarning"),
  zoneStatus: document.getElementById("zoneStatus"),
  zoneStatusText: document.getElementById("zoneStatusText"),
  selectZoneBtn: document.getElementById("selectZoneBtn"),
  quickIntervals: document.getElementById("quickIntervals"),
  customChip: document.getElementById("customChip"),
  customValue: document.getElementById("customValue"),
  customUnit: document.getElementById("customUnit"),
  intervalError: document.getElementById("intervalError"),
  startBtn: document.getElementById("startBtn"),
  stopBtn: document.getElementById("stopBtn"),
  statusDot: document.getElementById("statusDot"),
  statusText: document.getElementById("statusText"),
  countdownLine: document.getElementById("countdownLine"),
  countdownValue: document.getElementById("countdownValue"),
  errorLine: document.getElementById("errorLine"),
};

let currentConfig = null;
let currentRuntime = null;
let countdownTimer = null;
let restrictedPage = false;

function sendBg(message) {
  return chrome.runtime.sendMessage(message);
}

function isRestrictedUrl(url) {
  if (!url) return true;
  return !/^https?:\/\//i.test(url);
}

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (isRestrictedUrl(tab?.url)) {
    restrictedPage = true;
    el.pageWarning.textContent =
      "Esta pestaña es una página interna/restringida de Chrome (o no es http/https). No se puede seleccionar zona ni ejecutar acciones aquí.";
    el.pageWarning.classList.remove("hidden");
  }

  const state = await sendBg({ type: "GET_STATE" });
  currentConfig = state.config;
  currentRuntime = state.runtime;
  renderAll();

  countdownTimer = setInterval(renderCountdown, 500);
}

function renderAll() {
  renderZone();
  renderInterval();
  renderAction();
  renderStatus();
  renderLockState();
}

function renderZone() {
  if (currentConfig.zone) {
    const z = currentConfig.zone;
    el.zoneStatusText.textContent = `Zona seleccionada ✓  (${Math.round(z.width)}×${Math.round(
      z.height
    )}px) — ${z.title || z.url}`;
    el.zoneStatus.classList.add("filled");
    el.selectZoneBtn.textContent = "Cambiar zona";
  } else {
    el.zoneStatusText.textContent = "Ninguna zona seleccionada";
    el.zoneStatus.classList.remove("filled");
    el.selectZoneBtn.textContent = "Seleccionar zona";
  }
}

function renderInterval() {
  const chips = [...el.quickIntervals.querySelectorAll(".chip")];
  const matchSeconds = currentConfig.intervalMs / 1000;
  let matched = false;
  chips.forEach((chip) => {
    const isMatch = Number(chip.dataset.seconds) === matchSeconds;
    chip.classList.toggle("active", isMatch);
    if (isMatch) matched = true;
  });
  el.customChip.classList.toggle("active", !matched);
  el.customValue.value = currentConfig.intervalValue;
  el.customUnit.value = currentConfig.intervalUnit;
}

function renderAction() {
  const radios = document.querySelectorAll('input[name="action"]');
  radios.forEach((r) => {
    r.checked = r.value === currentConfig.action;
  });
}

function renderStatus() {
  el.statusDot.className = "dot";
  el.errorLine.classList.add("hidden");
  el.countdownLine.classList.add("hidden");

  if (currentRuntime.status === "running") {
    el.statusDot.classList.add("dot-running");
    el.statusText.textContent = "🟢 ACTIVO";
    el.countdownLine.classList.remove("hidden");
  } else if (currentRuntime.status === "error") {
    el.statusDot.classList.add("dot-error");
    el.statusText.textContent = "🔴 ERROR";
    el.errorLine.textContent = currentRuntime.lastError || "Ocurrió un error.";
    el.errorLine.classList.remove("hidden");
  } else {
    el.statusDot.classList.add("dot-idle");
    el.statusText.textContent = "⚪ DETENIDO";
  }

  el.startBtn.classList.toggle("hidden", currentRuntime.status === "running");
  el.stopBtn.classList.toggle("hidden", currentRuntime.status !== "running");
  renderCountdown();
}

function renderCountdown() {
  if (currentRuntime.status !== "running" || !currentRuntime.nextActionAt) return;
  const remainingMs = Math.max(0, currentRuntime.nextActionAt - Date.now());
  const totalSec = Math.ceil(remainingMs / 1000);
  const mm = String(Math.floor(totalSec / 60)).padStart(2, "0");
  const ss = String(totalSec % 60).padStart(2, "0");
  el.countdownValue.textContent = `${mm}:${ss}`;
}

function renderLockState() {
  const locked = currentRuntime.status === "running";
  el.selectZoneBtn.disabled = locked || restrictedPage;
  [...el.quickIntervals.querySelectorAll(".chip")].forEach((c) => (c.disabled = locked));
  el.customChip.disabled = locked;
  el.customValue.disabled = locked;
  el.customUnit.disabled = locked;
  document.querySelectorAll('input[name="action"]').forEach((r) => (r.disabled = locked));
}

// ---------------------------------------------------------------------
// Zona
// ---------------------------------------------------------------------

el.selectZoneBtn.addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (isRestrictedUrl(tab?.url)) return;
  try {
    await chrome.tabs.sendMessage(tab.id, { type: "START_ZONE_SELECTION" });
    window.close(); // dejamos que el usuario interactúe con la página
  } catch (e) {
    el.pageWarning.textContent =
      "No se pudo activar la selección en esta pestaña. Recarga la página e inténtalo de nuevo (algunas páginas internas no admiten extensiones).";
    el.pageWarning.classList.remove("hidden");
  }
});

// ---------------------------------------------------------------------
// Intervalo
// ---------------------------------------------------------------------

function applyIntervalMs(ms, { value, unit } = {}) {
  currentConfig.intervalMs = ms;
  if (value != null) currentConfig.intervalValue = value;
  if (unit != null) currentConfig.intervalUnit = unit;
  sendBg({
    type: "SET_CONFIG",
    patch: {
      intervalMs: currentConfig.intervalMs,
      intervalValue: currentConfig.intervalValue,
      intervalUnit: currentConfig.intervalUnit,
    },
  });
  renderInterval();
}

el.quickIntervals.addEventListener("click", (e) => {
  const chip = e.target.closest(".chip");
  if (!chip || chip.disabled) return;
  const seconds = Number(chip.dataset.seconds);
  el.intervalError.classList.add("hidden");
  applyIntervalMs(seconds * 1000, {
    value: seconds >= 60 ? seconds / 60 : seconds,
    unit: seconds >= 60 ? "minutes" : "seconds",
  });
});

function validateAndApplyCustom() {
  const raw = el.customValue.value.trim();
  const value = Number(raw);
  const unit = el.customUnit.value;

  if (!raw || !Number.isFinite(value) || value <= 0) {
    el.intervalError.textContent = "Introduce un número mayor que 0.";
    el.intervalError.classList.remove("hidden");
    return;
  }

  const ms = value * MULTIPLIER[unit];
  if (ms < MIN_INTERVAL_MS) {
    el.intervalError.textContent = `El intervalo mínimo permitido es ${MIN_INTERVAL_MS / 1000} segundos (por rendimiento). Chrome además limita la precisión de alarmas a ~30s en extensiones instaladas normalmente.`;
    el.intervalError.classList.remove("hidden");
    return;
  }

  el.intervalError.classList.add("hidden");
  applyIntervalMs(ms, { value, unit });
}

el.customChip.addEventListener("click", () => {
  if (el.customChip.disabled) return;
  validateAndApplyCustom();
});
el.customValue.addEventListener("change", validateAndApplyCustom);
el.customUnit.addEventListener("change", validateAndApplyCustom);

// ---------------------------------------------------------------------
// Acción
// ---------------------------------------------------------------------

document.querySelectorAll('input[name="action"]').forEach((radio) => {
  radio.addEventListener("change", () => {
    if (!radio.checked) return;
    currentConfig.action = radio.value;
    sendBg({ type: "SET_CONFIG", patch: { action: radio.value } });
  });
});

// ---------------------------------------------------------------------
// Iniciar / Detener
// ---------------------------------------------------------------------

el.startBtn.addEventListener("click", async () => {
  const res = await sendBg({ type: "START" });
  if (!res.ok) {
    if (res.error === "no_zone") {
      el.intervalError.classList.add("hidden");
      el.zoneStatus.classList.remove("filled");
      el.zoneStatusText.textContent = "Selecciona una zona antes de iniciar.";
    } else if (res.error === "invalid_interval") {
      el.intervalError.textContent = "Configura un intervalo válido antes de iniciar.";
      el.intervalError.classList.remove("hidden");
    }
    return;
  }
  const state = await sendBg({ type: "GET_STATE" });
  currentConfig = state.config;
  currentRuntime = state.runtime;
  renderAll();
});

el.stopBtn.addEventListener("click", async () => {
  await sendBg({ type: "STOP" });
  const state = await sendBg({ type: "GET_STATE" });
  currentConfig = state.config;
  currentRuntime = state.runtime;
  renderAll();
});

// ---------------------------------------------------------------------
// Refrescar si algo cambia mientras el popup está abierto (poco frecuente,
// pero puede pasar si la automatización corre y actualiza runtime).
// ---------------------------------------------------------------------

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes.config) currentConfig = { ...currentConfig, ...changes.config.newValue };
  if (changes.runtime) currentRuntime = { ...currentRuntime, ...changes.runtime.newValue };
  renderAll();
});

window.addEventListener("unload", () => {
  if (countdownTimer) clearInterval(countdownTimer);
});

init();
