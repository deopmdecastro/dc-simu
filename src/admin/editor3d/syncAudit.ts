import { TEMPLATES } from '../../electrical/factory'
import type { ComponentType } from '../../types'
import type { CatalogEntry, ComponentDefinition } from '../../catalog/types'
import { builtinComponents, builtinTypeOf, flippedRuntimeTerminals, upgradeBuiltinDraft, fixFlippedTerminals } from './builtinComponents'
import { loadGlbAssets, type GlbCache } from '../../catalog/definition'

/**
 * Varrimento editor ↔ simulador (BUILTIN-SYNC-01).
 *
 * O editor 3D mostra rascunhos e todos os integrados; o simulador 3D só mostra a
 * última versão publicada (ou o integrado original, quando não há versão
 * publicada) e bloqueia integrados sem modelo GLB. Este módulo lista todas as
 * divergências e diz que ação as resolve.
 */
export type SyncIssueKind =
  | 'draft-only'        // nunca publicado → não aparece no simulador
  | 'unpublished'       // rascunho diferente da versão publicada
  | 'archived'          // arquivado → fora da biblioteca do simulador
  | 'builtin-update'    // integrado ganhou elementos/correções que o rascunho ainda não tem
  | 'draft-flipped'     // bornes do rascunho espelhados (LOGO! antigo)
  | 'published-flipped' // bornes da versão publicada espelhados → republicar
  | 'missing-terminals' // faltam bornes do integrado → cabos de projetos não ligam
  | 'builtin-locked'    // integrado sem GLB, sem versão publicada → bloqueado no simulador
  | 'blocked'           // bloqueado/arquivado nas definições de componentes

export interface SyncIssue { kind: SyncIssueKind; text: string; labels?: string[] }

export interface SyncRow {
  key: string
  name: string
  entryId?: string
  builtin?: string
  /** O que o editor tem / o que o simulador mostra. */
  editor: string
  simulator: string
  issues: SyncIssue[]
  /** Correção automática do rascunho disponível. */
  canUpgrade: boolean
  /** Publicar resolve (rascunho já correto ou depois da correção). */
  needsPublish: boolean
}

export interface SyncSettings { disabled: Record<string, string>; hidden: Record<string, true> }

/** JSON com chaves ordenadas (o Supabase/jsonb reordena as chaves). */
export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value as Record<string, unknown>).filter((key) => (value as Record<string, unknown>)[key] !== undefined).sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson((value as Record<string, unknown>)[key])}`).join(',')}}`
  }
  return JSON.stringify(value ?? null)
}

export const sameDefinition = (draft: ComponentDefinition, published: ComponentDefinition) =>
  stableJson({ ...draft, assets: {} }) === stableJson({ ...published, assets: {} })

export async function auditEntry(entry: CatalogEntry, settings: SyncSettings): Promise<SyncRow> {
  const published = entry.versions.find((version) => version.version === entry.latestVersion)
  const draft = entry.draft ?? published?.definition
  const origin = builtinTypeOf(entry) as ComponentType | null
  const issues: SyncIssue[] = []
  let canUpgrade = false, needsPublish = false
  if (entry.archived) issues.push({ kind: 'archived', text: 'Arquivado: não aparece na biblioteca do simulador.' })
  if (!published) { issues.push({ kind: 'draft-only', text: 'Só existe no editor: nunca foi publicado, por isso o simulador não o mostra.' }); needsPublish = true }
  else if (draft && !sameDefinition(draft, published.definition)) { issues.push({ kind: 'unpublished', text: `O rascunho tem alterações por publicar: o simulador mostra a v${published.version}.` }); needsPublish = true }
  if (origin && TEMPLATES[origin] && draft) {
    const tpl = TEMPLATES[origin]
    const labels = new Set(draft.terminals.map((terminal) => terminal.label))
    const missing = tpl.terminals.map((terminal) => terminal.label).filter((label) => !labels.has(label))
    if (missing.length) issues.push({ kind: 'missing-terminals', labels: missing, text: `Faltam bornes do integrado (${missing.join(', ')}): cabos ligados a estes bornes nos projetos ficam soltos.` })
    const probe: ComponentDefinition = JSON.parse(JSON.stringify(draft))
    const cache: GlbCache = new Map()
    try { await loadGlbAssets(probe, cache) } catch { /* modelo em falta: só se compara o resto */ }
    const flipped = fixFlippedTerminals(origin, probe, cache)
    if (flipped.length) issues.push({ kind: 'draft-flipped', labels: flipped, text: `Bornes invertidos no rascunho (${flipped.join(', ')}): a parte de baixo está em cima.` })
    let upgraded: ComponentDefinition | null = null
    try { upgraded = await upgradeBuiltinDraft(origin, draft) } catch { upgraded = null }
    if (upgraded) {
      canUpgrade = true
      if (!flipped.length || !sameDefinition(upgraded, probe)) issues.push({ kind: 'builtin-update', text: 'O integrado tem elementos/correções novos (botões, LCD, placa de bornes, posições) que o rascunho ainda não tem.' })
    }
    if (published) {
      const pubFlipped = flippedRuntimeTerminals(origin, published.runtime.terminals)
      if (pubFlipped.length) { issues.push({ kind: 'published-flipped', labels: pubFlipped, text: `A versão publicada v${published.version} tem bornes invertidos (${pubFlipped.join(', ')}): é preciso republicar.` }); needsPublish = true }
    }
    if (canUpgrade) needsPublish = true
  }
  const type = published ? `cat:${entry.id}:v${published.version}` : null
  if (type && (settings.disabled[type] || settings.hidden[type])) issues.push({ kind: 'blocked', text: settings.hidden[type] ? 'Ocultado nas definições de componentes.' : `Bloqueado nas definições: ${settings.disabled[type]}` })
  return {
    key: `cat:${entry.id}`, name: entry.meta.name, entryId: entry.id, builtin: origin ?? undefined,
    editor: published ? `Rascunho${needsPublish && !canUpgrade ? ' alterado' : ''} · v${entry.latestVersion} publicada` : 'Rascunho (nunca publicado)',
    simulator: entry.archived || !published ? 'Não aparece' : origin ? `v${published.version} (substitui o integrado)` : `v${published.version}`,
    issues, canUpgrade, needsPublish: needsPublish && !entry.archived,
  }
}

