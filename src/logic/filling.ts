import { FILLERS, RISK_MAX, RISK_PER_EMPTY_RATIO, type FillerId } from '../config/economy'
import { buildOccupancy } from './packing'
import type { GameState } from './game'
import type { Cell } from './types'

/** Box snapshot taken once at sealing time. Only these numbers are kept. */
export type Inspection = {
  readonly volume: number
  readonly empty: number
  /** empty / volume */
  readonly emptyRatio: number
  /** Shaking/breakage risk before any filler (0–1) */
  readonly baseRisk: number
}

export function emptyCells(state: GameState): Cell[] {
  const occ = buildOccupancy(state.placements)
  const out: Cell[] = []
  const { sx, sy, sz } = state.bin
  for (let y = 0; y < sy; y++)
    for (let z = 0; z < sz; z++)
      for (let x = 0; x < sx; x++) if (!occ.has(`${x},${y},${z}`)) out.push({ x, y, z })
  return out
}

export function inspect(state: GameState): Inspection {
  const { sx, sy, sz } = state.bin
  const volume = sx * sy * sz
  const empty = emptyCells(state).length
  const emptyRatio = empty / volume
  return { volume, empty, emptyRatio, baseRisk: Math.min(RISK_MAX, emptyRatio * RISK_PER_EMPTY_RATIO) }
}

export function fillerCost(inspection: Inspection, filler: FillerId): number {
  return Math.ceil(inspection.empty * FILLERS[filler].costPerCell)
}

export function riskWith(inspection: Inspection, filler: FillerId): number {
  return inspection.baseRisk * (1 - FILLERS[filler].reduction)
}
