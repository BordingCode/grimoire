# Grimoire — Plan & Decisions

Phone-first **D&D 5e character sheet + spellbook** PWA. Personal tool for Mathias
and his group. Live: https://bordingcode.github.io/grimoire/ · Repo: BordingCode/grimoire

## Locked decisions

| Topic | Decision |
|---|---|
| Audience | Personal — Mathias + his group (not a public product) |
| Ruleset | Choose **2014 or 2024 per character**; spellbook shows only that edition |
| Spell data | Bundle **free SRD only** (Open5e v2): 319 spells (2014) + 339 (2024). |
| Missing spells | Non-SRD spells (full PHB) are **not legally bundleable** → players **hand-add** them; stored locally, never shipped/published |
| Slots & spell lists | **Auto from class + level** (like the "Spells 5e" app): auto slots, prepared count, spell save DC/attack, class-filtered library |
| Storage | **Local-first** (on device), works offline; multiple characters |
| Sharing | Export/import a character; **+ optional cloud "link" (below)** |
| Character linking | Link 2+ sheets, choose **per-parameter** what's shared (Physical / Mental / Identity groups). Sync via **Cloudflare backend + a shared link code**, newest-wins (no simultaneous play). |
| Stack | Vanilla HTML/CSS/JS, no bundler. Conventions: index.html + css/ + js/ + icons/ + data/, manifest.json, sw.js, .nojekyll, `?v=` cache-busting + `CACHE` bump |
| Naming | "Grimoire" (working name, easy to rename) |

## Build phases

**Phase 0 — Foundation (DONE, live)**
- [x] Spell pipeline `tools/build_spells.py` → data/spells-{2014,2024}.json
- [x] PWA shell (manifest, offline SW, icon, theme), verified in browser
- [x] Repo + GitHub Pages

**Phase 1 — Working sheet (next)**  *(priority reordered per research)*
- [ ] New character flow: pick edition → class, level, abilities, name
- [ ] Auto: modifiers, proficiency bonus, skills, saves — **each with a manual override/"flat" toggle** (research: #1 complaint is auto-calc being *wrong* for magic items/edge cases)
- [ ] Combat block: AC (auto-adjusts with equipped armor), HP (current/max/**temp**), hit dice, death saves, initiative, speed
- [ ] Spellbook: slots by class+level, **three lists per character — known / prepared / favorites**, spell cards, cast = spend slot + roll **spell** attack/damage **with upcasting**
- [ ] **One-tap Long Rest = regain all slots + reset all daily-use trackers**; Short Rest too
- [ ] **Concentration**: single "C" marker that blocks a 2nd concentration spell; on taking damage, prompt a CON save at **DC = max(10, ½ damage)**
- [ ] Class resource trackers (Rage, Ki, etc.), reset on rest
- [ ] Inventory + currency (equipped gear adjusts AC), notes
- [ ] **Export/import a character file — early & robust** (research: data-loss-with-no-backup is the #1 quit driver; export MUST include homebrew)
- [ ] Multiple characters; autosave (localStorage)

**Phase 2 — At-the-table combat (promoted by research)**
- [ ] Conditions tracker **with round durations/timers** that count down
- [ ] Initiative / turn tracker (HP, temp HP, death saves visible)

**Phase 3 — Homebrew authoring (promoted by research)**
- [ ] Fast hand-add spell form **+ a "source/citation" field** (label where a non-SRD spell came from)
- [ ] Add unofficial classes/subclasses
- [ ] Homebrew survives export/import faithfully

**Phase 4 — Linking (cloud sync)**
- [ ] Cloudflare Worker + storage (D1/KV) keyed by link code
- [ ] Pair via link code; choose linked parameter groups
- [ ] Push on change / pull on open; "last updated by … at …"; newest-wins

**Phase 5 — Polish**
- [ ] Subclass auto-spells; basic multiclass slot math; leveling helper; printable cheat-sheet

## What the research changed (cited findings)
- **Validated:** offline PWA, bundled SRD + hand-add, per-character 2014/2024 choice (D&D Beyond's *forced* 2024 migration in Aug 2024 caused real backlash — per-character choice is the differentiator), auto-calc, all-in-one sheet+spellbook.
- **Added:** manual override on every auto-calc; favorites list; concentration auto-CON-save (DC = max(10,½ dmg)) + double-concentration block; condition *durations*; homebrew *source citation* field; AC auto-adjusts with gear; export-includes-homebrew.
- **De-prioritised (refuted in fact-check):** a fancy *general* dice roller (generic check/save rolling was *not* a loved feature — only spell/attack damage rolling is); deep multiclass support (not a v1 must-have — basic correctness is enough).
