/** Legacy local draft compatibility. No project is seeded or fetched from a
 * fabricated UUID. The retained native UUID always follows the real backend.
 * Existing drafts are kept byte-for-byte until an explicit save/reset. */
import type { Project } from '../dashboard/Dashboard'
import { buildProjectPreview } from '../dashboard/projectPreview'
import type { NativeProjectSeed } from './nativeProjects'
import { isNativeProjectId, RETAINED_NATIVE_PROJECT_ID } from './nativeProjectIds'
import { NATIVE_PARTIDA_NAME, nativePartidaDiretaContent } from './nativeProjects'

export const FREE_NATIVE_OWNER = 'Rascunho local antigo'
/** Compatibility export: there are no synthetic native project cards. */
export const FREE_NATIVE_PROJECT_IDS: readonly string[] = []
const LEGACY_IDS = new Set([
  'native-partida-direta-v5', 'native-estrela-ks1-v1', 'native-quadro-distribuicao-v1',
  'grafcet-exemplo-basico', 'grafcet-exemplo-normal', 'grafcet-exemplo-avancado',
  'grafcet-estampagem-industrial', 'grafcet-estampagem-guiao-1185',
])
const DRAFT_PREFIX = 'dcsimu:free-native-draft:v1:'
type FreeNativeDraft = { revision: number; updatedAt: string; content: unknown }
const memoryDrafts = new Map<string, FreeNativeDraft>()
const draftKey = (userId: string, projectId: string) => `${DRAFT_PREFIX}${userId}:${projectId}`

export function freeNativeProjectSeeds(): NativeProjectSeed[] { return [] }
/** Public native classification, never used to intercept a cloud request. */
export function isFreeNativeProjectId(id: string): boolean { return isNativeProjectId(id) }

export function readFreeNativeDraft(userId: string, projectId: string): FreeNativeDraft | null {
  if (!LEGACY_IDS.has(projectId)) return null
  const key = draftKey(userId, projectId)
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<FreeNativeDraft>
      if (parsed && typeof parsed === 'object' && 'content' in parsed) return {
        revision: Number.isInteger(parsed.revision) ? parsed.revision! : 0,
        updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : '', content: parsed.content,
      }
    }
  } catch { /* No mutation of an invalid or unavailable local store. */ }
  const memory = memoryDrafts.get(key)
  return memory ? structuredClone(memory) : null
}
export function hasLegacyFreeNativeDraft(userId: string, projectId: string): boolean {
  return LEGACY_IDS.has(projectId) && !!readFreeNativeDraft(userId, projectId)
}

export function saveFreeNativeProject(userId: string, projectId: string, content: unknown, expectedRevision?: number): { ok: true; revision: number; updatedAt: string } {
  const current = readFreeNativeDraft(userId, projectId)
  if (!current) throw new Error('Rascunho local antigo não encontrado. O projeto cloud deve ser aberto pelo serviço real.')
  if (expectedRevision !== undefined && expectedRevision !== current.revision) throw new Error('Este projeto foi alterado noutro separador. Reabra-o antes de guardar.')
  const next: FreeNativeDraft = { revision: current.revision + 1, updatedAt: new Date().toISOString(), content: typeof content === 'string' ? JSON.parse(content) : content }
  // Persist first; a quota failure must not report an unpersisted successful save.
  if (typeof localStorage !== 'undefined') localStorage.setItem(draftKey(userId, projectId), JSON.stringify(next))
  memoryDrafts.set(draftKey(userId, projectId), structuredClone(next))
  return { ok: true, revision: next.revision, updatedAt: next.updatedAt }
}
/** An explicit deletion removes only this user's legacy draft, never a project row. */
export function resetFreeNativeProject(userId: string, projectId: string): { ok: true } {
  if (!hasLegacyFreeNativeDraft(userId, projectId)) throw new Error('Rascunho local antigo não encontrado.')
  if (typeof localStorage !== 'undefined') localStorage.removeItem(draftKey(userId, projectId))
  memoryDrafts.delete(draftKey(userId, projectId))
  return { ok: true }
}
export function openFreeNativeProject(userId: string, projectId: string): { id: string; name: string; role: 'editor'; revision: number; content: unknown } {
  const draft = readFreeNativeDraft(userId, projectId)
  if (!draft) throw new Error('Rascunho local antigo não encontrado.')
  const name = draft.content && typeof draft.content === 'object' && typeof (draft.content as Record<string, unknown>).projectName === 'string'
    ? String((draft.content as Record<string, unknown>).projectName) : `Rascunho local · ${projectId}`
  return { id: projectId, name, role: 'editor', revision: draft.revision, content: draft.content }
}
/** Cartão estável do projeto nativo de exemplo (partida direta) para todas as contas. */
export function retainedNativeProjectCard(content?: unknown): Project {
  const body = content && typeof content === 'object' ? content : nativePartidaDiretaContent()
  return {
    id: RETAINED_NATIVE_PROJECT_ID,
    name: NATIVE_PARTIDA_NAME,
    revision: 0,
    updated_at: new Date(0).toISOString(),
    preview: buildProjectPreview(body),
    owner: 'Projeto nativo',
    role: 'editor',
  }
}

/** Conteúdo embutido do projeto nativo retido (abertura sem membership no Supabase). */
export function openRetainedNativeProject(): { id: string; name: string; role: 'editor'; revision: number; content: unknown } {
  return {
    id: RETAINED_NATIVE_PROJECT_ID,
    name: NATIVE_PARTIDA_NAME,
    role: 'editor',
    revision: 0,
    content: nativePartidaDiretaContent(),
  }
}

/** Exposes only drafts that ALREADY exist. No name-based deduplication or seeds.
 *  Additionally always surfaces the retained native example when absent from the list. */
export function listMissingFreeNativeProjects(userId: string, existing: Array<{ id: string; name?: string; nativeId?: string | null }>): Project[] {
  const found: Project[] = []
  for (const id of LEGACY_IDS) {
    if (existing.some(row => row.id === id)) continue
    const draft = readFreeNativeDraft(userId, id)
    if (!draft) continue
    found.push({ id, name: openFreeNativeProject(userId, id).name, revision: draft.revision, updated_at: draft.updatedAt, preview: buildProjectPreview(draft.content), owner: FREE_NATIVE_OWNER, role: 'editor' })
  }
  // Projeto nativo retido: visível em todas as contas (free e pagas), mesmo sem membership.
  if (!existing.some((row) => row.id === RETAINED_NATIVE_PROJECT_ID)
      && !found.some((row) => row.id === RETAINED_NATIVE_PROJECT_ID)) {
    found.push(retainedNativeProjectCard())
  }
  return found
}
