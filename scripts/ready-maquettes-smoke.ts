import assert from 'node:assert/strict'
import { existsSync, statSync } from 'node:fs'
import path from 'node:path'
import { paletteDomains } from '../src/electrical/factory'
import {
  MAQUETTE_PLATE_STATE,
  MAQUETTE_PLATE_TYPE,
  READY_MAQUETTES,
  benchInFactoryHall,
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
import { componentPanelXY } from '../src/three/panelLayout'
import { stampingWallPanelContent } from '../src/electrical/stampingWallPanel'
import { computeContinuity } from '../src/electrical/engine'
import { industrialPillarDimsOf } from '../src/three/structuresModel'
import { ductJunctionOpenings } from '../src/schematic/ductJunctions'
import { enclosureCarryBox, enclosureFreeContents, translatePanelGroup } from '../src/three/panelGroupMove'
import { enclosureDimsOf } from '../src/three/enclosureParts'

/** Quadro geral de parede (QGD) montado com a maquete completa. */
const QGD_COUNT = stampingWallPanelContent('t-').components.length

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
    assert.equal(mq.componentCount, parts.length + 1 + (mq.wallPanel ? QGD_COUNT : 0), `${mq.id}: contagem inclui a base (e o QGD)`)
    assert.equal(mq.types[0], MAQUETTE_PLATE_TYPE, `${mq.id} começa pela base ranhurada`)
    assert.equal(new Set(mq.types).size, mq.types.length, `${mq.id} sem tipos repetidos`)
    for (const type of mq.types) {
      assert.ok(canInsertComponent3D(type), `${mq.id}: ${type} é um componente da maquete`)
      assert.ok(canInsertComponent3D(type), `${mq.id}: ${type} tem representação 3D`)
    }
  }
})

