// Serigrafia do MICO Classic 4.6 como no aparelho real: impressão branca/verde
// diretamente sobre o plástico preto (sem placas claras). Gera PNG via browser.
// Uso: node scripts/build-mico-labels.mjs   (requer Playwright + Edge/Chromium)
import { chromium } from 'playwright'
import path from 'node:path'

const OUT = path.resolve('public/models/industriais')
const BODY = '#1f201f'
const GREEN = '#37cf3a'
const font = 'font-family:Arial,Helvetica,sans-serif;'
const labels = {
  // Logótipo: marca verde «murr» + «elektronik» branco, como na tampa frontal.
  'mico-logo.png': [480, 240, `
    <div style="position:absolute;left:26px;top:40px;width:110px;height:110px;border-radius:22px;background:${GREEN};"></div>
    <div style="position:absolute;left:44px;top:58px;width:74px;height:74px;border-radius:14px;background:${BODY};"></div>
    <div style="position:absolute;left:58px;top:72px;width:46px;height:46px;border-radius:8px;background:${GREEN};"></div>
    <div style="position:absolute;left:160px;top:30px;${font}font-weight:900;font-size:104px;letter-spacing:-3px;color:${GREEN};">murr</div>
    <div style="position:absolute;left:164px;top:150px;${font}font-weight:700;font-size:40px;letter-spacing:2px;color:#f2f2f2;">elektronik</div>
    <div style="position:absolute;left:28px;top:205px;${font}font-size:22px;color:#cfd2cf;">MICO 4.6 · 9000-41034-0100600</div>`],
  // Legenda dos LED: tabela branca com pontos coloridos.
  'mico-legend.png': [600, 240, `
    <div style="position:absolute;left:20px;top:14px;${font}font-weight:700;font-size:30px;color:#f2f2f2;">LED-Display</div>
    ${[['#37cf3a', 'green', 'on'], ['#37cf3a', 'green flash', '> 90 %'], ['#e23a2c', 'red', 'off'], ['#e23a2c', 'red flash 1 Hz', 'tripped'], ['#e23a2c', 'red flash 5 Hz', 'fault']].map(([c, a, b], i) => `
      <div style="position:absolute;left:24px;top:${62 + i * 34}px;width:18px;height:18px;border-radius:50%;background:${c};"></div>
      <div style="position:absolute;left:56px;top:${56 + i * 34}px;${font}font-size:24px;color:#e9e9e9;">${a}</div>
      <div style="position:absolute;left:330px;top:${56 + i * 34}px;${font}font-size:24px;color:#e9e9e9;">= ${b}</div>`).join('')}
    <div style="position:absolute;left:12px;top:6px;width:574px;height:226px;border:2px solid #9a9d9a;border-radius:6px;"></div>`],
  'mico-class2.png': [720, 80, `<div style="position:absolute;left:18px;top:20px;${font}font-size:34px;color:#e9e9e9;">Output not intended to be interconnected</div>`],
  'mico-24v.png': [160, 80, `<div style="position:absolute;left:14px;top:8px;${font}font-weight:700;font-size:56px;color:#f2f2f2;">+24V</div>`],
  'mico-gnd.png': [200, 120, `<div style="position:absolute;left:18px;top:6px;${font}font-weight:700;font-size:48px;color:#f2f2f2;">GND</div><div style="position:absolute;left:18px;top:62px;${font}font-weight:700;font-size:44px;color:#f2f2f2;">0V</div>`],
}

const browser = await chromium.launch(process.env.LABELS_CHANNEL === 'bundled' ? {} : { channel: 'msedge' })
const page = await browser.newPage()
for (const [file, [w, h, html]] of Object.entries(labels)) {
  await page.setViewportSize({ width: w, height: h })
  await page.setContent(`<!doctype html><html><body style="margin:0;width:${w}px;height:${h}px;position:relative;overflow:hidden;background:${BODY}">${html}</body></html>`)
  await page.screenshot({ path: path.join(OUT, file), clip: { x: 0, y: 0, width: w, height: h } })
  console.log('✓', file)
}
await browser.close()
