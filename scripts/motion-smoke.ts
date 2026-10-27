/**
 * Verificações do movimento de botões/interruptores (`src/catalog/controlMotion.ts` + `ComponentRig`).
 * Corre sem navegador: `npm run test:motion`.
 */
import * as THREE from 'three'
import { ComponentRig } from '../src/catalog/componentRig'
import { extractBreakerHandle } from '../src/three/breakerHandle'
import { BREAKER_HANDLE_RIG } from '../src/three/modelPaths'
import {
  applyPreset, BUILTIN_PRESETS, DEFAULT_TILT, inferBreakerAxes, motionAngle, normalizeMotion, pivotFromBox, relFromPoint, stepSpring, tiltControlPatch,
} from '../src/catalog/controlMotion'
import type { ComponentDefinition, ControlDef, ControlMotion, Vec3 } from '../src/catalog/types'

let failures = 0
function check(label: string, ok: boolean, extra = '') {
  console.log(`${ok ? 'ok   ' : 'FALHA'} · ${label}${extra ? ` — ${extra}` : ''}`)
  if (!ok) failures += 1
}
const near = (a: number, b: number, eps = 1e-3) => Math.abs(a - b) <= eps

/* ----------------------------------------------------------------- normalização */
const bad = normalizeMotion({ mode: 'tilt', angleOn: 9999, angleOff: NaN, durationMs: -5, feel: 'x' as ControlMotion['feel'], pivotRel: [9, 9] as unknown as Vec3 })
check('ângulos fora de limites são cortados a ±180°', bad.angleOn === 180 && bad.angleOff === -180, `${bad.angleOff}/${bad.angleOn}`)
check('duração mínima de 40 ms e feel inválido vira «snap»', bad.durationMs === 40 && bad.feel === 'snap')
check('pivô incompleto é completado e limitado', bad.pivotRel.length === 3 && bad.pivotRel[0] === 1.5 && bad.pivotRel[2] === 0.5, bad.pivotRel.join(','))
check('sem dados = deslizar (compatível com controlos antigos)', normalizeMotion(undefined).mode === 'slide')
check('ângulo interpola OFF→ON e extrapola no ressalto', near(motionAngle(DEFAULT_TILT, 0), 9) && near(motionAngle(DEFAULT_TILT, 1), -9) && near(motionAngle(DEFAULT_TILT, 1.1), -9 - 1.8))

/* ------------------------------------------------------------------------ pivô */
const min: Vec3 = [0, 0, 0], max: Vec3 = [10, 20, 40]
const rel = relFromPoint(min, max, [5, 20, 10])
check('pivô relativo ↔ absoluto é reversível', pivotFromBox(min, max, rel).every((v, i) => near(v, [5, 20, 10][i])), rel.join(','))
check('eixo sem espessura fica a meio (50 %)', relFromPoint([0, 0, 0], [10, 0, 10], [3, 7, 3])[1] === 0.5)
check('o mesmo pivô relativo adapta-se a um manípulo maior', pivotFromBox([0, 0, 0], [20, 40, 80], rel)[1] === 40)

/* ------------------------------------------------------------------------- mola */
function simulate(feel: ControlMotion['feel'], durationMs: number, seconds = 2) {
  const state = { value: 0, velocity: 0 }
  let peak = 0, settledAt = -1
  for (let t = 0; t < seconds; t += 1 / 60) {
    const moving = stepSpring(state, 1, 1 / 60, feel, durationMs)
    peak = Math.max(peak, state.value)
    if (!moving && settledAt < 0) settledAt = t
  }
  return { peak, settledAt, final: state.value }
}
const snap = simulate('snap', 280)
check('mola: ultrapassa o alvo (ressalto) mas não demais', snap.peak > 1.02 && snap.peak < 1.35, `pico ${snap.peak.toFixed(3)}`)
check('mola: assenta exatamente em 1 e para', snap.final === 1 && snap.settledAt > 0 && snap.settledAt < 1.5, `parou aos ${snap.settledAt.toFixed(2)} s`)
const smooth = simulate('smooth', 330)
check('suave: nunca ultrapassa o alvo', smooth.peak <= 1 && smooth.final === 1, `pico ${smooth.peak}`)
const inst = simulate('instant', 100)
check('instantâneo: salta logo', inst.final === 1 && inst.settledAt <= 1 / 60 + 1e-9)
const coarse = { value: 0, velocity: 0 }
stepSpring(coarse, 1, 5, 'snap', 280) // quadro muito longo (aba em segundo plano) não pode explodir
check('quadro de 5 s não faz a mola divergir', Number.isFinite(coarse.value) && Math.abs(coarse.value) < 3, coarse.value.toFixed(3))

