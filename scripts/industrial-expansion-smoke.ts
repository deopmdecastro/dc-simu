/**
 * Smoke test completo da expansão industrial de 7 partes:
 * 1) Caixa / Fonte de Água (`waterSupplyBox`) com passador ARCO, contador ZJLCD-BT01 e WAGOs internos
 * 2) Cabos editáveis 3D em bóias, torres de sinalização, sensores, luminárias e contadores
 * 3) Tubos VDS rígidos c/ serigrafia & encaixes automáticos, Curvas VDS 90°, Tubo Corrugado e 3 Abraçadeiras
 * 4) Luminária LED Tri-Proof IP65 com potência & CCT ajustáveis + passagem Linkable L/N/PE
 * 5) Biblioteca hierárquica por Domínios (Eletricidade, Hidráulica, Pneumática, Serralharia) -> Subcategorias
 * 6) Prevenção de colisões entre componentes sólidos (ex.: reservatórios) e limites do pavilhão fabril
 * 7) Realismo de caixas OBO & conectores WAGO 221 transparentes
 */
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { useSimStore } from '../src/store/useSimStore'
import { paletteDomains, paletteGroups } from '../src/electrical/factory'
import { canInsertComponent3D, PANEL_UNITS_PER_MM } from '../src/three/modelPaths'
import {
  hydraulicComponentSizeMm,
  isHydraulicComponentType,
  WATER_SUPPLY_BOX_JUNCTION_MM,
  WATER_SUPPLY_BOX_SIZE_MM,
  waterSupplyBoxWagoPortMm,
} from '../src/three/hydraulicsModel'
import { buildWirePath3D, wireEndpoint3D } from '../src/three/wireGeometry3D'
import {
  computeQuickAttach3D,
  isConduitStructureType,
  isStructureComponentType,
  structureComponentSizeMm,
} from '../src/three/structuresModel'
import { triProofDimsOf } from '../src/three/TriProofBatten3D'
import {
  editableCableConductorsOf,
  editableCableConfigOf,
  isEditableCableDeviceType,
} from '../src/three/EditableCable3D'
import { conduitDimsOf } from '../src/three/ConduitDevices3D'
import {
  clampPositionToFactoryRoom,
  computeFactoryRoomBounds,
  isSolidCollisionComponentType,
  resolveFactoryPlacement3D,
} from '../src/three/factoryPhysics'

function run(name: string, fn: () => void) {
  try {
    fn()
    console.log(`PASS  ${name}`)
  } catch (err) {
    console.error(`FAIL  ${name}`)
    throw err
  }
}

function resetClean() {
  const st = useSimStore.getState()
  st.newProject()
  useSimStore.setState((s) => ({
    components: [],
    wires: [],
    selectedIds: [],
    sim: { ...s.sim, runState: 'stopped' },
    allowOutsideFactory: false,
  }))
}

