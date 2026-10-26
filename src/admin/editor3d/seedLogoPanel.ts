import * as THREE from 'three'
import { boundsMm, buildDefinitionObject, newId, type GlbCache } from '../../catalog/definition'
import type { ComponentDefinition, ControlAction, DisplayLine, Vec3 } from '../../catalog/types'
import { getComponentModelSpec } from '../../three/modelPaths'
import { logoScreenRect } from '../../three/logoScreen'

const SEED = 'logo-panel-v1'
const PAGES = ['home', 'io', 'clock', 'diagnostics']
const KEYS = [
  { key: 'esc', label: 'ESC', x: 16.3, y: 28.9, width: 8, height: 4.2 },
  { key: 'ok', label: 'OK', x: 27.6, y: 28.9, width: 8, height: 4.2 },
  { key: 'up', label: '↑', x: 21.8, y: 45.8, width: 4.8, height: 5.8 },
  { key: 'down', label: '↓', x: 21.8, y: 35.5, width: 4.8, height: 5.8 },
  { key: 'left', label: '←', x: 16.6, y: 40.6, width: 4.8, height: 5.8 },
  { key: 'right', label: '→', x: 27, y: 40.6, width: 4.8, height: 5.8 },
] as const
const vec = (v: THREE.Vector3): Vec3 => v.toArray() as Vec3

/** LCD e teclas reais do LOGO. O CAD junta teclas na mesma malha; as áreas
 * independentes permitem editá-las/acioná-las sem deslocar o corpo do PLC. */
