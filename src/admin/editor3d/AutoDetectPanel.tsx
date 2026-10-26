import { useState } from 'react'
import { axisName, kindLabel, type InteractableKind, type Suggestion } from '../../catalog/interactables'
import { glbCache, useEditorStore } from './editorStore'
import { applyAutoInteractions, scanInteractables } from './controlOps'
import { Check, Empty, Field, Section, Select } from './ui'

interface Scan { partId: string; suggestions: Suggestion[]; ignored: string[] }

/**
 * Assistente: lê os objetos de um modelo GLB (nome + forma + tipo de equipamento) e propõe
 * controlos (botões com mola ou retenção, manípulos, seletores), indicadores (LEDs), ecrãs e
 * bornes já com eixo, curso, variável e retorno. O administrador marca o que quer criar.
 */
const GROUPS: Array<[InteractableKind, string]> = [['terminal', 'Bornes'], ['button', 'Botões'], ['toggle', 'Manípulos / disjuntores'], ['selector', 'Seletores'], ['display', 'Ecrãs'], ['led', 'Indicadores']]

function detail(item: Suggestion): string {
  const parts = [item.node]
  if (item.kind === 'terminal') parts.push(`face ${item.normal ? axisName(item.normal).toUpperCase() + (item.normal.some((n) => n < 0) ? '−' : '+') : '—'} · encaixa no furo mais próximo`)
  else if (item.kind === 'display') parts.push(item.screen ? `${item.screen.widthMm.toFixed(1)} × ${item.screen.heightMm.toFixed(1)} mm · ${item.screen.light ? 'LCD claro' : 'visor escuro'}` : '')
  else {
    parts.push(`eixo ${axisName(item.axis).toUpperCase()}`)
    parts.push(item.kind === 'selector' ? `±${item.angle}°` : `curso ${item.travelMm} mm`)
    if (item.kind === 'led') parts.push(`cor ${item.color}${item.runtimeVar ? ` · ${item.runtimeVar}` : ` · variável ${item.variable}`}`)
    else parts.push(`variável ${item.variable}`)
    if (item.returnMode) parts.push(`retorno: ${item.returnReason}`)
  }
  parts.push(`${Math.round(item.confidence * 100)}% (${item.reason})`)
  return parts.filter(Boolean).join(' · ')
}
export function AutoDetectSection() {
  const def = useEditorStore((s) => s.def)
  const selection = useEditorStore((s) => s.selection)
  const glbParts = def.parts.filter((part) => part.kind === 'glb')
  const [partId, setPartId] = useState(selection?.kind === 'part' ? selection.id : glbParts[0]?.id ?? '')
  const [scan, setScan] = useState<Scan | null>(null)
  const [skip, setSkip] = useState<string[]>([])
  const [message, setMessage] = useState('')
  const [namesOnly, setNamesOnly] = useState(false)
  const part = glbParts.find((item) => item.id === partId) ?? glbParts[0]

  const runScan = () => {
    if (!part) { setMessage('Importe primeiro um modelo GLB (barra «Formas › Importar modelo GLB»).'); return }
    const holder = part.asset ? glbCache.get(part.asset) : undefined
    if (!holder) { setMessage('O modelo ainda está a carregar. Tente novamente dentro de momentos.'); return }
    const result = scanInteractables(part.id, { namesOnly })
    if (!result) { setMessage('Não foi possível ler este modelo.'); return }
    setScan({ partId: part.id, ...result })
    // sugestões só pela forma ficam desmarcadas: confirme-as antes de criar
    // bornes que já existem perto do mesmo ponto também vêm desmarcados (evita duplicados)
    const near = (item: Suggestion) => item.kind === 'terminal' && !!item.point && def.terminals.some((terminal) => Math.hypot(...terminal.position.map((value, i) => value - item.point![i])) < 8)
    setSkip(result.suggestions.filter((item) => item.confidence < 0.5 || near(item)).map((item) => item.node))
    const count = (kind: InteractableKind) => result.suggestions.filter((item) => item.kind === kind).length
    const summary = GROUPS.map(([kind, label]) => [count(kind), label] as const).filter(([n]) => n).map(([n, label]) => `${n} ${label.toLowerCase()}`).join(', ')
    setMessage(result.suggestions.length
      ? `Encontrado: ${summary}. As sugestões só pela forma vêm desmarcadas; confirme e crie.`
      : 'Nada reconhecido neste modelo (o GLB pode estar fundido numa única malha). Ligue os objetos à mão: crie o controlo e use «Escolher no modelo»; para bornes use «Furos do modelo».')
  }

  const create = () => {
    if (!scan) return
    const chosen = scan.suggestions.filter((item) => !skip.includes(item.node))
    setMessage(applyAutoInteractions(scan.partId, chosen))
    setScan(null)
    setSkip([])
  }

  return <Section title="Deteção automática no modelo" open={glbParts.length > 0}>
    <p className="ce-hint">Lê os objetos do modelo GLB pelo nome (manípulo, botão, tecla, seletor, LED, ecrã, borne…) e pela forma (placa fina à face = ecrã, cilindro a sobressair = botão, disco = seletor). Cria os controlos com eixo, curso, ângulo, variável, ação e <b>retorno</b> — mola nas botoneiras de impulso, retenção nos disjuntores e emergências travadas — e encaixa os bornes nos furos. Depois afine em <b>Controlo › Movimento</b>.</p>
    {glbParts.length === 0 && <Empty>Sem modelos GLB no componente. Importe um modelo para usar a deteção.</Empty>}
    {glbParts.length > 0 && <>
      <Field label="Modelo">
        <Select value={part?.id ?? ''} onChange={(id) => { setPartId(id); setScan(null); setMessage('') }} options={glbParts.map((item): [string, string] => [item.id, item.name])} />
      </Field>
      <Check checked={!namesOnly} label="Também pela forma dos objetos (nomes genéricos)" onChange={(on) => { setNamesOnly(!on); setScan(null) }} />
      <div className="ce-actions">
        <button className="dx-btn dx-btn-primary dx-btn-sm" onClick={runScan}>Analisar objetos do modelo</button>
        {scan && scan.suggestions.length > 0 && <>
          <button className="dx-btn dx-btn-secondary dx-btn-sm" onClick={() => setSkip([])}>Marcar todos</button>
          <button className="dx-btn dx-btn-secondary dx-btn-sm" onClick={() => setSkip(scan.suggestions.map((item) => item.node))}>Desmarcar todos</button>
        </>}
      </div>
      {message && <p className="ce-hint" role="status">{message}</p>}
      {scan && scan.suggestions.length > 0 && <>
        {GROUPS.filter(([kind]) => scan.suggestions.some((item) => item.kind === kind)).map(([kind, title]) => <div key={kind} className="ce-list" role="group" aria-label={title}>
          <p className="ce-hint"><b>{title}</b></p>
          {scan.suggestions.filter((item) => item.kind === kind).map((item) => <div key={item.node} className="ce-action-card">
            <Check checked={!skip.includes(item.node)} label={`${kindLabel(item.kind)} · ${item.label}${item.returnMode ? (item.returnMode === 'spring' ? ' · mola' : ' · retenção') : ''}`} onChange={(on) => setSkip(on ? skip.filter((node) => node !== item.node) : [...skip, item.node])} />
            <small className="ce-static">{detail(item)}</small>
          </div>)}
        </div>)}
        <div className="ce-actions">
          <button className="dx-btn dx-btn-primary dx-btn-sm" disabled={skip.length === scan.suggestions.length} onClick={create}>Criar marcados</button>
        </div>
      </>}
      {scan && scan.ignored.length > 0 && <p className="ce-hint">{scan.ignored.length} objeto(s) ignorado(s) (corpo, chapa, parafusos, serigrafia, nós do exportador sem forma reconhecível): <code>{scan.ignored.slice(0, 6).join(', ')}{scan.ignored.length > 6 ? '…' : ''}</code></p>}
      <p className="ce-hint">Um LED detetado com nome de execução (RUN, STOP, ERROR, COM, TRIP) liga-se logo às variáveis do simulador; os restantes ficam com uma variável própria, que pode acender no separador <b>Variáveis</b> ou pelo circuito.</p>
    </>}
  </Section>
}
