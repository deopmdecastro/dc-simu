import type { ComponentType } from '../types'
import { getCad3DImage } from './cad3DImage'

/** Compatibilidade: os CAD de comando usam agora o render partilhado. */
export function getCommand3DImage(type: ComponentType): Promise<string> {
  return getCad3DImage(type)
}
