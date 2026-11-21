import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ComponentDecal, ElectricalComponent } from '../types'
import { useSimStore } from '../store/useSimStore'
import { useDecalKeyboard } from '../ui/useDecalKeyboard'
import InspectorNumberInput from '../ui/InspectorNumberInput'
import Select from '../ui/Select'
import { IconClose, IconImage, IconPlus, IconTag } from '../ui/icons'
import PanelStickerPicker, { StickerIconGrid, type StickerCustomization } from './PanelStickerPicker'
import DecalPreview from './DecalPreview'
import { PANEL_STICKER_PRESETS, type PanelStickerDef } from '../three/panelStickers'
import { decalIconOf, defaultDecalFontSizeMm } from '../three/decalContent'

import { enclosureDimsOf } from '../three/enclosureParts'
import { modularCoverLayout } from '../three/modularCoverLayout'

/** Faces de um quadro onde se pode colar: porta e sobretampa (proteção interior DIN). */
export const ENCLOSURE_DECAL_FACES: Array<{ value: ComponentDecal['face']; label: string }> = [{ value: 'door', label: 'Porta' }, { value: 'innerCover', label: 'Sobretampa' }]

/** Posição inicial na sobretampa: faixa lisa por cima da primeira fila de aparelhos, lado a lado. */
export function innerCoverSlot(c: ElectricalComponent, index: number, widthMm: number): { offsetXmm: number; offsetYmm: number } {
  const layout = modularCoverLayout(enclosureDimsOf(c.state), typeof c.state.modularRows === 'number' ? c.state.modularRows : undefined)
  const top = layout.openings[layout.openings.length - 1]
  const stripTop = layout.heightMm / 2, stripBottom = top ? top.yMm + top.heightMm / 2 : 0
  const step = widthMm + 6, perRow = Math.max(1, Math.floor((layout.widthMm - 60) / step))
  const column = index % perRow
  // 30 mm de margem lateral: livre dos parafusos de fixação dos cantos da sobretampa.
  return { offsetXmm: Math.round(-layout.widthMm / 2 + 30 + step * (column + .5)), offsetYmm: Math.round((stripTop + stripBottom) / 2) }
}

export function stickerDecal(sticker: PanelStickerDef, enclosure = false, custom?: StickerCustomization): Partial<ComponentDecal> {
  const icon = custom ? custom.icon : sticker.icon
  const decal: Partial<ComponentDecal> = { kind: icon ? 'symbol' : 'text', stickerId: sticker.id, text: custom?.text ?? sticker.label, icon: icon || (custom ? '' : undefined), background: custom?.background ?? sticker.bg ?? '#ffffff', color: custom?.color ?? sticker.fg ?? '#0f172a', face: custom?.face ?? (enclosure ? 'door' : 'front'), widthMm: sticker.widthMm ?? (sticker.category === 'numbers' ? 16 : 28), heightMm: sticker.heightMm ?? (sticker.category === 'numbers' ? 16 : 28) }
  return { ...decal, fontSizeMm: defaultDecalFontSizeMm(decal) }
}

