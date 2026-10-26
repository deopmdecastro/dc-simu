import type { LadderRung, LadderTag } from '../types'
import { lintLadder, type LadderIssue, type LadderIssueLevel } from './ladderLint'
import type { ProjectFile } from './projectFiles'

/**
 * LADDER-COMPILE-01 — «Compilar» o programa do PLC ativo, como no TIA Portal:
 * verifica o Main [OB1], os FC1/FC2, os blocos de programa (OBs cíclicos/arranque
 * e FCs chamados por CALL) e as referências cruzadas entre blocos.
 *
 *  - Verificações locais (endereços, operandos, LBL/JMP, presets…) correm em cada
 *    bloco isoladamente — as etiquetas de salto são locais ao bloco.
 *  - Verificações globais (bobinas duplicadas, SET sem RESET, lidos e nunca escritos,
 *    tags declaradas e nunca escritas…) correm sobre todos os blocos juntos.
 *  - Verificações próprias da compilação: CALL para bloco inexistente, chamadas
 *    recursivas, blocos nunca chamados e Main vazio.
 *
 * O módulo é puro (sem store/DOM) para ser testado em `scripts/saas-smoke.ts`.
 */

export interface CompileBlock {
  id: string
  name: string
  kind: 'main' | 'fc' | 'obCyclic' | 'obStartup'
  rungs: LadderRung[]
}

export interface CompileIssue extends LadderIssue {
  blockId: string
  blockName: string
}

export interface CompileResult {
  ok: boolean
  errors: number
  warnings: number
  infos: number
  issues: CompileIssue[]
  blocks: number
  networks: number
  instructions: number
  /** Impressão digital do programa compilado (deteta alterações posteriores). */
  hash: string
  compiledAt: string
  durationMs: number
}

export interface CompileInput {
  main: LadderRung[]
  fc1?: LadderRung[]
  fc2?: LadderRung[]
  fcAdded?: Partial<Record<'fc1' | 'fc2', boolean>>
  fcNames?: Partial<Record<'fc1' | 'fc2', string>>
  files?: ProjectFile[]
  tags?: LadderTag[]
  physicalInputs?: boolean
}

/** Ids de problemas que dependem de todos os blocos (ver ladderLint). */
const GLOBAL_PREFIXES = ['dup:', 'mix:', 'set:', 'reset:', 'timer:', 'unwritten:', 'unread:', 'undeclared:', 'untraced:', 'mw-test:', 'mw-write:']
const isGlobal = (issue: LadderIssue) => GLOBAL_PREFIXES.some((prefix) => issue.id.startsWith(prefix))
const LEVEL_ORDER: Record<LadderIssueLevel, number> = { error: 0, warning: 1, info: 2 }

