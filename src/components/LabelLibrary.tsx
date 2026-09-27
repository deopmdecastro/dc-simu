import { useEffect, useRef, useState } from 'react'
import { STANDARD_LABEL_CATEGORIES } from '../electrical/standardLabels'

/**
 * Botão + popover com a biblioteca de etiquetas padronizadas (IEC 60445/60947).
 * Usado no inspetor de bornes e de cabos para inserir rótulos normalizados
 * (L1, PE, A1/A2, 13-14, U1/V1/W1…) sem digitação manual. As etiquetas da
 * biblioteca são "catálogo" (por isso o cadeado) — o campo continua editável
 * livremente, o picker só agiliza o caso comum.
 */
export default function LabelLibrary({ onPick, title = 'Biblioteca de etiquetas (IEC)' }: { onPick: (label: string) => void; title?: string }) {
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const f = filter.trim().toUpperCase()
  const categories = STANDARD_LABEL_CATEGORIES.map((c) => ({
    ...c,
    labels: f ? c.labels.filter((l) => l.toUpperCase().includes(f)) : c.labels,
  })).filter((c) => c.labels.length)

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title={title}
        className="text-[10px] px-1.5 py-1 rounded border border-neutral-700 bg-neutral-800 hover:bg-neutral-700 text-neutral-300"
      >
        📋
      </button>
      {open && (
        <div className="absolute z-30 right-0 mt-1 w-64 max-h-80 overflow-y-auto bg-neutral-900 border border-neutral-700 rounded shadow-xl p-2">
          <div className="text-[10px] uppercase tracking-wide text-neutral-500 mb-1">{title}</div>
          <input
            autoFocus
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="filtrar…"
            className="w-full bg-neutral-800 border border-neutral-700 rounded px-1.5 py-1 text-[11px] text-neutral-100 outline-none focus:border-cyan-500 mb-2"
          />
          {categories.length === 0 && <p className="text-[10px] text-neutral-600">Nenhuma etiqueta encontrada.</p>}
          {categories.map((c) => (
            <div key={c.id} className="mb-2">
              <div className="text-[9px] text-neutral-500 flex items-baseline gap-1">
                <span className="text-neutral-400">{c.name}</span>
                {c.standard && <span className="text-neutral-600">({c.standard})</span>}
              </div>
              <div className="flex flex-wrap gap-1 mt-1">
                {c.labels.map((l) => (
                  <button
                    key={l}
                    type="button"
                    onClick={() => {
                      onPick(l)
                      setOpen(false)
                      setFilter('')
                    }}
                    title={`Usar "${l}"`}
                    className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-neutral-800 hover:bg-cyan-900/60 hover:border-cyan-600 border border-neutral-700 text-neutral-200 font-mono"
                  >
                    {l}
                    <span className="text-amber-500 text-[8px]">🔒</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
