import type { LadderDataType, LadderTag } from '../types'
import { defaultDataTypeFor } from '../ladder/ladderEngine'
import { foldText } from '../utils/text'
import { extractTable, headerKey, type ImportIssue, type RawSheet, type SheetData, type TableColumnSpec } from './sheetIO'

/** Tabela de entradas, saídas e memórias (Ladder e GRAFCET) ⇄ folha Excel. */

export type TagPrefix = 'I' | 'Q' | 'M' | 'T' | 'C'
export const TAG_PREFIXES: TagPrefix[] = ['I', 'Q', 'M', 'T', 'C']
export const TAG_AREA_LABEL: Record<TagPrefix, string> = { I: 'Entrada', Q: 'Saída', M: 'Memória', T: 'Temporizador', C: 'Contador' }
export const TAG_DATA_TYPES: LadderDataType[] = ['Bool', 'Time', 'Int', 'Real']

export const TAG_SHEET_NAME = 'Tags'
export const TAG_ADDRESS_PATTERN = /^[IQMTC]\d{1,3}$/

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

export const canonicalAddress = (text: string) => text.trim().replace(/^%/, '').replace(/\s+/g, '').toUpperCase()
export const tagPrefixOf = (address: string): TagPrefix | null => {
  const prefix = canonicalAddress(address)[0] as TagPrefix | undefined
  return prefix && TAG_PREFIXES.includes(prefix) ? prefix : null
}
const addressNumber = (address: string) => Number(address.slice(1)) || 0

/** Ordem de apresentação: área (I, Q, M, T, C) e depois o número do endereço. */
export const compareTags = (a: Pick<LadderTag, 'address'>, b: Pick<LadderTag, 'address'>) => {
  const pa = TAG_PREFIXES.indexOf(tagPrefixOf(a.address) ?? 'C') + (tagPrefixOf(a.address) ? 0 : 99)
  const pb = TAG_PREFIXES.indexOf(tagPrefixOf(b.address) ?? 'C') + (tagPrefixOf(b.address) ? 0 : 99)
  return pa - pb || addressNumber(canonicalAddress(a.address)) - addressNumber(canonicalAddress(b.address))
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
  ['Endereço', 'I1…I99 (entradas), Q1…Q99 (saídas), M1…M99 (memórias), T1… (temporizadores), C1… (contadores). O prefixo % é aceite e ignorado.'],
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
  const example: Array<[TagPrefix, number, string, string]> = [
    ['I', 1, 'Botao_Start', 'Botão de arranque (NA)'], ['I', 2, 'Botao_Stop', 'Botão de paragem (NF)'], ['I', 3, 'Termico_OK', 'Contacto auxiliar do relé térmico'],
    ['Q', 1, 'Contactor_KM1', 'Bobina do contactor principal'], ['Q', 2, 'Sinal_Marcha', 'Lâmpada de marcha'],
    ['M', 1, 'Memoria_Marcha', 'Auto-retenção'], ['T', 1, 'Atraso_Arranque', 'Temporizador TON'],
  ]
  const tags: LadderTag[] = example.map(([prefix, number, name, comment]) => ({ id: `${prefix}${number}`, address: `${prefix}${number}`, name, comment, dataType: defaultDataTypeFor(`${prefix}${number}`) }))
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
      issues.push({ sheet, row, level: 'error', message: `Endereço «${cells.address}» inválido. Use I, Q, M, T ou C seguido de um número (ex.: I1).` })
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
