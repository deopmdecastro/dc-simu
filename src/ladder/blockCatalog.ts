import { nanoid } from 'nanoid'
import type { LadderRung } from '../types'
import type { ProjectFile, ProjectFolder } from './projectFiles'

/**
 * Catálogo de blocos do editor Ladder (estilo «Adicionar novo bloco» do TIA Portal).
 *
 * Dados puros e funções de validação/geração — sem React — para a modal de
 * criação ser fina e testável. Os números/nomes seguem a convenção Siemens
 * (Main [OB1], CYC_INT2 [OB 32], …) que a árvore do projeto já mostra.
 */

export type BlockKind = 'OB' | 'FB' | 'FC' | 'DB'
export type BlockLanguage = 'LAD' | 'FBD' | 'SCL' | 'ST' | 'STL'

export const BLOCK_KINDS: Record<BlockKind, { label: string; hint: string }> = {
  OB: { label: 'Bloco de organização', hint: 'Interface entre o sistema operativo do PLC e o programa (cíclico, arranque, interrupções).' },
  FB: { label: 'Bloco de função', hint: 'Bloco com memória (dados de instância) para lógicas com estado.' },
  FC: { label: 'Função', hint: 'Bloco sem memória; executa quando é chamado (CALL) a partir de outro bloco.' },
  DB: { label: 'Bloco de dados', hint: 'Variáveis tipadas (BOOL/INT/REAL) acedidas como Nome.Variável nas instruções MOVE.' },
}

export type ObTemplate = {
  key: string
  /** rótulo-base do bloco, sem o «[OB n]» */
  label: string
  number: number
}

export type ObGroup = {
  /** pasta de topo na árvore da modal */
  title: string
  /** subpasta opcional (ex.: «Hora do dia» dentro de «Interrupções») */
  subtitle?: string
  items: ObTemplate[]
}

/**
 * Mesma árvore do «Add new block» do TIA Portal (S7): interrupções de tempo
 * (hora do dia, retardo, cíclicas), hardware, arranque, alarme e falhas.
 */
export const OB_CYCLE_GROUP: ObGroup = {
  title: 'Tarefa de ciclo',
  items: [{ key: 'ob1', label: 'MAIN', number: 1 }],
}

export const OB_GROUPS: ObGroup[] = [
  {
    title: 'Interrupções',
    subtitle: 'Hora do dia',
    items: [{ key: 'tod0', label: 'TOD_INT0', number: 10 }],
  },
  {
    title: 'Interrupções',
    subtitle: 'Retardo de tempo',
    items: [
      { key: 'del0', label: 'DEL_INT0', number: 20 },
      { key: 'del1', label: 'DEL_INT1', number: 21 },
    ],
  },
  {
    title: 'Interrupções',
    subtitle: 'Cíclicas',
    items: [
      { key: 'cyc2', label: 'CYC_INT2', number: 32 },
      { key: 'cyc3', label: 'CYC_INT3', number: 33 },
      { key: 'cyc4', label: 'CYC_INT4', number: 34 },
      { key: 'cyc5', label: 'CYC_INT5', number: 35 },
    ],
  },
  {
    title: 'Interrupções de hardware',
    items: [
      { key: 'hw0', label: 'HW_INT0', number: 40 },
      { key: 'hw1', label: 'HW_INT1', number: 41 },
    ],
  },
  {
    title: 'Arranque',
    items: [{ key: 'start100', label: 'RESTART COMPLETO', number: 100 }],
  },
  {
    title: 'Alarme',
    items: [
      { key: 'alarm55', label: 'DP: ALARME DE ESTADO', number: 55 },
      { key: 'alarm56', label: 'DP: ALARME DE ATUALIZAÇÃO', number: 56 },
      { key: 'alarm57', label: 'DP: ALARME DO FABRICANTE', number: 57 },
      { key: 'sync61', label: 'SYNC_1', number: 61 },
    ],
  },
  {
    title: 'Interrupções de falha',
    items: [
      { key: 'flt80', label: 'CYCL_FLT', number: 80 },
      { key: 'flt82', label: 'DIAG_FLT', number: 82 },
      { key: 'flt86', label: 'RACK_FLT', number: 86 },
    ],
  },
]

export const ALL_OB_TEMPLATES: ObTemplate[] = [OB_CYCLE_GROUP, ...OB_GROUPS].flatMap((group) => group.items)

/** Números reservados pelo editor (Main [OB1] e fc1/fc2 já existem como nós fixos). */
const RESERVED: Record<'OB' | 'FC', number[]> = { OB: [1], FC: [1, 2] }

export const BLOCK_LANGUAGES: Record<BlockLanguage, { label: string; executes: boolean; hint: string }> = {
  LAD: { label: 'LAD', executes: true, hint: 'Editável como networks e simulado ciclo a ciclo.' },
  FBD: { label: 'FBD', executes: true, hint: 'Editável como networks LAD equivalentes e simulado ciclo a ciclo.' },
  SCL: { label: 'SCL', executes: false, hint: 'Guardado como texto em «Fontes externas» — a compilação ainda não está disponível.' },
  ST: { label: 'ST', executes: false, hint: 'Guardado como texto em «Fontes externas» — a compilação ainda não está disponível.' },
  STL: { label: 'STL', executes: false, hint: 'Guardado como texto em «Fontes externas» — a compilação ainda não está disponível.' },
}

