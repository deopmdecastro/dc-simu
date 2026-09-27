import { useRef } from 'react'
import { useSimStore } from '../store/useSimStore'
import type { EditorTool } from '../types'
import { buildBOM, bomToCSV } from '../utils/bom'
import ProjectsPanel from './ProjectsPanel'
import {
  IconFile, IconSave, IconOpen, IconCursor, IconWire, IconProbe, IconErase, IconPan,
  IconUndo, IconRedo, IconOrganize, IconTag, IconAlignLeft, IconAlignCenterH, IconAlignRight,
  IconAlignTop, IconAlignCenterV, IconAlignBottom, IconDistH, IconDistV, IconPlay, IconPause,
  IconStop, IconStep, IconReset, IconGrid, IconMagnet, IconZoomIn, IconZoomOut,
  IconSchematic, IconLadder, IconCube, IconMonitor, IconDownload, IconLock,
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
  { id: 'pan', label: 'Panorâmica', icon: IconPan, hint: 'Mover a vista (ou botão do meio / Alt+arrastar)', key: '5' },
]

/** Marcador de instrução de teclado (ex.: "1", "Ctrl+Z") exibido nas tooltips. */
function Kbd({ children }: { children: string }) {
  return <kbd className="ml-1 rounded border border-white/30 bg-white/15 px-1 text-[9px] font-semibold leading-[14px]">{children}</kbd>
}

