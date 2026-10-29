import { describe, expect, it } from 'vitest'
import { BOXES, START_GOLD } from '../config/economy'
import { confirmPreview, movePreview, selectItem, type GameState } from './game'
import { createFlow, seal, sealCheck, startPacking, switchBox, withPacking, type FlowState } from './flow'

/** Select an item, move its preview to (x,z), then confirm. */
function place(state: GameState, index: number, x: number, z: number): GameState {
  let s = selectItem(state, state.inventory[index].instanceId)
  const p = s.preview!
  s = movePreview(s, x - p.originX, 0)
  s = movePreview(s, 0, z - s.preview!.originZ)
  return confirmPreview(s)
}

/** Verified small-box solution for order 1: book flat, three mugs on top of it. */
function packOrder1Small(flow: FlowState): FlowState {
  let s = flow.packing!
  s = place(s, 0, 0, 0) // book 2×3 fills the floor
  s = place(s, 1, 0, 0) // mugs auto-rise onto the book
  s = place(s, 2, 1, 0)
  s = place(s, 3, 0, 1)
  return withPacking(flow, s)
}

describe('order 1 flow', () => {
  it('has a legal small-box solution', () => {
    const flow = packOrder1Small(startPacking(createFlow(), 'small'))
    expect(flow.packing!.placements).toHaveLength(4)
    expect(flow.packing!.placements.filter((p) => p.origin.y === 1)).toHaveLength(3)
    expect(sealCheck(flow).ok).toBe(true)
  })

  it('cannot seal with items left', () => {
    const flow = startPacking(createFlow(), 'small')
    expect(sealCheck(flow).ok).toBe(false)
    expect(seal(flow)).toBe(flow)
  })

  it('settles once with correct numbers; sealing again changes nothing', () => {
    const packed = packOrder1Small(startPacking(createFlow(), 'small'))
    const done = seal(packed)
    const box = BOXES.small
    expect(done.phase).toBe('settled')
    expect(done.settlement!.net).toBe(30 - box.boxFee - box.shipFee)
    expect(done.gold).toBe(START_GOLD + done.settlement!.net)
    expect(seal(done)).toBe(done)
  })

  it('small box earns more than large box', () => {
    const small = seal(packOrder1Small(startPacking(createFlow(), 'small')))
    let large = startPacking(createFlow(), 'large')
    let s = large.packing!
    s = place(s, 0, 0, 0)
    s = place(s, 1, 2, 0)
    s = place(s, 2, 3, 0)
    s = place(s, 3, 2, 1)
    large = seal(withPacking(large, s))
    expect(large.phase).toBe('settled')
    expect(small.settlement!.net).toBeGreaterThan(large.settlement!.net)
  })

  it('switching box keeps placements that still fit', () => {
    let flow = startPacking(createFlow(), 'large')
    let s = flow.packing!
    s = place(s, 0, 0, 0) // book at (0,0) fits in small box too
    s = place(s, 1, 3, 3) // mug at (3,3) does not
    flow = switchBox(withPacking(flow, s), 'small')
    expect(flow.packing!.placements).toHaveLength(1)
    expect(flow.packing!.inventory.filter((i) => i.placed)).toHaveLength(1)
  })
})
