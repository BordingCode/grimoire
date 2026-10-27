/* Grimoire — encryption for the sign-in cloud backup (adapted from Lull).
   The name and password never leave the phone. From them we derive:
     user  – a fingerprint of the name, so the server can find the account
     auth  – proof of the password (the server only keeps a salted hash of it)
     key   – the AES key that locks the backup; the server never sees it
   So the server only ever stores scrambled bytes. The flip side: a forgotten
   password can't be reset — nobody else holds the key. */
"use strict";

const VAULT = (() => {
  const enc = new TextEncoder(), dec = new TextDecoder();
  const ITERATIONS = 600000; // PBKDF2-SHA256: slows down password guessing (~1s on a phone)
  const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  const unhex = (h) => new Uint8Array(h.match(/../g).map((x) => parseInt(x, 16)));
  const sha256 = (s) => crypto.subtle.digest("SHA-256", enc.encode(s));
  function b64(bytes) { let s = ""; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s); }
  const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const aesKey = (keyHex) => crypto.subtle.importKey("raw", unhex(keyHex), "AES-GCM", false, ["encrypt", "decrypt"]);
  async function pipe(bytes, stream) { return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer()); }

  const normName = (name) => String(name || "").trim().toLowerCase();

  /* name + password -> { user, auth, keyHex }. Slow on purpose. */
  async function deriveAccount(name, password) {
    const n = normName(name);
    const salt = await sha256("grimoire-account-v1|" + n);
    const base = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
    const master = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: ITERATIONS }, base, 256);
    const hkdf = await crypto.subtle.importKey("raw", master, "HKDF", false, ["deriveBits"]);
    const part = (info) => crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info: enc.encode(info) }, hkdf, 256);
    return { user: hex(await sha256("grimoire-user-v1|" + n)), auth: hex(await part("grimoire-auth-v1")), keyHex: hex(await part("grimoire-enc-v1")) };
  }

  /* object -> "1.<iv>.<ciphertext>" (JSON, gzipped, then AES-GCM locked to this account) */
  async function seal(obj, keyHex, user) {
    const packed = await pipe(enc.encode(JSON.stringify(obj)), new CompressionStream("gzip"));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: enc.encode(user) }, await aesKey(keyHex), packed);
    return `1.${b64(iv)}.${b64(new Uint8Array(ct))}`;
  }
  /* The reverse of seal. Throws if the key is wrong or the data was tampered with. */
  async function open(blob, keyHex, user) {
    const [v, iv, ct] = String(blob).split(".");
    if (v !== "1") throw new Error("Unknown backup format");
    const packed = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(iv), additionalData: enc.encode(user) }, await aesKey(keyHex), unb64(ct));
    return JSON.parse(dec.decode(await pipe(new Uint8Array(packed), new DecompressionStream("gzip"))));
  }

  return { normName, deriveAccount, seal, open };
})();
window.VAULT = VAULT;
