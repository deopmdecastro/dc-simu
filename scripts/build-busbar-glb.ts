/**
 * Gera os modelos 3D GLB oficiais dos barramentos reais (Terra PE, Neutro N, Fase com acrílico
 * e Repartidor de fases em escada 4P com tampa articulada).
 * Uso: npx tsx scripts/build-busbar-glb.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
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

function writeGlb(out: string, object: THREE.Object3D): Promise<void> {
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
