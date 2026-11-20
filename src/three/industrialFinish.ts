import * as THREE from 'three'
import { atv320DisplayText, deviceLcdFrame, drawDeviceLcd } from './deviceLcd'
import { INDUSTRIAL_DEVICE_TYPES, GEYA_FUNCTIONS, GEYA_RANGES_MS, isIndustrialDevice, type IndustrialDeviceType } from '../electrical/industrialDevices'
import { playClick } from '../audio/sfx'

/**
 * Cor de repouso de cada actuador XB2 (o mesmo tom do GLB publicado) e cor de
 * pressão. Premir uma botoeira real muda o que se vê: o disco desce 2 mm e a
 * cara fica na sombra do aro, e nos modelos iluminados acende. Aqui o disco
 * escurece/satura para o toque ser inequívoco, sem inventar iluminação que o
 * aparelho não tem (o KL-XB2 é luminoso só nas versões com lâmpada).
 */
const XB2_CAP_COLORS: Record<string, { rest: string; pressed: string }> = {
  pushButtonXb2No: { rest: '#2f9e3f', pressed: '#1d6f2c' },
  pushButtonXb2Nc: { rest: '#c8202b', pressed: '#8f1420' },
  pushButtonXb2Black: { rest: '#20242a', pressed: '#0d1013' },
  pushButtonXb2Yellow: { rest: '#f2c200', pressed: '#bf9600' },
  pushButtonXb2Blue: { rest: '#1f5fd0', pressed: '#17479c' },
  pushButtonXb2White: { rest: '#f4f4ee', pressed: '#cfd2ca' },
}

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
  // GEYA GRT8: parafusos captivos visíveis na face frontal (vista +Z) alinhados
  // com os bornes superiores (A1/S/A2) e inferiores (15/16/18). O GLB traz as
  // cavidades; estes parafusos completam a serigrafia/hardware da face.
  // GEYA GRT8: os parafusos captivos corretos já estão no GLB (gerado por
  // build-industrial-devices.mjs a z=34.1/38 mm, dentro dos poços frontais
  // recuados). O grupo runtime flutuante foi removido: duplicava os parafusos
  // e ficava suspenso a meio do ar na face do painel.
  // MICO 4.6: botões de canal e seletores de corrente.
  if (type === 'breakerMurrelektronikMico46') {
    root.traverse(node => {
      const m = /^industrial_mico_(button|select)_([1-4])$/.exec(node.name)
      // Nomes do contrato de industrialControlPatch: ch1…ch4 (ON/OFF) e sel1…sel4 (corrente).
      // Antes ficava «button1»/«select1», que a lógica ignorava: os botões não faziam nada.
      if (m) node.userData.industrialControl = (m[1] === 'button' ? 'ch' : 'sel') + m[2]
      if (node.name.startsWith('industrial_mico_button_') || node.name.startsWith('industrial_mico_select_')) node.userData.industrialMoving = true
    })
  }
  // Botoeiras KEOLEA KL-XB2: o disco colorido do actuador é a zona de pressão real.
  if (type.startsWith('pushButtonXb2')) {
    root.traverse(node => {
      if (node.name === 'industrial_xb2_cap') {
        node.userData.industrialControl = 'button'
        const palette = XB2_CAP_COLORS[type]
        const mesh = node as THREE.Mesh
        // prepareIndustrialModel corre a cada mudança de estado: o material do
        // disco é criado uma só vez por instância.
        if (palette && mesh.isMesh && !mesh.userData.xb2CapRest) {
          // Cópia própria do material: premir troca a cor só desta instância.
          for (const old of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) old.dispose?.()
          const base = palette.rest
          const material = new THREE.MeshPhysicalMaterial({
            color: base, metalness: .02, roughness: .24,
            clearcoat: .55, clearcoatRoughness: .16,
          })
          material.name = 'xb2_cap_' + type
          mesh.material = material
          mesh.userData.xb2CapRest = base
          mesh.userData.xb2CapPressed = palette.pressed
          mesh.castShadow = mesh.receiveShadow = true
        }
      }
      if (node.name === 'industrial_xb2_cap' || node.name === 'industrial_xb2_bezel') node.userData.industrialMoving = true
    })
  }
  // ATV320: melhorar aspeto do encoder verde (botão rotativo knurled) e do ESC.
  // O GLB STEP traz a geometria base; aqui afinamos materiais e detalhe de face.
  if (type === 'vfdSchneiderAtv320') {
    // 'industrial_encoder' é o pivot de rotação; o corpo é o mesh filho.
    const pivot = root.getObjectByName('industrial_encoder')
    const encoder = root.getObjectByName('industrial_encoder_body') as THREE.Mesh | undefined
    if (pivot && encoder?.isMesh) {
      const mat = new THREE.MeshStandardMaterial({
        color: '#3eae27', metalness: 0.1, roughness: 0.5,
      })
      if (Array.isArray(encoder.material)) encoder.material.forEach(m => m.dispose())
      else encoder.material.dispose()
      encoder.material = mat
      // Serrilhado do aro do jog dial (textura de aderência da unidade real).
      if (!root.getObjectByName('atv_encoder_knurl')) {
        const box = new THREE.Box3().setFromObject(encoder)
        const size = new THREE.Vector3(); box.getSize(size)
        const center = new THREE.Vector3(); box.getCenter(center)
        const r = Math.max(size.x, size.y) * 0.5
        const knurl = new THREE.Mesh(
          new THREE.TorusGeometry(r * 0.96, r * 0.07, 8, 64),
          new THREE.MeshStandardMaterial({ color: '#2b8a1e', metalness: 0.1, roughness: 0.62 })
        )
        knurl.name = 'atv_encoder_knurl'
        knurl.position.set(center.x, center.y, box.max.z - size.z * 0.18)
        root.add(knurl)
      }
    }
    const esc = root.getObjectByName('industrial_escape') as THREE.Mesh | undefined
    if (esc?.isMesh) {
      const mat = new THREE.MeshStandardMaterial({ color: '#1c1f24', metalness: 0.35, roughness: 0.45 })
      if (Array.isArray(esc.material)) esc.material.forEach(m => m.dispose())
      else esc.material.dispose()
      esc.material = mat
    }
  }
}

