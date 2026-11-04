import * as THREE from 'three'

/**
 * Calha DIN perfurada (EN 60715) — gerador paramétrico 3D.
 *
 * Perfis: G-rail 15×5,5 (miniatura), TS35×7,5 (aparelhagem modular) e TS35×15
 * (aparelhos pesados). Usado pelo Painel 3D e pelo script de GLB.
 *
 * Referencial: comprimento em X, largura do perfil em Y, altura em Z —
 * o fundo do canal assenta na chapa (z = 0) e as abas de encaixe em +Z.
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

/** TS35 × 7,5 mm — perfil padrão de quadro (disjuntores, contactores, bornes). */
export const DIN_RAIL_35X75: DinRailProfile = {
  width: 35, height: 7.5, thickness: 1.1, channel: 27, slotWidth: 5.2, slotLength: 18, slotPitch: 25,
}

/** Geometria de um perfil DIN (EN 60715): largura total, altura, fundo do canal e furação. */
export interface DinRailProfile {
  width: number
  height: number
  thickness: number
  channel: number
  slotWidth: number
  slotLength: number
  slotPitch: number
}

/** Perfis disponíveis: G-rail 15×5,5 e TS35 (7,5 / 15 mm) para todos os encaixes modulares. */
export const DIN_RAIL_PROFILES: Record<string, DinRailProfile> = {
  '15×5,5 mm': DIN_RAIL_15X55,
  '35×7,5 mm': DIN_RAIL_35X75,
  '35×15 mm': { width: 35, height: 15, thickness: 1.5, channel: 27, slotWidth: 5.2, slotLength: 18, slotPitch: 25 },
}
export const DIN_RAIL_PROFILE_IDS = Object.keys(DIN_RAIL_PROFILES)
/** Perfil por omissão para calhas novas: TS35×7,5 (encaixe universal modular). */
export const DIN_RAIL_DEFAULT_PROFILE_ID = '35×7,5 mm'

/** Perfil guardado no estado da calha (valor desconhecido → TS35×7,5 mm). */
export function dinRailProfileOf(state: Record<string, unknown> | undefined): DinRailProfile {
  const id = typeof state?.profile === 'string' ? state.profile : ''
  return DIN_RAIL_PROFILES[id] ?? DIN_RAIL_PROFILES[DIN_RAIL_DEFAULT_PROFILE_ID]
}

/** Id do perfil (para UI); desconhecido → omissão. */
export function dinRailProfileIdOf(state: Record<string, unknown> | undefined): string {
  const id = typeof state?.profile === 'string' ? state.profile : ''
  return DIN_RAIL_PROFILES[id] ? id : DIN_RAIL_DEFAULT_PROFILE_ID
}

/** Acabamentos reais de calha: cor, metalização e rugosidade (a textura de zinco é comum). */
export const DIN_RAIL_FINISHES: Record<string, { color: string; metalness: number; roughness: number }> = {
  'Aço galvanizado': { color: '#c9cfd8', metalness: 0.85, roughness: 0.36 },
  'Aço zincado bicromatado': { color: '#e3cf8a', metalness: 0.8, roughness: 0.32 },
  'Alumínio': { color: '#d9dde2', metalness: 0.7, roughness: 0.42 },
}
export const DIN_RAIL_FINISH_IDS = Object.keys(DIN_RAIL_FINISHES)

export const clampRailLengthMm = (value: unknown): number => {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : DIN_RAIL_15X55.defaultLengthMm
  return Math.max(DIN_RAIL_15X55.minLengthMm, Math.min(DIN_RAIL_15X55.maxLengthMm, Math.round(n * 10) / 10))
}

/** Nº de furos para um comprimento (margem de meio passo em cada ponta). */
export const railSlotCount = (lengthMm: number, profile: DinRailProfile = DIN_RAIL_15X55): number =>
  Math.max(0, Math.floor((lengthMm - profile.slotLength) / profile.slotPitch) + 1)

