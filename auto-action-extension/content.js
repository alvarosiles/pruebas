// content.js
// Se inyecta en (casi) todas las páginas. Dos responsabilidades:
//  1) Selección visual de una zona (rectángulo) con cancelación por ESC.
//  2) Ejecución de las 5 acciones automatizadas sobre esa zona.
//
// Nota técnica: los eventos que despachamos aquí son sintéticos
// (event.isTrusted === false). Eso alcanza a disparar listeners de la
// página (click/keydown/keyup, frameworks JS, activación de <a>), pero NO
// puede activar comportamientos que Chrome reserva a interacción humana
// real (autoplay con audio, fullscreen, portapapeles, etc.). Es la
// limitación real del modelo de seguridad del navegador, no un bug.

(() => {
  if (window.__autoActionContentLoaded) return;
  window.__autoActionContentLoaded = true;

  const OVERLAY_ID = "auto-action-overlay-host";
  let selection = null; // estado de selección en curso
  let holdState = null; // estado del click mantenido en curso

  // ---------------------------------------------------------------------
  // Selección de zona
  // ---------------------------------------------------------------------

  function startZoneSelection() {
    if (selection) return; // ya hay una selección en curso

    const host = document.createElement("div");
    host.id = OVERLAY_ID;
    host.style.all = "initial";
    (document.body || document.documentElement).appendChild(host);
    const shadow = host.attachShadow({ mode: "closed" });

    const style = document.createElement("style");
    style.textContent = `
      .overlay {
        position: fixed;
        inset: 0;
        z-index: 2147483647;
        background: rgba(10, 10, 15, 0.25);
        cursor: crosshair;
      }
      .hint {
        position: fixed;
        top: 16px;
        left: 50%;
        transform: translateX(-50%);
        background: #16161f;
        color: #f1f1f5;
        font: 13px/1.4 -apple-system, system-ui, sans-serif;
        padding: 8px 14px;
        border-radius: 8px;
        border: 1px solid #2c2c3a;
        box-shadow: 0 4px 16px rgba(0,0,0,.4);
      }
      .rect {
        position: fixed;
        border: 2px solid #6366f1;
        background: rgba(99, 102, 241, 0.18);
        box-shadow: 0 0 0 9999px rgba(10, 10, 15, 0.25);
        display: none;
      }
      .rect.done {
        border-color: #22c55e;
        background: rgba(34, 197, 94, 0.15);
      }
    `;

    const overlay = document.createElement("div");
    overlay.className = "overlay";
    const hint = document.createElement("div");
    hint.className = "hint";
    hint.textContent = "Arrastra para dibujar la zona · Esc para cancelar";
    const rectEl = document.createElement("div");
    rectEl.className = "rect";

    shadow.appendChild(style);
    shadow.appendChild(overlay);
    overlay.appendChild(hint);
    overlay.appendChild(rectEl);

    selection = {
      host,
      overlay,
      rectEl,
      dragging: false,
      startClientX: 0,
      startClientY: 0,
    };

    overlay.addEventListener("mousedown", onMouseDown);
    overlay.addEventListener("mousemove", onMouseMove);
    overlay.addEventListener("mouseup", onMouseUp);
    document.addEventListener("keydown", onKeyDown, true);
  }

  function onMouseDown(e) {
    if (!selection || e.button !== 0) return;
    e.preventDefault();
    selection.dragging = true;
    selection.startClientX = e.clientX;
    selection.startClientY = e.clientY;
    updateRect(e.clientX, e.clientY);
    selection.rectEl.style.display = "block";
  }

  function onMouseMove(e) {
    if (!selection || !selection.dragging) return;
    updateRect(e.clientX, e.clientY);
  }

  function onMouseUp(e) {
    if (!selection || !selection.dragging) return;
    selection.dragging = false;

    let left = Math.min(selection.startClientX, e.clientX);
    let top = Math.min(selection.startClientY, e.clientY);
    let width = Math.abs(e.clientX - selection.startClientX);
    let height = Math.abs(e.clientY - selection.startClientY);

    // Si el usuario apenas hizo click sin arrastrar, generamos una zona
    // mínima centrada en ese punto para no perder la acción.
    const MIN_SIZE = 16;
    if (width < MIN_SIZE || height < MIN_SIZE) {
      const cx = left + width / 2;
      const cy = top + height / 2;
      width = Math.max(width, MIN_SIZE);
      height = Math.max(height, MIN_SIZE);
      left = cx - width / 2;
      top = cy - height / 2;
    }

    // Convertimos a coordenadas de página (independientes del scroll actual)
    const zone = {
      x: left + window.scrollX,
      y: top + window.scrollY,
      width,
      height,
    };

    selection.rectEl.classList.add("done");

    chrome.runtime.sendMessage({
      type: "ZONE_SELECTED",
      zone,
      url: location.href,
      title: document.title,
    });

    // Mostrar brevemente el resultado final y luego limpiar.
    setTimeout(cleanupSelection, 500);
  }

  function updateRect(clientX, clientY) {
    const left = Math.min(selection.startClientX, clientX);
    const top = Math.min(selection.startClientY, clientY);
    const width = Math.abs(clientX - selection.startClientX);
    const height = Math.abs(clientY - selection.startClientY);
    Object.assign(selection.rectEl.style, {
      left: `${left}px`,
      top: `${top}px`,
      width: `${width}px`,
      height: `${height}px`,
    });
  }

  function onKeyDown(e) {
    if (!selection) return;
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      chrome.runtime.sendMessage({ type: "ZONE_SELECTION_CANCELLED" });
      cleanupSelection();
    }
  }

  function cleanupSelection() {
    if (!selection) return;
    selection.overlay.removeEventListener("mousedown", onMouseDown);
    selection.overlay.removeEventListener("mousemove", onMouseMove);
    selection.overlay.removeEventListener("mouseup", onMouseUp);
    document.removeEventListener("keydown", onKeyDown, true);
    selection.host.remove();
    selection = null;
  }

  // ---------------------------------------------------------------------
  // Ejecución de acciones
  // ---------------------------------------------------------------------

  function locateTarget(zone) {
    const centerPageX = zone.x + zone.width / 2;
    const centerPageY = zone.y + zone.height / 2;

    const viewLeft = window.scrollX;
    const viewTop = window.scrollY;
    const viewRight = viewLeft + window.innerWidth;
    const viewBottom = viewTop + window.innerHeight;

    if (
      centerPageX < viewLeft ||
      centerPageX > viewRight ||
      centerPageY < viewTop ||
      centerPageY > viewBottom
    ) {
      window.scrollTo({
        left: Math.max(0, centerPageX - window.innerWidth / 2),
        top: Math.max(0, centerPageY - window.innerHeight / 2),
        behavior: "instant",
      });
    }

    const clientX = centerPageX - window.scrollX;
    const clientY = centerPageY - window.scrollY;
    const el = document.elementFromPoint(clientX, clientY);
    return { el, clientX, clientY };
  }

  function dispatchMouse(el, type, clientX, clientY, buttons) {
    el.dispatchEvent(
      new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        composed: true,
        view: window,
        clientX,
        clientY,
        button: 0,
        buttons,
      })
    );
  }

  function findFocusable(el) {
    let node = el;
    while (node && node !== document.body) {
      const tag = node.tagName;
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        tag === "BUTTON" ||
        (tag === "A" && node.hasAttribute("href")) ||
        node.hasAttribute("tabindex") ||
        node.isContentEditable
      ) {
        return node;
      }
      node = node.parentElement;
    }
    return null;
  }

  function dispatchKey(target, type, { code, key, location, keyCode }) {
    target.dispatchEvent(
      new KeyboardEvent(type, {
        bubbles: true,
        cancelable: true,
        composed: true,
        key,
        code,
        location,
        keyCode,
        which: keyCode,
      })
    );
  }

  async function doClick(zone) {
    const { el, clientX, clientY } = locateTarget(zone);
    if (!el) throw new Error("No se encontró ningún elemento en la zona seleccionada.");
    dispatchMouse(el, "mousedown", clientX, clientY, 1);
    dispatchMouse(el, "mouseup", clientX, clientY, 0);
    dispatchMouse(el, "click", clientX, clientY, 0);
  }

  function doHoldClick(zone) {
    return new Promise((resolve, reject) => {
      const { el, clientX, clientY } = locateTarget(zone);
      if (!el) {
        reject(new Error("No se encontró ningún elemento en la zona seleccionada."));
        return;
      }
      dispatchMouse(el, "mousedown", clientX, clientY, 1);
      holdState = { el, clientX, clientY, resolve };
      holdState.timeoutId = setTimeout(() => finishHold(), 3000);
    });
  }

  function finishHold() {
    if (!holdState) return;
    const { el, clientX, clientY, resolve, timeoutId } = holdState;
    clearTimeout(timeoutId);
    dispatchMouse(el, "mouseup", clientX, clientY, 0);
    dispatchMouse(el, "click", clientX, clientY, 0);
    holdState = null;
    resolve();
  }

  function cancelHold() {
    if (!holdState) return;
    const { el, clientX, clientY, resolve, timeoutId } = holdState;
    clearTimeout(timeoutId);
    // Se soltó antes de tiempo: liberamos el botón pero no completamos el click.
    dispatchMouse(el, "mouseup", clientX, clientY, 0);
    holdState = null;
    resolve();
  }

  async function doKey(zone, spec) {
    const { el } = locateTarget(zone);
    const target = (el && findFocusable(el)) || document.activeElement || document.body;
    if (target && typeof target.focus === "function") {
      try {
        target.focus({ preventScroll: true });
      } catch (e) {
        /* algunos elementos no son enfocables, se ignora */
      }
    }
    dispatchKey(target, "keydown", spec);
    dispatchKey(target, "keyup", spec);
  }

  const ACTIONS = {
    click: doClick,
    holdClick: doHoldClick,
    space: (zone) => doKey(zone, { code: "Space", key: " ", location: 0, keyCode: 32 }),
    enter: (zone) => doKey(zone, { code: "Enter", key: "Enter", location: 0, keyCode: 13 }),
    numpadEnter: (zone) =>
      doKey(zone, { code: "NumpadEnter", key: "Enter", location: 3, keyCode: 13 }),
  };

  async function performAction(action, zone) {
    const fn = ACTIONS[action];
    if (!fn) throw new Error("Acción desconocida: " + action);
    if (!zone) throw new Error("No hay zona configurada.");
    await fn(zone);
  }

  // ---------------------------------------------------------------------
  // Mensajería
  // ---------------------------------------------------------------------

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg?.type === "START_ZONE_SELECTION") {
      startZoneSelection();
      sendResponse({ ok: true });
      return;
    }
    if (msg?.type === "DO_ACTION") {
      performAction(msg.action, msg.zone)
        .then(() => sendResponse({ ok: true }))
        .catch((err) => sendResponse({ ok: false, error: err.message }));
      return true; // respuesta asíncrona
    }
    if (msg?.type === "CANCEL_ACTION") {
      cancelHold();
      sendResponse({ ok: true });
      return;
    }
  });
})();
