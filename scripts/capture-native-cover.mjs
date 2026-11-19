/** Captura a vista 3D real do projeto nativo (landing showcase) para a capa do dashboard. */
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const base = process.env.COVERS_URL || 'http://127.0.0.1:5208'
const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public/project-covers/native-partida.jpg')

const browser = await chromium.launch(process.env.COVERS_CHANNEL === 'bundled' ? {} : { channel: 'chrome' }).catch(() => chromium.launch())
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } })
page.setDefaultTimeout(180_000)
await page.goto(base + '/', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(2500)

await page.evaluate(() => {
  const h = [...document.querySelectorAll('h2,h3')].find((el) => /partida direta|Execute uma/i.test(el.textContent || ''))
  h?.scrollIntoView({ block: 'start' })
})

for (let i = 0; i < 45; i++) {
  const n = await page.locator('canvas').count()
  if (n >= 2) break
  await page.waitForTimeout(2000)
}

await page.evaluate(() => {
  for (const b of document.querySelectorAll('button,[role="tab"]')) {
    if (/3\s*D|Visualiza/i.test(b.textContent || '')) {
      b.click()
      break
    }
  }
})
await page.waitForTimeout(12000)

const info = await page.evaluate(() =>
  [...document.querySelectorAll('canvas')].map((c) => {
    const r = c.getBoundingClientRect()
    return { w: r.width, h: r.height, x: r.x, y: r.y }
  }),
)
const candidates = info.filter((c) => c.w > 200 && c.h > 200).sort((a, b) => b.w * b.h - a.w * a.h)
const target = candidates.find((c) => c.y > 300) || candidates[0]
if (!target) {
  console.error('Nenhum canvas 3D encontrado', info)
  process.exit(1)
}

fs.mkdirSync(path.dirname(out), { recursive: true })
await page.screenshot({
  path: out,
  type: 'jpeg',
  quality: 88,
  clip: {
    x: Math.max(0, Math.floor(target.x)),
    y: Math.max(0, Math.floor(target.y)),
    width: Math.min(Math.floor(target.w), 1400),
    height: Math.min(Math.floor(target.h), 1000),
  },
})
console.log('Capa nativa gravada:', out, fs.statSync(out).size, 'bytes', target)
await browser.close()
