import type { ComponentType } from '../types'

export const MODEL_PATHS = {
  plcSiemensLogo1224RC: '/models/controladores/logo-siemens-1224rc.glb',
  powerSupplyProauto24A: '/models/fontes/fonte-proauto-dran120-24a.glb',
  wegContactorCWC09: '/models/contactores/weg-cwc07-10e.glb',
  wegBreakerMdwC10: '/models/protecao/weg-mdw-c10.glb',
  phoenixEcb3000760: '/models/protecao/phoenix-ec1-12dc-1a-s-r.glb',
  emergencyButtonP20AKR: '/models/comando/P20AKR-1.glb',
  emergencyButtonKeyP20ACR: '/models/comando/metaltex-p20acr-r-1b.glb',
  dualPushButtonNpb22D11: '/models/comando/nhd-npb22-d11.glb',
  safetyRelayMsr127Tp: '/models/reles/allen-bradley-msr127tp.glb',
  plcLsXbmDn32s: '/models/controladores/ls-xbm-dn32s.glb',
  siemensTsAdapterIeBasic: '/models/controladores/siemens-ts-adapter-ie-basic.glb',
  phoenixTerminalPti6: '/models/bornes-e-barras/phoenix-pti6-3213972.glb',
  terminalPE: '/models/bornes-e-barras/terminal-pe.glb',
  dinRail15x55: '/models/bornes-e-barras/din-rail-15x5-5-perfurada-1m.glb',
  motorSewDrn80Mk4B3: '/models/motores/DRN80MK4-B3.glb',
  pilotLightAd22: '/models/sinalizacao/ad22-22ds-24v.glb',
  multimeterDm20: '/models/aparelhos-de-medir/rgk-dm20-multimetro.glb',
} as const

/** `rail`: a própria calha — não é montada numa calha, monta-se diretamente na chapa. */
export type ComponentPlacement = 'din-rail' | 'panel-front' | 'machine' | 'rail'

export interface PhysicalSizeMm {
  /** Dimensões da apresentação frontal padrão, depois de aplicada a rotação base. */
  width: number
  height: number
  depth: number
}

/**
 * Uma única escala física alimenta o Painel 3D e os footprints do Esquema.
 * No painel, 100 mm correspondem a 1 unidade de cena. No esquema, 1 mm
 * corresponde a 1,5 px a 100% de zoom.
 */
export const PANEL_UNITS_PER_MM = 0.01
export const SCHEMATIC_PX_PER_MM = 1.5
export const MIN_SCHEMATIC_HIT_WIDTH = 24

export const COMPONENT_PHYSICAL_SIZE_MM: Partial<Record<ComponentType, PhysicalSizeMm>> = {
  plcSiemensLogo1224RC: { width: 72, height: 90, depth: 55 },
  powerSupplyProauto24A: { width: 64, height: 124.5, depth: 123.6 },
  contactorWegCWC09: { width: 45.48, height: 58, depth: 52.01 },
  breaker1p: { width: 17.7, height: 74.13, depth: 90.01 },
  breaker2p: { width: 35.4, height: 74.3, depth: 93.87 },
  breakerWegMdwC10: { width: 53.5, height: 78.51, depth: 77.24 },
  phoenixEcb3000760: { width: 12.4, height: 80, depth: 81.65 },
  emergencyButton: { width: 38.9, height: 44.2, depth: 76 },
  emergencyButtonKeyP20ACR: { width: 40, height: 44, depth: 97 },
  dualPushButtonNpb22D11: { width: 48.8, height: 30.2, depth: 61.8 },
  safetyRelay: { width: 22.65, height: 99.1, depth: 112.73 },
  plcLsXbmDn32s: { width: 82.03, height: 97.49, depth: 30.2 },
  siemensTsAdapterIeBasic: { width: 30, height: 105.58, depth: 75.1 },
  terminalPhoenixPti6: { width: 8.15, height: 66.02, depth: 48.5 },
  terminalPE: { width: 5.15, height: 48.6, depth: 35.25 },
  /** 1 m por omissão; o comprimento real vem de `state.lengthMm`. */
  dinRail15x55: { width: 1000, height: 15, depth: 5.5 },
  motor3ph: { width: 264, height: 208, depth: 156 },
  pilotLightAd22: { width: 29.3, height: 29.3, depth: 51.5 },
  multimeterDm20: { width: 88, height: 184, depth: 53 },
}

