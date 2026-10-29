import type { ShapeId } from './types'

export type OrderDef = {
  readonly id: string
  readonly customer: string
  readonly destination: string
  readonly note: string
  readonly items: readonly ShapeId[]
  /** Amount the customer pays for the job */
  readonly payment: number
}

/**
 * Fixed orders for the demo. Order 1 teaches packing: it has a verified small-box solution
 * (book flat on the floor, three mugs stacked on top), see packing.test.ts.
 */
export const ORDERS: readonly OrderDef[] = [
  {
    id: 'order-1',
    customer: '图书馆学徒 莉娜',
    destination: '北境 · 雪松镇图书馆',
    note: '一本魔法书和三只酒杯，是给馆长的生日礼物。东西不贵重，但别弄丢了。',
    items: ['book', 'mug', 'mug', 'mug'],
    payment: 30,
  },
]
