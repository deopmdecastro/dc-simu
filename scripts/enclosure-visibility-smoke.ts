import assert from 'node:assert/strict'
import * as THREE from 'three'
import { createComponent } from '../src/electrical/factory'
import { useSimStore } from '../src/store/useSimStore'
import { buildEnclosure } from '../src/three/enclosureParts'
import { ENCLOSURE_EXTERIOR_FACES, ENCLOSURE_FACES, applyEnclosureVisibility, hiddenEnclosureFaces, toggleEnclosureExteriorVisibility } from '../src/three/enclosureVisibility'
import { componentObstacles } from '../src/three/wireGeometry3D'
import { mergeStaticMeshes } from '../src/three/staticMerge'

const material = new THREE.MeshBasicMaterial()
const parts = buildEnclosure({widthMm:600,heightMm:800,depthMm:250},1,
  {body:material,plate:material,gasket:material,metal:material,dark:material})
parts.body.updateMatrixWorld(true); parts.door.updateMatrixWorld(true)
for (let i=0;i<3;i++) {
  const body=mergeStaticMeshes(parts.body), door=mergeStaticMeshes(parts.door)
  assert.equal(body.after,body.before,'otimizador mantém faces independentes')
  assert.equal(door.after,door.before,'otimizador mantém peças da porta selecionáveis')
}
const ray = new THREE.Raycaster(new THREE.Vector3(0,0,1000),new THREE.Vector3(0,0,-1))
const doorHits = () => ray.intersectObject(parts.door,true).length
applyEnclosureVisibility(parts,{})
assert.ok(doorHits()>0, 'porta visível pode ser selecionada')
applyEnclosureVisibility(parts,{editorHiddenFaces:['door']})
assert.equal(parts.door.visible,false)
assert.equal(doorHits(),0,'porta oculta não intercepta o clique de edição')
assert.equal(parts.body.getObjectByName('enclosure-left')!.visible,true,'ocultar porta mantém laterais')
applyEnclosureVisibility(parts,{editorHiddenFaces:['left','plate']})
assert.equal(parts.body.getObjectByName('enclosure-left')!.visible,false)
assert.equal(parts.body.getObjectByName('enclosure-right')!.visible,true)
assert.equal(parts.body.getObjectByName('enclosure-mounting-plate')!.visible,false)
assert.equal(parts.body.getObjectByName('enclosure-standoffs')!.visible,false)
assert.ok(doorHits()>0,'mostrar porta repõe a seleção')
applyEnclosureVisibility(parts,{editorHiddenFaces:ENCLOSURE_FACES.map(([face])=>face)})
for(const root of [parts.body,parts.door]) root.traverse(node=>{
  if((node as THREE.Mesh).isMesh) assert.equal(node.visible,false,`todas as chapas ocultas: ${node.name}`)
})
applyEnclosureVisibility(parts,{})
for(const root of [parts.body,parts.door]) root.traverse(node=>{
  if((node as THREE.Mesh).isMesh) assert.equal(node.visible,true,`restaurar: ${node.name}`)
})
assert.ok(doorHits()>0)
assert.deepEqual(hiddenEnclosureFaces({editorHiddenFaces:['door','door','invalid',7]}),['door'])

const initiallyHidden={editorHiddenFaces:['back','plate']}
assert.deepEqual(ENCLOSURE_EXTERIOR_FACES,['door','left','right','top','bottom'],'atalho abrange apenas as faces exteriores frontais')
const exteriorHidden=toggleEnclosureExteriorVisibility(initiallyHidden)
assert.deepEqual(exteriorHidden,['back','plate',...ENCLOSURE_EXTERIOR_FACES],'ocultar exteriores mantém as escolhas das faces traseiras')
assert.deepEqual(toggleEnclosureExteriorVisibility({editorHiddenFaces:exteriorHidden}),['back','plate'],'restaurar exteriores não reexibe faces ocultas individualmente')
assert.deepEqual(toggleEnclosureExteriorVisibility({editorHiddenFaces:['door','back']}),['door','back','left','right','top','bottom'],'ocultar conclui a lista-alvo sem alterar outras escolhas')

const enclosure=createComponent('panelEnclosure','QE1',undefined,0,0,0)
enclosure.state.doorOpen=false
useSimStore.getState().loadJSON(JSON.stringify({app:'dc-simu',version:6,projectKind:'all',components:[enclosure],wires:[]}))
useSimStore.getState().setComponentState(enclosure.id,{editorHiddenFaces:['door','left','top']})
assert.equal(useSimStore.getState().components[0].state.doorOpen,false,'ocultar não abre nem move a porta')
useSimStore.getState().undo()
assert.deepEqual(hiddenEnclosureFaces(useSimStore.getState().components[0].state),[])
useSimStore.getState().redo()
const serialized=useSimStore.getState().saveJSON()
useSimStore.getState().loadJSON(serialized)
assert.deepEqual(hiddenEnclosureFaces(useSimStore.getState().components[0].state),['door','left','top'])
const pivot={ [enclosure.id]:new THREE.Vector3(0,0,1) }
const shown=componentObstacles([{...enclosure,state:{...enclosure.state,editorHiddenFaces:[]}}],pivot)
const hidden=componentObstacles([{...enclosure,state:{...enclosure.state,editorHiddenFaces:['door','left','top']}}],pivot)
assert.deepEqual(hidden.map(b=>[b.min.toArray(),b.max.toArray()]),shown.map(b=>[b.min.toArray(),b.max.toArray()]),'ocultar chapas não muda obstáculos físicos nem permite cabos pela parede')
console.log('PASS — visibilidade do quadro: faces independentes, atalho de exteriores, cliques, desfazer/refazer, persistência e física preservada')
