/**
 * Família de Iluminação Residencial / Predial — modelos 3D CAD procedurais,
 * especificações reais (Philips Classic/Genie/CorePro + Schneider Electric Odace),
 * serigrafia e animação ótica/mecânica.
 *
 * Todas as geometrias são construídas em milímetros no referencial canónico
 * do DC-Simu: x ∈ [−W/2, +W/2], y ∈ [0, H], z ∈ [0, D] (frente em +Z).
 */
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { bindCachedCanvasTexture, cachedCanvasTexture } from './canvasTextureCache'

export type LightingLampType =
  | 'lampIncandescentE27'
  | 'lampFluorescentE27'
  | 'lampLedE27'

export type LightingSwitchType =
  | 'wallSwitchSimple'
  | 'wallSwitchDouble'
  | 'wallSwitchStaircase'

export type LightingComponentType = LightingLampType | LightingSwitchType

export const LIGHTING_LAMP_TYPES: readonly LightingLampType[] = [
  'lampIncandescentE27',
  'lampFluorescentE27',
  'lampLedE27',
]

export const LIGHTING_SWITCH_TYPES: readonly LightingSwitchType[] = [
  'wallSwitchSimple',
  'wallSwitchDouble',
  'wallSwitchStaircase',
]

export const LIGHTING_TYPES: readonly LightingComponentType[] = [
  ...LIGHTING_LAMP_TYPES,
  ...LIGHTING_SWITCH_TYPES,
]

export const isLightingLampType = (type: string): type is LightingLampType =>
  type === 'lampIncandescentE27' || type === 'lampFluorescentE27' || type === 'lampLedE27'

export const isLightingSwitchType = (type: string): type is LightingSwitchType =>
  type === 'wallSwitchSimple' || type === 'wallSwitchDouble' || type === 'wallSwitchStaircase'

export const isLightingType = (type: string): type is LightingComponentType =>
  isLightingLampType(type) || isLightingSwitchType(type)

export interface LampSpec {
  type: LightingLampType
  brand: string
  series: string
  reference: string
  technologyLabel: string
  socketLabel: string
  sizeMm: { width: number; height: number; depth: number }
  powerOptionsW: readonly number[]
  defaultPowerW: number
  lumensByW: Record<number, number>
  equivalentIncandescentByW: Record<number, number>
  cctOptionsK: readonly number[]
  defaultCctK: number
  powerFactor: number
  lifespanLabel: string
  energySavingLabel: string
  cri: number
  datasheetPath: string
  datasheetName: string
  glowCenterMm: [number, number, number]
  glowRadiusMm: number
}

export interface SwitchSpec {
  type: LightingSwitchType
  brand: string
  series: string
  reference: string
  functionLabel: string
  sizeMm: { width: number; height: number; depth: number }
  ratingLabel: string
  norm: string
  datasheetPath: string
  datasheetName: string
  rockerTiltDeg: number
}

export const LAMP_SPECS: Record<LightingLampType, LampSpec> = {
  lampIncandescentE27: {
    type: 'lampIncandescentE27',
    brand: 'Philips',
    series: 'Classic A60',
    reference: 'A60-E27-CL',
    technologyLabel: 'Incandescente',
    socketLabel: 'E27',
    sizeMm: { width: 64, height: 132, depth: 64 },
    powerOptionsW: [40, 60, 75, 100],
    defaultPowerW: 60,
    lumensByW: { 40: 415, 60: 710, 75: 935, 100: 1340 },
    equivalentIncandescentByW: { 40: 40, 60: 60, 75: 75, 100: 100 },
    cctOptionsK: [2700],
    defaultCctK: 2700,
    powerFactor: 1.0,
    lifespanLabel: '1 ano (~1 000 h)',
    energySavingLabel: '0 % (referência)',
    cri: 100,
    datasheetPath: '/datasheets/lighting/philips-standard-a60-incandescente-e27-pt.pdf',
    datasheetName: 'Philips Standard A60 E27 Incandescente + Guia Comparativo (PT).pdf',
    glowCenterMm: [0, 96, 34],
    glowRadiusMm: 28,
  },
  lampFluorescentE27: {
    type: 'lampFluorescentE27',
    brand: 'Philips',
    series: 'Genie CFL',
    reference: 'GENIE-E27',
    technologyLabel: 'Fluorescente Compacta (CFL)',
    socketLabel: 'E27',
    sizeMm: { width: 64, height: 154, depth: 64 },
    powerOptionsW: [8, 12, 15, 20],
    defaultPowerW: 12,
    lumensByW: { 8: 420, 12: 680, 15: 900, 20: 1200 },
    equivalentIncandescentByW: { 8: 40, 12: 60, 15: 75, 20: 100 },
    cctOptionsK: [2700, 4000, 6500],
    defaultCctK: 4000,
    powerFactor: 0.6,
    lifespanLabel: '6 a 10 anos (10 000 h)',
    energySavingLabel: 'Até 80 %',
    cri: 82,
    datasheetPath: '/datasheets/lighting/philips-genie-cfl-e27.pdf',
    datasheetName: 'Philips Genie CFL E27 — Ficha Técnica Oficial.pdf',
    glowCenterMm: [0, 118, 34],
    glowRadiusMm: 26,
  },
  lampLedE27: {
    type: 'lampLedE27',
    brand: 'Philips',
    series: 'CorePro LEDbulb A60',
    reference: '929003785202',
    technologyLabel: 'LED',
    socketLabel: 'E27',
    sizeMm: { width: 64, height: 138, depth: 64 },
    powerOptionsW: [4, 6, 8, 10],
    defaultPowerW: 8,
    lumensByW: { 4: 400, 6: 600, 8: 806, 10: 1055 },
    equivalentIncandescentByW: { 4: 40, 6: 60, 8: 75, 100: 100, 10: 100 },
    cctOptionsK: [2700, 4000, 6500],
    defaultCctK: 4000,
    powerFactor: 0.7,
    lifespanLabel: '15 a 25 anos (15 000–25 000 h)',
    energySavingLabel: 'Até 95 %',
    cri: 80,
    datasheetPath: '/datasheets/lighting/philips-corepro-ledbulb-a60-e27.pdf',
    datasheetName: 'Philips CorePro LEDbulb A60 E27 5CCT — Ficha Técnica Oficial.pdf',
    glowCenterMm: [0, 108, 34],
    glowRadiusMm: 28,
  },
}

