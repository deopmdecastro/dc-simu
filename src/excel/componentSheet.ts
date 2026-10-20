import type { ComponentType, ElectricalComponent } from '../types'
import { TEMPLATES, paletteGroups } from '../electrical/factory'
import { hasComponent3DModel } from '../three/modelPaths'
import { componentPanelXY } from '../three/panelLayout'
import { PANEL_UNITS_PER_MM } from '../three/modelPaths'
import { extractTable, headerKey, parseBoolean, parseNumber, type ImportIssue, type RawSheet, type SheetData, type TableColumnSpec } from './sheetIO'

/** Tabela de componentes do projeto (Esquema 2D / Painel 3D) ⇄ folha Excel. */

export const COMPONENT_SHEET_NAME = 'Componentes'
export const TYPES_SHEET_NAME = 'Tipos disponíveis'
export const ROTATIONS = [0, 90, 180, 270] as const

const COLUMNS: Record<'ref' | 'type' | 'code' | 'label' | 'x' | 'y' | 'rotation' | 'mirrored' | 'locked' | 'rail' | 'railOffset', TableColumnSpec> = {
  ref: { aliases: ['ref', 'referencia', 'tag', 'identificacao', 'id'], required: true },
  type: { aliases: ['tipo', 'componente', 'modelo', 'type', 'equipamento'], required: true },
  code: { aliases: ['codigo', 'codigotipo', 'typeid', 'code'] },
  label: { aliases: ['nome', 'descricao', 'label', 'name', 'description'] },
  x: { aliases: ['xmm', 'x', 'posicaox', 'posx'] },
  y: { aliases: ['ymm', 'y', 'posicaoy', 'posy'] },
  rotation: { aliases: ['rotacao', 'rotation', 'angulo', 'rot'] },
  mirrored: { aliases: ['espelhado', 'mirrored', 'espelho'] },
  locked: { aliases: ['bloqueado', 'locked', 'fixo'] },
  rail: { aliases: ['calha', 'calhadin', 'rail', 'trilho'] },
  railOffset: { aliases: ['posicaonacalhamm', 'posicaonacalha', 'railoffset', 'offsetcalha', 'distanciacalhamm'] },
}

const HEADERS = ['Ref', 'Tipo', 'Código', 'Nome', 'X (mm)', 'Y (mm)', 'Rotação', 'Espelhado', 'Bloqueado', 'Calha', 'Posição na calha (mm)']
const WIDTHS = [10, 38, 22, 28, 10, 10, 10, 11, 11, 10, 20]

/** Linha da tabela de componentes (editável no diálogo e lida do Excel). */
export interface ComponentRow {
  ref: string
  /** Código do tipo (`contactor`, `buttonNO`…), já resolvido; vazio enquanto não for válido. */
  type: ComponentType | ''
  label: string
  xMm: number | null
  yMm: number | null
  rotation: number | null
  mirrored: boolean | null
  locked: boolean | null
  rail: string
  railOffsetMm: number | null
}

export const emptyComponentRow = (): ComponentRow => ({ ref: '', type: '', label: '', xMm: null, yMm: null, rotation: null, mirrored: null, locked: null, rail: '', railOffsetMm: null })

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export interface ComponentTypeOption { type: ComponentType; name: string; group: string }

export function componentTypeOptions(): ComponentTypeOption[] {
  return paletteGroups().flatMap(({ group, items }) => items.filter((item) => hasComponent3DModel(item.type)).map((item) => ({ type: item.type, name: item.name, group })))
}

/** Aceita o código (`buttonNO`) ou o nome da biblioteca («Botão NA…»), sem distinguir maiúsculas ou acentos. */
export function resolveComponentType(text: string): ComponentType | null {
  const key = headerKey(text)
  if (!key) return null
  const options = componentTypeOptions()
  return options.find((option) => headerKey(option.type) === key)?.type ?? options.find((option) => headerKey(option.name) === key)?.type ?? null
}

