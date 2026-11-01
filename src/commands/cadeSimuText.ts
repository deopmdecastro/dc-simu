/**
 * Leitor do formato de texto do CADe SIMU 3.x («CADe_SIMU*0*3005#…», ISO-8859-1).
 *
 * Estrutura (estudada a partir de esquemas reais de arranque direto, inversão e temporização):
 *   CADe_SIMU*<k>*<código>#<segmento>*<23 números>#*<k+1>*<código>#…$$$<rodapé da folha>
 *  · segmento: «ref##borne1#borne2#…» (símbolos) ou vazio (cabos e pontos); nos textos (código 8)
 *    o texto vem depois dos números: «…*0#TEXTO*<k+1>*…»;
 *  · números: [0–7] bornes presentes (1/0), [8,9] posição do 1.º borne (ou início do cabo),
 *    [10,11] fim do cabo, [12–15] caixa do símbolo (dx, dy, w, h — o borne de baixo fica a h−3),
 *    [17] rotação em passos de 90°, [21,22] números de rede do CADe (não usados: a ligação é refeita
 *    pela geometria).
 * Unidades: 6 por polo. Ligação: pontas que coincidem; uma ponta a meio de outro cabo só liga com o
 * ponto de junção 4001 (junção em T); cruzamentos e pontas encostadas sem ponto não ligam.
 */
import type { CmdKind, CmdPart, CmdWire, CommandsDiagram } from './model'
import { CMD_PARTS } from './model'
import { DEFAULT_PAGE_ID } from './pages'
import type { CircuitImportResult } from './fluidSimCircuit'
import type { WireColor } from '../types'

export const CADE_TEXT_SIGNATURE = 'CADe_SIMU*'

interface CadRecord { index: number; code: number; segment: string; nums: number[]; text?: string }

/** Lê os registos em sequência (o índice de cada registo é conhecido: evita ambiguidades nos números). */
export function readCadeRecords(text: string): { records: CadRecord[]; footer: string } {
  if (!text.startsWith(CADE_TEXT_SIGNATURE)) throw new Error('CADe SIMU: o ficheiro não começa por «CADe_SIMU».')
  const records: CadRecord[] = []
  let pos = 'CADe_SIMU'.length
  for (let k = 0; text.startsWith(`*${k}*`, pos); k++) {
    pos += `*${k}*`.length
    const hash = text.indexOf('#', pos)
    if (hash < 0) break
    const code = Number(text.slice(pos, hash))
    const star = text.indexOf('*', hash)
    if (star < 0) break
    const segment = text.slice(hash + 1, star)
    pos = star
    const nums: number[] = []
    const num = /^\*(-?\d+)/
    while (nums.length < 23) {
      const m = num.exec(text.slice(pos, pos + 16))
      if (!m) break
      nums.push(Number(m[1]))
      pos += m[0].length
    }
    let label: string | undefined
    if (text[pos] === '#') {
      pos += 1
      if (code === 8) {
        // Texto livre: vai até ao início do registo seguinte.
        const next = text.indexOf(`*${k + 1}*`, pos)
        const end = next >= 0 ? next : text.indexOf('$$$', pos)
        label = text.slice(pos, end < 0 ? undefined : end).trim()
        pos = end < 0 ? text.length : end
      }
    }
    records.push({ index: k, code, segment, nums, ...(label !== undefined ? { text: label } : {}) })
  }
  const footerAt = text.indexOf('$$$', pos)
  return { records, footer: footerAt >= 0 ? text.slice(footerAt) : '' }
}

