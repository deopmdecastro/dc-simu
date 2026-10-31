// Lateral esquerda do simulador de comandos: Biblioteca de símbolos IEC e Inspetor
// (mesma estrutura da biblioteca/inspetor do Esquema 3D).
import { useEffect, useMemo, useState } from 'react'
import SidePanelHeader from '../components/SidePanelHeader'
import { IconSearch } from '../ui/icons'
import { useSimStore } from '../store/useSimStore'
import { CMD_PALETTE, CMD_PARTS, emptyCommands, partBox, partTerminals, type CmdKind, type CmdPart } from './model'
import { symbolBody } from './symbols'
import { useCommandsUi } from './commandsUi'
import { patchPart, removeSelected, rotateSelected } from './editing'
import { devicesOf } from './engine'

const SUPPLY_PRESETS = [['L1', 'L2', 'L3'], ['L1', 'L2', 'L3', 'N'], ['L1', 'L2', 'L3', 'N', 'PE'], ['L1', 'N'], ['L1'], ['L2'], ['L3'], ['N'], ['PE'], ['L+'], ['M']]
const NC_AT_REST: CmdKind[] = ['contactNC', 'timedNC', 'thermalNC', 'pushNC', 'emergency']
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export default function CommandsSidebar({ width, onCollapse }: { width: number | string; onCollapse: () => void }) {
  const [tab, setTab] = useState<'library' | 'inspector'>('library')
  const [filter, setFilter] = useState('')
  const placing = useCommandsUi((s) => s.placing)
  const setPlacing = useCommandsUi((s) => s.setPlacing)
  const selection = useCommandsUi((s) => s.selection)
  const selectedFrom = useCommandsUi((s) => s.selectedFrom)
  const running = useCommandsUi((s) => s.rt.running)
  const diagram = useSimStore((s) => s.commands) ?? emptyCommands()
  const selectedPart = selection?.type === 'part' ? diagram.parts.find((p) => p.id === selection.id) : undefined

  // Selecionar um símbolo no esquema mostra logo as suas propriedades (como no Esquema 3D).
  useEffect(() => { if (selection && selectedFrom === 'canvas') setTab('inspector') }, [selection?.id, selectedFrom])

  const groups = useMemo(() => {
    const q = fold(filter.trim())
    return CMD_PALETTE.map((g) => ({ ...g, kinds: g.kinds.filter((k) => !q || fold(`${CMD_PARTS[k].label} ${CMD_PARTS[k].hint} ${g.title}`).includes(q)) })).filter((g) => g.kinds.length)
  }, [filter])
  const total = CMD_PALETTE.reduce((n, g) => n + g.kinds.length, 0)

  return (
    <div className="pn-panel dc-cmd-sidebar shrink-0 flex flex-col h-full min-h-0" style={{ width }}>
      <SidePanelHeader eyebrow={tab === 'library' ? 'COMANDOS' : 'SÍMBOLO'} title={tab === 'library' ? 'Símbolos IEC' : selectedPart ? `${CMD_PARTS[selectedPart.kind].label}${selectedPart.tag ? ` ${selectedPart.tag}` : ''}` : 'Propriedades'} side="left" onToggle={onCollapse} toggleLabel="Recolher biblioteca e inspetor" />
      <div className="pn-tabs flex items-end">
        <button type="button" onClick={() => setTab('library')} className={`dc-tab ${tab === 'library' ? 'dc-tab-active' : ''}`}>
          Biblioteca <span className="text-ink-300 font-normal">({total})</span>
        </button>
        <button type="button" onClick={() => setTab('inspector')} className={`dc-tab ${tab === 'inspector' ? 'dc-tab-active' : ''}`}>Inspetor</button>
      </div>

      {tab === 'library' ? (
        <>
          <div className="pn-section">
            <div className="relative">
              <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Pesquisar símbolo (contactor, botão, motor…)" aria-label="Pesquisar símbolos" className="dc-input !pl-7 !pr-7" />
              {filter && <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-500" title="Limpar pesquisa" onClick={() => setFilter('')}>×</button>}
              <IconSearch size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-ink-300 pointer-events-none" />
            </div>
          </div>
          <div className="dc-cmd-palette-body">
            {groups.map((group) => (
              <section key={group.title}>
                <h3>{group.title}</h3>
                <div className="dc-cmd-palette-grid">
                  {group.kinds.map((kind) => {
                    const def = CMD_PARTS[kind]
                    const lines = kind === 'supply' ? ['L1', 'L2', 'L3'] : undefined
                    const box = partBox({ id: 'pv', kind, x: 0, y: 0, rot: 0, tag: '', lines })
                    const pad = 14
                    const top = kind === 'supply' ? 6 : 0
                    return (
                      <button key={kind} type="button" className={`dc-cmd-palette-item ${placing === kind ? 'is-on' : ''}`} disabled={running}
                        draggable onDragStart={(e) => { e.dataTransfer.setData('text/dc-cmd-kind', kind); e.dataTransfer.effectAllowed = 'copy' }}
                        onClick={() => setPlacing(placing === kind ? null : kind)} title={`${def.label} — ${def.hint}`} aria-label={`Colocar ${def.label}`} aria-pressed={placing === kind}>
                        <svg viewBox={`${box.x - pad} ${box.y - pad - top} ${box.w + pad * 2} ${box.h + pad * 2 + top}`} aria-hidden="true">
                          <g fill="none" stroke="#1e293b" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">{symbolBody({ kind, lines, color: 'green' }, { idle: true, closed: NC_AT_REST.includes(kind) })}</g>
                        </svg>
                        <span>{def.label}</span>
                      </button>
                    )
                  })}
                </div>
              </section>
            ))}
            {!groups.length && <p className="dc-cmd-muted">Nenhum símbolo corresponde à pesquisa.</p>}
            <p className="dc-cmd-tip">Clique num símbolo e depois no esquema (Shift mantém), ou arraste-o. Ligue os bornes com a ferramenta Cabo — largar sobre um cabo cria um nó.</p>
          </div>
        </>
      ) : (
        <div className="dc-cmd-palette-body">
          {selectedPart ? <PartProperties part={selectedPart} disabled={running} />
            : selection?.type === 'wire' ? <div className="dc-cmd-props"><p>Cabo selecionado. Arraste o troço do meio para o deslocar.</p><button type="button" className="dc-btn is-danger" disabled={running} onClick={removeSelected}>Apagar cabo</button></div>
            : <DiagramSummary />}
        </div>
      )}
    </div>
  )
}

function DiagramSummary() {
  const diagram = useSimStore((s) => s.commands) ?? emptyCommands()
  return (
    <div className="dc-cmd-props">
      <p><b>{diagram.parts.filter((p) => p.kind !== 'node').length}</b> símbolos · <b>{diagram.wires.length}</b> cabos · <b>{devicesOf(diagram).length}</b> aparelhos</p>
      <p className="dc-cmd-muted">Selecione um símbolo no esquema para editar a referência, a marcação dos bornes e as opções.</p>
      <p className="dc-cmd-muted">Os contactos com a mesma referência da bobina (K1, K2…) mudam quando ela recebe tensão. Botões S, térmicos F e disjuntores Q operam-se durante a simulação.</p>
    </div>
  )
}

function PartProperties({ part, disabled }: { part: CmdPart; disabled: boolean }) {
  const def = CMD_PARTS[part.kind]
  const terms = partTerminals(part)
  const onChange = (patch: Partial<CmdPart>) => patchPart(part.id, patch)
  return (
    <fieldset className="dc-cmd-props" disabled={disabled}>
      <p className="dc-cmd-muted">{def.hint}</p>
      {def.prefix && <label className="dc-cmd-field"><span>Referência</span>
        <input className="dc-input" value={part.tag} onChange={(e) => onChange({ tag: e.target.value.toUpperCase().replace(/\s+/g, '') })} aria-label="Referência do aparelho" />
      </label>}
      {def.family === 'contact' && <p className="dc-cmd-muted">Comandado pelo aparelho <b>{part.tag || '—'}</b> (bobina, temporizador ou relé térmico com a mesma referência).</p>}
      {part.kind === 'supply' && <label className="dc-cmd-field"><span>Fases</span>
        <select className="dc-input" value={(part.lines ?? ['L1']).join(' ')} onChange={(e) => onChange({ lines: e.target.value.split(' ') })} aria-label="Fases da alimentação">
          {SUPPLY_PRESETS.map((p) => <option key={p.join(' ')} value={p.join(' ')}>{p.join(' · ')}</option>)}
        </select>
      </label>}
      {part.kind === 'timerCoil' && <label className="dc-cmd-field"><span>Atraso à operação (s)</span>
        <input className="dc-input" type="number" min={0.1} step={0.5} value={(part.delayMs ?? 3000) / 1000} onChange={(e) => onChange({ delayMs: Math.max(100, Math.round(Number(e.target.value) * 1000) || 100) })} aria-label="Atraso do temporizador em segundos" />
      </label>}
      {part.kind === 'lamp' && <label className="dc-cmd-field"><span>Cor</span>
        <select className="dc-input" value={part.color ?? 'green'} onChange={(e) => onChange({ color: e.target.value as CmdPart['color'] })} aria-label="Cor do sinalizador">
          <option value="green">Verde (marcha)</option><option value="red">Vermelho (paragem/defeito)</option><option value="yellow">Amarelo (alerta)</option><option value="white">Branco</option><option value="blue">Azul</option>
        </select>
      </label>}
      {part.kind !== 'supply' && part.kind !== 'node' && <div className="dc-cmd-field"><span>Marcação dos bornes</span>
        <div className="dc-cmd-terms">{terms.map((t, i) => <input key={i} className="dc-input" value={part.labels?.[i] ?? t.label} onChange={(e) => { const labels = terms.map((x, j) => part.labels?.[j] ?? x.label); labels[i] = e.target.value; onChange({ labels }) }} aria-label={`Borne ${i + 1}`} />)}</div>
      </div>}
      <div className="dc-cmd-actions">
        <button type="button" className="dc-btn" onClick={rotateSelected}>Rodar 90°</button>
        <button type="button" className="dc-btn is-danger" onClick={removeSelected}>Apagar</button>
      </div>
    </fieldset>
  )
}
