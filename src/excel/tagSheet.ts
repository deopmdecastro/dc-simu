import type { LadderDataType, LadderTag } from '../types'
import { bitAddressOrder, normalizeBitAddress } from '../ladder/addresses'
import { defaultDataTypeFor } from '../ladder/ladderEngine'
import { foldText } from '../utils/text'
import { extractTable, headerKey, type ImportIssue, type RawSheet, type SheetData, type TableColumnSpec } from './sheetIO'

/** Tabela de entradas, saídas e memórias (Ladder e GRAFCET) ⇄ folha Excel. */

export type TagPrefix = 'I' | 'Q' | 'M' | 'T' | 'C'
export const TAG_PREFIXES: TagPrefix[] = ['I', 'Q', 'M', 'T', 'C']
export const TAG_AREA_LABEL: Record<TagPrefix, string> = { I: 'Entrada', Q: 'Saída', M: 'Memória', T: 'Temporizador', C: 'Contador' }
export const TAG_DATA_TYPES: LadderDataType[] = ['Bool', 'Time', 'Int', 'Real']

export const TAG_SHEET_NAME = 'Tags'
/** Forma aceite: Siemens byte.bit (I0.0, Q1.5, M0.3) ou legado (I1…I99, Q1…, M1…) e T/C numéricos. */
export const TAG_ADDRESS_PATTERN = /^(?:[IQM]\d{1,4}\.[0-7]|[IQMTC]\d{1,3})$/i

const TAG_COLUMNS: Record<'address' | 'name' | 'dataType' | 'comment', TableColumnSpec> = {
  address: { aliases: ['endereco', 'address', 'addr', 'operando', 'enderecologico', 'logicaladdress'], required: true },
  name: { aliases: ['nome', 'name', 'simbolo', 'symbol', 'tag', 'nomesimbolico'] },
  dataType: { aliases: ['tipo', 'tipodedados', 'datatype', 'type'] },
  comment: { aliases: ['comentario', 'comment', 'descricao', 'description', 'observacoes', 'notas'] },
}

const DATA_TYPE_ALIASES: Record<string, LadderDataType> = {
  bool: 'Bool', boolean: 'Bool', booleano: 'Bool', bit: 'Bool',
  time: 'Time', tempo: 'Time', temporizador: 'Time',
  int: 'Int', integer: 'Int', inteiro: 'Int', dint: 'Int', word: 'Int',
  real: 'Real', float: 'Real', decimal: 'Real',
}

export const canonicalAddress = (text: string) => {
  const raw = text.trim().replace(/^%/, '').replace(/\s+/g, '').toUpperCase()
  // I/Q/M → forma canónica Siemens (I3 → I0.2; I0.0 mantém-se).
  return normalizeBitAddress(raw) ?? raw
}
export const tagPrefixOf = (address: string): TagPrefix | null => {
  const prefix = canonicalAddress(address)[0] as TagPrefix | undefined
  return prefix && TAG_PREFIXES.includes(prefix) ? prefix : null
}
const addressSortKey = (address: string) => {
  const a = canonicalAddress(address)
  const bit = bitAddressOrder(a)
  if (Number.isFinite(bit) && !Number.isNaN(bit)) return bit
  return Number(a.replace(/^\D+/, '')) || 0
}

/** Ordem de apresentação: área (I, Q, M, T, C) e depois o número do endereço / bit. */
export const compareTags = (a: Pick<LadderTag, 'address'>, b: Pick<LadderTag, 'address'>) => {
  const pa = TAG_PREFIXES.indexOf(tagPrefixOf(a.address) ?? 'C') + (tagPrefixOf(a.address) ? 0 : 99)
  const pb = TAG_PREFIXES.indexOf(tagPrefixOf(b.address) ?? 'C') + (tagPrefixOf(b.address) ? 0 : 99)
  return pa - pb || addressSortKey(a.address) - addressSortKey(b.address)
}

const HEADERS = ['Área', 'Endereço', 'Nome', 'Tipo', 'Comentário']

export function tagsToSheet(tags: readonly LadderTag[]): SheetData {
  const rows = [...tags].sort(compareTags).map((tag) => {
    const prefix = tagPrefixOf(tag.address)
    return [prefix ? TAG_AREA_LABEL[prefix] : '', canonicalAddress(tag.address), tag.name === tag.address ? '' : tag.name, tag.dataType, tag.comment ?? '']
  })
  return { name: TAG_SHEET_NAME, headers: HEADERS, rows, widths: [14, 12, 28, 10, 44], lists: { 3: TAG_DATA_TYPES } }
}

const INFO_ROWS: string[][] = [
  ['Endereço', 'Siemens byte.bit: I0.0…I0.7, I1.0…, Q0.0…, M0.0…. Também legado I1…I99, Q1…, M1…. Temporizadores T1… e contadores C1…. O prefixo % é aceite e ignorado.'],
  ['Nome', 'Nome simbólico (opcional). Se estiver vazio mantém-se o nome atual ou usa-se o próprio endereço.'],
  ['Tipo', 'Bool, Time, Int ou Real. Se estiver vazio usa-se o tipo habitual do endereço (I/Q/M → Bool, T → Time, C → Int).'],
  ['Comentário', 'Texto livre (opcional).'],
  ['Área', 'Apenas informativa: é deduzida do prefixo do endereço.'],
  ['Importação', 'Pode juntar às tags existentes (atualiza por endereço) ou substituir toda a tabela. Pode usar várias folhas: todas com cabeçalho «Endereço» são lidas.'],
]

