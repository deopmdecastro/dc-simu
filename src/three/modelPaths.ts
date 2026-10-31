import type { ComponentType } from '../types'
import { isTerminalAssemblyComponent } from './terminalAssembly'
import importedModels from '../data/imported-component-models.json'

export const MODEL_PATHS = {
  plcSiemensLogo1224RC: '/models/controladores/logo-siemens-1224rc.glb',
  powerSupplyProauto24A: '/models/fontes/fonte-proauto-dran120-24a.glb',
  wegContactorCWC09: '/models/contactores/weg-cwc07-10e.glb',
  steckBreakerSdC25: '/models/protecao/steck-sd-c25-1p.glb',
  /** Schneider Easy9 (EZ9) 1P/2P/3P — GLB gerados dos STEP do fabricante por `scripts/build-ez9-glb.py`. */
  schneiderEz9Breaker1p: '/models/protecao/schneider-ez9-1p.glb',
  schneiderEz9Breaker2p: '/models/protecao/schneider-ez9-2p.glb',
  schneiderEz9Breaker3p: '/models/protecao/schneider-ez9-3p.glb',
  /** Moeller/Eaton PKZM C-10 — GLB gerado do STEP do fabricante por `scripts/build-pkzmc10-glb.py`. */
  eatonPkzmC10: '/models/protecao/eaton-pkzmc-10.glb',
  phoenixEcb3000760: '/models/protecao/phoenix-ec1-12dc-1a-s-r.glb',
  emergencyButtonP20AKR: '/models/comando/P20AKR-1.glb',
  emergencyButtonKeyP20ACR: '/models/comando/metaltex-p20acr-r-1b.glb',
  dualPushButtonNpb22D11: '/models/comando/nhd-npb22-d11.glb',
  safetyRelayMsr127Tp: '/models/reles/allen-bradley-msr127tp.glb',
  plcLsXbmDn32s: '/models/controladores/ls-xbm-dn32s.glb',
  siemensTsAdapterIeBasic: '/models/controladores/siemens-ts-adapter-ie-basic.glb',
  phoenixTerminalPti6: '/models/bornes-e-barras/phoenix-pti6-3213972.glb',
  terminalSet1ph: '/models/bornes-e-barras/conjunto-bornes-monofasico.glb',
  terminalSet3ph: '/models/bornes-e-barras/conjunto-bornes-trifasico.glb',
  powerSource1ph: '/models/bornes-e-barras/conjunto-bornes-monofasico.glb',
  powerSource3ph: '/models/bornes-e-barras/conjunto-bornes-trifasico.glb',
  terminalPE: '/models/bornes-e-barras/terminal-pe.glb',
  dinRail15x55: '/models/bornes-e-barras/din-rail-15x5-5-perfurada-1m.glb',
  motorSewDrn80Mk4B3: '/models/motores/DRN80MK4-B3.glb',
  /** Condensador genérico CBB65 (STEP Godrej → GLB). Valores de capacitância/tensão são atribuídos no estado. */
  capacitorRunGeneric: '/models/motores/capacitor-run-generic.glb',
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
  ...Object.fromEntries(importedModels.map(model => [model.type, model.physicalSizeMm])),
  plcSiemensLogo1224RC: { width: 72, height: 90, depth: 55 },
  powerSupplyProauto24A: { width: 64, height: 124.5, depth: 123.6 },
  contactorWegCWC09: { width: 45.48, height: 58, depth: 52.01 },
  /**
   * Schneider Easy9 (medido nos STEP EZ3331 / EZ3332 / «1P3 EASY9»): 84,5 mm de altura (patim da calha
   * recolhido incluído), passo de 17,7 mm por polo; a profundidade inclui a alavanca na posição OFF.
   */
  breaker1p: { width: 17.7, height: 84.5, depth: 74.57 },
  breaker2p: { width: 36, height: 84.5, depth: 75.44 },
  breaker3p: { width: 54, height: 84.5, depth: 75.44 },
  /** Medido no STEP do fabricante: 17,8 × 79,6 × 72,6 mm (a profundidade inclui o manípulo). */
  breakerSteckSdC25: { width: 17.8, height: 79.6, depth: 72.6 },
  /** Medido no STEP do fabricante: 44,7 × 91,8 × 75,5 mm (a profundidade inclui o botão rotativo). */
  motorBreakerPkzmC10: { width: 44.7, height: 91.8, depth: 75.5 },
  phoenixEcb3000760: { width: 12.4, height: 80, depth: 81.65 },
  emergencyButton: { width: 38.9, height: 44.2, depth: 76 },
  emergencyButtonKeyP20ACR: { width: 40, height: 44, depth: 97 },
  dualPushButtonNpb22D11: { width: 48.8, height: 30.2, depth: 61.8 },
  safetyRelay: { width: 22.65, height: 99.1, depth: 112.73 },
  /** Medido no CAD já de frente: corpo slim de 30,2 mm, 97,5 mm de altura e 82 mm de profundidade (com os ganchos da calha). */
  plcLsXbmDn32s: { width: 30.2, height: 97.49, depth: 82.03 },
  siemensTsAdapterIeBasic: { width: 30, height: 105.58, depth: 75.1 },
  terminalPhoenixPti6: { width: 8.15, height: 66.02, depth: 48.5 },
  terminalSet1ph: { width: 24.45, height: 66.02, depth: 48.5 },
  terminalSet3ph: { width: 40.75, height: 66.02, depth: 48.5 },
  powerSource1ph: { width: 24.45, height: 66.02, depth: 48.5 },
  powerSource3ph: { width: 40.75, height: 66.02, depth: 48.5 },
  terminalPE: { width: 5.15, height: 48.6, depth: 35.25 },
  /** 1 m por omissão; o comprimento real vem de `state.lengthMm`. */
  dinRail15x55: { width: 1000, height: 15, depth: 5.5 },
  motor3ph: { width: 264, height: 208, depth: 156 },
  /** Mesmo envelope do SEW DRN80 — variante monofásica azul DC-Simu. */
  motor1ph: { width: 264, height: 208, depth: 156 },
  /** Cilindro CBB65 genérico (~Ø50 × 119 mm). Valores elétricos vêm do estado. */
  capacitorRun60uF: { width: 50, height: 119, depth: 50 },
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
  ...Object.fromEntries(importedModels.map(model => [model.type, spec(model.type as ComponentType, model.path, [0,0,0], model.placement as ComponentPlacement)])),
  plcSiemensLogo1224RC: spec('plcSiemensLogo1224RC', MODEL_PATHS.plcSiemensLogo1224RC, [Math.PI / 2, 0, 0], 'din-rail'),
  powerSupplyProauto24A: spec('powerSupplyProauto24A', MODEL_PATHS.powerSupplyProauto24A, [0, 0, 0], 'din-rail'),
  contactorWegCWC09: spec('contactorWegCWC09', MODEL_PATHS.wegContactorCWC09, [Math.PI / 2, 0, 0], 'din-rail'),
  // Easy9: GLB gerados já de pé (topo em +Y, frente em +Z, traseira/patim em z = 0), sem rotação nem
  // espelho. A alavanca (e a barra que liga os polos no 2P/3P) vai em malhas `dcsimu_handle_*`.
  breaker1p: spec('breaker1p', MODEL_PATHS.schneiderEz9Breaker1p, [0, 0, 0], 'din-rail'),
  breaker2p: spec('breaker2p', MODEL_PATHS.schneiderEz9Breaker2p, [0, 0, 0], 'din-rail'),
  breaker3p: spec('breaker3p', MODEL_PATHS.schneiderEz9Breaker3p, [0, 0, 0], 'din-rail'),
  // O GLB foi gerado do STEP já de pé: topo em +Y, frente em +Z (manípulo e bornes à frente),
  // por isso não precisa de rotação nem de espelho. O manípulo vai como malhas `dcsimu_handle_*`.
  breakerSteckSdC25: spec('breakerSteckSdC25', MODEL_PATHS.steckBreakerSdC25, [0, 0, 0], 'din-rail'),
  // PKZM C-10: GLB gerado do STEP já de pé (bornes 1/3/5 em cima, frente com o botão verde em +Z,
  // patim da calha em z = 0). O botão rotativo vai nas malhas `dcsimu_handle_*` e roda à volta de Z.
  motorBreakerPkzmC10: spec('motorBreakerPkzmC10', MODEL_PATHS.eatonPkzmC10, [0, 0, 0], 'din-rail'),
  phoenixEcb3000760: spec('phoenixEcb3000760', MODEL_PATHS.phoenixEcb3000760, [Math.PI / 2, 0, 0], 'din-rail'),

  /*
   * P20AKR: o CAD já vem na pose de painel — a cabeça (cogumelo) aponta para +Z e o
   * bloco de contactos fica atrás, do lado da chapa. Estava com `flipDepth`, o que
   * espelhava a profundidade e mostrava o bloco de bornes à frente e o cogumelo
   * virado para trás (era o que aparecia no editor como «pose base»).
   */
  emergencyButton: spec('emergencyButton', MODEL_PATHS.emergencyButtonP20AKR, [0, 0, 0], 'panel-front'),
  // No GLB do P20ACR o eixo do botão está em −Y (cogumelo/chave em −Y, contactos em +Y);
  // +90° em X traz o cogumelo e a chave para +Z (frente) e os bornes 21/22 para −Z (trás).
  emergencyButtonKeyP20ACR: spec('emergencyButtonKeyP20ACR', MODEL_PATHS.emergencyButtonKeyP20ACR, [Math.PI / 2, 0, 0], 'panel-front'),
  dualPushButtonNpb22D11: spec('dualPushButtonNpb22D11', MODEL_PATHS.dualPushButtonNpb22D11, [0, 0, 0], 'panel-front', true),

  safetyRelay: spec('safetyRelay', MODEL_PATHS.safetyRelayMsr127Tp, [0, 0, Math.PI / 2], 'din-rail', true),
  /*
   * LS XBM-DN32S: com só +90° em X a face com «EXPANSION CONNECTOR» (o lado do corpo) ficava à frente
   * e os ganchos da calha DIN saíam para a esquerda — o PLC aparecia montado de lado. A face de serviço
   * (fecho da calha em baixo) está no +X do CAD: +90° em Z leva-a para +Z e os ganchos para a chapa.
   * Equivale a Ry(−90°)·Rx(+90°), escrito em ângulos de Euler XYZ.
   */
  plcLsXbmDn32s: spec('plcLsXbmDn32s', MODEL_PATHS.plcLsXbmDn32s, [Math.PI / 2, 0, Math.PI / 2], 'din-rail'),
  siemensTsAdapterIeBasic: spec('siemensTsAdapterIeBasic', MODEL_PATHS.siemensTsAdapterIeBasic, [Math.PI / 2, 0, 0], 'din-rail'),
  terminalPhoenixPti6: spec('terminalPhoenixPti6', MODEL_PATHS.phoenixTerminalPti6, [Math.PI / 2, 0, 0], 'din-rail'),
  terminalSet1ph: spec('terminalSet1ph', MODEL_PATHS.terminalSet1ph, [0, 0, 0], 'din-rail'),
  terminalSet3ph: spec('terminalSet3ph', MODEL_PATHS.terminalSet3ph, [0, 0, 0], 'din-rail'),
  powerSource1ph: spec('powerSource1ph', MODEL_PATHS.powerSource1ph, [0, 0, 0], 'din-rail'),
  powerSource3ph: spec('powerSource3ph', MODEL_PATHS.powerSource3ph, [0, 0, 0], 'din-rail'),
  terminalPE: spec('terminalPE', MODEL_PATHS.terminalPE, [Math.PI / 2, 0, 0], 'din-rail'),
  dinRail15x55: spec('dinRail15x55', MODEL_PATHS.dinRail15x55, [0, 0, 0], 'rail'),

  motor3ph: spec('motor3ph', MODEL_PATHS.motorSewDrn80Mk4B3, [0, 0, 0], 'machine'),
  motor1ph: spec('motor1ph', MODEL_PATHS.motorSewDrn80Mk4B3, [0, 0, 0], 'machine'),
  /** Condensador genérico (STEP → GLB). Capacitância/tensão editáveis no estado. */
  capacitorRun60uF: spec('capacitorRun60uF', MODEL_PATHS.capacitorRunGeneric, [0, 0, 0], 'machine'),
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
  return ['breaker1p', 'breaker2p', 'breaker3p', 'breakerSteckSdC25', 'motorBreakerPkzmC10', 'phoenixEcb3000760'].includes(type) ? MODEL_SPECS[type] : undefined
}