export function seedLogoPanel(def: ComponentDefinition, cache: GlbCache): boolean {
  if (def.builtinSeeds?.includes(SEED)) return false
  const spec = getComponentModelSpec('plcSiemensLogo1224RC')!
  const part = def.parts.find((item) => item.kind === 'glb' && item.asset && !item.glbNode && def.assets[item.asset]?.data === spec.path)
  if (!part || !part.asset || !cache.has(part.asset)) return false
  const addControls = !(def.controls ?? []).length, addDisplay = !(def.displays ?? []).length
  if (!addControls && !addDisplay) return false

  // A pose canónica serve também rascunhos antigos com rotação/escala própria.
  // As áreas ficam locais à peça; o LCD segue a transformação atual do autor.
  const fitted = def.assets[part.asset].builtinType === 'plcSiemensLogo1224RC'
  const canonicalPart = { ...part, parentId: null, position: [0, 0, 0] as Vec3, scale: [1, 1, 1] as Vec3,
    rotation: (fitted ? [0, 0, 0] : spec.rotation.map(THREE.MathUtils.radToDeg)) as Vec3 }
  const canonicalDef = { ...def, parts: [canonicalPart] }
  const canonical = buildDefinitionObject(canonicalDef, cache)
  canonical.updateMatrixWorld(true)
  const holder = canonical.getObjectByName(part.id)!
  const box = boundsMm(canonicalDef, cache), size = box.getSize(new THREE.Vector3())
  const screen = logoScreenRect(canonical)
  if (screen.maxX - screen.minX < 1 || screen.maxY - screen.minY < 1) return false
  const local = holder.matrixWorld.clone().invert()
  const current = buildDefinitionObject(def, cache)
  current.updateMatrixWorld(true)
  const actual = current.getObjectByName(part.id)!
  const transform = new THREE.Matrix4().multiplyMatrices(actual.matrixWorld, local)
  if (Math.abs(transform.determinant()) < 1e-12) return false
  const u = new THREE.Vector3(1, 0, 0).transformDirection(transform)
  const v = new THREE.Vector3(0, 1, 0).transformDirection(transform)
  if (Math.abs(u.dot(v)) > 1e-4) return false // DisplayDef não representa cisalhamento.
  const normal = u.clone().cross(v).normalize()
  const align = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal)
  const basisU = new THREE.Vector3(1, 0, 0).applyQuaternion(align), basisV = new THREE.Vector3(0, 1, 0).applyQuaternion(align)
  const scale = new THREE.Vector3().setFromMatrixScale(transform)

  if (addControls) def.controls = KEYS.map((key) => {
    const center = new THREE.Vector3(box.min.x + (key.x + 36) / 72 * size.x, box.min.y + key.y / 90 * size.y, box.min.z + (27.6 + 27.5) / 55 * size.z)
    const region = new THREE.Box3().setFromCenterAndSize(center, new THREE.Vector3(key.width / 72 * size.x, key.height / 90 * size.y, .8 / 55 * size.z)).applyMatrix4(local)
    const pageAction: ControlAction = key.key === 'esc' ? { type: 'setVar', var: 'logoPage', value: 'home' }
      : { type: 'cycleVar', var: 'logoPage', values: key.key === 'up' || key.key === 'left' ? [PAGES[0], ...PAGES.slice(1).reverse()] : PAGES }
    return { id: newId('ctl_'), name: `Tecla ${key.label}`, kind: 'button', partId: part.id, nodes: [],
      hitArea: { position: vec(region.getCenter(new THREE.Vector3())), size: vec(region.getSize(new THREE.Vector3())) },
      axis: vec(new THREE.Vector3(0, 0, 1).transformDirection(local)), travelMm: 0, returnMode: 'spring', positions: [],
      actions: [{ type: 'setVar', var: 'logoKey', value: key.label }, pageAction] }
  })
  if (addDisplay) {
    const lines: DisplayLine[] = []
    const page = (id: string, texts: string[]) => texts.forEach((text, row) => lines.push({ id: newId('ln_'), text, x: .05, y: .14 + row * .235, size: .16, align: 'left', when: { var: 'logoPage', op: 'eq', value: id } }))
    page('home', ['LOGO! 12/24', '> {logoMode}', 'I {logoInputs}', 'Q {logoOutputs}'])
    page('io', ['I 12345678', '  {logoInputs}', 'Q 1234', '  {logoOutputs}'])
    page('clock', ['{logoTime}', '{logoDate}', '', 'Tecla {logoKey}'])
    page('diagnostics', ['DIAGNOSTICO', 'ERROS {logoErrors}', 'AVISOS {logoWarnings}', '{logoMode}'])
    const position = new THREE.Vector3((screen.minX + screen.maxX) / 2, (screen.minY + screen.maxY) / 2, screen.z).applyMatrix4(transform)
    def.displays = [{ id: newId('dsp_'), name: 'LCD LOGO!', kind: 'text', position: vec(position), normal: vec(normal),
      roll: THREE.MathUtils.radToDeg(Math.atan2(u.dot(basisV), u.dot(basisU))),
      widthMm: (screen.maxX - screen.minX - 3 * size.x / 72) * scale.x,
      heightMm: (screen.maxY - screen.minY - 3 * size.y / 90) * scale.y,
      density: 16, background: '#a9c28a', foreground: '#16231a', powerVar: 'logoPowered', backlightVar: 'logoBacklight',
      backlightColor: '#bedba2', backlightStrength: .12, lines }]
  }
  const variables = [
    { id: 'logoPage', name: 'Página do LCD', initial: 'home', type: 'text' },
    { id: 'logoKey', name: 'Tecla premida', initial: '', type: 'text' },
    { id: 'logoMode', name: 'Estado do PLC', initial: 'STOP', type: 'text' },
    { id: 'logoInputs', name: 'Entradas I1–I8', initial: '00000000', type: 'text' },
    { id: 'logoOutputs', name: 'Saídas Q1–Q4', initial: '0000', type: 'text' },
    { id: 'logoTime', name: 'Hora no LCD', initial: '--:--', type: 'text' },
    { id: 'logoDate', name: 'Data no LCD', initial: '--/--/----', type: 'text' },
    { id: 'logoErrors', name: 'Erros', initial: 0, type: 'number' },
    { id: 'logoWarnings', name: 'Avisos', initial: 0, type: 'number' },
    { id: 'logoPowered', name: 'LCD ligado', initial: true, type: 'bool' },
    { id: 'logoBacklight', name: 'Retroiluminação', initial: true, type: 'bool' },
  ] as const
  def.vars = [...(def.vars ?? []), ...variables.filter((variable) => !def.vars?.some((item) => item.id === variable.id))]
  def.builtinSeeds = [...(def.builtinSeeds ?? []), SEED]
  return true
}
