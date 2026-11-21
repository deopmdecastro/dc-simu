import { useEffect, useMemo, useRef, useState } from 'react'
import { PANEL_STICKER_PRESETS, STICKER_BACKGROUNDS, STICKER_ICONS, type PanelStickerDef } from '../three/panelStickers'
import { BRAND_ICON_PREFIX, BRAND_LOGOS, brandSlugOf } from '../three/brandLogos'
import { IconClose } from '../ui/icons'
import Select from '../ui/Select'
import DecalPreview from './DecalPreview'
import type { ComponentDecal } from '../types'

const CATEGORIES = [['all', 'Todas as categorias'], ['safety', 'Segurança'], ['brands', 'Marcas'], ['commands', 'Comandos e tags'], ['voltage', 'Tensões'], ['sockets', 'Tomadas'], ['lighting', 'Iluminação'], ['appliances', 'Eletrodomésticos'], ['climate', 'Climatização'], ['security', 'Segurança e bombas'], ['numbers', 'Números DIN']]
const normalize = (text: string) => text.normalize('NFD').replace(/[̀-ͯ\s]/g, '').toLowerCase()

/** Personalização feita no modal antes de colar a etiqueta. */
export interface StickerCustomization { background: string; color: string; icon: string; text: string; face?: ComponentDecal['face'] }

const presetDecal = (sticker: PanelStickerDef, custom?: Partial<StickerCustomization>): ComponentDecal => ({
  id: sticker.id, stickerId: sticker.id, kind: sticker.icon ? 'symbol' : 'text', face: 'front',
  text: custom?.text ?? sticker.label, icon: custom?.icon ?? sticker.icon, background: custom?.background ?? sticker.bg, color: custom?.color ?? sticker.fg,
  widthMm: sticker.widthMm ?? 28, heightMm: sticker.heightMm ?? 28,
})

