/**
 * Imagens pré-geradas a partir dos GLB reais (scripts/build-component-covers.mjs), em public/component-covers:
 *  - types: capa da biblioteca (estúdio 3/4, WebP 192 px sem fundo);
 *  - front: vista frontal ortográfica do Esquema 2D e das capas de projeto (WebP sem fundo).
 * Um só pedido ao manifest.json diz o que existe; nenhum GLB é descarregado para estas imagens.
 */

export interface ComponentImageManifest {
  types: Record<string, string>
  front: Record<string, string>
  version: string
}

let manifest: Promise<ComponentImageManifest | null> | null = null

/** Índice das imagens pré-geradas, lido uma vez; null se não houver índice. */
export function componentImageManifest(): Promise<ComponentImageManifest | null> {
  if (!manifest) {
    manifest = typeof fetch === 'undefined'
      ? Promise.resolve(null)
      : fetch('/component-covers/manifest.json', { cache: 'no-cache' })
        .then((response) => (response.ok ? response.json() : null))
        .then((data) => (data && typeof data.types === 'object'
          ? {
              types: data.types as Record<string, string>,
              front: (data.front && typeof data.front === 'object' ? data.front : {}) as Record<string, string>,
              version: String(data.generatedAt ?? ''),
            }
          : null))
        .catch(() => null)
  }
  return manifest
}

/** URL pública de um ficheiro do índice, com a versão para não reutilizar uma imagem antiga em cache. */
export function componentImageUrl(file: string, version: string): string {
  return `/component-covers/${file}${version ? `?v=${encodeURIComponent(version)}` : ''}`
}

/**
 * Vista frontal pré-gerada do tipo como data URL (o mesmo formato da captura em tempo real), ou null
 * se não existir — nesse caso quem chama captura a partir do GLB.
 */
export async function findStaticFrontImage(type: string): Promise<string | null> {
  const index = await componentImageManifest()
  const file = index?.front[type]
  if (!index || !file || typeof FileReader === 'undefined') return null
  try {
    const response = await fetch(componentImageUrl(file, index.version))
    if (!response.ok) return null
    const blob = await response.blob()
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve(typeof reader.result === 'string' && reader.result.length > 32 ? reader.result : null)
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}
