import type { ComponentType } from '../types'

/** PDFs do utilizador ficam apenas neste navegador, associados ao tipo (não à instância). */
export interface Datasheet { type: ComponentType; name: string; blob: Blob; updatedAt: number }
const DB_NAME = 'dcsimu-datasheets'
const STORE = 'pdfs'

function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'type' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
    request.onblocked = () => reject(new Error('Base de dados bloqueada por outro separador.'))
  })
}

async function operation<T>(mode: IDBTransactionMode, execute: (store: IDBObjectStore, resolve: (value: T) => void) => void): Promise<T> {
  const db = await database()
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode)
      let result: T
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error ?? new Error('Operação cancelada.'))
      tx.oncomplete = () => resolve(result)
      execute(tx.objectStore(STORE), (value) => { result = value })
    })
  } finally { db.close() }
}

export const getDatasheet = (type: ComponentType) => operation<Datasheet | undefined>('readonly', (store, done) => {
  const request = store.get(type)
  request.onsuccess = () => done(request.result as Datasheet | undefined)
})

export async function saveDatasheet(type: ComponentType, file: File) {
  if (file.size > 25 * 1024 * 1024) throw new Error('O PDF não pode exceder 25 MB.')
  if (file.size < 5 || new TextDecoder().decode(await file.slice(0, 5).arrayBuffer()) !== '%PDF-') throw new Error('O ficheiro selecionado não é um PDF válido.')
  const entry: Datasheet = { type, name: file.name, blob: file, updatedAt: Date.now() }
  await operation<void>('readwrite', (store) => { store.put(entry) })
  return entry
}

export const removeDatasheet = (type: ComponentType) => operation<void>('readwrite', (store) => { store.delete(type) })
