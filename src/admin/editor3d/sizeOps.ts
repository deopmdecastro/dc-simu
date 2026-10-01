import * as THREE from 'three'
import { boundsMm } from '../../catalog/definition'
import type { ComponentDefinition, Vec3 } from '../../catalog/types'
import { glbCache, useEditorStore } from './editorStore'

const mul = (v: Vec3, k: number): Vec3 => [v[0] * k, v[1] * k, v[2] * k]
const round = (n: number) => Math.round(n * 1000) / 1000

/**
 * Escala TUDO o que está em milímetros (peças, bornes, ecrãs, poses dos estados) por `k`, em torno da origem do
 * componente (centro X/Z, base Y = 0). Mantém bornes, ecrãs e animações alinhados com o modelo.
 */
export function scaleDefinition(def: ComponentDefinition, k: number): ComponentDefinition {
  const m = (v: Vec3) => mul(v, k).map(round) as Vec3
  return {
    ...def,
    parts: def.parts.map((part) => ({
      ...part,
      position: m(part.position),
      // GLB: a escala da peça muda; primitivas guardam as dimensões reais em `size`
      ...(part.kind === 'glb' ? { scale: m(part.scale) } : { size: m(part.size) }),
    })),
    terminals: def.terminals.map((terminal) => ({ ...terminal, position: m(terminal.position) })),
    displays: def.displays?.map((display) => ({ ...display, position: m(display.position), widthMm: round(display.widthMm * k), heightMm: round(display.heightMm * k) })),
    states: def.states.map((state) => ({
      ...state,
      parts: Object.fromEntries(Object.entries(state.parts).map(([id, over]) => [id, { ...over, ...(over.position ? { position: m(over.position) } : {}) }])),
    })),
  }
}

export function currentSizeMm(): THREE.Vector3 {
  const box = boundsMm(useEditorStore.getState().def, glbCache)
  return box.getSize(new THREE.Vector3())
}

/** Redimensiona o componente inteiro (proporcional) para que a dimensão do eixo escolhido passe a `mm`. */
export function setRealSize(axis: 0 | 1 | 2, mm: number): void {
  const size = currentSizeMm()
  const now = [size.x, size.y, size.z][axis]
  if (!(mm > 0) || !(now > 0)) return
  const k = mm / now
  if (Math.abs(k - 1) < 1e-4) return
  useEditorStore.getState().edit((def) => scaleDefinition(def, k), 'real-size')
  useEditorStore.getState().cameraTo('fit')
}
