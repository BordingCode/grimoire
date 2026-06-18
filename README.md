# Grimoire

A phone-first **D&D 5e character sheet + spellbook** that works offline. Pick the 2014 or 2024 ruleset per character; spellbook bundles the free SRD spells and lets you hand-add any others your group uses.

## Spell data

Bundled from the openly-licensed SRD via the Open5e API (CC-BY-4.0 / OGL). Rebuild with:

```
python3 tools/build_spells.py
```

Only SRD spells ship here. Non-SRD spells are added by players in-app and stored locally on their device.

## Deploy

Static PWA on GitHub Pages. After editing css/js/data, bump the `?v=` query in `index.html` and the `CACHE` constant in `sw.js` so phones do not serve stale files.
