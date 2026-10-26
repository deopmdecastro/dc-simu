import * as THREE from 'three'
import { selectorValue, toggleIsOn, type MeterReading, type Vars } from './behavior'
import { displayPixelSize, drawDisplay } from './displayCanvas'
import { motionAngle, normalizeMotion, pivotFromBox, stepSpring } from './controlMotion'
import type { StateAnimator } from './stateAnimator'
import type { ComponentDefinition, ControlDef, DisplayDef, SpinDef } from './types'

/** Nó (peça ou nó dentro do GLB) a que um controlo está ligado. */
export function controlNodes(root: THREE.Object3D, control: { partId: string; nodes?: string[] }): THREE.Object3D[] {
  const part = root.getObjectByName(control.partId)
  if (!part) return []
  if (control.nodes === undefined) return [part]
  return control.nodes.map((name) => part.getObjectByName(name)).filter((node): node is THREE.Object3D => !!node)
}

/** Contentor dos objetos de um GLB: desce enquanto cada nó só tem um filho (Root → RootNode → [objetos…]). */
export function glbContainer(part: THREE.Object3D): THREE.Object3D {
  let node = part
  while (node.children.length === 1 && !(node.children[0] as THREE.Mesh).isMesh) node = node.children[0]
  return node
}

/** O objeto independente (botão, manípulo, LED…) a que um nó pertence: o filho direto do contentor. */
export function topNodeOf(object: THREE.Object3D, part: THREE.Object3D): THREE.Object3D | null {
  const container = glbContainer(part)
  let node: THREE.Object3D | null = object
  while (node && node.parent && node.parent !== container) node = node.parent
  return node && node.parent === container ? node : null
}

export interface GlbNodeInfo { name: string; meshes: number; centre: [number, number, number]; size: [number, number, number]; color?: string; emissive?: boolean }

/** Cor do material com mais área (aprox.: mais vértices) e se algum material emite luz. */
function materialLook(node: THREE.Object3D): { color?: string; emissive?: boolean } {
  const weight = new Map<string, number>()
  let emissive = false
  node.traverse((child) => {
    const mesh = child as THREE.Mesh
    if (!mesh.isMesh) return
    const count = (mesh.geometry as THREE.BufferGeometry | undefined)?.attributes?.position?.count ?? 1
    for (const material of (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) as Array<THREE.Material & { color?: THREE.Color; emissive?: THREE.Color; emissiveIntensity?: number }>) {
      if (material?.color) weight.set(`#${material.color.getHexString()}`, (weight.get(`#${material.color.getHexString()}`) ?? 0) + count)
      if (material?.emissive && material.emissive.getHex() !== 0 && (material.emissiveIntensity ?? 1) > 0) emissive = true
    }
  })
  const color = [...weight.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
  return { ...(color ? { color } : {}), ...(emissive ? { emissive } : {}) }
}

/** Objetos de um GLB (nomes, nº de malhas, centro e tamanho no espaço da peça). */
export function listGlbNodes(part: THREE.Object3D): GlbNodeInfo[] {
  part.updateWorldMatrix(true, true)
  return glbContainer(part).children.filter((child) => child.name).map((child) => {
    let meshes = 0
    child.traverse((node) => { if ((node as THREE.Mesh).isMesh) meshes += 1 })
    const box = new THREE.Box3().setFromObject(child, true)
    const centre = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3())
    const round = (v: THREE.Vector3): [number, number, number] => [v.x, v.y, v.z].map((n) => Math.round(n * 100) / 100) as [number, number, number]
    return { name: child.name, meshes, centre: round(centre), size: round(size), ...materialLook(child) }
  }).sort((a, b) => a.name.localeCompare(b.name))
}