export const OB_KIND_DESCRIPTION =
  'Os blocos de organização (OBs) controlam a execução do programa. Com os OBs, é possível reagir a eventos cíclicos, temporais ou acionados por interrupção durante a execução do programa.'

/** Final do nome no formato da árvore do projeto: «CYC_INT2 [OB 32]». */
export const blockDisplayName = (kind: BlockKind, label: string, number: number) =>
  `${label.trim()} [${kind} ${number}]`

/** Números já utilizados por blocos do mesmo tipo (lidos da convenção «[FC 3]»). */
export function usedBlockNumbers(files: ProjectFile[], kind: BlockKind): Set<number> {
  const used = new Set<number>()
  const pattern = new RegExp(`\\[${kind}\\s*(\\d+)\\s*\\]`, 'i')
  for (const file of files.filter((f) => f.folder === 'programBlocks' || f.folder === 'dataBlocks' || f.folder === 'externalSources')) {
    const match = file.name.match(pattern)
    if (match) used.add(Number(match[1]))
  }
  if (kind === 'FC') for (const n of RESERVED.FC) used.add(n)
  if (kind === 'OB') for (const n of RESERVED.OB) used.add(n)
  return used
}

/** Menor número livre para o tipo, respeitando os reservados. */
export function suggestNumber(files: ProjectFile[], kind: BlockKind, preferred?: number): number {
  const used = usedBlockNumbers(files, kind)
  let candidate = Math.max(1, preferred ?? 1)
  while (used.has(candidate)) candidate += 1
  return candidate
}

/** Sugestão inicial do nome-base para FC/FB/DB («FC_3», «DB_1»… como o TIA). */
export function suggestLabel(files: ProjectFile[], kind: BlockKind): string {
  if (kind === 'OB') return 'OB'
  const numbers = usedBlockNumbers(files, kind)
  let best = 1
  for (const n of numbers) best = Math.max(best, n + 1)
  return `${kind}_${suggestNumber(files, kind, best)}`
}

export type BlockPlan = {
  folder: ProjectFolder
  exec?: ProjectFile['exec']
  name: string
  content?: string
  rungs?: LadderRung[]
}

/** OB de ciclo/tempo cíclico corre em todos os scans; o de arranque corre uma vez por RUN. */
function obExec(number: number): ProjectFile['exec'] | undefined {
  if (number === 100) return 'obStartup'
  // tarefas de ciclo (OB 1-7) e interrupções cíclicas (OB 30-38) correm em todos os scans
  if (number <= 7 || (number >= 30 && number <= 38)) return 'obCyclic'
  return undefined
}

/** Network inicial do bloco, já pronta a editar como qualquer outra. */
export function starterRungs(title: string): LadderRung[] {
  return [{
    id: nanoid(10),
    name: `Início — ${title}`,
    enabled: true,
    branches: [{ id: nanoid(10), elements: [] }],
    coils: [],
  }]
}

/** DB global com variáveis de exemplo no formato tipado que o simulador aceita. */
export function dbTemplate(dbName: string): string {
  return JSON.stringify({
    Enable: { type: 'BOOL', value: false },
    Count: { type: 'INT', value: 0 },
    Setpoint: { type: 'REAL', value: 0 },
  }, null, 2) + `\n// \"${dbName}\" — variáveis acedidas como ${dbName}.Enable nas instruções MOVE\n`
}

/** Cabeçalho de fonte externa (SCL/ST/STL): texto guardado no projeto, não compilado. */
export function sourceTemplate(kind: BlockKind, name: string, language: BlockLanguage): string {
  const header = kind === 'OB' ? `ORGANIZATION_BLOCK "${name}"`
    : kind === 'FB' ? `FUNCTION_BLOCK "${name}"`
    : `FUNCTION "${name}"`
  return `// ${header}\n// Linguagem: ${language} — texto guardado no projeto; a compilação ainda não está disponível.\n// Dica: para simular isto, crie o mesmo bloco em LAD/FBD (networks editáveis).\n\nBEGIN\n    (* escreva aqui a lógica *)\nEND_${kind === 'OB' ? 'ORGANIZATION_BLOCK' : kind === 'FB' ? 'FUNCTION_BLOCK' : 'FUNCTION'}\n`
}

/** Decide em que pasta o bloco fica e com que conteúdo inicial é criado. */
export function planBlock(input: { kind: BlockKind; language: BlockLanguage; name: string; number: number }): BlockPlan {
  const { kind, language, name, number } = input
  if (kind === 'DB') return { folder: 'dataBlocks', name, content: dbTemplate(name) }
  const executable = BLOCK_LANGUAGES[language].executes
  if (!executable) return { folder: 'externalSources', name, content: sourceTemplate(kind, name, language) }
  return { folder: 'programBlocks', name, rungs: starterRungs(name), exec: kind === 'OB' ? obExec(number) : undefined }
}

export function validateBlock(input: { name: string; number: number | null; kind: BlockKind; files: ProjectFile[] }): string | null {
  const { name, number, kind, files } = input
  if (!name.trim()) return 'Indique um nome para o bloco.'
  if (number === null || !Number.isSafeInteger(number) || number < 1 || number > 65535) return `O número do ${kind} tem de ser um inteiro entre 1 e 65535.`
  const asTyped = name.trim()
  if (files.some((f) => f.name.trim().toUpperCase() === asTyped.toUpperCase())) return `Já existe um item chamado «${asTyped}» neste PLC.`
  if (usedBlockNumbers(files, kind).has(number)) return `O número ${kind} ${number} já está atribuído a outro bloco.`
  return null
}
