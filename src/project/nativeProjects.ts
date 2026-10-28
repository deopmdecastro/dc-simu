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
import type { LadderRung } from '../types'
import type { GrafcetProgram, GrafcetStep, GrafcetTransition } from '../grafcet/engine'
import { autoLayout, SPINE_X, START_Y, STEP_H } from '../grafcet/layout'
import { nanoid } from 'nanoid'
import { panelToSchematicX, panelToSchematicY } from '../three/panelLayout'

/** Identificador estável — não muda entre deploys. */
export const NATIVE_PARTIDA_ID = 'native-partida-direta-v1'
export const NATIVE_PARTIDA_NAME = 'Partida direta (nativo)'

const ADMIN_OWNER = 'dcsimu-admin'

type Built = {
  components: ElectricalComponent[]
  wires: Wire[]
  ladder: { rungs: LadderRung[] }
  grafcet: GrafcetProgram
  tags: Array<{ id: string; address: string; name: string; dataType: string; comment: string }>
  projectKind: 'all'
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
    flexibility: 'flexible',
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
      description: 'Inicial',
      actions: [
        { id: nanoid(6), address: 'Q0.2', variable: 'H2', description: 'H2 PARADO', condition: '1', kind: 'N', displayDescription: true },
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
  const transitions: GrafcetTransition[] = [
    { id: 'native-t1', name: 'T1', from: [s0], to: [s1], condition: 'I0.0*I0.1', description: 'STOP fechado e START' },
    { id: 'native-t2', name: 'T2', from: [s1], to: [s0], condition: '!I0.0', description: 'STOP' },
  ]
  const pos = autoLayout(steps, transitions)
  return {
    name: 'Partida direta com selo',
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
      { id: nanoid(6), text: 'Partida direta com selo — projeto nativo', x: 40, y: 24, fontSize: 14, fontWeight: '700' },
    ],
  }
}

