// ============================================================================
// DC-Simu — Modelo de domínio central
//
// Existe UM único objeto em tempo de execução por componente / borne / cabo.
// Todas as vistas (painel 3D, esquema 2D, editor Ladder, inspetor, monitor)
// apenas renderizam esse modelo — não há estado duplicado.
//
// v2 (editor completo): acrescenta geometria do componente (footprint), bornes
// editáveis (tipo/cor/rótulo), cabos com tipo/seção/rigidez/roteamento,
// malha (grid) de edição, ferramentas, histórico (undo/redo), injeção de
// falhas e medições de multímetro.
// ============================================================================

export type ComponentCategory =
  | 'protection'
  | 'command'
  | 'sensor'
  | 'contactor'
  | 'relay'
  | 'signaling'
  | 'motor'
  | 'drive'
  | 'controller'
  | 'terminal'
  | 'power'

export type ComponentType =
  // --- Proteção ---------------------------------------------------------
  | 'breaker1p'
  | 'breaker2p'
  | 'breaker3p'
  | 'breaker4p'
  | 'motorBreaker'
  | 'residualBreaker'
  | 'fuse'
  | 'fuseHolder'
  | 'surgeProtector'
  | 'thermalRelay'
  // --- Comando ----------------------------------------------------------
  | 'buttonNO'
  | 'buttonNC'
  | 'emergencyButton'
  | 'selector2'
  | 'selector3'
  | 'keySwitch'
  | 'footSwitch'
  | 'limitSwitch'
  // --- Sensores ---------------------------------------------------------
  | 'proximitySensor'
  | 'photoSensor'
  | 'pressureSwitch'
  | 'thermostat'
  | 'floatSwitch'
  // --- Contatores -------------------------------------------------------
  | 'contactor'
  | 'contactor4p'
  | 'auxContactBlock'
  // --- Relés ------------------------------------------------------------
  | 'auxRelay'
  | 'auxRelay4'
  | 'timerRelayTON'
  | 'timerRelayTOF'
  | 'timerRelayStarDelta'
  | 'counterRelay'
  | 'safetyRelay'
  // --- Sinalização ------------------------------------------------------
  | 'ledGreen'
  | 'ledRed'
  | 'ledYellow'
  | 'ledWhite'
  | 'buzzer'
  | 'towerLight'
  // --- Motores / acionamentos ------------------------------------------
  | 'motor3ph'
  | 'motor1ph'
  | 'vfd'
  | 'softStarter'
  // --- Controladores ----------------------------------------------------
  | 'plcLogo'
  | 'plcCompact'
  | 'hmi'
  // --- Bornes, barras e fontes -----------------------------------------
  | 'terminalBlock'
  | 'terminalPE'
  | 'busbarPhase'
  | 'busbarNeutral'
  | 'earthBar'
  | 'transformer'
  | 'powerSupply'
  | 'analogAmmeter'

/** Tipos físicos de conexão do borne (parafuso, mola/push-in, faston, olhal, plug). */
export type TerminalType = 'screw' | 'spring' | 'faston' | 'ring' | 'plug'

export type TerminalKind =
  | 'power-in'
  | 'power-out'
  | 'coil-plus'
  | 'coil-minus'
  | 'aux-no'
  | 'aux-nc'
  | 'neutral'
  | 'earth'
  | 'io'
  | 'analog'
  | 'bus'

/** Um ponto de conexão físico/elétrico de um componente. */
export interface Terminal {
  id: string
  componentId: string
  /** Rótulo impresso no dispositivo real: "A1", "13", "1L1", "U1"… */
  label: string
  /** Função lógica usada pelo motor de continuidade */
  kind: TerminalKind
  /** Tipo físico do borne (editável no inspetor) */
  terminalType: TerminalType
  /** Cor do borne no esquema 3D/2D (editável) */
  color: string
  /** Posição no footprint local do componente (0..1) */
  x: number
  y: number
  /** Fixado pelo usuário — impede reposicionamento automático */
  pinned?: boolean
  /** Está energizado neste ciclo de varredura (derivado) */
  energized: boolean
}

export interface ElectricalComponentBase {
  id: string
  type: ComponentType
  category: ComponentCategory
  /** TAG do dispositivo: KM1, S1, F1, M1, H1… */
  ref: string
  label: string
  /** Posição no trilho DIN (índice) para o painel 3D */
  slot: number
  /** Canto superior-esquerdo no esquema 2D (unidades do canvas) */
  schematicX: number
  schematicY: number
  /** Largura / altura do footprint no esquema 2D */
  w: number
  h: number
  /** Rotação no esquema: 0 | 90 | 180 | 270 */
  rotation: number
  /** Espelhamento horizontal */
  mirrored?: boolean
  /** Bloqueado contra arraste acidental */
  locked?: boolean
  /** Caixa de bornes/cor do corpo do componente no editor */
  bodyColor?: string
  terminals: Terminal[]
  /** Estado em tempo de execução — estreitado por tipo nas interfaces abaixo */
  state: Record<string, any>
  faults: string[]
}

// ----- Formatos de estado documentados --------------------------------------

export interface ButtonState { pressed: boolean }
export interface ContactorState { energized: boolean; interlockWith?: string | null }
export interface RelayState { energized: boolean }
export interface TimerState { energized: boolean; elapsedMs: number; presetMs: number; done: boolean; running: boolean }
export interface LampState { on: boolean }
export interface MotorState { running: boolean; direction: 'cw' | 'ccw' | 'stopped'; rpmVisual: number; tripped: boolean }
export interface BreakerState { closed: boolean; tripped: boolean }
export interface DriveState { running: boolean; frequencyHz: number; rampMs: number; enabled: boolean }
export interface PlcState {
  inputs: Record<string, boolean>
  outputs: Record<string, boolean>
  memories: Record<string, boolean>
}

