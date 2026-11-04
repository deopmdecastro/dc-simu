import { useSimStore } from '../store/useSimStore'
import type { ElectricalComponent } from '../types'
import { SCHEMATIC_PX_PER_MM } from '../three/modelPaths'
import { CABLE_DUCT, cableDuctDimsOf, ENCLOSURE, enclosureDimsOf, enclosureHingeOf } from '../three/enclosureParts'
import { DIN_RAIL_FINISH_IDS, DIN_RAIL_PROFILE_IDS, DIN_RAIL_PROFILES, dinRailProfileOf } from '../three/dinRailGeometry'
import { CABLE_DUCT_DEFAULT_COLOR, ENCLOSURE_DEFAULT_COLOR, ENCLOSURE_PLATE_FINISH_IDS } from '../three/PanelAccessories3D'

/** Estado do inspetor que estes controlos já mostram (não se repete na lista genérica). */
export const PANEL_ACCESSORY_STATE_KEYS = new Set(['widthMm', 'heightMm', 'depthMm', 'doorOpen', 'hingeSide', 'plateFinish', 'lengthMm', 'coverOn'])
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
  useSimStore.getState().updateComponent(c.id, {
    w, h,
    schematicX: Math.round(c.schematicX + (c.w - w) / 2),
    schematicY: Math.round(c.schematicY + (c.h - h) / 2),
    state: { ...c.state, ...state },
  })
}

function MmField({ label, value, min, max, step = 10, onChange }: { label: string; value: number; min: number; max: number; step?: number; onChange: (mm: number) => void }) {
  const commit = (raw: number) => { if (Number.isFinite(raw)) onChange(Math.max(min, Math.min(max, Math.round(raw)))) }
  return <div className="dc-acc-field">
    <span>{label}</span>
    <input type="number" className="dc-input" min={min} max={max} step={step} value={value} onChange={(e) => commit(Number(e.target.value))} aria-label={`${label} (mm)`} />
    <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => commit(Number(e.target.value))} aria-label={label} />
  </div>
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
  return <div className="dc-acc">
    <div className="dc-acc-head">
      <b>Quadro {d.widthMm} × {d.heightMm} × {d.depthMm} mm</b>
      <button type="button" className="dc-btn dc-btn-primary" onClick={() => set({ doorOpen: !open })}>{open ? 'Fechar porta' : 'Abrir porta'}</button>
    </div>
    <MmField label="Largura" value={d.widthMm} min={ENCLOSURE.minWidthMm} max={ENCLOSURE.maxWidthMm} onChange={(mm) => resize(c, mm, d.heightMm, { widthMm: mm })} />
    <MmField label="Altura" value={d.heightMm} min={ENCLOSURE.minHeightMm} max={ENCLOSURE.maxHeightMm} onChange={(mm) => resize(c, d.widthMm, mm, { heightMm: mm })} />
    <MmField label="Profundidade" value={d.depthMm} min={ENCLOSURE.minDepthMm} max={ENCLOSURE.maxDepthMm} onChange={(mm) => set({ depthMm: mm })} />
    <div className="dc-acc-presets" aria-label="Medidas comerciais">
      {ENCLOSURE_PRESETS.map(([w, h, dp]) => <button key={`${w}x${h}`} type="button" className={`dc-btn${d.widthMm === w && d.heightMm === h && d.depthMm === dp ? ' dc-btn-primary' : ''}`}
        onClick={() => resize(c, w, h, { widthMm: w, heightMm: h, depthMm: dp })}>{w}×{h}×{dp}</button>)}
    </div>
    <div className="dc-acc-row">
      <span>Dobradiças</span>
      <div className="dc-acc-seg" role="group" aria-label="Lado das dobradiças">
        {(['left', 'right'] as const).map((side) => <button key={side} type="button" aria-pressed={hinge === side} className={hinge === side ? 'is-on' : ''} onClick={() => set({ hingeSide: side })}>{side === 'left' ? 'Esquerda' : 'Direita'}</button>)}
      </div>
    </div>
    <label className="dc-acc-row"><span>Chapa de montagem</span>
      <select className="dc-input" value={typeof c.state.plateFinish === 'string' ? c.state.plateFinish : 'Aço galvanizado'} onChange={(e) => set({ plateFinish: e.target.value })}>
        {ENCLOSURE_PLATE_FINISH_IDS.map((id) => <option key={id} value={id}>{id}</option>)}
      </select>
    </label>
    <div className="dc-acc-row"><span>Pintura</span><Swatches options={ENCLOSURE_COLORS} value={color} onPick={(value) => useSimStore.getState().updateComponent(c.id, { bodyColor: value })} /></div>
    <small className="text-ink-400">Clique na porta no 3D para a abrir ou fechar. Os aparelhos e as calhas ficam dentro do quadro, sobre a chapa de montagem.</small>
  </div>
}

