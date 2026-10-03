import { useEffect, useMemo, useState } from 'react'
import { applyPreset, axisIndex, DEFAULT_TILT, FEELS, normalizeMotion, presetFromControl, type MotionPreset } from '../../catalog/controlMotion'
import type { ControlDef, ControlMotion, Vec3 } from '../../catalog/types'
import { IconClose } from '../../ui/icons'
import { useEditorStore } from './editorStore'
import { allMotionPresets, applyMotionPreset, breakerAxesOf, controlIsOn, controlVariable, deleteMotionPreset, makeBreakerTilt, saveMotionPreset, setControlOn } from './controlOps'
import { Check, Field, Num, Section, Select, Text } from './ui'

type Patch = (value: Partial<ControlDef>, key?: string) => void

const AXIS_CHOICES: Array<[string, string, Vec3]> = [['x', 'Eixo X', [1, 0, 0]], ['y', 'Eixo Y', [0, 1, 0]], ['z', 'Eixo Z', [0, 0, 1]]]
const axisKeyOf = (axis: Vec3) => AXIS_CHOICES[axisIndex(axis)][0]

/** Botões «OFF» / «ON» e ciclo automático: ver as duas poses e a animação sem simular cliques. */
export function MotionTester({ control }: { control: ControlDef }) {
  useEditorStore((s) => s.previewVars)
  const [auto, setAuto] = useState(false)
  const variable = controlVariable(control)
  const on = controlIsOn(control)
  useEffect(() => {
    if (!auto || !variable) return
    const timer = window.setInterval(() => setControlOn(control, !controlIsOn(control)), 1100)
    return () => window.clearInterval(timer)
  }, [auto, variable, control.id])
  useEffect(() => { setAuto(false) }, [control.id])
  if (!variable) return <p className="ce-hint">Ligue uma ação «alternar variável» para testar o ON/OFF.</p>
  return <>
    <div className="ce-actions-inline" role="group" aria-label="Testar ON e OFF">
      <button className={`dx-btn dx-btn-sm ${!on ? 'dx-btn-primary' : 'dx-btn-secondary'}`} onClick={() => { setAuto(false); setControlOn(control, false) }}>OFF</button>
      <button className={`dx-btn dx-btn-sm ${on ? 'dx-btn-primary' : 'dx-btn-secondary'}`} onClick={() => { setAuto(false); setControlOn(control, true) }}>ON</button>
      <Check checked={auto} label="Ciclo automático" onChange={setAuto} />
    </div>
    <p className="ce-hint">Variável «<code>{variable}</code>»: {on ? 'verdadeira (ON)' : 'falsa (OFF)'}. Os ângulos mudam em direto.</p>
  </>
}

