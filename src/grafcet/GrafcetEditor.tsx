import { useSimStore } from '../store/useSimStore'
import { validBit } from './engine'
import type { GrafcetStep } from './engine'

/** Editor compacto para o esquema. A ordem vertical define o destino da transição. */
export default function GrafcetEditor() {
  const program = useSimStore((s) => s.grafcet)
  const runtime = useSimStore((s) => s.grafcetRuntime)
  const table = useSimStore((s) => s.runtime.table)
  const setGrafcet = useSimStore((s) => s.setGrafcet)
  const running = useSimStore((s) => s.sim.runState === 'running')
  const steps = program.steps
  const edit = (id: string, patch: Partial<GrafcetStep>) => setGrafcet({ steps: steps.map((step) => step.id === id ? { ...step, ...patch } : step) })
  const add = () => setGrafcet({ steps: [...steps, { id: crypto.randomUUID(), name: `Etapa ${steps.length}`, initial: steps.length === 0, action: '', condition: 'I1' }] })
  const remove = (id: string) => setGrafcet({ steps: steps.filter((step) => step.id !== id) })
  const move = (index: number, delta: number) => {
    const target = index + delta
    if (target < 0 || target >= steps.length) return
    const reordered = [...steps]
    ;[reordered[index], reordered[target]] = [reordered[target], reordered[index]]
    setGrafcet({ steps: reordered })
  }
  return <div className="grafcet-editor">
    <header className="grafcet-header"><div><strong>GRAFCET</strong><small>Sequência de etapas · esquema</small></div><button className="dc-btn-primary dc-btn" onClick={add}>+ Etapa</button></header>
    <p className="grafcet-help">A transição de cada etapa conduz à seguinte; a última volta à primeira. Condição: I1, M1, Q1, !I1 ou 1 (sempre). Ação: Q1 ou M1.</p>
    <div className="grafcet-list">
      {!steps.length && <div className="grafcet-empty">Ainda não há etapas. Clique em «+ Etapa» para criar uma sequência.</div>}
      {steps.map((step, index) => {
        const active = runtime.active.includes(step.id)
        const condition = step.condition.trim().toUpperCase()
        const action = step.action.trim().toUpperCase()
        const validCondition = condition === '1' || validBit(condition.replace(/^!/, ''))
        return <div key={step.id} className="grafcet-sequence">
          <div className={`grafcet-step ${active ? 'is-active' : ''}`}>
            <div className="grafcet-step-label"><button title="Definir como etapa inicial" aria-label="Etapa inicial" onClick={() => setGrafcet({ steps: steps.map((s) => ({ ...s, initial: s.id === step.id })) })}>{step.initial ? '◎' : '○'}</button><strong>{index}</strong><span>{active ? '● Ativa' : 'Etapa'}</span></div>
            <input className="dc-input" aria-label={`Nome da etapa ${index}`} value={step.name} onChange={(e) => edit(step.id, { name: e.target.value })} />
            <label>Ação (Q/M)<input className="dc-input" aria-label={`Ação da etapa ${index}`} value={step.action} placeholder="Q1" onChange={(e) => edit(step.id, { action: e.target.value.toUpperCase() })} /></label>
            {action && !/^[QM]\d{1,2}$/.test(action) && <small className="grafcet-error">Ação inválida: use Q1 ou M1.</small>}
            {action && validBit(action) && <small>{action} = {table[action] ? '1' : '0'}</small>}
            <div className="grafcet-actions"><button title="Subir etapa" disabled={index === 0} onClick={() => move(index, -1)}>↑</button><button title="Descer etapa" disabled={index === steps.length - 1} onClick={() => move(index, 1)}>↓</button><button title="Eliminar etapa" onClick={() => remove(step.id)}>Eliminar</button></div>
          </div>
          <div className="grafcet-transition"><span className="grafcet-line" /><span className="grafcet-bar" /><label>Transição → {index === steps.length - 1 ? 'início' : `etapa ${index + 1}`}<input className="dc-input" aria-label={`Condição da transição ${index}`} value={step.condition} placeholder="I1" onChange={(e) => edit(step.id, { condition: e.target.value.toUpperCase() })} /></label>{!validCondition && <small className="grafcet-error">Condição inválida</small>}</div>
        </div>
      })}
    </div>
    <footer className="grafcet-footer">{running ? 'Simulação ativa' : 'Pré-visualização'} · {runtime.active.length} etapa(s) ativa(s) · ações Q/M do GRAFCET prevalecem sobre Ladder no mesmo endereço.</footer>
  </div>
}
