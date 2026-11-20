import { INDUSTRIAL_GEOMETRY, industrialSchematicFootprint, isIndustrialDevice } from '../electrical/industrialDevices'
import type { ComponentType } from '../types'
import { isTerminalAssemblyComponent } from './terminalAssembly'
import importedModels from '../data/imported-component-models.json'
import { S71500_CPU_WIDTH_MM, S71500_DEPTH_MM, S71500_DI32_WIDTH_MM, S71500_HEIGHT_MM, S7300_CPU_DEPTH_MM, S7300_CPU_HEIGHT_MM, S7300_CPU_WIDTH_MM } from '../electrical/siemensPlc'

export const MODEL_PATHS = {
  plcSiemensLogo1224RC: '/models/controladores/logo-siemens-1224rc.glb',
  powerSupplyProauto24A: '/models/fontes/fonte-proauto-dran120-24a.glb',
  wegContactorCWC09: '/models/contactores/weg-cwc07-10e.glb',
  steckBreakerSdC25: '/models/protecao/steck-sd-c25-1p.glb',
  /** Schneider Easy9 (EZ9) 1P/2P/3P — GLB gerados dos STEP do fabricante por `scripts/build-ez9-glb.py`. */
  schneiderEz9Breaker1p: '/models/protecao/schneider-ez9-1p.glb',
  schneiderEz9Breaker2p: '/models/protecao/schneider-ez9-2p.glb',
  schneiderEz9Breaker3p: '/models/protecao/schneider-ez9-3p.glb',
  /** Acti9: STEP oficiais, com manípulo e botão de teste separados. */
  schneiderIid4p: '/models/protecao/schneider-acti9-iid-4p.glb',
  schneiderIdpnVigi: '/models/protecao/schneider-acti9-idpn-n-vigi-1pn.glb',
  /** Moeller/Eaton PKZM C-10 — GLB gerado do STEP do fabricante por `scripts/build-pkzmc10-glb.py`. */
  eatonPkzmC10: '/models/protecao/eaton-pkzmc-10.glb',
  phoenixEcb3000760: '/models/protecao/phoenix-ec1-12dc-1a-s-r.glb',
  emergencyButtonP20AKR: '/models/comando/P20AKR-1.glb',
  emergencyButtonKeyP20ACR: '/models/comando/metaltex-p20acr-r-1b.glb',
  dualPushButtonNpb22D11: '/models/comando/nhd-npb22-d11.glb',
  safetyRelayMsr127Tp: '/models/reles/allen-bradley-msr127tp.glb',
  plcLsXbmDn32s: '/models/controladores/ls-xbm-dn32s.glb',
  /** Siemens SIMATIC S7-1500 DI 32×24 V DC · 6ES7521-1BL00-0AB0 (STEP TraceParts → GLB). */
  plcSiemensS71500Di32: '/models/importados/plcSiemensS71500Di32.glb',
  /** Siemens SIMATIC S7-1500 CPU 1511C-1 PN · 6ES7511-1CK00-0AB0. */
  plcSiemensS71500Cpu1511c: '/models/importados/plcSiemensS71500Cpu1511c.glb',
  /** Siemens SIMATIC S7-300 CPU 315-2 DP. */
  plcSiemensS7300Cpu315: '/models/importados/plcSiemensS7300Cpu315.glb',
  siemensTsAdapterIeBasic: '/models/controladores/siemens-ts-adapter-ie-basic.glb',
  phoenixTerminalPti6: '/models/bornes-e-barras/phoenix-pti6-3213972.glb',
  terminalSet1ph: '/models/bornes-e-barras/conjunto-bornes-monofasico.glb',
  terminalSet3ph: '/models/bornes-e-barras/conjunto-bornes-trifasico.glb',
  terminalSet24v: '/models/bornes-e-barras/conjunto-bornes-24v.glb',
  powerSource1ph: '/models/bornes-e-barras/conjunto-bornes-monofasico.glb',
  powerSource3ph: '/models/bornes-e-barras/conjunto-bornes-trifasico.glb',
  powerSource24v: '/models/bornes-e-barras/conjunto-bornes-24v.glb',
  terminalPE: '/models/bornes-e-barras/terminal-pe.glb',
  /** Barramentos isolados com tampa acrílica (PE verde, N azul, Fase cor editável) e repartidor 4P em escada (scripts/build-busbar-glb.ts). */
  earthBar: '/models/bornes-e-barras/barramento-terra-pe.glb',
  busbarNeutral: '/models/bornes-e-barras/barramento-neutro-n.glb',
  busbarPhaseAcrylic: '/models/bornes-e-barras/barramento-fase-acrilico.glb',
  busbarPhaseStepped: '/models/bornes-e-barras/barramento-fases-escada-4p.glb',
  busbarComb: '/models/bornes-e-barras/barramento-pente.glb',
  combBusbarConnector: '/models/bornes-e-barras/conector-barramento-pente.glb',
  dinRail15x55: '/models/bornes-e-barras/din-rail-15x5-5-perfurada-1m.glb',
  /** Pré-visualização (miniatura) — no Painel 3D o quadro e a calha técnica são paramétricos (scripts/build-enclosure-glb.ts). */
  panelEnclosure: '/models/quadros/quadro-metalico-600x800x250.glb',
  cableDuct: '/models/quadros/calha-tecnica-40x60-600.glb',
  motorSewDrn80Mk4B3: '/models/motores/DRN80MK4-B3.glb',
  /** Duplicado do DRN80MK4-B3 com a carcaça azul (scripts/make-motor-mono-glb.mjs): motor monofásico. */
  motorSewDrn80Mk4B3Mono: '/models/motores/DRN80MK4-B3-mono-azul.glb',
  /** Condensador genérico CBB65 (STEP Godrej → GLB). Valores de capacitância/tensão são atribuídos no estado. */
  capacitorRunGeneric: '/models/motores/capacitor-run-generic.glb',
  pilotLightAd22: '/models/sinalizacao/ad22-22ds-24v.glb',
  multimeterDm20: '/models/aparelhos-de-medir/rgk-dm20-multimetro.glb',
} as const

