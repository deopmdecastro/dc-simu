import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { transitionsOf } from './engine'
import GrafcetEditor from './GrafcetEditor'
import {
  computeLiveUnitStatuses,
  formatLiveStepCode,
  pickVisibleLiveUnits,
  resolveLiveGrafcetUnits,
} from './liveFollow'
import { useSimStore } from '../store/useSimStore'
import { IconClose, IconFocus, IconGrafcet, IconOpen } from '../ui/icons'

/**
 * Monitorização ao vivo do(s) GRAFCET(s) no painel de Propriedades (Esquema 2D, 3D Realista e Esquema IEC),
 * tanto na coluna lateral (PC/tablet) como na gaveta inferior do telemóvel:
 * - Acompanha automaticamente a(s) etapa(s) ativa(s) à medida que as transições disparam;
 * - Quando dois GRAFCETs estão ativos em simultâneo, apresenta-os lado a lado;
 * - Oferece ação direta para abrir o GRAFCET completo (na vista GRAFCET ou em folha ampliada).
 */
export default function GrafcetLiveDock({ onOpenEditor }: { onOpenEditor?: () => void }) {
  const demoMode = useSimStore((s) => s.demoMode)
  const program = useSimStore((s) => s.grafcet)
  const active = useSimStore((s) => s.grafcetRuntime.active)
  const runState = useSimStore((s) => s.sim.runState)
  const setGrafcet = useSimStore((s) => s.setGrafcet)

  const [autoFollow, setAutoFollow] = useState(true)
  const [manualPanned, setManualPanned] = useState(false)
  const [recenterSeq, setRecenterSeq] = useState(0)
  const [pinnedUnitId, setPinnedUnitId] = useState<string | null>(null)
  const [fullModalChartId, setFullModalChartId] = useState<string | null>(null)
  const [fullModalOpen, setFullModalOpen] = useState(false)

  // Regista a ordem temporal de mudança de etapas ativas por GRAFCET para destacar os 2 em evolução.
  const changeCounterRef = useRef(0)
  const prevSigByUnitRef = useRef<Map<string, string>>(new Map())
  const seqByUnitRef = useRef<Map<string, number>>(new Map())

  const units = useMemo(() => resolveLiveGrafcetUnits(program), [program])
  const activeKey = active.join('|')

  // Limpa fixação manual se o GRAFCET fixado deixar de existir.
  useEffect(() => {
    if (pinnedUnitId && !units.some((u) => u.id === pinnedUnitId)) {
      setPinnedUnitId(null)
    }
  }, [units, pinnedUnitId])

  // Sempre que as etapas ativas mudam globalmente, retoma o indicador de seguimento automático.
  const lastActiveKeyRef = useRef(activeKey)
  useEffect(() => {
    if (lastActiveKeyRef.current !== activeKey) {
      lastActiveKeyRef.current = activeKey
      if (autoFollow) setManualPanned(false)
    }
  }, [activeKey, autoFollow])

  const statuses = useMemo(() => {
    const activeSet = new Set(active)
    const liveUnitIds = new Set(units.map((u) => u.id))
    for (const key of prevSigByUnitRef.current.keys()) {
      if (!liveUnitIds.has(key)) {
        prevSigByUnitRef.current.delete(key)
        seqByUnitRef.current.delete(key)
      }
    }
    for (const unit of units) {
      const sig = unit.allStepIds.filter((id) => activeSet.has(id)).join(',')
      const prev = prevSigByUnitRef.current.get(unit.id)
      if (prev !== undefined && prev !== sig) {
        changeCounterRef.current += 1
        seqByUnitRef.current.set(unit.id, changeCounterRef.current)
      }
      prevSigByUnitRef.current.set(unit.id, sig)
    }
    return computeLiveUnitStatuses(program, units, active, seqByUnitRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [program, units, activeKey])

  const visible = useMemo(
    () =>
      pickVisibleLiveUnits(statuses, {
        pinnedUnitId,
        preferredChartId: program.activeChart ?? program.charts?.[0]?.id,
        maxPanes: 2,
      }),
    [statuses, pinnedUnitId, program.activeChart, program.charts],
  )

  // Fecha a folha de GRAFCET completo com Escape.
  useEffect(() => {
    if (!fullModalOpen) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setFullModalOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [fullModalOpen])

  const totalSteps = program.steps.length
  const totalTransitions = useMemo(() => transitionsOf(program).length, [program])
  const activeUnits = useMemo(() => statuses.filter((s) => s.isActive), [statuses])
  const allActiveCodes = useMemo(() => {
    return active
      .map((id) => {
        const idx = program.steps.findIndex((s) => s.id === id)
        return idx < 0 ? null : formatLiveStepCode(program.steps[idx], idx)
      })
      .filter(Boolean) as string[]
  }, [active, program.steps])

  const isDual = visible.length === 2
  const multiUnits = units.length > 1
  const primaryStatus = visible[0]
  const programTitle = (program.name || '').trim() || 'GRAFCET'

  const openFullGrafcet = (chartId?: string) => {
    const targetChart = chartId ?? primaryStatus?.unit.chartId ?? program.activeChart ?? program.charts?.[0]?.id
    if (targetChart && (program.charts?.length ?? 0) > 1 && targetChart !== program.activeChart) {
      setGrafcet({ ...program, activeChart: targetChart }, 'skip', 'grafcet:pages:switch')
    }
    if (onOpenEditor) {
      onOpenEditor()
      return
    }
    setFullModalChartId(targetChart ?? null)
    setFullModalOpen(true)
  }

  const handleFollowAction = () => {
    if (autoFollow && manualPanned) {
      setManualPanned(false)
      setRecenterSeq((n) => n + 1)
      return
    }
    const next = !autoFollow
    setAutoFollow(next)
    setManualPanned(false)
    setRecenterSeq((n) => n + 1)
  }

  const recenterOnActive = () => {
    setAutoFollow(true)
    setManualPanned(false)
    setRecenterSeq((n) => n + 1)
  }

  const subtitle = !totalSteps
    ? 'Sem etapas definidas'
    : activeUnits.length >= 2
      ? `${activeUnits.length} GRAFCETs ativos · ${allActiveCodes.length} etapas`
      : `${totalSteps} ${totalSteps === 1 ? 'etapa' : 'etapas'} · ${totalTransitions} ${totalTransitions === 1 ? 'transição' : 'transições'} · ${allActiveCodes.length} ${allActiveCodes.length === 1 ? 'ativa' : 'ativas'}`

  const stateLabel = runState === 'running' ? 'Simulação ativa' : runState === 'paused' ? 'Em pausa' : 'Parado'
  const stateClass = runState === 'running' ? 'is-running' : runState === 'paused' ? 'is-paused' : 'is-stopped'

  const singleComment = !isDual && visible[0]?.activeStepIds.length === 1 ? visible[0].activeComment : ''

  return (
    <div
      className={`grafcet-live-dock${isDual ? ' is-dual' : ''}${multiUnits ? ' is-multi' : ''}`}
      data-grafcet-live-dock
      data-grafcet-panes={visible.length}
    >
      <header className="grafcet-header grafcet-live-head">
        <div className="grafcet-title grafcet-live-title">
          <strong title={programTitle}>{programTitle}</strong>
          <small>{subtitle}</small>
        </div>
        {!demoMode && (
          <button
            type="button"
            className="dc-btn-primary dc-btn grafcet-live-open-btn"
            onClick={() => openFullGrafcet()}
            title="Abrir o GRAFCET completo"
            aria-label="Abrir GRAFCET completo"
            data-open-full-grafcet
          >
            <IconOpen size={13} />
            <span className="grafcet-live-open-full">GRAFCET completo</span>
            <span className="grafcet-live-open-short">Completo</span>
          </button>
        )}
      </header>

      {multiUnits && totalSteps > 0 && (
        <div className="grafcet-live-strip" role="tablist" aria-label="GRAFCETs em execução">
          <button
            type="button"
            role="tab"
            aria-selected={pinnedUnitId === null}
            className={`grafcet-live-chip${pinnedUnitId === null ? ' is-selected' : ''}`}
            onClick={() => {
              setPinnedUnitId(null)
              recenterOnActive()
            }}
            title="Mostrar automaticamente o GRAFCET ativo (ou dois lado a lado quando correm em simultâneo)"
            data-grafcet-chip="auto"
          >
            <span>Auto</span>
            {activeUnits.length >= 2 && <em>2</em>}
          </button>
          {statuses.map((st) => {
            const selected = pinnedUnitId === st.unit.id
            const inAutoView = pinnedUnitId === null && visible.some((v) => v.unit.id === st.unit.id) && st.isActive
            return (
              <button
                key={st.unit.id}
                type="button"
                role="tab"
                aria-selected={selected}
                className={`grafcet-live-chip${selected ? ' is-selected' : ''}${st.isActive ? ' is-active' : ''}${inAutoView ? ' is-shown' : ''}`}
                onClick={() => {
                  setPinnedUnitId((cur) => (cur === st.unit.id ? null : st.unit.id))
                  recenterOnActive()
                }}
                title={`${st.unit.key} — ${st.unit.title}${st.activeLabels.length ? ` (ativa: ${st.activeLabels.join(', ')})` : ' (sem etapa ativa)'}`}
                data-grafcet-chip={st.unit.key}
              >
                <span className="grafcet-live-chip-key">{st.unit.key}</span>
                {st.activeLabels.length > 0 && (
                  <b className="grafcet-live-chip-step">
                    {st.activeLabels[0]}
                    {st.activeLabels.length > 1 ? `+${st.activeLabels.length - 1}` : ''}
                  </b>
                )}
              </button>
            )
          })}
        </div>
      )}

      <div className="grafcet-live-stage">
        {!totalSteps ? (
          <div className="grafcet-empty grafcet-live-empty">
            <span className="grafcet-empty-icon" aria-hidden="true">
              <IconGrafcet size={24} />
            </span>
            <strong>Ainda não há etapas</strong>
            <p>Abra o GRAFCET completo para criar ou importar a sequência.</p>
          </div>
        ) : (
          <div className={`grafcet-live-grid ${isDual ? 'is-dual' : 'is-single'}`}>
            {visible.map((st) => (
              <section
                key={st.unit.id}
                className={`grafcet-live-pane${st.isActive ? ' is-active' : ''}`}
                aria-label={`${st.unit.key} ${st.unit.title}`}
                data-grafcet-pane={st.unit.key}
              >
                {(isDual || multiUnits) && (
                  <div className="grafcet-live-pane-head">
                    <span className="grafcet-live-pane-id" title={`${st.unit.key} — ${st.unit.title}`}>
                      <b className="grafcet-live-pane-code">{st.unit.key}</b>
                      <span className="grafcet-live-pane-name">{st.unit.title}</span>
                    </span>
                    <span className="grafcet-live-pane-right">
                      {st.activeLabels.length > 0 ? (
                        <button
                          type="button"
                          className="grafcet-live-step-badge"
                          onClick={recenterOnActive}
                          title={`Centrar em ${st.activeLabels.join(', ')}${st.activeComment ? ` — ${st.activeComment}` : ''}`}
                          data-pane-active-step={st.activeLabels.join(',')}
                        >
                          {st.activeLabels.slice(0, 2).join(', ')}
                          {st.activeLabels.length > 2 ? ` +${st.activeLabels.length - 2}` : ''}
                        </button>
                      ) : (
                        <span className="grafcet-live-step-idle">inativo</span>
                      )}
                      {!demoMode && isDual && (
                        <button
                          type="button"
                          className="grafcet-live-pane-open"
                          onClick={() => openFullGrafcet(st.unit.chartId)}
                          title={`Abrir ${st.unit.key} (${st.unit.title}) no GRAFCET completo`}
                          aria-label={`Abrir ${st.unit.key} no GRAFCET completo`}
                        >
                          <IconOpen size={11} />
                        </button>
                      )}
                    </span>
                  </div>
                )}
                <div className="grafcet-live-pane-canvas">
                  <GrafcetEditor
                    full={false}
                    hidePreviewChrome
                    hideAnnotations
                    splitCompact={isDual}
                    lockedChartId={st.unit.chartId}
                    subsetStepIds={st.unit.stepIds}
                    followStepIds={st.focusStepIds}
                    autoFollow={autoFollow}
                    recenterSeq={recenterSeq}
                    onManualView={() => setManualPanned(true)}
                  />
                </div>
              </section>
            ))}
          </div>
        )}
      </div>

      {totalSteps > 0 && (
        <div className="grafcet-preview-status grafcet-live-foot" role="status">
          <span className={`grafcet-live-run ${stateClass}`}>
            <i className="grafcet-live-dot" aria-hidden="true" />
            {stateLabel}
          </span>
          <span className="grafcet-live-active-summary" data-live-active-steps={allActiveCodes.join(',')}>
            {allActiveCodes.length > 0 ? (
              <>
                <span className="grafcet-live-active-label">
                  {allActiveCodes.length === 1 ? 'Etapa' : 'Ativas'}:
                </span>{' '}
                <button
                  type="button"
                  className="grafcet-live-step-badge"
                  onClick={recenterOnActive}
                  title="Centrar na etapa ativa"
                >
                  {allActiveCodes.slice(0, 3).join(', ')}
                  {allActiveCodes.length > 3 ? ` +${allActiveCodes.length - 3}` : ''}
                </button>
                {singleComment && <em className="grafcet-live-step-comment">{singleComment}</em>}
              </>
            ) : (
              <span className="grafcet-live-none">Sem etapa ativa</span>
            )}
          </span>
          <button
            type="button"
            className={`grafcet-live-follow-btn${autoFollow && !manualPanned ? ' is-following' : ''}`}
            aria-pressed={autoFollow && !manualPanned}
            onClick={handleFollowAction}
            title={
              autoFollow && manualPanned
                ? 'Voltar a centrar na etapa ativa'
                : autoFollow
                  ? 'A seguir a etapa ativa automaticamente — clique para enquadrar o diagrama todo'
                  : 'Ativar acompanhamento automático da etapa ativa'
            }
            data-grafcet-follow-toggle
          >
            <IconFocus size={11} />
            <span>{autoFollow && manualPanned ? 'Centrar' : autoFollow ? 'A seguir' : 'Ver tudo'}</span>
          </button>
        </div>
      )}

      {fullModalOpen && typeof document !== 'undefined' && createPortal(
        <div
          className="grafcet-preview-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label={`GRAFCET completo — ${programTitle}`}
          onClick={(e) => {
            if (e.target === e.currentTarget) setFullModalOpen(false)
          }}
        >
          <div className="grafcet-preview-dialog grafcet-live-modal">
            <div className="grafcet-preview-header">
              <div>
                <h2>{programTitle}</h2>
                <p>{subtitle}</p>
              </div>
              <div className="grafcet-live-modal-actions">
                {(program.charts?.length ?? 0) > 1 && (
                  <select
                    className="dc-select"
                    aria-label="Página do GRAFCET"
                    value={fullModalChartId ?? program.charts?.[0]?.id ?? ''}
                    onChange={(e) => setFullModalChartId(e.target.value)}
                  >
                    {(program.charts ?? []).map((c, idx) => (
                      <option key={c.id} value={c.id}>
                        {c.title || c.name || `G${idx}`}
                      </option>
                    ))}
                  </select>
                )}
                <button
                  type="button"
                  className="grafcet-preview-close"
                  onClick={() => setFullModalOpen(false)}
                  aria-label="Fechar GRAFCET completo"
                >
                  <IconClose size={13} />
                  Fechar
                </button>
              </div>
            </div>
            <div className="grafcet-preview-frame grafcet-live-modal-frame">
              <GrafcetEditor
                full={false}
                hidePreviewChrome
                lockedChartId={fullModalChartId ?? undefined}
                autoFollow={false}
              />
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}
