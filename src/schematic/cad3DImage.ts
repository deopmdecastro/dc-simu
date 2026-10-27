import * as THREE from 'three'
import type { ComponentType } from '../types'
import { cloneModelScene } from '../three/modelFit'
import { createGltfLoader } from '../three/gltfLoader'
import { getComponentModelSpec, MODEL_PATHS, PANEL_UNITS_PER_MM } from '../three/modelPaths'
import { isTerminalAssemblyComponent, terminalAssemblyLayout, tintTerminalBodyMaterials } from '../three/terminalAssembly'
import { captureOrthographicModelImage, captureOrthographicObjectImage } from './orthographicModelImage'

const imagePromises = new Map<ComponentType, Promise<string>>()
let terminalSource: Promise<THREE.Object3D> | undefined

async function captureTerminalAssemblyImage(type: ComponentType): Promise<string> {
  const spec = getComponentModelSpec('terminalPhoenixPti6')!
  terminalSource ??= createGltfLoader().loadAsync(MODEL_PATHS.phoenixTerminalPti6)
    .then(({ scene }) => scene)
    .catch((error) => { terminalSource = undefined; throw error })
  const source = await terminalSource
  const physical = spec.physicalSizeMm
  const assembly = new THREE.Group()
  terminalAssemblyLayout(type, physical.width).forEach(({ x, color }) => {
    const module = cloneModelScene(source)
    module.rotation.set(...spec.rotation)
    module.updateMatrixWorld(true)
    const sourceSize = new THREE.Box3().setFromObject(module, true).getSize(new THREE.Vector3())
    module.scale.set(physical.width * PANEL_UNITS_PER_MM / sourceSize.x, physical.height * PANEL_UNITS_PER_MM / sourceSize.y, physical.depth * PANEL_UNITS_PER_MM / sourceSize.z)
    module.updateMatrixWorld(true)
    const bounds = new THREE.Box3().setFromObject(module, true)
    const center = bounds.getCenter(new THREE.Vector3())
    module.position.set(-center.x + x * PANEL_UNITS_PER_MM, -center.y, -center.z)
    module.traverse((node) => {
      const mesh = node as THREE.Mesh
      if (!mesh.isMesh || !mesh.material) return
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map((material) => material.clone()) : mesh.material.clone()
      mesh.castShadow = mesh.receiveShadow = true
    })
    tintTerminalBodyMaterials(module, color)
    assembly.add(module)
  })
  return captureOrthographicObjectImage(assembly, [-0.12, Math.PI / 12, 0])
}

/** Vista frontal ortográfica produzida a partir da mesma base usada no Painel 3D. */
export function getCad3DImage(type: ComponentType): Promise<string> {
  const cached = imagePromises.get(type)
  if (cached) return cached
  const spec = getComponentModelSpec(type)
  if (!spec && !isTerminalAssemblyComponent(type)) return Promise.reject(new Error(`Sem modelo CAD para ${type}`))

  const promise = (isTerminalAssemblyComponent(type) ? captureTerminalAssemblyImage(type) : captureOrthographicModelImage({
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
