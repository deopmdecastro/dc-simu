import ComponentDecalControls from './ComponentDecalControls'
import InspectorNumberInput from '../ui/InspectorNumberInput'
import { uiConfirm } from '../ui/dialogs'
import { importedComponentInfo } from '../electrical/importedComponents'
import Select from '../ui/Select'
import CatalogInspector from '../catalog/CatalogInspector'
import SidePanelHeader from './SidePanelHeader'
import { builtinOriginType, useCatalogStore } from '../catalog/registry'
import { isTerminalAssemblyComponent, TERMINAL_ASSEMBLY_COVER_SEED } from '../three/terminalAssembly'
import { hiddenCatalogTypes } from '../catalog/hidden'
import { parseCatalogType } from '../catalog/types'
import PlcSignalPanel from './PlcSignalPanel'
import ThermalRelayControls from './ThermalRelayControls'
import RelaySocketControls from './RelaySocketControls'
import { isPlugInRelay, isRelaySocket } from '../three/relaySocketMount'
import ProtectionControls from './ProtectionControls'
import DeviceControls, { DEVICE_MANAGED_STATE_KEYS, hasDeviceControls } from './DeviceControls'
import { TERMINAL_STRIP_STATE_KEYS, isTerminalStripType, terminalStripFor } from '../electrical/pti6Strip'
import { PROTECTION_MANAGED_STATE_KEYS, protectionControlKindOf } from '../electrical/protectionSpecs'
import {
  IEC_DIGIT_MARKER_PALETTE,
  QUICK_LETTER_TOKENS,
  WIRE_MARKER_STYLE_LABEL,
  expandWireMarkerRings,
  resolveWireMarkerStyle,
  type WireMarkerStyle,
} from '../electrical/wireMarkers'
import { isProgrammablePlc } from '../ladder/plcPrograms'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import TerminalLibrary from './TerminalLibrary'
import { useSimStore } from '../store/useSimStore'
import { useManobraAllowed } from '../store/useManobraAllowed'
import { MANOBRA_BLOCKED_TITLE, MANOBRA_STATE_KEYS } from '../store/manobra'
import { blockedDuplicateReplacement } from '../catalog/blockedDuplicates'
import { disabledReason, useComponentSettings } from '../admin/componentSettings'
import { paletteGroups, TEMPLATES } from '../electrical/factory'
import { iecAssociationOf, iecPrimaryLabel, iecRelatedLabels } from '../electrical/iecAssociation'
import type { ComponentType, TerminalElectricalClass, TerminalKind, TerminalType, Wire, WireColor, WireRoute } from '../types'
import { TERMINAL_KIND_LABEL, TERMINAL_TYPE_LABEL, WIRE_COLORS, WIRE_KIND_LABEL } from '../schematic/symbols'
import { terminalClassesCompatible, terminalDatasheetGuidance, terminalElectricalClassOf, TERMINAL_ELECTRICAL_CLASS_LABEL } from '../electrical/terminalClassification'
import LabelLibrary from './LabelLibrary'
import PanelStickerPicker from './PanelStickerPicker'
import DatasheetPanel from './DatasheetPanel'
import { terminalConnections } from '../schematic/terminalConnections'
import { dinFerruleColor, FERRULE_SWATCHES, wireEndColor } from '../schematic/wireEndColor'
import { WIRE_END_OPTIONS, WireEndIcon, ConductorIcon } from '../schematic/wireEnds'
import { polylineLength, wireGeometryForWire } from '../schematic/wireGeometry'
import { WIRE_KIND_COLOR } from '../store/useSimStore'
import { ComponentThumb } from '../three/componentThumbnails'
import { componentTerminalLocal } from '../schematic/componentTerminalViews'
import { canInsertComponent3D, isMountingRail, MISSING_3D_MODEL_MESSAGE, SCHEMATIC_PX_PER_MM } from '../three/modelPaths'
import { clampRailLengthMm, DIN_RAIL_15X55, dinRailProfileOf, railSlotCount } from '../three/dinRailGeometry'
import { CableDuctControls, DinRailProfileControls, EnclosureControls, SpiralWrapControls, PANEL_ACCESSORY_STATE_KEYS, RAIL_PROFILE_STATE_KEYS } from './PanelAccessoryControls'
import { isPanelAccessoryType } from '../three/enclosureParts'
import { isRailMountable } from '../three/railMount'
import { componentEditorVersionOf, formatComponentUpdateDate } from '../three/componentRevisions'
import TerminalStripControls from './TerminalStripControls'
import BusbarControls, { BUSBAR_STATE_KEYS } from './BusbarControls'
import { isRealBusbarType } from '../three/busbarParts'
import { IconSearch, IconLayers, IconPlus, IconCopy, IconLock, IconUnlock, IconRotate, IconReset, IconDelete, IconChevronDown, IconProjects, IconCube, IconClose, IconCheck, IconEye, IconEyeOff, IconStar, IconCommands, IconTag, IconWarning, IconDanger, IconBackspace, IconHistory, IconArrowUp, IconArrowDown, IconArrowRight } from '../ui/icons'
import { CableAccessoryMap, CableSpecimen, WIRE_COLOR_ORDER, WIRE_ROUTES_ORDER, WireOptionsFields, WireRouteGlyph } from '../ui/WireOptions'
import { HYDRAULIC_GAUGES, PNEUMATIC_GAUGES } from '../three/hydraulicsModel'
import {
  CABLE_PRESETS,
  WIRE_COLOR_LABEL,
  WIRE_END_LABEL,
  WIRE_GAUGES,
  WIRE_ROUTE_HINT,
  WIRE_ROUTE_LABEL,
  applyCablePreset,
  cableOuterDiameterMm,
  defaultCoreColors,
  matchCablePreset,
  wireAmpacityIecA,
  wireColorSwatchBg,
  wireMinBendRadiusMm,
} from '../admin/editor3d/wireStyle'
import { setWireActionSlot, setWireDraftSlot } from '../ui/wireActionSlot'
import { allLightSwatches, swatchBackground, useLightColorLibrary } from '../catalog/lightColorLibrary'
import { industrialDeviceTypeOf } from '../electrical/industrialDevices'
import { inspectorStatePolicy } from './inspectorStatePolicy'
import type { ElectricalComponent } from '../types'

const label = 'dc-field-label'
const STATE_LABELS: Record<string, string> = {
  resetRequested: 'Pedir rearme', position: 'Posição (−1 / 0 / 1)', no: 'Saída normalmente aberta', type: 'Tipo de saída', rangeA: 'Gama de corrente', code: 'Referência', sensmA: 'Corrente diferencial (mA)', failed: 'Falha', blown: 'Fusível fundido',
  closed: 'Fechado', tripped: 'Disparado', poles: 'Polos', curve: 'Curva', inA: 'Corrente nominal (A)',
  powered: 'Alimentado', powerReady: 'Saída pronta (RDY)', watt: 'Potência (W)', energized: 'Energizado', pressed: 'Premido', running: 'Em funcionamento', presetMs: 'Tempo definido (ms)',
  elapsedMs: 'Tempo decorrido (ms)', triggered: 'Ativado', on: 'Ligado', enabled: 'Ativo',
  manufacturer: 'Fabricante', model: 'Modelo', mounting: 'Forma construtiva', frame: 'Carcaça IEC', phases: 'Fases',
  powerKw: 'Potência nominal (kW)', cv: 'Potência (cv)', rpm: 'Rotação nominal (rpm)', rpmVisual: 'Rotação visual',
  frequencyHz: 'Frequência (Hz)', voltage: 'Tensão nominal', currentA: 'Corrente nominal (A)', cosPhi: 'Fator de potência (cos φ)',
  torqueNm: 'Binário nominal (Nm)', massKg: 'Massa (kg)', direction: 'Sentido de rotação',
  color: 'Cor da luz', lamp: 'Fonte luminosa', mountingDiameterMm: 'Furação do painel (mm)',
  currentMa: 'Corrente máxima (mA)', serviceLifeHours: 'Vida útil (h)', protection: 'Proteção',
  operatingTemperature: 'Temperatura de serviço', motorConnection: 'Pontes da caixa de bornes',
}
/** Sinaleiros nativos: a cor escolhe-se na biblioteca de cores de luzes (vidro + brilho). */
const SIGNAL_LAMP_TYPES = new Set([
  'pilotLightAd22',
  'pilotLightSchneiderIil1p',
  'pilotLightSchneiderIil3p',
  'ledGreen',
  'ledRed',
  'ledYellow',
  'ledWhite',
])

/** Cor de um sinaleiro: pares da biblioteca (anel = vidro, centro = brilho) + brilho e vidro à medida. */
function LightColorStateField({ color, glass, disabled, onChange }: {
  color: string
  glass?: string
  disabled?: boolean
  onChange: (patch: { color: string; glassColor?: string }) => void
}) {
  const custom = useLightColorLibrary((s) => s.custom)
  const library = allLightSwatches(custom)
  const [hexDraft, setHexDraft] = useState(color)
  useEffect(() => setHexDraft(color), [color])
  const valid = (hex: string) => /^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(hex)
  const normalize = (hex: string) => hex.length === 4 ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`.toLowerCase() : hex.toLowerCase()
  const resolvedGlow = valid(color) ? normalize(color) : '#ef4444'
  const current = library.find((item) => item.glow === resolvedGlow && (!glass || item.glass === glass.toLowerCase()))
  const applyGlow = (hex: string) => {
    if (disabled) return
    setHexDraft(hex)
    if (valid(hex)) onChange({ color: normalize(hex), glassColor: undefined })
  }
  return <div className="dc-color-field" data-light-color-field>
    <div className="dc-color-field-heading"><span>Cor da luz</span><span className="dc-color-field-current" title={`vidro ${glass ?? 'automático'} · brilho ${color}`}>{current?.name ?? color.toUpperCase()}</span></div>
    <div className="dc-color-swatches" role="group" aria-label="Biblioteca de cores de luzes">
      {library.map((item) => {
        const selected = item.glow === resolvedGlow && (!glass || glass.toLowerCase() === item.glass)
        return <button key={item.id} type="button" disabled={disabled} className={`dc-color-swatch${selected ? ' is-selected' : ''}`} style={{ background: swatchBackground(item.glass, item.glow) }}
          title={`${item.name} · vidro ${item.glass} · brilho ${item.glow}`} aria-label={item.name} aria-pressed={selected} onClick={() => onChange({ color: item.glow, glassColor: item.glass })} />
      })}
    </div>
    <label className="dc-color-hex-row"><span>Brilho</span><span className="dc-color-hex-input-wrap">
      <input type="color" className="dc-color-native" disabled={disabled} value={resolvedGlow} aria-label="Cor do brilho" onChange={(event) => applyGlow(event.target.value)} />
      <input className="dc-input dc-color-hex-input" type="text" disabled={disabled} value={hexDraft} maxLength={7} spellCheck={false}
        aria-label="Valor HEX da cor da luz" aria-invalid={!valid(hexDraft)} placeholder="#RRGGBB"
        onChange={(event) => applyGlow(event.target.value)} onBlur={() => { if (!valid(hexDraft)) setHexDraft(color) }} />
    </span></label>
    <label className="dc-color-hex-row"><span>Vidro</span><span className="dc-color-hex-input-wrap">
      <input type="color" className="dc-color-native" disabled={disabled} value={glass && valid(glass) ? normalize(glass) : resolvedGlow} aria-label="Cor do vidro" onChange={(event) => onChange({ color: resolvedGlow, glassColor: event.target.value })} />
      <code>{glass ?? 'automático'}</code></span></label>
  </div>
}
const EXTRA_STATE_LABELS: Record<string, string> = {
  pressed: 'Premido', latched: 'Encravamento', resetMethod: 'Método de rearme',
  mountingMm: 'Diâmetro de montagem (mm)', ithA: 'Corrente térmica Ith (A)',
  momentary: 'Retorno por mola', maintain: 'Posição mantida', startPressed: 'Botão START', stopPressed: 'Botão STOP',
  hold: 'Manter leitura', backlight: 'Iluminação do visor', relative: 'Modo relativo', selector: 'Posição do seletor',
  rampMs: 'Tempo de rampa (ms)', primaryV: 'Tensão primária (V)', secondaryV: 'Tensão secundária (V)',
  nominalV: 'Tensão nominal (V)', outV: 'Tensão de saída (V)', amp: 'Corrente de saída (A)',
  // Proteção e manobra
  testPressed: 'Botão TEST', manual: 'Rearme manual', ue: 'Tensão de emprego Ue', icn: 'Poder de corte Icn', norm: 'Norma',
  magnetic: 'Disparo magnético (A)', upKv: 'Nível de proteção Up (kV)', currentPct: 'Corrente (% da regulação)', rangeInA: 'Regulação (A)',
  ie: 'Corrente de emprego Ie (A)', coil: 'Bobina', dualChannel: 'Dois canais', supply: 'Alimentação', reset: 'Rearme',
  safetyCategory: 'Categoria de segurança', bypass: 'Contactor de bypass',
  // Sinalização, iluminação e sensores
  red: 'Lâmpada vermelha', yellow: 'Lâmpada amarela', green: 'Lâmpada verde', db: 'Nível sonoro (dB)',
  powerW: 'Potência (W)', cctK: 'Temperatura de cor (K)', socket: 'Casquilho', on1: 'Tecla 1', on2: 'Tecla 2',
  rangeM: 'Alcance (m)', actuator: 'Atuador', sensingMm: 'Distância de deteção (mm)', mode: 'Modo',
  bar: 'Pressão de ajuste (bar)', celsius: 'Temperatura de ajuste (°C)', level: 'Nível',
  // Temporizadores e contadores
  done: 'Concluído', offDelay: 'Atraso à desoperação', starDone: 'Estrela concluída', deltaDone: 'Triângulo ativo',
  transitionMs: 'Tempo de transição (ms)', count: 'Contagem', preset: 'Valor de pré-seleção',
  // Motores, condensadores, variadores, fontes e medida
  capacitanceUf: 'Capacidade (µF)', tolerancePct: 'Tolerância (%)', voltageVac: 'Tensão (V CA)', temperatureClass: 'Classe de temperatura',
  presetHz: 'Frequência definida (Hz)', rampUpMs: 'Rampa de aceleração (ms)', va: 'Potência (VA)', rippleMv: 'Ondulação (mV)',
  reading: 'Leitura', scaleInA: 'Escala (A)',
  // Controladores
  outputType: 'Tipo de saídas', programCapacity: 'Capacidade de programa', channels: 'Canais', reference: 'Referência',
  ledSF: 'LED SF (falha)', ledDIAG: 'LED DIAG', ledRUN: 'LED RUN', ledERROR: 'LED ERROR', ledMAINT: 'LED MAINT', displayOn: 'Visor ligado',
  ledBATF: 'LED BATF (bateria)', ledDC5V: 'LED 5 V DC', ledFRCE: 'LED FRCE (forçado)', ledSTOP: 'LED STOP',
  ethernetMbps: 'Ethernet (Mbit/s)', service: 'Serviço', screen: 'Ecrã',
  // Bornes e barras
  bridged: 'Pontes ligadas', connection: 'Ligação', sectionMm2: 'Secção nominal (mm²)', maxSectionMm2: 'Secção máxima (mm²)',
  nominalA: 'Corrente nominal (A)', article: 'Artigo', poleCount: 'Número de pólos', source: 'Fonte de alimentação',
  brand: 'Marca', rcdType: 'Tipo diferencial', frequency: 'Frequência (Hz)', powerFactor: 'Fator de potência',
  power: 'Potência (W)', energy: 'Energia (kWh)', temp: 'Temperatura (°C)', primaryA: 'Corrente primária (A)', secondaryA: 'Corrente secundária (A)',
  l1On: 'Fase L1 presente', l2On: 'Fase L2 presente', l3On: 'Fase L3 presente', phaseLoss: 'Falta de fase',
  vA: 'Tensão L1 (V)', vB: 'Tensão L2 (V)', vC: 'Tensão L3 (V)', iA: 'Corrente L1 (A)', iB: 'Corrente L2 (A)', iC: 'Corrente L3 (A)',
  pA: 'Potência L1 (W)', pB: 'Potência L2 (W)', pC: 'Potência L3 (W)',
}
const stateLabel = (key: string) => STATE_LABELS[key] ?? EXTRA_STATE_LABELS[key] ?? key.replace(/([a-z])([A-Z])/g, '$1 $2')

function inspectorStateEntries(component: ElectricalComponent) {
  const type = component.type
  const industrial = !!industrialDeviceTypeOf(component)
  const thermal = importedComponentInfo(type)?.behavior === 'thermal'
  const protection = !!protectionControlKindOf(type)
  const device = hasDeviceControls(type)
  return Object.entries(component.state).filter(([key]) => {
    if (industrial || key.startsWith('_')) return false
    if (isMountingRail(type) && (key === 'lengthMm' || RAIL_PROFILE_STATE_KEYS.has(key))) return false
    if (isPanelAccessoryType(type) && PANEL_ACCESSORY_STATE_KEYS.has(key)) return false
    if (isRealBusbarType(type) && BUSBAR_STATE_KEYS.has(key)) return false
    if (isTerminalStripType(type) && TERMINAL_STRIP_STATE_KEYS.has(key)) return false
    if (protection && (PROTECTION_MANAGED_STATE_KEYS.has(key) || DEVICE_MANAGED_STATE_KEYS.has(key))) return false
    if (device && DEVICE_MANAGED_STATE_KEYS.has(key)) return false
    if (['showFan', 'acrylicCover', 'hiddenParts', 'simInputs', 'simInputModes', 'glassColor'].includes(key)) return false
    if (thermal && ['testPressed', 'stopPressed', 'tripped', 'manual', 'manufacturer', 'code'].includes(key)) return false
    return true
  })
}

const BODY_COLOR_OPTIONS = [
  { name: 'Grafite', value: '#344054' }, { name: 'Antracite', value: '#1f2937' },
  { name: 'Cinza RAL 7035', value: '#cbd5e1' }, { name: 'Branco', value: '#f8fafc' },
  { name: 'Vermelho', value: '#dc2626' }, { name: 'Laranja', value: '#f97316' },
  { name: 'Amarelo', value: '#facc15' }, { name: 'Verde', value: '#16a34a' },
  { name: 'Azul', value: '#2563eb' }, { name: 'Azul escuro', value: '#1e3a8a' },
  { name: 'Ciano', value: '#0891b2' }, { name: 'Castanho', value: '#8b4513' },
] as const

const CABLE_DUCT_COLOR_OPTIONS = [
  { name: 'Cinzento RAL 7030 (padrão)', value: '#a9aca8' },
  { name: 'Cinza claro RAL 7035', value: '#cfd1cb' },
  { name: 'Azul (segurança intrínseca)', value: '#0072bb' },
  { name: 'Preto', value: '#262626' },
  { name: 'Branco', value: '#f8fafc' },
] as const

function ColorPaletteField({ value, options, ariaLabel, fieldLabel, isCustom, disabled, onChange, onReset }: {
  value: string
  options: readonly { name: string; value: string }[]
  ariaLabel: string
  fieldLabel: string
  isCustom?: boolean
  disabled?: boolean
  onChange: (value: string) => void
  onReset?: () => void
}) {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  const valid = /^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(draft)
  const activeCustom = isCustom ?? true
  const normalize = (hex: string) => hex.length === 4 ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`.toLowerCase() : hex.toLowerCase()
  const resolved = valid ? normalize(draft) : normalize(value)
  const apply = (hex: string) => {
    if (disabled) return
    setDraft(hex)
    if (/^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(hex)) onChange(normalize(hex))
  }

  return <div className="dc-color-field">
    <div className="dc-color-field-heading">
      <span>{fieldLabel}</span>
      <span className="dc-color-field-meta">
        {activeCustom ? (
          <>
            <span className="dc-color-field-current" title={value}>{value.toUpperCase()}</span>
            {onReset && (
              <button
                type="button"
                className="dc-color-reset"
                disabled={disabled}
                title="Repor cor original de fábrica"
                aria-label={`Repor ${ariaLabel} original`}
                onClick={onReset}
              >
                <IconReset size={10} /> Repor
              </button>
            )}
          </>
        ) : (
          <span className="dc-color-field-current" title="Cor original de fábrica">Original</span>
        )}
      </span>
    </div>
    <div className="dc-color-swatches" role="group" aria-label={`Cores predefinidas: ${ariaLabel}`}>
      {options.map((option) => <button key={option.value} type="button"
        disabled={disabled}
        className={`dc-color-swatch${activeCustom && value.toLowerCase() === option.value.toLowerCase() ? ' is-selected' : ''}`}
        style={{ backgroundColor: option.value }} title={`${option.name} (${option.value})`} aria-label={option.name}
        aria-pressed={activeCustom && value.toLowerCase() === option.value.toLowerCase()}
        onClick={() => apply(option.value)} />)}
    </div>
    <label className="dc-color-hex-row">
      <span>Cor personalizada</span>
      <span className="dc-color-hex-input-wrap">
        <input
          type="color"
          className="dc-color-native"
          value={resolved}
          disabled={disabled}
          aria-label={`Seletor de ${ariaLabel}`}
          title="Escolher qualquer cor"
          onChange={(event) => apply(event.target.value)}
        />
        <input className="dc-input dc-color-hex-input" type="text" value={draft} maxLength={7} spellCheck={false}
          disabled={disabled}
          aria-label={`Valor HEX de ${ariaLabel}`} aria-invalid={!valid} placeholder="#RRGGBB"
          onChange={(event) => apply(event.target.value)} onBlur={() => { if (!valid) setDraft(value) }} />
      </span>
    </label>
  </div>
}


/**
 * Controles de camada (ordem de empilhamento) — funcionam tanto para
 * componentes quanto para cabos, já que ambos compartilham o mesmo `z`.
 */
