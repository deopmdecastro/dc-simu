import { foldText } from '../utils/text'

/**
 * Leitura/escrita de folhas Excel (.xlsx) partilhada pelas tabelas do 3D, do Ladder e do GRAFCET.
 * A biblioteca (exceljs) só é descarregada quando o utilizador exporta ou importa uma folha.
 */

export type Cell = string | number | boolean | null

export interface SheetData {
  name: string
  headers: string[]
  rows: Cell[][]
  /** Larguras das colunas, em caracteres. */
  widths?: number[]
  /** Listas de validação por índice de coluna: o Excel passa a oferecer um menu. */
  lists?: Record<number, string[]>
  /** Folha de apoio (instruções, valores permitidos): sem filtros nem cabeçalho fixo. */
  info?: boolean
}

export interface ImportIssue {
  sheet: string
  /** Número da linha na folha (1-based); 0 quando o problema é da folha inteira. */
  row: number
  level: 'error' | 'warning'
  message: string
}

export interface TableColumnSpec {
  /** Nomes aceites no cabeçalho, já sem acentos/pontuação (ver `headerKey`). */
  aliases: string[]
  required?: boolean
}

export interface TableRow<K extends string> {
  sheet: string
  row: number
  cells: Record<K, string>
}

export const MAX_FILE_BYTES = 5 * 1024 * 1024
export const MAX_ROWS = 5000
export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

/** Chave de comparação de cabeçalhos: «Endereço lógico» → «enderecologico». */
export const headerKey = (text: string) => foldText(text).replace(/[^a-z0-9]/g, '')

/** Texto de uma célula, incluindo fórmulas, texto formatado e hiperligações. */
export function cellText(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'object') {
    const object = value as { richText?: Array<{ text: string }>; result?: unknown; text?: unknown; error?: string }
    if (object.richText) return object.richText.map((part) => part.text).join('').trim()
    if ('result' in object) return cellText(object.result)
    if ('text' in object) return cellText(object.text)
    if (object.error) return ''
  }
  return ''
}

const HEADER_FILL = 'FF1E3A5F'

export async function buildWorkbookBuffer(sheets: SheetData[]): Promise<ArrayBuffer> {
  const { default: ExcelJS } = await import('exceljs')
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'DC-Simu'
  workbook.created = new Date()
  for (const sheet of sheets) {
    const ws = workbook.addWorksheet(sheet.name.slice(0, 31))
    ws.addRow(sheet.headers)
    sheet.rows.forEach((row) => ws.addRow(row))
    ws.columns.forEach((column, index) => { column.width = sheet.widths?.[index] ?? Math.max(12, Math.min(48, (sheet.headers[index]?.length ?? 8) + 6)) })
    const header = ws.getRow(1)
    header.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } }
    header.alignment = { vertical: 'middle' }
    header.height = 22
    if (sheet.info) {
      ws.eachRow((row, number) => { if (number > 1) row.alignment = { wrapText: true, vertical: 'top' } })
      continue
    }
    ws.views = [{ state: 'frozen', ySplit: 1 }]
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sheet.headers.length } }
    for (const [column, values] of Object.entries(sheet.lists ?? {})) {
      const joined = values.join(',')
      // Os menus nativos do Excel aceitam no máximo 255 caracteres; acima disso não se limita a coluna.
      if (joined.length > 250) continue
      for (let row = 2; row <= Math.max(200, sheet.rows.length + 50); row++) {
        ws.getCell(row, Number(column) + 1).dataValidation = { type: 'list', allowBlank: true, formulae: [`"${joined}"`], showErrorMessage: false }
      }
    }
  }
  const buffer = await workbook.xlsx.writeBuffer()
  return buffer as ArrayBuffer
}

