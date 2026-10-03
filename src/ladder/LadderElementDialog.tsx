import { uiConfirm } from '../ui/dialogs'
import Select from '../ui/Select'
import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import type { LadderCoilType, LadderContactType, LadderDataType, LadderRung } from '../types'
import { IconCoil, IconContact, IconCounter, IconDelete, IconFunction, IconMove, IconTimer } from '../ui/icons'
import { useSimStore } from '../store/useSimStore'
import type { ProjectFile } from './projectFiles'
import type { RungSelection } from './NetworkDiagram'

type EditableSelection = Exclude<NonNullable<RungSelection>, { type: 'insert' }>
type Draft = {
  kind: EditableSelection['type']
  address: string
  tagName: string
  dataType: LadderDataType
  comment: string
  contactType: LadderContactType
  coilType: LadderCoilType
  timerType: NonNullable<LadderRung['timer']>['timerType']
  presetMs: string
  preset2Ms: string
  counterType: NonNullable<LadderRung['counter']>['counterType']
  counterPreset: string
  resetAddress: string
  source: string
  target: string
  targetId: string
}

const EMPTY: Draft = {
  kind: 'contact',
  address: '',
  tagName: '',
  dataType: 'Bool',
  comment: '',
  contactType: 'NO',
  coilType: 'COIL',
  timerType: 'TON',
  presetMs: '3000',
  preset2Ms: '50',
  counterType: 'CTU',
  counterPreset: '5',
  resetAddress: '',
  source: 'I1',
  target: 'M1',
  targetId: 'fc1',
}

const ADDRESS_RE = /^(?:[IQMTC]\d{1,3}|[A-Z_][A-Z0-9_]*\.[A-Z_][A-Z0-9_]*)$/i
const OPERAND_RE = /^(?:TRUE|FALSE|-?\d+(?:\.\d+)?|[IQMTC]\d{1,3}|[A-Z_][A-Z0-9_]*\.[A-Z_][A-Z0-9_]*)$/i
const MOVE_TARGET_RE = /^(?:[QM]\d{1,3}|[A-Z_][A-Z0-9_]*\.[A-Z_][A-Z0-9_]*)$/i

function selectedEntity(rung: LadderRung, selection: EditableSelection) {
  if (selection.type === 'contact') return rung.branches.find((branch) => branch.id === selection.branchId)?.elements.find((element) => element.id === selection.elementId)
  if (selection.type === 'coil') return rung.coils.find((coil) => coil.id === selection.coilId)
  if (selection.type === 'timer') return rung.timer
  if (selection.type === 'counter') return rung.counter
  if (selection.type === 'move') return rung.move
  return rung.call
}

function selectionKey(selection: EditableSelection | null) {
  if (!selection) return ''
  if (selection.type === 'contact') return `contact:${selection.branchId}:${selection.elementId}`
  if (selection.type === 'coil') return `coil:${selection.coilId}`
  return selection.type
}

function defaultDataType(address: string): LadderDataType {
  const prefix = address.trim().toUpperCase().charAt(0)
  return prefix === 'T' ? 'Time' : prefix === 'C' ? 'Int' : 'Bool'
}

function titleFor(kind: Draft['kind']) {
  if (kind === 'contact') return 'Propriedades do contato'
  if (kind === 'coil') return 'Propriedades da bobina'
  if (kind === 'timer') return 'Preset do temporizador'
  if (kind === 'counter') return 'Preset do contador'
  if (kind === 'move') return 'Operação MOVE'
  return 'Chamada de função'
}

function KindIcon({ kind }: { kind: Draft['kind'] }) {
  if (kind === 'contact') return <IconContact size={17} />
  if (kind === 'coil') return <IconCoil size={17} />
  if (kind === 'timer') return <IconTimer size={17} />
  if (kind === 'counter') return <IconCounter size={17} />
  if (kind === 'move') return <IconMove size={17} />
  return <IconFunction size={17} />
}

