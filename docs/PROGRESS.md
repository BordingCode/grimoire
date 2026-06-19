# Grimoire — Progress / Resume State

**Last updated:** 2026-06-19 (session building Phase 1)
**Live:** https://bordingcode.github.io/grimoire/ · **Repo:** BordingCode/grimoire · **Dir:** ~/cc/grimoire

> This file is the hand-off. If a session stops, read this + `docs/PLAN.md` and continue.

## How to resume
1. `cd ~/cc/grimoire`
2. Read `docs/PLAN.md` (decisions + phase roadmap) and this file.
3. Local test: `python3 -m http.server 8765` then open http://localhost:8765 (or use Playwright at 390×844).
4. Deploy = commit + push; bump `?v=` in index.html + `CACHE` in sw.js when css/js/data change. Verify live URL after (Pages lags 1–3 min).

## Architecture (files) — split into layers at v19
Load order (index.html): rules → state → calc → util → views → app → link. All classic scripts share one global lexical scope (top-level const/function visible across files at runtime).
- `js/rules.js` — static 5e data: ABILITIES, SKILLS, CLASSES, SUBCLASSES, CONDITIONS/CONDITION_INFO, FULL_SLOTS/halfSlots/PACT, profBonus(). → `window.RULES`
- `js/state.js` — `Store` (characters[], activeId, localStorage autosave, CRUD), `Gx` (newCharacter/export/import/uid). Keys `grimoire.characters.v1`, `grimoire.active.v1`. `importCharacter` is a top-level fn (global).
- `js/calc.js` — `Calc`: all derived stats; every value passes through `ov(ch,key,auto)` so `ch.overrides[key]` wins. featBonus(), classList/totalLevel/casterLevel, etc.
- `js/util.js` — generic helpers: $/esc/mdToHtml/sign, dmgMemory, rollDice/d20, toast/modal/closeModal, get/setPath, DMG_KEY. No app state.
- `js/views.js` — rendering only (pure): render(), viewHome/Party/New/Sheet, tab*, spellListSection/spellRow/spellListRowsHtml, read-only spell helpers (spellPool/findSpell/classSpells/subclassSpells/classSummary), FEAT_TARGETS/FEAT_TARGET_LABEL.
- `js/app.js` — behaviour: Grimoire/ui/Party globals, loadSpells, commit, the `actions{}` object, all *Form helpers + optionsMenu/confirmDelete/openSpell/maybeConcentration/spendSlot, event wiring, boot.
- `js/link.js` — cloud sync (Cloudflare worker).
- `data/spells-2014.json` (319), `data/spells-2024.json` (339) — built by `tools/build_spells.py` from Open5e v2.

## Done (Phase 0 + most of Phase 1)
- [x] Offline PWA shell, icons, manifest, SW (CACHE=grimoire-v2)
- [x] Spell pipeline (both editions) + bundled
- [x] New-character flow (name, edition, class, level, abilities) → auto starting HP
- [x] Stats tab: abilities+mods, saves (tap=proficient), skills (tap cycles none/prof/expertise), prof/passive/init chips, override on every derived value
- [x] Combat tab: AC (auto from gear+shield), HP +/- (temp HP absorbs first), max/temp edit, death saves, short/long rest (long resets slots+resources+concentration), conditions WITH round timers, resource trackers
- [x] Spells tab: save DC / attack / prepared-count, slot pips (tap to spend), warlock pact slots, lists (class/prepared/known/favorites), search+level filter, spell detail w/ cast (spend slot + upcast choice), attack roll, damage dice (remembers per spell), concentration start (blocks 2nd)
- [x] Gear tab: armor base AC, shield, inventory w/ equip toggle (AC auto-adjusts)
- [x] Notes tab
- [x] Export/import character (JSON, includes homebrew); char menu (export/rename/level/delete)
- [x] Hand-add spell form WITH source/citation field

## VERIFIED ✅ (Phase 1 complete, live)
- Browser-tested local + live. Wizard L5/INT18: prof +3, DC 15, atk +7, slots 4/3/2, prepared 9, HP 32 — all correct.
- Interactions pass: fav/prepare/known toggles, slot spend, condition timer tick, AC override, dice parse, long rest full restore, export round-trip, spell detail/cast/concentrate modal.
- Live https://bordingcode.github.io/grimoire/ boots clean (0 errors, 319+339 spells). Files serve v=2.
- Added to Bording Hub (Apps section, 'book' icon). Hub SW bumped v2→v3.

