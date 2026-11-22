/**
 * Maquetes prontas — a bancada didática ATEC / Guião 1185 montada num só passo.
 *
 * Uma maquete **não é um componente do catálogo**: é um *macro* que cria a base ranhurada e coloca
 * sobre ela todas as peças de `stampingBenchLayout()` nas cotas do relatório (base 700 × 500,
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
import { stampingBenchLayout, type BenchPlacement } from './stampingBench'

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
}

/** Tipo da base ranhurada: sempre o primeiro componente de qualquer maquete. */
export const MAQUETTE_PLATE_TYPE: ComponentType = 'mecSlotPlate'

/** Base 700 × 500 × 20 mm do relatório ATEC (igual ao padrão de `mecSlotPlate`). */
export const MAQUETTE_PLATE_STATE: Record<string, unknown> = {
  lengthMm: 700,
  widthMm: 500,
  manufacturer: 'DC-Simu Mecatrónica',
  model: 'Base T 700 × 500 × 20',
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
): ReadyMaquette => {
  const parts = partsOf(partKeys)
  return {
    id,
    name,
    subtitle,
    thumb,
    plateState: { ...MAQUETTE_PLATE_STATE },
    partKeys,
    componentCount: parts.length + 1,
    types: [MAQUETTE_PLATE_TYPE, ...new Set(parts.map((part) => part.type))],
  }
}

export const READY_MAQUETTES: ReadyMaquette[] = [
  maquette(
    'atec-estampagem',
    'Maquete ATEC · estampagem e transferência',
    'Base ranhurada + estrutura + as 27 peças dos 22 componentes, nos devidos lugares',
    '/maquetes/atec-estampagem.webp',
    'all',
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
export function readyMaquetteParts(id: ReadyMaquetteId, plateState?: Record<string, any>): BenchPlacement[] {
  const mq = readyMaquetteById(id)
  if (!mq) return []
  if (!plateState) return partsOf(mq.partKeys)
  return stampingBenchLayout(plateState).filter((part) => mq.partKeys === 'all' || mq.partKeys.includes(part.key))
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
