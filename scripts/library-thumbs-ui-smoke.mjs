// Biblioteca: todos os cartões mostram uma capa. Com imagem 3D, a capa WebP pré-gerada; sem imagem 3D
// (tipos bloqueados ou captura indisponível), o símbolo do esquema do próprio tipo — nunca vazio nem genérico.
// Barra lateral real num root React descartável (sem conta nem API).
import path from 'node:path'
import { inspectorFixture } from './lib/inspector-fixture.mjs'

const output = process.env.LIBRARY_THUMBS_OUTPUT || path.resolve('runtime/library-thumbs')
const f = await inspectorFixture({ output }), { page, check } = f
try {
  await page.setViewportSize({ width: 1440, height: 1000 })
  const heads = page.locator('.dc-library-folder-head[aria-expanded="false"]')
  for (let i = 0; i < 80 && await heads.count(); i++) await heads.first().click().catch(() => {})
  for (let pass = 0; pass < 3; pass++) {
    await page.evaluate(async () => { for (const n of document.querySelectorAll('.dc-library-tile-image')) { n.scrollIntoView(); await new Promise((r) => setTimeout(r, 20)) } })
    await page.waitForTimeout(2500)
  }
  const tiles = await page.evaluate(() => [...new Map([...document.querySelectorAll('.dc-library-tile')].map((t) => {
    const image = t.querySelector('.dc-library-tile-image')
    const symbol = image?.querySelector('svg[data-thumb-state="simbolo-esquema"]')
    const symbolBox = symbol?.getBBox?.()
    return [t.querySelector('.dc-library-tile-name')?.textContent, {
      cover: [...(image?.querySelectorAll('img') ?? [])].some((i) => i.complete && i.naturalWidth > 0 && i.src.includes('/component-covers/')),
      symbol: !!symbol && !!symbol.querySelector('line, path, rect, circle, polyline, polygon') && (symbolBox?.width ?? 0) > 4,
      generic: [...(image?.querySelectorAll('img') ?? [])].some((i) => (i.getAttribute('src') ?? '').startsWith('data:image/png')),
      locked: !!t.querySelector('.dc-library-tile-lock'),
    }]
  })).entries()])
  const empty = tiles.filter(([, t]) => !t.cover && !t.symbol).map(([name]) => name)
  check(tiles.length >= 150, `Biblioteca completa aberta (${tiles.length} cartões)`)
  check(empty.length === 0, `Nenhum cartão sem capa (${empty.join(' | ') || 'todos com imagem ou símbolo'})`)
  check(tiles.filter(([, t]) => t.cover).length >= 120, `Capas 3D pré-geradas carregadas (${tiles.filter(([, t]) => t.cover).length})`)
  const locked = tiles.filter(([, t]) => t.locked)
  check(locked.every(([, t]) => t.symbol), `Componentes bloqueados mostram o seu símbolo do esquema (${locked.length})`)
  check(tiles.every(([, t]) => !t.generic), 'Nenhuma miniatura genérica desenhada à mão')
  for (const [name, file] of [['Contator tripolar (KM)', 'tile-contator.png'], ['Seletor 3 posições', 'tile-seletor.png']]) {
    const tile = page.locator('.dc-library-tile', { hasText: name }).first()
    await tile.scrollIntoViewIfNeeded(); await tile.screenshot({ path: path.join(output, file) })
  }
  f.stable()
  console.log(`${f.count()} verificações das capas da biblioteca passaram`)
} finally {
  await f.browser.close()
}
