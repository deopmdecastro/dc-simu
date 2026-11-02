// Capas da biblioteca e vistas frontais do Esquema 2D: imagens WebP pré-geradas a partir dos GLB
// (public/component-covers), sem descarregar nem desenhar nenhum modelo 3D para as mostrar.
// GRAFCET_TEST_URL=http://127.0.0.1:5207 GRAFCET_TEST_CHANNEL=chrome node scripts/library-covers-ui-smoke.mjs
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { chromium } from 'playwright'

const baseURL = process.env.GRAFCET_TEST_URL || 'http://127.0.0.1:5173'
const browser = await chromium.launch(process.env.GRAFCET_TEST_CHANNEL ? { channel: process.env.GRAFCET_TEST_CHANNEL } : {})
let checks = 0
const check = (ok, message) => { assert.ok(ok, message); checks++; console.log(`PASS — ${message}`) }
const manifest = JSON.parse(fs.readFileSync('public/component-covers/manifest.json', 'utf8'))
try {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } })
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url())
    return url.origin === new URL(baseURL).origin && !url.pathname.startsWith('/api/') ? route.continue() : route.abort()
  })
  await context.addInitScript(() => {
    localStorage.setItem('dcsimu:account:session:v1', 'dcsimu-admin')
    localStorage.removeItem('dcsimu:supabase:config:v1')
    // IndexedDB limpo: sem capas antigas capturadas no dispositivo.
    try { indexedDB.deleteDatabase('dc-simu-covers') } catch { /* noop */ }
  })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (e) => { if (!/Failed to fetch/.test(e.message)) errors.push(e.message) })
  // Vistas frontais pedidas desde o dashboard (as capas dos projetos também as usam).
  const frontRequests = new Set()
  page.on('request', (request) => { const p = new URL(request.url()).pathname; if (p.startsWith('/component-covers/front/')) frontRequests.add(p) })
  await page.goto(baseURL + '/dashboard')
  await page.getByRole('button', { name: 'Novo projeto', exact: true }).click()
  const create = page.getByRole('dialog')
  await create.getByRole('textbox', { name: 'Nome do projeto', exact: true }).fill('Capas')
  await create.getByRole('radio', { name: /^Tudo/ }).check()
  // A partir daqui conta tudo o que a biblioteca pede (projeto vazio: nenhum GLB faz falta na cena).
  const glb = []
  const coverRequests = []
  const coverFailures = []
  page.on('request', (request) => {
    const url = new URL(request.url())
    if (url.pathname.endsWith('.glb')) glb.push(url.pathname)
    if (url.pathname.startsWith('/component-covers/')) coverRequests.push(url.pathname)
  })
  page.on('response', (response) => { if (new URL(response.url()).pathname.startsWith('/component-covers/') && response.status() >= 400) coverFailures.push(response.url()) })
  await create.getByRole('button', { name: 'Criar projeto', exact: true }).click()
  await page.waitForTimeout(2500)
  // Abre todas as categorias da biblioteca e percorre a lista (as capas carregam ao ficar visíveis).
  const expand = page.getByRole('button', { name: 'Expandir', exact: true }).first()
  if (await expand.isVisible().catch(() => false)) await expand.click()
  await page.waitForTimeout(500)
  const list = page.locator('.dc-library-scroll, [data-library-list], aside').first()
  for (let i = 0; i < 25; i++) { await page.mouse.move(150, 600); await page.mouse.wheel(0, 500); await page.waitForTimeout(150) }
  await page.waitForTimeout(1500)
  const imgs = await page.evaluate(() => [...document.querySelectorAll('img')].map((img) => img.getAttribute('src') ?? '').filter((src) => src.includes('/component-covers/')))
  const types = new Set(imgs.map((src) => src.split('/component-covers/')[1].split('.webp')[0]))
  check(types.size >= 20, `a biblioteca mostra as capas pré-geradas (${types.size} tipos com imagem WebP)`)
  check([...types].every((type) => manifest.types[type]), 'todas as capas mostradas estão no índice manifest.json')
  check(glb.length === 0, `nenhum GLB descarregado para mostrar a biblioteca (${glb.length ? glb.slice(0, 5).join(', ') : 'nenhum'})`)
  check(coverFailures.length === 0, `sem pedidos de capa falhados (${coverFailures.length})`)
  check(coverRequests.filter((p) => p.endsWith('manifest.json')).length <= 1, 'o índice das capas é pedido uma só vez')
  void list
  // Esquema 2D e capas de projeto: a vista frontal pré-gerada substitui a captura do GLB.
  const frontTypes = ['powerSupplyProauto24A', 'breaker2p', 'terminalSet3ph']
  const fronts = await page.evaluate(async (types) => {
    const { getCad3DImage } = await import('/src/schematic/cad3DImage.ts')
    const { getOrientedComponentImage } = await import('/src/three/orientedComponentImage.ts')
    const images = await Promise.all(types.map((type) => getCad3DImage(type)))
    const oriented = await getOrientedComponentImage(types[0], { x: 0, y: 0, z: 0 })
    return { prefixes: images.map((image) => image.slice(0, 16)), sameOriented: oriented === images[0] }
  }, frontTypes)
  check(fronts.prefixes.every((prefix) => prefix === 'data:image/webp;'), `vistas frontais do Esquema 2D vêm das imagens WebP pré-geradas (${fronts.prefixes.join(', ')})`)
  check(fronts.sameOriented, 'a orientação original reutiliza a vista frontal pré-gerada')
  check(frontTypes.every((type) => frontRequests.has(`/component-covers/front/${type}.webp`)), 'as vistas frontais são pedidas a public/component-covers/front')
  check(glb.length === 0, `nenhum GLB descarregado para as vistas frontais (${glb.length ? glb.slice(0, 5).join(', ') : 'nenhum'})`)
  check(errors.length === 0, `sem erros JavaScript (${errors.join(' | ') || 'nenhum'})`)
} finally {
  await browser.close()
}
console.log(`\n${checks} verificações das capas da biblioteca passaram`)
