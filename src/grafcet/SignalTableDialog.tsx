import { useEffect, useRef, useState } from 'react'
import type { LadderTag } from '../types'
import { useSimStore } from '../store/useSimStore'
import PropertyDialog from '../ui/PropertyDialog'
import TagSheetActions from '../excel/TagSheetActions'
import { canonicalSignalAddress, detectGrafcetSignals, isSignalAddress, nextDeclaredTagAddress, signalTagErrors, type SignalArea } from './signals'
import { foldText as normalizeSearch } from '../utils/text'

const AREAS: Array<{ area: SignalArea; title: string; add: string; hint: string }> = [
  { area: 'I', title: 'Entradas (I)', add: 'Adicionar entrada', hint: 'Sinais lidos pelas condições.' },
  { area: 'Q', title: 'Saídas (Q)', add: 'Adicionar saída', hint: 'Saídas comandadas pelas ações.' },
  { area: 'M', title: 'Memórias (M)', add: 'Adicionar memória', hint: 'Bits internos, lidos ou escritos no programa.' },
]

export default function SignalTableDialog({ onClose }: { onClose: () => void }) {
  const tags = useSimStore((state) => state.tags)
  const activePlcId = useSimStore((state) => state.activePlcId)
  const projectRevision = useSimStore((state) => state.projectRevision)
  const plc = useSimStore((state) => state.components.find((component) => component.id === state.activePlcId))
  const projectName = useSimStore((state) => state.currentProjectName)
  const initial = useRef({ tags, activePlcId, projectRevision, label: `${activePlcId ? `PLC ativo · ${plc?.ref || 'PLC selecionado'}` : 'Tabela do projeto'}${projectName ? ` · ${projectName}` : ''}` })
  const [draft, setDraft] = useState<LadderTag[]>(() => tags.map((tag) => ({ ...tag })))
  const [rowAreas, setRowAreas] = useState<Record<string, SignalArea>>(() => Object.fromEntries(tags.filter((tag) => /^[IQM](?:\d|$)/i.test(tag.address.trim())).map((tag) => [tag.id, tag.address.trim()[0].toUpperCase() as SignalArea])))
  const [area, setArea] = useState<SignalArea>('I')
  const [search, setSearch] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [notice, setNotice] = useState('')
  const [contextInvalidated, setContextInvalidated] = useState(false)
  const mismatch = activePlcId !== initial.current.activePlcId || projectRevision !== initial.current.projectRevision || tags !== initial.current.tags
  useEffect(() => { if (mismatch) setContextInvalidated(true) }, [mismatch])
  const contextChanged = mismatch || contextInvalidated
  const editable = (tag: LadderTag) => !!rowAreas[tag.id] && tag.dataType === 'Bool'
  const errors = signalTagErrors(draft, new Set(draft.filter(editable).map((tag) => tag.id)))
  const visibleRows = draft.filter((tag) => rowAreas[tag.id] === area && normalizeSearch(`${tag.address} ${tag.name} ${tag.comment ?? ''}`).includes(normalizeSearch(search)))
  const preservedCount = draft.filter((tag) => !rowAreas[tag.id] || tag.dataType !== 'Bool').length
  const change = (id: string, patch: Partial<LadderTag>) => setDraft((rows) => rows.map((tag) => tag.id === id && editable(tag) ? { ...tag, ...patch } : tag))
  const add = (nextArea: SignalArea) => {
    const address = nextDeclaredTagAddress(nextArea, draft)
    if (!address) { setNotice('Esta área já não tem endereços livres.'); return }
    const id = crypto.randomUUID()
    setDraft((rows) => [...rows, { id, address, name: '', comment: '', dataType: 'Bool' }])
    setRowAreas((areas) => ({ ...areas, [id]: nextArea }))
    setArea(nextArea)
    setSearch('')
    setNotice('Nova linha no rascunho. Guarde as alterações para a disponibilizar nas sugestões.')
    requestAnimationFrame(() => document.getElementById(`signal-name-${id}`)?.focus())
  }
  const detect = () => {
    const known = new Set(draft.map((tag) => canonicalSignalAddress(tag.address)))
    const addresses = detectGrafcetSignals(useSimStore.getState().grafcet).filter((address) => !known.has(address))
    const added = addresses.map((address): LadderTag => ({ id: crypto.randomUUID(), address, name: '', comment: '', dataType: 'Bool' }))
    setDraft((rows) => [...rows, ...added])
    setRowAreas((areas) => ({ ...areas, ...Object.fromEntries(added.map((tag) => [tag.id, tag.address[0] as SignalArea])) }))
    setNotice(added.length ? `${added.length} sinais adicionados ao rascunho. Ainda não foram guardados.` : 'Não foram encontrados novos endereços I/Q/M no GRAFCET.')
  }
  const importTags = (next: LadderTag[]) => {
    setDraft(next)
    setRowAreas((areas) => ({ ...areas, ...Object.fromEntries(next.filter((tag) => tag.dataType === 'Bool' && isSignalAddress(tag.address)).map((tag) => [tag.id, tag.address.trim()[0].toUpperCase() as SignalArea])) }))
    setNotice('Tabela importada para o rascunho. Ainda não foi guardada.')
  }
  const save = () => {
    setSubmitted(true)
    if (contextChanged) return
    const invalid = draft.find((tag) => editable(tag) && errors.has(tag.id))
    if (invalid) {
      setArea(rowAreas[invalid.id]); setSearch('')
      requestAnimationFrame(() => document.getElementById(`signal-address-${invalid.id}`)?.focus())
      return
    }
    const state = useSimStore.getState()
    if (state.tags !== initial.current.tags) return
    const result = state.setTags(draft.map((tag) => editable(tag) ? { ...tag, address: canonicalSignalAddress(tag.address) } : tag), initial.current)
    if (result) onClose()
  }
  return (
    <PropertyDialog open id="signal-table-dialog" title="Tabela de sinais" subtitle={initial.current.label} onClose={onClose} onSave={save} className="grafcet-signal-table-dialog" saveDisabled={contextChanged}>
      <div className="grafcet-signal-table">
        {contextChanged && <p className="grafcet-property-warning" role="alert">O projeto, o PLC ativo ou a tabela mudou durante esta edição. Feche e abra novamente a tabela para editar o contexto atual. Este rascunho não será gravado.</p>}
        <p className="grafcet-property-note">O endereço é o valor usado no programa; o nome e o comentário servem para encontrar o sinal. Alterar esta documentação não remapeia nem remove ações ou condições.</p>
        <div className="grafcet-signal-table-actions"><div className="grafcet-property-field"><label htmlFor="signal-table-search">Pesquisar sinais</label><input data-initial-focus id="signal-table-search" className="dc-input" value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') event.preventDefault() }} placeholder="Endereço, nome ou comentário…" /></div><button type="button" className="dc-btn" onClick={detect} disabled={contextChanged}>Detetar do GRAFCET</button><TagSheetActions tags={draft} scope={editable} restrict={(tag) => (tag.dataType === 'Bool' && isSignalAddress(tag.address) ? null : 'o GRAFCET só usa bits I, Q ou M (1 a 99); linha ignorada.')} disabled={contextChanged} context="GRAFCET · TABELA DE SINAIS" fileName="sinais-grafcet" onApply={importTags} /></div>
        <div className="grafcet-signal-table-tabs" role="tablist" aria-label="Áreas de sinais">{AREAS.map((section) => <button key={section.area} type="button" role="tab" aria-selected={area === section.area} onClick={() => setArea(section.area)} aria-label={section.title}>{section.title}<span>{draft.filter((tag) => rowAreas[tag.id] === section.area).length}</span></button>)}</div>
        <div className="grafcet-signal-table-section"><div><strong>{AREAS.find((section) => section.area === area)?.title}</strong><p>{AREAS.find((section) => section.area === area)?.hint}</p></div><div className="grafcet-signal-add-actions">{AREAS.map((section) => <button type="button" key={section.area} className="dc-btn" onClick={() => add(section.area)} disabled={contextChanged}>{section.add}</button>)}</div></div>
        <div className="grafcet-signal-table-grid"><table><thead><tr><th>Endereço</th><th>Nome</th><th>Comentário</th><th>Tipo</th><th><span className="sr-only">Remover</span></th></tr></thead><tbody>{visibleRows.map((tag, index) => <tr key={tag.id} className={!editable(tag) ? 'is-preserved' : undefined}>
          <td data-label="Endereço"><input id={`signal-address-${tag.id}`} className="dc-input grafcet-code-input" aria-label={`Endereço da linha ${index + 1}`} value={tag.address} onChange={(event) => change(tag.id, { address: event.target.value })} readOnly={!editable(tag)} aria-invalid={submitted && errors.has(tag.id)} aria-describedby={submitted && errors.has(tag.id) ? `signal-error-${tag.id}` : undefined} />{submitted && errors.has(tag.id) && <p id={`signal-error-${tag.id}`} className="grafcet-field-error" role="alert">{errors.get(tag.id)}</p>}</td>
          <td data-label="Nome"><input id={`signal-name-${tag.id}`} className="dc-input" aria-label={`Nome da linha ${index + 1}`} value={tag.name} onChange={(event) => change(tag.id, { name: event.target.value })} readOnly={!editable(tag)} placeholder="Ex.: Partida geral" /></td>
          <td data-label="Comentário"><input className="dc-input" aria-label={`Comentário da linha ${index + 1}`} value={tag.comment ?? ''} onChange={(event) => change(tag.id, { comment: event.target.value })} readOnly={!editable(tag)} placeholder="Função do sinal" /></td>
          <td data-label="Tipo"><span className="grafcet-signal-data-type">{tag.dataType}</span>{!editable(tag) && <small>Preservado</small>}</td><td><button type="button" onClick={() => setDraft((rows) => rows.filter((row) => row.id !== tag.id))} aria-label={`Remover linha ${index + 1}`} disabled={!editable(tag) || contextChanged}>×</button></td>
        </tr>)}</tbody></table>{!visibleRows.length && <p className="grafcet-signal-empty">{search ? 'Nenhum sinal corresponde à pesquisa nesta área.' : 'Ainda não há sinais nesta área. Adicione uma linha ou detete os endereços do GRAFCET.'}</p>}</div>
        <p className="grafcet-signal-table-notice" role="status">{notice || 'As alterações ficam neste rascunho até guardar.'}</p>
        {!!preservedCount && <details className="grafcet-context-help"><summary>Declarações preservadas ({preservedCount})</summary><div><p>Outras áreas e tipos de dados mantêm-se intactos. Sinais não booleanos não aparecem nas sugestões de bits; edite os seus tipos na tabela Ladder.</p><ul className="grafcet-preserved-signals">{draft.filter((tag) => !rowAreas[tag.id] || tag.dataType !== 'Bool').map((tag) => <li key={tag.id}><code>{tag.address}</code><span>{tag.name}{tag.comment ? ` · ${tag.comment}` : ''}</span><b>{tag.dataType}</b></li>)}</ul></div></details>}
        <p className="grafcet-property-note">A tabela é guardada no projeto completo. A exportação/importação do diagrama GRAFCET transporta apenas o diagrama.</p>
      </div>
    </PropertyDialog>
  )
}
