/** Authored interface chrome uses SVGs, never emoji or font-glyph icons. */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import CircuitIcon, { CIRCUIT_ICON_NAMES, isCircuitIcon } from '../src/ui/CircuitIcon'
import { IconCheck, IconCommands, IconGraduation, IconIssue, IconLock, IconStar } from '../src/ui/icons'
import { PANEL_STICKER_PRESETS } from '../src/three/panelStickers'
import PanelStickerPicker from '../src/components/PanelStickerPicker'
import LandingPricing from '../src/landing/LandingPricing'
import { DEFAULT_PRICING } from '../src/saas/platformCore.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
// Keep IEC/measurement notation (ground, DC, Ω), mathematical operators and
// keyboard shortcuts. User-authored names/content are intentionally not changed.
const forbidden = /[\p{Emoji_Presentation}\uFE0F\u20E3\u2600-\u27BF\u{1F000}-\u{1FAFF}]|[★☆✓✕✖⚑✎⌫⏧⏹◴▤]/u
const violations: string[] = []
let checkedFiles = 0

const decodeEntities = (text: string) => text.replace(/&#(x[\da-f]+|\d+);/gi, (_, value: string) => {
  const code = value[0].toLowerCase() === 'x' ? parseInt(value.slice(1), 16) : Number(value)
  return code <= 0x10ffff ? String.fromCodePoint(code) : ''
})

function checkText(file: string, text: string, line: number) {
  const match = forbidden.exec(decodeEntities(text))
  if (match) violations.push(`${path.relative(root, file)}:${line}: ${match[0]}`)
}

function scan(dir: string) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name)
    if (entry.isDirectory()) { scan(file); continue }
    if (!/\.(?:tsx?|m?js|css|html|json)$/.test(file)) continue
    checkedFiles++
    const content = fs.readFileSync(file, 'utf8')
    if (/\.(?:tsx?|m?js)$/.test(file)) {
      const source = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
      const visit = (node: ts.Node) => {
        if (ts.isJsxText(node) || ts.isStringLiteralLike(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
          const line = source.getLineAndCharacterOfPosition(node.getStart()).line + 1
          checkText(file, node.text, line)
        }
        ts.forEachChild(node, visit)
      }
      visit(source)
    } else {
      // Comments can discuss old symbols without rendering them in the UI.
      const stripped = content.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ' ')).replace(/<!--[\s\S]*?-->/g, '')
      stripped.split('\n').forEach((line, index) => checkText(file, line, index + 1))
    }
  }
}
scan(path.join(root, 'src'))
assert.deepEqual(violations, [], `Use an SVG component instead of a Unicode icon:\n${violations.join('\n')}`)
console.log(`PASS — SVG: ${checkedFiles} ficheiros de interface sem emoji ou pictogramas de fonte`)

for (const Icon of [IconCheck, IconCommands, IconGraduation, IconLock, IconStar]) {
  const markup = renderToStaticMarkup(createElement(Icon, { size: 12 }))
  assert.match(markup, /<svg\b/)
  assert.match(markup, /<path\b/)
  assert.match(markup, /aria-hidden="true"/)
  assert.match(markup, /focusable="false"/)
}
for (const level of ['error', 'warning', 'info'] as const) {
  const markup = renderToStaticMarkup(createElement(IconIssue, { level }))
  assert.match(markup, /<svg\b/)
  assert.ok(!forbidden.test(markup))
}
console.log('PASS — SVG: plano e diagnósticos usam vetores decorativos acessíveis')

for (const name of CIRCUIT_ICON_NAMES) {
  assert.ok(isCircuitIcon(name))
  const markup = renderToStaticMarkup(createElement(CircuitIcon, { icon: name, title: `Circuito ${name}` }))
  assert.match(markup, /<svg\b/)
  assert.match(markup, /<(?:path|rect|circle)\b/)
  assert.ok(!forbidden.test(markup))
}
for (const preset of PANEL_STICKER_PRESETS.filter((item) => item.category !== 'numbers')) {
  // Marcas: o símbolo é o logótipo vetorial do fabricante em public/brands (registado em sources.json).
  if (preset.icon.startsWith('brand:')) assert.ok(fs.existsSync(path.join('public', 'brands', `${preset.icon.slice(6)}.svg`)), `Falta o logótipo da etiqueta ${preset.id}`)
  else if (preset.icon) assert.ok(isCircuitIcon(preset.icon), `Falta o SVG da etiqueta ${preset.id}`)
  else assert.ok(preset.label.trim(), `Etiqueta de texto ${preset.id} precisa de conteúdo`)
}
assert.equal(isCircuitIcon('unknown'), false)
const picker = renderToStaticMarkup(createElement(PanelStickerPicker, { onPick() {}, onClose() {} }))
assert.ok(!forbidden.test(picker))
assert.equal((picker.match(/aria-label="Escolher /g) ?? []).length, PANEL_STICKER_PRESETS.length, 'Todos os modelos têm uma ação de escolha nomeada; a prévia raster partilhada é verificada no navegador')
assert.match(picker, /Fechar biblioteca de etiquetas/)
console.log('PASS — Pictogramas vetoriais e modelos de texto da biblioteca de etiquetas válidos')

const prices = renderToStaticMarkup(createElement(LandingPricing, { pricing: DEFAULT_PRICING, onChoose() {} }))
const rows = prices.match(/<li\b[\s\S]*?<\/li>/g) ?? []
assert.ok(rows.length > 0)
assert.ok(rows.every((row) => /<svg\b/.test(row)))
assert.ok(!forbidden.test(prices))
console.log('PASS — SVG: os cartões públicos de preços também usam confirmação SVG')
