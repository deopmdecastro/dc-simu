/**
 * Projetos nativos embutidos no código.
 *
 * Aparecem sempre na conta admin (local), independentemente do navegador
 * ou da sessão — o conteúdo base vem deste módulo. O admin pode editar
 * esquema 2D/3D, Ladder e GRAFCET; as alterações gravam-se normalmente.
 * Se o projeto for eliminado, volta a ser reposto no próximo carregamento.
 */

import { createComponent } from '../electrical/factory'
import type { ElectricalComponent, Wire, WireColor } from '../types'
import type { LadderRung, LadderTag } from '../types'
import { blockDisplayName } from '../ladder/blockCatalog'
import { transitionsOf, type GrafcetProgram, type GrafcetStep, type GrafcetTransition } from '../grafcet/engine'
import { autoLayout, SPINE_X, START_Y, STEP_H } from '../grafcet/layout'
import {
  grafcetToLadderWord,
  WORD_FC_GRAFCET,
  WORD_FC_OUTPUTS,
  WORD_REGISTER_COMMENT,
} from '../grafcet/toLadderWord'
import type { ProjectFile } from '../ladder/projectFiles'
import { nanoid } from 'nanoid'
import { panelToSchematicX, panelToSchematicY } from '../three/panelLayout'
import { bakeNativeRouting } from './nativeRouting'
import { mountPosition } from '../three/thermalMount'
import { buildNativeMotorMeter, withMotorMeterFerrules, NATIVE_PARTIDA_ID, NATIVE_MOTOR_METER_FEATURE, NATIVE_MOTOR_DOUBLE_FERRULE_FEATURE, NATIVE_MOTOR_RING_FEATURE, NATIVE_WIRE_CURVES_FEATURE, NATIVE_THERMAL_FEATURE, NATIVE_THERMAL_MOUNT_FEATURE, NATIVE_COIL_AC_FEATURE, NATIVE_SIGNALS_FEATURE } from './nativeMotorMeter'
import { buildNativeIecSchematic, NATIVE_IEC_FEATURE, NATIVE_IEC_V2_FEATURE, NATIVE_IEC_V3_FEATURE, NATIVE_IEC_V4_FEATURE, NATIVE_IEC_V5_FEATURE, NATIVE_IEC_V6_FEATURE, NATIVE_IEC_V7_FEATURE } from './nativeIec'
import { syncSharedTerminalFerrules } from '../electrical/sharedFerrules'
import { NATIVE_NC_SIM_FEATURE, withNativeNcSimInputs } from './nativeSimInputs'
import { grafcetExampleContent, grafcetExamples } from './grafcetExamples'

/** Blocos de programa do método «registo de etapa» (FC + OB100 + CALL na Main). */
export const NATIVE_PLC_ID = 'native-plc'
/** Relé térmico F1 (Siemens 3RU1116) encaixado por baixo do KM1. */
export const NATIVE_F1_ID = 'native-f1'
/** Cabos KM1 → F1 que o encaixe direto dispensa (os pinos do F1 entram nos bornes do KM1). */
export const NATIVE_F1_MOUNT_WIRES = ['native-wire-4', 'native-wire-8', 'native-wire-12']
export const NATIVE_H3_ID = 'native-h3'
/** Cor do H2 PARADO (laranja); antes era vermelho. */
export const NATIVE_H2_COLOR = '#f97316'
/** Bornes que só os cabos do sinal do F1 e do H3 usam (no quadro anterior estavam livres). */
export const NATIVE_SIGNAL_TERMINALS = ['native-f1-97', 'native-f1-98', 'native-plc-I0.3', 'native-plc-Q0.3', 'native-plc-Q0.3·2', 'native-h3-X1', 'native-h3-X2']
export const isNativeSignalWire = (w: Pick<Wire, 'fromTerminalId' | 'toTerminalId'>) =>
  NATIVE_SIGNAL_TERMINALS.includes(w.fromTerminalId) || NATIVE_SIGNAL_TERMINALS.includes(w.toTerminalId)

/**
 * Programa e tags do LOGO! nativo tal como a app os abre: num projeto já gravado, `plcPrograms[PLC]`
 * e `plcTags[PLC]` têm prioridade sobre `ladder`/`tags` (ver loadJSON). As migrações leem e escrevem aqui.
 */
export function nativeProgramOf(content: Record<string, any>): { rungs: LadderRung[]; tags: Built['tags'] } {
  const program = content.plcPrograms?.[NATIVE_PLC_ID]
  return {
    rungs: Array.isArray(program?.rungs) ? program.rungs : Array.isArray(content.ladder?.rungs) ? content.ladder.rungs : [],
    tags: Array.isArray(content.plcTags?.[NATIVE_PLC_ID]) ? content.plcTags[NATIVE_PLC_ID] : Array.isArray(content.tags) ? content.tags : [],
  }
}
export function withNativeProgram<T extends Record<string, any>>(content: T, change: { rungs?: LadderRung[]; tags?: Built['tags'] }): T {
  const next: Record<string, any> = { ...content }
  if (change.rungs) {
    next.ladder = { ...(content.ladder ?? {}), rungs: change.rungs }
    if (content.plcPrograms?.[NATIVE_PLC_ID]) next.plcPrograms = { ...content.plcPrograms, [NATIVE_PLC_ID]: { ...content.plcPrograms[NATIVE_PLC_ID], rungs: change.rungs } }
  }
  if (change.tags) {
    next.tags = change.tags
    if (Array.isArray(content.plcTags?.[NATIVE_PLC_ID])) next.plcTags = { ...content.plcTags, [NATIVE_PLC_ID]: change.tags }
  }
  return next as T
}

