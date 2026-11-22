import type { ElectricalComponent } from '../types'
import { MEC_DIMS, MECHATRONICS_INFO, armAtHome, isMechatronicsType, workpieceMaterialOf } from '../three/mechatronicsModel'

/**
 * Símbolos de esquema da maquete de estampagem: pictogramas técnicos simples (IEC 60617 onde
 * existe equivalente — contacto comutado, motor M=, sensor magnético) e silhuetas para a mecânica.
 */
export function MechatronicsSymbol({ c, stroke }: { c: ElectricalComponent; stroke: string }) {
  if (!isMechatronicsType(c.type)) return null
  const { w, h } = c
  const ref = (y = 14) => (
    <text x={6} y={y} fontSize={9} fontWeight={700} fill="#1e3a8a" fontFamily="ui-monospace, monospace">{c.ref}</text>
  )
  const caption = (text: string) => (
    <text x={w / 2} y={h - 5} fontSize={7.5} textAnchor="middle" fill="#334155">{text}</text>
  )
  switch (c.type) {
    case 'mecMicroSwitchRoller': {
      const pressed = !!c.state.pressed
      return (
        <g>
          <rect x={4} y={6} width={w - 8} height={h - 12} rx={4} fill="#f8fafc" stroke={stroke} strokeWidth={1.2} />
          {/* Contacto comutado: C em baixo ao centro, NA à direita, NF à esquerda */}
          <line x1={w * 0.2} y1={h - 6} x2={w * 0.2} y2={h * 0.62} stroke="#0f172a" strokeWidth={1.6} />
          <line x1={w * 0.8} y1={h - 6} x2={w * 0.8} y2={h * 0.62} stroke="#0f172a" strokeWidth={1.6} />
          <line x1={w * 0.5} y1={h - 6} x2={w * 0.5} y2={h * 0.62} stroke="#0f172a" strokeWidth={1.6} />
          <line x1={w * 0.5} y1={h * 0.62} x2={pressed ? w * 0.78 : w * 0.24} y2={h * 0.42} stroke={pressed ? '#16a34a' : '#0f172a'} strokeWidth={2} />
          <circle cx={w * 0.5} cy={h * 0.3} r={4} fill="none" stroke="#0f172a" strokeWidth={1.2} />
          {ref()}
        </g>
      )
    }
    case 'mecDcGearmotor': {
      const run = c.state.running === true
      return (
        <g>
          <circle cx={w * 0.42} cy={h * 0.55} r={Math.min(w, h) * 0.28} fill={run ? '#fef3c7' : '#f8fafc'} stroke={stroke} strokeWidth={1.6} />
          <text x={w * 0.42} y={h * 0.55 + 2} fontSize={12} fontWeight={800} textAnchor="middle" fill="#0f172a">M</text>
          <line x1={w * 0.34} y1={h * 0.55 + 7} x2={w * 0.5} y2={h * 0.55 + 7} stroke="#0f172a" strokeWidth={1.2} />
          <rect x={w * 0.74} y={h * 0.42} width={w * 0.18} height={h * 0.26} rx={3} fill="#e2e8f0" stroke="#334155" />
          <text x={w * 0.83} y={h * 0.59} fontSize={7} textAnchor="middle" fill="#0f172a">ENC</text>
          {run && <text x={w * 0.42} y={h * 0.24} fontSize={8} textAnchor="middle" fill="#b45309">{c.state.direction === 'ccw' ? '↺ CCW' : '↻ CW'}</text>}
          {ref(h - 4)}
        </g>
      )
    }
    case 'mecFeederCylinder':
    case 'mecStampingPress': {
      const pct = Math.max(0, Math.min(100, Number(c.state.positionPct ?? 0)))
      const vertical = c.type === 'mecStampingPress'
      if (vertical) {
        const top = 22, len = h * 0.5
        return (
          <g>
            <rect x={w * 0.3} y={top} width={w * 0.4} height={len} fill="#e2e8f0" stroke={stroke} strokeWidth={1.6} />
            <rect x={w * 0.32} y={top + 2 + (len - 10) * (pct / 100)} width={w * 0.36} height={6} fill="#475569" />
            <line x1={w / 2} y1={top + 8 + (len - 10) * (pct / 100)} x2={w / 2} y2={top + len + 8 + (pct / 100) * 18} stroke="#0f172a" strokeWidth={2.4} />
            <rect x={w * 0.24} y={top + len + 8 + (pct / 100) * 18} width={w * 0.52} height={5} fill="#94a3b8" stroke="#334155" />
            {ref()}
            {caption(`Prensa Ø32 × ${MEC_DIMS.press.strokeMm}`)}
          </g>
        )
      }
      const x0 = 10, len = w * 0.5
      return (
        <g>
          <rect x={x0} y={h * 0.3} width={len} height={h * 0.34} fill="#e2e8f0" stroke={stroke} strokeWidth={1.6} />
          <rect x={x0 + 2 + (len - 10) * (pct / 100)} y={h * 0.32} width={6} height={h * 0.3} fill="#475569" />
          <line x1={x0 + 8 + (len - 10) * (pct / 100)} y1={h * 0.47} x2={x0 + len + 10 + (pct / 100) * 26} y2={h * 0.47} stroke="#0f172a" strokeWidth={2.4} />
          <rect x={x0 + len + 10 + (pct / 100) * 26} y={h * 0.28} width={5} height={h * 0.38} fill="#94a3b8" stroke="#334155" />
          {ref(12)}
        </g>
      )
    }
    case 'mecRotaryArm': {
      const ang = (Number(c.state.angleDeg ?? 0) * Math.PI) / 180
      const cx = w / 2, cy = h * 0.52, r = Math.min(w, h) * 0.34
      return (
        <g>
          <circle cx={cx} cy={cy} r={r * 0.42} fill="#e2e8f0" stroke={stroke} strokeWidth={1.6} />
          <line x1={cx} y1={cy} x2={cx + Math.cos(ang) * r} y2={cy + Math.sin(ang) * r} stroke="#0f172a" strokeWidth={4} strokeLinecap="round" />
          <circle cx={cx + Math.cos(ang) * r} cy={cy + Math.sin(ang) * r} r={5} fill={c.state.vacuumActive ? '#0ea5e9' : '#1f2937'} />
          <circle cx={cx + r * 0.55} cy={cy} r={2.5} fill={armAtHome(Number(c.state.angleDeg ?? 0)) ? '#f59e0b' : '#cbd5e1'} />
          {ref()}
        </g>
      )
    }
    case 'mecVacuumEjector': {
      const on = !!c.state.vacuumActive
      return (
        <g>
          <path d={`M 8 ${h * 0.35} L ${w * 0.45} ${h * 0.5} L 8 ${h * 0.65} Z`} fill="#e2e8f0" stroke={stroke} strokeWidth={1.4} />
          <path d={`M ${w * 0.45} ${h * 0.5} L ${w - 10} ${h * 0.35} L ${w - 10} ${h * 0.65} Z`} fill={on ? '#bae6fd' : '#f8fafc'} stroke={stroke} strokeWidth={1.4} />
          <text x={w * 0.5} y={h * 0.28} fontSize={8} textAnchor="middle" fill="#0f172a">{on ? 'VÁCUO' : 'Venturi'}</text>
          {ref(h - 4)}
        </g>
      )
    }
    case 'mecWorkpiece': {
      const mat = workpieceMaterialOf(c.state.material)
      return (
        <g>
          <ellipse cx={w / 2} cy={h * 0.36} rx={w * 0.34} ry={h * 0.12} fill={mat === 'preto' ? '#334155' : mat === 'branco' ? '#ffffff' : '#cbd5e1'} stroke={stroke} />
          <rect x={w * 0.16} y={h * 0.36} width={w * 0.68} height={h * 0.32} fill={mat === 'preto' ? '#1f2937' : mat === 'branco' ? '#f1f5f9' : '#94a3b8'} stroke={stroke} />
          {ref(12)}
        </g>
      )
    }
    default:
      return (
        <g>
          <rect x={4} y={6} width={w - 8} height={h - 12} rx={4} fill="#eef2f6" stroke={stroke} strokeWidth={1.2} strokeDasharray="5 3" />
          {ref()}
          <text x={w / 2} y={h / 2 + 3} fontSize={7.5} textAnchor="middle" fill="#334155">{MECHATRONICS_INFO[c.type].name.split(' ').slice(0, 2).join(' ')}</text>
        </g>
      )
  }
}