/** Integrados que não têm cópia no catálogo: só divergem se não tiverem GLB ou estiverem bloqueados. */
export function auditBuiltins(entries: CatalogEntry[], settings: SyncSettings): SyncRow[] {
  const imported = new Set(entries.filter((entry) => !entry.archived && entry.latestVersion > 0).map(builtinTypeOf).filter(Boolean) as string[])
  return builtinComponents().flatMap((info) => {
    if (imported.has(info.type)) return []
    const issues: SyncIssue[] = []
    if (!info.hasVisual) issues.push({ kind: 'builtin-locked', text: 'Sem representação 3D: aparece no editor mas está bloqueado no simulador. Importe um modelo no editor e publique-o para o desbloquear.' })
    if (settings.hidden[info.type]) issues.push({ kind: 'blocked', text: 'Ocultado nas definições de componentes.' })
    else if (settings.disabled[info.type]) issues.push({ kind: 'blocked', text: `Bloqueado nas definições: ${settings.disabled[info.type]}` })
    if (!issues.length) return []
    const editor = info.hasModel ? 'Integrado (GLB)' : info.hasVisual ? 'Integrado (conjunto de bornes)' : 'Integrado (volume, sem GLB)'
    return [{ key: `builtin:${info.type}`, name: info.name, builtin: info.type, editor, simulator: info.hasVisual ? 'Integrado' : 'Bloqueado (sem GLB)', issues, canUpgrade: false, needsPublish: false }]
  })
}

export async function auditCatalogSync(entries: CatalogEntry[], settings: SyncSettings): Promise<SyncRow[]> {
  const rows: SyncRow[] = []
  for (const entry of entries) {
    const row = await auditEntry(entry, settings)
    if (row.issues.length) rows.push(row)
  }
  return [...rows, ...auditBuiltins(entries, settings)]
}

/** Aplica no rascunho as correções automáticas do integrado (bornes invertidos, elementos novos). */
export async function syncDraft(entryId: string): Promise<boolean> {
  const { catalogApi } = await import('../../catalog/catalogApi')
  const source = await catalogApi.adminGet(entryId)
  const origin = builtinTypeOf(source) as ComponentType | null
  const current = source.draft ?? source.versions[source.versions.length - 1]?.definition
  if (!origin || !current) return false
  const upgraded = await upgradeBuiltinDraft(origin, current)
  if (!upgraded) return false
  await catalogApi.save(entryId, source.meta, upgraded)
  return true
}

/** Publica o rascunho atual sem abrir o editor (mesmo caminho do diálogo «Publicar»). */
export async function publishDraft(entryId: string, note = 'Sincronização editor ↔ simulador'): Promise<number> {
  const [{ catalogApi }, definition, { validateDefinition }] = await Promise.all([import('../../catalog/catalogApi'), import('../../catalog/definition'), import('./validate')])
  const source = await catalogApi.adminGet(entryId)
  const def = source.draft ?? source.versions[source.versions.length - 1]?.definition
  if (!def) throw new Error('Componente sem rascunho.')
  const errors = validateDefinition(def, source.meta).filter((issue) => issue.level === 'error')
  if (errors.length) throw new Error(`«${source.meta.name}»: ${errors.map((issue) => issue.text).join('; ')}`)
  const cache: GlbCache = new Map()
  await definition.loadGlbAssets(def, cache)
  const runtime = definition.runtimeSpec(def, definition.boundsMm(def, cache))
  const glb = await definition.bakeGlb(def, cache)
  if (glb.length > 6_000_000) throw new Error(`«${source.meta.name}»: o modelo 3D é demasiado grande para publicar.`)
  const before = source.versions.find((version) => version.version === source.latestVersion)?.definition ?? null
  const published = await catalogApi.publish(entryId, { note, changes: definition.describeChanges(before, def), runtime, glb })
  return published.latestVersion
}