export const SWITCH_SPECS: Record<LightingSwitchType, SwitchSpec> = {
  wallSwitchSimple: {
    type: 'wallSwitchSimple',
    brand: 'Schneider Electric',
    series: 'Odace',
    reference: 'S520201',
    functionLabel: 'Interruptor Simples (1 tecla · L–1)',
    sizeMm: { width: 85, height: 85, depth: 38 },
    ratingLabel: '10 AX · 250 V~ 50 Hz',
    norm: 'EN 60669-1 · IP21D · IK04',
    datasheetPath: '/datasheets/lighting/schneider-odace-s520204.pdf',
    datasheetName: 'Schneider Electric Odace (S520201 / S520204 / S520214) — Ficha Técnica.pdf',
    rockerTiltDeg: 8.5,
  },
  wallSwitchDouble: {
    type: 'wallSwitchDouble',
    brand: 'Schneider Electric',
    series: 'Odace',
    reference: 'S520214',
    functionLabel: 'Interruptor Duplo (2 teclas · L–1 / L–2)',
    sizeMm: { width: 85, height: 85, depth: 38 },
    ratingLabel: '2 × 10 AX · 250 V~ 50 Hz',
    norm: 'EN 60669-1 · IP21D · IK04',
    datasheetPath: '/datasheets/lighting/schneider-odace-s520204.pdf',
    datasheetName: 'Schneider Electric Odace (S520201 / S520204 / S520214) — Ficha Técnica.pdf',
    rockerTiltDeg: 8.5,
  },
  wallSwitchStaircase: {
    type: 'wallSwitchStaircase',
    brand: 'Schneider Electric',
    series: 'Odace',
    reference: 'S520204',
    functionLabel: 'Comutador de Escada (Inversor SPDT · L–1 / L–2)',
    sizeMm: { width: 85, height: 85, depth: 38 },
    ratingLabel: '10 AX · 250 V~ 50 Hz',
    norm: 'EN 60669-1 · IP21D · IK04',
    datasheetPath: '/datasheets/lighting/schneider-odace-s520204.pdf',
    datasheetName: 'Schneider Electric Odace (S520201 / S520204 / S520214) — Ficha Técnica.pdf',
    rockerTiltDeg: 8.5,
  },
}

/** Cor da luz e tom do difusor em função da temperatura de cor (K). */
export function cctLightPalette(cctK: number, isIncandescent = false): {
  glowHex: string
  emissiveHex: string
  bulbTintHex: string
  label: string
} {
  if (isIncandescent || cctK <= 2900) {
    return {
      glowHex: isIncandescent ? '#ffcc66' : '#ffd88a',
      emissiveHex: isIncandescent ? '#ffbe4a' : '#ffcf75',
      bulbTintHex: isIncandescent ? '#fff6df' : '#fff4dd',
      label: '2700 K (Branco quente)',
    }
  }
  if (cctK >= 5500) {
    return {
      glowHex: '#e6f4ff',
      emissiveHex: '#d8eeff',
      bulbTintHex: '#f5fbff',
      label: '6500 K (Luz do dia)',
    }
  }
  return {
    glowHex: '#fff5e0',
    emissiveHex: '#ffefd0',
    bulbTintHex: '#fcfaf4',
    label: '4000 K (Branco neutro)',
  }
}

/** Fluxo luminoso (lm) e intensidade relativa (0,55..1,45) consoante a potência selecionada. */
export function lampPhotometrics(type: LightingLampType, powerW?: unknown) {
  const spec = LAMP_SPECS[type]
  const w = Number(powerW)
  const validW = spec.powerOptionsW.includes(w) ? w : spec.defaultPowerW
  const lumens = spec.lumensByW[validW] ?? spec.lumensByW[spec.defaultPowerW]
  const equivW = spec.equivalentIncandescentByW[validW] ?? 60
  const currentA = Number((validW / (230 * spec.powerFactor)).toFixed(3))
  const intensityScale = Math.max(0.65, Math.min(1.5, lumens / 760))
  return { powerW: validW, lumens, equivW, currentA, intensityScale }
}

function stdMat(name: string, color: string, roughness: number, metalness = 0, extra?: Partial<THREE.MeshStandardMaterialParameters>) {
  return new THREE.MeshStandardMaterial({ name, color, roughness, metalness, ...extra })
}

/** Cor de marcação de cada borne de iluminação (fase castanha, neutro azul, retornos laranja/âmbar). */
export const LIGHTING_TERMINAL_INK: Record<string, string> = { L: '#8b4513', N: '#1d4ed8', '1': '#c2410c', '2': '#b45309' }

/** Parafuso de aperto visível, num alvéolo escuro, e marcação do borne ao lado.
 *  `face: 'front'` → cabeça virada para +Z; `face: 'bottom'` → cabeça virada para −Y. */
type TerminalAccess = { face: 'front' | 'bottom'; screw: [number, number, number]; label: [number, number, number] }

function addTerminalScrewAndLabel(well: THREE.Group, label: string, access: TerminalAccess) {
  const front = access.face === 'front'
  const orient = (m: THREE.Object3D) => { if (front) m.rotation.x = Math.PI / 2 }
  const [sx, sy, sz] = access.screw
  // Normal exterior da face: os elementos ficam em camadas, à frente do alojamento.
  // Na face inferior a saliência é menor: os interruptores só têm 1,5 mm até ao limite do envelope.
  const k = front ? 1 : 0.7
  const out = (d: number): [number, number, number] => front ? [sx, sy, sz + d * k] : [sx, sy - d * k, sz]

  const pocket = new THREE.Mesh(new THREE.CylinderGeometry(3.0, 3.0, 0.5 * k, 24), stdMat(`terminal_pocket_${label}`, '#1f252c', 0.7, 0.05))
  orient(pocket); pocket.position.set(...out(0.25)); well.add(pocket)

  const brass = stdMat(`terminal_screw_${label}`, '#d9b65a', 0.22, 0.9)
  const head = new THREE.Mesh(new THREE.CylinderGeometry(2.25, 2.25, 1.3 * k, 24), brass)
  head.name = `lighting_terminal_screw_${label}`
  orient(head); head.position.set(...out(0.95)); well.add(head)

  // Cabeça pozidriv: fenda + cruz rebaixadas.
  const slotMat = stdMat(`terminal_slot_${label}`, '#4a3c18', 0.5, 0.5)
  for (const turn of [0, Math.PI / 2]) {
    const slot = new THREE.Mesh(new THREE.BoxGeometry(3.3, 0.6, 0.6), slotMat)
    if (front) slot.rotation.z = turn
    else slot.rotation.y = turn
    slot.position.set(...out(1.45)); well.add(slot)
  }

  // Marcação do borne (texto aplicado em runtime por applyLightingMarkings).
  const mark = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 5.2), stdMat(`lighting_terminal_label_${label}_mat`, '#f2f3ef', 0.4, 0.02))
  mark.name = `lighting_terminal_label_${label}`
  const [lx, ly, lz] = access.label
  if (front) mark.position.set(lx, ly, lz + 0.06)
  else {
    // Lida de baixo, com o topo do texto virado para a frente (espelho).
    mark.rotation.set(Math.PI / 2, 0, 0)
    mark.position.set(lx, ly - 0.06, lz)
  }
  well.add(mark)
}

