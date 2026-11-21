import { electricalComponentView, builtinRuntimeType } from '../electrical/builtinRuntime'
import { adjacentDuctPlacement, fitAdjacentDuct, snapNewDuct, type DuctPlacement } from '../schematic/ductPlacement'
import { create } from 'zustand'
import { EDITOR_THEME } from '../ui/editorTheme'
import { nextDeclaredTagAddress, signalAliasMap } from '../grafcet/signals'
import { normalizeBitAddress } from '../ladder/addresses'
import { migrateLegacyAddresses } from './migrations'
import { groupIds, parseSelectionGroups, ungroupIds, type SelectionGroup, type SelectionGroupView } from '../ui/selectionGroups'

/** Grupos antigos (Ctrl+G do Esquema 2D gravava `groupId` nos componentes) → grupos de seleção. */
function legacyComponentGroups(components: Array<{ id: string; groupId?: string }>): SelectionGroup[] {
  const byGroup = new Map<string, string[]>()
  for (const c of components) if (c.groupId) byGroup.set(c.groupId, [...(byGroup.get(c.groupId) ?? []), c.id])
  return [...byGroup].filter(([, members]) => members.length >= 2).map(([id, members]) => ({ id, view: 'schematic' as const, members }))
}
import { upgradeNativeMotorMeter, upgradeNativeMotorRings } from '../project/nativeMotorMeter'
import { refreshNativeWireCurves } from '../project/nativeWireCurves'
import { planNativeWirePaths } from '../project/nativeRouting'
import { lacePairBundles } from '../three/bundleLacing'
import { defaultCoreColors } from '../admin/editor3d/wireStyle'
import { dinFerruleColor } from '../schematic/wireEndColor'
import { orthogonalizeWaypoints2D, simplifyWaypoints2D } from '../schematic/wireGeometry'
import { addNativeIecSchematic } from '../project/nativeIec'
import { addNativeAnnotations, upgradeNativeGrafcetTags } from '../project/nativeProjects'
import { addNativeThermalRelay } from '../project/nativeThermalRelay'
import { fixNativeCoilWiring } from '../project/nativeCoilFix'
import { addNativeSignals } from '../project/nativeSignals'
import { syncNativeLadder } from '../project/nativeLadderSync'
import { upgradeNativeNcSimInputs } from '../project/nativeSimInputs'
import { normalizeKind, normalizeUnlockedViews, type ProjectKind, type WorkspaceView } from '../project/kind'
import { syncDemoMode } from './demoMode'
import { readOperand } from '../ladder/compare'
import { emptyCommands, type CommandsDiagram } from '../commands/model'
import { normalizeCommandsPages } from '../commands/pages'
import { emptyGrafcet, emptyGrafcetRuntime, scanGrafcet, setGrafcetNumericReader, setGrafcetSignalAliasResolver, forceSteps, fireTransition, type GrafcetProgram, type GrafcetRuntime } from '../grafcet/engine'
import { nanoid } from 'nanoid'
import type {
  CircuitState,
  ElectricalComponent,
  LadderRung,
  LadderTag,
  LadderDataType,
  Wire,
  WireKind,
  WireColor,
  WireDefaults,
  EditorTool,
  GridSettings,
  SimMode,
  SimEvent,
  FaultState,
  ComponentType,
  ComponentViewOrientation,
  Component3DRenderMode,
  Component3DScale,
  ComponentTerminalViewPosition,
  ComponentTerminalViewPositions,
  Terminal,
  ProbeResult,
  SpatialPoint3D,
  CanvasNote,
  CanvasText,
} from '../types'
import { logoElectricalInputs } from '../electrical/logoPower'
import { SIEMENS_S7_TYPES } from '../electrical/siemensPlc'
import { defaultWireEndTypeForTerminal, syncLeadCableHeatShrink, syncSharedTerminalFerrules } from '../electrical/sharedFerrules'
import { generateIecDiagramFromPhysical } from '../commands/fromPhysical'
import { terminalClassesCompatible, terminalElectricalClassOf, TERMINAL_ELECTRICAL_CLASS_LABEL } from '../electrical/terminalClassification'
import { proautoInputPowered } from '../electrical/proautoPower'
import { computeContinuity, isCoilPowered, isLoadPowered, probe, sourceTerminalIds } from '../electrical/engine'
import { importedActuationPatch, importedComponentInfo, updateImportedLoads, updateImportedPower } from '../electrical/importedComponents'
import { industrialInput, industrialDeviceTypeOf, updateIndustrialDevice, type IndustrialElectricalContext } from '../electrical/industrialDevices'
import { updatePanelMeters } from '../electrical/panelMeterModel'
import { updateMsr127 } from '../electrical/msr127'
import { playClick, syncIndustrialSounders, syncMotorHumFromComponents, silenceAll, unlockAudio, playShortCircuitBoom, startOverheatSizzle, stopOverheatSizzle, playWireBurnPop } from '../audio/sfx'
import { evaluateShortCircuits } from '../electrical/shortCircuitEngine'
import { computePhaseLabels, motorDirectionFromPhases } from '../electrical/phases'
import { findBreakpointHit, describeBreakHit, type LadderBreakHit, type LadderBreakMode } from '../ladder/ladderDebug'
import { runScan, type RungTraceEntry, type AddressTable, type TimerTable, type CounterTable, type EdgeTable, emptyTable, nextAddress, collectUsedAddresses, isDeclarableAddress, defaultDataTypeFor } from '../ladder/ladderEngine'
import { detectDiagnostics } from '../utils/errorDetection'
import { buildMeasurements } from '../utils/measurements'
import { createComponent, createTerminal, nextRef, TEMPLATES, terminalByLabel, upgradeLogoTerminals, upgradeLsXbmFront, upgradeMonoMotorTerminals, upgradePhysicalFootprint, upgradeProauto24A, upgradeRealInterfacePositions, upgradeProtectionTerminalPositions, upgradeTerminalAssemblyPositions } from '../electrical/factory'
import {
  canTerminalHaveJumper,
  describeTerminalStripRefs,
  isTerminalStripType,
  nextFreeStripPrefix,
  nextStripMemberRef,
  parseTerminalRef,
  planTerminalStripRefs,
  pti6SchematicFootprint,
  pti6TerminalTemplates,
  resolveTerminalStrips,
  TERMINAL_STRIP_GAP_PX,
  TERMINAL_STRIP_PRESETS,
  terminalMemberWidthMm,
  terminalStripFor,
  type StripNumberingMode,
  type TerminalStripMemberSpec,
  type TerminalStripPreset,
} from '../electrical/pti6Strip'
import { terminalPos } from '../schematic/symbols'
import { connectNearWireEnds } from '../schematic/terminalSnap'
import { blankPlcProgram, fcPresentOf, isProgrammablePlc, programsForSave, type PlcProgram } from '../ladder/plcPrograms'
import { compileGateEnabled, compileInputOf, compileLadder } from '../ladder/ladderCompile'
import { autoExecRungs, callableBlocks, defaultProjectFileContent, type ProjectFile, type ProjectFolder } from '../ladder/projectFiles'
import { plcIoCapacity } from '../ladder/plcIo'
import { withEmptyNetworkBelow } from '../ladder/autoNetwork'
import { parseDataBlocks, type DbTable } from '../ladder/dataBlocks'
import { saveProject, loadProject, deleteProject, setLastOpened } from '../utils/persistence'
import { writeElectricalCrossClipboard, readElectricalCrossClipboard } from '../clipboard/crossProjectClipboard'
import { canInsertComponent3D, getComponentModelSpec, PANEL_UNITS_PER_MM, SCHEMATIC_PX_PER_MM } from '../three/modelPaths'
import type { PlannedComponent } from '../excel/componentSheet'
import { SCHEMATIC_ORIGIN, panelToSchematicX, panelToSchematicY } from '../three/panelLayout'
import { isDinRail, isRailMountable, railSpanMm, reflowRailChildren, resizeRailGeometry, snapToRail } from '../three/railMount'
import { findMountTarget, isThermalRelay, syncMounted } from '../three/thermalMount'
import { findSocketMountTarget, isPlugInRelay, isRelaySocket, relaySocketMountPosition, syncSocketMounted } from '../three/relaySocketMount'
import {
  combConnectorMountPosition,
  combMountPosition,
  findCombConnectorMountTarget,
  findCombMountTarget,
  isBreaker,
  isCombBusbar,
  isCombConnector,
  syncCombMounted,
} from '../three/combMount'
import { clampRailLengthMm } from '../three/dinRailGeometry'
import { componentOrientationOf, componentTerminalViewKey, isIsometricMotorType, MOTOR_ISOMETRIC_ORIENTATION, normalizeComponentOrientation, saveDefaultComponent3DPresentation, saveDefaultComponentOrientation, saveDefaultComponentTerminalViewPositions, ZERO_COMPONENT_ORIENTATION } from '../three/componentOrientation'
import { automaticTerminalViewPositions, componentTerminalLocal, terminal3DFromProjectedLocal } from '../schematic/componentTerminalViews'
import { componentPositionIsFree, nearestFreeComponentPosition, resolveComponentMove, stackOnTopPosition } from '../schematic/componentCollision'
import { component3DScaleOf, normalizeComponent3DScale, normalizeTerminal3DPosition, terminal3DPositionOf, type Terminal3DPosition } from '../three/terminal3D'
import { setStoredCover } from '../three/coverCapture'
import { componentEditorChangeLabels, componentEditorSnapshotEquals, componentEditorSnapshotOf, componentEditorVersionOf, nextComponentHistory, previousComponentRevision, upgradeComponentEditorMetadata } from '../three/componentRevisions'
import { isPanelAccessoryType } from '../three/enclosureParts'
import { allowedManobraPatch, isManobraAllowed } from './manobra'
import {
  busbarFootprintPx,
  busbarTerminalSpecs,
  clampAcrylicBusbarPoles,
  clampSteppedBusbarHoles,
  isAcrylicBusbarType,
  isRealBusbarType,
  isCombBusbarType,
  isCombConnectorType,
  steppedBarsModeOf,
} from '../three/busbarParts'

export interface Snapshot {
  components: ElectricalComponent[]
  wires: Wire[]
  ladder: LadderRung[]
  /** Incluído no histórico para que Desfazer/Refazer funcione também no editor GRAFCET. */
  grafcet?: GrafcetProgram
  /** Esquema de comandos elétricos (simulador de comandos). */
  commands?: CommandsDiagram
  fcBlocks?: { fc1: LadderRung[]; fc2: LadderRung[] }
  plcPrograms?: Record<string, PlcProgram>
  activePlcId?: string | null
  /** Dados auxiliares do programa Ladder também têm de voltar no mesmo passo.
   *  Sem estes campos, desfazer uma edição de endereço deixava a tag alterada. */
  tags?: LadderTag[]
  plcTags?: Record<string, LadderTag[]>
  projectFiles?: Record<string, ProjectFile[]>
  hiddenProjectFolders?: Record<string, ProjectFolder[]>
  /** Rótulos personalizados das pastas do projeto (duplo clique na árvore). */
  projectFolderLabels?: Record<string, Partial<Record<ProjectFolder, string>>>
  /** Nome personalizado das funções fixas (FC1/FC2). */
  fcNames?: Partial<Record<'fc1' | 'fc2', string>>
  /** Textos livres dos canvas (IEC, 3D…): criar, apagar ou mover um texto também se desfaz. */
  canvasTexts?: CanvasText[]
  /** Grupos de seleção dos editores (Ctrl+G / Ctrl+Shift+G). */
  selectionGroups?: SelectionGroup[]
}

interface PlcScanRuntime {
  table: AddressTable
  timers: TimerTable
  counters: CounterTable
  rungPowered: Record<string, boolean>
  db: DbTable
  /** memória de flanco RISING/FALLING por contacto (nunca entra no programa) */
  edges: EdgeTable
  /** true depois de os OBs de arranque (OB 100) correrem uma vez neste RUN */
  startupDone?: boolean
}

interface RuntimeExtras {
  table: AddressTable
  timers: TimerTable
  counters: CounterTable
  rungPowered: Record<string, boolean>
  /** Rasto do último scan do programa na vista (uma entrada por network, pela ordem de execução). */
  rungTrace?: RungTraceEntry[]
  /** Networks saltadas por JMP/JMPN no último scan. */
  rungSkipped?: Record<string, boolean>
  db: DbTable
  /** mesma memória de flanco do PlcScanRuntime, para o programa geral (sem PLC) */
  edges: EdgeTable
  /** mesmo papel do `startupDone` por PLC, mas para o programa geral (sem PLC) */
  startupDone?: boolean
  plcRuntime: Record<string, PlcScanRuntime>
  energizedTerminals: Set<string>
  energizedWires: Set<string>
}

interface Store extends CircuitState {
  canvasNotes: CanvasNote[]
  addCanvasNote: (note: Omit<CanvasNote, 'id' | 'createdAt'>) => void
  updateCanvasNote: (id: string, patch: Partial<CanvasNote>) => void
  removeCanvasNote: (id: string) => void
  canvasTexts: CanvasText[]
  addCanvasText: (text: Omit<CanvasText, 'id' | 'createdAt'>) => string
  updateCanvasText: (id: string, patch: Partial<CanvasText>) => void
  /** `history: false` quando o chamador já registou o passo de Desfazer (apagar em grupo). */
  removeCanvasText: (id: string, history?: boolean) => void
  /** Grupos de seleção por vista (Esquema/3D, GRAFCET, IEC): clicar num membro seleciona o grupo. */
  selectionGroups: SelectionGroup[]
  /** Ctrl+G: agrupa os ids (≥ 2) da vista; devolve false se não havia o que agrupar. */
  groupItems: (view: SelectionGroupView, ids: string[]) => boolean
  /** Ctrl+Shift+G: desfaz os grupos de que algum id faz parte; devolve false se nenhum. */
  ungroupItems: (view: SelectionGroupView, ids: string[]) => boolean
  /** Incrementa a cada varredura publicada (`pushRuntime`). Substitui as cópias
   *  por tick das listas `components`/`wires`: quem apresenta estado elétrico em
   *  tempo real (LEDs, bornes energizados, monitores) subscreve este escalar em
   *  vez da identidade das listas — as listas mantêm a referência porque o motor
   *  simula por mutação no sítio. */
  simTick: number
  runtime: RuntimeExtras
  showEmptyWelcome: boolean
  dismissEmptyWelcome: () => void
  grafcet: GrafcetProgram
  grafcetRuntime: GrafcetRuntime
  /** Esquema de comandos elétricos (potência + comando, símbolos IEC 60617). */
  commands: CommandsDiagram
  setCommands: (diagram: CommandsDiagram, historyMode?: 'auto' | 'force' | 'skip', historyKey?: string) => void
  /** Gera o Esquema IEC 60617 (comandos e força) a partir do layout e ligações 3D reais. */
  generateIecFromPhysical: () => void
  setGrafcet: (program: GrafcetProgram, historyMode?: 'auto' | 'force' | 'skip', historyKey?: string) => void
  fcBlocks: Record<'fc1' | 'fc2', LadderRung[]>
  /** FC1/FC2 não vêm por defeito: só entram na árvore depois de adicionadas
   *  manualmente («+» em Blocos de programa) — ou quando já têm conteúdo/nome. */
  fcAdded: Record<'fc1' | 'fc2', boolean>
  addFc: (id: 'fc1' | 'fc2') => void
  activePlcId: string | null
  plcPrograms: Record<string, PlcProgram>
  plcTags: Record<string, LadderTag[]>
  projectFiles: Record<string, ProjectFile[]>
  /** Pastas opcionais ocultadas pelo utilizador, separadas por PLC. */
  hiddenProjectFolders: Record<string, ProjectFolder[]>
  /** Rótulos personalizados das pastas, separados por PLC (sem entrada = nome predefinido). */
  projectFolderLabels: Record<string, Partial<Record<ProjectFolder, string>>>
  /** Nome personalizado das funções fixas FC1/FC2 (duplo clique na árvore). */
  fcNames: Partial<Record<'fc1' | 'fc2', string>>
  addProjectFile: (folder: ProjectFolder, name: string) => string | null
  updateProjectFile: (id: string, patch: Partial<Pick<ProjectFile, 'name' | 'content' | 'rungs' | 'exec'>>) => void
  deleteProjectFile: (id: string) => void
  deleteProjectFolder: (folder: ProjectFolder) => void
  restoreProjectFolder: (folder: ProjectFolder) => void
  renameProjectFolder: (folder: ProjectFolder, name: string | null) => void
  renameFc: (id: 'fc1' | 'fc2', name: string | null) => void
  restoreProjectBackup: (id: string) => boolean
  setActivePlc: (id: string) => void
  updateFc: (id: 'fc1' | 'fc2', rungs: LadderRung[]) => void
  history: Snapshot[]
  future: Snapshot[]
  selectedDecal: { componentId: string; decalId: string } | null
  _decalMove: { componentId: string; decalId: string; x: number; y: number; before: Snapshot; dirty: boolean } | null
  selectDecal: (componentId: string, decalId: string | null) => void
  beginDecalMove: () => void
  moveSelectedDecal: (dxMm: number, dyMm: number) => void
  endDecalMove: () => void
  cancelDecalMove: () => void
  probeResult: ProbeResult | null
  /** primeiro ponto fixado da sonda (o segundo clique conclui a medição) */
  probeA: string | null
  clipboard: Snapshot | null
  /** Nome do projeto guardado no navegador atualmente aberto (null = projeto
   *  sem nome / carregado de arquivo / cenário pronto — ainda não guardado). */
  currentProjectName: string | null
  /** Marca de projeto nativo (semente embutida, ex.: «Partida direta»).
   *  Persiste no conteúdo do ficheiro («nativeId») para que os backends possam
   *  reimplantar a semente só quando não existir nenhuma cópia materializada. */
  nativeId: string | null
  nativeFeatures: string[]
  /** Ephemeral document identity; prevents drafts from writing into a newly loaded project. */
  projectRevision: number
  projectKind: ProjectKind
  setProjectKind: (kind: ProjectKind) => void
  /** Vistas extra desbloqueadas num projeto especializado (ex.: só 3D + Ladder). */
  unlockedViews: WorkspaceView[]
  unlockProjectView: (view: WorkspaceView) => void
  /** Entradas virtuais (I1…): usadas quando o projeto não tem PLC físico no esquema. */
  virtualInputs: Record<string, boolean>
  virtualInputCount: number
  /** Nº de saídas (Q0.0…) e memórias (M0.0…) mostradas no painel de E/S virtual. */
  virtualOutputCount: number
  virtualMemoryCount: number
  setVirtualOutputCount: (count: number) => void
  setVirtualMemoryCount: (count: number) => void
  /** Folhas (páginas) do esquema elétrico; cada componente tem `sheet` (undefined = 1.ª folha). */
  sheets: Array<{ id: string; name: string }>
  activeSheetId: string
  addSheet: (name?: string) => string
  renameSheet: (id: string, name: string) => void
  removeSheet: (id: string) => boolean
  setActiveSheet: (id: string) => void
  /** Tipo de cada entrada virtual: 'latch' = botão com encravamento (liga/desliga), 'push' = botão de pressão (só enquanto premido). Por omissão 'latch'. */
  virtualInputModes: Record<string, VirtualInputMode>
  setVirtualInputMode: (address: string, mode: VirtualInputMode) => void
  /** Dá nome a uma entrada (guarda na tabela de tags; nome vazio remove o nome). */
  setVirtualInputName: (address: string, name: string) => void
  setVirtualInput: (address: string, on: boolean) => void
  /** Forçar valores (diagnóstico): endereço → 0/1 imposto durante o RUN, só em memória (não é gravado no projeto).
   *  Em projetos com vários PLC aplica-se ao PLC ativo na vista. */
  forces: Record<string, boolean>
  /** value null remove o forçar desse endereço. */
  setForce: (address: string, value: boolean | null) => void
  clearForces: () => void
  /** Depuração Ladder (só em memória, como o forçar): pontos de paragem por network. */
  ladderBreakpoints: Record<string, LadderBreakMode>
  /** null remove; sem modo alterna entre «ao ligar» e nenhum. */
  setLadderBreakpoint: (rungId: string, mode?: LadderBreakMode | null) => void
  clearLadderBreakpoints: () => void
  /** Liga/desliga a paragem automática (os pontos ficam marcados). */
  ladderBreakEnabled: boolean
  setLadderBreakEnabled: (on: boolean) => void
  /** Último ponto de paragem que pausou a simulação. */
  ladderBreakHit: LadderBreakHit | null
  /** Network em foco no passo a passo (índice no rasto do último scan). */
  ladderTraceCursor: number | null
  setLadderTraceCursor: (index: number | null) => void
  /** Passo a passo: pausa (se estiver em RUN) e executa exatamente um ciclo de scan. */
  ladderStepScan: () => void
  setVirtualInputCount: (count: number) => void
  clearVirtualInputs: () => void
  /**
   * Simulador de sinais de um PLC do esquema: injeta 1 numa entrada física
   * (como um botão virtual ligado entre L+ e o borne), somado ao que chega pelos
   * cabos. Guardado em `plc.state.simInputs` / `simInputModes` (vai com o projeto).
   */
  setPlcSimInput: (plcId: string, address: string, on: boolean) => void
  setPlcSimInputMode: (plcId: string, address: string, mode: VirtualInputMode) => void
  clearPlcSimInputs: (plcId: string) => void
  /** Repõe a memória de trabalho (Q, M, MW, temporizadores e contadores) a 0
   *  sem parar a simulação nem tocar nas entradas — o «MRES» do simulador. */
  resetMemory: () => void
  /** GRAFCET: forçar etapas ativas, disparar transição à mão e reiniciar a sequência. */
  forceGrafcetSteps: (stepIds: string[]) => void
  fireGrafcetTransition: (transitionId: string) => boolean
  restartGrafcet: () => void
  setCurrentProjectName: (name: string | null) => void
  /** Modo demonstração: a landing monta o editor real sobre um projeto
   *  publicado/nativo, só com controlos de simulação e sem persistência. */
  demoMode: boolean
  setDemoMode: (on: boolean) => void
  /** Bloqueia a câmara 3D (orbit/pan/zoom). Independente do lock de edição. */
  viewLocked: boolean
  setViewLocked: (on: boolean) => void
  toggleViewLocked: () => void
  /** Quando false (por defeito), impede mover equipamentos para fora das paredes/chão/teto do pavilhão fabril. */
  allowOutsideFactory: boolean
  setAllowOutsideFactory: (allow: boolean) => void
  /** Guarda o projeto atual no navegador (localStorage) sob este nome, criando
   *  ou sobrescrevendo. Usado pelo Ctrl+S e pelo painel "Projetos". */
  saveProjectAs: (name: string) => boolean
  /** Reabre um projeto guardado anteriormente no navegador. */
  loadProjectByName: (name: string) => boolean
  /** Elimina um projeto guardado no navegador. */
  deleteProjectByName: (name: string) => void
  /** Copia os componentes selecionados (e os cabos entre eles) para a área de
   *  transferência interna (Ctrl+C). */
  copySelection: () => void
  /** Cola o conteúdo copiado, gerando novos ids e mantendo os cabos internos
   *  entre os componentes colados (Ctrl+V). */
  pasteClipboard: () => void

  // --- ciclo de simulação ---
  /** RUN: todos os PLCs do esquema, ou só o PLC ativo (programa em edição). */
  simPlcScope: 'all' | 'active'
  setSimPlcScope: (scope: 'all' | 'active') => void
  play: () => void
  pause: () => void
  stop: () => void
  reset: () => void
  setSpeed: (n: number) => void
  setMode: (m: SimMode) => void
  toggleStepMode: () => void
  step: () => void
  setFaults: (patch: Partial<FaultState>) => void
  toggleBlackBox: () => void
  repairBurntEquipment: () => void
  pushEvent: (level: SimEvent['level'], message: string) => void
  _intervalId: number | null

  // --- acionamento de campo ---
  pressButton: (componentId: string, pressed: boolean) => void
  setComponentState: (componentId: string, patch: Record<string, any>) => void
  /** Gesto do utilizador sobre um aparelho: só com a simulação em RUN/PAUSA (regra global em store/manobra). */
  operateComponent: (componentId: string, patch: Record<string, any>) => void
  /** Manobra comum dos CAD: TEST/STOP/RESET têm a mesma semântica em todas as vistas. */
  actuateImported: (componentId: string, pressed: boolean, control?: import('../electrical/importedComponents').ImportedControl | null) => void
  toggleTerminal: (terminalId: string) => void

  // --- edição (editor completo) ---
  setTool: (t: EditorTool) => void
  gridDragEnabled: boolean
  setGridDragEnabled: (enabled: boolean) => void
  /** Tipo de componente em modo "posicionar com o mouse" (fantasma segue o
   * cursor no esquema; clique posiciona, Esc cancela). */
  placingType: ComponentType | null
  setPlacingType: (t: ComponentType | null) => void
  /** Componente a ser arrastado da biblioteca (HTML5 drag) — usado para o fantasma no esquema */
  dragType: ComponentType | null
  setDragType: (t: ComponentType | null) => void
  /** Editor visual partilhado pelo Esquema e Painel 3D. */
  viewOrientationEditor: {
    componentId: string
    draft: ComponentViewOrientation
    terminalViewPositions: ComponentTerminalViewPositions
    terminals: Terminal[]
    activeTerminalId: string | null
    scale3D: Component3DScale
    renderMode3D: Component3DRenderMode
    bodyColor3D?: string
    /** Diâmetro (px do Esquema) do círculo de rastreamento dos bornes. */
    trackingDiameter: number
    /** Etiquetas dos bornes durante o rastreamento. */
    trackingLabels: 'all' | 'active' | 'off'
    /** Secção aberta no editor (Vista · Bornes · Aparência · Versões). */
    section: ViewEditorSection
  } | null
  openViewOrientationEditor: (componentId: string, section?: ViewEditorSection) => void
  setViewEditorSection: (section: ViewEditorSection) => void
  /** Move um borne no volume 3D (Painel 3D); as vistas 2D passam a seguir o ponto. */
  setViewTerminalPosition3D: (terminalId: string, position: Terminal3DPosition) => void
  setViewOrientationDraft: (orientation: ComponentViewOrientation) => void
  setViewTerminalPosition: (terminalId: string, position: ComponentTerminalViewPosition) => void
  /** Cria/remove bornes apenas no rascunho. Aplicar confirma; Cancelar não altera o projeto. */
  addViewTerminal: (initial?: Partial<Pick<Terminal, 'label' | 'displayName' | 'kind' | 'terminalType' | 'electricalClass' | 'electricalClassCustom' | 'color' | 'x' | 'y' | 'position3D' | 'diameter'>>) => void
  deleteViewTerminal: (terminalId: string) => void
  setViewTerminalDefinition: (terminalId: string, patch: Partial<Terminal>) => void
  setViewActiveTerminal: (terminalId: string | null) => void
  setViewTracking: (patch: { trackingDiameter?: number; trackingLabels?: 'all' | 'active' | 'off' }) => void
  /** Diâmetro do desenho dos bornes: só o ativo ou todos. */
  setViewTerminalDiameter: (diameter: number | undefined, terminalId?: string) => void
  nudgeViewTerminal: (terminalId: string, dx: number, dy: number) => void
  setView3DScale: (scale: Component3DScale) => void
  setView3DRenderMode: (mode: Component3DRenderMode) => void
  setView3DBodyColor: (color?: string) => void
  autoPlaceViewTerminals: () => void
  /** Carrega uma versão anterior no rascunho; Aplicar cria uma nova versão. */
  restoreViewEditorRevision: (version: number) => void
  cancelViewOrientationEditor: () => void
  applyViewOrientationEditor: (saveAsDefault: boolean, note?: string) => void
  /** Preferências aplicadas aos novos cabos (ferramenta Cabo) */
  wireDefaults: WireDefaults
  setWireDefaults: (patch: Partial<WireDefaults>) => void
  addComponent: (type: ComponentType, x: number, y: number) => string | null
  /** Calha técnica nova encostada à existente: prolonga pela ponta (`left`/`right`) ou ramifica em T (`top`/`bottom`). */
  addDuctAdjacent: (id: string, slot: import('../schematic/ductPlacement').DuctSlot, lengthMm?: number) => string | null
  addMountedDevice: (type: ComponentType, enclosureId: string, face: import('../types').EnclosureHoleFace, offsetXmm: number, offsetYmm: number, cutoutMm: number, holeId?: string) => string | null
  /** Aplica uma tabela de componentes validada (Excel / tabela 3D): cria e atualiza, nunca apaga. */
  applyComponentPlan: (items: PlannedComponent[]) => { created: number; updated: number }
  duplicateComponents: (ids: string[]) => void
  duplicateWires: (ids: string[]) => void
  duplicateCanvasTexts: (ids: string[]) => void
  duplicateCanvasNotes: (ids: string[]) => void
  duplicateSelection: () => void
  updateComponent: (id: string, patch: Partial<ElectricalComponent>) => void
  /** Como `updateComponent`, sem histórico (arrasto contínuo). */
  updateComponentRaw: (id: string, patch: Partial<ElectricalComponent>) => void
  moveComponent: (id: string, x: number, y: number, movingIds?: string[]) => void
  /** Move a seleção com as setas (dx/dy em px do esquema; components + pontas livres de cabos). */
  nudgeSelection: (dx: number, dy: number) => void
  /** Comprimento da calha DIN (mm): mantém Esquema 2D, Painel 3D e equipamentos fixos coerentes. */
  setRailLength: (id: string, lengthMm: number, anchor?: 'left' | 'right', commit?: boolean) => void
  /** Imã: centra na calha mais próxima e fixa. Sem `ids` aplica a todos os equipamentos de calha. Devolve quantos ficaram fixos. */
  snapToRails: (ids?: string[], commit?: boolean) => number
  /** Solta equipamentos da calha (mantém a posição atual). */
  detachFromRail: (ids: string[]) => void
  /** Solta/desconecta todos os cabos ligados aos equipamentos (mantém as pontas livres na posição atual). */
  detachWiresFromComponents: (ids: string[]) => void
  /** Se ativo, ao arrastar componentes solta os cabos automaticamente em vez de os esticar. */
  detachWiresOnDrag: boolean
  toggleDetachWiresOnDrag: () => void
  /** Associa componentes a um quadro (`panelEnclosure`). */
  assignToEnclosure: (ids: string[], enclosureId: string) => void
  /** Remove a associação a quadro (mantém a posição atual). */
  detachFromEnclosure: (ids: string[]) => void
  /** Monta aparelhos na face do quadro (porta/laterais) — parte visível fora, bornes dentro. */
  mountOnPanel: (ids: string[], enclosureId: string, face?: import('../types').EnclosureFace) => void
  updatePanelMount: (ids: string[], patch: Partial<import('../types').PanelMount>) => void
  unmountFromPanel: (ids: string[]) => void
  /** Etiquetas realistas na face (raio, logotipo, texto) — movem-se com o hospedeiro */
  addDecal: (componentId: string, decal: Partial<import('../types').ComponentDecal> & { kind?: import('../types').DecalKind; text?: string }) => void
  updateDecal: (componentId: string, decalId: string, patch: Partial<import('../types').ComponentDecal>) => void
  removeDecal: (componentId: string, decalId: string) => void
  addPanelHole: (enclosureId: string, hole: Partial<import('../types').EnclosureHole>) => void
  updatePanelHole: (enclosureId: string, holeId: string, patch: Partial<import('../types').EnclosureHole>) => void
  removePanelHole: (enclosureId: string, holeId: string) => void
  rotateComponent: (id: string) => void
  mirrorComponent: (id: string) => void
  toggleLock: (id: string) => void
  /** Bloqueia ou desbloqueia vários componentes num só passo de histórico. */
  setComponentsLocked: (ids: string[], locked: boolean) => void
  deleteComponents: (ids: string[]) => void
  /** Agrupa e desagrupa os componentes selecionados (Ctrl+G / Ctrl+Shift+G). */
  groupSelection: () => void
  ungroupSelection: () => void
  selectComponents: (ids: string[], additive?: boolean) => void
  /** Quando ativo, cliques em componentes/cabos acumulam na seleção (como Shift). */
  multiSelectMode: boolean
  setMultiSelectMode: (on: boolean) => void
  toggleMultiSelectMode: () => void
  /** Roda os componentes indicados (graus, múltiplos de 90). */
  rotateComponents: (ids: string[], deltaDeg: number) => void
  /** Ordem de desenho no Esquema: trazer para a frente / enviar para trás. */
  reorderComponents: (ids: string[], where: 'front' | 'back' | 'forward' | 'backward') => void
  selectWire: (id: string | null, additive?: boolean) => void
  /** Filaça (agrupa em chicote) os cabos indicados; partilham `bundleId`. */
  laceWires: (ids?: string[]) => void
  /** Filaça por aparelhos: os cabos desbloqueados que ligam o mesmo par de aparelhos (2+) passam a um chicote. */
  lacePairWires: () => void
  /** Remove o chicote dos cabos (ou de todos os do mesmo bundle). */
  unlaceWires: (ids?: string[]) => void
  selectTerminal: (id: string | null) => void
  addTerminal: (componentId: string) => void
  updateTerminal: (terminalId: string, patch: Partial<Terminal>) => void
  deleteTerminal: (terminalId: string) => void
  /** Régua PTI6: define N pólos (1..48) — regenera bornes 1..2N e footprint. */
  setTerminalPoleCount: (componentId: string, poleCount: number) => void
  /** Barramentos reais (PE, N, Fase com acrílico e Fases em escada): altera o n.º de bornes (e barras 2P/3P/4P) preservando cabos ligados. */
  setBusbarPoleCount: (componentId: string, poleCount: number, barsMode?: import('../three/busbarParts').SteppedBarConductors) => void
  /** Barramento de fase com acrílico: altera a cor translúcida da tampa e dos indicadores de borne. */
  setBusbarAcrylicColor: (componentId: string, hexColor: string) => void
  /** Barramento unipolar isolado com acrílico: altera a face de entrada dos cabos (inferior ou superior). */
  setBusbarWireEntryDirection: (componentId: string, direction: 'bottom' | 'top') => void
  /** Barramento tipo pente (`busbarComb`): atualiza modo (1P/1P+N/3P/3P+N), dentes, direção, serigrafia ou conectores preservando cabos. */
  updateCombBusbar: (componentId: string, patch: Record<string, unknown>) => void
  /** Encaixa barramento tipo pente nos bornes superiores de um disjuntor (ou no mais próximo). */
  mountCombBusbar: (combId: string, breakerId?: string) => void
  /** Desencaixa barramento tipo pente. */
  unmountCombBusbar: (combId: string) => void
  /** Conector de alimentação para pente (`combBusbarConnector`): atualiza cor PA66, direção/estilo do pino e calibre preservando cabos. */
  updateCombConnector: (componentId: string, patch: Record<string, unknown>) => void
  /** Encaixa conector de alimentação tipo pino num borne de disjuntor. */
  mountCombConnector: (connectorId: string, breakerId?: string, socketLabel?: string) => void
  /** Desencaixa conector de alimentação tipo pino. */
  unmountCombConnector: (connectorId: string) => void
  /** Encaixa o relé plug-in (AVEL 411) na base undecal Finder 90.23 (ou na livre mais próxima). */
  mountRelayOnSocket: (relayId: string, socketId?: string) => void
  /** Desencaixa o relé plug-in da base, deixando-o livre ao lado. */
  unmountRelayFromSocket: (relayId: string) => void
  /** Cria X1..XN ao longo da mesma calha DIN (clona o borne selecionado). Se hierarchical, usa X1.0, X1.1… (ou startIndex: 1 → X1.1, X1.2…). */
  createTerminalStrip: (componentId: string, count: number, opts?: { hierarchical?: boolean; startIndex?: 0 | 1 }) => void
  /** Acrescenta bornes (ex.: +1, +N, +PE, +24V, 0V) à direita da régua atual, encaixados na mesma calha e agrupados automaticamente. */
  appendToTerminalStrip: (componentId: string, specs: TerminalStripMemberSpec[], opts?: { numbering?: StripNumberingMode }) => void
  /** Cria ou completa uma régua industrial pronta (3F+N+PE, L+N+PE, +24V/0V com FBS, Motor U·V·W+PE, Comando). */
  applyTerminalStripPreset: (componentId: string, presetId: TerminalStripPreset['id']) => void
  /** Liga ou desliga a ponte de encaixe FBS entre este borne e o borne seguinte da régua. */
  toggleTerminalJumper: (componentId: string, force?: boolean) => void
  /** Renumera sequencialmente todos os bornes da régua (X1.1…X1.n, X1.0…X1.n−1 ou X1…Xn). */
  renumberTerminalStrip: (componentId: string, mode: StripNumberingMode) => void
  /** Agrupa ou desagrupa todos os bornes de uma régua (`stripId` + `selectionGroups`). */
  setTerminalStripGrouped: (componentId: string, grouped: boolean) => void
  /** Configura encravamento mecânico recíproco entre dois contatores (null = sem encravamento). */
  setContactorInterlock: (componentId: string, partnerId: string | null) => void
  /** Atribui automaticamente o próximo número livre (`W1`, `W2`…) ao(s) cabo(s) selecionado(s). */
  autoNumberWire: (id: string) => void
  addWire: (fromTerminalId: string, toTerminalId: string, color?: WireColor, waypoints?: Array<{ x: number; y: number }>) => void
  /** Cabo desenhado no Painel 3D: cada ponta é um borne ou um ponto livre no espaço; devolve o id do cabo. */
  addWire3D: (from: WireEnd3D, to: WireEnd3D, waypoints3D?: SpatialPoint3D[]) => string | null
  addFreeWire: (from: { terminalId?: string; point?: { x: number; y: number } }, to: { terminalId?: string; point?: { x: number; y: number } }, waypoints?: Array<{ x: number; y: number }>) => void
  updateWire: (id: string, patch: Partial<Wire>) => void
  setWiresLocked: (locked: boolean, ids?: string[]) => void
  /** Inverte origem ↔ destino do cabo (pontas, terminações, waypoints 2D/3D, isolamento, espirais e marcadores). */
  reverseWire: (id: string) => void
  /** Seleciona todos os cabos que pertencem ao mesmo chicote (`bundleId`). */
  selectBundleWires: (bundleId: string) => void
  /** Copia o estilo do cabo selecionado para `wireDefaults` (novos cabos). */
  copyWireToDefaults: (id: string) => void
  /** Atalho nas terminações: copiar A→B, B→A ou aplicar cor DIN 46228-4 nas duas pontas. */
  applyWireEndPreset: (id: string, mode: 'copyAtoB' | 'copyBtoA' | 'dinBoth') => void
  /** Grava anilhas/marcadores normalizados nas duas pontas (8% e 92%): nº do cabo ou endereço dos bornes. */
  stampWireEndMarkers: (id: string, mode: 'number' | 'terminals') => void
  /** Refina os pontos de curva 2D de um cabo: alinhar a 90°, simplificar colineares ou limpar. */
  refineWireCurve2D: (id: string, mode: 'ortho' | 'simplify' | 'clear') => void
  deleteWire: (id: string) => void
  deleteSelection: () => void
  /** Liga em cadeia (t1→t2→t3…) uma lista de bornes selecionados, criando os cabos e
   * já organizando o roteamento entre eles para não se sobreporem. */
  connectChain: (terminalIds: string[]) => void
  /** Recalcula percursos no Esquema e 3D (todos ou os indicados), preservando
   * cabos bloqueados e ligações elétricas. */
  organizeWires: (wireIds?: string[]) => void
  /** Numera os cabos automaticamente. 'missing' numera só os sem identificação
   * (continuando a sequência existente); 'all' renumera tudo de W1 em diante. */
  autoNumberWires: (mode?: 'missing' | 'all') => void

  // --- alinhamento / distribuição (2+ componentes selecionados) ---
  alignSelection: (edge: 'left' | 'right' | 'top' | 'bottom' | 'centerX' | 'centerY') => void
  distributeSelection: (axis: 'horizontal' | 'vertical') => void

  // --- camadas (ordem de empilhamento: componentes + cabos) ---
  bringSelectionToFront: () => void
  sendSelectionToBack: () => void
  bringSelectionForward: () => void
  sendSelectionBackward: () => void
  runProbe: () => void
  clearProbe: () => void

  // --- malha / vista ---
  setGrid: (patch: Partial<GridSettings>) => void
  setZoom: (z: number) => void
  setPan: (x: number, y: number) => void

  // --- histórico ---
  undo: () => void
  redo: () => void
  commitHistory: () => void

  // --- ladder ---
  addRung: () => string
  /** Acrescenta networks geradas (ex.: a partir do GRAFCET) ao programa Ladder ativo. */
  appendRungs: (rungs: LadderRung[]) => void
  /** Substitui as networks geradas do GRAFCET («GRAFCET · …») pelas novas, mantendo as restantes. */
  replaceGeneratedRungs: (rungs: LadderRung[]) => void
  deleteRung: (rungId: string) => void
  duplicateRung: (rungId: string) => void
  moveRung: (rungId: string, dir: -1 | 1) => void
  renameRung: (rungId: string, name: string) => void
  updateRung: (rungId: string, updater: (r: LadderRung) => LadderRung, historyMode?: 'auto' | 'force' | 'skip') => void

  // --- tabela de tags (variáveis) ---
  /** Cria uma nova tag no próximo endereço livre da família indicada. */
  addTag: (prefix: 'I' | 'Q' | 'M' | 'T' | 'C') => void
  setTags: (tags: LadderTag[], context?: { activePlcId: string | null; projectRevision: number }) => boolean
  updateTag: (id: string, patch: Partial<Omit<LadderTag, 'id'>>, historyMode?: 'auto' | 'force' | 'skip') => void
  removeTag: (id: string) => void
  /** Varre o programa Ladder e cria uma tag (nome = endereço) para cada
   *  endereço já usado no programa que ainda não tenha uma tag. */
  autoDetectTags: (historyMode?: 'force' | 'skip') => number

  // --- arquivo ---
  saveJSON: () => string
  loadJSON: (json: string) => void
  newProject: (kind?: ProjectKind) => void
}

export type WireEnd3D = { terminalId: string } | { point: SpatialPoint3D }

type DrawKey = { kind: 'c' | 'w'; id: string }

/** Agrupa escrita rápida no mesmo campo (nome, comentário ou conteúdo) num
 *  único passo de Desfazer, sem juntar ações discretas como inserir/remover. */
const EDIT_HISTORY_WINDOW_MS = 900
let lastGroupedEdit = { key: '', at: 0 }
function shouldCommitGroupedEdit(key: string): boolean {
  const now = Date.now()
  const commit = key !== lastGroupedEdit.key || now - lastGroupedEdit.at > EDIT_HISTORY_WINDOW_MS
  lastGroupedEdit = { key, at: now }
  return commit
}
function resetGroupedEdit() { lastGroupedEdit = { key: '', at: 0 } }

/** Ordem de empilhamento atual (cabos + componentes), do fundo para a frente,
 * usando o campo `z` (padrão 0) com a ordem de inserção original como
 * critério de desempate — mesma lógica usada pelo SchematicView ao desenhar. */
function currentDrawOrder(components: ElectricalComponent[], wires: Wire[]): DrawKey[] {
  const entries: (DrawKey & { z: number; idx: number })[] = []
  wires.forEach((w, i) => entries.push({ kind: 'w', id: w.id, z: w.z ?? 0, idx: i }))
  components.forEach((c, i) => entries.push({ kind: 'c', id: c.id, z: c.z ?? 0, idx: i + wires.length }))
  entries.sort((a, b) => a.z - b.z || a.idx - b.idx)
  return entries.map(({ kind, id }) => ({ kind, id }))
}

/** Camada de topo para itens novos. Sem isto, um componente criado depois de
 * uma reordenação ficava com z=0 e aparecia atrás de tudo. Devolve undefined
 * enquanto ninguém mexeu nas camadas (mantém o comportamento clássico). */
let lastTrackingDiameter = 16
export type ViewEditorSection = 'orientation' | 'terminals' | 'appearance' | 'versions'

/** Remove os ajustes manuais (por vista) de um borne, para as vistas 2D voltarem a seguir o ponto 3D. */
function withoutManualTerminalPositions(positions: ComponentTerminalViewPositions, terminal: Terminal, index: number, exceptView?: string): ComponentTerminalViewPositions {
  const keys = [terminal.id, `index:${index}`, `label:${terminal.label}`]
  return Object.fromEntries(Object.entries(positions).map(([view, entries]) => [
    view,
    view === exceptView ? entries : Object.fromEntries(Object.entries(entries).filter(([key]) => !keys.includes(key))),
  ]))
}
const clampDiameter = (value: number, min: number, max: number) => Math.max(min, Math.min(max, Math.round(value * 2) / 2))

function nextTopZ(components: ElectricalComponent[], wires: Wire[]): number | undefined {
  const zs = [...components.map((c) => c.z), ...wires.map((w) => w.z)].filter((z): z is number => typeof z === 'number')
  return zs.length ? Math.max(...zs) + 1 : undefined
}

/** Grava de volta a ordem (0..n-1) como o novo `z` de cada item. */
function applyDrawOrder(order: DrawKey[], components: ElectricalComponent[], wires: Wire[]) {
  const zByKey = new Map<string, number>()
  order.forEach((k, i) => zByKey.set(`${k.kind}:${k.id}`, i))
  return {
    components: components.map((c) => ({ ...c, z: zByKey.get(`c:${c.id}`) ?? c.z ?? 0 })),
    wires: wires.map((w) => ({ ...w, z: zByKey.get(`w:${w.id}`) ?? w.z ?? 0 })),
  }
}

/** Move os componentes/cabos selecionados para frente/trás (uma camada ou até o topo/fundo). */
function reorderSelection(
  get: () => Store,
  set: (partial: Partial<Store> | ((s: Store) => Partial<Store>)) => void,
  mode: 'front' | 'back' | 'forward' | 'backward',
  componentIds?: string[],
) {
  const { components, wires, selectedComponentIds, selectedWireId } = get()
  const selKeys = componentIds
    ? new Set<string>(componentIds.map((id) => `c:${id}`))
    : new Set<string>([...selectedComponentIds.map((id) => `c:${id}`), ...(selectedWireId ? [`w:${selectedWireId}`] : [])])
  if (!selKeys.size) return
  const isSel = (k: DrawKey) => selKeys.has(`${k.kind}:${k.id}`)
  let order = currentDrawOrder(components, wires)

  if (mode === 'front') {
    const rest = order.filter((k) => !isSel(k))
    const sel = order.filter(isSel)
    order = [...rest, ...sel]
  } else if (mode === 'back') {
    const rest = order.filter((k) => !isSel(k))
    const sel = order.filter(isSel)
    order = [...sel, ...rest]
  } else if (mode === 'forward') {
    // varre de trás para frente movendo cada item selecionado uma posição à frente,
    // sem ultrapassar outro item selecionado (o bloco selecionado avança junto).
    for (let i = order.length - 2; i >= 0; i--) {
      if (isSel(order[i]) && !isSel(order[i + 1])) {
        ;[order[i], order[i + 1]] = [order[i + 1], order[i]]
      }
    }
  } else {
    for (let i = 1; i < order.length; i++) {
      if (isSel(order[i]) && !isSel(order[i - 1])) {
        ;[order[i - 1], order[i]] = [order[i], order[i - 1]]
      }
    }
  }

  get().commitHistory()
  const patch = applyDrawOrder(order, components, wires)
  set({ ...patch, dirty: true })

  // Trazer para a frente põe o componente EM CIMA do que está por baixo: os
  // corpos são sólidos, por isso em vez de o sobrepor, assenta-o no topo.
  if (mode === 'front' || mode === 'forward') {
    for (const id of [...selKeys].filter((key) => key.startsWith('c:')).map((key) => key.slice(2))) {
      const current = get().components.find((item) => item.id === id)
      if (!current || current.locked) continue
      const spot = stackOnTopPosition(current, get().components)
      if (!spot) continue
      get().updateComponentRaw(id, { schematicX: spot.x, schematicY: spot.y })
      get().pushEvent('info', `${current.ref} ficou assente por cima do componente que estava por baixo.`)
    }
  }
}

function snapshot(state: Store): Snapshot {
  const plcTags = { ...state.plcTags, ...(state.activePlcId ? { [state.activePlcId]: state.tags } : {}) }
  return JSON.parse(JSON.stringify({
    components: state.components, wires: state.wires, ladder: state.ladder.rungs,
    grafcet: state.grafcet, commands: state.commands,
    fcBlocks: state.fcBlocks, activePlcId: state.activePlcId,
    plcPrograms: programsForSave(state.plcPrograms, state.activePlcId, state.ladder.rungs, state.fcBlocks),
    tags: state.tags, plcTags,
    projectFiles: state.projectFiles, hiddenProjectFolders: state.hiddenProjectFolders,
    projectFolderLabels: state.projectFolderLabels, fcNames: state.fcNames,
    canvasTexts: state.canvasTexts,
    selectionGroups: state.selectionGroups,
  })) as Snapshot
}

const EMPTY_RUNTIME = (): RuntimeExtras => ({
  table: emptyTable(16, 16),
  timers: {},
  counters: {},
  rungPowered: {},
  db: {},
  edges: {},
  plcRuntime: {},
  energizedTerminals: new Set(),
  energizedWires: new Set(),
})

/** Há caminho condutor entre dois bornes (grafo da continuidade)? */
function pathBetween(adjacency: Map<string, Set<string>>, from: string, to: string): boolean {
  if (from === to) return true
  const seen = new Set([from]); const queue = [from]
  while (queue.length) {
    const id = queue.shift()!
    for (const next of adjacency.get(id) ?? []) {
      if (next === to) return true
      if (!seen.has(next)) { seen.add(next); queue.push(next) }
    }
  }
  return false
}

function runOneTick(state: Store, dtMs: number) {
  const { wires, ladder, sim } = state
  const components = state.components.map(electricalComponentView)
  // Atualizar acessórios DC que têm alimentação física, antes do grafo do scan.
  for (const c of components) if (c.type === 'siemensTsAdapterIeBasic') {
    c.state.powered = logoElectricalInputs(c, components, wires).powered
  }
  // Atualizar fontes AC→DC antes de calcular as fontes do grafo neste scan.
  for (const c of components) if (c.type === 'powerSupplyProauto24A') {
    c.state.powered = proautoInputPowered(c, components, wires)
    // RDY é o contacto normalmente aberto que confirma a saída DC pronta.
    // O motor é binário: não modela a banda de tensão nem atrasos reais.
    c.state.powerReady = c.state.powered
  }
  // Primeiro resolve a alimentação AC do ATV; só depois cria +24/10V/COM (P24 é entrada).
  // Esta passagem não avança temporizadores nem consome arestas de S.
  const industrial=components.filter(c=>industrialDeviceTypeOf(c))
  if(industrial.some(c=>industrialDeviceTypeOf(c)==='vfdSchneiderAtv320')){
    const supply=computeContinuity(components,wires,sourceTerminalIds(components,sim.faults,wires))
    const context:IndustrialElectricalContext={components,live:supply.energizedTerminals,adjacency:supply.reachable,phases:computePhaseLabels(components,wires)}
    for(const c of industrial)if(industrialDeviceTypeOf(c)==='vfdSchneiderAtv320'){
      const v=industrialInput(c,'R/L1','S/L2',context)
      c.state.powered=!v.dc&&v.voltage>=170&&v.voltage<=264
      if(!c.state.powered){c.state.running=false;c.state.frequencyHz=0}
    }
  }
  let srcs = sourceTerminalIds(components, sim.faults, wires)

  // 1) Primeira passagem — apenas chaves físicas (botões, disjuntores, sensores)
  let pass1 = computeContinuity(components, wires, srcs)
  // Fuga à terra ativa (> IΔn): dispara automaticamente os diferenciais (DR / ID) fechados e sob tensão,
  // seccionando fase e neutro na própria varredura (IEC 61008-1).
  if (sim.faults.earthLeak) {
    let rcdTripped = false
    for (const c of components) {
      if ((c.type === 'residualBreakerHagerCfc225p' || c.type === 'residualBreaker' || c.type === 'residualBreakerSchneiderIid4p' || c.type === 'residualBreakerSchneiderIdpnVigi') && c.state.closed && !c.state.tripped) {
        const isLive = c.terminals.some((term) => pass1.energizedTerminals.has(term.id))
        if (isLive) {
          c.state.closed = false
          c.state.tripped = true
          c.state.tripReason = 'earth'
          rcdTripped = true
        }
      }
    }
    if (rcdTripped) pass1 = computeContinuity(components, wires, srcs)
  }
  for (const c of components) updateImportedPower(c, pass1.energizedTerminals, pass1.reachable)

  // 2–4) Cada PLC lê os seus bornes, executa o seu OB1 e escreve as suas
  // saídas num espaço I/Q/M/T/C independente. O programa ativo é só a vista.
  const plcs = components.filter(isProgrammablePlc)
  const selectedId = plcs.some((p) => p.id === state.activePlcId) ? state.activePlcId : plcs[0]?.id
  if (!plcs.length) {
    // Sem PLC no esquema: as entradas vêm do painel de entradas virtuais.
    // Botões NC ainda não tocados repousam a 1 (contacto fechado).
    for (const [address, mode] of Object.entries(state.virtualInputModes)) if (mode === 'nc' && !(address in state.virtualInputs)) state.runtime.table[address] = true
    for (const [address, on] of Object.entries(state.virtualInputs)) state.runtime.table[address] = on
    const generalFiles = state.projectFiles._general ?? []
    // Como no TIA Portal: os OBs de arranque correm UMA vez antes do primeiro scan do Main;
    // os cíclicos (ex.: OB123) correm em todos os scans, depois do OB1.
    const scheduled = state.runtime.startupDone ? [] : autoExecRungs(generalFiles, 'obStartup')
    const functions: Record<string, LadderRung[]> = {
      fc1: state.fcBlocks.fc1, fc2: state.fcBlocks.fc2, ...callableBlocks(generalFiles),
    }
    const declared = parseDataBlocks(generalFiles).values
    const db = { ...declared, ...state.runtime.db } // a memória persiste durante todo o RUN (como no TIA): palavras escritas em execução sobrevivem entre scans
    const trace: RungTraceEntry[] = []
    const scan = runScan({ rungs: [...scheduled, ...ladder.rungs, ...autoExecRungs(generalFiles, 'obCyclic')] }, state.runtime.table, state.runtime.timers, state.runtime.counters, dtMs, functions, [], db, state.runtime.edges, state.forces, { trace })
    state.runtime.db = db
    state.runtime.startupDone = true
    state.runtime.rungPowered = scan.rungPowered
    state.runtime.rungTrace = trace
    state.runtime.rungSkipped = Object.fromEntries(scan.skipped.map((id) => [id, true]))
  }
  const plcTargets = state.simPlcScope === 'active' && selectedId
    ? plcs.filter((plc) => plc.id === selectedId)
    : plcs
  for (const plc of plcTargets) {
    const prior = state.runtime.plcRuntime[plc.id] ?? { table: emptyTable(plcIoCapacity(plc).inputs, plcIoCapacity(plc).outputs), timers: {}, counters: {}, rungPowered: {}, db: {}, edges: {} }
    const table = prior.table
    // LOGO! e Siemens S7 declaram L+/M: a alimentação DC decide se o módulo
    // está powered e se os contactos de relé / saídas podem fechar no grafo.
    // Sem isto o LOGO! ficava com state.powered=false (valor de fábrica) e as
    // pontes Qx↔Qx·2 nunca fechavam — a simulação do nativo «Partida direta»
    // deixava de energizar KM1, H1/H2 e o motor. A CPU 315-2 DP não tem E/S a
    // bordo: o programa corre e a alimentação acende o DC5V, mas não há bits
    // de entrada para ler dos cabos.
    const needsDcSupply = plc.type === 'plcSiemensLogo1224RC' || SIEMENS_S7_TYPES.includes(plc.type)
    const logo = needsDcSupply ? logoElectricalInputs(plc, components, wires) : null
    const runtimeOnly = plc.type === 'plcSiemensS7300Cpu315'
    const powered = logo?.powered ?? true
    if (logo) plc.state.powered = powered
    if (!runtimeOnly) for (const t of plc.terminals) {
      if (/^I\d+\.\d+$/.test(t.label)) table[t.label] = logo
        ? powered && logo.positive.has(t.id)
        : pass1.energizedTerminals.has(t.id)
    }
    // Simulador de sinais: INT/NO somam-se ao que chega pelos cabos (botão virtual
    // em paralelo). NC é um contacto fechado em série: com cabo no borne deixa
    // passar o sinal do cabo e, premido, corta-o (ex.: EMERG/STOP NF ligados);
    // sem cabo é a própria fonte, a 1 em repouso.
    const simInputs = plc.state.simInputs as Record<string, boolean> | undefined
    const simModes = plc.state.simInputModes as Record<string, VirtualInputMode> | undefined
    if (simInputs || simModes) for (const t of plc.terminals) {
      if (!/^I\d+\.\d+$/.test(t.label)) continue
      if (simModes?.[t.label] === 'nc') {
        const closed = simInputs?.[t.label] ?? true
        const wired = wires.some((w) => w.fromTerminalId === t.id || w.toTerminalId === t.id)
        table[t.label] = wired ? table[t.label] && closed : closed
      } else if (simInputs?.[t.label]) table[t.label] = true
    }
    const program = plc.id === state.activePlcId ? ladder.rungs
      : state.plcPrograms[plc.id]?.rungs ?? (state.activePlcId === null && plc.id === plcs[0].id ? ladder.rungs : [])
    const fc = plc.id === state.activePlcId ? state.fcBlocks : state.plcPrograms[plc.id]
    const files = state.projectFiles[plc.id] ?? []
    const functions: Record<string, LadderRung[]> = { fc1: fc?.fc1 ?? [], fc2: fc?.fc2 ?? [], ...callableBlocks(files) }
    // Como no TIA Portal: os OBs de arranque correm UMA vez antes do primeiro scan do Main;
    // os cíclicos (ex.: OB123) correm em todos os scans, depois do OB1.
    const scheduled = prior.startupDone ? [] : autoExecRungs(files, 'obStartup')
    const declared = parseDataBlocks(files).values
    prior.db = { ...declared, ...prior.db } // idem: o valor de execução prevalece sobre o inicial do DB
    const trace: RungTraceEntry[] | undefined = plc.id === selectedId ? [] : undefined
    const scan = runScan({ rungs: [...scheduled, ...program, ...autoExecRungs(files, 'obCyclic')] }, table, prior.timers, prior.counters, dtMs, functions, [], prior.db, prior.edges, plc.id === selectedId ? state.forces : {}, { trace })
    state.runtime.plcRuntime[plc.id] = { ...prior, startupDone: true, rungPowered: scan.rungPowered }
    if (trace) {
      state.runtime.rungTrace = trace
      state.runtime.rungSkipped = Object.fromEntries(scan.skipped.map((id) => [id, true]))
    }
    const cpuRunning = powered && plc.state.cpuMode !== 'STOP'
    if ('ledRUN' in plc.state) plc.state.ledRUN = cpuRunning
    if ('ledSTOP' in plc.state) plc.state.ledSTOP = powered && !cpuRunning
    if ('ledDC5V' in plc.state) plc.state.ledDC5V = powered
    if ('displayOn' in plc.state) plc.state.displayOn = powered
    if ('mode' in plc.state) plc.state.mode = cpuRunning ? 'RUN' : 'STOP'
    for (const key of Object.keys(plc.state.outputs)) plc.state.outputs[key] = cpuRunning && !!scan.table[key]
  }
  if (selectedId) {
    const active = state.runtime.plcRuntime[selectedId]
    state.runtime.table = active.table
    state.runtime.timers = active.timers
    state.runtime.counters = active.counters
    state.runtime.rungPowered = active.rungPowered
    state.runtime.db = active.db
  }
  // GRAFCET global mantém o comportamento anterior sobre a vista ativa.
  state.grafcetRuntime = scanGrafcet(state.grafcet, state.grafcetRuntime, state.runtime.table, dtMs)

  // 5) Segunda passagem — agora com as saídas do CLP ativas
  const pass2 = computeContinuity(components, wires, srcs)
  for (const c of components) updateImportedPower(c, pass2.energizedTerminals, pass2.reachable)

  // 6) Coils (contator / relé / temporizador / soft-starter)
  for (const c of components) {
    if (importedComponentInfo(c.type)?.behavior === 'contactor' || c.type === 'contactor' || c.type === 'contactorWegCWC09' || c.type === 'contactor4p' || c.type === 'auxRelay' || c.type === 'auxRelay4' || c.type === 'timerRelayTON' || c.type === 'timerRelayTOF' || c.type === 'counterRelay' || c.type === 'softStarter') {
      const wants = isCoilPowered(c, pass2.energizedTerminals)
      let finalEnergized = wants
      if (wants && c.state.interlockWith) {
        const partner = components.find((p) => p.id === c.state.interlockWith)
        if (partner?.state.energized) finalEnergized = false
      }
      if (sim.faults.overload && c.type.startsWith('contactor')) {
        // sobrecarga mecânica não desenergiza sozinha, mas registra esforço
      }
      // Atracagem manual (botão de teste do contactor) mantém polos fechados sem bobina.
      c.state.energized = finalEnergized || !!c.state.manualLatch || !!c.state.testPressed
    }
  }

  // Aparelhos documentados: os contactos seguem o contrato de cada referência.
  if(industrial.length){
    const context:IndustrialElectricalContext={components,live:pass2.energizedTerminals,adjacency:pass2.reachable,phases:computePhaseLabels(components,wires)}
    for(const c of industrial)updateIndustrialDevice(c,context,dtMs)
    srcs=sourceTerminalIds(components,sim.faults,wires)
  }

  const safetyRelays = components.filter(c => c.type === 'safetyRelay')
  if (safetyRelays.length) {
    const context: IndustrialElectricalContext = { components, live: pass2.energizedTerminals, adjacency: pass2.reachable, phases: computePhaseLabels(components, wires) }
    for (const c of safetyRelays) updateMsr127(c, context, dtMs)
    srcs = sourceTerminalIds(components, sim.faults, wires)
  }

  // Temporizador estrela-triângulo dedicado (relé KT)
  for (const c of components) {
    if (c.type === 'timerRelayStarDelta') {
      const wants = isCoilPowered(c, pass2.energizedTerminals)
      c.state.energized = wants
      if (wants) {
        c.state.elapsedMs = Math.min(c.state.presetMs, (c.state.elapsedMs ?? 0) + dtMs)
        c.state.starDone = c.state.elapsedMs >= c.state.presetMs
        c.state.deltaDone = c.state.starDone && c.state.elapsedMs >= c.state.presetMs + (c.state.transitionMs ?? 50)
      } else {
        c.state.elapsedMs = 0
        c.state.starDone = false
        c.state.deltaDone = false
      }
    }
  }

  // 7) Terceira passagem — reflete polos que acabaram de fechar
  const pass3 = computeContinuity(components, wires, srcs)
  state.runtime.energizedTerminals = pass3.energizedTerminals
  state.runtime.energizedWires = pass3.energizedWires

  for (const c of components) for (const t of c.terminals) t.energized = pass3.energizedTerminals.has(t.id)
  for (const w of wires) {
    w.energized = pass3.energizedWires.has(w.id)
    w.carryingCurrent = pass3.activeWires?.has(w.id) ?? w.energized
  }

  // 8) Sinaleiros / buzzer / torre
  const indicationPhases = computePhaseLabels(components, wires)
  for (const c of components) {
    if (c.type === 'ledGreen' || c.type === 'ledRed' || c.type === 'ledYellow' || c.type === 'ledWhite' || c.type === 'pilotLightAd22' || c.type === 'pilotLightSchneiderIil1p' || c.type === 'buzzer') {
      c.state.on = isLoadPowered(c, pass3.energizedTerminals)
    }
    if (c.type === 'lampIncandescentE27' || c.type === 'lampFluorescentE27' || c.type === 'lampLedE27' || c.type === 'triProofLedBatten') {
      const ctx: IndustrialElectricalContext = { components, live: pass3.energizedTerminals, adjacency: pass3.reachable, phases: indicationPhases }
      const input = industrialInput(c, 'L', 'N', ctx)
      c.state.on = Boolean((!input.dc && input.voltage >= 110 && input.voltage <= 260) || (c.type === 'triProofLedBatten' && c.state.testOn))
    }
    if (c.type === 'pilotLightSchneiderIil1p' || c.type === 'pilotLightSchneiderIil3p') {
      const ctx: IndustrialElectricalContext = { components, live: pass3.energizedTerminals, adjacency: pass3.reachable, phases: indicationPhases }
      if (c.type === 'pilotLightSchneiderIil1p') {
        const input = industrialInput(c, 'X1', 'X2', ctx)
        c.state.on = !input.dc && input.voltage >= 110 && input.voltage <= 253
      } else {
        for (let phase=1; phase<=3; phase++) {
          const input = industrialInput(c, 'L'+phase, 'N', ctx)
          c.state['l'+phase+'On'] = !input.dc && input.voltage >= 195.5 && input.voltage <= 440
        }
        c.state.on = Boolean(c.state.l1On || c.state.l2On || c.state.l3On)
        c.state.phaseLoss = Boolean(c.state.on && !(c.state.l1On && c.state.l2On && c.state.l3On))
      }
    }
    if (c.type === 'towerLight') {
      c.state.red = pass3.energizedTerminals.has(terminalByLabel(c, 'R')?.id ?? '')
      c.state.yellow = pass3.energizedTerminals.has(terminalByLabel(c, 'Y')?.id ?? '')
      c.state.green = pass3.energizedTerminals.has(terminalByLabel(c, 'G')?.id ?? '')
      c.state.on = c.state.red || c.state.yellow || c.state.green
    }
    updateImportedLoads(c, pass3.energizedTerminals)
    if (c.type === 'hmi') c.state.on = isLoadPowered(c, pass3.energizedTerminals, 'L', 'N')
    if (c.type === 'analogAmmeter') {
      const live = isLoadPowered(c, pass3.energizedTerminals, '1', '2')
      c.state.reading = live ? Number((c.state.scaleInA * 0.6).toFixed(1)) : 0
    }
  }

  // 9) Motores — sentido real pela sequência de fases
  const thermalTripped = components.some((c) => c.type === 'thermalRelay' && c.state.tripped)
  const phaseLabels = indicationPhases
  for (const c of components) {
    if (c.type === 'motor3ph') {
      const dir = motorDirectionFromPhases(c, phaseLabels, pass3.energizedTerminals)
      const u1 = terminalByLabel(c, 'U1')
      const v1 = terminalByLabel(c, 'V1')
      const w1 = terminalByLabel(c, 'W1')
      // Caixa sem pontes (arranque estrela-triângulo): os enrolamentos fecham por fora — estrela quando
      // W2/U2/V2 estão ligados entre si (ex.: KM3), triângulo quando os três estão sob tensão (ex.: KM2).
      const boxBridged = c.state.motorConnection == null || c.state.motorConnection === 'star' || c.state.motorConnection === 'delta'
      const ends = ['W2', 'U2', 'V2'].map((label) => terminalByLabel(c, label)?.id)
      const externalStar = ends.every(Boolean) && pathBetween(pass3.reachable, ends[0]!, ends[1]!) && pathBetween(pass3.reachable, ends[1]!, ends[2]!)
      const externalDelta = ends.every((id) => !!id && pass3.energizedTerminals.has(id))
      const bridged = boxBridged || (c.state.motorConnection === 'none' && (externalStar || externalDelta))
      const live = !!(bridged && u1 && v1 && w1 && pass3.energizedTerminals.has(u1.id) && pass3.energizedTerminals.has(v1.id) && pass3.energizedTerminals.has(w1.id))
      const drive=industrial.find(d=>industrialDeviceTypeOf(d)==='vfdSchneiderAtv320'&&d.state.running&&u1&&['U/T1','V/T2','W/T3'].some(label=>{
        const output=terminalByLabel(d,label)?.id
        return !!output&&pathBetween(pass3.reachable,output,u1.id)
      }))
      const targetSpeed=drive?Math.min(1,Number(drive.state.frequencyHz)/50):1
      c.state.tripped = thermalTripped
      c.state.running = live && !thermalTripped && !sim.faults.phaseLoss
      if (c.state.running) {
        const wantedDir = dir === 'unknown' ? 'cw' : dir
        // Inversão exige desacelerar até quase parar antes de trocar de sentido
        if (c.state.direction !== 'stopped' && c.state.direction !== wantedDir && (c.state.rpmVisual ?? 0) > 0.08) {
          // Desaceleração rápida para inversão
          c.state.rpmVisual = Math.max(0, c.state.rpmVisual - dtMs / 600)
          // mantém direção antiga até parar
        } else {
          c.state.direction = wantedDir
          // Arranque com inércia exponencial + leve sobre-impulso de binário
          const prev = c.state.rpmVisual ?? 0
          const tau = prev < 0.15 ? 320 : prev < 0.6 ? 420 : 650 // ms - arranque mais rápido, depois mais suave
          c.state.rpmVisual = prev + (targetSpeed - prev) * Math.min(1,dtMs / tau)
          if (c.state.rpmVisual > 0.98) c.state.rpmVisual = 0.98 + (c.state.rpmVisual - 0.98) * 0.4 // saturação suave
          c.state.rpmVisual = Math.min(1, c.state.rpmVisual)
        }
      } else {
        // Desaceleração com inércia (coasting) - mais longa que o arranque
        const prev = c.state.rpmVisual ?? 0
        if (prev > 0.02) {
          const tau = 750 // ms - inércia ao desligar
          c.state.rpmVisual = Math.max(0, prev + (0 - prev) * (dtMs / tau))
          // mantém último sentido até parar quase totalmente
          if (c.state.rpmVisual < 0.03) c.state.direction = 'stopped'
        } else {
          c.state.rpmVisual = 0
          c.state.direction = 'stopped'
        }
      }
    }
    if (c.type === 'motor1ph') {
      const live = isLoadPowered(c, pass3.energizedTerminals, 'U1', 'U2')
      c.state.running = live && !sim.faults.phaseLoss
      if (c.state.running) {
        const prev = c.state.rpmVisual ?? 0
        const tau = prev < 0.15 ? 340 : 500
        c.state.rpmVisual = Math.min(1, prev + (1 - prev) * (dtMs / tau))
        c.state.direction = 'cw'
      } else {
        const prev = c.state.rpmVisual ?? 0
        if (prev > 0.02) {
          c.state.rpmVisual = Math.max(0, prev + (0 - prev) * (dtMs / 750))
          if (c.state.rpmVisual < 0.03) c.state.direction = 'stopped'
        } else {
          c.state.rpmVisual = 0
          c.state.direction = 'stopped'
        }
      }
    }
    if (c.type === 'waterPump') {
      const live = isLoadPowered(c, pass3.energizedTerminals, 'L1', 'N')
      c.state.running = live && !sim.faults.phaseLoss
      if (c.state.running) {
        const prev = c.state.rpmVisual ?? 0
        c.state.rpmVisual = Math.min(2.2, prev + (2.2 - prev) * (dtMs / 280))
        c.state.direction = 'cw'
      } else {
        const prev = c.state.rpmVisual ?? 0
        if (prev > 0.03) {
          c.state.rpmVisual = Math.max(0, prev + (0 - prev) * (dtMs / 480))
          if (c.state.rpmVisual < 0.04) c.state.direction = 'stopped'
        } else {
          c.state.rpmVisual = 0
          c.state.direction = 'stopped'
        }
      }
    }
    if (c.type === 'rollerConveyor') {
      const motorized = c.state.motorized !== false
      const u1 = c.terminals.find((t) => t.label === 'U1')
      const v1 = c.terminals.find((t) => t.label === 'V1')
      const w1 = c.terminals.find((t) => t.label === 'W1')
      const live3 = motorized && !!u1 && !!v1 && !!w1 &&
        pass3.energizedTerminals.has(u1.id) &&
        pass3.energizedTerminals.has(v1.id) &&
        pass3.energizedTerminals.has(w1.id)
      const phaseDir = live3 ? motorDirectionFromPhases(c, phaseLabels, pass3.energizedTerminals) : 'stopped'
      const resolvedDir = phaseDir === 'unknown' ? 'cw' : phaseDir
      const runNow = live3 && resolvedDir !== 'stopped' && !sim.faults.phaseLoss
      c.state.running = runNow
      if (runNow) {
        const prev = Number(c.state.rpmVisual ?? 0)
        c.state.rpmVisual = Math.min(1.6, prev + (1.6 - prev) * (dtMs / 320))
        c.state.direction = resolvedDir
      } else {
        const prev = Number(c.state.rpmVisual ?? 0)
        if (prev > 0.03) {
          c.state.rpmVisual = Math.max(0, prev + (0 - prev) * (dtMs / 520))
          if (c.state.rpmVisual < 0.04) c.state.direction = 'stopped'
        } else {
          c.state.rpmVisual = 0
          c.state.direction = 'stopped'
        }
      }
      // Deslocamento físico da caixa de teste sobre os rolos + disparo automático dos sensores da linha
      if (c.state.testBoxActive !== false) {
        let pos = Number(c.state.testBoxPosPct ?? 24)
        if (!Number.isFinite(pos)) pos = 24
        if (runNow) {
          const stepPct = (Math.max(0.016, dtMs / 1000) * 18) * (phaseDir === 'ccw' ? -1 : 1)
          pos += stepPct
          if (pos > 94) pos = 6
          if (pos < 6) pos = 94
          c.state.testBoxPosPct = Math.round(pos * 10) / 10
        }
        if (Array.isArray(c.state.lineSensors)) {
          c.state.lineSensors = c.state.lineSensors.map((s: any) => ({
            ...s,
            triggered: Math.abs(pos - Number(s?.positionPct ?? 50)) <= 9,
          }))
        }
      }
    }
  }

  // 9b) Simulação hidráulica em tempo real: bombas -> válvulas/tês -> tubos hidráulicos -> reservatórios -> bóias
  const hydraulicWires = wires.filter((w) => w.kind === 'hydraulic' && w.fromTerminalId && w.toTerminalId && !w.fromPoint && !w.toPoint)
  const hydraulicAdj = new Map<string, string[]>()
  const linkH = (a: string, b: string) => {
    if (!hydraulicAdj.has(a)) hydraulicAdj.set(a, [])
    if (!hydraulicAdj.has(b)) hydraulicAdj.set(b, [])
    hydraulicAdj.get(a)!.push(b)
    hydraulicAdj.get(b)!.push(a)
  }
  for (const hw of hydraulicWires) linkH(hw.fromTerminalId, hw.toTerminalId)
  // Passagem interna em válvulas hidráulicas abertas e uniões T hidráulicas
  for (const hc of components) {
    if (hc.type === 'hydraulicValve' && hc.state.open !== false) {
      const a = hc.terminals[0]?.id, b = hc.terminals[1]?.id
      if (a && b) linkH(a, b)
    } else if (hc.type === 'hydraulicTee') {
      const ids = hc.terminals.map((t) => t.id)
      for (let i = 0; i < ids.length; i += 1) {
        for (let j = i + 1; j < ids.length; j += 1) linkH(ids[i], ids[j])
      }
    } else if (hc.type === 'hydraulicFlowMeter') {
      const inT = hc.terminals.find((t) => t.label === 'IN' || t.kind === 'hydraulic-in')?.id
      const outT = hc.terminals.find((t) => t.label === 'OUT' || t.kind === 'hydraulic-out')?.id
      if (inT && outT) linkH(inT, outT)
    }
  }
  const activeHydraulicTerminals = new Set<string>()
  const pumpFlowQueue: string[] = []
  for (const p of components) {
    if (p.type === 'waterPump' && p.state.running) {
      const outT = p.terminals.find((t) => t.label === 'OUT' || t.kind === 'hydraulic-out')
      if (outT && !activeHydraulicTerminals.has(outT.id)) {
        activeHydraulicTerminals.add(outT.id)
        pumpFlowQueue.push(outT.id)
      }
    } else if (p.type === 'waterTank' && p.state.outletValveOpen && Number(p.state.levelPct ?? 0) > 0.2) {
      const outT = p.terminals.find((t) => t.label === 'OUT' || t.kind === 'hydraulic-out')
      if (outT && !activeHydraulicTerminals.has(outT.id)) {
        activeHydraulicTerminals.add(outT.id)
        pumpFlowQueue.push(outT.id)
      }
    } else if (p.type === 'waterSupplyBox' && p.state.mainsSupplyOn !== false && p.state.valveOpen !== false) {
      const outT = p.terminals.find((t) => t.label === 'OUT' || t.kind === 'hydraulic-out')
      if (outT && !activeHydraulicTerminals.has(outT.id)) {
        activeHydraulicTerminals.add(outT.id)
        pumpFlowQueue.push(outT.id)
      }
    }
  }
  while (pumpFlowQueue.length > 0) {
    const cur = pumpFlowQueue.shift()!
    for (const nb of hydraulicAdj.get(cur) ?? []) {
      if (!activeHydraulicTerminals.has(nb)) {
        activeHydraulicTerminals.add(nb)
        pumpFlowQueue.push(nb)
      }
    }
  }
  for (const hw of hydraulicWires) {
    hw.energized = activeHydraulicTerminals.has(hw.fromTerminalId) && activeHydraulicTerminals.has(hw.toTerminalId)
    if (hw.energized && pass3.activeWires) pass3.activeWires.add(hw.id)
  }
  const dtSec = Math.max(0.016, dtMs / 1000)
  const tanks = components.filter((c) => c.type === 'waterTank')
  for (const tk of tanks) {
    const inTerm = tk.terminals.find((t) => t.label === 'IN' || t.kind === 'hydraulic-in')
    const pumpFilling = !!(inTerm && activeHydraulicTerminals.has(inTerm.id))
    const filling = pumpFilling || !!tk.state.manualFill
    tk.state.filling = filling
    let lvl = Number(tk.state.levelPct ?? 68)
    if (!Number.isFinite(lvl)) lvl = 68
    if (filling) lvl += dtSec * 12
    if (tk.state.outletValveOpen) lvl -= dtSec * 10
    tk.state.levelPct = Math.max(0, Math.min(100, Math.round(lvl * 10) / 10))
  }
  // Contadores de água eletrónicos ZJLCD-BT01 e Caixa / Fonte de Água: cálculo de caudal instantâneo (L/min), volume parcial e totalizador (L)
  for (const fm of components) {
    if (fm.type !== 'hydraulicFlowMeter' && fm.type !== 'waterSupplyBox') continue
    const inT = fm.terminals.find((t) => t.label === 'IN' || t.kind === 'hydraulic-in')
    const outT = fm.terminals.find((t) => t.label === 'OUT' || t.kind === 'hydraulic-out')
    let hasFlow = false
    if (fm.type === 'waterSupplyBox') {
      const supplyActive = fm.state.mainsSupplyOn !== false && fm.state.valveOpen !== false
      const hasDownstreamPipe = Boolean(
        outT && hydraulicWires.some((hw) => hw.fromTerminalId === outT.id || hw.toTerminalId === outT.id),
      )
      hasFlow = Boolean(supplyActive && (hasDownstreamPipe || fm.state.manualTestFlow))
    } else {
      hasFlow = Boolean(
        (inT && activeHydraulicTerminals.has(inT.id)) ||
        (outT && activeHydraulicTerminals.has(outT.id)) ||
        fm.state.manualTestFlow,
      )
    }
    const dn = String(fm.state.pipeDN ?? 'DN32')
    const nominalLpm = dn === 'DN25' ? 38 : dn === 'DN40' ? 95 : dn === 'DN50' ? 150 : dn === 'DN65' ? 240 : dn === 'DN80' ? 360 : 60
    const flowLpm = hasFlow ? Math.round((nominalLpm * 0.65) * 10) / 10 : 0
    fm.state.flowRateLpm = flowLpm
    fm.state.flowing = hasFlow
    if (hasFlow) {
      const deltaL = (flowLpm / 60) * dtSec
      fm.state.singleVolumeL = Math.round((Number(fm.state.singleVolumeL ?? 0) + deltaL) * 1000) / 1000
      fm.state.totalVolumeL = Math.round((Number(fm.state.totalVolumeL ?? 0) + deltaL) * 1000) / 1000
      fm.state.pulseHigh = Math.floor(Number(fm.state.totalVolumeL ?? 0) * 10) % 2 === 0
    } else {
      fm.state.pulseHigh = false
    }
  }

  // 9c) Simulação pneumática em tempo real: FRL -> tubos pneumáticos -> Tês -> Eletroválvulas 5/2 -> Cilindros ISO
  const pneumaticWires = wires.filter((w) => w.kind === 'pneumatic' && w.fromTerminalId && w.toTerminalId && !w.fromPoint && !w.toPoint)
  const pneumaticAdj = new Map<string, string[]>()
  const linkP = (a: string, b: string) => {
    if (!pneumaticAdj.has(a)) pneumaticAdj.set(a, [])
    if (!pneumaticAdj.has(b)) pneumaticAdj.set(b, [])
    pneumaticAdj.get(a)!.push(b)
    pneumaticAdj.get(b)!.push(a)
  }
  for (const pw of pneumaticWires) linkP(pw.fromTerminalId, pw.toTerminalId)
  for (const pc of components) {
    if (pc.type === 'pneumaticTee') {
      const ids = pc.terminals.map((t) => t.id)
      for (let i = 0; i < ids.length; i += 1) {
        for (let j = i + 1; j < ids.length; j += 1) linkP(ids[i], ids[j])
      }
    } else if (pc.type === 'pneumaticValve52') {
      const coilOn = isLoadPowered(pc, pass3.energizedTerminals, 'A1', 'A2')
      const active = coilOn || Boolean(pc.state.manualOverride)
      pc.state.energized = active
      const pTerm = pc.terminals.find((t) => t.label === 'P')?.id
      const aTerm = pc.terminals.find((t) => t.label === 'A')?.id
      const bTerm = pc.terminals.find((t) => t.label === 'B')?.id
      if (pTerm && active && aTerm) linkP(pTerm, aTerm)
      if (pTerm && !active && bTerm) linkP(pTerm, bTerm)
    } else if (pc.type === 'pneumaticManifold') {
      const pTerm = pc.terminals.find((t) => t.label === 'P')?.id
      for (const stNum of [1, 2, 3, 4]) {
        const coilOn = isLoadPowered(pc, pass3.energizedTerminals, `Y${stNum}`, '0V')
        const active = coilOn || Boolean(pc.state[`station${stNum}Manual`])
        pc.state[`station${stNum}On`] = active
        const aTerm = pc.terminals.find((t) => t.label === `A${stNum}`)?.id
        const bTerm = pc.terminals.find((t) => t.label === `B${stNum}`)?.id
        if (pTerm && active && aTerm) linkP(pTerm, aTerm)
        if (pTerm && !active && bTerm) linkP(pTerm, bTerm)
      }
    }
  }
  const activePneumaticTerminals = new Set<string>()
  const airQueue: string[] = []
  for (const frl of components) {
    if (frl.type === 'pneumaticFrl' && frl.state.airSupplyOn !== false && Number(frl.state.pressureBar ?? 6) > 0.2) {
      const outT = frl.terminals.find((t) => t.label === 'OUT' || t.kind === 'pneumatic-out')
      if (outT && !activePneumaticTerminals.has(outT.id)) {
        activePneumaticTerminals.add(outT.id)
        airQueue.push(outT.id)
      }
    }
  }
  while (airQueue.length > 0) {
    const cur = airQueue.shift()!
    for (const nb of pneumaticAdj.get(cur) ?? []) {
      if (!activePneumaticTerminals.has(nb)) {
        activePneumaticTerminals.add(nb)
        airQueue.push(nb)
      }
    }
  }
  for (const pw of pneumaticWires) {
    pw.energized = activePneumaticTerminals.has(pw.fromTerminalId) && activePneumaticTerminals.has(pw.toTerminalId)
    if (pw.energized && pass3.activeWires) pass3.activeWires.add(pw.id)
  }
  for (const cyl of components) {
    if (cyl.type === 'pneumaticCylinder' || cyl.type === 'pneumaticGuidedCylinder') {
      const aId = cyl.terminals.find((t) => t.label === 'A')?.id
      const bId = cyl.terminals.find((t) => t.label === 'B')?.id
      const aAir = Boolean(aId && activePneumaticTerminals.has(aId))
      const bAir = Boolean(bId && activePneumaticTerminals.has(bId))
      let pct = Number(cyl.state.positionPct ?? 0)
      if (!Number.isFinite(pct)) pct = 0
      if (aAir && !bAir) pct = Math.min(100, pct + dtSec * 140)
      else if (bAir && !aAir) pct = Math.max(0, pct - dtSec * 140)
      cyl.state.positionPct = Math.round(pct)
      cyl.state.extended = cyl.state.positionPct >= 90
    } else if (cyl.type === 'electricCylinderEpcs') {
      const pwr = isLoadPowered(cyl, pass3.energizedTerminals, '+24V', '0V')
      cyl.state.powered = pwr
      const in1 = Boolean(cyl.terminals.find((t) => t.label === 'IN1')?.id && pass3.energizedTerminals.has(cyl.terminals.find((t) => t.label === 'IN1')!.id))
      const in2 = Boolean(cyl.terminals.find((t) => t.label === 'IN2')?.id && pass3.energizedTerminals.has(cyl.terminals.find((t) => t.label === 'IN2')!.id))
      let pct = Number(cyl.state.positionPct ?? 0)
      if (!Number.isFinite(pct)) pct = 0
      const spdOut = Math.max(20, Number(cyl.state.speedOutPct ?? 70)) * 1.4
      const spdIn = Math.max(20, Number(cyl.state.speedInPct ?? 70)) * 1.4
      if (pwr && in1 && !in2) pct = Math.min(100, pct + dtSec * spdOut)
      else if (pwr && in2 && !in1) pct = Math.max(0, pct - dtSec * spdIn)
      cyl.state.positionPct = Math.round(pct)
      cyl.state.extended = cyl.state.positionPct >= 92
    } else if (cyl.type === 'pneumaticVacuumCup') {
      const pId = cyl.terminals.find((t) => t.label === 'P')?.id
      const hasAir = Boolean(pId && activePneumaticTerminals.has(pId))
      cyl.state.vacuumActive = hasAir || Boolean(cyl.state.manualVacuum)
    }
  }
  // Acoplamento automático de bóias (floatSwitch) ao reservatório associado (suporta várias bóias a cotas distintas no mesmo tanque!)
  if (tanks.length > 0) {
    for (const fs of components) {
      if (fs.type !== 'floatSwitch' || fs.state.autoCoupleTank === false || fs.state.detachedFromTank === true) continue
      const targetTank =
        (fs.state.linkedTankId ? tanks.find((tk) => tk.id === fs.state.linkedTankId) : null) ??
        tanks[0]
      if (!targetTank) continue
      const lvl = Number(targetTank.state.levelPct ?? 68)
      const customDepth = typeof fs.state.mountDepthPct === 'number' ? fs.state.mountDepthPct : null
      const highThresh = customDepth !== null ? Math.min(96, customDepth + 4) : 82
      const lowThresh = customDepth !== null ? Math.max(4, customDepth - 6) : 25
      if (lvl >= highThresh && !fs.state.triggered) {
        fs.state.triggered = true
        fs.state.level = 'alto'
      } else if (lvl <= lowThresh && fs.state.triggered) {
        fs.state.triggered = false
        fs.state.level = 'baixo'
      }
    }
  }

  updatePanelMeters(components, wires, pass3, dtMs, true)

  // 10) Inversor — rampa de frequência
  for (const c of components) {
    if (c.type === 'vfd') {
      const powered = c.terminals.filter((t) => t.label.startsWith('L')).some((t) => pass3.energizedTerminals.has(t.id))
      const started = !!c.state.enabled && powered
      const step = (dtMs / Math.max(200, c.state.rampUpMs ?? 3000)) * (c.state.presetHz ?? 60)
      if (started) c.state.frequencyHz = Math.min(c.state.presetHz ?? 60, (c.state.frequencyHz ?? 0) + step)
      else c.state.frequencyHz = Math.max(0, (c.state.frequencyHz ?? 0) - step)
      c.state.running = started && c.state.frequencyHz > 0.5
    }
  }

  // 11) Curto-circuito, Sobreaquecimento e Proteções
  const shortDiag = evaluateShortCircuits(components, wires, pass3.energizedTerminals, sim.faults)
  state.sim.shortCircuit = {
    active: shortDiag.active,
    focalPoint: shortDiag.focalPoint,
    cause: shortDiag.cause,
    shortedWires: Array.from(shortDiag.wires),
  }

  if (shortDiag.active) {
    if (shortDiag.trippableBreakers.length > 0) {
      let trippedAny = false
      for (const b of shortDiag.trippableBreakers) {
        if (!b.locked && b.state.closed && !b.state.tripped) {
          b.state.closed = false
          b.state.tripped = true
          b.state.tripReason = 'shortCircuit'
          trippedAny = true
        }
      }
      if (trippedAny) {
        try { playShortCircuitBoom() } catch {}
        try { playClick('breaker') } catch {}
        state.sim.events = [
          {
            id: nanoid(6),
            ts: Date.now(),
            level: 'error' as const,
            message: `Disparo magnético de proteção por curto-circuito! (${shortDiag.cause})`,
          },
          ...state.sim.events,
        ].slice(0, 120)
      }
    } else {
      // Sem disjuntor de corte ou disjuntor bloqueado: aquecimento extremo e fumo
      let maxHeat = 0
      for (const w of wires) {
        if (shortDiag.wires.has(w.id) || (w.carryingCurrent && sim.faults.overload)) {
          const prevHeat = w.heatLevel ?? 0
          w.heatLevel = Math.min(1.0, prevHeat + dtMs / 1400)
          maxHeat = Math.max(maxHeat, w.heatLevel)
          if (w.heatLevel >= 0.72 && !w.burnt) {
            w.burnt = true
            w.damaged = true
            try { playWireBurnPop() } catch {}
          }
        }
      }
      for (const c of components) {
        if (shortDiag.components.has(c.id)) {
          const prevHeat = Number(c.state.heatLevel ?? 0)
          c.state.heatLevel = Math.min(1.0, prevHeat + dtMs / 1800)
          maxHeat = Math.max(maxHeat, c.state.heatLevel)
          if (c.state.heatLevel >= 0.7 && !c.state.burnt) {
            c.state.burnt = true
            c.state.damaged = true
            try { playWireBurnPop() } catch {}
          }
        }
      }
      if (maxHeat > 0.08) {
        try { startOverheatSizzle(maxHeat) } catch {}
      }
    }
  } else {
    // Arrefecimento gradual quando a corrente cessa
    let anyHot = false
    for (const w of wires) {
      if ((w.heatLevel ?? 0) > 0) {
        w.heatLevel = Math.max(0, (w.heatLevel ?? 0) - dtMs / 4000)
        if (w.heatLevel > 0.08) anyHot = true
      }
    }
    for (const c of components) {
      if ((c.state.heatLevel ?? 0) > 0) {
        c.state.heatLevel = Math.max(0, Number(c.state.heatLevel ?? 0) - dtMs / 4000)
        if (c.state.heatLevel > 0.08) anyHot = true
      }
    }
    if (!anyHot) {
      try { stopOverheatSizzle() } catch {}
    }
  }

  // 12) Diagnósticos + medições
  state.sim.diagnostics = detectDiagnostics(components, wires, pass3.energizedTerminals, sim.faults)
  state.sim.measurements = buildMeasurements(components, wires, pass3.energizedTerminals)
  state.sim.scanCount += 1
  // Feedback sonoro do motor (zumbido enquanto algum eixo corre).
  syncMotorHumFromComponents(components)
  syncIndustrialSounders(components)
}

/**
 * Sincroniza o agrupamento automático das réguas de bornes (mesmo `stripId` ou mesmo prefixo
 * hierárquico `X1.0…X1.n` na mesma folha/calha), respeitando bornes desagrupados pelo utilizador
 * (`state.stripUngrouped === true`). Quando `touchedIds` é fornecido, atualiza apenas as réguas
 * que incluam pelo menos um dos componentes tocados.
 */
function syncAutoTerminalStripGroups(
  components: ElectricalComponent[],
  selectionGroups: SelectionGroup[],
  touchedIds?: Iterable<string>,
): { components: ElectricalComponent[]; selectionGroups: SelectionGroup[]; changed: boolean } {
  const touched = touchedIds ? new Set(touchedIds) : null
  const strips = resolveTerminalStrips(components)
  if (!strips.length) return { components, selectionGroups, changed: false }
  let nextGroups = selectionGroups
  const assignStripId = new Map<string, string>()
  let changed = false
  for (const strip of strips) {
    if (strip.members.length < 2) continue
    if (touched && !strip.members.some((m) => touched.has(m.id))) continue
    const memberIds = strip.members.map((m) => m.id)
    const sid = strip.explicitStripId || nanoid(6)
    for (const m of strip.members) {
      if (m.state?.stripId !== sid) {
        assignStripId.set(m.id, sid)
        changed = true
      }
    }
    const alreadyExact = nextGroups.some(
      (g) => g.view === 'schematic' && g.members.length === memberIds.length && memberIds.every((id) => g.members.includes(id)),
    )
    if (!alreadyExact) {
      const merged = groupIds(nextGroups, 'schematic', memberIds, nanoid(8))
      if (merged) {
        nextGroups = merged
        changed = true
      }
    }
  }
  const nextComponents = assignStripId.size
    ? components.map((c) => {
        const sid = assignStripId.get(c.id)
        return sid ? { ...c, state: { ...c.state, stripId: sid } } : c
      })
    : components
  return { components: nextComponents, selectionGroups: nextGroups, changed }
}

/** Posiciona um novo borne encostado à direita de `anchor` na mesma folha e calha DIN, sem sobrepor outros aparelhos. */
function placeStripCloneRight(
  clone: ElectricalComponent,
  anchor: ElectricalComponent,
  cursorX: number,
  cursorRailMm: number | null,
  gapPx: number,
  obstacles: ElectricalComponent[],
  railMaxMm: number | null,
): { schematicX: number; railOffsetMm?: number; nextCursorX: number; nextCursorRailMm: number | null } {
  const sameSheet = (c: ElectricalComponent) => (c.sheet ?? '') === (anchor.sheet ?? '')
  let x = cursorX
  for (let guard = 0; guard < 96; guard++) {
    const hit = obstacles.find(
      (o) =>
        sameSheet(o) &&
        o.type !== 'panelEnclosure' &&
        !isDinRail(o) &&
        o.type !== 'cableDuct' &&
        o.type !== 'spiralWrap' &&
        o.schematicX < x + clone.w &&
        o.schematicX + o.w > x &&
        o.schematicY < anchor.schematicY + clone.h &&
        o.schematicY + o.h > anchor.schematicY,
    )
    if (!hit) break
    x = hit.schematicX + hit.w + gapPx
  }
  let railOffsetMm: number | undefined
  let nextRailMm: number | null = null
  if (anchor.railId && cursorRailMm !== null) {
    const wMm = terminalMemberWidthMm(clone)
    let mm = Math.max(0, Math.round(cursorRailMm * 100) / 100)
    if (railMaxMm !== null && mm + wMm > railMaxMm) {
      mm = Math.max(0, Math.round((railMaxMm - wMm) * 100) / 100)
    }
    railOffsetMm = mm
    nextRailMm = Math.round((mm + wMm) * 100) / 100
  }
  return {
    schematicX: x,
    railOffsetMm,
    nextCursorX: x + clone.w + gapPx,
    nextCursorRailMm: nextRailMm,
  }
}
export const WIRE_KIND_COLOR: Record<Wire['kind'], WireColor> = {
  power: 'black',
  control: 'red',
  signal: 'orange',
  neutral: 'lightblue',
  earth: 'green-yellow',
  bus: 'violet',
  hydraulic: 'lightblue',
  pneumatic: 'blue',
}

/** latch = interruptor · push = botão NO (1 enquanto premido) · nc = botão NC (1 em repouso, 0 enquanto premido) */
export type VirtualInputMode = 'latch' | 'push' | 'nc'

/** Desenergiza estado elétrico transitório ao carregar projeto ou entrar em STOP, preservando ajustes mecânicos (disjuntores, seletores, cores). */
function deenergizeComponents(components: ElectricalComponent[]): ElectricalComponent[] {
  return components.map((component) => {
    const nextState = { ...component.state }
    const runtimeType = builtinRuntimeType(component) ?? component.type
    for (const key of ['energized', 'running', 'done', 'powered', 'powerReady', 'startPressed', 'stopPressed', 'testPressed', 'stoReleased', '_wasPowered', '_wasTrigger', '_offTiming', '_pulseActive']) {
      if (key in nextState) nextState[key] = false
    }
    if (runtimeType === 'safetyRelay') Object.assign(nextState, { startupElapsedMs: 0, recoveryElapsedMs: 0, channel1On: false, channel2On: false, input1Closed: false, input2Closed: false })
    if (runtimeType === 'pilotLightSchneiderIil1p' || runtimeType === 'pilotLightSchneiderIil3p') Object.assign(nextState, { on: false, l1On: false, l2On: false, l3On: false, phaseLoss: false })
    if (runtimeType === 'meterD522066') Object.assign(nextState, { on: false, voltage: 0, current: 0, power: 0, frequency: 0 })
    if (runtimeType === 'meterKws306') Object.assign(nextState, { on: false, vA: 0, vB: 0, vC: 0, iA: 0, iB: 0, iC: 0, pA: 0, pB: 0, pC: 0, frequency: 0 })
    if (runtimeType === 'currentTransformerSplitCore') Object.assign(nextState, { primaryCurrentA: 0, secondaryCurrentA: 0 })
    // O disparo mecânico sobrevive a STOP/reabrir; só RESET (ou Reiniciar tudo) o limpa.
    if (
      component.type === 'ledGreen' ||
      component.type === 'ledRed' ||
      component.type === 'ledYellow' ||
      component.type === 'ledWhite' ||
      component.type === 'pilotLightAd22' ||
      component.type === 'lampIncandescentE27' ||
      component.type === 'lampFluorescentE27' ||
      component.type === 'lampLedE27' ||
      component.type === 'buzzer' ||
      component.type === 'hmi'
    ) {
      nextState.on = false
    }
    if (component.type === 'towerLight') {
      nextState.red = false
      nextState.yellow = false
      nextState.green = false
      nextState.on = false
    }
    if (!nextState.latched && 'pressed' in nextState) nextState.pressed = false
    if ('pressedButton' in nextState) nextState.pressedButton = null
    for (const key of ['elapsedMs', 'rpmVisual', 'reading', 'frequencyHz']) {
      if (key in nextState) nextState[key] = 0
    }
    if (industrialDeviceTypeOf(component)) {
      if ('on' in nextState) nextState.on = false
      nextState._delayedEdges = []
      if ('activeMs' in nextState) nextState.activeMs = 0
    }
    if ('direction' in nextState) nextState.direction = 'stopped'
    for (const key of ['inputs', 'outputs']) {
      const table = nextState[key]
      if (table && typeof table === 'object') nextState[key] = Object.fromEntries(Object.keys(table).map((address) => [address, false]))
    }
    return {
      ...component,
      state: nextState,
      terminals: component.terminals.map((terminal) => ({ ...terminal, energized: false })),
    }
  })
}


const normalizeWires = (wires: Wire[], components: ElectricalComponent[] = []) => {
  const byTerm = new Map<string, string>()
  const byTermDef = new Map<string, import('../types').Terminal>()
  for (const c of components) {
    for (const term of c.terminals ?? []) {
      byTerm.set(term.id, c.type)
      byTermDef.set(term.id, term)
    }
  }
  const autoSynced = wires.map((w) => {
    let fromEnd = w.fromEndType
    let toEnd = w.toEndType
    if (w.fromTerminalId && !w.fromPoint) {
      const term = byTermDef.get(w.fromTerminalId)
      const expected = defaultWireEndTypeForTerminal(term?.terminalType)
      if (expected && (!fromEnd || fromEnd === 'ferrule' || fromEnd === 'none')) {
        fromEnd = expected
      }
    }
    if (w.toTerminalId && !w.toPoint) {
      const term = byTermDef.get(w.toTerminalId)
      const expected = defaultWireEndTypeForTerminal(term?.terminalType)
      if (expected && (!toEnd || toEnd === 'ferrule' || toEnd === 'none')) {
        toEnd = expected
      }
    }
    if (fromEnd === w.fromEndType && toEnd === w.toEndType) return w
    return { ...w, fromEndType: fromEnd, toEndType: toEnd }
  })
  const afterFerrule = syncSharedTerminalFerrules(autoSynced.map(w => w.locked === undefined ? w : { ...w, locked: w.locked === true }))
  return syncLeadCableHeatShrink(afterFerrule, byTerm)
}

/** DC-ADR-071: em RUN ou PAUSA não há seleção nem edição de componentes, cabos ou textos; só os comandos atuam. */
export const isSimEditLocked = (state: { sim: { runState: string } }) => state.sim.runState === 'running' || state.sim.runState === 'paused'

/** Aplica medidas, rotação e cor de uma calha técnica nova (herdadas da vizinha). */
function applyDuctPlacement(comp: ElectricalComponent, p: DuctPlacement) {
  comp.w = p.w; comp.h = p.h; comp.rotation = p.rotation
  comp.schematicX = p.schematicX; comp.schematicY = p.schematicY
  comp.state = { ...comp.state, lengthMm: p.lengthMm, widthMm: p.widthMm, heightMm: p.heightMm, coverOn: p.coverOn }
  if (p.bodyColor) comp.bodyColor = p.bodyColor
}

/**
 * Conteúdo de um quadro durante um arrasto: tudo o que está inteiramente dentro do contorno no
 * início do arrasto (aparelhos, calhas, calhas técnicas). Fixado por sessão de arrasto para o quadro
 * não «apanhar» aparelhos por onde passa. Motores e aparelhos de máquina ficam de fora.
 */
let enclosureDragSession: { ids: string; members: string[]; at: number } | null = null
function enclosureContents(enclosure: ElectricalComponent, components: ElectricalComponent[]): string[] {
  const right = enclosure.schematicX + enclosure.w, bottom = enclosure.schematicY + enclosure.h
  return components.filter((c) => c.id !== enclosure.id && c.type !== 'panelEnclosure'
    && getComponentModelSpec(c.type)?.placement !== 'machine'
    && c.schematicX >= enclosure.schematicX && c.schematicY >= enclosure.schematicY
    && c.schematicX + c.w <= right && c.schematicY + c.h <= bottom).map((c) => c.id)
}
function enclosureDragMembers(enclosures: ElectricalComponent[], components: ElectricalComponent[]): string[] {
  const ids = enclosures.map((e) => e.id).sort().join('|')
  const now = Date.now()
  // Um arrasto envia movimentos seguidos; uma pausa > 600 ms começa uma sessão nova.
  if (!enclosureDragSession || enclosureDragSession.ids !== ids || now - enclosureDragSession.at > 600) {
    enclosureDragSession = { ids, members: enclosures.flatMap((e) => enclosureContents(e, components)), at: now }
  }
  enclosureDragSession.at = now
  return enclosureDragSession.members
}

/** Cabos cujas pontas pertencem todas ao grupo movido: os pontos de passagem (2D e 3D) acompanham. */
function shiftGroupWires(wires: Wire[], components: ElectricalComponent[], groupIds: Set<string>, dx: number, dy: number): Wire[] | null {
  const owner = new Map<string, string>()
  for (const c of components) for (const t of c.terminals) owner.set(t.id, c.id)
  const inGroup = (terminalId: string | undefined, point: unknown) => terminalId ? groupIds.has(owner.get(terminalId) ?? '') : !!point
  const ux = dx * PANEL_UNITS_PER_MM / SCHEMATIC_PX_PER_MM
  const uy = -dy * PANEL_UNITS_PER_MM / SCHEMATIC_PX_PER_MM
  let changed = false
  const next = wires.map((w) => {
    const fromIn = inGroup(w.fromTerminalId, w.fromPoint ?? w.fromPoint3D)
    const toIn = inGroup(w.toTerminalId, w.toPoint ?? w.toPoint3D)
    // Pelo menos uma ponta num borne do grupo e nenhuma num borne de fora.
    if (!fromIn || !toIn || (!w.fromTerminalId && !w.toTerminalId)) return w
    if (!w.waypoints?.length && !w.waypoints3D?.length && !w.fromPoint && !w.toPoint && !w.fromPoint3D && !w.toPoint3D) return w
    changed = true
    const p2 = <T extends { x: number; y: number }>(p: T): T => ({ ...p, x: p.x + dx, y: p.y + dy })
    const p3 = <T extends { x: number; y: number; z: number }>(p: T): T => ({ ...p, x: p.x + ux, y: p.y + uy })
    return {
      ...w,
      ...(w.waypoints ? { waypoints: w.waypoints.map(p2) } : {}),
      ...(w.waypoints3D ? { waypoints3D: w.waypoints3D.map(p3) } : {}),
      ...(w.fromPoint ? { fromPoint: p2(w.fromPoint) } : {}),
      ...(w.toPoint ? { toPoint: p2(w.toPoint) } : {}),
      ...(w.fromPoint3D ? { fromPoint3D: p3(w.fromPoint3D) } : {}),
      ...(w.toPoint3D ? { toPoint3D: p3(w.toPoint3D) } : {}),
    }
  })
  return changed ? next : null
}

export const useSimStore = create<Store>((set, get) => {
  /**
   * Reavalia um scan apenas quando a simulação já está em RUN ou PAUSA.
   * Nunca chama step() a partir de STOP puro: step() força stopped→paused e
   * isso fazia operações mecânicas (encaixe de relé, snap à calha, etc.)
   * «ativarem» a simulação. A única forma de sair de STOP é o botão Play.
   */
  const recomputeIfPaused = () => {
    const { runState } = get().sim
    if (runState === 'running' || runState === 'paused') get().step()
  }
  const recomputeIfActive = () => {
    const { runState } = get().sim
    if (runState === 'running' || runState === 'paused') get().step()
  }
  return ({
  components: [],
  wires: [],
  ladder: { rungs: [] },
  tags: [],
  sim: {
    runState: 'stopped',
    mode: 'realtime',
    scanCount: 0,
    speed: 1,
    stepMode: false,
    diagnostics: [],
    faults: { phaseLoss: false, shortCircuit: false, earthLeak: false, overvoltage: false, overload: false },
    events: [],
    measurements: [],
    blackBox: false,
  },
  simTick: 0,
  activeScenario: 'custom',
  selectedComponentIds: [],
  selectedDecal: null,
  _decalMove: null,
  selectedWireId: null,
  selectedWireIds: [] as string[],
  selectedTerminalId: null,
  multiSelectMode: false,
  setMultiSelectMode: (on) => set({ multiSelectMode: !!on }),
  toggleMultiSelectMode: () => set((s) => ({ multiSelectMode: !s.multiSelectMode })),
  tool: 'select',
  grid: { enabled: true, size: EDITOR_THEME.step, snap: true, style: 'dots', background: EDITOR_THEME.background },
  zoom: 1,
  panX: 0,
  panY: 0,
  dirty: false,
  canvasNotes: [],
  addCanvasNote: (note) => set((s) => ({ canvasNotes: [...s.canvasNotes, { ...note, id: nanoid(10), createdAt: new Date().toISOString() }], dirty: true })),
  updateCanvasNote: (id, patch) => set((s) => ({ canvasNotes: s.canvasNotes.map((note) => note.id === id ? { ...note, ...patch } : note), dirty: true })),
  removeCanvasNote: (id) => set((s) => ({ canvasNotes: s.canvasNotes.filter((note) => note.id !== id), dirty: true })),
  canvasTexts: [],
  addCanvasText: (text) => {
    const id = nanoid(10)
    get().commitHistory()
    set((s) => ({ canvasTexts: [...s.canvasTexts, { ...text, id, createdAt: new Date().toISOString() }], dirty: true }))
    return id
  },
  updateCanvasText: (id, patch) => set((s) => ({ canvasTexts: s.canvasTexts.map((item) => item.id === id ? { ...item, ...patch } : item), dirty: true })),
  removeCanvasText: (id, history = true) => {
    if (!get().canvasTexts.some((item) => item.id === id)) return
    if (history) get().commitHistory()
    set((s) => ({ canvasTexts: s.canvasTexts.filter((item) => item.id !== id), dirty: true }))
  },
  selectionGroups: [],
  groupItems: (view, ids) => {
    const targetSet = new Set(ids)
    const state = get()
    const terminalTargets = view === 'schematic'
      ? state.components.filter((c) => targetSet.has(c.id) && isTerminalStripType(c.type) && Number(c.state?.poleCount ?? 1) <= 1)
      : []
    const next = groupIds(state.selectionGroups, view, ids, nanoid(8))
    if (!next && terminalTargets.length < 2) return false
    get().commitHistory()
    if (terminalTargets.length >= 2 && terminalTargets.length === ids.length) {
      const existingSid = terminalTargets.map((c) => (typeof c.state?.stripId === 'string' ? c.state.stripId : '')).find(Boolean)
      const sid = existingSid || nanoid(6)
      set({
        components: state.components.map((c) => {
          if (!targetSet.has(c.id)) return c
          const nextState: Record<string, any> = { ...c.state, stripId: sid }
          delete nextState.stripUngrouped
          return { ...c, state: nextState }
        }),
        selectionGroups: next ?? state.selectionGroups,
        dirty: true,
      })
      return true
    }
    set({ selectionGroups: next ?? state.selectionGroups, dirty: true })
    return true
  },
  ungroupItems: (view, ids) => {
    const state = get()
    const targetSet = new Set(ids)
    const terminalTargets = view === 'schematic'
      ? state.components.filter((c) => targetSet.has(c.id) && isTerminalStripType(c.type))
      : []
    const next = ungroupIds(state.selectionGroups, view, ids)
    if (!next && !terminalTargets.some((c) => c.state?.stripId && !c.state?.stripUngrouped)) return false
    get().commitHistory()
    const nextComponents = terminalTargets.length
      ? state.components.map((c) => {
          if (!targetSet.has(c.id) || !isTerminalStripType(c.type)) return c
          const nextState: Record<string, any> = { ...c.state, stripUngrouped: true }
          delete nextState.stripId
          return { ...c, state: nextState }
        })
      : state.components
    set({
      components: nextComponents,
      selectionGroups: next ?? state.selectionGroups,
      dirty: true,
    })
    return true
  },
  runtime: EMPTY_RUNTIME(),
  showEmptyWelcome: true,
  dismissEmptyWelcome: () => set({ showEmptyWelcome: false }),
  fcBlocks: { fc1: [], fc2: [] },
  fcAdded: { fc1: false, fc2: false },
  activePlcId: null,
  simPlcScope: 'all',
  setSimPlcScope: (scope) => set({ simPlcScope: scope }),
  plcPrograms: {},
  plcTags: {},
  projectFiles: {},
  hiddenProjectFolders: {},
  projectFolderLabels: {},
  fcNames: {},
  addProjectFile: (folder, name) => {
    const plcId = get().activePlcId ?? '_general'
    const trimmed = name.trim()
    if (!trimmed) return null
    get().commitHistory()
    const id = nanoid(10)
    const now = new Date().toISOString()
    const file: ProjectFile = { id, folder, name: trimmed, createdAt: now, updatedAt: now,
      content: folder === 'backups' ? get().saveJSON() : defaultProjectFileContent(folder, trimmed), ...(folder === 'programBlocks' ? { rungs: [] } : {}) }
    set((s) => ({ projectFiles: { ...s.projectFiles, [plcId]: [...(s.projectFiles[plcId] ?? []), file] }, dirty: true }))
    return id
  },
  updateProjectFile: (id, patch) => {
    const plcId = get().activePlcId ?? '_general'
    if (shouldCommitGroupedEdit(`project-file:${plcId}:${id}`)) get().commitHistory()
    const updatedAt = new Date().toISOString()
    set((s) => ({ projectFiles: { ...s.projectFiles, [plcId]: (s.projectFiles[plcId] ?? []).map((f) => f.id === id ? { ...f, ...patch, updatedAt, name: patch.name !== undefined ? patch.name.trimStart() : f.name } : f) }, dirty: true }))
  },
  deleteProjectFile: (id) => {
    const plcId = get().activePlcId ?? '_general'
    if (!(get().projectFiles[plcId] ?? []).some((file) => file.id === id)) return
    get().commitHistory()
    set((s) => ({ projectFiles: { ...s.projectFiles, [plcId]: (s.projectFiles[plcId] ?? []).filter((f) => f.id !== id) }, dirty: true }))
  },
  deleteProjectFolder: (folder) => {
    // Blocos de programa e variáveis são a estrutura mínima do PLC e não podem ser removidos.
    if (folder === 'programBlocks' || folder === 'plcVariables') return
    const plcId = get().activePlcId ?? '_general'
    if ((get().hiddenProjectFolders[plcId] ?? []).includes(folder)) return
    get().commitHistory()
    set((s) => ({
      projectFiles: { ...s.projectFiles, [plcId]: (s.projectFiles[plcId] ?? []).filter((file) => file.folder !== folder) },
      hiddenProjectFolders: { ...s.hiddenProjectFolders, [plcId]: [...new Set([...(s.hiddenProjectFolders[plcId] ?? []), folder])] },
      dirty: true,
    }))
  },
  restoreProjectFolder: (folder) => {
    const plcId = get().activePlcId ?? '_general'
    if (!(get().hiddenProjectFolders[plcId] ?? []).includes(folder)) return
    get().commitHistory()
    set((s) => ({
      hiddenProjectFolders: { ...s.hiddenProjectFolders, [plcId]: (s.hiddenProjectFolders[plcId] ?? []).filter((item) => item !== folder) },
      dirty: true,
    }))
  },
  renameProjectFolder: (folder, name) => {
    const plcId = get().activePlcId ?? '_general'
    const clean = (name ?? '').trim()
    if ((get().projectFolderLabels[plcId]?.[folder] ?? '') === clean) return
    get().commitHistory()
    set((s) => ({ projectFolderLabels: { ...s.projectFolderLabels, [plcId]: { ...(s.projectFolderLabels[plcId] ?? {}), [folder]: clean } }, dirty: true }))
  },
  renameFc: (id, name) => {
    const clean = (name ?? '').trim()
    if ((get().fcNames[id] ?? '') === clean) return
    get().commitHistory()
    set((s) => ({ fcNames: { ...s.fcNames, [id]: clean }, dirty: true }))
  },
  restoreProjectBackup: (id) => {
    const plcId = get().activePlcId ?? '_general'
    const file = get().projectFiles[plcId]?.find((f) => f.id === id && f.folder === 'backups')
    if (!file) return false
    get().loadJSON(file.content)
    return true
  },
  setActivePlc: (id) => {
    const state = get()
    if (!state.components.some((c) => c.id === id && isProgrammablePlc(c)) || state.activePlcId === id) return
    const programs = programsForSave(state.plcPrograms, state.activePlcId, state.ladder.rungs, state.fcBlocks, state.fcAdded)
    const priorIsCurrent = state.activePlcId === null && Object.keys(programs).length === 0
    const prior = programs[id] ?? (priorIsCurrent
      ? { rungs: state.ladder.rungs, fc1: state.fcBlocks.fc1, fc2: state.fcBlocks.fc2 } : blankPlcProgram())
    const priorFcAdded = priorIsCurrent ? state.fcAdded : fcPresentOf(prior.fcAdded, prior, state.fcNames)
    const nextRuntime = state.runtime.plcRuntime[id]
    const plcTags = { ...state.plcTags, ...(state.activePlcId ? { [state.activePlcId]: state.tags } : {}) }
    set({ activePlcId: id, plcPrograms: programs, plcTags, tags: plcTags[id] ?? (state.activePlcId === null && Object.keys(plcTags).length === 0 ? state.tags : []), ladder: { rungs: prior.rungs }, fcBlocks: { fc1: prior.fc1, fc2: prior.fc2 }, fcAdded: priorFcAdded,
      runtime: { ...state.runtime, table: nextRuntime?.table ?? emptyTable(16, 16), timers: nextRuntime?.timers ?? {}, counters: nextRuntime?.counters ?? {}, rungPowered: nextRuntime?.rungPowered ?? {}, db: nextRuntime?.db ?? {} },
      history: [], future: [], dirty: true })
    recomputeIfActive()
  },
  grafcet: emptyGrafcet(),
  grafcetRuntime: emptyGrafcetRuntime(),
  commands: emptyCommands(),
  setCommands: (diagram, historyMode = 'force', historyKey = 'commands') => {
    if (get().demoMode) return
    if (historyMode === 'force' || (historyMode === 'auto' && shouldCommitGroupedEdit(historyKey))) get().commitHistory()
    if (historyMode === 'force') resetGroupedEdit()
    set({ commands: normalizeCommandsPages(diagram), dirty: true })
  },
  generateIecFromPhysical: () => {
    const s = get()
    if (s.demoMode || isSimEditLocked(s)) return
    const diagram = generateIecDiagramFromPhysical(s.components, s.wires)
    s.commitHistory()
    s.setCommands(diagram)
    s.pushEvent('info', `Esquema IEC gerado com ${diagram.parts.length} símbolo(s) e ${diagram.wires.length} ligação(ões) a partir do painel 3D real.`)
  },
  setGrafcet: (program, historyMode = 'force', historyKey = 'grafcet') => {
    // Demonstração da landing: o GRAFCET é só de visualização/simulação —
    // navegar entre páginas é inofensivo, editar etapas/transições não.
    if (get().demoMode && !historyKey.startsWith('grafcet:pages')) return
    if (historyMode === 'force' || (historyMode === 'auto' && shouldCommitGroupedEdit(historyKey))) get().commitHistory()
    if (historyMode === 'force') resetGroupedEdit()
    set({ grafcet: program, dirty: true })
  },
  addFc: (id: 'fc1' | 'fc2') => {
    const state = get()
    if (state.fcAdded[id]) return
    set({ fcAdded: { ...state.fcAdded, [id]: true }, dirty: true })
    get().pushEvent('info', `${id.toUpperCase()} adicionada aos blocos de programa.`)
  },
  updateFc: (id, rungs) => {
    get().commitHistory()
    set((state) => ({ fcBlocks: { ...state.fcBlocks, [id]: rungs }, dirty: true }))
  },
  history: [],
  future: [],
  probeResult: null,
  probeA: null,
  clipboard: null,
  currentProjectName: null,
  nativeId: null,
  nativeFeatures: [],
  projectRevision: 0,
  projectKind: 'all' as ProjectKind,
  unlockedViews: [] as WorkspaceView[],
  virtualInputs: {},
  sheets: [{ id: 'sheet-1', name: 'Página 1' }],
  activeSheetId: 'sheet-1',
  addSheet: (name) => {
    const id = `sheet-${Date.now().toString(36)}`
    set((s) => ({ sheets: [...s.sheets, { id, name: name?.trim() || `Página ${s.sheets.length + 1}` }], activeSheetId: id, dirty: true }))
    get().pushEvent('info', 'Folha de esquema criada. Liga folhas com etiquetas de rede nas pontas soltas dos fios (ex.: L1, N, 24V).')
    return id
  },
  renameSheet: (id, name) => set((s) => ({ sheets: s.sheets.map((sh) => (sh.id === id ? { ...sh, name: name.trim() || sh.name } : sh)), dirty: true })),
  removeSheet: (id) => {
    const s = get()
    if (s.sheets.length <= 1) return false
    if (s.components.some((c) => (c.sheet ?? s.sheets[0]?.id ?? 'sheet-1') === id)) {
      get().pushEvent('warning', 'A folha não está vazia: remove ou move primeiro os componentes dela.')
      return false
    }
    const next = s.sheets.filter((sh) => sh.id !== id)
    set({ sheets: next, activeSheetId: s.activeSheetId === id ? next[0].id : s.activeSheetId, dirty: true })
    return true
  },
  setActiveSheet: (id) => set({ activeSheetId: id }),
  virtualInputCount: 8,
  virtualOutputCount: 8,
  virtualMemoryCount: 0,
  virtualInputModes: {},
  forces: {},
  setForce: (address, value) => {
    const key = address.trim().toUpperCase()
    if (!key) return
    set((st) => {
      const forces = { ...st.forces }
      if (value === null) delete forces[key]
      else forces[key] = value
      return { forces }
    })
    if (value !== null) get().runtime.table[key] = value
    recomputeIfPaused()
  },
  clearForces: () => {
    if (!Object.keys(get().forces).length) return
    set({ forces: {} })
    recomputeIfPaused()
  },
  ladderBreakpoints: {},
  setLadderBreakpoint: (rungId, mode) => set((st) => {
    const ladderBreakpoints = { ...st.ladderBreakpoints }
    const next = mode === undefined ? (ladderBreakpoints[rungId] ? null : 'rising') : mode
    if (next === null) delete ladderBreakpoints[rungId]
    else ladderBreakpoints[rungId] = next
    return { ladderBreakpoints }
  }),
  clearLadderBreakpoints: () => set({ ladderBreakpoints: {}, ladderBreakHit: null }),
  ladderBreakEnabled: true,
  setLadderBreakEnabled: (on) => set({ ladderBreakEnabled: on }),
  ladderBreakHit: null,
  ladderTraceCursor: null,
  setLadderTraceCursor: (index) => set({ ladderTraceCursor: index }),
  ladderStepScan: () => {
    // Nunca elevar STOP → PAUSA aqui. Só recalcula se já ativo.
    if (get().sim.runState === 'running' || get().sim.runState === 'paused') get().step()
    set({ ladderBreakHit: null, ladderTraceCursor: 0 })
  },
  setVirtualInputMode: (address, mode) => {
    set((st) => ({ virtualInputModes: { ...st.virtualInputModes, [address]: mode }, dirty: true }))
    // Ao passar para botão de pressão (NO), a entrada volta ao repouso (0);
    // um botão NC repousa a 1 (contacto fechado) e só cai a 0 enquanto premido.
    if (mode === 'push' && get().virtualInputs[address]) get().setVirtualInput(address, false)
    if (mode === 'nc' && !get().virtualInputs[address]) get().setVirtualInput(address, true)
  },
  setVirtualInputName: (address, rawName) => {
    const addr = address.toUpperCase()
    const name = rawName.trim()
    set((st) => {
      const existing = st.tags.find((t) => t.address.toUpperCase() === addr)
      if (existing) return { tags: st.tags.map((t) => (t === existing ? { ...t, name: name || addr } : t)), dirty: true }
      if (!name) return {}
      return { tags: [...st.tags, { id: nanoid(6), address: addr, name, dataType: defaultDataTypeFor(addr) as LadderDataType, comment: '' }], dirty: true }
    })
  },
  setVirtualInput: (address, on) => {
    set((st) => ({ virtualInputs: { ...st.virtualInputs, [address]: on } }))
    get().runtime.table[address] = on
    recomputeIfPaused()
  },
  setVirtualInputCount: (count) => set({ virtualInputCount: Math.max(1, Math.min(32, Math.round(count))) }),
  setVirtualOutputCount: (count) => set({ virtualOutputCount: Math.max(1, Math.min(32, Math.round(count))) }),
  setVirtualMemoryCount: (count) => set({ virtualMemoryCount: Math.max(0, Math.min(32, Math.round(count))) }),
  setPlcSimInput: (plcId, address, on) => {
    const plc = get().components.find((c) => c.id === plcId)
    if (!plc) return
    // Sem histórico (como as entradas virtuais): premir um botão não é uma edição do esquema.
    plc.state = { ...plc.state, simInputs: { ...(plc.state.simInputs as Record<string, boolean> | undefined), [address]: on } }
    const rt = get().runtime.plcRuntime[plcId]
    // NC fechado depende do cabo em série: o scan seguinte calcula o valor.
    const nc = (plc.state.simInputModes as Record<string, VirtualInputMode> | undefined)?.[address] === 'nc'
    if (rt && !(nc && on)) rt.table[address] = on
    set((st) => ({ components: [...st.components], dirty: true }))
    recomputeIfPaused()
  },
  setPlcSimInputMode: (plcId, address, mode) => {
    const plc = get().components.find((c) => c.id === plcId)
    if (!plc) return
    const modes = { ...(plc.state.simInputModes as Record<string, VirtualInputMode> | undefined), [address]: mode }
    const inputs = { ...(plc.state.simInputs as Record<string, boolean> | undefined) }
    // NO volta ao repouso 0; NC repousa a 1 (contacto fechado); interruptor mantém.
    if (mode === 'push') inputs[address] = false
    if (mode === 'nc') inputs[address] = true
    plc.state = { ...plc.state, simInputModes: modes, simInputs: inputs }
    set((st) => ({ components: [...st.components], dirty: true }))
    recomputeIfPaused()
  },
  clearPlcSimInputs: (plcId) => {
    const plc = get().components.find((c) => c.id === plcId)
    if (!plc) return
    const modes = (plc.state.simInputModes as Record<string, VirtualInputMode> | undefined) ?? {}
    const rest: Record<string, boolean> = {}
    for (const [address, mode] of Object.entries(modes)) if (mode === 'nc') rest[address] = true
    plc.state = { ...plc.state, simInputs: rest }
    set((st) => ({ components: [...st.components], dirty: true }))
    recomputeIfPaused()
  },
  clearVirtualInputs: () => {
    // Repouso: botões NO/interruptores a 0; botões NC (ex.: Stop) a 1.
    const rest: Record<string, boolean> = {}
    for (const [address, mode] of Object.entries(get().virtualInputModes)) if (mode === 'nc') rest[address] = true
    set({ virtualInputs: rest })
    for (const key of Object.keys(get().runtime.table)) if (/^I\d+\.\d+$/.test(key)) get().runtime.table[key] = !!rest[key]
    recomputeIfPaused()
  },
  resetMemory: () => {
    // Constrói objetos novos (table/timers/…) para os subscritores React verem a mudança.
    const wipeTable = (table: AddressTable): AddressTable =>
      Object.fromEntries(Object.entries(table).map(([key, value]) => [key, /^[QM]\d+\.\d+$/.test(key) ? false : value]))
    const wipeDb = (db: DbTable): DbTable =>
      Object.fromEntries(Object.entries(db).map(([key, value]) => [key, /^MW\d+$/i.test(key) ? { ...value, value: 0 } : value]))
    const wipeRt = <T extends { table: AddressTable; timers: TimerTable; counters: CounterTable; rungPowered: Record<string, boolean>; db: DbTable; edges: EdgeTable }>(rt: T): T => ({
      ...rt, table: wipeTable(rt.table), timers: {}, counters: {}, rungPowered: {}, edges: {}, db: wipeDb(rt.db),
    })
    set((s) => ({
      runtime: {
        ...wipeRt(s.runtime),
        plcRuntime: Object.fromEntries(Object.entries(s.runtime.plcRuntime).map(([id, rt]) => [id, wipeRt(rt)])),
      },
    }))
    get().pushEvent('info', 'Memória reposta: saídas, memórias, temporizadores e contadores a 0.')
  },
  forceGrafcetSteps: (stepIds) => {
    const st = get()
    set({ grafcetRuntime: forceSteps(st.grafcet, st.grafcetRuntime, stepIds) })
    get().pushEvent('info', 'GRAFCET: etapas forçadas.')
    recomputeIfPaused()
  },
  fireGrafcetTransition: (transitionId) => {
    const st = get()
    const next = fireTransition(st.grafcet, st.grafcetRuntime, transitionId)
    if (!next) return false
    set({ grafcetRuntime: next })
    recomputeIfPaused()
    return true
  },
  restartGrafcet: () => {
    set({ grafcetRuntime: emptyGrafcetRuntime() })
    recomputeIfPaused()
  },
  setProjectKind: (kind) => set({ projectKind: normalizeKind(kind), dirty: true }),
  unlockProjectView: (view) => set((s) => {
    if (view === 'monitor' || s.unlockedViews.includes(view)) return {}
    return { unlockedViews: [...s.unlockedViews, view], dirty: true }
  }),
  _intervalId: null,

  // ---------------------------------------------------------------- simulação
  play: () => {
    const existing = get()._intervalId
    if (existing) return
    // LADDER-COMPILE-01: com a opção ativa, um programa com erros de compilação não entra em RUN.
    if (compileGateEnabled() && get().sim.runState === 'stopped') {
      const state = get()
      const result = compileLadder(compileInputOf(state, state.components.some(isProgrammablePlc)))
      if (!result.ok) {
        get().pushEvent('error', `RUN bloqueado: a compilação do Ladder tem ${result.errors} erro(s). Corrija-os (separador «Compilação») ou desative «Bloquear RUN com erros».`)
        return
      }
    }
    // RUN a partir de STOP: GRAFCET reinicia e os OBs de arranque voltam a correr uma vez.
    // Para os pontos de paragem «ao ligar», o 1.º ciclo depois de STOP parte de RLO = 0 em todas as networks.
    let fromStop = get().sim.runState === 'stopped'
    if (fromStop) set((s) => ({
      grafcetRuntime: emptyGrafcetRuntime(),
      runtime: {
        ...s.runtime,
        startupDone: false,
        plcRuntime: Object.fromEntries(Object.entries(s.runtime.plcRuntime).map(([id, rt]) => [id, { ...rt, startupDone: false }])),
      },
    }))
    let rafGate = false
    const releaseRafGate = () => { rafGate = false }
    const tickCycle = () => {
      if (rafGate) return false
      if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function' && (typeof document === 'undefined' || !document.hidden)) {
        rafGate = true
        window.requestAnimationFrame(releaseRafGate)
      }
      const st = get()
      const dt = (st.sim.mode === 'turbo' ? 50 : 100) * st.sim.speed
      const prevPowered = fromStop ? {} : st.runtime.rungPowered
      fromStop = false
      runOneTick(st as unknown as Store, dt)
      pushRuntime(set, st)
      // Pontos de paragem: avaliados no fim do scan (o ciclo nunca fica a meio).
      if (st.ladderBreakEnabled && Object.keys(st.ladderBreakpoints).length) {
        const trace = st.runtime.rungTrace ?? []
        const hit = findBreakpointHit(st.ladderBreakpoints, prevPowered, trace, st.sim.scanCount)
        if (hit) {
          get().pause()
          const networkNo = st.ladder.rungs.findIndex((r) => r.id === hit.rungId) + 1 || hit.index + 1
          const cursor = trace.findIndex((t) => t.rungId === hit.rungId)
          set({ ladderBreakHit: hit, ladderTraceCursor: cursor >= 0 ? cursor : null })
          get().pushEvent('warning', describeBreakHit(hit, networkNo))
          return true
        }
      }
      return false
    }
    const interval = get().sim.mode === 'turbo' ? 30 : 100
    const iv = window.setInterval(tickCycle, interval)
    set((s) => ({ sim: { ...s.sim, runState: 'running' }, _intervalId: iv, ladderBreakHit: null }))
    // Desbloqueia Web Audio no mesmo gesto do RUN (obrigatório no browser).
    unlockAudio()
    // Executa imediatamente o 1.º scan ao clicar Start (sem atraso inicial).
    tickCycle()
  },

  pause: () => {
    const iv = get()._intervalId
    if (iv) window.clearInterval(iv)
    // STOP permanece STOP — pausar só a partir de RUN (ou manter PAUSA).
    // Encaixe de relé / snap / edição nunca devem «ativar» a simulação.
    if (get().sim.runState === 'stopped') {
      set({ _intervalId: null })
      return
    }
    set((s) => ({ sim: { ...s.sim, runState: 'paused' }, _intervalId: null }))
  },

  stop: () => {
    const iv = get()._intervalId
    if (iv) window.clearInterval(iv)
    silenceAll()
    set((s) => ({
      components: deenergizeComponents(s.components),
      wires: s.wires.map((wire) => (wire.energized ? { ...wire, energized: false } : wire)),
      runtime: EMPTY_RUNTIME(),
      grafcetRuntime: emptyGrafcetRuntime(),
      sim: { ...s.sim, runState: 'stopped', scanCount: 0, diagnostics: [], measurements: [] },
      _intervalId: null,
      ladderBreakHit: null,
      ladderTraceCursor: null,
    }))
  },

  reset: () => {
    get().stop()
    const state = get()
    const components = state.components.map((component) => {
      const nextState = { ...component.state }
      for (const key of ['energized', 'pressed', 'startPressed', 'stopPressed', 'testPressed', 'running', 'done', 'powered', 'powerReady', 'triggered', 'tripped', 'burnt', 'damaged']) {
        if (key in nextState) nextState[key] = false
      }
      for (const key of ['elapsedMs', 'rpmVisual', 'reading', 'count', 'frequencyHz', 'heatLevel']) {
        if (key in nextState) nextState[key] = 0
      }
      if (industrialDeviceTypeOf(component)) {
      if ('on' in nextState) nextState.on = false
      nextState._delayedEdges = []
      if ('activeMs' in nextState) nextState.activeMs = 0
    }
    if ('direction' in nextState) nextState.direction = 'stopped'
      for (const key of ['inputs', 'outputs', 'memories']) {
        const table = nextState[key]
        if (table && typeof table === 'object') nextState[key] = Object.fromEntries(Object.keys(table).map((address) => [address, false]))
      }
      return {
        ...component,
        state: nextState,
        terminals: component.terminals.map((terminal) => ({ ...terminal, energized: false })),
      }
    })
    set({
      components,
      wires: state.wires.map((wire) => ({ ...wire, energized: false, heatLevel: 0, burnt: false, damaged: false })),
      runtime: EMPTY_RUNTIME(),
      grafcetRuntime: emptyGrafcetRuntime(),
      sim: {
        ...state.sim,
        runState: 'stopped',
        scanCount: 0,
        diagnostics: [],
        measurements: [],
        faults: { phaseLoss: false, shortCircuit: false, earthLeak: false, overvoltage: false, overload: false },
        events: [{ id: nanoid(6), ts: Date.now(), level: 'info' as const, message: 'Simulação reiniciada sem alterar o projeto.' }, ...state.sim.events].slice(0, 120),
      },
      _intervalId: null,
      ladderBreakHit: null,
      ladderTraceCursor: null,
    })
  },

  setSpeed: (n) => set((s) => ({ sim: { ...s.sim, speed: n } })),
  setMode: (m) => {
    set((s) => ({ sim: { ...s.sim, mode: m, stepMode: m === 'step' } }))
    if (m === 'realtime') get().play()
    else get().pause()
  },
  toggleStepMode: () => set((s) => ({ sim: { ...s.sim, stepMode: !s.sim.stepMode, mode: !s.sim.stepMode ? 'step' : 'realtime' } })),

  step: () => {
    if (get().sim.runState === 'stopped' && get().sim.scanCount === 0) {
      set((s) => ({
        grafcetRuntime: emptyGrafcetRuntime(),
        runtime: {
          ...s.runtime,
          startupDone: false,
          plcRuntime: Object.fromEntries(Object.entries(s.runtime.plcRuntime).map(([id, rt]) => [id, { ...rt, startupDone: false }])),
        },
      }))
    }
    // STEP avança um scan. Mesmo em STOP computa a continuidade elétrica para
    // consultas pontuais (ex.: sonda de multímetro, verificação de lâmpada).
    // Só não «acorda» a simulação: runState mantém-se 'stopped'.
    const before = get().sim.runState
    if (before === 'running' || get()._intervalId) get().pause()
    const st = get()
    runOneTick(st as unknown as Store, 100)
    pushRuntime(set, st)
  },

  setFaults: (patch) => {
    set((s) => ({ sim: { ...s.sim, faults: { ...s.sim.faults, ...patch } } }))
    recomputeIfActive()
  },

  toggleBlackBox: () => set((s) => ({ sim: { ...s.sim, blackBox: !s.sim.blackBox } })),

  repairBurntEquipment: () => {
    set((s) => ({
      wires: s.wires.map((w) => ({ ...w, damaged: false, burnt: false, heatLevel: 0 })),
      components: s.components.map((c) => ({
        ...c,
        state: { ...c.state, damaged: false, burnt: false, heatLevel: 0, tripped: false },
      })),
      sim: {
        ...s.sim,
        events: [
          {
            id: nanoid(6),
            ts: Date.now(),
            level: 'info' as const,
            message: 'Equipamentos e cabos reparados / substituídos com sucesso.',
          },
          ...s.sim.events,
        ].slice(0, 120),
      },
    }))
  },

  pushEvent: (level, message) =>
    set((s) => ({
      sim: {
        ...s.sim,
        events: [{ id: nanoid(6), ts: Date.now(), level, message }, ...s.sim.events].slice(0, 120),
      },
    })),

  // ------------------------------------------------------------- acionamento
  pressButton: (componentId, pressed) => {
    if (!isManobraAllowed(get())) return
    let changed = false
    set((s) => {
      const c = s.components.find((x) => x.id === componentId)
      if (c) {
        // Cogumelos de emergência permanecem acionados ao largar. Um novo
        // clique representa o giro/chave de rearme; botoeiras comuns continuam
        // momentâneas e seguem diretamente o estado do ponteiro.
        const before = !!c.state.pressed
        if (c.state.latched) {
          if (pressed) c.state.pressed = !c.state.pressed
        } else c.state.pressed = pressed
        changed = before !== !!c.state.pressed
      }
      return { components: [...s.components], dirty: true }
    })
    if (changed) playClick('button')
    recomputeIfActive()
  },

  setComponentState: (componentId, patch) => {
    get().commitHistory()
    let sfx: 'breaker' | 'button' | 'selector' | 'thermal' | null = null
    set((s) => {
      const c = s.components.find((x) => x.id === componentId)
      if (c) {
        const info = importedComponentInfo(c.type)
        if (typeof patch.closed === 'boolean' && patch.closed !== c.state.closed) sfx = 'breaker'
        else if (typeof patch.position === 'number' && patch.position !== c.state.position) sfx = 'selector'
        else if (typeof patch.testPressed === 'boolean' && patch.testPressed !== c.state.testPressed && patch.testPressed) sfx = 'thermal'
        else if (typeof patch.tripped === 'boolean' && patch.tripped !== c.state.tripped) sfx = 'thermal'
        else if (typeof patch.stopPressed === 'boolean' && patch.stopPressed !== c.state.stopPressed && patch.stopPressed) sfx = info?.behavior === 'thermal' ? 'thermal' : 'button'
        else if (typeof patch.pressed === 'boolean' && patch.pressed !== c.state.pressed) sfx = 'button'
        else if (typeof patch.startPressed === 'boolean' && patch.startPressed !== c.state.startPressed && patch.startPressed) sfx = 'button'
        else if ((c.type === 'wallSwitchSimple' || c.type === 'wallSwitchStaircase') && typeof patch.on === 'boolean' && patch.on !== c.state.on) sfx = 'button'
        else if (c.type === 'wallSwitchDouble' && ((typeof patch.on1 === 'boolean' && patch.on1 !== c.state.on1) || (typeof patch.on2 === 'boolean' && patch.on2 !== c.state.on2))) sfx = 'button'
        c.state = { ...c.state, ...patch }
      }
      return { components: [...s.components], dirty: true }
    })
    if (sfx) playClick(sfx)
    recomputeIfActive()
  },
  operateComponent: (componentId, patch) => {
    const allowed = allowedManobraPatch(get(), patch)
    if (allowed) get().setComponentState(componentId, allowed)
  },
  actuateImported: (componentId, pressed, control = null) => {
    if (!isManobraAllowed(get())) return
    const component = get().components.find((c) => c.id === componentId)
    if (!component) return
    const patch = importedActuationPatch(component, pressed, control)
    // O som fica a cargo de setComponentState (evita clique duplicado).
    if (patch && Object.entries(patch).some(([key, value]) => component.state[key] !== value)) get().setComponentState(componentId, patch)
  },

  toggleTerminal: (terminalId) => {
    if (!isManobraAllowed(get())) return
    let sfx: 'breaker' | 'thermal' | null = null
    set((s) => {
      for (const c of s.components) {
        const t = c.terminals.find((x) => x.id === terminalId)
        if (t) {
          if (c.type === 'breaker1p' || c.type === 'breakerSteckSdC25' || c.type === 'breaker2p' || c.type === 'breaker3p' || c.type === 'breaker4p' || c.type === 'motorBreaker' || c.type === 'motorBreakerPkzmC10' || c.type === 'residualBreaker') {
            c.state.closed = !c.state.closed
            sfx = 'breaker'
          } else if (c.type === 'fuse' || c.type === 'fuseHolder') {
            c.state.blown = !c.state.blown
            sfx = 'breaker'
          } else if (c.type === 'thermalRelay') {
            c.state.tripped = !c.state.tripped
            sfx = 'thermal'
          }
        }
      }
      return { components: [...s.components], dirty: true }
    })
    if (sfx) playClick(sfx)
    recomputeIfActive()
  },

  // ------------------------------------------------------------------ edição
  setTool: (t) => {
    // Demonstração da landing: só Selecionar/Mover vista — as outras
    // ferramentas editam o projeto e estão escondidas da barra.
    if (get().demoMode && t !== 'select' && t !== 'pan') return
    set({ tool: t, gridDragEnabled: false, selectedWireId: t === 'select' ? get().selectedWireId : null, selectedTerminalId: null })
  },
  gridDragEnabled: false,
  setGridDragEnabled: (enabled) => set({ gridDragEnabled: enabled }),

  placingType: null,
  setPlacingType: (t) => {
    const availableType = t && canInsertComponent3D(t) ? t : null
    set({ placingType: availableType, tool: availableType ? 'select' : get().tool })
  },
  dragType: null,
  setDragType: (t) => set({ dragType: t && canInsertComponent3D(t) ? t : null }),
  viewOrientationEditor: null,
  openViewOrientationEditor: (componentId, section = 'orientation') => {
    if (get().demoMode) return
    const component = get().components.find((item) => item.id === componentId)
    if (!component) return
    set({
      viewOrientationEditor: {
        componentId,
        draft: componentOrientationOf(component),
        terminalViewPositions: structuredClone(component.terminalViewPositions ?? {}),
        terminals: structuredClone(component.terminals),
        activeTerminalId: component.terminals[0]?.id ?? null,
        scale3D: component3DScaleOf(component),
        renderMode3D: component.view3DRenderMode ?? 'solid',
        bodyColor3D: component.bodyColor,
        trackingDiameter: lastTrackingDiameter,
        trackingLabels: 'active',
        section,
      },
      selectedComponentIds: [componentId],
      selectedWireId: null,
      selectedTerminalId: null,
    })
  },
  setViewOrientationDraft: (orientation) => set((state) => state.viewOrientationEditor ? {
    viewOrientationEditor: { ...state.viewOrientationEditor, draft: normalizeComponentOrientation(orientation) },
  } : {}),
  setViewEditorSection: (section) => set((state) => state.viewOrientationEditor ? {
    viewOrientationEditor: { ...state.viewOrientationEditor, section },
  } : {}),
  setViewTerminalPosition: (terminalId, position) => set((state) => {
    const editor = state.viewOrientationEditor
    if (!editor || !Number.isFinite(position.x) || !Number.isFinite(position.y)) return {}
    const viewKey = componentTerminalViewKey(editor.draft)
    const component = state.components.find((item) => item.id === editor.componentId)
    const terminalIndex = editor.terminals.findIndex((item) => item.id === terminalId)
    const terminal = editor.terminals[terminalIndex]
    let terminals = editor.terminals
    let viewPositions = editor.terminalViewPositions
    if (component && terminal) {
      // Arrastar no 2D também move o ponto físico (mantendo a profundidade): o 3D fica em sintonia.
      const position3D = terminal3DFromProjectedLocal({ ...component, terminals: editor.terminals }, terminal, editor.draft, { x: position.x * component.w, y: position.y * component.h })
      terminals = editor.terminals.map((item) => (item.id === terminalId ? { ...item, position3D } : item))
      viewPositions = withoutManualTerminalPositions(viewPositions, terminal, terminalIndex, viewKey)
    }
    return {
      viewOrientationEditor: {
        ...editor,
        activeTerminalId: terminalId,
        terminals,
        terminalViewPositions: {
          ...viewPositions,
          [viewKey]: {
            ...(viewPositions[viewKey] ?? {}),
            [terminalId]: { x: position.x, y: position.y },
          },
        },
      },
    }
  }),
  setViewTerminalPosition3D: (terminalId, position3D) => set((state) => {
    const editor = state.viewOrientationEditor
    if (!editor) return {}
    const terminalIndex = editor.terminals.findIndex((item) => item.id === terminalId)
    const terminal = editor.terminals[terminalIndex]
    if (!terminal) return {}
    const next = normalizeTerminal3DPosition(position3D, terminal3DPositionOf(terminal))
    return {
      viewOrientationEditor: {
        ...editor,
        activeTerminalId: terminalId,
        terminals: editor.terminals.map((item) => (item.id === terminalId ? { ...item, position3D: next } : item)),
        terminalViewPositions: withoutManualTerminalPositions(editor.terminalViewPositions, terminal, terminalIndex),
      },
    }
  }),
  addViewTerminal: (initial = {}) => set((state) => {
    const editor = state.viewOrientationEditor
    if (!editor) return {}
    const usedLabels = new Set(editor.terminals.map((terminal) => terminal.label.toLocaleUpperCase()))
    let ordinal = editor.terminals.length + 1
    while (usedLabels.has(`X${ordinal}`)) ordinal += 1
    const label = initial.label?.trim() || `X${ordinal}`
    const terminal = {
      ...createTerminal(editor.componentId, label, initial.kind ?? 'io', initial.x ?? 0.5, initial.y ?? 0.5),
      ...initial,
      label,
      id: `${editor.componentId}-${label}-${nanoid(6)}`,
      componentId: editor.componentId,
      position3D: initial.position3D ? normalizeTerminal3DPosition(initial.position3D, { x: 0.5, y: 0.5, z: 1 }) : { x: 0.5, y: 0.5, z: 1 },
      energized: false,
    }
    return {
      viewOrientationEditor: {
        ...editor,
        terminals: [...editor.terminals, terminal],
        activeTerminalId: terminal.id,
      },
    }
  }),
  deleteViewTerminal: (terminalId) => set((state) => {
    const editor = state.viewOrientationEditor
    const terminalIndex = editor?.terminals.findIndex((terminal) => terminal.id === terminalId) ?? -1
    const removed = terminalIndex >= 0 ? editor?.terminals[terminalIndex] : undefined
    if (!editor || !removed) return {}
    const terminals = editor.terminals.filter((terminal) => terminal.id !== terminalId)
    // Converte chaves legadas por índice/rótulo em IDs antes da remoção, para
    // que os mapas das restantes peças não mudem de dono quando o índice fecha.
    const terminalViewPositions = Object.fromEntries(Object.entries(editor.terminalViewPositions).map(([view, positions]) => [
      view,
      Object.fromEntries(Object.entries(positions).map(([key, position]) => {
        const indexed = key.startsWith('index:') ? editor.terminals[Number(key.slice(6))] : undefined
        const labelled = key.startsWith('label:') ? editor.terminals.find((terminal) => terminal.label === key.slice(6)) : undefined
        return [indexed?.id ?? labelled?.id ?? key, position] as const
      }).filter(([key]) => key !== terminalId)),
    ]))
    return {
      viewOrientationEditor: {
        ...editor,
        terminals,
        terminalViewPositions,
        activeTerminalId: editor.activeTerminalId === terminalId ? (terminals[0]?.id ?? null) : editor.activeTerminalId,
      },
    }
  }),
  setViewTerminalDefinition: (terminalId, patch) => set((state) => {
    const editor = state.viewOrientationEditor
    if (!editor) return {}
    return {
      viewOrientationEditor: {
        ...editor,
        activeTerminalId: terminalId,
        terminals: editor.terminals.map((terminal) => {
          if (terminal.id !== terminalId) return terminal
          const next = {
            ...terminal,
            ...patch,
            id: terminal.id,
            componentId: terminal.componentId,
            energized: terminal.energized,
          }
          if (Object.prototype.hasOwnProperty.call(patch, 'position3D')) {
            next.position3D = patch.position3D
              ? normalizeTerminal3DPosition(patch.position3D, terminal3DPositionOf(terminal))
              : undefined
          }
          return next
        }),
      },
    }
  }),
  setViewActiveTerminal: (terminalId) => set((state) => state.viewOrientationEditor ? {
    viewOrientationEditor: { ...state.viewOrientationEditor, activeTerminalId: terminalId },
  } : {}),
  setViewTracking: (patch) => set((state) => {
    if (!state.viewOrientationEditor) return {}
    const trackingDiameter = patch.trackingDiameter === undefined ? state.viewOrientationEditor.trackingDiameter : clampDiameter(patch.trackingDiameter, 4, 40)
    lastTrackingDiameter = trackingDiameter
    return { viewOrientationEditor: { ...state.viewOrientationEditor, trackingDiameter, trackingLabels: patch.trackingLabels ?? state.viewOrientationEditor.trackingLabels } }
  }),
  setViewTerminalDiameter: (diameter, terminalId) => set((state) => {
    const editor = state.viewOrientationEditor
    if (!editor) return {}
    const value = diameter === undefined ? undefined : clampDiameter(diameter, 3, 24)
    return {
      viewOrientationEditor: {
        ...editor,
        terminals: editor.terminals.map((terminal) => (!terminalId || terminal.id === terminalId ? { ...terminal, diameter: value } : terminal)),
      },
    }
  }),
  nudgeViewTerminal: (terminalId, dx, dy) => {
    const state = get()
    const editor = state.viewOrientationEditor
    const component = editor && state.components.find((item) => item.id === editor.componentId)
    const terminal = editor?.terminals.find((item) => item.id === terminalId)
    if (!editor || !component || !terminal) return
    const current = componentTerminalLocal({ ...component, viewOrientation: editor.draft, terminalViewPositions: editor.terminalViewPositions, terminals: editor.terminals }, terminal)
    get().setViewTerminalPosition(terminalId, { x: (current.x + dx) / component.w, y: (current.y + dy) / component.h })
  },
  setView3DScale: (scale) => set((state) => state.viewOrientationEditor ? {
    viewOrientationEditor: { ...state.viewOrientationEditor, scale3D: normalizeComponent3DScale(scale) },
  } : {}),
  setView3DRenderMode: (mode) => set((state) => state.viewOrientationEditor ? {
    viewOrientationEditor: { ...state.viewOrientationEditor, renderMode3D: mode === 'wireframe' || mode === 'xray' ? mode : 'solid' },
  } : {}),
  setView3DBodyColor: (color) => set((state) => state.viewOrientationEditor ? {
    viewOrientationEditor: { ...state.viewOrientationEditor, bodyColor3D: color && /^#[0-9a-f]{6}$/i.test(color) ? color : undefined },
  } : {}),
  autoPlaceViewTerminals: () => set((state) => {
    const editor = state.viewOrientationEditor
    if (!editor) return {}
    const component = state.components.find((item) => item.id === editor.componentId)
    if (!component) return {}
    const viewKey = componentTerminalViewKey(editor.draft)
    return {
      viewOrientationEditor: {
        ...editor,
        terminalViewPositions: {
          ...editor.terminalViewPositions,
          [viewKey]: automaticTerminalViewPositions({ ...component, terminals: editor.terminals }, editor.draft, editor.trackingDiameter),
        },
      },
    }
  }),
  restoreViewEditorRevision: (version) => set((state) => {
    const editor = state.viewOrientationEditor
    if (!editor) return {}
    const component = state.components.find((item) => item.id === editor.componentId)
    const revision = component?.editorHistory?.find((item) => item.version === version)
    if (!component || !revision) return {}
    return {
      viewOrientationEditor: {
        ...editor,
        draft: normalizeComponentOrientation(revision.viewOrientation),
        terminalViewPositions: structuredClone(revision.terminalViewPositions),
        terminals: structuredClone(revision.terminals).map((terminal) => ({ ...terminal, componentId: component.id, energized: false })),
        activeTerminalId: revision.terminals[0]?.id ?? null,
        scale3D: normalizeComponent3DScale(revision.view3DScale),
        renderMode3D: revision.view3DRenderMode,
        bodyColor3D: revision.bodyColor,
      },
    }
  }),
  cancelViewOrientationEditor: () => set({ viewOrientationEditor: null }),
  applyViewOrientationEditor: (saveAsDefault, note = '') => {
    const editor = get().viewOrientationEditor
    if (!editor) return
    const component = get().components.find((item) => item.id === editor.componentId)
    if (!component) { set({ viewOrientationEditor: null }); return }
    const orientation = normalizeComponentOrientation(editor.draft)
    const terminalViewPositions = structuredClone(editor.terminalViewPositions)
    const terminalDrafts = structuredClone(editor.terminals)
    const scale3D = normalizeComponent3DScale(editor.scale3D)
    const renderMode3D = editor.renderMode3D
    const bodyColor3D = editor.bodyColor3D
    const editedComponent: ElectricalComponent = {
      ...component,
      viewOrientation: orientation,
      terminalViewPositions,
      view3DScale: scale3D,
      view3DRenderMode: renderMode3D,
      bodyColor: bodyColor3D,
      terminals: terminalDrafts,
    }
    const beforeSnapshot = componentEditorSnapshotOf(component)
    const afterSnapshot = componentEditorSnapshotOf(editedComponent)
    const changes = componentEditorChangeLabels(beforeSnapshot, afterSnapshot)
    const changed = !componentEditorSnapshotEquals(beforeSnapshot, afterSnapshot)
    const updatedAt = new Date().toISOString()
    const nextVersion = componentEditorVersionOf(component) + (changed ? 1 : 0)
    const revisionNote = note.trim() || changes.join(' · ') || 'Padrão de apresentação atualizado'
    const history = changed
      ? nextComponentHistory(component, previousComponentRevision(component, updatedAt))
      : component.editorHistory ?? []

    if (saveAsDefault) {
      saveDefaultComponentOrientation(component.type, orientation)
      const terminalIndexes = new Map(terminalDrafts.map((terminal, index) => [terminal.id, index]))
      const reusablePositions = Object.fromEntries(Object.entries(terminalViewPositions).map(([view, positions]) => [view,
        Object.fromEntries(Object.entries(positions).map(([terminalId, position]) => {
          const index = terminalIndexes.get(terminalId)
          return [index === undefined ? terminalId : `index:${index}`, position]
        })),
      ]))
      saveDefaultComponentTerminalViewPositions(component.type, reusablePositions)
      saveDefaultComponent3DPresentation(component.type, { scale: scale3D, renderMode: renderMode3D, bodyColor: bodyColor3D })
    }

    if (changed) get().commitHistory()
    const validTerminalIds = new Set(terminalDrafts.map((terminal) => terminal.id))
    const removedTerminalIds = new Set(component.terminals.map((terminal) => terminal.id).filter((id) => !validTerminalIds.has(id)))
    const removedWireCount = get().wires.filter((wire) => removedTerminalIds.has(wire.fromTerminalId) || removedTerminalIds.has(wire.toTerminalId)).length
    set((state) => ({
      components: changed ? state.components.map((item) => item.id === component.id ? {
        ...item,
        viewOrientation: orientation,
        terminalViewPositions,
        view3DScale: scale3D,
        view3DRenderMode: renderMode3D,
        bodyColor: bodyColor3D,
        editorVersion: nextVersion,
        editorUpdatedAt: updatedAt,
        editorLastChange: revisionNote,
        editorHistory: history,
        // O rascunho é a lista completa: preserva os novos bornes e confirma remoções.
        terminals: terminalDrafts.map((draft) => {
          const current = item.terminals.find((terminal) => terminal.id === draft.id)
          return {
            ...draft,
            componentId: item.id,
            energized: current?.energized ?? false,
          }
        }),
      } : item) : state.components,
      wires: changed && removedTerminalIds.size > 0
        ? normalizeWires(state.wires.filter((wire) => !removedTerminalIds.has(wire.fromTerminalId) && !removedTerminalIds.has(wire.toTerminalId)), state.components)
        : state.wires,
      selectedWireId: state.selectedWireId && state.wires.some((wire) => wire.id === state.selectedWireId && !removedTerminalIds.has(wire.fromTerminalId) && !removedTerminalIds.has(wire.toTerminalId)) ? state.selectedWireId : null,
      selectedTerminalId: state.selectedTerminalId && validTerminalIds.has(state.selectedTerminalId) ? state.selectedTerminalId : null,
      viewOrientationEditor: null,
      dirty: state.dirty || changed,
    }))
    if (changed) get().pushEvent('info', `Componente 3D ${component.ref} guardado como versão ${nextVersion}${saveAsDefault ? ' e padrão para novas instâncias' : ''}.`)
    else if (saveAsDefault) get().pushEvent('info', `Apresentação atual de ${component.ref} guardada como padrão para novas instâncias.`)
    if (removedWireCount > 0) get().pushEvent('warning', `${removedWireCount} cabo(s) ligado(s) a bornes removidos foram eliminados em segurança.`)
  },
  wireDefaults: { autoColor: true, color: 'black', gauge: '1.5mm²', flexibility: 'rigid', endType: 'ferrule', conductorCount: 1, sheathed: false },
  setWireDefaults: (patch) => set((s) => ({ wireDefaults: { ...s.wireDefaults, ...patch } })),

  addComponent: (type, x, y) => {
    if (get().demoMode) return null
    if (!canInsertComponent3D(type)) {
      get().pushEvent('warning', `Componente bloqueado: não existe representação 3D disponível para ${TEMPLATES[type]?.paletteName ?? type}.`)
      return null
    }
    get().commitHistory()
    const comp = createComponent(type, undefined, undefined, get().components.length, x, y)
    // Calha técnica largada junto a outra: encaixa (prolonga ou ramifica em T) e herda medidas e cor.
    const snap = type === 'cableDuct' ? snapNewDuct({ x, y }, get().components, comp) : null
    const free = snap ? { x: snap.placement.schematicX, y: snap.placement.schematicY, displaced: false } : nearestFreeComponentPosition(comp, x, y, get().components)
    if (snap) applyDuctPlacement(comp, snap.placement)
    comp.schematicX = free.x
    comp.schematicY = free.y
    comp.ref = nextRef(get().components, type)
    comp.z = nextTopZ(get().components, get().wires)
    comp.sheet = get().activeSheetId
    set((s) => ({
      components: [...s.components, comp],
      selectedComponentIds: [comp.id],
      selectedWireId: null,
      dirty: true,
    }))
    get().pushEvent('info', `Componente ${comp.ref} (${comp.label}) adicionado ao esquema.`)
    if (free.displaced) get().pushEvent('warning', `${comp.ref} foi colocado na posição livre mais próxima para evitar sobreposição.`)
    if (snap) get().pushEvent('info', `${comp.ref} encaixada em ${snap.hostRef}: ${snap.slot === 'left' || snap.slot === 'right' ? 'prolonga a calha' : 'ramal em T'} (mesma largura, altura e cor).`)
    if (get().grid.railMagnet !== false) get().snapToRails([comp.id])
    recomputeIfActive()
    return comp.id
  },
  addDuctAdjacent: (id, slot, lengthMm) => {
    if (get().demoMode || isSimEditLocked(get())) return null
    const host = get().components.find((c) => c.id === id && c.type === 'cableDuct')
    if (!host || host.locked) return null
    const requested = adjacentDuctPlacement(host, slot, lengthMm)
    const comp = createComponent('cableDuct', undefined, undefined, get().components.length, requested.schematicX, requested.schematicY)
    const placement = fitAdjacentDuct(host, slot, get().components, comp, lengthMm)
    if (!placement) {
      get().pushEvent('warning', `${host.ref}: sem espaço para ${slot === 'left' ? 'prolongar à esquerda' : slot === 'right' ? 'prolongar à direita' : 'ramificar'} — afaste os aparelhos vizinhos.`)
      return null
    }
    applyDuctPlacement(comp, placement)
    get().commitHistory()
    comp.ref = nextRef(get().components, 'cableDuct')
    comp.z = nextTopZ(get().components, get().wires)
    comp.sheet = host.sheet ?? get().activeSheetId
    if (host.enclosureId) comp.enclosureId = host.enclosureId
    set((s) => ({ components: [...s.components, comp], selectedComponentIds: [comp.id], selectedWireId: null, dirty: true }))
    get().pushEvent('info', `${comp.ref} ${slot === 'left' || slot === 'right' ? 'prolonga' : 'ramifica de'} ${host.ref} (${placement.lengthMm} mm).${placement.lengthMm < requested.lengthMm ? ' Comprimento ajustado ao espaço disponível.' : ''}`)
    recomputeIfActive()
    return comp.id
  },
  addMountedDevice: (type, enclosureId, face, offsetXmm, offsetYmm, cutoutMm, holeId) => {
    if (get().demoMode) return null
    if (!canInsertComponent3D(type)) {
      get().pushEvent('warning', `Sem modelo 3D para ${type}.`)
      return null
    }
    const enclosure = get().components.find((item) => item.id === enclosureId)
    const holes: import('../types').EnclosureHole[] = (enclosure?.state as any)?.holes ?? []
    const matchingHole = (holeId ? holes.find((hole) => hole.id === holeId) : undefined)
      ?? holes.find((hole) => hole.face === face && hole.offsetXmm === offsetXmm && hole.offsetYmm === offsetYmm)
    if (matchingHole?.occupiedBy) {
      get().pushEvent('warning', `O furo ${matchingHole.id} já tem um aparelho montado.`)
      return null
    }
    get().commitHistory()
    const comp = createComponent(type, undefined, undefined, get().components.length, 0, 0)
    comp.ref = nextRef(get().components, type)
    comp.z = nextTopZ(get().components, get().wires)
    comp.sheet = get().activeSheetId
    comp.panelMount = { enclosureId, face: face as any, offsetXmm, offsetYmm, cutoutMm }
    // posição esquemática aproximada (para seleção), mas o pivot 3D vem do panelMount
    if (enclosure) { comp.schematicX = enclosure.schematicX + enclosure.w / 2 - comp.w / 2 + offsetXmm * SCHEMATIC_PX_PER_MM; comp.schematicY = enclosure.schematicY + enclosure.h / 2 - comp.h / 2 - offsetYmm * SCHEMATIC_PX_PER_MM }
    set((s) => ({
      components: [
        ...s.components.map((item) => item.id === enclosureId && matchingHole ? {
          ...item,
          state: {
            ...item.state,
            holes: ((item.state as any).holes ?? []).map((hole: import('../types').EnclosureHole) => hole.id === matchingHole.id ? { ...hole, occupiedBy: comp.id } : hole),
          },
        } : item),
        comp,
      ],
      selectedComponentIds: [comp.id],
      dirty: true,
    }))
    get().pushEvent('info', `${comp.ref} montado na face ${face} Ø${cutoutMm}mm.`)
    recomputeIfActive()
    return comp.id
  },

  applyComponentPlan: (items) => {
    if (!items.length) return { created: 0, updated: 0 }
    get().commitHistory()
    const sameRef = (a: string, b: string) => a.trim().toUpperCase() === b.trim().toUpperCase()
    const wires = get().wires
    let components = [...get().components]
    let created = 0
    let updated = 0
    const touched: string[] = []
    const railTargets: string[] = []
    // Calhas primeiro: os equipamentos que a elas se referem precisam de a encontrar já criada.
    const ordered = [...items].sort((a, b) => Number(b.type === 'dinRail15x55') - Number(a.type === 'dinRail15x55'))
    for (const item of ordered) {
      const existing = item.action === 'update' ? components.find((component) => component.id === item.id) : undefined
      if (item.action === 'update' && !existing) continue
      let component: ElectricalComponent
      if (existing) component = { ...existing }
      else {
        if (item.type === '') continue
        component = createComponent(item.type, item.ref, item.label || undefined, components.length, SCHEMATIC_ORIGIN.x, SCHEMATIC_ORIGIN.y)
        component.sheet = get().activeSheetId
        component.z = nextTopZ(components, wires)
        component.railId = undefined
        const free = nearestFreeComponentPosition(component, SCHEMATIC_ORIGIN.x - component.w / 2, SCHEMATIC_ORIGIN.y - component.h / 2, components)
        component.schematicX = free.x
        component.schematicY = free.y
      }
      if (existing && item.label) component.label = item.label
      if (item.rotation !== null) component.rotation = item.rotation
      if (item.mirrored !== null) component.mirrored = item.mirrored
      if (item.locked !== null) component.locked = item.locked
      if (item.xMm !== null && item.yMm !== null) {
        component.schematicX = Math.round(panelToSchematicX(item.xMm * PANEL_UNITS_PER_MM) - component.w / 2)
        component.schematicY = Math.round(panelToSchematicY(item.yMm * PANEL_UNITS_PER_MM) - component.h / 2)
        if (existing) { component.railId = undefined; component.railOffsetMm = undefined }
      }
      const rail = item.rail ? components.find((other) => isDinRail(other) && sameRef(other.ref, item.rail)) : undefined
      if (rail && isRailMountable(component)) {
        component.railId = rail.id
        component.railOffsetMm = item.railOffsetMm ?? 0
        component.schematicX = Math.round(rail.schematicX + (item.railOffsetMm ?? 0) * SCHEMATIC_PX_PER_MM)
        component.schematicY = Math.round(rail.schematicY + rail.h / 2 - component.h / 2)
        railTargets.push(component.id)
      }
      if (existing) { components = components.map((other) => (other.id === component.id ? component : other)); updated++ }
      else { components = [...components, component]; created++ }
      touched.push(component.id)
    }
    set({ components, selectedComponentIds: touched, selectedWireId: null, dirty: true })
    if (railTargets.length) get().snapToRails(railTargets)
    get().pushEvent('info', `Tabela de componentes aplicada: ${created} criado(s), ${updated} atualizado(s).`)
    recomputeIfActive()
    return { created, updated }
  },

  duplicateComponents: (ids) => {
    if (get().demoMode) return
    const allowedIds = ids.filter((id) => {
      const source = get().components.find((component) => component.id === id)
      return source ? canInsertComponent3D(source.type) : false
    })
    if (allowedIds.length === 0) {
      if (ids.length > 0) get().pushEvent('warning', 'Duplicação bloqueada: o componente selecionado ainda não possui modelo 3D GLB.')
      return
    }
    if (allowedIds.length < ids.length) get().pushEvent('warning', 'Componentes sem modelo 3D GLB não foram duplicados.')

    // Duplicação inteligente de bornes de calha DIN:
    //  • 1 borne: acrescenta o borne seguinte encostado à direita na mesma régua e calha, agrupando-o automaticamente;
    //  • Vários bornes (régua completa): cria uma nova régua completa (ex.: X1.* → X2.*) encostada na mesma calha, já agrupada.
    const stateBefore = get()
    const selectedSources = allowedIds
      .map((id) => stateBefore.components.find((c) => c.id === id))
      .filter((c): c is ElectricalComponent => !!c)
    const allStripTerminals =
      selectedSources.length > 0 &&
      selectedSources.every((c) => isTerminalStripType(c.type) && Number(c.state?.poleCount ?? 1) <= 1 && !c.panelMount)

    if (allStripTerminals) {
      get().commitHistory()
      const cloneFromSource = (src: ElectricalComponent, ref: string, extraState: Record<string, unknown>) => {
        const cleanState = JSON.parse(JSON.stringify(src.state)) as Record<string, unknown>
        delete cleanState.stripUngrouped
        const clone = createComponent(src.type, ref, src.label, stateBefore.components.length, src.schematicX, src.schematicY, {
          ...cleanState,
          ...extraState,
        })
        clone.z = nextTopZ(stateBefore.components, stateBefore.wires)
        clone.sheet = src.sheet
        clone.mirrored = src.mirrored
        clone.rotation = src.rotation
        if (src.catalog) clone.catalog = { ...src.catalog }
        clone.viewOrientation = componentOrientationOf(src)
        clone.terminals = clone.terminals.map((terminal, index) => {
          const source = src.terminals[index]
          return source
            ? {
                ...terminal,
                label: source.label,
                displayName: source.displayName,
                kind: source.kind,
                terminalType: source.terminalType,
                color: source.color,
                x: source.x,
                y: source.y,
                position3D: source.position3D ? { ...source.position3D } : undefined,
                pinned: source.pinned,
              }
            : terminal
        })
        clone.w = src.w
        clone.h = src.h
        clone.bodyColor = src.bodyColor
        clone.view3DScale = component3DScaleOf(src)
        clone.view3DRenderMode = src.view3DRenderMode ?? 'solid'
        clone.railId = src.railId
        clone.enclosureId = src.enclosureId
        return clone
      }

      if (selectedSources.length === 1) {
        const src = selectedSources[0]
        const strip = terminalStripFor(stateBefore.components, src.id)
        const members = strip?.members ?? [src]
        const tail = members[members.length - 1]
        const parsed = parseTerminalRef(src.ref)
        const otherRefs = stateBefore.components.filter((c) => c.id !== src.id).map((c) => c.ref)
        let nextBaseRef = src.ref
        let cloneRef: string
        if (parsed.hierarchical || (strip && strip.hierarchical)) {
          const prefix = strip?.prefix || parsed.prefix
          const sep = strip?.sep || parsed.sep || '.'
          const prefSuffix = src.type === 'terminalPE' ? 'PE' : undefined
          const startIdx: 0 | 1 = members.some((m) => parseTerminalRef(m.ref).index === 0) ? 0 : 1
          cloneRef = nextStripMemberRef(stateBefore.components.map((c) => c.ref), prefix, sep, prefSuffix, startIdx)
        } else if (src.type === 'terminalPE') {
          cloneRef = nextRef(stateBefore.components, src.type)
        } else {
          const plan = planTerminalStripRefs(otherRefs, src.ref, 2, true, 1)
          nextBaseRef = plan.baseRef
          cloneRef = plan.refs[0] ?? nextRef(stateBefore.components, src.type)
        }
        const sid = (typeof tail.state?.stripId === 'string' && tail.state.stripId) || nanoid(6)
        const rail = tail.railId ? stateBefore.components.find((r) => r.id === tail.railId) : undefined
        const railMax = rail ? clampRailLengthMm(rail.state.lengthMm) : null
        const startMm = tail.railId && typeof tail.railOffsetMm === 'number'
          ? tail.railOffsetMm + terminalMemberWidthMm(tail)
          : null
        const clone = cloneFromSource(src, cloneRef, { stripId: sid, jumperNext: false })
        const placed = placeStripCloneRight(
          clone,
          tail,
          tail.schematicX + tail.w + TERMINAL_STRIP_GAP_PX.hierarchical,
          startMm,
          TERMINAL_STRIP_GAP_PX.hierarchical,
          stateBefore.components,
          railMax,
        )
        clone.schematicX = placed.schematicX
        clone.schematicY = tail.schematicY
        if (placed.railOffsetMm !== undefined) clone.railOffsetMm = placed.railOffsetMm
        const memberIds = [...new Set([...members.map((m) => m.id), clone.id])]
        const memberSet = new Set(members.map((m) => m.id))
        set((s) => ({
          components: [
            ...s.components.map((c) => {
              if (!memberSet.has(c.id)) return c
              const nextState: Record<string, any> = { ...c.state, stripId: sid }
              delete nextState.stripUngrouped
              return { ...c, ref: c.id === src.id ? nextBaseRef : c.ref, state: nextState }
            }),
            clone,
          ],
          selectedComponentIds: [clone.id],
          selectionGroups: groupIds(s.selectionGroups, 'schematic', memberIds, nanoid(8)) ?? s.selectionGroups,
          dirty: true,
        }))
        if (clone.railId && clone.railOffsetMm === undefined) get().snapToRails([clone.id])
        get().pushEvent('info', `Borne ${clone.ref} adicionado e agrupado na régua ${parseTerminalRef(clone.ref).prefix}${rail ? ` (${rail.ref})` : ''}.`)
        recomputeIfActive()
        return
      }

      // Régua múltipla: duplica todos os bornes como uma nova régua agrupada (ex.: X1.* → X2.*).
      const ordered = [...selectedSources].sort((a, b) => (a.railOffsetMm ?? a.schematicX) - (b.railOffsetMm ?? b.schematicX))
      const lead = ordered[0]
      const tail = ordered[ordered.length - 1]
      const leadParsed = parseTerminalRef(lead.ref)
      const newPrefix = nextFreeStripPrefix(stateBefore.components.map((c) => c.ref), leadParsed.family === 'PE' ? 'X' : leadParsed.family)
      const newSid = nanoid(6)
      const rail = tail.railId ? stateBefore.components.find((r) => r.id === tail.railId) : undefined
      const railMax = rail ? clampRailLengthMm(rail.state.lengthMm) : null
      let cursorX = tail.schematicX + tail.w + 18
      let cursorMm = tail.railId && typeof tail.railOffsetMm === 'number'
        ? tail.railOffsetMm + terminalMemberWidthMm(tail) + 10
        : null
      const usedRefs = new Set(stateBefore.components.map((c) => c.ref))
      const clones: ElectricalComponent[] = []
      ordered.forEach((src, idx) => {
        const sp = parseTerminalRef(src.ref)
        const sep = sp.sep || '.'
        const suffix = sp.hierarchical && sp.suffix ? sp.suffix : src.type === 'terminalPE' ? 'PE' : String(idx + 1)
        const ref = nextStripMemberRef(usedRefs, newPrefix, sep, suffix, 1)
        usedRefs.add(ref)
        const keepJumper = idx < ordered.length - 1 && !!src.state?.jumperNext
        const clone = cloneFromSource(src, ref, { stripId: newSid, jumperNext: keepJumper })
        const placed = placeStripCloneRight(
          clone,
          tail,
          cursorX,
          cursorMm,
          TERMINAL_STRIP_GAP_PX.hierarchical,
          [...stateBefore.components, ...clones],
          railMax,
        )
        clone.schematicX = placed.schematicX
        clone.schematicY = tail.schematicY
        if (placed.railOffsetMm !== undefined) clone.railOffsetMm = placed.railOffsetMm
        cursorX = placed.nextCursorX
        cursorMm = placed.nextCursorRailMm
        clones.push(clone)
      })
      const cloneIds = clones.map((c) => c.id)
      set((s) => ({
        components: [...s.components, ...clones],
        selectedComponentIds: cloneIds,
        selectionGroups: groupIds(s.selectionGroups, 'schematic', cloneIds, nanoid(8)) ?? s.selectionGroups,
        dirty: true,
      }))
      get().pushEvent('info', `Régua ${newPrefix} duplicada e agrupada (${clones.length} bornes${rail ? ` em ${rail.ref}` : ''}).`)
      recomputeIfActive()
      return
    }

    get().commitHistory()
    set((s) => {
      const clones: ElectricalComponent[] = []
      for (const id of allowedIds) {
        const src = s.components.find((c) => c.id === id)
        if (!src) continue
        const clone = createComponent(src.type, undefined, src.label, s.components.length + clones.length, src.schematicX + 30, src.schematicY + 30, JSON.parse(JSON.stringify(src.state)))
        clone.ref = nextRef([...s.components, ...clones], src.type)
        const topZ = nextTopZ([...s.components, ...clones], s.wires)
        clone.z = topZ
        clone.sheet = src.sheet
        clone.mirrored = src.mirrored
        clone.rotation = src.rotation
        if (src.catalog) clone.catalog = { ...src.catalog }
        clone.viewOrientation = componentOrientationOf(src)
        const sourceTerminalIndexes = new Map(src.terminals.map((terminal, index) => [terminal.id, index]))
        clone.terminalViewPositions = Object.fromEntries(Object.entries(src.terminalViewPositions ?? {}).map(([view, positions]) => [view,
          Object.fromEntries(Object.entries(positions).map(([terminalId, position]) => {
            const index = sourceTerminalIndexes.get(terminalId)
            return [index === undefined ? terminalId : `index:${index}`, { ...position }]
          })),
        ]))
        clone.terminals = clone.terminals.map((terminal, index) => {
          const source = src.terminals[index]
          return source ? {
            ...terminal,
            label: source.label,
            displayName: source.displayName,
            kind: source.kind,
            terminalType: source.terminalType,
            color: source.color,
            x: source.x,
            y: source.y,
            position3D: source.position3D ? { ...source.position3D } : undefined,
            pinned: source.pinned,
          } : terminal
        })
        clone.w = src.w
        clone.h = src.h
        clone.bodyColor = src.bodyColor
        clone.view3DScale = component3DScaleOf(src)
        clone.view3DRenderMode = src.view3DRenderMode ?? 'solid'
        clone.enclosureId = src.enclosureId
        clone.panel3DPosition = src.panel3DPosition
          ? { x: src.panel3DPosition.x + 0.35, y: src.panel3DPosition.y, z: src.panel3DPosition.z + 0.18 }
          : undefined
        const free = nearestFreeComponentPosition(clone, clone.schematicX, clone.schematicY, [...s.components, ...clones])
        clone.schematicX = free.x
        clone.schematicY = free.y
        clones.push(clone)
      }
      return { components: [...s.components, ...clones], selectedComponentIds: clones.map((c) => c.id), dirty: true }
    })
    recomputeIfActive()
  },

  duplicateWires: (ids) => {
    if (get().demoMode) return
    if (!ids.length) return
    get().commitHistory()
    set((s) => {
      const topZ = nextTopZ(s.components, s.wires)
      const clones = ids.flatMap((id) => {
        const wire = s.wires.find((w) => w.id === id)
        if (!wire) return []
        const clone = {
          ...wire,
          id: `wire_${nanoid(8)}`,
          number: wire.number ? `${wire.number}'` : undefined,
          fromTerminalId: wire.fromTerminalId,
          toTerminalId: wire.toTerminalId,
          fromPoint: wire.fromPoint ? { x: wire.fromPoint.x + 20, y: wire.fromPoint.y + 20 } : undefined,
          toPoint: wire.toPoint ? { x: wire.toPoint.x + 20, y: wire.toPoint.y + 20 } : undefined,
          z: topZ,
        }
        return [clone]
      })
      return { wires: [...s.wires, ...clones], selectedWireIds: clones.map((c) => c.id), selectedComponentIds: [], selectedWireId: null, dirty: true }
    })
    recomputeIfActive()
  },

  duplicateCanvasTexts: (ids) => {
    if (get().demoMode || !ids.length) return
    get().commitHistory()
    set((s) => ({ canvasTexts: [...s.canvasTexts, ...s.canvasTexts.filter((t) => ids.includes(t.id)).map((t) => ({ ...t, id: `ct_${nanoid(8)}`, x: t.x + 0.35, y: t.y - 0.18 }))], dirty: true }))
    recomputeIfActive()
  },

  duplicateCanvasNotes: (ids) => {
    if (get().demoMode || !ids.length) return
    get().commitHistory()
    set((s) => ({ canvasNotes: [...s.canvasNotes, ...s.canvasNotes.filter((n) => ids.includes(n.id)).map((n) => ({ ...n, id: `cn_${nanoid(8)}`, x: n.x + 0.35, y: n.y - 0.18, messages: [...(n.messages ?? [])] }))], dirty: true }))
    recomputeIfActive()
  },

  duplicateSelection: () => {
    const s = get()
    if (s.selectedComponentIds.length) s.duplicateComponents(s.selectedComponentIds)
    else {
      const ids = s.selectedWireIds?.length ? s.selectedWireIds : (s.selectedWireId ? [s.selectedWireId] : [])
      if (ids.length) s.duplicateWires(ids)
      else if ((s as { selectedCanvasTextIds?: string[] }).selectedCanvasTextIds?.length) s.duplicateCanvasTexts((s as { selectedCanvasTextIds?: string[] }).selectedCanvasTextIds!)
      else if ((s as { selectedCanvasNoteIds?: string[] }).selectedCanvasNoteIds?.length) s.duplicateCanvasNotes((s as { selectedCanvasNoteIds?: string[] }).selectedCanvasNoteIds!)
    }
  },

  updateComponent: (id, patch) => {
    get().commitHistory()
    const current = get().components.find((c) => c.id === id)
    // Calha: largura (Esquema) e comprimento (mm, usado no 3D) são a mesma grandeza.
    if (current && isDinRail(current) && (patch.w !== undefined || patch.state?.lengthMm !== undefined)) {
      const mm = patch.state?.lengthMm !== undefined ? Number(patch.state.lengthMm) : Number(patch.w) / SCHEMATIC_PX_PER_MM
      const geometry = resizeRailGeometry(current, mm, 'left')
      const { w: _w, state: _state, ...rest } = patch
      get().updateComponentRaw(id, { ...rest, w: geometry.w, state: { ...current.state, ...(patch.state ?? {}), lengthMm: geometry.length } })
      return
    }
    get().updateComponentRaw(id, patch)
    // Se a TAG de um borne mudar de prefixo (ex.: X1.4 → X2 ou X1.4 → X2.1), solta-o de X1 e agrupa-o com X2 se existir.
    if (current && typeof patch.ref === 'string' && patch.ref !== current.ref && isTerminalStripType(current.type)) {
      const s = get()
      const updated = s.components.find((c) => c.id === id)
      if (updated && !updated.state?.stripUngrouped) {
        const oldP = parseTerminalRef(current.ref)
        const newP = parseTerminalRef(updated.ref)
        const prefixChanged = oldP.prefix.toUpperCase() !== newP.prefix.toUpperCase()
        const cleaned = prefixChanged
          ? s.components.map((c) => {
              if (c.id !== id) return c
              const nextSt: Record<string, any> = { ...c.state }
              delete nextSt.stripId
              return { ...c, state: nextSt }
            })
          : s.components
        const baseGroups = prefixChanged ? (ungroupIds(s.selectionGroups, 'schematic', [id]) ?? s.selectionGroups) : s.selectionGroups
        if (newP.hierarchical) {
          const synced = syncAutoTerminalStripGroups(cleaned, baseGroups, [id])
          if (prefixChanged || synced.changed) {
            set({ components: synced.components, selectionGroups: synced.selectionGroups, dirty: true })
          }
        } else if (prefixChanged) {
          set({ components: cleaned, selectionGroups: baseGroups, dirty: true })
        }
      }
    }
  },

  updateComponentRaw: (id, patch) => {
    const current = get().components.find((component) => component.id === id)
    const safePatch: Partial<ElectricalComponent> = { ...patch }
    if (current && (patch.schematicX !== undefined || patch.schematicY !== undefined || patch.w !== undefined || patch.h !== undefined || patch.rotation !== undefined)) {
      const candidate = { ...current, ...patch }
      if (!componentPositionIsFree(candidate, candidate.schematicX, candidate.schematicY, get().components, new Set([id]))) {
        delete safePatch.schematicX
        delete safePatch.schematicY
        delete safePatch.w
        delete safePatch.h
        delete safePatch.rotation
        if (isDinRail(current) && (patch.w !== undefined || patch.schematicX !== undefined)) delete safePatch.state
        // Quadro/calha técnica: as medidas (mm) só mudam com o footprint, nunca uma sem a outra.
        if (isPanelAccessoryType(current.type) && (patch.w !== undefined || patch.h !== undefined)) delete safePatch.state
        get().pushEvent('warning', `${current.ref} manteve a geometria anterior para não entrar noutro componente.`)
      }
    }
    set((s) => {
      let components = s.components.map((c) => (c.id === id ? { ...c, ...safePatch } : c))
      const rail = components.find((c) => c.id === id)
      // Mudou a calha (tamanho/posição): equipamentos fixos acompanham ou ficam dentro dela.
      if (rail && isDinRail(rail) && (safePatch.w !== undefined || safePatch.schematicX !== undefined || safePatch.state !== undefined)) {
        const patches = reflowRailChildren(rail, components)
        if (patches.size) components = components.map((c) => (patches.has(c.id) ? { ...c, ...patches.get(c.id)! } : c))
      }
      return { components, dirty: true }
    })
    recomputeIfActive()
  },

  moveComponent: (id, x, y, movingIds) => {
    // Demonstração e simulação em curso: utilizadores não movem componentes.
    if (get().demoMode) return
    const run = get().sim.runState
    if (run === 'running' || run === 'paused') return
    set((s) => {
      const moved = s.components.find((component) => component.id === id)
      if (!moved) return {}
      const groupIds = new Set(movingIds?.length ? movingIds : [id])
      // Quadro: leva consigo o que está dentro do contorno (calhas, aparelhos, calhas técnicas).
      const enclosures = s.components.filter((component) => component.type === 'panelEnclosure' && groupIds.has(component.id))
      if (enclosures.length) for (const member of enclosureDragMembers(enclosures, s.components)) groupIds.add(member)
      // A calha e os seus equipamentos são um grupo físico durante o arrasto.
      for (const component of s.components) {
        if (component.railId && groupIds.has(component.railId)) groupIds.add(component.id)
      }
      // O quadro e os aparelhos marcados como «dentro» movem-se juntos.
      for (const component of s.components) {
        if (component.enclosureId && groupIds.has(component.enclosureId)) groupIds.add(component.id)
      }
      // Aparelhos montados na face do quadro (porta/laterais) movem-se com o quadro.
      for (const component of s.components) {
        if (component.panelMount?.enclosureId && groupIds.has(component.panelMount.enclosureId)) groupIds.add(component.id)
      }
      // O relé térmico encaixado acompanha o contactor (e o contactor que acompanha a calha).
      for (const component of s.components) {
        if (component.mountedOn && groupIds.has(component.mountedOn)) groupIds.add(component.id)
      }
      const desiredDx = x - moved.schematicX
      const desiredDy = y - moved.schematicY
      let dx = desiredDx
      let dy = desiredDy
      const constrain = (desired: number, candidate: number) => desired >= 0 ? Math.min(desired, candidate) : Math.max(desired, candidate)
      for (const component of s.components) {
        if (!groupIds.has(component.id)) continue
        const resolved = resolveComponentMove(
          component,
          component.schematicX + desiredDx,
          component.schematicY + desiredDy,
          s.components,
          groupIds,
        )
        dx = constrain(dx, resolved.x - component.schematicX)
        dy = constrain(dy, resolved.y - component.schematicY)
      }
      if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) return {}

      // Se ativado o modo "soltar cabos ao arrastar", desliga os cabos antes do movimento
      let nextWires = s.wires
      if (s.detachWiresOnDrag && groupIds.size) {
        const terminalToComp = new Map<string, { comp: ElectricalComponent; term: Terminal }>()
        for (const c of s.components) {
          if (!groupIds.has(c.id)) continue
          for (const t of c.terminals) terminalToComp.set(t.id, { comp: c, term: t })
        }
        if (terminalToComp.size > 0) {
          nextWires = nextWires.map((w) => {
            let fromTerm = w.fromTerminalId
            let toTerm = w.toTerminalId
            let fromPt = w.fromPoint
            let toPt = w.toPoint
            if (fromTerm && terminalToComp.has(fromTerm)) {
              const { comp, term } = terminalToComp.get(fromTerm)!
              fromPt = { x: Math.round(comp.schematicX + term.x * comp.w), y: Math.round(comp.schematicY + term.y * comp.h) }
              fromTerm = ''
            }
            if (toTerm && terminalToComp.has(toTerm)) {
              const { comp, term } = terminalToComp.get(toTerm)!
              toPt = { x: Math.round(comp.schematicX + term.x * comp.w), y: Math.round(comp.schematicY + term.y * comp.h) }
              toTerm = ''
            }
            return (fromTerm !== w.fromTerminalId || toTerm !== w.toTerminalId)
              ? { ...w, fromTerminalId: fromTerm, toTerminalId: toTerm, fromPoint: fromPt, toPoint: toPt }
              : w
          })
        }
      }

      const wires = enclosures.length ? shiftGroupWires(nextWires, s.components, groupIds, dx, dy) : (nextWires !== s.wires ? nextWires : null)
      const enclosureById = new Map(s.components.filter((c) => c.type === 'panelEnclosure').map((c) => [c.id, c]))
      return {
        components: s.components.map((component) => {
          if (!groupIds.has(component.id)) return component
          const nextX = component.schematicX + dx
          const nextY = component.schematicY + dy
          let nextEnclosureId = component.enclosureId
          // Se o elemento foi arrastado para fora do quadro a que pertencia (sem arrastar o quadro), desvincula-o automaticamente.
          if (nextEnclosureId && !groupIds.has(nextEnclosureId)) {
            const parent = enclosureById.get(nextEnclosureId)
            if (parent) {
              const cx = nextX + component.w / 2
              const cy = nextY + component.h / 2
              const stillInside = cx >= parent.schematicX && cx <= parent.schematicX + parent.w
                && cy >= parent.schematicY && cy <= parent.schematicY + parent.h
              if (!stillInside) nextEnclosureId = undefined
            }
          }
          return {
            ...component,
            schematicX: nextX,
            schematicY: nextY,
            ...(nextEnclosureId !== component.enclosureId ? { enclosureId: nextEnclosureId } : {}),
          }
        }),
        ...(wires ? { wires } : {}),
        dirty: true,
      }
    })
  },

  nudgeSelection: (dx, dy) => {
    if (!dx && !dy) return
    if (get().demoMode) return
    const run = get().sim.runState
    if (run === 'running' || run === 'paused') return
    const { selectedComponentIds, selectedWireId, selectedWireIds, components, wires } = get()
    const movingIds = selectedComponentIds.filter((id) => !components.find((component) => component.id === id)?.locked)
    if (movingIds.length) {
      const anchor = components.find((component) => component.id === movingIds[0])
      if (!anchor) return
      get().commitHistory()
      get().moveComponent(anchor.id, anchor.schematicX + dx, anchor.schematicY + dy, movingIds)
      return
    }
    const wireIds = selectedWireIds?.length ? selectedWireIds : (selectedWireId ? [selectedWireId] : [])
    if (!wireIds.length) return
    const shift = (point?: { x: number; y: number }) => (point ? { x: point.x + dx, y: point.y + dy } : undefined)
    let moved = false
    get().commitHistory()
    for (const wid of wireIds) {
      const wire = wires.find((item) => item.id === wid)
      if (!wire) continue
      const patch: Partial<typeof wire> = {}
      if (wire.fromPoint) { patch.fromPoint = shift(wire.fromPoint); patch.fromPoint3D = undefined; moved = true }
      if (wire.toPoint) { patch.toPoint = shift(wire.toPoint); patch.toPoint3D = undefined; moved = true }
      if (wire.waypoints?.length) { patch.waypoints = wire.waypoints.map((point) => ({ ...point, x: point.x + dx, y: point.y + dy })); moved = true }
      if (Object.keys(patch).length) get().updateWire(wid, patch)
    }
  },

  setRailLength: (id, lengthMm, anchor = 'left', commit = true) => {
    const rail = get().components.find((c) => c.id === id)
    if (!rail || !isDinRail(rail)) return
    const children = get().components.filter((component) => component.railId === id)
    const occupiedMm = children.reduce((sum, component) => sum + railSpanMm(component), 0)
      + Math.max(0, children.length - 1) * (4 / SCHEMATIC_PX_PER_MM)
    const safeLengthMm = Math.max(lengthMm, occupiedMm)
    if (safeLengthMm > lengthMm + 0.01) get().pushEvent('warning', 'A calha manteve espaço suficiente para não sobrepor os equipamentos montados.')
    const geometry = resizeRailGeometry(rail, safeLengthMm, anchor)
    if (geometry.length === clampRailLengthMm(rail.state.lengthMm) && geometry.w === rail.w && geometry.schematicX === rail.schematicX) return
    if (commit) get().commitHistory()
    get().updateComponentRaw(id, { w: geometry.w, schematicX: geometry.schematicX, state: { ...rail.state, lengthMm: geometry.length } })
  },

  snapToRails: (ids, commit = false) => {
    const state = get()
    const rails = state.components.filter(isDinRail)
    const targets = state.components.filter((c) => (isRailMountable(c) || isPlugInRelay(c)) && (!ids || ids.includes(c.id)))
    if (!targets.length) return 0
    if (commit) get().commitHistory()
    let fixed = 0
    let components = state.components
    for (const target of targets) {
      const current = components.find((c) => c.id === target.id)!
      if (isPlugInRelay(current)) {
        // Relé plug-in: nunca assenta diretamente na calha — encaixa na base undecal (Finder 90.23).
        const mount = findSocketMountTarget(current, components)
        if (mount) {
          fixed++
          // A chave de polarização impõe uma única orientação: repõe rotação/espelho ao encaixar.
          // O relé tapa a base no Esquema (fica por cima, como no quadro real).
          components = components.map((c) => (c.id === current.id ? { ...c, schematicX: mount.schematicX, schematicY: mount.schematicY, rotation: 0, mirrored: false, mountedOn: mount.socket.id, railId: undefined, railOffsetMm: undefined, panel3DPosition: undefined, z: (mount.socket.z ?? 0) + 1 } : c))
        } else if (current.mountedOn) {
          components = components.map((c) => (c.id === current.id ? { ...c, mountedOn: undefined } : c))
        }
        continue
      }
      if (isThermalRelay(current)) {
        const mount = findMountTarget(current, components)
        if (mount) {
          fixed++
          components = components.map((c) => (c.id === current.id ? { ...c, schematicX: mount.schematicX, schematicY: mount.schematicY, mountedOn: mount.contactor.id, railId: undefined, railOffsetMm: undefined, panel3DPosition: undefined } : c))
          continue
        }
        if (current.mountedOn) components = components.map((c) => (c.id === current.id ? { ...c, mountedOn: undefined } : c))
      }
      if (isCombBusbar(current)) {
        const mount = findCombMountTarget(current, components)
        if (mount) {
          fixed++
          components = components.map((c) => (c.id === current.id ? { ...c, schematicX: mount.schematicX, schematicY: mount.schematicY, mountedOn: mount.breaker.id, railId: undefined, railOffsetMm: undefined, panel3DPosition: undefined } : c))
          continue
        }
        if (current.mountedOn) components = components.map((c) => (c.id === current.id ? { ...c, mountedOn: undefined } : c))
      }
      if (isCombConnector(current)) {
        const mount = findCombConnectorMountTarget(current, components)
        if (mount) {
          fixed++
          components = components.map((c) => (c.id === current.id ? { ...c, schematicX: mount.schematicX, schematicY: mount.schematicY, mountedOn: mount.breaker.id, state: { ...c.state, mountedTerminal: mount.socketLabel }, railId: undefined, railOffsetMm: undefined, panel3DPosition: undefined } : c))
          continue
        }
        if (current.mountedOn) components = components.map((c) => (c.id === current.id ? { ...c, mountedOn: undefined, state: { ...c.state, mountedTerminal: undefined } } : c))
      }
      const hit = rails.length ? snapToRail(current, rails, components) : null
      if (hit) fixed++
      const rail = hit ? rails.find((r) => r.id === hit.railId) : undefined
      components = components.map((c) => {
        if (c.id !== target.id) return c
        if (!hit) return c.railId ? { ...c, railId: undefined, railOffsetMm: undefined } : c
        // Sobe acima da calha no empilhamento e limpa a posição 3D manual: passa a derivar da calha.
        const z = rail && typeof rail.z === 'number' && (typeof c.z !== 'number' || c.z <= rail.z) ? rail.z + 1 : c.z
        return { ...c, schematicX: hit.schematicX, schematicY: hit.schematicY, railId: hit.railId, railOffsetMm: hit.railOffsetMm, panel3DPosition: undefined, z }
      })
    }
    // Contactores que mudaram de sítio levam os relés encaixados; bornes do mesmo grupo agrupam-se automaticamente.
    const mounted = syncSocketMounted(syncCombMounted(syncMounted(components)))
    const terminalTargets = targets.filter((t) => isTerminalStripType(t.type)).map((t) => t.id)
    if (terminalTargets.length) {
      // Se um borne novo encostou fisicamente (≤ 4 mm) a uma régua existente na mesma calha DIN, junta-se a essa régua.
      let joined = mounted
      if (terminalTargets.length === 1) {
        const me = joined.find((c) => c.id === terminalTargets[0])
        if (me && me.railId && typeof me.railOffsetMm === 'number' && !me.state?.stripId && !me.state?.stripUngrouped) {
          const meW = terminalMemberWidthMm(me)
          const neighbor = joined.find((o) => {
            if (o.id === me.id || o.railId !== me.railId || typeof o.railOffsetMm !== 'number') return false
            if (!isTerminalStripType(o.type) || o.state?.stripUngrouped || Number(o.state?.poleCount ?? 1) > 1) return false
            const oW = terminalMemberWidthMm(o)
            const gapRight = me.railOffsetMm! - (o.railOffsetMm + oW)
            const gapLeft = o.railOffsetMm - (me.railOffsetMm! + meW)
            const touching = (gapRight >= -0.5 && gapRight <= 4.5) || (gapLeft >= -0.5 && gapLeft <= 4.5)
            if (!touching) return false
            // Junta automaticamente quando o vizinho já pertence a uma régua ou partilha a mesma família (ex.: X).
            if (typeof o.state?.stripId === 'string' && o.state.stripId) return true
            const mp = parseTerminalRef(me.ref)
            const op = parseTerminalRef(o.ref)
            return mp.family.toUpperCase() === op.family.toUpperCase() || me.type === 'terminalPE'
          })
          if (neighbor) {
            const sid = (typeof neighbor.state?.stripId === 'string' && neighbor.state.stripId) || nanoid(6)
            const np = parseTerminalRef(neighbor.ref)
            const mp = parseTerminalRef(me.ref)
            const used = joined.filter((c) => c.id !== me.id).map((c) => c.ref)
            const autoRef = np.hierarchical && !mp.hierarchical
              ? nextStripMemberRef(used, np.prefix, np.sep || '.', me.type === 'terminalPE' ? 'PE' : undefined, 1)
              : me.ref
            joined = joined.map((c) => {
              if (c.id === me.id) return { ...c, ref: autoRef, state: { ...c.state, stripId: sid } }
              if (c.id === neighbor.id && !c.state?.stripId) return { ...c, state: { ...c.state, stripId: sid } }
              return c
            })
          }
        }
      }
      const synced = syncAutoTerminalStripGroups(joined, get().selectionGroups, terminalTargets)
      set({ components: synced.components, selectionGroups: synced.selectionGroups, dirty: true })
      return fixed
    }
    set({ components: mounted, dirty: true })
    return fixed
  },

  detachFromRail: (ids) => {
    get().commitHistory()
    set((s) => ({
      components: s.components.map((c) => (ids.includes(c.id) && c.railId ? { ...c, railId: undefined, railOffsetMm: undefined } : c)),
      dirty: true,
    }))
  },

  detachWiresOnDrag: false,
  toggleDetachWiresOnDrag: () => set((s) => ({ detachWiresOnDrag: !s.detachWiresOnDrag })),

  detachWiresFromComponents: (ids) => {
    const state = get()
    if (state.demoMode || isSimEditLocked(state)) return
    const terminalToComp = new Map<string, { comp: ElectricalComponent; term: Terminal }>()
    for (const c of state.components) {
      if (!ids.includes(c.id)) continue
      for (const t of c.terminals) {
        terminalToComp.set(t.id, { comp: c, term: t })
      }
    }
    if (terminalToComp.size === 0) return

    get().commitHistory()
    let detachedCount = 0
    const nextWires = state.wires.map((w) => {
      let fromTerm = w.fromTerminalId
      let toTerm = w.toTerminalId
      let fromPt = w.fromPoint
      let toPt = w.toPoint
      let mutated = false

      if (fromTerm && terminalToComp.has(fromTerm)) {
        const { comp, term } = terminalToComp.get(fromTerm)!
        fromPt = {
          x: Math.round(comp.schematicX + term.x * comp.w),
          y: Math.round(comp.schematicY + term.y * comp.h),
        }
        fromTerm = ''
        mutated = true
      }
      if (toTerm && terminalToComp.has(toTerm)) {
        const { comp, term } = terminalToComp.get(toTerm)!
        toPt = {
          x: Math.round(comp.schematicX + term.x * comp.w),
          y: Math.round(comp.schematicY + term.y * comp.h),
        }
        toTerm = ''
        mutated = true
      }
      if (mutated) {
        detachedCount++
        return {
          ...w,
          fromTerminalId: fromTerm,
          toTerminalId: toTerm,
          fromPoint: fromPt,
          toPoint: toPt,
        }
      }
      return w
    })

    if (detachedCount > 0) {
      set({ wires: normalizeWires(nextWires, state.components), dirty: true })
      get().pushEvent('info', `${detachedCount} ligação(ões) de cabo solta(s). O equipamento pode agora ser movido livremente.`)
    }
  },

  assignToEnclosure: (ids, enclosureId) => {
    const enclosure = get().components.find((c) => c.id === enclosureId && c.type === 'panelEnclosure')
    if (!enclosure) {
      get().pushEvent('warning', 'Quadro não encontrado.')
      return
    }
    get().commitHistory()
    set((s) => ({
      components: s.components.map((c) => (ids.includes(c.id) && c.id !== enclosureId ? { ...c, enclosureId, panelMount: undefined } : c)),
      dirty: true,
    }))
  },

  detachFromEnclosure: (ids) => {
    get().commitHistory()
    set((s) => ({
      components: s.components.map((c) => (ids.includes(c.id) && c.enclosureId ? { ...c, enclosureId: undefined } : c)),
      dirty: true,
    }))
  },

  mountOnPanel: (ids, enclosureId, face = 'door') => {
    const enclosure = get().components.find((c) => c.id === enclosureId && c.type === 'panelEnclosure')
    if (!enclosure) { get().pushEvent('warning', 'Quadro não encontrado.'); return }
    get().commitHistory()
    set((s) => ({
      components: s.components.map((c) => (ids.includes(c.id) && c.id !== enclosureId ? { ...c, panelMount: { enclosureId, face, offsetXmm: c.panelMount?.offsetXmm, offsetYmm: c.panelMount?.offsetYmm, cutoutMm: c.panelMount?.cutoutMm ?? 22 }, enclosureId: undefined } : c)),
      dirty: true,
    }))
  },
  updatePanelMount: (ids, patch) => {
    get().commitHistory()
    set((s) => ({
      components: s.components.map((c) => (ids.includes(c.id) && c.panelMount ? { ...c, panelMount: { ...c.panelMount!, ...patch } as import('../types').PanelMount } : c)),
      dirty: true,
    }))
  },
  unmountFromPanel: (ids) => {
    get().commitHistory()
    set((s) => ({
      components: s.components.map((c) => (ids.includes(c.id) && c.panelMount ? { ...c, panelMount: undefined } : c)),
      dirty: true,
    }))
  },
  addDecal: (componentId, decal) => {
    const target = get().components.find((c) => c.id === componentId)
    if (!target || target.locked || isSimEditLocked(get())) return
    get().commitHistory()
    const id = decal.id ?? `decal-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`
    const next: import('../types').ComponentDecal = {
      id,
      kind: decal.kind ?? 'text',
      face: decal.face ?? 'front',
      offsetXmm: decal.offsetXmm ?? 0,
      offsetYmm: decal.offsetYmm ?? 0,
      widthMm: decal.widthMm ?? 30,
      heightMm: decal.heightMm ?? 15,
      rotationDeg: decal.rotationDeg ?? 0,
      text: decal.text ?? 'Q1',
      icon: decal.icon,
      background: decal.background ?? '#facc15',
      color: decal.color ?? '#0f172a',
      fontSizeMm: decal.fontSizeMm ?? 4,
      border: decal.border ?? true,
      imageUrl: (decal as any).imageUrl,
      stickerId: decal.stickerId,
      imageAspectRatio: decal.imageAspectRatio,
      keepAspectRatio: decal.keepAspectRatio,
    }
    set((s) => ({
      components: s.components.map((c) => (c.id === componentId ? { ...c, decals: [...(c.decals ?? []), next] } : c)),
      dirty: true,
      selectedDecal: { componentId, decalId: next.id },
      selectedComponentIds: [componentId], selectedWireId: null, selectedWireIds: [], selectedTerminalId: null,
    }))
  },
  updateDecal: (componentId, decalId, patch) => {
    const target = get().components.find((c) => c.id === componentId)
    if (!target || target.locked || isSimEditLocked(get()) || !target.decals?.some((d) => d.id === decalId)) return
    const safePatch = { ...patch }
    for (const field of ['offsetXmm', 'offsetYmm', 'rotationDeg', 'widthMm', 'heightMm', 'fontSizeMm', 'imageAspectRatio'] as const) {
      const value = safePatch[field]
      if (value !== undefined && (!Number.isFinite(value) || (['widthMm', 'heightMm', 'fontSizeMm', 'imageAspectRatio'].includes(field) && value <= 0))) delete safePatch[field]
    }
    if (!Object.keys(safePatch).length) return
    if (shouldCommitGroupedEdit(`decal:${componentId}:${decalId}:${Object.keys(safePatch).sort().join(',')}`)) get().commitHistory()
    set((s) => ({
      components: s.components.map((c) => (c.id === componentId ? { ...c, decals: c.decals!.map((d) => (d.id === decalId ? { ...d, ...safePatch } : d)) } : c)),
      dirty: true,
    }))
  },
  removeDecal: (componentId, decalId) => {
    const target = get().components.find((c) => c.id === componentId)
    if (!target || target.locked || isSimEditLocked(get()) || !target.decals?.some((d) => d.id === decalId)) return
    get().cancelDecalMove()
    get().commitHistory()
    set((s) => ({
      components: s.components.map((c) => (c.id === componentId ? { ...c, decals: (c.decals ?? []).filter((d) => d.id !== decalId) } : c)),
      dirty: true,
      selectedDecal: s.selectedDecal?.componentId === componentId && s.selectedDecal.decalId === decalId ? null : s.selectedDecal,
    }))
  },

  selectDecal: (componentId, decalId) => {
    get().cancelDecalMove()
    if (!decalId) { set({ selectedDecal: null }); return }
    const owner = get().components.find((item) => item.id === componentId)
    if (!owner || owner.locked || isSimEditLocked(get()) || !owner.decals?.some((item) => item.id === decalId)) return
    set({ selectedDecal: { componentId, decalId }, selectedComponentIds: [componentId], selectedWireId: null, selectedWireIds: [], selectedTerminalId: null, viewOrientationEditor: null })
  },
  beginDecalMove: () => {
    const state = get(), selection = state.selectedDecal
    if (!selection || state._decalMove || isSimEditLocked(state)) return
    const owner = state.components.find((item) => item.id === selection.componentId)
    const decal = owner?.decals?.find((item) => item.id === selection.decalId)
    if (!owner || owner.locked || !decal) return
    set({ _decalMove: { ...selection, x: decal.offsetXmm ?? 0, y: decal.offsetYmm ?? 0, before: snapshot(state), dirty: state.dirty } })
  },
  moveSelectedDecal: (dxMm, dyMm) => {
    const state = get(), gesture = state._decalMove
    if (!gesture || !Number.isFinite(dxMm) || !Number.isFinite(dyMm) || isSimEditLocked(state)) return
    const owner = state.components.find((item) => item.id === gesture.componentId)
    if (!owner || owner.locked || state.selectedDecal?.decalId !== gesture.decalId) return
    set({ components: state.components.map((item) => item.id === owner.id ? { ...item, decals: item.decals?.map((decal) => decal.id === gesture.decalId ? { ...decal, offsetXmm: Math.round((gesture.x + dxMm) * 100) / 100, offsetYmm: Math.round((gesture.y + dyMm) * 100) / 100 } : decal) } : item), dirty: true })
  },
  endDecalMove: () => {
    const state = get(), gesture = state._decalMove
    if (!gesture) return
    if (isSimEditLocked(state) || state.components.find((item) => item.id === gesture.componentId)?.locked) { get().cancelDecalMove(); return }
    const decal = state.components.find((item) => item.id === gesture.componentId)?.decals?.find((item) => item.id === gesture.decalId)
    const changed = decal && ((decal.offsetXmm ?? 0) !== gesture.x || (decal.offsetYmm ?? 0) !== gesture.y)
    set({ _decalMove: null, ...(changed ? { history: [...state.history.slice(-49), gesture.before], future: [] } : {}) })
    resetGroupedEdit()
  },
  cancelDecalMove: () => {
    const state = get(), gesture = state._decalMove
    if (!gesture) return
    const components = state.components.map((item) => item.id === gesture.componentId ? { ...item, decals: item.decals?.map((decal) => decal.id === gesture.decalId ? { ...decal, offsetXmm: gesture.x, offsetYmm: gesture.y } : decal) } : item)
    const restored = snapshot({ ...state, components })
    set({ components, _decalMove: null, dirty: JSON.stringify(restored) === JSON.stringify(gesture.before) ? gesture.dirty : state.dirty })
  },
  addPanelHole: (enclosureId, hole) => {
    const target = get().components.find((c) => c.id === enclosureId)
    if (!target || target.type !== 'panelEnclosure') return
    get().commitHistory()
    const id = hole.id ?? `hole-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,5)}`
    const next: import('../types').EnclosureHole = {
      id,
      face: (hole.face as any) ?? 'bottom',
      offsetXmm: hole.offsetXmm ?? 0,
      offsetYmm: hole.offsetYmm ?? 0,
      diameterMm: hole.diameterMm ?? 20,
      glandType: hole.glandType,
      occupiedBy: hole.occupiedBy,
    }
    const holes = [...((target.state as any).holes ?? []), next]
    set((s) => ({ components: s.components.map((c) => c.id === enclosureId ? { ...c, state: { ...c.state, holes } } : c), dirty: true }))
  },
  updatePanelHole: (enclosureId, holeId, patch) => {
    get().commitHistory()
    set((s) => ({ components: s.components.map((c) => {
      if (c.id !== enclosureId) return c
      const holes = ((c.state as any).holes ?? []).map((h: any) => h.id === holeId ? { ...h, ...patch } : h)
      return { ...c, state: { ...c.state, holes } }
    }), dirty: true }))
  },
  removePanelHole: (enclosureId, holeId) => {
    get().commitHistory()
    set((s) => ({ components: s.components.map((c) => c.id === enclosureId ? { ...c, state: { ...c.state, holes: ((c.state as any).holes ?? []).filter((h: any) => h.id !== holeId) } } : c), dirty: true }))
  },

  rotateComponent: (id) => {
    const current = get().components.find((component) => component.id === id)
    if (!current) return
    const candidate = { ...current, rotation: ((current.rotation + 90) % 360) as number }
    if (!componentPositionIsFree(candidate, candidate.schematicX, candidate.schematicY, get().components, new Set([id]))) {
      get().pushEvent('warning', `${current.ref} não pode rodar porque entraria noutro componente.`)
      return
    }
    get().commitHistory()
    set((s) => ({ components: s.components.map((component) => (component.id === id ? candidate : component)), dirty: true }))
    recomputeIfActive()
  },

  mirrorComponent: (id) => {
    get().commitHistory()
    set((s) => ({
      components: s.components.map((c) => (c.id === id ? { ...c, mirrored: !c.mirrored } : c)),
      dirty: true,
    }))
  },

  toggleLock: (id) => {
    if (get().demoMode) return
    get().commitHistory()
    set((s) => ({ components: s.components.map((c) => (c.id === id ? { ...c, locked: !c.locked } : c)), dirty: true }))
  },

  setComponentsLocked: (ids, locked) => {
    if (get().demoMode || !ids.length) return
    const targets = new Set(ids)
    if (!get().components.some((c) => targets.has(c.id) && Boolean(c.locked) !== locked)) return
    get().commitHistory()
    set((s) => ({ components: s.components.map((c) => (targets.has(c.id) ? { ...c, locked } : c)), dirty: true }))
  },

  deleteComponents: (ids) => {
    // Demonstração e simulação em curso: utilizadores não apagam componentes.
    if (get().demoMode) return
    const run = get().sim.runState
    if (run === 'running' || run === 'paused') {
      get().pushEvent('warning', 'Não é possível apagar componentes enquanto a simulação está a correr ou em pausa.')
      return
    }
    get().commitHistory()
    set((s) => {
      const remaining = s.components.filter((c) => !ids.includes(c.id))
      const deadTerminals = new Set(s.components.filter((c) => ids.includes(c.id)).flatMap((c) => c.terminals.map((t) => t.id)))
      const wires = normalizeWires(s.wires.filter((w) => !deadTerminals.has(w.fromTerminalId) && !deadTerminals.has(w.toTerminalId)), s.components)
      const living = remaining.filter(isProgrammablePlc)
      const programs = programsForSave(s.plcPrograms, s.activePlcId, s.ladder.rungs, s.fcBlocks, s.fcAdded)
      const keptPrograms = Object.fromEntries(Object.entries(programs).filter(([id]) => living.some((p) => p.id === id)))
      const tags = { ...s.plcTags, ...(s.activePlcId ? { [s.activePlcId]: s.tags } : {}) }
      const keptTags = Object.fromEntries(Object.entries(tags).filter(([id]) => living.some((p) => p.id === id)))
      const nextId = living.some((p) => p.id === s.activePlcId) ? s.activePlcId : living[0]?.id ?? null
      const nextProgram = nextId && nextId !== s.activePlcId ? keptPrograms[nextId] ?? blankPlcProgram() : null
      return { components: remaining.map((c) => {
        let next = c
        if (c.railId && ids.includes(c.railId)) next = { ...next, railId: undefined, railOffsetMm: undefined }
        if (c.enclosureId && ids.includes(c.enclosureId)) next = { ...next, enclosureId: undefined }
        if (c.panelMount?.enclosureId && ids.includes(c.panelMount.enclosureId)) next = { ...next, panelMount: undefined }
        return next
      }), wires, selectedComponentIds: [], dirty: true,
        viewOrientationEditor: s.viewOrientationEditor && ids.includes(s.viewOrientationEditor.componentId) ? null : s.viewOrientationEditor,
        activePlcId: nextId, plcPrograms: keptPrograms, plcTags: keptTags,
        projectFiles: Object.fromEntries(Object.entries(s.projectFiles).filter(([id]) => id === '_general' || living.some((p) => p.id === id))),
        hiddenProjectFolders: Object.fromEntries(Object.entries(s.hiddenProjectFolders).filter(([id]) => id === '_general' || living.some((p) => p.id === id))),
        projectFolderLabels: Object.fromEntries(Object.entries(s.projectFolderLabels).filter(([id]) => id === '_general' || living.some((p) => p.id === id))),
        ...(nextProgram ? { tags: keptTags[nextId!] ?? [], ladder: { rungs: nextProgram.rungs }, fcBlocks: { fc1: nextProgram.fc1, fc2: nextProgram.fc2 }, fcAdded: fcPresentOf(nextProgram.fcAdded, nextProgram), history: [], future: [] } : {}),
      }
    })
    recomputeIfActive()
  },


  rotateComponents: (ids, deltaDeg) => {
    if (get().demoMode) return
    const run = get().sim.runState
    if (run === 'running' || run === 'paused') return
    const movable = ids.filter((id) => !get().components.find((item) => item.id === id)?.locked)
    if (!movable.length) return
    get().commitHistory()
    const moving = new Set(movable)
    for (const id of movable) {
      const current = get().components.find((item) => item.id === id)
      if (!current) continue
      const rotation = (((current.rotation + deltaDeg) % 360) + 360) % 360
      const candidate = { ...current, rotation }
      const others = get().components
      // Rodar troca largura por altura: se a nova caixa chocar com um vizinho,
      // procura-se o lugar livre mais perto em vez de recusar a rotação.
      if (componentPositionIsFree(candidate, current.schematicX, current.schematicY, others, moving)) {
        get().updateComponentRaw(id, { rotation })
        continue
      }
      const spot = nearestFreeComponentPosition(candidate, current.schematicX, current.schematicY, others.filter((item) => !moving.has(item.id)))
      get().updateComponentRaw(id, { rotation, schematicX: spot.x, schematicY: spot.y })
      if (spot.displaced) get().pushEvent('info', `${current.ref} rodou ${deltaDeg > 0 ? '+' : ''}${deltaDeg}° e afastou-se um pouco para não sobrepor outro componente.`)
    }
  },

  reorderComponents: (ids, where) => {
    if (!ids.length) return
    reorderSelection(get, set, where, ids)
  },

  selectComponents: (ids, additive = false) => {
    if (isSimEditLocked(get()) && ids.length) return
    get().cancelDecalMove()
    set((s) => {
      // Selecionar um componente agrupado traz consigo todo o grupo.
      const groups = new Set(ids.map((id) => s.components.find((item) => item.id === id)?.groupId).filter(Boolean) as string[])
      const expanded = groups.size ? [...new Set([...ids, ...s.components.filter((item) => item.groupId && groups.has(item.groupId)).map((item) => item.id)])] : ids
      return {
      selectedComponentIds: additive ? [...new Set([...s.selectedComponentIds, ...expanded])] : expanded,
      selectedDecal: null,
      selectedWireId: null,
      selectedWireIds: [],
      selectedTerminalId: null,
      viewOrientationEditor: s.viewOrientationEditor && !ids.includes(s.viewOrientationEditor.componentId) ? null : s.viewOrientationEditor,
      }
    })
  },

  /** Ctrl+G: junta os componentes selecionados num grupo. */
  // Mesmo mecanismo dos outros editores (grupos de seleção da vista «schematic», partilhada com o 3D).
  groupSelection: () => { get().groupItems('schematic', get().selectedComponentIds) },

  /** Ctrl+Shift+G: desfaz o grupo dos componentes selecionados. */
  ungroupSelection: () => { get().ungroupItems('schematic', get().selectedComponentIds) },

  selectWire: (id, additive = false) => {
    if (id && isSimEditLocked(get())) return
    if (!id) {
      set({ selectedWireId: null, selectedWireIds: [], selectedComponentIds: [], selectedTerminalId: null, viewOrientationEditor: null })
      return
    }
    set((s) => {
      let ids: string[]
      if (additive) {
        const setIds = new Set(s.selectedWireIds.length ? s.selectedWireIds : (s.selectedWireId ? [s.selectedWireId] : []))
        if (setIds.has(id)) setIds.delete(id)
        else setIds.add(id)
        ids = [...setIds]
      } else {
        ids = [id]
      }
      return {
        selectedWireId: ids.includes(id) ? id : (ids[0] ?? null),
        selectedWireIds: ids,
        selectedComponentIds: [],
        selectedTerminalId: null,
        viewOrientationEditor: null,
      }
    })
  },

  laceWires: (ids) => {
    if (get().demoMode || isSimEditLocked(get())) return
    const state = get()
    const selection = ids?.length
      ? ids
      : (state.selectedWireIds.length ? state.selectedWireIds : (state.selectedWireId ? [state.selectedWireId] : []))
    const target = selection.filter(id => state.wires.some(w => w.id === id && !w.locked))
    if (target.length < 2) {
      state.pushEvent('info', 'Selecione pelo menos dois cabos desbloqueados (Shift+clique) para filaçar.')
      return
    }
    const existing = state.wires.find((w) => target.includes(w.id) && w.bundleId)?.bundleId
    const bundleId = existing ?? `bundle-${nanoid(8)}`
    state.commitHistory()
    set((s) => ({
      wires: s.wires.map((w) => (target.includes(w.id) ? { ...w, bundleId } : w)),
      dirty: true,
    }))
    get().pushEvent('info', `${target.length} cabos filaçados no chicote ${bundleId}.`)
  },

  lacePairWires: () => {
    const state = get()
    if (state.demoMode || isSimEditLocked(state)) return
    const next = lacePairBundles(state.components, state.wires, { skip: (w) => (w.endType === 'probe' || w.fromEndType === 'probe' || w.toEndType === 'probe') })
    const changed = next.filter((w, i) => w.bundleId !== state.wires[i].bundleId)
    if (!changed.length) { state.pushEvent('info', 'Não há cabos por filaçar: precisa de 2+ cabos desbloqueados entre os mesmos dois aparelhos.'); return }
    state.commitHistory()
    set({ wires: next, dirty: true })
    state.pushEvent('info', `${changed.length} cabos filaçados em ${new Set(changed.map((w) => w.bundleId)).size} chicote(s) · Ctrl+Z desfaz.`)
  },

  unlaceWires: (ids) => {
    if (get().demoMode || isSimEditLocked(get())) return
    const state = get()
    const target = ids?.length
      ? ids
      : (state.selectedWireIds.length ? state.selectedWireIds : (state.selectedWireId ? [state.selectedWireId] : []))
    if (!target.length) return
    const bundleIds = new Set(state.wires.filter((w) => !w.locked && target.includes(w.id) && w.bundleId).map((w) => w.bundleId!))
    if (!bundleIds.size) {
      state.pushEvent('info', 'Os cabos selecionados não estão filaçados.')
      return
    }
    state.commitHistory()
    set((s) => ({
      wires: s.wires.map((w) => (!w.locked && w.bundleId && bundleIds.has(w.bundleId) ? { ...w, bundleId: undefined } : w)),
      dirty: true,
    }))
    get().pushEvent('info', 'Chicote desfeito.')
  },

  selectTerminal: (id) => {
    if (id && isSimEditLocked(get())) return
    set({ selectedTerminalId: id, selectedWireId: null, selectedWireIds: [], selectedComponentIds: [], viewOrientationEditor: null })
  },

  addTerminal: (componentId) => {
    get().commitHistory()
    set((s) => ({
      components: s.components.map((c) => {
        if (c.id !== componentId) return c
        const n = c.terminals.length + 1
        const term = createTerminal(c.id, `X${n}`, 'io', 0.1 + (n % 5) * 0.15, n % 2 ? 0.85 : 0.15)
        return { ...c, terminals: [...c.terminals, term] }
      }),
      dirty: true,
    }))
  },

  updateTerminal: (terminalId, patch) => {
    const fields = Object.keys(patch).sort().join(',') || 'definition'
    if (shouldCommitGroupedEdit(`terminal:${terminalId}:${fields}`)) get().commitHistory()
    set((s) => ({
      components: s.components.map((c) => ({
        ...c,
        terminals: c.terminals.map((t) => (t.id === terminalId ? { ...t, ...patch } : t)),
      })),
      dirty: true,
    }))
    recomputeIfActive()
  },

  deleteTerminal: (terminalId) => {
    get().commitHistory()
    set((s) => ({
      components: s.components.map((c) => ({ ...c, terminals: c.terminals.filter((t) => t.id !== terminalId) })),
      wires: normalizeWires(s.wires.filter((w) => w.fromTerminalId !== terminalId && w.toTerminalId !== terminalId), s.components),
      selectedTerminalId: null,
      dirty: true,
    }))
    recomputeIfActive()
  },

  setBusbarPoleCount: (componentId, poleCount, nextBarsMode) => {
    const c = get().components.find((x) => x.id === componentId)
    if (!c || !isRealBusbarType(c.type)) return
    if (isCombBusbarType(c.type)) {
      get().updateCombBusbar(componentId, { poleCount })
      return
    }
    if (isCombConnectorType(c.type)) return
    const isAcrylic = isAcrylicBusbarType(c.type)
    const n = isAcrylic ? clampAcrylicBusbarPoles(poleCount) : clampSteppedBusbarHoles(poleCount)
    const mode = isAcrylic ? undefined : (nextBarsMode ?? steppedBarsModeOf(c.state))
    const nextState: Record<string, unknown> = {
      ...c.state,
      poleCount: n,
      ...(mode ? { barsMode: mode } : {}),
    }
    const specs = busbarTerminalSpecs(c.type, nextState)
    if (
      c.state.poleCount === n &&
      (!mode || steppedBarsModeOf(c.state) === mode) &&
      c.terminals.length === specs.length
    ) {
      return
    }
    get().commitHistory()
    const fp = busbarFootprintPx(c.type, nextState) ?? { w: c.w, h: c.h }
    const oldByLabel = new Map(c.terminals.map((t) => [t.label, t]))
    const newTerminals: Terminal[] = specs.map((spec) => {
      const existing = oldByLabel.get(spec.label)
      const clonedSocket = spec.socket3D
        ? { ...spec.socket3D, normal: [...spec.socket3D.normal] as [number, number, number], position: { ...spec.socket3D.position } }
        : undefined
      if (existing) {
        return {
          ...existing,
          displayName: spec.displayName,
          kind: spec.kind,
          terminalType: spec.terminalType,
          color: spec.color,
          diameter: spec.diameter,
          x: spec.x,
          y: spec.y,
          position3D: spec.position3D ? { ...spec.position3D } : undefined,
          socket3D: clonedSocket,
        }
      }
      return {
        id: `${c.id}-${spec.label}`,
        componentId: c.id,
        label: spec.label,
        displayName: spec.displayName,
        kind: spec.kind,
        terminalType: spec.terminalType,
        color: spec.color,
        diameter: spec.diameter,
        x: spec.x,
        y: spec.y,
        position3D: spec.position3D ? { ...spec.position3D } : undefined,
        socket3D: clonedSocket,
        energized: false,
      }
    })
    const keptIds = new Set(newTerminals.map((t) => t.id))
    const oldIds = new Set(c.terminals.map((t) => t.id))
    const nextWires = get().wires.filter((w) => {
      if (w.fromTerminalId && oldIds.has(w.fromTerminalId) && !keptIds.has(w.fromTerminalId)) return false
      if (w.toTerminalId && oldIds.has(w.toTerminalId) && !keptIds.has(w.toTerminalId)) return false
      return true
    })
    const cx = c.schematicX + c.w / 2
    const cy = c.schematicY + c.h / 2
    const nextComponents = get().components.map((item) => (
      item.id === c.id
        ? {
            ...item,
            w: fp.w,
            h: fp.h,
            schematicX: Math.round(cx - fp.w / 2),
            schematicY: Math.round(cy - fp.h / 2),
            terminals: newTerminals,
            state: nextState as ElectricalComponent['state'],
          }
        : item
    ))
    set({ components: nextComponents, wires: nextWires, dirty: true })
    recomputeIfActive()
  },

  setBusbarAcrylicColor: (componentId, hexColor) => {
    const c = get().components.find((x) => x.id === componentId)
    if (!c || c.type !== 'busbarPhaseAcrylic') return
    const clean = hexColor.trim()
    if (!/^#[0-9a-fA-F]{6}$/.test(clean) || c.state.acrylicColor === clean) return
    get().commitHistory()
    set((s) => ({
      components: s.components.map((item) => (
        item.id === c.id
          ? {
              ...item,
              state: { ...item.state, acrylicColor: clean },
              terminals: item.terminals.map((t) => ({ ...t, color: clean })),
            }
          : item
      )),
      dirty: true,
    }))
  },

  setBusbarWireEntryDirection: (componentId, direction) => {
    const c = get().components.find((x) => x.id === componentId)
    if (!c || !isAcrylicBusbarType(c.type)) return
    if (c.state.wireEntryDirection === direction) return
    get().commitHistory()
    const nextState: Record<string, unknown> = {
      ...c.state,
      wireEntryDirection: direction,
    }
    const specs = busbarTerminalSpecs(c.type, nextState)
    const oldByLabel = new Map(c.terminals.map((t) => [t.label, t]))
    const newTerminals: Terminal[] = specs.map((spec) => {
      const existing = oldByLabel.get(spec.label)
      const clonedSocket = spec.socket3D
        ? { ...spec.socket3D, normal: [...spec.socket3D.normal] as [number, number, number], position: { ...spec.socket3D.position } }
        : undefined
      if (existing) {
        return {
          ...existing,
          face: spec.face,
          x: spec.x,
          y: spec.y,
          position3D: spec.position3D ? { ...spec.position3D } : undefined,
          socket3D: clonedSocket,
        }
      }
      return {
        id: `${c.id}-${spec.label}`,
        componentId: c.id,
        label: spec.label,
        displayName: spec.displayName,
        kind: spec.kind,
        terminalType: spec.terminalType,
        color: spec.color,
        face: spec.face,
        diameter: spec.diameter,
        x: spec.x,
        y: spec.y,
        position3D: spec.position3D ? { ...spec.position3D } : undefined,
        socket3D: clonedSocket,
        energized: false,
      }
    })
    set((s) => ({
      components: s.components.map((item) => (
        item.id === c.id
          ? {
              ...item,
              state: nextState,
              terminals: newTerminals,
            }
          : item
      )),
      dirty: true,
    }))
  },

  updateCombBusbar: (componentId, patch) => {
    const c = get().components.find((x) => x.id === componentId)
    if (!c || !isCombBusbarType(c.type)) return
    const nextState: Record<string, unknown> = { ...c.state, ...patch }
    if ('poleCount' in patch) {
      const raw = Number(patch.poleCount)
      nextState.poleCount = Number.isFinite(raw) ? Math.max(2, Math.min(24, Math.round(raw))) : c.state.poleCount
    }
    const specs = busbarTerminalSpecs('busbarComb', nextState)
    const fp = busbarFootprintPx('busbarComb', nextState) ?? { w: c.w, h: c.h }
    get().commitHistory()
    const oldByLabel = new Map(c.terminals.map((t) => [t.label, t]))
    const newTerminals: Terminal[] = specs.map((spec) => {
      const existing = oldByLabel.get(spec.label)
      const clonedSocket = spec.socket3D
        ? { ...spec.socket3D, normal: [...spec.socket3D.normal] as [number, number, number], position: { ...spec.socket3D.position } }
        : undefined
      if (existing) {
        return {
          ...existing,
          displayName: spec.displayName,
          kind: spec.kind,
          terminalType: spec.terminalType,
          color: spec.color,
          diameter: spec.diameter,
          x: spec.x,
          y: spec.y,
          position3D: spec.position3D ? { ...spec.position3D } : undefined,
          socket3D: clonedSocket,
        }
      }
      return {
        id: `${c.id}-${spec.label}`,
        componentId: c.id,
        label: spec.label,
        displayName: spec.displayName,
        kind: spec.kind,
        terminalType: spec.terminalType,
        color: spec.color,
        diameter: spec.diameter,
        x: spec.x,
        y: spec.y,
        position3D: spec.position3D ? { ...spec.position3D } : undefined,
        socket3D: clonedSocket,
        energized: false,
      }
    })
    const keptIds = new Set(newTerminals.map((t) => t.id))
    const oldIds = new Set(c.terminals.map((t) => t.id))
    const nextWires = get().wires.filter((w) => {
      if (w.fromTerminalId && oldIds.has(w.fromTerminalId) && !keptIds.has(w.fromTerminalId)) return false
      if (w.toTerminalId && oldIds.has(w.toTerminalId) && !keptIds.has(w.toTerminalId)) return false
      return true
    })
    const cx = c.schematicX + c.w / 2
    const cy = c.schematicY + c.h / 2
    set((s) => ({
      components: s.components.map((item) => (
        item.id === c.id
          ? {
              ...item,
              w: fp.w,
              h: fp.h,
              schematicX: Math.round(cx - fp.w / 2),
              schematicY: Math.round(cy - fp.h / 2),
              terminals: newTerminals,
              state: nextState as ElectricalComponent['state'],
            }
          : item
      )),
      wires: nextWires,
      dirty: true,
    }))
    recomputeIfActive()
  },

  updateCombConnector: (componentId, patch) => {
    const c = get().components.find((x) => x.id === componentId)
    if (!c || !isCombConnectorType(c.type)) return
    const nextState: Record<string, unknown> = { ...c.state, ...patch }
    if (typeof nextState.connectorColor === 'string') {
      const clean = nextState.connectorColor.trim()
      if (/^#[0-9a-fA-F]{6}$/.test(clean)) nextState.connectorColor = clean.toLowerCase()
    }
    const specs = busbarTerminalSpecs('combBusbarConnector', nextState)
    const previousSpecs = busbarTerminalSpecs('combBusbarConnector', c.state)
    const samePoint = (a: Terminal['position3D'], b: Terminal['position3D']) => !!a && !!b
      && Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) < 2e-5
    get().commitHistory()
    const oldByLabel = new Map(c.terminals.map((t) => [t.label, t]))
    const newTerminals: Terminal[] = specs.map((spec) => {
      const existing = oldByLabel.get(spec.label), previous = previousSpecs.find(t => t.label === spec.label)
      if (existing && previous) {
        const socket = existing.socket3D, automatic = previous.socket3D
        const manualSocket = !!socket && (!automatic || !samePoint(socket.position, automatic.position)
          || socket.normal.some((n, i) => Math.abs(n - automatic.normal[i]) > 2e-5)
          || Math.abs(socket.diameterMm - automatic.diameterMm) > 1e-4
          || Math.abs(socket.depthMm - automatic.depthMm) > 1e-4
          || Math.abs(socket.insetMm - automatic.insetMm) > 1e-4)
        // Changing PA66 colour/gauge or the visible blade must not erase a
        // pinned/manual cable endpoint, authored socket or cable direction.
        if (existing.pinned || manualSocket || (existing.position3D && !samePoint(existing.position3D, previous.position3D))
          || (existing.face && existing.face !== previous.face)) return existing
      }
      const clonedSocket = spec.socket3D
        ? { ...spec.socket3D, normal: [...spec.socket3D.normal] as [number, number, number], position: { ...spec.socket3D.position } }
        : undefined
      return existing
        ? {
            ...existing,
            displayName: !existing.displayName || existing.displayName === previous?.displayName ? spec.displayName : existing.displayName,
            kind: spec.kind,
            terminalType: spec.terminalType,
            color: spec.color,
            diameter: spec.diameter,
            face: spec.face,
            x: spec.x,
            y: spec.y,
            position3D: spec.position3D ? { ...spec.position3D } : undefined,
            socket3D: clonedSocket,
          }
        : {
            id: `${c.id}-${spec.label}`,
            componentId: c.id,
            label: spec.label,
            displayName: spec.displayName,
            kind: spec.kind,
            terminalType: spec.terminalType,
            color: spec.color,
            diameter: spec.diameter,
            face: spec.face,
            x: spec.x,
            y: spec.y,
            position3D: spec.position3D ? { ...spec.position3D } : undefined,
            socket3D: clonedSocket,
            energized: false,
          }
    })
    set((s) => ({
      components: syncCombMounted(s.components.map((item) => (
        item.id === c.id
          ? { ...item, terminals: newTerminals, state: nextState as ElectricalComponent['state'] }
          : item
      ))),
      dirty: true,
    }))
    recomputeIfActive()
  },

  mountCombBusbar: (combId, breakerId) => {
    set((state) => {
      const comb = state.components.find((c) => c.id === combId)
      if (!comb || !isCombBusbar(comb)) return {}
      const targetBreaker = breakerId
        ? state.components.find((c) => c.id === breakerId && isBreaker(c))
        : findCombMountTarget(comb, state.components)?.breaker
      if (!targetBreaker) return {}
      const at = combMountPosition(comb, targetBreaker)
      if (!at) return {}
      const next = state.components.map((c) =>
        c.id === combId
          ? {
              ...c,
              schematicX: at.schematicX,
              schematicY: at.schematicY,
              mountedOn: targetBreaker.id,
              railId: undefined,
              railOffsetMm: undefined,
              panel3DPosition: undefined,
            }
          : c
      )
      return { components: syncCombMounted(next), dirty: true }
    })
    recomputeIfActive()
  },

  unmountCombBusbar: (combId) => {
    set((state) => {
      const next = state.components.map((c) => (c.id === combId ? { ...c, mountedOn: undefined } : c))
      return { components: next, dirty: true }
    })
    recomputeIfActive()
  },

  mountCombConnector: (connectorId, breakerId, socketLabel) => {
    set((state) => {
      const conn = state.components.find((c) => c.id === connectorId)
      if (!conn || !isCombConnector(conn)) return {}
      const targetBreaker = breakerId
        ? state.components.find((c) => c.id === breakerId && isBreaker(c))
        : findCombConnectorMountTarget(conn, state.components)?.breaker
      if (!targetBreaker) return {}
      const at = combConnectorMountPosition(conn, targetBreaker, socketLabel)
      if (!at) return {}
      const next = state.components.map((c) =>
        c.id === connectorId
          ? {
              ...c,
              schematicX: at.schematicX,
              schematicY: at.schematicY,
              mountedOn: targetBreaker.id,
              state: { ...c.state, mountedTerminal: at.socketLabel },
              railId: undefined,
              railOffsetMm: undefined,
              panel3DPosition: undefined,
            }
          : c
      )
      return { components: syncCombMounted(next), dirty: true }
    })
    recomputeIfActive()
  },

  unmountCombConnector: (connectorId) => {
    set((state) => {
      const next = state.components.map((c) =>
        c.id === connectorId
          ? { ...c, mountedOn: undefined, state: { ...c.state, mountedTerminal: undefined } }
          : c
      )
      return { components: next, dirty: true }
    })
    recomputeIfActive()
  },

  mountRelayOnSocket: (relayId, socketId) => {
    let mountedRef = ''
    set((state) => {
      const relay = state.components.find((c) => c.id === relayId)
      if (!relay || !isPlugInRelay(relay)) return {}
      const socket = socketId
        ? state.components.find((c) => c.id === socketId && isRelaySocket(c) && !state.components.some((o) => o.id !== relayId && o.mountedOn === c.id))
        : findSocketMountTarget(relay, state.components)?.socket
      if (!socket) return {}
      const at = relaySocketMountPosition(relay, socket)
      if (!at) return {}
      mountedRef = socket.ref
      const next = state.components.map((c) =>
        c.id === relayId
          ? {
              ...c,
              schematicX: at.schematicX,
              schematicY: at.schematicY,
              // A chave de polarização impõe uma única orientação de encaixe.
              rotation: 0,
              mirrored: false,
              mountedOn: socket.id,
              railId: undefined,
              railOffsetMm: undefined,
              panel3DPosition: undefined,
              z: (socket.z ?? 0) + 1,
            }
          : c
      )
      return { components: syncSocketMounted(next), dirty: true }
    })
    if (mountedRef) get().pushEvent('info', `${get().components.find((c) => c.id === relayId)?.ref ?? 'Relé'} encaixado na base ${mountedRef}: pinos 1–11 nos alvéolos P1–P11.`)
    // Montagem mecânica nunca inicia nem tira a simulação de STOP puro.
    // Só recalcula o scan se já estiver em RUN ou PAUSA (Play continua a ser a única forma de ativar).
    {
      const { runState } = get().sim
      if (runState === 'running' || runState === 'paused') get().step()
    }
  },

  unmountRelayFromSocket: (relayId) => {
    let moved = false
    set((state) => {
      const relay = state.components.find((c) => c.id === relayId)
      if (!relay || !isPlugInRelay(relay) || !relay.mountedOn) return {}
      moved = true
      // Retirado da base, o relé pousa livre logo por baixo dela (sem sobrepor outros aparelhos).
      const free = nearestFreeComponentPosition(relay, relay.schematicX, relay.schematicY + relay.h + 24, state.components)
      const next = state.components.map((c) => (c.id === relayId ? { ...c, mountedOn: undefined, schematicX: free.x, schematicY: free.y } : c))
      return { components: next, dirty: true }
    })
    if (moved) get().pushEvent('info', `${get().components.find((c) => c.id === relayId)?.ref ?? 'Relé'} desencaixado da base.`)
    // Desmontagem mecânica nunca inicia nem tira a simulação de STOP puro.
    {
      const { runState } = get().sim
      if (runState === 'running' || runState === 'paused') get().step()
    }
  },

  setTerminalPoleCount: (componentId, poleCount) => {
    const c = get().components.find((x) => x.id === componentId)
    if (!c || c.type !== 'terminalPhoenixPti6') return
    const n = Math.max(1, Math.min(48, Math.floor(Number(poleCount)) || 1))
    if ((c.state.poleCount ?? 1) === n && c.terminals.length === n * 2) return
    get().commitHistory()
    // gera novos templates e preserva cabos onde o rótulo coincide
    let templates: import('../electrical/factory').TerminalTemplate[] = []
    try {
      templates = pti6TerminalTemplates(n)
      const fp = pti6SchematicFootprint(n)
      const oldByLabel = new Map(c.terminals.map((t) => [t.label, t]))
      const newTerminals: import('../types').Terminal[] = templates.map((t) => {
        const existing = oldByLabel.get(t.label)
        if (existing) return { ...existing, x: t.x, y: t.y, position3D: t.position3D as any, socket3D: (t as any).socket3D, terminalType: t.terminalType as any, color: t.color as any, diameter: (t as any).diameter }
        return {
          id: `${c.id}-${t.label}`,
          componentId: c.id,
          label: t.label,
          kind: t.kind as any,
          terminalType: (t.terminalType as any) ?? 'spring',
          color: (t.color as any) ?? '#f59e0b',
          x: t.x, y: t.y,
          ...(t.position3D ? { position3D: { ...t.position3D } as any } : {}),
          ...((t as any).socket3D ? { socket3D: { ...(t as any).socket3D, normal: [...(t as any).socket3D.normal], position: { ...(t as any).socket3D.position } } } : {}),
          ...(t.diameter ? { diameter: t.diameter } : {}),
          energized: false,
        }
      })
      const keptLabels = new Set(templates.map((t) => t.label))
      const labelToNewId = new Map(newTerminals.map((t) => [t.label, t.id]))
      // wires whose endpoint label is no longer present are removed; others are remapped to new id
      const migratedWires = get().wires.flatMap((w) => {
        const fromOld = c.terminals.find((t) => t.id === w.fromTerminalId)
        const toOld = c.terminals.find((t) => t.id === w.toTerminalId)
        if (fromOld && !keptLabels.has(fromOld.label)) return []
        if (toOld && !keptLabels.has(toOld.label)) return []
        let fromId = w.fromTerminalId, toId = w.toTerminalId
        if (fromOld && labelToNewId.has(fromOld.label)) fromId = labelToNewId.get(fromOld.label)!
        if (toOld && labelToNewId.has(toOld.label)) toId = labelToNewId.get(toOld.label)!
        return [{ ...w, fromTerminalId: fromId, toTerminalId: toId }]
      })
      const nextComponents = get().components.map((comp) => comp.id === c.id ? { ...comp, w: fp.w, h: fp.h, terminals: newTerminals, state: { ...comp.state, poleCount: n } } : comp)
      const allTerminalIds = new Set(nextComponents.flatMap((comp) => comp.terminals.map((t) => t.id)))
      const finalWires = migratedWires.filter((w) => (!w.fromTerminalId || allTerminalIds.has(w.fromTerminalId) || (w as any).fromPoint) && (!w.toTerminalId || allTerminalIds.has(w.toTerminalId) || (w as any).toPoint))
      set({
        components: nextComponents,
        wires: finalWires as any,
        dirty: true,
      })
      get().pushEvent('info', `${c.ref}: régua atualizada para ${n} pólo(s) · ${n * 2} bornes.`)
      recomputeIfActive()
    } catch (e) {
      get().pushEvent('warning', `Falha ao atualizar pólos: ${String(e)}`)
    }
  },

  createTerminalStrip: (componentId, count, opts) => {
    const base = get().components.find((x) => x.id === componentId)
    if (!base || !isTerminalStripType(base.type)) return
    const n = Math.max(1, Math.min(48, Math.floor(Number(count)) || 1))
    if (n <= 1) { get().pushEvent('info', 'Defina pelo menos 2 bornes para gerar a régua.'); return }
    get().commitHistory()
    const hierarchical = !!opts?.hierarchical
    const startIndex: 0 | 1 = opts?.startIndex === 1 ? 1 : 0
    const existingStrip = terminalStripFor(get().components, base.id)
    const others = get().components.filter((c) => c.id !== base.id)
    const plan = planTerminalStripRefs(others.map((c) => c.ref), base.ref, n, hierarchical, startIndex)
    const gap = hierarchical ? TERMINAL_STRIP_GAP_PX.hierarchical : TERMINAL_STRIP_GAP_PX.loose
    const anchor = existingStrip && existingStrip.members.length > 1 && hierarchical
      ? existingStrip.members[existingStrip.members.length - 1]
      : base
    const rail = anchor.railId ? get().components.find((r) => r.id === anchor.railId) : undefined
    const railMax = rail ? clampRailLengthMm(rail.state.lengthMm) : null
    let cursor = anchor.schematicX + anchor.w + gap
    let cursorMm = anchor.railId && typeof anchor.railOffsetMm === 'number'
      ? anchor.railOffsetMm + terminalMemberWidthMm(anchor)
      : null
    const clones: ElectricalComponent[] = []
    for (const ref of plan.refs) {
      const cleanState: Record<string, any> = { ...base.state, poleCount: 1, jumperNext: false }
      delete cleanState.stripUngrouped
      delete cleanState.markerText
      const comp = createComponent(base.type, ref, base.label, 0, cursor, anchor.schematicY, cleanState)
      const placed = placeStripCloneRight(comp, anchor, cursor, cursorMm, gap, [...others, ...clones], railMax)
      comp.schematicX = placed.schematicX
      comp.schematicY = anchor.schematicY
      comp.sheet = anchor.sheet
      comp.z = anchor.z
      comp.bodyColor = base.bodyColor
      comp.railId = anchor.railId
      if (placed.railOffsetMm !== undefined) comp.railOffsetMm = placed.railOffsetMm
      comp.enclosureId = anchor.enclosureId
      clones.push(comp)
      cursor = placed.nextCursorX
      cursorMm = placed.nextCursorRailMm
    }
    const cloneIds = clones.map((c) => c.id)
    // Reutiliza o `stripId` da régua existente para manter todos os bornes do mesmo grupo unidos.
    const existingMemberIds = hierarchical && existingStrip ? existingStrip.members.map((m) => m.id) : [base.id]
    const stripId = (hierarchical && existingStrip?.explicitStripId) || (typeof base.state?.stripId === 'string' && base.state.stripId) || nanoid(6)
    for (const c of clones) c.state = { ...c.state, stripId }
    const memberSet = new Set(existingMemberIds)
    const allGroupIds = [...new Set([...existingMemberIds, ...cloneIds])]
    set((s) => ({
      components: [
        ...s.components.map((c) => {
          if (!memberSet.has(c.id)) return c
          const nextSt: Record<string, any> = { ...c.state, stripId }
          delete nextSt.stripUngrouped
          return { ...c, ref: c.id === base.id ? plan.baseRef : c.ref, state: nextSt }
        }),
        ...clones,
      ],
      selectedComponentIds: allGroupIds,
      selectionGroups: groupIds(s.selectionGroups, 'schematic', allGroupIds, nanoid(8)) ?? s.selectionGroups,
      dirty: true,
    }))
    if (anchor.railId && clones.some((c) => c.railOffsetMm === undefined)) get().snapToRails(cloneIds)
    get().pushEvent('info', `Régua criada e agrupada: ${describeTerminalStripRefs(plan, 6)} · ${allGroupIds.length} bornes encostados${anchor.railId ? ' na mesma calha' : ''}. Ctrl+Shift+G desagrupa.`)
    recomputeIfActive()
  },

  appendToTerminalStrip: (componentId, specs, opts) => {
    if (get().demoMode || isSimEditLocked(get())) return
    const state = get()
    const base = state.components.find((x) => x.id === componentId)
    if (!base || !isTerminalStripType(base.type) || !specs.length) return
    const strip = terminalStripFor(state.components, base.id)
    const members = strip?.members ?? [base]
    const tail = members[members.length - 1]
    const mode: StripNumberingMode = opts?.numbering
      ?? (members.some((m) => parseTerminalRef(m.ref).index === 0) ? 'hier0' : 'hier1')
    const baseParsed = parseTerminalRef(members[0].ref)
    const prefix = strip?.hierarchical ? strip.prefix : (baseParsed.family === 'PE' ? nextFreeStripPrefix(state.components.map((c) => c.ref), 'X') : baseParsed.prefix)
    const sep = strip?.sep || baseParsed.sep || '.'
    const startIdx: 0 | 1 = mode === 'hier0' ? 0 : 1
    const gap = mode === 'loose' ? TERMINAL_STRIP_GAP_PX.loose : TERMINAL_STRIP_GAP_PX.hierarchical
    const usedRefs = new Set(state.components.map((c) => c.ref))

    // Se havia apenas 1 borne simples `X1` e estamos em modo hierárquico, promove-o para `X1.1` (ou `X1.0`).
    let promotedBaseRef: string | null = null
    if (mode !== 'loose' && members.length === 1 && !baseParsed.hierarchical && base.type !== 'terminalPE') {
      const candidate = `${prefix}${sep}${startIdx}`
      if (!usedRefs.has(candidate)) {
        usedRefs.delete(base.ref)
        usedRefs.add(candidate)
        promotedBaseRef = candidate
      }
    }

    const sid = strip?.explicitStripId || (typeof tail.state?.stripId === 'string' && tail.state.stripId) || nanoid(6)
    const rail = tail.railId ? state.components.find((r) => r.id === tail.railId) : undefined
    const railMax = rail ? clampRailLengthMm(rail.state.lengthMm) : null
    let cursorX = tail.schematicX + tail.w + gap
    let cursorMm = tail.railId && typeof tail.railOffsetMm === 'number'
      ? tail.railOffsetMm + terminalMemberWidthMm(tail)
      : null
    const clones: ElectricalComponent[] = []
    for (const spec of specs.slice(0, 48)) {
      let ref: string
      if (mode === 'loose') {
        if (spec.type === 'terminalPE') {
          ref = nextRef([...state.components, ...clones], 'terminalPE')
        } else {
          const p = planTerminalStripRefs(usedRefs, prefix, 2, false)
          ref = p.refs[0] ?? nextRef([...state.components, ...clones], spec.type)
        }
      } else {
        ref = nextStripMemberRef(usedRefs, prefix, sep, spec.suffix, startIdx)
      }
      usedRefs.add(ref)
      const initState: Record<string, unknown> = {
        stripId: sid,
        ...(spec.type === 'terminalPhoenixPti6' ? { poleCount: 1 } : {}),
        ...(spec.markerText ? { markerText: spec.markerText } : {}),
        ...(spec.jumperNext ? { jumperNext: true } : {}),
      }
      const comp = createComponent(spec.type, ref, spec.label, 0, cursorX, tail.schematicY, initState)
      const placed = placeStripCloneRight(comp, tail, cursorX, cursorMm, gap, [...state.components, ...clones], railMax)
      comp.schematicX = placed.schematicX
      comp.schematicY = tail.schematicY
      comp.sheet = tail.sheet
      comp.z = tail.z
      if (spec.bodyColor) comp.bodyColor = spec.bodyColor
      comp.railId = tail.railId
      if (placed.railOffsetMm !== undefined) comp.railOffsetMm = placed.railOffsetMm
      comp.enclosureId = tail.enclosureId
      clones.push(comp)
      cursorX = placed.nextCursorX
      cursorMm = placed.nextCursorRailMm
    }
    if (!clones.length) return
    get().commitHistory()
    const memberSet = new Set(members.map((m) => m.id))
    const allIds = [...members.map((m) => m.id), ...clones.map((c) => c.id)]
    set((s) => ({
      components: [
        ...s.components.map((c) => {
          if (!memberSet.has(c.id)) return c
          const nextSt: Record<string, any> = { ...c.state, stripId: sid }
          delete nextSt.stripUngrouped
          return {
            ...c,
            ref: c.id === base.id && promotedBaseRef ? promotedBaseRef : c.ref,
            state: nextSt,
          }
        }),
        ...clones,
      ],
      selectedComponentIds: [clones[clones.length - 1].id],
      selectionGroups: groupIds(s.selectionGroups, 'schematic', allIds, nanoid(8)) ?? s.selectionGroups,
      dirty: true,
    }))
    if (tail.railId && clones.some((c) => c.railOffsetMm === undefined)) get().snapToRails(clones.map((c) => c.id))
    const tagSummary = clones.length === 1 ? clones[0].ref : `${clones[0].ref}…${clones[clones.length - 1].ref}`
    get().pushEvent('info', `${clones.length === 1 ? 'Borne adicionado' : `${clones.length} bornes adicionados`} à régua ${prefix}: ${tagSummary} (${allIds.length} no grupo).`)
    recomputeIfActive()
  },

  applyTerminalStripPreset: (componentId, presetId) => {
    if (get().demoMode || isSimEditLocked(get())) return
    const preset = TERMINAL_STRIP_PRESETS.find((p) => p.id === presetId)
    const state = get()
    const base = state.components.find((c) => c.id === componentId)
    if (!preset || !base || !isTerminalStripType(base.type)) return
    const strip = terminalStripFor(state.components, base.id)
    const baseWired = state.wires.some((w) => base.terminals.some((t) => w.fromTerminalId === t.id || w.toTerminalId === t.id))
    const firstSpec = preset.members[0]
    const canReuseBase = (!strip || strip.members.length === 1) && !baseWired && base.type === firstSpec.type && Number(base.state?.poleCount ?? 1) <= 1

    if (!canReuseBase) {
      // Já existem bornes/cabos: acrescenta o kit completo à direita sem apagar nenhuma ligação.
      get().appendToTerminalStrip(componentId, [...preset.members], { numbering: 'hier1' })
      return
    }

    get().commitHistory()
    const bp = parseTerminalRef(base.ref)
    const prefix = bp.family === 'PE'
      ? nextFreeStripPrefix(state.components.filter((c) => c.id !== base.id).map((c) => c.ref), 'X')
      : bp.prefix
    const sep = bp.sep || '.'
    const used = new Set(state.components.filter((c) => c.id !== base.id).map((c) => c.ref))
    const baseNewRef = nextStripMemberRef(used, prefix, sep, firstSpec.suffix, 1)
    used.add(baseNewRef)
    const sid = nanoid(6)
    const rail = base.railId ? state.components.find((r) => r.id === base.railId) : undefined
    const railMax = rail ? clampRailLengthMm(rail.state.lengthMm) : null
    let cursorX = base.schematicX + base.w + TERMINAL_STRIP_GAP_PX.hierarchical
    let cursorMm = base.railId && typeof base.railOffsetMm === 'number'
      ? base.railOffsetMm + terminalMemberWidthMm(base)
      : null
    const others = state.components.filter((c) => c.id !== base.id)
    const clones: ElectricalComponent[] = []
    for (const spec of preset.members.slice(1)) {
      const ref = nextStripMemberRef(used, prefix, sep, spec.suffix, 1)
      used.add(ref)
      const comp = createComponent(spec.type, ref, spec.label, 0, cursorX, base.schematicY, {
        stripId: sid,
        ...(spec.type === 'terminalPhoenixPti6' ? { poleCount: 1 } : {}),
        ...(spec.markerText ? { markerText: spec.markerText } : {}),
        ...(spec.jumperNext ? { jumperNext: true } : {}),
      })
      const placed = placeStripCloneRight(comp, base, cursorX, cursorMm, TERMINAL_STRIP_GAP_PX.hierarchical, [...others, ...clones], railMax)
      comp.schematicX = placed.schematicX
      comp.schematicY = base.schematicY
      comp.sheet = base.sheet
      comp.z = base.z
      if (spec.bodyColor) comp.bodyColor = spec.bodyColor
      comp.railId = base.railId
      if (placed.railOffsetMm !== undefined) comp.railOffsetMm = placed.railOffsetMm
      comp.enclosureId = base.enclosureId
      clones.push(comp)
      cursorX = placed.nextCursorX
      cursorMm = placed.nextCursorRailMm
    }
    const allIds = [base.id, ...clones.map((c) => c.id)]
    set((s) => ({
      components: [
        ...s.components.map((c) => {
          if (c.id !== base.id) return c
          const nextSt: Record<string, unknown> = {
            ...c.state,
            stripId: sid,
            poleCount: 1,
            jumperNext: !!firstSpec.jumperNext,
          }
          delete nextSt.stripUngrouped
          if (firstSpec.markerText) nextSt.markerText = firstSpec.markerText
          else delete nextSt.markerText
          return {
            ...c,
            ref: baseNewRef,
            label: firstSpec.label,
            bodyColor: firstSpec.bodyColor,
            state: nextSt,
          }
        }),
        ...clones,
      ],
      selectedComponentIds: [base.id],
      selectionGroups: groupIds(s.selectionGroups, 'schematic', allIds, nanoid(8)) ?? s.selectionGroups,
      dirty: true,
    }))
    get().pushEvent('info', `Régua «${preset.title}» (${prefix}) criada e agrupada com ${allIds.length} bornes.`)
    recomputeIfActive()
  },

  toggleTerminalJumper: (componentId, force) => {
    if (get().demoMode) return
    const state = get()
    const strip = terminalStripFor(state.components, componentId)
    if (!strip || strip.members.length < 2) return
    const idx = strip.members.findIndex((m) => m.id === componentId)
    if (idx < 0 || idx >= strip.members.length - 1) return
    const cur = strip.members[idx]
    const next = strip.members[idx + 1]
    if (!canTerminalHaveJumper(cur.type) || !canTerminalHaveJumper(next.type)) {
      get().pushEvent('warning', 'Bornes de proteção PE não admitem ponte de interligação FBS.')
      return
    }
    const enabled = force !== undefined ? force : !cur.state?.jumperNext
    get().setComponentState(componentId, { jumperNext: enabled })
    get().pushEvent('info', enabled ? `Ponte FBS ligada entre ${cur.ref} e ${next.ref}.` : `Ponte FBS removida entre ${cur.ref} e ${next.ref}.`)
  },

  renumberTerminalStrip: (componentId, mode) => {
    if (get().demoMode || isSimEditLocked(get())) return
    const state = get()
    const strip = terminalStripFor(state.components, componentId)
    if (!strip || strip.members.length < 1) return
    get().commitHistory()
    const memberIds = new Set(strip.members.map((m) => m.id))
    const used = new Set(state.components.filter((c) => !memberIds.has(c.id)).map((c) => c.ref))
    const prefix = strip.prefix || 'X1'
    const sep = strip.sep || '.'
    const start = mode === 'hier0' ? 0 : 1
    let seq = start
    const newRefs = new Map<string, string>()
    for (const m of strip.members) {
      let ref: string
      if (mode === 'loose') {
        const fam = m.type === 'terminalPE' ? 'PE' : (parseTerminalRef(prefix).family || 'X')
        const esc = fam.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        const re = new RegExp(`^${esc}(\\d+)$`)
        let k = 1
        for (const r of used) { const mm = re.exec(r); if (mm) k = Math.max(k, Number(mm[1]) + 1) }
        ref = `${fam}${k}`
      } else if (m.type === 'terminalPE') {
        ref = nextStripMemberRef(used, prefix, sep, 'PE', start)
      } else {
        while (used.has(`${prefix}${sep}${seq}`)) seq++
        ref = `${prefix}${sep}${seq++}`
      }
      used.add(ref)
      newRefs.set(m.id, ref)
    }
    const sid = strip.explicitStripId || nanoid(6)
    const ids = strip.members.map((m) => m.id)
    set((s) => ({
      components: s.components.map((c) => {
        const nr = newRefs.get(c.id)
        if (!nr) return c
        const nextSt: Record<string, any> = { ...c.state, stripId: sid }
        delete nextSt.stripUngrouped
        return { ...c, ref: nr, state: nextSt }
      }),
      selectionGroups: ids.length >= 2 ? (groupIds(s.selectionGroups, 'schematic', ids, nanoid(8)) ?? s.selectionGroups) : s.selectionGroups,
      dirty: true,
    }))
    const list = strip.members.map((m) => newRefs.get(m.id)!)
    get().pushEvent('info', `Régua renumerada: ${list[0]} … ${list[list.length - 1]}.`)
  },

  setTerminalStripGrouped: (componentId, grouped) => {
    if (get().demoMode || isSimEditLocked(get())) return
    const state = get()
    const target = state.components.find((c) => c.id === componentId)
    if (!target || !isTerminalStripType(target.type)) return
    if (grouped) {
      // Junta todos os bornes do mesmo prefixo hierárquico (ou stripId) na mesma folha e calha/linha.
      const tp = parseTerminalRef(target.ref)
      const candidates = state.components.filter((c) => {
        if (!isTerminalStripType(c.type) || c.panelMount || Number(c.state?.poleCount ?? 1) > 1) return false
        if ((c.sheet ?? '') !== (target.sheet ?? '')) return false
        if (target.railId ? c.railId !== target.railId : Math.abs(c.schematicY - target.schematicY) > 28) return false
        if (c.id === target.id) return true
        if (target.state?.stripId && c.state?.stripId === target.state.stripId) return true
        const cp = parseTerminalRef(c.ref)
        if (tp.hierarchical) return cp.prefix.toUpperCase() === tp.prefix.toUpperCase()
        // Bornes soltos encostados na mesma calha
        if (target.railId && typeof target.railOffsetMm === 'number' && typeof c.railOffsetMm === 'number') {
          return Math.abs(c.railOffsetMm - target.railOffsetMm) <= 120 && cp.family.toUpperCase() === tp.family.toUpperCase()
        }
        return false
      })
      if (candidates.length < 2) {
        get().pushEvent('info', 'Adicione pelo menos mais um borne na mesma calha/prefixo para formar uma régua agrupada.')
        return
      }
      const ids = candidates.map((c) => c.id)
      const sid = candidates.map((c) => (typeof c.state?.stripId === 'string' ? c.state.stripId : '')).find(Boolean) || nanoid(6)
      get().commitHistory()
      set((s) => ({
        components: s.components.map((c) => {
          if (!ids.includes(c.id)) return c
          const nextSt: Record<string, any> = { ...c.state, stripId: sid }
          delete nextSt.stripUngrouped
          return { ...c, state: nextSt }
        }),
        selectionGroups: groupIds(s.selectionGroups, 'schematic', ids, nanoid(8)) ?? s.selectionGroups,
        dirty: true,
      }))
      get().pushEvent('info', `Régua ${tp.prefix} agrupada (${ids.length} bornes movem-se e alinham-se em conjunto).`)
      return
    }
    const strip = terminalStripFor(state.components, componentId)
    const ids = strip && strip.members.length >= 2 ? strip.members.map((m) => m.id) : [componentId]
    get().ungroupItems('schematic', ids)
    get().pushEvent('info', `Régua desagrupada (${ids.length} bornes independentes).`)
  },

  setContactorInterlock: (componentId, partnerId) => {
    if (get().demoMode) return
    const state = get()
    const self = state.components.find((c) => c.id === componentId)
    if (!self) return
    const nextPartner = partnerId && partnerId !== componentId ? state.components.find((c) => c.id === partnerId) : undefined
    const prevPartnerId = typeof self.state.interlockWith === 'string' ? self.state.interlockWith : null
    if (prevPartnerId === (nextPartner?.id ?? null)) return
    get().commitHistory()
    set((s) => ({
      components: s.components.map((c) => {
        if (c.id === componentId) return { ...c, state: { ...c.state, interlockWith: nextPartner?.id ?? null } }
        if (nextPartner && c.id === nextPartner.id) return { ...c, state: { ...c.state, interlockWith: componentId } }
        if (c.state.interlockWith === componentId || (nextPartner && c.state.interlockWith === nextPartner.id)) {
          return { ...c, state: { ...c.state, interlockWith: null } }
        }
        return c
      }),
      dirty: true,
    }))
    get().pushEvent(
      'info',
      nextPartner
        ? `Encravamento mecânico ligado: ${self.ref} ↔ ${nextPartner.ref}.`
        : `Encravamento mecânico removido de ${self.ref}.`,
    )
    recomputeIfActive()
  },

  autoNumberWire: (id) => {
    const state = get()
    if (state.demoMode || isSimEditLocked(state)) return
    const targets = (state.selectedWireIds.length > 1 && state.selectedWireIds.includes(id) ? state.selectedWireIds : [id])
      .filter((wid) => !state.wires.find((w) => w.id === wid)?.locked)
    if (!targets.length) return
    const targetSet = new Set(targets)
    const used = new Set(state.wires.filter((w) => !targetSet.has(w.id)).map((w) => (w.number ?? '').trim().toUpperCase()).filter(Boolean))
    let seq = 1
    const assigned = new Map<string, string>()
    for (const wid of targets) {
      while (used.has(`W${seq}`)) seq++
      const tag = `W${seq++}`
      used.add(tag)
      assigned.set(wid, tag)
    }
    state.commitHistory()
    set({
      wires: state.wires.map((w) => (assigned.has(w.id) ? { ...w, number: assigned.get(w.id) } : w)),
      dirty: true,
    })
  },

  addWire: (fromTerminalId, toTerminalId, color, waypoints) => {
    if (get().demoMode) return
    if (fromTerminalId === toTerminalId) return
    // Esquema com várias folhas: um fio só liga bornes da mesma folha.
    // Entre folhas usa-se uma etiqueta de rede (menu do fio, ponta solta).
    if (get().sheets.length > 1) {
      const firstSheet = get().sheets[0]?.id ?? 'sheet-1'
      const sheetOfTerminal = (tid: string) => {
        const comp = get().components.find((c) => c.terminals.some((t) => t.id === tid))
        return comp ? comp.sheet ?? firstSheet : undefined
      }
      const a = sheetOfTerminal(fromTerminalId)
      const b = sheetOfTerminal(toTerminalId)
      if (a && b && a !== b) {
        const nameOf = (id: string) => get().sheets.find((sh) => sh.id === id)?.name ?? id
        get().pushEvent('warning', `Os bornes estão em folhas diferentes («${nameOf(a)}» e «${nameOf(b)}»). Desenha o fio até à borda da folha e dá-lhe uma etiqueta de rede igual nos dois lados.`)
        return
      }
    }
    const exists = get().wires.some(
      (w) =>
        (w.fromTerminalId === fromTerminalId && w.toTerminalId === toTerminalId) ||
        (w.fromTerminalId === toTerminalId && w.toTerminalId === fromTerminalId),
    )
    if (exists) return
    get().commitHistory()
    const defs = get().wireDefaults
    const coreCount = defs.conductorCount ?? 1
    const wire: Wire = {
      id: nanoid(8),
      fromTerminalId,
      toTerminalId,
      waypoints,
      color: color ?? defs.color,
      gauge: defs.gauge,
      kind: 'control',
      flexibility: defs.flexibility,
      endType: defs.endType,
      fromEndType: defs.endType, toEndType: defs.endType,
      fromEndLayer: 'back', toEndLayer: 'back',
      route: defs.route ?? 'orthogonal',
      bend: 0.5,
      curveOffset: 0,
      number: `W${get().wires.length + 1}`,
      conductorCount: coreCount,
      sheathed: defs.sheathed ?? false,
      sheathColor: defs.sheathed ? (defs.sheathColor ?? '#0f172a') : undefined,
      conductorColors: defs.conductorColors ?? (coreCount > 1 ? defaultCoreColors(coreCount) : undefined),
      energized: false,
    }
    // heurística: cabo entre polos de força = 'power'; entre N/PE = neutral/earth
    const labelOf = (tid: string) => {
      for (const c of get().components) {
        const terminal = c.terminals.find((candidate) => candidate.id === tid)
        if (terminal) return { kind: terminal.kind, terminal, comp: c, electricalClass: terminalElectricalClassOf(c, terminal) }
      }
      return null
    }
    const a = labelOf(fromTerminalId)
    const b = labelOf(toTerminalId)
    const autoEndFrom = defaultWireEndTypeForTerminal(a?.terminal?.terminalType)
    const autoEndTo = defaultWireEndTypeForTerminal(b?.terminal?.terminalType)
    if (autoEndFrom) wire.fromEndType = autoEndFrom
    if (autoEndTo) wire.toEndType = autoEndTo
    if (a?.kind === 'power-in' || a?.kind === 'power-out' || b?.kind === 'power-in' || b?.kind === 'power-out') wire.kind = 'power'
    if (a?.kind === 'neutral' || b?.kind === 'neutral') wire.kind = 'neutral'
    if (a?.kind === 'earth' || b?.kind === 'earth') wire.kind = 'earth'
    if (a?.kind === 'io' || b?.kind === 'io') wire.kind = 'signal'
    if (a?.electricalClass === 'network' || b?.electricalClass === 'network') wire.kind = 'bus'
    const isHydraulicConn =
      a?.kind === 'hydraulic-in' || a?.kind === 'hydraulic-out' ||
      b?.kind === 'hydraulic-in' || b?.kind === 'hydraulic-out' ||
      defs.medium === 'hydraulic'
    const isPneumaticConn =
      a?.kind === 'pneumatic' || b?.kind === 'pneumatic' || defs.medium === 'pneumatic'
    if (isHydraulicConn) {
      wire.kind = 'hydraulic'
      if (!/Ø\s*[0-9]/i.test(wire.gauge)) wire.gauge = 'DN20 (Ø25mm)'
      wire.endType = 'hydraulicFitting'
      wire.fromEndType = 'hydraulicFitting'
      wire.toEndType = 'hydraulicFitting'
      wire.number = `TH${get().wires.filter((x) => x.kind === 'hydraulic').length + 1}`
    } else if (isPneumaticConn) {
      wire.kind = 'pneumatic'
      if (!/Ø\s*[0-9]/i.test(wire.gauge)) wire.gauge = 'PU Ø6mm'
      wire.endType = 'pneumaticPushIn'
      wire.fromEndType = 'pneumaticPushIn'
      wire.toEndType = 'pneumaticPushIn'
      wire.number = `TP${get().wires.filter((x) => x.kind === 'pneumatic').length + 1}`
    }
    // cor automática pela função (IEC 60204-1 + hidráulica/pneumática)
    if (!color && defs.autoColor) wire.color = WIRE_KIND_COLOR[wire.kind]

    set((s) => ({ wires: normalizeWires([...s.wires, wire], s.components), selectedWireId: wire.id, dirty: true }))
    const conduitNoun = wire.kind === 'hydraulic' ? 'Tubo hidráulico' : wire.kind === 'pneumatic' ? 'Tubo pneumático' : 'Cabo'
    get().pushEvent('info', `${conduitNoun} ${wire.number} criado (${a?.comp.ref ?? '?'} → ${b?.comp.ref ?? '?'}).`)
    if (a && b && !terminalClassesCompatible(a.electricalClass, b.electricalClass)) {
      get().pushEvent('warning', `Verifique ${wire.number}: ${TERMINAL_ELECTRICAL_CLASS_LABEL[a.electricalClass]} ligado a ${TERMINAL_ELECTRICAL_CLASS_LABEL[b.electricalClass]}.`)
    }
    recomputeIfActive()
  },

  addFreeWire: (from, to, waypoints) => {
    if ((!from.point && !from.terminalId) || (!to.point && !to.terminalId)) return
    if (from.point && to.point && Math.hypot(from.point.x - to.point.x, from.point.y - to.point.y) < 5) return
    const defs = get().wireDefaults
    const coreCount = defs.conductorCount ?? 1
    const freeKind: WireKind = defs.medium === 'hydraulic' ? 'hydraulic' : defs.medium === 'pneumatic' ? 'pneumatic' : 'control'
    const freeGauge = freeKind === 'hydraulic' && !/Ø\s*[0-9]/i.test(defs.gauge) ? 'DN20 (Ø25mm)'
      : freeKind === 'pneumatic' && !/Ø\s*[0-9]/i.test(defs.gauge) ? 'PU Ø6mm' : defs.gauge
    const freeEnd = freeKind === 'hydraulic' ? 'hydraulicFitting' : freeKind === 'pneumatic' ? 'pneumaticPushIn' : defs.endType
    get().commitHistory()
    const wire: Wire = {
      id: nanoid(8), fromTerminalId: from.terminalId ?? '', toTerminalId: to.terminalId ?? '',
      fromPoint: from.point, toPoint: to.point, waypoints,
      color: defs.color, gauge: freeGauge, kind: freeKind, flexibility: defs.flexibility,
      endType: freeEnd, fromEndType: freeEnd, toEndType: freeEnd,
      fromEndLayer: 'back', toEndLayer: 'back', route: defs.route ?? 'orthogonal', bend: 0.5, curveOffset: 0,
      number: freeKind === 'hydraulic' ? `TH${get().wires.filter((x) => x.kind === 'hydraulic').length + 1}`
        : freeKind === 'pneumatic' ? `TP${get().wires.filter((x) => x.kind === 'pneumatic').length + 1}`
        : `W${get().wires.length + 1}`,
      conductorCount: coreCount,
      sheathed: defs.sheathed ?? false,
      sheathColor: defs.sheathed ? (defs.sheathColor ?? '#0f172a') : undefined,
      conductorColors: defs.conductorColors ?? (coreCount > 1 ? defaultCoreColors(coreCount) : undefined),
      energized: false,
    }
    set((state) => ({ wires: normalizeWires([...state.wires, wire], state.components), selectedWireId: wire.id, dirty: true }))
    get().pushEvent('info', `Cabo livre ${wire.number} criado (sem continuidade elétrica até ligar ambas as pontas).`)
    recomputeIfActive()
  },

  addWire3D: (from, to, waypoints3D) => {
    if (get().demoMode) return null
    const fromId = 'terminalId' in from ? from.terminalId : ''
    const toId = 'terminalId' in to ? to.terminalId : ''
    const path = waypoints3D && waypoints3D.length ? waypoints3D : undefined
    if (fromId && toId) {
      if (fromId === toId) return null
      const before = new Set(get().wires.map((w) => w.id))
      get().addWire(fromId, toId)
      const created = get().wires.find((w) => !before.has(w.id))
      if (!created) {
        get().pushEvent('warning', 'Já existe um cabo entre estes dois bornes.')
        return null
      }
      if (path) set((s) => ({ wires: s.wires.map((w) => (w.id === created.id ? { ...w, waypoints3D: path } : w)) }))
      return created.id
    }
    const project = (p: SpatialPoint3D) => ({ x: Math.round(panelToSchematicX(p.x)), y: Math.round(panelToSchematicY(p.y)) })
    const defs = get().wireDefaults
    const coreCount = defs.conductorCount ?? 1
    const freeKind3D: WireKind = defs.medium === 'hydraulic' ? 'hydraulic' : defs.medium === 'pneumatic' ? 'pneumatic' : 'control'
    const freeGauge3D = freeKind3D === 'hydraulic' && !/Ø\s*[0-9]/i.test(defs.gauge) ? 'DN20 (Ø25mm)'
      : freeKind3D === 'pneumatic' && !/Ø\s*[0-9]/i.test(defs.gauge) ? 'PU Ø6mm' : defs.gauge
    const freeEnd3D = freeKind3D === 'hydraulic' ? 'hydraulicFitting' : freeKind3D === 'pneumatic' ? 'pneumaticPushIn' : defs.endType
    get().commitHistory()
    const wire: Wire = {
      id: nanoid(8),
      fromTerminalId: fromId,
      toTerminalId: toId,
      fromPoint: 'point' in from ? project(from.point) : undefined,
      toPoint: 'point' in to ? project(to.point) : undefined,
      fromPoint3D: 'point' in from ? from.point : undefined,
      toPoint3D: 'point' in to ? to.point : undefined,
      waypoints3D: path,
      color: defs.color, gauge: freeGauge3D, kind: freeKind3D, flexibility: defs.flexibility,
      endType: freeEnd3D, fromEndType: freeEnd3D, toEndType: freeEnd3D,
      fromEndLayer: 'back', toEndLayer: 'back', route: defs.route ?? 'orthogonal', bend: 0.5, curveOffset: 0,
      number: `W${get().wires.length + 1}`,
      conductorCount: coreCount,
      sheathed: defs.sheathed ?? false,
      sheathColor: defs.sheathed ? (defs.sheathColor ?? '#0f172a') : undefined,
      conductorColors: defs.conductorColors ?? (coreCount > 1 ? defaultCoreColors(coreCount) : undefined),
      energized: false,
    }
    set((state) => ({ wires: normalizeWires([...state.wires, wire], state.components), selectedWireId: wire.id, dirty: true }))
    get().pushEvent('info', `Cabo livre ${wire.number} desenhado no 3D (sem continuidade elétrica até ligar ambas as pontas).`)
    recomputeIfActive()
    return wire.id
  },

  updateWire: (id, patch) => {
    if (get().demoMode) return
    if (get().wires.find(w => w.id === id)?.locked) return
    set((s) => {
      const updated = s.wires.map((w) => (w.id === id ? { ...w, ...patch } : w))
      const needsSync = 'fromTerminalId' in patch || 'toTerminalId' in patch
      return { wires: needsSync ? normalizeWires(updated, s.components) : updated, dirty: true }
    })
  },

  deleteWire: (id) => {
    if (get().demoMode) return
    if (get().wires.find(w => w.id === id)?.locked) {
      get().pushEvent('warning', 'Cabo bloqueado. Desbloqueie-o no Inspetor para o eliminar.')
      return
    }
    const run = get().sim.runState
    if (run === 'running' || run === 'paused') {
      get().pushEvent('warning', 'Não é possível apagar cabos enquanto a simulação está a correr ou em pausa.')
      return
    }
    get().commitHistory()
    set((s) => ({ wires: normalizeWires(s.wires.filter((w) => w.id !== id), s.components), selectedWireId: null, dirty: true }))
    recomputeIfActive()
  },

  connectChain: (terminalIds) => {
    const ids = terminalIds.filter((id, i) => terminalIds.indexOf(id) === i)
    if (ids.length < 2) return
    const before = new Set(get().wires.map((w) => w.id))
    for (let i = 0; i < ids.length - 1; i++) {
      get().addWire(ids[i], ids[i + 1])
    }
    const created = get().wires.filter((w) => !before.has(w.id)).map((w) => w.id)
    if (created.length) get().organizeWires(created)
    get().pushEvent('info', `Ligação inteligente: ${ids.length} bornes conectados em cadeia (${created.length} cabo(s)).`)
  },

  setWiresLocked: (locked, ids) => {
    const state = get()
    if (state.demoMode || isSimEditLocked(state)) return
    const target = new Set(state.wires.filter(w => (!ids || ids.includes(w.id)) && !!w.locked !== locked).map(w => w.id))
    if (!target.size) return
    state.commitHistory()
    set({ wires: state.wires.map(w => target.has(w.id) ? { ...w, locked } : w), dirty: true })
    state.pushEvent('info', `${target.size} cabo(s) ${locked ? 'bloqueados' : 'desbloqueados'}.`)
  },

  reverseWire: (id) => {
    const state = get()
    if (state.demoMode || isSimEditLocked(state)) return
    const wire = state.wires.find((w) => w.id === id)
    if (!wire || wire.locked) return
    const flipFraction = (t: number) => Math.round(Math.max(0, Math.min(1, 1 - t)) * 1000) / 1000
    const defaultEnd = wire.endType ?? 'none'
    state.commitHistory()
    set({
      wires: normalizeWires(
        state.wires.map((w) =>
          w.id !== id
            ? w
            : {
                ...w,
                fromTerminalId: w.toTerminalId,
                toTerminalId: w.fromTerminalId,
                fromPoint: w.toPoint ? { ...w.toPoint } : undefined,
                toPoint: w.fromPoint ? { ...w.fromPoint } : undefined,
                fromPoint3D: w.toPoint3D ? { ...w.toPoint3D } : undefined,
                toPoint3D: w.fromPoint3D ? { ...w.fromPoint3D } : undefined,
                netFrom: w.netTo,
                netTo: w.netFrom,
                fromEndType: w.toEndType ?? defaultEnd,
                toEndType: w.fromEndType ?? defaultEnd,
                fromEndColor: w.toEndColor,
                toEndColor: w.fromEndColor,
                fromEndLayer: w.toEndLayer ?? 'back',
                toEndLayer: w.fromEndLayer ?? 'back',
                bend: flipFraction(w.bend ?? 0.5),
                curveOffset: w.curveOffset ? -w.curveOffset : w.curveOffset,
                waypoints: w.waypoints?.length ? [...w.waypoints].reverse().map((p) => ({ ...p })) : undefined,
                waypoints3D: w.waypoints3D?.length ? [...w.waypoints3D].reverse().map((p) => ({ ...p })) : undefined,
                isolation: w.isolation?.map((seg) => ({ ...seg, start: flipFraction(seg.end), end: flipFraction(seg.start) })),
                spirals: w.spirals?.map((seg) => ({ ...seg, start: flipFraction(seg.end), end: flipFraction(seg.start) })),
                markers: w.markers?.map((m) => ({ ...m, t: flipFraction(m.t) })),
              },
        ),
        state.components,
      ),
      dirty: true,
    })
    state.pushEvent('info', `Sentido do cabo ${wire.number || wire.id} invertido (A ↔ B).`)
    recomputeIfActive()
  },

  selectBundleWires: (bundleId) => {
    if (!bundleId) return
    const state = get()
    const members = state.wires.filter((w) => w.bundleId === bundleId).map((w) => w.id)
    if (!members.length) return
    const primary = state.selectedWireId && members.includes(state.selectedWireId) ? state.selectedWireId : members[0]
    set({
      selectedWireId: primary,
      selectedWireIds: members,
      selectedComponentIds: [],
      selectedTerminalId: null,
    })
    state.pushEvent('info', `Chicote selecionado (${members.length} cabos).`)
  },

  copyWireToDefaults: (id) => {
    const state = get()
    const wire = state.wires.find((w) => w.id === id)
    if (!wire) return
    set({
      wireDefaults: {
        ...state.wireDefaults,
        autoColor: false,
        color: wire.color,
        gauge: wire.gauge,
        flexibility: wire.flexibility,
        endType: wire.fromEndType ?? wire.endType ?? 'ferrule',
        route: wire.route,
        conductorCount: wire.conductorCount ?? 1,
        sheathed: !!wire.sheathed,
        sheathColor: wire.sheathed ? (wire.sheathColor ?? '#0f172a') : undefined,
        conductorColors: wire.conductorColors ? [...wire.conductorColors] : undefined,
      },
    })
    state.pushEvent('info', `Estilo de ${wire.number || 'cabo'} (${wire.gauge}) copiado para os próximos cabos.`)
  },

  applyWireEndPreset: (id, mode) => {
    const state = get()
    if (state.demoMode || isSimEditLocked(state)) return
    const ref = state.wires.find((w) => w.id === id)
    if (!ref) return
    const targets = new Set(
      (state.selectedWireIds.length > 1 && state.selectedWireIds.includes(id) ? state.selectedWireIds : [id]).filter(
        (wid) => !state.wires.find((w) => w.id === wid)?.locked,
      ),
    )
    if (!targets.size) return
    state.commitHistory()
    set({
      wires: state.wires.map((w) => {
        if (!targets.has(w.id)) return w
        const base = w.endType ?? 'none'
        const aType = w.fromEndType ?? base
        const bType = w.toEndType ?? base
        if (mode === 'copyAtoB') {
          return { ...w, toEndType: aType, toEndColor: w.fromEndColor, toEndLayer: w.fromEndLayer ?? 'back' }
        }
        if (mode === 'copyBtoA') {
          return { ...w, fromEndType: bType, fromEndColor: w.toEndColor, fromEndLayer: w.toEndLayer ?? 'back' }
        }
        const din = dinFerruleColor(w.gauge)
        if (!din) return w
        return {
          ...w,
          fromEndType: aType === 'none' ? 'ferrule' : aType,
          toEndType: bType === 'none' ? 'ferrule' : bType,
          fromEndColor: din.hex,
          toEndColor: din.hex,
        }
      }),
      dirty: true,
    })
  },

  stampWireEndMarkers: (id, mode) => {
    const state = get()
    if (state.demoMode || isSimEditLocked(state)) return
    const targets = new Set(
      (state.selectedWireIds.length > 1 && state.selectedWireIds.includes(id) ? state.selectedWireIds : [id]).filter(
        (wid) => !state.wires.find((w) => w.id === wid)?.locked,
      ),
    )
    if (!targets.size) return
    const termTag = (tid: string) => {
      if (!tid) return ''
      for (const c of state.components) {
        const t = c.terminals.find((item) => item.id === tid)
        if (t) return `${c.ref}.${t.label}`
      }
      return ''
    }
    state.commitHistory()
    set({
      wires: state.wires.map((w) => {
        if (!targets.has(w.id)) return w
        const num = (w.number || w.label || 'W').trim()
        const tagA = mode === 'number' ? num : termTag(w.fromTerminalId) || num
        const tagB = mode === 'number' ? num : termTag(w.toTerminalId) || num
        const middle = (w.markers ?? []).filter((m) => m.t > 0.14 && m.t < 0.86)
        return {
          ...w,
          markers: [
            { t: 0.08, text: tagA, color: '#111827', bg: '#facc15', style: 'iec' },
            ...middle,
            { t: 0.92, text: tagB, color: '#111827', bg: '#facc15', style: 'iec' },
          ],
        }
      }),
      dirty: true,
    })
    state.pushEvent('info', `Anilhas aplicadas nas pontas (${targets.size} cabo${targets.size > 1 ? 's' : ''}).`)
  },

  refineWireCurve2D: (id, mode) => {
    const state = get()
    if (state.demoMode || isSimEditLocked(state)) return
    const wire = state.wires.find((w) => w.id === id)
    if (!wire || wire.locked) return
    const endpointPt = (tid: string, fallback?: { x: number; y: number }) => {
      if (tid) {
        for (const c of state.components) {
          const t = c.terminals.find((item) => item.id === tid)
          if (t) {
            const loc = componentTerminalLocal(c, t)
            return { x: c.schematicX + loc.x, y: c.schematicY + loc.y }
          }
        }
      }
      return fallback ?? null
    }
    state.commitHistory()
    if (mode === 'clear') {
      set({ wires: state.wires.map((w) => (w.id === id ? { ...w, waypoints: undefined, bend: 0.5, curveOffset: 0 } : w)), dirty: true })
      return
    }
    if (!wire.waypoints?.length) return
    const a = endpointPt(wire.fromTerminalId, wire.fromPoint)
    const b = endpointPt(wire.toTerminalId, wire.toPoint)
    if (!a || !b) return
    const next = mode === 'ortho' ? orthogonalizeWaypoints2D(a, b, wire.waypoints) : simplifyWaypoints2D(a, b, wire.waypoints, 4)
    set({
      wires: state.wires.map((w) =>
        w.id === id
          ? {
              ...w,
              route: mode === 'ortho' && (w.route === 'arc' || w.route === 'direct') ? 'orthogonal' : w.route,
              waypoints: next.length ? next : undefined,
            }
          : w,
      ),
      dirty: true,
    })
  },

  organizeWires: (wireIds) => {
    const state = get()
    if (state.demoMode || isSimEditLocked(state)) return
    const target = new Set(state.wires.filter(w => !w.locked && (!wireIds || wireIds.includes(w.id))).map(w => w.id))
    if (!target.size) { state.pushEvent('info', 'Não há cabos desbloqueados para organizar.'); return }
    const plans = planNativeWirePaths(state.components, state.wires)
    state.commitHistory()
    set({ wires: state.wires.map(w => target.has(w.id) ? {
      ...w, route: plans.get(w.id)?.route ?? 'manhattan', bend: plans.get(w.id)?.bend ?? 0.5,
      curveOffset: 0, waypoints: plans.get(w.id)?.waypoints, waypoints3D: undefined,
    } : w), dirty: true })
    state.pushEvent('info', `${target.size} cabo(s) organizados no Esquema e 3D. Cabos bloqueados mantidos · Ctrl+Z desfaz.`)
  },

  autoNumberWires: (mode = 'missing') => {
    if (get().demoMode || isSimEditLocked(get()) || !get().wires.some(w => !w.locked && (mode === 'all' || !w.number))) return
    get().commitHistory()
    set((s) => {
      let n = 0
      const reserved = new Set(s.wires.filter(w => w.locked).map(w => w.number))
      if (mode === 'missing') {
        const used = s.wires
          .map((w) => (w.number ? /^W(\d+)$/.exec(w.number) : null))
          .filter((m): m is RegExpExecArray => !!m)
          .map((m) => Number(m[1]))
        n = used.length ? Math.max(...used) : 0
      }
      return {
        wires: s.wires.map((w) => {
          if (w.locked || mode === 'missing' && w.number) return w
          do { n += 1 } while (reserved.has(`W${n}`))
          return { ...w, number: `W${n}` }
        }),
        dirty: true,
      }
    })
    get().pushEvent(
      'info',
      mode === 'all' ? `Todos os cabos renumerados (W1…W${get().wires.length}).` : 'Cabos sem identificação foram numerados automaticamente.',
    )
  },

  // ------------------------------------------------------- alinhar / distribuir
  alignSelection: (edge) => {
    const { selectedComponentIds, components } = get()
    const sel = components.filter((c) => selectedComponentIds.includes(c.id))
    if (sel.length < 2) return

    let target: number
    switch (edge) {
      case 'left':
        target = Math.min(...sel.map((c) => c.schematicX))
        break
      case 'right':
        target = Math.max(...sel.map((c) => c.schematicX + c.w))
        break
      case 'top':
        target = Math.min(...sel.map((c) => c.schematicY))
        break
      case 'bottom':
        target = Math.max(...sel.map((c) => c.schematicY + c.h))
        break
      case 'centerX':
        target = sel.reduce((a, c) => a + c.schematicX + c.w / 2, 0) / sel.length
        break
      case 'centerY':
      default:
        target = sel.reduce((a, c) => a + c.schematicY + c.h / 2, 0) / sel.length
        break
    }

    const ids = new Set(selectedComponentIds)
    const next = components.map((component) => {
      if (!ids.has(component.id)) return component
      switch (edge) {
        case 'left':
          return { ...component, schematicX: target }
        case 'right':
          return { ...component, schematicX: target - component.w }
        case 'top':
          return { ...component, schematicY: target }
        case 'bottom':
          return { ...component, schematicY: target - component.h }
        case 'centerX':
          return { ...component, schematicX: target - component.w / 2 }
        case 'centerY':
        default:
          return { ...component, schematicY: target - component.h / 2 }
      }
    })
    const valid = next.every((component) => !ids.has(component.id)
      || componentPositionIsFree(component, component.schematicX, component.schematicY, next, new Set([component.id])))
    if (!valid) {
      get().pushEvent('warning', 'Alinhamento cancelado: os componentes ficariam sobrepostos.')
      return
    }
    get().commitHistory()
    set({ components: next, dirty: true })
    recomputeIfActive()
  },

  distributeSelection: (axis) => {
    const { selectedComponentIds, components } = get()
    const sel = components.filter((c) => selectedComponentIds.includes(c.id))
    if (sel.length < 3) return
    get().commitHistory()

    const posKey = axis === 'horizontal' ? 'schematicX' : 'schematicY'
    const sizeKey = axis === 'horizontal' ? 'w' : 'h'
    const sorted = [...sel].sort((a, b) => a[posKey] - b[posKey])
    const first = sorted[0]
    const last = sorted[sorted.length - 1]
    const span = last[posKey] + last[sizeKey] - first[posKey]
    const totalSize = sorted.reduce((a, c) => a + c[sizeKey], 0)
    const gap = (span - totalSize) / (sorted.length - 1)

    const patch = new Map<string, number>()
    let cursor = first[posKey]
    for (const c of sorted) {
      patch.set(c.id, cursor)
      cursor += c[sizeKey] + gap
    }

    const next = components.map((component) => patch.has(component.id) ? { ...component, [posKey]: patch.get(component.id)! } : component)
    const ids = new Set(selectedComponentIds)
    const valid = next.every((component) => !ids.has(component.id)
      || componentPositionIsFree(component, component.schematicX, component.schematicY, next, new Set([component.id])))
    if (!valid) {
      get().pushEvent('warning', 'Distribuição cancelada: não existe folga suficiente entre os componentes.')
      return
    }
    get().commitHistory()
    set({ components: next, dirty: true })
    get().pushEvent('info', `Distribuição ${axis === 'horizontal' ? 'horizontal' : 'vertical'} aplicada a ${sorted.length} componentes.`)
    recomputeIfActive()
  },

  // ------------------------------------------------------------ camadas
  bringSelectionToFront: () => reorderSelection(get, set, 'front'),
  sendSelectionToBack: () => reorderSelection(get, set, 'back'),
  bringSelectionForward: () => reorderSelection(get, set, 'forward'),
  sendSelectionBackward: () => reorderSelection(get, set, 'backward'),

  deleteSelection: () => {
    const decal = get().selectedDecal
    if (decal) { get().removeDecal(decal.componentId, decal.decalId); return }
    if (get().demoMode) return
    const { selectedComponentIds, selectedWireId, selectedTerminalId } = get()
    if (selectedTerminalId) return get().deleteTerminal(selectedTerminalId)
    if (selectedWireId) return get().deleteWire(selectedWireId)
    if (selectedComponentIds.length) return get().deleteComponents(selectedComponentIds)
  },

  runProbe: () => {
    const st = get()
    const segundo = st.selectedTerminalId
    if (!segundo) return
    const primeiro = st.probeA
    if (!primeiro || primeiro === segundo) {
      set({
        probeA: segundo,
        probeResult: { a: segundo, b: null, connected: false, hops: -1, resistanceOhm: null, voltage: '—', note: 'Primeiro ponto fixado. Clique no segundo ponto para medir.' },
      })
      return
    }
    set({ probeA: null, probeResult: probe(st.components, st.wires, primeiro, segundo, st.runtime.energizedTerminals) })
  },

  clearProbe: () => set({ probeResult: null, probeA: null }),

  // -------------------------------------------------------------------- vista
  setGrid: (patch) => set((s) => ({ grid: { ...s.grid, ...patch }, dirty: true })),
  setZoom: (z) => set({ zoom: Math.min(5, Math.max(0.25, z)) }),
  setPan: (x, y) => set({ panX: x, panY: y }),

  // ---------------------------------------------------------------- histórico
  commitHistory: () => {
    const s = get()
    set({
      history: [...s.history.slice(-49), snapshot(s)],
      future: [],
    })
  },

  undo: () => {
    const s = get()
    if (!s.history.length) return
    const prev = s.history[s.history.length - 1]
    set({
      components: prev.components,
      wires: prev.wires,
      ladder: { rungs: prev.ladder },
      grafcet: prev.grafcet ?? s.grafcet,
      commands: prev.commands ?? s.commands,
      fcBlocks: prev.fcBlocks ?? s.fcBlocks,
      plcPrograms: prev.plcPrograms ?? s.plcPrograms,
      activePlcId: prev.activePlcId !== undefined ? prev.activePlcId : s.activePlcId,
      tags: prev.tags ?? s.tags,
      plcTags: prev.plcTags ?? s.plcTags,
      projectFiles: prev.projectFiles ?? s.projectFiles,
      hiddenProjectFolders: prev.hiddenProjectFolders ?? s.hiddenProjectFolders,
      projectFolderLabels: prev.projectFolderLabels ?? s.projectFolderLabels,
      fcNames: prev.fcNames ?? s.fcNames,
      canvasTexts: prev.canvasTexts ?? s.canvasTexts,
      selectionGroups: prev.selectionGroups ?? s.selectionGroups,
      history: s.history.slice(0, -1),
      future: [...s.future, snapshot(s)],
      dirty: true,
    })
    recomputeIfActive()
  },

  redo: () => {
    const s = get()
    if (!s.future.length) return
    const next = s.future[s.future.length - 1]
    set({
      components: next.components,
      wires: next.wires,
      ladder: { rungs: next.ladder },
      grafcet: next.grafcet ?? s.grafcet,
      commands: next.commands ?? s.commands,
      fcBlocks: next.fcBlocks ?? s.fcBlocks,
      plcPrograms: next.plcPrograms ?? s.plcPrograms,
      activePlcId: next.activePlcId !== undefined ? next.activePlcId : s.activePlcId,
      tags: next.tags ?? s.tags,
      plcTags: next.plcTags ?? s.plcTags,
      projectFiles: next.projectFiles ?? s.projectFiles,
      hiddenProjectFolders: next.hiddenProjectFolders ?? s.hiddenProjectFolders,
      projectFolderLabels: next.projectFolderLabels ?? s.projectFolderLabels,
      fcNames: next.fcNames ?? s.fcNames,
      canvasTexts: next.canvasTexts ?? s.canvasTexts,
      selectionGroups: next.selectionGroups ?? s.selectionGroups,
      future: s.future.slice(0, -1),
      history: [...s.history, snapshot(s)],
      dirty: true,
    })
    recomputeIfActive()
  },

  // ------------------------------------------------------------------- ladder
  addRung: () => {
    if (get().demoMode) return ''
    get().commitHistory()
    const rungId = nanoid(6)
    resetGroupedEdit()
    set((s) => ({
      ladder: { rungs: [...s.ladder.rungs, { id: rungId, name: `Rung ${s.ladder.rungs.length + 1}`, branches: [{ id: nanoid(6), elements: [] }], coils: [], enabled: true }] },
      dirty: true,
    }))
    recomputeIfActive()
    return rungId
  },

  appendRungs: (rungs) => {
    if (!rungs.length) return
    get().commitHistory()
    resetGroupedEdit()
    set((s) => ({ ladder: { rungs: [...s.ladder.rungs, ...rungs] }, dirty: true }))
    get().autoDetectTags('skip')
    recomputeIfActive()
  },

  replaceGeneratedRungs: (rungs) => {
    get().commitHistory()
    resetGroupedEdit()
    set((s) => ({ ladder: { rungs: [...s.ladder.rungs.filter((r) => !r.name.startsWith('GRAFCET ·')), ...rungs] }, dirty: true }))
    get().autoDetectTags('skip')
    recomputeIfActive()
  },

  deleteRung: (rungId) => {
    if (get().demoMode) return
    get().commitHistory()
    set((s) => ({ ladder: { rungs: s.ladder.rungs.filter((r) => r.id !== rungId) }, dirty: true }))
    recomputeIfActive()
  },

  duplicateRung: (rungId) => {
    if (get().demoMode) return
    get().commitHistory()
    set((s) => {
      const idx = s.ladder.rungs.findIndex((r) => r.id === rungId)
      if (idx === -1) return s
      const clone: LadderRung = JSON.parse(JSON.stringify(s.ladder.rungs[idx]))
      clone.id = nanoid(6)
      clone.name = clone.name + ' (cópia)'
      const rungs = [...s.ladder.rungs]
      rungs.splice(idx + 1, 0, clone)
      return { ladder: { rungs }, dirty: true }
    })
    recomputeIfActive()
  },

  moveRung: (rungId, dir) => {
    const current = get().ladder.rungs
    const index = current.findIndex((rung) => rung.id === rungId)
    const swapWith = index + dir
    if (index === -1 || swapWith < 0 || swapWith >= current.length) return
    get().commitHistory()
    set((s) => {
      const rungs = [...s.ladder.rungs]
      ;[rungs[index], rungs[swapWith]] = [rungs[swapWith], rungs[index]]
      return { ladder: { rungs }, dirty: true }
    })
    recomputeIfActive()
  },

  renameRung: (rungId, name) => {
    if (shouldCommitGroupedEdit(`rung:${rungId}:name`)) get().commitHistory()
    set((s) => ({ ladder: { rungs: s.ladder.rungs.map((r) => (r.id === rungId ? { ...r, name } : r)) }, dirty: true }))
  },

  updateRung: (rungId, updater, historyMode = 'auto') => {
    if (historyMode === 'force' || (historyMode === 'auto' && shouldCommitGroupedEdit(`rung:${rungId}`))) get().commitHistory()
    if (historyMode === 'force') resetGroupedEdit()
    set((s) => {
      const next = s.ladder.rungs.map((r) => (r.id === rungId ? updater(r) : r))
      const rungs = withEmptyNetworkBelow(s.ladder.rungs, next, (index) => ({ id: nanoid(6), name: `Rung ${index + 1}`, branches: [{ id: nanoid(6), elements: [] }], coils: [], enabled: true }))
      return { ladder: { rungs }, dirty: true }
    })
    recomputeIfActive()
  },

  // ------------------------------------------------------------- tabela de tags
  addTag: (prefix) => {
    const addr = nextDeclaredTagAddress(prefix, get().tags)
    if (!addr) { get().pushEvent('warning', 'Não existem endereços livres nesta área de variáveis.'); return }
    get().commitHistory()
    resetGroupedEdit()
    set((s) => ({
      tags: [...s.tags, { id: nanoid(6), address: addr, name: addr, dataType: defaultDataTypeFor(addr) as LadderDataType, comment: '' }],
      dirty: true,
    }))
  },

  setTags: (tags, context) => {
    const state = get()
    if (context && (state.activePlcId !== context.activePlcId || state.projectRevision !== context.projectRevision)) return false
    if (JSON.stringify(tags) === JSON.stringify(state.tags)) return true
    state.commitHistory()
    resetGroupedEdit()
    const saved = tags.map((tag) => ({ ...tag }))
    set({ tags: saved, ...(state.activePlcId ? { plcTags: { ...state.plcTags, [state.activePlcId]: saved } } : {}), dirty: true })
    return true
  },

  updateTag: (id, patch, historyMode = 'auto') => {
    if (!get().tags.some((tag) => tag.id === id)) return
    if (historyMode === 'force' || (historyMode === 'auto' && shouldCommitGroupedEdit(`tag:${id}`))) get().commitHistory()
    if (historyMode === 'force') resetGroupedEdit()
    set((s) => ({
      tags: s.tags.map((t) => (t.id === id ? { ...t, ...patch, ...(patch.address ? { address: normalizeBitAddress(patch.address) ?? patch.address.toUpperCase() } : {}) } : t)),
      dirty: true,
    }))
  },

  removeTag: (id) => {
    if (!get().tags.some((tag) => tag.id === id)) return
    get().commitHistory()
    resetGroupedEdit()
    set((s) => ({ tags: s.tags.filter((t) => t.id !== id), dirty: true }))
  },

  autoDetectTags: (historyMode = 'force') => {
    const state = get()
    const norm = (a: string) => a.trim().replace(/^%/, '').toUpperCase()
    const known = new Set(state.tags.map((tag) => norm(tag.address)))
    // Main + blocos FC: antes só a Main era varrida, por isso saídas usadas num FC nunca apareciam.
    const programs = [state.ladder, { rungs: state.fcBlocks.fc1 }, { rungs: state.fcBlocks.fc2 }]
    const used = [...new Set(programs.flatMap((program) => collectUsedAddresses(program)))]
      .filter((address) => isDeclarableAddress(address) && !known.has(address))
    if (!used.length) return 0
    if (historyMode === 'force') { state.commitHistory(); resetGroupedEdit() }
    const added: LadderTag[] = used.map((address) => ({
      id: nanoid(6),
      address,
      name: address,
      dataType: defaultDataTypeFor(address) as LadderDataType,
      comment: '',
    }))
    set((s) => ({
      tags: [...s.tags, ...added],
      ...(state.activePlcId ? { plcTags: { ...s.plcTags, [state.activePlcId]: [...s.tags, ...added] } } : {}),
      ...(historyMode === 'force' ? { dirty: true } : {}),
    }))
    return added.length
  },

  // ------------------------------------------------------------------ arquivo
  saveJSON: () => {
    const s = get()
    return JSON.stringify(
      {
        app: 'dc-simu',
        version: 6,
        projectKind: s.projectKind,
        unlockedViews: s.unlockedViews,
        savedAt: new Date().toISOString(),
        ...(s.nativeId ? { nativeId: s.nativeId } : {}),
        ...(s.nativeId ? { nativeFeatures: s.nativeFeatures } : {}),
        components: s.components,
        wires: s.wires,
        ladder: s.ladder,
        fcBlocks: s.fcBlocks,
        fcAdded: s.fcAdded,
        activePlcId: s.activePlcId,
        plcPrograms: programsForSave(s.plcPrograms, s.activePlcId, s.ladder.rungs, s.fcBlocks, s.fcAdded),
        plcTags: { ...s.plcTags, ...(s.activePlcId ? { [s.activePlcId]: s.tags } : {}) },
        projectFiles: s.projectFiles,
        hiddenProjectFolders: s.hiddenProjectFolders,
        projectFolderLabels: s.projectFolderLabels,
        fcNames: s.fcNames,
        grafcet: s.grafcet,
        commands: s.commands,
        tags: s.tags,
        virtualInputs: s.virtualInputs,
        virtualInputModes: s.virtualInputModes,
        virtualInputCount: s.virtualInputCount,
        virtualOutputCount: s.virtualOutputCount,
        virtualMemoryCount: s.virtualMemoryCount,
        sheets: s.sheets,
        activeSheetId: s.activeSheetId,
        grid: s.grid,
        activeScenario: s.activeScenario,
        canvasNotes: s.canvasNotes,
        canvasTexts: s.canvasTexts,
        selectionGroups: s.selectionGroups,
      },
      null,
      2,
    )
  },

  loadJSON: (json) => {
    try {
      // Migração silenciosa: bits antigos «I1»/«Q2»/«M3» passam a «I0.0»/«Q0.1»/«M0.2».
      const original = migrateLegacyAddresses(JSON.parse(json)) as Record<string, any>
      const parsed = upgradeNativeGrafcetTags(addNativeAnnotations(addNativeIecSchematic(syncNativeLadder(refreshNativeWireCurves(addNativeSignals(addNativeThermalRelay(fixNativeCoilWiring(upgradeNativeNcSimInputs(upgradeNativeMotorRings(upgradeNativeMotorMeter(original)))))))))))
      setStoredCover(parsed?.cover, parsed?.coverVersion)
      get().stop()
      const sourceComponents = (parsed.components ?? []) as ElectricalComponent[]
      const loadedComponents = sourceComponents.map(upgradeLogoTerminals).map(upgradeMonoMotorTerminals).map(upgradeProauto24A).map(upgradeTerminalAssemblyPositions).map(upgradeRealInterfacePositions).map(upgradeProtectionTerminalPositions).map(upgradePhysicalFootprint).map(upgradeLsXbmFront)
        .map((component) => upgradeComponentEditorMetadata(component, parsed.savedAt))
        .map((component) => ({
          ...component,
          viewOrientation: isIsometricMotorType(component.type)
            ? { ...MOTOR_ISOMETRIC_ORIENTATION }
            : { ...ZERO_COMPONENT_ORIENTATION },
        })) as ElectricalComponent[]
      const componentMetadataUpgraded = loadedComponents.some((component, index) => component.editorVersion !== sourceComponents[index]?.editorVersion
        || component.editorUpdatedAt !== sourceComponents[index]?.editorUpdatedAt || component.editorLastChange !== sourceComponents[index]?.editorLastChange)
      const footprintUpgraded = loadedComponents.some((component, index) => component.w !== sourceComponents[index]?.w || component.h !== sourceComponents[index]?.h)
      const loadedWires = (parsed.wires ?? []) as Wire[]
      const alignedWires = connectNearWireEnds(loadedComponents, loadedWires)
      const snapDirty = alignedWires.some((wire, i) => wire !== loadedWires[i])
      // Relés encaixados seguem a geometria de encaixe atual (projetos guardados com a posição antiga).
      const cleanComponents = deenergizeComponents(syncSocketMounted(syncCombMounted(syncMounted(loadedComponents))))
      const cleanWires = normalizeWires(alignedWires.map((wire) => (wire.energized ? { ...wire, energized: false } : wire)), cleanComponents)
      const plcIds = cleanComponents.filter(isProgrammablePlc).map((c) => c.id)
      const loadedActiveId = plcIds.includes(parsed.activePlcId) ? parsed.activePlcId : plcIds[0] ?? null
      const programs = (parsed.plcPrograms ?? {}) as Record<string, PlcProgram>
      const activeProgram = loadedActiveId && programs[loadedActiveId]
      set({
        projectRevision: get().projectRevision + 1,
        projectKind: normalizeKind(parsed.projectKind),
        unlockedViews: normalizeUnlockedViews(parsed.unlockedViews),
        nativeId: typeof parsed.nativeId === 'string' ? parsed.nativeId : null,
        nativeFeatures: Array.isArray(parsed.nativeFeatures) ? parsed.nativeFeatures.filter((v: unknown) => typeof v === 'string') : [],
        // Estado das entradas virtuais guardado no ficheiro (já migrado para byte.bit):
        // restitui-o para o projeto continuar a simular exatamente onde ficou.
        virtualInputs: (() => {
          const raw = parsed.virtualInputs
          if (!raw || typeof raw !== 'object') return {}
          return Object.fromEntries(Object.entries(raw as Record<string, unknown>).filter(([key, value]) => /^I\d+\.\d+$/.test(key) && typeof value === 'boolean')) as Record<string, boolean>
        })(),
        virtualInputModes: (parsed.virtualInputModes && typeof parsed.virtualInputModes === 'object' ? parsed.virtualInputModes : {}) as Record<string, VirtualInputMode>,
        components: cleanComponents,
        showEmptyWelcome: false,
        wires: cleanWires,
        ladder: { rungs: activeProgram?.rungs ?? parsed.ladder?.rungs ?? [] },
        fcBlocks: { fc1: activeProgram?.fc1 ?? parsed.fcBlocks?.fc1 ?? [], fc2: activeProgram?.fc2 ?? parsed.fcBlocks?.fc2 ?? [] },
        fcAdded: fcPresentOf((parsed.fcAdded ?? activeProgram?.fcAdded) as { fc1?: boolean; fc2?: boolean } | undefined,
          { fc1: activeProgram?.fc1 ?? parsed.fcBlocks?.fc1 ?? [], fc2: activeProgram?.fc2 ?? parsed.fcBlocks?.fc2 ?? [] }, parsed.fcNames),
        activePlcId: loadedActiveId,
        plcPrograms: programs,
        plcTags: parsed.plcTags ?? {},
        projectFiles: parsed.projectFiles ?? {},
        hiddenProjectFolders: parsed.hiddenProjectFolders ?? {},
        projectFolderLabels: parsed.projectFolderLabels ?? {},
        fcNames: parsed.fcNames ?? {},
        grafcet: parsed.grafcet?.steps && Array.isArray(parsed.grafcet.steps) ? parsed.grafcet : emptyGrafcet(),
        grafcetRuntime: emptyGrafcetRuntime(),
        commands: Array.isArray(parsed.commands?.parts) && Array.isArray(parsed.commands?.wires) ? normalizeCommandsPages(parsed.commands) : emptyCommands(),
        virtualInputCount: typeof parsed.virtualInputCount === 'number' ? Math.max(1, Math.min(32, parsed.virtualInputCount)) : 8,
        virtualOutputCount: typeof parsed.virtualOutputCount === 'number' ? Math.max(1, Math.min(32, parsed.virtualOutputCount)) : 8,
        virtualMemoryCount: typeof parsed.virtualMemoryCount === 'number' ? Math.max(0, Math.min(32, parsed.virtualMemoryCount)) : 0,
        sheets: Array.isArray(parsed.sheets) && parsed.sheets.length ? parsed.sheets : [{ id: 'sheet-1', name: 'Página 1' }],
        activeSheetId: typeof parsed.activeSheetId === 'string' ? parsed.activeSheetId : 'sheet-1',
        canvasNotes: Array.isArray(parsed.canvasNotes) ? parsed.canvasNotes.filter((note: CanvasNote) => note && typeof note.id === 'string' && typeof note.text === 'string') : [],
        canvasTexts: Array.isArray(parsed.canvasTexts) ? parsed.canvasTexts.filter((item: CanvasText) => item && typeof item.id === 'string' && typeof item.text === 'string' && Number.isFinite(item.x) && Number.isFinite(item.y)) : [],
        selectionGroups: (() => {
          const baseGroups = parseSelectionGroups(parsed.selectionGroups).length
            ? parseSelectionGroups(parsed.selectionGroups)
            : legacyComponentGroups(sourceComponents)
          let merged = baseGroups
          for (const strip of resolveTerminalStrips(cleanComponents)) {
            if (strip.members.length < 2) continue
            const ids = strip.members.map((m) => m.id)
            // Não sobrepõe grupos manuais já guardados; apenas agrupa réguas ainda soltas.
            const alreadyGrouped = merged.some((g) => g.view === 'schematic' && ids.some((id) => g.members.includes(id)))
            if (!alreadyGrouped) merged = groupIds(merged, 'schematic', ids, nanoid(8)) ?? merged
          }
          return merged
        })(),
        tags: (loadedActiveId && parsed.plcTags?.[loadedActiveId]) ?? parsed.tags ?? [],
        grid: parsed.grid ? { ...parsed.grid, background: EDITOR_THEME.background } : get().grid,
        activeScenario: parsed.activeScenario ?? 'custom',
        runtime: EMPTY_RUNTIME(),
        selectedComponentIds: [],
        selectedWireId: null,
        viewOrientationEditor: null,
        history: [],
        future: [],
        dirty: parsed !== original || footprintUpgraded || componentMetadataUpgraded || snapDirty,
      })
      get().pushEvent('info', 'Projeto carregado de arquivo JSON.')
      if (parsed !== original) get().pushEvent('info', 'Projeto nativo atualizado. Guarde o projeto para conservar as alterações.')
    } catch (e) {
      get().pushEvent('error', 'Falha ao carregar o JSON: arquivo inválido.')
      console.error(e)
    }
  },

  newProject: (kind = 'all') => {
    setStoredCover(null)
    get().stop()
    set({
      projectRevision: get().projectRevision + 1,
      sheets: [{ id: 'sheet-1', name: 'Página 1' }],
      activeSheetId: 'sheet-1',
      canvasNotes: [],
      canvasTexts: [],
      selectionGroups: [],
      components: [],
      wires: [],
      showEmptyWelcome: true,
      ladder: { rungs: [] },
      fcBlocks: { fc1: [], fc2: [] },
      fcAdded: { fc1: false, fc2: false },
      activePlcId: null,
      plcPrograms: {},
      plcTags: {},
      projectFiles: {},
      hiddenProjectFolders: {},
      projectFolderLabels: {},
      fcNames: {},
      grafcet: emptyGrafcet(),
      grafcetRuntime: emptyGrafcetRuntime(),
      commands: emptyCommands(),
      tags: [],
      activeScenario: 'custom',
      runtime: EMPTY_RUNTIME(),
      selectedComponentIds: [],
      selectedWireId: null,
      viewOrientationEditor: null,
      history: [],
      future: [],
      dirty: false,
      currentProjectName: null,
      nativeId: null,
      nativeFeatures: [],
      virtualInputs: {},
      virtualInputModes: {},
      projectKind: normalizeKind(kind),
      unlockedViews: [],
    })
    get().pushEvent('info', 'Novo projeto em branco criado.')
  },

  // ----------------------------------------------------- projetos (navegador)
  setCurrentProjectName: (name) => set({ currentProjectName: name }),
  demoMode: false,
  setDemoMode: (on) => { syncDemoMode(on); set({ demoMode: on }) },
  viewLocked: false,
  setViewLocked: (on) => set({ viewLocked: !!on }),
  toggleViewLocked: () => set((s) => ({ viewLocked: !s.viewLocked })),
  allowOutsideFactory: false,
  setAllowOutsideFactory: (allow) => set({ allowOutsideFactory: !!allow }),

  saveProjectAs: (name) => {
    const trimmed = name.trim()
    if (!trimmed) return false
    const json = get().saveJSON()
    const ok = saveProject(trimmed, json)
    if (ok) {
      setLastOpened(trimmed)
      set({ currentProjectName: trimmed, dirty: false })
      get().pushEvent('info', `Projeto "${trimmed}" guardado neste navegador.`)
    } else {
      get().pushEvent('error', 'Não foi possível guardar: armazenamento do navegador indisponível ou cheio.')
    }
    return ok
  },

  loadProjectByName: (name) => {
    const json = loadProject(name)
    if (!json) {
      get().pushEvent('error', `Projeto "${name}" não encontrado neste navegador.`)
      return false
    }
    get().loadJSON(json)
    setLastOpened(name)
    set({ currentProjectName: name })
    get().pushEvent('info', `Projeto "${name}" reaberto.`)
    return true
  },

  deleteProjectByName: (name) => {
    deleteProject(name)
    if (get().currentProjectName === name) set({ currentProjectName: null })
    get().pushEvent('info', `Projeto "${name}" eliminado deste navegador.`)
  },

  // ------------------------------------------------------- copiar / colar
  copySelection: () => {
    const { components, wires, selectedComponentIds, currentProjectName } = get()
    if (!selectedComponentIds.length) return
    const selSet = new Set(selectedComponentIds)
    const comps = components.filter((c) => selSet.has(c.id))
    if (!comps.length) return
    const terminalIds = new Set(comps.flatMap((c) => c.terminals.map((t) => t.id)))
    const relevantWires = wires.filter((w) => terminalIds.has(w.fromTerminalId) && terminalIds.has(w.toTerminalId))
    const snapshot: Snapshot = {
      components: JSON.parse(JSON.stringify(comps)),
      wires: JSON.parse(JSON.stringify(relevantWires)),
      ladder: [],
    }
    set({ clipboard: snapshot })
    // Persistente entre projetos (e entre recargas) no mesmo navegador.
    writeElectricalCrossClipboard({
      components: snapshot.components,
      wires: snapshot.wires,
      ladder: snapshot.ladder,
      sourceProject: currentProjectName,
    })
    get().pushEvent('info', `${comps.length} componente(s) copiado(s)${relevantWires.length ? ` (+ ${relevantWires.length} cabo(s) internos)` : ''} — pode colar noutro projeto (Ctrl+V).`)
  },

  pasteClipboard: () => {
    // Preferir clipboard em memória; se vazio (ex.: após mudar de projeto), ler o persistente.
    let clip = get().clipboard
    if (!clip || !clip.components.length) {
      const cross = readElectricalCrossClipboard()
      if (cross && cross.components.length) {
        clip = {
          components: cross.components as ElectricalComponent[],
          wires: (cross.wires ?? []) as Wire[],
          ladder: [] as LadderRung[],
        }
        set({ clipboard: clip })
      }
    }
    if (!clip || !clip.components.length) {
      get().pushEvent('info', 'Nada para colar — copie componentes com Ctrl+C (também funciona entre projetos).')
      return
    }
    get().commitHistory()

    const terminalMap = new Map<string, string>()
    const newComponents: ElectricalComponent[] = []
    for (const src of clip.components) {
      const newId = nanoid(8)
      const newTerminals: Terminal[] = src.terminals.map((t) => {
        const newTid = nanoid(8)
        terminalMap.set(t.id, newTid)
        return { ...t, id: newTid, componentId: newId, energized: false }
      })
      const clone: ElectricalComponent = {
        ...JSON.parse(JSON.stringify(src)),
        id: newId,
        schematicX: src.schematicX + 40,
        schematicY: src.schematicY + 40,
        panel3DPosition: src.panel3DPosition
          ? { x: src.panel3DPosition.x + 0.35, y: src.panel3DPosition.y, z: src.panel3DPosition.z + 0.18 }
          : undefined,
        terminals: newTerminals,
        sheet: get().activeSheetId,
        ref: nextRef([...get().components, ...newComponents], src.type),
        z: nextTopZ([...get().components, ...newComponents], get().wires),
      }
      const free = nearestFreeComponentPosition(clone, clone.schematicX, clone.schematicY, [...get().components, ...newComponents])
      clone.schematicX = free.x
      clone.schematicY = free.y
      newComponents.push(clone)
    }
    const newWires: Wire[] = clip.wires
      .filter((w) => terminalMap.has(w.fromTerminalId) && terminalMap.has(w.toTerminalId))
      .map((w) => ({
        ...JSON.parse(JSON.stringify(w)),
        id: nanoid(8),
        fromTerminalId: terminalMap.get(w.fromTerminalId)!,
        toTerminalId: terminalMap.get(w.toTerminalId)!,
        energized: false,
      }))

    set((s) => ({
      components: [...s.components, ...newComponents],
      wires: normalizeWires([...s.wires, ...newWires], s.components),
      selectedComponentIds: newComponents.map((c) => c.id),
      selectedWireId: null,
      dirty: true,
    }))
    get().pushEvent('info', `Colado(s) ${newComponents.length} componente(s)${newWires.length ? ` e ${newWires.length} cabo(s)` : ''}.`)
    recomputeIfActive()
  },
  })
})

function pushRuntime(set: (partial: Partial<Store>) => void, st: Store) {
  // `components`/`wires` são mutados no sítio pelo motor: copiar as listas a cada
  // varredura (10 Hz) obrigava TODOS os subscritores a re-renderizar e refazia
  // memos pesados (rotas 3D, índices de bornes). Basta o escalar `simTick` —
  // quem mostra estado elétrico ao vivo subscreve-o explicitamente.
  set({
    simTick: st.simTick + 1,
    runtime: { ...st.runtime },
    grafcetRuntime: { ...st.grafcetRuntime },
    sim: { ...st.sim },
  })
}

/** Deriva a tabela usada pelos monitores a partir do último scan. */
export function deriveTable(): AddressTable {
  return useSimStore.getState().runtime.table
}

export { nextAddress }

// As condições do GRAFCET (MW1>=5, C1==3, T1>2000) leem os valores do runtime do PLC ativo.
setGrafcetNumericReader((operand) => {
  const { runtime } = useSimStore.getState()
  return readOperand(operand, { db: runtime.db, timers: runtime.timers, counters: runtime.counters })
})

// Nas condições do GRAFCET o nome da variável (Sensor_A) vale como o endereço (I0.1) da tabela do PLC ativo.
// O mapa só é refeito quando a tabela muda (o scan chama isto muitas vezes por ciclo).
let signalAliasCache: { tags: LadderTag[]; map: Map<string, string> } | null = null
setGrafcetSignalAliasResolver((nameUpper) => {
  const { tags } = useSimStore.getState()
  if (signalAliasCache?.tags !== tags) signalAliasCache = { tags, map: signalAliasMap(tags) }
  return signalAliasCache.map.get(nameUpper)
})

// Tags automáticas: quando o programa muda (contacto, bobina, MOVE…), cria as tags em falta
// (entradas, SAÍDAS, memórias, T, C). Espera que o utilizador pare de escrever e ignora
// endereços incompletos, para não deixar «Q0.» ou «Q0.1» intermédios na tabela.
let tagSyncTimer: ReturnType<typeof setTimeout> | undefined
// DC-ADR-071: ao entrar em RUN/PAUSA (Play, Passo) a seleção anterior é largada; o Inspetor fica vazio.
useSimStore.subscribe((state, prev) => {
  if (isSimEditLocked(state) && !isSimEditLocked(prev) && (state.selectedComponentIds.length || state.selectedWireId || state.selectedTerminalId)) {
    useSimStore.setState({ selectedComponentIds: [], selectedWireId: null, selectedTerminalId: null, viewOrientationEditor: null })
  }
})

// A seleção/rascunho de etiquetas pertence à sessão de edição, nunca ao ficheiro do projeto.
useSimStore.subscribe((state) => {
  const selection = state.selectedDecal
  if (!selection) return
  const owner = state.components.find((item) => item.id === selection.componentId)
  if (isSimEditLocked(state) || owner?.locked || !state.selectedComponentIds.includes(selection.componentId) || !owner?.decals?.some((item) => item.id === selection.decalId) || state.tool !== 'select') {
    state.cancelDecalMove()
    useSimStore.setState({ selectedDecal: null })
  }
})

useSimStore.subscribe((state, prev) => {
  if (state.ladder === prev.ladder && state.fcBlocks === prev.fcBlocks) return
  if (tagSyncTimer) clearTimeout(tagSyncTimer)
  tagSyncTimer = setTimeout(() => { tagSyncTimer = undefined; useSimStore.getState().autoDetectTags('skip') }, 600)
})
