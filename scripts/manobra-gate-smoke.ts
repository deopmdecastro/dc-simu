/**
 * Regra GLOBAL de manobra (src/store/manobra.ts): nenhum aparelho se manobra
 * antes de ▶. O store recusa os gestos em STOP (operateComponent, pressButton,
 * actuateImported, toggleTerminal) e a interface não reimplementa a regra por
 * componente (sem exceções «mecânicas» nem para a demonstração).
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { nativePartidaDiretaContent } from '../src/project/nativeProjects'
import { useSimStore } from '../src/store/useSimStore'
import { allowedManobraPatch, isManobraAllowed } from '../src/store/manobra'

;(globalThis as unknown as { window: unknown }).window ??= globalThis

let failed = 0
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${name}${extra ? ` (${extra})` : ''}`)
  if (!ok) failed++
}

// Regra pura.
check('STOP não permite manobra', !isManobraAllowed({ sim: { runState: 'stopped' } }))
check('RUN e PAUSA permitem manobra', isManobraAllowed({ sim: { runState: 'running' } }) && isManobraAllowed({ sim: { runState: 'paused' } }))
check('STOP: armar/premir é recusado', allowedManobraPatch({ sim: { runState: 'stopped' } }, { closed: true }) === null
  && allowedManobraPatch({ sim: { runState: 'stopped' } }, { pressed: true }) === null)
check('STOP: largar um comando de mola é aceite', JSON.stringify(allowedManobraPatch({ sim: { runState: 'stopped' } }, { pressed: false, closed: true })) === '{"pressed":false}')

// Store.
useSimStore.getState().loadJSON(JSON.stringify(nativePartidaDiretaContent()))
const st = () => useSimStore.getState()
const comp = (ref: string) => st().components.find((c) => c.ref === ref)!
const b1 = comp('B1')
const breaker = st().components.find((c) => /^breaker/.test(c.type) || c.type === 'motorBreaker')

check('STOP: projeto carregado parado', st().sim.runState === 'stopped')
st().operateComponent(b1.id, { startPressed: true })
check('STOP: START não atua (operateComponent)', !comp('B1').state.startPressed)
st().pressButton(b1.id, true)
check('STOP: pressButton não atua', !comp('B1').state.pressed)
if (breaker) {
  const before = !!breaker.state.closed
  st().operateComponent(breaker.id, { closed: !before, tripped: false })
  check('STOP: disjuntor não liga/desliga', !!st().components.find((c) => c.id === breaker.id)!.state.closed === before)
  const imported = st().components.find((c) => c.id === breaker.id)!
  st().actuateImported(imported.id, true)
  check('STOP: actuateImported não atua', !!st().components.find((c) => c.id === breaker.id)!.state.closed === before)
}

st().setDemoMode(true)
st().operateComponent(b1.id, { startPressed: true })
check('STOP em demonstração: também não atua', !comp('B1').state.startPressed)
st().setDemoMode(false)

st().play()
st().operateComponent(b1.id, { startPressed: true })
check('RUN: START atua', !!comp('B1').state.startPressed)
st().operateComponent(b1.id, { startPressed: false })
st().pause()
st().operateComponent(b1.id, { startPressed: true })
check('PAUSA: START atua', !!comp('B1').state.startPressed)
st().stop()
st().operateComponent(b1.id, { startPressed: false })
check('STOP: largar continua permitido', !comp('B1').state.startPressed)

// Sem regras paralelas na interface.
const files: string[] = []
const walk = (dir: string) => { for (const name of readdirSync(dir)) { const p = join(dir, name); if (statSync(p).isDirectory()) walk(p); else if (/\.tsx?$/.test(name)) files.push(p) } }
walk('src')
const offenders = files.filter((file) => {
  const text = readFileSync(file, 'utf8')
  return /runState !== 'stopped' \|\| s\.demoMode/.test(text) || /runState === 'stopped' && !store\.demoMode/.test(text) || /allowStopped/.test(text)
})
check('Nenhuma exceção local à regra (demo/allowStopped)', offenders.length === 0, offenders.join(', '))
const panel = readFileSync('src/three/Panel3D.tsx', 'utf8')
check('Panel3D: comandos mecânicos dos CAD seguem a mesma regra', /const mechanicalControls = canActuate\n/.test(panel) && /isManobraAllowed\(/.test(panel))

if (failed) { console.error(`\n${failed} verificação(ões) falharam`); process.exit(1) }
console.log('\nmanobra-gate: OK')
