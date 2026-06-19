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
// non-bundled official spells (from the look-up index) castable by this character's
// classes and not already in their book — shown greyed in the "Find more" tab.
function indexStubs(ch) {
  const idx = Grimoire.spellIndex || [];
  if (!idx.length) return [];
  const have = new Set(spellPool(ch).map((s) => s.name.toLowerCase()));
  const classes = Calc.classList(ch).map((c) => c.cls.toLowerCase());
  return idx
    .filter((s) => !have.has(s.name.toLowerCase()) && (s.classes || []).some((c) => classes.includes(c.toLowerCase())))
    .map((s) => ({ id: idxId(s.name), name: s.name, level: s.level, school: s.school, source: s.source, stub: true }));
}
// shared pool builder for the spellbook (used by the full render AND live search)
function spellPoolForList(ch) {
  const f = ui.spellFilter;
  let pool;
  if (f.list === "available") pool = classSpells(ch);
  else if (f.list === "all") pool = spellPool(ch);
  else if (f.list === "find") pool = indexStubs(ch);
  else if (f.list === "subclass") pool = subclassSpells(ch);
  else if (f.list === "prepared") { const seen = new Set(); pool = [...ch.spells.prepared.map((id) => findSpell(ch, id)), ...subclassSpells(ch)].filter((s) => s && !seen.has(s.id) && seen.add(s.id)); }
  else pool = (ch.spells[f.list === "favorites" ? "favorites" : f.list] || []).map((id) => findSpell(ch, id)).filter(Boolean);
  if (f.q) pool = pool.filter((s) => s.name.toLowerCase().includes(f.q.toLowerCase()));
  if (f.level !== "all") pool = pool.filter((s) => String(s.level) === String(f.level));
  if (!["prepared", "known", "favorites"].includes(f.list)) pool = pool.slice().sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
  return pool;
}
function classSummary(ch) {
  const list = Calc.classList(ch);
  if (list.length <= 1) return ch.cls;
  return list.map((c) => `${c.cls} ${c.level}`).join(" / ");
}
// does the chosen subclass have a built-in (SRD) spell table?
function subclassHasBuiltin(ch) {
  if (!ch.subclass) return false;
  return Calc.classList(ch).some((c) => { const m = RULES.SUBCLASSES[c.cls]; return m && m[ch.subclass]; });
}
// spells granted by the chosen subclass: built-in SRD table, else the player's own list (content they own)
function subclassSpells(ch) {
  const sub = ch.subclass; if (!sub) return [];
  let table = null, lvl = 0;
  for (const c of Calc.classList(ch)) { const m = RULES.SUBCLASSES[c.cls]; if (m && m[sub]) { table = m[sub]; lvl = c.level; break; } }
  if (!table) return (ch.subSpells || []).map((id) => findSpell(ch, id)).filter(Boolean);
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

/* advantage targets a feature can grant (non-numeric — they change how you roll) */
const ADV_TARGETS = [
  ["save.all", "All saving throws"],
  ["save.str", "STR saves"], ["save.dex", "DEX saves"], ["save.con", "CON saves"],
  ["save.int", "INT saves"], ["save.wis", "WIS saves"], ["save.cha", "CHA saves"],
  ["save.concentration", "Concentration saves"],
  ["skill.all", "All ability checks"],
  ...Object.keys(RULES.SKILLS).map((s) => ["skill." + s, s + " (skill)"]),
  ["initiative", "Initiative"],
];
const ADV_LABEL = Object.fromEntries(ADV_TARGETS);

/* ===================================================================== */
/*  SCREENS                                                              */
/* ===================================================================== */
function render() {
  const app = $("#app");
  if (ui.screen === "home") app.innerHTML = viewHome();
  else if (ui.screen === "new") app.innerHTML = viewNew();
  else if (ui.screen === "party") app.innerHTML = viewParty();
  else if (ui.screen === "session") app.innerHTML = viewSession(Store.active());
  else if (ui.screen === "sheet") app.innerHTML = viewSheet(Store.active());
  if (typeof applyTheme === "function") applyTheme((ui.screen === "sheet" || ui.screen === "session") ? Store.active() : null);
  if (ui.screen === "session" && typeof hydrateSessionMedia === "function") hydrateSessionMedia();
  if (typeof initSortables === "function") initSortables();
}
// drag-handle markup, shown only in Arrange mode (ui.reorder)
function handle() { return ui.reorder ? '<button class="drag-handle" title="drag to reorder">⠿</button>' : ""; }

/* ---- Home ---- */
function viewHome() {
  const list = Store.characters.map((c) => `
    <button class="char-card" data-act="open" data-id="${c.id}">
      ${c.portrait ? `<img class="avatar" src="${c.portrait}" alt="">` : `<span class="avatar avatar-blank">${esc((c.name || "?").trim().charAt(0).toUpperCase())}</span>`}
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
        <button class="btn ghost" data-act="goParty">Kill count</button>
        <button class="btn ghost" data-act="importFile">Import from file</button>
        <button class="btn ghost" data-act="forceUpdate">Update app (keeps characters)</button>
      </div>
    </div>`;
}

/* ---- Kill count (team) ---- */
function viewParty() {
  const sorted = [...Party.members].sort((a, b) => b.kills - a.kills);
  const rows = sorted.map((m, idx) => `
    <div class="kill-row">
      <span class="kill-rank">${idx === 0 && m.kills > 0 ? "★" : "#" + (idx + 1)}</span>
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
  const tabs = [["stats", "Stats"], ["combat", "Combat"], ["spells", "Spells"], ["gear", "Gear"], ["notes", "Notes"], ["sessions", "Log"]];
  let body = "";
  if (ui.tab === "stats") body = tabStats(ch);
  else if (ui.tab === "combat") body = tabCombat(ch);
  else if (ui.tab === "spells") body = tabSpells(ch);
  else if (ui.tab === "gear") body = tabGear(ch);
  else if (ui.tab === "notes") body = tabNotes(ch);
  else if (ui.tab === "sessions") body = tabSessions(ch);
  return `
    <header class="topbar sheet">
      <button class="back" data-act="goHome">‹</button>
      ${ch.portrait ? `<img class="avatar avatar-sm" src="${ch.portrait}" data-act="charPhoto" alt="">` : `<span class="avatar avatar-sm avatar-blank" data-act="charPhoto">${esc((ch.name || "?").trim().charAt(0).toUpperCase())}</span>`}
      <div class="sheet-id"><span class="s-name">${esc(ch.name)}</span><span class="s-sub">${esc(classSummary(ch))}${ch.subclass ? " · " + esc(ch.subclass) : ""} · lvl ${Calc.totalLevel(ch)} · ${ch.edition}</span></div>
      <button class="kebab reorder-toggle ${ui.reorder ? "on" : ""}" data-act="toggleReorder" title="Arrange (drag to reorder)">⠿</button>
      <button class="kebab" data-act="charMenu">⋯</button>
    </header>
    ${ui.reorder ? `<div class="arrange-banner">Arrange mode — drag the ⠿ handles to reorder. <button data-act="toggleReorder">Done</button></div>` : ""}
    <div class="screen tabbed">${body}</div>
    <nav class="tabbar">${tabs.map(([k, l]) => `<button class="tab ${ui.tab === k ? "on" : ""}" data-act="tab" data-tab="${k}">${l}</button>`).join("")}</nav>`;
}

/* derived-value chip that opens an override editor on tap */
function statChip(ch, key, label, value, opts = {}) {
  const overridden = ch.overrides && ch.overrides[key] != null && ch.overrides[key] !== "";
  return `<button class="chip ${overridden ? "ovr" : ""}" data-act="override" data-key="${key}" data-label="${esc(label)}" data-auto="${opts.auto ?? ""}">
      <span class="chip-v">${esc(value)}</span><span class="chip-l">${esc(label)}</span>${overridden ? '<span class="ov-dot" title="manual override">•</span>' : ""}
    </button>`;
}

function tabStats(ch) {
  const prof = ch.proficiencies || (ch.proficiencies = { languages: "", armor: "", weapons: "", tools: "" });
  const ab = RULES.ABILITIES.map((a) => `
    <div class="ab-card">
      <span class="ab-name">${a.toUpperCase()}</span>
      <input class="ab-score" type="number" min="1" max="30" data-bind="abilities.${a}" value="${ch.abilities[a]}">
      <span class="ab-mod">${sign(Calc.abilityMod(ch, a))}</span>
    </div>`).join("");
  const saves = RULES.ABILITIES.map((a) => {
    const adv = Calc.advSources(ch, "save." + a).length > 0;
    return `<div class="line">
      <button class="dot ${ch.saveProf[a] ? "on" : ""}" data-act="toggleSave" data-ab="${a}" title="proficient"></button>
      <span class="line-l">${RULES.ABILITY_NAMES[a]}${adv ? ' <em class="adv-mark" title="advantage from a feature">ADV</em>' : ""}</span>
      <span class="line-v" data-act="override" data-key="save.${a}" data-label="${RULES.ABILITY_NAMES[a]} save" data-auto="${Calc.saveBonus(ch, a)}">${sign(Calc.saveBonus(ch, a))}</span>
      <button class="line-roll" data-act="rollSave" data-ab="${a}" title="roll">roll</button>
    </div>`;
  }).join("");
  const skills = Object.keys(RULES.SKILLS).map((s) => {
    const p = ch.skillProf[s] || 0;
    const adv = Calc.advSources(ch, "skill." + s).length > 0;
    return `<div class="line">
      <button class="dot ${p === 1 ? "on" : ""} ${p === 2 ? "exp" : ""}" data-act="cycleSkill" data-skill="${esc(s)}" title="none → proficient → expertise"></button>
      <span class="line-l">${s} <em>${RULES.SKILLS[s].toUpperCase()}</em>${adv ? ' <em class="adv-mark">ADV</em>' : ""}</span>
      <span class="line-v">${sign(Calc.skillBonus(ch, s))}</span>
      <button class="line-roll" data-act="rollSkill" data-skill="${esc(s)}" title="roll">roll</button>
    </div>`;
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
    <div class="features" ${ui.reorder ? 'data-sortlist="features"' : ""}>${(ch.features || []).map((f) => `
      <div class="feat" ${ui.reorder ? `data-sortid="${esc(f.id)}"` : ""}>
        <div class="feat-top">${handle()}<span class="feat-name">${esc(f.name)}</span>
          <button class="opt-btn" data-act="featureOptions" data-id="${f.id}">⋯</button></div>
        ${f.desc ? `<div class="feat-desc">${esc(f.desc)}</div>` : ""}
        ${(f.bonuses && f.bonuses.length) || (f.adv && f.adv.length) ? `<div class="feat-tags">${(f.bonuses || []).map((b) => `<span class="feat-tag">${sign(b.value)} ${esc(FEAT_TARGET_LABEL[b.target] || b.target)}</span>`).join("")}${(f.adv || []).map((t) => `<span class="feat-tag adv-tag">ADV ${esc(ADV_LABEL[t] || t)}</span>`).join("")}</div>` : ""}
      </div>`).join("") || `<span class="muted">none — fighting styles, feats, racial traits, class features…</span>`}</div>
    <h3 class="sec">Proficiencies &amp; Languages</h3>
    <div class="prof-box">
      <label class="fld"><span>Languages</span><textarea class="prof-ta" data-bind="proficiencies.languages" rows="2" placeholder="Common, Elvish, Thieves’ Cant…">${esc(prof.languages || "")}</textarea></label>
      <label class="fld"><span>Armor</span><textarea class="prof-ta" data-bind="proficiencies.armor" rows="1" placeholder="Light, medium, shields…">${esc(prof.armor || "")}</textarea></label>
      <label class="fld"><span>Weapons</span><textarea class="prof-ta" data-bind="proficiencies.weapons" rows="1" placeholder="Simple, martial, longswords…">${esc(prof.weapons || "")}</textarea></label>
      <label class="fld"><span>Tools</span><textarea class="prof-ta" data-bind="proficiencies.tools" rows="1" placeholder="Thieves’ tools, herbalism kit, lute…">${esc(prof.tools || "")}</textarea></label>
    </div>`;
}

function tabCombat(ch) {
  const c = ch.combat;
  const cond = (ch.conditions || []).map((x, i) => `
    <span class="cond"><button class="cond-name" data-act="condInfo" data-name="${esc(x.name)}">${esc(x.name)}</button>${x.rounds != null ? ` <b>${x.rounds}r</b>` : ""}
      <button data-act="condTick" data-i="${i}" title="-1 round">−</button>
      <button data-act="condRemove" data-i="${i}">✕</button></span>`).join("") || `<span class="muted">none</span>`;
  const res = (ch.resources || []).map((r) => `
    <div class="res" ${ui.reorder ? `data-sortid="${esc(r.id)}"` : ""}>
      <div class="res-top">${handle()}<span>${esc(r.name)}</span>
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
    return `<div class="weapon" ${ui.reorder ? `data-sortid="${esc(w.id)}"` : ""}>${handle()}
      <button class="weapon-main" data-act="weaponOpen" data-i="${i}">
        <span class="wpn-info"><span class="wpn-name">${esc(w.name)}</span>
          <span class="wpn-sub">${atk != null ? sign(atk) + " to hit" : "—"}${w.damage ? ` · ${esc(w.damage)}${wDmgBon ? " " + sign(wDmgBon) : ""}${w.damageType ? " " + esc(w.damageType) : ""}` : ""}${w.notes ? ` · ${esc(w.notes)}` : ""}</span></span>
        <span class="wpn-go">roll</span>
      </button>
    </div>`;
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
        <button class="btn dmg-btn" data-act="hpDamage">Take damage</button>
        <button class="btn heal-btn" data-act="hpHeal">Heal</button>
        <button class="btn set-hp" data-act="hpEdit">Set</button>
      </div>
      <div class="hp-sub">
        <label>Temp HP <input type="number" data-bind="combat.hpTemp" value="${c.hpTemp}"></label>
        <label>Max <input type="number" data-bind="combat.hpMax" value="${c.hpMax}"></label>
      </div>
    </div>
    <h3 class="sec">Weapons &amp; attacks <button class="mini" data-act="addWeapon">+ add</button></h3>
    <div class="weapons" ${ui.reorder ? 'data-sortlist="weapons"' : ""}>${weapons}</div>
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
    <div class="reslist" ${ui.reorder ? 'data-sortlist="resources"' : ""}>${res || '<span class="muted">none — e.g. Rage, Ki, Channel Divinity</span>'}</div>`;
}

function tabSpells(ch) {
  if (!Calc.isCaster(ch) && !(ch.customSpells || []).length && !ch.spells.known.length) {
    return `<div class="caster-none">
      <p><b>${esc(ch.cls)}</b> isn't a spellcaster by default.</p>
      <p class="muted">You can still hand-add spells (racial, feats, items).</p>
      <button class="btn" data-act="addCustom">+ Add a spell</button></div>` + spellListSection(ch);
  }
  const slots = Calc.spellSlots(ch), pact = Calc.pactMagic(ch);
  const editingSlots = ui.editSlots;
  let slotHtml = "";
  if (editingSlots) {
    // edit mode: +/- the max per level (incl. levels currently at 0), with revert-to-auto
    for (let i = 1; i <= 9; i++) {
      const overridden = ch.overrides && ch.overrides["slotMax." + i] != null && ch.overrides["slotMax." + i] !== "";
      slotHtml += `<div class="slot-erow">
        <span class="slvl">L${i}</span>
        <button class="step" data-act="slotDec" data-lvl="${i}">−</button>
        <span class="slot-n ${overridden ? "ovr" : ""}">${slots[i].max}</span>
        <button class="step" data-act="slotInc" data-lvl="${i}">+</button>
        ${overridden ? `<button class="btn small-b" data-act="slotReset" data-lvl="${i}">auto</button>` : `<span class="auto-spacer"></span>`}
      </div>`;
    }
  } else {
    for (let i = 1; i <= 9; i++) {
      if (!slots[i].max) continue;
      const pips = Array.from({ length: slots[i].max }, (_, k) => `<button class="slot ${k < slots[i].used ? "used" : ""}" data-act="slot" data-lvl="${i}" data-k="${k}"></button>`).join("");
      slotHtml += `<div class="slot-row"><span class="slvl" data-act="override" data-key="slotMax.${i}" data-label="Level ${i} slots" data-auto="${slots[i].max}">L${i}</span><span class="pips">${pips}</span></div>`;
    }
    if (pact) {
      const pips = Array.from({ length: pact.max }, (_, k) => `<button class="slot pact ${k < pact.used ? "used" : ""}" data-act="pactSlot" data-k="${k}"></button>`).join("");
      slotHtml += `<div class="slot-row"><span class="slvl">Pact L${pact.level}</span><span class="pips">${pips}</span><small class="muted">short rest</small></div>`;
    }
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
    <div class="slots-head"><span class="slots-title">Spell slots</span><button class="mini" data-act="toggleEditSlots">${editingSlots ? "done" : "edit"}</button></div>
    ${editingSlots ? '<p class="muted small">Tap − / + to set how many slots you have at each level (for items, feats or homebrew). “auto” reverts to the rules default.</p>' : ""}
    <div class="slots">${slotHtml || (editingSlots ? "" : '<p class="muted">No spell slots at this level.</p>')}</div>
    ${spellListSection(ch)}`;
}

function spellListSection(ch) {
  const f = ui.spellFilter;
  const subSpells = subclassSpells(ch);
  Grimoire._subSet = new Set(subSpells.map((s) => s.id));
  const lists = [["available", "Class list"], ["all", "All spells"], ["prepared", "Prepared"], ["known", "Known"], ["favorites", "★ Favorites"], ["find", "Find more"]];
  if (ch.subclass) lists.splice(2, 0, ["subclass", "Subclass"]);
  const pool = spellPoolForList(ch);
  const levels = `<option value="all">All levels</option>` + Array.from({ length: 10 }, (_, i) => `<option value="${i}" ${String(f.level) === String(i) ? "selected" : ""}>${i === 0 ? "Cantrips" : "Level " + i}</option>`).join("");
  const subEditBanner = (f.list === "subclass" && ch.subclass && !subclassHasBuiltin(ch))
    ? `<div class="sub-edit"><span class="muted small">${esc(ch.subclass)} — your own list</span><button class="btn small-b" data-act="editSubSpells">Set subclass spells</button></div>`
    : "";
  const findBanner = f.list === "find"
    ? `<p class="muted small pad">Official spells not bundled (only free SRD ships). Tap one to look it up &amp; paste it in. Class/level are from a community index — confirm at the source.</p>`
    : "";
  const emptyMsg = f.list === "find"
    ? "No matching spells — everything for your class at this filter is already in your book."
    : `No spells.${f.list === "subclass" ? " Tap “Set subclass spells” to add the ones your subclass grants." : f.list === "available" ? "" : " Add some from the Class list."}`;
  const rows = subEditBanner + findBanner + (pool.map((s) => spellRow(ch, s)).join("") || `<p class="muted pad">${emptyMsg}</p>`);
  return `
    <h3 class="sec">Spellbook <button class="mini" data-act="addCustom">+ hand-add</button> <button class="mini" data-act="pasteSpells">paste</button></h3>
    <div class="spell-filters">
      <div class="seg">${lists.map(([k, l]) => `<button class="${f.list === k ? "on" : ""}" data-act="spellList" data-list="${k}">${l}</button>`).join("")}</div>
      <div class="filter-row">
        <input class="search" type="search" placeholder="Search spells…" data-act="spellSearch" value="${esc(f.q)}">
        <select data-act="spellLevel">${levels}</select>
      </div>
    </div>
    <div class="spell-rows" ${ui.reorder && ["prepared", "known", "favorites"].includes(f.list) ? `data-sortlist="spell:${f.list}"` : ""}>${rows}</div>`;
}

function spellRow(ch, s) {
  if (s.stub) {
    const lvl = s.level === 0 ? "Cantrip" : "L" + s.level;
    return `<div class="spell stub">
      <button class="spell-main" data-act="spellDetail" data-id="${esc(s.id)}">
        <span class="sp-name">${esc(s.name)} <em class="ext">${esc(s.source)}</em></span>
        <span class="sp-meta">${lvl} · ${esc(s.school)} · not included — tap to add</span>
      </button>
    </div>`;
  }
  const isSub = Grimoire._subSet && Grimoire._subSet.has(s.id);
  const isFav = ch.spells.favorites.includes(s.id);
  const isPrep = ch.spells.prepared.includes(s.id) || isSub;
  const isKnown = ch.spells.known.includes(s.id);
  const lvl = s.level === 0 ? "Cantrip" : "L" + s.level;
  const tags = [s.concentration ? "C" : "", s.ritual ? "R" : ""].filter(Boolean).join(" ");
  const curated = ["prepared", "known", "favorites"].includes(ui.spellFilter.list);
  const draggable = ui.reorder && curated && (ch.spells[ui.spellFilter.list] || []).includes(s.id);
  return `<div class="spell" ${draggable ? `data-sortid="${esc(s.id)}"` : ""}>
    ${draggable ? handle() : ""}
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
  return spellPoolForList(ch).map((s) => spellRow(ch, s)).join("") || `<p class="muted pad">No spells.</p>`;
}

function itemRowsHtml(ch, items, listKey) {
  return (items || []).map((it) => {
    const tags = [];
    if (it.acBonus) tags.push(`AC ${sign(+it.acBonus)}`);
    (it.bonuses || []).forEach((b) => tags.push(`${sign(b.value)} ${FEAT_TARGET_LABEL[b.target] || b.target}`));
    (it.adv || []).forEach((t) => tags.push(`ADV ${ADV_LABEL[t] || t}`));
    const carried = listKey === "inventory";
    const equip = carried ? `<button class="eq ${it.equipped ? "on" : ""}" data-act="equip" data-id="${it.id}" data-list="${listKey}" title="equipped — applies its bonuses">${it.equipped ? "✓" : ""}</button>` : "";
    return `<div class="item" ${ui.reorder ? `data-sortid="${esc(it.id)}"` : ""}>${handle()}${equip}
      <div class="it-main">
        <span class="it-name">${esc(it.name)}${it.qty > 1 ? ` ×${it.qty}` : ""}${carried && !it.equipped && tags.length ? ' <em class="it-off">(unequipped)</em>' : ""}</span>
        ${tags.length ? `<span class="it-tags">${tags.map((t) => `<span class="it-tag${carried && !it.equipped ? " off" : ""}">${esc(t)}</span>`).join("")}</span>` : ""}
      </div>
      <button class="opt-btn" data-act="itemOptions" data-id="${it.id}" data-list="${listKey}">⋯</button>
    </div>`;
  }).join("") || `<span class="muted">empty</span>`;
}
function tabGear(ch) {
  const cur = ch.currency || { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 };
  const coin = (k, l) => `<label class="coin"><span>${l}</span><input type="number" min="0" inputmode="numeric" data-bind="currency.${k}" value="${cur[k] || 0}"></label>`;
  return `
    <div class="armor-row">
      <label>Armor base AC <input type="number" placeholder="(unarmored)" data-bind="combat.armorBaseAC" value="${ch.combat.armorBaseAC ?? ""}"></label>
      <label>Add Dex?
        <select data-bind="combat.armorDexMode">
          <option value="none" ${(ch.combat.armorDexMode || "none") === "none" ? "selected" : ""}>None (heavy / fixed)</option>
          <option value="full" ${ch.combat.armorDexMode === "full" ? "selected" : ""}>+ Dex (light / natural)</option>
          <option value="med" ${ch.combat.armorDexMode === "med" ? "selected" : ""}>+ Dex, max 2 (medium)</option>
          <option value="con" ${ch.combat.armorDexMode === "con" ? "selected" : ""}>+ Con (e.g. Loxodon)</option>
        </select></label>
      <label class="chk"><input type="checkbox" data-bind="combat.shield" ${ch.combat.shield ? "checked" : ""}> Shield (+2)</label>
    </div>
    <p class="muted small">Leave the base empty for unarmored (10 + Dex). For <b>natural armor</b>, type the base (e.g. 13 for Lizardfolk) and pick “+ Dex”. Tick an item's box to <b>equip</b> it — its bonuses apply automatically (AC now ${Calc.armorClass(ch)}).</p>
    <h3 class="sec">Coins</h3>
    <div class="coins">${coin("pp", "PP")}${coin("gp", "GP")}${coin("ep", "EP")}${coin("sp", "SP")}${coin("cp", "CP")}</div>
    <h3 class="sec">Inventory <span class="hdr-btns"><button class="mini" data-act="partyOpen">transfer</button><button class="mini" data-act="addItem">+ add</button></span></h3>
    <div class="items" ${ui.reorder ? 'data-sortlist="inventory"' : ""}>${itemRowsHtml(ch, ch.inventory, "inventory")}</div>
    <h3 class="sec">Bag of Holding <button class="mini" data-act="addBagItem">+ add</button></h3>
    <div class="items" ${ui.reorder ? 'data-sortlist="bag"' : ""}>${itemRowsHtml(ch, ch.bag, "bag")}</div>`;
}

function tabNotes(ch) {
  const photo = ch.portrait
    ? `<img class="notes-portrait" src="${ch.portrait}" data-act="charPhoto" alt="character portrait">`
    : `<button class="btn ghost notes-addphoto" data-act="charPhoto">Add a character photo</button>`;
  return `${photo}<textarea class="notes" data-bind="notes" placeholder="Backstory, party, quests, session notes…">${esc(ch.notes)}</textarea>`;
}

/* ---- Session book (per-character journal: text + photos + drawings) ---- */
function sessionDateLabel(d) {
  if (!d) return "";
  const parts = String(d).split("-");
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`; // dd/mm/yyyy
  return d;
}
function tabSessions(ch) {
  const list = (ch.sessions || []).slice().sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.id > a.id ? 1 : -1));
  const cards = list.map((s) => {
    const n = (s.media || []).length;
    const snippet = (s.text || "").replace(/\s+/g, " ").trim().slice(0, 90);
    return `<button class="session-card" data-act="openSession" data-id="${esc(s.id)}">
      <div class="sc-top"><span class="sc-title">${esc(s.title || "Untitled session")}</span><span class="sc-date">${esc(sessionDateLabel(s.date))}</span></div>
      ${snippet ? `<div class="sc-snip">${esc(snippet)}${(s.text || "").length > 90 ? "…" : ""}</div>` : `<div class="sc-snip muted">No notes yet</div>`}
      ${n ? `<div class="sc-meta">${n} picture${n === 1 ? "" : "s"}</div>` : ""}
    </button>`;
  }).join("");
  return `
    <div class="sessions-head">
      <h3 class="sec">Session log</h3>
      <button class="btn primary" data-act="newSession">+ New session</button>
    </div>
    <p class="muted small">Notes, photos &amp; drawings for each game session — saved on this phone and in your backup export.</p>
    <div class="session-list">${cards || `<p class="muted pad">No sessions yet. Tap “+ New session” after your next game.</p>`}</div>`;
}

function viewSession(ch) {
  if (!ch) { ui.screen = "home"; return viewHome(); }
  const s = (ch.sessions || []).find((x) => x.id === ui.sessionId);
  if (!s) { ui.screen = "sheet"; ui.tab = "sessions"; return viewSheet(ch); }
  const media = (s.media || []).map((m) => `
    <div class="media-thumb">
      <img data-mid="${esc(m.id)}" data-act="mediaView" data-sid="${esc(s.id)}" alt="${esc(m.caption || m.type)}">
      <button class="media-del" data-act="mediaDelete" data-sid="${esc(s.id)}" data-mid="${esc(m.id)}" title="delete">✕</button>
    </div>`).join("");
  return `
    <header class="topbar">
      <button class="back" data-act="sessionBack">‹</button>
      <div class="sheet-id"><span class="s-name">Session log</span><span class="s-sub">${esc(ch.name)}</span></div>
    </header>
    <div class="screen">
      <label class="fld"><span>Title</span><input id="ses-title" data-act="sessionTitle" data-id="${esc(s.id)}" value="${esc(s.title || "")}" placeholder="e.g. The Sunken Crypt"></label>
      <label class="fld"><span>Date</span><input type="date" data-act="sessionDate" data-id="${esc(s.id)}" value="${esc(s.date || "")}"></label>
      <label class="fld"><span>Notes</span><textarea class="notes session-notes" data-act="sessionText" data-id="${esc(s.id)}" rows="8" placeholder="What happened this session…">${esc(s.text || "")}</textarea></label>
      <div class="media-actions">
        <button class="btn" data-act="sessionAddPhoto" data-id="${esc(s.id)}">Add photo</button>
        <button class="btn" data-act="sessionDraw" data-id="${esc(s.id)}">New drawing</button>
      </div>
      <div class="media-grid">${media || `<p class="muted small">No photos or drawings yet.</p>`}</div>
    </div>`;
}
