import assert from 'node:assert/strict'
import { createComponent, paletteDomains } from '../src/electrical/factory'
import { internalBridges } from '../src/electrical/engine'
import { magazineColumn, rampIndexFor, stepMechatronics } from '../src/electrical/mechatronicsSim'
import { useSimStore } from '../src/store/useSimStore'
import { hasComponent3DVisual } from '../src/three/modelPaths'
import { component3DDimensions } from '../src/three/terminal3D'
import { isPanelBound } from '../src/three/panelBounds'
import { hasDeviceControls } from '../src/components/DeviceControls'
import { usesProceduralSurface } from '../src/three/proceduralSurface'
import { ARM_CYLINDER_BASE_MM, ARM_STATION_TOP_MM, armCupLocalMm, MECHATRONICS_TYPES, MAGAZINE_CAPACITY, MEC_DIMS, encoderPhases, mechatronicsSizeMm, slotPlateDimsOf } from '../src/three/mechatronicsModel'
import { BENCH_RAMP_ANGLES, stampingBenchLayout } from '../src/electrical/stampingBench'
import type { ElectricalComponent } from '../src/types'
import { readFileSync } from 'node:fs'

/** Maquete de estampagem: catálogo, cotas do relatório, contactos e fluxo de peças. */
let passed = 0
function check(name: string, fn: () => void) {
  fn()
  passed += 1
  console.log(`  PASS: ${name}`)
}
const make = (type: string, ref = 'X') => createComponent(type as any, ref, '', 0, 0, 0) as ElectricalComponent
const makeBench = (offsetX = 0) => {
  const entries = stampingBenchLayout().map((p) => {
    const c = make(p.type, p.key)
    Object.assign(c.state, p.state)
    c.panel3DPosition = { x: offsetX + p.x * 0.01, y: p.y * 0.01, z: p.z * 0.01 }
    return [p.key, c] as const
  })
  return Object.fromEntries(entries) as Record<string, ElectricalComponent>
}
const idleContext = { dtSec: 0, airAt: () => false, loadPowered: () => false }
const labelsOf = (c: ElectricalComponent, pairs: Array<[string, string]>) => {
  const byId = new Map(c.terminals.map((t) => [t.id, t.label]))
  return pairs.map(([a, b]) => [byId.get(a), byId.get(b)].sort().join('-'))
}

console.log('=== Smoke Test: Mecatrónica · Maquete de estampagem e transferência ===')

check('1. Os 14 componentes estão na biblioteca, com 3D desbloqueado, inspetor e acabamento PBR', () => {
  const listed = new Set(paletteDomains().flatMap((d) => d.subgroups.flatMap((sg) => sg.items.map((i) => i.type as string))))
  for (const type of MECHATRONICS_TYPES) {
    assert.ok(listed.has(type), `${type} na biblioteca`)
    assert.ok(hasComponent3DVisual(type as any), `${type} com 3D`)
    assert.ok(hasDeviceControls(type), `${type} com inspetor`)
    assert.ok(usesProceduralSurface(type as any), `${type} com mapas PBR procedimentais`)
    const c = make(type)
    assert.equal(isPanelBound(c), false, `${type} fica no espaço livre (bancada), não na chapa do quadro`)
    const d = component3DDimensions(c)
    assert.ok(d.x > 0 && d.y > 0 && d.z > 0, `${type} com volume`)
  }
})

check('2. Cotas do relatório: base 700×500×20, tarugo Ø40×35, magazine 50×50×260 elevado 45 mm', () => {
  assert.deepEqual(mechatronicsSizeMm('mecSlotPlate'), { x: 700, y: 20, z: 500 })
  assert.deepEqual(mechatronicsSizeMm('mecWorkpiece'), { x: 40, y: 35, z: 40 })
  assert.equal(mechatronicsSizeMm('mecGravityMagazine')!.y, 45 + 260)
  assert.equal(MEC_DIMS.press.gantryHeightMm, 300)
  assert.equal(mechatronicsSizeMm('mecStampingPress')!.y, MEC_DIMS.press.totalHeightMm, 'pórtico 300 + cilindro sobre a travessa')
  assert.deepEqual(mechatronicsSizeMm('mecAluProfile', { sectionMm: 40, lengthMm: 500, orientation: 'horizontal' }), { x: 500, y: 40, z: 40 })
})

