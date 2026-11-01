import assert from 'node:assert/strict'
import { roundCorners, removeWireBacktracks } from '../src/three/wireGeometry3D'
import { nativePartidaDiretaContent } from '../src/project/nativeProjects'
import { NATIVE_MOTOR_RING_FEATURE, upgradeNativeMotorRings, withMotorMeterFerrules } from '../src/project/nativeMotorMeter'
import type { Wire } from '../src/types'

// Cotovelos próximos não podem sobrepor arcos e fazer o traçado inverter.
const curve = roundCorners([[0,0,0],[1,0,0],[1,0.05,0],[2,0.05,0]], 3)
for (let i = 1; i < curve.length; i++) assert.ok(curve[i][0] >= curve[i-1][0] - 1e-9 && curve[i][1] >= curve[i-1][1] - 1e-9, 'arcos adjacentes não retrocedem')
const clean = removeWireBacktracks([[0,0,0],[1,0,0],[0.5,0,0],[2,0,0]])
assert.deepEqual(clean, [[0,0,0],[0.5,0,0],[2,0,0]])
assert.deepEqual(removeWireBacktracks([[0,0,0],[1,0,0],[0.5,0.01,0]]), [[0,0,0],[1,0,0],[0.5,0.01,0]], 'não atalhar desvios reais')

const seed = nativePartidaDiretaContent() as any
// Cabos de força e PE do motor (vindos do relé térmico F1 e do XG): olhal sob a porca.
const motorFeeders = seed.wires.filter((w: Wire) => ['native-m1-U1', 'native-m1-V1', 'native-m1-W1', 'native-m1-PE'].includes(w.toTerminalId) && !w.id.startsWith('native-meter-'))
assert.equal(motorFeeders.length, 4)
for (const w of motorFeeders) assert.equal(w.toEndType, 'ring')
// Migração antiga dos olhais: projeto guardado antes do F1 (KM1 → motor nos cabos 4 e 8).
const original = structuredClone(seed)
original.nativeFeatures = original.nativeFeatures.filter((x: string) => x !== NATIVE_MOTOR_RING_FEATURE)
// (Com o F1 encaixado, a semente já não tem estes cabos: recriam-se como eram.)
const template = original.wires.find((w: Wire) => w.id === 'native-wire-3')
const w4 = { ...structuredClone(template), id: 'native-wire-4', fromTerminalId: 'native-km1-2T1', toTerminalId: 'native-m1-U1' }
const w8 = { ...structuredClone(template), id: 'native-wire-8', fromTerminalId: 'native-km1-4T2', toTerminalId: 'native-m1-V1' }
original.wires.push(w4, w8)
w4.toEndType = 'ferruleDouble'; w8.toEndType = 'ferruleDouble'
const migrated = upgradeNativeMotorRings(original)
assert.equal(migrated.wires.find((w: Wire) => w.id === w4.id).toEndType, 'ring')
assert.equal(migrated.wires.find((w: Wire) => w.id === w8.id).toEndType, 'ring')
assert.equal(w4.toEndType, 'ferruleDouble', 'não altera o objeto de origem')
assert.equal(upgradeNativeMotorRings(migrated), migrated, 'migração idempotente')
const changed = structuredClone(original); changed.wires.find((w: Wire) => w.id === w4.id).toTerminalId = 'personalizado'
changed.wires = changed.wires.filter((w: Wire) => w.id !== w8.id)
const kept = upgradeNativeMotorRings(changed)
assert.equal(kept.wires.find((w: Wire) => w.id === w4.id).toEndType, 'ferruleDouble')
assert.ok(!kept.wires.find((w: Wire) => w.id === w8.id), 'não recria cabos eliminados')
assert.equal(upgradeNativeMotorRings({ ...original, nativeId: 'outro' }).wires, original.wires)
const lead = seed.wires.find((w: Wire) => w.id === 'native-meter-red')
const ring = seed.wires.find((w: Wire) => w.toTerminalId === lead.toTerminalId && !w.id.startsWith('native-meter-'))
assert.equal(withMotorMeterFerrules([ring, lead], [lead])[0].toEndType, 'ring')
// Refresh das curvas do projeto nativo: dobras 3D antigas saem só dos cabos de origem intactos.
{
  const { refreshNativeWireCurves } = await import('../src/project/nativeWireCurves')
  const { NATIVE_WIRE_CURVES_FEATURE } = await import('../src/project/nativeMotorMeter')
  assert.ok(seed.nativeFeatures.includes(NATIVE_WIRE_CURVES_FEATURE), 'projetos nativos novos já nascem com as curvas atuais')
  const old = structuredClone(seed)
  old.nativeFeatures = old.nativeFeatures.filter((x: string) => x !== NATIVE_WIRE_CURVES_FEATURE)
  const bent = old.wires.find((w: Wire) => w.id === 'native-wire-3')
  bent.waypoints3D = [[1, 2, 3]]; bent.route = 'arc'
  const moved = old.wires.find((w: Wire) => w.id === 'native-wire-7')
  moved.waypoints3D = [[4, 5, 6]]; moved.toTerminalId = 'personalizado'
  old.wires.push({ ...structuredClone(bent), id: 'meu-cabo', waypoints3D: [[7, 8, 9]] })
  const fresh = refreshNativeWireCurves(old)
  const after = (id: string) => fresh.wires.find((w: Wire) => w.id === id)
  assert.ok(!after('native-wire-3').waypoints3D && after('native-wire-3').route === seed.wires.find((w: Wire) => w.id === 'native-wire-3').route, 'cabo nativo intacto perde as dobras 3D antigas e volta à curva de origem')
  assert.deepEqual(after('native-wire-7').waypoints3D, [[4, 5, 6]], 'cabo com outra ponta (alterado pelo utilizador) mantém-se')
  assert.deepEqual(after('meu-cabo').waypoints3D, [[7, 8, 9]], 'cabos criados pelo utilizador não são tocados')
  assert.equal(refreshNativeWireCurves(fresh), fresh, 'refresh corre uma só vez')
  assert.deepEqual(bent.waypoints3D, [[1, 2, 3]], 'não altera o objeto de origem')
}
console.log('PASS — curvas sem retrocesso, olhais nativos, migração seletiva e refresh das curvas nativas')
