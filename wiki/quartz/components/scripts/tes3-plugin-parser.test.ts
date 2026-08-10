import assert from "node:assert/strict"
import test from "node:test"

import { matchSelectedTes3CellsToLocations, parseTes3Plugin } from "./tes3-plugin-parser"
import type { ParsedTes3Cell } from "./tes3-plugin-parser"

const encoder = new TextEncoder()

function u32(value: number): Uint8Array {
  const result = new Uint8Array(4)
  new DataView(result.buffer).setUint32(0, value, true)
  return result
}

function i32(value: number): Uint8Array {
  const result = new Uint8Array(4)
  new DataView(result.buffer).setInt32(0, value, true)
  return result
}

function join(...parts: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(parts.reduce((total, part) => total + part.byteLength, 0))
  let offset = 0
  for (const part of parts) {
    result.set(part, offset)
    offset += part.byteLength
  }
  return result
}

function subrecord(tag: string, data: Uint8Array): Uint8Array {
  return join(encoder.encode(tag), u32(data.byteLength), data)
}

function record(tag: string, flags: number, ...subrecords: Uint8Array[]): Uint8Array {
  const payload = join(...subrecords)
  return join(encoder.encode(tag), u32(payload.byteLength), u32(0), u32(flags), payload)
}

function cellData(flags: number, x = 0, y = 0): Uint8Array {
  return subrecord("DATA", join(u32(flags), i32(x), i32(y)))
}

function cellName(value: string): Uint8Array {
  return subrecord("NAME", join(encoder.encode(value), new Uint8Array([0])))
}

function cellRegion(value: string): Uint8Array {
  return subrecord("RGNN", join(encoder.encode(value), new Uint8Array([0])))
}

function reference(index: number): Uint8Array {
  return subrecord("FRMR", u32(index))
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
    record("CELL", 0x2, cellName("A New Interior"), cellData(0x1), reference(3)),
  )

  const cells = parseTes3Plugin(plugin.buffer as ArrayBuffer)
  assert.equal(cells.length, 2)
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
  })
  assert.equal(cells[1].displayName, "Balmora, Guild of Mages")
  assert.equal(cells[1].changeType, "Modified")
  assert.equal(cells[1].modifiedReferences, 2)
  assert.equal(cells[1].selected, true)
})

test("uses the region for unnamed exteriors and leaves zero-reference cells unchecked", () => {
  const plugin = join(
    record("TES3", 0),
    record("CELL", 0x2, cellData(0, 40, 90), cellRegion("Grazelands Region")),
  )
  const [cell] = parseTes3Plugin(plugin.buffer as ArrayBuffer)
  assert.equal(cell.displayName, "Grazelands Region (40, 90)")
  assert.equal(cell.changeType, "New")
  assert.equal(cell.modifiedReferences, 0)
  assert.equal(cell.selected, false)
})

test("rejects malformed plugins", () => {
  assert.throws(
    () => parseTes3Plugin(encoder.encode("CELL").buffer as ArrayBuffer),
    /record header is truncated/u,
  )
  assert.throws(
    () => parseTes3Plugin(record("CELL", 0).buffer as ArrayBuffer),
    /first record is not TES3/u,
  )
})

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
    },
  ]

  assert.deepEqual(matchSelectedTes3CellsToLocations(cells, ["Balmora", "Caldera"]), {
    matched: ["Balmora"],
    unmatched: ["New Place"],
  })
})
