"""Generate MOCK mod->location data for the map by cross-referencing
modathon Dungeon-category mods against UESP location cell names.

This is a placeholder until real curated data exists. The output schema is
the agreed real-data schema: [{name, url, locations: [cell names]}].

Input:  modathon/assets/data/nexus-stats.json, map/data/locations.json
Output: map/data/mods.json
"""

import json
import re
import unicodedata
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
DATA = ROOT / "map" / "data"

# Cell-name components too generic to identify a dungeon on their own.
GENERIC = {
    "upper level", "lower level", "lower levels", "basement", "cabin",
    "great hall", "entry", "entrance", "underground", "caverns", "cavern",
    "shrine", "tower", "towers", "guard towers", "tomb", "mine", "cave",
    "ruins", "dungeon", "storage", "cells", "sewers", "temple", "hall",
    "vaults", "keep", "outskirts", "hlaalu", "redoran", "telvanni",
    "palace", "prison", "wizards tower",
}

# Trailing words that can be stripped from a dungeon base name and still
# leave a distinctive identifier ("Vassir-Didanat Cave" -> "Vassir-Didanat").
STRIP_TAIL = {"cave", "mine", "camp", "ruin", "ruins", "grotto", "plantation"}


def norm(s: str) -> str:
    s = unicodedata.normalize("NFKD", s)
    s = s.lower().replace("-", " ").replace("'", "")
    return re.sub(r"[^a-z0-9 ]", " ", s)


def contains_phrase(haystack: str, phrase: str) -> bool:
    return re.search(rf"(?<![a-z0-9]){re.escape(phrase)}(?![a-z0-9])", haystack) is not None


def main():
    stats = json.loads((ROOT / "modathon" / "assets" / "data" / "nexus-stats.json").read_text(encoding="utf-8"))
    locdata = json.loads((DATA / "locations.json").read_text(encoding="utf-8"))

    # Collect dungeon mods, deduped by URL.
    mods = {}
    for year, entries in stats["mods"].items():
        for m in entries:
            if m.get("category") != "Dungeon":
                continue
            key = m.get("url") or m["name"]
            if key not in mods:
                mods[key] = {"name": m["name"], "url": m.get("url"), "year": int(year),
                             "authors": m.get("authors", [])}

    # Index locations: each has a join key (cell name, falling back to marker name).
    TRANSPORT = {"silt strider", "boat transport", "ship transport", "gondola", "guild guide"}
    locs = []
    for loc in locdata["locations"]:
        cell = loc["cell"] or loc["name"]
        parts = [p.strip() for p in cell.split(",")]
        if norm(parts[0]).strip() in TRANSPORT:
            continue
        locs.append({
            "cell": cell,
            "full": norm(cell),
            "last": norm(parts[-1]) if len(parts) > 1 else None,
            "base": norm(parts[0]),
            "base_raw": parts[0],
        })

    results = []
    for mod in mods.values():
        mn = norm(mod["name"])
        # Tier 1: full cell name appears in mod name.
        matched = {l["cell"] for l in locs if len(l["full"]) >= 5 and contains_phrase(mn, l["full"])}
        # Tier 2: last cell component (specific sub-cell) appears in mod name.
        matched |= {
            l["cell"] for l in locs
            if l["last"] and len(l["last"]) >= 6 and l["last"] not in GENERIC
            and contains_phrase(mn, l["last"])
        }
        # Tier 3 (fallback): dungeon base name appears in mod name -> claim all
        # its sub-cells. Also try the base minus a generic tail word.
        if not matched:
            bases = set()
            for l in locs:
                base = l["base"]
                if base in GENERIC or len(base) < 5:
                    continue
                candidates = [base]
                words = base.split()
                if len(words) > 1 and words[-1] in STRIP_TAIL:
                    candidates.append(" ".join(words[:-1]))
                if any(len(c) >= 5 and contains_phrase(mn, c) for c in candidates):
                    bases.add(base)
            matched = {l["cell"] for l in locs if l["base"] in bases}
        if matched:
            results.append({
                "name": mod["name"],
                "url": mod["url"],
                "year": mod["year"],
                "authors": mod["authors"],
                "locations": sorted(matched),
            })

    results.sort(key=lambda m: (m["year"], m["name"]))
    out = {
        "generated": date.today().isoformat(),
        "mock": True,
        "note": "MOCK DATA: auto cross-referenced from modathon Dungeon-category mods; replace with curated data.",
        "mods": results,
    }
    (DATA / "mods.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")

    total = len(mods)
    print(f"dungeon mods: {total}, matched to locations: {len(results)}")
    for r in results:
        print(f"  [{r['year']}] {r['name']}  ->  {r['locations'][:4]}{' ...' if len(r['locations']) > 4 else ''}")


if __name__ == "__main__":
    main()
