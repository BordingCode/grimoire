/* Grimoire — behaviour layer: app state, data loading, actions, forms, wiring, boot.
   Helpers live in util.js; rendering in views.js; 5e data in rules.js; math in calc.js;
   storage in state.js; cloud linking in link.js. */
"use strict";

const Grimoire = { spells: { "2014": [], "2024": [] } };
const ui = { screen: "home", tab: "stats", reorder: false, editSlots: false, spellFilter: { q: "", level: "all", list: "available" } };

/* team kill-count tracker (local to this device, separate from characters) */
const Party = {
  KEY: "grimoire.party.v1",
  members: [],
  load() { try { this.members = JSON.parse(localStorage.getItem(this.KEY)) || []; } catch { this.members = []; } },
  save() { localStorage.setItem(this.KEY, JSON.stringify(this.members)); },
};

async function loadSpells() {
  const [a, b, idx, sl, ci] = await Promise.all([
    fetch("data/spells-2014.json?v=33").then((r) => r.json()),
    fetch("data/spells-2024.json?v=33").then((r) => r.json()),
    fetch("data/spell-index.json?v=42").then((r) => r.json()).catch(() => []),
    fetch("data/summons.json?v=47").then((r) => r.json()).catch(() => []),
    fetch("data/creature-index.json?v=44").then((r) => r.json()).catch(() => []),
  ]);
  Grimoire.summonLib = sl || [];        // bundled SRD creature stat library (full stats)
  Grimoire.creatureIndex = ci || [];    // non-SRD creature names -> greyed look-up stubs in the picker
  // The bundled SRD data is missing class tags for Paladin (and Artificer), and lists
  // only one class on many spells. Merge in the fuller class lists from the index so
  // multiclass casters (e.g. Paladin) get a correct class list.
  const idxClasses = {};
  (idx || []).forEach((s) => { idxClasses[s.name.toLowerCase()] = s.classes || []; });
  const enrich = (arr) => arr.forEach((sp) => {
    const ic = idxClasses[sp.name.toLowerCase()];
    if (ic && ic.length) sp.classes = [...new Set([...(sp.classes || []), ...ic])];
  });
  enrich(a); enrich(b);
  Grimoire.spells["2014"] = a; Grimoire.spells["2024"] = b;
  Grimoire.spellIndex = idx || [];   // factual name index powering the non-SRD stubs in "All spells"
  try { Grimoire.themes = await fetch("data/themes.json?v=46").then((r) => r.json()); } catch (e) { Grimoire.themes = null; }
}

/* persist + (optionally) re-render; schedules a link push if linked */
function commit(rerender = true) { Store.touch(); if (window.LINK) LINK.schedulePush(Store.active()); if (rerender) render(); }

/* apply dark/light mode + the active character's per-class theme (tints the whole palette).
   Off a character (home/party), inline overrides are cleared so the CSS defaults apply. */
const THEME_VARS = ["--bg", "--bg-2", "--panel", "--panel-2", "--ink", "--muted", "--line", "--gold", "--accent", "--accent-2", "--accent-soft", "--accent-faint", "--on-accent"];
function applyTheme(ch) {
  const root = document.documentElement;
  const mode = localStorage.getItem("grimoire.mode") || "dark";
  root.dataset.theme = mode;
  const t = ch && Grimoire.themes && Grimoire.themes[ch.cls] && Grimoire.themes[ch.cls][mode];
  if (!t) { THEME_VARS.forEach((v) => root.style.removeProperty(v)); return; }
  const p = { ...t };
  // the Appearance accent picker (ch.accent) still overrides just the accent pair
  if (ch.accent && RULES.ACCENTS[ch.accent]) { p.accent = RULES.ACCENTS[ch.accent][0]; p.accent2 = RULES.ACCENTS[ch.accent][1]; }
  const set = (k, v) => root.style.setProperty(k, v);
  set("--bg", p.bg); set("--bg-2", p.bg2); set("--panel", p.panel); set("--panel-2", p.panel2);
  set("--ink", p.ink); set("--muted", p.muted); set("--line", p.line); set("--gold", p.gold);
  set("--accent", p.accent); set("--accent-2", p.accent2);
  set("--accent-soft", p.accent + "2b"); set("--accent-faint", p.accent + "14");
  const c = p.accent.replace("#", "");
  const lum = (0.299 * parseInt(c.slice(0, 2), 16) + 0.587 * parseInt(c.slice(2, 4), 16) + 0.114 * parseInt(c.slice(4, 6), 16)) / 255;
  set("--on-accent", lum > 0.6 ? "#1c1430" : "#ffffff");
}
// shrink a chosen image to a small JPEG data-URL so it doesn't bloat storage
function downscaleImage(img, max = 320) {
  const s = Math.min(1, max / Math.max(img.width, img.height));
  const w = Math.round(img.width * s), h = Math.round(img.height * s);
  const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
  cv.getContext("2d").drawImage(img, 0, 0, w, h);
  return cv.toDataURL("image/jpeg", 0.82);
}

