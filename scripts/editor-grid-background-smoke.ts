import assert from 'node:assert/strict'
import { editorGridBackground, EDITOR_THEME } from '../src/ui/editorTheme'
const dots = editorGridBackground()
assert.equal(dots.backgroundColor, EDITOR_THEME.background)
assert.match(dots.backgroundImage, /circle at 1px 1px/)
assert.equal(dots.backgroundSize, '20px 20px')
assert.match(editorGridBackground({ style: 'lines' }).backgroundImage, /linear-gradient/)
assert.equal(editorGridBackground({ enabled: false }).backgroundImage, 'none')
assert.equal(editorGridBackground({ spacing: 40, x: -25, y: 10 }).backgroundPosition, '-25px 10px')
assert.equal(editorGridBackground({ spacing: 40 }).backgroundSize, '40px 40px')
for (const spacing of [0, -1, NaN, Infinity]) assert.equal(editorGridBackground({ spacing }).backgroundSize, '20px 20px')
assert.equal(editorGridBackground({ dark: true }).backgroundColor, EDITOR_THEME.backgroundDark)
console.log('PASS — fundo comum: pontos, linhas, ocultação, passo, pan e tema escuro')
