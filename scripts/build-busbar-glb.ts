/**
 * Gera os modelos 3D GLB oficiais dos barramentos reais (Terra PE, Neutro N, Fase com acrílico
 * e Repartidor de fases em escada 4P com tampa articulada).
 * Uso: npx tsx scripts/build-busbar-glb.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { basename, dirname } from 'node:path'
import * as THREE from 'three'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import {
  ACRYLIC_BUSBAR,
  buildAcrylicBusbar,
  buildSteppedBusbar,
  STEPPED_BUSBAR,
  type AcrylicBusbarMaterials,
  type SteppedBusbarMaterials,
} from '../src/three/busbarParts'
import {
  buildCombBusbar,
  buildCombConnector,
  COMB_BUSBAR,
  COMB_CONNECTOR,
  type CombBusbarMaterials,
  type CombConnectorMaterials,
} from '../src/three/combBusbarParts'

;(globalThis as unknown as { FileReader: unknown }).FileReader = class {
  result: ArrayBuffer | string | null = null
  onloadend: (() => void) | null = null
  readAsArrayBuffer(blob: Blob) {
    blob.arrayBuffer().then((b) => {
      this.result = b
      this.onloadend?.()
    })
  }
  readAsDataURL(blob: Blob) {
    blob.arrayBuffer().then((b) => {
      this.result = `data:${blob.type};base64,${Buffer.from(b).toString('base64')}`
      this.onloadend?.()
    })
  }
}

// Permit a mechanical revision to rebuild only its own asset, without
// rewriting unrelated PE/N/phase/stepped busbars.
const onlyArg = process.argv.indexOf('--only')
const only = onlyArg >= 0 ? new Set((process.argv[onlyArg + 1] ?? '').split(',')) : null
function writeGlb(out: string, object: THREE.Object3D): Promise<void> {
  if (only && !only.has(basename(out, '.glb'))) return Promise.resolve()
  return new Promise((resolve) => {
    const scene = new THREE.Scene()
    scene.add(object)
    new GLTFExporter().parse(
      scene,
      (result) => {
        const buf = Buffer.from(result as ArrayBuffer)
        mkdirSync(dirname(out), { recursive: true })
        writeFileSync(out, buf)
        console.log(`GLB escrito: ${out} (${buf.byteLength} bytes)`)
        resolve()
      },
      (error) => {
        console.error(error)
        process.exit(1)
      },
      { binary: true },
    )
  })
}

const unit = 0.001 // metros (padrão glTF 2.0)

function acrylicMats(coverHex: string, tag: string): AcrylicBusbarMaterials {
  return {
    body: new THREE.MeshStandardMaterial({ color: '#ddd7cb', metalness: 0.0, roughness: 0.48, name: `pa66-marfim-${tag}` }),
    brass: new THREE.MeshStandardMaterial({ color: '#cfa441', metalness: 0.9, roughness: 0.26, name: `latao-cuzn-${tag}` }),
    screw: new THREE.MeshStandardMaterial({ color: '#dbb85c', metalness: 0.92, roughness: 0.22, name: `parafuso-m4-${tag}` }),
    bore: new THREE.MeshStandardMaterial({ color: '#241c0e', metalness: 0.4, roughness: 0.74, name: `furo-borne-${tag}` }),
    cover: new THREE.MeshPhysicalMaterial({
      color: coverHex,
      metalness: 0.02,
      roughness: 0.07,
      ior: 1.495,
      clearcoat: 1.0,
      clearcoatRoughness: 0.03,
      transparent: true,
      opacity: 0.5,
      side: THREE.DoubleSide,
      name: `acrilico-${tag}`,
    }),
  }
}

const steppedMats: SteppedBusbarMaterials = {
  body: new THREE.MeshStandardMaterial({ color: '#d5d8dc', metalness: 0.0, roughness: 0.46, name: 'pa66-ral7035' }),
  dark: new THREE.MeshStandardMaterial({ color: '#464d56', metalness: 0.15, roughness: 0.62, name: 'patilha-din' }),
  brass: new THREE.MeshStandardMaterial({ color: '#d8aa3e', metalness: 0.88, roughness: 0.25, name: 'latao-escada' }),
  screw: new THREE.MeshStandardMaterial({ color: '#dce1e8', metalness: 0.93, roughness: 0.19, name: 'parafuso-zincado' }),
  bore: new THREE.MeshStandardMaterial({ color: '#1e1910', metalness: 0.38, roughness: 0.76, name: 'furo-escada' }),
  cover: new THREE.MeshPhysicalMaterial({
    color: '#f2f7fc',
    metalness: 0.02,
    roughness: 0.04,
    ior: 1.585,
    clearcoat: 1.0,
    clearcoatRoughness: 0.02,
    transparent: true,
    opacity: 0.16,
    side: THREE.DoubleSide,
    name: 'tampa-policarbonato',
  }),
  coverEdge: new THREE.MeshPhysicalMaterial({
    color: '#222a33',
    metalness: 0.08,
    roughness: 0.12,
    clearcoat: 1.0,
    transparent: true,
    opacity: 0.72,
    name: 'rebordo-policarbonato',
  }),
}

const pe = buildAcrylicBusbar(ACRYLIC_BUSBAR.defaultPoles, unit, acrylicMats(ACRYLIC_BUSBAR.earthAcrylicColor, 'pe'))
await writeGlb('public/models/bornes-e-barras/barramento-terra-pe.glb', pe.root)

const n = buildAcrylicBusbar(ACRYLIC_BUSBAR.defaultPoles, unit, acrylicMats(ACRYLIC_BUSBAR.neutralAcrylicColor, 'n'))
await writeGlb('public/models/bornes-e-barras/barramento-neutro-n.glb', n.root)

const ph = buildAcrylicBusbar(ACRYLIC_BUSBAR.defaultPoles, unit, acrylicMats(ACRYLIC_BUSBAR.defaultPhaseAcrylicColor, 'fase'))
await writeGlb('public/models/bornes-e-barras/barramento-fase-acrilico.glb', ph.root)

const stepped = buildSteppedBusbar({ poleCount: STEPPED_BUSBAR.defaultHoles, barsMode: STEPPED_BUSBAR.defaultBars }, unit, steppedMats)
await writeGlb('public/models/bornes-e-barras/barramento-fases-escada-4p.glb', stepped.root)

const combMats: CombBusbarMaterials = {
  pvcOuter: new THREE.MeshStandardMaterial({ color: '#e1e4e7', metalness: 0.0, roughness: 0.42, name: 'pvc-ral7035-pente' }),
  pvcBarrier: new THREE.MeshStandardMaterial({ color: '#9aa1aa', metalness: 0.02, roughness: 0.56, name: 'pvc-barreira-pente' }),
  copper: new THREE.MeshStandardMaterial({ color: '#cf7742', metalness: 0.91, roughness: 0.24, name: 'cobre-cuetp-pente' }),
  silkscreen: new THREE.MeshStandardMaterial({ color: '#dadde1', metalness: 0.01, roughness: 0.36, name: 'serigrafia-pente' }),
  tinned: new THREE.MeshStandardMaterial({ color: '#e4e8ee', metalness: 0.94, roughness: 0.2, name: 'pino-estanhado-pente' }),
  cage: new THREE.MeshStandardMaterial({ color: '#d9be6c', metalness: 0.9, roughness: 0.26, name: 'gaiola-pente' }),
  dark: new THREE.MeshStandardMaterial({ color: '#1b2028', metalness: 0.28, roughness: 0.8, name: 'furo-pente' }),
}

const comb = buildCombBusbar(
  {
    poleCount: COMB_BUSBAR.defaultPoles,
    combMode: COMB_BUSBAR.defaultMode,
    brandStyle: COMB_BUSBAR.defaultBrand,
    ratedA: COMB_BUSBAR.defaultRatedA,
    teethDirection: COMB_BUSBAR.defaultTeethDirection,
    endCaps: true,
    feedConnectors: 'none',
  },
  unit,
  combMats,
)
await writeGlb('public/models/bornes-e-barras/barramento-pente.glb', comb.root)

const connMats: CombConnectorMaterials = {
  housing: new THREE.MeshStandardMaterial({ color: COMB_CONNECTOR.defaultColor, metalness: 0.0, roughness: 0.38, name: 'pa66-conector-pente' }),
  tinned: new THREE.MeshStandardMaterial({ color: '#e5e9ef', metalness: 0.95, roughness: 0.19, name: 'pino-estanhado-estriado' }),
  cage: new THREE.MeshStandardMaterial({ color: '#d9be6c', metalness: 0.9, roughness: 0.25, name: 'gaiola-borne-25mm2' }),
  dark: new THREE.MeshStandardMaterial({ color: '#181d25', metalness: 0.3, roughness: 0.82, name: 'cavidade-conector' }),
  stamp: new THREE.MeshStandardMaterial({ color: '#e5e7eb', metalness: 0.0, roughness: 0.44, transparent: true, opacity: 0.01, name: 'gravacao-6-25' }),
}

const conn = buildCombConnector(
  {
    connectorColor: COMB_CONNECTOR.defaultColor,
    pinDirection: COMB_CONNECTOR.defaultPinDirection,
    pinStyle: COMB_CONNECTOR.defaultPinStyle,
    gaugeRange: COMB_CONNECTOR.defaultGauge,
  },
  unit,
  connMats,
)
await writeGlb('public/models/bornes-e-barras/conector-barramento-pente.glb', conn.root)