/* ===================================================================== */
/*  ACTIONS                                                              */
/* ===================================================================== */
const actions = {
  goHome() { ui.screen = "home"; render(); },
  goNew() { ui.screen = "new"; render(); },
  goParty() { ui.screen = "party"; render(); },
  async forceUpdate() {
    if (!confirm("Reload a fresh copy of the app? This clears the cached app files and reloads. Your characters are KEPT.")) return;
    try {
      if ("serviceWorker" in navigator) { const regs = await navigator.serviceWorker.getRegistrations(); await Promise.all(regs.map((r) => r.unregister())); }
      if ("caches" in window) { const keys = await caches.keys(); await Promise.all(keys.map((k) => caches.delete(k))); }
    } catch {}
    location.reload();
  },
  partyAdd() { const n = ($("#party-name").value || "").trim(); if (!n) return; Party.members.push({ id: Gx.uid(), name: n, kills: 0 }); Party.save(); render(); },
  partyKill(el) { const m = Party.members.find((x) => x.id === el.dataset.id); if (m) { m.kills++; Party.save(); render(); } },
  partyUnkill(el) { const m = Party.members.find((x) => x.id === el.dataset.id); if (m && m.kills > 0) { m.kills--; Party.save(); render(); } },
  partyRemove(el) { const m = Party.members.find((x) => x.id === el.dataset.id); confirmDelete(`Remove ${m ? m.name : "this member"} from the kill count?`, () => { Party.members = Party.members.filter((x) => x.id !== el.dataset.id); Party.save(); render(); }); },
  partyReset() { if (confirm("Reset everyone's kills to 0?")) { Party.members.forEach((m) => (m.kills = 0)); Party.save(); render(); } },
  open(el) { Store.setActive(el.dataset.id); ui.screen = "sheet"; ui.tab = "stats"; ui.spellFilter.list = defaultSpellList(Store.active()); render(); },
  tab(el) { ui.tab = el.dataset.tab; render(); },

  createChar() {
    const get = (id) => $("#" + id);
    const ch = Gx.newCharacter({
      name: get("f-name").value.trim(),
      edition: get("f-ed").value,
      cls: get("f-cls").value,
      level: parseInt(get("f-lvl").value, 10) || 1,
    });
    RULES.ABILITIES.forEach((a) => (ch.abilities[a] = parseInt(get("f-" + a).value, 10) || 10));
    // sensible starting HP: max die + con at lvl1, average after
    const die = (RULES.CLASSES[ch.cls] || {}).hitDie || 8;
    const con = Calc.abilityMod(ch, "con");
    ch.combat.hpMax = die + con + (ch.level - 1) * (Math.floor(die / 2) + 1 + con);
    ch.combat.hpCur = ch.combat.hpMax;
    Store.add(ch);
    ui.screen = "sheet"; ui.tab = "stats"; ui.spellFilter.list = defaultSpellList(Store.active()); render();
  },

  override(el) {
    const ch = Store.active(); const key = el.dataset.key;
    const cur = ch.overrides[key];
    const auto = el.dataset.auto;
    modal("Override: " + el.dataset.label, `
      <p class="muted">Auto value: <b>${esc(auto)}</b>. Leave blank to use auto.</p>
      <input id="ov-in" type="number" value="${cur ?? ""}" placeholder="auto">
      <div class="modal-btns">
        <button class="btn ghost" data-act="ovClear">Use auto</button>
        <button class="btn primary" data-act="ovSave">Save</button>
      </div>`, () => $("#ov-in").focus());
    actions._ovKey = key;
  },
  ovSave() { const ch = Store.active(); const v = $("#ov-in").value; if (v === "") delete ch.overrides[actions._ovKey]; else ch.overrides[actions._ovKey] = Number(v); closeModal(); commit(); },
  ovClear() { const ch = Store.active(); delete ch.overrides[actions._ovKey]; closeModal(); commit(); },

  toggleSave(el) { const ch = Store.active(); const a = el.dataset.ab; ch.saveProf[a] = !ch.saveProf[a]; commit(); },
  cycleSkill(el) { const ch = Store.active(); const s = el.dataset.skill; ch.skillProf[s] = ((ch.skillProf[s] || 0) + 1) % 3; commit(); },

  /* features & traits */
  addFeature() { featureForm(null); },
  featureOptions(el) { const f = (Store.active().features || []).find((x) => x.id === el.dataset.id); optionsMenu(f ? f.name : "Feature", "feature", `data-id="${el.dataset.id}"`); },
  featureEdit(el) { featureForm((Store.active().features || []).find((x) => x.id === el.dataset.id)); },
  featureDel(el) { const ch = Store.active(); ch.features = (ch.features || []).filter((x) => x.id !== el.dataset.id); closeModal(); commit(); toast("Feature deleted."); },
  featBonusAdd() { const meta = featCapture(); actions._featBonuses.push({ target: "ac", value: "" }); renderFeatureForm(meta.name, meta.desc); },
  featBonusRemove(el) { const meta = featCapture(); actions._featBonuses.splice(+el.dataset.i, 1); renderFeatureForm(meta.name, meta.desc); },
  featAdvAdd() { const meta = featCapture(); actions._featAdv.push("save.all"); renderFeatureForm(meta.name, meta.desc); },
  featAdvRemove(el) { const meta = featCapture(); actions._featAdv.splice(+el.dataset.i, 1); renderFeatureForm(meta.name, meta.desc); },
  featureSave() {
    const ch = Store.active(); const name = $("#ft-name").value.trim(); if (!name) { toast("Name required."); return; }
    featCapture();
    const bonuses = actions._featBonuses
      .filter((b) => b.target && b.value !== "" && b.value != null && !isNaN(+b.value))
      .map((b) => ({ target: b.target, value: +b.value }));
    const adv = [...new Set(actions._featAdv.filter(Boolean))];
    const desc = $("#ft-desc").value.trim();
    if (!ch.features) ch.features = [];
    const ed = actions._featEditId ? ch.features.find((x) => x.id === actions._featEditId) : null;
    if (ed) { ed.name = name; ed.desc = desc; ed.bonuses = bonuses; ed.adv = adv; } else ch.features.push({ id: Gx.uid(), name, desc, bonuses, adv });
    actions._featEditId = null; actions._featBonuses = []; actions._featAdv = []; closeModal(); commit();
  },

  /* combat */
  hp(el) { const ch = Store.active(); const d = +el.dataset.d; const c = ch.combat;
    if (d < 0 && c.hpTemp > 0) { const fromTemp = Math.min(c.hpTemp, -d); c.hpTemp -= fromTemp; const rest = -d - fromTemp; c.hpCur = Math.max(0, c.hpCur - rest); }
    else c.hpCur = Math.max(0, Math.min(Calc.maxHP(ch), c.hpCur + d));
    commit();
    if (d < 0) maybeConcentration(ch, -d);
  },
  hpDamage() { amountPrompt("Take damage", "How much damage?", (n) => applyDamage(n)); },
  hpHeal() { amountPrompt("Heal", "How much healing?", (n) => applyHeal(n)); },
  hpEdit() { const ch = Store.active(); modal("Set current HP", `<input id="hp-in" type="number" value="${ch.combat.hpCur}"><div class="modal-btns"><button class="btn primary" data-act="hpSet">Set</button></div>`, () => $("#hp-in").focus()); },
  hpSet() { const ch = Store.active(); const prev = ch.combat.hpCur; const next = Math.max(0, Math.min(Calc.maxHP(ch), +$("#hp-in").value || 0)); ch.combat.hpCur = next; closeModal(); commit(); if (next < prev) maybeConcentration(ch, prev - next); },
  death(el) { const ch = Store.active(); const t = el.dataset.t, i = +el.dataset.i; const cur = ch.combat.death[t]; ch.combat.death[t] = cur > i ? i : i + 1; commit(); },

  shortRest() { const ch = Store.active(); const p = Calc.pactMagic(ch); if (p) ch.spells.pact.used = 0; (ch.resources || []).forEach((r) => { if (r.resetOn === "short") r.used = 0; }); commit(); toast("Short rest — pact slots & short-rest resources restored. Spend hit dice to heal."); },
  spendHitDie() {
    const ch = Store.active(); const c = ch.combat;
    if (Calc.totalLevel(ch) - c.hitDiceUsed <= 0) { toast("No hit dice left."); return; }
    const dice = Object.keys(Calc.hitDicePool(ch)).map(Number).sort((a, b) => b - a);
    if (dice.length === 1) return spendHitDieManual(dice[0]);
    modal("Spend which hit die?", `<div class="modal-btns">${dice.map((d) => `<button class="btn" data-act="hitDiePick" data-die="${d}">d${d}</button>`).join("")}</div>`);
  },
  hitDiePick(el) { closeModal(); spendHitDieManual(+el.dataset.die); },
  longRest() { const ch = Store.active(); const c = ch.combat;
    c.hpCur = Calc.maxHP(ch); c.hpTemp = 0; c.death = { succ: 0, fail: 0 };
    c.hitDiceUsed = Math.max(0, c.hitDiceUsed - Math.max(1, Math.floor(Calc.totalLevel(ch) / 2)));
    for (let i = 1; i <= 9; i++) ch.spells.slots[i].used = 0;
    ch.spells.pact.used = 0;
    (ch.resources || []).forEach((r) => (r.used = 0));
    ch.spells.concentratingOn = null;
    commit(); toast("Long rest — HP, all slots, and daily resources restored.");
  },

  /* conditions */
  addCond() {
    const opts = RULES.CONDITIONS.map((c) => `<option>${c}</option>`).join("");
    modal("Add condition", `
      <label class="fld"><span>Condition</span><select id="cond-name">${opts}</select></label>
      <p id="cond-desc" class="muted small"></p>
      <label class="fld"><span>Duration (rounds, optional)</span><input id="cond-rounds" type="number" min="1" placeholder="∞"></label>
      <div class="modal-btns"><button class="btn primary" data-act="condAdd">Add</button></div>`, (wrap) => {
        const sel = wrap.querySelector("#cond-name"), desc = wrap.querySelector("#cond-desc");
        const upd = () => (desc.textContent = RULES.CONDITION_INFO[sel.value] || "");
        sel.addEventListener("change", upd); upd();
      });
  },
  condInfo(el) { const name = el.dataset.name; modal(name, `<p>${esc(RULES.CONDITION_INFO[name] || "No description.")}</p>`); },
  condAdd() { const ch = Store.active(); const r = $("#cond-rounds").value; ch.conditions.push({ name: $("#cond-name").value, rounds: r ? +r : null }); closeModal(); commit(); },
  condTick(el) { const ch = Store.active(); const i = +el.dataset.i; const c = ch.conditions[i]; if (c.rounds != null) { c.rounds -= 1; if (c.rounds <= 0) ch.conditions.splice(i, 1); } commit(); },
  condRemove(el) { const ch = Store.active(); ch.conditions.splice(+el.dataset.i, 1); commit(); },

  /* resources */
  addRes() { resForm(null); },
  resEdit(el) { const ch = Store.active(); resForm(ch.resources.find((x) => x.id === el.dataset.id)); },
  resSave() {
    const ch = Store.active(); const name = $("#res-name").value.trim(); if (!name) { toast("Name required."); return; }
    const fields = { name, max: Math.max(1, +$("#res-max").value || 1), resetOn: $("#res-reset").value, note: $("#res-note").value.trim() };
    const editing = actions._resEditId ? ch.resources.find((x) => x.id === actions._resEditId) : null;
    if (editing) { Object.assign(editing, fields); editing.used = Math.min(editing.used, editing.max); }
    else ch.resources.push({ id: Gx.uid(), used: 0, ...fields });
    actions._resEditId = null; closeModal(); commit();
  },
  resUse(el) { const ch = Store.active(); const r = ch.resources.find((x) => x.id === el.dataset.id); if (r && r.used < r.max) r.used++; commit(); },
  resRestore(el) { const ch = Store.active(); const r = ch.resources.find((x) => x.id === el.dataset.id); if (r && r.used > 0) r.used--; commit(); },
  resOptions(el) { const r = Store.active().resources.find((x) => x.id === el.dataset.id); optionsMenu(r ? r.name : "Resource", "res", `data-id="${el.dataset.id}"`); },
  resDel(el) { const ch = Store.active(); ch.resources = ch.resources.filter((x) => x.id !== el.dataset.id); closeModal(); commit(); toast("Tracker deleted."); },

  /* spells */
  spellList(el) { ui.spellFilter.list = el.dataset.list; render(); },
  spellSearch(el) { ui.spellFilter.q = el.value; const rows = $(".spell-rows"); if (rows) rows.innerHTML = spellListRowsHtml(Store.active()); },
  spellLevel(el) { ui.spellFilter.level = el.value; render(); },
  fav(el) { toggleList("favorites", el.dataset.id); },
  prep(el) { toggleList("prepared", el.dataset.id); },
  know(el) { toggleList("known", el.dataset.id); },
  slot(el) { const ch = Store.active(); const lvl = +el.dataset.lvl, k = +el.dataset.k; const s = ch.spells.slots[lvl]; s.used = (k < s.used) ? k : k + 1; commit(); },
  toggleEditSlots() { ui.editSlots = !ui.editSlots; render(); },
  slotInc(el) { const ch = Store.active(); const i = +el.dataset.lvl; ch.overrides["slotMax." + i] = Math.min(20, Calc.spellSlots(ch)[i].max + 1); commit(); },
  slotDec(el) { const ch = Store.active(); const i = +el.dataset.lvl; ch.overrides["slotMax." + i] = Math.max(0, Calc.spellSlots(ch)[i].max - 1); commit(); },
  slotReset(el) { const ch = Store.active(); delete ch.overrides["slotMax." + el.dataset.lvl]; commit(); },
  pactSlot(el) { const ch = Store.active(); const k = +el.dataset.k; ch.spells.pact.used = (k < ch.spells.pact.used) ? k : k + 1; commit(); },

  spellDetail(el) { const id = el.dataset.id; if (id.startsWith("idx-")) return openStub(id); openSpell(Store.active(), id); },

  addCustom() {
    modal("Hand-add a spell", `
      <label class="fld"><span>Name *</span><input id="cs-name"></label>
      <div class="grid2">
        <label class="fld"><span>Level</span><select id="cs-level">${Array.from({length:10},(_,i)=>`<option value="${i}">${i===0?"Cantrip":i}</option>`).join("")}</select></label>
        <label class="fld"><span>School</span><input id="cs-school" placeholder="Evocation"></label>
      </div>
      <div class="grid2">
        <label class="fld"><span>Casting time</span><input id="cs-ct" placeholder="action"></label>
        <label class="fld"><span>Range</span><input id="cs-range" placeholder="60 feet"></label>
      </div>
      <div class="grid2">
        <label class="fld"><span>Duration</span><input id="cs-dur" placeholder="Instantaneous"></label>
        <label class="fld"><span>Components</span><input id="cs-comp" placeholder="V, S, M"></label>
      </div>
      <label class="chk"><input type="checkbox" id="cs-conc"> Concentration</label>
      <label class="fld"><span>Description</span><textarea id="cs-desc" rows="4"></textarea></label>
      <label class="fld"><span>Source (where it's from)</span><input id="cs-source" placeholder="e.g. Xanathar's, or homebrew doc"></label>
      <p class="muted small">Got the full text? <a href="#" data-act="pasteSpells">Paste it instead ↧</a> and it’ll be parsed for you.</p>
      <div class="modal-btns"><button class="btn primary" data-act="customSave">Add spell</button></div>`, () => $("#cs-name").focus());
  },
  customSave() {
    const ch = Store.active(); const name = $("#cs-name").value.trim(); if (!name) { toast("Name required."); return; }
    const comp = $("#cs-comp").value.toUpperCase();
    const sp = {
      id: "hb-" + Gx.uid(), name, level: +$("#cs-level").value, school: $("#cs-school").value.trim(),
      casting_time: $("#cs-ct").value.trim(), range: $("#cs-range").value.trim(), duration: $("#cs-dur").value.trim(),
      components: { v: comp.includes("V"), s: comp.includes("S"), m: comp.includes("M") }, material: "",
      classes: [ch.cls], concentration: $("#cs-conc").checked, ritual: false, save: null, attack: false,
      desc: $("#cs-desc").value.trim(), higher_level: "", edition: ch.edition,
      custom: true, sourceNote: $("#cs-source").value.trim(), source: "Homebrew",
    };
    ch.customSpells.push(sp); ch.spells.known.push(sp.id); closeModal(); commit(); toast("Spell added & marked known.");
  },

  /* Paste-and-parse: YOU copy spell text from a source you own (book/PDF/your D&D
     Beyond page) and paste it; we parse it into local spells. Nothing is fetched or
     published — it only lives on this device, same as hand-add. */
  pasteSpells() {
    modal("Paste spells", `
      <p class="muted small">Copy one or more spells from a source you own (your book, PDF, or your D&amp;D Beyond page) and paste below. Include the “<i>3rd-level Evocation</i>” / “<i>Evocation cantrip</i>” line so each spell is recognised. Saved only on this phone — never uploaded.</p>
      <label class="fld"><span>Pasted text</span><textarea id="ps-text" rows="10" placeholder="Fireball\n3rd-level Evocation\nCasting Time: 1 action\nRange: 150 feet\nComponents: V, S, M (a tiny ball of bat guano and sulfur)\nDuration: Instantaneous\nA bright streak flashes from your pointing finger…\nAt Higher Levels. When you cast this spell using a slot of 4th level or higher…"></textarea></label>
      <div class="modal-btns"><button class="btn" data-act="closeModal">Cancel</button><button class="btn primary" data-act="pasteImport">Import</button></div>`,
      () => $("#ps-text").focus());
  },
  pasteImport() {
    const ch = Store.active();
    const text = $("#ps-text").value;
    const parsed = parseSpellsText(text, ch.edition, ch.cls);
    if (!parsed.length) { toast("Couldn't find a spell. Include the level/school line, e.g. “3rd-level Evocation”."); return; }
    const existing = new Set((ch.customSpells || []).map((s) => s.name.toLowerCase()));
    let added = 0, skipped = 0;
    for (const sp of parsed) {
      if (existing.has(sp.name.toLowerCase())) { skipped++; continue; }
      ch.customSpells.push(sp); ch.spells.known.push(sp.id); existing.add(sp.name.toLowerCase()); added++;
    }
    closeModal(); commit();
    toast(`Imported ${added} spell${added === 1 ? "" : "s"}${skipped ? ` (${skipped} already added)` : ""}, marked known.`);
  },

  /* gear */
  addItem() { itemForm(null, "inventory"); },
  addBagItem() { itemForm(null, "bag"); },
  itemOptions(el) {
    const list = el.dataset.list || "inventory"; const id = el.dataset.id;
    const it = (Store.active()[list] || []).find((x) => x.id === id);
    const other = list === "inventory" ? "Bag of Holding" : "carried";
    const da = `data-id="${id}" data-list="${list}"`;
    modal(it ? it.name : "Item", `<div class="menu-list">
      <button class="btn ghost" data-act="itemEdit" ${da}>Edit</button>
      <button class="btn ghost" data-act="itemMove" ${da}>Move to ${other}</button>
      <button class="btn danger" data-act="itemDel" ${da}>Delete</button>
    </div>`);
  },
  itemEdit(el) { const list = el.dataset.list || "inventory"; itemForm((Store.active()[list] || []).find((x) => x.id === el.dataset.id), list); },
  itemMove(el) {
    const ch = Store.active(); const from = el.dataset.list || "inventory"; const to = from === "inventory" ? "bag" : "inventory";
    const i = (ch[from] || []).findIndex((x) => x.id === el.dataset.id); if (i < 0) return;
    const [it] = ch[from].splice(i, 1); if (to === "bag") it.equipped = false;
    (ch[to] = ch[to] || []).push(it); closeModal(); commit(); toast(`Moved to ${to === "bag" ? "Bag of Holding" : "carried"}.`);
  },
  itemBonusAdd() { const m = itemCapture(); actions._itemBonuses.push({ target: "ac", value: "" }); renderItemForm(m); },
  itemBonusRemove(el) { const m = itemCapture(); actions._itemBonuses.splice(+el.dataset.i, 1); renderItemForm(m); },
  itemAdvAdd() { const m = itemCapture(); actions._itemAdv.push("save.all"); renderItemForm(m); },
  itemAdvRemove(el) { const m = itemCapture(); actions._itemAdv.splice(+el.dataset.i, 1); renderItemForm(m); },
  itemSave() {
    const ch = Store.active(); const cap = itemCapture(); const name = (cap.name || "").trim(); if (!name) { toast("Name required."); return; }
    const list = actions._itemList || "inventory";
    const bonuses = actions._itemBonuses
      .filter((b) => b.target && b.value !== "" && b.value != null && !isNaN(+b.value))
      .map((b) => ({ target: b.target, value: +b.value }));
    const adv = [...new Set(actions._itemAdv.filter(Boolean))];
    const data = { name, qty: +cap.qty || 1, equipped: !!cap.equipped, bonuses, adv };
    if (!ch[list]) ch[list] = [];
    const ed = actions._itemEditId ? ch[list].find((x) => x.id === actions._itemEditId) : null;
    if (ed) Object.assign(ed, data); else ch[list].push({ id: Gx.uid(), notes: "", acBonus: 0, ...data });
    actions._itemEditId = null; actions._itemBonuses = []; actions._itemAdv = []; actions._itemList = null; closeModal(); commit();
  },
  equip(el) { const ch = Store.active(); const list = el.dataset.list || "inventory"; const it = (ch[list] || []).find((x) => x.id === el.dataset.id); if (it) { it.equipped = !it.equipped; commit(); } },
  itemDel(el) { const ch = Store.active(); const list = el.dataset.list || "inventory"; ch[list] = (ch[list] || []).filter((x) => x.id !== el.dataset.id); closeModal(); commit(); toast("Item deleted."); },

  /* weapons & attacks */
  addWeapon() { weaponForm(null); },
  weaponOpen(el) {
    const ch = Store.active(); const i = +el.dataset.i; const w = ch.weapons[i];
    const wAtkBon = Calc.featBonus(ch, "weaponAttack"), wDmgBon = Calc.featBonus(ch, "weaponDamage");
    const atk = (w.atk !== "" && w.atk != null) ? +w.atk + wAtkBon : null;
    modal(w.name, `
      <p class="muted small">${w.damage ? esc(w.damage) + (wDmgBon ? " " + sign(wDmgBon) : "") + (w.damageType ? " " + esc(w.damageType) : "") + " damage" : "no damage set"}${w.notes ? " · " + esc(w.notes) : ""}${(wAtkBon || wDmgBon) ? ` <span class="feat-incl">(incl. features)</span>` : ""}</p>
      <div class="cast-box">
        <div class="cast-info">
          ${atk != null ? `<span class="cast-pill">Attack ${sign(atk)}</span>` : '<span class="muted small">no to-hit set</span>'}
          ${w.damage ? `<span class="cast-pill">Damage ${esc(w.damage)}${wDmgBon ? " " + sign(wDmgBon) : ""}${w.damageType ? " " + esc(w.damageType) : ""}</span>` : ""}
        </div>
        <div class="wpn-opts-row"><button class="opt-btn" data-act="weaponOptions" data-i="${i}">⋯ Edit / Delete</button></div>
      </div>`);
  },
  weaponOptions(el) { const w = Store.active().weapons[+el.dataset.i]; optionsMenu(w ? w.name : "Weapon", "weapon", `data-i="${el.dataset.i}"`); },
  weaponEdit(el) { weaponForm(Store.active().weapons[+el.dataset.i], +el.dataset.i); },
  weaponDel(el) { const ch = Store.active(); ch.weapons.splice(+el.dataset.i, 1); closeModal(); commit(); toast("Weapon deleted."); },
  weaponSave() {
    const ch = Store.active(); const name = $("#wp-name").value.trim(); if (!name) { toast("Name required."); return; }
    const data = { name, atk: $("#wp-atk").value.trim(), damage: $("#wp-dmg").value.trim(), damageType: $("#wp-type").value.trim(), notes: $("#wp-notes").value.trim() };
    if (actions._wpnEditIdx != null && ch.weapons[actions._wpnEditIdx]) Object.assign(ch.weapons[actions._wpnEditIdx], data);
    else { if (!ch.weapons) ch.weapons = []; ch.weapons.push({ id: Gx.uid(), ...data }); }
    actions._wpnEditIdx = null; closeModal(); commit();
  },

  /* concentration */
  dropConc() { const ch = Store.active(); ch.spells.concentratingOn = null; commit(); },

  /* char menu */
  charMenu() {
    const ch = Store.active();
    modal(ch.name, `
      <div class="menu-list">
        <button class="btn ghost" data-act="charPhoto">Character photo</button>
        <button class="btn ghost" data-act="appearance">Appearance (theme)</button>
        <button class="btn ghost" data-act="levelUp">Level up</button>
        <button class="btn ghost" data-act="manageClasses">Classes &amp; levels</button>
        <button class="btn ghost" data-act="linkOpen">${ch.link ? "Linked — manage sharing" : "Link with another player"}</button>
        <button class="btn ghost" data-act="partyOpen">Party — transfer items${ch.party ? " (joined)" : ""}</button>
        <button class="btn ghost" data-act="exportChar">Export character (backup / share)</button>
        <button class="btn ghost" data-act="renameChar">Rename</button>
        <button class="btn danger" data-act="deleteChar">Delete character</button>
      </div>`);
  },
  async exportChar() {
    const ch = Store.active();
    const out = JSON.parse(JSON.stringify(ch));
    try { out._media = window.Media ? await Media.forChar(ch.id) : []; } catch (e) { out._media = []; }
    Gx.exportCharacter(out); closeModal();
    toast(`Exported${out._media && out._media.length ? ` with ${out._media.length} session picture${out._media.length === 1 ? "" : "s"}` : ""}. Keep it as a backup or send it to share.`);
  },
  renameChar() { const ch = Store.active(); modal("Rename", `<input id="rn" value="${esc(ch.name)}"><div class="modal-btns"><button class="btn primary" data-act="renameSave">Save</button></div>`, () => $("#rn").focus()); },
  renameSave() { const ch = Store.active(); ch.name = $("#rn").value.trim() || ch.name; closeModal(); commit(); },
  manageClasses() {
    const ch = Store.active();
    const list = Calc.classList(ch);
    const taken = list.map((c) => c.cls);
    const rows = list.map((c, i) => `
      <div class="cls-row">
        <span class="cls-name">${esc(c.cls)}${i === 0 ? ' <em>primary</em>' : ""}</span>
        <input type="number" min="1" max="20" value="${c.level}" data-act="clsLevel" data-i="${i}" class="cls-lvl">
        ${i > 0 ? `<button class="del" data-act="clsRemove" data-i="${i}">✕</button>` : '<span class="del-spacer"></span>'}
      </div>`).join("");
    const avail = Object.keys(RULES.CLASSES).filter((c) => !taken.includes(c));
    const subOpts = [];
    list.forEach((c) => { const m = RULES.SUBCLASSES[c.cls]; if (m) Object.keys(m).forEach((sc) => subOpts.push({ name: sc, spells: !!m[sc] })); });
    modal("Classes & levels", `
      <p class="muted small">Total level ${Calc.totalLevel(ch)}. Proficiency bonus & spell slots combine across classes; saving-throw proficiencies come from your <b>first</b> class only. Set HP yourself on the Combat tab after changing classes.</p>
      <div class="cls-list">${rows}</div>
      ${subOpts.length ? `<h3 class="sec">Subclass</h3>
      <select id="mc-sub" data-act="subSelect">
        <option value="">— none —</option>
        ${subOpts.map((sc) => `<option value="${esc(sc.name)}" ${ch.subclass === sc.name ? "selected" : ""}>${esc(sc.name)}${sc.spells ? " ✦" : ""}</option>`).join("")}
      </select>
      <p class="muted small">✦ = spells auto-fill (SRD subclasses). For any other subclass the name is recorded — add its spells from the spellbook's “All” tab.</p>` : ""}
      ${avail.length ? `<h3 class="sec">Add a class</h3>` : ""}
      ${avail.length ? `
      <div class="cls-add">
        <select id="mc-cls">${avail.map((c) => `<option>${c}</option>`).join("")}</select>
        <input id="mc-lvl" type="number" min="1" max="20" value="1">
        <button class="btn" data-act="clsAdd">Add</button>
      </div>` : ""}`);
  },
  clsAdd() { const ch = Store.active(); const cls = $("#mc-cls").value; const lvl = Math.max(1, Math.min(20, +$("#mc-lvl").value || 1)); if (!cls) return; if (!ch.multiclass) ch.multiclass = []; ch.multiclass.push({ cls, level: lvl }); commit(); if (window.LINK) LINK.schedulePush(ch); actions.manageClasses(); },
  clsRemove(el) { const ch = Store.active(); ch.multiclass.splice(+el.dataset.i - 1, 1); commit(); if (window.LINK) LINK.schedulePush(ch); actions.manageClasses(); },

  /* ---- Level-up helper: pick a class, choose HP, apply, then show what changed ---- */
  levelUp() {
    const ch = Store.active();
    const list = Calc.classList(ch);
    const opts = list.map((c, i) => {
      const die = (RULES.CLASSES[c.cls] || {}).hitDie || 8;
      return `<option value="${i}">${esc(c.cls)} ${c.level} → ${c.level + 1} (d${die})</option>`;
    }).join("");
    const con = Calc.abilityMod(ch, "con");
    modal("Level up", `
      <p class="muted small">Total level ${Calc.totalLevel(ch)}. Choose which class gains a level.</p>
      <label class="fld"><span>Class</span><select id="lvl-cls">${opts}</select></label>
      <label class="fld"><span>HP rolled on the hit die</span><input id="lvl-hp-roll" type="number" min="1" inputmode="numeric" placeholder="leave blank for average"></label>
      <p class="muted small">Roll your class's hit die and enter it (blank = average). CON ${sign(con)} is added, min 1 HP.</p>
      <div class="modal-btns"><button class="btn" data-act="closeModal">Cancel</button><button class="btn primary" data-act="levelApply">Level up</button></div>`);
  },
  levelApply() {
    const ch = Store.active();
    const idx = +$("#lvl-cls").value || 0;
    const hpInput = $("#lvl-hp-roll").value;
    const list = Calc.classList(ch);
    const target = list[idx];
    if (!target) { closeModal(); return; }
    if (target.level >= 20) { toast("That class is already level 20."); return; }

    // snapshot BEFORE so we can show the diff
    const before = { prof: Calc.prof(ch), slots: Calc.spellSlots(ch), pact: Calc.pactMagic(ch) };

    // apply the level to the right place (primary class or a multiclass entry)
    if (idx === 0) ch.level += 1;
    else { const m = (ch.multiclass || [])[idx - 1]; if (m) m.level += 1; }
    const newClsLevel = idx === 0 ? ch.level : ch.multiclass[idx - 1].level;

    // hit points
    const die = (RULES.CLASSES[target.cls] || {}).hitDie || 8;
    const con = Calc.abilityMod(ch, "con");
    const manual = hpInput !== "" && +hpInput > 0;
    const rolled = manual ? +hpInput : Math.floor(die / 2) + 1;
    const gain = Math.max(1, rolled + con);
    ch.combat.hpMax = (ch.combat.hpMax || 0) + gain;
    ch.combat.hpCur = Math.min(Calc.maxHP(ch), (ch.combat.hpCur || 0) + gain);

    commit(); if (window.LINK) LINK.schedulePush(ch);

    // build the "what changed" summary
    const after = { prof: Calc.prof(ch), slots: Calc.spellSlots(ch), pact: Calc.pactMagic(ch) };
    const lines = [];
    const hpHow = manual ? `rolled ${rolled}` : `average ${rolled}`;
    lines.push(`<b>+${gain} HP</b> (${hpHow} ${sign(con)} CON) — max HP now ${Calc.maxHP(ch)}.`);
    if (after.prof > before.prof) lines.push(`<b>Proficiency bonus</b> rises to ${sign(after.prof)}.`);
    const slotGains = [];
    for (let i = 1; i <= 9; i++) { const d = after.slots[i].max - before.slots[i].max; if (d > 0) slotGains.push(`${d}× level-${i}`); }
    if (slotGains.length) lines.push(`<b>New spell slots:</b> ${slotGains.join(", ")}.`);
    if (after.pact && (!before.pact || after.pact.max > before.pact.max || after.pact.level > before.pact.level))
      lines.push(`<b>Pact magic:</b> ${after.pact.max} slot${after.pact.max === 1 ? "" : "s"} at level ${after.pact.level}.`);

    const ASI = { Fighter: [4, 6, 8, 12, 14, 16, 19], Rogue: [4, 8, 10, 12, 16, 19] };
    const asiLevels = ASI[target.cls] || [4, 8, 12, 16, 19];
    if (asiLevels.includes(newClsLevel)) lines.push(`<b>Ability Score Improvement / feat</b> available — edit your abilities or add a feature.`);

    const reminders = [`Check the <b>${esc(target.cls)}</b> class for new features at level ${newClsLevel} and add them under Features & traits.`];
    if (Calc.isCaster(ch)) reminders.push(`Review your spellbook — newly available spell levels can now be learned/prepared.`);

    modal("Leveled up", `
      <p>${esc(target.cls)} is now <b>level ${newClsLevel}</b> (total ${Calc.totalLevel(ch)}).</p>
      <ul class="lvl-sum">${lines.map((l) => `<li>${l}</li>`).join("")}</ul>
      <h3 class="sec">Don't forget</h3>
      <ul class="lvl-sum muted">${reminders.map((r) => `<li>${r}</li>`).join("")}</ul>
      <div class="modal-btns"><button class="btn primary" data-act="closeModal">Done</button></div>`,
      () => render());
  },
  async deleteChar() { const ch = Store.active(); if (confirm(`Delete ${ch.name}? This can't be undone (export first to keep a copy).`)) { if (window.Media) { try { for (const m of await Media.forChar(ch.id)) { try { await Media.del(m.id); } catch (e) {} } } catch (e) {} } Store.remove(ch.id); closeModal(); ui.screen = "home"; render(); } },

  importFile() { const inp = document.createElement("input"); inp.type = "file"; inp.accept = "application/json,.json"; inp.onchange = () => { const f = inp.files[0]; if (!f) return; const r = new FileReader(); r.onload = async () => { try { await importCharacter(JSON.parse(r.result)); ui.screen = "sheet"; ui.tab = "stats"; ui.spellFilter.list = defaultSpellList(Store.active()); render(); const f = importCharacter.lastMediaFailed || 0; toast(f ? `Imported, but ${f} picture${f === 1 ? "" : "s"} couldn't be saved (storage full).` : "Character imported."); } catch (e) { toast("Couldn't read that file."); } }; r.readAsText(f); }; inp.click(); },

  closeModal() { closeModal(); },
};

/* ---------- shared action helpers ---------- */
function toggleList(list, id) { const ch = Store.active(); const arr = ch.spells[list]; const i = arr.indexOf(id); if (i >= 0) arr.splice(i, 1); else arr.push(id); commit(); }
function spendHitDieManual(die) {
  const ch = Store.active(); const con = Calc.abilityMod(ch, "con");
  amountPrompt(`Spend a d${die}`, `You rolled the d${die} — enter it (CON ${sign(con)} is added)`, (n) => {
    const c = Store.active().combat; const heal = Math.max(1, (n || 0) + con);
    c.hitDiceUsed++; c.hpCur = Math.min(Calc.maxHP(Store.active()), c.hpCur + heal); commit();
    toast(`Spent d${die}: healed ${heal} (${n || 0} ${sign(con)} CON).`);
  });
}

/* Parse pasted spell text → spell objects. Tolerant of D&D Beyond / PHB / 2024
   layouts. A spell is anchored by its level/school line ("3rd-level Evocation",
   "Level 3 Evocation", or "Evocation cantrip"); the line above it is the name. */
function parseSpellsText(text, edition, defaultClass) {
  const LEVELED = /^(?:(\d+)(?:st|nd|rd|th)[\s-]*level|level\s+(\d+))\s+([a-zA-Z]+)/i;
  const CANTRIP = /^([a-zA-Z]+)\s+cantrip\b/i;
  const isHeader = (l) => LEVELED.test(l) || CANTRIP.test(l);
  const isMeta = (l) => l === "" || /^source\s*:/i.test(l);
  const lines = text.replace(/\r/g, "").split("\n").map((l) => l.trim());
  const heads = [];
  for (let i = 0; i < lines.length; i++) if (isHeader(lines[i])) heads.push(i);
  if (!heads.length) return [];
  const nameIdx = heads.map((h) => { let j = h - 1; while (j >= 0 && isMeta(lines[j])) j--; return j; });
  const out = [];
  for (let k = 0; k < heads.length; k++) {
    const h = heads[k], ni = nameIdx[k];
    const name = ni >= 0 ? lines[ni].replace(/\s*\([^)]*\)\s*$/, "").trim() : "";
    if (!name) continue;
    const end = (k + 1 < heads.length) ? nameIdx[k + 1] : lines.length;
    const lm = lines[h].match(LEVELED), cm = lines[h].match(CANTRIP);
    const level = lm ? +(lm[1] || lm[2]) : 0;
    const school = lm ? lm[3] : (cm ? cm[1] : "");
    let ct = "", range = "", comp = "", dur = "", material = "";
    const descLines = [];
    for (let i = h + 1; i < end; i++) {
      const l = lines[i]; let m;
      if (l === "") { if (descLines.length) descLines.push(""); continue; }
      if (m = l.match(/^casting time\s*[:.]?\s*(.+)/i)) ct = m[1];
      else if (m = l.match(/^range(?:\/area)?\s*[:.]?\s*(.+)/i)) range = m[1];
      else if (m = l.match(/^components?\s*[:.]?\s*(.+)/i)) { comp = m[1]; const pm = comp.match(/\(([^)]+)\)/); if (pm) material = pm[1]; }
      else if (m = l.match(/^duration\s*[:.]?\s*(.+)/i)) dur = m[1];
      else descLines.push(l);
    }
    let desc = descLines.join("\n").trim(), higher = "";
    const hm = desc.match(/\b(?:at higher levels?|using a (?:higher[- ]level spell slot|spell slot of level)|cantrip upgrade)\b\s*[:.]?\s*/i);
    if (hm) { higher = desc.slice(hm.index + hm[0].length).trim(); desc = desc.slice(0, hm.index).trim(); }
    const cu = comp.toUpperCase();
    out.push({
      id: "hb-" + Gx.uid(), name, level, school,
      casting_time: ct, range, duration: dur,
      components: { v: /\bV\b/.test(cu), s: /\bS\b/.test(cu), m: /\bM\b/.test(cu) }, material,
      classes: [defaultClass], concentration: /concentration/i.test(dur),
      ritual: /\britual\b/i.test(lines[h]), save: null, attack: false,
      desc, higher_level: higher, edition,
      custom: true, sourceNote: "Pasted (local copy)", source: "Homebrew",
    });
  }
  return out;
}