/** `rail`: a própria calha — não é montada numa calha, monta-se diretamente na chapa. */
/** `accessory`: quadro e calha técnica — peças mecânicas paramétricas, sem bornes. */
export type ComponentPlacement = 'din-rail' | 'panel-front' | 'machine' | 'rail' | 'accessory'

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
  ...Object.fromEntries(Object.entries(INDUSTRIAL_GEOMETRY).map(([type, model]) => [type, model.physicalSizeMm])),
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
  /** Easy9 4P: 4 módulos de 17,7 mm ≈ 70,8 mm; mesma altura/profundidade dos 1P–3P. */
  breaker4p: { width: 70.8, height: 84.5, depth: 75.44 },
  /**
   * Easy9 Switch (EZ9S): medido nos vértices do STEP do próprio produto (MCADFD0002242 /
   * 2243 / 2245) — corpo de 82 mm, 84,5 mm até à ponta do clip DIN, e 75,1 mm até à frente
   * da travessa vermelha. O CAD anterior (MCADFD0001285) era da gama iSW/SW.
   */
  switchSchneiderEz9s1p: { width: 18, height: 84.5, depth: 75.1 },
  switchSchneiderEz9s2p: { width: 36, height: 84.5, depth: 75.1 },
  switchSchneiderEz9s4p: { width: 72, height: 84.5, depth: 75.1 },
  /** Genérico DR 4P: mesmo envelope do Easy9 4P (4 módulos). */
  residualBreaker: { width: 70.8, height: 84.5, depth: 75.44 },
  /** Genérico QM 3P: mesmo envelope do Easy9 3P (3 módulos). */
  motorBreaker: { width: 54, height: 84.5, depth: 75.44 },
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
  /**
   * S7-1500 medidos no STEP TraceParts já na pose de montagem (frente em +Z):
   * a altura é o comprimento do perfil na calha (147 mm) e a profundidade é a
   * medida da frente à traseira. Antes estavam trocadas, porque a rotação base
   * era `Rx(+90)` e punha o comprimento para cima.
   */
  plcSiemensS71500Di32: { width: S71500_DI32_WIDTH_MM, height: S71500_HEIGHT_MM, depth: S71500_DEPTH_MM },
  plcSiemensS71500Cpu1511c: { width: S71500_CPU_WIDTH_MM, height: S71500_HEIGHT_MM, depth: S71500_DEPTH_MM },
  plcSiemensS7300Cpu315: { width: S7300_CPU_WIDTH_MM, height: S7300_CPU_HEIGHT_MM, depth: S7300_CPU_DEPTH_MM },
  siemensTsAdapterIeBasic: { width: 30, height: 105.58, depth: 75.1 },
  terminalPhoenixPti6: { width: 8.15, height: 66.02, depth: 48.5 },
  terminalSet1ph: { width: 24.45, height: 66.02, depth: 48.5 },
  terminalSet3ph: { width: 40.75, height: 66.02, depth: 48.5 },
  terminalSet24v: { width: 24.45, height: 66.02, depth: 48.5 },
  powerSource1ph: { width: 24.45, height: 66.02, depth: 48.5 },
  powerSource3ph: { width: 40.75, height: 66.02, depth: 48.5 },
  powerSource24v: { width: 24.45, height: 66.02, depth: 48.5 },
  terminalPE: { width: 5.15, height: 48.6, depth: 35.25 },
  /** Barramentos unipolares isolados com tampa acrílica (10P de série = 112 × 36,5 × 13 mm; 12P = 128 × 36,5 × 13 mm; N configurável). */
  earthBar: { width: 112, height: 36.5, depth: 13 },
  busbarNeutral: { width: 112, height: 36.5, depth: 13 },
  busbarPhaseAcrylic: { width: 112, height: 36.5, depth: 13 },
  /** Barramento repartidor de fases em escada com tampa articulada (4P × 7 furos = 88,8 × 88 × 50 mm; bornes e barras configuráveis). */
  busbarPhaseStepped: { width: 88.8, height: 88, depth: 50 },
  /** Barramento tipo pente modular DIN (12 módulos de série = 214 × 28 × 9,8 mm; 1P / 1P+N / 3P / 3P+N e conectores configuráveis). */
  busbarComb: { width: 214, height: 28, depth: 9.8 },
  /** Conector genérico de alimentação tipo pino 6–25 mm² · 80 A (15,8 × 35,6 × 20,6 mm; cor PA66 personalizável). */
  combBusbarConnector: { width: 15.8, height: 35.6, depth: 20.6 },
  /** 1 m por omissão; perfil e comprimento reais vêm de `state.profile` / `state.lengthMm` (TS35×7,5 por defeito). */
  dinRail15x55: { width: 1000, height: 35, depth: 7.5 },
  /** Miniatura (porta fechada: 250 mm de corpo + porta e fechos); o tamanho real vem de `state.widthMm/heightMm/depthMm`. */
  panelEnclosure: { width: 600, height: 800, depth: 282 },
  /** Tamanho por omissão; o real vem de `state.lengthMm/widthMm/heightMm`. */
  cableDuct: { width: 600, height: 40, depth: 62 },
  /** Espiral de proteção; tamanho real de `state.lengthMm/innerDiaMm`. */
  spiralWrap: { width: 300, height: 14, depth: 14 },
  motor3ph: { width: 264, height: 208, depth: 156 },
  /** Mesmo envelope do SEW DRN80 — variante monofásica azul DC-Simu. */
  motor1ph: { width: 264, height: 208, depth: 156 },
  /** Cilindro CBB65 genérico (~Ø50 × 119 mm). Valores elétricos vêm do estado. */
  capacitorRun60uF: { width: 50, height: 132, depth: 50 },
  pilotLightAd22: { width: 29.3, height: 29.3, depth: 51.5 },
  multimeterDm20: { width: 88, height: 184, depth: 53 },
  meterD522066: { width: 54, height: 80, depth: 64 },
  meterKws306: { width: 74, height: 86.5, depth: 65 },
  breakerSchneiderIc60h1p: { width: 18, height: 91, depth: 78.5 },
  // Corpo de 85 mm; patins DIN recolhidos, não a pose de instalação do STEP.
  residualBreakerSchneiderIid4p: { width: 72, height: 85, depth: 73.5 },
  residualBreakerSchneiderIdpnVigi: { width: 36, height: 85, depth: 73 },
  pilotLightSchneiderIil1p: { width: 18, height: 82, depth: 68 },
  pilotLightSchneiderIil3p: { width: 18, height: 82, depth: 69.5 },
  currentTransformerSplitCore: { width: 36, height: 48, depth: 24 },
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
  ...Object.fromEntries(Object.entries(INDUSTRIAL_GEOMETRY).map(([type, model]) => [type, spec(type as ComponentType, model.path, [0, 0, 0], type === 'buzzerMetaltexTby301' ? 'panel-front' : type === 'levelRelayAvel411' ? 'machine' : 'din-rail')])),
  breakerSchneiderIc60h1p: spec('breakerSchneiderIc60h1p', '/models/protecao/schneider-acti9-ic60h-1p.glb', [0,0,0], 'din-rail'),
  pilotLightSchneiderIil1p: spec('pilotLightSchneiderIil1p', '/models/sinalizacao/schneider-acti9-iil-1p.glb', [0,0,0], 'din-rail'),
  pilotLightSchneiderIil3p: spec('pilotLightSchneiderIil3p', '/models/sinalizacao/schneider-acti9-iil-3p.glb', [0,0,0], 'din-rail'),
  ...Object.fromEntries(importedModels.map(model => [model.type, spec(model.type as ComponentType, model.path, (model.rotation ?? [0, 0, 0]) as [number, number, number], model.placement as ComponentPlacement)])),
  plcSiemensLogo1224RC: spec('plcSiemensLogo1224RC', MODEL_PATHS.plcSiemensLogo1224RC, [Math.PI / 2, 0, 0], 'din-rail'),
  powerSupplyProauto24A: spec('powerSupplyProauto24A', MODEL_PATHS.powerSupplyProauto24A, [0, 0, 0], 'din-rail'),
  contactorWegCWC09: spec('contactorWegCWC09', MODEL_PATHS.wegContactorCWC09, [Math.PI / 2, 0, 0], 'din-rail'),
  // Easy9: GLB gerados já de pé (topo em +Y, frente em +Z, traseira/patim em z = 0), sem rotação nem
  // espelho. A alavanca (e a barra que liga os polos no 2P/3P) vai em malhas `dcsimu_handle_*`.
  breaker1p: spec('breaker1p', MODEL_PATHS.schneiderEz9Breaker1p, [0, 0, 0], 'din-rail'),
  breaker2p: spec('breaker2p', MODEL_PATHS.schneiderEz9Breaker2p, [0, 0, 0], 'din-rail'),
  breaker3p: spec('breaker3p', MODEL_PATHS.schneiderEz9Breaker3p, [0, 0, 0], 'din-rail'),
  switchSchneiderEz9s1p: spec('switchSchneiderEz9s1p', '/models/protecao/schneider-ez9s-1p.glb', [0, 0, 0], 'din-rail'),
  switchSchneiderEz9s2p: spec('switchSchneiderEz9s2p', '/models/protecao/schneider-ez9s-2p.glb', [0, 0, 0], 'din-rail'),
  switchSchneiderEz9s4p: spec('switchSchneiderEz9s4p', '/models/protecao/schneider-ez9s-4p.glb', [0, 0, 0], 'din-rail'),
  residualBreakerSchneiderIid4p: spec('residualBreakerSchneiderIid4p', MODEL_PATHS.schneiderIid4p, [0, 0, 0], 'din-rail'),
  residualBreakerSchneiderIdpnVigi: spec('residualBreakerSchneiderIdpnVigi', MODEL_PATHS.schneiderIdpnVigi, [0, 0, 0], 'din-rail'),
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
  /*
   * S7-1500 (DI 32 e CPU 1511C): o CAD traz o topo em +Z e a frente em −Y, com os
   * bornes em −X e o perfil de calha em +X. `Rx(−90)` põe o topo em +Y, a frente em
   * +Z, os bornes em −X e o perfil em −Z (encostado à chapa). A antiga `Rx(+90)`
   * deixava o módulo deitado de costas, com o comprimento na vertical.
   */
  plcSiemensS71500Di32: spec('plcSiemensS71500Di32', MODEL_PATHS.plcSiemensS71500Di32, [-Math.PI / 2, 0, 0], 'din-rail'),
  plcSiemensS71500Cpu1511c: spec('plcSiemensS71500Cpu1511c', MODEL_PATHS.plcSiemensS71500Cpu1511c, [-Math.PI / 2, 0, 0], 'din-rail'),
  // S7-300 CPU 315-2 DP: o CAD já vem de face (topo +Y, frente +Z, perfil de calha em −Z).
  // Rodá-lo em X deitava-o de costas e virava as aberturas de ventilação para cima.
  plcSiemensS7300Cpu315: spec('plcSiemensS7300Cpu315', MODEL_PATHS.plcSiemensS7300Cpu315, [0, 0, 0], 'din-rail'),
  siemensTsAdapterIeBasic: spec('siemensTsAdapterIeBasic', MODEL_PATHS.siemensTsAdapterIeBasic, [Math.PI / 2, 0, 0], 'din-rail'),
  terminalPhoenixPti6: spec('terminalPhoenixPti6', MODEL_PATHS.phoenixTerminalPti6, [Math.PI / 2, 0, 0], 'din-rail'),
  terminalSet1ph: spec('terminalSet1ph', MODEL_PATHS.terminalSet1ph, [0, 0, 0], 'din-rail'),
  terminalSet3ph: spec('terminalSet3ph', MODEL_PATHS.terminalSet3ph, [0, 0, 0], 'din-rail'),
  terminalSet24v: spec('terminalSet24v', MODEL_PATHS.terminalSet24v, [0, 0, 0], 'din-rail'),
  powerSource1ph: spec('powerSource1ph', MODEL_PATHS.powerSource1ph, [0, 0, 0], 'din-rail'),
  powerSource3ph: spec('powerSource3ph', MODEL_PATHS.powerSource3ph, [0, 0, 0], 'din-rail'),
  powerSource24v: spec('powerSource24v', MODEL_PATHS.powerSource24v, [0, 0, 0], 'din-rail'),
  terminalPE: spec('terminalPE', MODEL_PATHS.terminalPE, [Math.PI / 2, 0, 0], 'din-rail'),
  earthBar: spec('earthBar', MODEL_PATHS.earthBar, [0, 0, 0], 'din-rail'),
  busbarNeutral: spec('busbarNeutral', MODEL_PATHS.busbarNeutral, [0, 0, 0], 'din-rail'),
  busbarPhaseAcrylic: spec('busbarPhaseAcrylic', MODEL_PATHS.busbarPhaseAcrylic, [0, 0, 0], 'din-rail'),
  busbarPhaseStepped: spec('busbarPhaseStepped', MODEL_PATHS.busbarPhaseStepped, [0, 0, 0], 'din-rail'),
  busbarComb: spec('busbarComb', MODEL_PATHS.busbarComb, [0, 0, 0], 'din-rail'),
  combBusbarConnector: spec('combBusbarConnector', MODEL_PATHS.combBusbarConnector, [0, 0, 0], 'din-rail'),
  dinRail15x55: spec('dinRail15x55', MODEL_PATHS.dinRail15x55, [0, 0, 0], 'rail'),
  panelEnclosure: spec('panelEnclosure', MODEL_PATHS.panelEnclosure, [0, 0, 0], 'accessory'),
  cableDuct: spec('cableDuct', MODEL_PATHS.cableDuct, [0, 0, 0], 'accessory'),

  motor3ph: spec('motor3ph', MODEL_PATHS.motorSewDrn80Mk4B3, [0, 0, 0], 'machine'),
  motor1ph: spec('motor1ph', MODEL_PATHS.motorSewDrn80Mk4B3Mono, [0, 0, 0], 'machine'),
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
  if (isIndustrialDevice(type)) return industrialSchematicFootprint(type)
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
/** Easy9 Switch: o CAD do produto traz uma alavanca vermelha por polo (`MANETTE`) e uma
 * travessa que as une (`EXTENSION_MANETTE_02`, malha `dcsimu_handle_bridge` no GLB). A travessa
 * só existe nos de 2P e 4P — no 1P a lista inclui um nó que não existe e é ignorado. */
