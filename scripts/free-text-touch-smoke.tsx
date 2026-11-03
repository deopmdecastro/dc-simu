/** Texto livre do GRAFCET no telemóvel: 1.º toque seleciona, toque no texto já selecionado pede a edição (diálogo). */
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!doctype html><div id="root"></div>', { pretendToBeVisual: true })
const g = globalThis as any
g.window = dom.window; g.document = dom.window.document; g.Element = dom.window.Element; g.HTMLElement = dom.window.HTMLElement
g.IS_REACT_ACT_ENVIRONMENT = true
let checks = 0
const check = (condition: unknown, message: string) => { assert.ok(condition, message); checks++; console.log(`PASS — ${message}`) }

const run = async () => {
  const React = await import('react')
  const { createRoot } = await import('react-dom/client')
  const { act } = await import('react')
  const { default: GrafcetFreeText } = await import('../src/grafcet/GrafcetFreeText')
  const comment = { id: 'c1', x: 10, y: 10, text: 'G3 <> X149' } as any
  const calls: string[] = []
  const mount = (selected: boolean, touchEdit: boolean) => {
    const host = document.createElement('div'); document.body.appendChild(host)
    const root = createRoot(host)
    act(() => root.render(
      <svg><GrafcetFreeText comment={comment} selected={selected} editing={false} interactive touchEdit={touchEdit}
        toWorld={(x, y) => ({ x, y })} snap={(p) => p}
        onSelect={() => calls.push('select')} onEdit={(e) => calls.push(`edit:${e}`)} onMove={() => calls.push('move')}
        onText={() => calls.push('text')} onContextMenu={() => {}} /></svg>))
    return host.querySelector('[data-grafcet-text]') as Element
  }
  const tap = (el: Element) => {
    const ev = (type: string) => { const e = new dom.window.MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: 5, clientY: 5 }); return e }
    act(() => { el.dispatchEvent(ev('pointerdown')) })
    act(() => { el.dispatchEvent(ev('pointerup')) })
  }
  let el = mount(false, true)
  tap(el)
  check(calls.includes('select') && !calls.includes('edit:true'), 'telemóvel: o 1.º toque só seleciona (não abre a edição)')
  calls.length = 0
  el = mount(true, true)
  tap(el)
  check(calls.includes('edit:true'), 'telemóvel: toque no texto já selecionado pede a edição')
  calls.length = 0
  el = mount(false, false)
  tap(el)
  check(calls.includes('edit:true'), 'PC/tablet: o clique continua a abrir a escrita no sítio')
  void React
}
run().then(() => { console.log(`\n${checks} verificações de toque no texto livre passaram.`); process.exit(0) }).catch((e) => { console.error(e); process.exit(1) })