export function tagInfoSheet(): SheetData {
  return { name: 'Instruções', headers: ['Coluna', 'Descrição'], rows: INFO_ROWS, widths: [16, 100], info: true }
}

export function tagTemplateSheets(): SheetData[] {
  const example: Array<[string, string, string]> = [
    ['I0.0', 'Botao_Start', 'Botão de arranque (NA)'],
    ['I0.1', 'Botao_Stop', 'Botão de paragem (NF)'],
    ['I0.2', 'Termico_OK', 'Contacto auxiliar do relé térmico'],
    ['Q0.0', 'Contactor_KM1', 'Bobina do contactor principal'],
    ['Q0.1', 'Sinal_Marcha', 'Lâmpada de marcha'],
    ['M0.0', 'Memoria_Marcha', 'Auto-retenção'],
    ['T1', 'Atraso_Arranque', 'Temporizador TON'],
  ]
  const tags: LadderTag[] = example.map(([address, name, comment]) => ({ id: address, address, name, comment, dataType: defaultDataTypeFor(address) }))
  return [tagsToSheet(tags), tagInfoSheet()]
}

export interface ParsedTag {
  address: string
  name: string
  dataType?: LadderDataType
  comment: string
  sheet: string
  row: number
}

export interface ParseTagOptions {
  /** Devolve uma mensagem para rejeitar a linha (ex.: o GRAFCET só aceita bits I/Q/M). */
  restrict?: (tag: ParsedTag & { dataType: LadderDataType }) => string | null
}

export function parseTagSheets(sheets: RawSheet[], options: ParseTagOptions = {}): { tags: ParsedTag[]; issues: ImportIssue[]; matchedSheets: number } {
  const table = extractTable(sheets, TAG_COLUMNS)
  const issues = [...table.issues]
  const byAddress = new Map<string, ParsedTag>()
  for (const { sheet, row, cells } of table.rows) {
    const address = canonicalAddress(cells.address)
    if (!address) continue
    if (!TAG_ADDRESS_PATTERN.test(address)) {
      issues.push({ sheet, row, level: 'error', message: `Endereço «${cells.address}» inválido. Use formato Siemens (I0.0, Q0.1, M1.3) ou legado (I1, Q2, M3); T/C com número (T1, C1).` })
      continue
    }
    const typeText = headerKey(cells.dataType)
    const dataType = typeText ? DATA_TYPE_ALIASES[typeText] : undefined
    if (typeText && !dataType) issues.push({ sheet, row, level: 'warning', message: `Tipo «${cells.dataType}» desconhecido; usa-se o tipo habitual de ${address}.` })
    const tag: ParsedTag = { address, name: cells.name.trim(), dataType, comment: cells.comment.trim(), sheet, row }
    const rejection = options.restrict?.({ ...tag, dataType: dataType ?? defaultDataTypeFor(address) })
    if (rejection) { issues.push({ sheet, row, level: 'warning', message: `${address}: ${rejection}` }); continue }
    const previous = byAddress.get(address)
    if (previous) issues.push({ sheet, row, level: 'warning', message: `${address} repetido (também na linha ${previous.row}); prevalece esta linha.` })
    byAddress.set(address, tag)
  }
  if (!table.matchedSheets) issues.push({ sheet: '', row: 0, level: 'error', message: 'Nenhuma folha tem a coluna «Endereço». Transfira o modelo para ver o formato esperado.' })
  const names = new Map<string, string>()
  for (const tag of byAddress.values()) {
    const key = foldText(tag.name)
    if (!key) continue
    const other = names.get(key)
    if (other) issues.push({ sheet: tag.sheet, row: tag.row, level: 'warning', message: `O nome «${tag.name}» já é usado por ${other}.` })
    else names.set(key, tag.address)
  }
  return { tags: [...byAddress.values()].sort(compareTags), issues, matchedSheets: table.matchedSheets }
}

export type TagImportMode = 'merge' | 'replace'
export interface TagMergeResult { tags: LadderTag[]; added: number; updated: number; unchanged: number; removed: number }

/** `merge` atualiza por endereço e acrescenta as novas; `replace` fica só com as linhas importadas (mantém ids). */
export function mergeTags(current: readonly LadderTag[], incoming: readonly ParsedTag[], mode: TagImportMode, newId: () => string): TagMergeResult {
  const byAddress = new Map(current.map((tag) => [canonicalAddress(tag.address), tag]))
  let added = 0, updated = 0, unchanged = 0
  const touched = new Set<string>()
  const result = new Map<string, LadderTag>(mode === 'merge' ? [...byAddress] : [])
  for (const item of incoming) {
    const existing = byAddress.get(item.address)
    touched.add(item.address)
    if (!existing) {
      result.set(item.address, { id: newId(), address: item.address, name: item.name || item.address, dataType: item.dataType ?? defaultDataTypeFor(item.address), comment: item.comment })
      added++
      continue
    }
    const next: LadderTag = {
      ...existing,
      address: item.address,
      name: item.name || existing.name,
      dataType: item.dataType ?? existing.dataType,
      comment: item.comment || existing.comment || '',
    }
    const same = next.name === existing.name && next.dataType === existing.dataType && (next.comment ?? '') === (existing.comment ?? '') && next.address === existing.address
    result.set(item.address, same ? existing : next)
    if (same) unchanged++; else updated++
  }
  const removed = mode === 'replace' ? current.filter((tag) => !touched.has(canonicalAddress(tag.address))).length : 0
  return { tags: [...result.values()].sort(compareTags), added, updated, unchanged, removed }
}
