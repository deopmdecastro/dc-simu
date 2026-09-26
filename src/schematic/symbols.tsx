import type { ElectricalComponent, Terminal } from '../types'

/** Cores de cabo do editor. */
export const WIRE_COLORS: Record<string, string> = {
  red: '#ef4444',
  blue: '#3b82f6',
  'green-yellow': '#84cc16',
  black: '#9ca3af',
  orange: '#f59e0b',
  grey: '#94a3b8',
  brown: '#92400e',
  white: '#f8fafc',
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
  faston: 'Faston',
  ring: 'Olhal',
  plug: 'Plug',
}

/** Posição absoluta de um borne no canvas, respeitando rotação e espelhamento. */
export function terminalPos(c: ElectricalComponent, t: Terminal): { x: number; y: number } {
  const localX = t.x * c.w
  const localY = t.y * c.h
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

const stroke = (selected: boolean, energized: boolean) => (selected ? '#22d3ee' : energized ? '#facc15' : '#cbd5e1')

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
      case 'buttonNO':
      case 'buttonNC':
      case 'emergencyButton':
      case 'selector2':
      case 'selector3':
      case 'keySwitch':
      case 'limitSwitch':
      case 'footSwitch': {
        const pressed = c.state.pressed
        const isNC = c.type === 'buttonNC' || c.type === 'emergencyButton'
        const isEmg = c.type === 'emergencyButton'
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
      case 'buzzer': {
        const col = c.state.color && c.type.startsWith('led') ? c.state.color : '#f59e0b'
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
                  <circle cx={x} cy={h / 2} r={6} fill={t.energized ? '#facc15' : t.color} stroke="#0b1220" />
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
      {/* bornes clicáveis */}
      {c.terminals.map((t) => {
        const px = t.x * w
        const py = t.y * h
        return (
          <g key={t.id}>
            <circle cx={px} cy={py} r={4} fill={t.energized ? '#facc15' : t.color} stroke="#0b1220" strokeWidth={1.2} />
            <circle cx={px} cy={py} r={7} fill="transparent" className="dc-terminal-hit" />
          </g>
        )
      })}
    </g>
  )
}