/* two-step delete guard so a single tap never destroys data */
let _confirmCb = null;
function confirmDelete(msg, onYes) {
  _confirmCb = onYes;
  modal("Please confirm", `<p>${esc(msg)}</p><p class="muted small">This can't be undone.</p>
    <div class="modal-btns"><button class="btn" data-act="closeModal">Cancel</button><button class="btn danger" data-act="confirmYes">Delete</button></div>`);
}
actions.confirmYes = () => { const cb = _confirmCb; _confirmCb = null; closeModal(); if (cb) cb(); };

/* small Edit/Delete menu behind the ⋯ options button (kind = res|item|weapon|feature) */
function optionsMenu(title, kind, dataAttr) {
  modal(title, `<div class="menu-list">
    <button class="btn ghost" data-act="${kind}Edit" ${dataAttr}>Edit</button>
    <button class="btn danger" data-act="${kind}Del" ${dataAttr}>Delete</button>
  </div>`);
}

function resForm(r) {
  actions._resEditId = r ? r.id : null;
  modal(r ? "Edit resource" : "Add resource tracker", `
    <label class="fld"><span>Name</span><input id="res-name" placeholder="e.g. Rage, Ki, Channel Divinity" value="${r ? esc(r.name) : ""}"></label>
    <label class="fld"><span>Max uses</span><input id="res-max" type="number" min="1" value="${r ? r.max : 3}"></label>
    <label class="fld"><span>Resets on</span><select id="res-reset"><option value="long"${r && r.resetOn === "long" ? " selected" : ""}>Long rest</option><option value="short"${r && r.resetOn === "short" ? " selected" : ""}>Short rest</option></select></label>
    <label class="fld"><span>Note (optional)</span><textarea id="res-note" rows="2" placeholder="what it does, reminders…">${r && r.note ? esc(r.note) : ""}</textarea></label>
    <div class="modal-btns"><button class="btn primary" data-act="resSave">${r ? "Save" : "Add"}</button></div>`, () => $("#res-name").focus());
}

