import { footprintXZ, occupiedCells } from './shapes'
import type { BinSize, Cell, PlaceIssueCode, PlaceResult, Placement, ShapeId } from './types'
import { cellKey } from './types'

export type OccupancyMap = Map<string, string> // cellKey -> placementId

export function buildOccupancy(placements: Placement[], excludeId?: string): OccupancyMap {
  const map: OccupancyMap = new Map()
  for (const p of placements) {
    if (excludeId && p.id === excludeId) continue
    for (const c of occupiedCells(p.shapeId, p.origin, p.rot)) {
      map.set(cellKey(c), p.id)
    }
  }
  return map
}

function inBounds(c: Cell, bin: BinSize): boolean {
  return c.x >= 0 && c.y >= 0 && c.z >= 0 && c.x < bin.sx && c.y < bin.sy && c.z < bin.sz
}

/**
 * Conservative full-footprint support:
 * - y===0: ground of the bin (supported)
 * - else: every footprint (x,z) must have an occupied cell at (x, y-1, z)
 */
export function supportStatus(
  shapeId: ShapeId,
  origin: Cell,
  rot: number,
  occupancy: OccupancyMap,
): { ok: boolean; code: PlaceIssueCode; message: string; missing: Cell[] } {
  const y = origin.y
  if (y === 0) {
    return { ok: true, code: 'ok', message: '底层地面支撑', missing: [] }
  }
  const foot = footprintXZ(shapeId, origin.x, origin.z, rot)
  const missing: Cell[] = []
  for (const f of foot) {
    const below: Cell = { x: f.x, y: y - 1, z: f.z }
    if (!occupancy.has(cellKey(below))) missing.push(below)
  }
  if (missing.length === 0) {
    return { ok: true, code: 'ok', message: `完整底面支撑于 y=${y - 1}`, missing: [] }
  }
  if (missing.length === foot.length) {
    return { ok: false, code: 'no_support', message: `无支撑：y=${y} 下方足迹格全空`, missing }
  }
  return {
    ok: false,
    code: 'partial_support',
    message: `部分支撑：${missing.length}/${foot.length} 足迹格下方为空`,
    missing,
  }
}

/**
 * Insertion from above: for each target cell, all cells strictly above it in the same column
 * must be empty (cannot tunnel into a closed cavity under an overhang).
 */
export function clearanceFromAbove(cells: Cell[], occupancy: OccupancyMap, bin: BinSize): Cell[] {
  const blocked: Cell[] = []
  for (const c of cells) {
    for (let y = c.y + 1; y < bin.sy; y++) {
      const above: Cell = { x: c.x, y, z: c.z }
      if (occupancy.has(cellKey(above))) {
        blocked.push(above)
        break
      }
    }
  }
  return blocked
}

export function validatePlacement(
  shapeId: ShapeId,
  origin: Cell,
  rot: number,
  bin: BinSize,
  occupancy: OccupancyMap,
): PlaceResult {
  const cells = occupiedCells(shapeId, origin, rot)
  const out: Cell[] = []
  const overlap: Cell[] = []

  for (const c of cells) {
    if (!inBounds(c, bin)) out.push(c)
    else if (occupancy.has(cellKey(c))) overlap.push(c)
  }

  if (out.length) {
    return {
      ok: false,
      code: 'out_of_bounds',
      message: `越界：${out.length} 格超出箱子 ${bin.sx}×${bin.sz}×高${bin.sy}`,
      cells,
      conflictCells: out,
      supportHeight: origin.y,
    }
  }

  if (overlap.length) {
    return {
      ok: false,
      code: 'overlap',
      message: `重叠：与已放物品冲突 ${overlap.length} 格`,
      cells,
      conflictCells: overlap,
      supportHeight: origin.y,
    }
  }

  const blocked = clearanceFromAbove(cells, occupancy, bin)
  if (blocked.length) {
    return {
      ok: false,
      code: 'blocked_above',
      message: `上方阻挡：无法从顶部落入（封闭空隙不可穿入）`,
      cells,
      conflictCells: blocked,
      supportHeight: origin.y,
    }
  }

  const support = supportStatus(shapeId, origin, rot, occupancy)
  if (!support.ok) {
    return {
      ok: false,
      code: support.code,
      message: support.message,
      cells,
      conflictCells: support.missing,
      supportHeight: origin.y,
    }
  }

  return {
    ok: true,
    code: 'ok',
    message: `可放置 · ${support.message}`,
    cells,
    conflictCells: [],
    supportHeight: origin.y,
  }
}

/**
 * Auto preview: lowest valid layer y for fixed horizontal origin (x,z) and rotation.
 * Returns null if none.
 */
export function findLowestSupportHeight(
  shapeId: ShapeId,
  originX: number,
  originZ: number,
  rot: number,
  bin: BinSize,
  occupancy: OccupancyMap,
): number | null {
  for (let y = 0; y < bin.sy; y++) {
    const r = validatePlacement(shapeId, { x: originX, y, z: originZ }, rot, bin, occupancy)
    if (r.ok) return y
  }
  return null
}

/** Apply auto height into a candidate origin (keeps x,z,rot). */
export function withAutoHeight(
  shapeId: ShapeId,
  originX: number,
  originZ: number,
  rot: number,
  bin: BinSize,
  occupancy: OccupancyMap,
): { origin: Cell; result: PlaceResult } {
  const y = findLowestSupportHeight(shapeId, originX, originZ, rot, bin, occupancy)
  if (y === null) {
    const origin = { x: originX, y: 0, z: originZ }
    const result = validatePlacement(shapeId, origin, rot, bin, occupancy)
    return {
      origin,
      result: {
        ...result,
        ok: false,
        message: result.ok ? '无有效支撑高度' : result.message,
        supportHeight: null,
      },
    }
  }
  const origin = { x: originX, y, z: originZ }
  return { origin, result: validatePlacement(shapeId, origin, rot, bin, occupancy) }
}

export const DEFAULT_BIN: BinSize = { sx: 6, sy: 2, sz: 4 }
