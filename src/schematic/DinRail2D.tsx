import { DIN_RAIL_15X55, clampRailLengthMm, railSlotCount } from '../three/dinRailGeometry'
import { SCHEMATIC_PX_PER_MM } from '../three/modelPaths'
import type { ElectricalComponent } from '../types'

/**
 * Calha DIN perfurada 15 × 5,5 mm em vista superior, desenhada à escala do
 * Esquema (1 mm = 1,5 px). Vetorial: o comprimento editável nunca deforma os furos.
 */
export default function DinRail2D({ c }: { c: ElectricalComponent }) {
  const spec = DIN_RAIL_15X55
  const px = SCHEMATIC_PX_PER_MM
  const lengthMm = clampRailLengthMm(c.state.lengthMm)
  const L = c.w // o footprint acompanha o comprimento; mantém o resize manual coerente
  const H = c.h
  const channelH = (spec.channel / spec.width) * H
  const channelY = (H - channelH) / 2
  const count = railSlotCount((L / px) || lengthMm)
  const pitch = spec.slotPitch * px
  const slotW = spec.slotLength * px
  const slotH = Math.min(channelH * 0.6, spec.slotWidth * px)
  const start = L / 2 - ((count - 1) * pitch) / 2
  return <g pointerEvents="none" data-din-rail>
    <rect x={0} y={0} width={L} height={H} rx={1.5} fill="#cfd5dd" stroke="#8b95a3" strokeWidth={0.8} />
    <rect x={0} y={channelY} width={L} height={channelH} fill="#a9b2bd" stroke="#8b95a3" strokeWidth={0.6} />
    {Array.from({ length: count }).map((_, i) => (
      <rect key={i} x={start + i * pitch - slotW / 2} y={(H - slotH) / 2} width={slotW} height={slotH} rx={slotH / 2} fill="#f8fafd" stroke="#7b8695" strokeWidth={0.5} />
    ))}
    <rect x={0} y={0} width={L} height={1.4} fill="#ffffff" opacity={0.55} />
    <text x={L / 2} y={H + 14} textAnchor="middle" fontSize={10} fill="#475569">{c.ref} · {Math.round(lengthMm)} mm · 15×5,5</text>
  </g>
}