export default function ComponentDecalControls({ component: c }: { component: ElectricalComponent }) {
  useDecalKeyboard()
  const selection = useSimStore((s) => s.selectedDecal)
  const stopped = useSimStore((s) => s.sim.runState === 'stopped')
  const [library, setLibrary] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [loading, setLoading] = useState(false)
  const section = useRef<HTMLDetailsElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const libraryButton = useRef<HTMLButtonElement>(null)
  const alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [c.id])
  const enclosure = c.type === 'panelEnclosure', disabled = !!c.locked || !stopped
  const decals = c.decals ?? []
  const current = selection?.componentId === c.id ? decals.find((decal) => decal.id === selection.decalId) : undefined
  useEffect(() => {
    if (!current || !section.current) return
    let node: HTMLElement | null = section.current
    while (node) { if (node instanceof HTMLDetailsElement) node.open = true; node = node.parentElement }
  }, [current?.id])
  const add = (decal: Partial<ComponentDecal>) => { if (!disabled) useSimStore.getState().addDecal(c.id, decal) }
  const closeLibrary = () => { setLibrary(false); requestAnimationFrame(() => libraryButton.current?.focus({ preventScroll: true })) }
  const upload = async (file: File | undefined) => {
    if (!file || disabled) return
    if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/bmp'].includes(file.type)) { setFeedback('Escolha uma imagem PNG, JPG, WebP, GIF ou BMP.'); return }
    if (file.size > 4_000_000) { setFeedback('A imagem excede 4 MB. Reduza o ficheiro antes de carregar.'); return }
    setLoading(true); setFeedback('A carregar imagem…')
    try {
      const url = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(file) })
      const image = new Image(); image.src = url; await image.decode()
      if (!alive.current) return
      const ratio = image.naturalWidth / image.naturalHeight
      const maxWidth = enclosure ? Number(c.state.widthMm ?? 600) * .6 : 40
      const maxHeight = enclosure ? Number(c.state.heightMm ?? 800) * .6 : 30
      const width = Math.min(maxWidth, maxHeight * ratio), height = width / ratio
      add({ kind: 'image', text: file.name, face: enclosure ? 'door' : 'front', imageUrl: url, widthMm: Math.round(width * 100) / 100, heightMm: Math.round(height * 100) / 100, imageAspectRatio: ratio, keepAspectRatio: true, border: false })
      setFeedback(`Imagem «${file.name}» adicionada.`)
    } catch { if (alive.current) setFeedback('Não foi possível ler a imagem. Experimente outro ficheiro.') }
    finally { if (alive.current) setLoading(false) }
  }
  return <details ref={section} className="dc-inspector-group dc-decal-controls" data-decal-controls open={decals.length > 0}>
    <summary>Imagens e etiquetas <span className="dc-inspector-count">{decals.length}</span></summary>
    <div className="dc-inspector-group-body">
      <div className="dc-decal-add">
        <button type="button" className="dc-btn dc-btn-primary" disabled={disabled} onClick={() => add({ kind: 'text', text: 'Nova etiqueta', face: enclosure ? 'door' : 'front', widthMm: enclosure ? 60 : 30, heightMm: enclosure ? 20 : 12, background: '#ffffff', color: '#111827' })}><IconPlus size={13} /> Adicionar texto</button>
        <button ref={libraryButton} type="button" className="dc-btn" disabled={disabled} onClick={() => setLibrary(true)}><IconTag size={13} /> Biblioteca de etiquetas</button>
        <button type="button" className="dc-btn" disabled={disabled || loading} onClick={() => input.current?.click()}><IconImage size={13} /> Carregar imagem</button>
        <input ref={input} type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/bmp" aria-label="Ficheiro de imagem" className="sr-only" disabled={disabled || loading} onChange={(event) => { void upload(event.target.files?.[0]); event.target.value = '' }} />
      </div>
      <p className={feedback ? 'dc-decal-feedback' : 'sr-only'} role="status" aria-live="polite">{feedback}</p>
      {decals.length === 0 ? <p className="dc-decal-empty">Adicione texto, escolha um modelo ou carregue uma imagem. A etiqueta acompanha a {enclosure ? 'porta' : 'face do aparelho'}.</p> : <div className="dc-decal-list" role="listbox" aria-label="Imagens e etiquetas do elemento">
        {decals.map((decal, index) => <button key={decal.id} type="button" role="option" aria-label={`Selecionar etiqueta ${index + 1}`} aria-selected={current?.id === decal.id} className={`dc-decal-list-item${current?.id === decal.id ? ' is-selected' : ''}`} disabled={disabled} onClick={() => useSimStore.getState().selectDecal(c.id, decal.id)}>
          <DecalPreview decal={decal} /><span><strong>{decal.text?.split('\n').join( ' · ') || (decal.kind === 'image' ? 'Imagem' : 'Etiqueta')}</strong><small>{decal.widthMm ?? 30} × {decal.heightMm ?? 15} mm</small></span>
        </button>)}
      </div>}
      {current && <DecalFields key={current.id} component={c} decal={current} disabled={disabled} />}
      {current && <p className="dc-decal-help">X/Y a partir do centro da face; Y positivo sobe. Arraste no esquema ou no 3D. Setas: 1 mm · Shift + setas: 10 mm · Esc: desselecionar.</p>}
    </div>
    {library && createPortal(<PanelStickerPicker onClose={closeLibrary} faces={enclosure ? ENCLOSURE_DECAL_FACES : undefined} onPick={(sticker, custom) => {
      const decal = stickerDecal(sticker, enclosure, custom)
      if (decal.face === 'innerCover') Object.assign(decal, innerCoverSlot(c, decals.filter((item) => item.face === 'innerCover').length, decal.widthMm ?? 28))
      add(decal)
    }} />, document.body)}
  </details>
}

