"""Build map/data/mods.json from Darkelfguy's "List of Dungeon and Location
Overhauls and Expansions" (Google Docs HTML export).

The document is structured as:
  h1/h2  category sections ("Ancestral Tombs:", "Tribunal Dungeons:", ...)
  h3     vanilla dungeon name
  li     one mod entry, e.g. "Overhauled by <a>Mod Name by Author</a>"

This script inverts that into the map's schema (mod -> list of cell names),
matching dungeon names against the UESP location snapshot. Entries are skipped
when they have no released-mod link (WIP notes, Discord links, deleted mods).

Usage: python build_mods_from_doc.py [path-to-html]
       (default: ../data/source-dungeon-overhauls.html)
"""

import json
import re
import sys
from collections import Counter
from datetime import date
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import parse_qs, urlparse

DATA = Path(__file__).resolve().parent.parent / "data"

# Links that never point at a released, downloadable mod.
SKIP_DOMAINS = ("discord.com", "discordapp.com", "youtube.com", "youtu.be", "docs.google.com")

# Secondary links inside an entry ("(Modular Version)", compatibility patches)
# are packaging variants of the mod already listed, not mods of their own.
VARIANT_WORDS = ("version", "patch", "modular", "alternate", "alternative", "optional", "mirror")


def is_variant_link(text):
    t = text.lower()
    return any(w in t for w in VARIANT_WORDS)

# Deep interiors with no UESP marker of their own, mapped to the marker(s) of
# the location they are entered from (value matches exact cell/name, or any
# cell starting with the value). Verified against vanilla door placement.
ALIASES = {
    "Heleran Ancestral Tomb": ["Caldera, Nedhelas' House"],  # trapdoor in that house
    "Anudnabia": ["Anudnabia (sealed)"],
    "Shrine of Boethiah": ["Sunken Shrine of Boethiah"],
    "Akulakhan's Chamber": ["Dagoth Ur"],  # inside the citadel
    "Corprusarium": ["Tower of Tel Fyr"],
    "Bethamez": ["Gnisis, Eggmine"],  # breached from the eggmine
    "Foreign Quarter Tomb": ["Vivec, Foreign Quarter"],
    "Hlaalu Ancestral Vaults": ["Vivec, Hlaalu"],
    "Redoran Ancestral Vaults": ["Vivec, Redoran"],
    "Ibishammus": ["Vivec, St. Delyn"],
    "Ihinipalit": ["Vivec, St. Delyn"],
    "Assernerairan": ["Vivec, St. Olms"],
    # Unmapped on purpose: Magas Volar (no exterior door, reached by amulet),
    # Tukushapal (no UESP marker), all Tribunal/Mournhold dungeons.
}

# Vivec cantons each have a single labelled anchor marker ("Vivec, Hlaalu",
# icon Town). Individual canton-interior door markers (up to six per cell)
# would clutter the city, so every "Vivec, <canton> ..." cell collapses onto
# its canton anchor. The Temple canton's named halls collapse likewise; the
# Palace of Vivec keeps its own landmark marker.
VIVEC_CANTONS = ["Foreign Quarter", "St. Delyn", "St. Olms", "Hlaalu", "Redoran", "Telvanni", "Arena"]
VIVEC_TEMPLE_PARTS = ("High Fane", "Hall of Wisdom", "Hall of Justice", "Hall Underworks")


def collapse_vivec(cell):
    if not cell.startswith("Vivec, "):
        return cell
    rest = cell[len("Vivec, "):]
    for canton in VIVEC_CANTONS:
        if rest == canton or rest.startswith(canton + " "):
            return f"Vivec, {canton}"
    if rest.startswith(VIVEC_TEMPLE_PARTS):
        return "Vivec, Temple"
    return cell


def unwrap(href):
    """Google Docs wraps every link as google.com/url?q=<real>."""
    if "google.com/url" in href:
        q = parse_qs(urlparse(href).query).get("q")
        if q:
            href = q[0]
    m = re.match(r"https?://(?:www\.)?nexusmods\.com/morrowind/mods/(\d+)", href)
    if m:
        return f"https://www.nexusmods.com/morrowind/mods/{m.group(1)}"
    return href


def clean(s):
    s = s.replace("\xa0", " ").replace("’", "'").replace("‘", "'")
    return re.sub(r"\s+", " ", s).strip()


