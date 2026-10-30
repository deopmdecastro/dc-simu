import type { GrafcetProgram } from './engine'
import { importFluidSim4, type FluidSimImportMode } from './fluidSim4'

export const MAX_GRAFCET_IMPORT_BYTES = 5 * 1024 * 1024
const strings = (value: object, keys: string[]) => keys.every(key => (value as Record<string, unknown>)[key] === undefined || typeof (value as Record<string, unknown>)[key] === 'string')
const numbers = (value: object, keys: string[]) => keys.every(key => (value as Record<string, unknown>)[key] === undefined || typeof (value as Record<string, unknown>)[key] === 'number' && Number.isFinite((value as Record<string, number>)[key]))
const unique = (ids: string[]) => new Set(ids).size === ids.length && ids.every(id => !!id && id.length <= 256)
function validAction(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false
  const a = value as Record<string, unknown>
  return typeof a.id === 'string' && typeof a.address === 'string' && typeof a.condition === 'string' &&
    strings(a, ['variable', 'description', 'chart']) && numbers(a, ['timeMs', 'x', 'y', 'w', 'h', 'dx', 'dy']) &&
    (a.kind === undefined || ['N','S','R','D','L','A','DA','EV','C'].includes(a.kind as string)) &&
    (a.type === undefined || ['simple','conditional'].includes(a.type as string)) &&
    (a.allocation === undefined || ['continuous','activation','deactivation','event','compulsory'].includes(a.allocation as string)) &&
    (a.displayDescription === undefined || typeof a.displayDescription === 'boolean')
}
export async function readGrafcetFile(file: Pick<File, 'name' | 'size' | 'arrayBuffer'>, mode: FluidSimImportMode = 'strict'): Promise<{ program: GrafcetProgram; source: 'fluidsim4' | 'json'; warnings: string[] }> {
  if (!file.size || file.size > MAX_GRAFCET_IMPORT_BYTES) throw new Error('Selecione um ficheiro GRAFCET até 5 MB.')
  const bytes = new Uint8Array(await file.arrayBuffer())
  if (bytes.length > MAX_GRAFCET_IMPORT_BYTES) throw new Error('O ficheiro excede 5 MB.')
  if (/\.ct$/i.test(file.name)) {
    const result = importFluidSim4(bytes, mode)
    return { ...result, program: { ...result.program, name: file.name.replace(/\.ct$/i, '') }, source: 'fluidsim4' }
  }
  if (!/\.(json|grafcet)$/i.test(file.name)) throw new Error('Formato não suportado. Use .ct do FluidSIM 4, .json ou .grafcet.')
  let value: unknown
  try { value = JSON.parse(new TextDecoder().decode(bytes)) } catch { throw new Error('O ficheiro JSON não é válido.') }
  if (!value || typeof value !== 'object' || !Array.isArray((value as GrafcetProgram).steps)) throw new Error('Ficheiro inválido: faltam as etapas GRAFCET.')
  const program = value as GrafcetProgram
  if (program.importReview !== undefined && (!program.importReview || typeof program.importReview !== 'object' || program.importReview.source !== 'fluidsim4' || !Array.isArray(program.importReview.warnings) || program.importReview.warnings.length > 10000 || program.importReview.warnings.some(warning => typeof warning !== 'string'))) throw new Error('Ficheiro inválido: revisão da importação incorreta.')
  if (!strings(program, ['name', 'activeChart']) || program.steps.length > 2000 || program.steps.some(s => !s || typeof s.id !== 'string' || typeof s.name !== 'string' || typeof s.initial !== 'boolean' || typeof s.action !== 'string' || typeof s.condition !== 'string' || !strings(s, ['description', 'comment', 'chart', 'stepType', 'actionLayout']) || !numbers(s, ['x', 'y']))) throw new Error('Ficheiro inválido: estrutura das etapas incorreta.')
  const ids = new Set(program.steps.map(s => s.id))
  if (!unique(program.steps.map(s => s.id))) throw new Error('Ficheiro inválido: etapas repetidas ou sem identificador.')
  if (program.transitions !== undefined && (!Array.isArray(program.transitions) || program.transitions.length > 4000 || program.transitions.some(t => !t || typeof t.id !== 'string' || typeof t.condition !== 'string' || !strings(t, ['name', 'description', 'comment', 'chart', 'targetInfo', 'branchType']) || !numbers(t, ['x', 'y']) || !Array.isArray(t.from) || !Array.isArray(t.to) || [...t.from, ...t.to].some(id => typeof id !== 'string' || !ids.has(id))) || !unique(program.transitions.map(t => t.id)))) throw new Error('Ficheiro inválido: estrutura das transições incorreta.')
  for (const step of program.steps) {
    if (step.actions !== undefined && (!Array.isArray(step.actions) || step.actions.some(a => !validAction(a)))) throw new Error('Ficheiro inválido: estrutura das ações incorreta.')
  }
  if (program.freeActions !== undefined && (!Array.isArray(program.freeActions) || program.freeActions.some(a => !validAction(a)))) throw new Error('Ficheiro inválido: estrutura das ações soltas incorreta.')
  if (!unique([...program.steps.flatMap(s => s.actions ?? []), ...(program.freeActions ?? [])].map(a => a.id))) throw new Error('Ficheiro inválido: ações repetidas ou sem identificador.')
  if (program.comments !== undefined && (!Array.isArray(program.comments) || program.comments.some(c => !c || typeof c.id !== 'string' || typeof c.text !== 'string' || typeof c.x !== 'number' || typeof c.y !== 'number' || !numbers(c, ['x', 'y', 'fontSize']) || !strings(c, ['chart', 'fontWeight'])) || !unique(program.comments.map(c => c.id)))) throw new Error('Ficheiro inválido: comentários incorretos.')
  if (program.charts !== undefined && (!Array.isArray(program.charts) || program.charts.some(c => !c || typeof c.id !== 'string' || typeof c.name !== 'string' || typeof c.title !== 'string') || !unique(program.charts.map(c => c.id)))) throw new Error('Ficheiro inválido: páginas incorretas.')
  if (program.linkBends !== undefined && (!program.linkBends || typeof program.linkBends !== 'object' || Array.isArray(program.linkBends) || Object.values(program.linkBends).some(points => !Array.isArray(points) || points.length > 2000 || points.some(p => !p || typeof p.x !== 'number' || typeof p.y !== 'number' || !numbers(p, ['x', 'y']))))) throw new Error('Ficheiro inválido: pontos de ligação incorretos.')
  return { program, source: 'json', warnings: program.importReview?.warnings ?? [] }
}
