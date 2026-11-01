/**
 * Edição da referência (nome) de um símbolo do Esquema IEC — abre com duplo clique no nome.
 * Mesma estrutura das janelas de propriedades (campos + pré-visualização), com as propriedades
 * próprias do texto: conteúdo, tipo de letra, tamanho, rotação, cor, estilo e posição.
 */
import { useState } from 'react'
import PropertyDialog from '../ui/PropertyDialog'
import { useSimStore } from '../store/useSimStore'
import { TEXT_COLORS, TEXT_FONTS, fontStack } from '../ui/textStyle'
import type { CanvasTextFont } from '../types'
import { CMD_PARTS, emptyCommands, partBox, type CmdPart } from './model'
import { CmdSymbol, cmdTagBounds, cmdTagPreset } from './symbols'
import { commitDiagram } from './editing'

type TagStyle = NonNullable<CmdPart['tagStyle']>
const PRESETS: Array<{ side: 'top' | 'bottom' | 'left' | 'right'; label: string }> = [
  { side: 'top', label: 'Cima' }, { side: 'bottom', label: 'Baixo' }, { side: 'left', label: 'Esquerda' }, { side: 'right', label: 'Direita' },
]
const QUICK_SIZES = [9, 10, 12, 14, 18, 24]
const clampNumber = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const normalizeAngle = (value: number) => { const turn = ((value + 180) % 360 + 360) % 360 - 180; return turn === -180 ? 180 : turn }

