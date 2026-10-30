import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import type { ShapeId } from '../logic/types'
import { getTemplate } from './models'
import { woodTexture } from './crate'

/** Real-world metres → scene units in the cabinet (1 unit ≈ 25 cm) */
const SCALE = 4

/** Where each item sits: shelf index (0 = bottom) and x position on the shelf */
const LAYOUT: Array<{ id: ShapeId; shelf: number; x: number }> = [
  { id: 'dragon', shelf: 2, x: 0 },
  { id: 'potion', shelf: 1, x: -0.9 },
  { id: 'mug', shelf: 1, x: 0.9 },
  { id: 'book', shelf: 0, x: 0 },
]

const SHELF_Y = [0.15, 1.45, 2.75]
const WIDTH = 3.4
const HEIGHT = 4.1
const DEPTH = 1.3

const HD_URLS: Partial<Record<ShapeId, string>> = {
  book: '/models/hd/book.glb',
  potion: '/models/hd/potion.glb',
  dragon: '/models/hd/dragon.glb',
  mug: '/models/hd/mug.glb',
}

/**
 * Cabinet view: a wooden display cabinet with the goods on its shelves.
 * Click an item to open the close-up view, which loads the high-resolution model.
 */
export class ShowcaseScene {
  readonly renderer: THREE.WebGLRenderer
  private readonly scene = new THREE.Scene()
  private readonly camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100)
  private readonly cabinet = new THREE.Group()
  private readonly items = new Map<THREE.Object3D, ShapeId>()
  private readonly raycaster = new THREE.Raycaster()
  private readonly pointer = new THREE.Vector2(9, 9)
  private hovered: ShapeId | null = null
  private readonly controls: OrbitControls
  private readonly hdLoader = new GLTFLoader()
  private readonly hdCache = new Map<ShapeId, THREE.Object3D>()
  private closeUp: THREE.Object3D | null = null
  private mode: 'cabinet' | 'closeup' = 'cabinet'
  private loadToken = 0

  onHover: (id: ShapeId | null) => void = () => {}
  onPick: (id: ShapeId) => void = () => {}

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.scene.background = new THREE.Color(0x17130f)
    const pmrem = new THREE.PMREMGenerator(this.renderer)
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    this.scene.environmentIntensity = 0.7
    pmrem.dispose()
    this.scene.add(new THREE.AmbientLight(0xffe2b8, 0.35))
    const key = new THREE.DirectionalLight(0xffdcae, 1.1)
    key.position.set(3, 6, 6)
    this.scene.add(key)
    this.scene.add(this.cabinet)

    this.controls = new OrbitControls(this.camera, canvas)
    this.controls.enablePan = false
    this.controls.enableDamping = true
    this.controls.autoRotate = true
    this.controls.autoRotateSpeed = 1.2
    this.controls.enabled = false

    canvas.addEventListener('pointermove', (e) => {
      const r = canvas.getBoundingClientRect()
      this.pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
    })
    canvas.addEventListener('pointerleave', () => this.pointer.set(9, 9))
    canvas.addEventListener('click', () => {
      if (this.mode === 'cabinet' && this.hovered) this.onPick(this.hovered)
    })
    this.cabinetView()
  }

  /** Rebuild cabinet and shelf items (call after the low-res models load). */
  build() {
    this.cabinet.clear()
    this.items.clear()
    const tex = woodTexture()
    const wood = new THREE.MeshStandardMaterial({ map: tex, color: 0x9a6a42, roughness: 0.8 })
    const back = new THREE.MeshStandardMaterial({ map: tex, color: 0x5a3c26, roughness: 0.95 })
    const glass = new THREE.MeshPhysicalMaterial({ color: 0xbfd9e6, transparent: true, opacity: 0.08, roughness: 0.05, metalness: 0 })
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => {
      const m = new THREE.Mesh(geo, mat)
      m.position.set(x, y, z)
      this.cabinet.add(m)
    }
    const t = 0.12
    add(new THREE.BoxGeometry(WIDTH, HEIGHT, 0.08), back, 0, HEIGHT / 2, -DEPTH / 2)
    add(new THREE.BoxGeometry(t, HEIGHT, DEPTH), wood, -WIDTH / 2, HEIGHT / 2, 0)
    add(new THREE.BoxGeometry(t, HEIGHT, DEPTH), wood, WIDTH / 2, HEIGHT / 2, 0)
    add(new THREE.BoxGeometry(WIDTH + 0.3, 0.25, DEPTH + 0.2), wood, 0, HEIGHT + 0.12, 0)
    add(new THREE.BoxGeometry(WIDTH + 0.2, 0.3, DEPTH + 0.1), wood, 0, -0.15, 0)
    for (const y of SHELF_Y.slice(1)) add(new THREE.BoxGeometry(WIDTH, 0.08, DEPTH), wood, 0, y - 0.04, 0)
    add(new THREE.BoxGeometry(WIDTH, HEIGHT, 0.02), glass, 0, HEIGHT / 2, DEPTH / 2)
    // Small warm lamp under the top so the shelves read clearly
    const lamp = new THREE.PointLight(0xffc98a, 6, 6)
    lamp.position.set(0, HEIGHT - 0.3, 0.3)
    this.cabinet.add(lamp)

    for (const slot of LAYOUT) {
      const tpl = getTemplate(slot.id)
      if (!tpl) continue
      const inst = tpl.object.clone(true)
      inst.scale.setScalar(SCALE)
      const holder = new THREE.Group()
      holder.add(inst)
      holder.position.set(slot.x, SHELF_Y[slot.shelf] + (tpl.size.y * SCALE) / 2 + 0.01, 0)
      holder.rotation.y = slot.id === 'book' ? 0.25 : -0.35
      holder.traverse((o) => this.items.set(o, slot.id))
      this.cabinet.add(holder)
    }
  }

  resize(width: number, height: number) {
    this.renderer.setSize(width, height, false)
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    if (this.mode === 'cabinet') this.cabinetView()
  }

  private cabinetView() {
    const fit = Math.max(HEIGHT / 2 + 0.4, (WIDTH / 2 + 0.6) / Math.max(this.camera.aspect, 0.1))
    const dist = fit / Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2))
    this.camera.position.set(0, HEIGHT / 2, dist)
    this.camera.lookAt(0, HEIGHT / 2, 0)
  }

  /** Close-up of one item using the high-resolution model; falls back to the shelf model. */
  async openCloseUp(id: ShapeId): Promise<'hd' | 'fallback'> {
    this.mode = 'closeup'
    this.cabinet.visible = false
    const token = ++this.loadToken
    let source: 'hd' | 'fallback' = 'hd'
    let obj = this.hdCache.get(id)
    if (!obj) {
      try {
        const gltf = await this.hdLoader.loadAsync(HD_URLS[id] ?? '')
        const box = new THREE.Box3().setFromObject(gltf.scene)
        gltf.scene.position.sub(box.getCenter(new THREE.Vector3()))
        obj = new THREE.Group().add(gltf.scene)
        this.hdCache.set(id, obj)
      } catch {
        source = 'fallback'
        obj = getTemplate(id)?.object.clone(true)
      }
    }
    if (token !== this.loadToken || !obj) return source
    if (this.closeUp) this.scene.remove(this.closeUp)
    const size = new THREE.Box3().setFromObject(obj).getSize(new THREE.Vector3())
    const s = 2 / Math.max(size.x, size.y, size.z)
    obj.scale.setScalar(s)
    obj.position.set(0, 0, 0)
    this.closeUp = obj
    this.scene.add(obj)
    this.camera.position.set(2.2, 1.4, 3.6)
    this.controls.target.set(0, 0, 0)
    this.controls.minDistance = 1.5
    this.controls.maxDistance = 8
    this.controls.enabled = true
    this.controls.update()
    return source
  }

  closeCloseUp() {
    this.loadToken++
    this.mode = 'cabinet'
    if (this.closeUp) this.scene.remove(this.closeUp)
    this.closeUp = null
    this.cabinet.visible = true
    this.controls.enabled = false
    this.cabinetView()
  }

  /** Stop auto-rotation once the player grabs the model. */
  pauseAutoRotate() {
    this.controls.autoRotate = false
  }

  render() {
    if (this.mode === 'closeup') {
      this.controls.update()
    } else {
      // Gentle sway with the mouse so the static cabinet feels alive
      const px = Math.abs(this.pointer.x) <= 1 ? this.pointer.x : 0
      this.camera.position.x += (px * 0.5 - this.camera.position.x) * 0.05
      this.camera.lookAt(0, HEIGHT / 2, 0)
      this.updateHover()
    }
    this.renderer.render(this.scene, this.camera)
  }

  private updateHover() {
    let id: ShapeId | null = null
    if (Math.abs(this.pointer.x) <= 1) {
      this.raycaster.setFromCamera(this.pointer, this.camera)
      const hit = this.raycaster.intersectObjects([...this.cabinet.children], true).find((h) => this.items.has(h.object))
      id = hit ? (this.items.get(hit.object) ?? null) : null
    }
    if (id !== this.hovered) {
      this.hovered = id
      this.canvas.style.cursor = id ? 'pointer' : 'default'
      this.onHover(id)
    }
  }
}
