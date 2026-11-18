/**
 * Projeto Nativo: Quadro Geral de Distribuição Trifásico + Monofásico (QGD).
 *
 * Exemplo didático; não substitui dimensionamento, projeto ou certificação elétrica.
 * Inclui os seguintes equipamentos e circuitos:
 *  - Invólucro industrial IP66 com placa de montagem em aço galvanizado e furos/bucins inferiores;
 *  - Calhas DIN EN 60715 e calhas técnicas ranhuradas perimétricas e divisórias;
 *  - Corte e Seccionamento Geral: Disjuntor Tetrapolar 4P (40 A curva C);
 *  - Proteção contra sobretensões transitórias: Descarregador de Sobretensões (DPS);
 *  - Medição de grandezas elétricas: Medidor Digital Multifunções Trifásico LCD KWS-306;
 *  - Monitorização de rede: Sinalizador Schneider Acti9 iIL 3P (L1/L2/L3 com deteção de falta de fase);
 *  - Distribuição primária: Barramento Repartidor Tetrapolar em Escada 4P × 7 com tampa basculante;
 *  - Diferenciais por setor:
 *      * Diferencial Tetrapolar 4P Schneider Acti9 iID 40A 30mA (setor trifásico/oficina);
 *      * Diferencial 2P Hager 25A 30mA (setor residencial monofásico);
 *      * Disjuntor Diferencial Monobloco 1P+N Schneider Acti9 iDPN Vigi C16 30mA (tomadas especiais);
 *  - Barramentos tipo pente:
 *      * Barramento pente Schneider Acti9 1P+N balanceado A9XPC712 com topos amarelos e coberturas snap-on;
 *      * Barramento pente trifásico 3P;
 *  - Circuitos modulares terminais:
 *      * Iluminação: Disjuntor Schneider Acti9 iC60H 1P C10;
 *      * Tomadas Gerais 1 e 2: Disjuntores Schneider Acti9 iC60H 1P C16;
 *      * Tomadas Especiais (forno/bomba): Disjuntor Schneider Acti9 iC60H 1P C20;
 *      * Tomada Trifásica Industrial: Disjuntor Steck SD C25 3P;
 *  - Barramento de neutro isolado e Barramento de terra (PE) em latão maciço;
 *  - Régua de bornes de passagem DIN Phoenix Contact PTI 6 com plaquetas de identificação ZB;
 *  - Equipamentos de campo interligados:
 *      * Conjunto de Tomadas Gerais (L/N/PE);
 *      * Conjunto de Tomadas Especiais (L/N/PE);
 *      * Circuito de iluminação com luminária Schneider Acti9 iIL 230V ativa;
 *      * Tomada Trifásica Industrial CEE 16A/32A (L1/L2/L3/N/PE);
 *      * Motor Trifásico Industrial SEW 0,55 kW em funcionamento direto sob 400V.
 */

import { nanoid } from 'nanoid'
import { createComponent } from '../electrical/factory'
import type { ElectricalComponent, Wire, WireColor } from '../types'
import { syncMounted } from '../three/thermalMount'
import { syncSharedTerminalFerrules } from '../electrical/sharedFerrules'
import { lacePanelHarnesses } from '../three/bundleLacing'
import { bakeNativeRouting } from './nativeRouting'
import { NATIVE_WIRE_CURVES_FEATURE } from './nativeMotorMeter'
import { busbarFootprintPx, busbarTerminalSpecs, isRealBusbarType } from '../three/busbarParts'

import { NATIVE_QUADRO_DISTRIBUICAO_ID } from './nativeProjectIds'
export { NATIVE_QUADRO_DISTRIBUICAO_ID } from './nativeProjectIds'
export const NATIVE_QUADRO_DISTRIBUICAO_NAME = 'Quadro Geral de Distribuição Completo Multi-Circuitos (QGD)'

const PX = 1.5
const QE = 'qgd-enclosure'

/**
 * Cria componente com id e bornes determinísticos (`${id}-${rótulo}`)
 */
function keep(
  id: string,
  type: string,
  ref: string,
  x: number,
  y: number,
  extra: Partial<ElectricalComponent> & { state?: Record<string, unknown> } = {},
): ElectricalComponent {
  const c = createComponent(type as any, ref, extra.label, 0, x, y)
  c.id = id
  c.terminals = c.terminals.map((t) => ({ ...t, id: `${id}-${t.label}`, componentId: id }))
  const { state, ...rest } = extra
  Object.assign(c, rest)
  if (state) c.state = { ...c.state, ...state }
  // O estado da semente difere do catálogo (modo e quantidade de polos).
  // Gerar os bornes a partir desse estado, nunca conservar os do modo 1P.
  if (isRealBusbarType(c.type)) {
    c.terminals = busbarTerminalSpecs(c.type, c.state).map((t) => ({ ...t, id: `${id}-${t.label}`, componentId: id, energized: false }))
    Object.assign(c, busbarFootprintPx(c.type, c.state))
  }
  c.schematicX = x
  c.schematicY = y
  return c
}

