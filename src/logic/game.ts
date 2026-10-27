import { buildOccupancy, DEFAULT_BIN, validatePlacement, withAutoHeight } from './packing'
import { occupiedCells } from './shapes'
import type { BinSize, Cell, PlaceResult, Placement, RotTurns, ShapeId } from './types'

export type InventorySlot = {
  readonly instanceId: string
  readonly shapeId: ShapeId
  /** If placed, reference placement id (same as instanceId) */
  placed: boolean
}

export type PreviewState = {
  readonly instanceId: string
  readonly shapeId: ShapeId
  originX: number
  originZ: number
  rot: RotTurns
  /** Snapshot of placement before re-edit; null if new from inventory */
  readonly restore: Placement | null
}

export type GameState = {
  bin: BinSize
  inventory: InventorySlot[]
  placements: Placement[]
  preview: PreviewState | null
  status: string
  lastResult: PlaceResult | null
}

let seq = 1
function nid(prefix: string) {
  return `${prefix}-${seq++}`
}

export function createInitialState(): GameState {
  return {
    bin: { ...DEFAULT_BIN },
    inventory: [
      { instanceId: nid('bar'), shapeId: 'bar', placed: false },
      { instanceId: nid('block'), shapeId: 'block', placed: false },
      { instanceId: nid('L'), shapeId: 'L', placed: false },
      // extras for two-layer demo / re-place
      { instanceId: nid('bar'), shapeId: 'bar', placed: false },
      { instanceId: nid('block'), shapeId: 'block', placed: false },
      { instanceId: nid('L'), shapeId: 'L', placed: false },
    ],
    placements: [],
    preview: null,
    status: '点击列表选择物品开始摆放',
    lastResult: null,
  }
}

function occupancyExcludingPreview(state: GameState) {
  const exclude = state.preview?.restore?.id
  return buildOccupancy(state.placements, exclude)
}

export function evaluatePreview(state: GameState): PlaceResult | null {
  if (!state.preview) return null
  const { shapeId, originX, originZ, rot } = state.preview
  const occ = occupancyExcludingPreview(state)
  const { result } = withAutoHeight(shapeId, originX, originZ, rot, state.bin, occ)
  return result
}

function refreshPreview(state: GameState): GameState {
  if (!state.preview) return { ...state, lastResult: null }
  const occ = occupancyExcludingPreview(state)
  const { origin, result } = withAutoHeight(
    state.preview.shapeId,
    state.preview.originX,
    state.preview.originZ,
    state.preview.rot,
    state.bin,
    occ,
  )
  return {
    ...state,
    preview: { ...state.preview, originX: origin.x, originZ: origin.z },
    // keep x,z from preview; y comes from auto height in result
    lastResult: result,
    status: result.message,
  }
}

/** Effective preview origin including auto Y */
export function previewOrigin(state: GameState): Cell | null {
  if (!state.preview || !state.lastResult) return null
  const y = state.lastResult.supportHeight
  if (y === null) return { x: state.preview.originX, y: 0, z: state.preview.originZ }
  return { x: state.preview.originX, y, z: state.preview.originZ }
}

export function selectItem(state: GameState, instanceId: string): GameState {
  const slot = state.inventory.find((s) => s.instanceId === instanceId)
  if (!slot) return state

  // Cancel existing preview first (restore if needed)
  let next = cancelPreview(state)

  const existing = next.placements.find((p) => p.id === instanceId)
  if (existing) {
    next = {
      ...next,
      preview: {
        instanceId,
        shapeId: existing.shapeId,
        originX: existing.origin.x,
        originZ: existing.origin.z,
        rot: existing.rot,
        restore: { ...existing, origin: { ...existing.origin } },
      },
      status: '重摆中：移动/旋转只改预览，Enter 确认，Esc 取消并恢复',
    }
    return refreshPreview(next)
  }

  next = {
    ...next,
    preview: {
      instanceId,
      shapeId: slot.shapeId,
      originX: 1,
      originZ: 1,
      rot: 0,
      restore: null,
    },
    status: '预览中：WASD 移动 · R 旋转 · Enter 确认 · Esc 取消',
  }
  return refreshPreview(next)
}

