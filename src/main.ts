import './styles.css'
import { createInitialState, loadShowcaseLayout, type GameState } from './logic/game'
import { bindKeyboard } from './input/keyboard'
import { mountPanel } from './ui/panel'
import { PackingScene } from './view/scene'
import { FIT_LABELS, loadModels, type FitMode } from './view/models'

const canvas = document.querySelector<HTMLCanvasElement>('#c')!
let state: GameState = createInitialState()

const view = new PackingScene(canvas)

// --- real model check controls ---
const btnCells = document.querySelector<HTMLButtonElement>('#btn-cells')!
const btnFit = document.querySelector<HTMLButtonElement>('#btn-fit')!
const modelStatus = document.querySelector<HTMLDivElement>('#model-status')!
let loadText = ''

function refreshModelUi() {
  btnCells.textContent = `已放物品：${view.options.showCells ? '隐藏' : '显示'}占格线（C）`
  btnFit.textContent = `贴合：${FIT_LABELS[view.options.fit]}（F）`
  const d = view.lastDistortion
  const distortion = d === null ? '' : `\n当前变形：最大轴向缩放比 ${d.toFixed(2)}（1.00 = 不变形）`
  modelStatus.textContent = loadText + distortion
}
function toggleCells() {
  view.options.showCells = !view.options.showCells
  view.sync(state)
  refreshModelUi()
}
const FIT_ORDER: FitMode[] = ['real', 'fill', 'contain']
function toggleFit() {
  view.options.fit = FIT_ORDER[(FIT_ORDER.indexOf(view.options.fit) + 1) % FIT_ORDER.length]
  view.sync(state)
  refreshModelUi()
}
document.querySelector<HTMLButtonElement>('#btn-showcase')!.addEventListener('click', () => {
  state = loadShowcaseLayout()
  panel.refresh()
  view.sync(state)
  refreshModelUi()
})
const btnView = document.querySelector<HTMLButtonElement>('#btn-view')!
function nextView() {
  btnView.textContent = `视角：${view.nextView()}（V 切换）`
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

void loadModels((s) => {
  loadText = s.text
  view.sync(state)
  refreshModelUi()
})
const panel = mountPanel(
  () => state,
  (s) => {
    state = s
    panel.refresh()
    view.sync(state)
    refreshModelUi()
  },
)

bindKeyboard(
  () => state,
  (s) => {
    state = s
    panel.refresh()
    view.sync(state)
    refreshModelUi()
  },
)

// Measure the canvas itself (its grid column), not #app — otherwise the image is squashed horizontally
function layout() {
  const rect = canvas.getBoundingClientRect()
  if (rect.width > 0 && rect.height > 0) view.resize(rect.width, rect.height)
}
new ResizeObserver(layout).observe(canvas)
layout()
panel.refresh()
view.sync(state)

function loop() {
  view.render()
  requestAnimationFrame(loop)
}
loop()
