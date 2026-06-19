#!/usr/bin/env python3
"""Build data/summons-rich.json: full SRD 5.1 stat blocks from dnd5eapi (2014).

Superset of summons.json: same core keys + full stat-block fields.
OGL SRD content (full monster text is permitted under the SRD/OGL).
"""
import json, os, re, time, urllib.request, urllib.error

API = "https://www.dnd5eapi.co"
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "data", "summons-rich.json")
CACHE = "/tmp/grimoire_monster_cache"
os.makedirs(CACHE, exist_ok=True)

ABBR = {"str": "STR", "dex": "DEX", "con": "CON", "int": "INT",
        "wis": "WIS", "cha": "CHA"}

DC_RE = re.compile(r"DC (\d+) (Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) saving throw")
ABIL_FULL = {"Strength": "STR", "Dexterity": "DEX", "Constitution": "CON",
             "Intelligence": "INT", "Wisdom": "WIS", "Charisma": "CHA"}


def fetch(url):
    cf = os.path.join(CACHE, re.sub(r"[^a-z0-9]+", "_", url.lower()) + ".json")
    if os.path.exists(cf):
        with open(cf) as f:
            return json.load(f)
    for attempt in range(4):
        try:
            req = urllib.request.Request(API + url, headers={"User-Agent": "grimoire-builder"})
            with urllib.request.urlopen(req, timeout=30) as r:
                data = json.load(r)
            with open(cf, "w") as f:
                json.dump(data, f)
            return data
        except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
            if attempt == 3:
                raise
            time.sleep(2 * (attempt + 1))


def cr_str(cr):
    m = {0.5: "1/2", 0.25: "1/4", 0.125: "1/8"}
    if cr in m:
        return m[cr]
    return str(int(cr))


def cr_sort(cr):
    frac = {"1/8": 0.125, "1/4": 0.25, "1/2": 0.5}
    return frac[cr] if cr in frac else float(cr)


def speed_str(sp):
    parts = []
    if "walk" in sp:
        parts.append(sp["walk"])
    for k in ("burrow", "climb", "fly", "swim"):
        if k in sp:
            parts.append(f"{k} {sp[k]}")
    return ", ".join(parts) if parts else "0 ft."


def norm_type(t):
    """Match base summons.json: swarms collapse to their constituent type (beast)."""
    t = t.lower()
    if t.startswith("swarm of"):
        return "beast"
    return t


def mod(score):
    return (score - 10) // 2


def signed(n):
    return f"+{n}" if n >= 0 else str(n)


def profs(m):
    saves, skills = [], []
    for p in m.get("proficiencies", []):
        name = p["proficiency"]["name"]
        val = p["value"]
        if name.startswith("Saving Throw: "):
            ab = name.split(": ", 1)[1]
            saves.append((ab, val))
        elif name.startswith("Skill: "):
            sk = name.split(": ", 1)[1]
            skills.append((sk, val))
    save_order = ["STR", "DEX", "CON", "INT", "WIS", "CHA"]
    saves.sort(key=lambda x: save_order.index(x[0]) if x[0] in save_order else 99)
    skills.sort(key=lambda x: x[0])
    saves_s = ", ".join(f"{a} {signed(v)}" for a, v in saves)
    skills_s = ", ".join(f"{a} {signed(v)}" for a, v in skills)
    return saves_s, skills_s


def senses_str(s):
    parts = []
    for k in ("blindsight", "darkvision", "tremorsense", "truesight"):
        if k in s:
            parts.append(f"{k} {s[k]}")
    if "passive_perception" in s:
        parts.append(f"passive Perception {s['passive_perception']}")
    return ", ".join(parts)


def clean_list(lst):
    return ", ".join(lst) if lst else ""


def cond_list(lst):
    # condition_immunities are objects with a 'name' field
    return ", ".join(c["name"].lower() for c in lst) if lst else ""


def lang_str(l):
    if not l:
        return ""
    s = l.strip()
    if s in ("—", "-", ""):
        return ""
    return s