/* shared bonus + advantage editor (used by feature and item forms). prefix = "featBonus"/"itemBonus" etc. */
function captureBonusAdvRows() {
  return {
    bonuses: [...document.querySelectorAll(".bonus-row")].map((r) => ({ target: r.querySelector("select").value, value: r.querySelector("input").value })),
    adv: [...document.querySelectorAll(".adv-row select")].map((s) => s.value),
  };
}
function bonusRowsHtml(list, prefix) {
  return list.map((b, i) => `
    <div class="bonus-row">
      <select>${FEAT_TARGETS.map(([v, l]) => `<option value="${v}" ${b.target === v ? "selected" : ""}>${l}</option>`).join("")}</select>
      <input type="number" inputmode="numeric" placeholder="+/–" value="${b.value ?? ""}">
      <button class="opt-btn" data-act="${prefix}Remove" data-i="${i}">✕</button>
    </div>`).join("");
}
function advRowsHtml(list, prefix) {
  return list.map((t, i) => `
    <div class="adv-row">
      <select>${ADV_TARGETS.map(([v, l]) => `<option value="${v}" ${t === v ? "selected" : ""}>${l}</option>`).join("")}</select>
      <button class="opt-btn" data-act="${prefix}Remove" data-i="${i}">✕</button>
    </div>`).join("");
}

function featureForm(f) {
  actions._featEditId = f ? f.id : null;
  actions._featBonuses = f && f.bonuses ? f.bonuses.map((b) => ({ target: b.target, value: b.value })) : [];
  actions._featAdv = f && f.adv ? [...f.adv] : [];
  renderFeatureForm(f ? f.name : "", f ? f.desc : "");
}
function featCapture() {
  const cap = captureBonusAdvRows();
  actions._featBonuses = cap.bonuses; actions._featAdv = cap.adv;
  return { name: $("#ft-name") ? $("#ft-name").value : "", desc: $("#ft-desc") ? $("#ft-desc").value : "" };
}
function renderFeatureForm(name, desc) {
  const rows = bonusRowsHtml(actions._featBonuses, "featBonus");
  const advRows = advRowsHtml(actions._featAdv, "featAdv");
  modal(actions._featEditId ? "Edit feature" : "Add feature / trait", `
    <label class="fld"><span>Name *</span><input id="ft-name" placeholder="Fighting Style: Dueling, Lucky, Darkvision…" value="${esc(name)}"></label>
    <label class="fld"><span>What it does</span><textarea id="ft-desc" rows="3" placeholder="description / reminder…">${esc(desc)}</textarea></label>
    <h3 class="sec">Auto bonuses <small>added to your sheet automatically</small></h3>
    <div class="bonus-list">${rows || '<span class="muted small">none yet — e.g. +1 Armor Class, +2 all weapon damage</span>'}</div>
    <button class="btn small-b add-bonus" data-act="featBonusAdd">+ add a bonus</button>
    <h3 class="sec">Grants advantage on <small>rolls default to advantage</small></h3>
    <div class="adv-list">${advRows || '<span class="muted small">none — e.g. advantage on CON saves, or all saving throws</span>'}</div>
    <button class="btn small-b add-bonus" data-act="featAdvAdd">+ add advantage</button>
    <p class="muted small">Tip: conditional advantage (e.g. only vs poison) is best left as a note — but a tap still lets you choose advantage on any save/skill roll.</p>
    <div class="modal-btns"><button class="btn primary" data-act="featureSave">${actions._featEditId ? "Save" : "Add"}</button></div>`, () => $("#ft-name").focus());
}

