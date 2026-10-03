import { useMemo, useState } from 'react'
import * as THREE from 'three'
import { MULTIMETER_VARS, mergeVars, multimeterReading, selectorValue, varDefsOf } from '../../catalog/behavior'
import { listGlbNodes } from '../../catalog/componentRig'
import { newId } from '../../catalog/definition'
import type { BehaviorEvent, ComponentDefinition, ControlAction, ControlDef, DisplayDef, DisplayLine, VarDef, VarValue, Vec3, WhenDef } from '../../catalog/types'
import { IconClose } from '../../ui/icons'
import { AutoDetectSection } from './AutoDetectPanel'
import { glbCache, useEditorStore } from './editorStore'
import { applyMultimeterPreset, breakerAxesOf, detectHandleNodes, guessBehavior, newControl, newDisplay, triggerEditorControl } from './controlOps'
import { tiltControlPatch } from '../../catalog/controlMotion'
import { BreakerAutomation, MotionFields } from './MotionPanel'
import { defBounds } from './terminalOps'
import { Check, Color, Confirm, Empty, Field, Group, Num, PresetCard, Section, Select, Text, Vec3Input } from './ui'

const AXES: Array<[string, string, Vec3]> = [
  ['z+', 'Frente (+Z)', [0, 0, 1]], ['z-', 'Trás (−Z)', [0, 0, -1]], ['x+', 'Direita (+X)', [1, 0, 0]], ['x-', 'Esquerda (−X)', [-1, 0, 0]], ['y+', 'Topo (+Y)', [0, 1, 0]], ['y-', 'Base (−Y)', [0, -1, 0]],
]
const axisKey = (axis: Vec3) => AXES.find(([, , value]) => value.every((component, index) => Math.sign(component) === Math.sign(axis[index]) && Math.abs(Math.abs(component) - Math.abs(axis[index])) < 0.5))?.[0] ?? 'z+'
const parseValue = (text: string): VarValue => (text === 'true' ? true : text === 'false' ? false : text.trim() !== '' && Number.isFinite(Number(text)) ? Number(text) : text)

/** Objetos do GLB de uma peça (nomes), para escolher numa lista. */
function glbNodeNames(def: ComponentDefinition, partId: string): string[] {
  const part = def.parts.find((item) => item.id === partId)
  const holder = part?.kind === 'glb' && part.asset ? glbCache.get(part.asset) : undefined
  return holder ? listGlbNodes(holder).map((node) => node.name) : []
}

const boxOf = (bounds: { min: Vec3; max: Vec3 }) => new THREE.Box3(new THREE.Vector3(...bounds.min), new THREE.Vector3(...bounds.max))
const shortNode = (name: string) => name.replace(/^occurrence_of_/, '')

/** Lista de objetos do GLB ligados a um controlo/luz + «Escolher no modelo». */
export function NodePicker({ partId, nodes, onChange, pickKind, id }: { partId: string; nodes: string[] | undefined; onChange: (nodes: string[]) => void; pickKind: 'control' | 'light'; id: string }) {
  const def = useEditorStore((s) => s.def)
  const pick = useEditorStore((s) => s.pick)
  const set = useEditorStore((s) => s.set)
  const glbRevision = useEditorStore((s) => s.glbRevision)
  const names = useMemo(() => glbNodeNames(def, partId), [def.parts, def.assets, partId, glbRevision])
  const active = pick?.kind === pickKind && pick.id === id
  const list = nodes ?? []
  const isGlb = def.parts.find((item) => item.id === partId)?.kind === 'glb'
  if (!isGlb) return <p className="ce-hint">A peça é uma forma simples: o controlo move a peça inteira.</p>
  return <>
    <div className="ce-actions">
      <button className={`dx-btn dx-btn-sm ${active ? 'dx-btn-primary' : 'dx-btn-secondary'}`} onClick={() => set({ pick: active ? null : { kind: pickKind, id }, hoverNode: null, ribbon: 'select', placing: false })}>{active ? 'Concluir seleção' : 'Escolher no modelo'}</button>
      {list.length > 0 && <button className="dx-btn dx-btn-sm ce-linkbtn" onClick={() => onChange([])}>Limpar</button>}
    </div>
    <p className="ce-hint">{active ? 'Clique nos objetos do modelo (botão, manípulo, rótulos…): cada clique liga ou desliga o objeto. Os marcados movem-se juntos.' : list.length ? `${list.length} objeto(s) ligado(s).` : 'Nenhum objeto escolhido: clique em «Escolher no modelo» e depois no botão/manípulo.'}</p>
    <div className="ce-chips">{list.map((name) => <span key={name} className="ce-chip" title={name}>{shortNode(name)}<button aria-label="Remover" onClick={() => onChange(list.filter((item) => item !== name))}><IconClose size={10} /></button></span>)}</div>
    {names.length > 0 && <Field label="Adicionar da lista"><Select value="" onChange={(name) => name && !list.includes(name) && onChange([...list, name])} options={[['', '— escolher objeto —'], ...names.filter((name) => !list.includes(name)).map((name): [string, string] => [name, shortNode(name)])]} /></Field>}
  </>
}

