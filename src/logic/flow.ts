import { BOXES, FILLERS, START_GOLD, type BoxId, type FillerId } from '../config/economy'
import { inspect, fillerCost, riskWith, type Inspection } from './filling'
import { cancelPreview, changeBin, createPackingState, type GameState } from './game'
import { ORDERS, type OrderDef } from './orders'

/**
 * order   → choose a box
 * packing → place goods (layout editable)
 * sealed  → box closed; empty-space risk fixed; player may buy filler
 * settled → shipped; result rolled once and paid out
 */
export type Phase = 'order' | 'packing' | 'sealed' | 'settled'

export type Settlement = {
  readonly orderId: string
  readonly boxId: BoxId
  readonly fillerId: FillerId
  readonly payment: number
  readonly boxFee: number
  readonly shipFee: number
  readonly fillerCost: number
  readonly risk: number
  readonly broken: boolean
  readonly compensation: number
  readonly net: number
  readonly goldBefore: number
  readonly goldAfter: number
}

export type FlowState = {
  readonly phase: Phase
  readonly orderIndex: number
  readonly gold: number
  readonly boxId: BoxId | null
  readonly packing: GameState | null
  /** Taken once at sealing; the only box data that matters afterwards */
  readonly inspection: Inspection | null
  readonly fillerId: FillerId
  readonly settlement: Settlement | null
}

export function createFlow(): FlowState {
  return {
    phase: 'order',
    orderIndex: 0,
    gold: START_GOLD,
    boxId: null,
    packing: null,
    inspection: null,
    fillerId: 'none',
    settlement: null,
  }
}

export function currentOrder(flow: FlowState): OrderDef {
  return ORDERS[flow.orderIndex]
}

/** Accept the order with the chosen box and start packing. */
export function startPacking(flow: FlowState, boxId: BoxId): FlowState {
  if (flow.phase !== 'order') return flow
  return {
    ...flow,
    phase: 'packing',
    boxId,
    packing: createPackingState(BOXES[boxId].size, currentOrder(flow).items),
  }
}

/** Switch box during packing; legal placements are kept. */
export function switchBox(flow: FlowState, boxId: BoxId): FlowState {
  if (flow.phase !== 'packing' || !flow.packing || flow.boxId === boxId) return flow
  return { ...flow, boxId, packing: changeBin(flow.packing, BOXES[boxId].size) }
}

export function withPacking(flow: FlowState, packing: GameState): FlowState {
  if (flow.phase !== 'packing') return flow
  return { ...flow, packing }
}

export function sealCheck(flow: FlowState): { ok: boolean; reason: string } {
  if (flow.phase !== 'packing' || !flow.packing) return { ok: false, reason: '当前不在装箱阶段' }
  const left = flow.packing.inventory.filter((s) => !s.placed).length
  if (left > 0) return { ok: false, reason: `还有 ${left} 件货物没装进箱子` }
  if (flow.packing.preview) return { ok: false, reason: '先确认或取消正在摆放的货物' }
  return { ok: true, reason: '' }
}

/** Close the box. Empty space and shaking risk are computed here, once. */
export function seal(flow: FlowState): FlowState {
  if (!sealCheck(flow).ok || !flow.packing) return flow
  const packing = { ...cancelPreview(flow.packing), status: '已封箱' }
  return { ...flow, phase: 'sealed', packing, inspection: inspect(packing), fillerId: 'none' }
}

export function chooseFiller(flow: FlowState, fillerId: FillerId): FlowState {
  if (flow.phase !== 'sealed') return flow
  return { ...flow, fillerId }
}

/** Current risk for the sealed box with the chosen filler (null before sealing). */
export function currentRisk(flow: FlowState): number | null {
  return flow.inspection ? riskWith(flow.inspection, flow.fillerId) : null
}

/**
 * Ship and settle. The breakage roll happens exactly once; calling again changes nothing.
 * `roll` returns a number in [0,1); broken when roll < risk.
 */
export function ship(flow: FlowState, roll: () => number = Math.random): FlowState {
  if (flow.phase !== 'sealed' || !flow.boxId || !flow.inspection) return flow
  const order = currentOrder(flow)
  const box = BOXES[flow.boxId]
  const cost = fillerCost(flow.inspection, flow.fillerId)
  const risk = riskWith(flow.inspection, flow.fillerId)
  const broken = risk > 0 && roll() < risk
  const compensation = broken ? order.compensation : 0
  const net = order.payment - box.boxFee - box.shipFee - cost - compensation
  const settlement: Settlement = {
    orderId: order.id,
    boxId: box.id,
    fillerId: flow.fillerId,
    payment: order.payment,
    boxFee: box.boxFee,
    shipFee: box.shipFee,
    fillerCost: cost,
    risk,
    broken,
    compensation,
    net,
    goldBefore: flow.gold,
    goldAfter: flow.gold + net,
  }
  return { ...flow, phase: 'settled', gold: settlement.goldAfter, settlement }
}

/** After settling: take the next order, keeping the gold earned so far. Orders loop for now. */
export function nextOrder(flow: FlowState): FlowState {
  if (flow.phase !== 'settled') return flow
  return {
    ...createFlow(),
    gold: flow.gold,
    orderIndex: (flow.orderIndex + 1) % ORDERS.length,
  }
}

export { FILLERS }
