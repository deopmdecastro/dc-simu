/** Quem está a usar o editor (para assinar mensagens e preencher a esquadria). */
export interface Viewer {
  id: string
  name: string
  jobTitle?: string | null
  institution?: string | null
  institutionKind?: 'school' | 'work' | 'own' | null
  customLogo?: string | null
  plan?: string | null
}

let current: Viewer | null = null

export function setViewer(viewer: Viewer | null) {
  current = viewer
}

export function getViewer(): Viewer {
  return current ?? { id: '', name: 'Eu' }
}
