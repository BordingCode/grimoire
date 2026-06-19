/* Grimoire — behaviour layer: app state, data loading, actions, forms, wiring, boot.
   Helpers live in util.js; rendering in views.js; 5e data in rules.js; math in calc.js;
   storage in state.js; cloud linking in link.js. */
"use strict";

const Grimoire = { spells: { "2014": [], "2024": [] } };
const ui = { screen: "home", tab: "stats", spellFilter: { q: "", level: "all", list: "available" } };

/* team kill-count tracker (local to this device, separate from characters) */
const Party = {
  KEY: "grimoire.party.v1",
  members: [],
  load() { try { this.members = JSON.parse(localStorage.getItem(this.KEY)) || []; } catch { this.members = []; } },
  save() { localStorage.setItem(this.KEY, JSON.stringify(this.members)); },
};

async function loadSpells() {
  const [a, b] = await Promise.all([
    fetch("data/spells-2014.json?v=24").then((r) => r.json()),
    fetch("data/spells-2024.json?v=24").then((r) => r.json()),
  ]);
  Grimoire.spells["2014"] = a; Grimoire.spells["2024"] = b;
}

/* persist + (optionally) re-render; schedules a link push if linked */
function commit(rerender = true) { Store.touch(); if (window.LINK) LINK.schedulePush(Store.active()); if (rerender) render(); }

