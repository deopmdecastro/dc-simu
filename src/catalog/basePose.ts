/**
 * Pose de repouso de cada nó de um modelo de componente.
 *
 * A `ComponentRig` é reconstruída sempre que a definição muda (controlos, luzes,
 * estados…) mas o objeto 3D é o mesmo: nesse instante os nós ainda trazem a
 * rotação que a animação anterior lhes deixou. Medir aí a caixa do manípulo dava
 * um eixo de rotação deslocado e o manípulo orbitava fora do encaixe (ver
 * `DC-ADR-058`).
 *
 * A pose verdadeira é guardada em `userData` logo que o modelo é montado a partir
 * da definição — antes de qualquer animação. `userData` sobrevive a `clone()`.
 */
export const BASE_POSE_KEY = 'dcsimuBasePose'

export interface BasePose {
  position: number[]
  quaternion: number[]
  scale: number[]
}

/** Guarda a pose atual de todos os nós (só preenche os que ainda não têm). */
export function stampBasePose(root: import('three').Object3D) {
  root.traverse((node) => {
    if (node.userData[BASE_POSE_KEY]) return
    node.userData[BASE_POSE_KEY] = {
      position: node.position.toArray(),
      quaternion: node.quaternion.toArray(),
      scale: node.scale.toArray(),
    } satisfies BasePose
  })
}

/** Devolve o nó à pose de repouso. Sem pose guardada, assume a atual como base. */
export function restoreBasePose(node: import('three').Object3D) {
  const saved = node.userData[BASE_POSE_KEY] as BasePose | undefined
  if (saved) {
    node.position.fromArray(saved.position)
    node.quaternion.fromArray(saved.quaternion)
    node.scale.fromArray(saved.scale)
  } else {
    node.userData[BASE_POSE_KEY] = {
      position: node.position.toArray(),
      quaternion: node.quaternion.toArray(),
      scale: node.scale.toArray(),
    } satisfies BasePose
  }
  node.updateMatrix()
}
