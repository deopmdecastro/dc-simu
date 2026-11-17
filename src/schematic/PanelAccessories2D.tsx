import { closedFloorSpans, closedSpans, inOpening, type DuctOpening } from './ductJunctions'
import { CABLE_DUCT, cableDuctDimsOf, ENCLOSURE, enclosureDimsOf, enclosureHingeOf, spiralWrapDimsOf } from '../three/enclosureParts'
import { SCHEMATIC_PX_PER_MM } from '../three/modelPaths'
import type { ElectricalComponent } from '../types'
import { useSimStore } from '../store/useSimStore'

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
  const components = useSimStore((s) => s.components)
  const mounted = components.filter((comp) => comp.panelMount?.enclosureId === c.id)
  return <g data-enclosure>
    <g pointerEvents="none">
      <rect x={0} y={0} width={W} height={H} rx={3} fill="#d6d8d2" stroke="#7d827b" strokeWidth={1.2} />
      <rect x={f} y={f} width={W - 2 * f} height={H - 2 * f} fill="#eceee9" stroke="#a3a8a1" strokeWidth={0.8} />
      <rect x={f + margin * 0.4} y={f + margin * 0.4} width={Math.max(0, W - 2 * f - margin * 0.8)} height={Math.max(0, H - 2 * f - margin * 0.8)} fill="#e3e7ea" stroke="#b8bec4" strokeWidth={0.6} strokeDasharray="4 3" />
      {hingeYs.map((t) => <rect key={t} x={hx - 4} y={H * t - 14} width={8} height={28} rx={2} fill="#aeb4bb" stroke="#6b7280" strokeWidth={0.6} />)}
      {lockYs.map((t) => <circle key={t} cx={lockX} cy={H * t} r={6} fill="#3a3f47" stroke="#c4c9d0" strokeWidth={1.4} />)}
      {open && <path d={hingeRight ? `M ${W} ${H * 0.04} q ${Math.min(80, W * 0.25)} ${H * 0.02} ${Math.min(110, W * 0.32)} ${H * 0.1}` : `M 0 ${H * 0.04} q ${-Math.min(80, W * 0.25)} ${H * 0.02} ${-Math.min(110, W * 0.32)} ${H * 0.1}`} fill="none" stroke="#64748b" strokeWidth={1} strokeDasharray="5 4" />}
      {/* Furos de aparelhos montados na face (porta/laterais) */}
      {mounted.map((m) => {
        const offX = (m.panelMount?.offsetXmm ?? 0) * px
        const offY = (m.panelMount?.offsetYmm ?? 0) * px
        const cutout = (m.panelMount?.cutoutMm ?? 22) * px
        const cx = W / 2 + offX
        const cy = H / 2 - offY
        const face = m.panelMount?.face ?? 'door'
        const stroke = face === 'inside' ? '#94a3b8' : face === 'door' ? '#0ea5e9' : face === 'doorOuter' ? '#f59e0b' : '#64748b'
        return <g key={`cutout-${m.id}`} pointerEvents="none">
          <circle cx={cx} cy={cy} r={cutout / 2} fill="#0f172a" stroke={stroke} strokeWidth={1.2} strokeDasharray={face === 'inside' ? '3 2' : undefined} opacity={0.9} />
          <circle cx={cx} cy={cy} r={Math.max(2, cutout / 2 - 1.5)} fill="none" stroke="white" strokeWidth={0.7} opacity={0.5} />
          <text x={cx} y={cy - cutout / 2 - 4} textAnchor="middle" fontSize={7} fill="#334155">{m.ref} · {face}</text>
        </g>
      })}
      {/* Furos livres / com bucim — mostra o furo real na face escolhida */}
      {((c.state as any).holes ?? []).map((h: any) => {
        const offX = (h.offsetXmm ?? 0) * px
        const offY = (h.offsetYmm ?? 0) * px
        const dia = (h.diameterMm ?? 20) * px
        const cx = W / 2 + offX
        const cy = H / 2 - offY
        const isGland = !!h.glandType && h.glandType !== 'none'
        const glandLabel = h.glandType && h.glandType !== 'none' ? h.glandType : 'furo'
        return <g key={`hole-${h.id}`} pointerEvents="none">
          <circle cx={cx} cy={cy} r={dia / 2} fill={isGland ? '#374151' : '#0f172a'} stroke={isGland ? '#9ca3af' : '#f8fafc'} strokeWidth={1.1} opacity={0.95} />
          {isGland && <circle cx={cx} cy={cy} r={Math.max(1.5, dia / 2 - 2)} fill="none" stroke="#d1d5db" strokeWidth={0.7} />}
          <text x={cx} y={cy + dia / 2 + 7} textAnchor="middle" fontSize={6} fill="#64748b">{h.face} Ø{h.diameterMm} {glandLabel}</text>
        </g>
      })}
      <text x={W / 2} y={H + 16} textAnchor="middle" fontSize={11} fill="#475569">{c.ref} · {d.widthMm}×{d.heightMm}×{d.depthMm} mm · porta {open ? 'aberta' : 'fechada'}</text>
    </g>
    {/* moldura: área de clique/arrasto do quadro */}
    <rect x={f / 2} y={f / 2} width={W - f} height={H - f} fill="none" stroke="transparent" strokeWidth={f} pointerEvents="stroke" />
  </g>
}