/* ===================================================================== */
/*  ACTIONS                                                              */
/* ===================================================================== */
const actions = {
  goHome() { ui.screen = "home"; render(); },
  goNew() { ui.screen = "new"; render(); },
  goParty() { ui.screen = "party"; render(); },
  partyAdd() { const n = ($("#party-name").value || "").trim(); if (!n) return; Party.members.push({ id: Gx.uid(), name: n, kills: 0 }); Party.save(); render(); },
  partyKill(el) { const m = Party.members.find((x) => x.id === el.dataset.id); if (m) { m.kills++; Party.save(); render(); } },
  partyUnkill(el) { const m = Party.members.find((x) => x.id === el.dataset.id); if (m && m.kills > 0) { m.kills--; Party.save(); render(); } },
  partyRemove(el) { const m = Party.members.find((x) => x.id === el.dataset.id); confirmDelete(`Remove ${m ? m.name : "this member"} from the kill count?`, () => { Party.members = Party.members.filter((x) => x.id !== el.dataset.id); Party.save(); render(); }); },
  partyReset() { if (confirm("Reset everyone's kills to 0?")) { Party.members.forEach((m) => (m.kills = 0)); Party.save(); render(); } },
  open(el) { Store.setActive(el.dataset.id); ui.screen = "sheet"; ui.tab = "stats"; render(); },
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
    ui.screen = "sheet"; ui.tab = "stats"; render();
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
  hpEdit() { const ch = Store.active(); modal("Set current HP", `<input id="hp-in" type="number" value="${ch.combat.hpCur}"><div class="modal-btns"><button class="btn primary" data-act="hpSet">Set</button></div>`, () => $("#hp-in").focus()); },
  hpSet() { const ch = Store.active(); const prev = ch.combat.hpCur; const next = Math.max(0, Math.min(Calc.maxHP(ch), +$("#hp-in").value || 0)); ch.combat.hpCur = next; closeModal(); commit(); if (next < prev) maybeConcentration(ch, prev - next); },
  death(el) { const ch = Store.active(); const t = el.dataset.t, i = +el.dataset.i; const cur = ch.combat.death[t]; ch.combat.death[t] = cur > i ? i : i + 1; commit(); },

  shortRest() { const ch = Store.active(); const p = Calc.pactMagic(ch); if (p) ch.spells.pact.used = 0; (ch.resources || []).forEach((r) => { if (r.resetOn === "short") r.used = 0; }); commit(); toast("Short rest — pact slots & short-rest resources restored. Spend hit dice to heal."); },
  spendHitDie() {
    const ch = Store.active(); const c = ch.combat;
    if (Calc.totalLevel(ch) - c.hitDiceUsed <= 0) { toast("No hit dice left."); return; }
    const dice = Object.keys(Calc.hitDicePool(ch)).map(Number).sort((a, b) => b - a);
    if (dice.length === 1) return rollHitDie(dice[0]);
    modal("Spend which hit die?", `<div class="modal-btns">${dice.map((d) => `<button class="btn" data-act="hitDiePick" data-die="${d}">d${d}</button>`).join("")}</div>`);
  },
  hitDiePick(el) { closeModal(); rollHitDie(+el.dataset.die); },
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
  pactSlot(el) { const ch = Store.active(); const k = +el.dataset.k; ch.spells.pact.used = (k < ch.spells.pact.used) ? k : k + 1; commit(); },

  spellDetail(el) { openSpell(Store.active(), el.dataset.id); },

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

  /* gear */
  addItem() { itemForm(null); },
  itemOptions(el) { const it = Store.active().inventory.find((x) => x.id === el.dataset.id); optionsMenu(it ? it.name : "Item", "item", `data-id="${el.dataset.id}"`); },
  itemEdit(el) { itemForm(Store.active().inventory.find((x) => x.id === el.dataset.id)); },
  itemBonusAdd() { const m = itemCapture(); actions._itemBonuses.push({ target: "ac", value: "" }); renderItemForm(m); },
  itemBonusRemove(el) { const m = itemCapture(); actions._itemBonuses.splice(+el.dataset.i, 1); renderItemForm(m); },
  itemAdvAdd() { const m = itemCapture(); actions._itemAdv.push("save.all"); renderItemForm(m); },
  itemAdvRemove(el) { const m = itemCapture(); actions._itemAdv.splice(+el.dataset.i, 1); renderItemForm(m); },
  itemSave() {
    const ch = Store.active(); const cap = itemCapture(); const name = (cap.name || "").trim(); if (!name) { toast("Name required."); return; }
    const bonuses = actions._itemBonuses
      .filter((b) => b.target && b.value !== "" && b.value != null && !isNaN(+b.value))
      .map((b) => ({ target: b.target, value: +b.value }));
    const adv = [...new Set(actions._itemAdv.filter(Boolean))];
    const data = { name, qty: +cap.qty || 1, equipped: !!cap.equipped, bonuses, adv };
    const ed = actions._itemEditId ? ch.inventory.find((x) => x.id === actions._itemEditId) : null;
    if (ed) Object.assign(ed, data); else ch.inventory.push({ id: Gx.uid(), notes: "", acBonus: 0, ...data });
    actions._itemEditId = null; actions._itemBonuses = []; actions._itemAdv = []; closeModal(); commit();
  },
  equip(el) { const ch = Store.active(); const it = ch.inventory.find((x) => x.id === el.dataset.id); it.equipped = !it.equipped; commit(); },
  itemDel(el) { const ch = Store.active(); ch.inventory = ch.inventory.filter((x) => x.id !== el.dataset.id); closeModal(); commit(); toast("Item deleted."); },

  /* weapons & attacks */
  addWeapon() { weaponForm(null); },
  weaponOpen(el) {
    const ch = Store.active(); const i = +el.dataset.i; const w = ch.weapons[i];
    const wAtkBon = Calc.featBonus(ch, "weaponAttack"), wDmgBon = Calc.featBonus(ch, "weaponDamage");
    const atk = (w.atk !== "" && w.atk != null) ? +w.atk + wAtkBon : null;
    modal(w.name, `
      <p class="muted small">${w.damage ? esc(w.damage) + (wDmgBon ? " " + sign(wDmgBon) : "") + (w.damageType ? " " + esc(w.damageType) : "") + " damage" : "no damage set"}${w.notes ? " · " + esc(w.notes) : ""}${(wAtkBon || wDmgBon) ? ` <span class="feat-incl">(incl. features)</span>` : ""}</p>
      <div class="cast-box">
        <div class="cast-roll">
          ${atk != null ? `<span class="atk-group"><button class="btn small-b" data-act="wpnAtk" data-i="${i}" data-mode="dis">dis</button><button class="btn" data-act="wpnAtk" data-i="${i}" data-mode="normal">🎲 Attack ${sign(atk)}</button><button class="btn small-b" data-act="wpnAtk" data-i="${i}" data-mode="adv">adv</button></span>` : '<span class="muted small">no to-hit set</span>'}
        </div>
        ${w.damage ? `<button class="btn primary" data-act="wpnDmg" data-i="${i}">Roll damage (${esc(w.damage)})</button>` : ""}
        <div id="roll-out" class="roll-out"></div>
        <div class="wpn-opts-row"><button class="opt-btn" data-act="weaponOptions" data-i="${i}">⋯ Edit / Delete</button></div>
      </div>`);
  },
  weaponOptions(el) { const w = Store.active().weapons[+el.dataset.i]; optionsMenu(w ? w.name : "Weapon", "weapon", `data-i="${el.dataset.i}"`); },
  wpnAtk(el) { const ch = Store.active(); const w = ch.weapons[+el.dataset.i]; const r = d20(+w.atk + Calc.featBonus(ch, "weaponAttack"), el.dataset.mode || "normal"); const pair = r.mode !== "normal" ? `[${r.a},${r.b}]→` : ""; $("#roll-out").innerHTML = `Attack: <b>${r.total}</b> <small>(${r.mode === "adv" ? "adv " : r.mode === "dis" ? "dis " : ""}d20 ${pair}${r.nat}${r.crit ? " — CRIT!" : r.fumble ? " — miss" : ""} ${sign(r.mod)})</small>`; },
  wpnDmg(el) { const ch = Store.active(); const w = ch.weapons[+el.dataset.i]; const r = rollDice(w.damage); if (!r) { toast("Damage like 1d8+3."); return; } const bonus = Calc.featBonus(ch, "weaponDamage"); const total = r.total + bonus; $("#roll-out").innerHTML = `Damage <b>${total}</b> <small>[${r.rolls.join(", ")}]${r.mod ? " " + sign(r.mod) : ""}${bonus ? " " + sign(bonus) + " feat" : ""} ${esc(w.damageType || "")}</small>`; },
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
        <button class="btn ghost" data-act="linkOpen">${ch.link ? "🔗 Linked — manage sharing" : "🔗 Link with another player"}</button>
        <button class="btn ghost" data-act="exportChar">⬇ Export character (backup / share)</button>
        <button class="btn ghost" data-act="renameChar">✎ Rename</button>
        <button class="btn ghost" data-act="manageClasses">⚔ Classes &amp; levels</button>
        <button class="btn danger" data-act="deleteChar">🗑 Delete character</button>
      </div>`);
  },
  exportChar() { Gx.exportCharacter(Store.active()); closeModal(); toast("Exported. Keep it as a backup or send it to share."); },
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
  deleteChar() { const ch = Store.active(); if (confirm(`Delete ${ch.name}? This can't be undone (export first to keep a copy).`)) { Store.remove(ch.id); closeModal(); ui.screen = "home"; render(); } },

  importFile() { const inp = document.createElement("input"); inp.type = "file"; inp.accept = "application/json,.json"; inp.onchange = () => { const f = inp.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => { try { importCharacter(JSON.parse(r.result)); ui.screen = "sheet"; ui.tab = "stats"; render(); toast("Character imported."); } catch (e) { toast("Couldn't read that file."); } }; r.readAsText(f); }; inp.click(); },

  closeModal() { closeModal(); },
};

