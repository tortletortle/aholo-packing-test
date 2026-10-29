import { BOXES, BOX_ORDER, type BoxDef, type BoxId } from '../config/economy'
import { currentOrder, sealCheck, type FlowState } from '../logic/flow'
import { SHAPE_LABELS } from '../logic/shapes'
import type { ShapeId } from '../logic/types'

export type FlowActions = {
  startPacking: (boxId: BoxId) => void
  switchBox: (boxId: BoxId) => void
  seal: () => void
  restart: () => void
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function itemSummary(items: readonly ShapeId[]): string {
  const counts = new Map<ShapeId, number>()
  for (const i of items) counts.set(i, (counts.get(i) ?? 0) + 1)
  return [...counts]
    .map(([id, n]) => `<li>${esc(SHAPE_LABELS[id].split(' ')[0])} × ${n}</li>`)
    .join('')
}

function boxLine(b: BoxDef): string {
  const { sx, sy, sz } = b.size
  return `${b.label}（${sx}×${sz} 格，高 ${sy}）· 箱费 ${b.boxFee} · 运费 ${b.shipFee}`
}

/** Renders the order / packing / settlement panel. Only reads FlowState; changes go through actions. */
export function mountFlowPanel(getFlow: () => FlowState, actions: FlowActions): { refresh: () => void } {
  const root = document.querySelector<HTMLElement>('#flow')!
  const gold = document.querySelector<HTMLElement>('#gold')!
  const packingUi = document.querySelector<HTMLElement>('#packing-ui')!

  root.addEventListener('click', (e) => {
    const el = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-act]')
    if (!el || el.disabled) return
    const act = el.dataset.act
    const box = el.dataset.box as BoxId | undefined
    if (act === 'start' && box) actions.startPacking(box)
    if (act === 'switch' && box) actions.switchBox(box)
    if (act === 'seal') actions.seal()
    if (act === 'restart') actions.restart()
  })

  const refresh = () => {
    const flow = getFlow()
    const order = currentOrder(flow)
    gold.textContent = `金币：${flow.gold}`
    packingUi.hidden = flow.phase !== 'packing'

    const card = `
      <div class="order-card">
        <div class="order-head">订单 ${flow.orderIndex + 1} · ${esc(order.customer)}</div>
        <div class="order-dest">寄往：${esc(order.destination)}</div>
        <p class="order-note">${esc(order.note)}</p>
        <ul class="order-items">${itemSummary(order.items)}</ul>
        <div class="order-pay">客户支付：${order.payment} 金币</div>
      </div>`

    if (flow.phase === 'order') {
      root.innerHTML = `${card}
        <h2>选择箱子</h2>
        ${BOX_ORDER.map((id) => `<button type="button" class="flow-btn" data-act="start" data-box="${id}">${esc(boxLine(BOXES[id]))}</button>`).join('')}
        <p class="hint">箱子越小，箱费和运费越低。装不下也可以中途换大箱。</p>`
      return
    }

    if (flow.phase === 'packing') {
      const check = sealCheck(flow)
      const cur = flow.boxId ? BOXES[flow.boxId] : null
      const other = BOX_ORDER.filter((id) => id !== flow.boxId)
      root.innerHTML = `${card}
        <div class="box-current">当前：${cur ? esc(boxLine(cur)) : ''}</div>
        ${other.map((id) => `<button type="button" class="flow-btn subtle" data-act="switch" data-box="${id}">换成${esc(BOXES[id].label)}</button>`).join('')}
        <button type="button" class="flow-btn primary" data-act="seal" ${check.ok ? '' : 'disabled'}>封箱寄出</button>
        ${check.ok ? '' : `<p class="hint">${esc(check.reason)}</p>`}`
      return
    }

    const s = flow.settlement!
    const box = BOXES[s.boxId]
    root.innerHTML = `
      <div class="receipt">
        <div class="order-head">结算单 · 订单 ${flow.orderIndex + 1}</div>
        <div class="row"><span>客户支付</span><span>+${s.payment}</span></div>
        <div class="row"><span>${esc(box.label)}箱费</span><span>−${s.boxFee}</span></div>
        <div class="row"><span>运费</span><span>−${s.shipFee}</span></div>
        <div class="row total"><span>本单利润</span><span>${s.net >= 0 ? '+' : ''}${s.net}</span></div>
        <div class="row"><span>金币</span><span>${s.goldBefore} → ${s.goldAfter}</span></div>
      </div>
      <p class="hint">${s.boxId === 'small' ? '用小箱装下了，省下了箱费和运费。' : `如果用小箱装下，可以多赚 ${BOXES.large.boxFee + BOXES.large.shipFee - BOXES.small.boxFee - BOXES.small.shipFee} 金币。`}</p>
      <p class="hint">第二单、第三单还没做，目前只能重新开始。</p>
      <button type="button" class="flow-btn primary" data-act="restart">重新开始</button>`
  }

  return { refresh }
}