/** Campos do movimento de um botão/interruptor: deslizar ou bascular sobre um pivô. */
export function MotionFields({ control, patch }: { control: ControlDef; patch: Patch }) {
  const def = useEditorStore((s) => s.def)
  const pickPivot = useEditorStore((s) => s.pickPivot)
  const set = useEditorStore((s) => s.set)
  const motion = normalizeMotion(control.motion)
  const tilt = motion.mode === 'tilt'
  const axes = useMemo(() => breakerAxesOf(def), [def.terminals])
  const patchMotion = (value: Partial<ControlMotion>, key = 'motion') => patch({ motion: { ...motion, ...value } }, key)
  const setMode = (mode: ControlMotion['mode']) => {
    set({ pickPivot: null })
    if (mode === 'tilt') patch({ motion: { ...DEFAULT_TILT }, axis: axes?.pole ?? [0, 0, 1], travelMm: 0 })
    else patch({ motion: undefined, travelMm: control.travelMm || 0.6 })
  }
  const pivotPercent = (index: 0 | 1 | 2, percent: number) => {
    const pivotRel = [...motion.pivotRel] as Vec3
    pivotRel[index] = Math.round(percent) / 100
    patchMotion({ pivotRel }, `pivot${index}`)
  }
  return <>
    <Field label="Movimento" hint="Deslizar = o objeto afunda em linha reta (botões). Bascular = roda à volta de um pivô, como o manípulo de um disjuntor.">
      <Select value={motion.mode} onChange={setMode} options={[['slide', 'Deslizar (botão)'], ['tilt', 'Bascular sobre pivô (manípulo)']]} /></Field>
    {!tilt && <>
      <Field label="Direção do botão" hint="O botão afunda no sentido contrário ao eixo (a normal da face).">
        <Select value={axisKeyOf(control.axis)} onChange={(key) => patch({ axis: AXIS_CHOICES.find(([id]) => id === key)![2] })} options={AXIS_CHOICES.map(([id, label]): [string, string] => [id, label])} /></Field>
      <Field label="Curso"><Num value={control.travelMm} min={0} max={30} step={0.1} unit="mm" onChange={(travelMm) => patch({ travelMm }, 'travel')} /></Field>
    </>}
    {tilt && <>
      <Field label="Eixo de rotação" hint="Para um disjuntor é o eixo ao longo dos polos (de L1 para L3).">
        <Select value={axisKeyOf(control.axis)} onChange={(key) => patch({ axis: AXIS_CHOICES.find(([id]) => id === key)![2] })} options={AXIS_CHOICES.map(([id, label]): [string, string] => [id, label])} /></Field>
      {axes && axisKeyOf(axes.pole) !== axisKeyOf(control.axis) && <p className="ce-hint" role="status">Os bornes sugerem o <b>{axisKeyOf(axes.pole).toUpperCase()}</b> ({axes.reason}).{' '}
        <button className="ce-linkbtn" onClick={() => patch({ axis: axes.pole })}>Usar</button></p>}
      <Field label="Ângulo em OFF"><Num value={motion.angleOff} min={-180} max={180} step={1} unit="°" onChange={(angleOff) => patchMotion({ angleOff }, 'aoff')} /></Field>
      <Field label="Ângulo em ON"><Num value={motion.angleOn} min={-180} max={180} step={1} unit="°" onChange={(angleOn) => patchMotion({ angleOn }, 'aon')} /></Field>
      <div className="ce-actions-inline">
        <button className="dx-btn dx-btn-secondary dx-btn-sm" title="Troca o sentido: o que subia passa a descer" onClick={() => patchMotion({ angleOff: motion.angleOn, angleOn: motion.angleOff })}>⇅ Inverter sentido</button>
      </div>
      <p className="ce-hint">Ângulos relativos à pose do modelo (0° = como o GLB foi exportado). Positivo = sentido horário visto ao longo do eixo.</p>
      <Field label="Pivô (% da caixa do manípulo)" hint="Ponto à volta do qual o manípulo roda (bola vermelha no modelo). Em percentagem, para servir também noutros disjuntores de tamanho diferente.">
        <span className="ce-inline">
          <Num value={Math.round(motion.pivotRel[0] * 100)} min={-50} max={150} step={5} unit="X%" onChange={(v) => pivotPercent(0, v)} />
          <Num value={Math.round(motion.pivotRel[1] * 100)} min={-50} max={150} step={5} unit="Y%" onChange={(v) => pivotPercent(1, v)} />
          <Num value={Math.round(motion.pivotRel[2] * 100)} min={-50} max={150} step={5} unit="Z%" onChange={(v) => pivotPercent(2, v)} />
        </span></Field>
      <div className="ce-actions-inline">
        <button className={`dx-btn dx-btn-sm ${pickPivot === control.id ? 'dx-btn-primary' : 'dx-btn-secondary'}`} onClick={() => set({ pickPivot: pickPivot === control.id ? null : control.id, pick: null, placing: false, placingDisplay: null, placingLed: false, ribbon: 'select' })}>
          {pickPivot === control.id ? 'Cancelar' : 'Escolher pivô no modelo'}</button>
        <button className="dx-btn dx-btn-secondary dx-btn-sm" onClick={() => patchMotion({ pivotRel: [0.5, 0.5, 0.5] })}>Centro</button>
      </div>
      {pickPivot === control.id && <p className="ce-hint" role="status">Clique no modelo no ponto onde o manípulo deve rodar (o eixo de profundidade fica o do ponto clicado).</p>}
      <Field label="Sensação">
        <Select value={motion.feel} onChange={(feel) => patchMotion({ feel })} options={FEELS} /></Field>
      <Field label="Duração" hint="Tempo aproximado da transição OFF ⇄ ON."><Num value={motion.durationMs} min={40} max={2000} step={20} unit="ms" onChange={(durationMs) => patchMotion({ durationMs }, 'dur')} /></Field>
    </>}
    <MotionTester control={control} />
  </>
}

