/**
 * Armazenamento chave→valor em IndexedDB para o catálogo local (modelos GLB e rascunhos com
 * centenas de KB). O localStorage tem ~5 MB por origem e rebentava com o primeiro multímetro.
 * Se o IndexedDB não existir (modo privado antigo, testes em Node) cai para a memória + localStorage.
 */
const DB_NAME = 'dcsimu-catalog'
const STORE = 'kv'

let dbPromise: Promise<IDBDatabase | null> | null = null
const memory = new Map<string, unknown>()

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') { resolve(null); return }
      const request = indexedDB.open(DB_NAME, 1)
      request.onupgradeneeded = () => { request.result.createObjectStore(STORE) }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => resolve(null)
      request.onblocked = () => resolve(null)
    } catch { resolve(null) }
  })
  return dbPromise
}

function run<T>(db: IDBDatabase, mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode)
    const request = work(tx.objectStore(STORE))
    tx.oncomplete = () => resolve(request.result)
    tx.onerror = () => reject(tx.error ?? new Error('Falha no armazenamento do navegador.'))
    tx.onabort = () => reject(tx.error ?? new Error('Sem espaço no armazenamento do navegador.'))
  })
}

export async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await openDb()
  if (!db) return memory.get(key) as T | undefined
  try { return (await run<T | undefined>(db, 'readonly', (store) => store.get(key))) } catch { return undefined }
}

export async function idbSet(key: string, value: unknown): Promise<void> {
  const db = await openDb()
  if (!db) { memory.set(key, value); return }
  await run(db, 'readwrite', (store) => store.put(value, key))
}

export async function idbDelete(key: string): Promise<void> {
  const db = await openDb()
  if (!db) { memory.delete(key); return }
  try { await run(db, 'readwrite', (store) => store.delete(key)) } catch { /* nada a apagar */ }
}

export const idbAvailable = async () => (await openDb()) !== null
