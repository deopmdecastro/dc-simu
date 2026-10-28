import { useMemo, useRef, useState, useCallback, type PointerEvent as ReactPointerEvent } from 'react'
import { IconPlay } from '../ui/icons'
import { SPINE_X, START_Y, STEP_H } from '../grafcet/layout'
import type { GrafcetStep } from '../grafcet/engine'
import { buildNativeGrafcet, NATIVE_PARTIDA_NAME } from '../project/nativeProjects'
import '../styles/grafcet-editor.css'

type Props = {
  plcRunning: boolean
  motorOn: boolean
  onRunPlc: () => void
  onStopPlc: () => void
  onStartMotor: () => void
  onStopMotor: () => void
  program?: import('../grafcet/engine').GrafcetProgram
  projectName?: string
}

/**
 * Vista GRAFCET da landing: layout e caixas iguais ao editor (autoLayout + classes
 * grafcet-*), com pan (move) por arrasto e zoom. A etapa ativa segue o estado
 * partilhado com Ladder/3D.
 */
export default function LandingGrafcetDemo({
  plcRunning,
  motorOn,
  onRunPlc,
  onStopPlc,
  onStartMotor,
  onStopMotor,
  program: programProp,
  projectName,
}: Props) {
  const program = useMemo(() => programProp ?? buildNativeGrafcet(), [programProp])
  const initialStep = program.steps.find((step) => step.initial || step.stepType === 'initial')?.id
  const runStep = program.steps.find((step) => !step.initial && step.stepType !== 'initial')?.id
  const activeStepId = !plcRunning ? null : motorOn ? (runStep ?? null) : (initialStep ?? null)
  const [pan, setPan] = useState({ x: 20, y: 12 })
  const [scale, setScale] = useState(1)
  const drag = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null)

  const onPointerDown = useCallback((event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) return
    drag.current = { x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y }
    event.currentTarget.setPointerCapture(event.pointerId)
  }, [pan.x, pan.y])

  const onPointerMove = useCallback((event: ReactPointerEvent<SVGSVGElement>) => {
    if (!drag.current) return
    setPan({
      x: drag.current.panX + (event.clientX - drag.current.x),
      y: drag.current.panY + (event.clientY - drag.current.y),
    })
  }, [])

  const onPointerUp = useCallback((event: ReactPointerEvent<SVGSVGElement>) => {
    drag.current = null
    try { event.currentTarget.releasePointerCapture(event.pointerId) } catch { /* noop */ }
  }, [])

  const changeZoom = (delta: number) => setScale((s) => Math.max(0.7, Math.min(1.6, s + delta)))

  const stepPos = (step: GrafcetStep) => ({
    x: step.x ?? SPINE_X,
    y: step.y ?? START_Y,
  })

  return (
    <div className="dx-grafcet-demo">
      <div className="dx-grafcet-demo-toolbar">
        <div className="ladder-editor-toolbar" aria-label="Controlos da demonstração GRAFCET">
          <button type="button" className="ladder-primary-button" onClick={onRunPlc} disabled={plcRunning}>
            <IconPlay size={11} /> RUN
          </button>
          <button type="button" className="ladder-stop-button" onClick={onStopPlc} disabled={!plcRunning}>
            <span aria-hidden>■</span> STOP
          </button>
          <span className="ladder-toolbar-sep" aria-hidden />
          <button type="button" className="dx-operator-start" onClick={onStartMotor} disabled={!plcRunning || motorOn}>
            <i aria-hidden /> START
          </button>
          <button type="button" className="dx-operator-stop" onClick={onStopMotor} disabled={!motorOn}>
            <i aria-hidden /> STOP
          </button>
          <span className="ladder-toolbar-sep" aria-hidden />
          <button type="button" className="ladder-icon-button" onClick={() => changeZoom(-0.1)} aria-label="Afastar">−</button>
          <button type="button" className="ladder-icon-button" onClick={() => setScale(1)} aria-label="100 %">{Math.round(scale * 100)}%</button>
          <button type="button" className="ladder-icon-button" onClick={() => changeZoom(0.1)} aria-label="Aproximar">+</button>
        </div>
        <div className="dx-grafcet-demo-status">
          <span className={plcRunning ? 'is-run' : 'is-stop'}>{plcRunning ? 'PLC RUN' : 'PLC STOP'}</span>
          <span>
            {activeStepId
              ? `Etapa ${program.steps.find((s) => s.id === activeStepId)?.name ?? activeStepId} · ${program.steps.find((s) => s.id === activeStepId)?.description ?? ''}`.trim()
              : 'Sem etapa ativa'}
          </span>
          <small className="dx-grafcet-demo-hint">Arraste para mover · pinça ou ± para zoom</small>
        </div>
      </div>

      <div className="dx-grafcet-demo-canvas grafcet-workspace">
        <svg
          className="dx-grafcet-demo-svg grafcet-canvas"
          viewBox="0 0 420 420"
          role="img"
          aria-label={`GRAFCET — ${projectName || NATIVE_PARTIDA_NAME}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          style={{ cursor: drag.current ? 'grabbing' : 'grab', touchAction: 'none' }}
        >
          <g transform={`translate(${pan.x},${pan.y}) scale(${scale})`}>
            {/* grelha suave como no editor */}
            <defs>
              <pattern id="landing-grafcet-grid" width="20" height="20" patternUnits="userSpaceOnUse">
                <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#e2e8f0" strokeWidth="0.6" />
              </pattern>
            </defs>
            <rect x="-40" y="-20" width="500" height="480" fill="url(#landing-grafcet-grid)" />

            {program.comments?.map((comment) => (
              <text
                key={comment.id}
                x={comment.x}
                y={comment.y}
                fontSize={comment.fontSize ?? 13}
                fontWeight={comment.fontWeight ?? '600'}
                fill="#0f172a"
              >
                {comment.text}
              </text>
            ))}

            {/* Ligações verticais + retorno */}
            {program.steps.length >= 2 && (() => {
              const a = stepPos(program.steps[0])
              const b = stepPos(program.steps[1])
              const midY1 = a.y + STEP_H + 28
              const midY2 = b.y + STEP_H + 28
              return (
                <g className="grafcet-links" stroke="#64748b" strokeWidth="1.8" fill="none">
                  <line x1={a.x} y1={a.y + STEP_H} x2={a.x} y2={midY1} />
                  <line x1={a.x - 14} y1={midY1} x2={a.x + 14} y2={midY1} strokeWidth="3" stroke="#334155" />
                  <line x1={a.x} y1={midY1} x2={b.x} y2={b.y} />
                  <line x1={b.x} y1={b.y + STEP_H} x2={b.x} y2={midY2} />
                  <line x1={b.x - 14} y1={midY2} x2={b.x + 14} y2={midY2} strokeWidth="3" stroke="#334155" />
                  <path
                    d={`M ${b.x} ${midY2} C ${b.x - 90} ${midY2}, ${a.x - 90} ${a.y + STEP_H / 2}, ${a.x - 32} ${a.y + STEP_H / 2}`}
                    markerEnd="url(#landing-arrow)"
                  />
                  <text x={a.x - 100} y={(a.y + b.y) / 2 + 20} fontSize="11" fill="#64748b" transform={`rotate(-90 ${a.x - 100} ${(a.y + b.y) / 2 + 20})`}>
                    retorno
                  </text>
                </g>
              )
            })()}

            <defs>
              <marker id="landing-arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                <path d="M0,0 L6,3 L0,6 Z" fill="#64748b" />
              </marker>
            </defs>

            {/* Transições — barra + condição */}
            {program.transitions.map((tr, index) => {
              const from = program.steps.find((s) => s.id === tr.from[0])
              if (!from) return null
              const p = stepPos(from)
              const y = p.y + STEP_H + 28
              const live = (index === 0 && motorOn) || (index === 1 && plcRunning && !motorOn)
              return (
                <g key={tr.id} className={`grafcet-transition ${live ? 'is-receptive' : ''}`}>
                  <line x1={p.x - 14} y1={y} x2={p.x + 14} y2={y} stroke={live ? '#16a34a' : '#334155'} strokeWidth="3.2" />
                  <text x={p.x + 22} y={y + 4} fontSize="12" fontWeight="650" fill={live ? '#15803d' : '#334155'}>
                    {tr.description || tr.name} · {tr.condition}
                  </text>
                </g>
              )
            })}

            {/* Etapas — caixa igual ao editor */}
            {program.steps.map((step, index) => {
              const p = stepPos(step)
              const active = step.id === activeStepId
              const number = step.name || String(index)
              const isInitial = step.stepType === 'initial' || step.initial
              return (
                <g
                  key={step.id}
                  className={`grafcet-graph-node ${active ? 'is-active' : ''}`}
                  transform={`translate(${p.x - SPINE_X}, 0)`}
                >
                  <rect
                    className="grafcet-step-box"
                    x={SPINE_X - 32}
                    y={p.y}
                    width="64"
                    height={STEP_H}
                    rx="2"
                    fill={active ? '#edf9f1' : '#ffffff'}
                    stroke={active ? '#16a34a' : '#334155'}
                    strokeWidth={active ? 2 : 1.6}
                  />
                  {isInitial && (
                    <rect
                      x={SPINE_X - 26}
                      y={p.y + 6}
                      width="52"
                      height={STEP_H - 12}
                      rx="1"
                      fill="none"
                      stroke={active ? '#16a34a' : '#334155'}
                      strokeWidth="1.4"
                    />
                  )}
                  <text x={SPINE_X} y={p.y + 24} textAnchor="middle" fontSize="15" fontWeight="700" fill="#0f172a">
                    X{number}
                  </text>
                  <text x={SPINE_X} y={p.y + 40} textAnchor="middle" fontSize="10" fill="#64748b">
                    {step.description || (isInitial ? 'Inicial' : 'Etapa')}
                  </text>

                  {/* Ações à direita — como no editor */}
                  {step.actions?.map((action, actionIndex) => (
                    <g key={action.id} transform={`translate(${SPINE_X + 44}, ${p.y + 4 + actionIndex * 28})`}>
                      <rect
                        width="100"
                        height="24"
                        rx="4"
                        fill={active ? '#dcfce7' : '#f8fafc'}
                        stroke={active ? '#86efac' : '#e2e8f0'}
                      />
                      <text x="8" y="16" fontSize="11" fontWeight="600" fill={active ? '#166534' : '#64748b'}>
                        {action.description || action.address}
                      </text>
                    </g>
                  ))}
                </g>
              )
            })}
          </g>
        </svg>
      </div>
    </div>
  )
}
