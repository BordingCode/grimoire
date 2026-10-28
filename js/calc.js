/* Grimoire — derived stats. Every function checks ch.overrides[key] first so a
   player can pin any value (magic items, odd builds) — research showed the #1
   auto-calc complaint is it being WRONG with no way to fix it.
   Multiclass-aware: a character has a primary class (ch.cls/ch.level) plus an
   optional ch.multiclass = [{cls, level}, ...]. */
"use strict";

const ZERO9 = [0, 0, 0, 0, 0, 0, 0, 0, 0];

function ov(ch, key, auto) {
  const o = ch.overrides ? ch.overrides[key] : undefined;
  return (o === undefined || o === null || o === "") ? auto : o;
}

const Calc = {
  mod(score) { return Math.floor((score - 10) / 2); },

  abilityMod(ch, ab) { return this.mod(ch.abilities[ab]); },

  // sum of all feature auto-bonuses for a given target (e.g. "ac", "save.dex", "weaponDamage")
  // numeric auto-bonuses for a target, from features + EQUIPPED items.
  featBonus(ch, target) {
    let sum = 0;
    for (const f of (ch.features || [])) for (const b of (f.bonuses || [])) {
      if (b.target === target) sum += (+b.value || 0);
    }
    for (const it of (ch.inventory || [])) if (it.equipped) for (const b of (it.bonuses || [])) {
      if (b.target === target) sum += (+b.value || 0);
    }
    return sum;
  },

  // names of features / EQUIPPED items granting ADVANTAGE on a roll target
  // (e.g. "save.con", "skill.Stealth"). Matches exact target plus save.all/skill.all wildcards.
  advSources(ch, target) {
    const out = [];
    const wild = target.startsWith("save.") ? "save.all" : target.startsWith("skill.") ? "skill.all" : null;
    for (const f of (ch.features || [])) for (const t of (f.adv || [])) {
      if (t === target || (wild && t === wild)) out.push(f.name);
    }
    for (const it of (ch.inventory || [])) if (it.equipped) for (const t of (it.adv || [])) {
      if (t === target || (wild && t === wild)) out.push(it.name);
    }
    // Rage: advantage on Strength checks and saves (same in 2014 and 2024)
    if (ch.combat && ch.combat.raging && (target === "save.str" || target === "skill.Athletics")) out.push("Rage");
    return [...new Set(out)];
  },

  // [{cls, level}] across primary + multiclass, skipping blanks.
  classList(ch) {
    return [{ cls: ch.cls, level: ch.level }, ...(ch.multiclass || [])].filter((c) => c.cls && c.level > 0);
  },
  totalLevel(ch) { return this.classList(ch).reduce((s, c) => s + c.level, 0) || ch.level || 1; },
  isMulti(ch) { return this.classList(ch).length > 1; },

  prof(ch) { return ov(ch, "prof", RULES.profBonus(this.totalLevel(ch))); },

  classInfo(ch) { return RULES.CLASSES[ch.cls] || { caster: "none", saves: [] }; },

  saveBonus(ch, ab) {
    const base = this.abilityMod(ch, ab) + (ch.saveProf[ab] ? this.prof(ch) : 0) + this.featBonus(ch, "save.all") + this.featBonus(ch, "save." + ab);
    return ov(ch, "save." + ab, base);
  },

  skillBonus(ch, skill) {
    const ab = RULES.SKILLS[skill];
    const p = ch.skillProf[skill] || 0;
    const base = this.abilityMod(ch, ab) + p * this.prof(ch) + this.featBonus(ch, "skill.all") + this.featBonus(ch, "skill." + skill);
    return ov(ch, "skill." + skill, base);
  },

  passivePerception(ch) { return ov(ch, "passivePerception", 10 + this.skillBonus(ch, "Perception") + this.featBonus(ch, "passivePerception")); },
  initiative(ch) { return ov(ch, "initiative", this.abilityMod(ch, "dex") + this.featBonus(ch, "initiative")); },
  speed(ch) {
    let s = (ch.combat.speed || 30) + this.classSpeed(ch) + this.featBonus(ch, "speed");
    const ex = this.exhaustion(ch);
    if (ex && ch.edition === "2024") s = Math.max(0, s - 5 * ex);          // 2024: −5 ft per level
    else if (ex >= 5) s = 0; else if (ex >= 2) s = Math.floor(s / 2);     // 2014: halved at 2, 0 at 5
    return ov(ch, "speed", s);
  },
  // exhaustion level 0–6 (stored on the Exhaustion condition)
  exhaustion(ch) { const c = (ch.conditions || []).find((x) => x.name === "Exhaustion"); return c ? Math.max(1, Math.min(6, +c.level || 1)) : 0; },
  // Monk Unarmored Movement (no armor or shield) and Barbarian Fast Movement (no heavy armor) — same in 2014 and 2024
  classSpeed(ch) {
    const lv = (cls) => (this.classList(ch).find((c) => c.cls === cls) || {}).level || 0;
    const armored = ch.combat.armorBaseAC != null, heavy = armored && (ch.combat.armorDexMode || "none") === "none";
    let bonus = 0;
    const m = lv("Monk");
    if (m >= 2 && !armored && !ch.combat.shield) bonus += [0, 10, 15, 20, 25, 30][Math.min(5, Math.floor((m + 2) / 4))];
    if (lv("Barbarian") >= 5 && !heavy) bonus += 10;
    return bonus;
  },
  maxHP(ch) {
    const m = Math.max(0, (ch.combat.hpMax || 0) + this.featBonus(ch, "hpMax"));
    return ch.edition !== "2024" && this.exhaustion(ch) >= 4 ? Math.floor(m / 2) : m;   // 2014 exhaustion 4: HP max halved
  },
  /* traits that raise max HP by 1 per level. The bonus is added to combat.hpMax when the trait
     arrives / on level-up (so it syncs like any HP); this says how big it should be now.
     Dwarven Toughness: +1 per character level. Draconic Resilience: +1 per Sorcerer level
     (2024: +3 at Sorcerer 3, then +1 per level = Sorcerer level). */
  hpTraitBonus(ch) {
    let n = 0;
    for (const f of ch.features || []) {
      const nm = String(f.name || "").toLowerCase();
      if (nm.startsWith("dwarven toughness")) n += this.totalLevel(ch);
      else if (nm.startsWith("draconic resilience")) n += (this.classList(ch).find((c) => c.cls === "Sorcerer") || {}).level || 0;
    }
    return n;
  },
  hasFeature(ch, name) { return (ch.features || []).some((f) => String(f.name || "").toLowerCase().startsWith(name)); },

  unarmoredAC(ch) {
    // class unarmored defense from the PRIMARY class: Barbarian 10+Dex+Con, Monk 10+Dex+Wis
    const dex = this.abilityMod(ch, "dex");
    if (ch.cls === "Barbarian") return 10 + dex + this.abilityMod(ch, "con");
    if (ch.cls === "Monk" && !ch.combat.shield) return 10 + dex + this.abilityMod(ch, "wis");   // no shield for a monk
    // Draconic Resilience (Sorcerer): 2014 13 + Dex, 2024 10 + Dex + Cha
    if (this.hasFeature(ch, "draconic resilience")) return ch.edition === "2024" ? 10 + dex + this.abilityMod(ch, "cha") : 13 + dex;
    return 10 + dex;
  },

  armorClass(ch) {
    let auto;
    if (ch.combat.armorBaseAC == null) {
      auto = this.unarmoredAC(ch);                       // 10 + Dex (+ class unarmored defense)
    } else {
      // base number + an optional Dex rule (heavy/fixed = none; light/natural = full Dex; medium = max +2)
      auto = ch.combat.armorBaseAC;
      const mode = ch.combat.armorDexMode || "none";
      const dex = this.abilityMod(ch, "dex");
      if (mode === "full") auto += dex;
      else if (mode === "med") auto += Math.min(2, dex);
      else if (mode === "con") auto += this.abilityMod(ch, "con");   // e.g. Loxodon 12 + Con
    }
    const shield = ch.combat.shield ? 2 : 0;
    const gear = (ch.inventory || []).filter((i) => i.equipped).reduce((s, i) => s + (+i.acBonus || 0), 0);
    // the Shield spell (+5 until the start of your next turn) sits on top of any override
    return ov(ch, "ac", auto + shield + gear + this.featBonus(ch, "ac")) + (ch.combat.shieldSpell ? 5 : 0);
  },

  isCaster(ch) {
    return this.classList(ch).some((c) => { const cc = (RULES.CLASSES[c.cls] || {}).caster; return cc && cc !== "none"; });
  },

  // Primary spellcasting ability (for the single-class DC/attack chips & overrides).
  spellAbility(ch) {
    if (ch.spells.abilityOverride) return ch.spells.abilityOverride;
    const c = this.classList(ch).find((x) => (RULES.CLASSES[x.cls] || {}).ability);
    return c ? RULES.CLASSES[c.cls].ability : null;
  },

  spellSaveDC(ch) {
    const ab = this.spellAbility(ch);
    if (!ab) return null;
    return ov(ch, "spellDC", 8 + this.prof(ch) + this.abilityMod(ch, ab) + this.featBonus(ch, "spellDC"));
  },
  spellAttack(ch) {
    const ab = this.spellAbility(ch);
    if (!ab) return null;
    return ov(ch, "spellAtk", this.prof(ch) + this.abilityMod(ch, ab) + this.featBonus(ch, "spellAttack"));
  },

  // Combined multiclass spellcaster level (drives shared spell slots).
  // full = +level; Paladin/Ranger = floor(level/2) when multiclassed, ceil when single;
  // Artificer = ceil(level/2); Warlock (pact) is tracked separately.
  casterLevel(ch) {
    const list = this.classList(ch);
    const multi = list.length > 1;
    let cl = 0;
    for (const c of list) {
      const info = RULES.CLASSES[c.cls] || {};
      if (info.caster === "full") cl += c.level;
      else if (info.caster === "half") {
        // Artificer casts from level 1 (round up). Paladin/Ranger have no spells at level 1;
        // single-class rounds up from level 2, multiclass contributes floor(level/2).
        if (c.cls === "Artificer") cl += Math.ceil(c.level / 2);
        else if (multi) cl += Math.floor(c.level / 2);
        else cl += c.level < 2 ? 0 : Math.ceil(c.level / 2);
      }
    }
    return cl;
  },

  spellSlots(ch) {
    const cl = Math.min(20, this.casterLevel(ch));
    const table = cl >= 1 ? (RULES.FULL_SLOTS[cl] || ZERO9) : ZERO9;
    const out = {};
    for (let i = 1; i <= 9; i++) {
      const auto = (table[i - 1] || 0) + this.featBonus(ch, "slot." + i); // + extra slots from features/items
      const max = ov(ch, "slotMax." + i, ch.spells.slots[i]?.override ?? auto);
      out[i] = { max, used: Math.min(ch.spells.slots[i]?.used || 0, max) };
    }
    return out;
  },

  pactMagic(ch) {
    const w = this.classList(ch).find((c) => (RULES.CLASSES[c.cls] || {}).caster === "pact");
    if (!w) return null;
    const p = RULES.PACT[w.level] || { n: 0, l: 0 };
    return { max: p.n, level: p.l, used: Math.min(ch.spells.pact.used || 0, p.n) };
  },

  /* How many spells a class gets, per edition (warn-only — the sheet never blocks):
     prep = prepared spells, known = spells known (2014 Bard/Sorcerer/Warlock/Ranger), cantrips.
     2014 from SRD 5.1 (dnd5eapi class levels), 2024 from the SRD 5.2 class tables (open5e). */
  spellLimits(ch, cls, level) {
    const info = RULES.CLASSES[cls] || {};
    if (!info.ability) return { prep: null, known: null, cantrips: null };
    const T = RULES.SPELL_TABLES[ch.edition === "2024" ? "2024" : "2014"][cls] || {};
    const at = (arr) => (arr ? arr[Math.max(1, Math.min(20, level)) - 1] : null);
    let prep = at(T.prep);
    if (prep == null && info.prepares) {
      // 2014 preparers: ability mod + class level (Paladin/Artificer: half level), min 1
      prep = (cls === "Paladin" && level < 2) ? 0 : Math.max(1, this.abilityMod(ch, info.ability) + Math.floor(level * (info.prepFactor || 1)));
    }
    return { prep: prep ?? null, known: at(T.known) ?? null, cantrips: at(T.cantrips) || null };
  },

  // Per spellcasting class: ability, DC, attack, prepared allowance. Used by the
  // Spells tab (one row for single-class, several when multiclassed).
  castingClasses(ch) {
    const prof = this.prof(ch);
    return this.classList(ch).map((c) => {
      const info = RULES.CLASSES[c.cls] || {};
      if (!info.ability) return null;
      const abMod = this.abilityMod(ch, info.ability);
      return {
        cls: c.cls, level: c.level, ability: info.ability, caster: info.caster,
        dc: 8 + prof + abMod,
        attack: prof + abMod,
        prepares: this.spellLimits(ch, c.cls, c.level).prep != null,
        prepared: this.spellLimits(ch, c.cls, c.level).prep,
        known: this.spellLimits(ch, c.cls, c.level).known,
      };
    }).filter(Boolean);
  },

  preparedCount(ch) {
    const p = this.spellLimits(ch, ch.cls, ch.level).prep;
    return p == null ? null : ov(ch, "preparedCount", p);
  },
  knownCount(ch) {
    const k = this.spellLimits(ch, ch.cls, ch.level).known;
    return k == null ? null : ov(ch, "knownCount", k);
  },
  cantripCount(ch) {
    const k = this.spellLimits(ch, ch.cls, ch.level).cantrips;
    return k == null ? null : ov(ch, "cantripCount", k);
  },
  // does this character prepare spells (2024: every caster) or know a fixed list (2014 Bard/Sorc/Warlock/Ranger)?
  prepares(ch) { return this.spellLimits(ch, ch.cls, ch.level).prep != null; },

  // Hit dice grouped by die size, e.g. {10: 5, 6: 1} for Fighter5/Wizard1.
  hitDicePool(ch) {
    const pool = {};
    for (const c of this.classList(ch)) {
      const die = (RULES.CLASSES[c.cls] || {}).hitDie || 8;
      pool[die] = (pool[die] || 0) + c.level;
    }
    return pool;
  },
};

window.Calc = Calc;
