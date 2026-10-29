import * as THREE from 'three'

/**
 * Estúdio de fotografia de produto, gerado localmente (sem HDR externo).
 *
 * O `RoomEnvironment` é uma sala difusa quase uniforme: os aparelhos brancos e
 * cinzentos ficavam sem reflexos definidos e pareciam gesso («foscos»). Aqui a
 * sala é escura e em gradiente, e a luz vem de caixas de luz retangulares — como
 * num estúdio — o que dá brilho especular nítido ao termoplástico acetinado, linhas
 * de reflexo nos metais e sombra de forma nas arestas.
 *
 * Um único mapa PMREM por renderizador (cache em WeakMap).
 */
const envCache = new WeakMap<THREE.WebGLRenderer, THREE.Texture>()

/** Tone mapping comum: «Neutral» (Khronos PBR) conserva as cores de fábrica —
 *  o ACES lavava os vermelhos para rosa e os brancos para cinzento. */
export const STUDIO_TONE_MAPPING = THREE.NeutralToneMapping
export const STUDIO_EXPOSURE = 1.4

function softbox(scene: THREE.Scene, w: number, h: number, intensity: number, color: string, position: [number, number, number], lookAt: [number, number, number] = [0, 0, 0]) {
  const material = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.DoubleSide })
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material)
  panel.position.set(...position)
  panel.lookAt(...lookAt)
  scene.add(panel)
}

/** Cena do estúdio (unidades arbitrárias; o PMREM só usa as direções). */
export function createStudioScene(): THREE.Scene {
  const scene = new THREE.Scene()
  // Sala em gradiente: teto cinzento claro, horizonte neutro, chão escuro.
  const room = new THREE.SphereGeometry(20, 48, 24)
  const colors: number[] = []
  const position = room.attributes.position
  const top = new THREE.Color('#9aa3ad'), mid = new THREE.Color('#6b7480'), floor = new THREE.Color('#2a2f36')
  const c = new THREE.Color()
  for (let i = 0; i < position.count; i++) {
    const t = position.getY(i) / 20
    if (t >= 0) c.copy(mid).lerp(top, Math.min(1, t * 1.4))
    else c.copy(mid).lerp(floor, Math.min(1, -t * 2.2))
    colors.push(c.r, c.g, c.b)
  }
  room.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  scene.add(new THREE.Mesh(room, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })))

  // Caixa de luz principal (frente-cima-esquerda), larga e suave.
  softbox(scene, 9, 6, 7.5, '#fff6ea', [-6, 9, 9])
  // Faixa de recorte à direita (desenha a aresta lateral dos aparelhos DIN).
  softbox(scene, 2.2, 12, 6, '#eef4ff', [12, 3, 3])
  // Faixa de contraluz em cima-atrás (separa o topo dos bornes do fundo).
  softbox(scene, 14, 1.8, 4.5, '#ffffff', [0, 12, -9])
  // Rebatedor frontal baixo: abre as sombras dos manípulos e das lentes.
  softbox(scene, 10, 3, 2.2, '#fbfdff', [0, -3, 14])
  // Pequena faixa à esquerda para o brilho do lado oposto.
  softbox(scene, 1.6, 9, 2.6, '#fff9f2', [-13, 2, -2])
  return scene
}

/** Mapa de ambiente PMREM do estúdio para este renderizador (criado uma vez). */
export function getStudioEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
  const cached = envCache.get(renderer)
  if (cached) return cached
  const pmrem = new THREE.PMREMGenerator(renderer)
  const scene = createStudioScene()
  const texture = pmrem.fromScene(scene, 0.035).texture
  scene.traverse((node) => {
    const mesh = node as THREE.Mesh
    if (!mesh.isMesh) return
    mesh.geometry.dispose()
    ;(mesh.material as THREE.Material).dispose()
  })
  pmrem.dispose()
  envCache.set(renderer, texture)
  return texture
}

/** Esquecer o mapa (por exemplo, depois de perder o contexto WebGL). */
export function releaseStudioEnvironment(renderer: THREE.WebGLRenderer) {
  const cached = envCache.get(renderer)
  if (!cached) return
  cached.dispose()
  envCache.delete(renderer)
}

/** Luzes diretas complementares (sombra e forma), comuns às capturas. */
export function addStudioLights(scene: THREE.Scene, radius = 4) {
  scene.add(new THREE.HemisphereLight('#ffffff', '#3b4350', 0.35))
  const key = new THREE.DirectionalLight('#fff7ee', 1.35)
  key.position.set(-radius * 0.7, radius * 1.3, radius * 1.6)
  scene.add(key)
  const rim = new THREE.DirectionalLight('#e8f0ff', 0.55)
  rim.position.set(radius * 1.5, radius * 0.6, -radius * 0.4)
  scene.add(rim)
}