/** Modal TIA-like aberto por duplo clique num elemento da network. */
export default function LadderElementDialog({
  rung,
  selection,
  functionFiles,
  onClose,
}: {
  rung: LadderRung
  selection: EditableSelection | null
  functionFiles: ProjectFile[]
  onClose: () => void
}) {
  const tags = useSimStore((state) => state.tags)
  const [draft, setDraft] = useState<Draft>(EMPTY)
  const [error, setError] = useState('')
  const key = selectionKey(selection)
  const entity = useMemo(() => selection ? selectedEntity(rung, selection) : null, [rung, key])

  useEffect(() => {
    if (!selection || !entity) return
    const address = 'address' in entity ? entity.address : ''
    const tag = tags.find((item) => item.address === address.toUpperCase())
    setDraft({
      ...EMPTY,
      kind: selection.type,
      address,
      tagName: tag?.name && tag.name !== tag.address ? tag.name : '',
      dataType: tag?.dataType ?? defaultDataType(address),
      comment: tag?.comment ?? ('comment' in entity ? entity.comment ?? '' : ''),
      ...('contactType' in entity ? { contactType: entity.contactType } : {}),
      ...('coilType' in entity ? { coilType: entity.coilType } : {}),
      ...('timerType' in entity ? { timerType: entity.timerType, presetMs: String(entity.presetMs), preset2Ms: String(entity.preset2Ms ?? 50) } : {}),
      ...('counterType' in entity ? { counterType: entity.counterType, counterPreset: String(entity.preset), resetAddress: entity.resetAddress ?? '' } : {}),
      ...('source' in entity ? { source: entity.source, target: entity.target } : {}),
      ...('targetId' in entity ? { targetId: entity.targetId } : {}),
    })
    setError('')
  }, [key, entity, tags])

  useEffect(() => {
    if (!selection) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selection, onClose])

  if (!selection || !entity) return null

  const patch = (next: Partial<Draft>) => setDraft((current) => ({ ...current, ...next }))
  const normalizedAddress = draft.address.trim().replace(/^%/, '').toUpperCase()

  const syncTag = (oldAddress: string, nextAddress: string) => {
    const state = useSimStore.getState()
    const oldTag = state.tags.find((tag) => tag.address === oldAddress.toUpperCase())
    const nextTag = state.tags.find((tag) => tag.address === nextAddress)
    const tagPatch = { name: draft.tagName.trim() || nextAddress, dataType: draft.dataType, comment: draft.comment.trim() }
    if (nextTag) state.updateTag(nextTag.id, tagPatch, 'skip')
    else if (oldTag) state.updateTag(oldTag.id, { ...tagPatch, address: nextAddress }, 'skip')
    else if (draft.tagName.trim() || draft.comment.trim()) useSimStore.setState((current) => ({
      tags: [...current.tags, { id: crypto.randomUUID(), address: nextAddress, ...tagPatch }],
      dirty: true,
    }))
  }

  const save = () => {
    if (draft.kind === 'move') {
      const source = draft.source.trim().toUpperCase()
      const target = draft.target.trim().toUpperCase()
      if (!OPERAND_RE.test(source)) return setError('A origem deve ser um endereço, DB.variável, TRUE/FALSE ou um número.')
      if (!MOVE_TARGET_RE.test(target)) return setError('O destino deve ser Q, M ou uma variável DB válida.')
    } else if (draft.kind !== 'call' && !ADDRESS_RE.test(normalizedAddress)) {
      return setError('Use um endereço válido, por exemplo I1, Q1, M1, T1, C1 ou DB1.Variavel.')
    }

    const state = useSimStore.getState()
    state.updateRung(rung.id, (current) => {
      if (selection.type === 'contact') return {
        ...current,
        branches: current.branches.map((branch) => branch.id === selection.branchId ? {
          ...branch,
          elements: branch.elements.map((element) => element.id === selection.elementId ? { ...element, address: normalizedAddress, contactType: draft.contactType, comment: draft.comment.trim() } : element),
        } : branch),
      }
      if (selection.type === 'coil') return { ...current, coils: current.coils.map((coil) => coil.id === selection.coilId ? { ...coil, address: normalizedAddress, coilType: draft.coilType, comment: draft.comment.trim() } : coil) }
      if (selection.type === 'timer' && current.timer) return { ...current, timer: { ...current.timer, address: normalizedAddress, timerType: draft.timerType, presetMs: Math.max(0, Number(draft.presetMs) || 0), preset2Ms: Math.max(0, Number(draft.preset2Ms) || 0) } }
      if (selection.type === 'counter' && current.counter) return { ...current, counter: { ...current.counter, address: normalizedAddress, counterType: draft.counterType, preset: Math.max(0, Math.trunc(Number(draft.counterPreset) || 0)), resetAddress: draft.resetAddress.trim().replace(/^%/, '').toUpperCase() } }
      if (selection.type === 'move' && current.move) return { ...current, move: { source: draft.source.trim().toUpperCase(), target: draft.target.trim().toUpperCase() } }
      if (selection.type === 'call' && current.call) return { ...current, call: { targetId: draft.targetId } }
      return current
    }, 'force')
    if (draft.kind !== 'move' && draft.kind !== 'call' && 'address' in entity) syncTag(entity.address, normalizedAddress)
    onClose()
  }

  const remove = async () => {
    if (!await uiConfirm(`Eliminar ${titleFor(draft.kind).toLocaleLowerCase('pt-PT')} desta network?`)) return
    const state = useSimStore.getState()
    state.updateRung(rung.id, (current) => {
      if (selection.type === 'contact') return { ...current, branches: current.branches.map((branch) => branch.id === selection.branchId ? { ...branch, elements: branch.elements.filter((element) => element.id !== selection.elementId) } : branch) }
      if (selection.type === 'coil') return { ...current, coils: current.coils.filter((coil) => coil.id !== selection.coilId) }
      if (selection.type === 'timer') return { ...current, timer: undefined }
      if (selection.type === 'counter') return { ...current, counter: undefined }
      if (selection.type === 'move') return { ...current, move: undefined }
      return { ...current, call: undefined }
    }, 'force')
    onClose()
  }

  const commonFields = draft.kind !== 'move' && draft.kind !== 'call'
  return createPortal(<div className="ladder-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section className="ladder-element-dialog" role="dialog" aria-modal="true" aria-labelledby="ladder-element-dialog-title">
      <header>
        <span className="ladder-dialog-icon"><KindIcon kind={draft.kind} /></span>
        <div><strong id="ladder-element-dialog-title">{titleFor(draft.kind)}</strong><small>Network: {rung.name || 'sem título'} · duplo clique para reabrir</small></div>
        <button type="button" className="ladder-dialog-close" onClick={onClose} aria-label="Fechar">×</button>
      </header>
      <form onSubmit={(event) => { event.preventDefault(); save() }}>
        <div className="ladder-dialog-body">
          {commonFields && <section className="ladder-dialog-section">
            <h3>Identificação</h3>
            <div className="ladder-dialog-grid">
              <label><span>Endereço absoluto</span><input autoFocus list="ladder-tag-addresses" value={draft.address} onChange={(event) => patch({ address: event.target.value.toUpperCase() })} placeholder="I1" /></label>
              <label><span>Nome simbólico</span><input value={draft.tagName} onChange={(event) => patch({ tagName: event.target.value })} placeholder="Ex.: Botao_Start" /></label>
              <label><span>Tipo de dados</span><Select value={draft.dataType} onChange={(event) => patch({ dataType: event.target.value as LadderDataType })}><option>Bool</option><option>Time</option><option>Int</option><option>Real</option></Select></label>
              <label className="is-wide"><span>Comentário</span><input value={draft.comment} onChange={(event) => patch({ comment: event.target.value })} placeholder="Descrição funcional do sinal" /></label>
            </div>
          </section>}

          {draft.kind === 'contact' && <section className="ladder-dialog-section"><h3>Comportamento do contato</h3><div className="ladder-choice-grid">
            {([['NO', 'NA', 'Normal aberto'], ['NC', 'NF', 'Normal fechado'], ['RISING', 'P', 'Borda de subida'], ['FALLING', 'N', 'Borda de descida']] as const).map(([value, label, detail]) => <button type="button" key={value} className={draft.contactType === value ? 'is-selected' : ''} onClick={() => patch({ contactType: value })}><strong>{label}</strong><small>{detail}</small></button>)}
          </div></section>}

          {draft.kind === 'coil' && <section className="ladder-dialog-section"><h3>Modo da bobina</h3><div className="ladder-choice-grid is-three">
            {([['COIL', 'Bobina', 'Segue o RLO'], ['SET', 'SET', 'Retém em 1'], ['RESET', 'RESET', 'Repõe em 0']] as const).map(([value, label, detail]) => <button type="button" key={value} className={draft.coilType === value ? 'is-selected' : ''} onClick={() => patch({ coilType: value })}><strong>{label}</strong><small>{detail}</small></button>)}
          </div></section>}

          {draft.kind === 'timer' && <section className="ladder-dialog-section"><h3>Temporização</h3><div className="ladder-dialog-grid">
            <label><span>Função</span><Select value={draft.timerType} onChange={(event) => patch({ timerType: event.target.value as Draft['timerType'] })}><option value="TON">TON — atraso à ligação</option><option value="TOF">TOF — atraso à desligação</option><option value="TP">TP — pulso</option><option value="STAR_DELTA">Estrela–Triângulo</option></Select></label>
            <label><span>Preset PT (ms)</span><input type="number" min="0" step="10" value={draft.presetMs} onChange={(event) => patch({ presetMs: event.target.value })} /></label>
            {draft.timerType === 'STAR_DELTA' && <label><span>Tempo morto (ms)</span><input type="number" min="0" step="10" value={draft.preset2Ms} onChange={(event) => patch({ preset2Ms: event.target.value })} /></label>}
          </div><div className="ladder-preset-row"><span>Presets:</span>{[100, 500, 1000, 3000, 5000, 10000].map((value) => <button type="button" key={value} className={Number(draft.presetMs) === value ? 'is-selected' : ''} onClick={() => patch({ presetMs: String(value) })}>{value >= 1000 ? `${value / 1000}s` : `${value}ms`}</button>)}</div></section>}

          {draft.kind === 'counter' && <section className="ladder-dialog-section"><h3>Contagem</h3><div className="ladder-dialog-grid">
            <label><span>Função</span><Select value={draft.counterType} onChange={(event) => patch({ counterType: event.target.value as Draft['counterType'] })}><option value="CTU">CTU — crescente</option><option value="CTD">CTD — decrescente</option></Select></label>
            <label><span>Preset PV</span><input type="number" min="0" step="1" value={draft.counterPreset} onChange={(event) => patch({ counterPreset: event.target.value })} /></label>
            <label><span>Entrada de reset</span><input list="ladder-tag-addresses" value={draft.resetAddress} onChange={(event) => patch({ resetAddress: event.target.value.toUpperCase() })} placeholder="M1" /></label>
          </div><div className="ladder-preset-row"><span>Presets:</span>{[1, 5, 10, 25, 50, 100].map((value) => <button type="button" key={value} className={Number(draft.counterPreset) === value ? 'is-selected' : ''} onClick={() => patch({ counterPreset: String(value) })}>{value}</button>)}</div></section>}

          {draft.kind === 'move' && <section className="ladder-dialog-section"><h3>Operadores</h3><div className="ladder-dialog-grid">
            <label><span>IN — origem</span><input autoFocus list="ladder-tag-addresses" value={draft.source} onChange={(event) => patch({ source: event.target.value.toUpperCase() })} placeholder="I1 ou DB1.Value" /></label>
            <label><span>OUT — destino</span><input list="ladder-tag-addresses" value={draft.target} onChange={(event) => patch({ target: event.target.value.toUpperCase() })} placeholder="M1 ou DB1.Value" /></label>
          </div><p className="ladder-dialog-help">Aceita BOOL, INT e REAL. A cópia só ocorre quando o resultado lógico da network é verdadeiro.</p></section>}

          {draft.kind === 'call' && <section className="ladder-dialog-section"><h3>Bloco chamado</h3><label className="ladder-dialog-full-label"><span>Função FC</span><Select autoFocus value={draft.targetId} onChange={(event) => patch({ targetId: event.target.value })}><option value="fc1">FC1 [FC1]</option><option value="fc2">FC2 [FC2]</option>{functionFiles.filter((file) => file.folder === 'programBlocks').map((file) => <option key={file.id} value={file.id}>{file.name}</option>)}</Select></label><p className="ladder-dialog-help">O bloco é executado quando o RLO da network é 1. Chamadas recursivas são bloqueadas.</p></section>}

          {error && <p className="ladder-dialog-error" role="alert">{error}</p>}
        </div>
        <footer>
          <button type="button" className="ladder-dialog-delete" onClick={remove}><IconDelete size={13} /> Eliminar elemento</button>
          <span />
          <button type="button" className="dc-btn" onClick={onClose}>Cancelar</button>
          <button type="submit" className="dc-btn dc-btn-primary">Aplicar alterações</button>
        </footer>
      </form>
    </section>
  </div>, document.body)
}
