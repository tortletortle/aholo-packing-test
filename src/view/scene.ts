import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import type { GameState } from '../logic/game'
import { previewOrigin } from '../logic/game'
import { occupiedCells } from '../logic/shapes'
import { cellKey, type Cell, type ShapeId } from '../logic/types'
import { getTemplate, placeModel, type FitMode } from './models'
import { buildCrate } from './crate'

export type SceneExtras = {
  /** Draw the crate lid (shipped) */
  lid?: boolean
  /** Empty cells to fill with packing material, and its colour */
  fillCells?: Cell[]
  fillColor?: number
}

export type ViewOptions = {
  /** Draw cell outlines over placed models */
  showCells: boolean
  fit: FitMode
}

const CELL = 1
const COLORS: Record<string, number> = {
  bar: 0x3d8bfd,
  block: 0xe6a23c,
  L: 0x67c23a,
  previewOk: 0x66ffcc,
  previewBad: 0xff6688,
  conflict: 0xff2244,
  ghost: 0x88aacc,
}

/** Camera presets; azimuth 0 = straight from the open (+Z) side of the box. */
const VIEWS = [
  // fill = how much of the frame (NDC, 1 = edge) the box may use
  { label: '斜俯视', elevation: 52, azimuth: 12, fill: 0.8 },
  { label: '正俯视', elevation: 88, azimuth: 0, fill: 0.8 },
  { label: '低角度', elevation: 28, azimuth: 18, fill: 0.8 },
] as const

// Filler lumps share one geometry and one material per colour (never disposed, reused every redraw)
const FILLER_GEO = new THREE.IcosahedronGeometry(0.5, 1)
const FILLER_MATS: Record<number, THREE.MeshStandardMaterial> = {}

function cellCenter(c: Cell): THREE.Vector3 {
  return new THREE.Vector3((c.x + 0.5) * CELL, (c.y + 0.5) * CELL, (c.z + 0.5) * CELL)
}

