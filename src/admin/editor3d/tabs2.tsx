import { useMemo, useRef, useState } from 'react'
import { newId, resolveState } from '../../catalog/definition'
import type { ActionDef, InteractionDef, LightZoneDef, StateDef, TerminalDef, TriggerName, Vec3 } from '../../catalog/types'
import type { ComponentCategory } from '../../types'
import { BASE_STATE, newTerminal, patchTerminal, useEditorStore } from './editorStore'
import { validateDefinition } from './validate'
import { FACE_NORMAL, SUGGESTED_PROFILES, defaultParams, inferFromFunction, type Face } from '../../catalog/terminalProfiles'
import { allProfiles, useProfileStore } from '../../catalog/profileStore'
import { applyProfile, defBounds, faceCenter, faceOfNormal } from './terminalOps'
import { addTerminalInHole, addTerminalsInAllHoles, clearHoles, scanHoles } from './holeOps'
import { Check, Color, Confirm, Empty, Field, Group, Num, PresetCard, Section, Select, Slider, Text, Vec3Input } from './ui'
import { IconCamera, IconEye, IconEyeOff, IconCheck, IconClose, IconCube, IconImage, IconLayers, IconPlus } from '../../ui/icons'
import FaceChooser from './FaceChooser'
import { NodePicker, whenFields } from './tabsControls'
import { currentSizeMm, setRealSize } from './sizeOps'
import { captureCover, type CaptureView } from './capture'

const NORMALS: Array<[string, string, Vec3]> = [
  ['z+', 'Frente (+Z)', [0, 0, 1]], ['z-', 'Trás (−Z)', [0, 0, -1]], ['x+', 'Direita (+X)', [1, 0, 0]], ['x-', 'Esquerda (−X)', [-1, 0, 0]], ['y+', 'Topo (+Y)', [0, 1, 0]], ['y-', 'Base (−Y)', [0, -1, 0]],
]
const normalKey = (normal: Vec3) => NORMALS.find(([, , value]) => value.every((component, index) => Math.sign(component) === Math.sign(normal[index]) && Math.abs(Math.abs(component) - Math.abs(normal[index])) < 0.5))?.[0] ?? 'z+'
const KINDS: Array<[TerminalDef['kind'], string]> = [['io', 'Entrada/saída'], ['power-in', 'Alimentação (entrada)'], ['power-out', 'Alimentação (saída)'], ['coil-plus', 'Bobina +'], ['coil-minus', 'Bobina −'], ['aux-no', 'Contacto NA'], ['aux-nc', 'Contacto NF'], ['neutral', 'Neutro'], ['earth', 'Terra (PE)'], ['analog', 'Analógico'], ['bus', 'Comunicação']]
const TYPES: Array<[TerminalDef['terminalType'], string]> = [['screw', 'Parafuso'], ['spring', 'Mola'], ['plug', 'Ficha'], ['faston', 'Faston'], ['fastonMale', 'Faston macho'], ['fastonFemale', 'Faston fêmea'], ['ring', 'Olhal'], ['fork', 'Forquilha'], ['pin', 'Pino'], ['conical', 'Cónico'], ['claw', 'Garra'], ['tubular', 'Tubular'], ['bar', 'Barra']]
const POLARITY: Array<[TerminalDef['polarity'], string]> = [['none', 'Sem polaridade'], ['positive', 'Positivo (+)'], ['negative', 'Negativo (−)'], ['ac', 'Fase CA'], ['neutral', 'Neutro'], ['earth', 'Terra']]

/** Procura furos no modelo e põe bornes dentro deles. */
function HoleFinder() {
  const holes = useEditorStore((s) => s.holes)
  const faceLock = useEditorStore((s) => s.faceLock)
  const [scope, setScope] = useState<Face | 'all'>(faceLock ?? 'front')
  const [range, setRange] = useState<[number, number]>([2, 16])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const run = () => {
    setBusy(true)
    setMessage('A analisar a superfície do modelo…')
    // deixa o ecrã pintar a mensagem antes da varredura (é síncrona e pesada)
    window.setTimeout(() => {
      const faces: Face[] = scope === 'all' ? ['front', 'back', 'left', 'right', 'top', 'bottom'] : [scope]
      const found = scanHoles(faces, { minDiameterMm: range[0], maxDiameterMm: range[1] })
      setBusy(false)
      setMessage(found.length
        ? `${found.length} furo(s) por ocupar. Clique em «+» para pôr um borne dentro do furo — no viewport ficam marcados a verde e o clique encaixa neles.`
        : 'Nenhum furo livre nesse intervalo de diâmetros. Alargue o intervalo ou escolha outra face.')
    }, 30)
  }

  return <Section title="Furos do modelo" open={holes.length > 0}>
    <p className="ce-hint">Varre a face com uma grelha de raios e encontra os furos (encaixes de bornes, fichas banana, buracos de parafuso), com centro, diâmetro e profundidade. Os furos já ocupados por um borne não são propostos.</p>
    <Field label="Onde procurar">
      <Select value={scope} onChange={(value) => setScope(value as Face | 'all')} options={[['front', 'Frente'], ['back', 'Trás'], ['left', 'Esquerda'], ['right', 'Direita'], ['top', 'Topo'], ['bottom', 'Base'], ['all', 'Todas as faces (mais lento)']]} />
    </Field>
    <Field label="Diâmetro aceite" hint="Ignora furos fora deste intervalo (ex.: textura, ranhuras de ventilação).">
      <span className="ce-inline">
        <Num value={range[0]} min={0.5} max={30} step={0.5} unit="mm" onChange={(value) => setRange([value, Math.max(value + 0.5, range[1])])} />
        <Num value={range[1]} min={1} max={40} step={0.5} unit="mm" onChange={(value) => setRange([Math.min(range[0], value - 0.5), value])} />
      </span>
    </Field>
    <div className="ce-actions">
      <button className="dx-btn dx-btn-primary dx-btn-sm" disabled={busy} onClick={run}>{busy ? 'A analisar…' : 'Procurar furos'}</button>
      {holes.length > 0 && <>
        <button className="dx-btn dx-btn-secondary dx-btn-sm" onClick={() => { const n = addTerminalsInAllHoles(); setMessage(`${n} borne(s) criado(s) dentro dos furos.`) }}>Borne em todos</button>
        <button className="dx-btn dx-btn-secondary dx-btn-sm" onClick={() => { clearHoles(); setMessage('') }}>Limpar marcas</button>
      </>}
    </div>
    {message && <p className="ce-hint" role="status">{message}</p>}
    {holes.length > 0 && <ul className="ce-list">
      {holes.map((hole) => <li key={hole.id}>
        <button type="button" className="ce-list-item" title={`Centro ${hole.position.map((value) => value.toFixed(1)).join(' / ')} mm`} onClick={() => addTerminalInHole(hole)}>
          <span><IconPlus size={11} /> Borne no furo Ø {hole.diameterMm.toFixed(1)} mm</span>
          <small>{hole.through ? 'passante' : `${hole.depthMm.toFixed(1)} mm de fundo`} · face {hole.face} · {hole.position.map((value) => value.toFixed(1)).join(' / ')} mm</small>
        </button>
      </li>)}
    </ul>}
  </Section>
}

