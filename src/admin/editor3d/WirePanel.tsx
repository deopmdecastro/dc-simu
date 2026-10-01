import { useState } from 'react'
import { COMPAT_LABEL } from '../../catalog/terminalCompat'
import { IconCheck, IconClose, IconWarning } from '../../ui/icons'
import { useEditorStore } from './editorStore'
import { endLabel } from './wirePath'
import { useWireInfo } from './WireDraw'

const KEYS: Array<[string, string]> = [['Clique', 'larga um ponto'], ['Duplo clique / Enter', 'ponta livre'], ['Backspace', 'desfaz ponto'], ['Esc', 'cancela'], ['Shift', 'trava o eixo'], ['Alt', 'sem snap']]

/** Painel dos cabos de teste: estado do desenho em direto, atalhos, veredicto por cabo e resumo. */
export default function WirePanel() {
  const wires = useEditorStore((s) => s.testWires)
  const terminals = useEditorStore((s) => s.def.terminals)
  const wireFrom = useEditorStore((s) => s.wireFrom)
  const wireStart = useEditorStore((s) => s.wireStart)
  const points = useEditorStore((s) => s.wirePoints)
  const smooth = useEditorStore((s) => s.wireSmooth)
  const hoverWire = useEditorStore((s) => s.hoverWire)
  const set = useEditorStore((s) => s.set)
  const ribbon = useEditorStore((s) => s.ribbon)
  const info = useWireInfo()
  const [open, setOpen] = useState(true)
  const [keys, setKeys] = useState(false)
  const drafting = !!(wireFrom || wireStart)
  const count = { ok: wires.filter((w) => w.level === 'ok').length, warn: wires.filter((w) => w.level === 'warn').length, error: wires.filter((w) => w.level === 'error').length }
  const totalMm = wires.reduce((sum, wire) => sum + wire.lengthMm, 0)
  const state = useEditorStore.getState()

  return <div className={`ce-wirepanel${open ? '' : ' is-collapsed'}`} role="status">
    <div className="ce-wirepanel-head">
      <strong>Cabos de teste</strong>
      {wires.length > 0 && <span className="ce-wp-count">{wires.length}</span>}
      <span className="ce-wp-spacer" />
      <button className="ce-icon ce-wp-toggle" onClick={() => setOpen(!open)} aria-expanded={open} title={open ? 'Recolher' : 'Expandir'}>{open ? '–' : '+'}</button>
    </div>
    {open && <>
      {drafting
        ? <div className="ce-wp-live" aria-live="polite">
            <b>{wireFrom ? `Origem ${endLabel(terminals, wireFrom)}` : 'Origem livre'}</b>
            <span>{points.length} {points.length === 1 ? 'ponto' : 'pontos'}</span>
            {info.lengthMm > 0 && <span>≈ {info.lengthMm} mm</span>}
            <em>{info.hover ? `Borne ${info.hover}` : info.surface === 'surface' ? 'Sobre superfície' : 'No espaço'}</em>
          </div>
        : <small>{ribbon !== 'wire' ? 'Escolha a ferramenta Cabo [3] para ligar bornes.' : terminals.length < 1 ? 'Crie bornes para poder ligar.' : 'Clique num borne (ou numa superfície) para começar; termine noutro borne.'}</small>}
      {drafting && <div className="ce-wp-actions">
        <button className="dx-btn dx-btn-secondary dx-btn-sm" onClick={() => state.undoWirePoint()}>{points.length ? 'Desfazer ponto' : 'Cancelar'}</button>
        {points.length > 0 && <button className="dx-btn dx-btn-secondary dx-btn-sm" onClick={() => { const problem = useEditorStore.getState().finishWireFree(); if (problem) window.dispatchEvent(new CustomEvent('ce-flash', { detail: problem })) }}>Terminar aqui</button>}
        {points.length > 0 && <button className="dx-btn dx-btn-secondary dx-btn-sm" onClick={() => state.cancelWire()}>Cancelar</button>}
      </div>}
      <div className="ce-wp-options">
        <label className="ce-check"><input type="checkbox" checked={smooth} onChange={(event) => set({ wireSmooth: event.target.checked })} />Curvas suaves</label>
        <button className="ce-linkbtn" onClick={() => setKeys(!keys)}>{keys ? 'Esconder atalhos' : 'Atalhos'}</button>
      </div>
      {keys && <ul className="ce-wp-keys">{KEYS.map(([key, text]) => <li key={key}><kbd className="ce-kbd">{key}</kbd>{text}</li>)}</ul>}
      {wires.length > 0 && <div className="ce-wp-summary">
        <span className="is-ok"><IconCheck size={11} />{count.ok}</span><span className="is-warn"><IconWarning size={11} />{count.warn}</span><span className="is-error"><IconClose size={11} />{count.error}</span>
        <span className="ce-wp-spacer" /><span>{totalMm} mm no total</span>
      </div>}
      {wires.length === 0 && !drafting && <small className="ce-wirepanel-empty">Sem cabos de teste.</small>}
      <div className="ce-wp-list">
        {wires.map((wire) => <div key={wire.id} className={`ce-wire is-${wire.level}${hoverWire === wire.id ? ' is-hover' : ''}`}
          onPointerEnter={() => set({ hoverWire: wire.id })} onPointerLeave={() => set({ hoverWire: null })}>
          <b>{endLabel(terminals, wire.a)} <span className="ce-wire-link">→</span> {endLabel(terminals, wire.b)}<em className="ce-wire-meta">{wire.points.length ? `${wire.points.length} pt · ` : ''}{wire.lengthMm} mm</em></b>
          <span className="ce-wire-verdict">{wire.level === 'ok' ? <IconCheck size={12} /> : <IconWarning size={12} />}{wire.level === 'warn' && wire.messages.length === 0 ? COMPAT_LABEL.warn : wire.level === 'ok' ? COMPAT_LABEL.ok : wire.messages.join(' · ') || COMPAT_LABEL[wire.level]}</span>
          <button className="ce-icon ce-wire-x" title="Remover este cabo" aria-label="Remover este cabo" onClick={() => set({ testWires: wires.filter((item) => item.id !== wire.id), hoverWire: null })}><IconClose size={12} /></button>
        </div>)}
      </div>
      {wires.length > 0 && <button className="dx-btn dx-btn-secondary dx-btn-sm" onClick={() => set({ testWires: [], hoverWire: null })}>Limpar cabos</button>}
    </>}
  </div>
}
