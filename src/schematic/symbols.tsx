import type { ElectricalComponent, Terminal, TerminalType } from '../types'
import { useSimStore } from '../store/useSimStore'
import { componentTerminalLocal } from './componentTerminalViews'

/** Cores de cabo do editor (com contraste calibrado para o modo claro). */
export const WIRE_COLORS: Record<string, string> = {
  red: '#ef4444',
  blue: '#3b82f6',
  'green-yellow': '#84cc16',
  black: '#334155',
  orange: '#f59e0b',
  grey: '#94a3b8',
  brown: '#92400e',
  white: '#b6c2d4',
  pink: '#ec4899',
  violet: '#8b5cf6',
  green: '#22c55e',
  yellow: '#eab308',
  lightblue: '#67e8f9',
}

export const WIRE_KIND_LABEL: Record<string, string> = {
  power: 'Força',
  control: 'Comando',
  signal: 'Sinal',
  neutral: 'Neutro',
  earth: 'Terra (PE)',
  bus: 'Barramento',
}

export const GAUGES = ['0.5mm²', '0.75mm²', '1mm²', '1.5mm²', '2.5mm²', '4mm²', '6mm²', '10mm²', '16mm²']

export const TERMINAL_KIND_LABEL: Record<string, string> = {
  'power-in': 'Força (entrada)',
  'power-out': 'Força (saída)',
  'coil-plus': 'Bobina A1 (+)',
  'coil-minus': 'Bobina A2 (−)',
  'aux-no': 'Contato NA',
  'aux-nc': 'Contato NF',
  neutral: 'Neutro',
  earth: 'Terra (PE)',
  io: 'I/O / sinal',
  analog: 'Analógico',
  bus: 'Barramento',
}

export const TERMINAL_TYPE_LABEL: Record<string, string> = {
  screw: 'Parafuso',
  spring: 'Mola / push-in',
  plug: 'Plug',
  faston: 'Faston',
  fastonMale: 'Faston macho',
  fastonFemale: 'Faston fêmea',
  ring: 'Anel / Olhal',
  fork: 'Garfo / Forquilha',
  pin: 'Pino / Agulha',
  conical: 'Cônico',
  claw: 'Garra',
  tubular: 'Tubular',
  bar: 'Barra',
}

/**
 * Desenha o terminal de cabo no estilo dos conectores reais (anel, garfo,
 * pino, cônico, garra, tubular, faston macho/fêmea, barra) mais os tipos de
 * fixação do borne (parafuso, mola, plug). A cor do corpo/isolamento
 * (`color`) é sempre editável pelo usuário no inspetor; a parte metálica
 * exposta é desenhada em tom prateado fixo. `r` é o raio "de referência"
 * (mesma escala usada antes para o círculo simples do borne).
 */
/** Raio de desenho do borne: `diameter` do borne (editável) ou o padrão do símbolo. */
export function terminalGlyphRadius(t: { diameter?: number }, fallback: number): number {
  return typeof t.diameter === 'number' && t.diameter > 0 ? t.diameter / 2 : fallback
}

/** Área clicável acompanha o borne: nunca menor que 3,5 px nem muito maior que o desenho. */
export function terminalHitRadius(t: { diameter?: number }): number {
  return typeof t.diameter === 'number' && t.diameter > 0 ? Math.max(3.5, Math.min(9, t.diameter / 2 + 2)) : 7
}

