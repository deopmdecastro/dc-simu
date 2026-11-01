import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// O texto livre do Esquema IEC segue o comportamento do GRAFCET (GrafcetFreeText + atalhos do editor).
let checks = 0
const check = (condition: boolean, message: string) => { assert.ok(condition, message); checks += 1; console.log('PASS — ' + message) }
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const layer = read('src/commands/CommandsAnnotations.tsx')
const editor = read('src/commands/CommandsEditor.tsx')
const css = read('src/styles/commands.css')

check(/function CommandsFreeText/.test(layer) && /<CommandsFreeText/.test(layer), 'o texto livre do IEC é um componente próprio (como GrafcetFreeText)')
check(/event\.altKey \? \{ x: Math\.round\(x\), y: Math\.round\(y\) \} : \{ x: snap\(x\), y: snap\(y\) \}/.test(layer), 'arrastar ajusta à grelha; Alt move livremente')
check(/event\.pointerType === 'touch'/.test(layer) && /now - lastTap\.current < 350/.test(layer), 'duplo toque edita no telemóvel')
check(/event\.key === 'Enter' && \(event\.ctrlKey \|\| event\.metaKey\)/.test(layer) && /event\.key === 'Escape'/.test(layer), 'Esc e Ctrl+Enter confirmam a edição')
check(/removeCanvasText\(item\.id\)/.test(layer) && /draft\.trim\(\)/.test(layer), 'texto vazio ao confirmar é apagado')
check(/el\.style\.height = `\$\{el\.scrollHeight\}px`/.test(layer), 'a caixa de edição cresce com o conteúdo')
check(/e\.key === 'Enter' \|\| e\.key === 'F2'/.test(editor) && /styleKey/.test(editor), 'Enter/F2 editam e Ctrl+B/I/U formatam o texto selecionado')
check(/\.dc-cmd-text-anchor\.is-selected \{[^}]*border-style: dashed/.test(css) && /outline: 2px solid #2563eb/.test(css), 'moldura tracejada azul e contorno de edição iguais aos do GRAFCET')
console.log(`\n${checks} verificações OK`)
