/**
 * Botão de emergência: pose, cabeça móvel e animação (EMERGENCY-ACTUATOR-01).
 *
 *  1. Pose: o cogumelo fica à FRENTE (+Z) e o bloco de contactos atrás (−Z), como
 *     no aparelho montado na chapa. Antes a profundidade estava espelhada e o
 *     editor mostrava o bloco de bornes à frente («A editar: pose base»).
 *  2. Cabeça: `loadGlbAssets` separa a cabeça do corpo num nó `dcsimu_head` — só
 *     ela se afunda; a carcaça e o aro de fixação ficam parados.
 *  3. Controlo: o rascunho do editor traz a variável `pressed` e um controlo de
 *     botão ligado a `dcsimu_head`, com curso real e retenção.
 *  4. Bornes 21/22 no bloco, atrás (face «back»), e não na cabeça.
 *
 * Corre com `npx tsx scripts/emergency-actuator-smoke.ts`.
 */
/** Ambiente Node: o GLTFLoader do Three precisa de `self` para descarregar imagens embutidas no GLB. */
if (typeof (globalThis as { self?: unknown }).self === 'undefined') {
  ;(globalThis as { self: typeof globalThis }).self = globalThis
}

import fs from 'node:fs/promises'
import path from 'node:path'
import * as THREE from 'three'

const originalFetch = globalThis.fetch
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  if (url.startsWith('/models/')) return new Response(await fs.readFile(path.join('public', decodeURIComponent(url))))
  return originalFetch(input, init)
}) as typeof fetch

const { buildBuiltinDraft, upgradeBuiltinDraft } = await import('../src/admin/editor3d/builtinComponents')
const { ACTUATOR_HEAD_NAME } = await import('../src/three/actuatorHead')
const { boundsMm, buildDefinitionObject, loadGlbAssets } = await import('../src/catalog/definition')
const { REAL_TERMINALS } = await import('../src/electrical/realInterfaces')
const { createComponent } = await import('../src/electrical/factory')
const { motionAngle, normalizeMotion } = await import('../src/catalog/controlMotion')
const { prepareActuatorHead } = await import('../src/three/actuatorHead')
const { ComponentRig } = await import('../src/catalog/componentRig')
const { createGltfLoader } = await import('../src/three/gltfLoader')
const { PANEL_UNITS_PER_MM, getComponentModelSpec } = await import('../src/three/modelPaths')

let checks = 0
const ok = (label: string, condition: boolean, detail = '') => {
  checks += 1
  if (!condition) {
    console.error(`[emergency-actuator] FALHOU — ${label}${detail ? ` (${detail})` : ''}`)
    process.exit(1)
  }
  console.log(`PASS — ${label}${detail ? ` (${detail})` : ''}`)
}
const round = (value: number) => Math.round(value * 10) / 10

