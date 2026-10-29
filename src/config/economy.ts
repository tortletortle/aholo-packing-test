import type { BinSize } from '../logic/types'

/**
 * Placeholder numbers for the first order. All tuning lives here, separate from game logic.
 * Not final: to be balanced after playtesting.
 */
export type BoxId = 'small' | 'large'

export type BoxDef = {
  readonly id: BoxId
  readonly label: string
  readonly size: BinSize
  /** Cost of the box itself */
  readonly boxFee: number
  /** Shipping cost for this box size */
  readonly shipFee: number
}

export const BOXES: Record<BoxId, BoxDef> = {
  small: { id: 'small', label: '小木箱', size: { sx: 2, sy: 2, sz: 3 }, boxFee: 2, shipFee: 6 },
  large: { id: 'large', label: '大木箱', size: { sx: 4, sy: 2, sz: 4 }, boxFee: 5, shipFee: 12 },
}

export const BOX_ORDER: BoxId[] = ['small', 'large']

export const START_GOLD = 50

/**
 * Shaking risk, computed once at the moment of sealing.
 * risk = min(RISK_MAX, emptyRatio × RISK_PER_EMPTY_RATIO) × (1 − filler.reduction)
 */
export const RISK_PER_EMPTY_RATIO = 0.6
export const RISK_MAX = 0.6

export type FillerId = 'none' | 'straw' | 'wool' | 'foam'

export type FillerDef = {
  readonly id: FillerId
  readonly label: string
  /** Cost per empty cell (total rounded up) */
  readonly costPerCell: number
  /** Fraction of shaking risk removed */
  readonly reduction: number
  readonly color: number
}

export const FILLERS: Record<FillerId, FillerDef> = {
  none: { id: 'none', label: '不加填充', costPerCell: 0, reduction: 0, color: 0 },
  straw: { id: 'straw', label: '稻草', costPerCell: 0.5, reduction: 0.5, color: 0xd9b860 },
  wool: { id: 'wool', label: '羊毛', costPerCell: 1, reduction: 0.8, color: 0xe8e2d4 },
  foam: { id: 'foam', label: '魔法泡沫', costPerCell: 2, reduction: 1, color: 0x9fd6ff },
}

export const FILLER_ORDER: FillerId[] = ['none', 'straw', 'wool', 'foam']
