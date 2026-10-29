import type { Cell, ShapeId } from './types'

/**
 * Local cells of each shape at rot=0, origin at (0,0,0).
 * L leaves (1,0,1) empty — occupancy is the set, not the AABB.
 */
export const SHAPE_CELLS: Record<ShapeId, readonly Cell[]> = {
  bar: [
    { x: 0, y: 0, z: 0 },
    { x: 1, y: 0, z: 0 },
    { x: 2, y: 0, z: 0 },
  ],
  block: [
    { x: 0, y: 0, z: 0 },
    { x: 1, y: 0, z: 0 },
    { x: 0, y: 0, z: 1 },
    { x: 1, y: 0, z: 1 },
  ],
  L: [
    { x: 0, y: 0, z: 0 },
    { x: 1, y: 0, z: 0 },
    { x: 0, y: 0, z: 1 },
  ],
  // Aholo Lux3D book (0.25 × 0.10 × 0.32 m) → 2 wide (x) × 1 tall × 3 deep (z)
  book: [
    { x: 0, y: 0, z: 0 },
    { x: 1, y: 0, z: 0 },
    { x: 0, y: 0, z: 1 },
    { x: 1, y: 0, z: 1 },
    { x: 0, y: 0, z: 2 },
    { x: 1, y: 0, z: 2 },
  ],
}

export const SHAPE_LABELS: Record<ShapeId, string> = {
  bar: '长条 (1×3)',
  block: '块状 (2×2)',
  L: 'L 形',
  book: '魔法书 (2×3，Aholo 模型)',
}

/** 90° CW around +Y looking down: (x,z) → (z, -x) */
export function rotateCellY(c: Cell, turns: number): Cell {
  let x = c.x
  let z = c.z
  const n = ((turns % 4) + 4) % 4
  for (let i = 0; i < n; i++) {
    const nx = z
    const nz = -x
    x = nx
    z = nz
  }
  return { x, y: c.y, z }
}

/** Occupied cells for a placement (integer set). */
export function occupiedCells(shapeId: ShapeId, origin: Cell, rot: number): Cell[] {
  return SHAPE_CELLS[shapeId].map((local) => {
    const r = rotateCellY(local, rot)
    return { x: r.x + origin.x, y: r.y + origin.y, z: r.z + origin.z }
  })
}

/** Horizontal footprint (unique x,z), ignoring y of local shape (all shapes are 1 tall). */
export function footprintXZ(shapeId: ShapeId, originX: number, originZ: number, rot: number): Array<{ x: number; z: number }> {
  const seen = new Set<string>()
  const out: Array<{ x: number; z: number }> = []
  for (const local of SHAPE_CELLS[shapeId]) {
    const r = rotateCellY(local, rot)
    const x = r.x + originX
    const z = r.z + originZ
    const k = `${x},${z}`
    if (!seen.has(k)) {
      seen.add(k)
      out.push({ x, z })
    }
  }
  return out
}
