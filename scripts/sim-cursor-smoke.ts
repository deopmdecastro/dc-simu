/** Regressão da remoção do dedo 3D: sem sobreposição, sem cursor escondido e sem alterar a manobra. */
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'

let checks = 0
const check = (condition: unknown, message: string) => { assert.ok(condition, message); checks++; console.log(`PASS — ${message}`) }
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const panel = read('src/three/Panel3D.tsx')
const css = read('src/styles/panel3d-editor.css')

check(!existsSync(new URL('../src/three/SimFinger3D.tsx', import.meta.url)), 'o componente do dedo 3D e os seus eventos/geometria foram removidos')
check(!/SimFinger3D|sim-finger/.test(panel), 'o painel não monta nem identifica um cursor de dedo 3D')
check(!/data-sim-finger|cursor\s*:\s*none/.test(css), 'o CSS do painel não esconde o cursor para a simulação')
check(/\.panel3d-stage\[data-edit-mode="navigate"\]\[data-placing="none"\] canvas \{ cursor: default; \}/.test(css), 'a ferramenta Selecionar mantém o cursor normal e os cursores dos alvos')
check(/\.panel3d-stage\[data-edit-mode="pan"\] canvas:active[\s\S]*?cursor: grabbing !important/.test(css), 'o cursor de deslocamento da vista continua disponível')
check(panel.includes("const canActuate = runState !== 'stopped' && (demoMode || tool === 'select') && !viewOrientationEditor"), 'as condições de atuação em RUN/PAUSA não mudam')
check(panel.includes("const simLocked = demoMode || ((runState === 'running' || runState === 'paused') && !viewOrientationEditor)"), 'o bloqueio de edição em RUN/PAUSA não muda')
check(/onStart=\{\(pressed\) => activateComponent\(c, \(\) => setComponentState\(c\.id, \{ startPressed: pressed \}\)\)\}/.test(panel)
  && /onStop=\{\(pressed\) => activateComponent\(c, \(\) => setComponentState\(c\.id, \{ stopPressed: pressed \}\)\)\}/.test(panel), 'as zonas START/STOP continuam ligadas às ações elétricas existentes')

console.log(`\n${checks} verificações OK — consulta também test:sim-select-3d-ui para a cena e o cursor no browser`)