export const componentTypeName = (type: ComponentType | '') => (type ? TEMPLATES[type]?.paletteName ?? type : '')

// ---------------------------------------------------------------------------
// Posição: o 3D e o Esquema partilham a mesma origem; a tabela usa milímetros do centro da peça.
// ---------------------------------------------------------------------------

export const centerToMm = (component: Pick<ElectricalComponent, 'schematicX' | 'schematicY' | 'w' | 'h'>) => {
  const point = componentPanelXY(component)
  return { xMm: Math.round(point.x / PANEL_UNITS_PER_MM), yMm: Math.round(point.y / PANEL_UNITS_PER_MM) }
}

export function componentToRow(component: ElectricalComponent, all: readonly ElectricalComponent[]): ComponentRow {
  const rail = component.railId ? all.find((item) => item.id === component.railId) : undefined
  return {
    ref: component.ref,
    type: component.type,
    label: component.label,
    ...centerToMm(component),
    rotation: component.rotation,
    mirrored: !!component.mirrored,
    locked: !!component.locked,
    rail: rail?.ref ?? '',
    railOffsetMm: rail && component.railOffsetMm !== undefined ? Math.round(component.railOffsetMm) : null,
  }
}

const yesNo = (value: boolean | null) => (value === null ? '' : value ? 'Sim' : 'Não')

export function componentRowsToSheets(rows: readonly ComponentRow[]): SheetData[] {
  const data = rows.map((row) => [row.ref, componentTypeName(row.type), row.type, row.label, row.xMm, row.yMm, row.rotation, yesNo(row.mirrored), yesNo(row.locked), row.rail, row.railOffsetMm])
  const main: SheetData = { name: COMPONENT_SHEET_NAME, headers: HEADERS, rows: data, widths: WIDTHS, lists: { 6: ROTATIONS.map(String), 7: ['Sim', 'Não'], 8: ['Sim', 'Não'] } }
  const types: SheetData = { name: TYPES_SHEET_NAME, headers: ['Código', 'Nome na biblioteca', 'Grupo'], rows: componentTypeOptions().map((o) => [o.type, o.name, o.group]), widths: [26, 52, 22], info: true }
  return [main, types, componentInfoSheet()]
}

function componentInfoSheet(): SheetData {
  return {
    name: 'Instruções', headers: ['Coluna', 'Descrição'], widths: [22, 100], info: true,
    rows: [
      ['Ref', 'Identificação do equipamento (KM1, S1, F1…). Se já existir no projeto, a linha atualiza esse componente; se não existir, cria um novo. Vazia: é atribuída automaticamente.'],
      ['Tipo / Código', 'Nome da biblioteca ou código do tipo (ver folha «Tipos disponíveis»). Só é necessário para criar; num componente existente é ignorado.'],
      ['Nome', 'Descrição apresentada no inspetor (opcional).'],
      ['X (mm) / Y (mm)', 'Posição do centro da peça no Painel 3D, em milímetros, a partir do centro do painel (X para a direita, Y para cima). Vazio: posição livre mais próxima.'],
      ['Rotação', '0, 90, 180 ou 270 graus.'],
      ['Espelhado / Bloqueado', 'Sim ou Não. Vazio mantém o valor atual (ou Não, ao criar).'],
      ['Calha / Posição na calha', 'Ref da calha DIN onde o equipamento fica fixo e a distância (mm) desde o início da calha. A calha tem de existir no projeto ou na mesma tabela.'],
      ['Importação', 'Cria e atualiza componentes. Nunca apaga componentes, cabos nem ligações existentes.'],
    ],
  }
}

