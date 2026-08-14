import assert from "node:assert/strict";
import test from "node:test";

import {
  matchSelectedTes3CellsToLocations,
  parseTes3Plugin,
} from "./tes3-plugin-parser";
import type { ParsedTes3Cell } from "./tes3-plugin-parser";

const encoder = new TextEncoder();

function u32(value: number): Uint8Array {
  const result = new Uint8Array(4);
  new DataView(result.buffer).setUint32(0, value, true);
  return result;
}

function i32(value: number): Uint8Array {
  const result = new Uint8Array(4);
  new DataView(result.buffer).setInt32(0, value, true);
  return result;
}

function f32(value: number): Uint8Array {
  const result = new Uint8Array(4);
  new DataView(result.buffer).setFloat32(0, value, true);
  return result;
}

function join(...parts: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(
    parts.reduce((total, part) => total + part.byteLength, 0),
  );
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.byteLength;
  }
  return result;
}

function subrecord(tag: string, data: Uint8Array): Uint8Array {
  return join(encoder.encode(tag), u32(data.byteLength), data);
}

function record(
  tag: string,
  flags: number,
  ...subrecords: Uint8Array[]
): Uint8Array {
  const payload = join(...subrecords);
  return join(
    encoder.encode(tag),
    u32(payload.byteLength),
    u32(0),
    u32(flags),
    payload,
  );
}

function cellData(flags: number, x = 0, y = 0): Uint8Array {
  return subrecord("DATA", join(u32(flags), i32(x), i32(y)));
}

function cellName(value: string): Uint8Array {
  return subrecord("NAME", join(encoder.encode(value), new Uint8Array([0])));
}

function cellRegion(value: string): Uint8Array {
  return subrecord("RGNN", join(encoder.encode(value), new Uint8Array([0])));
}

function reference(index: number): Uint8Array {
  return subrecord("FRMR", u32(index));
}

function referencePosition(x: number, y: number): Uint8Array {
  return subrecord(
    "DATA",
    join(f32(x), f32(y), f32(0), f32(0), f32(0), f32(0)),
  );
}

function doorDestination(cell: string): Uint8Array[] {
  return [
    subrecord("DODT", join(f32(1), f32(2), f32(3), f32(0), f32(0), f32(0))),
    subrecord("DNAM", join(encoder.encode(cell), new Uint8Array([0]))),
  ];
}

function landscapeGrid(x: number, y: number): Uint8Array {
  return subrecord("INTV", join(i32(x), i32(y)));
}

test("classifies CELL records by official master identity rather than record flags", () => {
  const plugin = join(
    record("TES3", 0),
    record(
      "CELL",
      0,
      cellName("Balmora, Guild of Mages"),
      cellData(0x1),
      reference(0x01000001),
      reference(0x00000002),
    ),
    record(
      "CELL",
      0x2,
      cellName("A New Interior"),
      cellData(0x1),
      reference(3),
    ),
  );

  const cells = parseTes3Plugin(plugin.buffer as ArrayBuffer);
  assert.equal(cells.length, 2);
  assert.deepEqual(cells[0], {
    id: "interior:a new interior",
    name: "A New Interior",
    displayName: "A New Interior",
    changeType: "New",
    modifiedReferences: 1,
    selected: true,
    interior: true,
    grid: null,
    region: "",
    doorMarkers: [],
  });
  assert.equal(cells[1].displayName, "Balmora, Guild of Mages");
  assert.equal(cells[1].changeType, "Modified");
  assert.equal(cells[1].modifiedReferences, 2);
  assert.equal(cells[1].selected, true);
});

test("extracts exterior doormarker coordinates, destination cells, and regions", () => {
  const plugin = join(
    record("TES3", 0),
    record(
      "CELL",
      0,
      cellData(0, -2, 4),
      cellRegion("Ashlands Region"),
      reference(1),
      cellName("new_door"),
      referencePosition(-1234.4, 4567.6),
      ...doorDestination("New Cavern"),
      reference(2),
      cellName("second_door"),
      referencePosition(-1200, 4500),
      ...doorDestination("New Cavern"),
    ),
  );

  const cells = parseTes3Plugin(plugin.buffer as ArrayBuffer);
  const destination = cells.find((cell) => cell.id === "interior:new cavern");
  assert.deepEqual(destination?.doorMarkers, [
    {
      cell: "New Cavern",
      x: -1234,
      y: 4568,
      region: "Ashlands Region",
      exteriorGrid: { x: -2, y: 4 },
    },
    {
      cell: "New Cavern",
      x: -1200,
      y: 4500,
      region: "Ashlands Region",
      exteriorGrid: { x: -2, y: 4 },
    },
  ]);
  assert.equal(destination?.interior, true);
  assert.equal(destination?.selected, true);
});

