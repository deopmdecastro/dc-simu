import assert from 'node:assert/strict'
import * as THREE from 'three'
import { createComponent } from '../src/electrical/factory'
import { meterInputFor } from '../src/electrical/meterModel'
import { DM20_DEFINITION } from '../src/three/MultimeterDm20Panel'
import { multimeterReading } from '../src/catalog/behavior'
import { nativePartidaDiretaContent } from '../src/project/nativeProjects'
import { upgradeNativeMotorMeter, NATIVE_MOTOR_METER_FEATURE, NATIVE_MOTOR_DOUBLE_FERRULE_FEATURE } from '../src/project/nativeMotorMeter'
import { useSimStore } from '../src/store/useSimStore'
import { buildWirePath3D, componentObstacles, wireEndpoint3D, cableOuterDiameterMm, type WireObstacle } from '../src/three/wireGeometry3D'
import { pathEntersBoxes, segmentEntersBox, keepWireOutsideSolids, OrientedWireBox } from '../src/three/solidWireRouting'
import { component3DDimensions } from '../src/three/terminal3D'
import { orientationRadians } from '../src/three/componentOrientation'
import type { Wire } from '../src/types'

const store = () => useSimStore.getState()
const run = (n = 5) => { for (let i = 0; i < n; i++) store().step() }
store().loadJSON(JSON.stringify(nativePartidaDiretaContent()))
const meter = () => store().components.find(c => c.id === 'native-mm1')!
const read = () => meterInputFor(DM20_DEFINITION, meter(), store().components, store().wires, store().runtime.energizedTerminals, meter().state.catalogVars)
run()
assert.equal(read().vac, 0, 'contactor aberto: 0 V na entrada do motor')
store().setComponentState('native-push', { startPressed: true }); run(3)
store().setComponentState('native-push', { startPressed: false }); run()
assert.ok(Math.abs(read().vac - 400) < 0.001, 'marcha: 400 V entre U1 e V1')
assert.equal(multimeterReading(meter().state.catalogVars, read(), 0).unit, 'V')
assert.ok(store().components.find(c => c.id === 'native-m1')!.state.running, 'medir não altera o circuito do motor')
store().setComponentState('native-push', { stopPressed: true }); run()
assert.equal(read().vac, 0, 'STOP: tensão regressa a 0 V')
console.log('PASS — Multímetro nativo: 0 V → 400 V → 0 V, medição passiva U1–V1')

const seed = nativePartidaDiretaContent() as any
const old = { ...seed, nativeFeatures: [], components: seed.components.filter((c: any) => c.id !== 'native-mm1'), wires: seed.wires.filter((w: Wire) => !w.id.startsWith('native-meter-')), title: 'Edição do utilizador' }
old.components[0] = { ...old.components[0], label: 'Nome personalizado' }
const upgraded = upgradeNativeMotorMeter(old)
assert.equal(upgraded.components.length, old.components.length + 1)
assert.equal(upgraded.wires.length, old.wires.length + 2)
assert.equal(upgraded.title, old.title)
assert.equal(upgraded.components[0], old.components[0], 'mantém a edição existente')
assert.equal(upgradeNativeMotorMeter(upgraded), upgraded, 'atualização idempotente')
store().loadJSON(JSON.stringify(old))
assert.ok(store().dirty && meter(), 'abrir nativo antigo acrescenta a medição e pede guardar')
const saved = store().saveJSON()
store().loadJSON(saved)
assert.equal(store().components.filter(c => c.id === 'native-mm1').length, 1)
const removed = { ...upgraded, components: upgraded.components.filter((c: any) => c.id !== 'native-mm1') }
assert.equal(upgradeNativeMotorMeter(removed), removed, 'não repõe um aparelho eliminado depois da atualização')
const ordinary = { ...old, nativeId: null }
assert.equal(upgradeNativeMotorMeter(ordinary), ordinary, 'outros projetos permanecem intactos')
const withMeterRef = { ...old, components: old.components.map((c:any,i:number)=>i===0?{...c,ref:'MM1'}:c) }
assert.equal(upgradeNativeMotorMeter(withMeterRef).components.at(-1).ref,'MM2','evita duplicar uma referência já usada pelo utilizador')
console.log('PASS — Nativo guardado: atualização aditiva, persistência, edições preservadas e sem duplicação')

