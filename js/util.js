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
// Official-source look-up: D&D Beyond search (just a link — no scraping/bundling of their text).
function ddbSearchUrl(name) { return "https://www.dndbeyond.com/search?q=" + encodeURIComponent(name || ""); }
// stable id for a look-up-index (non-bundled) spell, from its name
function idxId(name) { return "idx-" + String(name).toLowerCase().replace(/[^a-z0-9]+/g, "-"); }

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
