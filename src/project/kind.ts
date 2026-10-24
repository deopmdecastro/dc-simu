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

/**
 * Vistas do espaço de trabalho. Um projeto só GRAFCET ganha o editor Ladder
 * assim que tem Ladder gerado a partir do GRAFCET («Gerar Ladder») — o Ladder
 * fica gravado no projeto, por isso a vista mantém-se ao reabrir.
 */
export const allowedViews = (kind: ProjectKind, hasLadderProgram = false): WorkspaceView[] => {
  const views = VIEWS_BY_KIND[kind]
  return hasLadderProgram && !views.includes('ladder') ? [...views, 'ladder'] : views
}
export const normalizeKind = (value: unknown): ProjectKind => (value === 'ladder' || value === 'grafcet' ? value : 'all')
export const defaultView = (kind: ProjectKind): WorkspaceView => VIEWS_BY_KIND[kind][0]
export const kindLabel = (kind: ProjectKind) => PROJECT_KINDS.find((k) => k.id === kind)?.label ?? 'Tudo'
export const coerceView = (view: WorkspaceView, kind: ProjectKind, hasLadderProgram = false): WorkspaceView =>
  allowedViews(kind, hasLadderProgram).includes(view) ? view : defaultView(kind)
