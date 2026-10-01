import { catalogApi } from './catalogApi'
import type { CatalogEntry, ComponentDefinition } from './types'

export interface ComponentCatalogBackup {
  format: 'dc-simu-component-catalog-backup'
  version: 1
  createdAt: string
  entries: CatalogEntry[]
  /** GLB publicado em base64, indexado por componente e versão. */
  glbs: Record<string, Record<string, string>>
}

const blobBase64 = async (blob: Blob) => new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onerror = () => reject(reader.error); reader.onload = () => resolve(String(reader.result).split(',')[1] ?? ''); reader.readAsDataURL(blob) })

export async function createComponentCatalogBackup(): Promise<ComponentCatalogBackup> {
  const list = await catalogApi.adminList()
  const entries = await Promise.all(list.map((entry) => catalogApi.adminGet(entry.id)))
  const glbs: Record<string, Record<string, string>> = {}
  for (const entry of entries) for (const published of entry.versions) {
    const url = await catalogApi.glbUrl(entry.id, published.version)
    try {
      const response = await fetch(url)
      if (!response.ok) throw new Error(`Falha ao incluir o GLB de ${entry.meta.name} v${published.version}.`)
      ;(glbs[entry.id] ??= {})[String(published.version)] = await blobBase64(await response.blob())
    } finally { if (url.startsWith('blob:')) URL.revokeObjectURL(url) }
  }
  return { format: 'dc-simu-component-catalog-backup', version: 1, createdAt: new Date().toISOString(), entries, glbs }
}

export function downloadComponentCatalogBackup(backup: ComponentCatalogBackup): void {
  const day = backup.createdAt.slice(0, 10)
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url; link.download = `dc-simu-componentes-${day}.dcs-components.json`
  document.body.appendChild(link); link.click(); link.remove()
  URL.revokeObjectURL(url)
}

export function parseComponentCatalogBackup(text: string): ComponentCatalogBackup {
  const value = JSON.parse(text) as Partial<ComponentCatalogBackup>
  if (value.format !== 'dc-simu-component-catalog-backup' || value.version !== 1 || !Array.isArray(value.entries)) throw new Error('O ficheiro não é um backup válido da biblioteca de componentes DC-SIMU.')
  for (const entry of value.entries) if (!entry || typeof entry.id !== 'string' || !entry.meta || (!entry.draft && !entry.versions?.length)) throw new Error('O backup contém um componente incompleto ou inválido.')
  return { ...(value as ComponentCatalogBackup), glbs: value.glbs && typeof value.glbs === 'object' ? value.glbs : {} }
}

const restorableDefinition = (entry: CatalogEntry): ComponentDefinition | null => entry.draft ?? entry.versions?.find((version) => version.version === entry.latestVersion)?.definition ?? entry.versions?.[entry.versions.length - 1]?.definition ?? null

export async function restoreComponentCatalogBackup(backup: ComponentCatalogBackup, confirmReplace: (entry: CatalogEntry) => boolean): Promise<{ restored: number; skipped: number }> {
  const current = new Set((await catalogApi.adminList()).map((entry) => entry.id))
  let restored = 0, skipped = 0
  for (const entry of backup.entries) {
    if (current.has(entry.id) && !confirmReplace(entry)) { skipped += 1; continue }
    const definition = restorableDefinition(entry)
    if (!definition) { skipped += 1; continue }
    const existed = current.has(entry.id)
    if (!existed && entry.versions?.length) {
      for (const published of [...entry.versions].sort((a, b) => a.version - b.version)) {
        const glb = backup.glbs[entry.id]?.[String(published.version)]
        if (!glb) throw new Error(`O backup não contém o GLB de «${entry.meta.name}» v${published.version}.`)
        await catalogApi.save(entry.id, entry.meta, published.definition)
        await catalogApi.publish(entry.id, { note: published.note, changes: published.changes, runtime: published.runtime, glb })
      }
    }
    // Repõe por último o rascunho editável, incluindo os assets originais.
    await catalogApi.save(entry.id, entry.meta, definition)
    if (entry.archived) await catalogApi.archive(entry.id, true)
    restored += 1
  }
  return { restored, skipped }
}
