import InspectorNumberInput from '../../ui/InspectorNumberInput'
import DcxSelect from '../../ui/Select'
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Vec3 } from '../../catalog/types'
import { IconChevronRight } from '../../ui/icons'
import { useEditorStore } from './editorStore'

const FieldLabel = createContext<string | undefined>(undefined)
// Uma seleção nova recebe sempre um rascunho próprio, mesmo quando os valores coincidem.
function useInspectorScope() {
  return useEditorStore((s) => `${s.selection?.kind ?? ''}:${s.selection?.id ?? ''}:${s.selectedWire ?? ''}:${s.tab}`)
}

/** Pequenos controlos do editor 3D (mantêm o visual dx do resto da administração). */
export function Section({ title, children, open = true, actions }: { title: ReactNode; children: ReactNode; open?: boolean; actions?: ReactNode }) {
  return <details className="ce-section" open={open}>
    <summary><IconChevronRight size={11} /><span className="ce-section-title">{title}</span>{actions && <span className="ce-section-actions" onClick={(event) => event.preventDefault()}>{actions}</span>}</summary>
    <div className="ce-section-body">{children}</div>
  </details>
}

/**
 * Bloco que separa visualmente o que o editor sugere automaticamente
 * («auto»: presets, deteções, perfis) do que o utilizador cria à mão («manual»).
 */
export function Group({ tone, title, hint, actions, children }: { tone: 'auto' | 'manual'; title: string; hint?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return <div className={`ce-block ce-block-${tone}`}>
    <div className="ce-block-head">
      <span className="ce-block-tag">{tone === 'auto' ? 'Sugestões' : 'Manual'}</span>
      <strong>{title}</strong>
      {actions && <span className="ce-block-actions">{actions}</span>}
    </div>
    {hint && <p className="ce-hint ce-block-hint">{hint}</p>}
    <div className="ce-block-body">{children}</div>
  </div>
}

/** Cartão de atalho: título curto + explicação, em vez de um botão genérico. */
export function PresetCard({ title, description, onClick, disabled, active }: { title: string; description: string; onClick: () => void; disabled?: boolean; active?: boolean }) {
  return <button type="button" className={`ce-preset${active ? ' is-on' : ''}`} disabled={disabled} onClick={onClick} title={description}>
    <b>{title}</b><small>{description}</small>
  </button>
}

export function Field({ label, children, hint, wide }: { label: string; children: ReactNode; hint?: string; wide?: boolean }) {
  return <FieldLabel.Provider value={label}><label className={`ce-field${wide ? ' is-wide' : ''}`}><span>{label}</span>{children}{hint && <small>{hint}</small>}</label></FieldLabel.Provider>
}

export function Num({ value, onChange, step = 1, min, max, unit, disabled, 'aria-label': ariaLabel }: { value: number; onChange: (value: number) => void; step?: number; min?: number; max?: number; unit?: string; disabled?: boolean; 'aria-label'?: string }) {
  const scope = useInspectorScope()
  const label = useContext(FieldLabel)
  return <span className="ce-num">
    <InspectorNumberInput resetKey={scope} aria-label={ariaLabel ?? (label ? `${label}${unit ? ` (${unit})` : ''}` : undefined)} type="number" className="dx-input" value={Number.isFinite(value) ? Math.round(value * 1000) / 1000 : 0} step={step} min={min} max={max} disabled={disabled}
      onChange={(event) => onChange(Number(event.target.value))} />
    {unit && <i>{unit}</i>}
  </span>
}

export function Vec3Input({ label, value, onChange, step = 1, min, unit, disabled }: { label: string; value: Vec3; onChange: (value: Vec3) => void; step?: number; min?: number; unit?: string; disabled?: boolean }) {
  return <div className="ce-vec">
    <span className="ce-vec-label">{label}</span>
    {(['X', 'Y', 'Z'] as const).map((axis, index) => <span key={axis} className={`ce-axis ce-axis-${axis}`}>
      <b>{axis}</b>
      <Num aria-label={`${label} ${axis}${unit ? ` (${unit})` : ''}`} value={value[index]} step={step} min={min} unit={index === 2 ? unit : undefined} disabled={disabled} onChange={(next) => { const copy = [...value] as Vec3; copy[index] = next; onChange(copy) }} />
    </span>)}
  </div>
}

export function Text({ value, onChange, placeholder, multiline }: { value: string; onChange: (value: string) => void; placeholder?: string; multiline?: boolean }) {
  const label = useContext(FieldLabel)
  return multiline
    ? <textarea aria-label={label} className="dx-input" rows={3} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
    : <input aria-label={label} className="dx-input" value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
}

export function Select<T extends string>({ value, onChange, options, disabled }: { value: T; onChange: (value: T) => void; options: Array<[T, string]>; disabled?: boolean }) {
  const label = useContext(FieldLabel)
  return <DcxSelect aria-label={label} className="dx-input" value={value} disabled={disabled} onChange={(event) => onChange(event.target.value as T)}>
    {options.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
  </DcxSelect>
}

/** Cores rápidas dos materiais: plásticos claros/escuros, metal, preto e as cores de sinalização. */
export const COLOR_SWATCHES: Array<[string, string]> = [['#f8fafc', 'Branco'], ['#cbd5e1', 'Cinzento claro'], ['#94a3b8', 'Cinzento'], ['#475569', 'Grafite'], ['#111827', 'Preto'], ['#dc2626', 'Vermelho'], ['#f59e0b', 'Âmbar'], ['#facc15', 'Amarelo'], ['#16a34a', 'Verde'], ['#2563eb', 'Azul']]

/** Cor: amostra (seletor do sistema) + HEX editável + cores rápidas; um HEX inválido não é aplicado e repõe-se ao sair. */
export function Color({ value, onChange, swatches = COLOR_SWATCHES }: { value: string; onChange: (value: string) => void; swatches?: Array<[string, string]> | false }) {
  const scope = useInspectorScope()
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value, scope])
  const valid = (hex: string) => /^#[0-9a-f]{6}$/i.test(hex)
  return <span className="ce-color">
    <input type="color" value={valid(value) ? value : '#000000'} onChange={(event) => onChange(event.target.value)} aria-label="Escolher cor" />
    <input className="dx-input ce-color-hex" value={draft} maxLength={7} spellCheck={false} aria-label="Cor em HEX" aria-invalid={!valid(draft)}
      onChange={(event) => { const next = event.target.value.trim(); setDraft(next); if (valid(next)) onChange(next.toLowerCase()) }}
      onBlur={() => { if (!valid(draft)) setDraft(value) }} />
    {swatches && <span className="ce-color-swatches" role="group" aria-label="Cores rápidas">
      {swatches.map(([hex, name]) => <button key={hex} type="button" className={`ce-color-swatch${value.toLowerCase() === hex ? ' is-on' : ''}`} style={{ background: hex }} title={`${name} (${hex})`} aria-label={name} aria-pressed={value.toLowerCase() === hex} onClick={() => onChange(hex)} />)}
    </span>}
  </span>
}

