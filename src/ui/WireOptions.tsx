import type { ConduitMedium, Wire, WireColor, WireDefaults, WireEndType, WireFlexibility, WireRoute } from '../types'
import { HYDRAULIC_GAUGES, PNEUMATIC_GAUGES } from '../three/hydraulicsModel'
import { useSimStore } from '../store/useSimStore'

const HYDRAULIC_COLORS: readonly WireColor[] = ['blue', 'red', 'grey', 'green', 'yellow', 'white']
const PNEUMATIC_COLORS: readonly WireColor[] = ['lightblue', 'grey', 'black', 'orange', 'blue']

const HYDRAULIC_FITTING_OPTIONS = [
  { id: 'union', label: 'União roscada', hint: 'Racor reto latão roscado G 1"' },
  { id: 'elbow90', label: 'Cotovelo 90°', hint: 'Curva hidráulica 90° em latão' },
  { id: 'tee', label: 'União em T', hint: 'Derivação hidráulica 3 vias (T)' },
  { id: 'valve', label: 'Válvula esfera', hint: 'Corte manual 1/4 de volta' },
  { id: 'flange', label: 'Flange PN16', hint: 'Flange aparafusada de alta pressão' },
  { id: 'gauge', label: 'Manómetro', hint: 'Tomada de pressão hidráulica' },
] as const

const HYDRAULIC_MATERIALS = [
  { id: 'ppr', label: 'PPR', hint: 'Polipropileno termofusão' },
  { id: 'pvc', label: 'PVC-U', hint: 'PVC rígido pressão' },
  { id: 'inox', label: 'Aço Inox', hint: 'Inox AISI 316' },
  { id: 'copper', label: 'Cobre', hint: 'Tubo cobre sanitário/industrial' },
] as const

const PNEUMATIC_FITTING_OPTIONS = [
  { id: 'pushInStraight', label: 'Push-In reto', hint: 'Racor rápido reto com colar azul' },
  { id: 'pushInElbow90', label: 'Cotovelo 90°', hint: 'Joelho rápido Push-In orientável' },
  { id: 'pushInTee', label: 'União em T', hint: 'Derivação pneumática 3 vias (T)' },
  { id: 'pushInY', label: 'União em Y', hint: 'Bifurcação dupla em Y' },
  { id: 'flowControl', label: 'Regulador caudal', hint: 'Válvula estranguladora unidirecional' },
  { id: 'silencer', label: 'Silenciador', hint: 'Escape sinterizado em latão' },
] as const
import { expandWireMarkerRings } from '../electrical/wireMarkers'
import { ConductorIcon, WIRE_END_OPTIONS, WireEndIcon } from '../schematic/wireEnds'
import {
  CABLE_PRESETS,
  WIRE_COLOR_HEX,
  WIRE_COLOR_LABEL,
  WIRE_GAUGES,
  WIRE_ROUTE_HINT,
  WIRE_ROUTE_LABEL,
  applyCablePreset,
  cableOuterDiameterMm,
  defaultCoreColors,
  matchCablePreset,
  wireAmpacityIecA,
  wireColorSwatchBg,
  wireMinBendRadiusMm,
} from '../admin/editor3d/wireStyle'
import Select from './Select'
import type { CSSProperties, ReactNode } from 'react'
import { IconChevronDown } from './icons'

/**
 * Opções dos cabos novos e átomos visuais partilhados entre:
 * - o painel lateral do simulador (Esquema 2D e Esquema 3D)
 * - o inspetor de cabos selecionados
 * - o painel esquerdo do editor 3D de componentes
 *
 * Mantém toda a configuração no painel lateral esquerdo (nunca sobre o canvas).
 */

export type WireOptionPatch = Partial<WireDefaults>

export const WIRE_COLOR_ORDER: WireColor[] = [
  'red', 'blue', 'green-yellow', 'black', 'orange', 'grey', 'brown',
  'white', 'pink', 'violet', 'green', 'yellow', 'lightblue',
]

export const WIRE_ROUTES_ORDER: WireRoute[] = ['orthogonal', 'manhattan', 'arc', 'direct']

const CONDUCTORS: Array<{ id: WireFlexibility; name: string; hint: string }> = [
  { id: 'flexible', name: 'Flexível', hint: 'Multifilar · precisa de ponteira' },
  { id: 'rigid', name: 'Rígido', hint: 'Fio sólido · entra direto no borne' },
]

