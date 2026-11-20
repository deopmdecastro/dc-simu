/** Manufacturer STEP conversion. All geometry stays in millimetres until
 * writeGlb; adaptations are explicit, rigid part translations, never an
 * anisotropic fit of the open fixing clips to the nominal body envelope. */
import fs from 'node:fs/promises'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import * as T from 'three'
import { readStep, sha, fromOcc, mat, drill, terminal, plane, writeGlb } from './cad-building.mjs'

const white = mat('#eeefe9', .015, .48), dark = mat('#292d2d', .1, .38)
const steel = mat('#b5b9b4', .85, .26), latch = mat('#e4c728', .15, .44), lens = mat('#66171b', .05, .22)
const rootDir = path.resolve(import.meta.dirname, '../..')
const array = value => Array.isArray(value) ? value : Object.values(value)
function normalizeStep(result) {
  for (const m of result.meshes) {
    for (const attr of Object.values(m.attributes)) attr.array = array(attr.array)
    m.index.array = array(m.index.array)
  }
  return result
}
async function find(dir, filename) {
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => [])
  for (const e of entries) if (e.isFile() && e.name === filename) return path.join(dir, e.name)
  for (const e of entries) if (e.isDirectory()) { const hit = await find(path.join(dir, e.name), filename); if (hit) return hit }
}
export async function source(id, sourceDir) {
  const name = `MCADFD000${id}_3D-simplified.stp`
  const folder = sourceDir || path.join(rootDir, '.cache/schneider-cad')
  let filename = await find(folder, name)
  const url = `https://download.se.com/files?p_Doc_Ref=MCADFD000${id}_3D-CAD`
  if (!filename && !sourceDir) {
    await fs.mkdir(folder, { recursive: true })
    const response = await fetch(url)
    if (!response.ok) throw new Error(`${response.status}: ${url}`)
    const archive = path.join(folder, id + '.zip')
    await fs.writeFile(archive, Buffer.from(await response.arrayBuffer()))
    execFileSync('unzip', ['-q', '-o', archive, '-d', path.join(folder, id)])
    filename = await find(folder, name)
  }
  if (!filename) throw new Error(`Missing ${name} under ${folder}`)
  return { ...normalizeStep(await readStep(filename)), source: { document: `MCADFD000${id}`, url, file: name, sha256: sha(await fs.readFile(filename)) } }
}
export function makeRoot(type, dims) {
  const root = new T.Group(); root.name = 'schneider_' + type
  root.userData = { physicalFrameMm: dims, cadScalePreserved: true, frame: 'X centered, Y bottom, Z rear; metres in exported GLB' }
  return root
}
export function addMesh(root, mesh, map, material, name, faces) {
  const node = fromOcc(mesh, map, material.clone(), name, faces)
  root.add(node); return node
}
export function pivot(root, name, nodes, point) {
  const group = new T.Group(); group.name = name; group.position.set(...point)
  root.add(group); root.updateMatrixWorld(true)
  for (const node of nodes) group.attach(node)
  return group
}
export function faceBounds(m, i) {
  const f = m.brep_faces[i], p = m.attributes.position.array, idx = m.index.array.slice(f.first * 3, (f.last + 1) * 3)
  return [0,1,2].map(k => [Math.min(...idx.map(j => p[j*3+k])), Math.max(...idx.map(j => p[j*3+k]))])
}
export function cavities(root, dims, rows) {
  const meshes = []; root.traverse(node => { if (node.isMesh && !/clip|handle|test|lens|visisafe/.test(node.name)) meshes.push(node) })
  for (const row of rows) {
    const [label, face, nx, ny, nz, diameter, depth, axis = 'y'] = row
    const p = [(nx-.5)*dims.width, (1-ny)*dims.height, nz*dims.depth]
    const along = axis === 'y' ? { top: 1, bottom: -1 }[face] : 1
    drill(meshes, axis, p, diameter/2, Math.min(p[{x:0,y:1,z:2}[axis]], p[{x:0,y:1,z:2}[axis]] - along*depth), Math.max(p[{x:0,y:1,z:2}[axis]], p[{x:0,y:1,z:2}[axis]] - along*depth))
    terminal(root, label, ...p, { r: diameter/2, depth, face })
    root.getObjectByName('industrial_connection_' + label).name = 'acti9_connection_' + label
  }
}
export function status(root, prefix, x, y, z, width) {
  for (const [suffix, color, dz] of [['','#168249',0],['_trip','#168249',.008],['_on','#b72a30',.016]]) {
    const node = plane(width, 2.7, mat(color), prefix+suffix, [x,y,z+dz])
    node.userData.protectionMarking = true; root.add(node)
  }
}
export async function saveModel(root, relative, dims, sourceData, adaptations) {
  root.updateMatrixWorld(true)
  const box = new T.Box3().setFromObject(root, true), size = box.getSize(new T.Vector3())
  const measuredMm = { width:size.x, height:size.y, depth:size.z }
  const result = await writeGlb(new URL('../../public' + relative, import.meta.url), root)
  return { path:relative, ...result, nominalSizeMm:dims, measuredSizeMm:measuredMm, source:sourceData, adaptations }
}
export const materials = { white, dark, steel, latch, lens }
export async function manifest(relative, models) {
  const payload = { format:1, generatedBy:'scripts/build-schneider-{modular,rcd}-glb.mjs', units:'metres', note:'STEP-derived simulation assets with explicit adaptations. Not unmodified manufacturer CAD or certified equipment. Nominal frame is not a clip-envelope fit.', models }
  await fs.writeFile(path.join(rootDir,'public',relative), JSON.stringify(payload,null,2)+'\n')
}
