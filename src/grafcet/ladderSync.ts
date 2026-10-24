import { nanoid } from 'nanoid'
import type { LadderRung, LadderTag } from '../types'
import { useSimStore } from '../store/useSimStore'
import { collectUsedAddresses, defaultDataTypeFor } from '../ladder/ladderEngine'
import { blockDisplayName } from '../ladder/blockCatalog'
import { transitionsOf, validateGrafcet, type GrafcetProgram } from './engine'
import { grafcetToLadder, type LadderFromGrafcet } from './toLadder'

export type LadderSyncStatus = 'none' | 'synced' | 'stale' | 'blocked'

const MAIN_PREFIX = 'GRAFCET ·'
const RESTART_PREFIX = 'Complete restart ·'
/** Comentários das tags criadas pelo gerador (servem para distingui-las das do utilizador). */
const GENERATED_COMMENT = /^(Bit da etapa|Receptividade T|Temporização|Tempo [DL] de|Valor memorizado|Valor contínuo|Saída do GRAFCET|Entrada usada em)/
const GENERATED_BIT_NAME = /^(Etapa_|Rec_T|Temp_T|Tempo_[DL]_|Mem_|Cont_)/

const isMainRung = (r: LadderRung) => r.name.startsWith(MAIN_PREFIX)
const isRestartRung = (r: LadderRung) => r.name.startsWith(RESTART_PREFIX)
/** Memória/temporizador criado pelo gerador: é refeito a cada atualização. */
const isGeneratedBit = (t: LadderTag) => /^[MT]\d{1,2}$/i.test(t.address.trim()) && GENERATED_BIT_NAME.test(t.name) && GENERATED_COMMENT.test(t.comment ?? '')

/** Assinatura de networks sem ids (os ids mudam em cada geração). */
const signature = (rungs: LadderRung[]) => JSON.stringify(rungs, (key, value) => (key === 'id' ? undefined : value))

function restartFileOf(state: ReturnType<typeof useSimStore.getState>) {
  const plcId = state.activePlcId ?? '_general'
  return (state.projectFiles[plcId] ?? []).find((f) => f.folder === 'programBlocks' && f.exec === 'obStartup' && /\[OB\s*100\s*\]/i.test(f.name))
}

export function hasGeneratedLadder(): boolean {
  const state = useSimStore.getState()
  return state.ladder.rungs.some(isMainRung) || (restartFileOf(state)?.rungs ?? []).some(isRestartRung)
}

interface Plan {
  result: LadderFromGrafcet
  keptRestart: LadderRung[]
  restartFileId: string | null
  /** Tags que ficam depois de retirar as geradas anteriormente. */
  baseTags: LadderTag[]
}

function plan(program: GrafcetProgram): Plan {
  const state = useSimStore.getState()
  const restartFile = restartFileOf(state)
  const keptMain = state.ladder.rungs.filter((r) => !isMainRung(r))
  const keptRestart = (restartFile?.rungs ?? []).filter((r) => !isRestartRung(r))
  const generatedBits = state.tags.filter(isGeneratedBit)
  const baseTags = state.tags.filter((t) => !isGeneratedBit(t))
  // Endereços usados à mão ou já declarados pelo utilizador ficam reservados.
  const reserved = [...collectUsedAddresses({ rungs: keptMain }), ...collectUsedAddresses({ rungs: keptRestart }), ...baseTags.map((t) => t.address)]
  const result = grafcetToLadder({ ...program, transitions: transitionsOf(program) }, reserved, { startupBlock: true, existingTags: generatedBits, name: program.name })
  return { result, keptRestart, restartFileId: restartFile?.id ?? null, baseTags }
}

/** Compara o Ladder atual com o que o GRAFCET gera agora. */
export function ladderSyncStatus(program: GrafcetProgram): LadderSyncStatus {
  if (!hasGeneratedLadder()) return 'none'
  if (!program.steps.length || validateGrafcet(program).some((i) => i.level === 'error')) return 'blocked'
  const state = useSimStore.getState()
  const { result, restartFileId } = plan(program)
  const restart = restartFileId ? (state.projectFiles[state.activePlcId ?? '_general'] ?? []).find((f) => f.id === restartFileId)?.rungs ?? [] : []
  const sameMain = signature(state.ladder.rungs.filter(isMainRung)) === signature(result.rungs)
  const sameRestart = signature(restart.filter(isRestartRung)) === signature(result.startupRungs)
  return sameMain && sameRestart ? 'synced' : 'stale'
}

/** Pré-visualização para a confirmação da primeira geração. */
export function previewLadder(program: GrafcetProgram): LadderFromGrafcet {
  return plan(program).result
}

/** Gera ou atualiza o Ladder: substitui só as networks «GRAFCET ·» / «Complete restart ·»; as do utilizador ficam. */
export function applyLadderFromGrafcet(program: GrafcetProgram): LadderFromGrafcet {
  const { result, keptRestart, restartFileId, baseTags } = plan(program)
  const state = useSimStore.getState()
  state.replaceGeneratedRungs(result.rungs)

  const restartRungs = [...result.startupRungs, ...keptRestart]
  if (restartFileId) useSimStore.getState().updateProjectFile(restartFileId, { rungs: restartRungs, exec: 'obStartup' })
  else {
    const fileId = useSimStore.getState().addProjectFile('programBlocks', blockDisplayName('OB', 'Complete restart', 100))
    if (fileId) useSimStore.getState().updateProjectFile(fileId, { rungs: restartRungs, exec: 'obStartup' })
  }

  // Tabela de variáveis: retira as memórias geradas antes, acrescenta o que falta e nunca sobrepõe nomes do utilizador.
  const tagState = useSimStore.getState()
  const names = new Set(baseTags.map((t) => t.name))
  const uniqueName = (base: string) => { let name = base; let n = 2; while (names.has(name)) name = `${base}_${n++}`; names.add(name); return name }
  const generated = new Map(result.tags.map((t) => [t.address.toUpperCase(), t]))
  const known = new Set(baseTags.map((t) => t.address.toUpperCase()))
  const updated = baseTags.map((t) => {
    const g = generated.get(t.address.toUpperCase())
    if (!g) return t
    const unnamed = !t.name || t.name === t.address
    const autoComment = !t.comment || GENERATED_COMMENT.test(t.comment)
    return { ...t, name: unnamed && g.name !== t.address ? uniqueName(g.name) : t.name, comment: autoComment ? g.comment : t.comment }
  })
  const added: LadderTag[] = result.tags.filter((t) => !known.has(t.address.toUpperCase())).map((t) => ({
    id: nanoid(6), address: t.address, name: t.name === t.address ? t.name : uniqueName(t.name), dataType: defaultDataTypeFor(t.address) as LadderTag['dataType'], comment: t.comment,
  }))
  tagState.setTags([...updated, ...added])
  return result
}
