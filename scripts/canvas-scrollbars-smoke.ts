import assert from 'node:assert/strict'
import * as THREE from 'three'
import { canvasScrollAxis, canvasScrollThumb, clampCanvasScroll } from '../src/ui/canvasScroll'
import { cameraScrollMetrics, panCameraToScroll } from '../src/three/cameraScroll'

let checks = 0
const check = (ok: unknown, message: string) => { assert.ok(ok, message); console.log(`PASS — ${message}`); checks++ }
const empty = canvasScrollAxis(0, 0, -100, 200)
check(empty.min < empty.value && empty.max > empty.value, 'desenho vazio tem margem navegável nos dois sentidos')
const negative = canvasScrollAxis(-5000, 300, 0, 400)
check(negative.min <= -5000 && negative.max >= 300, 'coordenadas negativas do conteúdo são alcançáveis pelas barras')
const panned = canvasScrollAxis(-50, 400, 5000, 200)
check(panned.value <= panned.max && panned.value >= panned.min, 'pan exterior ao conteúdo continua representado na calha')
const large = canvasScrollAxis(-1e6, 1e6, 0, 10)
check(canvasScrollThumb(large, 300).length >= 28 && canvasScrollThumb(large, 12).length <= 12, 'polegar mantém alvo utilizável sem exceder uma calha pequena')
check(clampCanvasScroll(-1e9, negative) === negative.min && clampCanvasScroll(1e9, negative) === negative.max, 'teclado e arrasto respeitam os limites do gesto')
const bounds = { minX: -3, minY: -2, minZ: -1, maxX: 4, maxY: 3, maxZ: 2 }
for (const [label, position, up] of [
  ['frontal', [0, 0, 10], [0, 1, 0]], ['ISO', [7, 5, 8], [0, 1, 0]],
  ['lateral', [10, 0, 0], [0, 1, 0]], ['superior', [0, 10, 0.01], [0, 0, -1]],
] as const) {
  const camera = new THREE.PerspectiveCamera(44, 1.6, 0.1, 100)
  const target = new THREE.Vector3()
  camera.position.set(...position); camera.up.set(...up); camera.lookAt(target)
  const distance = camera.position.distanceTo(target), orientation = camera.quaternion.clone(), zoom = camera.zoom
  const before = cameraScrollMetrics(camera, target, { width: 800, height: 500 }, bounds)
  const wanted = { x: before.view.x + 1.7, y: before.view.y - 0.8 }
  panCameraToScroll(camera, target, before.view, wanted)
  const after = cameraScrollMetrics(camera, target, { width: 800, height: 500 }, bounds)
  check(Math.abs(after.view.x - wanted.x) < 1e-8 && Math.abs(after.view.y - wanted.y) < 1e-8, `${label}: deslocamento acompanha os eixos do ecrã`)
  check(Math.abs(camera.position.distanceTo(target) - distance) < 1e-8 && orientation.angleTo(camera.quaternion) < 1e-7 && camera.zoom === zoom, `${label}: pan conserva orientação, distância e zoom`)
  check(Math.abs(before.view.width - after.view.width) < 1e-8 && Object.values(after.bounds).every(Number.isFinite), `${label}: limites projetados e área visível mantêm-se válidos`)
}
console.log(`${checks} verificações de barras de deslocamento passaram.`)
