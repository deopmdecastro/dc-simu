import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useSimStore } from '../store/useSimStore'
import type { EditorTool, WireColor, WireEndType } from '../types'
import { buildBOM, bomToCSV } from '../utils/bom'
import { GAUGES, WIRE_COLORS } from '../schematic/symbols'
import { WIRE_END_OPTIONS, WireEndIcon, ConductorIcon } from '../schematic/wireEnds'
import ProjectsPanel from './ProjectsPanel'
import {
  IconFile, IconSave, IconOpen, IconCursor, IconWire, IconProbe, IconErase, IconPan,
  IconUndo, IconRedo, IconOrganize, IconTag, IconAlignLeft, IconAlignCenterH, IconAlignRight,
  IconAlignTop, IconAlignCenterV, IconAlignBottom, IconDistH, IconDistV, IconPlay, IconPause,
  IconStop, IconStep, IconReset, IconGrid, IconMagnet, IconZoomIn, IconZoomOut,
  IconSchematic, IconLadder, IconCube, IconMonitor, IconDownload, IconLock, IconChevronDown,
} from '../ui/icons'

type AlignEdge = 'left' | 'right' | 'top' | 'bottom' | 'centerX' | 'centerY'

const ALIGN_BUTTONS: Array<{ edge: AlignEdge; icon: typeof IconAlignLeft; hint: string }> = [
  { edge: 'left', icon: IconAlignLeft, hint: 'Alinhar à esquerda' },
  { edge: 'centerX', icon: IconAlignCenterH, hint: 'Centralizar horizontalmente' },
  { edge: 'right', icon: IconAlignRight, hint: 'Alinhar à direita' },
  { edge: 'top', icon: IconAlignTop, hint: 'Alinhar ao topo' },
  { edge: 'centerY', icon: IconAlignCenterV, hint: 'Centralizar verticalmente' },
  { edge: 'bottom', icon: IconAlignBottom, hint: 'Alinhar embaixo' },
]

export type ViewMode = 'schematic' | 'ladder' | 'panel3d' | 'monitor'

const TOOLS: Array<{ id: EditorTool; label: string; icon: typeof IconCursor; hint: string; key: string }> = [
  { id: 'select', label: 'Selecionar', icon: IconCursor, hint: 'Selecionar / arrastar componentes', key: '1' },
  { id: 'wire', label: 'Cabo', icon: IconWire, hint: 'Desenhar cabo entre bornes', key: '2' },
  { id: 'probe', label: 'Sonda', icon: IconProbe, hint: 'Medir continuidade entre dois pontos', key: '3' },
  { id: 'erase', label: 'Apagar', icon: IconErase, hint: 'Apagar cabo/borne sob o cursor', key: '4' },
  { id: 'pan', label: 'Mover vista', icon: IconPan, hint: 'Mover a vista (ou botão do meio / Alt+arrastar)', key: '5' },
]

const VIEWS: Array<{ id: ViewMode; label: string; icon: typeof IconSchematic; key: string }> = [
  { id: 'schematic', label: 'Esquema', icon: IconSchematic, key: 'F1' },
  { id: 'ladder', label: 'Ladder', icon: IconLadder, key: 'F2' },
  { id: 'panel3d', label: 'Painel 3D', icon: IconCube, key: 'F3' },
  { id: 'monitor', label: 'Monitor', icon: IconMonitor, key: 'F4' },
]

const QUICK_COLORS: WireColor[] = ['black', 'red', 'blue', 'lightblue', 'brown', 'grey', 'orange', 'green-yellow', 'white', 'violet']

