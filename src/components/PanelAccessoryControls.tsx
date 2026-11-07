import { useState } from 'react'
import { fitDuctResize, fitDuctSideResize } from '../schematic/ductResize'
import type { DuctSlot } from '../schematic/ductPlacement'
import { ENCLOSURE_EXTERIOR_FACES, ENCLOSURE_FACES, hiddenEnclosureFaces, toggleEnclosureExteriorVisibility } from '../three/enclosureVisibility'
import { useSimStore } from '../store/useSimStore'
import type { ElectricalComponent } from '../types'
import { SCHEMATIC_PX_PER_MM } from '../three/modelPaths'
import { CABLE_DUCT, cableDuctDimsOf, ENCLOSURE, enclosureDimsOf, enclosureHingeOf, spiralWrapDimsOf } from '../three/enclosureParts'
import { DIN_RAIL_FINISH_IDS, DIN_RAIL_PROFILE_IDS, DIN_RAIL_PROFILES, dinRailProfileIdOf, dinRailProfileOf } from '../three/dinRailGeometry'
import { CABLE_DUCT_DEFAULT_COLOR, ENCLOSURE_DEFAULT_COLOR, ENCLOSURE_PLATE_FINISH_IDS } from '../three/PanelAccessories3D'
import Select from '../ui/Select'
import {
  IconArrowLeft,
  IconArrowRight,
  IconArrowUp,
  IconArrowDown,
  IconCamera,
  IconClose,
  IconDelete,
  IconDistH,
  IconImage,
  IconLayers,
  IconPlus,
  IconEye,
  IconEyeOff,
} from '../ui/icons'

/** Estado do inspetor que estes controlos já mostram (não se repete na lista genérica). */
export const PANEL_ACCESSORY_STATE_KEYS = new Set(['widthMm', 'heightMm', 'depthMm', 'doorOpen', 'hingeSide', 'plateFinish', 'lengthMm', 'coverOn', 'innerDiaMm', 'pitchMm', 'color', 'editorHiddenFaces'])
export const RAIL_PROFILE_STATE_KEYS = new Set(['profile', 'finish', 'perforated'])

const ENCLOSURE_PRESETS: Array<[number, number, number]> = [[300, 400, 200], [400, 500, 200], [500, 700, 250], [600, 800, 250], [800, 1000, 300], [1000, 1200, 300]]
const ENCLOSURE_COLORS = [
  { name: 'RAL 7035 cinzento-claro', value: ENCLOSURE_DEFAULT_COLOR },
  { name: 'RAL 7032 cinzento-seixo', value: '#b9b6a2' },
  { name: 'RAL 9016 branco', value: '#eeefea' },
  { name: 'RAL 7016 antracite', value: '#3b4148' },
  { name: 'Inox escovado', value: '#c3c8cc' },
]
const DUCT_COLORS = [
  { name: 'RAL 7030 cinzento-pedra', value: CABLE_DUCT_DEFAULT_COLOR },
  { name: 'RAL 7035 cinzento-claro', value: ENCLOSURE_DEFAULT_COLOR },
  { name: 'Azul (comando)', value: '#4f7fbf' },
  { name: 'Branco', value: '#eeefea' },
]

/** Muda as medidas mantendo o centro no Esquema (o footprint acompanha os mm). */
function resize(c: ElectricalComponent, wMm: number, hMm: number, state: Record<string, unknown>) {
  const w = Math.max(4, Math.round(wMm * SCHEMATIC_PX_PER_MM))
  const h = Math.max(4, Math.round(hMm * SCHEMATIC_PX_PER_MM))
  let nx = Math.round(c.schematicX + (c.w - w) / 2)
  let ny = Math.round(c.schematicY + (c.h - h) / 2)
  // Se a calha/quadro está dentro de um quadro QE1, não deixa o footprint sair da moldura — ajusta o centro para caber.
  try {
    const all = useSimStore.getState().components
    const enclosures = all.filter((e) => e.type === 'panelEnclosure')
    // Considera a rotação da calha para o AABB no esquema (vertical = w/h trocados)
    const isVerticalDuct = c.type === 'cableDuct' && Math.round(((c.rotation ?? 0) % 180) / 90) % 2 === 1
    const effW = isVerticalDuct ? h : w
    const effH = isVerticalDuct ? w : h
    for (const enc of enclosures) {
      const insideX = Math.abs(c.schematicX + c.w / 2 - (enc.schematicX + enc.w / 2)) < enc.w / 2 + c.w / 2
      const insideY = Math.abs(c.schematicY + c.h / 2 - (enc.schematicY + enc.h / 2)) < enc.h / 2 + c.h / 2
      if (!insideX || !insideY) continue
      const margin = 8 // px — flange 18mm ≈ 27px, deixa folga visual
      // O footprint roda em torno do centro: o limite aplica-se ao centro com o AABB já rodado (vertical = w/h trocados)
      const cxMin = enc.schematicX + margin + effW / 2, cxMax = enc.schematicX + enc.w - margin - effW / 2
      const cyMin = enc.schematicY + margin + effH / 2, cyMax = enc.schematicY + enc.h - margin - effH / 2
      if (cxMax >= cxMin) nx = Math.round(Math.max(cxMin, Math.min(cxMax, nx + w / 2)) - w / 2)
      if (cyMax >= cyMin) ny = Math.round(Math.max(cyMin, Math.min(cyMax, ny + h / 2)) - h / 2)
      // Também limita o tamanho se a calha for maior que o interior
      if (effW > enc.w - margin * 2 || effH > enc.h - margin * 2) {
        // não impede o aumento, mas avisa
        useSimStore.getState().pushEvent('warning', `${c.ref} maior que o interior do ${enc.ref} — parte ficará encostada à parede.`)
      }
      break
    }
  } catch { /* fora do store em testes */ }
  useSimStore.getState().updateComponent(c.id, {
    w, h,
    schematicX: nx,
    schematicY: ny,
    state: { ...c.state, ...state },
  })
}

