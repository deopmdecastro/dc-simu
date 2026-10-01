import { useRef, useState } from 'react'
import { loadGlbAssets, newId, defaultPart } from '../../catalog/definition'
import type { PartDef } from '../../catalog/types'
import { addPart, descendantsOf, duplicatePart, glbCache, patchPart, removeParts, useEditorStore } from './editorStore'

const KIND_GLYPH: Record<PartDef['kind'], string> = { group: '▣', box: '▢', cylinder: '◍', sphere: '●', cone: '▲', torus: '◎', glb: '⬡' }
const ADD: Array<[PartDef['kind'], string]> = [['box', 'Caixa'], ['cylinder', 'Cilindro'], ['sphere', 'Esfera'], ['cone', 'Cone'], ['torus', 'Anel'], ['group', 'Grupo']]
const MAX_GLB_BYTES = 4 * 1024 * 1024

function readDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error); reader.readAsDataURL(file) })
}

export default function Hierarchy() {
  const def = useEditorStore((s) => s.def)
  const selection = useEditorStore((s) => s.selection)
  const mode = useEditorStore((s) => s.mode)
  const edit = useEditorStore((s) => s.edit)
  const select = useEditorStore((s) => s.select)
  const fileRef = useRef<HTMLInputElement>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const readOnly = mode === 'simulate'
  const selectedPart = selection?.kind === 'part' ? def.parts.find((part) => part.id === selection.id) : undefined

  const add = (kind: PartDef['kind']) => {
    const parent = selectedPart?.kind === 'group' ? selectedPart.id : selectedPart?.parentId ?? null
    const result = addPart(def, kind, parent)
    edit(() => result.def)
    select({ kind: 'part', id: result.part.id })
  }

  async function importGlb(file: File | undefined) {
    if (!file) return
    setError('')
    if (!/\.(glb)$/i.test(file.name)) { setError('Use um ficheiro .glb (binário).'); return }
    if (file.size > MAX_GLB_BYTES) { setError('O modelo excede 4 MB. Simplifique a malha antes de importar.'); return }
    try {
      const data = await readDataUrl(file)
      const assetId = newId('a_')
      const part: PartDef = { ...defaultPart('glb', null, file.name.replace(/\.glb$/i, '')), asset: assetId }
      const next = { ...def, assets: { ...def.assets, [assetId]: { name: file.name, mime: 'model/gltf-binary', data } }, parts: [...def.parts, part] }
      await loadGlbAssets(next, glbCache)
      edit(() => next)
      useEditorStore.getState().bumpGlb()
      select({ kind: 'part', id: part.id })
    } catch { setError('Não foi possível ler o modelo GLB.') }
  }

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
    {!readOnly && <div className="ce-add">
      {ADD.map(([kind, label]) => <button key={kind} className="ce-chip" onClick={() => add(kind)} title={`Adicionar ${label.toLowerCase()}`}><i>{KIND_GLYPH[kind]}</i>{label}</button>)}
      <button className="ce-chip" onClick={() => fileRef.current?.click()} title="Importar modelo GLB como peça"><i>{KIND_GLYPH.glb}</i>GLB…</button>
      <input ref={fileRef} type="file" accept=".glb,model/gltf-binary" hidden onChange={(event) => { void importGlb(event.target.files?.[0]); event.target.value = '' }} />
    </div>}
    {error && <p className="ce-error" role="alert">{error}</p>}
    <div className="ce-tree" role="tree" onDragOver={(event) => { if (dragId) event.preventDefault() }} onDrop={() => { if (dragId) reparent(dragId, null); setDragId(null); setOverId(null) }}>
      {rows.length === 0 && <p className="ce-empty">Sem peças. Adicione uma forma acima.</p>}
      {rows.map(({ part, depth }) => {
        const active = selection?.kind === 'part' && selection.id === part.id
        return <div key={part.id} role="treeitem" aria-selected={active} draggable={!readOnly}
          className={`ce-row${active ? ' is-active' : ''}${overId === part.id ? ' is-over' : ''}${part.visible ? '' : ' is-hidden'}`} style={{ paddingLeft: 6 + depth * 14 }}
          onClick={() => select({ kind: 'part', id: part.id })}
          onDragStart={() => setDragId(part.id)} onDragEnd={() => { setDragId(null); setOverId(null) }}
          onDragOver={(event) => { if (dragId) { event.preventDefault(); event.stopPropagation(); setOverId(part.id) } }}
          onDrop={(event) => { event.stopPropagation(); if (dragId) reparent(dragId, part.id); setDragId(null); setOverId(null) }}>
          <i className="ce-row-kind">{KIND_GLYPH[part.kind]}</i>
          {renaming === part.id
            ? <input autoFocus className="dx-input ce-rename" defaultValue={part.name} onClick={(event) => event.stopPropagation()}
                onBlur={(event) => { edit((current) => patchPart(current, part.id, { name: event.target.value.trim() || part.name })); setRenaming(null) }}
                onKeyDown={(event) => { if (event.key === 'Enter') (event.target as HTMLInputElement).blur(); if (event.key === 'Escape') setRenaming(null) }} />
            : <span className="ce-row-name" onDoubleClick={() => !readOnly && setRenaming(part.id)} title="Duplo clique para renomear">{part.name}</span>}
          {def.lights.some((light) => light.partId === part.id) && <i className="ce-row-badge" title="Zona luminosa">✦</i>}
          <button className="ce-icon" title={part.visible ? 'Ocultar' : 'Mostrar'} aria-label={part.visible ? 'Ocultar' : 'Mostrar'} disabled={readOnly} onClick={(event) => { event.stopPropagation(); edit((current) => patchPart(current, part.id, { visible: !part.visible })) }}>{part.visible ? '👁' : '⌀'}</button>
          <button className="ce-icon" title={part.locked ? 'Desbloquear' : 'Bloquear'} aria-label={part.locked ? 'Desbloquear' : 'Bloquear'} disabled={readOnly} onClick={(event) => { event.stopPropagation(); edit((current) => patchPart(current, part.id, { locked: !part.locked })) }}>{part.locked ? '🔒' : '🔓'}</button>
        </div>
      })}
    </div>
    {selectedPart && !readOnly && <div className="ce-left-actions">
      <button className="dx-btn dx-btn-secondary dx-btn-sm" onClick={() => { const result = duplicatePart(def, selectedPart.id); if (result) { edit(() => result.def); select({ kind: 'part', id: result.id }) } }}>Duplicar</button>
      <button className="dx-btn dx-btn-secondary dx-btn-sm" title="Cria um grupo pai à volta desta peça" onClick={() => {
        const group = { ...defaultPart('group', null, 'Grupo'), parentId: selectedPart.parentId, position: [...selectedPart.position] as PartDef['position'] }
        edit((current) => ({ ...current, parts: [...current.parts.map((part) => (part.id === selectedPart.id ? { ...part, parentId: group.id, position: [0, 0, 0] as PartDef['position'] } : part)), group] }))
        select({ kind: 'part', id: group.id })
      }}>Agrupar</button>
      <button className="dx-btn dx-btn-danger dx-btn-sm" onClick={() => { edit((current) => removeParts(current, [selectedPart.id])); select(null) }}>Eliminar</button>
    </div>}
    <div className="ce-left-lists">
      <div className="ce-panel-head"><strong>Bornes</strong><span>{def.terminals.length}</span></div>
      {def.terminals.map((terminal) => <button key={terminal.id} className={`ce-row ce-row-btn${selection?.kind === 'terminal' && selection.id === terminal.id ? ' is-active' : ''}`}
        onClick={() => useEditorStore.getState().set({ selection: { kind: 'terminal', id: terminal.id }, tab: 'terminals' })}><i className="ce-dot" style={{ background: terminal.color }} /><span className="ce-row-name">{terminal.label} · {terminal.name}</span></button>)}
      {def.terminals.length === 0 && <p className="ce-empty">Sem bornes.</p>}
      <div className="ce-panel-head"><strong>Luzes</strong><span>{def.lights.length}</span></div>
      {def.lights.map((light) => <button key={light.id} className={`ce-row ce-row-btn${selection?.kind === 'light' && selection.id === light.id ? ' is-active' : ''}`}
        onClick={() => useEditorStore.getState().set({ selection: { kind: 'light', id: light.id }, tab: 'lights' })}><i className="ce-dot" style={{ background: light.color }} /><span className="ce-row-name">{light.name}</span></button>)}
      {def.lights.length === 0 && <p className="ce-empty">Sem zonas luminosas.</p>}
    </div>
  </aside>
}