/** Cabos do sinal do F1 (I0.3) e do H3 (Q0.3), pela ordem da semente. */
export const NATIVE_SIGNAL_WIRES = (psu: ElectricalComponent, f1: ElectricalComponent, plc: ElectricalComponent, h3: ElectricalComponent, h2: ElectricalComponent): Array<[ElectricalComponent, string, ElectricalComponent, string, WireColor]> => [
  [psu, '+V2', f1, '97', 'red'],
  [f1, '98', plc, 'I0.3', 'violet'],
  [plc, 'Q0.2', plc, 'Q0.3', 'red'],
  [plc, 'Q0.3·2', h3, 'X1', 'orange'],
  [h3, 'X2', h2, 'X2', 'blue'],
]
const NATIVE_FC_GRAFCET_ID = 'native-fc-grafcet'
const NATIVE_FC_OUTPUTS_ID = 'native-fc-outputs'
const NATIVE_OB100_ID = 'native-ob100'

/** Identificador estável — não muda entre deploys. */
export { NATIVE_PARTIDA_ID } from './nativeMotorMeter'
export const NATIVE_PARTIDA_NAME = 'Partida direta com emergência (nativo)'
/** Comentários e textos livres (GRAFCET + canvas 3D) com tags de E/S e funcionamento. */
/** v2: posições organizadas + notas em schematic/3d/grafcet/commands. */
export const NATIVE_ANNOTATIONS_FEATURE = 'native-annotations-v2'

const ADMIN_OWNER = 'dcsimu-admin'

type Built = {
  components: ElectricalComponent[]
  wires: Wire[]
  ladder: { rungs: LadderRung[] }
  grafcet: GrafcetProgram
  tags: Array<{ id: string; address: string; name: string; dataType: string; comment: string }>
  projectKind: 'all'
  projectFiles: Record<string, ProjectFile[]>
  activePlcId: string
}

function term(comp: ElectricalComponent, label: string): string {
  const t = comp.terminals.find((item) => item.label === label)
  if (!t) throw new Error(`Borne ${comp.ref}.${label} em falta no projeto nativo`)
  return t.id
}

function wire(from: string, to: string, color: WireColor, number: string): Wire {
  return {
    id: nanoid(8),
    fromTerminalId: from,
    toTerminalId: to,
    color,
    gauge: '1.5mm²',
    kind: 'control',
    flexibility: 'rigid',
    endType: 'ferrule',
    fromEndType: 'ferrule',
    toEndType: 'ferrule',
    fromEndLayer: 'back',
    toEndLayer: 'back',
    route: 'orthogonal',
    bend: 0.5,
    curveOffset: 0,
    number,
    energized: false,
  }
}

import { nativeEstrelaKs1Content, NATIVE_ESTRELA_KS1_ID, NATIVE_ESTRELA_KS1_NAME } from './nativeEstrelaKs1'
export { NATIVE_ESTRELA_KS1_ID, NATIVE_ESTRELA_KS1_NAME } from './nativeEstrelaKs1'

