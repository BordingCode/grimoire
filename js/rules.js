/* Grimoire — static 5e rules data (edition-agnostic where the maths is the same
   for 2014 and 2024; spell *lists* are what differ and live per-spell).
   Auto-calc uses these; every derived value also accepts a manual override. */
"use strict";

const ABILITIES = ["str", "dex", "con", "int", "wis", "cha"];
const ABILITY_NAMES = { str: "Strength", dex: "Dexterity", con: "Constitution", int: "Intelligence", wis: "Wisdom", cha: "Charisma" };

// skill -> governing ability
const SKILLS = {
  "Acrobatics": "dex", "Animal Handling": "wis", "Arcana": "int", "Athletics": "str",
  "Deception": "cha", "History": "int", "Insight": "wis", "Intimidation": "cha",
  "Investigation": "int", "Medicine": "wis", "Nature": "int", "Perception": "wis",
  "Performance": "cha", "Persuasion": "cha", "Religion": "int", "Sleight of Hand": "dex",
  "Stealth": "dex", "Survival": "wis",
};

function profBonus(level) { return 2 + Math.floor((Math.max(1, level) - 1) / 4); }

// Full-caster spell slots [classLevel] -> [lvl1..lvl9]
const FULL_SLOTS = {
  1: [2,0,0,0,0,0,0,0,0], 2: [3,0,0,0,0,0,0,0,0], 3: [4,2,0,0,0,0,0,0,0],
  4: [4,3,0,0,0,0,0,0,0], 5: [4,3,2,0,0,0,0,0,0], 6: [4,3,3,0,0,0,0,0,0],
  7: [4,3,3,1,0,0,0,0,0], 8: [4,3,3,2,0,0,0,0,0], 9: [4,3,3,3,1,0,0,0,0],
  10:[4,3,3,3,2,0,0,0,0], 11:[4,3,3,3,2,1,0,0,0], 12:[4,3,3,3,2,1,0,0,0],
  13:[4,3,3,3,2,1,1,0,0], 14:[4,3,3,3,2,1,1,0,0], 15:[4,3,3,3,2,1,1,1,0],
  16:[4,3,3,3,2,1,1,1,0], 17:[4,3,3,3,2,1,1,1,1], 18:[4,3,3,3,3,1,1,1,1],
  19:[4,3,3,3,3,2,1,1,1], 20:[4,3,3,3,3,2,2,1,1],
};
// Half-caster (Paladin, Ranger): uses half level rounded down, min table from lvl2
function halfSlots(level) {
  const eff = Math.floor(level / 2);
  return eff >= 1 ? (FULL_SLOTS[eff] || [0,0,0,0,0,0,0,0,0]) : [0,0,0,0,0,0,0,0,0];
}
// Warlock Pact Magic: {count, level} recovered on a SHORT rest
const PACT = {
  1:{n:1,l:1},2:{n:2,l:1},3:{n:2,l:2},4:{n:2,l:2},5:{n:2,l:3},6:{n:2,l:3},
  7:{n:2,l:4},8:{n:2,l:4},9:{n:2,l:5},10:{n:2,l:5},11:{n:3,l:5},12:{n:3,l:5},
  13:{n:3,l:5},14:{n:3,l:5},15:{n:3,l:5},16:{n:3,l:5},17:{n:4,l:5},18:{n:4,l:5},
  19:{n:4,l:5},20:{n:4,l:5},
};

// caster: full|half|pact|none ; prepares: true => count = abilMod + factor*level
const CLASSES = {
  "Barbarian": { hitDie: 12, saves: ["str","con"], caster: "none" },
  "Bard":      { hitDie: 8,  saves: ["dex","cha"], caster: "full", ability: "cha", prepares: false },
  "Cleric":    { hitDie: 8,  saves: ["wis","cha"], caster: "full", ability: "wis", prepares: true,  prepFactor: 1 },
  "Druid":     { hitDie: 8,  saves: ["int","wis"], caster: "full", ability: "wis", prepares: true,  prepFactor: 1 },
  "Fighter":   { hitDie: 10, saves: ["str","con"], caster: "none" },
  "Monk":      { hitDie: 8,  saves: ["str","dex"], caster: "none" },
  "Paladin":   { hitDie: 10, saves: ["wis","cha"], caster: "half", ability: "cha", prepares: true,  prepFactor: 0.5 },
  "Ranger":    { hitDie: 10, saves: ["str","dex"], caster: "half", ability: "wis", prepares: false },
  "Rogue":     { hitDie: 8,  saves: ["dex","int"], caster: "none" },
  "Sorcerer":  { hitDie: 6,  saves: ["con","cha"], caster: "full", ability: "cha", prepares: false },
  "Warlock":   { hitDie: 8,  saves: ["wis","cha"], caster: "pact", ability: "cha", prepares: false },
  "Wizard":    { hitDie: 6,  saves: ["int","wis"], caster: "full", ability: "int", prepares: true,  prepFactor: 1 },
  "Artificer": { hitDie: 8,  saves: ["con","int"], caster: "half", ability: "int", prepares: true,  prepFactor: 0.5 },
};

const CONDITIONS = [
  "Blinded","Charmed","Deafened","Exhaustion","Frightened","Grappled","Incapacitated",
  "Invisible","Paralyzed","Petrified","Poisoned","Prone","Restrained","Stunned","Unconscious",
];

// expose
window.RULES = { ABILITIES, ABILITY_NAMES, SKILLS, CONDITIONS, CLASSES, FULL_SLOTS, PACT, profBonus, halfSlots };
