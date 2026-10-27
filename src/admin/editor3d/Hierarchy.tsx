import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { ControlDef, DisplayDef, PartDef, Vec3 } from '../../catalog/types'
import * as THREE from 'three'
import { IconArrowLeft, IconChevronDown, IconChevronLeft, IconChevronRight, IconClose, IconSearch, IconGrid, IconLayers, IconBox, IconCylinder, IconEye, IconEyeOff, IconFocus, IconGroup, IconLock, IconModel, IconSparkle, IconMonitor, IconSphere, IconCone, IconTorus, IconUnlock } from '../../ui/icons'
import { patchPart, useEditorStore } from './editorStore'
import type { Face } from '../../catalog/terminalProfiles'
import { faceOfNormal } from './terminalOps'
import { deleteSelection } from './partActions'
import { ancestorsOf, isPartLocked, normalizeText, rangeBetween, visibleRows } from './selectionOps'
import { areaThumbnail, partThumbnail } from './partThumb'
import { partWorldMatrix, reparentPartPreservingWorld } from './partTransforms'

/** Miniatura 3D da peça (cai para o ícone da forma quando não há imagem). */
function PartThumb({ partId, kind, size }: { partId: string; kind: PartDef['kind']; size: number }) {
  const def = useEditorStore((s) => s.def)
  const glbRevision = useEditorStore((s) => s.glbRevision)
  const url = useMemo(() => partThumbnail(def, partId, undefined, glbRevision), [def, partId, glbRevision])
  const Icon = KIND_ICON[kind]
  if (!url) return <i className="ce-row-kind" style={{ width: size, height: size }}><Icon size={Math.round(size * 0.62)} /></i>
  return <img className="ce-row-thumb" src={url} alt="" width={size} height={size} loading="lazy" />
}

/** Miniatura 3D de um controlo (botão, seletor) a partir dos nós que move. */
function ControlThumb({ partId, nodes, hitArea, size = 34 }: { partId: string; nodes?: string[]; hitArea?: ControlDef['hitArea']; size?: number }) {
  const def = useEditorStore((s) => s.def)
  const glbRevision = useEditorStore((s) => s.glbRevision)
  const url = useMemo(() => {
    if (!partId) return null
    if (hitArea) {
      try {
        const matrix = partWorldMatrix(def, partId)
        const position = new THREE.Vector3(...hitArea.position).applyMatrix4(matrix).toArray() as Vec3
        const normal = new THREE.Vector3(0, 0, 1).applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(matrix)).toArray() as Vec3
        const linear = new THREE.Matrix3().setFromMatrix4(matrix)
        const width = new THREE.Vector3(hitArea.size[0], 0, 0).applyMatrix3(linear).length()
        const height = new THREE.Vector3(0, hitArea.size[1], 0).applyMatrix3(linear).length()
        return areaThumbnail(def, position, normal, width, height, glbRevision)
      } catch { return null }
    }
    return partThumbnail(def, partId, nodes, glbRevision)
  }, [def, partId, nodes, hitArea, glbRevision])
  if (!url) return <i className="ce-row-kind" style={{ width: size, height: size }}><IconFocus size={13} /></i>
  return <img className="ce-row-thumb" src={url} alt="" width={size} height={size} loading="lazy" />
}

/** Miniatura 3D da zona do ecrã, vista a direito pela sua normal. */
function DisplayThumb({ display, size = 34 }: { display: DisplayDef; size?: number }) {
  const def = useEditorStore((s) => s.def)
  const glbRevision = useEditorStore((s) => s.glbRevision)
  const url = useMemo(() => areaThumbnail(def, display.position, display.normal, display.widthMm, display.heightMm, glbRevision), [def, display, glbRevision])
  if (!url) return <i className="ce-row-kind" style={{ width: size, height: size }}><IconMonitor size={13} /></i>
  return <img className="ce-row-thumb" src={url} alt="" width={size} height={size} loading="lazy" />
}

const FACE_ORDER: Face[] = ['front', 'back', 'left', 'right', 'top', 'bottom']
const FACE_LABEL: Record<Face, string> = { front: 'Frente', back: 'Trás', left: 'Esquerda', right: 'Direita', top: 'Topo', bottom: 'Base' }
const KIND_ICON: Record<PartDef['kind'], typeof IconBox> = { group: IconGroup, box: IconBox, cylinder: IconCylinder, sphere: IconSphere, cone: IconCone, torus: IconTorus, glb: IconModel }