export function TerminalsTab() {
  const def = useEditorStore((s) => s.def)
  const selection = useEditorStore((s) => s.selection)
  const placing = useEditorStore((s) => s.placing)
  const edit = useEditorStore((s) => s.edit)
  const set = useEditorStore((s) => s.set)
  const hiddenTerminals = useEditorStore((s) => s.hiddenTerminals)
  const toggleHidden = useEditorStore((s) => s.toggleTerminalHidden)
  const terminal = selection?.kind === 'terminal' ? def.terminals.find((item) => item.id === selection.id) : undefined
  const patch = (value: Partial<TerminalDef>, key: string) => terminal && edit((state) => patchTerminal(state, terminal.id, value), `term:${terminal.id}:${key}`)
  const meta = useEditorStore((s) => s.meta)
  const faceLock = useEditorStore((s) => s.faceLock)
  const libraryOpen = useEditorStore((s) => s.libraryOpen)
  const custom = useProfileStore((s) => s.custom)
  const glbRevision = useEditorStore((s) => s.glbRevision)
  const bounds = useMemo(() => defBounds(def), [def.parts, def.assets, glbRevision])
  const suggested = useMemo(() => { const ids = SUGGESTED_PROFILES[meta.category] ?? []; return allProfiles(custom).filter((profile) => ids.includes(profile.id)) }, [meta.category, custom])
  // mudar de face leva o borne para essa face do componente
  const moveToFace = (face: Face) => {
    if (!terminal) return
    const normal = FACE_NORMAL[face]
    const axis = normal[0] ? 0 : normal[1] ? 1 : 2
    const position = [...terminal.position] as Vec3
    position[axis] = normal[axis] > 0 ? bounds.max[axis] : bounds.min[axis]
    patch({ normal, position }, 'normal')
  }
  const duplicates = terminal ? def.terminals.filter((item) => item.label === terminal.label).length > 1 : false

  return <>
    <FaceChooser />
    <Section title="Ligação ao componente">
      <Check checked={!!def.terminalsFollowModel} label="Bloquear todos os bornes ao modelo" onChange={(terminalsFollowModel) => edit((state) => ({ ...state, terminalsFollowModel }), 'terminals:follow-model')} />
      <p className="ce-hint">Quando ativo, mover, rodar ou redimensionar a peça selecionada leva todos os bornes consigo, mantendo a posição relativa.</p>
    </Section>
    <Section title="Criar bornes">
      <Group tone="manual" title="Colocar à mão"
        hint={placing ? 'Clique numa face do modelo: o borne fica na superfície e a saída do cabo segue a normal dessa face.' : 'Você decide onde fica cada borne: escolha a face no cubo acima e clique no modelo.'}>
        <div className="ce-preset-grid">
          <PresetCard title={placing ? 'A colocar… (Esc)' : 'Clicar na superfície'} description="Cada clique no modelo cria um borne no ponto exato, com a saída do cabo pela normal da face." active={placing} onClick={() => set({ placing: !placing, placingSpec: null })} />
          <PresetCard title={`Ao centro${faceLock ? ' da face' : ''}`} description="Cria um borne no centro da face escolhida, para depois acertar a posição nos campos em mm." onClick={() => { const created = newTerminal(def, faceCenter(bounds, faceLock ?? 'front'), FACE_NORMAL[faceLock ?? 'front']); edit((state) => ({ ...state, terminals: [...state.terminals, created] })); set({ selection: { kind: 'terminal', id: created.id } }) }} />
        </div>
      </Group>
      <Group tone="auto" title="O editor sugere"
        actions={<button className={`dx-btn dx-btn-sm ce-btn-icon ${libraryOpen ? 'dx-btn-primary' : 'dx-btn-secondary'}`} onClick={() => set({ libraryOpen: !libraryOpen })}><IconLayers size={12} />Biblioteca</button>}
        hint={<>Perfis para «{meta.category}»: criam de uma vez os bornes nas faces certas. Depois pode editar, mover, duplicar ou apagar qualquer um.</>}>
        {suggested.length > 0 ? <div className="ce-preset-grid">
          {suggested.map((profile) => <PresetCard key={profile.id} title={profile.name} description={profile.description || 'Perfil da biblioteca de bornes.'} onClick={() => applyProfile(profile, defaultParams(profile), false)} />)}
        </div> : <p className="ce-hint">Sem perfis para esta categoria — abra a biblioteca para ver todos.</p>}
        <button className="dx-btn dx-btn-sm ce-linkbtn" onClick={() => set({ libraryOpen: true })}>Mais perfis…</button>
      </Group>
    </Section>
    <HoleFinder />
    {!terminal && <Empty>Selecione um borne na lista à esquerda ou no viewport.</Empty>}
    {terminal && <>
      <Section title="Identificação">
        <Field label="Rótulo" hint={duplicates ? 'Rótulo repetido: tem de ser único.' : 'Texto impresso: A1, 13, L1…'}><Text value={terminal.label} onChange={(label) => patch({ label }, 'label')} /></Field>
        <Field label="Nome"><Text value={terminal.name} onChange={(name) => patch({ name }, 'name')} /></Field>
        <Field label="Cor"><Color value={terminal.color} onChange={(color) => patch({ color }, 'color')} /></Field>
        <Field label="No viewport" hint="Só esconde o marcador durante a edição; o borne continua no componente."><button type="button" className="dx-btn dx-btn-secondary dx-btn-sm ce-btn-icon" onClick={() => toggleHidden(terminal.id)}>{hiddenTerminals.includes(terminal.id) ? <><IconEyeOff size={12} />Mostrar borne</> : <><IconEye size={12} />Ocultar borne</>}</button></Field>
      </Section>
      <Section title="Posição e saída">
        <Vec3Input label="Posição" unit="mm" step={0.5} value={terminal.position} onChange={(position) => patch({ position }, 'pos')} />
        <Field label="Face"><Select value={faceOfNormal(terminal.normal)} onChange={moveToFace} options={[['front', 'Frente'], ['back', 'Trás'], ['left', 'Esquerda'], ['right', 'Direita'], ['top', 'Topo'], ['bottom', 'Base']]} /></Field>
        <Field label="Diâmetro do encaixe" hint="Usado no marcador e para a ponteira preencher o furo sem engrossar o cabo."><span className="ce-inline"><Num value={terminal.diameterMm ?? 6} min={2} max={26} step={0.5} unit="mm" onChange={(diameterMm) => patch({ diameterMm }, 'diameter')} /><button className="dx-btn dx-btn-secondary dx-btn-sm" onClick={() => edit((state) => ({ ...state, terminals: state.terminals.map((item) => ({ ...item, diameterMm: terminal.diameterMm ?? 6 })) }), 'terminal:diameter-all')}>Todos</button></span></Field>
        <Field label="Normal (avançado)"><Select value={normalKey(terminal.normal)} onChange={(key) => patch({ normal: NORMALS.find(([id]) => id === key)![2] }, 'normal')} options={NORMALS.map(([id, label]): [string, string] => [id, label])} /></Field>
        <p className="ce-hint">A face leva o borne para esse lado do componente. A normal decide a direção em que o cabo sai.</p>
      </Section>
      <Section title="Elétrico">
        <Field label="Função (L1, A1…)" hint="Só informativo; use «Sugerir» para preencher tipo, polaridade e cor."><span className="ce-inline"><Text value={terminal.fn ?? ''} onChange={(fn) => patch({ fn }, 'fn')} />
          <button className="dx-btn dx-btn-secondary dx-btn-sm" onClick={() => { const inferred = inferFromFunction(terminal.fn || terminal.label); patch({ kind: inferred.kind, polarity: inferred.polarity, electricalClass: inferred.electricalClass, contact: inferred.contact, color: inferred.color ?? terminal.color, ...(inferred.direction ? { direction: inferred.direction } : {}) }, 'infer') }}>Sugerir</button></span></Field>
        <Field label="Tipo de borne"><Select value={terminal.kind} onChange={(kind) => patch({ kind }, 'kind')} options={KINDS} /></Field>
        <Field label="Contacto"><Select value={terminal.contact ?? ''} onChange={(contact) => patch({ contact: contact === '' ? undefined : (contact as 'NO' | 'NC' | 'COM') }, 'contact')} options={[['', '—'], ['NO', 'NA (normalmente aberto)'], ['NC', 'NF (normalmente fechado)'], ['COM', 'Comum']]} /></Field>
        <Field label="Grupo"><Text value={terminal.group ?? ''} onChange={(group) => patch({ group: group || undefined }, 'group')} placeholder="Potência, Bobina, Aux…" /></Field>
        <Field label="Tipo de ligação"><Select value={terminal.terminalType} onChange={(terminalType) => patch({ terminalType }, 'type')} options={TYPES} /></Field>
        <Field label="Polaridade"><Select value={terminal.polarity} onChange={(polarity) => patch({ polarity }, 'pol')} options={POLARITY} /></Field>
        <Field label="Classe"><Select value={terminal.electricalClass} onChange={(electricalClass) => patch({ electricalClass }, 'class')} options={[['dc', 'CC'], ['ac', 'CA'], ['network', 'Rede'], ['other', 'Outro']]} /></Field>
        <Field label="Sentido"><Select value={terminal.direction} onChange={(direction) => patch({ direction }, 'dir')} options={[['io', 'Entrada/saída'], ['in', 'Entrada'], ['out', 'Saída']]} /></Field>
        <Field label="Aceita" hint="Etiquetas de compatibilidade (ex.: fio-1.5, ponteira). Vazio = tudo."><Text value={terminal.accepts} onChange={(accepts) => patch({ accepts }, 'acc')} /></Field>
      </Section>
      <Section title="Ações">
        <div className="ce-actions">
          <button className="dx-btn dx-btn-secondary dx-btn-sm" onClick={() => { const copy = { ...terminal, id: newId('t_'), label: `${terminal.label}b`, name: `${terminal.name} (cópia)`, position: [terminal.position[0] + 4, terminal.position[1], terminal.position[2]] as Vec3 }; edit((state) => ({ ...state, terminals: [...state.terminals, copy] })); set({ selection: { kind: 'terminal', id: copy.id } }) }}>Duplicar</button>
          <Confirm label="Eliminar" className="dx-btn dx-btn-danger dx-btn-sm" onConfirm={() => { edit((state) => ({ ...state, terminals: state.terminals.filter((item) => item.id !== terminal.id) })); set({ selection: null }) }} />
        </div>
        <p className="ce-hint">Ao publicar uma nova versão, o borne mantém o mesmo identificador interno: os cabos já ligados nos projetos continuam ligados.</p>
      </Section>
    </>}
  </>
}

