import type { ElectricalComponent } from '../types'
import { SCHEMATIC_PX_PER_MM } from '../three/modelPaths'

/**
 * Passagem de cabos numa junção de calhas ranhuradas (T, L e cruz `+`):
 * troço da parede lateral (dentes/linguetas e fita de base) que se corta onde outra calha
 * desemboca, encosta ou atravessa. Coordenadas locais da calha, em mm:
 *  - `from` / `to`: medidos a partir do centro `0` ao longo do comprimento `[-L/2, +L/2]`;
 *  - `side`: `'top'` (`y` local negativo no Esquema / `+Y` no 3D) ou `'bottom'` (`y` local positivo / `-Y` no 3D);
 *  - `endTrim`: verdadeiro quando a própria ponta desta calha entra dentro do canal de outra calha
 *    perpendicular (recorta dentes, parede e sobreposição de fundo para não invadir o T).
 */
export interface DuctOpening {
  side: 'top' | 'bottom'
  from: number
  to: number
  endTrim?: boolean
}

/** Folga (px ≈ 14,5 mm) com que uma calha encostada em T conta como junção (inclui passo da grelha de 20 px). */
const TOUCH_PX = 22
/** Abertura mínima (mm) para corte de ramal em parede lateral. */
const MIN_OPENING_MM = 8
/** Penetração mínima (mm) para aparar dentes na ponta de um ramal que entra na calha principal. */
const MIN_END_TRIM_MM = 0.4
/** Projeção mínima (px) para fora da parede para distinguir T (só corta 1 lado) de cruz `+` (corta os 2 lados). */
const OUTSIDE_CLEAR_PX = 3
/** Folga lateral (mm) para destacar por inteiro os dentes/linguetas que tocam nas paredes do T. */
const FINGER_CLEARANCE_MM = 1.6

/** Ângulo efetivo no plano do painel (graus, sentido horário do Esquema), incluindo rotação 3D em Z. */
function effectiveDuctAngleRad(c: ElectricalComponent): number {
  const rot2d = typeof c.rotation === 'number' && Number.isFinite(c.rotation) ? c.rotation : 0
  const rot3dZ = typeof c.viewOrientation?.z === 'number' && Number.isFinite(c.viewOrientation.z) ? c.viewOrientation.z : 0
  const mirrorSign = c.mirrored ? -1 : 1
  const deg = rot2d - mirrorSign * rot3dZ
  return (deg * Math.PI) / 180
}

/** Mescla aberturas sobrepostas/contíguas do mesmo lado para evitar micro-fragmentos de parede ou dentes soltos. */
function mergeOpenings(raw: DuctOpening[]): DuctOpening[] {
  if (raw.length <= 1) return raw
  const out: DuctOpening[] = []
  for (const side of ['top', 'bottom'] as const) {
    const list = raw
      .filter((o) => o.side === side)
      .map((o) => ({
        side,
        from: Math.min(o.from, o.to),
        to: Math.max(o.from, o.to),
        endTrim: o.endTrim,
      }))
      .sort((a, b) => a.from - b.from)
    for (const item of list) {
      const prev = out[out.length - 1]
      // Junta também se entre dois cortes em T restar menos de 5 mm (menos que um dente ranhurado)
      if (prev && prev.side === side && item.from <= prev.to + 5) {
        prev.to = Math.max(prev.to, item.to)
        prev.endTrim = Boolean(prev.endTrim && item.endTrim)
      } else {
        out.push({ ...item })
      }
    }
  }
  return out
}

/**
 * Calcula onde calhas perpendiculares encontram as paredes de `c` (uniões em T, L e cruz `+`):
 *  1. Na calha principal do T: corta os dentes e abre a parede exatamente na boca do ramal,
 *     mantendo a parede oposta 100% intacta com todos os seus dentes.
 *  2. Na ponta do ramal que entra na calha principal: apara quaisquer dentes/paredes que
 *     ultrapassariam a face exterior da calha principal, deixando o canal do T totalmente livre.
 *  3. Calhas paralelas lado a lado não abrem passagem.
 */