export function buildNativeGrafcet(): GrafcetProgram {
  const s0 = 'native-s0'
  const s1 = 'native-s1'
  const steps: GrafcetStep[] = [
    {
      id: s0,
      name: '0',
      initial: true,
      stepType: 'initial',
      action: '',
      condition: '',
      description: 'Parado / reset completo',
      actions: [
        // Parado sem falha → H2 laranja; emergência premida ou F1 disparado → H3 vermelho.
        { id: nanoid(6), address: 'Q0.2', variable: 'H2', description: 'H2 PARADO', condition: 'I0.0*!I0.3', kind: 'N', displayDescription: true },
        { id: nanoid(6), address: 'Q0.3', variable: 'H3', description: 'H3 EMERGÊNCIA', condition: '!I0.0+I0.3', kind: 'N', displayDescription: true },
      ],
    },
    {
      id: s1,
      name: '1',
      initial: false,
      stepType: 'simple',
      action: '',
      condition: '',
      description: 'Marcha',
      actions: [
        { id: nanoid(6), address: 'Q0.0', variable: 'KM1', description: 'KM1', condition: '1', kind: 'N', displayDescription: true },
        { id: nanoid(6), address: 'Q0.1', variable: 'H1', description: 'H1 MARCHA', condition: '1', kind: 'N', displayDescription: true },
      ],
    },
  ]
  // Modo complete reset: emergência (I0.0), STOP (I0.2) ou disparo do relé térmico F1 (I0.3, 97-98)
  // devolve sempre a X0; arranque só com emergência e STOP libertados, F1 armado + START.
  const transitions: GrafcetTransition[] = [
    {
      id: 'native-t1',
      name: 'T1',
      from: [s0],
      to: [s1],
      condition: 'I0.0*I0.2*!I0.3*I0.1',
      description: 'Emergência OK · STOP OK · F1 armado · START',
    },
    {
      id: 'native-t2',
      name: 'T2',
      from: [s1],
      to: [s0],
      condition: '!I0.0+!I0.2+I0.3',
      description: 'Emergência, STOP ou F1 disparado (reset completo)',
    },
  ]
  const pos = autoLayout(steps, transitions)
  return {
    name: 'Partida direta com emergência',
    steps: steps.map((step) => {
      const at = pos.get(step.id)
      return at ? { ...step, x: at.x, y: at.y, pinned: true } : step
    }),
    transitions: transitions.map((tr, index) => ({
      ...tr,
      x: SPINE_X,
      y: index === 0 ? START_Y + STEP_H + 28 : START_Y + STEP_H + 28 + 140,
    })),
    comments: [
      // Título acima da sequência (à esquerda, sem cruzar as caixas de ação)
      {
        id: 'native-gc-title',
        text: 'Partida direta com selo + cogumelo (B0) — reset completo',
        x: 40,
        y: 28,
        fontSize: 14,
        fontWeight: '700',
        color: '#0f172a',
      },
      // Bloco de legenda à direita da sequência (fora das ações H2/H3/KM1/H1)
      {
        id: 'native-gc-cycle',
        text: 'Ciclo: START → marcha (KM1+H1) → STOP / emergência / F1 → parado.',
        x: 420,
        y: 70,
        fontSize: 12,
        fontWeight: '600',
        color: '#0f172a',
      },
      {
        id: 'native-gc-in',
        text: 'Entradas: I0.0 EMERG (B0 NF) · I0.1 START · I0.2 STOP (NF) · I0.3 F1 (97-98 NA)',
        x: 420,
        y: 94,
        fontSize: 11,
        color: '#334155',
      },
      {
        id: 'native-gc-out',
        text: 'Saídas: Q0.0 KM1 · Q0.1 H1 MARCHA · Q0.2 H2 PARADO · Q0.3 H3 EMERGÊNCIA',
        x: 420,
        y: 114,
        fontSize: 11,
        color: '#334155',
      },
      {
        id: 'native-gc-x0',
        text: 'X0 parado: H2 se emergência OK e F1 armado; H3 se emergência ou F1',
        x: 420,
        y: 146,
        fontSize: 11,
        color: '#475569',
      },
      {
        id: 'native-gc-t1',
        text: 'T1 arranque: EMERG OK · STOP OK · F1 armado · START',
        x: 420,
        y: 166,
        fontSize: 11,
        color: '#475569',
      },
      {
        id: 'native-gc-x1',
        text: 'X1 marcha: KM1 e H1 ativos até paragem',
        x: 420,
        y: 186,
        fontSize: 11,
        color: '#475569',
      },
      {
        id: 'native-gc-t2',
        text: 'T2 reset: emergência, STOP ou F1 → sempre X0',
        x: 420,
        y: 206,
        fontSize: 11,
        color: '#475569',
      },
    ],
  }
}

/**
 * Ladder no método «registo de etapa» (complete restart + MOVE), gerado exatamente como o
 * «Gerar/Atualizar Ladder» do GRAFCET (ladderSync.ts · plan): mesmos nomes de blocos
 * («Grafcet [FC 1]», «Outputs [FC 2]», «Complete restart [OB 100]») e as mesmas networks de CALL.
 * Assim o GRAFCET reconhece o Ladder nativo como sincronizado e a atualização automática não o
 * troca pelo método dos bits de etapa (o que deixava dois OB100 e as saídas do LOGO! paradas).
 *   OB100 Complete restart → MOVE etapa inicial → G0
 *   FC Grafcet             → transições com MOVE destino → G0
 *   FC Outputs             → comparações G0 == etapa → bobinas
 *   Main [OB1]             → CALL Grafcet; CALL Outputs
 */
/**
 * Enriquece títulos e comentários das networks geradas pelo método «registo de etapa»
 * com a semântica do projeto nativo (EMERG, START, STOP, F1, KM1, H1/H2/H3).
 */
/**
 * Comentários explicativos nas networks nativas (tags E/S e funcionamento). Os títulos ficam os do
 * gerador do GRAFCET («GRAFCET · Chamar Grafcet», «T1: 0 → 1», «Complete restart · …»): é por eles que o
 * GRAFCET reconhece o Ladder como gerado e sincronizado — com títulos próprios via-o como «sem Ladder»
 * e um «Gerar Ladder» duplicava os blocos. A comparação de sincronização ignora os comentários.
 */
function annotateNativeRungs(rungs: LadderRung[]): LadderRung[] {
  // Os comentários vêm do próprio gerador (descrições das transições e ações do GRAFCET nativo): assim o
  // Ladder continua igual ao que o GRAFCET gera e fica reconhecido como sincronizado.
  return rungs
}


