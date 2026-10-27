"""Build data/features-2014.json and data/features-2024.json — SRD class & subclass
features per level (CC-BY-4.0 SRD 5.1 via dnd5eapi.co, SRD 5.2 via open5e.com).
Shape: { "Paladin": [ {"l": 6, "n": "Aura of Protection", "d": "...", "s": "Oath of Devotion"?}, ... ] }
Ability Score Improvement is left out (the level-up screen reminds about it separately)."""
import json, re, urllib.request, concurrent.futures as cf

def get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "grimoire-build"}), timeout=60) as r:
        return json.load(r)

SKIP = re.compile(r"^(ability score improvement|.* subclass|spellcasting:?.*|epic boon|.* feature|aura improvements)$", re.I)  # "Sacred Oath feature" = placeholder for the subclass
# 2014 API subclass names → the names the app uses
SUB14 = {"Berserker": "Path of the Berserker", "Champion": "Champion", "Devotion": "Oath of Devotion",
         "Draconic": "Draconic Bloodline", "Evocation": "School of Evocation", "Fiend": "The Fiend",
         "Hunter": "Hunter", "Land": "Circle of the Land", "Life": "Life Domain", "Lore": "College of Lore",
         "Open Hand": "Way of the Open Hand", "Thief": "Thief"}

def build14():
    idx = get("https://www.dnd5eapi.co/api/2014/features")["results"]
    with cf.ThreadPoolExecutor(8) as ex:
        feats = list(ex.map(lambda f: get("https://www.dnd5eapi.co" + f["url"]), idx))
    out = {}
    for f in feats:
        if f.get("parent") or SKIP.match(f["name"]): continue  # options of a choice (e.g. one Fighting Style)
        e = {"l": f["level"], "n": f["name"], "d": "\n\n".join(f.get("desc") or [])}
        if f.get("subclass"): e["s"] = SUB14.get(f["subclass"]["name"], f["subclass"]["name"])
        out.setdefault(f["class"]["name"], []).append(e)
    return out

def build24():
    res = get("https://api.open5e.com/v2/classes/?document__key=srd-2024&limit=50")["results"]
    out = {}
    for c in res:
        cls = c["subclass_of"]["name"] if c.get("subclass_of") else c["name"]
        for f in c["features"]:
            if f["feature_type"] != "CLASS_LEVEL_FEATURE" or not f["gained_at"] or SKIP.match(f["name"]): continue
            e = {"l": min(g["level"] for g in f["gained_at"]), "n": f["name"], "d": f["desc"].strip()}
            if c.get("subclass_of"): e["s"] = c["name"]
            out.setdefault(cls, []).append(e)
    return out

for ed, fn in (("2014", build14), ("2024", build24)):
    data = fn()
    for k in data: data[k].sort(key=lambda e: (e["l"], "s" in e, e["n"]))
    with open(f"data/features-{ed}.json", "w") as fh: json.dump(dict(sorted(data.items())), fh, indent=1, ensure_ascii=False)
    print(ed, {k: len(v) for k, v in data.items()})