export function CableDuctControls({ c }: { c: ElectricalComponent }) {
  const d = cableDuctDimsOf(c.state)
  const coverOn = c.state.coverOn !== false
  const vertical = Math.round(((c.rotation ?? 0) % 180) / 90) % 2 === 1
  const color = c.bodyColor && c.bodyColor !== '#e2e8f0' ? c.bodyColor : CABLE_DUCT_DEFAULT_COLOR
  return <div className="dc-acc">
    <div className="dc-acc-head">
      <b>Calha {d.widthMm} × {d.heightMm} mm · {d.lengthMm} mm</b>
      <button type="button" className="dc-btn dc-btn-primary" onClick={() => useSimStore.getState().setComponentState(c.id, { coverOn: !coverOn })}>{coverOn ? 'Tirar tampa' : 'Pôr tampa'}</button>
    </div>
    <MmField label="Comprimento" value={d.lengthMm} min={CABLE_DUCT.minLengthMm} max={CABLE_DUCT.maxLengthMm} step={5} onChange={(mm) => resize(c, mm, d.widthMm, { lengthMm: mm })} />
    <div className="dc-acc-presets" aria-label="Comprimentos comuns">
      {[300, 600, 1000, 2000].map((mm) => <button key={mm} type="button" className={`dc-btn${d.lengthMm === mm ? ' dc-btn-primary' : ''}`} onClick={() => resize(c, mm, d.widthMm, { lengthMm: mm })}>{mm >= 1000 ? `${mm / 1000} m` : `${mm} mm`}</button>)}
    </div>
    <label className="dc-acc-row"><span>Largura</span>
      <select className="dc-input" value={d.widthMm} onChange={(e) => resize(c, d.lengthMm, Number(e.target.value), { widthMm: Number(e.target.value) })}>
        {[...new Set([...CABLE_DUCT.widthsMm, d.widthMm])].sort((a, b) => a - b).map((mm) => <option key={mm} value={mm}>{mm} mm</option>)}
      </select>
    </label>
    <label className="dc-acc-row"><span>Altura</span>
      <select className="dc-input" value={d.heightMm} onChange={(e) => useSimStore.getState().setComponentState(c.id, { heightMm: Number(e.target.value) })}>
        {[...new Set([...CABLE_DUCT.heightsMm, d.heightMm])].sort((a, b) => a - b).map((mm) => <option key={mm} value={mm}>{mm} mm</option>)}
      </select>
    </label>
    <div className="dc-acc-row">
      <span>Orientação</span>
      <div className="dc-acc-seg" role="group" aria-label="Orientação da calha">
        <button type="button" aria-pressed={!vertical} className={!vertical ? 'is-on' : ''} onClick={() => useSimStore.getState().updateComponent(c.id, { rotation: 0 })}>Horizontal</button>
        <button type="button" aria-pressed={vertical} className={vertical ? 'is-on' : ''} onClick={() => useSimStore.getState().updateComponent(c.id, { rotation: 90 })}>Vertical</button>
      </div>
    </div>
    <div className="dc-acc-row"><span>Cor</span><Swatches options={DUCT_COLORS} value={color} onPick={(value) => useSimStore.getState().updateComponent(c.id, { bodyColor: value })} /></div>
  </div>
}

/** Perfil, acabamento e furação da calha DIN (o comprimento continua no bloco da calha). */
export function DinRailProfileControls({ c }: { c: ElectricalComponent }) {
  const profileId = DIN_RAIL_PROFILE_IDS.find((id) => DIN_RAIL_PROFILES[id] === dinRailProfileOf(c.state)) ?? DIN_RAIL_PROFILE_IDS[0]
  const finish = typeof c.state.finish === 'string' && DIN_RAIL_FINISH_IDS.includes(c.state.finish) ? c.state.finish : DIN_RAIL_FINISH_IDS[0]
  const setProfile = (id: string) => {
    const profile = DIN_RAIL_PROFILES[id]
    const h = Math.round(profile.width * SCHEMATIC_PX_PER_MM)
    useSimStore.getState().updateComponentRaw(c.id, { h, schematicY: Math.round(c.schematicY + (c.h - h) / 2), state: { ...c.state, profile: id } })
  }
  return <div className="dc-acc">
    <div className="dc-acc-row">
      <span>Perfil</span>
      <div className="dc-acc-seg" role="group" aria-label="Perfil da calha DIN">
        {DIN_RAIL_PROFILE_IDS.map((id) => <button key={id} type="button" aria-pressed={profileId === id} className={profileId === id ? 'is-on' : ''} onClick={() => setProfile(id)}>{id.replace(' mm', '')}</button>)}
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
  </div>
}