/**
 * Manípulo de disjuntores com malhas `dcsimu_handle_*` no GLB (os que geramos nós).
 *  · `hinge`: posição do eixo dentro da caixa do manípulo (0 = mínimo, 1 = máximo em Y e Z), medida
 *    no CAD — o cubo redondo da alavanca nunca coincide com o centro da caixa;
 *  · `throwDeg`: curso total. A pose do CAD é sempre OFF (alavanca para baixo); ON levanta-a `throwDeg`
 *    graus à volta de X; «disparado» pára a meio, como num disjuntor real.
 */
export interface BreakerHandleRig {
  hinge: { x?: number; y: number; z: number }
  throwDeg: number
  /** Eixo de rotação: `x` para alavancas que bascúlam, `z` para botões rotativos (PKZM). */
  axis?: 'x' | 'z'
  /** Nomes dos nós do GLB que formam o manípulo (usados pelo editor 3D). */
  nodes: string[]
}

const EZ9_THROW_DEG = 70
const ez9Nodes = (poles: number) => [...Array.from({ length: poles }, (_, index) => `dcsimu_handle_${index + 1}`), ...(poles > 1 ? ['dcsimu_handle_bridge'] : [])]

export const BREAKER_HANDLE_RIG: Partial<Record<ComponentType, BreakerHandleRig>> = {
  // cubo da alavanca a y = 32,5 mm e z = 61,5 mm (da base e da traseira do corpo)
  breaker1p: { hinge: { y: 0.645, z: 0.297 }, throwDeg: EZ9_THROW_DEG, nodes: ez9Nodes(1) },
  breaker2p: { hinge: { y: 0.667, z: 0.285 }, throwDeg: EZ9_THROW_DEG, nodes: ez9Nodes(2) },
  breaker3p: { hinge: { y: 0.667, z: 0.285 }, throwDeg: EZ9_THROW_DEG, nodes: ez9Nodes(3) },
  // Steck: o cubo redondo (centro y −8,25 mm, z 61,45 mm no STEP) fica a 58,7 % da altura e 32,8 % da profundidade
  breakerSteckSdC25: { hinge: { y: 0.587, z: 0.328 }, throwDeg: 40, nodes: ['dcsimu_handle_2', 'dcsimu_handle_3'] },
  /* PKZM C-10: o eixo é o centro do aro/cubo redondo (`dcsimu_handle_2`, 15,5 × 15,5 mm), não o centro
   * da caixa do manípulo — a alavanca verde estica a caixa para a direita e para cima, e usar o centro
   * da caixa fazia o botão orbitar em vez de girar sobre o cubo (ver `DC-ADR-058`).
   * Frações dentro da caixa conjunta do manípulo: x = 0,426, y = 0,5.
   * OFF = pose do CAD («O»); ON roda 90° à volta da normal da face («I»). */
  motorBreakerPkzmC10: { hinge: { x: 0.426, y: 0.5, z: 0.5 }, throwDeg: 90, axis: 'z', nodes: ['dcsimu_handle_1', 'dcsimu_handle_2'] },
}

/** Especificação GLB única consumida pelo editor, esquema, painel e landing. */
export function getComponentGlbSpec(type: ComponentType): ComponentModelSpec | undefined {
  return MODEL_SPECS[type]
}

/** Conjuntos compostos apenas por instâncias de GLB reais. */
export function hasComponent3DModel(type: ComponentType): boolean {
  return !!getComponentGlbSpec(type)
}

export function hasComponent3DVisual(type: ComponentType): boolean {
  return hasComponent3DModel(type) || isTerminalAssemblyComponent(type)
}

export function canInsertComponent3D(type: ComponentType): boolean {
  return hasComponent3DVisual(type)
}

export const MISSING_3D_MODEL_MESSAGE = 'Bloqueado: modelo GLB ou representação 3D ainda não disponível.'

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
