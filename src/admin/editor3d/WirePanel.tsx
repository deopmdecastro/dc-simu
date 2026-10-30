import { useMemo, useState } from 'react'
import { IconCheck, IconClose, IconWarning, IconLayers } from '../../ui/icons'
import SidePanelHeader from '../../components/SidePanelHeader'
import { useEditorStore } from './editorStore'
import { endLabel, evaluateWire } from './wirePath'
import { useWireInfo } from './WireDraw'
import { WireRow } from './WireInspector'
import { WIRE_COLOR_HEX } from './wireStyle'
import { WireOptionsFields } from '../../ui/WireOptions'

const KEYS: Array<[string, string]> = [['Clique', 'larga um ponto'], ['Duplo clique / Enter', 'ponta livre'], ['Backspace', 'desfaz ponto'], ['Esc', 'cancela'], ['Shift', 'trava o eixo'], ['Alt', 'sem snap']]

/** Painel dos cabos de teste: valores dos cabos novos, estado do desenho em direto, veredicto por cabo e resumo. */
/** `embedded`: dentro do separador «Cabos de teste» do painel esquerdo — sem cabeçalho nem recolher próprios. */
export default function WirePanel({ embedded = false }: { embedded?: boolean } = {}) {
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
  const [expanded, setOpen] = useState(true)
  const open = embedded || expanded
  const [keys, setKeys] = useState(false)
  const drafting = !!(wireFrom || wireStart)
  const verdicts = useMemo(() => wires.map((wire) => evaluateWire(terminals, wire)), [wires, terminals])
  const count = { ok: verdicts.filter((v) => v.level === 'ok').length, warn: verdicts.filter((v) => v.level === 'warn').length, error: verdicts.filter((v) => v.level === 'error').length }
  const totalMm = verdicts.reduce((sum, v) => sum + v.lengthMm, 0)
  const state = useEditorStore.getState()
  const setDefaults = (patch: Partial<typeof defaults>) => set({ wireDefaults: { ...defaults, ...patch } })

  return <div className={`ce-wirepanel${open ? '' : ' is-collapsed'}${embedded ? ' is-embedded' : ''}`} role="status">
    {!embedded && <SidePanelHeader
      className="ce-wirepanel-head"
      eyebrow="CABOS"
      title="Cabos de teste"
      icon={<IconLayers size={16} />}
      side="left"
      collapsed={!open}
      onToggle={() => setOpen(!open)}
      toggleLabel={open ? 'Recolher cabos de teste' : 'Expandir cabos de teste'}
      toggleClassName="ce-wp-toggle"
      detail={wires.length > 0 ? `${wires.length} cabo${wires.length === 1 ? '' : 's'}` : undefined}
    />}
    {open && <>
      {/* Opções dos cabos e ponteiras no painel lateral (o mesmo bloco do simulador). */}
      <div className="ce-wp-new" aria-label="Opções dos cabos novos">
        <div className="ce-wp-new-head">
          <i className="ce-dot" style={{ background: defaults.autoColor ? '#94a3b8' : WIRE_COLOR_HEX[defaults.color] }} />
          <strong>Novo cabo</strong>
          <span>{defaults.autoColor ? 'cor automática' : defaults.color} · {defaults.gauge.replace('mm²', ' mm²')}</span>
        </div>
        <WireOptionsFields value={defaults} onChange={setDefaults} />
      </div>
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