/* ------------------------------------------------------------- inferência de eixos */
// disjuntor tripolar na vertical (valores de um MDW): entradas em cima, saídas em baixo, 3 polos em Z
const terminals: Vec3[] = [[0, 30, -17.5], [0, 30, 0], [0, 30, 17.5], [0, -30, -17.5], [0, -30, 0], [0, -30, 17.5]]
const axes = inferBreakerAxes(terminals)
check('tripolar: vertical=Y, polos=Z, profundidade=X', !!axes && axes.throw[1] === 1 && axes.pole[2] === 1 && axes.depth[0] === 1 && axes.confidence === 'high', axes?.reason)
const rotated = inferBreakerAxes(terminals.map(([x, y, z]): Vec3 => [y, x, z])) // mesmo disjuntor exportado com X↔Y trocados
check('mesmo disjuntor com eixos trocados: polos continuam em Z', rotated?.pole[2] === 1 && rotated.throw[0] === 1)
const mono = inferBreakerAxes([[0, 30, 0], [0, -30, 0]])
check('monopolar: confiança baixa (só um polo)', mono?.confidence === 'low', mono?.reason)
check('sem bornes não inventa eixos', inferBreakerAxes([]) === null && inferBreakerAxes([[1, 1, 1]]) === null)

/* ------------------------------------------------------------------------- rig */
function buildRig(control: Partial<ControlDef>) {
  const root = new THREE.Group()
  const part = new THREE.Group(); part.name = 'p'
  const handle = new THREE.Mesh(new THREE.BoxGeometry(10, 10, 10), new THREE.MeshBasicMaterial())
  handle.name = 'H'; handle.position.set(0, 5, 0) // ocupa y ∈ [0, 10]
  part.add(handle); root.add(part)
  const full: ControlDef = {
    id: 'c', name: 'Liga / desliga', kind: 'toggle', partId: 'p', nodes: ['H'], axis: [0, 0, 1], travelMm: 0, positions: [], bindVar: 'closed',
    actions: [{ type: 'toggleVar', var: 'closed' }], ...control,
  }
  const def = { controls: [full], displays: [], parts: [], terminals: [], lights: [], materials: [] } as unknown as ComponentDefinition
  const rig = new ComponentRig(def, root)
  const topWorld = () => { root.updateMatrixWorld(true); return handle.localToWorld(new THREE.Vector3(0, 5, 0)) } // centro da face de cima
  const baseWorld = () => { root.updateMatrixWorld(true); return handle.localToWorld(new THREE.Vector3(0, -5, 0)) } // centro da face de baixo
  return { rig, handle, topWorld, baseWorld }
}

