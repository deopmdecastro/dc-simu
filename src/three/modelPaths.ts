import type { ComponentType } from '../types'

/** URLs públicas dos modelos CAD disponíveis (ficheiros em public/models/). */
export const MODEL_PATHS = {
  powerSupplyProauto24A: '/models/fontes/fonte-proauto-dran120-24a.glb',
  plcSiemensLogo1224RC: '/models/controladores/logo-siemens-1224rc.glb',
  /** Contator WEG CWC07/CWC09 10E — modelo CAD real do fabricante. */
  wegContactorCWC09: '/models/contactores/weg-cwc07-10e.glb',
  /** Botão de emergência Metaltex P20AKR, cabeça cogumelo com retorno por giro. */
  emergencyButtonP20AKR: '/models/comando/P20AKR-1.glb',
  /** Disjuntor eletrônico Phoenix Contact EC 1 12DC/1A S-R (3000760). */
  phoenixEcb3000760: '/models/protecao/phoenix-ec1-12dc-1a-s-r.glb',
} as const

export type ProtectionModelSpec = {
  path: string
  /** Orienta o CAD para a vista frontal da cena (Y para cima, Z para a frente). */
  rotation: [number, number, number]
}

/** Modelos CAD confirmados: disjuntores 1P/2P e Phoenix Contact 3000760. */
const PROTECTION_MODELS: Partial<Record<ComponentType, ProtectionModelSpec>> = {
  // Estes dois ficheiros foram exportados com Z para cima e a frente em -Y.
  breaker1p: { path: '/models/protecao/Q2A5.glb', rotation: [-Math.PI / 2, 0, 0] },
  breaker2p: { path: '/models/protecao/DISJUNTOR%202.glb', rotation: [-Math.PI / 2, 0, 0] },
  // O GLB Phoenix tem Y para cima, frente em +Z e dimensões do dispositivo (mm).
  phoenixEcb3000760: { path: MODEL_PATHS.phoenixEcb3000760, rotation: [0, 0, 0] },
}

export function getProtectionModelSpec(type: ComponentType): ProtectionModelSpec | undefined {
  return PROTECTION_MODELS[type]
}

export type CommandModelSpec = {
  path: string
  /** O eixo Z do CAD é o eixo do cogumelo; a face está voltada para +Z. */
  rotation: [number, number, number]
}

const COMMAND_MODELS: Partial<Record<ComponentType, CommandModelSpec>> = {
  // A vista frontal do CAD foi verificada: o cogumelo já fica voltado para +Z.
  emergencyButton: { path: MODEL_PATHS.emergencyButtonP20AKR, rotation: [0, 0, 0] },
}

export function getCommandModelSpec(type: ComponentType): CommandModelSpec | undefined {
  return COMMAND_MODELS[type]
}
