/** Miniatura real do projeto (cena 3D do editor) usada como cover no dashboard.
 *  O Panel3D regista aqui uma função que renderiza uma vista frontal enquadrada;
 *  account.tsx pede a captura ao guardar / ao sair do editor. */
type Capture = () => string | null

let capture: Capture | null = null
let lastCover: string | null = null
/** Versão do algoritmo que produziu `lastCover` (0 = capa antiga, sem versão guardada). */
let lastVersion = 0
/** Sobe sempre que o enquadramento da capa muda: as capas guardadas com outra versão são recapturadas. */
export const COVER_VERSION = 2
/** True quando o encaminhamento 3D dos cabos já produziu malhas (ou não há cabos). */
let wiresReady = true

/** JPEG 640×@0,72 ≈ 40–120 KiB em base64; teto evita projetos com capas gigantes. */
export const COVER_MAX_CHARS = 280_000

export function registerCoverCapture(fn: Capture | null) {
  capture = fn
}

export function setCoverWiresReady(ready: boolean) {
  wiresReady = ready
}

export function areCoverWiresReady() {
  return wiresReady
}

/** Cover guardado no projeto aberto (vem do conteúdo, ou da última captura). */
export function setStoredCover(value: unknown, version?: unknown) {
  lastCover = typeof value === 'string' && value.startsWith('data:image/jpeg') && value.length <= COVER_MAX_CHARS ? value : null
  lastVersion = lastCover && typeof version === 'number' && Number.isFinite(version) ? version : 0
}

/** Há capa guardada, mas de uma versão anterior do enquadramento (ex.: só a chapa, cabos fora do quadro). */
export function hasStaleCover() {
  return !!lastCover && lastVersion !== COVER_VERSION
}

/** True só quando a capa guardada foi feita com o enquadramento atual. */
export function hasStoredCover() {
  return !!lastCover && lastVersion === COVER_VERSION
}

/** Versão a gravar no projeto junto da capa: a da última captura real, nunca a atual para uma capa antiga mantida. */
export function storedCoverVersion() {
  return lastCover ? lastVersion : undefined
}

/** True quando uma captura agora produziria a capa completa (cena montada e cabos já traçados). */
export function canCaptureFreshCover() {
  return !!capture && wiresReady
}

/** Tenta capturar agora; se a cena 3D não estiver montada, devolve o último cover conhecido. */
export function captureCover(): string | null {
  try {
    // Sem cabos prontos nunca se captura (a cena sairia sem fios nem recuos): mantém-se a capa anterior.
    if (!wiresReady) return lastCover
    const url = capture?.()
    if (url && url.length <= COVER_MAX_CHARS) { lastCover = url; lastVersion = COVER_VERSION }
  } catch {
    // a captura nunca pode impedir o guardar
  }
  return lastCover
}

export function canCaptureCover() {
  return !!capture
}