export function buildNativeWordProgram(grafcet: GrafcetProgram, baseTags: Built['tags']) {
  const full = { ...grafcet, transitions: transitionsOf(grafcet) }
  const word = grafcetToLadderWord(full, {
    reserved: baseTags.map((t) => t.address),
    tags: baseTags as LadderTag[],
    name: grafcet.name,
  })
  const fcIds: Record<string, string> = { [WORD_FC_GRAFCET]: NATIVE_FC_GRAFCET_ID, [WORD_FC_OUTPUTS]: NATIVE_FC_OUTPUTS_ID }
  const grafcetRungs = annotateNativeRungs(word.grafcetRungs)
  const outputRungs = annotateNativeRungs(word.outputRungs)
  const startupRungs = annotateNativeRungs(word.startupRungs)
  const blocks = [{ label: WORD_FC_GRAFCET, rungs: grafcetRungs }, { label: WORD_FC_OUTPUTS, rungs: outputRungs }].filter((b) => b.rungs.length)
  // Mesma forma (e ordem de campos) que o CALL criado pelo gerador do GRAFCET.
  const mainRungs: LadderRung[] = annotateNativeRungs(blocks.map((b) => ({
    id: `native-main-call-${b.label.toLowerCase()}`,
    name: `GRAFCET · Chamar ${b.label}`,
    branches: [{ id: `native-main-b-${b.label.toLowerCase()}`, elements: [] }],
    coils: [],
    enabled: true,
    call: { targetId: fcIds[b.label] },
  })))
  const now = new Date().toISOString()
  const files: ProjectFile[] = [
    ...blocks.map((b, i) => ({
      id: fcIds[b.label],
      folder: 'programBlocks' as const,
      name: blockDisplayName('FC', b.label, i + 1),
      content: '',
      rungs: b.rungs,
      createdAt: now,
      updatedAt: now,
    })),
    {
      id: NATIVE_OB100_ID,
      folder: 'programBlocks',
      name: blockDisplayName('OB', 'Complete restart', 100),
      content: '',
      rungs: startupRungs,
      exec: 'obStartup',
      createdAt: now,
      updatedAt: now,
    },
  ]
  const tags = [...baseTags]
  for (const t of word.tags) {
    if (tags.some((x) => x.address.toUpperCase() === t.address.toUpperCase())) continue
    tags.push({
      id: `t-${t.address}`,
      address: t.address,
      name: t.name,
      dataType: /^%?(MW|[IQ]W)/i.test(t.address) ? 'Int' : 'Bool',
      comment: t.comment || (/^%?MW/i.test(t.address) ? WORD_REGISTER_COMMENT : ''),
    })
  }
  return { mainRungs, files, tags, warnings: word.warnings }
}

/** Ladder da Main [OB1] do projeto nativo (CALL Grafcet + CALL Outputs).
 *  Mantido para a landing / publish quando o content ainda não traz networks. */
export function buildNativeLadder(): LadderRung[] {
  const grafcet = buildNativeGrafcet()
  const baseTags: Built['tags'] = [
    { id: 't1', address: 'I0.0', name: 'EMERG', dataType: 'Bool', comment: '' },
    { id: 't2', address: 'I0.1', name: 'START', dataType: 'Bool', comment: '' },
    { id: 't3', address: 'I0.2', name: 'STOP', dataType: 'Bool', comment: '' },
    { id: 't4', address: 'Q0.0', name: 'KM1', dataType: 'Bool', comment: '' },
    { id: 't5', address: 'Q0.1', name: 'H1', dataType: 'Bool', comment: '' },
    { id: 't6', address: 'Q0.2', name: 'H2', dataType: 'Bool', comment: '' },
    { id: 't7', address: 'I0.3', name: 'F1', dataType: 'Bool', comment: '' },
    { id: 't8', address: 'Q0.3', name: 'H3', dataType: 'Bool', comment: '' },
  ]
  return buildNativeWordProgram(grafcet, baseTags).mainRungs
}

