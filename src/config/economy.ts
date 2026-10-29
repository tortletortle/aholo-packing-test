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
