import * as THREE from 'three'
import type { GameState } from '../logic/game'
import { previewOrigin } from '../logic/game'
import { occupiedCells } from '../logic/shapes'
import { cellKey, type Cell } from '../logic/types'

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

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    this.scene.background = new THREE.Color(0x1a1d24)
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.55))
    const dir = new THREE.DirectionalLight(0xffffff, 0.85)
    dir.position.set(8, 14, 10)
    this.scene.add(dir)

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100)
    // Fixed oblique top-front view; near wall (+Z) is the open/transparent side
    this.camera.position.set(5, 9, 11)
    this.camera.lookAt(3, 0.5, 2)

    this.scene.add(this.root)
    this.root.add(this.content)
    this.root.add(this.overlays)
  }

  resize(width: number, height: number) {
    this.renderer.setSize(width, height, false)
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
  }

  render() {
    this.renderer.render(this.scene, this.camera)
  }

  sync(state: GameState) {
    this.clearGroup(this.content)
    this.clearGroup(this.overlays)
    this.drawBin(state.bin.sx, state.bin.sy, state.bin.sz)

    for (const p of state.placements) {
      // While re-editing, still show original solid until confirm — preview drawn separately
      if (state.preview?.restore?.id === p.id) continue
      const cells = occupiedCells(p.shapeId, p.origin, p.rot)
      this.drawCells(cells, COLORS[p.shapeId] ?? 0xffffff, 0.92, this.content)
    }

    if (state.preview && state.lastResult) {
      const origin = previewOrigin(state)
      if (origin) {
        const cells = occupiedCells(state.preview.shapeId, origin, state.preview.rot)
        const ok = state.lastResult.ok
        this.drawCells(cells, ok ? COLORS.previewOk : COLORS.previewBad, 0.35, this.overlays)
        this.drawOutlines(cells, ok ? 0xaaffdd : 0xff8899)
        for (const c of state.lastResult.conflictCells) {
          this.drawCells([c], COLORS.conflict, 0.45, this.overlays)
        }
      }
    }
  }

  private drawBin(sx: number, sy: number, sz: number) {
    const matWall = new THREE.MeshStandardMaterial({ color: 0x4a5568, transparent: true, opacity: 0.35, side: THREE.DoubleSide })
    const matNear = new THREE.MeshStandardMaterial({ color: 0x88c0d0, transparent: true, opacity: 0.12, side: THREE.DoubleSide })
    const matFloor = new THREE.MeshStandardMaterial({ color: 0x2e3440, roughness: 0.9 })

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(sx * CELL, sz * CELL), matFloor)
    floor.rotation.x = -Math.PI / 2
    floor.position.set((sx * CELL) / 2, 0, (sz * CELL) / 2)
    this.content.add(floor)

    // grid lines on floor
    const grid = new THREE.GridHelper(Math.max(sx, sz), Math.max(sx, sz), 0x667788, 0x3a4555)
    grid.position.set((sx * CELL) / 2, 0.01, (sz * CELL) / 2)
    this.content.add(grid)

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
        const m = o as THREE.Mesh
        if (m.geometry) m.geometry.dispose()
        const mat = m.material
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose())
        else if (mat) (mat as THREE.Material).dispose()
      })
    }
  }
}