run('1. Caixa / Fonte de Água: alimentação hidráulica pressurizada OUT + passador ARCO + contador ZJLCD-BT01', () => {
  resetClean()
  assert.equal(canInsertComponent3D('waterSupplyBox'), true)
  assert.equal(isHydraulicComponentType('waterSupplyBox'), true)
  assert.deepEqual(hydraulicComponentSizeMm('waterSupplyBox'), { x: 460, y: 330, z: 170 })

  const st = useSimStore.getState()
  const boxId = st.addComponent('waterSupplyBox', 200, 200)
  const tankId = st.addComponent('waterTank', 520, 200)
  assert.ok(boxId && tankId)

  st.setComponentState(tankId, { levelPct: 20, manualFill: false, outletValveOpen: false })
  st.setComponentState(boxId, { valveOpen: true, mainsSupplyOn: true, singleVolumeL: 0, totalVolumeL: 100 })

  const box = useSimStore.getState().components.find((c) => c.id === boxId)!
  const dcId = st.addComponent('powerSource24v', 40, 400)!
  const dc = useSimStore.getState().components.find(c => c.id === dcId)!
  st.addWire(dc.terminals.find(t => t.label === '+24V')!.id, box.terminals.find(t => t.label === '+24V')!.id)
  st.addWire(dc.terminals.find(t => t.label === '0V')!.id, box.terminals.find(t => t.label === 'GND')!.id)
  const tank = useSimStore.getState().components.find((c) => c.id === tankId)!
  const outT = box.terminals.find((t) => t.label === 'OUT')!
  const inT = tank.terminals.find((t) => t.label === 'IN')!
  assert.ok(outT && inT)
  assert.ok(box.terminals.find((t) => t.label === '+24V'))
  assert.ok(box.terminals.find((t) => t.label === 'PULSE'))
  assert.ok(box.terminals.find((t) => t.label === 'GND'))

  st.addWire(outT.id, inT.id)
  const createdWire = useSimStore.getState().wires.at(-1)
  assert.ok(createdWire, 'Deve criar tubo hidráulico entre OUT da Caixa de Água e IN do reservatório')
  useSimStore.setState((s) => ({
    wires: s.wires.map((w) => (w.id === createdWire.id ? { ...w, kind: 'hydraulic' } : w)),
    sim: { ...s.sim, runState: 'running' },
  }))

  for (let i = 0; i < 35; i += 1) useSimStore.getState().step()

  const boxAfter = useSimStore.getState().components.find((c) => c.id === boxId)!
  const tankAfter = useSimStore.getState().components.find((c) => c.id === tankId)!
  assert.equal(boxAfter.state.flowing, true, 'Caixa de água deve registar caudal quando ligada ao tanque com passador aberto')
  assert.ok(Number(boxAfter.state.flowRateLpm) > 20, 'Caudal instantâneo deve ser > 20 L/min')
  assert.ok(Number(boxAfter.state.singleVolumeL) > 0.5, 'Contador interno ZJLCD-BT01 deve acumular litros')
  assert.ok(Number(tankAfter.state.levelPct) > 35, `Reservatório deve encher a partir da Caixa / Fonte de Água (got ${tankAfter.state.levelPct})`)

  // Fechar o passador ARCO corta o caudal imediatamente
  st.setComponentState(boxId, { valveOpen: false })
  useSimStore.getState().step()
  const boxClosed = useSimStore.getState().components.find((c) => c.id === boxId)!
  assert.equal(boxClosed.state.flowing, false)
  assert.equal(boxClosed.state.flowRateLpm, 0)
})

run('2. Cabos editáveis 3D suportados em bóias, torres de sinalização, sensores, luminárias e contadores', () => {
  for (const t of [
    'floatSwitch',
    'towerLight',
    'proximitySensor',
    'photoSensor',
    'pressureSwitch',
    'thermostat',
    'hydraulicFlowMeter',
    'triProofLedBatten',
    'waterPump',
  ] as const) {
    assert.equal(isEditableCableDeviceType(t), true, `Tipo ${t} deve suportar cabo editável`)
  }
  const cfg = editableCableConfigOf({
    cableEnabled: true,
    cableLengthMm: 1200,
    cableDiameterMm: 10,
    cableColor: '#ea580c',
    cableExitDir: 'right',
    cableBendXMm: 150,
    cableCorrugated: true,
  })
  assert.equal(cfg.enabled, true)
  assert.equal(cfg.lengthMm, 1200)
  assert.equal(cfg.diameterMm, 10)
  assert.equal(cfg.exitDir, 'right')
  assert.equal(cfg.corrugated, true)
})

run('3. Tubos VDS, Curva VDS 90° c/ encaixes automáticos, Tubo Corrugado e 3 Abraçadeiras', () => {
  resetClean()
  const types = [
    'conduitVdsStraight',
    'conduitVdsElbow90',
    'conduitCorrugated',
    'pipeClampPvc',
    'pipeClampMetalEpdm',
    'pipeClampMetalScrew',
  ] as const
  for (const t of types) {
    assert.equal(canInsertComponent3D(t), true, `${t} deve estar desbloqueado em 3D`)
    assert.equal(isStructureComponentType(t), true)
    assert.equal(isConduitStructureType(t), true)
    const sz = structureComponentSizeMm(t, { diameterMm: 32, lengthMm: 1200 })
    assert.ok(sz && sz.x > 0 && sz.y > 0 && sz.z > 0, `Dimensões 3D válidas para ${t}`)
  }

  const st = useSimStore.getState()
  const id = st.addComponent('conduitVdsStraight', 200, 200)
  assert.ok(id)
  st.setComponentState(id, { diameterMm: 32, clampCount: 4, clampStyle: 'metal-epdm' })
  const comp = useSimStore.getState().components.find((c) => c.id === id)!
  assert.equal(comp.state.autoCouplers, true)
  assert.equal(comp.state.clampCount, 4)

  const attach = computeQuickAttach3D(comp, { x: 0, y: 1.5, z: 1.0 }, 'conduitVdsElbow90', 'right')
  assert.equal(attach.statePatch.diameterMm, 32)
  assert.equal(attach.statePatch.clampStyle, 'metal-epdm')
  assert.equal(attach.statePatch.autoCouplers, true)
})

