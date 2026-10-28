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
  projectKind: 'full'
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

function buildGrafcet(): GrafcetProgram {
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
    { id: 'native-t1', name: 'T1', from: [s0], to: [s1], condition: 'I0.1', description: 'START' },
    { id: 'native-t2', name: 'T2', from: [s1], to: [s0], condition: 'I0.0', description: 'STOP' },
  ]
  const pos = autoLayout(steps, transitions)
  return {
    id: 'native-grafcet-partida',
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

function buildLadder(): LadderRung[] {
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
        { id: 'n1a', elements: [contact('c1', 'I0.0', 'NC'), contact('c2', 'I0.1', 'NO')] },
        { id: 'n1b', elements: [contact('c3', 'Q0.0', 'NO')] },
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
  // Calha DIN de suporte
  const rail = createComponent('dinRail15x55', 'TR1', 'Calha DIN', 0, 40, 200, { lengthMm: 350 })
  rail.id = 'native-rail'
  rail.railId = undefined

  const place = (
    type: Parameters<typeof createComponent>[0],
    ref: string,
    label: string,
    schematicX: number,
    schematicY: number,
    railOffsetMm: number,
    panel3D?: { x: number; y: number; z: number },
  ) => {
    const c = createComponent(type, ref, label, 0, schematicX, schematicY)
    c.railId = rail.id
    c.railOffsetMm = railOffsetMm
    if (panel3D) c.panel3DPosition = panel3D
    return c
  }

  const psu = place('powerSupplyProauto24A', 'PS1', 'Fonte 24 V', 60, 80, 10, { x: -2.4, y: 0.56, z: 0.34 })
  const push = place('dualPushButtonNpb22D11', 'S1', 'START/STOP', 200, 80, 55, { x: -1.9, y: 1.44, z: 0.38 })
  const green = place('pilotLightAd22', 'H1', 'H1 MARCHA', 280, 80, 95, { x: -1.4, y: 1.47, z: 0.4 })
  const red = place('pilotLightAd22', 'H2', 'H2 PARADO', 340, 80, 120, { x: -1.0, y: 1.47, z: 0.4 })
  const plc = place('plcSiemensLogo1224RC', 'PLC1', 'LOGO! 12/24RC', 420, 80, 160, { x: -0.4, y: 0.56, z: 0.34 })
  const breaker = place('breaker2p', 'Q0', 'Disjuntor 2P', 60, 280, 210, { x: 0.25, y: 0.58, z: 0.34 })
  const qm = place('motorBreakerPkzmC10', 'QM1', 'Disjuntor-motor PKZM', 160, 280, 250, { x: 0.75, y: 0.58, z: 0.34 })
  const km = place('contactorWegCWC09', 'KM1', 'Contactor KM1', 280, 280, 300, { x: 1.25, y: 0.58, z: 0.34 })
  const motor = place('motor3ph', 'M1', 'Motor 3~', 420, 280, 0, { x: 2.1, y: 0.5, z: 0.32 })
  motor.railId = undefined
  motor.railOffsetMm = undefined

  // IDs estáveis para o projeto nativo (cabos e reaberturas)
  psu.id = 'native-psu'
  push.id = 'native-push'
  green.id = 'native-h1'
  red.id = 'native-h2'
  plc.id = 'native-plc'
  breaker.id = 'native-q0'
  qm.id = 'native-qm1'
  km.id = 'native-km1'
  motor.id = 'native-m1'
  for (const c of [psu, push, green, red, plc, breaker, qm, km, motor, rail]) {
    c.terminals = c.terminals.map((t) => ({ ...t, componentId: c.id, id: `${c.id}-${t.label}` }))
  }

  const wires: Wire[] = []
  let n = 1
  const add = (a: ElectricalComponent, al: string, b: ElectricalComponent, bl: string, color: WireColor) => {
    try {
      wires.push(wire(term(a, al), term(b, bl), color, `W${n++}`))
    } catch {
      /* borne opcional em algum modelo */
    }
  }

  // Alimentação PLC
  add(psu, '+V1', plc, 'L+', 'red')
  add(psu, '-V1', plc, 'M', 'blue')
  // STOP / START → entradas
  add(psu, '+V2', push, '21', 'red')
  add(push, '22', plc, 'I0.0', 'violet')
  add(psu, '+V2', push, '13', 'red')
  add(push, '14', plc, 'I0.1', 'violet')
  // Saída Q0.0 → bobina KM1
  add(psu, '+V1', plc, 'Q0.0', 'red')
  add(plc, 'Q0.0·2', km, 'A1', 'orange')
  add(km, 'A2', psu, '-V2', 'blue')
  // H1 / H2
  add(psu, '+V1', plc, 'Q0.1', 'red')
  add(plc, 'Q0.1·2', green, 'X1', 'green')
  add(green, 'X2', psu, '-V1', 'blue')
  add(psu, '+V1', plc, 'Q0.2', 'red')
  add(plc, 'Q0.2·2', red, 'X1', 'red')
  add(red, 'X2', psu, '-V2', 'blue')
  // Potência motor (simplificado: contactor → motor)
  add(km, '2T1', motor, 'U1', 'red')
  add(km, '4T2', motor, 'V1', 'grey')
  add(km, '6T3', motor, 'W1', 'blue')
  add(motor, 'PE', psu, 'PE', 'green-yellow')

  return {
    components: [rail, psu, push, green, red, plc, breaker, qm, km, motor],
    wires,
    ladder: { rungs: buildLadder() },
    grafcet: buildGrafcet(),
    tags: [
      { id: 't1', address: 'I0.0', name: 'STOP', dataType: 'Bool', comment: 'Botão STOP (NF)' },
      { id: 't2', address: 'I0.1', name: 'START', dataType: 'Bool', comment: 'Botão START (NA)' },
      { id: 't3', address: 'Q0.0', name: 'KM1', dataType: 'Bool', comment: 'Contactor' },
      { id: 't4', address: 'Q0.1', name: 'H1', dataType: 'Bool', comment: 'Lâmpada marcha' },
      { id: 't5', address: 'Q0.2', name: 'H2', dataType: 'Bool', comment: 'Lâmpada parado' },
    ],
    projectKind: 'full',
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