/** Clique físico curto de botoeira (o mesmo motor de som dos disjuntores). */
export function industrialClickSound(): void {
  try { playClick('button') } catch { /* som desligado ou indisponível */ }
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
  if (type === 'timerGeyaGrt8M1' || type === 'timerGeyaGrt8M2' || type === 'timerGeyaGrt8B1') return { ledPower: !!s.powered, ledRelay: !!s.powered && !!s.energized }
  if (type === 'levelRelayAvel411') return {
    ledPower: !!s.powered, ledRelay: !!s.powered && !!s.energized,
    ledTankWater: !!s.powered && !!s.tankMinWet, ledTankDry: !!s.powered && !s.tankMinWet,
    ledWellWater: !!s.powered && !!s.wellReady, ledWellDry: !!s.powered && !s.wellReady,
  }
  if (type === 'breakerMurrelektronikMico46') {
    const ch = (s.channels ?? {}) as Record<string, { on: boolean; tripped: boolean; fault: boolean }>
    const out: Record<string, boolean> = {}
    for (const i of [1, 2, 3, 4]) { const c = ch[String(i)]; out['led' + i] = !!s.powered && !!c?.on && !c?.tripped && !c?.fault }
    return out
  }
  return {}
}
export const INDUSTRIAL_LED_NODES: Record<string, string> = {
  industrial_led_fault: 'ledFault', industrial_led_run: 'ledRun', industrial_led_can: 'ledCan',
  industrial_led_power: 'ledPower', industrial_led_relay: 'ledRelay',
  industrial_led_tank_water: 'ledTankWater', industrial_led_tank_dry: 'ledTankDry',
  industrial_led_well_water: 'ledWellWater', industrial_led_well_dry: 'ledWellDry',
  industrial_mico_led_1: 'led1', industrial_mico_led_2: 'led2', industrial_mico_led_3: 'led3', industrial_mico_led_4: 'led4',
}

