import * as THREE from 'three'
import type { ComponentType } from '../types'

/** Tipos compostos pelos bornes Phoenix PTI6 usados na capa e no Painel 3D. */
export const TERMINAL_ASSEMBLY_TYPES = new Set<ComponentType>([
  'powerSource1ph', 'powerSource3ph', 'terminalSet1ph', 'terminalSet3ph',
])

export const TERMINAL_BODY_COLORS: Record<string, string> = {
  L: '#171717', L1: '#171717', L2: '#8b4513', L3: '#6b7280', N: '#2563eb', PE: '#27834a',
}

export function isTerminalAssemblyComponent(type: ComponentType): boolean {
  return TERMINAL_ASSEMBLY_TYPES.has(type)
}

export function terminalAssemblyConductors(type: ComponentType): string[] {
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
