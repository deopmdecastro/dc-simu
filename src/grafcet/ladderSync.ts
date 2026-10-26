import { nanoid } from 'nanoid'
import type { LadderRung, LadderTag } from '../types'
import { useSimStore } from '../store/useSimStore'
import { collectUsedAddresses, defaultDataTypeFor } from '../ladder/ladderEngine'
import { blockDisplayName, suggestNumber } from '../ladder/blockCatalog'
import type { ProjectFile } from '../ladder/projectFiles'
import { transitionsOf, validateGrafcet, type GrafcetProgram } from './engine'
import { grafcetToLadder, type LadderFromGrafcet } from './toLadder'
import { WORD_FC_GRAFCET, WORD_FC_OUTPUTS, WORD_REGISTER_COMMENT, WORD_REGISTER_NAME, grafcetToLadderWord, wordMethodBlocker } from './toLadderWord'

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

/** Registo de etapa (G0 = %MW) criado pelo método «registo de etapa»: refeito a cada atualização. */
const isGeneratedWord = (t: LadderTag) => /^MW\d+$/i.test(t.address.trim().replace(/^%/, '')) && t.name === WORD_REGISTER_NAME && t.comment === WORD_REGISTER_COMMENT

const WORD_FC_LABELS = [WORD_FC_GRAFCET, WORD_FC_OUTPUTS]
/** FC gerado pelo método «registo de etapa»: «Grafcet [FC n]» / «Outputs [FC n]». */
const generatedFcOf = (files: ProjectFile[], label: string) =>
  files.find((f) => f.folder === 'programBlocks' && !f.exec && new RegExp(`^${label}\\s*\\[FC\\s*\\d+\\]$`, 'i').test(f.name.trim()))
const plcFilesOf = (state: ReturnType<typeof useSimStore.getState>): ProjectFile[] => state.projectFiles[state.activePlcId ?? '_general'] ?? []

/** Assinatura de networks sem ids (os ids mudam em cada geração); o alvo de um CALL conta pelo nome do FC gerado. */
const signature = (rungs: LadderRung[], files: ProjectFile[] = []) => JSON.stringify(rungs, (key, value) => {
  if (key === 'id') return undefined
  if (key === 'targetId' && typeof value === 'string') {
    const file = files.find((f) => f.id === value)
    return (file && WORD_FC_LABELS.find((label) => generatedFcOf([file], label))) || value
  }
  return value
})

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
  const baseTags = state.tags.filter((t) => !isGeneratedBit(t) && !isGeneratedWord(t))
  // Endereços usados à mão ou já declarados pelo utilizador ficam reservados.
  const reserved = [...collectUsedAddresses({ rungs: keptMain }), ...collectUsedAddresses({ rungs: keptRestart }), ...baseTags.map((t) => t.address)]
  const full = { ...program, transitions: transitionsOf(program) }
  // Sequências simples → registo de etapa (G0 em %MW + FC Grafcet/Outputs); o resto → bits de etapa com SET/RESET.
  const blocker = wordMethodBlocker(full)
  let result: LadderFromGrafcet
  if (!blocker) {
    const word = grafcetToLadderWord(full, { reserved, tags: baseTags, name: program.name })
    const blocks = [{ label: WORD_FC_GRAFCET, rungs: word.grafcetRungs }, { label: WORD_FC_OUTPUTS, rungs: word.outputRungs }].filter((b) => b.rungs.length)
    const call = (label: string): LadderRung => ({ id: nanoid(6), name: `${MAIN_PREFIX} Chamar ${label}`, branches: [{ id: nanoid(6), elements: [] }], coils: [], enabled: true, call: { targetId: label } })
    result = { rungs: blocks.map((b) => call(b.label)), startupRungs: word.startupRungs, stepBits: {}, tags: word.tags, warnings: word.warnings, method: 'word', blocks }
  } else result = { ...grafcetToLadder(full, reserved, { startupBlock: true, existingTags: generatedBits, name: program.name }), method: 'bit', fallbackReason: blocker }
  return { result, keptRestart, restartFileId: restartFile?.id ?? null, baseTags }
}

