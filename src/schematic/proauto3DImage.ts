import { getCad3DImage } from './cad3DImage'

/** Fonte Proauto: captura partilhada, frontal e ortográfica do GLB real. */
export function getProauto3DImage(): Promise<string> {
  return getCad3DImage('powerSupplyProauto24A')
}
