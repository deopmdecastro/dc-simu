import assert from 'node:assert/strict'
import path from 'node:path'
import { inspectorFixture } from './lib/inspector-fixture.mjs'

const types = ['wireTrayStraight', 'wireTrayElbow90', 'wireTrayTee', 'wireTrayRiser90', 'conduitVdsStraight', 'conduitVdsElbow90', 'conduitCorrugated', 'pipeClampPvc', 'pipeClampMetalEpdm', 'pipeClampMetalScrew']
const output = path.resolve('../../../runtime/structure-covers')
const f = await inspectorFixture({ output }), { page, check } = f
try {
  const indexedImages = await page.evaluate(async () => {
    const manifest = await fetch('/component-covers/manifest.json').then(response => response.json())
    const files = [...Object.values(manifest.types), ...Object.values(manifest.front)]
    const failed = (await Promise.all(files.map(async file => {
      const img = new Image(); img.src = '/component-covers/' + file
      try { await img.decode(); return img.naturalWidth > 0 ? null : file } catch { return file }
    }))).filter(Boolean)
    return { count: files.length, failed }
  })
  check(indexedImages.failed.length === 0, `${indexedImages.count} imagens do índice descodificadas sem falhas`)
  const glbs = []
  page.on('request', request => { if (new URL(request.url()).pathname.endsWith('.glb')) glbs.push(request.url()) })
  await page.getByRole('tab', { name: 'Serralharia', exact: true }).click()
  await page.getByRole('button', { name: 'Recolher', exact: true }).click()
  for (const id of ['ser-aramadas', 'ser-tubos-vds']) {
    const section = page.locator(`[data-library-subgroup="${id}"]`)
    await section.locator('.dc-library-folder-head').click()
    await section.scrollIntoViewIfNeeded()
    const images = section.locator('.dc-library-tile-image img')
    const count = id === 'ser-aramadas' ? 4 : 6
    await images.nth(count - 1).waitFor()
    await page.waitForFunction(id => [...document.querySelectorAll(`[data-library-subgroup="${id}"] .dc-library-tile-image img`)].every(img => img.complete && img.naturalWidth > 0), id)
    check(await images.count() === count, `${count} capas reais carregadas em ${id}`)
  }
  check(glbs.length === 0, 'Biblioteca mostra as dez capas estáticas sem descarregar GLB')
  await page.locator('[data-library-subgroup="ser-aramadas"]').scrollIntoViewIfNeeded()
  await page.screenshot({ path: path.join(output, 'library-1440.png') })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: path.join(output, 'library-390.png') })

  // Regressão: sem imagens pré-geradas, os mesmos componentes têm de ser capturáveis.
  for (const type of types) {
    const result = await page.evaluate(async type => {
      const { getComponentCoverImage } = await import('/src/three/componentTurntable.ts')
      const { captureCad3DImage } = await import('/src/schematic/cad3DImage.ts')
      const urls = [await getComponentCoverImage(type), await captureCad3DImage(type)]
      const bounds = []
      for (const url of urls) {
        const img = new Image(); img.src = url; await img.decode()
        const canvas = document.createElement('canvas'); canvas.width = img.naturalWidth; canvas.height = img.naturalHeight
        const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0)
        const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data
        let count = 0, minX = canvas.width, minY = canvas.height, maxX = 0, maxY = 0
        for (let i = 3; i < pixels.length; i += 4) if (pixels[i] > 12) {
          count++; const x = ((i - 3) / 4) % canvas.width, y = Math.floor((i - 3) / 4 / canvas.width)
          minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y)
        }
        bounds.push({ count, minX, minY, maxX, maxY, width: canvas.width, height: canvas.height })
      }
      return bounds
    }, type)
    check(result.every(image => image.count > 40), `${type}: capa e vista frontal contêm geometria visível`)
    const cover = result[0]
    assert.ok(cover.minX > 0 && cover.minY > 0 && cover.maxX < cover.width - 1 && cover.maxY < cover.height - 1, `${type}: capa deve ter margem sem cortar o modelo`)
  }
  f.stable()
  console.log(`${f.count()} verificações passaram`)
} finally {
  await f.browser.close()
}
