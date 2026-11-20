// Serigrafia do MICO Classic 4.6 como no aparelho real: impressão branca/verde
// diretamente sobre o plástico preto (sem placas claras). Gera PNG via browser.
// Uso: node scripts/build-mico-labels.mjs   (requer Playwright + Edge/Chromium)
import { chromium } from 'playwright'
import path from 'node:path'

const OUT = path.resolve('public/models/industriais')
const GREEN = '#37cf3a'
const font = 'font-family:Arial,Helvetica,sans-serif;'
const labels = {
  // Marca antiga do Classic, em vez do logótipo moderno com quadrado.
  'mico-logo.png': [480, 240, `
    <div style="position:absolute;left:8px;top:12px;${font}font-style:italic;font-weight:1000;font-size:105px;letter-spacing:-8px;color:${GREEN};">MURR</div>
    <div style="position:absolute;left:13px;top:118px;${font}font-weight:900;font-size:43px;letter-spacing:-1px;color:${GREEN};">ELEKTRONIK</div>
    <div style="position:absolute;left:13px;top:174px;${font}font-size:26px;color:${GREEN};">D-71570 Oppenweiler</div>`],
  // Legenda fina em tom bege, como a impressão no corpo.
  'mico-legend.png': [600, 240, `
    <div style="position:absolute;left:4px;top:8px;${font}font-size:29px;color:#b7b098;">LED:　green　　　　 on</div>
    ${[['green flash', '>90%'], ['red', 'off'], ['red flash', 'overcurrent'], ['red quick flash', 'fault']].map(([a,b],i)=>`<div style="position:absolute;left:79px;top:${48+i*43}px;${font}font-size:27px;color:#b7b098;">${a}</div><div style="position:absolute;left:355px;top:${48+i*43}px;${font}font-size:27px;color:#b7b098;">${b}</div>`).join('')}
    <div style="position:absolute;left:4px;top:40px;width:572px;height:175px;border-bottom:1px solid #b7b098;border-top:1px solid #b7b098;"></div>`],
  'mico-class2.png': [720, 80, `<div style="position:absolute;left:18px;top:20px;${font}font-size:34px;color:#e9e9e9;">Output not intended to be interconnected</div>`],
  'mico-24v.png': [160, 80, `<div style="position:absolute;left:14px;top:8px;${font}font-size:56px;color:#bbb59d;">+24V</div>`],
  'mico-gnd.png': [200, 120, `<div style="position:absolute;left:18px;top:6px;${font}font-size:48px;color:#bbb59d;">GND</div><div style="position:absolute;left:18px;top:62px;${font}font-size:44px;color:#bbb59d;">0V</div>`],
  'mico-signals.png': [120,600, `<div style="position:absolute;top:70px;${font}font-size:42px;color:#bbb59d;">ON</div><div style="position:absolute;top:340px;${font}font-size:42px;color:#bbb59d;">13<br>14</div>`],
  'mico-numbers.png': [1220,80, `<div style="${font}color:#bbb59d;font-size:39px;display:flex;justify-content:space-between;padding:12px 12px;"><span>13</span><span>1</span><span>2</span><span>3</span><span>4</span><span>14</span></div>`],
  'mico-side.png': [900,900, `<div style="${font}color:#b7b098;padding:35px;font-size:29px;line-height:1.55;"><b>MICO Classic 4.6</b><br>9000-41034-0100600<br>IN: 24 V DC (18–30 V)<br>OUT: 4 × 1 / 2 / 4 / 6 A<br><svg width="760" height="340" viewBox="0 0 760 340" fill="none" stroke="#b7b098" stroke-width="3"><path d="M40 40H700M60 40V90M230 40V90M400 40V90M570 40V90 M60 145V250H700M230 145V250M400 145V250M570 145V250 M60 90L80 145M230 90L250 145M400 90L420 145M570 90L590 145"/><g fill="#b7b098" stroke="none" font-family="Arial" font-size="24"><text x="40" y="28">+24V</text><text x="30" y="290">OUT 1</text><text x="200" y="290">OUT 2</text><text x="370" y="290">OUT 3</text><text x="540" y="290">OUT 4</text></g></svg><br>Output not intended to be interconnected<br>GND 0V　 |　 ON　 |　 13–14<br>Murrelektronik GmbH<br>D-71570 Oppenweiler</div>`],
}

Object.assign(labels,{
  'mico24-logo.png': [280,240,`<svg width="280" height="240" viewBox="0 0 280 240"><path fill="#bdbcc0" d="M20 25H260V215H20Z"/><path fill="#454149" d="M40 170V65H65L92 123L120 65H145V170H120V116L92 170L65 116V170ZM153 65H180L193 125L212 82L227 125L240 65H255L233 177H212L197 138L178 177H157Z"/></svg>`],
  'mico24-signals.png': [360,130,`<div style="${font}font-size:48px;color:#bbb59d;line-height:1.1;text-align:center;">ON/13<br>ON/14</div>`],
  'mico24-scale.png': [320,320,`<div style="position:relative;width:320px;height:320px;${font}color:#bbb59d;font-size:48px;"><span style="position:absolute;left:147px;top:6px;">1</span><span style="position:absolute;right:9px;top:130px;">2</span><span style="position:absolute;left:147px;bottom:6px;">3</span><span style="position:absolute;left:9px;top:130px;">4</span></div>`],
  'mico24-numbers.png': [600,70,`<div style="${font}color:#bbb59d;font-size:40px;display:flex;justify-content:space-between;padding:8px 6px;"><span>13</span><span>1</span><span>2</span><span>14</span></div>`],
  'mico24-class2.png': [800,190,`<div style="${font}color:#bbb59d;font-size:43px;line-height:1.1;text-align:center;">Output not intended<br>to be interconnected<br>OUT 1　 2　Class 2</div>`],
  'mico24-side.png': [1000,1100,`<div style="position:absolute;width:1000px;height:1100px;transform:rotate(90deg);transform-origin:50% 50%;${font}color:#b7b098;font-size:32px;line-height:1.45;"><b style="font-size:56px;">MURR ELEKTRONIK</b><br>MICO 2.4 · 9000-41042-0100400<br>IN: 24 V DC (18–30 V)<br>OUT: 2 × 1 / 2 / 3 / 4 A<br><svg width="850" height="330" viewBox="0 0 850 330" fill="none" stroke="#b7b098" stroke-width="3"><path d="M50 50H750M190 50V100M480 50V100 M190 160V240M480 160V240 M190 100L210 160M480 100L500 160 M650 110V160L685 190M650 220V265"/><g fill="#b7b098" stroke="none" font-family="Arial" font-size="28"><text x="50" y="35">+24 V DC</text><text x="130" y="280">OUT 1</text><text x="420" y="280">OUT 2</text><text x="685" y="160">13</text><text x="685" y="250">14</text></g></svg><br>GND 0V　ON　1/2/3/4 A<br>Output not intended to be interconnected<br>Murrelektronik GmbH · D-71570 Oppenweiler</div>`],
})
const browser = await chromium.launch(process.env.LABELS_CHANNEL === 'bundled' ? {} : { channel: 'msedge' })
const page = await browser.newPage()
for (const [file, [w, h, html]] of Object.entries(labels)) {
  await page.setViewportSize({ width: w, height: h })
  await page.setContent(`<!doctype html><html><body style="margin:0;width:${w}px;height:${h}px;position:relative;overflow:hidden;background:transparent">${html}</body></html>`)
  await page.screenshot({ omitBackground: true, path: path.join(OUT, file), clip: { x: 0, y: 0, width: w, height: h } })
  console.log('✓', file)
}
await browser.close()
