import type { ElectricalComponent } from '../types'
import { MechatronicsControls } from './MechatronicsControls'
import { isMechatronicsType } from '../three/mechatronicsModel'
import { isSocketDevice, SOCKET_DEVICES } from '../electrical/socketDevices'
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
import {
  FLOW_METER_PIPE_SPECS,
  flowMeterSpecOf,
  isHydraulicComponentType,
  waterTankDimensionsOf,
  type FlowMeterPipeDN,
} from '../three/hydraulicsModel'
import { isPanelBound } from '../three/panelBounds'
import { isFloorMountedMachineType } from '../three/conveyorModel'
import { isFloorStandingComponent } from '../three/factoryPhysics'
import { isFloorGroundedStructureType, isConduitStructureType } from '../three/structuresModel'
import { isEditableCableDeviceType } from '../three/EditableCable3D'
import { isPneumaticComponentType } from '../three/pneumaticsModel'
import {
  computeJunctionBoxSurfaceSnap,
  isJunctionBoxType,
  isJunctionOrWagoType,
  isWagoConnectorType,
  type JunctionLidSticker,
} from '../three/junctionWagoModel'
import { PANEL_UNITS_PER_MM } from '../three/modelPaths'
import {
  cableTrayDimsOf,
  computeQuickAttach3D,
  industrialPillarDimsOf,
  industrialWallDimsOf,
  isCableTrayComponentType,
  isStructureComponentType,
  isWireMeshTrayType,
  type StructureComponentType,
} from '../three/structuresModel'
import {
  conveyorDimensionsOf,
  conveyorLineSensorsOf,
  isConveyorComponentType,
  type ConveyorLineSensor,
} from '../three/conveyorModel'

/**
 * Chaves de `component.state` geridas diretamente por `DeviceControls`, apenas de chapa técnica
 * ou derivadas internamente pelo motor elétrico — ocultas na lista genérica de estado para evitar
 * controlos duplicados, valores em inglês ou campos que não têm efeito prático.
 */
