import type { ComponentType } from '../types'

/** URLs públicas dos modelos CAD disponíveis (ficheiros em public/models/). */
export const MODEL_PATHS = {
  powerSupplyProauto24A: '/models/fontes/fonte-proauto-dran120-24a.glb',
  plcSiemensLogo1224RC: '/models/controladores/logo-siemens-1224rc.glb',
  /** Contator WEG CWC07/CWC09 10E — modelo CAD real do fabricante. */
  wegContactorCWC09: '/models/contactores/weg-cwc07-10e.glb',
  /** Botões e botoeiras de painel. */
  emergencyButtonP20AKR: '/models/comando/P20AKR-1.glb',
  emergencyButtonKeyP20ACR: '/models/comando/metaltex-p20acr-r-1b.glb',
  dualPushButtonNpb22D11: '/models/comando/nhd-npb22-d11.glb',
  /** Proteção. */
  phoenixEcb3000760: '/models/protecao/phoenix-ec1-12dc-1a-s-r.glb',
  wegBreakerMdwC10: '/models/protecao/weg-mdw-c10.glb',
  /** Controladores e comunicação. */
  plcLsXbmDn32s: '/models/controladores/ls-xbm-dn32s.glb',
  siemensTsAdapterIeBasic: '/models/controladores/siemens-ts-adapter-ie-basic.glb',
  /** Bornes e relés. */
  phoenixTerminalPti6: '/models/bornes-e-barras/phoenix-pti6-3213972.glb',
  terminalPE: '/models/bornes-e-barras/terminal-pe.glb',
  safetyRelayMsr127Tp: '/models/reles/allen-bradley-msr127tp.glb',
  /** Motor trifásico SEW-EURODRIVE DRN80MK4, montagem B3. */
  motorSewDrn80Mk4B3: '/models/motores/DRN80MK4-B3.glb',
  /** Sinaleiro LED genérico AD22-22DS, 22 mm, 24 V AC/DC. */
  pilotLightAd22: '/models/sinalizacao/ad22-22ds-24v.glb',
} as const

export type ComponentModelSpec = {
  path: string
  /** Orienta o CAD para Y para cima e frente em +Z na cena. */
  rotation: [number, number, number]
  /** Alguns exports têm a face em -Z; a reflexão apresenta-a à câmara. */
  flipDepth?: boolean
  /** Local físico correto no painel. */
  placement: 'din-rail' | 'panel-front' | 'machine'
  /** Altura normalizada do aparelho no Painel 3D. */
  targetHeight: number
}

/**
 * Associação única tipo → CAD. A mesma especificação alimenta Biblioteca,
 * Esquema e Painel 3D para impedir orientações divergentes entre vistas.
 */
