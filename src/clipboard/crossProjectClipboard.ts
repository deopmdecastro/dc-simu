/**
 * Área de transferência entre projetos (mesmo navegador).
 *
 * O clipboard interno do Zustand e o useRef do GRAFCET perdem-se ao mudar de
 * projeto ou ao recarregar a página. Este módulo grava uma cópia em
 * localStorage (e, quando possível, no clipboard do sistema em texto JSON)
 * para que Ctrl+C num projeto e Ctrl+V noutro funcionem.
 */

export type CrossClipKind = 'electrical' | 'grafcet'

export interface ElectricalCrossClip {
  kind: 'electrical'
  version: 1
  copiedAt: string
  sourceProject?: string | null
  components: unknown[]
  wires: unknown[]
  ladder?: unknown[]
}

export interface GrafcetCrossClip {
  kind: 'grafcet'
  version: 1
  copiedAt: string
  sourceProject?: string | null
  /** Subconjunto do diagrama: etapas + transições internas + posições. */
  stepIds: string[]
  steps: unknown[]
  transitions: unknown[]
  positions: Array<{ id: string; x: number; y: number }>
}

export type CrossProjectClip = ElectricalCrossClip | GrafcetCrossClip

const STORAGE_KEY = 'dc-simu.cross-project-clipboard.v1'
const CLIP_MIME_PREFIX = 'dc-simu-clipboard:'

function safeParse(raw: string | null): CrossProjectClip | null {
  if (!raw) return null
  try {
    const text = raw.startsWith(CLIP_MIME_PREFIX) ? raw.slice(CLIP_MIME_PREFIX.length) : raw
    const data = JSON.parse(text) as CrossProjectClip
    if (!data || (data.kind !== 'electrical' && data.kind !== 'grafcet')) return null
    if (data.version !== 1) return null
    return data
  } catch {
    return null
  }
}

export function readCrossClipboard(): CrossProjectClip | null {
  try {
    return safeParse(localStorage.getItem(STORAGE_KEY))
  } catch {
    return null
  }
}

export function readElectricalCrossClipboard(): ElectricalCrossClip | null {
  const clip = readCrossClipboard()
  return clip?.kind === 'electrical' ? clip : null
}

export function readGrafcetCrossClipboard(): GrafcetCrossClip | null {
  const clip = readCrossClipboard()
  return clip?.kind === 'grafcet' ? clip : null
}

function writeStorage(clip: CrossProjectClip) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(clip))
  } catch {
    // quota / private mode — o clipboard em memória continua a funcionar
  }
  try {
    const payload = CLIP_MIME_PREFIX + JSON.stringify(clip)
    void navigator.clipboard?.writeText?.(payload)
  } catch {
    // permissão negada — ignora
  }
}

export function writeElectricalCrossClipboard(payload: {
  components: unknown[]
  wires: unknown[]
  ladder?: unknown[]
  sourceProject?: string | null
}): ElectricalCrossClip {
  const clip: ElectricalCrossClip = {
    kind: 'electrical',
    version: 1,
    copiedAt: new Date().toISOString(),
    sourceProject: payload.sourceProject ?? null,
    components: payload.components,
    wires: payload.wires,
    ladder: payload.ladder ?? [],
  }
  writeStorage(clip)
  return clip
}

export function writeGrafcetCrossClipboard(payload: {
  stepIds: string[]
  steps: unknown[]
  transitions: unknown[]
  positions: Array<{ id: string; x: number; y: number }>
  sourceProject?: string | null
}): GrafcetCrossClip {
  const clip: GrafcetCrossClip = {
    kind: 'grafcet',
    version: 1,
    copiedAt: new Date().toISOString(),
    sourceProject: payload.sourceProject ?? null,
    stepIds: payload.stepIds,
    steps: payload.steps,
    transitions: payload.transitions,
    positions: payload.positions,
  }
  writeStorage(clip)
  return clip
}

export function clearCrossClipboard() {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

export function hasCrossClipboard(kind?: CrossClipKind): boolean {
  const clip = readCrossClipboard()
  if (!clip) return false
  if (!kind) return true
  return clip.kind === kind
}
