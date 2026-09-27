import { useState } from 'react'
import { useSimStore } from '../store/useSimStore'
import TagTable from './TagTable'
import type { LadderContact, LadderRung, LadderContactType, LadderCoilType } from '../types'
import { IconPlus, IconBranch, IconContact, IconCoil, IconTimer, IconCounter, IconDelete, IconCopy, IconZoomIn, IconZoomOut, IconSchematic, IconLadder, IconCompare, IconMath, IconMove, IconFunction, IconUndo, IconRedo, IconChevronDown, IconChevronRight } from '../ui/icons'

/* ------------------------------------------------------------------ helpers */

/** id do <datalist> com os endereços já nomeados na Tabela de Tags, usado
 *  para sugerir endereços (com autocompletar) em todos os campos de endereço
 *  do editor — tal como o TIA Portal sugere tags existentes ao digitar. */
const TAG_DATALIST_ID = 'ladder-tag-addresses'

const CONTACT_LABEL: Record<LadderContactType, string> = { NO: 'NA', NC: 'NF', RISING: '↑B', FALLING: '↓B' }

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
function ContactSymbol({ el, table }: { el: LadderContact; table: Record<string, boolean> }) {
  const raw = !!table[el.address]
  const powered = el.contactType === 'NC' ? !raw : raw
  const tagName = useTagName(el.address)
  const col = powered ? '#16a34a' : '#94a3b8'
  const slash = el.contactType === 'NC'
  const edge = el.contactType === 'RISING' || el.contactType === 'FALLING'
  return (
    <div className="flex flex-col items-center select-none w-[46px]" title={tagName ?? undefined}>
      <div className={`text-[9px] font-mono leading-none mb-0.5 font-semibold ${powered ? 'text-emerald-700' : 'text-ink-400'}`}>{el.address}</div>
      <svg width="34" height="26" viewBox="0 0 34 26" aria-hidden>
        <line x1="0" y1="13" x2="9" y2="13" stroke={col} strokeWidth="2" />
        <line x1="25" y1="13" x2="34" y2="13" stroke={col} strokeWidth="2" />
        <line x1="9" y1="2.5" x2="9" y2="23.5" stroke={col} strokeWidth="2.4" />
        <line x1="25" y1="2.5" x2="25" y2="23.5" stroke={col} strokeWidth="2.4" />
        {slash && <line x1="5" y1="22" x2="29" y2="4" stroke={col} strokeWidth="2" />}
        {edge && (
          <text x="17" y="17.5" fontSize="10" fontWeight="700" fill={col} textAnchor="middle" fontFamily="ui-monospace, monospace">
            {el.contactType === 'RISING' ? 'P' : 'N'}
          </text>
        )}
      </svg>
      <div className={`text-[8px] leading-none mt-0.5 font-semibold ${powered ? 'text-emerald-700' : 'text-ink-300'}`}>{CONTACT_LABEL[el.contactType]}</div>
      {tagName && <div className="text-[8px] leading-none mt-0.5 text-ink-400 max-w-[56px] truncate">{tagName}</div>}
    </div>
  )
}

