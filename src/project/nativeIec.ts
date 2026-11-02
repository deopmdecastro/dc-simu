/**
 * Esquema IEC (simulador de comandos) do projeto nativo «Partida direta», com as mesmas
 * referências do quadro 3D:
 *  · Página «Potência»: XG → QG → QM1 → KM1 → F1 (relé térmico) → M1, PE ao motor e Q0 a
 *    alimentar o comando; voltímetro MM1 entre U1 e V1 do motor (o mesmo multímetro MM1 do quadro 3D).
 *  · Página «Comando LOGO!»: PS1 (230 V AC → 24 V DC) e o LOGO! 12/24RC em bloco — entradas
 *    I0.0–I0.3 (B0, START, STOP e o 97-98 do F1, que fecha no disparo); saídas Q0.0 → 95-96 do F1
 *    → bobina KM1 (230 V), Q0.1 → H1 MARCHA (verde), Q0.2 → H2 PARADO (laranja) e Q0.3 → H3
 *    EMERGÊNCIA (vermelho), a 24 V.
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
/** v3: LOGO! com o desenho da frente do aparelho (220 px); a folha de comando desce 60 px. */
export const NATIVE_IEC_V3_FEATURE = 'iec-schematic-v3'
/** v4: sinal do relé térmico (F1 97-98 → I0.3), H3 EMERGÊNCIA em Q0.3, H2 laranja e voltímetro P1 (24 V). */
export const NATIVE_IEC_V4_FEATURE = 'iec-schematic-v4'
/** v5: o voltímetro passa para o motor (MM1 entre U1 e V1, como o multímetro do quadro 3D). */
export const NATIVE_IEC_V5_FEATURE = 'iec-schematic-v5'
/** v6: textos de legenda (tags E/S e funcionamento) nas páginas Potência e Comando. */
export const NATIVE_IEC_V6_FEATURE = 'iec-schematic-v6'
/** v7: legenda de potência reorganizada (sem sobrepor Q0). */
export const NATIVE_IEC_V7_FEATURE = 'iec-schematic-v7'
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
  // Legenda à direita, afastada da cadeia e de Q0
  text(520, 40, 'Cadeia de força')
  text(520, 58, 'XG → QG → QM1 → KM1 → F1 → M1')
  text(520, 82, 'KM1 fecha a potência quando Q0.0')
  text(520, 98, 'energiza a bobina (via 95-96 do F1)')
  text(520, 122, 'F1 (térmico)')
  text(520, 138, '95-96 NF em série com a bobina')
  text(520, 154, '97-98 NA → I0.3 (disparo ao LOGO!)')
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
  const m1 = part('motor3', 80, 520, 'M1')
  // U1 e V1 com derivação para o voltímetro MM1 (tensão composta na entrada do motor, ≈ 400 V AC em marcha):
  // cada derivação entra a direito no seu borne (U1 em cima, V1 em baixo), sem atravessar o símbolo.
  const tapU = node(80, 455)
  const tapV = node(100, 515)
  wire(f1, 1, tapU, 0); wire(tapU, 0, m1, 0)
  wire(f1, 3, tapV, 0); wire(tapV, 0, m1, 1)
  wire(f1, 5, m1, 2)
  const mm1 = part('voltmeter', 200, 455, 'MM1')
  wire(tapU, 0, mm1, 0); wire(tapV, 0, mm1, 1)
  text(214, 548, 'U1–V1 do motor')
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
  // +24 V (L+): PS1 → L+ do LOGO!, botoeira, 97-98 do F1 e comum das saídas Q0.1–Q0.3.
  const plus = [node(100, 200), node(300, 200), node(380, 200), node(480, 200), node(580, 200), node(680, 200), node(760, 200)]
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
  // Relé térmico F1 · 97-98 (NA, fecha no disparo) → I0.3: o LOGO! sabe que o motor disparou.
  const f1no = part('thermalNO', 680, 220, 'F1')
  wire(plus[5], 0, f1no, 0)
  wire(f1no, 1, plc, 5, 316)
  text(698, 250, 'F1 DISP.')
  // 0 V (M): PS1 → M do LOGO! e retorno dos sinalizadores.
  const minus = [node(120, 700), node(240, 700), node(420, 700), node(480, 700), node(540, 700)]
  wire(ps1, 3, minus[0], 0); chain(minus)
  wire(plc, 1, minus[1], 0, 306)
  text(160, 720, '0 V (M)')
  // Saídas 24 V: comum de Q0.1–Q0.3 a partir do +24 V; Q0.1 → H1 MARCHA (verde),
  // Q0.2 → H2 PARADO (laranja) e Q0.3 → H3 EMERGÊNCIA / falha (vermelho).
  const common = node(460, 560)
  wire(plus[6], 0, common, 0, 560)
  wire(common, 0, plc, 14); wire(common, 0, plc, 12, 560); wire(common, 0, plc, 16, 560)
  const h1 = part('lamp', 420, 600, 'H1', { color: 'green' })
  const h2 = part('lamp', 480, 600, 'H2', { color: 'orange' })
  const h3 = part('lamp', 540, 600, 'H3', { color: 'red' })
  wire(plc, 13, h1, 0, 580); wire(h1, 1, minus[2], 0)
  wire(plc, 15, h2, 0, 580); wire(h2, 1, minus[3], 0)
  wire(plc, 17, h3, 0, 580); wire(h3, 1, minus[4], 0)
  text(352, 680, 'MARCHA'); text(492, 680, 'PARADO'); text(552, 696, 'EMERG.')
  // Saída Q0.0 (230 V AC): X1 → Q0.0 → 95-96 do F1 → bobina KM1 → X2.
  const kmL = part('pageRefIn', 300, 600, 'X1')
  wire(kmL, 0, plc, 10, 560)
  const f1nc = part('thermalNC', 60, 620, 'F1')
  wire(plc, 11, f1nc, 0, 580)
  const coil = part('coil', 60, 720, 'KM1')
  wire(f1nc, 1, coil, 0)
  const kmN = part('pageRefIn', 60, 820, 'X2')
  wire(coil, 1, kmN, 0)
  text(80, 600, '230 V AC')
  text(60, 880, 'Em RUN, as entradas I0.x e as saídas Q0.x seguem o programa do LOGO! (o simulador do PLC arranca com o esquema).')
  // Legenda de tags (entradas / saídas) — igual ao espírito dos comentários do GRAFCET.
  text(700, 40, 'Tags de entrada')
  text(700, 58, 'I0.0  EMERG  B0 cogumelo NF')
  text(700, 74, 'I0.1  START  B1.1 NA')
  text(700, 90, 'I0.2  STOP   B1.2 NF')
  text(700, 106, 'I0.3  F1     97-98 NA (disparo)')
  text(700, 140, 'Tags de saída')
  text(700, 158, 'Q0.0  KM1   bobina contactor')
  text(700, 174, 'Q0.1  H1    MARCHA (verde)')
  text(700, 190, 'Q0.2  H2    PARADO (laranja)')
  text(700, 206, 'Q0.3  H3    EMERGÊNCIA (vermelho)')
  text(700, 240, 'Funcionamento')
  text(700, 258, 'START + EMERG OK + STOP OK + F1 armado → marcha')
  text(700, 274, 'STOP, emergência ou F1 → reset a parado')
  text(700, 290, 'H2 aceso em parado sem falha; H3 em emergência/F1')
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

