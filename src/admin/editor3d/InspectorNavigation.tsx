import { useEffect, useRef, useState } from 'react'
import { IconBox, IconFocus, IconLayers } from '../../ui/icons'
import { useEditorStore, type InspectorTab } from './editorStore'

const GROUPS: Array<{ id: string; label: string; tabs: Array<[InspectorTab, string]> }> = [
  { id: 'build', label: 'Construção', tabs: [['object', 'Objeto'], ['materials', 'Materiais'], ['terminals', 'Bornes'], ['wires', 'Cabos']] },
  { id: 'behavior', label: 'Funcionamento', tabs: [['controls', 'Botões'], ['displays', 'Ecrãs'], ['lights', 'Luzes'], ['states', 'Estados'], ['interactions', 'Interações']] },
  { id: 'component', label: 'Componente', tabs: [['component', 'Componente']] },
]

export default function InspectorNavigation() {
  const tab = useEditorStore((state) => state.tab)
  const selection = useEditorStore((state) => state.selection)
  const def = useEditorStore((state) => state.def)
  const set = useEditorStore((state) => state.set)
  const [lastTabs, setLastTabs] = useState<Record<string, InspectorTab>>({})
  const context = useRef<HTMLDivElement>(null)
  const group = GROUPS.find((item) => item.tabs.some(([key]) => key === tab)) ?? GROUPS[0]
  useEffect(() => { setLastTabs((current) => ({ ...current, [group.id]: tab })) }, [group.id, tab])
  useEffect(() => { context.current?.closest('aside')?.querySelector('.ce-inspector')?.scrollTo({ top: 0 }) }, [tab, selection?.kind, selection?.id])
  useEffect(() => {
    if (!selection) return
    const next: InspectorTab = selection.kind === 'part' ? 'object' : selection.kind === 'terminal' ? 'terminals' : selection.kind === 'control' ? 'controls' : selection.kind === 'display' ? 'displays' : 'lights'
    useEditorStore.getState().set({ tab: next })
  }, [selection?.kind, selection?.id])
  const name = selection?.kind === 'part' ? def.parts.find((item) => item.id === selection.id)?.name
    : selection?.kind === 'terminal' ? def.terminals.find((item) => item.id === selection.id)?.label
      : selection?.kind === 'control' ? def.controls?.find((item) => item.id === selection.id)?.name
        : selection?.kind === 'display' ? def.displays?.find((item) => item.id === selection.id)?.name
          : selection?.kind === 'light' ? def.lights.find((item) => item.id === selection.id)?.name : undefined
  const kind = selection?.kind === 'part' ? 'Peça' : selection?.kind === 'terminal' ? 'Borne' : selection?.kind === 'control' ? 'Controlo' : selection?.kind === 'display' ? 'Ecrã' : selection?.kind === 'light' ? 'Luz' : 'Componente'
  return <>
    <div ref={context} className="ce-inspector-context"><span className="ce-inspector-symbol"><IconLayers size={16} /></span><div><small>{kind}</small><strong title={name}>{name || 'Propriedades do componente'}</strong></div>
      {selection && <button className="ce-icon" aria-label="Enquadrar elemento" title="Enquadrar elemento" onClick={() => { useEditorStore.getState().cameraTo('fitSel'); window.dispatchEvent(new CustomEvent('ce-open-canvas')) }}><IconFocus size={15} /></button>}
    </div>
    <div className="ce-inspector-groups" role="group" aria-label="Áreas de propriedades">
      {GROUPS.map((item) => <button key={item.id} aria-pressed={item.id === group.id} className={item.id === group.id ? 'is-on' : ''} onClick={() => set({ tab: lastTabs[item.id] ?? item.tabs[0][0] })}>{item.id === 'component' && <IconBox size={12} />}{item.label}</button>)}
    </div>
    <div className="ce-tabs" role="tablist" aria-label={`Propriedades — ${group.label}`}>
      {group.tabs.map(([key, label]) => <button key={key} role="tab" aria-selected={tab === key} className={tab === key ? 'is-on' : ''} onClick={() => set({ tab: key })}>{label}</button>)}
    </div>
  </>
}