check('3. Contactos: FC1 comutado, reeds REC/AVA e SUP/INF, sensor de referência 0° e encoder A/B', () => {
  const sw = make('mecMicroSwitchRoller')
  assert.deepEqual(labelsOf(sw, internalBridges(sw)), ['C-NC'])
  sw.state.pressed = true
  assert.deepEqual(labelsOf(sw, internalBridges(sw)), ['C-NO'])
  const feeder = make('mecFeederCylinder')
  assert.deepEqual(labelsOf(feeder, internalBridges(feeder)), ['REC-REC+'])
  feeder.state.positionPct = 100
  assert.deepEqual(labelsOf(feeder, internalBridges(feeder)), ['AVA-AVA+'])
  const press = make('mecStampingPress')
  assert.deepEqual(labelsOf(press, internalBridges(press)), ['SUP-SUP+'])
  press.state.positionPct = 100
  assert.deepEqual(labelsOf(press, internalBridges(press)), ['INF-INF+'])
  const arm = make('mecRotaryArm')
  assert.deepEqual(labelsOf(arm, internalBridges(arm)), ['HOME-HOME+'])
  arm.state.angleDeg = 90
  assert.deepEqual(labelsOf(arm, internalBridges(arm)), [])
  const seen = new Set<string>()
  for (let deg = 0; deg < 15; deg += 0.5) { const p = encoderPhases(deg); seen.add(`${+p.a}${+p.b}`) }
  assert.deepEqual([...seen].sort(), ['00', '01', '10', '11'], 'quadratura completa')
})

check('4. Ciclo: alimentar → recolher → prensa → estampar → triar pela rampa do material', () => {
  const { magazine: mag, feeder, fc1: sw, arm, table, press, ramp1, ramp2, ramp3 } = makeBench()
  const ramps = [ramp1, ramp2, ramp3]
  const all = [mag, feeder, sw, arm, table, press, ...ramps]
  const airOn = new Set<string>()
  const ctx = { dtSec: 0.05, airAt: (id: string) => airOn.has(id), loadPowered: () => false }
  const t = (c: ElectricalComponent, l: string) => c.terminals.find((x) => x.label === l)!.id
  assert.equal(magazineColumn(mag.state, MAGAZINE_CAPACITY)[0], 'aluminio')
  // Cilindro 1 avança até ao fim: tarugo inferior (alumínio) sai do magazine e aciona FC1.
  feeder.state.positionPct = 100
  stepMechatronics(all, ctx)
  assert.equal(mag.state.pickupMaterial, 'aluminio')
  assert.equal(mag.state.pieceCount, MAGAZINE_CAPACITY - 1)
  assert.equal(magazineColumn(mag.state, MAGAZINE_CAPACITY)[0], 'branco', 'a coluna desce')
  assert.equal(sw.state.pressed, true)
  // Descer o braço (Z) com vácuo (VAC): recolhe a peça.
  airOn.add(t(arm, 'Z')); airOn.add(t(arm, 'VAC'))
  for (let i = 0; i < 12; i += 1) stepMechatronics(all, ctx)
  assert.equal(arm.state.holding, 'aluminio')
  assert.equal(sw.state.pressed, false, 'FC1 liberta quando a peça sai')
  // Cortar o vácuo em baixo: deposita na gaveta da prensa.
  airOn.delete(t(arm, 'Z'))
  for (let i = 0; i < 12; i += 1) stepMechatronics(all, ctx)
  arm.state.angleDeg = 180
  airOn.add(t(arm, 'Z'))
  for (let i = 0; i < 12; i += 1) stepMechatronics(all, ctx)
  airOn.delete(t(arm, 'VAC'))
  stepMechatronics(all, ctx)
  assert.equal(table.state.pieceMaterial, 'aluminio')
  // Prensa desce até ao fim: estampa.
  press.state.positionPct = 100
  stepMechatronics(all, ctx)
  assert.equal(table.state.stamped, true)
  press.state.positionPct = 0
  // Recolha pós-estampagem, subida do braço e descarga por gravidade: peça metálica → rampa 1.
  airOn.add(t(arm, 'VAC'))
  stepMechatronics(all, ctx)
  assert.equal(arm.state.holdingStamped, true)
  airOn.delete(t(arm, 'Z'))
  for (let i = 0; i < 12; i += 1) stepMechatronics(all, ctx)
  assert.equal(arm.state.holding, 'aluminio', 'a peça continua presa enquanto há vácuo')
  arm.state.angleDeg = 270
  airOn.delete(t(arm, 'VAC'))
  stepMechatronics(all, ctx)
  assert.deepEqual(ramps[0].state.pieces, ['aluminio'])
  assert.equal(rampIndexFor('branco', 3), 1)
  assert.equal(rampIndexFor('preto', 3), 2)
  assert.equal(rampIndexFor('preto', 2), 1)
})

