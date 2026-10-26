/**
 * Sincronização editor ↔ simulador (BUILTIN-SYNC-01 · LOGO-BORNES-01 · LOGO-LCD-01).
 *
 *  1. Varrimento: para cada integrado, o rascunho do editor (`buildBuiltinDraft`) e
 *     o componente do simulador (`createComponent`) têm as mesmas etiquetas de
 *     bornes, as mesmas posições (≤ 2 mm) e o mesmo tamanho físico (≤ 2 mm).
 *  2. LOGO! com bornes espelhados (rascunho antigo: I/L+/M em baixo, Q em cima):
 *     `fixFlippedTerminals` repõe-nos, é idempotente e não mexe em bornes editados à mão;
 *     `upgradeBuiltinDraft` aplica a correção; a versão publicada espelhada é detetada.
 *  3. Auditoria: rascunho nunca publicado, alterações por publicar (independente da
 *     ordem das chaves), bornes invertidos/em falta e integrados sem GLB bloqueados.
 *  4. LCD do LOGO!: a janela calculada a partir do GLB fica dentro da face, no
 *     zona central à esquerda (entre as filas de bornes), e coincide com o valor de recurso.
 *
 * Corre com `npx tsx scripts/builtin-sync-smoke.ts`.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import * as THREE from 'three'

const originalFetch = globalThis.fetch
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  if (url.startsWith('/models/')) return new Response(await fs.readFile(path.join('public', decodeURIComponent(url))))
  return originalFetch(input, init)
}) as typeof fetch

const { buildBuiltinDraft, builtinComponents, fixFlippedTerminals, flippedRuntimeTerminals, upgradeBuiltinDraft } = await import('../src/admin/editor3d/builtinComponents')
const { auditBuiltins, auditEntry, sameDefinition, stableJson } = await import('../src/admin/editor3d/syncAudit')
const { boundsMm, loadGlbAssets, runtimeSpec } = await import('../src/catalog/definition')
const { createComponent } = await import('../src/electrical/factory')
const { getComponentPhysicalSizeMm, hasComponent3DModel } = await import('../src/three/modelPaths')
type Def = Awaited<ReturnType<typeof buildBuiltinDraft>>['def']

let checks = 0
const ok = (label: string, condition: boolean) => { checks += 1; if (!condition) { console.error(`[builtin-sync] ${label}`); process.exit(1) } }
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value))

// 1) Varrimento de todos os integrados
const builtins = builtinComponents()
let withModel = 0
for (const info of builtins) {
  const { def, usedModel } = await buildBuiltinDraft(info.type)
  const cache = new Map(); await loadGlbAssets(def, cache)
  const glb = def.parts.filter((part) => part.kind === 'glb')
  const box = boundsMm(glb.length ? { ...def, parts: glb } : def, cache), size = box.getSize(new THREE.Vector3())
  const sim = createComponent(info.type)
  const simLabels = sim.terminals.map((t) => t.label).sort().join(','), edLabels = def.terminals.map((t) => t.label).sort().join(',')
  ok(`${info.type}: mesmos bornes no editor e no simulador`, simLabels === edLabels)
  for (const terminal of def.terminals) {
    const s = sim.terminals.find((item) => item.label === terminal.label)
    const p = s?.position3D as { x: number; y: number; z?: number } | undefined
    if (!p) continue
    const f = [(terminal.position[0] - box.min.x) / size.x, (terminal.position[1] - box.min.y) / size.y, (terminal.position[2] - box.min.z) / size.z]
    const d = Math.max(Math.abs(f[0] - p.x) * size.x, Math.abs(f[1] - p.y) * size.y, Math.abs(f[2] - (p.z ?? .5)) * size.z)
    ok(`${info.type}/${terminal.label}: posição igual no editor e no simulador (${d.toFixed(1)} mm)`, d <= 2)
  }
  const phys = getComponentPhysicalSizeMm(info.type)
  if (phys) ok(`${info.type}: tamanho físico igual`, Math.max(Math.abs(phys.width - size.x), Math.abs(phys.height - size.y), Math.abs(phys.depth - size.z)) <= 2)
  ok(`${info.type}: GLB do editor = GLB do simulador`, usedModel === hasComponent3DModel(info.type))
  if (usedModel) withModel++
}
ok('há integrados com e sem GLB', withModel > 0 && withModel < builtins.length)

// 2) LOGO! com bornes espelhados em Y
const { def: logo } = await buildBuiltinDraft('plcSiemensLogo1224RC')
const cache = new Map(); await loadGlbAssets(logo, cache)
const box = boundsMm(logo, cache)
const right = new Map(logo.terminals.map((t) => [t.label, t.position]))
ok('LOGO!: I0.0 em cima e Q0.1 em baixo no integrado', right.get('I0.0')![1] > right.get('Q0.1')![1] + 40)
const flipped: Def = clone(logo)
flipped.terminals = flipped.terminals.map((t) => ({ ...t, position: [t.position[0], box.min.y + box.max.y - t.position[1], t.position[2]], normal: [t.normal[0], -t.normal[1], t.normal[2]] }))
// um borne movido à mão (10 mm para o lado) não pode ser «corrigido»
const hand = flipped.terminals.find((t) => t.label === 'I0.3')!
hand.position = [hand.position[0] + 10, hand.position[1], hand.position[2]]
const probe = clone(flipped)
const fixed = fixFlippedTerminals('plcSiemensLogo1224RC', probe, cache)
ok('bornes invertidos detetados (L+, M, I0.0, Q0.1…)', ['L+', 'M', 'I0.0', 'Q0.1'].every((label) => fixed.includes(label)))
ok('borne editado à mão fica como está', !fixed.includes('I0.3'))
ok('posições repostas', probe.terminals.filter((t) => t.label !== 'I0.3').every((t) => Math.hypot(...t.position.map((v, i) => v - right.get(t.label)![i]) as [number, number, number]) < .01))
ok('correção idempotente', fixFlippedTerminals('plcSiemensLogo1224RC', probe, cache).length === 0)
ok('integrado correto não é alterado', fixFlippedTerminals('plcSiemensLogo1224RC', clone(logo), cache).length === 0)
const upgraded = await upgradeBuiltinDraft('plcSiemensLogo1224RC', flipped)
ok('upgradeBuiltinDraft corrige os bornes do LOGO!', !!upgraded && upgraded.terminals.find((t) => t.label === 'I0.0')!.position[1] > upgraded.terminals.find((t) => t.label === 'Q0.1')!.position[1])
const badRuntime = runtimeSpec(flipped, box), goodRuntime = runtimeSpec(logo, box)
ok('versão publicada espelhada detetada', flippedRuntimeTerminals('plcSiemensLogo1224RC', badRuntime.terminals).includes('I0.0'))
ok('versão publicada correta não é marcada', flippedRuntimeTerminals('plcSiemensLogo1224RC', goodRuntime.terminals).length === 0)

// 3) Auditoria
const origin = [{ key: 'Origem', value: 'Integrado · plcSiemensLogo1224RC' }]
const meta = { name: 'LOGO! 12/24 RCE', group: 'Controladores', reference: '', description: '', tags: [], properties: origin } as never
const version = (def: Def, runtime = goodRuntime) => ({ version: 1, publishedAt: '', note: '', changes: [], definition: { ...clone(def), assets: {} }, runtime })
const settings = { disabled: {}, hidden: {} }
const bad = await auditEntry({ id: 'logo', meta, status: 'published', latestVersion: 1, archived: false, updatedAt: '', versions: [version(flipped, badRuntime)], draft: flipped } as never, settings)
const kinds = bad.issues.map((issue) => issue.kind)
ok('auditoria: rascunho invertido', kinds.includes('draft-flipped'))
ok('auditoria: publicado invertido', kinds.includes('published-flipped'))
ok('auditoria: corrigível e precisa de publicar', bad.canUpgrade && bad.needsPublish)
const draftOnly = await auditEntry({ id: 'novo', meta: { ...(meta as object), properties: [] } as never, status: 'draft', latestVersion: 0, archived: false, updatedAt: '', versions: [], draft: logo } as never, settings)
ok('auditoria: rascunho nunca publicado não está no simulador', draftOnly.issues.some((issue) => issue.kind === 'draft-only') && draftOnly.simulator === 'Não aparece')
const reordered = JSON.parse(stableJson({ ...logo, assets: {} }))
ok('comparação ignora a ordem das chaves (jsonb)', sameDefinition(logo, reordered))
const edited = clone(logo); edited.terminals[0] = { ...edited.terminals[0], name: 'Alimentação' }
const changed = await auditEntry({ id: 'logo', meta, status: 'published', latestVersion: 1, archived: false, updatedAt: '', versions: [version(logo)], draft: edited } as never, settings)
ok('auditoria: alterações por publicar', changed.issues.some((issue) => issue.kind === 'unpublished'))
const missing = clone(logo); missing.terminals = missing.terminals.filter((t) => t.label !== 'Q0.3')
const gaps = await auditEntry({ id: 'logo', meta, status: 'published', latestVersion: 1, archived: false, updatedAt: '', versions: [version(missing)], draft: missing } as never, settings)
ok('auditoria: bornes em falta', gaps.issues.some((issue) => issue.kind === 'missing-terminals' && issue.labels?.includes('Q0.3')))
const clean = await auditEntry({ id: 'logo', meta, status: 'published', latestVersion: 1, archived: false, updatedAt: '', versions: [version(logo)], draft: logo } as never, settings)
ok(`auditoria: LOGO! sincronizado sem diferenças (${clean.issues.map((i) => i.kind).join(',')})`, clean.issues.length === 0)
const locked = auditBuiltins([], settings)
ok('integrados sem GLB marcados como bloqueados no simulador', locked.length === builtins.length - withModel && locked.every((row) => row.issues.some((issue) => issue.kind === 'builtin-locked')))
const published = auditBuiltins([{ id: 'x', meta: { ...(meta as object), properties: [{ key: 'Origem', value: `Integrado · ${locked[0].builtin}` }] }, status: 'published', latestVersion: 1, archived: false, updatedAt: '', versions: [] } as never], settings)
ok('integrado publicado a partir do editor deixa de estar bloqueado', !published.some((row) => row.builtin === locked[0].builtin))

// 4) LCD do LOGO! a partir do GLB
const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js')
const { fitComponentModel } = await import('../src/three/modelFit')
const { getComponentGlbSpec } = await import('../src/three/modelPaths')
const spec = getComponentGlbSpec('plcSiemensLogo1224RC')!
const buffer = await fs.readFile(path.join('public', spec.path))
const gltf = await new Promise<{ scene: THREE.Object3D }>((resolve, reject) => new GLTFLoader().parse(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer, '', resolve as never, reject))
const model = fitComponentModel(gltf.scene, spec, 0.01, 'bottom')
const { logoScreenRect } = await import('../src/three/logoScreen')
const lcd = logoScreenRect(model)
const face = new THREE.Box3().setFromObject(model)
ok(`LCD dentro da face do LOGO! (${JSON.stringify(lcd)})`, lcd.minX > face.min.x && lcd.maxX < face.max.x && lcd.minY > face.min.y && lcd.maxY < face.max.y)
ok('LCD à esquerda (teclas à direita)', (lcd.minX + lcd.maxX) / 2 < (face.min.x + face.max.x) / 2)
const h = face.max.y - face.min.y
ok('LCD na zona central da face (entre as filas de bornes)', lcd.minY > face.min.y + .25 * h && lcd.maxY < face.min.y + .75 * h)
ok('LCD coincide com o recurso medido (±0,02)', Math.abs(lcd.minX + .277) < .02 && Math.abs(lcd.maxX - .045) < .02 && Math.abs(lcd.minY - .3) < .02 && Math.abs(lcd.maxY - .55) < .02)

console.log(`[builtin-sync] ${checks} verificações OK (${builtins.length} integrados, ${withModel} com GLB)`)
