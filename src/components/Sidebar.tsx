import CatalogInspector from '../catalog/CatalogInspector'
import { useCatalogStore } from '../catalog/registry'
import { hiddenCatalogTypes } from '../catalog/hidden'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useSimStore } from '../store/useSimStore'
import { disabledReason, useComponentSettings } from '../admin/componentSettings'
import { paletteGroups, TEMPLATES } from '../electrical/factory'
import type { ComponentType, TerminalElectricalClass, TerminalKind, TerminalType, Wire, WireColor } from '../types'
import { GAUGES, TERMINAL_KIND_LABEL, TERMINAL_TYPE_LABEL, WIRE_COLORS, WIRE_KIND_LABEL } from '../schematic/symbols'
import { terminalClassesCompatible, terminalDatasheetGuidance, terminalElectricalClassOf, TERMINAL_ELECTRICAL_CLASS_LABEL } from '../electrical/terminalClassification'
import LabelLibrary from './LabelLibrary'
import DatasheetPanel from './DatasheetPanel'
import { terminalConnections } from '../schematic/terminalConnections'
import { wireEndColor } from '../schematic/wireEndColor'
import { WIRE_END_OPTIONS, WireEndIcon, ConductorIcon } from '../schematic/wireEnds'
import { WIRE_KIND_COLOR } from '../store/useSimStore'
import { ComponentThumb } from '../three/componentThumbnails'
import { hasComponent3DModel, isMountingRail, MISSING_3D_MODEL_MESSAGE, SCHEMATIC_PX_PER_MM } from '../three/modelPaths'
import { clampRailLengthMm, DIN_RAIL_15X55, railSlotCount } from '../three/dinRailGeometry'
import { isRailMountable } from '../three/railMount'
import { componentEditorVersionOf, formatComponentUpdateDate } from '../three/componentRevisions'
import { IconSearch, IconLayers, IconPlus, IconCopy, IconLock, IconRotate, IconDelete, IconTag, IconChevronDown, IconProjects, IconCube } from '../ui/icons'

const label = 'dc-field-label'
const STATE_LABELS: Record<string, string> = {
  closed: 'Fechado', tripped: 'Disparado', poles: 'Polos', curve: 'Curva', inA: 'Corrente nominal (A)',
  powered: 'Alimentado', powerReady: 'Saída pronta (RDY)', watt: 'Potência (W)', energized: 'Energizado', pressed: 'Premido', running: 'Em funcionamento', presetMs: 'Tempo definido (ms)',
  elapsedMs: 'Tempo decorrido (ms)', triggered: 'Ativado', on: 'Ligado', enabled: 'Ativo',
  manufacturer: 'Fabricante', model: 'Modelo', mounting: 'Forma construtiva', frame: 'Carcaça IEC', phases: 'Fases',
  powerKw: 'Potência nominal (kW)', cv: 'Potência (cv)', rpm: 'Rotação nominal (rpm)', rpmVisual: 'Rotação visual',
  frequencyHz: 'Frequência (Hz)', voltage: 'Tensão nominal', currentA: 'Corrente nominal (A)', cosPhi: 'Fator de potência (cos φ)',
  torqueNm: 'Binário nominal (Nm)', massKg: 'Massa (kg)', direction: 'Sentido de rotação',
  color: 'Cor da luz', lamp: 'Fonte luminosa', mountingDiameterMm: 'Furação do painel (mm)',
  currentMa: 'Corrente máxima (mA)', serviceLifeHours: 'Vida útil (h)', protection: 'Proteção',
  operatingTemperature: 'Temperatura de serviço',
}
const PILOT_LIGHT_COLORS = [
  { name: 'Vermelho', value: '#ef4444' }, { name: 'Verde', value: '#22c55e' },
  { name: 'Amarelo', value: '#eab308' }, { name: 'Azul', value: '#3b82f6' },
  { name: 'Branco', value: '#f8fafc' }, { name: 'Laranja', value: '#f97316' },
] as const
const stateLabel = (key: string) => STATE_LABELS[key] ?? key.replace(/([a-z])([A-Z])/g, '$1 $2')


/**
 * Controles de camada (ordem de empilhamento) — funcionam tanto para
 * componentes quanto para cabos, já que ambos compartilham o mesmo `z`.
 */
function LayerButtons() {
  const btn = 'dc-btn flex-1 !px-1'
  return (
    <div>
      <label className={label}>
        <IconLayers size={11} className="inline-block mr-1 -mt-0.5" />
        Camada (frente / trás)
      </label>
      <div className="flex gap-1">
        <button className={btn} title="Trazer para frente" onClick={() => useSimStore.getState().bringSelectionToFront()}>⤒ Frente</button>
        <button className={btn} title="Avançar uma camada" onClick={() => useSimStore.getState().bringSelectionForward()}>↑</button>
        <button className={btn} title="Recuar uma camada" onClick={() => useSimStore.getState().sendSelectionBackward()}>↓</button>
        <button className={btn} title="Enviar para trás" onClick={() => useSimStore.getState().sendSelectionToBack()}>⤓ Trás</button>
      </div>
    </div>
  )
}

/** Cartão reutilizado nas categorias, favoritos e histórico recente. */
function LibraryTile({ type, name, favorite, placing, onPick, onQuickAdd, onFavorite, onRecent }: {
  type: ComponentType; name: string; favorite: boolean; placing: boolean
  onPick: () => void; onQuickAdd: () => void; onFavorite: () => void; onRecent: () => void
}) {
  const disabledNote = useComponentSettings((s) => disabledReason(s.disabled, type))
  const available = hasComponent3DModel(type) && !disabledNote
  const lockMessage = disabledNote ?? MISSING_3D_MODEL_MESSAGE
  const title = available
    ? `${name} — clique para posicionar · duplo clique para inserir · arraste para o esquema`
    : `${name} — ${lockMessage}`
  return <div className={`dc-library-tile ${placing ? 'is-placing' : ''} ${available ? '' : 'is-locked'}`} title={title}>
    <button
      type="button"
      className="dc-library-tile-main"
      title={title}
      aria-label={available ? `Posicionar ${name} no esquema` : `${name}. ${lockMessage}`}
      aria-disabled={!available}
      disabled={!available}
      onClick={() => { if (available) { onRecent(); onPick() } }}
      onDoubleClick={() => { if (available) { onRecent(); onQuickAdd() } }}
      draggable={available}
      onDragStart={(e) => {
        if (!available) { e.preventDefault(); return }
        const st = useSimStore.getState()
        st.setPlacingType(null)
        st.setDragType(type)
        e.dataTransfer.setData('application/x-dcsimu-component', type)
        e.dataTransfer.setData('text/plain', type)
        e.dataTransfer.effectAllowed = 'copy'
        const chip = document.createElement('div')
        chip.textContent = `+ ${name}`
        chip.style.cssText = 'position:fixed;top:-100px;left:-100px;padding:3px 8px;border-radius:999px;background:#2f6bff;color:#fff;font:600 11px Inter,system-ui,sans-serif;white-space:nowrap'
        document.body.appendChild(chip)
        e.dataTransfer.setDragImage(chip, -12, -12)
        window.setTimeout(() => chip.remove(), 0)
      }}
      onDragEnd={(e) => { if (available && e.dataTransfer.dropEffect !== 'none') onRecent(); useSimStore.getState().setDragType(null) }}
    >
      <span className="dc-library-tile-image">
        <ComponentThumb type={type} size={58} />
        {!available && <span className="dc-library-tile-lock" aria-hidden="true"><IconLock size={16} /></span>}
      </span>
      <span className="dc-library-tile-name">{name}</span>
      {!available && <span className="dc-library-tile-status">{disabledNote ? 'Desativado' : 'Aguarda GLB 3D'}</span>}
    </button>
    <button type="button" className={`dc-library-tile-favorite ${favorite ? 'is-favorite' : ''}`} onClick={onFavorite} aria-pressed={favorite} aria-label={`${favorite ? 'Remover' : 'Adicionar'} ${name} ${favorite ? 'dos' : 'aos'} favoritos`} title={favorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}>{favorite ? '★' : '☆'}</button>
  </div>
}

