import { useEffect, useRef, useState } from 'react'
import { FACTORY_HALL_LIMITS_M, factoryHallSizeFromLayout, type FactoryHallLayout, type FactoryHallSize } from './factoryPhysics'

const FIELDS: Array<{ key: keyof FactoryHallSize; label: string }> = [
  { key: 'widthM', label: 'Largura' },
  { key: 'depthM', label: 'Profundidade' },
  { key: 'heightM', label: 'Pé-direito' },
]

const fmt = (m: number) => m.toLocaleString('pt-PT', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

/**
 * Dimensões da nave fabril: por omissão cresce sozinha com os equipamentos; ao fixar um tamanho,
 * a nave fica parada e os equipamentos arrastados ficam contidos nas paredes.
 */
export function FactoryHallSizeControl({ layout, value, disabled, onChange }: {
  layout: FactoryHallLayout
  value: FactoryHallSize | null
  disabled?: boolean
  onChange: (next: FactoryHallSize | null) => void
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const current = value ?? factoryHallSizeFromLayout(layout)

  useEffect(() => {
    if (!open) return
    const onDown = (event: PointerEvent) => { if (!rootRef.current?.contains(event.target as Node)) setOpen(false) }
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
    window.addEventListener('pointerdown', onDown, true)
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('pointerdown', onDown, true); window.removeEventListener('keydown', onKey) }
  }, [open])

  const setField = (key: keyof FactoryHallSize, meters: number) => {
    if (!Number.isFinite(meters)) return
    onChange({ ...current, [key]: meters })
  }

  return (
    <div className="panel3d-hall-size" ref={rootRef}>
      <button
        type="button"
        className={value ? 'is-fixed' : ''}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((v) => !v)}
        title={value ? 'Nave com tamanho fixo — clique para alterar' : 'Nave automática — clique para fixar ou aumentar o tamanho'}
        data-factory-hall-toggle
      >
        <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M2 5.5V2h3.5M10.5 2H14v3.5M14 10.5V14h-3.5M5.5 14H2v-3.5" />
        </svg>
        <span>{fmt(current.widthM)} × {fmt(current.depthM)} m</span>
        {value && (
          <svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="1.6" aria-label="tamanho fixo">
            <rect x="3.5" y="7" width="9" height="6.5" rx="1.2" />
            <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
          </svg>
        )}
      </button>
      {open && (
        <div className="panel3d-hall-size-pop" role="dialog" aria-label="Dimensões da nave fabril" data-factory-hall-panel>
          <strong>Dimensões da nave</strong>
          <label className="panel3d-hall-size-fixed">
            <input
              type="checkbox"
              checked={!!value}
              disabled={disabled}
              onChange={(e) => onChange(e.target.checked ? factoryHallSizeFromLayout(layout) : null)}
              data-factory-hall-fixed
            />
            <span>Tamanho fixo <small>(não cresce ao mover equipamentos)</small></span>
          </label>
          {FIELDS.map(({ key, label }) => {
            const { min, max } = FACTORY_HALL_LIMITS_M[key]
            return (
              <div key={key} className="panel3d-hall-size-row">
                <span>{label}</span>
                <button type="button" disabled={disabled || current[key] <= min} onClick={() => setField(key, current[key] - 0.5)} aria-label={`Diminuir ${label.toLowerCase()}`}>−</button>
                <input
                  type="number"
                  min={min}
                  max={max}
                  step={0.5}
                  disabled={disabled}
                  value={current[key]}
                  onChange={(e) => setField(key, Number(e.target.value))}
                  aria-label={`${label} (m)`}
                  data-factory-hall-field={key}
                />
                <button type="button" disabled={disabled || current[key] >= max} onClick={() => setField(key, current[key] + 0.5)} aria-label={`Aumentar ${label.toLowerCase()}`}>+</button>
                <em>m</em>
              </div>
            )
          })}
          <p>
            {value
              ? 'Os equipamentos ficam dentro destas paredes. Ative «Permitir sair dos limites do pavilhão» no inspetor para os pôr fora.'
              : 'Automático: a nave alarga-se quando afasta equipamentos. Alterar um valor fixa o tamanho.'}
          </p>
        </div>
      )}
    </div>
  )
}
