/* Grimoire — character state: model, autosave (localStorage), CRUD, export/import.
   Data loss with no backup is the #1 reason players quit these apps, so saving is
   eager and export/import is first-class and includes hand-added (homebrew) spells. */
"use strict";

const STORE_KEY = "grimoire.characters.v1";
const ACTIVE_KEY = "grimoire.active.v1";

const Store = {
  characters: [],
  activeId: null,

  load() {
    try { this.characters = JSON.parse(localStorage.getItem(STORE_KEY)) || []; }
    catch { this.characters = []; }
    this.activeId = localStorage.getItem(ACTIVE_KEY) || null;
  },
  save() {
    localStorage.setItem(STORE_KEY, JSON.stringify(this.characters));
    if (this.activeId) localStorage.setItem(ACTIVE_KEY, this.activeId);
  },
  active() { return this.characters.find((c) => c.id === this.activeId) || null; },
  setActive(id) { this.activeId = id; this.save(); },

  add(ch) { this.characters.push(ch); this.activeId = ch.id; this.save(); return ch; },
  remove(id) {
    this.characters = this.characters.filter((c) => c.id !== id);
    if (this.activeId === id) this.activeId = this.characters[0]?.id || null;
    this.save();
  },
  touch() { const c = this.active(); if (c) c.updatedAt = nowStamp(); this.save(); },
};

function uid() { return "c" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36); }
function nowStamp() { return new Date().toISOString(); }

/* Fresh character with sensible defaults. abilities are base scores. */
function newCharacter({ name, edition, cls, level }) {
  const def = (RULES.CLASSES[cls] || {});
  const slots = {};
  for (let i = 1; i <= 9; i++) slots[i] = { used: 0, override: null };
  return {
    id: uid(),
    schema: 1,
    name: name || "New Adventurer",
    edition: edition === "2024" ? "2024" : "2014",
    cls,
    level: Math.max(1, Math.min(20, level || 1)),
    multiclass: [],                // additional classes: [{cls, level}, ...]
    subclass: "",                  // primary-class subclass (for SRD auto-spells)
    abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    overrides: {},                 // keyed derived-stat overrides (null/undefined = auto)
    skillProf: {},                 // skill name -> 0 none, 1 proficient, 2 expertise
    saveProf: (def.saves || []).reduce((m, a) => ((m[a] = true), m), {}),
    combat: {
      hpMax: 0, hpCur: 0, hpTemp: 0,
      hitDiceUsed: 0,
      death: { succ: 0, fail: 0 },
      speed: 30,
      armorBaseAC: null,           // from equipped armor; null => 10 + Dex (unarmored)
      shield: false,
    },
    spells: {
      slots,                       // standard slots usage
      pact: { used: 0 },           // warlock pact magic usage
      known: [], prepared: [], favorites: [],   // spell ids
      concentratingOn: null,       // spell id or {name}
      abilityOverride: null,       // override spellcasting ability
    },
    resources: [],                 // {id,name,max,used,resetOn:'long'|'short',note}
    weapons: [],                   // {id,name,atk,damage,damageType,notes}
    inventory: [],                 // {id,name,qty,equipped,acBonus,notes}
    features: [],                  // {id,name,desc} — fighting styles, feats, traits, class features
    conditions: [],                // {name, rounds|null}
    customSpells: [],              // full spell objects (homebrew), with .custom=true & .sourceNote
    notes: "",
    createdAt: nowStamp(),
    updatedAt: nowStamp(),
  };
}

/* Export one character as a downloadable .json file (includes homebrew). */
function exportCharacter(ch) {
  const blob = new Blob([JSON.stringify(ch, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const safe = (ch.name || "character").replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  a.href = url; a.download = `grimoire-${safe}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* Import from a parsed object; assigns a fresh id so it never clobbers an existing one. */
function importCharacter(obj) {
  if (!obj || !obj.abilities || !obj.cls) throw new Error("Not a Grimoire character file.");
  const ch = JSON.parse(JSON.stringify(obj));
  ch.id = uid();
  ch.importedAt = nowStamp();
  return Store.add(ch);
}

window.Store = Store;
window.Gx = { newCharacter, exportCharacter, importCharacter, uid, nowStamp };
