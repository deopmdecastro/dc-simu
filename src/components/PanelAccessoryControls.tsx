import { useState } from 'react'
import { fitDuctResize } from '../schematic/ductResize'
import { useSimStore } from '../store/useSimStore'
import type { ElectricalComponent } from '../types'
import { SCHEMATIC_PX_PER_MM } from '../three/modelPaths'
import { CABLE_DUCT, cableDuctDimsOf, ENCLOSURE, enclosureDimsOf, enclosureHingeOf, spiralWrapDimsOf } from '../three/enclosureParts'
import { DIN_RAIL_FINISH_IDS, DIN_RAIL_PROFILE_IDS, DIN_RAIL_PROFILES, dinRailProfileIdOf, dinRailProfileOf } from '../three/dinRailGeometry'
import { CABLE_DUCT_DEFAULT_COLOR, ENCLOSURE_DEFAULT_COLOR, ENCLOSURE_PLATE_FINISH_IDS } from '../three/PanelAccessories3D'

/** Estado do inspetor que estes controlos já mostram (não se repete na lista genérica). */
export const PANEL_ACCESSORY_STATE_KEYS = new Set(['widthMm', 'heightMm', 'depthMm', 'doorOpen', 'hingeSide', 'plateFinish', 'lengthMm', 'coverOn', 'innerDiaMm', 'pitchMm', 'color'])
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

