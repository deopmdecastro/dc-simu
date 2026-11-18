import * as THREE from 'three'
import { atv320DisplayText, deviceLcdFrame, drawDeviceLcd } from './deviceLcd'
import { INDUSTRIAL_DEVICE_TYPES, GEYA_FUNCTIONS, GEYA_RANGES_MS, isIndustrialDevice, type IndustrialDeviceType } from '../electrical/industrialDevices'

/** Nomes funcionais iguais no Painel, no Admin e no GLB publicado. */
const ACTIONS: Record<string, string> = {
  industrial_encoder: 'enter', industrial_escape: 'escape', industrial_range: 'range',
  industrial_fraction: 'fraction', industrial_function: 'function', industrial_test: 'test',
  industrial_cover_latch: 'cover',
}
const prepared = new WeakSet<THREE.Object3D>()
const lcds = new WeakMap<THREE.Mesh, { canvas: HTMLCanvasElement; texture: THREE.CanvasTexture; signature: string }>()
const textures = new Map<string, Promise<THREE.Texture>>()

export function industrialTypeIn(root: THREE.Object3D): IndustrialDeviceType | null {
  let type: IndustrialDeviceType | null = null
  root.traverse(node => {
    const candidate = node.userData.industrialType ?? node.userData.sourceType
    if (!type && typeof candidate === 'string' && isIndustrialDevice(candidate)) type = candidate
    if (!type) type = INDUSTRIAL_DEVICE_TYPES.find(t => node.name === `industrial_device_${t}`) ?? null
  })
  return type
}

/** Só as peças reais têm manobra. Não cria caixas invisíveis sobre o corpo. */
export function prepareIndustrialModel(root: THREE.Object3D, type: IndustrialDeviceType): void {
  root.userData.industrialType = type
  root.traverse(node => {
    if (ACTIONS[node.name]) node.userData.industrialControl = ACTIONS[node.name]
    const mesh = node as THREE.Mesh
    if (!mesh.isMesh || prepared.has(node)) return
    const owned = node.name.startsWith('industrial_led_') || node.name === 'industrial_lcd' || node.name.endsWith('_label') || node.name.endsWith('_logo') || node.name.includes('_sticker') || node.name === 'industrial_fascia'
    if (owned) {
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(m => m.clone()) : mesh.material.clone()
      node.userData.protectionMarking = true // UVs de impressão, não projeção CAD genérica
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) material.userData.protectionMarking = true
    }
    if (node.name.startsWith('industrial_led_')) node.userData.industrialLens = true
    if (ACTIONS[node.name] || node.name === 'industrial_control_cover' || node.name === 'industrial_control_interior') node.userData.industrialMoving = true
    prepared.add(node)
  })
}

export function industrialAction(object: THREE.Object3D): string | null {
  for (let node: THREE.Object3D | null = object; node; node = node.parent) {
    if (typeof node.userData.industrialControl === 'string') return node.userData.industrialControl
  }
  return null
}

/** Variáveis derivadas (lâmpadas físicas); não altera o contrato elétrico. */
export function industrialLedVars(type: IndustrialDeviceType, s: Record<string, unknown>): Record<string, boolean> {
  if (type === 'vfdSchneiderAtv320') return { ledFault: !!s.powered && !!s.deviceFault, ledRun: !!s.powered && !!s.running, ledCan: false }
  if (type === 'timerGeyaGrt8M1' || type === 'timerGeyaGrt8B1') return { ledPower: !!s.powered, ledRelay: !!s.powered && !!s.energized }
  if (type === 'levelRelayAvel411') return {
    ledPower: !!s.powered, ledRelay: !!s.powered && !!s.energized,
    ledTankWater: !!s.powered && !!s.tankMinWet, ledTankDry: !!s.powered && !s.tankMinWet,
    ledWellWater: !!s.powered && !!s.wellReady, ledWellDry: !!s.powered && !s.wellReady,
  }
  return {}
}
export const INDUSTRIAL_LED_NODES: Record<string, string> = {
  industrial_led_fault: 'ledFault', industrial_led_run: 'ledRun', industrial_led_can: 'ledCan',
  industrial_led_power: 'ledPower', industrial_led_relay: 'ledRelay',
  industrial_led_tank_water: 'ledTankWater', industrial_led_tank_dry: 'ledTankDry',
  industrial_led_well_water: 'ledWellWater', industrial_led_well_dry: 'ledWellDry',
}

export function industrialDisplayText(s: Record<string, unknown>): string {
  return atv320DisplayText(s)
}

function redrawLcd(root: THREE.Object3D, s: Record<string, unknown>): void {
  const mesh = root.getObjectByName('industrial_lcd') as THREE.Mesh | undefined
  if (!mesh?.isMesh || typeof document === 'undefined') return
  let entry = lcds.get(mesh)
  if (!entry) {
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 128
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4
    entry = { canvas, texture, signature: '' }; lcds.set(mesh, entry)
    const material = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false })
    material.userData.protectionMarking = true
    for (const old of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) old.dispose()
    mesh.material = material
  }
  const frame = deviceLcdFrame('atv320', s), signature = JSON.stringify(frame)
  if (signature === entry.signature) return
  entry.signature = signature
  drawDeviceLcd(entry.canvas, frame)
  entry.texture.needsUpdate = true
}

