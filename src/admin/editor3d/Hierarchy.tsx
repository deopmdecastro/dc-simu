import { useMemo, useState } from 'react'
import type { PartDef } from '../../catalog/types'
import { IconBox, IconCylinder, IconEye, IconEyeOff, IconGroup, IconLock, IconModel, IconSparkle, IconSphere, IconCone, IconTorus, IconUnlock } from '../../ui/icons'
import { descendantsOf, patchPart, useEditorStore } from './editorStore'
import { deleteSelection, duplicateSelection, groupSelection } from './partActions'

const KIND_ICON: Record<PartDef['kind'], typeof IconBox> = { group: IconGroup, box: IconBox, cylinder: IconCylinder, sphere: IconSphere, cone: IconCone, torus: IconTorus, glb: IconModel }

export default function Hierarchy() {
  const def = useEditorStore((s) => s.def)
  const selection = useEditorStore((s) => s.selection)
  const mode = useEditorStore((s) => s.mode)
  const edit = useEditorStore((s) => s.edit)
  const select = useEditorStore((s) => s.select)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)
  const readOnly = mode === 'simulate'
  const hiddenTerminals = useEditorStore((s) => s.hiddenTerminals)
  const setTerminalsHidden = useEditorStore((s) => s.setTerminalsHidden)
  const toggleTerminalHidden = useEditorStore((s) => s.toggleTerminalHidden)
  const allHidden = def.terminals.length > 0 && def.terminals.every((item) => hiddenTerminals.includes(item.id))
  const termGroups = useMemo(() => {
    const map = new Map<string, typeof def.terminals>()
    for (const terminal of def.terminals) { const key = terminal.group ?? ''; map.set(key, [...(map.get(key) ?? []), terminal]) }
    return [...map.entries()]
  }, [def.terminals])
  const selectedPart = selection?.kind === 'part' ? def.parts.find((part) => part.id === selection.id) : undefined

  const rows: Array<{ part: PartDef; depth: number }> = []
  const walk = (parent: string | null, depth: number) => def.parts.filter((part) => part.parentId === parent).forEach((part) => { rows.push({ part, depth }); walk(part.id, depth + 1) })
  walk(null, 0)

  const reparent = (id: string, parentId: string | null) => {
    if (id === parentId) return
    if (parentId && descendantsOf(def, id).includes(parentId)) return
    edit((current) => patchPart(current, id, { parentId }))
  }

  return <aside className="ce-left" aria-label="Hierarquia">
    <div className="ce-panel-head"><strong>Objetos</strong><span>{def.parts.length}</span></div>
    <div className="ce-tree" role="tree" onDragOver={(event) => { if (dragId) event.preventDefault() }} onDrop={() => { if (dragId) reparent(dragId, null); setDragId(null); setOverId(null) }}>
      {rows.length === 0 && <p className="ce-empty">Sem peças. Adicione uma forma na barra de ferramentas.</p>}
      {rows.map(({ part, depth }) => {
        const active = selection?.kind === 'part' && selection.id === part.id
        return <div key={part.id} role="treeitem" aria-selected={active} draggable={!readOnly}
          className={`ce-row${active ? ' is-active' : ''}${overId === part.id ? ' is-over' : ''}${part.visible ? '' : ' is-hidden'}`} style={{ paddingLeft: 6 + depth * 14 }}
          onClick={() => select({ kind: 'part', id: part.id })}
          onDragStart={() => setDragId(part.id)} onDragEnd={() => { setDragId(null); setOverId(null) }}
          onDragOver={(event) => { if (dragId) { event.preventDefault(); event.stopPropagation(); setOverId(part.id) } }}
          onDrop={(event) => { event.stopPropagation(); if (dragId) reparent(dragId, part.id); setDragId(null); setOverId(null) }}>
          <i className="ce-row-kind">{(() => { const Icon = KIND_ICON[part.kind]; return <Icon size={13} /> })()}</i>
          {renaming === part.id
            ? <input autoFocus className="dx-input ce-rename" defaultValue={part.name} onClick={(event) => event.stopPropagation()}
                onBlur={(event) => { edit((current) => patchPart(current, part.id, { name: event.target.value.trim() || part.name })); setRenaming(null) }}
                onKeyDown={(event) => { if (event.key === 'Enter') (event.target as HTMLInputElement).blur(); if (event.key === 'Escape') setRenaming(null) }} />
            : <span className="ce-row-name" onDoubleClick={() => !readOnly && setRenaming(part.id)} title="Duplo clique para renomear">{part.name}</span>}
          {def.lights.some((light) => light.partId === part.id) && <i className="ce-row-badge" title="Zona luminosa"><IconSparkle size={12} /></i>}
          <button className="ce-icon" title={part.visible ? 'Ocultar' : 'Mostrar'} aria-label={part.visible ? 'Ocultar' : 'Mostrar'} disabled={readOnly} onClick={(event) => { event.stopPropagation(); edit((current) => patchPart(current, part.id, { visible: !part.visible })) }}>{part.visible ? <IconEye size={13} /> : <IconEyeOff size={13} />}</button>
          <button className="ce-icon" title={part.locked ? 'Desbloquear' : 'Bloquear'} aria-label={part.locked ? 'Desbloquear' : 'Bloquear'} disabled={readOnly} onClick={(event) => { event.stopPropagation(); edit((current) => patchPart(current, part.id, { locked: !part.locked })) }}>{part.locked ? <IconLock size={13} /> : <IconUnlock size={13} />}</button>
        </div>
      })}
    </div>
    {selectedPart && !readOnly && <div className="ce-left-actions">
      <button className="dx-btn dx-btn-secondary dx-btn-sm" onClick={duplicateSelection}>Duplicar</button>
      <button className="dx-btn dx-btn-secondary dx-btn-sm" title="Cria um grupo pai à volta desta peça" onClick={groupSelection}>Agrupar</button>
      <button className="dx-btn dx-btn-danger dx-btn-sm" onClick={deleteSelection}>Eliminar</button>
    </div>}
    <div className="ce-left-lists">
      <div className="ce-panel-head">
        <strong>Bornes</strong><span>{def.terminals.length}</span>
        {def.terminals.length > 0 && <button className="ce-icon ce-head-eye" aria-label={allHidden ? 'Mostrar todos os bornes' : 'Ocultar todos os bornes'} title={allHidden ? 'Mostrar todos os bornes [H]' : 'Ocultar todos os bornes [H]'}
          onClick={() => setTerminalsHidden(def.terminals.map((item) => item.id), !allHidden)}>{allHidden ? <IconEyeOff size={13} /> : <IconEye size={13} />}</button>}
      </div>
      {termGroups.map(([group, items]) => <div key={group || '_'} className="ce-tgroup">
        {termGroups.length > 1 && <div className="ce-tgroup-head"><span>{group || 'Sem grupo'}</span><em>{items.length}</em>
          <button className="ce-icon" aria-label={items.every((item) => hiddenTerminals.includes(item.id)) ? `Mostrar bornes de ${group || 'sem grupo'}` : `Ocultar bornes de ${group || 'sem grupo'}`}
            title={items.every((item) => hiddenTerminals.includes(item.id)) ? 'Mostrar este grupo' : 'Ocultar este grupo'}
            onClick={() => setTerminalsHidden(items.map((item) => item.id), !items.every((item) => hiddenTerminals.includes(item.id)))}>
            {items.every((item) => hiddenTerminals.includes(item.id)) ? <IconEyeOff size={12} /> : <IconEye size={12} />}</button></div>}
        {items.map((terminal) => {
          const hidden = hiddenTerminals.includes(terminal.id)
          return <div key={terminal.id} role="button" tabIndex={0} className={`ce-row ce-row-btn${selection?.kind === 'terminal' && selection.id === terminal.id ? ' is-active' : ''}${hidden ? ' is-hidden' : ''}`}
            onClick={() => useEditorStore.getState().set({ selection: { kind: 'terminal', id: terminal.id }, selectedWire: null, tab: 'terminals' })}
            onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); useEditorStore.getState().set({ selection: { kind: 'terminal', id: terminal.id }, selectedWire: null, tab: 'terminals' }) } }}>
            <i className="ce-dot" style={{ background: terminal.color }} /><span className="ce-row-name">{terminal.label} · {terminal.name}</span>
            <button className="ce-icon" title={hidden ? 'Mostrar borne' : 'Ocultar borne'} aria-label={hidden ? `Mostrar borne ${terminal.label}` : `Ocultar borne ${terminal.label}`}
              onClick={(event) => { event.stopPropagation(); toggleTerminalHidden(terminal.id) }}>{hidden ? <IconEyeOff size={13} /> : <IconEye size={13} />}</button>
          </div>
        })}
      </div>)}
      {def.terminals.length === 0 && <p className="ce-empty">Sem bornes.</p>}
      <div className="ce-panel-head"><strong>Luzes</strong><span>{def.lights.length}</span></div>
      {def.lights.map((light) => <button key={light.id} className={`ce-row ce-row-btn${selection?.kind === 'light' && selection.id === light.id ? ' is-active' : ''}`}
        onClick={() => useEditorStore.getState().set({ selection: { kind: 'light', id: light.id }, tab: 'lights' })}><i className="ce-dot" style={{ background: light.color }} /><span className="ce-row-name">{light.name}</span></button>)}
      {def.lights.length === 0 && <p className="ce-empty">Sem zonas luminosas.</p>}
    </div>
  </aside>
}