export const DEVICE_MANAGED_STATE_KEYS = new Set([
  'serviceOpen', 'blueCoverOpen', 'redCoverOpen', 'socketGeometryRevision',
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
  'mountDepthPct',
  'mountSide',
  'detachedFromTank',
  'cylinderVariant',
  'speedOutPct',
  'speedInPct',
  'forcePct',
  'boreMm',
  'strokeMm',
  'station1On',
  'station2On',
  'station3On',
  'station4On',
  'station1Manual',
  'station2Manual',
  'station3Manual',
  'station4Manual',
  'vacuumActive',
  'manualVacuum',
  'mountingFlange',
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
  'terminalBoxCovered',
  'powerKw',
  'cv',
  'rpm',
  'currentA',
  'cosPhi',
  'torqueNm',
  'massKg',
  // Tapete rolante & espelho refletor
  'motorized',
  'motorSide',
  'lengthMm',
  'widthMm',
  'testBoxActive',
  'testBoxPosPct',
  'lineSensors',
  'angleDeg',
  'tiltDeg',
  'faceSizeMm',
  'bracketMounted',
  // Estruturas, esteiras, hidráulica & pneumática
  'thicknessMm',
  'finish',
  'skirting',
  'profile',
  'sideHeightMm',
  'radiusMm',
  'withCover',
  'variant',
  'riserKind',
  'open',
  'airSupplyOn',
  'pressureBar',
  'manualOverride',
  'coilVoltage',
  'positionPct',
  'extended',
  'boreMm',
  'strokeMm',
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
  if (c.type === 'selectorSchneiderXa2ed33') {
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
  const covered = !!c.state.terminalBoxCovered
  const presets = is3ph ? MOTOR_3PH_PRESETS : MOTOR_1PH_PRESETS
  const dirLabel = !running && liveRpm < 10 ? 'Parado' : dir === 'ccw' ? 'Anti-horário ↺' : 'Horário ↻'

  return (
    <div className="flex flex-col gap-2" data-device-controls="motor">
      <div className="flex items-center justify-between gap-1">
        <span className="dc-field-label">{is3ph ? 'Motor trifásico 3~' : 'Motor monofásico 1~'}</span>
        <StatusBadge label={dirLabel} tone={running ? 'ok' : 'neutral'} />
      </div>

      {/* Tampa da caixa de bornes — destapada por defeito para ver ligações, tapável depois */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-1">
          <span className="dc-field-label">Caixa de bornes</span>
          <StatusBadge label={covered ? 'Tapada (IP55)' : 'Aberta (ligações visíveis)'} tone={covered ? 'ok' : 'warn'} />
        </div>
        <button
          type="button"
          disabled={locked}
          aria-pressed={covered}
          data-motor-cover-toggle
          onClick={() => setState(c.id, { terminalBoxCovered: !covered })}
          className={`dc-btn text-[11px] justify-center ${covered ? 'dc-btn-primary' : ''}`}
        >
          {covered ? 'Destapar caixa de bornes' : 'Tapar caixa de bornes'}
        </button>
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
    isSocketDevice(type) ||
    isIndustrialDevice(type) ||
    isMechatronicsType(type) ||
    type === 'multimeterDm20' ||
    type === 'powerSource3ph' ||
    type === 'powerSource1ph' ||
    type === 'powerSource24v' ||
    type === 'powerSupply' ||
    type === 'powerSupplyProauto24A' ||
    isContactorLike(type) ||
    isPlcModule(type) ||
    isLightingType(type) ||
    type === 'triProofLedBatten' ||
    isHydraulicComponentType(type) ||
    isPneumaticComponentType(type) ||
    isStructureComponentType(type) ||
    isConveyorComponentType(type) ||
    isJunctionOrWagoType(type) ||
    [
      'selectorSchneiderXa2ed33',
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
  // Hooks antes de qualquer return antecipado (o mesmo inspetor serve vários tipos hidráulicos).
  const allComponents = useSimStore((s) => s.components)
  const addComponent = useSimStore((s) => s.addComponent)
  const updateComponent = useSimStore((s) => s.updateComponent)

  if (c.type === 'waterTank') {
    const dims = waterTankDimensionsOf(c.state)
    const levelPct = Math.max(0, Math.min(100, Math.round(Number(c.state.levelPct ?? 0))))
    const outletOpen = !!c.state.outletValveOpen
    const manualFill = !!c.state.manualFill
    return (
      <div className="flex flex-col gap-2" data-water-tank-controls>
        <label className="flex items-center justify-between gap-2 text-[11px]">
          <span className="text-[var(--dc-text-muted)]">Suporte para caixa de derivação</span>
          <input type="checkbox" aria-label="Suporte para caixa de derivação" disabled={locked} checked={c.state.junctionBracket !== false} onChange={(e) => setState(c.id, { junctionBracket: e.target.checked })} />
        </label>
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
            data-water-tank-valve-toggle
            className={`dc-btn text-[11px] justify-center ${outletOpen ? 'dc-btn-primary' : ''}`}
            onClick={() => {
              if (useSimStore.getState().sim.runState === 'running') {
                operate(c.id, { outletValveOpen: !outletOpen })
              } else {
                setState(c.id, { outletValveOpen: !outletOpen })
              }
            }}
          >
            {outletOpen ? 'Fechar passador' : 'Abrir passador'}
          </button>
          <button
            type="button"
            disabled={locked}
            className={`dc-btn text-[11px] justify-center ${manualFill ? 'dc-btn-primary' : ''}`}
            onClick={() => {
              if (useSimStore.getState().sim.runState === 'running') {
                operate(c.id, { manualFill: !manualFill })
              } else {
                setState(c.id, { manualFill: !manualFill })
              }
            }}
          >
            {manualFill ? 'Parar entrada' : 'Encher (teste)'}
          </button>
        </div>
        {levelPct < 20 && (
          <button
            type="button"
            disabled={locked}
            onClick={() => setState(c.id, { levelPct: 80 })}
            className="dc-btn text-[10.5px] justify-center"
          >
            Reencher reservatório para 80%
          </button>
        )}
        <p className="text-[10px] text-slate-500">
          {outletOpen && levelPct > 0
            ? 'Passador ARCO aberto: nível da água a baixar gradualmente até esvaziar (0%). Duplo clique no passador em 3D para fechar.'
            : levelPct <= 0.1
              ? 'Reservatório vazio (0%). Feche o passador e ligue a bomba ou clique em Reencher.'
              : 'Faça duplo clique diretamente no passador ARCO em 3D (ou clique acima) para abrir e esvaziar gradualmente.'}
        </p>
      </div>
    )
  }

  if (c.type === 'waterPump') {
    const running = !!c.state.running
    const covered = !!c.state.terminalBoxCovered
    return (
      <div className="flex flex-col gap-2 text-[11px]" data-water-pump-controls>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[var(--dc-text-muted)]">CALPEDA CT 61</span>
          <strong className="font-mono" style={{ color: running ? '#16a34a' : '#64748b' }}>
            {running ? 'Em marcha · 2900 rpm' : 'Parada'}
          </strong>
        </div>
        <button
          type="button"
          disabled={locked}
          aria-pressed={covered}
          data-motor-cover-toggle
          onClick={() => setState(c.id, { terminalBoxCovered: !covered })}
          className={`dc-btn text-[11px] justify-center ${covered ? 'dc-btn-primary' : ''}`}
        >
          {covered ? 'Destapar caixa de bornes' : 'Tapar caixa de bornes'}
        </button>
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

  if (c.type === 'hydraulicValve') {
    const open = c.state.open !== false
    return (
      <div className="flex flex-col gap-2 text-[11px]" data-hydraulic-valve-controls>
        <div className="flex items-center justify-between gap-2">
          <span className="dc-field-label">Válvula de esfera G 1&quot;</span>
          <StatusBadge label={open ? 'Aberta (fluxo ON)' : 'Fechada (bloqueio)'} tone={open ? 'ok' : 'warn'} />
        </div>
        <button
          type="button"
          disabled={locked}
          aria-pressed={open}
          onClick={() => operate(c.id, { open: !open })}
          className={`dc-btn text-[11px] justify-center ${open ? 'dc-btn-primary' : ''}`}
        >
          {open ? 'Fechar válvula' : 'Abrir válvula'}
        </button>
      </div>
    )
  }

  if (c.type === 'hydraulicTee') {
    return (
      <div className="flex flex-col gap-1.5 text-[11px]" data-hydraulic-tee-controls>
        <div className="flex items-center justify-between gap-2">
          <span className="dc-field-label">União em T hidráulica</span>
          <StatusBadge label="3 vias · G 1&quot;" tone="ok" />
        </div>
        <p className="text-[10.5px] text-slate-500">Liga tubos hidráulicos nas 3 portas (A, B e C) para derivar o caudal de água.</p>
      </div>
    )
  }

  if (c.type === 'hydraulicFlowMeter') {
    const spec = flowMeterSpecOf(c.state)
    const singleL = Number(c.state.singleVolumeL ?? 0)
    const totalL = Number(c.state.totalVolumeL ?? 0)
    const flowLpm = Number(c.state.flowRateLpm ?? 0)
    const withCable = c.state.withCable !== false
    const displayMode = c.state.displayMode === 'instant' ? 'instant' : 'total'
    const installOrientation = c.state.installOrientation === 'vertical' ? 'vertical' : 'horizontal'
    const manualTestFlow = Boolean(c.state.manualTestFlow)

    return (
      <div className="flex flex-col gap-2 text-[11px]" data-water-flow-meter-controls>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[var(--dc-text-muted)]">ZJLCD-BT01 · PVC {spec.dn}</span>
          <StatusBadge label={flowLpm > 0 ? `${flowLpm.toFixed(1)} L/min` : 'Sem fluxo'} tone={flowLpm > 0 ? 'ok' : 'warn'} />
        </div>

        {/* Leitura digital viva */}
        <div className="grid grid-cols-2 gap-1.5 rounded-md border border-blue-200 bg-blue-50/70 p-2 font-mono text-[10.5px]">
          <div>
            <div className="text-[9.5px] text-slate-500">Parcial (L)</div>
            <strong className="text-[12.5px] text-slate-900">{singleL.toFixed(3)} L</strong>
          </div>
          <div>
            <div className="text-[9.5px] text-slate-500">{displayMode === 'instant' ? 'Caudal (L/min)' : 'Totalizador'}</div>
            <strong className="text-[12.5px] text-blue-900">
              {displayMode === 'instant' ? `${flowLpm.toFixed(1)} L/m` : `${totalL.toFixed(1)} L`}
            </strong>
          </div>
        </div>

        {/* Botões SET / CLEAR / Zerar Total (fiel a image-49.png) */}
        <div className="grid grid-cols-3 gap-1">
          <button
            type="button"
            disabled={locked}
            onClick={() => operate(c.id, { displayMode: displayMode === 'instant' ? 'total' : 'instant' })}
            className="dc-btn text-[10px] justify-center font-semibold"
          >
            SET ({displayMode === 'instant' ? 'L/m' : 'TOT'})
          </button>
          <button
            type="button"
            disabled={locked}
            onClick={() => operate(c.id, { singleVolumeL: 0 })}
            className="dc-btn text-[10px] justify-center font-semibold"
          >
            CLEAR
          </button>
          <button
            type="button"
            disabled={locked}
            onClick={() => operate(c.id, { singleVolumeL: 0, totalVolumeL: 0 })}
            className="dc-btn text-[10px] justify-center"
            title="Equivalente a manter CLEAR pressionado > 5s"
          >
            Zerar Total
          </button>
        </div>

        {/* Seleção de diâmetro PVC (tabela exata de image-51.png) */}
        <div className="flex flex-col gap-1 rounded-md border border-slate-200 bg-slate-50 p-2">
          <div className="flex items-center justify-between text-[10.5px]">
            <span className="font-semibold text-slate-700">Diâmetro PVC</span>
            <span className="font-mono text-[10px] text-slate-600">Int Ø{spec.innerMm} / Ext Ø{spec.outerMm} mm</span>
          </div>
          <div className="grid grid-cols-3 gap-1">
            {(Object.keys(FLOW_METER_PIPE_SPECS) as FlowMeterPipeDN[]).map((dn) => (
              <button
                key={dn}
                type="button"
                disabled={locked}
                aria-pressed={spec.dn === dn}
                onClick={() => setState(c.id, { pipeDN: dn, model: `ZJLCD-BT01 · PVC ${dn}` })}
                className={`dc-btn text-[10px] justify-center font-mono ${spec.dn === dn ? 'dc-btn-primary' : ''}`}
              >
                {dn}
              </button>
            ))}
          </div>
        </div>

        {/* Versão com cabo Open-Drain vs sem cabo (fiel a image-48.png) + orientação */}
        <div className="flex flex-col gap-1 rounded-md border border-slate-200 bg-slate-50 p-2">
          <div className="grid grid-cols-2 gap-1">
            <button
              type="button"
              disabled={locked}
              aria-pressed={withCable}
              onClick={() => setState(c.id, { withCable: !withCable })}
              className={`dc-btn text-[10px] justify-center ${withCable ? 'dc-btn-primary' : ''}`}
            >
              {withCable ? 'Com cabo Open-Drain' : 'Sem cabo (local)'}
            </button>
            <button
              type="button"
              disabled={locked}
              aria-pressed={installOrientation === 'vertical'}
              onClick={() => setState(c.id, { installOrientation: installOrientation === 'vertical' ? 'horizontal' : 'vertical' })}
              className={`dc-btn text-[10px] justify-center ${installOrientation === 'vertical' ? 'dc-btn-primary' : ''}`}
            >
              {installOrientation === 'vertical' ? 'Vertical ↑' : 'Horizontal →'}
            </button>
          </div>
          <button
            type="button"
            disabled={locked}
            aria-pressed={manualTestFlow}
            onClick={() => operate(c.id, { manualTestFlow: !manualTestFlow })}
            className={`dc-btn text-[10px] justify-center ${manualTestFlow ? 'dc-btn-primary' : ''}`}
          >
            {manualTestFlow ? 'Parar fluxo de teste' : 'Simular passagem de água (teste)'}
          </button>
          {withCable && (
            <span className="text-[9.5px] text-slate-600">
              Saída Open-Drain: Vermelho (+24V) · Amarelo (PULSE) · Preto (GND). Bornes e fios totalmente editáveis.
            </span>
          )}
        </div>
      </div>
    )
  }

  // floatSwitch — instalação real dentro do reservatório com contrapeso ajustável + saída dos fios para caixa exterior!
  const tanks = allComponents.filter((item) => item.type === 'waterTank')
  const oboBoxes = allComponents.filter((item) => isJunctionBoxType(item.type))
  const triggered = !!c.state.triggered
  const autoCouple = c.state.autoCoupleTank !== false
  const linkedTankId = typeof c.state.linkedTankId === 'string' ? c.state.linkedTankId : ''
  const linkedJunctionBoxId = typeof c.state.linkedJunctionBoxId === 'string' ? c.state.linkedJunctionBoxId : ''
  const detached = c.state.detachedFromTank === true
  const mountDepthPct = typeof c.state.mountDepthPct === 'number' ? c.state.mountDepthPct : 74
  const mountSide = (c.state.mountSide === 'left' || c.state.mountSide === 'center' || c.state.mountSide === 'right')
    ? c.state.mountSide
    : 'left'

  const createExternalOboBoxForFloat = () => {
    const tank = tanks.find((tk) => tk.id === linkedTankId) ?? tanks[0]
    const tp = tank?.panel3DPosition ?? { x: 0, y: 0, z: 4.2 }
    const td = tank ? waterTankDimensionsOf(tank.state) : null
    const tankR = td ? (td.diameterMm / 2) * PANEL_UNITS_PER_MM : 1.8
    const tankH = td ? td.totalHeightMm * PANEL_UNITS_PER_MM : 3.2
    const boxPos = {
      x: Math.round((tp.x + tankR + 0.92) * 20) / 20,
      y: Math.round((tp.y + tankH * 0.28) * 20) / 20,
      z: Math.round((tp.z + tankR * 0.25) * 20) / 20,
    }
    const newBoxId = addComponent('junctionBoxOboT60', (c.schematicX ?? 420) + 140, c.schematicY ?? 260)
    if (!newBoxId) return
    updateComponent(newBoxId, { panel3DPosition: boxPos })
    setState(newBoxId, { coverOpen: true, glandTop: true, glandBottom: true, lidSticker: 'hydraulics', lidLabelText: `BÓIA ${c.ref}` })
    const newWagoId = addComponent('wago221_5', (c.schematicX ?? 420) + 160, (c.schematicY ?? 260) + 70)
    if (newWagoId) {
      setState(newWagoId, { hostLocation: 'box', hostBoxId: newBoxId })
    }
    setState(c.id, { linkedJunctionBoxId: newBoxId })
  }

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

      {/* Instalação real dentro do reservatório */}
      <div className="flex flex-col gap-1.5 rounded-md border border-slate-200 bg-slate-50 p-2" data-float-tank-mount>
        <span className="text-[10.5px] font-semibold text-slate-700">Instalação no reservatório</span>
        <Select
          disabled={locked}
          className="dc-input text-[11px]"
          value={detached ? '__none__' : (linkedTankId || (tanks[0]?.id ?? '__none__'))}
          onChange={(e) => {
            const val = e.target.value
            if (val === '__none__') {
              setState(c.id, { linkedTankId: '', detachedFromTank: true, autoCoupleTank: false })
            } else {
              setState(c.id, { linkedTankId: val, detachedFromTank: false, autoCoupleTank: true })
            }
          }}
        >
          <option value="__none__">Fora do reservatório (solta)</option>
          {tanks.map((tk) => (
            <option key={tk.id} value={tk.id}>
              Dentro de {tk.ref} ({Math.round(Number(tk.state.levelPct ?? 0))}%)
            </option>
          ))}
        </Select>

        {!detached && tanks.length > 0 && (
          <>
            <label className="flex flex-col gap-0.5">
              <span className="flex items-center justify-between text-[10.5px] text-slate-600">
                <span>Cota do contrapeso (disparo)</span>
                <strong className="font-mono text-slate-800">{`${mountDepthPct}%`}</strong>
              </span>
              <input
                type="range"
                min={15}
                max={90}
                step={1}
                disabled={locked}
                value={mountDepthPct}
                onChange={(e) => setState(c.id, { mountDepthPct: Number(e.target.value) })}
              />
            </label>
            <div className="grid grid-cols-3 gap-1">
              {([['left', 'Esquerda'], ['center', 'Centro'], ['right', 'Direita']] as const).map(([sKey, sLbl]) => (
                <button
                  key={sKey}
                  type="button"
                  disabled={locked}
                  aria-pressed={mountSide === sKey}
                  onClick={() => setState(c.id, { mountSide: sKey })}
                  className={`dc-btn text-[10px] justify-center ${mountSide === sKey ? 'dc-btn-primary' : ''}`}
                >
                  {sLbl}
                </button>
              ))}
            </div>

            <div className="mt-1 flex flex-col gap-1 border-t border-slate-200 pt-1.5" data-float-external-box>
              <span className="text-[10.5px] font-semibold text-slate-700">Caixa exterior (saída dos fios)</span>
              <Select
                disabled={locked}
                className="dc-input text-[11px]"
                value={linkedJunctionBoxId}
                onChange={(e) => setState(c.id, { linkedJunctionBoxId: e.target.value })}
              >
                <option value="">Auto / Caixa OBO mais próxima</option>
                {oboBoxes.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.ref} · {String(b.state.model ?? b.type)}
                  </option>
                ))}
              </Select>
              <button
                type="button"
                disabled={locked}
                onClick={createExternalOboBoxForFloat}
                className="dc-btn text-[10px] justify-center"
              >
                + Criar OBO T60 + WAGO ao lado do tanque
              </button>
            </div>
          </>
        )}
      </div>

      <label className="dc-inspector-state-row is-toggle">
        <span className="dc-inspector-state-label">Acoplar ao nível real</span>
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

function ConveyorControls({ c, locked }: { c: ElectricalComponent; locked: boolean }) {
  const setState = useSimStore((s) => s.setComponentState)

  if (c.type === 'opticalReflector') {
    const angleDeg = Number(c.state.angleDeg ?? 0)
    const tiltDeg = Number(c.state.tiltDeg ?? 0)
    const faceSizeMm = Number(c.state.faceSizeMm ?? 50) >= 65 ? 80 : 50
    const bracketMounted = c.state.bracketMounted !== false
    return (
      <div className="flex flex-col gap-2 text-[11px]" data-optical-reflector-controls>
        <div className="flex items-center justify-between gap-2">
          <span className="dc-field-label">Espelho refletor prismático</span>
          <StatusBadge label={`${faceSizeMm}×${faceSizeMm} mm`} tone="ok" />
        </div>
        <label className="flex flex-col gap-1">
          <span className="flex items-center justify-between text-[var(--dc-text-muted)]">
            <span>Rotação horizontal</span>
            <strong className="font-mono text-[var(--dc-text)]">{`${Math.round(angleDeg)}°`}</strong>
          </span>
          <input
            type="range"
            min={-180}
            max={180}
            step={5}
            disabled={locked}
            value={angleDeg}
            onChange={(e) => setState(c.id, { angleDeg: Number(e.target.value) })}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="flex items-center justify-between text-[var(--dc-text-muted)]">
            <span>Inclinação vertical</span>
            <strong className="font-mono text-[var(--dc-text)]">{`${Math.round(tiltDeg)}°`}</strong>
          </span>
          <input
            type="range"
            min={-45}
            max={45}
            step={5}
            disabled={locked}
            value={tiltDeg}
            onChange={(e) => setState(c.id, { tiltDeg: Number(e.target.value) })}
          />
        </label>
        <div className="grid grid-cols-2 gap-1.5">
          {[50, 80].map((sz) => (
            <button
              key={sz}
              type="button"
              disabled={locked}
              aria-pressed={faceSizeMm === sz}
              onClick={() => setState(c.id, { faceSizeMm: sz })}
              className={`dc-btn text-[10.5px] justify-center font-mono ${faceSizeMm === sz ? 'dc-btn-primary' : ''}`}
            >
              {`${sz}×${sz} mm`}
            </button>
          ))}
        </div>
        <button
          type="button"
          disabled={locked}
          aria-pressed={bracketMounted}
          onClick={() => setState(c.id, { bracketMounted: !bracketMounted })}
          className={`dc-btn text-[11px] justify-center ${bracketMounted ? 'dc-btn-primary' : ''}`}
        >
          {bracketMounted ? 'Suporte metálico L: ativo' : 'Suporte metálico L: oculto'}
        </button>
      </div>
    )
  }

  // rollerConveyor
  const dims = conveyorDimensionsOf(c.state)
  const motorized = c.state.motorized !== false
  const motorSide = c.state.motorSide === 'back' ? 'back' : 'front'
  const covered = !!c.state.terminalBoxCovered
  const running = !!c.state.running
  const testBoxActive = c.state.testBoxActive !== false
  const sensors = conveyorLineSensorsOf(c.state)

  const updateSensor = (id: string, patch: Partial<ConveyorLineSensor>) => {
    const next = sensors.map((s) => (s.id === id ? { ...s, ...patch } : s))
    setState(c.id, { lineSensors: next })
  }
  const addSensor = () => {
    const idx = sensors.length + 1
    const nextPos = Math.min(92, Math.max(10, 15 + idx * 18))
    const next: ConveyorLineSensor[] = [
      ...sensors,
      {
        id: `s-${Date.now().toString(36)}-${idx}`,
        label: `S${idx} Linha`,
        kind: 'optical',
        positionPct: nextPos,
        side: 'front',
        angleDeg: 0,
        heightOffsetMm: 65,
        withReflector: true,
        triggered: false,
      },
    ]
    setState(c.id, { lineSensors: next })
  }
  const removeSensor = (id: string) => {
    setState(c.id, { lineSensors: sensors.filter((s) => s.id !== id) })
  }

  return (
    <div className="flex flex-col gap-2.5 text-[11px]" data-conveyor-controls>
      <div className="flex items-center justify-between gap-2">
        <span className="dc-field-label">Tapete rolante industrial</span>
        <StatusBadge label={!motorized ? 'Livre (gravidade)' : running ? 'Em marcha' : 'Motorizado'} tone={running ? 'ok' : 'neutral'} />
      </div>

      {/* Modo de tração */}
      <div className="grid grid-cols-2 gap-1.5">
        <button
          type="button"
          disabled={locked}
          aria-pressed={motorized}
          data-conveyor-mode="motorized"
          onClick={() => setState(c.id, { motorized: true })}
          className={`dc-btn text-[11px] justify-center ${motorized ? 'dc-btn-primary' : ''}`}
        >
          Com motor (3~)
        </button>
        <button
          type="button"
          disabled={locked}
          aria-pressed={!motorized}
          data-conveyor-mode="free"
          onClick={() => setState(c.id, { motorized: false, running: false, direction: 'stopped', rpmVisual: 0 })}
          className={`dc-btn text-[11px] justify-center ${!motorized ? 'dc-btn-primary' : ''}`}
        >
          Sem motor (livre)
        </button>
      </div>

      {/* Opções do motorredutor acoplado */}
      {motorized && (
        <div className="flex flex-col gap-1.5 rounded-md border border-slate-200 bg-slate-50 p-2">
          <div className="flex items-center justify-between gap-1">
            <span className="text-[10.5px] font-semibold text-slate-700">Motorredutor acoplado (U1/V1/W1/PE)</span>
            <StatusBadge label={covered ? 'Tapado' : 'Aberto'} tone={covered ? 'ok' : 'warn'} />
          </div>
          <button
            type="button"
            disabled={locked}
            aria-pressed={covered}
            data-motor-cover-toggle
            onClick={() => setState(c.id, { terminalBoxCovered: !covered })}
            className={`dc-btn text-[11px] justify-center ${covered ? 'dc-btn-primary' : ''}`}
          >
            {covered ? 'Destapar caixa de bornes' : 'Tapar caixa de bornes'}
          </button>
          <div className="grid grid-cols-2 gap-1">
            {(['front', 'back'] as const).map((side) => (
              <button
                key={side}
                type="button"
                disabled={locked}
                aria-pressed={motorSide === side}
                onClick={() => setState(c.id, { motorSide: side })}
                className={`dc-btn text-[10.5px] justify-center ${motorSide === side ? 'dc-btn-primary' : ''}`}
              >
                {side === 'front' ? 'Motor à frente' : 'Motor atrás'}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Dimensões editáveis da linha */}
      <div className="flex flex-col gap-1.5 rounded-md border border-slate-200 bg-slate-50 p-2">
        <span className="text-[10.5px] font-semibold text-slate-700">Dimensões da linha de rolos</span>
        <label className="flex flex-col gap-0.5">
          <span className="flex items-center justify-between text-[var(--dc-text-muted)]">
            <span>Comprimento</span>
            <strong className="font-mono text-[var(--dc-text)]">{`${dims.lengthMm} mm`}</strong>
          </span>
          <input
            type="range"
            min={800}
            max={4000}
            step={50}
            disabled={locked}
            value={dims.lengthMm}
            onChange={(e) => setState(c.id, { lengthMm: Number(e.target.value) })}
          />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="flex items-center justify-between text-[var(--dc-text-muted)]">
            <span>Largura útil</span>
            <strong className="font-mono text-[var(--dc-text)]">{`${dims.widthMm} mm`}</strong>
          </span>
          <input
            type="range"
            min={350}
            max={1200}
            step={25}
            disabled={locked}
            value={dims.widthMm}
            onChange={(e) => setState(c.id, { widthMm: Number(e.target.value) })}
          />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="flex items-center justify-between text-[var(--dc-text-muted)]">
            <span>Altura dos rolos</span>
            <strong className="font-mono text-[var(--dc-text)]">{`${dims.heightMm} mm`}</strong>
          </span>
          <input
            type="range"
            min={450}
            max={1200}
            step={25}
            disabled={locked}
            value={dims.heightMm}
            onChange={(e) => setState(c.id, { heightMm: Number(e.target.value) })}
          />
        </label>
      </div>

      {/* Caixa de teste sobre o tapete */}
      <div className="grid grid-cols-2 gap-1.5">
        <button
          type="button"
          disabled={locked}
          aria-pressed={testBoxActive}
          onClick={() => setState(c.id, { testBoxActive: !testBoxActive })}
          className={`dc-btn text-[10.5px] justify-center ${testBoxActive ? 'dc-btn-primary' : ''}`}
        >
          {testBoxActive ? 'Caixa de teste: ON' : 'Caixa de teste: OFF'}
        </button>
        <button
          type="button"
          disabled={locked || !testBoxActive}
          onClick={() => setState(c.id, { testBoxPosPct: 18 })}
          className="dc-btn text-[10.5px] justify-center"
        >
          Repor caixa início
        </button>
      </div>

      {/* Sensores editáveis montados na linha (mover + rodar + refletor) */}
      <div className="flex flex-col gap-1.5 rounded-md border border-slate-200 bg-slate-50 p-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10.5px] font-semibold text-slate-700">{`Sensores na linha (${sensors.length})`}</span>
          <button
            type="button"
            disabled={locked || sensors.length >= 8}
            onClick={addSensor}
            className="dc-btn text-[10px] px-2 py-0.5 dc-btn-primary"
          >
            + Sensor
          </button>
        </div>
        {sensors.length === 0 && (
          <p className="text-[10.5px] text-slate-500">Sem sensores definidos. Clique em &quot;+ Sensor&quot; para montar fotocélulas ou indutivos na linha.</p>
        )}
        {sensors.map((sensor) => (
          <div key={sensor.id} className="flex flex-col gap-1 rounded border border-slate-200 bg-white p-1.5">
            <div className="flex items-center justify-between gap-1">
              <span className="font-semibold text-slate-800">{sensor.label}</span>
              <div className="flex items-center gap-1">
                <StatusBadge label={sensor.triggered ? 'Detetado' : 'Livre'} tone={sensor.triggered ? 'ok' : 'neutral'} />
                <button
                  type="button"
                  disabled={locked}
                  onClick={() => removeSensor(sensor.id)}
                  className="dc-btn text-[10px] px-1.5 py-0"
                  title="Remover sensor"
                >
                  ×
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-1">
              <button
                type="button"
                disabled={locked}
                onClick={() => updateSensor(sensor.id, { kind: sensor.kind === 'optical' ? 'inductive' : 'optical' })}
                className="dc-btn text-[10px] justify-center"
              >
                {sensor.kind === 'optical' ? 'Tipo: Ótico' : 'Tipo: Indutivo'}
              </button>
              <button
                type="button"
                disabled={locked}
                onClick={() => updateSensor(sensor.id, { side: sensor.side === 'front' ? 'back' : 'front' })}
                className="dc-btn text-[10px] justify-center"
              >
                {sensor.side === 'front' ? 'Lado: Frente' : 'Lado: Trás'}
              </button>
            </div>
            <label className="flex flex-col gap-0.5">
              <span className="flex items-center justify-between text-[10px] text-slate-600">
                <span>Posição na linha</span>
                <strong className="font-mono">{`${Math.round(sensor.positionPct)}%`}</strong>
              </span>
              <input
                type="range"
                min={5}
                max={95}
                step={1}
                disabled={locked}
                value={sensor.positionPct}
                onChange={(e) => updateSensor(sensor.id, { positionPct: Number(e.target.value) })}
              />
            </label>
            <label className="flex flex-col gap-0.5">
              <span className="flex items-center justify-between text-[10px] text-slate-600">
                <span>Rotação do sensor</span>
                <strong className="font-mono">{`${Math.round(sensor.angleDeg)}°`}</strong>
              </span>
              <input
                type="range"
                min={-60}
                max={60}
                step={5}
                disabled={locked}
                value={sensor.angleDeg}
                onChange={(e) => updateSensor(sensor.id, { angleDeg: Number(e.target.value) })}
              />
            </label>
            <label className="flex flex-col gap-0.5">
              <span className="flex items-center justify-between text-[10px] text-slate-600">
                <span>Altura sobre rolos</span>
                <strong className="font-mono">{`${Math.round(sensor.heightOffsetMm)} mm`}</strong>
              </span>
              <input
                type="range"
                min={10}
                max={220}
                step={5}
                disabled={locked}
                value={sensor.heightOffsetMm}
                onChange={(e) => updateSensor(sensor.id, { heightOffsetMm: Number(e.target.value) })}
              />
            </label>
            {sensor.kind === 'optical' && (
              <button
                type="button"
                disabled={locked}
                aria-pressed={sensor.withReflector}
                onClick={() => updateSensor(sensor.id, { withReflector: !sensor.withReflector })}
                className={`dc-btn text-[10px] justify-center ${sensor.withReflector ? 'dc-btn-primary' : ''}`}
              >
                {sensor.withReflector ? 'Espelho refletor oposto: ON' : 'Espelho refletor oposto: OFF'}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function PneumaticControls({ c, locked }: { c: ElectricalComponent; locked: boolean }) {
  const setState = useSimStore((s) => s.setComponentState)
  const operate = useSimStore((s) => s.operateComponent)

  if (c.type === 'pneumaticFrl') {
    const airOn = c.state.airSupplyOn !== false
    const bar = Number(c.state.pressureBar ?? 6)
    return (
      <div className="flex flex-col gap-2 text-[11px]" data-pneumatic-frl-controls>
        <div className="flex items-center justify-between gap-2">
          <span className="dc-field-label">Unidade FRL Pneumática</span>
          <StatusBadge label={airOn ? `${bar.toFixed(1)} bar` : 'Ar cortado'} tone={airOn ? 'ok' : 'warn'} />
        </div>
        <button
          type="button"
          disabled={locked}
          aria-pressed={airOn}
          onClick={() => operate(c.id, { airSupplyOn: !airOn })}
          className={`dc-btn text-[11px] justify-center ${airOn ? 'dc-btn-primary' : ''}`}
        >
          {airOn ? 'Cortar ar comprimido' : 'Abrir ar comprimido'}
        </button>
        <label className="flex flex-col gap-1">
          <span className="flex items-center justify-between text-[var(--dc-text-muted)]">
            <span>Regulador de pressão</span>
            <strong className="font-mono text-[var(--dc-text)]">{`${bar.toFixed(1)} bar`}</strong>
          </span>
          <input
            type="range"
            min={0}
            max={10}
            step={0.5}
            disabled={locked}
            value={bar}
            onChange={(e) => setState(c.id, { pressureBar: Number(e.target.value) })}
          />
        </label>
      </div>
    )
  }

  if (c.type === 'pneumaticValve52') {
    const energized = Boolean(c.state.energized)
    const manual = Boolean(c.state.manualOverride)
    return (
      <div className="flex flex-col gap-2 text-[11px]" data-pneumatic-valve-controls>
        <div className="flex items-center justify-between gap-2">
          <span className="dc-field-label">Eletroválvula 5/2 · 24V DC</span>
          <StatusBadge label={energized || manual ? 'Ativa (P→A)' : 'Repouso (P→B)'} tone={energized || manual ? 'ok' : 'neutral'} />
        </div>
        <button
          type="button"
          disabled={locked}
          aria-pressed={manual}
          onClick={() => operate(c.id, { manualOverride: !manual })}
          className={`dc-btn text-[11px] justify-center ${manual ? 'dc-btn-primary' : ''}`}
        >
          {manual ? 'Soltar comando manual' : 'Acionar manualmente (P→A)'}
        </button>
      </div>
    )
  }

  if (c.type === 'pneumaticCylinder') {
    const pct = Number(c.state.positionPct ?? 0)
    const variant = (c.state.cylinderVariant === 'adn' || c.state.cylinderVariant === 'dsnu')
      ? c.state.cylinderVariant
      : 'dsbc'
    const applyPos = (nextPct: number) => {
      const patch = { positionPct: nextPct, extended: nextPct >= 90 }
      if (useSimStore.getState().sim.runState === 'running') operate(c.id, patch)
      else setState(c.id, patch)
    }
    return (
      <div className="flex flex-col gap-2 text-[11px]" data-pneumatic-cylinder-controls>
        <div className="flex items-center justify-between gap-2">
          <span className="dc-field-label">Cilindro Festo {variant.toUpperCase()}</span>
          <StatusBadge label={`${pct}% ${pct >= 90 ? 'Avançado' : pct <= 10 ? 'Recuado' : 'Em curso'}`} tone={pct >= 90 ? 'ok' : 'neutral'} />
        </div>
        <div className="grid grid-cols-3 gap-1">
          {([['dsbc', 'DSBC ISO'], ['adn', 'ADN Comp.'], ['dsnu', 'DSNU Inox']] as const).map(([vKey, vLbl]) => (
            <button
              key={vKey}
              type="button"
              disabled={locked}
              aria-pressed={variant === vKey}
              onClick={() => setState(c.id, { cylinderVariant: vKey })}
              className={`dc-btn text-[10px] justify-center ${variant === vKey ? 'dc-btn-primary' : ''}`}
            >
              {vLbl}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            disabled={locked}
            onClick={() => applyPos(100)}
            className={`dc-btn text-[11px] justify-center ${pct >= 90 ? 'dc-btn-primary' : ''}`}
          >
            Avançar (100%)
          </button>
          <button
            type="button"
            disabled={locked}
            onClick={() => applyPos(0)}
            className={`dc-btn text-[11px] justify-center ${pct <= 10 ? 'dc-btn-primary' : ''}`}
          >
            Recuar (0%)
          </button>
        </div>
      </div>
    )
  }

  if (c.type === 'electricCylinderEpcs') {
    const pct = Number(c.state.positionPct ?? 0)
    const speedOut = Number(c.state.speedOutPct ?? 70)
    const speedIn = Number(c.state.speedInPct ?? 70)
    const applyPos = (nextPct: number) => {
      const patch = { positionPct: nextPct, extended: nextPct >= 92 }
      if (useSimStore.getState().sim.runState === 'running') operate(c.id, patch)
      else setState(c.id, patch)
    }
    return (
      <div className="flex flex-col gap-2 text-[11px]" data-electric-cylinder-epcs-controls>
        <div className="flex items-center justify-between gap-2">
          <span className="dc-field-label">Festo EPCS-BS-45-200 SMS</span>
          <StatusBadge label={`${pct}% · 200 mm`} tone={pct >= 90 ? 'ok' : 'neutral'} />
        </div>
        <label className="flex flex-col gap-0.5">
          <span className="flex items-center justify-between text-[var(--dc-text-muted)]">
            <span>Posição da haste</span>
            <strong className="font-mono text-[var(--dc-text)]">{`${Math.round(pct * 2)} mm (${pct}%)`}</strong>
          </span>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            disabled={locked}
            value={pct}
            onChange={(e) => applyPos(Number(e.target.value))}
          />
        </label>
        <div className="grid grid-cols-2 gap-1.5">
          <button type="button" disabled={locked} onClick={() => applyPos(100)} className={`dc-btn text-[11px] justify-center ${pct >= 92 ? 'dc-btn-primary' : ''}`}>
            Avançar (IN1)
          </button>
          <button type="button" disabled={locked} onClick={() => applyPos(0)} className={`dc-btn text-[11px] justify-center ${pct <= 8 ? 'dc-btn-primary' : ''}`}>
            Recuar (IN2)
          </button>
        </div>
        <label className="flex flex-col gap-0.5">
          <span className="flex items-center justify-between text-[var(--dc-text-muted)]">
            <span>Speed Out / Speed In</span>
            <strong className="font-mono text-[var(--dc-text)]">{`${speedOut}% / ${speedIn}%`}</strong>
          </span>
          <input
            type="range"
            min={20}
            max={100}
            step={5}
            disabled={locked}
            value={speedOut}
            onChange={(e) => setState(c.id, { speedOutPct: Number(e.target.value), speedInPct: Number(e.target.value) })}
          />
        </label>
      </div>
    )
  }

  if (c.type === 'pneumaticGuidedCylinder') {
    const pct = Number(c.state.positionPct ?? 0)
    const applyPos = (nextPct: number) => {
      const patch = { positionPct: nextPct, extended: nextPct >= 90 }
      if (useSimStore.getState().sim.runState === 'running') operate(c.id, patch)
      else setState(c.id, patch)
    }
    return (
      <div className="flex flex-col gap-2 text-[11px]" data-pneumatic-guided-controls>
        <div className="flex items-center justify-between gap-2">
          <span className="dc-field-label">Festo DFM-20-40-P-A-GF</span>
          <StatusBadge label={`${pct}% · 40 mm`} tone={pct >= 90 ? 'ok' : 'neutral'} />
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <button type="button" disabled={locked} onClick={() => applyPos(100)} className={`dc-btn text-[11px] justify-center ${pct >= 90 ? 'dc-btn-primary' : ''}`}>
            Avançar (100%)
          </button>
          <button type="button" disabled={locked} onClick={() => applyPos(0)} className={`dc-btn text-[11px] justify-center ${pct <= 10 ? 'dc-btn-primary' : ''}`}>
            Recuar (0%)
          </button>
        </div>
      </div>
    )
  }

  if (c.type === 'pneumaticManifold') {
    return (
      <div className="flex flex-col gap-2 text-[11px]" data-pneumatic-manifold-controls>
        <div className="flex items-center justify-between gap-2">
          <span className="dc-field-label">Festo VTUG · 4 Estações DIN</span>
          <StatusBadge label="4× 5/2 · 24V DC" tone="ok" />
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {[1, 2, 3, 4].map((stNum) => {
            const on = Boolean(c.state[`station${stNum}On`] || c.state[`station${stNum}Manual`])
            return (
              <button
                key={stNum}
                type="button"
                disabled={locked}
                aria-pressed={on}
                onClick={() => {
                  const key = `station${stNum}Manual`
                  const patch = { [key]: !c.state[key] }
                  if (useSimStore.getState().sim.runState === 'running') operate(c.id, patch)
                  else setState(c.id, patch)
                }}
                className={`dc-btn text-[10.5px] justify-center ${on ? 'dc-btn-primary' : ''}`}
              >
                {`Y${stNum}: ${on ? 'P→A' : 'P→B'}`}
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  if (c.type === 'pneumaticVacuumCup') {
    const active = Boolean(c.state.vacuumActive || c.state.manualVacuum)
    const flange = c.state.mountingFlange !== false
    return (
      <div className="flex flex-col gap-2 text-[11px]" data-pneumatic-vacuum-controls>
        <div className="flex items-center justify-between gap-2">
          <span className="dc-field-label">DIYI VFG30-20 · Ventosa</span>
          <StatusBadge label={active ? 'Sucção ATIVA' : 'Repouso'} tone={active ? 'ok' : 'neutral'} />
        </div>
        <button
          type="button"
          disabled={locked}
          aria-pressed={active}
          onClick={() => {
            const next = !active
            const patch = { manualVacuum: next, vacuumActive: next }
            if (useSimStore.getState().sim.runState === 'running') operate(c.id, patch)
            else setState(c.id, patch)
          }}
          className={`dc-btn text-[11px] justify-center ${active ? 'dc-btn-primary' : ''}`}
        >
          {active ? 'Libertar vácuo' : 'Ativar vácuo (sucção)'}
        </button>
        <label className="dc-inspector-state-row is-toggle">
          <span className="dc-inspector-state-label">Bloco flange CNC lateral</span>
          <input
            type="checkbox"
            checked={flange}
            disabled={locked}
            onChange={(e) => setState(c.id, { mountingFlange: e.target.checked })}
          />
        </label>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1.5 text-[11px]" data-pneumatic-tee-controls>
      <div className="flex items-center justify-between gap-2">
        <span className="dc-field-label">União em T Push-In</span>
        <StatusBadge label="3 vias · Ar" tone="ok" />
      </div>
      <p className="text-[10.5px] text-slate-500">Bifurca tubos pneumáticos PU entre P1, P2 e P3.</p>
    </div>
  )
}

function StructureControls({ c, locked }: { c: ElectricalComponent; locked: boolean }) {
  const setState = useSimStore((s) => s.setComponentState)
  const updateComponent = useSimStore((s) => s.updateComponent)

  const rotate90 = () => {
    const cur = c.viewOrientation ?? { x: 0, y: 0, z: 0 }
    updateComponent(c.id, { viewOrientation: { x: cur.x, y: (cur.y + 90) % 360, z: cur.z } })
  }

  const quickAttach = (
    nextType: StructureComponentType,
    dir: 'right' | 'left' | 'front' | 'back' | 'up' | 'down',
  ) => {
    const store = useSimStore.getState()
    const cx = c.schematicX ?? 420
    const cy = c.schematicY ?? 260
    const anchorPos = c.panel3DPosition ?? { x: (cx - 420) * 0.02, y: -(cy - 260) * 0.02, z: 1.8 }
    const { position3D, statePatch } = computeQuickAttach3D(c, anchorPos, nextType, dir)
    const newId = store.addComponent(nextType, cx + (dir === 'right' ? 140 : dir === 'left' ? -140 : 0), cy + (dir === 'down' ? 90 : dir === 'up' ? -90 : 0))
    if (!newId) return
    if (Object.keys(statePatch).length) store.setComponentState(newId, statePatch)
    store.updateComponent(newId, { panel3DPosition: position3D })
    store.selectComponents([newId])
  }

  const isWall = c.type === 'industrialWall'
  const isPillar = c.type === 'industrialPillar'
  const isTray = isCableTrayComponentType(c.type)

  return (
    <div className="flex flex-col gap-2.5 text-[11px]" data-structure-controls={c.type}>
      {/* PAREDE INDUSTRIAL */}
      {isWall && (() => {
        const d = industrialWallDimsOf(c.state)
        return (
          <div className="flex flex-col gap-1.5 rounded-md border border-slate-200 bg-slate-50 p-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-700">Parede industrial PBR</span>
              <StatusBadge label={`${(d.lengthMm / 1000).toFixed(1)}×${(d.heightMm / 1000).toFixed(1)} m`} tone="ok" />
            </div>
            <label className="flex flex-col gap-0.5">
              <span className="flex justify-between text-slate-600"><span>Comprimento</span><strong className="font-mono">{`${d.lengthMm} mm`}</strong></span>
              <input type="range" min={1000} max={8000} step={200} disabled={locked} value={d.lengthMm} onChange={(e) => setState(c.id, { lengthMm: Number(e.target.value) })} />
            </label>
            <label className="flex flex-col gap-0.5">
              <span className="flex justify-between text-slate-600"><span>Altura</span><strong className="font-mono">{`${d.heightMm} mm`}</strong></span>
              <input type="range" min={1800} max={5000} step={100} disabled={locked} value={d.heightMm} onChange={(e) => setState(c.id, { heightMm: Number(e.target.value) })} />
            </label>
            <div className="grid grid-cols-3 gap-1">
              {([['concrete', 'Betão'], ['panel', 'Painel'], ['brick', 'Tijolo']] as const).map(([id, lbl]) => (
                <button key={id} type="button" disabled={locked} aria-pressed={d.finish === id} onClick={() => setState(c.id, { finish: id })} className={`dc-btn text-[10.5px] justify-center ${d.finish === id ? 'dc-btn-primary' : ''}`}>
                  {lbl}
                </button>
              ))}
            </div>
          </div>
        )
      })()}

      {/* PILAR METÁLICO */}
      {isPillar && (() => {
        const d = industrialPillarDimsOf(c.state)
        return (
          <div className="flex flex-col gap-1.5 rounded-md border border-slate-200 bg-slate-50 p-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-700">Pilar estrutural</span>
              <StatusBadge label={d.profile} tone="ok" />
            </div>
            <label className="flex flex-col gap-0.5">
              <span className="flex justify-between text-slate-600"><span>Altura</span><strong className="font-mono">{`${d.heightMm} mm`}</strong></span>
              <input type="range" min={1800} max={5500} step={100} disabled={locked} value={d.heightMm} onChange={(e) => setState(c.id, { heightMm: Number(e.target.value) })} />
            </label>
            <div className="grid grid-cols-3 gap-1">
              {(['IPE100', 'IPE160', 'HEB200', 'HEB240'] as const).map((p) => (
                <button key={p} type="button" disabled={locked} aria-pressed={d.profile === p} onClick={() => setState(c.id, { profile: p })} className={`dc-btn text-[10px] justify-center font-mono ${d.profile === p ? 'dc-btn-primary' : ''}`}>
                  {p}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-1">
              {([['steel', 'Aço'], ['galvanized', 'Galv.'], ['safetyYellow', 'Amarelo']] as const).map(([id, lbl]) => (
                <button key={id} type="button" disabled={locked} aria-pressed={d.finish === id} onClick={() => setState(c.id, { finish: id })} className={`dc-btn text-[10px] justify-center ${d.finish === id ? 'dc-btn-primary' : ''}`}>
                  {lbl}
                </button>
              ))}
            </div>
          </div>
        )
      })()}

      {/* ESTEIRAS PORTA-CABOS E ACESSÓRIOS (PERFURADA + ARAMADA CABLOFIL) */}
      {isCableTrayComponentType(c.type) && (() => {
        const d = cableTrayDimsOf(c.type, c.state)
        const isWire = isWireMeshTrayType(c.type)
        const mountBracket = (c.state.mountBracket === 'wall-console' || c.state.mountBracket === 'ceiling-trapeze'
          ? c.state.mountBracket
          : 'none') as 'none' | 'wall-console' | 'ceiling-trapeze'
        const dropOutPlate = Boolean(c.state.dropOutPlate)
        const couplerClips = c.state.couplerClips !== false
        return (
          <div className="flex flex-col gap-1.5 rounded-md border border-slate-200 bg-slate-50 p-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-700">{isWire ? 'Esteira aramada (Cablofil)' : 'Esteira galvanizada'}</span>
              <StatusBadge label={`${d.widthMm}×${d.sideHeightMm} mm`} tone="ok" />
            </div>
            <div className="grid grid-cols-5 gap-1">
              {[100, 150, 200, 300, 400].map((wMm) => (
                <button key={wMm} type="button" disabled={locked} aria-pressed={d.widthMm === wMm} onClick={() => setState(c.id, { widthMm: wMm })} className={`dc-btn text-[10px] justify-center font-mono px-1 ${d.widthMm === wMm ? 'dc-btn-primary' : ''}`}>
                  {wMm}
                </button>
              ))}
            </div>
            {(c.type === 'cableTrayStraight' || c.type === 'wireTrayStraight') && (
              <>
                <label className="flex flex-col gap-0.5">
                  <span className="flex justify-between text-slate-600"><span>Comprimento</span><strong className="font-mono">{`${d.lengthMm} mm`}</strong></span>
                  <input type="range" min={300} max={3000} step={100} disabled={locked} value={d.lengthMm} onChange={(e) => setState(c.id, { lengthMm: Number(e.target.value) })} />
                </label>
                {c.type === 'cableTrayStraight' ? (
                  <button type="button" disabled={locked} aria-pressed={d.withCover} onClick={() => setState(c.id, { withCover: !d.withCover })} className={`dc-btn text-[10.5px] justify-center ${d.withCover ? 'dc-btn-primary' : ''}`}>
                    {d.withCover ? 'Tampa galvanizada: ON' : 'Tampa galvanizada: OFF'}
                  </button>
                ) : (
                  <>
                    <div className="grid grid-cols-3 gap-1">
                      {([['none', 'Sem suporte'], ['wall-console', 'Consola'], ['ceiling-trapeze', 'Trapézio']] as const).map(([mKey, mLbl]) => (
                        <button key={mKey} type="button" disabled={locked} aria-pressed={mountBracket === mKey} onClick={() => setState(c.id, { mountBracket: mKey })} className={`dc-btn text-[9.5px] justify-center px-1 ${mountBracket === mKey ? 'dc-btn-primary' : ''}`}>
                          {mLbl}
                        </button>
                      ))}
                    </div>
                    <div className="grid grid-cols-2 gap-1">
                      <button type="button" disabled={locked} aria-pressed={dropOutPlate} onClick={() => setState(c.id, { dropOutPlate: !dropOutPlate })} className={`dc-btn text-[10px] justify-center ${dropOutPlate ? 'dc-btn-primary' : ''}`}>
                        {dropOutPlate ? 'Cascata saída' : '+ Cascata saída'}
                      </button>
                      <button type="button" disabled={locked} aria-pressed={couplerClips} onClick={() => setState(c.id, { couplerClips: !couplerClips })} className={`dc-btn text-[10px] justify-center ${couplerClips ? 'dc-btn-primary' : ''}`}>
                        {couplerClips ? 'Clipes união' : '+ Clipes união'}
                      </button>
                    </div>
                  </>
                )}
              </>
            )}
            {(c.type === 'cableTrayCross' || c.type === 'wireTrayTee') && (
              <div className="grid grid-cols-2 gap-1">
                {([['cross', 'Cruzamento X (4 vias)'], ['tee', 'Derivação T (3 vias)']] as const).map(([v, lbl]) => (
                  <button key={v} type="button" disabled={locked} aria-pressed={d.variant === v} onClick={() => setState(c.id, { variant: v })} className={`dc-btn text-[10px] justify-center ${d.variant === v ? 'dc-btn-primary' : ''}`}>
                    {lbl}
                  </button>
                ))}
              </div>
            )}
            {c.type === 'cableTrayVerticalBend' && (
              <>
                <label className="flex flex-col gap-0.5">
                  <span className="flex justify-between text-slate-600"><span>Ângulo do pescoço</span><strong className="font-mono">{`${d.angleDeg}°`}</strong></span>
                  <input type="range" min={15} max={90} step={5} disabled={locked} value={d.angleDeg} onChange={(e) => setState(c.id, { angleDeg: Number(e.target.value) })} />
                </label>
                <div className="grid grid-cols-2 gap-1">
                  {([['up', 'Subida ↗'], ['down', 'Descida ↘']] as const).map(([dir, lbl]) => (
                    <button key={dir} type="button" disabled={locked} aria-pressed={d.direction === dir} onClick={() => setState(c.id, { direction: dir })} className={`dc-btn text-[10px] justify-center ${d.direction === dir ? 'dc-btn-primary' : ''}`}>
                      {lbl}
                    </button>
                  ))}
                </div>
              </>
            )}
            {(c.type === 'cableTrayRiser90' || c.type === 'wireTrayRiser90') && (
              <div className="grid grid-cols-2 gap-1">
                {([['exterior', 'Curva Exterior'], ['interior', 'Curva Interior']] as const).map(([k, lbl]) => (
                  <button key={k} type="button" disabled={locked} aria-pressed={d.riserKind === k} onClick={() => setState(c.id, { riserKind: k })} className={`dc-btn text-[10px] justify-center ${d.riserKind === k ? 'dc-btn-primary' : ''}`}>
                    {lbl}
                  </button>
                ))}
              </div>
            )}
          </div>
        )
      })()}

      {/* CONSTRUÇÃO RÁPIDA COM ENCAIXE FÁCIL (1 CLIQUE) */}
      <div className="flex flex-col gap-1.5 rounded-md border border-slate-200 bg-slate-50 p-2" data-quick-snap-builder>
        <div className="flex items-center justify-between gap-1">
          <span className="text-[10.5px] font-semibold text-slate-700">Encaixe rápido (construir linha)</span>
          <button type="button" disabled={locked} onClick={rotate90} className="dc-btn text-[10px] px-2 py-0.5">
            Rodar 90°
          </button>
        </div>
        {isWireMeshTrayType(c.type) ? (
          <div className="grid grid-cols-2 gap-1">
            <button type="button" disabled={locked} onClick={() => quickAttach('wireTrayStraight', 'right')} className="dc-btn text-[10px] justify-center">+ Aramada Reta (dir.)</button>
            <button type="button" disabled={locked} onClick={() => quickAttach('wireTrayElbow90', 'right')} className="dc-btn text-[10px] justify-center">+ Curva 90° Aram.</button>
            <button type="button" disabled={locked} onClick={() => quickAttach('wireTrayTee', 'right')} className="dc-btn text-[10px] justify-center">+ Tê / Cruz Aram.</button>
            <button type="button" disabled={locked} onClick={() => quickAttach('wireTrayRiser90', 'right')} className="dc-btn text-[10px] justify-center">+ Subida Vert. 90°</button>
            <button type="button" disabled={locked} onClick={() => quickAttach('wireTrayStraight', 'left')} className="dc-btn text-[10px] justify-center">+ Aramada Reta (esq.)</button>
            <button type="button" disabled={locked} onClick={() => quickAttach('wireTrayStraight', 'front')} className="dc-btn text-[10px] justify-center">+ Aramada Frente</button>
          </div>
        ) : isTray ? (
          <div className="grid grid-cols-2 gap-1">
            <button type="button" disabled={locked} onClick={() => quickAttach('cableTrayStraight', 'right')} className="dc-btn text-[10px] justify-center">+ Reta (dir.)</button>
            <button type="button" disabled={locked} onClick={() => quickAttach('cableTrayElbow90', 'right')} className="dc-btn text-[10px] justify-center">+ Curva 90°</button>
            <button type="button" disabled={locked} onClick={() => quickAttach('cableTrayCross', 'right')} className="dc-btn text-[10px] justify-center">+ Cruz X / Tê</button>
            <button type="button" disabled={locked} onClick={() => quickAttach('cableTrayVerticalBend', 'right')} className="dc-btn text-[10px] justify-center">+ Pescoço</button>
            <button type="button" disabled={locked} onClick={() => quickAttach('cableTrayRiser90', 'right')} className="dc-btn text-[10px] justify-center">+ Curva Vert. 90°</button>
            <button type="button" disabled={locked} onClick={() => quickAttach('cableTrayStraight', 'left')} className="dc-btn text-[10px] justify-center">+ Reta (esq.)</button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-1">
            <button type="button" disabled={locked} onClick={() => quickAttach('industrialWall', 'right')} className="dc-btn text-[10px] justify-center">+ Parede (dir.)</button>
            <button type="button" disabled={locked} onClick={() => quickAttach('industrialPillar', 'right')} className="dc-btn text-[10px] justify-center">+ Pilar (dir.)</button>
            <button type="button" disabled={locked} onClick={() => quickAttach('industrialWall', 'left')} className="dc-btn text-[10px] justify-center">+ Parede (esq.)</button>
            <button type="button" disabled={locked} onClick={() => quickAttach('cableTrayStraight', 'front')} className="dc-btn text-[10px] justify-center">+ Esteira frente</button>
          </div>
        )}
      </div>
    </div>
  )
}

function JunctionAndWagoControls({ c, locked }: { c: ElectricalComponent; locked: boolean }) {
  const allComponents = useSimStore((s) => s.components)
  const setState = useSimStore((s) => s.setComponentState)
  const operate = useSimStore((s) => s.operateComponent)
  const simRunning = useSimStore((s) => s.sim.runState === 'running')
  const addComponent = useSimStore((s) => s.addComponent)
  const updateComponent = useSimStore((s) => s.updateComponent)
  const selectComponents = useSimStore((s) => s.selectComponents)

  const applyState = (patch: Record<string, unknown>) => {
    if (simRunning) operate(c.id, patch)
    else setState(c.id, patch)
  }

  /* ── Controles das Caixas de Derivação OBO Bettermann (T60 / A6 / T25) ── */
  if (isJunctionBoxType(c.type)) {
    const coverOpen = c.state.coverOpen === true
    const glandTop = c.state.glandTop !== false
    const glandBottom = c.state.glandBottom !== false
    const glandLeft = c.state.glandLeft === true
    const glandRight = c.state.glandRight === true
    const lidSticker = (typeof c.state.lidSticker === 'string' ? c.state.lidSticker : 'none') as JunctionLidSticker
    const lidLabelText = typeof c.state.lidLabelText === 'string' ? c.state.lidLabelText : ''
    const hostedWagos = allComponents.filter(
      (item) => isWagoConnectorType(item.type) && item.state.hostLocation === 'box' && item.state.hostBoxId === c.id,
    )

    const snapToNearestSurface = () => {
      const cur = c.panel3DPosition ?? { x: 2.4, y: 0.8, z: 0.35 }
      const snapped = computeJunctionBoxSurfaceSnap(c, allComponents, cur, -0.34)
      updateComponent(c.id, {
        panel3DPosition: snapped.position,
        state: { ...c.state, snappedSurface: snapped.surfaceLabel },
      })
    }

    const addWagoInside = (wagoType: 'wago221_2' | 'wago221_3' | 'wago221_5' | 'wago221_inline' | 'wago221_double') => {
      const createdId = addComponent(wagoType, (c.schematicX ?? 420) + 120, (c.schematicY ?? 260) + 40)
      if (!createdId) return
      setState(createdId, { hostLocation: 'box', hostBoxId: c.id })
      if (!coverOpen) setState(c.id, { coverOpen: true })
      selectComponents([createdId])
    }

    return (
      <div className="flex flex-col gap-2 text-[11px]" data-obo-junction-box-controls>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[var(--dc-text-muted)]">OBO Bettermann</span>
          <strong className="font-mono text-[var(--dc-text)]">{String(c.state.model ?? c.type)}</strong>
        </div>

        {/* Tampa removível */}
        <button
          type="button"
          disabled={locked}
          className={`dc-btn text-[11px] justify-center ${coverOpen ? 'dc-btn-primary' : ''}`}
          onClick={() => applyState({ coverOpen: !coverOpen })}
        >
          {coverOpen ? 'Colocar tampa (fechar caixa)' : 'Remover tampa (abrir interior)'}
        </button>
        <span className="text-[10px] text-slate-500">Dica: duplo-clique na tampa no 3D também abre/fecha.</span>

        {/* Montagem no suporte inox de um reservatório (também encaixa ao arrastar para perto da placa) */}
        <label className="flex items-center justify-between gap-2" data-obo-tank-bracket>
          <span className="text-slate-600">Suporte do reservatório</span>
          <Select
            className="dc-input !h-7 !text-[11px] !w-36"
            aria-label="Suporte do reservatório"
            disabled={locked}
            value={typeof c.state.tankBracketId === 'string' ? c.state.tankBracketId : ''}
            onChange={(e) => setState(c.id, { tankBracketId: e.target.value })}
          >
            <option value="">Livre (sem suporte)</option>
            {allComponents.filter((t) => t.type === 'waterTank' && t.state.junctionBracket !== false).map((t) => {
              const taken = allComponents.some((b) => b.id !== c.id && b.state.tankBracketId === t.id)
              return <option key={t.id} value={t.id} disabled={taken}>{t.ref}{taken ? ' (ocupado)' : ''}</option>
            })}
          </Select>
        </label>

        {/* Bucins PG / M20 configuráveis */}
        <div className="flex flex-col gap-1 rounded-md border border-slate-200 bg-slate-50 p-2" data-obo-glands>
          <span className="text-[10.5px] font-semibold text-slate-700">Bucins de entrada (PG / M20)</span>
          <div className="grid grid-cols-2 gap-1">
            {([
              ['glandTop', 'Topo', glandTop],
              ['glandBottom', 'Base', glandBottom],
              ['glandLeft', 'Esquerda', glandLeft],
              ['glandRight', 'Direita', glandRight],
            ] as const).map(([key, lbl, active]) => (
              <button
                key={key}
                type="button"
                disabled={locked}
                aria-pressed={active}
                onClick={() => setState(c.id, { [key]: !active })}
                className={`dc-btn text-[10px] justify-center ${active ? 'dc-btn-primary' : ''}`}
              >
                {active ? `Bucim ${lbl}` : `+ Bucim ${lbl}`}
              </button>
            ))}
          </div>
        </div>

        {/* Adesivo e etiqueta personalizada na tampa */}
        <div className="flex flex-col gap-1.5 rounded-md border border-slate-200 bg-slate-50 p-2" data-obo-stickers>
          <span className="text-[10.5px] font-semibold text-slate-700">Adesivos e etiqueta na tampa</span>
          <Select
            disabled={locked}
            className="dc-input text-[11px]"
            value={lidSticker}
            onChange={(e) => setState(c.id, { lidSticker: e.target.value as JunctionLidSticker })}
          >
            <option value="none">Sem adesivo</option>
            <option value="warning-bolt">Perigo elétrico (raio amarelo)</option>
            <option value="230v">230V ~ Perigo Elétrico</option>
            <option value="400v">400V 3~ Alta Tensão</option>
            <option value="24v">24V DC Comando / PLC</option>
            <option value="command">Derivação de Comando</option>
            <option value="hydraulics">Hidráulica · Bóia / Bomba</option>
          </Select>
          <input
            type="text"
            maxLength={22}
            disabled={locked}
            className="dc-input text-[11px]"
            placeholder="Etiqueta gravada (ex.: BÓIA R1)"
            value={lidLabelText}
            onChange={(e) => setState(c.id, { lidLabelText: e.target.value })}
          />
        </div>

        {/* Fixação rápida na superfície mais próxima */}
        <div className="flex flex-col gap-1 rounded-md border border-slate-200 bg-slate-50 p-2" data-obo-snap>
          <button
            type="button"
            disabled={locked}
            onClick={snapToNearestSurface}
            className="dc-btn text-[10.5px] justify-center"
          >
            Fixar na superfície mais próxima (parede / esteira / tanque)
          </button>
          {typeof c.state.snappedSurface === 'string' && c.state.snappedSurface && (
            <span className="text-[10px] text-emerald-700">Fixada em: {c.state.snappedSurface}</span>
          )}
        </div>

        {/* Conectores WAGO 221 alojados dentro desta caixa */}
        <div className="flex flex-col gap-1.5 rounded-md border border-slate-200 bg-slate-50 p-2" data-obo-hosted-wagos>
          <span className="text-[10.5px] font-semibold text-slate-700">
            Conectores WAGO no interior ({hostedWagos.length})
          </span>
          <div className="grid grid-cols-2 gap-1">
            <button type="button" disabled={locked} onClick={() => addWagoInside('wago221_2')} className="dc-btn text-[10px] justify-center">+ WAGO 2 vias</button>
            <button type="button" disabled={locked} onClick={() => addWagoInside('wago221_3')} className="dc-btn text-[10px] justify-center">+ WAGO 3 vias</button>
            <button type="button" disabled={locked} onClick={() => addWagoInside('wago221_5')} className="dc-btn text-[10px] justify-center">+ WAGO 5 vias</button>
            <button type="button" disabled={locked} onClick={() => addWagoInside('wago221_inline')} className="dc-btn text-[10px] justify-center">+ WAGO Inline</button>
            <button type="button" disabled={locked} onClick={() => addWagoInside('wago221_double')} className="dc-btn text-[10px] justify-center">+ WAGO 2×5</button>
          </div>
          {hostedWagos.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-0.5">
              {hostedWagos.map((w) => (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => selectComponents([w.id])}
                  className="rounded border border-orange-300 bg-orange-50 px-1.5 py-0.5 font-mono text-[10px] text-orange-800 hover:bg-orange-100"
                >
                  {w.ref}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  /* ── Controles dos Conectores WAGO 221 (221-412 / 221-415 / Inline / 2×5) ── */
  const oboBoxes = allComponents.filter((item) => isJunctionBoxType(item.type))
  const hostLocation = c.state.hostLocation === 'panel' || c.state.hostLocation === 'box' ? c.state.hostLocation : 'free'
  const hostBoxId = typeof c.state.hostBoxId === 'string' ? c.state.hostBoxId : ''
  const hostValue = hostLocation === 'box' && hostBoxId ? `box:${hostBoxId}` : hostLocation
  const leversOpen = Array.isArray(c.state.leversOpen) ? (c.state.leversOpen as boolean[]) : []
  const leverCount = c.terminals.length

  const handleHostChange = (val: string) => {
    if (val === 'free') {
      setState(c.id, { hostLocation: 'free', hostBoxId: '' })
    } else if (val === 'panel') {
      setState(c.id, { hostLocation: 'panel', hostBoxId: '' })
    } else if (val.startsWith('box:')) {
      const boxId = val.slice(4)
      setState(c.id, { hostLocation: 'box', hostBoxId: boxId })
      // Abre automaticamente a tampa da caixa OBO para o utilizador ver o WAGO lá dentro!
      const targetBox = oboBoxes.find((b) => b.id === boxId)
      if (targetBox && targetBox.state.coverOpen !== true) {
        setState(targetBox.id, { coverOpen: true })
      }
    }
  }

  const toggleLever = (idx: number) => {
    const next = Array.from({ length: leverCount }, (_, i) => leversOpen[i] === true)
    next[idx] = !next[idx]
    applyState({ leversOpen: next })
  }

  return (
    <div className="flex flex-col gap-2 text-[11px]" data-wago-221-controls>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[var(--dc-text-muted)]">WAGO 221 · 450V 32A</span>
        <strong className="font-mono text-[var(--dc-text)]">{String(c.state.model ?? c.type)}</strong>
      </div>

      {/* Seletor de Alojamento (Espaço livre / Quadro elétrico / Caixa OBO) */}
      <div className="flex flex-col gap-1 rounded-md border border-orange-200 bg-orange-50/70 p-2" data-wago-host-selector>
        <span className="text-[10.5px] font-semibold text-orange-950">Onde alojar este conector WAGO</span>
        <Select
          disabled={locked}
          className="dc-input text-[11px]"
          value={hostValue}
          onChange={(e) => handleHostChange(e.target.value)}
        >
          <option value="free">Espaço livre (3D)</option>
          <option value="panel">Dentro do Quadro Elétrico</option>
          {oboBoxes.map((b) => (
            <option key={b.id} value={`box:${b.id}`}>
              Dentro da Caixa {b.ref} · {String(b.state.model ?? b.type)}
            </option>
          ))}
        </Select>
        {oboBoxes.length === 0 && (
          <span className="text-[10px] text-orange-800/80">
            Adicione uma caixa OBO (T60, A6 ou T25) para alojar este WAGO no interior dela.
          </span>
        )}
      </div>

      {/* Alavancas laranja individuais (abrem/fecham o contacto elétrico real!) */}
      <div className="flex flex-col gap-1 rounded-md border border-slate-200 bg-slate-50 p-2" data-wago-levers>
        <span className="text-[10.5px] font-semibold text-slate-700">Alavancas CAGE CLAMP (clique para abrir/fechar)</span>
        <div className={`grid gap-1 ${leverCount <= 2 ? 'grid-cols-2' : 'grid-cols-5'}`}>
          {c.terminals.map((term, idx) => {
            const open = leversOpen[idx] === true
            return (
              <button
                key={term.id}
                type="button"
                disabled={locked}
                aria-pressed={open}
                onClick={() => toggleLever(idx)}
                className={`dc-btn text-[10px] justify-center px-1 ${open ? 'border-orange-500 bg-orange-500 text-white' : ''}`}
                title={open ? `Alavanca ${term.label} aberta (desligada)` : `Alavanca ${term.label} fechada (condutiva)`}
              >
                {term.label}{open ? ' ↑' : ' ↓'}
              </button>
            )
          })}
        </div>
      </div>

      {c.type === 'wago221_double' && (
        <label className="dc-inspector-state-row is-toggle">
          <span className="dc-inspector-state-label">Unir filas A e B (barramento comum 10 vias)</span>
          <input
            type="checkbox"
            checked={c.state.commonBus === true}
            disabled={locked}
            onChange={(e) => applyState({ commonBus: e.target.checked })}
          />
        </label>
      )}
    </div>
  )
}

function WaterSupplyBoxControls({ c, locked }: { c: ElectricalComponent; locked: boolean }) {
  const simActive = useSimStore((s) => s.sim.runState === 'running')
  const setComponentState = useSimStore((s) => s.setComponentState)
  const operateComponent = useSimStore((s) => s.operateComponent)
  const apply = (patch: Record<string, any>) => {
    if (simActive) operateComponent(c.id, patch)
    else setComponentState(c.id, patch)
  }
  const doorOpen = c.state.doorOpen !== false
  const readingHatchOpen = c.state.readingHatchOpen === true
  const valveOpen = c.state.valveOpen !== false
  const mainsOn = c.state.mainsSupplyOn !== false
  const internalCoverOpen = c.state.internalBoxCoverOpen !== false
  const flowLpm = Number(c.state.flowRateLpm ?? 0)
  const totalL = Number(c.state.totalVolumeL ?? 0)
  const singleL = Number(c.state.singleVolumeL ?? 0)
  const pipeDN = String(c.state.pipeDN ?? 'DN32') as FlowMeterPipeDN
  const wallMounted = c.state.mounting === 'wall'

  return (
    <div className="flex flex-col gap-2" data-device-controls="water-supply-box">
      <div className="flex items-center justify-between gap-1">
        <span className="dc-field-label">Caixa / Fonte de Água</span>
        <StatusBadge
          label={mainsOn && valveOpen ? `Pressurizada (${flowLpm.toFixed(1)} L/m)` : 'Passador fechado'}
          tone={mainsOn && valveOpen ? 'ok' : 'warn'}
        />
      </div>

      <div className="grid grid-cols-2 gap-1">
        <button
          type="button"
          disabled={locked}
          onClick={() => apply({ doorOpen: !doorOpen })}
          className={`dc-btn text-[11px] justify-center ${doorOpen ? 'dc-btn-primary' : ''}`}
        >
          {doorOpen ? 'Fechar porta ÁGUA' : 'Abrir porta ÁGUA'}
        </button>
        <button
          type="button"
          disabled={locked}
          onClick={() => apply({ valveOpen: !valveOpen })}
          className={`dc-btn text-[11px] justify-center ${valveOpen ? 'dc-btn-primary' : ''}`}
        >
          {valveOpen ? 'Fechar passador ARCO' : 'Abrir passador ARCO'}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-1">
        <button
          type="button"
          disabled={locked}
          onClick={() => apply({ readingHatchOpen: !readingHatchOpen })}
          className={`dc-btn text-[10.5px] justify-center ${readingHatchOpen ? 'dc-btn-primary' : ''}`}
        >
          {readingHatchOpen ? 'Fechar visor' : 'Abrir visor leitura'}
        </button>
        <button
          type="button"
          disabled={locked}
          onClick={() => apply({ internalBoxCoverOpen: !internalCoverOpen })}
          className={`dc-btn text-[10.5px] justify-center ${internalCoverOpen ? 'dc-btn-primary' : ''}`}
        >
          {internalCoverOpen ? 'Fechar tampa WAGO' : 'Abrir caixa WAGO'}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-1 text-[10.5px] rounded border border-slate-200 bg-slate-50 px-2 py-1.5 font-mono">
        <span>Parcial: <strong>{singleL.toFixed(2)} L</strong></span>
        <span>Total: <strong>{totalL.toFixed(1)} L</strong></span>
      </div>

      <div className="grid grid-cols-2 gap-1">
        <button
          type="button"
          disabled={locked}
          onClick={() => apply({ manualTestFlow: !c.state.manualTestFlow })}
          className={`dc-btn text-[10.5px] justify-center ${c.state.manualTestFlow ? 'dc-btn-primary' : ''}`}
        >
          {c.state.manualTestFlow ? 'Parar caudal teste' : 'Simular caudal'}
        </button>
        <button
          type="button"
          disabled={locked}
          onClick={() => apply({ singleVolumeL: 0 })}
          className="dc-btn text-[10.5px] justify-center"
        >
          Zerar parcial
        </button>
      </div>

      <label className="flex items-center justify-between gap-2 text-[11px]">
        <span className="text-slate-600">Diâmetro contador</span>
        <Select
          className="dc-input !h-7 !text-[11px] !w-28"
          disabled={locked}
          value={pipeDN}
          onChange={(e) => apply({ pipeDN: e.target.value })}
        >
          {(Object.keys(FLOW_METER_PIPE_SPECS) as FlowMeterPipeDN[]).map((dn) => (
            <option key={dn} value={dn}>{dn}</option>
          ))}
        </Select>
      </label>

      <div className="flex items-center justify-between gap-2 text-[11px]">
        <span className="text-slate-600">Montagem</span>
        <div className="dc-acc-seg" role="group" aria-label="Montagem do armário do contador">
          <button type="button" disabled={locked} aria-pressed={!wallMounted} className={!wallMounted ? 'is-on' : ''} onClick={() => setComponentState(c.id, { mounting: 'floor' })}>No chão</button>
          <button type="button" disabled={locked} aria-pressed={wallMounted} className={wallMounted ? 'is-on' : ''} onClick={() => setComponentState(c.id, { mounting: 'wall' })}>Fixo na parede</button>
        </div>
      </div>
      <p className="text-[9.5px] leading-snug text-slate-500">
        {wallMounted ? 'Na parede: Shift + arrastar ajusta a altura; arrastar sem Shift desliza no plano horizontal.' : 'No chão: no ambiente fabril o armário assenta no pavimento e desliza pelo chão ao arrastar.'}
      </p>

      <label className="flex items-center justify-between gap-2 text-[11px]">
        <span className="text-slate-600">Rede pública com pressão</span>
        <input
          type="checkbox"
          disabled={locked}
          checked={mainsOn}
          onChange={(e) => apply({ mainsSupplyOn: e.target.checked })}
        />
      </label>
      <p className="text-[9.5px] leading-snug text-slate-500">
        Ligue a saída hidráulica <strong>OUT</strong> (à direita) a bombas, válvulas ou reservatórios. Na caixa de derivação interna cada condutor do contador ZJLCD-BT01 (+24V / PULSE / GND) fica no seu próprio <strong>WAGO 221-2411</strong> (1-1), com o cabo de saída pelo topo do armário.
      </p>
    </div>
  )
}

function TriProofLedControls({ c, locked }: { c: ElectricalComponent; locked: boolean }) {
  const simActive = useSimStore((s) => s.sim.runState === 'running')
  const setComponentState = useSimStore((s) => s.setComponentState)
  const operateComponent = useSimStore((s) => s.operateComponent)
  const apply = (patch: Record<string, any>) => {
    if (simActive) operateComponent(c.id, patch)
    else setComponentState(c.id, patch)
  }
  const on = Boolean(c.state.on || c.state.testOn)
  const wattage = Number(c.state.wattage ?? 40)
  const cctK = Number(c.state.cctK ?? 4000)
  const linkable = c.state.linkable !== false
  const lumens = Math.round(wattage * 130)

  return (
    <div className="flex flex-col gap-2" data-device-controls="tri-proof-led">
      <div className="flex items-center justify-between gap-1">
        <span className="dc-field-label">Tri-Proof LED IP65</span>
        <StatusBadge
          label={on ? `LIGADA · ${wattage}W · ${cctK}K` : `DESLIGADA · ${wattage}W`}
          tone={on ? 'ok' : 'neutral'}
        />
      </div>

      <button
        type="button"
        disabled={locked}
        onClick={() => apply({ testOn: !c.state.testOn })}
        className={`dc-btn text-[11px] justify-center ${c.state.testOn ? 'dc-btn-primary' : ''}`}
      >
        {c.state.testOn ? 'Desligar teste local' : 'Acender teste local (230V)'}
      </button>

      <div className="flex flex-col gap-1">
        <span className="text-[10.5px] text-slate-600 flex justify-between">
          <span>Potência selecionável (DIP)</span>
          <strong className="font-mono text-slate-800">{wattage} W · {lumens} lm</strong>
        </span>
        <div className="grid grid-cols-3 gap-1">
          {[18, 24, 36, 40, 50, 60].map((w) => (
            <button
              key={w}
              type="button"
              disabled={locked}
              onClick={() => apply({ wattage: w })}
              className={`dc-btn text-[10.5px] justify-center ${wattage === w ? 'dc-btn-primary' : ''}`}
            >
              {w}W
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-[10.5px] text-slate-600 flex justify-between">
          <span>Temperatura de cor (CCT)</span>
          <strong className="font-mono text-slate-800">{cctK} K</strong>
        </span>
        <div className="grid grid-cols-4 gap-1">
          {[
            { k: 3000, lbl: '3000K' },
            { k: 4000, lbl: '4000K' },
            { k: 5000, lbl: '5000K' },
            { k: 6500, lbl: '6500K' },
          ].map((opt) => (
            <button
              key={opt.k}
              type="button"
              disabled={locked}
              onClick={() => apply({ cctK: opt.k })}
              className={`dc-btn text-[10px] justify-center ${cctK === opt.k ? 'dc-btn-primary' : ''}`}
            >
              {opt.lbl}
            </button>
          ))}
        </div>
      </div>

      <label className="flex items-center justify-between gap-2 text-[11px]">
        <span className="text-slate-600">Linkable (passagem L/N/PE → OUT)</span>
        <input
          type="checkbox"
          disabled={locked}
          checked={linkable}
          onChange={(e) => apply({ linkable: e.target.checked })}
        />
      </label>
    </div>
  )
}

function ConduitAndClampControls({ c, locked }: { c: ElectricalComponent; locked: boolean }) {
  const setComponentState = useSimStore((s) => s.setComponentState)
  const addComponent = useSimStore((s) => s.addComponent)
  const updateComponent = useSimStore((s) => s.updateComponent)
  const selectComponents = useSimStore((s) => s.selectComponents)
  const apply = (patch: Record<string, any>) => setComponentState(c.id, patch)

  const dMm = Number(c.state.diameterMm ?? 25)
  const lMm = Number(c.state.lengthMm ?? 1000)
  const clampCount = Number(c.state.clampCount ?? (c.type === 'conduitVdsElbow90' ? 0 : 2))
  const clampStyle = String(c.state.clampStyle ?? 'pvc-clip')
  const clampRollDeg = (((Number(c.state.clampRollDeg ?? 0) || 0) % 360) + 360) % 360
  const isTube = c.type === 'conduitVdsStraight' || c.type === 'conduitCorrugated'
  const isVds = c.type === 'conduitVdsStraight' || c.type === 'conduitVdsElbow90'
  const curOri = c.viewOrientation ?? { x: 0, y: 0, z: 0 }

  const setOri = (next: { x: number; y: number; z: number }) =>
    updateComponent(c.id, { viewOrientation: next })
  const bumpOri = (axis: 'x' | 'y' | 'z', delta = 90) => {
    const nextVal = (((curOri[axis] + delta) % 360) + 360) % 360
    const wrapped = nextVal > 180 ? nextVal - 360 : nextVal
    setOri({ ...curOri, [axis]: wrapped })
  }

  const quickAddNext = (nextType: 'conduitVdsStraight' | 'conduitVdsElbow90' | 'conduitCorrugated') => {
    const newId = addComponent(nextType, (c.schematicX ?? 400) + 120, c.schematicY ?? 260)
    if (!newId) return
    const curPos = c.panel3DPosition ?? { x: 0, y: 1.5, z: 1.0 }
    const stepX = ((c.type === 'conduitVdsStraight' || c.type === 'conduitCorrugated' ? lMm : dMm * 5) * 0.5 + 500) * 0.01
    setComponentState(newId, { diameterMm: dMm, clampStyle, autoCouplers: true })
    updateComponent(newId, { panel3DPosition: { x: curPos.x + stepX, y: curPos.y, z: curPos.z } })
    selectComponents([newId])
  }

  return (
    <div className="flex flex-col gap-2" data-device-controls="conduit-vds-clamps">
      <div className="flex items-center justify-between gap-1">
        <span className="dc-field-label">
          {c.type === 'conduitVdsStraight'
            ? 'Tubo VDS Rígido PVC'
            : c.type === 'conduitVdsElbow90'
              ? 'Curva VDS 90°'
              : c.type === 'conduitCorrugated'
                ? 'Tubo Corrugado Flexível'
                : 'Abraçadeira de Tubo'}
        </span>
        <StatusBadge label={`Ø${dMm} mm`} tone="ok" />
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-[10.5px] text-slate-600">Diâmetro nominal (mm)</span>
        <div className="grid grid-cols-6 gap-1">
          {[16, 20, 25, 32, 40, 50].map((d) => (
            <button
              key={d}
              type="button"
              disabled={locked}
              onClick={() => apply({ diameterMm: d, serigraphy: `VDS PVC-U Ø${d}mm · EN 61386-21 · 750N · IP65` })}
              className={`dc-btn text-[10px] justify-center !px-1 ${dMm === d ? 'dc-btn-primary' : ''}`}
            >
              {d}
            </button>
          ))}
        </div>
      </div>

      {isTube && (
        <label className="flex flex-col gap-0.5 text-[11px]">
          <span className="flex justify-between text-slate-600">
            <span>Comprimento</span>
            <strong className="font-mono text-slate-800">{lMm} mm</strong>
          </span>
          <input
            type="range"
            min={250}
            max={3000}
            step={50}
            disabled={locked}
            value={lMm}
            onChange={(e) => apply({ lengthMm: Number(e.target.value) })}
          />
        </label>
      )}

      {isVds && (
        <div className="rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] text-emerald-800">
          <strong>Encaixes automáticos ativos:</strong> bolsas/uniões VDS aparecem automaticamente nas pontas. Basta escolher quantas abraçadeiras pretende.
        </div>
      )}

      {(isTube || c.type === 'conduitVdsElbow90') && (
        <>
          <label className="flex flex-col gap-0.5 text-[11px]">
            <span className="flex justify-between text-slate-600">
              <span>Nº de abraçadeiras no tubo</span>
              <strong className="font-mono text-slate-800">{clampCount}</strong>
            </span>
            <input
              type="range"
              min={0}
              max={10}
              step={1}
              disabled={locked}
              value={clampCount}
              onChange={(e) => apply({ clampCount: Number(e.target.value) })}
            />
          </label>
          {clampCount > 0 && (
            <label className="flex flex-col gap-1 text-[11px]">
              <span className="text-slate-600">Tipo de abraçadeira</span>
              <Select
                className="dc-input !h-7 !text-[11px]"
                disabled={locked}
                value={clampStyle}
                onChange={(e) => apply({ clampStyle: e.target.value })}
              >
                <option value="pvc-clip">Clip PVC VDS (encaixe rápido)</option>
                <option value="metal-epdm">Metálica galvanizada c/ borracha EPDM</option>
                <option value="metal-screw">Metálica simples c/ espigão roscado</option>
              </Select>
            </label>
          )}
        </>
      )}

      {/* Rotação 3D do tubo & escolha do lado da abraçadeira (parede/teto/chão/frente/esquerda/direita) */}
      <div className="flex flex-col gap-1.5 rounded-md border border-slate-200 bg-slate-50 p-2 text-[10.5px]" data-conduit-rotation-controls>
        <div className="flex items-center justify-between">
          <span className="font-semibold text-slate-700">Orientação 3D &amp; lado da abraçadeira</span>
          <span className="font-mono text-[10px] text-slate-500">{Math.round(clampRollDeg)}°</span>
        </div>

        <div className="grid grid-cols-3 gap-1">
          <button
            type="button"
            disabled={locked}
            onClick={() => setOri({ x: 0, y: 0, z: 0 })}
            className={`dc-btn text-[10px] justify-center !px-1 ${curOri.y === 0 && curOri.z === 0 ? 'dc-btn-primary' : ''}`}
          >
            Horizontal
          </button>
          <button
            type="button"
            disabled={locked}
            onClick={() => setOri({ x: 0, y: 0, z: 90 })}
            className={`dc-btn text-[10px] justify-center !px-1 ${Math.abs(curOri.z) === 90 && curOri.y === 0 ? 'dc-btn-primary' : ''}`}
          >
            Vertical
          </button>
          <button
            type="button"
            disabled={locked}
            onClick={() => setOri({ x: 0, y: 90, z: 0 })}
            className={`dc-btn text-[10px] justify-center !px-1 ${Math.abs(curOri.y) === 90 && curOri.z === 0 ? 'dc-btn-primary' : ''}`}
          >
            Frente/Trás
          </button>
        </div>

        <div className="grid grid-cols-3 gap-1">
          <button type="button" disabled={locked} onClick={() => bumpOri('x', 90)} className="dc-btn text-[10px] justify-center !px-1">
            Rodar X +90°
          </button>
          <button type="button" disabled={locked} onClick={() => bumpOri('y', 90)} className="dc-btn text-[10px] justify-center !px-1">
            Rodar Y +90°
          </button>
          <button type="button" disabled={locked} onClick={() => bumpOri('z', 90)} className="dc-btn text-[10px] justify-center !px-1">
            Rodar Z +90°
          </button>
        </div>

        {(clampCount > 0 || !isTube) && (
          <>
            <span className="text-[10px] text-slate-600 pt-0.5">Lado onde fica a abraçadeira</span>
            <div className="grid grid-cols-4 gap-1">
              {[
                { deg: 90, lbl: 'Parede' },
                { deg: 0, lbl: 'Baixo' },
                { deg: 180, lbl: 'Cima' },
                { deg: 270, lbl: 'Frente' },
              ].map((p) => (
                <button
                  key={p.deg}
                  type="button"
                  disabled={locked}
                  onClick={() => apply({ clampRollDeg: p.deg })}
                  className={`dc-btn text-[9.5px] justify-center !px-1 ${Math.round(clampRollDeg) === p.deg ? 'dc-btn-primary' : ''}`}
                >
                  {p.lbl}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1.5">
              <input
                type="range"
                min={0}
                max={345}
                step={15}
                disabled={locked}
                value={clampRollDeg}
                onChange={(e) => apply({ clampRollDeg: Number(e.target.value) })}
                className="flex-1"
              />
              <button
                type="button"
                disabled={locked}
                onClick={() => apply({ clampRollDeg: (clampRollDeg + 90) % 360 })}
                className="dc-btn text-[9.5px] !px-1.5 !h-6"
                title="Rodar abraçadeira 90° à volta do tubo"
              >
                +90°
              </button>
            </div>
          </>
        )}
      </div>

      {c.type === 'conduitCorrugated' && (
        <>
          <label className="flex flex-col gap-0.5 text-[11px]">
            <span className="flex justify-between text-slate-600">
              <span>Curvatura flexível</span>
              <strong className="font-mono text-slate-800">{Number(c.state.bendAngleDeg ?? 0)}°</strong>
            </span>
            <input
              type="range"
              min={0}
              max={180}
              step={15}
              disabled={locked}
              value={Number(c.state.bendAngleDeg ?? 0)}
              onChange={(e) => apply({ bendAngleDeg: Number(e.target.value) })}
            />
          </label>
          <div className="flex items-center justify-between gap-2 text-[11px]">
            <span className="text-slate-600">Cor do corrugado</span>
            <div className="flex gap-1">
              {[
                { c: '#1b1f25', lbl: 'Preto' },
                { c: '#7c8590', lbl: 'Cinza' },
                { c: '#ea580c', lbl: 'Laranja' },
              ].map((sw) => (
                <button
                  key={sw.c}
                  type="button"
                  disabled={locked}
                  onClick={() => apply({ color: sw.c })}
                  className={`dc-btn text-[10px] !px-1.5 ${String(c.state.color ?? '#1b1f25') === sw.c ? 'dc-btn-primary' : ''}`}
                >
                  {sw.lbl}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {isVds && (
        <div className="grid grid-cols-2 gap-1 pt-1">
          <button type="button" disabled={locked} onClick={() => quickAddNext('conduitVdsStraight')} className="dc-btn text-[10px] justify-center">
            + Acoplar Tubo VDS
          </button>
          <button type="button" disabled={locked} onClick={() => quickAddNext('conduitVdsElbow90')} className="dc-btn text-[10px] justify-center">
            + Acoplar Curva 90°
          </button>
        </div>
      )}
    </div>
  )
}

function EditableCableControls({ c, locked }: { c: ElectricalComponent; locked: boolean }) {
  const setComponentState = useSimStore((s) => s.setComponentState)
  const allComponents = useSimStore((s) => s.components)
  const apply = (patch: Record<string, any>) => setComponentState(c.id, patch)
  const isFloat = c.type === 'floatSwitch'
  const isTriProof = c.type === 'triProofLedBatten'
  const enabled = isFloat ? true : isTriProof ? c.state.cableEnabled !== false : c.state.cableEnabled === true
  const lengthMm = Number(c.state.cableLengthMm ?? (isTriProof ? 650 : 480))
  const diamMm = Number(c.state.cableDiameterMm ?? 8.5)
  const exitDir = String(c.state.cableExitDir ?? (isTriProof ? 'right' : 'bottom'))
  const color = String(c.state.cableColor ?? '#18181b')
  const linkedBoxId = typeof c.state.linkedJunctionBoxId === 'string' ? c.state.linkedJunctionBoxId : ''
  const waypoints = Array.isArray(c.state.cableWaypointsMm) ? (c.state.cableWaypointsMm as Array<{ x: number; y: number; z: number }>) : []
  const oboBoxes = allComponents.filter((other) => other.id !== c.id && isJunctionBoxType(other.type))

  const addCurvePoint = () => {
    const last = waypoints[waypoints.length - 1] ?? { x: 120, y: -120, z: 40 }
    apply({ cableWaypointsMm: [...waypoints, { x: last.x + 120, y: last.y - 80, z: last.z }] })
  }
  const resetCurve = () => {
    apply({ cableWaypointsMm: [], cableBendXMm: 0, cableBendYMm: 0, cableBendZMm: 0, cableEndXMm: 0, cableEndYMm: 0, cableEndZMm: 0 })
  }

  return (
    <div className="mt-2 flex flex-col gap-1.5 rounded-md border border-slate-200 bg-slate-50 p-2 text-[11px]" data-editable-cable-controls>
      <div className="flex items-center justify-between gap-1">
        <span className="text-[10.5px] font-semibold text-slate-700">Cabo de ligação editável (3D)</span>
        {!isFloat && (
          <input
            type="checkbox"
            disabled={locked}
            checked={enabled}
            onChange={(e) => apply({ cableEnabled: e.target.checked })}
          />
        )}
      </div>

      {enabled && (
        <>
          <div className="rounded border border-sky-200 bg-sky-50 px-1.5 py-1 text-[9.5px] text-sky-900">
            <strong>Edição direta em 3D:</strong> clique no cabo para o selecionar, arraste as bolas <strong>azuis</strong> (curvas) ou <strong>verde</strong> (ponta/encaixe em caixa OBO), clique nos pontos <strong>+</strong> para criar curvas ou duplo-clique para remover.
          </div>

          {/* Ligar o cabo diretamente dentro de qualquer caixa de derivação OBO (com WAGO 221-2411 interiores) */}
          <label className="flex items-center justify-between gap-2 text-[10.5px]">
            <span className="text-slate-600">Ligar em caixa OBO</span>
            <Select
              className="dc-input !h-6 !text-[10px] !w-36"
              disabled={locked}
              value={linkedBoxId}
              onChange={(e) => apply({ linkedJunctionBoxId: e.target.value })}
            >
              <option value="">Solto (ponta livre)</option>
              {oboBoxes.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.ref} · {b.type === 'junctionBoxOboT60' ? 'OBO T60' : b.type === 'junctionBoxOboA6' ? 'OBO A6' : 'OBO T25'}
                </option>
              ))}
            </Select>
          </label>
          {!isFloat && (
            <>
              <label className="flex items-center justify-between gap-2 text-[10.5px]">
                <span className="text-slate-600">Saída do cabo</span>
                <Select
                  className="dc-input !h-6 !text-[10.5px] !w-28"
                  disabled={locked}
                  value={exitDir}
                  onChange={(e) => apply({ cableExitDir: e.target.value })}
                >
                  <option value="bottom">Por baixo</option>
                  <option value="top">Por cima</option>
                  <option value="left">Esquerda</option>
                  <option value="right">Direita</option>
                  <option value="back">Trás</option>
                </Select>
              </label>

              <label className="flex flex-col gap-0.5 text-[10.5px]">
                <span className="flex justify-between text-slate-600">
                  <span>Comprimento</span>
                  <strong className="font-mono text-slate-800">{lengthMm} mm</strong>
                </span>
                <input
                  type="range"
                  min={150}
                  max={2500}
                  step={50}
                  disabled={locked}
                  value={lengthMm}
                  onChange={(e) => apply({ cableLengthMm: Number(e.target.value) })}
                />
              </label>
            </>
          )}

          <label className="flex flex-col gap-0.5 text-[10.5px]">
            <span className="flex justify-between text-slate-600">
              <span>Espessura do cabo</span>
              <strong className="font-mono text-slate-800">Ø{diamMm.toFixed(1)} mm</strong>
            </span>
            <input
              type="range"
              min={5}
              max={16}
              step={0.5}
              disabled={locked}
              value={diamMm}
              onChange={(e) => apply({ cableDiameterMm: Number(e.target.value) })}
            />
          </label>

          <div className="flex items-center justify-between gap-1 text-[10.5px]">
            <span className="text-slate-600">Bainha</span>
            <div className="flex gap-1">
              {[
                { hex: '#18181b', lbl: 'Preto' },
                { hex: '#64748b', lbl: 'Cinza' },
                { hex: '#2563eb', lbl: 'Azul' },
                { hex: '#ea580c', lbl: 'Laranja' },
              ].map((sw) => (
                <button
                  key={sw.hex}
                  type="button"
                  disabled={locked}
                  onClick={() => apply({ cableColor: sw.hex })}
                  className={`dc-btn text-[9.5px] !px-1.5 !h-6 ${color === sw.hex ? 'dc-btn-primary' : ''}`}
                >
                  {sw.lbl}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-1 text-[10px]">
            <label className="flex flex-col gap-0.5">
              <span className="text-slate-500">Curva X</span>
              <input
                type="number"
                step={25}
                className="dc-input !h-6 !text-[10px]"
                disabled={locked}
                value={Number(c.state.cableBendXMm ?? 0)}
                onChange={(e) => apply({ cableBendXMm: Number(e.target.value) || 0 })}
              />
            </label>
            <label className="flex flex-col gap-0.5">
              <span className="text-slate-500">Curva Y</span>
              <input
                type="number"
                step={25}
                className="dc-input !h-6 !text-[10px]"
                disabled={locked}
                value={Number(c.state.cableBendYMm ?? 0)}
                onChange={(e) => apply({ cableBendYMm: Number(e.target.value) || 0 })}
              />
            </label>
            <label className="flex flex-col gap-0.5">
              <span className="text-slate-500">Curva Z</span>
              <input
                type="number"
                step={25}
                className="dc-input !h-6 !text-[10px]"
                disabled={locked}
                value={Number(c.state.cableBendZMm ?? 0)}
                onChange={(e) => apply({ cableBendZMm: Number(e.target.value) || 0 })}
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-1 pt-0.5">
            <button type="button" disabled={locked} onClick={addCurvePoint} className="dc-btn text-[10px] justify-center !h-6">
              + Ponto de curva ({waypoints.length})
            </button>
            <button type="button" disabled={locked} onClick={resetCurve} className="dc-btn text-[10px] justify-center !h-6">
              Repor curva
            </button>
          </div>

          {!isFloat && (
            <label className="flex items-center justify-between gap-2 text-[10.5px]">
              <span className="text-slate-600">Proteger com tubo corrugado</span>
              <input
                type="checkbox"
                disabled={locked}
                checked={c.state.cableCorrugated === true}
                onChange={(e) => apply({ cableCorrugated: e.target.checked })}
              />
            </label>
          )}
        </>
      )}
    </div>
  )
}

function FreeSpacePosition3DControls({ c, locked }: { c: ElectricalComponent; locked: boolean }) {
  const updateComponent = useSimStore((s) => s.updateComponent)
  const allowOutsideFactory = useSimStore((s) => s.allowOutsideFactory)
  const setAllowOutsideFactory = useSimStore((s) => s.setAllowOutsideFactory)
  const isFloor = isFloorStandingComponent(c)
  const cur = c.panel3DPosition ?? {
    x: ((c.schematicX ?? 420) - 420) * 0.02,
    y: -((c.schematicY ?? 260) - 260) * 0.02,
    z: isFloor ? 3.2 : 1.6,
  }
  const setAxis = (axis: 'x' | 'y' | 'z', val: number) => {
    const next = { ...cur, [axis]: Math.round(val * 20) / 20 }
    updateComponent(c.id, { panel3DPosition: next })
  }
  return (
    <div className="mt-2 flex flex-col gap-1.5 rounded-md border border-slate-200 bg-slate-50 p-2 text-[11px]" data-free-3d-position-controls>
      <div className="flex items-center justify-between gap-1">
        <span className="text-[10.5px] font-semibold text-slate-700">Posição no espaço 3D</span>
        <span className="font-mono text-[10px] text-slate-500">Z: {(cur.z * 0.4).toFixed(2)} m</span>
      </div>
      <label className="flex flex-col gap-0.5">
        <span className="flex items-center justify-between text-[10.5px] text-slate-600">
          <span>Afastar do quadro (Z)</span>
          <strong className="font-mono text-slate-800">{cur.z.toFixed(2)}</strong>
        </span>
        <input
          type="range"
          min={0.2}
          max={26}
          step={0.1}
          disabled={locked}
          value={cur.z}
          onChange={(e) => setAxis('z', Number(e.target.value))}
        />
      </label>
      <div className="grid grid-cols-2 gap-1">
        <button
          type="button"
          disabled={locked}
          onClick={() => setAxis('z', Math.max(0.2, cur.z - 1.5))}
          className="dc-btn text-[10px] justify-center"
        >
          ← Aproximar
        </button>
        <button
          type="button"
          disabled={locked}
          onClick={() => setAxis('z', Math.min(26, cur.z + 1.5))}
          className="dc-btn text-[10px] justify-center"
        >
          Afastar →
        </button>
      </div>
      {!isFloor && (
        <label className="flex flex-col gap-0.5">
          <span className="flex items-center justify-between text-[10.5px] text-slate-600">
            <span>Altura vertical (Y)</span>
            <strong className="font-mono text-slate-800">{cur.y.toFixed(2)}</strong>
          </span>
          <input
            type="range"
            min={-8}
            max={12}
            step={0.1}
            disabled={locked}
            value={cur.y}
            onChange={(e) => setAxis('y', Number(e.target.value))}
          />
        </label>
      )}
      <p className="text-[9.5px] leading-snug text-slate-500">
        Arraste no 3D para mover livremente no pavimento (X/Z). Segure <strong>Shift</strong> ao arrastar para ajustar a altura (Y).
      </p>
      <label className="mt-1 flex items-center justify-between gap-2 border-t border-slate-200 pt-1.5 text-[10.5px]">
        <span className="text-slate-700 font-medium">Permitir sair dos limites do pavilhão</span>
        <input
          type="checkbox"
          checked={allowOutsideFactory}
          onChange={(e) => setAllowOutsideFactory(e.target.checked)}
        />
      </label>
    </div>
  )
}

function SocketControls({c,locked}:{c:ElectricalComponent;locked:boolean}) {
  const setState=useSimStore(s=>s.setComponentState),operate=useSimStore(s=>s.operateComponent),allowed=useManobraAllowed()
  if(!isSocketDevice(c.type))return null
  const spec=SOCKET_DEVICES[c.type]
  const toggle=(key:string)=><button type="button" className="dc-btn text-[11px]" disabled={locked} aria-pressed={Boolean(c.state[key]??c.state.coverOpen)} onClick={()=>setState(c.id,{[key]:!(c.state[key]??c.state.coverOpen)})}>{(c.state[key]??c.state.coverOpen)?'Fechar':'Abrir'} {key==='blueCoverOpen'?'tampa azul':key==='redCoverOpen'?'tampa vermelha':'tampa da tomada'}</button>
  return <div className="flex flex-col gap-2" data-socket-controls={c.type}>
    <strong>{spec.brand} · {spec.reference}</strong>
    {c.type==='socketEfapelIp65'?toggle('coverOpen'):toggle('blueCoverOpen')}
    {c.type==='socketFamatelCombo'&&toggle('redCoverOpen')}
    <button type="button" className="dc-btn text-[11px]" disabled={locked} aria-pressed={Boolean(c.state.serviceOpen)} onClick={()=>setState(c.id,{serviceOpen:!c.state.serviceOpen})}>{c.state.serviceOpen?'Repor tampa de serviço':'Aceder à cablagem'}</button>
    {c.type==='socketFamatelSwitch'&&<button type="button" className="dc-btn text-[11px]" disabled={locked||!allowed} title={allowed?'Seccionar L e N; PE mantém continuidade':MANOBRA_BLOCKED_TITLE} aria-pressed={c.state.switchOn!==false} onClick={()=>operate(c.id,{switchOn:c.state.switchOn===false})}>Seccionador · {c.state.switchOn===false?'0 — desligado':'I — ligado'}</button>}
  </div>
}

export default function DeviceControls({ component: c, disabled = false }: { component: ElectricalComponent; disabled?: boolean }) {
  const locked = disabled || !!c.locked
  const free3DExtra = !isPanelBound(c) ? <FreeSpacePosition3DControls c={c} locked={locked} /> : null
  const editableCableExtra = isEditableCableDeviceType(c.type) ? <EditableCableControls c={c} locked={locked} /> : null
  const wrap = (node: React.ReactNode) => (
    <>
      {node}
      {editableCableExtra}
      {free3DExtra}
    </>
  )
  if (isSocketDevice(c.type)) return wrap(<SocketControls c={c} locked={locked} />)
  if (isMechatronicsType(c.type)) return wrap(<MechatronicsControls c={c} locked={locked} />)
  if (industrialDeviceTypeOf(c)) return wrap(<IndustrialDeviceControls component={c} disabled={locked} />)
  if (c.type === 'triProofLedBatten') return wrap(<TriProofLedControls c={c} locked={locked} />)
  if (isLightingType(c.type)) return wrap(<LightingControls c={c} locked={locked} />)
  if (c.type === 'waterSupplyBox') return wrap(<WaterSupplyBoxControls c={c} locked={locked} />)
  if (isHydraulicComponentType(c.type)) return wrap(<HydraulicControls c={c} locked={locked} />)
  if (isPneumaticComponentType(c.type)) return wrap(<PneumaticControls c={c} locked={locked} />)
  if (isConduitStructureType(c.type)) return wrap(<ConduitAndClampControls c={c} locked={locked} />)
  if (isStructureComponentType(c.type)) return wrap(<StructureControls c={c} locked={locked} />)
  if (isConveyorComponentType(c.type)) return wrap(<ConveyorControls c={c} locked={locked} />)
  if (isJunctionOrWagoType(c.type)) return wrap(<JunctionAndWagoControls c={c} locked={locked} />)
  if (c.type === 'multimeterDm20') return wrap(<MultimeterControls c={c} locked={locked} />)
  if (
    c.type === 'powerSource3ph' ||
    c.type === 'powerSource1ph' ||
    c.type === 'powerSource24v' ||
    c.type === 'powerSupply' ||
    c.type === 'powerSupplyProauto24A'
  ) {
    return wrap(<PowerControls c={c} locked={locked} />)
  }
  if (isContactorLike(c.type)) return wrap(<ContactorControls c={c} locked={locked} />)
  if (isPlcModule(c.type)) return wrap(<PlcModuleControls c={c} locked={locked} />)
  if (
    [
      'selectorSchneiderXa2ed33',
      'keyActuatorEao61',
      'emergencyButton',
      'emergencyButtonKeyP20ACR',
      'dualPushButtonNpb22D11',
      'safetyRelaySiemens3tk2840',
      'safetyRelay',
    ].includes(c.type)
  ) {
    return wrap(<CommandAndSafetyControls c={c} locked={locked} />)
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
    return wrap(<SensorAndLightControls c={c} locked={locked} />)
  }
  if (c.type === 'motor3ph' || c.type === 'motor1ph' || c.type === 'capacitorRun60uF') {
    return wrap(<MotorAndCapacitorControls c={c} locked={locked} />)
  }
  return free3DExtra
}