const USER_COLOR_PALETTE = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#a855f7', '#ffffff', '#111827']

export function LightsTab() {
  const def = useEditorStore((s) => s.def)
  const mode = useEditorStore((s) => s.mode)
  const previewVars = useEditorStore((s) => s.previewVars)
  const selection = useEditorStore((s) => s.selection)
  const edit = useEditorStore((s) => s.edit)
  const set = useEditorStore((s) => s.set)
  const part = selection?.kind === 'part' ? def.parts.find((item) => item.id === selection.id) : undefined
  const light = selection?.kind === 'light' ? def.lights.find((item) => item.id === selection.id) : undefined
  const patch = (value: Partial<LightZoneDef>, key: string) => light && edit((state) => ({ ...state, lights: state.lights.map((item) => (item.id === light.id ? { ...item, ...value } : item)) }), `light:${light.id}:${key}`)
  const candidates = def.parts.filter((item) => item.kind !== 'group')
  const placingLed = useEditorStore((s) => s.placingLed)
  const create = () => {
    const target = part && part.kind !== 'group' ? part : candidates[0]
    if (!target) return
    const created: LightZoneDef = { id: newId('l_'), name: `Luz ${def.lights.length + 1}`, partId: target.id, color: '#22c55e', intensity: 2.2 }
    edit((state) => ({ ...state, lights: [...state.lights, created] }))
    set({ selection: { kind: 'light', id: created.id } })
  }
  const createStatus = (name: string, variable: string, color: string, blink = false) => {
    const target = part && part.kind !== 'group' ? part : candidates[0]
    if (!target) return
    const created: LightZoneDef = { id: newId('l_'), name, partId: target.id, color, intensity: 2.2, kind: 'led', when: { var: variable, op: 'eq', value: true }, blink }
    edit((state) => ({ ...state, lights: [...state.lights, created] }), `light:status:${variable}`)
    set({ selection: { kind: 'light', id: created.id }, pick: { kind: 'light', id: created.id } })
  }
  return <>
    <Section title="LEDs e luzes" actions={<span className="ce-actions-inline">
      <button className={`dx-btn dx-btn-sm ${placingLed ? 'dx-btn-primary' : 'dx-btn-secondary'}`} onClick={() => set({ placingLed: !placingLed, placingDisplay: null, displayCorner: null, pick: null, placing: false, ribbon: 'select' })}>{placingLed ? 'Cancelar' : '+ LED na superfície'}</button>
      <button className="dx-btn dx-btn-secondary dx-btn-sm" onClick={create} disabled={!candidates.length}>+ Zona de luz</button></span>}>
      <p className="ce-hint">{placingLed ? 'Clique numa face do modelo: o LED fica nesse ponto.' : 'Um LED é uma peça pequena que emite luz; uma zona de luz faz uma peça (ou objetos de um GLB) brilhar. Acendem pelos separadores Estados ou por variáveis da simulação.'}</p>
      <div className="ce-actions-inline" aria-label="Indicadores automáticos">
        <button className="dx-btn dx-btn-secondary dx-btn-sm" disabled={!candidates.length} onClick={() => createStatus('RUN / funcionamento', '$run', '#22c55e')}>+ RUN</button>
        <button className="dx-btn dx-btn-secondary dx-btn-sm" disabled={!candidates.length} onClick={() => createStatus('STOP / parado', '$stop', '#f59e0b')}>+ STOP</button>
        <button className="dx-btn dx-btn-secondary dx-btn-sm" disabled={!candidates.length} onClick={() => createStatus('ERROR / falha', '$error', '#ef4444')}>+ ERROR</button>
        <button className="dx-btn dx-btn-secondary dx-btn-sm" disabled={!candidates.length} onClick={() => createStatus('COM / comunicação', '$communication', '#38bdf8', true)}>+ COM</button>
        <button className="dx-btn dx-btn-secondary dx-btn-sm" disabled={!candidates.length} onClick={() => createStatus('TRIP / disparado', '$tripped', '#ef4444')}>+ TRIP</button>
      </div>
      <p className="ce-hint">O indicador é criado com a lógica pronta. Em seguida, clique nos objetos do GLB que correspondem à lente/LED. O utilizador apenas visualiza o resultado da simulação.</p>
    </Section>
    {!light && <Empty>Selecione uma zona luminosa na lista à esquerda{part ? ' ou crie uma para a peça atual' : ''}.</Empty>}
    {light && <Section title="Zona luminosa">
      <Field label="Nome"><Text value={light.name} onChange={(name) => patch({ name }, 'name')} /></Field>
      <Field label="Peça"><Select value={light.partId} onChange={(partId) => patch({ partId }, 'part')} options={candidates.map((item): [string, string] => [item.id, item.name])} /></Field>
      <Field label="Tipo"><Select value={light.kind ?? 'lamp'} onChange={(kind) => patch({ kind }, 'kind')} options={[['led', 'LED'], ['lamp', 'Lâmpada / sinaleiro']]} /></Field>
      <NodePicker partId={light.partId} nodes={light.nodes} pickKind="light" id={light.id} onChange={(nodes) => patch({ nodes: nodes.length ? nodes : undefined }, 'nodes')} />
      <Field label="Cor"><Color value={light.color} onChange={(color) => patch({ color }, 'color')} /></Field>
      <Check checked={!!light.userPalette?.length} label="Utilizador pode escolher a cor desta zona" onChange={(enabled) => patch({ userPalette: enabled ? (light.userPalette?.length ? light.userPalette : USER_COLOR_PALETTE.slice(0, 7)) : undefined, tintMaterial: enabled || light.tintMaterial }, 'userPalette')} />
      {!!light.userPalette?.length && <Field label="Paleta do utilizador" hint="Clique para permitir ou remover uma cor."><span className="ce-actions-inline">{USER_COLOR_PALETTE.map((color) => {
        const active = light.userPalette!.includes(color)
        return <button key={color} type="button" aria-pressed={active} title={active ? 'Remover cor' : 'Permitir cor'} onClick={() => patch({ userPalette: active ? light.userPalette!.filter((item) => item !== color) : [...light.userPalette!, color] }, 'palette')} style={{ width: 24, height: 24, borderRadius: 999, background: color, border: active ? '3px solid #2563eb' : '1px solid #94a3b8' }} />
      })}</span></Field>}
      {!!light.userPalette?.length && <Check checked={light.tintMaterial !== false} label="Pintar botão/lente e a luz emitida" onChange={(tintMaterial) => patch({ tintMaterial }, 'tint')} />}
      <Field label="Intensidade"><Slider value={light.intensity} max={6} step={0.1} onChange={(intensity) => patch({ intensity }, 'int')} /></Field>
      {whenFields(def, light.when, (when) => patch({ when }, 'when'))}
      <Check checked={!!light.blink} label="Pisca quando acende por variável" onChange={(blink) => patch({ blink }, 'blink')} />
      {mode === 'simulate' && light.when?.var && <div className="ce-actions"><button className="dx-btn dx-btn-primary dx-btn-sm" onClick={() => set({ previewVars: { ...previewVars, [light.when!.var]: !previewVars[light.when!.var] } })}>{previewVars[light.when.var] ? 'Apagar no teste' : 'Acender no teste'}</button></div>}
      {mode === 'simulate' && !light.when?.var && <p className="ce-hint">Esta luz não tem condição: permanece acesa na simulação.</p>}
      <Confirm label="Eliminar zona" className="dx-btn dx-btn-danger dx-btn-sm" onConfirm={() => { edit((state) => ({ ...state, lights: state.lights.filter((item) => item.id !== light.id), states: state.states.map((s) => ({ ...s, lights: Object.fromEntries(Object.entries(s.lights).filter(([id]) => id !== light.id)) })) })); set({ selection: null }) }} />
    </Section>}
  </>
}