run('4. Luminária Tri-Proof LED IP65: potência/CCT ajustáveis e ligação em cadeia (Linkable L/N/PE)', () => {
  resetClean()
  assert.equal(canInsertComponent3D('triProofLedBatten'), true)
  assert.equal(triProofDimsOf({ wattage: 18, cctK: 3000 }).lengthMm, 600)
  assert.equal(triProofDimsOf({ wattage: 40, cctK: 4000 }).lengthMm, 1200)
  assert.equal(triProofDimsOf({ wattage: 60, cctK: 6500 }).lengthMm, 1500)
  assert.equal(triProofDimsOf({ wattage: 60, cctK: 6500 }).cct, 6500)

  const st = useSimStore.getState()
  const srcId = st.addComponent('powerSource1ph', 120, 180)
  const b1Id = st.addComponent('triProofLedBatten', 340, 180)
  const b2Id = st.addComponent('triProofLedBatten', 620, 180)
  assert.ok(srcId && b1Id && b2Id)

  const src = useSimStore.getState().components.find((c) => c.id === srcId)!
  const b1 = useSimStore.getState().components.find((c) => c.id === b1Id)!
  const b2 = useSimStore.getState().components.find((c) => c.id === b2Id)!

  const srcL = src.terminals.find((t) => t.label === 'L')!
  const srcN = src.terminals.find((t) => t.label === 'N')!
  const b1L = b1.terminals.find((t) => t.label === 'L')!
  const b1N = b1.terminals.find((t) => t.label === 'N')!
  const b1LOut = b1.terminals.find((t) => t.label === 'L_OUT')!
  const b1NOut = b1.terminals.find((t) => t.label === 'N_OUT')!
  const b2L = b2.terminals.find((t) => t.label === 'L')!
  const b2N = b2.terminals.find((t) => t.label === 'N')!

  st.addWire(srcL.id, b1L.id)
  st.addWire(srcN.id, b1N.id)
  st.addWire(b1LOut.id, b2L.id)
  st.addWire(b1NOut.id, b2N.id)

  useSimStore.setState((s) => ({ sim: { ...s.sim, runState: 'running' } }))
  useSimStore.getState().step()

  const b1On = useSimStore.getState().components.find((c) => c.id === b1Id)!
  const b2On = useSimStore.getState().components.find((c) => c.id === b2Id)!
  assert.equal(b1On.state.on, true, '1ª luminária Tri-Proof deve acender com 230V AC')
  assert.equal(b2On.state.on, true, '2ª luminária Tri-Proof ligada em cadeia (Linkable) deve acender automaticamente')

  // Desligar passagem Linkable na 1ª luminária desliga a 2ª
  st.setComponentState(b1Id, { linkable: false })
  useSimStore.getState().step()
  const b2Off = useSimStore.getState().components.find((c) => c.id === b2Id)!
  assert.equal(b2Off.state.on, false, 'Sem modo Linkable, a 2ª luminária não recebe alimentação')
})

