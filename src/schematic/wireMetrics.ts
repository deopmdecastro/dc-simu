/**
 * Métricas do cabo no Esquema 2D.
 *
 * Um cabo de 16 mm² desenha-se mais grosso do que um de 0,5 mm², mas ambos têm
 * de continuar legíveis ao lado dos componentes: um BK 3P ocupa ~60 px de
 * largura e o borne ~6 px. A espessura segue a raiz da secção (a área cresce
 * com o quadrado do diâmetro, pelo que a raiz é a leitura mais próxima do
 * diâmetro real) e os extremos são limitados para não transformar o cabo numa
 * faixa nem numa linha invisível.
 *
 * A mesma escala serve as ponteiras (`wireEndScale`), para que uma ponteira de
 * 16 mm² pareça maior do que a de 0,5 mm² — como no equipamento real.
 */

/** Secções oferecidas na interface (mm²). */
export const WIRE_GAUGE_MM: Record<string, number> = {
  '0.5mm²': 0.5,
  '0.75mm²': 0.75,
  '1mm²': 1,
  '1.5mm²': 1.5,
  '2.5mm²': 2.5,
  '4mm²': 4,
  '6mm²': 6,
  '10mm²': 10,
  '16mm²': 16,
}

/** Secção em mm² a partir do texto guardado no projeto («1.5mm²» → 1,5). */
export function gaugeMm(gauge: string | undefined): number {
  if (!gauge) return 1.5
  const known = WIRE_GAUGE_MM[gauge]
  if (known) return known
  const parsed = Number.parseFloat(gauge.replace(',', '.'))
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1.5
}

const MIN_WIDTH = 1.3
const MAX_WIDTH = 6.2
const MIN_GAUGE = 0.5
const MAX_GAUGE = 16

/**
 * Espessura do cabo no desenho (px do esquema).
 *
 * 0,5 mm² → ~1,3 px · 1,5 mm² → ~2,7 px · 16 mm² → ~6,2 px. Cresce com a raiz
 * da secção e satura nos extremos, para o traçado continuar a acompanhar a
 * grelha de 20 px e o tamanho dos componentes.
 */
export function wireStrokeWidth(gauge: string | undefined): number {
  const mm = Math.min(MAX_GAUGE, Math.max(MIN_GAUGE, gaugeMm(gauge)))
  const t = (Math.sqrt(mm) - Math.sqrt(MIN_GAUGE)) / (Math.sqrt(MAX_GAUGE) - Math.sqrt(MIN_GAUGE))
  return Math.round((MIN_WIDTH + t * (MAX_WIDTH - MIN_WIDTH)) * 100) / 100
}

/**
 * Escala das ponteiras e dos terminais desenhados nas pontas do cabo.
 * Acompanha a espessura (1,0 em 0,5 mm² até ~1,45 em 16 mm²) para que o
 * terminal não fique desproporcionado em relação ao condutor.
 */
export function wireEndScale(gauge: string | undefined): number {
  return Math.round((0.92 + (wireStrokeWidth(gauge) / MAX_WIDTH) * 0.55) * 100) / 100
}