/** Monta o conteúdo completo do projeto nativo (esquema + 3D + Ladder + GRAFCET). */
export function buildNativePartidaDireta(): Built {
  const place = (type: Parameters<typeof createComponent>[0], id: string, ref: string, label: string, x: number, y: number) => {
    const c = createComponent(type, ref, label)
    c.id = id
    c.schematicX = Math.round(panelToSchematicX(x) - c.w / 2)
    c.schematicY = Math.round(panelToSchematicY(y) - c.h / 2)
    c.terminals = c.terminals.map(t => ({ ...t, componentId: id, id: `${id}-${t.label}` }))
    return c
  }
  /*
   * Layout por grupos (revisão organização cabos/elementos):
   *  · FORÇA (esquerda da calha): XG → QG → QM1 → KM1  — potência trifásica
   *  · COMANDO (direita da calha): Q0 → PS1 → PLC       — alimentação 24 V e lógica
   *  · OPERADORES (fila superior): B0 · B1 · H1 · H2    — botoeira e sinalização
   *  · MOTOR + multímetro à direita, fora da calha
   * Cabos de força 2,5 mm²; comando 1,5 mm². Camadas back para preferir traçado por trás.
   */
  const RAIL_Y = 0.35
  const OPS_Y = 1.95
  // —— Grupo força (espaçamento generoso para cabos não cruzarem faces) ——
  const source = place('powerSource3ph', 'native-source', 'XG', 'Entrada L1/L2/L3/N/PE', -3.05, RAIL_Y)
  const main = place('breaker3p', 'native-qg', 'QG', 'Disjuntor geral', -2.25, RAIL_Y)
  const qm = place('motorBreakerPkzmC10', 'native-qm1', 'QM1', 'Disjuntor-motor PKZM', -1.35, RAIL_Y)
  qm.state.closed = true
  const km = place('contactorWegCWC09', 'native-km1', 'KM1', 'Contactor KM1', -0.45, RAIL_Y)
  // Relé térmico Siemens 3RU1116 (1,1–1,6 A, adequado ao DRN80 0,55 kW ≈ 1,4 A) encaixado por baixo
  // do KM1: os pinos 1L1/3L2/5L3 entram nos bornes 2T1/4T2/6T3 (sem cabos); F1 → M1 e o 95-96 em
  // série com a bobina do KM1 (o disparo corta o contactor).
  const f1 = place('thermalRelaySiemens3ru1116', NATIVE_F1_ID, 'F1', 'Relé térmico 3RU1116', -0.45, RAIL_Y - 0.8)
  Object.assign(f1, mountPosition(f1, km) ?? {}, { mountedOn: km.id })
  // —— Grupo comando (à direita, separado da força) ——
  const control = place('breaker2p', 'native-q0', 'Q0', 'Proteção do comando', 0.55, RAIL_Y)
  const psu = place('powerSupplyProauto24A', 'native-psu', 'PS1', 'Fonte 24 V', 1.25, RAIL_Y)
  // EMERG e STOP são NF: os botões de simulação começam fechados (1) e premidos cortam o sinal.
  const plc = withNativeNcSimInputs(place('plcSiemensLogo1224RC', 'native-plc', 'PLC1', 'LOGO! 12/24RC', 2.15, RAIL_Y))
  // Calha cobre força + comando
  const rail = place('dinRail15x55', 'native-rail', 'TR1', 'Calha DIN', -0.4, RAIL_Y)
  rail.state.lengthMm = 620
  rail.w = 930
  rail.schematicX = Math.round(panelToSchematicX(-0.4) - rail.w / 2)
  // —— Operadores (fila superior, alinhados e espaçados) ——
  const emerg = place('emergencyButton', 'native-emerg', 'B0', 'Emergência', -2.55, OPS_Y)
  const push = place('dualPushButtonNpb22D11', 'native-push', 'B1', 'START/STOP', -1.45, OPS_Y)
  const green = place('pilotLightAd22', 'native-h1', 'H1', 'MARCHA', -0.45, OPS_Y)
  green.state.color = '#22c55e'
  // H2 PARADO laranja e H3 EMERGÊNCIA vermelho (emergência premida ou F1 disparado).
  const red = place('pilotLightAd22', 'native-h2', 'H2', 'PARADO', 0.35, OPS_Y)
  red.state.color = NATIVE_H2_COLOR
  const alarm = place('pilotLightAd22', NATIVE_H3_ID, 'H3', 'EMERGÊNCIA', 1.15, OPS_Y)
  alarm.state.color = '#ef4444'
  // —— Motor + multímetro ——
  const motor = place('motor3ph', 'native-m1', 'M1', 'Motor SEW 3~', 3.7, -1.35)
  let wires: Wire[] = []
  const add = (a: ElectricalComponent, al: string, b: ElectricalComponent, bl: string, color: WireColor, power = false) => {
    const next = wire(term(a, al), term(b, bl), color, `W${wires.length + 1}`)
    next.id = `native-wire-${wires.length + 1}`
    if (color === 'green-yellow') {
      // Verde-amarelo é condutor de proteção: tipo próprio, não «força» nem «comando».
      // Com `power`/`control` o diagnóstico acusava — bem — fase/potência num borne PE.
      next.kind = 'earth'
      next.gauge = power ? '2.5mm²' : '1.5mm²'
      next.flexibility = 'rigid'
    } else if (power) {
      next.kind = 'power'
      next.gauge = '2.5mm²'
      next.flexibility = 'rigid'
    } else {
      next.kind = 'control'
      next.gauge = '1.5mm²'
      next.flexibility = 'rigid'
    }
    // Preferir saída/chegada pela face traseira (calha / canaletas) para não cobrir a frente dos aparelhos.
    next.fromEndLayer = 'back'
    next.toEndLayer = 'back'
    next.route = 'manhattan'
    next.bend = 0.15
    // Bornes do motor: olhal sob a porca (não ponteira tubular).
    if (a.type === 'motor3ph') next.fromEndType = 'ring'
    if (b.type === 'motor3ph') next.toEndType = 'ring'
    wires.push(next)
  }
  // Cadeia de força L1/L2/L3 (2,5 mm²)
  for (const [phase, input, output, poleIn, poleOut, motorIn, color] of [
    ['L1', '1', '2', '1L1', '2T1', 'U1', 'black'],
    ['L2', '3', '4', '3L2', '4T2', 'V1', 'brown'],
    ['L3', '5', '6', '5L3', '6T3', 'W1', 'grey'],
  ] as const) {
    add(source, phase, main, input, color, true)
    add(main, output, qm, input, color, true)
    add(qm, output, km, poleIn, color, true)
    add(km, poleOut, f1, poleIn, color, true)
  }
  // Alimentação do comando a partir de QG (1,5 mm²)
  add(main, '2', control, '1', 'black')
  add(source, 'N', control, '3', 'blue')
  add(control, '2', psu, 'L', 'black')
  add(control, '4', psu, 'N', 'blue')
  add(source, 'PE', psu, 'PE', 'green-yellow')
  add(source, 'PE', motor, 'PE', 'green-yellow', true)
  // 24 V PLC e comando
  add(psu, '+V1', plc, 'L+', 'red')
  add(psu, '-V1', plc, 'M', 'blue')
  // +24 V comando em ponte local: PS1.+V2 → B0.21 → B1.13 → B1.21
  add(psu, '+V2', emerg, '21', 'red')
  add(emerg, '21', push, '13', 'red')
  add(push, '13', push, '21', 'red')
  // Entradas PLC
  add(emerg, '22', plc, 'I0.0', 'violet')
  add(push, '14', plc, 'I0.1', 'violet')
  add(push, '22', plc, 'I0.2', 'violet')
  // +24 V nas saídas de relé dos sinalizadores (ponte local): PS1.+V1 → Q0.1 → Q0.2
  add(psu, '+V1', plc, 'Q0.1', 'red')
  add(plc, 'Q0.1', plc, 'Q0.2', 'red')
  // Bobina do contactor WEG CWC09 é AC (ficha 42 V 50 Hz): quem a comuta é o contacto de
  // relé Q1 do LOGO!, alimentado pela fase do comando (Q0.2, 230 V AC) e fechado pelo neutro.
  // Uma bobina AC pendurada no 0 V DC da PS1 era um erro elétrico — e o diagnóstico dizia-o.
  add(control, '2', plc, 'Q0.0', 'black')
  add(plc, 'Q0.0·2', f1, '95', 'orange')
  add(plc, 'Q0.1·2', green, 'X1', 'orange')
  add(plc, 'Q0.2·2', red, 'X1', 'orange')
  // Retorno 0 V dos sinalizadores: H2 → H1 → PS1
  add(red, 'X2', green, 'X2', 'blue')
  add(green, 'X2', psu, '-V2', 'blue')
  // Retorno da bobina: neutro do mesmo disjuntor que alimenta a fase do comando (Q0.4)
  // Com o F1 encaixado, o A2 do KM1 fica tapado: liga-se pela passagem A2 do relé.
  add(f1, 'A2', control, '4', 'blue')
  // Relé térmico: saídas para o motor e retorno do 95-96 para a bobina (acrescentados no fim).
  for (const [output, motorIn, color] of [['2T1', 'U1', 'black'], ['4T2', 'V1', 'brown'], ['6T3', 'W1', 'grey']] as const) add(f1, output, motor, motorIn, color, true)
  add(f1, '96', km, 'A1', 'orange')
  // Sinalização da falha e da emergência (no fim, para não renumerar os cabos anteriores):
  //  · +24 V → 97-98 do F1 (NA, fecha no disparo) → I0.3;
  //  · +24 V em ponte Q0.2 → Q0.3, Q0.3 → H3 e retorno H3 → H2.
  for (const [a, al, b, bl, color] of NATIVE_SIGNAL_WIRES(psu, f1, plc, alarm, red)) add(a, al, b, bl, color)
  const { meter, leads } = buildNativeMotorMeter(motor)
  wires.push(...leads)
  // Ordem visual: calha → força → comando → operadores → motor → multímetro
  const components = [rail, source, main, qm, km, f1, control, psu, plc, emerg, push, green, red, alarm, motor, meter]
  const baseTags: Built['tags'] = [
    { id: 't1', address: 'I0.0', name: 'EMERG', dataType: 'Bool', comment: 'B0 cogumelo NF — 1 em repouso, 0 premido' },
    { id: 't2', address: 'I0.1', name: 'START', dataType: 'Bool', comment: 'B1 START (NA)' },
    { id: 't3', address: 'I0.2', name: 'STOP', dataType: 'Bool', comment: 'B1 STOP (NF) — 1 em repouso' },
    { id: 't4', address: 'Q0.0', name: 'KM1', dataType: 'Bool', comment: 'Contactor / bobina K1' },
    { id: 't5', address: 'Q0.1', name: 'H1', dataType: 'Bool', comment: 'Lâmpada marcha (verde)' },
    { id: 't6', address: 'Q0.2', name: 'H2', dataType: 'Bool', comment: 'Lâmpada parado (laranja)' },
    { id: 't7', address: 'I0.3', name: 'F1', dataType: 'Bool', comment: 'Relé térmico F1 disparado (97-98 NA) — 1 em falha' },
    { id: 't8', address: 'Q0.3', name: 'H3', dataType: 'Bool', comment: 'Lâmpada emergência / falha (vermelha)' },
  ]
  const grafcet = buildNativeGrafcet()
  const wordProgram = buildNativeWordProgram(grafcet, baseTags)
  // Encaixe direto: os cabos KM1 → F1 saem (os ids dos restantes mantêm-se).
  wires = wires.filter((w) => !NATIVE_F1_MOUNT_WIRES.includes(w.id))
  wires = syncSharedTerminalFerrules(withMotorMeterFerrules(wires, leads))
  return {
    components,
    // Traçado cozido na semente: cada cabo contorna os equipamentos e aplica
    // ponteiras duplas DIN 46228-4 em todos os bornes partilhados.
    wires: bakeNativeRouting(components, wires),
    ladder: { rungs: wordProgram.mainRungs },
    grafcet,
    tags: wordProgram.tags,
    projectKind: 'all',
    projectFiles: { [NATIVE_PLC_ID]: wordProgram.files },
    activePlcId: NATIVE_PLC_ID,
  }
}