check('9. Recolha exige vácuo, descida e contacto real; não atravessa ângulos, alturas ou bancadas', () => {
  for (const angle of [90, 180, 270]) {
    const b = makeBench()
    Object.assign(b.magazine.state, { pickupMaterial: 'branco' })
    Object.assign(b.arm.state, { angleDeg: angle, armDownPct: 100, manualVacuum: true })
    stepMechatronics(Object.values(b), idleContext)
    assert.equal(b.arm.state.holding, '', `não recolhe a ${angle}°`)
    assert.equal(b.magazine.state.pickupMaterial, 'branco')
  }
  for (const angle of [0, 1, 359, 360]) {
    const b = makeBench()
    b.magazine.state.pickupMaterial = 'branco'
    Object.assign(b.arm.state, { angleDeg: angle, armDownPct: 100, manualVacuum: true })
    stepMechatronics(Object.values(b), idleContext)
    assert.equal(b.arm.state.holding, 'branco', `contacto perto de 0° (${angle}°)`)
  }
  for (const patch of [{ armDownPct: 0, manualVacuum: true }, { armDownPct: 100, manualVacuum: false }]) {
    const b = makeBench()
    b.magazine.state.pickupMaterial = 'aluminio'
    Object.assign(b.arm.state, patch)
    stepMechatronics(Object.values(b), idleContext)
    assert.equal(b.arm.state.holding, '')
  }
  for (const axis of ['x', 'y', 'z'] as const) {
    const b = makeBench()
    b.magazine.state.pickupMaterial = 'preto'
    b.magazine.panel3DPosition![axis] += 0.5 // deslocação de 50 mm
    Object.assign(b.arm.state, { armDownPct: 100, manualVacuum: true })
    stepMechatronics(Object.values(b), idleContext)
    assert.equal(b.arm.state.holding, '', `não alcança magazine deslocado em ${axis}`)
  }
  const b = makeBench(), remote = makeBench(10)
  remote.magazine.state.pickupMaterial = 'preto'
  Object.assign(b.arm.state, { armDownPct: 100, manualVacuum: true })
  stepMechatronics([...Object.values(remote), ...Object.values(b)], idleContext)
  assert.equal(b.arm.state.holding, '', 'não recolhe de outra bancada')
  assert.equal(remote.magazine.state.pickupMaterial, 'preto')
})

