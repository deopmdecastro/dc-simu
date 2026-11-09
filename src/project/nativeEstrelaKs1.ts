/**
 * Projeto nativo #3 — Estrela-Triângulo com relé de segurança KS1 (QE1 400×680×200).
 * Nasceu do projeto «Testar» do utilizador: o mesmo quadro (calhas DIN, calhas técnicas, QF1, QM1,
 * QF2, PS1, KS1, LOGO!, KM1–KM3, RT1, QG1, bornes X1.x) completado com a porta (botoeira S1,
 * emergência B0, H1/H2/H3), bornes de E/S X2.x, cablagem de força e comando, GRAFCET e tags.
 */
import { nanoid } from 'nanoid'
import { createComponent } from '../electrical/factory'
import type { ElectricalComponent, Wire, WireColor } from '../types'
import { autoLayout, SPINE_X } from '../grafcet/layout'
import type { GrafcetProgram, GrafcetStep, GrafcetTransition } from '../grafcet/engine'
import { bakeNativeRouting } from './nativeRouting'
import { syncMounted } from '../three/thermalMount'
import { SCHEMATIC_PX_PER_MM } from '../three/modelPaths'

export const NATIVE_ESTRELA_KS1_ID = 'native-estrela-ks1-v1'
export const NATIVE_ESTRELA_KS1_NAME = 'Estrela-Triângulo com KS1 (nativo)'

const PX = SCHEMATIC_PX_PER_MM
const QE = 'i_erz81y'

/** Componente com o id do projeto original (bornes `${id}-${rótulo}`, como no «Testar»). */
function keep(id: string, type: string, ref: string, x: number, y: number, extra: Partial<ElectricalComponent> & { state?: Record<string, unknown> } = {}): ElectricalComponent {
  const c = createComponent(type as any, ref, extra.label, 0, x, y)
  c.id = id
  c.terminals = c.terminals.map((t) => ({ ...t, id: `${id}-${t.label}`, componentId: id }))
  const { state, ...rest } = extra
  Object.assign(c, rest)
  if (state) c.state = { ...c.state, ...state }
  c.schematicX = x; c.schematicY = y
  return c
}

