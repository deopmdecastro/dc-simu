/**
 * Modelos 3D procedurais da família SIMATIC S7-300:
 *  - CPU 315-2 PN/DP · 6ES7315-2EH14-0AB0 (40 × 125 × 130 mm)
 *  - SM 321 DI 32×DC24V · 6ES7321-1BL00-0AA0 (40 × 125 × 120 mm)
 *  - SM 322 DO 32×DC24V · 6ES7322-1BL00-0AA0 (40 × 125 × 120 mm)
 *  - SM 334 AI4/AO2 · 6ES7334-0CE01-0AA0 (40 × 125 × 120 mm)
 *
 * Acabamento: corpo RAL 7021, serigrafia branca, LEDs de estado, seletor
 * RUN/STOP/MRES (CPU), conector frontal 40 pólos (módulos), etiquetas MLFB.
 */
import * as THREE from 'three'
import type { ComponentType } from '../types'

export type S7300ModuleType =
  | 'plcSiemensS7300Cpu315PnDp'
  | 'plcSiemensS7300Sm321Di32'
  | 'plcSiemensS7300Sm322Do32'
  | 'plcSiemensS7300Sm334AiAo'

export const S7300_MODULE_DIMS: Record<S7300ModuleType, { w: number; h: number; d: number; orderNo: string; title: string }> = {
  plcSiemensS7300Cpu315PnDp: { w: 40, h: 125, d: 130, orderNo: '6ES7315-2EH14-0AB0', title: 'CPU 315-2 PN/DP' },
  plcSiemensS7300Sm321Di32: { w: 40, h: 125, d: 120, orderNo: '6ES7321-1BL00-0AA0', title: 'SM 321 DI 32×DC24V' },
  plcSiemensS7300Sm322Do32: { w: 40, h: 125, d: 120, orderNo: '6ES7322-1BL00-0AA0', title: 'SM 322 DO 32×DC24V' },
  plcSiemensS7300Sm334AiAo: { w: 40, h: 125, d: 120, orderNo: '6ES7334-0CE01-0AA0', title: 'SM 334 AI4/AO2' },
}

const BODY = '#4a4e53' // RAL 7021 aproximado
const BODY_DARK = '#3a3e43'
const BODY_LIGHT = '#5a5e63'
const TEAL = '#00b2a9' // Siemens accent
const LED_OFF = '#1a1f1a'
const LABEL_BG = '#2a2e32'

function mat(color: string, opts: { rough?: number; metal?: number; emissive?: string; emissiveIntensity?: number } = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: opts.rough ?? 0.55,
    metalness: opts.metal ?? 0.08,
    ...(opts.emissive ? { emissive: new THREE.Color(opts.emissive), emissiveIntensity: opts.emissiveIntensity ?? 0.6 } : {}),
  })
}

function box(w: number, h: number, d: number, color: string, opts?: Parameters<typeof mat>[1]) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color, opts))
  m.castShadow = true
  m.receiveShadow = true
  return m
}

function cyl(r: number, h: number, color: string, opts?: Parameters<typeof mat>[1], seg = 16) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), mat(color, opts))
  m.castShadow = true
  return m
}

/** Etiqueta de texto em canvas → textura no plano. */
function labelPlane(text: string, width: number, height: number, opts: { fontSize?: number; color?: string; bg?: string; weight?: string; align?: CanvasTextAlign } = {}) {
  const canvas = document.createElement('canvas')
  const scale = 8
  canvas.width = Math.max(32, Math.round(width * scale))
  canvas.height = Math.max(16, Math.round(height * scale))
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = opts.bg ?? 'transparent'
  if (opts.bg) ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = opts.color ?? '#e8eaed'
  ctx.font = `${opts.weight ?? '600'} ${Math.round((opts.fontSize ?? 3.2) * scale)}px system-ui,Segoe UI,sans-serif`
  ctx.textAlign = opts.align ?? 'left'
  ctx.textBaseline = 'middle'
  const x = opts.align === 'center' ? canvas.width / 2 : opts.align === 'right' ? canvas.width - 4 : 4
  const lines = text.split('\n')
  lines.forEach((line, i) => {
    const y = canvas.height / 2 + (i - (lines.length - 1) / 2) * (opts.fontSize ?? 3.2) * scale * 1.15
    ctx.fillText(line, x, y)
  })
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.7, metalness: 0, depthWrite: false }),
  )
  return mesh
}