/** Automação: converter em manípulo de disjuntor, predefinições reutilizáveis e propagação a outros controlos. */
export function BreakerAutomation({ control }: { control: ControlDef }) {
  const def = useEditorStore((s) => s.def)
  const edit = useEditorStore((s) => s.edit)
  const [note, setNote] = useState('')
  const [name, setName] = useState('')
  const [presets, setPresets] = useState<MotionPreset[]>(() => allMotionPresets())
  const [presetId, setPresetId] = useState('builtin-breaker-rocker')
  useEffect(() => { setNote('') }, [control.id])
  if (control.kind === 'selector') return null
  const refresh = () => setPresets(allMotionPresets())
  const others = (def.controls ?? []).filter((item) => item.id !== control.id && item.kind !== 'selector')
  const propagate = () => {
    const axes = breakerAxesOf(def)
    const preset = presetFromControl(control, 'tmp', control.name)
    edit((state) => ({ ...state, controls: (state.controls ?? []).map((item) => (item.id !== control.id && item.kind !== 'selector' ? applyPreset(item, preset, axes) : item)) }), `control:${control.id}:propagate`)
    setNote(`Movimento copiado para ${others.length} controlo(s) deste componente (objetos e ações mantidos).`)
  }
  return <Section title="Automação (disjuntores)" open={false}>
    <p className="ce-hint">Poupa trabalho no próximo disjuntor: converte o controlo num manípulo basculante já com eixo, pivô e mola, e guarda o resultado para reutilizar.</p>
    <div className="ce-actions-inline">
      <button className="dx-btn dx-btn-primary dx-btn-sm" onClick={() => setNote(makeBreakerTilt(control.id))}>Converter em manípulo de disjuntor (auto)</button>
    </div>
    <Field label="Predefinição">
      <Select value={presetId} onChange={setPresetId} options={presets.map((item): [string, string] => [item.id, item.name])} /></Field>
    <div className="ce-actions-inline">
      <button className="dx-btn dx-btn-secondary dx-btn-sm" onClick={() => { const preset = presets.find((item) => item.id === presetId); if (preset) setNote(applyMotionPreset(control.id, preset)) }}>Aplicar a este controlo</button>
      {!presetId.startsWith('builtin-') && <button className="ce-linkbtn" aria-label="Apagar predefinição" title="Apagar predefinição" onClick={() => { deleteMotionPreset(presetId); setPresetId('builtin-breaker-rocker'); refresh() }}><IconClose size={12} /></button>}
    </div>
    <Field label="Guardar este movimento" hint="Fica neste navegador e aparece na lista de predefinições em qualquer componente.">
      <span className="ce-inline"><Text value={name} onChange={setName} /><button className="dx-btn dx-btn-secondary dx-btn-sm" onClick={() => { const saved = saveMotionPreset(control, name || control.name); setName(''); refresh(); setPresetId(saved.id); setNote(`«${saved.name}» guardado.`) }}>Guardar</button></span></Field>
    {others.length > 0 && <div className="ce-actions-inline"><button className="dx-btn dx-btn-secondary dx-btn-sm" onClick={propagate}>Copiar movimento para os outros {others.length} controlo(s)</button></div>}
    {note && <p className="ce-hint" role="status">{note}</p>}
  </Section>
}