export function ductJunctionOpenings(c: ElectricalComponent, all: ElectricalComponent[]): DuctOpening[] {
  if (c.type !== 'cableDuct') return []
  const px = SCHEMATIC_PX_PER_MM
  const a = effectiveDuctAngleRad(c)
  const ux = Math.cos(a), uy = Math.sin(a), vx = -Math.sin(a), vy = Math.cos(a)
  const cx = c.schematicX + c.w / 2, cy = c.schematicY + c.h / 2
  const half = c.w / 2
  const halfMm = half / px
  const raw: DuctOpening[] = []

  for (const o of all) {
    if (o.id === c.id || o.type !== 'cableDuct') continue
    const b = effectiveDuctAngleRad(o)
    // Só calhas perpendiculares (ou quase perpendiculares); paralelas lado a lado não cortam dentes.
    if (Math.abs(Math.cos(b) * ux + Math.sin(b) * uy) > 0.5) continue

    const dx = o.schematicX + o.w / 2 - cx
    const dy = o.schematicY + o.h / 2 - cy
    const lx = dx * ux + dy * uy
    const ly = dx * vx + dy * vy

    // Extensão de `o` em x (largura exterior de `o`) e em y (comprimento de `o`) no referencial local de `c`
    const x0 = lx - o.h / 2
    const x1 = lx + o.h / 2
    const y0 = ly - o.w / 2
    const y1 = ly + o.w / 2

    const fromPx = Math.max(-half, x0)
    const toPx = Math.min(half, x1)
    const overlapMm = (toPx - fromPx) / px
    if (overlapMm < MIN_END_TRIM_MM) continue

    // Verifica se `o` está a aparar uma das pontas de `c` (ramal `c` a entrar dentro da calha `o`)
    const touchesEnd = fromPx <= -half + 1.5 || toPx >= half - 1.5
    const spansAcrossChannel = y0 < -c.h / 2 - OUTSIDE_CLEAR_PX && y1 > c.h / 2 + OUTSIDE_CLEAR_PX
    const isBranchEndTrim = touchesEnd && spansAcrossChannel && overlapMm < o.h / px - 0.5

    if (!isBranchEndTrim && overlapMm < MIN_OPENING_MM) continue

    let f = (c.mirrored ? -toPx : fromPx) / px
    let t = (c.mirrored ? -fromPx : toPx) / px
    if (f > t) { const tmp = f; f = t; t = tmp }
    // Encosta às pontas se restar menos de 2 mm de filete solto
    if (f - (-halfMm) < 2) f = -halfMm
    if (halfMm - t < 2) t = halfMm
    f = Math.max(-halfMm, f)
    t = Math.min(halfMm, t)

    for (const side of ['top', 'bottom'] as const) {
      const wall = side === 'top' ? -c.h / 2 : c.h / 2
      // Distingue união em T (só corta a parede por onde o ramal chega) de cruz `+` (atravessa ambas):
      const crossesWall = side === 'top'
        ? (y0 < wall - OUTSIDE_CLEAR_PX && y1 >= wall - TOUCH_PX)
        : (y1 > wall + OUTSIDE_CLEAR_PX && y0 <= wall + TOUCH_PX)
      if (!crossesWall) continue
      raw.push({
        side,
        from: Number(f.toFixed(2)),
        to: Number(t.toFixed(2)),
        ...(isBranchEndTrim ? { endTrim: true } : {}),
      })
    }
  }

  return mergeOpenings(raw)
}

/** Chave estável para dependências de `useMemo`. */
export const ductOpeningsKey = (o: DuctOpening[]): string =>
  o.map((x) => `${x.side[0]}${x.endTrim ? 'e' : ''}${x.from.toFixed(1)}:${x.to.toFixed(1)}`).join('|')

/** Intervalos `[a, b]` de `[-L/2, +L/2]` que permanecem fechados depois de remover as aberturas do lado `side`. */
export function closedSpans(L: number, openings: DuctOpening[], side: 'top' | 'bottom'): Array<[number, number]> {
  const cuts = openings
    .filter((o) => o.side === side)
    .map((o) => [Math.min(o.from, o.to), Math.max(o.from, o.to)] as [number, number])
    .sort((p, q) => p[0] - q[0])
  const spans: Array<[number, number]> = []
  let cur = -L / 2
  for (const [f, t] of cuts) {
    if (f > cur) spans.push([cur, Math.min(f, L / 2)])
    cur = Math.max(cur, t)
  }
  if (cur < L / 2) spans.push([cur, L / 2])
  return spans.filter(([s, e]) => e - s > 0.01)
}

/** Intervalos `[a, b]` do fundo (`base`) da calha sem sobreposição coplanar nas pontas que entram noutra calha. */
export function closedFloorSpans(L: number, openings: DuctOpening[]): Array<[number, number]> {
  const topTrims = openings.filter((o) => o.side === 'top' && o.endTrim)
  const botTrims = openings.filter((o) => o.side === 'bottom' && o.endTrim)
  if (!topTrims.length || !botTrims.length) return [[-L / 2, L / 2]]
  const shared: DuctOpening[] = []
  for (const a of topTrims) {
    for (const b of botTrims) {
      const f = Math.max(Math.min(a.from, a.to), Math.min(b.from, b.to))
      const t = Math.min(Math.max(a.from, a.to), Math.max(b.from, b.to))
      if (t - f > 0.2) shared.push({ side: 'top', from: f, to: t, endTrim: true })
    }
  }
  if (!shared.length) return [[-L / 2, L / 2]]
  const spans = closedSpans(L, shared, 'top')
  return spans.length ? spans : [[-L / 2, L / 2]]
}

/**
 * Verdadeiro se um dente/lingueta no intervalo `[x0, x1]` (em mm) cai na zona de corte de uma união em T/L/`+`
 * e deve ser destacado pela linha de pré-corte (inclui dentes encostados à parede do ramal).
 */
export const inOpening = (openings: DuctOpening[], side: 'top' | 'bottom', x0: number, x1: number): boolean =>
  openings.some((o) => {
    if (o.side !== side) return false
    const pad = o.endTrim ? 0.6 : FINGER_CLEARANCE_MM
    const lo = Math.min(o.from, o.to) - pad
    const hi = Math.max(o.from, o.to) + pad
    return x1 > lo && x0 < hi
  })
