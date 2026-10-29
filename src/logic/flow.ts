import { BOXES, START_GOLD, type BoxId } from '../config/economy'
import { cancelPreview, changeBin, createPackingState, type GameState } from './game'
import { ORDERS, type OrderDef } from './orders'

export type Phase = 'order' | 'packing' | 'settled'

export type Settlement = {
  readonly orderId: string
  readonly boxId: BoxId
  readonly payment: number
  readonly boxFee: number
  readonly shipFee: number
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
  readonly settlement: Settlement | null
}

export function createFlow(): FlowState {
  return { phase: 'order', orderIndex: 0, gold: START_GOLD, boxId: null, packing: null, settlement: null }
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

/**
 * Seal and ship. Settles exactly once: calling it again (or outside packing) changes nothing.
 */
export function seal(flow: FlowState): FlowState {
  if (!sealCheck(flow).ok || !flow.boxId || !flow.packing) return flow
  const order = currentOrder(flow)
  const box = BOXES[flow.boxId]
  const net = order.payment - box.boxFee - box.shipFee
  const settlement: Settlement = {
    orderId: order.id,
    boxId: box.id,
    payment: order.payment,
    boxFee: box.boxFee,
    shipFee: box.shipFee,
    net,
    goldBefore: flow.gold,
    goldAfter: flow.gold + net,
  }
  return {
    ...flow,
    phase: 'settled',
    gold: settlement.goldAfter,
    packing: { ...cancelPreview(flow.packing), status: '已封箱寄出' },
    settlement,
  }
}