/** Símbolos multipolares: bornes de cima (1 3 5) e de baixo (2 4 6) a 6 unidades. */
const MULTIPOLE = new Map<number, CmdKind>([[6009, 'breaker3'], [6008, 'breaker2'], [2008, 'contact3'], [2001, 'contact3'], [6007, 'thermal3']])
/** Símbolos de dois bornes (em cima e em baixo). */
const TWO_TERMINAL = new Map<number, CmdKind>([
  [7000, 'contactNO'], [7001, 'contactNC'], [7008, 'timedNO'],
  [8000, 'pushNO'], [8001, 'pushNC'], [8017, 'thermalNC'],
  [9000, 'coil'], [9005, 'timerCoil'],
])
const WIRE_CODES = new Set([4000, 4010, 4018])
const JUNCTION = 4001
const MOTOR = 1000
const SUPPLY = 3005
const TEXT = 8
/** Desenho e simulação próprios do CADe SIMU sem equivalente no esquema (o DC-Simu clica no próprio símbolo). */
const IGNORED_NAMES: Record<number, string> = { 2: 'Retângulo/moldura', 8023: 'Botão do painel de simulação do CADe SIMU' }
const PE_WIRE = 4010

/** Escala: 6 unidades (um polo) → 40 px; múltiplos de 3 caem na grelha de 20 px. */
const S = 20 / 3
const px = (v: number) => Math.round((v * S) / 10) * 10

type Pt = { x: number; y: number }
const key = (p: Pt) => `${p.x},${p.y}`
const rotateOffset = (dx: number, dy: number, r: number): Pt => {
  const q = ((r % 4) + 4) % 4
  return q === 0 ? { x: dx, y: dy } : q === 1 ? { x: -dy, y: dx } : q === 2 ? { x: -dx, y: -dy } : { x: dy, y: -dx }
}

interface PlacedTerminal { part: string; term: number; at: Pt }

