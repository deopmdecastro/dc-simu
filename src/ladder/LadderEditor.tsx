import { useState, type ReactNode } from 'react'
import { useSimStore } from '../store/useSimStore'
import TagTable from './TagTable'
import type { LadderContact, LadderRung, LadderContactType, LadderCoilType, LadderCoilEl, ComponentType } from '../types'
import {
  IconPlus, IconBranch, IconContact, IconCoil, IconTimer, IconCounter, IconDelete, IconCopy,
  IconZoomIn, IconZoomOut, IconSchematic, IconLadder, IconCompare, IconMath, IconMove,
  IconFunction, IconUndo, IconRedo, IconChevronDown, IconChevronRight, IconShield,
  IconGrid, IconTag, IconMonitor, IconSave, IconFile, IconOpen, IconProjects, IconCube,
} from '../ui/icons'

/* ------------------------------------------------------------------ helpers */

/** id do <datalist> com os endereços já nomeados na Tabela de Tags, usado
 *  para sugerir endereços (com autocompletar) em todos os campos de endereço
 *  do editor — tal como o TIA Portal sugere tags existentes ao digitar. */
const TAG_DATALIST_ID = 'ladder-tag-addresses'

const CONTACT_LABEL: Record<LadderContactType, string> = { NO: 'NA', NC: 'NF', RISING: '↑B', FALLING: '↓B' }

type RungSelection =
  | { type: 'insert' }
  | { type: 'contact'; branchId: string; elementId: string }
  | { type: 'coil'; coilId: string }
  | { type: 'timer' }
  | { type: 'counter' }
  | { type: 'function' }
  | null

function TagAddressDatalist() {
  const tags = useSimStore((s) => s.tags)
  return (
    <datalist id={TAG_DATALIST_ID}>
      {tags.map((t) => (
        <option key={t.id} value={t.address}>
          {t.name !== t.address ? t.name : ''}
        </option>
      ))}
    </datalist>
  )
}

/** Nome simbólico da tag associada a um endereço, se existir e for diferente
 *  do próprio endereço (senão não haveria nada de útil a mostrar). */
function useTagName(address: string): string | null {
  const tag = useSimStore((s) => s.tags.find((t) => t.address === address.toUpperCase()))
  return tag && tag.name && tag.name !== tag.address ? tag.name : null
}

/**
 * Contato Ladder desenhado graficamente (barras verticais estilo IEC 61131),
 * com estados nítidos: energizado (verde) / inativo (cinza).
 */
function ContactSymbol({ el, table, selected = false }: { el: LadderContact; table: Record<string, boolean>; selected?: boolean }) {
  const raw = !!table[el.address]
  const powered = el.contactType === 'NC' ? !raw : raw
  const tagName = useTagName(el.address)
  const slash = el.contactType === 'NC'
  const edge = el.contactType === 'RISING' || el.contactType === 'FALLING'
  return (
    <div className={`ladder-contact-symbol ${powered ? 'is-powered' : ''} ${selected ? 'is-selected' : ''}`} title={tagName ?? undefined}>
      <div className="ladder-symbol-address">{el.address}</div>
      <svg width="54" height="30" viewBox="0 0 54 30" aria-hidden>
        <line x1="0" y1="15" x2="15" y2="15" />
        <line x1="39" y1="15" x2="54" y2="15" />
        <line x1="18" y1="5" x2="18" y2="25" />
        <line x1="36" y1="5" x2="36" y2="25" />
        {slash && <line x1="14" y1="25" x2="40" y2="5" />}
        {edge && (
          <text x="27" y="18.5" fontSize="10" fontWeight="700" textAnchor="middle" fontFamily="ui-monospace, monospace">
            {el.contactType === 'RISING' ? 'P' : 'N'}
          </text>
        )}
      </svg>
      <div className="ladder-symbol-kind">{CONTACT_LABEL[el.contactType]}</div>
      {tagName && <div className="ladder-symbol-tag">{tagName}</div>}
    </div>
  )
}

/** Bobina desenhada como ( endereço ) com o tipo (SET/RESET) indicado. */
function CoilButton({ coil, powered, selected = false, onCycle, onRemove, onSelect }: { coil: LadderCoilEl; powered: boolean; selected?: boolean; onCycle: () => void; onRemove: () => void; onSelect?: () => void }) {
  const tagName = useTagName(coil.address)
  return (
    <button
      onClick={onSelect ?? onCycle}
      onContextMenu={(e) => {
        e.preventDefault()
        onRemove()
      }}
      title={`Clique alterna COIL → SET → RESET · botão direito remove${tagName ? ` · ${tagName}` : ''}`}
      className={`ladder-coil-symbol ${selected ? 'is-selected' : ''} flex items-center gap-1.5 px-2 py-1 rounded-[5px] font-mono text-[11px] font-semibold border-2 transition-colors ${
        powered ? 'border-state-run text-emerald-800 bg-state-runbg' : 'border-line-strong text-ink-400 bg-white'
      }`}
    >
      <span className="text-[13px] leading-none">(</span>
      <span>{coil.address}</span>
      {coil.coilType !== 'COIL' && <span className="text-[8px] font-bold px-1 rounded bg-ink-900/5">{coil.coilType}</span>}
      <span className="text-[13px] leading-none">)</span>
      {tagName && <span className="text-[8px] font-normal text-ink-400 max-w-[70px] truncate">{tagName}</span>}
    </button>
  )
}

function BlockButton({
  label,
  address,
  detail,
  powered,
  selected = false,
  onSelect,
  onRemove,
}: {
  label: string
  address: string
  detail: string
  powered: boolean
  selected?: boolean
  onSelect: () => void
  onRemove: () => void
}) {
  return (
    <button
      className={`ladder-block-symbol ${powered ? 'is-powered' : ''} ${selected ? 'is-selected' : ''}`}
      onClick={onSelect}
      onContextMenu={(e) => {
        e.preventDefault()
        onRemove()
      }}
      title="Clique para configurar · botão direito remove"
    >
      <span className="ladder-symbol-address">{address}</span>
      <strong>{label}</strong>
      <small>{detail}</small>
    </button>
  )
}

/* --------------------------------------------------------------- editor row */

