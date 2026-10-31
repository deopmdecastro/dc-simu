/**
 * Importação de esquemas CADe SIMU (.cad).
 *
 * O formato .cad é proprietário e pouco documentado. Este leitor:
 *  1) tenta extrair texto legível (tags, legendas) e posições quando o ficheiro
 *     contém blocos ASCII embutidos;
 *  2) aceita um JSON intermédio exportado (ver docs/COMMANDS-IMPORT.md).
 *
 * Não executa código do CADe SIMU. A conversão completa 1:1 de binários
 * opacos ainda é parcial — os avisos listam o que ficou por mapear.
 */
import type { CmdKind, CmdPart, CmdRotation, CommandsDiagram } from './model'
import { DEFAULT_PAGE_ID } from './pages'
import type { CircuitImportResult } from './fluidSimCircuit'

const fail = (message: string): never => { throw new Error(`CADe SIMU: ${message}`) }

/** Heurística de nomes / legendas frequentes em esquemas de comando. */
const LABEL_KIND: Array<{ re: RegExp; kind: CmdKind }> = [
  { re: /\b(KM|K)\d*\b/i, kind: 'coil' },
  { re: /\b(S|SB|SF)\d*\b/i, kind: 'pushNO' },
  { re: /\b(F|FR)\d*\b/i, kind: 'thermalNC' },
  { re: /\b(Q|QM)\d*\b/i, kind: 'breaker3' },
  { re: /\b(M|MM)\d*\b/i, kind: 'motor3' },
  { re: /\b(H|HL|HLG)\d*\b/i, kind: 'lamp' },
  { re: /\b(Y|YA)\d*\b/i, kind: 'solenoid' },
  { re: /bobina|coil/i, kind: 'coil' },
  { re: /contactor|contato/i, kind: 'contactNO' },
  { re: /bot[aã]o|push/i, kind: 'pushNO' },
  { re: /emerg/i, kind: 'emergency' },
  { re: /motor/i, kind: 'motor3' },
  { re: /l[aâ]mpada|sinal/i, kind: 'lamp' },
  { re: /fus[ií]vel|fuse/i, kind: 'fuse' },
]

function guessKind(label: string): CmdKind {
  for (const { re, kind } of LABEL_KIND) if (re.test(label)) return kind
  return 'node'
}

/** JSON intermédio documentado (exportação assistida / conversor). */
export function parseCadeJson(raw: string): CircuitImportResult {
  let data: unknown
  try { data = JSON.parse(raw) } catch { fail('JSON inválido.') }
  const root = data as { format?: string; name?: string; parts?: Array<Record<string, unknown>>; wires?: Array<Record<string, unknown>>; texts?: Array<Record<string, unknown>> }
  if (root.format && root.format !== 'dc-simu-cade-import' && root.format !== 'commands-diagram') {
    fail(`formato JSON não reconhecido (${root.format}). Use format: "dc-simu-cade-import".`)
  }
  const parts: CmdPart[] = []
  let n = 0
  for (const item of root.parts ?? []) {
    const kind = (item.kind as CmdKind) || guessKind(String(item.tag || item.label || ''))
    parts.push({
      id: String(item.id || `p${++n}`),
      kind,
      x: Math.round(Number(item.x) || 0),
      y: Math.round(Number(item.y) || 0),
      rot: (Number(item.rot) || 0) as CmdRotation,
      tag: String(item.tag || item.label || ''),
      page: DEFAULT_PAGE_ID,
    })
  }
  const wires = (root.wires ?? []).map((w, i) => ({
    id: String(w.id || `w${i + 1}`),
    a: { part: String((w.a as { part?: string })?.part || ''), term: Number((w.a as { term?: number })?.term || 0) },
    b: { part: String((w.b as { part?: string })?.part || ''), term: Number((w.b as { term?: number })?.term || 0) },
    page: DEFAULT_PAGE_ID,
  })).filter((w) => w.a.part && w.b.part)

  if (!parts.length) fail('o JSON não contém símbolos.')
  return {
    diagram: { name: root.name || 'Importado CADe SIMU', parts, wires, texts: [], pages: [{ id: DEFAULT_PAGE_ID, name: 'Página 1' }] },
    warnings: ['Importação a partir de JSON intermédio.'],
    ignored: [],
    stats: { symbols: parts.length, wires: wires.length, texts: 0 },
  }
}

/**
 * Tenta ler um .cad binário: extrai sequências ASCII (tags) e dispõe-nas numa
 * grelha legível para o utilizador completar as ligações.
 */
export function parseCadeBinary(bytes: Uint8Array): CircuitImportResult {
  // JSON embutido?
  const asText = new TextDecoder('latin1').decode(bytes)
  const jsonStart = asText.indexOf('{')
  if (jsonStart >= 0 && asText.includes('"parts"')) {
    try { return parseCadeJson(asText.slice(jsonStart)) } catch { /* continua */ }
  }

  const tags = new Map<string, number>()
  const re = /\b([A-Z]{1,3}\d{1,3})\b/g
  let m: RegExpExecArray | null
  while ((m = re.exec(asText))) {
    const t = m[1]
    if (t.length < 2) continue
    tags.set(t, (tags.get(t) ?? 0) + 1)
  }
  // Filtrar ruído (só tags que aparecem poucas vezes e parecem referências IEC)
  const refs = [...tags.keys()].filter((t) => /^[KSQFMYHBT]\d{1,2}$/i.test(t)).slice(0, 80)
  if (!refs.length) {
    fail('não foi possível extrair símbolos do .cad. Exporte o esquema para JSON (ver documentação) ou redesenhe no DC-Simu a partir de um exemplo.')
  }

  const parts: CmdPart[] = refs.map((tag, i) => ({
    id: `p${i + 1}`,
    kind: guessKind(tag),
    x: 80 + (i % 8) * 100,
    y: 60 + Math.floor(i / 8) * 120,
    rot: 0 as CmdRotation,
    tag,
    page: DEFAULT_PAGE_ID,
  }))

  return {
    diagram: {
      name: 'Importado CADe SIMU (parcial)',
      parts,
      wires: [],
      texts: [{ id: 't1', x: 40, y: 0, text: 'Importação parcial .cad — complete cabos e tipos na Biblioteca', page: DEFAULT_PAGE_ID }],
      pages: [{ id: DEFAULT_PAGE_ID, name: 'Página 1' }],
    },
    warnings: [
      `${parts.length} referências detetadas no ficheiro binário.`,
      'Ligações e tipos exactos podem exigir ajuste manual — o formato .cad não é público.',
    ],
    ignored: [],
    stats: { symbols: parts.length, wires: 0, texts: 1 },
  }
}

export async function importCadeSimuFile(file: File): Promise<CircuitImportResult> {
  const buffer = new Uint8Array(await file.arrayBuffer())
  const name = file.name.toLowerCase()
  if (name.endsWith('.json') || name.endsWith('.cad.json')) {
    return parseCadeJson(new TextDecoder('utf-8').decode(buffer))
  }
  return parseCadeBinary(buffer)
}
