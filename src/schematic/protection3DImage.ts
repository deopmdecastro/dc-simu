import type { ComponentType } from '../types'
import { getCad3DImage } from './cad3DImage'

/** Compatibilidade: os CAD de proteção usam agora o render partilhado. */
export function getProtection3DImage(type: ComponentType): Promise<string> {
  return getCad3DImage(type)
}
