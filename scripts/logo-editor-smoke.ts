import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import * as THREE from 'three'
import { buildBuiltinDraft, upgradeBuiltinDraft } from '../src/admin/editor3d/builtinComponents'
import { seedLogoPanel } from '../src/admin/editor3d/seedLogoPanel'
import { boundsMm, buildDefinitionObject, defaultPart, loadGlbAssets } from '../src/catalog/definition'
import { controlAreaBox, localControlArea } from '../src/catalog/controlArea'
import { initialVars, runControlActions, springHold } from '../src/catalog/behavior'
import { expandTemplate } from '../src/catalog/displayCanvas'
import { editorSelectionBounds } from '../src/admin/editor3d/viewportSelection'
import { validateDefinition } from '../src/admin/editor3d/validate'
import { createComponent } from '../src/electrical/factory'
import { logoRuntimeVars } from '../src/three/logoRuntime'
import type { ComponentDefinition, Vec3 } from '../src/catalog/types'

let checks = 0
const check = (message: string, test: () => void) => { test(); checks++; console.log('PASS — ' + message) }
const originalFetch = globalThis.fetch
globalThis.fetch = async (input) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  if (url.startsWith('/models/')) return new Response(await fs.readFile(path.join('public', decodeURIComponent(url))))
  throw new Error('Rede externa proibida: ' + url)
}
try {
  const { def, meta } = await buildBuiltinDraft('plcSiemensLogo1224RC')
  const cache = new Map<string, THREE.Object3D>()
  await loadGlbAssets(def, cache)
  const root = buildDefinitionObject(def, cache)
  check('LOGO importa seis teclas distintas e um LCD de texto alinhado', () => {
    assert.equal(def.controls?.length, 6)
    assert.deepEqual(def.controls!.map((control) => control.name), ['Tecla ESC', 'Tecla OK', 'Tecla ↑', 'Tecla ↓', 'Tecla ←', 'Tecla →'])
    assert.equal(def.displays?.length, 1)
    const lcd = def.displays![0]
    assert.equal(lcd.kind, 'text')
    assert.ok(Math.abs(lcd.widthMm - 29.22) < .1 && Math.abs(lcd.heightMm - 22) < .1)
    assert.ok(lcd.position[2] > 24 && lcd.position[2] < 26)
    assert.deepEqual(lcd.normal, [0, 0, 1])
    assert.equal(validateDefinition(def, meta).filter((issue) => issue.level === 'error').length, 0)
  })
  check('Áreas independentes não movem o corpo nem partilham a mesma malha', () => {
    const boxes = def.controls!.map((control) => {
      assert.deepEqual(control.nodes, [])
      assert.equal(control.travelMm, 0)
      const box = controlAreaBox(root, control)
      assert.ok(box && !box.isEmpty())
      return box!
    })
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) assert.equal(boxes[i].intersectsBox(boxes[j]), false)
  })
  check('Teclas navegam, ESC volta ao início e largar conserva a página', () => {
    const initial = initialVars(def), down = def.controls!.find((control) => control.name === 'Tecla ↓')!
    const pressed = springHold(down, initial, def.initialState, true, initial)
    assert.equal(pressed.vars.logoPage, 'io')
    assert.equal(pressed.vars.logoKey, '↓')
    const released = springHold(down, pressed.vars, def.initialState, false, initial)
    assert.equal(released.vars.logoPage, 'io')
    assert.equal(released.vars.logoKey, '')
    const up = def.controls!.find((control) => control.name === 'Tecla ↑')!
    assert.equal(runControlActions(up.actions, initial, def.initialState).vars.logoPage, 'diagnostics')
    const esc = def.controls!.find((control) => control.name === 'Tecla ESC')!
    assert.equal(runControlActions(esc.actions, released.vars, def.initialState).vars.logoPage, 'home')
    assert.equal(expandTemplate(def.displays![0].lines[1].text, initial), '> STOP')
  })
  const legacy = structuredClone(def)
  legacy.controls = []; legacy.displays = []; legacy.vars = []; delete legacy.builtinSeeds
  const upgraded = await upgradeBuiltinDraft('plcSiemensLogo1224RC', legacy)
  check('Rascunho antigo recebe LCD/teclas sem alterar peças, bornes ou IDs', () => {
    assert.ok(upgraded)
    assert.equal(JSON.stringify(upgraded.parts), JSON.stringify(legacy.parts))
    assert.equal(JSON.stringify(upgraded.terminals), JSON.stringify(legacy.terminals))
    assert.equal(upgraded.controls?.length, 6)
    assert.equal(upgraded.displays?.length, 1)
  })
  const repeated = await upgradeBuiltinDraft('plcSiemensLogo1224RC', upgraded!)
  check('Atualização idempotente e elementos apagados não são recriados', () => {
    assert.equal(repeated, null)
    const edited = structuredClone(upgraded!); edited.controls = []; edited.displays = []
    assert.equal(seedLogoPanel(edited, cache), false)
    assert.equal(edited.controls?.length, 0)
    assert.equal(edited.displays?.length, 0)
  })
  check('Controlos e LCD personalizados são preservados', () => {
    const custom = structuredClone(legacy)
    custom.controls = [{ ...def.controls![0], name: 'Comando personalizado' }]
    custom.displays = [{ ...def.displays![0], name: 'LCD personalizado', foreground: '#113355' }]
    const before = structuredClone(custom)
    assert.equal(seedLogoPanel(custom, cache), false)
    assert.deepEqual(custom, before)
  })
  check('Foco usa a área da tecla e acompanha a peça transformada', () => {
    const transformed: ComponentDefinition = structuredClone(def)
    const group = { ...defaultPart('group', null, 'Grupo'), position: [40, 8, -20] as Vec3, rotation: [10, 35, 20] as Vec3 }
    transformed.parts = [group, { ...transformed.parts[0], parentId: group.id, position: [2, 5, 4], scale: [1.5, 1.5, 1.5] }]
    const r = buildDefinitionObject(transformed, cache), control = transformed.controls![0]
    const box = controlAreaBox(r, control)!
    const focus = editorSelectionBounds(transformed, r, { kind: 'control', id: control.id }, [], null, [])
    assert.ok(focus.min.distanceTo(box.min) < 1e-6 && focus.max.distanceTo(box.max) < 1e-6)
    assert.ok(box.getSize(new THREE.Vector3()).length() < 20)
    const withoutSeed = structuredClone(transformed); withoutSeed.controls = []; withoutSeed.displays = []; delete withoutSeed.builtinSeeds
    assert.equal(seedLogoPanel(withoutSeed, cache), true)
    assert.ok(withoutSeed.displays![0].normal.every(Number.isFinite))
  })
  const raw = structuredClone(legacy), asset = raw.parts[0].asset!
  delete raw.assets[asset].builtinType
  raw.parts[0].rotation = [90, 0, 0]
  const rawCache = new Map<string, THREE.Object3D>(); await loadGlbAssets(raw, rawCache)
  const scale = 90 / boundsMm(raw, rawCache).getSize(new THREE.Vector3()).y
  raw.parts[0].scale = [scale, scale, scale]
  check('Importação antiga com escala/rotação própria recebe elementos alinhados', () => {
    assert.equal(seedLogoPanel(raw, rawCache), true)
    assert.ok(raw.displays![0].position.every(Number.isFinite) && raw.displays![0].widthMm > 20)
  })
  check('Áreas inválidas são recusadas pela validação', () => {
    const broken = structuredClone(def)
    broken.controls![0].hitArea!.size[0] = 0
    assert.equal(localControlArea(broken.controls![0]), null)
    assert.ok(validateDefinition(broken, meta).some((issue) => issue.level === 'error' && issue.text.includes('área de clique')))
  })
  check('LCD do catálogo recebe I/O, alimentação e diagnóstico reais do PLC', () => {
    const plc = createComponent('plcSiemensLogo1224RC')
    plc.state.powered = true; plc.state.outputs = { 'Q0.1': true }
    plc.terminals.find((terminal) => terminal.label === 'I0.2')!.energized = true
    const vars = logoRuntimeVars(plc, 'running', [{ level: 'warning' }], new Date('2026-10-26T12:00:00Z'))
    assert.equal(vars.logoInputs, '00100000'); assert.equal(vars.logoOutputs, '0100')
    assert.equal(vars.logoPowered, true); assert.equal(vars.logoMode, 'RUN'); assert.equal(vars.logoWarnings, 1)
  })
} finally { globalThis.fetch = originalFetch }
console.log(`PASS — ${checks} verificações do PLC e das áreas de clique; sem rede externa`)