for (const type of ['emergencyButton', 'emergencyButtonKeyP20ACR'] as const) {
  const draft = await buildBuiltinDraft(type)
  const cache = new Map< string, THREE.Object3D>()
  await loadGlbAssets(draft.def, cache)
  const root = buildDefinitionObject(draft.def, cache)
  root.updateMatrixWorld(true)

  const box = boundsMm(draft.def, cache)
  const size = box.getSize(new THREE.Vector3())
  ok(`${type}: profundidade física do aparelho`, Math.abs(size.z - 76) < 6 || Math.abs(size.z - 97) < 6, `${round(size.z)} mm`)

  // 1) Pose: o cogumelo está à frente. A cabeça desenhada à frente da caixa é mais
  //    larga do que o corpo no último terço da profundidade.
  const part = root.getObjectByName(draft.def.parts[0].id) ?? root
  const head = part.getObjectByName(ACTUATOR_HEAD_NAME)
  ok(`${type}: a cabeça é um nó próprio (${ACTUATOR_HEAD_NAME})`, !!head)
  const headBox = head ? new THREE.Box3().setFromObject(head, true) : new THREE.Box3()
  const headCentre = headBox.getCenter(new THREE.Vector3())
  ok(`${type}: a cabeça fica na frente do aparelho`, headCentre.z > box.min.z + size.z * 0.6,
    `centro em z ${round(headCentre.z)} de ${round(box.min.z)}…${round(box.max.z)}`)
  ok(`${type}: a cabeça chega à face frontal`, Math.abs(headBox.max.z - box.max.z) < 3, `${round(headBox.max.z)} vs ${round(box.max.z)} mm`)
  // A frente do aparelho é toda cabeça: nenhuma malha do corpo ocupa o último quarto.
  const front = box.max.z - size.z * 0.25
  let frontPoints = 0, frontInBody = 0
  const probe = new THREE.Vector3()
  const headMeshes = new Set<THREE.Object3D>()
  head?.traverse((node) => { if ((node as THREE.Mesh).isMesh) headMeshes.add(node) })
  part.traverse((node) => {
    const mesh = node as THREE.Mesh
    if (!mesh.isMesh || !mesh.visible || headMeshes.has(mesh)) return
    const position = mesh.geometry.getAttribute('position')
    if (!position) return
    const stride = Math.max(1, Math.floor(position.count / 400))
    for (let index = 0; index < position.count; index += stride) {
      probe.fromBufferAttribute(position, index).applyMatrix4(mesh.matrixWorld)
      if (probe.z > front) frontInBody += 1
    }
  })
  part.traverse((node) => {
    const mesh = node as THREE.Mesh
    if (!mesh.isMesh || !mesh.visible) return
    const position = mesh.geometry.getAttribute('position')
    if (!position) return
    const stride = Math.max(1, Math.floor(position.count / 400))
    for (let index = 0; index < position.count; index += stride) {
      probe.fromBufferAttribute(position, index).applyMatrix4(mesh.matrixWorld)
      if (probe.z > front) frontPoints += 1
    }
  })
  ok(`${type}: nada do corpo fica na frente`, frontInBody <= frontPoints * 0.02, `${frontInBody} de ${frontPoints} pontos`)

  // 2) Controlo: variável «pressed» + botão ligado à cabeça, com curso e retenção.
  const variable = (draft.def.vars ?? []).find((item) => item.id === 'pressed')
  ok(`${type}: variável «pressed» no rascunho`, !!variable && variable.type === 'bool' && variable.initial === false)
  const control = (draft.def.controls ?? []).find((item) => item.nodes?.includes(ACTUATOR_HEAD_NAME))
  ok(`${type}: controlo ligado à cabeça`, !!control, control ? `${control.name} · ${control.kind}` : 'em falta')
  ok(`${type}: controlo com retenção (emergência encrava)`, control?.returnMode === 'latch')
  ok(`${type}: controlo empurra no eixo do botão`, !!control && control.axis[2] > 0.9)
  ok(`${type}: curso entre 2 e 6 mm`, !!control && control.travelMm >= 2 && control.travelMm <= 6, `${control?.travelMm} mm`)

  // 3) Animação: com a variável a true, a cabeça afunda o curso; a false, volta.
  const motion = normalizeMotion(control?.motion)
  ok(`${type}: animação por deslize (sem bascular)`, motion.mode === 'slide', motion.mode)
  ok(`${type}: sem ângulo parasita`, motionAngle(motion, 0) === 0 && motionAngle(motion, 1) === 0)
  const restZ = head ? head.position.z : 0
  const travel = control ? control.travelMm : 0
  ok(`${type}: curso desloca a cabeça para dentro`, restZ - travel < restZ, `${round(restZ)} → ${round(restZ - travel)} mm`)

  // 4) Bornes no bloco, atrás: a face «back» e a profundidade perto de 0.
  const spots = REAL_TERMINALS[type] ?? []
  ok(`${type}: 21/22 declarados atrás`, spots.length >= 2 && spots.every((spot) => spot.face === 'back' && spot.z < 0.05),
    spots.map((spot) => `${spot.label}:${spot.face}@${spot.z}`).join(' '))
  const component = createComponent(type)
  ok(`${type}: simulador e editor com os mesmos bornes`,
    component.terminals.map((item) => item.label).sort().join(',') === draft.def.terminals.map((item) => item.label).sort().join(','))
  const runtime = component.terminals.find((item) => item.label === '21')?.position3D
  ok(`${type}: borne 21 encostado à traseira no simulador`, !!runtime && runtime.z < 0.05, runtime ? `z ${round(runtime.z)}` : 'sem posição')

  // 4b) Painel 3D do simulador: mesmo controlo, mas com o modelo a 1/100.
  const built = buildDefinitionObject(draft.def, cache)
  const scaled = new THREE.Group()
  scaled.add(built)
  scaled.scale.setScalar(PANEL_UNITS_PER_MM)
  scaled.updateMatrixWorld(true)
  const panel = prepareActuatorHead(scaled, draft.def, PANEL_UNITS_PER_MM)
  const panelControl = (panel.definition.controls ?? []).find((item) => item.nodes?.includes(ACTUATOR_HEAD_NAME))
  ok(`${type}: painel — cabeça separada no modelo a 1/100`, !!panel.head && !!panelControl)
  ok(`${type}: painel — curso convertido (${panelControl?.travelMm} unidades)`,
    !!panelControl && Math.abs(panelControl.travelMm - 4 * PANEL_UNITS_PER_MM) < 0.001)
  const panelRig = new ComponentRig(panel.definition, scaled, null)
  const panelHead = built.getObjectByName(ACTUATOR_HEAD_NAME) ?? scaled.getObjectByName(ACTUATOR_HEAD_NAME)!
  const restPanel = panelHead.position.z
  panelRig.hold(panelControl!.id, true)
  for (let step = 0; step < 90; step += 1) panelRig.update(1 / 60)
  ok(`${type}: painel — a cabeça afunda o curso certo`, Math.abs((restPanel - panelHead.position.z) - 4 * PANEL_UNITS_PER_MM) < 0.0005,
    `${(restPanel - panelHead.position.z).toFixed(3)} de ${(4 * PANEL_UNITS_PER_MM).toFixed(3)} unidades`)

  // 5) Rascunhos antigos ganham o mesmo controlo, uma única vez.
  const legacy = JSON.parse(JSON.stringify(draft.def))
  legacy.builtinSeeds = []
  legacy.controls = []
  legacy.vars = []
  const upgraded = await upgradeBuiltinDraft(type, legacy)
  ok(`${type}: rascunho antigo recebe o controlo`, !!upgraded && (upgraded.controls ?? []).some((item) => item.nodes?.includes(ACTUATOR_HEAD_NAME)))
  const again = await upgradeBuiltinDraft(type, upgraded!)
  ok(`${type}: o upgrade é idempotente`, !again)
}

console.log(`PASS — ${checks} verificações do botão de emergência`)