## ALSO done & verified (this session, post-Phase-1)
- [x] Spell damage auto-fill: build_spells.py captures damage/damageType/upcast; cast box pre-fills damage + auto-swaps to upcast value at higher slot (Fireball L5→10d6). Verified.
- [x] Concentration CON-save prompt fires on damage (DC max(10,½dmg), adv/dis, fail drops concentration). Verified DC 10 for 5 dmg.
- [x] Advantage/disadvantage buttons on spell attack rolls. Verified.
- [x] Class-aware unarmored AC (Barbarian 10+Dex+Con, Monk 10+Dex+Wis). Verified.
- [x] Hit dice tracker + Spend-to-heal (rolls die+CON). Verified Wizard L5 d6.
- [x] Condition effect descriptions (tap a condition / shown in add-picker) — 15 SRD reminders in RULES.CONDITION_INFO.
- Current cache: **v6** (index.html css/js ?v=6, data ?v=6, sw CACHE=grimoire-v6).
- **Multi-class verification passed** (Barbarian AC15/non-caster, Cleric DC14/slots4-3-2/prep8/wis, Warlock pact 2@L3) — math correct across class types.

## Session end-state (2026-06-19)
Phase 1 + polish is COMPLETE, verified locally & live, all pushed. Live boots clean (0 errors, 658 spells). Grimoire is in the Bording Hub.
**Next collaborative session:** Phase 4 cloud linking — see `docs/LINKING.md` (design ready; needs Mathias present to deploy the Cloudflare Worker + confirm the parameter-group UX). Then Phase 5 polish.

