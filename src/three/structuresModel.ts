import type { ElectricalComponent } from '../types'

export type StructureComponentType =
  | 'industrialWall'
  | 'industrialPillar'
  | 'cableTrayStraight'
  | 'cableTrayElbow90'
  | 'cableTrayCross'
  | 'cableTrayVerticalBend'
  | 'cableTrayRiser90'
  | 'wireTrayStraight'
  | 'wireTrayElbow90'
  | 'wireTrayTee'
  | 'wireTrayRiser90'
  | 'conduitVdsStraight'
  | 'conduitVdsElbow90'
  | 'conduitCorrugated'
  | 'pipeClampPvc'
  | 'pipeClampMetalEpdm'
  | 'pipeClampMetalScrew'

export type ConduitStructureType =
  | 'conduitVdsStraight'
  | 'conduitVdsElbow90'
  | 'conduitCorrugated'
  | 'pipeClampPvc'
  | 'pipeClampMetalEpdm'
  | 'pipeClampMetalScrew'

export function isConduitStructureType(type: string): type is ConduitStructureType {
  return (
    type === 'conduitVdsStraight' ||
    type === 'conduitVdsElbow90' ||
    type === 'conduitCorrugated' ||
    type === 'pipeClampPvc' ||
    type === 'pipeClampMetalEpdm' ||
    type === 'pipeClampMetalScrew'
  )
}

export type CableTrayComponentType =
  | 'cableTrayStraight'
  | 'cableTrayElbow90'
  | 'cableTrayCross'
  | 'cableTrayVerticalBend'
  | 'cableTrayRiser90'
  | 'wireTrayStraight'
  | 'wireTrayElbow90'
  | 'wireTrayTee'
  | 'wireTrayRiser90'

export type WireMeshTrayComponentType =
  | 'wireTrayStraight'
  | 'wireTrayElbow90'
  | 'wireTrayTee'
  | 'wireTrayRiser90'

export function isWireMeshTrayType(type: string): type is WireMeshTrayComponentType {
  return (
    type === 'wireTrayStraight' ||
    type === 'wireTrayElbow90' ||
    type === 'wireTrayTee' ||
    type === 'wireTrayRiser90'
  )
}

export function isStructureComponentType(type: string): type is StructureComponentType {
  return (
    type === 'industrialWall' ||
    type === 'industrialPillar' ||
    type === 'cableTrayStraight' ||
    type === 'cableTrayElbow90' ||
    type === 'cableTrayCross' ||
    type === 'cableTrayVerticalBend' ||
    type === 'cableTrayRiser90' ||
    isWireMeshTrayType(type) ||
    isConduitStructureType(type)
  )
}

export function isCableTrayComponentType(type: string): type is CableTrayComponentType {
  return (
    type === 'cableTrayStraight' ||
    type === 'cableTrayElbow90' ||
    type === 'cableTrayCross' ||
    type === 'cableTrayVerticalBend' ||
    type === 'cableTrayRiser90' ||
    isWireMeshTrayType(type)
  )
}

export function isFloorGroundedStructureType(type: string): boolean {
  return type === 'industrialWall' || type === 'industrialPillar'
}

export type WallFinish = 'concrete' | 'panel' | 'brick'
export type PillarProfile = 'IPE160' | 'HEB200' | 'HEB240'
export type PillarFinish = 'steel' | 'galvanized' | 'safetyYellow'

export function industrialWallDimsOf(state?: Record<string, any>) {
  const lengthMm = Math.max(800, Math.min(8000, Math.round(Number(state?.lengthMm) || 3000)))
  const heightMm = Math.max(1600, Math.min(5500, Math.round(Number(state?.heightMm) || 3200)))
  const thicknessMm = Math.max(120, Math.min(360, Math.round(Number(state?.thicknessMm) || 200)))
  const finish: WallFinish = state?.finish === 'panel' || state?.finish === 'brick' ? state.finish : 'concrete'
  const skirting = state?.skirting !== false
  return { lengthMm, heightMm, thicknessMm, finish, skirting }
}

export function industrialPillarDimsOf(state?: Record<string, any>) {
  const heightMm = Math.max(1600, Math.min(6000, Math.round(Number(state?.heightMm) || 3200)))
  const profile: PillarProfile = state?.profile === 'IPE160' || state?.profile === 'HEB240' ? state.profile : 'HEB200'
  const finish: PillarFinish =
    state?.finish === 'galvanized' || state?.finish === 'safetyYellow' ? state.finish : 'steel'
  const sectionMm = profile === 'IPE160' ? 160 : profile === 'HEB240' ? 240 : 200
  const basePlateMm = sectionMm + 120
  return { heightMm, profile, finish, sectionMm, basePlateMm }
}

