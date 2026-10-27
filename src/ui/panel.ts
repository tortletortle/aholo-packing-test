import type { GameState } from '../logic/game'
import { loadDemoLayout, selectItem } from '../logic/game'
import { SHAPE_LABELS } from '../logic/shapes'

export function mountPanel(
  getState: () => GameState,
  setState: (s: GameState) => void,
): { refresh: () => void } {
  const list = document.querySelector<HTMLUListElement>('#item-list')!
  const status = document.querySelector<HTMLDivElement>('#status')!
  const demoBtn = document.querySelector<HTMLButtonElement>('#btn-demo')!

  demoBtn.addEventListener('click', () => {
    setState(loadDemoLayout())
  })

  const refresh = () => {
    const state = getState()
    list.innerHTML = ''
    for (const slot of state.inventory) {
      const li = document.createElement('li')
      const btn = document.createElement('button')
      btn.type = 'button'
      const selected = state.preview?.instanceId === slot.instanceId
      const label = SHAPE_LABELS[slot.shapeId]
      btn.textContent = `${label} · ${slot.placed ? '已放入（点选重摆）' : '未放入'}${selected ? ' · 预览中' : ''}`
      btn.className = selected ? 'selected' : slot.placed ? 'placed' : ''
      btn.addEventListener('click', () => setState(selectItem(getState(), slot.instanceId)))
      li.appendChild(btn)
      list.appendChild(li)
    }

    const r = state.lastResult
    status.className = r ? (r.ok ? 'ok' : 'bad') : ''
    const lines = [state.status]
    if (r) {
      lines.push(`判定：${r.code}${r.ok ? '（可放置）' : '（不可放置）'}`)
      if (r.supportHeight !== null) lines.push(`预览高度层 y=${r.supportHeight}`)
      if (r.conflictCells.length) lines.push(`冲突/相关格数：${r.conflictCells.length}`)
    }
    status.innerHTML = lines.map((t) => `<div>${escapeHtml(t)}</div>`).join('')
  }

  return { refresh }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
