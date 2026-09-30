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
  | 'breakerWegMdwC10'
  | 'motorBreaker'
  | 'residualBreaker'
  | 'phoenixEcb3000760'
  | 'fuse'
  | 'fuseHolder'
  | 'surgeProtector'
  | 'thermalRelay'
  // --- Comando ----------------------------------------------------------
  | 'buttonNO'
  | 'buttonNC'
  | 'dualPushButtonNpb22D11'
  | 'emergencyButton'
  | 'emergencyButtonKeyP20ACR'
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
  | 'contactorWegCWC09'
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
  | 'pilotLightAd22'
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
  | 'plcSiemensLogo1224RC'
  | 'plcLsXbmDn32s'
  | 'siemensTsAdapterIeBasic'
  | 'hmi'
  // --- Bornes, barras e fontes -----------------------------------------
  | 'terminalBlock'
  | 'terminalPhoenixPti6'
  | 'terminalPE'
  | 'dinRail15x55'
  | 'busbarPhase'
  | 'busbarNeutral'
  | 'earthBar'
  | 'transformer'
  | 'powerSupply'
  | 'powerSupplyProauto24A'
  | 'analogAmmeter'

/**
 * Tipos físicos de terminal/conexão do borne — inclui os terminais de cabo
 * mais comuns (anel/olhal, garfo, pino, cônico, garra, tubular, faston
 * macho/fêmea, barra) além dos tipos de fixação do próprio borne
 * (parafuso, mola/push-in, plug). Todos têm cor editável no inspetor.
 */
export type TerminalType =
  | 'screw'
  | 'spring'
  | 'plug'
  | 'faston'
  | 'fastonMale'
  | 'fastonFemale'
  | 'ring'
  | 'fork'
  | 'pin'
  | 'conical'
  | 'claw'
  | 'tubular'
  | 'bar'

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
  /** Nome de apresentação editável, sem mudar o código elétrico do borne. */
  displayName?: string
  /** Função lógica usada pelo motor de continuidade */
  kind: TerminalKind
  /** Tipo físico do borne (editável no inspetor) */
  terminalType: TerminalType
  /** Cor do borne no esquema 3D/2D (editável) */
  color: string
  /** Posição no footprint local do componente (0..1) */
  x: number
  y: number
  /** Posição física normalizada no volume 3D do componente.
   * X = esquerda/direita, Y = baixo/cima, Z = trás/frente (0..1). */
  position3D?: { x: number; y: number; z: number }
  /** Diâmetro do borne no Esquema 2D (unidades do canvas). Omisso = tamanho padrão do símbolo. */
  diameter?: number
  /** Fixado pelo usuário — impede reposicionamento automático */
  pinned?: boolean
  /** Está energizado neste ciclo de varredura (derivado) */
  energized: boolean
}

export interface ComponentViewOrientation {
  /** Rotação visual adicional em graus, sem alterar lógica, bornes ou modelo de origem. */
  x: number
  y: number
  z: number
}

export type Component3DRenderMode = 'solid' | 'wireframe' | 'xray'

export interface Component3DScale {
  /** Escala visual por eixo. 1 mantém as dimensões físicas do GLB. */
  x: number
  y: number
  z: number
}

/** Coordenada física no editor 3D, independente do layout legível do Esquema 2D. */
export interface SpatialPoint3D {
  x: number
  y: number
  z: number
}

/** Posição visual de um borne numa vista 3D. Os valores são relativos ao
 * footprint original e podem ultrapassar 0..1 quando a vista projetada é maior. */
export interface ComponentTerminalViewPosition {
  x: number
  y: number
}

/** Posições manuais por vista/orientação, indexadas pelo id estável do borne. */
export type ComponentTerminalViewPositions = Record<string, Record<string, ComponentTerminalViewPosition>>