const EASINGS: Array<[StateDef['easing'], string]> = [['linear', 'Linear'], ['easeIn', 'Acelera'], ['easeOut', 'Desacelera'], ['easeInOut', 'Suave']]

export function StatesTab() {
  const def = useEditorStore((s) => s.def)
  const editState = useEditorStore((s) => s.editState)
  const edit = useEditorStore((s) => s.edit)
  const set = useEditorStore((s) => s.set)
  const mode = useEditorStore((s) => s.mode)
  const previewState = useEditorStore((s) => s.previewState)
  const current = def.states.find((item) => item.id === editState)
  const patch = (value: Partial<StateDef>, key: string) => current && edit((state) => ({ ...state, states: state.states.map((item) => (item.id === current.id ? { ...item, ...value } : item)) }), `state:${current.id}:${key}`)
  const addState = (copyFrom?: StateDef) => {
    const created: StateDef = { id: newId('s_'), name: copyFrom ? `${copyFrom.name} (cópia)` : `Estado ${def.states.length + 1}`, parts: copyFrom ? structuredClone(copyFrom.parts) : {}, lights: copyFrom ? structuredClone(copyFrom.lights) : {}, durationMs: copyFrom?.durationMs ?? 250, easing: copyFrom?.easing ?? 'easeInOut' }
    edit((state) => ({ ...state, states: [...state.states, created] }))
    set({ editState: created.id, mode: 'edit' })
  }
  return <>
    <Section title="Estados" actions={<button className="dx-btn dx-btn-secondary dx-btn-sm" onClick={() => addState()}>+ Novo</button>}>
      <div className="ce-list">
        <button className={`ce-list-item${editState === BASE_STATE ? ' is-on' : ''}`} onClick={() => set({ editState: BASE_STATE, mode: 'edit' })}><b>Pose base</b><small>Geometria de referência</small></button>
        {def.states.map((state) => <button key={state.id} className={`ce-list-item${editState === state.id ? ' is-on' : ''}`} onClick={() => set({ editState: state.id, mode: 'edit' })}>
          <b>{state.name}</b><small>{state.id === def.initialState ? 'Estado inicial · ' : ''}{Object.keys(state.parts).length} peça(s) · {state.durationMs} ms</small>
        </button>)}
      </div>
      <p className="ce-hint">Escolha um estado para o <b>editar</b>: mova/rode peças e as alterações guardam-se como diferença da pose base. Na simulação, os estados animam entre si.</p>
    </Section>
    {current && <>
      <Section title="Animação">
        <Field label="Nome"><Text value={current.name} onChange={(name) => patch({ name }, 'name')} /></Field>
        <Field label="Duração"><Num value={current.durationMs} min={0} max={5000} step={50} unit="ms" onChange={(durationMs) => patch({ durationMs }, 'dur')} /></Field>
        <Field label="Curva"><Select value={current.easing} onChange={(easing) => patch({ easing }, 'ease')} options={EASINGS} /></Field>
        <Check checked={def.initialState === current.id} label="Estado inicial" onChange={(on) => on && edit((state) => ({ ...state, initialState: current.id }))} />
      </Section>
      <Section title="Luzes neste estado">
        {def.lights.length === 0 && <Empty>Sem zonas luminosas. Crie-as no separador Luzes.</Empty>}
        {def.lights.map((light) => {
          const value = current.lights[light.id] ?? { on: false }
          const setLight = (next: Partial<typeof value>) => patch({ lights: { ...current.lights, [light.id]: { ...value, ...next } } }, `l:${light.id}`)
          return <div key={light.id} className="ce-lightrow">
            <Check checked={value.on} label={light.name} onChange={(on) => setLight({ on })} />
            <Check checked={!!value.blink} label="Pisca" onChange={(blink) => setLight({ blink })} />
          </div>
        })}
      </Section>
      <Section title="Ações">
        <div className="ce-actions">
          <button className="dx-btn dx-btn-secondary dx-btn-sm" onClick={() => addState(current)}>Duplicar</button>
          <button className="dx-btn dx-btn-secondary dx-btn-sm" onClick={() => set({ mode: 'simulate', previewState: current.id })}>Pré-visualizar</button>
          <Confirm label="Eliminar" className="dx-btn dx-btn-danger dx-btn-sm" onConfirm={() => {
            if (def.states.length <= 1) return window.alert('Tem de existir pelo menos um estado.')
            const remaining = def.states.filter((item) => item.id !== current.id)
            const fallback = remaining[0].id
            const fix = (id: string) => (id === current.id ? fallback : id)
            edit((state) => ({
              ...state, states: remaining, initialState: fix(state.initialState),
              interactions: state.interactions.map((item) => ({ ...item, actions: item.actions.map((action): ActionDef => action.type === 'toggleState' ? { ...action, a: fix(action.a), b: fix(action.b) } : action.type === 'cycleStates' ? { ...action, states: action.states.map(fix) } : { ...action, state: fix(action.state) }) })),
            }))
            set({ editState: BASE_STATE, previewState: fallback })
          }} />
        </div>
      </Section>
    </>}
    {mode === 'simulate' && <p className="ce-hint">Em simulação (estado atual: {resolveState(def, previewState).name}).</p>}
  </>
}