export function TerminalGlyph({
  x,
  y,
  type,
  color,
  energized,
  r = 6,
}: {
  x: number
  y: number
  type: TerminalType
  color: string
  energized: boolean
  r?: number
}) {
  const fill = energized ? '#f59e0b' : color
  const metal = '#cbd5e1'
  const dark = '#0b1220'
  const scale = r / 6
  const wrap = (children: React.ReactNode) => (
    <g transform={`translate(${x},${y}) scale(${scale})`}>{children}</g>
  )
  switch (type) {
    case 'ring':
      return wrap(
        <>
          <circle r={7} fill={fill} stroke={dark} strokeWidth={1} />
          <circle r={3} fill={dark} />
        </>,
      )
    case 'fork':
      return wrap(
        <>
          <rect x={-5} y={-7} width={10} height={8} rx={2} fill={fill} stroke={dark} strokeWidth={1} />
          <path d="M -4 1 L -4 8 L -1.4 8 L -1.4 3.5 L 1.4 3.5 L 1.4 8 L 4 8 L 4 1 Z" fill={metal} stroke={dark} strokeWidth={0.8} />
        </>,
      )
    case 'pin':
      return wrap(
        <>
          <rect x={-4} y={-7} width={8} height={7} rx={2} fill={fill} stroke={dark} strokeWidth={1} />
          <rect x={-1.3} y={0} width={2.6} height={9} fill={metal} stroke={dark} strokeWidth={0.6} />
        </>,
      )
    case 'conical':
      return wrap(<path d="M -5 -6 L 5 -6 L 1.6 8 L -1.6 8 Z" fill={fill} stroke={dark} strokeWidth={1} />)
    case 'claw':
      return wrap(
        <>
          <path d="M -4 -7 L 4 -7 L 4 -2 L -4 -2 Z" fill={fill} stroke={dark} strokeWidth={1} />
          <path d="M -3.5 -2 L -3.5 6 L -1 6 L -1 0.5 L 1 0.5 L 1 6 L 3.5 6 L 3.5 -2 Z" fill={metal} stroke={dark} strokeWidth={0.7} />
        </>,
      )
    case 'tubular':
      return wrap(
        <>
          <rect x={-2.6} y={-8} width={5.2} height={6} fill={fill} stroke={dark} strokeWidth={0.8} />
          <rect x={-2} y={-2} width={4} height={9} rx={1} fill={metal} stroke={dark} strokeWidth={0.8} />
        </>,
      )
    case 'fastonFemale':
      return wrap(
        <>
          <rect x={-5} y={-3} width={10} height={8} rx={1.5} fill={fill} stroke={dark} strokeWidth={1} />
          <rect x={-2.4} y={-5.5} width={4.8} height={3} fill={metal} stroke={dark} strokeWidth={0.6} />
        </>,
      )
    case 'fastonMale':
      return wrap(
        <>
          <rect x={-5} y={0} width={10} height={7} rx={1.5} fill={fill} stroke={dark} strokeWidth={1} />
          <rect x={-1.6} y={-7} width={3.2} height={8} fill={metal} stroke={dark} strokeWidth={0.6} />
        </>,
      )
    case 'bar':
      return wrap(
        <>
          <rect x={-9} y={-3} width={18} height={6} rx={1} fill={fill} stroke={dark} strokeWidth={1} />
          <circle cx={-5} cy={0} r={1.2} fill={dark} />
          <circle cx={5} cy={0} r={1.2} fill={dark} />
        </>,
      )
    case 'screw':
      return wrap(
        <>
          <circle r={6} fill={metal} stroke={dark} strokeWidth={1} />
          <rect x={-3.5} y={-0.6} width={7} height={1.2} fill={dark} />
          <circle r={2} fill={fill} opacity={0.9} />
        </>,
      )
    case 'spring':
      return wrap(<rect x={-5} y={-5} width={10} height={10} rx={2} fill={fill} stroke={dark} strokeWidth={1} />)
    case 'faston':
    case 'plug':
    default:
      return wrap(
        <>
          <circle r={6} fill={fill} stroke={dark} strokeWidth={1} />
          <circle r={2.4} fill={metal} />
        </>,
      )
  }
}

/** Posição absoluta de um borne no canvas, respeitando rotação e espelhamento. */
export function terminalPos(c: ElectricalComponent, t: Terminal): { x: number; y: number } {
  const { x: localX, y: localY } = componentTerminalLocal(c, t)
  const cx = c.w / 2
  const cy = c.h / 2
  const mx = c.mirrored ? c.w - localX : localX
  const rot = ((c.rotation % 360) + 360) % 360
  let rx = mx - cx
  let ry = localY - cy
  if (rot === 90) [rx, ry] = [-ry, rx]
  else if (rot === 180) [rx, ry] = [-rx, -ry]
  else if (rot === 270) [rx, ry] = [ry, -rx]
  return { x: c.schematicX + cx + rx, y: c.schematicY + cy + ry }
}

const stroke = (selected: boolean, energized: boolean) => (selected ? '#2655e5' : energized ? '#d97706' : '#64748b')

