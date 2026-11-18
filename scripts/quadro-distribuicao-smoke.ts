import assert from 'node:assert/strict'
import {
  nativeQuadroDistribuicaoContent,
  NATIVE_QUADRO_DISTRIBUICAO_ID,
  NATIVE_QUADRO_DISTRIBUICAO_NAME,
} from '../src/project/nativeQuadroDistribuicao'
import { nativeProjectSeeds } from '../src/project/nativeProjects'
import { isNativeProjectId, RETAINED_NATIVE_PROJECT_ID } from '../src/project/nativeProjectIds'
import {
  FREE_NATIVE_PROJECT_IDS, listMissingFreeNativeProjects, openFreeNativeProject,
  saveFreeNativeProject, resetFreeNativeProject,
} from '../src/project/freeNativeSandbox'
import { computeContinuity, internalBridges, sourceTerminalIds } from '../src/electrical/engine'
import { evaluateShortCircuits } from '../src/electrical/shortCircuitEngine'
import { detectDiagnostics } from '../src/utils/errorDetection'
import { localApi } from '../src/auth/localBackend'
import type { ElectricalComponent, Wire } from '../src/types'

let checks = 0
const check = (condition: unknown, label: string) => { assert.ok(condition, label); checks++; console.log('PASS — ' + label) }
const content = nativeQuadroDistribuicaoContent()
const components = content.components as ElectricalComponent[]
const wires = content.wires as Wire[]
const byRef = (ref: string, list = components) => { const hit = list.find((c) => c.ref === ref); assert.ok(hit, ref); return hit }
const terminal = (ref: string, label: string) => { const hit = byRef(ref).terminals.find((t) => t.label === label); assert.ok(hit, `${ref}:${label}`); return hit.id }
const live = (list = components, sources = sourceTerminalIds(list, {}, wires)) => computeContinuity(list, wires, sources).energizedTerminals
const withOpen = (ref: string) => components.map((c) => c.ref === ref ? { ...c, state: { ...c.state, closed: false, tripped: true } } : c)

