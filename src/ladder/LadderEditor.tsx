import { useState } from 'react'
import { useSimStore } from '../store/useSimStore'
import type { LadderContact, LadderRung, LadderContactType, LadderCoilType } from '../types'

/* ------------------------------------------------------------------ helpers */

const CONTACT_SYMBOL: Record<LadderContactType, string> = { NO: '| |', NC: '|/|', RISING: '|P|', FALLING: '|N|' }

function ContactSymbol({ el, table }: { el: LadderContact; table: Record<string, boolean> }) {
  const raw = !!table[el.address]
  const powered = el.contactType === 'NC' ? !raw : el.contactType === 'RISING' || el.contactType === 'FALLING' ? raw : raw
  return (
    <div className={`flex flex-col items-center px-1 select-none ${powered ? 'text-emerald-400' : 'text-neutral-500'}`}>
      <div className="text-[10px] leading-none mb-0.5">{el.address}</div>
      <div className={`font-mono text-base leading-none border-y-2 px-1 ${powered ? 'border-emerald-400' : 'border-neutral-600'}`}>{CONTACT_SYMBOL[el.contactType]}</div>
    </div>
  )
}

/* --------------------------------------------------------------- editor row */

function RungRow({ rung }: { rung: LadderRung }) {
  const table = useSimStore((s) => s.runtime.table)
  const rungPowered = useSimStore((s) => s.runtime.rungPowered)
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

  const smallBtn = 'text-[10px] px-1.5 py-0.5 rounded bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-neutral-300'
  const tiny = 'bg-neutral-800 border border-neutral-700 rounded px-1 py-0.5 text-[10px] text-neutral-200'

  return (
    <div className={`border rounded-md mb-3 ${powered ? 'border-emerald-500 bg-emerald-950/20' : 'border-neutral-700 bg-neutral-900'}`}>
      <div className="flex items-center justify-between px-2 py-1 text-xs text-neutral-300 border-b border-neutral-700 gap-2">
        <input className="bg-transparent outline-none font-medium text-neutral-200 flex-1 min-w-0" value={rung.name} onChange={(e) => renameRung(rung.id, e.target.value)} />
        <label className="flex items-center gap-1 text-[10px] text-neutral-500">
          <input type="checkbox" checked={rung.enabled} onChange={(e) => updateRung(rung.id, (r) => ({ ...r, enabled: e.target.checked }))} />
          ativo
        </label>
        <div className="flex gap-1">
          <button className={smallBtn} title="Mover para cima" onClick={() => moveRung(rung.id, -1)}>↑</button>
          <button className={smallBtn} title="Mover para baixo" onClick={() => moveRung(rung.id, 1)}>↓</button>
          <button className={smallBtn} title="Duplicar rung" onClick={() => duplicateRung(rung.id)}>⧉</button>
          <button className={`${smallBtn} text-red-400`} title="Excluir rung" onClick={() => deleteRung(rung.id)}>✕</button>
        </div>
      </div>

      <div className="p-2 flex flex-col gap-2">
        {rung.branches.map((b) => (
          <div key={b.id} className="flex items-center gap-1 flex-wrap">
            <span className="text-neutral-600 text-xs">├─</span>
            {b.elements.map((el) => (
              <div key={el.id} className="flex items-center">
                <button title="Clique alterna NO → NC → subida → descida" onClick={() => toggleContactType(b.id, el.id)}>
                  <ContactSymbol el={el} table={table} />
                </button>
                <input
                  className="w-12 bg-transparent text-[10px] text-neutral-300 outline-none border-b border-dashed border-neutral-700"
                  value={el.address}
                  onChange={(e) =>
                    updateRung(rung.id, (r) => ({
                      ...r,
                      branches: r.branches.map((bb) => (bb.id === b.id ? { ...bb, elements: bb.elements.map((ee) => (ee.id === el.id ? { ...ee, address: e.target.value.toUpperCase() } : ee)) } : bb)),
                    }))
                  }
                />
                <button className="text-red-500/70 hover:text-red-400 text-[10px] px-0.5" onClick={() => removeElement(b.id, el.id)}>✕</button>
              </div>
            ))}
            <span className="flex-1 border-t border-dashed border-neutral-700 mx-1" style={{ minWidth: 16 }} />
            <button className={`${smallBtn} text-red-400/70`} title="Remover ramo" onClick={() => updateRung(rung.id, (r) => ({ ...r, branches: r.branches.filter((bb) => bb.id !== b.id) }))}>− ramo</button>
          </div>
        ))}

        {/* saída */}
        <div className="flex items-center gap-2 pt-2 border-t border-neutral-800 flex-wrap">
          <span className="text-neutral-600 text-xs">saída →</span>
          {rung.coils.map((c) => (
            <button
              key={c.id}
              onClick={() => cycleCoil(c.id)}
              onContextMenu={(e) => {
                e.preventDefault()
                removeCoil(c.id)
              }}
              title="Clique alterna COIL → SET → RESET · botão direito remove"
              className={`px-2 py-1 rounded font-mono text-xs border-2 ${table[c.address] ? 'border-amber-400 text-amber-300 bg-amber-950/40' : 'border-neutral-600 text-neutral-500'}`}
            >
              ( {c.address} ) {c.coilType !== 'COIL' ? c.coilType : ''}
            </button>
          ))}
          {!rung.coils.length && <span className="text-[10px] text-neutral-600">sem bobina</span>}
        </div>

        {/* temporizador */}
        <div className="flex items-center gap-2 flex-wrap text-[10px] text-neutral-400">
          <span>Temporizador</span>
          <select className={tiny} value={rung.timer?.timerType ?? 'none'} onChange={(e) => setTimer(e.target.value as any)}>
            <option value="none">—</option>
            <option value="TON">TON</option>
            <option value="TOF">TOF</option>
            <option value="TP">TP</option>
            <option value="STAR_DELTA">Estrela-Triângulo</option>
          </select>
          {rung.timer && (
            <>
              <input className={`${tiny} w-12`} value={rung.timer.address} onChange={(e) => updateRung(rung.id, (r) => ({ ...r, timer: { ...r.timer!, address: e.target.value.toUpperCase() } }))} />
              <span>preset</span>
              <input type="number" className={`${tiny} w-16`} value={rung.timer.presetMs} onChange={(e) => updateRung(rung.id, (r) => ({ ...r, timer: { ...r.timer!, presetMs: Number(e.target.value) } }))} />
              <span>ms</span>
              {rung.timer.timerType === 'STAR_DELTA' && (
                <>
                  <span>transição</span>
                  <input type="number" className={`${tiny} w-14`} value={rung.timer.preset2Ms ?? 50} onChange={(e) => updateRung(rung.id, (r) => ({ ...r, timer: { ...r.timer!, preset2Ms: Number(e.target.value) } }))} />
                  <span>ms</span>
                </>
              )}
            </>
          )}
        </div>

        {/* contador */}
        <div className="flex items-center gap-2 flex-wrap text-[10px] text-neutral-400">
          <span>Contador</span>
          <select className={tiny} value={rung.counter?.counterType ?? 'none'} onChange={(e) => setCounter(e.target.value as any)}>
            <option value="none">—</option>
            <option value="CTU">CTU (crescente)</option>
            <option value="CTD">CTD (decrescente)</option>
          </select>
          {rung.counter && (
            <>
              <input className={`${tiny} w-12`} value={rung.counter.address} onChange={(e) => updateRung(rung.id, (r) => ({ ...r, counter: { ...r.counter!, address: e.target.value.toUpperCase() } }))} />
              <span>preset</span>
              <input type="number" className={`${tiny} w-14`} value={rung.counter.preset} onChange={(e) => updateRung(rung.id, (r) => ({ ...r, counter: { ...r.counter!, preset: Number(e.target.value) } }))} />
              <span>reset</span>
              <input className={`${tiny} w-12`} value={rung.counter.resetAddress ?? ''} onChange={(e) => updateRung(rung.id, (r) => ({ ...r, counter: { ...r.counter!, resetAddress: e.target.value.toUpperCase() } }))} />
            </>
          )}
        </div>

        {/* inserir contato / bobina / ramo */}
        <div className="flex items-center gap-1 flex-wrap pt-2 border-t border-neutral-800">
          <input className={`${tiny} w-14`} value={newAddress} onChange={(e) => setNewAddress(e.target.value.toUpperCase())} placeholder="I1" />
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
          <button className={smallBtn} onClick={addContact}>+ contato</button>
          <button className={smallBtn} onClick={addBranch}>+ ramo (OR)</button>
          <input className={`${tiny} w-14`} value={coilAddress} onChange={(e) => setCoilAddress(e.target.value.toUpperCase())} placeholder="Q1" />
          <select className={tiny} value={coilType} onChange={(e) => setCoilType(e.target.value as LadderCoilType)}>
            <option value="COIL">COIL</option>
            <option value="SET">SET</option>
            <option value="RESET">RESET</option>
          </select>
          <button className={smallBtn} onClick={addCoil}>+ bobina</button>
        </div>
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------- editor */

export default function LadderEditor() {
  const rungs = useSimStore((s) => s.ladder.rungs)
  const addRung = useSimStore((s) => s.addRung)
  const table = useSimStore((s) => s.runtime.table)
  const blackBox = useSimStore((s) => s.sim.blackBox)

  const bits = (p: string) =>
    Object.keys(table)
      .filter((k) => k.startsWith(p))
      .sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)))
      .map((k) => `${k}=${table[k] ? 1 : 0}`)
      .join('  ')

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-neutral-800 bg-neutral-900">
        <span className="text-sm font-semibold text-neutral-200 tracking-wide">LADDER {blackBox ? '(modo caixa-preta)' : ''}</span>
        <button onClick={addRung} className="text-xs px-2 py-1 bg-blue-600 hover:bg-blue-500 rounded text-white">+ Rung</button>
      </div>

      {blackBox ? (
        <div className="flex-1 flex items-center justify-center p-6 text-center text-xs text-neutral-500 leading-relaxed">
          Modo caixa-preta ativo: o programa Ladder está oculto para o operador. Use o Monitor e a Sonda para deduzir a lógica.
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-3">
          {rungs.map((r) => (
            <RungRow key={r.id} rung={r} />
          ))}
          {rungs.length === 0 && <div className="text-neutral-500 text-sm">Nenhum rung. Clique em “+ Rung” para começar.</div>}
        </div>
      )}

      <div className="border-t border-neutral-800 p-2 text-[10px] text-neutral-500 font-mono leading-relaxed">
        <div>{bits('I')}</div>
        <div>{bits('Q')}</div>
        <div>{bits('M')}</div>
      </div>
    </div>
  )
}
