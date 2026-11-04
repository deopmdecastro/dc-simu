import { useEffect, useRef, useState } from 'react'
import type { CanvasTextStyle } from '../types'
import { IconBold, IconChevronDown, IconClose, IconDelete, IconItalic, IconAlignLeft, IconAlignRight, IconTextCenter, IconUnderline, IconText, IconCheck } from './icons'
import { TEXT_COLORS, TEXT_FONTS, fontStack } from './textStyle'
import { useNarrowMenu } from './toolbarKit'
import { PHONE_TOUCH_QUERY } from './device'

/**
 * Barra de formatação dos textos livres (Esquema/3D e GRAFCET): tipo de letra,
 * tamanho, cor, negrito/itálico/sublinhado, alinhamento e fundo.
 * Preferência: flutuar por cima do texto selecionado; Confirmar / Anular fecham.
 */
export default function TextStyleBar({ style, unit, onChange, onDelete, onDone, onCancel, onEdit, rotation, width, onRotationChange, onWidthChange }: {
  style: CanvasTextStyle
  unit: 'mm' | 'px'
  onChange: (patch: Partial<CanvasTextStyle>) => void
  onDelete: () => void
  /** Confirma e fecha (Enter / botão Confirmar). */
  onDone: () => void
  /** Anula a edição do texto e fecha (Esc / botão Anular). Se omitido, usa onDone. */
  onCancel?: () => void
  /** Opções de transformação disponíveis apenas nos textos posicionados. */
  rotation?: number
  width?: number
  onRotationChange?: (rotation: number) => void
  onWidthChange?: (width: number | undefined) => void
  /** Entra na edição do conteúdo (duplo clique faz o mesmo). */
  onEdit?: () => void
}) {
  const [fontsOpen, setFontsOpen] = useState(false)
  const [colorsOpen, setColorsOpen] = useState(false)
  const [layoutOpen, setLayoutOpen] = useState(false)
  const [rotationDraft, setRotationDraft] = useState(String(Math.round(rotation ?? 0)))
  const [widthDraft, setWidthDraft] = useState(width == null ? '' : String(width))
  const ref = useRef<HTMLDivElement>(null)
  // Telemóvel: uma só linha (Editar · Formatar · Apagar · Concluir) para não tapar o texto selecionado; a formatação abre a pedido.
  const phone = useNarrowMenu(PHONE_TOUCH_QUERY)
  const [formatOpen, setFormatOpen] = useState(false)
  const steps = unit === 'mm' ? [4, 6, 8, 10, 12, 16, 20, 24, 32, 40, 50, 64, 80, 100] : [10, 11, 12, 13, 14, 16, 18, 20, 24, 28, 36, 48]
  const min = steps[0], max = steps[steps.length - 1]
  const bump = (direction: 1 | -1) => {
    const next = direction > 0 ? steps.find((value) => value > style.size) ?? max : [...steps].reverse().find((value) => value < style.size) ?? min
    onChange({ size: next })
  }
  useEffect(() => {
    if (!fontsOpen && !colorsOpen && !layoutOpen) return
    const close = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) {
        setFontsOpen(false)
        setColorsOpen(false)
        setLayoutOpen(false)
      }
    }
    window.addEventListener('pointerdown', close, true)
    return () => window.removeEventListener('pointerdown', close, true)
  }, [fontsOpen, colorsOpen, layoutOpen])
  const font = TEXT_FONTS.find((item) => item.id === style.font) ?? TEXT_FONTS[0]
  const hasLayout = !!(onRotationChange || onWidthChange)
  const closePopovers = () => { setFontsOpen(false); setColorsOpen(false); setLayoutOpen(false) }

  if (phone && !formatOpen) {
    return <div ref={ref} className="txb is-compact" role="toolbar" aria-label="Texto selecionado" onPointerDown={(event) => event.stopPropagation()}>
      {onEdit && <button type="button" className="txb-text-btn is-primary" onClick={onEdit}><IconText size={14} /><span>Editar texto</span></button>}
      <button type="button" className="txb-text-btn" onClick={() => setFormatOpen(true)} aria-label="Formatar texto"><span>Formatar</span><IconChevronDown size={10} /></button>
      <button type="button" className="txb-icon is-danger" onClick={onDelete} aria-label="Eliminar texto"><IconDelete size={14} /></button>
      <button type="button" className="txb-text-btn" onClick={onCancel ?? onDone} aria-label="Anular"><IconClose size={14} /><span>Anular</span></button>
      <button type="button" className="txb-text-btn is-primary" onClick={onDone} aria-label="Confirmar"><IconCheck size={14} /><span>OK</span></button>
    </div>
  }

  return <div ref={ref} className="txb" role="toolbar" aria-label="Formatação e propriedades do texto" onPointerDown={(event) => event.stopPropagation()} onKeyDown={(event) => {
    if (event.key === 'Escape') {
      if (fontsOpen || colorsOpen || layoutOpen) closePopovers()
      else (onCancel ?? onDone)()
      return
    }
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault()
      onDone()
    }
  }}>
    {phone
      ? <button type="button" className="txb-badge" onClick={() => setFormatOpen(false)} aria-label="Recolher formatação" title="Recolher"><IconText size={12} /></button>
      : <span className="txb-badge" aria-hidden="true"><IconText size={12} /></span>}
    <div className="txb-pop-wrap">
      <button type="button" className="txb-font" aria-haspopup="listbox" aria-expanded={fontsOpen} onClick={() => { setFontsOpen((open) => !open); setColorsOpen(false); setLayoutOpen(false) }} style={{ fontFamily: font.stack }} title="Tipo de letra">
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
      <button type="button" className="txb-color" aria-haspopup="dialog" aria-expanded={colorsOpen} onClick={() => { setColorsOpen((open) => !open); setFontsOpen(false); setLayoutOpen(false) }} title="Cor do texto e fundo" aria-label="Cor do texto e fundo">
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
    {hasLayout && <>
      <span className="txb-sep" aria-hidden="true" />
      <div className="txb-pop-wrap">
        <button type="button" className="txb-layout" aria-haspopup="dialog" aria-expanded={layoutOpen} aria-label="Posição e dimensões" title="Posição e dimensões do texto" onClick={() => {
          const nextOpen = !layoutOpen
          if (nextOpen) {
            setRotationDraft(String(Math.round(rotation ?? 0)))
            setWidthDraft(width == null ? '' : String(width))
          }
          setLayoutOpen(nextOpen)
          setFontsOpen(false)
          setColorsOpen(false)
        }}>
          <span className="txb-layout-label">Layout</span><IconChevronDown size={10} />
        </button>
        {layoutOpen && <div className="txb-pop txb-layout-panel" role="dialog" aria-label="Posição e dimensões do texto">
          {onRotationChange && <label className="txb-layout-field">
            <span>Rotação</span>
            <span className="txb-layout-control"><input type="number" min={-180} max={180} step={1} value={rotationDraft} aria-label="Rotação do texto" onChange={(event) => {
              const raw = event.currentTarget.value
              setRotationDraft(raw)
              const value = Number(raw)
              if (raw !== '' && raw !== '-' && Number.isFinite(value)) onRotationChange(Math.max(-180, Math.min(180, Math.round(value))))
            }} onBlur={() => {
              const value = Number(rotationDraft)
              const next = rotationDraft.trim() !== '' && Number.isFinite(value) ? Math.max(-180, Math.min(180, Math.round(value))) : 0
              setRotationDraft(String(next))
              onRotationChange(next)
            }} /><small>°</small></span>
          </label>}
          {onWidthChange && <label className="txb-layout-field">
            <span>Largura</span>
            <span className="txb-layout-control"><input type="number" min={60} max={1200} step={10} value={widthDraft} placeholder="Auto" aria-label="Largura do texto" onChange={(event) => {
              const raw = event.currentTarget.value
              setWidthDraft(raw)
              if (raw === '') { onWidthChange(undefined); return }
              const value = Number(raw)
              if (Number.isFinite(value)) onWidthChange(Math.max(60, Math.min(1200, Math.round(value))))
            }} onBlur={() => {
              const value = Number(widthDraft)
              if (widthDraft.trim() === '') {
                setWidthDraft('')
                onWidthChange(undefined)
              } else if (Number.isFinite(value)) {
                const next = Math.max(60, Math.min(1200, Math.round(value)))
                setWidthDraft(String(next))
                onWidthChange(next)
              } else {
                setWidthDraft(width == null ? '' : String(width))
              }
            }} /><small>px</small></span>
          </label>}
          <button type="button" className="txb-layout-reset" onClick={() => { setRotationDraft('0'); setWidthDraft(''); onRotationChange?.(0); onWidthChange?.(undefined) }}>Repor rotação e largura automática</button>
        </div>}
      </div>
    </>}
    <span className="txb-spacer" />
    {onEdit && <button type="button" className="txb-text-btn" onClick={onEdit} title="Editar o texto (duplo clique)"><IconText size={12} /><span>Editar texto</span></button>}
    <button type="button" className="txb-icon is-danger" onClick={onDelete} title="Eliminar texto (Delete)" aria-label="Eliminar texto"><IconDelete size={12} /></button>
    <button type="button" className="txb-text-btn" onClick={onCancel ?? onDone} title="Anular (Esc)" aria-label="Anular"><IconClose size={12} /><span>Anular</span></button>
    <button type="button" className="txb-text-btn is-primary" onClick={onDone} title="Confirmar (Enter)" aria-label="Confirmar"><IconCheck size={12} /><span>Confirmar</span></button>
  </div>
}