function led(color: string, on: boolean) {
  const g = new THREE.Group()
  g.name = 's7300-led'
  const body = cyl(1.1, 1.2, on ? color : LED_OFF, on ? { emissive: color, emissiveIntensity: 0.85, rough: 0.3 } : { rough: 0.4 }, 12)
  body.rotation.x = Math.PI / 2
  body.name = 's7300-led-body'
  ;(body.userData as any).ledColor = color
  g.add(body)
  return g
}

function frontConnector40(w: number, h: number) {
  const g = new THREE.Group()
  g.name = 's7300-front-connector'
  // Corpo do conector 40 pólos (cinza claro Siemens)
  const shell = box(w * 0.92, h * 0.55, 8, '#c8ccd0', { rough: 0.45, metal: 0.15 })
  shell.position.z = 4
  g.add(shell)
  // Grelha de pinos (2 colunas × 20)
  for (let col = 0; col < 2; col++) {
    for (let row = 0; row < 20; row++) {
      const pin = box(1.4, 1.4, 2.2, '#8a8470', { metal: 0.7, rough: 0.25 })
      pin.position.set((col === 0 ? -1 : 1) * w * 0.22, h * 0.22 - row * (h * 0.48 / 19), 8.5)
      g.add(pin)
    }
  }
  return g
}

function dinRailClip(w: number, d: number) {
  const g = new THREE.Group()
  g.name = 's7300-din-clip'
  // Perfil de encaixe TS35 na traseira (−Z)
  const clip = box(w * 0.7, 12, 4, BODY_DARK, { rough: 0.5 })
  clip.position.set(0, -20, -d / 2 - 1)
  g.add(clip)
  const lip = box(w * 0.7, 3, 6, BODY_DARK, { rough: 0.5 })
  lip.position.set(0, -26, -d / 2 + 1)
  g.add(lip)
  return g
}

function siemensBadge(w: number) {
  const badge = labelPlane('SIEMENS', Math.min(18, w * 0.55), 4.5, {
    fontSize: 2.4, color: '#0a0a0a', bg: TEAL, weight: '800', align: 'center',
  })
  badge.name = 's7300-siemens-badge'
  return badge
}

