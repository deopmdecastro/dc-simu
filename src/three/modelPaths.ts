import type { ComponentType } from '../types'

/** URLs públicas dos modelos CAD disponíveis (ficheiros em public/models/). */
export const MODEL_PATHS = {
  powerSupplyProauto24A: '/models/fontes/fonte-proauto-dran120-24a.glb',
  plcSiemensLogo1224RC: '/models/controladores/logo-siemens-1224rc.glb',
  /** Contator WEG CWC07/CWC09 10E — modelo CAD real do fabricante. */
  wegContactorCWC09: '/models/contactores/weg-cwc07-10e.glb',
} as const

export type ProtectionModelSpec = {
  path: string
  /** Orienta o CAD para a vista frontal da cena (Y para cima, Z para a frente). */
  rotation: [number, number, number]
}

/** Modelos CAD confirmados: Q2A5 é 1P; «DISJUNTOR 2» corresponde ao modelo de 2 polos. */
const PROTECTION_MODELS: Partial<Record<ComponentType, ProtectionModelSpec>> = {
  // Estes dois ficheiros foram exportados com Z para cima e a frente em -Y.
  breaker1p: { path: '/models/protecao/Q2A5.glb', rotation: [-Math.PI / 2, 0, 0] },
  breaker2p: { path: '/models/protecao/DISJUNTOR%202.glb', rotation: [-Math.PI / 2, 0, 0] },
}

export function getProtectionModelSpec(type: ComponentType): ProtectionModelSpec | undefined {
  return PROTECTION_MODELS[type]
}