export function Check({ checked, onChange, label }: { checked: boolean; onChange: (value: boolean) => void; label: string }) {
  return <label className="ce-check"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />{label}</label>
}

/** Deslizador + valor exato editável (limitado ao intervalo). */
export function Slider({ value, onChange, min = 0, max = 1, step = 0.01 }: { value: number; onChange: (value: number) => void; min?: number; max?: number; step?: number }) {
  const scope = useInspectorScope()
  const label = useContext(FieldLabel) ?? 'Valor'
  return <span className="ce-slider">
    <input aria-label={`${label}: ajustar`} type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(parseFloat(event.target.value))} />
    <InspectorNumberInput resetKey={scope} type="number" className="dx-input ce-slider-num" min={min} max={max} step={step} value={Math.round(value * 100) / 100} aria-label={`${label}: valor exato`}
      onChange={(event) => onChange(Number(event.target.value))} />
  </span>
}

export function Empty({ children }: { children: ReactNode }) { return <p className="ce-empty">{children}</p> }

export function Confirm({ label, onConfirm, className = 'dx-btn dx-btn-secondary dx-btn-sm', title }: { label: ReactNode; onConfirm: () => void; className?: string; title?: string }) {
  const [armed, setArmed] = useState(false)
  return <button className={className} title={title} onBlur={() => setArmed(false)} onClick={() => { if (armed) { setArmed(false); onConfirm() } else setArmed(true) }}>{armed ? 'Confirmar?' : label}</button>
}
