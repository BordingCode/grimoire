# Grimoire — Progress / Resume State

**Last updated:** 2026-06-19 (session building Phase 1)
**Live:** https://bordingcode.github.io/grimoire/ · **Repo:** BordingCode/grimoire · **Dir:** ~/cc/grimoire

> This file is the hand-off. If a session stops, read this + `docs/PLAN.md` and continue.

## How to resume
1. `cd ~/cc/grimoire`
2. Read `docs/PLAN.md` (decisions + phase roadmap) and this file.
3. Local test: `python3 -m http.server 8765` then open http://localhost:8765 (or use Playwright at 390×844).
4. Deploy = commit + push; bump `?v=` in index.html + `CACHE` in sw.js when css/js/data change. Verify live URL after (Pages lags 1–3 min).

## Architecture (files)
- `js/rules.js` — static 5e data: ABILITIES, SKILLS, CLASSES (hit die, saves, caster type, spell ability, prepare formula), FULL_SLOTS / halfSlots / PACT tables, profBonus(). → `window.RULES`
- `js/state.js` — `Store` (characters[], activeId, localStorage autosave, CRUD), `Gx` (newCharacter, exportCharacter, importCharacter, uid). Keys: `grimoire.characters.v1`, `grimoire.active.v1`.
- `js/calc.js` — `Calc`: all derived stats; every value passes through `ov(ch,key,auto)` so `ch.overrides[key]` wins (manual override feature).
- `js/app.js` — screens (home/new/sheet), tabs (stats/combat/spells/gear/notes), spell library, dice, modals, all `actions{}`, event wiring (click delegation on [data-act], input on [data-bind]).
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

## NOT yet done / next steps
- [ ] **VERIFY IN BROWSER** — was mid-test when writing this. Create a Wizard lvl5, check slots/DC, cast a spell, long rest, add condition w/ timer, export/import. Screenshot.
- [ ] Phase 4: cloud linking (Cloudflare Worker + link code, per-parameter sharing). Account: see memory reference_cloudflare_account (token ~/.cloudflare-token). Newest-wins.
- [ ] Add Grimoire to Bording Hub (~/cc/bording-hub/index.html SECTIONS array) — per standing instruction.
- [ ] Phase 5 polish: subclass auto-spells, multiclass slots, leveling helper, printable sheet.

## Known limitations / decisions to remember
- Spell damage dice aren't in SRD data cleanly → cast modal has a damage field that REMEMBERS what you type per spell (localStorage `grimoire.dmg.v1`). Not auto-filled first time. (Could enhance build_spells to capture casting_options damage later.)
- Class rules are edition-agnostic for v1 (slots/DC same 2014/2024); only spell *lists* differ by edition. Subclass casters (EK/AT) not auto — use slot override.
- Prepared/known is not hard-enforced; player toggles freely (matches how Spells-5e-style apps work).
