import * as THREE from 'three'

/**
 * Calha DIN perfurada 15 × 5,5 mm (aço galvanizado) — gerador paramétrico.
 *
 * É usado pelo Painel 3D (comprimento editável) e pelo script que produz o GLB
 * de 1 m (`scripts/build-din-rail-glb.ts`), garantindo que ambos são idênticos.
 *
 * Referencial: comprimento em X, largura (15 mm) em Y, altura do perfil
 * (5,5 mm) em Z — o fundo do canal assenta na chapa (z = 0) e os bordos ficam
 * virados para o utilizador (+Z), tal como numa calha montada no painel.
 */
export const DIN_RAIL_15X55 = {
  width: 15,
  height: 5.5,
  thickness: 1,
  /** largura do fundo do canal (junto à chapa) */
  channel: 9,
  slotWidth: 4.2,
  slotLength: 15,
  slotPitch: 25,
  defaultLengthMm: 1000,
  minLengthMm: 25,
  maxLengthMm: 3000,
} as const

export const clampRailLengthMm = (value: unknown): number => {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : DIN_RAIL_15X55.defaultLengthMm
  return Math.max(DIN_RAIL_15X55.minLengthMm, Math.min(DIN_RAIL_15X55.maxLengthMm, Math.round(n * 10) / 10))
}

/** Nº de furos para um comprimento (margem de meio passo em cada ponta). */
export const railSlotCount = (lengthMm: number): number =>
  Math.max(0, Math.floor((lengthMm - DIN_RAIL_15X55.slotLength) / DIN_RAIL_15X55.slotPitch) + 1)

export function createGalvanizedMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: '#c9cfd8', metalness: 0.85, roughness: 0.36, name: 'galvanized-steel' })
}

/** `unit` = metros por mm da geometria devolvida (0.01 → escala do Painel 3D; 0.001 → GLB em metros). */
export function buildDinRailGroup(lengthMm: number, unit: number, material = createGalvanizedMaterial()): THREE.Group {
  const spec = DIN_RAIL_15X55
  const L = clampRailLengthMm(lengthMm)
  const group = new THREE.Group()
  group.name = 'din-rail-15x5.5'
  const t = spec.thickness

  // Fundo do canal com furos oblongos (Shape + holes → ExtrudeGeometry).
  const floor = new THREE.Shape()
  floor.moveTo(-L / 2, -spec.channel / 2)
  floor.lineTo(L / 2, -spec.channel / 2)
  floor.lineTo(L / 2, spec.channel / 2)
  floor.lineTo(-L / 2, spec.channel / 2)
  floor.closePath()
  const count = railSlotCount(L)
  const start = -((count - 1) * spec.slotPitch) / 2
  const r = spec.slotWidth / 2
  const half = spec.slotLength / 2 - r
  for (let i = 0; i < count; i++) {
    const cx = start + i * spec.slotPitch
    const hole = new THREE.Path()
    hole.moveTo(cx - half, -r)
    hole.lineTo(cx + half, -r)
    hole.absarc(cx + half, 0, r, -Math.PI / 2, Math.PI / 2, false)
    hole.lineTo(cx - half, r)
    hole.absarc(cx - half, 0, r, Math.PI / 2, (3 * Math.PI) / 2, false)
    floor.holes.push(hole)
  }
  const floorGeo = new THREE.ExtrudeGeometry(floor, { depth: t, bevelEnabled: false, curveSegments: 5 })
  floorGeo.scale(unit, unit, unit)
  group.add(new THREE.Mesh(floorGeo, material))

  const box = (sx: number, sy: number, sz: number, x: number, y: number, z: number) => {
    const geo = new THREE.BoxGeometry(sx * unit, sy * unit, sz * unit)
    const mesh = new THREE.Mesh(geo, material)
    mesh.position.set(x * unit, y * unit, z * unit)
    group.add(mesh)
  }
  const wallY = spec.channel / 2 - t / 2
  const flangeW = (spec.width - spec.channel) / 2
  for (const side of [-1, 1]) {
    // Paredes do canal
    box(L, t, spec.height, 0, side * wallY, spec.height / 2)
    // Abas superiores (onde os aparelhos encaixam)
    box(L, flangeW, t, 0, side * (spec.channel / 2 + flangeW / 2 - t / 2), spec.height - t / 2)
  }
  return group
}