export function buildNativeLadder(): LadderRung[] {
  const contact = (id: string, address: string, contactType: 'NO' | 'NC') =>
    ({ kind: 'contact' as const, id, address, contactType })
  const coil = (id: string, address: string) =>
    ({ kind: 'coil' as const, id, address, coilType: 'COIL' as const })
  return [
    {
      id: 'native-n1',
      name: 'Partida direta com selo',
      comment: 'STOP + START + retenção de KM1',
      enabled: true,
      branches: [
        { id: 'n1a', elements: [contact('c1', 'I0.0', 'NO'), contact('c2', 'I0.1', 'NO')] },
        { id: 'n1b', elements: [contact('c1b', 'I0.0', 'NO'), contact('c3', 'Q0.0', 'NO')] },
      ],
      coils: [coil('k1', 'Q0.0')],
    },
    {
      id: 'native-n2',
      name: 'Sinalização de marcha',
      comment: 'Contacto NA de KM1 comanda H1',
      enabled: true,
      branches: [{ id: 'n2a', elements: [contact('c4', 'Q0.0', 'NO')] }],
      coils: [coil('k2', 'Q0.1')],
    },
    {
      id: 'native-n3',
      name: 'Sinalização de motor parado',
      comment: 'Contacto NF de KM1 comanda H2',
      enabled: true,
      branches: [{ id: 'n3a', elements: [contact('c5', 'Q0.0', 'NC')] }],
      coils: [coil('k3', 'Q0.2')],
    },
  ]
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
  const rail = place('dinRail15x55', 'native-rail', 'TR1', 'Calha DIN', -0.65, 0.35)
  rail.state.lengthMm = 500
  rail.w = 750
  rail.schematicX = Math.round(panelToSchematicX(-0.65) - rail.w / 2)
  const source = place('powerSource3ph', 'native-source', 'XG', 'Entrada L1/L2/L3/N/PE', -2.75, 0.35)
  const main = place('breaker3p', 'native-qg', 'QG', 'Disjuntor geral', -2.15, 0.35)
  const psu = place('powerSupplyProauto24A', 'native-psu', 'PS1', 'Fonte 24 V', -1.4, 0.35)
  const plc = place('plcSiemensLogo1224RC', 'native-plc', 'PLC1', 'LOGO! 12/24RC', -0.5, 0.35)
  const qm = place('motorBreakerPkzmC10', 'native-qm1', 'QM1', 'Disjuntor-motor PKZM', 0.25, 0.35)
  qm.state.closed = true
  const km = place('contactorWegCWC09', 'native-km1', 'KM1', 'Contactor KM1', 0.85, 0.35)
  const control = place('breaker2p', 'native-q0', 'Q0', 'Proteção do comando', 1.4, 0.35)
  const push = place('dualPushButtonNpb22D11', 'native-push', 'S1', 'START/STOP', -1.3, 1.7)
  const green = place('pilotLightAd22', 'native-h1', 'H1', 'MARCHA', -0.5, 1.7)
  green.state.color = '#22c55e'
  const red = place('pilotLightAd22', 'native-h2', 'H2', 'PARADO', 0.1, 1.7)
  red.state.color = '#ef4444'
  const motor = place('motor3ph', 'native-m1', 'M1', 'Motor SEW 3~', 1.0, -1.55)
  const wires: Wire[] = []
  const add = (a: ElectricalComponent, al: string, b: ElectricalComponent, bl: string, color: WireColor, power = false) => {
    const next = wire(term(a, al), term(b, bl), color, `W${wires.length + 1}`)
    next.id = `native-wire-${wires.length + 1}`
    if (power) { next.kind = 'power'; next.gauge = '2.5mm²' }
    wires.push(next)
  }
  for (const [phase, input, output, poleIn, poleOut, motorIn, color] of [
    ['L1','1','2','1L1','2T1','U1','black'],
    ['L2','3','4','3L2','4T2','V1','brown'],
    ['L3','5','6','5L3','6T3','W1','grey'],
  ] as const) {
    add(source, phase, main, input, color, true)
    add(main, output, qm, input, color, true)
    add(qm, output, km, poleIn, color, true)
    add(km, poleOut, motor, motorIn, color, true)
  }
  add(main, '2', control, '1', 'black')
  add(source, 'N', control, '3', 'blue')
  add(control, '2', psu, 'L', 'black')
  add(control, '4', psu, 'N', 'blue')
  add(source, 'PE', psu, 'PE', 'green-yellow')
  add(source, 'PE', motor, 'PE', 'green-yellow', true)
  add(psu, '+V1', plc, 'L+', 'red')
  add(psu, '-V1', plc, 'M', 'blue')
  add(psu, '+V2', push, '21', 'red')
  add(push, '22', plc, 'I0.0', 'violet')
  add(psu, '+V2', push, '13', 'red')
  add(push, '14', plc, 'I0.1', 'violet')
  for (const [output, target, positive, negative] of [
    ['Q0.0', km, 'A1', 'A2'], ['Q0.1', green, 'X1', 'X2'], ['Q0.2', red, 'X1', 'X2'],
  ] as const) {
    add(psu, '+V1', plc, output, 'red')
    add(plc, `${output}·2`, target, positive, 'orange')
    add(target, negative, psu, '-V2', 'blue')
  }
  return {
    components: [rail, source, main, psu, plc, qm, km, control, push, green, red, motor],
    wires, ladder: { rungs: buildNativeLadder() }, grafcet: buildNativeGrafcet(),
    tags: [
      { id:'t1',address:'I0.0',name:'STOP',dataType:'Bool',comment:'Contacto NF fechado em repouso' },
      { id:'t2',address:'I0.1',name:'START',dataType:'Bool',comment:'Botão START (NA)' },
      { id:'t3',address:'Q0.0',name:'KM1',dataType:'Bool',comment:'Contactor' },
      { id:'t4',address:'Q0.1',name:'H1',dataType:'Bool',comment:'Lâmpada marcha' },
      { id:'t5',address:'Q0.2',name:'H2',dataType:'Bool',comment:'Lâmpada parado' },
    ],
    projectKind: 'all',
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
    savedAt: new Date().toISOString(),
    components: built.components,
    wires: built.wires,
    ladder: built.ladder,
    fcBlocks: { fc1: [], fc2: [] },
    fcAdded: { fc1: false, fc2: false },
    activePlcId: null,
    plcPrograms: {},
    plcTags: {},
    projectFiles: {},
    hiddenProjectFolders: {},
    projectFolderLabels: {},
    fcNames: {},
    grafcet: built.grafcet,
    tags: built.tags,
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

/** Nomes simbólicos alinhados com as tags do projeto nativo (para a landing). */
export const NATIVE_DEMO_NAMES: Record<string, string> = {
  'I0.0': 'STOP',
  'I0.1': 'START',
  'Q0.0': 'KM1',
  'Q0.1': 'H1',
  'Q0.2': 'H2',
}

/** Tabela online da landing: espelha o estado partilhado PLC/motor. */
export function nativeDemoTable(plcRunning: boolean, motorOn: boolean): Record<string, boolean> {
  const powered = plcRunning && motorOn
  const stopped = plcRunning && !motorOn
  return {
    'I0.0': false,
    'I0.1': false,
    'Q0.0': powered,
    'Q0.1': powered,
    'Q0.2': stopped,
  }
}

export function nativeProjectSeeds(): NativeProjectSeed[] {
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
  ]
}