export default function TagTextDialog({ partId, onClose }: { partId: string; onClose: () => void }) {
  const diagram = useSimStore((s) => s.commands) ?? emptyCommands()
  const part = diagram.parts.find((p) => p.id === partId)
  const [tag, setTag] = useState(part?.tag ?? '')
  const [style, setStyle] = useState<TagStyle>(() => ({ ...part?.tagStyle }))
  const [rotationDraft, setRotationDraft] = useState(String(Math.round(part?.tagStyle?.rotation ?? 0)))
  if (!part) return null

  const patch = (next: Partial<TagStyle>) => setStyle((current) => ({ ...current, ...next }))
  const setRotation = (value: number) => { const angle = normalizeAngle(Math.round(value)); patch({ rotation: angle }); setRotationDraft(String(angle)) }
  const size = style.fontSize ?? 12
  const rotation = style.rotation ?? 0
  const color = style.color ?? '#0f172a'
  const bold = style.bold ?? true
  const name = tag.trim()
  const duplicate = !!name && diagram.parts.some((p) => p.id !== part.id && p.tag === name)
  const error = name ? '' : 'Indique a referência (ex.: K1, S2, Q1).'
  const label = CMD_PARTS[part.kind].label

  // Caixa de visualização: símbolo + nome (com rotação), com margem; mínimo para símbolos pequenos.
  const preview = (() => {
    const p: CmdPart = { ...part, x: 0, y: 0, tag: name || '…', tagStyle: style }
    const box = partBox(p)
    const tb = cmdTagBounds(p)
    const x0 = Math.min(box.x, tb?.x ?? box.x), y0 = Math.min(box.y, tb?.y ?? box.y)
    const x1 = Math.max(box.x + box.w, tb ? tb.x + tb.w : -Infinity), y1 = Math.max(box.y + box.h, tb ? tb.y + tb.h : -Infinity)
    const w = Math.max(120, x1 - x0 + 36), h = Math.max(90, y1 - y0 + 36)
    const x = (x0 + x1) / 2 - w / 2, y = (y0 + y1) / 2 - h / 2
    return { part: p, x, y, w, h, viewBox: `${x} ${y} ${w} ${h}` }
  })()

  const save = () => {
    if (error) return
    commitDiagram({ ...diagram, parts: diagram.parts.map((p) => p.id === part.id ? { ...p, tag: name, tagStyle: { ...style } } : p) })
    onClose()
  }

  return (
    <PropertyDialog
      open
      id="cmd-tag-text"
      className="dc-cmd-link-dialog dc-cmd-tag-dialog"
      eyebrow="Esquema IEC · texto da referência"
      title={`Editar texto · ${part.tag || label}`}
      subtitle={`Conteúdo, aspeto e rotação do nome de «${label}».`}
      onClose={onClose}
      onSave={save}
      saveDisabled={!!error}
      saveLabel="Guardar"
      closeLabel="Cancelar"
    >
      <div className="grafcet-property-grid">
        <section className="grafcet-property-fields" aria-label="Propriedades do texto">
          <div className="grafcet-property-field">
            <label htmlFor="cmd-tag-text-value">Texto <span className="grafcet-required">obrigatório</span></label>
            <input id="cmd-tag-text-value" data-initial-focus className="dc-input" value={tag} maxLength={24} placeholder="Ex.: K1, S2, Q1"
              onChange={(e) => setTag(e.target.value)} aria-invalid={!!error} aria-describedby="cmd-tag-text-help" />
            {error
              ? <p id="cmd-tag-text-help" className="grafcet-field-error" role="alert">{error}</p>
              : duplicate
                ? <p id="cmd-tag-text-help" className="grafcet-property-warning" role="status">Já existe outro símbolo com a referência «{name}».</p>
                : <p id="cmd-tag-text-help" className="grafcet-property-note">Altera apenas o nome mostrado no símbolo.</p>}
          </div>

          <div className="grafcet-property-field">
            <span className="grafcet-property-label" id="cmd-tag-text-font">Tipo de letra</span>
            {/* Cartões com o próprio texto em cada letra: escolhe-se vendo o resultado. */}
            <div className="dc-cmd-tag-fonts" role="radiogroup" aria-labelledby="cmd-tag-text-font">
              {TEXT_FONTS.map((font) => {
                const on = (style.font ?? 'sans') === font.id
                return <button key={font.id} type="button" role="radio" aria-checked={on} className={on ? 'is-on' : ''} onClick={() => patch({ font: font.id as CanvasTextFont })} title={font.label}>
                  <span className="dc-cmd-tag-font-sample" style={{ fontFamily: font.stack, fontWeight: bold ? 750 : 400, fontStyle: style.italic ? 'italic' : 'normal' }}>{name || 'Q1'}</span>
                  <span className="dc-cmd-tag-font-name">{font.label}</span>
                </button>
              })}
            </div>
          </div>

          <div className="dc-cmd-tag-row">
            <div className="grafcet-property-field">
              <label htmlFor="cmd-tag-text-size">Tamanho (px)</label>
              <input id="cmd-tag-text-size" className="dc-input" type="number" min={6} max={72} step={1} value={size}
                onChange={(e) => { const n = Number(e.target.value); if (Number.isFinite(n)) patch({ fontSize: clampNumber(n, 6, 72) }) }} />
              <div className="grafcet-property-chips" aria-label="Tamanhos rápidos">
                {QUICK_SIZES.map((px) => <button key={px} type="button" aria-pressed={size === px} onClick={() => patch({ fontSize: px })}>{px}</button>)}
              </div>
            </div>
            <fieldset className="grafcet-property-section dc-cmd-tag-style">
              <legend>Estilo</legend>
              <div className="dc-cmd-tag-toggles" role="group" aria-label="Estilo do texto">
                <button type="button" aria-pressed={bold} onClick={() => patch({ bold: !bold })} title="Negrito"><b>B</b></button>
                <button type="button" aria-pressed={!!style.italic} onClick={() => patch({ italic: !style.italic })} title="Itálico"><i>I</i></button>
                <button type="button" aria-pressed={!!style.underline} onClick={() => patch({ underline: !style.underline })} title="Sublinhado"><u>U</u></button>
              </div>
            </fieldset>
          </div>

          <div className="grafcet-property-field">
            <label htmlFor="cmd-tag-text-rotation">Rotação (°)</label>
            <div className="dc-cmd-tag-rotation">
              <input id="cmd-tag-text-rotation" className="dc-input" type="number" step={1} min={-180} max={180} value={rotationDraft}
                onChange={(e) => { setRotationDraft(e.target.value); const n = Number(e.target.value); if (e.target.value !== '' && Number.isFinite(n)) patch({ rotation: normalizeAngle(clampNumber(n, -360, 360)) }) }}
                onBlur={() => setRotationDraft(String(Math.round(rotation)))} />
              <input type="range" min={-180} max={180} step={1} value={rotation} aria-label="Rotação do texto" onChange={(e) => setRotation(Number(e.target.value))} />
            </div>
            <div className="grafcet-property-chips" aria-label="Rotações rápidas">
              {[0, 90, -90, 180].map((angle) => <button key={angle} type="button" aria-pressed={rotation === angle} onClick={() => setRotation(angle)}>{angle}°</button>)}
              <button type="button" onClick={() => setRotation(rotation + 15)} title="Rodar +15°">+15°</button>
              <button type="button" onClick={() => setRotation(rotation - 15)} title="Rodar −15°">−15°</button>
            </div>
          </div>

          <div className="grafcet-property-field">
            <span className="grafcet-property-label">Cor</span>
            <div className="dc-cmd-tag-colors" role="group" aria-label="Cor do texto">
              {TEXT_COLORS.map((swatch) => <button key={swatch} type="button" className={swatch.toLowerCase() === color.toLowerCase() ? 'is-on' : ''} style={{ background: swatch }} aria-label={`Cor ${swatch}`} aria-pressed={swatch.toLowerCase() === color.toLowerCase()} onClick={() => patch({ color: swatch })} />)}
              <input type="color" aria-label="Outra cor" value={/^#[0-9a-f]{6}$/i.test(color) ? color : '#0f172a'} onChange={(e) => patch({ color: e.target.value })} />
            </div>
          </div>

          <div className="grafcet-property-field">
            <span className="grafcet-property-label">Posição</span>
            <div className="grafcet-property-chips" aria-label="Posição do texto">
              {PRESETS.map(({ side, label: text }) => <button key={side} type="button" onClick={() => {
                const preset = cmdTagPreset({ ...part, tagStyle: style }, side)
                patch({ x: preset.x, y: preset.y, rotation: preset.rotation ?? rotation })
                setRotationDraft(String(preset.rotation ?? rotation))
              }}>{text}</button>)}
              <button type="button" onClick={() => setStyle((current) => { const { x: _x, y: _y, ...rest } = current; return rest })}>Repor posição</button>
            </div>
            <p className="grafcet-property-note">Também pode arrastar o nome diretamente no esquema.</p>
          </div>
        </section>

        <aside className="grafcet-property-preview dc-cmd-link-preview" aria-label="Pré-visualização do texto">
          <span className="grafcet-property-preview-label">Pré-visualização</span>
          {/* O próprio símbolo com o nome tal como fica no esquema (posição, tamanho, cor e rotação). */}
          <svg className="dc-cmd-tag-preview" viewBox={preview.viewBox} role="img" aria-label={`${label} com o texto ${name || '…'} a ${rotation} graus`}>
            <defs>
              <pattern id="cmd-tag-preview-grid" width="20" height="20" patternUnits="userSpaceOnUse"><circle cx="0" cy="0" r="0.9" fill="#cbd5e1" /></pattern>
            </defs>
            <rect x={preview.x} y={preview.y} width={preview.w} height={preview.h} fill="url(#cmd-tag-preview-grid)" />
            <CmdSymbol part={preview.part} state={{ idle: true }} />
          </svg>
          <p className="grafcet-property-preview-value">{name || '—'} · {size}px · {Math.round(rotation)}°</p>
        </aside>
      </div>
    </PropertyDialog>
  )
}