const v1 = {
  ...seed,
  nativeFeatures: [NATIVE_MOTOR_METER_FEATURE],
  wires: seed.wires.map((w: Wire) =>
    (w.toTerminalId === 'native-m1-U1' || w.toTerminalId === 'native-m1-V1') && w.toEndType === 'ferruleDouble'
      ? { ...w, toEndType: 'ferrule', toEndColor: '#445566', waypoints3D: [{ x: 1, y: 2, z: 3 }] }
      : w,
  ),
}
const v2 = upgradeNativeMotorMeter(v1)
assert.equal(v2.components, v1.components, 'a atualização dos colares preserva os aparelhos e a sua posição')
const changed = v2.wires.filter((w: Wire, i: number) => w !== v1.wires[i])
assert.equal(changed.length, 2, 'apenas a alimentação em U1/V1 recebe ponteira dupla na migração do multímetro')
for (const w of changed) {
  assert.equal(w.toEndType, 'ferruleDouble')
  const original = v1.wires.find((old: Wire) => old.id === w.id)
  assert.equal(w.waypoints3D, original.waypoints3D, 'preserva o traçado manual')
  assert.equal(w.toEndColor, original.toEndColor, 'preserva a cor da ponteira')
}
assert.ok(v2.nativeFeatures.includes(NATIVE_MOTOR_DOUBLE_FERRULE_FEATURE))
assert.equal(upgradeNativeMotorMeter(v2), v2)
const noProbes = { ...v1, wires: v1.wires.filter((w: Wire) => !w.id.startsWith('native-meter-')) }
assert.deepEqual(upgradeNativeMotorMeter(noProbes).wires, noProbes.wires, 'não repõe sondas removidas')
store().loadJSON(JSON.stringify(v1))
assert.ok(store().dirty, 'abrir a versão anterior assinala os colares por guardar')
store().loadJSON(store().saveJSON())
assert.equal(
  store().wires.filter(w => (w.toTerminalId === 'native-m1-U1' || w.toTerminalId === 'native-m1-V1') && w.toEndType === 'ferruleDouble').length,
  2,
  'bornes U1/V1 do motor mantêm ponteira dupla',
)
const doubleEndsCount = store().wires.reduce(
  (sum, w) => sum + (w.fromEndType === 'ferruleDouble' ? 1 : 0) + (w.toEndType === 'ferruleDouble' ? 1 : 0),
  0,
)
assert.equal(doubleEndsCount, 20, 'todos os 11 bornes partilhados recebem ponteira dupla automaticamente (20 pontas ferruleDouble)')
// Verificação dinâmica: borne com 1 cabo (ferrule) passa automaticamente a ferruleDouble ao adicionar 2.º cabo e reverte ao remover
const singleBefore = store().wires.filter(w => w.fromTerminalId === 'native-q0-2' || w.toTerminalId === 'native-q0-2')
assert.equal(singleBefore.length, 1)
assert.equal(singleBefore[0].fromTerminalId === 'native-q0-2' ? singleBefore[0].fromEndType : singleBefore[0].toEndType, 'ferrule')
const beforeIds = new Set(store().wires.map(w => w.id))
store().addWire('native-q0-2', 'native-h2-X1')
const addedWire = store().wires.find(w => !beforeIds.has(w.id))
assert.ok(addedWire, 'adiciona segundo cabo no borne Q0.2')
const sharedNow = store().wires.filter(w => w.fromTerminalId === 'native-q0-2' || w.toTerminalId === 'native-q0-2')
assert.equal(sharedNow.length, 2)
for (const w of sharedNow) {
  assert.equal(w.fromTerminalId === 'native-q0-2' ? w.fromEndType : w.toEndType, 'ferruleDouble', 'borne com 2 cabos vira ponteira dupla')
}
store().deleteWire(addedWire!.id)
const reverted = store().wires.filter(w => w.fromTerminalId === 'native-q0-2' || w.toTerminalId === 'native-q0-2')
assert.equal(reverted.length, 1)
assert.equal(reverted[0].fromTerminalId === 'native-q0-2' ? reverted[0].fromEndType : reverted[0].toEndType, 'ferrule', 'ao remover 2.º cabo volta a ponteira simples')
console.log('PASS — Ponteiras duplas universais: migração v1, conversão automática 1↔2 cabos e guardar/reabrir')