export function componentTemplateSheets(): SheetData[] {
  const examples: ComponentRow[] = [
    { ...emptyComponentRow(), ref: 'DIN1', type: 'dinRail15x55', label: 'Calha DIN', xMm: 0, yMm: 120 },
    { ...emptyComponentRow(), ref: 'QF1', type: 'breaker3p', label: 'Disjuntor geral', rail: 'DIN1', railOffsetMm: 20 },
    { ...emptyComponentRow(), ref: 'KM1', type: 'contactor', label: 'Contactor do motor', xMm: -60, yMm: -40, rotation: 0 },
    { ...emptyComponentRow(), ref: 'S1', type: 'buttonNO', label: 'Botão de arranque', xMm: 80, yMm: -40 },
  ]
  return componentRowsToSheets(examples.filter((row) => resolveComponentType(row.type)))
}

// ---------------------------------------------------------------------------
// Leitura e plano de importação
// ---------------------------------------------------------------------------

export interface ParsedComponentRow extends ComponentRow { sheet: string; row: number }

export function parseComponentSheets(sheets: RawSheet[]): { rows: ParsedComponentRow[]; issues: ImportIssue[] } {
  const table = extractTable(sheets, COLUMNS)
  const issues = [...table.issues]
  const rows: ParsedComponentRow[] = []
  for (const { sheet, row, cells } of table.rows) {
    const typeText = cells.code || cells.type
    const type = typeText ? resolveComponentType(typeText) : null
    if (typeText && !type) issues.push({ sheet, row, level: 'warning', message: `Tipo «${typeText}» não existe na biblioteca (ou não tem modelo 3D).` })
    const x = cells.x ? parseNumber(cells.x) : null
    const y = cells.y ? parseNumber(cells.y) : null
    const rotation = cells.rotation ? parseNumber(cells.rotation) : null
    const offset = cells.railOffset ? parseNumber(cells.railOffset) : null
    if ((cells.x && x === null) || (cells.y && y === null) || (cells.rotation && rotation === null) || (cells.railOffset && offset === null)) issues.push({ sheet, row, level: 'warning', message: 'Há valores numéricos inválidos; foram ignorados.' })
    rows.push({
      sheet, row, ref: cells.ref.trim(), type: type ?? '', label: cells.label.trim(), xMm: x, yMm: y, rotation, railOffsetMm: offset,
      mirrored: cells.mirrored ? parseBoolean(cells.mirrored) : null, locked: cells.locked ? parseBoolean(cells.locked) : null, rail: cells.rail.trim(),
    })
  }
  if (!table.matchedSheets) issues.push({ sheet: '', row: 0, level: 'error', message: 'Nenhuma folha tem as colunas «Ref» e «Tipo». Transfira o modelo para ver o formato esperado.' })
  return { rows, issues }
}

export interface PlannedComponent extends ParsedComponentRow {
  action: 'create' | 'update'
  /** Id do componente existente (apenas em `update`). */
  id?: string
  /** Ref final (atribuída automaticamente quando vinha vazia). */
  ref: string
}

const normalizeRotation = (value: number) => ((Math.round(value) % 360) + 360) % 360