test("uses the region for unnamed exteriors and keeps zero-reference cells selected", () => {
  const plugin = join(
    record("TES3", 0),
    record("CELL", 0x2, cellData(0, 40, 90), cellRegion("Grazelands Region")),
  );
  const [cell] = parseTes3Plugin(plugin.buffer as ArrayBuffer);
  assert.equal(cell.displayName, "Grazelands Region (40, 90)");
  assert.equal(cell.changeType, "New");
  assert.equal(cell.modifiedReferences, 0);
  assert.equal(cell.selected, true);
  assert.deepEqual(matchSelectedTes3CellsToLocations([cell], []), {
    matched: [],
    unmatched: [],
    exteriorEdits: [{ cell: "40, 90", landscape: false, references: 0 }],
  });
});

test("selects LAND records as landscape edits even without placed references", () => {
  const plugin = join(
    record("TES3", 0),
    record("CELL", 0, cellData(0, 12, 11), cellRegion("Ascadian Isles Region")),
    record("LAND", 0, landscapeGrid(12, 11)),
    record("LAND", 0, landscapeGrid(-3, 4)),
  );
  const cells = parseTes3Plugin(plugin.buffer as ArrayBuffer);
  const existing = cells.find((cell) => cell.id === "exterior:12,11");
  const landscapeOnly = cells.find((cell) => cell.id === "exterior:-3,4");
  assert.equal(existing?.displayName, "Ascadian Isles Region (12, 11)");
  assert.equal(existing?.modifiedReferences, 0);
  assert.equal(existing?.landscapeEdited, true);
  assert.equal(existing?.selected, true);
  assert.equal(landscapeOnly?.displayName, "Landscape (-3, 4)");
  assert.equal(landscapeOnly?.landscapeEdited, true);
  assert.equal(landscapeOnly?.selected, true);
  assert.deepEqual(matchSelectedTes3CellsToLocations(cells, []), {
    matched: [],
    unmatched: [],
    exteriorEdits: [
      { cell: "12, 11", landscape: true, references: 0 },
      { cell: "-3, 4", landscape: true, references: 0 },
    ],
  });
});

test("rejects malformed plugins", () => {
  assert.throws(
    () => parseTes3Plugin(encoder.encode("CELL").buffer as ArrayBuffer),
    /record header is truncated/u,
  );
  assert.throws(
    () => parseTes3Plugin(record("CELL", 0).buffer as ArrayBuffer),
    /first record is not TES3/u,
  );
});

test("matches selected plugin cells to controlled map locations case-insensitively", () => {
  const cells: ParsedTes3Cell[] = [
    {
      id: "interior:balmora",
      name: "balmora",
      displayName: "balmora",
      changeType: "Modified",
      modifiedReferences: 1,
      selected: true,
      interior: true,
      grid: null,
      region: "",
      doorMarkers: [],
    },
    {
      id: "exterior:12,11",
      name: "Ascadian Isles Region (12, 11)",
      displayName: "Ascadian Isles Region (12, 11)",
      changeType: "Modified",
      modifiedReferences: 2,
      selected: true,
      interior: false,
      grid: { x: 12, y: 11 },
      region: "Ascadian Isles Region",
      doorMarkers: [],
    },
    {
      id: "interior:new place",
      name: "New Place",
      displayName: "New Place",
      changeType: "New",
      modifiedReferences: 1,
      selected: true,
      interior: true,
      grid: null,
      region: "",
      doorMarkers: [],
    },
    {
      id: "interior:ignored",
      name: "Ignored",
      displayName: "Ignored",
      changeType: "New",
      modifiedReferences: 0,
      selected: false,
      interior: true,
      grid: null,
      region: "",
      doorMarkers: [],
    },
  ];

  assert.deepEqual(
    matchSelectedTes3CellsToLocations(cells, ["Balmora", "Caldera"]),
    {
      matched: ["Balmora"],
      unmatched: ["New Place"],
      exteriorEdits: [{ cell: "12, 11", landscape: false, references: 2 }],
    },
  );
});