export function applyIndustrialState(root: THREE.Object3D, type: IndustrialDeviceType, s: Record<string, unknown>, moveControls = true, drawLcd = true): void {
  prepareIndustrialModel(root, type)
  const led = industrialLedVars(type, s)
  for (const [name, variable] of Object.entries(INDUSTRIAL_LED_NODES)) {
    const mesh = root.getObjectByName(name) as THREE.Mesh | undefined
    if (!mesh?.isMesh) continue
    const on = !!led[variable], color = mesh.userData.ledColor ?? '#27b43d'
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      if (!(material instanceof THREE.MeshStandardMaterial)) continue
      material.color.set(color).multiplyScalar(on ? 1 : .3)
      material.emissive.set(on ? color : '#000000'); material.emissiveIntensity = on ? 1.3 : 0
    }
  }
  const cover = root.getObjectByName('industrial_control_cover'), interior = root.getObjectByName('industrial_control_interior')
  if (cover) cover.visible = !s.controlCoverOpen
  if (interior) interior.visible = !!s.controlCoverOpen
  // Rodar uma escala é diferente do impulso de um botão da rig genérica.
  const range = root.getObjectByName('industrial_range'), fraction = root.getObjectByName('industrial_fraction'), fn = root.getObjectByName('industrial_function')
  if (moveControls && range) range.rotation.z = -Math.max(0, GEYA_RANGES_MS.indexOf(Number(s.rangeMs) as never)) * Math.PI / 5
  if (moveControls && fraction) fraction.rotation.z = -Math.PI * 1.5 * (Math.max(.1, Math.min(1, Number(s.fraction) || .3)) - .1) / .9
  if (moveControls && fn) fn.rotation.z = -Math.max(0, GEYA_FUNCTIONS.indexOf(String(s.function) as never)) * Math.PI / 5
  if (moveControls) {
    const test = root.getObjectByName('industrial_test')
    if (test) {
      test.userData.restZ ??= test.position.z
      test.position.z = Number(test.userData.restZ) - (s.testPressed ? .001 : 0)
    }
  }
  if (drawLcd && type === 'vfdSchneiderAtv320') redrawLcd(root, s)
  const armature = root.getObjectByName('industrial_armature')
  if (armature) armature.rotation.x = s.energized ? -.07 : 0
  root.updateMatrixWorld(true)
}

const PRINTS: Partial<Record<IndustrialDeviceType, Record<string, string>>> = {
  timerGeyaGrt8M1: { industrial_fascia: 'geya-grt8-m-face.png' },
  timerGeyaGrt8B1: { industrial_fascia: 'geya-grt8-b-face.png' },
  levelRelayAvel411: { industrial_avel_label: 'avel-411-face.png' },
  relayFinder5534: { industrial_finder_label: 'finder-5534-label.png' },
  buzzerMetaltexTby301: { industrial_metaltex_label: 'metaltex-tby-label.png' },
  vfdSchneiderAtv320: { industrial_schneider_logo: '../../brands/schneider-electric.svg', industrial_product_sticker: 'atv320-product-label.png', industrial_altivar_label: 'atv320-altivar-label.png', industrial_danger_label: 'atv320-danger-label.png' },
}

function textureFor(url: string): Promise<THREE.Texture> {
  const hit = textures.get(url); if (hit) return hit
  const pending = new THREE.TextureLoader().loadAsync(url).then(texture => { texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4; return texture })
  textures.set(url, pending); pending.catch(() => textures.delete(url)); return pending
}

/** Impressos locais extraídos/cotados; a proveniência está em sources.json. */
export async function applyIndustrialTextures(root: THREE.Object3D, type: IndustrialDeviceType, isCancelled: () => boolean = () => false): Promise<void> {
  if (typeof document === 'undefined') return
  prepareIndustrialModel(root, type)
  await Promise.all(Object.entries(PRINTS[type] ?? {}).map(async ([name, file]) => {
    const mesh = root.getObjectByName(name) as THREE.Mesh | undefined
    if (!mesh?.isMesh) return
    const texture = await textureFor(new URL(file, `${location.origin}/models/industriais/`).pathname)
    if (isCancelled()) return
    for (const old of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) old.dispose()
    const material = new THREE.MeshStandardMaterial({ map: texture, color: '#ffffff', roughness: .56, metalness: 0, transparent: true, alphaTest: .04, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })
    material.userData.protectionMarking = true; material.userData.keepTransparent = true
    mesh.material = material
  }))
}

export function releaseIndustrialLcd(root: THREE.Object3D): void {
  const mesh = root.getObjectByName('industrial_lcd') as THREE.Mesh | undefined
  const entry = mesh ? lcds.get(mesh) : undefined
  if (entry && mesh) { entry.texture.dispose(); lcds.delete(mesh) }
}
