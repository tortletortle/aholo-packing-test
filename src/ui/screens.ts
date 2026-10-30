export type ScreenId = 'loading' | 'hub' | 'packing' | 'showcase' | 'market' | 'wall'

const ELEMENTS: Record<ScreenId, string> = {
  loading: '#loading',
  hub: '#hub',
  packing: '#app',
  showcase: '#showcase',
  market: '#market',
  wall: '#wall',
}

/** Overlays sit on top of the hub instead of replacing it. */
const OVERLAYS: ScreenId[] = ['market', 'wall']

let current: ScreenId = 'loading'
const listeners: Array<(id: ScreenId) => void> = []

export function currentScreen(): ScreenId {
  return current
}

export function onScreenChange(fn: (id: ScreenId) => void) {
  listeners.push(fn)
}

export function go(id: ScreenId) {
  current = id
  const base: ScreenId = OVERLAYS.includes(id) ? 'hub' : id
  for (const [sid, sel] of Object.entries(ELEMENTS) as Array<[ScreenId, string]>) {
    const el = document.querySelector<HTMLElement>(sel)
    if (el) el.hidden = !(sid === id || sid === base)
  }
  for (const fn of listeners) fn(id)
}

/** Any element with data-go="<screen>" navigates on click. */
export function bindNavigation() {
  document.addEventListener('click', (e) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-go]')
    if (el?.dataset.go) go(el.dataset.go as ScreenId)
  })
}
