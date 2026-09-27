import { useRef } from 'react'
import { useSimStore } from '../store/useSimStore'
import type { EditorTool } from '../types'

export type ViewMode = 'schematic' | 'panel3d' | 'monitor'

const TOOLS: Array<{ id: EditorTool; label: string; icon: string; hint: string }> = [
  { id: 'select', label: 'Selecionar', icon: '▣', hint: 'Selecionar / arrastar componentes (1)' },
  { id: 'wire', label: 'Cabo', icon: '⌁', hint: 'Desenhar cabo entre bornes (2)' },
  { id: 'probe', label: 'Sonda', icon: '⏚', hint: 'Medir continuidade entre dois pontos (3)' },
  { id: 'erase', label: 'Apagar', icon: '⌫', hint: 'Apagar cabo/borne sob o cursor' },
  { id: 'pan', label: 'Panorâmica', icon: '✥', hint: 'Mover a vista' },
]

export default function Toolbar({ mode, setMode }: { mode: ViewMode; setMode: (m: ViewMode) => void }) {
  const {
    activeScenario,
    loadScenario,
    sim,
    play,
    pause,
    stop,
    reset,
    setSpeed,
    setMode: setSimMode,
    step,
    saveJSON,
    loadJSON,
    newProject,
    tool,
    setTool,
    grid,
    setGrid,
    zoom,
    setZoom,
    components,
    undo,
    redo,
    history,
    future,
    toggleBlackBox,
    organizeWires,
    wires,
  } = useSimStore()
  const fileRef = useRef<HTMLInputElement>(null)

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
    const reader = new FileReader()
    reader.onload = () => loadJSON(String(reader.result))
    reader.readAsText(file)
  }

  const btn = 'text-xs px-2 py-1 rounded border border-neutral-700 bg-neutral-800 hover:bg-neutral-700 text-neutral-100 disabled:opacity-40'

  return (
    <div className="flex items-center gap-x-2 gap-y-1 px-3 py-2 bg-neutral-900 border-b border-neutral-800 flex-wrap">
      <span className="font-bold text-white text-sm mr-1">
        ⚡ <span className="text-cyan-400">DC</span>-Simu
      </span>

      <select
        value={activeScenario}
        onChange={(e) => loadScenario(e.target.value)}
        className="bg-neutral-800 text-neutral-200 text-xs rounded px-2 py-1 border border-neutral-700"
        title="Cenário de aplicação"
      >
        <option value="direct-start">Partida Direta com Selo</option>
        <option value="reversal">Reversão de Motor</option>
        <option value="star-delta">Partida Estrela-Triângulo</option>
        <option value="sequential">Partida Sequencial + Contagem</option>
        <option value="custom">— projeto personalizado —</option>
      </select>

      <button onClick={newProject} className={btn} title="Novo projeto em branco">＋ Novo</button>

      <div className="w-px h-5 bg-neutral-700" />

      {/* ------- ferramentas de edição ------- */}
      <div className="flex items-center bg-neutral-800 rounded overflow-hidden border border-neutral-700">
        {TOOLS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTool(t.id)}
            title={t.hint}
            className={`text-xs px-2 py-1 ${tool === t.id ? 'bg-cyan-600 text-white' : 'text-neutral-400 hover:text-white'}`}
          >
            <span className="mr-1">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      <button onClick={undo} disabled={!history.length} className={btn} title="Desfazer (Ctrl+Z)">↶</button>
      <button onClick={redo} disabled={!future.length} className={btn} title="Refazer (Ctrl+Y)">↷</button>
      <button
        onClick={() => organizeWires()}
        disabled={!wires.length}
        className={btn}
        title="Reorganiza automaticamente o roteamento de todos os cabos, distribuindo as dobras para evitar sobreposição"
      >
        🧭 Organizar cabos
      </button>

      <div className="w-px h-5 bg-neutral-700" />

      {/* ------- simulação ------- */}
      <button onClick={play} disabled={sim.runState === 'running'} className="text-xs px-2 py-1 rounded bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 text-white">▶ Iniciar</button>
      <button onClick={pause} disabled={sim.runState !== 'running'} className="text-xs px-2 py-1 rounded bg-amber-700 hover:bg-amber-600 disabled:opacity-40 text-white">⏸ Pausar</button>
      <button onClick={stop} className="text-xs px-2 py-1 rounded bg-neutral-700 hover:bg-neutral-600 text-white">■ Parar</button>
      <button onClick={reset} className="text-xs px-2 py-1 rounded bg-neutral-700 hover:bg-neutral-600 text-white" title="Recarrega o cenário">↻ Reset</button>
      <button onClick={step} className="text-xs px-2 py-1 rounded bg-blue-700 hover:bg-blue-600 text-white" title="Avança um ciclo de varredura">⏭ Passo</button>

      <label className="flex items-center gap-1 text-xs text-neutral-400 ml-1">
        <input
          type="checkbox"
          checked={sim.stepMode}
          onChange={(e) => setSimMode(e.target.checked ? 'step' : 'realtime')}
        />
        Passo a passo
      </label>

      <label className="flex items-center gap-1 text-xs text-neutral-400">
        Modo
        <select
          value={sim.mode}
          onChange={(e) => setSimMode(e.target.value as any)}
          className="bg-neutral-800 rounded px-1 py-0.5 border border-neutral-700"
          title="realtime = 100 ms por ciclo; turbo = ciclos acelerados"
        >
          <option value="realtime">Tempo real</option>
          <option value="turbo">Turbo</option>
          <option value="step">Passo a passo</option>
        </select>
      </label>

      <label className="flex items-center gap-1 text-xs text-neutral-400">
        Vel.
        <select value={sim.speed} onChange={(e) => setSpeed(Number(e.target.value))} className="bg-neutral-800 rounded px-1 py-0.5 border border-neutral-700">
          <option value={0.25}>0.25x</option>
          <option value={0.5}>0.5x</option>
          <option value={1}>1x</option>
          <option value={2}>2x</option>
          <option value={4}>4x</option>
          <option value={10}>10x</option>
        </select>
      </label>

      <div className="w-px h-5 bg-neutral-700" />

      {/* ------- malha ------- */}
      <label className="flex items-center gap-1 text-xs text-neutral-400" title="Mostrar malha (grid)">
        <input type="checkbox" checked={grid.enabled} onChange={(e) => setGrid({ enabled: e.target.checked })} />
        Malha
      </label>
      <label className="flex items-center gap-1 text-xs text-neutral-400" title="Encaixar na malha">
        <input type="checkbox" checked={grid.snap} onChange={(e) => setGrid({ snap: e.target.checked })} />
        Ímã
      </label>
      <select
        value={grid.size}
        onChange={(e) => setGrid({ size: Number(e.target.value) })}
        className="bg-neutral-800 rounded px-1 py-0.5 text-xs border border-neutral-700"
        title="Passo da malha"
      >
        {[5, 10, 20, 25, 50].map((n) => (
          <option key={n} value={n}>{n}px</option>
        ))}
      </select>
      <select
        value={grid.style}
        onChange={(e) => setGrid({ style: e.target.value as any })}
        className="bg-neutral-800 rounded px-1 py-0.5 text-xs border border-neutral-700"
        title="Estilo da malha"
      >
        <option value="dots">Pontos</option>
        <option value="lines">Linhas</option>
      </select>

      <div className="flex items-center gap-1 text-xs text-neutral-400">
        <button onClick={() => setZoom(zoom * 0.9)} className={btn}>−</button>
        <span className="w-10 text-center">{(zoom * 100).toFixed(0)}%</span>
        <button onClick={() => setZoom(zoom * 1.1)} className={btn}>＋</button>
        <button onClick={() => { setZoom(1); useSimStore.getState().setPan(0, 0) }} className={btn}>100%</button>
      </div>

      <div className="w-px h-5 bg-neutral-700" />

      {/* ------- vistas ------- */}
      <div className="flex items-center bg-neutral-800 rounded overflow-hidden border border-neutral-700">
        {(['schematic', 'panel3d', 'monitor'] as ViewMode[]).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`text-xs px-3 py-1 ${mode === m ? 'bg-blue-600 text-white' : 'text-neutral-400 hover:text-white'}`}
          >
            {m === 'schematic' ? 'Editor de Esquema' : m === 'panel3d' ? 'Painel 3D' : 'Monitor'}
          </button>
        ))}
      </div>

      <div className="ml-auto flex items-center gap-2">
        <span className={`text-[11px] px-2 py-0.5 rounded-full border ${sim.runState === 'running' ? 'border-emerald-500 text-emerald-400' : 'border-neutral-600 text-neutral-500'}`}>
          {sim.runState === 'running' ? '● SIMULANDO' : sim.runState === 'paused' ? '⏸ PAUSADO' : '■ PARADO'} · scan #{sim.scanCount} · {components.length} comp.
        </span>
        <button
          onClick={toggleBlackBox}
          className={`text-xs px-2 py-1 rounded border ${sim.blackBox ? 'border-cyan-500 text-cyan-300 bg-cyan-950/40' : 'border-neutral-700 bg-neutral-800 text-neutral-300'}`}
          title="Modo caixa-preta: esconde o ladder e força diagnóstico por medição"
        >
          {sim.blackBox ? 'Caixa-preta ON' : 'Caixa-preta'}
        </button>
        <button onClick={download} className={btn}>Salvar JSON</button>
        <button onClick={() => fileRef.current?.click()} className={btn}>Abrir JSON</button>
        <input ref={fileRef} type="file" accept=".json" className="hidden" onChange={upload} />
      </div>
    </div>
  )
}
