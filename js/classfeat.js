/* Grimoire — class features & trackers checklist.
   Shown after a level-up (what's new at this level, pre-ticked) and any time from the
   character menu (everything up to your current levels, nothing ticked). Nothing is ever
   changed without a tick: trackers that differ from the book (homebrew) are shown for
   reference only, and can be saved as a house rule ("6 × Paladin level") so later
   level-ups suggest your table's number instead of the book's.
   Feature text: SRD 5.1 / 5.2 (CC-BY-4.0), built by tools/build_class_features.py. */
"use strict";

const CLASSFEAT = {};
async function loadClassFeatures(ed) {
  if (!CLASSFEAT[ed]) CLASSFEAT[ed] = await fetch(`data/features-${ed}.json?v=90`).then((r) => r.json()).catch(() => null);
  return CLASSFEAT[ed] || {};
}

const normTrk = (s) => String(s || "").toLowerCase().replace(/\(.*?\)/g, "").replace(/[^a-z]+/g, " ").trim();
const classLevelOf = (ch, cls) => (Calc.classList(ch).find((c) => c.cls === cls) || {}).level || 0;
const abilityMods = (ch) => Object.fromEntries(RULES.ABILITIES.map((a) => [a, Calc.abilityMod(ch, a)]));
function trackerBook(t, lvl, mods) {
  return { max: t.max(lvl, mods), reset: typeof t.reset === "function" ? t.reset(lvl) : t.reset, regain: t.regain || 0, note: t.note ? t.note(lvl) : "" };
}
// a house rule: max = mult × (class level) + add
function ruleMax(ch, rule) { return Math.max(1, Math.round((+rule.mult || 0) * classLevelOf(ch, rule.cls) + (+rule.add || 0))); }
function findTracker(ch, t) {
  const rs = ch.resources || [];
  return rs.find((r) => r.auto === t.key) || rs.find((r) => !r.auto && (normTrk(r.name) === normTrk(t.name) || (t.key === "druid.wildshape" && r.wildshape)));
}
function subclassHas(ch, s) {
  if (!ch.subclass) return false;
  const n = ch.edition === "2024" ? (RULES.SUBCLASS_2024[ch.subclass] || ch.subclass) : ch.subclass;
  return n === s || n.startsWith(s + " ") || n.startsWith(s + "(");
}
// "long" | "short" | "long1" (long rest, one use back on a short rest) <-> resetOn + regain
const resetKey = (reset, regain) => (reset === "long" && regain ? "long1" : reset);
const resetLabel = (reset, regain) => (reset === "short" ? "short rest" : regain ? `long rest (+${regain} on short)` : "long rest");
const resetSelect = (cls, key) => `<select class="${cls}">
  <option value="long"${key === "long" ? " selected" : ""}>Long rest</option>
  <option value="short"${key === "short" ? " selected" : ""}>Short rest</option>
  <option value="long1"${key === "long1" ? " selected" : ""}>Long rest, 1 back on short</option></select>`;
const isPool = (r) => !!r.pool || r.max >= 10; // big point pools spend several at once (Lay on Hands, Ki…)
const mdPlain = (s) => String(s || "").replace(/\*\*(.+?)\*\*/g, "$1").replace(/\*(.+?)\*/g, "$1");

/* ranges: [{ cls, prev, to }] — prev = class level before the level-up (0 = from scratch).
   mode "levelup" pre-ticks what's new; "anytime" ticks nothing. */