/** Cria um borne de latão com entrada inferior do condutor em (x, yBottom, z) e parafuso acessível. */
function addBrassTerminalWell(
  parent: THREE.Group,
  label: string,
  x: number,
  yBottom: number,
  z: number,
  wireColorHex: string,
  access: TerminalAccess,
) {
  const well = new THREE.Group()
  well.name = `lighting_terminal_${label}`

  // Alojamento isolante do borne
  const sleeve = new THREE.Mesh(
    new THREE.CylinderGeometry(3.4, 3.4, 7.6, 18),
    stdMat(`terminal_sleeve_${label}`, '#2a3038', 0.55, 0.05),
  )
  sleeve.position.set(x, yBottom + 3.8, z)
  well.add(sleeve)

  // Anel identificador de cor discreto na entrada inferior do condutor
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(2.55, 0.45, 8, 20),
    stdMat(`terminal_ring_${label}`, wireColorHex, 0.42, 0.04),
  )
  ring.rotation.x = Math.PI / 2
  ring.position.set(x, yBottom + 0.5, z)
  well.add(ring)

  // Miolo cilíndrico de latão (gaiola de aperto) dentro do alojamento
  const brass = stdMat(`terminal_brass_${label}`, '#d4b054', 0.24, 0.86)
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(2.15, 2.15, 5.2, 16), brass)
  collar.position.set(x, yBottom + 4.4, z)
  well.add(collar)

  addTerminalScrewAndLabel(well, label, access)
  parent.add(well)
}

/** Constrói a base/soquete E27 de porcelana/policarbonato de montagem mural (64 × 34 × 64 mm). */
function buildE27WallSocket(root: THREE.Group) {
  const porcelain = stdMat('e27_porcelain_white', '#f2f3ef', 0.26, 0.02)
  const backplateMat = stdMat('e27_mount_base', '#e6e8e4', 0.42, 0.02)
  const brassMat = stdMat('e27_brass_contact', '#cfa84c', 0.26, 0.84)
  const steelMat = stdMat('e27_mount_screw', '#c9cfd4', 0.24, 0.85)
  const innerDark = stdMat('e27_inner_collar', '#363b42', 0.65, 0.1)

  const socketGroup = new THREE.Group()
  socketGroup.name = 'lighting_socket_base'

  // Placa de fixação mural traseira (encosta a z = 0, largura exata 64 mm)
  const backplate = new THREE.Mesh(new RoundedBoxGeometry(64, 44, 7.5, 4, 2.2), backplateMat)
  backplate.position.set(0, 22, 3.75)
  socketGroup.add(backplate)

  // Dois parafusos de fixação nos cantos superiores da placa mural
  for (const sx of [-24, 24]) {
    const boss = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.6, 2.2, 16), backplateMat)
    boss.rotation.x = Math.PI / 2
    boss.position.set(sx, 36, 8.2)
    socketGroup.add(boss)
    const screw = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.1, 1.2, 16), steelMat)
    screw.rotation.x = Math.PI / 2
    screw.position.set(sx, 36, 9.2)
    socketGroup.add(screw)
  }

  // Bloco de bornes saliente na base inferior (y = 0..11,5; z = 12..50): face frontal
  // abaixo da aba do casquilho, com os parafusos à vista e marcação L / N.
  const termHousing = new THREE.Mesh(new RoundedBoxGeometry(44, 11.5, 38, 3, 1.4), porcelain)
  termHousing.position.set(0, 5.75, 31.0)
  socketGroup.add(termHousing)

  // Dois bornes reais: entrada inferior do condutor (z = 23 mm, inalterada) e parafuso frontal.
  const termFront = 50
  addBrassTerminalWell(socketGroup, 'L', -12, 0.6, 23, '#8b4513', { face: 'front', screw: [-12, 5.75, termFront], label: [-18.4, 5.75, termFront] })
  addBrassTerminalWell(socketGroup, 'N', 12, 0.6, 23, '#1d4ed8', { face: 'front', screw: [12, 5.75, termFront], label: [18.4, 5.75, termFront] })

  // Consola / suporte horizontal que liga a placa mural ao casquilho E27 (centrado em z = 34 mm)
  const bracket = new THREE.Mesh(new RoundedBoxGeometry(44, 15, 32, 4, 3.0), porcelain)
  bracket.position.set(0, 17.5, 21.0)
  socketGroup.add(bracket)

  // Base circular de porcelana do casquilho E27 (Ø60 mm → z = 4..64 mm exatos)
  const flange = new THREE.Mesh(new THREE.CylinderGeometry(29.5, 30.0, 9.0, 36), porcelain)
  flange.position.set(0, 16.5, 34.0)
  socketGroup.add(flange)

  // Corpo cilíndrico chanfrado do soquete E27 (y = 20..36 mm)
  const collarPoints = [
    new THREE.Vector2(0, 20),
    new THREE.Vector2(28.5, 20),
    new THREE.Vector2(27.0, 23),
    new THREE.Vector2(22.2, 26),
    new THREE.Vector2(21.4, 35.5),
    new THREE.Vector2(19.6, 37.2),
    new THREE.Vector2(15.2, 37.2),
    new THREE.Vector2(14.6, 32.0),
    new THREE.Vector2(0, 32.0),
  ]
  const collar = new THREE.Mesh(new THREE.LatheGeometry(collarPoints, 36), porcelain)
  collar.position.set(0, 0, 34.0)
  socketGroup.add(collar)

  // Anel interior roscado de latão dentro da boca do casquilho
  const innerRing = new THREE.Mesh(new THREE.CylinderGeometry(14.5, 14.5, 5.0, 28, 1, true), brassMat)
  innerRing.position.set(0, 34.8, 34.0)
  socketGroup.add(innerRing)

  const innerFloor = new THREE.Mesh(new THREE.CylinderGeometry(14.2, 14.2, 0.8, 24), innerDark)
  innerFloor.position.set(0, 32.5, 34.0)
  socketGroup.add(innerFloor)

  // Serigrafia E27 · 230V~ entre os dois parafusos, na face frontal do bloco de bornes
  const socketLabel = new THREE.Mesh(
    new THREE.PlaneGeometry(15, 7),
    stdMat('lighting_socket_label_mat', '#f2f3ef', 0.34, 0.02),
  )
  socketLabel.name = 'lighting_socket_label'
  socketLabel.position.set(0, 5.75, 50.06)
  socketGroup.add(socketLabel)

  root.add(socketGroup)
}

