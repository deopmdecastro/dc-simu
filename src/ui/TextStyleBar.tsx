import { useEffect, useRef, useState } from 'react'
import type { CanvasTextStyle } from '../types'
import { IconBold, IconChevronDown, IconClose, IconDelete, IconItalic, IconAlignLeft, IconAlignRight, IconTextCenter, IconUnderline, IconText, IconCheck } from './icons'
import { TEXT_COLORS, TEXT_FONTS, fontStack } from './textStyle'

/**
 * Barra de formatação dos textos livres (Esquema/3D e GRAFCET), ao estilo dos
 * editores de design: tipo de letra, tamanho, cor, negrito/itálico/sublinhado,
 * alinhamento e fundo. Fica fixa no topo do canvas enquanto o texto está selecionado.
 */
export default function TextStyleBar({ style, unit, onChange, onDelete, onDone, onEdit }: {
  style: CanvasTextStyle
  unit: 'mm' | 'px'
  onChange: (patch: Partial<CanvasTextStyle>) => void
  onDelete: () => void
  onDone: () => void
  /** Entra na edição do conteúdo (duplo clique faz o mesmo). */
  onEdit?: () => void
}) {
  const [fontsOpen, setFontsOpen] = useState(false)
  const [colorsOpen, setColorsOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const steps = unit === 'mm' ? [4, 6, 8, 10, 12, 16, 20, 24, 32, 40, 50, 64, 80, 100] : [10, 11, 12, 13, 14, 16, 18, 20, 24, 28, 36, 48]
  const min = steps[0], max = steps[steps.length - 1]
  const bump = (direction: 1 | -1) => {
    const next = direction > 0 ? steps.find((value) => value > style.size) ?? max : [...steps].reverse().find((value) => value < style.size) ?? min
    onChange({ size: next })
  }
  useEffect(() => {
    if (!fontsOpen && !colorsOpen) return
    const close = (event: PointerEvent) => { if (!ref.current?.contains(event.target as Node)) { setFontsOpen(false); setColorsOpen(false) } }
    window.addEventListener('pointerdown', close, true)
    return () => window.removeEventListener('pointerdown', close, true)
  }, [fontsOpen, colorsOpen])
  const font = TEXT_FONTS.find((item) => item.id === style.font) ?? TEXT_FONTS[0]

  return <div ref={ref} className="txb" role="toolbar" aria-label="Formatação do texto" onPointerDown={(event) => event.stopPropagation()} onKeyDown={(event) => { if (event.key === 'Escape') onDone() }}>
    <span className="txb-badge" aria-hidden="true"><IconText size={12} /></span>
    <div className="txb-pop-wrap">
      <button type="button" className="txb-font" aria-haspopup="listbox" aria-expanded={fontsOpen} onClick={() => { setFontsOpen((open) => !open); setColorsOpen(false) }} style={{ fontFamily: font.stack }} title="Tipo de letra">
        {font.label}<IconChevronDown size={10} />
      </button>
      {fontsOpen && <ul className="txb-pop txb-fonts" role="listbox" aria-label="Tipo de letra">
        {TEXT_FONTS.map((item) => <li key={item.id}>
          <button type="button" role="option" aria-selected={item.id === style.font} style={{ fontFamily: fontStack(item.id) }} onClick={() => { onChange({ font: item.id }); setFontsOpen(false) }}>
            {item.label}{item.id === style.font && <IconCheck size={10} />}
          </button>
        </li>)}
      </ul>}
    </div>
    <span className="txb-size" role="group" aria-label="Tamanho">
      <button type="button" onClick={() => bump(-1)} disabled={style.size <= min} aria-label="Diminuir tamanho" title="Diminuir">−</button>
      <output aria-live="polite" title={`Tamanho em ${unit}`}>{style.size}<small>{unit}</small></output>
      <button type="button" onClick={() => bump(1)} disabled={style.size >= max} aria-label="Aumentar tamanho" title="Aumentar">+</button>
    </span>
    <span className="txb-sep" aria-hidden="true" />
    <span className="txb-group" role="group" aria-label="Estilo">
      <button type="button" aria-pressed={!!style.bold} onClick={() => onChange({ bold: !style.bold })} title="Negrito (Ctrl+B)" aria-label="Negrito"><IconBold size={12} /></button>
      <button type="button" aria-pressed={!!style.italic} onClick={() => onChange({ italic: !style.italic })} title="Itálico (Ctrl+I)" aria-label="Itálico"><IconItalic size={12} /></button>
      <button type="button" aria-pressed={!!style.underline} onClick={() => onChange({ underline: !style.underline })} title="Sublinhado (Ctrl+U)" aria-label="Sublinhado"><IconUnderline size={12} /></button>
    </span>
    <span className="txb-group" role="radiogroup" aria-label="Alinhamento">
      {([['left', IconAlignLeft, 'À esquerda'], ['center', IconTextCenter, 'Ao centro'], ['right', IconAlignRight, 'À direita']] as const).map(([id, Icon, label]) =>
        <button key={id} type="button" role="radio" aria-checked={(style.align ?? 'left') === id} onClick={() => onChange({ align: id })} title={label} aria-label={label}><Icon size={12} /></button>)}
    </span>
    <span className="txb-sep" aria-hidden="true" />
    <div className="txb-pop-wrap">
      <button type="button" className="txb-color" aria-haspopup="dialog" aria-expanded={colorsOpen} onClick={() => { setColorsOpen((open) => !open); setFontsOpen(false) }} title="Cor do texto e fundo" aria-label="Cor do texto e fundo">
        <i style={{ background: style.color }} /><IconChevronDown size={10} />
      </button>
      {colorsOpen && <div className="txb-pop txb-colors" role="dialog" aria-label="Cores">
        <strong>Texto</strong>
        <div className="txb-swatches">{TEXT_COLORS.map((color) => <button key={color} type="button" aria-pressed={style.color === color} style={{ background: color }} onClick={() => onChange({ color })} aria-label={`Cor ${color}`} />)}</div>
        <strong>Fundo</strong>
        <div className="txb-swatches">
          <button type="button" className="is-none" aria-pressed={!style.background} onClick={() => onChange({ background: '' })} aria-label="Sem fundo" title="Sem fundo" />
          {['#ffffff', '#fef3c7', '#dbeafe', '#dcfce7', '#fee2e2', '#0f172a'].map((color) => <button key={color} type="button" aria-pressed={style.background === color} style={{ background: color }} onClick={() => onChange({ background: color })} aria-label={`Fundo ${color}`} />)}
        </div>
      </div>}
    </div>
    <span className="txb-spacer" />
    {onEdit && <button type="button" className="txb-text-btn" onClick={onEdit} title="Editar o texto (duplo clique)">Editar texto</button>}
    <button type="button" className="txb-icon is-danger" onClick={onDelete} title="Eliminar texto (Delete)" aria-label="Eliminar texto"><IconDelete size={12} /></button>
    <button type="button" className="txb-icon" onClick={onDone} title="Concluir (Esc)" aria-label="Concluir"><IconClose size={12} /></button>
  </div>
}
