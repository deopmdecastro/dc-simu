/**
 * Maquetes prontas — a bancada didática ATEC / Guião 1185 montada num só passo.
 *
 * Uma maquete **não é um componente do catálogo**: é um *macro* que cria a base ranhurada e coloca
 * sobre ela todas as peças de `stampingBenchLayout()` na adaptação fotográfica (base 700 × 700,
 * manipulador a 0°/180°, rampas a 270°/300°/240°, calhas perimetrais, coluna luminosa, HMI…).
 * Ficar fora de `TEMPLATES` é deliberado: o catálogo exige GLB, bornes, capa WebP e rascunho por
 * tipo (`test:builtin-sync`, `test:library-covers-ui`), exigências que não fazem sentido para uma
 * montagem composta por outros 22 componentes.
 *
 * A biblioteca mostra-as no domínio «Maquetes prontas» (`paletteDomains()`), e a inserção passa por
 * `useSimStore.insertReadyMaquette()`, que faz um único `commitHistory()` — um Ctrl+Z desfaz a
 * bancada inteira.
 */
import type { ComponentType } from '../types'
import { PANEL_UNITS_PER_MM } from '../three/modelPaths'
import { stampingBenchLayout, type BenchEnvironment, type BenchPlacement } from './stampingBench'
import { stampingWallPanelContent } from './stampingWallPanel'

export type ReadyMaquetteId = 'atec-estampagem' | 'atec-bancada'

export interface ReadyMaquette {
  id: ReadyMaquetteId
  /** Nome do cartão na biblioteca. */
  name: string
  /** Linha de contexto do cartão (o que fica montado). */
  subtitle: string
  /** Capa 3/4 gerada pela própria aplicação (`scripts/ready-maquettes-covers.mjs`). */
  thumb: string
  /** Estado com que a base ranhurada é criada. */
  plateState: Record<string, unknown>
  /** Peças de `stampingBenchLayout()` colocadas sobre a base (`'all'` = bancada completa). */
  partKeys: readonly string[] | 'all'
  /** Nº de componentes inseridos, base incluída. */
  componentCount: number
  /** Tipos distintos inseridos (para o inspetor, o cartão e os testes). */
  types: ComponentType[]
  /** Monta também o quadro geral de parede (QGD) e centra a mesa na nave à frente dele. */
  wallPanel: boolean
}

/** Tipo da base ranhurada: sempre o primeiro componente de qualquer maquete. */
export const MAQUETTE_PLATE_TYPE: ComponentType = 'mecSlotPlate'

/** Base alargada para libertar os comandos e a HMI; dimensões estimadas, editáveis. */
export const MAQUETTE_PLATE_STATE: Record<string, unknown> = {
  lengthMm: 700,
  widthMm: 700,
  legs: true,
  legHeightMm: 750,
  manufacturer: 'DC-Simu Mecatrónica',
  model: 'Base T 700 × 700 × 20 · adaptação fotográfica estimada',
}

/** Estrutura da bancada, sem as estações: calhas técnicas perimetrais + poste de perfil 40 × 40. */
const BENCH_SHELL_KEYS = ['ductFront', 'ductBack', 'ductLeft', 'ductRight', 'profile'] as const

const ALL_PARTS = stampingBenchLayout(MAQUETTE_PLATE_STATE)

const partsOf = (keys: readonly string[] | 'all'): BenchPlacement[] => {
  if (keys === 'all') return ALL_PARTS
  const wanted = new Set(keys)
  return ALL_PARTS.filter((part) => wanted.has(part.key))
}

const maquette = (
  id: ReadyMaquetteId,
  name: string,
  subtitle: string,
  thumb: string,
  partKeys: readonly string[] | 'all',
  wallPanel = false,
): ReadyMaquette => {
  const parts = partsOf(partKeys)
  // O QGD só é gerado quando alguém pede a contagem (evita o ciclo factory → maquetes → QGD).
  let panel: Array<{ type: ComponentType }> | null = null
  const panelParts = () => (panel ??= wallPanel ? stampingWallPanelContent('count-').components : [])
  return {
    id,
    name,
    subtitle,
    thumb,
    plateState: { ...MAQUETTE_PLATE_STATE },
    partKeys,
    get componentCount() { return parts.length + 1 + panelParts().length },
    get types() { return [MAQUETTE_PLATE_TYPE, ...new Set([...parts.map((part) => part.type), ...panelParts().map((c) => c.type)])] },
    wallPanel,
  }
}