const BEHAVIOR_EVENTS: Array<[BehaviorEvent, string]> = [['select', 'SEL (Ω ⇄ continuidade)'], ['hold', 'HOLD (congelar)'], ['light', 'Retroiluminação'], ['power', 'OFF do ecrã']]
const ACTION_TYPES: Array<[ControlAction['type'], string]> = [
  ['toggleVar', 'Alternar variável (liga/desliga)'], ['setVar', 'Definir variável'], ['cycleVar', 'Percorrer valores de uma variável'], ['behavior', 'Evento do multímetro'],
  ['setState', 'Ir para estado'], ['toggleState', 'Alternar entre dois estados'], ['delayedState', 'Ir para estado após atraso'],
]

function ActionList({ def, actions, onChange }: { def: ComponentDefinition; actions: ControlAction[]; onChange: (actions: ControlAction[]) => void }) {
  const vars = varDefsOf(def)
  const varOptions = vars.map((item): [string, string] => [item.id, item.name])
  const stateOptions = def.states.map((state): [string, string] => [state.id, state.name])
  const firstVar = vars[0]?.id ?? ''
  const first = def.states[0]?.id ?? ''
  const make = (type: ControlAction['type']): ControlAction => type === 'toggleVar' ? { type, var: firstVar } : type === 'setVar' ? { type, var: firstVar, value: true } : type === 'cycleVar' ? { type, var: firstVar, values: ['a', 'b'] }
    : type === 'behavior' ? { type, event: 'hold' } : type === 'setState' ? { type, state: first } : type === 'toggleState' ? { type, a: first, b: def.states[1]?.id ?? first } : type === 'delayedState' ? { type, state: first, afterMs: 1000 } : { type: 'cycleStates', states: def.states.map((s) => s.id) }
  const patch = (index: number, next: ControlAction) => onChange(actions.map((item, i) => (i === index ? next : item)))
  return <>
    {actions.map((action, index) => <div key={index} className="ce-action-card">
      <div className="ce-action-head"><Select value={action.type} onChange={(type) => patch(index, make(type))} options={ACTION_TYPES} />
        <button className="ce-linkbtn" aria-label="Remover ação" title="Remover ação" onClick={() => onChange(actions.filter((_, i) => i !== index))}><IconClose size={12} /></button></div>
      {(action.type === 'toggleVar' || action.type === 'setVar' || action.type === 'cycleVar') && <Field label="Variável"><Select value={action.var} onChange={(v) => patch(index, { ...action, var: v })} options={varOptions.length ? varOptions : [['', '— crie uma variável —']]} /></Field>}
      {action.type === 'setVar' && <Field label="Valor" hint="true/false, um número ou texto"><Text value={String(action.value)} onChange={(value) => patch(index, { ...action, value: parseValue(value) })} /></Field>}
      {action.type === 'cycleVar' && <Field label="Valores" hint="separados por vírgula"><Text value={action.values.join(', ')} onChange={(text) => patch(index, { ...action, values: text.split(',').map((item) => parseValue(item.trim())) })} /></Field>}
      {action.type === 'behavior' && <Field label="Evento"><Select value={action.event} onChange={(event) => patch(index, { ...action, event })} options={BEHAVIOR_EVENTS} /></Field>}
      {(action.type === 'setState' || action.type === 'delayedState') && <Field label="Estado"><Select value={action.state} onChange={(state) => patch(index, { ...action, state })} options={stateOptions} /></Field>}
      {action.type === 'delayedState' && <Field label="Atraso"><Num value={action.afterMs} min={0} step={100} unit="ms" onChange={(afterMs) => patch(index, { ...action, afterMs })} /></Field>}
      {action.type === 'toggleState' && <>
        <Field label="Estado A"><Select value={action.a} onChange={(a) => patch(index, { ...action, a })} options={stateOptions} /></Field>
        <Field label="Estado B"><Select value={action.b} onChange={(b) => patch(index, { ...action, b })} options={stateOptions} /></Field>
      </>}
    </div>)}
    <button className="dx-btn dx-btn-secondary dx-btn-sm" onClick={() => onChange([...actions, make('toggleVar')])}>+ Ação</button>
  </>
}