const ez9SwitchNodes = (poles: number) => [...Array.from({ length: poles }, (_, index) => `dcsimu_handle_${index + 1}`), 'dcsimu_handle_bridge']

export const BREAKER_HANDLE_RIG: Partial<Record<ComponentType, BreakerHandleRig>> = {
  // cubo da alavanca a y = 32,5 mm e z = 61,5 mm (da base e da traseira do corpo)
  breaker1p: { hinge: { y: 0.645, z: 0.297 }, throwDeg: EZ9_THROW_DEG, nodes: ez9Nodes(1) },
  breaker2p: { hinge: { y: 0.667, z: 0.285 }, throwDeg: EZ9_THROW_DEG, nodes: ez9Nodes(2) },
  breaker3p: { hinge: { y: 0.667, z: 0.285 }, throwDeg: EZ9_THROW_DEG, nodes: ez9Nodes(3) },
  /* Easy9 Switch: a charneira é a aresta de topo do conjunto vermelho (y 40 mm no STEP, ou
   * seja 40/84,5 = 0,473 da caixa do manípulo; z 0,22 da mesma caixa, logo atrás do lábio
   * frontal). As frações são relativas à caixa de `dcsimu_handle_*`, como o
   * `extractBreakerHandle` as espera. */
  switchSchneiderEz9s1p: { hinge: { y: 0.92, z: 0.12 }, throwDeg: EZ9_THROW_DEG, nodes: ez9SwitchNodes(1) },
  switchSchneiderEz9s2p: { hinge: { y: 0.92, z: 0.12 }, throwDeg: EZ9_THROW_DEG, nodes: ez9SwitchNodes(2) },
  switchSchneiderEz9s4p: { hinge: { y: 0.92, z: 0.12 }, throwDeg: EZ9_THROW_DEG, nodes: ez9SwitchNodes(4) },
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
  return (
    hasComponent3DModel(type) ||
    isTerminalAssemblyComponent(type) ||
    type === 'meterD522066' ||
    type === 'meterKws306' ||
    type === 'currentTransformerSplitCore' ||
    type === 'breakerSchneiderIc60h1p' ||
    type === 'residualBreakerSchneiderIid4p' ||
    type === 'residualBreakerSchneiderIdpnVigi' ||
    type === 'pilotLightSchneiderIil1p' ||
    type === 'pilotLightSchneiderIil3p' ||
    // Procedural 3D no Panel3D / IndustrialDevice3D — não devem mostrar cadeado
    type === 'buttonNO' ||
    type === 'buttonNC' ||
    type === 'emergencyButton' ||
    type === 'emergencyButtonKeyP20ACR' ||
    type === 'dualPushButtonNpb22D11' ||
    type === 'selector2' ||
    type === 'selector3' ||
    type === 'capacitorRun60uF' ||
    type === 'buzzerMetaltexTby301' ||
    type === 'timerGeyaGrt8M1' ||
    type === 'timerGeyaGrt8M2' ||
    type === 'timerGeyaGrt8B1' ||
    type === 'pushButtonXb2No' ||
    type === 'pushButtonXb2Nc' ||
    type === 'pushButtonXb2Black' ||
    type === 'pushButtonXb2Yellow' ||
    type === 'pushButtonXb2Blue' ||
    type === 'pushButtonXb2White' ||
    type === 'breakerMurrelektronikMico46'
  )
}

export function canInsertComponent3D(type: ComponentType): boolean {
  return hasComponent3DVisual(type)
}

export const MISSING_3D_MODEL_MESSAGE = 'Bloqueado: modelo GLB ou representação 3D ainda não disponível.'

export function hasDinRailModel(type: ComponentType): boolean {
  if (
    type === 'meterD522066' ||
    type === 'meterKws306' ||
    type === 'breakerSchneiderIc60h1p' ||
    type === 'residualBreakerSchneiderIid4p' ||
    type === 'residualBreakerSchneiderIdpnVigi' ||
    type === 'pilotLightSchneiderIil1p' ||
    type === 'pilotLightSchneiderIil3p'
  ) {
    return true
  }
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
