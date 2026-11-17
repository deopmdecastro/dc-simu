/**
 * Projetos nativos disponíveis em todas as contas (incluindo o plano Free e
 * `user@dcsimu.local`) sem consumir a quota de projetos próprios do utilizador.
 *
 * A conta `admin` continua a ser proprietária das sementes persistidas na base
 * de dados (usadas na publicação da landing). As restantes contas recebem os
 * projetos nativos em falta com `owner: 'DC-Simu'` e `role: 'editor'` (0 vagas
 * de proprietário ocupadas), podendo abrir esquema 2D/IEC, quadro 3D, Ladder e
 * GRAFCET, simular, editar, guardar um rascunho isolado por utilizador, repor o
 * conteúdo de fábrica ou duplicar para um projeto próprio.
 */

import type { Project } from '../dashboard/Dashboard'
import { buildProjectPreview } from '../dashboard/projectPreview'
import {
  NATIVE_ESTRELA_KS1_ID,
  NATIVE_PARTIDA_ID,
  nativeProjectSeeds,
  type NativeProjectSeed,
} from './nativeProjects'

export const FREE_NATIVE_OWNER = 'DC-Simu'

export const FREE_NATIVE_PROJECT_IDS = [
  NATIVE_PARTIDA_ID,
  NATIVE_ESTRELA_KS1_ID,
  'grafcet-exemplo-basico',
  'grafcet-exemplo-normal',
  'grafcet-exemplo-avancado',
  'grafcet-estampagem-industrial',
  'grafcet-estampagem-guiao-1185',
] as const

const DRAFT_PREFIX = 'dcsimu:free-native-draft:v1:'

type FreeNativeDraft = {
  revision: number
  updatedAt: string
  content: unknown
}

const memoryDrafts = new Map<string, FreeNativeDraft>()

/**
 * Datas estáveis de fábrica para que projetos pessoais recentes do utilizador
 * (p.ex. «Electronica») continuem no destaque «Continuar de onde parou»,
 * mantendo Partida direta e Estrela-Triângulo logo no topo dos exemplos.
 */
function factoryUpdatedAt(seedId: string, index: number): string {
  if (seedId === NATIVE_PARTIDA_ID) return '2026-01-02T00:00:02.000Z'
  if (seedId === NATIVE_ESTRELA_KS1_ID) return '2026-01-02T00:00:01.000Z'
  const sec = String(Math.max(1, 59 - index)).padStart(2, '0')
  return `2026-01-01T00:00:${sec}.000Z`
}

/** Sementes nativas expostas a todas as contas Free / não-admin. */
export function freeNativeProjectSeeds(): NativeProjectSeed[] {
  return nativeProjectSeeds().map((seed, index) => ({
    ...seed,
    ownerId: FREE_NATIVE_OWNER,
    memberIds: [],
    revision: 0,
    updatedAt: factoryUpdatedAt(seed.id, index),
  }))
}

/** Verifica se o identificador corresponde a um projeto nativo partilhado. */
export function isFreeNativeProjectId(id: string): boolean {
  if ((FREE_NATIVE_PROJECT_IDS as readonly string[]).includes(id)) return true
  return id.startsWith('grafcet-')
}

function draftKey(userId: string, projectId: string): string {
  return `${DRAFT_PREFIX}${userId}:${projectId}`
}

export function readFreeNativeDraft(userId: string, projectId: string): FreeNativeDraft | null {
  const key = draftKey(userId, projectId)
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(key)
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<FreeNativeDraft>
        if (parsed && typeof parsed === 'object' && 'content' in parsed) {
          return {
            revision: typeof parsed.revision === 'number' && Number.isInteger(parsed.revision) ? parsed.revision : 0,
            updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date().toISOString(),
            content: parsed.content,
          }
        }
      }
    }
  } catch {
    /* localStorage indisponível ou inválido — usa cópia em memória */
  }
  const mem = memoryDrafts.get(key)
  return mem ? structuredClone(mem) : null
}

