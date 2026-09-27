import { useEffect, useMemo, useRef, useState } from 'react'
import { useSimStore } from '../store/useSimStore'
import { paletteGroups, TEMPLATES } from '../electrical/factory'
import type { ComponentType, TerminalKind, TerminalType, WireColor } from '../types'
import { GAUGES, TERMINAL_KIND_LABEL, TERMINAL_TYPE_LABEL, WIRE_COLORS, WIRE_KIND_LABEL } from '../schematic/symbols'
import LabelLibrary from './LabelLibrary'
import DatasheetPanel from './DatasheetPanel'
import { WIRE_END_OPTIONS, WireEndIcon, ConductorIcon } from '../schematic/wireEnds'
import { WIRE_KIND_COLOR } from '../store/useSimStore'
import { ComponentThumb } from '../three/componentThumbnails'
import { IconSearch, IconLayers, IconPlus, IconCopy, IconLock, IconRotate, IconDelete, IconTag, IconChevronDown, IconProjects } from '../ui/icons'

const label = 'dc-field-label'
const STATE_LABELS: Record<string, string> = {
  closed: 'Fechado', tripped: 'Disparado', poles: 'Polos', curve: 'Curva', inA: 'Corrente nominal (A)',
  energized: 'Energizado', pressed: 'Premido', running: 'Em funcionamento', presetMs: 'Tempo definido (ms)',
  elapsedMs: 'Tempo decorrido (ms)', triggered: 'Ativado', on: 'Ligado', enabled: 'Ativo',
}
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
  return <div className={`dc-library-tile ${placing ? 'is-placing' : ''}`}>
    <button
      type="button"
      className="dc-library-tile-main"
      title={`${name} — clique para posicionar · duplo clique para inserir · arraste para o esquema`}
      aria-label={`Posicionar ${name} no esquema`}
      onClick={() => { onRecent(); onPick() }}
      onDoubleClick={() => { onRecent(); onQuickAdd() }}
      draggable
      onDragStart={(e) => {
        const st = useSimStore.getState()
        st.setPlacingType(null)
        st.setDragType(type)
        e.dataTransfer.setData('application/x-dcsimu-component', type)
        e.dataTransfer.setData('text/plain', type)
        e.dataTransfer.effectAllowed = 'copy'
        const chip = document.createElement('div')
        chip.textContent = `+ ${name}`
        chip.style.cssText = 'position:fixed;top:-100px;left:-100px;padding:3px 8px;border-radius:999px;background:#2655e5;color:#fff;font:600 11px Inter,system-ui,sans-serif;white-space:nowrap'
        document.body.appendChild(chip)
        e.dataTransfer.setDragImage(chip, -12, -12)
        window.setTimeout(() => chip.remove(), 0)
      }}
      onDragEnd={(e) => { if (e.dataTransfer.dropEffect !== 'none') onRecent(); useSimStore.getState().setDragType(null) }}
    >
      <span className="dc-library-tile-image"><ComponentThumb type={type} size={58} /></span>
      <span className="dc-library-tile-name">{name}</span>
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
  const wires = useSimStore((s) => s.wires)
  const selectedIds = useSimStore((s) => s.selectedComponentIds)
  const selectedWireId = useSimStore((s) => s.selectedWireId)
  const selectedTerminalId = useSimStore((s) => s.selectedTerminalId)
  const [tab, setTab] = useState<'library' | 'inspector'>('library')
  const inspectorRef = useRef<HTMLDivElement>(null)
  const [filter, setFilter] = useState('')
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => new Set(paletteGroups().map((g) => g.group).filter((g) => !['protection', 'command'].includes(g))))
  const [favorites, setFavorites] = useState<ComponentType[]>(() => {
    try { return JSON.parse(localStorage.getItem('dcsimu:library:favorites') ?? '[]') as ComponentType[] }
    catch { return [] }
  })
  const [recent, setRecent] = useState<ComponentType[]>(() => {
    try { return (JSON.parse(localStorage.getItem('dcsimu:library:recent') ?? '[]') as ComponentType[]).filter((type) => !!TEMPLATES[type]).slice(0, 8) }
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

  const groups = useMemo(() => paletteGroups(), [])
  const selectedComponent = components.find((c) => c.id === selectedIds[0])
  const selectedWire = wires.find((w) => w.id === selectedWireId)
  const wireFromTerminal = selectedWire ? components.flatMap((c) => c.terminals).find((t) => t.id === selectedWire.fromTerminalId) : undefined
  const wireToTerminal = selectedWire ? components.flatMap((c) => c.terminals).find((t) => t.id === selectedWire.toTerminalId) : undefined
  const selectedTerminal = components.flatMap((c) => c.terminals).find((t) => t.id === selectedTerminalId)
  const terminalOwner = selectedTerminal ? components.find((c) => c.id === selectedTerminal.componentId) : undefined

  const placingType = useSimStore((s) => s.placingType)

  /** Clique = modo "posicionar com o mouse" (fantasma segue o cursor no
   *  esquema). Clique novamente no mesmo item cancela. */
  const add = (type: ComponentType) => {
    const st = useSimStore.getState()
    st.setPlacingType(st.placingType === type ? null : type)
  }

  /** Duplo clique = insere imediatamente na próxima posição livre. */
  const addImmediate = (type: ComponentType) => {
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

  return (
    <div className="shrink-0 border-r border-line bg-surface-panel flex flex-col h-full min-h-0" style={{ width }}>
      {/* abas */}
      <div className="flex items-end border-b border-line bg-surface-rail px-1 pt-1">
        <button onClick={() => setTab('library')} className={`dc-tab ${tab === 'library' ? 'dc-tab-active' : ''}`}>
          Biblioteca <span className="text-ink-300 font-normal">({Object.keys(TEMPLATES).length})</span>
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
          <div className="flex items-center justify-between px-2 py-1 border-b border-line text-[10px] text-ink-500">
            <span>{filtered.reduce((n, g) => n + g.items.length, 0)} componentes {filter ? 'encontrados' : 'disponíveis'}</span>
            <span className="flex gap-2"><button onClick={() => setCollapsedGroups(new Set())}>Expandir</button><button onClick={() => setCollapsedGroups(new Set(groups.map((g) => g.group)))}>Recolher</button></span>
          </div>
          {placingType && <div className="p-2 bg-brand-50 text-brand-700 text-[11px] flex gap-2 items-center"><span className="flex-1">A posicionar: {TEMPLATES[placingType]?.paletteName ?? placingType}</span><button className="dc-btn !h-6" onClick={() => useSimStore.getState().setPlacingType(null)}>Cancelar</button></div>}
          <div className="flex-1 overflow-y-auto p-2 min-h-0 dc-library-scroll">
            {recent.length > 0 && !filter && <section className="dc-library-section"><div className="dc-library-section-title">◴ Recentes <span>{recent.length}</span></div><div className="dc-library-recent">{recent.map((type) => <LibraryTile key={type} type={type} name={TEMPLATES[type].paletteName} favorite={favorites.includes(type)} placing={placingType === type} onPick={() => add(type)} onQuickAdd={() => addImmediate(type)} onFavorite={() => toggleFavorite(type)} onRecent={() => markRecent(type)} />)}</div></section>}
            {favorites.length > 0 && !filter && <section className="dc-library-section"><div className="dc-library-section-title">★ Favoritos <span>{favorites.length}</span></div><div className="dc-library-grid">{favorites.filter((type) => TEMPLATES[type]).map((type) => <LibraryTile key={type} type={type} name={TEMPLATES[type].paletteName} favorite placing={placingType === type} onPick={() => add(type)} onQuickAdd={() => addImmediate(type)} onFavorite={() => toggleFavorite(type)} onRecent={() => markRecent(type)} />)}</div></section>}
            {!filtered.length && <div className="p-4 text-center text-xs text-ink-400">Nenhum componente encontrado. Experimente outro termo ou limpe a pesquisa.</div>}
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
               <b className="text-ink-500">Clique ou arraste</b> um item: o componente aparece em pré-visualização no esquema
               e fica onde <b className="text-ink-500">soltar/clicar</b> (encaixa na malha). Duplo clique insere já no esquema · Shift+clique posiciona vários · Esc cancela.
               Também pode arrastar botões, sensores e contatores para uma network Ladder.
             </p>
          </div>
        </>
      )}

      {tab === 'inspector' && (
        <div ref={inspectorRef} className="dc-inspector-scroll flex-1 overflow-y-auto p-3 text-xs text-ink-700 space-y-3 min-h-0">
          {!selectedComponent && !selectedWire && !selectedTerminal && (
            <div className="h-full flex items-center justify-center">
              <p className="text-ink-400 leading-relaxed text-center max-w-[220px]">
                Nada selecionado. Clique em um componente, um cabo ou um borne no esquema (ou na lista do painel 3D) para editar aqui.
              </p>
            </div>
          )}

          {/* ------------------------------------------------ componente */}
          {selectedComponent && (
            <section key={selectedComponent.id} className="dc-inspector-component">
              <header className="dc-inspector-hero">
                <div className="dc-inspector-hero-thumb"><ComponentThumb type={selectedComponent.type} size={42} /></div>
                <div className="min-w-0 flex-1"><strong className="block text-sm text-ink-900 truncate">{selectedComponent.ref || 'Sem referência'}</strong><span className="block text-[10px] text-ink-500 truncate">{selectedComponent.label}</span></div>
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
                  if (typeof v === 'boolean') {
                    return (
                      <label key={k} className="flex items-center justify-between gap-2 px-1 py-0.5 rounded hover:bg-slate-50">
                        <span className="text-ink-500" title={k}>{stateLabel(k)}</span>
                        <input
                          type="checkbox"
                          checked={v}
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
                  <button className="dc-btn !h-5 !px-1.5 !text-[10px]" onClick={() => useSimStore.getState().addTerminal(selectedComponent.id)}><IconPlus size={10} /> borne</button>
                </div>
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
                        <button className="dc-icon-btn !text-state-error !border-transparent hover:!bg-state-errorbg" title="Remover borne" onClick={() => {
                          const linked = wires.filter((wire) => wire.fromTerminalId === t.id || wire.toTerminalId === t.id).length
                          if (linked && !window.confirm(`Remover o borne ${t.label} e ${linked} cabo(s) ligado(s)?`)) return
                          useSimStore.getState().deleteTerminal(t.id)
                        }}>✕</button>
                      </div>
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

              <LayerButtons />

              <div>
                <label className={label}>Cor do cabo</label>
                <div className="flex flex-wrap gap-1">
                  {Object.entries(WIRE_COLORS).map(([name, hex]) => (
                    <button
                      key={name}
                      title={name}
                      onClick={() => {
                        const st = useSimStore.getState()
                        st.commitHistory()
                        st.updateWire(selectedWire.id, { color: name as WireColor })
                      }}
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
                  <select className="dc-select" value={selectedWire.gauge} onChange={(e) => useSimStore.getState().updateWire(selectedWire.id, { gauge: e.target.value })}>
                    {GAUGES.map((g) => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={label}>Tipo / função</label>
                  <select className="dc-select" value={selectedWire.kind} onChange={(e) => {
                    const kind = e.target.value as keyof typeof WIRE_KIND_COLOR
                    const st = useSimStore.getState()
                    st.commitHistory()
                    // cor normalizada pela função (IEC 60204-1) — pode ser alterada depois na paleta
                    st.updateWire(selectedWire.id, { kind, color: WIRE_KIND_COLOR[kind] })
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
                        onClick={() => {
                          const st = useSimStore.getState()
                          st.commitHistory()
                          st.updateWire(selectedWire.id, { flexibility: id })
                        }}
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
                  <select className="dc-select" value={selectedWire.route} onChange={(e) => useSimStore.getState().updateWire(selectedWire.id, { route: e.target.value as any })}>
                    <option value="orthogonal">Ortogonal</option>
                    <option value="manhattan">Manhattan (vertical)</option>
                    <option value="arc">Curvo</option>
                    <option value="direct">Direto</option>
                  </select>
                </div>
                <div>
                  <label className={label}>Dobra {selectedWire.bend.toFixed(2)}</label>
                  <input type="range" min={0} max={1} step={0.05} className="w-full" value={selectedWire.bend} onChange={(e) => useSimStore.getState().updateWire(selectedWire.id, { bend: Number(e.target.value) })} />
                </div>
                {(selectedWire.waypoints?.length ?? 0) > 0 && (
                  <div>
                    <label className={label}>Pontos de curva ({selectedWire.waypoints!.length})</label>
                    <button
                      className="dc-btn w-full"
                      title="Remove todos os pontos de curva adicionados com duplo clique"
                      onClick={() => useSimStore.getState().updateWire(selectedWire.id, { waypoints: undefined })}
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
                      onChange={(e) => useSimStore.getState().updateWire(selectedWire.id, { curveOffset: Number(e.target.value) })}
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
                      onChange={(e) => useSimStore.getState().updateWire(selectedWire.id, { number: e.target.value })}
                    />
                    <LabelLibrary
                      title="Escolher rótulo padrão IEC para a identificação do cabo"
                      onPick={(l) => useSimStore.getState().updateWire(selectedWire.id, { number: l })}
                    />
                  </div>
                </div>
                <div>
                  <label className={label}>Etiqueta</label>
                  <div className="flex items-center gap-1">
                    <input
                      className="dc-input"
                      value={selectedWire.label ?? ''}
                      onChange={(e) => useSimStore.getState().updateWire(selectedWire.id, { label: e.target.value })}
                    />
                    <LabelLibrary
                      title="Escolher rótulo padrão IEC para a etiqueta do cabo"
                      onPick={(l) => useSimStore.getState().updateWire(selectedWire.id, { label: l })}
                    />
                  </div>
                </div>
              </div>

              <div className="dc-card p-2 space-y-2">
                <div className="flex items-center justify-between">
                  <label className={label + ' !mb-0'}>Terminal do cabo</label>
                  <span className="text-[9px] text-ink-400">aplicado às duas pontas</span>
                </div>
                <div className="grid grid-cols-2 gap-1">
                  {WIRE_END_OPTIONS.map((o) => {
                    const active = (selectedWire.endType ?? 'none') === o.id
                    return (
                      <button
                        key={o.id}
                        title={o.hint}
                        onClick={() => {
                          const st = useSimStore.getState()
                          st.commitHistory()
                          st.updateWire(selectedWire.id, { endType: o.id })
                        }}
                        className={`flex items-center gap-1.5 rounded-[5px] border px-1.5 py-1 text-left text-[10.5px] transition-colors ${
                          active ? 'border-brand-500 bg-brand-50 text-brand-700 font-semibold' : 'border-line bg-white text-ink-700 hover:border-line-strong hover:bg-slate-50'
                        }`}
                      >
                        <WireEndIcon type={o.id} color={WIRE_COLORS[selectedWire.color]} size={30} />
                        <span className="truncate">{o.label}</span>
                      </button>
                    )
                  })}
                </div>
                <p className="text-[10px] text-ink-400 leading-relaxed">
                  De {wireFromTerminal?.label ?? (selectedWire.fromPoint ? 'ponta livre' : '—')} → {wireToTerminal?.label ?? (selectedWire.toPoint ? 'ponta livre' : '—')}. {selectedWire.fromPoint || selectedWire.toPoint ? 'Arraste uma ponta livre até um borne para a ligar. Só há continuidade elétrica quando ambas as pontas estiverem ligadas.' : 'A terminação é desenhada nas pontas do cabo.'}
                </p>
              </div>

              <label className="flex items-center gap-2">
                <span className={label + ' !mb-0'}>Metragem (mm)</span>
                <input
                  type="number"
                  className="dc-input"
                  value={selectedWire.lengthMm ?? 0}
                  onChange={(e) => useSimStore.getState().updateWire(selectedWire.id, { lengthMm: Number(e.target.value) })}
                />
              </label>

              <button className="dc-btn-danger dc-btn w-full" onClick={() => useSimStore.getState().deleteWire(selectedWire.id)}>
                <IconDelete size={12} /> Eliminar cabo
              </button>
            </section>
          )}

          {/* ---------------------------------------------------- borne */}
          {selectedTerminal && terminalOwner && !selectedComponent && (
            <section className="space-y-2">
              <header className="font-semibold text-ink-900 border-b border-line pb-1">Borne {terminalOwner.ref}.{selectedTerminal.label}</header>
              <p className="text-ink-500">
                Função: {TERMINAL_KIND_LABEL[selectedTerminal.kind]} · Tipo: {TERMINAL_TYPE_LABEL[selectedTerminal.terminalType]} ·{' '}
                <span className={selectedTerminal.energized ? 'text-state-run font-semibold' : 'text-ink-400'}>{selectedTerminal.energized ? 'energizado' : 'sem tensão'}</span>
              </p>
              <p className="text-ink-500">
                Nº de cabos ligados: {wires.filter((w) => w.fromTerminalId === selectedTerminal.id || w.toTerminalId === selectedTerminal.id).length}
              </p>
              <div className="rounded-lg border border-line bg-white p-2 space-y-2">
                <label className={label} htmlFor="terminal-color">Cor deste borne</label>
                <div className="flex items-center gap-2">
                  <input id="terminal-color" type="color" className="w-9 h-8 cursor-pointer rounded border border-line" value={selectedTerminal.color} onChange={(e) => useSimStore.getState().updateTerminal(selectedTerminal.id, { color: e.target.value })} />
                  <span className="font-mono text-[11px]">{selectedTerminal.color}</span>
                </div>
                <div className="flex flex-wrap gap-1.5" aria-label="Cores rápidas dos bornes">
                  {['#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7', '#0f172a', '#ffffff'].map((color) => <button key={color} type="button" aria-label={`Aplicar cor ${color}`} title={color} onClick={() => useSimStore.getState().updateTerminal(selectedTerminal.id, { color })} className={`w-6 h-6 rounded-full border-2 ${selectedTerminal.color.toLowerCase() === color ? 'border-brand-600 ring-2 ring-brand-200' : 'border-slate-300'}`} style={{ backgroundColor: color }} />)}
                </div>
                <p className="text-[10px] text-ink-400">Altera apenas a identificação visual do borne, não a cor do fio nem a continuidade elétrica.</p>
              </div>
              <button className="dc-btn-primary dc-btn" onClick={() => useSimStore.getState().selectComponents([terminalOwner.id])}>
                Abrir componente
              </button>
            </section>
          )}
        </div>
      )}
    </div>
  )
}