/** Constrói a rosca metálica Edison E27 (Ø27 mm, y = 34..52 mm, z = 34 mm). */
function buildE27ScrewBase(root: THREE.Group, metalHex: string) {
  const pts: THREE.Vector2[] = [
    new THREE.Vector2(0, 33.0),
    new THREE.Vector2(6.0, 33.0),
    new THREE.Vector2(11.8, 35.5),
  ]
  // 5 filetes realistas da rosca E27
  for (let i = 0; i <= 28; i++) {
    const t = i / 28
    const y = 36.2 + t * 14.2
    const wave = Math.sin(t * Math.PI * 10) * 0.82
    pts.push(new THREE.Vector2(13.15 + wave, y))
  }
  pts.push(new THREE.Vector2(13.6, 51.4), new THREE.Vector2(13.2, 52.0))

  const thread = new THREE.Mesh(
    new THREE.LatheGeometry(pts, 32),
    stdMat('lighting_e27_thread_mat', metalHex, 0.24, 0.86),
  )
  thread.name = 'lighting_e27_thread'
  thread.position.set(0, 0, 34.0)
  root.add(thread)
}

/** 1. Lâmpada Incandescente Philips Classic A60 E27 (64 × 132 × 64 mm). */
function buildIncandescentBulb(root: THREE.Group) {
  buildE27WallSocket(root)
  buildE27ScrewBase(root, '#d4b35a') // latão clássico

  // Colar isolante vítreo preto na base da ampola
  const neckCollar = new THREE.Mesh(
    new THREE.CylinderGeometry(14.0, 13.6, 2.6, 28),
    stdMat('inc_neck_collar', '#3a3d42', 0.45, 0.15),
  )
  neckCollar.position.set(0, 52.4, 34.0)
  root.add(neckCollar)

  // Haste interna de vidro (pinch stem)
  const stemPts = [
    new THREE.Vector2(0, 53),
    new THREE.Vector2(8.5, 53),
    new THREE.Vector2(4.2, 62),
    new THREE.Vector2(3.0, 82),
    new THREE.Vector2(4.2, 85),
    new THREE.Vector2(0, 85),
  ]
  const stem = new THREE.Mesh(
    new THREE.LatheGeometry(stemPts, 18),
    new THREE.MeshPhysicalMaterial({
      name: 'inc_glass_stem',
      color: '#e8eef5',
      roughness: 0.12,
      metalness: 0.02,
      transparent: true,
      opacity: 0.48,
    }),
  )
  stem.position.set(0, 0, 34.0)
  root.add(stem)

  // Dois condutores de suporte de molibdénio até ao filamento
  const wireMat = stdMat('inc_lead_wire', '#889098', 0.35, 0.85)
  for (const dir of [-1, 1]) {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(dir * 2.2, 60, 34),
      new THREE.Vector3(dir * 3.8, 82, 34),
      new THREE.Vector3(dir * 9.5, 96, 34),
    ])
    root.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 14, 0.48, 8, false), wireMat))
  }
  // Haste central fina de apoio
  const midSupport = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 16, 8), wireMat)
  midSupport.position.set(0, 92, 34)
  root.add(midSupport)

  // Filamento helicoidal em arco M/U de tungsténio (acende incandescente)
  const filamentPts: THREE.Vector3[] = []
  const steps = 48
  for (let i = 0; i <= steps; i++) {
    const u = i / steps
    const x = -9.5 + u * 19.0
    const archY = 96 + Math.sin(u * Math.PI) * 9.5
    const coilAngle = u * Math.PI * 18
    const coilR = 1.05
    filamentPts.push(new THREE.Vector3(x, archY + Math.sin(coilAngle) * coilR, 34 + Math.cos(coilAngle) * coilR))
  }
  const filament = new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(filamentPts), 96, 0.42, 8, false),
    stdMat('lamp_filament_mat', '#7c7e82', 0.32, 0.72, { emissive: '#000000', emissiveIntensity: 0 }),
  )
  filament.name = 'lamp_filament'
  root.add(filament)

  // Núcleo luminoso interno (invisível em OFF, brilha quente em ON)
  const glowCore = new THREE.Mesh(
    new THREE.SphereGeometry(19.5, 24, 18),
    new THREE.MeshStandardMaterial({
      name: 'lamp_glow_core_mat',
      color: '#fff4d2',
      emissive: '#000000',
      emissiveIntensity: 0,
      roughness: 0.35,
      transparent: true,
      opacity: 0.08,
      depthWrite: false,
    }),
  )
  glowCore.name = 'lamp_glow_core'
  glowCore.position.set(0, 100, 34.0)
  root.add(glowCore)

  // Ampola A60 de vidro transparente (perfil clássico Ø60 mm, y = 52..132 mm, alta suavidade)
  const bulbPts: THREE.Vector2[] = [
    new THREE.Vector2(13.6, 52.0),
    new THREE.Vector2(14.4, 59.0),
    new THREE.Vector2(17.6, 67.0),
    new THREE.Vector2(23.4, 76.5),
    new THREE.Vector2(27.8, 86.5),
    new THREE.Vector2(29.8, 96.0),
    new THREE.Vector2(30.0, 102.5),
    new THREE.Vector2(29.2, 109.5),
    new THREE.Vector2(26.8, 116.5),
    new THREE.Vector2(22.4, 122.8),
    new THREE.Vector2(16.2, 127.8),
    new THREE.Vector2(9.2, 130.8),
    new THREE.Vector2(3.6, 131.8),
    new THREE.Vector2(0.0, 132.0),
  ]
  const glass = new THREE.Mesh(
    new THREE.LatheGeometry(bulbPts, 56),
    new THREE.MeshPhysicalMaterial({
      name: 'lighting_bulb_glass_mat',
      color: '#dedad0',
      emissive: '#000000',
      emissiveIntensity: 0,
      roughness: 0.08,
      metalness: 0.04,
      transparent: true,
      opacity: 0.24,
      depthWrite: false,
      side: THREE.FrontSide,
    }),
  )
  glass.name = 'lighting_bulb_glass'
  glass.position.set(0, 0, 34.0)
  root.add(glass)
}