/* ---------- shared action helpers ---------- */
function toggleList(list, id) { const ch = Store.active(); const arr = ch.spells[list]; const i = arr.indexOf(id); if (i >= 0) arr.splice(i, 1); else arr.push(id); commit(); }
function rollHitDie(die) {
  const ch = Store.active(); const c = ch.combat; const con = Calc.abilityMod(ch, "con");
  const roll = rollDice(`1d${die}`); const heal = Math.max(1, roll.total + con);
  c.hitDiceUsed++; c.hpCur = Math.min(Calc.maxHP(ch), c.hpCur + heal); commit();
  toast(`Hit die d${die} rolled ${roll.total} ${sign(con)} CON = healed ${heal}.`);
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
    <button class="btn ghost" data-act="${kind}Edit" ${dataAttr}>✎ Edit</button>
    <button class="btn danger" data-act="${kind}Del" ${dataAttr}>🗑 Delete</button>
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
      <button class="opt-btn" data-act="${prefix}BonusRemove" data-i="${i}">✕</button>
    </div>`).join("");
}
function advRowsHtml(list, prefix) {
  return list.map((t, i) => `
    <div class="adv-row">
      <select>${ADV_TARGETS.map(([v, l]) => `<option value="${v}" ${t === v ? "selected" : ""}>${l}</option>`).join("")}</select>
      <button class="opt-btn" data-act="${prefix}AdvRemove" data-i="${i}">✕</button>
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

function itemForm(it) {
  actions._itemEditId = it ? it.id : null;
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
function openSpell(ch, id) {
  const s = findSpell(ch, id); if (!s) return;
  const comp = [s.components?.v && "V", s.components?.s && "S", s.components?.m && "M"].filter(Boolean).join(", ") || "—";
  const dc = Calc.spellSaveDC(ch), atk = Calc.spellAttack(ch);
  const prefill = dmgMemory()[id] || s.damage || "";
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
      <div class="sp-desc"><p>${mdToHtml(s.desc)}</p></div>
      ${s.higher_level ? `<div class="sp-higher"><b>At higher levels.</b> ${mdToHtml(s.higher_level)}</div>` : ""}
      <div class="cast-box">
        <div class="cast-roll">
          ${s.attack && atk != null ? `<span class="atk-group"><button class="btn small-b" data-act="castAttack" data-atk="${atk}" data-mode="dis">dis</button><button class="btn" data-act="castAttack" data-atk="${atk}" data-mode="normal">🎲 Attack ${sign(atk)}</button><button class="btn small-b" data-act="castAttack" data-atk="${atk}" data-mode="adv">adv</button></span>` : ""}
          ${s.save ? `<span class="save-pill">Save: ${esc(s.save.toUpperCase())} vs DC ${dc}</span>` : ""}
        </div>
        <div class="dmg-roll">
          <input id="dmg-expr" placeholder="damage e.g. 8d6" value="${esc(prefill)}">
          <button class="btn" data-act="castDamage" data-id="${esc(id)}">Roll</button>
        </div>
        ${s.damageType ? `<p class="muted small dmg-type">${esc(s.damageType)} damage${s.upcast ? " · upcasts automatically" : ""}</p>` : ""}
        <div id="roll-out" class="roll-out"></div>
        ${s.level > 0 && Calc.isCaster(ch) ? `<button class="btn primary" data-act="castSpell" data-id="${esc(id)}" data-lvl="${s.level}">Cast (spend a slot)</button>` : ""}
        ${s.concentration ? `<button class="btn ghost" data-act="startConc" data-id="${esc(id)}">Concentrate</button>` : ""}
      </div>
    </div>`);
}
actions.castAttack = (el) => { const r = d20(+el.dataset.atk, el.dataset.mode || "normal"); const pair = r.mode !== "normal" ? `[${r.a},${r.b}]→` : ""; $("#roll-out").innerHTML = `Attack: <b>${r.total}</b> <small>(${r.mode === "adv" ? "adv " : r.mode === "dis" ? "dis " : ""}d20 ${pair}${r.nat}${r.crit ? " — CRIT!" : r.fumble ? " — miss" : ""} ${sign(r.mod)})</small>`; };

/* concentration: prompt a CON save when a concentrating caster takes damage (DC = max 10, half damage) */
function maybeConcentration(ch, dmg) {
  if (!dmg || !ch.spells.concentratingOn) return;
  const dc = Math.max(10, Math.floor(dmg / 2));
  const sp = findSpell(ch, ch.spells.concentratingOn);
  const bonus = Calc.saveBonus(ch, "con");
  const adv = [...Calc.advSources(ch, "save.con"), ...Calc.advSources(ch, "save.concentration")];
  const hasAdv = adv.length > 0;
  modal("Concentration check", `
    <p>Took <b>${dmg}</b> damage while concentrating on <b>${esc(sp?.name || "a spell")}</b>.</p>
    <p>Constitution save vs <b>DC ${dc}</b>.</p>
    ${hasAdv ? `<p class="muted small">✨ Advantage from: ${[...new Set(adv)].map(esc).join(", ")}</p>` : ""}
    <div id="conc-out" class="roll-out"></div>
    <div class="modal-btns">
      <button class="btn small-b" data-act="concRoll" data-dc="${dc}" data-mode="dis">dis</button>
      <button class="btn ${hasAdv ? "" : "primary"}" data-act="concRoll" data-dc="${dc}" data-mode="normal">Roll CON ${sign(bonus)}</button>
      <button class="btn ${hasAdv ? "primary" : "small-b"}" data-act="concRoll" data-dc="${dc}" data-mode="adv">adv</button>
    </div>`);
}
actions.concRoll = (el) => {
  const ch = Store.active(); const dc = +el.dataset.dc; const bonus = Calc.saveBonus(ch, "con");
  const r = d20(bonus, el.dataset.mode); const pass = r.total >= dc;
  $("#conc-out").innerHTML = `Rolled <b>${r.total}</b> (d20 ${r.nat} ${sign(bonus)}) vs DC ${dc} — ${pass ? '<span class="held">held!</span>' : '<span class="lost">concentration lost</span>'}`;
  if (!pass) { ch.spells.concentratingOn = null; Store.touch(); render(); }
};
actions.castDamage = (el) => { const expr = $("#dmg-expr").value.trim(); if (!expr) return; const r = rollDice(expr); if (!r) { toast("Use a form like 8d6 or 2d6+3."); return; } setDmgMemory(el.dataset.id, expr); $("#roll-out").innerHTML = `Damage <b>${r.total}</b> <small>[${r.rolls.join(", ")}]${r.mod ? " " + sign(r.mod) : ""}</small>`; };
actions.castSpell = (el) => {
  const ch = Store.active(); const min = +el.dataset.lvl; const slots = Calc.spellSlots(ch);
  const avail = []; for (let i = min; i <= 9; i++) if (slots[i].max - slots[i].used > 0) avail.push(i);
  if (!avail.length) { toast("No slots of level " + min + "+ left."); return; }
  if (avail.length === 1 || avail[0] > min) { spendSlot(avail[0]); return; }
  // offer upcast choice
  const out = $("#roll-out");
  out.innerHTML = `Cast at: ${avail.map((i) => `<button class="btn mini2" data-act="spend" data-lvl="${i}">L${i}</button>`).join(" ")}`;
};
actions.spend = (el) => spendSlot(+el.dataset.lvl);
function spendSlot(lvl) {
  const ch = Store.active(); ch.spells.slots[lvl].used++; Store.touch();
  // auto-swap the damage field to the upcast value for this slot level, if known
  const s = ui.openSpellId ? findSpell(ch, ui.openSpellId) : null;
  const dmgIn = $("#dmg-expr");
  if (s && s.upcast && s.upcast[lvl] && dmgIn) dmgIn.value = s.upcast[lvl];
  const out = $("#roll-out");
  if (out) out.innerHTML = `Cast — spent a level ${lvl} slot.${s && s.upcast && s.upcast[lvl] ? ` Damage set to <b>${esc(s.upcast[lvl])}</b>.` : (lvl > 1 ? " (upcast)" : "")}`;
  toast(`Spent a level ${lvl} slot.`);
}
actions.startConc = (el) => { const ch = Store.active(); const id = el.dataset.id; if (ch.spells.concentratingOn && ch.spells.concentratingOn !== id) { const prev = findSpell(ch, ch.spells.concentratingOn)?.name || "another spell"; if (!confirm(`You're already concentrating on ${prev}. Switch concentration?`)) return; } ch.spells.concentratingOn = id; commit(); closeModal(); toast("Now concentrating. If you take damage, a CON save (DC = max(10, half damage)) is prompted in Combat."); };

/* ---------- ability/save/skill check roller (with adv from features) ---------- */
function rollCheck(label, bonus, advList) {
  const hasAdv = advList && advList.length;
  modal(label, `
    ${hasAdv ? `<p class="muted small">✨ Advantage from: ${advList.map(esc).join(", ")}</p>` : ""}
    <div id="roll-out" class="roll-out">Roll ${esc(label)} (${sign(bonus)})</div>
    <div class="modal-btns">
      <button class="btn small-b" data-act="checkRoll" data-bonus="${bonus}" data-mode="dis" data-label="${esc(label)}">Disadv</button>
      <button class="btn ${hasAdv ? "" : "primary"}" data-act="checkRoll" data-bonus="${bonus}" data-mode="normal" data-label="${esc(label)}">Roll ${sign(bonus)}</button>
      <button class="btn ${hasAdv ? "primary" : ""}" data-act="checkRoll" data-bonus="${bonus}" data-mode="adv" data-label="${esc(label)}">Advantage</button>
    </div>`);
}
actions.checkRoll = (el) => {
  const r = d20(+el.dataset.bonus, el.dataset.mode); const pair = r.mode !== "normal" ? `[${r.a},${r.b}]→` : "";
  $("#roll-out").innerHTML = `${esc(el.dataset.label)}: <b>${r.total}</b> <small>(${r.mode === "adv" ? "adv " : r.mode === "dis" ? "dis " : ""}d20 ${pair}${r.nat}${r.crit ? " — 20!" : r.fumble ? " — 1" : ""} ${sign(r.mod)})</small>`;
};
actions.rollSave = (el) => { const ch = Store.active(); const ab = el.dataset.ab; rollCheck(RULES.ABILITY_NAMES[ab] + " save", Calc.saveBonus(ch, ab), Calc.advSources(ch, "save." + ab)); };
actions.rollSkill = (el) => { const ch = Store.active(); const s = el.dataset.skill; rollCheck(s + " check", Calc.skillBonus(ch, s), Calc.advSources(ch, "skill." + s)); };

/* ===================================================================== */
/*  WIRING                                                               */
/* ===================================================================== */
document.addEventListener("click", (e) => {
  const t = e.target.closest("[data-act]"); if (!t) return;
  const fn = actions[t.dataset.act]; if (fn) { e.preventDefault(); fn(t); }
});
document.addEventListener("input", (e) => {
  const t = e.target.closest("[data-bind]"); if (!t) return;
  const ch = Store.active(); if (!ch) return;
  let v = t.type === "checkbox" ? t.checked : t.value;
  if (t.type === "number") v = (t.value === "" ? (t.dataset.bind === "combat.armorBaseAC" ? null : 0) : Number(t.value));
  setPath(ch, t.dataset.bind, v); Store.touch(); if (window.LINK) LINK.schedulePush(ch);
  // live-update small computed readouts without rebuilding inputs
  if (t.dataset.bind.startsWith("abilities.")) { const card = t.closest(".ab-card"); if (card) card.querySelector(".ab-mod").textContent = sign(Calc.abilityMod(ch, t.dataset.bind.split(".")[1])); }
});
document.addEventListener("change", (e) => {
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
  if (["combat.hpMax", "combat.armorBaseAC", "combat.shield"].includes(t.dataset.bind)) render();
});

/* boot */
if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("sw.js?v=24").catch(() => {}));
(async function boot() {
  Store.load();
  Party.load();
  try { await loadSpells(); } catch (e) { toast("Spell data offline — connect once to install."); }
  if (Store.active()) { ui.screen = "sheet"; }
  render();
  if (window.LINK) LINK.afterBoot();
})();
