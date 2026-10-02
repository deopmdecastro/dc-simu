import { buildDefinitionObject, newId } from '../../catalog/definition'
import { detectHoles, nearestHole, type DetectedHole } from '../../catalog/holeDetect'
import { specToTerminal } from '../../catalog/terminalLayout'
import type { Face } from '../../catalog/terminalProfiles'
import type { TerminalDef, Vec3 } from '../../catalog/types'
import { glbCache, useEditorStore } from './editorStore'

/**
 * Varre uma (ou todas as) face(s) do modelo à procura de furos: encaixes de
 * bornes, fichas banana, buracos de parafuso. O resultado fica guardado no
 * editor para marcar os furos no viewport e para o clique encaixar neles.
 */
export function scanHoles(faces: Face[], options: { minDiameterMm?: number; maxDiameterMm?: number } = {}): DetectedHole[] {
  const state = useEditorStore.getState()
  const root = buildDefinitionObject(state.def, glbCache)
  const found: DetectedHole[] = []
  for (const face of faces) {
    for (const hole of detectHoles(root, face, options)) found.push({ ...hole, id: `hole-${face}-${found.length + 1}` })
  }
  // Furos já ocupados por um borne deixam de ser propostos.
  const free = found.filter((hole) => !nearestHoleTaken(hole, state.def.terminals))
  useEditorStore.getState().set({ holes: free })
  return free
}

const nearestHoleTaken = (hole: DetectedHole, terminals: TerminalDef[]) => terminals.some((terminal) => {
  const dx = terminal.position[0] - hole.position[0]
  const dy = terminal.position[1] - hole.position[1]
  const dz = terminal.position[2] - hole.position[2]
  return Math.sqrt(dx * dx + dy * dy + dz * dz) <= Math.max(2, hole.diameterMm * 0.7)
})

export function clearHoles() {
  useEditorStore.getState().set({ holes: [] })
}

/** Cria um borne encaixado no furo (centro e diâmetro do próprio furo). */
export function addTerminalInHole(hole: DetectedHole, select = true): TerminalDef {
  const state = useEditorStore.getState()
  const used = new Set(state.def.terminals.map((item) => item.label))
  let n = state.def.terminals.length + 1
  while (used.has(String(n))) n += 1
  const base = specToTerminal(
    { label: String(n), name: `Borne ${n}`, fn: '', kind: 'io', polarity: 'none', electricalClass: 'other', direction: 'io', terminalType: hole.through ? 'plug' : 'screw', color: '#cbd5e1', face: hole.face },
    hole.position, hole.normal, state.def.terminals, () => newId('t_'),
  )
  const terminal: TerminalDef = { ...base, diameterMm: Math.round(hole.diameterMm * 10) / 10 }
  state.edit((def) => ({ ...def, terminals: [...def.terminals, terminal] }))
  const left = useEditorStore.getState().holes.filter((item) => item.id !== hole.id)
  useEditorStore.getState().set({ holes: left, ...(select ? { selection: { kind: 'terminal' as const, id: terminal.id }, tab: 'terminals' as const } : {}) })
  return terminal
}

/** Cria um borne em cada furo encontrado. */
export function addTerminalsInAllHoles(): number {
  const holes = [...useEditorStore.getState().holes]
  holes.forEach((hole, index) => addTerminalInHole(hole, index === holes.length - 1))
  return holes.length
}

/** Encaixa um ponto clicado no furo mais próximo (se houver varredura feita). */
export function snapPointToHole(point: Vec3): DetectedHole | null {
  return nearestHole(useEditorStore.getState().holes, point)
}
