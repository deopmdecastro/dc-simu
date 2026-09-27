import { useEffect, useRef, useState } from 'react'
import { useSimStore } from '../store/useSimStore'
import { listProjects, type ProjectMeta } from '../utils/persistence'
import { IconProjects, IconSave } from '../ui/icons'

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
        className={`dc-btn max-w-[170px] ${currentProjectName ? '!border-brand-300 !bg-brand-50 !text-brand-700' : ''} ${open ? '!border-brand-400 !bg-brand-100' : ''}`}
      >
        <IconProjects size={13} />
        <span className="truncate">{currentProjectName ? `${currentProjectName}${dirty ? ' •' : ''}` : 'Projetos'}</span>
      </button>
      {open && (
        <div className="absolute z-30 right-0 mt-1.5 w-80 max-h-96 overflow-y-auto bg-surface-panel border border-line rounded-md shadow-lg p-2.5 text-xs">
          <div className="dc-panel-title mb-1.5">Guardar neste navegador</div>
          <div className="flex gap-1 mb-3">
            <input
              ref={nameInputRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') save()
              }}
              placeholder="nome do projeto…"
              className="dc-input flex-1"
            />
            <button onClick={save} disabled={!name.trim()} className="dc-btn-primary dc-btn">
              <IconSave size={12} /> Guardar
            </button>
          </div>

          <div className="dc-panel-title mb-1.5">Projetos guardados ({projects.length})</div>
          {!projects.length && <p className="text-ink-400 text-[10px] mb-1">Nenhum projeto guardado ainda neste navegador.</p>}
          <div className="flex flex-col gap-1">
            {projects.map((p) => (
              <div
                key={p.name}
                className={`flex items-center gap-1 rounded-[5px] border px-1.5 py-1 ${
                  p.name === currentProjectName ? 'border-brand-300 bg-brand-50' : 'border-line bg-white'
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="truncate text-ink-900 font-medium">{p.name}</div>
                  <div className="text-[9px] text-ink-400">{formatDate(p.savedAt)}</div>
                </div>
                <button onClick={() => load(p.name)} className="dc-btn !h-5 !px-1.5 !text-[10px]" title="Reabrir este projeto">
                  Abrir
                </button>
                <button onClick={() => remove(p.name)} className="dc-icon-btn !w-5 !h-5 !border-transparent !text-ink-300 hover:!text-state-error hover:!bg-state-errorbg" title="Eliminar">
                  ✕
                </button>
              </div>
            ))}
          </div>

          <p className="text-[9px] text-ink-400 mt-2.5 leading-relaxed border-t border-line-soft pt-2">
            Guardado localmente neste navegador — sobrevive a fechar a aba ou reiniciar o computador, mas não passa
            para outro dispositivo. Para levar o projeto a outro computador, usa "Salvar" / "Abrir" (JSON) na toolbar.
          </p>
        </div>
      )}
    </div>
  )
}
