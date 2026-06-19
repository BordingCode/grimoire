/* Grimoire — rendering layer. Pure view functions that turn state into HTML.
   Reads RULES/Calc/Store/Grimoire/ui + util helpers; never mutates state.
   Behaviour (actions, forms, wiring) lives in app.js. */
"use strict";

/* ---------- read-only spell helpers ---------- */
function spellPool(ch) { return [...(Grimoire.spells[ch.edition] || []), ...(ch.customSpells || [])]; }
function findSpell(ch, id) { return spellPool(ch).find((s) => s.id === id); }
function classSpells(ch) {
  const names = Calc.classList(ch).map((c) => c.cls.toLowerCase());
  return spellPool(ch).filter((s) => s.custom || (s.classes || []).some((c) => names.includes(c.toLowerCase())));
}
function classSummary(ch) {
  const list = Calc.classList(ch);
  if (list.length <= 1) return ch.cls;
  return list.map((c) => `${c.cls} ${c.level}`).join(" / ");
}
// spells granted by the chosen subclass at the character's level (SRD subclasses only)
function subclassSpells(ch) {
  const sub = ch.subclass; if (!sub) return [];
  let table = null, lvl = 0;
  for (const c of Calc.classList(ch)) { const m = RULES.SUBCLASSES[c.cls]; if (m && m[sub]) { table = m[sub]; lvl = c.level; break; } }
  if (!table) return [];
  const names = [];
  Object.keys(table).forEach((t) => { if (+t <= lvl) names.push(...table[t]); });
  const pool = spellPool(ch);
  return names.map((n) => pool.find((s) => s.name.toLowerCase() === n.toLowerCase())).filter(Boolean);
}
function subclassSpellIdSet(ch) { return new Set(subclassSpells(ch).map((s) => s.id)); }

/* feature auto-bonus targets (also used by app.js featureForm) */
const FEAT_TARGETS = [
  ["ac", "Armor Class"],
  ["weaponAttack", "All weapon attack rolls"],
  ["weaponDamage", "All weapon damage rolls"],
  ["initiative", "Initiative"], ["speed", "Speed (ft)"],
  ["save.all", "All saving throws"],
  ["save.str", "STR saves"], ["save.dex", "DEX saves"], ["save.con", "CON saves"],
  ["save.int", "INT saves"], ["save.wis", "WIS saves"], ["save.cha", "CHA saves"],
  ["spellDC", "Spell save DC"], ["spellAttack", "Spell attack"],
  ["passivePerception", "Passive Perception"], ["hpMax", "Max HP"],
  ["skill.all", "All skill checks"],
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => ["slot." + n, `Extra level-${n} spell slot`]),
  ...Object.keys(RULES.SKILLS).map((s) => ["skill." + s, s + " (skill)"]),
];
const FEAT_TARGET_LABEL = Object.fromEntries(FEAT_TARGETS);

/* ===================================================================== */
/*  SCREENS                                                              */
/* ===================================================================== */
function render() {
  const app = $("#app");
  if (ui.screen === "home") app.innerHTML = viewHome();
  else if (ui.screen === "new") app.innerHTML = viewNew();
  else if (ui.screen === "party") app.innerHTML = viewParty();
  else if (ui.screen === "sheet") app.innerHTML = viewSheet(Store.active());
}

/* ---- Home ---- */
function viewHome() {
  const list = Store.characters.map((c) => `
    <button class="char-card" data-act="open" data-id="${c.id}">
      <div class="cc-main"><span class="cc-name">${esc(c.name)}</span>
        <span class="cc-sub">${esc(classSummary(c))} · level ${Calc.totalLevel(c)} · ${c.edition}</span></div>
      <span class="cc-go">›</span>
    </button>`).join("");
  return `
    <header class="topbar"><img src="icons/icon-192.png" class="logo" alt=""><h1>Grimoire</h1></header>
    <div class="screen">
      ${Store.characters.length ? `<div class="char-list">${list}</div>` : `<p class="empty">No characters yet. Create your first adventurer.</p>`}
      <div class="home-actions">
        <button class="btn primary" data-act="goNew">+ New character</button>
        <button class="btn ghost" data-act="goParty">⚔ Kill count</button>
        <button class="btn ghost" data-act="importFile">⬆ Import from file</button>
      </div>
    </div>`;
}

