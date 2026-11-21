import { IconContact } from '../ui/icons'
import { useEffect, useMemo, useState } from 'react'
import InspectorNumberInput from '../ui/InspectorNumberInput'
import type { ElectricalComponent } from '../types'
import { useSimStore } from '../store/useSimStore'
import {
  TERMINAL_BODY_COLORS,
  TERMINAL_STRIP_PRESETS,
  canTerminalHaveJumper,
  describeTerminalStripRefs,
  isTerminalStripType,
  parseTerminalRef,
  planTerminalStripRefs,
  terminalFrontBadge,
  terminalMemberWidthMm,
  terminalStripFor,
  type StripNumberingMode,
} from '../electrical/pti6Strip'
import { groupOf } from '../ui/selectionGroups'

const QUICK_MARKERS = ['L1', 'L2', 'L3', 'N', '+24', '0V', 'U1', 'V1', 'W1'] as const

export default function TerminalStripControls({
  c,
  disabled = false,
  onFocusMember,
}: {
  c: ElectricalComponent
  disabled?: boolean
  onFocusMember?: (id: string) => void
}) {
  const components = useSimStore((s) => s.components)
  const selectionGroups = useSimStore((s) => s.selectionGroups)
  const setPoleCount = useSimStore((s) => s.setTerminalPoleCount)
  const createStrip = useSimStore((s) => s.createTerminalStrip)
  const appendStrip = useSimStore((s) => s.appendToTerminalStrip)
  const applyPreset = useSimStore((s) => s.applyTerminalStripPreset)
  const toggleJumper = useSimStore((s) => s.toggleTerminalJumper)
  const renumberStrip = useSimStore((s) => s.renumberTerminalStrip)
  const setStripGrouped = useSimStore((s) => s.setTerminalStripGrouped)
  const duplicateComponents = useSimStore((s) => s.duplicateComponents)
  const updateComponent = useSimStore((s) => s.updateComponent)
  const setComponentState = useSimStore((s) => s.setComponentState)
  const selectComponents = useSimStore((s) => s.selectComponents)

  const strip = useMemo(() => terminalStripFor(components, c.id), [components, c.id])
  const members = strip?.members ?? [c]
  const inStrip = members.length >= 2

  const [focusedId, setFocusedId] = useState<string>(c.id)
  useEffect(() => {
    if (!members.some((m) => m.id === focusedId)) setFocusedId(c.id)
  }, [c.id, focusedId, members])

  const active = members.find((m) => m.id === focusedId) ?? c
  const lock = disabled || !!active.locked
  const activeIdx = members.findIndex((m) => m.id === active.id)
  const nextMember = activeIdx >= 0 && activeIdx < members.length - 1 ? members[activeIdx + 1] : undefined
  const canJumpRight = !!nextMember && canTerminalHaveJumper(active.type) && canTerminalHaveJumper(nextMember.type)

  const defaultMode: StripNumberingMode = useMemo(
    () => (members.some((m) => parseTerminalRef(m.ref).index === 0) ? 'hier0' : 'hier1'),
    [members],
  )

  const [countDraft, setCountDraft] = useState('4')
  const [numbering, setNumbering] = useState<StripNumberingMode>(defaultMode)
  useEffect(() => { setNumbering(defaultMode) }, [defaultMode, strip?.key])

  const stripCount = Math.max(2, Math.min(48, Math.floor(Number(countDraft)) || 4))
  const validStripCount = countDraft.trim() !== '' && Number.isInteger(Number(countDraft)) && Number(countDraft) >= 2 && Number(countDraft) <= 48
  const poles = Math.max(1, Math.min(48, Math.floor(Number(active.state?.poleCount ?? 1)) || 1))

  const isGrouped = useMemo(() => {
    if (members.length < 2) return false
    const g = groupOf(selectionGroups, 'schematic', members[0].id)
    return !!g && members.every((m) => g.members.includes(m.id))
  }, [selectionGroups, members])

  const totalWidthMm = useMemo(
    () => members.reduce((sum, m) => sum + terminalMemberWidthMm(m), 0),
    [members],
  )
  const railRef = useMemo(
    () => (active.railId ? components.find((x) => x.id === active.railId)?.ref ?? null : null),
    [components, active.railId],
  )

  const otherRefs = useMemo(
    () => components.filter((x) => x.id !== active.id).map((x) => x.ref),
    [components, active.id],
  )
  const preview = useMemo(
    () => describeTerminalStripRefs(
      planTerminalStripRefs(otherRefs, active.ref, stripCount, numbering !== 'loose', numbering === 'hier0' ? 0 : 1),
      5,
    ),
    [otherRefs, active.ref, stripCount, numbering],
  )

  if (!isTerminalStripType(c.type)) return null

  const activeMarker = typeof active.state?.markerText === 'string' ? active.state.markerText : ''
  const autoBadge = terminalFrontBadge({ ...active, state: { ...active.state, markerText: '' } }, inStrip)
  const bridged = active.type === 'terminalPE' ? true : active.state?.bridged !== false
  const activeColor = (active.bodyColor ?? '').toLowerCase()

  const jumperEligibleMembers = members
    .slice(0, -1)
    .filter((m, i) => canTerminalHaveJumper(m.type) && canTerminalHaveJumper(members[i + 1].type))
  const activeJumpersCount = jumperEligibleMembers.filter((m) => !!m.state?.jumperNext).length
  const allJumpered = jumperEligibleMembers.length > 0 && activeJumpersCount === jumperEligibleMembers.length

  const focusMember = (id: string) => {
    setFocusedId(id)
    onFocusMember?.(id)
  }

  const setAllJumpers = (enabled: boolean) => {
    for (const m of jumperEligibleMembers) {
      if (!!m.state?.jumperNext !== enabled) setComponentState(m.id, { jumperNext: enabled })
    }
  }

  return (
    <div className="flex flex-col gap-2.5" data-terminal-strip-controls>
      {/* Cabeçalho resumo da régua */}
      <div className="flex items-center justify-between gap-1.5 flex-wrap">
        <span className="dc-field-label">
          {inStrip ? `Régua ${strip?.headerTag ?? c.ref} · ${members.length} bornes` : 'Construtor de régua de bornes'}
        </span>
        <span className="text-[10.5px] font-mono text-ink-400">
          {`${totalWidthMm.toFixed(1).replace('.', ',')} mm${railRef ? ` · ${railRef}` : ''}`}
        </span>
      </div>

      {/* 1. Mapa interativo da régua: bornes + pontes FBS + agrupamento automático */}
      {inStrip && (
        <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-2 flex flex-col gap-2">
          <div className="flex items-center justify-between gap-1 flex-wrap">
            <span className="text-[11px] font-medium text-slate-700">
              {isGrouped ? 'Grupo automático ativo' : 'Bornes independentes'}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                className="dc-btn text-[11px]"
                disabled={lock}
                onClick={() => duplicateComponents(members.map((m) => m.id))}
                title="Duplica toda a régua encostada na mesma calha com novo prefixo (ex.: X1 → X2)"
              >
                Duplicar régua
              </button>
              <button
                type="button"
                className={`dc-btn text-[11px] ${!isGrouped ? 'dc-btn-primary' : ''}`}
                disabled={lock}
                onClick={() => setStripGrouped(active.id, !isGrouped)}
                title={isGrouped ? 'Desagrupa para mover bornes em separado' : 'Agrupa todos os bornes da régua'}
              >
                {isGrouped ? 'Desagrupar' : 'Agrupar'}
              </button>
            </div>
          </div>

          {/* Tira física de bornes + pontes FBS vermelhas clicáveis */}
          <div className="flex items-center flex-wrap gap-y-1.5 gap-x-0.5" role="list" aria-label="Mapa de bornes da régua">
            {members.map((m, i) => {
              const isCurrent = m.id === active.id
              const badge = terminalFrontBadge(m, true)
              const isPe = m.type === 'terminalPE'
              const isOpen = !isPe && m.state?.bridged === false
              const next = members[i + 1]
              const hasBridgeSlot = !!next && canTerminalHaveJumper(m.type) && canTerminalHaveJumper(next.type)
              const bridgedNext = hasBridgeSlot && !!m.state?.jumperNext
              const swatch = isPe ? '#16a34a' : m.bodyColor || '#94a3b8'
              return (
                <div key={m.id} className="inline-flex items-center" role="listitem">
                  <button
                    type="button"
                    data-sweep-skip="true"
                    onClick={() => focusMember(m.id)}
                    title={`${m.ref} · plaqueta «${badge}»${isOpen ? ' · Seccionado (aberto)' : ''}`}
                    className={`inline-flex flex-col items-center justify-center min-w-[27px] h-9 px-1 rounded border text-[10px] font-bold transition ${
                      isCurrent
                        ? 'bg-white border-blue-600 text-slate-900 shadow-sm ring-1 ring-blue-500/30'
                        : 'bg-white border-slate-300 text-slate-700 hover:border-slate-400'
                    }`}
                  >
                    <span
                      className="w-full h-1 rounded-full mb-0.5"
                      style={{
                        background: isPe
                          ? 'linear-gradient(90deg,#16a34a 0%,#16a34a 48%,#facc15 48%,#facc15 100%)'
                          : swatch,
                      }}
                    />
                    <span className="font-mono leading-none truncate max-w-[32px]">{badge}</span>
                    {isOpen && <span className="text-[8px] leading-none text-orange-600 font-bold mt-0.5"><IconContact size={8} title="Seccionador aberto" /></span>}
                  </button>
                  {hasBridgeSlot && (
                    <button
                      type="button"
                      disabled={lock}
                      aria-label={bridgedNext ? `Remover ponte FBS ${m.ref}-${next.ref}` : `Ligar ponte FBS ${m.ref}-${next.ref}`}
                      onClick={() => toggleJumper(m.id)}
                      title={bridgedNext
                        ? `Remover ponte FBS entre ${m.ref} e ${next.ref}`
                        : `Ligar ponte FBS vermelha entre ${m.ref} e ${next.ref}`}
                      className={`w-3.5 h-5 inline-flex items-center justify-center rounded text-[9px] font-black transition ${
                        bridgedNext
                          ? 'bg-red-600 text-white hover:bg-red-700'
                          : 'text-slate-400 hover:text-red-600 hover:bg-red-50'
                      }`}
                    >
                      {bridgedNext ? '═' : '·'}
                    </button>
                  )}
                </div>
              )
            })}
          </div>

          <div className="flex items-center justify-between gap-1 flex-wrap">
            {jumperEligibleMembers.length > 0 && (
              <button
                type="button"
                className="dc-btn text-[10.5px]"
                disabled={lock}
                onClick={() => setAllJumpers(!allJumpered)}
                title="Liga ou remove a ponte FBS em todos os bornes adjacentes (exceto PE)"
              >
                {allJumpered ? 'Limpar pontes FBS' : 'Pontear todos (FBS)'}
              </button>
            )}
            <button
              type="button"
              className="dc-btn text-[10.5px] ml-auto"
              disabled={lock}
              onClick={() => renumberStrip(active.id, defaultMode === 'hier1' ? 'hier0' : 'hier1')}
              title={`Renumerar régua para ${strip?.prefix ?? 'X1'}.${defaultMode === 'hier1' ? '0' : '1'}…`}
            >
              {`Renumerar .${defaultMode === 'hier1' ? '0' : '1'}…`}
            </button>
          </div>
        </div>
      )}

      {/* 2. Duplicar / acrescentar bornes à direita num clique */}
      <div className="flex flex-col gap-1">
        <span className="dc-field-label">Acrescentar bornes (mesma calha e grupo)</span>
        <div className="grid grid-cols-4 gap-1">
          <button
            type="button"
            className="dc-btn dc-btn-primary text-[11px] justify-center"
            disabled={lock}
            onClick={() => appendStrip(active.id, [{
              type: 'terminalPhoenixPti6',
              label: 'Borne passagem PTI 6',
              bodyColor: active.type === 'terminalPE' ? undefined : active.bodyColor,
            }], { numbering })}
            title="Acrescenta 1 borne encostado à direita no mesmo grupo (atalho Ctrl+D)"
          >
            +1 Borne
          </button>
          <button
            type="button"
            className="dc-btn text-[11px] justify-center"
            disabled={lock}
            onClick={() => appendStrip(active.id, [{
              type: 'terminalPhoenixPti6',
              label: 'Borne neutro N',
              markerText: 'N',
              bodyColor: '#2563eb',
            }], { numbering })}
            title="Acrescenta 1 borne azul de Neutro (N)"
          >
            +N
          </button>
          <button
            type="button"
            className="dc-btn text-[11px] justify-center"
            disabled={lock}
            onClick={() => appendStrip(active.id, [{
              type: 'terminalPE',
              label: 'Borne terra PE',
              suffix: 'PE',
              markerText: 'PE',
            }], { numbering })}
            title="Acrescenta 1 borne verde-amarelo de proteção PE"
          >
            +PE
          </button>
          <button
            type="button"
            className="dc-btn text-[11px] justify-center"
            disabled={lock}
            onClick={() => {
              appendStrip(
                active.id,
                Array.from({ length: 4 }, () => ({
                  type: 'terminalPhoenixPti6' as const,
                  label: 'Borne passagem PTI 6',
                  bodyColor: active.type === 'terminalPE' ? undefined : active.bodyColor,
                })),
                { numbering },
              )
            }}
            title="Acrescenta 4 bornes seguidos à régua"
          >
            +4
          </button>
        </div>
      </div>

      {/* 3. Kits rápidos normalizados IEC (1 clique) */}
      <div className="flex flex-col gap-1">
        <span className="dc-field-label">Kits rápidos de régua (IEC)</span>
        <div className="grid grid-cols-2 gap-1">
          {TERMINAL_STRIP_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              disabled={lock}
              onClick={() => applyPreset(active.id, preset.id)}
              title={`${preset.title} — ${preset.hint}`}
              className="flex flex-col items-start rounded-md border border-slate-200 bg-white px-2 py-1.5 text-left transition hover:border-blue-400 hover:bg-blue-50/40 disabled:opacity-50 min-w-0"
            >
              <span className="text-[11px] font-semibold text-slate-800 leading-tight truncate w-full">{preset.title}</span>
              <span className="text-[9.5px] text-slate-500 font-mono leading-tight truncate w-full">{preset.hint}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 4. Gerar N bornes à medida */}
      <div className="flex flex-col gap-1.5">
        <span className="dc-field-label">Gerar régua à medida</span>
        <div className="flex items-center gap-1.5">
          <input
            type="number"
            min={2}
            max={48}
            step={1}
            data-sweep-draft="true"
            disabled={lock}
            value={countDraft}
            aria-invalid={!validStripCount || undefined}
            aria-describedby={!validStripCount ? 'strip-count-error' : undefined}
            onChange={(e) => setCountDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setCountDraft('4') }
              if (e.key === 'Enter' && validStripCount) createStrip(active.id, stripCount, { hierarchical: numbering !== 'loose', startIndex: numbering === 'hier0' ? 0 : 1 })
            }}
            aria-label="Quantidade de bornes a gerar"
            className="dc-input w-16 text-center font-mono"
          />
          <button
            type="button"
            className="dc-btn flex-1 justify-center"
            disabled={lock || !validStripCount}
            onClick={() => createStrip(active.id, stripCount, { hierarchical: numbering !== 'loose', startIndex: numbering === 'hier0' ? 0 : 1 })}
          >
            {`Gerar ${stripCount} bornes`}
          </button>
        </div>
        {!validStripCount && <small id="strip-count-error" className="dc-inspector-number-error" role="status">Introduza um número inteiro entre 2 e 48.</small>}
        <div className="grid grid-cols-3 gap-1" role="group" aria-label="Modo de numeração">
          {([
            ['hier1', 'X1.1…'],
            ['hier0', 'X1.0…'],
            ['loose', 'X1, X2…'],
          ] as const).map(([mode, lbl]) => (
            <button
              key={mode}
              type="button"
              data-sweep-skip="true"
              disabled={lock}
              aria-pressed={numbering === mode}
              onClick={() => setNumbering(mode)}
              className={`dc-btn text-[10.5px] justify-center font-mono ${numbering === mode ? 'dc-btn-primary' : ''}`}
            >
              {lbl}
            </button>
          ))}
        </div>
        <small className="text-ink-400 font-mono text-[10px] truncate" title={preview}>
          {`TAGs: ${preview}`}
        </small>
      </div>

      {/* 5. Borne em foco: plaqueta frontal ZB 8, cor PA66, seccionamento e ponte FBS */}
      <div className="rounded-lg border border-slate-200 bg-white p-2 flex flex-col gap-2">
        <div className="flex items-center justify-between gap-1">
          <span className="text-[11px] font-semibold text-slate-800">
            Borne <span className="font-mono">{active.ref}</span>
          </span>
          {inStrip && (
            <button
              type="button"
              data-sweep-skip="true"
              disabled={lock}
              onClick={() => selectComponents([active.id])}
              className="text-[10px] font-mono text-blue-600 hover:underline disabled:opacity-50"
              title="Posição na régua"
            >
              {`${activeIdx + 1}/${members.length}`}
            </button>
          )}
        </div>

        <label className="flex flex-col gap-1">
          <span className="dc-field-label">{`Plaqueta frontal ZB (auto: ${autoBadge})`}</span>
          <input
            type="text"
            maxLength={5}
            disabled={lock}
            value={activeMarker}
            placeholder={autoBadge}
            aria-label="Plaqueta frontal do borne"
            onChange={(e) => setComponentState(active.id, { markerText: e.target.value })}
            className="dc-input font-mono"
          />
        </label>

        {active.type !== 'terminalPE' && (
          <div className="flex flex-wrap gap-1">
            {QUICK_MARKERS.map((mk) => (
              <button
                key={mk}
                type="button"
                disabled={lock}
                onClick={() => setComponentState(active.id, { markerText: activeMarker === mk ? '' : mk })}
                className={`px-1.5 py-0.5 rounded text-[10px] font-mono border transition ${
                  activeMarker === mk
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:border-slate-300'
                }`}
              >
                {mk}
              </button>
            ))}
          </div>
        )}

        {active.type !== 'terminalPE' && (
          <div className="flex flex-col gap-1">
            <span className="dc-field-label">Cor do corpo PA66</span>
            <div className="flex flex-wrap gap-1.5">
              {TERMINAL_BODY_COLORS.map((sw) => {
                const isDefault = sw.id === 'ut-grey'
                const targetColor = isDefault ? undefined : sw.value
                const selected = isDefault ? !activeColor : activeColor === sw.value.toLowerCase()
                return (
                  <button
                    key={sw.id}
                    type="button"
                    disabled={lock}
                    onClick={() => updateComponent(active.id, { bodyColor: targetColor })}
                    title={sw.name}
                    aria-label={`Cor do borne ${sw.name}`}
                    className={`w-5 h-5 rounded-full border transition ${
                      selected ? 'ring-2 ring-blue-600 ring-offset-1 border-white' : 'border-slate-300 hover:scale-105'
                    }`}
                    style={{ background: sw.value }}
                  />
                )
              })}
            </div>
          </div>
        )}

        {active.type !== 'terminalPE' && (
          <div className="flex flex-col gap-1">
            <span className="dc-field-label">Faca de seccionamento</span>
            <div className="grid grid-cols-2 gap-1">
              <button
                type="button"
                disabled={lock}
                aria-pressed={bridged}
                onClick={() => setComponentState(active.id, { bridged: true })}
                className={`dc-btn text-[11px] justify-center ${bridged ? 'dc-btn-primary' : ''}`}
              >
                Passagem
              </button>
              <button
                type="button"
                disabled={lock}
                aria-pressed={!bridged}
                onClick={() => setComponentState(active.id, { bridged: false })}
                className={`dc-btn text-[11px] justify-center ${!bridged ? 'dc-btn-primary' : ''}`}
              >
                Seccionado
              </button>
            </div>
          </div>
        )}

        {canJumpRight && nextMember && (
          <div className="flex flex-col gap-1">
            <span className="dc-field-label">{`Ponte FBS → ${nextMember.ref}`}</span>
            <button
              type="button"
              disabled={lock}
              aria-pressed={!!active.state?.jumperNext}
              onClick={() => toggleJumper(active.id)}
              className={`dc-btn text-[11px] justify-center ${active.state?.jumperNext ? 'dc-btn-primary' : ''}`}
            >
              {active.state?.jumperNext ? `Ponte FBS ligada (${active.ref} ═ ${nextMember.ref})` : `Ligar ponte FBS a ${nextMember.ref}`}
            </button>
          </div>
        )}
      </div>

      {/* 6. Bloco compacto multi-pólo (PTI 6 num único símbolo) */}
      {active.type === 'terminalPhoenixPti6' && !inStrip && (
        <details className="rounded-md border border-slate-200 bg-slate-50/70 px-2 py-1.5">
          <summary className="cursor-pointer text-[11px] font-medium text-slate-600 select-none">
            {`Bloco compacto multi-pólo (${poles}P · ${(poles * 8.15).toFixed(1).replace('.', ',')} mm)`}
          </summary>
          <div className="mt-2 flex flex-col gap-2">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                className="dc-btn"
                disabled={lock || poles <= 1}
                onClick={() => setPoleCount(active.id, poles - 1)}
                aria-label="Menos um pólo"
              >
                −
              </button>
              <InspectorNumberInput
                type="number"
                min={1}
                max={24}
                step={1}
                disabled={lock}
                integer resetKey={active.id} value={poles}
                onChange={(e) => setPoleCount(active.id, Number(e.target.value))}
                aria-label="Número de pólos do bloco PTI 6"
                className="dc-input w-16 text-center font-mono"
              />
              <button
                type="button"
                className="dc-btn"
                disabled={lock || poles >= 24}
                onClick={() => setPoleCount(active.id, poles + 1)}
                aria-label="Mais um pólo"
              >
                +
              </button>
            </div>
            {poles >= 2 && (
              <div className="grid grid-cols-2 gap-1">
                <button
                  type="button"
                  disabled={lock}
                  aria-pressed={!active.state?.combJumper}
                  onClick={() => setComponentState(active.id, { combJumper: false })}
                  className={`dc-btn text-[10.5px] justify-center ${!active.state?.combJumper ? 'dc-btn-primary' : ''}`}
                >
                  Pólos isolados
                </button>
                <button
                  type="button"
                  disabled={lock}
                  aria-pressed={!!active.state?.combJumper}
                  onClick={() => setComponentState(active.id, { combJumper: true })}
                  className={`dc-btn text-[10.5px] justify-center ${active.state?.combJumper ? 'dc-btn-primary' : ''}`}
                >
                  Pente FBS comum
                </button>
              </div>
            )}
          </div>
        </details>
      )}
    </div>
  )
}
