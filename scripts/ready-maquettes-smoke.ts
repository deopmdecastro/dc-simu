import assert from 'node:assert/strict'
import { existsSync, statSync } from 'node:fs'
import path from 'node:path'
import { paletteDomains } from '../src/electrical/factory'
import {
  MAQUETTE_PLATE_STATE,
  MAQUETTE_PLATE_TYPE,
  READY_MAQUETTES,
  benchBaseUnits,
  benchPartUnits,
  readyMaquetteById,
  readyMaquetteParts,
} from '../src/electrical/readyMaquettes'
import { stampingBenchLayout } from '../src/electrical/stampingBench'
import { MECHATRONICS_TYPES } from '../src/three/mechatronicsModel'
import { component3DDimensions } from '../src/three/terminal3D'
import { createComponent } from '../src/electrical/factory'
import { canInsertComponent3D } from '../src/three/modelPaths'
import { useSimStore } from '../src/store/useSimStore'
import { isPanelBound } from '../src/three/panelBounds'

/** Maquetes prontas: domínio próprio na biblioteca, montagem completa num só passo de histórico. */
let passed = 0
function check(name: string, fn: () => void) {
  fn()
  passed += 1
  console.log(`  PASS: ${name}`)
}
const round = (value: number) => Math.round(value * 1e6) / 1e6
const positionKey = (p: { x: number; y: number; z: number }) => `${round(p.x)}|${round(p.y)}|${round(p.z)}`
const historyLength = () => useSimStore.getState().history.length

console.log('=== Smoke Test: Maquetes prontas · bancada ATEC montada num só passo ===')

check('1. «Maquetes prontas» é um domínio próprio da biblioteca, depois dos 4 domínios de componentes', () => {
  const domains = paletteDomains()
  assert.deepEqual(
    domains.map((d) => d.id),
    ['eletricidade', 'hidraulica', 'pneumatica', 'serralharia', 'maquetes'],
    'quinto domínio no fim da lista',
  )
  const maquetes = domains.find((d) => d.id === 'maquetes')!
  assert.equal(maquetes.label, 'Maquetes prontas')
  assert.equal(maquetes.subgroups.length, 1)
  const [group] = maquetes.subgroups
  assert.equal(group.id, 'mq-bancada-atec')
  const maquetteIds = READY_MAQUETTES.map((m) => m.id)
  assert.deepEqual(group.maquetes?.map((m) => m.id), maquetteIds)
  // As maquetes não entram na contagem de componentes do catálogo.
  assert.equal(group.items.length, 0, 'subgrupo de maquetes sem itens de catálogo')
  const catalogItems = domains.filter((d) => d.id !== 'maquetes').flatMap((d) => d.subgroups.flatMap((sg) => sg.items))
  assert.ok(catalogItems.length > 0)
  assert.ok(!catalogItems.some((item) => (READY_MAQUETTES.map((m) => m.id) as string[]).includes(item.type)), 'maquete não é um ComponentType')
})