/** Conteúdo no formato `saveJSON` / `loadJSON` do simulador. */
export function nativePartidaDiretaContent(): Record<string, unknown> {
  const built = buildNativePartidaDireta()
  return {
    app: 'dc-simu',
    version: 6,
    projectKind: built.projectKind,
    nativeId: NATIVE_PARTIDA_ID,
    nativeFeatures: [NATIVE_MOTOR_METER_FEATURE, NATIVE_MOTOR_DOUBLE_FERRULE_FEATURE, NATIVE_MOTOR_RING_FEATURE, NATIVE_NC_SIM_FEATURE, NATIVE_WIRE_CURVES_FEATURE, NATIVE_IEC_FEATURE, NATIVE_IEC_V2_FEATURE, NATIVE_IEC_V3_FEATURE, NATIVE_THERMAL_FEATURE, NATIVE_THERMAL_MOUNT_FEATURE, NATIVE_COIL_AC_FEATURE, NATIVE_IEC_V4_FEATURE, NATIVE_SIGNALS_FEATURE, NATIVE_IEC_V5_FEATURE, NATIVE_IEC_V6_FEATURE, NATIVE_IEC_V7_FEATURE, NATIVE_ANNOTATIONS_FEATURE, 'ladder-sync-v4'],
    savedAt: new Date().toISOString(),
    components: built.components,
    wires: built.wires,
    ladder: built.ladder,
    fcBlocks: { fc1: [], fc2: [] },
    fcAdded: { fc1: false, fc2: false },
    activePlcId: built.activePlcId,
    plcPrograms: {},
    plcTags: {},
    projectFiles: built.projectFiles,
    hiddenProjectFolders: {},
    projectFolderLabels: {},
    fcNames: {
      fc1: WORD_FC_GRAFCET,
      fc2: WORD_FC_OUTPUTS,
    },
    grafcet: built.grafcet,
    // Esquema IEC (simulador de comandos) com as referências do quadro 3D.
    commands: buildNativeIecSchematic(),
    tags: built.tags,
    // Notas adesivas e textos livres: schematic/3d (coords do painel em m), grafcet e commands.
    canvasNotes: (() => {
      const at = new Date().toISOString()
      const msg = (id: string, text: string) => ({ id, text, author: 'DC-SIMU', createdAt: at })
      const note = (
        id: string,
        title: string,
        view: 'schematic' | '3d' | 'grafcet' | 'commands',
        x: number,
        y: number,
        color: string,
        body: string,
        z?: number,
      ) => ({
        id, text: title, view, x, y, z, color,
        messages: [msg(`${id}-m0`, body)],
        createdAt: at,
      })
      // Posições 3D/esquemático: à direita do quadro (x≈2.8…3.2, y≈2.1…1.4).
      const panel = [
        note('native-n3d-func', 'Como testar', '3d', 2.85, 2.15, '#fde68a',
          '1) EMERG e STOP libertados, F1 armado.\n2) Premir START → KM1 + H1 (marcha).\n3) STOP, emergência ou disparo F1 → volta a parado (H2 ou H3).', 0.35),
        note('native-n3d-io', 'Tags E/S', '3d', 2.85, 1.55, '#93c5fd',
          'I0.0 EMERG (B0 NF) · I0.1 START · I0.2 STOP (NF) · I0.3 F1\nQ0.0 KM1 · Q0.1 H1 MARCHA · Q0.2 H2 PARADO · Q0.3 H3 EMERGÊNCIA', 0.35),
        note('native-nsch-func', 'Como testar', 'schematic', 2.85, 2.15, '#fde68a',
          '1) EMERG e STOP libertados, F1 armado.\n2) Premir START → KM1 + H1 (marcha).\n3) STOP, emergência ou disparo F1 → volta a parado (H2 ou H3).', 0.35),
        note('native-nsch-io', 'Tags E/S', 'schematic', 2.85, 1.55, '#93c5fd',
          'I0.0 EMERG (B0 NF) · I0.1 START · I0.2 STOP (NF) · I0.3 F1\nQ0.0 KM1 · Q0.1 H1 MARCHA · Q0.2 H2 PARADO · Q0.3 H3 EMERGÊNCIA', 0.35),
        // GRAFCET (px do diagrama, à direita da sequência)
        note('native-ng-test', 'Como testar', 'grafcet', 420, 280, '#fde68a',
          'Repouso: I0.0=1, I0.2=1, I0.3=0.\nPremir START (I0.1) → etapa 1 (KM1+H1).\nSTOP ou emergência ou F1 → etapa 0.'),
        note('native-ng-io', 'Tags E/S', 'grafcet', 420, 380, '#93c5fd',
          'Entradas: I0.0 EMERG · I0.1 START · I0.2 STOP · I0.3 F1\nSaídas: Q0.0 KM1 · Q0.1 H1 · Q0.2 H2 · Q0.3 H3'),
        // IEC / commands (coords do desenho IEC, página Comando)
        note('native-niec-test', 'Como testar', 'commands', 820, 320, '#fde68a',
          'Em RUN: entradas I0.x e saídas Q0.x seguem o LOGO!.\nSTART + EMERG OK + STOP OK + F1 armado → marcha.\nSTOP, emergência ou F1 → reset a parado.', undefined),
        note('native-niec-io', 'Tags E/S', 'commands', 820, 420, '#86efac',
          'I0.0 EMERG B0 NF · I0.1 START · I0.2 STOP NF · I0.3 F1 97-98\nQ0.0 KM1 · Q0.1 H1 · Q0.2 H2 · Q0.3 H3', undefined),
      ]
      return panel
    })(),
    canvasTexts: (() => {
      const at = new Date().toISOString()
      const text = (
        id: string,
        view: '3d' | 'schematic',
        value: string,
        x: number,
        y: number,
        size: number,
        bold?: boolean,
      ) => ({
        id, view, text: value, x, y, z: 0.35, font: 'sans' as const, size,
        color: bold ? '#0f172a' : '#334155', bold: !!bold, createdAt: at,
      })
      return [
        text('native-txt3d-title', '3d', 'Partida direta com emergência', -2.8, 2.35, 18, true),
        text('native-txt3d-force', '3d', 'Força: XG → QG → QM1 → KM1 → F1 → M1', -2.8, 2.15, 12),
        text('native-txtsch-title', 'schematic', 'Partida direta com emergência', -2.8, 2.35, 18, true),
        text('native-txtsch-force', 'schematic', 'Força: XG → QG → QM1 → KM1 → F1 → M1', -2.8, 2.15, 12),
      ]
    })(),
    virtualInputs: {},
    virtualInputModes: {},
    virtualInputCount: 8,
    virtualOutputCount: 8,
    virtualMemoryCount: 4,
  }
}