/** Ícone vetorial da geometria de traçado (ortogonal, manhattan, curvo ou direto). */
export function WireRouteGlyph({ route, size = 26 }: { route: WireRoute; size?: number }) {
  const h = Math.round(size * 0.62)
  return (
    <svg width={size} height={h} viewBox="0 0 28 18" fill="none" aria-hidden="true">
      {route === 'orthogonal' && (
        <path d="M3 14 H11 Q14 14 14 11 V7 Q14 4 17 4 H25" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      )}
      {route === 'manhattan' && (
        <path d="M3 5 V10 Q3 13 6 13 H22 Q25 13 25 10 V5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      )}
      {route === 'arc' && (
        <path d="M3 14 C8 3, 20 3, 25 14" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      )}
      {route === 'direct' && (
        <path d="M3 14 L25 4" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      )}
      <circle cx="3" cy={route === 'manhattan' ? 5 : 14} r="2" fill="currentColor" />
      <circle cx="25" cy={route === 'arc' ? 14 : route === 'manhattan' ? 5 : 4} r="2" fill="currentColor" />
    </svg>
  )
}

/** Amostra técnica em corte longitudinal do cabo (condutor, isolamento/PE, capa, veias e ponteiras A/B). */
export function CableSpecimen({
  color,
  autoColor = false,
  gauge,
  flexibility,
  conductorCount = 1,
  sheathed = false,
  sheathColor = '#0f172a',
  conductorColors,
  fromEndType = 'ferrule',
  toEndType,
  fromEndColor,
  toEndColor,
}: {
  color: WireColor
  autoColor?: boolean
  gauge: string
  flexibility: WireFlexibility
  conductorCount?: number
  sheathed?: boolean
  sheathColor?: string
  conductorColors?: string[]
  fromEndType?: WireEndType
  toEndType?: WireEndType
  fromEndColor?: string
  toEndColor?: string
}) {
  const outer = cableOuterDiameterMm(gauge, { conductorCount, sheathed })
  const bodyH = Math.max(5, Math.min(13, outer * 2.1))
  const jacketH = sheathed ? bodyH + 3.6 : bodyH
  const baseHex = autoColor ? '#334155' : WIRE_COLOR_HEX[color]
  const colA = fromEndColor ?? (autoColor ? '#ef4444' : WIRE_COLOR_HEX[color])
  const colB = toEndColor ?? colA
  const endB = toEndType ?? fromEndType
  const cores = conductorCount > 1 ? (conductorColors?.length ? conductorColors : defaultCoreColors(conductorCount)).slice(0, 5) : []
  const isPe = !autoColor && color === 'green-yellow'
  const isLight = !autoColor && (color === 'white' || color === 'yellow' || color === 'lightblue')

  return (
    <div className="wo-specimen" aria-hidden="true">
      <span className="wo-specimen-end">
        <WireEndIcon type={fromEndType} color={colA} size={30} />
      </span>
      <svg className="wo-specimen-body" viewBox="0 0 120 24" preserveAspectRatio="none">
        {/* Fios de cobre expostos junto às terminações */}
        {flexibility === 'flexible' ? (
          <g stroke="#b45309" strokeWidth="1.1" strokeLinecap="round">
            <line x1="0" y1="9.5" x2="14" y2="10.2" />
            <line x1="0" y1="12" x2="14" y2="12" />
            <line x1="0" y1="14.5" x2="14" y2="13.8" />
            <line x1="106" y1="10.2" x2="120" y2="9.5" />
            <line x1="106" y1="12" x2="120" y2="12" />
            <line x1="106" y1="13.8" x2="120" y2="14.5" />
          </g>
        ) : (
          <g stroke="#b45309" strokeWidth="2.4" strokeLinecap="round">
            <line x1="0" y1="12" x2="14" y2="12" />
            <line x1="106" y1="12" x2="120" y2="12" />
          </g>
        )}
        {/* Veias multicore visíveis no decape */}
        {cores.length > 1 && cores.map((c, idx) => {
          const y = 12 + (idx - (cores.length - 1) / 2) * (Math.min(12, jacketH - 1) / Math.max(1, cores.length - 1))
          return (
            <g key={idx}>
              <line x1="8" y1={y} x2="24" y2={y} stroke={c} strokeWidth="2.1" strokeLinecap="round" />
              <line x1="96" y1={y} x2="112" y2={y} stroke={c} strokeWidth="2.1" strokeLinecap="round" />
            </g>
          )
        })}
        {/* Capa exterior global */}
        {sheathed && (
          <rect
            x={cores.length > 1 ? 22 : 13}
            y={12 - jacketH / 2}
            width={cores.length > 1 ? 76 : 94}
            height={jacketH}
            rx={2.5}
            fill={sheathColor}
            stroke="#0f172a"
            strokeOpacity={0.35}
            strokeWidth="0.9"
          />
        )}
        {/* Isolamento principal do condutor */}
        {(!sheathed || cores.length <= 1) && (
          <rect
            x={sheathed ? 18 : 11}
            y={12 - bodyH / 2}
            width={sheathed ? 84 : 98}
            height={bodyH}
            rx={2}
            fill={isPe ? '#22c55e' : baseHex}
            stroke={isLight ? '#64748b' : '#0f172a'}
            strokeOpacity={isLight ? 0.55 : 0.25}
            strokeWidth="0.9"
          />
        )}
        {/* Riscas amarelas do condutor PE */}
        {isPe && !sheathed && [22, 42, 62, 82].map((x) => (
          <polygon
            key={x}
            points={`${x},${12 - bodyH / 2 + 0.5} ${x + 8},${12 - bodyH / 2 + 0.5} ${x + 3},${12 + bodyH / 2 - 0.5} ${x - 5},${12 + bodyH / 2 - 0.5}`}
            fill="#eab308"
          />
        ))}
        {/* Faixas IEC discretas quando AUTO está ativo */}
        {autoColor && !sheathed && (
          <g>
            <rect x="26" y={12 - bodyH / 2 + 0.6} width="14" height={bodyH - 1.2} fill="#1f2937" />
            <rect x="44" y={12 - bodyH / 2 + 0.6} width="14" height={bodyH - 1.2} fill="#ef4444" />
            <rect x="62" y={12 - bodyH / 2 + 0.6} width="14" height={bodyH - 1.2} fill="#38bdf8" />
            <rect x="80" y={12 - bodyH / 2 + 0.6} width="14" height={bodyH - 1.2} fill="#22c55e" />
          </g>
        )}
        {/* Brilho cilíndrico subtil */}
        <line
          x1={sheathed && cores.length > 1 ? 25 : 15}
          y1={12 - (sheathed ? jacketH : bodyH) * 0.26}
          x2={sheathed && cores.length > 1 ? 95 : 105}
          y2={12 - (sheathed ? jacketH : bodyH) * 0.26}
          stroke="#ffffff"
          strokeOpacity="0.28"
          strokeWidth="1.1"
        />
      </svg>
      <span className="wo-specimen-end is-flip">
        <WireEndIcon type={endB} color={colB} size={30} />
      </span>
    </div>
  )
}

/** Mapa linear 0%–100% do cabo: mostra isolamento, espirais e anilhas/marcadores na posição exata. */
export function CableAccessoryMap({ wire }: { wire: Pick<Wire, 'color' | 'sheathed' | 'sheathColor' | 'isolation' | 'spirals' | 'markers'> }) {
  const iso = wire.isolation ?? []
  const spirals = wire.spirals ?? []
  const markers = wire.markers ?? []
  const baseBg = wire.sheathed ? (wire.sheathColor ?? '#0f172a') : wireColorSwatchBg(wire.color)
  return (
    <div className="wi-cable-map" aria-label="Mapa linear dos acessórios no cabo (0% a 100%)">
      <span className="wi-cable-map-end">A</span>
      <div className="wi-cable-map-track">
        <div className="wi-cable-map-core" style={{ background: baseBg }} />
        {iso.map((seg, i) => {
          const s = Math.max(0, Math.min(1, Math.min(seg.start, seg.end))) * 100
          const e = Math.max(0, Math.min(1, Math.max(seg.start, seg.end))) * 100
          return (
            <div
              key={`iso-${i}`}
              className="wi-cable-map-iso"
              style={{ left: `${s}%`, width: `${Math.max(2, e - s)}%`, background: seg.color }}
              title={`Isolamento #${i + 1}: ${Math.round(s)}%–${Math.round(e)}%`}
            />
          )
        })}
        {spirals.map((seg, i) => {
          const s = Math.max(0, Math.min(1, Math.min(seg.start, seg.end))) * 100
          const e = Math.max(0, Math.min(1, Math.max(seg.start, seg.end))) * 100
          const col = seg.color ?? '#0f172a'
          return (
            <div
              key={`sp-${i}`}
              className="wi-cable-map-spiral"
              style={{
                left: `${s}%`,
                width: `${Math.max(2, e - s)}%`,
                background: `repeating-linear-gradient(65deg, ${col} 0 3px, transparent 3px 5.5px)`,
                borderColor: col,
              }}
              title={`Espiral #${i + 1}: ${Math.round(s)}%–${Math.round(e)}% (Ø ${seg.innerDiaMm ?? 10} mm)`}
            />
          )
        })}
        {markers.map((m, i) => {
          const pos = Math.max(3, Math.min(97, m.t * 100))
          const rings = expandWireMarkerRings(m, 8)
          return (
            <span
              key={`mk-${i}`}
              className="wi-cable-map-marker"
              style={{
                left: `${pos}%`,
                display: 'inline-flex',
                gap: '0.5px',
                padding: '1px',
                background: '#0f172a',
                borderRadius: '3px',
              }}
              title={`Anilha «${m.text}» a ${Math.round(m.t * 100)}%`}
            >
              {rings.length ? rings.map((r, rIdx) => (
                <i
                  key={rIdx}
                  style={{
                    fontStyle: 'normal',
                    fontWeight: 800,
                    fontSize: '8.5px',
                    lineHeight: '11px',
                    minWidth: '7.5px',
                    padding: '0 1.5px',
                    textAlign: 'center',
                    borderRadius: '1.5px',
                    background: r.bg,
                    color: r.fg,
                  }}
                >
                  {r.char}
                </i>
              )) : '·'}
            </span>
          )
        })}
      </div>
      <span className="wi-cable-map-end">B</span>
    </div>
  )
}

function WireOptionSection({ progressive, name, title, summary, children }: { progressive: boolean; name: string; title: string; summary: ReactNode; children: ReactNode }) {
  if (!progressive) return <>{children}</>
  return <details className="wo-disclosure" data-wire-section={name}>
    <summary><strong>{title}</strong><span className="wo-disclosure-value">{summary}</span><IconChevronDown size={13} /></summary>
    <div className="wo-disclosure-body">{children}</div>
  </details>
}

export function WireOptionsFields({
  value,
  onChange,
  compact = false,
  showRouting = false,
  progressive = false,
}: {
  value: WireDefaults
  onChange: (patch: WireOptionPatch) => void
  /** Painel estreito: os campos passam a uma coluna para não apertar os ícones. */
  compact?: boolean
  /** Mostra os controlos de traçado/curva e ligação contínua (simulador 2D/3D). */
  showRouting?: boolean
  /** Opções essenciais visíveis e ajustes secundários a pedido no simulador. */
  progressive?: boolean
}) {
  const endColor = value.autoColor ? '#ef4444' : WIRE_COLOR_HEX[value.color]
  const selectedEnd = WIRE_END_OPTIONS.find((option) => option.id === value.endType)
  const outerMm = cableOuterDiameterMm(value.gauge, { conductorCount: value.conductorCount, sheathed: value.sheathed })
  const minBendMm = wireMinBendRadiusMm(value.gauge, {
    conductorCount: value.conductorCount,
    sheathed: value.sheathed,
    flexibility: value.flexibility,
  })
  const ampacityA = wireAmpacityIecA(value.gauge)
  const activeRoute: WireRoute = value.route ?? 'orthogonal'
  const activePreset = matchCablePreset(value)
  const activeMedium: ConduitMedium = value.medium ?? 'electrical'
  const isHydraulic = activeMedium === 'hydraulic'
  const isPneumatic = activeMedium === 'pneumatic'
  const isElectrical = !isHydraulic && !isPneumatic
  const pickMedium = (medium: ConduitMedium) => {
    if (medium === activeMedium) return
    if (medium === 'hydraulic') {
      onChange({
        medium,
        gauge: 'DN20 (Ø25mm)',
        endType: 'hydraulicFitting',
        color: 'blue',
        autoColor: false,
        route: 'orthogonal',
        conductorCount: 1,
        sheathed: false,
        hydraulicFitting: value.hydraulicFitting ?? 'union',
        hydraulicMaterial: value.hydraulicMaterial ?? 'ppr',
        hydraulicPressureBar: value.hydraulicPressureBar ?? 10,
      })
    } else if (medium === 'pneumatic') {
      onChange({
        medium,
        gauge: 'PU Ø6mm',
        endType: 'pneumaticPushIn',
        color: 'lightblue',
        autoColor: false,
        route: 'arc',
        conductorCount: 1,
        sheathed: false,
        pneumaticFitting: value.pneumaticFitting ?? 'pushInStraight',
        pneumaticPressureBar: value.pneumaticPressureBar ?? 6,
      })
    } else {
      onChange({
        medium: 'electrical',
        gauge: '1.5mm²',
        endType: 'ferrule',
        autoColor: true,
        route: 'orthogonal',
      })
    }
  }
  const activeGauges: readonly string[] = isHydraulic
    ? HYDRAULIC_GAUGES
    : isPneumatic
      ? PNEUMATIC_GAUGES
      : WIRE_GAUGES
  const activeColorSwatches: readonly WireColor[] = isHydraulic
    ? HYDRAULIC_COLORS
    : isPneumatic
      ? PNEUMATIC_COLORS
      : WIRE_COLOR_ORDER
  const electricalEndOptions = WIRE_END_OPTIONS.filter(
    (opt) => opt.id !== 'hydraulicFitting' && opt.id !== 'pneumaticPushIn',
  )
  const insertAccessory = (type: 'hydraulicTee' | 'hydraulicValve' | 'pneumaticTee' | 'pneumaticFrl') => {
    const st = useSimStore.getState()
    const id = st.addComponent(type, 380, 260)
    if (id) st.selectComponents([id])
  }

  const dimensions = (
    <div className="wo-group wo-dimensions">
        <div className="wo-label">
          <span>{isElectrical ? 'Secção nominal' : isHydraulic ? 'Diâmetro hidráulico' : 'Diâmetro tubo PU'}</span>
          <em>{value.gauge}{isElectrical && ampacityA !== null ? ` · ≈ ${ampacityA} A` : ''}</em>
        </div>
        <div className="wo-gauges" role="radiogroup" aria-label={isElectrical ? 'Secção do cabo' : 'Diâmetro do tubo'}>
          {activeGauges.map((gauge) => (
            <button
              key={gauge}
              type="button"
              role="radio"
              aria-checked={value.gauge === gauge}
              aria-label={`Bitola ${gauge}`}
              className={`wo-gauge${value.gauge === gauge ? ' is-on' : ''}`}
              onClick={() => onChange({ gauge })}
            >
              {gauge.includes('mm²') ? <>{gauge.replace('mm²', '')}<i>mm²</i></> : <span>{gauge}</span>}
            </button>
          ))}
        </div>
    </div>
  )

  return (
    <div className={`wo-fields${compact ? ' is-compact' : ''}${progressive ? ' is-progressive' : ''}`} data-conduit-active-medium={activeMedium}>
      {/* Seletor de meio físico: Cabo elétrico | Tubo hidráulico | Tubo pneumático */}
      <div className="wo-group" data-conduit-medium-group>
        <div className="wo-label">
          <span>{progressive ? 'Tipo de ligação' : 'Tipo de conduta'}</span>
          {!progressive && <em>{isHydraulic ? 'Hidráulica' : isPneumatic ? 'Pneumática' : 'Elétrica'}</em>}
        </div>
        <div className="wo-routes wo-medium-choices" role="radiogroup" aria-label="Tipo de conduta (cabo elétrico, tubo hidráulico ou pneumático)">
          {([
            ['electrical', 'Cabo elétrico', 'Condutor elétrico normalizado'],
            ['hydraulic', 'Tubo hidráulico', 'Tubagem hidráulica com uniões roscadas'],
            ['pneumatic', 'Tubo pneumático', 'Tubo PU de ar comprimido com conectores Push-In'],
          ] as const).map(([id, labelText, hint]) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={activeMedium === id}
              title={hint}
              className={`wo-route${activeMedium === id ? ' is-on' : ''}`}
              onClick={() => pickMedium(id)}
            >
              <span>{labelText}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Amostra visual em direto do cabo/tubo configurado + cotas físicas filtradas por tipo */}
      <div className="wo-preview-card">
        <CableSpecimen
          color={value.color}
          autoColor={isElectrical && value.autoColor}
          gauge={value.gauge}
          flexibility={isElectrical ? value.flexibility : isPneumatic ? 'flexible' : 'rigid'}
          conductorCount={isElectrical ? (value.conductorCount ?? 1) : 1}
          sheathed={isElectrical && !!value.sheathed}
          sheathColor={value.sheathColor}
          conductorColors={isElectrical ? value.conductorColors : undefined}
          fromEndType={isHydraulic ? 'hydraulicFitting' : isPneumatic ? 'pneumaticPushIn' : value.endType}
          toEndType={isHydraulic ? 'hydraulicFitting' : isPneumatic ? 'pneumaticPushIn' : value.endType}
        />
        <div className="wo-preview-specs">
          <span>
            {isElectrical && (value.conductorCount ?? 1) > 1 ? `${value.conductorCount}×` : ''}{value.gauge}
          </span>
          <span>Ø {outerMm.toFixed(1)} mm</span>
          {isElectrical && <span>Rmín {minBendMm.toFixed(0)} mm</span>}
          {isElectrical && ampacityA !== null && <span>≈ {ampacityA} A</span>}
          {isHydraulic && <span>{(value.hydraulicMaterial ?? 'ppr').toUpperCase()} · PN{value.hydraulicPressureBar ?? 10}</span>}
          {isPneumatic && <span>Ar · {value.pneumaticPressureBar ?? 6} bar</span>}
        </div>
      </div>

      {/* Secção (elétrico) OU Diâmetro nominal (hidráulico / pneumático) */}
      {progressive && dimensions}

      {showRouting && (
        <div className="wo-group">
          <div className="wo-label">
            <span>{isElectrical ? 'Rastreamento e curva' : 'Traçado da tubagem'}</span>
            <em>{WIRE_ROUTE_LABEL[activeRoute]}</em>
          </div>
          <div className="wo-routes" role="radiogroup" aria-label="Modo de traçado">
            {WIRE_ROUTES_ORDER.map((route) => {
              const on = activeRoute === route
              return (
                <button
                  key={route}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  title={WIRE_ROUTE_HINT[route]}
                  className={`wo-route${on ? ' is-on' : ''}`}
                  onClick={() => onChange({ route })}
                >
                  <WireRouteGlyph route={route} size={24} />
                  <span>{WIRE_ROUTE_LABEL[route]}</span>
                </button>
              )
            })}
          </div>
          <div className="wo-toggles">
            <button
              type="button"
              className={`wo-toggle${value.orthoSnap !== false ? ' is-on' : ''}`}
              aria-pressed={value.orthoSnap !== false}
              onClick={() => onChange({ orthoSnap: value.orthoSnap === false })}
            >
              Guias 90°
            </button>
            <button
              type="button"
              className={`wo-toggle${value.chainMode ? ' is-on' : ''}`}
              aria-pressed={!!value.chainMode}
              onClick={() => onChange({ chainMode: !value.chainMode })}
            >
              Ligação contínua
            </button>
          </div>
        </div>
      )}

      {/* Cor filtrada pelo tipo de conduta */}
      <WireOptionSection progressive={progressive} name="color" title={isElectrical ? 'Cor do cabo' : 'Cor do tubo'} summary={<>{!(isElectrical && value.autoColor) && <i className="wo-current-color" style={{ background: wireColorSwatchBg(value.color) }} />}{isElectrical && value.autoColor ? 'Automática' : WIRE_COLOR_LABEL[value.color]}</>}>
      <div className="wo-group wo-colors">
        <div className="wo-label">
          <span>{isHydraulic ? 'Cor da tubagem / fluido' : isPneumatic ? 'Cor do tubo PU' : 'Cor do cabo'}</span>
          {isElectrical && (
            <button
              type="button"
              className={`wo-auto${value.autoColor ? ' is-on' : ''}`}
              aria-pressed={value.autoColor}
              onClick={() => onChange({ autoColor: !value.autoColor })}
              title="Cor automática pela função do cabo (IEC 60204-1)"
            >
              AUTO
            </button>
          )}
        </div>
        <div className="wo-swatches" role="radiogroup" aria-label="Cor">
          {activeColorSwatches.map((name) => (
            <button
              key={name}
              type="button"
              role="radio"
              aria-checked={(!isElectrical || !value.autoColor) && value.color === name}
              aria-label={WIRE_COLOR_LABEL[name]}
              title={WIRE_COLOR_LABEL[name]}
              className={`wo-swatch${(!isElectrical || !value.autoColor) && value.color === name ? ' is-on' : ''}${isElectrical && value.autoColor ? ' is-dim' : ''}`}
              style={progressive ? { '--wo-swatch-color': wireColorSwatchBg(name) } as CSSProperties : { background: wireColorSwatchBg(name) }}
              onClick={() => onChange({ color: name, autoColor: false })}
            />
          ))}
        </div>
      </div>
      </WireOptionSection>
      {!progressive && dimensions}

      {/* === OPÇÕES EXCLUSIVAMENTE HIDRÁULICAS === */}
      {isHydraulic && (
        <WireOptionSection progressive={progressive} name="hydraulic" title="Uniões e material" summary={`${HYDRAULIC_FITTING_OPTIONS.find((f) => f.id === (value.hydraulicFitting ?? 'union'))?.label} · ${HYDRAULIC_MATERIALS.find((material) => material.id === (value.hydraulicMaterial ?? 'ppr'))?.label} · PN${value.hydraulicPressureBar ?? 10}`}>
        <div className="wo-group" data-hydraulic-only-controls>
          <div className="wo-label">
            <span>Uniões e acessórios hidráulicos</span>
            <em>{HYDRAULIC_FITTING_OPTIONS.find((f) => f.id === (value.hydraulicFitting ?? 'union'))?.label}</em>
          </div>
          <div className="wo-presets" role="radiogroup" aria-label="Uniões hidráulicas">
            {HYDRAULIC_FITTING_OPTIONS.map((opt) => {
              const on = (value.hydraulicFitting ?? 'union') === opt.id
              return (
                <button
                  key={opt.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  title={opt.hint}
                  className={`wo-preset${on ? ' is-on' : ''}`}
                  onClick={() => onChange({ hydraulicFitting: opt.id, endType: 'hydraulicFitting' })}
                >
                  <strong>{opt.label}</strong>
                  <small>{opt.hint}</small>
                </button>
              )
            })}
          </div>
          <div className="wo-label mt-2">
            <span>Material do tubo</span>
            <em>{HYDRAULIC_MATERIALS.find((material) => material.id === (value.hydraulicMaterial ?? 'ppr'))?.label}</em>
          </div>
          <div className="wo-gauges" role="radiogroup" aria-label="Material hidráulico">
            {HYDRAULIC_MATERIALS.map((mat) => (
              <button
                key={mat.id}
                type="button"
                role="radio"
                aria-checked={(value.hydraulicMaterial ?? 'ppr') === mat.id}
                title={mat.hint}
                className={`wo-gauge${(value.hydraulicMaterial ?? 'ppr') === mat.id ? ' is-on' : ''}`}
                onClick={() => onChange({ hydraulicMaterial: mat.id })}
              >
                <span>{mat.label}</span>
              </button>
            ))}
          </div>
          <div className="wo-label mt-2"><span>Pressão nominal</span><em>PN{value.hydraulicPressureBar ?? 10}</em></div>
          <div className="wo-gauges wo-pressure-choices" role="radiogroup" aria-label="Pressão nominal hidráulica">
            {[10, 16].map((bar) => (
              <button
                key={bar}
                type="button"
                role="radio"
                aria-checked={(value.hydraulicPressureBar ?? 10) === bar}
                className={`wo-gauge${(value.hydraulicPressureBar ?? 10) === bar ? ' is-on' : ''}`}
                onClick={() => onChange({ hydraulicPressureBar: bar })}
              >
                <span>{`PN${bar}`}</span>
              </button>
            ))}
          </div>
          <div className="wo-toggles mt-1.5">
            <button type="button" className="wo-toggle" onClick={() => insertAccessory('hydraulicTee')}>
              + Inserir União T
            </button>
            <button type="button" className="wo-toggle" onClick={() => insertAccessory('hydraulicValve')}>
              + Inserir Válvula
            </button>
          </div>
        </div>
        </WireOptionSection>
      )}

      {/* === OPÇÕES EXCLUSIVAMENTE PNEUMÁTICAS === */}
      {isPneumatic && (
        <WireOptionSection progressive={progressive} name="pneumatic" title="Conectores e pressão" summary={`${PNEUMATIC_FITTING_OPTIONS.find((f) => f.id === (value.pneumaticFitting ?? 'pushInStraight'))?.label} · ${value.pneumaticPressureBar ?? 6} bar`}>
        <div className="wo-group" data-pneumatic-only-controls>
          <div className="wo-label">
            <span>Conectores e uniões Push-In</span>
            <em>{PNEUMATIC_FITTING_OPTIONS.find((f) => f.id === (value.pneumaticFitting ?? 'pushInStraight'))?.label}</em>
          </div>
          <div className="wo-presets" role="radiogroup" aria-label="Conectores pneumáticos">
            {PNEUMATIC_FITTING_OPTIONS.map((opt) => {
              const on = (value.pneumaticFitting ?? 'pushInStraight') === opt.id
              return (
                <button
                  key={opt.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  title={opt.hint}
                  className={`wo-preset${on ? ' is-on' : ''}`}
                  onClick={() => onChange({ pneumaticFitting: opt.id, endType: 'pneumaticPushIn' })}
                >
                  <strong>{opt.label}</strong>
                  <small>{opt.hint}</small>
                </button>
              )
            })}
          </div>
          <div className="wo-label mt-2">
            <span>Pressão de serviço</span>
            <em>{`${value.pneumaticPressureBar ?? 6} bar`}</em>
          </div>
          <div className="wo-gauges" role="radiogroup" aria-label="Pressão pneumática">
            {[4, 6, 8, 10].map((bar) => (
              <button
                key={bar}
                type="button"
                role="radio"
                aria-checked={(value.pneumaticPressureBar ?? 6) === bar}
                className={`wo-gauge${(value.pneumaticPressureBar ?? 6) === bar ? ' is-on' : ''}`}
                onClick={() => onChange({ pneumaticPressureBar: bar })}
              >
                <span>{`${bar} bar`}</span>
              </button>
            ))}
          </div>
          <div className="wo-toggles mt-1.5">
            <button type="button" className="wo-toggle" onClick={() => insertAccessory('pneumaticTee')}>
              + Inserir União T
            </button>
            <button type="button" className="wo-toggle" onClick={() => insertAccessory('pneumaticFrl')}>
              + Inserir FRL
            </button>
          </div>
        </div>
        </WireOptionSection>
      )}

      {/* === OPÇÕES EXCLUSIVAMENTE ELÉTRICAS === */}
      {isElectrical && (
        <>
          <div className="wo-group" data-electrical-only-controls>
            <div className="wo-label"><span>Condutor</span></div>
            <div className="wo-choices" role="radiogroup" aria-label="Condutor">
              {CONDUCTORS.map((conductor) => (
                <button
                  key={conductor.id}
                  type="button"
                  role="radio"
                  aria-checked={value.flexibility === conductor.id}
                  aria-label={`Condutor ${conductor.name}`}
                  title={`${conductor.name} — ${conductor.hint}`}
                  className={`wo-choice${value.flexibility === conductor.id ? ' is-on' : ''}`}
                  onClick={() => onChange({ flexibility: conductor.id })}
                >
                  <ConductorIcon flexible={conductor.id === 'flexible'} color={value.autoColor ? '#1f2937' : WIRE_COLOR_HEX[value.color]} size={40} />
                  <strong>{conductor.name}</strong>
                  <small>{conductor.hint}</small>
                </button>
              ))}
            </div>
          </div>

          <WireOptionSection progressive={progressive} name="ends" title="Terminal das pontas" summary={selectedEnd?.label ?? 'Sem terminal'}>
          <div className="wo-group">
            <div className="wo-label"><span>Terminal das pontas</span><em>{selectedEnd?.label ?? ''}</em></div>
            <div className="wo-ends" role="radiogroup" aria-label="Terminal das pontas do cabo">
              {electricalEndOptions.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  role="radio"
                  aria-checked={value.endType === option.id}
                  aria-label={option.label}
                  title={option.hint}
                  className={`wo-end${value.endType === option.id ? ' is-on' : ''}`}
                  onClick={() => onChange({ endType: option.id as WireEndType })}
                >
                  <WireEndIcon type={option.id} color={endColor} size={34} />
                  <span>{option.label}</span>
                </button>
              ))}
            </div>
            <small className="wo-note">{selectedEnd?.hint}</small>
          </div>
          </WireOptionSection>

          <WireOptionSection progressive={progressive} name="formation" title="Formação e proteção" summary={`${value.conductorCount ?? 1} condutor${(value.conductorCount ?? 1) > 1 ? 'es' : ''} · ${value.sheathed ? 'Com capa' : 'Sem capa'}`}>
          <div className="wo-group">
            <div className="wo-label">
              <span>Formação / multicore</span>
              <em>{activePreset === 'custom' ? 'Personalizado' : (CABLE_PRESETS.find((p) => p.id === activePreset)?.label ?? '')}</em>
            </div>
            <div className="wo-presets" role="radiogroup" aria-label="Tipo de cabo">
              {CABLE_PRESETS.map((preset) => {
                const on = activePreset === preset.id
                return (
                  <button
                    key={preset.id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    aria-label={preset.label}
                    title={`${preset.label} — ${preset.hint}`}
                    className={`wo-preset${on ? ' is-on' : ''}`}
                    onClick={() => onChange({
                      ...applyCablePreset(preset),
                      conductorColors: preset.conductors > 1 ? defaultCoreColors(preset.conductors) : undefined,
                    })}
                  >
                    <strong>{preset.label}</strong>
                    <small>{preset.hint}</small>
                  </button>
                )
              })}
            </div>
            <div className="wo-row">
              <label className="wo-inline">
                <span>Nº</span>
                <Select
                  className="wo-select"
                  value={value.conductorCount ?? 1}
                  onChange={(e) => {
                    const n = Number(e.target.value)
                    onChange({ conductorCount: n, conductorColors: n > 1 ? defaultCoreColors(n) : undefined })
                  }}
                  aria-label="Número de condutores"
                >
                  {[1, 2, 3, 4, 5, 6, 7, 8, 12].map((n) => <option key={n} value={n}>{n}×</option>)}
                </Select>
              </label>
              <button
                type="button"
                className={`wo-sheath-btn wo-sheath${value.sheathed ? ' is-on' : ''}`}
                aria-pressed={!!value.sheathed}
                onClick={() => onChange({ sheathed: !value.sheathed, sheathColor: !value.sheathed ? (value.sheathColor ?? '#0f172a') : value.sheathColor })}
                title="Capa exterior (isolamento global do cabo)"
              >
                <strong>{value.sheathed ? 'Com capa' : 'Sem capa'}</strong>
                <small>{value.sheathed ? 'Isolamento global PVC' : 'Isolação individual'}</small>
              </button>
              {value.sheathed && (
                <input
                  type="color"
                  className="wo-sheath-color"
                  aria-label="Cor da capa exterior"
                  value={value.sheathColor ?? '#0f172a'}
                  title="Cor da capa exterior"
                  onChange={(e) => onChange({ sheathColor: e.target.value })}
                />
              )}
            </div>
          </div>
          </WireOptionSection>
        </>
      )}
    </div>
  )
}