export function nativeQuadroDistribuicaoContent(): Record<string, unknown> {
  // ── 1. Invólucro e Calhas do Quadro (800 mm × 1000 mm × 250 mm) ──────────────────────────
  const qe = keep(QE, 'panelEnclosure', 'QE1', 40, -680, {
    w: 800 * PX,
    h: 1000 * PX,
    label: 'Quadro Geral de Distribuição (800×1000×250 mm)',
    state: {
      depthMm: 250,
      widthMm: 800,
      heightMm: 1000,
      doorOpen: true,
      hingeSide: 'left',
      plateFinish: 'Aço galvanizado',
      holes: [
        { id: 'qd-hole-1', face: 'bottom', diameterMm: 32, offsetXmm: -220, offsetYmm: 0, glandType: 'plastic' },
        { id: 'qd-hole-2', face: 'bottom', diameterMm: 25, offsetXmm: -110, offsetYmm: 0, glandType: 'plastic' },
        { id: 'qd-hole-3', face: 'bottom', diameterMm: 20, offsetXmm: 0, offsetYmm: 0, glandType: 'plastic' },
        { id: 'qd-hole-4', face: 'bottom', diameterMm: 20, offsetXmm: 110, offsetYmm: 0, glandType: 'plastic' },
        { id: 'qd-hole-5', face: 'bottom', diameterMm: 20, offsetXmm: 220, offsetYmm: 0, glandType: 'plastic' },
      ],
    },
  })

  // Calhas DIN EN 60715 (35 × 15 mm perfuradas, 620 mm de comprimento útil)
  const railState = { finish: 'Aço galvanizado', profile: '35×15 mm', lengthMm: 620, perforated: true }
  const tr1 = keep('qd-tr1', 'dinRail15x55', 'TR1', 170, -480, {
    w: 620 * PX, h: 53, enclosureId: QE, label: 'Fila 1 · Alimentação, Corte Geral, DPS e Medição', state: railState,
  })
  const tr2 = keep('qd-tr2', 'dinRail15x55', 'TR2', 170, -210, {
    w: 620 * PX, h: 53, enclosureId: QE, label: 'Fila 2 · Barramento Escada e Interruptores Diferenciais', state: railState,
  })
  const tr3 = keep('qd-tr3', 'dinRail15x55', 'TR3', 170, 70, {
    w: 620 * PX, h: 53, enclosureId: QE, label: 'Fila 3 · Barramentos Pente e Disjuntores Modulares', state: railState,
  })
  const tr4 = keep('qd-tr4', 'dinRail15x55', 'TR4', 170, 360, {
    w: 620 * PX, h: 53, enclosureId: QE, label: 'Fila 4 · Bornes de Saída e Barramentos N / PE', state: railState,
  })

  // Calhas técnicas ranhuradas (PVC cinzento com tampa amovível)
  const duct = (id: string, ref: string, x: number, y: number, w: number, lengthMm: number, rotation = 0, hMm = 60) =>
    keep(id, 'cableDuct', ref, x, y, {
      w, h: 60, rotation, enclosureId: QE,
      state: { coverOn: true, widthMm: 40, heightMm: hMm, lengthMm },
    })

  const ctTop = duct('qd-ct-top', 'CT1', 140, -600, 980, 650, 0, 40)
  const ctMid1 = duct('qd-ct-mid1', 'CT2', 140, -345, 980, 650, 0, 40)
  const ctMid2 = duct('qd-ct-mid2', 'CT3', 140, -70, 980, 650, 0, 40)
  const ctMid3 = duct('qd-ct-mid3', 'CT4', 140, 215, 980, 650, 0, 40)
  const ctBot = duct('qd-ct-bot', 'CT5', 140, 500, 980, 650, 0, 40)
  // Calhas verticais laterais (1000 mm)
  const ctLeft = duct('qd-ct-left', 'CT6', 120 - 450, -50, 1400, 940, 90, 60)
  const ctRight = duct('qd-ct-right', 'CT7', 1120 - 450, -50, 1400, 940, 90, 60)

  // ── 2. Aparelhos na Fila 1 (Corte Geral, DPS, Medidor KWS-306, Sinalizador iIL 3P) ───────
  const onRail = (railId: string, offsetMm: number) => ({ railId, railOffsetMm: offsetMm, enclosureId: QE })

  // Fonte de Alimentação da Rede Pública 400V 3F+N+PE
  const qgSource = keep('qd-source', 'powerSource3ph', 'REDE', 180, -520, {
    ...onRail(tr1.id, 6.7),
    label: 'Rede 400V 3F+N+PE (Entrada Principal)',
    state: { on: true, vLL: 400, vLN: 230, frequency: 50 },
  })

  // Disjuntor Geral Tetrapolar 4P 40A curva C (Corte Geral)
  const qg1 = keep('qd-qg1', 'breaker4p', 'QG1', 310, -520, {
    ...onRail(tr1.id, 93.3),
    label: 'Disjuntor Geral 4P 40A (Corte Geral do Quadro)',
    state: { closed: true, tripped: false, poles: 4, inA: 40, curve: 'C', icn: '10 kA' },
  })

  // Descarregador de Sobretensões (DPS Tetrapolar L1-L2-L3-N-PE)
  const dps1 = keep('qd-dps1', 'surgeProtector', 'DPS1', 485, -520, {
    ...onRail(tr1.id, 210),
    label: 'DPS Tetrapolar Classe II (Proteção Sobretensões)',
    state: { failed: false, upKv: 1.5, ucV: 275, poles: 4, connection: 'parallel' },
  })
  // DPS 3P+N em derivação: em serviço normal NÃO une fases, N ou PE.
  dps1.terminals = ['L1', 'L2', 'L3', 'N', 'PE'].map((label, index) => ({
    id: `${dps1.id}-${label}`, componentId: dps1.id, label,
    kind: label === 'PE' ? 'earth' : label === 'N' ? 'neutral' : 'power-in',
    terminalType: 'screw', electricalClass: label === 'PE' ? 'other' : 'ac',
    color: label === 'PE' ? '#16a34a' : label === 'N' ? '#2563eb' : '#374151',
    x: label === 'PE' ? 0.5 : (index + 0.5) / 4, y: label === 'PE' ? 1 : 0,
    position3D: { x: label === 'PE' ? 0.5 : (index + 0.5) / 4, y: label === 'PE' ? 0.14 : 0.86, z: 1 },
    energized: false,
  }))

  // Medidor Multifunções Digital Trifásico DIN LCD KWS-306
  const pm1 = keep('qd-pm1', 'meterKws306', 'PM1', 600, -550, {
    ...onRail(tr1.id, 286.7),
    label: 'Medidor Trifásico Multifunções KWS-306 LCD',
    state: { on: true, switchOn: true, vA: 230.2, vB: 229.8, vC: 230.5, iA: 5.4, iB: 5.2, iC: 5.3, frequency: 50 },
  })

  // Sinalizador Modular Schneider Acti9 iIL 3P (L1-L2-L3 com deteção de falta de fase)
  const hl1 = keep('qd-hl1', 'pilotLightSchneiderIil3p', 'HL1', 775, -515, {
    ...onRail(tr1.id, 403.3),
    label: 'Schneider Acti9 iIL 3P · Presença & Falta de Fases',
    state: { on: true, l1On: true, l2On: true, l3On: true, phaseLoss: false, brand: 'Schneider Electric', code: 'A9E18324' },
  })

  // ── 3. Aparelhos na Fila 2 (Barramento Escada Tetrapolar e Interruptores Diferenciais) ────
  // Barramento Repartidor em Escada 4P × 7 bornes escalonados com tampa acrílica transparente
  const bbEscada = keep('qd-bb-escada', 'busbarPhaseStepped', 'BB_ESCADA', 180, -250, {
    ...onRail(tr2.id, 6.7),
    label: 'Barramento Repartidor em Escada 4P (125A)',
    state: { poleCount: 7, barsMode: 4, coverOpen: false, coverVisible: true, source: false },
  })

  // Interruptor Diferencial Tetrapolar 4P Schneider Acti9 iID 40A 30mA (Oficina / Setor Trifásico)
  const idTrif = keep('qd-id-trif', 'residualBreakerSchneiderIid4p', 'ID_TRIF', 370, -250, {
    ...onRail(tr2.id, 133.3),
    label: 'Schneider Acti9 iID 4P 40A 30mA (Diferencial Trifásico)',
    state: { closed: true, tripped: false, inA: 40, sensmA: 30, rcdType: 'A', poles: 4, code: 'A9R11440', brand: 'Schneider Electric' },
  })

  // Interruptor Diferencial 2P Hager 25A 30mA (Tomadas Gerais e Iluminação)
  const idGeral = keep('qd-id-geral', 'residualBreakerHagerCfc225p', 'ID_GERAL', 535, -250, {
    ...onRail(tr2.id, 243.3),
    label: 'Interruptor Diferencial 2P 25A 30mA (Setor Monofásico)',
    state: { closed: true, tripped: false, inA: 25, sensmA: 30, rcdType: 'AC', poles: 2 },
  })

  // Disjuntor Diferencial Monobloco 1P+N Schneider Acti9 iDPN Vigi C16 30mA (Tomadas Especiais)
  const rcboEsp = keep('qd-rcbo-esp', 'residualBreakerSchneiderIdpnVigi', 'RCBO_ESP', 680, -250, {
    ...onRail(tr2.id, 340),
    label: 'Schneider Acti9 iDPN Vigi 1P+N C16 30mA (Tomadas Especiais)',
    state: { closed: true, tripped: false, inA: 16, curve: 'C', sensmA: 30, rcdType: 'A', poles: 2, code: 'A9N19665', brand: 'Schneider Electric' },
  })

  // ── 4. Aparelhos na Fila 3 (Barramentos Pente e Disjuntores Terminais) ─────────────────────
  // Barramento Pente Schneider Acti9 1P+N (3P Balanceado) A9XPC712 com topos amarelos A9XPE e protetores snap-on
  const bbCombActi9 = keep('qd-bb-comb-acti9', 'busbarComb', 'BB_COMB1', 180, 30, {
    ...onRail(tr3.id, 6.7),
    label: 'Schneider Acti9 Pente 1P+N (A9XPC712 · 80A / 16mm²)',
    state: {
      combMode: '1P+N-3P',
      poleCount: 12,
      pitchMm: 18,
      ratedA: 80,
      neutralSide: 'left',
      brandStyle: 'schneider',
      hasEndCaps: true,
      endCapColor: 'yellow',
      toothCovers: [3, 4, 5, 6, 8, 9, 10, 11], // L2/L3 isoladas; neste setor só se utilizam L1 e N
    },
  })

  // Disjuntor Iluminação Schneider Acti9 iC60H 1P C10 10 kA
  const qIlum = keep('qd-q-ilum', 'breakerSchneiderIc60h1p', 'Q_ILUM', 220, 30, {
    ...onRail(tr3.id, 33.3),
    label: 'Schneider Acti9 iC60H 1P C10 · Iluminação',
    state: { closed: true, tripped: false, inA: 10, curve: 'C', poles: 1, icn: '10 kA', code: 'A9F84110' },
  })

  // Disjuntor Tomadas Gerais 1 Schneider Acti9 iC60H 1P C16 10 kA
  const qTom1 = keep('qd-q-tom1', 'breakerSchneiderIc60h1p', 'Q_TOM1', 290, 30, {
    ...onRail(tr3.id, 80),
    label: 'Schneider Acti9 iC60H 1P C16 · Tomadas Sala/Quartos',
    state: { closed: true, tripped: false, inA: 16, curve: 'C', poles: 1, icn: '10 kA', code: 'A9F84116' },
  })

  // Disjuntor Tomadas Gerais 2 Schneider Acti9 iC60H 1P C16 10 kA
  const qTom2 = keep('qd-q-tom2', 'breakerSchneiderIc60h1p', 'Q_TOM2', 360, 30, {
    ...onRail(tr3.id, 126.7),
    label: 'Schneider Acti9 iC60H 1P C16 · Tomadas Cozinha',
    state: { closed: true, tripped: false, inA: 16, curve: 'C', poles: 1, icn: '10 kA', code: 'A9F84116' },
  })

  // Disjuntor Tomada Especial Schneider Acti9 iC60H 1P C20 10 kA (Forno / Bomba / Climatização)
  const qEsp = keep('qd-q-esp', 'breakerSchneiderIc60h1p', 'Q_ESP', 430, 30, {
    ...onRail(tr3.id, 173.3),
    label: 'Schneider Acti9 iC60H 1P C20 · Tomadas Especiais',
    state: { closed: true, tripped: false, inA: 20, curve: 'C', poles: 1, icn: '10 kA', code: 'A9F84120' },
  })

  // Barramento Pente Trifásico 3P
  const bbComb3p = keep('qd-bb-comb-3p', 'busbarComb', 'BB_COMB2', 530, 30, {
    ...onRail(tr3.id, 240),
    label: 'Barramento Pente Trifásico 3P (63A)',
    state: { combMode: '3P', poleCount: 6, pitchMm: 18, ratedA: 63, brandStyle: 'schneider', hasEndCaps: true },
  })

  // Disjuntor Trifásico 3P 25A (Tomada Trifásica Industrial / Oficina)
  const qTrif = keep('qd-q-trif', 'breaker3p', 'Q_TRIF', 560, 30, {
    ...onRail(tr3.id, 260),
    label: 'Disjuntor Trifásico 3P 25A · Tomada Industrial',
    state: { closed: true, tripped: false, inA: 25, curve: 'C', poles: 3, icn: '10 kA' },
  })

  // ── 5. Aparelhos na Fila 4 (Bornes de Saída PTI 6 e Barramentos N / PE) ────────────────────
  // Régua de bornes DIN Phoenix Contact PTI 6 (X1.1 a X1.10)
  const strip = (id: string, ref: string, label: string, offsetMm: number) => {
    return keep(id, 'terminalPhoenixPti6', ref, 180 + offsetMm * PX, 320, {
      ...onRail(tr4.id, offsetMm),
      label,
    })
  }

  const xIlumL = strip('qd-x1', 'X1.1', 'L · Iluminação', 10)
  const xIlumN = strip('qd-x2', 'X1.2', 'N · Iluminação', 22)
  const xTom1L = strip('qd-x3', 'X1.3', 'L · Tomadas Gerais 1', 34)
  const xTom2L = strip('qd-x4', 'X1.4', 'L · Tomadas Gerais 2', 46)
  const xTomN = strip('qd-x5', 'X1.5', 'N · Tomadas Gerais', 58)
  const xEspL = strip('qd-x6', 'X1.6', 'L · Tomadas Especiais', 70)
  const xEspN = strip('qd-x7', 'X1.7', 'N · Tomadas Especiais', 82)
  const x3pL1 = strip('qd-x8', 'X1.8', 'L1 · Tomada Trifásica', 94)
  const x3pL2 = strip('qd-x9', 'X1.9', 'L2 · Tomada Trifásica', 106)
  const x3pL3 = strip('qd-x10', 'X1.10', 'L3 · Tomada Trifásica', 118)

  // Barramento de Neutro Isolado (N_BAR)
  const nBar = keep('qd-n-bar', 'busbarNeutral', 'N_BAR', 440, 320, {
    ...onRail(tr4.id, 180),
    label: 'Barramento de Neutro Isolado (10 Bornes M5)',
    state: { poleCount: 10, coverVisible: true, source: false },
  })

  // Barramento de Terra em Latão Maciço (PE_BAR)
  const peBar = keep('qd-pe-bar', 'earthBar', 'PE_BAR', 640, 320, {
    ...onRail(tr4.id, 313.3),
    label: 'Barramento de Terra (PE) Equipotencial em Latão',
    state: { poleCount: 10, coverVisible: true, source: true },
  })

  // ── 6. Equipamentos e Cargas de Campo (Fora do Armário à Direita) ──────────────────────────
  // Circuito de Iluminação: Luminária Schneider Acti9 iIL 230V
  const lum1 = keep('qd-lum1', 'pilotLightSchneiderIil1p', 'LUM1', 1300, -420, {
    label: 'Luminária / Iluminação Schneider Acti9 iIL (230V)',
    state: { on: true, color: '#facc15', voltage: '230V AC', brand: 'Schneider Electric', code: 'A9E18320' },
  })

  // Conjunto de Tomadas Gerais Monofásicas (2P+T 230V 16A)
  const tomGeral = keep('qd-tom-geral', 'terminalSet1ph', 'TOM_GERAL', 1300, -220, {
    label: 'Tomadas Gerais 1 · Sala / Quartos · 230V 16A',
    state: { on: true },
  })

  const tomGeral2 = keep('qd-tom-geral-2', 'terminalSet1ph', 'TOM_GERAL2', 1520, -220, {
    label: 'Tomadas Gerais 2 · Cozinha · 230V 16A', state: { on: true },
  })

  // Conjunto de Tomadas Especiais Dedicadas (2P+T 230V 20A - Forno / Bomba de Calor)
  const tomEsp = keep('qd-tom-esp', 'terminalSet1ph', 'TOM_ESP', 1300, 20, {
    label: 'Tomadas Especiais Dedicadas 230V 20A (Forno / Climatização)',
    state: { on: true },
  })

  // Tomada Trifásica Industrial CEE 16A/32A (400V 3P+N+PE)
  const tomTrif = keep('qd-tom-trif', 'terminalSet3ph', 'TOM_TRIF', 1300, 260, {
    label: 'Tomada Trifásica Industrial CEE (400V 3P+N+PE)',
    state: { on: true },
  })

  const qm1 = keep('qd-qm1', 'motorBreaker', 'QM1', 1300, 460, {
    label: 'Proteção magnetotérmica do motor · 1–1,6 A',
    state: { closed: true, tripped: false, inA: 1.6, rangeA: '1–1,6 A', poles: 3 },
  })

  // Motor Trifásico Industrial SEW DRN80MK4 0,55 kW (Carga Mecânica)
  const m1 = keep('qd-motor1', 'motor3ph', 'M1', 1500, 480, {
    label: 'Motor SEW DRN80MK4 (0,55 kW 400V Y) na Tomada Trifásica',
    viewOrientation: { x: 14, y: -35, z: 0 },
    state: { motorConnection: 'star', running: true, direction: 'cw', rpmVisual: 1.0 },
  })

  // Função explícita dos bornes genéricos usados como neutro neste circuito.
  for (const [component, labels] of [[qg1, ['7', '8']], [xIlumN, ['1', '2']], [xTomN, ['1', '2']], [xEspN, ['1', '2']], [lum1, ['X2']]] as const) {
    component.terminals = component.terminals.map((t) => (labels as readonly string[]).includes(t.label)
      ? { ...t, kind: 'neutral', electricalClass: 'ac', color: '#2563eb' } : t)
  }

  // Lista de componentes
  const components: ElectricalComponent[] = [
    qe,
    tr1, tr2, tr3, tr4,
    ctTop, ctMid1, ctMid2, ctMid3, ctBot, ctLeft, ctRight,
    qgSource, qg1, dps1, pm1, hl1,
    bbEscada, idTrif, idGeral, rcboEsp,
    bbCombActi9, qIlum, qTom1, qTom2, qEsp, bbComb3p, qTrif,
    xIlumL, xIlumN, xTom1L, xTom2L, xTomN, xEspL, xEspN, x3pL1, x3pL2, x3pL3,
    nBar, peBar,
    lum1, tomGeral, tomGeral2, tomEsp, tomTrif, qm1, m1,
  ]

  // ── 7. Cablagem Estruturada e Interligações ────────────────────────────────────────────────
  const tid = (c: ElectricalComponent, label: string) => {
    const t = c.terminals.find((x) => x.label === label)
    if (!t) throw new Error(`${c.ref}:${label} não existe em ${c.terminals.map((x) => x.label).join(', ')}`)
    return t.id
  }

  const wires: Wire[] = []
  const add = (
    a: ElectricalComponent, al: string,
    b: ElectricalComponent, bl: string,
    color: WireColor, num: string, gauge = '2.5mm²',
  ) => {
    wires.push({
      id: `qd-wire-${num.toLowerCase()}`,
      fromTerminalId: tid(a, al),
      toTerminalId: tid(b, bl),
      color,
      gauge,
      number: num,
      kind: color === 'green-yellow' ? 'earth' : color === 'blue' || color === 'lightblue' ? 'neutral' : 'power',
      flexibility: 'flexible',
      endType: 'ferrule',
      fromEndType: a.type === 'motor3ph' ? 'ring' : 'ferrule',
      toEndType: b.type === 'motor3ph' ? 'ring' : 'ferrule',
      fromEndLayer: 'back',
      toEndLayer: 'back',
      route: 'manhattan',
      bend: 0.5,
      curveOffset: 0,
      energized: false,
    } as Wire)
  }

  // A) Alimentação Geral da Rede (3F+N+PE) → Disjuntor Geral 4P + Terra
  add(qgSource, 'L1', qg1, '1', 'black', 'W01', '6mm²')
  add(qgSource, 'L2', qg1, '3', 'brown', 'W02', '6mm²')
  add(qgSource, 'L3', qg1, '5', 'grey', 'W03', '6mm²')
  add(qgSource, 'N', qg1, '7', 'blue', 'W04', '6mm²')
  add(qgSource, 'PE', peBar, 'PE1', 'green-yellow', 'PE01', '6mm²')

  // B) Saída do Disjuntor Geral 4P → Descarregador de Sobretensões (DPS)
  add(qg1, '2', dps1, 'L1', 'black', 'W05', '4mm²')
  add(qg1, '8', dps1, 'N', 'blue', 'W06', '4mm²')
  add(dps1, 'PE', peBar, 'PE2', 'green-yellow', 'PE02', '4mm²')

  add(qg1, '4', dps1, 'L2', 'brown', 'W64', '4mm²')
  add(qg1, '6', dps1, 'L3', 'grey', 'W65', '4mm²')

  // C) Saída do Disjuntor Geral 4P → Medidor Multifunções Trifásico KWS-306
  add(qg1, '2', pm1, 'L1-IN', 'black', 'W07', '6mm²')
  add(qg1, '4', pm1, 'L2-IN', 'brown', 'W08', '6mm²')
  add(qg1, '6', pm1, 'L3-IN', 'grey', 'W09', '6mm²')
  add(qg1, '8', pm1, 'N-IN', 'blue', 'W10', '6mm²')

  // D) Saída do Medidor KWS-306 → Sinalizador Schneider Acti9 iIL 3P (Presença & Falta de Fases)
  add(pm1, 'L1-OUT', hl1, 'L1', 'black', 'W11', '1.5mm²')
  add(pm1, 'L2-OUT', hl1, 'L2', 'brown', 'W12', '1.5mm²')
  add(pm1, 'L3-OUT', hl1, 'L3', 'grey', 'W13', '1.5mm²')
  add(pm1, 'N-OUT', hl1, 'N', 'blue', 'W14', '1.5mm²')

  // E) Saída do Medidor KWS-306 → Barramento Repartidor em Escada Tetrapolar 4P
  add(pm1, 'L1-OUT', bbEscada, 'L1.1', 'black', 'W15', '6mm²')
  add(pm1, 'L2-OUT', bbEscada, 'L2.1', 'brown', 'W16', '6mm²')
  add(pm1, 'L3-OUT', bbEscada, 'L3.1', 'grey', 'W17', '6mm²')
  add(pm1, 'N-OUT', bbEscada, 'N.1', 'blue', 'W18', '6mm²')

  // F) Barramento Escada → Diferencial Tetrapolar 4P Schneider Acti9 iID (Oficina / Trifásico)
  add(bbEscada, 'L1.2', idTrif, '1', 'black', 'W19', '4mm²')
  add(bbEscada, 'L2.2', idTrif, '3', 'brown', 'W20', '4mm²')
  add(bbEscada, 'L3.2', idTrif, '5', 'grey', 'W21', '4mm²')
  add(bbEscada, 'N.2', idTrif, 'N1', 'blue', 'W22', '4mm²')

  // G) Barramento Escada → Diferencial 2P Hager (Tomadas Gerais e Iluminação)
  add(bbEscada, 'L1.3', idGeral, '1', 'black', 'W23', '4mm²')
  add(bbEscada, 'N.3', idGeral, 'N1', 'blue', 'W24', '4mm²')

  // H) Barramento Escada → Disjuntor Diferencial Monobloco 1P+N Schneider Acti9 iDPN Vigi (Especiais)
  add(bbEscada, 'L2.3', rcboEsp, '1', 'brown', 'W25', '2.5mm²')
  add(bbEscada, 'N.4', rcboEsp, 'N1', 'blue', 'W26', '2.5mm²')

  // I) Diferencial Monofásico ID_GERAL → Barramento Pente Acti9 e Disjuntores Modulares iC60H
  // Só a barra L1 e a barra N são utilizadas neste setor monofásico;
  // os dentes L2/L3 do A9XPC712 ficam isolados e cobertos.
  add(idGeral, '2', bbCombActi9, 'L1.1', 'black', 'W27', '4mm²')
  add(bbCombActi9, 'L1.1', qIlum, '1', 'black', 'W28', '2.5mm²')
  add(bbCombActi9, 'L1.2', qTom1, '1', 'black', 'W29', '2.5mm²')
  add(bbCombActi9, 'L1.2', qTom2, '1', 'black', 'W59', '2.5mm²')
  add(idGeral, 'N2', bbCombActi9, 'N.1', 'blue', 'W30', '4mm²')
  add(bbCombActi9, 'N.2', nBar, 'N1', 'blue', 'W60', '4mm²')

  // J) RCBO Especiais → Disjuntor Tomada Especial Q_ESP
  add(rcboEsp, '2', qEsp, '1', 'brown', 'W31', '2.5mm²')

  // K) Diferencial Trifásico ID_TRIF → Disjuntor Trifásico Steck Q_TRIF
  add(idTrif, '2', bbComb3p, 'L1.1', 'black', 'W32', '4mm²')
  add(idTrif, '4', bbComb3p, 'L2.1', 'brown', 'W33', '4mm²')
  add(idTrif, '6', bbComb3p, 'L3.1', 'grey', 'W34', '4mm²')
  add(bbComb3p, 'L1.2', qTrif, '1', 'black', 'W61', '4mm²')
  add(bbComb3p, 'L2.2', qTrif, '3', 'brown', 'W62', '4mm²')
  add(bbComb3p, 'L3.2', qTrif, '5', 'grey', 'W63', '4mm²')
  // O neutro deste diferencial NÃO se une à barra a jusante de ID_GERAL.
  add(idTrif, 'N2', tomTrif, 'N-IN', 'blue', 'W35', '4mm²')

  // L) Disjuntores Terminais → Régua de Bornes de Saída Phoenix Contact PTI 6
  // Circuito 1: Iluminação
  add(qIlum, '2', xIlumL, '1', 'black', 'W36', '1.5mm²')
  add(nBar, 'N3', xIlumN, '1', 'blue', 'W37', '1.5mm²')

  // Circuito 2: Tomadas Gerais Sala/Quartos
  add(qTom1, '2', xTom1L, '1', 'black', 'W38', '2.5mm²')
  add(nBar, 'N4', xTomN, '1', 'blue', 'W39', '2.5mm²')

  // Circuito 3: Tomadas Gerais Cozinha
  add(qTom2, '2', xTom2L, '1', 'black', 'W40', '2.5mm²')

  // Circuito 4: Tomadas Especiais Dedicadas (Forno / Bomba de Calor)
  add(qEsp, '2', xEspL, '1', 'brown', 'W41', '2.5mm²')
  add(rcboEsp, 'N2', xEspN, '1', 'blue', 'W42', '2.5mm²')

  // Circuito 5: Tomada Trifásica Industrial (L1, L2, L3)
  add(qTrif, '2', x3pL1, '1', 'black', 'W43', '2.5mm²')
  add(qTrif, '4', x3pL2, '1', 'brown', 'W44', '2.5mm²')
  add(qTrif, '6', x3pL3, '1', 'grey', 'W45', '2.5mm²')

  // M) Bornes de Saída e Bucins → Equipamentos e Cargas de Campo
  // 1) Iluminação (LUM1)
  add(xIlumL, '2', lum1, 'X1', 'black', 'W46', '1.5mm²')
  add(xIlumN, '2', lum1, 'X2', 'blue', 'W47', '1.5mm²')

  // 2) Tomadas Gerais (TOM_GERAL)
  add(xTom1L, '2', tomGeral, 'L-IN', 'black', 'W48', '2.5mm²')
  add(xTomN, '2', tomGeral, 'N-IN', 'blue', 'W49', '2.5mm²')
  add(peBar, 'PE3', tomGeral, 'PE-IN', 'green-yellow', 'PE03', '2.5mm²')

  add(xTom2L, '2', tomGeral2, 'L-IN', 'black', 'W66', '2.5mm²')
  add(nBar, 'N5', tomGeral2, 'N-IN', 'blue', 'W67', '2.5mm²')
  add(peBar, 'PE7', tomGeral2, 'PE-IN', 'green-yellow', 'PE07', '2.5mm²')

  // 3) Tomadas Especiais (TOM_ESP)
  add(xEspL, '2', tomEsp, 'L-IN', 'brown', 'W50', '2.5mm²')
  add(xEspN, '2', tomEsp, 'N-IN', 'blue', 'W51', '2.5mm²')
  add(peBar, 'PE4', tomEsp, 'PE-IN', 'green-yellow', 'PE04', '2.5mm²')

  // 4) Tomada Trifásica Industrial (TOM_TRIF)
  add(x3pL1, '2', tomTrif, 'L1-IN', 'black', 'W52', '2.5mm²')
  add(x3pL2, '2', tomTrif, 'L2-IN', 'brown', 'W53', '2.5mm²')
  add(x3pL3, '2', tomTrif, 'L3-IN', 'grey', 'W54', '2.5mm²')
  add(peBar, 'PE5', tomTrif, 'PE-IN', 'green-yellow', 'PE05', '2.5mm²')

  // 5) Motor Trifásico SEW conectado à Tomada Trifásica
  add(tomTrif, 'L1-OUT', qm1, '1', 'black', 'W56', '2.5mm²')
  add(tomTrif, 'L2-OUT', qm1, '3', 'brown', 'W57', '2.5mm²')
  add(tomTrif, 'L3-OUT', qm1, '5', 'grey', 'W58', '2.5mm²')
  add(qm1, '2', m1, 'U1', 'black', 'W68', '2.5mm²')
  add(qm1, '4', m1, 'V1', 'brown', 'W69', '2.5mm²')
  add(qm1, '6', m1, 'W1', 'grey', 'W70', '2.5mm²')
  add(tomTrif, 'PE-OUT', m1, 'PE', 'green-yellow', 'PE06', '2.5mm²')

  // Processamento 3D: montagens, terminações, chicotes industriais e traçados determinísticos
  const mounted = syncMounted(components)
  const ferruled = syncSharedTerminalFerrules(wires)
  const laced = lacePanelHarnesses(mounted, ferruled, { prefix: 'chicote-qgd' })
  const routed = bakeNativeRouting(mounted, laced)
  const now = new Date().toISOString()

  return {
    app: 'dc-simu',
    version: 6,
    projectKind: 'all',
    unlockedViews: [],
    savedAt: now,
    nativeId: NATIVE_QUADRO_DISTRIBUICAO_ID,
    nativeFeatures: [NATIVE_WIRE_CURVES_FEATURE],
    components: mounted,
    wires: routed,
    ladder: { rungs: [] },
    fcBlocks: { fc1: [], fc2: [] },
    fcAdded: { fc1: false, fc2: false },
    activePlcId: null,
    plcPrograms: {},
    plcTags: {},
    projectFiles: {},
    hiddenProjectFolders: {},
    projectFolderLabels: {},
    fcNames: {},
    grafcet: { steps: [], transitions: [] },
    tags: [],
    commands: { pages: [{ id: 'page-1', name: 'Esquema Geral QGD' }], parts: [], texts: [], wires: [] },
    virtualInputs: {},
    virtualInputModes: {},
    virtualInputCount: 8,
    virtualOutputCount: 8,
    virtualMemoryCount: 4,
    sheets: [{ id: 'sheet-1', name: 'Distribuição e Potência' }],
    activeSheetId: 'sheet-1',
    grid: { size: 20, snap: true, style: 'dots', enabled: true, background: '#f7f9fc' },
    activeScenario: 'custom',
    canvasNotes: [
      {
        id: 'qgd-n1',
        text: 'Guia do Quadro Geral de Distribuição (QGD)',
        view: '3d',
        x: 1.8,
        y: 1.6,
        z: 0.35,
        color: '#fef08a',
        createdAt: now,
        messages: [
          {
            id: 'qgd-n1-m1',
            author: 'DC-SIMU Pro',
            createdAt: now,
            text:
              'Quadro Geral de Distribuição com múltiplos circuitos:\n' +
              '• Fila 1: Corte Geral 4P 40A, DPS Tetrapolar, Medidor Trifásico LCD KWS-306 e Sinalizador Acti9 iIL 3P (presença e perda de fases).\n' +
              '• Fila 2: Barramento repartidor tetrapolar em escada (4P×7), Diferencial 4P 40A 30mA (Oficina), Diferencial 2P 25A 30mA e RCBO 1P+N C16 30mA (Especiais).\n' +
              '• Fila 3: Pente Schneider Acti9 1P+N (A9XPC712) com topos amarelos e coberturas snap-on, disjuntores iC60H (Iluminação, Tomadas Gerais, Especiais) e Disjuntor Trifásico 3P.\n' +
              '• Fila 4: Bornes Phoenix Contact PTI 6, Barramento de Neutro isolado e Barramento de Terra PE em latão maciço.\n' +
              '• Base do Quadro: Furos e bucins plásticos para entrada da rede e saída dos circuitos para as tomadas e motor.',
          },
        ],
      },
    ],
    canvasTexts: [
      { id: 'txt-qg', x: 280, y: -545, text: 'CORTE GERAL 4P', fontSize: 13, color: '#1e293b' },
      { id: 'txt-dps', x: 470, y: -545, text: 'DPS SOBRETENSÕES', fontSize: 13, color: '#1e293b' },
      { id: 'txt-pm', x: 610, y: -575, text: 'MEDIDOR KWS-306', fontSize: 13, color: '#1e293b' },
      { id: 'txt-hl', x: 760, y: -540, text: 'ACTI9 iIL 3P (FASES)', fontSize: 13, color: '#1e293b' },
      { id: 'txt-escada', x: 180, y: -275, text: 'REPARTIDOR ESCADA 4P', fontSize: 13, color: '#1e293b' },
      { id: 'txt-idtrif', x: 360, y: -275, text: 'DDR TRIFÁSICO 4P', fontSize: 13, color: '#1e293b' },
      { id: 'txt-idgeral', x: 520, y: -275, text: 'DDR GERAL 2P', fontSize: 13, color: '#1e293b' },
      { id: 'txt-rcbo', x: 670, y: -275, text: 'RCBO iDPN VIGI', fontSize: 13, color: '#1e293b' },
      { id: 'txt-pente', x: 220, y: 5, text: 'ACTI9 A9XPC712 (1P+N)', fontSize: 13, color: '#1e293b' },
      { id: 'txt-bornes', x: 180, y: 295, text: 'BORNES PTI 6 (SAÍDAS)', fontSize: 13, color: '#1e293b' },
      { id: 'txt-nbar', x: 450, y: 295, text: 'NEUTRO (N)', fontSize: 13, color: '#1e293b' },
      { id: 'txt-pebar', x: 650, y: 295, text: 'TERRA (PE)', fontSize: 13, color: '#1e293b' },
    ],
  }
}