export const whenFields = (def: ComponentDefinition, when: WhenDef | undefined, onChange: (when: WhenDef | undefined) => void) => {
  const options: Array<[string, string]> = [['', '— só pelos estados —'], ...varDefsOf(def).map((item): [string, string] => [item.id, item.name])]
  return <>
    <Field label="Acende quando"><Select value={when?.var ?? ''} onChange={(v) => onChange(v ? { var: v, op: when?.op ?? 'eq', value: when?.value ?? true } : undefined)} options={options} /></Field>
    {when && <>
      <Field label="Condição"><Select value={when.op ?? 'eq'} onChange={(op) => onChange({ ...when, op })} options={[['eq', 'é igual a'], ['ne', 'é diferente de']]} /></Field>
      <Field label="Valor" hint="true/false, número ou texto (ex.: o id da posição do seletor)"><Text value={String(when.value ?? true)} onChange={(value) => onChange({ ...when, value: parseValue(value) })} /></Field>
    </>}
  </>
}

/* ----------------------------------------------------------------------- botões */

function MeterSection() {
  const def = useEditorStore((s) => s.def)
  const edit = useEditorStore((s) => s.edit)
  const set = useEditorStore((s) => s.set)
  const meterTest = useEditorStore((s) => s.meterTest)
  const previewVars = useEditorStore((s) => s.previewVars)
  const [message, setMessage] = useState('')
  const behavior = def.behavior
  const vars = mergeVars(def, previewVars)
  const reading = behavior ? multimeterReading(vars, meterTest, 0) : null
  const termOptions: Array<[string, string]> = [['', '— sem borne —'], ...def.terminals.map((terminal): [string, string] => [terminal.id, `${terminal.label} · ${terminal.name}`])]
  const setTest = (patch: Partial<typeof meterTest>) => set({ meterTest: { ...meterTest, ...patch } })
  return <Section title="Multímetro (comportamento embutido)">
    <p className="ce-hint">Transforma o componente num multímetro: o seletor muda a grandeza (V⎓, V~, Ω, mA, 10 A), os botões fazem SEL/HOLD/OFF e o ecrã LCD mostra a medição do circuito entre as fichas COM e V/Ω.</p>
    <div className="ce-actions">
      <button className="dx-btn dx-btn-primary dx-btn-sm" onClick={() => setMessage(applyMultimeterPreset())}>{behavior ? 'Reaplicar modelo de multímetro' : 'Aplicar modelo de multímetro'}</button>
      {behavior && <Confirm label="Remover" className="dx-btn dx-btn-danger dx-btn-sm" onConfirm={() => edit((state) => ({ ...state, behavior: undefined }))} />}
    </div>
    {message && <p className="ce-hint" role="status">{message}</p>}
    {behavior && <>
      {(['com', 'volt', 'milliamp', 'amp'] as const).map((key) => <Field key={key} label={key === 'com' ? 'Ficha COM' : key === 'volt' ? 'Ficha V/Ω' : key === 'milliamp' ? 'Ficha mA' : 'Ficha 10 A'}>
        <Select value={behavior[key]} onChange={(id) => edit((state) => ({ ...state, behavior: { ...state.behavior!, [key]: id } }))} options={termOptions} /></Field>)}
      <button className="dx-btn dx-btn-secondary dx-btn-sm" onClick={() => edit((state) => ({ ...state, behavior: { ...state.behavior!, ...guessBehavior(state).behavior } }))}>Procurar fichas pelos rótulos</button>
      <p className="ce-hint"><b>Valores de teste</b> (só no editor — no simulador vêm do circuito ligado às fichas):</p>
      <Field label="Tensão CC"><Num value={meterTest.vdc} step={0.5} unit="V" onChange={(vdc) => setTest({ vdc })} /></Field>
      <Field label="Tensão CA"><Num value={meterTest.vac} step={1} unit="V" onChange={(vac) => setTest({ vac })} /></Field>
      <Field label="Resistência"><span className="ce-inline"><Num value={meterTest.ohm ?? 0} min={0} step={10} unit="Ω" disabled={meterTest.ohm === null} onChange={(ohm) => setTest({ ohm })} />
        <Check checked={meterTest.ohm === null} label="aberto" onChange={(open) => setTest({ ohm: open ? null : 100 })} /></span></Field>
      <Field label="Corrente mA"><Num value={meterTest.ma} step={1} unit="mA" onChange={(ma) => setTest({ ma })} /></Field>
      <Field label="Corrente 10 A"><Num value={meterTest.amp} step={0.1} unit="A" onChange={(amp) => setTest({ amp })} /></Field>
      <Check checked={meterTest.leads.com && meterTest.leads.volt} label="Pontas em COM e V/Ω" onChange={(on) => setTest({ leads: { ...meterTest.leads, com: on, volt: on } })} />
      <Check checked={meterTest.leads.ma} label="Ponta na ficha mA" onChange={(on) => setTest({ leads: { ...meterTest.leads, ma: on } })} />
      <Check checked={meterTest.leads.amp} label="Ponta na ficha 10 A" onChange={(on) => setTest({ leads: { ...meterTest.leads, amp: on } })} />
      {reading && <div className="dc-meter-readout" role="status"><span className="dc-meter-lcd">{reading.on ? `${reading.negative ? '-' : ''}${reading.text} ${reading.unit}` : 'OFF'}</span>
        <span className="dc-meter-tags">{reading.quantity}{reading.hold ? ' · HOLD' : ''}{reading.beep ? ' · bip' : ''}</span>{reading.warning && <span className="dc-meter-warn">{reading.warning}</span>}</div>}
    </>}
  </Section>
}

