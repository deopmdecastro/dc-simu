import { useEffect, useRef, useState } from 'react'
import { STANDARD_LABEL_CATEGORIES } from '../electrical/standardLabels'
import { IconTag } from '../ui/icons'

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
        className="dc-icon-btn !w-6 !h-[22px] !text-ink-400"
      >
        <IconTag size={11} />
      </button>
      {open && (
        <div className="absolute z-30 right-0 mt-1.5 w-64 max-h-80 overflow-y-auto bg-surface-panel border border-line rounded-md shadow-lg p-2">
          <div className="dc-panel-title mb-1">{title}</div>
          <input
            autoFocus
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="filtrar…"
            className="dc-input mb-2"
          />
          {categories.length === 0 && <p className="text-[10px] text-ink-400">Nenhuma etiqueta encontrada.</p>}
          {categories.map((c) => (
            <div key={c.id} className="mb-2">
              <div className="text-[9px] text-ink-400 flex items-baseline gap-1">
                <span className="text-ink-700 font-medium">{c.name}</span>
                {c.standard && <span className="text-ink-300">({c.standard})</span>}
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
                    className="text-[10px] px-1.5 py-0.5 rounded border border-line bg-white hover:border-brand-400 hover:bg-brand-50 text-ink-900 font-mono"
                  >
                    {l}
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