/** CPU 315-2 PN/DP — painel com LEDs, seletor, MMC, MPI/DP e 2×RJ45. */
function buildCpuPnDp(dims: { w: number; h: number; d: number; orderNo: string; title: string }): THREE.Group {
  const root = new THREE.Group()
  root.name = 'plcSiemensS7300Cpu315PnDp'
  const { w, h, d } = dims
  // Corpo principal
  const body = box(w, h, d, BODY, { rough: 0.48, metal: 0.12 })
  body.name = 's7300-body'
  root.add(body)
  // Grelha de ventilação no topo
  for (let i = 0; i < 6; i++) {
    const slot = box(w * 0.7, 1.2, 8, BODY_DARK, { rough: 0.6 })
    slot.position.set(0, h / 2 - 2, -d / 2 + 18 + i * 10)
    root.add(slot)
  }
  // Painel frontal superior (zona LEDs + seletor)
  const frontTop = box(w - 1, h * 0.42, 2.5, BODY_LIGHT, { rough: 0.5 })
  frontTop.position.set(0, h * 0.22, d / 2 - 0.5)
  root.add(frontTop)
  // LEDs SF BF1 BF2 DC5V FRCE RUN STOP (coluna esquerda + direita)
  const ledDefs: Array<{ name: string; x: number; y: number; color: string }> = [
    { name: 'SF', x: -w * 0.28, y: h * 0.38, color: '#ef4444' },
    { name: 'BF1', x: -w * 0.28, y: h * 0.32, color: '#ef4444' },
    { name: 'BF2', x: -w * 0.28, y: h * 0.26, color: '#ef4444' },
    { name: 'DC5V', x: -w * 0.28, y: h * 0.20, color: '#22c55e' },
    { name: 'FRCE', x: -w * 0.28, y: h * 0.14, color: '#3b82f6' },
    { name: 'RUN', x: w * 0.28, y: h * 0.32, color: '#22c55e' },
    { name: 'STOP', x: w * 0.28, y: h * 0.24, color: '#f97316' },
  ]
  ledDefs.forEach((L) => {
    const g = led(L.color, L.name === 'STOP')
    g.name = `led-${L.name}`
    g.position.set(L.x, L.y, d / 2 + 1.2)
    root.add(g)
    const tag = labelPlane(L.name, 7, 2.2, { fontSize: 1.6, color: '#c8ccd0', align: 'left' })
    tag.position.set(L.x + (L.x < 0 ? 5.5 : -5.5), L.y, d / 2 + 1.5)
    root.add(tag)
  })
  // Seletor de modo RUN / STOP / MRES
  const modeBase = box(14, 10, 3, BODY_DARK, { rough: 0.4 })
  modeBase.position.set(0, h * 0.05, d / 2 + 0.5)
  root.add(modeBase)
  const knob = cyl(2.8, 4, '#2a2e32', { metal: 0.4, rough: 0.3 }, 16)
  knob.rotation.x = Math.PI / 2
  knob.position.set(0, h * 0.05, d / 2 + 3.5)
  knob.name = 's7300-mode-knob'
  root.add(knob)
  const modeLabel = labelPlane('RUN\nSTOP\nMRES', 10, 9, { fontSize: 1.8, color: '#d0d4d8', align: 'center' })
  modeLabel.position.set(0, h * 0.05, d / 2 + 2.2)
  root.add(modeLabel)
  // Slot MMC
  const mmc = box(w * 0.55, 8, 2, '#1a1e22', { rough: 0.6 })
  mmc.position.set(0, -h * 0.08, d / 2 + 0.3)
  root.add(mmc)
  const mmcLabel = labelPlane('MMC', 8, 2.5, { fontSize: 1.8, color: '#9ca3af', align: 'center' })
  mmcLabel.position.set(0, -h * 0.08, d / 2 + 1.5)
  root.add(mmcLabel)
  // Badge SIEMENS
  const badge = siemensBadge(w)
  badge.position.set(0, h * 0.42, d / 2 + 1.6)
  root.add(badge)
  // Título CPU
  const title = labelPlane(dims.title, w * 0.9, 4, { fontSize: 2.0, color: '#e5e7eb', align: 'center' })
  title.position.set(0, h * 0.48, d / 2 + 1.6)
  root.add(title)
  // Porta inferior SIMATIC S7-300
  const door = box(w - 1.5, h * 0.28, 2, BODY_LIGHT, { rough: 0.5 })
  door.position.set(0, -h * 0.28, d / 2 - 0.3)
  root.add(door)
  const simatic = labelPlane('SIMATIC\nS7-300', w * 0.8, 10, { fontSize: 2.6, color: '#e5e7eb', align: 'center', weight: '700' })
  simatic.position.set(0, -h * 0.26, d / 2 + 1.2)
  root.add(simatic)
  // Conector MPI/DP (DB9)
  const db9 = box(12, 6, 5, '#1f2937', { metal: 0.5, rough: 0.35 })
  db9.position.set(0, -h * 0.42, d / 2 + 1)
  root.add(db9)
  // 2× RJ45 PROFINET (lado direito inferior)
  for (let i = 0; i < 2; i++) {
    const rj = box(8, 6, 7, '#111827', { rough: 0.4 })
    rj.position.set(w / 2 - 2, -h * 0.15 - i * 10, d / 2 - 20)
    rj.rotation.y = Math.PI / 2
    root.add(rj)
  }
  // MLFB
  const mlfb = labelPlane(dims.orderNo, w * 0.95, 3.5, { fontSize: 1.7, color: '#9ca3af', align: 'center' })
  mlfb.position.set(0, -h / 2 + 4, d / 2 + 1.5)
  root.add(mlfb)
  // Número de slot «2»
  const slot = labelPlane('2', 6, 6, { fontSize: 3.5, color: '#e5e7eb', bg: '#1f2937', align: 'center', weight: '800' })
  slot.position.set(-w / 2 + 5, -h / 2 + 8, d / 2 + 1.5)
  root.add(slot)
  root.add(dinRailClip(w, d))
  return root
}

