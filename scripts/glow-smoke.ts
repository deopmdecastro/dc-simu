import assert from 'node:assert/strict'
import { GLOW_SPECS, blinkFactor, glowFrame, stepGlow } from '../src/three/glow'

let checks = 0
const ok = (cond: unknown, msg: string) => { assert.ok(cond, msg); checks += 1 }

// subida e descida suaves, sem saltos nem ultrapassar 0–1
let level = 0
const rising: number[] = []
for (let i = 0; i < 60; i += 1) { level = stepGlow(level, true, 1 / 60, 0.09, 0.28); rising.push(level) }
ok(rising.every((v, i) => i === 0 || v >= rising[i - 1]), 'subida monótona')
ok(rising[0] > 0 && rising[0] < 0.6, 'não liga instantaneamente')
ok(level === 1, 'acaba exatamente em 1')
for (let i = 0; i < 90; i += 1) level = stepGlow(level, false, 1 / 60, 0.09, 0.28)
ok(level === 0, 'acaba exatamente em 0')
const slowFall = stepGlow(1, false, 1 / 60, 0.09, 0.28)
const fastFall = stepGlow(1, false, 1 / 60, 0.09, 0.05)
ok(slowFall > fastFall, 'lâmpada demora mais a apagar do que um LED')
ok(stepGlow(0.5, true, Number.NaN) <= 1, 'dt inválido não rebenta')

// pisca
ok(blinkFactor(0.1, false) === 1, 'sem pisca = 1')
const samples = Array.from({ length: 200 }, (_, i) => blinkFactor(i * 0.01, true))
ok(samples.includes(1) && samples.includes(0.08), 'pisca alterna entre aceso e quase apagado')

// quadro de brilho
const lamp = GLOW_SPECS.lamp
const off = glowFrame(lamp, 0, 1, false)
ok(off.haloOpacity === 0 && off.emissive === 0 && off.light === 0, 'apagado não brilha nem ilumina')
const on = glowFrame(lamp, 1, 1, false)
ok(on.haloOpacity > 0.8 && on.emissive >= 2 && on.light > 0, 'aceso: halo, emissão e luz')
ok(glowFrame(GLOW_SPECS.led, 1, 1, false).light === 0, 'LED pequeno não projeta luz dinâmica')
ok(glowFrame(lamp, 1, 0.1, true).haloOpacity > glowFrame(lamp, 1, 0.6, true).haloOpacity * 5, 'pisca altera o halo')
ok(glowFrame(lamp, 0.5, 1, false).emissive < on.emissive, 'meio brilho < brilho total')
console.log(`${checks} verificações de brilho passaram.`)