function DecalFields({ component: c, decal: d, disabled }: { component: ElectricalComponent; decal: ComponentDecal; disabled: boolean }) {
  const enclosure = c.type === 'panelEnclosure'
  const patch = (value: Partial<ComponentDecal>) => useSimStore.getState().updateDecal(c.id, d.id, value)
  const ratio = d.imageAspectRatio ?? (d.widthMm ?? 30) / (d.heightMm ?? 15)
  const resize = (key: 'widthMm' | 'heightMm', value: number) => patch({ [key]: value, ...(d.kind === 'image' && d.keepAspectRatio !== false ? { [key === 'widthMm' ? 'heightMm' : 'widthMm']: Math.round((key === 'widthMm' ? value / ratio : value * ratio) * 100) / 100 } : {}) })
  return <div className="dc-decal-fields" aria-label="Editar etiqueta selecionada">
    <DecalPreview decal={d} className="is-large" />
    <label><span>{d.kind === 'image' ? 'Nome da imagem' : 'Texto da etiqueta'}</span><textarea aria-label="Texto da etiqueta" className="dc-input" rows={d.kind === 'image' ? 2 : 3} value={d.text ?? ''} disabled={disabled} onChange={(event) => patch({ text: event.target.value })} /></label>
    <div className="dc-decal-grid">
      {(['widthMm', 'heightMm'] as const).map((key) => <label key={key}><span>{key === 'widthMm' ? 'Largura' : 'Altura'} (mm)</span><InspectorNumberInput className="dc-input" type="number" min={1} step={.5} value={d[key] ?? (key === 'widthMm' ? 30 : 15)} aria-label={`${key === 'widthMm' ? 'Largura' : 'Altura'} da etiqueta (mm)`} disabled={disabled} onChange={(event) => resize(key, Number(event.target.value))} /></label>)}
      {(['offsetXmm', 'offsetYmm'] as const).map((key) => <label key={key}><span>{key === 'offsetXmm' ? 'X' : 'Y'} (mm)</span><InspectorNumberInput className="dc-input" type="number" step={1} value={d[key] ?? 0} aria-label={`Posição ${key === 'offsetXmm' ? 'X' : 'Y'} da etiqueta (mm)`} disabled={disabled} onChange={(event) => patch({ [key]: Number(event.target.value) })} /></label>)}
      <label><span>Rotação (°)</span><InspectorNumberInput className="dc-input" type="number" step={15} value={d.rotationDeg ?? 0} aria-label="Rotação da etiqueta (°)" disabled={disabled} onChange={(event) => patch({ rotationDeg: Number(event.target.value) })} /></label>
      <label><span>Face</span><Select className="dc-input" aria-label="Face da etiqueta" disabled={disabled} value={enclosure && ['front', 'door', 'doorOuter'].includes(d.face) ? 'door' : d.face} onChange={(event) => {
        const face = event.target.value as ComponentDecal['face']
        patch(face === 'innerCover' && d.face !== 'innerCover' ? { face, ...innerCoverSlot(c, (c.decals ?? []).filter((item) => item.face === 'innerCover').length, d.widthMm ?? 28) } : { face, ...(d.face === 'innerCover' ? { offsetXmm: 0, offsetYmm: 0 } : {}) })
      }}>
        <option value={enclosure ? 'door' : 'front'}>{enclosure ? 'Porta' : 'Frente'}</option>{enclosure && <option value="innerCover">Sobretampa</option>}{!['front', 'door', 'doorOuter', ...(enclosure ? ['innerCover'] : [])].includes(d.face) && <option value={d.face}>Face guardada: {d.face}</option>}
      </Select></label>
    </div>
    {d.kind === 'image' ? <label className="dc-decal-check"><input type="checkbox" checked={d.keepAspectRatio !== false} disabled={disabled} onChange={(event) => patch({ keepAspectRatio: event.target.checked })} /><span>Manter proporções da imagem</span></label> : <>
      <label><span>Tamanho do texto (mm)</span><InspectorNumberInput className="dc-input" type="number" min={.1} step={.5} value={d.fontSizeMm ?? defaultDecalFontSizeMm(d)} aria-label="Tamanho do texto (mm)" disabled={disabled} onChange={(event) => patch({ fontSizeMm: Number(event.target.value) })} /></label>
      <div className="dc-decal-grid"><label><span>Fundo</span><input type="color" aria-label="Cor de fundo da etiqueta" value={d.background ?? '#ffffff'} disabled={disabled} onChange={(event) => patch({ background: event.target.value })} /></label><label><span>Texto e símbolo</span><input type="color" aria-label="Cor do texto da etiqueta" value={d.color ?? '#111827'} disabled={disabled} onChange={(event) => patch({ color: event.target.value })} /></label></div>
      <div className="dc-decal-symbol"><span>Símbolo</span><StickerIconGrid value={decalIconOf(d) ?? ''} disabled={disabled} onChange={(icon) => patch({ icon, kind: icon ? (d.kind === 'text' ? 'symbol' : d.kind) : d.kind === 'symbol' ? 'text' : d.kind })} /></div>
    </>}
    <label className="dc-decal-check"><input type="checkbox" checked={d.border !== false} disabled={disabled} onChange={(event) => patch({ border: event.target.checked })} /><span>Mostrar contorno</span></label>
    <details className="dc-decal-advanced"><summary>Tipo de etiqueta</summary><div className="dc-decal-grid">
      <label><span>Tipo</span><Select aria-label="Tipo de etiqueta" className="dc-input" disabled={disabled} value={d.kind} onChange={(event) => { const kind = event.target.value as ComponentDecal['kind']; patch({ kind, stickerId: undefined, icon: ['text', 'logo', 'image'].includes(kind) ? undefined : d.icon || 'bolt' }) }}><option value="text">Texto</option><option value="warning">Aviso</option><option value="logo">Marca</option><option value="symbol">Símbolo</option>{d.imageUrl && <option value="image">Imagem</option>}</Select></label>
    </div></details>
    <button type="button" className="dc-btn dc-btn-danger" aria-label="Remover etiqueta selecionada" disabled={disabled} onClick={() => useSimStore.getState().removeDecal(c.id, d.id)}><IconClose size={13} /> Remover etiqueta</button>
  </div>
}
