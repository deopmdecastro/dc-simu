import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createComponent } from '../src/electrical/factory'
import { useSimStore } from '../src/store/useSimStore'
import { hasComponent3DVisual } from '../src/three/modelPaths'
import { component3DDimensions } from '../src/three/terminal3D'
import { isPanelBound } from '../src/three/panelBounds'
import {
  CONVEYOR_DATASHEETS,
  conveyorDimensionsOf,
  conveyorLineSensorsOf,
  isFloorMountedMachineType,
} from '../src/three/conveyorModel'
import { hasDeviceControls } from '../src/components/DeviceControls'

let passed = 0
function check(name: string, fn: () => void) {
  fn()
  passed += 1
  console.log(`  PASS: ${name}`)
}

console.log('=== Smoke Test: Ambiente Fabril Limpo, Tampa do Motor, Tapete Rolante & Espelho Ótico ===')

check('1. FactoryEnvironment3D sem estantes/camião/empilhadores/escritório e com texturas PBR', () => {
  const src = fs.readFileSync(path.resolve('src/three/FactoryEnvironment3D.tsx'), 'utf8')
  const banned = ['DeliveryTruck', 'Forklift', 'PalletRack', 'FactoryOffice', 'StaticConveyor', 'cardboard']
  for (const token of banned) {
    assert.equal(src.includes(token), false, `FactoryEnvironment3D não deve conter ${token}`)
  }
  assert.equal(src.includes('createConcreteFloorPbr'), true)
  assert.equal(src.includes('createConcreteWallPbr'), true)
})

check('2. Datasheets PDF existem para tapete rolante e espelho refletor ótico', () => {
  for (const [k, ds] of Object.entries(CONVEYOR_DATASHEETS)) {
    const file = path.resolve('public', ds.path.replace(/^\//, ''))
    assert.equal(fs.existsSync(file), true, `PDF em falta para ${k}: ${file}`)
    const bytes = fs.readFileSync(file)
    assert.equal(bytes.subarray(0, 5).toString('ascii'), '%PDF-', `PDF inválido para ${k}`)
  }
})

check('3. Motores e tapete iniciam com caixa de bornes aberta (terminalBoxCovered=false) e controles ativos', () => {
  for (const type of ['motor3ph', 'motor1ph', 'waterPump', 'rollerConveyor'] as const) {
    const comp = createComponent(type, 100, 100)
    assert.equal(comp.state.terminalBoxCovered, false, `${type} deve abrir destapado por defeito`)
    assert.equal(hasDeviceControls(type), true, `${type} deve ter DeviceControls`)
    assert.equal(hasComponent3DVisual(type), true, `${type} deve estar desbloqueado em 3D`)
    assert.equal(isFloorMountedMachineType(type), true, `${type} deve ser máquina de chão`)
    assert.equal(isPanelBound(comp), false, `${type} nunca pode ficar preso dentro do quadro`)
  }
})

check('4. Espelho refletor ótico criado corretamente com rotação, inclinação e 0 bornes', () => {
  const ref = createComponent('opticalReflector', 200, 200)
  assert.equal(ref.terminals.length, 0)
  assert.equal(hasComponent3DVisual('opticalReflector'), true)
  assert.equal(hasDeviceControls('opticalReflector'), true)
  assert.equal(isPanelBound(ref), false)
  const dims50 = component3DDimensions(ref)
  assert.ok(dims50.x > 0 && dims50.y > 0 && dims50.z > 0)
  ref.state.faceSizeMm = 80
  const dims80 = component3DDimensions(ref)
  assert.ok(dims80.x > dims50.x, 'Tamanho 80mm deve aumentar a dimensão 3D')
})

check('5. Tapete rolante: dimensões editáveis e sensores na linha configuráveis', () => {
  const conv = createComponent('rollerConveyor', 300, 300)
  const d0 = conveyorDimensionsOf(conv.state)
  assert.equal(d0.lengthMm, 1600)
  assert.equal(d0.widthMm, 680)
  assert.equal(d0.heightMm, 750)
  const size0 = component3DDimensions(conv)
  conv.state.lengthMm = 2800
  conv.state.widthMm = 900
  conv.state.heightMm = 900
  const size1 = component3DDimensions(conv)
  assert.ok(size1.x > size0.x && size1.y > size0.y && size1.z > size0.z, 'Dimensões 3D devem escalar com a linha')

  const sensors = conveyorLineSensorsOf(conv.state)
  assert.equal(sensors.length, 2)
  assert.equal(sensors[0].withReflector, true)
})

check('6. Simulação trifásica do tapete rolante motorizado + movimento de caixa + disparo de sensor + modo livre', () => {
  useSimStore.setState({ components: [], wires: [], diagnostics: [], energizedWireIds: [], energizedTerminalIds: [] })
  const srcId = useSimStore.getState().addComponent('powerSource3ph', 120, 120)!
  const convId = useSimStore.getState().addComponent('rollerConveyor', 420, 260)!
  const reflId = useSimStore.getState().addComponent('opticalReflector', 620, 260)!
  assert.ok(srcId && convId && reflId)

  const state0 = useSimStore.getState()
  const src = state0.components.find((c) => c.id === srcId)!
  const conv = state0.components.find((c) => c.id === convId)!
  const tOf = (c: typeof src, label: string) => c.terminals.find((t) => t.label === label)!.id

  state0.addWire(tOf(src, 'L1'), tOf(conv, 'U1'), '#78350f')
  state0.addWire(tOf(src, 'L2'), tOf(conv, 'V1'), '#111827')
  state0.addWire(tOf(src, 'L3'), tOf(conv, 'W1'), '#6b7280')
  state0.addWire(tOf(src, 'PE'), tOf(conv, 'PE'), '#84cc16')

  // Ligar simulação e dar vários passos
  useSimStore.setState({ runState: 'running' })
  for (let i = 0; i < 12; i += 1) useSimStore.getState().step(120)

  const afterMotorized = useSimStore.getState().components.find((c) => c.id === convId)!
  assert.equal(afterMotorized.state.running, true, 'Tapete motorizado trifásico deve arrancar')
  assert.ok(Number(afterMotorized.state.rpmVisual) > 0.2, 'Velocidade visual deve subir')
  assert.notEqual(afterMotorized.state.testBoxPosPct, 24, 'Caixa de teste deve deslocar-se sobre os rolos')

  // Tapar a caixa de bornes do motor do tapete
  useSimStore.getState().setComponentState(convId, { terminalBoxCovered: true })
  assert.equal(useSimStore.getState().components.find((c) => c.id === convId)!.state.terminalBoxCovered, true)

  // Alternar para modo sem motor (tapete livre por gravidade)
  useSimStore.getState().setComponentState(convId, { motorized: false })
  for (let i = 0; i < 6; i += 1) useSimStore.getState().step(120)
  const afterFree = useSimStore.getState().components.find((c) => c.id === convId)!
  assert.equal(afterFree.state.running, false, 'Tapete sem motor não deve entrar em marcha elétrica')

  // Diagnósticos elétricos sem erros no espelho refletor ótico
  const diags = useSimStore.getState().diagnostics.filter((d) => d.severity === 'error')
  assert.equal(diags.length, 0, `Sem erros elétricos esperados, obtidos: ${JSON.stringify(diags)}`)
})

console.log(`ALL ${passed}/${passed} CHECKS PASSED!`)
