import { useMemo } from 'react'
import { COMPAT_LABEL } from '../../catalog/terminalCompat'
import type { Vec3 } from '../../catalog/types'
import { IconCheck, IconClose, IconEye, IconEyeOff, IconFocus, IconWarning } from '../../ui/icons'
import { useEditorStore, type TestWire } from './editorStore'
import { ColorSwatches, ConductorChooser, EndChooser } from './WireControls'
import { Empty, Field, Num, Section, Select, Text } from './ui'
import { endLabel, evaluateWire, wireModel } from './wirePath'
import { WIRE_COLOR_HEX, WIRE_COLOR_LABEL, WIRE_END_LABEL, WIRE_GAUGES, WIRE_KIND_COLOR, WIRE_KIND_LABEL, cableOuterDiameterMm } from './wireStyle'
import type { WireKind } from '../../types'

const FREE = '__free'

/** Inspetor dos cabos de teste: cor, secção, função, condutor, terminações, ligações e pontos do traçado — como no simulador. */
export function WiresTab() {
  const wires = useEditorStore((s) => s.testWires)
  const selectedId = useEditorStore((s) => s.selectedWire)
  const terminals = useEditorStore((s) => s.def.terminals)
  const set = useEditorStore((s) => s.set)
  const patch = useEditorStore((s) => s.patchWire)
  const remove = useEditorStore((s) => s.removeWire)
  const reverse = useEditorStore((s) => s.reverseWire)
  const wire = wires.find((item) => item.id === selectedId)
  const verdict = useMemo(() => (wire ? evaluateWire(terminals, wire) : null), [wire, terminals])
  const model = useMemo(() => (wire ? wireModel(terminals, wire) : null), [wire, terminals])
  const terminalOptions: Array<[string, string]> = [[FREE, 'Ponta livre'], ...terminals.map((item): [string, string] => [item.id, `${item.label} · ${item.name}`])]

  if (wires.length === 0) return <>
    <Empty>Ainda sem cabos de teste. Escolha a ferramenta <b>Cabo [3]</b> e clique num borne para começar; termine noutro borne (ou com duplo clique para deixar a ponta livre).</Empty>
    <div className="ce-overview-actions"><button className="dx-btn dx-btn-secondary dx-btn-sm" onClick={() => useEditorStore.getState().setRibbon('wire')}>Ligar cabo [3]</button></div>
  </>

  const setEnd = (side: 'a' | 'b', value: string) => {
    if (!wire) return
    const terminal = value === FREE ? undefined : terminals.find((item) => item.id === value)
    const current = side === 'a' ? wire.a : wire.b
    const currentTerminal = current ? terminals.find((item) => item.id === current) : undefined
    if (terminal) patch(wire.id, side === 'a' ? { a: terminal.id, start: undefined } : { b: terminal.id, end: undefined })
    else patch(wire.id, side === 'a' ? { a: null, start: (currentTerminal?.position ?? wire.start ?? [0, 0, 0]) as Vec3 } : { b: null, end: (currentTerminal?.position ?? wire.end ?? [0, 0, 0]) as Vec3 })
  }
  const editPoint = (index: number, value: Vec3) => wire && patch(wire.id, { points: wire.points.map((item, position) => (position === index ? value : item)) })
  const addPoint = () => {
    if (!wire || !model) return
    // novo ponto a meio do troço mais longo do traçado
    let at = 0, best = -1
    for (let index = 0; index < model.chain.length - 1; index += 1) { const length = model.chain[index].distanceTo(model.chain[index + 1]); if (length > best) { best = length; at = index } }
    const middle = model.chain[at].clone().lerp(model.chain[at + 1], 0.5)
    const points = [...wire.points]
    points.splice(Math.max(0, Math.min(points.length, at - 1)), 0, [Math.round(middle.x * 10) / 10, Math.round(middle.y * 10) / 10, Math.round(middle.z * 10) / 10])
    patch(wire.id, { points })
  }
  const hex = wire ? WIRE_COLOR_HEX[wire.color] : '#ef4444'

  return <>
    <Section title={`Cabos de teste (${wires.length})`}>
      <div className="ce-wlist" role="listbox" aria-label="Cabos de teste">
        {wires.map((item) => <WireRow key={item.id} wire={item} selected={item.id === selectedId} />)}
      </div>
      <div className="ce-actions">
        <button className="dx-btn dx-btn-secondary dx-btn-sm" onClick={() => useEditorStore.getState().setRibbon('wire')}>+ Novo cabo [3]</button>
        <button className="dx-btn dx-btn-secondary dx-btn-sm" onClick={() => set({ testWires: [], selectedWire: null, hoverWire: null })}>Limpar todos</button>
      </div>
    </Section>
    {!wire && <Empty>Selecione um cabo na lista ou clique nele no viewport (ferramenta Selecionar) para editar cor, secção e terminações.</Empty>}
    {wire && verdict && <>
      <Section title="Identificação">
        <Field label="Nome"><Text value={wire.number} onChange={(number) => patch(wire.id, { number })} /></Field>
        <Field label="Função" hint="Ao mudar a função a cor segue a norma (IEC 60204-1); pode alterá-la depois.">
          <Select<WireKind> value={wire.kind} onChange={(kind) => patch(wire.id, { kind, color: WIRE_KIND_COLOR[kind] })} options={Object.entries(WIRE_KIND_LABEL) as Array<[WireKind, string]>} />
        </Field>
        <div className={`ce-verdict is-${verdict.level}`}>
          {verdict.level === 'ok' ? <IconCheck size={13} /> : <IconWarning size={13} />}
          <span><b>{verdict.level === 'ok' ? COMPAT_LABEL.ok : COMPAT_LABEL[verdict.level]}</b>{verdict.messages.length > 0 && ` — ${verdict.messages.join(' · ')}`}</span>
          <em>{verdict.lengthMm} mm</em>
        </div>
      </Section>
      <Section title="Cor do cabo">
        <ColorSwatches value={wire.color} onChange={(color) => patch(wire.id, { color })} />
        <p className="ce-hint">Atual: <b style={{ color: hex === '#f1f5f9' ? '#64748b' : hex }}>{WIRE_COLOR_LABEL[wire.color]}</b> — aplicada de imediato no viewport.</p>
      </Section>
      <Section title="Secção e condutor">
        <Field label="Secção" hint={`Ø exterior ≈ ${cableOuterDiameterMm(wire.gauge).toFixed(1)} mm`}>
          <Select value={wire.gauge} onChange={(gauge) => patch(wire.id, { gauge })} options={WIRE_GAUGES.map((item): [string, string] => [item, item.replace('mm²', ' mm²')])} />
        </Field>
        <ConductorChooser value={wire.flexibility} color={hex} onChange={(flexibility) => patch(wire.id, { flexibility })} />
      </Section>
      <Section title="Terminais das pontas">
        <p className="ce-hint">Terminação de cada ponta do cabo (ponteira, olhal, forquilha, pino, faston…).</p>
        <label className="ce-endlabel">Ponta A · {endLabel(terminals, wire.a)} <b>{WIRE_END_LABEL[wire.endA]}</b></label>
        <EndChooser label="Terminação da ponta A" value={wire.endA} color={hex} onChange={(endA) => patch(wire.id, { endA })} />
        <label className="ce-endlabel">Ponta B · {endLabel(terminals, wire.b)} <b>{WIRE_END_LABEL[wire.endB]}</b></label>
        <EndChooser label="Terminação da ponta B" value={wire.endB} color={hex} onChange={(endB) => patch(wire.id, { endB })} />
        <div className="ce-actions">
          <button className="dx-btn dx-btn-secondary dx-btn-sm" onClick={() => patch(wire.id, { endB: wire.endA })}>Copiar A → B</button>
          <button className="dx-btn dx-btn-secondary dx-btn-sm" onClick={() => patch(wire.id, { endA: wire.endB })}>Copiar B → A</button>
        </div>
      </Section>
      <Section title="Ligações e traçado">
        <Field label="Origem (A)"><Select value={wire.a ?? FREE} onChange={(value) => setEnd('a', value)} options={terminalOptions} /></Field>
        <Field label="Destino (B)"><Select value={wire.b ?? FREE} onChange={(value) => setEnd('b', value)} options={terminalOptions} /></Field>
        <div className="ce-actions">
          <button className="dx-btn dx-btn-secondary dx-btn-sm" onClick={() => reverse(wire.id)} title="Troca origem e destino (e as terminações)">Inverter sentido</button>
          <button className="dx-btn dx-btn-secondary dx-btn-sm" onClick={addPoint}>+ Ponto</button>
          <button className="dx-btn dx-btn-secondary dx-btn-sm" disabled={wire.points.length === 0} onClick={() => patch(wire.id, { points: [] })}>Limpar pontos</button>
        </div>
        {wire.points.length === 0 && <p className="ce-hint">Sem pontos intermédios: o cabo segue direto entre as pontas. Duplo clique no cabo (viewport) acrescenta um ponto; arraste-o para o mover; duplo clique no ponto remove-o.</p>}
        {wire.points.map((point, index) => <div key={index} className="ce-pointrow">
          <b>{index + 1}</b>
          {point.map((value, axis) => <Num key={axis} value={value} step={0.5} onChange={(next) => { const copy = [...point] as Vec3; copy[axis] = next; editPoint(index, copy) }} />)}
          <button className="ce-icon" title="Remover ponto" aria-label={`Remover ponto ${index + 1}`} onClick={() => patch(wire.id, { points: wire.points.filter((_, position) => position !== index) })}><IconClose size={12} /></button>
        </div>)}
      </Section>
      <div className="ce-actions ce-wire-foot">
        <button className="dx-btn dx-btn-secondary dx-btn-sm ce-btn-icon" onClick={() => useEditorStore.getState().cameraTo('fitSel')}><IconFocus size={12} />Enquadrar cabo</button>
        <button className="dx-btn dx-btn-danger dx-btn-sm" onClick={() => remove(wire.id)}>Remover cabo</button>
      </div>
    </>}
  </>
}

