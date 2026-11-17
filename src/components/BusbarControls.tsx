import { useEffect, useState } from 'react'
import type { ElectricalComponent } from '../types'
import { useSimStore } from '../store/useSimStore'
import {
  ACRYLIC_BUSBAR,
  acrylicBusbarColorOf,
  acrylicBusbarDimsOf,
  acrylicBusbarWireEntryOf,
  acrylicCoverVisibleOf,
  clampAcrylicBusbarPoles,
  clampSteppedBusbarHoles,
  isAcrylicBusbarType,
  isCombBusbarType,
  isCombConnectorType,
  isSteppedBusbarType,
  PHASE_BUSBAR_ACRYLIC_COLORS,
  STEPPED_BUSBAR,
  steppedBarsModeOf,
  steppedBusbarDimsOf,
  steppedCoverOpenOf,
  steppedCoverVisibleOf,
  type SteppedBarConductors,
} from '../three/busbarParts'
import {
  COMB_BRAND_STYLES,
  COMB_BUSBAR,
  COMB_BUSBAR_MODES,
  COMB_CONNECTOR,
  COMB_CONNECTOR_COLORS,
  COMB_CONNECTOR_GAUGES,
  COMB_RATED_OPTIONS,
  clampCombBusbarPoles,
  combBrandOf,
  combBusbarDimsOf,
  combCatalogCodeOf,
  combConnectorColorOf,
  combConnectorGaugeOf,
  combConnectorPhaseColorsOf,
  combConnectorPinDirectionOf,
  combConnectorPinStyleOf,
  combEndCapsOf,
  combFeedConnectorsOf,
  combModeOf,
  combNeutralSideOf,
  combRatedAOf,
  combSectionMm2Of,
  combTeethDirectionOf,
  type CombBrandStyle,
  type CombBusbarMode,
  type CombConnectorGauge,
  type CombConnectorPinStyle,
  type CombFeedConnectors,
  type CombNeutralSide,
  type CombRatedA,
  type CombTeethDirection,
} from '../three/combBusbarParts'
import Select from '../ui/Select'
import { IconEye, IconEyeOff } from '../ui/icons'
import {
  breakerInputLabels,
  findCombConnectorMountTarget,
  findCombMountTarget,
  isBreaker,
} from '../three/combMount'

/** Chaves de `c.state` geridas diretamente por `BusbarControls` (ocultas na lista genérica do Inspetor). */
export const BUSBAR_STATE_KEYS = new Set([
  'poleCount',
  'acrylicColor',
  'coverOpen',
  'coverVisible',
  'wireEntryDirection',
  'barsMode',
  'combMode',
  'neutralSide',
  'teethDirection',
  'brandStyle',
  'ratedA',
  'endCaps',
  'feedConnectors',
  'connectorColor',
  'connectorPhaseColors',
  'pinDirection',
  'pinStyle',
  'gaugeRange',
  'source',
  'sourcePhase',
])

const fieldLabel = 'dc-field-label'