export function parseCadeSimuText(text: string, fileName = 'Importado CADe SIMU'): CircuitImportResult {
  const { records } = readCadeRecords(text)
  if (!records.length) throw new Error('CADe SIMU: nenhum registo encontrado.')
  const parts: CmdPart[] = []
  const texts: NonNullable<CommandsDiagram['texts']> = []
  const terminals: PlacedTerminal[] = []
  const segments: Array<{ a: Pt; b: Pt; pe: boolean }> = []
  const ignored = new Map<string, number>()
  const warnings: string[] = []
  const unknown = new Map<string, number>()
  let n = 0
  const nextId = () => `cad-${++n}`
  const junctions = new Set<string>()
  const coils = new Map<string, CadRecord>()
  for (const r of records) if (r.code === 9005 || r.code === 9000) coils.set(r.segment.split('#')[0].replace(/^-/, ''), r)

  for (const r of records) {
    const [x, y] = [r.nums[8] ?? 0, r.nums[9] ?? 0]
    const rot = r.nums[17] ?? 0
    const fields = r.segment.split('#')
    const tag = (fields[0] ?? '').trim().replace(/^-/, '')
    const count = r.nums.slice(0, 8).filter((v) => v === 1).length
    const labels = fields.slice(2, 2 + Math.max(count, 0)).map((s) => s.trim())
    const h = (r.nums[15] ?? 15) - 3
    const at = (dx: number, dy: number): Pt => { const o = rotateOffset(dx, dy, rot); return { x: x + o.x, y: y + o.y } }

    if (WIRE_CODES.has(r.code)) {
      segments.push({ a: { x: r.nums[8], y: r.nums[9] }, b: { x: r.nums[10], y: r.nums[11] }, pe: r.code === PE_WIRE })
      continue
    }
    if (r.code === JUNCTION) { junctions.add(key({ x, y })); continue }
    if (r.code === TEXT) {
      if (r.text) texts.push({ id: `cad-t${texts.length + 1}`, x: px(x), y: px(r.nums[11] ?? y), text: r.text, page: DEFAULT_PAGE_ID })
      continue
    }
    if (IGNORED_NAMES[r.code]) { ignored.set(IGNORED_NAMES[r.code], (ignored.get(IGNORED_NAMES[r.code]) ?? 0) + 1); continue }

    if (r.code === SUPPLY) {
      // L1 L2 L3 PE a 6 unidades (rodados com a alimentação).
      const id = nextId()
      const points = ['L1', 'L2', 'L3', 'PE'].map((_, i) => at(i * 6, 0))
      const top = Math.min(...points.map((p) => p.y)), left = Math.min(...points.map((p) => p.x))
      parts.push({ id, kind: 'supply', x: px(left) - 40, y: px(top) - 40, rot: 0, tag: '', page: DEFAULT_PAGE_ID, lines: ['L1', 'L2', 'L3', 'PE'] })
      points.forEach((p, i) => terminals.push({ part: id, term: i, at: p }))
      continue
    }
    if (r.code === MOTOR) {
      const id = nextId()
      parts.push({ id, kind: 'motor3', x: px(x), y: px(y), rot: 0, tag, page: DEFAULT_PAGE_ID })
      for (let i = 0; i < 3; i++) terminals.push({ part: id, term: i, at: at(i * 6, 0) })
      // PE do motor: terra de proteção junto ao borne.
      if (count >= 4) {
        const pe = nextId()
        const p = at(18, 0)
        parts.push({ id: pe, kind: 'ground', x: px(p.x) + 40, y: px(p.y) + 20, rot: 0, tag: 'PE', page: DEFAULT_PAGE_ID, groundVariant: 'protective' })
        terminals.push({ part: pe, term: 0, at: p })
      }
      continue
    }
    const multi = MULTIPOLE.get(r.code)
    if (multi) {
      const id = nextId()
      const poles = Math.floor(count / 2)
      const ours: string[] = []
      for (let i = 0; i < poles; i++) {
        terminals.push({ part: id, term: 2 * i, at: at(i * 6, 0) })
        terminals.push({ part: id, term: 2 * i + 1, at: at(i * 6, h) })
        ours.push(labels[i] ?? '', labels[poles + i] ?? '')
      }
      parts.push({ id, kind: multi, x: px(x), y: px(y), rot: 0, tag, page: DEFAULT_PAGE_ID, ...(customLabels(multi, ours) ? { labels: ours } : {}) })
      continue
    }
    let two = TWO_TERMINAL.get(r.code)
    if (two) {
      const id = nextId()
      const extra: Partial<CmdPart> = {}
      if (r.code === 9005) {
        // Temporizador: «A1#A2#<tipo>#<segundos>» — tipo 3 = atraso à desoperação (TOF).
        const kind = Number(fields[4]), seconds = Number(fields[5])
        if (kind === 3) two = 'timerOffCoil'
        if (Number.isFinite(seconds) && seconds > 0) extra.delayMs = seconds * 1000
      }
      if (r.code === 7008 && coils.get(tag)?.code === 9005 && Number(coils.get(tag)!.segment.split('#')[4]) === 3) two = 'timedOffNO'
      parts.push({ id, kind: two, x: px(x), y: px(y), rot: 0, tag, page: DEFAULT_PAGE_ID, ...(customLabels(two, labels.slice(0, 2)) ? { labels: labels.slice(0, 2) } : {}), ...extra })
      terminals.push({ part: id, term: 0, at: at(0, 0) }, { part: id, term: 1, at: at(0, h) })
      continue
    }
    const name = `código ${r.code}${tag ? ` (${tag})` : ''}`
    unknown.set(name, (unknown.get(name) ?? 0) + 1)
  }

  // Redes: união de cabos com pontas coincidentes ou com ponta a meio de outro num ponto de junção, e dos bornes nas pontas.
  const parent = segments.map((_, i) => i)
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])))
  const union = (a: number, b: number) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[ra] = rb }
  const onSegment = (p: Pt, s: { a: Pt; b: Pt }) => {
    const [x1, x2] = [Math.min(s.a.x, s.b.x), Math.max(s.a.x, s.b.x)], [y1, y2] = [Math.min(s.a.y, s.b.y), Math.max(s.a.y, s.b.y)]
    if (p.x < x1 || p.x > x2 || p.y < y1 || p.y > y2) return false
    return (s.b.x - s.a.x) * (p.y - s.a.y) === (s.b.y - s.a.y) * (p.x - s.a.x)
  }
  for (let i = 0; i < segments.length; i++) for (let j = i + 1; j < segments.length; j++) {
    const a = segments[i], b = segments[j]
    const ends = [a.a, a.b, b.a, b.b].map(key)
    const shared = ends.slice(0, 2).some((e) => ends.slice(2).includes(e))
    const tee = (p: Pt, s: { a: Pt; b: Pt }) => junctions.has(key(p)) && onSegment(p, s)
    if (shared || tee(a.a, b) || tee(a.b, b) || tee(b.a, a) || tee(b.b, a)) union(i, j)
  }
  const netOf = new Map<number, PlacedTerminal[]>()
  const direct = new Map<string, PlacedTerminal[]>()
  for (const t of terminals) {
    const hit = segments.findIndex((s) => key(s.a) === key(t.at) || key(s.b) === key(t.at))
    if (hit >= 0) { const r = find(hit); netOf.set(r, [...(netOf.get(r) ?? []), t]) }
    else direct.set(key(t.at), [...(direct.get(key(t.at)) ?? []), t])
  }
  const nets: Array<{ terms: PlacedTerminal[]; pe: boolean }> = []
  for (const [root, terms] of netOf) nets.push({ terms, pe: segments.some((s, i) => s.pe && find(i) === root) })
  for (const terms of direct.values()) if (terms.length > 1) nets.push({ terms, pe: false })

  const wires: CmdWire[] = []
  for (const net of nets) {
    // Cadeia pela ordem do desenho (de cima para baixo, da esquerda para a direita).
    const terms = [...net.terms].sort((a, b) => a.at.y - b.at.y || a.at.x - b.at.x)
    for (let i = 1; i < terms.length; i++) {
      const color: WireColor | undefined = net.pe ? 'green-yellow' : undefined
      wires.push({ id: `cad-w${wires.length + 1}`, a: { part: terms[i - 1].part, term: terms[i - 1].term }, b: { part: terms[i].part, term: terms[i].term }, page: DEFAULT_PAGE_ID, ...(color ? { color } : {}) })
    }
  }

  // Avisos úteis: térmicos sem elemento de potência com o mesmo nome (o CADe também os liga pelo nome).
  const tags = (kind: CmdKind) => new Set(parts.filter((p) => p.kind === kind).map((p) => p.tag))
  const heaters = tags('thermal3')
  for (const p of parts.filter((q) => q.kind === 'thermalNC' && !heaters.has(q.tag))) warnings.push(`O contacto térmico ${p.tag} (95-96) não tem relé térmico de potência com o mesmo nome: no DC-Simu dispara-se clicando no próprio contacto.`)
  const drivers = new Set(parts.filter((p) => ['coil', 'timerCoil', 'timerOffCoil'].includes(p.kind)).map((p) => p.tag))
  const orphanContacts = parts.filter((p) => ['contact3', 'contactNO', 'contactNC', 'timedNO', 'timedOffNO'].includes(p.kind) && !drivers.has(p.tag)).map((p) => p.tag)
  if (orphanContacts.length) warnings.push(`Contactos sem bobina com o mesmo nome: ${[...new Set(orphanContacts)].join(', ')}.`)
  for (const [name, c] of unknown) warnings.push(`Símbolo CADe SIMU sem correspondência (${name}) × ${c}: ficou de fora.`)
  if (!parts.length) throw new Error('CADe SIMU: nenhum símbolo reconhecido no ficheiro.')

  const name = fileName.replace(/\.cad$/i, '')
  return {
    diagram: { name, parts, wires, texts, pages: [{ id: DEFAULT_PAGE_ID, name: 'Página 1' }] },
    warnings,
    ignored: [...ignored, ...unknown].map(([kind, count]) => ({ kind, count })),
    stats: { symbols: parts.length, wires: wires.length, texts: texts.length },
  }
}

/** Marcação dos bornes diferente da de origem do símbolo (ex.: botão NF «1-2» em vez de «11-12»)? */
function customLabels(kind: CmdKind, labels: string[]): boolean {
  const defaults = CMD_PARTS[kind].terminals.map((t) => t.label)
  return labels.length === defaults.length && labels.every(Boolean) && labels.some((l, i) => l !== defaults[i])
}