function VarsSection() {
  const def = useEditorStore((s) => s.def)
  const edit = useEditorStore((s) => s.edit)
  const previewVars = useEditorStore((s) => s.previewVars)
  const set = useEditorStore((s) => s.set)
  const own = def.vars ?? []
  const patch = (id: string, value: Partial<VarDef>) => edit((state) => ({ ...state, vars: (state.vars ?? []).map((item) => (item.id === id ? { ...item, ...value } : item)) }), `var:${id}`)
  const builtin = def.behavior ? MULTIMETER_VARS : []
  const values = mergeVars(def, previewVars)
  return <Section title="Variáveis do componente" open={own.length > 0} actions={<button className="dx-btn dx-btn-secondary dx-btn-sm" onClick={() => edit((state) => ({ ...state, vars: [...(state.vars ?? []), { id: `v${(state.vars ?? []).length + 1}_${newId('').slice(0, 3).toLowerCase()}`, name: `Variável ${(state.vars ?? []).length + 1}`, type: 'bool', initial: false }] }))}>+ Nova</button>}>
    <p className="ce-hint">As variáveis guardam o estado de botões, seletores e ecrãs (ligado, modo, contador…). Os botões alteram-nas; ecrãs e LEDs reagem a elas. Use <code>{'{id}'}</code> nos textos dos ecrãs.</p>
    {own.length === 0 && builtin.length === 0 && <Empty>Sem variáveis.</Empty>}
    {builtin.map((item) => <div key={item.id} className="ce-hint"><code>{item.id}</code> — {item.name} <b>= {String(values[item.id])}</b></div>)}
    {own.map((item) => <div key={item.id} className="ce-action-card">
      <div className="ce-action-head"><Text value={item.name} onChange={(name) => patch(item.id, { name })} />
        <Confirm label={<IconClose size={12} />} title="Eliminar variável" className="ce-linkbtn" onConfirm={() => edit((state) => ({ ...state, vars: (state.vars ?? []).filter((entry) => entry.id !== item.id) }))} /></div>
      <Field label="Identificador"><code>{item.id}</code></Field>
      <Field label="Tipo"><Select value={item.type} onChange={(type) => patch(item.id, { type, initial: type === 'bool' ? false : type === 'number' ? 0 : '' })} options={[['bool', 'Verdadeiro/falso'], ['number', 'Número'], ['text', 'Texto']]} /></Field>
      <Field label="Valor inicial">{item.type === 'bool' ? <Check checked={Boolean(item.initial)} label="ligado" onChange={(initial) => patch(item.id, { initial })} />
        : item.type === 'number' ? <Num value={Number(item.initial)} onChange={(initial) => patch(item.id, { initial })} /> : <Text value={String(item.initial)} onChange={(initial) => patch(item.id, { initial })} />}</Field>
      <Field label="Agora (teste)">{item.type === 'bool' ? <Check checked={Boolean(values[item.id])} label="ligado" onChange={(on) => set({ previewVars: { ...previewVars, [item.id]: on } })} /> : <code>{String(values[item.id])}</code>}</Field>
    </div>)}
  </Section>
}