/** Compara o Ladder atual com o que o GRAFCET gera agora. */
export function ladderSyncStatus(program: GrafcetProgram): LadderSyncStatus {
  if (!hasGeneratedLadder()) return 'none'
  if (!program.steps.length || validateGrafcet(program).some((i) => i.level === 'error')) return 'blocked'
  const state = useSimStore.getState()
  const { result, restartFileId } = plan(program)
  const restart = restartFileId ? (state.projectFiles[state.activePlcId ?? '_general'] ?? []).find((f) => f.id === restartFileId)?.rungs ?? [] : []
  const files = plcFilesOf(state)
  const sameMain = signature(state.ladder.rungs.filter(isMainRung), files) === signature(result.rungs)
  const sameRestart = signature(restart.filter(isRestartRung)) === signature(result.startupRungs)
  const wanted = new Map((result.blocks ?? []).map((b) => [b.label, b.rungs]))
  const sameBlocks = WORD_FC_LABELS.every((label) => {
    const file = generatedFcOf(files, label)
    const rungs = wanted.get(label)
    return rungs ? !!file && signature(file.rungs ?? []) === signature(rungs) : !file
  })
  return sameMain && sameRestart && sameBlocks ? 'synced' : 'stale'
}

export interface RungDiff {
  added: string[]
  removed: string[]
  changed: string[]
  unchanged: number
}

export interface LadderDiff {
  /** Main [OB1], Complete restart [OB100] e FCs gerados, por esta ordem. */
  sections: Array<{ label: string; diff: RungDiff }>
  tagsAdded: string[]
  tagsRemoved: string[]
  /** true quando nada muda — atualizar seria um no-op. */
  empty: boolean
}

const rungKey = (rung: LadderRung, seen: Map<string, number>) => {
  const base = rung.name.trim() || '(sem nome)'
  const n = (seen.get(base) ?? 0) + 1
  seen.set(base, n)
  return n > 1 ? `${base} #${n}` : base
}

/** Compara duas listas de networks pelo nome (ids mudam em cada geração) e pelo conteúdo. */
export function diffRungs(before: LadderRung[], after: LadderRung[], files: ProjectFile[] = []): RungDiff {
  const index = (rungs: LadderRung[], withFiles: boolean) => {
    const seen = new Map<string, number>()
    return new Map(rungs.map((rung) => [rungKey(rung, seen), signature([rung], withFiles ? files : [])]))
  }
  const old = index(before, true)
  const next = index(after, false)
  const diff: RungDiff = { added: [], removed: [], changed: [], unchanged: 0 }
  for (const [key, sig] of next) {
    if (!old.has(key)) diff.added.push(key)
    else if (old.get(key) !== sig) diff.changed.push(key)
    else diff.unchanged++
  }
  for (const key of old.keys()) if (!next.has(key)) diff.removed.push(key)
  return diff
}

