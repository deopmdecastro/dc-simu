import assert from 'node:assert/strict'
import * as THREE from 'three'
import { loadModelMm } from './detect-interfaces'
import { REAL_TERMINALS } from '../src/electrical/realInterfaces'
import { importedComponentInfo } from '../src/electrical/importedComponents'
import { createComponent, terminalByLabel } from '../src/electrical/factory'
import { detectHoles } from '../src/catalog/holeDetect'
import { FACE_NORMAL } from '../src/catalog/terminalProfiles'
import { auditTerminalSeats, measureSeat, seatFix, socketForHole } from '../src/catalog/terminalSeat'
import type { TerminalDef, Vec3 } from '../src/catalog/types'
import type { ComponentType } from '../src/types'

// Verificação de encaixe do editor (terminalSeat) contra os encaixes medidos dos modelos integrados.
const terminal = (id: string, position: Vec3, normal: Vec3, diameterMm: number, extra: Partial<TerminalDef> = {}): TerminalDef => ({
  id, label: id, name: id, position, normal, kind: 'io', terminalType: 'screw', polarity: 'none', electricalClass: 'other', direction: 'io', accepts: '', color: '#ccc', diameterMm, ...extra,
})

let seated = 0, holesTested = 0, fixed = 0
for (const type of Object.keys(REAL_TERMINALS) as ComponentType[]) {
  const model = await loadModelMm(type)
  assert.ok(model, `${type}: GLB em falta`)
  const { root, box } = model
  const size = box.getSize(new THREE.Vector3())
  const component = createComponent(type)
  // Só os encaixes com cavidade (`contact` socket) assentam num furo; pinos e pontas de fio ficam de fora.
  const sockets = REAL_TERMINALS[type]!.filter((spot) => !spot.contact || spot.contact === 'socket')
  if (!sockets.length) { console.log(`PASS — ${type}: só pinos/fios, sem cavidades a verificar`); continue }
  const defs: TerminalDef[] = sockets.map((spot) => {
    const live = terminalByLabel(component, spot.label)!
    const at = live.position3D!
    const position: Vec3 = [(at.x - .5) * size.x, (at.y - .5) * size.y, (at.z - .5) * size.z]
    return terminal(spot.label, position, FACE_NORMAL[spot.face], spot.diameterMm ?? 4)
  })
  const reports = auditTerminalSeats(root, defs)
  for (const report of reports) {
    assert.equal(report.status, 'seated', `${type}.${report.label}: ${report.status} — ${report.message}`)
    seated++
  }
  // Um borne posto à superfície (boca do furo), como o editor fazia antes, tem de ser apanhado e corrigido.
  const first = defs[0]
  const face = reports[0].face
  const axis = face === 'front' || face === 'back' ? 2 : face === 'left' || face === 'right' ? 0 : 1
  const sign = first.normal[axis] >= 0 ? 1 : -1
  const atMouth = [...first.position] as Vec3
  atMouth[axis] = first.position[axis] + sign * (reports[0].targetMm - reports[0].lipMm)
  const mouth = auditTerminalSeats(root, [{ ...first, position: atMouth }])[0]
  assert.ok(mouth.status === 'mouth' || mouth.status === 'outside', `${type}.${first.label}: borne à boca não detetado (${mouth.status})`)
  const patch = seatFix({ ...first, position: atMouth }, mouth, [])
  assert.ok(patch, `${type}.${first.label}: sem correção para o borne à boca`)
  assert.equal(measureSeat(root, patch!.position, patch!.normal, first.diameterMm).status, 'seated', `${type}.${first.label}: correção não fica na cavidade`)
  fixed++
  // Bornes criados a partir de furos detetados ficam no interior da cavidade.
  const holes = detectHoles(root, face, { minDiameterMm: 2, maxDiameterMm: 16, limit: 6 })
  // CAD importados: só os furos que são bornes declarados (poços de botões, rearme e ventilação não são ligações).
  const imported = !!importedComponentInfo(type)
  const nearSocket = (position: number[]) => defs.some((def) => Math.hypot(def.position[0] - position[0], def.position[1] - position[1], def.position[2] - position[2]) < Math.max(3, def.diameterMm / 2))
  for (const hole of holes.filter((item) => !item.through && item.depthMm > 1 && (!imported || nearSocket(item.position)))) {
    const socket = socketForHole(root, hole)
    const status = measureSeat(root, socket.position, socket.normal, socket.diameterMm).status
    // Cavidade cilíndrica → dentro; aperto com cabeça de parafuso ao centro → à boca, nunca enterrado nem a flutuar.
    assert.ok(status === 'seated' || (!socket.socketDepthMm && (status === 'surface' || status === 'mouth')), `${type}: furo Ø${hole.diameterMm.toFixed(1)} em ${hole.position.map((n) => n.toFixed(1)).join('/')} → ${status}`)
    if (socket.socketDepthMm) assert.ok(socket.socketInsetMm! < socket.socketDepthMm, `${type}: recuo maior do que o furo`)
    if (status === 'seated') holesTested++
  }
  console.log(`PASS — ${type}: ${reports.length} bornes na cavidade; borne à boca corrigido; ${holes.length} furo(s) da face ${face}`)
}

// Bornes sobre face plana / fora do modelo.
const cube = new THREE.Mesh(new THREE.BoxGeometry(40, 40, 20), new THREE.MeshBasicMaterial())
const plain = new THREE.Group(); plain.add(cube)
assert.equal(measureSeat(plain, [0, 0, 10], [0, 0, 1], 4).status, 'surface', 'face plana devia dar «surface»')
assert.equal(measureSeat(plain, [0, 0, 6], [0, 0, 1], 4).status, 'buried', 'ponto atrás da face devia dar «buried»')
assert.equal(measureSeat(plain, [80, 80, 10], [0, 0, 1], 4).status, 'floating', 'fora do modelo devia dar «floating»')

assert.equal(seated, 199, 'Cobertura incompleta: 142 bornes anteriores, 20 encaixes calibrados, 32 parafusos medidos nos CAD importados e os 5 do motor monofásico')
console.log(`PASS — ${seated} bornes integrados confirmados dentro das cavidades; ${fixed} correções «boca → cavidade»; ${holesTested} bornes criados a partir de furos ficaram na cavidade`)