/** Valida as linhas contra o projeto atual. Não altera nada: devolve o que seria criado/atualizado e os problemas. */
export function planComponentRows(rows: readonly (ComponentRow & { sheet?: string; row?: number })[], existing: readonly ElectricalComponent[]): { items: PlannedComponent[]; issues: ImportIssue[] } {
  const issues: ImportIssue[] = []
  const items: PlannedComponent[] = []
  const byRef = new Map(existing.map((component) => [headerKey(component.ref), component]))
  const seen = new Set<string>()
  const usedRefs = new Set(byRef.keys())
  const autoRef = (type: ComponentType) => {
    const tag = TEMPLATES[type].tag
    for (let index = 1; index < 10000; index++) if (!usedRefs.has(headerKey(`${tag}${index}`))) return `${tag}${index}`
    return `${tag}${Date.now()}`
  }
  rows.forEach((source, index) => {
    const sheet = source.sheet ?? COMPONENT_SHEET_NAME
    const line = source.row ?? index + 1
    const problem = (level: ImportIssue['level'], message: string) => issues.push({ sheet, row: line, level, message })
    const key = headerKey(source.ref)
    const current = key ? byRef.get(key) : undefined
    if (key && seen.has(key)) { problem('error', `Ref ${source.ref} repetida na tabela; linha ignorada.`); return }
    if (key) seen.add(key)
    const row: PlannedComponent = { ...source, sheet, row: line, action: current ? 'update' : 'create', id: current?.id }
    if (current) {
      if (source.type && source.type !== current.type) problem('warning', `${current.ref} já existe como «${componentTypeName(current.type)}»; o tipo da tabela foi ignorado.`)
      row.type = current.type
    } else {
      if (!source.type) { problem('error', `${source.ref || 'Linha sem Ref'}: indique um tipo válido para criar o componente.`); return }
      if (!hasComponent3DModel(source.type)) { problem('error', `${source.ref || source.type}: o tipo não tem modelo 3D disponível.`); return }
      if (!key) row.ref = autoRef(source.type)
      usedRefs.add(headerKey(row.ref))
    }
    if (source.rotation !== null) {
      const rotation = normalizeRotation(source.rotation)
      if (rotation % 90 !== 0) { problem('warning', `Rotação ${source.rotation}° inválida (use 0, 90, 180 ou 270); ignorada.`); row.rotation = null } else row.rotation = rotation
    }
    if ((source.xMm === null) !== (source.yMm === null)) { problem('warning', 'Para posicionar indique X e Y em conjunto; a posição foi ignorada.'); row.xMm = null; row.yMm = null }
    items.push(row)
  })
  const railRefs = new Set([...existing.filter((c) => c.type === 'dinRail15x55'), ...items.filter((r) => r.type === 'dinRail15x55')].map((c) => headerKey(c.ref)))
  for (const row of items) {
    if (!row.rail) continue
    if (!railRefs.has(headerKey(row.rail))) { issues.push({ sheet: row.sheet, row: row.row, level: 'warning', message: `Calha «${row.rail}» não encontrada; ${row.ref} fica fora de calha.` }); row.rail = ''; row.railOffsetMm = null }
  }
  return { items, issues }
}

/**
 * Reduz o plano ao que realmente muda: uma tabela exportada e reimportada sem edições não mexe em nada
 * (as posições da folha vêm arredondadas ao milímetro e não devem deslocar peças que não foram tocadas).
 */
export function reduceToChanges(items: readonly PlannedComponent[], existing: readonly ElectricalComponent[]): { items: PlannedComponent[]; unchanged: number } {
  const out: PlannedComponent[] = []
  let unchanged = 0
  for (const item of items) {
    if (item.action === 'create') { out.push(item); continue }
    const current = existing.find((component) => component.id === item.id)
    if (!current) continue
    const base = componentToRow(current, existing)
    const next: PlannedComponent = { ...item }
    if (next.label === base.label) next.label = ''
    if (next.rotation === base.rotation) next.rotation = null
    if (next.mirrored === base.mirrored) next.mirrored = null
    if (next.locked === base.locked) next.locked = null
    const offset = next.railOffsetMm ?? base.railOffsetMm ?? 0
    const railChanged = !!next.rail && (headerKey(next.rail) !== headerKey(base.rail) || offset !== (base.railOffsetMm ?? 0))
    const moved = next.xMm !== null && next.yMm !== null && (next.xMm !== base.xMm || next.yMm !== base.yMm)
    if (railChanged) { next.railOffsetMm = offset; next.xMm = null; next.yMm = null } else { next.rail = ''; next.railOffsetMm = null }
    if (!moved && !railChanged) { next.xMm = null; next.yMm = null }
    const nothing = !next.label && next.rotation === null && next.mirrored === null && next.locked === null && next.xMm === null && !next.rail
    if (nothing) unchanged++
    else out.push(next)
  }
  return { items: out, unchanged }
}
