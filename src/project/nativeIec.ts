/**
 * Esquema IEC (simulador de comandos) do projeto nativo «Partida direta», com as mesmas
 * referências do quadro 3D:
 *  · Página «Potência»: XG → QG → QM1 → KM1 → F1 (relé térmico) → M1, PE ao motor e Q0 a
 *    alimentar o comando.
 *  · Página «Comando LOGO!»: PS1 (230 V AC → 24 V DC) e o LOGO! 12/24RC em bloco — entradas
 *    I0.0–I0.2 (B0, START, STOP); saídas Q0.0 → 95-96 do F1 → bobina KM1 (230 V), Q0.1 → H1 e
 *    Q0.2 → H2 (24 V).
 * As duas páginas ligam-se pelos conectores X1 (fase) e X2 (neutro) depois de Q0.
 *
 * Em RUN o esquema corre com o programa do LOGO!: as entradas com tensão chegam ao simulador do
 * PLC e as saídas seguem o programa; a bobina KM1 fecha os contactos de potência com a mesma
 * referência e o disparo do F1 (95-96) corta-a.
 */
import type { CmdKind, CmdPart, CommandsDiagram } from '../commands/model'
import { NATIVE_PARTIDA_ID } from './nativeMotorMeter'

export const NATIVE_IEC_FEATURE = 'iec-schematic-v1'
/** v2: relé térmico F1 e o LOGO! em bloco (substitui um esquema v1 que não tenha sido alterado). */
export const NATIVE_IEC_V2_FEATURE = 'iec-schematic-v2'
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
  const f1 = part('thermal3', 80, 380, 'F1')
  for (let i = 0; i < 3; i++) wire(km1, i * 2 + 1, f1, i * 2)
  const m1 = part('motor3', 80, 500, 'M1')
  for (let i = 0; i < 3; i++) wire(f1, i * 2 + 1, m1, i)
  const pe = part('ground', 160, 540, 'PE', { groundVariant: 'protective' })
  wire(xg, 4, pe, 0)
  text(280, 120, 'Q0 · proteção do comando')
  const q0 = part('breaker2', 300, 160, 'Q0')
  wire(tapL1, 0, q0, 0, 140)
  wire(xg, 3, q0, 2, 50)
  const outL = part('pageRef', 300, 330, 'X1')
  const outN = part('pageRef', 320, 280, 'X2')
  wire(q0, 1, outL, 0); wire(q0, 3, outN, 0)

  // —— Comando: fonte 24 V e LOGO! 12/24RC em bloco ——
  page = CONTROL_PAGE
  text(60, 0, 'Comando — LOGO! 12/24RC · PS1 230 V AC → 24 V DC')
  const inL = part('pageRefIn', 100, 40, 'X1')
  const inN = part('pageRefIn', 180, 80, 'X2')
  const ps1 = part('converter', 100, 120, 'PS1', { variant: 'acdc' })
  wire(inL, 0, ps1, 0); wire(inN, 0, ps1, 1, 100)
  const plc = part('plcLogo', 300, 320, 'PLC1')
  // +24 V (L+): PS1 → L+ do LOGO!, botoeira e comum das saídas Q0.1/Q0.2.
  const plus = [node(100, 200), node(300, 200), node(380, 200), node(480, 200), node(580, 200), node(680, 200)]
  wire(ps1, 2, plus[0], 0); chain(plus)
  wire(plus[1], 0, plc, 0)
  text(160, 192, '+24 V (L+)')
  // Entradas: B0 (NF, cogumelo), START (NA) e STOP (NF), cada uma no seu borne I.
  const inputs: Array<[CmdKind, string, string, Partial<CmdPart>]> = [
    ['emergency', 'B0', 'EMERG', {}], ['pushNO', 'B1.1', 'START', {}], ['pushNC', 'B1.2', 'STOP', { labels: ['21', '22'] }],
  ]
  inputs.forEach(([kind, tag, label, extra], i) => {
    const op = part(kind, 380 + i * 100, 220, tag, extra)
    wire(plus[i + 2], 0, op, 0)
    wire(op, 1, plc, 2 + i, 296 + i * 8)
    text(380 + i * 100 + 18, 250, label)
  })
  // 0 V (M): PS1 → M do LOGO! e retorno dos sinalizadores.
  const minus = [node(120, 640), node(240, 640), node(420, 640), node(480, 640)]
  wire(ps1, 3, minus[0], 0); chain(minus)
  wire(plc, 1, minus[1], 0, 306)
  text(160, 660, '0 V (M)')
  // Saídas 24 V: comum de Q0.1/Q0.2 a partir do +24 V; Q0.1 → H1, Q0.2 → H2.
  const common = node(460, 500)
  wire(plus[5], 0, common, 0, 500)
  wire(common, 0, plc, 14); wire(common, 0, plc, 12, 500)
  const h1 = part('lamp', 420, 540, 'H1', { color: 'green' })
  const h2 = part('lamp', 480, 540, 'H2', { color: 'red' })
  wire(plc, 13, h1, 0, 520); wire(h1, 1, minus[2], 0)
  wire(plc, 15, h2, 0, 520); wire(h2, 1, minus[3], 0)
  text(400, 620, 'MARCHA'); text(470, 620, 'PARADO')
  // Saída Q0.0 (230 V AC): X1 → Q0.0 → 95-96 do F1 → bobina KM1 → X2.
  const kmL = part('pageRefIn', 300, 540, 'X1')
  wire(kmL, 0, plc, 10, 500)
  const f1nc = part('thermalNC', 60, 560, 'F1')
  wire(plc, 11, f1nc, 0, 520)
  const coil = part('coil', 60, 660, 'KM1')
  wire(f1nc, 1, coil, 0)
  const kmN = part('pageRefIn', 60, 760, 'X2')
  wire(coil, 1, kmN, 0)
  text(80, 540, '230 V AC')
  text(60, 820, 'Em RUN, as entradas I0.x e as saídas Q0.x seguem o programa do LOGO! (o simulador do PLC arranca com o esquema).')
  return diagram
}

/** Esquema v1 gerado pela app (sem alterações do utilizador): ainda com entradas/saídas soltas. */
function isUntouchedV1(commands: any): boolean {
  if (!Array.isArray(commands?.parts) || !Array.isArray(commands?.wires)) return false
  return commands.name === 'Partida direta com emergência (LOGO!)'
    && commands.parts.length === 39 && commands.wires.length > 0
    && commands.parts.every((p: any) => typeof p?.id === 'string' && p.id.startsWith('iec-'))
    && commands.parts.some((p: any) => p.kind === 'plcOut') && !commands.parts.some((p: any) => p.kind === 'plcLogo')
}

/** Projetos nativos: recebem o esquema IEC uma vez; um v1 intacto passa ao v2. Nunca substitui um esquema do utilizador. */
export function addNativeIecSchematic<T extends Record<string, any>>(content: T): T {
  if (content.nativeId !== NATIVE_PARTIDA_ID) return content
  const features: string[] = Array.isArray(content.nativeFeatures) ? content.nativeFeatures.filter((v: unknown) => typeof v === 'string') : []
  if (features.includes(NATIVE_IEC_V2_FEATURE)) return content
  const hasOwn = Array.isArray(content.commands?.parts) && content.commands.parts.length > 0
  const replace = !hasOwn || isUntouchedV1(content.commands)
  const marks = [...features, ...(features.includes(NATIVE_IEC_FEATURE) ? [] : [NATIVE_IEC_FEATURE]), NATIVE_IEC_V2_FEATURE]
  return { ...content, ...(replace ? { commands: buildNativeIecSchematic() } : {}), nativeFeatures: marks }
}