/** Desenha um símbolo no sistema local do componente (0,0 → w,h). */
export function SymbolGlyph({ c, selected }: { c: ElectricalComponent; selected: boolean }) {
  const { w, h } = c
  const en = !!c.state.energized
  const on = !!c.state.on
  const s = stroke(selected, en || on)
  const label = (x: number, y: number, text: string, size = 10, fill = '#e5e7eb') => (
    <text x={x} y={y} fontSize={size} fill={fill} fontFamily="ui-monospace, monospace">
      {text}
    </text>
  )

  const body = () => {
    switch (c.type) {
      // ------------------------------------------------------------- proteção
      case 'breaker1p':
      case 'breakerWegMdwC10':
      case 'breaker2p':
      case 'breaker3p':
      case 'breaker4p':
      case 'motorBreaker':
      case 'residualBreaker': {
        const poles = c.terminals.filter((t) => t.kind === 'power-in').length
        const closed = c.state.closed && !c.state.tripped
        return (
          <g>
            <rect x={4} y={14} width={w - 8} height={h - 28} rx={4} fill={c.state.tripped ? '#7f1d1d' : '#1f2937'} stroke={c.state.tripped ? '#ef4444' : s} />
            {Array.from({ length: poles }).map((_, i) => {
              const x = ((i + 1) * w) / (poles + 1)
              return (
                <g key={i}>
                  <line x1={x} y1={0} x2={x} y2={16} stroke={s} strokeWidth={1.5} />
                  <line x1={x} y1={h - 16} x2={x} y2={h} stroke={s} strokeWidth={1.5} />
                  <line
                    x1={x}
                    y1={22}
                    x2={closed ? x : x + 12}
                    y2={closed ? h - 24 : h / 2 - 6}
                    stroke={closed ? '#22c55e' : '#ef4444'}
                    strokeWidth={2.5}
                  />
                  {closed && <circle cx={x} cy={h / 2} r={3} fill="#22c55e" />}
                </g>
              )
            })}
            {label(6, 12, c.ref, 10, '#93c5fd')}
            {c.state.inA ? label(6, h - 4, `${c.state.inA}A`, 8, '#64748b') : null}
          </g>
        )
      }
      case 'fuse':
      case 'fuseHolder': {
        const blown = c.state.blown
        return (
          <g>
            <rect x={w / 2 - 10} y={10} width={20} height={h - 20} rx={3} fill={blown ? '#450a0a' : '#1f2937'} stroke={blown ? '#ef4444' : s} />
            {label(4, 10, c.ref, 10, '#93c5fd')}
            {blown && <line x1={w / 2 - 8} y1={h / 2 - 8} x2={w / 2 + 8} y2={h / 2 + 8} stroke="#ef4444" strokeWidth={2} />}
          </g>
        )
      }
      case 'surgeProtector': {
        return (
          <g>
            <rect x={6} y={16} width={w - 12} height={h - 32} rx={4} fill="#312e81" stroke={s} />
            <polygon points={`${w / 2},${h / 2 - 12} ${w / 2 + 10},${h / 2 + 8} ${w / 2 - 10},${h / 2 + 8}`} fill="none" stroke="#facc15" />
            {label(6, 14, c.ref, 10, '#93c5fd')}
          </g>
        )
      }
      case 'thermalRelay': {
        return (
          <g>
            <rect x={4} y={12} width={w - 8} height={h - 24} rx={4} fill={c.state.tripped ? '#7f1d1d' : '#292524'} stroke={c.state.tripped ? '#ef4444' : s} />
            {[0.2, 0.45, 0.7].map((px, i) => (
              <g key={i}>
                <line x1={px * w} y1={0} x2={px * w} y2={14} stroke={s} />
                <line x1={px * w} y1={h - 14} x2={px * w} y2={h} stroke={s} />
              </g>
            ))}
            <g transform={`translate(${w - 30},${h - 34})`}>
              <rect width={24} height={20} rx={3} fill="#1c1917" stroke={c.state.tripped ? '#ef4444' : '#a3a3a3'} />
              <text x={3} y={13} fontSize={8} fill="#fbbf24">{c.state.tripped ? 'TRIP' : 'OK'}</text>
            </g>
            {label(6, 12, c.ref, 10, '#93c5fd')}
            {label(6, h - 6, `${c.state.rangeInA ?? 6}A`, 8, '#64748b')}
          </g>
        )
      }

      // -------------------------------------------------------------- comando
      case 'dualPushButtonNpb22D11': {
        return <g>
          <rect x={4} y={8} width={w - 8} height={h - 16} rx={7} fill="#1f2937" stroke={s} />
          <rect x={w * 0.12} y={h * 0.22} width={w * 0.32} height={h * 0.48} rx={5} fill={c.state.stopPressed ? '#991b1b' : '#ef4444'} />
          <rect x={w * 0.56} y={h * 0.22} width={w * 0.32} height={h * 0.48} rx={5} fill={c.state.startPressed ? '#166534' : '#22c55e'} />
          <text x={w * 0.28} y={h * 0.82} textAnchor="middle" fontSize={8} fill="#fca5a5">STOP</text>
          <text x={w * 0.72} y={h * 0.82} textAnchor="middle" fontSize={8} fill="#86efac">START</text>
          {label(6, 12, c.ref, 10, '#93c5fd')}
        </g>
      }
      case 'buttonNO':
      case 'buttonNC':
      case 'emergencyButton':
      case 'emergencyButtonKeyP20ACR':
      case 'selector2':
      case 'selector3':
      case 'keySwitch':
      case 'limitSwitch':
      case 'footSwitch': {
        const pressed = c.state.pressed
        const isNC = c.type === 'buttonNC' || c.type === 'emergencyButton' || c.type === 'emergencyButtonKeyP20ACR'
        const isEmg = c.type === 'emergencyButton' || c.type === 'emergencyButtonKeyP20ACR'
        const col = c.type === 'buttonNO' ? '#22c55e' : isEmg ? '#dc2626' : isNC ? '#ef4444' : '#eab308'
        const cy = h / 2
        return (
          <g>
            <circle cx={w / 2} cy={cy} r={isEmg ? 20 : 15} fill={pressed ? col : '#111827'} stroke={pressed ? col : '#6b7280'} strokeWidth={2} />
            {isEmg && <circle cx={w / 2} cy={cy} r={26} fill="none" stroke={pressed ? '#7f1d1d' : '#dc2626'} strokeWidth={3} />}
            <line x1={4} y1={cy} x2={w / 2 - (isEmg ? 20 : 15)} y2={cy} stroke={s} strokeWidth={1.5} />
            <line x1={w / 2 + (isEmg ? 20 : 15)} y1={cy} x2={w - 4} y2={cy} stroke={s} strokeWidth={1.5} />
            {/* contato desenhado: NA abre/fecha, NF o contrário */}
            <line x1={w / 2 - 12} y1={cy + (isNC === pressed ? 10 : -2)} x2={w / 2 + 12} y2={cy + 2} stroke={col} strokeWidth={2.5} />
            {label(4, 12, c.ref, 10, '#93c5fd')}
            {c.type === 'selector3' && label(w - 12, 12, `P${c.state.position ?? 0}`, 9, '#94a3b8')}
          </g>
        )
      }

      // -------------------------------------------------------------- sensores
      case 'proximitySensor':
      case 'photoSensor':
      case 'pressureSwitch':
      case 'thermostat':
      case 'floatSwitch': {
        const trig = !!c.state.triggered
        return (
          <g>
            <rect x={4} y={10} width={w - 8} height={h - 20} rx={4} fill={trig ? '#065f46' : '#111827'} stroke={trig ? '#22c55e' : s} />
            <circle cx={w / 2} cy={h / 2} r={8} fill={trig ? '#22c55e' : '#374151'} />
            {c.type === 'photoSensor' && <polygon points={`${w / 2 - 16},${h / 2} ${w / 2 - 6},${h / 2 - 6} ${w / 2 - 6},${h / 2 + 6}`} fill="#f59e0b" />}
            {label(6, 12, c.ref, 10, '#93c5fd')}
            {label(6, h - 4, trig ? 'ATUADO' : 'livre', 8, trig ? '#4ade80' : '#64748b')}
          </g>
        )
      }

      // ------------------------------------------------------------ contatores
      case 'contactorWegCWC09':
      case 'contactor':
      case 'contactor4p': {
        const poles = c.terminals.filter((t) => t.kind === 'power-in').length
        return (
          <g>
            <rect x={4} y={12} width={w - 8} height={h - 24} rx={4} fill={en ? '#064e3b' : '#1f2937'} stroke={en ? '#22c55e' : s} strokeWidth={en ? 2 : 1.5} />
            {Array.from({ length: poles }).map((_, i) => {
              const x = 26 + i * ((w - 44) / Math.max(1, poles - 1 || 1))
              return (
                <g key={i}>
                  <line x1={x} y1={0} x2={x} y2={14} stroke={s} />
                  <line x1={x} y1={h - 14} x2={x} y2={h} stroke={s} />
                  <line x1={x} y1={20} x2={x + (en ? 0 : 9)} y2={en ? h - 22 : h / 2 - 4} stroke={en ? '#22c55e' : '#ef4444'} strokeWidth={2} />
                </g>
              )
            })}
            {/* bobina A1/A2 */}
            <rect x={6} y={h / 2 - 8} width={14} height={16} rx={2} fill={en ? '#22c55e' : '#4b5563'} />
            {label(6, 12, c.ref, 10, '#93c5fd')}
          </g>
        )
      }
      case 'auxContactBlock': {
        return (
          <g>
            <rect x={4} y={16} width={w - 8} height={h - 32} rx={4} fill="#1f2937" stroke={s} />
            <line x1={4} y1={h / 2} x2={w / 2 - 6} y2={h / 2} stroke={s} />
            <line x1={w / 2 - 6} y1={c.state.closed ? h / 2 : h / 2 - 10} x2={w / 2 + 6} y2={h / 2} stroke={c.state.closed ? '#22c55e' : '#ef4444'} strokeWidth={2} />
            <line x1={w / 2 + 6} y1={h / 2} x2={w - 4} y2={h / 2} stroke={s} />
            {label(6, 14, c.ref, 10, '#93c5fd')}
          </g>
        )
      }

      // ----------------------------------------------------------------- relés
      case 'auxRelay':
      case 'auxRelay4':
      case 'timerRelayTON':
      case 'timerRelayTOF':
      case 'timerRelayStarDelta':
      case 'counterRelay':
      case 'safetyRelay': {
        const isTimer = c.type.startsWith('timerRelay')
        const isCounter = c.type === 'counterRelay'
        return (
          <g>
            <rect x={4} y={12} width={w - 8} height={h - 24} rx={4} fill={en ? '#1e3a8a' : '#1f2937'} stroke={en ? '#60a5fa' : s} strokeWidth={en ? 2 : 1.5} />
            <rect x={8} y={h / 2 - 10} width={16} height={20} rx={2} fill={en ? '#3b82f6' : '#4b5563'} />
            <line x1={26} y1={0} x2={26} y2={14} stroke={s} />
            <line x1={26} y1={h - 14} x2={26} y2={h} stroke={s} />
            <line x1={30} y1={h / 2 - 16} x2={30} y2={h / 2 - 6} stroke={s} strokeWidth={2} />
            <line x1={30} y1={h / 2 - 6} x2={en ? 30 : 42} y2={en ? h / 2 + 10 : h / 2 - 6} stroke={en ? '#22c55e' : '#ef4444'} strokeWidth={2} />
            <line x1={30} y1={h / 2 + 10} x2={30} y2={h / 2 + 20} stroke={s} strokeWidth={2} />
            {isTimer && <text x={w / 2 - 6} y={h / 2 + 26} fontSize={9} fill="#fbbf24">{`${((c.state.presetMs ?? 3000) / 1000).toFixed(1)}s`}</text>}
            {isCounter && <text x={w / 2 - 6} y={h / 2 + 26} fontSize={9} fill="#fbbf24">{`${c.state.count ?? 0}/${c.state.preset ?? 5}`}</text>}
            {label(6, 12, `${c.ref}`, 10, '#93c5fd')}
          </g>
        )
      }

      // ------------------------------------------------------------ sinalização
      case 'ledGreen':
      case 'ledRed':
      case 'ledYellow':
      case 'ledWhite':
      case 'pilotLightAd22':
      case 'buzzer': {
        const col = c.state.color && (c.type.startsWith('led') || c.type === 'pilotLightAd22') ? c.state.color : '#f59e0b'
        const lit = !!c.state.on
        return (
          <g>
            <circle cx={w / 2} cy={h / 2} r={Math.min(w, h) / 2 - 6} fill={lit ? col : '#1f2937'} stroke={lit ? col : '#4b5563'} strokeWidth={2} />
            {lit && <circle cx={w / 2} cy={h / 2} r={Math.min(w, h) / 2 - 1} fill="none" stroke={col} opacity={0.35} strokeWidth={4} />}
            {c.type === 'buzzer' && <text x={w / 2 - 6} y={h / 2 + 4} fontSize={10} fill={lit ? '#111827' : '#94a3b8'}>♪</text>}
            {label(4, 10, c.ref, 9, '#93c5fd')}
          </g>
        )
      }
      case 'towerLight': {
        return (
          <g>
            {[
              { y: 6, col: '#ef4444', st: c.state.red },
              { y: h / 2 - 12, col: '#eab308', st: c.state.yellow },
              { y: h - 30, col: '#22c55e', st: c.state.green },
            ].map((b, i) => (
              <rect key={i} x={14} y={b.y} width={w - 28} height={22} rx={3} fill={b.st ? b.col : '#1f2937'} stroke={b.st ? b.col : '#4b5563'} />
            ))}
            {label(4, h - 2, c.ref, 9, '#93c5fd')}
          </g>
        )
      }

      // ------------------------------------------------------------- motores
      case 'motor3ph':
      case 'motor1ph': {
        const run = !!c.state.running
        const dir = c.state.direction
        return (
          <g>
            <circle cx={w / 2} cy={h / 2} r={Math.min(w, h) / 2 - 6} fill={run ? '#1e3a8a' : '#1f2937'} stroke={run ? '#60a5fa' : s} strokeWidth={2} />
            <text x={w / 2 - 8} y={h / 2 + 6} fontSize={18} fill="#e5e7eb" fontWeight="bold">M</text>
            <text x={w / 2 + 12} y={h / 2 + 6} fontSize={12} fill={run ? '#4ade80' : '#64748b'}>
              {run ? (dir === 'cw' ? '↻' : '↺') : '⏹'}
            </text>
            {label(4, 12, c.ref, 10, '#93c5fd')}
            {label(4, h - 4, `${c.state.cv ?? 1} cv`, 8, '#64748b')}
          </g>
        )
      }

      // --------------------------------------------------------- acionamentos
      case 'vfd':
      case 'softStarter': {
        const run = !!c.state.running
        return (
          <g>
            <rect x={4} y={10} width={w - 8} height={h - 20} rx={5} fill="#0f172a" stroke={run ? '#22c55e' : s} strokeWidth={2} />
            <rect x={12} y={h / 2 - 14} width={w - 24} height={28} rx={3} fill="#020617" stroke="#334155" />
            <text x={16} y={h / 2 + 4} fontSize={12} fill={run ? '#4ade80' : '#64748b'} fontFamily="ui-monospace,monospace">
              {c.type === 'vfd' ? `${(c.state.frequencyHz ?? 0).toFixed(1)} Hz` : run ? 'RUN' : 'STOP'}
            </text>
            {label(6, 10, c.ref, 10, '#93c5fd')}
            {label(6, h - 6, c.type === 'vfd' ? 'INVERSOR' : 'SOFT-STARTER', 8, '#475569')}
          </g>
        )
      }

      // -------------------------------------------------------- controladores
      case 'plcLogo':
      case 'plcCompact':
      case 'plcLsXbmDn32s': {
        return (
          <g>
            <rect x={4} y={10} width={w - 8} height={h - 20} rx={5} fill="#0b1220" stroke={s} strokeWidth={2} />
            <rect x={12} y={18} width={w - 24} height={26} rx={3} fill="#0ea5e9" opacity={0.12} />
            <text x={16} y={36} fontSize={11} fill="#7dd3fc" fontFamily="ui-monospace,monospace">RUN</text>
            <circle cx={w - 22} cy={31} r={4} fill="#22c55e" />
            <g>
              {c.terminals.filter((t) => t.label.startsWith('I')).map((t, i) => (
                <rect key={t.id} x={10 + i * 12} y={h - 22} width={9} height={9} rx={1.5} fill={t.energized ? '#22c55e' : '#334155'} />
              ))}
              {c.terminals.filter((t) => t.label.startsWith('Q')).map((t, i) => (
                <rect key={t.id} x={10 + i * 12} y={h - 40} width={9} height={9} rx={1.5} fill={t.energized ? '#f59e0b' : '#334155'} />
              ))}
            </g>
            {label(6, 12 + 6, c.ref, 10, '#93c5fd')}
          </g>
        )
      }
      // ----------------------------------------- Siemens LOGO! 12/24RC (detalhado)
      case 'plcSiemensLogo1224RC': {
        const lPlus = c.terminals.find((t) => t.label === 'L+')
        const on = !!lPlus?.energized
        const pressed = c.state.pressedButton as string | undefined
        const pressBtn = (name: string) => (e: React.MouseEvent) => {
          e.stopPropagation()
          useSimStore.getState().setComponentState(c.id, { pressedButton: name })
        }
        const releaseBtn = (e: React.MouseEvent) => {
          e.stopPropagation()
          if (c.state.pressedButton) useSimStore.getState().setComponentState(c.id, { pressedButton: null })
        }
        const arrowFill = (name: string) => (pressed === name ? '#e4e4e7' : '#71717a')
        const keyFill = (name: string) => (pressed === name ? '#38bdf8' : '#1d4ed8')
        const diTerms = c.terminals.filter((t) => t.label === 'L+' || t.label === 'M' || t.label.startsWith('I'))
        const doTerms = c.terminals.filter((t) => /^Q[1-4]$/.test(t.label))
        return (
          <g>
            {/* invólucro plástico */}
            <rect x={1} y={1} width={w - 2} height={h - 2} rx={6} fill="#3f3f46" stroke={s} strokeWidth={selected ? 2 : 1.4} />

            {/* tira superior — bornes de entrada (DI) */}
            <rect x={5} y={2} width={w - 10} height={26} rx={3} fill="#18181b" stroke="#52525b" />
            {diTerms.map((t) => (
              <text key={t.id} x={t.x * w} y={20} fontSize={7.5} fill="#e4e4e7" fontFamily="ui-monospace, monospace" textAnchor="middle">
                {t.label}
              </text>
            ))}
            {label(8, 40, 'DC12/24V', 7.5, '#a1a1aa')}
            {label(w * 0.4, 40, 'Input 8xDC (I7,I8 0..10V)', 6.5, '#a1a1aa')}

            {/* logótipo + ecrã */}
            <text x={10} y={64} fontSize={13} fontStyle="italic" fill="#d4d4d8" fontFamily="ui-sans-serif, sans-serif">
              SIEMENS
            </text>
            <rect x={10} y={72} width={94} height={54} rx={2} fill={on ? '#22c55e' : '#14532d'} stroke="#0b1220" />
            {on && (
              <rect x={10} y={72} width={94} height={54} rx={2} fill="none" stroke="#4ade80" opacity={0.5} strokeWidth={2} />
            )}
            {label(16, 100, on ? 'RUN' : '···', 11, on ? '#052e16' : '#166534')}
            {label(10, 140, 'LOGO! 12/24RC', 10, '#e4e4e7')}
            {label(10, h - 52, '6ED1 052-1MD00-0BA2', 6, '#71717a')}

            {/* cluster de navegação: setas + ESC/OK (clicáveis) */}
            <g style={{ cursor: 'pointer' }}>
              <polygon
                points={`${w - 58},${86} ${w - 50},${72} ${w - 42},${86}`}
                fill={arrowFill('up')}
                onMouseDown={pressBtn('up')}
                onMouseUp={releaseBtn}
                onMouseLeave={releaseBtn}
              />
              <polygon
                points={`${w - 58},${104} ${w - 50},${118} ${w - 42},${104}`}
                fill={arrowFill('down')}
                onMouseDown={pressBtn('down')}
                onMouseUp={releaseBtn}
                onMouseLeave={releaseBtn}
              />
              <polygon
                points={`${w - 70},${95} ${w - 84},${87} ${w - 84},${103}`}
                fill={arrowFill('left')}
                onMouseDown={pressBtn('left')}
                onMouseUp={releaseBtn}
                onMouseLeave={releaseBtn}
              />
              <polygon
                points={`${w - 30},${95} ${w - 16},${87} ${w - 16},${103}`}
                fill={arrowFill('right')}
                onMouseDown={pressBtn('right')}
                onMouseUp={releaseBtn}
                onMouseLeave={releaseBtn}
              />
              <circle cx={w - 50} cy={95} r={9} fill="#27272a" stroke="#52525b" />
            </g>
            <g style={{ cursor: 'pointer' }}>
              <rect x={w - 96} y={128} width={30} height={16} rx={3} fill={keyFill('esc')} onMouseDown={pressBtn('esc')} onMouseUp={releaseBtn} onMouseLeave={releaseBtn} />
              <text x={w - 81} y={139} fontSize={8} fill="#e0f2fe" textAnchor="middle">ESC</text>
              <rect x={w - 58} y={128} width={30} height={16} rx={3} fill={keyFill('ok')} onMouseDown={pressBtn('ok')} onMouseUp={releaseBtn} onMouseLeave={releaseBtn} />
              <text x={w - 43} y={139} fontSize={8} fill="#e0f2fe" textAnchor="middle">OK</text>
            </g>

            {/* tira inferior — bornes de saída (DO, relé) */}
            <rect x={5} y={h - 28} width={w - 10} height={26} rx={3} fill="#18181b" stroke="#52525b" />
            {label(8, h - 32, 'Output 4xRelay/10A', 7, '#a1a1aa')}
            {doTerms.map((t) => (
              <g key={t.id}>
                <path
                  d={`M ${t.x * w - 7} ${h - 24} L ${t.x * w - 7} ${h - 18} L ${t.x * w + 7} ${h - 12}`}
                  fill="none"
                  stroke={t.energized ? '#facc15' : '#52525b'}
                  strokeWidth={1.3}
                />
                <text x={t.x * w} y={h - 12} fontSize={8} fill="#fde68a" fontFamily="ui-monospace, monospace" textAnchor="middle">
                  {t.label}
                </text>
              </g>
            ))}

            {label(6, h - 4, c.ref, 9, '#93c5fd')}
          </g>
        )
      }
      case 'siemensTsAdapterIeBasic': {
        return <g>
          <rect x={4} y={8} width={w - 8} height={h - 16} rx={5} fill="#334155" stroke={s} />
          <rect x={w * 0.18} y={h * 0.18} width={w * 0.64} height={h * 0.34} rx={3} fill="#dbe4ec" />
          <rect x={w * 0.28} y={h * 0.62} width={w * 0.44} height={h * 0.2} rx={2} fill="#111827" stroke="#22c55e" />
          <circle cx={w * 0.78} cy={h * 0.14} r={4} fill={c.state.powered ? '#22c55e' : '#64748b'} />
          {label(8, 22, 'TS Adapter IE', 9, '#0f172a')}
          {label(6, h - 4, c.ref, 9, '#93c5fd')}
        </g>
      }
      case 'hmi': {
        return (
          <g>
            <rect x={4} y={10} width={w - 8} height={h - 20} rx={5} fill="#111827" stroke={s} />
            <rect x={14} y={18} width={w - 28} height={h - 44} rx={3} fill={c.state.on ? '#0e7490' : '#1e293b'} />
            <text x={20} y={h / 2} fontSize={10} fill="#a5f3fc">IHM</text>
            {label(6, h - 6, c.ref, 9, '#93c5fd')}
          </g>
        )
      }

      // ------------------------------------------------------ bornes e barras
      case 'terminalBlock':
      case 'terminalPhoenixPti6':
      case 'terminalPE':
      case 'busbarPhase':
      case 'busbarNeutral':
      case 'earthBar': {
        return (
          <g>
            <rect x={2} y={h / 2 - 14} width={w - 4} height={28} rx={4} fill="#1f2937" stroke={s} />
            {c.terminals.map((t, i) => {
              const count = c.terminals.length
              const x = ((i + 1) * w) / (count + 1)
              return (
                <g key={t.id}>
                  <TerminalGlyph x={x} y={h / 2} type={t.terminalType} color={t.color} energized={t.energized} r={terminalGlyphRadius(t, 6)} />
                  <text x={x - 8} y={h / 2 + 20} fontSize={8} fill="#94a3b8">{t.label}</text>
                </g>
              )
            })}
            {label(4, h / 2 - 18, c.ref, 9, '#93c5fd')}
          </g>
        )
      }

      // ------------------------------------------------------------- fontes
      case 'transformer': {
        return (
          <g>
            <rect x={4} y={12} width={w - 8} height={h - 24} rx={4} fill="#1e1b4b" stroke={s} />
            <circle cx={w / 2 - 12} cy={h / 2} r={14} fill="none" stroke="#a78bfa" />
            <circle cx={w / 2 + 12} cy={h / 2} r={14} fill="none" stroke="#a78bfa" />
            {label(6, 12, c.ref, 10, '#93c5fd')}
            {label(6, h - 4, `${c.state.primaryV ?? 380}→${c.state.secondaryV ?? 24}V`, 8, '#64748b')}
          </g>
        )
      }
      case 'powerSupplyProauto24A': {
        const powered = !!c.state.powered
        return <g>
          <rect x={3} y={4} width={w - 6} height={h - 8} rx={5} fill="#3d4650" stroke={s} strokeWidth={1.5} />
          <rect x={10} y={22} width={w - 20} height={h - 44} rx={3} fill="#d7dde2" />
          <text x={w / 2} y={h * 0.39} fontSize={12} textAnchor="middle" fill="#243040" fontWeight="bold">PROAUTO</text>
          <text x={w / 2} y={h * 0.5} fontSize={9} textAnchor="middle" fill="#334155">DRAN120-24A</text>
          <text x={w / 2} y={h * 0.61} fontSize={12} textAnchor="middle" fill="#0f172a">24 V DC · 5 A</text>
          <circle cx={w / 2} cy={h * 0.7} r={4} fill={powered ? '#22c55e' : '#64748b'} />
          {label(6, 13, c.ref, 10, '#e2e8f0')}
        </g>
      }
      case 'powerSupply': {
        return (
          <g>
            <rect x={4} y={12} width={w - 8} height={h - 24} rx={4} fill="#052e16" stroke={c.state.on ? '#22c55e' : s} />
            <text x={12} y={h / 2 + 4} fontSize={11} fill={c.state.on ? '#4ade80' : '#64748b'} fontFamily="ui-monospace,monospace">
              {`${c.state.outV ?? 24}Vdc`}
            </text>
            {label(6, 12, c.ref, 10, '#93c5fd')}
          </g>
        )
      }
      case 'analogAmmeter': {
        return (
          <g>
            <circle cx={w / 2} cy={h / 2} r={Math.min(w, h) / 2 - 4} fill="#f8fafc" stroke={s} strokeWidth={2} />
            <line x1={w / 2} y1={h / 2 + 12} x2={w / 2 + 10} y2={h / 2 - 12} stroke="#dc2626" strokeWidth={2} />
            <text x={w / 2 - 10} y={h / 2 + 22} fontSize={9} fill="#111827">{`${c.state.reading ?? 0}A`}</text>
            {label(4, 10, c.ref, 9, '#93c5fd')}
          </g>
        )
      }
      default:
        return (
          <g>
            <rect x={4} y={10} width={w - 8} height={h - 20} rx={4} fill="#1f2937" stroke={s} />
            {label(6, 22, c.ref, 10, '#93c5fd')}
          </g>
        )
    }
  }

  return (
    <g>
      {body()}
      <ComponentTerminals c={c} />
    </g>
  )
}

/** Bornes e pontos de ligação idênticos para símbolos e modelos 3D. */
export function ComponentTerminals({ c }: { c: ElectricalComponent }) {
  return (
    <g>
      {/* bornes clicáveis */}
      {c.terminals.map((t) => {
        const { x: px, y: py } = componentTerminalLocal(c, t)
        return (
          <g key={t.id}>
            <TerminalGlyph x={px} y={py} type={t.terminalType} color={t.color} energized={t.energized} r={terminalGlyphRadius(t, 4.5)} />
            <circle cx={px} cy={py} r={terminalHitRadius(t)} fill="transparent" className="dc-terminal-hit" />
          </g>
        )
      })}
    </g>
  )
}
