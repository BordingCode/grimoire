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
- Current cache: **v4** (index.html css/js ?v=4, data ?v=4, sw CACHE=grimoire-v4).

## NOT yet done / next steps (in priority order)
- [ ] Phase 4: cloud linking (Cloudflare Worker + link code, per-parameter sharing). Account: see memory reference_cloudflare_account (token ~/.cloudflare-token). Newest-wins. NOTE: build worker code + frontend, but DEPLOY step (touches user's CF account, outward-facing) left for when user is present/approves.
- [ ] Phase 5 polish: subclass auto-spells, multiclass slots, leveling helper, printable sheet, hit-dice spend UI on short rest.

## Known limitations / decisions to remember
- Spell damage dice aren't in SRD data cleanly → cast modal has a damage field that REMEMBERS what you type per spell (localStorage `grimoire.dmg.v1`). Not auto-filled first time. (Could enhance build_spells to capture casting_options damage later.)
- Class rules are edition-agnostic for v1 (slots/DC same 2014/2024); only spell *lists* differ by edition. Subclass casters (EK/AT) not auto — use slot override.
- Prepared/known is not hard-enforced; player toggles freely (matches how Spells-5e-style apps work).
