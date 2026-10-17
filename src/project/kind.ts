/** Tipo de projeto: define que editores/simuladores ficam visíveis. */
export type ProjectKind = 'all' | 'ladder' | 'grafcet'
export type WorkspaceView = 'schematic' | 'ladder' | 'grafcet' | 'monitor'

export const PROJECT_KINDS: Array<{ id: ProjectKind; label: string; short: string; detail: string }> = [
  { id: 'all', label: 'Tudo', short: 'Completo', detail: 'Esquema elétrico, 3D, Ladder, GRAFCET e monitor — o simulador completo.' },
  { id: 'ladder', label: 'Ladder', short: 'Ladder', detail: 'Só o editor Ladder, o seu simulador (scan, entradas/saídas) e o monitor.' },
  { id: 'grafcet', label: 'GRAFCET', short: 'GRAFCET', detail: 'Só o editor GRAFCET e o seu simulador (etapas, transições, entradas/saídas).' },
]

export const VIEWS_BY_KIND: Record<ProjectKind, WorkspaceView[]> = {
  all: ['schematic', 'ladder', 'grafcet', 'monitor'],
  ladder: ['ladder', 'monitor'],
  grafcet: ['grafcet'],
}

export const normalizeKind = (value: unknown): ProjectKind => (value === 'ladder' || value === 'grafcet' ? value : 'all')
export const allowedViews = (kind: ProjectKind): WorkspaceView[] => VIEWS_BY_KIND[kind]
export const defaultView = (kind: ProjectKind): WorkspaceView => VIEWS_BY_KIND[kind][0]
export const kindLabel = (kind: ProjectKind) => PROJECT_KINDS.find((k) => k.id === kind)?.label ?? 'Tudo'
export const coerceView = (view: WorkspaceView, kind: ProjectKind): WorkspaceView =>
  VIEWS_BY_KIND[kind].includes(view) ? view : defaultView(kind)