export default function BusbarControls({ c }: { c: ElectricalComponent }) {
  if (isCombBusbarType(c.type)) return <CombBusbarInspector c={c} />
  if (isCombConnectorType(c.type)) return <CombConnectorInspector c={c} />
  const isAcrylic = isAcrylicBusbarType(c.type)
  const isStepped = isSteppedBusbarType(c.type)
  if (!isAcrylic && !isStepped) return null

  const minN = isAcrylic ? ACRYLIC_BUSBAR.minPoles : STEPPED_BUSBAR.minHoles
  const maxN = isAcrylic ? ACRYLIC_BUSBAR.maxPoles : STEPPED_BUSBAR.maxHoles
  const currentCount = isAcrylic
    ? clampAcrylicBusbarPoles(c.state.poleCount)
    : clampSteppedBusbarHoles(c.state.poleCount)

  const [draft, setDraft] = useState(String(currentCount))
  useEffect(() => setDraft(String(currentCount)), [currentCount, c.id])

  const parsedDraft = isAcrylic ? clampAcrylicBusbarPoles(draft) : clampSteppedBusbarHoles(draft)
  const hasChange = parsedDraft !== currentCount

  const applyCount = (next = parsedDraft) => {
    useSimStore.getState().setBusbarPoleCount(c.id, next)
    setDraft(String(next))
  }

  const applyBarsMode = (mode: SteppedBarConductors) => {
    useSimStore.getState().setBusbarPoleCount(c.id, currentCount, mode)
  }

  // --- Barramentos unipolares com acrílico (Terra, Neutro e Fase) ---
  if (isAcrylicBusbarType(c.type)) {
    const dims = acrylicBusbarDimsOf(c.state)
    const color = acrylicBusbarColorOf(c.type, c.state)
    const coverVisible = acrylicCoverVisibleOf(c.state)
    const wireEntry = acrylicBusbarWireEntryOf(c.type, c.state)
    const isPhase = c.type === 'busbarPhaseAcrylic'
    const sourceOn = isPhase ? c.state.source === true : c.state.source !== false
    const sourcePhase = typeof c.state.sourcePhase === 'string' ? c.state.sourcePhase : 'L1'

    return (
      <div className="dc-acc-controls" data-busbar-controls={c.type}>
        {/* N.º de bornes */}
        <div className="dc-rail-length space-y-2">
          <label className={fieldLabel}>Número de bornes</label>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              className="dc-btn"
              aria-label="Menos um borne"
              disabled={currentCount <= minN}
              onClick={() => applyCount(Math.max(minN, currentCount - 1))}
            >
              −
            </button>
            <input
              type="number"
              min={minN}
              max={maxN}
              step={1}
              className="dc-input w-20 text-center"
              aria-label="Número de bornes do barramento"
              data-busbar-pole-input
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value)
                const raw = Number(e.target.value)
                if (e.target.value.trim() !== '' && Number.isInteger(raw) && raw >= minN && raw <= maxN && raw !== currentCount) {
                  useSimStore.getState().setBusbarPoleCount(c.id, raw)
                }
              }}
              onBlur={() => applyCount()}
              onKeyDown={(e) => { if (e.key === 'Enter') applyCount() }}
            />
            <button
              type="button"
              className="dc-btn"
              aria-label="Mais um borne"
              disabled={currentCount >= maxN}
              onClick={() => applyCount(Math.min(maxN, currentCount + 1))}
            >
              +
            </button>
            <button
              type="button"
              className={`dc-btn ml-auto${hasChange ? ' dc-btn-primary' : ''}`}
              disabled={!hasChange}
              data-busbar-pole-apply
              onClick={() => applyCount()}
            >
              Aplicar
            </button>
          </div>
          <div className="flex flex-wrap gap-1" role="group" aria-label="Bornes padrão">
            {ACRYLIC_BUSBAR.presets.map((n) => (
              <button
                key={n}
                type="button"
                aria-pressed={currentCount === n}
                className={`dc-btn !h-7${currentCount === n ? ' dc-btn-primary' : ''}`}
                onClick={() => applyCount(n)}
              >
                {n}
              </button>
            ))}
          </div>
          <small className="text-ink-400">
            {dims.poles} bornes interligados · {dims.widthMm} × {String(dims.heightMm).replace('.', ',')} × {dims.depthMm} mm (fixação M4 a {dims.mountSpanMm} mm)
          </small>
        </div>

        {/* Tampa de acrílico (fixa em PE/N, editável em Fase) */}
        <div className="dc-rail-length space-y-2">
          <div className="flex items-center justify-between gap-2">
            <label className={fieldLabel + ' !mb-0'}>Acrílico de proteção</label>
            <button
              type="button"
              className="dc-btn !h-7 inline-flex items-center gap-1"
              aria-pressed={coverVisible}
              data-busbar-cover-visibility
              onClick={() => useSimStore.getState().setComponentState(c.id, { coverVisible: !coverVisible })}
            >
              {coverVisible ? <IconEyeOff size={12} /> : <IconEye size={12} />}
              <span>{coverVisible ? 'Ocultar tampa' : 'Mostrar tampa'}</span>
            </button>
          </div>

          {isPhase ? (
            <div className="space-y-1.5">
              <div className="dc-color-swatches" role="group" aria-label="Cor do acrílico do barramento de fase">
                {PHASE_BUSBAR_ACRYLIC_COLORS.map((opt) => {
                  const selected = color.toLowerCase() === opt.value.toLowerCase()
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      className={`dc-color-swatch${selected ? ' is-selected' : ''}`}
                      style={{ backgroundColor: opt.value }}
                      title={opt.name}
                      aria-label={opt.name}
                      aria-pressed={selected}
                      data-acrylic-swatch={opt.value}
                      onClick={() => useSimStore.getState().setBusbarAcrylicColor(c.id, opt.value)}
                    />
                  )
                })}
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={color}
                  aria-label="Cor personalizada do acrílico"
                  data-acrylic-color-picker
                  className="h-7 w-9 cursor-pointer rounded border border-slate-200 bg-white p-0.5"
                  onChange={(e) => useSimStore.getState().setBusbarAcrylicColor(c.id, e.target.value)}
                />
                <span className="text-xs text-ink-500">
                  {PHASE_BUSBAR_ACRYLIC_COLORS.find((o) => o.value.toLowerCase() === color.toLowerCase())?.name ?? color.toUpperCase()}
                </span>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-xs text-ink-500">
              <span
                className="inline-block h-4 w-4 rounded-sm border border-black/15"
                style={{ backgroundColor: color }}
                aria-hidden="true"
              />
              <span>
                {c.type === 'earthBar'
                  ? 'Acrílico verde translúcido (Terra PE)'
                  : 'Acrílico azul translúcido (Neutro N)'}
              </span>
            </div>
          )}
        </div>

        {/* Entrada dos cabos (por baixo ou por cima) */}
        <div className="dc-rail-length space-y-1.5">
          <label className={fieldLabel}>Entrada dos condutores</label>
          <div className="grid grid-cols-2 gap-1.5" role="group" aria-label="Entrada dos condutores">
            {([
              { id: 'bottom', label: 'Por baixo (inferior)' },
              { id: 'top', label: 'Por cima (superior)' },
            ] as const).map((opt) => (
              <button
                key={opt.id}
                type="button"
                aria-pressed={wireEntry === opt.id}
                data-busbar-wire-entry={opt.id}
                onClick={() => useSimStore.getState().setBusbarWireEntryDirection(c.id, opt.id)}
                className={`rounded-md border px-2 py-1 text-xs font-medium transition cursor-pointer ${
                  wireEntry === opt.id
                    ? 'border-brand-700 bg-brand-600 text-white shadow-xs'
                    : 'border-ink-200 bg-white text-ink-700 hover:bg-surface-100'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <small className="text-ink-400">
            Parafusos de aperto voltados para a frente (+Z). Túneis condutores acessíveis {wireEntry === 'top' ? 'pela face superior' : 'pela face inferior'}.
          </small>
        </div>

        {/* Comportamento elétrico (em N e Fase; PE é sempre referência de terra) */}
        {c.type !== 'earthBar' && (
          <div className="dc-rail-length space-y-1.5">
            <label className="flex items-center justify-between gap-2 px-1 py-0.5 rounded hover:bg-slate-50">
              <span className="text-ink-500">
                {isPhase ? 'Alimentar barra diretamente (fonte)' : 'Referência de neutro ativa'}
              </span>
              <input
                type="checkbox"
                checked={sourceOn}
                data-busbar-source-toggle
                onChange={(e) => useSimStore.getState().setComponentState(c.id, { source: e.target.checked })}
              />
            </label>
            {isPhase && sourceOn && (
              <div className="flex items-center justify-between gap-2 px-1">
                <span className="text-xs text-ink-500">Potencial fornecido</span>
                <Select
                  className="dc-input !w-auto"
                  aria-label="Fase fornecida pelo barramento"
                  value={sourcePhase}
                  onChange={(e) => useSimStore.getState().setComponentState(c.id, { sourcePhase: e.target.value })}
                >
                  <option value="L1">L1 (230 V AC)</option>
                  <option value="L2">L2 (230 V AC)</option>
                  <option value="L3">L3 (230 V AC)</option>
                  <option value="DC+">+24 V DC</option>
                </Select>
              </div>
            )}
            <small className="text-ink-400">
              {isPhase
                ? (sourceOn ? `Fornece ${sourcePhase} em todos os bornes L.1…L.${dims.poles}.` : `Distribui a fase ou +24 V ligada a qualquer borne L.1…L.${dims.poles}.`)
                : (sourceOn ? `Retorno de neutro disponível em todos os bornes N1…N${dims.poles}.` : `Barramento passivo: conduz o neutro recebido por cabo entre N1…N${dims.poles}.`)}
            </small>
          </div>
        )}
      </div>
    )
  }

  // --- Barramento repartidor de fases em escada (4P / 3P / 2P) com tampa articulada ---
  const dims = steppedBusbarDimsOf(c.state)
  const barsMode = steppedBarsModeOf(c.state)
  const coverVisible = steppedCoverVisibleOf(c.state)
  const coverOpen = steppedCoverOpenOf(c.state)
  const sourceOn = c.state.source === true
  const totalTerminals = dims.conductors.length * dims.holesPerBar

  return (
    <div className="dc-acc-controls" data-busbar-controls="busbarPhaseStepped">
      {/* Tampa articulada: Abrir/Fechar + Mostrar/Ocultar */}
      <div className="dc-rail-length space-y-2">
        <label className={fieldLabel}>Tampa acrílica de proteção</label>
        <div className="dc-acc-seg" role="group" aria-label="Posição da tampa do barramento em escada">
          <button
            type="button"
            aria-pressed={coverVisible && !coverOpen}
            className={coverVisible && !coverOpen ? 'is-on' : ''}
            data-stepped-cover-close
            onClick={() => useSimStore.getState().setComponentState(c.id, { coverVisible: true, coverOpen: false })}
          >
            Fechada
          </button>
          <button
            type="button"
            aria-pressed={coverVisible && coverOpen}
            className={coverVisible && coverOpen ? 'is-on' : ''}
            data-stepped-cover-open
            onClick={() => useSimStore.getState().setComponentState(c.id, { coverVisible: true, coverOpen: true })}
          >
            Aberta
          </button>
        </div>
        <button
          type="button"
          className="dc-btn w-full inline-flex items-center justify-center gap-1.5"
          aria-pressed={!coverVisible}
          data-stepped-cover-visibility
          onClick={() => useSimStore.getState().setComponentState(c.id, { coverVisible: !coverVisible })}
        >
          {coverVisible ? <IconEyeOff size={13} /> : <IconEye size={13} />}
          <span>{coverVisible ? 'Ocultar tampa' : 'Mostrar tampa'}</span>
        </button>
        <small className="text-ink-400">
          {!coverVisible
            ? 'Tampa oculta — barras e bornes totalmente expostos.'
            : coverOpen
              ? 'Tampa aberta na dobradiça superior (duplo clique na tampa em 3D fecha).'
              : 'Tampa fechada (IP20). Duplo clique na tampa em 3D abre/fecha; os bornes continuam ligáveis.'}
        </small>
      </div>

      {/* Configuração dos degraus (2P / 3P / 4P) + N.º de bornes por barra */}
      <div className="dc-rail-length space-y-2">
        <label className={fieldLabel}>Barras em escada</label>
        <div className="dc-acc-seg" role="group" aria-label="Número de barras do repartidor em escada">
          {([
            { id: '2P', text: '2P · L1/N' },
            { id: '3P', text: '3P · L1–L3' },
            { id: '4P', text: '4P · 3F+N' },
          ] as const).map((opt) => (
            <button
              key={opt.id}
              type="button"
              aria-pressed={barsMode === opt.id}
              className={barsMode === opt.id ? 'is-on' : ''}
              data-stepped-bars={opt.id}
              onClick={() => applyBarsMode(opt.id)}
            >
              {opt.text}
            </button>
          ))}
        </div>

        <label className={fieldLabel}>Bornes por barra</label>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            className="dc-btn"
            aria-label="Menos um borne por barra"
            disabled={currentCount <= minN}
            onClick={() => applyCount(Math.max(minN, currentCount - 1))}
          >
            −
          </button>
          <input
            type="number"
            min={minN}
            max={maxN}
            step={1}
            className="dc-input w-20 text-center"
            aria-label="Número de bornes por barra"
            data-busbar-pole-input
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value)
              const raw = Number(e.target.value)
              if (e.target.value.trim() !== '' && Number.isInteger(raw) && raw >= minN && raw <= maxN && raw !== currentCount) {
                useSimStore.getState().setBusbarPoleCount(c.id, raw)
              }
            }}
            onBlur={() => applyCount()}
            onKeyDown={(e) => { if (e.key === 'Enter') applyCount() }}
          />
          <button
            type="button"
            className="dc-btn"
            aria-label="Mais um borne por barra"
            disabled={currentCount >= maxN}
            onClick={() => applyCount(Math.min(maxN, currentCount + 1))}
          >
            +
          </button>
          <button
            type="button"
            className={`dc-btn ml-auto${hasChange ? ' dc-btn-primary' : ''}`}
            disabled={!hasChange}
            data-busbar-pole-apply
            onClick={() => applyCount()}
          >
            Aplicar
          </button>
        </div>
        <div className="flex flex-wrap gap-1" role="group" aria-label="Bornes por barra padrão">
          {STEPPED_BUSBAR.presets.map((n) => (
            <button
              key={n}
              type="button"
              aria-pressed={currentCount === n}
              className={`dc-btn !h-7${currentCount === n ? ' dc-btn-primary' : ''}`}
              onClick={() => applyCount(n)}
            >
              {n}
            </button>
          ))}
        </div>
        <small className="text-ink-400">
          {dims.conductors.length} barras ({dims.conductors.join(' · ')}) × {dims.holesPerBar} furos = {totalTerminals} bornes · {Math.round(dims.widthMm)} × {Math.round(dims.heightMm)} × {Math.round(dims.depthMm)} mm
        </small>
      </div>

      {/* Alimentação elétrica */}
      <div className="dc-rail-length space-y-1">
        <label className="flex items-center justify-between gap-2 px-1 py-0.5 rounded hover:bg-slate-50">
          <span className="text-ink-500">Alimentar barras diretamente ({dims.conductors.join('/')})</span>
          <input
            type="checkbox"
            checked={sourceOn}
            data-busbar-source-toggle
            onChange={(e) => useSimStore.getState().setComponentState(c.id, { source: e.target.checked })}
          />
        </label>
        <small className="text-ink-400">
          {sourceOn
            ? `Cada barra fornece diretamente o seu condutor (${dims.conductors.join(', ')}) em todos os ${dims.holesPerBar} bornes.`
            : 'Repartidor passivo real: cada barra é isolada das restantes e distribui a alimentação ligada à sua entrada por todos os seus bornes.'}
        </small>
      </div>
    </div>
  )
}

/** Inspetor dedicado do barramento tipo pente (`busbarComb` — 1P, 1P+N, 3P e 3P+N). */
function CombBusbarInspector({ c }: { c: ElectricalComponent }) {
  const mode = combModeOf(c.state)
  const neutralSide = combNeutralSideOf(c.state)
  const teethDir = combTeethDirectionOf(c.state)
  const brand = combBrandOf(c.state)
  const ratedA = combRatedAOf(c.state)
  const sectionMm2 = combSectionMm2Of(ratedA)
  const endCaps = combEndCapsOf(c.state)
  const feedConn = combFeedConnectorsOf(c.state)
  const connColor = combConnectorColorOf(c.state)
  const phaseColors = combConnectorPhaseColorsOf(c.state)
  const poles = clampCombBusbarPoles(c.state.poleCount)
  const dims = combBusbarDimsOf(c.state)
  const code = combCatalogCodeOf(brand, mode, poles, ratedA)
  const sourceOn = c.state.source === true
  const sourcePhase = typeof c.state.sourcePhase === 'string' ? c.state.sourcePhase : 'L1'

  const components = useSimStore((s) => s.components)
  const mountedBreaker = c.mountedOn ? components.find((comp) => comp.id === c.mountedOn) : null
  const candidateMount = !mountedBreaker ? findCombMountTarget(c, components) : null
  const breakers = components.filter(isBreaker)
  const mountCombBusbar = useSimStore((s) => s.mountCombBusbar)
  const unmountCombBusbar = useSimStore((s) => s.unmountCombBusbar)

  const [draft, setDraft] = useState(String(poles))
  useEffect(() => setDraft(String(poles)), [poles, c.id])

  const patch = (next: Record<string, unknown>) => useSimStore.getState().updateCombBusbar(c.id, next)

  const applyPoles = (n: number) => {
    const clamped = clampCombBusbarPoles(n)
    setDraft(String(clamped))
    if (clamped !== poles) patch({ poleCount: clamped })
  }

  const hasNeutral = mode === '1P+N' || mode === '3P+N'
  const activeModeMeta = COMB_BUSBAR_MODES.find((m) => m.id === mode) ?? COMB_BUSBAR_MODES[0]

  const insertStandaloneConnector = () => {
    const st = useSimStore.getState()
    const nx = Math.round(c.schematicX - 36)
    const ny = Math.round(c.schematicY + (teethDir === 'down' ? c.h + 8 : -58))
    const id = st.addComponent('combBusbarConnector', nx, ny)
    if (id) {
      st.updateCombConnector(id, {
        connectorColor: connColor,
        pinDirection: teethDir === 'down' ? 'up' : 'down',
      })
    }
  }

  return (
    <div className="dc-acc-controls" data-busbar-controls="busbarComb">
      {/* 1. Configuração de polos: Único (1P) · Fase + Neutro (1P+N) · Trifásico (3P) · 3 Fases + N (3P+N) */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className={fieldLabel}>Tipo de barramento (polos)</span>
          <span className="text-[11px] font-medium text-ink-500">{dims.sequence.join(' · ')}</span>
        </div>
        <div className="grid grid-cols-2 gap-1.5" role="group" aria-label="Tipo de barramento pente">
          {COMB_BUSBAR_MODES.map((m) => {
            const active = m.id === mode
            return (
              <button
                key={m.id}
                type="button"
                data-comb-mode={m.id}
                aria-pressed={active}
                onClick={() => patch({ combMode: m.id as CombBusbarMode })}
                className={`rounded-md border px-2.5 py-1.5 text-xs font-medium transition text-left ${
                  active
                    ? 'border-brand-700 bg-brand-600 text-white shadow-xs'
                    : 'border-ink-200 bg-white text-ink-700 hover:bg-surface-100'
                }`}
              >
                {m.short}
              </button>
            )
          })}
        </div>
        <small className="text-ink-400">{activeModeMeta.desc}</small>
      </div>

      {/* Posição do Neutro (em 1P+N e 3P+N) */}
      {hasNeutral && (
        <div className="space-y-1">
          <span className={fieldLabel}>Posição do Neutro (N)</span>
          <div className="grid grid-cols-2 gap-1.5" role="group" aria-label="Posição do neutro">
            {([
              { id: 'right', label: mode === '1P+N' ? 'Direita (L · N)' : 'Direita (L1·L2·L3·N)' },
              { id: 'left', label: mode === '1P+N' ? 'Esquerda (N · L)' : 'Esquerda (N·L1·L2·L3)' },
            ] as const).map((opt) => (
              <button
                key={opt.id}
                type="button"
                aria-pressed={neutralSide === opt.id}
                onClick={() => patch({ neutralSide: opt.id as CombNeutralSide })}
                className={`rounded-md border px-2 py-1.5 text-[11px] font-medium transition ${
                  neutralSide === opt.id
                    ? 'border-brand-700 bg-brand-600 text-white shadow-xs'
                    : 'border-ink-200 bg-white text-ink-700 hover:bg-surface-100'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 2. Número de dentes / módulos (passo 18 mm) */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className={fieldLabel}>N.º de pinos (passo 18 mm)</span>
          <span className="text-[11px] text-ink-400">{Math.round(dims.widthMm)} mm · {poles} mód.</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            className="dc-btn px-2.5"
            aria-label="Menos pinos"
            disabled={poles <= COMB_BUSBAR.minPoles}
            onClick={() => applyPoles(poles - 1)}
          >
            −
          </button>
          <input
            type="number"
            min={COMB_BUSBAR.minPoles}
            max={COMB_BUSBAR.maxPoles}
            step={1}
            value={draft}
            aria-label="Número de pinos do pente"
            data-busbar-pole-input
            className="dc-input text-center font-mono"
            onChange={(e) => {
              const raw = e.target.value
              setDraft(raw)
              const v = Number(raw)
              if (raw.trim() !== '' && Number.isInteger(v) && v >= COMB_BUSBAR.minPoles && v <= COMB_BUSBAR.maxPoles) {
                patch({ poleCount: v })
              }
            }}
            onBlur={() => applyPoles(Number(draft))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                applyPoles(Number(draft))
              }
            }}
          />
          <button
            type="button"
            className="dc-btn px-2.5"
            aria-label="Mais pinos"
            disabled={poles >= COMB_BUSBAR.maxPoles}
            onClick={() => applyPoles(poles + 1)}
          >
            +
          </button>
        </div>
        <div className="flex flex-wrap gap-1">
          {COMB_BUSBAR.presets.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => applyPoles(n)}
              className={`rounded border px-2 py-0.5 text-[11px] font-medium transition ${
                poles === n
                  ? 'border-brand-700 bg-brand-600 text-white shadow-xs'
                  : 'border-ink-200 bg-white text-ink-600 hover:bg-surface-100'
              }`}
            >
              {n}P
            </button>
          ))}
        </div>
      </div>

      {/* 3. Orientação dos pinos e topos isolantes */}
      <div className="space-y-1.5">
        <span className={fieldLabel}>Orientação dos pinos de cobre</span>
        <div className="grid grid-cols-2 gap-1.5" role="group" aria-label="Orientação dos pinos">
          {([
            { id: 'down', label: 'Pinos para baixo' },
            { id: 'up', label: 'Pinos para cima' },
          ] as const).map((opt) => (
            <button
              key={opt.id}
              type="button"
              aria-pressed={teethDir === opt.id}
              onClick={() => patch({ teethDirection: opt.id as CombTeethDirection })}
              className={`rounded-md border px-2.5 py-1.5 text-xs font-medium transition ${
                teethDir === opt.id
                  ? 'border-brand-700 bg-brand-600 text-white shadow-xs'
                  : 'border-ink-200 bg-white text-ink-700 hover:bg-surface-100'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* 4. Serigrafia real (marca), corrente nominal e topos laterais */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className={fieldLabel}>Serigrafia e calibre</span>
          <span className="text-[11px] font-mono text-ink-400">{code}</span>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <label className="space-y-0.5 text-[11px] text-ink-500">
            <span>Marca / serigrafia</span>
            <Select
              className="dc-input text-xs"
              aria-label="Serigrafia do barramento"
              value={brand}
              onChange={(e) => patch({ brandStyle: e.target.value as CombBrandStyle })}
            >
              {COMB_BRAND_STYLES.map((b) => (
                <option key={b.id} value={b.id}>{b.label}</option>
              ))}
            </Select>
          </label>
          <label className="space-y-0.5 text-[11px] text-ink-500">
            <span>Calibre · secção</span>
            <Select
              className="dc-input text-xs"
              aria-label="Calibre nominal do barramento"
              value={ratedA}
              onChange={(e) => patch({ ratedA: Number(e.target.value) as CombRatedA })}
            >
              {COMB_RATED_OPTIONS.map((r) => (
                <option key={r.ratedA} value={r.ratedA}>{r.label}</option>
              ))}
            </Select>
          </label>
        </div>
        <button
          type="button"
          onClick={() => patch({ endCaps: !endCaps })}
          className="dc-btn w-full justify-center gap-1.5 text-xs"
        >
          {endCaps ? <IconEyeOff size={13} /> : <IconEye size={13} />}
          {endCaps ? 'Ocultar topos isolantes laterais' : 'Mostrar topos isolantes laterais'}
        </button>
        <small className="text-ink-400">
          Cobre eletrolítico Cu-ETP {sectionMm2} mm² · {ratedA} A · 230/400 V~ · IEC 60947-7-1.
        </small>
      </div>

      {/* 5. Conectores de alimentação 6–25 mm² (acoplados ou avulsos) + Cor editável */}
      <div className="space-y-2 border-t border-ink-100 pt-2.5">
        <div className="flex items-center justify-between">
          <span className={fieldLabel}>Conectores de alimentação</span>
          <span className="text-[11px] text-ink-400">6–25 mm²</span>
        </div>
        <div className="grid grid-cols-3 gap-1" role="group" aria-label="Conectores acoplados">
          {([
            { id: 'none', label: 'Sem' },
            { id: 'left', label: 'À esquerda' },
            { id: 'right', label: 'À direita' },
          ] as const).map((opt) => (
            <button
              key={opt.id}
              type="button"
              data-comb-feed={opt.id}
              aria-pressed={feedConn === opt.id}
              onClick={() => patch({ feedConnectors: opt.id as CombFeedConnectors })}
              className={`rounded-md border px-2 py-1.5 text-xs font-medium transition ${
                feedConn === opt.id
                  ? 'border-brand-700 bg-brand-600 text-white shadow-xs'
                  : 'border-ink-200 bg-white text-ink-700 hover:bg-surface-100'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {feedConn !== 'none' && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-ink-500">Cor do conector</span>
              {mode !== '1P' && (
                <label className="inline-flex items-center gap-1.5 text-[11px] text-ink-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={phaseColors}
                    onChange={(e) => patch({ connectorPhaseColors: e.target.checked })}
                  />
                  <span>Cores por fase (IEC)</span>
                </label>
              )}
            </div>
            {!phaseColors && (
              <ConnectorColorPicker
                value={connColor}
                onChange={(hex) => patch({ connectorColor: hex, connectorPhaseColors: false })}
              />
            )}
          </div>
        )}

        <button
          type="button"
          data-comb-spawn-connector
          onClick={insertStandaloneConnector}
          className="dc-btn w-full justify-center text-xs"
        >
          + Inserir conector de alimentação avulso
        </button>
      </div>

      {/* 6. Modo elétrico */}
      <div className="space-y-1.5 border-t border-ink-100 pt-2.5">
        <span className={fieldLabel}>Modo elétrico</span>
        <label className="flex items-center justify-between gap-2 text-xs">
          <span className="text-ink-500">Alimentar barramento diretamente</span>
          <input
            type="checkbox"
            checked={sourceOn}
            data-busbar-source-toggle
            onChange={(e) => patch({ source: e.target.checked })}
          />
        </label>
        {sourceOn && mode === '1P' && (
          <label className="flex items-center justify-between gap-2 text-xs">
            <span className="text-ink-500">Potencial fornecido</span>
            <Select
              className="dc-input w-36 text-xs"
              aria-label="Potencial do barramento único"
              value={sourcePhase}
              onChange={(e) => patch({ sourcePhase: e.target.value })}
            >
              <option value="L1">Fase L1 (230 V~)</option>
              <option value="L2">Fase L2 (230 V~)</option>
              <option value="L3">Fase L3 (230 V~)</option>
              <option value="N">Neutro N</option>
              <option value="DC+">+24 V CC</option>
            </Select>
          </label>
        )}
        <small className="text-ink-400">
          {sourceOn
            ? `Cada barra fornece diretamente ${dims.sequence.join(' / ')} a todos os respetivos pinos.`
            : 'Pente passivo real: alimente um pino ou conector (IN) e a corrente reparte-se por todos os pinos dessa barra.'}
        </small>
      </div>

      {/* 7. Encaixe nos bornes dos disjuntores */}
      <div className="space-y-1.5 border-t border-ink-100 pt-2.5">
        <span className={fieldLabel}>Encaixe nos disjuntores</span>
        {mountedBreaker ? (
          <div className="flex items-center justify-between rounded-md border border-emerald-200 bg-emerald-50/70 p-2 text-xs">
            <div className="flex items-center gap-1.5 text-emerald-800">
              <span className="font-medium">Encaixado:</span>
              <span className="font-semibold">{mountedBreaker.label || mountedBreaker.id}</span>
              <span className="text-[11px] text-emerald-600">({mountedBreaker.type})</span>
            </div>
            <button
              type="button"
              onClick={() => unmountCombBusbar(c.id)}
              className="rounded border border-red-200 bg-white px-2 py-0.5 text-[11px] font-medium text-red-700 hover:bg-red-50 cursor-pointer"
            >
              Desencaixar
            </button>
          </div>
        ) : (
          <div className="space-y-1.5">
            {candidateMount ? (
              <div className="flex items-center justify-between rounded-md border border-brand-200 bg-brand-50/60 p-2 text-xs">
                <div className="text-ink-700">
                  <span>Disjuntor detetado: </span>
                  <span className="font-semibold text-brand-700">{candidateMount.breaker.label || candidateMount.breaker.id}</span>
                </div>
                <button
                  type="button"
                  onClick={() => mountCombBusbar(c.id, candidateMount.breaker.id)}
                  className="rounded border border-brand-600 bg-brand-600 px-2.5 py-1 text-xs font-semibold text-white shadow-xs hover:bg-brand-700 cursor-pointer"
                >
                  Encaixar agora
                </button>
              </div>
            ) : breakers.length > 0 ? (
              <div className="flex items-center gap-1.5">
                <Select
                  className="dc-input flex-1 text-xs"
                  aria-label="Selecionar disjuntor para encaixe"
                  value=""
                  onChange={(e) => {
                    if (e.target.value) mountCombBusbar(c.id, e.target.value)
                  }}
                >
                  <option value="">Escolher disjuntor para encaixar...</option>
                  {breakers.map((b) => (
                    <option key={b.id} value={b.id}>{b.label || b.id} ({b.type})</option>
                  ))}
                </Select>
              </div>
            ) : (
              <div className="text-[11px] text-ink-400">
                Nenhum disjuntor no esquema. Adicione disjuntores para encaixar o barramento pente.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/** Inspetor dedicado do conector genérico de alimentação para pente (`combBusbarConnector`). */
function CombConnectorInspector({ c }: { c: ElectricalComponent }) {
  const color = combConnectorColorOf(c.state)
  const pinDir = combConnectorPinDirectionOf(c.state)
  const pinStyle = combConnectorPinStyleOf(c.state)
  const gauge = combConnectorGaugeOf(c.state)
  const gaugeMeta = COMB_CONNECTOR_GAUGES.find((g) => g.id === gauge) ?? COMB_CONNECTOR_GAUGES[1]
  const activeColorName = COMB_CONNECTOR_COLORS.find((sw) => sw.value.toLowerCase() === color.toLowerCase())?.name ?? color.toUpperCase()

  const components = useSimStore((s) => s.components)
  const mountedBreaker = c.mountedOn ? components.find((comp) => comp.id === c.mountedOn) : null
  const candidateMount = !mountedBreaker ? findCombConnectorMountTarget(c, components) : null
  const breakers = components.filter(isBreaker)
  const mountCombConnector = useSimStore((s) => s.mountCombConnector)
  const unmountCombConnector = useSimStore((s) => s.unmountCombConnector)
  const mountedTerminal = (c.state?.mountedTerminal as string) || (mountedBreaker ? breakerInputLabels(mountedBreaker)[0] : '1')

  const patch = (next: Record<string, unknown>) => useSimStore.getState().updateCombConnector(c.id, next)

  return (
    <div className="dc-acc-controls" data-busbar-controls="combBusbarConnector">
      {/* 1. Cor do conector isolante PA66 */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className={fieldLabel}>Cor do conector (PA66)</span>
          <span className="text-[11px] font-medium text-ink-500">{activeColorName}</span>
        </div>
        <ConnectorColorPicker value={color} onChange={(hex) => patch({ connectorColor: hex })} />
        <small className="text-ink-400">
          Escolha branco padrão, azul para Neutro, castanho/preto/cinzento para Fases L1/L2/L3, verde PE ou cor personalizada.
        </small>
      </div>

      {/* 2. Orientação do pino estanhado */}
      <div className="space-y-1.5">
        <span className={fieldLabel}>Orientação do pino estanhado</span>
        <div className="grid grid-cols-2 gap-1.5" role="group" aria-label="Orientação do pino do conector">
          {([
            { id: 'down', label: 'Pino para baixo' },
            { id: 'up', label: 'Pino para cima' },
          ] as const).map((opt) => (
            <button
              key={opt.id}
              type="button"
              aria-pressed={pinDir === opt.id}
              onClick={() => patch({ pinDirection: opt.id as CombTeethDirection })}
              className={`rounded-md border px-2.5 py-1.5 text-xs font-medium transition ${
                pinDir === opt.id
                  ? 'border-brand-700 bg-brand-600 text-white shadow-xs'
                  : 'border-ink-200 bg-white text-ink-700 hover:bg-surface-100'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* 3. Geometria do pino (curvo frontal vs reto) */}
      <div className="space-y-1.5">
        <span className={fieldLabel}>Formato do pino</span>
        <div className="grid grid-cols-2 gap-1.5" role="group" aria-label="Formato do pino">
          {([
            { id: 'cranked', label: 'Frontal (curvo)' },
            { id: 'straight', label: 'Direito (reto)' },
          ] as const).map((opt) => (
            <button
              key={opt.id}
              type="button"
              aria-pressed={pinStyle === opt.id}
              onClick={() => patch({ pinStyle: opt.id as CombConnectorPinStyle })}
              className={`rounded-md border px-2.5 py-1.5 text-xs font-medium transition ${
                pinStyle === opt.id
                  ? 'border-brand-700 bg-brand-600 text-white shadow-xs'
                  : 'border-ink-200 bg-white text-ink-700 hover:bg-surface-100'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* 4. Secção do cabo e corrente nominal (atualiza a gravação no capuz) */}
      <div className="space-y-1">
        <span className={fieldLabel}>Secção admissível e calibre</span>
        <Select
          className="dc-input text-xs"
          aria-label="Secção do conector"
          value={gauge}
          onChange={(e) => patch({ gaugeRange: e.target.value as CombConnectorGauge })}
        >
          {COMB_CONNECTOR_GAUGES.map((g) => (
            <option key={g.id} value={g.id}>{g.label}</option>
          ))}
        </Select>
        <small className="text-ink-400">
          {COMB_CONNECTOR.widthMm} × {COMB_CONNECTOR.heightMm} × {COMB_CONNECTOR.depthMm} mm · {gaugeMeta.ratedA} A · Continuidade real entre IN (bocal Pozidriv) e PINO (lâmina estanhada estriada).
        </small>
      </div>

      {/* 5. Encaixe no borne do disjuntor */}
      <div className="space-y-1.5 border-t border-ink-100 pt-2.5">
        <span className={fieldLabel}>Encaixe no disjuntor</span>
        {mountedBreaker ? (
          <div className="space-y-1.5 rounded-md border border-emerald-200 bg-emerald-50/70 p-2 text-xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-emerald-800">
                <span className="font-medium">Encaixado em:</span>
                <span className="font-semibold">{mountedBreaker.label || mountedBreaker.id}</span>
              </div>
              <button
                type="button"
                onClick={() => unmountCombConnector(c.id)}
                className="rounded border border-red-200 bg-white px-2 py-0.5 text-[11px] font-medium text-red-700 hover:bg-red-50 cursor-pointer"
              >
                Desencaixar
              </button>
            </div>
            <div className="flex items-center gap-2 pt-1 text-[11px]">
              <span className="text-ink-600">Borne de entrada:</span>
              <div className="flex gap-1">
                {breakerInputLabels(mountedBreaker).map((tLabel) => (
                  <button
                    key={tLabel}
                    type="button"
                    onClick={() => mountCombConnector(c.id, mountedBreaker.id, tLabel)}
                    className={`rounded px-2 py-0.5 font-mono text-xs font-bold transition cursor-pointer ${
                      mountedTerminal === tLabel
                        ? 'border border-brand-700 bg-brand-600 text-white'
                        : 'border border-ink-200 bg-white text-ink-700 hover:bg-surface-100'
                    }`}
                  >
                    {tLabel}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-1.5">
            {candidateMount ? (
              <div className="flex items-center justify-between rounded-md border border-brand-200 bg-brand-50/60 p-2 text-xs">
                <div className="text-ink-700">
                  <span>Disjuntor: </span>
                  <span className="font-semibold text-brand-700">{candidateMount.breaker.label || candidateMount.breaker.id}</span>
                  <span className="ml-1 text-[11px] text-ink-500">(Borne {candidateMount.socketLabel})</span>
                </div>
                <button
                  type="button"
                  onClick={() => mountCombConnector(c.id, candidateMount.breaker.id, candidateMount.socketLabel)}
                  className="rounded border border-brand-600 bg-brand-600 px-2.5 py-1 text-xs font-semibold text-white shadow-xs hover:bg-brand-700 cursor-pointer"
                >
                  Encaixar no borne
                </button>
              </div>
            ) : breakers.length > 0 ? (
              <div className="flex items-center gap-1.5">
                <Select
                  className="dc-input flex-1 text-xs"
                  aria-label="Selecionar disjuntor para encaixe do conector"
                  value=""
                  onChange={(e) => {
                    if (e.target.value) mountCombConnector(c.id, e.target.value)
                  }}
                >
                  <option value="">Escolher disjuntor para encaixar...</option>
                  {breakers.map((b) => (
                    <option key={b.id} value={b.id}>{b.label || b.id} ({b.type})</option>
                  ))}
                </Select>
              </div>
            ) : (
              <div className="text-[11px] text-ink-400">
                Nenhum disjuntor no esquema. Adicione disjuntores para encaixar o conector.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function ConnectorColorPicker({ value, onChange }: { value: string; onChange: (hex: string) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Paleta de cores do conector">
      {COMB_CONNECTOR_COLORS.map((sw) => {
        const selected = sw.value.toLowerCase() === value.toLowerCase()
        return (
          <button
            key={sw.value}
            type="button"
            title={sw.name}
            aria-label={sw.name}
            aria-pressed={selected}
            data-connector-swatch={sw.value}
            onClick={() => onChange(sw.value)}
            className={`h-6 w-6 rounded-full border transition ${
              selected ? 'border-ink-900 ring-2 ring-ink-900 ring-offset-1 scale-105' : 'border-ink-300 hover:scale-105'
            }`}
            style={{ backgroundColor: sw.value }}
          />
        )
      })}
      <label
        title="Cor personalizada do conector"
        className="inline-flex items-center gap-1 rounded border border-ink-200 bg-white px-1.5 py-0.5 text-[11px] text-ink-600 cursor-pointer hover:bg-surface-100"
      >
        <input
          type="color"
          aria-label="Cor personalizada do conector"
          data-connector-custom-color
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-4 w-4 cursor-pointer border-0 bg-transparent p-0"
        />
        <span>Outra</span>
      </label>
    </div>
  )
}
