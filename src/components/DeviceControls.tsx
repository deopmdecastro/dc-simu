import type { ElectricalComponent } from '../types'
import { useSimStore } from '../store/useSimStore'
import { useManobraAllowed } from '../store/useManobraAllowed'
import { MANOBRA_BLOCKED_TITLE } from '../store/manobra'
import { triggerControl, useCatalogMeter } from '../catalog/runtimeControls'
import type { DialMode } from '../catalog/behavior'
import { DM20_CONTROLS, DM20_DEFINITION } from '../three/MultimeterDm20Panel'
import { importedComponentInfo } from '../electrical/importedComponents'
import Select from '../ui/Select'
import IndustrialDeviceControls from './IndustrialDeviceControls'
import { industrialDeviceTypeOf, isIndustrialDevice } from '../electrical/industrialDevices'
import {
  cctLightPalette,
  isLightingLampType,
  isLightingSwitchType,
  isLightingType,
  LAMP_SPECS,
  lampPhotometrics,
  SWITCH_SPECS,
} from '../three/lightingModel'
import { isHydraulicComponentType, waterTankDimensionsOf } from '../three/hydraulicsModel'

/**
 * Chaves de `component.state` geridas diretamente por `DeviceControls`, apenas de chapa técnica
 * ou derivadas internamente pelo motor elétrico — ocultas na lista genérica de estado para evitar
 * controlos duplicados, valores em inglês ou campos que não têm efeito prático.
 */
export const DEVICE_MANAGED_STATE_KEYS = new Set([
  // Internos de catálogo / multímetro DM-20
  'catalogVars',
  'catalogState',
  'meterBridge',
  'selector',
  'hold',
  'backlight',
  'relative',
  // Fontes e alimentações
  'on',
  'on1',
  'on2',
  'powerW',
  'cctK',
  'socket',
  'brand',
  'nominalV',
  'frequencyHz',
  'outV',
  'amp',
  'watt',
  'powerReady',
  'powered',
  // Contactores e relés
  'energized',
  'interlockWith',
  'coil',
  'coilV',
  'ie',
  'poles',
  // Relés de segurança
  'resetRequested',
  'dualChannel',
  'reset',
  'safetyCategory',
  // Hidráulica / pneumática (geridos por HydraulicControls)
  'diameterMm',
  'heightMm',
  'levelPct',
  'outletValveOpen',
  'manualFill',
  'filling',
  'autoCoupleTank',
  'linkedTankId',
  'flowLpm',
  'flowLmin',
  'portSize',
  'headM',
  'cableLengthM',
  'cable',
  'level',
  'ratedA',
  // Aparelhos de comando
  'position',
  'maintain',
  'momentary',
  'pressed',
  'startPressed',
  'stopPressed',
  'latched',
  'resetMethod',
  'mountingMm',
  'ithA',
  // Sensores e sinalização
  'triggered',
  'type',
  'no',
  'rangeM',
  'red',
  'yellow',
  'green',
  'lampTest',
  'mountingDiameterMm',
  'currentMa',
  'serviceLifeHours',
  'protection',
  'operatingTemperature',
  'lamp',
  'voltage',
  // Motores e condensadores
  'running',
  'direction',
  'rpmVisual',
  'motorConnection',
  'powerKw',
  'cv',
  'rpm',
  'currentA',
  'cosPhi',
  'torqueNm',
  'massKg',
  'phases',
  'frame',
  'mounting',
  'capacitanceUf',
  'tolerancePct',
  'voltageVac',
  'temperatureClass',
  // Proteções / diagnósticos derivados
  'tripReason',
  'testPressed',
  'stopPressed',
  // PLCs e módulos de automação
  'inputs',
  'outputs',
  'memories',
  'pressedButton',
  'mode',
  'cpuMode',
  'ledSF',
  'ledBATF',
  'ledDC5V',
  'ledFRCE',
  'ledRUN',
  'ledSTOP',
  'ledERROR',
  'ledMAINT',
  'ledDIAG',
  'displayOn',
  'supply',
  'outputType',
  'programCapacity',
  'channels',
  'reference',
  'ethernetMbps',
  'service',
  // Metadados de chapa (não funcionais como input livre)
  'manufacturer',
  'code',
  'model',
  'norm',
  'ue',
])

const DM20_DIAL_OPTIONS: Array<{ id: DialMode; label: string; hint: string }> = [
  { id: 'off', label: 'OFF', hint: 'Desligado' },
  { id: 'acv', label: 'V ~', hint: 'Tensão alternada (AC)' },
  { id: 'dcv', label: 'V ⎓', hint: 'Tensão contínua (DC)' },
  { id: 'ohm', label: 'Ω / •)))', hint: 'Resistência e continuidade' },
  { id: 'ma', label: 'mA', hint: 'Corrente em série (mA)' },
  { id: 'a10', label: '10 A', hint: 'Corrente em série (10 A)' },
]

const MOTOR_3PH_PRESETS: Array<{ kw: number; cv: number; rpm: number; inA: number; torqueNm: number }> = [
  { kw: 0.37, cv: 0.5, rpm: 1380, inA: 1.03, torqueNm: 2.56 },
  { kw: 0.55, cv: 0.75, rpm: 1435, inA: 1.29, torqueNm: 3.65 },
  { kw: 1.5, cv: 2, rpm: 1440, inA: 3.3, torqueNm: 9.95 },
  { kw: 2.2, cv: 3, rpm: 1445, inA: 4.7, torqueNm: 14.5 },
]

const MOTOR_1PH_PRESETS: Array<{ kw: number; cv: number; rpm: number; inA: number; torqueNm: number }> = [
  { kw: 0.37, cv: 0.5, rpm: 1400, inA: 2.5, torqueNm: 2.5 },
  { kw: 0.75, cv: 1, rpm: 1420, inA: 4.8, torqueNm: 5.0 },
  { kw: 1.1, cv: 1.5, rpm: 1430, inA: 6.9, torqueNm: 7.3 },
  { kw: 1.5, cv: 2, rpm: 1435, inA: 9.2, torqueNm: 10.0 },
]

function isContactorLike(type: string): boolean {
  return (
    importedComponentInfo(type)?.behavior === 'contactor' ||
    type === 'contactor' ||
    type === 'contactorWegCWC09' ||
    type === 'contactor4p' ||
    type === 'auxRelay' ||
    type === 'auxRelay4'
  )
}

function isPlcModule(type: string): boolean {
  return type.startsWith('plc') || type === 'siemensTsAdapterIeBasic'
}

