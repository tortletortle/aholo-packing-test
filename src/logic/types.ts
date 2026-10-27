/** Integer grid cell. Y is vertical layer (0 = bottom). */
export type Cell = { readonly x: number; readonly y: number; readonly z: number }

export type ShapeId = 'bar' | 'block' | 'L'

export type RotTurns = 0 | 1 | 2 | 3

export type BinSize = { readonly sx: number; readonly sy: number; readonly sz: number }

export type Placement = {
  readonly id: string
  readonly shapeId: ShapeId
  readonly origin: Cell
  readonly rot: RotTurns
}

export type PlaceIssueCode =
  | 'out_of_bounds'
  | 'overlap'
  | 'no_support'
  | 'partial_support'
  | 'blocked_above'
  | 'ok'

export type PlaceResult = {
  readonly ok: boolean
  readonly code: PlaceIssueCode
  readonly message: string
  readonly cells: Cell[]
  /** Cells that conflict (overlap / out / support fail) for visualization */
  readonly conflictCells: Cell[]
  readonly supportHeight: number | null
}

export function cellKey(c: Cell): string {
  return `${c.x},${c.y},${c.z}`
}

export function cellsEqual(a: Cell, b: Cell): boolean {
  return a.x === b.x && a.y === b.y && a.z === b.z
}