const TRIGGERS: Array<[TriggerName, string]> = [['click', 'Clique'], ['doubleClick', 'Duplo clique'], ['pressDown', 'Premir'], ['pressUp', 'Largar']]
const ACTIONS: Array<[ActionDef['type'], string]> = [['setState', 'Ir para estado'], ['toggleState', 'Alternar entre dois estados'], ['cycleStates', 'Percorrer estados'], ['delayedState', 'Ir para estado após atraso']]

export function InteractionsTab() {
  const def = useEditorStore((s) => s.def)
  const edit = useEditorStore((s) => s.edit)
  const selection = useEditorStore((s) => s.selection)
  const stateOptions = def.states.map((state): [string, string] => [state.id, state.name])
  const first = def.states[0]?.id ?? ''
  const part = selection?.kind === 'part' ? selection.id : ''
  const patch = (id: string, value: Partial<InteractionDef>, key = '') => edit((state) => ({ ...state, interactions: state.interactions.map((item) => (item.id === id ? { ...item, ...value } : item)) }), key ? `int:${id}:${key}` : '')
  const makeAction = (type: ActionDef['type']): ActionDef => type === 'setState' ? { type, state: first } : type === 'toggleState' ? { type, a: first, b: def.states[1]?.id ?? first } : type === 'cycleStates' ? { type, states: def.states.map((state) => state.id) } : { type: 'delayedState', state: first, afterMs: 1000 }
  return <>
    <Section title="Interações" actions={<button className="dx-btn dx-btn-secondary dx-btn-sm" onClick={() => edit((state) => ({ ...state, interactions: [...state.interactions, { id: newId('i_'), name: `Interação ${state.interactions.length + 1}`, partId: part, trigger: 'click', actions: [{ type: 'toggleState', a: first, b: state.states[1]?.id ?? first }] }] }))}>+ Nova</button>}>
      <p className="ce-hint">Ligam um gesto no modelo (ex.: clicar no manípulo) a uma mudança de estado. Funcionam na simulação do editor e no painel 3D do simulador.</p>
    </Section>
    {def.interactions.length === 0 && <Empty>Sem interações. Crie uma, p. ex. «clicar no manípulo» para «alternar OFF/ON».</Empty>}
    {def.interactions.map((item) => <Section key={item.id} title={item.name} actions={<Confirm label={<IconClose size={12} />} title="Eliminar interação" className="ce-linkbtn" onConfirm={() => edit((state) => ({ ...state, interactions: state.interactions.filter((other) => other.id !== item.id) }))} />}>
      <Field label="Nome"><Text value={item.name} onChange={(name) => patch(item.id, { name }, 'name')} /></Field>
      <Field label="Peça"><Select value={item.partId} onChange={(partId) => patch(item.id, { partId })} options={[['', '— qualquer parte —'], ...def.parts.filter((p) => p.kind !== 'group').map((p): [string, string] => [p.id, p.name])]} /></Field>
      <Field label="Gatilho"><Select value={item.trigger} onChange={(trigger) => patch(item.id, { trigger })} options={TRIGGERS} /></Field>
      {item.actions.map((action, index) => {
        const setAction = (next: ActionDef) => patch(item.id, { actions: item.actions.map((entry, i) => (i === index ? next : entry)) })
        return <div key={index} className="ce-action-card">
          <div className="ce-action-head"><Select value={action.type} onChange={(type) => setAction(makeAction(type))} options={ACTIONS} />
            <button className="ce-linkbtn" title="Remover ação" aria-label="Remover ação" onClick={() => patch(item.id, { actions: item.actions.filter((_, i) => i !== index) })}><IconClose size={12} /></button></div>
          {action.type === 'setState' && <Field label="Estado"><Select value={action.state} onChange={(state) => setAction({ ...action, state })} options={stateOptions} /></Field>}
          {action.type === 'toggleState' && <>
            <Field label="Estado A"><Select value={action.a} onChange={(a) => setAction({ ...action, a })} options={stateOptions} /></Field>
            <Field label="Estado B"><Select value={action.b} onChange={(b) => setAction({ ...action, b })} options={stateOptions} /></Field>
          </>}
          {action.type === 'cycleStates' && <div className="ce-checks">{def.states.map((state) => <Check key={state.id} label={state.name} checked={action.states.includes(state.id)}
            onChange={(on) => setAction({ ...action, states: def.states.map((s) => s.id).filter((id) => (id === state.id ? on : action.states.includes(id))) })} />)}</div>}
          {action.type === 'delayedState' && <>
            <Field label="Estado"><Select value={action.state} onChange={(state) => setAction({ ...action, state })} options={stateOptions} /></Field>
            <Field label="Atraso"><Num value={action.afterMs} min={0} step={100} unit="ms" onChange={(afterMs) => setAction({ ...action, afterMs })} /></Field>
          </>}
        </div>
      })}
      <button className="dx-btn dx-btn-secondary dx-btn-sm" onClick={() => patch(item.id, { actions: [...item.actions, makeAction('setState')] })}>+ Ação</button>
    </Section>)}
  </>
}

