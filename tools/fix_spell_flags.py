"""Post-process data/spells-*.json: Open5e's attack_roll flag and damage dice are unreliable
(2024 marks Bless, Hex, Hunter's Mark… as attacks; Teleport has "1d100 damage").
attack = the text says "make a … spell attack". A damage die with no damage type stays only if
the text really deals damage with it; healing dice become heal: true (shown as "Healing").
Run after tools/build_spells.py:  python3 tools/fix_spell_flags.py"""
import json, re, pathlib
ATK = re.compile(r"\b(?:make|makes|making)\s+(?:a|an|one|two|three|separate|another)?\s*(?:melee|ranged)?(?:\s+or\s+ranged)?\s*spell attacks?\b", re.I)
HEAL = re.compile(r"\bregains?\b[^.]*\bHit Points\b|\bTemporary Hit Points\b", re.I)
DMG = re.compile(r"\d+d\d+[^.]{0,60}\bdamage\b", re.I)
root = pathlib.Path(__file__).resolve().parent.parent / "data"
for ed in ("2014", "2024"):
    p = root / f"spells-{ed}.json"
    d = json.loads(p.read_text())
    for s in d:
        desc = s.get("desc", "")
        s["attack"] = bool(ATK.search(desc))
        s.pop("heal", None)
        if s.get("damage") and not s.get("damageType"):
            if HEAL.search(desc): s["heal"] = True
            elif not DMG.search(desc) or s["damage"] == "1d100": s["damage"] = None  # 1d100 = a table roll (Teleport)
    p.write_text(json.dumps(d, ensure_ascii=False, separators=(",", ":")))
    print(ed, "attacks:", sum(s["attack"] for s in d), "healing:", sum(bool(s.get("heal")) for s in d))
