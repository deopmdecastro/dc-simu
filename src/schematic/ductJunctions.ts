import type { ElectricalComponent, SpatialPoint3D } from '../types'
import { PANEL_UNITS_PER_MM, SCHEMATIC_PX_PER_MM } from '../three/modelPaths'
import { orientationRadians } from '../three/componentOrientation'

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
  /** `'floor'`: passagem pelo fundo (subida/descida vertical que entra por baixo da esteira). */
  side: 'top' | 'bottom' | 'floor'
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
  for (const side of ['top', 'bottom', 'floor'] as const) {
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

/** Dimensões úteis de uma esteira/calha em mm (comprimento ao longo do eixo local X). */
function trayDimsMm(c: ElectricalComponent): { lengthMm: number; widthMm: number; sideHeightMm: number } {
  const lengthMm = Math.max(50, Math.round(Number(c.state?.lengthMm) || (c.w / SCHEMATIC_PX_PER_MM) || 1200))
  const widthMm = Math.max(40, Math.round(Number(c.state?.widthMm) || (c.h / SCHEMATIC_PX_PER_MM) || 200))
  const sideHeightMm = Math.max(20, Math.round(Number(c.state?.sideHeightMm) || 60))
  return { lengthMm, widthMm, sideHeightMm }
}

type Vec3 = { x: number; y: number; z: number }

/**
 * Eixos locais da esteira em coordenadas de mundo, com a mesma matriz que o Three.js usa para
 * `Euler(x, y, z, 'XYZ')` (R = Rx·Ry·Rz): comprimento = X local, altura das abas (abertura) = Y local,
 * largura = Z local.
 */
function trayAxes(c: ElectricalComponent): { length: Vec3; up: Vec3; width: Vec3 } {
  const [rx, ry, rz] = orientationRadians(c.viewOrientation)
  const cx = Math.cos(rx), sx = Math.sin(rx)
  const cy = Math.cos(ry), sy = Math.sin(ry)
  const cz = Math.cos(rz), sz = Math.sin(rz)
  return {
    length: { x: cy * cz, y: cx * sz + sx * sy * cz, z: sx * sz - cx * sy * cz },
    up: { x: -cy * sz, y: cx * cz - sx * sy * sz, z: sx * cz + cx * sy * sz },
    width: { x: sy, y: -sx * cy, z: cx * cy },
  }
}

const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z

function posOf(c: ElectricalComponent): SpatialPoint3D | null {
  const p = c.panel3DPosition
  if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z)) return null
  return p
}

/**
 * Junções 3D entre esteiras livres (nave fabril / maquete): usa `panel3DPosition` e a
 * orientação em vez das coordenadas do Esquema 2D (que para estes objectos são só placeholders).
 * Produz as mesmas `DuctOpening` que o caminho 2D, para reutilizar `closedSpans` / `closedFloorSpans`.
 */