export function industrialDisplayText(s: Record<string, unknown>): string {
  return atv320DisplayText(s)
}

function redrawLcd(root: THREE.Object3D, s: Record<string, unknown>): void {
  const mesh = root.getObjectByName('industrial_lcd') as THREE.Mesh | undefined
  if (!mesh?.isMesh || typeof document === 'undefined') return
  let entry = lcds.get(mesh)
  if (!entry) {
    const canvas = document.createElement('canvas'); canvas.width = 420; canvas.height = 126
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
  // Botoeira XB2: curso de 2 mm do disco e cor de pressão. `moveControls` falso
  // (Admin, capas, fotografia) fixa o repouso — a cor de pressão só aparece com
  // o botão realmente premido.
  if (type.startsWith('pushButtonXb2')) {
    const cap = root.getObjectByName('industrial_xb2_cap') as THREE.Mesh | undefined
    if (cap?.isMesh) {
      const pressed = moveControls && !!s.pressed
      const restZ = cap.userData.xb2RestZ ?? (cap.userData.xb2RestZ = cap.position.z)
      cap.position.z = Number(restZ) - (pressed ? .002 : 0)
      const material = (Array.isArray(cap.material) ? cap.material[0] : cap.material) as THREE.MeshPhysicalMaterial | undefined
      const target = (pressed ? cap.userData.xb2CapPressed : cap.userData.xb2CapRest) as string | undefined
      if (material?.color && target && material.userData.xb2Color !== target) {
        material.color.set(target)
        material.userData.xb2Color = target
      }
    }
  }
  const cover = root.getObjectByName('industrial_control_cover'), interior = root.getObjectByName('industrial_control_interior')
  if (cover) cover.visible = !s.controlCoverOpen
  if (interior) interior.visible = !!s.controlCoverOpen
  // Rodar uma escala é diferente do impulso de um botão da rig genérica.
  const range = root.getObjectByName('industrial_range'), fraction = root.getObjectByName('industrial_fraction'), fn = root.getObjectByName('industrial_function')
  if (moveControls && range) range.rotation.z = -Math.max(0, GEYA_RANGES_MS.indexOf(Number(s.rangeMs) as never)) * Math.PI / 6
  if (moveControls && fraction) fraction.rotation.z = -Math.PI * 1.5 * (Math.max(.1, Math.min(1, Number(s.fraction) || .3)) - .1) / .9
  if (moveControls && fn) fn.rotation.z = -Math.max(0, GEYA_FUNCTIONS.indexOf(String(s.function) as never)) * Math.PI / 6
  if (moveControls) {
    const test = root.getObjectByName('industrial_test')
    if (test) {
      test.userData.restZ ??= test.position.z
      test.position.z = Number(test.userData.restZ) - (s.testPressed ? .001 : 0)
    }
  }
  if (drawLcd && type === 'vfdSchneiderAtv320') redrawLcd(root, s)
  if (type === 'breakerMurrelektronikMico46' && moveControls) {
    const ch = (s.channels ?? {}) as Record<string, { on: boolean; setpointA: number }>
    for (const i of [1, 2, 3, 4]) {
      const c = ch[String(i)]
      const btn = root.getObjectByName('industrial_mico_button_' + i)
      if (btn) { btn.userData.restZ ??= btn.position.z; btn.position.z = btn.userData.restZ - (c?.on ? 0 : 0.0008) }
      const sel = root.getObjectByName('industrial_mico_select_' + i)
      if (sel && c) sel.rotation.z = -[1, 2, 4, 6].indexOf(c.setpointA) * Math.PI / 4
    }
  }
  const armature = root.getObjectByName('industrial_armature')
  if (armature) armature.rotation.x = s.energized ? -.07 : 0
  root.updateMatrixWorld(true)
}

/** Etiquetas A1 S A2 / 15 16 18 impressas sobre cada poço de borne do GRT8. */
function geyaScrewLabels(): Record<string, string> {
  const out: Record<string, string> = {}
  for (const label of ['A1', 'S', 'A2', '15', '16', '18', '25', '26', '28']) out['industrial_geya_label_' + label] = `geya-screw-label-${label}.png`
  return out
}

/** Números dos bornes gravados na face traseira de cada bloco de contactos. */
function xb2TerminalNumbers(): Record<string, string> {
  const out: Record<string, string> = {}
  for (const label of ['1', '2', '3', '4']) out['industrial_xb2_terminal_' + label] = `xb2-terminal-${label}.png`
  return out
}

export const PRINTS: Partial<Record<IndustrialDeviceType, Record<string, string>>> = {
  timerGeyaGrt8M1: {
    industrial_fascia: 'geya-grt8-m-face.png', industrial_geya_side_r: 'geya-grt8-m-side-r.png', industrial_geya_side_l: 'geya-grt8-m-side-l.png',
    ...geyaScrewLabels(),
  },
  timerGeyaGrt8M2: {
    industrial_fascia: 'geya-grt8-m2-face.png', industrial_geya_side_r: 'geya-grt8-m2-side-r.png', industrial_geya_side_l: 'geya-grt8-m2-side-l.png',
    ...geyaScrewLabels(),
  },
  timerGeyaGrt8B1: {
    industrial_fascia: 'geya-grt8-b-face.png', industrial_geya_side_r: 'geya-grt8-b-side-r.png', industrial_geya_side_l: 'geya-grt8-b-side-l.png',
    ...geyaScrewLabels(),
  },
  levelRelayAvel411: { industrial_avel_label: 'avel-411-face.png' },
  relayFinder5534: { industrial_finder_label: 'finder-5534-label.png' },
  buzzerMetaltexTby301: { industrial_metaltex_label: 'metaltex-tby-label.png' },
  pushButtonXb2No: { industrial_xb2_etch_side_34: 'xb2-no-etch-baked.png', ...xb2TerminalNumbers() },
  pushButtonXb2Black: { industrial_xb2_etch_side_34: 'xb2-no-etch-baked.png', ...xb2TerminalNumbers() },
  pushButtonXb2Yellow: { industrial_xb2_etch_side_34: 'xb2-no-etch-baked.png', ...xb2TerminalNumbers() },
  pushButtonXb2Blue: { industrial_xb2_etch_side_34: 'xb2-no-etch-baked.png', ...xb2TerminalNumbers() },
  pushButtonXb2White: { industrial_xb2_etch_side_34: 'xb2-no-etch-baked.png', ...xb2TerminalNumbers() },
  pushButtonXb2Nc: { industrial_xb2_etch_side_12: 'xb2-nc-etch-baked.png', ...xb2TerminalNumbers() },
  breakerMurrelektronikMico46: { industrial_mico_logo: 'mico-logo.png', industrial_mico_legend: 'mico-legend.png', industrial_mico_class2: 'mico-class2.png', industrial_mico_print_24v_1: 'mico-24v.png', industrial_mico_print_24v_2: 'mico-24v.png', industrial_mico_print_gnd: 'mico-gnd.png' },
  vfdSchneiderAtv320: {
    industrial_schneider_logo: '../../brands/schneider-electric.svg',
    industrial_product_sticker: 'atv320-product-label.png',
    industrial_altivar_label: 'atv320-altivar-label.png',
    industrial_danger_label: 'atv320-danger-label.png',
    industrial_qr_sticker: 'atv320-qr-sticker.png',
    industrial_hmi_legend_ref: 'atv320-legend-ref.png',
    industrial_hmi_legend_mon: 'atv320-legend-mon.png',
    industrial_hmi_legend_conf: 'atv320-legend-conf.png',
    industrial_hmi_legend_value: 'atv320-legend-value.png',
    industrial_hmi_legend_unit: 'atv320-legend-unit.png',
    industrial_hmi_legend_can_run: 'atv320-legend-can-run.png',
    industrial_hmi_legend_can_err: 'atv320-legend-can-err.png',
    industrial_escape_label: 'atv320-legend-esc.png',
  },
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
    const url = new URL(file, `${location.origin}/models/industriais/`)
    if (type === 'levelRelayAvel411') url.searchParams.set('v', 'avel-legible-v2')
    const texture = await textureFor(url.pathname + url.search)
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