/** FNV-1a 32 bits — suficiente para detetar alterações, não é criptográfico. */
export function programHash(value: unknown): string {
  const text = JSON.stringify(value)
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

export function compileBlocks(input: CompileInput): CompileBlock[] {
  const blocks: CompileBlock[] = [{ id: 'main', name: 'Main [OB1]', kind: 'main', rungs: input.main }]
  for (const id of ['fc1', 'fc2'] as const) {
    const rungs = input[id] ?? []
    if (input.fcAdded?.[id] || rungs.length) blocks.push({ id, name: `${input.fcNames?.[id]?.trim() || id.toUpperCase()} [${id.toUpperCase()}]`, kind: 'fc', rungs })
  }
  for (const file of input.files ?? []) {
    if (file.folder !== 'programBlocks') continue
    blocks.push({ id: file.id, name: file.name, kind: file.exec ?? 'fc', rungs: file.rungs ?? [] })
  }
  return blocks
}

const named = (block: CompileBlock, multi: boolean) => block.rungs.map((rung, index) => ({
  ...rung,
  name: `${multi ? `${block.name} · ` : ''}${rung.name || `Network ${index + 1}`}`,
}))

function countInstructions(rungs: LadderRung[]): number {
  return rungs.reduce((total, rung) => total
    + rung.branches.reduce((sum, branch) => sum + branch.elements.length, 0)
    + rung.coils.length
    + [rung.timer, rung.counter, rung.move, rung.math, rung.call, rung.limit, rung.scale, rung.jump].filter(Boolean).length, 0)
}

export function compileLadder(input: CompileInput, now: () => number = () => Date.now()): CompileResult {
  const started = now()
  const blocks = compileBlocks(input)
  const multi = blocks.length > 1
  const blockOfRung = new Map<string, CompileBlock>()
  for (const block of blocks) for (const rung of block.rungs) blockOfRung.set(rung.id, block)
  const issues: CompileIssue[] = []
  const seen = new Set<string>()
  const add = (issue: LadderIssue, fallback: CompileBlock) => {
    const block = (issue.rungId && blockOfRung.get(issue.rungId)) || fallback
    const key = `${block.id}:${issue.id}`
    if (seen.has(key)) return
    seen.add(key)
    issues.push({ ...issue, blockId: block.id, blockName: block.name })
  }
  const main = blocks[0]

  // 1) verificações locais por bloco
  for (const block of blocks) {
    for (const issue of lintLadder({ rungs: named(block, multi) }, { physicalInputs: input.physicalInputs })) if (!isGlobal(issue)) add(issue, block)
  }
  // 2) referências cruzadas sobre o programa completo
  const all = blocks.flatMap((block) => named(block, multi))
  for (const issue of lintLadder({ rungs: all }, { physicalInputs: input.physicalInputs, tags: input.tags })) if (isGlobal(issue)) add(issue, main)

  // 3) chamadas entre blocos
  const callable = new Map(blocks.filter((block) => block.kind !== 'main').map((block) => [block.id, block]))
  const calls = new Map<string, Set<string>>()
  for (const block of blocks) {
    block.rungs.forEach((rung, index) => {
      if (!rung.call) return
      const where = `${multi ? `${block.name} · ` : ''}${rung.name || `Network ${index + 1}`}`
      const target = rung.call.targetId
      if (!target) add({ id: `${rung.id}:call-empty`, level: 'error', message: `${where}: CALL sem bloco de destino.`, rungId: rung.id }, block)
      else if (!callable.has(target)) add({ id: `${rung.id}:call-missing`, level: 'error', message: `${where}: CALL para um bloco que já não existe — a chamada é ignorada.`, rungId: rung.id }, block)
      else if (target === block.id) add({ id: `${rung.id}:call-self`, level: 'error', message: `${where}: o bloco ${block.name} chama-se a si próprio (recursão).`, rungId: rung.id }, block)
      else {
        const targetBlock = callable.get(target)!
        if (targetBlock.kind === 'obCyclic' || targetBlock.kind === 'obStartup') add({ id: `${rung.id}:call-ob`, level: 'warning', message: `${where}: CALL para ${targetBlock.name}, que já corre automaticamente (${targetBlock.kind === 'obCyclic' ? 'OB cíclico' : 'OB de arranque'}) — corre duas vezes.`, rungId: rung.id }, block)
        calls.set(block.id, (calls.get(block.id) ?? new Set()).add(target))
      }
    })
  }
  // ciclos indiretos (A → B → A)
  const reported = new Set<string>()
  const visit = (id: string, path: string[]) => {
    for (const next of calls.get(id) ?? []) {
      if (path.includes(next)) {
        const cycle = [...path.slice(path.indexOf(next)), next]
        const key = [...cycle].sort().join('>')
        if (!reported.has(key) && cycle.length > 2) {
          reported.add(key)
          const names = cycle.map((blockId) => blocks.find((block) => block.id === blockId)?.name ?? blockId)
          add({ id: `call-cycle:${key}`, level: 'error', message: `Chamadas em ciclo: ${names.join(' → ')} — o PLC entraria em recursão infinita.` }, blocks.find((block) => block.id === next) ?? main)
        }
        continue
      }
      visit(next, [...path, next])
    }
  }
  for (const block of blocks) visit(block.id, [block.id])
  const called = new Set([...calls.values()].flatMap((set) => [...set]))
  for (const block of blocks) {
    if (block.kind === 'fc' && !called.has(block.id) && block.rungs.length) add({ id: `uncalled:${block.id}`, level: 'info', message: `${block.name} nunca é chamado por CALL — não é executado.` }, block)
  }
  if (!main.rungs.length) add({ id: 'main-empty', level: 'warning', message: 'O Main [OB1] não tem networks — o PLC não executa nada em cada ciclo.' }, main)

  issues.sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level])
  const errors = issues.filter((issue) => issue.level === 'error').length
  const warnings = issues.filter((issue) => issue.level === 'warning').length
  return {
    ok: errors === 0,
    errors,
    warnings,
    infos: issues.length - errors - warnings,
    issues,
    blocks: blocks.length,
    networks: blocks.reduce((total, block) => total + block.rungs.length, 0),
    instructions: blocks.reduce((total, block) => total + countInstructions(block.rungs), 0),
    hash: compileHash(input),
    compiledAt: new Date(started).toISOString(),
    durationMs: Math.max(0, now() - started),
  }
}

/** Hash só do que entra na compilação (ignora a data de edição dos ficheiros). */
export function compileHash(input: CompileInput): string {
  return programHash({
    main: input.main, fc1: input.fc1 ?? [], fc2: input.fc2 ?? [], fcAdded: input.fcAdded ?? {},
    files: (input.files ?? []).filter((file) => file.folder === 'programBlocks').map((file) => ({ id: file.id, exec: file.exec, rungs: file.rungs ?? [] })),
    tags: input.tags ?? [],
  })
}

export function compileSummary(result: CompileResult): string {
  const head = result.ok ? 'Compilação concluída' : 'Compilação com erros'
  return `${head}: ${result.errors} erro(s), ${result.warnings} aviso(s) · ${result.blocks} bloco(s), ${result.networks} network(s), ${result.instructions} instrução(ões)`
}

/** Opção «bloquear RUN quando a compilação tem erros» (guardada no navegador). */
export const COMPILE_GATE_KEY = 'dcsimu:ladder:compile-gate'
export function compileGateEnabled(): boolean {
  try { return localStorage.getItem(COMPILE_GATE_KEY) === '1' } catch { return false }
}

/** Subconjunto do estado do simulador usado para compilar o PLC ativo. */
export interface CompileState {
  ladder: { rungs: LadderRung[] }
  fcBlocks: { fc1: LadderRung[]; fc2: LadderRung[] }
  fcAdded: Record<'fc1' | 'fc2', boolean>
  fcNames: Partial<Record<'fc1' | 'fc2', string>>
  projectFiles: Record<string, ProjectFile[]>
  activePlcId: string | null
  tags: LadderTag[]
}

export function compileInputOf(state: CompileState, physicalInputs: boolean): CompileInput {
  return {
    main: state.ladder.rungs,
    fc1: state.fcBlocks.fc1,
    fc2: state.fcBlocks.fc2,
    fcAdded: state.fcAdded,
    fcNames: state.fcNames,
    files: state.projectFiles[state.activePlcId ?? '_general'] ?? [],
    tags: state.tags,
    physicalInputs,
  }
}
