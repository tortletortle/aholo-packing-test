import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import type { GameState } from '../logic/game'
import { previewOrigin } from '../logic/game'
import { occupiedCells } from '../logic/shapes'
import { cellKey, type Cell, type ShapeId } from '../logic/types'
import { getTemplate, placeModel, type FitMode } from './models'

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
  { label: '斜俯视', elevation: 52, azimuth: 12, zoom: 0.82 },
  { label: '正俯视', elevation: 88, azimuth: 0, zoom: 0.78 },
  { label: '低角度', elevation: 28, azimuth: 18, zoom: 0.85 },
] as const

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
  readonly options: ViewOptions = { showCells: false, fit: 'fill' }
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
    const radius = Math.hypot(sx, sy, sz) * CELL * 0.5
    const vFov = THREE.MathUtils.degToRad(this.camera.fov)
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * this.camera.aspect)
    const dist = (radius / Math.sin(Math.min(vFov, hFov) / 2)) * v.zoom
    const el = THREE.MathUtils.degToRad(v.elevation)
    const az = THREE.MathUtils.degToRad(v.azimuth)
    this.camera.position.set(
      target.x + dist * Math.cos(el) * Math.sin(az),
      target.y + dist * Math.sin(el),
      target.z + dist * Math.cos(el) * Math.cos(az),
    )
    this.camera.lookAt(target)
  }

  render() {
    this.renderer.render(this.scene, this.camera)
  }

  sync(state: GameState) {
    this.clearGroup(this.content)
    this.clearGroup(this.overlays)
    if (state.bin.sx !== this.bin.sx || state.bin.sy !== this.bin.sy || state.bin.sz !== this.bin.sz) {
      this.bin = { ...state.bin }
      this.frameBin()
    }
    // Floor grid only while placing (or when cell lines are switched on)
    this.drawBin(state.bin.sx, state.bin.sy, state.bin.sz, state.preview !== null || this.options.showCells)

    for (const p of state.placements) {
      // While re-editing, still show original solid until confirm — preview drawn separately
      if (state.preview?.restore?.id === p.id) continue
      const cells = occupiedCells(p.shapeId, p.origin, p.rot)
      if (this.drawModel(p.shapeId, cells, p.rot, this.content)) {
        if (this.options.showCells) this.drawOutlines(cells, 0xffd27a)
      } else {
        this.drawCells(cells, COLORS[p.shapeId] ?? 0xffffff, 0.92, this.content)
      }
    }

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
    const matWall = new THREE.MeshStandardMaterial({ color: 0x4a5568, transparent: true, opacity: 0.35, side: THREE.DoubleSide })
    const matNear = new THREE.MeshStandardMaterial({ color: 0x88c0d0, transparent: true, opacity: 0.12, side: THREE.DoubleSide })
    const matFloor = new THREE.MeshStandardMaterial({ color: 0x2e3440, roughness: 0.9 })

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(sx * CELL, sz * CELL), matFloor)
    floor.rotation.x = -Math.PI / 2
    floor.position.set((sx * CELL) / 2, 0, (sz * CELL) / 2)
    this.content.add(floor)

    if (showGrid) this.drawFloorGrid(sx, sz)

    const h = sy * CELL
    const walls: Array<{ w: number; h: number; d: number; x: number; y: number; z: number; near?: boolean }> = [
      { w: sx * CELL, h, d: 0.06, x: (sx * CELL) / 2, y: h / 2, z: 0.03 }, // back -Z
      { w: 0.06, h, d: sz * CELL, x: 0.03, y: h / 2, z: (sz * CELL) / 2 }, // left
      { w: 0.06, h, d: sz * CELL, x: sx * CELL - 0.03, y: h / 2, z: (sz * CELL) / 2 }, // right
      { w: sx * CELL, h, d: 0.06, x: (sx * CELL) / 2, y: h / 2, z: sz * CELL - 0.03, near: true }, // near +Z transparent
    ]
    for (const w of walls) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w.w, w.h, w.d), w.near ? matNear : matWall)
      m.position.set(w.x, w.y, w.z)
      this.content.add(m)
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
  private drawModel(shapeId: ShapeId, cells: Cell[], rot: number, parent: THREE.Group): boolean {
    const tpl = getTemplate(shapeId)
    if (!tpl) return false
    const min = new THREE.Vector3(Infinity, Infinity, Infinity)
    const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity)
    for (const c of cells) {
      min.min(new THREE.Vector3(c.x * CELL, c.y * CELL, c.z * CELL))
      max.max(new THREE.Vector3((c.x + 1) * CELL, (c.y + 1) * CELL, (c.z + 1) * CELL))
    }
    const { object, distortion } = placeModel(tpl, min, max, rot, this.options.fit)
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
