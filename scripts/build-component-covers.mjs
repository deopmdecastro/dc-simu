// Gera as imagens dos componentes a partir dos GLB reais, sem fundo, por componente com modelo 3D:
//  - public/component-covers/{tipo}.webp        capa da biblioteca (estúdio 3/4, 192 px);
//  - public/component-covers/front/{tipo}.webp  vista frontal ortográfica (Esquema 2D e capas de projeto);
// mais o índice manifest.json. A app mostra estas imagens leves em vez de descarregar e desenhar cada GLB.
//
// Usa a mesma captura da app (componentTurntable · getComponentCoverImage, estúdio 3/4) num Chrome
// sem cabeça contra o servidor de desenvolvimento:
//   npx vite --port 5207 --strictPort --host 127.0.0.1
//   COVERS_URL=http://127.0.0.1:5207 node scripts/build-component-covers.mjs            # todas
//   COVERS_URL=http://127.0.0.1:5207 node scripts/build-component-covers.mjs --only plcSiemensS7300Cpu315
//   node scripts/build-component-covers.mjs --check     # falha se algum tipo com GLB não tiver capa
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outDir = path.join(root, 'public', 'component-covers')
const manifestPath = path.join(outDir, 'manifest.json')
const args = process.argv.slice(2)
const only = args.includes('--only') ? args[args.indexOf('--only') + 1].split(',').filter(Boolean) : null
const baseURL = process.env.COVERS_URL || 'http://127.0.0.1:5207'

if (args.includes('--check')) {
  // Verificação sem browser: compara o índice com os tipos que têm GLB (lista gravada pelo gerador).
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  const missing = manifest.expected.flatMap((type) => [manifest.types[type], manifest.front?.[type]]
    .map((file, i) => (!file || !fs.existsSync(path.join(outDir, file)) ? `${type}${i ? ' (frontal)' : ''}` : null)).filter(Boolean))
  if (missing.length) { console.error(`Capas em falta: ${missing.join(', ')}`); process.exit(1) }
  console.log(`${Object.keys(manifest.types).length} capas e ${Object.keys(manifest.front ?? {}).length} vistas frontais presentes`)
  process.exit(0)
}

const { chromium } = await import('playwright')
const browser = await chromium.launch(process.env.COVERS_CHANNEL === 'bundled' ? {} : { channel: 'chrome' })
try {
  const context = await browser.newContext({ viewport: { width: 800, height: 600 } })
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url())
    return url.origin === new URL(baseURL).origin && !url.pathname.startsWith('/api/') ? route.continue() : route.abort()
  })
  const page = await context.newPage()
  page.on('pageerror', (e) => console.warn('pageerror', e.message))
  await page.goto(baseURL + '/dashboard')
  const types = await page.evaluate(async () => {
    const { TEMPLATES } = await import('/src/electrical/factory.ts')
    const { hasComponent3DVisual } = await import('/src/three/modelPaths.ts')
    return Object.keys(TEMPLATES).filter((type) => hasComponent3DVisual(type))
  })
  fs.mkdirSync(path.join(outDir, 'front'), { recursive: true })
  const previous = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : { types: {} }
  const done = { ...previous.types }
  const front = { ...(previous.front ?? {}) }
  const wanted = only ? types.filter((type) => only.includes(type)) : types
  for (const type of wanted) {
    const started = Date.now()
    const images = await page.evaluate(async (type) => {
      const webpBase64 = async (blob) => {
        if (blob.type !== 'image/webp') throw new Error(`formato inesperado ${blob.type}`)
        const bytes = new Uint8Array(await blob.arrayBuffer())
        let bin = ''
        for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
        return btoa(bin)
      }
      const { getComponentCoverImage } = await import('/src/three/componentTurntable.ts')
      const cover = await webpBase64(await fetch(await getComponentCoverImage(type)).then((r) => r.blob()))
      // Vista frontal: a captura PNG real do Esquema 2D, recodificada em WebP com transparência.
      const { captureCad3DImage } = await import('/src/schematic/cad3DImage.ts')
      const img = new Image()
      img.src = await captureCad3DImage(type)
      await img.decode()
      const canvas = document.createElement('canvas')
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      canvas.getContext('2d').drawImage(img, 0, 0)
      const frontBlob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', 0.9))
      return { cover, front: await webpBase64(frontBlob) }
    }, type).catch((error) => { console.warn(`✗ ${type}: ${error.message}`); return null })
    if (!images) continue
    const file = `${type}.webp`
    fs.writeFileSync(path.join(outDir, file), Buffer.from(images.cover, 'base64'))
    fs.writeFileSync(path.join(outDir, 'front', file), Buffer.from(images.front, 'base64'))
    done[type] = file
    front[type] = `front/${file}`
    const kib = (b64) => Math.round(Buffer.byteLength(b64, 'base64') / 1024)
    console.log(`✓ ${type} (capa ${kib(images.cover)} KiB, frontal ${kib(images.front)} KiB, ${Date.now() - started} ms)`)
  }
  const manifest = {
    note: 'Gerado por scripts/build-component-covers.mjs a partir dos GLB reais (WebP sem fundo): types = capa 3/4 de 192 px; front = vista frontal ortográfica.',
    generatedAt: new Date().toISOString(),
    expected: types,
    types: Object.fromEntries(Object.entries(done).filter(([type]) => types.includes(type)).sort(([a], [b]) => a.localeCompare(b))),
    front: Object.fromEntries(Object.entries(front).filter(([type]) => types.includes(type)).sort(([a], [b]) => a.localeCompare(b))),
  }
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
  const missing = types.filter((type) => !manifest.types[type] || !manifest.front[type])
  console.log(`\n${Object.keys(manifest.types).length}/${types.length} capas em public/component-covers${missing.length ? ` · em falta: ${missing.join(', ')}` : ''}`)
  if (missing.length) process.exitCode = 1
} finally {
  await browser.close()
}
