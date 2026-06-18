/* Grimoire — app shell, screens, and all interaction.
   Vanilla JS. State lives in Store (state.js); derived numbers in Calc (calc.js);
   static 5e data in RULES (rules.js). Full SRD spell lists are loaded from data/. */
"use strict";

const Grimoire = { spells: { "2014": [], "2024": [] } };
const ui = { screen: "home", tab: "stats", spellFilter: { q: "", level: "all", list: "available" } };
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

/* ---------- spell data ---------- */
async function loadSpells() {
  const [a, b] = await Promise.all([
    fetch("data/spells-2014.json?v=5").then((r) => r.json()),
    fetch("data/spells-2024.json?v=5").then((r) => r.json()),
  ]);
  Grimoire.spells["2014"] = a; Grimoire.spells["2024"] = b;
}
function spellPool(ch) { return [...(Grimoire.spells[ch.edition] || []), ...(ch.customSpells || [])]; }
function findSpell(ch, id) { return spellPool(ch).find((s) => s.id === id); }
function classSpells(ch) {
  return spellPool(ch).filter((s) => s.custom || (s.classes || []).some((c) => c.toLowerCase() === ch.cls.toLowerCase()));
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

/* ---------- persistence helper ---------- */
function commit(rerender = true) { Store.touch(); if (rerender) render(); }
function setPath(obj, path, val) { const k = path.split("."); let o = obj; for (let i = 0; i < k.length - 1; i++) o = o[k[i]]; o[k[k.length - 1]] = val; }
function getPath(obj, path) { return path.split(".").reduce((o, k) => (o == null ? o : o[k]), obj); }

/* ===================================================================== */
/*  SCREENS                                                              */
/* ===================================================================== */
function render() {
  const app = $("#app");
  if (ui.screen === "home") app.innerHTML = viewHome();
  else if (ui.screen === "new") app.innerHTML = viewNew();
  else if (ui.screen === "sheet") app.innerHTML = viewSheet(Store.active());
}

/* ---- Home ---- */
function viewHome() {
  const list = Store.characters.map((c) => `
    <button class="char-card" data-act="open" data-id="${c.id}">
      <div class="cc-main"><span class="cc-name">${esc(c.name)}</span>
        <span class="cc-sub">${esc(c.cls)} · level ${c.level} · ${c.edition}</span></div>
      <span class="cc-go">›</span>
    </button>`).join("");
  return `
    <header class="topbar"><img src="icons/icon-192.png" class="logo" alt=""><h1>Grimoire</h1></header>
    <div class="screen">
      ${Store.characters.length ? `<div class="char-list">${list}</div>` : `<p class="empty">No characters yet. Create your first adventurer.</p>`}
      <div class="home-actions">
        <button class="btn primary" data-act="goNew">+ New character</button>
        <button class="btn ghost" data-act="importFile">⬆ Import from file</button>
      </div>
    </div>`;
}

/* ---- New character ---- */
function viewNew() {
  const classes = Object.keys(RULES.CLASSES).map((c) => `<option>${c}</option>`).join("");
  return `
    <header class="topbar"><button class="back" data-act="goHome">‹</button><h1>New character</h1></header>
    <div class="screen form">
      <label class="fld"><span>Name</span><input id="f-name" type="text" placeholder="e.g. Lyra Moonwhisper"></label>
      <label class="fld"><span>Ruleset</span>
        <select id="f-ed">
          <option value="2014">2014 (SRD 5.1)</option>
          <option value="2024">2024 (SRD 5.2)</option>
        </select>
      </label>
      <label class="fld"><span>Class</span><select id="f-cls">${classes}</select></label>
      <label class="fld"><span>Level</span><input id="f-lvl" type="number" min="1" max="20" value="1"></label>
      <fieldset class="abilities-new">
        <legend>Ability scores</legend>
        ${RULES.ABILITIES.map((a) => `<label class="ab"><span>${a.toUpperCase()}</span><input id="f-${a}" type="number" min="1" max="30" value="10"></label>`).join("")}
      </fieldset>
      <button class="btn primary big" data-act="createChar">Create</button>
    </div>`;
}

/* ---- Sheet (tabbed) ---- */
function viewSheet(ch) {
  if (!ch) { ui.screen = "home"; return viewHome(); }
  const tabs = [["stats", "Stats"], ["combat", "Combat"], ["spells", "Spells"], ["gear", "Gear"], ["notes", "Notes"]];
  let body = "";
  if (ui.tab === "stats") body = tabStats(ch);
  else if (ui.tab === "combat") body = tabCombat(ch);
  else if (ui.tab === "spells") body = tabSpells(ch);
  else if (ui.tab === "gear") body = tabGear(ch);
  else if (ui.tab === "notes") body = tabNotes(ch);
  return `
    <header class="topbar sheet">
      <button class="back" data-act="goHome">‹</button>
      <div class="sheet-id"><span class="s-name">${esc(ch.name)}</span><span class="s-sub">${esc(ch.cls)} · lvl ${ch.level} · ${ch.edition}</span></div>
      <button class="kebab" data-act="charMenu">⋯</button>
    </header>
    <div class="screen tabbed">${body}</div>
    <nav class="tabbar">${tabs.map(([k, l]) => `<button class="tab ${ui.tab === k ? "on" : ""}" data-act="tab" data-tab="${k}">${l}</button>`).join("")}</nav>`;
}

/* derived-value chip that opens an override editor on tap */
function statChip(ch, key, label, value, opts = {}) {
  const overridden = ch.overrides && ch.overrides[key] != null && ch.overrides[key] !== "";
  return `<button class="chip ${overridden ? "ovr" : ""}" data-act="override" data-key="${key}" data-label="${esc(label)}" data-auto="${opts.auto ?? ""}">
      <span class="chip-v">${esc(value)}</span><span class="chip-l">${esc(label)}</span>${overridden ? '<span class="ov-dot" title="manual override">✎</span>' : ""}
    </button>`;
}

function tabStats(ch) {
  const ab = RULES.ABILITIES.map((a) => `
    <div class="ab-card">
      <span class="ab-name">${a.toUpperCase()}</span>
      <input class="ab-score" type="number" min="1" max="30" data-bind="abilities.${a}" value="${ch.abilities[a]}">
      <span class="ab-mod">${sign(Calc.abilityMod(ch, a))}</span>
    </div>`).join("");
  const saves = RULES.ABILITIES.map((a) => `
    <button class="line" data-act="toggleSave" data-ab="${a}">
      <span class="dot ${ch.saveProf[a] ? "on" : ""}"></span>
      <span class="line-l">${RULES.ABILITY_NAMES[a]}</span>
      <span class="line-v" data-act="override" data-key="save.${a}" data-label="${RULES.ABILITY_NAMES[a]} save" data-auto="${Calc.saveBonus(ch, a)}">${sign(Calc.saveBonus(ch, a))}</span>
    </button>`).join("");
  const skills = Object.keys(RULES.SKILLS).map((s) => {
    const p = ch.skillProf[s] || 0;
    return `<button class="line" data-act="cycleSkill" data-skill="${esc(s)}">
      <span class="dot ${p === 1 ? "on" : ""} ${p === 2 ? "exp" : ""}"></span>
      <span class="line-l">${s} <em>${RULES.SKILLS[s].toUpperCase()}</em></span>
      <span class="line-v">${sign(Calc.skillBonus(ch, s))}</span></button>`;
  }).join("");
  return `
    <div class="row-chips">
      ${statChip(ch, "prof", "Prof. bonus", sign(Calc.prof(ch)), { auto: RULES.profBonus(ch.level) })}
      ${statChip(ch, "passivePerception", "Passive Perc.", Calc.passivePerception(ch))}
      ${statChip(ch, "initiative", "Initiative", sign(Calc.initiative(ch)))}
    </div>
    <div class="abilities">${ab}</div>
    <h3 class="sec">Saving throws <small>tap dot = proficient</small></h3>
    <div class="lines">${saves}</div>
    <h3 class="sec">Skills <small>tap dot: none → proficient → expertise</small></h3>
    <div class="lines">${skills}</div>`;
}

function tabCombat(ch) {
  const c = ch.combat;
  const cond = (ch.conditions || []).map((x, i) => `
    <span class="cond">${esc(x.name)}${x.rounds != null ? ` <b>${x.rounds}r</b>` : ""}
      <button data-act="condTick" data-i="${i}" title="-1 round">−</button>
      <button data-act="condRemove" data-i="${i}">✕</button></span>`).join("") || `<span class="muted">none</span>`;
  const res = (ch.resources || []).map((r) => `
    <div class="res">
      <div class="res-top"><span>${esc(r.name)}</span><span class="muted">${r.max - r.used}/${r.max} · ${r.resetOn} rest</span></div>
      <div class="res-btns">
        <button data-act="resUse" data-id="${r.id}">Use</button>
        <button data-act="resRestore" data-id="${r.id}">+</button>
        <button class="del" data-act="resDel" data-id="${r.id}">✕</button>
      </div>
    </div>`).join("");
  const conc = ch.spells.concentratingOn ? (findSpell(ch, ch.spells.concentratingOn)?.name || "a spell") : null;
  return `
    <div class="combat-top">
      <div class="big-stat" data-act="override" data-key="ac" data-label="Armor Class" data-auto="${Calc.armorClass(ch)}"><b>${Calc.armorClass(ch)}</b><span>AC</span></div>
      <div class="big-stat"><b>${sign(Calc.initiative(ch))}</b><span>Init</span></div>
      <div class="big-stat" data-act="override" data-key="speed" data-label="Speed" data-auto="${Calc.speed(ch)}"><b>${Calc.speed(ch)}</b><span>Speed</span></div>
    </div>
    <div class="hp-block">
      <div class="hp-row"><span>Hit points</span>
        <span class="hp-now">${c.hpCur}<small>/${c.hpMax}</small>${c.hpTemp ? ` <em class="temp">+${c.hpTemp}</em>` : ""}</span></div>
      <div class="hp-btns">
        <button data-act="hp" data-d="-5">−5</button><button data-act="hp" data-d="-1">−1</button>
        <button data-act="hp" data-d="1">+1</button><button data-act="hp" data-d="5">+5</button>
        <button data-act="hpEdit">edit</button>
      </div>
      <div class="hp-sub">
        <label>Temp HP <input type="number" data-bind="combat.hpTemp" value="${c.hpTemp}"></label>
        <label>Max <input type="number" data-bind="combat.hpMax" value="${c.hpMax}"></label>
      </div>
    </div>
    <div class="death">
      <span>Death saves</span>
      <span class="ds">✓ ${[0,1,2].map((i)=>`<button class="pip ${c.death.succ>i?"on good":""}" data-act="death" data-t="succ" data-i="${i}"></button>`).join("")}</span>
      <span class="ds">✗ ${[0,1,2].map((i)=>`<button class="pip ${c.death.fail>i?"on bad":""}" data-act="death" data-t="fail" data-i="${i}"></button>`).join("")}</span>
    </div>
    <div class="hitdice">
      <span>Hit dice <b>${Math.max(0, ch.level - c.hitDiceUsed)}/${ch.level}</b> d${(RULES.CLASSES[ch.cls]||{}).hitDie || 8}</span>
      <button class="btn small-b" data-act="spendHitDie" ${ch.level - c.hitDiceUsed <= 0 ? "disabled" : ""}>Spend (heal)</button>
    </div>
    <div class="rest-row">
      <button class="btn" data-act="shortRest">Short rest</button>
      <button class="btn primary" data-act="longRest">Long rest</button>
    </div>
    ${conc ? `<div class="conc-banner">Concentrating on <b>${esc(conc)}</b> <button data-act="dropConc">drop</button></div>` : ""}
    <h3 class="sec">Conditions <button class="mini" data-act="addCond">+ add</button></h3>
    <div class="conds">${cond}</div>
    <h3 class="sec">Resource trackers <button class="mini" data-act="addRes">+ add</button></h3>
    <div class="reslist">${res || '<span class="muted">none — e.g. Rage, Ki, Channel Divinity</span>'}</div>`;
}

function tabSpells(ch) {
  if (!Calc.isCaster(ch) && !(ch.customSpells || []).length && !ch.spells.known.length) {
    return `<div class="caster-none">
      <p><b>${esc(ch.cls)}</b> isn't a spellcaster by default.</p>
      <p class="muted">You can still hand-add spells (racial, feats, items).</p>
      <button class="btn" data-act="addCustom">+ Add a spell</button></div>` + spellListSection(ch);
  }
  const dc = Calc.spellSaveDC(ch), atk = Calc.spellAttack(ch);
  const slots = Calc.spellSlots(ch), pact = Calc.pactMagic(ch);
  let slotHtml = "";
  for (let i = 1; i <= 9; i++) {
    if (!slots[i].max) continue;
    const pips = Array.from({ length: slots[i].max }, (_, k) => `<button class="slot ${k < slots[i].used ? "used" : ""}" data-act="slot" data-lvl="${i}" data-k="${k}"></button>`).join("");
    slotHtml += `<div class="slot-row"><span class="slvl" data-act="override" data-key="slotMax.${i}" data-label="Level ${i} slots" data-auto="${slots[i].max}">L${i}</span><span class="pips">${pips}</span></div>`;
  }
  if (pact) {
    const pips = Array.from({ length: pact.max }, (_, k) => `<button class="slot pact ${k < pact.used ? "used" : ""}" data-act="pactSlot" data-k="${k}"></button>`).join("");
    slotHtml += `<div class="slot-row"><span class="slvl">Pact L${pact.level}</span><span class="pips">${pips}</span><small class="muted">short rest</small></div>`;
  }
  const prep = Calc.preparedCount(ch);
  return `
    <div class="cast-head">
      <div class="big-stat"><b>${dc ?? "—"}</b><span>Save DC</span></div>
      <div class="big-stat"><b>${atk != null ? sign(atk) : "—"}</b><span>Spell atk</span></div>
      ${prep != null ? `<div class="big-stat" data-act="override" data-key="preparedCount" data-label="Prepared count" data-auto="${prep}"><b>${ch.spells.prepared.length}/${prep}</b><span>Prepared</span></div>` : ""}
    </div>
    <div class="slots">${slotHtml || '<p class="muted">No spell slots at this level.</p>'}</div>
    ${spellListSection(ch)}`;
}

function spellListSection(ch) {
  const f = ui.spellFilter;
  const lists = [["available", "Class list"], ["prepared", "Prepared"], ["known", "Known"], ["favorites", "★ Favorites"]];
  let pool;
  if (f.list === "available") pool = classSpells(ch);
  else pool = (ch.spells[f.list === "favorites" ? "favorites" : f.list] || []).map((id) => findSpell(ch, id)).filter(Boolean);
  if (f.q) pool = pool.filter((s) => s.name.toLowerCase().includes(f.q.toLowerCase()));
  if (f.level !== "all") pool = pool.filter((s) => String(s.level) === String(f.level));
  pool = pool.slice().sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
  const levels = `<option value="all">All levels</option>` + Array.from({ length: 10 }, (_, i) => `<option value="${i}" ${String(f.level) === String(i) ? "selected" : ""}>${i === 0 ? "Cantrips" : "Level " + i}</option>`).join("");
  const rows = pool.map((s) => spellRow(ch, s)).join("") || `<p class="muted pad">No spells. ${f.list === "available" ? "" : "Add some from the Class list."}</p>`;
  return `
    <h3 class="sec">Spellbook <button class="mini" data-act="addCustom">+ hand-add</button></h3>
    <div class="spell-filters">
      <div class="seg">${lists.map(([k, l]) => `<button class="${f.list === k ? "on" : ""}" data-act="spellList" data-list="${k}">${l}</button>`).join("")}</div>
      <div class="filter-row">
        <input class="search" type="search" placeholder="Search spells…" data-act="spellSearch" value="${esc(f.q)}">
        <select data-act="spellLevel">${levels}</select>
      </div>
    </div>
    <div class="spell-rows">${rows}</div>`;
}

function spellRow(ch, s) {
  const isFav = ch.spells.favorites.includes(s.id);
  const isPrep = ch.spells.prepared.includes(s.id);
  const isKnown = ch.spells.known.includes(s.id);
  const lvl = s.level === 0 ? "Cantrip" : "L" + s.level;
  const tags = [s.concentration ? "C" : "", s.ritual ? "R" : ""].filter(Boolean).join(" ");
  return `<div class="spell">
    <button class="spell-main" data-act="spellDetail" data-id="${esc(s.id)}">
      <span class="sp-name">${esc(s.name)} ${s.custom ? '<em class="hb">homebrew</em>' : ""}</span>
      <span class="sp-meta">${lvl} · ${esc(s.school)}${tags ? " · " + tags : ""}</span>
    </button>
    <div class="spell-acts">
      <button class="ic ${isFav ? "on" : ""}" data-act="fav" data-id="${esc(s.id)}" title="favorite">★</button>
      <button class="ic ${isPrep ? "on" : ""}" data-act="prep" data-id="${esc(s.id)}" title="prepared">P</button>
      <button class="ic ${isKnown ? "on" : ""}" data-act="know" data-id="${esc(s.id)}" title="known">K</button>
    </div>
  </div>`;
}

function tabGear(ch) {
  const inv = (ch.inventory || []).map((it) => `
    <div class="item">
      <button class="eq ${it.equipped ? "on" : ""}" data-act="equip" data-id="${it.id}" title="equipped (counts AC)">${it.equipped ? "✓" : ""}</button>
      <span class="it-name">${esc(it.name)}${it.acBonus ? ` <em>AC ${sign(+it.acBonus)}</em>` : ""}${it.qty > 1 ? ` ×${it.qty}` : ""}</span>
      <button class="del" data-act="itemDel" data-id="${it.id}">✕</button>
    </div>`).join("") || `<span class="muted">empty</span>`;
  return `
    <div class="armor-row">
      <label>Armor base AC <input type="number" placeholder="(unarmored)" data-bind="combat.armorBaseAC" value="${ch.combat.armorBaseAC ?? ""}"></label>
      <label class="chk"><input type="checkbox" data-bind="combat.shield" ${ch.combat.shield ? "checked" : ""}> Shield (+2)</label>
    </div>
    <p class="muted small">Equipped items with an AC bonus add to your AC automatically (now ${Calc.armorClass(ch)}).</p>
    <h3 class="sec">Inventory <button class="mini" data-act="addItem">+ add</button></h3>
    <div class="items">${inv}</div>`;
}

function tabNotes(ch) {
  return `<textarea class="notes" data-bind="notes" placeholder="Backstory, party, quests, session notes…">${esc(ch.notes)}</textarea>`;
}

/* ===================================================================== */
/*  ACTIONS                                                              */
/* ===================================================================== */
const actions = {
  goHome() { ui.screen = "home"; render(); },
  goNew() { ui.screen = "new"; render(); },
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

  /* combat */
  hp(el) { const ch = Store.active(); const d = +el.dataset.d; const c = ch.combat;
    if (d < 0 && c.hpTemp > 0) { const fromTemp = Math.min(c.hpTemp, -d); c.hpTemp -= fromTemp; const rest = -d - fromTemp; c.hpCur = Math.max(0, c.hpCur - rest); }
    else c.hpCur = Math.max(0, Math.min(c.hpMax, c.hpCur + d));
    commit();
    if (d < 0) maybeConcentration(ch, -d);
  },
  hpEdit() { const ch = Store.active(); modal("Set current HP", `<input id="hp-in" type="number" value="${ch.combat.hpCur}"><div class="modal-btns"><button class="btn primary" data-act="hpSet">Set</button></div>`, () => $("#hp-in").focus()); },
  hpSet() { const ch = Store.active(); const prev = ch.combat.hpCur; const next = Math.max(0, Math.min(ch.combat.hpMax, +$("#hp-in").value || 0)); ch.combat.hpCur = next; closeModal(); commit(); if (next < prev) maybeConcentration(ch, prev - next); },
  death(el) { const ch = Store.active(); const t = el.dataset.t, i = +el.dataset.i; const cur = ch.combat.death[t]; ch.combat.death[t] = cur > i ? i : i + 1; commit(); },

  shortRest() { const ch = Store.active(); const p = Calc.pactMagic(ch); if (p) ch.spells.pact.used = 0; (ch.resources || []).forEach((r) => { if (r.resetOn === "short") r.used = 0; }); commit(); toast("Short rest — pact slots & short-rest resources restored. Spend hit dice to heal."); },
  spendHitDie() { const ch = Store.active(); const c = ch.combat; if (ch.level - c.hitDiceUsed <= 0) { toast("No hit dice left."); return; } const die = (RULES.CLASSES[ch.cls] || {}).hitDie || 8; const con = Calc.abilityMod(ch, "con"); const roll = rollDice(`1d${die}`); const heal = Math.max(1, roll.total + con); c.hitDiceUsed++; c.hpCur = Math.min(c.hpMax, c.hpCur + heal); commit(); toast(`Hit die: d${die} rolled ${roll.total} ${sign(con)} CON = healed ${heal}.`); },
  longRest() { const ch = Store.active(); const c = ch.combat;
    c.hpCur = c.hpMax; c.hpTemp = 0; c.death = { succ: 0, fail: 0 };
    c.hitDiceUsed = Math.max(0, c.hitDiceUsed - Math.max(1, Math.floor(ch.level / 2)));
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
      <label class="fld"><span>Duration (rounds, optional)</span><input id="cond-rounds" type="number" min="1" placeholder="∞"></label>
      <div class="modal-btns"><button class="btn primary" data-act="condAdd">Add</button></div>`);
  },
  condAdd() { const ch = Store.active(); const r = $("#cond-rounds").value; ch.conditions.push({ name: $("#cond-name").value, rounds: r ? +r : null }); closeModal(); commit(); },
  condTick(el) { const ch = Store.active(); const i = +el.dataset.i; const c = ch.conditions[i]; if (c.rounds != null) { c.rounds -= 1; if (c.rounds <= 0) ch.conditions.splice(i, 1); } commit(); },
  condRemove(el) { const ch = Store.active(); ch.conditions.splice(+el.dataset.i, 1); commit(); },

  /* resources */
  addRes() { modal("Add resource tracker", `
      <label class="fld"><span>Name</span><input id="res-name" placeholder="e.g. Rage, Ki, Channel Divinity"></label>
      <label class="fld"><span>Max uses</span><input id="res-max" type="number" min="1" value="3"></label>
      <label class="fld"><span>Resets on</span><select id="res-reset"><option value="long">Long rest</option><option value="short">Short rest</option></select></label>
      <div class="modal-btns"><button class="btn primary" data-act="resAdd">Add</button></div>`, () => $("#res-name").focus()); },
  resAdd() { const ch = Store.active(); const name = $("#res-name").value.trim(); if (!name) return closeModal(); ch.resources.push({ id: Gx.uid(), name, max: +$("#res-max").value || 1, used: 0, resetOn: $("#res-reset").value }); closeModal(); commit(); },
  resUse(el) { const ch = Store.active(); const r = ch.resources.find((x) => x.id === el.dataset.id); if (r && r.used < r.max) r.used++; commit(); },
  resRestore(el) { const ch = Store.active(); const r = ch.resources.find((x) => x.id === el.dataset.id); if (r && r.used > 0) r.used--; commit(); },
  resDel(el) { const ch = Store.active(); ch.resources = ch.resources.filter((x) => x.id !== el.dataset.id); commit(); },

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
  addItem() { modal("Add item", `
      <label class="fld"><span>Name *</span><input id="it-name"></label>
      <div class="grid2">
        <label class="fld"><span>Quantity</span><input id="it-qty" type="number" min="1" value="1"></label>
        <label class="fld"><span>AC bonus (if any)</span><input id="it-ac" type="number" placeholder="0"></label>
      </div>
      <label class="chk"><input type="checkbox" id="it-eq"> Equipped (count AC bonus)</label>
      <div class="modal-btns"><button class="btn primary" data-act="itemSave">Add</button></div>`, () => $("#it-name").focus()); },
  itemSave() { const ch = Store.active(); const name = $("#it-name").value.trim(); if (!name) return closeModal(); ch.inventory.push({ id: Gx.uid(), name, qty: +$("#it-qty").value || 1, acBonus: +$("#it-ac").value || 0, equipped: $("#it-eq").checked, notes: "" }); closeModal(); commit(); },
  equip(el) { const ch = Store.active(); const it = ch.inventory.find((x) => x.id === el.dataset.id); it.equipped = !it.equipped; commit(); },
  itemDel(el) { const ch = Store.active(); ch.inventory = ch.inventory.filter((x) => x.id !== el.dataset.id); commit(); },

  /* concentration */
  dropConc() { const ch = Store.active(); ch.spells.concentratingOn = null; commit(); },

  /* char menu */
  charMenu() {
    const ch = Store.active();
    modal(ch.name, `
      <div class="menu-list">
        <button class="btn ghost" data-act="exportChar">⬇ Export character (backup / share)</button>
        <button class="btn ghost" data-act="renameChar">✎ Rename</button>
        <button class="btn ghost" data-act="setLevel">Level: ${ch.level} (change)</button>
        <button class="btn danger" data-act="deleteChar">🗑 Delete character</button>
      </div>
      <p class="muted small">Linking with another player (cloud sync) is coming next.</p>`);
  },
  exportChar() { Gx.exportCharacter(Store.active()); closeModal(); toast("Exported. Keep it as a backup or send it to share."); },
  renameChar() { const ch = Store.active(); modal("Rename", `<input id="rn" value="${esc(ch.name)}"><div class="modal-btns"><button class="btn primary" data-act="renameSave">Save</button></div>`, () => $("#rn").focus()); },
  renameSave() { const ch = Store.active(); ch.name = $("#rn").value.trim() || ch.name; closeModal(); commit(); },
  setLevel() { const ch = Store.active(); modal("Level", `<input id="lv" type="number" min="1" max="20" value="${ch.level}"><div class="modal-btns"><button class="btn primary" data-act="levelSave">Save</button></div>`); },
  levelSave() { const ch = Store.active(); ch.level = Math.max(1, Math.min(20, +$("#lv").value || ch.level)); closeModal(); commit(); },
  deleteChar() { const ch = Store.active(); if (confirm(`Delete ${ch.name}? This can't be undone (export first to keep a copy).`)) { Store.remove(ch.id); closeModal(); ui.screen = "home"; render(); } },

  importFile() { const inp = document.createElement("input"); inp.type = "file"; inp.accept = "application/json,.json"; inp.onchange = () => { const f = inp.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => { try { importCharacter(JSON.parse(r.result)); ui.screen = "sheet"; ui.tab = "stats"; render(); toast("Character imported."); } catch (e) { toast("Couldn't read that file."); } }; r.readAsText(f); }; inp.click(); },

  closeModal() { closeModal(); },
};

function toggleList(list, id) { const ch = Store.active(); const arr = ch.spells[list]; const i = arr.indexOf(id); if (i >= 0) arr.splice(i, 1); else arr.push(id); commit(); }
function spellListRowsHtml(ch) {
  const f = ui.spellFilter; let pool = f.list === "available" ? classSpells(ch) : (ch.spells[f.list] || []).map((id) => findSpell(ch, id)).filter(Boolean);
  if (f.q) pool = pool.filter((s) => s.name.toLowerCase().includes(f.q.toLowerCase()));
  if (f.level !== "all") pool = pool.filter((s) => String(s.level) === String(f.level));
  pool.sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
  return pool.map((s) => spellRow(ch, s)).join("") || `<p class="muted pad">No spells.</p>`;
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
  modal("Concentration check", `
    <p>Took <b>${dmg}</b> damage while concentrating on <b>${esc(sp?.name || "a spell")}</b>.</p>
    <p>Constitution save vs <b>DC ${dc}</b>.</p>
    <div id="conc-out" class="roll-out"></div>
    <div class="modal-btns">
      <button class="btn small-b" data-act="concRoll" data-dc="${dc}" data-mode="dis">dis</button>
      <button class="btn primary" data-act="concRoll" data-dc="${dc}" data-mode="normal">Roll CON ${sign(bonus)}</button>
      <button class="btn small-b" data-act="concRoll" data-dc="${dc}" data-mode="adv">adv</button>
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
  setPath(ch, t.dataset.bind, v); Store.touch();
  // live-update small computed readouts without rebuilding inputs
  if (t.dataset.bind.startsWith("abilities.")) { const card = t.closest(".ab-card"); if (card) card.querySelector(".ab-mod").textContent = sign(Calc.abilityMod(ch, t.dataset.bind.split(".")[1])); }
});
document.addEventListener("change", (e) => {
  const t = e.target.closest("[data-bind]"); if (!t) return;
  if (t.tagName === "TEXTAREA") return; // don't yank focus from notes
  if (["combat.hpMax", "combat.armorBaseAC", "combat.shield"].includes(t.dataset.bind)) render();
});

/* boot */
if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("sw.js?v=5").catch(() => {}));
(async function boot() {
  Store.load();
  try { await loadSpells(); } catch (e) { toast("Spell data offline — connect once to install."); }
  if (Store.active()) { ui.screen = "sheet"; }
  render();
})();