/** Esquema v2 gerado pela app (sem alterações): LOGO! de 160 px com H1 logo abaixo (420, 540). */
function isUntouchedV2(commands: any): boolean {
  if (!Array.isArray(commands?.parts) || commands.name !== 'Partida direta com emergência (LOGO!)') return false
  const h1 = commands.parts.find((p: any) => p.kind === 'lamp' && p.tag === 'H1')
  return commands.parts.length === 35 && commands.parts.every((p: any) => typeof p?.id === 'string' && p.id.startsWith('iec-'))
    && commands.parts.some((p: any) => p.kind === 'plcLogo') && h1?.x === 420 && h1?.y === 540
}

/** Esquema v3 gerado pela app (sem alterações): LOGO! de 220 px, H1 em (420, 600) e sem H3. */
function isUntouchedV3(commands: any): boolean {
  if (!Array.isArray(commands?.parts) || commands.name !== 'Partida direta com emergência (LOGO!)') return false
  const h1 = commands.parts.find((p: any) => p.kind === 'lamp' && p.tag === 'H1')
  return commands.parts.length === 35 && commands.parts.every((p: any) => typeof p?.id === 'string' && p.id.startsWith('iec-'))
    && commands.parts.some((p: any) => p.kind === 'plcLogo') && h1?.x === 420 && h1?.y === 600
    && !commands.parts.some((p: any) => p.tag === 'H3' || p.kind === 'voltmeter')
}

