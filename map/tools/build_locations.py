"""Slim the raw UESP gamemap snapshot into map/data/locations.json.

Input:  map/data/uesp-locations-raw.json  (gamemap.php?action=get_locs&world=1&db=mw)
        map/data/uesp-worlds-raw.json     (gamemap.php?action=get_worlds&db=mw)
Output: map/data/locations.json

Each UESP description looks like:
  "<display path>, editorID=<cell name>, Morrowind, <region>, z=<n>"
The editorID is the game cell name (may itself contain commas), which is the
join key for mod data. ~200 auto-generated locations have no editorID.
"""

import json
import re
from pathlib import Path

DATA = Path(__file__).resolve().parent.parent / "data"

TAIL_RE = re.compile(
    r"(?:editorID=(?P<cell>.*?))?,?\s*(?:Morrowind|Tribunal|Bloodmoon), (?P<region>[^,]+), z=(?P<z>-?\d+)$"
)


def main():
    raw = json.loads((DATA / "uesp-locations-raw.json").read_text(encoding="utf-8"))
    worlds = json.loads((DATA / "uesp-worlds-raw.json").read_text(encoding="utf-8"))

    world = worlds["worlds"][0]
    out_world = {
        "name": world["name"],
        "cellSize": world["cellSize"],
        "posLeft": world["posLeft"],
        "posTop": world["posTop"],
        "posRight": world["posRight"],
        "posBottom": world["posBottom"],
    }

    locations = []
    unparsed = []
    for loc in raw["locations"]:
        if not loc.get("visible", 1):
            continue
        desc = loc.get("description", "")
        cell = None
        region = None
        m = TAIL_RE.search(desc)
        if m:
            cell = m.group("cell") or None
            region = m.group("region")
        elif desc:
            unparsed.append((loc["id"], desc))

        locations.append(
            {
                "id": loc["id"],
                "name": loc["name"],
                "cell": cell,
                "region": region,
                "x": loc["x"],
                "y": loc["y"],
                "icon": loc.get("iconType", 0),
                "level": loc.get("displayLevel", 0),
                "wiki": loc.get("wikiPage") or None,
            }
        )

    out = {"world": out_world, "locations": locations}
    (DATA / "locations.json").write_text(
        json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8"
    )

    with_cell = sum(1 for l in locations if l["cell"])
    print(f"locations: {len(locations)}  with cell name: {with_cell}")
    print(f"unparsed descriptions: {len(unparsed)}")
    for id_, d in unparsed[:10]:
        print(f"  id={id_}: {d[:100]}")


if __name__ == "__main__":
    main()
