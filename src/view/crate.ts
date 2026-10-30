import * as THREE from 'three'

/**
 * Procedural wooden crate sized to the bin (cells = world units).
 * Built from planks so any box size looks right without stretching a fixed model.
 * The near (+Z) wall is see-through so the inside stays visible while packing.
 */

let woodTex: THREE.CanvasTexture | null = null

/** Simple generated wood grain, shared by all crates and the showcase cabinet. */
export function woodTexture(): THREE.CanvasTexture {
  if (woodTex) return woodTex
  const w = 256
  const h = 64
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const g = c.getContext('2d')!
  g.fillStyle = '#8a5a32'
  g.fillRect(0, 0, w, h)
  let seed = 7
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  for (let i = 0; i < 70; i++) {
    const y = rnd() * h
    g.strokeStyle = `rgba(${60 + rnd() * 40},${32 + rnd() * 20},${14 + rnd() * 10},${0.25 + rnd() * 0.35})`
    g.lineWidth = 0.6 + rnd() * 1.6
    g.beginPath()
    g.moveTo(0, y)
    for (let x = 0; x <= w; x += 16) g.lineTo(x, y + Math.sin(x / 30 + i) * 1.5 + (rnd() - 0.5))
    g.stroke()
  }
  for (let i = 0; i < 3; i++) {
    g.fillStyle = 'rgba(60,34,16,0.5)'
    g.beginPath()
    g.ellipse(rnd() * w, rnd() * h, 4 + rnd() * 3, 2 + rnd() * 1.5, 0, 0, Math.PI * 2)
    g.fill()
  }
  woodTex = new THREE.CanvasTexture(c)
  woodTex.colorSpace = THREE.SRGBColorSpace
  woodTex.wrapS = woodTex.wrapT = THREE.RepeatWrapping
  woodTex.anisotropy = 4
  return woodTex
}

export type CrateOptions = {
  /** Show the closed lid */
  lid: boolean
}

const T = 0.08 // plank thickness
const GAP = 0.025 // gap between planks

export function buildCrate(sx: number, sy: number, sz: number, opts: CrateOptions): THREE.Group {
  const g = new THREE.Group()
  const tex = woodTexture()
  const plank = new THREE.MeshStandardMaterial({ map: tex, color: 0xc9a27a, roughness: 0.85 })
  const dark = new THREE.MeshStandardMaterial({ map: tex, color: 0x8f6b4a, roughness: 0.9 })
  const near = new THREE.MeshStandardMaterial({ map: tex, color: 0xc9a27a, roughness: 0.85, transparent: true, opacity: opts.lid ? 1 : 0.18, depthWrite: opts.lid })
  const iron = new THREE.MeshStandardMaterial({ color: 0x3b3b40, metalness: 0.7, roughness: 0.45 })

  const box = (w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat)
    m.position.set(x, y, z)
    g.add(m)
    return m
  }

  // Floor: planks running along X, one per cell row in Z
  for (let z = 0; z < sz; z++) box(sx, T, 1 - GAP, sx / 2, -T / 2, z + 0.5, dark)

  // Walls: horizontal planks, two per cell of height
  const rows = sy * 2
  const ph = sy / rows
  for (let r = 0; r < rows; r++) {
    const y = ph * r + ph / 2
    const h = ph - GAP
    box(sx + 2 * T, h, T, sx / 2, y, -T / 2, plank) // back
    box(T, h, sz, -T / 2, y, sz / 2, plank) // left
    box(T, h, sz, sx + T / 2, y, sz / 2, plank) // right
    box(sx + 2 * T, h, T, sx / 2, y, sz + T / 2, near) // near (see-through while packing)
  }

  // Corner posts
  const post = 0.12
  for (const [x, z] of [
    [-T, -T],
    [sx + T, -T],
    [-T, sz + T],
    [sx + T, sz + T],
  ] as const) {
    const m = box(post, sy + 0.04, post, x, sy / 2, z, z > sz ? near : dark)
    m.position.x += x < 0 ? post / 2 - T / 2 : T / 2 - post / 2
    m.position.z += z < 0 ? post / 2 - T / 2 : T / 2 - post / 2
  }

  // Iron bands near the top on the opaque walls
  box(sx + 2 * T + 0.02, 0.06, 0.02, sx / 2, sy - 0.12, -T - 0.01, iron)
  box(0.02, 0.06, sz + 2 * T, -T - 0.01, sy - 0.12, sz / 2, iron)
  box(0.02, 0.06, sz + 2 * T, sx + T + 0.01, sy - 0.12, sz / 2, iron)

  if (opts.lid) {
    for (let x = 0; x < sx; x++) box(1 - GAP, T, sz + 2 * T, x + 0.5, sy + T / 2, sz / 2, plank)
    // Cross battens on the lid
    box(sx + 2 * T, 0.05, 0.14, sx / 2, sy + T + 0.025, 0.4, dark)
    box(sx + 2 * T, 0.05, 0.14, sx / 2, sy + T + 0.025, sz - 0.4, dark)
  }

  g.traverse((o) => {
    o.userData.crate = true
  })
  return g
}