/** Menu suspenso simples, fecha ao clicar fora ou com Esc. */
function Dropdown({ label, icon, children, title, disabled = false, align = 'left' }: { label: ReactNode; icon?: ReactNode; children: (close: () => void) => ReactNode; title?: string; disabled?: boolean; align?: 'left' | 'right' }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const toggle = () => {
    if (!open && ref.current) {
      // posição fixa: a linha da toolbar tem overflow e cortaria um menu absoluto
      const r = ref.current.getBoundingClientRect()
      setPos({ top: r.bottom + 4, left: align === 'right' ? Math.max(8, r.right - 220) : Math.min(r.left, window.innerWidth - 240) })
    }
    setOpen((v) => !v)
  }
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])
  return (
    <div className="relative shrink-0" ref={ref}>
      <button className={`dc-btn ${open ? '!border-brand-400 !bg-brand-50 !text-brand-700' : ''}`} onClick={toggle} title={title} disabled={disabled} aria-expanded={open}>
        {icon}
        {label}
        <IconChevronDown size={11} className={`text-ink-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && pos && (
        <div className="tb-menu !fixed !mt-0" style={{ top: pos.top, left: pos.left }}>
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  )
}

export default function Toolbar({ mode, setMode }: { mode: ViewMode; setMode: (m: ViewMode) => void }) {
  const {
    activeScenario, loadScenario, sim, play, pause, stop, reset, setSpeed, setMode: setSimMode,
    step, saveJSON, loadJSON, newProject, tool, setTool, grid, setGrid, zoom, setZoom,
    components, undo, redo, history, future, organizeWires, wires, selectedComponentIds,
    alignSelection, distributeSelection, autoNumberWires, setCurrentProjectName,
    dirty, wireDefaults, setWireDefaults,
  } = useSimStore()
  const fileRef = useRef<HTMLInputElement>(null)

  // atalhos F1–F4 para as vistas
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const idx = ['F1', 'F2', 'F3', 'F4'].indexOf(e.key)
      if (idx >= 0) {
        e.preventDefault()
        setMode(VIEWS[idx].id)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setMode])

  const createNewProject = () => {
    if (dirty && !window.confirm('Criar um novo projeto e descartar alterações não guardadas?')) return
    newProject()
  }

  const saveBlob = (content: string, type: string, name: string) => {
    const blob = new Blob([content], { type })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = name
    a.click()
    URL.revokeObjectURL(url)
  }
  const downloadBOM = () => saveBlob('\uFEFF' + bomToCSV(buildBOM(components), wires), 'text/csv;charset=utf-8', `dc-simu-${activeScenario}-bom.csv`)
  const download = () => saveBlob(saveJSON(), 'application/json', `dc-simu-${activeScenario}.json`)

  const upload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (dirty && !window.confirm('Abrir este arquivo e descartar alterações não guardadas?')) {
      e.target.value = ''
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      loadJSON(String(reader.result))
      setCurrentProjectName(null)
      e.target.value = ''
    }
    reader.readAsText(file)
  }

  const segBtn = (active: boolean) => `dc-tool-btn ${active ? 'dc-tool-active' : ''}`
  const toggleCls = (on: boolean) => (on ? '!border-brand-300 !bg-brand-50 !text-brand-700' : '')

  const RUN_LABEL: Record<string, { text: string; cls: string }> = {
    running: { text: 'RUN', cls: 'bg-state-run' },
    paused: { text: 'PAUSE', cls: 'bg-state-pause' },
    stopped: { text: 'STOP', cls: 'bg-state-stop' },
  }
  const runBadge = RUN_LABEL[sim.runState] ?? RUN_LABEL.stopped
  const isCanvas = mode === 'schematic' || mode === 'panel3d'
  const sel = selectedComponentIds.length

  return (
    <div className="shrink-0 bg-surface-rail border-b border-line shadow-xs relative z-20">
      {/* ============================ linha 1 — marca · arquivo · vistas · simulação */}
      <div className="flex items-center gap-2 px-3 h-[46px] border-b border-line-soft">
        <div className="flex items-center gap-2 pr-1 shrink-0 select-none">
          <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden className="shrink-0">
            <rect x="1" y="1" width="22" height="22" rx="5" fill="#2655e5" />
            <path d="M13.5 4.5 7 13.5h4l-1.5 6 6.5-9h-4z" fill="#fff" />
          </svg>
          <div className="leading-none whitespace-nowrap hidden sm:block">
            <div className="text-[13px] font-bold tracking-tight text-ink-900">
              DC<span className="text-brand-600">-</span>SIMU
            </div>
            <div className="text-[8.5px] font-semibold uppercase tracking-[0.14em] text-ink-400 mt-0.5">comandos elétricos</div>
          </div>
        </div>

        <span className="tb-sep" />

        {/* arquivo — ações frequentes com ícone, restante no menu */}
        <div className="flex items-center gap-1 shrink-0">
          <div className="dc-seg" role="toolbar" aria-label="Arquivo">
            <button onClick={createNewProject} className={segBtn(false)} title="Novo projeto em branco">
              <IconFile size={13} /> <span className="hidden xl:inline">Novo</span>
            </button>
            <button onClick={() => fileRef.current?.click()} className={segBtn(false)} title="Abrir projeto (.json)">
              <IconOpen size={13} /> <span className="hidden xl:inline">Abrir</span>
            </button>
            <button onClick={download} className={segBtn(false)} title="Salvar projeto em arquivo JSON">
              <IconSave size={13} /> <span className="hidden xl:inline">Salvar</span>
              {dirty && <span className="h-1.5 w-1.5 rounded-full bg-state-pause" title="Alterações por guardar" />}
            </button>
            <button onClick={downloadBOM} disabled={!components.length} className={segBtn(false)} title="Exportar lista de materiais (CSV)">
              <IconDownload size={13} /> <span className="hidden xl:inline">BOM</span>
            </button>
          </div>
          <input ref={fileRef} type="file" accept=".json" className="hidden" onChange={upload} />
          <ProjectsPanel />
        </div>

        {/* vistas — centralizadas */}
        <div className="flex-1 flex justify-center min-w-0">
          <div className="dc-seg !rounded-[8px] p-0.5 gap-0.5 !bg-surface-sunken/70 !border-line-soft" role="tablist" aria-label="Vistas">
            {VIEWS.map(({ id, label, icon: Icon, key }) => (
              <button
                key={id}
                role="tab"
                aria-selected={mode === id}
                onClick={() => setMode(id)}
                className={`inline-flex items-center gap-1.5 h-[28px] px-3 rounded-[6px] text-xs font-semibold transition-colors !border-0 ${
                  mode === id ? 'bg-white text-brand-700 shadow-sm ring-1 ring-line' : 'text-ink-500 hover:text-ink-900 hover:bg-white/60'
                }`}
                title={`${label} [${key}]`}
              >
                <Icon size={14} />
                <span className="hidden md:inline">{label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* simulação + estado — canto direito */}
        <div className="flex items-center gap-1.5 shrink-0">
          <div className="dc-seg" role="toolbar" aria-label="Controle de simulação">
            <button
              onClick={play}
              disabled={sim.runState === 'running'}
              className={`dc-tool-btn !font-semibold ${sim.runState === 'running' ? '' : '!text-state-run'}`}
              title="Iniciar simulação (RUN)"
            >
              <IconPlay size={13} /> <span className="hidden lg:inline">Run</span>
            </button>
            <button onClick={pause} disabled={sim.runState !== 'running'} className={`${segBtn(false)} !px-2 !text-state-pause`} title="Pausar">
              <IconPause size={13} />
            </button>
            <button onClick={stop} disabled={sim.runState === 'stopped'} className={`${segBtn(false)} !px-2 !text-ink-700`} title="Parar (STOP)">
              <IconStop size={13} />
            </button>
            <button onClick={step} className={`${segBtn(false)} !px-2 !text-brand-600`} title="Avançar um ciclo de varredura">
              <IconStep size={13} />
            </button>
            <button onClick={reset} className={`${segBtn(false)} !px-2`} title="Recarregar o cenário">
              <IconReset size={13} />
            </button>
          </div>
          <select
            value={sim.mode}
            onChange={(e) => setSimMode(e.target.value as any)}
            className="dc-select !w-auto hidden lg:block"
            title="Modo de execução: tempo real = 100 ms por ciclo; turbo = ciclos acelerados; passo a passo = um ciclo por clique"
          >
            <option value="realtime">Tempo real</option>
            <option value="turbo">Turbo</option>
            <option value="step">Passo a passo</option>
          </select>
          <select value={sim.speed} onChange={(e) => setSpeed(Number(e.target.value))} className="dc-select !w-[62px]" title="Velocidade da simulação">
            {[0.25, 0.5, 1, 2, 4, 10].map((v) => (
              <option key={v} value={v}>{v}×</option>
            ))}
          </select>
          <span className="tb-sep" />
          <span
            className={`inline-flex items-center gap-1.5 h-[24px] px-2.5 rounded-[5px] font-mono text-[11px] font-bold tracking-[0.08em] text-white whitespace-nowrap ${runBadge.cls}`}
            title={`Estado do simulador: ${runBadge.text} · scan #${sim.scanCount}`}
          >
            {sim.runState === 'running' ? (
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-70" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-white" />
              </span>
            ) : (
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-white/80" />
            )}
            {runBadge.text}
          </span>
        </div>
      </div>

      {/* ============================ linha 2 — contextual à vista ativa */}
      <div className="flex items-center gap-1.5 px-3 h-[40px] overflow-x-auto flex-nowrap toolbar-scroll">
        {/* desfazer / refazer — comum a todas as vistas */}
        <div className="dc-seg" role="toolbar" aria-label="Histórico">
          <button onClick={undo} disabled={!history.length} className={`${segBtn(false)} !px-2`} title="Desfazer [Ctrl+Z]">
            <IconUndo size={13} />
          </button>
          <button onClick={redo} disabled={!future.length} className={`${segBtn(false)} !px-2`} title="Refazer [Ctrl+Y]">
            <IconRedo size={13} />
          </button>
        </div>

        {isCanvas && (
          <>
            <span className="tb-sep" />
            <div className="dc-seg" role="toolbar" aria-label="Ferramentas de edição">
              {TOOLS.map((t) => {
                const Icon = t.icon
                return (
                  <button key={t.id} onClick={() => setTool(t.id)} className={segBtn(tool === t.id)} title={`${t.hint} [${t.key}]`}>
                    <Icon size={13} />
                    <span className="hidden lg:inline">{t.label}</span>
                    <kbd className={`hidden 2xl:inline text-[9px] font-mono px-1 rounded ${tool === t.id ? 'bg-white/20' : 'bg-surface-sunken text-ink-400'}`}>{t.key}</kbd>
                  </button>
                )
              })}
            </div>
          </>
        )}

        {/* opções da ferramenta Cabo: aplicadas aos próximos cabos */}
        {isCanvas && tool === 'wire' && (
          <>
            <span className="tb-sep" />
            <span className="tb-label">Novo cabo</span>
            <div className="flex items-center gap-1 rounded-[6px] border border-line bg-white px-1.5 h-[28px] shadow-xs">
              <button
                onClick={() => setWireDefaults({ autoColor: !wireDefaults.autoColor })}
                className={`h-[18px] px-1.5 rounded-full text-[9.5px] font-bold border ${wireDefaults.autoColor ? 'border-brand-400 bg-brand-50 text-brand-700' : 'border-line text-ink-400'}`}
                title="Cor automática pela função do cabo (força preto, comando vermelho, neutro azul, PE verde-amarelo…)"
              >
                AUTO
              </button>
              {QUICK_COLORS.map((c) => (
                <button
                  key={c}
                  className={`tb-swatch ${!wireDefaults.autoColor && wireDefaults.color === c ? 'is-active' : ''}`}
                  style={{ background: c === 'green-yellow' ? 'repeating-linear-gradient(45deg,#84cc16 0 4px,#eab308 4px 8px)' : WIRE_COLORS[c] }}
                  title={`Cor: ${c}`}
                  onClick={() => setWireDefaults({ color: c, autoColor: false })}
                />
              ))}
            </div>
            <div className="dc-seg" role="group" aria-label="Condutor">
              <button className={`${segBtn(wireDefaults.flexibility === 'flexible')} !px-1.5`} onClick={() => setWireDefaults({ flexibility: 'flexible' })} title="Condutor flexível (multifilar) — curvas suaves">
                <ConductorIcon flexible size={30} color={wireDefaults.flexibility === 'flexible' ? '#fff' : '#475569'} />
                <span className="hidden xl:inline">Flexível</span>
              </button>
              <button className={`${segBtn(wireDefaults.flexibility === 'rigid')} !px-1.5`} onClick={() => setWireDefaults({ flexibility: 'rigid' })} title="Condutor rígido (fio sólido) — dobras a 90°">
                <ConductorIcon flexible={false} size={30} color={wireDefaults.flexibility === 'rigid' ? '#fff' : '#475569'} />
                <span className="hidden xl:inline">Rígido</span>
              </button>
            </div>
            <select className="dc-select !w-auto" value={wireDefaults.gauge} onChange={(e) => setWireDefaults({ gauge: e.target.value })} title="Seção dos novos cabos">
              {GAUGES.map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
            <Dropdown
              label={<span className="hidden xl:inline">{WIRE_END_OPTIONS.find((o) => o.id === wireDefaults.endType)?.label}</span>}
              icon={<WireEndIcon type={wireDefaults.endType} size={26} color={wireDefaults.autoColor ? '#ef4444' : WIRE_COLORS[wireDefaults.color]} />}
              title="Terminal aplicado às pontas dos novos cabos"
            >
              {(close) =>
                WIRE_END_OPTIONS.map((o) => (
                  <button
                    key={o.id}
                    className={`tb-menu-item ${wireDefaults.endType === o.id ? '!bg-brand-50 !text-brand-700 font-semibold' : ''}`}
                    onClick={() => {
                      setWireDefaults({ endType: o.id as WireEndType })
                      close()
                    }}
                    title={o.hint}
                  >
                    <WireEndIcon type={o.id} size={30} />
                    {o.label}
                  </button>
                ))
              }
            </Dropdown>
          </>
        )}

        {mode === 'schematic' && (
          <>
            <span className="tb-sep" />
            <Dropdown label={<span className="hidden lg:inline">Organizar</span>} icon={<IconOrganize size={13} />} title="Alinhar, distribuir e organizar cabos">
              {(close) => (
                <>
                  <div className="px-2 pt-1 pb-1 text-[9px] font-bold uppercase tracking-[0.1em] text-ink-300">Alinhar ({sel} sel.)</div>
                  <div className="grid grid-cols-6 gap-0.5 px-1 pb-1">
                    {ALIGN_BUTTONS.map((a) => {
                      const Icon = a.icon
                      return (
                        <button key={a.edge} className="dc-icon-btn" disabled={sel < 2} title={`${a.hint} (2+ componentes)`} onClick={() => alignSelection(a.edge)}>
                          <Icon size={13} />
                        </button>
                      )
                    })}
                  </div>
                  <button className="tb-menu-item" disabled={sel < 3} onClick={() => { distributeSelection('horizontal'); close() }}>
                    <IconDistH size={13} /> Distribuir na horizontal <kbd>3+</kbd>
                  </button>
                  <button className="tb-menu-item" disabled={sel < 3} onClick={() => { distributeSelection('vertical'); close() }}>
                    <IconDistV size={13} /> Distribuir na vertical <kbd>3+</kbd>
                  </button>
                  <div className="my-1 h-px bg-line-soft" />
                  <button className="tb-menu-item" disabled={!wires.length} onClick={() => { organizeWires(); close() }}>
                    <IconOrganize size={13} /> Reorganizar roteamento dos cabos
                  </button>
                  <button className="tb-menu-item" disabled={!wires.length} onClick={() => { autoNumberWires('missing'); close() }}>
                    <IconTag size={13} /> Numerar cabos sem número
                  </button>
                  <button className="tb-menu-item" disabled={!wires.length} onClick={() => { autoNumberWires('all'); close() }}>
                    <IconTag size={13} /> Renumerar todos (W1…)
                  </button>
                </>
              )}
            </Dropdown>
          </>
        )}

        <div className="flex-1 min-w-[8px]" />

        {/* vista: malha e zoom */}
        {(isCanvas || mode === 'ladder') && (
          <div className="flex items-center gap-1 shrink-0">
            <div className="dc-seg" role="group" aria-label="Malha">
              <button onClick={() => setGrid({ enabled: !grid.enabled })} className={`${segBtn(false)} !px-2 ${toggleCls(grid.enabled)}`} title="Mostrar/ocultar malha">
                <IconGrid size={13} />
              </button>
              {isCanvas && (
                <button onClick={() => setGrid({ snap: !grid.snap })} className={`${segBtn(false)} !px-2 ${toggleCls(grid.snap)}`} title="Encaixar na malha (ímã)">
                  <IconMagnet size={13} />
                </button>
              )}
            </div>
            {isCanvas && (
              <select value={grid.size} onChange={(e) => setGrid({ size: Number(e.target.value) })} className="dc-select !w-[66px]" title="Passo da malha do esquema (as networks Ladder usam sempre 20px)">
                {[5, 10, 20, 25, 50].map((n) => (
                  <option key={n} value={n}>{n}px</option>
                ))}
              </select>
            )}
            {mode === 'schematic' && (
              <div className="dc-seg" role="toolbar" aria-label="Zoom">
                <button onClick={() => setZoom(zoom * 0.9)} className={`${segBtn(false)} !px-1.5`} title="Reduzir zoom [Ctrl+roda]">
                  <IconZoomOut size={13} />
                </button>
                <button onClick={() => { setZoom(1); useSimStore.getState().setPan(0, 0) }} className={`${segBtn(false)} !px-2 font-mono tabular-nums min-w-[48px] justify-center`} title="Restaurar zoom e posição (100%)">
                  {(zoom * 100).toFixed(0)}%
                </button>
                <button onClick={() => setZoom(zoom * 1.1)} className={`${segBtn(false)} !px-1.5`} title="Ampliar zoom [Ctrl+roda]">
                  <IconZoomIn size={13} />
                </button>
              </div>
            )}
            <span className="tb-sep" />
          </div>
        )}

        {/* cenário + treino */}
        <select value={activeScenario} onChange={(e) => loadScenario(e.target.value)} className="dc-select !w-auto max-w-[190px] shrink-0" title="Cenário de aplicação">
          <option value="direct-start">Partida Direta com Selo</option>
          <option value="reversal">Reversão de Motor</option>
          <option value="star-delta">Partida Estrela-Triângulo</option>
          <option value="sequential">Partida Sequencial + Contagem</option>
          <option value="custom">Projeto personalizado</option>
        </select>
        <button
          onClick={() => useSimStore.getState().toggleBlackBox()}
          className={`dc-btn ${sim.blackBox ? '!border-amber-300 !bg-amber-50 !text-amber-700' : ''}`}
          title="Modo caixa-preta: esconde o ladder e força diagnóstico por medição"
        >
          <IconLock size={13} /> <span className="hidden xl:inline">{sim.blackBox ? 'Caixa-preta ON' : 'Caixa-preta'}</span>
        </button>
      </div>
    </div>
  )
}
