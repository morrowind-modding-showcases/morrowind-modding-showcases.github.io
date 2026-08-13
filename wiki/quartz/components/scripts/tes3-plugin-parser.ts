import { isOfficialTes3Cell } from "./official-tes3-cell-index"

const TES3_RECORD_HEADER_BYTES = 16
const TES3_SUBRECORD_HEADER_BYTES = 8
const CELL_FLAG_INTERIOR = 0x1

export const MAX_TES3_PLUGIN_BYTES = 256 * 1024 * 1024

export type ParsedTes3Cell = {
  id: string
  name: string
  displayName: string
  changeType: "New" | "Modified"
  modifiedReferences: number
  landscapeEdited?: boolean
  selected: boolean
  interior: boolean
  grid: { x: number; y: number } | null
  region: string
}

export type Tes3LocationMatch = {
  matched: string[]
  unmatched: string[]
  exteriorCells: string[]
}

const decoder = new TextDecoder("windows-1252")

function tagAt(bytes: Uint8Array, offset: number): string {
  return String.fromCharCode(
    bytes[offset] ?? 0,
    bytes[offset + 1] ?? 0,
    bytes[offset + 2] ?? 0,
    bytes[offset + 3] ?? 0,
  )
}

function pluginError(message: string): never {
  throw new Error(`The plugin file is invalid: ${message}`)
}

function decodeString(bytes: Uint8Array): string {
  const nul = bytes.indexOf(0)
  return decoder.decode(nul === -1 ? bytes : bytes.subarray(0, nul)).trim()
}

function parseCellRecord(payload: Uint8Array): Omit<ParsedTes3Cell, "id" | "selected"> {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength)
  let offset = 0
  let name = ""
  let region = ""
  let cellFlags: number | null = null
  let gridX = 0
  let gridY = 0
  let modifiedReferences = 0
  let referenceStarted = false

  while (offset < payload.byteLength) {
    if (payload.byteLength - offset < TES3_SUBRECORD_HEADER_BYTES) {
      pluginError("a CELL subrecord header is truncated.")
    }
    const tag = tagAt(payload, offset)
    const size = view.getUint32(offset + 4, true)
    const dataStart = offset + TES3_SUBRECORD_HEADER_BYTES
    const dataEnd = dataStart + size
    if (dataEnd > payload.byteLength) pluginError(`CELL subrecord ${tag} is truncated.`)

    if (tag === "FRMR") {
      if (size !== 4) pluginError("a CELL FRMR subrecord has the wrong size.")
      modifiedReferences += 1
      referenceStarted = true
    } else if (!referenceStarted && tag === "NAME" && !name) {
      name = decodeString(payload.subarray(dataStart, dataEnd))
    } else if (!referenceStarted && tag === "RGNN" && !region) {
      region = decodeString(payload.subarray(dataStart, dataEnd))
    } else if (!referenceStarted && tag === "DATA" && cellFlags === null) {
      if (size !== 12) pluginError("a CELL DATA subrecord has the wrong size.")
      cellFlags = view.getUint32(dataStart, true)
      gridX = view.getInt32(dataStart + 4, true)
      gridY = view.getInt32(dataStart + 8, true)
    }
    offset = dataEnd
  }

  if (cellFlags === null) pluginError("a CELL record is missing its DATA subrecord.")
  const interior = (cellFlags & CELL_FLAG_INTERIOR) !== 0
  const grid = interior ? null : { x: gridX, y: gridY }
  const displayName =
    name ||
    (interior
      ? "Unnamed interior"
      : `${region || "Wilderness"} (${gridX}, ${gridY})`)
  return {
    name: displayName,
    displayName,
    changeType: isOfficialTes3Cell(interior, name, grid) ? "Modified" : "New",
    modifiedReferences,
    interior,
    grid,
    region,
  }
}

function parseLandscapeGrid(payload: Uint8Array): { x: number; y: number } {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength)
  let offset = 0
  while (offset < payload.byteLength) {
    if (payload.byteLength - offset < TES3_SUBRECORD_HEADER_BYTES) {
      pluginError("a LAND subrecord header is truncated.")
    }
    const tag = tagAt(payload, offset)
    const size = view.getUint32(offset + 4, true)
    const dataStart = offset + TES3_SUBRECORD_HEADER_BYTES
    const dataEnd = dataStart + size
    if (dataEnd > payload.byteLength) pluginError(`LAND subrecord ${tag} is truncated.`)
    if (tag === "INTV") {
      if (size !== 8) pluginError("a LAND INTV subrecord has the wrong size.")
      return {
        x: view.getInt32(dataStart, true),
        y: view.getInt32(dataStart + 4, true),
      }
    }
    offset = dataEnd
  }
  pluginError("a LAND record is missing its INTV subrecord.")
}

