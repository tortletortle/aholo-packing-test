import { describe, expect, it } from 'vitest'
import {
  buildOccupancy,
  clearanceFromAbove,
  DEFAULT_BIN,
  findLowestSupportHeight,
  supportStatus,
  validatePlacement,
} from './packing'
import { occupiedCells, rotateCellY, SHAPE_CELLS } from './shapes'
import { cellKey, type Cell, type Placement } from './types'
import {
  cancelPreview,
  confirmPreview,
  createInitialState,
  loadDemoLayout,
  movePreview,
  rotatePreview,
  selectItem,
} from './game'

const bin = DEFAULT_BIN

describe('rotation', () => {
  it('four 90° turns restore original occupied set relative to origin', () => {
    const origin: Cell = { x: 2, y: 0, z: 1 }
    const base = occupiedCells('L', origin, 0).map(cellKey).sort()
    let cells = SHAPE_CELLS.L.map((c) => ({ ...c }))
    for (let t = 0; t < 4; t++) {
      cells = cells.map((c) => rotateCellY(c, 1))
    }
    const back = cells
      .map((c) => ({ x: c.x + origin.x, y: c.y + origin.y, z: c.z + origin.z }))
      .map(cellKey)
      .sort()
    expect(back).toEqual(base)

    const after4 = occupiedCells('L', origin, 4).map(cellKey).sort()
    expect(after4).toEqual(base)
  })
})

describe('bounds and overlap', () => {
  it('detects out of bounds', () => {
    const r = validatePlacement('bar', { x: 5, y: 0, z: 0 }, 0, bin, new Map())
    expect(r.ok).toBe(false)
    expect(r.code).toBe('out_of_bounds')
  })

  it('detects overlap', () => {
    const p: Placement = { id: 'a', shapeId: 'block', origin: { x: 0, y: 0, z: 0 }, rot: 0 }
    const occ = buildOccupancy([p])
    const r = validatePlacement('bar', { x: 0, y: 0, z: 0 }, 0, bin, occ)
    expect(r.ok).toBe(false)
    expect(r.code).toBe('overlap')
  })
})

describe('L-shape empty cell', () => {
  it('allows another piece in the AABB hole of L', () => {
    const L: Placement = { id: 'L1', shapeId: 'L', origin: { x: 0, y: 0, z: 0 }, rot: 0 }
    // L occupies (0,0,0)(1,0,0)(0,0,1) — hole at (1,0,1)
    const occ = buildOccupancy([L])
    const r = validatePlacement('bar', { x: 1, y: 0, z: 1 }, 0, bin, occ)
    // bar needs 3 cells — just check single-cell via rotating... use a 1-cell by placing bar that only overlaps hole
    // Place bar at (1,0,1) would need (1,0,1)(2,0,1)(3,0,1) — (1,0,1) free
    expect(occ.has(cellKey({ x: 1, y: 0, z: 1 }))).toBe(false)
    expect(r.code).not.toBe('overlap') // may be ok or other
    expect(r.ok).toBe(true)
  })
})

describe('re-place excludes self', () => {
  it('moving preview does not conflict with own cells', () => {
    let state = createInitialState()
    const id = state.inventory[0].instanceId
    state = selectItem(state, id)
    state = confirmPreview(state)
    expect(state.placements).toHaveLength(1)
    state = selectItem(state, id) // re-edit
    expect(state.preview?.restore?.id).toBe(id)
    // stay at same spot — should be ok (self excluded)
    expect(state.lastResult?.ok).toBe(true)
    state = movePreview(state, 1, 0)
    // still evaluating without self
    expect(state.lastResult).not.toBeNull()
  })
})

describe('cancel restore', () => {
  it('cancel re-place leaves original layout', () => {
    let state = createInitialState()
    const id = state.inventory[1].instanceId
    state = selectItem(state, id)
    state = confirmPreview(state)
    const before = structuredClone(state.placements)
    state = selectItem(state, id)
    state = movePreview(state, 2, 1)
    state = rotatePreview(state)
    state = cancelPreview(state)
    expect(state.placements).toEqual(before)
    expect(state.preview).toBeNull()
  })
})

