import type { ComponentType } from '../types'
import { getComponentModelSpec } from '../three/modelPaths'
import { captureOrthographicModelImage } from './orthographicModelImage'

const imagePromises = new Map<ComponentType, Promise<string>>()

/** Vista frontal ortográfica produzida a partir da mesma base usada no Painel 3D. */
export function getCad3DImage(type: ComponentType): Promise<string> {
  const cached = imagePromises.get(type)
  if (cached) return cached
  const spec = getComponentModelSpec(type)
  if (!spec) return Promise.reject(new Error(`Sem modelo CAD para ${type}`))

  const promise = captureOrthographicModelImage({
    path: spec.path,
    rotation: spec.rotation,
    flipDepth: spec.flipDepth,
  }).catch((error) => {
    imagePromises.delete(type)
    throw error
  })
  imagePromises.set(type, promise)
  return promise
}