/** Módulo de E/S genérico (SM321 / SM322 / SM334). */
function buildIoModule(
  type: S7300ModuleType,
  dims: { w: number; h: number; d: number; orderNo: string; title: string },
  ledCount: number,
  ledColor: string,
): THREE.Group {
  const root = new THREE.Group()
  root.name = type
  const { w, h, d } = dims
  const body = box(w, h, d, BODY, { rough: 0.48, metal: 0.12 })
  body.name = 's7300-body'
  root.add(body)
  // Faixa superior com título
  const header = box(w - 1, 14, 2, BODY_LIGHT, { rough: 0.5 })
  header.position.set(0, h / 2 - 9, d / 2 - 0.5)
  root.add(header)
  const badge = siemensBadge(w)
  badge.position.set(0, h / 2 - 6, d / 2 + 1.4)
  root.add(badge)
  const title = labelPlane(dims.title, w * 0.92, 5, { fontSize: 1.7, color: '#e5e7eb', align: 'center' })
  title.position.set(0, h / 2 - 14, d / 2 + 1.4)
  root.add(title)
  // LEDs de canal (2 colunas)
  const cols = 2
  const rows = Math.ceil(ledCount / cols)
  const ledAreaH = h * 0.55
  const startY = h * 0.28
  for (let i = 0; i < ledCount; i++) {
    const col = i < rows ? 0 : 1
    const row = i % rows
    const g = led(ledColor, false)
    g.name = `led-ch-${i}`
    g.position.set((col === 0 ? -1 : 1) * w * 0.22, startY - row * (ledAreaH / Math.max(rows - 1, 1)), d / 2 + 1.1)
    root.add(g)
  }
  // Conector frontal 40 pólos (zona inferior)
  const conn = frontConnector40(w - 4, h * 0.35)
  conn.position.set(0, -h * 0.28, d / 2 - 2)
  root.add(conn)
  // MLFB
  const mlfb = labelPlane(dims.orderNo, w * 0.95, 3.2, { fontSize: 1.5, color: '#9ca3af', align: 'center' })
  mlfb.position.set(0, -h / 2 + 3.5, d / 2 + 1.4)
  root.add(mlfb)
  root.add(dinRailClip(w, d))
  return root
}

export function isS7300ModuleType(type: string): type is S7300ModuleType {
  return type in S7300_MODULE_DIMS
}

export function createS7300ModuleObject(type: S7300ModuleType): THREE.Group {
  const dims = S7300_MODULE_DIMS[type]
  if (type === 'plcSiemensS7300Cpu315PnDp') return buildCpuPnDp(dims)
  if (type === 'plcSiemensS7300Sm321Di32') return buildIoModule(type, dims, 32, '#22c55e')
  if (type === 'plcSiemensS7300Sm322Do32') return buildIoModule(type, dims, 32, '#22c55e')
  return buildIoModule(type, dims, 6, '#3b82f6') // SM334 — menos canais
}

/** Actualiza LEDs conforme o estado do componente. */
export function applyS7300ModuleState(root: THREE.Object3D, type: S7300ModuleType, state: Record<string, any>) {
  const powered = Boolean(state.powered)
  const mode = String(state.mode ?? 'STOP').toUpperCase()
  const running = mode === 'RUN' && powered
  const error = Boolean(state.ledSF) || Boolean(state.error)

  root.traverse((node) => {
    if (!(node instanceof THREE.Mesh) || node.name !== 's7300-led-body') return
    const parent = node.parent
    if (!parent) return
    const name = parent.name // led-SF, led-RUN, led-ch-0, …
    const color = (node.userData as any).ledColor as string || '#22c55e'
    let on = false
    if (name === 'led-SF') on = error
    else if (name === 'led-BF1') on = Boolean(state.ledBF1)
    else if (name === 'led-BF2') on = Boolean(state.ledBF2)
    else if (name === 'led-DC5V') on = powered
    else if (name === 'led-FRCE') on = Boolean(state.ledFRCE)
    else if (name === 'led-RUN') on = running
    else if (name === 'led-STOP') on = powered && !running
    else if (name.startsWith('led-ch-')) {
      const idx = Number(name.slice(7))
      if (type === 'plcSiemensS7300Sm321Di32') {
        const key = `I${Math.floor(idx / 8)}.${idx % 8}`
        on = powered && Boolean(state.inputs?.[key])
      } else if (type === 'plcSiemensS7300Sm322Do32') {
        const key = `Q${Math.floor(idx / 8)}.${idx % 8}`
        on = powered && Boolean(state.outputs?.[key])
      } else {
        on = powered && idx < 2
      }
    }
    const m = node.material as THREE.MeshStandardMaterial
    m.color.set(on ? color : LED_OFF)
    m.emissive.set(on ? color : '#000000')
    m.emissiveIntensity = on ? 0.85 : 0
  })
}

export function disposeS7300ModuleObject(root: THREE.Object3D) {
  root.traverse((node) => {
    const mesh = node as THREE.Mesh
    if (!mesh.isMesh) return
    mesh.geometry?.dispose()
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    for (const m of mats) {
      if (!m) continue
      const std = m as THREE.MeshStandardMaterial
      std.map?.dispose()
      std.dispose()
    }
  })
}

export function s7300ModuleTypes(): ComponentType[] {
  return Object.keys(S7300_MODULE_DIMS) as ComponentType[]
}