check('2. Cada maquete declara as peças, os tipos e a capa que a biblioteca mostra', () => {
  const layoutKeys = stampingBenchLayout(MAQUETTE_PLATE_STATE).map((p) => p.key)
  for (const mq of READY_MAQUETTES) {
    assert.ok(mq.name.length > 8 && mq.subtitle.length > 8, `${mq.id} com nome e descrição`)
    assert.ok(mq.thumb.startsWith('/maquetes/') && mq.thumb.endsWith('.webp'), `${mq.id} com capa WebP`)
    const file = path.join('public', mq.thumb.replace(/^\//, ''))
    assert.ok(existsSync(file), `capa existe: ${file}`)
    assert.ok(statSync(file).size > 4_000, `capa com conteúdo: ${file}`)
    const parts = readyMaquetteParts(mq.id)
    assert.ok(parts.length > 0, `${mq.id} monta peças`)
    const keys = parts.map((p) => p.key)
    assert.equal(new Set(keys).size, keys.length, `${mq.id} sem chaves repetidas`)
    for (const key of keys) assert.ok(layoutKeys.includes(key), `${mq.id}: ${key} pertence ao layout da bancada`)
    assert.equal(mq.componentCount, parts.length + 1, `${mq.id}: contagem inclui a base`)
    assert.equal(mq.types[0], MAQUETTE_PLATE_TYPE, `${mq.id} começa pela base ranhurada`)
    assert.equal(new Set(mq.types).size, mq.types.length, `${mq.id} sem tipos repetidos`)
    for (const type of mq.types) {
      assert.ok(canInsertComponent3D(type), `${mq.id}: ${type} é um componente da maquete`)
      assert.ok(canInsertComponent3D(type), `${mq.id}: ${type} tem representação 3D`)
    }
  }
})

check('3. Bancada completa = base + 41 peças (26 tipos) na adaptação fotográfica; bancada vazia = base + estrutura', () => {
  const full = readyMaquetteById('atec-estampagem')!
  const parts = readyMaquetteParts('atec-estampagem')
  assert.equal(parts.length, 41, '41 peças sobre a base')
  assert.equal(full.componentCount, 42, '42 componentes no total')
  // A montagem combina a mecânica da maquete com torre, comandos e quadro do catálogo.
  assert.equal(full.types.length, 26, 'os tipos do catálogo representados na bancada (base incluída)')
  assert.ok(!full.types.includes('mecWorkpiece' as any), 'o tarugo não é colocado sobre a base')
  assert.equal(MECHATRONICS_TYPES.length, 22, 'catálogo da maquete com 22 tipos')
  const keys = new Set(parts.map((p) => p.key))
  for (const key of ['magazine', 'feeder', 'arm', 'press', 'table', 'hmi', 'signalTower', 'ductFront', 'profile', 'ramp1', 'ramp3']) {
    assert.ok(keys.has(key), `bancada completa inclui ${key}`)
  }
  const shell = readyMaquetteById('atec-bancada')!
  const shellKeys = readyMaquetteParts('atec-bancada').map((p) => p.key)
  assert.deepEqual(shellKeys, ['ductFront', 'ductBack', 'ductLeft', 'ductRight', 'profile'], 'estrutura: calhas perimetrais + poste')
  assert.equal(shell.componentCount, 6, 'base + 4 calhas + poste')
  assert.equal(shell.types.length, 3, 'base, calha e perfil')
  // Todas as peças da maquete têm volume 3D conhecido (senão o painel não as desenhava).
  for (const part of parts) { const c = createComponent(part.type, undefined, undefined, 0, 0, 0); c.state = { ...c.state, ...part.state }; assert.ok(component3DDimensions(c).y > 0, `${part.key} com altura`) }
})

check('4. Inserção: 42 componentes colocados na bancada, num único passo de histórico', () => {
  const st = useSimStore.getState()
  st.newProject('all')
  const historyBefore = historyLength()
  const componentsBefore = useSimStore.getState().components.length
  const created = useSimStore.getState().insertReadyMaquette('atec-estampagem')
  const after = useSimStore.getState()
  assert.equal(created.length, 42, '42 componentes criados')
  assert.equal(after.components.length - componentsBefore, 42, '42 componentes no projeto')
  assert.equal(historyLength() - historyBefore, 1, 'um único passo de histórico (Ctrl+Z desmonta tudo)')
  assert.deepEqual(after.selectedComponentIds, created, 'a montagem fica selecionada')

  const plate = after.components.find((c) => c.id === created[0])!
  assert.equal(plate.type, MAQUETTE_PLATE_TYPE, 'primeiro componente é a base')
  const base = benchBaseUnits(plate.schematicX, plate.schematicY)
  assert.deepEqual(plate.panel3DPosition, base, 'base assente no chão do painel')
  assert.equal(plate.state.lengthMm, 700)
  assert.equal(plate.state.widthMm, 700)

  // Cada peça do layout existe exatamente na cota esperada (mm → unidades do painel).
  const expected = new Set(readyMaquetteParts('atec-estampagem').map((part) => positionKey(benchPartUnits(base, part))))
  const actual = after.components.filter((c) => c.id !== plate.id).map((c) => positionKey(c.panel3DPosition!))
  assert.equal(actual.length, 41)
  assert.deepEqual(new Set(actual), expected, 'as 41 peças estão nas posições do relatório')
  for (const c of after.components) assert.ok(c.panel3DPosition, `${c.ref} com posição 3D`)

  // Estado das peças veio do layout (etiquetas B1/B8, ilhas C1A/C2A, gaveta virada para trás…)
  const byType = (type: string) => after.components.filter((c) => c.type === type)
  assert.deepEqual(byType('mecValveIsland').map((c) => c.state.islandTag).sort(), ['C1A', 'C2A'])
  assert.equal(byType('mecFeederCylinder')[0].state.sensorRecLabel, 'B8')
  assert.equal(byType('mecDrawerCylinder')[0].state.facing, 'z-')
  assert.equal(byType('mecGantryRamp' as any).length, 0)
  assert.equal(byType('mecDischargeRamp').length, 3, '3 rampas')
  assert.equal(byType('mecBenchDuct').length, 6, '4 calhas perimetrais')

  // Um Ctrl+Z desmonta a bancada inteira; um Ctrl+Y volta a montá-la.
  useSimStore.getState().undo()
  assert.equal(useSimStore.getState().components.length, componentsBefore, 'desfazer remove os 42 de uma vez')
  useSimStore.getState().redo()
  assert.equal(useSimStore.getState().components.length, 42, 'refazer volta a montar')
})

check('5. Referências, fichas e bloqueios: TAGs continuam a série e a maquete respeita o modo demonstração', () => {
  const st = useSimStore.getState()
  st.newProject('all')
  const first = useSimStore.getState().insertReadyMaquette('atec-bancada')
  const second = useSimStore.getState().insertReadyMaquette('atec-bancada')
  assert.equal(first.length, 6)
  assert.equal(second.length, 6)
  const refs = useSimStore.getState().components.map((c) => c.ref)
  assert.deepEqual(refs.filter((r) => r.startsWith('BAS')).sort(), ['BAS1', 'BAS2'], 'uma base por maquete, com TAGs em série')
  assert.equal(new Set(refs).size, refs.length, 'TAGs sem repetições (BAS1/BAS2, CAL1…CAL8)')
  assert.ok(refs.includes('CAL8'), 'as calhas seguem a série')
  const sheets = new Set(useSimStore.getState().components.map((c) => c.sheet))
  assert.equal(sheets.size, 1, 'tudo na folha ativa')

  assert.deepEqual(useSimStore.getState().insertReadyMaquette('nao-existe' as any), [], 'maquete desconhecida não cria nada')
  useSimStore.setState({ demoMode: true })
  assert.deepEqual(useSimStore.getState().insertReadyMaquette('atec-estampagem'), [], 'modo demonstração bloqueia a montagem')
  useSimStore.setState({ demoMode: false })
  assert.equal(useSimStore.getState().components.length, 12, 'nenhum componente fantasma')
})

check('6. Fotografia: modelos do catálogo, HMI exterior, operadores independentes e quadro preservados ao gravar', () => {
  const st = useSimStore.getState()
  st.newProject('all')
  st.insertReadyMaquette('atec-estampagem', { x: 420, y: 260 })
  const components = useSimStore.getState().components
  const tower = components.find(c => c.type === 'towerLightSb23011')
  assert.ok(tower, 'torre CAD existente')
  assert.ok(!components.some(c => c.type === 'mecSignalTower'), 'sem torre genérica na montagem')
  const hmi = components.find(c => c.type === 'mecHmiKtp700')!
  assert.equal(hmi.viewOrientation?.y, 90)
  const ops = components.filter(c => ['buttonNO', 'buttonNC', 'selectorSchneiderXa2ed33', 'emergencyButton'].includes(c.type))
  assert.equal(ops.length, 6)
  assert.equal(new Set(ops.map(c => c.panel3DPosition!.y)).size, 2, 'duas filas')
  assert.ok(ops.every(c => !isPanelBound(c)), 'operadores montados na máquina')
  assert.ok(isPanelBound(createComponent('buttonNO', undefined, undefined, 0, 0, 0)), 'botão solto mantém o comportamento normal do painel')
  const cabinet = components.find(c => c.type === 'panelEnclosure')!
  assert.ok(cabinet.panel3DPosition!.y < 0)
  assert.equal(cabinet.state.doorOpen, false)
  const saved = useSimStore.getState().saveJSON()
  useSimStore.getState().newProject('all')
  useSimStore.getState().loadJSON(saved)
  const restored = useSimStore.getState().components
  assert.equal(restored.length, components.length)
  for (const c of [...ops, hmi, cabinet]) {
    const next = restored.find(n => n.id === c.id)!
    assert.deepEqual(next.panel3DPosition, c.panel3DPosition)
    assert.deepEqual(next.viewOrientation, c.viewOrientation)
    assert.equal(next.state.hostLocation, c.state.hostLocation)
  }
  assert.ok(!stampingBenchLayout({ legs: false }).some(p => p.key === 'cabinet'), 'base sem pernas não recebe quadro suspenso')
})

console.log(`\n${passed} verificações · Maquetes prontas OK`)
