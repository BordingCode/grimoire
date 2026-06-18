#!/usr/bin/env python3
"""
Build bundled SRD spell data for Grimoire.

Downloads the System Reference Document spells (free, Creative Commons / OGL
licensed) from the Open5e v2 API for both the 2014 (SRD 5.1) and 2024 (SRD 5.2)
rulesets, normalizes them into one compact shape, and writes:

    data/spells-2014.json
    data/spells-2024.json

These are the only spells legally free to bundle. Players add any non-SRD
spells they own via the in-app "add spell" form (stored locally on their
device, never shipped here).

Run:  python3 tools/build_spells.py
"""
import json
import sys
import time
import urllib.request
from pathlib import Path

API = "https://api.open5e.com/v2/spells/"
EDITIONS = {
    "2014": "srd-2014",  # SRD 5.1, CC-BY-4.0 / OGL
    "2024": "srd-2024",  # SRD 5.2, CC-BY-4.0
}
DATA_DIR = Path(__file__).resolve().parent.parent / "data"


def fetch_all(doc_key):
    """Page through the API following the `next` link until exhausted."""
    url = f"{API}?document__key={doc_key}&limit=100"
    out = []
    while url:
        req = urllib.request.Request(url, headers={"User-Agent": "Grimoire-SpellBuilder/1.0 (personal D&D tool)"})
        with urllib.request.urlopen(req, timeout=60) as resp:
            payload = json.load(resp)
        out.extend(payload["results"])
        url = payload.get("next")
        time.sleep(0.3)  # be polite to the free API
    return out


def norm(s, edition):
    """Collapse an Open5e v2 spell into Grimoire's compact, offline shape."""
    school = (s.get("school") or {}).get("name", "")
    classes = sorted({c.get("name", "") for c in (s.get("classes") or []) if c.get("name")})
    # higher_level text may live on the spell or inside casting_options
    higher = (s.get("higher_level") or "").strip()
    # damage: base roll + per-slot-level upcast rolls (for auto-filling the dice roller)
    base_dmg = (s.get("damage_roll") or "").strip() or None
    dmg_type = (s.get("damage_types") or [None])[0]
    upcast = {}
    for o in (s.get("casting_options") or []):
        t = o.get("type", "")
        if t.startswith("slot_level_") and o.get("damage_roll"):
            try:
                upcast[int(t.rsplit("_", 1)[1])] = o["damage_roll"].strip()
            except (ValueError, AttributeError):
                pass
    return {
        "id": s.get("key") or s.get("name", "").lower().replace(" ", "-"),
        "name": s.get("name", "").strip(),
        "level": s.get("level", 0) or 0,            # 0 = cantrip
        "school": school,
        "casting_time": (s.get("casting_time") or "").strip(),
        "range": (s.get("range_text") or s.get("range") or "").strip() if isinstance(s.get("range_text") or s.get("range"), str) else (s.get("range_text") or ""),
        "duration": (s.get("duration") or "").strip(),
        "concentration": bool(s.get("concentration")),
        "ritual": bool(s.get("ritual")),
        "components": {
            "v": bool(s.get("verbal")),
            "s": bool(s.get("somatic")),
            "m": bool(s.get("material")),
        },
        "material": (s.get("material_specified") or "").strip(),
        "classes": classes,
        "save": (s.get("saving_throw_ability") or "").strip() or None,
        "attack": bool(s.get("attack_roll")),
        "damage": base_dmg,
        "damageType": dmg_type,
        "upcast": upcast or None,
        "desc": (s.get("desc") or "").strip(),
        "higher_level": higher,
        "edition": edition,
        "source": "SRD",
    }


def main():
    DATA_DIR.mkdir(exist_ok=True)
    summary = {}
    for edition, doc_key in EDITIONS.items():
        print(f"Fetching {edition} ({doc_key}) ...", flush=True)
        raw = fetch_all(doc_key)
        spells = [norm(s, edition) for s in raw]
        spells.sort(key=lambda x: (x["level"], x["name"]))
        out_path = DATA_DIR / f"spells-{edition}.json"
        out_path.write_text(json.dumps(spells, ensure_ascii=False, separators=(",", ":")))
        kb = out_path.stat().st_size / 1024
        summary[edition] = (len(spells), kb)
        print(f"  -> {len(spells)} spells, {kb:.0f} KB -> {out_path.name}", flush=True)

    print("\nDone.")
    for ed, (n, kb) in summary.items():
        print(f"  {ed}: {n} spells ({kb:.0f} KB)")


if __name__ == "__main__":
    sys.exit(main())