export function cableTrayDimsOf(type: CableTrayComponentType, state?: Record<string, any>) {
  const widthMm = Math.max(100, Math.min(500, Math.round(Number(state?.widthMm) || 200)))
  const sideHeightMm = Math.max(40, Math.min(120, Math.round(Number(state?.sideHeightMm) || 60)))
  const lengthMm = Math.max(300, Math.min(3000, Math.round(Number(state?.lengthMm) || 1200)))
  const radiusMm = Math.max(120, Math.min(380, Math.round(Number(state?.radiusMm) || 220)))
  const angleDeg = Math.max(15, Math.min(90, Math.round(Number(state?.angleDeg) || 45)))
  const withCover = Boolean(state?.withCover)
  const variant: 'cross' | 'tee' = state?.variant === 'tee' ? 'tee' : 'cross'
  const direction: 'up' | 'down' = state?.direction === 'down' ? 'down' : 'up'
  const riserKind: 'exterior' | 'interior' = state?.riserKind === 'interior' ? 'interior' : 'exterior'
  return { type, widthMm, sideHeightMm, lengthMm, radiusMm, angleDeg, withCover, variant, direction, riserKind }
}

export function structureComponentSizeMm(
  type: string,
  state?: Record<string, any>,
): { x: number; y: number; z: number } | null {
  if (type === 'industrialWall') {
    const d = industrialWallDimsOf(state)
    return { x: d.lengthMm, y: d.heightMm, z: d.thicknessMm }
  }
  if (type === 'industrialPillar') {
    const d = industrialPillarDimsOf(state)
    return { x: d.basePlateMm, y: d.heightMm, z: d.basePlateMm }
  }
  if (type === 'cableTrayStraight' || type === 'wireTrayStraight') {
    const d = cableTrayDimsOf(type, state)
    return { x: d.lengthMm, y: d.sideHeightMm + 10, z: d.widthMm }
  }
  if (type === 'cableTrayElbow90' || type === 'wireTrayElbow90') {
    const d = cableTrayDimsOf(type, state)
    const span = d.radiusMm + d.widthMm + 80
    return { x: span, y: d.sideHeightMm + 10, z: span }
  }
  if (type === 'cableTrayCross' || type === 'wireTrayTee') {
    const d = cableTrayDimsOf(type, state)
    const span = d.widthMm + 280
    return { x: span, y: d.sideHeightMm + 10, z: span }
  }
  if (type === 'cableTrayVerticalBend') {
    const d = cableTrayDimsOf(type, state)
    const rad = (d.angleDeg * Math.PI) / 180
    const seg = 220
    const spanX = Math.max(280, Math.round(seg + seg * Math.cos(rad) + 120))
    const spanY = Math.max(d.sideHeightMm + 80, Math.round(seg * Math.sin(rad) + d.sideHeightMm + 110))
    return { x: spanX, y: spanY, z: d.widthMm }
  }
  if (type === 'cableTrayRiser90' || type === 'wireTrayRiser90') {
    const d = cableTrayDimsOf(type, state)
    const span = d.radiusMm + d.sideHeightMm + 150
    return { x: span, y: span, z: d.widthMm }
  }
  if (type === 'conduitVdsStraight' || type === 'conduitCorrugated') {
    const dMm = Math.max(16, Math.min(63, Number(state?.diameterMm ?? 25)))
    const lMm = Math.max(250, Math.min(3000, Number(state?.lengthMm ?? 1000)))
    return { x: lMm, y: dMm + 28, z: dMm + 28 }
  }
  if (type === 'conduitVdsElbow90') {
    const dMm = Math.max(16, Math.min(63, Number(state?.diameterMm ?? 25)))
    const span = Math.max(160, Math.round(dMm * 5.2))
    return { x: span, y: dMm + 20, z: span }
  }
  if (type === 'pipeClampPvc' || type === 'pipeClampMetalEpdm' || type === 'pipeClampMetalScrew') {
    const dMm = Math.max(16, Math.min(63, Number(state?.diameterMm ?? 25)))
    return { x: dMm + 24, y: dMm + 36, z: dMm + 28 }
  }
  return null
}

/**
 * Calcula a posição 3D encaixada borda-a-borda (em unidades de cena, 1 u = 100 mm)
 * para acoplar imediatamente uma nova peça estrutural ou esteira a uma peça selecionada.
 */
