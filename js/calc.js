/* Grimoire — derived stats. Every function checks ch.overrides[key] first so a
   player can pin any value (magic items, odd builds) — research showed the #1
   auto-calc complaint is it being WRONG with no way to fix it. */
"use strict";

function ov(ch, key, auto) {
  const o = ch.overrides ? ch.overrides[key] : undefined;
  return (o === undefined || o === null || o === "") ? auto : o;
}

const Calc = {
  mod(score) { return Math.floor((score - 10) / 2); },

  abilityMod(ch, ab) { return this.mod(ch.abilities[ab]); },

  prof(ch) { return ov(ch, "prof", RULES.profBonus(ch.level)); },

  classInfo(ch) { return RULES.CLASSES[ch.cls] || { caster: "none", saves: [] }; },

  saveBonus(ch, ab) {
    const base = this.abilityMod(ch, ab) + (ch.saveProf[ab] ? this.prof(ch) : 0);
    return ov(ch, "save." + ab, base);
  },

  skillBonus(ch, skill) {
    const ab = RULES.SKILLS[skill];
    const p = ch.skillProf[skill] || 0;
    const base = this.abilityMod(ch, ab) + p * this.prof(ch);
    return ov(ch, "skill." + skill, base);
  },

  passivePerception(ch) { return ov(ch, "passivePerception", 10 + this.skillBonus(ch, "Perception")); },

  initiative(ch) { return ov(ch, "initiative", this.abilityMod(ch, "dex")); },

  speed(ch) { return ov(ch, "speed", ch.combat.speed || 30); },

  armorClass(ch) {
    const auto = (ch.combat.armorBaseAC == null)
      ? 10 + this.abilityMod(ch, "dex")                 // unarmored
      : ch.combat.armorBaseAC;                           // armor sets the base
    const shield = ch.combat.shield ? 2 : 0;
    const gear = (ch.inventory || []).filter((i) => i.equipped).reduce((s, i) => s + (+i.acBonus || 0), 0);
    return ov(ch, "ac", auto + shield + gear);
  },

  spellAbility(ch) { return ch.spells.abilityOverride || this.classInfo(ch).ability || null; },

  isCaster(ch) { return this.classInfo(ch).caster && this.classInfo(ch).caster !== "none"; },

  spellSaveDC(ch) {
    const ab = this.spellAbility(ch);
    if (!ab) return null;
    return ov(ch, "spellDC", 8 + this.prof(ch) + this.abilityMod(ch, ab));
  },

  spellAttack(ch) {
    const ab = this.spellAbility(ch);
    if (!ab) return null;
    return ov(ch, "spellAtk", this.prof(ch) + this.abilityMod(ch, ab));
  },

  // Standard (Vancian) slots: {1:{max,used}, ...}. Empty for warlocks (they use pact).
  spellSlots(ch) {
    const info = this.classInfo(ch);
    let table = [0,0,0,0,0,0,0,0,0];
    if (info.caster === "full") table = RULES.FULL_SLOTS[ch.level] || table;
    else if (info.caster === "half") table = RULES.halfSlots(ch.level);
    const out = {};
    for (let i = 1; i <= 9; i++) {
      const auto = table[i - 1] || 0;
      const max = ov(ch, "slotMax." + i, ch.spells.slots[i]?.override ?? auto);
      out[i] = { max, used: Math.min(ch.spells.slots[i]?.used || 0, max) };
    }
    return out;
  },

  pactMagic(ch) {
    if (this.classInfo(ch).caster !== "pact") return null;
    const p = RULES.PACT[ch.level] || { n: 0, l: 0 };
    return { max: p.n, level: p.l, used: Math.min(ch.spells.pact.used || 0, p.n) };
  },

  // Suggested number of prepared spells (editable). null if class doesn't "prepare".
  preparedCount(ch) {
    const info = this.classInfo(ch);
    if (!info.prepares) return null;
    const abMod = this.abilityMod(ch, info.ability);
    const base = Math.max(1, abMod + Math.floor(ch.level * (info.prepFactor || 1)));
    return ov(ch, "preparedCount", base);
  },
};

window.Calc = Calc;