const CATEGORIES: Array<[ComponentCategory, string]> = [['protection', 'Proteção'], ['command', 'Comando'], ['sensor', 'Sensor'], ['contactor', 'Contactor'], ['relay', 'Relé'], ['signaling', 'Sinalização'], ['motor', 'Motor'], ['drive', 'Variador'], ['controller', 'Controlador / PLC'], ['terminal', 'Terminal / borneira'], ['power', 'Fonte / potência']]

function DatasheetSection() {
  const meta = useEditorStore((s) => s.meta)
  const def = useEditorStore((s) => s.def)
  const editMeta = useEditorStore((s) => s.editMeta)
  const edit = useEditorStore((s) => s.edit)
  const [error, setError] = useState('')
  const sheet = meta.datasheet ?? { status: 'none' as const }
  const asset = def.assets.datasheet
  function attach(file: File | null) {
    setError('')
    if (!file) return
    if (!/\.pdf$/i.test(file.name) && !/pdf$/i.test(file.type)) { setError('Escolha um ficheiro PDF.'); return }
    if (file.size > 4 * 1024 * 1024) { setError('O PDF excede 4 MB. Use antes um link.'); return }
    const reader = new FileReader()
    reader.onload = () => {
      const data = String(reader.result)
      edit((state) => ({ ...state, assets: { ...state.assets, datasheet: { name: file.name, mime: 'application/pdf', data } } }))
      editMeta({ datasheet: { ...sheet, status: 'have', fileName: file.name } }, 'datasheet')
    }
    reader.readAsDataURL(file)
  }
  function removeFile() {
    edit((state) => { const assets = { ...state.assets }; delete assets.datasheet; return { ...state, assets } })
    editMeta({ datasheet: { ...sheet, fileName: undefined, status: sheet.url ? 'have' : 'none' } }, 'datasheet')
  }
  return <Section title={<span className="ce-title-icon">Datasheet{sheet.status === 'have' && <IconCheck size={12} />}</span>} open={sheet.status !== 'have'}>
    <div className="ce-datasheet">
      <Field label="Estado"><Select value={sheet.status} onChange={(status) => editMeta({ datasheet: { ...sheet, status } }, 'datasheet')} options={[['have', 'Tem datasheet'], ['none', 'Sem datasheet']]} /></Field>
      {sheet.status === 'have' && <>
        <Field label="Link"><Text value={sheet.url ?? ''} placeholder="https://…" onChange={(url) => editMeta({ datasheet: { ...sheet, url: url.trim() || undefined } }, 'datasheet')} /></Field>
        <div className="ce-datasheet-actions">
          {asset ? <><span className="ce-static">{asset.name}</span>
            <a className="dx-btn dx-btn-secondary dx-btn-sm" href={asset.data} target="_blank" rel="noreferrer" download={asset.name}>Abrir PDF</a>
            <Confirm label="Remover PDF" onConfirm={removeFile} /></>
            : <label className="dx-btn dx-btn-secondary dx-btn-sm">Anexar PDF<input type="file" accept="application/pdf,.pdf" hidden onChange={(event) => { attach(event.target.files?.[0] ?? null); event.target.value = '' }} /></label>}
          {sheet.url && /^https?:\/\//i.test(sheet.url) && <a className="dx-btn dx-btn-secondary dx-btn-sm" href={sheet.url} target="_blank" rel="noreferrer">Abrir link</a>}
        </div>
        {error && <small className="ce-new-error">{error}</small>}
        <small className="ce-static">O PDF fica guardado no rascunho do administrador; não segue nas versões publicadas.</small>
      </>}
    </div>
  </Section>
}


function fileToCover(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      const canvas = document.createElement('canvas'); canvas.width = 480; canvas.height = 360
      const ctx = canvas.getContext('2d')
      if (!ctx) { URL.revokeObjectURL(url); reject(new Error('canvas')); return }
      ctx.fillStyle = '#eaf0f8'; ctx.fillRect(0, 0, 480, 360)
      const k = Math.min(480 / image.width, 360 / image.height)
      const w = image.width * k, h = image.height * k
      ctx.drawImage(image, (480 - w) / 2, (360 - h) / 2, w, h)
      URL.revokeObjectURL(url)
      resolve(canvas.toDataURL('image/jpeg', 0.85))
    }
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('imagem inválida')) }
    image.src = url
  })
}

