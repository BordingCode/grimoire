/* Grimoire — generic helpers: DOM, formatting, dice, modal/toast, path get/set.
   No app state here; pure utilities shared by views.js, app.js and link.js. */
"use strict";

/* ---------- tiny helpers ---------- */
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
function mdToHtml(s) {
  let t = esc(s);
  t = t.replace(/\*\*\*(.+?)\*\*\*/g, "<strong>$1</strong>").replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  return t.replace(/\n\n/g, "</p><p>").replace(/\n/g, "<br>");
}
function sign(n) { return (n >= 0 ? "+" : "") + n; }
// Look-up links: community D&D 5e Wikidot pages (just links — no scraping/bundling).
// Slug = lowercase name, apostrophes dropped, every other run of non-alphanumerics → "-".
function wikidotSlug(name) { return (name || "").toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""); }
function wikidotSpellUrl(name) { return "https://dnd5e.wikidot.com/spell:" + wikidotSlug(name); }
function wikidotFeatUrl(name) { return "https://dnd5e.wikidot.com/feat:" + wikidotSlug(name); }
function wikidotItemUrl(name) { return "https://dnd5e.wikidot.com/wondrous-items:" + wikidotSlug(name); } // all magic items (incl. rings/weapons) live under this prefix
// stable id for a look-up-index (non-bundled) spell, from its name
function idxId(name) { return "idx-" + String(name).toLowerCase().replace(/[^a-z0-9]+/g, "-"); }

/* ---------- toast / modal ---------- */
function toast(html, ms = 2600) {
  let t = $("#toast"); if (!t) { t = document.createElement("div"); t.id = "toast"; document.body.appendChild(t); }
  t.innerHTML = html; t.className = "show";
  clearTimeout(toast._t); toast._t = setTimeout(() => (t.className = ""), ms);
}
// Freeze the page behind a modal so focusing an input (keyboard popping up) can't
// scroll the sheet underneath; the exact scroll position is restored on close.
let _scrollLockY = null;
function lockScroll() {
  if (_scrollLockY != null) return;
  _scrollLockY = window.scrollY || window.pageYOffset || 0;
  const b = document.body.style;
  b.position = "fixed"; b.top = `-${_scrollLockY}px`; b.left = "0"; b.right = "0"; b.width = "100%";
}
function unlockScroll() {
  if (_scrollLockY == null) return;
  const y = _scrollLockY; _scrollLockY = null;
  const b = document.body.style;
  b.position = ""; b.top = ""; b.left = ""; b.right = ""; b.width = "";
  window.scrollTo(0, y);
}
function modal(title, bodyHtml, onMount) {
  closeModal(); // unlocks; we re-lock below (swapping modals keeps the same frozen position)
  const wrap = document.createElement("div");
  wrap.id = "modal"; wrap.className = "modal-back";
  wrap.innerHTML = `<div class="modal" role="dialog"><div class="modal-head"><h2>${esc(title)}</h2><button class="x" data-act="closeModal">✕</button></div><div class="modal-body">${bodyHtml}</div></div>`;
  wrap.addEventListener("click", (e) => { if (e.target === wrap) closeModal(); });
  document.body.appendChild(wrap);
  lockScroll();
  if (onMount) onMount(wrap);
}
function closeModal() { const m = $("#modal"); if (m) { m.remove(); unlockScroll(); } }

/* ---------- object path get/set (used by data-bind & link sync) ---------- */
function setPath(obj, path, val) { const k = path.split("."); let o = obj; for (let i = 0; i < k.length - 1; i++) o = o[k[i]]; o[k[k.length - 1]] = val; }
function getPath(obj, path) { return path.split(".").reduce((o, k) => (o == null ? o : o[k]), obj); }