/** Esquema v4 gerado pela app (sem alterações): voltímetro P1 nos 24 V da página de comando. */
function isUntouchedV4(commands: any): boolean {
  if (!Array.isArray(commands?.parts) || commands.name !== 'Partida direta com emergência (LOGO!)') return false
  return commands.parts.length === 42 && commands.parts.every((p: any) => typeof p?.id === 'string' && p.id.startsWith('iec-'))
    && commands.parts.some((p: any) => p.kind === 'voltmeter' && p.tag === 'P1') && !commands.parts.some((p: any) => p.tag === 'MM1')
}

/** Símbolos e cabos iguais aos da semente atual (as legendas passam a textos livres ao abrir, por isso não contam). */
function isUntouchedCurrent(commands: any): boolean {
  if (!Array.isArray(commands?.parts) || !Array.isArray(commands?.wires)) return false
  const fresh = buildNativeIecSchematic()
  const norm = (list: unknown[]) => JSON.stringify(list.map((item) => JSON.parse(JSON.stringify(item))).sort((a: any, b: any) => String(a.id).localeCompare(String(b.id))))
  return norm(commands.parts) === norm(fresh.parts) && norm(commands.wires) === norm(fresh.wires)
}

/** Projetos nativos: recebem o esquema IEC uma vez; um v1…v6 intacto passa à versão atual. Nunca substitui um esquema do utilizador. */
export function addNativeIecSchematic<T extends Record<string, any>>(content: T): T {
  if (content.nativeId !== NATIVE_PARTIDA_ID) return content
  const features: string[] = Array.isArray(content.nativeFeatures) ? content.nativeFeatures.filter((v: unknown) => typeof v === 'string') : []
  if (features.includes(NATIVE_IEC_V7_FEATURE)) return content
  const hasOwn = Array.isArray(content.commands?.parts) && content.commands.parts.length > 0
  // v5/v6 intacto: símbolos e cabos exatamente iguais aos da semente atual (só faltam as legendas novas).
  // Comparar só os ids («iec-…») substituía também esquemas com símbolos movidos pelo utilizador.
  const sameAsCurrent = isUntouchedCurrent(content.commands)
  const untouched =
    !hasOwn
    || isUntouchedV1(content.commands)
    || isUntouchedV2(content.commands)
    || isUntouchedV3(content.commands)
    || isUntouchedV4(content.commands)
    || sameAsCurrent
  const marks = [
    ...features,
    ...[NATIVE_IEC_FEATURE, NATIVE_IEC_V2_FEATURE, NATIVE_IEC_V3_FEATURE, NATIVE_IEC_V4_FEATURE, NATIVE_IEC_V5_FEATURE, NATIVE_IEC_V6_FEATURE]
      .filter((f) => !features.includes(f)),
    NATIVE_IEC_V7_FEATURE,
  ]
  return { ...content, ...(untouched ? { commands: buildNativeIecSchematic() } : {}), nativeFeatures: marks }
}
