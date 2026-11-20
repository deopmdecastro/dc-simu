import * as THREE from 'three'
import { GEYA_FUNCTIONS, GEYA_RANGES_MS, INDUSTRIAL_INFO, isIndustrialDevice, type IndustrialControl } from '../../electrical/industrialDevices'
import { INDUSTRIAL_LED_NODES, industrialLedVars } from '../../three/industrialFinish'
import { DEVICE_LCD_COLORS } from '../../three/deviceLcd'
import { buildDefinitionObject, newId, type GlbCache } from '../../catalog/definition'
import type { ComponentDefinition, ControlDef, Vec3 } from '../../catalog/types'

const SEED = 'industrial-manufacturer-v3'
/** Called only for a NEW builtin draft. Never recreates a deleted control or
 * overwrites authored interactions, parts, terminal positions or publications. */
export function seedIndustrial(type: string, def: ComponentDefinition, cache: GlbCache): boolean {
  if (!isIndustrialDevice(type) || def.builtinSeeds?.includes(SEED) || def.controls?.length || def.displays?.length || def.lights.length || def.interactions.length) return false
  const part = def.parts.find(p => p.kind === 'glb')
  if (!part) return false
  const root = buildDefinitionObject(def, cache), model = root.getObjectByName(part.id)
  if (!model) return false
  const state = structuredClone(INDUSTRIAL_INFO[type].defaultState)
  const initial = { ...state, ...industrialLedVars(type, state) }
  for (const [id, value] of Object.entries(initial)) {
    if (value === null || !['boolean', 'number', 'string'].includes(typeof value) || def.vars?.some(v => v.id === id)) continue
    def.vars = [...(def.vars ?? []), { id, name: id, type: typeof value === 'boolean' ? 'bool' : typeof value === 'number' ? 'number' : 'text', initial: value as boolean | number | string }]
  }
  const control = (name: string, nodeName: string, action: IndustrialControl, extra: Partial<ControlDef> = {}) => {
    if (!model.getObjectByName(nodeName)) return
    def.controls = [...(def.controls ?? []), {
      id: newId('ctl_'), name, kind: 'button', partId: part.id, nodes: [nodeName],
      axis: [0, 0, 1], travelMm: 0, positions: [], returnMode: 'latch',
      actions: [{ type: 'industrial', device: type, control: action }], ...extra,
    }]
  }
  if (type === 'vfdSchneiderAtv320') {
    // This compact ATV has an encoder/ENTER and ESC, not RUN/STOP/MODE keys.
    control('ESC', 'industrial_escape', 'escape', { travelMm: .6 })
    control('Encoder / ENTER · roda: referência e menus', 'industrial_encoder', 'enter')
    control('Tampa de acesso aos bornes', 'industrial_cover_latch', 'cover', { kind: 'toggle', bindVar: 'controlCoverOpen' })
    const lcd = model.getObjectByName('industrial_lcd')
    if (lcd) {
      const box = new THREE.Box3().setFromObject(lcd, true), size = box.getSize(new THREE.Vector3())
      const centre = root.worldToLocal(box.getCenter(new THREE.Vector3()))
      def.displays = [{
        id: newId('disp_'), name: 'Altivar · visor local', kind: 'text', deviceFace: 'atv320',
        position: centre.toArray() as Vec3, normal: [0, 0, 1], roll: 0,
        widthMm: size.x, heightMm: size.y, density: 30, background: DEVICE_LCD_COLORS.background, foreground: DEVICE_LCD_COLORS.atv,
        powerVar: 'powered', hideNodesPart: part.id, hideNodes: ['industrial_lcd'],
        lines: [{ id: newId('ln_'), text: '{industrialDisplay}', x: .95, y: .68, size: .72, align: 'right' }],
      }]
    }
  }
  if (type === 'relayFinder5534') control('TEST momentâneo · sem trava', 'industrial_test', 'test', {
    bindVar: 'testPressed', holdVar: 'testPressed', returnMode: 'spring', travelMm: .8, actions: [],
  })
  if (type === 'timerGeyaGrt8M1' || type === 'timerGeyaGrt8M2' || type === 'timerGeyaGrt8B1') {
    control('Escala de tempo', 'industrial_range', 'range', {
      kind: 'selector', bindVar: 'rangeMs',
      positions: GEYA_RANGES_MS.map((ms, i) => ({ id: String(ms), label: ms < 0 ? 'ON' : ms === 0 ? 'OFF' : `${ms / 1000} s`, angle: -i * 36 })),
    })
    control('Fração de escala', 'industrial_fraction', 'fraction', {
      kind: 'selector', bindVar: 'fraction',
      positions: Array.from({ length: 10 }, (_, i) => ({ id: String((i + 1) / 10), label: `${(i + 1) * 10} %`, angle: -i * 30 })),
    })
    if (type === 'timerGeyaGrt8M1' || type === 'timerGeyaGrt8M2') control('Função A B C D E F G H I J', 'industrial_function', 'function', {
      kind: 'selector', bindVar: 'function', positions: GEYA_FUNCTIONS.map((label, i) => ({ id: label, label, angle: -i * 36 })),
    })
  }
  model.traverse(node => {
    const variable = INDUSTRIAL_LED_NODES[node.name]
    if (!variable || !(node instanceof THREE.Mesh)) return
    const colour = String(node.userData.ledColor ?? '#25c85d')
    def.lights.push({ id: newId('led_'), name: variable, partId: part.id, nodes: [node.name], kind: 'led', color: colour, intensity: 2, glassColor: colour, when: { var: variable } })
  })
  def.builtinSeeds = [...(def.builtinSeeds ?? []), SEED]
  return true
}