/** GRAFCET-LADDER-DIFF-01 — o que «Atualizar Ladder» vai mudar, antes de substituir. */
export function diffGeneratedLadder(program: GrafcetProgram): LadderDiff {
  const state = useSimStore.getState()
  const { result, restartFileId, baseTags } = plan(program)
  const files = plcFilesOf(state)
  const restart = restartFileId ? files.find((f) => f.id === restartFileId)?.rungs ?? [] : []
  const sections: LadderDiff['sections'] = [
    { label: 'Main [OB 1]', diff: diffRungs(state.ladder.rungs.filter(isMainRung), result.rungs, files) },
    { label: 'Complete restart [OB 100]', diff: diffRungs(restart.filter(isRestartRung), result.startupRungs) },
  ]
  const wanted = new Map((result.blocks ?? []).map((b) => [b.label, b.rungs]))
  for (const label of WORD_FC_LABELS) {
    const file = generatedFcOf(files, label)
    const rungs = wanted.get(label)
    if (!file && !rungs) continue
    sections.push({ label: `FC ${label}`, diff: diffRungs(file?.rungs ?? [], rungs ?? []) })
  }
  const current = new Set(state.tags.map((t) => t.address.toUpperCase()))
  const kept = new Set(baseTags.map((t) => t.address.toUpperCase()))
  const generated = new Set(result.tags.map((t) => t.address.toUpperCase()))
  const tagsAdded = [...generated].filter((a) => !current.has(a)).sort()
  const tagsRemoved = state.tags.filter((t) => !kept.has(t.address.toUpperCase()) && !generated.has(t.address.toUpperCase())).map((t) => t.address.toUpperCase()).sort()
  const empty = sections.every(({ diff }) => !diff.added.length && !diff.removed.length && !diff.changed.length) && !tagsAdded.length && !tagsRemoved.length
  return { sections, tagsAdded, tagsRemoved, empty }
}

const MAX_LISTED = 4
const listNames = (names: string[]) => names.length <= MAX_LISTED ? names.join(', ') : `${names.slice(0, MAX_LISTED).join(', ')} e mais ${names.length - MAX_LISTED}`

/** Texto legível do diff para a confirmação. */
export function describeLadderDiff(diff: LadderDiff): string {
  if (diff.empty) return 'Nada muda: o Ladder já corresponde ao GRAFCET.'
  const lines: string[] = []
  for (const { label, diff: d } of diff.sections) {
    if (!d.added.length && !d.removed.length && !d.changed.length) continue
    lines.push(`${label}:`)
    if (d.added.length) lines.push(`  + ${d.added.length} nova(s): ${listNames(d.added)}`)
    if (d.changed.length) lines.push(`  ~ ${d.changed.length} alterada(s): ${listNames(d.changed)}`)
    if (d.removed.length) lines.push(`  − ${d.removed.length} removida(s): ${listNames(d.removed)}`)
    if (d.unchanged) lines.push(`  = ${d.unchanged} sem alterações`)
  }
  if (diff.tagsAdded.length) lines.push(`Variáveis novas: ${listNames(diff.tagsAdded)}`)
  if (diff.tagsRemoved.length) lines.push(`Variáveis geradas que saem: ${listNames(diff.tagsRemoved)}`)
  return lines.join('\n')
}

/** Pré-visualização para a confirmação da primeira geração. */
export function previewLadder(program: GrafcetProgram): LadderFromGrafcet {
  return plan(program).result
}

/** Gera ou atualiza o Ladder: substitui só as networks «GRAFCET ·» / «Complete restart ·»; as do utilizador ficam. */
export function applyLadderFromGrafcet(program: GrafcetProgram): LadderFromGrafcet {
  const { result, keptRestart, restartFileId, baseTags } = plan(program)
  const state = useSimStore.getState()
  // FC do método «registo de etapa»: cria ou atualiza; se o GRAFCET deixou de caber no método, apaga os que sobram.
  const targetIds = new Map<string, string>()
  for (const label of WORD_FC_LABELS) {
    const block = (result.blocks ?? []).find((b) => b.label === label)
    const files = plcFilesOf(useSimStore.getState())
    const file = generatedFcOf(files, label)
    if (!block) { if (file) useSimStore.getState().deleteProjectFile(file.id); continue }
    let id = file?.id ?? null
    if (!id) id = useSimStore.getState().addProjectFile('programBlocks', blockDisplayName('FC', label, suggestNumber(files, 'FC')))
    if (!id) continue
    useSimStore.getState().updateProjectFile(id, { rungs: block.rungs })
    targetIds.set(label, id)
  }
  const mainRungs = result.rungs.map((r) => (r.call && targetIds.has(r.call.targetId) ? { ...r, call: { targetId: targetIds.get(r.call.targetId)! } } : r))
  useSimStore.getState().replaceGeneratedRungs(mainRungs)

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