export default function Toolbar({ mode, setMode }: { mode: ViewMode; setMode: (m: ViewMode) => void }) {
  const {
    activeScenario, loadScenario, sim, play, pause, stop, reset, setSpeed, setMode: setSimMode,
    step, saveJSON, loadJSON, newProject, tool, setTool, grid, setGrid, zoom, setZoom,
    components, undo, redo, history, future, organizeWires, wires, selectedComponentIds,
    alignSelection, distributeSelection, autoNumberWires, setCurrentProjectName,
    dirty,
  } = useSimStore()
  const fileRef = useRef<HTMLInputElement>(null)

  const createNewProject = () => {
    if (dirty && !window.confirm('Criar um novo projeto e descartar alterações não guardadas?')) return
    newProject()
  }

  const downloadBOM = () => {
    const rows = buildBOM(components)
    const csv = bomToCSV(rows, wires)
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `dc-simu-${activeScenario}-bom.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const download = () => {
    const blob = new Blob([saveJSON()], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `dc-simu-${activeScenario}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

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

  const btn = 'dc-btn'
  const segBtn = (active: boolean) => `dc-tool-btn ${active ? 'dc-tool-active' : ''}`

  const RUN_LABEL: Record<string, { text: string; cls: string }> = {
    running: { text: 'RUN', cls: 'bg-state-run text-white' },
    paused: { text: 'PAUSE', cls: 'bg-state-pause text-white' },
    stopped: { text: 'STOP', cls: 'bg-state-stop text-white' },
  }
  const runBadge = RUN_LABEL[sim.runState] ?? RUN_LABEL.stopped

  return (
    <div className="shrink-0 bg-surface-rail border-b border-line shadow-xs">
      {/* ================================================== linha 1 — arquivo + vistas + estado */}
      <div className="flex items-center gap-2 px-3 h-[42px]">
        <div className="flex-1 min-w-0 flex items-center gap-2 overflow-x-auto toolbar-scroll">
          {/* marca */}
          <div className="flex items-center gap-2 pr-1 shrink-0 select-none">
            <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden className="shrink-0">
              <rect x="1" y="1" width="22" height="22" rx="5" fill="#2655e5" />
              <path d="M13.5 4.5 7 13.5h4l-1.5 6 6.5-9h-4z" fill="#fff" />
            </svg>
            <div className="leading-none whitespace-nowrap">
              <div className="text-[13px] font-bold tracking-tight text-ink-900">
                DC<span className="text-brand-600">-</span>SIMU
              </div>
              <div className="text-[8.5px] font-semibold uppercase tracking-[0.14em] text-ink-400 mt-0.5">
                comandos elétricos
              </div>
            </div>
          </div>

          <div className="h-5 w-px bg-line shrink-0" />

          {/* vistas */}
          <div className="dc-seg" role="tablist" aria-label="Vistas">
            {(['schematic', 'ladder', 'panel3d', 'monitor'] as ViewMode[]).map((m) => {
              const Icon = m === 'schematic' ? IconSchematic : m === 'ladder' ? IconLadder : m === 'panel3d' ? IconCube : IconMonitor
              const lbl = m === 'schematic' ? 'Esquema' : m === 'ladder' ? 'Ladder' : m === 'panel3d' ? 'Painel 3D' : 'Monitor'
              return (
                <button key={m} role="tab" aria-selected={mode === m} onClick={() => setMode(m)} className={segBtn(mode === m)} title={lbl}>
                  <Icon size={13} />
                  {lbl}
                </button>
              )
            })}
          </div>

          {/* arquivo */}
          <button onClick={createNewProject} className={btn} title="Novo projeto em branco">
            <IconFile size={13} /> Novo
          </button>
          <button onClick={download} className={btn} title="Salvar projeto em arquivo JSON">
            <IconSave size={13} /> Salvar
          </button>
          <button onClick={() => fileRef.current?.click()} className={btn} title="Abrir projeto a partir de um arquivo JSON">
            <IconOpen size={13} /> Abrir
          </button>
          <input ref={fileRef} type="file" accept=".json" className="hidden" onChange={upload} />
          <ProjectsPanel />
        </div>

        {/* estado do PLC — sempre visível, canto direito, nunca encolhe nem sai da vista */}
        <div className="shrink-0 flex items-center gap-2 pl-2">
          {sim.runState === 'running' && <span className="relative flex h-2 w-2 shrink-0"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" /><span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" /></span>}
          <span
            className={`inline-flex items-center gap-1.5 h-[22px] px-2.5 rounded-[4px] font-mono text-[11px] font-bold tracking-[0.08em] text-white whitespace-nowrap ${runBadge.cls}`}
            title={`Estado do simulador: ${runBadge.text}`}
          >
            {runBadge.text}
          </span>
          <span className="font-mono text-[11px] text-ink-500 whitespace-nowrap" title="Ciclos de varredura executados">
            scan <span className="text-ink-900 font-semibold">#{sim.scanCount}</span>
          </span>
          <span className="font-mono text-[11px] text-ink-500 whitespace-nowrap" title="Componentes no projeto">
            {components.length} <span className="text-ink-400">comp.</span>
          </span>
        </div>
      </div>

      {/* ================================================== linha 2 — ferramentas */}
      <div className="flex items-center gap-1.5 px-3 pb-1.5 overflow-x-auto flex-nowrap toolbar-scroll">
        {/* projeto / cenário */}
        <span className="toolbar-section-label">Projeto</span>
        <select
          value={activeScenario}
          onChange={(e) => loadScenario(e.target.value)}
          className="dc-select !w-auto"
          title="Cenário de aplicação"
        >
          <option value="direct-start">Partida Direta com Selo</option>
          <option value="reversal">Reversão de Motor</option>
          <option value="star-delta">Partida Estrela-Triângulo</option>
          <option value="sequential">Partida Sequencial + Contagem</option>
          <option value="custom">— projeto personalizado —</option>
        </select>

        <div className="h-5 w-px bg-line" />

        {/* ferramentas de edição */}
        <span className="toolbar-section-label">Edição</span>
        <div className="dc-seg" role="toolbar" aria-label="Ferramentas de edição">
          {TOOLS.map((t) => {
            const Icon = t.icon
            return (
              <button
                key={t.id}
                onClick={() => setTool(t.id)}
                className={segBtn(tool === t.id)}
                title={`${t.hint} [${t.key}]`}
              >
                <Icon size={13} />
                {t.label}
                <Kbd>{t.key}</Kbd>
              </button>
            )
          })}
        </div>

        <button onClick={undo} disabled={!history.length} className={btn} title="Desfazer [Ctrl+Z]">
          <IconUndo size={13} />
        </button>
        <button onClick={redo} disabled={!future.length} className={btn} title="Refazer [Ctrl+Y]">
          <IconRedo size={13} />
        </button>

        <div className="h-5 w-px bg-line" />

        {/* alinhar / distribuir */}
        <div className="dc-seg" role="toolbar" aria-label="Alinhar e distribuir" title="Selecione 2+ componentes para alinhar, 3+ para distribuir">
          {ALIGN_BUTTONS.map((a) => {
            const Icon = a.icon
            return (
              <button
                key={a.edge}
                onClick={() => alignSelection(a.edge)}
                disabled={selectedComponentIds.length < 2}
                title={a.hint}
                className="dc-tool-btn !px-1.5 disabled:opacity-30"
              >
                <Icon size={13} />
              </button>
            )
          })}
          <button
            onClick={() => distributeSelection('horizontal')}
            disabled={selectedComponentIds.length < 3}
            title="Distribuir horizontalmente (3+ componentes)"
            className="dc-tool-btn !px-1.5 disabled:opacity-30"
          >
            <IconDistH size={13} />
          </button>
          <button
            onClick={() => distributeSelection('vertical')}
            disabled={selectedComponentIds.length < 3}
            title="Distribuir verticalmente (3+ componentes)"
            className="dc-tool-btn !px-1.5 disabled:opacity-30"
          >
            <IconDistV size={13} />
          </button>
        </div>

        <button onClick={() => organizeWires()} disabled={!wires.length} className={btn} title="Reorganiza o roteamento de todos os cabos, distribuindo as dobras para evitar sobreposição">
          <IconOrganize size={13} /> Organizar cabos
        </button>
        <button onClick={() => autoNumberWires('missing')} disabled={!wires.length} className={btn} title="Numera automaticamente os cabos sem identificação (Wn), continuando a sequência existente">
          <IconTag size={13} /> Numerar cabos
        </button>

        <div className="h-5 w-px bg-line" />

        {/* simulação */}
        <span className="toolbar-section-label">Simulação</span>
        <div className="dc-seg" role="toolbar" aria-label="Controle de simulação">
          <button onClick={play} disabled={sim.runState === 'running'} className={`${segBtn(false)} !text-state-run`} title="Iniciar simulação">
            <IconPlay size={13} /> Iniciar
          </button>
          <button onClick={pause} disabled={sim.runState !== 'running'} className={`${segBtn(false)} !text-state-pause`} title="Pausar simulação">
            <IconPause size={13} />
          </button>
          <button onClick={stop} className={`${segBtn(false)} !text-ink-700`} title="Parar simulação">
            <IconStop size={13} />
          </button>
          <button onClick={step} className={`${segBtn(false)} !text-brand-600`} title="Avança um ciclo de varredura">
            <IconStep size={13} />
          </button>
          <button onClick={reset} className={segBtn(false)} title="Recarrega o cenário">
            <IconReset size={13} /> Reset
          </button>
        </div>

        <select
          value={sim.mode}
          onChange={(e) => setSimMode(e.target.value as any)}
          className="dc-select !w-auto"
          title="Modo de execução: tempo real = 100 ms por ciclo; turbo = ciclos acelerados; passo a passo = um ciclo por clique"
        >
          <option value="realtime">Tempo real</option>
          <option value="turbo">Turbo</option>
          <option value="step">Passo a passo</option>
        </select>

        <select value={sim.speed} onChange={(e) => setSpeed(Number(e.target.value))} className="dc-select !w-auto" title="Velocidade da simulação">
          {[0.25, 0.5, 1, 2, 4, 10].map((v) => (
            <option key={v} value={v}>{v}×</option>
          ))}
        </select>

        <div className="h-5 w-px bg-line" />

        {/* malha / zoom */}
        <span className="toolbar-section-label">Vista</span>
        <button
          onClick={() => setGrid({ enabled: !grid.enabled })}
          className={`${btn} ${grid.enabled ? '!border-brand-300 !bg-brand-50 !text-brand-700' : ''}`}
          title="Mostrar/ocultar malha do canvas"
        >
          <IconGrid size={13} /> Malha
        </button>
        <button
          onClick={() => setGrid({ snap: !grid.snap })}
          className={`${btn} ${grid.snap ? '!border-brand-300 !bg-brand-50 !text-brand-700' : ''}`}
          title="Encaixar componentes na malha (ímã)"
        >
          <IconMagnet size={13} /> Ímã
        </button>
        <select value={grid.size} onChange={(e) => setGrid({ size: Number(e.target.value) })} className="dc-select !w-auto" title="Passo da malha">
          {[5, 10, 20, 25, 50].map((n) => (
            <option key={n} value={n}>{n} px</option>
          ))}
        </select>

        <div className="dc-seg ml-0.5" role="toolbar" aria-label="Zoom">
          <button onClick={() => setZoom(zoom * 0.9)} className={`${segBtn(false)} !px-1.5`} title="Reduzir zoom">
            <IconZoomOut size={13} />
          </button>
          <button
            onClick={() => { setZoom(1); useSimStore.getState().setPan(0, 0) }}
            className={`${segBtn(false)} !px-2 font-mono tabular-nums`}
            title="Restaurar zoom e posição (100%)"
          >
            {(zoom * 100).toFixed(0)}%
          </button>
          <button onClick={() => setZoom(zoom * 1.1)} className={`${segBtn(false)} !px-1.5`} title="Ampliar zoom">
            <IconZoomIn size={13} />
          </button>
        </div>

        {/* utilitários — direita */}
        <div className="ml-auto flex items-center gap-1.5">
        <button
          onClick={() => useSimStore.getState().toggleBlackBox()}
          className={`${btn} ${sim.blackBox ? '!border-amber-300 !bg-amber-50 !text-amber-700' : ''}`}
          title="Modo caixa-preta: esconde o ladder e força diagnóstico por medição"
        >
          <IconLock size={13} /> {sim.blackBox ? 'Caixa-preta ON' : 'Caixa-preta'}
        </button>
          <button onClick={downloadBOM} disabled={!components.length} className={btn} title="Exporta a lista de materiais (componentes + resumo de cabos) em CSV">
            <IconDownload size={13} /> BOM
          </button>
        </div>
      </div>
    </div>
  )
}
