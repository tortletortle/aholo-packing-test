import './styles.css'
import { BOXES } from './config/economy'
import { createInitialState, createPackingState, loadShowcaseLayout, type GameState } from './logic/game'
import { chooseFiller, createFlow, seal, ship, startPacking, switchBox, withPacking, type FlowState } from './logic/flow'
import { FILLERS } from './config/economy'
import { emptyCells } from './logic/filling'
import type { SceneExtras } from './view/scene'
import { bindKeyboard } from './input/keyboard'
import { mountPanel } from './ui/panel'
import { mountFlowPanel } from './ui/flowPanel'
import { PackingScene } from './view/scene'
import { FIT_LABELS, loadModels, type FitMode } from './view/models'
import { nextOrder } from './logic/flow'
import { bindNavigation, currentScreen, go, onScreenChange } from './ui/screens'
import { ShowcaseScene } from './view/showcase'
import { CATALOG } from './logic/catalog'
import { ACHIEVEMENTS, loadUnlocked, unlockFrom } from './logic/achievements'

// ?mode=sandbox keeps the original test bench (all shapes, demo layouts); default is the order flow
const SANDBOX = new URLSearchParams(location.search).get('mode') === 'sandbox'

const canvas = document.querySelector<HTMLCanvasElement>('#c')!
const view = new PackingScene(canvas)

let flow: FlowState = createFlow()
let sandboxState: GameState = createInitialState()
/** Shown while choosing a box: an empty small box */
const idleBox = createPackingState(BOXES.small.size, [])

function packing(): GameState {
  if (SANDBOX) return sandboxState
  return flow.packing ?? idleBox
}

function setPacking(s: GameState) {
  if (SANDBOX) sandboxState = s
  else flow = withPacking(flow, s)
  render()
}

function setFlow(next: FlowState) {
  flow = next
  render()
}

// --- display controls ---
const btnCells = document.querySelector<HTMLButtonElement>('#btn-cells')!
const btnFit = document.querySelector<HTMLButtonElement>('#btn-fit')!
const btnView = document.querySelector<HTMLButtonElement>('#btn-view')!
const modelStatus = document.querySelector<HTMLDivElement>('#model-status')!
let loadText = ''

function refreshModelUi() {
  btnCells.textContent = `已放物品：${view.options.showCells ? '隐藏' : '显示'}占格线（C）`
  btnFit.textContent = `贴合：${FIT_LABELS[view.options.fit]}（F）`
  btnView.textContent = `视角：${view.viewLabel}（V 切换）`
  modelStatus.textContent = loadText
}
function toggleCells() {
  view.options.showCells = !view.options.showCells
  render()
}
const FIT_ORDER: FitMode[] = ['real', 'fill', 'contain']
function toggleFit() {
  view.options.fit = FIT_ORDER[(FIT_ORDER.indexOf(view.options.fit) + 1) % FIT_ORDER.length]
  render()
}
function nextView() {
  view.nextView()
  refreshModelUi()
}
btnCells.addEventListener('click', toggleCells)
btnFit.addEventListener('click', toggleFit)
btnView.addEventListener('click', nextView)
window.addEventListener('keydown', (e) => {
  if (e.repeat) return
  if (e.key === 'v' || e.key === 'V') nextView()
  if (e.key === 'c' || e.key === 'C') toggleCells()
  if (e.key === 'f' || e.key === 'F') toggleFit()
})

// --- panels ---
document.querySelector<HTMLElement>('#sandbox-tools')!.hidden = !SANDBOX
document.querySelector<HTMLElement>('#flow')!.hidden = SANDBOX
if (SANDBOX) document.querySelector('#title')!.textContent = '装箱小样（测试台）'
document.querySelector<HTMLButtonElement>('#btn-showcase')!.addEventListener('click', () => setPacking(loadShowcaseLayout()))

const panel = mountPanel(packing, setPacking)
const flowPanel = mountFlowPanel(() => flow, {
  startPacking: (boxId) => setFlow(startPacking(flow, boxId)),
  switchBox: (boxId) => setFlow(switchBox(flow, boxId)),
  seal: () => setFlow(seal(flow)),
  chooseFiller: (id) => setFlow(chooseFiller(flow, id)),
  ship: () => {
    setFlow(ship(flow))
    const fresh = flow.settlement ? unlockFrom(flow.settlement, unlocked) : []
    if (fresh.length) toast(`解锁成就：${fresh.map((a) => a.name).join('、')}`)
    refreshHub()
  },
  nextOrder: () => setFlow(nextOrder(flow)),
  restart: () => setFlow(createFlow()),
})

/** Lid after shipping; filler in empty cells while sealed */
function sceneExtras(): SceneExtras {
  if (SANDBOX) return {}
  if (flow.phase === 'settled') return { lid: true }
  if (flow.phase === 'sealed' && flow.packing && flow.fillerId !== 'none') {
    return { fillCells: emptyCells(flow.packing), fillColor: FILLERS[flow.fillerId].color }
  }
  return {}
}
bindKeyboard(packing, setPacking, () => view.screenAxes())
view.enableOrbit(canvas)
// Dev-only handle for automated checks (camera position, WASD mapping)
if (import.meta.env.DEV) (window as unknown as { __view: PackingScene }).__view = view

