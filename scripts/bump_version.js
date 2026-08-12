#!/usr/bin/env node
// bump_version.js
// Sube la versión en manifest.json (equivalente a "npm version <bump>" para
// una extensión que no tiene package.json). Chrome exige que "version" sea
// como máximo 4 números separados por puntos, sin sufijos (nada de "-beta").
//
// Uso: node scripts/bump_version.js <patch|minor|major>

"use strict";

const fs = require("fs");
const path = require("path");

const bump = process.argv[2];
if (!["patch", "minor", "major"].includes(bump)) {
  console.error("Uso: node scripts/bump_version.js <patch|minor|major>");
  process.exit(1);
}

const manifestPath = path.join(__dirname, "..", "manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

const parts = String(manifest.version || "0.0.0")
  .split(".")
  .map((n) => parseInt(n, 10) || 0);
while (parts.length < 3) parts.push(0);
let [major, minor, patch] = parts;

if (bump === "major") {
  major += 1;
  minor = 0;
  patch = 0;
} else if (bump === "minor") {
  minor += 1;
  patch = 0;
} else {
  patch += 1;
}

manifest.version = `${major}.${minor}.${patch}`;
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");

console.log(manifest.version);
