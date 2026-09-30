import { getLocalSession } from '../auth/localBackend'
import { recordLocalAudit } from '../auth/auditLocal'
import type { Contribution, ContributionFilter, ContributionInput, ContribStats, ContributionStatus } from './types'
import { readValidationHead, safeFileName, validateFile, validateInput } from './validate'
import type { ContribBackend } from './contribApi'

const META_KEY = 'dcsimu:contrib:meta:v1'
const DB_NAME = 'dcsimu-contrib'
const STORE = 'files'

function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE) }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
    request.onblocked = () => reject(new Error('Base de dados bloqueada por outro separador.'))
  })
}

async function fileOp<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore, done: (value: T) => void) => void): Promise<T> {
  const db = await database()
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode)
      let result: T
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error ?? new Error('Operação cancelada.'))
      tx.oncomplete = () => resolve(result)
      run(tx.objectStore(STORE), (value) => { result = value })
    })
  } finally { db.close() }
}

function readMeta(): Contribution[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(META_KEY) || '[]')
    return Array.isArray(parsed) ? parsed as Contribution[] : []
  } catch { return [] }
}

function writeMeta(items: Contribution[]) {
  try { localStorage.setItem(META_KEY, JSON.stringify(items)) }
  catch { throw new Error('Não foi possível guardar neste navegador. Verifique o espaço disponível.') }
}

