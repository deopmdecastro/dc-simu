/** Duplo toque (abre a modal de configuração no GRAFCET): eventos de ponteiro simulados em jsdom, sem browser. */
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { bindDoubleTap } from '../src/ui/useDoubleTap'

const dom = new JSDOM('<div id="c"><svg><g data-step-id="S1" id="step"><rect id="box"/></g><g data-action-id="A1" id="act"></g><g id="empty"></g><g data-step-id="S2" id="s2"><g class="grafcet-node-handle" id="handle"></g></g></svg></div>')
const g = globalThis as any
g.window = dom.window; g.Element = dom.window.Element
g.PointerEvent = class extends dom.window.Event {
  pointerId: number; pointerType: string; clientX: number; clientY: number
  constructor(t: string, i: any = {}) { super(t, { bubbles: !!i.bubbles, cancelable: true }); Object.defineProperty(this, 'timeStamp', { value: i.timeStamp ?? now }); this.pointerId = i.pointerId; this.pointerType = i.pointerType; this.clientX = i.clientX ?? 0; this.clientY = i.clientY ?? 0 }
}
let now = 1000
g.performance = { now: () => now }
const doc = dom.window.document
const c = doc.getElementById('c')!
const $ = (id: string) => doc.getElementById(id)!

let checks = 0
const check = (condition: unknown, message: string) => { assert.ok(condition, message); checks++; console.log(`PASS — ${message}`) }

const fired: string[] = []
bindDoubleTap(c as any, () => ({
  resolve: (t) => {
    if (t.closest('.grafcet-node-handle')) return null
    const a = t.closest('[data-action-id]')?.getAttribute('data-action-id'); if (a) return `action:${a}`
    const s = t.closest('[data-step-id]')?.getAttribute('data-step-id'); return s ? `step:${s}` : null
  },
  onDoubleTap: (k) => fired.push(k),
}))

const ptr = (type: string, el: Element, id = 1, x = 100, y = 100, pointerType = 'touch', timeStamp?: number) => el.dispatchEvent(new g.PointerEvent(type, { pointerId: id, pointerType, clientX: x, clientY: y, bubbles: true, timeStamp }))
const tap = (el: Element, dt = 0, x = 100, y = 100, id = 1, pointerType = 'touch') => { now += dt; ptr('pointerdown', el, id, x, y, pointerType); now += 60; ptr('pointerup', el, id, x, y, pointerType) }
const reset = () => { fired.length = 0; now += 2000 }

tap($('box')); check(fired.length === 0, 'um toque isolado não abre nada')
tap($('box'), 150); check(fired.join() === 'step:S1', 'dois toques seguidos numa etapa (filho do grupo) abrem a etapa')
reset()

tap($('act')); tap($('act'), 200, 104, 98); check(fired.join() === 'action:A1', 'duplo toque numa ação abre a ação (com pequeno desvio do dedo)')
reset()

tap($('box')); tap($('act'), 150); check(fired.length === 0, 'toques em elementos diferentes não contam como duplo toque')
reset()

tap($('box')); tap($('box'), 700); check(fired.length === 0, 'toques muito espaçados não contam')
reset()

tap($('box')); tap($('box'), 100, 180, 100); check(fired.length === 0, 'toques afastados no ecrã não contam')
reset()

// Arrasto: o 1.º «toque» moveu-se 40 px → é arrasto, não toque.
ptr('pointerdown', $('box'), 1, 100, 100); now += 80; ptr('pointerup', $('box'), 1, 140, 100)
tap($('box'), 100); check(fired.length === 0, 'um arrasto seguido de um toque não abre a modal')
reset()

// Render lento do 1.º toque: os handlers correm 800 ms depois, mas o toque real foi há 150 ms → conta.
{ const t0 = now + 5000; ptr('pointerdown', $('box'), 1, 100, 100, 'touch', t0); ptr('pointerup', $('box'), 1, 100, 100, 'touch', t0 + 60)
  ptr('pointerdown', $('box'), 1, 100, 100, 'touch', t0 + 210); now += 800; ptr('pointerup', $('box'), 1, 100, 100, 'touch', t0 + 270)
  check(fired.join() === 'step:S1', 'handlers atrasados por render pesado não anulam o duplo toque (usa a hora real do toque)') }
reset()

tap($('empty')); tap($('empty'), 100); check(fired.length === 0, 'fundo/elementos sem chave não abrem nada')
tap($('handle')); tap($('handle'), 100); check(fired.length === 0, 'puxadores/botões são ignorados')
reset()

// Pinça: dois dedos ao mesmo tempo anulam o toque.
ptr('pointerdown', $('box'), 1); ptr('pointerdown', $('box'), 2, 140, 100); now += 60; ptr('pointerup', $('box'), 2, 140, 100); ptr('pointerup', $('box'), 1)
tap($('box'), 100); check(fired.length === 0, 'gesto de dois dedos não conta como toque')
reset()

// Rato: não é tratado aqui (usa o onDoubleClick nativo).
tap($('box'), 0, 100, 100, 1, 'mouse'); tap($('box'), 100, 100, 100, 1, 'mouse'); check(fired.length === 0, 'o rato continua a usar o duplo clique nativo')
reset()

// pointercancel (ex.: pinça a cancelar o 1.º dedo) limpa o estado.
tap($('box')); ptr('pointercancel', $('box')); tap($('box'), 100); check(fired.length === 0, 'pointercancel entre toques repõe o estado')
reset()

// Dois duplos toques seguidos disparam duas vezes (o 3.º toque não conta como início de novo par).
tap($('box')); tap($('box'), 100); tap($('box'), 100); tap($('box'), 100)
check(fired.length === 2, 'quatro toques seguidos dão dois duplos toques')

console.log(`\n${checks} verificações de duplo toque passaram.`)