export function movePreview(state: GameState, dx: number, dz: number): GameState {
  if (!state.preview) return state
  const next = {
    ...state,
    preview: {
      ...state.preview,
      originX: state.preview.originX + dx,
      originZ: state.preview.originZ + dz,
    },
  }
  return refreshPreview(next)
}

export function rotatePreview(state: GameState): GameState {
  if (!state.preview) return state
  const rot = ((state.preview.rot + 1) % 4) as RotTurns
  return refreshPreview({ ...state, preview: { ...state.preview, rot } })
}

export function confirmPreview(state: GameState): GameState {
  if (!state.preview || !state.lastResult) return state
  if (!state.lastResult.ok) {
    return { ...state, status: `无法确认：${state.lastResult.message}` }
  }
  const y = state.lastResult.supportHeight
  if (y === null) return { ...state, status: '无法确认：无有效高度' }

  const placement: Placement = {
    id: state.preview.instanceId,
    shapeId: state.preview.shapeId,
    origin: { x: state.preview.originX, y, z: state.preview.originZ },
    rot: state.preview.rot,
  }

  const without = state.placements.filter((p) => p.id !== placement.id)
  const inventory = state.inventory.map((s) =>
    s.instanceId === placement.id ? { ...s, placed: true } : s,
  )

  return {
    ...state,
    placements: [...without, placement],
    inventory,
    preview: null,
    lastResult: null,
    status: `已确认放置 ${placement.shapeId} @ (${placement.origin.x},${placement.origin.y},${placement.origin.z}) rot=${placement.rot}`,
  }
}

export function cancelPreview(state: GameState): GameState {
  if (!state.preview) return state
  // restore was never removed from placements on select for re-edit — placements stay until confirm
  // For new items restore is null; for re-edit restore exists and placements still hold original until confirm replaces
  return {
    ...state,
    preview: null,
    lastResult: null,
    status: state.preview.restore ? '已取消重摆，布局未改' : '已取消预览',
  }
}

/** Verified two-layer example layout (bar base + block on top with full support). */
export function loadDemoLayout(): GameState {
  let state = createInitialState()
  // Clear default inventory ids — rebuild deterministic demo
  seq = 1
  state = createInitialState()
  const barId = state.inventory[0].instanceId
  const blockId = state.inventory[1].instanceId
  const lId = state.inventory[2].instanceId

  const bar: Placement = { id: barId, shapeId: 'bar', origin: { x: 1, y: 0, z: 1 }, rot: 0 }
  const block: Placement = { id: blockId, shapeId: 'block', origin: { x: 1, y: 0, z: 2 }, rot: 0 }
  // L on second layer fully supported by bar+block footprint area — place L at (1,1,1)
  // bar covers (1,0,1)(2,0,1)(3,0,1); block covers (1,0,2)(2,0,2)(1,0,3)(2,0,3)
  // L at rot0 cells (1,1,1)(2,1,1)(1,1,2) — below are all occupied ✓
  const L: Placement = { id: lId, shapeId: 'L', origin: { x: 1, y: 1, z: 1 }, rot: 0 }

  // Validate demo
  let occ = buildOccupancy([])
  for (const p of [bar, block]) {
    const r = validatePlacement(p.shapeId, p.origin, p.rot, state.bin, occ)
    if (!r.ok) throw new Error(`demo invalid ${p.id}: ${r.message}`)
    for (const c of occupiedCells(p.shapeId, p.origin, p.rot)) occ.set(`${c.x},${c.y},${c.z}`, p.id)
  }
  const rL = validatePlacement(L.shapeId, L.origin, L.rot, state.bin, occ)
  if (!rL.ok) throw new Error(`demo L invalid: ${rL.message}`)

  return {
    ...state,
    placements: [bar, block, L],
    inventory: state.inventory.map((s) =>
      s.instanceId === barId || s.instanceId === blockId || s.instanceId === lId ? { ...s, placed: true } : s,
    ),
    preview: null,
    lastResult: null,
    status: '已载入两层示例：底层长条+块状，上层 L（完整支撑）',
  }
}