/** Bobina desenhada como ( endereço ) com o tipo (SET/RESET) indicado. */
function CoilButton({ coil, powered, onCycle, onRemove }: { coil: import('../types').LadderCoilEl; powered: boolean; onCycle: () => void; onRemove: () => void }) {
  const tagName = useTagName(coil.address)
  return (
    <button
      onClick={onCycle}
      onContextMenu={(e) => {
        e.preventDefault()
        onRemove()
      }}
      title={`Clique alterna COIL → SET → RESET · botão direito remove${tagName ? ` · ${tagName}` : ''}`}
      className={`flex items-center gap-1.5 px-2 py-1 rounded-[5px] font-mono text-[11px] font-semibold border-2 transition-colors ${
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

/* --------------------------------------------------------------- editor row */

function RungRow({ rung, index }: { rung: LadderRung; index: number }) {
  const table = useSimStore((s) => s.runtime.table)
  const rungPowered = useSimStore((s) => s.runtime.rungPowered)
  const running = useSimStore((s) => s.sim.runState === 'running')
  const { deleteRung, duplicateRung, moveRung, renameRung, updateRung } = useSimStore()
  const [newAddress, setNewAddress] = useState('I1')
  const [newType, setNewType] = useState<LadderContactType>('NO')
  const [branchIndex, setBranchIndex] = useState(0)
  const [coilAddress, setCoilAddress] = useState('Q1')
  const [coilType, setCoilType] = useState<LadderCoilType>('COIL')

  const powered = !!rungPowered[rung.id]

  const addContact = () => {
    updateRung(rung.id, (r) => {
      const branches = r.branches.length ? [...r.branches] : [{ id: r.id + '-b0', elements: [] }]
      const idx = Math.min(branchIndex, branches.length - 1)
      branches[idx] = {
        ...branches[idx],
        elements: [...branches[idx].elements, { kind: 'contact', id: `${rung.id}-c${Date.now()}${Math.random().toString(36).slice(2, 5)}`, address: newAddress.toUpperCase(), contactType: newType }],
      }
      return { ...r, branches }
    })
  }

  const addBranch = () => {
    updateRung(rung.id, (r) => ({ ...r, branches: [...r.branches, { id: `${rung.id}-b${Date.now()}`, elements: [] }] }))
    setBranchIndex(rung.branches.length)
  }

  const removeElement = (branchId: string, elementId: string) =>
    updateRung(rung.id, (r) => ({
      ...r,
      branches: r.branches.map((b) => (b.id === branchId ? { ...b, elements: b.elements.filter((e) => e.id !== elementId) } : b)),
    }))

  const toggleContactType = (branchId: string, elementId: string) =>
    updateRung(rung.id, (r) => ({
      ...r,
      branches: r.branches.map((b) =>
        b.id === branchId
          ? { ...b, elements: b.elements.map((e) => (e.id === elementId ? { ...e, contactType: (['NO', 'NC', 'RISING', 'FALLING'] as LadderContactType[])[((['NO', 'NC', 'RISING', 'FALLING'] as LadderContactType[]).indexOf(e.contactType) + 1) % 4] } : e)) }
          : b,
      ),
    }))

  const addCoil = () =>
    updateRung(rung.id, (r) => ({ ...r, coils: [...r.coils, { kind: 'coil', id: `${rung.id}-k${Date.now()}`, address: coilAddress.toUpperCase(), coilType }] }))

  const removeCoil = (id: string) => updateRung(rung.id, (r) => ({ ...r, coils: r.coils.filter((c) => c.id !== id) }))

  const cycleCoil = (id: string) =>
    updateRung(rung.id, (r) => ({
      ...r,
      coils: r.coils.map((c) => (c.id === id ? { ...c, coilType: (['COIL', 'SET', 'RESET'] as LadderCoilType[])[((['COIL', 'SET', 'RESET'] as LadderCoilType[]).indexOf(c.coilType) + 1) % 3] } : c)),
    }))

  const setTimer = (kind: 'TON' | 'TOF' | 'TP' | 'STAR_DELTA' | 'none') => {
    if (kind === 'none') updateRung(rung.id, (r) => ({ ...r, timer: undefined }))
    else updateRung(rung.id, (r) => ({ ...r, timer: { kind: 'timer', id: r.timer?.id ?? `${rung.id}-t`, address: r.timer?.address ?? 'T1', timerType: kind, presetMs: r.timer?.presetMs ?? 3000, preset2Ms: r.timer?.preset2Ms ?? 50 } }))
  }

  const setCounter = (kind: 'CTU' | 'CTD' | 'none') => {
    if (kind === 'none') updateRung(rung.id, (r) => ({ ...r, counter: undefined }))
    else updateRung(rung.id, (r) => ({ ...r, counter: { kind: 'counter', id: r.counter?.id ?? `${rung.id}-c`, address: r.counter?.address ?? 'C1', counterType: kind, preset: r.counter?.preset ?? 5, resetAddress: r.counter?.resetAddress ?? 'M9' } }))
  }

  const smallBtn = 'dc-btn !h-[22px] !px-1.5 !text-[10px]'
  const tiny = 'dc-input !h-[22px] !text-[10px] !w-auto'

  return (
    <div
      className={`rounded-md border mb-2.5 bg-white overflow-hidden transition-shadow ${
        powered && running ? 'border-emerald-400 shadow-[0_0_0_1px_rgba(22,163,74,.25)]' : 'border-line shadow-xs'
      }`}
    >
      {/* cabeçalho do rung */}
      <div className="flex items-center gap-2 px-2 h-8 bg-surface-rail border-b border-line">
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
        <label className="flex items-center gap-1 text-[10px] text-ink-400 cursor-pointer" title="Rung habilitado para execução">
          <input type="checkbox" checked={rung.enabled} onChange={(e) => updateRung(rung.id, (r) => ({ ...r, enabled: e.target.checked }))} />
          ativo
        </label>
        <div className="flex gap-0.5">
          <button className={smallBtn} title="Mover para cima" onClick={() => moveRung(rung.id, -1)}>↑</button>
          <button className={smallBtn} title="Mover para baixo" onClick={() => moveRung(rung.id, 1)}>↓</button>
          <button className={smallBtn} title="Duplicar rung" onClick={() => duplicateRung(rung.id)}><IconCopy size={10} /></button>
          <button className={`${smallBtn} !text-state-error`} title="Excluir rung" onClick={() => deleteRung(rung.id)}><IconDelete size={10} /></button>
        </div>
      </div>

      {/* diagrama */}
      <div className="px-3 pt-3 pb-2">
        <div className="flex items-stretch">
          {/* barramento L+ */}
          <div className="flex flex-col items-center w-7 shrink-0">
            <span className="font-mono text-[9px] font-bold text-ink-400">L+</span>
            <div className="flex-1 w-[3px] bg-ink-500 rounded-full my-0.5" />
            {rung.branches.map((b) => (
              <div key={b.id + '-rail'} className="w-4 border-t-2 border-ink-500 -mt-[2px]" />
            ))}
          </div>

          {/* ramos */}
          <div className="flex-1 flex flex-col gap-1.5 min-w-0">
            {rung.branches.map((b, bi) => (
              <div key={b.id} className="flex items-center gap-0.5 flex-wrap">
                <div
                  className="h-0 w-3 shrink-0"
                  style={{ borderTop: `${powered && running ? '2px solid #16a34a' : '2px solid #94a3b8'}` }}
                />
                {b.elements.map((el) => (
                  <div key={el.id} className="flex items-center">
                    <button title="Clique alterna NA → NF → borda de subida → borda de descida" onClick={() => toggleContactType(b.id, el.id)} className="rounded hover:bg-slate-100">
                      <ContactSymbol el={el} table={table} />
                    </button>
                    <input
                      className="w-12 bg-transparent text-[10px] text-ink-700 outline-none border-b border-dashed border-line-strong focus:border-brand-500 focus:bg-brand-50 font-mono text-center"
                      list={TAG_DATALIST_ID}
                      value={el.address}
                      onChange={(e) =>
                        updateRung(rung.id, (r) => ({
                          ...r,
                          branches: r.branches.map((bb) => (bb.id === b.id ? { ...bb, elements: bb.elements.map((ee) => (ee.id === el.id ? { ...ee, address: e.target.value.toUpperCase() } : ee)) } : bb)),
                        }))
                      }
                    />
                    <button className="text-ink-300 hover:text-state-error text-[10px] px-0.5" title="Remover contato" onClick={() => removeElement(b.id, el.id)}>✕</button>
                    <div
                      className="h-0 flex-1 min-w-2"
                      style={{ borderTop: `${powered && running ? '2px solid #16a34a' : '2px solid #94a3b8'}` }}
                    />
                  </div>
                ))}
                {!b.elements.length && <span className="text-[10px] text-ink-300 px-2">ramo vazio</span>}
                {rung.branches.length > 1 && (
                  <button className="text-[9px] text-ink-300 hover:text-state-error px-1" title="Remover ramo" onClick={() => updateRung(rung.id, (r) => ({ ...r, branches: r.branches.filter((bb) => bb.id !== b.id) }))}>
                    − ramo
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* saídas + barramento L− */}
          <div className="flex flex-col justify-center px-3 gap-1 border-l border-dashed border-line-soft">
            {rung.coils.map((c) => (
              <CoilButton key={c.id} coil={c} powered={!!table[c.address]} onCycle={() => cycleCoil(c.id)} onRemove={() => removeCoil(c.id)} />
            ))}
            {!rung.coils.length && <span className="text-[10px] text-ink-300">sem bobina</span>}
          </div>
          <div className="flex flex-col items-center w-7 shrink-0">
            <div className="flex-1 w-[3px] bg-ink-500 rounded-full my-0.5" />
            <span className="font-mono text-[9px] font-bold text-ink-400">L−</span>
          </div>
        </div>
      </div>

      {/* parâmetros */}
      <div className="flex items-center gap-2 flex-wrap px-3 pb-2 text-[10px] text-ink-500">
        <span className="flex items-center gap-1 dc-chip !h-[18px]"><IconTimer size={9} /> Temp.</span>
        <select className={tiny} value={rung.timer?.timerType ?? 'none'} onChange={(e) => setTimer(e.target.value as any)}>
          <option value="none">—</option>
          <option value="TON">TON</option>
          <option value="TOF">TOF</option>
          <option value="TP">TP</option>
          <option value="STAR_DELTA">Estrela-Triângulo</option>
        </select>
        {rung.timer && (
          <>
            <input className={`${tiny} !w-12 font-mono`} list={TAG_DATALIST_ID} value={rung.timer.address} onChange={(e) => updateRung(rung.id, (r) => ({ ...r, timer: { ...r.timer!, address: e.target.value.toUpperCase() } }))} />
            <span>preset</span>
            <input type="number" className={`${tiny} !w-16`} value={rung.timer.presetMs} onChange={(e) => updateRung(rung.id, (r) => ({ ...r, timer: { ...r.timer!, presetMs: Number(e.target.value) } }))} />
            <span>ms</span>
            {rung.timer.timerType === 'STAR_DELTA' && (
              <>
                <span>transição</span>
                <input type="number" className={`${tiny} !w-14`} value={rung.timer.preset2Ms ?? 50} onChange={(e) => updateRung(rung.id, (r) => ({ ...r, timer: { ...r.timer!, preset2Ms: Number(e.target.value) } }))} />
                <span>ms</span>
              </>
            )}
          </>
        )}

        <span className="h-3 w-px bg-line" />

        <span className="flex items-center gap-1 dc-chip !h-[18px]"><IconCounter size={9} /> Cont.</span>
        <select className={tiny} value={rung.counter?.counterType ?? 'none'} onChange={(e) => setCounter(e.target.value as any)}>
          <option value="none">—</option>
          <option value="CTU">CTU (crescente)</option>
          <option value="CTD">CTD (decrescente)</option>
        </select>
        {rung.counter && (
          <>
            <input className={`${tiny} !w-12 font-mono`} list={TAG_DATALIST_ID} value={rung.counter.address} onChange={(e) => updateRung(rung.id, (r) => ({ ...r, counter: { ...r.counter!, address: e.target.value.toUpperCase() } }))} />
            <span>preset</span>
            <input type="number" className={`${tiny} !w-14`} value={rung.counter.preset} onChange={(e) => updateRung(rung.id, (r) => ({ ...r, counter: { ...r.counter!, preset: Number(e.target.value) } }))} />
            <span>reset</span>
            <input className={`${tiny} !w-12 font-mono`} list={TAG_DATALIST_ID} value={rung.counter.resetAddress ?? ''} onChange={(e) => updateRung(rung.id, (r) => ({ ...r, counter: { ...r.counter!, resetAddress: e.target.value.toUpperCase() } }))} />
          </>
        )}
      </div>

      {/* inserção */}
      <div className="flex items-center gap-1 flex-wrap px-3 py-1.5 border-t border-line-soft bg-surface-rail/70">
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
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------- editor */

type LadderTab = 'program' | 'tags'

function CompactLadderEditor() {
  const rungs = useSimStore((s) => s.ladder.rungs)
  const addRung = useSimStore((s) => s.addRung)
  const table = useSimStore((s) => s.runtime.table)
  const blackBox = useSimStore((s) => s.sim.blackBox)
  const [tab, setTab] = useState<LadderTab>('program')
  const [ladderZoom, setLadderZoom] = useState(1)

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
    <div className="flex flex-col h-full min-h-0 bg-surface-panel">
      <TagAddressDatalist />
      <div className="flex items-center justify-between pr-2 border-b border-line bg-surface-rail">
        <div className="flex items-center">
          {tabBtn('program', 'Programa')}
          {tabBtn('tags', 'Tabela de Tags')}
        </div>
        <div className="flex items-center gap-1">
          {tab === 'program' && <span className="text-[9px] font-mono text-ink-400 mr-1">{Math.round(ladderZoom * 100)}%</span>}
          {tab === 'program' && <button onClick={() => setLadderZoom((z) => Math.max(0.75, Number((z - 0.1).toFixed(2))))} className="dc-icon-btn !h-6 !w-6" title="Reduzir escala do Ladder"><IconZoomOut size={11} /></button>}
          {tab === 'program' && <button onClick={() => setLadderZoom((z) => Math.min(1.35, Number((z + 0.1).toFixed(2))))} className="dc-icon-btn !h-6 !w-6" title="Aumentar escala do Ladder"><IconZoomIn size={11} /></button>}
          {tab === 'program' && <button onClick={addRung} className="dc-btn-primary dc-btn !h-6 !text-[11px] ml-1"><IconPlus size={11} /> Rung</button>}
        </div>
      </div>

      {tab === 'tags' ? (
        <TagTable />
      ) : blackBox ? (
        <div className="flex-1 flex items-center justify-center p-6 text-center text-xs text-ink-500 leading-relaxed">
          <div className="max-w-[260px] space-y-2">
            <div className="mx-auto w-10 h-10 rounded-full bg-surface-sunken border border-line flex items-center justify-center text-ink-400 font-bold">■</div>
            Modo caixa-preta ativo: o programa Ladder está oculto para o operador. Use o Monitor e a Sonda para deduzir a lógica.
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-auto min-h-0 bg-[#f7f9fc]">
          <div className="p-2.5 min-w-[520px]" style={{ zoom: ladderZoom }}>
            {rungs.map((r, i) => (
              <RungRow key={r.id} rung={r} index={i} />
            ))}
            {rungs.length === 0 && (
              <div className="text-center text-ink-400 text-xs mt-10">
                Nenhum rung no programa.
                <button onClick={addRung} className="dc-btn-primary dc-btn mx-auto mt-3">
                  <IconPlus size={11} /> Criar o primeiro rung
                </button>
              </div>
            )}
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
      <div className="ladder-brand-mark">DC<span>•</span></div>
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
      <span className="mt-auto text-[9px] text-indigo-300/70">v2.0</span>
    </aside>
  )
}

function ProjectTreePane() {
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
  return (
    <aside className="ladder-project-pane">
      <div className="ladder-pane-heading">
        <span>Projeto</span>
        <button className="ladder-ghost-button" title="Fechar projeto">×</button>
      </div>
      <div className="ladder-project-tree">
        <div className="tree-row tree-root"><IconChevronDown size={12} /> <span className="tree-folder">▣</span> PLC_1 <small>(CPU 315-2 PN/DP)</small></div>
        <div className="tree-row tree-indent"><IconChevronDown size={12} /> <span className="tree-folder">▤</span> Blocos de programa</div>
        <div className="tree-row tree-indent-2 tree-selected"><span className="tree-leaf">▣</span> Main [OB1]</div>
        <div className="tree-row tree-indent-2"><span className="tree-leaf tree-green">▣</span> FC1 [FC1]</div>
        <div className="tree-row tree-indent-2"><span className="tree-leaf tree-green">▣</span> FC2 [FC2]</div>
        {['Blocos de dados', 'Fontes externas', 'Variáveis PLC', 'Tabelas de observação', 'Backups', 'Documentação'].map((item) => (
          <div className="tree-row tree-indent" key={item}><IconChevronRight size={12} /> <span className="tree-folder">▤</span> {item}</div>
        ))}
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
          <span className="font-mono text-indigo-700">{key}</span>
          <span className="truncate text-slate-500">{prefix === 'I' ? (key === 'I1' ? 'Botão Start' : key === 'I2' ? 'Botão Stop' : 'Sensor') : prefix === 'Q' ? (key === 'Q1' ? 'Contator' : 'Motor') : 'Memória'}</span>
          <span className={`ladder-status-dot ${table[key] ? 'is-on' : ''}`} />
        </div>
      )) : <span className="text-[10px] text-slate-400">—</span>}
    </div>
  )
}

function FullLadderEditor() {
  const rungs = useSimStore((s) => s.ladder.rungs)
  const table = useSimStore((s) => s.runtime.table)
  const running = useSimStore((s) => s.sim.runState === 'running')
  const addRung = useSimStore((s) => s.addRung)
  const updateRung = useSimStore((s) => s.updateRung)
  const [activeRungId, setActiveRungId] = useState<string | null>(null)
  const [programTab, setProgramTab] = useState<'program' | 'tags'>('program')
  const [filter, setFilter] = useState('')

  const activeId = activeRungId && rungs.some((r) => r.id === activeRungId) ? activeRungId : rungs[0]?.id

  const quickAdd = (kind: PaletteKind) => {
    const rungId = activeId
    if (!rungId) {
      addRung()
      return
    }
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
      <ProjectTreePane />
      <main className="ladder-main-pane">
        <div className="ladder-project-tabs">
          <button className={`ladder-project-tab ${programTab === 'program' ? 'is-active' : ''}`} onClick={() => setProgramTab('program')}><IconSchematic size={13} /> Main [OB1] <span>×</span></button>
          <button className={`ladder-project-tab ${programTab === 'tags' ? 'is-active' : ''}`} onClick={() => setProgramTab('tags')}>Tabela de Tags</button>
          <span className="ml-auto flex items-center gap-2 text-[10px] text-slate-400">
            <span className={`ladder-connection-dot ${running ? 'is-live' : ''}`} /> {running ? 'Simulação ativa' : 'Parado'}
          </span>
        </div>
        <div className="ladder-editor-toolbar">
          <button className="ladder-toolbar-button"><IconUndo size={14} /></button>
          <button className="ladder-toolbar-button"><IconRedo size={14} /></button>
          <span className="ladder-toolbar-separator" />
          <span className="ladder-zoom-label">⌕ 100%</span>
          <button className="ladder-toolbar-button">⌗</button>
          <button className="ladder-toolbar-button">⊞</button>
          <button className="ladder-toolbar-button">↪</button>
          <span className="ladder-toolbar-separator" />
          <span className="text-[10px] text-slate-400">Programa Ladder</span>
          <button onClick={addRung} className="ladder-primary-button ml-auto"><IconPlus size={12} /> Nova network</button>
        </div>
        {programTab === 'tags' ? (
          <div className="ladder-tags-view"><TagTable /></div>
        ) : (
          <div className="ladder-networks">
            {rungs.map((r, i) => (
              <div key={r.id} className={`ladder-network-wrap ${activeId === r.id ? 'is-selected' : ''}`} onClick={() => setActiveRungId(r.id)}>
                <RungRow rung={r} index={i} />
              </div>
            ))}
            {!rungs.length && (
              <div className="ladder-empty-state">
                <IconLadder size={30} />
                <strong>Nenhuma network no programa</strong>
                <span>Adicione uma network e insira contatos, bobinas ou temporizadores.</span>
                <button onClick={addRung} className="ladder-primary-button"><IconPlus size={12} /> Criar primeira network</button>
              </div>
            )}
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
      <aside className="ladder-palette">
        <div className="ladder-palette-header"><strong>Contatos / Elementos</strong><span>›</span></div>
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
        </div>
      </aside>
    </div>
  )
}

export default function LadderEditor({ compact = false }: { compact?: boolean }) {
  return compact ? <CompactLadderEditor /> : <FullLadderEditor />
}