check('3. Bancada completa = base + 96 peças + QGD (54 tipos) na adaptação fotográfica; bancada vazia = base + estrutura', () => {
  const full = readyMaquetteById('atec-estampagem')!
  const parts = readyMaquetteParts('atec-estampagem')
  assert.equal(QGD_COUNT, 50, 'QGD: 3 sinalizadores monofásicos e porta-fusíveis 3P+N substituem o iIL 3P')
  assert.equal(parts.length, 96, '96 peças: bancada (42) + QE1 com calhas, relés, fonte e 29 bornes (43) + ambiente fabril (11 — +2 tomadas RoadEu, +2 pescoços)')
  assert.equal(full.componentCount, 147, '147 componentes no total (base + 96 + QGD 50)')
  // A montagem combina a mecânica da maquete com torre, comandos e quadro do catálogo.
  // REARME (XB2 azul) e START (XB2 verde) passaram a ser aparelhos distintos (antes ambos o «Botão NA» genérico).
  assert.equal(full.types.length, 54, 'os tipos do catálogo representados na bancada (base incluída, com a tomada RoadEu)')
  assert.ok(!full.types.includes('mecWorkpiece' as any), 'o tarugo não é colocado sobre a base')
  assert.equal(MECHATRONICS_TYPES.length, 23, 'catálogo da maquete com 23 tipos (inclui o HZ20)')
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

check('4. Inserção: 147 componentes (QGD na parede + bancada no centro da nave), num único passo de histórico', () => {
  const st = useSimStore.getState()
  st.newProject('all')
  const historyBefore = historyLength()
  const componentsBefore = useSimStore.getState().components.length
  const created = useSimStore.getState().insertReadyMaquette('atec-estampagem')
  const after = useSimStore.getState()
  assert.equal(created.length, 147, '147 componentes criados')
  assert.equal(after.components.length - componentsBefore, 147, '147 componentes no projeto')
  assert.equal(historyLength() - historyBefore, 1, 'um único passo de histórico (Ctrl+Z desmonta tudo)')
  assert.deepEqual(after.selectedComponentIds, created, 'a montagem fica selecionada')

  const qgd = after.components.find((c) => c.id === created[0])!
  assert.equal(qgd.ref, 'QGD', 'o QGD de parede é montado primeiro (ancora a nave)')
  assert.equal(qgd.state.hostLocation, undefined, 'QGD no plano da parede, não é peça de máquina')
  const plate = after.components.find((c) => c.id === created[QGD_COUNT])!
  assert.equal(plate.type, MAQUETTE_PLATE_TYPE, 'a base vem logo a seguir ao QGD')
  const { base, env } = benchInFactoryHall({ ...componentPanelXY(qgd), heightMm: 1000 }, plate.state, after.factoryHall!.depthM * 10)
  assert.deepEqual(after.factoryHall, { widthM: 8, depthM: 6, heightM: 3.5 }, 'nave à escala real para a esteira aérea')
  assert.deepEqual(plate.panel3DPosition, base, 'mesa no centro da nave, com os pés no chão')
  assert.deepEqual(plate.state.benchEnv, env, 'a posição da parede e do QGD fica gravada na base')
  assert.ok(env.wallZmm < -2500 && env.panelXmm === 0, 'mesa a ~3 m da parede, centrada no QGD')
  assert.equal(plate.state.lengthMm, 700)
  assert.equal(plate.state.widthMm, 700)

  // Cada peça do layout existe exatamente na cota esperada (mm → unidades do painel).
  const bench = after.components.filter((c) => created.slice(QGD_COUNT + 1).includes(c.id))
  const expected = new Set(readyMaquetteParts('atec-estampagem', undefined, env).map((part) => positionKey(benchPartUnits(base, part))))
  const actual = bench.map((c) => positionKey(c.panel3DPosition!))
  assert.equal(actual.length, 96)
  assert.deepEqual(new Set(actual), expected, 'as 96 peças estão nas posições do relatório')
  for (const c of bench) assert.ok(c.panel3DPosition, `${c.ref} com posição 3D`)
  const refs = after.components.map((c) => c.ref)
  assert.equal(new Set(refs).size, refs.length, 'TAGs sem repetições entre o QGD (X1.x) e o QE1 (X20…X24)')
  assert.ok(['X20', 'X21.1', 'X21.12', 'X22.6', 'X23.4', 'X24.6'].every((r) => refs.includes(r)), 'réguas do QE1 com TAG por borne')

  // Estado das peças veio do layout (etiquetas B1/B8, ilhas C1A/C2A, gaveta virada para trás…)
  const byType = (type: string) => after.components.filter((c) => c.type === type)
  assert.deepEqual(byType('mecValveIsland').map((c) => c.state.islandTag).sort(), ['C1A', 'C2A'])
  assert.equal(byType('mecFeederCylinder')[0].state.sensorRecLabel, 'B8')
  assert.equal(byType('mecDrawerCylinder')[0].viewOrientation?.y, -90, 'Cilindro 3 empurra a gaveta para −X, até à prensa')
  assert.deepEqual(byType('mecStampingTable')[0].state.slideAxis, [-1, 0, 0])
  assert.equal(byType('mecGantryRamp' as any).length, 0)
  assert.equal(byType('mecDischargeRamp').length, 3, '3 rampas')
  assert.equal(byType('mecBenchDuct').length, 6, '4 calhas perimetrais')

  // Esteiras: verticais com fundo na parede/pilar, pescoços em T na aérea e tomadas no fim das descidas.
  const trays = byType('cableTrayStraight')
  const trayBy = (label: string) => trays.find((c) => c.state.labelText === label)!
  const riser = trayBy('QGD → ESTEIRA'), neck = trayBy('PESCOÇO QGD'), wall = trayBy('ESTEIRA AÉREA · PAREDE')
  const drop = trayBy('DESCIDA COMPRESSOR'), dropBench = trayBy('DESCIDA BANCADA')
  for (const v of [riser, drop, dropBench]) assert.deepEqual(v.viewOrientation, { x: 0, y: 90, z: 90 }, `${v.state.labelText}: fundo apoiado, abertura para a nave`)
  const wallZu = env.wallZmm / 100 + base.z
  assert.ok(Math.abs(riser.panel3DPosition!.z - (wallZu + 0.4)) < 0.01, 'subida do QGD com o fundo a 10 mm da parede')
  assert.ok(ductJunctionOpenings(riser, trays).some((o) => o.endTrim), 'topo da subida aparado dentro do pescoço')
  assert.ok(ductJunctionOpenings(neck, trays).some((o) => o.side === 'floor'), 'pescoço abre o fundo por cima da subida')
  assert.ok(ductJunctionOpenings(neck, trays).some((o) => o.endTrim), 'pescoço entra na esteira aérea (T)')
  assert.ok(ductJunctionOpenings(wall, trays).filter((o) => o.side === 'top').length >= 2, 'esteira aérea abre a aba do lado da parede nos 2 pescoços')
  assert.ok(ductJunctionOpenings(wall, trays).some((o) => o.side === 'bottom'), 'esteira aérea abre a aba do lado da nave para o ramal da bancada')
  const sockComp = byType('socketFamatelSwitch').find((c) => c.ref === 'XS-COMP')!
  const dropBottom = drop.panel3DPosition!.y - Number(drop.state.lengthMm) / 200
  const gapMm = (dropBottom - (sockComp.panel3DPosition!.y + 115 / 200)) * 100
  assert.ok(Math.abs(gapMm - 20) < 1, `tomada do compressor a 20 mm da ponta da descida (${gapMm.toFixed(1)} mm)`)

  // Um Ctrl+Z desmonta a bancada inteira; um Ctrl+Y volta a montá-la.
  useSimStore.getState().undo()
  assert.equal(useSimStore.getState().components.length, componentsBefore, 'desfazer remove os 147 de uma vez')
  useSimStore.getState().redo()
  assert.equal(useSimStore.getState().components.length, 147, 'refazer volta a montar')
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
  const ops = components.filter(c => ['pushButtonXb2No', 'pushButtonXb2Nc', 'pushButtonXb2Blue', 'selectorSchneiderXa2ed33', 'emergencyButton'].includes(c.type))
  assert.equal(ops.length, 6)
  assert.equal(new Set(ops.map(c => c.panel3DPosition!.y)).size, 2, 'duas filas')
  assert.ok(ops.every(c => !isPanelBound(c)), 'operadores montados na máquina')
  assert.ok(isPanelBound(createComponent('pushButtonXb2No', undefined, undefined, 0, 0, 0)), 'botão solto mantém o comportamento normal do painel')
  const cabinet = components.find(c => c.type === 'panelEnclosure' && String(c.state.labelText).startsWith('QE1'))!
  const plateC = components.find(c => c.type === MAQUETTE_PLATE_TYPE)!
  assert.ok(cabinet.panel3DPosition!.y < plateC.panel3DPosition!.y, 'QE1 por baixo do tampo')
  assert.equal(cabinet.state.doorOpen, true, 'QE1 aberto: relés, fonte e bornes à vista')
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

check('7. Sinalização de fases: três iIL 1P protegidos pelos três polos do DF103NV, com neutro seccionável', () => {
  const { components, wires } = stampingWallPanelContent('phase-')
  const lights = components.filter(c => c.type === 'pilotLightSchneiderIil1p')
  const holder = components.find(c => c.type === 'fuseHolderSchneiderDf103nv')!
  const main = components.find(c => c.ref === 'QG1')!
  assert.equal(lights.length, 3)
  assert.equal(components.filter(c => c.type === 'pilotLightSchneiderIil3p').length, 0)
  assert.equal(components.filter(c => c.type === 'fuseHolder').length, 0, 'não introduz porta-fusíveis genéricos sem modelo')
  assert.ok(holder && canInsertComponent3D(holder.type), 'proteção representável no painel')
  assert.equal(holder.state.inA, 2)
  const terminal = (c: typeof main, label: string) => c.terminals.find(t => t.label === label)!.id
  const allTerminals = new Set(components.flatMap(c => c.terminals.map(t => t.id)))
  assert.ok(wires.every(w => allTerminals.has(w.fromTerminalId) && allTerminals.has(w.toTerminalId)), 'todos os cabos têm extremos existentes')
  assert.equal(new Set(wires.map(w => w.id)).size, wires.length, 'ids de cabos únicos')
  for (let i = 0; i < 3; i++) {
    const source = terminal(main, String(2 * i + 2))
    const light = lights.find(c => c.ref === `H_L${i + 1}`)!
    const reachable = computeContinuity(components, wires, [source]).energizedTerminals
    assert.ok(reachable.has(terminal(light, 'X1')), `L${i + 1} alimenta o seu sinalizador`)
    for (const other of lights.filter(c => c.id !== light.id)) assert.ok(!reachable.has(terminal(other, 'X1')), 'fases isoladas')
    holder.state.closed = false
    assert.ok(!computeContinuity(components, wires, [source]).energizedTerminals.has(terminal(light, 'X1')), 'abrir o porta-fusíveis corta a sinalização')
    holder.state.closed = true
  }
  const neutral = terminal(main, '8')
  assert.ok(lights.every(c => computeContinuity(components, wires, [neutral]).energizedTerminals.has(terminal(c, 'X2'))))
  holder.state.closed = false
  assert.ok(lights.every(c => !computeContinuity(components, wires, [neutral]).energizedTerminals.has(terminal(c, 'X2'))), 'o neutro também secciona')
})

check('8. O pilar da bancada mantém IPE100 e as tomadas com geometria própria podem ser inseridas', () => {
  const pillar = readyMaquetteParts('atec-estampagem').find(p => p.key === 'pillar-bench')!
  const dims = industrialPillarDimsOf(pillar.state)
  assert.equal(dims.profile, 'IPE100', 'não regressa silenciosamente a HEB200')
  assert.equal(dims.sectionMm, 100)
  for (const type of ['socketFamatelCombo', 'socketFamatelSwitch', 'socketEfapelIp65'] as const) {
    assert.ok(canInsertComponent3D(type), `${type}: não bloqueado na Biblioteca`)
    const dims = component3DDimensions(createComponent(type))
    assert.ok(dims.x >= .64 && dims.z >= .517, 'dimensões físicas em vez do fallback genérico')
  }
})

check('9. Arrastar o QE1 leva os aparelhos e os troços de cabo que estão dentro do quadro', () => {
  const st = useSimStore.getState()
  st.newProject('all')
  st.insertReadyMaquette('atec-estampagem')
  const comps = useSimStore.getState().components
  const qe1 = comps.find((c) => c.type === 'panelEnclosure' && String(c.state.labelText ?? '').startsWith('QE1'))!
  const pivots = Object.fromEntries(comps.filter((c) => c.panel3DPosition).map((c) => [c.id, c.panel3DPosition!]))
  const box = enclosureCarryBox(qe1.panel3DPosition!, enclosureDimsOf(qe1.state))
  const inside = enclosureFreeContents(qe1.id, box, comps, pivots)
  const byRef = (ref: string) => comps.find((c) => c.ref === ref)!
  for (const ref of ['X21.1', 'X20']) assert.ok(inside.includes(byRef(ref).id), `${ref} acompanha o QE1`)
  assert.ok(!inside.includes(comps.find((c) => c.type === 'airCompressor')!.id), 'o compressor não vai com o quadro')
  const pIn = { x: qe1.panel3DPosition!.x, y: qe1.panel3DPosition!.y, z: qe1.panel3DPosition!.z }
  const pOut = { x: pIn.x, y: pIn.y + 20, z: pIn.z }
  const wire = { id: 'w-test', fromTerminalId: byRef('X21.1').terminals[0].id, toTerminalId: 'fora', waypoints3D: [pIn, pOut] } as any
  const origins = [qe1, ...inside.map((id) => comps.find((c) => c.id === id)!)].map((c) => ({ component: c, pivot: c.panel3DPosition! }))
  const moved = translatePanelGroup(comps, [wire], origins, { x: 1, y: 0, z: 0.5 }, [box])
  const w = moved.wires[0]
  assert.deepEqual(w.waypoints3D![0], { x: pIn.x + 1, y: pIn.y, z: pIn.z + 0.5 }, 'ponto dentro do quadro acompanha')
  assert.deepEqual(w.waypoints3D![1], pOut, 'ponto fora do quadro mantém-se')
  const x21 = moved.components.find((c) => c.ref === 'X21.1')!
  assert.ok(Math.abs(x21.panel3DPosition!.x - (byRef('X21.1').panel3DPosition!.x + 1)) < 1e-9, 'borne desloca-se com o quadro')
})

console.log(`\n${passed} verificações · Maquetes prontas OK`)
