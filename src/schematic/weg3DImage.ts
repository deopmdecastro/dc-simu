import { getCad3DImage } from './cad3DImage'

/** Contator WEG: usa a mesma base física +X 90° do Painel 3D. */
export function getWeg3DImage(): Promise<string> {
  return getCad3DImage('contactorWegCWC09')
}
