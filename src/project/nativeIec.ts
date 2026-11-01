/**
 * Esquema IEC (simulador de comandos) do projeto nativo «Partida direta», com as mesmas
 * referências do quadro 3D:
 *  · Página «Potência»: XG → QG → QM1 → KM1 → M1, PE ao motor e Q0 a alimentar o comando.
 *  · Página «Comando LOGO!»: PS1 (230 V AC → 24 V DC), entradas I0.0–I0.2 (B0, START, STOP)
 *    e saídas Q0.0 → bobina KM1 (230 V), Q0.1 → H1 e Q0.2 → H2 (24 V).
 * As duas páginas ligam-se pelos conectores X1 (fase) e X2 (neutro) depois de Q0.
 *
 * Em RUN o esquema corre com o programa do LOGO!: as entradas I0.x com tensão chegam ao
 * simulador do PLC e as saídas Q0.x seguem o programa; a bobina KM1 fecha os contactos de
 * potência com a mesma referência.
 */
import type { CmdKind, CmdPart, CommandsDiagram } from '../commands/model'
import { NATIVE_PARTIDA_ID } from './nativeMotorMeter'

export const NATIVE_IEC_FEATURE = 'iec-schematic-v1'
const POWER_PAGE = 'page-1'
const CONTROL_PAGE = 'page-2'

