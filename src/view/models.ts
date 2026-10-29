import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import type { ShapeId } from '../logic/types'

/** Visual models for shapes. Occupancy stays in SHAPE_CELLS; the model only follows it. */
export const MODEL_URLS: Partial<Record<ShapeId, string>> = {
  book: '/models/book.glb',
  potion: '/models/potion.glb',
  dragon: '/models/dragon.glb',
  mug: '/models/mug.glb',
}

/** Real-world size of one grid cell, used by the 'real' fit mode. */
export const CELL_METERS = 0.14

/**
 * real    = same metres→cells scale for every model, so relative sizes match Lux3D's predicted sizes
 *           (shrunk only if it would poke out of its cells)
 * fill    = scale each axis to the cell block (may distort)
 * contain = uniform scale to the largest size that fits the cells
 */
export type FitMode = 'real' | 'fill' | 'contain'
export const FIT_LABELS: Record<FitMode, string> = {
  real: '真实比例',
  fill: '拉伸填满格子',
  contain: '等比放大到格子',
}

export type ModelTemplate = {
  /** Model centred at origin, original size */
  readonly object: THREE.Object3D
  readonly size: THREE.Vector3
  readonly bytes: number | null
  readonly loadMs: number
}

export type ModelStatus = { state: 'loading' | 'ok' | 'error'; text: string }

const templates = new Map<ShapeId, ModelTemplate>()

export function getTemplate(shapeId: ShapeId): ModelTemplate | undefined {
  return templates.get(shapeId)
}

export async function loadModels(onStatus: (s: ModelStatus) => void): Promise<void> {
  const loader = new GLTFLoader()
  const entries = Object.entries(MODEL_URLS) as Array<[ShapeId, string]>
  onStatus({ state: 'loading', text: `模型加载中（${entries.length} 个）…` })
  const lines: string[] = []
  let failed = false
  for (const [shapeId, url] of entries) {
    const t0 = performance.now()
    try {
      const gltf = await loader.loadAsync(url)
      const loadMs = performance.now() - t0
      const box = new THREE.Box3().setFromObject(gltf.scene)
      const size = box.getSize(new THREE.Vector3())
      const center = box.getCenter(new THREE.Vector3())
      const pivot = new THREE.Group()
      gltf.scene.position.sub(center)
      pivot.add(gltf.scene)
      const res = performance.getEntriesByName(new URL(url, location.href).href)[0] as PerformanceResourceTiming | undefined
      const bytes = res?.encodedBodySize || null
      templates.set(shapeId, { object: pivot, size, bytes, loadMs })
      const kb = bytes ? `${(bytes / 1024).toFixed(0)} KB` : '大小未知'
      lines.push(`${shapeId}：已加载 ${kb} · ${loadMs.toFixed(0)} ms · 尺寸 ${fmt(size)} m`)
    } catch (err) {
      failed = true
      console.warn(`[models] ${shapeId} 加载失败`, err)
      lines.push(`${shapeId}：加载失败，改用方块显示`)
    }
  }
  onStatus({ state: failed ? 'error' : 'ok', text: lines.join('\n') })
}

/**
 * Clone a template and fit it into a cell-aligned box (world units = cells).
 * Shared geometry/materials are flagged so scene clearing does not dispose them.
 */
export function placeModel(
  tpl: ModelTemplate,
  boxMin: THREE.Vector3,
  boxMax: THREE.Vector3,
  rot: number,
  fit: FitMode,
  pad = 0.92,
  /** World Y the model's bottom rests on; defaults to the cell floor */
  baseY?: number,
): { object: THREE.Object3D; distortion: number; height: number } {
  const inst = tpl.object.clone(true)
  inst.traverse((o) => {
    o.userData.sharedAsset = true
  })

  // Target extents in the model's own (unrotated) axes. Odd turns swap x/z.
  const world = new THREE.Vector3().subVectors(boxMax, boxMin)
  const odd = rot % 2 === 1
  const tx = (odd ? world.z : world.x) * pad
  const ty = world.y * pad
  const tz = (odd ? world.x : world.z) * pad

  const sx = tx / tpl.size.x
  const sy = ty / tpl.size.y
  const sz = tz / tpl.size.z
  let scale: THREE.Vector3
  if (fit === 'fill') {
    scale = new THREE.Vector3(sx, sy, sz)
  } else {
    const containS = Math.min(sx, sy, sz)
    const s = fit === 'real' ? Math.min(1 / CELL_METERS, containS) : containS
    scale = new THREE.Vector3(s, s, s)
  }
  const distortion = Math.max(scale.x, scale.y, scale.z) / Math.min(scale.x, scale.y, scale.z)

  const holder = new THREE.Group()
  holder.userData.sharedAsset = true
  inst.scale.copy(scale)
  holder.add(inst)
  holder.rotation.y = (rot * Math.PI) / 2
  const height = tpl.size.y * scale.y
  const bottom = (baseY ?? boxMin.y) + 0.02
  holder.position.set((boxMin.x + boxMax.x) / 2, bottom + height / 2, (boxMin.z + boxMax.z) / 2)
  return { object: holder, distortion, height: bottom + height }
}

function fmt(v: THREE.Vector3) {
  return `${v.x.toFixed(2)}×${v.y.toFixed(2)}×${v.z.toFixed(2)}`
}