console.log('— QGD nativo: topologia, proteções, registo e persistência —')
check(content.nativeId === NATIVE_QUADRO_DISTRIBUICAO_ID, 'ID nativo estável')
check(components.length === 47 && wires.length === 76, '47 componentes e 76 condutores na semente revista')
const required = ['QE1', 'QG1', 'DPS1', 'PM1', 'HL1', 'BB_ESCADA', 'ID_TRIF', 'ID_GERAL', 'RCBO_ESP', 'BB_COMB1', 'Q_ILUM', 'Q_TOM1', 'Q_TOM2', 'Q_ESP', 'BB_COMB2', 'Q_TRIF', 'N_BAR', 'PE_BAR', 'LUM1', 'TOM_GERAL', 'TOM_GERAL2', 'TOM_ESP', 'TOM_TRIF', 'QM1', 'M1']
check(required.every((ref) => components.some((c) => c.ref === ref)), 'Equipamentos e cinco circuitos terminais presentes, incluindo duas tomadas gerais independentes')
check(byRef('ID_GERAL').type === 'residualBreakerHagerCfc225p', 'Setor monofásico usa efetivamente o diferencial Hager 2P')
const holes = byRef('QE1').state.holes as Array<{ face: string }>
check(holes.length === 5 && holes.every((h) => h.face === 'bottom'), 'Cinco furos inferiores para bucins')
const terminalIds = new Set(components.flatMap((c) => c.terminals.map((t) => t.id)))
check(terminalIds.size === components.flatMap((c) => c.terminals).length, 'Bornes com identificadores únicos')
check(new Set(components.map((c) => c.id)).size === components.length && new Set(wires.map((w) => w.id)).size === wires.length, 'Componentes e cabos sem IDs duplicados')
check(wires.every((w) => terminalIds.has(w.fromTerminalId) && terminalIds.has(w.toTerminalId)), 'Nenhum cabo órfão')
check(detectDiagnostics(components, wires, new Set()).length === 0, 'Diagnóstico de fábrica: zero erros e zero avisos, sem desativar regras')
check(internalBridges(byRef('DPS1')).length === 0, 'DPS 3P+N em derivação não cria curto permanente entre L, N e PE')
const energized = live()
check(!evaluateShortCircuits(components, wires, energized).active, 'Montagem de fábrica sem curto-circuito')
for (const [ref, label] of [['QG1', '2'], ['PM1', 'L1-OUT'], ['HL1', 'L1'], ['LUM1', 'X1'], ['TOM_GERAL', 'L-IN'], ['TOM_GERAL2', 'L-IN'], ['TOM_ESP', 'L-IN'], ['M1', 'U1'], ['M1', 'V1'], ['M1', 'W1']]) {
  check(energized.has(terminal(ref, label)), `${ref}:${label} alimentado com proteções armadas`)
}
for (const ref of ['BB_COMB1', 'BB_COMB2']) {
  const c = byRef(ref)
  check(c.terminals.some((t) => t.label === 'L1.1') && c.terminals.some((t) => t.label === 'L1.2'), `${ref}: bornes correspondem ao modo de polos real`)
  check(wires.some((w) => c.terminals.some((t) => t.id === w.fromTerminalId)) && wires.some((w) => c.terminals.some((t) => t.id === w.toTerminalId)), `${ref}: entrada e saída realmente cabladas`)
}
const offMain = live(withOpen('QG1'))
check(!offMain.has(terminal('LUM1', 'X1')) && !offMain.has(terminal('M1', 'U1')), 'Corte geral desliga iluminação e motor')
const offLight = live(withOpen('Q_ILUM'))
check(!offLight.has(terminal('LUM1', 'X1')) && offLight.has(terminal('TOM_GERAL', 'L-IN')), 'Corte da iluminação não desliga as tomadas')
const offKitchen = live(withOpen('Q_TOM2'))
check(!offKitchen.has(terminal('TOM_GERAL2', 'L-IN')) && offKitchen.has(terminal('TOM_GERAL', 'L-IN')), 'Cada circuito de tomadas gerais é independente')
const offSpecial = live(withOpen('RCBO_ESP'))
check(!offSpecial.has(terminal('TOM_ESP', 'L-IN')) && offSpecial.has(terminal('LUM1', 'X1')), 'RCBO corta apenas o circuito especial')
const offMotor = live(withOpen('QM1'))
check(!offMotor.has(terminal('M1', 'U1')) && offMotor.has(terminal('TOM_TRIF', 'L1-OUT')), 'Disjuntor-motor corta o motor sem cortar a tomada CEE')
check(!live(withOpen('ID_TRIF'), [terminal('ID_GERAL', 'N2')]).has(terminal('TOM_TRIF', 'N-IN')), 'Neutros a jusante dos dois diferenciais não estão unidos')

const seeds = nativeProjectSeeds().filter((seed) => seed.id === NATIVE_QUADRO_DISTRIBUICAO_ID)
check(seeds.length === 1 && seeds[0].name === NATIVE_QUADRO_DISTRIBUICAO_NAME && seeds[0].ownerId === 'dcsimu-admin', 'QGD registado uma única vez na lista nativa da conta Admin')
check(!isNativeProjectId(NATIVE_QUADRO_DISTRIBUICAO_ID) && isNativeProjectId(RETAINED_NATIVE_PROJECT_ID), 'QGD legado não é reclassificado como nativo; só o UUID cloud retido é nativo')
check(FREE_NATIVE_PROJECT_IDS.length === 0, 'não há cartões nativos sintéticos nem cópias QGD automaticamente semeadas')
check(listMissingFreeNativeProjects('qgd-user-a', []).length === 0, 'uma conta limpa não recebe QGD nem outros exemplos locais inventados')
assert.throws(() => openFreeNativeProject('qgd-user-a', NATIVE_QUADRO_DISTRIBUICAO_ID), /não encontrado/)
check(true, 'abrir um QGD ausente não fabrica conteúdo em substituição da cloud')

