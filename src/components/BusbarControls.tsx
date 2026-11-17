import { useEffect, useState } from 'react'
import type { ElectricalComponent } from '../types'
import { useSimStore } from '../store/useSimStore'
import {
  ACRYLIC_BUSBAR,
  acrylicBusbarColorOf,
  acrylicBusbarDimsOf,
  acrylicCoverVisibleOf,
  clampAcrylicBusbarPoles,
  clampSteppedBusbarHoles,
  isAcrylicBusbarType,
  isSteppedBusbarType,
  PHASE_BUSBAR_ACRYLIC_COLORS,
  STEPPED_BUSBAR,
  steppedBarsModeOf,
  steppedBusbarDimsOf,
  steppedCoverOpenOf,
  steppedCoverVisibleOf,
  type SteppedBarConductors,
} from '../three/busbarParts'
import Select from '../ui/Select'
import { IconEye, IconEyeOff } from '../ui/icons'

/** Chaves de `c.state` geridas diretamente por `BusbarControls` (ocultas na lista genérica do Inspetor). */
export const BUSBAR_STATE_KEYS = new Set([
  'poleCount',
  'acrylicColor',
  'coverOpen',
  'coverVisible',
  'barsMode',
  'source',
  'sourcePhase',
])

const fieldLabel = 'dc-field-label'

export default function BusbarControls({ c }: { c: ElectricalComponent }) {
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
