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
  ship: () => setFlow(ship(flow)),
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

void loadModels((s) => {
  loadText = s.state === 'error' ? s.text : s.state === 'loading' ? s.text : ''
  render()
})

// Measure the canvas itself (its grid column), not #app — otherwise the image is squashed horizontally
function layout() {
  const rect = canvas.getBoundingClientRect()
  if (rect.width > 0 && rect.height > 0) view.resize(rect.width, rect.height)
}
new ResizeObserver(layout).observe(canvas)
layout()
render()

function loop() {
  view.render()
  requestAnimationFrame(loop)
}
loop()