function trayJunctionOpenings3D(c: ElectricalComponent, all: ElectricalComponent[]): DuctOpening[] {
  const pc = posOf(c)
  if (!pc) return []
  const dc = trayDimsMm(c)
  const halfL = dc.lengthMm / 2
  const halfW = dc.widthMm / 2
  const halfH = dc.sideHeightMm / 2
  const axC = trayAxes(c)
  const raw: DuctOpening[] = []
  // panel3DPosition está em unidades de painel: 1 u = 100 mm (PANEL_UNITS_PER_MM = 0.01)
  const U_TO_MM = 1 / PANEL_UNITS_PER_MM
  /** Folga com que duas esteiras encostadas contam como unidas. */
  const TOUCH_MM = 12
  const MIN_OPEN_MM = 25
  const fix = (v: number) => Number(v.toFixed(2))

  for (const o of all) {
    if (o.id === c.id || o.type !== 'cableTrayStraight') continue
    const po = posOf(o)
    if (!po) continue
    const do_ = trayDimsMm(o)
    const axO = trayAxes(o)
    // Esteiras colineares/paralelas não abrem passagem (continuação reta ou lado a lado).
    if (Math.abs(dot(axC.length, axO.length)) > 0.55) continue

    const d = { x: (po.x - pc.x) * U_TO_MM, y: (po.y - pc.y) * U_TO_MM, z: (po.z - pc.z) * U_TO_MM }
    // Caixa de `o` projetada em cada eixo local de `c` (centro ± meia-extensão), em mm.
    const extent = (k: Vec3): [number, number] => {
      const center = dot(d, k)
      const half = Math.abs(dot(axO.length, k)) * do_.lengthMm / 2
        + Math.abs(dot(axO.width, k)) * do_.widthMm / 2
        + Math.abs(dot(axO.up, k)) * do_.sideHeightMm / 2
      return [center - half, center + half]
    }
    const [a0, a1] = extent(axC.length)
    const [w0, w1] = extent(axC.width)
    const [h0, h1] = extent(axC.up)
    // Sem contacto em algum eixo → não há junção (já considera a altura: esteiras a cotas diferentes não cortam).
    if (a1 < -halfL - TOUCH_MM || a0 > halfL + TOUCH_MM) continue
    if (w1 < -halfW - TOUCH_MM || w0 > halfW + TOUCH_MM) continue
    if (h1 < -halfH - TOUCH_MM || h0 > halfH + TOUCH_MM) continue

    let f = Math.max(-halfL, a0)
    let t = Math.min(halfL, a1)
    if (t - f < MIN_END_TRIM_MM) continue
    if (f - (-halfL) < 8) f = -halfL
    if (halfL - t < 8) t = halfL

    // `o` chega por baixo do fundo de `c` (subida/descida vertical) → abre só o fundo nessa zona;
    // as abas de `c` mantêm-se (a ponta de `c` pode assentar sobre a subida, junto à parede).
    if (h0 < -halfH - 2) {
      if (t - f >= MIN_END_TRIM_MM && w1 > -halfW + 2 && w0 < halfW - 2) raw.push({ side: 'floor', from: fix(f), to: fix(t) })
      continue
    }
    // Ponta de `c` dentro de `o` (ramal a entrar na principal ou topo de uma subida que entra
    // na esteira de cima): apara abas e fundo nesse troço para não invadir o canal de `o`.
    const containsWhole = a0 <= -halfL + 8 && a1 >= halfL - 8
    const endInside = !containsWhole && (f <= -halfL || t >= halfL)
    if (endInside) {
      raw.push({ side: 'top', from: fix(f), to: fix(t), endTrim: true })
      raw.push({ side: 'bottom', from: fix(f), to: fix(t), endTrim: true })
      continue
    }
    if (t - f < MIN_OPEN_MM) continue
    // `o` chega pela parede lateral de `c` (T/L/+) dentro da altura útil das abas.
    if (h1 > -halfH + 2) {
      if (w0 < -halfW - 2) raw.push({ side: 'top', from: fix(f), to: fix(t) })
      if (w1 > halfW + 2) raw.push({ side: 'bottom', from: fix(f), to: fix(t) })
    }
  }
  return mergeOpenings(raw)
}

/**
 * Calcula onde calhas perpendiculares encontram as paredes de `c` (uniões em T, L e cruz `+`):
 *  1. Na calha principal do T: corta os dentes e abre a parede exatamente na boca do ramal,
 *     mantendo a parede oposta 100% intacta com todos os seus dentes.
 *  2. Na ponta do ramal que entra na calha principal: apara quaisquer dentes/paredes que
 *     ultrapassariam a face exterior da calha principal, deixando o canal do T totalmente livre.
 *  3. Calhas paralelas lado a lado não abrem passagem.
 *
 * Para `cableTrayStraight` com `panel3DPosition` (nave / maquete) usa geometria 3D;
 * para calhas de painel mantém o caminho clássico por coordenadas do Esquema.
 */
export function ductJunctionOpenings(c: ElectricalComponent, all: ElectricalComponent[]): DuctOpening[] {
  if (c.type !== 'cableDuct' && c.type !== 'cableTrayStraight') return []

  // Esteiras livres da nave: detecção 3D (as coords do Esquema são só placeholders de inserção)
  if (c.type === 'cableTrayStraight' && posOf(c)) {
    const from3d = trayJunctionOpenings3D(c, all)
    // Com vizinhos também posicionados em 3D a resposta 3D é definitiva (mesmo vazia): as
    // coordenadas do Esquema destas esteiras são placeholders e gerariam cortes fantasma.
    if (from3d.length || all.some((o) => o.id !== c.id && o.type === 'cableTrayStraight' && posOf(o))) return from3d
    // Se nenhum vizinho 3D tocou, cai no caminho 2D (útil para esteiras ainda no painel)
  }

  const px = SCHEMATIC_PX_PER_MM
  const a = effectiveDuctAngleRad(c)
  const ux = Math.cos(a), uy = Math.sin(a), vx = -Math.sin(a), vy = Math.cos(a)
  const cx = c.schematicX + c.w / 2, cy = c.schematicY + c.h / 2
  const half = c.w / 2
  const halfMm = half / px
  const raw: DuctOpening[] = []

  for (const o of all) {
    if (o.id === c.id || o.type !== c.type) continue
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
  const trims = openings.filter((o) => o.endTrim || o.side === 'floor')
  if (!trims.length) return [[-L / 2, L / 2]]
  // Qualquer endTrim (um ou dois lados) remove o fundo nessa zona — evita o “corte” visual
  // e a sobreposição do fundo do ramal dentro da esteira principal.
  const spans = closedSpans(L, trims.map((o) => ({ ...o, side: 'top' as const })), 'top')
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
