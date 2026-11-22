import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createComponent, paletteGroups } from '../src/electrical/factory'
import { useSimStore } from '../src/store/useSimStore'
import { hasComponent3DVisual } from '../src/three/modelPaths'
import { component3DDimensions } from '../src/three/terminal3D'
import { isPanelBound } from '../src/three/panelBounds'
import { hasDeviceControls } from '../src/components/DeviceControls'
import { HYDRAULIC_DATASHEETS } from '../src/three/hydraulicsModel'
import { PNEUMATIC_DATASHEETS } from '../src/three/pneumaticsModel'
import {
  STRUCTURES_DATASHEETS,
  computeQuickAttach3D,
  snapStructureDragXY,
} from '../src/three/structuresModel'

let passed = 0
function check(name: string, fn: () => void) {
  fn()
  passed += 1
  console.log(`  PASS: ${name}`)
}

console.log('=== Smoke Test: Estruturas/Esteiras, Bomba Isométrica, Condutas Filtradas, Grupos Hidráulica & Pneumática ===')

check('1. Grupos Hidráulica, Pneumática e Estruturas e esteiras existem na Biblioteca com todos os itens', () => {
  const groups = paletteGroups()
  const byName = new Map(groups.map((g) => [g.group, g.items.map((i) => i.type)]))
  for (const t of ['waterTank', 'waterPump', 'floatSwitch', 'hydraulicValve', 'hydraulicTee']) {
    assert.ok(byName.get('Hidráulica')?.includes(t as any), `Hidráulica deve conter ${t}`)
  }
  for (const t of ['pneumaticFrl', 'pneumaticValve52', 'pneumaticCylinder', 'pneumaticTee']) {
    assert.ok(byName.get('Pneumática')?.includes(t as any), `Pneumática deve conter ${t}`)
  }
  for (const t of [
    'industrialWall',
    'industrialPillar',
    'cableTrayStraight',
    'cableTrayElbow90',
    'cableTrayCross',
    'cableTrayVerticalBend',
    'cableTrayRiser90',
  ]) {
    assert.ok(byName.get('Estruturas e esteiras')?.includes(t as any), `Estruturas e esteiras deve conter ${t}`)
  }
})