export default function PanelStickerPicker({ onPick, onClose, faces }: {
  onPick: (sticker: PanelStickerDef, custom: StickerCustomization) => void
  onClose: () => void
  /** Destinos possíveis (quadro: porta e sobretampa). O primeiro é o predefinido. */
  faces?: Array<{ value: ComponentDecal['face']; label: string }>
}) {
  const [category, setCategory] = useState('all')
  const [filter, setFilter] = useState('')
  const [chosen, setChosen] = useState<PanelStickerDef | null>(null)
  const [custom, setCustom] = useState<StickerCustomization | null>(null)
  const card = useRef<HTMLDivElement>(null)
  const addButton = useRef<HTMLButtonElement>(null)
  const opener = useRef<HTMLElement | null>(typeof document === 'undefined' ? null : document.activeElement as HTMLElement | null)
  const filtered = PANEL_STICKER_PRESETS.filter((item) => (category === 'all' || item.category === category) && normalize(`${item.label} ${item.categoryName}`).includes(normalize(filter)))
  const label = (sticker: PanelStickerDef) => sticker.label.split('\n').join(' · ')
  const choose = (sticker: PanelStickerDef) => {
    setChosen(sticker)
    setCustom((current) => ({ background: sticker.bg ?? '#ffffff', color: sticker.fg ?? '#0f172a', icon: sticker.icon, text: sticker.label, face: current?.face ?? faces?.[0]?.value }))
  }
  const add = (sticker = chosen, values = custom) => {
    if (!sticker || !values) return
    onPick(sticker, values); onClose()
  }
  const set = (patch: Partial<StickerCustomization>) => setCustom((current) => current && { ...current, ...patch })
  const draft = useMemo(() => chosen && custom ? presetDecal(chosen, custom) : null, [chosen, custom])
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); onClose() }
      if (event.key === 'Tab') {
        const controls = Array.from(card.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input,textarea,[tabindex="0"]') ?? [])
        const first = controls[0], last = controls[controls.length - 1]
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
      }
    }
    window.addEventListener('keydown', key, true)
    return () => { window.removeEventListener('keydown', key, true); opener.current?.focus({ preventScroll: true }) }
  }, [onClose])
  return <div className="dc-sticker-backdrop" onClick={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <div ref={card} className={`dc-sticker-dialog${chosen ? ' has-editor' : ''}`} role="dialog" aria-modal="true" aria-label="Biblioteca de etiquetas">
      <header><div><h3>Biblioteca de etiquetas</h3><p>Escolha um modelo, ajuste fundo, cores e símbolo e adicione. Duplo clique adiciona logo.</p></div><button type="button" className="dc-btn" aria-label="Fechar biblioteca de etiquetas" onClick={onClose}><IconClose size={16} /></button></header>
      <div className="dc-sticker-search"><input type="search" className="dc-input" aria-label="Pesquisar etiquetas" placeholder="Pesquisar texto ou categoria…" autoFocus value={filter} onChange={(event) => setFilter(event.target.value)} /><Select className="dc-input" aria-label="Categoria de etiquetas" value={category} onChange={(event) => setCategory(event.target.value)}>{CATEGORIES.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</Select></div>
      <div className="dc-sticker-results" role="status">{filtered.length} modelo{filtered.length === 1 ? '' : 's'}</div>
      <div className="dc-sticker-grid">
        {filtered.map((sticker) => {
          const on = chosen?.id === sticker.id
          return <button key={sticker.id} type="button" aria-pressed={on} className={on ? 'is-on' : ''} aria-label={`Escolher ${label(sticker)}`}
            onClick={() => { choose(sticker); requestAnimationFrame(() => addButton.current?.scrollIntoView({ block: 'nearest' })) }}
            onDoubleClick={() => add(sticker, { background: sticker.bg ?? '#ffffff', color: sticker.fg ?? '#0f172a', icon: sticker.icon, text: sticker.label, face: custom?.face ?? faces?.[0]?.value })}>
            <DecalPreview decal={presetDecal(sticker)} /><strong>{brandSlugOf(sticker.icon) ? BRAND_LOGOS[brandSlugOf(sticker.icon)!].name : label(sticker)}</strong><small>{sticker.categoryName}</small>
          </button>
        })}
        {!filtered.length && <p className="dc-decal-empty">Sem modelos para esta pesquisa. Experimente outro texto ou categoria.</p>}
      </div>
      {chosen && custom && draft && <section className="dc-sticker-editor" aria-label="Personalizar etiqueta">
        <div className="dc-sticker-editor-body">
        <DecalPreview decal={draft} className="is-large" />
        <div className="dc-sticker-editor-fields">
          {!brandSlugOf(custom.icon) && <label className="dc-sticker-field"><span>Texto</span><textarea className="dc-input" rows={2} aria-label="Texto da etiqueta a adicionar" value={custom.text} onChange={(event) => set({ text: event.target.value })} /></label>}
          <div className="dc-sticker-field"><span>Fundo</span><div className="dc-sticker-swatches" role="radiogroup" aria-label="Cor de fundo">
            {STICKER_BACKGROUNDS.map((swatch) => <button key={swatch.value} type="button" role="radio" aria-checked={custom.background.toLowerCase() === swatch.value} aria-label={swatch.name} title={swatch.name} style={{ background: swatch.value }} onClick={() => set({ background: swatch.value })} />)}
            <label className="dc-sticker-swatch-custom" title="Outra cor de fundo"><input type="color" aria-label="Outra cor de fundo" value={custom.background} onChange={(event) => set({ background: event.target.value })} /></label>
          </div></div>
          <label className="dc-sticker-field is-inline"><span>Texto, símbolo e contorno</span><input type="color" aria-label="Cor do texto e do símbolo" value={custom.color} onChange={(event) => set({ color: event.target.value })} /></label>
          <div className="dc-sticker-field"><span>Símbolo</span><StickerIconGrid value={custom.icon} onChange={(icon) => set({ icon })} /></div>
          {faces && faces.length > 1 && <div className="dc-sticker-field is-inline"><span>Colocar em</span><div className="dc-acc-seg" role="group" aria-label="Onde colar a etiqueta">
            {faces.map((face) => <button key={face.value} type="button" aria-pressed={custom.face === face.value} className={custom.face === face.value ? 'is-on' : ''} onClick={() => set({ face: face.value })}>{face.label}</button>)}
          </div></div>}
        </div>
        </div>
        <footer><button type="button" className="dc-btn" onClick={() => { setChosen(null); setCustom(null) }}>Voltar</button><button ref={addButton} type="button" className="dc-btn dc-btn-primary" onClick={() => add()}>Adicionar etiqueta</button></footer>
      </section>}
    </div>
  </div>
}

/** Símbolos: pictogramas e logótipos reais das marcas (estes ocupam o desenho todo, sem texto). */
const ICON_CHOICES = [
  { id: '', name: 'Sem símbolo' },
  ...STICKER_ICONS,
  ...Object.entries(BRAND_LOGOS).map(([slug, logo]) => ({ id: `${BRAND_ICON_PREFIX}${slug}`, name: logo.name })),
]

/** Grelha visual de símbolos, partilhada pelo modal e pelo editor da etiqueta selecionada. */
/** Os símbolos aparecem sempre em fundo neutro para se reconhecerem; as cores escolhidas veem-se na pré-visualização. */
export function StickerIconGrid({ value, onChange, disabled = false }: { value: string | undefined; onChange: (icon: string) => void; disabled?: boolean }) {
  return <div className="dc-sticker-icons" role="radiogroup" aria-label="Símbolo da etiqueta">
    {ICON_CHOICES.map((icon) => <button key={icon.id || 'none'} type="button" role="radio" disabled={disabled} aria-checked={(value || '') === icon.id} aria-label={icon.name} title={icon.name} onClick={() => onChange(icon.id)}>
      {icon.id ? <DecalPreview decal={{ id: `icon-${icon.id}`, kind: 'symbol', face: 'front', icon: icon.id, text: '', background: '#ffffff', color: '#1e293b', widthMm: brandSlugOf(icon.id) ? 30 : 16, heightMm: 16, border: false }} /> : <span className="dc-sticker-icon-none">—</span>}
    </button>)}
  </div>
}
