import { Children, isValidElement, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { IconChevronDown } from './icons'

/**
 * Lista pendente própria da plataforma, para substituir o `<select>` nativo.
 *
 * Motivo: no telemóvel (sobretudo iOS/Safari) o `<select>` abre o seletor do
 * sistema, cinzento e por cima da aplicação; no PC o estilo também não segue o
 * resto da interface. Este componente mantém a mesma API dos `<select>` que já
 * existiam (`value`, `onChange` com `event.target.value`, `<option>` e
 * `<optgroup>` como filhos), por isso é um substituto directo.
 *
 * O menu é desenhado num portal no `body`, com posição calculada: abre para
 * cima quando não há espaço em baixo, limita a altura ao ecrã e nunca é
 * cortado por contentores com `overflow`.
 */

type Item = { value: string; label: ReactNode; text: string; disabled?: boolean; group?: string }

type SelectProps = {
  value?: string | number
  defaultValue?: string | number
  onChange?: (event: { target: { value: string }; currentTarget: { value: string } }) => void
  children?: ReactNode
  className?: string
  style?: React.CSSProperties
  disabled?: boolean
  title?: string
  id?: string
  name?: string
  required?: boolean
  autoFocus?: boolean
  'aria-label'?: string
}

function collect(children: ReactNode, group: string | undefined, out: Item[]) {
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return
    const props = child.props as Record<string, unknown>
    if (child.type === 'optgroup') {
      collect(props.children as ReactNode, String(props.label ?? ''), out)
      return
    }
    if (child.type === 'option') {
      const label = (props.children as ReactNode) ?? ''
      const text = typeof label === 'string' || typeof label === 'number' ? String(label) : String(props.value ?? '')
      out.push({ value: String(props.value ?? text), label, text, disabled: Boolean(props.disabled), group })
      return
    }
    // Fragmentos e condicionais ({cond && <option/>}) continuam a ser percorridos.
    if (props && 'children' in props) collect(props.children as ReactNode, group, out)
  })
}

export default function Select({ value, defaultValue, onChange, children, className = '', style, disabled = false, title, id, name, autoFocus, ...rest }: SelectProps) {
  const [open, setOpen] = useState(false)
  const [internal, setInternal] = useState(String(defaultValue ?? ''))
  const [pos, setPos] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null)
  const anchorRef = useRef<HTMLButtonElement>(null)
  const menuId = useId()
  const items: Item[] = []
  collect(children, undefined, items)
  const current = value !== undefined ? String(value) : internal
  const selected = items.find((item) => item.value === current)

  const updatePosition = () => {
    const anchor = anchorRef.current
    if (!anchor) return
    const bounds = anchor.getBoundingClientRect()
    const width = Math.max(Math.min(bounds.width, window.innerWidth - 16), Math.min(180, window.innerWidth - 16))
    const below = window.innerHeight - bounds.bottom - 10
    const above = bounds.top - 10
    const openUp = below < 180 && above > below
    const maxHeight = Math.max(140, Math.floor(Math.min(320, openUp ? above : below)))
    const top = openUp ? Math.max(8, bounds.top - 4 - maxHeight) : bounds.bottom + 4
    setPos({ top, left: Math.max(8, Math.min(bounds.left, window.innerWidth - width - 8)), width, maxHeight })
  }

  useEffect(() => {
    if (!open) return
    const onDown = (event: Event) => {
      const target = event.target as Node
      if (anchorRef.current?.contains(target)) return
      if (document.getElementById(menuId)?.contains(target)) return
      setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('touchstart', onDown)
    window.addEventListener('keydown', onKey)
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('touchstart', onDown)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [open, menuId])

  const pick = (item: Item) => {
    if (item.disabled) return
    if (value === undefined) setInternal(item.value)
    setOpen(false)
    onChange?.({ target: { value: item.value }, currentTarget: { value: item.value } })
  }

  let lastGroup: string | undefined

  return (
    <>
      <button
        type="button"
        ref={anchorRef}
        id={id}
        name={name}
        disabled={disabled}
        autoFocus={autoFocus}
        title={title}
        aria-label={rest['aria-label']}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`dcx-select ${open ? 'is-open' : ''} ${className}`}
        style={style}
        onClick={() => { if (!open) updatePosition(); setOpen((state) => !state) }}
      >
        <span className="dcx-select-value">{selected ? selected.label : ''}</span>
        <IconChevronDown size={10} className="dcx-select-caret" />
      </button>
      {open && pos && createPortal((
        <div
          id={menuId}
          role="listbox"
          className="dcx-select-menu"
          style={{ top: pos.top, left: pos.left, minWidth: pos.width, maxHeight: pos.maxHeight }}
        >
          {items.map((item, index) => {
            const header = item.group && item.group !== lastGroup ? item.group : null
            lastGroup = item.group
            return (
              <div key={`${item.value}-${index}`}>
                {header && <div className="dcx-select-group">{header}</div>}
                <button
                  type="button"
                  role="option"
                  aria-selected={item.value === current}
                  disabled={item.disabled}
                  className={`dcx-select-item ${item.value === current ? 'is-active' : ''}`}
                  onClick={() => pick(item)}
                >
                  <span>{item.label}</span>
                  {item.value === current && <i aria-hidden>✓</i>}
                </button>
              </div>
            )
          })}
        </div>
      ), document.body)}
    </>
  )
}