check('10. Gaveta: só transfere em contacto; não substitui peças e preserva a estampagem', () => {
  for (const [angle, down] of [[0, 100], [90, 100], [180, 0]]) {
    const b = makeBench()
    Object.assign(b.arm.state, { angleDeg: angle, armDownPct: down, holding: 'branco' })
    stepMechatronics(Object.values(b), idleContext)
    assert.equal(b.table.state.pieceMaterial, '', `não deposita a ${angle}° / ${down}%`)
    assert.equal(b.arm.state.holding, '', 'sem vácuo, a peça cai')
  }
  const b = makeBench()
  b.table.state.pieceMaterial = 'preto'
  Object.assign(b.arm.state, { angleDeg: 180, armDownPct: 100, holding: 'branco' })
  stepMechatronics(Object.values(b), idleContext)
  assert.equal(b.table.state.pieceMaterial, 'preto', 'gaveta ocupada não é substituída')
  Object.assign(b.arm.state, { holding: '', manualVacuum: true })
  b.magazine.state.pickupMaterial = 'branco'
  b.table.state.stamped = true
  stepMechatronics(Object.values(b), idleContext)
  assert.equal(b.arm.state.holding, 'preto', 'a peça vem da gaveta alinhada, mesmo com peça no magazine')
  assert.equal(b.arm.state.holdingStamped, true)
  assert.equal(b.magazine.state.pickupMaterial, 'branco')
  b.arm.state.manualVacuum = false
  stepMechatronics(Object.values(b), idleContext)
  assert.equal(b.table.state.pieceMaterial, 'preto', 'permite repor a peça estampada na gaveta')
  assert.equal(b.table.state.stamped, true)
})

check('11. Descarga segue a rampa física, independentemente do material e da ordem dos componentes', () => {
  for (const material of ['aluminio', 'branco', 'preto']) {
    for (const [i, angle] of BENCH_RAMP_ANGLES.entries()) {
      const b = makeBench()
      Object.assign(b.arm.state, { holding: material, holdingStamped: true, angleDeg: angle })
      stepMechatronics(Object.values(b).reverse(), idleContext)
      for (let n = 0; n < 3; n += 1) {
        assert.deepEqual(b[`ramp${n + 1}`].state.pieces ?? [], n === i ? [material] : [], `${material} a ${angle}° na rampa ${i + 1}`)
      }
      assert.equal(b.arm.state.holding, '')
      stepMechatronics(Object.values(b), idleContext)
      assert.deepEqual(b[`ramp${i + 1}`].state.pieces, [material], 'sem duplicação no passo seguinte')
    }
  }
  for (const angle of [0, 90, 180]) {
    const b = makeBench()
    Object.assign(b.arm.state, { angleDeg: angle, holding: 'aluminio', holdingStamped: true })
    stepMechatronics(Object.values(b), idleContext)
    assert.ok([b.ramp1, b.ramp2, b.ramp3].every((r) => !r.state.pieces?.length), 'soltar fora das rampas perde a peça')
  }
  for (const axis of ['x', 'y', 'z'] as const) {
    const b = makeBench()
    b.ramp1.panel3DPosition![axis] += 5
    Object.assign(b.arm.state, { angleDeg: 270, holding: 'aluminio', holdingStamped: true })
    stepMechatronics(Object.values(b), idleContext)
    assert.equal(b.ramp1.state.pieces, undefined, `rampa deslocada em ${axis} não recebe a peça`)
  }
})