export function WireRow({ wire, selected }: { wire: TestWire; selected: boolean }) {
  const terminals = useEditorStore((s) => s.def.terminals)
  const set = useEditorStore((s) => s.set)
  const patch = useEditorStore((s) => s.patchWire)
  const remove = useEditorStore((s) => s.removeWire)
  const verdict = useMemo(() => evaluateWire(terminals, wire), [terminals, wire])
  return <div role="option" aria-selected={selected} tabIndex={0} className={`ce-wrow${selected ? ' is-active' : ''}${wire.hidden ? ' is-hidden' : ''} is-${verdict.level}`}
    onClick={() => set({ selectedWire: wire.id, selection: null, tab: 'wires' })}
    onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); set({ selectedWire: wire.id, selection: null, tab: 'wires' }) } }}
    onPointerEnter={() => set({ hoverWire: wire.id })} onPointerLeave={() => set({ hoverWire: null })}>
    <i className="ce-dot" style={{ background: WIRE_COLOR_HEX[wire.color] }} />
    <span className="ce-wrow-name"><b>{wire.number}</b> {endLabel(terminals, wire.a)} <span className="ce-wire-link">→</span> {endLabel(terminals, wire.b)}</span>
    <em className="ce-wire-meta">{wire.gauge.replace('mm²', '')} mm² · {verdict.lengthMm} mm</em>
    <span className="ce-wrow-verdict" title={verdict.messages.join(' · ') || COMPAT_LABEL[verdict.level]}>{verdict.level === 'ok' ? <IconCheck size={12} /> : <IconWarning size={12} />}</span>
    <button className="ce-icon" title={wire.hidden ? 'Mostrar cabo' : 'Ocultar cabo'} aria-label={wire.hidden ? 'Mostrar cabo' : 'Ocultar cabo'} onClick={(event) => { event.stopPropagation(); patch(wire.id, { hidden: !wire.hidden }) }}>{wire.hidden ? <IconEyeOff size={13} /> : <IconEye size={13} />}</button>
    <button className="ce-icon" title="Remover este cabo" aria-label="Remover este cabo" onClick={(event) => { event.stopPropagation(); remove(wire.id) }}><IconClose size={12} /></button>
  </div>
}