/** 2. Lâmpada Fluorescente Compacta Philips Genie CFL E27 (64 × 154 × 64 mm). */
function buildFluorescentCflBulb(root: THREE.Group) {
  buildE27WallSocket(root)
  buildE27ScrewBase(root, '#c8cdd2') // níquel/alumínio

  const ballastMat = stdMat('cfl_ballast_white', '#f4f5f2', 0.30, 0.02)
  const ventMat = stdMat('cfl_vent_dark', '#9aa1a6', 0.52, 0.05)

  // Corpo do balastro eletrónico (y = 51..84 mm, Ø30 → Ø43 mm)
  const ballastPts = [
    new THREE.Vector2(13.6, 51.0),
    new THREE.Vector2(16.2, 54.0),
    new THREE.Vector2(20.6, 61.5),
    new THREE.Vector2(22.0, 74.0),
    new THREE.Vector2(21.6, 82.8),
    new THREE.Vector2(19.6, 84.5),
    new THREE.Vector2(0, 84.5),
  ]
  const ballast = new THREE.Mesh(new THREE.LatheGeometry(ballastPts, 32), ballastMat)
  ballast.position.set(0, 0, 34.0)
  root.add(ballast)

  // Ranhuras discretas de ventilação no ombro superior do balastro
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2
    const vent = new THREE.Mesh(new THREE.BoxGeometry(1.4, 3.6, 0.8), ventMat)
    vent.position.set(Math.cos(a) * 21.7, 79.2, 34.0 + Math.sin(a) * 21.7)
    vent.rotation.y = -a + Math.PI / 2
    root.add(vent)
  }

  // Etiqueta frontal curva no balastro (recebe serigrafia PHILIPS Genie)
  const labelGeo = new THREE.CylinderGeometry(22.15, 21.1, 13.5, 24, 1, true, -0.78, 1.56)
  const label = new THREE.Mesh(labelGeo, stdMat('cfl_ballast_label_mat', '#f4f5f2', 0.34, 0.02))
  label.name = 'lighting_ballast_label'
  label.position.set(0, 69.0, 34.0)
  root.add(label)

  // Três tubos fluorescentes clássicos em U (fósforo branco, y = 83..154 mm)
  const tubeMat = new THREE.MeshStandardMaterial({
    name: 'lamp_glow_core_mat',
    color: '#f7f8f6',
    emissive: '#000000',
    emissiveIntensity: 0,
    roughness: 0.22,
    metalness: 0.02,
  })
  const tubeGroup = new THREE.Group()
  tubeGroup.name = 'lamp_glow_core'

  // 3 arcos em U distribuídos a 120° (frente-esquerda, frente-direita, trás) — silhueta inconfundível CFL!
  const uAngles = [Math.PI * 0.16, Math.PI * 0.84, Math.PI * 1.5]
  for (const ang of uAngles) {
    const rCenter = 11.2
    const legHalfSpan = 6.2
    const cos = Math.cos(ang), sin = Math.sin(ang)
    const tx = -sin, tz = cos
    const p = (s: number, y: number) =>
      new THREE.Vector3(rCenter * cos + s * tx, y, 34.0 + rCenter * sin + s * tz)

    const curve = new THREE.CatmullRomCurve3([
      p(-legHalfSpan, 83.0),
      p(-legHalfSpan, 118.0),
      p(-legHalfSpan, 143.5),
      p(-legHalfSpan * 0.72, 148.5),
      p(0, 149.2),
      p(legHalfSpan * 0.72, 148.5),
      p(legHalfSpan, 143.5),
      p(legHalfSpan, 118.0),
      p(legHalfSpan, 83.0),
    ])
    const uTube = new THREE.Mesh(new THREE.TubeGeometry(curve, 44, 4.8, 16, false), tubeMat)
    uTube.name = 'lamp_glow_core'
    tubeGroup.add(uTube)
  }
  root.add(tubeGroup)
}

/** 3. Lâmpada LED Philips CorePro LEDbulb A60 E27 (64 × 138 × 64 mm). */
function buildLedA60Bulb(root: THREE.Group) {
  buildE27WallSocket(root)
  buildE27ScrewBase(root, '#cfd4d9') // alumínio escovado

  const bodyMat = stdMat('led_thermal_body', '#f5f6f3', 0.30, 0.04)
  const trimRingMat = stdMat('led_collar_ring', '#d7dce0', 0.28, 0.35)

  // Corpo dissipador térmico A60 (y = 51..90 mm, Ø27 → Ø58 mm)
  const bodyPts = [
    new THREE.Vector2(13.6, 51.0),
    new THREE.Vector2(15.2, 55.0),
    new THREE.Vector2(20.8, 66.0),
    new THREE.Vector2(26.2, 78.0),
    new THREE.Vector2(29.0, 88.5),
    new THREE.Vector2(29.2, 90.0),
    new THREE.Vector2(0, 90.0),
  ]
  const body = new THREE.Mesh(new THREE.LatheGeometry(bodyPts, 36), bodyMat)
  body.position.set(0, 0, 34.0)
  root.add(body)

  // Anel técnico subtil na junção dissipador ↔ cúpula opalina
  const ring = new THREE.Mesh(new THREE.TorusGeometry(29.2, 0.55, 8, 36), trimRingMat)
  ring.rotation.x = Math.PI / 2
  ring.position.set(0, 90.0, 34.0)
  root.add(ring)

  // Faixa frontal de serigrafia (PHILIPS · CorePro LED · 8W)
  const labelGeo = new THREE.CylinderGeometry(28.3, 23.6, 15.0, 28, 1, true, -0.72, 1.44)
  const label = new THREE.Mesh(labelGeo, stdMat('led_ballast_label_mat', '#f5f6f3', 0.32, 0.02))
  label.name = 'lighting_ballast_label'
  label.position.set(0, 77.5, 34.0)
  root.add(label)

  // Cúpula difusora opalina A60 (y = 90..138 mm, Ø60 mm, perfil hemisférico suave)
  const domePts = [
    new THREE.Vector2(29.2, 90.0),
    new THREE.Vector2(29.9, 96.5),
    new THREE.Vector2(30.0, 103.0),
    new THREE.Vector2(29.2, 110.0),
    new THREE.Vector2(27.0, 117.0),
    new THREE.Vector2(23.2, 123.8),
    new THREE.Vector2(17.8, 129.8),
    new THREE.Vector2(11.4, 134.4),
    new THREE.Vector2(5.2, 137.1),
    new THREE.Vector2(0.0, 138.0),
  ]
  const dome = new THREE.Mesh(
    new THREE.LatheGeometry(domePts, 56),
    new THREE.MeshStandardMaterial({
      name: 'lamp_glow_core_mat',
      color: '#fbfbf9',
      emissive: '#000000',
      emissiveIntensity: 0,
      roughness: 0.24,
      metalness: 0.01,
    }),
  )
  dome.name = 'lamp_glow_core'
  dome.position.set(0, 0, 34.0)
  root.add(dome)
}