export function computeQuickAttach3D(
  anchor: ElectricalComponent,
  anchorCenterU: { x: number; y: number; z: number },
  nextType: StructureComponentType,
  direction: 'right' | 'left' | 'front' | 'back' | 'up' | 'down',
): { position3D: { x: number; y: number; z: number }; statePatch: Record<string, any> } {
  const aSize = structureComponentSizeMm(anchor.type, anchor.state) ?? { x: 600, y: 100, z: 200 }
  const inheritedWidth = Number(anchor.state.widthMm) || 200
  const inheritedSideH = Number(anchor.state.sideHeightMm) || 60
  const statePatch: Record<string, any> = {}
  if (isCableTrayComponentType(nextType)) {
    statePatch.widthMm = inheritedWidth
    statePatch.sideHeightMm = inheritedSideH
  }
  if (isConduitStructureType(nextType)) {
    statePatch.diameterMm = Number(anchor.state.diameterMm) || 25
    statePatch.clampStyle = anchor.state.clampStyle ?? 'pvc-clip'
    statePatch.autoCouplers = true
  }
  if (nextType === 'industrialWall' && anchor.type === 'industrialWall') {
    statePatch.heightMm = anchor.state.heightMm ?? 3200
    statePatch.finish = anchor.state.finish ?? 'concrete'
  }
  const nSize = structureComponentSizeMm(nextType, statePatch) ?? { x: 600, y: 100, z: 200 }
  const U = 0.01
  const dx = ((aSize.x + nSize.x) * 0.5) * U
  const dy = ((aSize.y + nSize.y) * 0.5) * U
  const dz = ((aSize.z + nSize.z) * 0.5) * U

  let x = anchorCenterU.x
  let y = anchorCenterU.y
  let z = anchorCenterU.z
  if (direction === 'right') x += dx
  else if (direction === 'left') x -= dx
  else if (direction === 'front') z += dz
  else if (direction === 'back') z -= dz
  else if (direction === 'up') y += dy
  else if (direction === 'down') y -= dy

  return {
    position3D: {
      x: Math.round(x * 1000) / 1000,
      y: Math.round(y * 1000) / 1000,
      z: Math.round(z * 1000) / 1000,
    },
    statePatch,
  }
}

/**
 * Encaixe magnético (snap) ao arrastar uma estrutura ou esteira perto de outras:
 * alinha automaticamente bordas X/Y e centro Z quando dentro de `snapDistU` (~180 mm).
 */
/** Alcance do íman de estruturas (unidades do painel; 1 U = 100 mm). */
export const STRUCTURE_SNAP_DIST_U = 0.25

export function snapStructureDragXY(
  moving: ElectricalComponent,
  candidateXY: { x: number; y: number },
  others: ElectricalComponent[],
  pivots: Record<string, { x: number; y: number; z: number }>,
  // 0,25 U = 25 mm. Era 1,8 U (180 mm): numa parede com vários perfis quase todo o ponto ficava dentro do
  // alcance de algum alinhamento e a peça saltava de alvo em alvo em vez de seguir o rato.
  snapDistU = STRUCTURE_SNAP_DIST_U,
): { x: number; y: number; snapped: boolean } {
  if (!isStructureComponentType(moving.type)) return { ...candidateXY, snapped: false }
  const mSize = structureComponentSizeMm(moving.type, moving.state)
  if (!mSize) return { ...candidateXY, snapped: false }
  const U = 0.01
  const mHalfX = (mSize.x * 0.5) * U
  const mHalfY = (mSize.y * 0.5) * U

  let bestX = candidateXY.x
  let bestY = candidateXY.y
  let minDx = snapDistU
  let minDy = snapDistU
  let snapped = false

  for (const other of others) {
    if (other.id === moving.id || !isStructureComponentType(other.type)) continue
    const op = pivots[other.id]
    const oSize = structureComponentSizeMm(other.type, other.state)
    if (!op || !oSize) continue
    const oHalfX = (oSize.x * 0.5) * U
    const oHalfY = (oSize.y * 0.5) * U

    // Alinhamentos candidatos em X: esquerda-direita, direita-esquerda, mesmo centro X
    const xTargets = [
      op.x + oHalfX + mHalfX,
      op.x - oHalfX - mHalfX,
      op.x,
    ]
    for (const tx of xTargets) {
      const d = Math.abs(candidateXY.x - tx)
      if (d < minDx && Math.abs(candidateXY.y - op.y) < oHalfY + mHalfY + 4) {
        minDx = d
        bestX = tx
        snapped = true
      }
    }
    // Alinhamentos candidatos em Y: mesmo nível Y, topo-base, base-topo
    const yTargets = [
      op.y,
      op.y + oHalfY + mHalfY,
      op.y - oHalfY - mHalfY,
    ]
    for (const ty of yTargets) {
      const d = Math.abs(candidateXY.y - ty)
      if (d < minDy && Math.abs(candidateXY.x - op.x) < oHalfX + mHalfX + 4) {
        minDy = d
        bestY = ty
        snapped = true
      }
    }
  }
  return { x: bestX, y: bestY, snapped }
}

