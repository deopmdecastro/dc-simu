// Fundo transparente: só a tinta assenta sobre o plástico cinzento do corpo (sem placa mais clara).
// Serigrafia frontal dos GEYA GRT8 (M1, M2, B1) como no produto fotografado no manual:
// tampa cinzenta-clara, logótipo GEYA®, «Un»/«R» junto aos LED, escalas impressas à volta
// dos botões vermelhos (270°, alinhadas com a rotação de applyIndustrialState) e o modelo
// em baixo. Coordenadas em mm do plano `industrial_fascia` (17,6 × 43,5 mm, centro y 49,5),
// as mesmas de build-industrial-devices.mjs.
// Uso: node scripts/build-geya-labels.mjs
import path from 'node:path'
import { chromium } from 'playwright'

const OUT = path.resolve('public/models/industriais')
const W = 17.6, TOP = 71.25, LEFT = -W / 2
const PX = 480
export const GEYA_FACE_BG = '#dcddd9'
const INK = '#2b2b2b'
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
  const PY = Math.round(PX * H / W)
  const leds = LEDS.map(({ x, y, label, side }) => `
    <circle cx="${sx(x)}" cy="${sy(y)}" r="1.45" fill="#c9cac6"/>
    <text x="${sx(x) + side * 2.1}" y="${sy(y)}" font-size="1.7" font-weight="700" text-anchor="${side < 0 ? 'end' : 'start'}" dominant-baseline="central" fill="${INK}">${label}</text>`).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${PX}" height="${PY}" viewBox="0 0 ${W} ${H}" font-family="Arial, Helvetica, sans-serif">
    
    <text x="1.1" y="2.75" font-size="2.55" font-weight="900" letter-spacing="0.08" fill="${INK}">GEYA<tspan font-size="0.9" dy="-1.2">®</tspan></text>
    ${leds}
    ${knobs.map((k) => scale(KNOBS[k])).join('')}
    <line x1="0.8" y1="${H - 3.6}" x2="${W - 0.8}" y2="${H - 3.6}" stroke="#bdbeba" stroke-width="0.1"/>
    <text x="1.1" y="${H - 1.45}" font-size="1.85" font-weight="700" fill="${INK}">${model}</text>
  </svg>`
}

// Laterais: impressão direta no plástico cinzento (o plano lateral tem 58 mm × altura útil,
// que depende do degrau inferior: M1/B1 48,5 mm, M2 36,5 mm — ver build-industrial-devices.mjs).
const SIDE_W = 58
const sideSvg = (h, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(SIDE_W * 20)}" height="${Math.round(h * 20)}" viewBox="0 0 ${SIDE_W} ${h}" font-family="Arial, Helvetica, sans-serif" fill="${INK}">
  ${body}</svg>`