/** 4–6. Interruptores Schneider Electric Odace (Simples, Duplo, Comutador de Escada — 85 × 85 × 38 mm). */
function buildOdaceSwitch(root: THREE.Group, type: LightingSwitchType) {
  const frameWhite = stdMat('odace_frame_white', '#f3f4f1', 0.22, 0.02)
  const rockerWhite = stdMat('odace_rocker_white', '#f6f7f4', 0.20, 0.02)
  const housingGrey = stdMat('odace_backbox_grey', '#e0e3e6', 0.44, 0.03)
  const recessDark = stdMat('odace_recess_shadow', '#b9bfc4', 0.56, 0.04)
  const seamLine = stdMat('odace_seam_line', '#c7cdd2', 0.48, 0.04)

  // Caixa saliente traseira (z = 0..22 mm, 82 × 82 mm) com chanfro limpo
  const backBox = new THREE.Mesh(new RoundedBoxGeometry(82, 82, 22, 4, 3.0), housingGrey)
  backBox.position.set(0, 42.5, 11.0)
  root.add(backBox)

  // Bornes na face inferior da caixa saliente (y = 1,5): entrada do condutor em z = 12 (inalterada),
  // parafuso de aperto à frente da entrada e marcação L / 1 / 2 ao lado do parafuso, lida por baixo.
  const boxBottom = 42.5 - 41
  const terminals: Array<[string, number, string]> = type === 'wallSwitchSimple'
    ? [['L', -14, '#8b4513'], ['1', 14, '#ea580c']]
    : [['L', -18, '#8b4513'], ['1', 0, '#ea580c'], ['2', 18, '#d97706']]
  for (const [label, tx, color] of terminals) {
    addBrassTerminalWell(root, label, tx, 0.8, 12.0, color, { face: 'bottom', screw: [tx, boxBottom, 17.6], label: [tx + 6.8, boxBottom, 17.6] })
  }

  // Moldura quadrada frontal Schneider Odace Styl (85 × 85 × 10 mm, z = 22..32 mm)
  // Construída com furo central circular/quadrado rebaixado para o mecanismo Odace
  const outerFrame = new THREE.Mesh(new RoundedBoxGeometry(85, 85, 9.5, 5, 4.2), frameWhite)
  outerFrame.position.set(0, 42.5, 26.75)
  root.add(outerFrame)

  // Rebaixo circular característico da gama Schneider Odace (Ø58 mm)
  const bezelOuter = new THREE.Mesh(new THREE.RingGeometry(27.2, 29.0, 48), seamLine)
  bezelOuter.position.set(0, 42.5, 31.56)
  root.add(bezelOuter)

  const bezelFloor = new THREE.Mesh(new THREE.CircleGeometry(27.4, 48), recessDark)
  bezelFloor.position.set(0, 42.5, 31.53)
  root.add(bezelFloor)

  // Etiqueta frontal inferior da moldura (serigrafia Schneider Electric · Odace · L / 1 / 2)
  const brandStrip = new THREE.Mesh(
    new THREE.PlaneGeometry(52, 8.2),
    stdMat('odace_brand_strip_mat', '#f3f4f1', 0.26, 0.02),
  )
  brandStrip.name = 'lighting_switch_brand'
  brandStrip.position.set(0, 7.6, 31.58)
  root.add(brandStrip)

  if (type === 'wallSwitchDouble') {
    // Duas teclas independentes lado a lado inscritas no círculo Odace (Ø52 mm)
    for (const [idx, sign] of [[1, -1], [2, 1]] as const) {
      const pivot = new THREE.Group()
      pivot.name = `lighting_rocker_${idx}_pivot`
      pivot.position.set(sign * 13.1, 42.5, 31.4)

      // Forma em meia-lua / tecla Odace dupla com chanfro suave
      const rockerShape = new THREE.Shape()
      const r = 25.4
      const gap = 0.85
      if (sign < 0) {
        const startA = Math.acos(-gap / r)
        const endA = Math.PI * 2 - startA
        rockerShape.absarc(13.1, 0, r, startA, endA, false)
        rockerShape.closePath()
      } else {
        const endA = Math.acos(gap / r)
        const startA = -endA
        rockerShape.absarc(-13.1, 0, r, startA, endA, false)
        rockerShape.closePath()
      }
      const rockerGeo = new THREE.ExtrudeGeometry(rockerShape, {
        depth: 5.4,
        bevelEnabled: true,
        bevelThickness: 0.9,
        bevelSize: 0.75,
        bevelSegments: 3,
        curveSegments: 28,
      })
      const rockerMesh = new THREE.Mesh(rockerGeo, rockerWhite.clone())
      rockerMesh.name = `lighting_rocker_${idx}`
      rockerMesh.position.set(0, 0, 0.2)
      pivot.add(rockerMesh)

      // Pequena ranhura tátil/indicador na parte inferior da tecla
      const pip = new THREE.Mesh(
        new THREE.BoxGeometry(5.5, 1.0, 0.45),
        stdMat(`odace_pip_${idx}`, '#a7b0b7', 0.42, 0.05),
      )
      pip.position.set(sign * 1.4, -14.0, 6.55)
      pivot.add(pip)

      // Face de marcação subtil da tecla
      const faceDecal = new THREE.Mesh(
        new THREE.PlaneGeometry(15, 22),
        stdMat(`lighting_rocker_${idx}_decal_mat`, '#f6f7f4', 0.24, 0.02),
      )
      faceDecal.name = `lighting_rocker_${idx}_decal`
      faceDecal.position.set(sign * 0.5, 0, 6.56)
      pivot.add(faceDecal)

      root.add(pivot)
    }
  } else {
    // Tecla circular larga Odace (Simples ou Comutador de Escada)
    const pivot = new THREE.Group()
    pivot.name = 'lighting_rocker_pivot'
    pivot.position.set(0, 42.5, 31.4)

    const discShape = new THREE.Shape()
    discShape.absarc(0, 0, 25.5, 0, Math.PI * 2, false)
    const rockerGeo = new THREE.ExtrudeGeometry(discShape, {
      depth: 5.4,
      bevelEnabled: true,
      bevelThickness: 0.9,
      bevelSize: 0.8,
      bevelSegments: 3,
      curveSegments: 40,
    })
    const rockerMesh = new THREE.Mesh(rockerGeo, rockerWhite)
    rockerMesh.name = 'lighting_rocker'
    rockerMesh.position.set(0, 0, 0.2)
    pivot.add(rockerMesh)

    // Ranhura discreta de orientação / LED de localização
    const pip = new THREE.Mesh(
      new THREE.BoxGeometry(9.0, 1.1, 0.45),
      stdMat('odace_pip', type === 'wallSwitchStaircase' ? '#2c7a4b' : '#a7b0b7', 0.36, 0.06),
    )
    pip.position.set(0, -15.5, 6.55)
    pivot.add(pip)

    // Face para serigrafia (I / O ou ⇄ escada)
    const faceDecal = new THREE.Mesh(
      new THREE.PlaneGeometry(34, 34),
      stdMat('lighting_rocker_decal_mat', '#f6f7f4', 0.24, 0.02),
    )
    faceDecal.name = 'lighting_rocker_decal'
    faceDecal.position.set(0, 0, 6.56)
    pivot.add(faceDecal)

    root.add(pivot)
  }
}

