// Esquema IEC no telemóvel: pinça, mover a vista com um dedo e barras compactas.
// Contrato estático (sem browser): garante que as peças do gesto continuam ligadas ao canvas.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

let checks = 0
const check = (condition: unknown, message: string) => { assert.ok(condition, message); checks++; console.log(`PASS — ${message}`) }
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')

const editor = read('src/commands/CommandsEditor.tsx')
const toolbar = read('src/components/Toolbar.tsx')
const css = read('src/styles/mobile-refine.css')

check(/usePinchZoom\(viewportRef,\s*\{[\s\S]*?swallowPointers:\s*true/.test(editor), 'o canvas do Esquema IEC liga a pinça ao viewport e engole os ponteiros do 1.º dedo (como o GRAFCET)')
check(/pinchPan\(\{ x: start\.x, y: start\.y \}, start\.scale, scale, startCenter, center\)/.test(editor), 'a pinça mantém o ponto sob os dedos e desloca a vista com o centro dos dedos')
check(/CMD_ZOOM_MAX = 5/.test(editor) && !/Math\.min\(3, v\.scale/.test(editor), 'o limite de zoom é 5× (igual ao esquema 3D e ao GRAFCET) e é partilhado por botões, roda e pinça')
check(/event\.pointerType === 'touch'\) \{\s*select\(null\)\s*startPan\(event\)/.test(editor), 'um dedo no fundo vazio move a vista (também em simulação, onde não se edita)')
const touchPan = editor.indexOf("event.pointerType === 'touch'")
const marquee = editor.indexOf("// Seleção por retângulo (marquee)")
check(touchPan > 0 && marquee > touchPan, 'o toque decide-se antes do retângulo de seleção, que fica para rato/caneta')
check(/className="dc-cmd-zoomdock"[^>]*onPointerDown=\{\(e\) => e\.stopPropagation\(\)\}/.test(editor), 'os botões de zoom não desselecionam nem iniciam a vista')
check(/dc-cmd-hint-short/.test(editor) && /\.dc-cmd-hint-short \{ display: inline; \}/.test(css), 'o aviso da simulação tem versão curta no telemóvel')
check(/!demo && canSplit && !compactBar/.test(toolbar), 'o botão «Dois canvas» não aparece na barra compacta do telemóvel')
check(/\.\.\.\(isCmd \? \[\] : \[\{ title: 'Execução'/.test(toolbar), 'o menu «Mais» do Esquema IEC não lista modos/velocidades de execução que não existem nesta vista')
check(/\.dc-toolbar-shell\.is-compact \{ z-index: 60; \}/.test(css), 'a barra compacta fica acima da régua lateral recolhida (o «…» deixa de ser tapado)')
check(/\.dc-cmd \.dc-cmd-pages \{[^}]*flex-wrap: nowrap/.test(css), 'nome e páginas do esquema ficam numa única linha com deslize no telemóvel')

console.log(`\n${checks} verificações OK`)
