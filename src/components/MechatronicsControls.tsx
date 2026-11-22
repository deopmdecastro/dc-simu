import type { ReactNode } from 'react'
import type { ElectricalComponent } from '../types'
import { useSimStore } from '../store/useSimStore'
import { stampingBenchLayout } from '../electrical/stampingBench'
import { PANEL_UNITS_PER_MM } from '../three/modelPaths'
import {
  MAGAZINE_CAPACITY,
  MECHATRONICS_INFO,
  RAMP_PILLAR_OPTIONS,
  WORKPIECE_MATERIALS,
  aluProfileDimsOf,
  benchDuctDimsOf,
  dragChainDimsOf,
  isMechatronicsType,
  slotPlateDimsOf,
  supportBlockDimsOf,
  workpieceMaterialOf,
} from '../three/mechatronicsModel'

const textLabel = (value: unknown, fallback = '') => (typeof value === 'string' && value.trim() ? value.trim() : fallback)

function Row({ label, value, children }: { label: string; value?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="flex items-center justify-between text-[var(--dc-text-muted)]">
        <span>{label}</span>
        {value !== undefined && <strong className="font-mono text-[var(--dc-text)]">{value}</strong>}
      </span>
      {children}
    </label>
  )
}

const MaterialSelect = ({ value, onChange, disabled, allowEmpty }: { value: string; onChange: (v: string) => void; disabled: boolean; allowEmpty?: boolean }) => (
  <select className="dc-input text-[11px]" disabled={disabled} value={value} onChange={(e) => onChange(e.target.value)}>
    {allowEmpty && <option value="">— sem peça —</option>}
    {WORKPIECE_MATERIALS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
  </select>
)

/** Insere os componentes da maquete nas posições da bancada, relativas ao centro da base. */
function assembleBench(plate: ElectricalComponent) {
  const st = useSimStore.getState()
  st.commitHistory()
  const base = plate.panel3DPosition ?? { x: ((plate.schematicX ?? 420) - 420) * 0.02, y: -((plate.schematicY ?? 260) - 260) * 0.02, z: 1.6 }
  if (!plate.panel3DPosition) st.updateComponent(plate.id, { panel3DPosition: base })
  const U = PANEL_UNITS_PER_MM
  stampingBenchLayout(plate.state).forEach((p, i) => {
    const id = useSimStore.getState().addComponent(p.type, (plate.schematicX ?? 0) + 40 + (i % 5) * 140, (plate.schematicY ?? 0) + 180 + Math.floor(i / 5) * 160)
    if (!id) return
    const s2 = useSimStore.getState()
    s2.updateComponent(id, { panel3DPosition: { x: base.x + p.x * U, y: base.y + p.y * U, z: base.z + p.z * U } })
    if (p.state) s2.setComponentState(id, p.state)
  })
}

/** Inspetor da maquete de estampagem: parâmetros construtivos + comandos manuais didáticos. */
export function MechatronicsControls({ c, locked }: { c: ElectricalComponent; locked: boolean }) {
  const setState = useSimStore((s) => s.setComponentState)
  const operate = useSimStore((s) => s.operateComponent)
  const running = useSimStore((s) => s.sim.runState === 'running')
  const components = useSimStore((s) => s.components)
  const motors = components.filter((item) => item.type === 'mecDcGearmotor')
  if (!isMechatronicsType(c.type)) return null
  const info = MECHATRONICS_INFO[c.type]
  const act = (patch: Record<string, unknown>) => (running ? operate(c.id, patch) : setState(c.id, patch))
  const num = (v: unknown, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d)

  let body: ReactNode = null
  switch (c.type) {
    case 'mecSlotPlate': {
      const d = slotPlateDimsOf(c.state)
      body = (
        <>
          <Row label="Comprimento" value={`${d.lengthMm} mm`}><input type="range" min={300} max={1400} step={25} disabled={locked} value={d.lengthMm} onChange={(e) => setState(c.id, { lengthMm: Number(e.target.value) })} /></Row>
          <Row label="Largura" value={`${d.widthMm} mm · ${Math.floor(d.widthMm / d.slotPitchMm)} ranhuras`}><input type="range" min={150} max={900} step={25} disabled={locked} value={d.widthMm} onChange={(e) => setState(c.id, { widthMm: Number(e.target.value) })} /></Row>
          <button type="button" className="dc-btn dc-btn-primary text-[11px] justify-center" disabled={locked || running} onClick={() => assembleBench(c)} data-mec-assemble>
            Montar maquete completa sobre esta base
          </button>
          <p className="text-[10px] leading-snug text-[var(--dc-text-muted)]">Coloca blocos de elevação, magazine, Cilindro 1, FC1, manipulador, motor M1, prensa com gaveta, 3 rampas, ejetor, porta-cabos e perfil do PLC. A cablagem e a tubagem ficam por fazer.</p>
        </>
      )
      break
    }
    case 'mecAluProfile': {
      const d = aluProfileDimsOf(c.state)
      body = (
        <>
          <Row label="Secção">
            <select className="dc-input text-[11px]" disabled={locked} value={d.sectionMm} onChange={(e) => setState(c.id, { sectionMm: Number(e.target.value) })}>
              <option value={30}>30 × 30 mm (ranhura 8)</option>
              <option value={40}>40 × 40 mm (ranhura 8)</option>
            </select>
          </Row>
          <Row label="Comprimento" value={`${d.lengthMm} mm`}><input type="range" min={40} max={1200} step={10} disabled={locked} value={d.lengthMm} onChange={(e) => setState(c.id, { lengthMm: Number(e.target.value) })} /></Row>
          <Row label="Orientação">
            <select className="dc-input text-[11px]" disabled={locked} value={d.vertical ? 'vertical' : 'horizontal'} onChange={(e) => setState(c.id, { orientation: e.target.value })}>
              <option value="vertical">Vertical (coluna)</option>
              <option value="horizontal">Horizontal (travessa)</option>
            </select>
          </Row>
          <label className="flex items-center justify-between gap-2"><span>Tampas de topo</span><input type="checkbox" disabled={locked} checked={d.endCaps} onChange={(e) => setState(c.id, { endCaps: e.target.checked })} /></label>
          <label className="flex items-center justify-between gap-2"><span>Cantoneiras na base</span><input type="checkbox" disabled={locked} checked={d.brackets} onChange={(e) => setState(c.id, { brackets: e.target.checked })} /></label>
        </>
      )
      break
    }
    case 'mecGravityMagazine': {
      const count = Math.round(num(c.state.pieceCount, MAGAZINE_CAPACITY))
      body = (
        <>
          <Row label="Tarugos no magazine" value={`${count} / ${MAGAZINE_CAPACITY}`}><input type="range" min={0} max={MAGAZINE_CAPACITY} step={1} disabled={locked} value={count} onChange={(e) => act({ pieceCount: Number(e.target.value) })} /></Row>
          <button type="button" className="dc-btn text-[11px] justify-center" disabled={locked} onClick={() => act({ pieceCount: MAGAZINE_CAPACITY, pieceOffset: 0 })}>Reabastecer (duplo clique no 3D)</button>
          {c.state.pickupMaterial && <button type="button" className="dc-btn text-[11px] justify-center" disabled={locked} onClick={() => act({ pickupMaterial: '' })}>Retirar peça da zona de recolha</button>}
        </>
      )
      break
    }
    case 'mecWorkpiece':
      body = <Row label="Material"><MaterialSelect disabled={locked} value={workpieceMaterialOf(c.state.material)} onChange={(v) => setState(c.id, { material: v })} /></Row>
      break
    case 'mecDischargeRamp': {
      const pieces = Array.isArray(c.state.pieces) ? c.state.pieces.length : 0
      body = (
        <>
          <Row label="Pilar traseiro">
            <select className="dc-input text-[11px]" disabled={locked} value={num(c.state.pillarMm, 110)} onChange={(e) => setState(c.id, { pillarMm: Number(e.target.value) })}>
              {RAMP_PILLAR_OPTIONS.map((h, i) => <option key={h} value={h}>{`${h} mm (rampa ${i + 1})`}</option>)}
            </select>
          </Row>
          <div className="flex items-center justify-between"><span>Peças na rampa</span><strong>{pieces}</strong></div>
          <button type="button" className="dc-btn text-[11px] justify-center" disabled={locked || pieces === 0} onClick={() => act({ pieces: [] })}>Esvaziar rampa</button>
        </>
      )
      break
    }
    case 'mecStampingTable':
      body = (
        <>
          <Row label="Peça na gaveta"><MaterialSelect allowEmpty disabled={locked} value={typeof c.state.pieceMaterial === 'string' ? c.state.pieceMaterial : ''} onChange={(v) => act({ pieceMaterial: v, stamped: false })} /></Row>
          <div className="flex items-center justify-between"><span>Estado</span><strong>{c.state.pieceMaterial ? (c.state.stamped ? 'Estampada' : 'Por estampar') : 'Vazia'}</strong></div>
        </>
      )
      break
    case 'mecStampingPress':
    case 'mecFeederCylinder': {
      const pct = Math.round(num(c.state.positionPct))
      const press = c.type === 'mecStampingPress'
      body = (
        <>
          <Row label={press ? 'Curso da prensa (comando manual)' : 'Curso do empurrador (comando manual)'} value={`${pct} %`}>
            <input type="range" min={0} max={100} step={1} disabled={locked || running} value={pct} onChange={(e) => setState(c.id, { positionPct: Number(e.target.value), extended: Number(e.target.value) >= 92 })} />
          </Row>
          <div className="flex items-center justify-between"><span>{press ? 'FC_PRENSA_SUP / INF' : 'FC_CIL1_REC / AVA'}</span><strong>{`${pct <= 8 ? 'ON' : 'off'} / ${pct >= 92 ? 'ON' : 'off'}`}</strong></div>
          {press && <div className="flex items-center justify-between"><span>Manómetro</span><strong>{`${num(c.state.pressureBar).toFixed(1)} bar`}</strong></div>}
          <p className="text-[10px] text-[var(--dc-text-muted)]">Em simulação o curso segue o ar nas portas A (avanço) e B (recuo).</p>
        </>
      )
      break
    }
    case 'mecRotaryArm': {
      const angle = num(c.state.angleDeg)
      const down = Math.round(num(c.state.armDownPct))
      body = (
        <>
          <Row label="Ângulo do braço" value={`${angle.toFixed(0)}°`}><input type="range" min={0} max={359} step={1} disabled={locked || running} value={angle} onChange={(e) => setState(c.id, { angleDeg: Number(e.target.value), homeActive: Number(e.target.value) <= 4 || Number(e.target.value) >= 356 })} /></Row>
          <Row label="Curso do cilindro vertical da ventosa" value={`${down} %`}><input type="range" min={0} max={100} step={5} disabled={locked || running} value={down} onChange={(e) => setState(c.id, { armDownPct: Number(e.target.value) })} /></Row>
          <button type="button" className={`dc-btn text-[11px] justify-center ${c.state.manualVacuum ? 'dc-btn-primary' : ''}`} disabled={locked} aria-pressed={!!c.state.manualVacuum} onClick={() => act({ manualVacuum: !c.state.manualVacuum })}>{c.state.manualVacuum ? 'Desligar vácuo manual' : 'Ligar vácuo manual'}</button>
          <Row label="Motor de acionamento (M1)">
            <select className="dc-input text-[11px]" disabled={locked} value={typeof c.state.driveMotorId === 'string' ? c.state.driveMotorId : ''} onChange={(e) => setState(c.id, { driveMotorId: e.target.value })}>
              <option value="">{motors.length ? 'Primeiro motorredutor do projeto' : 'Sem motorredutor no projeto'}</option>
              {motors.map((m) => <option key={m.id} value={m.id}>{m.ref}</option>)}
            </select>
          </Row>
          <div className="flex items-center justify-between"><span>S_HOME_BRACO</span><strong>{c.state.homeActive ? 'ON (0°)' : 'off'}</strong></div>
          <div className="flex items-center justify-between"><span>Peça na ventosa</span><strong>{c.state.holding ? `${c.state.holding}${c.state.holdingStamped ? ' · estampada' : ''}` : '—'}</strong></div>
        </>
      )
      break
    }
    case 'mecDcGearmotor':
      body = (
        <>
          <div className="flex items-center justify-between"><span>Estado</span><strong>{c.state.running ? (c.state.direction === 'ccw' ? 'Anti-horário (CCW)' : 'Horário (CW)') : 'Parado'}</strong></div>
          <div className="flex items-center justify-between"><span>Contagem do encoder</span><strong className="font-mono">{num(c.state.encoderCount)}</strong></div>
          <div className="flex items-center justify-between"><span>Fases A / B</span><strong className="font-mono">{`${c.state.encA ? 1 : 0} / ${c.state.encB ? 1 : 0}`}</strong></div>
          <p className="text-[10px] text-[var(--dc-text-muted)]">CW/CCW com 0V comandam o sentido (K1/K2). O encoder usa o +24V do motor e tem 24 impulsos/volta na simulação.</p>
        </>
      )
      break
    case 'mecMicroSwitchRoller':
      body = (
        <>
          <Row label="Acionamento">
            <select className="dc-input text-[11px]" disabled={locked} value={c.state.actuation === 'manual' ? 'manual' : 'feeder'} onChange={(e) => setState(c.id, { actuation: e.target.value })}>
              <option value="feeder">Pela peça na zona de recolha</option>
              <option value="manual">Manual (clique no 3D)</option>
            </select>
          </Row>
          <button type="button" className={`dc-btn text-[11px] justify-center ${c.state.pressed ? 'dc-btn-primary' : ''}`} disabled={locked || c.state.actuation !== 'manual'} aria-pressed={!!c.state.pressed} onClick={() => act({ pressed: !c.state.pressed })}>{c.state.pressed ? 'Soltar rolete' : 'Pressionar rolete'}</button>
          <div className="flex items-center justify-between"><span>Contacto</span><strong>{c.state.pressed ? 'C–NA fechado' : 'C–NF fechado'}</strong></div>
        </>
      )
      break
    case 'mecVacuumEjector':
      body = <div className="flex items-center justify-between"><span>Vácuo em V</span><strong>{c.state.vacuumActive ? 'Ativo' : 'Sem ar em P'}</strong></div>
      break
    case 'mecSupportBlock': {
      const d = supportBlockDimsOf(c.state)
      body = (
        <>
          <Row label="Comprimento (X)" value={`${d.lengthMm} mm`}><input type="range" min={20} max={600} step={5} disabled={locked} value={d.lengthMm} onChange={(e) => setState(c.id, { lengthMm: Number(e.target.value) })} /></Row>
          <Row label="Altura (Y)" value={`${d.heightMm} mm`}><input type="range" min={10} max={300} step={1} disabled={locked} value={d.heightMm} onChange={(e) => setState(c.id, { heightMm: Number(e.target.value) })} /></Row>
          <Row label="Profundidade (Z)" value={`${d.depthMm} mm`}><input type="range" min={20} max={400} step={5} disabled={locked} value={d.depthMm} onChange={(e) => setState(c.id, { depthMm: Number(e.target.value) })} /></Row>
        </>
      )
      break
    }
    case 'mecDragChain': {
      const d = dragChainDimsOf(c.state)
      body = <Row label="Comprimento do troço" value={`${d.lengthMm} mm`}><input type="range" min={120} max={900} step={20} disabled={locked} value={d.lengthMm} onChange={(e) => setState(c.id, { lengthMm: Number(e.target.value) })} /></Row>
      break
    }
    case 'mecDrawerCylinder': {
      const pct = Math.round(num(c.state.positionPct))
      body = (
        <>
          <Row label="Curso da gaveta (comando manual)" value={`${pct} %`}>
            <input type="range" min={0} max={100} step={1} disabled={locked || running} value={pct} onChange={(e) => setState(c.id, { positionPct: Number(e.target.value), extended: Number(e.target.value) >= 92 })} />
          </Row>
          <div className="flex items-center justify-between"><span>{`B2 (${textLabel(c.state.sensorRecLabel, 'recuado')}) / B1 (${textLabel(c.state.sensorAvaLabel, 'avançado')})`}</span><strong>{`${pct <= 8 ? 'ON' : 'off'} / ${pct >= 92 ? 'ON' : 'off'}`}</strong></div>
          <p className="text-[10px] text-[var(--dc-text-muted)]">Em simulação o curso segue o ar nas portas A (avanço) e B (recuo); os reeds fecham +24 V no fim de curso.</p>
        </>
      )
      break
    }
    case 'mecValveIsland': {
      const stations = [1, 2]
      body = (
        <>
          <Row label="Etiqueta da ilha">
            <select className="dc-input text-[11px]" disabled={locked} value={textLabel(c.state.islandTag, 'C1A')} onChange={(e) => setState(c.id, { islandTag: e.target.value })}>
              <option value="C1A">C1A</option>
              <option value="C2A">C2A</option>
            </select>
          </Row>
          {stations.map((n) => {
            const on = !!c.state[`station${n}On`]
            const manual = !!c.state[`station${n}Manual`]
            return (
              <div key={n} className="flex items-center justify-between gap-2">
                <span>{`Y${n} · ${on ? 'bobina comandada' : 'em repouso'}`}</span>
                <button
                  type="button"
                  className={`dc-btn text-[10px] ${manual ? 'dc-btn-primary' : ''}`}
                  disabled={locked}
                  aria-pressed={manual}
                  onClick={() => act({ [`station${n}Manual`]: !manual })}
                >{`Ação manual ${n}`}</button>
              </div>
            )
          })}
          <p className="text-[10px] text-[var(--dc-text-muted)]">Com Y1/Y2 alimentado (24 V em relação a 0V) a saída passa de Bn para An; sem bobina ativa o ar fica em Bn.</p>
        </>
      )
      break
    }
    case 'mecOpticalSensor':
    case 'mecInductiveSensor': {
      const optical = c.type === 'mecOpticalSensor'
      const manual = c.state.actuation === 'manual'
      body = (
        <>
          <Row label="Acionamento">
            <select className="dc-input text-[11px]" disabled={locked} value={manual ? 'manual' : 'feeder'} onChange={(e) => setState(c.id, { actuation: e.target.value })}>
              <option value="feeder">Pela peça na zona de recolha</option>
              <option value="manual">Manual (inspetor)</option>
            </select>
          </Row>
          <button
            type="button"
            className={`dc-btn text-[11px] justify-center ${c.state.triggered ? 'dc-btn-primary' : ''}`}
            disabled={locked || !manual}
            aria-pressed={!!c.state.triggered}
            onClick={() => act({ triggered: !c.state.triggered })}
          >{c.state.triggered ? 'Soltar deteção' : 'Simular peça à frente'}</button>
          <div className="flex items-center justify-between"><span>Saída OUT</span><strong>{c.state.triggered ? '+24 V (PNP)' : '0 V'}</strong></div>
          <p className="text-[10px] text-[var(--dc-text-muted)]">{optical ? 'A fotocélula difusa deteta tarugos claros e metálicos; as peças pretas absorvem o feixe.' : 'O indutivo só comuta com tarugos metálicos (alumínio); os polímeros não excitam o oscilador.'}</p>
        </>
      )
      break
    }
    case 'mecHmiKtp700': {
      const powered = c.state.powered !== false && c.state.on !== false
      const page = textLabel(c.state.screenPage, 'start-center')
      body = (
        <>
          <div className="flex items-center justify-between gap-2">
            <span>{powered ? 'Consola alimentada (24 V DC)' : 'Consola sem alimentação'}</span>
            <button type="button" className={`dc-btn text-[10px] ${c.state.manualPower !== false ? 'dc-btn-primary' : ''}`} disabled={locked} aria-pressed={c.state.manualPower !== false} onClick={() => setState(c.id, { manualPower: c.state.manualPower === false })}>
              {c.state.manualPower === false ? 'Ligar 24 V' : 'Cortar 24 V'}
            </button>
          </div>
          <Row label="Ecrã">
            <select className="dc-input text-[11px]" disabled={locked || !powered} value={page} onChange={(e) => setState(c.id, { screenPage: e.target.value })}>
              <option value="start-center">Start Center</option>
              <option value="process">Processo (estampagem)</option>
            </select>
          </Row>
          <Row label="Item selecionado" value={`${Math.round(num(c.state.selectedRow, 1)) + 1} / 3`}>
            <input type="range" min={0} max={2} step={1} disabled={locked || !powered || page !== 'start-center'} value={Math.round(num(c.state.selectedRow, 1))} onChange={(e) => setState(c.id, { selectedRow: Number(e.target.value) })} />
          </Row>
          <p className="text-[10px] text-[var(--dc-text-muted)]">L+ / M alimentam a consola; o ecrã fica apagado sem 24 V (fidelidade LCD). O cabo PROFINET liga ao PLC do projeto.</p>
        </>
      )
      break
    }
    case 'mecOperatorBox': {
      const ops = [
        { key: 'emergLatched', label: 'EMERG (cogumelo)' },
        { key: 'autoMode', label: 'MAN / AUTO' },
        { key: 'resetPressed', label: 'REARME' },
        { key: 'dirRight', label: 'CICLO' },
        { key: 'stopPressed', label: 'STOP' },
        { key: 'startPressed', label: 'START' },
      ]
      body = (
        <>
          {ops.map((op) => {
            const active = op.key === 'autoMode' ? c.state.autoMode !== false : !!c.state[op.key]
            return (
              <div key={op.key} className="flex items-center justify-between gap-2">
                <span>{op.label}</span>
                <button
                  type="button"
                  className={`dc-btn text-[10px] ${active ? 'dc-btn-primary' : ''}`}
                  disabled={locked}
                  aria-pressed={active}
                  onClick={() => act({ [op.key]: op.key === 'autoMode' ? c.state.autoMode === false : !c.state[op.key] })}
                >{active ? 'ON' : 'off'}</button>
              </div>
            )
          })}
          <p className="text-[10px] text-[var(--dc-text-muted)]">Os operadores também respondem ao clique no 3D: EMERG e STOP são contactos NF; REARME, CICLO e START são NA.</p>
        </>
      )
      break
    }
    case 'mecSignalTower': {
      const leds = [
        { flag: 'manualGreen', state: 'green', label: 'Verde (Q5.5)' },
        { flag: 'manualYellow', state: 'yellow', label: 'Amarelo (Q5.4)' },
        { flag: 'manualRed', state: 'red', label: 'Vermelho (Q5.6)' },
      ]
      body = (
        <>
          {leds.map((led) => {
            const on = !!c.state[led.state]
            return (
              <div key={led.flag} className="flex items-center justify-between gap-2">
                <span>{led.label}</span>
                <button type="button" className={`dc-btn text-[10px] ${on ? 'dc-btn-primary' : ''}`} disabled={locked} aria-pressed={on} onClick={() => act({ [led.flag]: !on })}>{on ? 'ON' : 'off'}</button>
              </div>
            )
          })}
          <p className="text-[10px] text-[var(--dc-text-muted)]">Com G/Y/R ligados a 0 V o nível segue a cablagem (Q5.4/Q5.5/Q5.6); sem fios, os níveis seguem o comando manual.</p>
        </>
      )
      break
    }
    case 'mecBenchDuct': {
      const d = benchDuctDimsOf(c.state)
      body = (
        <>
          <Row label="Comprimento" value={`${d.lengthMm} mm`}><input type="range" min={120} max={1200} step={10} disabled={locked} value={d.lengthMm} onChange={(e) => setState(c.id, { lengthMm: Number(e.target.value) })} /></Row>
          <Row label="Largura × altura" value={`${d.widthMm} × ${d.heightMm} mm`}>
            <input type="range" min={20} max={60} step={1} disabled={locked} value={d.widthMm} onChange={(e) => setState(c.id, { widthMm: Number(e.target.value) })} />
          </Row>
          <Row label="Altura da calha" value={`${d.heightMm} mm`}><input type="range" min={25} max={80} step={1} disabled={locked} value={d.heightMm} onChange={(e) => setState(c.id, { heightMm: Number(e.target.value) })} /></Row>
          <Row label="Orientação">
            <select className="dc-input text-[11px]" disabled={locked} value={d.alongZ ? 'z' : 'x'} onChange={(e) => setState(c.id, { axis: e.target.value })}>
              <option value="x">Ao longo de X (frente/trás)</option>
              <option value="z">Ao longo Z (laterais)</option>
            </select>
          </Row>
          <label className="flex items-center justify-between gap-2"><span>Tampa da calha</span><input type="checkbox" disabled={locked} checked={d.coverOn} onChange={(e) => setState(c.id, { coverOn: e.target.checked })} /></label>
          <label className="flex items-center justify-between gap-2"><span>Folha do projeto ATEC</span><input type="checkbox" disabled={locked} checked={c.state.plaque === 'atec'} onChange={(e) => setState(c.id, { plaque: e.target.checked ? 'atec' : '' })} /></label>
        </>
      )
      break
    }
  }

  return (
    <div className="flex flex-col gap-2 text-[11px]" data-mechatronics-controls={c.type}>
      <div className="flex flex-col gap-0.5">
        <span className="dc-field-label">{info.name}</span>
        <span className="text-[10.5px] text-[var(--dc-text-muted)]">{info.model}</span>
      </div>
      {body}
      <p className="text-[10px] leading-snug text-[var(--dc-text-muted)]">{info.summary} Cotas estimadas a partir do relatório técnico da maquete.</p>
    </div>
  )
}