function itemForm(it, listKey) {
  actions._itemEditId = it ? it.id : null;
  actions._itemList = listKey || "inventory";
  actions._itemBonuses = it && it.bonuses ? it.bonuses.map((b) => ({ target: b.target, value: b.value })) : [];
  actions._itemAdv = it && it.adv ? [...it.adv] : [];
  renderItemForm(it ? { name: it.name, qty: it.qty, equipped: it.equipped } : { name: "", qty: 1, equipped: false });
}
function itemCapture() {
  const cap = captureBonusAdvRows();
  actions._itemBonuses = cap.bonuses; actions._itemAdv = cap.adv;
  return { name: $("#it-name") ? $("#it-name").value : "", qty: $("#it-qty") ? $("#it-qty").value : 1, equipped: $("#it-eq") ? $("#it-eq").checked : false };
}
function renderItemForm(d) {
  modal(actions._itemEditId ? "Edit item" : "Add item", `
    <label class="fld"><span>Name *</span><input id="it-name" value="${esc(d.name)}"></label>
    <div class="grid2">
      <label class="fld"><span>Quantity</span><input id="it-qty" type="number" min="1" value="${d.qty || 1}"></label>
      <label class="chk it-eq-chk"><input type="checkbox" id="it-eq" ${d.equipped ? "checked" : ""}> Equipped</label>
    </div>
    <p class="muted small">Bonuses &amp; advantage below apply only while the item is <b>equipped</b> (e.g. Cloak of Protection: +1 AC, +1 all saves).</p>
    <h3 class="sec">Auto bonuses</h3>
    <div class="bonus-list">${bonusRowsHtml(actions._itemBonuses, "itemBonus") || '<span class="muted small">none — e.g. +1 Armor Class, +1 all saving throws</span>'}</div>
    <button class="btn small-b add-bonus" data-act="itemBonusAdd">+ add a bonus</button>
    <h3 class="sec">Grants advantage on</h3>
    <div class="adv-list">${advRowsHtml(actions._itemAdv, "itemAdv") || '<span class="muted small">none</span>'}</div>
    <button class="btn small-b add-bonus" data-act="itemAdvAdd">+ add advantage</button>
    <div class="modal-btns"><button class="btn primary" data-act="itemSave">${actions._itemEditId ? "Save" : "Add"}</button></div>`, () => $("#it-name").focus());
}

function weaponForm(w, idx) {
  actions._wpnEditIdx = (idx != null) ? idx : null;
  modal(w ? "Edit weapon" : "Add weapon / attack", `
    <label class="fld"><span>Name *</span><input id="wp-name" placeholder="Longsword, Dagger, Fire Bolt…" value="${w ? esc(w.name) : ""}"></label>
    <div class="grid2">
      <label class="fld"><span>To hit (+)</span><input id="wp-atk" type="number" placeholder="e.g. 5" value="${w && w.atk != null ? esc(w.atk) : ""}"></label>
      <label class="fld"><span>Damage</span><input id="wp-dmg" placeholder="1d8+3" value="${w ? esc(w.damage) : ""}"></label>
    </div>
    <label class="fld"><span>Damage type</span><input id="wp-type" placeholder="slashing, fire…" value="${w ? esc(w.damageType) : ""}"></label>
    <label class="fld"><span>Notes (properties, range)</span><input id="wp-notes" placeholder="versatile, finesse, 20/60 ft…" value="${w ? esc(w.notes) : ""}"></label>
    <div class="modal-btns"><button class="btn primary" data-act="weaponSave">${w ? "Save" : "Add"}</button></div>`, () => $("#wp-name").focus());
}

/* spell detail + cast */
/* a non-bundled spell from the look-up index: name/level/school only, no rules text */
function openStub(id) {
  const s = (Grimoire.spellIndex || []).find((x) => idxId(x.name) === id);
  if (!s) return;
  const lvl = s.level === 0 ? "Cantrip" : "Level " + s.level;
  modal(s.name, `
    <p class="sp-line">${lvl} · ${esc(s.school)} · <span class="muted">${esc(s.source)}</span></p>
    <p class="muted small">Not bundled — Grimoire only ships the free SRD spells. Class &amp; level here come from a community index, so confirm the details at the source. Then paste the full text to add it to this character (stays on your phone).</p>
    <p class="sp-lookup"><a href="${ddbSearchUrl(s.name)}" target="_blank" rel="noopener">Look it up on D&amp;D Beyond ↗</a></p>
    <div class="modal-btns"><button class="btn" data-act="closeModal">Close</button><button class="btn primary" data-act="pasteSpells">Paste the text to add it</button></div>`);
}

function openSpell(ch, id) {
  const s = findSpell(ch, id); if (!s) return;
  const comp = [s.components?.v && "V", s.components?.s && "S", s.components?.m && "M"].filter(Boolean).join(", ") || "—";
  const dc = Calc.spellSaveDC(ch), atk = Calc.spellAttack(ch);
  ui.openSpellId = id;
  modal(s.name, `
    <div class="sp-detail">
      <p class="sp-line">${s.level === 0 ? "Cantrip" : "Level " + s.level} · ${esc(s.school)}${s.ritual ? " · ritual" : ""}${s.concentration ? " · concentration" : ""}</p>
      <div class="sp-grid">
        <div><b>Casting</b>${esc(s.casting_time || "—")}</div>
        <div><b>Range</b>${esc(s.range || "—")}</div>
        <div><b>Duration</b>${esc(s.duration || "—")}</div>
        <div><b>Components</b>${comp}${s.material ? " (" + esc(s.material) + ")" : ""}</div>
      </div>
      ${s.custom && s.sourceNote ? `<p class="sp-src">Source: ${esc(s.sourceNote)}</p>` : ""}
      <p class="sp-lookup"><a href="${ddbSearchUrl(s.name)}" target="_blank" rel="noopener">Look it up on D&amp;D Beyond ↗</a></p>
      <div class="sp-desc"><p>${mdToHtml(s.desc)}</p></div>
      ${s.higher_level ? `<div class="sp-higher"><b>At higher levels.</b> ${mdToHtml(s.higher_level)}</div>` : ""}
      <div class="cast-box">
        <div class="cast-info">
          ${s.attack && atk != null ? `<span class="cast-pill">Spell attack ${sign(atk)}</span>` : ""}
          ${s.save ? `<span class="save-pill">Save: ${esc(s.save.toUpperCase())} vs DC ${dc}</span>` : ""}
          ${s.damage ? `<span class="cast-pill">Damage ${esc(s.damage)}${s.damageType ? " " + esc(s.damageType) : ""}${s.upcast ? " (+upcast)" : ""}</span>` : ""}
        </div>
        ${s.level > 0 && Calc.isCaster(ch) ? `<button class="btn primary" data-act="castSpell" data-id="${esc(id)}" data-lvl="${s.level}">Cast (spend a slot)</button>` : ""}
        ${s.concentration ? `<button class="btn ghost" data-act="startConc" data-id="${esc(id)}">Concentrate</button>` : ""}
      </div>
    </div>`);
}
/* HP take-damage / heal with an amount prompt (temp HP absorbs damage; heal caps at max) */
function applyDamage(n) {
  n = Math.max(0, n | 0); if (!n) return;
  const ch = Store.active(); const c = ch.combat;
  const fromTemp = Math.min(c.hpTemp, n); c.hpTemp -= fromTemp;
  c.hpCur = Math.max(0, c.hpCur - (n - fromTemp));
  commit(); toast(`Took ${n} damage.`); maybeConcentration(ch, n);
}
function applyHeal(n) {
  n = Math.max(0, n | 0); if (!n) return;
  const ch = Store.active(); ch.combat.hpCur = Math.min(Calc.maxHP(ch), ch.combat.hpCur + n);
  commit(); toast(`Healed ${n}.`);
}
function amountPrompt(title, label, cb) {
  modal(title, `
    <label class="fld"><span>${esc(label)}</span><input id="amt-in" type="number" inputmode="numeric" min="0" placeholder="0"></label>
    <div class="modal-btns"><button class="btn primary" data-act="amtApply">${esc(title)}</button></div>`, () => {
      const i = $("#amt-in"); if (i) { i.focus(); i.addEventListener("keydown", (e) => { if (e.key === "Enter") actions.amtApply(); }); }
    });
  actions._amtCb = cb;
}
actions.amtApply = () => { const n = parseInt($("#amt-in").value, 10) || 0; const cb = actions._amtCb; actions._amtCb = null; closeModal(); if (cb) cb(n); };

function maybeConcentration(ch, dmg) {
  if (!dmg || !ch.spells.concentratingOn) return;
  const dc = Math.max(10, Math.floor(dmg / 2));
  const sp = findSpell(ch, ch.spells.concentratingOn);
  const bonus = Calc.saveBonus(ch, "con");
  const adv = [...new Set([...Calc.advSources(ch, "save.con"), ...Calc.advSources(ch, "save.concentration")])];
  modal("Concentration", `
    <p>Took <b>${dmg}</b> damage while concentrating on <b>${esc(sp?.name || "a spell")}</b>.</p>
    <p>Make a Constitution save vs <b>DC ${dc}</b> — your CON save ${sign(bonus)}${adv.length ? `, advantage from ${adv.map(esc).join(", ")}` : ""}.</p>
    <div class="modal-btns">
      <button class="btn primary" data-act="closeModal">Kept it</button>
      <button class="btn danger" data-act="concDrop">Lost it</button>
    </div>`);
}
actions.concDrop = () => { const ch = Store.active(); ch.spells.concentratingOn = null; closeModal(); commit(); toast("Concentration lost."); };
actions.castSpell = (el) => {
  const ch = Store.active(); const min = +el.dataset.lvl; const slots = Calc.spellSlots(ch);
  const avail = []; for (let i = min; i <= 9; i++) if (slots[i].max - slots[i].used > 0) avail.push(i);
  if (!avail.length) { toast("No slots of level " + min + "+ left."); return; }
  if (avail.length === 1) { spendSlot(avail[0]); return; }
  modal("Cast at which level?", `<div class="modal-btns">${avail.map((i) => `<button class="btn" data-act="spend" data-lvl="${i}">Level ${i}</button>`).join("")}</div>`);
};
actions.spend = (el) => spendSlot(+el.dataset.lvl);
function spendSlot(lvl) {
  const ch = Store.active(); ch.spells.slots[lvl].used++; closeModal(); commit();
  toast(`Cast — spent a level ${lvl} slot.`);
}
actions.startConc = (el) => { const ch = Store.active(); const id = el.dataset.id; if (ch.spells.concentratingOn && ch.spells.concentratingOn !== id) { const prev = findSpell(ch, ch.spells.concentratingOn)?.name || "another spell"; if (!confirm(`You're already concentrating on ${prev}. Switch concentration?`)) return; } ch.spells.concentratingOn = id; commit(); closeModal(); toast("Now concentrating. If you take damage you'll be prompted to keep or drop it."); };

/* ---------- subclass spell picker (player enters their own owned content) ---------- */
function subListHtml(ch, q) {
  const set = new Set(ch.subSpells || []);
  let pool = spellPool(ch);
  if (q) pool = pool.filter((s) => s.name.toLowerCase().includes(q.toLowerCase()));
  pool = pool.slice().sort((a, b) => a.level - b.level || a.name.localeCompare(b.name)).slice(0, 250);
  return pool.map((s) => `<button class="spell-main pick ${set.has(s.id) ? "on" : ""}" data-act="ssToggle" data-id="${esc(s.id)}">
      <span class="sp-name">${set.has(s.id) ? "✓ " : ""}${esc(s.name)}</span>
      <span class="sp-meta">${s.level === 0 ? "Cantrip" : "L" + s.level} · ${esc(s.school)}</span>
    </button>`).join("") || `<p class="muted pad">No match.</p>`;
}
actions.editSubSpells = () => {
  const ch = Store.active();
  modal(`${ch.subclass} — spells`, `
    <p class="muted small">Tick the spells your subclass grants. Adding them confirms you <b>own the source book</b>; they then behave like always-prepared subclass spells. (Grimoire bundles only the free SRD content.)</p>
    <input id="ss-q" type="search" placeholder="Search spells…" data-act="ssSearch">
    <div id="ss-list" class="spell-rows pick-list">${subListHtml(ch, "")}</div>
    <div class="modal-btns"><button class="btn primary" data-act="ssDone">Done</button></div>`);
};
actions.ssSearch = (el) => { const l = $("#ss-list"); if (l) l.innerHTML = subListHtml(Store.active(), el.value); };
actions.ssToggle = (el) => {
  const ch = Store.active(); if (!ch.subSpells) ch.subSpells = []; const id = el.dataset.id;
  const i = ch.subSpells.indexOf(id); if (i >= 0) ch.subSpells.splice(i, 1); else ch.subSpells.push(id);
  Store.touch(); if (window.LINK) LINK.schedulePush(ch);
  const l = $("#ss-list"); if (l) l.innerHTML = subListHtml(ch, $("#ss-q") ? $("#ss-q").value : "");
};
actions.ssDone = () => { closeModal(); render(); };