let lastDuctWarn = 0
/** Calha técnica: aplica comprimento/largura até onde cabe (aparelhos e parede do quadro) e diz porquê quando limita. */
function resizeDuct(c: ElectricalComponent, lengthMm: number, widthMm: number, state: Record<string, unknown>) {
  const st = useSimStore.getState()
  const fit = fitDuctResize(c, st.components, lengthMm, widthMm)
  const warn = (msg: string) => { const now = Date.now(); if (now - lastDuctWarn > 1500) { lastDuctWarn = now; st.pushEvent('warning', msg) } }
  if (!fit) { warn(`${c.ref}: sem espaço para ${widthMm} mm de largura — afaste os aparelhos vizinhos.`); return }
  st.updateComponent(c.id, { w: fit.w, h: fit.h, schematicX: fit.schematicX, schematicY: fit.schematicY, state: { ...c.state, ...state, lengthMm: fit.lengthMm, widthMm: fit.widthMm } })
  if (fit.limited) warn(`${c.ref} limitada a ${fit.lengthMm} mm: encosta noutro aparelho ou na parede do quadro.`)
}

/** Aumenta/reduz a calha por uma só ponta (a oposta não se mexe); limita-se onde encosta noutro aparelho. */
function resizeDuctSide(c: ElectricalComponent, side: 'left' | 'right', lengthMm: number) {
  const st = useSimStore.getState()
  const fresh = st.components.find((x) => x.id === c.id) ?? c
  const fit = fitDuctSideResize(fresh, st.components, side, lengthMm, CABLE_DUCT.minLengthMm, CABLE_DUCT.maxLengthMm)
  if (!fit) {
    const cur = Math.round(fresh.w / SCHEMATIC_PX_PER_MM)
    if (lengthMm > cur) { const now = Date.now(); if (now - lastDuctWarn > 1500) { lastDuctWarn = now; st.pushEvent('warning', `${fresh.ref}: sem espaço do lado ${side === 'left' ? 'esquerdo' : 'direito'} — encosta noutro aparelho ou na parede do quadro.`) } }
    return
  }
  st.updateComponent(fresh.id, { w: fit.w, h: fit.h, schematicX: fit.schematicX, schematicY: fit.schematicY, state: { ...fresh.state, lengthMm: fit.lengthMm, widthMm: fit.widthMm } })
  if (fit.limited) { const now = Date.now(); if (now - lastDuctWarn > 1500) { lastDuctWarn = now; st.pushEvent('warning', `${fresh.ref} limitada a ${fit.lengthMm} mm deste lado: encosta noutro aparelho ou na parede do quadro.`) } }
}

/** Barra de tamanho de uma ponta da calha: slider + passos de ±10/50 mm. */
function DuctSideBar({ c, side, lengthMm }: { c: ElectricalComponent; side: 'left' | 'right'; lengthMm: number }) {
  const label = side === 'left' ? 'Lado esquerdo' : 'Lado direito'
  const ArrowIcon = side === 'left' ? IconArrowLeft : IconArrowRight
  const step = (delta: number) => resizeDuctSide(c, side, lengthMm + delta)
  return <div className="dc-acc-measure" data-duct-side={side}>
    <div className="dc-acc-measure-head"><span className="inline-flex items-center gap-1.5"><ArrowIcon size={12} /> {label} <small>(ponta {side === 'left' ? 'esq.' : 'dir.'})</small></span><span className="dc-acc-unit">{lengthMm} mm</span></div>
    <input type="range" min={CABLE_DUCT.minLengthMm} max={CABLE_DUCT.maxLengthMm} step={5} value={lengthMm} aria-label={`${label}: aumentar ou reduzir a calha`} onChange={(e) => resizeDuctSide(c, side, Number(e.target.value))} />
    <div className="flex flex-wrap gap-1.5">
      {[-50, -10, 10, 50].map((d) => <button key={d} type="button" className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-50" aria-label={`${d > 0 ? 'Aumentar' : 'Reduzir'} ${Math.abs(d)} mm do ${label.toLowerCase()}`} onClick={() => step(d)}>{d > 0 ? '+' : '−'}{Math.abs(d)} mm</button>)}
    </div>
  </div>
}

function MmField({ label, value, min, max, step = 10, onChange }: { label: string; value: number; min: number; max: number; step?: number; onChange: (mm: number) => void }) {
  const commit = (raw: number) => { if (Number.isFinite(raw)) onChange(Math.max(min, Math.min(max, Math.round(raw)))) }
  return <div className="dc-acc-field">
    <span>{label}</span>
    <input type="number" className="dc-input" min={min} max={max} step={step} value={value} onChange={(e) => commit(Number(e.target.value))} aria-label={`${label} (mm)`} />
    <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => commit(Number(e.target.value))} aria-label={label} />
  </div>
}

/** Campo numérico que deixa escrever (rascunho) e só aplica ao sair ou com Enter — sem saltar para o mínimo a meio da escrita. */
function DraftNumber({ value, min, max, step = 1, onCommit, label, className = '' }: { value: number; min: number; max: number; step?: number; onCommit: (v: number) => void; label: string; className?: string }) {
  const [draft, setDraft] = useState<string | null>(null)
  const commit = () => {
    if (draft === null) return
    const n = Number(draft.replace(',', '.'))
    setDraft(null)
    if (draft.trim() !== '' && Number.isFinite(n)) { const v = Math.max(min, Math.min(max, Math.round(n))); if (v !== value) onCommit(v) }
  }
  return <input type="text" inputMode="numeric" enterKeyHint="done" className={`dc-input dc-acc-num ${className}`} value={draft ?? String(value)} aria-label={`${label} (mm)`}
    onFocus={(e) => e.currentTarget.select()} onChange={(e) => setDraft(e.target.value)} onBlur={commit}
    onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { setDraft(null); e.currentTarget.blur() } }} />
}

function Swatches({ options, value, onPick }: { options: Array<{ name: string; value: string }>; value: string; onPick: (color: string) => void }) {
  return <div className="dc-acc-swatches" role="radiogroup" aria-label="Cor">
    {options.map((o) => <button key={o.value} type="button" role="radio" aria-checked={value === o.value} title={o.name} aria-label={o.name}
      className={`dc-acc-swatch${value === o.value ? ' is-on' : ''}`} style={{ background: o.value }} onClick={() => onPick(o.value)} />)}
  </div>
}

