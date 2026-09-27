import { useMemo, useState } from 'react'
import { useSimStore } from '../store/useSimStore'
import { paletteGroups, TEMPLATES } from '../electrical/factory'
import type { ComponentType, TerminalKind, TerminalType, WireColor } from '../types'
import { GAUGES, TERMINAL_KIND_LABEL, TERMINAL_TYPE_LABEL, WIRE_COLORS, WIRE_KIND_LABEL } from '../schematic/symbols'

const input = 'w-full bg-neutral-800 border border-neutral-700 rounded px-1.5 py-1 text-[11px] text-neutral-100 outline-none focus:border-cyan-500'
const label = 'text-[10px] uppercase tracking-wide text-neutral-500 mb-0.5 block'

/**
 * Controles de camada (ordem de empilhamento) — funcionam tanto para
 * componentes quanto para cabos, já que ambos compartilham o mesmo `z`.
 */
function LayerButtons() {
  const btn = 'flex-1 text-[11px] px-1.5 py-1 rounded bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-neutral-200'
  return (
    <div>
      <label className={label}>Camada (frente / trás)</label>
      <div className="flex gap-1">
        <button className={btn} title="Trazer para frente" onClick={() => useSimStore.getState().bringSelectionToFront()}>⤒ Frente</button>
        <button className={btn} title="Avançar uma camada" onClick={() => useSimStore.getState().bringSelectionForward()}>↑ Avançar</button>
        <button className={btn} title="Recuar uma camada" onClick={() => useSimStore.getState().sendSelectionBackward()}>↓ Recuar</button>
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
    <div className="w-[300px] shrink-0 border-r border-neutral-800 bg-neutral-900 flex flex-col h-full">
      <div className="flex border-b border-neutral-800 text-xs">
        <button onClick={() => setTab('library')} className={`flex-1 py-2 ${tab === 'library' ? 'bg-neutral-800 text-white' : 'text-neutral-400'}`}>
          Biblioteca ({Object.keys(TEMPLATES).length})
        </button>
        <button onClick={() => setTab('inspector')} className={`flex-1 py-2 ${tab === 'inspector' ? 'bg-neutral-800 text-white' : 'text-neutral-400'}`}>
          Inspetor
        </button>
      </div>

      {tab === 'library' && (
        <>
          <div className="p-2 border-b border-neutral-800">
            <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="filtrar componentes…" className={input} />
          </div>
          <div className="flex-1 overflow-y-auto p-2 text-xs">
            {filtered.map((g) => (
              <div key={g.group} className="mb-3">
                <div className="text-neutral-500 uppercase tracking-wider text-[10px] mb-1">{g.group}</div>
                <div className="flex flex-col gap-1">
                  {g.items.map((it) => (
                    <button
                      key={it.type}
                      onClick={() => add(it.type)}
                      className="text-left px-2 py-1 rounded bg-neutral-800 hover:bg-cyan-900/50 border border-neutral-700 hover:border-cyan-600 text-neutral-300"
                      title={`Adicionar ${it.name} ao esquema`}
                    >
                      <span className="block">{it.name}</span>
                      <span className="block text-[9px] text-neutral-500 font-mono">{it.type}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <p className="text-neutral-600 text-[10px] leading-relaxed mt-2">
              Clique para inserir no esquema. Depois arraste, gire (R), duplique (D) ou apague (Del). Bornes também podem ser
              adicionados e reconfigurados no Inspetor.
            </p>
          </div>
        </>
      )}

      {tab === 'inspector' && (
        <div className="flex-1 overflow-y-auto p-3 text-[11px] text-neutral-300 space-y-3">
          {!selectedComponent && !selectedWire && !selectedTerminal && (
            <p className="text-neutral-500 leading-relaxed">
              Nada selecionado. Clique em um componente, um cabo ou um borne no esquema (ou na lista do painel 3D) para editar aqui.
            </p>
          )}

          {/* ------------------------------------------------ componente */}
          {selectedComponent && (
            <section className="space-y-2 border-b border-neutral-800 pb-3">
              <header className="flex items-center justify-between">
                <span className="font-semibold text-white">{selectedComponent.ref}</span>
                <span className="text-[10px] text-neutral-500 font-mono">{selectedComponent.type}</span>
              </header>

              <div>
                <label className={label}>TAG / referência</label>
                <input className={input} value={selectedComponent.ref} onChange={(e) => useSimStore.getState().updateComponent(selectedComponent.id, { ref: e.target.value })} />
              </div>
              <div>
                <label className={label}>Descrição</label>
                <input className={input} value={selectedComponent.label} onChange={(e) => useSimStore.getState().updateComponent(selectedComponent.id, { label: e.target.value })} />
              </div>
              <LayerButtons />
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={label}>X</label>
                  <input
                    type="number"
                    className={input}
                    value={Math.round(selectedComponent.schematicX)}
                    onChange={(e) => useSimStore.getState().updateComponent(selectedComponent.id, { schematicX: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <label className={label}>Y</label>
                  <input
                    type="number"
                    className={input}
                    value={Math.round(selectedComponent.schematicY)}
                    onChange={(e) => useSimStore.getState().updateComponent(selectedComponent.id, { schematicY: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <label className={label}>Largura</label>
                  <input type="number" className={input} value={selectedComponent.w} onChange={(e) => useSimStore.getState().updateComponent(selectedComponent.id, { w: Math.max(30, Number(e.target.value)) })} />
                </div>
                <div>
                  <label className={label}>Altura</label>
                  <input type="number" className={input} value={selectedComponent.h} onChange={(e) => useSimStore.getState().updateComponent(selectedComponent.id, { h: Math.max(30, Number(e.target.value)) })} />
                </div>
                <div>
                  <label className={label}>Rotação</label>
                  <select className={input} value={selectedComponent.rotation} onChange={(e) => useSimStore.getState().updateComponent(selectedComponent.id, { rotation: Number(e.target.value) })}>
                    {[0, 90, 180, 270].map((r) => (
                      <option key={r} value={r}>{r}°</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={label}>Cor do corpo</label>
                  <input
                    type="color"
                    className="w-full h-[26px] bg-neutral-800 border border-neutral-700 rounded"
                    value={selectedComponent.bodyColor ?? '#1f2937'}
                    onChange={(e) => useSimStore.getState().updateComponent(selectedComponent.id, { bodyColor: e.target.value })}
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-1">
                <button className="px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700 border border-neutral-700" onClick={() => useSimStore.getState().rotateComponent(selectedComponent.id)}>Girar 90°</button>
                <button className="px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700 border border-neutral-700" onClick={() => useSimStore.getState().mirrorComponent(selectedComponent.id)}>Espelhar</button>
                <button className="px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700 border border-neutral-700" onClick={() => useSimStore.getState().toggleLock(selectedComponent.id)}>
                  {selectedComponent.locked ? 'Desbloquear' : 'Bloquear'}
                </button>
                <button className="px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700 border border-neutral-700" onClick={() => useSimStore.getState().duplicateComponents([selectedComponent.id])}>Duplicar</button>
                <button className="px-2 py-1 rounded bg-red-900/60 hover:bg-red-800 border border-red-700" onClick={() => useSimStore.getState().deleteComponents([selectedComponent.id])}>Eliminar</button>
              </div>

              {/* estado rápido conforme o tipo */}
              <div className="space-y-1">
                <label className={label}>Estado / parametrização</label>
                {Object.entries(selectedComponent.state).map(([k, v]) => {
                  if (typeof v === 'boolean') {
                    return (
                      <label key={k} className="flex items-center justify-between gap-2 px-1">
                        <span className="text-neutral-400">{k}</span>
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
                      <label key={k} className="flex items-center justify-between gap-2 px-1">
                        <span className="text-neutral-400">{k}</span>
                        <input
                          type="number"
                          className="w-24 bg-neutral-800 border border-neutral-700 rounded px-1 py-0.5 text-right"
                          value={v}
                          onChange={(e) => useSimStore.getState().setComponentState(selectedComponent.id, { [k]: Number(e.target.value) })}
                        />
                      </label>
                    )
                  }
                  if (typeof v === 'string') {
                    return (
                      <label key={k} className="flex items-center justify-between gap-2 px-1">
                        <span className="text-neutral-400">{k}</span>
                        <input className="w-28 bg-neutral-800 border border-neutral-700 rounded px-1 py-0.5" value={v} onChange={(e) => useSimStore.getState().setComponentState(selectedComponent.id, { [k]: e.target.value })} />
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
                  <button className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-800 hover:bg-cyan-700" onClick={() => useSimStore.getState().addTerminal(selectedComponent.id)}>+ borne</button>
                </div>
                <div className="flex flex-col gap-1">
                  {selectedComponent.terminals.map((t) => (
                    <div key={t.id} className={`rounded border px-2 py-1 ${t.energized ? 'border-emerald-700 bg-emerald-950/30' : 'border-neutral-700 bg-neutral-800/60'}`}>
                      <div className="flex items-center gap-1">
                        <input
                          className="w-14 bg-neutral-900 border border-neutral-700 rounded px-1 py-0.5 font-mono"
                          value={t.label}
                          onChange={(e) => useSimStore.getState().updateTerminal(t.id, { label: e.target.value })}
                        />
                        <select
                          className="flex-1 bg-neutral-900 border border-neutral-700 rounded px-1 py-0.5"
                          value={t.kind}
                          onChange={(e) => useSimStore.getState().updateTerminal(t.id, { kind: e.target.value as TerminalKind })}
                        >
                          {Object.entries(TERMINAL_KIND_LABEL).map(([k, v]) => (
                            <option key={k} value={k}>{v}</option>
                          ))}
                        </select>
                        <input
                          type="color"
                          className="w-7 h-[22px] bg-neutral-900 border border-neutral-700 rounded"
                          value={t.color}
                          onChange={(e) => useSimStore.getState().updateTerminal(t.id, { color: e.target.value })}
                        />
                        <button className="text-red-400 hover:text-red-300 px-1" title="Remover borne" onClick={() => useSimStore.getState().deleteTerminal(t.id)}>✕</button>
                      </div>
                      <div className="flex items-center gap-1 mt-1">
                        <span className="text-[9px] text-neutral-500">tipo</span>
                        <select
                          className="flex-1 bg-neutral-900 border border-neutral-700 rounded px-1 py-0.5 text-[10px]"
                          value={t.terminalType}
                          onChange={(e) => useSimStore.getState().updateTerminal(t.id, { terminalType: e.target.value as TerminalType })}
                        >
                          {Object.entries(TERMINAL_TYPE_LABEL).map(([k, v]) => (
                            <option key={k} value={k}>{v}</option>
                          ))}
                        </select>
                        <span className="text-[9px] text-neutral-500">x</span>
                        <input type="number" step="0.05" min="0" max="1" className="w-12 bg-neutral-900 border border-neutral-700 rounded px-1 py-0.5 text-[10px]" value={t.x} onChange={(e) => useSimStore.getState().updateTerminal(t.id, { x: Number(e.target.value) })} />
                        <span className="text-[9px] text-neutral-500">y</span>
                        <input type="number" step="0.05" min="0" max="1" className="w-12 bg-neutral-900 border border-neutral-700 rounded px-1 py-0.5 text-[10px]" value={t.y} onChange={(e) => useSimStore.getState().updateTerminal(t.id, { y: Number(e.target.value) })} />
                        <span className={`text-[9px] ${t.energized ? 'text-emerald-400' : 'text-neutral-500'}`}>{t.energized ? 'LIVE' : '—'}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          )}

          {/* ------------------------------------------------------ cabo */}
          {selectedWire && (
            <section className="space-y-2 border-b border-neutral-800 pb-3">
              <header className="flex items-center justify-between">
                <span className="font-semibold text-white">Cabo {selectedWire.number ?? selectedWire.id}</span>
                <span className={`text-[10px] ${selectedWire.energized ? 'text-yellow-300' : 'text-neutral-500'}`}>{selectedWire.energized ? 'ENERGIZADO' : 'sem tensão'}</span>
              </header>

              <LayerButtons />

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={label}>Cor</label>
                  <select className={input} value={selectedWire.color} onChange={(e) => useSimStore.getState().updateWire(selectedWire.id, { color: e.target.value as WireColor })}>
                    {Object.keys(WIRE_COLORS).map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={label}>Seção</label>
                  <select className={input} value={selectedWire.gauge} onChange={(e) => useSimStore.getState().updateWire(selectedWire.id, { gauge: e.target.value })}>
                    {GAUGES.map((g) => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={label}>Tipo / função</label>
                  <select className={input} value={selectedWire.kind} onChange={(e) => useSimStore.getState().updateWire(selectedWire.id, { kind: e.target.value as any })}>
                    {Object.entries(WIRE_KIND_LABEL).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={label}>Condutor</label>
                  <select className={input} value={selectedWire.flexibility} onChange={(e) => useSimStore.getState().updateWire(selectedWire.id, { flexibility: e.target.value as any })}>
                    <option value="flexible">Flexível (multifilar)</option>
                    <option value="rigid">Rígido (sólido)</option>
                  </select>
                </div>
                <div>
                  <label className={label}>Roteamento</label>
                  <select className={input} value={selectedWire.route} onChange={(e) => useSimStore.getState().updateWire(selectedWire.id, { route: e.target.value as any })}>
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
                    <div className="text-[10px] text-neutral-500 mt-0.5">Dica: com o cabo selecionado, também dá para arrastar o ponto ciano direto no esquema.</div>
                  </div>
                )}
                <div>
                  <label className={label}>Identificação</label>
                  <input className={input} value={selectedWire.number ?? ''} onChange={(e) => useSimStore.getState().updateWire(selectedWire.id, { number: e.target.value })} />
                </div>
                <div>
                  <label className={label}>Etiqueta</label>
                  <input className={input} value={selectedWire.label ?? ''} onChange={(e) => useSimStore.getState().updateWire(selectedWire.id, { label: e.target.value })} />
                </div>
              </div>

              <label className="flex items-center gap-2 px-1">
                <span className={label}>Metragem (mm)</span>
                <input
                  type="number"
                  className={input}
                  value={selectedWire.lengthMm ?? 0}
                  onChange={(e) => useSimStore.getState().updateWire(selectedWire.id, { lengthMm: Number(e.target.value) })}
                />
              </label>

              <button className="w-full px-2 py-1 rounded bg-red-900/60 hover:bg-red-800 border border-red-700" onClick={() => useSimStore.getState().deleteWire(selectedWire.id)}>
                Eliminar cabo
              </button>
            </section>
          )}

          {/* ---------------------------------------------------- borne */}
          {selectedTerminal && terminalOwner && !selectedComponent && (
            <section className="space-y-2">
              <header className="font-semibold text-white">Borne {terminalOwner.ref}.{selectedTerminal.label}</header>
              <p className="text-neutral-500">
                Função: {TERMINAL_KIND_LABEL[selectedTerminal.kind]} · Tipo: {TERMINAL_TYPE_LABEL[selectedTerminal.terminalType]} ·{' '}
                <span className={selectedTerminal.energized ? 'text-emerald-400' : 'text-neutral-500'}>{selectedTerminal.energized ? 'energizado' : 'sem tensão'}</span>
              </p>
              <p className="text-neutral-500">
                Nº de cabos ligados: {wires.filter((w) => w.fromTerminalId === selectedTerminal.id || w.toTerminalId === selectedTerminal.id).length}
              </p>
              <button className="px-2 py-1 rounded bg-cyan-800 hover:bg-cyan-700" onClick={() => useSimStore.getState().selectComponents([terminalOwner.id])}>
                Abrir componente
              </button>
            </section>
          )}
        </div>
      )}
    </div>
  )
}
