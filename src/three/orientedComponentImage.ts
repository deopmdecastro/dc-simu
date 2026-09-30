import type { ComponentType, ComponentViewOrientation } from '../types'
import { captureOrthographicModelImage } from '../schematic/orthographicModelImage'
import { getComponentGlbSpec } from './modelPaths'
import { normalizeComponentOrientation } from './componentOrientation'

// v2: orientação composta sobre a rotação base (igual ao Painel 3D).
const cache = new Map<string, Promise<string>>()

/** Captura ortográfica de uma orientação individual, sem alterar o GLB fonte. */
export function getOrientedComponentImage(
  type: ComponentType,
  value?: Partial<ComponentViewOrientation> | null,
): Promise<string> {
  const orientation = normalizeComponentOrientation(value)
  const key = `${type}:${orientation.x}:${orientation.y}:${orientation.z}`
  const existing = cache.get(key)
  if (existing) return existing

  const spec = getComponentGlbSpec(type)
  if (!spec) return Promise.reject(new Error(`Sem GLB para ${type}`))
  const radians = Math.PI / 180
  const promise = captureOrthographicModelImage({
    path: spec.path,
    rotation: spec.rotation,
    viewRotation: [orientation.x * radians, orientation.y * radians, orientation.z * radians],
    flipDepth: spec.flipDepth,
  }).catch((error) => {
    cache.delete(key)
    throw error
  })
  cache.set(key, promise)
  return promise
}