check('12. Geometria de contacto acompanha translação, rotação e escala das instâncias 3D', () => {
  const b = makeBench()
  // Rodar a bancada 90° em Y, escalar 2× e deslocar o conjunto.
  for (const c of Object.values(b)) {
    const p = c.panel3DPosition!
    c.panel3DPosition = { x: 4 + p.z * 2, y: 3 + p.y * 2, z: 2 - p.x * 2 }
    c.viewOrientation = { x: 0, y: 90, z: 0 }
    c.view3DScale = { x: 2, y: 2, z: 2 }
  }
  b.magazine.state.pickupMaterial = 'preto'
  Object.assign(b.arm.state, { armDownPct: 100, manualVacuum: true })
  stepMechatronics(Object.values(b), idleContext)
  assert.equal(b.arm.state.holding, 'preto')
  Object.assign(b.arm.state, { armDownPct: 0, angleDeg: 270, manualVacuum: false, holdingStamped: true })
  stepMechatronics(Object.values(b), idleContext)
  assert.deepEqual(b.ramp1.state.pieces, ['preto'])
})

check('5. Motor M1: CW/CCW com 0V rodam o braço pelo par cónico 2:1 e o encoder conta', () => {
  const motor = make('mecDcGearmotor'), arm = make('mecRotaryArm')
  const ctx = (dir: 'CW' | 'CCW' | null) => ({
    dtSec: 0.1, airAt: () => false,
    loadPowered: (c: ElectricalComponent, a: string, b: string) => c === motor && a === dir && b === '0V',
  })
  for (let i = 0; i < 10; i += 1) stepMechatronics([motor, arm], ctx('CW'))
  assert.equal(motor.state.running, true)
  assert.equal(arm.state.angleDeg, 90, '30 rpm × 6 °/s ÷ 2 durante 1 s = 90°')
  assert.equal(arm.state.homeActive, false)
  assert.ok(Number(motor.state.encoderCount) > 0)
  for (let i = 0; i < 10; i += 1) stepMechatronics([motor, arm], ctx('CCW'))
  assert.equal(motor.state.direction, 'ccw')
  assert.equal(arm.state.angleDeg, 0)
  assert.equal(arm.state.homeActive, true)
  stepMechatronics([motor, arm], ctx(null))
  assert.equal(motor.state.running, false)
})

check('6. Simulação real: FRL → eletroválvula 5/2 → Cilindro 1 avança e o ejetor gera vácuo na ventosa', () => {
  const st = useSimStore.getState()
  st.newProject('all')
  const frlId = st.addComponent('pneumaticFrl', 0, 0)!
  const valveId = st.addComponent('pneumaticValve52', 200, 0)!
  const feederId = st.addComponent('mecFeederCylinder', 400, 0)!
  const ejId = st.addComponent('mecVacuumEjector', 200, 200)!
  const armId = st.addComponent('mecRotaryArm', 400, 200)!
  const get = (id: string) => useSimStore.getState().components.find((c) => c.id === id)!
  const tid = (id: string, l: string) => get(id).terminals.find((t) => t.label === l)!.id
  st.setWireDefaults({ medium: 'pneumatic' })
  st.addWire(tid(frlId, 'OUT'), tid(valveId, 'P'))
  st.addWire(tid(valveId, 'A'), tid(feederId, 'A'))
  st.addWire(tid(valveId, 'B'), tid(feederId, 'B'))
  st.addWire(tid(frlId, 'OUT'), tid(ejId, 'P'))
  st.addWire(tid(ejId, 'V'), tid(armId, 'VAC'))
  st.setComponentState(valveId, { manualOverride: true })
  for (let i = 0; i < 20; i += 1) useSimStore.getState().step()
  assert.ok(Number(get(feederId).state.positionPct) >= 92, `cilindro avançado (${get(feederId).state.positionPct} %)`)
  assert.equal(get(ejId).state.vacuumActive, true)
  assert.equal(get(armId).state.vacuumActive, true)
  st.setComponentState(valveId, { manualOverride: false })
  for (let i = 0; i < 20; i += 1) useSimStore.getState().step()
  assert.ok(Number(get(feederId).state.positionPct) <= 8, 'cilindro recuado')
})