// Reproduz o cabo que regressava pelo próprio corpo, incluindo waypoints manuais.
for (const angle of [0, -35, 45]) {
  const device = createComponent('multimeterDm20')
  device.viewOrientation = { x: 15, y: angle, z: 0 }
  const pivots = { [device.id]: new THREE.Vector3(0, 0, 0.4) }
  const obstacles = componentObstacles([device], pivots)
  const size = component3DDimensions(device)
  const body = new THREE.Box3(new THREE.Vector3(-size.x/2,-size.y/2,-size.z/2),new THREE.Vector3(size.x/2,size.y/2,size.z/2)).expandByScalar(0.013)
  const inverse = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...orientationRadians(device.viewOrientation))).invert()
  for (const route of ['direct', 'arc', 'orthogonal'] as const) {
    const wire: Wire = { id: `meter-${route}`, number: 'TEST', fromTerminalId: device.terminals[1].id, toTerminalId: '', toPoint: {x:500,y:700}, toPoint3D: {x:-3.333333333333333,y:0,z:0.2}, color:'red', gauge:'0.75mm²', flexibility:'flexible', kind:'signal', fromEndType:'banana', toEndType:'probe', route, bend:0.5, curveOffset:0, energized:false }
    const from = wireEndpoint3D(wire,'from',[device],pivots)!
    const to = { position:[-2,0,0.2] as [number,number,number], normal:null, free:true }
    for (const manual of [false,true]) {
      const candidate = manual ? { ...wire, waypoints3D:[{x:0,y:0,z:0.4}] } : wire
      const path = buildWirePath3D(candidate,from,to,obstacles)
      assert.ok(path.points.length >= 2, `${route}/${angle}: caminho visível`)
      const local = path.points.map(p=>new THREE.Vector3(...p).sub(pivots[device.id]).applyMatrix4(inverse).toArray() as [number,number,number])
      assert.ok(!pathEntersBoxes(local,[body]), `${route}/${angle}/${manual}: cabo fora do corpo orientado, com raio físico`)
      const tip = new THREE.Vector3(...path.starts[0].origin).addScaledVector(new THREE.Vector3(...path.starts[0].axis),path.starts[0].length)
      assert.ok(tip.distanceTo(new THREE.Vector3(...path.points[0])) < 1e-8, 'corpo do cabo continua ligado à ficha')
    }
  }
}
const thin: WireObstacle = new THREE.Box3(new THREE.Vector3(-0.005,-1,0),new THREE.Vector3(0.005,1,1))
assert.ok(segmentEntersBox([-10,0,0.5],[10,0,0.5],thin),'interseção exata deteta um elemento fino')
const out = keepWireOutsideSolids([[-2,0,0.5],[0,0,0.5],[2,0,0.5]],3,[thin],[{axis:[1,0,0]},{axis:[-1,0,0]}],-0.18)
assert.ok(out.length>=2&&!pathEntersBoxes(out,[thin.clone().expandByScalar(cableOuterDiameterMm('1.5mm²')*0.005)]),'waypoint dentro de outro aparelho é contornado')
console.log('PASS — Corpo sólido: três tipos de traçado, três orientações, pontos manuais e elemento fino')

const rotated = new OrientedWireBox(new THREE.Box3(new THREE.Vector3(-1,-0.1,-0.1), new THREE.Vector3(1,0.1,0.1)), new THREE.Matrix4().makeRotationZ(Math.PI / 4))
assert.equal(segmentEntersBox([-0.7,0.6,0],[0.7,0.6,0],rotated), true, 'segmento que atravessa o corpo orientado é bloqueado')
assert.equal(segmentEntersBox([-0.7,0.6,0],[-0.5,0.6,0],rotated), false, 'canto vazio da caixa mundial não bloqueia um cabo')
assert.equal(rotated.containsPoint(new THREE.Vector3(-0.6,0.6,0)), false)
assert.equal(segmentEntersBox([-0.7,0.6,0],[-0.5,0.6,0],rotated.clone().expandByScalar(0.02)), false, 'clone e margem conservam o referencial físico')
console.log('PASS — Obstáculos orientados: corpo protegido sem bloquear cantos vazios')