export function buildNativeIecSchematic(): CommandsDiagram {
  const diagram: CommandsDiagram = {
    name: 'Partida direta com emergência (LOGO!)',
    parts: [],
    wires: [],
    texts: [],
    pages: [{ id: POWER_PAGE, name: 'Potência' }, { id: CONTROL_PAGE, name: 'Comando LOGO!' }],
  }
  let page = POWER_PAGE
  let n = 0
  const part = (kind: CmdKind, x: number, y: number, tag = '', extra: Partial<CmdPart> = {}) => {
    const p: CmdPart = { id: `iec-${++n}`, kind, x, y, rot: 0, tag, page, ...extra }
    diagram.parts.push(p)
    return p
  }
  const node = (x: number, y: number) => part('node', x, y)
  const wire = (a: CmdPart, ta: number, b: CmdPart, tb: number, mid?: number) => {
    diagram.wires.push({ id: `iec-w${diagram.wires.length + 1}`, a: { part: a.id, term: ta }, b: { part: b.id, term: tb }, page, ...(mid !== undefined ? { mid } : {}) })
  }
  const text = (x: number, y: number, value: string) => { diagram.texts!.push({ id: `iec-t${diagram.texts!.length + 1}`, x, y, text: value, page }) }
  const chain = (nodes: CmdPart[]) => nodes.slice(1).forEach((nd, i) => wire(nodes[i], 0, nd, 0))

  // —— Potência (400 V 3~ + N + PE) ——
  text(60, 0, 'Circuito de potência — XG 400 V 3~ / N / PE')
  const xg = part('supply', 80, 40, '', { lines: ['L1', 'L2', 'L3', 'N', 'PE'] })
  const qg = part('breaker3', 80, 60, 'QG')
  for (let i = 0; i < 3; i++) wire(xg, i, qg, i * 2)
  const tapL1 = node(80, 140)
  const qm1 = part('motorBreaker3', 80, 180, 'QM1')
  wire(qg, 1, tapL1, 0); wire(tapL1, 0, qm1, 0); wire(qg, 3, qm1, 2); wire(qg, 5, qm1, 4)
  const km1 = part('contact3', 80, 280, 'KM1')
  for (let i = 0; i < 3; i++) wire(qm1, i * 2 + 1, km1, i * 2)
  const m1 = part('motor3', 80, 400, 'M1')
  for (let i = 0; i < 3; i++) wire(km1, i * 2 + 1, m1, i)
  const pe = part('ground', 160, 440, 'PE', { groundVariant: 'protective' })
  wire(xg, 4, pe, 0)
  text(280, 120, 'Q0 · proteção do comando')
  const q0 = part('breaker2', 300, 160, 'Q0')
  wire(tapL1, 0, q0, 0, 140)
  wire(xg, 3, q0, 2, 50)
  const outL = part('pageRef', 300, 330, 'X1')
  const outN = part('pageRef', 320, 280, 'X2')
  wire(q0, 1, outL, 0); wire(q0, 3, outN, 0)

  // —— Comando: fonte 24 V, entradas e saídas do LOGO! ——
  page = CONTROL_PAGE
  text(60, 0, 'Comando — LOGO! 12/24RC · PS1 230 V AC → 24 V DC')
  const inL = part('pageRefIn', 100, 60, 'X1')
  const inN = part('pageRefIn', 180, 100, 'X2')
  const ps1 = part('converter', 100, 140, 'PS1', { variant: 'acdc' })
  wire(inL, 0, ps1, 0); wire(inN, 0, ps1, 1, 120)
  const plus = [node(100, 240), node(200, 240), node(300, 240), node(400, 240), node(640, 240), node(740, 240)]
  const minus = [node(120, 540), node(200, 540), node(300, 540), node(400, 540), node(640, 540), node(740, 540)]
  wire(ps1, 2, plus[0], 0); chain(plus)
  wire(ps1, 3, minus[0], 0); chain(minus)
  text(180, 230, '+24 V (L+)')
  text(180, 560, '0 V (M)')
  const inputs: Array<[CmdKind, string, string, string, Partial<CmdPart>]> = [
    ['emergency', 'B0', 'I0.0', 'EMERG', {}],
    ['pushNO', 'B1.1', 'I0.1', 'START', {}],
    ['pushNC', 'B1.2', 'I0.2', 'STOP', { labels: ['21', '22'] }],
  ]
  inputs.forEach(([kind, tag, address, label, extra], i) => {
    const x = 200 + i * 100
    const op = part(kind, x, 280, tag, extra)
    const input = part('plcIn', x, 380, address)
    wire(plus[i + 1], 0, op, 0); wire(op, 1, input, 0); wire(input, 1, minus[i + 1], 0)
    text(x + 22, 470, label)
  })
  const outputs: Array<[string, string, 'green' | 'red', string]> = [['Q0.1', 'H1', 'green', 'MARCHA'], ['Q0.2', 'H2', 'red', 'PARADO']]
  outputs.forEach(([address, tag, color, label], i) => {
    const x = 640 + i * 100
    const out = part('plcOut', x, 280, address)
    const lamp = part('lamp', x, 380, tag, { color })
    wire(plus[i + 4], 0, out, 0); wire(out, 1, lamp, 0); wire(lamp, 1, minus[i + 4], 0)
    text(x + 22, 470, label)
  })
  text(800, 215, '230 V AC')
  const kmL = part('pageRefIn', 860, 240, 'X1')
  const q00 = part('plcOut', 860, 280, 'Q0.0')
  const coil = part('coil', 860, 380, 'KM1')
  const kmN = part('pageRefIn', 860, 480, 'X2')
  wire(kmL, 0, q00, 0); wire(q00, 1, coil, 0); wire(coil, 1, kmN, 0)
  text(60, 620, 'Em RUN, as entradas I0.x e as saídas Q0.x seguem o programa do LOGO! (o simulador do PLC arranca com o esquema).')
  return diagram
}

/** Projetos nativos já guardados sem esquema IEC recebem-no uma vez (não substitui um esquema do utilizador). */
export function addNativeIecSchematic<T extends Record<string, any>>(content: T): T {
  if (content.nativeId !== NATIVE_PARTIDA_ID) return content
  const features: string[] = Array.isArray(content.nativeFeatures) ? content.nativeFeatures.filter((v: unknown) => typeof v === 'string') : []
  if (features.includes(NATIVE_IEC_FEATURE)) return content
  const hasOwn = Array.isArray(content.commands?.parts) && content.commands.parts.length > 0
  return { ...content, ...(hasOwn ? {} : { commands: buildNativeIecSchematic() }), nativeFeatures: [...features, NATIVE_IEC_FEATURE] }
}