export class PackingScene {
  readonly renderer: THREE.WebGLRenderer
  readonly scene = new THREE.Scene()
  readonly camera: THREE.PerspectiveCamera
  private readonly root = new THREE.Group()
  private readonly content = new THREE.Group()
  private readonly overlays = new THREE.Group()
  readonly options: ViewOptions = { showCells: false, fit: 'real' }
  /** Max axis-scale ratio of the last drawn model (1 = no distortion) */
  lastDistortion: number | null = null

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.scene.background = new THREE.Color(0x1a1d24)
    // Image-based lighting so PBR (metal/roughness) assets don't render flat or black
    const pmrem = new THREE.PMREMGenerator(this.renderer)
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    this.scene.environmentIntensity = 0.6
    pmrem.dispose()
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.35))
    const dir = new THREE.DirectionalLight(0xffffff, 0.85)
    dir.position.set(8, 14, 10)
    this.scene.add(dir)

    this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100)

    this.scene.add(this.root)
    this.root.add(this.content)
    this.root.add(this.overlays)
  }

  resize(width: number, height: number) {
    this.renderer.setSize(width, height, false)
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    this.frameBin()
  }

  private bin = { sx: 6, sy: 2, sz: 4 }
  viewIndex = 0

  /** Cycle camera preset. All presets look from the +Z side so WASD keeps the same screen direction. */
  nextView(): string {
    this.viewIndex = (this.viewIndex + 1) % VIEWS.length
    this.frameBin()
    return VIEWS[this.viewIndex].label
  }

  get viewLabel(): string {
    return VIEWS[this.viewIndex].label
  }

  /** Point the camera at the box centre and pull back just enough to fit the whole box. */
  private frameBin() {
    const { sx, sy, sz } = this.bin
    const v = VIEWS[this.viewIndex]
    const target = new THREE.Vector3((sx * CELL) / 2, (sy * CELL) / 3, (sz * CELL) / 2)
    const el = THREE.MathUtils.degToRad(v.elevation)
    const az = THREE.MathUtils.degToRad(v.azimuth)
    const dir = new THREE.Vector3(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az))
    const corners: THREE.Vector3[] = []
    for (const x of [0, sx]) for (const y of [0, sy]) for (const z of [0, sz]) corners.push(new THREE.Vector3(x, y, z).multiplyScalar(CELL))
    const place = (d: number) => {
      this.camera.position.copy(target).addScaledVector(dir, d)
      this.camera.lookAt(target)
      this.camera.updateMatrixWorld()
    }
    // Closest distance at which every box corner stays inside the frame (with margin)
    const limit = v.fill
    const fits = (d: number) => {
      place(d)
      return corners.every((c) => {
        const p = c.clone().project(this.camera)
        return Math.abs(p.x) <= limit && Math.abs(p.y) <= limit
      })
    }
    // Search well inside the camera's far plane (100), otherwise the box gets clipped away
    let lo = 0.5
    let hi = 60
    for (let i = 0; i < 30; i++) {
      const mid = (lo + hi) / 2
      if (fits(mid)) hi = mid
      else lo = mid
    }
    place(hi)
  }

  render() {
    this.renderer.render(this.scene, this.camera)
  }

  private extras: SceneExtras = {}

  sync(state: GameState, extras: SceneExtras = {}) {
    this.extras = extras
    this.clearGroup(this.content)
    this.clearGroup(this.overlays)
    if (state.bin.sx !== this.bin.sx || state.bin.sy !== this.bin.sy || state.bin.sz !== this.bin.sz) {
      this.bin = { ...state.bin }
      this.frameBin()
    }
    // Floor grid only while placing (or when cell lines are switched on)
    this.drawBin(state.bin.sx, state.bin.sy, state.bin.sz, state.preview !== null || this.options.showCells)

    // Visual top surface per (x,z) column, so stacked models sit on the real top of the model below
    // instead of floating at the cell boundary. Occupancy rules are unchanged.
    this.surface.clear()
    const ordered = [...state.placements].sort((a, b) => a.origin.y - b.origin.y)
    for (const p of ordered) {
      // While re-editing, still show original solid until confirm — preview drawn separately
      if (state.preview?.restore?.id === p.id) continue
      const cells = occupiedCells(p.shapeId, p.origin, p.rot)
      if (this.drawModel(p.shapeId, cells, p.rot, this.content, true)) {
        if (this.options.showCells) this.drawOutlines(cells, 0xffd27a)
      } else {
        this.drawCells(cells, COLORS[p.shapeId] ?? 0xffffff, 0.92, this.content)
        for (const c of cells) this.raiseSurface(c.x, c.z, (c.y + 0.96) * CELL)
      }
    }

    if (extras.fillCells?.length && extras.fillColor !== undefined && !extras.lid) this.drawFiller(extras.fillCells, extras.fillColor)

    if (state.preview && state.lastResult) {
      const origin = previewOrigin(state)
      if (origin) {
        const cells = occupiedCells(state.preview.shapeId, origin, state.preview.rot)
        this.drawModel(state.preview.shapeId, cells, state.preview.rot, this.overlays)
        const ok = state.lastResult.ok
        this.drawCells(cells, ok ? COLORS.previewOk : COLORS.previewBad, 0.35, this.overlays)
        this.drawOutlines(cells, ok ? 0xaaffdd : 0xff8899)
        for (const c of state.lastResult.conflictCells) {
          this.drawCells([c], COLORS.conflict, 0.45, this.overlays)
        }
      }
    }
  }

  private drawBin(sx: number, sy: number, sz: number, showGrid: boolean) {
    // Table top under the crate
    const table = new THREE.Mesh(
      new THREE.BoxGeometry(sx + 3, 0.2, sz + 3),
      new THREE.MeshStandardMaterial({ color: 0x4a3426, roughness: 0.95 }),
    )
    table.position.set(sx / 2, -0.18, sz / 2)
    this.content.add(table)
    this.content.add(buildCrate(sx, sy, sz, { lid: this.extras.lid ?? false }))
    if (showGrid) this.drawFloorGrid(sx, sz)
  }

  /** Filler drawn into the empty cells after sealing. */
  private drawFiller(cells: Cell[], color: number) {
    // Loose lumps instead of solid cubes, so the goods stay visible and cell edges don't show.
    // Positions come from the cell coordinates, so the pile looks the same on every redraw.
    const geo = FILLER_GEO
    const mat = (FILLER_MATS[color] ??= new THREE.MeshStandardMaterial({ color, roughness: 1, flatShading: true }))
    for (const c of cells) {
      let seed = (c.x * 73856093) ^ (c.y * 19349663) ^ (c.z * 83492791)
      const rnd = () => ((seed = (seed * 16807 + 12345) & 0x7fffffff) / 0x7fffffff)
      for (let i = 0; i < 3; i++) {
        const m = new THREE.Mesh(geo, mat)
        const s = 0.22 + rnd() * 0.2
        m.scale.set(s, s * (0.7 + rnd() * 0.4), s)
        m.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3)
        // Heavier at the bottom of the cell: filler settles downwards
        m.position.set((c.x + 0.2 + rnd() * 0.6) * CELL, (c.y + 0.15 + rnd() * 0.4) * CELL, (c.z + 0.2 + rnd() * 0.6) * CELL)
        m.userData.sharedAsset = true
        this.content.add(m)
      }
    }
  }

  /** Grid lines exactly on the box floor (GridHelper is square and spilled outside a 6×4 box). */
  private drawFloorGrid(sx: number, sz: number) {
    const pts: number[] = []
    for (let x = 0; x <= sx; x++) pts.push(x * CELL, 0.01, 0, x * CELL, 0.01, sz * CELL)
    for (let z = 0; z <= sz; z++) pts.push(0, 0.01, z * CELL, sx * CELL, 0.01, z * CELL)
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
    this.content.add(new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0x667788 })))
  }

  /** Draw the shape's real model fitted to its occupied cells. Returns false if no model is loaded. */
  private readonly surface = new Map<string, number>()

  private raiseSurface(x: number, z: number, y: number) {
    const k = `${x},${z}`
    this.surface.set(k, Math.max(this.surface.get(k) ?? 0, y))
  }

  private drawModel(shapeId: ShapeId, cells: Cell[], rot: number, parent: THREE.Group, record = false): boolean {
    const tpl = getTemplate(shapeId)
    if (!tpl) return false
    const min = new THREE.Vector3(Infinity, Infinity, Infinity)
    const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity)
    for (const c of cells) {
      min.min(new THREE.Vector3(c.x * CELL, c.y * CELL, c.z * CELL))
      max.max(new THREE.Vector3((c.x + 1) * CELL, (c.y + 1) * CELL, (c.z + 1) * CELL))
    }
    // Rest on the highest visual surface under the footprint (0 on the box floor)
    let baseY = 0
    if (min.y > 0) for (const c of cells) baseY = Math.max(baseY, this.surface.get(`${c.x},${c.z}`) ?? 0)
    const { object, distortion, height } = placeModel(tpl, min, max, rot, this.options.fit, 0.92, baseY)
    if (record) for (const c of cells) this.raiseSurface(c.x, c.z, height)
    this.lastDistortion = distortion
    parent.add(object)
    return true
  }

  private drawCells(cells: Cell[], color: number, opacity: number, parent: THREE.Group) {
    const geo = new THREE.BoxGeometry(CELL * 0.92, CELL * 0.92, CELL * 0.92)
    const mat = new THREE.MeshStandardMaterial({
      color,
      transparent: opacity < 0.99,
      opacity,
      roughness: 0.45,
      metalness: 0.05,
    })
    for (const c of cells) {
      const mesh = new THREE.Mesh(geo, mat)
      mesh.position.copy(cellCenter(c))
      parent.add(mesh)
    }
  }

  private drawOutlines(cells: Cell[], color: number) {
    const seen = new Set(cells.map(cellKey))
    void seen
    for (const c of cells) {
      const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(CELL * 0.95, CELL * 0.95, CELL * 0.95))
      const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color }))
      line.position.copy(cellCenter(c))
      this.overlays.add(line)
    }
  }

  private clearGroup(g: THREE.Group) {
    while (g.children.length) {
      const ch = g.children.pop()!
      g.remove(ch)
      ch.traverse((o) => {
        if (o.userData.sharedAsset) return // geometry/material belong to the loaded template
        const m = o as THREE.Mesh
        if (m.geometry) m.geometry.dispose()
        const mat = m.material
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose())
        else if (mat) (mat as THREE.Material).dispose()
      })
    }
  }
}