export function nativeEstrelaKs1Content(): Record<string, unknown> {
// ── Quadro e calhas do «Testar» ──────────────────────────────────────────────────────────────
const qe = keep(QE, 'panelEnclosure', 'QE1', 20, -540, { w: 600, h: 1020, label: 'Quadro Estrela-Triângulo (QE1)', state: { depthMm: 200, widthMm: 400, heightMm: 680, doorOpen: true, hingeSide: 'left', plateFinish: 'Aço galvanizado', editorHiddenFaces: [] } })
const railState = { finish: 'Aço galvanizado', profile: '35×15 mm', lengthMm: 250, perforated: true }
const tr1 = keep('xF3hcdnZ', 'dinRail15x55', 'TR1', 120, -300, { w: 375, h: 53, enclosureId: QE, label: 'Calha DIN · proteção e alimentação', state: railState })
const tr2 = keep('9O71uuIq', 'dinRail15x55', 'TR2', 110, 57, { w: 375, h: 53, enclosureId: QE, label: 'Calha DIN · LOGO! e contactores', state: railState })
const tr4 = keep('PazjE2yi', 'dinRail15x55', 'TR4', 113, 371, { w: 375, h: 53, enclosureId: QE, label: 'Calha DIN · rede e bornes', state: railState })
const duct = (id: string, ref: string, x: number, y: number, w: number, lengthMm: number, rotation = 0) =>
  keep(id, 'cableDuct', ref, x, y, { w, h: 60, rotation, enclosureId: QE, state: { coverOn: false, widthMm: 40, heightMm: 40, lengthMm } })
const ct1 = duct('NKSIr8pF', 'CT1', 90, -460, 465, 310)
const ct4 = duct('afljwT0R', 'CT4', 82, -160, 488, 325)
const ct3 = duct('4-KJPoji', 'CT3', 80, 260, 480, 320)
// Calhas verticais: encurtadas para 600 mm e centradas dentro da moldura do quadro (antes saíam do armário).
const ct5 = duct('5yebHeLC', 'CT5', 80 - 450, -60, 900, 600, 90)
const ct2 = duct('l0TsioDk', 'CT2', 559 - 450, -60, 900, 600, 90)

// ── Aparelhos do «Testar» ────────────────────────────────────────────────────────────────────
const onRail = (railId: string, offsetMm: number) => ({ railId, railOffsetMm: offsetMm, enclosureId: QE })
const qf1 = keep('uOcaaUKw', 'breaker3p', 'QF1', 120, -337, { ...onRail(tr1.id, 0), label: 'Disjuntor geral 3P 25 A', state: { inA: 25, curve: 'C', poles: 3, closed: true, tripped: false } })
const qm1 = keep('YEZ9FQi1', 'motorBreakerPkzmC10', 'QM1', 205, -342, { ...onRail(tr1.id, 56.7), label: 'Disjuntor-motor PKZM C-10', state: { closed: true, tripped: false } })
const qf2 = keep('IU53GDAw', 'breaker2p', 'QF2', 276, -337, { ...onRail(tr1.id, 104), label: 'Disjuntor comando 2P 16 A (L1/N)', state: { inA: 16, curve: 'C', poles: 2, closed: true, tripped: false } })
const ps1 = keep('MBVEP9DK', 'powerSupplyProauto24A', 'PS1', 334, -367, { ...onRail(tr1.id, 142.7), label: 'Fonte 24 V DC 5 A' })
const ks1 = keep('PaFeeVoW', 'safetyRelaySiemens3tk2840', 'KS1', 434, -348, { ...onRail(tr1.id, 209.3), label: 'Relé de segurança (emergência B0)' })
const plc = keep('bjTNW2j7', 'plcSiemensLogo1224RC', 'PLC1', 110, 16, { ...onRail(tr2.id, 0), label: 'LOGO! 12/24RC · arranque Y/Δ' })
const km1 = keep('vJDd9AEc', 'contactorWegCWC09', 'KM1', 222, 40, { ...onRail(tr2.id, 74.7), label: 'KM1 · linha' })
const km2 = keep('QybuxYnz', 'contactorWegCWC09', 'KM2', 294, 40, { ...onRail(tr2.id, 122.7), label: 'KM2 · triângulo (Δ)' })
const km3 = keep('LORe_I0p', 'contactorWegCWC09', 'KM3', 366, 40, { ...onRail(tr2.id, 170.7), label: 'KM3 · estrela (Y)' })
km2.state.interlockWith = km3.id; km3.state.interlockWith = km2.id
// Térmico na linha: passa do KM3 (estrela, só conduz no arranque) para o KM1.
const rt1 = keep('Hruvl0Q9', 'thermalRelaySiemens3ru1116', 'RT1', 222, 112, { mountedOn: km1.id, enclosureId: QE, label: 'Relé térmico (sob KM1)' })
const qg1 = keep('GxeoeWLD', 'powerSource3ph', 'QG1', 113, 348, { ...onRail(tr4.id, 0), label: 'Rede 400 V 3F+N+PE' })
const m1 = keep('29GlMS3K', 'motor3ph', 'M1', 1080, 520, { label: 'Motor M1 · arranque Y/Δ', viewOrientation: { x: 14, y: -35, z: 0 }, state: { motorConnection: 'none' } })

// Bornes: X1.0..X1.3 do «Testar» passam a distribuição; X2.1..X2.7 são as E/S da porta.
const strip = (id: string | null, ref: string, label: string, x: number) => {
  const b = keep(id ?? nanoid(8), 'terminalPhoenixPti6', ref, x, 348, { ...onRail(tr4.id, Math.round(((x - 113) / PX) * 10) / 10), label })
  return b
}
const x10 = strip('oGkPrNps', 'X1.0', '+24 V DC', 178)
const x11 = strip('Ix1axOcW', 'X1.1', '0 V DC', 192)
const x12 = strip('z2Up_lGd', 'X1.2', 'L comando 230 V', 204)
const x13 = strip('DHogUPch', 'X1.3', 'N comando', 216)
const doorBorne = ['START S1 → I0.0', 'STOP S1 → I0.1', 'H1 marcha ← Q0.3', 'H2 falha ← RT1 98', 'H3 estrela ← KM3 14', 'B0 canal (KS1 Y11)', 'B0 canal (KS1 Y12)']
const x2 = doorBorne.map((label, i) => strip(null, `X2.${i + 1}`, label, 236 + i * 14))

// ── Porta (furos Ø22) ────────────────────────────────────────────────────────────────────────
const door = (type: string, ref: string, label: string, ox: number, oy: number, x: number, y: number, state: Record<string, unknown> = {}) => {
  const c = keep(nanoid(8), type, ref, x, y, { label, state })
  c.panelMount = { enclosureId: QE, face: 'doorOuter', offsetXmm: ox, offsetYmm: oy, cutoutMm: 22 }
  return c
}
const h1 = door('pilotLightAd22', 'H1', 'Marcha (verde)', -100, 200, 700, -480, { color: '#22c55e' })
const h3 = door('pilotLightAd22', 'H3', 'Estrela (laranja)', 0, 200, 780, -480, { color: '#f59e0b' })
const h2 = door('pilotLightAd22', 'H2', 'Falha térmica (vermelho)', 100, 200, 860, -480, { color: '#ef4444' })
// Botoeira dupla NPB22-D11 (com modelo 3D): START 13-14 (NA) e STOP 21-22 (NF).
const s1 = door('dualPushButtonNpb22D11', 'S1', 'Botoeira START / STOP', 0, 80, 760, -380)
const b0 = door('emergencyButton', 'B0', 'Emergência (NF)', 0, -60, 780, -270)

const components: ElectricalComponent[] = [
  qe, tr1, tr2, tr4, ct1, ct2, ct3, ct4, ct5,
  qf1, qm1, qf2, ps1, ks1, plc, km1, km2, km3, rt1, qg1, x10, x11, x12, x13, ...x2,
  h1, h3, h2, s1, b0, m1,
]

// ── Cablagem ─────────────────────────────────────────────────────────────────────────────────
const tid = (c: ElectricalComponent, label: string) => {
  const t = c.terminals.find((x) => x.label === label)
  if (!t) throw new Error(`${c.ref}:${label} não existe (${c.terminals.map((x) => x.label).join(',')})`)
  return t.id
}
const wires: Wire[] = []
const add = (a: ElectricalComponent, al: string, b: ElectricalComponent, bl: string, color: WireColor, num: string, gauge = '1.5mm²') => {
  wires.push({
    id: nanoid(8), fromTerminalId: tid(a, al), toTerminalId: tid(b, bl), color, gauge, number: num,
    kind: color === 'green-yellow' ? 'earth' : color === 'black' || color === 'brown' ? 'power' : 'control',
    flexibility: 'flexible', endType: 'ferrule', fromEndType: 'ferrule', toEndType: 'ferrule',
    fromEndLayer: 'back', toEndLayer: 'back', route: 'orthogonal', bend: 0.5, curveOffset: 0, energized: false,
  } as Wire)
}

// Força: QG1 → QF1 → QM1 → KM1 → RT1 → M1 U1/V1/W1 e KM2; KM2 → W2/U2/V2 (Δ); KM3 fecha W2/U2/V2 (Y).
add(qg1, 'L1', qf1, '1', 'black', 'W1', '2.5mm²'); add(qg1, 'L2', qf1, '3', 'black', 'W2', '2.5mm²'); add(qg1, 'L3', qf1, '5', 'black', 'W3', '2.5mm²')
add(qf1, '2', qm1, '1', 'black', 'W4', '2.5mm²'); add(qf1, '4', qm1, '3', 'black', 'W5', '2.5mm²'); add(qf1, '6', qm1, '5', 'black', 'W6', '2.5mm²')
add(qm1, '2', km1, '1L1', 'black', 'W7', '2.5mm²'); add(qm1, '4', km1, '3L2', 'black', 'W8', '2.5mm²'); add(qm1, '6', km1, '5L3', 'black', 'W9', '2.5mm²')
add(km1, '2T1', rt1, '1L1', 'black', 'W10', '2.5mm²'); add(km1, '4T2', rt1, '3L2', 'black', 'W11', '2.5mm²'); add(km1, '6T3', rt1, '5L3', 'black', 'W12', '2.5mm²')
add(rt1, '2T1', m1, 'U1', 'black', 'W13', '2.5mm²'); add(rt1, '4T2', m1, 'V1', 'black', 'W14', '2.5mm²'); add(rt1, '6T3', m1, 'W1', 'black', 'W15', '2.5mm²')
add(rt1, '2T1', km2, '1L1', 'black', 'W16', '2.5mm²'); add(rt1, '4T2', km2, '3L2', 'black', 'W17', '2.5mm²'); add(rt1, '6T3', km2, '5L3', 'black', 'W18', '2.5mm²')
add(km2, '2T1', m1, 'W2', 'black', 'W19', '2.5mm²'); add(km2, '4T2', m1, 'U2', 'black', 'W20', '2.5mm²'); add(km2, '6T3', m1, 'V2', 'black', 'W21', '2.5mm²')
add(km3, '2T1', m1, 'W2', 'black', 'W22', '2.5mm²'); add(km3, '4T2', m1, 'U2', 'black', 'W23', '2.5mm²'); add(km3, '6T3', m1, 'V2', 'black', 'W24', '2.5mm²')
add(km3, '1L1', km3, '3L2', 'black', 'W25', '2.5mm²'); add(km3, '3L2', km3, '5L3', 'black', 'W26', '2.5mm²')
add(qg1, 'PE', m1, 'PE', 'green-yellow', 'PE1', '2.5mm²')
add(qg1, 'PE', ps1, 'PE', 'green-yellow', 'PE2')

// Comando 230 V CA: L1/N → QF2 → X1.2/X1.3 → PS1, RT1 95-96 → relés do LOGO! → bobinas → N.
add(qg1, 'L1', qf2, '1', 'brown', 'W30'); add(qg1, 'N', qf2, '3', 'blue', 'W31')
add(qf2, '2', x12, '1', 'brown', 'W32'); add(qf2, '4', x13, '1', 'blue', 'W33')
add(x12, '2', ps1, 'L', 'brown', 'W34'); add(x13, '2', ps1, 'N', 'blue', 'W35')
add(x12, '2', rt1, '95', 'brown', 'W36')
for (const [q, n] of [['Q0.0', 'W37'], ['Q0.1', 'W38'], ['Q0.2', 'W39']] as const) add(rt1, '96', plc, `${q}·2`, 'brown', n)
add(plc, 'Q0.0', km1, 'A1', 'brown', 'W40'); add(plc, 'Q0.1', km2, 'A1', 'brown', 'W41'); add(plc, 'Q0.2', km3, 'A1', 'brown', 'W42')
add(km1, 'A2', x13, '2', 'blue', 'W43'); add(km2, 'A2', x13, '2', 'blue', 'W44'); add(km3, 'A2', x13, '2', 'blue', 'W45')

// 24 V DC: PS1 → X1.0 (+) / X1.1 (0 V) → LOGO!, KS1, botões e sinalizadores.
add(ps1, '+V1', x10, '1', 'red', 'W50'); add(ps1, '-V1', x11, '1', 'lightblue', 'W51')
add(ps1, '+V2', x10, '1', 'red', 'W50b'); add(ps1, '-V2', x11, '1', 'lightblue', 'W51b')
add(x10, '2', plc, 'L+', 'red', 'W52'); add(x11, '2', plc, 'M', 'lightblue', 'W53')
add(x10, '2', ks1, 'A1', 'red', 'W54'); add(x11, '2', ks1, 'A2', 'lightblue', 'W55')
// Emergência B0 (NF) no canal 1 do KS1, pela porta (X2.6/X2.7); canal 2 e rearme em ponte (didático).
add(ks1, 'Y11', x2[5], '1', 'red', 'W56'); add(x2[5], '2', b0, '21', 'red', 'W57')
add(b0, '22', x2[6], '2', 'red', 'W58'); add(x2[6], '1', ks1, 'Y12', 'red', 'W59')
add(ks1, 'Y21', ks1, 'Y22', 'red', 'W60'); add(ks1, 'Y33', ks1, 'Y34', 'red', 'W61')
add(ks1, '14', plc, 'I0.2', 'violet', 'W62')
// Botões da porta → X2.1/X2.2 → I0.0/I0.1.
add(x10, '2', s1, '13', 'red', 'W63'); add(s1, '14', x2[0], '2', 'violet', 'W64'); add(x2[0], '1', plc, 'I0.0', 'violet', 'W65')
add(x10, '2', s1, '21', 'red', 'W66'); add(s1, '22', x2[1], '2', 'violet', 'W67'); add(x2[1], '1', plc, 'I0.1', 'violet', 'W68')
// Térmico: 97-98 → I0.3 e H2 (falha).
add(x10, '2', rt1, '97', 'red', 'W69'); add(rt1, '98', plc, 'I0.3', 'violet', 'W70')
add(rt1, '98', x2[3], '1', 'red', 'W71'); add(x2[3], '2', h2, 'X1', 'red', 'W72')
// H1 marcha pela Q0.3 (24 V) e H3 estrela pelo auxiliar 13-14 do KM3.
add(x10, '2', plc, 'Q0.3·2', 'red', 'W73'); add(plc, 'Q0.3', x2[2], '1', 'green', 'W74'); add(x2[2], '2', h1, 'X1', 'green', 'W75')
add(x10, '2', km3, '13', 'red', 'W76'); add(km3, '14', x2[4], '1', 'orange', 'W77'); add(x2[4], '2', h3, 'X1', 'orange', 'W78')
for (const [h, n] of [[h1, 'W79'], [h2, 'W80'], [h3, 'W81']] as const) add(h, 'X2', x11, '2', 'lightblue', n)

// ── GRAFCET do arranque estrela-triângulo ───────────────────────────────────────────────────
const act = (address: string, variable: string, description: string) => ({ id: nanoid(6), address, variable, description, condition: '1', kind: 'N', displayDescription: true })
const steps: GrafcetStep[] = [
  { id: 'et0', name: '0', initial: true, stepType: 'initial', action: '', condition: '', description: 'Repouso', actions: [] },
  { id: 'et10', name: '10', initial: false, stepType: 'simple', action: '', condition: '', description: 'Arranque em estrela (5 s)', actions: [act('Q0.0', 'KM1', 'KM1 linha'), act('Q0.2', 'KM3', 'KM3 estrela')] },
  { id: 'et11', name: '11', initial: false, stepType: 'simple', action: '', condition: '', description: 'Marcha em triângulo', actions: [act('Q0.0', 'KM1', 'KM1 linha'), act('Q0.1', 'KM2', 'KM2 triângulo'), act('Q0.3', 'H1', 'H1 marcha')] },
  { id: 'et12', name: '12', initial: false, stepType: 'simple', action: '', condition: '', description: 'Falha térmica (aguarda rearme do RT1)', actions: [] },
] as GrafcetStep[]
const parar = '!I0.1 + !I0.2 + I0.3'
const transitions: GrafcetTransition[] = [
  { id: 'et-t1', name: 'T1', from: ['et0'], to: ['et10'], condition: 'I0.0 * I0.1 * I0.2 * !I0.3', description: 'START com STOP, segurança e térmico OK' },
  { id: 'et-t2', name: 'T2', from: ['et10'], to: ['et11'], condition: '5s/X10', description: '5 s em estrela → triângulo' },
  { id: 'et-t3', name: 'T3', from: ['et11'], to: ['et0'], condition: parar, description: 'STOP, emergência ou térmico' },
  { id: 'et-t4', name: 'T4', from: ['et10'], to: ['et0'], condition: parar, description: 'STOP, emergência ou térmico em estrela' },
  { id: 'et-t5', name: 'T5', from: ['et0'], to: ['et12'], condition: 'I0.3', description: 'Térmico disparado' },
  { id: 'et-t6', name: 'T6', from: ['et12'], to: ['et0'], condition: '!I0.3', description: 'Térmico rearmado' },
] as GrafcetTransition[]
const at = autoLayout(steps, transitions)
const grafcet: GrafcetProgram = {
  name: 'Arranque estrela-triângulo',
  steps: steps.map((s) => { const p = at.get(s.id); return p ? { ...s, x: p.x, y: p.y, pinned: true } : s }),
  transitions: transitions.map((t, i) => ({ ...t, x: SPINE_X, y: 90 + i * 110 })),
  comments: [{ id: 'et-c1', text: 'Arranque Y/Δ — KM1+KM3 (estrela, 5 s) → KM1+KM2 (triângulo). STOP/emergência/térmico → repouso.', x: 40, y: 24, fontSize: 14, fontWeight: '700', color: '#0f172a' }],
} as GrafcetProgram

const tag = (address: string, name: string, comment: string) => ({ id: `et-tag-${address}`, address, name, dataType: 'Bool', comment })
const tags = [
  tag('I0.0', 'START', 'S1 START (13-14, NA) na porta → X2.1 → I0.0'),
  tag('I0.1', 'STOP', 'S1 STOP (21-22, NF) na porta → X2.2 → I0.1 (1 = livre)'),
  tag('I0.2', 'SEG_OK', 'KS1 saída 14: emergência B0 livre e rearmada'),
  tag('I0.3', 'RT1_FALHA', 'RT1 97-98: térmico disparado'),
  tag('Q0.0', 'KM1', 'Contactor de linha'),
  tag('Q0.1', 'KM2', 'Contactor triângulo (encravado com KM3)'),
  tag('Q0.2', 'KM3', 'Contactor estrela (encravado com KM2)'),
  tag('Q0.3', 'H1', 'Sinalizador de marcha (verde)'),
]

const mounted = syncMounted(components)
const routed = bakeNativeRouting(mounted.filter((c) => !['panelEnclosure', 'cableDuct', 'spiralWrap', 'dinRail15x55'].includes(c.type)), wires)
const now = new Date().toISOString()
const content = {
  app: 'dc-simu', version: 6, projectKind: 'all', unlockedViews: [], savedAt: now, nativeId: NATIVE_ESTRELA_KS1_ID,
  components: mounted, wires: routed, ladder: { rungs: [] },
  fcBlocks: { fc1: [], fc2: [] }, fcAdded: { fc1: false, fc2: false },
  activePlcId: plc.id, plcPrograms: {}, plcTags: {}, projectFiles: {}, hiddenProjectFolders: {}, projectFolderLabels: {}, fcNames: {},
  grafcet, tags,
  commands: { pages: [{ id: 'page-1', name: 'Página 1' }], parts: [], texts: [], wires: [] },
  virtualInputs: {}, virtualInputModes: {}, virtualInputCount: 8, virtualOutputCount: 8, virtualMemoryCount: 4,
  sheets: [{ id: 'sheet-1', name: 'Página 1' }], activeSheetId: 'sheet-1',
  grid: { size: 20, snap: true, style: 'dots', enabled: true, background: '#f7f9fc' }, activeScenario: 'custom',
  canvasNotes: [{
    id: 'et-n1', text: 'Como testar', view: '3d', x: 2.4, y: 2.2, z: 0.35, color: '#fde68a', createdAt: now,
    messages: [{ id: 'et-n1-m', author: 'DC-SIMU', createdAt: now, text: '1) RUN. KS1: «Pedir rearme» (emergência B0 livre).\n2) S1 START → KM1+KM3 estrela (H3) → 5 s → KM1+KM2 triângulo (H1).\n3) S1 STOP, B0 emergência ou disparo do RT1 (H2) → repouso.\nKM2/KM3 estão encravados.' }],
  }],
  canvasTexts: [],
  selectionGroups: [{ id: 'IgAzVUrS', view: 'schematic', members: [x10.id, x11.id, x12.id, x13.id] }],
}
return content
}