export type NativeProjectSeed = {
  id: string
  name: string
  ownerId: string
  memberIds: string[]
  content: Record<string, unknown>
  revision: number
  updatedAt: string
  /** Marca projetos embutidos no código. */
  nativeId: string
}

/** Semente a inserir no backend local se ainda não existir. */

/**
 * Projetos nativos sem native-annotations-v2: recebem comentários GRAFCET organizados,
 * canvasNotes (schematic/3d/grafcet/commands) e canvasTexts no painel.
 * Substitui só ids `native-*`; preserva notas/textos criados pelo utilizador.
 */
export function addNativeAnnotations<T extends Record<string, any>>(content: T): T {
  if (content.nativeId !== NATIVE_PARTIDA_ID) return content
  const features: string[] = Array.isArray(content.nativeFeatures)
    ? content.nativeFeatures.filter((v: unknown) => typeof v === 'string')
    : []
  if (features.includes(NATIVE_ANNOTATIONS_FEATURE)) return content
  const fresh = nativePartidaDiretaContent()
  const isNativeId = (id: unknown) => typeof id === 'string' && id.startsWith('native-')
  const userNotes = Array.isArray(content.canvasNotes)
    ? content.canvasNotes.filter((n: any) => n && !isNativeId(n.id))
    : []
  const userTexts = Array.isArray(content.canvasTexts)
    ? content.canvasTexts.filter((t: any) => t && !isNativeId(t.id))
    : []
  const grafcet = content.grafcet && typeof content.grafcet === 'object'
    ? {
        ...content.grafcet,
        // Substitui comentários gerados (ids native-gc-* ou o título antigo único).
        comments: (fresh.grafcet as any)?.comments ?? content.grafcet.comments,
      }
    : fresh.grafcet
  return {
    ...content,
    grafcet,
    canvasNotes: [...userNotes, ...((fresh.canvasNotes as any[]) ?? [])],
    canvasTexts: [...userTexts, ...((fresh.canvasTexts as any[]) ?? [])],
    nativeFeatures: [
      ...features.filter((f) => f !== 'native-annotations-v1'),
      NATIVE_ANNOTATIONS_FEATURE,
    ],
  }
}

