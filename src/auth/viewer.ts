/** Quem está a usar o editor (para assinar mensagens dos comentários do canvas). */
export interface Viewer { id: string; name: string }

let current: Viewer | null = null

export function setViewer(viewer: Viewer | null) {
  current = viewer
}

export function getViewer(): Viewer {
  return current ?? { id: '', name: 'Eu' }
}