check('2. Todos os novos componentes têm 3D desbloqueado, DeviceControls, dimensões válidas e PDF real', () => {
  const allNew = [
    'hydraulicValve',
    'hydraulicTee',
    'pneumaticFrl',
    'pneumaticValve52',
    'pneumaticCylinder',
    'pneumaticTee',
    'industrialWall',
    'industrialPillar',
    'cableTrayStraight',
    'cableTrayElbow90',
    'cableTrayCross',
    'cableTrayVerticalBend',
    'cableTrayRiser90',
  ] as const
  for (const type of allNew) {
    const c = createComponent(type, 200, 200)
    assert.equal(hasComponent3DVisual(type), true, `3D visual para ${type}`)
    assert.equal(hasDeviceControls(type), true, `DeviceControls para ${type}`)
    assert.equal(isPanelBound(c), false, `${type} não deve ficar preso ao painel`)
    const dims = component3DDimensions(c)
    assert.ok(dims.x > 0 && dims.y > 0 && dims.z > 0, `Dimensões 3D > 0 para ${type}`)
  }
  for (const ds of [
    ...Object.values(HYDRAULIC_DATASHEETS),
    ...Object.values(PNEUMATIC_DATASHEETS),
    ...Object.values(STRUCTURES_DATASHEETS),
  ]) {
    const file = path.resolve('public', ds.path.replace(/^\//, ''))
    assert.equal(fs.existsSync(file), true, `PDF em falta: ${file}`)
    assert.equal(fs.readFileSync(file).subarray(0, 5).toString('ascii'), '%PDF-')
  }
})

check('3. Encaixe magnético (snapStructureDragXY) e construção rápida (computeQuickAttach3D) alinham esteiras', () => {
  const t1 = createComponent('cableTrayStraight', 100, 100)
  const t2 = createComponent('cableTrayElbow90', 300, 100)
  const attach = computeQuickAttach3D(t1, { x: 0, y: 2, z: 1.5 }, 'cableTrayElbow90', 'right')
  assert.ok(attach.position3D.x > 6, 'Curva encaixada à direita da reta de 1200mm')
  assert.equal(attach.position3D.y, 2, 'Mesma altura Y')
  assert.equal(attach.statePatch.widthMm, 200, 'Herda largura da esteira')

  const snap = snapStructureDragXY(
    t2,
    { x: attach.position3D.x + 0.5, y: 2.3 },
    [t1, t2],
    { [t1.id]: { x: 0, y: 2, z: 1.5 } },
    1.8,
  )
  assert.equal(snap.snapped, true, 'Deve encaixar magneticamente')
  assert.ok(Math.abs(snap.x - attach.position3D.x) < 0.01, 'Encaixe exato borda-a-borda em X')
  assert.equal(snap.y, 2, 'Alinhamento exato em Y')

  // Alcance por omissão (25 mm): perto encaixa; a 50 mm o arrasto segue o rato sem saltar.
  const pivots = { [t1.id]: { x: 0, y: 2, z: 1.5 } }
  const near = snapStructureDragXY(t2, { x: attach.position3D.x + 0.1, y: 2.1 }, [t1, t2], pivots)
  assert.equal(near.snapped, true, 'A 10 mm encaixa')
  assert.ok(Math.abs(near.x - attach.position3D.x) < 0.01)
  const free = snapStructureDragXY(t2, { x: attach.position3D.x + 0.5, y: 2.4 }, [t1, t2], pivots)
  assert.equal(free.snapped, false, 'A 50 mm não puxa (antes puxava até 180 mm)')
  assert.equal(free.x, attach.position3D.x + 0.5)
  assert.equal(free.y, 2.4)
})

check('4. Simulação pneumática completa (FRL → Válvula 5/2 → Cilindro ISO avança e recua com 0 erros)', () => {
  useSimStore.setState({ components: [], wires: [], diagnostics: [], energizedWireIds: [], energizedTerminalIds: [] })
  const st = useSimStore.getState()
  const frlId = st.addComponent('pneumaticFrl', 100, 200)!
  const v52Id = st.addComponent('pneumaticValve52', 320, 200)!
  const cylId = st.addComponent('pneumaticCylinder', 560, 200)!

  const comps = useSimStore.getState().components
  const frl = comps.find((c) => c.id === frlId)!
  const v52 = comps.find((c) => c.id === v52Id)!
  const cyl = comps.find((c) => c.id === cylId)!
  const tOf = (c: typeof frl, lbl: string) => c.terminals.find((t) => t.label === lbl)!.id

  // Tubos pneumáticos
  useSimStore.getState().setWireDefaults({ medium: 'pneumatic', gauge: 'PU Ø6mm', endType: 'pneumaticPushIn', color: 'lightblue', autoColor: false })
  useSimStore.getState().addWire(tOf(frl, 'OUT'), tOf(v52, 'P'), 'lightblue')
  useSimStore.getState().addWire(tOf(v52, 'A'), tOf(cyl, 'A'), 'lightblue')
  useSimStore.getState().addWire(tOf(v52, 'B'), tOf(cyl, 'B'), 'lightblue')

  // Acionar comando manual da válvula 5/2 -> cilindro avança até 100%
  useSimStore.setState({ runState: 'running' })
  useSimStore.getState().setComponentState(v52Id, { manualOverride: true })
  for (let i = 0; i < 10; i += 1) useSimStore.getState().step(120)
  const ext = useSimStore.getState().components.find((c) => c.id === cylId)!
  assert.equal(ext.state.positionPct, 100, 'Cilindro deve avançar a 100% quando válvula 5/2 ativa')

  // Soltar comando -> cilindro recua a 0%
  useSimStore.getState().setComponentState(v52Id, { manualOverride: false })
  for (let i = 0; i < 10; i += 1) useSimStore.getState().step(120)
  const ret = useSimStore.getState().components.find((c) => c.id === cylId)!
  assert.equal(ret.state.positionPct, 0, 'Cilindro deve recuar a 0% quando válvula 5/2 em repouso')

  const errs = useSimStore.getState().diagnostics.filter((d) => d.severity === 'error')
  assert.equal(errs.length, 0, `Sem erros elétricos no circuito pneumático, obtidos: ${JSON.stringify(errs)}`)
})

check('5. Bomba com chapa reposicionada + Vista isométrica por defeito + Filtragem estrita de condutas', () => {
  const panelSrc = fs.readFileSync(path.resolve('src/three/Panel3D.tsx'), 'utf8')
  assert.ok(panelSrc.includes("view: 'isometric'"), 'Panel3D deve arrancar em vista isométrica por defeito')
  const hydSrc = fs.readFileSync(path.resolve('src/three/HydraulicsDevices3D.tsx'), 'utf8')
  assert.ok(hydSrc.includes('position={[0, H * 0.44, 73.5 * U]}'), 'Chapa CALPEDA na lateral da carcaça sem sobrepor caixa de bornes')
  const woSrc = fs.readFileSync(path.resolve('src/ui/WireOptions.tsx'), 'utf8')
  assert.ok(woSrc.includes('data-hydraulic-only-controls') && woSrc.includes('data-pneumatic-only-controls') && woSrc.includes('data-electrical-only-controls'))
})

console.log(`ALL ${passed}/${passed} CHECKS PASSED!`)
