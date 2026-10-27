import './styles.css'
import { createInitialState, type GameState } from './logic/game'
import { bindKeyboard } from './input/keyboard'
import { mountPanel } from './ui/panel'
import { PackingScene } from './view/scene'

const canvas = document.querySelector<HTMLCanvasElement>('#c')!
let state: GameState = createInitialState()

const view = new PackingScene(canvas)
const panel = mountPanel(
  () => state,
  (s) => {
    state = s
    panel.refresh()
    view.sync(state)
  },
)

bindKeyboard(
  () => state,
  (s) => {
    state = s
    panel.refresh()
    view.sync(state)
  },
)

function layout() {
  const rect = canvas.parentElement!.getBoundingClientRect()
  view.resize(rect.width, rect.height)
}
window.addEventListener('resize', layout)
layout()
panel.refresh()
view.sync(state)

function loop() {
  view.render()
  requestAnimationFrame(loop)
}
loop()
