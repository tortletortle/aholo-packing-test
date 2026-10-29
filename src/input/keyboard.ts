import type { GameState } from '../logic/game'
import { cancelPreview, confirmPreview, movePreview, rotatePreview } from '../logic/game'

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (target.isContentEditable) return true
  if (target.closest('[data-no-game-keys]')) return true
  return false
}

const HOLD_DELAY_MS = 280
const HOLD_REPEAT_MS = 90

type KeyAction = 'left' | 'right' | 'forward' | 'back' | 'rotate' | 'confirm' | 'cancel'

function mapKey(key: string): KeyAction | null {
  switch (key) {
    case 'a':
    case 'A':
    case 'ArrowLeft':
      return 'left'
    case 'd':
    case 'D':
    case 'ArrowRight':
      return 'right'
    case 'w':
    case 'W':
    case 'ArrowUp':
      return 'forward'
    case 's':
    case 'S':
    case 'ArrowDown':
      return 'back'
    case 'r':
    case 'R':
      return 'rotate'
    case 'Enter':
      return 'confirm'
    case 'Escape':
      return 'cancel'
    default:
      return null
  }
}

export type Step = { dx: number; dz: number }
/** Grid step for "screen up" and "screen right"; default matches the camera looking from +Z. */
export type MoveBasis = () => { forward: Step; right: Step }
const DEFAULT_BASIS: MoveBasis = () => ({ forward: { dx: 0, dz: -1 }, right: { dx: 1, dz: 0 } })

function applyAction(state: GameState, action: KeyAction, basis: MoveBasis): GameState {
  const { forward, right } = basis()
  switch (action) {
    case 'left':
      return movePreview(state, -right.dx, -right.dz)
    case 'right':
      return movePreview(state, right.dx, right.dz)
    case 'forward':
      return movePreview(state, forward.dx, forward.dz)
    case 'back':
      return movePreview(state, -forward.dx, -forward.dz)
    case 'rotate':
      return rotatePreview(state)
    case 'confirm':
      return confirmPreview(state)
    case 'cancel':
      return cancelPreview(state)
  }
}

export type KeyboardController = {
  dispose: () => void
}

export function bindKeyboard(
  getState: () => GameState,
  setState: (s: GameState) => void,
  basis: MoveBasis = DEFAULT_BASIS,
): KeyboardController {
  let holdTimer: number | null = null
  let repeatTimer: number | null = null
  let heldAction: KeyAction | null = null

  const clearHold = () => {
    if (holdTimer !== null) window.clearTimeout(holdTimer)
    if (repeatTimer !== null) window.clearInterval(repeatTimer)
    holdTimer = null
    repeatTimer = null
    heldAction = null
  }

  const fire = (action: KeyAction) => {
    setState(applyAction(getState(), action, basis))
  }

  const onDown = (e: KeyboardEvent) => {
    if (isEditableTarget(e.target)) return
    const action = mapKey(e.key)
    if (!action) return
    if (!getState().preview && action !== 'cancel') return
    e.preventDefault()
    if (e.repeat) return

    if (action === 'rotate' || action === 'confirm' || action === 'cancel') {
      fire(action)
      return
    }

    fire(action)
    heldAction = action
    clearHold()
    heldAction = action
    holdTimer = window.setTimeout(() => {
      repeatTimer = window.setInterval(() => {
        if (heldAction) fire(heldAction)
      }, HOLD_REPEAT_MS)
    }, HOLD_DELAY_MS)
  }

  const onUp = (e: KeyboardEvent) => {
    const action = mapKey(e.key)
    if (action && action === heldAction) clearHold()
  }

  window.addEventListener('keydown', onDown)
  window.addEventListener('keyup', onUp)
  window.addEventListener('blur', clearHold)

  return {
    dispose: () => {
      clearHold()
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup', onUp)
      window.removeEventListener('blur', clearHold)
    },
  }
}