export interface StructureDatasheetInfo {
  path: string
  name: string
  manufacturer: string
  model: string
  summary: string
}

export const STRUCTURES_DATASHEETS: Record<StructureComponentType, StructureDatasheetInfo> = {
  industrialWall: {
    path: '/datasheets/structures/industrial-wall-3d.pdf',
    name: 'Parede Industrial Modular 3D (Ficha Técnica).pdf',
    manufacturer: 'DC-Simu Estruturas',
    model: 'Parede Modular PBR',
    summary: 'Betão pré-fabricado / Painel metálico / Alvenaria · 1000–8000 mm · Encaixe fácil',
  },
  industrialPillar: {
    path: '/datasheets/structures/industrial-pillar-3d.pdf',
    name: 'Pilar Metálico Estrutural IPE/HEB (Ficha Técnica).pdf',
    manufacturer: 'DC-Simu Estruturas',
    model: 'Coluna IPE 160 / HEB 200 / HEB 240',
    summary: 'Perfil laminado com placa de base aparafusada M20 e reforços laterais',
  },
  cableTrayStraight: {
    path: '/datasheets/structures/cable-tray-galvanized-3d.pdf',
    name: 'Esteira Porta-Cabos Perfurada Galvanizada (Ficha Técnica).pdf',
    manufacturer: 'DC-Simu / IEC 61537',
    model: 'Esteira Reta Perfurada · 100–400 mm',
    summary: 'Aço galvanizado Sendzimir perfurado com abas enroladas e tampa opcional',
  },
  cableTrayElbow90: {
    path: '/datasheets/structures/cable-tray-galvanized-3d.pdf',
    name: 'Curva Horizontal 90° de Esteira Porta-Cabos (Ficha Técnica).pdf',
    manufacturer: 'DC-Simu / IEC 61537',
    model: 'Curva Plana 90° · Galvanizada',
    summary: 'Curva horizontal 90° em chapa galvanizada com patilhas de união rápida',
  },
  cableTrayCross: {
    path: '/datasheets/structures/cable-tray-galvanized-3d.pdf',
    name: 'Cruzamento X / Derivação T de Esteira Porta-Cabos (Ficha Técnica).pdf',
    manufacturer: 'DC-Simu / IEC 61537',
    model: 'Cruzamento X / Tê · Galvanizado',
    summary: 'Derivação 4 vias (X) ou 3 vias (T) em chapa galvanizada com raios suaves',
  },
  cableTrayVerticalBend: {
    path: '/datasheets/structures/cable-tray-galvanized-3d.pdf',
    name: 'Pescoço Articulado Vertical de Esteira (Ficha Técnica).pdf',
    manufacturer: 'DC-Simu / IEC 61537',
    model: 'Curva Vertical Articulada · 15°–90°',
    summary: 'Pescoço articulado de subida/descida com parafusos de bloqueio lateral',
  },
  cableTrayRiser90: {
    path: '/datasheets/structures/cable-tray-galvanized-3d.pdf',
    name: 'Curva Vertical 90° Exterior/Interior de Esteira (Ficha Técnica).pdf',
    manufacturer: 'DC-Simu / IEC 61537',
    model: 'Riser Vertical 90° · Galvanizado',
    summary: 'Curva vertical rígida 90° exterior ou interior com uniões perfuradas',
  },
  wireTrayStraight: {
    path: '/datasheets/structures/wire-mesh-tray-cablofil-3d.pdf',
    name: 'Esteira Aramada Reta Galvanizada · Cablofil / OBO GR-Magic (Ficha Técnica).pdf',
    manufacturer: 'Cablofil / OBO GR-Magic',
    model: 'Leito Aramado Reto · Arame Ø4,8 mm',
    summary: 'Malha aberta soldada em aço eletrozincado · Borda de segurança T · Suportes consola/trapézio & cascata drop-out',
  },
  wireTrayElbow90: {
    path: '/datasheets/structures/wire-mesh-tray-cablofil-3d.pdf',
    name: 'Curva 90° de Esteira Aramada Galvanizada (Ficha Técnica).pdf',
    manufacturer: 'Cablofil / OBO GR-Magic',
    model: 'Curva Horizontal 90° Aramada',
    summary: 'Curva horizontal 90° em malha de aço eletrozincado Ø4,8 mm com grampos de união rápida',
  },
  wireTrayTee: {
    path: '/datasheets/structures/wire-mesh-tray-cablofil-3d.pdf',
    name: 'Derivação Tê / Cruz de Esteira Aramada Galvanizada (Ficha Técnica).pdf',
    manufacturer: 'Cablofil / OBO GR-Magic',
    model: 'Derivação Tê / Cruz X Aramada',
    summary: 'Derivação 3 vias (T) ou 4 vias (X) em arame galvanizado soldado com acessórios de união rápida',
  },
  wireTrayRiser90: {
    path: '/datasheets/structures/wire-mesh-tray-cablofil-3d.pdf',
    name: 'Curva Vertical / Subida 90° de Esteira Aramada (Ficha Técnica).pdf',
    manufacturer: 'Cablofil / OBO GR-Magic',
    model: 'Riser Vertical 90° Aramado',
    summary: 'Subida/descida vertical 90° interior ou exterior em malha aramada eletrozincada Ø4,8 mm',
  },
  conduitVdsStraight: {
    path: '/datasheets/structures/conduit-vds-corrugated-clamps-3d.pdf',
    name: 'Tubo VDS Rígido PVC-U c/ Serigrafia, Encaixes e Abraçadeiras (Ficha Técnica).pdf',
    manufacturer: 'DC-Simu / EN 61386-21',
    model: 'Tubo VDS Rígido Ø16–Ø50 mm · 750N',
    summary: 'PVC-U rígido cinzento com serigrafia técnica, uniões fêmea automáticas e 0–10 abraçadeiras PVC ou metálicas',
  },
  conduitVdsElbow90: {
    path: '/datasheets/structures/conduit-vds-corrugated-clamps-3d.pdf',
    name: 'Curva 90° Tubo VDS Rígido c/ Encaixes Automáticos (Ficha Técnica).pdf',
    manufacturer: 'DC-Simu / EN 61386-21',
    model: 'Curva VDS 90° · Ø16–Ø50 mm',
    summary: 'Curva rígida 90° em PVC-U com bolsas de encaixe fêmea automáticas nas duas extremidades',
  },
  conduitCorrugated: {
    path: '/datasheets/structures/conduit-vds-corrugated-clamps-3d.pdf',
    name: 'Tubo Corrugado Flexível Anelado Ø16–Ø40 mm (Ficha Técnica).pdf',
    manufacturer: 'DC-Simu / EN 61386-22',
    model: 'Tubo Corrugado Flexível 320N / 750N',
    summary: 'Tubo flexível corrugado preto/cinza/laranja, reto ou curvo até 180°, com abraçadeiras opcionais',
  },
  pipeClampPvc: {
    path: '/datasheets/structures/conduit-vds-corrugated-clamps-3d.pdf',
    name: 'Abraçadeira Clip PVC VDS Modular (Ficha Técnica).pdf',
    manufacturer: 'DC-Simu / VDS',
    model: 'Clip PVC Encaixe Rápido Ø16–Ø50 mm',
    summary: 'Abraçadeira em PVC cinzento com encaixe lateral modular em rabo-de-andorinha e furo central',
  },
  pipeClampMetalEpdm: {
    path: '/datasheets/structures/conduit-vds-corrugated-clamps-3d.pdf',
    name: 'Abraçadeira Metálica Zincada c/ Borracha EPDM (Ficha Técnica).pdf',
    manufacturer: 'DC-Simu / DIN 3567',
    model: 'Abraçadeira Isófona EPDM M8/M10',
    summary: 'Cinta metálica galvanizada bipartida com perfil antivibração em borracha preta EPDM e porca soldada M8/M10',
  },
  pipeClampMetalScrew: {
    path: '/datasheets/structures/conduit-vds-corrugated-clamps-3d.pdf',
    name: 'Abraçadeira Metálica Simples c/ Espigão Roscado (Ficha Técnica).pdf',
    manufacturer: 'DC-Simu / Fixação',
    model: 'Abraçadeira Metálica 2 Parafusos + Espigão',
    summary: 'Abraçadeira em aço galvanizado de 2 parafusos laterais com espigão roscado para bucha/parede',
  },
}