/* ---- Kill count (team) ---- */
function viewParty() {
  const sorted = [...Party.members].sort((a, b) => b.kills - a.kills);
  const rows = sorted.map((m, idx) => `
    <div class="kill-row">
      <span class="kill-rank">${idx === 0 && m.kills > 0 ? "👑" : "#" + (idx + 1)}</span>
      <span class="kill-name">${esc(m.name)}</span>
      <span class="kill-count">${m.kills}</span>
      <div class="kill-btns">
        <button data-act="partyUnkill" data-id="${m.id}">−</button>
        <button class="kill-plus" data-act="partyKill" data-id="${m.id}">+1</button>
        <button class="del" data-act="partyRemove" data-id="${m.id}">✕</button>
      </div>
    </div>`).join("") || `<p class="empty">No one yet. Add your party below — then tap +1 each time they down a foe.</p>`;
  return `
    <header class="topbar"><button class="back" data-act="goHome">‹</button><h1>Kill count</h1></header>
    <div class="screen">
      <div class="kill-list">${rows}</div>
      <div class="kill-add">
        <input id="party-name" placeholder="Add a party member…" maxlength="24">
        <button class="btn" data-act="partyAdd">Add</button>
      </div>
      ${Party.members.length ? `<button class="btn ghost reset-kills" data-act="partyReset">Reset all kills to 0</button>` : ""}
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
      <div class="sheet-id"><span class="s-name">${esc(ch.name)}</span><span class="s-sub">${esc(classSummary(ch))} · lvl ${Calc.totalLevel(ch)} · ${ch.edition}</span></div>
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
    <div class="lines">${skills}</div>
    <h3 class="sec">Features &amp; traits <button class="mini" data-act="addFeature">+ add</button></h3>
    <div class="features">${(ch.features || []).map((f) => `
      <div class="feat">
        <div class="feat-top"><span class="feat-name">${esc(f.name)}</span>
          <button class="opt-btn" data-act="featureOptions" data-id="${f.id}">⋯</button></div>
        ${f.desc ? `<div class="feat-desc">${esc(f.desc)}</div>` : ""}
        ${(f.bonuses && f.bonuses.length) ? `<div class="feat-tags">${f.bonuses.map((b) => `<span class="feat-tag">${sign(b.value)} ${esc(FEAT_TARGET_LABEL[b.target] || b.target)}</span>`).join("")}</div>` : ""}
      </div>`).join("") || `<span class="muted">none — fighting styles, feats, racial traits, class features…</span>`}</div>`;
}

