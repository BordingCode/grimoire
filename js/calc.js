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
  speed(ch) { return ov(ch, "speed", (ch.combat.speed || 30) + this.featBonus(ch, "speed")); },
  maxHP(ch) { return Math.max(0, (ch.combat.hpMax || 0) + this.featBonus(ch, "hpMax")); },

  unarmoredAC(ch) {
    // class unarmored defense from the PRIMARY class: Barbarian 10+Dex+Con, Monk 10+Dex+Wis
    const dex = this.abilityMod(ch, "dex");
    if (ch.cls === "Barbarian") return 10 + dex + this.abilityMod(ch, "con");
    if (ch.cls === "Monk") return 10 + dex + this.abilityMod(ch, "wis");
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
    return ov(ch, "ac", auto + shield + gear + this.featBonus(ch, "ac"));
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
        prepares: !!info.prepares,
        prepared: info.prepares ? Math.max(1, abMod + Math.floor(c.level * (info.prepFactor || 1))) : null,
      };
    }).filter(Boolean);
  },

  preparedCount(ch) {
    const info = RULES.CLASSES[ch.cls] || {};
    if (!info.prepares) return null;
    const abMod = this.abilityMod(ch, info.ability);
    return ov(ch, "preparedCount", Math.max(1, abMod + Math.floor(ch.level * (info.prepFactor || 1))));
  },

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