const _m = new THREE.Matrix4()
interface Moving { node: THREE.Object3D; local0: THREE.Matrix4; parentToRoot: THREE.Matrix4 }
interface Item {
  control: ControlDef
  moving: Moving[]
  pivot: THREE.Vector3
  axis: THREE.Vector3
  value: number
  target: number
  /** Velocidade da mola (só botões/interruptores com «clique com mola»). */
  velocity: number
  held: boolean
  /** Caixa dos objetos do controlo na pose de repouso (espaço do componente). */
  restBox: THREE.Box3
}

interface DisplayItem { def: DisplayDef; canvas: HTMLCanvasElement; texture: THREE.CanvasTexture; mesh: THREE.Mesh; signature: string }

/**
 * Faz mexer os botões/seletores e desenha os ecrãs de um componente construído a partir da definição
 * (editor e painel 3D do simulador). O estado vem de fora (`setVars`); a rig só o representa.
 */
interface Spinner { node: THREE.Object3D; spin: SpinDef; axis: THREE.Vector3; base: THREE.Quaternion; last: THREE.Quaternion; angle: number }

/** Velocidade (voltas/s, com sinal) de uma peça com rotação contínua, a partir das variáveis. */
export function spinRate(spin: SpinDef, vars: Vars): number {
  const tps = Math.max(0, Number(spin.turnsPerSecond) || 0)
  const sign = spin.reverse ? -1 : 1
  if (!spin.source || spin.source === '$rpm') {
    const rpm = Math.max(0, Math.min(1, Number(vars.$rpm ?? 0) || 0))
    const dir = vars.$dir === 'ccw' || vars.$dir === -1 ? -1 : 1
    return tps * rpm * dir * sign
  }
  const value = vars[spin.source]
  if (typeof value === 'boolean') return value ? tps * sign : 0
  const n = Number(value)
  return Number.isFinite(n) ? tps * Math.max(-1, Math.min(1, n)) * sign : 0
}

export class ComponentRig {
  private readonly spinners: Spinner[] = []
  private hiddenParts: THREE.Object3D[] = []
  /** Variáveis que mudam a cada frame (velocidade do motor): não passam pelo `setVars`. */
  private readonly live: Vars = {}
  private readonly items = new Map<string, Item>()
  private readonly displays: DisplayItem[] = []
  private readonly owner = new Map<THREE.Object3D, string>()
  private readonly hidden: THREE.Object3D[] = []
  private readonly proxies: THREE.Mesh[] = []
  private proxiesOn = true
  private vars: Vars = {}
  private reading: MeterReading | null = null
  private stateName = ''

