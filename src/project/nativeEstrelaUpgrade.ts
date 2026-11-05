import type { ElectricalComponent, Wire } from '../types'
import { nativeEstrelaTrianguloContent, NATIVE_ESTRELA_FEATURE, NATIVE_ESTRELA_ID } from './nativeEstrelaTriangulo'

/** Assinatura da semente, independente dos ids aleatórios. Não é uma validação de segurança. */
export function estrelaSeedSignature(content: Record<string, any>): number {
  const components = (content.components ?? []) as ElectricalComponent[]
  const refs = new Map(components.map(c => [c.id, c.ref]))
  const terminals = new Map(components.flatMap(c => c.terminals.map(t => [t.id, `${c.ref}:${t.label}`] as const)))
  const steps = content.grafcet?.steps ?? []
  const stepNames = new Map(steps.map((s: any) => [s.id, s.name]))
  const source = JSON.stringify({
    components: components.map(c => [c.ref, c.type, c.label, c.schematicX, c.schematicY, c.w, c.h,
      c.rotation, c.decals, c.terminals.map(t => t.label), c.mountedOn && refs.get(c.mountedOn),
      c.panelMount && { ...c.panelMount, enclosureId: refs.get(c.panelMount.enclosureId) }]),
    wires: ((content.wires ?? []) as Wire[]).map(w => [w.number, terminals.get(w.fromTerminalId), terminals.get(w.toTerminalId), w.color, w.kind, w.waypoints]),
    steps: steps.map((s: any) => [s.name, s.initial, s.actions?.map((a: any) => [a.address, a.variable, a.condition, a.kind])]),
    transitions: (content.grafcet?.transitions ?? []).map((t: any) => [t.condition, t.from.map((id: string) => stepNames.get(id)), t.to.map((id: string) => stepNames.get(id))]),
    ladder: content.ladder, files: content.projectFiles, tags: content.tags,
  })
  let hash = 2166136261
  for (let i = 0; i < source.length; i++) hash = Math.imul(hash ^ source.charCodeAt(i), 16777619)
  return hash >>> 0
}

/** Atualiza apenas a semente v2 intacta. Projetos editados não são substituídos. */
export function upgradeNativeEstrela<T extends Record<string, any>>(content: T): T {
  if (content.nativeId !== NATIVE_ESTRELA_ID || content.nativeFeatures?.includes(NATIVE_ESTRELA_FEATURE)) return content
  if ((content.components ?? []).some((c: ElectricalComponent) => (c.editorVersion ?? 1) > 1 || c.terminals.some(t => t.pinned))) return content
  // Semente direta e a mesma semente depois do primeiro guardar/reabrir (encaixe F1).
  if (![1883026082, 2358434905].includes(estrelaSeedSignature(content))) return content
  const fresh = nativeEstrelaTrianguloContent()
  const old = content.components as ElectricalComponent[]
  const ids = new Map<string, string>()
  for (const c of fresh.components as ElectricalComponent[]) {
    const prior = old.find(p => p.ref === c.ref && p.type === c.type)
    ids.set(c.id, prior?.id ?? c.id)
    for (const t of c.terminals) ids.set(t.id, prior?.terminals.find(p => p.label === t.label)?.id ?? t.id)
  }
  const components = (fresh.components as ElectricalComponent[]).map(c => ({ ...c, id: ids.get(c.id)!,
    state: { ...c.state, ...old.find(p => p.ref === c.ref)?.state,
      ...(c.state.interlockWith ? { interlockWith: ids.get(c.state.interlockWith) } : {}),
      ...(c.type === 'plcSiemensLogo1224RC' ? { outputs: c.state.outputs } : {}),
    },
    railId: c.railId && ids.get(c.railId), mountedOn: c.mountedOn && ids.get(c.mountedOn),
    panelMount: c.panelMount && { ...c.panelMount, enclosureId: ids.get(c.panelMount.enclosureId)! },
    terminals: c.terminals.map(t => ({ ...t, id: ids.get(t.id)!, componentId: ids.get(c.id)! })),
  }))
  const wires = (fresh.wires as Wire[]).map(w => ({ ...w,
    id: (content.wires as Wire[]).find(p => p.number === w.number)?.id ?? w.id,
    fromTerminalId: ids.get(w.fromTerminalId)!, toTerminalId: ids.get(w.toTerminalId)!,
  }))
  return { ...content, components, wires, grafcet: fresh.grafcet, tags: fresh.tags,
    activePlcId: ids.get(fresh.activePlcId as string),
    nativeFeatures: [...new Set([...(content.nativeFeatures ?? []), ...(fresh.nativeFeatures as string[])])], cover: undefined,
  }
}
