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
    case 'mecDrawerCylinder': {
      const pct = Math.max(0, Math.min(100, Number(c.state.positionPct ?? 0)))
      const x0 = 8, len = w * 0.46
      return (
        <g>
          {/* Cilindro horizontal com forquilha e gaveta FC 2 */}
          <rect x={x0} y={h * 0.28} width={len} height={h * 0.3} fill="#e2e8f0" stroke={stroke} strokeWidth={1.6} />
          <rect x={x0 + 2 + (len - 10) * (pct / 100)} y={h * 0.3} width={6} height={h * 0.26} fill="#475569" />
          <line x1={x0 + 8 + (len - 10) * (pct / 100)} y1={h * 0.43} x2={x0 + len + 14 + (pct / 100) * 18} y2={h * 0.43} stroke="#0f172a" strokeWidth={2.4} />
          <path d={`M ${x0 + len + 14 + (pct / 100) * 18} ${h * 0.3} l 10 ${h * 0.13} l 0 ${h * 0.18} l -10 ${-h * 0.05} Z`} fill="#94a3b8" stroke="#334155" />
          <rect x={x0 + len + 30 + (pct / 100) * 18} y={h * 0.26} width={w * 0.2} height={h * 0.4} fill="#cbd5e1" stroke={stroke} strokeWidth={1.4} />
          <circle cx={x0 + len + 30 + (pct / 100) * 18 + w * 0.1} cy={h * 0.46} r={4} fill="#f8fafc" stroke="#334155" />
          {ref(11)}
          {caption('Cilindro 3 · gaveta FC 2')}
        </g>
      )
    }
    case 'mecValveIsland': {
      const s1 = !!c.state.station1On
      const s2 = !!c.state.station2On
      return (
        <g>
          {/* Duas eletroválvulas 5/2 sobre sub-base coletora */}
          <rect x={5} y={h * 0.5} width={w - 10} height={h * 0.24} fill="#e2e8f0" stroke={stroke} strokeWidth={1.4} />
          {[0, 1].map((i) => {
            const on = i === 0 ? s1 : s2
            const bx = 8 + i * (w - 16) / 2
            const bw = (w - 16) / 2 - 3
            return (
              <g key={i}>
                <rect x={bx} y={h * 0.24} width={bw} height={h * 0.28} rx={2} fill={on ? '#fef3c7' : '#f1f5f9'} stroke={stroke} strokeWidth={1.3} />
                <rect x={bx + 2} y={h * 0.3} width={5} height={h * 0.16} fill={on ? '#f59e0b' : '#94a3b8'} stroke="#334155" strokeWidth={0.7} />
                <line x1={bx + 2} y1={h * 0.16} x2={bx + 2} y2={h * 0.24} stroke="#0ea5e9" strokeWidth={1.3} />
                <line x1={bx + bw - 2} y1={h * 0.16} x2={bx + bw - 2} y2={h * 0.24} stroke="#0ea5e9" strokeWidth={1.3} />
                <text x={bx + bw / 2} y={h * 0.14} fontSize={7} textAnchor="middle" fill="#0f172a">{`A${i + 1}  B${i + 1}`}</text>
                <text x={bx + bw / 2} y={h * 0.9} fontSize={7} textAnchor="middle" fill="#334155">{`Y${i + 1}`}</text>
              </g>
            )
          })}
          {ref(11)}
          {caption(`5/2 · ${c.state.islandTag ?? 'C1A'}`)}
        </g>
      )
    }
    case 'mecOpticalSensor': {
      const on = !!c.state.triggered
      return (
        <g>
          {/* Fotocélula difusa com feixe refletido na peça */}
          <path d={`M 8 ${h * 0.32} L ${w * 0.34} ${h * 0.5} L 8 ${h * 0.68} Z`} fill="#e2e8f0" stroke={stroke} strokeWidth={1.4} />
          <line x1={w * 0.34} y1={h * 0.5} x2={w * 0.78} y2={h * 0.36} stroke={on ? '#ea580c' : '#94a3b8'} strokeWidth={1.4} strokeDasharray="4 3" />
          <line x1={w * 0.78} y1={h * 0.36} x2={w * 0.34} y2={h * 0.5} stroke={on ? '#ea580c' : '#cbd5e1'} strokeWidth={1.4} strokeDasharray="4 3" />
          <rect x={w * 0.78} y={h * 0.3} width={w * 0.12} height={h * 0.4} fill={on ? '#e2e8f0' : '#f1f5f9'} stroke="#334155" />
          <circle cx={w * 0.34} cy={h * 0.5} r={2.6} fill={on ? '#ea580c' : '#475569'} />
          {ref(11)}
          {caption('S. ótico M18 · OUT')}
        </g>
      )
    }
    case 'mecInductiveSensor': {
      const on = !!c.state.triggered
      return (
        <g>
          {/* Indutivo faceado com bobina osciladora */}
          <rect x={5} y={h * 0.42} width={w * 0.4} height={h * 0.3} fill="#e2e8f0" stroke={stroke} strokeWidth={1.4} />
          <line x1={w * 0.45} y1={h * 0.57} x2={w * 0.62} y2={h * 0.57} stroke="#0f172a" strokeWidth={2} />
          {[0, 1, 2].map((i) => (
            <path key={i} d={`M ${w * 0.62 + i * 6} ${h * 0.42} q 5 ${h * 0.15} 0 ${h * 0.3}`} fill="none" stroke={on ? '#16a34a' : '#64748b'} strokeWidth={1.4} />
          ))}
          <rect x={w * 0.62 + 22} y={h * 0.4} width={6} height={h * 0.34} fill={on ? '#cbd5e1' : '#e2e8f0'} stroke="#334155" />
          {ref(11)}
          {caption('S. indutivo M12')}
        </g>
      )
    }
    case 'mecHmiKtp700': {
      const on = c.state.powered !== false && c.state.on !== false
      return (
        <g>
          <rect x={4} y={4} width={w - 8} height={h - 8} rx={3} fill="#e2e8f0" stroke={stroke} strokeWidth={1.4} />
          <rect x={8} y={8} width={w - 16} height={h * 0.52} rx={2} fill={on ? '#0f172a' : '#1e293b'} stroke="#334155" />
          {on && <line x1={12} y1={h * 0.2} x2={w - 20} y2={h * 0.2} stroke="#38bdf8" strokeWidth={1.4} />}
          {on && <line x1={12} y1={h * 0.32} x2={w * 0.62} y2={h * 0.32} stroke="#38bdf8" strokeWidth={1.4} />}
          {Array.from({ length: 8 }, (_, i) => (
            <rect key={i} x={8 + i * (w - 16) / 8 + 1} y={h * 0.66} width={(w - 16) / 8 - 2} height={h * 0.2} fill="#f8fafc" stroke="#334155" strokeWidth={0.6} />
          ))}
          <text x={10} y={h * 0.99} fontSize={6.5} fill="#334155">{'SIEMENS · KTP700'}</text>
        </g>
      )
    }
    case 'mecOperatorBox': {
      const ops = [
        { label: 'E', active: !!c.state.emergLatched, color: '#dc2626' },
        { label: 'M/A', active: c.state.autoMode !== false, color: '#0f172a' },
        { label: 'R', active: !!c.state.resetPressed, color: '#2563eb' },
        { label: 'C', active: !!c.state.dirRight, color: '#0f172a' },
        { label: 'S', active: !!c.state.stopPressed, color: '#dc2626' },
        { label: 'I', active: !!c.state.startPressed, color: '#16a34a' },
      ]
      const r = Math.min(h * 0.2, (w - 20) / 12)
      return (
        <g>
          <rect x={4} y={h * 0.24} width={w - 8} height={h * 0.56} rx={4} fill="#e2e8f0" stroke={stroke} strokeWidth={1.4} />
          {ops.map((op, i) => {
            const cx = 10 + r + i * ((w - 20 - 2 * r) / 5)
            return (
              <g key={op.label}>
                <circle cx={cx} cy={h * 0.52} r={r} fill={op.active ? op.color : '#f8fafc'} stroke={op.color} strokeWidth={1.4} />
                <text x={cx} y={h * 0.9} fontSize={6} textAnchor="middle" fill="#334155">{op.label}</text>
              </g>
            )
          })}
          {ref(11)}
          {caption('Pupitre 6 × Ø22')}
        </g>
      )
    }
    case 'mecSignalTower': {
      const tiers = [
        { on: !!c.state.red, color: '#ef4444' },
        { on: !!c.state.yellow, color: '#facc15' },
        { on: !!c.state.green, color: '#22c55e' },
      ]
      const cw = Math.min(w * 0.46, 26)
      const th = (h - 20) / 3
      return (
        <g>
          <rect x={w / 2 - cw * 0.75} y={h - 12} width={cw * 1.5} height={7} rx={2} fill="#334155" />
          {tiers.map((t, i) => (
            <rect
              key={i}
              x={w / 2 - cw / 2}
              y={8 + i * th}
              width={cw}
              height={th - 1.5}
              rx={2}
              fill={t.on ? t.color : '#e2e8f0'}
              stroke="#334155"
              strokeWidth={1.2}
            />
          ))}
          {ref(11)}
          {caption(`torre ${tiers.filter((t) => t.on).length}/3`)}
        </g>
      )
    }
    case 'mecBenchDuct': {
      const teeth = Math.max(3, Math.round((w - 12) / 9))
      return (
        <g>
          <rect x={5} y={h * 0.34} width={w - 10} height={h * 0.34} fill="#e2e8f0" stroke={stroke} strokeWidth={1.4} />
          {Array.from({ length: teeth }, (_, i) => (
            <line
              key={i}
              x1={8 + i * ((w - 16) / Math.max(1, teeth - 1))}
              y1={h * 0.34}
              x2={8 + i * ((w - 16) / Math.max(1, teeth - 1))}
              y2={h * 0.2}
              stroke="#64748b"
              strokeWidth={1.2}
            />
          ))}
          <line x1={5} y1={h * 0.2} x2={w - 5} y2={h * 0.2} stroke="#475569" strokeWidth={1.2} />
          {ref(13)}
          {caption('calha ranhurada PVC')}
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