describe('support rules', () => {
  it('no support / partial / full', () => {
    const base: Placement = {
      id: 'base',
      shapeId: 'bar',
      origin: { x: 0, y: 0, z: 0 },
      rot: 0,
    }
    const occ = buildOccupancy([base])
    // L footprint 3 cells; only partial under if shifted
    const none = supportStatus('block', { x: 0, y: 1, z: 2 }, 0, occ)
    expect(none.code).toBe('no_support')

    // block at (0,1,0): footprint (0,0)(1,0)(0,1)(1,1) — below y0: bar covers (0,0,0)(1,0,0)(2,0,0) only z=0
    // so (0,0,1)(1,0,1) missing → partial
    const partial = supportStatus('block', { x: 0, y: 1, z: 0 }, 0, occ)
    expect(partial.code).toBe('partial_support')

    // Full: place second bar beside to fill — or put L on bar
    // L at (0,1,0): foot (0,0)(1,0)(0,1) — (0,1) empty below → partial
    // L at (0,1,0) needs (0,0,1) below empty
    // Use bar only: put block on two bars
    const bar2: Placement = { id: 'b2', shapeId: 'bar', origin: { x: 0, y: 0, z: 1 }, rot: 0 }
    const occ2 = buildOccupancy([base, bar2])
    const full = supportStatus('block', { x: 0, y: 1, z: 0 }, 0, occ2)
    expect(full.ok).toBe(true)
  })

  it('auto height picks lowest valid layer', () => {
    const p: Placement = { id: 'a', shapeId: 'block', origin: { x: 0, y: 0, z: 0 }, rot: 0 }
    const occ = buildOccupancy([p])
    // empty area at (3,z) → y=0
    expect(findLowestSupportHeight('bar', 3, 0, 0, bin, occ)).toBe(0)
    // on top of block — block is 2x2 at 0,0; bar 3 long won't fully support
    expect(findLowestSupportHeight('bar', 0, 0, 0, bin, occ)).toBe(null)
    // L 3-foot on block 4 cells — L needs 3 cells; block covers (0,0)(1,0)(0,1)(1,1)
    expect(findLowestSupportHeight('L', 0, 0, 0, bin, occ)).toBe(1)
  })
})

describe('closed cavity', () => {
  it('cannot place under an occupied cell above', () => {
    const top: Placement = { id: 'top', shapeId: 'bar', origin: { x: 0, y: 1, z: 0 }, rot: 0 }
    // Force occupancy at y=1 without caring support (unit test cavity)
    const occ = new Map<string, string>()
    for (const c of occupiedCells(top.shapeId, top.origin, top.rot)) occ.set(cellKey(c), top.id)
    const cells = occupiedCells('bar', { x: 0, y: 0, z: 0 }, 0)
    const blocked = clearanceFromAbove(cells, occ, bin)
    expect(blocked.length).toBeGreaterThan(0)
    const r = validatePlacement('bar', { x: 0, y: 0, z: 0 }, 0, bin, occ)
    expect(r.ok).toBe(false)
    expect(r.code).toBe('blocked_above')
  })
})

describe('demo layout', () => {
  it('loadDemoLayout is valid two-layer packing', () => {
    const state = loadDemoLayout()
    expect(state.placements).toHaveLength(3)
    const ys = state.placements.map((p) => p.origin.y)
    expect(ys).toContain(0)
    expect(ys).toContain(1)
  })
})

describe('preview stays inside the box', () => {
  it('ignores a move that would push cells outside', () => {
    let state = createInitialState()
    state = selectItem(state, state.inventory[0].instanceId) // bar 1×3 at (1,1)
    for (let i = 0; i < 10; i++) state = movePreview(state, 1, 0)
    expect(state.preview?.originX).toBe(DEFAULT_BIN.sx - 3)
    expect(state.lastResult?.ok).toBe(true)
    for (let i = 0; i < 10; i++) state = movePreview(state, 0, -1)
    expect(state.preview?.originZ).toBe(0)
  })

  it('shifts a rotated shape back inside instead of going out of bounds', () => {
    let state = createInitialState()
    const book = state.inventory.find((s) => s.shapeId === 'book')!
    state = selectItem(state, book.instanceId)
    for (let i = 0; i < 10; i++) state = movePreview(state, 1, 0)
    for (let t = 0; t < 4; t++) {
      state = rotatePreview(state)
      expect(state.lastResult?.code).not.toBe('out_of_bounds')
    }
  })
})

describe('multi-model showcase', () => {
  it('loads a valid layout with a mug stacked on the book', async () => {
    const { loadShowcaseLayout } = await import('./game')
    const s = loadShowcaseLayout()
    expect(s.placements).toHaveLength(6)
    expect(s.placements.some((p) => p.shapeId === 'mug' && p.origin.y === 1)).toBe(true)
  })
})