def desc_blocks(items):
    """Turn special_abilities/actions/reactions into {name, desc} list,
    preserving full text and appending usage info when present."""
    out = []
    for a in items or []:
        name = a.get("name", "")
        desc = a.get("desc", "") or ""
        usage = a.get("usage")
        if usage:
            t = usage.get("type")
            if t == "per day":
                desc = desc.rstrip() + f"\n\n({usage['times']}/Day)"
            elif t == "recharge on roll":
                dice = usage.get("dice", "")
                mn = usage.get("min_value", "")
                desc = desc.rstrip() + f"\n\n(Recharge {mn}–6)"
            elif t == "recharge after rest":
                rests = "/".join(usage.get("rest_types", []))
                desc = desc.rstrip() + f"\n\n(Recharges after a {rests} Rest)"
        out.append({"name": name, "desc": desc.strip()})
    return out


def first_dice(dmg):
    """Return (damage_dice, type_name) for the first damage entry that has dice.
    Unwraps versatile-weapon 'choose'/options_array structures (first option)."""
    for d in dmg or []:
        if "damage_dice" in d:
            return d["damage_dice"], d["damage_type"]["name"]
        frm = d.get("from")
        if frm and frm.get("options"):
            for opt in frm["options"]:
                if "damage_dice" in opt:
                    return opt["damage_dice"], opt["damage_type"]["name"]
    return None


def simple_attacks(m):
    """Replicate summons.json simplified attack extraction (<=3)."""
    atks = []
    for a in m.get("actions", []):
        ab = a.get("attack_bonus")
        first = first_dice(a.get("damage"))
        if ab is None or first is None:
            continue
        notes = ""
        dm = DC_RE.search(a.get("desc", ""))
        if dm:
            notes = f"DC {dm.group(1)} {ABIL_FULL[dm.group(2)]} save"
        atks.append({
            "name": a["name"],
            "atk": ab,
            "damage": first[0],
            "type": first[1].lower(),
            "notes": notes,
        })
        if len(atks) >= 3:
            break
    return atks


def main():
    idx = fetch("/api/2014/monsters")
    results = idx["results"]
    print(f"index: {len(results)} monsters")
    out = []
    for i, r in enumerate(results, 1):
        m = fetch("/api/2014/monsters/" + r["index"])
        cr = cr_str(m["challenge_rating"])
        ac = m["armor_class"][0]["value"] if m.get("armor_class") else 10
        saves_s, skills_s = profs(m)
        obj = {
            "name": m["name"],
            "type": norm_type(m["type"]),
            "cr": cr,
            "ac": ac,
            "hp": m["hit_points"],
            "hd": (lambda s: int(re.match(r"(\d+)d", s).group(1)) if re.match(r"(\d+)d", s) else 1)(m.get("hit_dice") or m.get("hit_points_roll") or ""),
            "speed": speed_str(m.get("speed", {})),
            "icon": norm_type(m["type"]),
            "source": "SRD",
            "abilities": {
                "str": m["strength"], "dex": m["dexterity"], "con": m["constitution"],
                "int": m["intelligence"], "wis": m["wisdom"], "cha": m["charisma"],
            },
            "saves": saves_s,
            "skills": skills_s,
            "senses": senses_str(m.get("senses", {})),
            "languages": lang_str(m.get("languages", "")),
            "resist": clean_list(m.get("damage_resistances", [])),
            "immune": clean_list(m.get("damage_immunities", [])),
            "vuln": clean_list(m.get("damage_vulnerabilities", [])),
            "condImmune": cond_list(m.get("condition_immunities", [])),
            "traits": desc_blocks(m.get("special_abilities")),
            "actions": desc_blocks(m.get("actions")),
            "reactions": desc_blocks(m.get("reactions")),
            "attacks": simple_attacks(m),
        }
        out.append(obj)
        if i % 50 == 0:
            print(f"  {i}/{len(results)}")
    out.sort(key=lambda c: (cr_sort(c["cr"]), c["name"]))
    with open(OUT, "w") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print(f"wrote {len(out)} -> {os.path.abspath(OUT)} ({os.path.getsize(OUT)} bytes)")


if __name__ == "__main__":
    main()