type ElementCategory = 'all' | 'parts' | 'terminals' | 'controls' | 'displays' | 'lights'
const CATEGORIES: Array<[ElementCategory, string]> = [['all', 'Todos'], ['parts', 'Peças'], ['terminals', 'Bornes'], ['controls', 'Controlos'], ['displays', 'Ecrãs'], ['lights', 'Luzes']]

function ElementSection({ id, title, count, visible, searching, active, actions, children }: {
  id: string; title: string; count: number; visible: boolean; searching: boolean; active: string | false; actions?: ReactNode; children: ReactNode
}) {
  const [collapsed, setCollapsed] = useState(false)
  useEffect(() => { if (active) setCollapsed(false) }, [active])
  const expanded = searching || !collapsed
  return <section className={`ce-element-section ce-elements-${id}`} hidden={!visible} aria-label={title}>
    <div className="ce-panel-head ce-element-head">
      <button className="ce-section-toggle" aria-expanded={expanded} aria-controls={`ce-elements-${id}`} onClick={() => setCollapsed((value) => !value)}>
        {expanded ? <IconChevronDown size={11} /> : <IconChevronRight size={11} />}<strong>{title}</strong><span>{count}</span>
      </button>
      {actions}
    </div>
    {expanded && <div id={`ce-elements-${id}`}>{children}</div>}
  </section>
}