export type ElectricalComponent = ElectricalComponentBase

// ---------------------------------------------------------------------------
// Cabos (fios)
// ---------------------------------------------------------------------------

export type WireColor =
  | 'red'
  | 'blue'
  | 'green-yellow'
  | 'black'
  | 'orange'
  | 'grey'
  | 'brown'
  | 'white'
  | 'pink'
  | 'violet'
  | 'green'
  | 'yellow'
  | 'lightblue'

/** Função do cabo — define cor/roteamento sugeridos. */
export type WireKind = 'power' | 'control' | 'signal' | 'neutral' | 'earth' | 'bus'

/** Condutor rígido (fio sólido) ou flexível (multifilar). */
export type WireFlexibility = 'rigid' | 'flexible'

export type WireRoute = 'orthogonal' | 'direct' | 'arc' | 'manhattan'

export interface Wire {
  id: string
  fromTerminalId: string
  toTerminalId: string
  color: WireColor
  /** Seção transversal, ex.: "1.5mm²" */
  gauge: string
  kind: WireKind
  flexibility: WireFlexibility
  route: WireRoute
  /** 0..1 — deslocamento do ponto de dobra (arrastável no editor) */
  bend: number
  /** Número do fio / identificador de chicote */
  number?: string
  label?: string
  lengthMm?: number
  energized: boolean
}

// ---------------------------------------------------------------------------
// Ladder
// ---------------------------------------------------------------------------

export type LadderContactType = 'NO' | 'NC' | 'RISING' | 'FALLING'
export type LadderCoilType = 'COIL' | 'SET' | 'RESET'
export type LadderBlockKind =
  | 'TON'
  | 'TOF'
  | 'TP'
  | 'STAR_DELTA'
  | 'CTU'
  | 'CTD'
  | 'COMPARE'
  | 'MOVE'

export interface LadderContact {
  kind: 'contact'
  id: string
  address: string
  contactType: LadderContactType
  prevValue?: boolean
  comment?: string
}

export interface LadderCoilEl {
  kind: 'coil'
  id: string
  address: string
  coilType: LadderCoilType
  comment?: string
}

export interface LadderTimer {
  kind: 'timer'
  id: string
  address: string
  timerType: 'TON' | 'TOF' | 'TP' | 'STAR_DELTA'
  presetMs: number
  /** 2ª preset (estrela→triângulo): tempo de transição */
  preset2Ms?: number
}

export interface LadderCounter {
  kind: 'counter'
  id: string
  address: string
  counterType: 'CTU' | 'CTD'
  preset: number
  /** endereço do pulso de reset (R) */
  resetAddress?: string
}

export type LadderElement = LadderContact | LadderCoilEl | LadderTimer | LadderCounter

export interface LadderBranch {
  id: string
  elements: LadderContact[]
}

export interface LadderRung {
  id: string
  name: string
  branches: LadderBranch[]
  coils: LadderCoilEl[]
  timer?: LadderTimer
  counter?: LadderCounter
  enabled: boolean
  comment?: string
}

export interface LadderProgram {
  rungs: LadderRung[]
}

// ---------------------------------------------------------------------------
// Simulação
// ---------------------------------------------------------------------------

export interface SimulationDiagnostic {
  id: string
  level: 'error' | 'warning' | 'info'
  message: string
  componentId?: string
}

export interface SimEvent {
  id: string
  ts: number
  level: 'error' | 'warning' | 'info'
  message: string
}

/** Modos de simulação disponíveis. */
export type SimMode = 'realtime' | 'turbo' | 'step' | 'continuous'

export interface FaultState {
  phaseLoss: boolean
  shortCircuit: boolean
  earthLeak: boolean
  overvoltage: boolean
  overload: boolean
}

export interface Measurement {
  id: string
  ref: string
  kind: 'tensão' | 'corrente' | 'frequência' | 'isolamento'
  value: number
  unit: string
  ok: boolean
}

export interface ProbeResult {
  a: string | null
  b: string | null
  connected: boolean
  hops: number
  resistanceOhm: number | null
  voltage: string
  note: string
}

export type SimRunState = 'stopped' | 'running' | 'paused'

export interface SimulationState {
  runState: SimRunState
  mode: SimMode
  scanCount: number
  speed: number
  stepMode: boolean
  diagnostics: SimulationDiagnostic[]
  faults: FaultState
  events: SimEvent[]
  measurements: Measurement[]
  blackBox: boolean
}

// ---------------------------------------------------------------------------
// Editor
// ---------------------------------------------------------------------------

export type EditorTool = 'select' | 'wire' | 'probe' | 'erase' | 'pan'

export interface GridSettings {
  enabled: boolean
  size: number
  snap: boolean
  style: 'dots' | 'lines'
  background: string
}

export interface CircuitState {
  components: ElectricalComponent[]
  wires: Wire[]
  ladder: LadderProgram
  sim: SimulationState
  activeScenario: string
  selectedComponentIds: string[]
  selectedWireId: string | null
  selectedTerminalId: string | null
  tool: EditorTool
  grid: GridSettings
  zoom: number
  panX: number
  panY: number
  dirty: boolean
}
