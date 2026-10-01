import { useState, type ReactNode } from 'react'
import type { Vec3 } from '../../catalog/types'

/** Pequenos controlos do editor 3D (mantêm o visual dx do resto da administração). */
export function Section({ title, children, open = true, actions }: { title: ReactNode; children: ReactNode; open?: boolean; actions?: ReactNode }) {
  return <details className="ce-section" open={open}>
    <summary><span>{title}</span>{actions && <span className="ce-section-actions" onClick={(event) => event.preventDefault()}>{actions}</span>}</summary>
    <div className="ce-section-body">{children}</div>
  </details>
}

export function Field({ label, children, hint, wide }: { label: string; children: ReactNode; hint?: string; wide?: boolean }) {
  return <label className={`ce-field${wide ? ' is-wide' : ''}`}><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>
}

export function Num({ value, onChange, step = 1, min, max, unit, disabled }: { value: number; onChange: (value: number) => void; step?: number; min?: number; max?: number; unit?: string; disabled?: boolean }) {
  return <span className="ce-num">
    <input type="number" className="dx-input" value={Number.isFinite(value) ? Math.round(value * 1000) / 1000 : 0} step={step} min={min} max={max} disabled={disabled}
      onChange={(event) => { const next = parseFloat(event.target.value); if (Number.isFinite(next)) onChange(min !== undefined ? Math.max(min, max !== undefined ? Math.min(max, next) : next) : next) }} />
    {unit && <i>{unit}</i>}
  </span>
}

export function Vec3Input({ label, value, onChange, step = 1, min, unit, disabled }: { label: string; value: Vec3; onChange: (value: Vec3) => void; step?: number; min?: number; unit?: string; disabled?: boolean }) {
  return <div className="ce-vec">
    <span className="ce-vec-label">{label}</span>
    {(['X', 'Y', 'Z'] as const).map((axis, index) => <span key={axis} className={`ce-axis ce-axis-${axis}`}>
      <b>{axis}</b>
      <Num value={value[index]} step={step} min={min} unit={index === 2 ? unit : undefined} disabled={disabled} onChange={(next) => { const copy = [...value] as Vec3; copy[index] = next; onChange(copy) }} />
    </span>)}
  </div>
}

export function Text({ value, onChange, placeholder, multiline }: { value: string; onChange: (value: string) => void; placeholder?: string; multiline?: boolean }) {
  return multiline
    ? <textarea className="dx-input" rows={3} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
    : <input className="dx-input" value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
}

export function Select<T extends string>({ value, onChange, options, disabled }: { value: T; onChange: (value: T) => void; options: Array<[T, string]>; disabled?: boolean }) {
  return <select className="dx-input" value={value} disabled={disabled} onChange={(event) => onChange(event.target.value as T)}>
    {options.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
  </select>
}

export function Color({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <span className="ce-color"><input type="color" value={/^#[0-9a-f]{6}$/i.test(value) ? value : '#000000'} onChange={(event) => onChange(event.target.value)} /><code>{value}</code></span>
}

export function Check({ checked, onChange, label }: { checked: boolean; onChange: (value: boolean) => void; label: string }) {
  return <label className="ce-check"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />{label}</label>
}

export function Slider({ value, onChange, min = 0, max = 1, step = 0.01 }: { value: number; onChange: (value: number) => void; min?: number; max?: number; step?: number }) {
  return <span className="ce-slider"><input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(parseFloat(event.target.value))} /><code>{Math.round(value * 100) / 100}</code></span>
}

export function Empty({ children }: { children: ReactNode }) { return <p className="ce-empty">{children}</p> }

export function Confirm({ label, onConfirm, className = 'dx-btn dx-btn-secondary dx-btn-sm', title }: { label: ReactNode; onConfirm: () => void; className?: string; title?: string }) {
  const [armed, setArmed] = useState(false)
  return <button className={className} title={title} onBlur={() => setArmed(false)} onClick={() => { if (armed) { setArmed(false); onConfirm() } else setArmed(true) }}>{armed ? 'Confirmar?' : label}</button>
}