run('5. Biblioteca hierárquica por Domínios -> Subcategorias sem perder nenhum componente', () => {
  const flatTotal = paletteGroups().reduce((sum, g) => sum + g.items.length, 0)
  const domains = paletteDomains()
  const domainIds = domains.filter((d) => d.id !== 'maquetes').map((d) => d.id)
  assert.deepEqual(domainIds, ['eletricidade', 'hidraulica', 'pneumatica', 'serralharia'])
  // «Maquetes prontas» é um domínio de montagens, não de componentes: fica fora da contagem.
  const maquetes = domains.find((d) => d.id === 'maquetes')
  assert.ok(maquetes, 'Domínio «Maquetes prontas» presente')
  assert.ok(maquetes!.subgroups.some((sg) => (sg.maquetes?.length ?? 0) > 0), 'Maquetes prontas com montagens')
  assert.equal(maquetes!.subgroups.reduce((sum, sg) => sum + sg.items.length, 0), 0, 'Maquetes não inflacionam o catálogo')

  const hierarchicalTotal = domains.reduce(
    (sum, d) => sum + d.subgroups.reduce((s2, sg) => s2 + sg.items.length, 0),
    0,
  )
  assert.equal(hierarchicalTotal, flatTotal, 'Hierarquia Domínio -> Subcategoria deve preservar 100% dos componentes')

  const hid = domains.find((d) => d.id === 'hidraulica')!
  assert.ok(hid.subgroups.length >= 2, 'Hidráulica deve ter subcategorias')
  const ser = domains.find((d) => d.id === 'serralharia')!
  assert.ok(ser.subgroups.some((sg) => sg.id === 'ser-tubos-vds'), 'Serralharia deve incluir subcategoria de Tubos VDS & Abraçadeiras')
})

run('6. Prevenção de colisões entre reservatórios sólidos + Limites do pavilhão fabril', () => {
  const bounds = computeFactoryRoomBounds(18, -0.35, -5.5)
  assert.equal(isSolidCollisionComponentType('waterTank'), true)
  assert.equal(isSolidCollisionComponentType('floatSwitch'), false)
  assert.equal(isSolidCollisionComponentType('wago221_5'), false)

  // Dois reservatórios com raio ~3.5u (size 7×9×7u) a tentar sobrepor-se no mesmo ponto
  const tankSize = { x: 7.0, y: 9.0, z: 7.0 }
  const tankA = { id: 'tk1', type: 'waterTank', center: { x: 0, y: -1.0, z: 6.0 }, size: tankSize }
  const resolvedB = resolveFactoryPlacement3D({
    movingId: 'tk2',
    movingType: 'waterTank',
    candidate: { x: 1.2, y: -1.0, z: 6.0 },
    movingSize: tankSize,
    obstacles: [tankA],
    bounds,
    allowOutside: false,
    floorLocked: true,
  })
  const sepX = Math.abs(resolvedB.x - tankA.center.x)
  const sepZ = Math.abs(resolvedB.z - tankA.center.z)
  assert.ok(
    sepX >= tankSize.x || sepZ >= tankSize.z,
    `Os dois reservatórios nunca se podem atravessar (sepX=${sepX.toFixed(2)}, sepZ=${sepZ.toFixed(2)})`,
  )

  // Tentar arrastar componente para muito fora das paredes do pavilhão (x = 999, z = -100)
  const clamped = clampPositionToFactoryRoom({ x: 999, y: 500, z: -100 }, tankSize, bounds, false)
  assert.ok(clamped.x <= bounds.maxX - tankSize.x * 0.5 + 1e-6, 'Não pode sair pela parede direita')
  assert.ok(clamped.z >= bounds.minZ + tankSize.z * 0.5 - 1e-6, 'Não pode atravessar a parede traseira')
  assert.ok(clamped.y <= bounds.maxY - tankSize.y * 0.5 + 1e-6, 'Não pode sair pelo teto')

  // Quando o utilizador ativa explicitamente `allowOutsideFactory`, pode sair dos limites
  const free = clampPositionToFactoryRoom({ x: 999, y: 500, z: -100 }, tankSize, bounds, true)
  assert.equal(free.x, 999)
  assert.equal(free.z, -100)
})

