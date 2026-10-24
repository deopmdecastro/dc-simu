/** Páginas/folhas do esquema + etiquetas de rede (comunicação entre folhas):
 *  - duas redes soltas com a mesma etiqueta em folhas diferentes ficam unidas
 *    eletricamente (o motor de continuidade junta os nós «net:NOME»);
 *  - com várias folhas, um fio não pode ligar bornes de folhas diferentes;
 *  - folhas e entradas virtuais sobrevivem ao saveJSON/loadJSON.
 *  Corre com `npx tsx scripts/sheets-smoke.ts`. */
import { useSimStore } from '../src/store/useSimStore'
import { computeContinuity } from '../src/electrical/engine'
import { createComponent } from '../src/electrical/factory'
import type { Wire } from '../src/types'

let checks = 0
const ok = (label: string, condition: boolean) => {
  checks += 1
  if (!condition) { console.error(`[sheets] ${label}`); process.exit(1) }
}
const store = () => useSimStore.getState()

// ---- continuidade elétrica entre folhas via etiqueta de rede ----
const btn = createComponent('buttonNO', undefined, undefined, 0, 0, 0)
const lamp = createComponent('ledGreen', undefined, undefined, 1, 300, 0)
btn.sheet = 'sheet-1'
lamp.sheet = 'sheet-2'
const [btnA, btnB] = btn.terminals
const [lampA] = lamp.terminals

const wire = (id: string, patch: Partial<Wire>): Wire => ({
  id, fromTerminalId: '', toTerminalId: '', color: 'blue', gauge: '1.5', kind: 'control',
  flexibility: 'rigid', route: 'orthogonal', bend: 0.5, energized: false, ...patch,
} as Wire)

// folha 1: botão ->(ponta solta com etiqueta L1); folha 2: (ponta solta L1)-> entrada da lâmpada
const w1 = wire('w1', { fromTerminalId: btnA.id, toTerminalId: '', toPoint: { x: 590, y: 40 }, netTo: 'L1' })
const w2 = wire('w2', { fromTerminalId: '', toTerminalId: lampA.id, fromPoint: { x: 590, y: 40 }, netFrom: 'L1' })

const linked = computeContinuity([btn, lamp], [w1, w2], [btnA.id])
ok('etiqueta «L1» liga as duas folhas (borne da lâmpada energizado)', linked.energizedTerminals.has(lampA.id))

// etiquetas diferentes NÃO ligam
const w3 = wire('w3', { fromTerminalId: btnA.id, toTerminalId: '', toPoint: { x: 590, y: 40 }, netTo: 'N' })
const apart = computeContinuity([btn, lamp], [w3, w2], [btnA.id])
ok('etiqueta diferente não liga (L1 ≠ N)', !apart.energizedTerminals.has(lampA.id))

// ---- store: folhas ----
store().newProject()
ok('projeto novo tem 1 folha', store().sheets.length === 1 && store().activeSheetId === 'sheet-1')
const id2 = store().addSheet('Potência')
ok('addSheet cria e ativa a nova folha', store().sheets.length === 2 && store().activeSheetId === id2 && store().sheets[1].name === 'Potência')
store().renameSheet(id2, 'Comando')
ok('renameSheet aplica o nome', store().sheets[1].name === 'Comando')

// componente criado fica carimbado com a folha ativa
const compId = store().addComponent('breaker2p', 100, 100)
ok('addComponent carimba a folha ativa', store().components.find((c) => c.id === compId)?.sheet === id2)
ok('removeSheet recusa folha ocupada', store().removeSheet(id2) === false && store().sheets.length === 2)

// fio entre folhas é bloqueado
store().setActiveSheet('sheet-1')
const compId2 = store().addComponent('motor3ph', 100, 420)
const tOf = (id: string, i: number) => store().components.find((c) => c.id === id)!.terminals[i].id
const wiresBefore = store().wires.length
store().addWire(tOf(compId!, 0), tOf(compId2!, 0))
ok('fio entre folhas é bloqueado com aviso', store().wires.length === wiresBefore)
ok('evento de aviso emitido', store().sim.events?.some((e: { message?: string }) => (e.message ?? '').includes('folhas diferentes')) === true)

// ---- persistência ----
store().setActiveSheet('sheet-1')
store().setVirtualInput('I0.0', true)
const saved = store().saveJSON()
ok('saveJSON inclui folhas', JSON.parse(saved).sheets?.length === 2)
ok('saveJSON inclui entradas virtuais', JSON.parse(saved).virtualInputs?.['I0.0'] === true)
store().loadJSON(saved)
ok('loadJSON restaura folhas e folha ativa', store().sheets.length === 2 && store().sheets[1].name === 'Comando' && store().activeSheetId === 'sheet-1')
ok('loadJSON restaura entradas virtuais', store().virtualInputs['I0.0'] === true)
ok('loadJSON migra folhas em falta (legados)', (() => {
  store().loadJSON(JSON.stringify({ app: 'dc-simu', version: 6, components: [], wires: [], ladder: { rungs: [] }, projectFiles: {} }))
  return store().sheets.length === 1 && store().sheets[0].name === 'Página 1'
})())

// ---- contadores de E/S virtual (novos): limites + persistência ----
store().setVirtualOutputCount(99)
store().setVirtualMemoryCount(-3)
ok('contadores com limites (Q≤32, M≥0)', store().virtualOutputCount === 32 && store().virtualMemoryCount === 0)
store().setVirtualOutputCount(12)
store().setVirtualMemoryCount(4)
const saved2 = store().saveJSON()
store().setVirtualOutputCount(8)
store().setVirtualMemoryCount(0)
store().loadJSON(saved2)
ok('contadores Q/M sobrevivem ao save/load', store().virtualOutputCount === 12 && store().virtualMemoryCount === 4)

console.log(`[sheets] OK — ${checks} verificações`)