export function createGalvanizedMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: '#c9cfd8', metalness: 0.85, roughness: 0.36, name: 'galvanized-steel' })
}

/**
 * Perfil em chapéu (EN 60715) com furos oblongos no fundo.
 * `unit` = unidades de cena por mm (0.01 no Painel 3D; 0.001 para GLB em metros).
 */
export function buildDinRailGroup(
  lengthMm: number,
  unit: number,
  material = createGalvanizedMaterial(),
  profile: DinRailProfile = DIN_RAIL_PROFILES[DIN_RAIL_DEFAULT_PROFILE_ID],
  perforated = true,
): THREE.Group {
  const spec = profile
  const L = clampRailLengthMm(lengthMm)
  const group = new THREE.Group()
  group.name = `din-rail-${spec.width}x${spec.height}`
  const t = spec.thickness
  const halfCh = spec.channel / 2
  const flangeW = (spec.width - spec.channel) / 2
  const h = spec.height

  // Fundo do canal com furos oblongos + paredes e abas (perfil chapéu EN 60715).
  const floor = new THREE.Shape()
  floor.moveTo(-L / 2, -halfCh)
  floor.lineTo(L / 2, -halfCh)
  floor.lineTo(L / 2, halfCh)
  floor.lineTo(-L / 2, halfCh)
  floor.closePath()
  const count = perforated ? railSlotCount(L, spec) : 0
  const start = count > 0 ? -((count - 1) * spec.slotPitch) / 2 : 0
  const r = spec.slotWidth / 2
  const halfSlot = Math.max(0.5, spec.slotLength / 2 - r)
  for (let i = 0; i < count; i++) {
    const cx = start + i * spec.slotPitch
    const hole = new THREE.Path()
    hole.moveTo(cx - halfSlot, -r)
    hole.lineTo(cx + halfSlot, -r)
    hole.absarc(cx + halfSlot, 0, r, -Math.PI / 2, Math.PI / 2, false)
    hole.lineTo(cx - halfSlot, r)
    hole.absarc(cx - halfSlot, 0, r, Math.PI / 2, (3 * Math.PI) / 2, false)
    floor.holes.push(hole)
  }
  const floorGeo = new THREE.ExtrudeGeometry(floor, { depth: t, bevelEnabled: false, curveSegments: 6 })
  floorGeo.scale(unit, unit, unit)
  const floorMesh = new THREE.Mesh(floorGeo, material)
  floorMesh.name = 'din-rail-floor'
  group.add(floorMesh)

  const box = (sx: number, sy: number, sz: number, x: number, y: number, z: number, name: string) => {
    const geo = new THREE.BoxGeometry(sx * unit, sy * unit, sz * unit)
    const mesh = new THREE.Mesh(geo, material)
    mesh.position.set(x * unit, y * unit, z * unit)
    mesh.name = name
    group.add(mesh)
  }
  // Paredes do canal + abas de encaixe (face superior = plano de montagem dos aparelhos).
  for (const side of [-1, 1] as const) {
    const yWall = side * (halfCh - t / 2)
    box(L, t, h - t, 0, yWall, t + (h - t) / 2, `din-rail-wall-${side > 0 ? 'p' : 'n'}`)
    const yFlange = side * (halfCh + flangeW / 2 - t / 2)
    box(L, flangeW, t, 0, yFlange, h - t / 2, `din-rail-flange-${side > 0 ? 'p' : 'n'}`)
  }
  // Reforço das abas (filete sob a aba, típico EN 60715) para leitura 3D mais clara.
  if (flangeW > 2 && h > 6) {
    for (const side of [-1, 1] as const) {
      const yLip = side * (halfCh + Math.min(1.2, flangeW * 0.25))
      box(L, Math.min(1.2, flangeW * 0.35), Math.min(1.5, h * 0.15), 0, yLip, h - t - Math.min(0.75, h * 0.08), `din-rail-lip-${side > 0 ? 'p' : 'n'}`)
    }
  }
  return group
}