const COMPONENT_MODELS: Partial<Record<ComponentType, ComponentModelSpec>> = {
  // Estes dois exports têm Z para cima e a frente em -Y.
  breaker1p: { path: '/models/protecao/Q2A5.glb', rotation: [-Math.PI / 2, 0, 0], placement: 'din-rail', targetHeight: 0.78 },
  breaker2p: { path: '/models/protecao/DISJUNTOR%202.glb', rotation: [-Math.PI / 2, 0, 0], placement: 'din-rail', targetHeight: 0.78 },
  breakerWegMdwC10: { path: MODEL_PATHS.wegBreakerMdwC10, rotation: [0, 0, 0], placement: 'din-rail', targetHeight: 0.8 },
  phoenixEcb3000760: { path: MODEL_PATHS.phoenixEcb3000760, rotation: [0, 0, 0], placement: 'din-rail', targetHeight: 0.78 },

  // O eixo da haste dos P20 é Y no export; +90° em X aponta o cogumelo para +Z.
  emergencyButton: { path: MODEL_PATHS.emergencyButtonP20AKR, rotation: [Math.PI / 2, 0, 0], placement: 'panel-front', targetHeight: 0.42 },
  emergencyButtonKeyP20ACR: { path: MODEL_PATHS.emergencyButtonKeyP20ACR, rotation: [Math.PI / 2, 0, 0], placement: 'panel-front', targetHeight: 0.44 },
  dualPushButtonNpb22D11: { path: MODEL_PATHS.dualPushButtonNpb22D11, rotation: [0, 0, 0], placement: 'panel-front', targetHeight: 0.52 },

  safetyRelay: { path: MODEL_PATHS.safetyRelayMsr127Tp, rotation: [0, 0, Math.PI / 2], flipDepth: true, placement: 'din-rail', targetHeight: 0.92 },
  plcLsXbmDn32s: { path: MODEL_PATHS.plcLsXbmDn32s, rotation: [0, 0, 0], placement: 'din-rail', targetHeight: 0.96 },
  siemensTsAdapterIeBasic: { path: MODEL_PATHS.siemensTsAdapterIeBasic, rotation: [0, 0, 0], placement: 'din-rail', targetHeight: 0.94 },
  terminalPhoenixPti6: { path: MODEL_PATHS.phoenixTerminalPti6, rotation: [0, 0, 0], placement: 'din-rail', targetHeight: 0.62 },
  terminalPE: { path: MODEL_PATHS.terminalPE, rotation: [0, 0, 0], placement: 'din-rail', targetHeight: 0.58 },

  // Export CADENAS/3Dfindit em milímetros, já com Y para cima e eixo em +X.
  motor3ph: { path: MODEL_PATHS.motorSewDrn80Mk4B3, rotation: [0, 0, 0], placement: 'machine', targetHeight: 1.04 },
  // O eixo do sinaleiro já aponta para +Z; a face circular fica frontal sem correção de origem.
  pilotLightAd22: { path: MODEL_PATHS.pilotLightAd22, rotation: [0, 0, 0], placement: 'panel-front', targetHeight: 0.4 },
}

export function getComponentModelSpec(type: ComponentType): ComponentModelSpec | undefined {
  return COMPONENT_MODELS[type]
}

/**
 * CAD com renderizadores históricos dedicados. A especificação unificada
 * permite reutilizar estes GLB em novas vistas, como o turntable da landing.
 */
const DEDICATED_COMPONENT_MODELS: Partial<Record<ComponentType, ComponentModelSpec>> = {
  plcSiemensLogo1224RC: {
    path: MODEL_PATHS.plcSiemensLogo1224RC,
    rotation: [Math.PI / 2, 0, 0],
    placement: 'din-rail',
    targetHeight: 1.3,
  },
  powerSupplyProauto24A: {
    path: MODEL_PATHS.powerSupplyProauto24A,
    rotation: [0, 0, 0],
    placement: 'din-rail',
    targetHeight: 1.25,
  },
  contactorWegCWC09: {
    path: MODEL_PATHS.wegContactorCWC09,
    rotation: [0, 0, 0],
    flipDepth: true,
    placement: 'din-rail',
    targetHeight: 1.2,
  },
}

/** Especificação de qualquer GLB real, genérico ou com renderizador dedicado. */
export function getComponentGlbSpec(type: ComponentType): ComponentModelSpec | undefined {
  return COMPONENT_MODELS[type] ?? DEDICATED_COMPONENT_MODELS[type]
}

/** Única regra de disponibilidade: só componentes com ficheiro GLB real podem ser inseridos. */
export function hasComponent3DModel(type: ComponentType): boolean {
  return !!getComponentGlbSpec(type)
}

export const MISSING_3D_MODEL_MESSAGE = 'Bloqueado: modelo 3D GLB ainda não disponível.'

export type ProtectionModelSpec = ComponentModelSpec
export function getProtectionModelSpec(type: ComponentType): ProtectionModelSpec | undefined {
  return ['breaker1p', 'breaker2p', 'breakerWegMdwC10', 'phoenixEcb3000760'].includes(type)
    ? COMPONENT_MODELS[type]
    : undefined
}

export type CommandModelSpec = ComponentModelSpec
export function getCommandModelSpec(type: ComponentType): CommandModelSpec | undefined {
  return ['emergencyButton', 'emergencyButtonKeyP20ACR', 'dualPushButtonNpb22D11'].includes(type)
    ? COMPONENT_MODELS[type]
    : undefined
}

export function hasDinRailModel(type: ComponentType): boolean {
  return COMPONENT_MODELS[type]?.placement === 'din-rail'
}