function LayerButtons() {
  const btn = 'dc-btn flex-1 !px-1'
  return (
    <div>
      <label className={label}>
        <IconLayers size={11} className="inline-block mr-1 -mt-0.5" />
        Camada (frente / trás)
      </label>
      <div className="flex gap-1">
        <button className={btn} title="Trazer para frente" onClick={() => useSimStore.getState().bringSelectionToFront()}><IconArrowUp size={11} /> Frente</button>
        <button className={btn} title="Avançar uma camada" onClick={() => useSimStore.getState().bringSelectionForward()}><IconArrowUp size={11} /></button>
        <button className={btn} title="Recuar uma camada" onClick={() => useSimStore.getState().sendSelectionBackward()}><IconArrowDown size={11} /></button>
        <button className={btn} title="Enviar para trás" onClick={() => useSimStore.getState().sendSelectionToBack()}><IconArrowDown size={11} /> Trás</button>
      </div>
    </div>
  )
}

/** Cartão reutilizado nas categorias, favoritos e histórico recente. */
function LibraryTile({ type, name, favorite, placing, onPick, onQuickAdd, onFavorite, onRecent }: {
  type: ComponentType; name: string; favorite: boolean; placing: boolean
  onPick: () => void; onQuickAdd: () => void; onFavorite: () => void; onRecent: () => void
}) {
  const disabledNote = useComponentSettings((s) => disabledReason(s.disabled, type))
  const available = canInsertComponent3D(type) && !disabledNote
  const touchStart = useRef<{ at: number; x: number; y: number; moved: boolean } | null>(null)
  const suppressClick = useRef(false)
  const lockMessage = disabledNote ?? MISSING_3D_MODEL_MESSAGE
  const title = available
    ? `${name} — clique para posicionar · duplo clique ou toque prolongado para inserir · arraste para o esquema`
    : `${name} — ${lockMessage}`
  return <div className={`dc-library-tile ${placing ? 'is-placing' : ''} ${available ? '' : 'is-locked'}`} title={title}>
    <button
      type="button"
      className="dc-library-tile-main"
      title={title}
      aria-label={available ? `Posicionar ${name} no esquema` : `${name}. ${lockMessage}`}
      aria-disabled={!available}
      disabled={!available}
      onClick={(event) => {
        if (suppressClick.current) { suppressClick.current = false; event.preventDefault(); return }
        if (available) { onRecent(); onPick() }
      }}
      onDoubleClick={() => { if (available) { onRecent(); onQuickAdd() } }}
      onPointerDown={(event) => {
        if (!available || event.pointerType === 'mouse') return
        touchStart.current = { at: performance.now(), x: event.clientX, y: event.clientY, moved: false }
      }}
      onPointerMove={(event) => {
        const start = touchStart.current
        if (!start) return
        if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 12) start.moved = true
      }}
      onPointerUp={(event) => {
        const start = touchStart.current
        touchStart.current = null
        if (!available || !start || start.moved || performance.now() - start.at < 500) return
        // No telefone, inserir apenas quando o utilizador larga depois de
        // segurar; o clique sintético seguinte é ignorado para não ativar o
        // modo de posicionamento ao mesmo tempo.
        suppressClick.current = true
        event.preventDefault()
        onRecent()
        onQuickAdd()
      }}
      onPointerCancel={() => { touchStart.current = null }}
      draggable={available}
      onDragStart={(e) => {
        if (!available) { e.preventDefault(); return }
        const st = useSimStore.getState()
        st.setPlacingType(null)
        st.setDragType(type)
        e.dataTransfer.setData('application/x-dcsimu-component', type)
        e.dataTransfer.setData('text/plain', type)
        e.dataTransfer.effectAllowed = 'copy'
        const chip = document.createElement('div')
        chip.textContent = `+ ${name}`
        chip.style.cssText = 'position:fixed;top:-100px;left:-100px;padding:3px 8px;border-radius:999px;background:#2f6bff;color:#fff;font:600 11px Inter,system-ui,sans-serif;white-space:nowrap'
        document.body.appendChild(chip)
        e.dataTransfer.setDragImage(chip, -12, -12)
        window.setTimeout(() => chip.remove(), 0)
      }}
      onDragEnd={(e) => { if (available && e.dataTransfer.dropEffect !== 'none') onRecent(); useSimStore.getState().setDragType(null) }}
    >
      <span className="dc-library-tile-image">
        <ComponentThumb type={type} size={58} />
        {!available && <span className="dc-library-tile-lock" aria-hidden="true"><IconLock size={16} /></span>}
      </span>
      <span className="dc-library-tile-name">{name}</span>
      {!available && <span className="dc-library-tile-status">{disabledNote ? 'Desativado' : 'Aguarda GLB 3D'}</span>}
    </button>
    <button type="button" className={`dc-library-tile-favorite ${favorite ? 'is-favorite' : ''}`} onClick={onFavorite} aria-pressed={favorite} aria-label={`${favorite ? 'Remover' : 'Adicionar'} ${name} ${favorite ? 'dos' : 'aos'} favoritos`} title={favorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}><IconStar size={11} /></button>
  </div>
}

/**
 * Painel esquerdo: biblioteca de componentes (clique adiciona ao esquema) e
 * inspetor completo do que está selecionado (componente, borne ou cabo).
 */