class DocParser(HTMLParser):
    """Flattens the doc into blocks of (kind, [(href|None, text), ...])."""

    BLOCK_TAGS = {"h1", "h2", "h3", "li", "p"}

    def __init__(self):
        super().__init__()
        self.blocks = []
        self.kind = None
        self.parts = []
        self.href = None

    def _flush(self):
        if self.kind and self.parts:
            self.blocks.append((self.kind, self.parts))
        self.parts = []

    def handle_starttag(self, tag, attrs):
        if tag in self.BLOCK_TAGS:
            self._flush()
            self.kind = tag
        elif tag == "a":
            href = dict(attrs).get("href")
            self.href = unwrap(href) if href else None

    def handle_endtag(self, tag):
        if tag == "a":
            self.href = None

    def handle_data(self, data):
        if self.kind and data:
            self.parts.append((self.href, data))

    def close(self):
        super().close()
        self._flush()


def block_text(parts):
    return clean("".join(t for _, t in parts))


def block_links(parts):
    """Merge consecutive runs that share an href (Google splits styled links)."""
    links = []
    for href, text in parts:
        if href is None:
            continue
        if links and links[-1][0] == href:
            links[-1][1] += text
        else:
            links.append([href, text])
    return [(href, clean(text)) for href, text in links]


def main():
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else DATA / "source-dungeon-overhauls.html"
    parser = DocParser()
    parser.feed(src.read_text(encoding="utf-8"))
    parser.close()

    # ---- gather: location -> [(url, mod name with author)] ----
    section = None
    location = None
    by_location = {}
    skipped = []
    for kind, parts in parser.blocks:
        if kind in ("h1", "h2"):
            text = block_text(parts)
            if kind == "h1" and text:
                section = text.rstrip(":")
            location = None
        elif kind == "h3":
            location = block_text(parts)
            by_location.setdefault(location, {"section": section, "entries": []})
        elif kind == "li" and location:
            links = [
                (u, t) for u, t in block_links(parts)
                if not any(d in u for d in SKIP_DOMAINS) and not (" by " not in t and is_variant_link(t))
            ]
            if not links:
                skipped.append((location, block_text(parts)))
                continue
            by_location[location]["entries"].extend(links)

    # ---- match doc dungeon names against UESP cells ----
    locdata = json.loads((DATA / "locations.json").read_text(encoding="utf-8"))
    cells = {}  # normalized key -> set of real cell names
    for loc in locdata["locations"]:
        cell = loc["cell"] or loc["name"]
        cells.setdefault(clean(cell).lower(), set()).add(cell)
        cells.setdefault(clean(loc["name"]).lower(), set()).add(cell)
    prefixes = {}  # normalized first component -> set of real cell names
    for loc in locdata["locations"]:
        cell = loc["cell"] or loc["name"]
        prefixes.setdefault(clean(cell.split(",")[0]).lower(), set()).add(cell)

    all_locs = [(loc["cell"] or loc["name"], loc["name"]) for loc in locdata["locations"]]

    def match_cells(name):
        if name in ALIASES:
            matched = set()
            for target in ALIASES[name]:
                for cell, locname in all_locs:
                    if cell == target or locname == target or cell.startswith(target):
                        matched.add(cell)
        else:
            key = clean(name).lower()
            matched = cells.get(key, set()) | prefixes.get(key, set())
        return sorted({collapse_vivec(c) for c in matched})

    # ---- invert to mods ----
    mods = {}  # url -> {names Counter, locations set}
    unmatched = []
    for name, info in by_location.items():
        matched = match_cells(name)
        if not matched:
            if info["entries"]:
                unmatched.append((info["section"], name, len(info["entries"])))
            continue
        for url, text in info["entries"]:
            mod = mods.setdefault(url, {"names": Counter(), "locations": set()})
            mod["names"][text] += 1
            mod["locations"].update(matched)

    out_mods = []
    for url, mod in mods.items():
        best = max(mod["names"].items(), key=lambda kv: (kv[1], len(kv[0])))[0]
        name, author = (best.rsplit(" by ", 1) + [None])[:2] if " by " in best else (best, None)
        entry = {"name": name.strip(" ,.;"), "url": url, "locations": sorted(mod["locations"])}
        if author:
            entry["authors"] = [author.strip(" ,.;")]
        out_mods.append(entry)
    out_mods.sort(key=lambda m: m["name"].lower())

    out = {
        "generated": date.today().isoformat(),
        "source": "Darkelfguy's List of Dungeon and Location Overhauls and Expansions",
        "mods": out_mods,
    }
    (DATA / "mods.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")

    # ---- report ----
    covered = {c for m in out_mods for c in m["locations"]}
    print(f"doc locations: {len(by_location)}, mods: {len(out_mods)}, cells covered: {len(covered)}")
    print(f"skipped entries (no mod link / WIP / Discord): {len(skipped)}")
    print(f"unmatched doc locations with entries: {len(unmatched)}")
    for section, name, n in unmatched:
        print(f"  [{section}] {name} ({n} entr{'y' if n == 1 else 'ies'})")


if __name__ == "__main__":
    main()
