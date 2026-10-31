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
import { CMD_PARTS, emptyCommands, type CmdPart } from './model'
import { cmdTagPreset } from './symbols'
import { commitDiagram } from './editing'

type TagStyle = NonNullable<CmdPart['tagStyle']>
const PRESETS: Array<{ side: 'top' | 'bottom' | 'left' | 'right'; label: string }> = [
  { side: 'top', label: 'Cima' }, { side: 'bottom', label: 'Baixo' }, { side: 'left', label: 'Esquerda' }, { side: 'right', label: 'Direita' },
]
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
            <label htmlFor="cmd-tag-text-font">Tipo de letra</label>
            <select id="cmd-tag-text-font" className="dc-input" value={style.font ?? 'sans'} onChange={(e) => patch({ font: e.target.value as CanvasTextFont })}>
              {TEXT_FONTS.map((font) => <option key={font.id} value={font.id}>{font.label}</option>)}
            </select>
          </div>

          <div className="dc-cmd-tag-row">
            <div className="grafcet-property-field">
              <label htmlFor="cmd-tag-text-size">Tamanho (px)</label>
              <input id="cmd-tag-text-size" className="dc-input" type="number" min={6} max={72} step={1} value={size}
                onChange={(e) => { const n = Number(e.target.value); if (Number.isFinite(n)) patch({ fontSize: clampNumber(n, 6, 72) }) }} />
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
          <svg viewBox="0 0 220 140" role="img" aria-label={`Texto ${name || '…'} a ${rotation} graus`}>
            <rect x="8" y="8" width="204" height="124" rx="8" className="dc-cmd-link-sheet" />
            <rect x="92" y="52" width="36" height="36" rx="3" className="dc-cmd-link-box" />
            <text x="110" y="75" textAnchor="middle" className="dc-cmd-link-sheet-name">{label.slice(0, 5)}</text>
            <text x="110" y="70" textAnchor="middle" transform={`rotate(${rotation} 110 70)`} stroke="none"
              style={{ fontSize: clampNumber(size, 6, 40), fill: color, fontFamily: fontStack(style.font), fontWeight: bold ? 750 : 400, fontStyle: style.italic ? 'italic' : 'normal', textDecoration: style.underline ? 'underline' : 'none' }}>{name || '…'}</text>
          </svg>
          <p className="grafcet-property-preview-value">{name || '—'} · {size}px · {Math.round(rotation)}°</p>
        </aside>
      </div>
    </PropertyDialog>
  )
}
