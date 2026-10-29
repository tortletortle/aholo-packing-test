import { describe, expect, it } from 'vitest'
import { BOXES, START_GOLD } from '../config/economy'
import { confirmPreview, movePreview, selectItem, type GameState } from './game'
import {
  chooseFiller,
  createFlow,
  currentRisk,
  seal,
  sealCheck,
  ship,
  startPacking,
  switchBox,
  withPacking,
  type FlowState,
} from './flow'
import { fillerCost } from './filling'

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

function packOrder1Large(): FlowState {
  const flow = startPacking(createFlow(), 'large')
  let s = flow.packing!
  s = place(s, 0, 0, 0)
  s = place(s, 1, 2, 0)
  s = place(s, 2, 3, 0)
  s = place(s, 3, 2, 1)
  return withPacking(flow, s)
}

const SAFE = () => 0.999
const UNLUCKY = () => 0

describe('order 1 flow', () => {
  it('has a legal small-box solution', () => {
    const flow = packOrder1Small(startPacking(createFlow(), 'small'))
    expect(flow.packing!.placements.filter((p) => p.origin.y === 1)).toHaveLength(3)
    expect(sealCheck(flow).ok).toBe(true)
  })

  it('cannot seal with items left', () => {
    const flow = startPacking(createFlow(), 'small')
    expect(seal(flow)).toBe(flow)
  })

  it('sealing computes empty space once; layout is locked afterwards', () => {
    const sealed = seal(packOrder1Small(startPacking(createFlow(), 'small')))
    expect(sealed.phase).toBe('sealed')
    expect(sealed.inspection).toMatchObject({ volume: 12, empty: 3 })
    expect(withPacking(sealed, sealed.packing!)).toBe(sealed)
    expect(switchBox(sealed, 'large')).toBe(sealed)
  })

  it('emptier box is riskier', () => {
    const small = seal(packOrder1Small(startPacking(createFlow(), 'small')))
    const large = seal(packOrder1Large())
    expect(currentRisk(large)!).toBeGreaterThan(currentRisk(small)!)
  })

  it('better filler costs more and lowers risk; foam removes it', () => {
    const sealed = seal(packOrder1Large())
    const insp = sealed.inspection!
    const risks = (['none', 'straw', 'wool', 'foam'] as const).map((f) => currentRisk(chooseFiller(sealed, f))!)
    const costs = (['none', 'straw', 'wool', 'foam'] as const).map((f) => fillerCost(insp, f))
    for (let i = 1; i < 4; i++) {
      expect(risks[i]).toBeLessThan(risks[i - 1])
      expect(costs[i]).toBeGreaterThan(costs[i - 1])
    }
    expect(risks[3]).toBe(0)
    expect(ship(chooseFiller(sealed, 'foam'), UNLUCKY).settlement!.broken).toBe(false)
  })

  it('settles once with correct numbers; shipping again changes nothing', () => {
    const sealed = chooseFiller(seal(packOrder1Small(startPacking(createFlow(), 'small'))), 'straw')
    const done = ship(sealed, SAFE)
    const box = BOXES.small
    const filler = fillerCost(sealed.inspection!, 'straw')
    expect(done.settlement!.broken).toBe(false)
    expect(done.settlement!.net).toBe(30 - box.boxFee - box.shipFee - filler)
    expect(done.gold).toBe(START_GOLD + done.settlement!.net)
    expect(ship(done, UNLUCKY)).toBe(done)
  })

  it('breakage deducts compensation', () => {
    const sealed = seal(packOrder1Small(startPacking(createFlow(), 'small')))
    const ok = ship(sealed, SAFE).settlement!
    const bad = ship(sealed, UNLUCKY).settlement!
    expect(bad.broken).toBe(true)
    expect(ok.net - bad.net).toBe(20)
  })

  it('switching box keeps placements that still fit', () => {
    let flow = startPacking(createFlow(), 'large')
    let s = flow.packing!
    s = place(s, 0, 0, 0)
    s = place(s, 1, 3, 3)
    flow = switchBox(withPacking(flow, s), 'small')
    expect(flow.packing!.placements).toHaveLength(1)
  })
})
