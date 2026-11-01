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
for (const id of ['native-wire-4','native-wire-8','native-wire-12','native-wire-18']) assert.equal(seed.wires.find((w: Wire) => w.id === id).toEndType, 'ring')
const original = structuredClone(seed)
original.nativeFeatures = original.nativeFeatures.filter((x: string) => x !== NATIVE_MOTOR_RING_FEATURE)
const w4 = original.wires.find((w: Wire) => w.id === 'native-wire-4')
const w8 = original.wires.find((w: Wire) => w.id === 'native-wire-8')
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
const ring = seed.wires.find((w: Wire) => w.id === 'native-wire-4')
assert.equal(withMotorMeterFerrules([ring, lead], [lead])[0].toEndType, 'ring')
// Refresh das curvas do projeto nativo: dobras 3D antigas saem só dos cabos de origem intactos.
{
  const { refreshNativeWireCurves } = await import('../src/project/nativeWireCurves')
  const { NATIVE_WIRE_CURVES_FEATURE } = await import('../src/project/nativeMotorMeter')
  assert.ok(seed.nativeFeatures.includes(NATIVE_WIRE_CURVES_FEATURE), 'projetos nativos novos já nascem com as curvas atuais')
  const old = structuredClone(seed)
  old.nativeFeatures = old.nativeFeatures.filter((x: string) => x !== NATIVE_WIRE_CURVES_FEATURE)
  const bent = old.wires.find((w: Wire) => w.id === 'native-wire-4')
  bent.waypoints3D = [[1, 2, 3]]; bent.route = 'arc'
  const moved = old.wires.find((w: Wire) => w.id === 'native-wire-8')
  moved.waypoints3D = [[4, 5, 6]]; moved.toTerminalId = 'personalizado'
  old.wires.push({ ...structuredClone(bent), id: 'meu-cabo', waypoints3D: [[7, 8, 9]] })
  const fresh = refreshNativeWireCurves(old)
  const after = (id: string) => fresh.wires.find((w: Wire) => w.id === id)
  assert.ok(!after('native-wire-4').waypoints3D && after('native-wire-4').route === seed.wires.find((w: Wire) => w.id === 'native-wire-4').route, 'cabo nativo intacto perde as dobras 3D antigas e volta à curva de origem')
  assert.deepEqual(after('native-wire-8').waypoints3D, [[4, 5, 6]], 'cabo com outra ponta (alterado pelo utilizador) mantém-se')
  assert.deepEqual(after('meu-cabo').waypoints3D, [[7, 8, 9]], 'cabos criados pelo utilizador não são tocados')
  assert.equal(refreshNativeWireCurves(fresh), fresh, 'refresh corre uma só vez')
  assert.deepEqual(bent.waypoints3D, [[1, 2, 3]], 'não altera o objeto de origem')
}
console.log('PASS — curvas sem retrocesso, olhais nativos, migração seletiva e refresh das curvas nativas')