export default function Sidebar({ width = 300, quickAddOnPick = false, onComponentAdded, onCollapse }: { width?: number | string; quickAddOnPick?: boolean; onComponentAdded?: () => void; onCollapse?: () => void }) {
  const components = useSimStore((s) => s.components)
  const editingStopped = useSimStore((s) => s.sim.runState === 'stopped')
  const manobraAllowed = useManobraAllowed()
  // Estado elétrico do inspetor (bornes energizados, indicadores): tick da simulação.
  useSimStore((s) => s.simTick)
  const grid = useSimStore((s) => s.grid)
  const wires = useSimStore((s) => s.wires)
  const selectedIds = useSimStore((s) => s.selectedComponentIds)
  const selectedWireId = useSimStore((s) => s.selectedWireId)
  const selectedWireIds = useSimStore((s) => s.selectedWireIds)
  const selectedTerminalId = useSimStore((s) => s.selectedTerminalId)
  const [tab, setTab] = useState<'library' | 'inspector'>('library')
  const [wireEndTab, setWireEndTab] = useState<'from' | 'to'>('from')
  // Ferramenta ativa e valores dos cabos novos: com a ferramenta Cabo, o painel
  // lateral esquerdo passa a mostrar as opções (cor, condutor, secção, terminal)
  // em vez de as esconder num cartão sobre o canvas.
  const tool = useSimStore((s) => s.tool)
  const wireDefaults = useSimStore((s) => s.wireDefaults)
  const setWireDefaults = useSimStore((s) => s.setWireDefaults)
  // Subscrições também são hooks: nunca as chamar dentro do ramo do inspetor.
  const detachWiresOnDrag = useSimStore((s) => s.detachWiresOnDrag)
  const wireTool = editingStopped && tool === 'wire'
  useEffect(() => { if (wireTool) setTab('inspector') }, [wireTool])
  const [terminalLibOpen, setTerminalLibOpen] = useState(false)
  const inspectorRef = useRef<HTMLDivElement>(null)
  const [filter, setFilter] = useState('')
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => new Set(paletteGroups().map((g) => g.group).filter((g) => !['protection', 'command', 'Iluminação', 'Bornes e barras'].includes(g))))
  const [favorites, setFavorites] = useState<ComponentType[]>(() => {
    try { return (JSON.parse(localStorage.getItem('dcsimu:library:favorites') ?? '[]') as ComponentType[]).map((type) => (type as string) === 'powerSupplyProauto24B' ? 'powerSupplyProauto24A' : type) }
    catch { return [] }
  })
  const [recent, setRecent] = useState<ComponentType[]>(() => {
    try { return (JSON.parse(localStorage.getItem('dcsimu:library:recent') ?? '[]') as ComponentType[]).map((type) => (type as string) === 'powerSupplyProauto24B' ? 'powerSupplyProauto24A' : type).filter((type) => !!TEMPLATES[type]).slice(0, 8) }
    catch { return [] }
  })
  const markRecent = (type: ComponentType) => setRecent((current) => {
    const next = [type, ...current.filter((item) => item !== type)].slice(0, 8)
    try { localStorage.setItem('dcsimu:library:recent', JSON.stringify(next)) } catch { /* armazenamento indisponível */ }
    return next
  })
  const toggleFavorite = (type: ComponentType) => setFavorites((current) => {
    const next = current.includes(type) ? current.filter((t) => t !== type) : [...current, type]
    try { localStorage.setItem('dcsimu:library:favorites', JSON.stringify(next)) } catch { /* storage indisponível */ }
    return next
  })
  const toggleGroup = (group: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(group)) next.delete(group)
      else next.add(group)
      return next
    })
  }

  useEffect(() => {
    if (selectedIds.length > 0 || selectedWireId || selectedTerminalId) {
      setTab('inspector')
    }
  }, [selectedIds.length, selectedWireId, selectedTerminalId])

  useEffect(() => { if (inspectorRef.current) inspectorRef.current.scrollTop = 0 }, [selectedIds[0], selectedWireId, selectedTerminalId])

  const catalogRevision = useCatalogStore((s) => s.revision)
  const disabledComponents = useComponentSettings((s) => s.disabled)
  // ADMIN-COMP-01: arquivados/eliminados saem da biblioteca, recentes e favoritos.
  const adminHidden = useComponentSettings((s) => s.hidden)
  const explicitlyBlocked = useComponentSettings((s) => s.blocked)
  const hiddenComponents = useMemo(() => {
    const hidden = { ...adminHidden }
    for (const type of Object.keys(TEMPLATES) as ComponentType[]) {
      if (blockedDuplicateReplacement(type, {
        blocked: t => !!explicitlyBlocked[t], has3D: canInsertComponent3D,
        available: t => !(t in disabledComponents) && !adminHidden[t] && !hiddenCatalogTypes.has(t),
      })) hidden[type] = true
    }
    return hidden
  }, [adminHidden, explicitlyBlocked, disabledComponents, catalogRevision])
  const groups = useMemo(() => paletteGroups().map((g) => ({ ...g, items: g.items.filter((it) => !hiddenComponents[it.type]) })).filter((g) => g.items.length > 0), [catalogRevision, hiddenComponents])
  const modelReadyCount = useMemo(() => (Object.keys(TEMPLATES) as ComponentType[]).filter((type) => canInsertComponent3D(type) && !(type in disabledComponents) && !hiddenCatalogTypes.has(type) && !hiddenComponents[type]).length, [disabledComponents, hiddenComponents, catalogRevision])
  const lockedCount = Object.keys(TEMPLATES).filter((type) => !hiddenCatalogTypes.has(type) && !hiddenComponents[type]).length - modelReadyCount
  const [stripFocusId, setStripFocusId] = useState<string | null>(null)
  const selectedComponent = useMemo(() => {
    if (!editingStopped || !selectedIds.length) return undefined
    if (stripFocusId && selectedIds.includes(stripFocusId)) {
      const focused = components.find((c) => c.id === stripFocusId)
      if (focused) return focused
    }
    return components.find((c) => c.id === selectedIds[0])
  }, [components, selectedIds, stripFocusId, editingStopped])
  const multiSelectedComponents = useMemo(
    () => (selectedIds.length > 1 ? selectedIds.map((id) => components.find((c) => c.id === id)).filter((c): c is NonNullable<typeof c> => !!c) : []),
    [components, selectedIds],
  )
  const isSingleStripSelection = useMemo(() => {
    if (multiSelectedComponents.length < 2) return false
    const st = terminalStripFor(components, multiSelectedComponents[0].id)
    if (!st) return false
    const set = new Set(st.members.map((m) => m.id))
    return multiSelectedComponents.every((c) => set.has(c.id))
  }, [components, multiSelectedComponents])
  const selectedWire = editingStopped ? wires.find((w) => w.id === selectedWireId) : undefined
  const selectedStateEntries = selectedComponent ? inspectorStateEntries(selectedComponent) : []
  const hasConfiguration = !!selectedComponent && (!!industrialDeviceTypeOf(selectedComponent) || hasDeviceControls(selectedComponent.type) || !!protectionControlKindOf(selectedComponent.type) || importedComponentInfo(selectedComponent.type)?.behavior === 'thermal' || selectedStateEntries.length > 0)
  const wireEditingStopped = useSimStore(s => s.sim.runState === 'stopped')
  const wireFromTerminal = selectedWire ? components.flatMap((c) => c.terminals).find((t) => t.id === selectedWire.fromTerminalId) : undefined
  const wireToTerminal = selectedWire ? components.flatMap((c) => c.terminals).find((t) => t.id === selectedWire.toTerminalId) : undefined
  const wireFromOwner = wireFromTerminal ? components.find((component) => component.id === wireFromTerminal.componentId) : undefined
  const wireToOwner = wireToTerminal ? components.find((component) => component.id === wireToTerminal.componentId) : undefined
  const wireFromClass = wireFromOwner && wireFromTerminal ? terminalElectricalClassOf(wireFromOwner, wireFromTerminal) : undefined
  const wireToClass = wireToOwner && wireToTerminal ? terminalElectricalClassOf(wireToOwner, wireToTerminal) : undefined
  const wireClassCompatible = !wireFromClass || !wireToClass || terminalClassesCompatible(wireFromClass, wireToClass)
  const selectedTerminal = editingStopped ? components.flatMap((c) => c.terminals).find((t) => t.id === selectedTerminalId) : undefined
  const terminalOwner = selectedTerminal ? components.find((c) => c.id === selectedTerminal.componentId) : undefined
  const connections = selectedTerminal ? terminalConnections(selectedTerminal.id, components, wires) : []
  // A sessão pertence à seleção; só se revertem os campos escritos pelo inspetor.
  const wireEditBaselineRef = useRef(new Map<string, { before: Wire; applied: Wire; fields: Set<keyof Wire> }>())
  const [wireEditDirty, setWireEditDirty] = useState(false)
  const wireSelectionKey = [selectedWire?.id ?? '', ...selectedWireIds].join('|')
  useEffect(() => {
    wireEditBaselineRef.current.clear()
    setWireEditDirty(false)
  }, [wireSelectionKey, editingStopped])

  const patchSelectedWire = (patch: Partial<Wire>) => {
    if (!selectedWire || selectedWire.locked || !editingStopped) return
    const store = useSimStore.getState()
    const ids = store.selectedWireIds?.includes(selectedWire.id) ? store.selectedWireIds : [selectedWire.id]
    const editable = store.wires.filter((wire) => ids.includes(wire.id) && !wire.locked)
    if (!editable.length) return
    if (!wireEditBaselineRef.current.size) store.commitHistory()
    for (const wire of editable) {
      const baseline = wireEditBaselineRef.current.get(wire.id) ?? { before: structuredClone(wire), applied: structuredClone(wire), fields: new Set<keyof Wire>() }
      store.updateWire(wire.id, patch)
      const current = useSimStore.getState().wires.find((item) => item.id === wire.id)
      if (!current) continue
      for (const field of new Set([...Object.keys(wire), ...Object.keys(current)]) as Set<keyof Wire>) {
        if (JSON.stringify(wire[field]) !== JSON.stringify(current[field])) {
          if (!baseline.fields.has(field)) Object.assign(baseline.before, { [field]: structuredClone(wire[field]) })
          baseline.fields.add(field)
          Object.assign(baseline.applied, { [field]: structuredClone(current[field]) })
        }
      }
      wireEditBaselineRef.current.set(wire.id, baseline)
    }
    setWireEditDirty(true)
  }
  const saveWireChanges = () => {
    const n = wireEditBaselineRef.current.size
    wireEditBaselineRef.current.clear()
    setWireEditDirty(false)
    useSimStore.getState().pushEvent('info', n > 1
      ? `Alterações aplicadas a ${n} cabos e guardadas no projeto.`
      : 'Alterações do cabo guardadas no projeto.')
  }
  const cancelWireChanges = () => {
    const store = useSimStore.getState()
    for (const [id, baseline] of wireEditBaselineRef.current) {
      const current = store.wires.find((wire) => wire.id === id)
      if (!current || current.locked) continue
      const patch: Partial<Wire> = {}
      for (const field of baseline.fields) {
        // Uma alteração posterior de outra origem no mesmo campo tem prioridade.
        if (JSON.stringify(current[field]) === JSON.stringify(baseline.applied[field])) Object.assign(patch, { [field]: structuredClone(baseline.before[field]) })
      }
      if (Object.keys(patch).length) store.updateWire(id, patch)
    }
    wireEditBaselineRef.current.clear()
    store.step()
    setWireEditDirty(false)
    store.pushEvent('info', 'Edição cancelada em todos os cabos alterados nesta seleção.')
  }

  const placingType = useSimStore((s) => s.placingType)
  const canInsert = (type: ComponentType) => canInsertComponent3D(type) && !(type in disabledComponents)

  /** Clique = modo "posicionar com o mouse" (fantasma segue o cursor no
   *  esquema). Clique novamente no mesmo item cancela. */
  const add = (type: ComponentType) => {
    if (!canInsert(type)) return
    const st = useSimStore.getState()
    st.setPlacingType(st.placingType === type ? null : type)
  }

  /** Duplo clique = insere imediatamente na próxima posição livre. */
  const addImmediate = (type: ComponentType) => {
    if (!canInsert(type)) return
    const st = useSimStore.getState()
    st.setPlacingType(null)
    const n = st.components.length
    st.addComponent(type, 80 + (n % 6) * 160, 90 + Math.floor(n / 6) * 150)
    setTab('inspector')
  }

  const pickFromLibrary = (type: ComponentType) => {
    if (quickAddOnPick) { addImmediate(type); onComponentAdded?.() }
    else add(type)
  }

  const filtered = useMemo(() => {
    if (!filter.trim()) return groups
    const f = filter.trim().toLocaleLowerCase('pt-PT')
    return groups
      .map((g) => ({ ...g, items: g.items.filter((i) => i.name.toLocaleLowerCase('pt-PT').includes(f) || i.type.toLowerCase().includes(f) || g.group.toLocaleLowerCase('pt-PT').includes(f)) }))
      .filter((g) => g.items.length)
  }, [groups, filter])
  const filteredItems = filtered.flatMap((group) => group.items)
  const filteredReadyCount = filteredItems.filter((item) => canInsert(item.type)).length
  const filteredLockedCount = filteredItems.length - filteredReadyCount

  return (
    <div className="pn-panel shrink-0 flex flex-col h-full min-h-0" style={{ width }}>
      <SidePanelHeader
        eyebrow={tab === 'library' ? 'ESQUEMA' : wireTool || (selectedWire && !selectedComponent) ? 'CABO' : selectedTerminal && !selectedComponent ? 'BORNE' : 'COMPONENTE'}
        title={tab === 'library' ? 'Elementos' : wireTool ? 'Novo cabo' : selectedWire && !selectedComponent ? 'Inspetor do cabo' : selectedTerminal && !selectedComponent ? 'Propriedades do borne' : 'Propriedades do componente'}
        side="left"
        onToggle={onCollapse}
        toggleLabel="Recolher biblioteca e inspetor"
      />
      {/* abas */}
      <div className="pn-tabs flex items-end">
        <button onClick={() => setTab('library')} className={`dc-tab ${tab === 'library' ? 'dc-tab-active' : ''}`}>
          Biblioteca <span className="text-ink-300 font-normal">({modelReadyCount}/{Object.keys(TEMPLATES).length})</span>
        </button>
        <button onClick={() => setTab('inspector')} className={`dc-tab ${tab === 'inspector' ? 'dc-tab-active' : ''}`}>
          Inspetor
        </button>
      </div>

      {tab === 'library' && (
        <>
          <div className="pn-section">
            <div className="relative">
              <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Pesquisar nome, tipo ou categoria…" aria-label="Pesquisar componentes" className="dc-input !pl-7 !pr-7" />
              {filter && <button className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-500" title="Limpar pesquisa" onClick={() => setFilter('')}><IconClose size={12} /></button>}
              <IconSearch size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-ink-300 pointer-events-none" />
            </div>
          </div>
          <div className="pn-section is-compact space-y-1">
            <button type="button" className="dc-btn w-full justify-center" onClick={() => setTerminalLibOpen(true)} title="Consulte os perfis de bornes e ligações usados nos componentes (L, N, PE, A1/A2, 13/14…)">Biblioteca de bornes e perfis de ligação</button>
            <button
              type="button"
              className="dc-btn w-full justify-center text-xs font-semibold text-brand-700 bg-brand-50 hover:bg-brand-100 border-brand-200"
              onClick={() => useSimStore.getState().generateIecFromPhysical()}
              title="Gera automaticamente o Esquema IEC 60617 (comandos e força) a partir dos equipamentos e cabos montados no painel 3D"
            >
              <IconCommands size={12} /> Gerar Esquema IEC pelo 3D
            </button>
          </div>
          <div className="dc-library-model-notice" role="note">
            <IconLock size={13} />
            <span><strong>{lockedCount} componentes bloqueados.</strong> Itens sem GLB ou representação 3D disponível, e os desativados pelo administrador, não podem ser inseridos.</span>
          </div>
          <div className="pn-section is-compact flex items-center justify-between text-[10px] text-ink-500">
            <span>{filteredReadyCount} com 3D · {filteredLockedCount} bloqueados{filter ? ' na pesquisa' : ''}</span>
            <span className="flex gap-2"><button onClick={() => setCollapsedGroups(new Set())}>Expandir</button><button onClick={() => setCollapsedGroups(new Set(groups.map((g) => g.group)))}>Recolher</button></span>
          </div>
          {placingType && <div className="p-2 bg-brand-50 text-brand-700 text-[11px] flex gap-2 items-center"><span className="flex-1">A posicionar: {TEMPLATES[placingType]?.paletteName ?? placingType}</span><button className="dc-btn !h-6" onClick={() => useSimStore.getState().setPlacingType(null)}>Cancelar</button></div>}
          <div className="pn-body flex-1 overflow-y-auto min-h-0 dc-library-scroll">
            {recent.length > 0 && !filter && <section className="dc-library-section"><div className="dc-library-section-title"><strong><IconHistory size={11} />Recentes</strong><span>{recent.length}</span></div><div className="dc-library-recent">{recent.filter((type) => !hiddenComponents[type]).map((type) => <LibraryTile key={type} type={type} name={TEMPLATES[type].paletteName} favorite={favorites.includes(type)} placing={placingType === type} onPick={() => pickFromLibrary(type)} onQuickAdd={() => addImmediate(type)} onFavorite={() => toggleFavorite(type)} onRecent={() => markRecent(type)} />)}</div></section>}
            {favorites.length > 0 && !filter && <section className="dc-library-section"><div className="dc-library-section-title"><strong><IconStar size={11} />Favoritos</strong><span>{favorites.length}</span></div><div className="dc-library-grid">{favorites.filter((type) => TEMPLATES[type] && !hiddenComponents[type]).map((type) => <LibraryTile key={type} type={type} name={TEMPLATES[type].paletteName} favorite placing={placingType === type} onPick={() => pickFromLibrary(type)} onQuickAdd={() => addImmediate(type)} onFavorite={() => toggleFavorite(type)} onRecent={() => markRecent(type)} />)}</div></section>}
            {!filtered.length && (
              <div className="dc-empty-state">
                <span className="dc-empty-state-icon"><IconSearch size={18} /></span>
                <strong>Nenhum componente encontrado</strong>
                <p>Não há resultados para «{filter.trim()}». Experimente outro termo, o nome do fabricante ou a categoria.</p>
                <button className="dc-btn dc-btn-primary" onClick={() => setFilter('')}>Limpar pesquisa</button>
              </div>
            )}
            {filtered.map((g) => {
              const isCollapsed = !filter.trim() && collapsedGroups.has(g.group)
              return <section className="dc-library-folder" key={g.group}>
                <button type="button" aria-expanded={!isCollapsed} className="dc-library-folder-head" onClick={() => toggleGroup(g.group)} title={`${isCollapsed ? 'Expandir' : 'Recolher'} ${g.group}`}>
                  <span className="dc-library-folder-icon"><IconProjects size={16} /></span><strong>{g.group}</strong><span className="dc-library-folder-count">{g.items.length}</span><IconChevronDown size={13} className={`dc-library-folder-chevron ${isCollapsed ? '' : 'is-open'}`} />
                </button>
                {!isCollapsed && <div className="dc-library-grid">{g.items.map((it) => <LibraryTile key={it.type} type={it.type} name={it.name} favorite={favorites.includes(it.type)} placing={placingType === it.type} onPick={() => pickFromLibrary(it.type)} onQuickAdd={() => addImmediate(it.type)} onFavorite={() => toggleFavorite(it.type)} onRecent={() => markRecent(it.type)} />)}</div>}
              </section>
            })}
             <p className="text-ink-400 text-[10px] leading-relaxed mt-2 p-2 bg-surface-sunken/60 rounded-md border border-line-soft">
               Nos itens <b className="text-ink-500">disponíveis</b>, clique ou arraste: o componente aparece em pré-visualização no esquema
               e fica onde <b className="text-ink-500">soltar/clicar</b> (encaixa na malha). O cadeado indica que falta uma representação 3D ou que o item foi desativado.
               Duplo clique insere já no esquema · Shift+clique posiciona vários · Esc cancela.
             </p>
          </div>
        </>
      )}

      {terminalLibOpen && createPortal(<div className="ce-modal ce-modal-fixed" role="dialog" aria-modal="true" aria-label="Biblioteca de bornes" onClick={(event) => { if (event.target === event.currentTarget) setTerminalLibOpen(false) }} onKeyDown={(event) => { if (event.key === 'Escape') setTerminalLibOpen(false) }}>
        <div className="ce-modal-card tl-modal-card">
          <div className="ce-lib-head"><span>Biblioteca de bornes e perfis de ligação</span><button className="ce-icon tl-close-btn" onClick={() => setTerminalLibOpen(false)} title="Fechar" aria-label="Fechar biblioteca de bornes"><IconClose size={12} /><span className="tl-close-label">Fechar</span></button></div>
          <TerminalLibrary mode="browse" />
        </div>
      </div>, document.body)}

      {tab === 'inspector' && (
        <div ref={inspectorRef} className="dc-inspector-scroll flex-1 overflow-y-auto p-3 text-xs text-ink-700 space-y-3 min-h-0">
          {wireTool && (
            <section className="dc-wire-new space-y-2.5" aria-label="Opções dos cabos novos">
              <header className="flex items-baseline justify-between gap-2 border-b border-line pb-1.5">
                <strong className="text-[11px] font-semibold text-ink-900">Cabos e ponteiras</strong>
                <span className="text-[9.5px] text-ink-400">próximos cabos</span>
              </header>
              {/* Estado em direto da construção de cabos no 3D (portal montado pelo Panel3D) */}
              <div ref={setWireDraftSlot} className="dc-wire-draft-slot" data-slot="wire-draft-3d" />
              <WireOptionsFields value={wireDefaults} onChange={setWireDefaults} showRouting />
              <div className="wo-shortcuts" aria-label="Atalhos da ferramenta Cabo">
                <span><kbd>Clique</kbd> borne / ponto</span>
                <span><kbd>Shift</kbd> eixo 90° / cadeia</span>
                <span><kbd>Alt</kbd> sem malha</span>
                <span><kbd>Backspace</kbd> desfaz</span>
                <span><kbd>Enter</kbd> ponta livre</span>
                <span><kbd>Esc</kbd> termina</span>
              </div>
            </section>
          )}
          {!wireTool && !selectedComponent && !selectedWire && !selectedTerminal && (
            <div className="h-full flex items-center justify-center">
              <div className="dc-empty-state">
                <span className="dc-empty-state-icon"><IconLayers size={18} /></span>
                <strong>{editingStopped ? 'Nada selecionado' : 'Simulação em curso'}</strong>
                <p>{editingStopped ? 'Escolha um componente, um cabo ou um borne — no esquema ou no painel 3D — para editar as propriedades aqui.' : 'Pare a simulação (STOP) para configurar elementos. Os comandos e as medições continuam disponíveis no circuito.'}</p>
                {editingStopped && <span className="dc-empty-state-hint">Dica: <kbd>Esc</kbd> limpa a seleção</span>}
              </div>
            </div>
          )}

          {/* ------------------------------------------------ componente */}
          {selectedComponent && (
            <section key={selectedComponent.id} className="dc-inspector-component">
              {multiSelectedComponents.length > 1 && !isSingleStripSelection && (() => {
                const allTerminals = multiSelectedComponents.every((mc) => isTerminalStripType(mc.type))
                return (
                  <div className="mb-2 rounded-lg border border-slate-200 bg-slate-50 p-2 space-y-1.5">
                    <div className="flex items-center justify-between gap-1">
                      <strong className="text-[11px] text-ink-800">{`${multiSelectedComponents.length} elementos selecionados`}</strong>
                      <button type="button" className="text-[10px] text-blue-600 hover:underline" onClick={() => useSimStore.getState().selectComponents([selectedComponent.id])}>
                        Só este
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      <button type="button" className="dc-btn dc-btn-primary text-[10.5px]" onClick={() => useSimStore.getState().groupItems('schematic', selectedIds)}>
                        {allTerminals ? 'Agrupar régua' : 'Agrupar'}
                      </button>
                      <button type="button" className="dc-btn text-[10.5px]" onClick={() => useSimStore.getState().ungroupItems('schematic', selectedIds)}>
                        Desagrupar
                      </button>
                      <button type="button" className="dc-btn text-[10.5px]" onClick={() => useSimStore.getState().duplicateComponents(selectedIds)}>
                        <IconCopy size={11} /> Duplicar
                      </button>
                      <button type="button" className="dc-btn text-[10.5px]" onClick={() => useSimStore.getState().snapToRails(selectedIds, true)}>
                        Fixar calha
                      </button>
                    </div>
                  </div>
                )
              })()}
              <header className="dc-inspector-hero">
                <div className="dc-inspector-hero-thumb"><ComponentThumb type={selectedComponent.type} size={42} /></div>
                <div className="min-w-0 flex-1"><strong className="block text-sm text-ink-900 truncate">{selectedComponent.ref || 'Sem referência'} <span className="text-[9px] text-blue-600">v{componentEditorVersionOf(selectedComponent)}</span></strong><span className="block text-[10px] text-ink-500 truncate">{selectedComponent.label}</span><time className="block text-[8px] text-ink-400 truncate" dateTime={selectedComponent.editorUpdatedAt}>Atualizado {formatComponentUpdateDate(selectedComponent.editorUpdatedAt)}</time></div>
                <span className={`dc-inspector-indicator ${selectedComponent.state.energized ? 'is-on' : ''}`} title={selectedComponent.state.energized ? 'Energizado' : 'Desligado'} />
              </header>
              <div className="text-[10px] font-mono text-ink-400 px-1 truncate">{selectedComponent.type} · {selectedComponent.terminals.length} bornes{selectedComponent.locked ? ' · bloqueado' : ''}</div>
              <nav className={`dc-inspector-jump${hasConfiguration ? ' has-configuration' : ''}`} aria-label="Secções do inspetor">
                {['Identificação', ...(hasConfiguration ? ['Configuração'] : []), 'Posição e aparência', 'Bornes'].map((name) => <button type="button" key={name} onClick={() => {
                  const section = name === 'Configuração' ? inspectorRef.current?.querySelector<HTMLDetailsElement>('[data-inspector-configuration]') : Array.from(inspectorRef.current?.querySelectorAll<HTMLDetailsElement>('details.dc-inspector-group') ?? []).find((item) => item.querySelector('summary')?.textContent?.startsWith(name))
                  // A margem acompanha o cartão sticky, incluindo zoom de texto e nomes longos.
                  const hero = inspectorRef.current?.querySelector<HTMLElement>('.dc-inspector-hero')
                  if (section && hero) section.style.scrollMarginTop = `${Math.ceil(hero.getBoundingClientRect().height + 20)}px`
                  if (section) { section.open = true; section.scrollIntoView({ block: 'start', behavior: 'auto' }); const summary = section.querySelector('summary'); summary?.focus({ preventScroll: true }) }
                }}>{name === 'Posição e aparência' ? 'Geometria' : name}</button>)}
              </nav>
              <details className="dc-inspector-group" open><summary>Identificação</summary><div className="dc-inspector-group-body">

              <div>
                <label className={label} htmlFor="inspector-component-ref">TAG / referência</label>
                <input id="inspector-component-ref" className="dc-input" value={selectedComponent.ref} onChange={(e) => useSimStore.getState().updateComponent(selectedComponent.id, { ref: e.target.value })} />
              </div>
              <div>
                <label className={label} htmlFor="inspector-component-description">Descrição</label>
                <input id="inspector-component-description" className="dc-input" value={selectedComponent.label} onChange={(e) => useSimStore.getState().updateComponent(selectedComponent.id, { label: e.target.value })} />
              </div>
              </div></details>
              {isTerminalStripType(selectedComponent.type) && (
                <details className="dc-inspector-group" open>
                  <summary>Régua de bornes</summary>
                  <div className="dc-inspector-group-body">
                    <TerminalStripControls c={selectedComponent} onFocusMember={setStripFocusId} />
                  </div>
                </details>
              )}
              {isRealBusbarType(selectedComponent.type) && (
                <details className="dc-inspector-group" open>
                  <summary>Configuração do barramento</summary>
                  <div className="dc-inspector-group-body">
                    <BusbarControls c={selectedComponent} />
                  </div>
                </details>
              )}
              {selectedComponent.catalog && <CatalogInspector component={selectedComponent} />}
              <DatasheetPanel type={selectedComponent.type} />
              {(() => {
                const iec = iecAssociationOf(selectedComponent.type)
                const primary = iecPrimaryLabel(iec)
                const related = iecRelatedLabels(iec)
                return (
                  <details className="dc-inspector-group" open>
                    <summary>Símbolo IEC</summary>
                    <div className="dc-inspector-group-body space-y-1.5">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-[10px] text-ink-500">Principal</span>
                        <span className="text-[11px] font-medium text-ink-800 text-right">{primary}</span>
                      </div>
                      {iec.refLetter ? (
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="text-[10px] text-ink-500">Ref. IEC 81346</span>
                          <span className="text-[11px] font-mono text-ink-700">{iec.refLetter}</span>
                        </div>
                      ) : null}
                      {iec.iec60617 ? (
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="text-[10px] text-ink-500">IEC 60617</span>
                          <span className="text-[10px] font-mono text-ink-600 text-right">{iec.iec60617}</span>
                        </div>
                      ) : null}
                      {related.length > 0 ? (
                        <div>
                          <span className="text-[10px] text-ink-500">Relacionados no esquema</span>
                          <ul className="mt-0.5 text-[10px] text-ink-700 list-disc pl-4">
                            {related.map((r) => <li key={r}>{r}</li>)}
                          </ul>
                        </div>
                      ) : null}
                      {iec.note ? <p className="text-[9px] text-ink-400 leading-snug">{iec.note}</p> : null}
                      <p className="text-[9px] text-ink-400 leading-snug">Associação 3D Realista ↔ Esquema IEC. Os símbolos desenhados seguem a IEC 60617.</p>
                    </div>
                  </details>
                )
              })()}
              <details className="dc-inspector-group" open><summary>Posição e aparência</summary><div className="dc-inspector-group-body">
              {selectedComponent.locked && <p className="dc-inspector-note" role="status">Geometria bloqueada. Use «Desbloquear» para mover, rodar ou redimensionar.</p>}
              <fieldset disabled={!!selectedComponent.locked} className="dc-inspector-geometry">
              <LayerButtons />
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={label} htmlFor="inspector-component-x">X (px)</label>
                  <InspectorNumberInput
                    id="inspector-component-x" aria-label="Posição X (px)" disabled={!!selectedComponent.locked}
                    type="number"
                    className="dc-input"
                    value={Math.round(selectedComponent.schematicX)}
                    onChange={(e) => useSimStore.getState().updateComponent(selectedComponent.id, { schematicX: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <label className={label} htmlFor="inspector-component-y">Y (px)</label>
                  <InspectorNumberInput
                    id="inspector-component-y" aria-label="Posição Y (px)" disabled={!!selectedComponent.locked}
                    type="number"
                    className="dc-input"
                    value={Math.round(selectedComponent.schematicY)}
                    onChange={(e) => useSimStore.getState().updateComponent(selectedComponent.id, { schematicY: Number(e.target.value) })}
                  />
                </div>
                {selectedComponent.type !== 'cableDuct' && !isMountingRail(selectedComponent.type) && (
                  <>
                    <div>
                      <label className={label} htmlFor="inspector-component-width">Largura (px)</label>
                      <InspectorNumberInput id="inspector-component-width" aria-label="Largura (px)" disabled={!!selectedComponent.locked} min={30} type="number" className="dc-input" value={selectedComponent.w} onChange={(e) => useSimStore.getState().updateComponent(selectedComponent.id, { w: Number(e.target.value) })} />
                    </div>
                    <div>
                      <label className={label} htmlFor="inspector-component-height">Altura (px)</label>
                      <InspectorNumberInput id="inspector-component-height" aria-label="Altura (px)" disabled={!!selectedComponent.locked} min={30} type="number" className="dc-input" value={selectedComponent.h} onChange={(e) => useSimStore.getState().updateComponent(selectedComponent.id, { h: Number(e.target.value) })} />
                    </div>
                  </>
                )}
                {selectedComponent.type !== 'cableDuct' && (
                  <div>
                    <label className={label} htmlFor="inspector-component-rotation">Rotação</label>
                    <Select id="inspector-component-rotation" disabled={!!selectedComponent.locked} className="dc-select" value={selectedComponent.rotation} onChange={(e) => useSimStore.getState().updateComponent(selectedComponent.id, { rotation: Number(e.target.value) })}>
                      {[0, 90, 180, 270].map((r) => (
                        <option key={r} value={r}>{r}°</option>
                      ))}
                    </Select>
                  </div>
                )}
                <div className="col-span-2">
                  <ColorPaletteField
                    value={selectedComponent.bodyColor ?? (selectedComponent.type === 'cableDuct' ? '#a9aca8' : '#e2e8f0')}
                    options={selectedComponent.type === 'cableDuct' ? CABLE_DUCT_COLOR_OPTIONS : BODY_COLOR_OPTIONS}
                    ariaLabel="cor do corpo"
                    fieldLabel={selectedComponent.type === 'cableDuct' ? 'Cor da calha (PVC)' : 'Cor do corpo'}
                    isCustom={Boolean(selectedComponent.bodyColor)}
                    disabled={!!selectedComponent.locked}
                    onChange={(value) => useSimStore.getState().updateComponent(selectedComponent.id, { bodyColor: value })}
                    onReset={() => useSimStore.getState().updateComponent(selectedComponent.id, { bodyColor: undefined })}
                  />
                </div>
              </div>

              {isMountingRail(selectedComponent.type) && (() => {
                const length = clampRailLengthMm(selectedComponent.state.lengthMm)
                const setLength = (value: number) => useSimStore.getState().setRailLength(selectedComponent.id, value, 'left')
                const attached = components.filter((item) => item.railId === selectedComponent.id)
                const magnet = grid.railMagnet !== false
                return <div className="dc-rail-length">
                  <DinRailProfileControls c={selectedComponent} />
                  <label className={label}>Comprimento da calha (mm)</label>
                  <div className="dc-rail-length-row">
                    <InspectorNumberInput aria-label="Comprimento da calha (mm)" type="number" className="dc-input" min={DIN_RAIL_15X55.minLengthMm} max={DIN_RAIL_15X55.maxLengthMm} step={5} value={length} onChange={(e) => setLength(Number(e.target.value))} />
                    <input type="range" min={DIN_RAIL_15X55.minLengthMm} max={DIN_RAIL_15X55.maxLengthMm} step={5} value={length} aria-label="Comprimento da calha" onChange={(e) => setLength(Number(e.target.value))} />
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {[100, 250, 500, 1000, 2000].map((mm) => <button key={mm} className={`dc-btn${length === mm ? ' dc-btn-primary' : ''}`} onClick={() => setLength(mm)}>{mm >= 1000 ? `${mm / 1000} m` : `${mm} mm`}</button>)}
                  </div>
                  <label className="flex items-center justify-between gap-2 px-1 py-0.5 rounded hover:bg-slate-50" title="Ao largar um equipamento de calha perto de uma calha, centra-o e fixa-o (cola aos vizinhos e às pontas).">
                    <span className="text-ink-500">Imã automático de calha</span>
                    <input type="checkbox" checked={magnet} onChange={(e) => useSimStore.getState().setGrid({ railMagnet: e.target.checked })} />
                  </label>
                  <div className="flex flex-wrap gap-1">
                    <button className="dc-btn" title="Centra e fixa nesta e noutras calhas todos os equipamentos de calha ao alcance" onClick={() => {
                      const n = useSimStore.getState().snapToRails(undefined, true)
                      useSimStore.getState().pushEvent('info', n ? `${n} equipamento(s) centrado(s) e fixo(s) nas calhas.` : 'Nenhum equipamento de calha ao alcance de uma calha. Aproxime-os da calha e repita.')
                    }}>Centrar e fixar equipamentos</button>
                    <button className="dc-btn" disabled={!attached.length} onClick={() => useSimStore.getState().detachFromRail(attached.map((item) => item.id))}>Soltar todos</button>
                  </div>
                  <small className="text-ink-400">{attached.length ? `${attached.length} equipamento(s) fixo(s): ${attached.map((item) => item.ref).join(', ')}. ` : 'Sem equipamentos fixos. '}Arraste as pontas da calha no Esquema 2D para alterar o comprimento.</small>
                  <small className="text-ink-400">Perfil {dinRailProfileOf(selectedComponent.state).width} × {String(dinRailProfileOf(selectedComponent.state).height).replace('.', ',')} mm · {selectedComponent.state.perforated === false ? 'sem furos' : `${railSlotCount(length, dinRailProfileOf(selectedComponent.state))} furos oblongos (passo ${dinRailProfileOf(selectedComponent.state).slotPitch} mm)`} · {DIN_RAIL_15X55.minLengthMm}–{DIN_RAIL_15X55.maxLengthMm} mm</small>
                </div>
              })()}

              {selectedComponent.type === 'panelEnclosure' && <EnclosureControls c={selectedComponent} />}
              {selectedComponent.type === 'cableDuct' && <CableDuctControls c={selectedComponent} />}
              {selectedComponent.type === 'spiralWrap' && <SpiralWrapControls c={selectedComponent} />}
              {selectedComponent.type === 'currentTransformerSplitCore' && <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-2 text-xs">
                <strong>Transformador de corrente externo · janela Ø16 mm</strong>
                <p>P1/P2 representam o mesmo condutor que atravessa a janela. S1/S2 são o secundário isolado; não são bornes de alimentação.</p>
                <p>Modelo visual de referência: relação e dimensões exteriores não certificadas. Não é acrescentado automaticamente ao KWS-306 (ligação direta) nem ao D52 de TC interno.</p>
                <p>Num D52 de versão externa, confirmar na chapa a relação do TC e os bornes 3/4. A compatibilidade elétrica dessa versão não é presumida.</p>
                <label className="flex gap-2 items-center"><input type="checkbox" checked={selectedComponent.state.primaryConductor===true} onChange={e=>useSimStore.getState().setComponentState(selectedComponent.id,{primaryConductor:e.target.checked})}/>Mostrar condutor de demonstração</label>
              </div>}
              {selectedComponent.type === 'meterD522066' && (
                <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-2">
                  <div className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase">Medidor D52-2066 LCD</div>
                  <p className="text-xs text-slate-500">Versão com TC interno: 1/2 medem a tensão; CT-IN/OUT são a passagem do mesmo condutor, não o secundário de um TC externo. Nos modelos externos, confirmar a relação e os bornes 3/4 antes de ligar.</p>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="p-2 rounded bg-slate-50 border border-slate-100">
                      <span className="text-slate-500 block text-[10px]">Tensão (V)</span>
                      <strong className="text-sky-600 font-mono text-sm">{selectedComponent.state.on !== false ? `${Number(selectedComponent.state.voltage ?? 223.8).toFixed(1)} V` : '0 V'}</strong>
                    </div>
                    <div className="p-2 rounded bg-slate-50 border border-slate-100">
                      <span className="text-slate-500 block text-[10px]">Corrente (A)</span>
                      <strong className="text-red-500 font-mono text-sm">{selectedComponent.state.on !== false ? `${Number(selectedComponent.state.current ?? 1.14).toFixed(2)} A` : '0 A'}</strong>
                    </div>
                    <div className="p-2 rounded bg-slate-50 border border-slate-100">
                      <span className="text-slate-500 block text-[10px]">Potência ativa</span>
                      <strong className="text-amber-500 font-mono text-sm">{selectedComponent.state.on !== false ? `${Number(selectedComponent.state.power ?? 256.3).toFixed(1)} W` : '0 W'}</strong>
                    </div>
                    <div className="p-2 rounded bg-slate-50 border border-slate-100">
                      <span className="text-slate-500 block text-[10px]">Energia total</span>
                      <strong className="text-orange-500 font-mono text-sm">{`${Number(selectedComponent.state.energy ?? 0.22).toFixed(2)} kWh`}</strong>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="dc-btn w-full justify-center text-xs"
                    disabled={!manobraAllowed}
                    title={manobraAllowed ? undefined : MANOBRA_BLOCKED_TITLE}
                    onClick={() => {
                      if (!manobraAllowed) return
                      useSimStore.getState().operateComponent(selectedComponent.id, { energy: 0.00 })
                      useSimStore.getState().pushEvent('info', `${selectedComponent.ref}: Contador de energia reposto a 0.00 kWh.`)
                    }}
                  >
                    Repor contador (Reset kWh)
                  </button>
                </div>
              )}
              {selectedComponent.type === 'meterKws306' && (
                <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-2">
                  <div className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase">Analisador KWS-306 3P+N</div>
                  <div className="p-2 rounded bg-slate-900 text-white font-mono text-xs space-y-1">
                    <div className="flex justify-between text-sky-400">
                      <span>VA: {selectedComponent.state.on !== false ? `${Number(selectedComponent.state.vA ?? 211).toFixed(1)}V` : '0V'}</span>
                      <span>VB: {selectedComponent.state.on !== false ? `${Number(selectedComponent.state.vB ?? 210.4).toFixed(1)}V` : '0V'}</span>
                      <span>VC: {selectedComponent.state.on !== false ? `${Number(selectedComponent.state.vC ?? 210.4).toFixed(1)}V` : '0V'}</span>
                    </div>
                    <div className="flex justify-between text-red-400">
                      <span>IA: {selectedComponent.state.on !== false ? `${Number(selectedComponent.state.iA ?? 7.892).toFixed(2)}A` : '0A'}</span>
                      <span>IB: {selectedComponent.state.on !== false ? `${Number(selectedComponent.state.iB ?? 0).toFixed(2)}A` : '0A'}</span>
                      <span>IC: {selectedComponent.state.on !== false ? `${Number(selectedComponent.state.iC ?? 0).toFixed(2)}A` : '0A'}</span>
                    </div>
                    <div className="flex justify-between text-yellow-400">
                      <span>PA: {selectedComponent.state.on !== false ? `${Number(selectedComponent.state.pA ?? 1.665).toFixed(2)}kW` : '0kW'}</span>
                      <span>PB: {selectedComponent.state.on !== false ? `${Number(selectedComponent.state.pB ?? 0).toFixed(2)}kW` : '0kW'}</span>
                      <span>PC: {selectedComponent.state.on !== false ? `${Number(selectedComponent.state.pC ?? 0).toFixed(2)}kW` : '0kW'}</span>
                    </div>
                    <div className="flex justify-between text-cyan-300 pt-1 border-t border-slate-700">
                      <span>Σ {Number(selectedComponent.state.energy ?? 1.40).toFixed(2)} kWh</span>
                      <span>50 Hz · 15°C</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-2 pt-1">
                    <span className="text-xs text-slate-600">Relé de saída:</span>
                    <button
                      type="button"
                      disabled={!manobraAllowed}
                      title={manobraAllowed ? undefined : MANOBRA_BLOCKED_TITLE}
                      className={`rounded-full px-3 py-1.5 text-xs font-semibold border shadow-sm transition ${selectedComponent.state?.switchOn !== false ? 'bg-emerald-600 border-emerald-700 text-white' : 'bg-rose-600 border-rose-700 text-white'}`}
                      onClick={() => {
                        if (!manobraAllowed) return
                        const cur = selectedComponent.state?.switchOn !== false
                        useSimStore.getState().operateComponent(selectedComponent.id, { switchOn: !cur })
                        useSimStore.getState().pushEvent('info', `${selectedComponent.ref}: Saída ${!cur ? 'LIGADA (fechada)' : 'ABERTA (desligada)'}.`)
                      }}
                    >
                      {selectedComponent.state?.switchOn !== false ? 'Saída LIGADA (NO)' : 'Saída ABERTA (OFF)'}
                    </button>
                  </div>
                </div>
              )}
              <TerminalAssemblyCoverControl component={selectedComponent} />

              {isRailMountable(selectedComponent) && (() => {
                const rail = components.find((item) => item.id === selectedComponent.railId)
                return <div className="dc-rail-length">
                  <label className={label}>Calha DIN</label>
                  <div className="flex flex-wrap items-center gap-1">
                    <span className="text-ink-500">{rail ? `Fixo em ${rail.ref} · ${selectedComponent.railOffsetMm ?? 0} mm do início` : 'Solto (sem calha)'}</span>
                    <button className="dc-btn" onClick={() => {
                      const n = useSimStore.getState().snapToRails([selectedComponent.id], true)
                      if (!n) useSimStore.getState().pushEvent('info', 'Nenhuma calha ao alcance. Aproxime o equipamento de uma calha DIN.')
                    }}>Centrar e fixar</button>
                    {rail && <button className="dc-btn" onClick={() => useSimStore.getState().detachFromRail([selectedComponent.id])}>Soltar</button>}
                  </div>
                </div>
              })()}

              {selectedComponent.type !== 'panelEnclosure' && (() => {
                const enclosures = components.filter((item) => item.type === 'panelEnclosure')
                if (!enclosures.length && !selectedComponent.enclosureId && !selectedComponent.panelMount) return null
                const parent = components.find((item) => item.id === selectedComponent.enclosureId)
                return <div className="dc-rail-length">
                  <label className={label}>Dentro do quadro</label>
                  <div className="flex flex-wrap items-center gap-1">
                    <Select
                      className="dc-input"
                      value={selectedComponent.enclosureId ?? ''}
                      onChange={(e) => {
                        const id = e.target.value
                        if (!id) useSimStore.getState().detachFromEnclosure([selectedComponent.id])
                        else {
                          // Se estava na face, solta da face ao passar para dentro
                          if (selectedComponent.panelMount) useSimStore.getState().unmountFromPanel([selectedComponent.id])
                          useSimStore.getState().assignToEnclosure([selectedComponent.id], id)
                        }
                      }}
                      aria-label="Quadro em que este componente está montado"
                    >
                      <option value="">— nenhum —</option>
                      {enclosures.map((enc) => <option key={enc.id} value={enc.id}>{enc.ref || enc.label || enc.id}</option>)}
                    </Select>
                    {parent && <button className="dc-btn" onClick={() => useSimStore.getState().detachFromEnclosure([selectedComponent.id])}>Soltar</button>}
                  </div>
                  <small className="text-ink-400">{parent ? `Acompanha o quadro ${parent.ref} ao mover.` : 'Não está associado a nenhum quadro.'}</small>
                </div>
              })()}

              {selectedComponent.type !== 'panelEnclosure' && !isPanelAccessoryType(selectedComponent.type) && (() => {
                const enclosures = components.filter((item) => item.type === 'panelEnclosure')
                if (!enclosures.length) return null
                const pm = selectedComponent.panelMount
                const parent = pm ? components.find((item) => item.id === pm.enclosureId) : null
                const faces: Array<{id: import('../types').EnclosureFace,label:string}> = [
                  {id:'door',label:'Porta (fora)'},{id:'doorOuter',label:'Porta exterior'},{id:'left',label:'Lateral esq.'},{id:'right',label:'Lateral dir.'},{id:'top',label:'Topo'},{id:'inside',label:'Face interior'},
                ]
                return <div className="dc-rail-length">
                  <label className={label}>Na face do quadro (visível fora)</label>
                  <div className="flex flex-wrap items-center gap-1">
                    <Select className="dc-input" value={pm?.enclosureId ?? ''} onChange={(e)=>{
                      const id=e.target.value
                      if(!id) useSimStore.getState().unmountFromPanel([selectedComponent.id])
                      else useSimStore.getState().mountOnPanel([selectedComponent.id], id, pm?.face ?? 'door')
                    }}>
                      <option value="">— nenhum —</option>
                      {enclosures.map((enc)=><option key={enc.id} value={enc.id}>{enc.ref || enc.label || enc.id}</option>)}
                    </Select>
                    {pm && <Select className="dc-input" value={pm.face} onChange={(e)=> useSimStore.getState().updatePanelMount([selectedComponent.id], {face: e.target.value as import('../types').EnclosureFace})}>
                      {faces.map((f)=><option key={f.id} value={f.id}>{f.label}</option>)}
                    </Select>}
                    {pm && <button className="dc-btn" onClick={()=> useSimStore.getState().unmountFromPanel([selectedComponent.id])}>Soltar face</button>}
                  </div>
                  {pm && <div className="flex flex-wrap items-center gap-1 mt-1">
                    <label className="text-[10px] text-ink-600">Ø furo
                      <InspectorNumberInput type="number" className="dc-input w-16 ml-1" min={8} max={60} step={1} value={pm.cutoutMm ?? 22} onChange={(e)=> useSimStore.getState().updatePanelMount([selectedComponent.id], {cutoutMm: Math.max(8,Math.min(60,Number(e.target.value)))})}/>
                    </label>
                    <label className="text-[10px] text-ink-600">X
                      <InspectorNumberInput type="number" className="dc-input w-14 ml-1" step={5} value={pm.offsetXmm ?? 0} onChange={(e)=> useSimStore.getState().updatePanelMount([selectedComponent.id], {offsetXmm: Number(e.target.value)})}/>
                    </label>
                    <label className="text-[10px] text-ink-600">Y
                      <InspectorNumberInput type="number" className="dc-input w-14 ml-1" step={5} value={pm.offsetYmm ?? 0} onChange={(e)=> useSimStore.getState().updatePanelMount([selectedComponent.id], {offsetYmm: Number(e.target.value)})}/>
                    </label>
                  </div>}
                  <small className="text-ink-400">{parent ? `Lente/botão fora em ${parent.ref} (${pm?.face}); bornes dentro.` : 'Para luzes/botões na porta/lateral — parte fora visível, ligação dentro.'}</small>
                </div>
              })()}

              {/* Etiquetas realistas na face — só para aparelhos, não para calhas/quadro */}
              {!isPanelAccessoryType(selectedComponent.type) && <ComponentDecalControls key={selectedComponent.id} component={selectedComponent} />}
              </fieldset>
              <div className="flex flex-wrap gap-1">
                <button className="dc-btn" disabled={!!selectedComponent.locked} title={selectedComponent.locked ? 'Desbloqueie o componente para alterar a geometria.' : undefined} onClick={() => useSimStore.getState().rotateComponent(selectedComponent.id)}><IconRotate size={12} /> Girar 90°</button>
                <button className="dc-btn" disabled={!!selectedComponent.locked} onClick={() => useSimStore.getState().mirrorComponent(selectedComponent.id)}>Espelhar</button>
                {wires.some((w) => selectedComponent.terminals.some((t) => w.fromTerminalId === t.id || w.toTerminalId === t.id)) && (
                  <button
                    type="button"
                    className="dc-btn text-amber-700 bg-amber-50 hover:bg-amber-100 border-amber-200"
                    title="Desconecta todos os cabos ligados a este equipamento e deixa-os como pontas livres no sítio, permitindo arrastar o equipamento sem puxar os cabos"
                    onClick={() => useSimStore.getState().detachWiresFromComponents([selectedComponent.id])}
                  >
                    Soltar cabos
                  </button>
                )}
                <button className="dc-btn" onClick={() => useSimStore.getState().toggleLock(selectedComponent.id)}>
                  <IconLock size={12} /> {selectedComponent.locked ? 'Desbloquear' : 'Bloquear'}
                </button>
                <button className="dc-btn" onClick={() => useSimStore.getState().duplicateComponents([selectedComponent.id])}><IconCopy size={12} /> Duplicar</button>
                <button className="dc-btn-danger dc-btn" onClick={async () => {
                  const linked = wires.filter((wire) => selectedComponent.terminals.some((terminal) => wire.fromTerminalId === terminal.id || wire.toTerminalId === terminal.id)).length
                  if (linked && !await uiConfirm(`Eliminar ${selectedComponent.ref} e ${linked} cabo(s) ligado(s)?`)) return
                  useSimStore.getState().deleteComponents([selectedComponent.id])
                }}><IconDelete size={12} /> Eliminar</button>
              </div>
              <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={detachWiresOnDrag}
                  onChange={() => useSimStore.getState().toggleDetachWiresOnDrag()}
                  className="accent-brand-600 rounded"
                />
                <span>Soltar cabos ao arrastar componentes</span>
              </label>

              </div></details>
              <OptionalPartsGroup component={selectedComponent} />
              {(isPlugInRelay(selectedComponent) || isRelaySocket(selectedComponent)) && (
                <details className="dc-inspector-group" open><summary>Base de encaixe</summary><div className="dc-inspector-group-body"><RelaySocketControls component={selectedComponent} /></div></details>
              )}
              {isProgrammablePlc(selectedComponent) && <details className="dc-inspector-group" data-plc-sim-group><summary>Simular sinais (entradas)</summary><div className="dc-inspector-group-body"><PlcSignalPanel plcId={selectedComponent.id} compact /></div></details>}
              {/* estado rápido conforme o tipo — só mostra controlos realmente funcionais */}
              {(() => {
                const isThermal = importedComponentInfo(selectedComponent.type)?.behavior === 'thermal'
                const hasProt = !!protectionControlKindOf(selectedComponent.type)
                const hasDev = hasDeviceControls(selectedComponent.type) || !!industrialDeviceTypeOf(selectedComponent)
                const extraEntries = selectedStateEntries
                if (!isThermal && !hasProt && !hasDev && extraEntries.length === 0) return null
                return (
              <details className="dc-inspector-group" data-inspector-configuration open><summary>Configuração e estado</summary><div className="dc-inspector-group-body dc-inspector-state-list">
                {isThermal && <ThermalRelayControls component={selectedComponent} />}
                {hasProt && <ProtectionControls component={selectedComponent} />}
                {hasDev && <DeviceControls component={selectedComponent} />}
                {extraEntries.map(([k, v]) => {
                  const policy = inspectorStatePolicy(selectedComponent.type, k)
                  if (policy.readOnly && ['number', 'boolean', 'string'].includes(typeof v)) return <div key={k} className="dc-inspector-state-row is-readonly"><span className="dc-inspector-state-label">{stateLabel(k)}</span><output className="dc-inspector-state-output" aria-label={`${stateLabel(k)} (só leitura)`}>{typeof v === 'boolean' ? (v ? 'Sim' : 'Não') : String(v)}</output></div>
                  if (typeof v === 'boolean') {
                    return (
                      <label key={k} className="dc-inspector-state-row is-toggle">
                        <span className="dc-inspector-state-label" title={k}>{stateLabel(k)}</span>
                        <input
                          type="checkbox"
                          checked={v}
                          disabled={(!!importedComponentInfo(selectedComponent.type) && (k === 'powered' || k === 'energized')) || (!manobraAllowed && MANOBRA_STATE_KEYS.has(k))}
                          title={!manobraAllowed && MANOBRA_STATE_KEYS.has(k) ? MANOBRA_BLOCKED_TITLE : undefined}
                          onChange={(e) => useSimStore.getState().setComponentState(selectedComponent.id, { [k]: e.target.checked })}
                        />
                      </label>
                    )
                  }
                  if (typeof v === 'number') {
                    return (
                      <label key={k} className="dc-inspector-state-row">
                        <span className="dc-inspector-state-label" title={k}>{stateLabel(k)}</span>
                        <InspectorNumberInput
                          type="number"
                          min={policy.min} integer={policy.integer}
                          className="dc-input dc-inspector-state-input text-right"
                          value={v}
                          disabled={!manobraAllowed && MANOBRA_STATE_KEYS.has(k)}
                          title={!manobraAllowed && MANOBRA_STATE_KEYS.has(k) ? MANOBRA_BLOCKED_TITLE : undefined}
                          onChange={(e) => useSimStore.getState().setComponentState(selectedComponent.id, { [k]: Number(e.target.value) })}
                        />
                      </label>
                    )
                  }
                  if (k === 'glassColor') return null
                  if (k === 'color' && typeof v === 'string' && SIGNAL_LAMP_TYPES.has(selectedComponent.type)) {
                    return <LightColorStateField key={k} color={v} glass={typeof selectedComponent.state.glassColor === 'string' ? selectedComponent.state.glassColor : undefined}
                      disabled={!!selectedComponent.locked}
                      onChange={(patch) => useSimStore.getState().setComponentState(selectedComponent.id, patch)} />
                  }
                  if (k === 'color' && typeof v === 'string') {
                    return <ColorPaletteField key={k} value={v}
                      options={BODY_COLOR_OPTIONS}
                      ariaLabel={stateLabel(k).toLowerCase()} fieldLabel={stateLabel(k)}
                      onChange={(value) => useSimStore.getState().setComponentState(selectedComponent.id, { color: value })} />
                  }
                  if (selectedComponent.type === 'motor3ph' && k === 'motorConnection' && typeof v === 'string') {
                    return <label key={k} className="dc-inspector-state-row">
                      <span className="dc-inspector-state-label">{stateLabel(k)}</span>
                      <Select className="dc-input dc-inspector-state-input" value={v} onChange={(e) => useSimStore.getState().setComponentState(selectedComponent.id, { motorConnection: e.target.value })}>
                        <option value="none">Sem pontes</option><option value="star">Estrela (Y)</option><option value="delta">Triângulo (Δ)</option>
                      </Select>
                    </label>
                  }
                  if (k === 'resetMethod' && typeof v === 'string') {
                    return <label key={k} className="dc-inspector-state-row">
                      <span className="dc-inspector-state-label" title={k}>{stateLabel(k)}</span>
                      <Select className="dc-input dc-inspector-state-input" value={v} onChange={(e) => useSimStore.getState().setComponentState(selectedComponent.id, { resetMethod: e.target.value })}>
                        <option value="giro">Rodar para rearmar</option><option value="chave">Rearmar com chave</option>
                      </Select>
                    </label>
                  }
                  if (k === 'direction' && typeof v === 'string') {
                    return <label key={k} className="dc-inspector-state-row">
                      <span className="dc-inspector-state-label" title={k}>{stateLabel(k)}</span>
                      <Select className="dc-input dc-inspector-state-input" value={v} onChange={(e) => useSimStore.getState().setComponentState(selectedComponent.id, { direction: e.target.value })}>
                        <option value="stopped">Parado</option><option value="cw">Horário</option><option value="ccw">Anti-horário</option>
                      </Select>
                    </label>
                  }
                  if (typeof v === 'string') {
                    return (
                      <label key={k} className="dc-inspector-state-row">
                        <span className="dc-inspector-state-label" title={k}>{stateLabel(k)}</span>
                        <input className="dc-input dc-inspector-state-input" value={v} onChange={(e) => useSimStore.getState().setComponentState(selectedComponent.id, { [k]: e.target.value })} />
                      </label>
                    )
                  }
                  return null
                })}
              </div></details>
                )
              })()}
              {/* bornes */}
              <details className="dc-inspector-group" open><summary>Bornes <span className="dc-inspector-count">{selectedComponent.terminals.length}</span></summary><div className="dc-inspector-group-body">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] text-ink-400">Ligação e identificação</span>
                  <button className="dc-btn !h-6 !px-2 !text-[10px]" disabled={!!selectedComponent.locked} title="Adicionar e classificar segundo a ficha técnica" onClick={() => useSimStore.getState().openViewOrientationEditor(selectedComponent.id, 'terminals')}><IconPlus size={10} /> Adicionar borne</button>
                </div>
                <p className="mb-2 rounded-md border border-blue-100 bg-blue-50/70 px-2 py-1.5 text-[9px] leading-4 text-blue-800">{terminalDatasheetGuidance(selectedComponent)}</p>
                <div className="flex flex-col gap-1">
                  {selectedComponent.terminals.map((t) => (
                    <div key={t.id} className={`dc-inspector-terminal rounded-[7px] border px-2 py-2 transition-colors ${t.energized ? 'border-emerald-300 bg-state-runbg/60' : 'border-line bg-white'}`}>
                      <div className="dc-inspector-terminal-head">
                        <div className="dc-inspector-terminal-fields">
                          <input
                            className="dc-input dc-inspector-terminal-label font-mono"
                            aria-label={`Nome do borne ${t.label}`}
                            value={t.displayName ?? ''} placeholder={t.label}
                            onChange={(e) => useSimStore.getState().updateTerminal(t.id, { displayName: e.target.value })}
                          />
                          <LabelLibrary
                            title="Escolher rótulo padrão IEC para este borne"
                            onPick={(l) => useSimStore.getState().updateTerminal(t.id, { displayName: l })}
                          />
                          <Select
                            className="dc-select dc-inspector-terminal-kind"
                            aria-label={`Função do borne ${t.label}`}
                            value={t.kind}
                            onChange={(e) => useSimStore.getState().updateTerminal(t.id, { kind: e.target.value as TerminalKind })}
                          >
                            {Object.entries(TERMINAL_KIND_LABEL).map(([k, v]) => (
                              <option key={k} value={k}>{v}</option>
                            ))}
                          </Select>
                          <input
                            type="color"
                            aria-label={`Cor do borne ${t.label}`}
                            title={`Cor do borne ${t.label}`}
                            className="dc-inspector-terminal-color"
                            value={t.color}
                            onChange={(e) => useSimStore.getState().updateTerminal(t.id, { color: e.target.value })}
                          />
                        </div>
                        <div className="dc-inspector-terminal-actions">
                          <button type="button" className="dc-btn dc-inspector-terminal-edit" title="Editar este borne no painel completo do componente" onClick={() => {
                            useSimStore.getState().openViewOrientationEditor(selectedComponent.id, 'terminals')
                            useSimStore.getState().setViewActiveTerminal(t.id)
                          }}>Editar</button>
                          <button type="button" disabled={!!selectedComponent.locked} aria-label={`Remover borne ${t.label}`} className="dc-icon-btn dc-inspector-terminal-remove !text-state-error !border-transparent hover:!bg-state-errorbg" title="Remover borne" onClick={async () => {
                            const linked = wires.filter((wire) => wire.fromTerminalId === t.id || wire.toTerminalId === t.id).length
                            if (linked && !await uiConfirm(`Remover o borne ${t.label} e ${linked} cabo(s) ligado(s)?`)) return
                            useSimStore.getState().deleteTerminal(t.id)
                          }}><IconClose size={11} /></button>
                        </div>
                      </div>
                      <label className="mt-1.5 flex min-w-0 flex-col gap-0.5 text-[9px] text-ink-400"><span>Categoria elétrica {t.electricalClass ? '· definida' : '· sugestão da ficha'}</span><Select
                        className="dc-select !h-[26px] !text-[10px]"
                        aria-label={`Categoria elétrica do borne ${t.label}`}
                        value={terminalElectricalClassOf(selectedComponent, t)}
                        onChange={(e) => useSimStore.getState().updateTerminal(t.id, { electricalClass: e.target.value as TerminalElectricalClass, electricalClassCustom: e.target.value === 'other' ? t.electricalClassCustom : undefined })}
                      >{Object.entries(TERMINAL_ELECTRICAL_CLASS_LABEL).map(([id, classLabel]) => <option key={id} value={id}>{classLabel}</option>)}</Select></label>
                      {terminalElectricalClassOf(selectedComponent, t) === 'other' && <label className="mt-1 flex min-w-0 flex-col gap-0.5 text-[9px] text-ink-400"><span>Designação personalizada</span><input className="dc-input !h-[26px] !text-[10px]" value={t.electricalClassCustom ?? ''} placeholder="Ex.: PE, contacto seco" onChange={(e) => useSimStore.getState().updateTerminal(t.id, { electricalClassCustom: e.target.value || undefined })} /></label>}
                      <div className="text-[10px] text-ink-600 mt-1">Código físico: <code>{t.label}</code></div>
                      <div className="dc-inspector-terminal-details">
                        <label><span>Tipo</span><Select
                          className="dc-select !h-[24px] !text-[10px]"
                          aria-label={`Tipo físico do borne ${t.label}`}
                          value={t.terminalType}
                          onChange={(e) => useSimStore.getState().updateTerminal(t.id, { terminalType: e.target.value as TerminalType })}
                        >
                          {Object.entries(TERMINAL_TYPE_LABEL).map(([k, v]) => (
                            <option key={k} value={k}>{v}</option>
                          ))}
                        </Select></label>
                        <label><span>X</span><InspectorNumberInput aria-label={`Posição X do borne ${t.label} (0–1)`} disabled={!!selectedComponent.locked} type="number" step="0.05" min="0" max="1" className="dc-input !h-[24px] !text-[10px]" value={t.x} onChange={(e) => useSimStore.getState().updateTerminal(t.id, { x: Number(e.target.value) })} /></label>
                        <label><span>Y</span><InspectorNumberInput aria-label={`Posição Y do borne ${t.label} (0–1)`} disabled={!!selectedComponent.locked} type="number" step="0.05" min="0" max="1" className="dc-input !h-[24px] !text-[10px]" value={t.y} onChange={(e) => useSimStore.getState().updateTerminal(t.id, { y: Number(e.target.value) })} /></label>
                        <label title="Diâmetro do desenho do borne no Esquema (vazio = padrão)"><span>Ø px</span><InspectorNumberInput allowEmpty aria-label={`Diâmetro do borne ${t.label} (px)`} type="number" step="0.5" min="3" max="24" placeholder="auto" className="dc-input !h-[24px] !text-[10px]" value={t.diameter ?? ''} onChange={(e) => useSimStore.getState().updateTerminal(t.id, { diameter: e.target.value === '' ? undefined : Number(e.target.value) })} /></label>
                      </div>
                      <span className={`dc-inspector-terminal-status ${t.energized ? 'is-on' : ''}`}>{t.energized ? '● Energizado' : '○ Sem tensão'}</span>
                    </div>
                  ))}
                </div>
              </div></details>
            </section>
          )}

          {/* ------------------------------------------------------ cabo */}
          {selectedWire && (() => {
            const multiCount = selectedWireIds.length > 1 && selectedWireIds.includes(selectedWire.id) ? selectedWireIds.length : 1
            const targetIds = multiCount > 1 ? selectedWireIds : [selectedWire.id]
            const outerMm = cableOuterDiameterMm(selectedWire.gauge, {
              conductorCount: selectedWire.conductorCount,
              sheathed: selectedWire.sheathed,
            })
            const minBendMm = wireMinBendRadiusMm(selectedWire.gauge, {
              conductorCount: selectedWire.conductorCount,
              sheathed: selectedWire.sheathed,
              flexibility: selectedWire.flexibility,
            })
            const ampacityA = wireAmpacityIecA(selectedWire.gauge)
            const estLengthMm = (() => {
              const aLocal = !selectedWire.fromPoint && wireFromOwner && wireFromTerminal ? componentTerminalLocal(wireFromOwner, wireFromTerminal) : null
              const bLocal = !selectedWire.toPoint && wireToOwner && wireToTerminal ? componentTerminalLocal(wireToOwner, wireToTerminal) : null
              const aPt = aLocal && wireFromOwner
                ? { x: wireFromOwner.schematicX + aLocal.x, y: wireFromOwner.schematicY + aLocal.y }
                : selectedWire.fromPoint ?? null
              const bPt = bLocal && wireToOwner
                ? { x: wireToOwner.schematicX + bLocal.x, y: wireToOwner.schematicY + bLocal.y }
                : selectedWire.toPoint ?? null
              if (!aPt || !bPt) return 0
              const geom = wireGeometryForWire(selectedWire, aPt, bPt)
              return Math.max(10, Math.round(polylineLength(geom.curvePts ?? geom.pts) / Math.max(0.1, SCHEMATIC_PX_PER_MM)))
            })()
            const displayLengthMm = selectedWire.lengthMm && selectedWire.lengthMm > 0 ? selectedWire.lengthMm : estLengthMm
            const linkedFrom = !selectedWire.fromPoint ? wireFromTerminal : undefined
            const linkedTo = !selectedWire.toPoint ? wireToTerminal : undefined
            const fromColor = wireEndColor(selectedWire, 'from', linkedFrom?.color)
            const toColor = wireEndColor(selectedWire, 'to', linkedTo?.color)
            const fromType = selectedWire.fromEndType ?? selectedWire.endType ?? 'none'
            const toType = selectedWire.toEndType ?? selectedWire.endType ?? 'none'
            const fromTag = linkedFrom ? `${wireFromOwner?.ref}.${linkedFrom.label}` : (selectedWire.netFrom ? `Rede ${selectedWire.netFrom}` : 'Ponta livre')
            const toTag = linkedTo ? `${wireToOwner?.ref}.${linkedTo.label}` : (selectedWire.netTo ? `Rede ${selectedWire.netTo}` : 'Ponta livre')
            const bundleMembers = selectedWire.bundleId ? wires.filter((w) => w.bundleId === selectedWire.bundleId) : []
            const presetId = matchCablePreset(selectedWire)
            const presetLabel = presetId === 'custom' ? 'Personalizado' : (CABLE_PRESETS.find((p) => p.id === presetId)?.label ?? '')
            const accessoryCount = (selectedWire.isolation?.length ?? 0) + (selectedWire.spirals?.length ?? 0) + (selectedWire.markers?.length ?? 0)
            const wp2dCount = selectedWire.waypoints?.length ?? 0
            const wp3dCount = selectedWire.waypoints3D?.length ?? 0
            const iecSuggestedColor = WIRE_KIND_COLOR[selectedWire.kind]

            return (
              <section key={wireSelectionKey} className="dc-wire-inspector wi-root" aria-label="Propriedades do cabo selecionado">
                {/* Cabeçalho fixo com identificação, estado energético e amostra técnica */}
                <header className="dc-wire-inspector-head wi-hero">
                  <div className="wi-hero-top">
                    <div className="wi-hero-title">
                      <strong>Cabo {selectedWire.number || selectedWire.id}</strong>
                      {multiCount > 1 && <span className="wi-badge is-brand" title={`${multiCount} cabos selecionados (edição em lote)`}>+{multiCount - 1}</span>}
                      {selectedWire.locked && <span className="wi-badge" title="Cabo bloqueado"><IconLock size={10} />Fixo</span>}
                    </div>
                    <span className={`dc-chip ${selectedWire.energized ? '!border-amber-300 !bg-amber-50 !text-energy-deep' : ''}`}>
                      <span className={`inline-block h-1.5 w-1.5 rounded-full ${selectedWire.energized ? 'bg-energy' : 'bg-ink-300'}`} />
                      {selectedWire.energized ? 'ENERGIZADO' : 'SEM TENSÃO'}
                    </span>
                  </div>

                  <CableSpecimen
                    color={selectedWire.color}
                    gauge={selectedWire.gauge}
                    flexibility={selectedWire.flexibility}
                    conductorCount={selectedWire.conductorCount ?? 1}
                    sheathed={!!selectedWire.sheathed}
                    sheathColor={selectedWire.sheathColor}
                    conductorColors={selectedWire.conductorColors}
                    fromEndType={fromType}
                    toEndType={toType}
                    fromEndColor={fromColor}
                    toEndColor={toColor}
                  />

                  {/* Ligação A ↔ B com navegação para os bornes e inversão de sentido */}
                  <div className="wi-endpoints" role="group" aria-label="Ligação entre pontas do cabo">
                    <button
                      type="button"
                      className={`wi-endpoint ${!linkedFrom ? 'is-free' : ''}`}
                      disabled={!linkedFrom}
                      title={linkedFrom ? `Inspecionar borne ${fromTag}` : 'Ponta inicial livre (sem borne)'}
                      onClick={() => linkedFrom && useSimStore.getState().selectTerminal(linkedFrom.id)}
                    >
                      <span className="wi-endpoint-side">A</span>
                      <span className="wi-endpoint-body">
                        <b>{fromTag}</b>
                        <small>{wireFromClass && linkedFrom ? TERMINAL_ELECTRICAL_CLASS_LABEL[wireFromClass] : 'Sem borne'}</small>
                      </span>
                    </button>
                    <button
                      type="button"
                      className="wi-swap-btn"
                      disabled={!!selectedWire.locked || !wireEditingStopped}
                      title="Inverter sentido do cabo (A ↔ B, incluindo ponteiras, curvas e anilhas)"
                      aria-label="Inverter sentido do cabo"
                      onClick={() => useSimStore.getState().reverseWire(selectedWire.id)}
                    >
                      <IconRotate size={12} />
                    </button>
                    <button
                      type="button"
                      className={`wi-endpoint ${!linkedTo ? 'is-free' : ''}`}
                      disabled={!linkedTo}
                      title={linkedTo ? `Inspecionar borne ${toTag}` : 'Ponta final livre (sem borne)'}
                      onClick={() => linkedTo && useSimStore.getState().selectTerminal(linkedTo.id)}
                    >
                      <span className="wi-endpoint-side">B</span>
                      <span className="wi-endpoint-body">
                        <b>{toTag}</b>
                        <small>{wireToClass && linkedTo ? TERMINAL_ELECTRICAL_CLASS_LABEL[wireToClass] : 'Sem borne'}</small>
                      </span>
                    </button>
                  </div>

                  {!wireClassCompatible && (
                    <div className="wi-alert is-warn" role="status">
                      <strong>Verificar compatibilidade elétrica</strong>
                      <span>
                        {wireFromClass ? TERMINAL_ELECTRICAL_CLASS_LABEL[wireFromClass] : '—'} ligado a {wireToClass ? TERMINAL_ELECTRICAL_CLASS_LABEL[wireToClass] : '—'}. Confirme a função do circuito.
                      </span>
                    </div>
                  )}

                  {/* Cotas físicas rápidas */}
                  <div className="wi-kpis" aria-label="Resumo técnico do cabo">
                    <div className="wi-kpi" title={selectedWire.lengthMm ? 'Comprimento definido para lista de material' : 'Comprimento estimado pela geometria'}>
                      <small>Compr.</small>
                      <strong>{displayLengthMm > 0 ? `${selectedWire.lengthMm ? '' : '≈ '}${displayLengthMm} mm` : '—'}</strong>
                    </div>
                    <div className="wi-kpi" title="Diâmetro exterior calculado pela secção, nº de veias e capa">
                      <small>Diâmetro</small>
                      <strong>Ø {outerMm.toFixed(1)} mm</strong>
                    </div>
                    <div className="wi-kpi" title={`Raio mínimo recomendado: ${minBendMm} mm${ampacityA ? ` · Corrente ref. IEC 60204-1: ${ampacityA} A` : ''}`}>
                      <small>Rmín{ampacityA ? ' · Iz' : ''}</small>
                      <strong>{minBendMm.toFixed(0)} mm{ampacityA ? ` · ${ampacityA}A` : ''}</strong>
                    </div>
                  </div>
                </header>

                {/* Ações principais rápidas */}
                <div className="wi-primary-actions" role="group" aria-label="Organização e bloqueio do cabo">
                  <button
                    type="button"
                    className="dc-btn"
                    disabled={!!selectedWire.locked || !wireEditingStopped}
                    title="Recalcula o percurso nas duas vistas; Ctrl+Z desfaz"
                    onClick={() => useSimStore.getState().organizeWires(targetIds)}
                  >
                    Organizar cabo
                  </button>
                  <button
                    type="button"
                    className="dc-btn"
                    aria-pressed={!!selectedWire.locked}
                    disabled={!wireEditingStopped || wireEditDirty}
                    title={wireEditDirty ? 'Guarde ou cancele a edição antes de bloquear os cabos.' : undefined}
                    onClick={() => useSimStore.getState().setWiresLocked(!selectedWire.locked, targetIds)}
                  >
                    {selectedWire.locked ? <IconUnlock size={12} /> : <IconLock size={12} />}
                    {selectedWire.locked ? 'Desbloquear cabo' : 'Bloquear cabo'}
                  </button>
                  <button
                    type="button"
                    className="dc-btn"
                    title="Copia cor, secção, condutor, capa, traçado e ponteira deste cabo para os próximos cabos novos"
                    onClick={() => useSimStore.getState().copyWireToDefaults(selectedWire.id)}
                  >
                    <IconCopy size={12} />Copiar estilo
                  </button>
                </div>

                {selectedWire.locked && (
                  <p className="wi-lock-note">
                    Cabo bloqueado: edição e eliminação protegidas. As pontas acompanham os equipamentos.
                  </p>
                )}

                {multiCount > 1 && (
                  <p className="wi-batch-note">
                    Edição em lote ativa: alterações de cor, secção, traçado ou terminais aplicam-se aos <b>{multiCount} cabos</b> selecionados.
                  </p>
                )}

                {wireEditDirty && (
                  <div className="wi-sync-bar" role="status">
                    <span>Alterações aplicadas ao Esquema e 3D</span>
                    <div className="wi-sync-btns">
                      <button type="button" className="dc-btn !h-6 !px-2 !text-[10px]" onClick={cancelWireChanges}>Cancelar</button>
                      <button type="button" className="dc-btn-primary dc-btn !h-6 !px-2 !text-[10px]" onClick={saveWireChanges}>Guardar cabo</button>
                    </div>
                  </div>
                )}

                <fieldset disabled={!!selectedWire.locked} className="wi-fieldset" style={{ border: 0, margin: 0, padding: 0 }}>
                  {/* 1. TRAÇADO E CURVAS (2D + 3D) */}
                  <details className="dc-inspector-group" open>
                    <summary>
                      <span>Traçado e curvas</span>
                      <span className="wi-sum-meta">
                        {WIRE_ROUTE_LABEL[selectedWire.route]}
                        {(wp3dCount || wp2dCount) > 0 ? ` · ${wp3dCount || wp2dCount} pt` : ''}
                      </span>
                    </summary>
                    <div className="dc-inspector-group-body space-y-2">
                      <div className="wo-routes" role="radiogroup" aria-label="Roteamento do cabo">
                        {WIRE_ROUTES_ORDER.map((route: WireRoute) => {
                          const on = selectedWire.route === route
                          return (
                            <button
                              key={route}
                              type="button"
                              role="radio"
                              aria-checked={on}
                              title={WIRE_ROUTE_HINT[route]}
                              className={`wo-route${on ? ' is-on' : ''}`}
                              onClick={() => patchSelectedWire({ route })}
                            >
                              <WireRouteGlyph route={route} size={24} />
                              <span>{WIRE_ROUTE_LABEL[route]}</span>
                            </button>
                          )
                        })}
                      </div>

                      {selectedWire.route !== 'direct' && wp2dCount === 0 && (
                        <div className="wi-slider-field">
                          <div className="wi-slider-head">
                            <label className={label + ' !mb-0'}>Posição da dobra</label>
                            <span className="wi-slider-val">
                              {Math.round(selectedWire.bend * 100)}%
                              {Math.abs(selectedWire.bend - 0.5) > 0.01 && (
                                <button type="button" onClick={() => patchSelectedWire({ bend: 0.5 })} title="Centrar dobra a 50%">50%</button>
                              )}
                            </span>
                          </div>
                          <input
                            type="range"
                            min={0.05}
                            max={0.95}
                            step={0.05}
                            aria-label="Posição da dobra"
                            className="w-full"
                            value={selectedWire.bend}
                            onChange={(e) => patchSelectedWire({ bend: Number(e.target.value) })}
                          />
                        </div>
                      )}

                      {selectedWire.route === 'arc' && wp2dCount === 0 && (
                        <div className="wi-slider-field">
                          <div className="wi-slider-head">
                            <label className={label + ' !mb-0'}>Barriga da curva</label>
                            <span className="wi-slider-val">
                              {(selectedWire.curveOffset ?? 0).toFixed(0)} px
                              {(selectedWire.curveOffset ?? 0) !== 0 && (
                                <button type="button" onClick={() => patchSelectedWire({ curveOffset: 0 })} title="Repor curvatura a 0 px">0</button>
                              )}
                            </span>
                          </div>
                          <input
                            type="range"
                            min={-150}
                            max={150}
                            step={5}
                            aria-label="Curvatura do cabo"
                            className="w-full"
                            value={selectedWire.curveOffset ?? 0}
                            onChange={(e) => patchSelectedWire({ curveOffset: Number(e.target.value) })}
                          />
                        </div>
                      )}

                      {wp2dCount > 0 && (
                        <div className="wi-subcard wi-2d-curve-card">
                          <div className="wi-subcard-head">
                            <span>Pontos de curva 2D</span>
                            <b>{wp2dCount} {wp2dCount === 1 ? 'ponto' : 'pontos'}</b>
                          </div>
                          <div className="wi-chip-actions">
                            <button
                              type="button"
                              className="dc-btn"
                              disabled={!wireEditingStopped}
                              title="Alinha todos os troços a 90° e remove micro-desvios"
                              onClick={() => useSimStore.getState().refineWireCurve2D(selectedWire.id, 'ortho')}
                            >
                              Alinhar 90°
                            </button>
                            {wp2dCount >= 2 && (
                              <button
                                type="button"
                                className="dc-btn"
                                disabled={!wireEditingStopped}
                                title="Remove pontos de curva colineares ou redundantes"
                                onClick={() => useSimStore.getState().refineWireCurve2D(selectedWire.id, 'simplify')}
                              >
                                Simplificar
                              </button>
                            )}
                            <button
                              type="button"
                              className="dc-btn"
                              disabled={!wireEditingStopped}
                              title="Remove todos os pontos de curva 2D e volta ao traçado base"
                              onClick={() => useSimStore.getState().refineWireCurve2D(selectedWire.id, 'clear')}
                            >
                              Limpar pontos
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Traçado 3D: o Panel3D monta aqui os controlos de curva, R_mín, pontas e coordenadas mm */}
                      <div ref={setWireActionSlot} className="dc-wire-3d-actions" data-slot="wire-3d" />

                      <LayerButtons />
                    </div>
                  </details>

                  {/* 2. IDENTIFICAÇÃO E CHICOTE */}
                  <details className="dc-inspector-group" open>
                    <summary>
                      <span>Identificação e chicote</span>
                      <span className="wi-sum-meta">
                        {bundleMembers.length > 0 ? `Chicote (${bundleMembers.length})` : (selectedWire.label || selectedWire.number || '—')}
                      </span>
                    </summary>
                    <div className="dc-inspector-group-body space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className={label}>Identificação</label>
                          <div className="flex items-center gap-1">
                            <input
                              className="dc-input"
                              aria-label="Identificação do cabo"
                              placeholder="Ex.: W1"
                              value={selectedWire.number ?? ''}
                              onChange={(e) => patchSelectedWire({ number: e.target.value })}
                            />
                            <LabelLibrary
                              title="Escolher rótulo padrão IEC para a identificação do cabo"
                              onPick={(l) => patchSelectedWire({ number: l })}
                            />
                            <button
                              type="button"
                              className="dc-btn !px-1.5 text-[10px] font-mono"
                              disabled={!wireEditingStopped || !!selectedWire.locked}
                              title="Atribuir automaticamente a próxima etiqueta livre (W1, W2…)"
                              onClick={() => useSimStore.getState().autoNumberWire(selectedWire.id)}
                            >
                              Auto
                            </button>
                          </div>
                        </div>
                        <div>
                          <label className={label}>Etiqueta / sinal</label>
                          <div className="flex items-center gap-1">
                            <input
                              className="dc-input"
                              aria-label="Etiqueta do cabo"
                              placeholder="Ex.: L1, +24V"
                              value={selectedWire.label ?? ''}
                              onChange={(e) => patchSelectedWire({ label: e.target.value })}
                            />
                            <LabelLibrary
                              title="Escolher rótulo padrão IEC para a etiqueta do cabo"
                              onPick={(l) => patchSelectedWire({ label: l })}
                            />
                          </div>
                        </div>
                      </div>

                      <div>
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <label className={label + ' !mb-0'}>Metragem para lista (mm)</label>
                          {estLengthMm > 0 && selectedWire.lengthMm !== estLengthMm && (
                            <button
                              type="button"
                              className="wi-link-btn"
                              title={`Preencher com o comprimento calculado (${estLengthMm} mm)`}
                              onClick={() => patchSelectedWire({ lengthMm: estLengthMm })}
                            >
                              Usar ≈ {estLengthMm} mm
                            </button>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <InspectorNumberInput
                            allowEmpty
                            type="number"
                            min={0}
                            step={5}
                            aria-label="Metragem (mm)"
                            placeholder={estLengthMm > 0 ? `Auto (≈ ${estLengthMm} mm)` : '0'}
                            className="dc-input"
                            value={selectedWire.lengthMm ?? ''}
                            onChange={(e) => {
                              const raw = e.target.value.trim()
                              patchSelectedWire({ lengthMm: raw === '' ? undefined : Math.max(0, Number(raw)) })
                            }}
                          />
                          {selectedWire.lengthMm !== undefined && (
                            <button
                              type="button"
                              className="dc-btn shrink-0"
                              title="Voltar ao cálculo automático pela geometria"
                              onClick={() => patchSelectedWire({ lengthMm: undefined })}
                            >
                              Auto
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="wi-subcard">
                        <div className="wi-subcard-head">
                          <span>Chicote / filaçamento</span>
                          {bundleMembers.length > 0 ? (
                            <b className="is-brand">{bundleMembers.length} cabos</b>
                          ) : (
                            <small>Isolado</small>
                          )}
                        </div>
                        <div className="wi-chip-actions">
                          <button
                            type="button"
                            className="dc-btn"
                            disabled={!wireEditingStopped}
                            title="Agrupa os cabos selecionados num único chicote com abraçadeiras PA66 no 3D"
                            onClick={() => useSimStore.getState().laceWires()}
                          >
                            Filaçar seleção
                          </button>
                          <button
                            type="button"
                            className="dc-btn"
                            disabled={!selectedWire.bundleId || !wireEditingStopped}
                            onClick={() => useSimStore.getState().unlaceWires()}
                          >
                            Desfilaçar
                          </button>
                          {selectedWire.bundleId && bundleMembers.length > 1 && (
                            <button
                              type="button"
                              className="dc-btn"
                              title="Seleciona todos os cabos que pertencem a este chicote"
                              onClick={() => useSimStore.getState().selectBundleWires(selectedWire.bundleId!)}
                            >
                              Selecionar chicote ({bundleMembers.length})
                            </button>
                          )}
                        </div>
                        <small className="wi-hint">
                          {selectedWire.bundleId
                            ? `Chicote «${selectedWire.bundleId}» · ${bundleMembers.map((w) => w.number || w.id).slice(0, 6).join(', ')}${bundleMembers.length > 6 ? '…' : ''}`
                            : 'Shift+clique em 2+ cabos e use «Filaçar seleção» para agrupar com abraçadeiras.'}
                        </small>
                      </div>
                    </div>
                  </details>

                  {/* 3. CONDUTOR, COR E SECÇÃO */}
                  <details className="dc-inspector-group" open>
                    <summary>
                      <span>Condutor, cor e secção</span>
                      <span className="wi-sum-meta">
                        <i className="wi-sum-dot" style={{ background: wireColorSwatchBg(selectedWire.color) }} />
                        {(selectedWire.conductorCount ?? 1) > 1 ? `${selectedWire.conductorCount}×` : ''}{selectedWire.gauge}
                      </span>
                    </summary>
                    <div className="dc-inspector-group-body space-y-2.5" data-wire-inspector-kind={selectedWire.kind}>
                      <div>
                        <label className={label}>Tipo de conduta</label>
                        <div className="wo-routes" role="radiogroup" aria-label="Tipo de conduta (elétrica, hidráulica ou pneumática)">
                          {([
                            ['control', 'Cabo elétrico', () => patchSelectedWire({ kind: 'control', gauge: /Ø\s*[0-9]/i.test(selectedWire.gauge) ? '1.5mm²' : selectedWire.gauge, endType: 'ferrule', fromEndType: 'ferrule', toEndType: 'ferrule' })],
                            ['hydraulic', 'Tubo hidráulico', () => patchSelectedWire({ kind: 'hydraulic', gauge: /DN\d+/i.test(selectedWire.gauge) ? selectedWire.gauge : 'DN20 (Ø25mm)', color: 'blue', endType: 'hydraulicFitting', fromEndType: 'hydraulicFitting', toEndType: 'hydraulicFitting', route: 'orthogonal', hydraulicFitting: selectedWire.hydraulicFitting ?? 'union', hydraulicMaterial: selectedWire.hydraulicMaterial ?? 'ppr', hydraulicPressureBar: selectedWire.hydraulicPressureBar ?? 10 })],
                            ['pneumatic', 'Tubo pneumático', () => patchSelectedWire({ kind: 'pneumatic', gauge: /^PU\s*Ø/i.test(selectedWire.gauge) ? selectedWire.gauge : 'PU Ø6mm', color: 'lightblue', endType: 'pneumaticPushIn', fromEndType: 'pneumaticPushIn', toEndType: 'pneumaticPushIn', route: 'arc', pneumaticFitting: selectedWire.pneumaticFitting ?? 'pushInStraight', pneumaticPressureBar: selectedWire.pneumaticPressureBar ?? 6 })],
                          ] as const).map(([id, text, onPick]) => {
                            const active = id === 'control' ? (selectedWire.kind !== 'hydraulic' && selectedWire.kind !== 'pneumatic') : selectedWire.kind === id
                            return (
                              <button
                                key={id}
                                type="button"
                                role="radio"
                                aria-checked={active}
                                className={`wo-route${active ? ' is-on' : ''}`}
                                onClick={onPick}
                              >
                                <span>{text}</span>
                              </button>
                            )
                          })}
                        </div>
                      </div>

                      {selectedWire.kind !== 'hydraulic' && selectedWire.kind !== 'pneumatic' && (
                        <div>
                          <label className={label}>Função do circuito (IEC 60204-1)</label>
                          <Select
                            className="dc-select"
                            aria-label="Tipo / função do cabo"
                            value={selectedWire.kind}
                            onChange={(e) => {
                              const kind = e.target.value as keyof typeof WIRE_KIND_COLOR
                              patchSelectedWire({ kind, color: WIRE_KIND_COLOR[kind] })
                            }}
                          >
                            {Object.entries(WIRE_KIND_LABEL)
                              .filter(([k]) => k !== 'hydraulic' && k !== 'pneumatic')
                              .map(([k, v]) => (
                                <option key={k} value={k}>{v}</option>
                              ))}
                          </Select>
                        </div>
                      )}

                      <div>
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <label className={label + ' !mb-0'}>
                            {selectedWire.kind === 'hydraulic' ? 'Cor da tubagem / fluido' : selectedWire.kind === 'pneumatic' ? 'Cor do tubo PU' : 'Cor do isolamento'}
                          </label>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10.5px] font-medium text-ink-600">{WIRE_COLOR_LABEL[selectedWire.color]}</span>
                            {selectedWire.kind !== 'hydraulic' && selectedWire.kind !== 'pneumatic' && selectedWire.color !== iecSuggestedColor && (
                              <button
                                type="button"
                                className="wo-auto"
                                title={`Aplicar cor normalizada IEC 60204-1 para ${WIRE_KIND_LABEL[selectedWire.kind]} (${WIRE_COLOR_LABEL[iecSuggestedColor]})`}
                                onClick={() => patchSelectedWire({ color: iecSuggestedColor })}
                              >
                                IEC
                              </button>
                            )}
                          </div>
                        </div>
                        <div className="wo-swatches" role="radiogroup" aria-label="Cor da conduta">
                          {(selectedWire.kind === 'hydraulic'
                            ? (['blue', 'red', 'grey', 'green', 'yellow', 'white'] as WireColor[])
                            : selectedWire.kind === 'pneumatic'
                              ? (['lightblue', 'grey', 'black', 'orange', 'blue'] as WireColor[])
                              : WIRE_COLOR_ORDER
                          ).map((name: WireColor) => {
                            const on = selectedWire.color === name
                            return (
                              <button
                                key={name}
                                type="button"
                                role="radio"
                                aria-checked={on}
                                aria-label={WIRE_COLOR_LABEL[name]}
                                title={WIRE_COLOR_LABEL[name]}
                                className={`wo-swatch${on ? ' is-on' : ''}`}
                                style={{ background: wireColorSwatchBg(name) }}
                                onClick={() => patchSelectedWire({ color: name })}
                              />
                            )
                          })}
                        </div>
                      </div>

                      <div>
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <label className={label + ' !mb-0'}>
                            {selectedWire.kind === 'hydraulic' ? 'Diâmetro hidráulico' : selectedWire.kind === 'pneumatic' ? 'Diâmetro tubo PU' : 'Secção nominal'}
                          </label>
                          <span className="text-[10px] font-mono text-ink-500">
                            {selectedWire.gauge} · Ø {outerMm.toFixed(1)} mm{selectedWire.kind !== 'hydraulic' && selectedWire.kind !== 'pneumatic' && ampacityA ? ` · ≈ ${ampacityA} A` : ''}
                          </span>
                        </div>
                        <div className="wo-gauges" role="radiogroup" aria-label="Bitola da conduta">
                          {(selectedWire.kind === 'hydraulic' ? HYDRAULIC_GAUGES : selectedWire.kind === 'pneumatic' ? PNEUMATIC_GAUGES : WIRE_GAUGES).map((g) => {
                            const on = selectedWire.gauge === g
                            return (
                              <button
                                key={g}
                                type="button"
                                role="radio"
                                aria-checked={on}
                                aria-label={`Bitola ${g}`}
                                className={`wo-gauge${on ? ' is-on' : ''}`}
                                onClick={() => patchSelectedWire({ gauge: g })}
                              >
                                {g.includes('mm²') ? <>{g.replace('mm²', '')}<i>mm²</i></> : <span>{g}</span>}
                              </button>
                            )
                          })}
                        </div>
                      </div>

                      {/* OPÇÕES EXCLUSIVAMENTE HIDRÁULICAS DO TUBO SELECIONADO */}
                      {selectedWire.kind === 'hydraulic' && (
                        <div className="space-y-2" data-selected-hydraulic-controls>
                          <div>
                            <label className={label}>Uniões e acessórios hidráulicos</label>
                            <div className="wo-presets" role="radiogroup" aria-label="Acessório hidráulico">
                              {([
                                ['union', 'União roscada', 'Latão G 1"'],
                                ['elbow90', 'Cotovelo 90°', 'Curva latão'],
                                ['tee', 'União em T', 'Derivação 3 vias'],
                                ['valve', 'Válvula esfera', 'Corte 1/4 volta'],
                                ['flange', 'Flange PN16', 'Alta pressão'],
                                ['gauge', 'Manómetro', 'Tomada pressão'],
                              ] as const).map(([id, title, hint]) => {
                                const on = (selectedWire.hydraulicFitting ?? 'union') === id
                                return (
                                  <button
                                    key={id}
                                    type="button"
                                    role="radio"
                                    aria-checked={on}
                                    className={`wo-preset${on ? ' is-on' : ''}`}
                                    onClick={() => patchSelectedWire({ hydraulicFitting: id, endType: 'hydraulicFitting', fromEndType: 'hydraulicFitting', toEndType: 'hydraulicFitting' })}
                                  >
                                    <strong>{title}</strong>
                                    <small>{hint}</small>
                                  </button>
                                )
                              })}
                            </div>
                          </div>
                          <div>
                            <label className={label}>Material e pressão</label>
                            <div className="wo-gauges">
                              {(['ppr', 'pvc', 'inox', 'copper'] as const).map((mat) => (
                                <button
                                  key={mat}
                                  type="button"
                                  className={`wo-gauge${(selectedWire.hydraulicMaterial ?? 'ppr') === mat ? ' is-on' : ''}`}
                                  onClick={() => patchSelectedWire({ hydraulicMaterial: mat })}
                                >
                                  <span>{mat.toUpperCase()}</span>
                                </button>
                              ))}
                              {[10, 16].map((bar) => (
                                <button
                                  key={bar}
                                  type="button"
                                  className={`wo-gauge${(selectedWire.hydraulicPressureBar ?? 10) === bar ? ' is-on' : ''}`}
                                  onClick={() => patchSelectedWire({ hydraulicPressureBar: bar })}
                                >
                                  <span>{`PN${bar}`}</span>
                                </button>
                              ))}
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-1.5">
                            <button type="button" className="dc-btn text-[10.5px] justify-center" onClick={() => { const st = useSimStore.getState(); const id = st.addComponent('hydraulicTee', 380, 260); if (id) st.selectComponents([id]) }}>
                              + Inserir Tê hidráulico
                            </button>
                            <button type="button" className="dc-btn text-[10.5px] justify-center" onClick={() => { const st = useSimStore.getState(); const id = st.addComponent('hydraulicValve', 380, 260); if (id) st.selectComponents([id]) }}>
                              + Inserir Válvula esfera
                            </button>
                          </div>
                        </div>
                      )}

                      {/* OPÇÕES EXCLUSIVAMENTE PNEUMÁTICAS DO TUBO SELECIONADO */}
                      {selectedWire.kind === 'pneumatic' && (
                        <div className="space-y-2" data-selected-pneumatic-controls>
                          <div>
                            <label className={label}>Conectores e uniões Push-In</label>
                            <div className="wo-presets" role="radiogroup" aria-label="Conector pneumático">
                              {([
                                ['pushInStraight', 'Push-In reto', 'Racor rápido'],
                                ['pushInElbow90', 'Cotovelo 90°', 'Joelho orientável'],
                                ['pushInTee', 'União em T', 'Derivação 3 vias'],
                                ['pushInY', 'União em Y', 'Bifurcação dupla'],
                                ['flowControl', 'Regulador caudal', 'Estrangulador'],
                                ['silencer', 'Silenciador', 'Escape latão'],
                              ] as const).map(([id, title, hint]) => {
                                const on = (selectedWire.pneumaticFitting ?? 'pushInStraight') === id
                                return (
                                  <button
                                    key={id}
                                    type="button"
                                    role="radio"
                                    aria-checked={on}
                                    className={`wo-preset${on ? ' is-on' : ''}`}
                                    onClick={() => patchSelectedWire({ pneumaticFitting: id, endType: 'pneumaticPushIn', fromEndType: 'pneumaticPushIn', toEndType: 'pneumaticPushIn' })}
                                  >
                                    <strong>{title}</strong>
                                    <small>{hint}</small>
                                  </button>
                                )
                              })}
                            </div>
                          </div>
                          <div>
                            <label className={label}>Pressão de serviço</label>
                            <div className="wo-gauges">
                              {[4, 6, 8, 10].map((bar) => (
                                <button
                                  key={bar}
                                  type="button"
                                  className={`wo-gauge${(selectedWire.pneumaticPressureBar ?? 6) === bar ? ' is-on' : ''}`}
                                  onClick={() => patchSelectedWire({ pneumaticPressureBar: bar })}
                                >
                                  <span>{`${bar} bar`}</span>
                                </button>
                              ))}
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-1.5">
                            <button type="button" className="dc-btn text-[10.5px] justify-center" onClick={() => { const st = useSimStore.getState(); const id = st.addComponent('pneumaticTee', 380, 260); if (id) st.selectComponents([id]) }}>
                              + Inserir Tê Push-In
                            </button>
                            <button type="button" className="dc-btn text-[10.5px] justify-center" onClick={() => { const st = useSimStore.getState(); const id = st.addComponent('pneumaticFrl', 380, 260); if (id) st.selectComponents([id]) }}>
                              + Inserir Unidade FRL
                            </button>
                          </div>
                        </div>
                      )}

                      {selectedWire.kind !== 'hydraulic' && selectedWire.kind !== 'pneumatic' && (
                        <div>
                          <label className={label}>Construção do condutor</label>
                          <div className="wo-choices" role="radiogroup" aria-label="Condutor">
                            {([
                              ['flexible', 'Flexível', 'Multifilar (H05V-K / H07V-K)'],
                              ['rigid', 'Rígido', 'Fio sólido (H07V-U)'],
                            ] as const).map(([id, name, hint]) => (
                              <button
                                key={id}
                                type="button"
                                role="radio"
                                aria-checked={selectedWire.flexibility === id}
                                className={`wo-choice${selectedWire.flexibility === id ? ' is-on' : ''}`}
                                onClick={() => patchSelectedWire({ flexibility: id })}
                              >
                                <ConductorIcon flexible={id === 'flexible'} color={WIRE_COLORS[selectedWire.color]} size={36} />
                                <strong>{name}</strong>
                                <small>{hint}</small>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {selectedWire.kind !== 'hydraulic' && selectedWire.kind !== 'pneumatic' && (
                      <details className="wi-nested-details" open={(selectedWire.conductorCount ?? 1) > 1 || !!selectedWire.sheathed}>
                        <summary>
                          <span>Formação e capa exterior</span>
                          <em>{presetLabel}</em>
                        </summary>
                        <div className="wi-nested-body">
                          <div className="wo-presets" role="radiogroup" aria-label="Tipo de cabo">
                            {CABLE_PRESETS.map((preset) => {
                              const on = presetId === preset.id
                              return (
                                <button
                                  key={preset.id}
                                  type="button"
                                  role="radio"
                                  aria-checked={on}
                                  title={`${preset.label} — ${preset.hint}`}
                                  className={`wo-preset${on ? ' is-on' : ''}`}
                                  onClick={() => patchSelectedWire({
                                    ...applyCablePreset(preset),
                                    conductorColors: preset.conductors > 1 ? defaultCoreColors(preset.conductors) : undefined,
                                  })}
                                >
                                  <strong>{preset.label}</strong>
                                  <small>{preset.hint}</small>
                                </button>
                              )
                            })}
                          </div>
                          <div className="wo-row">
                            <label className="wo-inline">
                              <span>Veias</span>
                              <Select
                                className="wo-select"
                                aria-label="Número de condutores"
                                value={selectedWire.conductorCount ?? 1}
                                onChange={(e) => {
                                  const n = Number(e.target.value)
                                  patchSelectedWire({
                                    conductorCount: n,
                                    conductorColors: n > 1 ? (selectedWire.conductorColors?.length === n ? selectedWire.conductorColors : defaultCoreColors(n)) : undefined,
                                  })
                                }}
                              >
                                {[1, 2, 3, 4, 5, 6, 7, 8, 12].map((n) => <option key={n} value={n}>{n}×</option>)}
                              </Select>
                            </label>
                            <button
                              type="button"
                              className={`wo-sheath-btn wo-sheath${selectedWire.sheathed ? ' is-on' : ''}`}
                              aria-pressed={!!selectedWire.sheathed}
                              onClick={() => patchSelectedWire({
                                sheathed: !selectedWire.sheathed,
                                sheathColor: !selectedWire.sheathed ? (selectedWire.sheathColor ?? '#0f172a') : selectedWire.sheathColor,
                              })}
                            >
                              <strong>{selectedWire.sheathed ? 'Isolado (capa)' : 'Sem capa'}</strong>
                              <small>{selectedWire.sheathed ? 'Capa global PVC' : 'Só isolação da veia'}</small>
                            </button>
                            {selectedWire.sheathed && (
                              <input
                                type="color"
                                className="wo-sheath-color"
                                aria-label="Cor da capa exterior"
                                title="Cor da capa exterior"
                                value={selectedWire.sheathColor ?? '#0f172a'}
                                onChange={(e) => patchSelectedWire({ sheathColor: e.target.value })}
                              />
                            )}
                          </div>
                          {(selectedWire.conductorCount ?? 1) > 1 && (
                            <div className="wi-cores-row">
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] font-semibold text-ink-500">Cores das veias (HD 308 S2)</span>
                                <button
                                  type="button"
                                  className="wi-link-btn"
                                  title="Repor sequência de cores normalizada HD 308 S2"
                                  onClick={() => patchSelectedWire({ conductorColors: defaultCoreColors(selectedWire.conductorCount ?? 2) })}
                                >
                                  Repor norma
                                </button>
                              </div>
                              <div className="flex flex-wrap items-center gap-1.5">
                                {Array.from({ length: selectedWire.conductorCount ?? 1 }).map((_, idx) => {
                                  const defaults = defaultCoreColors(selectedWire.conductorCount ?? 2)
                                  const col = selectedWire.conductorColors?.[idx] ?? defaults[idx % defaults.length]
                                  return (
                                    <label key={idx} className="wi-core-chip" title={`Cor da veia ${idx + 1}`}>
                                      <span>{idx + 1}</span>
                                      <input
                                        type="color"
                                        aria-label={`Cor da veia ${idx + 1}`}
                                        value={col}
                                        onChange={(e) => {
                                          const count = selectedWire.conductorCount ?? 1
                                          const list = Array.from({ length: count }, (__, i) => selectedWire.conductorColors?.[i] ?? defaults[i % defaults.length])
                                          list[idx] = e.target.value
                                          patchSelectedWire({ conductorColors: list })
                                        }}
                                      />
                                    </label>
                                  )
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      </details>
                      )}
                    </div>
                  </details>

                  {/* 4. TERMINAIS DAS PONTAS (A / B) — exclusivo de cabos elétricos */}
                  {selectedWire.kind !== 'hydraulic' && selectedWire.kind !== 'pneumatic' && (
                  <details className="dc-inspector-group" open>
                    <summary>
                      <span>Terminais das pontas</span>
                      <span className="wi-sum-meta">
                        {fromType === toType ? WIRE_END_LABEL[fromType] : `${WIRE_END_LABEL[fromType]} → ${WIRE_END_LABEL[toType]}`}
                      </span>
                    </summary>
                    <div className="dc-inspector-group-body space-y-2">
                      {/* Atalhos de simetria e normalização DIN 46228-4 */}
                      <div className="wi-end-presets" role="group" aria-label="Atalhos das ponteiras">
                        {(() => {
                          const din = dinFerruleColor(selectedWire.gauge)
                          return din ? (
                            <button
                              type="button"
                              className="dc-ferrule-din"
                              disabled={!wireEditingStopped}
                              title={`Aplicar ponteira e cor DIN 46228-4 (${din.name}, ${selectedWire.gauge}) nas duas pontas`}
                              onClick={() => useSimStore.getState().applyWireEndPreset(selectedWire.id, 'dinBoth')}
                            >
                              <i style={{ background: din.hex }} />DIN A+B
                            </button>
                          ) : null
                        })()}
                        <button
                          type="button"
                          className="wi-mini-btn"
                          disabled={!wireEditingStopped}
                          title="Copiar tipo, cor e camada da ponta A para a ponta B"
                          onClick={() => useSimStore.getState().applyWireEndPreset(selectedWire.id, 'copyAtoB')}
                        >
                          Igualar A→B
                        </button>
                        <button
                          type="button"
                          className="wi-mini-btn"
                          disabled={!wireEditingStopped}
                          title="Copiar tipo, cor e camada da ponta B para a ponta A"
                          onClick={() => useSimStore.getState().applyWireEndPreset(selectedWire.id, 'copyBtoA')}
                        >
                          Igualar B→A
                        </button>
                      </div>

                      {/* Seletor de ponta ativa (A ou B) com miniatura real da ponteira */}
                      <div className="wi-end-tabs" role="tablist" aria-label="Escolher ponta do cabo">
                        {(['from', 'to'] as const).map((side) => {
                          const isA = side === 'from'
                          const active = wireEndTab === side
                          const tType = isA ? fromType : toType
                          const tCol = isA ? fromColor : toColor
                          const tLabel = isA ? (linkedFrom?.label ?? 'livre') : (linkedTo?.label ?? 'livre')
                          return (
                            <button
                              key={side}
                              type="button"
                              role="tab"
                              aria-selected={active}
                              className={`wi-end-tab${active ? ' is-on' : ''}`}
                              onClick={() => setWireEndTab(side)}
                            >
                              <WireEndIcon type={tType} color={tCol} size={24} />
                              <span>
                                <b>Ponta {isA ? 'A' : 'B'}</b>
                                <small>{tLabel} · {WIRE_END_LABEL[tType]}</small>
                              </span>
                            </button>
                          )
                        })}
                      </div>

                      {(() => {
                        const side = wireEndTab
                        const typeKey = side === 'from' ? 'fromEndType' : 'toEndType'
                        const layerKey = side === 'from' ? 'fromEndLayer' : 'toEndLayer'
                        const colorKey = side === 'from' ? 'fromEndColor' : 'toEndColor'
                        const endColor = side === 'from' ? fromColor : toColor
                        const chosen = side === 'from' ? fromType : toType
                        const layer = selectedWire[layerKey] ?? 'back'
                        const title = side === 'from' ? `Ponta inicial (${fromTag})` : `Ponta final (${toTag})`
                        const din = dinFerruleColor(selectedWire.gauge)
                        return (
                          <div className="wi-end-panel" role="tabpanel" aria-label={title}>
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[10.5px] font-semibold text-ink-700 truncate">{title}</span>
                              <div className="wi-seg-pair" role="group" aria-label={`Camada da ${title}`}>
                                {(['back', 'front'] as const).map((value) => (
                                  <button
                                    key={value}
                                    type="button"
                                    aria-pressed={layer === value}
                                    title={value === 'back' ? 'Terminal atrás dos componentes no 2D' : 'Terminal à frente dos componentes no 2D'}
                                    className={layer === value ? 'is-on' : ''}
                                    onClick={() => patchSelectedWire({ [layerKey]: value })}
                                  >
                                    {value === 'back' ? 'Atrás' : 'À frente'}
                                  </button>
                                ))}
                              </div>
                            </div>

                            <div className="dc-ferrule-swatches" role="group" aria-label={`Cores rápidas da ${title}`}>
                              {din && (
                                <button
                                  type="button"
                                  className={`dc-ferrule-din${endColor.toLowerCase() === din.hex ? ' is-on' : ''}`}
                                  onClick={() => patchSelectedWire({ [colorKey]: din.hex })}
                                  title={`Cor normalizada DIN 46228-4 para ${selectedWire.gauge}: ${din.name}`}
                                  aria-label={`Aplicar cor DIN 46228-4 (${din.name})`}
                                >
                                  <i style={{ background: din.hex }} />DIN
                                </button>
                              )}
                              {FERRULE_SWATCHES.map((swatch) => (
                                <button
                                  key={swatch.hex}
                                  type="button"
                                  className={`dc-ferrule-swatch${endColor.toLowerCase() === swatch.hex ? ' is-on' : ''}`}
                                  style={{ background: swatch.hex }}
                                  title={`Ponteira ${swatch.name}`}
                                  aria-label={`Ponteira ${swatch.name}`}
                                  aria-pressed={endColor.toLowerCase() === swatch.hex}
                                  onClick={() => patchSelectedWire({ [colorKey]: swatch.hex })}
                                />
                              ))}
                              <input
                                id={`wire-${side}-end-color`}
                                type="color"
                                className="wi-end-color-input"
                                aria-label={`Cor personalizada da ${title}`}
                                title="Cor personalizada da ponteira"
                                value={endColor}
                                onChange={(e) => patchSelectedWire({ [colorKey]: e.target.value })}
                              />
                              {selectedWire[colorKey] && (
                                <button
                                  type="button"
                                  className="wi-link-btn ml-auto"
                                  title="Voltar a seguir a cor do borne ligado"
                                  onClick={() => patchSelectedWire({ [colorKey]: undefined })}
                                >
                                  Repor
                                </button>
                              )}
                            </div>

                            <div className="wo-ends" role="radiogroup" aria-label={`Tipo de terminal da ${title}`}>
                              {WIRE_END_OPTIONS.filter((o) => o.id !== 'hydraulicFitting' && o.id !== 'pneumaticPushIn').map((o) => (
                                <button
                                  key={o.id}
                                  type="button"
                                  role="radio"
                                  aria-checked={chosen === o.id}
                                  title={o.hint}
                                  className={`wo-end${chosen === o.id ? ' is-on' : ''}`}
                                  onClick={() => patchSelectedWire({ [typeKey]: o.id })}
                                >
                                  <WireEndIcon type={o.id} color={endColor} size={30} />
                                  <span>{o.label}</span>
                                </button>
                              ))}
                            </div>
                          </div>
                        )
                      })()}
                    </div>
                  </details>
                  )}

                  {/* 5. ACESSÓRIOS NO PERCURSO (ANILHAS, ESPIRAL E CAPAS PARCIAIS) — só para cabos elétricos */}
                  {selectedWire.kind !== 'hydraulic' && selectedWire.kind !== 'pneumatic' && (
                  <details className="dc-inspector-group" open={accessoryCount > 0}>
                    <summary>
                      <span>Anilhas, espiral e capas</span>
                      <span className="wi-sum-meta">{accessoryCount > 0 ? String(accessoryCount) : 'opcional'}</span>
                    </summary>
                    <div className="dc-inspector-group-body space-y-2.5">
                      <CableAccessoryMap wire={selectedWire} />

                      {/* Marcadores / anilhas clip-on encaixáveis (IEC 60062 0–9 + CAB3/WIC) */}
                      <div className="wi-subcard" data-wire-markers-card>
                        <div className="wi-subcard-head">
                          <span>Anilhas clip-on IEC ({selectedWire.markers?.length ?? 0})</span>
                          <button
                            type="button"
                            className="wi-mini-btn"
                            disabled={!wireEditingStopped}
                            title="Adiciona um conjunto de anilhas clip-on (IEC 60062) ao cabo"
                            onClick={() => {
                              const list = [...(selectedWire.markers ?? [])]
                              const text = selectedWire.number || (list.length === 0 ? '01' : String(list.length + 1).padStart(2, '0'))
                              const t = list.length === 0 ? 0.14 : list.length === 1 ? 0.86 : 0.5
                              list.push({ t, text, color: '#0f172a', bg: '#fbbf24', style: 'iec' })
                              patchSelectedWire({ markers: list })
                            }}
                          >
                            + Anilha
                          </button>
                        </div>

                        {/* Régua de anilhas coloridas IEC 60062 (0=Preto … 9=Branco) — clique encaixa no último marcador ou cria um novo */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', padding: '4px 0 2px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '10px', color: 'var(--dc-text-muted, #64748b)' }}>
                            <span>Régua IEC 60062 (clique para encaixar)</span>
                            {(selectedWire.markers?.length ?? 0) > 0 && (
                              <button
                                type="button"
                                className="wi-mini-btn"
                                disabled={!wireEditingStopped}
                                title="Remove a última anilha do conjunto ativo"
                                style={{ padding: '1px 5px', fontSize: '10px' }}
                                onClick={() => {
                                  const live = useSimStore.getState().wires.find((w) => w.id === selectedWire.id) ?? selectedWire
                                  const list = [...(live.markers ?? [])]
                                  const idx = list.length - 1
                                  if (idx < 0) return
                                  const next = list[idx].text.slice(0, -1)
                                  list[idx] = { ...list[idx], text: next }
                                  patchSelectedWire({ markers: list })
                                }}
                              >
                                <IconBackspace size={12} />
                              </button>
                            )}
                          </div>
                          <div
                            role="group"
                            aria-label="Régua de anilhas numéricas IEC 60062 (0 a 9)"
                            style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: '2px' }}
                          >
                            {IEC_DIGIT_MARKER_PALETTE.map((ring) => (
                              <button
                                key={ring.char}
                                type="button"
                                disabled={!wireEditingStopped}
                                data-iec-ring={ring.char}
                                title={`${ring.name} · IEC 60062`}
                                aria-label={`Encaixar anilha ${ring.name}`}
                                onClick={() => {
                                  const live = useSimStore.getState().wires.find((w) => w.id === selectedWire.id) ?? selectedWire
                                  const list = [...(live.markers ?? [])]
                                  if (list.length === 0) {
                                    list.push({ t: 0.14, text: ring.char, color: '#0f172a', bg: '#fbbf24', style: 'iec' })
                                  } else {
                                    const idx = list.length - 1
                                    list[idx] = { ...list[idx], text: `${list[idx].text}${ring.char}`.slice(0, 16) }
                                  }
                                  patchSelectedWire({ markers: list })
                                }}
                                style={{
                                  height: '22px',
                                  padding: 0,
                                  borderRadius: '3px',
                                  border: `1px solid ${ring.border}`,
                                  background: `linear-gradient(180deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0) 42%, rgba(0,0,0,0.16) 100%), ${ring.bg}`,
                                  color: ring.fg,
                                  fontWeight: 900,
                                  fontSize: '11px',
                                  fontFamily: '"DIN Alternate", "Arial Narrow", "Inter", sans-serif',
                                  cursor: wireEditingStopped ? 'pointer' : 'not-allowed',
                                  textDecoration: ring.char === '6' || ring.char === '9' ? 'underline' : 'none',
                                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.25), 0 1px 1px rgba(15,23,42,0.15)',
                                }}
                              >
                                {ring.char}
                              </button>
                            ))}
                          </div>
                          <div
                            role="group"
                            aria-label="Anilhas de letras e símbolos"
                            style={{ display: 'flex', flexWrap: 'wrap', gap: '2px' }}
                          >
                            {QUICK_LETTER_TOKENS.map((sym) => {
                              const bg = sym === '+' ? '#d9261c' : sym === '-' ? '#1565c0' : sym === 'N' ? '#1976d2' : '#facc15'
                              const fg = sym === '+' || sym === '-' || sym === 'N' ? '#ffffff' : '#111827'
                              return (
                                <button
                                  key={sym}
                                  type="button"
                                  disabled={!wireEditingStopped}
                                  title={`Encaixar anilha «${sym}»`}
                                  onClick={() => {
                                    const live = useSimStore.getState().wires.find((w) => w.id === selectedWire.id) ?? selectedWire
                                    const list = [...(live.markers ?? [])]
                                    if (list.length === 0) {
                                      list.push({ t: 0.14, text: sym, color: '#0f172a', bg: '#fbbf24', style: 'iec' })
                                    } else {
                                      const idx = list.length - 1
                                      list[idx] = { ...list[idx], text: `${list[idx].text}${sym}`.slice(0, 16) }
                                    }
                                    patchSelectedWire({ markers: list })
                                  }}
                                  style={{
                                    height: '18px',
                                    minWidth: '18px',
                                    padding: '0 3px',
                                    borderRadius: '2.5px',
                                    border: '1px solid rgba(15,23,42,0.28)',
                                    background: bg,
                                    color: fg,
                                    fontWeight: 800,
                                    fontSize: '9.5px',
                                    cursor: wireEditingStopped ? 'pointer' : 'not-allowed',
                                  }}
                                >
                                  {sym}
                                </button>
                              )
                            })}
                          </div>
                        </div>

                        {(() => {
                          const termA = components.flatMap(c => c.terminals).find(t => t.id === selectedWire.fromTerminalId)
                          const compA = components.find(c => c.terminals.some(t => t.id === selectedWire.fromTerminalId))
                          const termB = components.flatMap(c => c.terminals).find(t => t.id === selectedWire.toTerminalId)
                          const compB = components.find(c => c.terminals.some(t => t.id === selectedWire.toTerminalId))
                          const nameA = compA ? `${compA.ref}:${termA?.label ?? '?'}` : 'Ponta livre A'
                          const nameB = compB ? `${compB.ref}:${termB?.label ?? '?'}` : 'Ponta livre B'

                          return (
                            <div className="flex items-center justify-between text-[11px] p-2 rounded bg-slate-50 border border-slate-200">
                              <div className="flex items-center gap-1.5 font-mono">
                                <span className="w-4 h-4 rounded-full bg-slate-800 text-white flex items-center justify-center text-[10px] font-bold">A</span>
                                <span className="font-semibold text-slate-800">{nameA}</span>
                              </div>
                              <span className="text-slate-400">⟶</span>
                              <div className="flex items-center gap-1.5 font-mono">
                                <span className="font-semibold text-slate-800">{nameB}</span>
                                <span className="w-4 h-4 rounded-full bg-slate-800 text-white flex items-center justify-center text-[10px] font-bold">B</span>
                              </div>
                            </div>
                          )
                        })()}

                        <div className="wi-chip-actions flex flex-wrap gap-1">
                          <button
                            type="button"
                            className="wi-mini-btn"
                            disabled={!wireEditingStopped}
                            title="Aplica anilha na Ponta A (8%)"
                            onClick={() => {
                              const list = [...(selectedWire.markers ?? [])]
                              const text = selectedWire.number || '01'
                              list.push({ t: 0.08, text, color: '#0f172a', bg: '#fbbf24', style: 'iec' })
                              patchSelectedWire({ markers: list })
                            }}
                          >
                            + Ponta A
                          </button>
                          <button
                            type="button"
                            className="wi-mini-btn"
                            disabled={!wireEditingStopped}
                            title="Aplica anilha na Ponta B (92%)"
                            onClick={() => {
                              const list = [...(selectedWire.markers ?? [])]
                              const text = selectedWire.number || '02'
                              list.push({ t: 0.92, text, color: '#0f172a', bg: '#fbbf24', style: 'iec' })
                              patchSelectedWire({ markers: list })
                            }}
                          >
                            + Ponta B
                          </button>
                          <button
                            type="button"
                            className="wi-mini-btn"
                            disabled={!wireEditingStopped}
                            title="Aplica anilhas IEC coloridas com o nº do cabo nas duas pontas (8% e 92%)"
                            onClick={() => useSimStore.getState().stampWireEndMarkers(selectedWire.id, 'number')}
                          >
                            Anilhar Nº (A+B)
                          </button>
                          <button
                            type="button"
                            className="wi-mini-btn"
                            disabled={!wireEditingStopped}
                            title="Aplica anilhas clip-on com o endereço dos bornes (ex.: QG.2 / QM1.1) nas duas pontas"
                            onClick={() => useSimStore.getState().stampWireEndMarkers(selectedWire.id, 'terminals')}
                          >
                            Anilhar bornes (A+B)
                          </button>
                          {(selectedWire.markers?.length ?? 0) > 0 && (
                            <button
                              type="button"
                              className="wi-mini-btn is-danger"
                              disabled={!wireEditingStopped}
                              onClick={() => patchSelectedWire({ markers: undefined })}
                            >
                              Limpar
                            </button>
                          )}
                        </div>
                        {(selectedWire.markers ?? []).map((m, i) => {
                          const style = resolveWireMarkerStyle(m)
                          const rings = expandWireMarkerRings(m)
                          return (
                            <div key={i} className="wi-acc-block" style={{ display: 'flex', flexDirection: 'column', gap: '5px', paddingTop: '6px', borderTop: '1px solid var(--dc-border, rgba(148,163,184,0.22))' }}>
                              {/* Pré-visualização física das anilhas encaixadas lado a lado */}
                              {rings.length > 0 && (
                                <div
                                  aria-label={`Pré-visualização das anilhas do marcador ${i + 1}`}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '1px',
                                    padding: '3px 6px',
                                    borderRadius: '4px',
                                    background: 'linear-gradient(180deg, #1e293b 0%, #0f172a 100%)',
                                    overflowX: 'auto',
                                  }}
                                >
                                  <span style={{ flex: '0 0 8px', height: '4px', borderRadius: '2px', background: '#475569' }} />
                                  {rings.map((r, rIdx) => (
                                    <span
                                      key={rIdx}
                                      title={r.colorName}
                                      style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        minWidth: '13px',
                                        height: '18px',
                                        padding: '0 2px',
                                        borderRadius: '2px',
                                        background: `linear-gradient(180deg, rgba(255,255,255,0.28) 0%, rgba(255,255,255,0) 40%, rgba(0,0,0,0.2) 100%), ${r.bg}`,
                                        color: r.fg,
                                        border: `0.5px solid ${r.border}`,
                                        fontWeight: 900,
                                        fontSize: '10.5px',
                                        fontFamily: '"DIN Alternate", "Arial Narrow", "Inter", sans-serif',
                                        textDecoration: r.char === '6' || r.char === '9' ? 'underline' : 'none',
                                      }}
                                    >
                                      {r.char}
                                    </span>
                                  ))}
                                  <span style={{ flex: '1 1 8px', height: '4px', borderRadius: '2px', background: '#475569' }} />
                                  <small style={{ color: '#94a3b8', fontSize: '9.5px', marginLeft: '4px', whiteSpace: 'nowrap' }}>
                                    {Math.round(m.t * 100)}%
                                  </small>
                                </div>
                              )}

                              {/* Seletor rápido de ponta para ancorar anilha */}
                              <div className="flex items-center justify-between text-[10.5px]">
                                <span className="text-slate-500 font-medium">Ancorar na ponta:</span>
                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${m.t <= 0.2 ? 'bg-brand-600 text-white border-brand-700' : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'}`}
                                    onClick={() => {
                                      const list = [...(selectedWire.markers ?? [])]
                                      list[i] = { ...list[i], t: 0.08 }
                                      patchSelectedWire({ markers: list })
                                    }}
                                  >
                                    Ponta A (8%)
                                  </button>
                                  <button
                                    type="button"
                                    className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${m.t > 0.4 && m.t < 0.6 ? 'bg-brand-600 text-white border-brand-700' : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'}`}
                                    onClick={() => {
                                      const list = [...(selectedWire.markers ?? [])]
                                      list[i] = { ...list[i], t: 0.5 }
                                      patchSelectedWire({ markers: list })
                                    }}
                                  >
                                    Meio (50%)
                                  </button>
                                  <button
                                    type="button"
                                    className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${m.t >= 0.8 ? 'bg-brand-600 text-white border-brand-700' : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'}`}
                                    onClick={() => {
                                      const list = [...(selectedWire.markers ?? [])]
                                      list[i] = { ...list[i], t: 0.92 }
                                      patchSelectedWire({ markers: list })
                                    }}
                                  >
                                    Ponta B (92%)
                                  </button>
                                </div>
                              </div>

                              {/* Barra deslizante contínua com indicação das pontas */}
                              <div className="flex items-center gap-1.5 px-0.5">
                                <span className="text-[10px] font-bold text-slate-500">A</span>
                                <input
                                  type="range"
                                  min={0}
                                  max={100}
                                  step={1}
                                  disabled={!wireEditingStopped}
                                  value={Math.round(m.t * 100)}
                                  className="flex-1 accent-brand-600 h-1 bg-slate-200 rounded cursor-pointer"
                                  onChange={(e) => {
                                    const list = [...(selectedWire.markers ?? [])]
                                    list[i] = { ...list[i], t: Math.max(0, Math.min(1, Number(e.target.value) / 100)) }
                                    patchSelectedWire({ markers: list })
                                  }}
                                />
                                <span className="text-[10px] font-bold text-slate-500">B</span>
                              </div>

                              <div className="wi-acc-row">
                                <input
                                  className="dc-input wi-acc-text"
                                  aria-label={`Texto do marcador ${i + 1}`}
                                  value={m.text}
                                  maxLength={16}
                                  placeholder="025341"
                                  disabled={!wireEditingStopped}
                                  onChange={(e) => {
                                    const list = [...(selectedWire.markers ?? [])]
                                    list[i] = { ...list[i], text: e.target.value }
                                    patchSelectedWire({ markers: list })
                                  }}
                                />
                                <label className="wi-pct-field" title="Posição ao longo do cabo (0% = ponta A, 100% = ponta B)">
                                  <InspectorNumberInput
                                    type="number"
                                    min={0}
                                    max={100}
                                    step={2}
                                    disabled={!wireEditingStopped}
                                    aria-label={`Posição do marcador ${i + 1} (%)`}
                                    value={Math.round(m.t * 100)}
                                    onChange={(e) => {
                                      const list = [...(selectedWire.markers ?? [])]
                                      list[i] = { ...list[i], t: Math.max(0, Math.min(1, Number(e.target.value) / 100)) }
                                      patchSelectedWire({ markers: list })
                                    }}
                                  />
                                  <i>%</i>
                                </label>
                                <Select
                                  className="dc-input"
                                  aria-label={`Estilo das anilhas do marcador ${i + 1}`}
                                  value={style}
                                  disabled={!wireEditingStopped}
                                  style={{ minWidth: '88px', fontSize: '10.5px', padding: '2px 4px' }}
                                  onChange={(e) => {
                                    const nextStyle = e.target.value as WireMarkerStyle
                                    const list = [...(selectedWire.markers ?? [])]
                                    list[i] = {
                                      ...list[i],
                                      style: nextStyle,
                                      ...(nextStyle === 'yellow' ? { bg: '#facc15', color: '#111827' } : {}),
                                      ...(nextStyle === 'white' ? { bg: '#f8fafc', color: '#0f172a' } : {}),
                                    }
                                    patchSelectedWire({ markers: list })
                                  }}
                                >
                                  {(Object.keys(WIRE_MARKER_STYLE_LABEL) as WireMarkerStyle[]).map((st) => (
                                    <option key={st} value={st}>{WIRE_MARKER_STYLE_LABEL[st]}</option>
                                  ))}
                                </Select>
                                {style === 'custom' && (
                                  <>
                                    <input
                                      type="color"
                                      title="Cor do texto"
                                      aria-label={`Cor do texto do marcador ${i + 1}`}
                                      className="wi-color-mini"
                                      value={m.color}
                                      onChange={(e) => {
                                        const list = [...(selectedWire.markers ?? [])]
                                        list[i] = { ...list[i], color: e.target.value, style: 'custom' }
                                        patchSelectedWire({ markers: list })
                                      }}
                                    />
                                    <input
                                      type="color"
                                      title="Cor da anilha"
                                      aria-label={`Cor de fundo do marcador ${i + 1}`}
                                      className="wi-color-mini"
                                      value={m.bg ?? '#fbbf24'}
                                      onChange={(e) => {
                                        const list = [...(selectedWire.markers ?? [])]
                                        list[i] = { ...list[i], bg: e.target.value, style: 'custom' }
                                        patchSelectedWire({ markers: list })
                                      }}
                                    />
                                  </>
                                )}
                                <button
                                  type="button"
                                  className="wi-row-del"
                                  disabled={!wireEditingStopped}
                                  aria-label={`Remover marcador ${i + 1}`}
                                  onClick={() => {
                                    const list = (selectedWire.markers ?? []).filter((_, j) => j !== i)
                                    patchSelectedWire({ markers: list.length ? list : undefined })
                                  }}
                                >
                                  <IconClose size={10} />
                                </button>
                              </div>
                            </div>
                          )
                        })}
                      </div>

                      {/* Espiral de proteção */}
                      <div className="wi-subcard">
                        <div className="wi-subcard-head">
                          <span>Espiral de proteção ({selectedWire.spirals?.length ?? 0})</span>
                          <button
                            type="button"
                            className="wi-mini-btn"
                            title="Adiciona uma espiral protetora entre 25% e 75% do cabo"
                            onClick={() => {
                              const list = [...(selectedWire.spirals ?? [])]
                              list.push({ start: 0.25, end: 0.75, color: '#0a0a0a', pitchMm: 8, innerDiaMm: 10 })
                              patchSelectedWire({ spirals: list })
                            }}
                          >
                            + Espiral
                          </button>
                        </div>
                        {(selectedWire.spirals ?? []).map((seg, i) => (
                          <div key={i} className="wi-acc-block">
                            <div className="wi-acc-row">
                              <label className="wi-pct-field" title="Início da espiral (%)">
                                <InspectorNumberInput
                                  type="number"
                                  min={0}
                                  max={100}
                                  step={5}
                                  aria-label={`Início da espiral ${i + 1} (%)`}
                                  value={Math.round(seg.start * 100)}
                                  onChange={(e) => {
                                    const list = [...(selectedWire.spirals ?? [])]
                                    list[i] = { ...list[i], start: Math.max(0, Math.min(1, Number(e.target.value) / 100)) }
                                    patchSelectedWire({ spirals: list })
                                  }}
                                />
                                <i>%</i>
                              </label>
                              <span className="text-ink-400 text-[10px]"><IconArrowRight size={10} /></span>
                              <label className="wi-pct-field" title="Fim da espiral (%)">
                                <InspectorNumberInput
                                  type="number"
                                  min={0}
                                  max={100}
                                  step={5}
                                  aria-label={`Fim da espiral ${i + 1} (%)`}
                                  value={Math.round(seg.end * 100)}
                                  onChange={(e) => {
                                    const list = [...(selectedWire.spirals ?? [])]
                                    list[i] = { ...list[i], end: Math.max(0, Math.min(1, Number(e.target.value) / 100)) }
                                    patchSelectedWire({ spirals: list })
                                  }}
                                />
                                <i>%</i>
                              </label>
                              <input
                                type="color"
                                className="wi-color-mini"
                                title="Cor da espiral"
                                aria-label={`Cor da espiral ${i + 1}`}
                                value={seg.color ?? '#0a0a0a'}
                                onChange={(e) => {
                                  const list = [...(selectedWire.spirals ?? [])]
                                  list[i] = { ...list[i], color: e.target.value }
                                  patchSelectedWire({ spirals: list })
                                }}
                              />
                              <button
                                type="button"
                                className="wi-row-del ml-auto"
                                aria-label={`Remover espiral ${i + 1}`}
                                onClick={() => {
                                  const list = (selectedWire.spirals ?? []).filter((_, j) => j !== i)
                                  patchSelectedWire({ spirals: list.length ? list : undefined })
                                }}
                              >
                                <IconClose size={10} />
                              </button>
                            </div>
                            <div className="wi-acc-row">
                              <label className="wi-unit-field">
                                <span>Passo</span>
                                <InspectorNumberInput
                                  type="number"
                                  min={4}
                                  max={30}
                                  step={1}
                                  value={seg.pitchMm ?? 8}
                                  onChange={(e) => {
                                    const list = [...(selectedWire.spirals ?? [])]
                                    list[i] = { ...list[i], pitchMm: Math.max(4, Math.min(30, Number(e.target.value))) }
                                    patchSelectedWire({ spirals: list })
                                  }}
                                />
                                <i>mm</i>
                              </label>
                              <label className="wi-unit-field">
                                <span>Ø int.</span>
                                <InspectorNumberInput
                                  type="number"
                                  min={4}
                                  max={40}
                                  step={1}
                                  value={seg.innerDiaMm ?? 10}
                                  onChange={(e) => {
                                    const list = [...(selectedWire.spirals ?? [])]
                                    list[i] = { ...list[i], innerDiaMm: Math.max(4, Math.min(40, Number(e.target.value))) }
                                    patchSelectedWire({ spirals: list })
                                  }}
                                />
                                <i>mm</i>
                              </label>
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Manga / isolamento parcial */}
                      <div className="wi-subcard">
                        <div className="wi-subcard-head">
                          <span>Manga / isolamento ({selectedWire.isolation?.length ?? 0})</span>
                          <button
                            type="button"
                            className="wi-mini-btn"
                            title="Adiciona uma manga de isolamento entre 25% e 75% do cabo"
                            onClick={() => {
                              const list = [...(selectedWire.isolation ?? [])]
                              list.push({ start: 0.25, end: 0.75, color: '#1e293b' })
                              patchSelectedWire({ isolation: list })
                            }}
                          >
                            + Secção
                          </button>
                        </div>
                        {(selectedWire.isolation ?? []).map((seg, i) => (
                          <div key={i} className="wi-acc-row">
                            <label className="wi-pct-field" title="Início da manga (%)">
                              <InspectorNumberInput
                                type="number"
                                min={0}
                                max={100}
                                step={5}
                                aria-label={`Início do isolamento ${i + 1} (%)`}
                                value={Math.round(seg.start * 100)}
                                onChange={(e) => {
                                  const live = useSimStore.getState().wires.find((w) => w.id === selectedWire.id) ?? selectedWire
                                  const list = [...(live.isolation ?? [])]
                                  if (!list[i]) return
                                  const maxStart = Math.max(0.05, (list[i].end ?? 1) - 0.05)
                                  list[i] = { ...list[i], start: Math.max(0, Math.min(maxStart, Number(e.target.value) / 100)) }
                                  patchSelectedWire({ isolation: list })
                                }}
                              />
                              <i>%</i>
                            </label>
                            <span className="text-ink-400 text-[10px]"><IconArrowRight size={10} /></span>
                            <label className="wi-pct-field" title="Fim da manga (%)">
                              <InspectorNumberInput
                                type="number"
                                min={0}
                                max={100}
                                step={5}
                                aria-label={`Fim do isolamento ${i + 1} (%)`}
                                value={Math.round(seg.end * 100)}
                                onChange={(e) => {
                                  const live = useSimStore.getState().wires.find((w) => w.id === selectedWire.id) ?? selectedWire
                                  const list = [...(live.isolation ?? [])]
                                  if (!list[i]) return
                                  const minEnd = Math.min(0.95, (list[i].start ?? 0) + 0.05)
                                  list[i] = { ...list[i], end: Math.max(minEnd, Math.min(1, Number(e.target.value) / 100)) }
                                  patchSelectedWire({ isolation: list })
                                }}
                              />
                              <i>%</i>
                            </label>
                            <input
                              type="color"
                              className="wi-color-mini"
                              title="Cor da manga"
                              aria-label={`Cor do isolamento ${i + 1}`}
                              value={seg.color}
                              onChange={(e) => {
                                const list = [...(selectedWire.isolation ?? [])]
                                list[i] = { ...list[i], color: e.target.value }
                                patchSelectedWire({ isolation: list })
                              }}
                            />
                            <button
                              type="button"
                              className="wi-row-del ml-auto"
                              aria-label={`Remover secção ${i + 1}`}
                              onClick={() => {
                                const list = (selectedWire.isolation ?? []).filter((_, j) => j !== i)
                                patchSelectedWire({ isolation: list.length ? list : undefined })
                              }}
                            >
                              <IconClose size={10} />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </details>
                  )}

                  <button
                    type="button"
                    className="dc-btn-danger dc-btn w-full"
                    disabled={!wireEditingStopped}
                    onClick={() => {
                      if (multiCount > 1) useSimStore.getState().deleteSelection()
                      else useSimStore.getState().deleteWire(selectedWire.id)
                    }}
                  >
                    <IconDelete size={12} />{' '}
                    {multiCount > 1
                      ? `Eliminar ${multiCount} condutas`
                      : selectedWire.kind === 'hydraulic' || selectedWire.kind === 'pneumatic'
                        ? 'Eliminar tubo'
                        : 'Eliminar cabo'}
                  </button>
                </fieldset>
              </section>
            )
          })()}

          {/* ---------------------------------------------------- borne */}
          {selectedTerminal && terminalOwner && !selectedComponent && (
            <section key={selectedTerminal.id} className="space-y-3">
              <header className="border-b border-line pb-2 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold text-ink-900 truncate">{terminalOwner.ref} · {selectedTerminal.displayName || selectedTerminal.label}</div>
                    <div className="text-[10px] text-ink-400 mt-0.5">Borne físico {selectedTerminal.label} · {selectedTerminal.energized ? '● Energizado' : '○ Sem tensão'}</div>
                  </div>
                  <button
                    type="button"
                    className="dc-btn text-[10.5px] shrink-0"
                    title={`Voltar às propriedades do componente ${terminalOwner.ref}`}
                    onClick={() => useSimStore.getState().selectComponents([terminalOwner.id])}
                  >
                    {`← ${terminalOwner.ref}`}
                  </button>
                </div>
              </header>
              <div className="dc-card p-2.5 space-y-2">
                <div>
                  <label className={label} htmlFor="terminal-name">Nome do borne</label>
                  <input id="terminal-name" className="dc-input" value={selectedTerminal.displayName ?? ''} placeholder={selectedTerminal.label}
                    onChange={(e) => useSimStore.getState().updateTerminal(selectedTerminal.id, { displayName: e.target.value })} />
                  <p className="text-[10px] text-ink-400 mt-1">Nome visível no inspetor; o código elétrico {selectedTerminal.label} mantém-se para não alterar a simulação.</p>
                </div>
                <div>
                  <label className={label} htmlFor="terminal-electrical-class">Categoria elétrica · {selectedTerminal.electricalClass ? 'definida' : 'sugerida pela ficha'}</label>
                  <Select id="terminal-electrical-class" className="dc-select" value={terminalElectricalClassOf(terminalOwner, selectedTerminal)}
                    onChange={(e) => useSimStore.getState().updateTerminal(selectedTerminal.id, { electricalClass: e.target.value as TerminalElectricalClass, electricalClassCustom: e.target.value === 'other' ? selectedTerminal.electricalClassCustom : undefined })}>
                    {Object.entries(TERMINAL_ELECTRICAL_CLASS_LABEL).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                  </Select>
                  {terminalElectricalClassOf(terminalOwner, selectedTerminal) === 'other' && <input className="dc-input mt-1" value={selectedTerminal.electricalClassCustom ?? ''} placeholder="Designação: PE, contacto seco…" onChange={(e) => useSimStore.getState().updateTerminal(selectedTerminal.id, { electricalClassCustom: e.target.value || undefined })} />}
                  <p className="mt-1 text-[9px] leading-4 text-ink-400">{terminalDatasheetGuidance(terminalOwner)}</p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div><label className={label} htmlFor="terminal-kind">Função elétrica</label>
                    <Select id="terminal-kind" className="dc-select" value={selectedTerminal.kind}
                      onChange={(e) => useSimStore.getState().updateTerminal(selectedTerminal.id, { kind: e.target.value as TerminalKind })}>
                      {Object.entries(TERMINAL_KIND_LABEL).map(([kind, name]) => <option key={kind} value={kind}>{name}</option>)}
                    </Select></div>
                  <div><label className={label} htmlFor="terminal-type">Tipo físico</label>
                    <Select id="terminal-type" className="dc-select" value={selectedTerminal.terminalType}
                      onChange={(e) => useSimStore.getState().updateTerminal(selectedTerminal.id, { terminalType: e.target.value as TerminalType })}>
                      {Object.entries(TERMINAL_TYPE_LABEL).map(([type, name]) => <option key={type} value={type}>{name}</option>)}
                    </Select></div>
                </div>
              </div>
              <details className="dc-inspector-group">
                <summary>Posição no componente (avançado)</summary>
                <div className="dc-inspector-group-body grid grid-cols-2 gap-2">
                  {(['x', 'y'] as const).map((axis) => <div key={axis}>
                    <label className={label} htmlFor={`terminal-${axis}`}>{axis.toUpperCase()} (0–1)</label>
                    <InspectorNumberInput disabled={!!terminalOwner.locked} id={`terminal-${axis}`} type="number" min="0" max="1" step="0.01" className="dc-input" value={selectedTerminal[axis]}
                      onChange={(e) => { const value = Number(e.target.value); if (Number.isFinite(value)) useSimStore.getState().updateTerminal(selectedTerminal.id, { [axis]: Math.min(1, Math.max(0, value)) }) }} />
                  </div>)}
                  <p className="col-span-2 text-[10px] text-ink-400">Alterar a posição pode afastar este borne do parafuso físico no modelo 3D.</p>
                </div>
              </details>
              <div className="dc-card p-2.5 space-y-2">
                <label className={label} htmlFor="terminal-color">Cor deste borne</label>
                <div className="flex items-center gap-2">
                  <input id="terminal-color" type="color" className="w-9 h-8 cursor-pointer rounded border border-line" value={selectedTerminal.color} onChange={(e) => useSimStore.getState().updateTerminal(selectedTerminal.id, { color: e.target.value })} />
                  <span className="font-mono text-[11px]">{selectedTerminal.color}</span>
                </div>
                <div className="flex flex-wrap gap-1.5" aria-label="Cores rápidas dos bornes">
                  {['#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7', '#0f172a', '#ffffff'].map((color) => <button key={color} type="button" aria-label={`Aplicar cor ${color}`} title={color} onClick={() => useSimStore.getState().updateTerminal(selectedTerminal.id, { color })} className={`w-6 h-6 rounded-full border-2 ${selectedTerminal.color.toLowerCase() === color ? 'border-brand-600 ring-2 ring-brand-200' : 'border-slate-300'}`} style={{ backgroundColor: color }} />)}
                </div>
                <p className="text-[10px] text-ink-400">Identificação visual; não altera a cor do cabo nem a continuidade elétrica.</p>
              </div>
              <div className="dc-card p-2.5 space-y-2">
                <div className="flex justify-between items-center"><span className={label + ' !mb-0'}>Ligações</span><span className="text-[10px] text-ink-400">{connections.length} cabo(s)</span></div>
                {connections.length ? connections.map(({ wire, owner, terminal, loose }) => <div key={wire.id} className="rounded border border-line bg-white p-2 space-y-1">
                  <div className="flex justify-between items-center gap-2">
                    <button type="button" className="font-semibold text-brand-600 hover:underline text-left" onClick={() => useSimStore.getState().selectWire(wire.id)}>{wire.number || 'Cabo'} · {wire.color} · {wire.gauge}</button>
                    <span className={`text-[10px] shrink-0 ${loose ? 'text-amber-700' : 'text-emerald-700'}`}>{loose ? 'Ponta livre' : 'Ligado'}</span>
                  </div>
                  <div className="text-[11px] text-ink-600">{owner && terminal ? <>Vai para <button type="button" className="text-brand-600 hover:underline font-medium" onClick={() => useSimStore.getState().selectTerminal(terminal.id)}>{owner.ref}.{terminal.displayName || terminal.label}</button> <span className="text-ink-400">({terminal.label})</span></> : 'Outra ponta livre — sem ligação a um borne'}</div>
                </div>) : <p className="text-[11px] text-ink-400">Ainda não há cabos ligados a este borne.</p>}
              </div>
              <button className="dc-btn-primary dc-btn" onClick={() => {
                useSimStore.getState().openViewOrientationEditor(terminalOwner.id, 'terminals')
                useSimStore.getState().setViewActiveTerminal(selectedTerminal.id)
              }}><IconCube size={12} /> Editar borne no painel completo</button>
            </section>
          )}
        </div>
      )}
    </div>
  )
}


/**
 * «Peças visíveis»: peças opcionais que se mostram/ocultam com o olho (pá do
 * veio do motor integrado, ou peças marcadas «Peça opcional» no editor de
 * elementos). O estado vive no componente, por isso fica guardado no projeto.
 */
function TerminalAssemblyCoverControl({ component }: { component: { id: string; type: ComponentType; locked?: boolean; state: Record<string, unknown> } }) {
  const entries = useCatalogStore(s => s.entries), link = parseCatalogType(component.type)
  const def = link ? entries.find(entry => entry.id === link.id)?.versions.find(version => version.version === link.version)?.definition : undefined
  const covers = def?.parts.filter(part => part.procedural === 'terminal-assembly-cover' && !part.editorOnly) ?? []
  if (!isTerminalAssemblyComponent(builtinOriginType(component.type) ?? component.type)
    || (def?.builtinSeeds?.includes(TERMINAL_ASSEMBLY_COVER_SEED) && !covers.length)) return null
  const on = typeof component.state.acrylicCover === 'boolean' ? component.state.acrylicCover : covers.some(part => part.visible)
  return <div className="rounded-lg border border-slate-200 bg-white p-3 flex items-center justify-between">
    <div className="flex-1 pr-2">
      <div className="text-xs font-semibold text-slate-700">Acrílico de proteção</div>
      <div className="text-[11px] text-slate-500">Tampa transparente com parafusos e sinal de aviso</div>
    </div>
    <button type="button" disabled={component.locked} aria-pressed={on}
      className={`rounded-full px-3 py-1.5 text-xs font-semibold border shadow-sm transition ${on ? 'bg-brand-600 border-brand-700 text-white hover:bg-brand-500' : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'}`}
      onClick={() => useSimStore.getState().setComponentState(component.id, { acrylicCover: !on })}>
      {on ? 'Com acrílico' : 'Sem acrílico'}
    </button>
  </div>
}

function OptionalPartsGroup({ component }: { component: { id: string; type: string; locked?: boolean; state: Record<string, unknown> } }) {
  const entries = useCatalogStore((s) => s.entries)
  const link = parseCatalogType(component.type)
  const rows = useMemo(() => {
    if (component.type === 'motor3ph') return [{ key: 'showFan', name: 'Pá do veio (3 pás)', visible: component.state.showFan !== false }]
    if (!link) return []
    const def = entries.find((entry) => entry.id === link.id)?.versions.find((item) => item.version === link.version)?.definition
    const hidden = new Set((component.state.hiddenParts as string[] | undefined) ?? [])
    return (def?.parts ?? []).filter((part) => part.optional && !part.editorOnly && part.procedural !== 'terminal-assembly-cover').map((part) => ({ key: part.id, name: part.name, visible: !hidden.has(part.id) }))
  }, [component.type, component.state.showFan, component.state.hiddenParts, entries, link?.id, link?.version])
  if (!rows.length) return null
  const toggle = (key: string, visible: boolean) => {
    const store = useSimStore.getState()
    if (key === 'showFan') { store.setComponentState(component.id, { showFan: !visible }); return }
    const hidden = new Set((component.state.hiddenParts as string[] | undefined) ?? [])
    if (visible) hidden.add(key); else hidden.delete(key)
    store.setComponentState(component.id, { hiddenParts: [...hidden] })
  }
  return <details className="dc-inspector-group" open data-optional-parts><summary>Peças visíveis</summary><div className="dc-inspector-group-body space-y-1">
    {rows.map((row) => <div key={row.key} className="flex items-center justify-between gap-2 px-1 py-0.5 rounded hover:bg-slate-50">
      <span className={row.visible ? 'text-ink-700' : 'text-ink-400 line-through'}>{row.name}</span>
      <button type="button" className="dc-btn dc-btn-sm !px-1.5" data-part-eye={row.key} aria-pressed={row.visible}
        disabled={component.locked} title={row.visible ? 'Ocultar esta peça' : 'Mostrar esta peça'}
        aria-label={`${row.visible ? 'Ocultar' : 'Mostrar'} ${row.name}`} onClick={() => toggle(row.key, row.visible)}>
        {row.visible ? <IconEye size={13} /> : <IconEyeOff size={13} />}
      </button>
    </div>)}
  </div></details>
}
