/** Tipo de projeto: define que editores/simuladores ficam visíveis. */
export type ProjectKind = 'all' | 'schematic' | 'ladder' | 'grafcet' | 'commands'
export type WorkspaceView = 'schematic' | 'ladder' | 'grafcet' | 'commands' | 'monitor'

export const PROJECT_KINDS: Array<{ id: ProjectKind; label: string; short: string; detail: string }> = [
  { id: 'all', label: 'Tudo', short: 'Completo', detail: '3D Realista, Esquema IEC, Ladder, GRAFCET e monitor — o simulador completo.' },
  { id: 'schematic', label: '3D Realista', short: '3D', detail: 'Só o painel 3D / esquema realista e o monitor. Pode adicionar Ladder, GRAFCET ou IEC depois, dentro do projeto.' },
  { id: 'commands', label: 'Esquema IEC', short: 'Esquema IEC', detail: 'Só o editor de esquemas IEC 60617 (potência e comando: contactores, botões, temporizadores, motores) e o seu simulador.' },
  { id: 'ladder', label: 'Ladder', short: 'Ladder', detail: 'Só o editor Ladder, o seu simulador (scan, entradas/saídas) e o monitor.' },
  { id: 'grafcet', label: 'GRAFCET', short: 'GRAFCET', detail: 'Só o editor GRAFCET e o seu simulador (etapas, transições, entradas/saídas).' },
]

export const VIEWS_BY_KIND: Record<ProjectKind, WorkspaceView[]> = {
  all: ['schematic', 'ladder', 'grafcet', 'commands', 'monitor'],
  schematic: ['schematic', 'monitor'],
  ladder: ['ladder', 'monitor'],
  grafcet: ['grafcet'],
  commands: ['commands'],
}

/** Módulos que se podem acrescentar a um projeto especializado. */
export const ADDABLE_MODULES: Array<{ id: WorkspaceView; title: string; detail: string }> = [
  { id: 'schematic', title: '3D / Esquema', detail: 'Painel 3D realista e continuidade elétrica.' },
  { id: 'ladder', title: 'Ladder', detail: 'Programa Ladder (OB1 / FCs) e monitor.' },
  { id: 'grafcet', title: 'GRAFCET', detail: 'Sequência GRAFCET (etapas e transições).' },
  { id: 'commands', title: 'Esquema IEC', detail: 'Potência e comando IEC 60617.' },
]

/**
 * Vistas do espaço de trabalho. Um projeto só GRAFCET ganha o editor Ladder
 * assim que tem Ladder gerado a partir do GRAFCET («Gerar Ladder»).
 * `unlockedViews` permite abrir módulos extra sem passar o tipo para «Tudo».
 */
export const allowedViews = (
  kind: ProjectKind,
  hasLadderProgram = false,
  unlockedViews: WorkspaceView[] = [],
): WorkspaceView[] => {
  const base = VIEWS_BY_KIND[kind] ?? VIEWS_BY_KIND.all
  const extra = unlockedViews.filter((view) => view !== 'monitor')
  const views = [...base]
  for (const view of extra) {
    if (!views.includes(view)) views.push(view)
  }
  if ((views.includes('ladder') || views.includes('schematic')) && !views.includes('monitor')) {
    views.push('monitor')
  }
  if (hasLadderProgram && !views.includes('ladder')) views.push('ladder')
  return views
}

export const normalizeKind = (value: unknown): ProjectKind =>
  value === 'ladder' || value === 'grafcet' || value === 'commands' || value === 'schematic' ? value : 'all'

export const normalizeUnlockedViews = (value: unknown): WorkspaceView[] => {
  if (!Array.isArray(value)) return []
  const allowed: WorkspaceView[] = ['schematic', 'ladder', 'grafcet', 'commands']
  return [...new Set(value.filter((item): item is WorkspaceView => allowed.includes(item as WorkspaceView)))]
}

export const defaultView = (kind: ProjectKind): WorkspaceView => VIEWS_BY_KIND[kind][0]
export const kindLabel = (kind: ProjectKind) => PROJECT_KINDS.find((k) => k.id === kind)?.label ?? 'Tudo'
export const coerceView = (
  view: WorkspaceView,
  kind: ProjectKind,
  hasLadderProgram = false,
  unlockedViews: WorkspaceView[] = [],
): WorkspaceView =>
  allowedViews(kind, hasLadderProgram, unlockedViews).includes(view) ? view : defaultView(kind)
