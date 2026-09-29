import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useSimStore } from '../store/useSimStore'
import { COMPONENT_VIEW_PRESETS, normalizeComponentOrientation, type ComponentViewPreset } from '../three/componentOrientation'
import { hasComponent3DModel } from '../three/modelPaths'
import { IconCube, IconRotate, IconSave } from '../ui/icons'
import type { ComponentViewOrientation } from '../types'

const PRESETS: Array<{ id: ComponentViewPreset; label: string }> = [
  { id: 'isometric', label: 'Isométrica' },
  { id: 'front', label: 'Frente' },
  { id: 'back', label: 'Trás' },
  { id: 'left', label: 'Esquerda' },
  { id: 'right', label: 'Direita' },
  { id: 'top', label: 'Superior' },
  { id: 'bottom', label: 'Inferior' },
]

const VIEW_CUBE_CORNERS: Array<{ position: string; label: string; orientation: ComponentViewOrientation }> = [
  { position: 'nw', label: 'Canto isométrico superior esquerdo', orientation: { x: -35.264, y: -45, z: 0 } },
  { position: 'ne', label: 'Canto isométrico superior direito', orientation: COMPONENT_VIEW_PRESETS.isometric },
  { position: 'sw', label: 'Canto isométrico inferior esquerdo', orientation: { x: 35.264, y: -45, z: 0 } },
  { position: 'se', label: 'Canto isométrico inferior direito', orientation: { x: 35.264, y: 45, z: 0 } },
]

function OrientationCube({ value, onChange }: { value: ComponentViewOrientation; onChange: (value: ComponentViewOrientation) => void }) {
  const drag = useRef<{ pointerId: number; x: number; y: number; orientation: ComponentViewOrientation } | null>(null)
  const finish = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (drag.current?.pointerId !== event.pointerId) return
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    drag.current = null
  }
  const preset = (id: ComponentViewPreset) => onChange({ ...COMPONENT_VIEW_PRESETS[id] })
  return (
    <div className="component-view-cube-wrap">
      <div
        className="component-view-cube-stage"
        title="Arraste para rodar livremente · Shift+arraste roda o eixo Z"
        onPointerDown={(event) => {
          drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, orientation: { ...value } }
          event.currentTarget.setPointerCapture(event.pointerId)
        }}
        onPointerMove={(event) => {
          const current = drag.current
          if (!current || current.pointerId !== event.pointerId) return
          const dx = event.clientX - current.x
          const dy = event.clientY - current.y
          onChange(normalizeComponentOrientation(event.shiftKey
            ? { ...current.orientation, z: current.orientation.z + dx * 0.65 }
            : { ...current.orientation, x: current.orientation.x - dy * 0.65, y: current.orientation.y + dx * 0.65 }))
        }}
        onPointerUp={finish}
        onPointerCancel={finish}
      >
        <div className="component-view-cube" style={{ transform: `rotateX(${-value.x}deg) rotateY(${value.y}deg) rotateZ(${value.z}deg)` }}>
          <button className="face front" onClick={(event) => { event.stopPropagation(); preset('front') }} title="Frente">F</button>
          <button className="face back" onClick={(event) => { event.stopPropagation(); preset('back') }} title="Trás">T</button>
          <button className="face right" onClick={(event) => { event.stopPropagation(); preset('right') }} title="Direita">D</button>
          <button className="face left" onClick={(event) => { event.stopPropagation(); preset('left') }} title="Esquerda">E</button>
          <button className="face top" onClick={(event) => { event.stopPropagation(); preset('top') }} title="Superior">S</button>
          <button className="face bottom" onClick={(event) => { event.stopPropagation(); preset('bottom') }} title="Inferior">I</button>
        </div>
        {VIEW_CUBE_CORNERS.map((corner) => <button
          type="button"
          key={corner.position}
          className={`component-view-cube-corner ${corner.position}`}
          aria-label={corner.label}
          title={corner.label}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => { event.stopPropagation(); onChange({ ...corner.orientation }) }}
        />)}
      </div>
      <button className="component-view-iso" onClick={() => preset('isometric')} title="Vista isométrica">ISO</button>
      <span>Arraste o cubo · Shift = eixo Z</span>
    </div>
  )
}

