import type { ComponentType, ComponentViewOrientation } from '../types'
import { captureCad3DImage, getCad3DImage } from '../schematic/cad3DImage'
import { normalizeComponentOrientation } from './componentOrientation'
import { isTerminalAssemblyComponent } from './terminalAssembly'

// v3: orientação composta sobre o visual completo (CAD ou procedural, com estado e tinta).
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

  // Orientação original: a mesma vista frontal do Esquema 2D (pré-gerada, sem descarregar o GLB).
  if (isTerminalAssemblyComponent(type) || (!orientation.x && !orientation.y && !orientation.z)) {
    const composite = getCad3DImage(type)
    cache.set(key, composite)
    return composite
  }

  const radians = Math.PI / 180
  // A rotação usa o MESMO modelo completo da frente: LCD procedural,
  // serigrafias, manípulos e estado de fábrica — nunca o GLB despido.
  const promise = captureCad3DImage(type, [
    orientation.x * radians, orientation.y * radians, orientation.z * radians,
  ]).catch((error) => {
    cache.delete(key)
    throw error
  })
  cache.set(key, promise)
  return promise
}
