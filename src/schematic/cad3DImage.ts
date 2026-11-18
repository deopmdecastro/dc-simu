import * as THREE from 'three'
import { isIndustrialDevice } from '../electrical/industrialDevices'
import { prepareIndustrialModel, applyIndustrialState, applyIndustrialTextures } from '../three/industrialFinish'
import type { ComponentType } from '../types'
import { cloneModelScene } from '../three/modelFit'
import { createGltfLoader } from '../three/gltfLoader'
import { getComponentModelSpec, MODEL_PATHS, PANEL_UNITS_PER_MM } from '../three/modelPaths'
import { isTerminalAssemblyComponent, terminalAssemblyLayout, tintTerminalBodyMaterials } from '../three/terminalAssembly'
import { captureOrthographicModelImage, captureOrthographicObjectImage } from './orthographicModelImage'
import { finishCadMaterial } from '../three/catalogMaterials'
import { applyCadSurfaceTextures } from '../three/cadSurface'
import { findStaticFrontImage } from '../three/staticComponentImages'
import { importedComponentInfo } from '../electrical/importedComponents'
import { animateImportedRig, paintImportedModel, rigImportedModel } from '../three/importedFinish'
import { applyProtectionMarkings } from '../three/protectionMarkings'
import { prepareSchneiderModular, applySchneiderModularState, isSchneiderModular } from '../three/schneiderModularModel'
import { applySchneiderRcdState, isSchneiderRcd, prepareSchneiderRcdModel } from '../three/schneiderRcdModel'
import { applyCombBusbarFinish } from '../three/combBusbarMarkings'
import { TEMPLATES } from '../electrical/factory'
import { createDigitalMeterObject, digitalMeterSpec, isDigitalMeterType } from '../three/digitalMeterModel'
import { fitComponentModel } from '../three/modelFit'

const imagePromises = new Map<ComponentType, Promise<string>>()
let terminalSource: Promise<THREE.Object3D> | undefined

async function captureTerminalAssemblyImage(type: ComponentType): Promise<string> {
  const spec = getComponentModelSpec('terminalPhoenixPti6')!
  terminalSource ??= createGltfLoader().loadAsync(MODEL_PATHS.phoenixTerminalPti6)
    .then(({ scene }) => scene)
    .catch((error) => { terminalSource = undefined; throw error })
  const source = await terminalSource
  const physical = spec.physicalSizeMm
  const assembly = new THREE.Group()
  terminalAssemblyLayout(type, physical.width).forEach(({ x, color }) => {
    const module = cloneModelScene(source)
    module.rotation.set(...spec.rotation)
    module.updateMatrixWorld(true)
    const sourceSize = new THREE.Box3().setFromObject(module, true).getSize(new THREE.Vector3())
    module.scale.set(physical.width * PANEL_UNITS_PER_MM / sourceSize.x, physical.height * PANEL_UNITS_PER_MM / sourceSize.y, physical.depth * PANEL_UNITS_PER_MM / sourceSize.z)
    module.updateMatrixWorld(true)
    const bounds = new THREE.Box3().setFromObject(module, true)
    const center = bounds.getCenter(new THREE.Vector3())
    module.position.set(-center.x + x * PANEL_UNITS_PER_MM, -center.y, -center.z)
    module.traverse((node) => {
      const mesh = node as THREE.Mesh
      if (!mesh.isMesh || !mesh.material) return
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map((material) => finishCadMaterial(material)) : finishCadMaterial(mesh.material)
      mesh.castShadow = mesh.receiveShadow = true
    })
    tintTerminalBodyMaterials(module, color)
    assembly.add(module)
  })
  await applyCadSurfaceTextures(assembly)
  return captureOrthographicObjectImage(assembly, [-0.12, Math.PI / 12, 0])
}

/**
 * Vista frontal ortográfica produzida a partir da mesma base usada no Painel 3D.
 * Usa primeiro a imagem pré-gerada (public/component-covers/front, WebP sem fundo); só sem ela
 * descarrega o GLB e captura no browser.
 */
export function getCad3DImage(type: ComponentType): Promise<string> {
  const cached = imagePromises.get(type)
  if (cached) return cached
  const spec = getComponentModelSpec(type)
  if (!spec && !isTerminalAssemblyComponent(type) && !isDigitalMeterType(type)) return Promise.reject(new Error(`Sem modelo CAD para ${type}`))

  const promise = findStaticFrontImage(type).then((image) => image ?? captureCad3DImage(type)).catch((error) => {
    imagePromises.delete(type)
    throw error
  })
  imagePromises.set(type, promise)
  return promise
}

/** Captura em tempo real a partir do GLB (também usada pelo gerador das imagens pré-geradas). */
export async function captureCad3DImage(type: ComponentType, viewRotation?: [number, number, number]): Promise<string> {
  const spec = getComponentModelSpec(type)
  if (!spec && !isTerminalAssemblyComponent(type) && !isDigitalMeterType(type)) return Promise.reject(new Error(`Sem modelo CAD para ${type}`))
  if (isTerminalAssemblyComponent(type) && !spec) return captureTerminalAssemblyImage(type)
  if (isIndustrialDevice(type) && spec) {
    const { scene } = await createGltfLoader().loadAsync(spec.path)
    const model = fitComponentModel(scene, spec, 1, 'center')
    prepareIndustrialModel(model, type)
    applyIndustrialState(model, type, TEMPLATES[type].defaultState, false, false)
    await applyIndustrialTextures(model, type)
    return captureOrthographicObjectImage(model, viewRotation)
  }
  if(isDigitalMeterType(type)){const model=fitComponentModel(createDigitalMeterObject(type,TEMPLATES[type]?.defaultState),digitalMeterSpec(type),1,'center');await applyCadSurfaceTextures(model,{unitsPerMm:1});return captureOrthographicObjectImage(model,viewRotation)}
  const defaultState = (isSchneiderRcd(type)||type==='breakerSchneiderIc60h1p')
    ? { ...TEMPLATES[type]?.defaultState, closed: false, tripped: false }
    : TEMPLATES[type]?.defaultState ?? {}
  return captureOrthographicModelImage({
    path: spec!.path,
    rotation: spec!.rotation,
    viewRotation,
    flipDepth: spec!.flipDepth,
    physicalSizeMm: spec!.physicalSizeMm,
    configureObject: (inner) => {
      if (isSchneiderRcd(type)) prepareSchneiderRcdModel(inner)
      if(isSchneiderModular(type))prepareSchneiderModular(inner)
      if (!importedComponentInfo(type)) return
      const parts = paintImportedModel(type, inner)
      const rig = rigImportedModel(type, inner, parts)
      animateImportedRig(rig, type, defaultState, false, 10)
      inner.traverse((node) => {
        const mesh = node as THREE.Mesh
        if (!mesh.isMesh) return
        mesh.material = Array.isArray(mesh.material)
          ? mesh.material.map((m) => finishCadMaterial(m, { envMapIntensity: 1.15 }))
          : finishCadMaterial(mesh.material, { envMapIntensity: 1.15 })
      })
    },
    configureFitted: (fitted) => {
      if (isSchneiderRcd(type)) applySchneiderRcdState(fitted, defaultState)
      applyProtectionMarkings(fitted, type, {
        state: defaultState,
        unitsPerMm: 1,
        anchor: 'center',
        heightMm: spec!.physicalSizeMm.height,
      })
      if(isSchneiderModular(type))applySchneiderModularState(fitted,type,defaultState)
      applyCombBusbarFinish(type, fitted, defaultState)
    },
  })
}
