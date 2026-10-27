#!/usr/bin/env python3
"""Add legendary actions to data/summons.json (they were missing from the original build).
Same free OGL SRD source as build_summons_rich.py (dnd5eapi 2014). Adds, per creature that has them:
  legendary: [{name, desc}]   — the legendary action options
Every SRD legendary creature gets 3 legendary actions per round, so no count is stored."""
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_summons_rich import fetch, desc_blocks

P = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", "summons.json")
data = json.load(open(P))
by_name = {c["name"]: c for c in data}
idx = fetch("/api/2014/monsters")["results"]
added = 0
for r in idx:
    c = by_name.get(r["name"])
    if not c:
        continue
    m = fetch("/api/2014/monsters/" + r["index"])
    la = desc_blocks(m.get("legendary_actions"))
    if la:
        c["legendary"] = la; added += 1
    else:
        c.pop("legendary", None)
json.dump(data, open(P, "w"), indent=1, ensure_ascii=False)  # same layout as the original build
print("creatures with legendary actions:", added)
