import { IconSound, IconStop, IconRotateRight, IconRotateLeft } from '../ui/icons'
import { isMechatronicsType } from '../three/mechatronicsModel'
import { MechatronicsSymbol } from './mechatronicsSymbols'
import type { ElectricalComponent, Terminal, TerminalType } from '../types'
import { useSimStore } from '../store/useSimStore'
import { componentTerminalLocal } from './componentTerminalViews'
import { micoProfile } from '../electrical/industrialDevices'

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
    if (isMechatronicsType(c.type)) return <MechatronicsSymbol c={c} stroke={s} />
    switch (c.type) {
      // ------------------------------------------------------------- proteção
      case 'breakerMurrelektronikMico46':
      case 'breakerMurrelektronikMico24': {
        const ch = (c.state.channels ?? {}) as Record<string, { on: boolean; tripped: boolean; fault: boolean; setpointA: number }>
        const channels = Array.from({length:micoProfile(c.type)!.count},(_,i)=>i+1)
        const anyBad = channels.some((i) => ch[String(i)]?.on && (ch[String(i)]?.tripped || ch[String(i)]?.fault))
        return (
          <g>
            <rect x={4} y={8} width={w - 8} height={h - 16} rx={5} fill={c.state.powered ? '#1c2a1c' : '#181c18'} stroke={anyBad ? '#ef4444' : s} />
            {channels.map((i) => {
              const cx = (i * w) / (channels.length+1), chst = ch[String(i)]
              const col = !c.state.powered ? '#334155' : chst?.fault ? '#f97316' : chst?.tripped ? '#ef4444' : chst?.on ? '#22c55e' : '#475569'
              return (
                <g key={i}>
                  <circle cx={cx} cy={h * 0.32} r={5} fill={col} stroke="#0f172a" strokeWidth={1.5} />
                  <text x={cx} y={h * 0.52} textAnchor="middle" fontSize={7} fill="#94a3b8">{chst?.setpointA ?? 1}A</text>
                  <text x={cx} y={h * 0.7} textAnchor="middle" fontSize={7} fill="#cbd5e1">{i}</text>
                </g>
              )
            })}
            {label(8, h - 4, c.ref, 9, '#93c5fd')}
          </g>
        )
      }
      case 'breaker1p':
      case 'breakerSchneiderIc60h1p':
      case 'breakerSteckSdC25':
      case 'breaker2p':
      case 'breaker3p':
      case 'breaker4p':
      case 'motorBreaker':
      case 'motorBreakerPkzmC10':
      case 'residualBreaker':
      case 'residualBreakerSchneiderIid4p':
      case 'residualBreakerSchneiderIdpnVigi': {
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
        const blown = !!c.state.blown
        const open = c.state.closed === false
        return (
          <g>
            <rect x={w / 2 - 10} y={10} width={20} height={h - 20} rx={3} fill={blown ? '#450a0a' : open ? '#422006' : '#1f2937'} stroke={blown ? '#ef4444' : open ? '#f59e0b' : s} strokeDasharray={open ? '4 2' : undefined} />
            {label(4, 10, c.ref, 10, '#93c5fd')}
            {c.state.inA ? label(4, h - 3, `${c.state.inA}A ${String(c.state.fuseClass ?? 'gG')}`, 7.5, '#64748b') : null}
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
      case 'pushButtonXb2No':
      case 'pushButtonXb2Nc':
      case 'pushButtonXb2Black':
      case 'pushButtonXb2Yellow':
      case 'pushButtonXb2Blue':
      case 'pushButtonXb2White':
      case 'emergencyButton':
      case 'emergencyButtonKeyP20ACR':
      case 'selector2':
      case 'selector3':
      case 'keySwitch':
      case 'limitSwitch':
      case 'footSwitch': {
        const pressed = c.state.pressed
        const isNC = c.type === 'buttonNC' || c.type === 'pushButtonXb2Nc' || c.type === 'emergencyButton' || c.type === 'emergencyButtonKeyP20ACR'
        const isEmg = c.type === 'emergencyButton' || c.type === 'emergencyButtonKeyP20ACR'
        const col = c.type === 'buttonNO' || c.type === 'pushButtonXb2No' ? '#22c55e'
          : c.type === 'pushButtonXb2Black' ? '#1f2937'
          : c.type === 'pushButtonXb2Yellow' ? '#eab308'
          : c.type === 'pushButtonXb2Blue' ? '#2563eb'
          : c.type === 'pushButtonXb2White' ? '#f8fafc'
          : isEmg ? '#dc2626' : isNC ? '#ef4444' : '#eab308'
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
            <rect x={8} y={14} width={w - 16} height={h - 28} rx={10} fill="#1d4ed8" stroke="#facc15" strokeWidth={3} />
            <text x={w / 2} y={h / 2 - 2} textAnchor="middle" fontSize={8.5} fontWeight={800} fill="#facc15">FELIX</text>
            <text x={w / 2} y={h / 2 + 10} textAnchor="middle" fontSize={7.5} fontWeight={700} fill="#e2e8f0">{trig ? 'ALTO (C-NA)' : 'BAIXO (C-NF)'}</text>
            {label(6, 11, c.ref, 10, '#93c5fd')}
          </g>
        )
      }
      case 'waterTank': {
        const lvl = Math.max(0, Math.min(100, Number(c.state.levelPct ?? 0)))
        const fillH = ((h - 36) * lvl) / 100
        return (
          <g>
            <rect x={16} y={16} width={w - 32} height={h - 32} rx={8} fill="#e0f2fe" fillOpacity={0.22} stroke="#64748b" strokeWidth={2} />
            <rect x={18} y={h - 18 - fillH} width={w - 36} height={Math.max(2, fillH)} rx={4} fill="#0ea5e9" fillOpacity={0.72} />
            <line x1={16} y1={16 + (h - 32) * 0.15} x2={w - 16} y2={16 + (h - 32) * 0.15} stroke="#dc2626" strokeWidth={1.2} strokeDasharray="4 3" />
            {label(18, 12, c.ref, 10, '#93c5fd')}
            <text x={w / 2} y={h - 4} textAnchor="middle" fontSize={8.5} fontWeight={700} fill="#38bdf8">{`${Math.round(lvl)}%`}</text>
          </g>
        )
      }
      case 'waterPump': {
        const run = !!c.state.running
        return (
          <g>
            <rect x={6} y={12} width={w - 12} height={h - 24} rx={8} fill="#0b748d" stroke={run ? '#38bdf8' : '#085b70'} strokeWidth={run ? 2.5 : 1.6} />
            <circle cx={w * 0.38} cy={h / 2} r={22} fill="#085b70" stroke="#e2e8f0" strokeWidth={1.6} />
            <polygon points={`${w * 0.38 - 10},${h / 2 + 8} ${w * 0.38 + 12},${h / 2} ${w * 0.38 - 10},${h / 2 - 8}`} fill={run ? '#38bdf8' : '#cbd5e1'} />
            <text x={w * 0.72} y={h / 2 - 2} textAnchor="middle" fontSize={8.5} fontWeight={800} fill="#f8fafc">CT 61</text>
            <text x={w * 0.72} y={h / 2 + 10} textAnchor="middle" fontSize={7.5} fontWeight={700} fill={run ? '#4ade80' : '#cbd5e1'}>{run ? 'ON' : 'OFF'}</text>
            {label(10, 11, c.ref, 10, '#93c5fd')}
          </g>
        )
      }
      case 'rollerConveyor': {
        const run = Boolean(c.state.running)
        const mot = c.state.motorized !== false
        const len = Number(c.state.lengthMm ?? 1600)
        return (
          <g>
            <rect x={6} y={14} width={w - 12} height={h - 32} rx={5} fill="#cbd5e1" stroke={run ? '#16a34a' : '#475569'} strokeWidth={run ? 2.4 : 1.6} />
            {Array.from({ length: 9 }).map((_, idx) => {
              const rx = 18 + (idx * (w - 36)) / 8
              return <line key={idx} x1={rx} y1={18} x2={rx} y2={h - 22} stroke="#475569" strokeWidth={3} strokeLinecap="round" />
            })}
            {mot && (
              <g>
                <rect x={w * 0.56} y={h - 22} width={w * 0.34} height={18} rx={3} fill="#64748b" stroke={run ? '#22c55e' : '#1e293b'} strokeWidth={1.3} />
                <text x={w * 0.73} y={h - 10} textAnchor="middle" fontSize={8} fontWeight={800} fill="#f8fafc">M3~</text>
              </g>
            )}
            <text x={w * 0.34} y={h - 6} textAnchor="middle" fontSize={8} fontWeight={700} fill="#334155">{`${len}mm${mot ? '' : ' livre'}`}</text>
            {label(10, 11, c.ref, 10, '#1e40af')}
          </g>
        )
      }
      case 'opticalReflector': {
        return (
          <g>
            <rect x={8} y={8} width={w - 16} height={h - 16} rx={5} fill="#334155" stroke="#0f172a" strokeWidth={1.5} />
            <rect x={14} y={14} width={w - 28} height={h - 28} rx={2} fill="#e2e8f0" stroke="#64748b" strokeWidth={1} />
            <polygon points={`${w / 2},18 ${w - 18},${h / 2} ${w / 2},${h - 18} 18,${h / 2}`} fill="#cbd5e1" stroke="#475569" strokeWidth={1.1} />
            <line x1={18} y1={h / 2} x2={w - 18} y2={h / 2} stroke="#ef4444" strokeWidth={1} strokeDasharray="3 2" />
            {label(8, 10, c.ref, 9, '#93c5fd')}
          </g>
        )
      }
      case 'hydraulicValve': {
        const open = c.state.open !== false
        return (
          <g>
            <polygon points={`14,${h * 0.35} ${w / 2},${h * 0.62} 14,${h * 0.88}`} fill="#d4a029" stroke="#78350f" strokeWidth={1.4} />
            <polygon points={`${w - 14},${h * 0.35} ${w / 2},${h * 0.62} ${w - 14},${h * 0.88}`} fill="#d4a029" stroke="#78350f" strokeWidth={1.4} />
            <line x1={w / 2} y1={h * 0.62} x2={w / 2} y2={16} stroke="#334155" strokeWidth={2} />
            <line x1={open ? w / 2 - 18 : w / 2 - 6} y1={16} x2={open ? w / 2 + 18 : w / 2 + 6} y2={16} stroke="#dc2626" strokeWidth={4} strokeLinecap="round" />
            {label(8, 12, c.ref, 9, '#0369a1')}
          </g>
        )
      }
      case 'hydraulicTee':
      case 'pneumaticTee': {
        const isP = c.type === 'pneumaticTee'
        return (
          <g>
            <line x1={8} y1={h * 0.6} x2={w - 8} y2={h * 0.6} stroke={isP ? '#0284c7' : '#ca8a04'} strokeWidth={6} strokeLinecap="round" />
            <line x1={w / 2} y1={h * 0.6} x2={w / 2} y2={10} stroke={isP ? '#0284c7' : '#ca8a04'} strokeWidth={6} strokeLinecap="round" />
            <circle cx={w / 2} cy={h * 0.6} r={5} fill="#0f172a" />
            {label(6, 12, c.ref, 9, isP ? '#0284c7' : '#b45309')}
          </g>
        )
      }
      case 'pneumaticFrl': {
        const bar = c.state.airSupplyOn === false ? 0 : Number(c.state.pressureBar ?? 6)
        return (
          <g>
            <rect x={16} y={14} width={w - 32} height={h - 28} rx={6} fill="#334155" stroke="#0284c7" strokeWidth={1.8} />
            <circle cx={w / 2} cy={h * 0.42} r={18} fill="#f8fafc" stroke="#0f172a" strokeWidth={1.5} />
            <text x={w / 2} y={h * 0.45} textAnchor="middle" fontSize={8.5} fontWeight={800} fill="#0f172a">{`${bar}b`}</text>
            <text x={w / 2} y={h - 22} textAnchor="middle" fontSize={8} fontWeight={700} fill="#7dd3fc">FRL</text>
            {label(8, 11, c.ref, 9, '#0284c7')}
          </g>
        )
      }
      case 'pneumaticValve52': {
        const active = Boolean(c.state.energized || c.state.manualOverride)
        return (
          <g>
            <rect x={8} y={16} width={w - 16} height={h - 32} rx={4} fill="#1e293b" stroke={active ? '#f59e0b' : '#38bdf8'} strokeWidth={1.8} />
            <rect x={12} y={24} width={28} height={h - 48} rx={2} fill={active ? '#f59e0b' : '#475569'} />
            <text x={w * 0.62} y={h / 2 + 3} textAnchor="middle" fontSize={10} fontWeight={800} fill="#f8fafc">5/2</text>
            {label(8, 12, c.ref, 9, '#0284c7')}
          </g>
        )
      }
      case 'pneumaticCylinder': {
        const pct = Number(c.state.positionPct ?? 0)
        return (
          <g>
            <rect x={10} y={22} width={w * 0.58} height={h - 44} rx={4} fill="#cbd5e1" stroke="#334155" strokeWidth={1.8} />
            <line x1={10 + w * 0.58} y1={h / 2} x2={10 + w * 0.58 + 18 + (pct / 100) * (w * 0.28)} y2={h / 2} stroke="#475569" strokeWidth={5} strokeLinecap="round" />
            <text x={10 + w * 0.29} y={h / 2 + 3} textAnchor="middle" fontSize={8.5} fontWeight={800} fill="#0f172a">{`${pct}%`}</text>
            {label(8, 14, c.ref, 9, '#0284c7')}
          </g>
        )
      }
      case 'electricCylinderEpcs': {
        const pct = Number(c.state.positionPct ?? 0)
        return (
          <g>
            <rect x={8} y={20} width={w * 0.24} height={h - 40} rx={3} fill="#1e293b" stroke="#0091dc" strokeWidth={1.6} />
            <rect x={8 + w * 0.24} y={24} width={w * 0.42} height={h - 48} rx={3} fill="#dbe4ee" stroke="#334155" strokeWidth={1.6} />
            <line x1={8 + w * 0.66} y1={h / 2} x2={8 + w * 0.66 + 16 + (pct / 100) * (w * 0.22)} y2={h / 2} stroke="#475569" strokeWidth={5} strokeLinecap="round" />
            <text x={8 + w * 0.45} y={h / 2 + 3} textAnchor="middle" fontSize={8} fontWeight={800} fill="#0077c8">{`EPCS ${pct}%`}</text>
            {label(8, 13, c.ref, 9, '#0091dc')}
          </g>
        )
      }
      case 'pneumaticGuidedCylinder': {
        const pct = Number(c.state.positionPct ?? 0)
        const ext = 14 + (pct / 100) * (w * 0.26)
        const bx = 10 + w * 0.48
        return (
          <g>
            <rect x={10} y={18} width={w * 0.48} height={h - 36} rx={4} fill="#dbe4ee" stroke="#334155" strokeWidth={1.8} />
            <line x1={bx} y1={28} x2={bx + ext} y2={28} stroke="#64748b" strokeWidth={4} />
            <line x1={bx} y1={h / 2} x2={bx + ext} y2={h / 2} stroke="#475569" strokeWidth={3.5} />
            <line x1={bx} y1={h - 28} x2={bx + ext} y2={h - 28} stroke="#64748b" strokeWidth={4} />
            <rect x={bx + ext} y={16} width={10} height={h - 32} rx={2} fill="#cbd5e1" stroke="#334155" strokeWidth={1.5} />
            <text x={10 + w * 0.24} y={h / 2 + 3} textAnchor="middle" fontSize={8} fontWeight={800} fill="#0f172a">{`DFM ${pct}%`}</text>
            {label(8, 13, c.ref, 9, '#0284c7')}
          </g>
        )
      }
      case 'pneumaticManifold': {
        return (
          <g>
            <rect x={8} y={20} width={w - 16} height={h - 40} rx={4} fill="#334155" stroke="#0091dc" strokeWidth={1.6} />
            {[1, 2, 3, 4].map((st) => {
              const sx = 24 + (st - 1) * ((w - 48) / 4)
              const on = Boolean(c.state[`station${st}On`] || c.state[`station${st}Manual`])
              return (
                <g key={st}>
                  <rect x={sx} y={26} width={(w - 60) / 4} height={h - 52} rx={2} fill={on ? '#0091dc' : '#475569'} stroke="#cbd5e1" strokeWidth={1} />
                  <text x={sx + (w - 60) / 8} y={h / 2 + 3} textAnchor="middle" fontSize={8} fontWeight={800} fill="#ffffff">{`Y${st}`}</text>
                </g>
              )
            })}
            {label(8, 13, `${c.ref} VTUG`, 9, '#0091dc')}
          </g>
        )
      }
      case 'pneumaticVacuumCup': {
        const vac = Boolean(c.state.vacuumActive || c.state.manualVacuum)
        return (
          <g>
            <path d={`M ${w * 0.2} 34 L ${w * 0.8} 34 L ${w * 0.65} 52 L ${w * 0.35} 52 Z`} fill={vac ? '#0ea5e9' : '#1554c6'} stroke="#1e3a8a" strokeWidth={1.6} />
            <rect x={w * 0.28} y={52} width={w * 0.44} height={h - 66} rx={4} fill="#dbe4ee" stroke="#334155" strokeWidth={1.6} />
            <text x={w / 2} y={h * 0.72} textAnchor="middle" fontSize={8} fontWeight={800} fill="#0f172a">{vac ? 'VÁCUO' : 'VFG30'}</text>
            {label(8, 14, c.ref, 9, '#1554c6')}
          </g>
        )
      }
      case 'industrialWall':
      case 'industrialPillar':
      case 'cableTrayStraight':
      case 'cableTrayElbow90':
      case 'cableTrayCross':
      case 'cableTrayVerticalBend':
      case 'cableTrayRiser90':
      case 'wireTrayStraight':
      case 'wireTrayElbow90':
      case 'wireTrayTee':
      case 'wireTrayRiser90': {
        const isWall = c.type === 'industrialWall'
        const isPillar = c.type === 'industrialPillar'
        const isWire = c.type.startsWith('wireTray')
        return (
          <g>
            <rect
              x={6}
              y={8}
              width={w - 12}
              height={h - 16}
              rx={isPillar ? 2 : 4}
              fill={isWall ? '#d6d3cb' : isPillar ? '#475569' : isWire ? '#eef2f6' : '#cbd5e1'}
              stroke="#334155"
              strokeWidth={1.6}
              strokeDasharray={isWall || isPillar ? undefined : isWire ? '3 2' : '5 3'}
            />
            {isWire && (
              <>
                <line x1={12} y1={h * 0.35} x2={w - 12} y2={h * 0.35} stroke="#94a3b8" strokeWidth={1} />
                <line x1={12} y1={h * 0.65} x2={w - 12} y2={h * 0.65} stroke="#94a3b8" strokeWidth={1} />
              </>
            )}
            <text x={w / 2} y={h / 2 + 3} textAnchor="middle" fontSize={8.5} fontWeight={700} fill={isPillar ? '#f8fafc' : '#1e293b'}>
              {c.ref}
            </text>
          </g>
        )
      }
      case 'hydraulicFlowMeter': {
        const singleL = Number(c.state.singleVolumeL ?? 0).toFixed(2)
        const dn = String(c.state.pipeDN ?? 'DN32')
        return (
          <g>
            <rect x={8} y={h * 0.44} width={w - 16} height={18} rx={4} fill="#525861" stroke="#1e293b" strokeWidth={1.5} />
            <rect x={w * 0.20} y={8} width={w * 0.60} height={38} rx={5} fill="#1d55a6" stroke="#1e293b" strokeWidth={1.5} />
            <rect x={w * 0.36} y={16} width={w * 0.38} height={20} rx={2} fill="#c6cfb9" stroke="#e2e8f0" strokeWidth={1} />
            <text x={w * 0.55} y={29} textAnchor="middle" fontSize={8.5} fontWeight={800} fill="#0f172a">{singleL}L</text>
            <text x={w / 2} y={h - 8} textAnchor="middle" fontSize={7.5} fontWeight={700} fill="#334155">{c.ref} · {dn}</text>
          </g>
        )
      }
      case 'waterSupplyBox': {
        const open = c.state.valveOpen !== false && c.state.mainsSupplyOn !== false
        const flow = Number(c.state.flowRateLpm ?? 0).toFixed(1)
        return (
          <g>
            <rect x={6} y={6} width={w - 12} height={h - 12} rx={8} fill="#f1f5f9" stroke="#334155" strokeWidth={1.8} />
            <rect x={14} y={14} width={w - 28} height={22} rx={4} fill="#e2e8f0" stroke="#94a3b8" strokeWidth={1} />
            <text x={w / 2} y={28} textAnchor="middle" fontSize={9.5} fontWeight={800} fill="#0284c7">ÁGUA · {c.ref}</text>
            <rect x={16} y={44} width={w - 32} height={28} rx={4} fill="#1d55a6" stroke="#0f172a" strokeWidth={1.2} />
            <text x={w / 2} y={61} textAnchor="middle" fontSize={8.5} fontWeight={800} fill="#f8fafc">
              {open ? `ABERTO · ${flow} L/m` : 'FECHADO'}
            </text>
            <text x={w / 2} y={h - 16} textAnchor="middle" fontSize={7.5} fontWeight={700} fill="#475569">
              ARCO + ZJLCD-BT01 + WAGO 221
            </text>
          </g>
        )
      }
      case 'triProofLedBatten': {
        const on = Boolean(c.state.on || c.state.testOn)
        const watts = Number(c.state.wattage ?? 40)
        const cct = Number(c.state.cctK ?? 4000)
        return (
          <g>
            <rect x={10} y={16} width={w - 20} height={h - 32} rx={10} fill={on ? '#fef9c3' : '#e2e8f0'} stroke={on ? '#f59e0b' : '#475569'} strokeWidth={1.8} />
            <rect x={10} y={16} width={16} height={h - 32} rx={4} fill="#94a3b8" />
            <rect x={w - 26} y={16} width={16} height={h - 32} rx={4} fill="#94a3b8" />
            <text x={w / 2} y={h / 2 + 3} textAnchor="middle" fontSize={8.5} fontWeight={800} fill="#0f172a">
              {`${c.ref} · ${watts}W · ${cct}K`}
            </text>
          </g>
        )
      }
      case 'conduitVdsStraight':
      case 'conduitVdsElbow90':
      case 'conduitCorrugated':
      case 'pipeClampPvc':
      case 'pipeClampMetalEpdm':
      case 'pipeClampMetalScrew': {
        const dMm = Number(c.state.diameterMm ?? 25)
        const isCorr = c.type === 'conduitCorrugated'
        const isClamp = c.type.startsWith('pipeClamp')
        const fill = isCorr ? '#1f2937' : c.type === 'pipeClampMetalEpdm' || c.type === 'pipeClampMetalScrew' ? '#cbd5e1' : '#9aa3ad'
        const txt = isCorr ? '#f8fafc' : '#0f172a'
        const short =
          c.type === 'conduitVdsStraight' ? `VDS Ø${dMm}` :
          c.type === 'conduitVdsElbow90' ? `CURVA 90° Ø${dMm}` :
          c.type === 'conduitCorrugated' ? `CORRUG. Ø${dMm}` :
          c.type === 'pipeClampPvc' ? `CLIP PVC Ø${dMm}` :
          c.type === 'pipeClampMetalEpdm' ? `EPDM Ø${dMm}` : `MET. Ø${dMm}`
        return (
          <g>
            {isClamp ? (
              <circle cx={w / 2} cy={h / 2} r={Math.min(w, h) * 0.36} fill={fill} stroke="#334155" strokeWidth={1.8} />
            ) : (
              <rect x={8} y={h * 0.28} width={w - 16} height={h * 0.44} rx={6} fill={fill} stroke="#334155" strokeWidth={1.6} />
            )}
            <text x={w / 2} y={h / 2 + 3} textAnchor="middle" fontSize={7.8} fontWeight={800} fill={txt}>{short}</text>
          </g>
        )
      }
      case 'junctionBoxOboT60':
      case 'junctionBoxOboA6':
      case 'junctionBoxOboT25': {
        const isRound = c.type === 'junctionBoxOboT25'
        const code = c.type === 'junctionBoxOboT60' ? 'OBO T60' : c.type === 'junctionBoxOboA6' ? 'OBO A6' : 'OBO T25'
        return (
          <g>
            {isRound ? (
              <circle cx={w / 2} cy={h / 2} r={Math.min(w, h) * 0.42} fill="#d8dce0" stroke="#475569" strokeWidth={1.8} />
            ) : (
              <rect x={6} y={6} width={w - 12} height={h - 12} rx={8} fill="#d8dce0" stroke="#475569" strokeWidth={1.8} />
            )}
            <text x={w / 2} y={h / 2 - 4} textAnchor="middle" fontSize={9.5} fontWeight={800} fill="#1e293b">{code}</text>
            <text x={w / 2} y={h / 2 + 10} textAnchor="middle" fontSize={8} fontWeight={700} fill="#475569">{c.ref}</text>
          </g>
        )
      }
      case 'wago221_2':
      case 'wago221_5':
      case 'wago221_inline':
      case 'wago221_double': {
        const sub = c.type === 'wago221_2' ? '221-412' : c.type === 'wago221_5' ? '221-415' : c.type === 'wago221_inline' ? '221-2411' : '221 2×5'
        return (
          <g>
            <rect x={6} y={10} width={w - 12} height={h - 20} rx={5} fill="rgba(226,232,240,0.85)" stroke="#64748b" strokeWidth={1.5} />
            <rect x={10} y={13} width={w - 20} height={8} rx={2} fill="#f25610" />
            <line x1={14} y1={h / 2 + 4} x2={w - 14} y2={h / 2 + 4} stroke="#b45309" strokeWidth={2.4} />
            <text x={w / 2} y={h / 2 + 1} textAnchor="middle" fontSize={8} fontWeight={800} fill="#0f172a">WAGO {sub}</text>
            {label(8, 9, c.ref, 8.5, '#ea580c')}
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
      case 'safetyRelay': {
        const green = '#39c869', body = '#9a252b'
        return <g>
          <rect x={3} y={12} width={w-6} height={h-24} rx={3} fill={body} stroke={s}/>
          <text x={w/2} y={43} textAnchor="middle" fontSize={11} fill="#fff">{c.ref} · MSR127TP</text>
          <text x={w/2} y={58} textAnchor="middle" fontSize={8} fill="#f4dadd">24 V AC/DC · 3 NO + 1 NC</text>
          {(['PWR','CH1','CH2'] as const).map((name,i)=><g key={name}>
            <circle cx={w*.23+i*w*.27} cy={78} r={3.5} fill={(i===0?c.state.powered:c.state.energized)?green:'#4b4b3e'}/>
            <text x={w*.23+i*w*.27} y={92} textAnchor="middle" fontSize={8} fill="#fff">{name}</text>
          </g>)}
          <text x={w/2} y={108} textAnchor="middle" fontSize={8} fill="#fff">START S12–S34 · TP</text>
          {c.terminals.map(t=>{
            const x=t.x*w,top=t.y<.5
            return <text key={t.id} x={x} y={top?23:h-17} textAnchor="middle" fontSize={7} fill="#fff">{t.label}</text>
          })}
        </g>
      }
      case 'auxRelay':
      case 'auxRelay4':
      case 'timerRelayTON':
      case 'timerRelayTOF':
      case 'timerRelayStarDelta':
      case 'counterRelay': {
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

      // ------------------------------------------------------------ iluminação
      case 'lampIncandescentE27':
      case 'lampFluorescentE27':
      case 'lampLedE27': {
        const lit = !!c.state.on
        const col = c.type === 'lampIncandescentE27' ? '#f59e0b' : c.type === 'lampFluorescentE27' ? '#bae6fd' : '#fef08a'
        const badge = c.type === 'lampIncandescentE27' ? 'INC' : c.type === 'lampFluorescentE27' ? 'CFL' : 'LED'
        const r = Math.min(w, h) * 0.3
        return (
          <g>
            <rect x={2} y={2} width={w - 4} height={h - 4} rx={5} fill="#0f172a" stroke={lit ? col : '#475569'} strokeWidth={1.5} />
            {lit && <circle cx={w / 2} cy={h * 0.44} r={r + 5} fill={col} opacity={0.28} />}
            <circle cx={w / 2} cy={h * 0.44} r={r} fill={lit ? col : '#1e293b'} stroke={lit ? col : '#94a3b8'} strokeWidth={1.8} />
            <line x1={w / 2 - r * 0.68} y1={h * 0.44 - r * 0.68} x2={w / 2 + r * 0.68} y2={h * 0.44 + r * 0.68} stroke={lit ? '#451a03' : '#94a3b8'} strokeWidth={1.5} />
            <line x1={w / 2 + r * 0.68} y1={h * 0.44 - r * 0.68} x2={w / 2 - r * 0.68} y2={h * 0.44 + r * 0.68} stroke={lit ? '#451a03' : '#94a3b8'} strokeWidth={1.5} />
            <text x={w / 2} y={h * 0.82} textAnchor="middle" fontSize={8} fill="#e2e8f0" fontWeight="bold">{`${badge} ${c.state.powerW ?? ''}W`}</text>
            {label(4, 11, c.ref, 9, '#93c5fd')}
          </g>
        )
      }
      case 'wallSwitchSimple':
      case 'wallSwitchDouble':
      case 'wallSwitchStaircase': {
        const active = c.type === 'wallSwitchDouble' ? (!!c.state.on1 || !!c.state.on2) : !!c.state.on
        const tag = c.type === 'wallSwitchDouble' ? '2×10AX' : c.type === 'wallSwitchStaircase' ? '⇄ 10AX' : 'I/O 10AX'
        return (
          <g>
            <rect x={2} y={2} width={w - 4} height={h - 4} rx={6} fill="#f8fafc" stroke={active ? '#0284c7' : '#64748b'} strokeWidth={1.8} />
            <rect x={10} y={12} width={w - 20} height={h - 28} rx={3} fill={active ? '#e0f2fe' : '#e2e8f0'} stroke="#94a3b8" strokeWidth={1.2} />
            {c.type === 'wallSwitchDouble' && <line x1={w / 2} y1={12} x2={w / 2} y2={h - 16} stroke="#94a3b8" strokeWidth={1.2} />}
            <text x={w / 2} y={h / 2} textAnchor="middle" fontSize={9} fill="#0f172a" fontWeight="bold">{tag}</text>
            <text x={w / 2} y={h - 6} textAnchor="middle" fontSize={7} fill="#475569">Odace</text>
            {label(4, 10, c.ref, 9, '#1d4ed8')}
          </g>
        )
      }

      // ------------------------------------------------------------ sinalização
      case 'ledGreen':
      case 'ledRed':
      case 'ledYellow':
      case 'ledWhite':
      case 'pilotLightAd22':
      case 'pilotLightSchneiderIil1p':
      case 'buzzer': {
        const col = c.state.color && (c.type.startsWith('led') || c.type.startsWith('pilotLight')) ? c.state.color : '#f59e0b'
        const glass = typeof c.state.glassColor === 'string' ? c.state.glassColor : col
        const lit = !!c.state.on
        return (
          <g>
            <circle cx={w / 2} cy={h / 2} r={Math.min(w, h) / 2 - 6} fill={lit ? col : '#1f2937'} stroke={lit ? col : (c.type === 'buzzer' ? '#4b5563' : glass)} strokeWidth={2} />
            {lit && <circle cx={w / 2} cy={h / 2} r={Math.min(w, h) / 2 - 1} fill="none" stroke={col} opacity={0.35} strokeWidth={4} />}
            {c.type === 'buzzer' && <g transform={`translate(${w / 2 - 6},${h / 2 - 6})`} color={lit ? '#111827' : '#94a3b8'}><IconSound size={12} /></g>}
            {label(4, 10, c.ref, 9, '#93c5fd')}
          </g>
        )
      }
      case 'pilotLightSchneiderIil3p': {
        const l1Lit = !!c.state.l1On
        const l2Lit = !!c.state.l2On
        const l3Lit = !!c.state.l3On
        const col = c.state.color || '#ef4444'
        const glass = typeof c.state.glassColor === 'string' ? c.state.glassColor : col
        return (
          <g>
            <rect x={4} y={12} width={w - 8} height={h - 24} rx={4} fill="#1e293b" stroke={s} />
            {[
              { x: w * 0.22, lit: l1Lit, lbl: 'L1' },
              { x: w * 0.5, lit: l2Lit, lbl: 'L2' },
              { x: w * 0.78, lit: l3Lit, lbl: 'L3' },
            ].map((p, idx) => (
              <g key={idx}>
                <circle cx={p.x} cy={h / 2} r={10} fill={p.lit ? col : '#334155'} stroke={p.lit ? col : glass} strokeWidth={1.5} />
                {p.lit && <circle cx={p.x} cy={h / 2} r={13} fill="none" stroke={col} opacity={0.4} strokeWidth={2} />}
                <text x={p.x} y={h / 2 + 3} fontSize={8} fill={p.lit ? '#ffffff' : '#94a3b8'} textAnchor="middle" fontWeight="bold">{p.lbl}</text>
              </g>
            ))}
            {label(6, 10, c.ref, 9, '#93c5fd')}
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
        const mono = c.type === 'motor1ph'
        // Monofásico: azul DC-Simu; trifásico: corpo escuro (vermelho de fase no esquema de potência).
        const body = run ? (mono ? '#1d4ed8' : '#1e3a8a') : (mono ? '#2563eb' : '#1f2937')
        const rim = run ? '#60a5fa' : (mono ? '#93c5fd' : s)
        return (
          <g>
            <circle cx={w / 2} cy={h / 2} r={Math.min(w, h) / 2 - 6} fill={body} stroke={rim} strokeWidth={2} />
            <text x={w / 2 - 8} y={h / 2 + 6} fontSize={18} fill="#e5e7eb" fontWeight="bold">M</text>
            <g transform={`translate(${w / 2 + 12},${h / 2 - 6})`} color={run ? '#4ade80' : '#64748b'}>
              {run ? (dir === 'cw' ? <IconRotateRight size={12} /> : <IconRotateLeft size={12} />) : <IconStop size={12} />}
            </g>
            {label(4, 12, c.ref, 10, mono ? '#bfdbfe' : '#93c5fd')}
            {label(4, h - 4, mono ? '1~' : `${c.state.cv ?? 1} cv`, 8, mono ? '#93c5fd' : '#64748b')}
          </g>
        )
      }

      // Condensador de arranque/funcionamento (IEC 60617-4 / 04-02-01)
      case 'capacitorRun60uF': {
        const failed = !!c.state.failed
        const uf = c.state.capacitanceUf ?? 60
        const cx = w / 2
        const cy = h / 2
        return (
          <g>
            {/* corpo cilíndrico simplificado */}
            <rect x={cx - 18} y={12} width={36} height={h - 28} rx={4} fill={failed ? '#3f1f1f' : '#1e293b'} stroke={failed ? '#ef4444' : s} strokeWidth={1.5} />
            {/* símbolo IEC: duas placas paralelas */}
            <line x1={cx - 10} y1={cy - 10} x2={cx - 10} y2={cy + 10} stroke="#e2e8f0" strokeWidth={3} strokeLinecap="round" />
            <line x1={cx + 10} y1={cy - 10} x2={cx + 10} y2={cy + 10} stroke="#e2e8f0" strokeWidth={3} strokeLinecap="round" />
            {/* ligações aos bornes (topo) */}
            <line x1={cx - 10} y1={cy - 10} x2={cx - 10} y2={18} stroke="#94a3b8" strokeWidth={1.5} />
            <line x1={cx + 10} y1={cy - 10} x2={cx + 10} y2={18} stroke="#94a3b8" strokeWidth={1.5} />
            {label(4, 12, c.ref, 9, '#93c5fd')}
            {label(4, h - 6, `${uf} µF`, 9, failed ? '#f87171' : '#64748b')}
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
      case 'plcLsXbmDn32s': {
        // Corpo slim (30 mm): LED de estado e bornes nos sítios reais do componente.
        return (
          <g>
            <rect x={2} y={4} width={w - 4} height={h - 8} rx={3} fill="#3f4650" stroke={s} strokeWidth={1.5} />
            <rect x={6} y={10} width={w - 12} height={16} rx={2} fill="#0b1220" />
            <circle cx={w / 2 - 6} cy={18} r={2.4} fill={c.state.powered ? '#22c55e' : '#334155'} />
            <circle cx={w / 2 + 6} cy={18} r={2.4} fill="#334155" />
            {c.terminals.filter((t) => /^[IQ]/.test(t.label)).map((t) => (
              <rect key={t.id} x={t.x * w - (t.x < 0.5 ? 0 : 7)} y={t.y * h - 3} width={7} height={6} rx={1} fill={t.energized ? (t.label.startsWith('I') ? '#22c55e' : '#f59e0b') : '#1f2937'} />
            ))}
            {label(4, h / 2 + 3, c.ref, 8, '#cbd5e1')}
          </g>
        )
      }
      case 'plcLogo':
      case 'plcCompact': {
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
          useSimStore.getState().operateComponent(c.id, { pressedButton: name })
        }
        const releaseBtn = (e: React.MouseEvent) => {
          e.stopPropagation()
          if (c.state.pressedButton) useSimStore.getState().operateComponent(c.id, { pressedButton: null })
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
      case 'busbarPhaseAcrylic':
      case 'busbarPhaseStepped':
      case 'busbarComb':
      case 'combBusbarConnector':
      case 'busbarNeutral':
      case 'earthBar':
      case 'terminalSet1ph':
      case 'terminalSet3ph':
      case 'terminalSet24v': {
        return (
          <g>
            <rect x={2} y={h / 2 - 17} width={w - 4} height={34} rx={4} fill="#334155" stroke={s} />
            <rect x={5} y={h / 2 - 3} width={w - 10} height={6} rx={2} fill="#64748b" />
            {c.terminals.map((t, i) => {
              const x = (t.x * (w - 12)) + 6
              const conductorLabel = t.label.replace(/-(IN|OUT)$/, '')
              const isEarth = conductorLabel === 'PE' || t.kind === 'earth'
              return (
                <g key={t.id}>
                  {isEarth && <rect x={x - 5} y={h / 2 - 15} width={10} height={30} fill="#facc15" opacity={0.88} rx={2} />}
                  <TerminalGlyph x={x} y={h / 2} type={t.terminalType} color={t.color} energized={t.energized} r={terminalGlyphRadius(t, 6)} />
                  <text x={x} y={t.y < 0.5 ? h / 2 - 20 : h / 2 + 25} textAnchor="middle" fontSize={7} fill="#e2e8f0">{conductorLabel}</text>
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
      case 'powerSource24v': {
        const on = c.state.on !== false
        return <g>
          <rect x={4} y={8} width={w - 8} height={h - 16} rx={7} fill="#e2e8f0" stroke={on ? '#dc2626' : s} strokeWidth={2} />
          <rect x={10} y={h * 0.36} width={w - 20} height={h * 0.37} rx={4} fill="#f8fafc" stroke="#94a3b8" />
          <text x={w / 2} y={h * 0.52} textAnchor="middle" fontSize={12} fill="#0f172a" fontWeight="bold">{`${c.state.nominalV ?? 24} V`}</text>
          <text x={w / 2} y={h * 0.64} textAnchor="middle" fontSize={8} fill="#475569">DC</text>
          <circle cx={w - 14} cy={17} r={4} fill={on ? '#16a34a' : '#94a3b8'} />
          {label(7, 15, c.ref, 9, '#334155')}
        </g>
      }
      case 'powerSource1ph':
      case 'powerSource3ph': {
        const on = c.state.on !== false
        const threePhase = c.type === 'powerSource3ph'
        return <g>
          <rect x={4} y={8} width={w - 8} height={h - 16} rx={7} fill="#e2e8f0" stroke={on ? '#2563eb' : s} strokeWidth={2} />
          <rect x={10} y={h * 0.36} width={w - 20} height={h * 0.37} rx={4} fill="#f8fafc" stroke="#94a3b8" />
          <text x={w / 2} y={h * 0.52} textAnchor="middle" fontSize={12} fill="#0f172a" fontWeight="bold">{`${threePhase ? '3~' : '1~'} ${c.state.nominalV ?? (threePhase ? 400 : 230)} V`}</text>
          <text x={w / 2} y={h * 0.64} textAnchor="middle" fontSize={8} fill="#475569">{c.state.frequencyHz ?? 50} Hz AC</text>
          <circle cx={w - 14} cy={17} r={4} fill={on ? '#16a34a' : '#94a3b8'} />
          {label(7, 15, c.ref, 9, '#334155')}
        </g>
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
      case 'currentTransformerSplitCore': {
        return <g>
          <rect x={4} y={4} width={w-8} height={h-8} rx={5} fill="#242b29" stroke="#59625e" />
          <circle cx={w/2} cy={h*.37} r={w*.23} fill="none" stroke="#c3cbc4" strokeWidth={3}/>
          <path d={`M ${w/2} 2 V ${h*.66}`} stroke="#9b623a" strokeWidth={2}/>
          <text x={w/2} y={h*.78} textAnchor="middle" fontSize={7} fill="#d8e4dc">TC Ø16</text>
          <text x={w/2} y={h*.92} textAnchor="middle" fontSize={6} fill="#aabdb2">S1 · S2</text>
          {label(3,10,c.ref,7,'#93c5fd')}
        </g>
      }
      case 'meterD522066': {
        const on = c.state.on !== false
        return (
          <g>
            <rect x={4} y={6} width={w - 8} height={h - 12} rx={6} fill="#0f172a" stroke="#334155" strokeWidth={2} />
            <rect x={10} y={12} width={w - 20} height={h * 0.58} rx={4} fill="#020617" stroke="#1e293b" />
            <text x={16} y={26} fontSize={8} fontWeight={700} fill="#64748b">D52-2066</text>
            <circle cx={w - 18} cy={22} r={4} fill="#2563eb" />
            <text x={w - 16} y={44} fontSize={13} fontWeight={900} fill={on ? '#fde047' : '#334155'} textAnchor="end">{`${c.state.power ?? 256.3} W`}</text>
            <text x={w - 16} y={62} fontSize={12} fontWeight={900} fill={on ? '#fb923c' : '#334155'} textAnchor="end">{`${c.state.energy ?? 0.22} kWh`}</text>
            <text x={16} y={80} fontSize={11} fontWeight={900} fill={on ? '#38bdf8' : '#334155'}>{`${c.state.voltage ?? 223.8} V`}</text>
            <text x={w - 16} y={80} fontSize={10} fontWeight={900} fill={on ? '#f8fafc' : '#334155'} textAnchor="end">{`${c.state.frequency ?? 50} Hz`}</text>
            <text x={16} y={98} fontSize={11} fontWeight={900} fill={on ? '#f87171' : '#334155'}>{`${c.state.current ?? 1.14} A`}</text>
            <text x={w - 16} y={98} fontSize={10} fontWeight={900} fill={on ? '#60a5fa' : '#334155'} textAnchor="end">{`${c.state.powerFactor ?? 1.0} PF`}</text>
            <rect x={10} y={h * 0.68} width={w - 20} height={h * 0.26} rx={3} fill="#1e293b" />
            <circle cx={w * 0.8} cy={h * 0.81} r={11} fill="#020617" stroke="#475569" strokeWidth={1.5} />
            <text x={w * 0.8} y={h * 0.83} fontSize={8} fill="#94a3b8" textAnchor="middle">TC</text>
            <text x={18} y={h * 0.78} fontSize={8} fill="#94a3b8">1: L</text>
            <text x={18} y={h * 0.89} fontSize={8} fill="#94a3b8">2: N</text>
            {label(8, h - 8, c.ref, 10, '#93c5fd')}
          </g>
        )
      }
      case 'meterKws306': {
        const sw = c.state.switchOn !== false
        return (
          <g>
            <rect x={4} y={6} width={w - 8} height={h - 12} rx={6} fill="#0f172a" stroke="#334155" strokeWidth={2} />
            <rect x={10} y={12} width={w - 20} height={h * 0.72} rx={4} fill="#020617" stroke="#1e293b" />
            <text x={16} y={26} fontSize={8} fontWeight={700} fill="#94a3b8">KWS-306 3P+N</text>
            <rect x={w - 42} y={16} width={28} height={12} rx={2} fill={sw ? '#15803d' : '#b91c1c'} />
            <text x={w - 28} y={25} fontSize={7} fontWeight={800} fill="#ffffff" textAnchor="middle">{sw ? 'ON' : 'OFF'}</text>
            <text x={16} y={44} fontSize={9} fill="#38bdf8">{`A: ${c.state.vA ?? 211}V · ${c.state.iA ?? 7.89}A · ${c.state.pA ?? 1.66}kW`}</text>
            <text x={16} y={62} fontSize={9} fill="#38bdf8">{`B: ${c.state.vB ?? 210}V · ${c.state.iB ?? 0}A · ${c.state.pB ?? 0}kW`}</text>
            <text x={16} y={80} fontSize={9} fill="#38bdf8">{`C: ${c.state.vC ?? 210}V · ${c.state.iC ?? 0}A · ${c.state.pC ?? 0}kW`}</text>
            <text x={16} y={102} fontSize={10} fontWeight={800} fill="#22d3ee">{`Σ ${c.state.energy ?? 1.40} kWh · 50Hz · 15°C`}</text>
            <text x={w / 2} y={h - 14} fontSize={8} fill="#64748b" textAnchor="middle">↓ ENTRADA (topo) / CARGA (base) ↓</text>
            {label(8, h - 6, c.ref, 10, '#93c5fd')}
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
