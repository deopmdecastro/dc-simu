import { useEffect, useRef, useState } from 'react'
import { useSimStore } from '../store/useSimStore'
import { listProjects, type ProjectMeta } from '../utils/persistence'

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString('pt-PT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  } catch {
    return iso
  }
}

/**
 * Botão + popover para guardar e reabrir projetos no navegador (localStorage).
 * Também trata os atalhos globais Ctrl+S (guardar) e Ctrl+Shift+O (abrir a
 * lista de projetos) — funcionam em qualquer vista, já que este componente
 * fica sempre montado na Toolbar.
 */
export default function ProjectsPanel() {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [projects, setProjects] = useState<ProjectMeta[]>([])
  const ref = useRef<HTMLDivElement>(null)
  const nameInputRef = useRef<HTMLInputElement>(null)
  const currentProjectName = useSimStore((s) => s.currentProjectName)
  const dirty = useSimStore((s) => s.dirty)

  const refresh = () => setProjects(listProjects())

  useEffect(() => {
    if (!open) return
    refresh()
    setName(currentProjectName ?? '')
    // pequeno delay para o popover já estar no DOM antes de focar
    const id = window.setTimeout(() => nameInputRef.current?.focus(), 0)
    return () => window.clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  // ------------------------------------------------- atalhos globais
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === 's') {
        e.preventDefault()
        const st = useSimStore.getState()
        if (st.currentProjectName) {
          st.saveProjectAs(st.currentProjectName)
          if (open) refresh()
        } else {
          setName(`Projeto ${new Date().toLocaleDateString('pt-PT')}`)
          setOpen(true)
        }
      } else if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'o') {
        e.preventDefault()
        refresh()
        setOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const save = () => {
    if (!name.trim()) return
    useSimStore.getState().saveProjectAs(name.trim())
    refresh()
  }

  const load = (n: string) => {
    useSimStore.getState().loadProjectByName(n)
    setOpen(false)
  }

  const remove = (n: string) => {
    if (!window.confirm(`Eliminar o projeto guardado "${n}"? Esta ação não pode ser desfeita.`)) return
    useSimStore.getState().deleteProjectByName(n)
    refresh()
  }

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Guardar / reabrir projetos guardados neste navegador — Ctrl+S guarda, Ctrl+Shift+O abre esta lista"
        className={`text-xs px-2 py-1 rounded border max-w-[160px] truncate ${
          currentProjectName ? 'border-cyan-600 text-cyan-300 bg-cyan-950/30' : 'border-neutral-700 bg-neutral-800 text-neutral-200'
        } hover:bg-neutral-700`}
      >
        💾 {currentProjectName ? `${currentProjectName}${dirty ? ' •' : ''}` : 'Projetos'}
      </button>
      {open && (
        <div className="absolute z-30 right-0 mt-1 w-72 max-h-96 overflow-y-auto bg-neutral-900 border border-neutral-700 rounded shadow-xl p-2 text-xs">
          <div className="text-[10px] uppercase tracking-wide text-neutral-500 mb-1">Guardar neste navegador</div>
          <div className="flex gap-1 mb-2">
            <input
              ref={nameInputRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') save()
              }}
              placeholder="nome do projeto…"
              className="flex-1 bg-neutral-800 border border-neutral-700 rounded px-1.5 py-1 text-[11px] text-neutral-100 outline-none focus:border-cyan-500"
            />
            <button onClick={save} disabled={!name.trim()} className="px-2 py-1 rounded bg-cyan-700 hover:bg-cyan-600 disabled:opacity-40 text-white">
              Guardar
            </button>
          </div>

          <div className="text-[10px] uppercase tracking-wide text-neutral-500 mb-1">Projetos guardados ({projects.length})</div>
          {!projects.length && <p className="text-neutral-600 text-[10px] mb-1">Nenhum projeto guardado ainda neste navegador.</p>}
          <div className="flex flex-col gap-1">
            {projects.map((p) => (
              <div
                key={p.name}
                className={`flex items-center gap-1 rounded border px-1.5 py-1 ${
                  p.name === currentProjectName ? 'border-cyan-700 bg-cyan-950/30' : 'border-neutral-700 bg-neutral-800/60'
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="truncate text-neutral-200">{p.name}</div>
                  <div className="text-[9px] text-neutral-500">{formatDate(p.savedAt)}</div>
                </div>
                <button onClick={() => load(p.name)} className="px-1.5 py-0.5 rounded bg-neutral-700 hover:bg-neutral-600 text-neutral-100" title="Reabrir este projeto">
                  Abrir
                </button>
                <button onClick={() => remove(p.name)} className="text-red-400 hover:text-red-300 px-1" title="Eliminar">
                  ✕
                </button>
              </div>
            ))}
          </div>

          <p className="text-[9px] text-neutral-600 mt-2 leading-relaxed">
            Guardado localmente neste navegador — sobrevive a fechar a aba ou reiniciar o computador, mas não passa
            para outro dispositivo. Para levar o projeto a outro computador, usa "Salvar JSON" / "Abrir JSON".
          </p>
        </div>
      )}
    </div>
  )
}
