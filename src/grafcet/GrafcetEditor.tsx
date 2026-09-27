import { useState } from 'react'
import { useSimStore } from '../store/useSimStore'
import { transitionsOf, validBit, validCondition } from './engine'
import type { GrafcetStep, GrafcetTransition, GrafcetProgram } from './engine'

const id = () => crypto.randomUUID()

/** GRAFCET com transições explícitas, divergência e convergência AND.
 * A ordem das transições define a prioridade quando partilham uma origem. */
export default function GrafcetEditor({ full = false, onOpenEditor }: { full?: boolean; onOpenEditor?: () => void }) {
  const program = useSimStore((s) => s.grafcet)
  const runtime = useSimStore((s) => s.grafcetRuntime)
  const table = useSimStore((s) => s.runtime.table)
  const setGrafcet = useSimStore((s) => s.setGrafcet)
  const running = useSimStore((s) => s.sim.runState === 'running')
  const [selected, setSelected] = useState<string | null>(null)
  const [tab, setTab] = useState<'steps' | 'transitions'>('steps')
  const steps = program.steps
  const transitions = transitionsOf(program)
  const save = (patch: Partial<GrafcetProgram>) => setGrafcet({ ...program, transitions, ...patch })
  const updateStep = (stepId: string, patch: Partial<GrafcetStep>) => save({ steps: steps.map((s) => s.id === stepId ? { ...s, ...patch } : s) })
  const updateTransition = (transitionId: string, patch: Partial<GrafcetTransition>) => save({ transitions: transitions.map((t) => t.id === transitionId ? { ...t, ...patch } : t) })
  const addStep = () => {
    const newStep: GrafcetStep = { id: id(), name: `Etapa ${steps.length}`, initial: steps.length === 0, action: '', condition: 'I1', actions: [] }
    save({ steps: [...steps, newStep] })
    setSelected(newStep.id)
    setTab('steps')
  }
  const removeStep = (stepId: string) => {
    save({ steps: steps.filter((s) => s.id !== stepId), transitions: transitions.filter((t) => !t.from.includes(stepId) && !t.to.includes(stepId)) })
    setSelected(null)
  }
  const addTransition = () => {
    if (steps.length < 2) return
    const t = { id: id(), from: [steps[0].id], to: [steps[1].id], condition: 'I1' }
    save({ transitions: [...transitions, t] })
    setSelected(t.id)
    setTab('transitions')
  }
  const choose = (ids: string[], stepId: string) => ids.includes(stepId) ? ids.filter((x) => x !== stepId) : [...ids, stepId]
  const selectedStep = steps.find((s) => s.id === selected)
  const selectedTransition = transitions.find((t) => t.id === selected)
  const actionsOf = (step: GrafcetStep) => [
    ...(step.action ? [{ id: `legacy-${step.id}`, address: step.action, condition: '1' }] : []),
    ...(step.actions ?? []),
  ]
  // Cada etapa ocupa uma linha no diagrama. Arestas explicitam bifurcações e junções.
  const stepY = (stepId: string) => 70 + steps.findIndex((s) => s.id === stepId) * 154
  const width = full ? 760 : 560
  const height = Math.max(260, steps.length * 154 + 65)
  return <div className={`grafcet-editor grafcet-designer ${full ? 'grafcet-full' : 'grafcet-preview'}`}>
    <header className="grafcet-header"><div><strong>GRAFCET</strong><small>{steps.length} etapas · {transitions.length} transições · {runtime.active.length} ativas</small></div>{full ? <div className="flex gap-1"><button className="dc-btn" onClick={addStep}>+ Etapa</button><button className="dc-btn-primary dc-btn" disabled={steps.length < 2} onClick={addTransition}>+ Transição</button></div> : <button className="dc-btn-primary dc-btn" onClick={onOpenEditor}>Abrir editor ↗</button>}</header>
    <div className="grafcet-designer-body">
      <div className="grafcet-canvas" aria-label="Diagrama GRAFCET">
        {!steps.length && <div className="grafcet-empty">Ainda não há GRAFCET neste projeto. {full ? 'Crie uma etapa inicial para começar.' : 'Abra o editor para criar a primeira etapa.'}</div>}
        {!!steps.length && <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Etapas, ações e transições do GRAFCET">
          <defs><marker id="grafcet-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3" orient="auto"><path d="M0 0 L7 3 L0 6" fill="none" stroke="#526883" /></marker></defs>
          {transitions.flatMap((t, ti) => {
            const sources = t.from.filter((v) => steps.some((s) => s.id === v))
            const targets = t.to.filter((v) => steps.some((s) => s.id === v))
            if (!sources.length || !targets.length) return []
            const ty = Math.max(42, Math.min(height - 45, (sources.reduce((sum, v) => sum + stepY(v), 0) / sources.length + targets.reduce((sum, v) => sum + stepY(v), 0) / targets.length) / 2))
            // Transições de retorno são colocadas à esquerda; outras à direita.
            const returning = Math.min(...targets.map(stepY)) <= Math.max(...sources.map(stepY))
            const tx = returning ? 65 - ti % 3 * 16 : 290 + ti % 3 * 27
            return <g key={t.id} onClick={full ? () => { setSelected(t.id); setTab('transitions') } : undefined} className={full ? 'grafcet-graph-link' : ''} role={full ? 'button' : undefined} tabIndex={full ? 0 : undefined} onKeyDown={full ? (e) => { if (e.key === 'Enter') { setSelected(t.id); setTab('transitions') } } : undefined}>
              {sources.map((v) => <path key={`f-${v}`} d={`M 182 ${stepY(v) + 27} H ${tx} V ${ty}`} fill="none" stroke="#526883" strokeWidth="2" />)}
              {targets.map((v) => <path key={`t-${v}`} d={`M ${tx} ${ty} V ${stepY(v)} H 119`} fill="none" stroke="#526883" strokeWidth="2" markerEnd="url(#grafcet-arrow)" />)}
              <path d={`M ${tx - 11} ${ty} h 22`} stroke={selected === t.id ? '#2563eb' : '#263d59'} strokeWidth="4" />
              <text x={tx + 17} y={ty - 4} fill="#1d4ed8" fontSize="12" fontWeight="600">{t.condition}</text>
              {(sources.length > 1 || targets.length > 1) && <text x={tx - 24} y={ty - 9} fill="#c2410c" fontSize="10">AND</text>}
            </g>
          })}
          {steps.map((step, index) => <g key={step.id} className={full ? 'grafcet-graph-node' : ''} role={full ? 'button' : undefined} tabIndex={full ? 0 : undefined} onClick={full ? () => { setSelected(step.id); setTab('steps') } : undefined} onKeyDown={full ? (e) => { if (e.key === 'Enter') { setSelected(step.id); setTab('steps') } } : undefined}>
            <rect x="119" y={stepY(step.id)} width="64" height="54" fill={runtime.active.includes(step.id) ? '#dcfce7' : 'white'} stroke={selected === step.id ? '#2563eb' : runtime.active.includes(step.id) ? '#16a34a' : '#263d59'} strokeWidth="2.5" />
            {step.initial && <rect x="124" y={stepY(step.id) + 5} width="54" height="44" fill="none" stroke="#263d59" strokeWidth="1.5" />}
            <text x="151" y={stepY(step.id) + 34} textAnchor="middle" fill="#1e293b" fontWeight="700" fontSize="17">{index}</text>
            <text x="196" y={stepY(step.id) + 17} fill="#334155" fontSize="12">{step.name.slice(0, 25)}</text>
            {actionsOf(step).map((action, ai) => <g key={action.id}><path d={`M 183 ${stepY(step.id) + 27} H 335`} stroke="#263d59" strokeWidth="1.5" /><rect x="335" y={stepY(step.id) + ai * 31} width="126" height="27" fill="white" stroke="#263d59" strokeWidth="1.5" /><text x="345" y={stepY(step.id) + 18 + ai * 31} fontSize="11">{action.address}{action.condition !== '1' ? ` [${action.condition}]` : ''}</text></g>)}
          </g>)}
        </svg>}
      </div>
      {full && <aside className="grafcet-properties">
        <div className="grafcet-tabs"><button className={tab === 'steps' ? 'is-active' : ''} onClick={() => { setTab('steps'); setSelected(null) }}>Etapas</button><button className={tab === 'transitions' ? 'is-active' : ''} onClick={() => { setTab('transitions'); setSelected(null) }}>Transições</button></div>
        {tab === 'steps' && <>
          <div className="grafcet-entity-list">{steps.map((s, i) => <button key={s.id} className={selected === s.id ? 'is-active' : ''} onClick={() => setSelected(s.id)}>{s.initial ? '◎' : '□'} {i} — {s.name} {runtime.active.includes(s.id) ? '●' : ''}</button>)}</div>
          {selectedStep && <div className="grafcet-form">
            <h3>Etapa {steps.indexOf(selectedStep)} {selectedStep.initial ? '· inicial' : ''}</h3>
            <label>Nome<input className="dc-input" value={selectedStep.name} onChange={(e) => updateStep(selectedStep.id, { name: e.target.value })} /></label>
            <label className="grafcet-inline"><input type="checkbox" checked={selectedStep.initial} onChange={(e) => updateStep(selectedStep.id, { initial: e.target.checked })} /> Etapa inicial</label>
            <h3>Ações contínuas</h3>
            {actionsOf(selectedStep).map((a) => <div className="grafcet-action-row" key={a.id}><input className="dc-input" aria-label="Endereço da ação" placeholder="Q1" value={a.address} onChange={(e) => a.id.startsWith('legacy-') ? updateStep(selectedStep.id, { action: e.target.value.toUpperCase() }) : updateStep(selectedStep.id, { actions: (selectedStep.actions ?? []).map((v) => v.id === a.id ? { ...v, address: e.target.value.toUpperCase() } : v) })} /><input className="dc-input" aria-label="Condição da ação" placeholder="1" value={a.condition} onChange={(e) => updateStep(selectedStep.id, { actions: [...(selectedStep.actions ?? []).filter((v) => v.id !== a.id), { id: a.id, address: a.address, condition: e.target.value.toUpperCase() }], action: a.id.startsWith('legacy-') ? '' : selectedStep.action })} /><button title="Remover ação" onClick={() => updateStep(selectedStep.id, a.id.startsWith('legacy-') ? { action: '' } : { actions: (selectedStep.actions ?? []).filter((v) => v.id !== a.id) })}>×</button>{a.address && !/^[QM]\d{1,2}$/.test(a.address) && <small className="grafcet-error">Use Q1 ou M1</small>}{!validCondition(a.condition) && <small className="grafcet-error">Condição inválida</small>}</div>)}
            <button className="dc-btn" onClick={() => updateStep(selectedStep.id, { actions: [...(selectedStep.actions ?? []), { id: id(), address: '', condition: '1' }] })}>+ Ação</button>
            <button className="dc-btn grafcet-danger" onClick={() => removeStep(selectedStep.id)}>Eliminar etapa</button>
          </div>}
        </>}
        {tab === 'transitions' && <>
          <p className="grafcet-hint">Uma origem → vários destinos cria divergência AND. Várias origens → um destino cria convergência AND. Prioridade pela ordem da lista.</p>
          <div className="grafcet-entity-list">{transitions.map((t, i) => <button key={t.id} className={selected === t.id ? 'is-active' : ''} onClick={() => setSelected(t.id)}>T{i + 1}: {t.from.map((v) => steps.findIndex((s) => s.id === v)).join('+')} → {t.to.map((v) => steps.findIndex((s) => s.id === v)).join('+')}</button>)}</div>
          {selectedTransition && <div className="grafcet-form"><h3>Transição T{transitions.indexOf(selectedTransition) + 1}</h3>
            <label>Condição (I1 &amp; !I2 | M1)<input className="dc-input" value={selectedTransition.condition} onChange={(e) => updateTransition(selectedTransition.id, { condition: e.target.value.toUpperCase() })} /></label>
            {!validCondition(selectedTransition.condition) && <small className="grafcet-error">Expressão inválida: use I/Q/M, !, &amp;, | e parênteses.</small>}
            {(['from', 'to'] as const).map((field) => <fieldset key={field}><legend>{field === 'from' ? 'Origens (todas ativas)' : 'Destinos (ativados juntos)'}</legend>{steps.map((s, i) => <label className="grafcet-inline" key={s.id}><input type="checkbox" checked={selectedTransition[field].includes(s.id)} onChange={() => updateTransition(selectedTransition.id, { [field]: choose(selectedTransition[field], s.id) })} /> {i} · {s.name}</label>)}</fieldset>)}
            {(!selectedTransition.from.length || !selectedTransition.to.length) && <small className="grafcet-error">Escolha pelo menos uma origem e um destino.</small>}
            <button className="dc-btn grafcet-danger" onClick={() => { save({ transitions: transitions.filter((t) => t.id !== selectedTransition.id) }); setSelected(null) }}>Eliminar transição</button>
          </div>}
        </>}
        <div className="grafcet-hint">{running ? '● Simulação ativa' : '○ Parado'} · Bits de saída: {Object.entries(table).filter(([k, v]) => /^[QM]/.test(k) && v).map(([k]) => k).join(', ') || 'nenhum'}</div>
      </aside>}
    </div>
    {!full && <div className="grafcet-preview-status" role="status"><span className={running ? 'is-running' : ''}>● {running ? 'Simulação ativa' : 'Parado'}</span><span>{runtime.active.length ? `Etapas ativas: ${runtime.active.map((v) => steps.findIndex((step) => step.id === v)).join(', ')}` : 'Nenhuma etapa ativa'}</span></div>}
  </div>
}
