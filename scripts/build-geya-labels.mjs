// Fundo transparente: só a tinta assenta sobre o plástico cinzento do corpo (sem placa mais clara).
// Serigrafia frontal dos GEYA GRT8 (M1, M2, B1) como no produto fotografado no manual:
// tampa cinzenta-clara, logótipo GEYA®, «Un»/«R» junto aos LED, escalas impressas à volta
// dos botões vermelhos (270°, alinhadas com a rotação de applyIndustrialState) e o modelo
// em baixo. Coordenadas em mm do plano `industrial_fascia` (17,6 × 43,5 mm, centro y 49,5),
// as mesmas de build-industrial-devices.mjs.
// Uso: node scripts/build-geya-labels.mjs
import path from 'node:path'
import fs from 'node:fs/promises'
import { chromium } from 'playwright'

const OUT = path.resolve('public/models/industriais')
const W = 17.6, TOP = 71.25, LEFT = -W / 2
const PX = 480
export const GEYA_FACE_BG = '#dcddd9'
const INK = '#2b2b2b'
const BRAND = (await fs.readFile('public/brands/geya.svg','utf8')).replace('<svg ','<svg x="1.1" y=".8" width="10.1" height="2.15" ')
const sx = (x) => x - LEFT, sy = (y) => TOP - y
const KNOBS = {
  range: { x: -2.4, y: 59.5, labels: ['1s', '10s', '1m', '10m', '1h', '10h', '1d', '10d', 'ON', 'OFF'] },
  fraction: { x: 0.45, y: 51.9, labels: ['10', '20', '30', '40', '50', '60', '70', '80', '90', '100%'] },
  function: { x: -2.4, y: 44.3, labels: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'] },
}
const LEDS = [{ x: -2.6, y: 66.7, label: 'Un', side: -1 }, { x: 2.55, y: 66.7, label: 'R', side: 1 }]

/** Escala de 10 posições sobre 270°: posição 0 em baixo-esquerda (225°), horário. */
function scale({ x, y, labels }) {
  const cx = sx(x), cy = sy(y), parts = []
  labels.forEach((label, i) => {
    const a = (225 - i * 30) * Math.PI / 180, ux = Math.cos(a), uy = -Math.sin(a)
    // Marca retangular (como no manual) entre 2,75 e 3,35 mm do centro.
    parts.push(`<line x1="${cx + ux * 2.75}" y1="${cy + uy * 2.75}" x2="${cx + ux * 3.2}" y2="${cy + uy * 3.2}" stroke="${INK}" stroke-width="0.42"/>`)
    // Botões a ~8 mm uns dos outros: rótulos a ≤4 mm do centro para as escalas não se tocarem.
    const r = 3.85 + (label.length > 2 ? 0.3 : label.length > 1 ? 0.12 : 0)
    parts.push(`<text x="${cx + ux * r}" y="${cy + uy * r}" font-size="0.86" text-anchor="middle" dominant-baseline="central" fill="${INK}">${label}</text>`)
  })
  // Anel fino de referência à volta do assento do botão.
  parts.push(`<circle cx="${cx}" cy="${cy}" r="2.55" fill="none" stroke="#b9bab6" stroke-width="0.12"/>`)
  return parts.join('')
}

function face(model, knobs, H = 43.5) {
  const b1 = model === 'GRT8-B1'
  const PY = Math.round(PX * H / W)
  const leds = LEDS.map(({ x, y, label, side }) => `
    <circle cx="${sx(x)}" cy="${sy(y)}" r="1.45" fill="#c9cac6"/>
    <text x="${sx(x) + side * 2.1}" y="${sy(y)}" font-size="1.7" font-weight="700" text-anchor="${side < 0 ? 'end' : 'start'}" dominant-baseline="central" fill="${INK}">${label}</text>`).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${PX}" height="${PY}" viewBox="0 0 ${W} ${H}" font-family="Arial, Helvetica, sans-serif">
    
    ${BRAND}
    ${leds}
    ${knobs.map((k) => scale(KNOBS[k])).join('')}
    ${b1 ? '' : `<line x1="0.8" y1="${H - 3.6}" x2="${W - 0.8}" y2="${H - 3.6}" stroke="#bdbeba" stroke-width="0.1"/>`}
    <text x="1.1" y="${H - 1.45}" font-size="1.85" font-weight="${b1 ? '400' : '700'}" fill="${INK}">${model}</text>
  </svg>`
}

// Laterais: impressão direta no plástico cinzento (o plano lateral tem 58 mm × altura útil,
// que depende do degrau inferior: M1/B1 48,5 mm, M2 36,5 mm — ver build-industrial-devices.mjs).
const SIDE_W = 58
const sideSvg = (h, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(SIDE_W * 20)}" height="${Math.round(h * 20)}" viewBox="0 0 ${SIDE_W} ${h}" font-family="Arial, Helvetica, sans-serif" fill="${INK}">
  ${body}</svg>`
function wiring(x, y, out2) {
  const t = (tx, ty, l) => `<circle cx="${tx}" cy="${ty}" r="0.55" fill="none" stroke="${INK}" stroke-width="0.18"/><text x="${tx}" y="${ty - 1.1}" font-size="1.25" text-anchor="middle">${l}</text>`
  const contact = (cx, l) => `${t(cx - 2, y, l[1])}${t(cx + 2, y, l[2])}${t(cx, y + 9, l[0])}<path d="M${cx} ${y + 8.4} V${y + 6} L${cx - 2} ${y + 3}" fill="none" stroke="${INK}" stroke-width="0.2"/><path d="M${cx - 2} ${y + .6} V${y + 3}" fill="none" stroke="${INK}" stroke-width="0.2"/><path d="M${cx + 2} ${y + .6} V${y + 2.2}" fill="none" stroke="${INK}" stroke-width="0.2"/>`
  return `${t(x, y, 'A1')}${t(x, y + 9, 'A2')}${t(x + 5, y + 9, 'S')}
    <rect x="${x - 2}" y="${y + 3}" width="4" height="3" fill="none" stroke="${INK}" stroke-width="0.2"/><path d="M${x} ${y + .6} V${y + 3} M${x} ${y + 6} V${y + 8.4} M${x + 5} ${y + 8.4} V${y + 4.5} H${x + 2}" fill="none" stroke="${INK}" stroke-width="0.2"/>
    <path d="M${x + 2} ${y + 4.5} H${x + 9}" stroke="${INK}" stroke-width="0.15" stroke-dasharray="0.4 0.3"/>
    ${contact(x + 11, ['15', '16', '18'])}${out2 ? contact(x + 18, ['25', '26', '28']) : ''}`
}
function mSide(model,h,out2=false){
 const row=(h-15)/5,charts=[]
 // Diagramas de função em duas colunas; alinhamento e nomenclatura do manual.
 const waves=['M4 3 H9 V1 H16 V3 H21','M4 3 V1 H9 V3 H21','M4 3 H8 V1 H12 V3 H16 V1 H20','M4 3 V1 H8 V3 H12 V1 H16 V3 H20','M4 3 H7 V1 H16 V3 H21','M4 3 H7 V1 H12 V3 H21','M4 3 H11 V1 H16 V3 H21','M4 3 H11 V1 H18 V3 H21','M4 3 H7 V1 H12 V3 H17 V1 H21','M4 3 H14 V1 H15 V3 H21']
 waves.forEach((wave,i)=>charts.push(`<g transform="translate(${3+Math.floor(i/5)*21} ${3+(i%5)*row})"><text x="0" y="2.5" font-size="1.5" font-weight="700">${String.fromCharCode(65+i)}</text><path d="${wave}" fill="none" stroke="${INK}" stroke-width=".22"/><path d="M4 4 H21" stroke="${INK}" stroke-width=".08"/></g>`))
 return sideSvg(h,`<g transform="translate(53 1.5) rotate(90)"><text font-size="2.4" font-weight="700">${model}</text><text y="3.4" font-size="1.2">Un: AC/DC 12–240V 50/60Hz</text><text y="5.5" font-size="1.2">Ith:16A · AC-1 250V~</text></g>${charts.join('')}<g transform="translate(3 ${h-11.7})">${wiring(4,1.8,out2)}</g>`)
}

// Disposição da fotografia A230: referência e tensão junto à frente, diagrama
// temporal ao centro e ligação do inversor na base. Tinta, sem etiqueta branca.
function b1Side() {
  const body = `<g transform="translate(53 2) rotate(90)">
    <text x="0" y="0" font-size="2.8" font-weight="700">GRT8-B1</text>
    <text x="0" y="4.1" font-size="1.55">Un: AC 230V 50Hz/60Hz</text>
    <text x="0" y="6.5" font-size="1.4">Imax:16A / AC-1 · 250V~</text>
  </g>
  <g transform="translate(6 6)" font-size="1.6" stroke="${INK}" stroke-width=".23" fill="none">
    <g fill="${INK}" stroke="none"><text x="0" y="0">Un</text><text x="0" y="5">S</text><text x="0" y="10">R</text></g>
    <path d="M5 1 V-2 H30 V1 M5 6 H9 V3 H17 V6 H30 M5 11 H9 V8 H24 V11 H30"/>
    <path d="M17 2 V15 M24 7 V15" stroke-dasharray=".5 .5" stroke-width=".12"/>
    <path d="M17 14 H24 M17 13.5 V14.5 M24 13.5 V14.5"/>
    <text x="20.5" y="13.4" text-anchor="middle" fill="${INK}" stroke="none">t</text>
  </g>
  <g transform="translate(7 29)">${wiring(3, 2, false)}</g>`
  return sideSvg(48.5, body)
}

const faces = {
  'geya-grt8-m-face.png': face('GRT8-M1', ['range', 'fraction', 'function']),
  'geya-grt8-m2-face.png': face('GRT8-M2', ['range', 'fraction', 'function']),
  'geya-grt8-b-face.png': face('GRT8-B1', ['range', 'fraction']),
  'geya-grt8-m-side-l.png': mSide('GRT8-M1',48.5),
  'geya-grt8-m-side-r.png': mSide('GRT8-M1',48.5),
  'geya-grt8-m2-side-l.png': mSide('GRT8-M2',48.5,true),
  'geya-grt8-m2-side-r.png': mSide('GRT8-M2',48.5,true),
  'geya-grt8-b-side-l.png': b1Side(),
  'geya-grt8-b-side-r.png': b1Side(),
}
// Números dos bornes impressos por cima/baixo de cada poço (plano 4,6 × 1,9 mm).
for (const label of ['A1', 'S', 'A2', '15', '16', '18', '25', '26', '28']) {
  faces[`geya-screw-label-${label}.png`] = `<svg xmlns="http://www.w3.org/2000/svg" width="230" height="95" viewBox="0 0 4.6 1.9" font-family="Arial, Helvetica, sans-serif"><text x="2.3" y="1" font-size="1.45" font-weight="700" text-anchor="middle" dominant-baseline="central" fill="${INK}">${label}</text></svg>`
}
const browser = await chromium.launch(process.env.LABELS_CHANNEL === 'bundled' ? {} : { channel: 'msedge' })
try {
  const page = await browser.newPage()
  for (const [file, svg] of Object.entries(faces)) {
    if (process.argv.includes('--b1') && !file.startsWith('geya-grt8-b-')) continue
    if (process.argv.includes('--m') && !/^geya-grt8-m/.test(file)) continue
    const [, w, h] = /width="(\d+)" height="(\d+)"/.exec(svg)
    await page.setViewportSize({ width: Number(w), height: Number(h) })
    await page.setContent(`<!doctype html><html><body style="margin:0;background:transparent">${svg}</body></html>`)
    await page.screenshot({ omitBackground: true, path: path.join(OUT, file), clip: { x: 0, y: 0, width: Number(w), height: Number(h) } })
    console.log('✓', file)
  }
} finally { await browser.close() }