run('7. Caixa OBO interior da Fonte de Água: bornes nos WAGO 221-2411 e entrada automática pelo bucim PG', () => {
  useSimStore.setState({ components: [], wires: [] })
  const st = useSimStore.getState()
  const psuId = st.addComponent('powerSource24v', 100, 120)
  const wbId = st.addComponent('waterSupplyBox', 500, 260)
  const comps = useSimStore.getState().components
  const psu = comps.find((c) => c.id === psuId)!
  const wb = comps.find((c) => c.id === wbId)!

  const tPsu24 = psu.terminals.find((t) => t.label === '+24V')!
  const tWb24 = wb.terminals.find((t) => t.label === '+24V')!
  st.addWire(tPsu24.id, tWb24.id, 'red')

  const wire = useSimStore.getState().wires[0]
  assert.ok(wire, 'Ligação +24V deve ser criada')

  const wbPivot = new THREE.Vector3(6.0, 2.0, 1.2)
  const pivots: Record<string, THREE.Vector3> = {
    [psu.id]: new THREE.Vector3(-2.0, 4.0, 0.3),
    [wb.id]: wbPivot,
  }
  const from = wireEndpoint3D(wire, 'from', comps, pivots, [wire])!
  const to = wireEndpoint3D(wire, 'to', comps, pivots, [wire])!
  assert.ok(to.waterBoxGlandContext, 'Terminal +24V da Caixa de Água deve ativar encaminhamento automático pelo bucim')

  const path = buildWirePath3D(wire, from, to, [])
  assert.ok(path.motorRoute && path.motorRoute.side === 'to', 'Troço de entrada pelo bucim PG deve estar protegido')

  const j = WATER_SUPPLY_BOX_JUNCTION_MM
  const s = WATER_SUPPLY_BOX_SIZE_MM
  const port = waterSupplyBoxWagoPortMm('+24V')!
  const expectedRoofX = wbPivot.x + (j.center.x + j.glandOffsetX + port.glandDx) * PANEL_UNITS_PER_MM
  const expectedRoofY = wbPivot.y + (s.h / 2) * PANEL_UNITS_PER_MM
  const passesRoofGland = path.points.some(
    (p) => Math.abs(p[0] - expectedRoofX) < 0.04 && Math.abs(p[1] - expectedRoofY) < 0.25,
  )
  assert.ok(passesRoofGland, 'O fio vindo do quadro deve entrar verticalmente pelo bucim PG do topo da Caixa de Água')

  const expectedOboTopY = wbPivot.y + (j.center.y + j.h / 2) * PANEL_UNITS_PER_MM
  const passesOboGland = path.points.some(
    (p) => Math.abs(p[0] - expectedRoofX) < 0.04 && Math.abs(p[1] - expectedOboTopY) < 0.16,
  )
  assert.ok(passesOboGland, 'O fio deve atravessar o bucim PG13.5 superior direito da caixa de derivação OBO interior')
})

run('8. Polimento 3D: saída lateral G 1" em latão, cabos editáveis multi-curva/OBO e rotação de abraçadeira VDS/corrugado', () => {
  // 8a. Terminal OUT da Caixa de Água alinhado com o bocal roscado em latão G 1"
  resetClean()
  const st = useSimStore.getState()
  const wbId = st.addComponent('waterSupplyBox', 200, 200)
  const wb = useSimStore.getState().components.find((c) => c.id === wbId)!
  const tOut = wb.terminals.find((t) => t.label === 'OUT')!
  assert.ok(tOut.position3D && Math.abs(tOut.position3D.x - 1.066) < 1e-4, 'Terminal OUT deve alinhar com o bocal roscado G 1"')

  // 8b. Cabos editáveis multi-curva + ligação a caixa de derivação OBO
  const cfg = editableCableConfigOf({
    cableEnabled: true,
    cableWaypointsMm: [{ x: 180, y: -60, z: 40 }, { x: 320, y: 120, z: -20 }],
    linkedJunctionBoxId: 'obo-box-1',
  })
  assert.equal(cfg.waypointsMm.length, 2)
  assert.equal(cfg.linkedJunctionBoxId, 'obo-box-1')
  assert.equal(editableCableConductorsOf('triProofLedBatten').length, 3)
  assert.equal(editableCableConductorsOf('towerLight').length, 4)

  // 8c. Rotação 360° da abraçadeira em tubos VDS e corrugados + fallback de cor
  const dimsDefault = conduitDimsOf({})
  assert.equal(dimsDefault.clampRollDeg, 0)
  const dimsRotated = conduitDimsOf({ clampRollDeg: 270, color: '#2563eb' })
  assert.equal(dimsRotated.clampRollDeg, 270)
  assert.equal(dimsRotated.corrugatedColor, '#2563eb')
})

console.log('\nALL 8 INDUSTRIAL EXPANSION SMOKE CHECKS PASSED!')
