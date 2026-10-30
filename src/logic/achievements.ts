import type { Settlement } from './flow'

export type AchievementId = 'first_order' | 'small_box' | 'bold' | 'zero_risk' | 'loss'

export type AchievementDef = {
  readonly id: AchievementId
  readonly name: string
  readonly condition: string
  readonly test: (s: Settlement) => boolean
}

export const ACHIEVEMENTS: readonly AchievementDef[] = [
  { id: 'first_order', name: '开张大吉', condition: '完成第一笔订单', test: () => true },
  { id: 'small_box', name: '寸土寸金', condition: '用小木箱完成订单', test: (s) => s.boxId === 'small' },
  { id: 'bold', name: '胆大心细', condition: '不加填充物，货物完好送达', test: (s) => s.fillerId === 'none' && !s.broken },
  { id: 'zero_risk', name: '万无一失', condition: '以 0% 破损风险寄出', test: (s) => s.risk === 0 },
  { id: 'loss', name: '亏本买卖', condition: '做完一单反而亏钱', test: (s) => s.net < 0 },
]

const KEY = 'qihuo.achievements.v1'

export function loadUnlocked(): Set<AchievementId> {
  try {
    return new Set(JSON.parse(localStorage.getItem(KEY) ?? '[]') as AchievementId[])
  } catch {
    return new Set()
  }
}

/** Unlock everything this settlement earns. Returns the newly unlocked ones. */
export function unlockFrom(s: Settlement, unlocked: Set<AchievementId>): AchievementDef[] {
  const fresh = ACHIEVEMENTS.filter((a) => !unlocked.has(a.id) && a.test(s))
  for (const a of fresh) unlocked.add(a.id)
  if (fresh.length) {
    try {
      localStorage.setItem(KEY, JSON.stringify([...unlocked]))
    } catch {
      /* storage unavailable: keep in memory only */
    }
  }
  return fresh
}