export const READY_MAQUETTES: ReadyMaquette[] = [
  maquette(
    'atec-estampagem',
    'Maquete ATEC · estampagem e transferência',
    'Ambiente fabril · quadro de parede, compressor e esteiras aéreas · QE de campo com relés e 24 V · HMI e comandos',
    '/maquetes/atec-estampagem.webp',
    'all',
    true,
  ),
  maquette(
    'atec-bancada',
    'Bancada ATEC · base e estrutura',
    'Base ranhurada + calhas perimetrais + poste, pronta a receber as estações',
    '/maquetes/atec-bancada.webp',
    BENCH_SHELL_KEYS,
  ),
]

export function readyMaquetteById(id: string): ReadyMaquette | undefined {
  return READY_MAQUETTES.find((item) => item.id === id)
}

/**
 * Peças que a maquete coloca sobre a base, nas cotas do relatório.
 * `plateState` permite recalcular a disposição para uma base redimensionada.
 */
export function readyMaquetteParts(id: ReadyMaquetteId, plateState?: Record<string, any>, env?: BenchEnvironment): BenchPlacement[] {
  const mq = readyMaquetteById(id)
  if (!mq) return []
  if (!plateState && !env) return partsOf(mq.partKeys)
  return stampingBenchLayout(plateState ?? MAQUETTE_PLATE_STATE, env).filter((part) => mq.partKeys === 'all' || mq.partKeys.includes(part.key))
}

/**
 * Centro da base em unidades de painel (1 u = 100 mm): 1 px do esquema = 2 mm, tal como no
 * inspetor da base. `panel3DPosition` das restantes peças = base + cotas em mm × PANEL_UNITS_PER_MM.
 */
export function benchBaseUnits(schematicX = 420, schematicY = 260): { x: number; y: number; z: number } {
  return { x: (schematicX - 420) * 0.02, y: -(schematicY - 260) * 0.02, z: 1.6 }
}

/** Posição 3D de uma peça da maquete, relativa à base. */
export function benchPartUnits(
  base: { x: number; y: number; z: number },
  part: Pick<BenchPlacement, 'x' | 'y' | 'z'>,
): { x: number; y: number; z: number } {
  return {
    x: base.x + part.x * PANEL_UNITS_PER_MM,
    y: base.y + part.y * PANEL_UNITS_PER_MM,
    z: base.z + part.z * PANEL_UNITS_PER_MM,
  }
}

/** Profundidade por omissão da nave fabril (unidades), igual a `computeFactoryRoomBounds` para um quadro. */
const DEFAULT_HALL_DEPTH_U = 32
/** Face da parede onde assenta o quadro (z da chapa − placa de montagem − folga), como no Painel 3D. */
export const FACTORY_WALL_FRONT_Z = -0.41

/**
 * Base da mesa no centro da nave, à frente do quadro de parede: o chão segue a regra do Painel 3D
 * (base do quadro − 4,6 u) e os pés de `legHeightMm` assentam nele. Devolve também a posição da
 * parede e do QGD relativa à base, para a esteira aérea e o compressor.
 */
export function benchInFactoryHall(
  enclosure: { x: number; y: number; heightMm: number },
  plateState: Record<string, any>,
  hallDepthU = DEFAULT_HALL_DEPTH_U,
): { base: { x: number; y: number; z: number }; env: BenchEnvironment } {
  const halfH = (enclosure.heightMm * PANEL_UNITS_PER_MM) / 2
  const floorY = enclosure.y - halfH - Math.max(4.6, enclosure.heightMm * PANEL_UNITS_PER_MM * 0.45)
  const thickness = Number(plateState.thicknessMm ?? 20)
  const leg = Number(plateState.legHeightMm ?? 750) || 750
  const base = {
    x: enclosure.x,
    y: floorY + (leg + thickness / 2) * PANEL_UNITS_PER_MM,
    z: FACTORY_WALL_FRONT_Z + hallDepthU / 2,
  }
  const mm = (u: number) => Math.round(u / PANEL_UNITS_PER_MM)
  return { base, env: { wallZmm: mm(FACTORY_WALL_FRONT_Z - base.z), panelXmm: mm(enclosure.x - base.x), panelTopMm: mm(enclosure.y + halfH - base.y) } }
}