export interface ComponentModelSpec {
  path: string
  /** Rotação base que põe o topo físico em +Y e a frente física em +Z. */
  rotation: [number, number, number]
  placement: ComponentPlacement
  /** Altura derivada da dimensão física; nunca é calibrada isoladamente. */
  targetHeight: number
  physicalSizeMm: PhysicalSizeMm
  /** Alguns CAD vêm com a face operacional no lado -Z. */
  flipDepth?: boolean
}

function spec(
  type: ComponentType,
  path: string,
  rotation: [number, number, number],
  placement: ComponentPlacement,
  flipDepth = false,
): ComponentModelSpec {
  const physicalSizeMm = COMPONENT_PHYSICAL_SIZE_MM[type]
  if (!physicalSizeMm) throw new Error(`Dimensões físicas em falta para ${type}`)
  return {
    path,
    rotation,
    placement,
    physicalSizeMm,
    targetHeight: physicalSizeMm.height * PANEL_UNITS_PER_MM,
    ...(flipDepth ? { flipDepth: true } : {}),
  }
}

/**
 * Bases frontais verificadas na geometria dos GLB. A orientação guardada em
 * cada instância é aplicada por cima desta base e, portanto, continua isolada.
 */
const MODEL_SPECS: Partial<Record<ComponentType, ComponentModelSpec>> = {
  plcSiemensLogo1224RC: spec('plcSiemensLogo1224RC', MODEL_PATHS.plcSiemensLogo1224RC, [Math.PI / 2, 0, 0], 'din-rail'),
  powerSupplyProauto24A: spec('powerSupplyProauto24A', MODEL_PATHS.powerSupplyProauto24A, [0, 0, 0], 'din-rail'),
  contactorWegCWC09: spec('contactorWegCWC09', MODEL_PATHS.wegContactorCWC09, [Math.PI / 2, 0, 0], 'din-rail'),
  breaker1p: spec('breaker1p', '/models/protecao/Q2A5.glb', [0, 0, 0], 'din-rail', true),
  breaker2p: spec('breaker2p', '/models/protecao/DISJUNTOR%202.glb', [0, 0, 0], 'din-rail', true),
  breakerWegMdwC10: spec('breakerWegMdwC10', MODEL_PATHS.wegBreakerMdwC10, [0, 0, Math.PI / 2], 'din-rail', true),
  phoenixEcb3000760: spec('phoenixEcb3000760', MODEL_PATHS.phoenixEcb3000760, [Math.PI / 2, 0, 0], 'din-rail'),

  // O P20AKR tem o eixo longo em Z; identidade mostra a cabeça circular frontal.
  emergencyButton: spec('emergencyButton', MODEL_PATHS.emergencyButtonP20AKR, [0, 0, 0], 'panel-front', true),
  emergencyButtonKeyP20ACR: spec('emergencyButtonKeyP20ACR', MODEL_PATHS.emergencyButtonKeyP20ACR, [Math.PI / 2, 0, 0], 'panel-front'),
  dualPushButtonNpb22D11: spec('dualPushButtonNpb22D11', MODEL_PATHS.dualPushButtonNpb22D11, [0, 0, 0], 'panel-front', true),

  safetyRelay: spec('safetyRelay', MODEL_PATHS.safetyRelayMsr127Tp, [0, 0, Math.PI / 2], 'din-rail', true),
  plcLsXbmDn32s: spec('plcLsXbmDn32s', MODEL_PATHS.plcLsXbmDn32s, [Math.PI / 2, 0, 0], 'din-rail'),
  siemensTsAdapterIeBasic: spec('siemensTsAdapterIeBasic', MODEL_PATHS.siemensTsAdapterIeBasic, [Math.PI / 2, 0, 0], 'din-rail'),
  terminalPhoenixPti6: spec('terminalPhoenixPti6', MODEL_PATHS.phoenixTerminalPti6, [Math.PI / 2, 0, 0], 'din-rail'),
  terminalPE: spec('terminalPE', MODEL_PATHS.terminalPE, [Math.PI / 2, 0, 0], 'din-rail'),
  dinRail15x55: spec('dinRail15x55', MODEL_PATHS.dinRail15x55, [0, 0, 0], 'rail'),

  motor3ph: spec('motor3ph', MODEL_PATHS.motorSewDrn80Mk4B3, [0, 0, 0], 'machine'),
  pilotLightAd22: spec('pilotLightAd22', MODEL_PATHS.pilotLightAd22, [Math.PI / 2, 0, 0], 'panel-front'),
  multimeterDm20: spec('multimeterDm20', MODEL_PATHS.multimeterDm20, [0, 0, 0], 'machine'),
}