const newId = () => (typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`)

function session() {
  const user = getLocalSession()
  if (!user) throw new Error('Inicie sessão')
  return user
}

async function checkFile(kind: Contribution['kind'], file: File) {
  const head = await readValidationHead(file)
  const result = validateFile(kind, head, file.size)
  if (!result.ok) throw new Error(result.error)
  return result.info
}

const visibleTo = (item: Contribution, userId: string, admin: boolean) => admin || item.authorId === userId || item.status === 'approved'

export function computeStats(items: Contribution[]): ContribStats {
  return {
    total: items.length,
    pending: items.filter((item) => item.status === 'pending').length,
    approved: items.filter((item) => item.status === 'approved').length,
    rejected: items.filter((item) => item.status === 'rejected').length,
    datasheets: items.filter((item) => item.kind === 'datasheet').length,
    models: items.filter((item) => item.kind === 'model3d').length,
    bytes: items.reduce((sum, item) => sum + item.size, 0),
  }
}

export function applyFilter(items: Contribution[], filter: ContributionFilter | undefined, userId: string): Contribution[] {
  return items
    .filter((item) => (!filter?.status || item.status === filter.status)
      && (!filter?.kind || item.kind === filter.kind)
      && (!filter?.componentType || item.componentType === filter.componentType)
      && (!filter?.mine || item.authorId === userId))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

/** Backend no navegador: metadados em localStorage, ficheiros em IndexedDB. */
export const localContrib: ContribBackend = {
  async list(filter) {
    const user = session()
    const admin = user.role === 'admin'
    return applyFilter(readMeta().filter((item) => visibleTo(item, user.id, admin)), filter, user.id)
  },

  async submit(input: ContributionInput, file: File) {
    const user = session()
    const checked = validateInput(input)
    if (!checked.ok) throw new Error(checked.error)
    const info = await checkFile(input.kind, file)
    const now = new Date().toISOString()
    const item: Contribution = {
      id: newId(),
      kind: input.kind,
      title: input.title.trim(),
      componentType: input.componentType,
      customName: input.componentType ? undefined : (input.customName ?? '').trim(),
      description: input.description.trim(),
      fileName: safeFileName(file.name),
      size: file.size,
      authorId: user.id,
      authorName: user.name,
      authorEmail: user.email,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      glb: info,
    }
    await fileOp<void>('readwrite', (store) => { store.put(file, item.id) })
    try { writeMeta([item, ...readMeta()]) }
    catch (error) { await fileOp<void>('readwrite', (store) => { store.delete(item.id) }); throw error }
    recordLocalAudit(user, 'contribution.create', { type: 'contribution', id: item.id, label: item.title }, input.kind)
    recordLocalAudit(user, 'contribution.upload', { type: 'contribution', id: item.id, label: item.title }, `${item.fileName} · ${item.size} B`)
    return item
  },

  async update(id, patch, file) {
    const user = session()
    const items = readMeta()
    const item = items.find((entry) => entry.id === id)
    if (!item || (item.authorId !== user.id && user.role !== 'admin')) throw new Error('Contribuição não encontrada')
    if (item.authorId !== user.id) throw new Error('Só o autor pode editar a contribuição')
    if (item.status === 'approved') throw new Error('Uma contribuição aprovada já não pode ser alterada. Submeta uma nova versão.')
    const merged = { ...item, ...patch }
    const checked = validateInput({ kind: item.kind, title: merged.title, componentType: merged.componentType, customName: merged.customName, description: merged.description })
    if (!checked.ok) throw new Error(checked.error)
    if (file) {
      item.glb = await checkFile(item.kind, file)
      item.fileName = safeFileName(file.name)
      item.size = file.size
      await fileOp<void>('readwrite', (store) => { store.put(file, id) })
    }
    item.title = merged.title.trim()
    item.componentType = merged.componentType
    item.customName = merged.componentType ? undefined : (merged.customName ?? '').trim()
    item.description = merged.description.trim()
    item.status = 'pending'
    item.reviewNote = undefined
    item.reviewedBy = undefined
    item.updatedAt = new Date().toISOString()
    writeMeta(items)
    recordLocalAudit(user, 'contribution.update', { type: 'contribution', id: item.id, label: item.title })
    return item
  },

  async remove(id) {
    const user = session()
    const items = readMeta()
    const item = items.find((entry) => entry.id === id)
    if (!item) throw new Error('Contribuição não encontrada')
    const admin = user.role === 'admin'
    if (!admin && (item.authorId !== user.id || item.status === 'approved')) throw new Error('Só pode eliminar contribuições suas que ainda não foram aprovadas.')
    writeMeta(items.filter((entry) => entry.id !== id))
    await fileOp<void>('readwrite', (store) => { store.delete(id) })
    recordLocalAudit(user, 'contribution.delete', { type: 'contribution', id: item.id, label: item.title }, item.authorId === user.id ? 'pelo autor' : 'pelo administrador')
  },

  async review(id, status: ContributionStatus, note: string) {
    const user = session()
    if (user.role !== 'admin') throw new Error('Acesso reservado ao administrador')
    const items = readMeta()
    const item = items.find((entry) => entry.id === id)
    if (!item) throw new Error('Contribuição não encontrada')
    if (status === 'rejected' && !note.trim()) throw new Error('Indique o motivo da rejeição para o contribuidor.')
    item.status = status
    item.reviewNote = note.trim() || undefined
    item.reviewedBy = status === 'pending' ? undefined : user.name
    item.updatedAt = new Date().toISOString()
    writeMeta(items)
    recordLocalAudit(user, `contribution.${status}`, { type: 'contribution', id: item.id, label: item.title }, item.reviewNote ?? '')
    return item
  },

  async file(id) {
    const user = session()
    const item = readMeta().find((entry) => entry.id === id)
    if (!item || !visibleTo(item, user.id, user.role === 'admin')) throw new Error('Contribuição não encontrada')
    const blob = await fileOp<Blob | undefined>('readonly', (store, done) => {
      const request = store.get(id)
      request.onsuccess = () => done(request.result as Blob | undefined)
    })
    if (!blob) throw new Error('O ficheiro desta contribuição já não existe neste navegador.')
    return blob
  },

  async stats() {
    const user = session()
    if (user.role !== 'admin') throw new Error('Acesso reservado ao administrador')
    return computeStats(readMeta())
  },
}
