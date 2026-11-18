/**
 * Ambiente Node para os smoke tests: o GLTFLoader do Three usa `self.URL` ao
 * descodificar imagens embutidas nos GLB (texturas PBR) e `self` não existe em Node.
 * Importar este módulo ANTES de qualquer carregamento de modelos.
 */
const g = globalThis as { self?: unknown; FileReader?: unknown }
if (typeof g.self === 'undefined') g.self = globalThis
// GLTFExporter uses FileReader even for a binary export with no DOM/images.
// Read genuine Blob bytes; do not substitute an empty or fabricated GLB.
if (typeof g.FileReader === 'undefined') g.FileReader = class {
  result: ArrayBuffer | string | null = null
  error: unknown = null
  onload?: () => void
  onloadend?: () => void
  onerror?: (error: unknown) => void
  private read(blob: Blob, dataUrl: boolean) {
    blob.arrayBuffer().then(buffer => {
      this.result = dataUrl ? `data:${blob.type || 'application/octet-stream'};base64,${Buffer.from(buffer).toString('base64')}` : buffer
      this.onload?.(); this.onloadend?.()
    }).catch(error => { this.error = error; this.onerror?.(error); this.onloadend?.() })
  }
  readAsArrayBuffer(blob: Blob) { this.read(blob, false) }
  readAsDataURL(blob: Blob) { this.read(blob, true) }
}
export {}
