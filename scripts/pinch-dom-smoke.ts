/** Gesto de dois dedos simulado em jsdom: eventos touch/pointer reais, sem browser. */
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { bindPinchZoom } from '../src/ui/usePinchZoom'
const dom = new JSDOM('<div id="c"><div id="node"></div></div>')
const g = globalThis as any
g.window = dom.window; g.Element = dom.window.Element
g.PointerEvent = class extends dom.window.Event { pointerId: number; pointerType: string; constructor(t: string, i: any = {}) { super(t, { bubbles: !!i.bubbles, cancelable: true }); this.pointerId = i.pointerId; this.pointerType = i.pointerType } }
const c = dom.window.document.getElementById('c')!
const node = dom.window.document.getElementById('node')!
c.getBoundingClientRect = () => ({ left: 10, top: 20, width: 400, height: 400, right: 410, bottom: 420, x: 10, y: 20, toJSON() {} }) as DOMRect

const log: string[] = []
const states: any[] = []
const dispose = bindPinchZoom(c as any, () => ({ swallowPointers: true, onStart: () => log.push('start'), onChange: (s) => states.push(s), onEnd: () => log.push('end') }))
// «aplicação»: manipuladores em bolha, como o React.
for (const t of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel']) c.addEventListener(t, (e: any) => log.push(`app:${t}:${e.pointerId}`))

const ptr = (type: string, id: number, target: any = node) => target.dispatchEvent(new g.PointerEvent(type, { pointerId: id, pointerType: 'touch', bubbles: true }))
const touch = (type: string, pts: Array<[number, number]>) => { const e: any = new dom.window.Event(type, { bubbles: true, cancelable: true }); e.touches = pts.map(([clientX, clientY]) => ({ clientX, clientY })); node.dispatchEvent(e); return e }

ptr('pointerdown', 1)
assert.deepEqual(log, ['app:pointerdown:1'], 'o 1.º dedo chega à aplicação')
ptr('pointerdown', 2)
assert.ok(log.includes('app:pointercancel:1'), 'o gesto do 1.º dedo é cancelado')
assert.ok(!log.includes('app:pointerdown:2'), 'o 2.º dedo não chega à aplicação')
ptr('pointermove', 1); ptr('pointermove', 2)
assert.ok(!log.some((l) => l.startsWith('app:pointermove')), 'movimentos durante a pinça são ignorados')

touch('touchstart', [[110, 120], [210, 120]])
const e1 = touch('touchmove', [[60, 120], [260, 120]])
assert.equal(log.filter((l) => l === 'start').length, 1, 'onStart chamado uma vez')
assert.ok(e1.defaultPrevented, 'touchmove de dois dedos bloqueia o scroll/zoom nativo')
const s = states.at(-1)
assert.equal(s.ratio, 2, 'afastar de 100 para 200 px dá razão 2')
assert.deepEqual(s.startCenter, { x: 150, y: 100 }, 'centro inicial relativo ao elemento')
assert.deepEqual(s.center, { x: 150, y: 100 }, 'centro atual relativo ao elemento')
touch('touchend', [[60, 120]])
assert.deepEqual(log.filter((l) => l === 'end').length, 1, 'onEnd quando fica um dedo')

ptr('pointerup', 1); ptr('pointerup', 2)
assert.ok(!log.includes('app:pointerup:1') && !log.includes('app:pointerup:2'), 'o levantar dos dedos da pinça não chega à aplicação')
ptr('pointerdown', 3)
assert.ok(log.includes('app:pointerdown:3'), 'depois de levantar os dois dedos, um novo dedo volta a funcionar')
ptr('pointermove', 3)
assert.ok(log.includes('app:pointermove:3'), 'e arrasta normalmente')
const one = touch('touchmove', [[50, 50]])
assert.ok(!one.defaultPrevented, 'um só dedo não é bloqueado (rolagem normal)')
dispose()
const rail = dom.window.document.createElement('div')
rail.setAttribute('role', 'scrollbar'); c.appendChild(rail)
let ignoredStarts = 0
const unbind = bindPinchZoom(c as any, () => ({ swallowPointers: true, ignoreSelector: '[role="scrollbar"]', onStart: () => ignoredStarts++, onChange: () => {} }))
const event: any = new dom.window.Event('touchstart', { bubbles: true, cancelable: true })
event.touches = [{ clientX: 0, clientY: 0 }, { clientX: 40, clientY: 0 }]
rail.dispatchEvent(event)
assert.equal(ignoredStarts, 0, 'toques na barra não iniciam a pinça do canvas')
assert.equal(event.defaultPrevented, false, 'a pinça deixa o gesto de toque para a própria barra')
unbind()
console.log('[pinch-dom] OK — gesto de dois dedos, cancelamento do gesto de um dedo e reentrada')