function checklistRows(ch, ranges, mode, feats) {
  const ed = ch.edition === "2024" ? "2024" : "2014";
  const mods = abilityMods(ch);
  const trackers = [], features = [];
  for (const g of ranges) {
    for (const t of RULES.CLASS_TRACKERS[ed]) {
      if (t.cls !== g.cls || t.from > g.to) continue;
      const book = trackerBook(t, g.to, mods);
      const ex = findTracker(ch, t);
      if (ex && ex.rule) {
        const max = ruleMax(ch, ex.rule);
        if (ex.max !== max) trackers.push({ t, ex, kind: "rule", tick: true, max, key: resetKey(ex.resetOn, ex.regain), book });
      } else if (ex) {
        const same = (b) => b && ex.max === b.max && ex.resetOn === b.reset && (ex.regain || 0) === b.regain;
        if (same(book)) continue;
        const prev = g.prev >= t.from ? trackerBook(t, g.prev, mods) : null;
        const sync = mode === "levelup" && same(prev);
        trackers.push({ t, ex, kind: sync ? "update" : "differs", tick: sync, max: book.max, key: resetKey(book.reset, book.regain), book });
      } else {
        trackers.push({ t, kind: "new", tick: mode === "levelup" && t.from > g.prev, max: book.max, key: resetKey(book.reset, book.regain), book });
      }
    }
    // homebrew trackers that grow with this class (house rules with no book entry)
    for (const ex of ch.resources || []) {
      if (!ex.rule || ex.rule.cls !== g.cls || trackers.some((x) => x.ex === ex)) continue;
      const max = ruleMax(ch, ex.rule);
      if (ex.max !== max) trackers.push({ t: { name: ex.name, cls: g.cls, key: ex.auto }, ex, kind: "rule", tick: true, max, key: resetKey(ex.resetOn, ex.regain), book: null });
    }
    const have = new Set((ch.features || []).map((f) => f.src || normTrk(f.name)));
    for (const f of (feats[g.cls] || [])) {
      if (f.l <= g.prev && mode === "levelup") continue;
      if (f.l > g.to || (f.s && !subclassHas(ch, f.s))) continue;
      const src = `srd${ed}:${g.cls}:${f.n}`;
      if (have.has(src) || have.has(normTrk(f.n))) continue;
      features.push({ f, cls: g.cls, src, tick: mode === "levelup" });
    }
  }
  return { trackers, features };
}

function checklistHtml(ch, rows, hasData) {
  const T = rows.trackers.map((r, i) => {
    const yours = r.ex ? `${r.ex.max} · ${resetLabel(r.ex.resetOn, r.ex.regain)}` : "";
    const bookTxt = r.book ? `${r.book.max} · ${resetLabel(r.book.reset, r.book.regain)}` : "";
    const tag = { new: "new", update: "update", rule: "house rule", differs: "yours differs" }[r.kind];
    const sub = r.kind === "new" ? `Book: ${bookTxt}${r.book.note ? ` — ${esc(r.book.note)}` : ""}`
      : r.kind === "update" ? `${yours} → ${bookTxt}`
      : r.kind === "rule" ? `Your rule: ${r.ex.rule.mult} × ${esc(r.ex.rule.cls)} level${r.ex.rule.add ? ` ${sign(+r.ex.rule.add)}` : ""} → <b>${r.max}</b>${r.book ? ` (book: ${r.book.max})` : ""}`
      : `Book: <b>${bookTxt}</b> — yours: <b>${yours}</b>. Left alone unless you tick it.`;
    const lvl = classLevelOf(ch, r.t.cls);
    const guess = r.ex && lvl ? Math.round(r.ex.max / lvl) : 0;
    const ruleLine = r.kind === "differs" && r.ex.max !== r.book.max && guess && guess * lvl === r.ex.max
      ? `<label class="cl-rule"><input type="checkbox" class="cl-keep"> Keep mine as a house rule: <input type="number" class="cl-mult" value="${guess}" min="0"> × ${esc(r.t.cls)} level</label>` : "";
    return `<div class="cl-row" data-tr="${i}">
      <label class="cl-chk"><input type="checkbox" class="cl-on" ${r.tick ? "checked" : ""}><span><b>${esc(r.t.name)}</b> <em class="cl-tag k-${r.kind}">${tag}</em></span></label>
      <div class="cl-sub muted small">${sub}</div>
      <div class="cl-edit"><label>Max <input type="number" class="cl-max" min="1" value="${r.max}"></label>${resetSelect("cl-reset", r.key)}</div>
      ${ruleLine}
    </div>`;
  }).join("");
  const F = rows.features.map((r, i) => `<div class="cl-row" data-ft="${i}">
      <label class="cl-chk"><input type="checkbox" class="cl-on" ${r.tick ? "checked" : ""}><span><b>${esc(r.f.n)}</b> <em class="cl-tag">${esc(r.cls)} ${r.f.l}${r.f.s ? " · " + esc(r.f.s) : ""}</em></span></label>
      <details class="cl-desc"><summary>Read</summary><div class="feat-desc">${esc(mdPlain(r.f.d))}</div></details>
    </div>`).join("");
  return `
    ${T ? `<h3 class="sec">Trackers</h3><div class="cl-list">${T}</div>` : ""}
    ${hasData ? (F ? `<h3 class="sec">Class features</h3><div class="cl-list">${F}</div>` : `<p class="muted small">No new class features to add.</p>`)
      : `<p class="muted small">No free rules text for this class — add its features yourself below.</p>`}
    <h3 class="sec">Your own (homebrew)</h3>
    <div id="cl-own" class="cl-list"></div>
    <div class="cl-own-btns"><button class="mini" data-act="clOwnFeat">+ feature</button><button class="mini" data-act="clOwnTrk">+ tracker</button></div>`;
}