/**
 * Painel esquerdo: biblioteca de componentes (clique adiciona ao esquema) e
 * inspetor completo do que está selecionado (componente, borne ou cabo).
 */
export default function Sidebar({ width = 300 }: { width?: number }) {
  const components = useSimStore((s) => s.components)
  const grid = useSimStore((s) => s.grid)
  const wires = useSimStore((s) => s.wires)
  const selectedIds = useSimStore((s) => s.selectedComponentIds)
  const selectedWireId = useSimStore((s) => s.selectedWireId)
  const selectedTerminalId = useSimStore((s) => s.selectedTerminalId)
  const [tab, setTab] = useState<'library' | 'inspector'>('library')
  const inspectorRef = useRef<HTMLDivElement>(null)
  const [filter, setFilter] = useState('')
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => new Set(paletteGroups().map((g) => g.group).filter((g) => !['protection', 'command'].includes(g))))
  const [favorites, setFavorites] = useState<ComponentType[]>(() => {
    try { return (JSON.parse(localStorage.getItem('dcsimu:library:favorites') ?? '[]') as ComponentType[]).map((type) => (type as string) === 'powerSupplyProauto24B' ? 'powerSupplyProauto24A' : type) }
    catch { return [] }
  })
  const [recent, setRecent] = useState<ComponentType[]>(() => {
    try { return (JSON.parse(localStorage.getItem('dcsimu:library:recent') ?? '[]') as ComponentType[]).map((type) => (type as string) === 'powerSupplyProauto24B' ? 'powerSupplyProauto24A' : type).filter((type) => !!TEMPLATES[type]).slice(0, 8) }
    catch { return [] }
  })
  const markRecent = (type: ComponentType) => setRecent((current) => {
    const next = [type, ...current.filter((item) => item !== type)].slice(0, 8)
    try { localStorage.setItem('dcsimu:library:recent', JSON.stringify(next)) } catch { /* armazenamento indisponível */ }
    return next
  })
  const toggleFavorite = (type: ComponentType) => setFavorites((current) => {
    const next = current.includes(type) ? current.filter((t) => t !== type) : [...current, type]
    try { localStorage.setItem('dcsimu:library:favorites', JSON.stringify(next)) } catch { /* storage indisponível */ }
    return next
  })
  const toggleGroup = (group: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(group)) next.delete(group)
      else next.add(group)
      return next
    })
  }

  useEffect(() => {
    if (selectedIds.length > 0 || selectedWireId || selectedTerminalId) {
      setTab('inspector')
    }
  }, [selectedIds.length, selectedWireId, selectedTerminalId])

  useEffect(() => { if (inspectorRef.current) inspectorRef.current.scrollTop = 0 }, [selectedIds[0], selectedWireId, selectedTerminalId])

  const catalogRevision = useCatalogStore((s) => s.revision)
  const groups = useMemo(() => paletteGroups(), [catalogRevision])
  const disabledComponents = useComponentSettings((s) => s.disabled)
  const modelReadyCount = useMemo(() => (Object.keys(TEMPLATES) as ComponentType[]).filter((type) => hasComponent3DModel(type) && !(type in disabledComponents) && !hiddenCatalogTypes.has(type)).length, [disabledComponents, catalogRevision])
  const lockedCount = Object.keys(TEMPLATES).filter((type) => !hiddenCatalogTypes.has(type)).length - modelReadyCount
  const selectedComponent = components.find((c) => c.id === selectedIds[0])
  const selectedWire = wires.find((w) => w.id === selectedWireId)
  const wireFromTerminal = selectedWire ? components.flatMap((c) => c.terminals).find((t) => t.id === selectedWire.fromTerminalId) : undefined
  const wireToTerminal = selectedWire ? components.flatMap((c) => c.terminals).find((t) => t.id === selectedWire.toTerminalId) : undefined
  const wireFromOwner = wireFromTerminal ? components.find((component) => component.id === wireFromTerminal.componentId) : undefined
  const wireToOwner = wireToTerminal ? components.find((component) => component.id === wireToTerminal.componentId) : undefined
  const wireFromClass = wireFromOwner && wireFromTerminal ? terminalElectricalClassOf(wireFromOwner, wireFromTerminal) : undefined
  const wireToClass = wireToOwner && wireToTerminal ? terminalElectricalClassOf(wireToOwner, wireToTerminal) : undefined
  const wireClassCompatible = !wireFromClass || !wireToClass || terminalClassesCompatible(wireFromClass, wireToClass)
  const selectedTerminal = components.flatMap((c) => c.terminals).find((t) => t.id === selectedTerminalId)
  const terminalOwner = selectedTerminal ? components.find((c) => c.id === selectedTerminal.componentId) : undefined
  const connections = selectedTerminal ? terminalConnections(selectedTerminal.id, components, wires) : []
  const wireEditBaselineRef = useRef<{ id: string; wire: Wire } | null>(null)
  const [wireEditDirty, setWireEditDirty] = useState(false)

  useEffect(() => {
    wireEditBaselineRef.current = selectedWire ? { id: selectedWire.id, wire: structuredClone(selectedWire) } : null
    setWireEditDirty(false)
  }, [selectedWire?.id])

  const patchSelectedWire = (patch: Partial<Wire>) => {
    if (!selectedWire) return
    const store = useSimStore.getState()
    if (!wireEditDirty) store.commitHistory()
    store.updateWire(selectedWire.id, patch)
    setWireEditDirty(true)
  }
  const saveWireChanges = () => {
    if (!selectedWire) return
    const current = useSimStore.getState().wires.find((wire) => wire.id === selectedWire.id)
    if (current) wireEditBaselineRef.current = { id: current.id, wire: structuredClone(current) }
    setWireEditDirty(false)
    useSimStore.getState().pushEvent('info', `Alterações do cabo ${selectedWire.number ?? selectedWire.id} guardadas no projeto.`)
  }
  const cancelWireChanges = () => {
    const baseline = wireEditBaselineRef.current
    if (!baseline) return
    useSimStore.getState().updateWire(baseline.id, structuredClone(baseline.wire))
    useSimStore.getState().step()
    setWireEditDirty(false)
    useSimStore.getState().pushEvent('info', 'Edição do cabo cancelada; os valores anteriores foram repostos.')
  }

  const placingType = useSimStore((s) => s.placingType)
  const canInsert = (type: ComponentType) => hasComponent3DModel(type) && !(type in disabledComponents)

  /** Clique = modo "posicionar com o mouse" (fantasma segue o cursor no
   *  esquema). Clique novamente no mesmo item cancela. */
  const add = (type: ComponentType) => {
    if (!canInsert(type)) return
    const st = useSimStore.getState()
    st.setPlacingType(st.placingType === type ? null : type)
  }

  /** Duplo clique = insere imediatamente na próxima posição livre. */
  const addImmediate = (type: ComponentType) => {
    if (!canInsert(type)) return
    const st = useSimStore.getState()
    st.setPlacingType(null)
    const n = st.components.length
    st.addComponent(type, 80 + (n % 6) * 160, 90 + Math.floor(n / 6) * 150)
    setTab('inspector')
  }

  const filtered = useMemo(() => {
    if (!filter.trim()) return groups
    const f = filter.trim().toLocaleLowerCase('pt-PT')
    return groups
      .map((g) => ({ ...g, items: g.items.filter((i) => i.name.toLocaleLowerCase('pt-PT').includes(f) || i.type.toLowerCase().includes(f) || g.group.toLocaleLowerCase('pt-PT').includes(f)) }))
      .filter((g) => g.items.length)
  }, [groups, filter])
  const filteredItems = filtered.flatMap((group) => group.items)
  const filteredReadyCount = filteredItems.filter((item) => canInsert(item.type)).length
  const filteredLockedCount = filteredItems.length - filteredReadyCount

  return (
    <div className="shrink-0 border-r border-line bg-surface-panel flex flex-col h-full min-h-0" style={{ width }}>
      {/* abas */}
      <div className="flex items-end border-b border-line bg-surface-rail px-1 pt-1">
        <button onClick={() => setTab('library')} className={`dc-tab ${tab === 'library' ? 'dc-tab-active' : ''}`}>
          Biblioteca <span className="text-ink-300 font-normal">({modelReadyCount}/{Object.keys(TEMPLATES).length})</span>
        </button>
        <button onClick={() => setTab('inspector')} className={`dc-tab ${tab === 'inspector' ? 'dc-tab-active' : ''}`}>
          Inspetor
        </button>
      </div>

      {tab === 'library' && (
        <>
          <div className="p-2 border-b border-line">
            <div className="relative">
              <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Pesquisar nome, tipo ou categoria…" aria-label="Pesquisar componentes" className="dc-input !pl-7 !pr-7" />
              {filter && <button className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-500" title="Limpar pesquisa" onClick={() => setFilter('')}>×</button>}
              <IconSearch size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-ink-300 pointer-events-none" />
            </div>
          </div>
          <div className="dc-library-model-notice" role="note">
            <IconLock size={13} />
            <span><strong>{lockedCount} componentes bloqueados.</strong> Sem GLB 3D real ou desativados pelo administrador, não podem ser inseridos.</span>
          </div>
          <div className="flex items-center justify-between px-2 py-1 border-b border-line text-[10px] text-ink-500">
            <span>{filteredReadyCount} com 3D · {filteredLockedCount} bloqueados{filter ? ' na pesquisa' : ''}</span>
            <span className="flex gap-2"><button onClick={() => setCollapsedGroups(new Set())}>Expandir</button><button onClick={() => setCollapsedGroups(new Set(groups.map((g) => g.group)))}>Recolher</button></span>
          </div>
          {placingType && <div className="p-2 bg-brand-50 text-brand-700 text-[11px] flex gap-2 items-center"><span className="flex-1">A posicionar: {TEMPLATES[placingType]?.paletteName ?? placingType}</span><button className="dc-btn !h-6" onClick={() => useSimStore.getState().setPlacingType(null)}>Cancelar</button></div>}
          <div className="flex-1 overflow-y-auto p-2 min-h-0 dc-library-scroll">
            {recent.length > 0 && !filter && <section className="dc-library-section"><div className="dc-library-section-title">◴ Recentes <span>{recent.length}</span></div><div className="dc-library-recent">{recent.map((type) => <LibraryTile key={type} type={type} name={TEMPLATES[type].paletteName} favorite={favorites.includes(type)} placing={placingType === type} onPick={() => add(type)} onQuickAdd={() => addImmediate(type)} onFavorite={() => toggleFavorite(type)} onRecent={() => markRecent(type)} />)}</div></section>}
            {favorites.length > 0 && !filter && <section className="dc-library-section"><div className="dc-library-section-title">★ Favoritos <span>{favorites.length}</span></div><div className="dc-library-grid">{favorites.filter((type) => TEMPLATES[type]).map((type) => <LibraryTile key={type} type={type} name={TEMPLATES[type].paletteName} favorite placing={placingType === type} onPick={() => add(type)} onQuickAdd={() => addImmediate(type)} onFavorite={() => toggleFavorite(type)} onRecent={() => markRecent(type)} />)}</div></section>}
            {!filtered.length && (
              <div className="dc-empty-state">
                <span className="dc-empty-state-icon"><IconSearch size={18} /></span>
                <strong>Nenhum componente encontrado</strong>
                <p>Não há resultados para «{filter.trim()}». Experimente outro termo, o nome do fabricante ou a categoria.</p>
                <button className="dc-btn dc-btn-primary" onClick={() => setFilter('')}>Limpar pesquisa</button>
              </div>
            )}
            {filtered.map((g) => {
              const isCollapsed = !filter.trim() && collapsedGroups.has(g.group)
              return <section className="dc-library-folder" key={g.group}>
                <button type="button" aria-expanded={!isCollapsed} className="dc-library-folder-head" onClick={() => toggleGroup(g.group)} title={`${isCollapsed ? 'Expandir' : 'Recolher'} ${g.group}`}>
                  <span className="dc-library-folder-icon"><IconProjects size={16} /></span><strong>{g.group}</strong><span className="dc-library-folder-count">{g.items.length}</span><IconChevronDown size={13} className={`dc-library-folder-chevron ${isCollapsed ? '' : 'is-open'}`} />
                </button>
                {!isCollapsed && <div className="dc-library-grid">{g.items.map((it) => <LibraryTile key={it.type} type={it.type} name={it.name} favorite={favorites.includes(it.type)} placing={placingType === it.type} onPick={() => add(it.type)} onQuickAdd={() => addImmediate(it.type)} onFavorite={() => toggleFavorite(it.type)} onRecent={() => markRecent(it.type)} />)}</div>}
              </section>
            })}
             <p className="text-ink-400 text-[10px] leading-relaxed mt-2 p-2 bg-surface-sunken/60 rounded-md border border-line-soft">
               Nos itens <b className="text-ink-500">com GLB 3D</b>, clique ou arraste: o componente aparece em pré-visualização no esquema
               e fica onde <b className="text-ink-500">soltar/clicar</b> (encaixa na malha). O cadeado indica que o modelo 3D ainda falta e bloqueia a inserção.
               Duplo clique insere já no esquema · Shift+clique posiciona vários · Esc cancela.
             </p>
          </div>
        </>
      )}

      {tab === 'inspector' && (
        <div ref={inspectorRef} className="dc-inspector-scroll flex-1 overflow-y-auto p-3 text-xs text-ink-700 space-y-3 min-h-0">
          {!selectedComponent && !selectedWire && !selectedTerminal && (
            <div className="h-full flex items-center justify-center">
              <div className="dc-empty-state">
                <span className="dc-empty-state-icon"><IconLayers size={18} /></span>
                <strong>Nada selecionado</strong>
                <p>Escolha um componente, um cabo ou um borne — no esquema ou no painel 3D — para editar as propriedades aqui.</p>
                <span className="dc-empty-state-hint">Dica: <kbd>Esc</kbd> limpa a seleção</span>
              </div>
            </div>
          )}

          {/* ------------------------------------------------ componente */}
          {selectedComponent && (
            <section key={selectedComponent.id} className="dc-inspector-component">
              <header className="dc-inspector-hero">
                <div className="dc-inspector-hero-thumb"><ComponentThumb type={selectedComponent.type} size={42} /></div>
                <div className="min-w-0 flex-1"><strong className="block text-sm text-ink-900 truncate">{selectedComponent.ref || 'Sem referência'} <span className="text-[9px] text-blue-600">v{componentEditorVersionOf(selectedComponent)}</span></strong><span className="block text-[10px] text-ink-500 truncate">{selectedComponent.label}</span><time className="block text-[8px] text-ink-400 truncate" dateTime={selectedComponent.editorUpdatedAt}>Atualizado {formatComponentUpdateDate(selectedComponent.editorUpdatedAt)}</time></div>
                <span className={`dc-inspector-indicator ${selectedComponent.state.energized ? 'is-on' : ''}`} title={selectedComponent.state.energized ? 'Energizado' : 'Desligado'} />
              </header>
              <div className="text-[10px] font-mono text-ink-400 px-1 truncate">{selectedComponent.type} · {selectedComponent.terminals.length} bornes{selectedComponent.locked ? ' · bloqueado' : ''}</div>
              <details className="dc-inspector-group" open><summary>Identificação</summary><div className="dc-inspector-group-body">

              <div>
                <label className={label}>TAG / referência</label>
                <input className="dc-input" value={selectedComponent.ref} onChange={(e) => useSimStore.getState().updateComponent(selectedComponent.id, { ref: e.target.value })} />
              </div>
              <div>
                <label className={label}>Descrição</label>
                <input className="dc-input" value={selectedComponent.label} onChange={(e) => useSimStore.getState().updateComponent(selectedComponent.id, { label: e.target.value })} />
              </div>
              </div></details>
              {selectedComponent.catalog && <CatalogInspector component={selectedComponent} />}
              <DatasheetPanel type={selectedComponent.type} />
              <details className="dc-inspector-group" open><summary>Posição e aparência</summary><div className="dc-inspector-group-body">
              <LayerButtons />
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={label}>X</label>
                  <input
                    type="number"
                    className="dc-input"
                    value={Math.round(selectedComponent.schematicX)}
                    onChange={(e) => useSimStore.getState().updateComponent(selectedComponent.id, { schematicX: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <label className={label}>Y</label>
                  <input
                    type="number"
                    className="dc-input"
                    value={Math.round(selectedComponent.schematicY)}
                    onChange={(e) => useSimStore.getState().updateComponent(selectedComponent.id, { schematicY: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <label className={label}>Largura</label>
                  <input type="number" className="dc-input" value={selectedComponent.w} onChange={(e) => useSimStore.getState().updateComponent(selectedComponent.id, { w: Math.max(30, Number(e.target.value)) })} />
                </div>
                <div>
                  <label className={label}>Altura</label>
                  <input type="number" className="dc-input" value={selectedComponent.h} onChange={(e) => useSimStore.getState().updateComponent(selectedComponent.id, { h: Math.max(30, Number(e.target.value)) })} />
                </div>
                <div>
                  <label className={label}>Rotação</label>
                  <select className="dc-select" value={selectedComponent.rotation} onChange={(e) => useSimStore.getState().updateComponent(selectedComponent.id, { rotation: Number(e.target.value) })}>
                    {[0, 90, 180, 270].map((r) => (
                      <option key={r} value={r}>{r}°</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={label}>Cor do corpo</label>
                  <input
                    type="color"
                    className="w-full h-[26px] rounded-[5px] border border-line cursor-pointer"
                    value={selectedComponent.bodyColor ?? '#e2e8f0'}
                    onChange={(e) => useSimStore.getState().updateComponent(selectedComponent.id, { bodyColor: e.target.value })}
                  />
                </div>
              </div>

              {isMountingRail(selectedComponent.type) && (() => {
                const length = clampRailLengthMm(selectedComponent.state.lengthMm)
                const setLength = (value: number) => useSimStore.getState().setRailLength(selectedComponent.id, value, 'left')
                const attached = components.filter((item) => item.railId === selectedComponent.id)
                const magnet = grid.railMagnet !== false
                return <div className="dc-rail-length">
                  <label className={label}>Comprimento da calha (mm)</label>
                  <div className="dc-rail-length-row">
                    <input type="number" className="dc-input" min={DIN_RAIL_15X55.minLengthMm} max={DIN_RAIL_15X55.maxLengthMm} step={5} value={length} onChange={(e) => setLength(Number(e.target.value))} />
                    <input type="range" min={DIN_RAIL_15X55.minLengthMm} max={DIN_RAIL_15X55.maxLengthMm} step={5} value={length} aria-label="Comprimento da calha" onChange={(e) => setLength(Number(e.target.value))} />
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {[100, 250, 500, 1000, 2000].map((mm) => <button key={mm} className={`dc-btn${length === mm ? ' dc-btn-primary' : ''}`} onClick={() => setLength(mm)}>{mm >= 1000 ? `${mm / 1000} m` : `${mm} mm`}</button>)}
                  </div>
                  <label className="flex items-center justify-between gap-2 px-1 py-0.5 rounded hover:bg-slate-50" title="Ao largar um equipamento de calha perto de uma calha, centra-o e fixa-o (cola aos vizinhos e às pontas).">
                    <span className="text-ink-500">Imã automático de calha</span>
                    <input type="checkbox" checked={magnet} onChange={(e) => useSimStore.getState().setGrid({ railMagnet: e.target.checked })} />
                  </label>
                  <div className="flex flex-wrap gap-1">
                    <button className="dc-btn" title="Centra e fixa nesta e noutras calhas todos os equipamentos de calha ao alcance" onClick={() => {
                      const n = useSimStore.getState().snapToRails(undefined, true)
                      useSimStore.getState().pushEvent('info', n ? `${n} equipamento(s) centrado(s) e fixo(s) nas calhas.` : 'Nenhum equipamento de calha ao alcance de uma calha. Aproxime-os da calha e repita.')
                    }}>Centrar e fixar equipamentos</button>
                    <button className="dc-btn" disabled={!attached.length} onClick={() => useSimStore.getState().detachFromRail(attached.map((item) => item.id))}>Soltar todos</button>
                  </div>
                  <small className="text-ink-400">{attached.length ? `${attached.length} equipamento(s) fixo(s): ${attached.map((item) => item.ref).join(', ')}. ` : 'Sem equipamentos fixos. '}Arraste as pontas da calha no Esquema 2D para alterar o comprimento.</small>
                  <small className="text-ink-400">Perfil 15 × 5,5 mm · {railSlotCount(length)} furos oblongos (passo {DIN_RAIL_15X55.slotPitch} mm) · {DIN_RAIL_15X55.minLengthMm}–{DIN_RAIL_15X55.maxLengthMm} mm</small>
                </div>
              })()}

              {isRailMountable(selectedComponent) && (() => {
                const rail = components.find((item) => item.id === selectedComponent.railId)
                return <div className="dc-rail-length">
                  <label className={label}>Calha DIN</label>
                  <div className="flex flex-wrap items-center gap-1">
                    <span className="text-ink-500">{rail ? `Fixo em ${rail.ref} · ${selectedComponent.railOffsetMm ?? 0} mm do início` : 'Solto (sem calha)'}</span>
                    <button className="dc-btn" onClick={() => {
                      const n = useSimStore.getState().snapToRails([selectedComponent.id], true)
                      if (!n) useSimStore.getState().pushEvent('info', 'Nenhuma calha ao alcance. Aproxime o equipamento de uma calha DIN.')
                    }}>Centrar e fixar</button>
                    {rail && <button className="dc-btn" onClick={() => useSimStore.getState().detachFromRail([selectedComponent.id])}>Soltar</button>}
                  </div>
                </div>
              })()}

              <div className="flex flex-wrap gap-1">
                <button className="dc-btn" onClick={() => useSimStore.getState().rotateComponent(selectedComponent.id)}><IconRotate size={12} /> Girar 90°</button>
                <button className="dc-btn" onClick={() => useSimStore.getState().mirrorComponent(selectedComponent.id)}>Espelhar</button>
                <button className="dc-btn" onClick={() => useSimStore.getState().toggleLock(selectedComponent.id)}>
                  <IconLock size={12} /> {selectedComponent.locked ? 'Desbloquear' : 'Bloquear'}
                </button>
                <button className="dc-btn" onClick={() => useSimStore.getState().duplicateComponents([selectedComponent.id])}><IconCopy size={12} /> Duplicar</button>
                <button className="dc-btn-danger dc-btn" onClick={() => {
                  const linked = wires.filter((wire) => selectedComponent.terminals.some((terminal) => wire.fromTerminalId === terminal.id || wire.toTerminalId === terminal.id)).length
                  if (linked && !window.confirm(`Eliminar ${selectedComponent.ref} e ${linked} cabo(s) ligado(s)?`)) return
                  useSimStore.getState().deleteComponents([selectedComponent.id])
                }}><IconDelete size={12} /> Eliminar</button>
              </div>

              </div></details>
              {/* estado rápido conforme o tipo */}
              <details className="dc-inspector-group" open><summary>Estado e parâmetros</summary><div className="dc-inspector-group-body space-y-1">
                {Object.entries(selectedComponent.state).map(([k, v]) => {
                  if (isMountingRail(selectedComponent.type) && k === 'lengthMm') return null
                  if (typeof v === 'boolean') {
                    return (
                      <label key={k} className="flex items-center justify-between gap-2 px-1 py-0.5 rounded hover:bg-slate-50">
                        <span className="text-ink-500" title={k}>{stateLabel(k)}</span>
                        <input
                          type="checkbox"
                          checked={v}
                          disabled={(['plcSiemensLogo1224RC', 'plcLsXbmDn32s', 'siemensTsAdapterIeBasic'].includes(selectedComponent.type) || selectedComponent.type === 'powerSupplyProauto24A') && (k === 'powered' || k === 'powerReady')}
                          title={['plcSiemensLogo1224RC', 'plcLsXbmDn32s', 'siemensTsAdapterIeBasic'].includes(selectedComponent.type) && k === 'powered' ? 'Derivado das ligações L+ e M' : selectedComponent.type === 'powerSupplyProauto24A' && (k === 'powered' || k === 'powerReady') ? 'Derivado das ligações AC L e N' : undefined}
                          onChange={(e) => useSimStore.getState().setComponentState(selectedComponent.id, { [k]: e.target.checked })}
                        />
                      </label>
                    )
                  }
                  if (typeof v === 'number') {
                    return (
                      <label key={k} className="flex items-center justify-between gap-2 px-1 py-0.5">
                        <span className="text-ink-500" title={k}>{stateLabel(k)}</span>
                        <input
                          type="number"
                          className="dc-input !w-24 text-right"
                          value={v}
                          onChange={(e) => useSimStore.getState().setComponentState(selectedComponent.id, { [k]: Number(e.target.value) })}
                        />
                      </label>
                    )
                  }
                  if (selectedComponent.type === 'pilotLightAd22' && k === 'color' && typeof v === 'string') {
                    return (
                      <div key={k} className="rounded-md border border-line-soft bg-surface-sunken/50 p-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-ink-500" title={k}>{stateLabel(k)}</span>
                          <input type="color" className="h-7 w-12 cursor-pointer rounded border border-line bg-white p-0.5"
                            value={v} aria-label="Escolher uma cor personalizada para a luz"
                            onChange={(e) => useSimStore.getState().setComponentState(selectedComponent.id, { color: e.target.value })} />
                        </div>
                        <div className="mt-2 grid grid-cols-6 gap-1" aria-label="Cores predefinidas">
                          {PILOT_LIGHT_COLORS.map((option) => <button key={option.value} type="button"
                            className={`h-6 rounded border ${v.toLowerCase() === option.value ? 'border-brand-600 ring-1 ring-brand-300' : 'border-line'}`}
                            style={{ backgroundColor: option.value }} title={option.name} aria-label={option.name}
                            aria-pressed={v.toLowerCase() === option.value}
                            onClick={() => useSimStore.getState().setComponentState(selectedComponent.id, { color: option.value })} />)}
                        </div>
                      </div>
                    )
                  }
                  if (typeof v === 'string') {
                    return (
                      <label key={k} className="flex items-center justify-between gap-2 px-1 py-0.5">
                        <span className="text-ink-500" title={k}>{stateLabel(k)}</span>
                        <input className="dc-input !w-28" value={v} onChange={(e) => useSimStore.getState().setComponentState(selectedComponent.id, { [k]: e.target.value })} />
                      </label>
                    )
                  }
                  return null
                })}
              </div></details>
              {/* bornes */}
              <details className="dc-inspector-group" open><summary>Bornes <span className="dc-inspector-count">{selectedComponent.terminals.length}</span></summary><div className="dc-inspector-group-body">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] text-ink-400">Ligação e identificação</span>
                  <button className="dc-btn !h-6 !px-2 !text-[10px]" title="Adicionar e classificar segundo a ficha técnica" onClick={() => useSimStore.getState().openViewOrientationEditor(selectedComponent.id, 'terminals')}><IconPlus size={10} /> Adicionar borne</button>
                </div>
                <p className="mb-2 rounded-md border border-blue-100 bg-blue-50/70 px-2 py-1.5 text-[9px] leading-4 text-blue-800">{terminalDatasheetGuidance(selectedComponent)}</p>
                <div className="flex flex-col gap-1">
                  {selectedComponent.terminals.map((t) => (
                    <div key={t.id} className={`dc-inspector-terminal rounded-[7px] border px-2 py-2 transition-colors ${t.energized ? 'border-emerald-300 bg-state-runbg/60' : 'border-line bg-white'}`}>
                      <div className="flex items-center gap-1">
                        <input
                          className="dc-input !w-14 font-mono"
                          aria-label={`Nome do borne ${t.label}`}
                          value={t.label}
                          onChange={(e) => useSimStore.getState().updateTerminal(t.id, { label: e.target.value })}
                        />
                        <LabelLibrary
                          title="Escolher rótulo padrão IEC para este borne"
                          onPick={(l) => useSimStore.getState().updateTerminal(t.id, { label: l })}
                        />
                        <select
                          className="dc-select flex-1"
                          aria-label={`Função do borne ${t.label}`}
                          value={t.kind}
                          onChange={(e) => useSimStore.getState().updateTerminal(t.id, { kind: e.target.value as TerminalKind })}
                        >
                          {Object.entries(TERMINAL_KIND_LABEL).map(([k, v]) => (
                            <option key={k} value={k}>{v}</option>
                          ))}
                        </select>
                        <input
                          type="color"
                          aria-label={`Cor do borne ${t.label}`}
                          title={`Cor do borne ${t.label}`}
                          className="w-7 h-[22px] rounded border border-line cursor-pointer"
                          value={t.color}
                          onChange={(e) => useSimStore.getState().updateTerminal(t.id, { color: e.target.value })}
                        />
                        <button className="dc-btn !h-6 !px-2 !text-[9px]" title="Editar este borne no painel completo do componente" onClick={() => {
                          useSimStore.getState().openViewOrientationEditor(selectedComponent.id, 'terminals')
                          useSimStore.getState().setViewActiveTerminal(t.id)
                        }}>Editar</button>
                        <button className="dc-icon-btn !text-state-error !border-transparent hover:!bg-state-errorbg" title="Remover borne" onClick={() => {
                          const linked = wires.filter((wire) => wire.fromTerminalId === t.id || wire.toTerminalId === t.id).length
                          if (linked && !window.confirm(`Remover o borne ${t.label} e ${linked} cabo(s) ligado(s)?`)) return
                          useSimStore.getState().deleteTerminal(t.id)
                        }}>✕</button>
                      </div>
                      <label className="mt-1.5 flex min-w-0 flex-col gap-0.5 text-[9px] text-ink-400"><span>Categoria elétrica {t.electricalClass ? '· definida' : '· sugestão da ficha'}</span><select
                        className="dc-select !h-[26px] !text-[10px]"
                        aria-label={`Categoria elétrica do borne ${t.label}`}
                        value={terminalElectricalClassOf(selectedComponent, t)}
                        onChange={(e) => useSimStore.getState().updateTerminal(t.id, { electricalClass: e.target.value as TerminalElectricalClass, electricalClassCustom: e.target.value === 'other' ? t.electricalClassCustom : undefined })}
                      >{Object.entries(TERMINAL_ELECTRICAL_CLASS_LABEL).map(([id, classLabel]) => <option key={id} value={id}>{classLabel}</option>)}</select></label>
                      {terminalElectricalClassOf(selectedComponent, t) === 'other' && <label className="mt-1 flex min-w-0 flex-col gap-0.5 text-[9px] text-ink-400"><span>Designação personalizada</span><input className="dc-input !h-[26px] !text-[10px]" value={t.electricalClassCustom ?? ''} placeholder="Ex.: PE, contacto seco" onChange={(e) => useSimStore.getState().updateTerminal(t.id, { electricalClassCustom: e.target.value || undefined })} /></label>}
                      <div className="dc-inspector-terminal-details">
                        <label><span>Tipo</span><select
                          className="dc-select !h-[24px] !text-[10px]"
                          aria-label={`Tipo físico do borne ${t.label}`}
                          value={t.terminalType}
                          onChange={(e) => useSimStore.getState().updateTerminal(t.id, { terminalType: e.target.value as TerminalType })}
                        >
                          {Object.entries(TERMINAL_TYPE_LABEL).map(([k, v]) => (
                            <option key={k} value={k}>{v}</option>
                          ))}
                        </select></label>
                        <label><span>X</span><input type="number" step="0.05" min="0" max="1" className="dc-input !h-[24px] !text-[10px]" value={t.x} onChange={(e) => useSimStore.getState().updateTerminal(t.id, { x: Number(e.target.value) })} /></label>
                        <label><span>Y</span><input type="number" step="0.05" min="0" max="1" className="dc-input !h-[24px] !text-[10px]" value={t.y} onChange={(e) => useSimStore.getState().updateTerminal(t.id, { y: Number(e.target.value) })} /></label>
                        <label title="Diâmetro do desenho do borne no Esquema (vazio = padrão)"><span>Ø px</span><input type="number" step="0.5" min="3" max="24" placeholder="auto" className="dc-input !h-[24px] !text-[10px]" value={t.diameter ?? ''} onChange={(e) => useSimStore.getState().updateTerminal(t.id, { diameter: e.target.value === '' ? undefined : Math.max(3, Math.min(24, Number(e.target.value))) })} /></label>
                      </div>
                      <span className={`dc-inspector-terminal-status ${t.energized ? 'is-on' : ''}`}>{t.energized ? '● Energizado' : '○ Sem tensão'}</span>
                    </div>
                  ))}
                </div>
              </div></details>
            </section>
          )}

          {/* ------------------------------------------------------ cabo */}
          {selectedWire && (
            <section className="space-y-2.5">
              <header className="flex items-center justify-between sticky top-0 bg-surface-panel py-1 z-10 border-b border-line">
                <span className="font-semibold text-ink-900">Cabo {selectedWire.number ?? selectedWire.id}</span>
                <span className={`dc-chip ${selectedWire.energized ? '!border-amber-300 !bg-amber-50 !text-energy-deep' : ''}`}>
                  <span className={`inline-block h-1.5 w-1.5 rounded-full ${selectedWire.energized ? 'bg-energy' : 'bg-ink-300'}`} />
                  {selectedWire.energized ? 'ENERGIZADO' : 'SEM TENSÃO'}
                </span>
              </header>

              <div className={`rounded-md border px-2 py-2 ${wireEditDirty ? 'border-blue-200 bg-blue-50' : 'border-emerald-200 bg-emerald-50/70'}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[9px] leading-4 text-ink-500">{wireEditDirty ? 'Pré-visualização aplicada ao Esquema e 3D.' : 'Cabo sincronizado com o projeto.'}</span>
                  <div className="flex gap-1">
                    <button type="button" className="dc-btn !h-6 !px-2 !text-[9px]" disabled={!wireEditDirty} onClick={cancelWireChanges}>Cancelar</button>
                    <button type="button" className="dc-btn-primary dc-btn !h-6 !px-2 !text-[9px]" disabled={!wireEditDirty} onClick={saveWireChanges}>Guardar cabo</button>
                  </div>
                </div>
              </div>

              <div className={`rounded-md border px-2 py-2 text-[9px] ${wireClassCompatible ? 'border-line bg-surface-sunken/50 text-ink-500' : 'border-amber-300 bg-amber-50 text-amber-900'}`}>
                <div className="flex items-center justify-between gap-2"><strong>Compatibilidade elétrica</strong><span>{wireClassCompatible ? '✓ coerente' : '⚠ verificar'}</span></div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {wireFromTerminal && wireFromClass && <span className="dc-chip">{wireFromOwner?.ref}.{wireFromTerminal.label} · {TERMINAL_ELECTRICAL_CLASS_LABEL[wireFromClass]}</span>}
                  {wireToTerminal && wireToClass && <span className="dc-chip">{wireToOwner?.ref}.{wireToTerminal.label} · {TERMINAL_ELECTRICAL_CLASS_LABEL[wireToClass]}</span>}
                </div>
                {!wireClassCompatible && <p className="mt-1">As categorias AC, DC e Rede não devem ser ligadas diretamente. Confirme a ficha técnica e a função do circuito.</p>}
              </div>

              <LayerButtons />

              <div>
                <label className={label}>Cor do cabo</label>
                <div className="flex flex-wrap gap-1">
                  {Object.entries(WIRE_COLORS).map(([name, hex]) => (
                    <button
                      key={name}
                      title={name}
                      onClick={() => patchSelectedWire({ color: name as WireColor })}
                      className={`h-[22px] w-[22px] rounded-full border-2 transition-transform hover:scale-110 ${
                        selectedWire.color === name ? 'border-brand-600 ring-2 ring-brand-200 scale-110' : 'border-white shadow-[0_0_0_1px_rgba(0,0,0,0.15)]'
                      }`}
                      style={{ background: hex }}
                    />
                  ))}
                </div>
                <div className="text-[10px] text-ink-400 mt-1">
                  Atual: <span className="font-mono font-semibold" style={{ color: WIRE_COLORS[selectedWire.color] }}>{selectedWire.color}</span>
                  {' '}— a cor é aplicada de imediato no esquema.
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={label}>Seção</label>
                  <select className="dc-select" value={selectedWire.gauge} onChange={(e) => patchSelectedWire({ gauge: e.target.value })}>
                    {GAUGES.map((g) => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={label}>Tipo / função</label>
                  <select className="dc-select" value={selectedWire.kind} onChange={(e) => {
                    const kind = e.target.value as keyof typeof WIRE_KIND_COLOR
                    // cor normalizada pela função (IEC 60204-1) — pode ser alterada depois na paleta
                    patchSelectedWire({ kind, color: WIRE_KIND_COLOR[kind] })
                  }}>
                    {Object.entries(WIRE_KIND_LABEL).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className={label}>Condutor</label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {([['flexible', 'Flexível', 'multifilar · curvas suaves'], ['rigid', 'Rígido', 'fio sólido · cantos arredondados']] as const).map(([id, name, hint]) => (
                      <button
                        key={id}
                        onClick={() => patchSelectedWire({ flexibility: id })}
                        className={`flex flex-col items-start gap-0.5 rounded-md border px-2 py-1.5 text-left transition-colors ${
                          selectedWire.flexibility === id ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-200' : 'border-line bg-white hover:border-line-strong hover:bg-slate-50'
                        }`}
                      >
                        <ConductorIcon flexible={id === 'flexible'} color={WIRE_COLORS[selectedWire.color]} />
                        <span className="text-[11px] font-semibold text-ink-900">{name}</span>
                        <span className="text-[9px] text-ink-400 leading-tight">{hint}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className={label}>Roteamento</label>
                  <select className="dc-select" value={selectedWire.route} onChange={(e) => patchSelectedWire({ route: e.target.value as any })}>
                    <option value="orthogonal">Ortogonal</option>
                    <option value="manhattan">Manhattan (vertical)</option>
                    <option value="arc">Curvo</option>
                    <option value="direct">Direto</option>
                  </select>
                </div>
                <div>
                  <label className={label}>Dobra {selectedWire.bend.toFixed(2)}</label>
                  <input type="range" min={0} max={1} step={0.05} className="w-full" value={selectedWire.bend} onChange={(e) => patchSelectedWire({ bend: Number(e.target.value) })} />
                </div>
                {(selectedWire.waypoints?.length ?? 0) > 0 && (
                  <div>
                    <label className={label}>Pontos de curva ({selectedWire.waypoints!.length})</label>
                    <button
                      className="dc-btn w-full"
                      title="Remove todos os pontos de curva adicionados com duplo clique"
                      onClick={() => patchSelectedWire({ waypoints: undefined })}
                    >
                      Limpar pontos de curva
                    </button>
                  </div>
                )}
                {selectedWire.route === 'arc' && (
                  <div>
                    <label className={label}>Curvatura {(selectedWire.curveOffset ?? 0).toFixed(0)}px</label>
                    <input
                      type="range"
                      min={-150}
                      max={150}
                      step={5}
                      className="w-full"
                      value={selectedWire.curveOffset ?? 0}
                      onChange={(e) => patchSelectedWire({ curveOffset: Number(e.target.value) })}
                    />
                    <div className="text-[10px] text-ink-400 mt-0.5">Dica: com o cabo selecionado, também dá para arrastar o ponto de controle direto no esquema.</div>
                  </div>
                )}
                <div>
                  <label className={label}>Identificação</label>
                  <div className="flex items-center gap-1">
                    <input
                      className="dc-input"
                      value={selectedWire.number ?? ''}
                      onChange={(e) => patchSelectedWire({ number: e.target.value })}
                    />
                    <LabelLibrary
                      title="Escolher rótulo padrão IEC para a identificação do cabo"
                      onPick={(l) => patchSelectedWire({ number: l })}
                    />
                  </div>
                </div>
                <div>
                  <label className={label}>Etiqueta</label>
                  <div className="flex items-center gap-1">
                    <input
                      className="dc-input"
                      value={selectedWire.label ?? ''}
                      onChange={(e) => patchSelectedWire({ label: e.target.value })}
                    />
                    <LabelLibrary
                      title="Escolher rótulo padrão IEC para a etiqueta do cabo"
                      onPick={(l) => patchSelectedWire({ label: l })}
                    />
                  </div>
                </div>
              </div>

              <div className="dc-card p-2 space-y-2">
                <label className={label + ' !mb-0'}>Terminais do cabo (independentes)</label>
                {(['from', 'to'] as const).map((side) => {
                  const typeKey = side === 'from' ? 'fromEndType' : 'toEndType'
                  const layerKey = side === 'from' ? 'fromEndLayer' : 'toEndLayer'
                  const colorKey = side === 'from' ? 'fromEndColor' : 'toEndColor'
                  const linkedTerminal = side === 'from' ? (!selectedWire.fromPoint ? wireFromTerminal : undefined) : (!selectedWire.toPoint ? wireToTerminal : undefined)
                  const endColor = wireEndColor(selectedWire, side, linkedTerminal?.color)
                  const chosen = selectedWire[typeKey] ?? selectedWire.endType ?? 'none'
                  const layer = selectedWire[layerKey] ?? 'back'
                  const title = side === 'from' ? `Ponta inicial · ${wireFromTerminal?.label ?? (selectedWire.fromPoint ? 'livre' : '—')}` : `Ponta final · ${wireToTerminal?.label ?? (selectedWire.toPoint ? 'livre' : '—')}`
                  return <div key={side} className="rounded border border-line p-1.5 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-semibold">{title}</span>
                      <div className="flex shrink-0 rounded border border-line overflow-hidden" role="group" aria-label={`Camada da ${title}`}>
                        {(['back', 'front'] as const).map((value) => <button key={value} type="button"
                          title={value === 'back' ? 'Terminal atrás dos componentes' : 'Terminal à frente dos componentes'}
                          aria-pressed={layer === value}
                          className={`px-1.5 py-0.5 text-[10px] ${layer === value ? 'bg-brand-600 text-white' : 'bg-white text-ink-600'}`}
                          onClick={() => patchSelectedWire({ [layerKey]: value })}>
                          {value === 'back' ? 'Atrás' : 'À frente'}
                        </button>)}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-ink-500">
                      <label htmlFor={`wire-${side}-end-color`} className="shrink-0">Cor da ponteira</label>
                      <input id={`wire-${side}-end-color`} type="color" className="w-9 h-7 rounded border border-line cursor-pointer" value={endColor}
                        onChange={(e) => patchSelectedWire({ [colorKey]: e.target.value })} />
                      <span className="font-mono">{endColor}</span>
                      {selectedWire[colorKey] && <button type="button" className="ml-auto text-brand-600 hover:underline" title="Voltar a seguir a cor do borne" onClick={() => patchSelectedWire({ [colorKey]: undefined })}>Repor</button>}
                    </div>
                    <div className="grid grid-cols-2 gap-1">
                      {WIRE_END_OPTIONS.map((o) => <button key={o.id} type="button" title={o.hint} aria-pressed={chosen === o.id}
                        onClick={() => patchSelectedWire({ [typeKey]: o.id })}
                        className={`flex items-center gap-1.5 rounded-[5px] border px-1.5 py-1 text-left text-[10.5px] transition-colors ${chosen === o.id ? 'border-brand-500 bg-brand-50 text-brand-700 font-semibold' : 'border-line bg-white text-ink-700 hover:border-line-strong hover:bg-slate-50'}`}>
                        <WireEndIcon type={o.id} color={endColor} size={30} /><span className="truncate">{o.label}</span>
                      </button>)}
                    </div>
                  </div>
                })}
                <p className="text-[10px] text-ink-400 leading-relaxed">
                  A cor e camada do cabo controlam o fio; cada ponteira tem cor e camada próprias. Sem personalização, a ponteira segue a cor do borne ligado. {selectedWire.fromPoint || selectedWire.toPoint ? 'Arraste uma ponta livre até um borne para a ligar. Só há continuidade elétrica quando ambas as pontas estiverem ligadas.' : ''}
                </p>
              </div>

              <label className="flex items-center gap-2">
                <span className={label + ' !mb-0'}>Metragem (mm)</span>
                <input
                  type="number"
                  className="dc-input"
                  value={selectedWire.lengthMm ?? 0}
                  onChange={(e) => patchSelectedWire({ lengthMm: Number(e.target.value) })}
                />
              </label>

              <button className="dc-btn-danger dc-btn w-full" onClick={() => useSimStore.getState().deleteWire(selectedWire.id)}>
                <IconDelete size={12} /> Eliminar cabo
              </button>
            </section>
          )}

          {/* ---------------------------------------------------- borne */}
          {selectedTerminal && terminalOwner && !selectedComponent && (
            <section className="space-y-3">
              <header className="border-b border-line pb-2">
                <div className="font-semibold text-ink-900">{terminalOwner.ref} · {selectedTerminal.displayName || selectedTerminal.label}</div>
                <div className="text-[10px] text-ink-400 mt-0.5">Borne físico {selectedTerminal.label} · {selectedTerminal.energized ? '● Energizado' : '○ Sem tensão'}</div>
              </header>
              <div className="dc-card p-2.5 space-y-2">
                <div>
                  <label className={label} htmlFor="terminal-name">Nome do borne</label>
                  <input id="terminal-name" className="dc-input" value={selectedTerminal.displayName ?? ''} placeholder={selectedTerminal.label}
                    onChange={(e) => useSimStore.getState().updateTerminal(selectedTerminal.id, { displayName: e.target.value })} />
                  <p className="text-[10px] text-ink-400 mt-1">Nome visível no inspetor; o código elétrico {selectedTerminal.label} mantém-se para não alterar a simulação.</p>
                </div>
                <div>
                  <label className={label} htmlFor="terminal-electrical-class">Categoria elétrica · {selectedTerminal.electricalClass ? 'definida' : 'sugerida pela ficha'}</label>
                  <select id="terminal-electrical-class" className="dc-select" value={terminalElectricalClassOf(terminalOwner, selectedTerminal)}
                    onChange={(e) => useSimStore.getState().updateTerminal(selectedTerminal.id, { electricalClass: e.target.value as TerminalElectricalClass, electricalClassCustom: e.target.value === 'other' ? selectedTerminal.electricalClassCustom : undefined })}>
                    {Object.entries(TERMINAL_ELECTRICAL_CLASS_LABEL).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                  </select>
                  {terminalElectricalClassOf(terminalOwner, selectedTerminal) === 'other' && <input className="dc-input mt-1" value={selectedTerminal.electricalClassCustom ?? ''} placeholder="Designação: PE, contacto seco…" onChange={(e) => useSimStore.getState().updateTerminal(selectedTerminal.id, { electricalClassCustom: e.target.value || undefined })} />}
                  <p className="mt-1 text-[9px] leading-4 text-ink-400">{terminalDatasheetGuidance(terminalOwner)}</p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div><label className={label} htmlFor="terminal-kind">Função elétrica</label>
                    <select id="terminal-kind" className="dc-select" value={selectedTerminal.kind}
                      onChange={(e) => useSimStore.getState().updateTerminal(selectedTerminal.id, { kind: e.target.value as TerminalKind })}>
                      {Object.entries(TERMINAL_KIND_LABEL).map(([kind, name]) => <option key={kind} value={kind}>{name}</option>)}
                    </select></div>
                  <div><label className={label} htmlFor="terminal-type">Tipo físico</label>
                    <select id="terminal-type" className="dc-select" value={selectedTerminal.terminalType}
                      onChange={(e) => useSimStore.getState().updateTerminal(selectedTerminal.id, { terminalType: e.target.value as TerminalType })}>
                      {Object.entries(TERMINAL_TYPE_LABEL).map(([type, name]) => <option key={type} value={type}>{name}</option>)}
                    </select></div>
                </div>
              </div>
              <details className="dc-inspector-group">
                <summary>Posição no componente (avançado)</summary>
                <div className="dc-inspector-group-body grid grid-cols-2 gap-2">
                  {(['x', 'y'] as const).map((axis) => <div key={axis}>
                    <label className={label} htmlFor={`terminal-${axis}`}>{axis.toUpperCase()} (0–1)</label>
                    <input id={`terminal-${axis}`} type="number" min="0" max="1" step="0.01" className="dc-input" value={selectedTerminal[axis]}
                      onChange={(e) => { const value = Number(e.target.value); if (Number.isFinite(value)) useSimStore.getState().updateTerminal(selectedTerminal.id, { [axis]: Math.min(1, Math.max(0, value)) }) }} />
                  </div>)}
                  <p className="col-span-2 text-[10px] text-ink-400">Alterar a posição pode afastar este borne do parafuso físico no modelo 3D.</p>
                </div>
              </details>
              <div className="dc-card p-2.5 space-y-2">
                <label className={label} htmlFor="terminal-color">Cor deste borne</label>
                <div className="flex items-center gap-2">
                  <input id="terminal-color" type="color" className="w-9 h-8 cursor-pointer rounded border border-line" value={selectedTerminal.color} onChange={(e) => useSimStore.getState().updateTerminal(selectedTerminal.id, { color: e.target.value })} />
                  <span className="font-mono text-[11px]">{selectedTerminal.color}</span>
                </div>
                <div className="flex flex-wrap gap-1.5" aria-label="Cores rápidas dos bornes">
                  {['#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7', '#0f172a', '#ffffff'].map((color) => <button key={color} type="button" aria-label={`Aplicar cor ${color}`} title={color} onClick={() => useSimStore.getState().updateTerminal(selectedTerminal.id, { color })} className={`w-6 h-6 rounded-full border-2 ${selectedTerminal.color.toLowerCase() === color ? 'border-brand-600 ring-2 ring-brand-200' : 'border-slate-300'}`} style={{ backgroundColor: color }} />)}
                </div>
                <p className="text-[10px] text-ink-400">Identificação visual; não altera a cor do cabo nem a continuidade elétrica.</p>
              </div>
              <div className="dc-card p-2.5 space-y-2">
                <div className="flex justify-between items-center"><span className={label + ' !mb-0'}>Ligações</span><span className="text-[10px] text-ink-400">{connections.length} cabo(s)</span></div>
                {connections.length ? connections.map(({ wire, owner, terminal, loose }) => <div key={wire.id} className="rounded border border-line bg-white p-2 space-y-1">
                  <div className="flex justify-between items-center gap-2">
                    <button type="button" className="font-semibold text-brand-600 hover:underline text-left" onClick={() => useSimStore.getState().selectWire(wire.id)}>{wire.number || 'Cabo'} · {wire.color} · {wire.gauge}</button>
                    <span className={`text-[10px] shrink-0 ${loose ? 'text-amber-700' : 'text-emerald-700'}`}>{loose ? 'Ponta livre' : 'Ligado'}</span>
                  </div>
                  <div className="text-[11px] text-ink-600">{owner && terminal ? <>Vai para <button type="button" className="text-brand-600 hover:underline font-medium" onClick={() => useSimStore.getState().selectTerminal(terminal.id)}>{owner.ref}.{terminal.displayName || terminal.label}</button> <span className="text-ink-400">({terminal.label})</span></> : 'Outra ponta livre — sem ligação a um borne'}</div>
                </div>) : <p className="text-[11px] text-ink-400">Ainda não há cabos ligados a este borne.</p>}
              </div>
              <button className="dc-btn-primary dc-btn" onClick={() => {
                useSimStore.getState().openViewOrientationEditor(terminalOwner.id, 'terminals')
                useSimStore.getState().setViewActiveTerminal(selectedTerminal.id)
              }}><IconCube size={12} /> Editar borne no painel completo</button>
            </section>
          )}
        </div>
      )}
    </div>
  )
}