/** Constrói o modelo CAD completo (em milímetros) de qualquer componente de iluminação. */
export function buildLightingModelMm(type: LightingComponentType): THREE.Group {
  const root = new THREE.Group()
  root.name = `lighting_${type}`
  switch (type) {
    case 'lampIncandescentE27':
      buildIncandescentBulb(root)
      break
    case 'lampFluorescentE27':
      buildFluorescentCflBulb(root)
      break
    case 'lampLedE27':
      buildLedA60Bulb(root)
      break
    case 'wallSwitchSimple':
    case 'wallSwitchDouble':
    case 'wallSwitchStaircase':
      buildOdaceSwitch(root, type)
      break
  }
  return root
}

/** Aplica as texturas de serigrafia (marca, potência, bornes e símbolos) num modelo carregado em runtime. */
export function applyLightingMarkings(
  root: THREE.Object3D,
  type: LightingComponentType,
  state?: Record<string, unknown>,
) {
  if (typeof document === 'undefined') return

  // Marcação de cada borne (L / N / 1 / 2) junto ao parafuso, na cor do condutor.
  root.traverse((node) => {
    const mesh = node as THREE.Mesh
    const label = /^lighting_terminal_label_(.+)$/.exec(mesh.name)?.[1]
    if (!mesh.isMesh || !label) return
    const tex = cachedCanvasTexture(`lighting:terminal-mark:${label}:v1`, 96, 96, (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h)
      ctx.fillStyle = LIGHTING_TERMINAL_INK[label] ?? '#334155'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.font = '800 76px "Inter", Arial, sans-serif'
      ctx.fillText(label, w / 2, h * 0.54, w - 8)
    })
    const mat = mesh.material as THREE.MeshStandardMaterial
    if (tex && mat.map !== tex) {
      bindCachedCanvasTexture(mat, tex)
      mat.map = tex
      mat.transparent = true
      mat.alphaTest = 0.04
      mat.depthWrite = false
      mat.color.set('#ffffff')
      mat.needsUpdate = true
    }
  })

  if (isLightingLampType(type)) {
    const spec = LAMP_SPECS[type]
    const { powerW, lumens } = lampPhotometrics(type, state?.powerW)
    const cctK = Number(state?.cctK) || spec.defaultCctK

    // Etiqueta no soquete E27 (bornes L e N + 230V~ E27)
    const socketLabel = root.getObjectByName('lighting_socket_label') as THREE.Mesh | undefined
    if (socketLabel?.isMesh) {
      // Os parafusos L / N ficam de cada lado; ao centro só a referência do casquilho.
      const tex = cachedCanvasTexture('lighting:e27-socket:v2', 300, 140, (ctx, w, h) => {
        ctx.fillStyle = '#f2f3ef'
        ctx.fillRect(0, 0, w, h)
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillStyle = '#4b535b'
        ctx.font = '700 48px "Inter", Arial, sans-serif'
        ctx.fillText('E27', w / 2, h * 0.34, w - 16)
        ctx.font = '600 34px "Inter", Arial, sans-serif'
        ctx.fillText('230V~', w / 2, h * 0.74, w - 16)
      })
      const mat = socketLabel.material as THREE.MeshStandardMaterial
      if (tex && mat.map !== tex) {
        bindCachedCanvasTexture(mat, tex)
        mat.map = tex
        mat.color.set('#ffffff')
        mat.needsUpdate = true
      }
    }

    // Serigrafia no corpo/balastro da CFL e da LED (tampografia direta transparente, sem retângulo de fundo)
    const ballastLabel = root.getObjectByName('lighting_ballast_label') as THREE.Mesh | undefined
    if (ballastLabel?.isMesh) {
      const tex = cachedCanvasTexture(`lighting:ballast:${type}:${powerW}:${cctK}:v2`, 512, 160, (ctx, w, h) => {
        ctx.clearRect(0, 0, w, h)
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillStyle = '#0b5ed7'
        ctx.font = '800 38px "Inter", Arial, sans-serif'
        ctx.fillText('PHILIPS', w / 2, h * 0.27)
        ctx.fillStyle = '#2c343c'
        ctx.font = '700 26px "Inter", Arial, sans-serif'
        ctx.fillText(type === 'lampLedE27' ? `CorePro LED · ${powerW}W` : `Genie CFL · ${powerW}W`, w / 2, h * 0.58)
        ctx.fillStyle = '#525b65'
        ctx.font = '600 20px "Inter", Arial, sans-serif'
        ctx.fillText(`${lumens} lm · ${cctK}K · 220-240V~`, w / 2, h * 0.85)
      })
      const mat = ballastLabel.material as THREE.MeshStandardMaterial
      if (tex && mat.map !== tex) {
        bindCachedCanvasTexture(mat, tex)
        mat.map = tex
        mat.transparent = true
        mat.alphaTest = 0.04
        mat.depthWrite = false
        mat.color.set('#ffffff')
        mat.needsUpdate = true
      }
    }
    return
  }

  // Serigrafia nos interruptores Schneider Electric Odace (tampografia transparente direta no espelho)
  const swSpec = SWITCH_SPECS[type]
  const brandStrip = root.getObjectByName('lighting_switch_brand') as THREE.Mesh | undefined
  if (brandStrip?.isMesh) {
    const tex = cachedCanvasTexture(`lighting:odace-brand:${type}:v2`, 640, 108, (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h)
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = '#0f8a3c'
      ctx.font = '800 34px "Inter", Arial, sans-serif'
      ctx.fillText('Schneider Electric', w / 2, h * 0.34)
      ctx.fillStyle = '#525b64'
      ctx.font = '600 22px "Inter", Arial, sans-serif'
      const termLegend = type === 'wallSwitchSimple' ? 'L · 1' : 'L · 1 · 2'
      ctx.fillText(`Odace ${swSpec.reference} · 10AX 250V~ · ${termLegend}`, w / 2, h * 0.76)
    })
    const mat = brandStrip.material as THREE.MeshStandardMaterial
    if (tex && mat.map !== tex) {
      bindCachedCanvasTexture(mat, tex)
      mat.map = tex
      mat.transparent = true
      mat.alphaTest = 0.04
      mat.depthWrite = false
      mat.color.set('#ffffff')
      mat.needsUpdate = true
    }
  }

  if (type === 'wallSwitchDouble') {
    for (const idx of [1, 2] as const) {
      const decal = root.getObjectByName(`lighting_rocker_${idx}_decal`) as THREE.Mesh | undefined
      if (!decal?.isMesh) continue
      const tex = cachedCanvasTexture(`lighting:odace-double-key:${idx}:v2`, 180, 260, (ctx, w, h) => {
        ctx.clearRect(0, 0, w, h)
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillStyle = '#5e6873'
        ctx.font = '700 36px "Inter", Arial, sans-serif'
        ctx.fillText('I', w / 2, h * 0.19)
        ctx.fillText('O', w / 2, h * 0.81)
        ctx.fillStyle = '#7b8590'
        ctx.font = '700 28px "Inter", Arial, sans-serif'
        ctx.fillText(String(idx), w / 2, h * 0.5)
      })
      const mat = decal.material as THREE.MeshStandardMaterial
      if (tex && mat.map !== tex) {
        bindCachedCanvasTexture(mat, tex)
        mat.map = tex
        mat.transparent = true
        mat.alphaTest = 0.04
        mat.depthWrite = false
        mat.color.set('#ffffff')
        mat.needsUpdate = true
      }
    }
  } else {
    const decal = root.getObjectByName('lighting_rocker_decal') as THREE.Mesh | undefined
    if (decal?.isMesh) {
      const tex = cachedCanvasTexture(`lighting:odace-single-key:${type}:v2`, 320, 320, (ctx, w, h) => {
        ctx.clearRect(0, 0, w, h)
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        if (type === 'wallSwitchStaircase') {
          // Símbolo clássico de comutador de escada (duas setas opostas + 1 / 2)
          ctx.strokeStyle = '#525c66'
          ctx.fillStyle = '#525c66'
          ctx.lineWidth = 7
          ctx.lineCap = 'round'
          ctx.lineJoin = 'round'
          // Seta para a direita (em cima)
          ctx.beginPath()
          ctx.moveTo(104, 134); ctx.lineTo(216, 134)
          ctx.moveTo(192, 114); ctx.lineTo(216, 134); ctx.lineTo(192, 154)
          // Seta para a esquerda (em baixo)
          ctx.moveTo(216, 186); ctx.lineTo(104, 186)
          ctx.moveTo(128, 166); ctx.lineTo(104, 186); ctx.lineTo(128, 206)
          ctx.stroke()
          ctx.font = '700 32px "Inter", Arial, sans-serif'
          ctx.fillStyle = '#6c7680'
          ctx.fillText('1', w / 2, 54)
          ctx.fillText('2', w / 2, h - 54)
        } else {
          ctx.fillStyle = '#5c6670'
          ctx.font = '700 44px "Inter", Arial, sans-serif'
          ctx.fillText('I', w / 2, 56)
          ctx.fillText('O', w / 2, h - 56)
        }
      })
      const mat = decal.material as THREE.MeshStandardMaterial
      if (tex && mat.map !== tex) {
        bindCachedCanvasTexture(mat, tex)
        mat.map = tex
        mat.transparent = true
        mat.alphaTest = 0.04
        mat.depthWrite = false
        mat.color.set('#ffffff')
        mat.needsUpdate = true
      }
    }
  }
}