check('7. Montagem da maquete: tudo sobre a base, estações à cota da ventosa e prato recolhido acima do braço', () => {
  const plate = slotPlateDimsOf({})
  const layout = stampingBenchLayout({})
  const byKey = Object.fromEntries(layout.map((p) => [p.key, p]))
  const top = plate.thicknessMm / 2
  for (const p of layout) {
    const size = mechatronicsSizeMm(p.type, p.state)!
    assert.ok(Math.abs(p.y - size.y / 2 - top) < 0.6 || ['magazine', 'feeder', 'fc1', 'table'].includes(p.key), `${p.key} assente na base`)
    assert.ok(Math.abs(p.x) + size.x / 2 <= plate.lengthMm / 2 + 1, `${p.key} dentro do comprimento da base`)
    // A prensa tem 110 mm de profundidade por causa do manómetro; os perfis ficam dentro da base.
    assert.ok(Math.abs(p.z) + (p.key === 'press' ? 15 : size.z / 2) <= plate.widthMm / 2 + 1, `${p.key} dentro da largura da base`)
  }
  const pieceTopAtPickup = byKey.magazine.y - mechatronicsSizeMm('mecGravityMagazine')!.y / 2 + 8 + MEC_DIMS.workpiece.heightMm - top
  const pieceTopAtTable = byKey.table.y + MEC_DIMS.table.heightMm / 2 - 8 + MEC_DIMS.workpiece.heightMm - top
  assert.equal(Math.round(pieceTopAtPickup), ARM_STATION_TOP_MM)
  assert.equal(Math.round(pieceTopAtTable), ARM_STATION_TOP_MM)
  const p = MEC_DIMS.press
  const plateRetracted = p.gantryHeightMm - p.profileMm - p.plateDropMm
  const cylinderTop = ARM_CYLINDER_BASE_MM + MEC_DIMS.rotaryArm.cylinderBodyMm
  assert.ok(plateRetracted > cylinderTop + 4, `prato recolhido (${plateRetracted} mm) acima do cilindro da ventosa (${cylinderTop} mm)`)
  assert.ok(Math.abs(plateRetracted - p.strokeMm - ARM_STATION_TOP_MM) <= 4, 'curso da prensa chega ao topo da peça na gaveta')
})

check('8. Hierarquia de pivôs: torre → estrutura metálica → cilindro vertical → haste da ventosa', () => {
  const src = readFileSync(new URL('../src/three/MechatronicsDevices3D.tsx', import.meta.url), 'utf8')
  for (const pivot of ['Maquete_Base', 'Cilindro1_Haste', 'Prensa_Haste', 'Braco_Torre_Rotacao', 'Braco_Estrutura_Metalica', 'Braco_Cilindro_Corpo', 'Braco_Cilindro_Z', 'Motor_Pinhao']) {
    assert.ok(src.includes(`name="${pivot}"`), `pivô ${pivot} nomeado`)
  }
  // A haste Z é filha do corpo fixo do cilindro, solidário à estrutura metálica e à torre.
  const arm = src.slice(src.indexOf('function RotaryArm'), src.indexOf('function DcGearmotor'))
  assert.ok(arm.indexOf('Braco_Torre_Rotacao') < arm.indexOf('Braco_Cilindro_Z'), 'cilindro dentro da torre')
  assert.ok(!arm.includes('Braco_Articulacao_Z'), 'sem inclinação do braço metálico')
})

check('13. O cilindro desloca a ventosa só na vertical, com alcance radial constante', () => {
  for (const angle of [0, 90, 180, 270, 359]) {
    const up = armCupLocalMm(angle, 0)
    for (const pct of [25, 50, 75, 100]) {
      const down = armCupLocalMm(angle, pct)
      assert.equal(down.x, up.x)
      assert.equal(down.z, up.z)
      assert.ok(Math.abs(up.y - down.y - MEC_DIMS.rotaryArm.cylinderStrokeMm * pct / 100) < 1e-9)
    }
  }
})

console.log(`\n✅ ${passed} verificações da maquete de estampagem passaram`)
