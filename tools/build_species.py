"""Build data/species-2014.json and data/species-2024.json — SRD races/species with their traits
(CC-BY-4.0: SRD 5.1 via dnd5eapi.co, SRD 5.2 via open5e.com).
Shape: [ {"n": "Tiefling", "speed": 30, "size": "Medium", "asi": {"cha": 2, "int": 1},
          "traits": [{"n": "Darkvision", "d": "..."}], "subs": [{"n": "Lightfoot Halfling", "asi": {...}, "traits": [...]}] } ]"""
import json, re, urllib.request

def get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "grimoire-build"}), timeout=60) as r:
        return json.load(r)

API = "https://www.dnd5eapi.co"
_trait = {}
def trait(ref):
    if ref["url"] not in _trait:
        t = get(API + ref["url"]); _trait[ref["url"]] = {"n": t["name"], "d": "\n\n".join(t.get("desc") or [])}
    return _trait[ref["url"]]
asi = lambda arr: {b["ability_score"]["index"]: b["bonus"] for b in arr or []}

def build14():
    out = []
    for r in get(API + "/api/2014/races")["results"]:
        d = get(API + r["url"])
        traits = [trait(t) for t in d["traits"] if not t["index"].startswith("draconic-ancestry-")]
        subs = []
        for s in d.get("subraces") or []:
            sd = get(API + s["url"])
            subs.append({"n": sd["name"], "asi": asi(sd["ability_bonuses"]), "traits": [trait(t) for t in sd["racial_traits"]]})
        out.append({"n": d["name"], "speed": d["speed"], "size": d["size"], "asi": asi(d["ability_bonuses"]),
                    "traits": traits, "lang": d.get("language_desc", ""), "subs": subs})
    return out

def build24():
    out = []
    for r in get("https://api.open5e.com/v2/species/?document__key=srd-2024&limit=50")["results"]:
        if r.get("is_subspecies"): continue
        tr = {t["name"]: t["desc"].strip() for t in r["traits"]}
        speed = int(re.search(r"\d+", tr.pop("Speed", "30")).group())
        size = tr.pop("Size", "Medium")
        out.append({"n": r["name"], "speed": speed, "size": size, "asi": {},
                    "traits": [{"n": k, "d": v} for k, v in tr.items()], "subs": []})
    return out

for ed, fn in (("2014", build14), ("2024", build24)):
    data = sorted(fn(), key=lambda x: x["n"])
    with open(f"data/species-{ed}.json", "w") as fh: json.dump(data, fh, indent=1, ensure_ascii=False)
    print(ed, [(x["n"], x["speed"], len(x["traits"]), [s["n"] for s in x["subs"]]) for x in data])