/** Capa do componente: gerada do modelo ao guardar (isométrica), ou escolhida à mão. */
function CoverSection() {
  const meta = useEditorStore((s) => s.meta)
  const editMeta = useEditorStore((s) => s.editMeta)
  const fileRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState('')
  const capture = (view: CaptureView, locked: boolean) => {
    const url = captureCover(view)
    if (!url) { setError('Não foi possível capturar o modelo (está vazio ou o motor 3D ainda não carregou).'); return }
    setError('')
    editMeta({ thumbnail: url, coverLocked: locked }, 'cover')
  }
  const upload = async (file: File | undefined) => {
    if (!file) return
    if (!file.type.startsWith('image/') || file.size > 5 * 1024 * 1024) { setError('Escolha uma imagem (PNG ou JPG) até 5 MB.'); return }
    try { editMeta({ thumbnail: await fileToCover(file), coverLocked: true }, 'cover'); setError('') } catch { setError('Não foi possível ler a imagem.') }
  }
  return <Section title="Capa">
    <div className="ce-cover">
      {meta.thumbnail ? <img className="ce-cover-img" src={meta.thumbnail} alt={`Capa de ${meta.name}`} /> : <div className="ce-cover-empty"><IconImage size={26} /><span>Sem capa. É criada automaticamente ao guardar.</span></div>}
    </div>
    <div className="ce-actions">
      <button className="dx-btn dx-btn-secondary dx-btn-sm ce-btn-icon" onClick={() => capture('iso', false)} title="Recaptura a vista isométrica e volta à capa automática"><IconCube size={12} />Automática</button>
      <button className="dx-btn dx-btn-secondary dx-btn-sm ce-btn-icon" onClick={() => capture('current', true)} title="Usa o enquadramento que está a ver no viewport"><IconCamera size={12} />Vista atual</button>
      <button className="dx-btn dx-btn-secondary dx-btn-sm ce-btn-icon" onClick={() => fileRef.current?.click()}><IconImage size={12} />Carregar…</button>
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={(event) => { void upload(event.target.files?.[0]); event.target.value = '' }} />
    </div>
    <Check checked={!!meta.coverLocked} onChange={(coverLocked) => editMeta({ coverLocked }, 'cover')} label="Manter esta capa (não atualizar ao guardar)" />
    {error && <p className="ce-error" role="alert">{error}</p>}
  </Section>
}

