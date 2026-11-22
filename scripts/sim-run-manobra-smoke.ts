import assert from 'node:assert/strict'
import { createComponent } from '../src/electrical/factory'
import { useSimStore } from '../src/store/useSimStore'
import type { ComponentType, ElectricalComponent } from '../src/types'

/**
 * DC-ADR-086: em RUN e em PAUSA os botões e atuadores atuam. Uma manobra em RUN
 * aplica-se logo e a simulação continua em RUN; não pode passar para PAUSA.
 * Regressão: `recomputeIfActive` chamava `step()`, que pausa quando está em RUN,
 * e por isso qualquer botão pausava a simulação ao primeiro toque.
 */
let passed = 0
function check(name: string, fn: () => void) {
  fn()
  passed += 1
  console.log(`  PASS: ${name}`)
}

/** Um gesto representativo por família (elétrico, comando, iluminação, pneumático, hidráulico, mecatrónica). */
const SAMPLES: Array<[ComponentType, Record<string, unknown>, string]> = [
  ['buttonNO', { pressed: true }, 'pressed'],
  ['emergencyButton', { pressed: true }, 'pressed'],
  ['selector2', { position: 1 }, 'position'],
  ['breaker1p', { closed: true }, 'closed'],
  ['wallSwitchDouble', { on1: true }, 'on1'],
  ['pneumaticValve52', { manualOverride: true }, 'manualOverride'],
  ['pneumaticManifold', { station1Manual: true }, 'station1Manual'],
  ['pneumaticVacuumCup', { manualVacuum: true, vacuumActive: true }, 'manualVacuum'],
  ['hydraulicValve', { open: true }, 'open'],
  // Em modo «alimentador» o FC1 segue a peça; a manobra à mão é o modo manual.
  ['mecMicroSwitchRoller', { actuation: 'manual', pressed: true }, 'pressed'],
  ['mecRotaryArm', { manualVacuum: true }, 'manualVacuum'],
]

function setup(type: ComponentType) {
  const st = useSimStore.getState()
  st.stop()
  const c = createComponent(type, 'T1', '', 0, 0, 0) as ElectricalComponent
  useSimStore.setState({ components: [c], wires: [], selectedComponentIds: [] })
  return c.id
}
const stateOf = (id: string) => useSimStore.getState().components.find((c) => c.id === id)!.state
const setRunState = (runState: 'running' | 'paused') => useSimStore.setState((s) => ({ sim: { ...s.sim, runState } }))

console.log('=== Smoke Test: manobras em RUN não pausam a simulação (DC-ADR-086) ===')

check(`1. Em RUN, ${SAMPLES.length} aparelhos de todas as famílias atuam e a simulação continua em RUN`, () => {
  for (const [type, patch, key] of SAMPLES) {
    const id = setup(type)
    setRunState('running')
    useSimStore.getState().operateComponent(id, patch)
    assert.equal(useSimStore.getState().sim.runState, 'running', `${type}: a manobra pausou a simulação`)
    assert.deepEqual(stateOf(id)[key], patch[key], `${type}: ${key} não foi aplicado em RUN`)
  }
})

check('2. Um botão de mola premido e largado entre dois ticks é processado (scan imediato) sem pausar', () => {
  const id = setup('buttonNO')
  setRunState('running')
  const before = useSimStore.getState().sim.scanCount
  useSimStore.getState().operateComponent(id, { pressed: true })
  useSimStore.getState().operateComponent(id, { pressed: false })
  assert.ok(useSimStore.getState().sim.scanCount > before, 'o gesto tem de correr um scan imediato')
  assert.equal(useSimStore.getState().sim.runState, 'running')
  assert.equal(stateOf(id).pressed, false)
})

check('3. O scan imediato em RUN não adianta o tempo dos temporizadores (dt = 0)', () => {
  const id = setup('timerRelayTON')
  setRunState('running')
  const elapsed = Number(stateOf(id).elapsedMs ?? 0)
  for (let i = 0; i < 5; i += 1) useSimStore.getState().operateComponent(id, { pressed: false })
  assert.equal(Number(stateOf(id).elapsedMs ?? 0), elapsed)
})

check('4. Em PAUSA a manobra atua e a simulação continua em PAUSA', () => {
  const id = setup('buttonNO')
  setRunState('paused')
  useSimStore.getState().operateComponent(id, { pressed: true })
  assert.equal(useSimStore.getState().sim.runState, 'paused')
  assert.equal(stateOf(id).pressed, true)
})

check('5. Em STOP a manobra continua bloqueada (só a libertação de mola passa)', () => {
  const id = setup('buttonNO')
  useSimStore.getState().operateComponent(id, { pressed: true })
  assert.equal(useSimStore.getState().sim.runState, 'stopped')
  assert.notEqual(stateOf(id).pressed, true)
})

useSimStore.getState().stop()
console.log(`\n✅ ${passed} verificações de manobra em RUN passaram`)
