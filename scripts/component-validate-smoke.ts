import { validateDefinition } from '../src/admin/editor3d/validate'
import { DEFAULT_META, defaultDefinition, defaultPart } from '../src/catalog/definition'
import type { ComponentDefinition, TerminalDef } from '../src/catalog/types'

let failed = 0
const check = (name: string, ok: boolean) => { console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}`); if (!ok) failed++ }
const meta = { ...DEFAULT_META, name: 'Teste' }
const term = (id: string, label: string, position: [number, number, number] = [0, 0, 0]): TerminalDef => ({
  id, label, name: label, position, normal: [0, 1, 0], kind: 'screw', terminalType: 'power', polarity: 'none', electricalClass: 'power', direction: 'inout', accepts: '', color: '#ccc',
} as unknown as TerminalDef)
const base = (): ComponentDefinition => {
  const d = defaultDefinition()
  d.parts = [defaultPart('box', d.materials[0]?.id ?? null, 'Corpo')]
  d.terminals = [term('t1', '1', [0, 0, 0]), term('t2', '2', [10, 0, 0])]
  return d
}
const texts = (d: ComponentDefinition, level?: 'error' | 'warn') => validateDefinition(d, meta).filter((i) => !level || i.level === level).map((i) => i.text)

check('definição válida não gera erros', texts(base(), 'error').length === 0)

let d = base(); d.terminals[1] = term('t1', '2', [10, 0, 0])
check('identificadores de borne repetidos são erro', texts(d, 'error').some((t) => t.includes('mesmo identificador interno «t1»')))

d = base(); d.terminals[1] = term('t2', '2', [0.3, 0, 0])
check('bornes sobrepostos geram aviso', texts(d, 'warn').some((t) => t.includes('sobrepostos')))

d = base(); d.terminals[0] = { ...d.terminals[0], normal: [0, 0, 0] }
check('normal nula gera aviso', texts(d, 'warn').some((t) => t.includes('normal nula')))

d = base(); d.terminals[0] = { ...d.terminals[0], position: [NaN, 0, 0] }
check('posição NaN de borne é erro', texts(d, 'error').some((t) => t.includes('posição inválida')))

d = base(); d.parts[0] = { ...d.parts[0], scale: [0, 1, 1] }
check('escala nula gera aviso', texts(d, 'warn').some((t) => t.includes('fica invisível')))

d = base(); d.parts[0] = { ...d.parts[0], size: [Infinity, 1, 1] }
check('tamanho infinito é erro', texts(d, 'error').some((t) => t.includes('valores numéricos inválidos')))

d = base(); d.parts[0] = { ...d.parts[0], parentId: 'nao_existe' }
check('pai inexistente é erro', texts(d, 'error').some((t) => t.includes('pai inexistente')))

d = base(); d.parts[0] = { ...d.parts[0], materialId: 'mat_fantasma' }
check('material inexistente gera aviso', texts(d, 'warn').some((t) => t.includes('material que já não existe')))

d = base(); d.parts = [d.parts[0], { ...d.parts[0] }]
check('peças com id repetido são erro', texts(d, 'error').some((t) => t.includes('mesmo identificador interno')))

if (failed) { console.error(`${failed} falha(s)`); process.exit(1) }
console.log('component-validate: tudo OK')