export function getComponentModelSpec(type: ComponentType): ComponentModelSpec | undefined {
  return MODEL_SPECS[type]
}

export function getComponentPhysicalSizeMm(type: ComponentType): PhysicalSizeMm | undefined {
  return COMPONENT_PHYSICAL_SIZE_MM[type]
}

export function getSchematicPhysicalFootprint(type: ComponentType): { w: number; h: number } | undefined {
  const physical = getComponentPhysicalSizeMm(type)
  if (!physical) return undefined
  return {
    w: Math.max(1, Math.round(physical.width * SCHEMATIC_PX_PER_MM)),
    h: Math.max(1, Math.round(physical.height * SCHEMATIC_PX_PER_MM)),
  }
}

export type CommandModelSpec = ComponentModelSpec
export function getCommandModelSpec(type: ComponentType): CommandModelSpec | undefined {
  return ['emergencyButton', 'emergencyButtonKeyP20ACR', 'dualPushButtonNpb22D11'].includes(type) ? MODEL_SPECS[type] : undefined
}

export type ProtectionModelSpec = ComponentModelSpec
export function getProtectionModelSpec(type: ComponentType): ProtectionModelSpec | undefined {
  return ['breaker1p', 'breaker2p', 'breakerWegMdwC10', 'phoenixEcb3000760'].includes(type) ? MODEL_SPECS[type] : undefined
}

/** Especificação GLB única consumida pelo editor, esquema, painel e landing. */
export function getComponentGlbSpec(type: ComponentType): ComponentModelSpec | undefined {
  return MODEL_SPECS[type]
}

export function hasComponent3DModel(type: ComponentType): boolean {
  return !!getComponentGlbSpec(type)
}

export const MISSING_3D_MODEL_MESSAGE = 'Bloqueado: modelo 3D GLB ainda não disponível.'

export function hasDinRailModel(type: ComponentType): boolean {
  return getComponentGlbSpec(type)?.placement === 'din-rail'
}

export function isMountingRail(type: ComponentType): boolean {
  return getComponentGlbSpec(type)?.placement === 'rail'
}

/** Registo em tempo de execução dos componentes do catálogo oficial (um tipo por versão publicada). */
export function registerCatalogModel(type: ComponentType, path: string, physicalSizeMm: PhysicalSizeMm, placement: ComponentPlacement): void {
  COMPONENT_PHYSICAL_SIZE_MM[type] = physicalSizeMm
  MODEL_SPECS[type] = {
    path, rotation: [0, 0, 0], placement, physicalSizeMm,
    targetHeight: physicalSizeMm.height * PANEL_UNITS_PER_MM,
  }
}

/** Atualiza só o caminho do GLB (URL do servidor ou blob local). */
export function setCatalogModelPath(type: ComponentType, path: string): void {
  const current = MODEL_SPECS[type]
  if (current) MODEL_SPECS[type] = { ...current, path }
}
