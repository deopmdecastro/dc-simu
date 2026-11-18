import * as THREE from 'three'
import type { ComponentType } from '../types'
import { cachedDangerStickerTexture } from './protectionMarkings'

/** Tipos nativos com GLBs compostos a partir do borne Phoenix PTI6 original. */
export const TERMINAL_ASSEMBLY_TYPES = new Set<ComponentType>([
  'powerSource1ph', 'powerSource3ph', 'powerSource24v', 'terminalSet1ph', 'terminalSet3ph', 'terminalSet24v',
])

export const TERMINAL_BODY_COLORS: Record<string, string> = {
  L: '#171717', L1: '#171717', L2: '#8b4513', L3: '#6b7280', N: '#2563eb', PE: '#27834a',
  /** 24 Vdc: 0 V preto, +24 V vermelho, PE verde. */
  '0V': '#171717', '+24V': '#dc2626',
}

/** Etiqueta de borne de conjunto: condutor + sentido opcional (`+24V-IN`, `PE-OUT`, `L1`). */
export const TERMINAL_CONDUCTOR_PATTERN = /^(\+24V|0V|L1|L2|L3|L|N|PE)(?:-(IN|OUT))?$/

export function isTerminalAssemblyComponent(type: ComponentType): boolean {
  return TERMINAL_ASSEMBLY_TYPES.has(type)
}

export function terminalAssemblyConductors(type: ComponentType): string[] {
  if (type.endsWith('24v')) return ['0V', '+24V', 'PE']
  return type.endsWith('1ph') ? ['L', 'N', 'PE'] : ['L1', 'L2', 'L3', 'N', 'PE']
}

export function terminalAssemblyLayout(type: ComponentType, widthMm: number) {
  const conductors = terminalAssemblyConductors(type)
  return conductors.map((conductor, index) => ({
    conductor,
    x: (index - (conductors.length - 1) / 2) * widthMm,
    color: TERMINAL_BODY_COLORS[conductor] ?? '#6b7280',
  }))
}

/** Tampa transparente em policarbonato/acrílico de proteção com 4 parafusos de retenção e aviso de perigo. */
export function buildTerminalAssemblyCoverGroup(widthMm: number, heightMm: number, depthMm: number, unit = 0.01): THREE.Group {
  const group = new THREE.Group()
  group.name = 'terminal-assembly-cover-group'

  const covW = widthMm + 3.2
  const covH = heightMm - 6.0
  const covD = 8.5
  const frontZ = depthMm / 2 + covD / 2 - 1.2

  const clearMat = new THREE.MeshPhysicalMaterial({
    color: '#ffffff',
    transparent: true,
    opacity: 0.38,
    roughness: 0.12,
    metalness: 0.05,
    transmission: 0.90,
    ior: 1.49,
    depthWrite: false,
  })

  const boxGeo = new THREE.BoxGeometry(covW * unit, covH * unit, covD * unit)
  const boxMesh = new THREE.Mesh(boxGeo, clearMat)
  boxMesh.position.set(0, 0, frontZ * unit)
  group.add(boxMesh)

  const edgeGeo = new THREE.EdgesGeometry(boxGeo)
  const edgeMesh = new THREE.LineSegments(edgeGeo, new THREE.LineBasicMaterial({ color: '#94a3b8', transparent: true, opacity: 0.5 }))
  edgeMesh.position.copy(boxMesh.position)
  group.add(edgeMesh)

  const screwMat = new THREE.MeshStandardMaterial({ color: '#e2e8f0', metalness: 0.85, roughness: 0.28 })
  const slotMat = new THREE.MeshBasicMaterial({ color: '#1e293b' })
  const screwR = 1.65
  const screwH = 0.8
  const padX = covW / 2 - 2.8
  const padY = covH / 2 - 3.4
  const screwZ = frontZ + covD / 2 + 0.1

  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      const px = sx * padX
      const py = sy * padY
      const sMesh = new THREE.Mesh(new THREE.CylinderGeometry(screwR * unit, screwR * unit, screwH * unit, 16), screwMat)
      sMesh.rotateX(Math.PI / 2)
      sMesh.position.set(px * unit, py * unit, screwZ * unit)
      group.add(sMesh)

      const slot1 = new THREE.Mesh(new THREE.BoxGeometry(screwR * 1.5 * unit, 0.4 * unit, 0.2 * unit), slotMat)
      slot1.position.set(px * unit, py * unit, (screwZ + 0.45) * unit)
      group.add(slot1)
      const slot2 = new THREE.Mesh(new THREE.BoxGeometry(0.4 * unit, screwR * 1.5 * unit, 0.2 * unit), slotMat)
      slot2.position.set(px * unit, py * unit, (screwZ + 0.45) * unit)
      group.add(slot2)
    }
  }

  const dangerTex = cachedDangerStickerTexture()
  if (dangerTex) {
    const decalSizeMm = Math.min(24, Math.max(16, covW * 0.72))
    const decalGeo = new THREE.PlaneGeometry(decalSizeMm * unit, decalSizeMm * unit)
    const decalMat = new THREE.MeshBasicMaterial({
      map: dangerTex,
      transparent: true,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
    const decalMesh = new THREE.Mesh(decalGeo, decalMat)
    decalMesh.position.set(0, 0, (frontZ + covD / 2 + 0.2) * unit)
    group.add(decalMesh)
  }

  return group
}

/** Tinge só os materiais neutros do corpo do PTI6 e preserva a ferragem. */
export function tintTerminalBodyMaterials(root: THREE.Object3D, color: string): void {
  root.traverse((node) => {
    const mesh = node as THREE.Mesh
    if (!mesh.isMesh || !mesh.material) return
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    for (const material of materials) {
      const coloredMaterial = material as THREE.Material & { color?: THREE.Color }
      if (!coloredMaterial.color) continue
      const hsl = { h: 0, s: 0, l: 0 }
      coloredMaterial.color.getHSL(hsl)
      if (hsl.s < 0.16 && hsl.l > 0.42) coloredMaterial.color.set(color)
    }
  })
}

