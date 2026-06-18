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

**Phase 1 — Working sheet (next)**
- [ ] New character flow: pick edition → class, level, abilities, name
- [ ] Auto: modifiers, proficiency bonus, skills, saves
- [ ] Combat: AC, HP (current/max/temp), hit dice, death saves, initiative, speed
- [ ] Dice roller on every check/save/attack (advantage/disadvantage, crit)
- [ ] Spellbook: slots by class+level, prepared toggle, concentration flag, spell cards, cast = spend slot + roll
- [ ] Class resource trackers (Rage, Ki, etc.)
- [ ] Inventory, currency, conditions, notes
- [ ] Short/Long Rest buttons; multiple characters; autosave (localStorage)
- [ ] Fast hand-add spell form (+ paste/import)
- [ ] Export/import a character file

**Phase 2 — Linking (cloud sync)**
- [ ] Cloudflare Worker + storage (D1/KV) keyed by link code
- [ ] Pair via link code; choose linked parameter groups
- [ ] Push on change / pull on open; "last updated by … at …"; newest-wins

**Phase 3 — Delight & at-table** (informed by player-feature deep research)
- [ ] (fold in research findings: combat/at-table helpers, reminders, quick reference, etc.)
- [ ] Subclass auto-spells, multiclass slot math, leveling helper

## Open inputs
- Deep-research report on what players actually want (running) → feeds Phase 1 priorities & Phase 3.