/** Atualiza materiais emissivos das lâmpadas e rotação das teclas dos interruptores. */
export function applyLightingVisualState(
  root: THREE.Object3D,
  type: LightingComponentType,
  state: Record<string, unknown>,
  level = 1,
) {
  if (isLightingLampType(type)) {
    const spec = LAMP_SPECS[type]
    const on = Boolean(state.on)
    const { intensityScale } = lampPhotometrics(type, state.powerW)
    const cctK = Number(state.cctK) || spec.defaultCctK
    const pal = cctLightPalette(cctK, type === 'lampIncandescentE27')
    const k = on ? Math.max(0, Math.min(1.4, level)) : 0

    const filament = root.getObjectByName('lamp_filament') as THREE.Mesh | undefined
    if (filament?.isMesh) {
      const m = filament.material as THREE.MeshStandardMaterial
      m.color.set(k > 0.05 ? '#fff3b8' : '#585b62')
      m.emissive.set(k > 0.01 ? '#ff9d1a' : '#000000')
      m.emissiveIntensity = k * 3.8 * intensityScale
      m.needsUpdate = true
    }

    const glass = root.getObjectByName('lighting_bulb_glass') as THREE.Mesh | undefined
    if (glass?.isMesh) {
      const m = glass.material as THREE.MeshPhysicalMaterial
      m.color.set(k > 0.05 ? '#ffdf9a' : '#dedad0')
      m.emissive.set(k > 0.01 ? '#ffae34' : '#000000')
      m.emissiveIntensity = k * 0.42 * intensityScale
      m.opacity = 0.24 + k * 0.14
      m.needsUpdate = true
    }

    root.traverse((obj) => {
      if (obj.name !== 'lamp_glow_core' || !(obj as THREE.Mesh).isMesh) return
      const m = (obj as THREE.Mesh).material as THREE.MeshStandardMaterial
      if (type === 'lampIncandescentE27') {
        m.color.set('#ffcf66')
        m.emissive.set(k > 0.01 ? '#ffaa24' : '#000000')
        m.emissiveIntensity = k * 1.45 * intensityScale
        m.opacity = k > 0.01 ? Math.min(0.46, 0.06 + k * 0.38) : 0.02
      } else if (type === 'lampFluorescentE27') {
        const cflTint = cctK <= 3000 ? '#ffe19e' : cctK >= 6000 ? '#cdeaff' : '#dcf1ff'
        const cflEmissive = cctK <= 3000 ? '#ffc459' : cctK >= 6000 ? '#7cc8ff' : '#9ed9ff'
        m.color.set(k > 0.05 ? cflTint : '#f1f4f6')
        m.emissive.set(k > 0.01 ? cflEmissive : '#000000')
        m.emissiveIntensity = k * 0.88 * intensityScale
      } else {
        const ledTint = cctK <= 3000 ? '#ffdfa0' : cctK >= 6000 ? '#d8eeff' : '#fff0be'
        const ledEmissive = cctK <= 3000 ? '#ffbe4a' : cctK >= 6000 ? '#8dd0ff' : '#ffd875'
        m.color.set(k > 0.05 ? ledTint : '#f6f7f5')
        m.emissive.set(k > 0.01 ? ledEmissive : '#000000')
        m.emissiveIntensity = k * 0.96 * intensityScale
      }
      m.needsUpdate = true
    })
    return
  }

  // Interruptores Odace: rotação realista da(s) tecla(s) ±8,5° em torno de X
  const tilt = THREE.MathUtils.degToRad(SWITCH_SPECS[type].rockerTiltDeg)
  if (type === 'wallSwitchDouble') {
    const p1 = root.getObjectByName('lighting_rocker_1_pivot')
    const p2 = root.getObjectByName('lighting_rocker_2_pivot')
    if (p1) p1.rotation.x = state.on1 ? -tilt : tilt
    if (p2) p2.rotation.x = state.on2 ? -tilt : tilt
  } else {
    const p = root.getObjectByName('lighting_rocker_pivot')
    if (p) p.rotation.x = state.on ? -tilt : tilt
  }
}