{ // basculante com pivô na base
  const { rig, topWorld, baseWorld } = buildRig({ motion: { ...DEFAULT_TILT, pivotRel: [0.5, 0, 0.5] } })
  rig.setVars({ closed: true }); rig.snap()
  const top = topWorld(), base = baseWorld()
  check('pivô na base: a base não sai do sítio ao bascular', near(base.x, 0) && near(base.y, 0), `base=(${base.x.toFixed(3)}, ${base.y.toFixed(3)})`)
  check('ON: o topo roda −9° à volta do pivô (comprimento mantido)', near(top.x, 10 * Math.sin(THREE.MathUtils.degToRad(9))) && near(Math.hypot(top.x, top.y), 10), `topo=(${top.x.toFixed(3)}, ${top.y.toFixed(3)})`)
  rig.setVars({ closed: false }); rig.snap()
  check('OFF: o topo roda +9° para o lado oposto', near(topWorld().x, -10 * Math.sin(THREE.MathUtils.degToRad(9))), `x=${topWorld().x.toFixed(3)}`)
  const pivot = rig.pivotOf('c')!
  check('pivô exposto ao editor = caixa × pivô relativo', near(pivot.x, 0) && near(pivot.y, 0) && near(pivot.z, 0), pivot.toArray().join(','))
  const box = rig.restBox('c')!
  check('caixa de repouso do manípulo = 10×10×10', near(box.getSize(new THREE.Vector3()).y, 10) && near(box.min.y, 0))
}
{ // pivô ao centro
  const { rig, baseWorld, topWorld } = buildRig({ motion: { ...DEFAULT_TILT } })
  rig.setVars({ closed: true }); rig.snap()
  check('pivô ao centro: topo e base deslocam-se em sentidos opostos', baseWorld().x < -0.5 && topWorld().x > 0.5 && near(baseWorld().x, -topWorld().x))
}
{ // deslizar (comportamento antigo intacto)
  const { rig, topWorld } = buildRig({ axis: [1, 0, 0], travelMm: 8 })
  rig.setVars({ closed: false }); rig.snap()
  check('deslizar OFF: sem deslocamento', near(topWorld().x, 0))
  rig.setVars({ closed: true }); rig.snap()
  check('deslizar ON: desloca −8 mm no eixo (igual ao motor antigo)', near(topWorld().x, -8), `x=${topWorld().x.toFixed(3)}`)
}
{ // animação gradual com ressalto
  const { rig, topWorld } = buildRig({ motion: { ...DEFAULT_TILT, pivotRel: [0.5, 0, 0.5] } })
  rig.setVars({ closed: false }); rig.snap()
  rig.setVars({ closed: true })
  const target = 10 * Math.sin(THREE.MathUtils.degToRad(9))
  let peak = -Infinity, frames = 0
  while (rig.update(1 / 60) && frames < 600) { peak = Math.max(peak, topWorld().x); frames += 1 }
  check('transição OFF→ON anima várias frames, ultrapassa e assenta', frames > 5 && frames < 120 && peak > target && near(topWorld().x, target), `${frames} frames, pico x=${peak.toFixed(2)} (alvo ${target.toFixed(2)})`)
  check('dispose repõe a pose original do modelo', (() => { rig.dispose(); return near(topWorld().x, 0) && near(topWorld().y, 10) })())
}

{ // manípulo com cubo fora do centro da caixa (PKZM C-10, ver `DC-ADR-058`)
  const root = new THREE.Group()
  const part = new THREE.Group(); part.name = 'p'
  const bar = new THREE.Mesh(new THREE.BoxGeometry(30, 20, 8), new THREE.MeshBasicMaterial())
  bar.name = 'H'; bar.position.set(0, 0, 0) // caixa x ∈ [-15, 15], y ∈ [-10, 10]
  part.add(bar); root.add(part)
  const def = {
    controls: [{
      id: 'c', name: 'Liga / desliga', kind: 'toggle', partId: 'p', nodes: ['H'], axis: [0, 0, 1], travelMm: 0, positions: [], bindVar: 'closed',
      actions: [{ type: 'toggleVar', var: 'closed' }],
      // cubo a (5, 0): 66,67 % em x, 50 % em y
      motion: { mode: 'tilt', angleOff: 0, angleOn: 90, pivotRel: [2 / 3, 0.5, 0.5], durationMs: 280, feel: 'snap' },
    }],
    displays: [], parts: [], terminals: [], lights: [], materials: [],
  } as unknown as ComponentDefinition
  const rig = new ComponentRig(def, root)
  const hub = new THREE.Vector3(5, 0, 0)
  const hubWorld = () => { root.updateMatrixWorld(true); return bar.localToWorld(hub.clone()) }
  const before = hubWorld()
  rig.setVars({ closed: true }); rig.snap()
  const after = hubWorld()
  check('cubo fora do centro: o cubo fica no sítio ao rodar 90°', near(after.x, before.x, 0.01) && near(after.y, before.y, 0.01), `(${after.x.toFixed(2)}, ${after.y.toFixed(2)})`)
  check('cubo fora do centro: o braço roda mesmo (topo vai para o lado)', (() => { root.updateMatrixWorld(true); const tip = bar.localToWorld(new THREE.Vector3(15, 0, 0)); return near(tip.x, 5, 0.01) && near(tip.y, 10, 0.01) })(), '')
}

