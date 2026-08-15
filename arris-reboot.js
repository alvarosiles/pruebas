// Reinicio automatizado del router Arris replicando su protocolo de login cifrado (RSA + RC4).
// Uso: node arris-reboot.js [--dry-run]
const crypto = require("crypto");

const HOST = "192.168.60.1";
const USER = "admin";
const PASS = "alvaro";
const SESSION_KEY = "1234567890123456"; // clave fija que usa el propio JS del router
const REBOOT_OID = "1.3.6.1.4.1.4115.1.20.1.1.5.4.0";
const DRY_RUN = process.argv.includes("--dry-run");

function rc4(keyStr, inputBuf) {
  const key = Buffer.from(keyStr, "binary");
  const s = new Uint8Array(256);
  for (let i = 0; i < 256; i++) s[i] = i;
  let j = 0;
  for (let i = 0; i < 256; i++) {
    j = (j + s[i] + key[i % key.length]) % 256;
    [s[i], s[j]] = [s[j], s[i]];
  }
  let i = 0; j = 0;
  const out = Buffer.alloc(inputBuf.length);
  for (let y = 0; y < inputBuf.length; y++) {
    i = (i + 1) % 256;
    j = (j + s[i]) % 256;
    [s[i], s[j]] = [s[j], s[i]];
    out[y] = inputBuf[y] ^ s[(s[i] + s[j]) % 256];
  }
  return out;
}

function encrypt(plainStr) {
  const enc = rc4(SESSION_KEY, Buffer.from(plainStr, "binary"));
  return enc.toString("base64");
}

function decrypt(b64Str) {
  const raw = Buffer.from(b64Str, "base64");
  return rc4(SESSION_KEY, raw).toString("binary");
}

async function req(path, cookies) {
  const res = await fetch(`http://${HOST}/${path}`, {
    headers: cookies ? { Cookie: cookies } : {},
  });
  const setCookie = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  const text = await res.text();
  return { status: res.status, text, setCookie };
}

function mergeCookies(existing, setCookieArr) {
  const jar = new Map();
  for (const part of existing ? existing.split(";") : []) {
    const [k, v] = part.trim().split("=");
    if (k) jar.set(k, v);
  }
  for (const c of setCookieArr) {
    const [kv] = c.split(";");
    const [k, v] = kv.split("=");
    if (k) jar.set(k.trim(), v);
  }
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

function hexToBuf(hex) {
  return Buffer.from(hex, "hex");
}

function buildRsaPublicKey(nHex, eHex) {
  const n = hexToBuf(nHex);
  const e = hexToBuf(eHex.length % 2 ? "0" + eHex : eHex);
  const jwk = {
    kty: "RSA",
    n: n.toString("base64url"),
    e: e.toString("base64url"),
  };
  return crypto.createPublicKey({ key: jwk, format: "jwk" });
}

async function main() {
  console.log("1) Pidiendo clave pública RSA del router...");
  let r = await req("factory/getPublicKey");
  let cookies = mergeCookies("", r.setCookie);
  const [nHex, eHex] = r.text.trim().split(":");
  if (!nHex || !eHex) throw new Error("No pude leer la clave pública: " + r.text);
  console.log("   OK, modulo de", nHex.length * 4, "bits");

  console.log("2) Enviando clave de sesión cifrada con RSA (setCipher)...");
  const pubKey = buildRsaPublicKey(nHex, eHex);
  const cipherBuf = crypto.publicEncrypt(
    { key: pubKey, padding: crypto.constants.RSA_PKCS1_PADDING },
    Buffer.from(SESSION_KEY, "binary")
  );
  const cipherB64 = cipherBuf.toString("base64");
  r = await req(`factory/setCipher?arg=${cipherB64}`, cookies);
  cookies = mergeCookies(cookies, r.setCookie);
  console.log("   status:", r.status);

  console.log("3) Login con usuario/clave cifrados (RC4)...");
  const up = Buffer.from(`${encodeURIComponent(USER)}:${encodeURIComponent(PASS)}`, "binary").toString("base64");
  const loginArg = encrypt(up);
  r = await req(`login?arg=${loginArg}`, cookies);
  cookies = mergeCookies(cookies, r.setCookie);
  const loginResultDecrypted = decrypt(r.text);
  if (loginResultDecrypted.includes("DefPSK") || !r.text || r.text.length < 4) {
    console.log("   Respuesta cruda:", r.text);
    throw new Error("Login falló o requiere clave WiFi por defecto. Revisa usuario/clave.");
  }
  cookies = mergeCookies(cookies, [`credential=${loginResultDecrypted}`]);
  console.log("   Login OK. Cookie de credencial obtenida.");

  console.log("4) Enviando comando de reinicio (SNMP set sobre OID de reboot)...");
  const setBody = `${REBOOT_OID}=${encodeURIComponent("1")};2;`;
  const setArg = encrypt(setBody);
  if (DRY_RUN) {
    console.log("   [--dry-run] NO se envía el reinicio de verdad. URL que se llamaría:");
    console.log(`   http://${HOST}/snmpSet?oid=${setArg}`);
    return;
  }
  r = await req(`snmpSet?oid=${setArg}`, cookies);
  console.log("   status:", r.status, "body:", r.text);
  console.log("Listo. Si todo salió bien, el Arris debería estar reiniciando ahora.");
}

main().catch((err) => {
  console.error("ERROR:", err.message);
  process.exit(1);
});