export function fitEnclosureToContent(c: ElectricalComponent) {
  const st = useSimStore.getState()
  const enclosure = st.components.find((item) => item.id === c.id) ?? c
  const encRight = enclosure.schematicX + enclosure.w
  const encBottom = enclosure.schematicY + enclosure.h
  const inside = st.components.filter((item) => {
    if (item.id === enclosure.id) return false
    if (item.enclosureId === enclosure.id) return true
    return item.schematicX >= enclosure.schematicX
      && item.schematicY >= enclosure.schematicY
      && item.schematicX + item.w <= encRight
      && item.schematicY + item.h <= encBottom
  })
  if (!inside.length) return 'empty'
  const pad = 60
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const item of inside) {
    minX = Math.min(minX, item.schematicX)
    maxX = Math.max(maxX, item.schematicX + item.w)
    minY = Math.min(minY, item.schematicY)
    maxY = Math.max(maxY, item.schematicY + item.h)
  }
  const needW = Math.ceil((maxX - minX + pad * 2) / SCHEMATIC_PX_PER_MM)
  const needH = Math.ceil((maxY - minY + pad * 2) / SCHEMATIC_PX_PER_MM)
  const w = Math.max(ENCLOSURE.minWidthMm, Math.min(ENCLOSURE.maxWidthMm, needW))
  const h = Math.max(ENCLOSURE.minHeightMm, Math.min(ENCLOSURE.maxHeightMm, needH))
  const footprintW = Math.round(w * SCHEMATIC_PX_PER_MM)
  const footprintH = Math.round(h * SCHEMATIC_PX_PER_MM)
  const x = Math.round((minX + maxX - footprintW) / 2)
  const y = Math.round((minY + maxY - footprintH) / 2)
  const limited = minX < x + pad || minY < y + pad || maxX > x + footprintW - pad || maxY > y + footprintH - pad
  st.updateComponent(enclosure.id, {
    w: footprintW,
    h: footprintH,
    schematicX: x,
    schematicY: y,
    state: { ...enclosure.state, widthMm: w, heightMm: h },
  })
  if (limited) {
    st.pushEvent('warning', `O conteúdo excede o limite máximo do quadro (${w}×${h} mm); alguns itens podem ficar fora.`)
    return 'limited'
  }
  st.pushEvent('info', `Quadro ajustado para ${w}×${h} mm.`)
  return 'fit'
}

