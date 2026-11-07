import type { Object3D } from 'three'

/** A vibração é relativa à base CAD; o repouso nunca pode recentrar a carcaça. */
export function updateMotorBodyMotion(body: Pick<Object3D, 'position' | 'rotation'>, restY: number, running: boolean, rpm: number, elapsed: number, delta: number) {
  if (running && rpm > 0.1) {
    const amp = Math.min(0.006, rpm * 0.0045)
    const low = Math.sin(elapsed * 24 * rpm) * amp
    const high = Math.sin(elapsed * 62) * amp * 0.35
    body.position.x = low * 0.3
    body.position.y = restY + (low + high) * 0.5
    body.rotation.z = Math.sin(elapsed * 28 * rpm) * 0.003
  } else {
    // O Canvas desenha a pedido: delta pode abranger muitos segundos de inatividade.
    // A interpolação exponencial permanece em [0, 1], sem saltos para fora da cena.
    const blend = 1 - Math.exp(-Math.max(0, delta) * 8)
    body.position.x += (0 - body.position.x) * blend
    body.position.y += (restY - body.position.y) * blend
    body.rotation.z += (0 - body.rotation.z) * blend
  }
}
