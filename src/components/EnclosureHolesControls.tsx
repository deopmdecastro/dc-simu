import { useState } from 'react'
import type { ComponentType, ElectricalComponent, EnclosureHole, EnclosureHoleFace } from '../types'
import { useSimStore } from '../store/useSimStore'
import InspectorNumberInput from '../ui/InspectorNumberInput'
import Select from '../ui/Select'
import { IconChevronDown, IconClose, IconPlus } from '../ui/icons'

const FACES: Array<[EnclosureHoleFace, string]> = [['door', 'Porta'], ['top', 'Topo'], ['bottom', 'Fundo'], ['left', 'Esquerda'], ['right', 'Direita'], ['back', 'Traseira']]
const FACE_LABEL = Object.fromEntries([...FACES, ['doorOuter', 'Exterior da porta']])
const DIAMETERS = [16, 20, 25, 32, 40, 22, 30]
const METRIC = [16, 20, 25, 32, 40]
const glandFor = (diameter: number): EnclosureHole['glandType'] => METRIC.includes(diameter) ? `M${diameter}` as EnclosureHole['glandType'] : 'none'
const validNumber = (raw: string, min = -Infinity, max = Infinity) => raw.trim() !== '' && Number.isFinite(Number(raw)) && Number(raw) >= min && Number(raw) <= max

export default function EnclosureHolesControls({ c, holes }: { c: ElectricalComponent; holes: EnclosureHole[] }) {
  const stopped = useSimStore((s) => s.sim.runState === 'stopped')
  const disabled = !!c.locked || !stopped
  const [face, setFace] = useState<EnclosureHoleFace>('bottom')
  const [diameter, setDiameter] = useState(20)
  const [x, setX] = useState(0)
  const [y, setY] = useState(0)
  const [diameterRevision, setDiameterRevision] = useState(0)
  const [valid, setValid] = useState({ diameter: true, x: true, y: true })
  const [feedback, setFeedback] = useState('')
  const add = (hole: Omit<EnclosureHole, 'id'>) => {
    if (disabled || useSimStore.getState().sim.runState !== 'stopped') return
    useSimStore.getState().addPanelHole(c.id, hole)
    setFeedback(`Furo Ø${hole.diameterMm} mm criado: ${FACE_LABEL[hole.face].toLowerCase()}.`)
  }
  const pickDiameter = (value: number) => { setDiameter(value); setDiameterRevision((current) => current + 1); setValid((current) => ({ ...current, diameter: true })) }
  return <div className="dc-hole-editor" data-enclosure-holes>
    <fieldset className="dc-hole-fieldset" disabled={disabled}>
      <legend>Face</legend>
      <div className="dc-hole-face-options" role="group" aria-label="Face do furo">
        {FACES.map(([id, name]) => <button key={id} type="button" className={`dc-hole-option${face === id ? ' is-selected' : ''}`} aria-pressed={face === id} onClick={() => setFace(id)}>{name}</button>)}
      </div>
    </fieldset>

    <fieldset className="dc-hole-fieldset" disabled={disabled}>
      <legend>Diâmetro</legend>
      <div className="dc-hole-presets" role="group" aria-label="Diâmetros comuns">
        {DIAMETERS.map((mm) => <button key={mm} type="button" className={`dc-hole-option${diameter === mm ? ' is-selected' : ''}`} title={`Diâmetro ${mm} mm`} aria-pressed={diameter === mm} onClick={() => pickDiameter(mm)}>{METRIC.includes(mm) ? `M${mm}` : `Ø${mm}`}</button>)}
      </div>
      <label className="dc-hole-size"><span>Diâmetro (mm)</span><InspectorNumberInput aria-label="Diâmetro do furo (mm)" type="number" className="dc-input" min={6} max={80} step={1} value={diameter} resetKey={`${c.id}:${diameterRevision}`} disabled={disabled}
        onDraftChange={(raw) => setValid((current) => ({ ...current, diameter: validNumber(raw, 6, 80) }))} onChange={(event) => setDiameter(Number(event.target.value))} /></label>
      <p className="dc-hole-help">{METRIC.includes(diameter) ? `Inclui bucim M${diameter}.` : 'Furo livre para aparelho.'}</p>
    </fieldset>

    <fieldset className="dc-hole-fieldset" disabled={disabled}>
      <legend>Posição <span>(mm a partir do centro da face)</span></legend>
      <div className="dc-hole-position">
        <label><span>X (mm)</span><InspectorNumberInput aria-label="Posição X do furo (mm)" type="number" className="dc-input" value={x} disabled={disabled} onDraftChange={(raw) => setValid((current) => ({ ...current, x: validNumber(raw) }))} onChange={(event) => setX(Number(event.target.value))} /></label>
        <label><span>Y (mm)</span><InspectorNumberInput aria-label="Posição Y do furo (mm)" type="number" className="dc-input" value={y} disabled={disabled} onDraftChange={(raw) => setValid((current) => ({ ...current, y: validNumber(raw) }))} onChange={(event) => setY(Number(event.target.value))} /></label>
      </div>
    </fieldset>
    <button type="button" className="dc-btn dc-btn-primary dc-hole-create" disabled={disabled || !Object.values(valid).every(Boolean)} onClick={() => add({ face, diameterMm: diameter, offsetXmm: x, offsetYmm: y, glandType: glandFor(diameter) })}><IconPlus size={14} /> Fazer furo</button>
    <p className={feedback ? 'dc-hole-feedback' : 'sr-only'} role="status" aria-live="polite">{feedback}</p>

    <details className="dc-hole-shortcuts">
      <summary>Atalhos de furação <IconChevronDown size={12} /></summary>
      <div>
        <button type="button" className="dc-btn" disabled={disabled} onClick={() => add({ face: 'bottom', diameterMm: 20, offsetXmm: 0, offsetYmm: 0, glandType: 'M20' })}>Bucim M20 no fundo</button>
        <button type="button" className="dc-btn" disabled={disabled} title="Três furos no fundo, espaçados 60 mm" onClick={() => { for (const offsetXmm of [-60, 0, 60]) add({ face: 'bottom', diameterMm: 20, offsetXmm, offsetYmm: 0, glandType: 'M20' }); if (!disabled) setFeedback('Três furos com bucins M20 criados no fundo.') }}>3 bucins M20 no fundo</button>
        <button type="button" className="dc-btn" disabled={disabled} onClick={() => add({ face: 'door', diameterMm: 22, offsetXmm: 0, offsetYmm: 60, glandType: 'none' })}>Furo Ø22 na porta</button>
      </div>
    </details>

    {holes.length === 0 ? <p className="dc-hole-empty"><strong>Ainda sem furos</strong><span>Crie uma abertura à medida ou escolha um atalho de furação.</span></p>
      : <ol className="dc-hole-list" aria-label="Furos existentes">{holes.map((hole, index) => <HoleRow key={hole.id} c={c} hole={hole} index={index + 1} disabled={disabled} />)}</ol>}
  </div>
}

