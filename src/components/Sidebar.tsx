import { useMemo, useState } from 'react'
import { useSimStore } from '../store/useSimStore'
import { paletteGroups, TEMPLATES } from '../electrical/factory'
import type { ComponentType, TerminalKind, TerminalType, WireColor } from '../types'
import { GAUGES, TERMINAL_KIND_LABEL, TERMINAL_TYPE_LABEL, WIRE_COLORS, WIRE_KIND_LABEL } from '../schematic/symbols'
import LabelLibrary from './LabelLibrary'
import { IconSearch, IconLayers, IconPlus, IconCopy, IconLock, IconRotate, IconDelete, IconTag } from '../ui/icons'

const label = 'dc-field-label'

/* Ícone representativo por categoria da biblioteca (mesma família de traço). */
import {
  IconShield, IconContact, IconCoil, IconTimer, IconCounter, IconBranch,
  IconCube, IconMonitor, IconFile, IconWire, IconGrid,
} from '../ui/icons'
const GROUP_ICON: Record<string, (p: { size?: number; className?: string }) => JSX.Element> = {
  protection: IconShield,
  command: IconContact,
  contactor: IconCoil,
  relay: IconCoil,
  controller: IconMonitor,
  drive: IconToolsProxy,
  motor: IconCube,
  power: IconFile,
  signaling: IconGrid,
  sensor: IconProbeProxy,
  terminal: IconBranch,
}

function IconToolsProxy(p: { size?: number; className?: string }) {
  return <IconRotate {...p} />
}
function IconProbeProxy(p: { size?: number; className?: string }) {
  return <IconTag {...p} />
}

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

/**
 * Painel esquerdo: biblioteca de componentes (clique adiciona ao esquema) e
 * inspetor completo do que está selecionado (componente, borne ou cabo).
 */
