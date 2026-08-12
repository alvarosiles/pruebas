#!/usr/bin/env node
// _cdp_loader.js
// Uso: node _cdp_loader.js <puerto> <rutaExtension> [urlAAbrir]
//
// Se conecta al Chrome DevTools Protocol (--remote-debugging-port) y llama
// a "Extensions.loadUnpacked", el método oficial (no inventado) que Chrome/
// Chromium expone desde 2024 justamente para automatizar lo que antes hacía
// --load-extension. Se prefiere este camino porque versiones recientes de
// Chromium pueden ignorar --load-extension si el perfil no tiene Developer
// mode ya activado; Extensions.loadUnpacked no tiene esa restricción, ya
// que llegar hasta acá (por el puerto de depuración) ya es en sí mismo una
// señal de automatización confiable.
//
// No usa "ws" ni ninguna librería externa: implementa a mano el handshake y
// el framing mínimo de WebSocket (RFC 6455) necesarios para mandar un
// comando y leer su respuesta.

"use strict";

const http = require("http");
const crypto = require("crypto");

const [, , portArg, extPathArg, urlArg] = process.argv;
if (!portArg || !extPathArg) {
  console.error("Uso: node _cdp_loader.js <puerto> <rutaExtension> [urlAAbrir]");
  process.exit(1);
}
const PORT = Number(portArg);
const EXT_PATH = extPathArg;
const URL_TO_OPEN = urlArg || null;

function httpJson(path) {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: "127.0.0.1", port: PORT, path }, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve(data);
        }
      });
    });
    req.on("error", reject);
  });
}

async function waitForDebugger(maxAttempts = 40, delayMs = 250) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const info = await httpJson("/json/version");
      if (info && info.webSocketDebuggerUrl) return info;
    } catch (e) {
      // el navegador todavía no levantó el puerto, reintentamos
    }
    await new Promise((r) => setTimeout(r, delayMs));
  }
  throw new Error(
    `No se pudo conectar a http://127.0.0.1:${PORT} (¿Brave abrió con --remote-debugging-port=${PORT}?)`
  );
}

// ---------------------------------------------------------------------
// Cliente WebSocket mínimo (handshake + framing RFC 6455), sin deps.
// ---------------------------------------------------------------------

function wsConnect(wsUrl) {
  return new Promise((resolve, reject) => {
    const u = new URL(wsUrl);
    const key = crypto.randomBytes(16).toString("base64");
    const req = http.request({
      host: u.hostname,
      port: u.port,
      path: u.pathname + u.search,
      headers: {
        Connection: "Upgrade",
        Upgrade: "websocket",
        "Sec-WebSocket-Key": key,
        "Sec-WebSocket-Version": "13",
      },
    });
    req.on("upgrade", (res, socket) => resolve(socket));
    req.on("error", reject);
    req.end();
  });
}

function encodeFrame(obj) {
  const payload = Buffer.from(JSON.stringify(obj), "utf8");
  const maskKey = crypto.randomBytes(4);
  const masked = Buffer.alloc(payload.length);
  for (let i = 0; i < payload.length; i++) {
    masked[i] = payload[i] ^ maskKey[i % 4];
  }

  let header;
  if (payload.length < 126) {
    header = Buffer.from([0x81, 0x80 | payload.length]);
  } else if (payload.length < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 0x80 | 126;
    header.writeUInt16BE(payload.length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 0x80 | 127;
    header.writeBigUInt64BE(BigInt(payload.length), 2);
  }
  return Buffer.concat([header, maskKey, masked]);
}

// Frames del servidor al cliente llegan sin máscara. Soporta mensajes
// fragmentados (FIN=0 + continuación) por robustez, aunque para nuestros
// comandos puntuales casi nunca hace falta.
function makeFrameReader(onMessage) {
  let buf = Buffer.alloc(0);
  let fragments = [];
  return function onData(chunk) {
    buf = Buffer.concat([buf, chunk]);
    for (;;) {
      if (buf.length < 2) return;
      const fin = (buf[0] & 0x80) !== 0;
      const opcode = buf[0] & 0x0f;
      let len = buf[1] & 0x7f;
      let offset = 2;
      if (len === 126) {
        if (buf.length < 4) return;
        len = buf.readUInt16BE(2);
        offset = 4;
      } else if (len === 127) {
        if (buf.length < 10) return;
        len = Number(buf.readBigUInt64BE(2));
        offset = 10;
      }
      if (buf.length < offset + len) return; // frame incompleto, esperar más datos
      const payload = buf.subarray(offset, offset + len);
      buf = buf.subarray(offset + len);

      if (opcode === 0x8) return; // close frame
      if (opcode === 0x1 || opcode === 0x0) {
        fragments.push(Buffer.from(payload));
        if (fin) {
          const full = Buffer.concat(fragments).toString("utf8");
          fragments = [];
          onMessage(full);
        }
      }
      // ping/pong (0x9/0xA): no hacen falta para este uso puntual
    }
  };
}

function cdpCommand(socket, id, method, params) {
  return new Promise((resolve, reject) => {
    const reader = makeFrameReader((text) => {
      let msg;
      try {
        msg = JSON.parse(text);
      } catch (e) {
        return;
      }
      if (msg.id === id) {
        socket.removeListener("data", reader);
        clearTimeout(timer);
        if (msg.error) reject(new Error(msg.error.message || JSON.stringify(msg.error)));
        else resolve(msg.result);
      }
    });
    socket.on("data", reader);
    const timer = setTimeout(() => {
      socket.removeListener("data", reader);
      reject(new Error(`Timeout esperando respuesta de "${method}"`));
    }, 15000);
    socket.write(encodeFrame({ id, method, params }));
  });
}

async function main() {
  console.log("Esperando a que Brave abra el puerto de depuración...");
  const info = await waitForDebugger();

  console.log("Conectando por DevTools Protocol...");
  const socket = await wsConnect(info.webSocketDebuggerUrl);

  console.log(`Cargando extensión descomprimida: ${EXT_PATH}`);
  const result = await cdpCommand(socket, 1, "Extensions.loadUnpacked", { path: EXT_PATH });
  console.log(`Extensión cargada. ID: ${(result && result.id) || "(desconocido)"}`);

  if (URL_TO_OPEN) {
    await httpJson(`/json/new?${URL_TO_OPEN}`);
    console.log(`Pestaña abierta: ${URL_TO_OPEN}`);
  }

  socket.end();
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Error:", err.message);
    process.exit(1);
  });