/** Tamanho real do equipamento (mm): escala o componente inteiro — modelo, bornes, ecrãs e animações — mantendo as proporções. */
function RealSizeSection() {
  useEditorStore((s) => s.def)
  useEditorStore((s) => s.glbRevision)
  const size = currentSizeMm()
  const axes: Array<[0 | 1 | 2, string, number]> = [[0, 'Largura (X)', size.x], [1, 'Altura (Y)', size.y], [2, 'Profundidade (Z)', size.z]]
  return <Section title="Tamanho real (mm)">
    <p className="ce-hint">Escala o componente inteiro (modelo, bornes, ecrãs e animações) mantendo as proporções. Use as medidas do equipamento real para que fique à escala dos restantes componentes no simulador. Depois de alterar, publique uma nova versão.</p>
    {axes.map(([axis, label, value]) => <Field key={axis} label={label}><Num value={Math.round(value * 10) / 10} min={1} step={1} unit="mm" onChange={(mm) => setRealSize(axis, mm)} /></Field>)}
  </Section>
}

export function ComponentTab() {
  const meta = useEditorStore((s) => s.meta)
  const def = useEditorStore((s) => s.def)
  const entry = useEditorStore((s) => s.entry)
  const editMeta = useEditorStore((s) => s.editMeta)
  const edit = useEditorStore((s) => s.edit)
  const issues = validateDefinition(def, meta)
  const versions = [...(entry?.versions ?? [])].reverse()
  return <>
    <Section title="Identificação">
      <Field label="Nome"><Text value={meta.name} onChange={(name) => editMeta({ name }, 'name')} /></Field>
      <Field label="Descrição" wide><Text multiline value={meta.description} onChange={(description) => editMeta({ description }, 'desc')} /></Field>
      <Field label="Fabricante"><Text value={meta.manufacturer} onChange={(manufacturer) => editMeta({ manufacturer }, 'man')} /></Field>
      <Field label="Referência"><Text value={meta.reference} onChange={(reference) => editMeta({ reference }, 'ref')} /></Field>
      <Field label="Código interno"><Text value={meta.internalCode} onChange={(internalCode) => editMeta({ internalCode }, 'code')} /></Field>
    </Section>
    <Section title="Biblioteca">
      <Field label="Categoria"><Select value={meta.category} onChange={(category) => editMeta({ category })} options={CATEGORIES} /></Field>
      <Field label="Grupo"><Text value={meta.group} onChange={(group) => editMeta({ group }, 'group')} placeholder="Ex.: Proteção" /></Field>
      <Field label="Prefixo TAG" hint="Letras usadas na referência (QF, KM, S…)"><Text value={meta.tag} onChange={(tag) => editMeta({ tag: tag.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4) }, 'tag')} /></Field>
      <Field label="Etiquetas"><Text value={meta.tags.join(', ')} onChange={(value) => editMeta({ tags: value.split(',').map((t) => t.trim()).filter(Boolean) }, 'tags')} placeholder="separadas por vírgula" /></Field>
      <Field label="Montagem"><Select value={def.mount} onChange={(mount) => edit((state) => ({ ...state, mount }))} options={[['din-rail', 'Calha DIN'], ['panel-front', 'Frente do painel'], ['machine', 'Máquina / campo']]} /></Field>
    </Section>
    <RealSizeSection />
    <CoverSection />
    <DatasheetSection />
    <Section title="Propriedades" open={false} actions={<button className="dx-btn dx-btn-secondary dx-btn-sm" onClick={() => editMeta({ properties: [...meta.properties, { key: '', value: '' }] })}>+ Nova</button>}>
      {meta.properties.length === 0 && <Empty>Dados técnicos opcionais (tensão, corrente, IP…).</Empty>}
      {meta.properties.map((item, index) => <div key={index} className="ce-propline">
        <Text value={item.key} placeholder="Chave" onChange={(key) => editMeta({ properties: meta.properties.map((p, i) => (i === index ? { ...p, key } : p)) }, 'props')} />
        <Text value={item.value} placeholder="Valor" onChange={(value) => editMeta({ properties: meta.properties.map((p, i) => (i === index ? { ...p, value } : p)) }, 'props')} />
        <button className="ce-linkbtn" title="Remover propriedade" aria-label="Remover propriedade" onClick={() => editMeta({ properties: meta.properties.filter((_, i) => i !== index) })}><IconClose size={12} /></button>
      </div>)}
    </Section>
    <Section title={`Validação${issues.length ? ` (${issues.length})` : ''}`}>
      {issues.length === 0 ? <p className="ce-ok">Tudo pronto para publicar.</p> : <ul className="ce-issues">{issues.map((issue, index) => <li key={index} className={`is-${issue.level}`}>{issue.text}</li>)}</ul>}
    </Section>
    <Section title="Versões publicadas" open={false}>
      {versions.length === 0 && <Empty>Ainda não foi publicada nenhuma versão.</Empty>}
      {versions.map((version) => <div key={version.version} className="ce-version">
        <b>v{version.version}{version.version === entry?.latestVersion ? ' · atual' : ''}</b>
        <small>{new Date(version.publishedAt).toLocaleString('pt-PT')}{version.publishedBy ? ` · ${version.publishedBy}` : ''}</small>
        {version.note && <p>{version.note}</p>}
        {version.changes.length > 0 && <ul>{version.changes.map((change) => <li key={change}>{change}</li>)}</ul>}
      </div>)}
    </Section>
  </>
}