export function EnclosureControls({ c }: { c: ElectricalComponent }) {
  const d = enclosureDimsOf(c.state)
  const hinge = enclosureHingeOf(c.state)
  const open = c.state.doorOpen !== false
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
  const fitToContent = () => {
    const inside = components.filter((it) => it.enclosureId === c.id || Math.abs(it.schematicX - c.schematicX) < c.w && Math.abs(it.schematicY - c.schematicY) < c.h)
    if (!inside.length) { useSimStore.getState().pushEvent('info', 'Nenhum aparelho dentro para ajustar.'); return }
    const pad = 60
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    for (const it of inside) { minX = Math.min(minX, it.schematicX); maxX = Math.max(maxX, it.schematicX + it.w); minY = Math.min(minY, it.schematicY); maxY = Math.max(maxY, it.schematicY + it.h) }
    const needW = Math.ceil((maxX - minX + pad * 2) / SCHEMATIC_PX_PER_MM)
    const needH = Math.ceil((maxY - minY + pad * 2) / SCHEMATIC_PX_PER_MM)
    const w = Math.max(ENCLOSURE.minWidthMm, Math.min(ENCLOSURE.maxWidthMm, needW))
    const h = Math.max(ENCLOSURE.minHeightMm, Math.min(ENCLOSURE.maxHeightMm, needH))
    resize(c, w, h, { widthMm: w, heightMm: h })
    useSimStore.getState().pushEvent('info', `Quadro ajustado para ${w}×${h} mm.`)
  }
  const holes: import('../types').EnclosureHole[] = (c.state as any).holes ?? []
  const [holeFace, setHoleFace] = useState<import('../types').EnclosureHoleFace>('bottom')
  const [holeDia, setHoleDia] = useState<number>(20)
  const [holeOx, setHoleOx] = useState<number>(0)
  const [holeOy, setHoleOy] = useState<number>(0)
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
      <div className="flex items-center justify-between"><span className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase">Medidas</span><button type="button" className="text-[11px] font-medium text-blue-600 hover:underline" onClick={fitToContent}>↔ Ajustar ao conteúdo</button></div>
      <div className="grid grid-cols-3 gap-2">
        <label className="space-y-1"><span className="text-xs text-slate-600">Largura</span><div className="flex items-center gap-1"><input type="number" className="dc-input h-8 w-full text-center text-sm" value={d.widthMm} min={ENCLOSURE.minWidthMm} max={ENCLOSURE.maxWidthMm} step={10} onChange={(e)=> resize(c, Math.max(ENCLOSURE.minWidthMm, Math.min(ENCLOSURE.maxWidthMm, Number(e.target.value)||0)), d.heightMm, {widthMm: Number(e.target.value)})} /><span className="text-xs text-slate-400">mm</span></div></label>
        <label className="space-y-1"><span className="text-xs text-slate-600">Altura</span><div className="flex items-center gap-1"><input type="number" className="dc-input h-8 w-full text-center text-sm" value={d.heightMm} min={ENCLOSURE.minHeightMm} max={ENCLOSURE.maxHeightMm} step={10} onChange={(e)=> resize(c, d.widthMm, Math.max(ENCLOSURE.minHeightMm, Math.min(ENCLOSURE.maxHeightMm, Number(e.target.value)||0)), {heightMm: Number(e.target.value)})} /><span className="text-xs text-slate-400">mm</span></div></label>
        <label className="space-y-1"><span className="text-xs text-slate-600">Prof.</span><div className="flex items-center gap-1"><input type="number" className="dc-input h-8 w-full text-center text-sm" value={d.depthMm} min={ENCLOSURE.minDepthMm} max={ENCLOSURE.maxDepthMm} step={10} onChange={(e)=> set({depthMm: Math.max(ENCLOSURE.minDepthMm, Math.min(ENCLOSURE.maxDepthMm, Number(e.target.value)||0))})} /><span className="text-xs text-slate-400">mm</span></div></label>
      </div>
      <input type="range" className="w-full accent-slate-700" min={ENCLOSURE.minWidthMm} max={ENCLOSURE.maxWidthMm} step={10} value={d.widthMm} onChange={(e)=> resize(c, Number(e.target.value), d.heightMm, {widthMm: Number(e.target.value)})} />
      <div className="grid grid-cols-3 gap-1.5">
        {ENCLOSURE_PRESETS.map(([w,h,dp])=> <button key={`${w}x${h}`} type="button" className={`rounded-lg border p-2 text-center transition ${d.widthMm===w&&d.heightMm===h ? 'bg-slate-800 border-slate-800 text-white' : 'bg-white border-slate-200 hover:bg-slate-50'}`} onClick={()=> resize(c,w,h,{widthMm:w,heightMm:h,depthMm:dp})}><div className="text-xs font-bold">{w}×{h}</div><div className="text-[10px] opacity-60">{dp} prof.</div></button>)}
      </div>
      <div className="flex items-center gap-2 text-xs">
        <span className="text-slate-600">Dobradiças</span>
        <div className="dc-acc-seg ml-auto" role="group"><button type="button" aria-pressed={hinge==='left'} className={hinge==='left'?'is-on':''} onClick={()=> set({hingeSide:'left'})}>Esq.</button><button type="button" aria-pressed={hinge==='right'} className={hinge==='right'?'is-on':''} onClick={()=> set({hingeSide:'right'})}>Dir.</button></div>
        <span className="text-slate-600 ml-2">Chapa</span>
        <select className="dc-input h-7 text-xs" value={typeof c.state.plateFinish==='string'?c.state.plateFinish:'Aço galvanizado'} onChange={(e)=> set({plateFinish:e.target.value})}>{ENCLOSURE_PLATE_FINISH_IDS.map(id=> <option key={id} value={id}>{id}</option>)}</select>
      </div>
      <div className="flex items-center gap-2"><span className="text-xs text-slate-600">Pintura</span><Swatches options={ENCLOSURE_COLORS} value={color} onPick={(v)=> useSimStore.getState().updateComponent(c.id,{bodyColor:v})} /></div>
    </div>

    {/* Imagem da tampa */}
    <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-2">
      <div className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase">Tampa do quadro — imagem</div>
      <label className="flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-200 bg-slate-50/60 px-3 py-3 cursor-pointer hover:bg-slate-50 hover:border-slate-300 transition">
        <span className="text-xs font-medium text-slate-700">📷 Carregar imagem (PNG/JPG)</span>
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
            <button type="button" className="dc-btn text-red-600 px-1.5 py-1" onClick={()=> useSimStore.getState().removeDecal(c.id, de.id)}>✕</button>
          </div>
        </div>)}
      </div>}
    </div>

    {/* Furos no quadro — escolher face e diâmetro */}
    <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-3">
      <div className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase">Furos no quadro</div>
      <p className="text-[11px] text-slate-400">Escolha a face e o diâmetro, faça o furo e depois coloque bucim ou aparelho.</p>
      <div className="flex flex-wrap gap-1">
        {(['door','top','bottom','left','right','back'] as const).map((fid) => {
          const icons: Record<string,string> = {door:'🚪', top:'⬆️', bottom:'⬇️', left:'⬅️', right:'➡️', back:'⊡'}
          const labels: Record<string,string> = {door:'Porta', top:'Topo', bottom:'Fundo', left:'Esq.', right:'Dir.', back:'Traseira'}
          return <button key={fid} type="button" className={`rounded-full border px-2.5 py-1 text-xs ${holeFace===fid?'bg-slate-800 text-white border-slate-800':'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`} onClick={()=> setHoleFace(fid as any)}><span>{icons[fid]}</span> <span className="ml-1">{labels[fid]}</span></button>
        })}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-slate-600">Ø</span>
        <div className="flex flex-wrap gap-1">
          {[{label:'M16',mm:16},{label:'M20',mm:20},{label:'M25',mm:25},{label:'M32',mm:32},{label:'M40',mm:40},{label:'22mm',mm:22},{label:'30mm',mm:30}].map((p)=> <button key={p.label} type="button" className={`rounded-full border px-2 py-1 text-xs ${holeDia===p.mm?'bg-slate-800 text-white border-slate-800':'bg-white border-slate-200 text-slate-600'}`} onClick={()=> setHoleDia(p.mm)}>{p.label} <span className="opacity-60">{p.mm}mm</span></button>)}
        </div>
        <input type="number" className="dc-input w-16 h-7 text-xs" min={6} max={80} value={holeDia} onChange={(e)=> setHoleDia(Number(e.target.value)||20)} title="Diâmetro mm" />
        <span className="text-xs text-slate-400">mm</span>
      </div>
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-1 text-xs">X <input type="number" className="dc-input w-14 h-7 text-xs" value={holeOx} onChange={(e)=> setHoleOx(Number(e.target.value)||0)} /></label>
        <label className="flex items-center gap-1 text-xs">Y <input type="number" className="dc-input w-14 h-7 text-xs" value={holeOy} onChange={(e)=> setHoleOy(Number(e.target.value)||0)} /></label>
        <span className="text-[11px] text-slate-400">mm do centro</span>
        <button type="button" className="ml-auto dc-btn dc-btn-primary rounded-full px-3 py-1 text-xs" onClick={()=> useSimStore.getState().addPanelHole(c.id, { face: holeFace, diameterMm: holeDia, offsetXmm: holeOx, offsetYmm: holeOy })}>＋ Fazer furo</button>
      </div>
      {holes.length===0 ? <p className="text-[11px] text-slate-400 border border-dashed border-slate-200 rounded p-2 text-center">Nenhum furo. Os furos ficam sólidos — cabos e aparelhos passam por aqui.</p>
      : <div className="space-y-1.5 max-h-44 overflow-auto pr-1">
        {holes.map((h)=> <div key={h.id} className="flex items-center gap-1.5 rounded border border-slate-200 bg-slate-50 p-1.5">
          <div className="w-7 h-7 rounded-full bg-white border border-slate-200 flex items-center justify-center text-[10px] font-bold">{h.diameterMm}Ø</div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium">{h.face} • Ø{h.diameterMm}mm <span className="text-[10px] text-slate-500">({h.offsetXmm},{h.offsetYmm})</span></div>
            <div className="text-[10px] text-slate-500">{h.glandType ? `Bucim ${h.glandType}` : (h as any).occupiedBy ? `Aparelho ${(h as any).occupiedBy.slice(0,6)}` : 'vazio — escolha bucim ou aparelho'}</div>
          </div>
          <select className="dc-input h-7 text-xs w-24" value={(h as any).glandType ?? ''} onChange={(e)=> useSimStore.getState().updatePanelHole(c.id, h.id, { glandType: e.target.value as any })}>
            <option value="">— bucim —</option><option value="M16">M16</option><option value="M20">M20</option><option value="M25">M25</option><option value="M32">M32</option><option value="M40">M40</option><option value="none">sem bucim</option>
          </select>
          <select className="dc-input h-7 text-xs w-28" defaultValue="" onChange={(e)=> { const v=e.target.value; if(!v) return; const nid = useSimStore.getState().addMountedDevice(v as any, c.id, h.face as any, h.offsetXmm, h.offsetYmm, h.diameterMm); if(nid) useSimStore.getState().updatePanelHole(c.id, h.id, { occupiedBy: nid }); e.target.value='' }}>
            <option value="">＋ aparelho</option><option value="buttonNO">Botão NA</option><option value="buttonNC">Botão NF</option><option value="selector2">Chave 2 pos</option><option value="pilotLightAd22">Luz piloto</option><option value="emergencyButton">Emergência</option>
          </select>
          <button type="button" className="dc-btn text-red-600 px-1 py-1" onClick={()=> useSimStore.getState().removePanelHole(c.id, h.id)}>✕</button>
        </div>)}
      </div>}
    </div>

    <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-2">
      <div className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase">Aparelhos dentro</div>
      <div className="flex flex-wrap gap-1">
        <button type="button" className="dc-btn" disabled={!selectionToAssign.length} onClick={() => useSimStore.getState().assignToEnclosure(selectionToAssign, c.id)}>Marcar seleção como dentro ({selectionToAssign.length})</button>
        <button type="button" className="dc-btn" disabled={!attached.length} onClick={() => useSimStore.getState().detachFromEnclosure(attached.map((item) => item.id))}>Soltar todos</button>
      </div>
      <small className="text-ink-400">{attached.length ? `${attached.length} dentro: ${attached.map((item) => item.ref).join(', ')}.` : 'Nenhum aparelho dentro. Selecione e marque.'} Clique na porta no 3D para abrir/fechar.</small>
    </div>
  </div>
}

