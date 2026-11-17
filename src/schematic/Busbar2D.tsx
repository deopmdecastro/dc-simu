import type { ElectricalComponent } from '../types'
import {
  ACRYLIC_BUSBAR,
  acrylicBusbarColorOf,
  acrylicBusbarDimsOf,
  acrylicCoverVisibleOf,
  isAcrylicBusbarType,
  STEPPED_BUSBAR,
  steppedBarCenterMm,
  steppedBusbarDimsOf,
  steppedCoverOpenOf,
  steppedCoverVisibleOf,
} from '../three/busbarParts'

/**
 * Vista frontal ortográfica fiel em 2D dos barramentos isolados com acrílico (PE, N e Fase)
 * e do repartidor de fases em escada (4P/3P/2P), sincronizada ao milímetro com o n.º de bornes,
 * a cor do acrílico e o estado da tampa (fechada, aberta ou oculta).
 */
export function Busbar2D({ c }: { c: ElectricalComponent }) {
  const uid = `bb-${c.id.replace(/[^a-zA-Z0-9_-]/g, '')}`

  if (isAcrylicBusbarType(c.type)) {
    const d = acrylicBusbarDimsOf(c.state)
    const sx = c.w / d.widthMm
    const sy = c.h / d.heightMm
    const color = acrylicBusbarColorOf(c.type, c.state)
    const coverOn = acrylicCoverVisibleOf(c.state)
    const earW = ACRYLIC_BUSBAR.earWidthMm * sx
    const bodyX = earW
    const bodyW = d.bodyWidthMm * sx
    const covH = ACRYLIC_BUSBAR.coverHeightMm * sy
    const archTopY = (d.heightMm - 9.2) * sy
    const earTopY = (d.heightMm - ACRYLIC_BUSBAR.earHeightMm) * sy
    const holeY = (d.heightMm - ACRYLIC_BUSBAR.holeCenterYMm) * sy
    const holeR = ACRYLIC_BUSBAR.holeRadiusMm * Math.min(sx, sy)
    const clipCount = d.poles <= 6 ? 2 : 3
    const clipW = Math.max(6, Math.min(12, bodyW * 0.1))

    return (
      <g pointerEvents="none">
        <defs>
          <linearGradient id={`${uid}-pa`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ebe6dc" />
            <stop offset="55%" stopColor="#dcd6c9" />
            <stop offset="100%" stopColor="#c7c0b2" />
          </linearGradient>
          <linearGradient id={`${uid}-br`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f3d98b" />
            <stop offset="50%" stopColor="#cfa23b" />
            <stop offset="100%" stopColor="#8a6518" />
          </linearGradient>
          <linearGradient id={`${uid}-ac`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.52" />
            <stop offset="22%" stopColor={color} stopOpacity="0.68" />
            <stop offset="85%" stopColor={color} stopOpacity="0.82" />
            <stop offset="100%" stopColor="#0f172a" stopOpacity="0.32" />
          </linearGradient>
        </defs>

        {/* Orelhas laterais M4 */}
        {[0, c.w - earW].map((ex, idx) => {
          const slotCx = idx === 0
            ? (ACRYLIC_BUSBAR.earWidthMm - ACRYLIC_BUSBAR.mountOffsetFromBodyMm) * sx
            : c.w - (ACRYLIC_BUSBAR.earWidthMm - ACRYLIC_BUSBAR.mountOffsetFromBodyMm) * sx
          return (
            <g key={idx}>
              <rect x={ex} y={earTopY} width={earW} height={c.h - earTopY} rx={1.6} fill={`url(#${uid}-pa)`} stroke="#9c9588" strokeWidth={0.9} />
              <rect x={slotCx - 3 * sx} y={earTopY + 1.8 * sy} width={6 * sx} height={3.6 * sy} rx={1.8 * sy} fill="#f8fafc" stroke="#8a8377" strokeWidth={0.8} />
            </g>
          )
        })}

        {/* Corpo isolante PA66 com arco inferior */}
        <path
          d={[
            `M ${bodyX} ${c.h}`,
            `L ${bodyX} ${covH - 0.5}`,
            `L ${bodyX + bodyW} ${covH - 0.5}`,
            `L ${bodyX + bodyW} ${c.h}`,
            `L ${bodyX + bodyW - 3.2 * sx} ${c.h}`,
            `L ${bodyX + bodyW - 3.2 * sx} ${archTopY}`,
            `L ${bodyX + 3.2 * sx} ${archTopY}`,
            `L ${bodyX + 3.2 * sx} ${c.h}`,
            'Z',
          ].join(' ')}
          fill={`url(#${uid}-pa)`}
          stroke="#958e81"
          strokeWidth={0.95}
        />

        {/* Furos frontais de latão + cabeças dos parafusos sob o acrílico */}
        {Array.from({ length: d.poles }, (_, i) => {
          const cx = bodyX + (ACRYLIC_BUSBAR.endWallMm + (i + 0.5) * ACRYLIC_BUSBAR.pitchMm) * sx
          return (
            <g key={i}>
              {/* Cabeça de parafuso M4 no topo */}
              <rect x={cx - 2.3 * sx} y={covH * 0.34} width={4.6 * sx} height={covH * 0.62} rx={1} fill={`url(#${uid}-br)`} stroke="#785713" strokeWidth={0.55} />
              {/* Anel biselado de latão e furo de entrada do cabo */}
              <circle cx={cx} cy={holeY} r={holeR} fill={`url(#${uid}-br)`} stroke="#7c5b16" strokeWidth={0.7} />
              <circle cx={cx} cy={holeY} r={holeR * 0.66} fill="#2b2110" />
              <ellipse cx={cx} cy={holeY - holeR * 0.26} rx={holeR * 0.44} ry={holeR * 0.24} fill="#d8ae47" opacity={0.85} />
            </g>
          )
        })}

        {/* Tampa superior em acrílico translúcido colorido + trincos frontais */}
        {coverOn && (
          <g>
            <rect x={bodyX + 0.4} y={0.5} width={bodyW - 0.8} height={covH} rx={1.8} fill={color} fillOpacity={0.56} stroke={color} strokeWidth={1.1} />
            <rect x={bodyX + 0.4} y={0.5} width={bodyW - 0.8} height={covH} rx={1.8} fill={`url(#${uid}-ac)`} />
            <line x1={bodyX + 2} y1={2.1} x2={bodyX + bodyW - 2} y2={2.1} stroke="#ffffff" strokeOpacity={0.72} strokeWidth={1.1} />
            {Array.from({ length: clipCount }, (_, k) => {
              const frac = clipCount === 2 ? (k === 0 ? 0.24 : 0.76) : (k === 0 ? 0.18 : k === 1 ? 0.5 : 0.82)
              const lx = bodyX + frac * bodyW - clipW / 2
              return (
                <rect key={k} x={lx} y={covH - 2.2} width={clipW} height={4.4} rx={0.9} fill={color} fillOpacity={0.82} stroke="#ffffff" strokeOpacity={0.45} strokeWidth={0.6} />
              )
            })}
          </g>
        )}
      </g>
    )
  }

  // Barramento repartidor de fases em escada (4P / 3P / 2P)
  const d = steppedBusbarDimsOf(c.state)
  const sx = c.w / d.widthMm
  const sy = c.h / d.heightMm
  const sideW = STEPPED_BUSBAR.sideFrameMm * sx
  const barX = sideW
  const barW = d.barWidthMm * sx
  const barH = STEPPED_BUSBAR.barHeightMm * sy
  const coverOn = steppedCoverVisibleOf(c.state)
  const coverOpen = steppedCoverOpenOf(c.state)
  const firstBar = steppedBarCenterMm(d, 0)
  const coverBotY = (d.heightMm - (firstBar.yMm + STEPPED_BUSBAR.barHeightMm / 2 + 1.2)) * sy

  return (
    <g pointerEvents="none">
      <defs>
        <linearGradient id={`${uid}-fr`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#e5e8ec" />
          <stop offset="100%" stopColor="#c2c7cf" />
        </linearGradient>
        <linearGradient id={`${uid}-sbr`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f0d584" />
          <stop offset="50%" stopColor="#cca03a" />
          <stop offset="100%" stopColor="#8d6819" />
        </linearGradient>
      </defs>

      {/* Corpo central isolante em escada */}
      <rect x={barX - 1} y={3} width={barW + 2} height={c.h - 10} rx={2} fill="#eef1f4" stroke="#9aa2ae" strokeWidth={0.9} />

      {/* Suportes laterais RAL 7035 com pés DIN */}
      <rect x={0.5} y={1.5} width={sideW} height={c.h - 2} rx={2} fill={`url(#${uid}-fr)`} stroke="#8f98a5" strokeWidth={1} />
      <rect x={c.w - sideW - 0.5} y={1.5} width={sideW} height={c.h - 2} rx={2} fill={`url(#${uid}-fr)`} stroke="#8f98a5" strokeWidth={1} />

      {/* Barras maciças de latão escalonadas + fileiras de parafusos zincados + furos reais */}
      {d.conductors.map((cond, b) => {
        const { yMm } = steppedBarCenterMm(d, b)
        const cy = (d.heightMm - yMm) * sy
        const topY = cy - barH / 2
        return (
          <g key={cond}>
            {/* Barreira dielétrica entre degraus */}
            <line x1={barX} y1={topY - 3.5 * sy} x2={barX + barW} y2={topY - 3.5 * sy} stroke="#cbd5e1" strokeWidth={1.2} />
            {/* Barra de latão */}
            <rect x={barX} y={topY} width={barW} height={barH} rx={1} fill={`url(#${uid}-sbr)`} stroke="#7d5b14" strokeWidth={0.8} />
            {/* Etiqueta gravada no suporte lateral esquerdo */}
            <text x={sideW * 0.52} y={cy + 3} textAnchor="middle" fontSize={Math.max(7, Math.min(9.5, sideW * 0.55))} fontWeight={700} fill={cond === 'N' ? '#1d4ed8' : '#334155'}>
              {cond}
            </text>
            {/* Parafusos superiores zincados + furos frontais de entrada dos cabos */}
            {Array.from({ length: d.holesPerBar }, (_, k) => {
              const hx = barX + (STEPPED_BUSBAR.barEndPadMm + (k + 0.5) * STEPPED_BUSBAR.pitchMm) * sx
              const r = (k === 0 ? 2.85 : 2.32) * Math.min(sx, sy)
              return (
                <g key={k}>
                  <rect x={hx - r * 0.92} y={topY - 3.2 * sy} width={r * 1.84} height={3.1 * sy} rx={0.8} fill="#dbe1e8" stroke="#64748b" strokeWidth={0.55} />
                  <circle cx={hx} cy={cy} r={r} fill="#251d0e" stroke="#f5df97" strokeWidth={0.65} />
                </g>
              )
            })}
          </g>
        )
      })}

      {/* Tampa articulada em policarbonato transparente (fechada ou aberta para cima) */}
      {coverOn && !coverOpen && (
        <g>
          <rect
            x={2}
            y={2}
            width={c.w - 4}
            height={Math.max(12, coverBotY - 2)}
            rx={2.2}
            fill="#e2eef8"
            fillOpacity={0.28}
            stroke="#334155"
            strokeOpacity={0.72}
            strokeWidth={1.35}
          />
          <line x1={5} y1={5} x2={c.w - 5} y2={5} stroke="#ffffff" strokeOpacity={0.75} strokeWidth={1.2} />
          {/* Duas patilhas frontais de abertura */}
          <rect x={sideW + 2} y={coverBotY - 2.5} width={10} height={3.5} rx={0.8} fill="#cbd5e1" fillOpacity={0.7} stroke="#475569" strokeWidth={0.7} />
          <rect x={c.w - sideW - 12} y={coverBotY - 2.5} width={10} height={3.5} rx={0.8} fill="#cbd5e1" fillOpacity={0.7} stroke="#475569" strokeWidth={0.7} />
        </g>
      )}
      {coverOn && coverOpen && (
        <g>
          <rect
            x={2.5}
            y={-8}
            width={c.w - 5}
            height={10}
            rx={1.8}
            fill="#dbeafe"
            fillOpacity={0.35}
            stroke="#334155"
            strokeOpacity={0.65}
            strokeDasharray="3 2"
            strokeWidth={1.1}
          />
        </g>
      )}
    </g>
  )
}
