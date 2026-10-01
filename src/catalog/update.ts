import { createComponent } from '../electrical/factory'
import { useSimStore } from '../store/useSimStore'
import type { ComponentType, ElectricalComponent, Terminal } from '../types'
import { catalogType, type CatalogEntry } from './types'

export interface CatalogUpdateInfo {
  entry: CatalogEntry
  current: number
  latest: number
  changes: string[]
  note: string
}

/** Atualização disponível para um componente OFICIAL. Cópias independentes nunca recebem avisos. */
export function catalogUpdateInfo(component: ElectricalComponent, entries: CatalogEntry[]): CatalogUpdateInfo | null {
  const link = component.catalog
  if (!link || link.source !== 'official') return null
  const entry = entries.find((item) => item.id === link.id)
  if (!entry || entry.archived || entry.latestVersion <= link.version || link.ignoredVersion === entry.latestVersion) return null
  const newer = entry.versions.filter((version) => version.version > link.version)
  return {
    entry, current: link.version, latest: entry.latestVersion,
    changes: newer.flatMap((version) => version.changes.map((change) => `v${version.version}: ${change}`)),
    note: newer[newer.length - 1]?.note ?? '',
  }
}

const same = (a?: { x: number; y: number; z: number }, b?: { x: number; y: number; z: number }) =>
  !!a && !!b && Math.abs(a.x - b.x) < 1e-3 && Math.abs(a.y - b.y) < 1e-3 && Math.abs(a.z - b.z) < 1e-3

/**
 * Passa uma instância para a versão mais recente SEM perder a configuração do projeto:
 * mantém id, posição, estado, rotação, escala e — sobretudo — os ids dos bornes (por `defId`),
 * por isso os cabos continuam ligados. Bornes removidos que ainda têm cabos ficam como "órfãos".
 */
export function updateCatalogComponent(componentId: string, entries: CatalogEntry[]): { ok: boolean; message: string } {
  const store = useSimStore.getState()
  const component = store.components.find((item) => item.id === componentId)
  const info = component ? catalogUpdateInfo(component, entries) : null
  if (!component || !info) return { ok: false, message: 'Não há atualização disponível.' }
  const newVersion = info.entry.versions.find((version) => version.version === info.latest)
  const oldVersion = info.entry.versions.find((version) => version.version === info.current)
  if (!newVersion) return { ok: false, message: 'Versão não encontrada.' }
  const newType = catalogType(info.entry.id, info.latest) as ComponentType
  const fresh = createComponent(newType, component.ref, component.label, component.slot, component.schematicX, component.schematicY, {})
  const wired = new Set(store.wires.flatMap((wire) => [wire.fromTerminalId, wire.toTerminalId]))
  const oldByDef = new Map(component.terminals.filter((t) => t.defId).map((t) => [t.defId as string, t]))
  const oldRuntime = new Map((oldVersion?.runtime.terminals ?? []).map((t) => [t.id, t]))
  const usedIds = new Set<string>()
  const movedTerminals = new Set<string>()
  let added = 0

  const terminals: Terminal[] = fresh.terminals.map((next) => {
    const previous = next.defId ? oldByDef.get(next.defId) : undefined
    if (previous) {
      usedIds.add(previous.id)
      const before = oldRuntime.get(next.defId as string)
      const after = newVersion.runtime.terminals.find((t) => t.id === next.defId)
      if (!before || !same(before.position3D, after?.position3D)) movedTerminals.add(previous.id)
      return { ...next, id: previous.id, componentId: component.id, electricalClass: previous.electricalClass, electricalClassCustom: previous.electricalClassCustom, pinned: previous.pinned, energized: previous.energized }
    }
    added += 1
    return { ...next, id: `${component.id}-${next.label}-${next.defId ?? added}`, componentId: component.id }
  })
  const orphans = component.terminals.filter((terminal) => !usedIds.has(terminal.id) && wired.has(terminal.id))
  const removed = component.terminals.filter((terminal) => !usedIds.has(terminal.id) && !wired.has(terminal.id)).length

  const viewPositions = Object.fromEntries(Object.entries(component.terminalViewPositions ?? {}).map(([view, positions]) => [view,
    Object.fromEntries(Object.entries(positions).filter(([terminalId]) => !movedTerminals.has(terminalId))),
  ]))
  const states = newVersion.definition.states.map((state) => state.id)
  const catalogState = states.includes(component.state?.catalogState) ? component.state.catalogState : newVersion.definition.initialState
  const now = new Date().toISOString()

  store.commitHistory()
  useSimStore.setState((s) => ({
    components: s.components.map((item) => item.id !== component.id ? item : {
      ...item,
      type: newType,
      w: fresh.w, h: fresh.h,
      terminals: [...terminals, ...orphans],
      terminalViewPositions: viewPositions,
      state: { ...item.state, catalogState },
      catalog: { id: info.entry.id, version: info.latest, source: 'official' as const },
      editorVersion: (item.editorVersion ?? 1) + 1,
      editorUpdatedAt: now,
      editorLastChange: `Atualizado para a versão ${info.latest} do catálogo`,
    }),
    dirty: true,
  }))
  store.pushEvent('info', `${component.ref} atualizado para a v${info.latest} de "${info.entry.meta.name}". ${added ? `${added} borne(s) novo(s). ` : ''}${removed ? `${removed} borne(s) removido(s). ` : ''}${orphans.length ? `${orphans.length} borne(s) antigo(s) mantido(s) por terem cabos ligados.` : ''}`.trim())
  useSimStore.getState().step()
  return { ok: true, message: `Atualizado para a v${info.latest}.` }
}

export function ignoreCatalogUpdate(componentId: string, version: number) {
  useSimStore.setState((s) => ({
    components: s.components.map((item) => item.id === componentId && item.catalog ? { ...item, catalog: { ...item.catalog, ignoredVersion: version } } : item),
    dirty: true,
  }))
}

/** Torna esta instância independente do componente oficial: fica fixa na versão atual e nunca mais é avisada. */
export function duplicateAsIndependent(componentId: string, name: string) {
  const store = useSimStore.getState()
  const source = store.components.find((item) => item.id === componentId)
  if (!source?.catalog) return null
  const before = new Set(store.components.map((item) => item.id))
  store.duplicateComponents([componentId])
  const created = useSimStore.getState().components.find((item) => !before.has(item.id))
  if (!created) return null
  const at = new Date().toISOString()
  useSimStore.setState((s) => ({
    components: s.components.map((item) => item.id !== created.id ? item : {
      ...item,
      label: name.trim() || `${source.label} (cópia)`,
      catalog: { id: source.catalog!.id, version: source.catalog!.version, source: 'copy' as const, copiedFrom: { id: source.catalog!.id, version: source.catalog!.version, at } },
    }),
    dirty: true,
  }))
  return created.id
}