// keep the max box in step with a ticked "keep as house rule" line
function checklistWire(wrap, ch) {
  wrap.addEventListener("input", (e) => {
    const row = e.target.closest(".cl-row"); if (!row) return;
    const keep = row.querySelector(".cl-keep"), mult = row.querySelector(".cl-mult");
    if (keep && keep.checked && (e.target === keep || e.target === mult)) {
      const r = actions._cl.rows.trackers[+row.dataset.tr];
      row.querySelector(".cl-max").value = Math.max(1, (+mult.value || 0) * classLevelOf(ch, r.t.cls));
      row.querySelector(".cl-on").checked = true;
    }
    const grow = row.querySelector(".own-grow");
    if (grow) { row.querySelector(".own-rule").hidden = !grow.checked; row.querySelector(".cl-edit label").hidden = grow.checked; }
  });
}

actions.clOwnFeat = () => {
  const d = document.createElement("div"); d.className = "cl-row own"; d.dataset.own = "feat";
  d.innerHTML = `<div class="own-head"><b>Feature</b><button class="del" data-act="clOwnDel">✕</button></div>
    <input class="own-name" placeholder="Name"><textarea class="own-desc" rows="2" placeholder="What it does"></textarea>`;
  $("#cl-own").appendChild(d); d.querySelector("input").focus();
};
actions.clOwnTrk = () => {
  const ch = Store.active();
  const d = document.createElement("div"); d.className = "cl-row own"; d.dataset.own = "trk";
  d.innerHTML = `<div class="own-head"><b>Tracker</b><button class="del" data-act="clOwnDel">✕</button></div>
    <input class="own-name" placeholder="Name, e.g. Blood Points">
    <div class="cl-edit"><label>Max <input type="number" class="cl-max" min="1" value="1"></label>${resetSelect("cl-reset", "long")}</div>
    <label class="cl-rule"><input type="checkbox" class="own-grow"> Grows with level (house rule)</label>
    <div class="own-rule cl-rule" hidden>Max = <input type="number" class="cl-mult" value="1" min="0"> × <select class="own-cls">${Calc.classList(ch).map((c) => `<option>${esc(c.cls)}</option>`).join("")}</select> level</div>`;
  $("#cl-own").appendChild(d); d.querySelector("input").focus();
};
actions.clOwnDel = (el) => el.closest(".cl-row").remove();