/* ---------- character photo ---------- */
actions.charPhoto = () => {
  const ch = Store.active();
  modal("Character photo", `
    ${ch.portrait ? `<img src="${ch.portrait}" class="portrait-preview" alt="">` : '<p class="muted small">No photo yet. A small copy is stored on this device.</p>'}
    <div class="modal-btns">
      <button class="btn primary" data-act="photoPick">${ch.portrait ? "Change photo" : "Add photo"}</button>
      ${ch.portrait ? `<button class="btn danger" data-act="photoRemove">Remove</button>` : ""}
    </div>`);
};
actions.photoPick = () => {
  const inp = document.createElement("input"); inp.type = "file"; inp.accept = "image/*";
  inp.onchange = () => {
    const f = inp.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => { const img = new Image(); img.onload = () => { Store.active().portrait = downscaleImage(img, 1024); commit(); if (window.LINK) LINK.schedulePush(Store.active()); closeModal(); toast("Photo added."); }; img.onerror = () => toast("Couldn't read that image."); img.src = r.result; };
    r.readAsDataURL(f);
  };
  inp.click();
};
actions.photoRemove = () => { const ch = Store.active(); ch.portrait = ""; commit(); if (window.LINK) LINK.schedulePush(ch); closeModal(); };

/* ===================================================================== */
/*  SESSION BOOK (per-character journal: text + photos + drawings)        */
/*  Text/metadata live in the character (localStorage); image blobs live  */
/*  in IndexedDB (Media), so they never blow the small localStorage cap.  */
/* ===================================================================== */
function activeSession() { const ch = Store.active(); return ch && (ch.sessions || []).find((s) => s.id === ui.sessionId); }

actions.newSession = () => {
  const ch = Store.active(); if (!ch.sessions) ch.sessions = [];
  const d = new Date();
  const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const s = { id: "s" + Gx.uid(), date: iso, title: "", text: "", media: [] };
  ch.sessions.push(s); Store.save();
  ui.sessionId = s.id; ui.screen = "session"; render();
};
actions.openSession = (el) => { ui.sessionId = el.dataset.id; ui.screen = "session"; render(); };
actions.sessionBack = () => { ui.screen = "sheet"; ui.tab = "notes"; ui.sessionId = null; render(); };
actions.sessionTitle = (el) => { const s = activeSession(); if (s) { s.title = el.value; Store.save(); } };
actions.sessionDate = (el) => { const s = activeSession(); if (s) { s.date = el.value; Store.save(); } };
actions.sessionText = (el) => { const s = activeSession(); if (s) { s.text = el.value; Store.save(); } };
actions.sessionDelete = (el) => {
  const ch = Store.active(); const s = (ch.sessions || []).find((x) => x.id === el.dataset.id); if (!s) return;
  confirmDelete(`Delete this session${s.title ? ` “${s.title}”` : ""} and its photos/drawings?`, async () => {
    for (const m of (s.media || [])) { try { await Media.del(m.id); } catch (e) {} }
    ch.sessions = ch.sessions.filter((x) => x.id !== s.id); Store.save();
    ui.screen = "sheet"; ui.tab = "notes"; ui.sessionId = null; render();
  });
};
async function addSessionMedia(sid, type, dataUrl) {
  const ch = Store.active(); const s = (ch.sessions || []).find((x) => x.id === sid); if (!s) return;
  const id = "m" + Gx.uid();
  await Media.put({ id, charId: ch.id, type, data: dataUrl, created: nowStamp() });
  if (!s.media) s.media = []; s.media.push({ id, type, caption: "" });
  Store.save(); render(); toast(type === "photo" ? "Photo added." : "Drawing saved.");
}
actions.sessionAddPhoto = (el) => {
  const sid = el.dataset.id;
  const inp = document.createElement("input"); inp.type = "file"; inp.accept = "image/*";
  inp.onchange = () => {
    const f = inp.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => { const img = new Image(); img.onload = async () => { try { await addSessionMedia(sid, "photo", downscaleImage(img, 1280)); } catch (e) { toast("Couldn't save the photo (storage full?)."); } }; img.onerror = () => toast("Couldn't read that image."); img.src = r.result; };
    r.readAsDataURL(f);
  };
  inp.click();
};
actions.sessionDraw = (el) => {
  const sid = el.dataset.id;
  openDrawPad((dataUrl) => addSessionMedia(sid, "drawing", dataUrl)); // errors propagate to the pad so it keeps your art
};
actions.mediaView = async (el) => {
  let rec = null; try { rec = await Media.get(el.dataset.mid); } catch (e) {}
  if (!rec) { toast("Image not found on this device."); return; }
  modal("", `<img class="media-full" src="${rec.data}" alt=""><div class="modal-btns"><button class="btn" data-act="closeModal">Close</button></div>`);
};
actions.mediaDelete = (el) => {
  const sid = el.dataset.sid, mid = el.dataset.mid;
  confirmDelete("Delete this picture?", async () => {
    const ch = Store.active(); const s = (ch.sessions || []).find((x) => x.id === sid); if (!s) return;
    try { await Media.del(mid); } catch (e) {}
    s.media = (s.media || []).filter((m) => m.id !== mid); Store.save(); render();
  });
};
// after a session screen renders, fill thumbnails from IndexedDB (async)
async function hydrateSessionMedia() {
  for (const img of document.querySelectorAll("img[data-mid]")) {
    const cached = Media.peek(img.dataset.mid);
    if (cached) { img.src = cached; continue; }
    try { const rec = await Media.get(img.dataset.mid); if (rec && document.contains(img)) img.src = rec.data; } catch (e) {}
  }
}

