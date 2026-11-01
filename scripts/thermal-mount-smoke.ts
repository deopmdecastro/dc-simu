/**
 * Relé térmico encaixado por baixo do contactor: posição pelos bornes reais, íman, um relé por
 * contactor, o relé acompanha o contactor e as ligações internas (3 polos + passagem A2).
 */
import assert from 'node:assert/strict'
import { buildNativePartidaDireta } from '../src/project/nativeProjects'
import * as THREE from 'three'
import { findMountTarget, mountBridges, mountDepthOffset, mountPosition, syncMounted } from '../src/three/thermalMount'
import { componentHalfExtents } from '../src/three/panelBounds'
import { componentPanelXY } from '../src/three/panelLayout'
import { terminalWorld3D } from '../src/three/terminal3D'
import { PANEL_UNITS_PER_MM } from '../src/three/modelPaths'
import { createComponent } from '../src/electrical/factory'
import { schematicDiagnostics } from '../src/diagnostics/viewDiagnostics'

let checks = 0
const check = (ok: boolean, message: string) => { assert.ok(ok, message); console.log(`PASS — ${message}`); checks++ }

const seed = buildNativePartidaDireta()
const km = seed.components.find((c) => c.id === 'native-km1')!
const f1 = seed.components.find((c) => c.id === 'native-f1')!
const at = mountPosition(f1, km)!
check(at.schematicX === f1.schematicX && at.schematicY === f1.schematicY, 'o F1 nativo está na posição de encaixe do KM1')
check(f1.schematicY > km.schematicY && Math.abs((f1.schematicX + f1.w / 2) - (km.schematicX + km.w / 2)) < 6, 'o relé fica por baixo do contactor, centrado')

// Pinos dentro do contactor: mesma profundidade dos bornes 2T1/4T2/6T3 e corpo encostado à base.
{
  const zOf = (c: typeof km) => componentHalfExtents(c).z + mountDepthOffset(c, seed.components)
  const kmPivot = new THREE.Vector3(0, 0, zOf(km))
  const f1Pivot = new THREE.Vector3(0, 0, zOf(f1))
  const sockets = ['2T1', '4T2', '6T3'].map((l) => terminalWorld3D(km, km.terminals.find((t) => t.label === l)!, kmPivot).z)
  const pins = ['1L1', '3L2', '5L3'].map((l) => terminalWorld3D(f1, f1.terminals.find((t) => t.label === l)!, f1Pivot).z)
  check(sockets.every((z, i) => Math.abs(z - pins[i]) < 0.005), 'os pinos do F1 ficam à profundidade dos bornes do KM1 (não saem pela frente)')
  const kmBottom = componentPanelXY(km).y - componentHalfExtents(km).y
  const f1BodyTop = componentPanelXY(f1).y + componentHalfExtents(f1).y - 9.4 * PANEL_UNITS_PER_MM
  check(Math.abs(kmBottom - f1BodyTop) < 0.012, `o corpo do F1 encosta à base do KM1, pinos inseridos (folga ${((f1BodyTop - kmBottom) / PANEL_UNITS_PER_MM).toFixed(1)} mm)`)
}

// Íman: perto encaixa; longe não.
const loose = { ...f1, mountedOn: undefined, schematicX: f1.schematicX + 14, schematicY: f1.schematicY + 22 }
const others = seed.components.filter((c) => c.id !== f1.id)
const hit = findMountTarget(loose, [...others, loose])
check(hit?.contactor.id === km.id && hit.schematicX === at.schematicX && hit.schematicY === at.schematicY, 'largado perto do fundo do KM1, o relé encaixa')
check(!findMountTarget({ ...loose, schematicX: f1.schematicX + 300 }, [...others, loose]), 'longe de qualquer contactor não encaixa')
// Um relé por contactor.
const second = { ...createComponent('thermalRelaySiemens3ru1116', 'F2', 'Segundo relé'), id: 'f2' }
second.terminals = second.terminals.map((t) => ({ ...t, componentId: 'f2', id: `f2-${t.label}` }))
Object.assign(second, { schematicX: f1.schematicX + 6, schematicY: f1.schematicY + 6 })
check(!findMountTarget(second, [...seed.components, second]), 'um contactor com relé encaixado não aceita outro')

// O relé acompanha o contactor (posição derivada do contactor).
const movedKm = { ...km, schematicX: km.schematicX + 40, schematicY: km.schematicY - 20 }
const synced = syncMounted(seed.components.map((c) => (c.id === km.id ? movedKm : c)))
const f1After = synced.find((c) => c.id === f1.id)!
check(f1After.schematicX === f1.schematicX + 40 && f1After.schematicY === f1.schematicY - 20, 'mover o contactor leva o relé encaixado')
check(syncMounted(seed.components) === seed.components, 'sem mudanças, a sincronização não cria componentes novos')
check(!syncMounted(seed.components.filter((c) => c.id !== km.id)).find((c) => c.id === f1.id)!.mountedOn, 'apagado o contactor, o relé fica solto')

// Ligações internas do encaixe.
const bridges = mountBridges(seed.components)
const pairs = bridges.map((w) => `${w.fromTerminalId}>${w.toTerminalId}`).sort()
check(JSON.stringify(pairs) === JSON.stringify(['native-km1-2T1>native-f1-1L1', 'native-km1-4T2>native-f1-3L2', 'native-km1-6T3>native-f1-5L3', 'native-km1-A2>native-f1-A2'].sort()), 'ligações internas: 2T1→1L1, 4T2→3L2, 6T3→5L3 e passagem A2')

// Diagnóstico: encaixe sem aviso de sobreposição, A2 de passagem com a classe da bobina e fases até ao motor.
const diag = schematicDiagnostics(seed.components, seed.wires, [], false)
check(diag.length === 0, 'projeto nativo sem avisos com o F1 encaixado (' + diag.map((d) => d.message).join(' | ') + ')')

console.log(`\n${checks} verificações do encaixe relé térmico ↔ contactor passaram`)
