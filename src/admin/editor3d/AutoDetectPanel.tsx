import { useState } from 'react'
import { listGlbNodes } from '../../catalog/componentRig'
import { axisName, kindLabel, suggestFromNodes, type Suggestion } from '../../catalog/interactables'
import { glbCache, useEditorStore } from './editorStore'
import { applyAutoInteractions } from './controlOps'
import { Check, Empty, Field, Section, Select } from './ui'

interface Scan { partId: string; suggestions: Suggestion[]; ignored: string[] }

/**
 * Assistente: lê os objetos de um modelo GLB e propõe controlos (botões, manípulos, seletores)
 * e indicadores (LEDs) já com eixo, curso e variável. O administrador marca o que quer criar.
 */
export function AutoDetectSection() {
  const def = useEditorStore((s) => s.def)
  const selection = useEditorStore((s) => s.selection)
  const glbRevision = useEditorStore((s) => s.glbRevision)
  const glbParts = def.parts.filter((part) => part.kind === 'glb')
  const [partId, setPartId] = useState(selection?.kind === 'part' ? selection.id : glbParts[0]?.id ?? '')
  const [scan, setScan] = useState<Scan | null>(null)
  const [skip, setSkip] = useState<string[]>([])
  const [message, setMessage] = useState('')
  const part = glbParts.find((item) => item.id === partId) ?? glbParts[0]

  const runScan = () => {
    if (!part) { setMessage('Importe primeiro um modelo GLB (barra «Formas › Importar modelo GLB»).'); return }
    const holder = part.asset ? glbCache.get(part.asset) : undefined
    if (!holder) { setMessage('O modelo ainda está a carregar. Tente novamente dentro de momentos.'); return }
    const result = suggestFromNodes(listGlbNodes(holder))
    setScan({ partId: part.id, ...result })
    setSkip([])
    setMessage(result.suggestions.length
      ? `${result.suggestions.length} objeto(s) com nome reconhecível. Desmarque o que não quiser e crie os controlos.`
      : 'Nenhum nome reconhecido neste modelo. Ligue os objetos à mão: crie o controlo e use «Escolher no modelo».')
  }

  const create = () => {
    if (!scan) return
    const chosen = scan.suggestions.filter((item) => !skip.includes(item.node))
    setMessage(applyAutoInteractions(scan.partId, chosen))
    setScan(null)
    setSkip([])
  }

  return <Section title="Deteção automática no modelo" open={glbParts.length > 0}>
    <p className="ce-hint">Lê os objetos do modelo GLB pelo nome (manípulo, botão, tecla, seletor, LED…) e cria os controlos com eixo, curso, ângulo, variável e ação já preenchidos. Depois afine em <b>Controlo › Movimento</b>.</p>
    {glbParts.length === 0 && <Empty>Sem modelos GLB no componente. Importe um modelo para usar a deteção.</Empty>}
    {glbParts.length > 0 && <>
      <Field label="Modelo">
        <Select value={part?.id ?? ''} onChange={(id) => { setPartId(id); setScan(null); setMessage('') }} options={glbParts.map((item): [string, string] => [item.id, item.name])} />
      </Field>
      <div className="ce-actions">
        <button className="dx-btn dx-btn-primary dx-btn-sm" onClick={runScan}>Analisar objetos do modelo</button>
        {scan && scan.suggestions.length > 0 && <>
          <button className="dx-btn dx-btn-secondary dx-btn-sm" onClick={() => setSkip([])}>Marcar todos</button>
          <button className="dx-btn dx-btn-secondary dx-btn-sm" onClick={() => setSkip(scan.suggestions.map((item) => item.node))}>Desmarcar todos</button>
        </>}
      </div>
      {message && <p className="ce-hint" role="status">{message}</p>}
      {scan && scan.suggestions.length > 0 && <>
        <div className="ce-list">
          {scan.suggestions.map((item) => <div key={item.node} className="ce-action-card">
            <Check checked={!skip.includes(item.node)} label={`${kindLabel(item.kind)} · ${item.label}`} onChange={(on) => setSkip(on ? skip.filter((node) => node !== item.node) : [...skip, item.node])} />
            <small className="ce-static">{item.node} · eixo {axisName(item.axis).toUpperCase()}{item.kind === 'selector' ? ` · ±${item.angle}°` : ` · curso ${item.travelMm} mm`}{item.kind === 'led' ? ` · cor ${item.color}${item.runtimeVar ? ` · ${item.runtimeVar}` : ` · variável ${item.variable}`}` : ` · variável ${item.variable}`} · {Math.round(item.confidence * 100)}% ({item.reason})</small>
          </div>)}
        </div>
        <div className="ce-actions">
          <button className="dx-btn dx-btn-primary dx-btn-sm" disabled={skip.length === scan.suggestions.length} onClick={create}>Criar controlos marcados</button>
        </div>
      </>}
      {scan && scan.ignored.length > 0 && <p className="ce-hint">{scan.ignored.length} objeto(s) ignorado(s) por nome genérico (corpo, chapa, parafusos, nós do exportador): <code>{scan.ignored.slice(0, 6).join(', ')}{scan.ignored.length > 6 ? '…' : ''}</code></p>}
      <p className="ce-hint">Um LED detetado com nome de execução (RUN, STOP, ERROR, COM, TRIP) liga-se logo às variáveis do simulador; os restantes ficam com uma variável própria, que pode acender no separador <b>Variáveis</b> ou pelo circuito.</p>
    </>}
  </Section>
}