function AngleField({ axis, value, onChange }: { axis: 'X' | 'Y' | 'Z'; value: number; onChange: (value: number) => void }) {
  return <label className="component-view-angle"><span>{axis}</span><input type="number" min={-180} max={180} step={1} value={Math.round(value * 10) / 10} onChange={(event) => onChange(Number(event.target.value) || 0)} /><small>°</small></label>
}

/** Comando + editor partilhado pelas vistas Esquema e Painel 3D. */
export default function ComponentViewEditor() {
  const components = useSimStore((state) => state.components)
  const selectedIds = useSimStore((state) => state.selectedComponentIds)
  const editor = useSimStore((state) => state.viewOrientationEditor)
  const open = useSimStore((state) => state.openViewOrientationEditor)
  const setDraft = useSimStore((state) => state.setViewOrientationDraft)
  const cancel = useSimStore((state) => state.cancelViewOrientationEditor)
  const apply = useSimStore((state) => state.applyViewOrientationEditor)
  const [saveAsDefault, setSaveAsDefault] = useState(false)
  const selected = selectedIds.length === 1 ? components.find((component) => component.id === selectedIds[0]) : undefined
  const component = editor ? components.find((item) => item.id === editor.componentId) : undefined

  useEffect(() => setSaveAsDefault(false), [editor?.componentId])

  if (!editor) {
    if (!selected) return null
    return <div className="component-view-command">
      <button type="button" onClick={() => open(selected.id)} title={`Editar orientação visual de ${selected.ref}`}><IconCube size={14} />Editar vista</button>
    </div>
  }
  if (!component) return null

  const draft = editor.draft
  const updateAxis = (axis: 'x' | 'y' | 'z', value: number) => setDraft(normalizeComponentOrientation({ ...draft, [axis]: value }))
  return (
    <section className="component-view-editor" aria-label={`Editor de vista de ${component.ref}`} onPointerDown={(event) => event.stopPropagation()}>
      <header>
        <div><IconCube size={16} /><span><strong>Editar vista</strong><small>{component.ref} · {component.label}</small></span></div>
        <button type="button" onClick={cancel} aria-label="Fechar e cancelar">×</button>
      </header>

      <OrientationCube value={draft} onChange={setDraft} />

      <div className="component-view-presets" aria-label="Vistas predefinidas">
        {PRESETS.map((preset) => <button type="button" key={preset.id} onClick={() => setDraft({ ...COMPONENT_VIEW_PRESETS[preset.id] })}>{preset.label}</button>)}
      </div>

      <div className="component-view-angles">
        <AngleField axis="X" value={draft.x} onChange={(value) => updateAxis('x', value)} />
        <AngleField axis="Y" value={draft.y} onChange={(value) => updateAxis('y', value)} />
        <AngleField axis="Z" value={draft.z} onChange={(value) => updateAxis('z', value)} />
      </div>
      <div className="component-view-rotate-z">
        <button type="button" onClick={() => updateAxis('z', draft.z - 15)}>Z −15°</button>
        <button type="button" onClick={() => updateAxis('z', draft.z + 15)}>Z +15°</button>
        <button type="button" onClick={() => setDraft({ ...COMPONENT_VIEW_PRESETS.original })}><IconRotate size={11} />Original</button>
      </div>

      <label className="component-view-default"><input type="checkbox" checked={saveAsDefault} onChange={(event) => setSaveAsDefault(event.target.checked)} /><span>Guardar como vista padrão do componente<small>Novas instâncias de {component.type} usarão esta orientação.</small></span></label>
      {!hasComponent3DModel(component.type) && <p className="component-view-warning">Este tipo usa uma representação procedural; no Esquema, os bornes permanecem fixos.</p>}
      <p className="component-view-note">Apenas a vista muda. Bornes, fios, posição e dados elétricos permanecem intactos.</p>

      <footer>
        <button type="button" className="dc-btn" onClick={cancel}>Cancelar</button>
        <button type="button" className="dc-btn-primary dc-btn" onClick={() => apply(saveAsDefault)}><IconSave size={12} />Aplicar</button>
      </footer>
    </section>
  )
}
