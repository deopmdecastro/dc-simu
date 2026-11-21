import assert from 'node:assert/strict'
import { useSimStore } from '../src/store/useSimStore'
import type { ComponentType } from '../src/types'

let checks = 0
const check = (ok: unknown, name: string) => { assert.ok(ok, name); checks++; console.log('PASS — ' + name) }
for (const type of ['hydraulicFlowMeter', 'waterSupplyBox'] as const) {
  const setup = (sourceType: ComponentType = 'powerSource24v', reversed = false, nominalV = 24) => {
    useSimStore.getState().stop()
    useSimStore.setState({ components: [], wires: [], selectedComponentIds: [] })
    const s = useSimStore.getState()
    s.setWireDefaults({ medium: 'electrical' })
    const meterId = s.addComponent(type, 300, 300)!, sourceId = s.addComponent(sourceType, 20, 20)!
    s.setComponentState(sourceId, { nominalV, on: true })
    s.setComponentState(meterId, { manualTestFlow: true, valveOpen: true, singleVolumeL: 0, totalVolumeL: 10 })
    const all = useSimStore.getState().components, meter = all.find(c => c.id === meterId)!, source = all.find(c => c.id === sourceId)!
    const sourcePlus = source.terminals.find(t => t.label === (sourceType === 'powerSource24v' ? '+24V' : 'L'))!.id
    const sourceMinus = source.terminals.find(t => t.label === (sourceType === 'powerSource24v' ? '0V' : 'N'))!.id
    const plus = meter.terminals.find(t => t.label === '+24V')!.id, minus = meter.terminals.find(t => t.label === 'GND')!.id
    const read = () => useSimStore.getState().components.find(c => c.id === meterId)!.state
    const step = () => { useSimStore.setState(s => ({ sim: { ...s.sim, runState: 'running' } })); useSimStore.getState().step(1000) }
    return { s, meterId, sourceId, read, step, connectPlus: () => s.addWire(reversed ? sourceMinus : sourcePlus, plus), connectMinus: () => s.addWire(reversed ? sourcePlus : sourceMinus, minus), sourcePlus, sourceMinus, plus, minus }
  }
  let t = setup()
  t.step()
  check(!t.read().powered && t.read().flowing && t.read().singleVolumeL === 0 && !t.read().pulseHigh, `${type}: sem alimentação há passagem de água mas não há contagem nem impulsos`)
  t.connectPlus(); t.step()
  check(!t.read().powered, `${type}: um só condutor não alimenta o LCD`)
  t.connectMinus(); t.step()
  check(t.read().powered && t.read().singleVolumeL > 0, `${type}: +24V e GND corretos ligam o contador e a contagem`)
  const total = t.read().totalVolumeL
  t.s.setComponentState(t.sourceId, { on: false }); t.step()
  check(!t.read().powered && t.read().totalVolumeL === total && !t.read().pulseHigh, `${type}: corte de alimentação apaga e conserva o totalizador`)
  t = setup('powerSource24v', true); t.connectPlus(); t.connectMinus(); t.step()
  check(!t.read().powered && t.read().supplyMismatch, `${type}: polaridade invertida mantém LCD desligado`)
  t = setup('powerSource1ph', false, 230); t.connectPlus(); t.connectMinus(); t.step()
  check(!t.read().powered && t.read().supplyMismatch, `${type}: alimentação AC não liga a entrada de 24V CC`)
  t = setup('powerSource24v', false, 48); t.connectPlus(); t.connectMinus(); t.step()
  check(!t.read().powered && t.read().supplyMismatch, `${type}: 48V não é aceite como alimentação nominal de 24V`)
  t = setup(); t.s.addWire(t.sourcePlus, t.plus); t.s.addWire(t.sourcePlus, t.minus); t.step()
  check(!t.read().powered, `${type}: dois bornes no mesmo potencial não ligam o LCD`)
}
useSimStore.getState().stop()
console.log(`${checks} verificações de alimentação passaram`)