function StatusBadge({ label, tone }: { label: string; tone: 'ok' | 'warn' | 'danger' | 'neutral' }) {
  const cls =
    tone === 'ok'
      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
      : tone === 'warn'
        ? 'bg-amber-50 text-amber-700 border-amber-200'
        : tone === 'danger'
          ? 'bg-red-50 text-red-700 border-red-200'
          : 'bg-slate-100 text-slate-600 border-slate-200'
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10.5px] font-semibold border whitespace-nowrap ${cls}`}>
      {label}
    </span>
  )
}

/** Aviso no topo do painel quando a simulação está parada: a manobra física fica
 * bloqueada, mas os parâmetros nominais continuam editáveis (mesma regra dos
 * ProtectionControls — DC-ADR-071: em RUN atua-se; em STOP prepara-se). */
function ManobraStopHint() {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-[10px] leading-4 text-slate-600">
      Manobra bloqueada — inicie a simulação (▶) para atuar o aparelho. Os parâmetros nominais continuam editáveis.
    </div>
  )
}

function MultimeterControls({ c, locked }: { c: ElectricalComponent; locked: boolean }) {
  const { reading, vars } = useCatalogMeter(c, DM20_DEFINITION)
  const dial = String(vars.dial ?? c.state?.selector ?? 'off') as DialMode
  const isSleeping = !!vars.sleep
  const isHold = !!vars.hold
  const isLight = !!vars.light
  const isCont = !!vars.cont
  // O DM-20 tem pilha própria: o seletor, SELECT, HOLD e Luz atuam mesmo com a simulação em STOP.
  const dialActive = dial !== 'off' && !isSleeping
  const lcdOn = !!reading?.on || dialActive
  const idleUnit = dial === 'acv' || dial === 'dcv' ? 'V' : dial === 'ohm' ? (isCont ? 'Ω' : 'kΩ') : dial === 'ma' ? 'mA' : dial === 'a10' ? 'A' : ''
  const idleText = dial === 'ohm' ? 'OL' : '0.00'
  const showText = reading?.on ? `${reading.negative ? '-' : ''}${reading.text}` : idleText
  const showUnit = reading?.on ? reading.unit : idleUnit
  const showMode = reading?.on
    ? [reading.dc && 'DC', reading.ac && 'AC', reading.auto && 'AUTO'].filter(Boolean).join(' · ')
    : [dial === 'dcv' && 'DC', dial === 'acv' && 'AC', 'AUTO'].filter(Boolean).join(' · ')

  const setDial = (mode: DialMode) => {
    if (locked) return
    triggerControl(DM20_DEFINITION, c.id, DM20_CONTROLS.selector, { select: mode })
  }

  const pressKey = (key: 'power' | 'select' | 'hold' | 'light') => {
    if (locked) return
    triggerControl(DM20_DEFINITION, c.id, DM20_CONTROLS[key], 'press')
  }

  return (
    <div className="flex flex-col gap-2" data-device-controls="multimeter">
      <div className="flex items-center justify-between gap-1">
        <span className="dc-field-label">Multímetro digital DM-20</span>
        <StatusBadge
          label={!lcdOn ? 'OFF' : reading?.beep ? 'BIP •)))' : isHold ? 'HOLD' : 'ATIVO'}
          tone={!lcdOn ? 'neutral' : isHold ? 'warn' : 'ok'}
        />
      </div>

      {/* Visor LCD sincronizado em tempo real com o aparelho 3D */}
      <div
        className={`rounded-lg border px-2.5 py-2 font-mono transition ${
          !lcdOn
            ? 'bg-slate-800 border-slate-700 text-slate-400'
            : isLight
              ? 'bg-lime-200 border-lime-400 text-slate-900'
              : 'bg-[#bcc7b2] border-slate-400 text-slate-900'
        }`}
      >
        <div className="flex items-center justify-between text-[9.5px] font-bold opacity-80 min-h-[13px]">
          <span>{lcdOn ? showMode : 'DESLIGADO'}</span>
          <span>{lcdOn ? [(reading?.continuity || (dial === 'ohm' && isCont)) && '•)))', isHold && 'HOLD'].filter(Boolean).join(' ') : ''}</span>
        </div>
        <div className="flex items-baseline justify-between gap-1 mt-0.5">
          <span className="text-xl font-black tracking-wider leading-none">
            {lcdOn ? showText : '— — —'}
          </span>
          <span className="text-xs font-bold">{lcdOn ? showUnit : ''}</span>
        </div>
        {lcdOn && reading?.warning && (
          <div className="mt-1 text-[10px] font-sans font-medium text-amber-900 leading-snug">
            {reading.warning}
          </div>
        )}
      </div>

      {/* Seletor rotativo — roda o botão físico no 3D e atua em STOP e RUN */}
      <div className="flex flex-col gap-1">
        <span className="dc-field-label">Seletor de escala</span>
        <div className="grid grid-cols-3 gap-1">
          {DM20_DIAL_OPTIONS.map((opt) => {
            const active = dial === opt.id && !isSleeping
            return (
              <button
                key={opt.id}
                type="button"
                disabled={locked}
                aria-pressed={active}
                title={opt.hint}
                onClick={() => setDial(opt.id)}
                className={`dc-btn text-[11px] justify-center font-mono ${active ? 'dc-btn-primary' : ''}`}
              >
                {opt.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Teclas frontais do DM-20 */}
      <div className="grid grid-cols-4 gap-1">
        <button
          type="button"
          disabled={locked || dial === 'off'}
          aria-pressed={!isSleeping && dial !== 'off'}
          onClick={() => pressKey('power')}
          title="Suspende ou reativa o visor mantendo a posição do seletor"
          className="dc-btn text-[10.5px] justify-center"
        >
          {isSleeping ? 'ON' : 'OFF'}
        </button>
        <button
          type="button"
          disabled={locked || !dialActive || dial !== 'ohm'}
          aria-pressed={isCont && dial === 'ohm'}
          onClick={() => pressKey('select')}
          title="Na escala Ω, alterna entre resistência (Ω) e continuidade sonora (•))))"
          className={`dc-btn text-[10.5px] justify-center ${isCont && dial === 'ohm' ? 'dc-btn-primary' : ''}`}
        >
          SELECT
        </button>
        <button
          type="button"
          disabled={locked || !dialActive}
          aria-pressed={isHold}
          onClick={() => pressKey('hold')}
          title="Congela a leitura atual no visor (HOLD)"
          className={`dc-btn text-[10.5px] justify-center ${isHold ? 'dc-btn-primary' : ''}`}
        >
          HOLD
        </button>
        <button
          type="button"
          disabled={locked || !dialActive}
          aria-pressed={isLight}
          onClick={() => pressKey('light')}
          title="Liga ou desliga a retroiluminação do LCD"
          className={`dc-btn text-[10.5px] justify-center ${isLight ? 'dc-btn-primary' : ''}`}
        >
          Luz
        </button>
      </div>
    </div>
  )
}

function PowerControls({ c, locked }: { c: ElectricalComponent; locked: boolean }) {
  const setState = useSimStore((s) => s.setComponentState)
  const simActive = useManobraAllowed()
  /** Manobra (ligar/seccionar a fonte, cortar a saída) só com a simulação ativa; tensão/frequência/trimmer editam-se sempre. */
  const gateAct = locked || !simActive
  const actTitle = simActive ? undefined : MANOBRA_BLOCKED_TITLE

  if (c.type === 'powerSource3ph' || c.type === 'powerSource1ph' || c.type === 'powerSource24v') {
    const isOn = c.state.on !== false
    const isDc = c.type === 'powerSource24v'
    const is3ph = c.type === 'powerSource3ph'
    const defaultV = is3ph ? 400 : isDc ? 24 : 230
    const nominalV = Number(c.state.nominalV) > 0 ? Number(c.state.nominalV) : defaultV
    const freqHz = Number(c.state.frequencyHz) === 60 ? 60 : 50
    const presets = is3ph ? [220, 380, 400, 440] : isDc ? [12, 24, 48] : [115, 127, 230]
    const phaseNote = is3ph ? ` · V_FN ≈ ${Math.round(nominalV / Math.sqrt(3))} V` : ''

    return (
      <div className="flex flex-col gap-2" data-device-controls="power-source">
        {!simActive && <ManobraStopHint />}
        <div className="flex items-center justify-between gap-1">
          <span className="dc-field-label">Alimentação</span>
          <StatusBadge label={isOn ? `${nominalV} V ${isDc ? 'DC' : 'AC'}` : 'Desligada'} tone={isOn ? 'ok' : 'neutral'} />
        </div>
        <div className="grid grid-cols-2 gap-1">
          <button
            type="button"
            disabled={gateAct}
            title={actTitle}
            aria-pressed={isOn}
            onClick={() => setState(c.id, { on: true })}
            className={`dc-btn text-[11px] justify-center ${isOn ? 'dc-btn-primary' : ''}`}
          >
            Ligada (ON)
          </button>
          <button
            type="button"
            disabled={gateAct}
            title={actTitle}
            aria-pressed={!isOn}
            onClick={() => setState(c.id, { on: false })}
            className={`dc-btn text-[11px] justify-center ${!isOn ? 'dc-btn-primary' : ''}`}
          >
            Seccionada (OFF)
          </button>
        </div>
        <div className="flex flex-col gap-1">
          <span className="dc-field-label">{`Tensão nominal${phaseNote}`}</span>
          <div className={`grid gap-1 ${presets.length === 4 ? 'grid-cols-4' : 'grid-cols-3'}`}>
            {presets.map((v) => (
              <button
                key={v}
                type="button"
                disabled={locked}
                aria-pressed={nominalV === v}
                onClick={() => setState(c.id, { nominalV: v })}
                className={`dc-btn text-[11px] justify-center font-mono ${nominalV === v ? 'dc-btn-primary' : ''}`}
              >
                {`${v}V`}
              </button>
            ))}
          </div>
        </div>
        {!isDc && (
          <div className="flex flex-col gap-1">
            <span className="dc-field-label">Frequência da rede</span>
            <div className="grid grid-cols-2 gap-1">
              {[50, 60].map((hz) => (
                <button
                  key={hz}
                  type="button"
                  disabled={locked}
                  aria-pressed={freqHz === hz}
                  onClick={() => setState(c.id, { frequencyHz: hz })}
                  className={`dc-btn text-[11px] justify-center font-mono ${freqHz === hz ? 'dc-btn-primary' : ''}`}
                >
                  {`${hz} Hz`}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  // Fonte AC/DC Proauto PS-24A 5 A (120 W) e powerSupply genérica
  const enabled = c.state.on !== false
  const outV = Number(c.state.outV) > 0 ? Number(c.state.outV) : 24
  const powered = simActive && !!c.state.powered && enabled
  const rdy = simActive && !!c.state.powerReady && enabled

  return (
    <div className="flex flex-col gap-2" data-device-controls="power-supply">
      {!simActive && <ManobraStopHint />}
      <div className="flex items-center justify-between gap-1">
        <span className="dc-field-label">Fonte 24 V DC · 5 A (120 W)</span>
        <StatusBadge
          label={!enabled ? 'Saída OFF' : !simActive ? 'Em repouso' : powered ? `DC OK · ${outV.toFixed(1).replace('.', ',')} V` : 'Sem AC (L/N)'}
          tone={!enabled || !simActive ? 'neutral' : powered ? 'ok' : 'warn'}
        />
      </div>
      <div className="grid grid-cols-2 gap-1">
        <button
          type="button"
          disabled={gateAct}
          title={actTitle}
          aria-pressed={enabled}
          onClick={() => setState(c.id, { on: true })}
          className={`dc-btn text-[11px] justify-center ${enabled ? 'dc-btn-primary' : ''}`}
        >
          Saída ativa
        </button>
        <button
          type="button"
          disabled={gateAct}
          title={actTitle}
          aria-pressed={!enabled}
          onClick={() => setState(c.id, { on: false })}
          className={`dc-btn text-[11px] justify-center ${!enabled ? 'dc-btn-primary' : ''}`}
        >
          Cortar saída
        </button>
      </div>
      <div className="flex flex-col gap-1">
        <span className="dc-field-label">{`Trimmer V_adj: ${outV.toFixed(1).replace('.', ',')} V DC${rdy ? ' · RDY fechado' : ''}`}</span>
        <div className="grid grid-cols-4 gap-1">
          {[22.5, 24, 26, 28].map((v) => (
            <button
              key={v}
              type="button"
              disabled={locked}
              aria-pressed={Math.abs(outV - v) < 0.15}
              onClick={() => setState(c.id, { outV: v })}
              className={`dc-btn text-[10.5px] justify-center font-mono ${Math.abs(outV - v) < 0.15 ? 'dc-btn-primary' : ''}`}
            >
              {`${String(v).replace('.', ',')}V`}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function ContactorControls({ c, locked }: { c: ElectricalComponent; locked: boolean }) {
  const components = useSimStore((s) => s.components)
  const setState = useSimStore((s) => s.setComponentState)
  const setInterlock = useSimStore((s) => s.setContactorInterlock)
  const simActive = useManobraAllowed()

  const isAux = c.type === 'auxRelay' || c.type === 'auxRelay4'
  const energized = simActive && !!c.state.energized
  const partnerId = typeof c.state.interlockWith === 'string' ? c.state.interlockWith : ''
  const partner = partnerId ? components.find((x) => x.id === partnerId) : undefined
  const partnerClosed = simActive && !!partner?.state.energized
  const candidates = components.filter(
    (x) =>
      x.id !== c.id &&
      (x.sheet ?? '') === (c.sheet ?? '') &&
      isContactorLike(x.type) &&
      x.type !== 'auxRelay' &&
      x.type !== 'auxRelay4',
  )
  const coilSpec = typeof c.state.coil === 'string' ? c.state.coil : '24 V AC/DC'
  const coilPresets = ['24 V AC/DC', '110 V 50/60 Hz', '230 V 50/60 Hz']

  return (
    <div className="flex flex-col gap-2" data-device-controls="contactor">
      <div className="flex items-center justify-between gap-1">
        <span className="dc-field-label">{isAux ? 'Relé auxiliar (A1–A2)' : 'Contactor (bobina A1–A2)'}</span>
        <StatusBadge
          label={!simActive ? 'Repouso' : energized ? 'Atracado' : partnerClosed ? 'Encravado' : 'Aberto'}
          tone={!simActive ? 'neutral' : energized ? 'ok' : partnerClosed ? 'warn' : 'neutral'}
        />
      </div>

      <div className="flex flex-col gap-1">
        <span className="dc-field-label">Tensão nominal da bobina</span>
        <div className="grid grid-cols-3 gap-1">
          {coilPresets.map((spec) => {
            const short = spec.startsWith('24') ? '24 V' : spec.startsWith('110') ? '110 V' : '230 V'
            const active = coilSpec === spec
            return (
              <button
                key={spec}
                type="button"
                disabled={locked}
                aria-pressed={active}
                onClick={() => setState(c.id, { coil: spec })}
                className={`dc-btn text-[11px] justify-center font-mono ${active ? 'dc-btn-primary' : ''}`}
              >
                {short}
              </button>
            )
          })}
        </div>
      </div>

      {!isAux && (
        <label className="flex flex-col gap-1">
          <span className="dc-field-label">Encravamento mecânico</span>
          <Select
            value={partnerId}
            disabled={locked || (candidates.length === 0 && !partnerId)}
            onChange={(e) => setInterlock(c.id, e.target.value || null)}
            aria-label="Encravamento mecânico com contactor"
          >
            <option value="">{candidates.length ? 'Sem encravamento' : 'Adicione outro contactor para encravar'}</option>
            {candidates.map((k) => (
              <option key={k.id} value={k.id}>
                {`${k.ref} — ${k.label}`}
              </option>
            ))}
          </Select>
          {partner && (
            <small className="text-ink-400">
              {`Bloqueio mútuo ativo: ${c.ref} ↔ ${partner.ref} (não fecham em simultâneo).`}
            </small>
          )}
        </label>
      )}
    </div>
  )
}

function CommandAndSafetyControls({ c, locked }: { c: ElectricalComponent; locked: boolean }) {
  const setState = useSimStore((s) => s.setComponentState)
  const simActive = useManobraAllowed()
  /** Manobra física (rodar seletor/chave, premir botão, atuar emergência, rearmar relé) só com a simulação ativa;
   *  o tipo de retorno (mola/retentivo) é configuração mecânica e edita-se sempre. */
  const gateAct = locked || !simActive
  const actTitle = simActive ? undefined : MANOBRA_BLOCKED_TITLE

  // Seletor Schneider Harmony XA2ED33 · 3 posições (-1: 13–14, 0: aberto, +1: 23–24)
  if (c.type === 'selectorSchneiderXa2ed33' || c.type === 'selector3') {
    const pos = Number(c.state.position ?? 0)
    const maintain = c.state.maintain !== false
    return (
      <div className="flex flex-col gap-2" data-device-controls="selector3">
        {!simActive && <ManobraStopHint />}
        <div className="flex items-center justify-between gap-1">
          <span className="dc-field-label">Seletor 3 posições (2NA)</span>
          <StatusBadge
            label={pos === -1 ? '13–14 fechado' : pos === 1 ? '23–24 fechado' : '0 · Aberto'}
            tone={pos !== 0 ? 'ok' : 'neutral'}
          />
        </div>
        <div className="grid grid-cols-3 gap-1">
          {([
            [-1, '← 13–14'],
            [0, '0 · Centro'],
            [1, '23–24 →'],
          ] as const).map(([val, lbl]) => (
            <button
              key={val}
              type="button"
              disabled={gateAct}
              title={actTitle}
              aria-pressed={pos === val}
              onClick={() => setState(c.id, { position: val })}
              className={`dc-btn text-[10.5px] justify-center font-mono ${pos === val ? 'dc-btn-primary' : ''}`}
            >
              {lbl}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-1">
          <button
            type="button"
            disabled={locked}
            aria-pressed={maintain}
            onClick={() => setState(c.id, { maintain: true })}
            className={`dc-btn text-[10.5px] justify-center ${maintain ? 'dc-btn-primary' : ''}`}
          >
            Posição fixa
          </button>
          <button
            type="button"
            disabled={locked}
            aria-pressed={!maintain}
            onClick={() => setState(c.id, { maintain: false })}
            className={`dc-btn text-[10.5px] justify-center ${!maintain ? 'dc-btn-primary' : ''}`}
          >
            Retorno à mola
          </button>
        </div>
      </div>
    )
  }

  // Comutador de chave EAO 61-2101.0/D (11–12 repouso / 11–14 chave rodada)
  if (c.type === 'keyActuatorEao61') {
    const turned = !!c.state.pressed
    const momentary = c.state.momentary !== false
    return (
      <div className="flex flex-col gap-2" data-device-controls="key-switch">
        {!simActive && <ManobraStopHint />}
        <div className="flex items-center justify-between gap-1">
          <span className="dc-field-label">Comutador de chave (11–12 / 14)</span>
          <StatusBadge label={turned ? 'I · 11–14' : '0 · 11–12'} tone={turned ? 'ok' : 'neutral'} />
        </div>
        <div className="grid grid-cols-2 gap-1">
          <button
            type="button"
            disabled={gateAct}
            title={actTitle}
            aria-pressed={!turned}
            onClick={() => setState(c.id, { pressed: false })}
            className={`dc-btn text-[11px] justify-center ${!turned ? 'dc-btn-primary' : ''}`}
          >
            0 · Repouso (11–12)
          </button>
          <button
            type="button"
            disabled={gateAct}
            title={actTitle}
            aria-pressed={turned}
            onClick={() => setState(c.id, { pressed: true })}
            className={`dc-btn text-[11px] justify-center ${turned ? 'dc-btn-primary' : ''}`}
          >
            I · Rodar (11–14)
          </button>
        </div>
        <div className="grid grid-cols-2 gap-1">
          <button
            type="button"
            disabled={locked}
            aria-pressed={momentary}
            onClick={() => setState(c.id, { momentary: true })}
            className={`dc-btn text-[10.5px] justify-center ${momentary ? 'dc-btn-primary' : ''}`}
          >
            Com retorno (mola)
          </button>
          <button
            type="button"
            disabled={locked}
            aria-pressed={!momentary}
            onClick={() => setState(c.id, { momentary: false })}
            className={`dc-btn text-[10.5px] justify-center ${!momentary ? 'dc-btn-primary' : ''}`}
          >
            Chave retentiva
          </button>
        </div>
      </div>
    )
  }

  // Botões de emergência cogumelo (rotação ou chave P20ACR)
  if (c.type === 'emergencyButton' || c.type === 'emergencyButtonKeyP20ACR') {
    const pressed = !!c.state.pressed
    const isKey = c.type === 'emergencyButtonKeyP20ACR'
    return (
      <div className="flex flex-col gap-2" data-device-controls="estop">
        {!simActive && <ManobraStopHint />}
        <div className="flex items-center justify-between gap-1">
          <span className="dc-field-label">Emergência cogumelo (NF)</span>
          <StatusBadge label={pressed ? 'Travado (aberto)' : 'Rearmado (NF)'} tone={pressed ? 'danger' : 'ok'} />
        </div>
        <div className="grid grid-cols-2 gap-1">
          <button
            type="button"
            disabled={gateAct}
            title={actTitle}
            aria-pressed={!pressed}
            onClick={() => setState(c.id, { pressed: false })}
            className={`dc-btn text-[11px] justify-center ${!pressed ? 'dc-btn-primary' : ''}`}
          >
            {isKey ? 'Destrancar chave' : 'Rodar e rearmar'}
          </button>
          <button
            type="button"
            disabled={gateAct}
            title={actTitle}
            aria-pressed={pressed}
            onClick={() => setState(c.id, { pressed: true })}
            className={`dc-btn text-[11px] justify-center ${pressed ? 'dc-btn-primary' : ''}`}
          >
            Atuar emergência
          </button>
        </div>
      </div>
    )
  }

  // Botoneira dupla NPB22-D11 · START (13–14 NA) + STOP (21–22 NF)
  if (c.type === 'dualPushButtonNpb22D11') {
    const startOn = !!c.state.startPressed
    const stopOn = !!c.state.stopPressed
    return (
      <div className="flex flex-col gap-2" data-device-controls="dual-pb">
        {!simActive && <ManobraStopHint />}
        <div className="flex items-center justify-between gap-1">
          <span className="dc-field-label">Botoneira dupla START / STOP</span>
          <StatusBadge
            label={stopOn ? 'STOP aberto' : startOn ? 'START fechado' : 'Repouso'}
            tone={stopOn ? 'danger' : startOn ? 'ok' : 'neutral'}
          />
        </div>
        <div className="grid grid-cols-2 gap-1">
          <button
            type="button"
            disabled={gateAct}
            title={actTitle}
            aria-pressed={startOn}
            onClick={() => setState(c.id, { startPressed: !startOn, ...(startOn ? {} : { stopPressed: false }) })}
            className={`dc-btn text-[11px] justify-center ${startOn ? 'dc-btn-primary' : ''}`}
          >
            I · START (13–14)
          </button>
          <button
            type="button"
            disabled={gateAct}
            title={actTitle}
            aria-pressed={stopOn}
            onClick={() => setState(c.id, { stopPressed: !stopOn, ...(stopOn ? {} : { startPressed: false }) })}
            className={`dc-btn text-[11px] justify-center ${stopOn ? 'dc-btn-primary' : ''}`}
          >
            O · STOP (21–22)
          </button>
        </div>
      </div>
    )
  }

  // Relé de segurança Siemens SIRIUS 3TK2840 / safetyRelay
  const powered = simActive && !!c.state.powered
  const energized = simActive && !!c.state.energized
  const tripped = !!c.state.tripped

  return (
    <div className="flex flex-col gap-2" data-device-controls="safety-relay">
      {!simActive && <ManobraStopHint />}
      <div className="flex items-center justify-between gap-1">
        <span className="dc-field-label">Relé de segurança (14 / 24)</span>
        <StatusBadge
          label={tripped ? 'Disparado' : energized ? 'Armado (14/24 ON)' : powered ? 'Aguarda rearme' : 'Repouso'}
          tone={tripped ? 'danger' : energized ? 'ok' : powered ? 'warn' : 'neutral'}
        />
      </div>
      <div className="grid grid-cols-2 gap-1">
        <button
          type="button"
          disabled={gateAct}
          title={actTitle}
          onClick={() => setState(c.id, { tripped: false, resetRequested: true })}
          className="dc-btn dc-btn-primary text-[11px] justify-center"
        >
          Rearmar (RESET)
        </button>
        <button
          type="button"
          disabled={gateAct}
          title={actTitle}
          aria-pressed={tripped}
          onClick={() => setState(c.id, { tripped: !tripped, energized: false, resetRequested: false })}
          className={`dc-btn text-[11px] justify-center ${tripped ? 'dc-btn-primary' : ''}`}
        >
          {tripped ? 'Limpar disparo' : 'Disparar'}
        </button>
      </div>
    </div>
  )
}

function SensorAndLightControls({ c, locked }: { c: ElectricalComponent; locked: boolean }) {
  const setState = useSimStore((s) => s.setComponentState)
  const simActive = useManobraAllowed()
  /** A simulação do evento físico (objeto detetado, feixe cortado) é manobra; o alcance nominal edita-se sempre. */
  const gateAct = locked || !simActive
  const actTitle = simActive ? undefined : MANOBRA_BLOCKED_TITLE

  if (c.type === 'photoSensorXukt1ksml2' || ['proximitySensor', 'photoSensor', 'pressureSwitch', 'thermostat', 'floatSwitch'].includes(c.type)) {
    const triggered = !!c.state.triggered
    const rangeM = Number(c.state.rangeM) > 0 ? Number(c.state.rangeM) : 1.5
    return (
      <div className="flex flex-col gap-2" data-device-controls="sensor">
        {!simActive && <ManobraStopHint />}
        <div className="flex items-center justify-between gap-1">
          <span className="dc-field-label">Comutador ótico (COM / NA / NF)</span>
          <StatusBadge label={triggered ? 'COM–NA fechado' : 'COM–NF fechado'} tone={triggered ? 'ok' : 'neutral'} />
        </div>
        <div className="grid grid-cols-2 gap-1">
          <button
            type="button"
            disabled={gateAct}
            title={actTitle}
            aria-pressed={!triggered}
            onClick={() => setState(c.id, { triggered: false })}
            className={`dc-btn text-[11px] justify-center ${!triggered ? 'dc-btn-primary' : ''}`}
          >
            Feixe livre (NF)
          </button>
          <button
            type="button"
            disabled={gateAct}
            title={actTitle}
            aria-pressed={triggered}
            onClick={() => setState(c.id, { triggered: true })}
            className={`dc-btn text-[11px] justify-center ${triggered ? 'dc-btn-primary' : ''}`}
          >
            Objeto detetado (NA)
          </button>
        </div>
        {c.type === 'photoSensorXukt1ksml2' && (
          <div className="flex flex-col gap-1">
            <span className="dc-field-label">{`Alcance nominal: ${String(rangeM).replace('.', ',')} m`}</span>
            <div className="grid grid-cols-3 gap-1">
              {[0.5, 1.5, 4].map((m) => (
                <button
                  key={m}
                  type="button"
                  disabled={locked}
                  aria-pressed={Math.abs(rangeM - m) < 0.05}
                  onClick={() => setState(c.id, { rangeM: m })}
                  className={`dc-btn text-[10.5px] justify-center font-mono ${Math.abs(rangeM - m) < 0.05 ? 'dc-btn-primary' : ''}`}
                >
                  {`${String(m).replace('.', ',')} m`}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  if (c.type === 'towerLightSb23011' || c.type === 'towerLight') {
    const r = simActive && !!c.state.red
    const y = simActive && !!c.state.yellow
    const g = simActive && !!c.state.green
    return (
      <div className="flex flex-col gap-1.5" data-device-controls="tower-light">
        <span className="dc-field-label">Módulos LED (bornes R · Y · G · COM)</span>
        <div className="grid grid-cols-3 gap-1">
          <StatusBadge label={r ? 'R · Aceso' : 'R · OFF'} tone={r ? 'danger' : 'neutral'} />
          <StatusBadge label={y ? 'Y · Aceso' : 'Y · OFF'} tone={y ? 'warn' : 'neutral'} />
          <StatusBadge label={g ? 'G · Aceso' : 'G · OFF'} tone={g ? 'ok' : 'neutral'} />
        </div>
      </div>
    )
  }

  // Sinaleiro AD22-22DS / LEDs / buzzer (cor já é gerida pela paleta dedicada no Sidebar)
  const on = simActive && !!c.state.on
  return (
    <div className="flex items-center justify-between gap-1" data-device-controls="indicator">
      <span className="dc-field-label">{c.type === 'buzzer' ? 'Estado sonoro' : 'Estado luminoso (X1–X2)'}</span>
      <StatusBadge label={on ? 'Aceso' : 'Apagado'} tone={on ? 'ok' : 'neutral'} />
    </div>
  )
}

function MotorAndCapacitorControls({ c, locked }: { c: ElectricalComponent; locked: boolean }) {
  const setState = useSimStore((s) => s.setComponentState)
  const simActive = useManobraAllowed()
  /** A simulação de avaria do condensador é manobra (como «Simular fusão» nos ProtectionControls);
   *  capacitância, ligação da caixa de bornes e chapa característica são nominais e editam-se sempre. */
  const gateAct = locked || !simActive
  const actTitle = simActive ? undefined : MANOBRA_BLOCKED_TITLE

  if (c.type === 'capacitorRun60uF') {
    const uf = Number(c.state.capacitanceUf) > 0 ? Number(c.state.capacitanceUf) : 60
    const failed = !!c.state.failed
    return (
      <div className="flex flex-col gap-2" data-device-controls="capacitor">
        {!simActive && <ManobraStopHint />}
        <div className="flex items-center justify-between gap-1">
          <span className="dc-field-label">{`Condensador CBB65 · ${uf} µF / 450 V~`}</span>
          <StatusBadge label={failed ? 'Aberto (avaria)' : 'Operacional'} tone={failed ? 'danger' : 'ok'} />
        </div>
        <div className="grid grid-cols-5 gap-1">
          {[16, 25, 40, 60, 80].map((v) => (
            <button
              key={v}
              type="button"
              disabled={locked}
              aria-pressed={uf === v}
              onClick={() => setState(c.id, { capacitanceUf: v })}
              className={`dc-btn text-[10px] justify-center font-mono ${uf === v ? 'dc-btn-primary' : ''}`}
            >
              {`${v}µF`}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-1">
          <button
            type="button"
            disabled={gateAct}
            title={actTitle}
            aria-pressed={!failed}
            onClick={() => setState(c.id, { failed: false })}
            className={`dc-btn text-[10.5px] justify-center ${!failed ? 'dc-btn-primary' : ''}`}
          >
            Íntegro (1–2)
          </button>
          <button
            type="button"
            disabled={gateAct}
            title={actTitle}
            aria-pressed={failed}
            onClick={() => setState(c.id, { failed: true })}
            className={`dc-btn text-[10.5px] justify-center ${failed ? 'dc-btn-primary' : ''}`}
          >
            Simular corte
          </button>
        </div>
      </div>
    )
  }

  const is3ph = c.type === 'motor3ph'
  const running = simActive && !!c.state.running
  const dir = String(c.state.direction ?? 'stopped')
  const nominalRpm = Number(c.state.rpm) > 0 ? Number(c.state.rpm) : is3ph ? 1435 : 1400
  const rpmVisual = simActive ? Number(c.state.rpmVisual ?? 0) : 0
  const liveRpm = Math.round(nominalRpm * Math.max(0, Math.min(1, rpmVisual)))
  const kw = Number(c.state.powerKw) > 0 ? Number(c.state.powerKw) : is3ph ? 0.55 : 0.37
  const inA = Number(c.state.currentA) > 0 ? Number(c.state.currentA) : is3ph ? 1.29 : 2.5
  const liveA = running ? inA : 0
  const conn = (c.state.motorConnection as 'star' | 'delta' | 'none' | undefined) ?? 'star'
  const presets = is3ph ? MOTOR_3PH_PRESETS : MOTOR_1PH_PRESETS
  const dirLabel = !running && liveRpm < 10 ? 'Parado' : dir === 'ccw' ? 'Anti-horário ↺' : 'Horário ↻'

  return (
    <div className="flex flex-col gap-2" data-device-controls="motor">
      <div className="flex items-center justify-between gap-1">
        <span className="dc-field-label">{is3ph ? 'Motor trifásico 3~' : 'Motor monofásico 1~'}</span>
        <StatusBadge label={dirLabel} tone={running ? 'ok' : 'neutral'} />
      </div>

      {/* Telemetria em tempo real (apenas leitura) */}
      <div className="grid grid-cols-2 gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-[11px]">
        <div className="flex justify-between gap-1">
          <span className="text-ink-400">Rotação</span>
          <span className="font-mono font-semibold text-slate-800">{`${liveRpm} rpm`}</span>
        </div>
        <div className="flex justify-between gap-1">
          <span className="text-ink-400">Corrente</span>
          <span className="font-mono font-semibold text-slate-800">{`${liveA.toFixed(2).replace('.', ',')} A`}</span>
        </div>
      </div>

      {is3ph && (
        <div className="flex flex-col gap-1">
          <span className="dc-field-label">Ligação da caixa de bornes</span>
          <div className="grid grid-cols-3 gap-1">
            {([
              ['star', 'Y Estrela'],
              ['delta', 'Δ Triâng.'],
              ['none', 'Sem pontes'],
            ] as const).map(([mode, lbl]) => (
              <button
                key={mode}
                type="button"
                disabled={locked}
                aria-pressed={conn === mode}
                onClick={() => setState(c.id, { motorConnection: mode })}
                title={
                  mode === 'none'
                    ? 'Bornes U1/V1/W1 e W2/U2/V2 abertos para arranque Estrela-Triângulo por contactores (KM2/KM3)'
                    : mode === 'star'
                      ? 'Chapas internas ligadas em Estrela (W2–U2–V2)'
                      : 'Chapas internas ligadas em Triângulo (U1–W2, V1–U2, W1–V2)'
                }
                className={`dc-btn text-[10.5px] justify-center ${conn === mode ? 'dc-btn-primary' : ''}`}
              >
                {lbl}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-1">
        <span className="dc-field-label">{`Chapa característica (${String(kw).replace('.', ',')} kW · I_n ${String(inA).replace('.', ',')} A)`}</span>
        <div className="grid grid-cols-4 gap-1">
          {presets.map((p) => (
            <button
              key={p.kw}
              type="button"
              disabled={locked}
              aria-pressed={Math.abs(kw - p.kw) < 0.04}
              onClick={() =>
                setState(c.id, {
                  powerKw: p.kw,
                  cv: p.cv,
                  rpm: p.rpm,
                  currentA: p.inA,
                  torqueNm: p.torqueNm,
                })
              }
              className={`dc-btn text-[10px] justify-center font-mono ${Math.abs(kw - p.kw) < 0.04 ? 'dc-btn-primary' : ''}`}
            >
              {`${String(p.kw).replace('.', ',')}kW`}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function PlcModuleControls({ c, locked }: { c: ElectricalComponent; locked: boolean }) {
  const setState = useSimStore((s) => s.setComponentState)
  const simActive = useManobraAllowed()
  /** O seletor RUN/STOP da CPU é manobra física do aparelho: só com a simulação ativa. */
  const gateAct = locked || !simActive
  const actTitle = simActive ? undefined : MANOBRA_BLOCKED_TITLE
  const powered = simActive && !!c.state.powered
  const isAdapterOrIo = c.type === 'plcSiemensS71500Di32' || c.type === 'siemensTsAdapterIeBasic'
  const cpuMode = c.state.cpuMode === 'STOP' ? 'STOP' : 'RUN'
  const outputs = (c.state.outputs && typeof c.state.outputs === 'object' ? c.state.outputs : {}) as Record<string, boolean>
  const outKeys = Object.keys(outputs)
  const activeOuts = simActive ? outKeys.filter((k) => outputs[k]).length : 0

  return (
    <div className="flex flex-col gap-2" data-device-controls="plc">
      <div className="flex items-center justify-between gap-1">
        <span className="dc-field-label">{isAdapterOrIo ? 'Estado do módulo' : 'Estado da CPU'}</span>
        <StatusBadge
          label={
            !simActive
              ? `Pronto (${cpuMode})`
              : !powered
                ? 'Sem 24 V DC'
                : isAdapterOrIo
                  ? 'Alimentado'
                  : cpuMode === 'RUN'
                    ? `RUN · ${activeOuts}/${outKeys.length} Q`
                    : 'STOP'
          }
          tone={!simActive ? 'neutral' : !powered ? 'warn' : cpuMode === 'RUN' || isAdapterOrIo ? 'ok' : 'warn'}
        />
      </div>
      {!isAdapterOrIo && (
        <div className="grid grid-cols-2 gap-1">
          {!simActive && <div className="col-span-2"><ManobraStopHint /></div>}
          <button
            type="button"
            disabled={gateAct}
            title={actTitle}
            aria-pressed={cpuMode === 'RUN'}
            onClick={() => setState(c.id, { cpuMode: 'RUN', mode: 'RUN' })}
            className={`dc-btn text-[11px] justify-center font-mono ${cpuMode === 'RUN' ? 'dc-btn-primary' : ''}`}
          >
            RUN (executar)
          </button>
          <button
            type="button"
            disabled={gateAct}
            title={actTitle}
            aria-pressed={cpuMode === 'STOP'}
            onClick={() => setState(c.id, { cpuMode: 'STOP', mode: 'STOP' })}
            className={`dc-btn text-[11px] justify-center font-mono ${cpuMode === 'STOP' ? 'dc-btn-primary' : ''}`}
          >
            STOP (inibir Q)
          </button>
        </div>
      )}
    </div>
  )
}

export function hasDeviceControls(type: string): boolean {
  return (
    isIndustrialDevice(type) ||
    type === 'multimeterDm20' ||
    type === 'powerSource3ph' ||
    type === 'powerSource1ph' ||
    type === 'powerSource24v' ||
    type === 'powerSupply' ||
    type === 'powerSupplyProauto24A' ||
    isContactorLike(type) ||
    isPlcModule(type) ||
    isLightingType(type) ||
    isHydraulicComponentType(type) ||
    [
      'selectorSchneiderXa2ed33',
      'selector3',
      'keyActuatorEao61',
      'emergencyButton',
      'emergencyButtonKeyP20ACR',
      'dualPushButtonNpb22D11',
      'safetyRelaySiemens3tk2840',
      'safetyRelay',
      'photoSensorXukt1ksml2',
      'proximitySensor',
      'photoSensor',
      'pressureSwitch',
      'thermostat',
      'floatSwitch',
      'towerLightSb23011',
      'towerLight',
      'pilotLightAd22',
      'ledGreen',
      'ledRed',
      'ledYellow',
      'ledWhite',
      'buzzer',
      'motor3ph',
      'motor1ph',
      'capacitorRun60uF',
    ].includes(type)
  )
}

function LightingControls({ c, locked }: { c: ElectricalComponent; locked: boolean }) {
  const setState = useSimStore((s) => s.setComponentState)
  const operate = useSimStore((s) => s.operateComponent)
  const simActive = useManobraAllowed()
  const gateAct = locked || !simActive
  const actTitle = !simActive ? MANOBRA_BLOCKED_TITLE : undefined

  if (isLightingLampType(c.type)) {
    const spec = LAMP_SPECS[c.type]
    const photo = lampPhotometrics(c.type, c.state.powerW)
    const cct = Number(c.state.cctK) || spec.defaultCctK
    const pal = cctLightPalette(cct, c.type === 'lampIncandescentE27')
    const lit = simActive && !!c.state.on

    return (
      <div className="flex flex-col gap-2" data-device-controls="lighting-lamp">
        <div className="flex items-center justify-between gap-1">
          <span className="dc-field-label">{spec.brand} {spec.series} · {spec.socketLabel}</span>
          <StatusBadge label={lit ? 'Acesa (230 V~)' : 'Apagada'} tone={lit ? 'ok' : 'neutral'} />
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-[10px] text-[var(--dc-text-muted)]">Potência nominal</span>
          <div className="grid grid-cols-4 gap-1">
            {spec.powerOptionsW.map((w) => {
              const active = photo.powerW === w
              return (
                <button
                  key={w}
                  type="button"
                  disabled={locked}
                  aria-pressed={active}
                  onClick={() => setState(c.id, { powerW: w })}
                  className={`dc-btn text-[11px] justify-center px-1 ${active ? 'dc-btn-primary' : ''}`}
                >
                  {w} W
                </button>
              )
            })}
          </div>
        </div>

        {spec.cctOptionsK.length > 1 && (
          <div className="flex flex-col gap-1">
            <span className="text-[10px] text-[var(--dc-text-muted)]">Temperatura de cor</span>
            <div className="grid grid-cols-3 gap-1">
              {spec.cctOptionsK.map((k) => {
                const active = cct === k
                return (
                  <button
                    key={k}
                    type="button"
                    disabled={locked}
                    aria-pressed={active}
                    onClick={() => setState(c.id, { cctK: k })}
                    className={`dc-btn text-[11px] justify-center px-1 ${active ? 'dc-btn-primary' : ''}`}
                  >
                    {k} K
                  </button>
                )
              })}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-x-2 gap-y-1 rounded border border-[var(--dc-border)] bg-[var(--dc-surface-subtle)] p-2 text-[10px]">
          <span className="text-[var(--dc-text-muted)]">Fluxo luminoso</span>
          <span className="text-right font-mono font-semibold text-[var(--dc-text)]">{photo.lumens} lm</span>
          <span className="text-[var(--dc-text-muted)]">Equiv. incandescente</span>
          <span className="text-right font-mono text-[var(--dc-text)]">≈ {photo.equivW} W</span>
          <span className="text-[var(--dc-text-muted)]">Corrente (230 V~)</span>
          <span className="text-right font-mono text-[var(--dc-text)]">{photo.currentA.toFixed(3)} A (cos φ {spec.powerFactor.toFixed(2)})</span>
          <span className="text-[var(--dc-text-muted)]">Cor da luz</span>
          <span className="text-right text-[var(--dc-text)]">{pal.label}</span>
          <span className="text-[var(--dc-text-muted)]">Vida útil</span>
          <span className="text-right font-semibold text-[var(--dc-text)]">{spec.lifespanLabel}</span>
          <span className="text-[var(--dc-text-muted)]">Poupança energética</span>
          <span className="text-right font-semibold text-emerald-600 dark:text-emerald-400">{spec.energySavingLabel}</span>
        </div>
        <div className="text-[10px] text-[var(--dc-text-muted)]">
          Alimentar em <strong>L</strong> (fase 230 V~) e <strong>N</strong> (neutro) no casquilho E27.
        </div>
      </div>
    )
  }

  if (isLightingSwitchType(c.type)) {
    const spec = SWITCH_SPECS[c.type]
    if (c.type === 'wallSwitchDouble') {
      const on1 = !!c.state.on1
      const on2 = !!c.state.on2
      return (
        <div className="flex flex-col gap-2" data-device-controls="lighting-switch-double">
          {!simActive && <ManobraStopHint />}
          <div className="flex items-center justify-between gap-1">
            <span className="dc-field-label">{spec.brand} {spec.series} · {spec.reference}</span>
            <StatusBadge
              label={on1 && on2 ? 'T1 + T2 ON' : on1 ? 'T1 ON' : on2 ? 'T2 ON' : 'OFF'}
              tone={on1 || on2 ? 'ok' : 'neutral'}
            />
          </div>
          <div className="grid grid-cols-2 gap-1">
            <button
              type="button"
              disabled={gateAct}
              title={actTitle}
              aria-pressed={on1}
              onClick={() => operate(c.id, { on1: !on1 })}
              className={`dc-btn text-[11px] justify-center ${on1 ? 'dc-btn-primary' : ''}`}
            >
              Tecla 1 (L–1) · {on1 ? 'ON' : 'OFF'}
            </button>
            <button
              type="button"
              disabled={gateAct}
              title={actTitle}
              aria-pressed={on2}
              onClick={() => operate(c.id, { on2: !on2 })}
              className={`dc-btn text-[11px] justify-center ${on2 ? 'dc-btn-primary' : ''}`}
            >
              Tecla 2 (L–2) · {on2 ? 'ON' : 'OFF'}
            </button>
          </div>
          <div className="text-[10px] text-[var(--dc-text-muted)]">
            {spec.ratingLabel} · {spec.norm} · Comum <strong>L</strong> com saídas independentes <strong>1</strong> e <strong>2</strong>.
          </div>
        </div>
      )
    }

    const on = !!c.state.on
    const isStair = c.type === 'wallSwitchStaircase'
    return (
      <div className="flex flex-col gap-2" data-device-controls={isStair ? 'lighting-switch-staircase' : 'lighting-switch-simple'}>
        {!simActive && <ManobraStopHint />}
        <div className="flex items-center justify-between gap-1">
          <span className="dc-field-label">{spec.brand} {spec.series} · {spec.reference}</span>
          <StatusBadge
            label={isStair ? (on ? 'Posição 2 (L–2)' : 'Posição 1 (L–1)') : (on ? 'Ligado (L–1)' : 'Desligado')}
            tone={isStair ? 'warn' : on ? 'ok' : 'neutral'}
          />
        </div>
        <button
          type="button"
          disabled={gateAct}
          title={actTitle}
          aria-pressed={on}
          onClick={() => operate(c.id, { on: !on })}
          className={`dc-btn text-[11px] justify-center ${on ? 'dc-btn-primary' : ''}`}
        >
          {isStair
            ? (on ? 'Comutar para Posição 1 (L–1)' : 'Comutar para Posição 2 (L–2)')
            : (on ? 'Desligar (O)' : 'Ligar (I)')}
        </button>
        <div className="text-[10px] text-[var(--dc-text-muted)]">
          {spec.ratingLabel} · {spec.norm} · {isStair
            ? 'Contacto inversor SPDT: liga L↔1 (Pos. 1) ou L↔2 (Pos. 2) para comutação de escada.'
            : 'Contacto 1P: fecha L↔1 quando ligado.'}
        </div>
      </div>
    )
  }

  return null
}

function HydraulicControls({ c, locked }: { c: ElectricalComponent; locked: boolean }) {
  const setState = useSimStore((s) => s.setComponentState)
  const operate = useSimStore((s) => s.operateComponent)

  if (c.type === 'waterTank') {
    const dims = waterTankDimensionsOf(c.state)
    const levelPct = Math.max(0, Math.min(100, Math.round(Number(c.state.levelPct ?? 68))))
    const outletOpen = !!c.state.outletValveOpen
    const manualFill = !!c.state.manualFill
    return (
      <div className="flex flex-col gap-2" data-water-tank-controls>
        <div className="flex items-center justify-between gap-2 text-[11px]">
          <span className="text-[var(--dc-text-muted)]">Volume útil</span>
          <strong className="font-mono text-[var(--dc-text)]">{dims.volumeLiters} L · {levelPct}%</strong>
        </div>
        <label className="flex flex-col gap-0.5 text-[11px]">
          <span className="flex items-center justify-between text-[var(--dc-text-muted)]">
            <span>Diâmetro</span>
            <strong className="font-mono text-[var(--dc-text)]">{dims.diameterMm} mm</strong>
          </span>
          <input
            type="range"
            min={200}
            max={2000}
            step={20}
            disabled={locked}
            value={dims.diameterMm}
            onChange={(e) => setState(c.id, { diameterMm: Number(e.target.value) })}
          />
        </label>
        <label className="flex flex-col gap-0.5 text-[11px]">
          <span className="flex items-center justify-between text-[var(--dc-text-muted)]">
            <span>Altura</span>
            <strong className="font-mono text-[var(--dc-text)]">{dims.heightMm} mm</strong>
          </span>
          <input
            type="range"
            min={250}
            max={2500}
            step={20}
            disabled={locked}
            value={dims.heightMm}
            onChange={(e) => setState(c.id, { heightMm: Number(e.target.value) })}
          />
        </label>
        <label className="flex flex-col gap-0.5 text-[11px]">
          <span className="flex items-center justify-between text-[var(--dc-text-muted)]">
            <span>Nível de água</span>
            <strong className="font-mono text-[var(--dc-text)]">{levelPct}%</strong>
          </span>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            disabled={locked}
            value={levelPct}
            onChange={(e) => setState(c.id, { levelPct: Number(e.target.value) })}
          />
        </label>
        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            disabled={locked}
            className={`dc-btn text-[11px] justify-center ${outletOpen ? 'dc-btn-primary' : ''}`}
            onClick={() => operate(c.id, { outletValveOpen: !outletOpen })}
          >
            {outletOpen ? 'Fechar saída' : 'Abrir saída'}
          </button>
          <button
            type="button"
            disabled={locked}
            className={`dc-btn text-[11px] justify-center ${manualFill ? 'dc-btn-primary' : ''}`}
            onClick={() => operate(c.id, { manualFill: !manualFill })}
          >
            {manualFill ? 'Parar entrada' : 'Encher (teste)'}
          </button>
        </div>
      </div>
    )
  }

  if (c.type === 'waterPump') {
    const running = !!c.state.running
    return (
      <div className="flex flex-col gap-1.5 text-[11px]" data-water-pump-controls>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[var(--dc-text-muted)]">CALPEDA CT 61</span>
          <strong className="font-mono" style={{ color: running ? '#16a34a' : '#64748b' }}>
            {running ? 'Em marcha · 2900 rpm' : 'Parada'}
          </strong>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[var(--dc-text-muted)]">Hidráulica</span>
          <span className="font-mono text-[10px]">Q 5–40 L/min · H 40–5 m · G 1&quot;</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[var(--dc-text-muted)]">Alimentação</span>
          <span className="font-mono text-[10px]">230V~ · 0,37 kW · L1/N/PE</span>
        </div>
      </div>
    )
  }

  // floatSwitch
  const triggered = !!c.state.triggered
  const autoCouple = c.state.autoCoupleTank !== false
  return (
    <div className="flex flex-col gap-2 text-[11px]" data-float-switch-controls>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[var(--dc-text-muted)]">FELIX ENERGY IP68</span>
        <strong className="font-mono text-[var(--dc-text)]">{triggered ? 'Nível ALTO (C–NA)' : 'Nível BAIXO (C–NF)'}</strong>
      </div>
      <button
        type="button"
        disabled={locked}
        className={`dc-btn text-[11px] justify-center ${triggered ? 'dc-btn-primary' : ''}`}
        onClick={() => operate(c.id, { triggered: !triggered, level: !triggered ? 'alto' : 'baixo' })}
      >
        {triggered ? 'Descer bóia (C–NF)' : 'Subir bóia (C–NA)'}
      </button>
      <label className="dc-inspector-state-row is-toggle">
        <span className="dc-inspector-state-label">Acoplar ao reservatório</span>
        <input
          type="checkbox"
          checked={autoCouple}
          disabled={locked}
          onChange={(e) => setState(c.id, { autoCoupleTank: e.target.checked })}
        />
      </label>
    </div>
  )
}

export default function DeviceControls({ component: c, disabled = false }: { component: ElectricalComponent; disabled?: boolean }) {
  const locked = disabled || !!c.locked
  if (industrialDeviceTypeOf(c)) return <IndustrialDeviceControls component={c} disabled={locked} />
  if (isLightingType(c.type)) return <LightingControls c={c} locked={locked} />
  if (isHydraulicComponentType(c.type)) return <HydraulicControls c={c} locked={locked} />
  if (c.type === 'multimeterDm20') return <MultimeterControls c={c} locked={locked} />
  if (
    c.type === 'powerSource3ph' ||
    c.type === 'powerSource1ph' ||
    c.type === 'powerSource24v' ||
    c.type === 'powerSupply' ||
    c.type === 'powerSupplyProauto24A'
  ) {
    return <PowerControls c={c} locked={locked} />
  }
  if (isContactorLike(c.type)) return <ContactorControls c={c} locked={locked} />
  if (isPlcModule(c.type)) return <PlcModuleControls c={c} locked={locked} />
  if (
    [
      'selectorSchneiderXa2ed33',
      'selector3',
      'keyActuatorEao61',
      'emergencyButton',
      'emergencyButtonKeyP20ACR',
      'dualPushButtonNpb22D11',
      'safetyRelaySiemens3tk2840',
      'safetyRelay',
    ].includes(c.type)
  ) {
    return <CommandAndSafetyControls c={c} locked={locked} />
  }
  if (
    [
      'photoSensorXukt1ksml2',
      'proximitySensor',
      'photoSensor',
      'pressureSwitch',
      'thermostat',
      'floatSwitch',
      'towerLightSb23011',
      'towerLight',
      'pilotLightAd22',
      'ledGreen',
      'ledRed',
      'ledYellow',
      'ledWhite',
      'buzzer',
    ].includes(c.type)
  ) {
    return <SensorAndLightControls c={c} locked={locked} />
  }
  if (c.type === 'motor3ph' || c.type === 'motor1ph' || c.type === 'capacitorRun60uF') {
    return <MotorAndCapacitorControls c={c} locked={locked} />
  }
  return null
}
