/**
 * Percurso interior no QGD de parede para cabos que saem pelos bucins superiores (unidades de cena):
 * borne de saída → calha técnica horizontal por baixo → calha vertical mais próxima → calha do topo →
 * por baixo do bucim. Assim o cabo nunca atravessa os aparelhos em diagonal.
 */
import type { ElectricalComponent, SpatialPoint3D } from '../types'
import { componentPanelXY } from '../three/panelLayout'
import { componentHalfExtents, PLATE_THICKNESS, PLATE_Z } from '../three/panelBounds'

export function wallPanelExitRoute(
  panel: ElectricalComponent[],
  terminalComp: ElectricalComponent,
  gland: SpatialPoint3D,
  lane: number,
): SpatialPoint3D[] {
  const ducts = panel.filter((c) => c.type === 'cableDuct').map((c) => ({ c, p: componentPanelXY(c), h: componentHalfExtents(c) }))
  const horizontal = ducts.filter((d) => d.h.x >= d.h.y).sort((a, b) => a.p.y - b.p.y)
  const vertical = ducts.filter((d) => d.h.y > d.h.x)
  if (!horizontal.length) return []
  const t = componentPanelXY(terminalComp)
  const below = [...horizontal].reverse().find((d) => d.p.y < t.y) ?? horizontal[0]
  const topDuct = horizontal[horizontal.length - 1]
  // Calha vertical dentro do quadro mais próxima do borne (as que caem fora da chapa são ignoradas).
  const inside = vertical.filter((d) => d.p.x > topDuct.p.x - topDuct.h.x - 0.05 && d.p.x < topDuct.p.x + topDuct.h.x + 0.05)
  const riser = inside.sort((a, b) => Math.abs(a.p.x - t.x) - Math.abs(b.p.x - t.x))[0]
  const zIn = PLATE_Z + PLATE_THICKNESS / 2 + below.h.z * 0.9 + lane * 0.25
  const pts: SpatialPoint3D[] = [
    { x: t.x, y: below.p.y + lane * 0.5, z: zIn },
  ]
  if (riser) {
    const rx = riser.p.x + lane
    pts.push({ x: rx, y: below.p.y + lane * 0.5, z: zIn }, { x: rx, y: topDuct.p.y + lane * 0.5, z: zIn })
  } else {
    pts.push({ x: topDuct.p.x - topDuct.h.x + 0.1, y: below.p.y, z: zIn }, { x: topDuct.p.x - topDuct.h.x + 0.1, y: topDuct.p.y, z: zIn })
  }
  pts.push(
    { x: gland.x, y: topDuct.p.y + lane * 0.5, z: zIn },
    { x: gland.x, y: topDuct.p.y + topDuct.h.y + 0.12, z: zIn },
    { x: gland.x, y: gland.y - 0.15, z: gland.z },
  )
  return pts
}