function applyChecklist() {
  const ch = Store.active(); const st = actions._cl; if (!ch || !st) return 0;
  if (!ch.resources) ch.resources = [];
  if (!ch.features) ch.features = [];
  let n = 0;
  const readReset = (row) => { const k = row.querySelector(".cl-reset").value; return { resetOn: k === "short" ? "short" : "long", regain: k === "long1" ? 1 : 0 }; };
  document.querySelectorAll("#modal .cl-row[data-tr]").forEach((row) => {
    const r = st.rows.trackers[+row.dataset.tr];
    const keep = row.querySelector(".cl-keep");
    if (keep && keep.checked) { r.ex.rule = { mult: +row.querySelector(".cl-mult").value || 0, cls: r.t.cls }; r.ex.auto = r.t.key; n++; }
    if (!row.querySelector(".cl-on").checked) return;
    const max = Math.max(1, +row.querySelector(".cl-max").value || 1);
    const rs = readReset(row);
    if (r.ex) { Object.assign(r.ex, { max, ...rs, auto: r.t.key }); if (r.t.pool) r.ex.pool = true; r.ex.used = Math.min(r.ex.used || 0, max); }
    else ch.resources.push({ id: Gx.uid(), name: r.t.name, max, used: 0, ...rs, note: r.book.note || "", auto: r.t.key, ...(r.t.pool ? { pool: true } : {}), ...(r.t.key === "druid.wildshape" ? { wildshape: true } : {}) });
    n++;
  });
  document.querySelectorAll("#modal .cl-row[data-ft]").forEach((row) => {
    if (!row.querySelector(".cl-on").checked) return;
    const r = st.rows.features[+row.dataset.ft];
    ch.features.push({ id: Gx.uid(), name: r.f.n, desc: mdPlain(r.f.d), bonuses: [], adv: [], src: r.src }); n++;
  });
  document.querySelectorAll("#modal .cl-row[data-own]").forEach((row) => {
    const name = row.querySelector(".own-name").value.trim(); if (!name) return;
    if (row.dataset.own === "feat") ch.features.push({ id: Gx.uid(), name, desc: row.querySelector(".own-desc").value.trim(), bonuses: [], adv: [] });
    else {
      const t = { id: Gx.uid(), name, max: Math.max(1, +row.querySelector(".cl-max").value || 1), used: 0, ...readReset(row), note: "" };
      if (row.querySelector(".own-grow").checked) { t.rule = { mult: +row.querySelector(".cl-mult").value || 0, cls: row.querySelector(".own-cls").value }; t.max = ruleMax(ch, t.rule); }
      ch.resources.push(t);
    }
    n++;
  });
  actions._cl = null;
  commit(); if (window.LINK) LINK.schedulePush(ch);
  return n;
}

/* the checklist on its own: everything up to your current class levels */
actions.classChecklist = async () => {
  const ch = Store.active();
  const feats = await loadClassFeatures(ch.edition === "2024" ? "2024" : "2014");
  const ranges = Calc.classList(ch).map((c) => ({ cls: c.cls, prev: 0, to: c.level }));
  const rows = checklistRows(ch, ranges, "anytime", feats);
  actions._cl = { rows };
  modal("Class features & trackers", `
    <p class="muted small">Everything your classes get up to now (${ch.edition} rules). Tick what you want on your sheet — nothing changes unless it's ticked, so your homebrew stays as it is.</p>
    ${checklistHtml(ch, rows, ranges.some((g) => feats[g.cls]))}
    <div class="modal-btns"><button class="btn" data-act="closeModal">Cancel</button><button class="btn primary" data-act="clSave">Add ticked</button></div>`,
    (wrap) => checklistWire(wrap, ch));
};
actions.clSave = () => { const n = applyChecklist(); closeModal(); render(); toast(n ? `Added/updated ${n} thing${n === 1 ? "" : "s"}.` : "Nothing ticked — no changes."); };

/* one-time data fixes, run at boot and after a restore */
function fixupChars() {
  let changed = false;
  for (const ch of Store.characters) {
    if (ch._fx1) continue;
    // Channel Divinity recharges on a short rest in 2014 (it was often entered as long)
    if (ch.edition !== "2024") (ch.resources || []).forEach((r) => { if (normTrk(r.name).startsWith("channel divinity") && r.resetOn === "long") r.resetOn = "short"; });
    ch._fx1 = 1; changed = true;
  }
  if (changed) Store.save();
}
