#!/usr/bin/env node
// package.js
// Empaqueta la extensión en un .zip listo para subir al Chrome Web Store
// (equivalente a "vsce package" para VS Code). No usa ninguna dependencia:
// el escritor de ZIP (CRC-32 + DEFLATE vía el zlib nativo de Node) está
// hecho a mano, así el script funciona igual en Linux, macOS y Windows sin
// depender de que el binario "zip" del sistema esté instalado.
//
// Solo incluye la lista explícita de archivos que manifest.json realmente
// referencia (nada de scripts/, .git, README, dist/, perfiles de prueba,
// etc.) para no colar accidentalmente algo que no debería ir al paquete.

"use strict";

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const rootDir = path.join(__dirname, "..");
const distDir = path.join(rootDir, "dist");

const FILES = [
  "manifest.json",
  "background.js",
  "content.js",
  "popup.html",
  "popup.css",
  "popup.js",
  "icons/icon16.png",
  "icons/icon48.png",
  "icons/icon128.png",
];

// ---------------------------------------------------------------------
// CRC-32 (tabla estándar, polinomio 0xEDB88320)
// ---------------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// ---------------------------------------------------------------------
// Escritor de ZIP mínimo (un método de compresión: DEFLATE)
// ---------------------------------------------------------------------

function toDosTime(date) {
  return (
    ((date.getHours() & 0x1f) << 11) |
    ((date.getMinutes() & 0x3f) << 5) |
    ((date.getSeconds() >> 1) & 0x1f)
  );
}

function toDosDate(date) {
  return (
    (((date.getFullYear() - 1980) & 0x7f) << 9) |
    (((date.getMonth() + 1) & 0xf) << 5) |
    (date.getDate() & 0x1f)
  );
}

function buildZip(entries) {
  const now = new Date();
  const dosTime = toDosTime(now);
  const dosDate = toDosDate(now);

  const localChunks = [];
  const centralChunks = [];
  let offset = 0;

  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, "utf8");
    const crc = crc32(data);
    const compressed = zlib.deflateRawSync(data);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4); // versión necesaria
    localHeader.writeUInt16LE(0, 6); // flags
    localHeader.writeUInt16LE(8, 8); // método: deflate
    localHeader.writeUInt16LE(dosTime, 10);
    localHeader.writeUInt16LE(dosDate, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(compressed.length, 18);
    localHeader.writeUInt32LE(data.length, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28); // extra field length

    localChunks.push(localHeader, nameBuf, compressed);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4); // versión que lo creó
    centralHeader.writeUInt16LE(20, 6); // versión necesaria
    centralHeader.writeUInt16LE(0, 8); // flags
    centralHeader.writeUInt16LE(8, 10); // método: deflate
    centralHeader.writeUInt16LE(dosTime, 12);
    centralHeader.writeUInt16LE(dosDate, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(compressed.length, 20);
    centralHeader.writeUInt32LE(data.length, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30); // extra field length
    centralHeader.writeUInt16LE(0, 32); // comment length
    centralHeader.writeUInt16LE(0, 34); // disco de inicio
    centralHeader.writeUInt16LE(0, 36); // atributos internos
    centralHeader.writeUInt32LE(0o644 << 16, 38); // atributos externos (permisos unix)
    centralHeader.writeUInt32LE(offset, 42);

    centralChunks.push(centralHeader, nameBuf);

    offset += localHeader.length + nameBuf.length + compressed.length;
  }

  const centralDirStart = offset;
  const centralDir = Buffer.concat(centralChunks);

  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4); // número de este disco
  end.writeUInt16LE(0, 6); // disco donde empieza el directorio central
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDir.length, 12);
  end.writeUInt32LE(centralDirStart, 16);
  end.writeUInt16LE(0, 20); // longitud del comentario

  return Buffer.concat([...localChunks, centralDir, end]);
}

function main() {
  const manifest = JSON.parse(fs.readFileSync(path.join(rootDir, "manifest.json"), "utf8"));

  const entries = FILES.map((relPath) => {
    const abs = path.join(rootDir, relPath);
    if (!fs.existsSync(abs)) {
      throw new Error(`Falta el archivo "${relPath}" que manifest.json necesita.`);
    }
    return { name: relPath, data: fs.readFileSync(abs) };
  });

  fs.mkdirSync(distDir, { recursive: true });
  const outFile = path.join(distDir, `auto-action-v${manifest.version}.zip`);
  fs.writeFileSync(outFile, buildZip(entries));

  const sizeKb = (fs.statSync(outFile).size / 1024).toFixed(1);
  console.log(`Empaquetado: ${path.relative(rootDir, outFile)} (${sizeKb} KB, ${entries.length} archivos)`);
}

main();
