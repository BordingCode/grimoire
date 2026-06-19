/* Grimoire — generic helpers: DOM, formatting, dice, modal/toast, path get/set.
   No app state here; pure utilities shared by views.js, app.js and link.js. */
"use strict";

const DMG_KEY = "grimoire.dmg.v1"; // remembers damage dice you typed per spell

/* ---------- tiny helpers ---------- */
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
function mdToHtml(s) {
  let t = esc(s);
  t = t.replace(/\*\*\*(.+?)\*\*\*/g, "<strong>$1</strong>").replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  return t.replace(/\n\n/g, "</p><p>").replace(/\n/g, "<br>");
}
function sign(n) { return (n >= 0 ? "+" : "") + n; }
// Official-source look-up: D&D Beyond search (just a link — no scraping/bundling of their text).
function ddbSearchUrl(name) { return "https://www.dndbeyond.com/search?q=" + encodeURIComponent(name || ""); }
// stable id for a look-up-index (non-bundled) spell, from its name
function idxId(name) { return "idx-" + String(name).toLowerCase().replace(/[^a-z0-9]+/g, "-"); }
function dmgMemory() { try { return JSON.parse(localStorage.getItem(DMG_KEY)) || {}; } catch { return {}; } }
function setDmgMemory(id, expr) { const m = dmgMemory(); m[id] = expr; localStorage.setItem(DMG_KEY, JSON.stringify(m)); }

/* ---------- dice ---------- */
function rollDice(expr) {
  // supports e.g. "2d6+3", "d20", "8d6", with +/- modifiers
  const m = String(expr).replace(/\s/g, "").match(/^(\d*)d(\d+)([+-]\d+)?$/i);
  if (!m) return null;
  const n = parseInt(m[1] || "1", 10), faces = parseInt(m[2], 10), mod = parseInt(m[3] || "0", 10);
  const rolls = Array.from({ length: n }, () => 1 + Math.floor(Math.random() * faces));
  return { total: rolls.reduce((a, b) => a + b, 0) + mod, rolls, mod, expr };
}
function d20(mod, mode = "normal") {
  const a = 1 + Math.floor(Math.random() * 20), b = 1 + Math.floor(Math.random() * 20);
  let nat = a;
  if (mode === "adv") nat = Math.max(a, b);
  if (mode === "dis") nat = Math.min(a, b);
  return { nat, a, b, mode, total: nat + mod, mod, crit: nat === 20, fumble: nat === 1 };
}

/* ---------- toast / modal ---------- */
function toast(html, ms = 2600) {
  let t = $("#toast"); if (!t) { t = document.createElement("div"); t.id = "toast"; document.body.appendChild(t); }
  t.innerHTML = html; t.className = "show";
  clearTimeout(toast._t); toast._t = setTimeout(() => (t.className = ""), ms);
}
function modal(title, bodyHtml, onMount) {
  closeModal();
  const wrap = document.createElement("div");
  wrap.id = "modal"; wrap.className = "modal-back";
  wrap.innerHTML = `<div class="modal" role="dialog"><div class="modal-head"><h2>${esc(title)}</h2><button class="x" data-act="closeModal">✕</button></div><div class="modal-body">${bodyHtml}</div></div>`;
  wrap.addEventListener("click", (e) => { if (e.target === wrap) closeModal(); });
  document.body.appendChild(wrap);
  if (onMount) onMount(wrap);
}
function closeModal() { const m = $("#modal"); if (m) m.remove(); }

/* ---------- object path get/set (used by data-bind & link sync) ---------- */
function setPath(obj, path, val) { const k = path.split("."); let o = obj; for (let i = 0; i < k.length - 1; i++) o = o[k[i]]; o[k[k.length - 1]] = val; }
function getPath(obj, path) { return path.split(".").reduce((o, k) => (o == null ? o : o[k]), obj); }
