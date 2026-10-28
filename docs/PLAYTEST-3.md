# Playtest session 3 — analysis (2026-10-28, app v91)

Five agents played a session on a local copy (in-memory sync mock):
Hill Dwarf Life Cleric 2014 · Wood Elf Hunter Ranger 2024 · Red Dragonborn Draconic Sorcerer 2014 (+ Gnome Bard 2024 / Fighter 1 multiclass) · Half-Orc Berserker Barbarian 2014 · DM running a 2014 campaign (goblins/bugbear/hobgoblin) with the 2024 ranger mixed in.
A reviewer agent then checked every finding against the code: 88 distinct findings → **68 confirmed, 18 rejected (by design / correct rules), 2 unsure**, plus 9 extra bugs found in code = **77 confirmed**.

Verified correct during play: AC (armor/shield/Unarmored Defense), weapon to-hit/damage auto, HP per level (class part), slots for every class tested incl. multiclass Bard3/Fighter1, save DC/attack, 2014 prepared counts, Sorcery Points, Rage/Relentless/Favored Enemy trackers, short/long-rest restores (2014), concentration saves, Shield +5, 2014 encounter difficulty (Hard, 1000 adj. XP), live party HP/AC, DM gifts, dark-mode layout. 0 console errors.

## P1 — wrong numbers on the sheet
| # | Change | Where | Size |
|---|---|---|---|
| P1-1 | Class spell lists polluted. 2014 data folds domain/patron lists into class tags (Cleric has Burning Hands/Fireball). `enrich()` merges 2014-era index classes into **2024** spells too (2024 Cleric +39, Warlock +29, Paladin +23 — e.g. Paladin gets Hunter's Mark). Stop enriching 2024; bake real SRD 5.1 base lists into spells-2014.json; keep the index only for greyed stubs. | js/app.js:78-87, tools/build_spells.py | M |
| P1-2 | +HP per level never applied (Hill Dwarf Dwarven Toughness, Draconic Resilience); creation HP uses pre-racial CON; max HP never follows CON changes. Add `hpPerLevel` bonus to Calc.maxHP + Δmod×level on CON change (toast). | calc.js:81, species.js:115, app.js:172, classfeat.js:39 | M |
| P1-3 | Draconic AC (2014 13+DEX, 2024 10+DEX+CHA) missing; Monk keeps Unarmored Defense with a shield. | calc.js:84-90,105 | S |
| P1-4 | Death saves: healing from 0 doesn't reset them; damage at 0 adds no failure; no massive-damage note. | app.js:1309-1330, 226-235 | S |
| P1-5 | "Spell attack" pill on ~25 non-attack spells (Hunter's Mark, Bless, Hex…); fake damage pills (Bless 1d4, Teleport 1d100). | build_spells.py:52,81; app.js:1297-1299 | S |
| P1-6 | Prepared/known/cantrip counts use 2014 formula for everyone; 2024 uses fixed tables for every caster (Ranger/Bard/Sorc/Warlock prepare). Amber warning when over — never block; keep `overrides.preparedCount`. | rules.js:44-58, calc.js:173-186, views.js:457-466 | M |
| P1-7 | 2024 long rest restores all hit dice (app uses 2014 half). | app.js:260 | S |
| P1-8 | "Supreme Healing" tagged as base Cleric feature (Life only). | tools/build_class_features.py | S |

## P2 — 2014/2024 mixing
- P2-1 Race list on new-character form hard-coded (Half-Elf/Half-Orc in 2024) → build from species-<ed>.json. views.js:244-247 · S
- P2-2 Subclass names edition-blind (2024 Bard shows Swords/Whispers; Ranger shows Horizon Walker…) → per-edition lists, keep Custom. rules.js:89-148, views.js:229-231 · S–M
- P2-3 2014 subclass spell tables used for 2024 (Life, Devotion, Fiend, Land). rules.js:93-122 · M
- P2-4 Condition text 2014-only (2024 Exhaustion is very different). rules.js:66-87 · S
- P2-5 SRD 5.2 species choices missing: Elven/Gnomish lineage, Fiendish Legacy, Giant/Draconic Ancestry, Keen Senses; also 2014 Draconic Ancestry (type/save/DC). tools/build_species.py, species.js · M–L
- P2-6 "2024" tag on DM roster when edition differs from campaign. · S

## P3 — friction every session
- P3-1 Level-up applies before confirm; closing "Leveled up" silently drops features; easy to double level. modal onClose hook + "Level 5 → 6" title. util.js:45-55, app.js:614-665 · S–M
- P3-2 New characters: race lost if race sheet closed; racial ability bonuses unticked by default (4 players hit it); class features unticked at creation. app.js:162-179, species.js:94, classfeat.js:96 · S
- P3-3 Rage state: raging chip, rage damage on STR melee, resistance/ADV reminders, ends on ✕/long rest. Keep out of `LINK.dmSig`. · M
- P3-4 Exhaustion levels 1–6, per-edition effect text, long rest −1. Keep out of dmSig. · S–M
- P3-5 Auto-Unconscious at 0 HP (removed on heal) + Relentless Endurance prompt. · S
- P3-6 DM: Next/Prev skip downed monsters; removing the current combatant resets round to 1. app.js:2552, 2596-2611 · S
- P3-7 Metamagic: only Twinned bundled; SRD 5.1 has 8, SRD 5.2 has 10. Check Fighting Styles/Invocations too. · S–M
- P3-8 Level-up summary should state real deltas (+1 cantrip, new spell level). app.js:656-657 · S
- P3-9 Cast sheet offers "Free cast (Favored Enemy · n left)". app.js:1361-1374 · S

## P4 — polish
Unconditional ADV wiring for traits + "situational" line (Gnomish Cunning, Fey Ancestry, Dwarven Resilience, Danger Sense) · auto-fill proficiencies/languages · bigger death-save pips (18px→36-44) · DM area damage per target ½/¼/×2/0 · "all down" label instead of "×0" · concentration banner at top of Combat · confirm before replacing concentration · Breath Weapon details · Stealth disadvantage marker · 2024 Weapon Mastery · Disciple of Life hint / Preserve Life pool · Font of Magic buttons · ranged/melee-only bonuses · 2024 SRD feat picker/ASI helper · Spells tab hide filters for non-casters + scroll to top on tab switch · homebrew monster auto-suffix instead of refusing SRD names + Vulnerabilities field · condition timers skip the round they're added · DM toolbar labels/stable layout/confirm Remove · short rest offers hit dice · "Book:" → "Rulebook:" · drop `_snap` on End combat · Hunter's Prey choice · initiative prompt for mid-combat PCs · 2024 Background step (low).

## Rejected / don't do
Dice roller · hard spell limits · DM pushing damage to players (read-only by design, adds writes) · XP/loot (declined) · ending concentration on short rest (correct per rules) · Favored Enemy as WIS mod (it's a fixed table) · sharing player initiative · removing non-SRD names (scope per edition instead) · hiding the Summons tile · DM edits overwritten when a player changes their sheet (by design, v85) · putting rage/exhaustion in the fast-sync signature (write budget).

## Suggested order
1. P1-1 + P1-5 (one data rebuild; bump `?v=` + SW cache) → 2. P1-4, P3-5, P1-7, P3-6 → 3. P1-2, P1-3 → 4. P3-1, P3-2 → 5. P1-6 + P3-8, then P2-1…P2-4 → 6. P3-3, P3-4, P3-7, P3-9, then P4.

Raw player reports (cleric/ranger/sorcerer/barbarian/dm) were in the session scratchpad.