export function CableDuctControls({ c }: { c: ElectricalComponent }) {
  const d = cableDuctDimsOf(c.state)
  const coverOn = c.state.coverOn !== false
  const vertical = Math.round(((c.rotation ?? 0) % 180) / 90) % 2 === 1
  const color = c.bodyColor && c.bodyColor !== '#e2e8f0' ? c.bodyColor : CABLE_DUCT_DEFAULT_COLOR
  const setLength = (v: number) => resizeDuct(c, v, d.widthMm, {})
  const setHeight = (v: number) => { useSimStore.getState().setComponentState(c.id, { heightMm: v }); useSimStore.getState().pushEvent('info', `Calha ${c.ref} altura ${v} mm — veja no 3D a parede subir.`) }
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
      <div className="dc-acc-measure">
        <div className="dc-acc-measure-head"><span>Largura <small>(pegada)</small></span>
          <select className="dc-input dc-acc-select" aria-label="Largura (mm)" value={d.widthMm} onChange={(e) => resizeDuct(c, d.lengthMm, Number(e.target.value), {})}>
            {[...new Set([...CABLE_DUCT.widthsMm, d.widthMm])].sort((x, y) => x - y).map((mm) => <option key={mm} value={mm}>{mm} mm</option>)}
          </select>
        </div>
      </div>
      <div className="dc-acc-measure">
        <div className="dc-acc-measure-head"><span>Altura <small>(parede Z)</small></span>
          <span className="dc-acc-unit">
            <select className="dc-input dc-acc-select" aria-label="Altura (mm)" value={d.heightMm} onChange={(e) => setHeight(Number(e.target.value))}>
              {[...new Set([...CABLE_DUCT.heightsMm, d.heightMm])].sort((x, y) => x - y).map((mm) => <option key={mm} value={mm}>{mm} mm</option>)}
            </select>
          </span>
        </div>
        <input type="range" min={15} max={150} step={5} value={d.heightMm} aria-label="Altura" onChange={(e) => useSimStore.getState().setComponentState(c.id, { heightMm: Number(e.target.value) })} />
      </div>
    </div>

    {/* 2 · Posicionamento */}
    <div className="rounded-lg border border-slate-200 bg-white p-3 flex items-center justify-between">
      <span className="text-xs text-slate-600">Orientação</span>
      <div className="dc-acc-seg" role="group" aria-label="Orientação da calha">
        <button type="button" aria-pressed={!vertical} className={!vertical ? 'is-on' : ''} onClick={() => useSimStore.getState().updateComponent(c.id, { rotation: 0 })}>— Horizontal</button>
        <button type="button" aria-pressed={vertical} className={vertical ? 'is-on' : ''} onClick={() => useSimStore.getState().updateComponent(c.id, { rotation: 90 })}>↕ Vertical</button>
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
      <select className="dc-input" value={finish} onChange={(e) => useSimStore.getState().setComponentState(c.id, { finish: e.target.value })}>
        {DIN_RAIL_FINISH_IDS.map((id) => <option key={id} value={id}>{id}</option>)}
      </select>
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
