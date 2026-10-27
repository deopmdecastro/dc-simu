import * as THREE from 'three'
import type { ComponentType } from '../types'
import { cloneModelScene } from '../three/modelFit'
import { createGltfLoader } from '../three/gltfLoader'
import { getComponentModelSpec, MODEL_PATHS, PANEL_UNITS_PER_MM } from '../three/modelPaths'
import { captureOrthographicModelImage, captureOrthographicObjectImage } from './orthographicModelImage'

const imagePromises = new Map<ComponentType, Promise<string>>()
const COMPOSITE_TERMINAL_TYPES = new Set<ComponentType>(['terminalSet1ph', 'terminalSet3ph', 'powerSource1ph', 'powerSource3ph'])
const TERMINAL_BODY_COLORS: Record<string, string> = {
  L: '#171717', L1: '#171717', L2: '#8b4513', L3: '#6b7280', N: '#2563eb', PE: '#27834a',
}
let terminalSource: Promise<THREE.Object3D> | undefined

async function captureTerminalAssemblyImage(type: ComponentType): Promise<string> {
  const conductors = type.endsWith('1ph') ? ['L', 'N', 'PE'] : ['L1', 'L2', 'L3', 'N', 'PE']
  const spec = getComponentModelSpec('terminalPhoenixPti6')!
  terminalSource ??= createGltfLoader().loadAsync(MODEL_PATHS.phoenixTerminalPti6)
    .then(({ scene }) => scene)
    .catch((error) => { terminalSource = undefined; throw error })
  const source = await terminalSource
  const physical = spec.physicalSizeMm
  const step = physical.width * PANEL_UNITS_PER_MM
  const assembly = new THREE.Group()
  conductors.forEach((conductor, index) => {
    const module = cloneModelScene(source)
    module.rotation.set(...spec.rotation)
    module.updateMatrixWorld(true)
    const sourceSize = new THREE.Box3().setFromObject(module, true).getSize(new THREE.Vector3())
    module.scale.set(physical.width * PANEL_UNITS_PER_MM / sourceSize.x, physical.height * PANEL_UNITS_PER_MM / sourceSize.y, physical.depth * PANEL_UNITS_PER_MM / sourceSize.z)
    module.updateMatrixWorld(true)
    const bounds = new THREE.Box3().setFromObject(module, true)
    const center = bounds.getCenter(new THREE.Vector3())
    module.position.set(-center.x + (index - (conductors.length - 1) / 2) * step, -center.y, -center.z)
    module.traverse((node) => {
      const mesh = node as THREE.Mesh
      if (!mesh.isMesh || !mesh.material) return
      const materials = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).map((material) => material.clone() as THREE.MeshStandardMaterial)
      materials.forEach((material) => {
        if (!material.color) return
        const hsl = { h: 0, s: 0, l: 0 }
        material.color.getHSL(hsl)
        if (hsl.s < 0.16 && hsl.l > 0.42) material.color.set(TERMINAL_BODY_COLORS[conductor])
      })
      mesh.material = Array.isArray(mesh.material) ? materials : materials[0]
      mesh.castShadow = mesh.receiveShadow = true
    })
    assembly.add(module)
  })
  return captureOrthographicObjectImage(assembly, [-0.12, Math.PI / 12, 0])
}

/** Vista frontal ortográfica produzida a partir da mesma base usada no Painel 3D. */
export function getCad3DImage(type: ComponentType): Promise<string> {
  const cached = imagePromises.get(type)
  if (cached) return cached
  const spec = getComponentModelSpec(type)
  if (!spec && !COMPOSITE_TERMINAL_TYPES.has(type)) return Promise.reject(new Error(`Sem modelo CAD para ${type}`))

  const promise = (COMPOSITE_TERMINAL_TYPES.has(type) ? captureTerminalAssemblyImage(type) : captureOrthographicModelImage({
    path: spec!.path,
    rotation: spec!.rotation,
    flipDepth: spec!.flipDepth,
    physicalSizeMm: spec!.physicalSizeMm,
  })).catch((error) => {
    imagePromises.delete(type)
    throw error
  })
  imagePromises.set(type, promise)
  return promise
}