function render() {
  panel.refresh()
  if (SANDBOX) {
    document.querySelector<HTMLElement>('#packing-ui')!.hidden = false
    document.querySelector<HTMLElement>('#gold')!.hidden = true
  } else {
    flowPanel.refresh()
  }
  view.sync(packing(), sceneExtras())
  refreshModelUi()
}

// ---------- achievements + toast ----------
const unlocked = loadUnlocked()
const toastEl = document.querySelector<HTMLElement>('#toast')!
let toastTimer = 0
function toast(text: string) {
  toastEl.textContent = text
  toastEl.hidden = false
  window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => (toastEl.hidden = true), 3200)
}
function refreshWall() {
  document.querySelector('#wall-list')!.innerHTML = ACHIEVEMENTS.map((a) => {
    const got = unlocked.has(a.id)
    return `<li class="${got ? '' : 'locked'}"><span class="medal">${got ? '🏅' : '🔒'}</span><div><b>${a.name}</b><div class="hint">${a.condition}</div></div></li>`
  }).join('')
}
function refreshHub() {
  document.querySelector('#hub-gold')!.textContent = `金币：${flow.gold} · 成就 ${unlocked.size}/${ACHIEVEMENTS.length}`
}

// ---------- showcase ----------
const scCanvas = document.querySelector<HTMLCanvasElement>('#sc')!
const showcase = new ShowcaseScene(scCanvas)
const scCard = document.querySelector<HTMLElement>('#sc-card')!
const scHint = document.querySelector<HTMLElement>('#sc-hint')!
const scBack = document.querySelector<HTMLButtonElement>('#sc-back')!
let closeUpOpen = false

function itemCard(id: keyof typeof CATALOG, extra = '') {
  const c = CATALOG[id]
  if (!c) return ''
  return `<h2>${c.name}</h2><div class="hint">${c.origin} · 估价 ${c.value} 金币</div><p>${c.description}</p>${extra}`
}
showcase.onHover = (id) => {
  if (closeUpOpen) return
  scCard.hidden = !id
  if (id) scCard.innerHTML = itemCard(id, '<div class="hint">点击仔细看看</div>')
}
showcase.onPick = async (id) => {
  closeUpOpen = true
  scHint.textContent = '高清模型加载中…'
  scBack.textContent = '← 回展示柜'
  scCard.hidden = false
  scCard.innerHTML = itemCard(id)
  const source = await showcase.openCloseUp(id)
  if (!closeUpOpen) return
  scHint.textContent = source === 'hd' ? '拖动旋转 · 滚轮缩放（高清模型）' : '高清模型加载失败，显示的是普通模型'
}
scCanvas.addEventListener('pointerdown', () => closeUpOpen && showcase.pauseAutoRotate())
scBack.addEventListener('click', () => {
  if (closeUpOpen) {
    closeUpOpen = false
    showcase.closeCloseUp()
    scCard.hidden = true
    scHint.textContent = '点击柜子里的物品仔细看看'
    scBack.textContent = '← 回柜台'
  } else {
    go('hub')
  }
})

// ---------- screens ----------
bindNavigation()
onScreenChange((id) => {
  if (id === 'hub') refreshHub()
  if (id === 'wall') refreshWall()
  if (id === 'packing') render()
})

// Measure each canvas itself, not its container — otherwise the image is squashed horizontally
function fit(c: HTMLCanvasElement, resize: (w: number, h: number) => void) {
  const apply = () => {
    const r = c.getBoundingClientRect()
    if (r.width > 0 && r.height > 0) resize(r.width, r.height)
  }
  new ResizeObserver(apply).observe(c)
  apply()
}
fit(canvas, (w, h) => view.resize(w, h))
fit(scCanvas, (w, h) => showcase.resize(w, h))

// ---------- loading ----------
// Images and the shelf models must be ready before the counter appears. HD models load on demand.
const loadBar = document.querySelector<HTMLElement>('#load-bar')!
const loadTextEl = document.querySelector<HTMLElement>('#load-text')!
const IMAGES = ['/images/shop.jpg', '/images/workbench.jpg']
let imagesDone = 0
let modelsDone = 0
let modelsTotal = 4
function progress() {
  const done = imagesDone + modelsDone
  const total = IMAGES.length + modelsTotal
  loadBar.style.width = `${Math.round((done / total) * 100)}%`
  loadTextEl.textContent = `${done} / ${total}`
}
const imagesReady = Promise.all(
  IMAGES.map(
    (src) =>
      new Promise<void>((resolve) => {
        const img = new Image()
        img.onload = img.onerror = () => {
          imagesDone++
          progress()
          resolve()
        }
        img.src = src
      }),
  ),
)
const modelsReady = loadModels((s) => {
  modelsTotal = s.total
  modelsDone = s.loaded
  loadText = s.state === 'error' ? s.text : ''
  progress()
})
progress()
render()

void Promise.all([imagesReady, modelsReady]).then(() => {
  showcase.build()
  render()
  go(SANDBOX ? 'packing' : 'hub')
})

function loop() {
  const s = currentScreen()
  if (s === 'packing') view.render()
  else if (s === 'showcase') showcase.render()
  requestAnimationFrame(loop)
}
loop()
