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

// Short SRD-accurate reminders of what each condition does (free SRD text, summarised).
const CONDITION_INFO = {
  "Blinded": "Can't see; auto-fail sight checks. Attacks against you have advantage; your attacks have disadvantage.",
  "Charmed": "Can't attack the charmer or target them with harmful effects. The charmer has advantage on social checks with you.",
  "Deafened": "Can't hear; auto-fail any check that needs hearing.",
  "Exhaustion": "Tracked in 6 levels: 1 disadvantage on ability checks · 2 speed halved · 3 disadvantage on attacks & saves · 4 HP max halved · 5 speed 0 · 6 death.",
  "Frightened": "Disadvantage on checks & attacks while the source is in sight; can't willingly move closer to it.",
  "Grappled": "Speed becomes 0. Ends if the grappler is incapacitated or you're moved away.",
  "Incapacitated": "Can't take actions or reactions.",
  "Invisible": "Can't be seen without magic/special sense. Attacks against you have disadvantage; your attacks have advantage.",
  "Paralyzed": "Incapacitated, can't move or speak. Auto-fail STR & DEX saves. Attacks against you have advantage; any hit from within 5 ft is a crit.",
  "Petrified": "Turned to stone: incapacitated, unaware. Resistance to all damage; immune to poison/disease. Auto-fail STR & DEX saves; attacks have advantage.",
  "Poisoned": "Disadvantage on attack rolls and ability checks.",
  "Prone": "Can only crawl. Disadvantage on attacks. Attacks against you: advantage if attacker within 5 ft, else disadvantage.",
  "Restrained": "Speed 0. Attacks against you have advantage; your attacks have disadvantage. Disadvantage on DEX saves.",
  "Stunned": "Incapacitated, can't move, can barely speak. Auto-fail STR & DEX saves. Attacks against you have advantage.",
  "Unconscious": "Incapacitated, unaware, drop what you hold and fall prone. Auto-fail STR & DEX saves. Attacks have advantage; hits from within 5 ft are crits.",
};

// Subclasses, keyed by class -> subclass name -> spell table OR null.
// A spell table { classLevel: [spell names] } gives AUTO-SPELLS (SRD subclasses only — the
// only spell lists free to bundle). null = name-only (selectable & shown; add spells via the
// "All" tab). Subclass NAMES are titles (not copyrightable); their mechanics are NOT bundled.
// This is the Player's Handbook (2014) subclass roster.
const SUBCLASSES = {
  Artificer: { "Alchemist": null, "Armorer": null, "Artillerist": null, "Battle Smith": null },
  Barbarian: { "Path of the Berserker": null, "Path of the Totem Warrior": null },
  Bard: { "College of Lore": null, "College of Valor": null },
  Cleric: {
    "Knowledge Domain": null,
    "Life Domain": { 1: ["Bless", "Cure Wounds"], 3: ["Lesser Restoration", "Spiritual Weapon"], 5: ["Beacon of Hope", "Revivify"], 7: ["Death Ward", "Guardian of Faith"], 9: ["Mass Cure Wounds", "Raise Dead"] },
    "Light Domain": null, "Nature Domain": null, "Tempest Domain": null, "Trickery Domain": null, "War Domain": null,
  },
  Druid: {
    "Circle of the Land (Arctic)": { 3: ["Hold Person", "Spike Growth"], 5: ["Sleet Storm", "Slow"], 7: ["Freedom of Movement", "Ice Storm"], 9: ["Commune with Nature", "Cone of Cold"] },
    "Circle of the Land (Coast)": { 3: ["Mirror Image", "Misty Step"], 5: ["Water Breathing", "Water Walk"], 7: ["Control Water", "Freedom of Movement"], 9: ["Conjure Elemental", "Scrying"] },
    "Circle of the Land (Desert)": { 3: ["Blur", "Silence"], 5: ["Create Food and Water", "Protection from Energy"], 7: ["Blight", "Hallucinatory Terrain"], 9: ["Insect Plague", "Wall of Stone"] },
    "Circle of the Land (Forest)": { 3: ["Barkskin", "Spider Climb"], 5: ["Call Lightning", "Plant Growth"], 7: ["Divination", "Freedom of Movement"], 9: ["Commune with Nature", "Tree Stride"] },
    "Circle of the Land (Grassland)": { 3: ["Invisibility", "Pass without Trace"], 5: ["Daylight", "Haste"], 7: ["Divination", "Freedom of Movement"], 9: ["Dream", "Insect Plague"] },
    "Circle of the Land (Mountain)": { 3: ["Spider Climb", "Spike Growth"], 5: ["Lightning Bolt", "Meld into Stone"], 7: ["Stone Shape", "Stoneskin"], 9: ["Passwall", "Wall of Stone"] },
    "Circle of the Land (Swamp)": { 3: ["Acid Arrow", "Darkness"], 5: ["Water Walk", "Stinking Cloud"], 7: ["Freedom of Movement", "Locate Creature"], 9: ["Insect Plague", "Scrying"] },
    "Circle of the Land (Underdark)": { 3: ["Spider Climb", "Web"], 5: ["Gaseous Form", "Stinking Cloud"], 7: ["Greater Invisibility", "Stone Shape"], 9: ["Cloudkill", "Insect Plague"] },
    "Circle of the Moon": null,
  },
  Fighter: { "Champion": null, "Battle Master": null, "Eldritch Knight": null },
  Monk: { "Way of the Open Hand": null, "Way of Shadow": null, "Way of the Four Elements": null },
  Paladin: {
    "Oath of Devotion": { 3: ["Protection from Evil and Good", "Sanctuary"], 5: ["Lesser Restoration", "Zone of Truth"], 9: ["Beacon of Hope", "Dispel Magic"], 13: ["Freedom of Movement", "Guardian of Faith"], 17: ["Commune", "Flame Strike"] },
    "Oath of the Ancients": null, "Oath of Vengeance": null,
  },
  Ranger: { "Hunter": null, "Beast Master": null },
  Rogue: { "Thief": null, "Assassin": null, "Arcane Trickster": null },
  Sorcerer: { "Draconic Bloodline": null, "Wild Magic": null },
  Warlock: {
    "The Archfey": null,
    "The Fiend": { 1: ["Burning Hands", "Command"], 3: ["Blindness/Deafness", "Scorching Ray"], 5: ["Fireball", "Stinking Cloud"], 7: ["Fire Shield", "Wall of Fire"], 9: ["Flame Strike", "Hallow"] },
    "The Great Old One": null,
  },
  Wizard: {
    "School of Abjuration": null, "School of Conjuration": null, "School of Divination": null, "School of Enchantment": null,
    "School of Evocation": null, "School of Illusion": null, "School of Necromancy": null, "School of Transmutation": null,
  },
};

