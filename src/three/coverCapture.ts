/** Miniatura real do projeto (cena 3D do editor) usada como cover no dashboard.
 *  O Panel3D regista aqui uma função que renderiza uma vista frontal enquadrada;
 *  account.tsx pede a captura ao guardar / ao sair do editor. */
type Capture = () => string | null

let capture: Capture | null = null
let lastCover: string | null = null

export const COVER_MAX_CHARS = 420_000

export function registerCoverCapture(fn: Capture | null) {
  capture = fn
}

/** Cover guardado no projeto aberto (vem do conteúdo, ou da última captura). */
export function setStoredCover(value: unknown) {
  lastCover = typeof value === 'string' && value.startsWith('data:image/jpeg') && value.length <= COVER_MAX_CHARS ? value : null
}

export function hasStoredCover() {
  return !!lastCover
}

/** Tenta capturar agora; se a cena 3D não estiver montada, devolve o último cover conhecido. */
export function captureCover(): string | null {
  try {
    const url = capture?.()
    if (url && url.length <= COVER_MAX_CHARS) lastCover = url
  } catch {
    // a captura nunca pode impedir o guardar
  }
  return lastCover
}

export function canCaptureCover() {
  return !!capture
}