export default function Sidebar() {
  const components = useSimStore((s) => s.components)
  const wires = useSimStore((s) => s.wires)
  const selectedIds = useSimStore((s) => s.selectedComponentIds)
  const selectedWireId = useSimStore((s) => s.selectedWireId)
  const selectedTerminalId = useSimStore((s) => s.selectedTerminalId)
  const [tab, setTab] = useState<'library' | 'inspector'>('library')
  const [filter, setFilter] = useState('')

  const groups = useMemo(() => paletteGroups(), [])
  const selectedComponent = components.find((c) => c.id === selectedIds[0])
  const selectedWire = wires.find((w) => w.id === selectedWireId)
  const selectedTerminal = components.flatMap((c) => c.terminals).find((t) => t.id === selectedTerminalId)
  const terminalOwner = selectedTerminal ? components.find((c) => c.id === selectedTerminal.componentId) : undefined

  const add = (type: ComponentType) => {
    const st = useSimStore.getState()
    const n = st.components.length
    st.addComponent(type, 80 + (n % 6) * 160, 90 + Math.floor(n / 6) * 150)
    setTab('inspector')
  }

  const filtered = useMemo(() => {
    if (!filter.trim()) return groups
    const f = filter.toLowerCase()
    return groups
      .map((g) => ({ ...g, items: g.items.filter((i) => i.name.toLowerCase().includes(f) || i.type.toLowerCase().includes(f)) }))
      .filter((g) => g.items.length)
  }, [groups, filter])

  return (
    <div className="w-[300px] shrink-0 border-r border-line bg-surface-panel flex flex-col h-full min-h-0">
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
              <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Pesquisar componente…" className="dc-input !pl-7" />
              <IconSearch size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-ink-300 pointer-events-none" />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-2 min-h-0">
            {filtered.map((g) => {
              const GIcon = GROUP_ICON[g.group] ?? IconFile
              return (
                <div key={g.group} className="mb-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <GIcon size={11} className="text-ink-400" />
                    <span className="dc-panel-title">{g.group}</span>
                    <span className="text-[9px] text-ink-300">{g.items.length}</span>
                    <span className="flex-1 border-t border-line-soft" />
                  </div>
                  <div className="flex flex-col gap-0.5">
                    {g.items.map((it) => (
                      <button
                        key={it.type}
                        onClick={() => add(it.type)}
                        className="group text-left px-2 py-1.5 rounded-[5px] border border-transparent hover:border-line hover:bg-brand-50 hover:shadow-xs active:bg-brand-100/70 transition-colors"
                        title={`Adicionar ${it.name} ao esquema`}
                      >
                        <span className="flex items-center justify-between gap-2">
                          <span className="text-xs font-medium text-ink-900">{it.name}</span>
                          <IconPlus size={11} className="text-ink-300 group-hover:text-brand-600" />
                        </span>
                        <span className="block text-[9px] text-ink-400 font-mono">{it.type}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
            <p className="text-ink-400 text-[10px] leading-relaxed mt-2 p-2 bg-surface-sunken/60 rounded-md border border-line-soft">
              Clique para inserir no esquema. Depois arraste, gire (R), duplique (D) ou apague (Del). Bornes também podem ser
              adicionados e reconfigurados no Inspetor.
            </p>
          </div>
        </>
      )}

      {tab === 'inspector' && (
        <div className="flex-1 overflow-y-auto p-3 text-xs text-ink-700 space-y-3 min-h-0">
          {!selectedComponent && !selectedWire && !selectedTerminal && (
            <div className="h-full flex items-center justify-center">
              <p className="text-ink-400 leading-relaxed text-center max-w-[220px]">
                Nada selecionado. Clique em um componente, um cabo ou um borne no esquema (ou na lista do painel 3D) para editar aqui.
              </p>
            </div>
          )}

          {/* ------------------------------------------------ componente */}
          {selectedComponent && (
            <section className="space-y-2.5">
              <header className="flex items-center justify-between sticky top-0 bg-surface-panel py-1 z-10 border-b border-line">
                <span className="font-semibold text-ink-900">{selectedComponent.ref}</span>
                <span className="dc-chip font-mono">{selectedComponent.type}</span>
              </header>

              <div>
                <label className={label}>TAG / referência</label>
                <input className="dc-input" value={selectedComponent.ref} onChange={(e) => useSimStore.getState().updateComponent(selectedComponent.id, { ref: e.target.value })} />
              </div>
              <div>
                <label className={label}>Descrição</label>
                <input className="dc-input" value={selectedComponent.label} onChange={(e) => useSimStore.getState().updateComponent(selectedComponent.id, { label: e.target.value })} />
              </div>
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
                <button className="dc-btn-danger dc-btn" onClick={() => useSimStore.getState().deleteComponents([selectedComponent.id])}><IconDelete size={12} /> Eliminar</button>
              </div>

              {/* estado rápido conforme o tipo */}
              <div className="space-y-1">
                <label className={label}>Estado / parametrização</label>
                {Object.entries(selectedComponent.state).map(([k, v]) => {
                  if (typeof v === 'boolean') {
                    return (
                      <label key={k} className="flex items-center justify-between gap-2 px-1 py-0.5 rounded hover:bg-slate-50">
                        <span className="text-ink-500">{k}</span>
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
                        <span className="text-ink-500">{k}</span>
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
                        <span className="text-ink-500">{k}</span>
                        <input className="dc-input !w-28" value={v} onChange={(e) => useSimStore.getState().setComponentState(selectedComponent.id, { [k]: e.target.value })} />
                      </label>
                    )
                  }
                  return null
                })}
              </div>

              {/* bornes */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className={label}>Bornes ({selectedComponent.terminals.length})</label>
                  <button className="dc-btn !h-5 !px-1.5 !text-[10px]" onClick={() => useSimStore.getState().addTerminal(selectedComponent.id)}><IconPlus size={10} /> borne</button>
                </div>
                <div className="flex flex-col gap-1">
                  {selectedComponent.terminals.map((t) => (
                    <div key={t.id} className={`rounded-[5px] border px-2 py-1.5 transition-colors ${t.energized ? 'border-emerald-300 bg-state-runbg/60' : 'border-line bg-white'}`}>
                      <div className="flex items-center gap-1">
                        <input
                          className="dc-input !w-14 font-mono"
                          value={t.label}
                          onChange={(e) => useSimStore.getState().updateTerminal(t.id, { label: e.target.value })}
                        />
                        <LabelLibrary
                          title="Escolher rótulo padrão IEC para este borne"
                          onPick={(l) => useSimStore.getState().updateTerminal(t.id, { label: l })}
                        />
                        <select
                          className="dc-select flex-1"
                          value={t.kind}
                          onChange={(e) => useSimStore.getState().updateTerminal(t.id, { kind: e.target.value as TerminalKind })}
                        >
                          {Object.entries(TERMINAL_KIND_LABEL).map(([k, v]) => (
                            <option key={k} value={k}>{v}</option>
                          ))}
                        </select>
                        <input
                          type="color"
                          className="w-7 h-[22px] rounded border border-line cursor-pointer"
                          value={t.color}
                          onChange={(e) => useSimStore.getState().updateTerminal(t.id, { color: e.target.value })}
                        />
                        <button className="dc-icon-btn !text-state-error !border-transparent hover:!bg-state-errorbg" title="Remover borne" onClick={() => useSimStore.getState().deleteTerminal(t.id)}>✕</button>
                      </div>
                      <div className="flex items-center gap-1 mt-1">
                        <span className="text-[9px] text-ink-400">tipo</span>
                        <select
                          className="dc-select flex-1 !h-[22px] !text-[10px]"
                          value={t.terminalType}
                          onChange={(e) => useSimStore.getState().updateTerminal(t.id, { terminalType: e.target.value as TerminalType })}
                        >
                          {Object.entries(TERMINAL_TYPE_LABEL).map(([k, v]) => (
                            <option key={k} value={k}>{v}</option>
                          ))}
                        </select>
                        <span className="text-[9px] text-ink-400">x</span>
                        <input type="number" step="0.05" min="0" max="1" className="dc-input !w-12 !h-[22px] !text-[10px]" value={t.x} onChange={(e) => useSimStore.getState().updateTerminal(t.id, { x: Number(e.target.value) })} />
                        <span className="text-[9px] text-ink-400">y</span>
                        <input type="number" step="0.05" min="0" max="1" className="dc-input !w-12 !h-[22px] !text-[10px]" value={t.y} onChange={(e) => useSimStore.getState().updateTerminal(t.id, { y: Number(e.target.value) })} />
                        <span className={`text-[9px] font-mono font-bold ${t.energized ? 'text-state-run' : 'text-ink-300'}`}>{t.energized ? 'LIVE' : '—'}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
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

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={label}>Cor</label>
                  <select className="dc-select" value={selectedWire.color} onChange={(e) => useSimStore.getState().updateWire(selectedWire.id, { color: e.target.value as WireColor })}>
                    {Object.keys(WIRE_COLORS).map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
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
                  <select className="dc-select" value={selectedWire.kind} onChange={(e) => useSimStore.getState().updateWire(selectedWire.id, { kind: e.target.value as any })}>
                    {Object.entries(WIRE_KIND_LABEL).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={label}>Condutor</label>
                  <select className="dc-select" value={selectedWire.flexibility} onChange={(e) => useSimStore.getState().updateWire(selectedWire.id, { flexibility: e.target.value as any })}>
                    <option value="flexible">Flexível (multifilar)</option>
                    <option value="rigid">Rígido (sólido)</option>
                  </select>
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