export function EnclosureControls({ c }: { c: ElectricalComponent }) {
  const d = enclosureDimsOf(c.state)
  const hinge = enclosureHingeOf(c.state)
  const open = c.state.doorOpen !== false
  const hiddenFaces = hiddenEnclosureFaces(c.state)
  const exteriorHidden = ENCLOSURE_EXTERIOR_FACES.every(face => hiddenFaces.includes(face))
  const set = (patch: Record<string, unknown>) => useSimStore.getState().setComponentState(c.id, patch)
  const color = c.bodyColor && c.bodyColor !== '#e2e8f0' ? c.bodyColor : ENCLOSURE_DEFAULT_COLOR
  const components = useSimStore((s) => s.components)
  const selectedIds = useSimStore((s) => s.selectedComponentIds)
  const attached = components.filter((item) => item.enclosureId === c.id)
  const selectionToAssign = selectedIds.filter((id) => id !== c.id && !components.find((item) => item.id === id)?.enclosureId)
  const imageDecals = (c.decals ?? []).filter((de) => de.kind === 'image')
  const handleImageUpload = (files: FileList | null) => {
    if (!files?.length) return
    const file = files[0]
    if (!file.type.startsWith('image/')) { useSimStore.getState().pushEvent('warning', 'Ficheiro não é imagem. Use PNG/JPG/WebP.'); return }
    if (file.size > 4_000_000) { useSimStore.getState().pushEvent('warning', 'Imagem muito grande (>4 MB). Comprima antes.'); return }
    const reader = new FileReader()
    reader.onload = () => {
      const url = String(reader.result ?? '')
      if (!url.startsWith('data:')) return
      // cria decal na porta, centrado, 60% da porta
      const w = Math.round(d.widthMm * 0.62)
      const h = Math.round(w * 0.45)
      useSimStore.getState().addDecal(c.id, { kind: 'image' as any, face: 'door', offsetXmm: 0, offsetYmm: 0, widthMm: w, heightMm: h, imageUrl: url, border: false } as any)
      useSimStore.getState().pushEvent('info', `Imagem "${file.name}" adicionada à tampa.`)
    }
    reader.readAsDataURL(file)
  }
  const holes: import('../types').EnclosureHole[] = (c.state as any).holes ?? []
  const [holeFace, setHoleFace] = useState<import('../types').EnclosureHoleFace>('bottom')
  const [holeDia, setHoleDia] = useState<number>(20)
  const [holeOx, setHoleOx] = useState<number>(0)
  const [holeOy, setHoleOy] = useState<number>(0)
  const [fitFeedback, setFitFeedback] = useState('')
  const fitToContent = () => {
    const result = fitEnclosureToContent(c)
    if (result === 'empty') setFitFeedback('Não há equipamentos dentro do quadro para ajustar.')
    else if (result === 'limited') setFitFeedback('O conteúdo excede a dimensão máxima; alguns itens podem ficar fora do quadro.')
    else setFitFeedback('')
  }
  return <div className="dc-acc space-y-3">
    {/* Cabeçalho com estado porta */}
    <div className="rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2.5 flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <div className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase">Quadro metálico</div>
        <div className="text-[13px] font-bold text-slate-800">{d.widthMm} × {d.heightMm} × {d.depthMm} mm <span className={`ml-1.5 inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-medium border ${open ? 'bg-amber-100 text-amber-700 border-amber-200' : 'bg-emerald-100 text-emerald-700 border-emerald-200'}`}>{open ? 'porta aberta' : 'porta fechada'}</span></div>
      </div>
      <button type="button" className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold border shadow-sm ${open ? 'bg-white border-slate-300 text-slate-700' : 'bg-slate-800 border-slate-800 text-white'}`} onClick={() => set({ doorOpen: !open })}>{open ? 'Fechar porta' : 'Abrir porta'}</button>
    </div>

    {/* Medidas — prática */}
    <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-3">
      <div className="flex items-center justify-between"><span className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase">Medidas</span><button type="button" className="min-h-[38px] text-[11px] font-medium text-blue-600 hover:underline" onClick={fitToContent}><IconDistH size={12} className="inline mr-1" />Ajustar ao conteúdo</button></div>
      <p role="status" aria-live="polite" data-enclosure-fit-feedback className={fitFeedback ? 'text-[11px] text-amber-800 leading-snug' : 'sr-only'}>{fitFeedback}</p>
      <div className="grid grid-cols-3 gap-2">
        <label className="space-y-1"><span className="text-xs text-slate-600">Largura</span><div className="flex items-center gap-1"><input type="number" className="dc-input h-8 w-full text-center text-sm" value={d.widthMm} min={ENCLOSURE.minWidthMm} max={ENCLOSURE.maxWidthMm} step={10} onChange={(e)=> resize(c, Math.max(ENCLOSURE.minWidthMm, Math.min(ENCLOSURE.maxWidthMm, Number(e.target.value)||0)), d.heightMm, {widthMm: Number(e.target.value)})} /><span className="text-xs text-slate-400">mm</span></div></label>
        <label className="space-y-1"><span className="text-xs text-slate-600">Altura</span><div className="flex items-center gap-1"><input type="number" className="dc-input h-8 w-full text-center text-sm" value={d.heightMm} min={ENCLOSURE.minHeightMm} max={ENCLOSURE.maxHeightMm} step={10} onChange={(e)=> resize(c, d.widthMm, Math.max(ENCLOSURE.minHeightMm, Math.min(ENCLOSURE.maxHeightMm, Number(e.target.value)||0)), {heightMm: Number(e.target.value)})} /><span className="text-xs text-slate-400">mm</span></div></label>
        <label className="space-y-1"><span className="text-xs text-slate-600">Prof.</span><div className="flex items-center gap-1"><input type="number" className="dc-input h-8 w-full text-center text-sm" value={d.depthMm} min={ENCLOSURE.minDepthMm} max={ENCLOSURE.maxDepthMm} step={10} onChange={(e)=> set({depthMm: Math.max(ENCLOSURE.minDepthMm, Math.min(ENCLOSURE.maxDepthMm, Number(e.target.value)||0))})} /><span className="text-xs text-slate-400">mm</span></div></label>
      </div>
      <input type="range" className="w-full accent-slate-700 min-h-[38px]" aria-label="Largura do quadro (mm)" min={ENCLOSURE.minWidthMm} max={ENCLOSURE.maxWidthMm} step={10} value={d.widthMm} onChange={(e)=> resize(c, Number(e.target.value), d.heightMm, {widthMm: Number(e.target.value)})} />
      <div className="grid grid-cols-3 gap-1.5">
        {ENCLOSURE_PRESETS.map(([w,h,dp])=> <button key={`${w}x${h}`} type="button" className={`rounded-lg border p-2 text-center transition ${d.widthMm===w&&d.heightMm===h ? 'bg-slate-800 border-slate-800 text-white' : 'bg-white border-slate-200 hover:bg-slate-50'}`} onClick={()=> resize(c,w,h,{widthMm:w,heightMm:h,depthMm:dp})}><div className="text-xs font-bold">{w}×{h}</div><div className="text-[10px] opacity-60">{dp} prof.</div></button>)}
      </div>
      <div className="flex items-center gap-2 text-xs">
        <span className="text-slate-600">Dobradiças</span>
        <div className="dc-acc-seg ml-auto" role="group"><button type="button" aria-pressed={hinge==='left'} className={hinge==='left'?'is-on':''} onClick={()=> set({hingeSide:'left'})}>Esq.</button><button type="button" aria-pressed={hinge==='right'} className={hinge==='right'?'is-on':''} onClick={()=> set({hingeSide:'right'})}>Dir.</button></div>
        <span className="text-slate-600 ml-2">Chapa</span>
        <Select className="dc-input h-7 text-xs" aria-label="Acabamento da chapa" value={typeof c.state.plateFinish==='string'?c.state.plateFinish:'Aço galvanizado'} onChange={(e)=> set({plateFinish:e.target.value})}>{ENCLOSURE_PLATE_FINISH_IDS.map(id=> <option key={id} value={id}>{id}</option>)}</Select>
      </div>
      <div className="flex items-center gap-2"><span className="text-xs text-slate-600">Pintura</span><Swatches options={ENCLOSURE_COLORS} value={color} onPick={(v)=> useSimStore.getState().updateComponent(c.id,{bodyColor:v})} /></div>
    </div>

    <div className="rounded-lg border border-blue-200 bg-blue-50/40 p-2" data-enclosure-exterior-toggle>
      <button type="button" aria-pressed={exteriorHidden} aria-label={exteriorHidden ? 'Mostrar exteriores do quadro' : 'Ocultar exteriores do quadro'} title="Oculta ou mostra a porta, laterais, topo e base; preserva o fundo e a chapa de montagem" className="dc-btn w-full justify-center border-blue-200 text-blue-700 hover:bg-blue-50" onClick={() => set({ editorHiddenFaces: toggleEnclosureExteriorVisibility(c.state) })}>
        {exteriorHidden ? <IconEye size={14} /> : <IconEyeOff size={14} />}
        {exteriorHidden ? 'Mostrar exteriores' : 'Ocultar exteriores'}
      </button>
    </div>

    <details className="dc-inspector-group" data-enclosure-visibility>
      <summary>Visibilidade das chapas <span className="dc-inspector-count">{hiddenFaces.length}/{ENCLOSURE_FACES.length} ocultas</span></summary>
      <div className="dc-inspector-group-body">
        <div className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase">Visibilidade para edição 3D</div>
        <div className="grid grid-cols-2 gap-1.5">
          {ENCLOSURE_FACES.map(([face, label]) => {
            const visible = !hiddenFaces.includes(face)
            const Eye = visible ? IconEye : IconEyeOff
            return <button key={face} type="button" aria-pressed={visible} aria-label={`${visible ? 'Ocultar' : 'Mostrar'} ${label.toLowerCase()}`}
              className={`dc-btn justify-start min-h-9 h-auto px-2 py-1.5 ${visible ? '' : 'bg-slate-100 text-slate-500'}`}
              onClick={() => set({ editorHiddenFaces: visible ? [...hiddenFaces, face] : hiddenFaces.filter(f => f !== face) })}>
              <Eye size={14} className="shrink-0" /><span className="min-w-0 whitespace-normal text-left leading-tight">{label}</span>
            </button>
          })}
        </div>
        <button type="button" aria-pressed={hiddenFaces.length === ENCLOSURE_FACES.length} aria-label={hiddenFaces.length === ENCLOSURE_FACES.length ? 'Mostrar todas as chapas' : 'Ocultar todas as chapas'} className="dc-btn w-full justify-center" onClick={() => set({ editorHiddenFaces: hiddenFaces.length === ENCLOSURE_FACES.length ? [] : ENCLOSURE_FACES.map(([face]) => face) })}>
          {hiddenFaces.length === ENCLOSURE_FACES.length ? <IconEye size={14} /> : <IconEyeOff size={14} />}
          {hiddenFaces.length === ENCLOSURE_FACES.length ? 'Mostrar todas as chapas' : 'Ocultar todas as chapas'}
        </button>
        <p className="text-[11px] text-slate-400 leading-snug">O atalho oculta a porta, laterais, topo e base, mantendo o fundo e a chapa de montagem. Aparelhos, cabos e ligações permanecem no sítio; abrir a porta é uma ação separada.</p>
      </div>
    </details>

    {/* Imagem da tampa */}
    <details className="dc-inspector-group">
      <summary>Imagem da tampa</summary>
      <div className="dc-inspector-group-body">
          <div className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase">Tampa do quadro — imagem</div>
      <label className="flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-200 bg-slate-50/60 px-3 py-3 cursor-pointer hover:bg-slate-50 hover:border-slate-300 transition">
        <span className="text-xs font-medium text-slate-700 inline-flex items-center gap-1.5"><IconCamera size={14} /> Carregar imagem (PNG/JPG)</span>
        <input type="file" accept="image/*" className="hidden" onChange={(e)=> handleImageUpload(e.target.files)} />
      </label>
      {imageDecals.length===0 ? <p className="text-[11px] text-slate-400">A imagem fica na porta (face <code>door</code>), move-se com o quadro. Use X/Y e tamanho nos controlos abaixo.</p>
      : <div className="space-y-1.5">
        {imageDecals.map((de)=> <div key={de.id} className="flex items-center gap-2 rounded border border-slate-200 p-1.5 bg-slate-50">
          {de.imageUrl && <img src={de.imageUrl} alt={de.text ?? 'tampa'} className="w-10 h-10 rounded object-cover border border-slate-200" />}
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium truncate">{de.text ?? 'Imagem tampa'}</div>
            <div className="text-[10px] text-slate-500">{de.widthMm}×{de.heightMm} mm • {de.offsetXmm??0},{de.offsetYmm??0} mm</div>
          </div>
          <div className="flex items-center gap-1">
            <input type="number" className="dc-input w-14 h-7 text-xs" title="Largura mm" value={de.widthMm??30} onChange={(e)=> useSimStore.getState().updateDecal(c.id, de.id, {widthMm: Number(e.target.value)})} />
            <input type="number" className="dc-input w-14 h-7 text-xs" title="Altura mm" value={de.heightMm??30} onChange={(e)=> useSimStore.getState().updateDecal(c.id, de.id, {heightMm: Number(e.target.value)})} />
            <input type="number" className="dc-input w-12 h-7 text-xs" title="X mm" placeholder="X" value={de.offsetXmm??0} onChange={(e)=> useSimStore.getState().updateDecal(c.id, de.id, {offsetXmm: Number(e.target.value)})} />
            <input type="number" className="dc-input w-12 h-7 text-xs" title="Y mm" placeholder="Y" value={de.offsetYmm??0} onChange={(e)=> useSimStore.getState().updateDecal(c.id, de.id, {offsetYmm: Number(e.target.value)})} />
            <button type="button" className="dc-btn text-red-600 px-1.5 py-1" onClick={()=> useSimStore.getState().removeDecal(c.id, de.id)} aria-label="Remover imagem"><IconClose size={12} /></button>
          </div>
        </div>)}
      </div>}
      </div>
    </details>

    {/* Furos no quadro — escolher face e diâmetro */}
    <details className="dc-inspector-group">
      <summary>Furos no quadro <span className="dc-inspector-count">{holes.length}</span></summary>
      <div className="dc-inspector-group-body">
      <div className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase">Furos no quadro</div>
      <p className="text-[11px] text-slate-400">Escolha a face e o diâmetro, faça o furo e depois coloque bucim ou aparelho.</p>
      <div className="flex flex-wrap gap-1" role="group" aria-label="Face do furo">
        {(['door','top','bottom','left','right','back'] as const).map((fid) => {
          const FaceIcon = {door: IconImage, top: IconArrowUp, bottom: IconArrowDown, left: IconArrowLeft, right: IconArrowRight, back: IconLayers}[fid] ?? IconImage
          const labels: Record<string,string> = {door:'Porta', top:'Topo', bottom:'Fundo', left:'Esq.', right:'Dir.', back:'Traseira'}
          return <button key={fid} type="button" aria-pressed={holeFace===fid} className={`min-h-[34px] rounded-full border px-2.5 py-1 text-xs inline-flex items-center gap-1.5 ${holeFace===fid?'bg-slate-800 text-white border-slate-800':'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`} onClick={()=> setHoleFace(fid as any)}><FaceIcon size={12} /> <span>{labels[fid]}</span></button>
        })}
      </div>
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Diâmetro do furo">
        <span className="text-xs text-slate-600">Ø</span>
        <div className="flex flex-wrap gap-1">
          {[{label:'M16',mm:16},{label:'M20',mm:20},{label:'M25',mm:25},{label:'M32',mm:32},{label:'M40',mm:40},{label:'22mm',mm:22},{label:'30mm',mm:30}].map((p)=> <button key={p.label} type="button" aria-pressed={holeDia===p.mm} className={`min-h-[34px] rounded-full border px-2 py-1 text-xs ${holeDia===p.mm?'bg-slate-800 text-white border-slate-800':'bg-white border-slate-200 text-slate-600'}`} onClick={()=> setHoleDia(p.mm)}>{p.label} <span className="opacity-60">{p.mm}mm</span></button>)}
        </div>
        <input type="number" className="dc-input w-16 h-9 text-xs" min={6} max={80} value={holeDia} aria-label="Diâmetro do furo (mm)" onChange={(e)=> setHoleDia(Number(e.target.value)||20)} title="Diâmetro mm" />
        <span className="text-xs text-slate-400">mm</span>
      </div>
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-1 text-xs">X <input type="number" className="dc-input w-14 h-9 text-xs" value={holeOx} onChange={(e)=> setHoleOx(Number(e.target.value)||0)} /></label>
        <label className="flex items-center gap-1 text-xs">Y <input type="number" className="dc-input w-14 h-9 text-xs" value={holeOy} onChange={(e)=> setHoleOy(Number(e.target.value)||0)} /></label>
        <span className="text-[11px] text-slate-400">mm do centro</span>
        <button type="button" onClick={()=> useSimStore.getState().addPanelHole(c.id, { face: holeFace, diameterMm: holeDia, offsetXmm: holeOx, offsetYmm: holeOy })} className="ml-auto min-h-[38px] dc-btn dc-btn-primary rounded-full px-3 py-1 text-xs inline-flex items-center gap-1.5"><IconPlus size={12} /> Fazer furo</button>
      </div>
      {holes.length===0 ? <p className="text-[11px] text-slate-400 border border-dashed border-slate-200 rounded p-2 text-center">Nenhum furo. Os furos aparecem no Esquema e no 3D; depois pode pôr bucim ou aparelho.</p>
      : <div className="space-y-1.5 max-h-44 overflow-auto pr-1">
        {holes.map((h)=> {
          const occupiedBy = typeof h.occupiedBy === 'string' ? h.occupiedBy : ''
          const hasGland = !!h.glandType && h.glandType !== 'none'
          return <div key={h.id} className="flex items-center gap-1.5 rounded border border-slate-200 bg-slate-50 p-1.5">
          <div className="w-7 h-7 rounded-full bg-white border border-slate-200 flex items-center justify-center text-[10px] font-bold">{h.diameterMm}Ø</div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium">{h.face} • Ø{h.diameterMm}mm <span className="text-[10px] text-slate-500">({h.offsetXmm},{h.offsetYmm})</span></div>
            <div className="text-[10px] text-slate-500">{hasGland ? `Bucim ${h.glandType}` : occupiedBy ? `Aparelho ${occupiedBy.slice(0,6)}` : 'vazio — escolha bucim ou aparelho'}</div>
          </div>
          <Select className="dc-input h-9 text-xs w-24" aria-label={`Bucim do furo ${h.id}`} value={(h as any).glandType ?? ''} onChange={(e)=> useSimStore.getState().updatePanelHole(c.id, h.id, { glandType: e.target.value as any })}>
            <option value="">— bucim —</option><option value="M16">M16</option><option value="M20">M20</option><option value="M25">M25</option><option value="M32">M32</option><option value="M40">M40</option><option value="none">sem bucim</option>
          </Select>
          <Select className="dc-input h-9 text-xs w-28" aria-label={`Adicionar aparelho ao furo ${h.id}`} disabled={!!occupiedBy} title={occupiedBy ? 'Este furo já tem um aparelho montado.' : undefined} defaultValue="" resetOnSelect onChange={(e)=> { const v=e.target.value; if(!v || occupiedBy) return; useSimStore.getState().addMountedDevice(v as any, c.id, h.face as any, h.offsetXmm, h.offsetYmm, h.diameterMm, h.id) }}>
            <option value="">{occupiedBy ? 'Aparelho montado' : '＋ aparelho'}</option><option value="buttonNO">Botão NA</option><option value="buttonNC">Botão NF</option><option value="selector2">Chave 2 pos</option><option value="pilotLightAd22">Luz piloto</option><option value="emergencyButton">Emergência</option>
          </Select>
          <button type="button" className="dc-btn min-h-[34px] min-w-[34px] justify-center text-red-600 px-1 py-1" onClick={()=> useSimStore.getState().removePanelHole(c.id, h.id)} aria-label="Remover furo"><IconClose size={12} /></button>
          </div>
        })}
      </div>}
      </div>
    </details>

    <details className="dc-inspector-group">
      <summary>Aparelhos internos <span className="dc-inspector-count">{attached.length}</span></summary>
      <div className="dc-inspector-group-body">
        <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-2">
          <div className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase">Aparelhos dentro</div>
          <div className="flex flex-wrap gap-1">
            <button type="button" className="dc-btn" disabled={!selectionToAssign.length} onClick={() => useSimStore.getState().assignToEnclosure(selectionToAssign, c.id)}>Marcar seleção como dentro ({selectionToAssign.length})</button>
            <button type="button" className="dc-btn" disabled={!attached.length} onClick={() => useSimStore.getState().detachFromEnclosure(attached.map((item) => item.id))}>Soltar todos</button>
          </div>
          <small className="text-ink-400">{attached.length ? `${attached.length} dentro: ${attached.map((item) => item.ref).join(', ')}.` : 'Nenhum aparelho dentro. Selecione e marque.'} Clique na porta no 3D para abrir/fechar.</small>
        </div>
      </div>
    </details>
  </div>
}