export function ControlsTab() {
  const def = useEditorStore((s) => s.def)
  const selection = useEditorStore((s) => s.selection)
  const edit = useEditorStore((s) => s.edit)
  const set = useEditorStore((s) => s.set)
  const previewVars = useEditorStore((s) => s.previewVars)
  const controls = def.controls ?? []
  const control = selection?.kind === 'control' ? controls.find((item) => item.id === selection.id) : undefined
  const selectedPart = selection?.kind === 'part' ? selection.id : ''
  const drawable = def.parts.filter((part) => part.kind !== 'group')
  const patch = (value: Partial<ControlDef>, key = '') => control && edit((state) => ({ ...state, controls: (state.controls ?? []).map((item) => (item.id === control.id ? { ...item, ...value } : item)) }), key ? `ctl:${control.id}:${key}` : '')
  const create = (kind: ControlDef['kind']) => {
    const partId = selectedPart || drawable.find((part) => part.kind === 'glb')?.id || drawable[0]?.id
    if (!partId) return
    const created = newControl(def, kind, partId)
    edit((state) => ({
      ...state, controls: [...(state.controls ?? []), created],
      vars: kind === 'selector' && created.bindVar && !(state.vars ?? []).some((item) => item.id === created.bindVar) && !(created.bindVar === 'dial' && state.behavior)
        ? [...(state.vars ?? []), { id: created.bindVar, name: `Posição de «${created.name}»`, type: 'text', initial: created.positions[0].id }] : state.vars,
    }))
    set({ selection: { kind: 'control', id: created.id }, tab: 'controls' })
  }
  const createPreset = (preset: 'breaker' | 'push' | 'emergency' | 'selector') => {
    const partId = selectedPart || drawable.find((part) => part.kind === 'glb')?.id || drawable[0]?.id
    if (!partId) return
    const kind: ControlDef['kind'] = preset === 'selector' ? 'selector' : preset === 'push' ? 'button' : 'toggle'
    const created = newControl(def, kind, partId)
    // o disjuntor usa `closed` (a variável do motor elétrico) e já nasce basculante, com o eixo deduzido dos bornes
    const variable = preset === 'breaker' && !varDefsOf(def).some((item) => item.id === 'closed') ? 'closed' : `control_${(def.controls ?? []).length + 1}`
    const handles = preset === 'breaker' && created.nodes?.length === 0 ? detectHandleNodes(def, partId) : []
    const configured: ControlDef = preset === 'breaker'
      ? { ...created, name: 'Manípulo do disjuntor', ...tiltControlPatch(breakerAxesOf(def), created.axis), travelMm: 0, nodes: handles.length ? handles : created.nodes, bindVar: variable, actions: [{ type: 'toggleVar', var: variable }] }
      : preset === 'selector'
      ? { ...created, name: 'Chave seletora', bindVar: variable, positions: [{ id: 'off', label: '0 · Desligado', angle: -45 }, { id: 'on', label: '1 · Ligado', angle: 45 }] }
      : { ...created, name: preset === 'emergency' ? 'Emergência com retenção' : 'Botão de pressão', travelMm: preset === 'push' ? 1.2 : 2, actions: [{ type: 'toggleVar', var: variable }] }
    edit((state) => ({ ...state, controls: [...(state.controls ?? []), configured], vars: [...(state.vars ?? []), { id: variable, name: configured.name, type: preset === 'selector' ? 'text' : 'bool', initial: preset === 'selector' ? 'off' : variable === 'closed' }] }), `control:preset:${preset}`)
    // manípulo já detetado pelo nome: não é preciso entrar no modo «escolher no modelo»
    set({ selection: { kind: 'control', id: configured.id }, tab: 'controls', pick: handles.length ? null : { kind: 'control', id: configured.id } })
  }
  const vars = mergeVars(def, previewVars)
  const varOptions = varDefsOf(def).map((item): [string, string] => [item.id, item.name])
  const bindOptions: Array<[string, string]> = control?.bindVar && !varOptions.some(([id]) => id === control.bindVar) ? [...varOptions, [control.bindVar, control.bindVar]] : varOptions
  return <>
    <MeterSection />
    <Section title="Botões, interruptores e seletores">
      <Group tone="auto" title="Acionamentos prontos"
        hint="Cada atalho cria o controlo já com variável, ação e animação. Depois é só apontar os objetos móveis do GLB e afinar eixo, curso ou ângulos.">
        <div className="ce-preset-grid">
          <PresetCard title="Disjuntor ON/OFF" description="Manípulo que bascula entre ligado e desligado, com a variável «closed» e o eixo detetado no modelo." onClick={() => createPreset('breaker')} />
          <PresetCard title="Chave seletora" description="Seletor rotativo com duas posições (0 e 1) e variável de texto com a posição escolhida." onClick={() => createPreset('selector')} />
          <PresetCard title="Botão de pressão" description="Botão momentâneo com 1,2 mm de curso que comuta a variável enquanto está premido." onClick={() => createPreset('push')} />
          <PresetCard title="Emergência travada" description="Cogumelo com retenção: fica premido até ser rearmado, com 2 mm de curso." onClick={() => createPreset('emergency')} />
        </div>
      </Group>
      <Group tone="manual" title="Criar do zero"
        hint="Começa um controlo vazio, para ligar à peça que escolher. Selecione primeiro a peça (ou os objetos do GLB) e defina as ações à mão. Pode testar em Editar › Controlos › Selecionar ou em Simular.">
        <div className="ce-preset-grid">
          <PresetCard title="Botão" description="Momentâneo: atua só enquanto está a ser premido." onClick={() => create('button')} />
          <PresetCard title="Interruptor" description="Mantém o estado entre cliques (liga/desliga)." onClick={() => create('toggle')} />
          <PresetCard title="Seletor" description="Rotativo com as posições e ângulos que definir." onClick={() => create('selector')} />
        </div>
      </Group>
      {controls.length === 0 && <Empty>Sem controlos. Use um acionamento pronto, crie um do zero ou aplique o modelo de multímetro.</Empty>}
      <div className="ce-list">{controls.map((item) => <button key={item.id} className={`ce-list-item${control?.id === item.id ? ' is-on' : ''}`} onClick={() => set({ selection: { kind: 'control', id: item.id } })}>
        <b>{item.name}</b><small>{item.kind === 'selector' ? `Seletor · ${item.positions.length} posições` : item.kind === 'toggle' ? 'Interruptor' : 'Botão'} · {def.parts.find((part) => part.id === item.partId)?.name ?? '—'}{item.nodes?.length ? ` · ${item.nodes.length} objeto(s)` : item.nodes ? ' · sem objeto' : ''}</small></button>)}</div>
    </Section>
    {control && <>
      <Section title="Controlo">
        <Field label="Nome"><Text value={control.name} onChange={(name) => patch({ name }, 'name')} /></Field>
        <Field label="Tipo"><Select value={control.kind} onChange={(kind) => patch({ kind, positions: kind === 'selector' && control.positions.length < 2 ? [{ id: 'p1', label: 'Posição 1', angle: 0 }, { id: 'p2', label: 'Posição 2', angle: 45 }] : control.positions, travelMm: kind === 'selector' ? 0 : control.travelMm || 0.6 })} options={[['button', 'Botão (momentâneo)'], ['toggle', 'Interruptor (mantém)'], ['selector', 'Seletor rotativo']]} /></Field>
        <Field label="Peça"><Select value={control.partId} onChange={(partId) => patch({ partId, nodes: def.parts.find((part) => part.id === partId)?.kind === 'glb' ? [] : undefined })} options={drawable.map((part): [string, string] => [part.id, part.name])} /></Field>
        <NodePicker partId={control.partId} nodes={control.nodes} pickKind="control" id={control.id} onChange={(nodes) => patch({ nodes })} />
      </Section>
      <Section title="Movimento">
        {control.kind === 'selector' ? <Field label="Eixo de rotação" hint="Ângulos positivos rodam no sentido horário visto de quem olha ao longo do eixo.">
          <Select value={axisKey(control.axis)} onChange={(key) => patch({ axis: AXES.find(([id]) => id === key)![2] })} options={AXES.map(([id, label]): [string, string] => [id, label])} /></Field>
          : <MotionFields control={control} patch={patch} />}
        {control.kind === 'selector' && <>
          <Field label="Variável" hint="Recebe o identificador da posição escolhida."><Select value={control.bindVar ?? ''} onChange={(bindVar) => patch({ bindVar })} options={bindOptions.length ? bindOptions : [['', '— crie uma variável —']]} /></Field>
          <p className="ce-hint">Posições (clique em «Ir» para ver o seletor nessa posição e acertar o ângulo com as marcas do modelo):</p>
          {control.positions.map((position, index) => <div key={position.id + index} className="ce-action-card">
            <div className="ce-action-head"><Text value={position.label} onChange={(label) => patch({ positions: control.positions.map((item, i) => (i === index ? { ...item, label } : item)) }, `pl${index}`)} />
              <button className="dx-btn dx-btn-secondary dx-btn-sm" onClick={() => triggerEditorControl(control, { select: position.id })}>{selectorValue(control, vars) === position.id ? 'Aqui' : 'Ir'}</button>
              <button className="ce-linkbtn" aria-label="Remover posição" onClick={() => patch({ positions: control.positions.filter((_, i) => i !== index) })}><IconClose size={12} /></button></div>
            <Field label="Identificador"><Text value={position.id} onChange={(id) => patch({ positions: control.positions.map((item, i) => (i === index ? { ...item, id: id.replace(/[^A-Za-z0-9_-]/g, '') || item.id } : item)) }, `pi${index}`)} /></Field>
            <Field label="Ângulo"><Num value={position.angle} step={1} unit="°" onChange={(angle) => { patch({ positions: control.positions.map((item, i) => (i === index ? { ...item, angle } : item)) }, `pa${index}`); triggerEditorControl(control, { select: position.id }) }} /></Field>
          </div>)}
          <button className="dx-btn dx-btn-secondary dx-btn-sm" onClick={() => patch({ positions: [...control.positions, { id: `p${control.positions.length + 1}`, label: `Posição ${control.positions.length + 1}`, angle: (control.positions[control.positions.length - 1]?.angle ?? 0) + 30 }] })}>+ Posição</button>
        </>}
      </Section>
      {control.kind !== 'selector' && <>
        <Section title="Ações ao clicar"><ActionList def={def} actions={control.actions} onChange={(actions) => patch({ actions })} />
          <div className="ce-actions"><button className="dx-btn dx-btn-secondary dx-btn-sm" onClick={() => triggerEditorControl(control, 'press')}>Testar clique</button></div></Section>
        <Section title="Ações ao manter premido (≥ 0,6 s)" open={!!control.longActions?.length}><ActionList def={def} actions={control.longActions ?? []} onChange={(longActions) => patch({ longActions })} />
          <div className="ce-actions"><button className="dx-btn dx-btn-secondary dx-btn-sm" onClick={() => triggerEditorControl(control, 'long')}>Testar premir longo</button></div></Section>
      </>}
      <Section title="Ações"><Confirm label="Eliminar controlo" className="dx-btn dx-btn-danger dx-btn-sm" onConfirm={() => { edit((state) => ({ ...state, controls: (state.controls ?? []).filter((item) => item.id !== control.id) })); set({ selection: null, pick: null }) }} /></Section>
    </>}
    {control && <BreakerAutomation control={control} />}
    <AutoDetectSection />
    <VarsSection />
  </>
}