## Phase 4 — Character linking (cloud sync) — DONE & LIVE ✅
- Cloudflare Worker deployed: **https://grimoire-sync.mathiasjob.workers.dev** (worker/index.js, KV namespace LINKS id 607fb02528244acb86c681de239bcaf3). Newest-wins relay keyed by link code.
- `js/link.js` — per-parameter group sync (Physical/Resources/Mental/Identity/Gear) + presets (Share everything / Shape-shift body-only); debounced auto-push on change; pull on boot + visibilitychange; manual pull/push; unlink. Char menu → "Link with another player".
- TOKEN NOTE: `~/.cloudflare-token` is a shell export line — `source ~/.cloudflare-token` (don't read field-by-field). Then `cd worker && npx wrangler deploy` to redeploy.
- `worker/dev-mock.js` = local Node stand-in (workerd won't run on the Pi, so `wrangler dev` fails with tcmalloc OOM — use the mock for local tests, set localStorage `grimoire.worker=http://localhost:8787`).
- Verified end-to-end on the LIVE site + worker: join pulls partner char, HP edits sync, shape-shift shares body not mind.
- Current cache: **v8**.

## Multiclassing — DONE & LIVE ✅ (cache v9)
- Model: primary `cls`/`level` + `ch.multiclass = [{cls,level}]`. Total level → proficiency.
- `Calc.casterLevel` combines for shared slots: full=+lvl, Paladin/Ranger=floor(lvl/2) when multiclassed / ceil when single (fixed a single half-caster rounding bug), Artificer=ceil, Warlock pact separate. `Calc.castingClasses` gives per-class DC/atk/prepared.
- UI: char menu → "Classes & levels" manager; Spells tab shows per-class casting rows + combined slots; spell library merges all classes; hit-dice breakdown (5d10+1d6) with die picker. Linking syncs `multiclass` (identity group).
- Verified live incl. Paladin6/Warlock3 (standard 4/2 + pact 2@L2), Wiz5/Cle1=4/3/3, single Pal5=4/2.

## Weapons / kill-count / resource-edit / safe-delete — DONE & LIVE ✅ (cache v10)
- Weapons: `ch.weapons[{id,name,atk,damage,damageType,notes}]`, Combat tab section, tap → roll attack(adv/dis)+damage. Synced via link gear group.
- Kill count: `Party` (localStorage `grimoire.party.v1`), home → "Kill count" screen, leaderboard +1/−, reset. LOCAL only (not synced) — possible future: sync via a party link code.
- Resources now editable (name/max/reset/note) via `resForm`; note shown on card.
- Two-step delete: `confirmDelete(msg, cb)` modal guards resources/items/weapons/party. Character delete still uses native confirm(); conditions stay one-tap (transient).

## Features & traits — DONE & LIVE ✅ (cache v14)
- v14 added skill bonus targets (skill.all + each skill) to FEAT_TARGETS; Calc.skillBonus applies them (flows into passive perception). Ability-score increases intentionally NOT a bonus target (edit the score directly to avoid double-count). Non-numeric/conditional features (resistances, extra attack, advantage, senses, situational AC) are description-only by design.
- Stats tab "Features & traits": `ch.features[{id,name,desc,bonuses:[{target,value}]}]`, ⋯ edit/delete.
- Auto-bonuses: `Calc.featBonus(ch,target)` sums into AC, initiative, speed, saves (save.all + save.<ab>), spell DC/attack, passive perception, max HP (`Calc.maxHP`), and all-weapon attack/damage (weaponAttack/weaponDamage applied in weapon display + wpnAtk/wpnDmg). Overrides still win. Targets list = FEAT_TARGETS in app.js.
- Cards show gold bonus tags; weapon attack/damage conditional ones (Archery/Dueling) advised to live on the specific weapon. Synced via link mental group.

## v15: bonus slots + off-class spells
- FEAT_TARGETS gains slot.1..9 ("Extra level-N spell slot"); Calc.spellSlots adds featBonus("slot."+i) onto the computed table (override still wins). Handles Pearl of Power / subclass / item slots; persists across level-ups.
- Spellbook "All spells" filter (list==="all" → spellPool) lets you add off-class bonus spells (subclass/item/feat) to Known/Prepared. Prepared count is a guide, not enforced, so always-prepared spells are fine.

## Subclass auto-spells — DONE & LIVE ✅ (cache v16)
- RULES.SUBCLASSES (SRD only): Cleric Life Domain, Paladin Oath of Devotion, Warlock The Fiend, Druid Circle of the Land ×8 lands. Spell-name tables by class level (71 names, verified present both editions).
- ch.subclass set in Classes & levels manager (options from SRD subclasses of the char's classes). subclassSpells(ch) resolves names→edition pool, level-gated. Spellbook "Subclass" tab + badge; auto-prepared (P on), unioned into Prepared view, NOT counted vs prepared limit. Synced via link identity group.
- Non-SRD subclasses (Tempest, Archfey, etc.) = copyright, add via "All" tab.

## Spell tab verified (v17)
- Comprehensive class×level test vs official 5e tables: 0 failures. Full casters (Bard/Cleric/Druid/Sorcerer/Wizard) L1–20, half casters (Paladin/Ranger) L1–20, Artificer, Warlock pact, DC/attack, prepared counts, all-class render.
- BUG FIXED: Paladin/Ranger showed 2 slots at level 1; they have no spellcasting until L2. casterLevel single-class half non-Artificer now contributes 0 below level 2 (Artificer still casts at L1; multiclass uses floor).

## v18–v19: rules audit + modular split
- Full rules-audit harness passes 0 failures (mods, prof, skills+expertise+feat, saves, passive perc, AC variants, init, maxHP, hit-dice pool, short/long rest, export/import, concentration DC, full spell matrix). Bugs fixed: Paladin/Ranger L1 slots (v17), long-rest hit-dice uses total level (v18).
- app.js split into util.js + views.js + app.js (v19); verified 0 console errors + audit/UI smoke clean, live.

## v20: advantage + rollable saves/skills
- Saves & skills tappable to roll (🎲) with dis/normal/adv (rollCheck + actions.checkRoll/rollSave/rollSkill). Saves were previously display-only.
- Features can grant ADVANTAGE: feature.adv = [targets] via "Grants advantage on" section in the feature form. Calc.advSources(ch,target) (handles save.all/skill.all wildcards). Stats lines show green ADV badge; roll dialog + concentration prompt note the source and default to the Advantage button. ADV_TARGETS/ADV_LABEL in views.js. Synced via link (part of feature object, mental group).
- Note: advantage targets include save.concentration (War Caster). Conditional advantage (vs poison only) is description-only; the roller's adv button still lets you choose it.

## v21: items grant bonuses + advantage (when equipped)
- Inventory items now carry `bonuses` + `adv` (same editor as features — shared bonusRowsHtml/advRowsHtml/captureBonusAdvRows in app.js). Calc.featBonus & advSources include EQUIPPED items. Equip/unequip toggles all effects; gear list shows bonus/ADV tags (dimmed when unequipped). Legacy `acBonus` field still honored in armorClass. Synced via link gear group.

## v23: all PHB subclasses (names)
- RULES.SUBCLASSES expanded to every PHB subclass per class (+Artificer's 4). Spell table kept for the 4 SRD spell-granters (auto-spells, marked ✦ in picker); the rest are `null` = name-only (recorded + shown on sheet header, spells added via All tab). Only NAMES added (titles uncopyrightable); non-SRD spell lists/features NOT bundled by design.

## v24: Xanathar's + Tasha's subclass names
- EXTRA_SUBCLASSES merge block in rules.js adds XGE & TCE subclass names per class (108 subclasses total) as name-only nulls, without touching SRD spell tables. Same copyright stance: names only.

## v25: any subclass fully works via player-entered spells
- Non-SRD subclasses get a Subclass tab + "Set subclass spells" picker (actions.editSubSpells/ssToggle/ssSearch/ssDone; subListHtml). Ticked spells → ch.subSpells → behave like always-prepared subclass spells (subclassSpells() falls back to ch.subSpells when no built-in table; subclassHasBuiltin() helper). Picker note = ownership attestation. LEGAL because the player enters content they own; Grimoire still bundles only SRD. subSpells synced via link mental group.
- NOTE on the "ship-it-behind-a-checkbox" request: declined — distributing copyrighted text is infringement regardless of recipient ownership, and it'd sit in the public repo. The player-entry path achieves the same result legally.

## v28: drag-to-reorder in Arrange mode (replaced v27 move buttons)
- ⠿ Arrange toggle in sheet header (ui.reorder, off by default). When on: grip handles + data-sortlist/data-sortid render on rows. Pointer-based sortable (app.js: initSortables/dragStart/dragMove/dragEnd/applySortOrder) works touch+mouse; handle has touch-action:none. Live DOM reorder, commit on drop.
- Reorderable: features, resources, weapons, inventory items, curated spell lists (spell:<list>). Curated spell lists still skip auto-sort to keep manual order. Weapon row = div + .drag-handle + .weapon-main.

## v29: character photo + Appearance (dark/light + per-class accent)
- Photo: ch.portrait (downscaled ~320px JPEG data-URL via downscaleImage); char menu → "Character photo"; avatar in header (tap=change) + home card. Synced (identity group).
- Appearance: global Dark/Light (localStorage grimoire.mode) + per-character accent (ch.accent, default RULES.CLASS_ACCENT[cls]). applyTheme() (called in render) sets --accent/--accent-2 + luminance-based --on-accent. Light theme = :root[data-theme=light] vars. Char menu → "Appearance".
- Each class has a signature accent (RULES.ACCENTS + CLASS_ACCENT in rules.js).

## v30: update prompt (fixes stale-cache for good)
- sw.js no longer auto-skipWaiting (waits); activates on page message "skipWaiting". app.js registration detects updatefound→installed (with controller) and shows a persistent toast with a Reload button (doUpdate). controllerchange reloads once, guarded by _doReload so first install never loops. Hourly reg.update() check. Verified end-to-end.
- Takes effect from v30 onward (v29→v30 auto-updates via old skipWaiting; v30→v31+ shows the prompt).

## NOT yet done / next steps
- [ ] Phase 5 polish: leveling helper, printable sheet.
- [ ] Possible: drag-to-reorder (touch) instead of move buttons, if desired.
- [ ] Minor cosmetic: preparedCount shows ≥1 even for a level-1 Paladin/Ranger (who can't prepare yet) — harmless since they have 0 slots.
- [ ] Maybe: sync the kill-count across the group (own link code); auto-suggest party names from saved characters.
- [ ] Multiclass nicety: hit-dice used isn't tracked per-die-size (single counter); HP not auto-recomputed when adding a class (user sets max HP manually — noted in the manager).
- [ ] Optional: small auto-poll while a linked sheet is open (currently pulls on open + visibility + manual).

## Known limitations / decisions to remember
- Spell damage dice aren't in SRD data cleanly → cast modal has a damage field that REMEMBERS what you type per spell (localStorage `grimoire.dmg.v1`). Not auto-filled first time. (Could enhance build_spells to capture casting_options damage later.)
- Class rules are edition-agnostic for v1 (slots/DC same 2014/2024); only spell *lists* differ by edition. Subclass casters (EK/AT) not auto — use slot override.
- Prepared/known is not hard-enforced; player toggles freely (matches how Spells-5e-style apps work).