export function CableDuctControls({ c }: { c: ElectricalComponent }) {
  const [newLength, setNewLength] = useState<number | null>(null)
  const [joinFeedback, setJoinFeedback] = useState('')
  const [createdDuctId, setCreatedDuctId] = useState<string | null>(null)
  const runState = useSimStore(s => s.sim.runState)
  const demo = useSimStore(s => s.demoMode)
  const d = cableDuctDimsOf(c.state)
  const coverOn = c.state.coverOn !== false
  const vertical = Math.round(((c.rotation ?? 0) % 180) / 90) % 2 === 1
  const color = c.bodyColor && c.bodyColor !== '#e2e8f0' ? c.bodyColor : CABLE_DUCT_DEFAULT_COLOR
  const setLength = (v: number) => resizeDuct(c, v, d.widthMm, {})
  const setHeight = (v: number) => { useSimStore.getState().setComponentState(c.id, { heightMm: v }); useSimStore.getState().pushEvent('info', `Calha ${c.ref} altura ${v} mm — veja no 3D a parede subir.`) }
  const join = (slot: DuctSlot) => {
    const st = useSimStore.getState()
    const id = st.addDuctAdjacent(c.id, slot, newLength ?? d.lengthMm)
    const added = id && useSimStore.getState().components.find(item => item.id === id)
    if (added) {
      // Mantém a origem no inspetor para acrescentar outros ramais e ler o resultado.
      useSimStore.getState().selectComponents([c.id])
      setCreatedDuctId(added.id)
    } else setCreatedDuctId(null)
    setJoinFeedback(added ? `${added.ref} criada com ${added.state.lengthMm} mm.${added.state.lengthMm < (newLength ?? d.lengthMm) ? ' Ajustada ao espaço disponível.' : ''}`
      : 'Sem espaço para uma calha de pelo menos 50 mm neste lado. Reduza o comprimento ou afaste os aparelhos.')
  }
  return <div className="dc-acc space-y-3">
    {/* Cabeçalho compacto com estado */}
    <div className="rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2.5 flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <div className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase">Calha técnica PVC</div>
        <div className="text-[13px] font-bold text-slate-800 leading-none mt-0.5">{d.widthMm} × {d.heightMm} mm · {d.lengthMm} mm <span className={`ml-1.5 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${coverOn ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' : 'bg-amber-100 text-amber-700 border border-amber-200'}`}>{coverOn ? '● com tampa' : '○ sem tampa'}</span></div>
        <div className="text-[11px] text-slate-500 mt-1">Ranhurada • na chapa • sólida — cabos por dentro</div>
      </div>
      <button type="button" className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold border shadow-sm transition ${coverOn ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50' : 'bg-slate-800 border-slate-800 text-white hover:bg-slate-700'}`} onClick={() => useSimStore.getState().setComponentState(c.id, { coverOn: !coverOn })} title={coverOn ? 'Mostra ranhuras e fundo' : 'Mostra tampa lisa'}>{coverOn ? 'Tirar tampa' : 'Pôr tampa'}</button>
    </div>

    {/* 1 · Medidas — uma card */}
    <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-3">
      <div className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase">Medidas</div>
      <div className="dc-acc-measure">
        <div className="dc-acc-measure-head"><span>Comprimento</span><span className="dc-acc-unit"><DraftNumber label="Comprimento" value={d.lengthMm} min={CABLE_DUCT.minLengthMm} max={CABLE_DUCT.maxLengthMm} onCommit={setLength} /> mm</span></div>
        <input type="range" min={CABLE_DUCT.minLengthMm} max={CABLE_DUCT.maxLengthMm} step={5} value={d.lengthMm} aria-label="Comprimento" onChange={(e) => resizeDuct(c, Number(e.target.value), d.widthMm, {})} />
      </div>
      <div className="flex flex-wrap gap-1.5" aria-label="Comprimentos comuns">
        {[250, 400, 600, 820, 1000, 2000].map((mm) => <button key={mm} type="button" className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${d.lengthMm === mm ? 'bg-slate-800 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`} onClick={() => resizeDuct(c, mm, d.widthMm, {})}>{mm===820 ? '820 (quadro)' : mm >= 1000 ? `${mm / 1000} m` : `${mm} mm`}</button>)}
      </div>
      <div className="text-[11px] text-slate-500 leading-snug">Cada barra mexe só na sua ponta; a outra fica no sítio. Também pode arrastar as pegas azuis nas pontas, no Esquema.</div>
      <DuctSideBar c={c} side="left" lengthMm={d.lengthMm} />
      <DuctSideBar c={c} side="right" lengthMm={d.lengthMm} />
      <div className="dc-acc-measure">
        <div className="dc-acc-measure-head"><span>Largura <small>(pegada)</small></span>
          <Select className="dc-input dc-acc-select" aria-label="Largura (mm)" value={d.widthMm} onChange={(e) => resizeDuct(c, d.lengthMm, Number(e.target.value), {})}>
            {[...new Set([...CABLE_DUCT.widthsMm, d.widthMm])].sort((x, y) => x - y).map((mm) => <option key={mm} value={mm}>{mm} mm</option>)}
          </Select>
        </div>
      </div>
      <div className="dc-acc-measure">
        <div className="dc-acc-measure-head"><span>Altura <small>(parede Z)</small></span>
          <span className="dc-acc-unit">
            <Select className="dc-input dc-acc-select" aria-label="Altura (mm)" value={d.heightMm} onChange={(e) => setHeight(Number(e.target.value))}>
              {[...new Set([...CABLE_DUCT.heightsMm, d.heightMm])].sort((x, y) => x - y).map((mm) => <option key={mm} value={mm}>{mm} mm</option>)}
            </Select>
          </span>
        </div>
        <input type="range" min={15} max={150} step={5} value={d.heightMm} aria-label="Altura" onChange={(e) => useSimStore.getState().setComponentState(c.id, { heightMm: Number(e.target.value) })} />
      </div>
    </div>

    {/* Criar a partir desta calha: prolonga ou ramifica já encaixada, com as mesmas medidas e cor */}
    <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-2" data-duct-extend>
      <div className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase">Juntar outra calha</div>
      <label className="flex items-center justify-between gap-2 text-xs text-slate-600">Comprimento pedido
        <span className="inline-flex items-center gap-1"><DraftNumber label="Comprimento da nova calha" value={newLength ?? d.lengthMm} min={CABLE_DUCT.minLengthMm} max={CABLE_DUCT.maxLengthMm} onCommit={setNewLength} />mm</span>
      </label>
      <div className="grid grid-cols-2 gap-1.5">
        {(['left', 'right', 'top', 'bottom'] as const).map(slot => {
          const angle = (c.rotation ?? 0) * Math.PI / 180
          const end = slot === 'left' || slot === 'right'
          const sign = slot === 'left' || slot === 'top' ? -1 : 1
          const dx = sign * (end ? Math.cos(angle) : -Math.sin(angle)), dy = sign * (end ? Math.sin(angle) : Math.cos(angle))
          const horizontal = Math.abs(dx) > Math.abs(dy)
          const Icon = horizontal ? (dx < 0 ? IconArrowLeft : IconArrowRight) : (dy < 0 ? IconArrowUp : IconArrowDown)
          const direction = horizontal ? (dx < 0 ? 'à esquerda' : 'à direita') : (dy < 0 ? 'para cima' : 'para baixo')
          const text = `${end ? 'Prolongar' : 'Ramal'} ${direction}`
          return <button key={slot} type="button" disabled={!!c.locked || demo || runState === 'running' || runState === 'paused'}
            title={c.locked ? 'Desbloqueie a calha para juntar outra.' : runState === 'running' || runState === 'paused' ? 'Pare a simulação para alterar a montagem.' : demo ? 'Abra um projeto editável para juntar calhas.' : 'Cria uma calha encostada e ajusta o comprimento ao espaço disponível.'}
            className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 inline-flex items-center justify-center gap-1.5" onClick={() => join(slot)}><Icon size={12} /> {text}</button>
        })}
      </div>
      {joinFeedback && <p role="status" className="text-[11px] text-slate-600 leading-snug">{joinFeedback}</p>}
      {createdDuctId && <button type="button" className="dc-btn w-full justify-center" onClick={() => useSimStore.getState().selectComponents([createdDuctId])}>Editar a nova calha</button>}
      <p className="text-[11px] text-slate-400 leading-snug">A nova calha fica encostada, com a mesma largura, altura e cor. Nas junções a parede abre-se para os cabos. Também encaixa sozinha se a largar perto de uma calha.</p>
    </div>

    {/* 2 · Posicionamento */}
    <div className="rounded-lg border border-slate-200 bg-white p-3 flex items-center justify-between">
      <span className="text-xs text-slate-600">Orientação</span>
      <div className="dc-acc-seg" role="group" aria-label="Orientação da calha">
        <button type="button" aria-pressed={!vertical} className={!vertical ? 'is-on' : ''} onClick={() => useSimStore.getState().updateComponent(c.id, { rotation: 0 })}>— Horizontal</button>
        <button type="button" aria-pressed={vertical} className={vertical ? 'is-on' : ''} onClick={() => useSimStore.getState().updateComponent(c.id, { rotation: 90 })}><IconArrowUp size={11} className="inline mr-0.5" /><IconArrowDown size={11} className="inline mr-1" />Vertical</button>
      </div>
    </div>

    {/* 3 · Aparência */}
    <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-2">
      <div className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase">Aparência</div>
      <div className="flex items-center justify-between"><span className="text-xs text-slate-600">Cor</span><Swatches options={DUCT_COLORS} value={color} onPick={(value) => useSimStore.getState().updateComponent(c.id, { bodyColor: value })} /></div>
      <p className="text-[11px] text-slate-400 leading-snug">PVC cinzento-pedra padrão. A calha é sólida no 3D (cabos contornam por fora); no esquema os cabos passam por dentro da calha.</p>
    </div>
  </div>
}

/** Perfil, acabamento e furação da calha DIN (o comprimento continua no bloco da calha). */
export function DinRailProfileControls({ c }: { c: ElectricalComponent }) {
  const profileId = dinRailProfileIdOf(c.state)
  const profile = dinRailProfileOf(c.state)
  const finish = typeof c.state.finish === 'string' && DIN_RAIL_FINISH_IDS.includes(c.state.finish) ? c.state.finish : DIN_RAIL_FINISH_IDS[0]
  const setProfile = (id: string) => {
    const next = DIN_RAIL_PROFILES[id]
    const h = Math.round(next.width * SCHEMATIC_PX_PER_MM)
    useSimStore.getState().updateComponentRaw(c.id, { h, schematicY: Math.round(c.schematicY + (c.h - h) / 2), state: { ...c.state, profile: id } })
  }
  return <div className="dc-acc">
    <div className="dc-acc-row">
      <span>Perfil EN 60715</span>
      <div className="dc-acc-seg" role="group" aria-label="Perfil da calha DIN">
        {DIN_RAIL_PROFILE_IDS.map((id) => (
          <button key={id} type="button" aria-pressed={profileId === id} className={profileId === id ? 'is-on' : ''}
            title={id === '15×5,5 mm' ? 'G-rail miniatura' : id === '35×7,5 mm' ? 'TS35 padrão modular' : 'TS35 alta — aparelhos pesados'}
            onClick={() => setProfile(id)}>{id.replace(' mm', '')}</button>
        ))}
      </div>
    </div>
    <label className="dc-acc-row"><span>Acabamento</span>
      <Select className="dc-input" aria-label="Acabamento da calha DIN" value={finish} onChange={(e) => useSimStore.getState().setComponentState(c.id, { finish: e.target.value })}>
        {DIN_RAIL_FINISH_IDS.map((id) => <option key={id} value={id}>{id}</option>)}
      </Select>
    </label>
    <label className="dc-acc-row"><span>Perfurada</span>
      <input type="checkbox" checked={c.state.perforated !== false} onChange={(e) => useSimStore.getState().setComponentState(c.id, { perforated: e.target.checked })} />
    </label>
    <small className="text-ink-400">
      Face de encaixe {profile.width} mm · altura {String(profile.height).replace('.', ',')} mm ·
      {c.state.perforated === false ? ' sem furos' : ` furos oblongos (passo ${profile.slotPitch} mm)`}.
      Aceita disjuntores, contactores, bornes e relés com encaixe DIN.
    </small>
  </div>
}

export function SpiralWrapControls({ c }: { c: ElectricalComponent }) {
  const d = spiralWrapDimsOf(c.state)
  const set = (patch: Record<string, unknown>) => {
    const next = { ...c.state, ...patch }
    const dims = spiralWrapDimsOf(next)
    const w = Math.max(4, Math.round(dims.lengthMm * SCHEMATIC_PX_PER_MM))
    const h = Math.max(8, Math.round((dims.innerDiaMm + 4) * SCHEMATIC_PX_PER_MM))
    useSimStore.getState().updateComponent(c.id, {
      w, h,
      schematicX: Math.round(c.schematicX + (c.w - w) / 2),
      schematicY: Math.round(c.schematicY + (c.h - h) / 2),
      state: next,
      bodyColor: typeof next.color === 'string' ? next.color : c.bodyColor,
    })
  }
  return <div className="dc-acc">
    <div className="dc-acc-head"><b>Espiral Ø{d.innerDiaMm} · {d.lengthMm} mm</b></div>
    <MmField label="Comprimento" value={d.lengthMm} min={50} max={2000} step={10} onChange={(mm) => set({ lengthMm: mm })} />
    <MmField label="Diâmetro interior" value={d.innerDiaMm} min={4} max={40} step={1} onChange={(mm) => set({ innerDiaMm: mm })} />
    <MmField label="Passo" value={d.pitchMm} min={4} max={30} step={1} onChange={(mm) => set({ pitchMm: mm })} />
    <div className="dc-acc-row"><span>Cor</span>
      <Swatches options={[
        { name: 'Preto', value: '#0a0a0a' },
        { name: 'Cinzento', value: '#4b5563' },
        { name: 'Branco', value: '#e5e7eb' },
        { name: 'Azul', value: '#1d4ed8' },
      ]} value={typeof c.state.color === 'string' ? c.state.color : '#0a0a0a'} onPick={(value) => set({ color: value })} />
    </div>
    <small className="text-ink-400">Proteção em espiral para cabos em dobras (portas, botões, luzes). Envolve o cabo sem o cortar.</small>
  </div>
}
