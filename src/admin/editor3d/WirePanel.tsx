import { useMemo, useState } from 'react'
import { WIRE_END_OPTIONS } from '../../schematic/wireEnds'
import { IconCheck, IconClose, IconWarning } from '../../ui/icons'
import { useEditorStore } from './editorStore'
import { endLabel, evaluateWire } from './wirePath'
import { useWireInfo } from './WireDraw'
import { WireRow } from './WireInspector'
import { ColorSwatches } from './WireControls'
import { WIRE_COLOR_HEX, WIRE_GAUGES } from './wireStyle'
import type { WireEndType } from '../../types'

const KEYS: Array<[string, string]> = [['Clique', 'larga um ponto'], ['Duplo clique / Enter', 'ponta livre'], ['Backspace', 'desfaz ponto'], ['Esc', 'cancela'], ['Shift', 'trava o eixo'], ['Alt', 'sem snap']]

/** Painel dos cabos de teste: valores dos cabos novos, estado do desenho em direto, veredicto por cabo e resumo. */
export default function WirePanel() {
  const wires = useEditorStore((s) => s.testWires)
  const terminals = useEditorStore((s) => s.def.terminals)
  const wireFrom = useEditorStore((s) => s.wireFrom)
  const wireStart = useEditorStore((s) => s.wireStart)
  const points = useEditorStore((s) => s.wirePoints)
  const defaults = useEditorStore((s) => s.wireDefaults)
  const selectedWire = useEditorStore((s) => s.selectedWire)
  const set = useEditorStore((s) => s.set)
  const ribbon = useEditorStore((s) => s.ribbon)
  const info = useWireInfo()
  const [open, setOpen] = useState(true)
  const [keys, setKeys] = useState(false)
  const drafting = !!(wireFrom || wireStart)
  const verdicts = useMemo(() => wires.map((wire) => evaluateWire(terminals, wire)), [wires, terminals])
  const count = { ok: verdicts.filter((v) => v.level === 'ok').length, warn: verdicts.filter((v) => v.level === 'warn').length, error: verdicts.filter((v) => v.level === 'error').length }
  const totalMm = verdicts.reduce((sum, v) => sum + v.lengthMm, 0)
  const state = useEditorStore.getState()
  const setDefaults = (patch: Partial<typeof defaults>) => set({ wireDefaults: { ...defaults, ...patch } })

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
        : <small>{ribbon !== 'wire' ? 'Escolha a ferramenta Cabo [3] para ligar bornes; com Selecionar [1] clique num cabo para o editar.' : terminals.length < 1 ? 'Crie bornes para poder ligar.' : 'Clique num borne (ou numa superfície) para começar; termine noutro borne.'}</small>}
      {drafting && <div className="ce-wp-actions">
        <button className="dx-btn dx-btn-secondary dx-btn-sm" onClick={() => state.undoWirePoint()}>{points.length ? 'Desfazer ponto' : 'Cancelar'}</button>
        {points.length > 0 && <button className="dx-btn dx-btn-secondary dx-btn-sm" onClick={() => { const problem = useEditorStore.getState().finishWireFree(); if (problem) window.dispatchEvent(new CustomEvent('ce-flash', { detail: problem })) }}>Terminar aqui</button>}
        {points.length > 0 && <button className="dx-btn dx-btn-secondary dx-btn-sm" onClick={() => state.cancelWire()}>Cancelar</button>}
      </div>}
      <details className="ce-wp-new">
        <summary>Novo cabo <i className="ce-dot" style={{ background: defaults.autoColor ? '#94a3b8' : WIRE_COLOR_HEX[defaults.color] }} /><span>{defaults.autoColor ? 'cor automática' : defaults.color} · {defaults.gauge.replace('mm²', ' mm²')}</span></summary>
        <label className="ce-check"><input type="checkbox" checked={defaults.autoColor} onChange={(event) => setDefaults({ autoColor: event.target.checked })} />Cor automática pela função (IEC 60204-1)</label>
        <ColorSwatches value={defaults.color} disabled={defaults.autoColor} onChange={(color) => setDefaults({ color })} />
        <div className="ce-wp-row">
          <label>Secção<select className="dx-input" value={defaults.gauge} onChange={(event) => setDefaults({ gauge: event.target.value })}>{WIRE_GAUGES.map((gauge) => <option key={gauge} value={gauge}>{gauge.replace('mm²', ' mm²')}</option>)}</select></label>
          <label>Condutor<select className="dx-input" value={defaults.flexibility} onChange={(event) => setDefaults({ flexibility: event.target.value as 'rigid' | 'flexible' })}><option value="flexible">Flexível</option><option value="rigid">Rígido</option></select></label>
          <label>Terminal<select className="dx-input" value={defaults.endType} onChange={(event) => setDefaults({ endType: event.target.value as WireEndType })}>{WIRE_END_OPTIONS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>
        </div>
      </details>
      <div className="ce-wp-options">
        <button className="ce-linkbtn" onClick={() => setKeys(!keys)}>{keys ? 'Esconder atalhos' : 'Atalhos'}</button>
        {wires.length > 0 && <button className="ce-linkbtn" onClick={() => set({ tab: 'wires' })}>Abrir editor de cabos</button>}
      </div>
      {keys && <ul className="ce-wp-keys">{KEYS.map(([key, text]) => <li key={key}><kbd className="ce-kbd">{key}</kbd>{text}</li>)}</ul>}
      {wires.length > 0 && <div className="ce-wp-summary">
        <span className="is-ok"><IconCheck size={11} />{count.ok}</span><span className="is-warn"><IconWarning size={11} />{count.warn}</span><span className="is-error"><IconClose size={11} />{count.error}</span>
        <span className="ce-wp-spacer" /><span>{totalMm} mm no total</span>
      </div>}
      {wires.length === 0 && !drafting && <small className="ce-wirepanel-empty">Sem cabos de teste.</small>}
      <div className="ce-wp-list">{wires.map((wire) => <WireRow key={wire.id} wire={wire} selected={selectedWire === wire.id} />)}</div>
      {wires.length > 0 && <button className="dx-btn dx-btn-secondary dx-btn-sm" onClick={() => set({ testWires: [], hoverWire: null, selectedWire: null })}>Limpar cabos</button>}
    </>}
  </div>
}
