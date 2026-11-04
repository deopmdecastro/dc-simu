import { CABLE_DUCT, cableDuctDimsOf, ENCLOSURE, enclosureDimsOf, enclosureHingeOf, spiralWrapDimsOf } from '../three/enclosureParts'
import { SCHEMATIC_PX_PER_MM } from '../three/modelPaths'
import type { ElectricalComponent } from '../types'

/**
 * Quadro metálico e calha técnica em vista frontal no Esquema (1 mm = 1,5 px), vetoriais:
 * mudar o tamanho nunca deforma dobradiças, fechos ou ranhuras.
 */

/** Quadro: só a moldura apanha cliques — o interior fica livre para os aparelhos e a seleção por área. */
export function Enclosure2D({ c }: { c: ElectricalComponent }) {
  const px = SCHEMATIC_PX_PER_MM
  const d = enclosureDimsOf(c.state)
  const W = c.w, H = c.h
  const f = ENCLOSURE.flange * px
  const margin = Math.min(30, d.widthMm * 0.06, d.heightMm * 0.06) * px
  const hingeRight = enclosureHingeOf(c.state) === 'right'
  const open = c.state.doorOpen !== false
  const hx = hingeRight ? W : 0
  const hingeYs = d.heightMm > 1000 ? [0.15, 0.5, 0.85] : [0.15, 0.85]
  const lockX = hingeRight ? f * 0.6 : W - f * 0.6
  const lockYs = d.heightMm < 500 ? [0.5] : [0.2, 0.8]
  return <g data-enclosure>
    <g pointerEvents="none">
      <rect x={0} y={0} width={W} height={H} rx={3} fill="#d6d8d2" stroke="#7d827b" strokeWidth={1.2} />
      <rect x={f} y={f} width={W - 2 * f} height={H - 2 * f} fill="#eceee9" stroke="#a3a8a1" strokeWidth={0.8} />
      <rect x={f + margin * 0.4} y={f + margin * 0.4} width={Math.max(0, W - 2 * f - margin * 0.8)} height={Math.max(0, H - 2 * f - margin * 0.8)} fill="#e3e7ea" stroke="#b8bec4" strokeWidth={0.6} strokeDasharray="4 3" />
      {hingeYs.map((t) => <rect key={t} x={hx - 4} y={H * t - 14} width={8} height={28} rx={2} fill="#aeb4bb" stroke="#6b7280" strokeWidth={0.6} />)}
      {lockYs.map((t) => <circle key={t} cx={lockX} cy={H * t} r={6} fill="#3a3f47" stroke="#c4c9d0" strokeWidth={1.4} />)}
      {open && <path d={hingeRight ? `M ${W} ${H * 0.04} q ${Math.min(80, W * 0.25)} ${H * 0.02} ${Math.min(110, W * 0.32)} ${H * 0.1}` : `M 0 ${H * 0.04} q ${-Math.min(80, W * 0.25)} ${H * 0.02} ${-Math.min(110, W * 0.32)} ${H * 0.1}`} fill="none" stroke="#64748b" strokeWidth={1} strokeDasharray="5 4" />}
      <text x={W / 2} y={H + 16} textAnchor="middle" fontSize={11} fill="#475569">{c.ref} · {d.widthMm}×{d.heightMm}×{d.depthMm} mm · porta {open ? 'aberta' : 'fechada'}</text>
    </g>
    {/* moldura: área de clique/arrasto do quadro */}
    <rect x={f / 2} y={f / 2} width={W - f} height={H - f} fill="none" stroke="transparent" strokeWidth={f} pointerEvents="stroke" />
  </g>
}

/** Calha técnica em vista frontal: com tampa (superfície lisa) ou aberta (dedos e fundo à vista). */
export function CableDuct2D({ c }: { c: ElectricalComponent }) {
  const px = SCHEMATIC_PX_PER_MM
  const d = cableDuctDimsOf(c.state)
  const L = c.w, H = c.h
  const coverOn = c.state.coverOn !== false
  const pitch = CABLE_DUCT.pitch * px
  const slot = CABLE_DUCT.slot * px
  const n = Math.max(1, Math.floor((L - slot) / pitch))
  const start = L / 2 - ((n - 1) * pitch) / 2
  const finger = Math.min(H * 0.22, 7)
  return <g pointerEvents="none" data-cable-duct>
    <rect x={0} y={0} width={L} height={H} rx={1.5} fill={coverOn ? '#b3b6b1' : '#8e928d'} stroke="#6f746e" strokeWidth={0.8} />
    {!coverOn && Array.from({ length: n }).flatMap((_, i) => {
      const x = start + i * pitch - (pitch - slot) / 2
      return [
        <rect key={`t${i}`} x={x} y={0} width={pitch - slot} height={finger} fill="#a9aca8" />,
        <rect key={`b${i}`} x={x} y={H - finger} width={pitch - slot} height={finger} fill="#a9aca8" />,
      ]
    })}
    {coverOn && <>
      <line x1={0} y1={2.2} x2={L} y2={2.2} stroke="#d7dad5" strokeWidth={1} />
      <line x1={0} y1={H - 2.2} x2={L} y2={H - 2.2} stroke="#8a8e89" strokeWidth={1} />
    </>}
    <text x={L / 2} y={H + 13} textAnchor="middle" fontSize={10} fill="#475569">{c.ref} · {d.lengthMm} mm · {d.widthMm}×{d.heightMm}{coverOn ? '' : ' · sem tampa'}</text>
  </g>
}

/** Espiral de proteção: representação esquemática em vista frontal (hélice simplificada). */
export function SpiralWrap2D({ c }: { c: ElectricalComponent }) {
  const d = spiralWrapDimsOf(c.state)
  const L = c.w
  const H = Math.max(c.h, 12)
  const color = typeof c.state.color === 'string' ? c.state.color : '#0a0a0a'
  const pitchPx = Math.max(4, (d.pitchMm / Math.max(1, d.lengthMm)) * L)
  const n = Math.max(3, Math.floor(L / pitchPx))
  const r = H * 0.38
  const cy = H / 2
  const path: string[] = []
  for (let i = 0; i <= n * 4; i++) {
    const t = i / (n * 4)
    const x = t * L
    const y = cy + Math.sin(t * n * Math.PI * 2) * r
    path.push(`${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`)
  }
  return <g pointerEvents="none" data-spiral-wrap>
    <rect x={0} y={0} width={L} height={H} rx={H / 2} fill="#1a1a1a" stroke="#333" strokeWidth={0.6} opacity={0.35} />
    <path d={path.join(' ')} fill="none" stroke={color} strokeWidth={Math.max(2, H * 0.28)} strokeLinecap="round" />
    <text x={L / 2} y={H + 13} textAnchor="middle" fontSize={10} fill="#475569">{c.ref} · Ø{d.innerDiaMm} · {d.lengthMm} mm</text>
  </g>
}