function RungRow({ rung, index }: { rung: LadderRung; index: number }) {
  const table = useSimStore((s) => s.runtime.table)
  const rungPowered = useSimStore((s) => s.runtime.rungPowered)
  const running = useSimStore((s) => s.sim.runState === 'running')
  const grid = useSimStore((s) => s.grid)
  const { deleteRung, duplicateRung, moveRung, renameRung, updateRung } = useSimStore()
  const [newAddress, setNewAddress] = useState('I1')
  const [newType, setNewType] = useState<LadderContactType>('NO')
  const [branchIndex, setBranchIndex] = useState(0)
  const [coilAddress, setCoilAddress] = useState('Q1')
  const [coilType, setCoilType] = useState<LadderCoilType>('COIL')
  const [selection, setSelection] = useState<RungSelection>(null)
  const [dragBranchId, setDragBranchId] = useState<string | null>(null)
  const [coilDragOver, setCoilDragOver] = useState(false)

  const powered = !!rungPowered[rung.id]
  const selectedContact =
    selection?.type === 'contact'
      ? rung.branches.find((b) => b.id === selection.branchId)?.elements.find((el) => el.id === selection.elementId)
      : null
  const selectedCoil = selection?.type === 'coil' ? rung.coils.find((c) => c.id === selection.coilId) : null
  const selectedAddress = selectedContact?.address ?? selectedCoil?.address ?? rung.timer?.address ?? rung.counter?.address ?? ''
  const selectedTagName = useTagName(selectedAddress)

  const updateContact = (branchId: string, elementId: string, patch: Partial<LadderContact>) =>
    updateRung(rung.id, (r) => ({
      ...r,
      branches: r.branches.map((b) =>
        b.id === branchId ? { ...b, elements: b.elements.map((e) => (e.id === elementId ? { ...e, ...patch } : e)) } : b,
      ),
    }))

  const updateCoil = (coilId: string, patch: Partial<LadderCoilEl>) =>
    updateRung(rung.id, (r) => ({ ...r, coils: r.coils.map((c) => (c.id === coilId ? { ...c, ...patch } : c)) }))

  const updateTimer = (patch: Partial<NonNullable<LadderRung['timer']>>) =>
    updateRung(rung.id, (r) => (r.timer ? { ...r, timer: { ...r.timer, ...patch } } : r))

  const updateCounter = (patch: Partial<NonNullable<LadderRung['counter']>>) =>
    updateRung(rung.id, (r) => (r.counter ? { ...r, counter: { ...r.counter, ...patch } } : r))

  const addContact = () => {
    const elementId = `${rung.id}-c${Date.now()}${Math.random().toString(36).slice(2, 5)}`
    updateRung(rung.id, (r) => {
      const branches = r.branches.length ? [...r.branches] : [{ id: r.id + '-b0', elements: [] }]
      const idx = Math.min(branchIndex, branches.length - 1)
      branches[idx] = {
        ...branches[idx],
        elements: [...branches[idx].elements, { kind: 'contact', id: elementId, address: newAddress.toUpperCase(), contactType: newType }],
      }
      return { ...r, branches }
    })
    setSelection({ type: 'contact', branchId: rung.branches[Math.min(branchIndex, Math.max(0, rung.branches.length - 1))]?.id ?? `${rung.id}-b0`, elementId })
  }

  const addBranch = () => {
    updateRung(rung.id, (r) => ({ ...r, branches: [...r.branches, { id: `${rung.id}-b${Date.now()}`, elements: [] }] }))
    setBranchIndex(rung.branches.length)
  }

  const removeElement = (branchId: string, elementId: string) => {
    updateRung(rung.id, (r) => ({
      ...r,
      branches: r.branches.map((b) => (b.id === branchId ? { ...b, elements: b.elements.filter((e) => e.id !== elementId) } : b)),
    }))
    if (selection?.type === 'contact' && selection.elementId === elementId) setSelection({ type: 'insert' })
  }

  const toggleContactType = (branchId: string, elementId: string) =>
    updateRung(rung.id, (r) => ({
      ...r,
      branches: r.branches.map((b) =>
        b.id === branchId
          ? { ...b, elements: b.elements.map((e) => (e.id === elementId ? { ...e, contactType: (['NO', 'NC', 'RISING', 'FALLING'] as LadderContactType[])[((['NO', 'NC', 'RISING', 'FALLING'] as LadderContactType[]).indexOf(e.contactType) + 1) % 4] } : e)) }
          : b,
      ),
    }))

  const addCoil = () => {
    const coilId = `${rung.id}-k${Date.now()}`
    updateRung(rung.id, (r) => ({ ...r, coils: [...r.coils, { kind: 'coil', id: coilId, address: coilAddress.toUpperCase(), coilType }] }))
    setSelection({ type: 'coil', coilId })
  }

  const removeCoil = (id: string) => {
    updateRung(rung.id, (r) => ({ ...r, coils: r.coils.filter((c) => c.id !== id) }))
    if (selection?.type === 'coil' && selection.coilId === id) setSelection({ type: 'insert' })
  }

  const cycleCoil = (id: string) =>
    updateRung(rung.id, (r) => ({
      ...r,
      coils: r.coils.map((c) => (c.id === id ? { ...c, coilType: (['COIL', 'SET', 'RESET'] as LadderCoilType[])[((['COIL', 'SET', 'RESET'] as LadderCoilType[]).indexOf(c.coilType) + 1) % 3] } : c)),
    }))

  const setTimer = (kind: 'TON' | 'TOF' | 'TP' | 'STAR_DELTA' | 'none') => {
    if (kind === 'none') updateRung(rung.id, (r) => ({ ...r, timer: undefined }))
    else updateRung(rung.id, (r) => ({ ...r, timer: { kind: 'timer', id: r.timer?.id ?? `${rung.id}-t`, address: r.timer?.address ?? 'T1', timerType: kind, presetMs: r.timer?.presetMs ?? 3000, preset2Ms: r.timer?.preset2Ms ?? 50 } }))
    setSelection(kind === 'none' ? { type: 'insert' } : { type: 'timer' })
  }

  const setCounter = (kind: 'CTU' | 'CTD' | 'none') => {
    if (kind === 'none') updateRung(rung.id, (r) => ({ ...r, counter: undefined }))
    else updateRung(rung.id, (r) => ({ ...r, counter: { kind: 'counter', id: r.counter?.id ?? `${rung.id}-c`, address: r.counter?.address ?? 'C1', counterType: kind, preset: r.counter?.preset ?? 5, resetAddress: r.counter?.resetAddress ?? 'M9' } }))
    setSelection(kind === 'none' ? { type: 'insert' } : { type: 'counter' })
  }

  /** Solta um elemento arrastado da paleta diretamente num ramo desta network
   *  (contato) ou no banco de bobinas — reforça o "carregar e soltar" do editor. */
  const dropContactOnBranch = (branchId: string, kind: PaletteKind) => {
    if (kind === 'NO' || kind === 'NC' || kind === 'RISING' || kind === 'FALLING') {
      const elementId = `${rung.id}-c${Date.now()}${Math.random().toString(36).slice(2, 5)}`
      updateRung(rung.id, (r) => ({
        ...r,
        branches: r.branches.map((b) => (b.id === branchId ? { ...b, elements: [...b.elements, { kind: 'contact', id: elementId, address: 'I1', contactType: kind }] } : b)),
      }))
      setSelection({ type: 'contact', branchId, elementId })
    } else {
      dropOnCoilBank(kind)
    }
  }

  const dropOnCoilBank = (kind: PaletteKind) => {
    if (kind === 'COIL' || kind === 'SET' || kind === 'RESET') {
      const coilId = `${rung.id}-k${Date.now()}`
      updateRung(rung.id, (r) => ({ ...r, coils: [...r.coils, { kind: 'coil', id: coilId, address: 'Q1', coilType: kind }] }))
      setSelection({ type: 'coil', coilId })
    } else if (kind === 'TON' || kind === 'TOF' || kind === 'TP') {
      setTimer(kind)
    } else if (kind === 'CTU' || kind === 'CTD') {
      setCounter(kind)
    }
  }

  const smallBtn = 'dc-btn !h-[22px] !px-1.5 !text-[10px]'
  const tiny = 'dc-input !h-[22px] !text-[10px] !w-auto'
  return (
    <div className={`ladder-rung-card ${powered && running ? 'is-powered' : ''}`}>
      {/* cabeçalho do rung */}
      <div className="ladder-rung-header">
        <span
          className={`inline-flex items-center justify-center h-4 min-w-[20px] px-1 rounded-[3px] font-mono text-[10px] font-bold ${
            powered && running ? 'bg-state-run text-white' : 'bg-surface-sunken text-ink-500 border border-line'
          }`}
          title="Número do rung"
        >
          {index + 1}
        </span>
        <input
          className="bg-transparent outline-none text-[11px] font-medium text-ink-900 flex-1 min-w-0 focus:bg-brand-50 focus:px-1 rounded"
          value={rung.name}
          onChange={(e) => renameRung(rung.id, e.target.value)}
        />
        <span className={`ladder-rung-live ${powered && running ? 'is-on' : ''}`}>
          <i />
          {powered && running ? 'energizado' : 'aberto'}
        </span>
        <label className="flex items-center gap-1 text-[10px] text-ink-400 cursor-pointer" title="Rung habilitado para execução">
          <input type="checkbox" checked={rung.enabled} onChange={(e) => updateRung(rung.id, (r) => ({ ...r, enabled: e.target.checked }))} />
          ativo
        </label>
        <div className="flex gap-0.5">
          <button className={smallBtn} title="Adicionar/configurar elementos" onClick={() => setSelection(selection?.type === 'insert' ? null : { type: 'insert' })}><IconPlus size={10} /></button>
          <button className={smallBtn} title="Mover para cima" onClick={() => moveRung(rung.id, -1)}>↑</button>
          <button className={smallBtn} title="Mover para baixo" onClick={() => moveRung(rung.id, 1)}>↓</button>
          <button className={smallBtn} title="Duplicar rung" onClick={() => duplicateRung(rung.id)}><IconCopy size={10} /></button>
          <button className={`${smallBtn} !text-state-error`} title="Excluir rung" onClick={() => deleteRung(rung.id)}><IconDelete size={10} /></button>
        </div>
      </div>

      {/* diagrama */}
      <div className="ladder-rung-body">
        <div
          className={`ladder-diagram-scroll ${grid.enabled ? (grid.style === 'lines' ? 'grid-lines' : 'grid-dots') : 'grid-off'}`}
          style={grid.enabled ? { backgroundSize: `${grid.size}px ${grid.size}px` } : undefined}
        >
        <div className="ladder-diagram">
          {/* barramento L+ */}
          <div className="ladder-rail ladder-rail-left">
            <span className="ladder-rail-label">L+</span>
            <div className={`ladder-rail-bar ${powered && running ? 'is-powered' : ''}`} />
          </div>

          {/* ramos */}
          <div className="ladder-branch-stack">
            {rung.branches.length > 1 && (
              <>
                <div className={`ladder-branch-join is-start ${powered && running ? 'is-powered' : ''}`} />
                <div className={`ladder-branch-join is-end ${powered && running ? 'is-powered' : ''}`} />
              </>
            )}
            {rung.branches.map((b, bi) => (
              <div
                key={b.id}
                className={`ladder-branch-row ${dragBranchId === b.id ? 'drag-over' : ''}`}
                onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy' }}
                onDragEnter={() => setDragBranchId(b.id)}
                onDragLeave={() => setDragBranchId((cur) => (cur === b.id ? null : cur))}
                onDrop={(e) => {
                  e.preventDefault()
                  setDragBranchId(null)
                  const compType = e.dataTransfer.getData('text/plain') as ComponentType
                  const kind = COMPONENT_TO_LADDER[compType]
                  if (kind) dropContactOnBranch(b.id, kind)
                }}
              >
                <div className={`ladder-wire is-stub ${powered && running ? 'is-powered' : ''}`} />
                {b.elements.map((el) => (
                  <div key={el.id} className="ladder-inline-element">
                    <button
                      title="Clique para configurar · duplo clique alterna o tipo"
                      onClick={() => setSelection({ type: 'contact', branchId: b.id, elementId: el.id })}
                      onDoubleClick={() => toggleContactType(b.id, el.id)}
                      className="ladder-symbol-button"
                    >
                      <ContactSymbol el={el} table={table} selected={selection?.type === 'contact' && selection.elementId === el.id} />
                    </button>
                    <div
                      className="ladder-wire is-fill"
                      style={{ borderTopColor: powered && running ? '#16a34a' : '#2655e5' }}
                    />
                  </div>
                ))}
                {!b.elements.length && <div className="ladder-wire is-empty" title="Ramo vazio — arraste um elemento da paleta para aqui" />}
                {rung.branches.length > 1 && (
                  <button className="ladder-branch-remove" title="Remover ramo" onClick={() => updateRung(rung.id, (r) => ({ ...r, branches: r.branches.filter((bb) => bb.id !== b.id) }))}>
                    <IconDelete size={9} />
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* temporizador / contador — bloco compacto, parâmetros só no clique */}
          {(rung.timer || rung.counter) && (
            <>
              <div className={`ladder-wire is-link ${powered && running ? 'is-powered' : ''}`} />
              <div className="ladder-instruction-blocks">
                {rung.timer && (
                  <BlockButton
                    label={rung.timer.timerType}
                    address={rung.timer.address}
                    detail={rung.timer.timerType === 'STAR_DELTA' ? `${rung.timer.presetMs}/${rung.timer.preset2Ms ?? 50} ms` : `${rung.timer.presetMs} ms`}
                    powered={!!table[rung.timer.address]}
                    selected={selection?.type === 'timer'}
                    onSelect={() => setSelection(selection?.type === 'timer' ? null : { type: 'timer' })}
                    onRemove={() => setTimer('none')}
                  />
                )}
                {rung.counter && (
                  <BlockButton
                    label={rung.counter.counterType}
                    address={rung.counter.address}
                    detail={`PV ${rung.counter.preset}`}
                    powered={!!table[rung.counter.address]}
                    selected={selection?.type === 'counter'}
                    onSelect={() => setSelection(selection?.type === 'counter' ? null : { type: 'counter' })}
                    onRemove={() => setCounter('none')}
                  />
                )}
              </div>
            </>
          )}

          <div className={`ladder-wire is-link ${powered && running ? 'is-powered' : ''}`} />
          {/* saídas + barramento L− */}
          <div
            className={`ladder-coil-bank ${coilDragOver ? 'drag-over' : ''}`}
            onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy' }}
            onDragEnter={() => setCoilDragOver(true)}
            onDragLeave={() => setCoilDragOver(false)}
            onDrop={(e) => {
              e.preventDefault()
              setCoilDragOver(false)
              const compType = e.dataTransfer.getData('text/plain') as ComponentType
              const kind = COMPONENT_TO_LADDER[compType]
              if (kind) dropOnCoilBank(kind)
            }}
          >
            {rung.coils.map((c) => (
              <CoilButton
                key={c.id}
                coil={c}
                powered={!!table[c.address]}
                selected={selection?.type === 'coil' && selection.coilId === c.id}
                onCycle={() => cycleCoil(c.id)}
                onRemove={() => removeCoil(c.id)}
                onSelect={() => setSelection(selection?.type === 'coil' && selection.coilId === c.id ? null : { type: 'coil', coilId: c.id })}
              />
            ))}
            {!rung.coils.length && <span className="text-[10px] text-ink-300">sem bobina</span>}
          </div>
          <div className="ladder-rail ladder-rail-right">
            <div className={`ladder-rail-bar ${powered && running ? 'is-powered' : ''}`} />
            <span className="ladder-rail-label">L−</span>
          </div>
        </div>
        </div>
      </div>

      {/* painel contextual — configurações feitas ao clicar num elemento */}
      {selection?.type === 'contact' && selectedContact && (
        <div className="ladder-block-popover">
          <div className="ladder-popover-head">
            <strong><IconContact size={12} /> Contato {selectedContact.address}</strong>
            <button className="ladder-ghost-button" onClick={() => setSelection(null)} title="Fechar">×</button>
          </div>
          <label>Endereço <input className={`${tiny} !w-14 font-mono`} list={TAG_DATALIST_ID} value={selectedContact.address} onChange={(e) => updateContact(selection.branchId, selection.elementId, { address: e.target.value.toUpperCase() })} /></label>
          <label>Tipo
            <select className={tiny} value={selectedContact.contactType} onChange={(e) => updateContact(selection.branchId, selection.elementId, { contactType: e.target.value as LadderContactType })}>
              <option value="NO">NA</option>
              <option value="NC">NF</option>
              <option value="RISING">Subida</option>
              <option value="FALLING">Descida</option>
            </select>
          </label>
          {selectedTagName && <span className="text-[10px] text-ink-400">{selectedTagName}</span>}
          <button className={`${smallBtn} !text-state-error ml-auto`} onClick={() => removeElement(selection.branchId, selection.elementId)}><IconDelete size={10} /> remover</button>
        </div>
      )}
      {selection?.type === 'coil' && selectedCoil && (
        <div className="ladder-block-popover">
          <div className="ladder-popover-head">
            <strong><IconCoil size={12} /> Bobina {selectedCoil.address}</strong>
            <button className="ladder-ghost-button" onClick={() => setSelection(null)} title="Fechar">×</button>
          </div>
          <label>Endereço <input className={`${tiny} !w-14 font-mono`} list={TAG_DATALIST_ID} value={selectedCoil.address} onChange={(e) => updateCoil(selectedCoil.id, { address: e.target.value.toUpperCase() })} /></label>
          <label>Tipo
            <select className={tiny} value={selectedCoil.coilType} onChange={(e) => updateCoil(selectedCoil.id, { coilType: e.target.value as LadderCoilType })}>
              <option value="COIL">COIL</option>
              <option value="SET">SET</option>
              <option value="RESET">RESET</option>
            </select>
          </label>
          {selectedTagName && <span className="text-[10px] text-ink-400">{selectedTagName}</span>}
          <button className={`${smallBtn} !text-state-error ml-auto`} onClick={() => removeCoil(selectedCoil.id)}><IconDelete size={10} /> remover</button>
        </div>
      )}
      {selection?.type === 'timer' && rung.timer && (
        <div className="ladder-block-popover">
          <div className="ladder-popover-head">
            <strong><IconTimer size={12} /> Temporizador {rung.timer.address}</strong>
            <button className="ladder-ghost-button" onClick={() => setSelection(null)} title="Fechar">×</button>
          </div>
          <label>Tipo
            <select className={tiny} value={rung.timer.timerType} onChange={(e) => updateTimer({ timerType: e.target.value as NonNullable<LadderRung['timer']>['timerType'] })}>
              <option value="TON">TON</option>
              <option value="TOF">TOF</option>
              <option value="TP">TP</option>
              <option value="STAR_DELTA">Estrela-Triângulo</option>
            </select>
          </label>
          <label>Endereço <input className={`${tiny} !w-14 font-mono`} list={TAG_DATALIST_ID} value={rung.timer.address} onChange={(e) => updateTimer({ address: e.target.value.toUpperCase() })} /></label>
          <label>Preset <input type="number" className={`${tiny} !w-20`} value={rung.timer.presetMs} onChange={(e) => updateTimer({ presetMs: Number(e.target.value) })} /> ms</label>
          {rung.timer.timerType === 'STAR_DELTA' && (
            <label>Transição <input type="number" className={`${tiny} !w-16`} value={rung.timer.preset2Ms ?? 50} onChange={(e) => updateTimer({ preset2Ms: Number(e.target.value) })} /> ms</label>
          )}
          <button className={`${smallBtn} !text-state-error ml-auto`} onClick={() => setTimer('none')}><IconDelete size={10} /> remover</button>
        </div>
      )}
      {selection?.type === 'counter' && rung.counter && (
        <div className="ladder-block-popover">
          <div className="ladder-popover-head">
            <strong><IconCounter size={12} /> Contador {rung.counter.address}</strong>
            <button className="ladder-ghost-button" onClick={() => setSelection(null)} title="Fechar">×</button>
          </div>
          <label>Tipo
            <select className={tiny} value={rung.counter.counterType} onChange={(e) => updateCounter({ counterType: e.target.value as NonNullable<LadderRung['counter']>['counterType'] })}>
              <option value="CTU">CTU (crescente)</option>
              <option value="CTD">CTD (decrescente)</option>
            </select>
          </label>
          <label>Endereço <input className={`${tiny} !w-14 font-mono`} list={TAG_DATALIST_ID} value={rung.counter.address} onChange={(e) => updateCounter({ address: e.target.value.toUpperCase() })} /></label>
          <label>Preset <input type="number" className={`${tiny} !w-16`} value={rung.counter.preset} onChange={(e) => updateCounter({ preset: Number(e.target.value) })} /></label>
          <label>Reset <input className={`${tiny} !w-14 font-mono`} list={TAG_DATALIST_ID} value={rung.counter.resetAddress ?? ''} onChange={(e) => updateCounter({ resetAddress: e.target.value.toUpperCase() })} /></label>
          <button className={`${smallBtn} !text-state-error ml-auto`} onClick={() => setCounter('none')}><IconDelete size={10} /> remover</button>
        </div>
      )}

      {/* inserção */}
      <div className="ladder-insert-bar">
        <input className={`${tiny} !w-14 font-mono`} list={TAG_DATALIST_ID} value={newAddress} onChange={(e) => setNewAddress(e.target.value.toUpperCase())} placeholder="I1" />
        <select className={tiny} value={newType} onChange={(e) => setNewType(e.target.value as LadderContactType)}>
          <option value="NO">NA</option>
          <option value="NC">NF</option>
          <option value="RISING">Subida</option>
          <option value="FALLING">Descida</option>
        </select>
        <select className={tiny} value={branchIndex} onChange={(e) => setBranchIndex(Number(e.target.value))}>
          {rung.branches.map((_, i) => (
            <option key={i} value={i}>ramo {i + 1}</option>
          ))}
        </select>
        <button className={smallBtn} onClick={addContact}><IconContact size={10} /> contato</button>
        <button className={smallBtn} onClick={addBranch}><IconBranch size={10} /> ramo (OR)</button>
        <span className="h-3 w-px bg-line" />
        <input className={`${tiny} !w-14 font-mono`} list={TAG_DATALIST_ID} value={coilAddress} onChange={(e) => setCoilAddress(e.target.value.toUpperCase())} placeholder="Q1" />
        <select className={tiny} value={coilType} onChange={(e) => setCoilType(e.target.value as LadderCoilType)}>
          <option value="COIL">COIL</option>
          <option value="SET">SET</option>
          <option value="RESET">RESET</option>
        </select>
        <button className={smallBtn} onClick={addCoil}><IconCoil size={10} /> bobina</button>
        <span className="h-3 w-px bg-line" />
        <button className={smallBtn} onClick={() => setTimer(rung.timer?.timerType ?? 'TON')}><IconTimer size={10} /> {rung.timer ? 'editar temp.' : 'temporizador'}</button>
        <button className={smallBtn} onClick={() => setCounter(rung.counter?.counterType ?? 'CTU')}><IconCounter size={10} /> {rung.counter ? 'editar cont.' : 'contador'}</button>
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------- editor */

type LadderTab = 'program' | 'tags'
type ProjectNodeId =
  | 'plc'
  | 'programBlocks'
  | 'main'
  | 'fc1'
  | 'fc2'
  | 'dataBlocks'
  | 'technologyObjects'
  | 'externalSources'
  | 'plcVariables'
  | 'watchTables'
  | 'backups'
  | 'documentation'

interface ProjectTreeItem {
  id: ProjectNodeId
  label: string
  detail?: string
  icon: 'plc' | 'folder' | 'block' | 'data' | 'source' | 'tags' | 'watch' | 'backup' | 'doc'
  children?: ProjectTreeItem[]
}

const PROJECT_TREE: ProjectTreeItem = {
  id: 'plc',
  label: 'PLC_1',
  detail: 'CPU 315-2 PN/DP',
  icon: 'plc',
  children: [
    {
      id: 'programBlocks',
      label: 'Blocos de programa',
      icon: 'folder',
      children: [
        { id: 'main', label: 'Main [OB1]', icon: 'block' },
        { id: 'fc1', label: 'FC1 [FC1]', icon: 'block' },
        { id: 'fc2', label: 'FC2 [FC2]', icon: 'block' },
      ],
    },
    { id: 'dataBlocks', label: 'Blocos de dados', icon: 'data' },
    { id: 'technologyObjects', label: 'Objetos tecnológicos', icon: 'folder' },
    { id: 'externalSources', label: 'Fontes externas', icon: 'source' },
    { id: 'plcVariables', label: 'Variáveis PLC', icon: 'tags' },
    { id: 'watchTables', label: 'Tabelas de observação', icon: 'watch' },
    { id: 'backups', label: 'Backups', icon: 'backup' },
    { id: 'documentation', label: 'Documentação', icon: 'doc' },
  ],
}

const NODE_TITLES: Record<ProjectNodeId, string> = {
  plc: 'PLC_1',
  programBlocks: 'Blocos de programa',
  main: 'Main [OB1]',
  fc1: 'FC1 [FC1]',
  fc2: 'FC2 [FC2]',
  dataBlocks: 'Blocos de dados',
  technologyObjects: 'Objetos tecnológicos',
  externalSources: 'Fontes externas',
  plcVariables: 'Variáveis PLC',
  watchTables: 'Tabelas de observação',
  backups: 'Backups',
  documentation: 'Documentação',
}

const BLOCK_NODE_IDS = new Set<ProjectNodeId>(['main', 'fc1', 'fc2'])

function TreeGlyph({ icon }: { icon: ProjectTreeItem['icon'] }) {
  const cls = `tree-glyph tree-glyph-${icon}`
  if (icon === 'block') return <IconLadder size={12} className={cls} />
  if (icon === 'data') return <IconGrid size={12} className={cls} />
  if (icon === 'tags') return <IconTag size={12} className={cls} />
  if (icon === 'watch') return <IconMonitor size={12} className={cls} />
  if (icon === 'backup') return <IconSave size={12} className={cls} />
  if (icon === 'doc') return <IconFile size={12} className={cls} />
  if (icon === 'source') return <IconOpen size={12} className={cls} />
  if (icon === 'plc') return <IconCube size={12} className={cls} />
  return <IconProjects size={12} className={cls} />
}

function programCounts(rungs: LadderRung[]) {
  return rungs.reduce(
    (acc, rung) => ({
      contacts: acc.contacts + rung.branches.reduce((sum, branch) => sum + branch.elements.length, 0),
      coils: acc.coils + rung.coils.length,
      timers: acc.timers + (rung.timer ? 1 : 0),
      counters: acc.counters + (rung.counter ? 1 : 0),
    }),
    { contacts: 0, coils: 0, timers: 0, counters: 0 },
  )
}

function onCount(table: Record<string, boolean>, prefix: string) {
  return Object.keys(table).filter((key) => key.startsWith(prefix) && table[key]).length
}

function LadderMetric({ label, value, tone = 'neutral' }: { label: string; value: string | number; tone?: 'neutral' | 'run' | 'warn' }) {
  return (
    <div className={`ladder-metric is-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function LadderEmptyState({ compact = false, onCreate }: { compact?: boolean; onCreate: () => void }) {
  return (
    <div className={`ladder-empty-state ${compact ? 'is-compact' : ''}`}>
      <div className="ladder-empty-icon"><IconLadder size={compact ? 24 : 30} /></div>
      <strong>Nenhuma network no programa</strong>
      <span>Comece com uma network básica ou carregue um cenário de treino para ver a lógica Ladder sincronizada.</span>
      <div className="ladder-empty-actions">
        <button onClick={onCreate} className="ladder-primary-button"><IconPlus size={12} /> Criar primeira network</button>
      </div>
      {!compact && (
        <div className="ladder-empty-scenarios" aria-label="Sugestões de arranque">
          <span>Partida direta</span>
          <span>Reversão</span>
          <span>Temporizador TON</span>
        </div>
      )}
    </div>
  )
}

function BlackBoxState({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`ladder-blackbox-state ${compact ? 'is-compact' : ''}`}>
      <div className="ladder-empty-icon"><IconShield size={compact ? 22 : 28} /></div>
      <strong>Programa oculto</strong>
      <span>Modo caixa-preta ativo. Observe entradas, saídas e sondas para deduzir a lógica do circuito.</span>
    </div>
  )
}

function CompactLadderEditor() {
  const rungs = useSimStore((s) => s.ladder.rungs)
  const addRung = useSimStore((s) => s.addRung)
  const updateRung = useSimStore((s) => s.updateRung)
  const table = useSimStore((s) => s.runtime.table)
  const rungPowered = useSimStore((s) => s.runtime.rungPowered)
  const running = useSimStore((s) => s.sim.runState === 'running')
  const blackBox = useSimStore((s) => s.sim.blackBox)
  const grid = useSimStore((s) => s.grid)
  const setGrid = useSimStore((s) => s.setGrid)
  const [tab, setTab] = useState<LadderTab>('program')
  const [ladderZoom, setLadderZoom] = useState(1)
  const [dragOver, setDragOver] = useState(false)
  const counts = programCounts(rungs)
  const poweredCount = rungs.filter((r) => rungPowered[r.id]).length

  const quickAdd = (kind: PaletteKind) => {
    const rungId = rungs.length ? rungs[0].id : addRung()
    updateRung(rungId, (r) => {
      if (kind === 'NO' || kind === 'NC' || kind === 'RISING' || kind === 'FALLING') {
        const branch = r.branches[0] ?? { id: `${r.id}-b0`, elements: [] }
        const branches = r.branches.length ? r.branches : [branch]
        return {
          ...r,
          branches: branches.map((b, index) => index === 0 ? { ...b, elements: [...b.elements, { kind: 'contact', id: `${r.id}-q${Date.now()}`, address: 'I1', contactType: kind }] } : b),
        }
      }
      if (kind === 'COIL' || kind === 'SET' || kind === 'RESET') {
        return { ...r, coils: [...r.coils, { kind: 'coil', id: `${r.id}-q${Date.now()}`, address: 'Q1', coilType: kind }] }
      }
      if (kind === 'TON' || kind === 'TOF' || kind === 'TP') {
        return { ...r, timer: { kind: 'timer', id: r.timer?.id ?? `${r.id}-timer`, address: r.timer?.address ?? 'T1', timerType: kind, presetMs: r.timer?.presetMs ?? 3000, preset2Ms: r.timer?.preset2Ms ?? 50 } }
      }
      if (kind === 'CTU' || kind === 'CTD') {
        return { ...r, counter: { kind: 'counter', id: r.counter?.id ?? `${r.id}-counter`, address: r.counter?.address ?? 'C1', counterType: kind, preset: r.counter?.preset ?? 5, resetAddress: r.counter?.resetAddress ?? 'M9' } }
      }
      return { ...r, comment: `${kind} disponível no editor` }
    })
    setTab('program')
  }

  const bits = (p: string) =>
    Object.keys(table)
      .filter((k) => k.startsWith(p))
      .sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)))
      .map((k) => `${k}=${table[k] ? 1 : 0}`)
      .join('  ')

  const tabBtn = (t: LadderTab, text: string) => (
    <button onClick={() => setTab(t)} className={`dc-tab ${tab === t ? 'dc-tab-active' : ''}`}>
      {text}
    </button>
  )

  return (
    <div className="compact-ladder-editor">
      <TagAddressDatalist />
      <div className="flex items-center justify-between pr-2 border-b border-line bg-surface-rail">
        <div className="flex items-center">
          {tabBtn('program', 'Programa')}
          {tabBtn('tags', 'Tabela de Tags')}
        </div>
        <div className="flex items-center gap-1">
          {tab === 'program' && (
            <button
              onClick={() => setGrid({ enabled: !grid.enabled })}
              className={`dc-icon-btn !h-6 !w-6 ${grid.enabled ? '!text-brand-600' : ''}`}
              title={`Malha ${grid.enabled ? 'ligada' : 'desligada'} (${grid.size}px) · clique para ${grid.enabled ? 'esconder' : 'mostrar'}`}
            >
              <IconGrid size={11} />
            </button>
          )}
          {tab === 'program' && <span className="text-[9px] font-mono text-ink-400 mr-1">{Math.round(ladderZoom * 100)}%</span>}
          {tab === 'program' && <button onClick={() => setLadderZoom((z) => Math.max(0.75, Number((z - 0.1).toFixed(2))))} className="dc-icon-btn !h-6 !w-6" title="Reduzir escala do Ladder"><IconZoomOut size={11} /></button>}
          {tab === 'program' && <button onClick={() => setLadderZoom((z) => Math.min(1.35, Number((z + 0.1).toFixed(2))))} className="dc-icon-btn !h-6 !w-6" title="Aumentar escala do Ladder"><IconZoomIn size={11} /></button>}
          {tab === 'program' && <button onClick={addRung} className="dc-btn-primary dc-btn !h-6 !text-[11px] ml-1"><IconPlus size={11} /> Rung</button>}
        </div>
      </div>

      {tab === 'tags' ? (
        <TagTable />
      ) : blackBox ? (
        <BlackBoxState compact />
      ) : (
        <div
          className={`compact-ladder-canvas ${grid.enabled ? (grid.style === 'lines' ? 'grid-lines' : '') : 'grid-off'} drop-zone ${dragOver ? 'drag-over' : ''}`}
          style={grid.enabled ? { backgroundSize: `${grid.size}px ${grid.size}px` } : undefined}
          onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy' }}
          onDragEnter={() => setDragOver(true)}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragOver(false)
            const compType = e.dataTransfer.getData('text/plain') as ComponentType
            const kind = COMPONENT_TO_LADDER[compType]
            if (kind) quickAdd(kind)
          }}
        >
          <div className="compact-ladder-summary">
            <LadderMetric label="Networks" value={rungs.length} />
            <LadderMetric label="Energ." value={running ? poweredCount : 0} tone={running && poweredCount ? 'run' : 'neutral'} />
            <LadderMetric label="I/Q ON" value={`${onCount(table, 'I')}/${onCount(table, 'Q')}`} tone={running ? 'run' : 'neutral'} />
            <LadderMetric label="Blocos" value={counts.timers + counts.counters} tone={counts.timers + counts.counters ? 'warn' : 'neutral'} />
          </div>
          <div className="compact-ladder-scale" style={{ zoom: ladderZoom }}>
            {rungs.map((r, i) => (
              <RungRow key={r.id} rung={r} index={i} />
            ))}
            {rungs.length === 0 && <LadderEmptyState compact onCreate={addRung} />}
          </div>
        </div>
      )}

      {tab === 'program' && (
        <div className="border-t border-line px-2.5 py-1.5 bg-surface-sunken/60 font-mono text-[10px] leading-relaxed text-ink-500 space-y-0.5">
          {[
            ['I', 'Entradas'],
            ['Q', 'Saídas'],
            ['M', 'Memórias'],
          ].map(([p, nome]) => (
            <div key={p} className="flex gap-2">
              <span className="w-14 shrink-0 text-ink-400 font-sans font-semibold">{nome}</span>
              <span className="truncate" title={bits(p)}>{bits(p) || '—'}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

type PaletteKind = LadderContactType | LadderCoilType | 'TON' | 'TOF' | 'TP' | 'CTU' | 'CTD' | 'MOVE' | 'COMPARE' | 'ADD' | 'SUB'

const COMPONENT_TO_LADDER: Partial<Record<ComponentType, PaletteKind>> = {
  buttonNO: 'NO', buttonNC: 'NC', selector2: 'NO', selector3: 'NO', keySwitch: 'NO',
  footSwitch: 'NO', emergencyButton: 'NO', limitSwitch: 'NO', proximitySensor: 'NO',
  photoSensor: 'NO', pressureSwitch: 'NO', floatSwitch: 'NO', thermostat: 'NO',
  motor1ph: 'COIL', motor3ph: 'COIL', contactor: 'COIL',
  auxRelay: 'COIL', timerRelayTON: 'TON', timerRelayTOF: 'TOF', timerRelayStarDelta: 'TON',
  counterRelay: 'CTU', safetyRelay: 'COIL',
}

const PALETTE_GROUPS: Array<{
  title: string
  items: Array<{ kind: PaletteKind; label: string; detail: string; icon: 'contact' | 'coil' | 'timer' | 'counter' | 'move' | 'compare' | 'math' | 'function' }>
}> = [
  {
    title: 'Contatos',
    items: [
      { kind: 'NO', label: 'NA', detail: 'Normal Aberto', icon: 'contact' },
      { kind: 'NC', label: 'NF', detail: 'Normal Fechado', icon: 'contact' },
      { kind: 'RISING', label: 'Borda de Subida', detail: 'Pulso positivo', icon: 'contact' },
      { kind: 'FALLING', label: 'Borda de Descida', detail: 'Pulso negativo', icon: 'contact' },
    ],
  },
  {
    title: 'Bobinas',
    items: [
      { kind: 'COIL', label: 'Bobina', detail: 'Saída normal', icon: 'coil' },
      { kind: 'SET', label: 'Bobina Set', detail: 'Retentiva', icon: 'coil' },
      { kind: 'RESET', label: 'Bobina Reset', detail: 'Retentiva', icon: 'coil' },
    ],
  },
  {
    title: 'Temporizadores',
    items: [
      { kind: 'TON', label: 'TON', detail: 'Atraso na ligação', icon: 'timer' },
      { kind: 'TOF', label: 'TOF', detail: 'Atraso na desligação', icon: 'timer' },
      { kind: 'TP', label: 'TP', detail: 'Pulso', icon: 'timer' },
    ],
  },
  {
    title: 'Contadores',
    items: [
      { kind: 'CTU', label: 'CTU', detail: 'Contador UP', icon: 'counter' },
      { kind: 'CTD', label: 'CTD', detail: 'Contador DOWN', icon: 'counter' },
    ],
  },
  {
    title: 'Funções',
    items: [
      { kind: 'MOVE', label: 'MOVE', detail: 'Transferência', icon: 'move' },
      { kind: 'ADD', label: 'ADD', detail: 'Soma', icon: 'math' },
      { kind: 'SUB', label: 'SUB', detail: 'Subtração', icon: 'math' },
      { kind: 'COMPARE', label: 'Comparador', detail: 'Maior / menor / igual', icon: 'compare' },
    ],
  },
]

function PaletteIcon({ type }: { type: PaletteKind }) {
  if (type === 'NO' || type === 'NC' || type === 'RISING' || type === 'FALLING') return <IconContact size={17} />
  if (type === 'COIL' || type === 'SET' || type === 'RESET') return <IconCoil size={17} />
  if (type === 'TON' || type === 'TOF' || type === 'TP') return <IconTimer size={17} />
  if (type === 'CTU' || type === 'CTD') return <IconCounter size={17} />
  if (type === 'MOVE') return <IconMove size={17} />
  if (type === 'COMPARE') return <IconCompare size={17} />
  return <IconMath size={17} />
}

function LadderNavRail() {
  return (
    <aside className="ladder-nav-rail">
      {[
        ['▣', 'Projeto', true],
        ['▤', 'Biblioteca', false],
        ['◈', 'Dispositivos', false],
        ['⌁', 'Diagnóstico', false],
        ['⚙', 'Configurações', false],
      ].map(([icon, label, active]) => (
        <button key={String(label)} className={`ladder-nav-item ${active ? 'is-active' : ''}`} title={String(label)}>
          <span className="ladder-nav-icon">{icon}</span>
          <span>{label}</span>
        </button>
      ))}
      <span className="mt-auto text-[9px] text-brand-200/80">v2.0</span>
    </aside>
  )
}

function ProjectTreePane({
  activeNode,
  expanded,
  onToggle,
  onSelect,
  onClose,
}: {
  activeNode: ProjectNodeId
  expanded: Set<ProjectNodeId>
  onToggle: (id: ProjectNodeId) => void
  onSelect: (id: ProjectNodeId) => void
  onClose: () => void
}) {
  const toolTiles: Array<{ label: string; Icon: typeof IconContact }> = [
    { label: 'Contato', Icon: IconContact },
    { label: 'Bobina', Icon: IconCoil },
    { label: 'Temporizadores', Icon: IconTimer },
    { label: 'Contadores', Icon: IconCounter },
    { label: 'Move', Icon: IconMove },
    { label: 'Comparadores', Icon: IconCompare },
    { label: 'Matemáticas', Icon: IconMath },
    { label: 'Funções', Icon: IconFunction },
  ]

  const renderNode = (node: ProjectTreeItem, depth = 0) => {
    const hasChildren = !!node.children?.length
    const isExpandableFolder = hasChildren || !BLOCK_NODE_IDS.has(node.id)
    const isOpen = expanded.has(node.id)
    const isActive = activeNode === node.id
    return (
      <div key={node.id}>
        <button
          type="button"
          className={`tree-row tree-depth-${Math.min(depth, 2)} ${isActive ? 'tree-selected' : ''}`}
          onClick={() => {
            if (isExpandableFolder) onToggle(node.id)
            onSelect(node.id)
          }}
          title={node.detail ? `${node.label} (${node.detail})` : node.label}
        >
          <span className="tree-chevron">
            {isExpandableFolder ? (isOpen ? <IconChevronDown size={12} /> : <IconChevronRight size={12} />) : <span />}
          </span>
          <TreeGlyph icon={node.icon} />
          <span className="tree-label">{node.label}</span>
          {node.detail && <small>({node.detail})</small>}
        </button>
        {hasChildren && isOpen && node.children!.map((child) => renderNode(child, depth + 1))}
        {!hasChildren && isExpandableFolder && isOpen && (
          <div className={`tree-hint tree-depth-${Math.min(depth + 1, 2)}`}>
            {node.id === 'dataBlocks' && 'DB1_Config, DB2_Processo'}
            {node.id === 'technologyObjects' && 'TO_Encoder, TO_Safety'}
            {node.id === 'externalSources' && 'SCL/STL reservados'}
            {node.id === 'plcVariables' && 'Tags I, Q, M, T e C'}
            {node.id === 'watchTables' && 'Tabela online I/O/M'}
            {node.id === 'backups' && 'Historico local do editor'}
            {node.id === 'documentation' && 'Notas, mapa e diagnostico'}
            {node.id === 'plc' && 'CPU, blocos e tabelas'}
          </div>
        )}
      </div>
    )
  }

  return (
    <aside className="ladder-project-pane">
      <div className="ladder-pane-heading">
        <span>Projeto</span>
        <button className="ladder-ghost-button" title="Recolher projeto" onClick={onClose}>×</button>
      </div>
      <div className="ladder-project-tree">
        {renderNode(PROJECT_TREE)}
      </div>
      <div className="ladder-tools-heading">Ferramentas</div>
      <div className="ladder-tools-grid">
        {toolTiles.map(({ label, Icon }) => (
          <div className="ladder-tool-tile" key={label}>
            <Icon size={18} />
            <span>{label}</span>
          </div>
        ))}
      </div>
    </aside>
  )
}

function NetworkStatus({ table, prefix, label }: { table: Record<string, boolean>; prefix: string; label: string }) {
  const entries = Object.keys(table).filter((key) => key.startsWith(prefix)).sort((a, b) => Number(a.slice(1)) - Number(b.slice(1))).slice(0, 8)
  return (
    <div className="ladder-status-group">
      <div className="ladder-status-title">{label}</div>
      {entries.length ? entries.map((key) => (
        <div className="ladder-status-row" key={key}>
          <span className="font-mono text-brand-700">{key}</span>
          <span className="truncate text-slate-500">{prefix === 'I' ? (key === 'I1' ? 'Botão Start' : key === 'I2' ? 'Botão Stop' : 'Sensor') : prefix === 'Q' ? (key === 'Q1' ? 'Contator' : 'Motor') : 'Memória'}</span>
          <span className={`ladder-status-dot ${table[key] ? 'is-on' : ''}`} />
        </div>
      )) : <span className="text-[10px] text-slate-400">—</span>}
    </div>
  )
}

function ProjectDataView({ activeNode, table }: { activeNode: ProjectNodeId; table: Record<string, boolean> }) {
  const tags = useSimStore((s) => s.tags)
  const events = useSimStore((s) => s.sim.events)
  const timers = useSimStore((s) => s.runtime.timers)
  const counters = useSimStore((s) => s.runtime.counters)
  const rows = Object.keys(table).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))

  if (activeNode === 'plcVariables') return <TagTable />

  if (activeNode === 'watchTables') {
    return (
      <div className="ladder-folder-view">
        <FolderViewHeader icon={<IconMonitor size={16} />} title="Tabela de observação" subtitle="Bits e blocos monitorados no último scan." />
        <div className="ladder-data-grid">
          {rows.map((key) => (
            <div className="ladder-data-row" key={key}>
              <strong>{key}</strong>
              <span>{table[key] ? '1 / TRUE' : '0 / FALSE'}</span>
              <i className={table[key] ? 'is-on' : ''} />
            </div>
          ))}
          {!rows.length && <EmptyFolderMessage text="Nenhuma variável disponível para observar." />}
        </div>
      </div>
    )
  }

  if (activeNode === 'dataBlocks') {
    return (
      <div className="ladder-folder-view">
        <FolderViewHeader icon={<IconGrid size={16} />} title="Blocos de dados" subtitle="Área reservada para DBs de receitas, estados e parametrização." />
        <div className="ladder-db-card">
          <strong>DB1_Config</strong>
          <span>Estrutura pronta para parâmetros do simulador</span>
          <div className="ladder-db-table">
            <div><b>StartDelayMs</b><span>3000</span></div>
            <div><b>MotorNominalA</b><span>6.0</span></div>
            <div><b>AutoReset</b><span>false</span></div>
          </div>
        </div>
      </div>
    )
  }

  if (activeNode === 'backups') {
    return (
      <div className="ladder-folder-view">
        <FolderViewHeader icon={<IconSave size={16} />} title="Backups" subtitle="Histórico local do editor e pontos de recuperação." />
        <div className="ladder-data-grid">
          <div className="ladder-data-row"><strong>Histórico undo</strong><span>{useSimStore.getState().history.length} ponto(s)</span><i className="is-on" /></div>
          <div className="ladder-data-row"><strong>Histórico redo</strong><span>{useSimStore.getState().future.length} ponto(s)</span><i /></div>
        </div>
      </div>
    )
  }

  if (activeNode === 'documentation') {
    return (
      <div className="ladder-folder-view">
        <FolderViewHeader icon={<IconFile size={16} />} title="Documentação" subtitle="Resumo automático do projeto aberto." />
        <div className="ladder-doc-lines">
          <p>Projeto: PLC_1 / Main [OB1]</p>
          <p>Tags cadastradas: {tags.length}</p>
          <p>Temporizadores ativos: {Object.keys(timers).length}</p>
          <p>Contadores ativos: {Object.keys(counters).length}</p>
          <p>Eventos registrados: {events.length}</p>
        </div>
      </div>
    )
  }

  const title = NODE_TITLES[activeNode]
  return (
    <div className="ladder-folder-view">
      <FolderViewHeader icon={<IconProjects size={16} />} title={title} subtitle="Pasta do projeto aberta." />
      <EmptyFolderMessage text="Conteúdo pronto para novas entidades do projeto." />
    </div>
  )
}

function FolderViewHeader({ icon, title, subtitle }: { icon: ReactNode; title: string; subtitle: string }) {
  return (
    <header className="ladder-folder-header">
      <span>{icon}</span>
      <div>
        <strong>{title}</strong>
        <small>{subtitle}</small>
      </div>
    </header>
  )
}

function EmptyFolderMessage({ text }: { text: string }) {
  return <div className="ladder-folder-empty">{text}</div>
}

function FunctionBlockView({ id }: { id: Extract<ProjectNodeId, 'fc1' | 'fc2'> }) {
  const isFc1 = id === 'fc1'
  return (
    <div className="ladder-folder-view">
      <FolderViewHeader
        icon={<IconFunction size={16} />}
        title={NODE_TITLES[id]}
        subtitle={isFc1 ? 'Função auxiliar para permissivos e segurança.' : 'Função auxiliar para diagnósticos e sinalização.'}
      />
      <div className="ladder-fc-canvas">
        <div className="ladder-fc-network">
          <div className="ladder-fc-network-title">Network 1</div>
          <div className="ladder-fc-line">
            <span className="ladder-fc-rail" />
            <span className="ladder-fc-contact">{isFc1 ? 'M1' : 'I3'}</span>
            <span className="ladder-fc-wire" />
            <span className="ladder-fc-block">{isFc1 ? 'MOVE' : 'COMPARE'}</span>
            <span className="ladder-fc-wire" />
            <span className="ladder-fc-coil">{isFc1 ? 'M10' : 'M20'}</span>
          </div>
        </div>
        <p className="ladder-fc-note">Bloco aberto pela árvore do projeto. A edição avançada de FCs pode reutilizar o mesmo motor de networks do OB1.</p>
      </div>
    </div>
  )
}

function FullLadderEditor() {
  const rungs = useSimStore((s) => s.ladder.rungs)
  const table = useSimStore((s) => s.runtime.table)
  const rungPowered = useSimStore((s) => s.runtime.rungPowered)
  const running = useSimStore((s) => s.sim.runState === 'running')
  const blackBox = useSimStore((s) => s.sim.blackBox)
  const grid = useSimStore((s) => s.grid)
  const setGrid = useSimStore((s) => s.setGrid)
  const addRung = useSimStore((s) => s.addRung)
  const updateRung = useSimStore((s) => s.updateRung)
  const undo = useSimStore((s) => s.undo)
  const redo = useSimStore((s) => s.redo)
  const history = useSimStore((s) => s.history)
  const future = useSimStore((s) => s.future)
  const [activeRungId, setActiveRungId] = useState<string | null>(null)
  const [programTab, setProgramTab] = useState<'program' | 'tags'>('program')
  const [filter, setFilter] = useState('')
  const [ladderZoom, setLadderZoom] = useState(1)
  const [showProjectPane, setShowProjectPane] = useState(true)
  const [showPalette, setShowPalette] = useState(true)
  const [activeProjectNode, setActiveProjectNode] = useState<ProjectNodeId>('main')
  const [expandedNodes, setExpandedNodes] = useState<Set<ProjectNodeId>>(() => new Set(['plc', 'programBlocks']))
  const [dragOver, setDragOver] = useState(false)

  const activeId = activeRungId && rungs.some((r) => r.id === activeRungId) ? activeRungId : rungs[0]?.id
  const counts = programCounts(rungs)
  const poweredCount = rungs.filter((r) => rungPowered[r.id]).length
  const isMainOpen = activeProjectNode === 'main'
  const isFcOpen = activeProjectNode === 'fc1' || activeProjectNode === 'fc2'
  const isProgramView = isMainOpen || isFcOpen
  const activeTitle = NODE_TITLES[activeProjectNode]

  const toggleNode = (id: ProjectNodeId) => {
    setExpandedNodes((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectProjectNode = (id: ProjectNodeId) => {
    setActiveProjectNode(id)
    if (id === 'plcVariables') setProgramTab('tags')
    else setProgramTab('program')
  }

  const quickAdd = (kind: PaletteKind) => {
    setActiveProjectNode('main')
    setProgramTab('program')
    const rungId = activeId ?? addRung()
    setActiveRungId(rungId)
    updateRung(rungId, (r) => {
      if (kind === 'NO' || kind === 'NC' || kind === 'RISING' || kind === 'FALLING') {
        const branch = r.branches[0] ?? { id: `${r.id}-b0`, elements: [] }
        const branches = r.branches.length ? r.branches : [branch]
        return {
          ...r,
          branches: branches.map((b, index) => index === 0 ? { ...b, elements: [...b.elements, { kind: 'contact', id: `${r.id}-quick-${Date.now()}`, address: 'I1', contactType: kind }] } : b),
        }
      }
      if (kind === 'COIL' || kind === 'SET' || kind === 'RESET') {
        return { ...r, coils: [...r.coils, { kind: 'coil', id: `${r.id}-quick-${Date.now()}`, address: 'Q1', coilType: kind }] }
      }
      if (kind === 'TON' || kind === 'TOF' || kind === 'TP') {
        return { ...r, timer: { kind: 'timer', id: r.timer?.id ?? `${r.id}-timer`, address: r.timer?.address ?? 'T1', timerType: kind, presetMs: r.timer?.presetMs ?? 3000, preset2Ms: r.timer?.preset2Ms ?? 50 } }
      }
      if (kind === 'CTU' || kind === 'CTD') {
        return { ...r, counter: { kind: 'counter', id: r.counter?.id ?? `${r.id}-counter`, address: r.counter?.address ?? 'C1', counterType: kind, preset: r.counter?.preset ?? 5, resetAddress: r.counter?.resetAddress ?? 'M9' } }
      }
      return { ...r, comment: `${kind} disponível no editor` }
    })
  }

  const visibleGroups = PALETTE_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => !filter.trim() || `${item.label} ${item.detail}`.toLowerCase().includes(filter.toLowerCase())),
  })).filter((group) => group.items.length)

  return (
    <div className="ladder-workspace">
      <LadderNavRail />
      {showProjectPane ? (
        <ProjectTreePane
          activeNode={activeProjectNode}
          expanded={expandedNodes}
          onToggle={toggleNode}
          onSelect={selectProjectNode}
          onClose={() => setShowProjectPane(false)}
        />
      ) : (
        <button className="ladder-collapsed-pane-button" onClick={() => setShowProjectPane(true)} title="Mostrar projeto">
          Projeto
        </button>
      )}
      <main className="ladder-main-pane">
        <div className="ladder-project-tabs">
          <button className={`ladder-project-tab ${programTab === 'program' ? 'is-active' : ''}`} onClick={() => setProgramTab('program')}>
            {isFcOpen ? <IconFunction size={13} /> : <IconSchematic size={13} />} {activeTitle} <span>×</span>
          </button>
          <button className={`ladder-project-tab ${programTab === 'tags' ? 'is-active' : ''}`} onClick={() => { setProgramTab('tags'); setActiveProjectNode('plcVariables') }}>Tabela de Tags</button>
          <span className="ml-auto flex items-center gap-2 text-[10px] text-slate-400">
            <span className={`ladder-connection-dot ${running ? 'is-live' : ''}`} /> {running ? 'Simulação ativa' : 'Parado'}
          </span>
        </div>
        <div className="ladder-editor-toolbar">
          <button className="ladder-toolbar-button" onClick={undo} disabled={!history.length} title="Desfazer"><IconUndo size={14} /></button>
          <button className="ladder-toolbar-button" onClick={redo} disabled={!future.length} title="Refazer"><IconRedo size={14} /></button>
          <span className="ladder-toolbar-separator" />
          <span className="ladder-zoom-label">⌕ {Math.round(ladderZoom * 100)}%</span>
          <button className="ladder-toolbar-button" onClick={() => setLadderZoom((z) => Math.max(0.75, Number((z - 0.1).toFixed(2))))} title="Reduzir zoom"><IconZoomOut size={14} /></button>
          <button className="ladder-toolbar-button" onClick={() => setLadderZoom(1)} title="Zoom 100%">100</button>
          <button className="ladder-toolbar-button" onClick={() => setLadderZoom((z) => Math.min(1.35, Number((z + 0.1).toFixed(2))))} title="Aumentar zoom"><IconZoomIn size={14} /></button>
          <span className="ladder-toolbar-separator" />
          <button
            className={`ladder-toolbar-button ${grid.enabled ? 'is-active' : ''}`}
            onClick={() => setGrid({ enabled: !grid.enabled })}
            title={`Malha ${grid.enabled ? 'ligada' : 'desligada'} · clique para ${grid.enabled ? 'esconder' : 'mostrar'}`}
          >
            <IconGrid size={14} />
          </button>
          <span className="ladder-zoom-label">Malha {grid.enabled ? `${grid.size}px` : 'off'}</span>
          <span className="ladder-toolbar-separator" />
          <span className="text-[10px] text-slate-400">{isProgramView ? 'Programa Ladder' : activeTitle}</span>
          {isMainOpen && <button onClick={addRung} className="ladder-primary-button ml-auto"><IconPlus size={12} /> Nova network</button>}
        </div>
        {programTab === 'program' && isMainOpen && (
          <div className="ladder-program-summary">
            <LadderMetric label="Networks" value={rungs.length} />
            <LadderMetric label="Energizadas" value={running ? poweredCount : 0} tone={running && poweredCount ? 'run' : 'neutral'} />
            <LadderMetric label="Contatos" value={counts.contacts} />
            <LadderMetric label="Bobinas" value={counts.coils} />
            <LadderMetric label="Timers/Counters" value={`${counts.timers}/${counts.counters}`} tone={counts.timers + counts.counters ? 'warn' : 'neutral'} />
            <div className="ladder-live-bus">
              <span>Bus I/Q/M</span>
              <strong>{onCount(table, 'I')} / {onCount(table, 'Q')} / {onCount(table, 'M')}</strong>
            </div>
          </div>
        )}
        {programTab === 'tags' ? (
          <div className="ladder-tags-view"><TagTable /></div>
        ) : blackBox && isMainOpen ? (
          <BlackBoxState />
        ) : isFcOpen ? (
          <FunctionBlockView id={activeProjectNode as Extract<ProjectNodeId, 'fc1' | 'fc2'>} />
        ) : !isMainOpen ? (
          <ProjectDataView activeNode={activeProjectNode} table={table} />
          ) : (
          <div
            className={`ladder-networks ${grid.enabled ? (grid.style === 'lines' ? 'grid-lines' : '') : 'grid-off'} drop-zone ${dragOver ? 'drag-over' : ''}`}
            style={grid.enabled ? { backgroundSize: `${grid.size}px ${grid.size}px` } : undefined}
            onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy' }}
            onDragEnter={() => setDragOver(true)}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragOver(false)
              const compType = e.dataTransfer.getData('text/plain') as ComponentType
              const kind = COMPONENT_TO_LADDER[compType]
              if (kind) quickAdd(kind)
            }}
          >
            <div className="ladder-networks-scale" style={{ zoom: ladderZoom }}>
              {rungs.map((r, i) => (
                <div key={r.id} className={`ladder-network-wrap ${activeId === r.id ? 'is-selected' : ''}`} onClick={() => setActiveRungId(r.id)}>
                  <RungRow rung={r} index={i} />
                </div>
              ))}
              {!rungs.length && <LadderEmptyState onCreate={addRung} />}
            </div>
          </div>
        )}
        <div className="ladder-bottom-panel">
          <div className="ladder-bottom-tabs">
            <span className="is-active">Entradas/Saídas</span><span>Memórias</span><span>Temporizadores</span><span>Contadores</span>
          </div>
          <div className="ladder-status-grid">
            <NetworkStatus table={table} prefix="I" label="Entradas" />
            <NetworkStatus table={table} prefix="Q" label="Saídas" />
            <NetworkStatus table={table} prefix="M" label="Memórias" />
            <div className="ladder-project-status"><span>Estado do Projeto</span><strong><i /> {running ? 'Simulação ativa' : 'Pronto'}</strong><small>CPU: 315-2 PN/DP · Tempo de varredura: 12 ms</small></div>
          </div>
        </div>
      </main>
      {showPalette ? (
      <aside className="ladder-palette">
        <div className="ladder-palette-header">
          <div>
            <strong>Elementos Ladder</strong>
            <small>Network ativa: {activeId ? rungs.findIndex((r) => r.id === activeId) + 1 : '—'}</small>
          </div>
          <button className="ladder-ghost-button" onClick={() => setShowPalette(false)} title="Recolher elementos">›</button>
        </div>
        <div className="relative mb-2">
          <input className="ladder-palette-search" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Buscar elemento..." />
          <span className="ladder-search-icon">⌕</span>
        </div>
        <div className="ladder-palette-scroll">
          {visibleGroups.map((group) => (
            <section className="ladder-palette-group" key={group.title}>
              <div className="ladder-palette-group-title"><IconChevronDown size={12} /> {group.title} <span>⌃</span></div>
              {group.items.map((item) => (
                <button className="ladder-palette-item" key={item.kind} onClick={() => quickAdd(item.kind)} title={`Inserir ${item.label} na network selecionada`}>
                  <span className="ladder-palette-icon"><PaletteIcon type={item.kind} /></span>
                  <span><strong>{item.label}</strong><small>{item.detail}</small></span>
                </button>
              ))}
            </section>
          ))}
          {!visibleGroups.length && (
            <div className="ladder-palette-empty">
              <IconFunction size={18} />
              <strong>Nenhum elemento encontrado</strong>
              <span>Revise o termo de busca ou limpe o filtro.</span>
            </div>
          )}
        </div>
      </aside>
      ) : (
        <button className="ladder-collapsed-pane-button is-right" onClick={() => setShowPalette(true)} title="Mostrar elementos">
          Elementos
        </button>
      )}
    </div>
  )
}

export default function LadderEditor({ compact = false }: { compact?: boolean }) {
  return compact ? <CompactLadderEditor /> : <FullLadderEditor />
}