{ // a rig é reconstruída sobre um modelo já animado (o bug do manípulo a orbitar)
  const { rig, handle } = buildRig({ motion: { ...DEFAULT_TILT, pivotRel: [0.5, 0.3, 0.5] } })
  const first = rig.pivotOf('c')!.clone()
  const firstBox = rig.restBox('c')!.clone()
  rig.setVars({ closed: true }); rig.snap()
  const def = (rig as unknown as { def: ComponentDefinition }).def
  const root = (rig as unknown as { root: THREE.Object3D }).root
  const again = new ComponentRig(def, root)
  const second = again.pivotOf('c')!
  const secondBox = again.restBox('c')!
  check('rig reconstruída sobre modelo animado mede o mesmo pivô', near(second.x, first.x) && near(second.y, first.y) && near(second.z, first.z), `${first.toArray().map((n) => n.toFixed(2))} vs ${second.toArray().map((n) => n.toFixed(2))}`)
  check('rig reconstruída sobre modelo animado mede a mesma caixa de repouso', near(secondBox.min.y, firstBox.min.y) && near(secondBox.max.x, firstBox.max.x), `${firstBox.min.y.toFixed(2)} vs ${secondBox.min.y.toFixed(2)}`)
  check('o manípulo continua pousado na pose de repouso ao reconstruir', (() => { root.updateMatrixWorld(true); const centre = handle.localToWorld(new THREE.Vector3(0, 0, 0)); return near(centre.y, 5) })())
}

{ // painel 3D: a charneira do manípulo marcado é o cubo, não o centro da caixa do manípulo
  const frame = new THREE.Group()
  const model = new THREE.Group()
  frame.add(model)
  const add = (name: string, size: [number, number, number], position: [number, number, number]) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), new THREE.MeshStandardMaterial())
    mesh.name = name; mesh.position.set(...position); model.add(mesh)
    return mesh
  }
  add('body', [40, 90, 10], [0, 0, 5])
  // Proporções do PKZM C-10: alavanca 29,755 × 22 mm com o cubo (15,5 mm) a 42,6 % da caixa,
  // logo 2,22 mm à esquerda do centro da caixa conjunta do manípulo.
  add('dcsimu_handle_1', [29.755, 22, 8], [0, 0, 14])
  const collar = add('dcsimu_handle_2', [15.5, 15.5, 8.2], [-2.22, 0, 14])
  model.updateMatrixWorld(true)
  const hubBefore = new THREE.Box3().setFromObject(collar).getCenter(new THREE.Vector3())
  const handle = extractBreakerHandle(model, frame, BREAKER_HANDLE_RIG.motorBreakerPkzmC10?.hinge)
  check('painel 3D: a charneira fica no cubo redondo, não no centro da alavanca', !!handle && near(handle.pivot.position.x, hubBefore.x, 0.05), handle ? `charneira x=${handle.pivot.position.x.toFixed(2)}, cubo x=${hubBefore.x.toFixed(2)}` : '')
  if (handle) {
    handle.pivot.rotation.z = Math.PI / 2
    frame.updateMatrixWorld(true)
    const hubAfter = new THREE.Box3().setFromObject(collar).getCenter(new THREE.Vector3())
    check('painel 3D: rodar 90° mantém o cubo no sítio', near(hubAfter.x, hubBefore.x, 0.05) && near(hubAfter.y, hubBefore.y, 0.05), `(${hubAfter.x.toFixed(2)}, ${hubAfter.y.toFixed(2)})`)
  }
}

/* ------------------------------------------------------------------ automação */
const patch = tiltControlPatch(axes)
check('conversão automática usa o eixo dos polos', patch.axis[2] === 1 && patch.motion?.mode === 'tilt')
const base: ControlDef = { id: 'c2', name: 'Outro', kind: 'toggle', partId: 'p', nodes: ['Alavanca'], axis: [1, 0, 0], travelMm: 8, positions: [], actions: [{ type: 'toggleVar', var: 'closed' }] }
const applied = applyPreset(base, BUILTIN_PRESETS[0], axes)
check('predefinição mantém objetos e ações e troca o movimento', applied.nodes?.[0] === 'Alavanca' && applied.actions.length === 1 && applied.motion?.mode === 'tilt' && applied.travelMm === 0)
check('predefinição usa o eixo dos bornes do destino quando fiáveis', applyPreset(base, BUILTIN_PRESETS[0], rotated).axis[2] === 1)
const fallback = applyPreset(base, { ...BUILTIN_PRESETS[0], axis: [0, 1, 0] }, mono)
check('com bornes pouco fiáveis mantém o eixo do preset', fallback.axis[1] === 1)

if (failures) { console.error(`\n${failures} verificação(ões) falharam.`); process.exit(1) }
console.log('\nTodas as verificações passaram.')
