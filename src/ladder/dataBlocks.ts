import type { ProjectFile } from './projectFiles'

export type DbValue = { type: 'BOOL' | 'INT' | 'REAL'; value: boolean | number }
export type DbTable = Record<string, DbValue>

/** Formato explícito do ficheiro DB: { "nome": { "type": "INT", "value": 3 } }.
 * Nunca executa JavaScript nem avalia expressões introduzidas pelo utilizador. */
export function parseDataBlocks(files: ProjectFile[]): { values: DbTable; errors: string[] } {
  const values: DbTable = {}
  const errors: string[] = []
  for (const file of files.filter((f) => f.folder === 'dataBlocks' && f.content.trim())) {
    try {
      const data: unknown = JSON.parse(file.content)
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw Error('esperado objeto JSON')
      for (const [key, raw] of Object.entries(data)) {
        if (!/^[A-Za-z_]\w*$/.test(key) || !raw || typeof raw !== 'object' || Array.isArray(raw)) throw Error(`variável inválida: ${key}`)
        const entry = raw as Record<string, unknown>
        const type = entry.type
        const value = entry.value
        if ((type === 'BOOL' && typeof value !== 'boolean') ||
            (type === 'INT' && (typeof value !== 'number' || !Number.isSafeInteger(value))) ||
            (type === 'REAL' && (typeof value !== 'number' || !Number.isFinite(value))) ||
            (type !== 'BOOL' && type !== 'INT' && type !== 'REAL')) throw Error(`tipo ou valor inválido: ${key}`)
        values[`${file.name}.${key}`.toUpperCase()] = { type: type as DbValue['type'], value: value as boolean | number }
      }
    } catch (error) { errors.push(`${file.name}: ${error instanceof Error ? error.message : 'JSON inválido'}`) }
  }
  return { values, errors }
}

/** MOVE tipado: nunca escreve numa entrada física nem converte números em bits. */
export function moveValue(source: string, target: string, table: Record<string, boolean>, db: DbTable): boolean {
  const src = source.trim().toUpperCase()
  const dst = target.trim().toUpperCase()
  let value: boolean | number | undefined
  if (src === 'TRUE' || src === 'FALSE') value = src === 'TRUE'
  else if (src === '0' || src === '1') value = db[dst]?.type === 'INT' || db[dst]?.type === 'REAL' ? Number(src) : src === '1'
  else if (/^(?:[IQM]\d+)$/.test(src)) value = !!table[src]
  else if (src in db) value = db[src].value
  else if (/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(src)) value = Number(src)
  if (value === undefined) return false
  if (/^[QM]\d+$/.test(dst)) {
    if (typeof value !== 'boolean') return false
    table[dst] = value
    return true
  }
  const entry = db[dst]
  if (!entry || (entry.type === 'BOOL' && typeof value !== 'boolean') ||
    (entry.type === 'INT' && (typeof value !== 'number' || !Number.isSafeInteger(value))) ||
    (entry.type === 'REAL' && (typeof value !== 'number' || !Number.isFinite(value)))) return false
  entry.value = value
  return true
}
