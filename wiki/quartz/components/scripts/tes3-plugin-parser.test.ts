import assert from "node:assert/strict"
import test from "node:test"

import { parseTes3Plugin } from "./tes3-plugin-parser"

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

function reference(index: number): Uint8Array {
  return subrecord("FRMR", u32(index))
}

test("parses and combines TES3 CELL records using tes3 crate semantics", () => {
  const plugin = join(
    record("TES3", 0),
    record(
      "CELL",
      0x2,
      cellName("Balmora, Guild of Mages"),
      cellData(0x1),
      reference(0x01000001),
      reference(0x00000002),
    ),
    record("CELL", 0, cellName("Balmora"), cellData(0, -3, -2)),
    record("CELL", 0x2, cellName("Balmora"), cellData(0, -3, -2), reference(3)),
  )

  const cells = parseTes3Plugin(plugin.buffer as ArrayBuffer)
  assert.equal(cells.length, 2)
  assert.deepEqual(cells[0], {
    id: "exterior:-3,-2",
    name: "Balmora",
    displayName: "Balmora",
    changeType: "New",
    modifiedReferences: 1,
    selected: true,
    interior: false,
    grid: { x: -3, y: -2 },
    region: "",
  })
  assert.equal(cells[1].displayName, "Balmora, Guild of Mages")
  assert.equal(cells[1].changeType, "Modified")
  assert.equal(cells[1].modifiedReferences, 2)
  assert.equal(cells[1].selected, true)
})

test("leaves zero-reference cells unchecked and rejects malformed plugins", () => {
  const plugin = join(record("TES3", 0), record("CELL", 0x2, cellData(0, 4, 9)))
  const [cell] = parseTes3Plugin(plugin.buffer as ArrayBuffer)
  assert.equal(cell.displayName, "Wilderness (4, 9)")
  assert.equal(cell.modifiedReferences, 0)
  assert.equal(cell.selected, false)

  assert.throws(
    () => parseTes3Plugin(encoder.encode("CELL").buffer as ArrayBuffer),
    /record header is truncated/u,
  )
  assert.throws(
    () => parseTes3Plugin(record("CELL", 0).buffer as ArrayBuffer),
    /first record is not TES3/u,
  )
})
