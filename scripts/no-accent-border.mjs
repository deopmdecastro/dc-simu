// Guarda de estilo: o site não usa cartões com barra lateral de destaque (left accent border).
// Falha se uma regra CSS tiver border-left ≥ 2px, sombra inset lateral ≥ 2px ou barra absoluta estreita à esquerda.
import fs from 'node:fs'
import path from 'node:path'

const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(dir, e.name)) : e.name.endsWith('.css') ? [path.join(dir, e.name)] : [])
const problems = []
for (const file of walk('src')) {
  const css = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')
  for (const [, selector, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const b = body.replace(/\s+/g, ' ')
    const bad = /border-(?:left|inline-start)(?:-width)?\s*:\s*(?:[2-9]|\d{2})(?:px|rem)/.test(b)
      || /box-shadow:[^;]*inset\s+-?[2-9]px\s+0/.test(b)
      || (/(?:left|inset-inline-start)\s*:\s*0/.test(b) && /(?:^|[; ])width\s*:\s*[2-6]px/.test(b) && /absolute/.test(b) && /bottom\s*:\s*0|height\s*:\s*100%/.test(b))
    if (bad) problems.push(`${file}: ${selector.trim().slice(-80)}`)
  }
}
if (problems.length) { console.error('Barra lateral de destaque encontrada:\n- ' + problems.join('\n- ')); process.exit(1) }
console.log('no-accent-border: ok')