// Contrato real do backend local, incluindo um rascunho que JÁ existia.
// Armazenamento descartável; nunca toca nos projetos de uma pessoa real.
const previousStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
const memory = new Map<string, string>()
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
  getItem: (key: string) => memory.get(key) ?? null,
  setItem: (key: string, value: string) => memory.set(key, String(value)),
  removeItem: (key: string) => memory.delete(key), clear: () => memory.clear(),
  key: (index: number) => [...memory.keys()][index] ?? null, get length() { return memory.size },
} })
try {
  const key = `dcsimu:free-native-draft:v1:dcsimu-user:${NATIVE_QUADRO_DISTRIBUICAO_ID}`
  const edited = structuredClone(content)
  ;(edited.components as ElectricalComponent[])[0].label = 'Rascunho privado QGD'
  const draft = JSON.stringify({ revision: 0, updatedAt: '2025-01-01T00:00:00Z', content: edited })
  localStorage.setItem(key, draft)
  const missing = listMissingFreeNativeProjects('dcsimu-user', [])
  check(missing.length === 1 && missing[0].role === 'editor' && missing[0].owner !== 'DC-Simu', 'rascunho QGD já existente continua acessível e identificado como local antigo')
  check(localStorage.getItem(key) === draft, 'listar não reescreve o rascunho nem perde a edição pessoal')
  check(!listMissingFreeNativeProjects('dcsimu-user', [{ id: NATIVE_QUADRO_DISTRIBUICAO_ID }]).length, 'linha real com o mesmo ID não é sombreada por um segundo cartão local')
  const saved = saveFreeNativeProject('dcsimu-user', NATIVE_QUADRO_DISTRIBUICAO_ID, edited, 0)
  check(saved.revision === 1 && openFreeNativeProject('dcsimu-user', NATIVE_QUADRO_DISTRIBUICAO_ID).revision === 1, 'rascunho legado mantém gravação por revisão')
  assert.throws(() => saveFreeNativeProject('dcsimu-user', NATIVE_QUADRO_DISTRIBUICAO_ID, content, 0), /noutro separador/)
  assert.throws(() => openFreeNativeProject('another-user', NATIVE_QUADRO_DISTRIBUICAO_ID), /não encontrado/)
  check(true, 'conflitos e isolamento entre utilizadores permanecem efetivos')
  localStorage.setItem('dcsimu:account:session:v1', 'dcsimu-user')
  const rows = await localApi<Array<{ id: string; role: string }>>('/projects')
  check(rows.some(p => p.id === NATIVE_QUADRO_DISTRIBUICAO_ID && p.role === 'editor'), 'API local lista apenas o rascunho realmente existente')
  const ids: string[] = []
  for (let i = 0; i < 3; i++) {
    const p = await localApi<{ id: string }>('/projects', 'POST', { name: i ? `Projeto pessoal de teste ${i}` : 'DC-Simu — QGD pessoal', content: i ? {} : content })
    ids.push(p.id)
  }
  await assert.rejects(localApi('/projects', 'POST', { name: 'Excede quota', content: {} }), /limite|plano|Free|projetos/i)
  const personal = await localApi<{ role: string; content: typeof content }>(`/projects/${ids[0]}`)
  check(personal.role === 'owner' && (personal.content.components as ElectricalComponent[]).length === 47, 'cópia QGD pessoal com nome DC-Simu mantém propriedade e todos os componentes')
  const opened = await localApi<{ revision: number }>(`/projects/${NATIVE_QUADRO_DISTRIBUICAO_ID}`)
  await localApi(`/projects/${NATIVE_QUADRO_DISTRIBUICAO_ID}`, 'PUT', { revision: opened.revision, content: edited })
  const reopened = await localApi<{ content: { components: ElectricalComponent[] } }>(`/projects/${NATIVE_QUADRO_DISTRIBUICAO_ID}`)
  check(reopened.content.components[0].label === 'Rascunho privado QGD', 'rascunho local existente pode guardar com a quota pessoal cheia')
  resetFreeNativeProject('dcsimu-user', NATIVE_QUADRO_DISTRIBUICAO_ID)
  check(!listMissingFreeNativeProjects('dcsimu-user', []).length, 'reposição explícita remove só o rascunho, sem o voltar a semear')
  check((await localApi<{ role: string }>(`/projects/${ids[0]}`)).role === 'owner', 'repor rascunho não elimina nem altera o projeto pessoal')
} finally {
  if (previousStorage) Object.defineProperty(globalThis, 'localStorage', previousStorage)
  else Reflect.deleteProperty(globalThis, 'localStorage')
}
console.log(`\n${checks} verificações QGD e compatibilidade passaram.`)