function tabCombat(ch) {
  const c = ch.combat;
  const cond = (ch.conditions || []).map((x, i) => `
    <span class="cond"><button class="cond-name" data-act="condInfo" data-name="${esc(x.name)}">${esc(x.name)}</button>${x.rounds != null ? ` <b>${x.rounds}r</b>` : ""}
      <button data-act="condTick" data-i="${i}" title="-1 round">−</button>
      <button data-act="condRemove" data-i="${i}">✕</button></span>`).join("") || `<span class="muted">none</span>`;
  const res = (ch.resources || []).map((r) => `
    <div class="res">
      <div class="res-top"><span>${esc(r.name)}</span>
        <span class="res-meta"><span class="muted">${r.max - r.used}/${r.max} · ${r.resetOn} rest</span>
          <button class="opt-btn" data-act="resOptions" data-id="${r.id}">⋯</button></span></div>
      ${r.note ? `<div class="res-note">${esc(r.note)}</div>` : ""}
      <div class="res-btns">
        <button data-act="resUse" data-id="${r.id}">Use</button>
        <button data-act="resRestore" data-id="${r.id}">+</button>
      </div>
    </div>`).join("");
  const wAtkBon = Calc.featBonus(ch, "weaponAttack"), wDmgBon = Calc.featBonus(ch, "weaponDamage");
  const weapons = (ch.weapons || []).map((w, i) => {
    const atk = (w.atk !== "" && w.atk != null) ? +w.atk + wAtkBon : null;
    return `<button class="weapon" data-act="weaponOpen" data-i="${i}">
      <span class="wpn-info"><span class="wpn-name">${esc(w.name)}</span>
        <span class="wpn-sub">${atk != null ? sign(atk) + " to hit" : "—"}${w.damage ? ` · ${esc(w.damage)}${wDmgBon ? " " + sign(wDmgBon) : ""}${w.damageType ? " " + esc(w.damageType) : ""}` : ""}${w.notes ? ` · ${esc(w.notes)}` : ""}</span></span>
      <span class="wpn-go">🎲</span>
    </button>`;
  }).join("") || `<span class="muted">none — add your weapons & attacks</span>`;
  const conc = ch.spells.concentratingOn ? (findSpell(ch, ch.spells.concentratingOn)?.name || "a spell") : null;
  return `
    <div class="combat-top">
      <div class="big-stat" data-act="override" data-key="ac" data-label="Armor Class" data-auto="${Calc.armorClass(ch)}"><b>${Calc.armorClass(ch)}</b><span>AC</span></div>
      <div class="big-stat"><b>${sign(Calc.initiative(ch))}</b><span>Init</span></div>
      <div class="big-stat" data-act="override" data-key="speed" data-label="Speed" data-auto="${Calc.speed(ch)}"><b>${Calc.speed(ch)}</b><span>Speed</span></div>
    </div>
    <div class="hp-block">
      <div class="hp-row"><span>Hit points</span>
        <span class="hp-now">${c.hpCur}<small>/${Calc.maxHP(ch)}</small>${c.hpTemp ? ` <em class="temp">+${c.hpTemp}</em>` : ""}</span></div>
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
    <h3 class="sec">Weapons &amp; attacks <button class="mini" data-act="addWeapon">+ add</button></h3>
    <div class="weapons">${weapons}</div>
    <div class="death">
      <span>Death saves</span>
      <span class="ds">✓ ${[0,1,2].map((i)=>`<button class="pip ${c.death.succ>i?"on good":""}" data-act="death" data-t="succ" data-i="${i}"></button>`).join("")}</span>
      <span class="ds">✗ ${[0,1,2].map((i)=>`<button class="pip ${c.death.fail>i?"on bad":""}" data-act="death" data-t="fail" data-i="${i}"></button>`).join("")}</span>
    </div>
    <div class="hitdice">
      <span>Hit dice <b>${Math.max(0, Calc.totalLevel(ch) - c.hitDiceUsed)}/${Calc.totalLevel(ch)}</b> · ${Object.entries(Calc.hitDicePool(ch)).sort((a, b) => b[0] - a[0]).map(([d, n]) => n + "d" + d).join(" + ")}</span>
      <button class="btn small-b" data-act="spendHitDie" ${Calc.totalLevel(ch) - c.hitDiceUsed <= 0 ? "disabled" : ""}>Spend (heal)</button>
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
  const casters = Calc.castingClasses(ch);
  let headHtml;
  if (casters.length <= 1) {
    const dc = Calc.spellSaveDC(ch), atk = Calc.spellAttack(ch), prep = Calc.preparedCount(ch);
    headHtml = `<div class="cast-head">
      <div class="big-stat"><b>${dc ?? "—"}</b><span>Save DC</span></div>
      <div class="big-stat"><b>${atk != null ? sign(atk) : "—"}</b><span>Spell atk</span></div>
      ${prep != null ? `<div class="big-stat" data-act="override" data-key="preparedCount" data-label="Prepared count" data-auto="${prep}"><b>${ch.spells.prepared.length}/${prep}</b><span>Prepared</span></div>` : ""}
    </div>`;
  } else {
    headHtml = `<div class="cast-multi">${casters.map((cc) => `
      <div class="cast-cls">
        <span class="cc-cls">${esc(cc.cls)} <em>${cc.ability.toUpperCase()}</em></span>
        <span class="cc-stats">DC <b>${cc.dc}</b> · atk <b>${sign(cc.attack)}</b>${cc.prepares ? ` · prep ${cc.prepared}` : ""}</span>
      </div>`).join("")}</div>`;
  }
  return `
    ${headHtml}
    <div class="slots">${slotHtml || '<p class="muted">No spell slots at this level.</p>'}</div>
    ${spellListSection(ch)}`;
}

function spellListSection(ch) {
  const f = ui.spellFilter;
  const subSpells = subclassSpells(ch);
  Grimoire._subSet = new Set(subSpells.map((s) => s.id));
  const lists = [["available", "Class list"], ["all", "All spells"], ["prepared", "Prepared"], ["known", "Known"], ["favorites", "★ Favorites"]];
  if (subSpells.length) lists.splice(2, 0, ["subclass", "Subclass"]);
  let pool;
  if (f.list === "available") pool = classSpells(ch);
  else if (f.list === "all") pool = spellPool(ch);
  else if (f.list === "subclass") pool = subSpells;
  else if (f.list === "prepared") { const seen = new Set(); pool = [...ch.spells.prepared.map((id) => findSpell(ch, id)), ...subSpells].filter((s) => s && !seen.has(s.id) && seen.add(s.id)); }
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
  const isSub = Grimoire._subSet && Grimoire._subSet.has(s.id);
  const isFav = ch.spells.favorites.includes(s.id);
  const isPrep = ch.spells.prepared.includes(s.id) || isSub;
  const isKnown = ch.spells.known.includes(s.id);
  const lvl = s.level === 0 ? "Cantrip" : "L" + s.level;
  const tags = [s.concentration ? "C" : "", s.ritual ? "R" : ""].filter(Boolean).join(" ");
  return `<div class="spell">
    <button class="spell-main" data-act="spellDetail" data-id="${esc(s.id)}">
      <span class="sp-name">${esc(s.name)} ${s.custom ? '<em class="hb">homebrew</em>' : ""}${isSub ? '<em class="sub-badge">subclass</em>' : ""}</span>
      <span class="sp-meta">${lvl} · ${esc(s.school)}${tags ? " · " + tags : ""}</span>
    </button>
    <div class="spell-acts">
      <button class="ic ${isFav ? "on" : ""}" data-act="fav" data-id="${esc(s.id)}" title="favorite">★</button>
      <button class="ic ${isPrep ? "on" : ""}" data-act="prep" data-id="${esc(s.id)}" title="prepared${isSub ? " (always, from subclass)" : ""}">P</button>
      <button class="ic ${isKnown ? "on" : ""}" data-act="know" data-id="${esc(s.id)}" title="known">K</button>
    </div>
  </div>`;
}

function spellListRowsHtml(ch) {
  const f = ui.spellFilter;
  let pool;
  if (f.list === "available") pool = classSpells(ch);
  else if (f.list === "all") pool = spellPool(ch);
  else if (f.list === "subclass") pool = subclassSpells(ch);
  else if (f.list === "prepared") { const seen = new Set(); pool = [...ch.spells.prepared.map((id) => findSpell(ch, id)), ...subclassSpells(ch)].filter((s) => s && !seen.has(s.id) && seen.add(s.id)); }
  else pool = (ch.spells[f.list] || []).map((id) => findSpell(ch, id)).filter(Boolean);
  if (f.q) pool = pool.filter((s) => s.name.toLowerCase().includes(f.q.toLowerCase()));
  if (f.level !== "all") pool = pool.filter((s) => String(s.level) === String(f.level));
  pool.sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
  return pool.map((s) => spellRow(ch, s)).join("") || `<p class="muted pad">No spells.</p>`;
}

function tabGear(ch) {
  const inv = (ch.inventory || []).map((it) => `
    <div class="item">
      <button class="eq ${it.equipped ? "on" : ""}" data-act="equip" data-id="${it.id}" title="equipped (counts AC)">${it.equipped ? "✓" : ""}</button>
      <span class="it-name">${esc(it.name)}${it.acBonus ? ` <em>AC ${sign(+it.acBonus)}</em>` : ""}${it.qty > 1 ? ` ×${it.qty}` : ""}</span>
      <button class="opt-btn" data-act="itemOptions" data-id="${it.id}">⋯</button>
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