function wiring(x, y, out2) {
  const t = (tx, ty, l) => `<circle cx="${tx}" cy="${ty}" r="0.55" fill="none" stroke="${INK}" stroke-width="0.18"/><text x="${tx}" y="${ty - 1.1}" font-size="1.25" text-anchor="middle">${l}</text>`
  const contact = (cx, l) => `${t(cx - 2, y, l[1])}${t(cx + 2, y, l[2])}${t(cx, y + 9, l[0])}<path d="M${cx} ${y + 8.4} V${y + 6} L${cx + 2} ${y + 2.6}" fill="none" stroke="${INK}" stroke-width="0.2"/><path d="M${cx - 2} ${y + .6} V${y + 3} H${cx - .6}" fill="none" stroke="${INK}" stroke-width="0.2"/><path d="M${cx + 2} ${y + .6} V${y + 2.2}" fill="none" stroke="${INK}" stroke-width="0.2"/>`
  return `${t(x, y, 'A1')}${t(x, y + 9, 'A2')}${t(x + 5, y + 9, 'S')}
    <rect x="${x - 2}" y="${y + 3}" width="4" height="3" fill="none" stroke="${INK}" stroke-width="0.2"/><path d="M${x} ${y + .6} V${y + 3} M${x} ${y + 6} V${y + 8.4} M${x + 5} ${y + 8.4} V${y + 4.5} H${x + 2}" fill="none" stroke="${INK}" stroke-width="0.2"/>
    <path d="M${x + 2} ${y + 4.5} H${x + 9}" stroke="${INK}" stroke-width="0.15" stroke-dasharray="0.4 0.3"/>
    ${contact(x + 11, ['15', '16', '18'])}${out2 ? contact(x + 18, ['25', '26', '28']) : ''}`
}
function sideL(model, h, { supply, output, out2 }) {
  return sideSvg(h, `
    <text x="3" y="5" font-size="2.6" font-weight="900">GEYA<tspan font-size="0.9" dy="-1.1">®</tspan></text>
    <text x="3" y="9" font-size="2.2" font-weight="700">${model}</text>
    <text x="3" y="12" font-size="1.35">${model.startsWith('GRT8-B') ? 'Off-delay time relay' : 'Multifunction time relay'}</text>
    <text x="3" y="15.4" font-size="1.3">Un (A1-A2): ${supply}</text>
    <text x="3" y="17.6" font-size="1.3">Output: ${output}</text>
    <text x="3" y="19.8" font-size="1.3">t: 0.1 s – 10 days</text>
    ${wiring(36, Math.min(6, h - 14), out2)}
    <text x="3" y="${h - 3.2}" font-size="1.15">IP40 front / IP20 terminals · DIN rail EN/IEC 60715</text>
    <text x="3" y="${h - 1.2}" font-size="1.15">IEC 61812-1 · CE</text>`)
}
function sideR(model, h, functions) {
  const lines = functions.map((f, i) => `<text x="3" y="${6.6 + i * Math.min(2.6, (h - 10) / functions.length)}" font-size="${Math.min(1.45, (h - 10) / functions.length * .62)}"><tspan font-weight="700">${f[0]}</tspan>  ${f[1]}</text>`).join('')
  return sideSvg(h, `<text x="3" y="3.6" font-size="1.7" font-weight="700">${model} · Functions</text>${lines}`)
}
const M_FUNCTIONS = [['A', 'On delay'], ['B', 'Interval on power-up'], ['C', 'Cycle, pause first'], ['D', 'Cycle, pulse first'], ['E', 'Off delay (S)'], ['F', 'Single shot, leading edge (S)'], ['G', 'Single shot, trailing edge (S)'], ['H', 'On/Off delay (S)'], ['I', 'Latching relay (S)'], ['J', 'Pulse generator 0.5 s']]
const B_FUNCTIONS = [['A1-A2', 'continuous supply'], ['S close', 'output 15-18 closes at once'], ['S open', 'off delay t starts'], ['t', 'range × 10…100 %'], ['A1-A2 off', 'output released at once']]
const M_SPEC = { supply: 'AC/DC 12–240 V 50/60 Hz', output: '1×SPDT 16 A / AC1' }

const faces = {
  'geya-grt8-m-face.png': face('GRT8-M1', ['range', 'fraction', 'function']),
  'geya-grt8-m2-face.png': face('GRT8-M2', ['range', 'fraction', 'function'], 71.25 - 35.5),
  'geya-grt8-b-face.png': face('GRT8-B1', ['range', 'fraction']),
  'geya-grt8-m-side-l.png': sideL('GRT8-M1', 48.5, M_SPEC),
  'geya-grt8-m-side-r.png': sideR('GRT8-M1', 48.5, M_FUNCTIONS),
  'geya-grt8-m2-side-l.png': sideL('GRT8-M2', 36.5, { ...M_SPEC, output: '2×SPDT 16 A / AC1', out2: true }),
  'geya-grt8-m2-side-r.png': sideR('GRT8-M2', 36.5, M_FUNCTIONS),
  'geya-grt8-b-side-l.png': sideL('GRT8-B1', 48.5, { supply: 'AC 230 V 50/60 Hz', output: '1×SPDT 16 A / AC1' }),
  'geya-grt8-b-side-r.png': sideR('GRT8-B1', 48.5, B_FUNCTIONS),
}
// Números dos bornes impressos por cima/baixo de cada poço (plano 4,6 × 1,9 mm).
for (const label of ['A1', 'S', 'A2', '15', '16', '18', '25', '26', '28']) {
  faces[`geya-screw-label-${label}.png`] = `<svg xmlns="http://www.w3.org/2000/svg" width="230" height="95" viewBox="0 0 4.6 1.9" font-family="Arial, Helvetica, sans-serif"><text x="2.3" y="1" font-size="1.45" font-weight="700" text-anchor="middle" dominant-baseline="central" fill="${INK}">${label}</text></svg>`
}
const browser = await chromium.launch(process.env.LABELS_CHANNEL === 'bundled' ? {} : { channel: 'msedge' })
try {
  const page = await browser.newPage()
  for (const [file, svg] of Object.entries(faces)) {
    const [, w, h] = /width="(\d+)" height="(\d+)"/.exec(svg)
    await page.setViewportSize({ width: Number(w), height: Number(h) })
    await page.setContent(`<!doctype html><html><body style="margin:0;background:transparent">${svg}</body></html>`)
    await page.screenshot({ omitBackground: true, path: path.join(OUT, file), clip: { x: 0, y: 0, width: Number(w), height: Number(h) } })
    console.log('✓', file)
  }
} finally { await browser.close() }