// Expansion-book subclass NAMES (Xanathar's Guide + Tasha's Cauldron). Names only —
// their spell lists/features are non-SRD WotC content, so these are name-only (no auto-spells).
const EXTRA_SUBCLASSES = {
  Barbarian: ["Path of the Ancestral Guardian", "Path of the Storm Herald", "Path of the Zealot", "Path of the Beast", "Path of Wild Magic"],
  Bard: ["College of Glamour", "College of Swords", "College of Whispers", "College of Creation", "College of Eloquence"],
  Cleric: ["Forge Domain", "Grave Domain", "Order Domain", "Peace Domain", "Twilight Domain"],
  Druid: ["Circle of Dreams", "Circle of the Shepherd", "Circle of Spores", "Circle of Stars", "Circle of Wildfire"],
  Fighter: ["Arcane Archer", "Cavalier", "Samurai", "Psi Warrior", "Rune Knight"],
  Monk: ["Way of the Drunken Master", "Way of the Kensei", "Way of the Sun Soul", "Way of Mercy", "Way of the Astral Self"],
  Paladin: ["Oath of Conquest", "Oath of Redemption", "Oath of Glory", "Oath of the Watchers"],
  Ranger: ["Gloom Stalker", "Horizon Walker", "Monster Slayer", "Fey Wanderer", "Swarmkeeper"],
  Rogue: ["Inquisitive", "Mastermind", "Scout", "Swashbuckler", "Phantom", "Soulknife"],
  Sorcerer: ["Divine Soul", "Shadow Magic", "Storm Sorcery", "Aberrant Mind", "Clockwork Soul"],
  Warlock: ["The Celestial", "The Hexblade", "The Fathomless", "The Genie"],
  Wizard: ["War Magic", "Bladesinging", "Order of Scribes"],
};
for (const cls in EXTRA_SUBCLASSES) {
  SUBCLASSES[cls] = SUBCLASSES[cls] || {};
  for (const name of EXTRA_SUBCLASSES[cls]) if (!(name in SUBCLASSES[cls])) SUBCLASSES[cls][name] = null;
}

// accent colour palette [base, lighter] + the default accent key per class
const ACCENTS = {
  violet: ["#6d4aff", "#8b6dff"], azure: ["#4a8fff", "#74a9ff"], teal: ["#3fb0bf", "#6fcdd9"],
  green: ["#57a85a", "#79c47c"], gold: ["#e0b13a", "#f0cd6b"], orange: ["#d3863a", "#e8a866"],
  red: ["#e0564b", "#ef7a70"], crimson: ["#d44a6a", "#e8748f"], pink: ["#d36ad0", "#e592e2"], slate: ["#8b8f99", "#aeb2bb"],
};
const CLASS_ACCENT = {
  Artificer: "orange", Barbarian: "red", Bard: "pink", Cleric: "gold", Druid: "green",
  Fighter: "crimson", Monk: "teal", Paladin: "gold", Ranger: "green", Rogue: "slate",
  Sorcerer: "crimson", Warlock: "violet", Wizard: "violet",
};

// expose
window.RULES = { ABILITIES, ABILITY_NAMES, SKILLS, CONDITIONS, CONDITION_INFO, CLASSES, SUBCLASSES, FULL_SLOTS, PACT, ACCENTS, CLASS_ACCENT, profBonus, halfSlots };