export async function downloadWorkbook(fileName: string, sheets: SheetData[]): Promise<void> {
  const buffer = await buildWorkbookBuffer(sheets)
  const url = URL.createObjectURL(new Blob([buffer], { type: XLSX_MIME }))
  const link = document.createElement('a')
  link.href = url
  link.download = fileName.endsWith('.xlsx') ? fileName : `${fileName}.xlsx`
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

export interface RawSheet { name: string; rows: string[][] }

export async function readWorkbookBuffer(buffer: ArrayBuffer): Promise<RawSheet[]> {
  const { default: ExcelJS } = await import('exceljs')
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer)
  return workbook.worksheets.map((ws) => {
    const rows: string[][] = []
    ws.eachRow({ includeEmpty: true }, (row, number) => {
      if (number > MAX_ROWS + 20) return
      const values = Array.isArray(row.values) ? row.values.slice(1) : []
      rows[number - 1] = values.map(cellText)
    })
    return { name: ws.name, rows: Array.from(rows, (row) => row ?? []) }
  })
}

export async function readWorkbookFile(file: File): Promise<RawSheet[]> {
  if (!/\.xlsx$/i.test(file.name)) throw new Error('Escolha um ficheiro Excel no formato .xlsx.')
  if (file.size > MAX_FILE_BYTES) throw new Error('O ficheiro é demasiado grande (máximo 5 MB).')
  try {
    return await readWorkbookBuffer(await file.arrayBuffer())
  } catch {
    throw new Error('Não foi possível ler o ficheiro. Confirme que é um .xlsx válido e não está protegido por palavra-passe.')
  }
}

/**
 * Localiza, em cada folha, a linha de cabeçalho (entre as primeiras 15) que contém todas as colunas
 * obrigatórias e devolve as linhas seguintes já mapeadas por coluna. Folhas sem cabeçalho reconhecido
 * (instruções, listas de apoio) são ignoradas e registadas como aviso.
 */
export function extractTable<K extends string>(sheets: RawSheet[], columns: Record<K, TableColumnSpec>): { rows: TableRow<K>[]; issues: ImportIssue[]; matchedSheets: number } {
  const keys = Object.keys(columns) as K[]
  const required = keys.filter((key) => columns[key].required)
  const rows: TableRow<K>[] = []
  const issues: ImportIssue[] = []
  let matchedSheets = 0
  for (const sheet of sheets) {
    let headerRow = -1
    let mapping: Partial<Record<K, number>> = {}
    for (let index = 0; index < Math.min(15, sheet.rows.length); index++) {
      const found: Partial<Record<K, number>> = {}
      sheet.rows[index].forEach((text, column) => {
        const key = headerKey(text)
        if (!key) return
        const match = keys.find((candidate) => found[candidate] === undefined && columns[candidate].aliases.includes(key))
        if (match) found[match] = column
      })
      // Pelo menos duas colunas reconhecidas: evita confundir uma folha de instruções («Endereço | descrição…») com a tabela.
      if (required.every((key) => found[key] !== undefined) && Object.keys(found).length >= Math.min(2, keys.length)) { headerRow = index; mapping = found; break }
    }
    if (headerRow < 0) {
      if (sheet.rows.some((row) => row.some(Boolean))) issues.push({ sheet: sheet.name, row: 0, level: 'warning', message: 'Folha ignorada: não tem as colunas esperadas.' })
      continue
    }
    matchedSheets++
    let count = 0
    for (let index = headerRow + 1; index < sheet.rows.length; index++) {
      const line = sheet.rows[index] ?? []
      if (!line.some(Boolean)) continue
      if (++count > MAX_ROWS) { issues.push({ sheet: sheet.name, row: index + 1, level: 'error', message: `Limite de ${MAX_ROWS} linhas excedido; as restantes foram ignoradas.` }); break }
      const cells = {} as Record<K, string>
      for (const key of keys) cells[key] = mapping[key] === undefined ? '' : (line[mapping[key]!] ?? '')
      rows.push({ sheet: sheet.name, row: index + 1, cells })
    }
  }
  return { rows, issues, matchedSheets }
}

/** Interpreta Sim/Não, 1/0, verdadeiro/falso… (vazio → `fallback`). */
export function parseBoolean(text: string, fallback = false): boolean {
  const value = foldText(text).trim()
  if (!value) return fallback
  return ['1', 'sim', 's', 'true', 'verdadeiro', 'yes', 'y', 'x'].includes(value)
}

/** Número com vírgula ou ponto decimal; `null` quando não é um número. */
export function parseNumber(text: string): number | null {
  const value = text.trim().replace(/\s/g, '').replace(',', '.')
  if (!value) return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}
