import type {
  ComponentEditorRevision,
  ComponentEditorSnapshot,
  ElectricalComponent,
  Terminal,
} from '../types'
import { componentOrientationOf } from './componentOrientation'
import { component3DScaleOf } from './terminal3D'

export const COMPONENT_EDITOR_HISTORY_LIMIT = 12

const stableTerminals = (terminals: Terminal[]) => structuredClone(terminals).map((terminal) => ({ ...terminal, energized: false }))

/** Só captura os campos que o editor 3D pode alterar. */
export function componentEditorSnapshotOf(component: ElectricalComponent): ComponentEditorSnapshot {
  return {
    viewOrientation: structuredClone(componentOrientationOf(component)),
    terminalViewPositions: structuredClone(component.terminalViewPositions ?? {}),
    terminals: stableTerminals(component.terminals),
    view3DScale: structuredClone(component3DScaleOf(component)),
    view3DRenderMode: component.view3DRenderMode ?? 'solid',
    bodyColor: component.bodyColor,
  }
}

export function componentEditorVersionOf(component: ElectricalComponent): number {
  const value = Number(component.editorVersion)
  return Number.isInteger(value) && value >= 1 ? value : 1
}

export function componentEditorSnapshotEquals(a: ComponentEditorSnapshot, b: ComponentEditorSnapshot): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

export function componentEditorChangeLabels(before: ComponentEditorSnapshot, after: ComponentEditorSnapshot): string[] {
  const changes: string[] = []
  if (JSON.stringify(before.viewOrientation) !== JSON.stringify(after.viewOrientation)) changes.push('Vista e orientação')
  if (JSON.stringify(before.view3DScale) !== JSON.stringify(after.view3DScale)) changes.push('Escala 3D')
  if (before.view3DRenderMode !== after.view3DRenderMode) changes.push('Renderização')
  if ((before.bodyColor ?? null) !== (after.bodyColor ?? null)) changes.push('Cor do componente')
  if (JSON.stringify(before.terminalViewPositions) !== JSON.stringify(after.terminalViewPositions)) changes.push('Posição dos bornes por vista')
  if (JSON.stringify(before.terminals) !== JSON.stringify(after.terminals)) changes.push('Definição dos bornes')
  return changes
}

/** Guarda a versão atual no histórico antes de aplicar a próxima. */
export function previousComponentRevision(
  component: ElectricalComponent,
  fallbackUpdatedAt: string,
): ComponentEditorRevision {
  return {
    ...componentEditorSnapshotOf(component),
    version: componentEditorVersionOf(component),
    updatedAt: component.editorUpdatedAt ?? fallbackUpdatedAt,
    note: component.editorLastChange?.trim() || (component.editorUpdatedAt ? 'Alteração aplicada' : 'Versão inicial ou importada'),
    changes: component.editorUpdatedAt ? ['Apresentação 3D'] : ['Versão base'],
  }
}

export function nextComponentHistory(
  component: ElectricalComponent,
  previous: ComponentEditorRevision,
): ComponentEditorRevision[] {
  return [previous, ...(component.editorHistory ?? []).filter((revision) => revision.version !== previous.version)]
    .sort((a, b) => b.version - a.version)
    .slice(0, COMPONENT_EDITOR_HISTORY_LIMIT)
}

function validIsoDate(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(new Date(value).getTime())
}

/** Acrescenta metadados a projetos antigos sem alterar bornes, identidade,
 * geometria ou lógica. `savedAt` é a melhor data histórica disponível. */
export function upgradeComponentEditorMetadata(
  component: ElectricalComponent,
  savedAt?: unknown,
  migratedAt = new Date().toISOString(),
): ElectricalComponent {
  const version = componentEditorVersionOf(component)
  const updatedAt = validIsoDate(component.editorUpdatedAt)
    ? component.editorUpdatedAt
    : validIsoDate(savedAt) ? savedAt : migratedAt
  const validHistory = Array.isArray(component.editorHistory)
    && component.editorHistory.length <= COMPONENT_EDITOR_HISTORY_LIMIT
    && component.editorHistory.every((revision) => Number.isInteger(revision?.version) && revision.version >= 1)
  const history = validHistory
    ? component.editorHistory!
    : Array.isArray(component.editorHistory)
      ? component.editorHistory.filter((revision) => Number.isInteger(revision?.version) && revision.version >= 1).slice(0, COMPONENT_EDITOR_HISTORY_LIMIT)
      : []
  if (component.editorVersion === version && component.editorUpdatedAt === updatedAt
    && typeof component.editorLastChange === 'string' && validHistory) return component
  return {
    ...component,
    editorVersion: version,
    editorUpdatedAt: updatedAt,
    editorLastChange: component.editorLastChange?.trim() || (validIsoDate(savedAt) ? 'Importado de uma versão anterior do projeto' : 'Metadados de versão migrados'),
    editorHistory: history,
  }
}

export function formatComponentUpdateDate(value?: string): string {
  if (!value) return 'Data ainda não registada'
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return 'Data ainda não registada'
  return new Intl.DateTimeFormat('pt-PT', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}