/* ------------------------------------------------------------------------ ecrãs */

export function DisplaysTab() {
  const def = useEditorStore((s) => s.def)
  const mode = useEditorStore((s) => s.mode)
  const selection = useEditorStore((s) => s.selection)
  const edit = useEditorStore((s) => s.edit)
  const set = useEditorStore((s) => s.set)
  const placingDisplay = useEditorStore((s) => s.placingDisplay)
  const displayCorner = useEditorStore((s) => s.displayCorner)
  const glbRevision = useEditorStore((s) => s.glbRevision)
  const displays = def.displays ?? []
  const display = selection?.kind === 'display' ? displays.find((item) => item.id === selection.id) : undefined
  const patch = (value: Partial<DisplayDef>, key = '') => display && edit((state) => ({ ...state, displays: (state.displays ?? []).map((item) => (item.id === display.id ? { ...item, ...value } : item)) }), key ? `disp:${display.id}:${key}` : '')
  const patchLine = (id: string, value: Partial<DisplayLine>, key: string) => display && patch({ lines: display.lines.map((line) => (line.id === id ? { ...line, ...value } : line)) }, `${key}${id}`)
  const bounds = useMemo(() => defBounds(def), [def.parts, def.assets, glbRevision])
  const addDisplay = (kind: DisplayDef['kind']) => {
    const base = newDisplay(def, boxOf(bounds))
    const created: DisplayDef = kind === 'lcd' ? { ...base, kind, name: `LCD ${displays.length + 1}`, background: '#c4c9c0', foreground: '#14171a', lines: [], density: 28 } : base
    edit((state) => ({ ...state, displays: [...(state.displays ?? []), created] }))
    set({ selection: { kind: 'display', id: created.id }, tab: 'displays', placingDisplay: created.id, displayCorner: null, pick: null, ribbon: 'select' })
  }
  const varOptions: Array<[string, string]> = [['', '— sempre —'], ...varDefsOf(def).map((item): [string, string] => [item.id, item.name])]
  return <>
    <Section title="Ecrãs (áreas de visualização)">
      <Group tone="auto" title="Ecrãs prontos"
        hint="Já vêm com fundo, cor e tipo de leitura configurados para o uso mais comum.">
        <div className="ce-preset-grid">
          <PresetCard title="LCD do multímetro" description="Mostrador de 7 segmentos com fundo verde-cinza, ligado aos valores medidos na simulação." onClick={() => addDisplay('lcd')} />
        </div>
      </Group>
      <Group tone="manual" title="Criar do zero"
        hint={<>Ecrã de texto vazio: você define as linhas, o tamanho e as variáveis mostradas. Depois de criar, marque a área no modelo com <b>2 cliques</b> (cantos opostos).</>}>
        <div className="ce-preset-grid">
          <PresetCard title="Ecrã de texto" description="Retângulo colado à superfície onde escreve linhas com texto e variáveis do componente." onClick={() => addDisplay('text')} />
        </div>
      </Group>
      {mode === 'simulate' && <p className="ce-hint"><b>Teste ativo:</b> LCDs e ecrãs atualizam em tempo real com os botões, estados, variáveis e valores de teste do multímetro.</p>}
      {displays.length === 0 && <Empty>Sem ecrãs.</Empty>}
      <div className="ce-list">{displays.map((item) => <button key={item.id} className={`ce-list-item${display?.id === item.id ? ' is-on' : ''}`} onClick={() => set({ selection: { kind: 'display', id: item.id } })}>
        <b>{item.name}</b><small>{item.kind === 'lcd' ? 'LCD multímetro' : 'Texto'} · {item.widthMm}×{item.heightMm} mm</small></button>)}</div>
    </Section>
    {display && <>
      <Section title="Área do ecrã">
        <div className="ce-actions"><button className={`dx-btn dx-btn-sm ${placingDisplay === display.id ? 'dx-btn-primary' : 'dx-btn-secondary'}`} onClick={() => set({ placingDisplay: placingDisplay === display.id ? null : display.id, displayCorner: null, pick: null, placing: false, ribbon: 'select' })}>{placingDisplay === display.id ? 'Cancelar marcação' : 'Marcar no modelo (2 cliques)'}</button></div>
        {placingDisplay === display.id && <p className="ce-hint" role="status">{displayCorner ? '2.º clique: canto oposto do ecrã.' : '1.º clique: um canto do ecrã, numa face do modelo.'}</p>}
        <Field label="Nome"><Text value={display.name} onChange={(name) => patch({ name }, 'name')} /></Field>
        <Vec3Input label="Centro" unit="mm" step={0.1} value={display.position} onChange={(position) => patch({ position }, 'pos')} />
        <Field label="Face"><Select value={axisKey(display.normal)} onChange={(key) => patch({ normal: AXES.find(([id]) => id === key)![2] })} options={AXES.map(([id, label]): [string, string] => [id, label])} /></Field>
        <Field label="Largura"><Num value={display.widthMm} min={0.5} step={0.1} unit="mm" onChange={(widthMm) => patch({ widthMm }, 'w')} /></Field>
        <Field label="Altura"><Num value={display.heightMm} min={0.5} step={0.1} unit="mm" onChange={(heightMm) => patch({ heightMm }, 'h')} /></Field>
        <Field label="Rotação"><Num value={display.roll} step={90} unit="°" onChange={(roll) => patch({ roll }, 'roll')} /></Field>
        <Field label="Resolução" hint="Píxeis por mm da textura (mais = mais nítido, mais memória)."><Num value={display.density} min={4} max={60} step={2} onChange={(density) => patch({ density }, 'density')} /></Field>
      </Section>
      <Section title="Aspeto">
        <Field label="Tipo"><Select value={display.kind} onChange={(kind) => patch({ kind })} options={[['text', 'Texto com variáveis'], ['lcd', 'LCD de multímetro (7 segmentos)']]} /></Field>
        <Field label="Fundo"><Color value={display.background} onChange={(background) => patch({ background }, 'bg')} /></Field>
        <Field label="Cor do texto"><Color value={display.foreground} onChange={(foreground) => patch({ foreground }, 'fg')} /></Field>
        {display.kind === 'text' && <>
          <Field label="Ligado quando" hint="Se escolher uma variável, o ecrã só mostra conteúdo quando ela for verdadeira."><Select value={display.powerVar ?? ''} onChange={(powerVar) => patch({ powerVar: powerVar || undefined })} options={varOptions} /></Field>
          <Field label="Retroiluminação"><Select value={display.backlightVar ?? ''} onChange={(backlightVar) => patch({ backlightVar: backlightVar || undefined })} options={varOptions} /></Field>
        </>}
        {!!display.hideNodes?.length && <Field label="Objetos escondidos" hint="Texto/dígitos pintados no modelo que este ecrã substitui."><span className="ce-inline"><code>{display.hideNodes.length}</code><button className="dx-btn dx-btn-secondary dx-btn-sm" onClick={() => patch({ hideNodes: [] })}>Mostrar de novo</button></span></Field>}
      </Section>
      {display.kind === 'text' && <Section title="Conteúdo" actions={<button className="dx-btn dx-btn-secondary dx-btn-sm" onClick={() => patch({ lines: [...display.lines, { id: newId('ln_'), text: 'Texto', x: 0.5, y: 0.5, size: 0.3, align: 'center' }] })}>+ Linha</button>}>
        <p className="ce-hint">Use <code>{'{state}'}</code> = nome do estado, <code>{'{id}'}</code> = valor de uma variável. Posição e tamanho em fração do ecrã (0–1).</p>
        {display.lines.map((line) => <div key={line.id} className="ce-action-card">
          <div className="ce-action-head"><Text value={line.text} onChange={(text) => patchLine(line.id, { text }, 'txt')} />
            <button className="ce-linkbtn" aria-label="Remover linha" onClick={() => patch({ lines: display.lines.filter((item) => item.id !== line.id) })}><IconClose size={12} /></button></div>
          <Field label="Posição X / Y"><span className="ce-inline"><Num value={line.x} min={0} max={1} step={0.05} onChange={(x) => patchLine(line.id, { x }, 'x')} /><Num value={line.y} min={0} max={1} step={0.05} onChange={(y) => patchLine(line.id, { y }, 'y')} /></span></Field>
          <Field label="Tamanho"><Num value={line.size} min={0.05} max={1} step={0.05} onChange={(size) => patchLine(line.id, { size }, 'size')} /></Field>
          <Field label="Alinhamento"><Select value={line.align} onChange={(align) => patchLine(line.id, { align }, 'al')} options={[['left', 'Esquerda'], ['center', 'Centro'], ['right', 'Direita']]} /></Field>
          <Field label="Cor"><Color value={line.color ?? display.foreground} onChange={(color) => patchLine(line.id, { color }, 'col')} /></Field>
          {whenFields(def, line.when, (when) => patchLine(line.id, { when }, 'when'))}
        </div>)}
      </Section>}
      <Section title="Ações"><Confirm label="Eliminar ecrã" className="dx-btn dx-btn-danger dx-btn-sm" onConfirm={() => { edit((state) => ({ ...state, displays: (state.displays ?? []).filter((item) => item.id !== display.id) })); set({ selection: null, placingDisplay: null, displayCorner: null }) }} /></Section>
    </>}
  </>
}