function cellId(cell: Omit<ParsedTes3Cell, "id" | "selected">): string {
  return cell.interior
    ? `interior:${cell.name.toLocaleLowerCase("en-US")}`
    : `exterior:${cell.grid?.x ?? 0},${cell.grid?.y ?? 0}`
}

export function parseTes3Plugin(source: ArrayBuffer): ParsedTes3Cell[] {
  if (source.byteLength === 0) pluginError("the file is empty.")
  if (source.byteLength > MAX_TES3_PLUGIN_BYTES) {
    pluginError(`the file is larger than ${MAX_TES3_PLUGIN_BYTES / (1024 * 1024)} MiB.`)
  }

  const bytes = new Uint8Array(source)
  const view = new DataView(source)
  const cells = new Map<string, ParsedTes3Cell>()
  let offset = 0
  let recordIndex = 0

  while (offset < bytes.byteLength) {
    if (bytes.byteLength - offset < TES3_RECORD_HEADER_BYTES) {
      pluginError("a record header is truncated.")
    }
    const tag = tagAt(bytes, offset)
    const payloadSize = view.getUint32(offset + 4, true)
    const payloadStart = offset + TES3_RECORD_HEADER_BYTES
    const recordEnd = payloadStart + payloadSize
    if (recordEnd > bytes.byteLength) pluginError(`record ${tag} is truncated.`)
    if (recordIndex === 0 && tag !== "TES3") pluginError("the first record is not TES3.")

    if (tag === "CELL") {
      const parsed = parseCellRecord(bytes.subarray(payloadStart, recordEnd))
      const id = cellId(parsed)
      const current = cells.get(id)
      if (current) {
        current.modifiedReferences += parsed.modifiedReferences
        if (parsed.changeType === "New") current.changeType = "New"
        current.selected = current.modifiedReferences > 0 || current.landscapeEdited === true
        current.name = parsed.name
        current.displayName = parsed.displayName
        current.interior = parsed.interior
        current.grid = parsed.grid
        if (!current.region && parsed.region) current.region = parsed.region
      } else {
        cells.set(id, {
          ...parsed,
          id,
          selected: parsed.modifiedReferences > 0,
        })
      }
    } else if (tag === "LAND") {
      const grid = parseLandscapeGrid(bytes.subarray(payloadStart, recordEnd))
      const id = `exterior:${grid.x},${grid.y}`
      const current = cells.get(id)
      if (current) {
        current.landscapeEdited = true
        current.selected = true
      } else {
        const displayName = `Landscape (${grid.x}, ${grid.y})`
        cells.set(id, {
          id,
          name: displayName,
          displayName,
          changeType: isOfficialTes3Cell(false, "", grid) ? "Modified" : "New",
          modifiedReferences: 0,
          landscapeEdited: true,
          selected: true,
          interior: false,
          grid,
          region: "",
        })
      }
    }

    offset = recordEnd
    recordIndex += 1
  }

  if (recordIndex === 0) pluginError("the file contains no records.")
  return [...cells.values()].sort((left, right) =>
    left.displayName.localeCompare(right.displayName, "en-US", {
      sensitivity: "base",
    }),
  )
}

export function matchSelectedTes3CellsToLocations(
  cells: ParsedTes3Cell[],
  locations: string[],
): Tes3LocationMatch {
  const canonical = new Map(
    locations.map((location) => [location.toLocaleLowerCase("en-US"), location]),
  )
  const matched = new Map<string, string>()
  const unmatched = new Map<string, string>()
  const exteriorCells = new Map<string, string>()

  for (const cell of cells) {
    if (!cell.selected) continue
    if (!cell.interior && cell.grid) {
      const key = `${cell.grid.x},${cell.grid.y}`
      exteriorCells.set(key, `${cell.grid.x}, ${cell.grid.y}`)
      continue
    }
    const location = canonical.get(cell.name.toLocaleLowerCase("en-US"))
    if (location) matched.set(location.toLocaleLowerCase("en-US"), location)
    else unmatched.set(cell.displayName.toLocaleLowerCase("en-US"), cell.displayName)
  }

  return {
    matched: [...matched.values()],
    unmatched: [...unmatched.values()],
    exteriorCells: [...exteriorCells.values()],
  }
}