  constructor(private readonly def: ComponentDefinition, private readonly root: THREE.Object3D, private readonly animator?: StateAnimator | null) {
    root.updateWorldMatrix(true, true)
    const rootInverse = new THREE.Matrix4().copy(root.matrixWorld).invert()
    for (const control of def.controls ?? []) {
      const nodes = controlNodes(root, control)
      if (!nodes.length) continue
      const box = new THREE.Box3()
      for (const node of nodes) box.expandByObject(node, true)
      const restBox = new THREE.Box3()
      if (!box.isEmpty()) for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) restBox.expandByPoint(new THREE.Vector3(x, y, z).applyMatrix4(rootInverse))
      const tilt = control.kind !== 'selector' && control.motion?.mode === 'tilt'
      const pivot = box.isEmpty() ? new THREE.Vector3()
        : tilt ? new THREE.Vector3(...pivotFromBox(restBox.min.toArray() as [number, number, number], restBox.max.toArray() as [number, number, number], normalizeMotion(control.motion).pivotRel))
        : box.getCenter(new THREE.Vector3()).applyMatrix4(rootInverse)
      const axis = new THREE.Vector3(...control.axis).normalize()
      if (axis.lengthSq() < 0.5) axis.set(0, 1, 0)
      const moving = nodes.map((node): Moving => ({ node, local0: node.matrix.clone(), parentToRoot: new THREE.Matrix4().multiplyMatrices(rootInverse, node.parent ? node.parent.matrixWorld : root.matrixWorld) }))
      this.items.set(control.id, { control, moving, pivot, axis, value: 0, target: 0, velocity: 0, held: false, restBox })
      for (const node of nodes) node.traverse((child) => this.owner.set(child, control.id))
      if (control.nodes !== undefined) this.addProxy(control, box)
    }
    for (const part of def.parts) {
      if (!part.spin) continue
      const node = root.getObjectByName(part.id)
      if (!node) continue
      const axis = new THREE.Vector3(part.spin.axis === 'x' ? 1 : 0, part.spin.axis === 'y' ? 1 : 0, part.spin.axis === 'z' ? 1 : 0)
      this.spinners.push({ node, spin: part.spin, axis, base: node.quaternion.clone(), last: node.quaternion.clone(), angle: 0 })
    }
    for (const display of def.displays ?? []) {
      this.addDisplay(display)
      const part = display.hideNodesPart ? root.getObjectByName(display.hideNodesPart) : null
      for (const name of display.hideNodes ?? []) { const node = part?.getObjectByName(name); if (node) { node.visible = false; this.hidden.push(node) } }
    }
  }

  /**
   * Zona de clique invisível sobre o controlo (caixa que envolve os seus objetos): as malhas de um GLB
   * costumam ser finas ou vazadas e o raio passava através delas (ex.: só as barras amarelas do seletor).
   */
  private addProxy(control: ControlDef, worldBox: THREE.Box3) {
    const part = this.root.getObjectByName(control.partId)
    if (!part || worldBox.isEmpty()) return
    const inverse = new THREE.Matrix4().copy(part.matrixWorld).invert()
    const local = new THREE.Box3()
    for (const x of [worldBox.min.x, worldBox.max.x]) for (const y of [worldBox.min.y, worldBox.max.y]) for (const z of [worldBox.min.z, worldBox.max.z]) local.expandByPoint(new THREE.Vector3(x, y, z).applyMatrix4(inverse))
    const size = local.getSize(new THREE.Vector3()).addScalar(0.2)
    size.z = Math.max(size.z, 0.6); size.x = Math.max(size.x, 0.6); size.y = Math.max(size.y, 0.6)
    const proxy = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), new THREE.MeshBasicMaterial({ visible: false }))
    proxy.position.copy(local.getCenter(new THREE.Vector3()))
    proxy.name = `hit:${control.id}`
    proxy.userData.hitProxy = true
    part.add(proxy)
    this.proxies.push(proxy)
    this.owner.set(proxy, control.id)
    if (!this.proxiesOn) proxy.raycast = () => {}
  }

  /** As zonas de clique só valem quando os controlos se usam (simulação); ao editar não tapam a geometria. */
  setHitProxies(on: boolean) {
    this.proxiesOn = on
    for (const proxy of this.proxies) proxy.raycast = on ? THREE.Mesh.prototype.raycast : () => {}
  }

  private addDisplay(display: DisplayDef) {
    const { w, h } = displayPixelSize(display)
    const canvas = document.createElement('canvas')
    canvas.width = w; canvas.height = h
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.anisotropy = 4
    const material = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 })
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(Math.max(0.5, display.widthMm), Math.max(0.5, display.heightMm)), material)
    mesh.name = `display:${display.id}`
    mesh.userData.display = display.id
    mesh.raycast = () => {}
    const normal = new THREE.Vector3(...display.normal)
    if (normal.lengthSq() < 0.1) normal.set(0, 0, 1)
    normal.normalize()
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal)
    mesh.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), THREE.MathUtils.degToRad(display.roll || 0)))
    mesh.position.set(...display.position).addScaledVector(normal, 0.12)
    mesh.renderOrder = 5
    this.root.add(mesh)
    this.displays.push({ def: display, canvas, texture, mesh, signature: '' })
  }

  /** Atualiza variáveis e leitura: reposiciona controlos e redesenha os ecrãs que mudaram. */
  setVars(vars: Vars, reading: MeterReading | null = this.reading, stateName = this.stateName) {
    this.vars = vars; this.reading = reading; this.stateName = stateName
    for (const item of this.items.values()) {
      const control = item.control
      if (control.kind === 'selector') {
        const position = control.positions.find((entry) => entry.id === selectorValue(control, vars))
        item.target = position ? position.angle : item.target
      } else item.target = item.held || (control.kind === 'toggle' || control.actions.some((a) => a.type === 'toggleVar' || a.type === 'behavior') ? toggleIsOn(control, vars) : false) ? 1 : 0
    }
    this.animator?.setVars(vars)
    this.redraw()
    this.apply()
  }

  private redraw() {
    for (const item of this.displays) {
      const signature = JSON.stringify([this.vars, this.reading, this.stateName, item.def])
      if (signature === item.signature) continue
      item.signature = signature
      drawDisplay(item.canvas, item.def, this.vars, this.reading, this.stateName)
      item.texture.needsUpdate = true
    }
  }

  /** Objeto atingido → id do controlo (o mais específico). */
  controlAt(object: THREE.Object3D | null): string | null {
    for (let node = object; node; node = node.parent) { const id = this.owner.get(node); if (id) return id }
    return null
  }

  /**
   * Controlo atingido por um raio: o mais próximo entre as interseções até `windowMm` atrás da primeira
   * (botões ligeiramente rebaixados na moldura continuam clicáveis; o que está bem atrás não).
   */
  controlFromHits(hits: THREE.Intersection[], windowMm: number): string | null {
    const first = hits[0]
    if (!first) return null
    for (const hit of hits) {
      if (hit.distance - first.distance > windowMm) break
      const id = this.controlAt(hit.object)
      if (id) return id
    }
    return null
  }

  controlById(id: string) { return this.def.controls?.find((control) => control.id === id) }

  /** Caixa (espaço do componente) dos objetos de um controlo na pose de repouso — base do pivô relativo. */
  restBox(id: string): THREE.Box3 | null { return this.items.get(id)?.restBox ?? null }

  /** Pivô atual (espaço do componente) de um controlo, para o desenhar no editor. */
  pivotOf(id: string): THREE.Vector3 | null { return this.items.get(id)?.pivot.clone() ?? null }

  /** Botão premido/largado (visual). */
  hold(id: string, held: boolean) {
    const item = this.items.get(id)
    if (!item || item.control.kind === 'selector') return
    item.held = held
    this.setVars(this.vars)
  }

  /** Aplica já a pose final (sem animação). */
  snap() { for (const item of this.items.values()) { item.value = item.target; item.velocity = 0 } this.apply() }

  private apply() {
    for (const item of this.items.values()) {
      const { control } = item
      const delta = new THREE.Matrix4()
      if (control.kind === 'selector' || (control.motion?.mode === 'tilt')) {
        const angle = control.kind === 'selector' ? item.value : motionAngle(normalizeMotion(control.motion), item.value)
        delta.makeRotationAxis(item.axis, THREE.MathUtils.degToRad(angle))
        _m.makeTranslation(item.pivot.x, item.pivot.y, item.pivot.z)
        delta.premultiply(_m)
        _m.makeTranslation(-item.pivot.x, -item.pivot.y, -item.pivot.z)
        delta.multiply(_m)
      } else delta.makeTranslation(-item.axis.x * control.travelMm * item.value, -item.axis.y * control.travelMm * item.value, -item.axis.z * control.travelMm * item.value)
      for (const entry of item.moving) {
        // local = P⁻¹ · delta · P · local0
        const inverse = new THREE.Matrix4().copy(entry.parentToRoot).invert()
        const local = new THREE.Matrix4().copy(inverse).multiply(delta).multiply(entry.parentToRoot).multiply(entry.local0)
        local.decompose(entry.node.position, entry.node.quaternion, entry.node.scale)
        entry.node.updateMatrix()
      }
    }
  }

  /** `$rpm` (0…1) e `$dir` ('cw'/'ccw') do motor, lidos a cada frame. */
  setLive(vars: Vars) { Object.assign(this.live, vars) }

  private spinOn = true
  /** No modo de edição a rotação pára e a peça volta à pose (o gizmo edita a pose real). */
  setSpinEnabled(on: boolean) {
    if (this.spinOn === on) return
    this.spinOn = on
    if (!on) for (const item of this.spinners) { item.node.quaternion.copy(item.base); item.last.copy(item.base); item.angle = 0 }
  }

  /** Há peças com rotação contínua? */
  get hasSpinners() { return this.spinners.length > 0 }

  /** Peças opcionais ocultas pelo utilizador no projeto (olho nas propriedades). */
  setHiddenParts(ids: readonly string[]) {
    for (const node of this.hiddenParts) node.visible = true
    this.hiddenParts = ids.map((id) => this.root.getObjectByName(id)).filter((node): node is THREE.Object3D => !!node)
    for (const node of this.hiddenParts) node.visible = false
  }

  /** Rotação contínua (pás, rolos): compõe com a pose dos estados sem a destruir. */
  private updateSpinners(delta: number): boolean {
    let moving = false
    if (!this.spinOn) return false
    const q = new THREE.Quaternion()
    for (const item of this.spinners) {
      // O animador pode ter reposto a pose: essa passa a ser a nova base.
      if (!item.node.quaternion.equals(item.last)) item.base.copy(item.node.quaternion)
      const rate = spinRate(item.spin, { ...this.vars, ...this.live })
      if (rate === 0) continue
      item.angle = (item.angle + rate * Math.PI * 2 * delta) % (Math.PI * 2)
      item.node.quaternion.copy(item.base).multiply(q.setFromAxisAngle(item.axis, item.angle))
      item.last.copy(item.node.quaternion)
      moving = true
    }
    return moving
  }

  /** Devolve true enquanto algo se mexe (para a vista pedir novo frame). */
  update(delta: number): boolean {
    const spinning = this.updateSpinners(delta)
    let moving = false
    for (const node of this.hiddenParts) node.visible = false
    const k = 1 - Math.exp(-delta * 14)
    for (const item of this.items.values()) {
      if (item.control.kind !== 'selector') {
        // botões/interruptores: deslizar suave (antigo) ou mola com ressalto (basculante)
        const motion = normalizeMotion(item.control.motion)
        if (stepSpring(item, item.target, delta, motion.feel, motion.durationMs)) moving = true
        continue
      }
      const diff = item.target - item.value
      if (Math.abs(diff) > 0.05) { item.value += diff * k; moving = true } else if (diff !== 0) { item.value = item.target; moving = true }
    }
    if (moving) this.apply()
    return moving || spinning
  }

  dispose() {
    for (const item of this.items.values()) for (const entry of item.moving) { entry.node.matrix.copy(entry.local0); entry.local0.decompose(entry.node.position, entry.node.quaternion, entry.node.scale) }
    this.hidden.forEach((node) => { node.visible = true }); this.hidden.length = 0
    for (const item of this.spinners) item.node.quaternion.copy(item.base)
    this.spinners.length = 0
    for (const node of this.hiddenParts) node.visible = true
    this.hiddenParts = []
    for (const display of this.displays) { this.root.remove(display.mesh); display.mesh.geometry.dispose(); (display.mesh.material as THREE.Material).dispose(); display.texture.dispose() }
    this.proxies.forEach((proxy) => { proxy.removeFromParent(); proxy.geometry.dispose(); (proxy.material as THREE.Material).dispose() }); this.proxies.length = 0
    this.displays.length = 0; this.items.clear(); this.owner.clear()
  }
}