function HoleRow({ c, hole, index, disabled }: { c: ElectricalComponent; hole: EnclosureHole; index: number; disabled: boolean }) {
  const owner = useSimStore((s) => s.components.find((item) => item.id === hole.occupiedBy))
  const occupied = !!hole.occupiedBy
  const geometryDisabled = disabled || occupied
  const patch = (next: Partial<EnclosureHole>) => {
    if (!disabled && useSimStore.getState().sim.runState === 'stopped') useSimStore.getState().updatePanelHole(c.id, hole.id, next)
  }
  const accessory = occupied ? `Aparelho ${owner?.ref ?? hole.occupiedBy}` : hole.glandType && hole.glandType !== 'none' ? `Bucim ${hole.glandType}` : 'Sem acessório'
  return <li className="dc-hole-row" data-hole-id={hole.id}>
    <details aria-label={`Editar furo ${index}`}>
      <summary><span><strong>{FACE_LABEL[hole.face] ?? hole.face} · Ø{hole.diameterMm} mm</strong><small>{accessory} · X {hole.offsetXmm} / Y {hole.offsetYmm} mm</small></span><IconChevronDown size={13} /></summary>
      <div className="dc-hole-row-fields">
        {occupied && <p className="dc-hole-occupied">Remova o aparelho para alterar o furo.{owner && <button type="button" className="dc-btn" onClick={() => useSimStore.getState().selectComponents([owner.id])}>Abrir {owner.ref}</button>}</p>}
        <label><span>Face</span><Select className="dc-input" aria-label={`Face do furo ${index}`} disabled={geometryDisabled} value={hole.face} onChange={(event) => patch({ face: event.target.value as EnclosureHoleFace })}>{[...FACES, ['doorOuter', 'Exterior da porta']].map(([id, name]) => <option key={id} value={id}>{name}</option>)}</Select></label>
        <label><span>Diâmetro (mm)</span><InspectorNumberInput aria-label={`Diâmetro do furo ${index} (mm)`} type="number" className="dc-input" min={6} max={80} value={hole.diameterMm} disabled={geometryDisabled} onChange={(event) => patch({ diameterMm: Number(event.target.value) })} /></label>
        <div className="dc-hole-position">
          <label><span>X (mm)</span><InspectorNumberInput aria-label={`Posição X do furo ${index} (mm)`} type="number" className="dc-input" value={hole.offsetXmm} disabled={geometryDisabled} onChange={(event) => patch({ offsetXmm: Number(event.target.value) })} /></label>
          <label><span>Y (mm)</span><InspectorNumberInput aria-label={`Posição Y do furo ${index} (mm)`} type="number" className="dc-input" value={hole.offsetYmm} disabled={geometryDisabled} onChange={(event) => patch({ offsetYmm: Number(event.target.value) })} /></label>
        </div>
        <label><span>Bucim</span><Select className="dc-input" aria-label={`Bucim do furo ${hole.id}`} disabled={disabled || occupied} value={hole.glandType || 'none'} onChange={(event) => patch({ glandType: event.target.value as EnclosureHole['glandType'] })}>
          <option value="none">Sem bucim</option>{METRIC.map((mm) => <option key={mm} value={`M${mm}`}>{`M${mm}`}</option>)}</Select></label>
        <label><span>Aparelho</span><Select className="dc-input" aria-label={`Adicionar aparelho ao furo ${hole.id}`} disabled={disabled || occupied} defaultValue="" resetOnSelect onChange={(event) => { if (event.target.value && !occupied) useSimStore.getState().addMountedDevice(event.target.value as ComponentType, c.id, hole.face, hole.offsetXmm, hole.offsetYmm, hole.diameterMm, hole.id) }}>
          <option value="">{occupied ? 'Aparelho montado' : 'Adicionar aparelho…'}</option><option value="buttonNO">Botão NA (verde)</option><option value="buttonNC">Botão NF (vermelho)</option><option value="selector2">Seletor de 2 posições</option><option value="pilotLightAd22">Sinaleiro LED AD22</option><option value="emergencyButton">Emergência</option></Select></label>
      </div>
    </details>
    <button type="button" className="dc-btn dc-hole-remove" aria-label={`Remover furo ${index}`} title={occupied ? 'Remova o aparelho para alterar o furo.' : `Remover furo ${index}`} disabled={geometryDisabled} onClick={() => useSimStore.getState().removePanelHole(c.id, hole.id)}><IconClose size={14} /></button>
  </li>
}