/* ---------- Drawing pad: finger sketch, optional photo/map underneath ---------- */
function openDrawPad(onSave) {
  const COLORS = ["#1c1430", "#ffffff", "#e23b3b", "#2e7d32", "#1f6feb", "#f5a623"];
  const SIZES = [3, 6, 12], SIZE_L = ["S", "M", "L"];
  const wrap = document.createElement("div");
  wrap.className = "drawpad";
  wrap.innerHTML = `
    <div class="dp-bar dp-top">
      <button class="dp-btn" data-dp="cancel">Cancel</button>
      <span class="dp-colors">${COLORS.map((c, i) => `<button class="dp-color${i === 0 ? " on" : ""}" data-dp="color" data-c="${c}" style="background:${c}"></button>`).join("")}</span>
      <button class="dp-btn primary" data-dp="save">Save</button>
    </div>
    <div class="dp-canvas-wrap"><canvas class="dp-canvas"></canvas></div>
    <div class="dp-bar dp-bottom">
      <button class="dp-btn" data-dp="pen">Pen</button>
      <button class="dp-btn" data-dp="erase">Eraser</button>
      <button class="dp-btn" data-dp="size">Size: M</button>
      <button class="dp-btn" data-dp="undo">Undo</button>
      <button class="dp-btn" data-dp="clear">Clear</button>
      <button class="dp-btn" data-dp="photo">Photo/map</button>
    </div>`;
  document.body.appendChild(wrap);

  const canvas = wrap.querySelector(".dp-canvas"), ctx = canvas.getContext("2d");
  const strokesCv = document.createElement("canvas"), sctx = strokesCv.getContext("2d");
  let bgImg = null, color = COLORS[0], erasing = false, sizeIdx = 1;
  let strokes = [], cur = null, drawing = false;

  function drawBg() {
    ctx.fillStyle = "#fffdf7"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (bgImg) { const s = Math.min(canvas.width / bgImg.width, canvas.height / bgImg.height); const w = bgImg.width * s, h = bgImg.height * s; ctx.drawImage(bgImg, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h); }
  }
  function composite() { drawBg(); ctx.drawImage(strokesCv, 0, 0); }
  function seg(a, b, st) { sctx.lineCap = "round"; sctx.lineJoin = "round"; sctx.globalCompositeOperation = st.erase ? "destination-out" : "source-over"; sctx.strokeStyle = st.color; sctx.lineWidth = st.size; sctx.beginPath(); sctx.moveTo(a.x, a.y); sctx.lineTo(b.x, b.y); sctx.stroke(); }
  function dot(p, st) { sctx.globalCompositeOperation = st.erase ? "destination-out" : "source-over"; sctx.fillStyle = st.color; sctx.beginPath(); sctx.arc(p.x, p.y, st.size / 2, 0, Math.PI * 2); sctx.fill(); }
  function paint(st) { if (st.pts.length === 1) dot(st.pts[0], st); else for (let i = 1; i < st.pts.length; i++) seg(st.pts[i - 1], st.pts[i], st); }
  function redraw() { sctx.clearRect(0, 0, strokesCv.width, strokesCv.height); sctx.globalCompositeOperation = "source-over"; for (const st of strokes) paint(st); composite(); }
  function fit() { const el = wrap.querySelector(".dp-canvas-wrap"); const w = el.clientWidth, h = el.clientHeight; canvas.width = w; canvas.height = h; strokesCv.width = w; strokesCv.height = h; redraw(); }
  function pos(e) { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  function markTool() { wrap.querySelector('[data-dp="pen"]').classList.toggle("on", !erasing); wrap.querySelector('[data-dp="erase"]').classList.toggle("on", erasing); }

  canvas.addEventListener("pointerdown", (e) => { e.preventDefault(); try { canvas.setPointerCapture(e.pointerId); } catch (x) {} drawing = true; cur = { color, size: SIZES[sizeIdx], erase: erasing, pts: [pos(e)] }; strokes.push(cur); dot(cur.pts[0], cur); composite(); });
  canvas.addEventListener("pointermove", (e) => { if (!drawing) return; e.preventDefault(); const p = pos(e); const a = cur.pts[cur.pts.length - 1]; cur.pts.push(p); seg(a, p, cur); composite(); });
  const end = () => { drawing = false; cur = null; };
  canvas.addEventListener("pointerup", end); canvas.addEventListener("pointercancel", end);

  function pickBg() { const inp = document.createElement("input"); inp.type = "file"; inp.accept = "image/*"; inp.onchange = () => { const f = inp.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => { const im = new Image(); im.onload = () => { bgImg = im; redraw(); }; im.src = r.result; }; r.readAsDataURL(f); }; inp.click(); }
  function close() { wrap.remove(); window.removeEventListener("resize", fit); }
  async function save() {
    const out = document.createElement("canvas"); out.width = canvas.width; out.height = canvas.height; const o = out.getContext("2d");
    o.fillStyle = "#fffdf7"; o.fillRect(0, 0, out.width, out.height);
    if (bgImg) { const s = Math.min(out.width / bgImg.width, out.height / bgImg.height); const w = bgImg.width * s, h = bgImg.height * s; o.drawImage(bgImg, (out.width - w) / 2, (out.height - h) / 2, w, h); }
    o.drawImage(strokesCv, 0, 0);
    const data = out.toDataURL("image/jpeg", 0.85);
    const btn = wrap.querySelector('[data-dp="save"]'); if (btn) { btn.disabled = true; btn.textContent = "Saving…"; }
    try { await onSave(data); close(); }   // only close on success so the drawing isn't lost if storage fails
    catch (e) { if (btn) { btn.disabled = false; btn.textContent = "Save"; } toast("Couldn't save — storage may be full. Your drawing is still here."); }
  }

  wrap.addEventListener("click", (e) => {
    const b = e.target.closest("[data-dp]"); if (!b) return;
    const a = b.dataset.dp;
    if (a === "cancel") close();
    else if (a === "save") save();
    else if (a === "color") { color = b.dataset.c; erasing = false; wrap.querySelectorAll(".dp-color").forEach((x) => x.classList.toggle("on", x === b)); markTool(); }
    else if (a === "pen") { erasing = false; markTool(); }
    else if (a === "erase") { erasing = true; markTool(); }
    else if (a === "size") { sizeIdx = (sizeIdx + 1) % SIZES.length; b.textContent = "Size: " + SIZE_L[sizeIdx]; }
    else if (a === "undo") { strokes.pop(); redraw(); }
    else if (a === "clear") { strokes = []; redraw(); }
    else if (a === "photo") pickBg();
  });
  window.addEventListener("resize", fit);
  requestAnimationFrame(() => { fit(); markTool(); });
}

/* ===================================================================== */
/*  SUMMONS — per-character; SRD library + custom; HP management in/out of combat */
/* ===================================================================== */
function activeSummon(id) { const ch = Store.active(); return ch && (ch.summons || []).find((s) => s.id === id); }
function makeSummon(def, count) {
  return { id: "sm" + Gx.uid(), name: def.name, ref: def.name, ac: def.ac, speed: def.speed || "", attacks: JSON.parse(JSON.stringify(def.attacks || [])), hpMax: def.hp, hd: def.hd || null, hps: Array(Math.max(1, count | 0)).fill(def.hp), notes: def.notes || "", icon: def.icon || "", photo: null, conc: false };
}
// adjust a damage string's flat modifier by delta (e.g. Undead Thralls +PB to damage)
function adjustDamage(dmg, delta) {
  if (!dmg || !delta) return dmg;
  const m = String(dmg).match(/^(\d*d\d+)\s*([+-]\s*\d+)?(.*)$/i);
  if (m) { const mod = (m[2] ? parseInt(m[2].replace(/\s/g, ""), 10) : 0) + delta; return m[1] + (mod ? (mod > 0 ? "+" : "") + mod : "") + (m[3] || ""); }
  const n = parseInt(dmg, 10); return isNaN(n) ? dmg : String(n + delta);
}
function summonLibRows(q) {
  const lib = Grimoire.summonLib || [], idx = Grimoire.creatureIndex || [];
  const ql = (q || "").toLowerCase();
  const have = new Set(lib.map((d) => d.name.toLowerCase()));
  const items = [
    ...lib.filter((d) => !ql || d.name.toLowerCase().includes(ql)).map((d) => ({ d, stub: false })),
    ...idx.filter((d) => !have.has(d.name.toLowerCase()) && (!ql || d.name.toLowerCase().includes(ql))).map((d) => ({ d, stub: true })),
  ].sort((x, y) => x.d.name.localeCompare(y.d.name));
  if (!items.length) return `<p class="muted small pad">No match — use “Custom summon”.</p>`;
  return items.map(({ d, stub }) => stub
    ? `<button class="sum-pick stub" data-act="summonStub" data-name="${esc(d.name)}" data-type="${esc(d.type || "")}"><span class="sp-ic">${creatureIcon(d.type)}</span><span class="sp-n">${esc(d.name)}</span><span class="muted small">${d.cr && d.cr !== "—" ? "CR " + esc(d.cr) + " · " : ""}${esc(d.type || "")} · not bundled</span></button>`
    : `<button class="sum-pick" data-act="summonLibPick" data-name="${esc(d.name)}"><span class="sp-ic">${creatureIcon(d.type || d.icon)}</span><span class="sp-n">${esc(d.name)}</span><span class="muted small">CR ${esc(d.cr)} · AC ${d.ac} · ${d.hp} HP</span></button>`
  ).join("");
}
actions.openSummons = () => { ui.screen = "summons"; render(); };
actions.summonBack = () => { ui.screen = "sheet"; ui.tab = "combat"; render(); };
actions.summonAdd = () => {
  modal("Add summon", `
    <p class="muted small">Pick a creature (SRD stats) or add a custom one — then choose how many.</p>
    <input class="search" id="sum-search" data-act="summonSearch" placeholder="Search creatures…">
    <div class="sum-lib" id="sum-lib">${summonLibRows("")}</div>
    <div class="modal-btns"><button class="btn" data-act="summonCustom">Custom summon</button></div>`, () => $("#sum-search").focus());
};
actions.summonSearch = (el) => { const box = $("#sum-lib"); if (box) box.innerHTML = summonLibRows(el.value); };
actions.summonLibPick = (el) => {
  const def = (Grimoire.summonLib || []).find((d) => d.name === el.dataset.name); if (!def) return;
  amountPrompt(`How many ${def.name}?`, "Count (e.g. 8 for Conjure Animals)", (n) => {
    const ch = Store.active(); if (!ch.summons) ch.summons = []; const c = Math.max(1, n || 1);
    ch.summons.push(makeSummon(def, c)); commit(); toast(`Added ${c}× ${def.name}.`);
  });
};
actions.summonStep = (el) => { const s = activeSummon(el.dataset.id); if (!s) return; const i = +el.dataset.i; s.hps[i] = Math.max(0, Math.min(s.hpMax, s.hps[i] + (+el.dataset.d || 0))); commit(); };
actions.summonDmg = (el) => { const s = activeSummon(el.dataset.id); if (!s) return; const i = +el.dataset.i; amountPrompt("Damage", "How much damage?", (n) => { s.hps[i] = Math.max(0, s.hps[i] - (n || 0)); commit(); }); };
actions.summonKill = (el) => { const s = activeSummon(el.dataset.id); if (!s) return; s.hps.splice(+el.dataset.i, 1); commit(); };
actions.summonAddOne = (el) => { const s = activeSummon(el.dataset.id); if (!s) return; s.hps.push(s.hpMax); commit(); };
actions.summonDismissAll = () => { confirmDelete("Dismiss ALL summons?", async () => { const ch = Store.active(); for (const s of (ch.summons || [])) if (s.photo) { try { await Media.del(s.photo); } catch (e) {} } ch.summons = []; commit(); }); };
actions.summonOptions = (el) => {
  const s = activeSummon(el.dataset.id); if (!s) return;
  modal(s.name, `<div class="menu-list">
    <button class="btn ghost" data-act="summonStat" data-id="${esc(s.id)}">View full stat block</button>
    <button class="btn ghost" data-act="summonEdit" data-id="${esc(s.id)}">Edit stats / count</button>
    <button class="btn ghost" data-act="summonPhoto" data-id="${esc(s.id)}">${s.photo ? "Change picture" : "Add picture"}</button>
    ${s.photo ? `<button class="btn ghost" data-act="summonPhotoRemove" data-id="${esc(s.id)}">Remove picture</button>` : ""}
    <h3 class="sec">Feature boosts</h3>
    <button class="btn ${s.mighty ? "primary" : "ghost"}" data-act="summonMighty" data-id="${esc(s.id)}">${s.mighty ? "✓ " : ""}Mighty Summoner (+2 HP/Hit Die)</button>
    <button class="btn ${s.thralls ? "primary" : "ghost"}" data-act="summonThralls" data-id="${esc(s.id)}">${s.thralls ? "✓ " : ""}Undead Thralls (+level HP, +PB dmg)</button>
    <button class="btn danger" data-act="summonRemove" data-id="${esc(s.id)}">Remove summon</button>
  </div>`);
};
// Mighty Summoner (Druid Shepherd L6): +2 HP per Hit Die; attacks count as magical. Toggle.
actions.summonMighty = (el) => {
  const s = activeSummon(el.dataset.id); if (!s) return;
  const apply = (hd) => {
    const delta = 2 * hd;
    if (!s.mighty) { s.hpMax += delta; s.hps = s.hps.map((h) => h + delta); s.mighty = true; s.attacksMagical = true; s._mightyDelta = delta; }
    else { const d = s._mightyDelta || delta; s.hpMax = Math.max(1, s.hpMax - d); s.hps = s.hps.map((h) => Math.max(0, Math.min(s.hpMax, h - d))); s.mighty = false; s.attacksMagical = false; s._mightyDelta = null; }
    commit(); actions.summonOptions(el);
  };
  if (s.mighty) return apply(0); // toggling off uses stored delta
  if (s.hd) return apply(s.hd);
  amountPrompt("Mighty Summoner", "How many Hit Dice does this creature have?", (n) => { s.hd = Math.max(1, n || 1); apply(s.hd); });
};
// Undead Thralls (Wizard Necromancy L6): +your level HP; +proficiency to damage rolls. Toggle.
actions.summonThralls = (el) => {
  const s = activeSummon(el.dataset.id); if (!s) return;
  const ch = Store.active();
  if (!s.thralls) {
    const wiz = Calc.classList(ch).find((c) => c.cls === "Wizard");
    const lvl = wiz ? wiz.level : Calc.totalLevel(ch);
    const pb = Calc.prof(ch);
    s.hpMax += lvl; s.hps = s.hps.map((h) => h + lvl);
    s.attacks = (s.attacks || []).map((a) => ({ ...a, damage: adjustDamage(a.damage, pb) }));
    s.thralls = true; s._thrallHp = lvl; s._thrallDmg = pb;
  } else {
    const lvl = s._thrallHp || 0, pb = s._thrallDmg || 0;
    s.hpMax = Math.max(1, s.hpMax - lvl); s.hps = s.hps.map((h) => Math.max(0, Math.min(s.hpMax, h - lvl)));
    s.attacks = (s.attacks || []).map((a) => ({ ...a, damage: adjustDamage(a.damage, -pb) }));
    s.thralls = false; s._thrallHp = null; s._thrallDmg = null;
  }
  commit(); actions.summonOptions(el);
};
// full SRD stat block (from the library by ref, falling back to what the summon stores)
actions.summonStat = (el) => {
  const s = activeSummon(el.dataset.id); if (!s) return;
  const def = (Grimoire.summonLib || []).find((d) => d.name === (s.ref || s.name)) || s;
  const ab = def.abilities;
  const abLine = ab ? `<div class="stat-abis">${["str", "dex", "con", "int", "wis", "cha"].map((k) => `<div><b>${k.toUpperCase()}</b><span>${ab[k]} (${sign(Calc.mod(ab[k]))})</span></div>`).join("")}</div>` : "";
  const row = (label, val) => val ? `<p class="stat-row"><b>${label}</b> ${esc(val)}</p>` : "";
  const blocks = (title, arr) => (arr && arr.length) ? `<h3 class="sec">${title}</h3>${arr.map((a) => `<p class="stat-block-item"><b>${esc(a.name)}.</b> ${esc(a.desc)}</p>`).join("")}` : "";
  modal(def.name, `
    <p class="sp-line">${def.cr && def.cr !== "—" ? "CR " + esc(def.cr) + " · " : ""}${esc(def.type || "")}</p>
    <div class="stat-top">
      <span>AC <b>${def.ac}</b></span><span>HP <b>${def.hp ?? s.hpMax}</b>${def.hd ? ` (${def.hd} HD)` : ""}</span><span>${esc(def.speed || "")}</span>
    </div>
    ${abLine}
    ${row("Saving Throws", def.saves)}
    ${row("Skills", def.skills)}
    ${row("Damage Resistances", def.resist)}
    ${row("Damage Immunities", def.immune)}
    ${row("Damage Vulnerabilities", def.vuln)}
    ${row("Condition Immunities", def.condImmune)}
    ${row("Senses", def.senses)}
    ${row("Languages", def.languages)}
    ${blocks("Traits", def.traits)}
    ${blocks("Actions", def.actions)}
    ${blocks("Reactions", def.reactions)}
    ${s.attacksMagical ? `<p class="muted small">Attacks count as magical (Mighty Summoner).</p>` : ""}
    <div class="modal-btns"><button class="btn" data-act="closeModal">Close</button></div>`);
};
actions.summonRemove = (el) => { const id = el.dataset.id; confirmDelete("Remove this summon?", async () => { const ch = Store.active(); const s = (ch.summons || []).find((x) => x.id === id); if (s && s.photo) { try { await Media.del(s.photo); } catch (e) {} } ch.summons = (ch.summons || []).filter((x) => x.id !== id); commit(); }); };
actions.summonEdit = (el) => {
  const s = activeSummon(el.dataset.id); if (!s) return; actions._sumEditId = s.id;
  modal("Edit summon", `
    <label class="fld"><span>Name</span><input id="se-name" value="${esc(s.name)}"></label>
    <div class="grid2">
      <label class="fld"><span>Count</span><input id="se-count" type="number" min="0" value="${s.hps.length}"></label>
      <label class="fld"><span>AC</span><input id="se-ac" type="number" value="${s.ac}"></label>
    </div>
    <div class="grid2">
      <label class="fld"><span>Max HP each</span><input id="se-hp" type="number" min="1" value="${s.hpMax}"></label>
      <label class="fld"><span>Speed</span><input id="se-speed" value="${esc(s.speed || "")}"></label>
    </div>
    <label class="fld"><span>Notes</span><textarea id="se-notes" rows="2">${esc(s.notes || "")}</textarea></label>
    <label class="chk"><input type="checkbox" id="se-conc" ${s.conc ? "checked" : ""}> Concentration</label>
    <label class="chk"><input type="checkbox" id="se-full"> Set all to full HP</label>
    <p class="muted small">Mighty Summoner / higher-level scaling: raise “Max HP each”, then tick “Set all to full HP”.</p>
    <div class="modal-btns"><button class="btn primary" data-act="summonEditSave">Save</button></div>`, () => $("#se-name").focus());
};
actions.summonEditSave = () => {
  const s = activeSummon(actions._sumEditId); if (!s) { closeModal(); return; }
  s.name = $("#se-name").value.trim() || s.name;
  s.ac = +$("#se-ac").value || s.ac;
  s.hpMax = Math.max(1, +$("#se-hp").value || s.hpMax);
  s.speed = $("#se-speed").value.trim();
  s.notes = $("#se-notes").value.trim();
  s.conc = $("#se-conc").checked;
  const cnt = Math.max(0, +$("#se-count").value || 0), full = $("#se-full").checked;
  while (s.hps.length > cnt) s.hps.pop();
  while (s.hps.length < cnt) s.hps.push(s.hpMax);
  s.hps = s.hps.map((hp) => full ? s.hpMax : Math.min(hp, s.hpMax));
  actions._sumEditId = null; closeModal(); commit();
};
actions.summonStub = (el) => {
  const name = el.dataset.name, type = el.dataset.type;
  const c = (Grimoire.creatureIndex || []).find((x) => x.name === name) || { name, type, cr: "", source: "" };
  modal(name, `
    <p class="sp-line">${c.cr && c.cr !== "—" ? "CR " + esc(c.cr) + " · " : ""}${esc(c.type || "")}${c.source ? ` · <span class="muted">${esc(c.source)}</span>` : ""}</p>
    <p class="muted small">Not bundled — Grimoire only ships free SRD creatures. Look up its stats, then add it as a custom summon.</p>
    <p class="sp-lookup"><a href="${ddbSearchUrl(name)}" target="_blank" rel="noopener">Look it up on D&amp;D Beyond ↗</a></p>
    <div class="modal-btns"><button class="btn" data-act="closeModal">Close</button><button class="btn primary" data-act="summonCustom" data-name="${esc(name)}" data-type="${esc(type)}">Add as custom</button></div>`);
};
actions.summonCustom = (el) => {
  const pname = el && el.dataset ? (el.dataset.name || "") : "";
  actions._sumType = el && el.dataset ? (el.dataset.type || "") : "";
  modal("Custom summon", `
    <label class="fld"><span>Name *</span><input id="sc-name" value="${esc(pname)}" placeholder="e.g. Spectral Wolf"></label>
    <div class="grid2">
      <label class="fld"><span>Count</span><input id="sc-count" type="number" min="1" value="1"></label>
      <label class="fld"><span>AC</span><input id="sc-ac" type="number" value="12"></label>
    </div>
    <div class="grid2">
      <label class="fld"><span>Max HP each</span><input id="sc-hp" type="number" min="1" value="10"></label>
      <label class="fld"><span>Speed</span><input id="sc-speed" placeholder="30 ft."></label>
    </div>
    <div class="grid2">
      <label class="fld"><span>Attack</span><input id="sc-atkname" placeholder="Bite"></label>
      <label class="fld"><span>To-hit</span><input id="sc-atk" type="number" value="0"></label>
    </div>
    <div class="grid2">
      <label class="fld"><span>Damage</span><input id="sc-dmg" placeholder="1d6+2"></label>
      <label class="fld"><span>Type</span><input id="sc-dtype" placeholder="piercing"></label>
    </div>
    <label class="fld"><span>Notes</span><textarea id="sc-notes" rows="2" placeholder="special abilities, riders…"></textarea></label>
    <div class="modal-btns"><button class="btn primary" data-act="summonCustomSave">Add</button></div>`, () => $("#sc-name").focus());
};
actions.summonCustomSave = () => {
  const name = $("#sc-name").value.trim(); if (!name) { toast("Name required."); return; }
  const count = Math.max(1, +$("#sc-count").value || 1), hp = Math.max(1, +$("#sc-hp").value || 1);
  const atks = []; const an = $("#sc-atkname").value.trim();
  if (an) atks.push({ name: an, atk: +$("#sc-atk").value || 0, damage: $("#sc-dmg").value.trim(), type: $("#sc-dtype").value.trim(), notes: "" });
  const ch = Store.active(); if (!ch.summons) ch.summons = [];
  ch.summons.push({ id: "sm" + Gx.uid(), name, ac: +$("#sc-ac").value || 10, speed: $("#sc-speed").value.trim(), attacks: atks, hpMax: hp, hps: Array(count).fill(hp), notes: $("#sc-notes").value.trim(), icon: actions._sumType || "", photo: null, conc: false });
  actions._sumType = null; closeModal(); commit(); toast(`Added ${count}× ${name}.`);
};
actions.summonPhoto = (el) => {
  const id = el.dataset.id; closeModal();
  const inp = document.createElement("input"); inp.type = "file"; inp.accept = "image/*";
  inp.onchange = () => { const f = inp.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => { const img = new Image(); img.onload = async () => {
    try { const s = activeSummon(id); if (!s) return; if (s.photo) { try { await Media.del(s.photo); } catch (e) {} } const mid = "m" + Gx.uid(); await Media.put({ id: mid, charId: Store.active().id, type: "summon", data: downscaleImage(img, 640), created: nowStamp() }); s.photo = mid; commit(); }
    catch (e) { toast("Couldn't save the picture (storage full?)."); }
  }; img.onerror = () => toast("Couldn't read that image."); img.src = r.result; }; r.readAsDataURL(f); };
  inp.click();
};
actions.summonPhotoRemove = (el) => { const s = activeSummon(el.dataset.id); if (!s || !s.photo) return; const mid = s.photo; s.photo = null; closeModal(); commit(); Media.del(mid).catch(() => {}); };

/* ---------- appearance (dark/light + accent) ---------- */
actions.appearance = () => {
  const ch = Store.active();
  const mode = localStorage.getItem("grimoire.mode") || "dark";
  const cur = ch.accent || RULES.CLASS_ACCENT[ch.cls] || "violet";
  const swatches = Object.entries(RULES.ACCENTS).map(([k, v]) => `<button class="swatch ${cur === k ? "on" : ""}" data-act="setAccent" data-key="${k}" style="background:${v[0]}" title="${k}"></button>`).join("");
  modal("Appearance", `
    <h3 class="sec">Mode</h3>
    <div class="mode-row">
      <button class="btn ${mode === "dark" ? "primary" : "ghost"}" data-act="setMode" data-mode="dark">Dark</button>
      <button class="btn ${mode === "light" ? "primary" : "ghost"}" data-act="setMode" data-mode="light">Light</button>
    </div>
    <h3 class="sec">Accent colour <small>${ch.accent ? "custom" : "class default"}</small></h3>
    <div class="swatches">${swatches}</div>
    ${ch.accent ? `<button class="btn ghost" data-act="resetAccent">Use ${esc(ch.cls)} default</button>` : ""}`);
};
actions.setMode = (el) => { localStorage.setItem("grimoire.mode", el.dataset.mode); render(); actions.appearance(); };
actions.setAccent = (el) => { const ch = Store.active(); ch.accent = el.dataset.key; commit(); if (window.LINK) LINK.schedulePush(ch); actions.appearance(); };
actions.resetAccent = () => { const ch = Store.active(); ch.accent = ""; commit(); if (window.LINK) LINK.schedulePush(ch); actions.appearance(); };

/* ---------- drag-to-reorder (only active in Arrange mode) ---------- */
actions.toggleReorder = () => { ui.reorder = !ui.reorder; render(); };

let _drag = null;
function initSortables() {
  if (!ui.reorder) return;
  document.querySelectorAll(".drag-handle").forEach((h) => h.addEventListener("pointerdown", dragStart));
}
function dragStart(e) {
  const handle = e.currentTarget;
  const row = handle.closest("[data-sortid]"), container = handle.closest("[data-sortlist]");
  if (!row || !container) return;
  e.preventDefault();
  _drag = { row, container, moved: false };
  try { handle.setPointerCapture(e.pointerId); } catch {}
  handle.addEventListener("pointermove", dragMove);
  handle.addEventListener("pointerup", dragEnd);
  handle.addEventListener("pointercancel", dragEnd);
  row.classList.add("dragging");
}
function dragMove(e) {
  if (!_drag) return;
  _drag.moved = true;
  const { container, row } = _drag;
  const others = [...container.querySelectorAll("[data-sortid]")].filter((r) => r !== row);
  let before = null;
  for (const r of others) { const rect = r.getBoundingClientRect(); if (e.clientY < rect.top + rect.height / 2) { before = r; break; } }
  if (before) { if (before.previousElementSibling !== row) container.insertBefore(row, before); }
  else if (others.length && others[others.length - 1] !== row.previousElementSibling) { container.appendChild(row); }
}
function dragEnd(e) {
  if (!_drag) return;
  const { container, row, moved } = _drag; const handle = e.currentTarget;
  row.classList.remove("dragging");
  try { handle.releasePointerCapture(e.pointerId); } catch {}
  handle.removeEventListener("pointermove", dragMove);
  handle.removeEventListener("pointerup", dragEnd);
  handle.removeEventListener("pointercancel", dragEnd);
  const listName = container.dataset.sortlist; _drag = null;
  if (moved) applySortOrder(listName);
}
function applySortOrder(listName) {
  const ch = Store.active(); if (!ch) return;
  const container = document.querySelector(`[data-sortlist="${listName}"]`); if (!container) return;
  const ids = [...container.querySelectorAll("[data-sortid]")].map((el) => el.dataset.sortid);
  if (listName.startsWith("spell:")) {
    const key = listName.slice(6); const set = new Set(ids);
    const out = ids.filter((id) => ch.spells[key].includes(id));
    ch.spells[key].forEach((id) => { if (!set.has(id)) out.push(id); });
    ch.spells[key] = out;
  } else {
    const arr = ch[listName] || []; const map = new Map(arr.map((x) => [x.id, x]));
    const out = ids.map((id) => map.get(id)).filter(Boolean);
    arr.forEach((x) => { if (!ids.includes(x.id)) out.push(x); });
    ch[listName] = out;
  }
  commit();
}

/* ===================================================================== */
/*  WIRING                                                               */
/* ===================================================================== */
document.addEventListener("click", (e) => {
  const t = e.target.closest("[data-act]"); if (!t) return;
  const fn = actions[t.dataset.act]; if (fn) { e.preventDefault(); fn(t); }
});
document.addEventListener("input", (e) => {
  // data-act inputs (e.g. spell search) — fire as you type
  const a = e.target.closest("[data-act]");
  if (a && actions[a.dataset.act]) { actions[a.dataset.act](a); return; }
  const t = e.target.closest("[data-bind]"); if (!t) return;
  const ch = Store.active(); if (!ch) return;
  let v = t.type === "checkbox" ? t.checked : t.value;
  if (t.type === "number") v = (t.value === "" ? (t.dataset.bind === "combat.armorBaseAC" ? null : 0) : Number(t.value));
  setPath(ch, t.dataset.bind, v); Store.touch(); if (window.LINK) LINK.schedulePush(ch);
  // live-update small computed readouts without rebuilding inputs
  if (t.dataset.bind.startsWith("abilities.")) { const card = t.closest(".ab-card"); if (card) card.querySelector(".ab-mod").textContent = sign(Calc.abilityMod(ch, t.dataset.bind.split(".")[1])); }
});
document.addEventListener("change", (e) => {
  // data-act selects (e.g. spell level filter) — fire on change
  const a = e.target.closest("[data-act]");
  if (a && actions[a.dataset.act]) { actions[a.dataset.act](a); return; }
  const cl = e.target.closest('[data-act="clsLevel"]');
  if (cl) {
    const ch = Store.active(); const i = +cl.dataset.i; const v = Math.max(1, Math.min(20, +cl.value || 1));
    if (i === 0) ch.level = v; else ch.multiclass[i - 1].level = v;
    commit(); if (window.LINK) LINK.schedulePush(ch); actions.manageClasses(); return;
  }
  const sub = e.target.closest('[data-act="subSelect"]');
  if (sub) { const ch = Store.active(); ch.subclass = sub.value; commit(); if (window.LINK) LINK.schedulePush(ch); actions.manageClasses(); return; }
  const t = e.target.closest("[data-bind]"); if (!t) return;
  if (t.tagName === "TEXTAREA") return; // don't yank focus from notes
  if (["combat.hpMax", "combat.armorBaseAC", "combat.armorDexMode", "combat.shield"].includes(t.dataset.bind)) render();
});

/* service worker + "new version available" prompt */
let _swReg = null, _doReload = false;
function showUpdatePrompt() {
  toast(`New version available. <button class="toast-btn" data-act="doUpdate">Reload</button>`, 999999);
}
actions.doUpdate = () => {
  _doReload = true;
  const w = _swReg && (_swReg.waiting || _swReg.installing);
  if (w) w.postMessage("skipWaiting"); else location.reload();
};
if ("serviceWorker" in navigator) {
  // when the new SW takes control (after the user taps Reload), refresh once
  navigator.serviceWorker.addEventListener("controllerchange", () => { if (_doReload) location.reload(); });
  window.addEventListener("load", async () => {
    try {
      const reg = await navigator.serviceWorker.register("sw.js?v=47");
      _swReg = reg;
      if (reg.waiting && navigator.serviceWorker.controller) showUpdatePrompt(); // update already pending
      reg.addEventListener("updatefound", () => {
        const nw = reg.installing; if (!nw) return;
        nw.addEventListener("statechange", () => {
          if (nw.state === "installed" && navigator.serviceWorker.controller) showUpdatePrompt();
        });
      });
      setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000); // hourly update check
    } catch {}
  });
}
(async function boot() {
  Store.load();
  Party.load();
  try { await loadSpells(); } catch (e) { toast("Spell data offline — connect once to install."); }
  if (Store.active()) { ui.screen = "sheet"; ui.spellFilter.list = defaultSpellList(Store.active()); }
  render();
  if (window.LINK) LINK.afterBoot();
  if (window.PARTY) PARTY.afterBoot();
})();