/** Nomes simbólicos alinhados com as tags do projeto nativo (para a landing). */
export const NATIVE_DEMO_NAMES: Record<string, string> = {
  'I0.0': 'EMERG',
  'I0.1': 'START',
  'I0.2': 'STOP',
  'Q0.0': 'KM1',
  'Q0.1': 'H1',
  'Q0.2': 'H2',
  'I0.3': 'F1',
  'Q0.3': 'H3',
}

/** Tabela online da landing: espelha o estado partilhado PLC/motor. */
export function nativeDemoTable(plcRunning: boolean, motorOn: boolean): Record<string, boolean> {
  const powered = plcRunning && motorOn
  const stopped = plcRunning && !motorOn
  return {
    // Entradas em repouso: emergência e STOP libertados (1), START solto (0)
    'I0.0': true,
    'I0.1': false,
    'I0.2': true,
    'I0.3': false,
    'Q0.0': powered,
    'Q0.1': powered,
    'Q0.2': stopped,
    'Q0.3': false,
  }
}

export function nativeProjectSeeds(): NativeProjectSeed[] {
  // Exemplos GRAFCET (básico, normal, avançado): projetos só GRAFCET, funcionais, com sinais, textos e comentários.
  const examples: NativeProjectSeed[] = grafcetExamples().map((example) => ({
    id: example.id,
    name: example.name,
    ownerId: ADMIN_OWNER,
    memberIds: [],
    content: grafcetExampleContent(example),
    revision: 0,
    updatedAt: new Date().toISOString(),
    nativeId: example.nativeId,
  }))
  return [
    {
      id: NATIVE_PARTIDA_ID,
      name: NATIVE_PARTIDA_NAME,
      ownerId: ADMIN_OWNER,
      memberIds: [],
      content: nativePartidaDiretaContent(),
      revision: 0,
      updatedAt: new Date().toISOString(),
      nativeId: NATIVE_PARTIDA_ID,
    },
    {
      id: NATIVE_ESTRELA_KS1_ID,
      name: NATIVE_ESTRELA_KS1_NAME,
      ownerId: ADMIN_OWNER,
      memberIds: [],
      content: nativeEstrelaKs1Content(),
      revision: 0,
      updatedAt: new Date().toISOString(),
      nativeId: NATIVE_ESTRELA_KS1_ID,
    },
    ...examples,
  ]
}