export interface ElectricalComponentBase {
  id: string
  type: ComponentType
  category: ComponentCategory
  /** TAG do dispositivo: KM1, S1, F1, M1, H1… */
  ref: string
  label: string
  /** Posição no trilho DIN (índice) para o painel 3D */
  slot: number
  /** Calha DIN (componente `dinRail15x55`) onde este equipamento está fixo. */
  railId?: string
  /** Distância (mm) do início da calha ao bordo esquerdo do equipamento. */
  railOffsetMm?: number
  /** Canto superior-esquerdo no esquema 2D (unidades do canvas) */
  schematicX: number
  schematicY: number
  /** Largura / altura do footprint no esquema 2D */
  w: number
  h: number
  /** Rotação do footprint no esquema: 0 | 90 | 180 | 270. */
  rotation: number
  /** Orientação visual 3D adicional desta instância; não altera a lógica elétrica. */
  viewOrientation?: ComponentViewOrientation
  /** Ajustes visuais dos bornes por vista 3D. As ligações continuam referenciadas pelo id. */
  terminalViewPositions?: ComponentTerminalViewPositions
  /** Escala visual individual no Painel 3D; não altera o GLB de origem. */
  view3DScale?: Component3DScale
  /** Posição editável no Painel 3D. Não desloca o símbolo do Esquema 2D. */
  panel3DPosition?: SpatialPoint3D
  /** Apresentação individual do modelo no Painel 3D. */
  view3DRenderMode?: Component3DRenderMode
  /** Espelhamento horizontal */
  mirrored?: boolean
  /** Bloqueado contra arraste acidental */
  locked?: boolean
  /** Ordem de empilhamento no esquema (maior = mais à frente). Cabos e
   *  componentes compartilham o mesmo espaço de camadas. */
  z?: number
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

/**
 * Terminação aplicada a cada ponta do cabo:
 * ponteira tubular, ponteira dupla, olhal, forquilha, pino, faston, estanhado
 * ou ponta nua.
 */
export type WireEndType = 'none' | 'ferrule' | 'ferruleDouble' | 'ring' | 'fork' | 'pin' | 'faston' | 'tinned'

/** Valores usados ao desenhar novos cabos (ferramenta Cabo). */
export interface WireDefaults {
  /** true = cor automática pela função do cabo (força, neutro, PE…) */
  autoColor: boolean
  color: WireColor
  gauge: string
  flexibility: WireFlexibility
  endType: WireEndType
}

export interface Wire {
  id: string
  fromTerminalId: string
  toTerminalId: string
  /** Ponta livre desenhada no esquema (sem borne); não conduz corrente até ser ligada. */
  fromPoint?: { x: number; y: number }
  toPoint?: { x: number; y: number }
  color: WireColor
  /** Seção transversal, ex.: "1.5mm²" */
  gauge: string
  kind: WireKind
  flexibility: WireFlexibility
  route: WireRoute
  /** 0..1 — deslocamento do ponto de dobra (arrastável no editor) */
  bend: number
  /**
   * Deslocamento perpendicular (px) do ponto de controle da curva —
   * usado quando route === 'arc' para dar a "barriga" da curva.
   * Arrastável diretamente no esquema.
   */
  curveOffset?: number
  /**
   * Pontos de passagem (curva) adicionados pelo usuário com duplo clique no
   * cabo. Cada ponto é arrastável; com condutor rígido o cabo passa em
   * segmentos retos pelos pontos, com condutor flexível passa em curvas
   * suaves. Duplo clique num ponto remove-o.
   */
  waypoints?: Array<{ x: number; y: number }>
  /** Pontos de passagem físicos editáveis no Painel 3D. O layout 2D mantém os
   * seus próprios pontos para que cada representação continue legível. */
  waypoints3D?: SpatialPoint3D[]
  /** Terminação das pontas do cabo (ponteira, olhal, forquilha…) */
  endType?: WireEndType
  /** Opções independentes de cada extremidade; endType é o fallback legado. */
  fromEndType?: WireEndType
  toEndType?: WireEndType
  /** Cor da ponteira por ponta; sem valor segue o borne (ou cinzento se livre). */
  fromEndColor?: string
  toEndColor?: string
  /** Por omissão, a ponteira fica atrás do corpo do componente. */
  fromEndLayer?: 'back' | 'front'
  toEndLayer?: 'back' | 'front'
  /** Número do fio / identificador de chicote */
  number?: string
  label?: string
  lengthMm?: number
  energized: boolean
  /** Ordem de empilhamento no esquema (maior = mais à frente). Cabos e
   *  componentes compartilham o mesmo espaço de camadas. */
  z?: number
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
  /** MOVE BOOL: copia origem para destino quando a network está ativa. */
  move?: { source: string; target: string }
  /** Chamada explícita de um FC do mesmo PLC. */
  call?: { targetId: string }
  enabled: boolean
  comment?: string
}

export interface LadderProgram {
  rungs: LadderRung[]
}

// ---------------------------------------------------------------------------
// Tabela de Tags (variáveis) — inspirada na organização do TIA Portal:
// uma tabela por área de memória (Entradas, Saídas, Memórias, Temporizadores,
// Contadores), cada linha com Nome, Endereço, Tipo de dados e Comentário.
// ---------------------------------------------------------------------------

export type LadderDataType = 'Bool' | 'Time' | 'Int' | 'Real'

export interface LadderTag {
  id: string
  /** Endereço absoluto ao qual esta tag se refere: I1, Q1, M1, T1, C1… */
  address: string
  /** Nome simbólico dado pelo usuário: "Botao_Start", "Motor_M1"… */
  name: string
  dataType: LadderDataType
  comment?: string
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
  /** Imã de calha: centra e fixa equipamentos de calha DIN ao largá-los perto de uma calha (omisso = ligado). */
  railMagnet?: boolean
}

export interface CircuitState {
  components: ElectricalComponent[]
  wires: Wire[]
  ladder: LadderProgram
  tags: LadderTag[]
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