function stripHeavyCover(content: unknown): unknown {
  if (!content || typeof content !== 'object' || Array.isArray(content)) return content
  const record = content as Record<string, unknown>
  if (!('cover' in record)) return content
  const { cover: _cover, ...rest } = record
  return rest
}

export function saveFreeNativeProject(
  userId: string,
  projectId: string,
  content: unknown,
  expectedRevision?: number,
): { ok: true; revision: number; updatedAt: string } {
  const seed = freeNativeProjectSeeds().find((item) => item.id === projectId)
  if (!seed) throw new Error('Projeto nativo não encontrado.')
  const current = readFreeNativeDraft(userId, projectId)
  const currentRevision = current?.revision ?? 0
  if (typeof expectedRevision === 'number' && Number.isInteger(expectedRevision) && expectedRevision !== currentRevision) {
    throw new Error('Este projeto foi alterado noutro separador. Reabra-o antes de guardar.')
  }
  const normalized = typeof content === 'string' ? JSON.parse(content) : content
  const next: FreeNativeDraft = {
    revision: currentRevision + 1,
    updatedAt: new Date().toISOString(),
    content: normalized,
  }
  const key = draftKey(userId, projectId)
  memoryDrafts.set(key, structuredClone(next))
  try {
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(key, JSON.stringify(next))
      } catch {
        // Se a miniatura JPEG exceder a quota do browser, persiste sem a capa.
        localStorage.setItem(key, JSON.stringify({ ...next, content: stripHeavyCover(normalized) }))
      }
    }
  } catch {
    /* mantém em memoryDrafts durante a sessão */
  }
  return { ok: true, revision: next.revision, updatedAt: next.updatedAt }
}

export function resetFreeNativeProject(userId: string, projectId: string): { ok: true } {
  const seed = freeNativeProjectSeeds().find((item) => item.id === projectId)
  if (!seed) throw new Error('Projeto nativo não encontrado.')
  const key = draftKey(userId, projectId)
  memoryDrafts.delete(key)
  try {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(key)
  } catch {
    /* ignorar */
  }
  return { ok: true }
}

export function openFreeNativeProject(
  userId: string,
  projectId: string,
): { id: string; name: string; role: 'editor'; revision: number; content: unknown } {
  const seed = freeNativeProjectSeeds().find((item) => item.id === projectId)
  if (!seed) throw new Error('Projeto não encontrado.')
  const draft = readFreeNativeDraft(userId, projectId)
  return {
    id: seed.id,
    name: seed.name,
    role: 'editor',
    revision: draft?.revision ?? 0,
    content: draft ? draft.content : seed.content,
  }
}

type ExistingProjectMarker = {
  id: string
  name?: string
  nativeId?: string | null
}

function alreadyPresent(seed: NativeProjectSeed, existing: ExistingProjectMarker[]): boolean {
  return existing.some((row) => {
    if (row.id === seed.id) return true
    if (row.nativeId && row.nativeId === seed.nativeId) return true
    if (row.name && row.name === seed.name) return true
    return false
  })
}

/**
 * Devolve os resumos dos projetos nativos que ainda não constam da lista do
 * utilizador. Cada item entra como `role: 'editor'` (`owner: 'DC-Simu'`) para
 * nunca consumir o limite de projetos criados no plano Free.
 */
export function listMissingFreeNativeProjects(userId: string, existing: ExistingProjectMarker[]): Project[] {
  const seeds = freeNativeProjectSeeds()
  const out: Project[] = []
  for (const seed of seeds) {
    if (alreadyPresent(seed, existing)) continue
    const draft = readFreeNativeDraft(userId, seed.id)
    const content = draft ? draft.content : seed.content
    out.push({
      id: seed.id,
      name: seed.name,
      revision: draft?.revision ?? 0,
      updated_at: draft?.updatedAt ?? seed.updatedAt,
      preview: buildProjectPreview(content),
      owner: FREE_NATIVE_OWNER,
      role: 'editor',
    })
  }
  return out
}