/** Calha técnica ranhurada em vista frontal: dentes cortados de forma limpa nas uniões em T, L e cruz. */
export function CableDuct2D({ c, openings = [] }: { c: ElectricalComponent; openings?: DuctOpening[] }) {
  const px = SCHEMATIC_PX_PER_MM
  const d = cableDuctDimsOf(c.state)
  const L = c.w, H = c.h
  const lenMm = L / px
  const coverOn = c.state.coverOn !== false
  const pitch = CABLE_DUCT.pitch * px
  const slot = CABLE_DUCT.slot * px
  const fingerW = pitch - slot
  const headW = Math.min(pitch - 2.1 * px, fingerW + 2.2 * px)
  const n = Math.max(1, Math.floor((L - slot) / pitch))
  const start = L / 2 - ((n - 1) * pitch) / 2
  const finger = Math.min(H * 0.23, 7.5)
  const fillCol = coverOn ? '#b3b6b1' : '#8e928d'
  const floorSpans = closedFloorSpans(lenMm, openings)
  const topWallSpans = closedSpans(lenMm, openings, 'top')
  const botWallSpans = closedSpans(lenMm, openings, 'bottom')
  const sideOpenings = openings.filter((o) => !o.endTrim)

  return <g pointerEvents="none" data-cable-duct>
    {/* Fundo da calha (aparado nas pontas que entram noutra calha para união em T limpa) */}
    {floorSpans.map(([fa, fb], idx) => {
      const fx = L / 2 + fa * px
      const fw = Math.max(0, (fb - fa) * px)
      const holeCount = !coverOn && H >= 34 && fw >= 54 ? Math.floor((fw - 24) / (25 * px)) : 0
      return (
        <g key={`fl${idx}`}>
          <rect x={fx} y={0} width={fw} height={H} fill={fillCol} />
          {/* Furação oblonga da base segundo NFC 68-102 */}
          {holeCount > 0 && Array.from({ length: holeCount }, (_, k) => {
            const hx = fx + fw / 2 - ((holeCount - 1) * 25 * px) / 2 + k * 25 * px
            return (
              <g key={`h${k}`} opacity={0.42}>
                <rect x={hx - 6} y={H * 0.34 - 2} width={12} height={3.6} rx={1.8} fill="#6f746e" />
                <rect x={hx - 6} y={H * 0.66 - 1.6} width={12} height={3.6} rx={1.8} fill="#6f746e" />
              </g>
            )
          })}
        </g>
      )
    })}

    {/* Dentes/linguetas ranhurados: cortados exatamente onde outra calha liga em T */}
    {!coverOn && Array.from({ length: n }).flatMap((_, i) => {
      const cx = start + i * pitch
      const x = cx - fingerW / 2
      const mm0 = (cx - headW / 2 - L / 2) / px
      const mm1 = (cx + headW / 2 - L / 2) / px
      const topCut = inOpening(openings, 'top', mm0, mm1)
      const botCut = inOpening(openings, 'bottom', mm0, mm1)
      return [
        topCut ? null : (
          <g key={`t${i}`} data-duct-finger="top">
            <rect x={x} y={0.5} width={fingerW} height={finger} fill="#b7bab5" stroke="#6f746e" strokeWidth={0.35} />
            <rect x={cx - headW / 2} y={0.5} width={headW} height={2.1} fill="#c4c7c2" />
          </g>
        ),
        botCut ? null : (
          <g key={`b${i}`} data-duct-finger="bottom">
            <rect x={x} y={H - finger - 0.5} width={fingerW} height={finger} fill="#b7bab5" stroke="#6f746e" strokeWidth={0.35} />
            <rect x={cx - headW / 2} y={H - 2.6} width={headW} height={2.1} fill="#c4c7c2" />
          </g>
        ),
      ]
    })}

    {/* Contornos laterais apenas nos troços fechados (abertos onde liga o T!) */}
    {topWallSpans.map(([a, b], i) => {
      const x1 = L / 2 + a * px, x2 = L / 2 + b * px
      return (
        <g key={`tw${i}`}>
          <line x1={x1} y1={0.4} x2={x2} y2={0.4} stroke="#6f746e" strokeWidth={0.85} />
          {coverOn && <line x1={x1} y1={2.2} x2={x2} y2={2.2} stroke="#d7dad5" strokeWidth={1} />}
        </g>
      )
    })}
    {botWallSpans.map(([a, b], i) => {
      const x1 = L / 2 + a * px, x2 = L / 2 + b * px
      return (
        <g key={`bw${i}`}>
          <line x1={x1} y1={H - 0.4} x2={x2} y2={H - 0.4} stroke="#6f746e" strokeWidth={0.85} />
          {coverOn && <line x1={x1} y1={H - 2.2} x2={x2} y2={H - 2.2} stroke="#8a8e89" strokeWidth={1} />}
        </g>
      )
    })}

    {/* Passagem aberta da união em T: limpa dentes e parede onde o ramal desemboca */}
    {sideOpenings.map((o, i) => {
      const x = L / 2 + Math.min(o.from, o.to) * px, w = Math.abs(o.to - o.from) * px
      return <rect key={`op${i}`} data-duct-opening x={x} y={o.side === 'top' ? -0.8 : H - finger - 0.6} width={w} height={finger + 1.4} fill={fillCol} />
    })}
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