export default function Hierarchy({ collapsed: panelCollapsed = false, onToggle, onMobileClose, wireSlot }: {
  collapsed?: boolean
  onToggle: () => void
  onMobileClose: () => void
  /** Painel dos cabos no próprio painel esquerdo (em vez de um cartão sobre o canvas). */
  wireSlot?: ReactNode
}) {
  const def = useEditorStore((s) => s.def)
  const selection = useEditorStore((s) => s.selection)
  const mode = useEditorStore((s) => s.mode)
  const edit = useEditorStore((s) => s.edit)
  const select = useEditorStore((s) => s.select)
  const [renaming, setRenaming] = useState<string | null>(null)
  // Filtro por nome e grupos recolhidos: um GLB separado chega a dezenas de peças.
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<ElementCategory>('all')
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set())
  const treeRef = useRef<HTMLDivElement>(null)
  // Lista compacta ou cartões com a miniatura de cada peça.
  const [cards, setCards] = useState<boolean>(() => { try { return localStorage.getItem('dcsimu:ce:objcards') === '1' } catch { return false } })
  const chooseCards = (value: boolean) => { setCards(value); try { localStorage.setItem('dcsimu:ce:objcards', value ? '1' : '0') } catch { /* ignorar */ } }
  const [dragId, setDragId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)
  const readOnly = mode === 'simulate'
  const hiddenTerminals = useEditorStore((s) => s.hiddenTerminals)
  const setTerminalsHidden = useEditorStore((s) => s.setTerminalsHidden)
  const toggleTerminalHidden = useEditorStore((s) => s.toggleTerminalHidden)
  const allHidden = def.terminals.length > 0 && def.terminals.every((item) => hiddenTerminals.includes(item.id))
  // bornes agrupados por vista (face onde saem) ou por grupo funcional
  const [groupBy, setGroupBy] = useState<'view' | 'group'>(() => { try { return localStorage.getItem('dcsimu:ce:tgroup') === 'group' ? 'group' : 'view' } catch { return 'view' } })
  const chooseGroupBy = (value: 'view' | 'group') => { setGroupBy(value); try { localStorage.setItem('dcsimu:ce:tgroup', value) } catch { /* ignorar */ } }
  const needle = normalizeText(query.trim())
  const filtering = needle.length > 0
  const matches = (...values: Array<string | undefined>) => !needle || normalizeText(values.filter(Boolean).join(' ')).includes(needle)
  const matchingTerminals = def.terminals.filter((terminal) => matches(terminal.name, terminal.label, terminal.group, terminal.id))
  const matchingControls = (def.controls ?? []).filter((control) => matches(control.name, control.id))
  const matchingDisplays = (def.displays ?? []).filter((display) => matches(display.name, display.id))
  const matchingLights = def.lights.filter((light) => matches(light.name, light.id))
  const counts: Record<ElementCategory, number> = { all: def.parts.length + def.terminals.length + (def.controls?.length ?? 0) + (def.displays?.length ?? 0) + def.lights.length, parts: def.parts.length, terminals: def.terminals.length, controls: def.controls?.length ?? 0, displays: def.displays?.length ?? 0, lights: def.lights.length }
  const show = (kind: ElementCategory) => category === 'all' || category === kind
  useEffect(() => {
    if (!selection) return
    const selectedCategory: ElementCategory = selection.kind === 'part' ? 'parts' : selection.kind === 'terminal' ? 'terminals' : selection.kind === 'control' ? 'controls' : selection.kind === 'display' ? 'displays' : 'lights'
    setCategory((current) => current === 'all' || current === selectedCategory ? current : selectedCategory)
  }, [selection?.kind, selection?.id])
  const termGroups = useMemo(() => {
    const map = new Map<string, typeof def.terminals>()
    for (const terminal of matchingTerminals) {
      const key = groupBy === 'view' ? faceOfNormal(terminal.normal) : terminal.group ?? ''
      map.set(key, [...(map.get(key) ?? []), terminal])
    }
    const entries = [...map.entries()]
    if (groupBy === 'view') entries.sort((a, b) => FACE_ORDER.indexOf(a[0] as Face) - FACE_ORDER.indexOf(b[0] as Face))
    return entries
  }, [def.terminals, groupBy, needle])
  const groupName = (key: string) => groupBy === 'view' ? FACE_LABEL[key as Face] : key || 'Sem grupo'
  const selectedPart = selection?.kind === 'part' ? def.parts.find((part) => part.id === selection.id) : undefined
  const openProperties = () => window.dispatchEvent(new CustomEvent('ce-open-inspector'))
  // Peças abrangidas pela seleção múltipla (Ctrl/Shift + clique).
  const multi = useEditorStore((s) => s.multi)
  const selectedCount = selectedPart ? 1 + multi.filter((id) => id !== selectedPart.id).length : 0

  const rows = useMemo(() => visibleRows(def, { collapsed, needle, allowCollapse: !cards }), [def, collapsed, needle, cards])
  const groupIds = useMemo(() => def.parts.filter((part) => def.parts.some((child) => child.parentId === part.id)).map((part) => part.id), [def.parts])
  const allCollapsed = groupIds.length > 0 && groupIds.every((id) => collapsed.has(id))

  // Selecionar no viewport abre os grupos que escondem a peça e traz a linha à vista.
  const selectedId = selection?.kind === 'part' ? selection.id : null
  useEffect(() => {
    if (!selectedId) return
    const hidden = ancestorsOf(def, selectedId).filter((id) => collapsed.has(id))
    if (hidden.length) { setCollapsed((current) => { const next = new Set(current); hidden.forEach((id) => next.delete(id)); return next }); return }
    treeRef.current?.querySelector('.ce-row.is-active')?.scrollIntoView({ block: 'nearest' })
  }, [selectedId, collapsed]) // eslint-disable-line react-hooks/exhaustive-deps
  // F2 (atalho do editor) pede para renomear a peça selecionada.
  useEffect(() => {
    const handler = () => { const current = useEditorStore.getState(); const id = current.selection?.kind === 'part' ? current.selection.id : null; if (id && current.mode === 'edit') setRenaming(id) }
    window.addEventListener('ce-rename', handler)
    return () => window.removeEventListener('ce-rename', handler)
  }, [])

  const onRowClick = (event: Pick<React.MouseEvent, 'shiftKey' | 'ctrlKey' | 'metaKey'>, part: PartDef) => {
    // Shift+clique = intervalo na lista; Ctrl/⌘+clique = acrescenta ou retira uma peça.
    if (event.shiftKey && selectedPart) {
      const ids = rangeBetween(rows.map((row) => row.part.id), selectedPart.id, part.id)
      useEditorStore.getState().set({ selection: { kind: 'part', id: selectedPart.id }, multi: ids.filter((id) => id !== selectedPart.id) })
      return
    }
    select({ kind: 'part', id: part.id }, event.ctrlKey || event.metaKey)
  }

  const focusSelection = () => {
    useEditorStore.getState().cameraTo('fitSel')
    window.dispatchEvent(new CustomEvent('ce-open-canvas'))
  }
  const reparent = (id: string, parentId: string | null) => {
    const current = useEditorStore.getState().def
    const result = reparentPartPreservingWorld(current, id, parentId)
    if (result.error) { window.dispatchEvent(new CustomEvent('ce-flash', { detail: result.error })); return }
    if (result.def !== current) edit(() => result.def)
  }

  return <aside className={`ce-left${panelCollapsed ? ' is-collapsed' : ''}`} aria-label="Hierarquia">
    <div className="ce-hierarchy-title">
      {!panelCollapsed && <span className="ce-inspector-symbol" aria-hidden="true"><IconLayers size={16} /></span>}
      <div>
        <small style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--dx-ink-3)', fontSize: 9.5, letterSpacing: '.06em', textTransform: 'uppercase' }}><i className="ce-inspector-status" aria-hidden="true" />Hierarquia</small>
        <strong>Elementos</strong>
        <small>Modelo e interface física</small>
      </div>
      <span className="ce-hierarchy-count" aria-label={`${counts.all} elementos`}>{counts.all}</span>
      <span className="ce-collapsed-label"><IconLayers size={15} /><span>Elementos</span></span>
      <button className="ce-mobile-panel-close" type="button" aria-label="Fechar hierarquia e voltar ao canvas" title="Fechar hierarquia e voltar ao canvas" onClick={onMobileClose}><IconArrowLeft size={13} /><span>Canvas</span></button>
      <button className="ce-panel-collapse" type="button" aria-label={panelCollapsed ? 'Expandir hierarquia' : 'Recolher hierarquia'} aria-expanded={!panelCollapsed} title={panelCollapsed ? 'Expandir hierarquia' : 'Recolher hierarquia'} onClick={onToggle}>{panelCollapsed ? <IconChevronRight size={15} /> : <IconChevronLeft size={15} />}</button>
      <button className="ce-icon ce-viewmode-toggle" title={cards ? 'Ver em lista' : 'Ver em cartões com miniatura'} aria-label={cards ? 'Ver em lista' : 'Ver em cartões'} onClick={() => chooseCards(!cards)}>{cards ? <IconLayers size={13} /> : <IconGrid size={13} />}</button>
    </div>
    {wireSlot && !panelCollapsed && <div className="ce-left-wires">{wireSlot}</div>}
    <div className="ce-search">
      <IconSearch size={11} />
      <input className="dx-input" type="search" value={query} placeholder="Pesquisar qualquer elemento…" aria-label="Pesquisar na hierarquia"
        onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Escape' && query) { event.preventDefault(); event.stopPropagation(); setQuery('') } }} />
      {query && <button className="ce-icon" aria-label="Limpar filtro" title="Limpar filtro" onClick={() => setQuery('')}><IconClose size={11} /></button>}
      {!cards && !filtering && groupIds.length > 0 && <button className="ce-icon" aria-label={allCollapsed ? 'Expandir todos os grupos' : 'Recolher todos os grupos'} title={allCollapsed ? 'Expandir todos os grupos' : 'Recolher todos os grupos'}
        onClick={() => setCollapsed(allCollapsed ? new Set() : new Set(groupIds))}>{allCollapsed ? <IconChevronRight size={12} /> : <IconChevronDown size={12} />}</button>}
    </div>
    <div className="ce-element-filters" role="group" aria-label="Filtrar elementos">
      {CATEGORIES.map(([key, label]) => <button key={key} type="button" aria-pressed={category === key} className={category === key ? 'is-on' : ''} onClick={() => setCategory(key)}><span className="ce-filter-label">{label}</span><span className="ce-filter-count">{counts[key]}</span></button>)}
    </div>
    {selection && <div className="ce-selection-actions"><button className="dx-btn dx-btn-secondary dx-btn-sm" onClick={focusSelection}><IconFocus size={13} />Enquadrar seleção</button><button className="dx-btn dx-btn-secondary dx-btn-sm" onClick={openProperties}>Propriedades</button></div>}
    <div className="ce-hierarchy-scroll">
    <ElementSection id="parts" title="Peças do modelo" count={rows.length} visible={show('parts')} searching={filtering} active={selection?.kind === 'part' && selection.id}>
    <div ref={treeRef} className={`ce-tree${cards ? ' is-cards' : ''}`} role="tree" aria-label="Objetos do componente" aria-multiselectable="true" onDragOver={(event) => { if (dragId) event.preventDefault() }} onDrop={() => { if (dragId) reparent(dragId, null); setDragId(null); setOverId(null) }}>
      {rows.length === 0 && <p className="ce-empty">{filtering ? `Nenhuma peça corresponde a «${query.trim()}».` : 'Sem peças. Adicione uma forma na barra de ferramentas.'}</p>}
      {rows.map(({ part, depth, hasChildren }) => {
        const active = selection?.kind === 'part' && (selection.id === part.id || multi.includes(part.id))
        return <div key={part.id} role="treeitem" tabIndex={0} aria-label={part.name} aria-selected={active} draggable={!readOnly && !isPartLocked(def, part.id)}
          className={`ce-row${active ? ' is-active' : ''}${overId === part.id ? ' is-over' : ''}${part.visible ? '' : ' is-hidden'}`} style={{ paddingLeft: 6 + depth * 14 }}
          aria-expanded={hasChildren && !cards ? !collapsed.has(part.id) || filtering : undefined}
          onClick={(event) => onRowClick(event, part)}
          onDoubleClick={(event) => { if (!(event.target as HTMLElement).closest('button,input')) { onRowClick(event, part); focusSelection() } }}
          onKeyDown={(event) => {
            if (event.target !== event.currentTarget) return
            if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); onRowClick(event, part); if (event.key === 'Enter') openProperties() }
            else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
              event.preventDefault(); event.stopPropagation()
              if (hasChildren) setCollapsed((current) => { const next = new Set(current); if (event.key === 'ArrowLeft') next.add(part.id); else next.delete(part.id); return next })
            }
            else if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Home' || event.key === 'End') {
              event.preventDefault(); event.stopPropagation()
              const items = Array.from(treeRef.current?.querySelectorAll<HTMLElement>('[role="treeitem"]') ?? [])
              const index = items.indexOf(event.currentTarget)
              const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : Math.max(0, Math.min(items.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)))
              items[next]?.focus()
            }
          }}
          onDragStart={() => setDragId(part.id)} onDragEnd={() => { setDragId(null); setOverId(null) }}
          onDragOver={(event) => { if (dragId) { event.preventDefault(); event.stopPropagation(); setOverId(part.id) } }}
          onDrop={(event) => { event.stopPropagation(); if (dragId) reparent(dragId, part.id); setDragId(null); setOverId(null) }}>
          {!cards && (hasChildren && !filtering
            ? <button className="ce-icon ce-twirl" aria-label={collapsed.has(part.id) ? `Expandir ${part.name}` : `Recolher ${part.name}`} title={collapsed.has(part.id) ? 'Expandir' : 'Recolher'}
                onClick={(event) => { event.stopPropagation(); setCollapsed((current) => { const next = new Set(current); if (!next.delete(part.id)) next.add(part.id); return next }) }}>
                {collapsed.has(part.id) ? <IconChevronRight size={10} /> : <IconChevronDown size={10} />}</button>
            : <span className="ce-twirl" aria-hidden="true" />)}
          <PartThumb partId={part.id} kind={part.kind} size={cards ? 46 : 20} />
          {renaming === part.id
            ? <input autoFocus className="dx-input ce-rename" defaultValue={part.name} onClick={(event) => event.stopPropagation()}
                onBlur={(event) => { edit((current) => patchPart(current, part.id, { name: event.target.value.trim() || part.name })); setRenaming(null) }}
                onKeyDown={(event) => { if (event.key === 'Enter') (event.target as HTMLInputElement).blur(); if (event.key === 'Escape') setRenaming(null) }} />
            : <span className="ce-row-name" title={readOnly ? part.name : `${part.name} · F2 para renomear`}>{part.name}</span>}
          {def.lights.some((light) => light.partId === part.id) && <i className="ce-row-badge" title="Zona luminosa"><IconSparkle size={12} /></i>}
          <button className="ce-icon" title={part.visible ? 'Ocultar' : 'Mostrar'} aria-label={part.visible ? 'Ocultar' : 'Mostrar'} disabled={readOnly} onClick={(event) => { event.stopPropagation(); edit((current) => patchPart(current, part.id, { visible: !part.visible })) }}>{part.visible ? <IconEye size={13} /> : <IconEyeOff size={13} />}</button>
          <button className="ce-icon" title={part.locked ? 'Desbloquear' : 'Bloquear'} aria-label={part.locked ? 'Desbloquear' : 'Bloquear'} disabled={readOnly} onClick={(event) => { event.stopPropagation(); edit((current) => patchPart(current, part.id, { locked: !part.locked })) }}>{part.locked ? <IconLock size={13} /> : <IconUnlock size={13} />}</button>
        </div>
      })}
    </div>
    {selectedPart && !readOnly && <div className="ce-left-actions">
      {/* Duplicar, agrupar e separar partes vivem na barra de ferramentas. */}
      <button className="dx-btn dx-btn-danger dx-btn-sm" onClick={deleteSelection}>Eliminar{selectedCount > 1 ? ` (${selectedCount})` : ''}</button>
    </div>}
    </ElementSection>
    <div className="ce-left-lists">
      <ElementSection id="displays" title="LCDs e ecrãs" count={matchingDisplays.length} visible={show('displays') && (category !== 'all' || counts.displays > 0)} searching={filtering} active={selection?.kind === 'display' && selection.id}>
      {matchingDisplays.map((display) => <button key={display.id} aria-pressed={selection?.kind === 'display' && selection.id === display.id} className={`ce-row ce-row-btn${selection?.kind === 'display' && selection.id === display.id ? ' is-active' : ''}`}
        onClick={() => { useEditorStore.getState().set({ selection: { kind: 'display', id: display.id }, tab: 'displays' }); openProperties() }}>
        <DisplayThumb display={display} /><span className="ce-row-name">{display.name}</span><small>{display.kind === 'lcd' ? 'LCD' : 'Texto'}</small>
      </button>)}
      {matchingDisplays.length === 0 && <p className="ce-empty">{filtering ? 'Nenhum ecrã corresponde à pesquisa.' : 'Sem ecrãs. Crie um no separador Ecrãs do inspetor.'}</p>}
      </ElementSection>
      <ElementSection id="controls" title="Botões e seletores" count={matchingControls.length} visible={show('controls') && (category !== 'all' || counts.controls > 0)} searching={filtering} active={selection?.kind === 'control' && selection.id}>
      <div className="ce-interface-grid">
      {matchingControls.map((control) => <button key={control.id} aria-pressed={selection?.kind === 'control' && selection.id === control.id} className={`ce-row ce-row-btn${selection?.kind === 'control' && selection.id === control.id ? ' is-active' : ''}`}
        onClick={() => { useEditorStore.getState().set({ selection: { kind: 'control', id: control.id }, tab: 'controls' }); openProperties() }}>
        <ControlThumb partId={control.partId} nodes={control.nodes} hitArea={control.hitArea} size={26} /><span className="ce-row-name">{control.name}</span>
      </button>)}
      </div>
      {matchingControls.length === 0 && <p className="ce-empty">{filtering ? 'Nenhum controlo corresponde à pesquisa.' : 'Sem controlos. Crie um no separador Botões do inspetor.'}</p>}
      </ElementSection>
      <ElementSection id="terminals" title="Bornes" count={matchingTerminals.length} visible={show('terminals')} searching={filtering} active={selection?.kind === 'terminal' && selection.id} actions={def.terminals.length > 0 && <button className="ce-icon ce-head-eye" aria-label={allHidden ? 'Mostrar todos os bornes' : 'Ocultar todos os bornes'} title={allHidden ? 'Mostrar todos os bornes [H]' : 'Ocultar todos os bornes [H]'} onClick={() => setTerminalsHidden(def.terminals.map((item) => item.id), !allHidden)}>{allHidden ? <IconEyeOff size={13} /> : <IconEye size={13} />}</button>}>
      {def.terminals.length > 1 && <div className="ce-seg" role="group" aria-label="Agrupar bornes por">
        <button className={groupBy === 'view' ? 'is-on' : ''} aria-pressed={groupBy === 'view'} onClick={() => chooseGroupBy('view')} title="Separar os bornes pela face/vista onde saem">Por vista</button>
        <button className={groupBy === 'group' ? 'is-on' : ''} aria-pressed={groupBy === 'group'} onClick={() => chooseGroupBy('group')} title="Separar os bornes pelo grupo funcional">Por grupo</button>
      </div>}
      {termGroups.map(([group, items]) => <div key={group || '_'} className="ce-tgroup">
        {(termGroups.length > 1 || groupBy === 'view') && <div className="ce-tgroup-head"><span>{groupName(group)}</span><em>{items.length}</em>
          {groupBy === 'view' && <button className="ce-icon" aria-label={`Ver a face ${groupName(group)}`} title={`Ver a face ${groupName(group)}`} onClick={() => useEditorStore.getState().cameraTo(group as Face)}><IconFocus size={12} /></button>}
          <button className="ce-icon" aria-label={items.every((item) => hiddenTerminals.includes(item.id)) ? `Mostrar bornes de ${groupName(group)}` : `Ocultar bornes de ${groupName(group)}`}
            title={items.every((item) => hiddenTerminals.includes(item.id)) ? 'Mostrar este grupo' : 'Ocultar este grupo'}
            onClick={() => setTerminalsHidden(items.map((item) => item.id), !items.every((item) => hiddenTerminals.includes(item.id)))}>
            {items.every((item) => hiddenTerminals.includes(item.id)) ? <IconEyeOff size={12} /> : <IconEye size={12} />}</button></div>}
        {items.map((terminal) => {
          const hidden = hiddenTerminals.includes(terminal.id)
          return <div key={terminal.id} role="button" aria-pressed={selection?.kind === 'terminal' && selection.id === terminal.id} tabIndex={0} className={`ce-row ce-row-btn${selection?.kind === 'terminal' && selection.id === terminal.id ? ' is-active' : ''}${hidden ? ' is-hidden' : ''}`}
            onClick={() => { useEditorStore.getState().set({ selection: { kind: 'terminal', id: terminal.id }, selectedWire: null, tab: 'terminals' }); openProperties() }}
            onKeyDown={(event) => { if (event.target !== event.currentTarget) return; if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); useEditorStore.getState().set({ selection: { kind: 'terminal', id: terminal.id }, selectedWire: null, tab: 'terminals' }); openProperties() } }}>
            <i className="ce-dot" style={{ background: terminal.color }} /><span className="ce-row-name">{terminal.label}{terminal.name && terminal.name !== terminal.label && <small> · {terminal.name}</small>}</span>
            <button className="ce-icon" title={hidden ? 'Mostrar borne' : 'Ocultar borne'} aria-label={hidden ? `Mostrar borne ${terminal.label}` : `Ocultar borne ${terminal.label}`}
              onClick={(event) => { event.stopPropagation(); toggleTerminalHidden(terminal.id) }}>{hidden ? <IconEyeOff size={13} /> : <IconEye size={13} />}</button>
          </div>
        })}
      </div>)}
      {matchingTerminals.length === 0 && <p className="ce-empty">{filtering ? `Nenhum borne corresponde a «${query.trim()}».` : 'Sem bornes.'}</p>}
      </ElementSection>
      <ElementSection id="lights" title="Luzes" count={matchingLights.length} visible={show('lights') && (category !== 'all' || counts.lights > 0)} searching={filtering} active={selection?.kind === 'light' && selection.id}>
      {matchingLights.map((light) => <button key={light.id} aria-pressed={selection?.kind === 'light' && selection.id === light.id} className={`ce-row ce-row-btn${selection?.kind === 'light' && selection.id === light.id ? ' is-active' : ''}`}
        onClick={() => { useEditorStore.getState().set({ selection: { kind: 'light', id: light.id }, tab: 'lights' }); openProperties() }}><i className="ce-dot" style={{ background: light.color }} /><span className="ce-row-name">{light.name}</span></button>)}
      {matchingLights.length === 0 && <p className="ce-empty">{filtering ? 'Nenhuma luz corresponde à pesquisa.' : 'Sem zonas luminosas. Crie uma no separador Luzes do inspetor.'}</p>}
      </ElementSection>
    </div>
    </div>
  </aside>
}
