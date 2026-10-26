/**
 * Biblioteca de texturas reais (PBR) do editor de elementos.
 *
 * Materiais fotografados/digitalizados do ambientCG (https://ambientcg.com),
 * licença CC0 1.0 — uso livre, inclusive comercial, sem atribuição obrigatória
 * (registamos a origem em `source`). Reduzidos a 512 px (JPG) para não pesarem
 * na aplicação; carregam só quando são usados (`public/textures/lib/<id>/`).
 *
 * Mapas: cor (sRGB), normal (OpenGL), rugosidade e, nos metais, metalização.
 * `tint`: o mapa de cor é neutro e a cor do material tinge-o (tintas RAL, plásticos).
 * `tileMm`: tamanho real de um padrão — as UVs são projetadas à escala real.
 */
export interface TextureLibraryEntry {
  id: string
  name: string
  category: 'Tintas' | 'Metais' | 'Plásticos e borracha' | 'Construção'
  /** Uso típico (ajuda a escolher). */
  hint: string
  maps: { color: string; normal: string; roughness: string; metalness?: string }
  thumb: string
  tileMm: number
  /** Cor sugerida (para as tingíveis) — branco = cor da fotografia. */
  color: string
  tint: boolean
  roughness: number
  metalness: number
  normalScale: number
  source: string
}

const BASE = '/textures/lib'

function entry(id: string, name: string, category: TextureLibraryEntry['category'], hint: string, options: { metal?: boolean; tileMm: number; color?: string; tint?: boolean; roughness?: number; metalness?: number; normalScale?: number; source: string }): TextureLibraryEntry {
  const dir = `${BASE}/${id}`
  return {
    id, name, category, hint,
    maps: { color: `${dir}/color.jpg`, normal: `${dir}/normal.jpg`, roughness: `${dir}/roughness.jpg`, ...(options.metal ? { metalness: `${dir}/metalness.jpg` } : {}) },
    thumb: `${dir}/thumb.jpg`,
    tileMm: options.tileMm,
    color: options.color ?? '#ffffff',
    tint: !!options.tint,
    roughness: options.roughness ?? 1,
    metalness: options.metalness ?? (options.metal ? 1 : 0),
    normalScale: options.normalScale ?? 1,
    source: `ambientCG ${options.source} (CC0)`,
  }
}

export const TEXTURE_LIBRARY: TextureLibraryEntry[] = [
  entry('pintura-industrial', 'Pintura industrial (tingível)', 'Tintas', 'Carcaças de motores, tampas, armários — escolha a cor RAL', { tileMm: 160, color: '#b91c1c', tint: true, roughness: .9, metalness: .15, normalScale: .6, source: 'Paint004' }),
  entry('pintura-texturada', 'Pintura em pó texturada (tingível)', 'Tintas', 'Quadros elétricos, caixas, chapas pintadas', { tileMm: 90, color: '#d6d3cb', tint: true, roughness: 1, metalness: .05, normalScale: .8, source: 'Paint005' }),
  entry('aco-escovado', 'Aço escovado', 'Metais', 'Veios, placas de características, perfis', { metal: true, tileMm: 120, source: 'Metal009' }),
  entry('aco-inox', 'Aço inox acetinado', 'Metais', 'Parafusos, tampas inox, flanges', { metal: true, tileMm: 140, source: 'Metal055A' }),
  entry('aluminio-fundido', 'Alumínio fundido', 'Metais', 'Carcaças de motor sem pintura, dissipadores', { metal: true, tileMm: 120, source: 'Metal041A' }),
  entry('ferro-fundido', 'Ferro fundido', 'Metais', 'Escudos, flanges, bases de máquinas', { metal: true, tileMm: 160, source: 'Metal038' }),
  entry('aco-zincado', 'Aço zincado', 'Metais', 'Calhas DIN, chapas de montagem, suportes', { metal: true, tileMm: 200, source: 'Metal032' }),
  entry('latao', 'Latão', 'Metais', 'Bornes, pontes de ligação, casquilhos', { metal: true, tileMm: 60, source: 'Metal042A' }),
  entry('cobre', 'Cobre', 'Metais', 'Barramentos, enrolamentos, terminais', { metal: true, tileMm: 80, source: 'Metal035' }),
  entry('chapa-xadrez', 'Chapa xadrez', 'Metais', 'Pisos, degraus, plataformas', { metal: true, tileMm: 220, source: 'DiamondPlate008A' }),
  entry('plastico-preto', 'Plástico preto texturado', 'Plásticos e borracha', 'Caixas de bornes, bucins, botoneiras, tampas', { tileMm: 60, source: 'Plastic006' }),
  entry('plastico-claro', 'Plástico técnico (tingível)', 'Plásticos e borracha', 'Corpos de aparelhos DIN (RAL 7035), relés, contactores', { tileMm: 60, color: '#d9d8d2', tint: true, source: 'Plastic010' }),
  entry('borracha', 'Borracha', 'Plásticos e borracha', 'Juntas, pés, passa-cabos, pegas', { tileMm: 50, source: 'Rubber004' }),
  entry('betao', 'Betão', 'Construção', 'Pavimentos e maciços de fixação', { tileMm: 900, source: 'Concrete034' }),
  entry('madeira', 'Madeira', 'Construção', 'Bancadas, paletes, painéis de ensino', { tileMm: 600, source: 'Wood051' }),
]

export const TEXTURE_CATEGORIES = [...new Set(TEXTURE_LIBRARY.map((item) => item.category))]

export function textureLibraryEntry(id: string | undefined): TextureLibraryEntry | undefined {
  return id ? TEXTURE_LIBRARY.find((item) => item.id === id) : undefined
}

/** Ids dos assets que a biblioteca cria na definição (um por mapa, partilhados entre materiais). */
export function libraryAssetId(entryId: string, map: keyof TextureLibraryEntry['maps']): string {
  return `tex-${entryId}-${map}`
}
