/**
 * node --import tsx scripts/build-industrial-devices.mjs <pasta STEP> [tipo]
 * ATV / Finder: CAD original, sem redimensionamento não uniforme.
 * GEYA / AVEL / Metaltex: reconstruções cotadas, NÃO CAD oficial.
 * Impressos: scripts/build-industrial-labels.py; fontes/hash em sources.json.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import * as T from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { readStep, mat, fromOcc, box, plane, cylinder, shapePlate, drill, terminal, led, writeGlb } from './lib/cad-building.mjs'
import { buildCaptiveTerminalScrew } from '../src/three/terminalHardware.ts'
import { buildMicoClassic } from './lib/mico-classic-model.mjs'
import { buildMico24 } from './lib/mico24-model.mjs'

const source = path.resolve(process.argv[2] ?? '/home/user/work/industrial-devices-audit/cad-rebuilt')
const output = path.resolve('public/models/industriais')
await fs.mkdir(output, { recursive: true })
const before = JSON.parse(await fs.readFile('src/data/industrial-device-geometry.json', 'utf8'))
const data = { ...before }, records = []
/** Cavities whose finite body was drilled only partially (recessed access). The
 * ring floor becomes the outer lip, not the conductor mouth; the socket check
 * uses the measured cavity wall, not a synthetic void through the whole part. */
const RECESS_ONLY = {
  buzzerMetaltexTby301: new Set(['1', '2']),
}
const dark=mat('#3a3b36'),white=mat('#e5e5da'),blue=mat('#0b478a'),red=mat('#ce1229'),steel=mat('#aab0a8',.75,.32),black=mat('#151712'),green=mat('#3eae27'),copper=mat('#ac6631',.75,.4)
// Zamac/poliamida para as botoeiras Ø22; níquel escovado para aros e porcas serrilhadas.
const zamac=mat('#b9bdc0',.85,.28),nickel=mat('#c9cdd1',.9,.22),polyamide=mat('#f2f2ea',0,.6)
function device(type) { const g=new T.Group();g.name='industrial_device_'+type;g.userData.industrialType=type;return g }
function bodyProfile(width,points,material,name,rounded=false) {
 const s=new T.Shape()
 points.forEach(([z,y],i)=>{
  if(!rounded){i?s.lineTo(z,y):s.moveTo(z,y);return}
  const p=new T.Vector2(z,y),prev=new T.Vector2(...points[(i+points.length-1)%points.length]),next=new T.Vector2(...points[(i+1)%points.length])
  const radius=typeof rounded==='number'?rounded:.4
  const start=prev.sub(p).normalize().multiplyScalar(radius).add(p),end=next.sub(p).normalize().multiplyScalar(radius).add(p)
  i?s.lineTo(start.x,start.y):s.moveTo(start.x,start.y);s.quadraticCurveTo(z,y,end.x,end.y)
 });s.closePath()
 const g=new T.ExtrudeGeometry(s,{depth:width,bevelEnabled:false,curveSegments:6});g.applyMatrix4(new T.Matrix4().set(0,0,1,-width/2,0,1,0,0,-1,0,0,0,0,0,0,1))
 const m=new T.Mesh(g,material);m.name=name;return m
}
async function store(type,root,terms,provenance) {
 root.updateMatrixWorld(true)
 const bounds=new T.Box3().setFromObject(root,true),size=bounds.getSize(new T.Vector3()),center=bounds.getCenter(new T.Vector3())
 const round=v=>+v.toFixed(6)
 const physicalSizeMm={width:round(size.x),height:round(size.y),depth:round(size.z)}
 const recess=RECESS_ONLY[type]
 data[type]={path:`/models/industriais/${type}.glb`,physicalSizeMm,terminals:terms.map(t=>({label:t.label,face:t.face,contact:recess?.has(t.label)?'surface':t.contact,x:round((t.point[0]-bounds.min.x)/size.x),y:round(1-(t.point[1]-bounds.min.y)/size.y),z:round((t.point[2]-bounds.min.z)/size.z),diameterMm:t.diameterMm,holeDepthMm:t.holeDepthMm,...(t.normal?{normal:t.normal.map(round)}:{})}))}
 // Bake translation once; parent remains identity for the Admin's named pivots.
 const offset=new T.Vector3(-center.x,-bounds.min.y,-bounds.min.z)
 for(const child of root.children)child.position.add(offset)
 const result=await writeGlb(new URL('file://'+path.join(output,type+'.glb')),root)
 const record={type,...provenance,visualRefinement:root.userData.visualRefinement,physicalSizeMm,interfaces:terms.length,cavities:terms.filter(t=>t.contact==='socket').length,pins:terms.filter(t=>t.contact==='pin').length,...result}
 records.push(record);console.log(type,result.bytes,physicalSizeMm,`${record.cavities} cavidades, ${record.pins} pinos`)
}

async function atv() {
 const type='vfdSchneiderAtv320',r=await readStep(path.join(source,'MCADID0000926_3D-simplified.stp')),root=device(type),map=(x,y,z)=>[x-36,-z,y]
 root.userData.visualRefinement={reference:'https://download.schneider-electric.com/files?p_Doc_Ref=ATV320U0xM2C_front&p_File_Type=rendition_1500_jpg',details:'Original CAD shell retained. Encoder front skin recessed 0.23 mm for triangular grip relief within the original envelope. Rounded HMI bezel, non-overlapping four-digit display and legends, FAULT/CAN indicators, rounded labelled ESC, front labels and 33 captive cross screws. Public-reference-only QR; no serial number reconstructed.'}
 const cover=new T.Group();cover.name='industrial_control_cover';root.add(cover)
 // Materiais fiéis à unidade real (fotografia eibabo ATV320U04M2C): tampa e
 // flap quase negros (#2e2f2c), corpo cinzento-escuro quente (#3a3b36).
 const faceDark=mat('#30353b',0,.42)
 const rounded=(w,h,d,r,material,name,at)=>{
  const s=new T.Shape(),x=-w/2,y=-h/2
  s.moveTo(x+r,y);s.lineTo(x+w-r,y);s.quadraticCurveTo(x+w,y,x+w,y+r);s.lineTo(x+w,y+h-r);s.quadraticCurveTo(x+w,y+h,x+w-r,y+h);s.lineTo(x+r,y+h);s.quadraticCurveTo(x,y+h,x,y+h-r);s.lineTo(x,y+r);s.quadraticCurveTo(x,y,x+r,y)
  const g=new T.ExtrudeGeometry(s,{depth:d,bevelEnabled:false,curveSegments:8});g.translate(0,0,-d/2)
  const m=new T.Mesh(g,material);m.name=name;m.position.set(...at);return m
 }
 const solids=[]
 for(const [i,m] of r.meshes.entries()){
  const material=i===7?mat('#009648',.02,.35):i===14||i===15||i===12?steel:i===10||i===11?faceDark:dark
  const node=fromOcc(m,map,material,'atv320_cad_'+i)
  if(i===7){node.geometry.computeBoundingBox();const c=node.geometry.boundingBox.getCenter(new T.Vector3());node.geometry.translate(-c.x,-c.y,-c.z);const pivot=new T.Group();pivot.name='industrial_encoder';pivot.position.copy(c);node.name='industrial_encoder_body';pivot.add(node);root.add(pivot)}
  else if(i===10||i===11)cover.add(node)
  else {root.add(node);solids.push(node)}
 }
 const encoder=root.getObjectByName('industrial_encoder'),encoderBody=root.getObjectByName('industrial_encoder_body')
 encoderBody.geometry.computeBoundingBox()
 const front=encoderBody.geometry.boundingBox.max.z,positions=encoderBody.geometry.attributes.position
 for(let i=0;i<positions.count;i++)if(positions.getZ(i)>front-.01&&Math.hypot(positions.getX(i),positions.getY(i))<10.9)positions.setZ(i,front-.23)
 positions.needsUpdate=true;encoderBody.geometry.computeVertexNormals()
 for(const [radius,count] of [[9.6,27],[7.7,22],[5.9,17]])for(let i=0;i<count;i++){
  const a=2*Math.PI*i/count,shape=new T.Shape()
  for(let j=0;j<3;j++){const t=a+j*2*Math.PI/3,px=Math.cos(t)*.77,py=Math.sin(t)*.77;j?shape.lineTo(px,py):shape.moveTo(px,py)}shape.closePath()
  const tooth=new T.Mesh(new T.ExtrudeGeometry(shape,{depth:.19,bevelEnabled:true,bevelSize:.06,bevelThickness:.03,bevelSegments:1}),mat('#008c43',.02,.37))
  tooth.name='industrial_encoder_grip_'+radius+'_'+i;tooth.position.set(Math.cos(a)*radius,Math.sin(a)*radius,front-.22);encoder.add(tooth)
 }
 // Serigrafia do HMI real (fotografia eibabo ATV320U04M2C): janela LCD no
 // topo; "CAN Run"/"CAN Err" com LED verde/vermelho por cima da janela;
 // coluna Ref/Mon/Conf à esquerda e Value/Unit à direita; ESC (quadrado
 // escuro com rótulo por baixo) à esquerda do encoder; autocolante QR de
 // fábrica à direita do encoder. Plano frontal da tampa: z≈132 mm.
 const FACE=132.14
 const frame=rounded(52,17.5,.7,2.5,mat('#242a31',0,.35),'industrial_display_frame',[-1.5,119.4,132.02]);root.add(frame)
 root.add(plane(30.5,9.2,black,'industrial_lcd',[-1.5,116.8,132.40]))
 const legendPlane=(name,w,h,x,y)=>root.add(plane(w,h,white,name,[x,y,FACE+.04]))
 legendPlane('industrial_hmi_legend_fault',9,1.7,-13,123.1)
 legendPlane('industrial_hmi_legend_can_run',9,1.7,-1.5,123.1)
 legendPlane('industrial_hmi_legend_can_err',9,1.7,10.1,123.1)
 led(root,-13,125.4,132.46,'#c52224','industrial_led_fault',.62)
 led(root,-1.5,125.4,132.46,'#16a56b','industrial_led_run',.62)
 led(root,10.1,125.4,132.46,'#4c2025','industrial_led_can_err',.62)
 legendPlane('industrial_hmi_legend_ref',5,2.4,-20,119.6)
 legendPlane('industrial_hmi_legend_mon',5,2.4,-20,116.5)
 legendPlane('industrial_hmi_legend_conf',5,2.4,-20,113.4)
 legendPlane('industrial_hmi_legend_value',6,2.4,17.8,118.5)
 legendPlane('industrial_hmi_legend_unit',6,2.4,17.8,113.4)
 // Impressão acima da janela, no mesmo plano do rebaixo arredondado.
 for(const node of root.children)if(node.name.startsWith('industrial_hmi_legend_'))node.position.z=132.41
 // Botão ESC físico (quadrado escuro, rótulo "ESC" impresso por baixo).
 const escBezel=rounded(13.5,13.5,1.2,2.5,mat('#242a31',0,.4),'industrial_escape_bezel',[-20.5,91.8,131.6]);root.add(escBezel)
 const esc=rounded(9,9,1.4,1.1,faceDark,'industrial_escape',[-20.5,91.8,132]);root.add(esc)
 legendPlane('industrial_escape_label',6.6,2.8,-20.5,91.8)
 root.getObjectByName('industrial_escape_label').position.z=132.72
 esc.add(root.getObjectByName('industrial_escape_label'));esc.children[0].position.set(0,0,.72)
 // Autocolante QR de fábrica à direita do encoder (conteúdo reconstruído, sem
 // ligação real: ver sources.json — não inventa URL nem número de série).
 cover.add(plane(14,21,white,'industrial_qr_sticker',[24,95.5,132.01]))
 // Etiqueta de características na face lateral direita, como na unidade real.
 const side=plane(26,40,white,'industrial_product_sticker',[36.15,88,75]);side.rotation.y=Math.PI/2;root.add(side)
 cover.add(plane(20,26,dark,'industrial_danger_label',[-23,33,132.02]))
 cover.add(plane(16,16,dark,'industrial_altivar_label',[-1.7,26.5,132.02]))
 cover.add(plane(16,4.8,white,'industrial_schneider_logo',[24,20.5,132.02]))
 // Alojamento da placa opcional: junta moldada no contorno.
 const option=new T.Mesh(new RoundedBoxGeometry(43,17,.25,3,.65),mat('#171c22',0,.6));option.name='industrial_option_seam';option.position.set(-12.4,70,132.02);cover.add(option)
 const optionFace=new T.Mesh(new RoundedBoxGeometry(42.4,16.4,.35,3,.5),faceDark);optionFace.name='industrial_option_cover';optionFace.position.set(-12.4,70,132.12);cover.add(optionFace)
 root.add(box(3,16,1,faceDark,'industrial_cover_latch',[31.5,39,132.1]))
 const terms=[]
 const lower=[['PB',-27.95],['PO',-20.05],['PA/+',-12.15],['PC/-',-4.25],['U/T1',3.65],['V/T2',11.55],['W/T3',19.45]]
 const power=lower.map(([label,x])=>({label,x,z:70})).concat([{label:'R/L1',x:-12.15,z:50},{label:'S/L2',x:-4.25,z:50}])
 for(const {label,x,z} of power){drill(solids,'y',[x,-12.95,z],2.7,-14,2);terms.push(terminal(root,label,x,-12.95,z,{r:2.65,depth:9,face:'bottom'}))}
 const outputBlock=shapePlate(62,13,9,lower.map(([,x])=>[x,0,2.7]),dark,'industrial_power_output_block',[0,-12.95,70]);outputBlock.rotation.x=-Math.PI/2;root.add(outputBlock)
 const inputBlock=shapePlate(22,13,9,[[-3.95,0,2.7],[3.95,0,2.7]],dark,'industrial_power_input_block',[-8.2,-12.95,50]);inputBlock.rotation.x=-Math.PI/2;root.add(inputBlock)
 for(const [label,x]of [['PE-IN',16.35],['PE-OUT',-9.15]])terms.push({label,point:[x,-6.06,42.8],face:'front',contact:'surface',diameterMm:5.1,holeDepthMm:1})
 const inside=new T.Group();inside.name='industrial_control_interior';root.add(inside)
 const rows=[{y:61,labels:['10V','AI1','COM1','AI2','AI3','COM2','AQ1','R1A','R1B','R1C','R2A','R2C'],x:-29.5},{y:47,labels:['+24','DI1','DI2','DI3','DI4','DI5','DI6','STO','P24'],x:-29.5},{y:31,labels:['DQ-','DQ+','PE-CTRL'],x:.5}]
 for(const row of rows){const holes=[];row.labels.forEach((label,i)=>{const x=row.x+i*5;holes.push([x-row.x-(row.labels.length-1)*2.5,0,1.9]);drill(solids,'z',[x,row.y,124],1.9,117,132);terms.push(terminal(inside,label,x,row.y,124,{r:1.85,depth:7}))});inside.add(shapePlate(row.labels.length*5+1,9,7,holes,blue,'industrial_control_terminal_block',[row.x+(row.labels.length-1)*2.5,row.y,117]))}
 inside.add(box(14,13,10,black,'industrial_rj45_body',[23.5,30,118]))
 for(const t of terms.filter(t=>t.contact==='socket')){
  const socket=root.getObjectByName('industrial_connection_'+t.label),plain=socket.getObjectByName('contact_'+t.label)
  if(plain){plain.geometry.dispose();plain.removeFromParent()}
  const screw=buildCaptiveTerminalScrew('atv_'+t.label,t.face==='bottom'?1.9:1.3)
  screw.position.z=-t.holeDepthMm+.65;socket.add(screw)
 }
 await store(type,root,terms,{kind:'adapted-manufacturer-CAD',source:'https://media.distributordatasolutions.com/228/schneider_synd_us_xlsx/4cd04adf5708d2c1d973e6277f32c6ca12387619.zip',cadMember:'MCADID0000926_3D-simplified.stp',cadSha256:r.sha256,changes:'Rigid Rx(+90°). Functional lower power cavities / control block rebuilt to NVE41289 pp.100/120/123. Named encoder, ESC, service cover and CAN Run/Err LEDs; HMI window, legend planes and QR sticker laid out to the photographed ATV320U04M2C fascia. Control connector placement is functional, not certified metrology.'})
}

async function finderSocket(){
 const type='relaySocketFinder9023',r=await readStep(path.join(source,'9023.stp')),root=device(type)
 const map=(x,y,z)=>[19-z,34.7813873-x,y-39.9484215],body=fromOcc(r.meshes[0],map,white,'finder9023_cad')
 body.material=body.material.clone();body.material.side=T.DoubleSide;root.add(body)
 const bb=new T.Box3().setFromObject(root,true),s=bb.getSize(new T.Vector3()),terms=[]
 // The shell is stepped: its frontmost protrusion is not the mouth plane of
 // every screw/socket. Measure the local rim before cutting a finite cavity;
 // placing all mouths on bb.max.z left several cable endpoints in free air.
 const ray=new T.Raycaster(),rims=[]
 body.updateMatrixWorld(true)
 for(const t of before[type].terminals){
  const x=bb.min.x+t.x*s.x,y=bb.max.y-t.y*s.y,start=bb.max.z+1,ring=[]
  for(let i=0;i<24;i++){
   const angle=i*Math.PI/12,r=t.diameterMm*.65
   ray.set(new T.Vector3(x+Math.cos(angle)*r,y+Math.sin(angle)*r,start),new T.Vector3(0,0,-1))
   const hit=ray.intersectObject(body,false)[0];if(hit)ring.push(hit.distance)
  }
  ring.sort((a,b)=>a-b);if(ring.length<12)throw new Error('Ambiguous local Finder rim: '+t.label)
  rims.push({t,p:[x,y,start-ring[Math.floor(ring.length*.25)]]})
 }
 for(const {t,p} of rims){
  drill([body],'z',p,t.diameterMm/2,p[2]-t.holeDepthMm,p[2]+.1)
  terms.push(terminal(root,t.label,...p,{r:t.diameterMm/2,depth:t.holeDepthMm,screw:!t.label.startsWith('P')}))
  if(t.label.startsWith('P')){
   // An alveolus has a recessed spring contact, not a screw head and not an
   // empty black/through disk. This contact leaf is a functional reconstruction.
   root.getObjectByName('industrial_connection_'+t.label).add(box(t.diameterMm*.7,t.diameterMm*.22,.35,steel,'contact_leaf_'+t.label,[0,0,-t.holeDepthMm+.4]))
  }
 }
 await store(type,root,terms,{kind:'adapted-manufacturer-CAD',source:'https://cdn.findernet.com/app/uploads/2020/09/11054915/90.stp_-1.zip',cadMember:'3D files/9023.stp',cadSha256:r.sha256,changes:'Rigid axis permutation. Original shell preserved, DoubleSide for inward-exported faces; functional mouth depths reconstructed. Eleven isolated screw-to-pin routes; no relay, coil or mounting compatibility invented.'})
}

async function finderRelay(){
 const type='relayFinder5534',base=await readStep(path.join(source,'9404.stp')),relay=await readStep(path.join(source,'5534_00x0.stp')),root=device(type)
 const map=(x,y,z)=>[z-13.5,78.6-x,y],baseNodes=[]
 for(const [i,m]of base.meshes.entries()){const node=fromOcc(m,map,i===0?blue:i===1?white:steel,'finder9404_cad_'+i);root.add(node);baseNodes.push(node)}
 const rm=relay.meshes[0],rmap=(x,y,z)=>[-x-17.2412777,y+91.929558,54.679058-z]
 const cover=mat('#d9d6cc');cover.transparent=true;cover.opacity=.28;cover.depthWrite=false;cover.side=T.DoubleSide
 root.add(fromOcc(rm,rmap,cover,'industrial_finder_transparent_cover',Array.from({length:119},(_,i)=>i)))
 const test=fromOcc(rm,rmap,mat('#f39d1b'),'industrial_test',Array.from({length:37},(_,i)=>119+i));root.add(test)
 root.add(fromOcc(rm,rmap,steel,'industrial_finder_pins_and_contacts',Array.from({length:216},(_,i)=>156+i)))
 // Internals are a visual reconstruction; the pins and cover remain official CAD.
 root.add(box(17,23,1.2,white,'industrial_finder_base',[0,35,35.2]))
 root.add(cylinder(5.5,16,copper,'industrial_coil',[0,35.5,48.5]))
 const arm=new T.Group();arm.name='industrial_armature';arm.position.set(0,45,54);arm.add(box(15,1,9,steel,'industrial_armature_plate'));root.add(arm)
 root.add(plane(14,6,white,'industrial_finder_label',[0,34,71.71]))
 const terms=[]
 const rows=[{labels:['41','31','21','11'],y:73.85,z:21.9},{labels:['44','34','24','14'],y:63.85,z:39.4},{labels:['42','32','22','12'],y:53.85,z:56.9}]
 for(const row of rows)for(const [i,label]of row.labels.entries()){const x=-9.6+i*6.4,p=[x,row.y,row.z];drill(baseNodes,'z',p,2.3,row.z-5,row.z+.1);terms.push(terminal(root,label,...p,{r:2.3,depth:5}))}
 for(const[label,x,z]of [['A1',3.75,22],['A2',-3.75,28]]){const p=[x,7.35,z];drill(baseNodes,'z',p,2.3,z-5,z+.1);terms.push(terminal(root,label,...p,{r:2.3,depth:5}))}
 await store(type,root,terms,{kind:'assembled-manufacturer-CAD',sources:[{url:'https://cdn.findernet.com/app/uploads/2020/09/11011301/55.stp_-2.zip',member:'3D files/5534_00x0.stp',sha256:relay.sha256},{url:'https://cdn.findernet.com/app/uploads/2020/09/11055828/94.stp_-1.zip',member:'3D files/9404.stp',sha256:base.sha256}],changes:'94.04 + 55.34, rigid transforms only. Pin rows at 28/34.35/40.70/44.80 mm and X ±6.6/±2.2. Seat reference 35.5 mm. TEST faces 119–155 separated; internals and 24 V DC label reconstructed. TEST is momentary, no lock. CAD does not prove a photographed coil voltage.'})
}

async function geya(type){
 const root=device(type),terms=[]
 root.userData.visualRefinement={reference:'https://www.geya.net/wp-content/uploads/2021/05/GRT8-M-Instruction-Manual.pdf',details:'Rounded moulded cover, open screw wells, geometric cross-recess selectors, convex live LED lenses. Original GEYA vector artwork extracted from the local manual. M2 keeps the same symmetric three-level side profile as M1/B1; its 25/26/28 row sits above 15/16/18 on the same lower terminal wall, entering through the step face. Reconstructed from product illustrations, not a manufacturer STEP.'}
 const b1=type==='timerGeyaGrt8B1'
 // y/z profile extruded along X. DIN notch and stepped access ends are real voids.
 // Perfil y/z do GRT8, extrudido em X (cotas do manual: 90 mm de corpo, 64 mm de
 // profundidade, 95 mm com as patilhas). Frente a z 0, traseira a z −64.
 // Topo e base têm o mesmo degrau: parede de bornes a z 0 e bloco recuado a z −24
 // a partir de 82,5 mm (topo) e até 12,5 mm (base) — é a identidade do produto nas
 // fotos do manual, não um degrau inventado só num dos lados.
 // (z, y) do GRT8, extrudido em X. Em mundo z cresce para a frente: as cotas
 // negativas do perfil são a frente. A frente é uma parede CONTÍNUA de baixo a
 // cima (y 2,5…92,5) — o perfil anterior tinha uma reentrância de 7,5 mm entre
 // y 37…58 que abria uma faixa escura a meio do aparelho e deixava a chapa da
 // serigrafia a flutuar à frente dela. É o perfil do manual (90 × 64).
 // Silhueta lateral de 3 degraus em cima e em baixo, simétrica, em TODOS os GRT8
 // (foto «Dimensions» do GRT8-M2: traseira DIN, degrau dos bornes, frente de 45 mm).
 // O M2 já teve uma 4.ª prateleira em baixo para a fila 25/26/28; no produto as duas
 // filas partilham a mesma parede do degrau inferior (ver `rows`).
 const m2 = type === 'timerGeyaGrt8M2'
 const stepY = 22
 const profile=[[0,2.5],[0,92.5],[-24,92.5],[-24,87],[-38,87],[-38,77],[-64,73],[-64,stepY],[-38,stepY-.8],[-38,8],[-24,8],[-24,2.5]]
 // Corpo cinzento-claro como na fotografia do manual (não branco puro).
 const GREY=mat('#d4d5d1',0,.6),GREY_D=mat('#bfc0bc',0,.6)
 const body=bodyProfile(18,profile,GREY,'industrial_geya_body',true);root.add(body)
 const faceTop=71.25,faceBottom=Math.max(27.75,stepY+1.5)
 {
  // Tampa moldada com cantos suaves, junta perimetral e ressalto frontal.
  const cap=new T.Mesh(new RoundedBoxGeometry(17.8,faceTop-faceBottom+.2,1.6,3,.35),GREY)
  cap.name='industrial_geya_front_cover';cap.position.set(0,(faceTop+faceBottom)/2,63.25);root.add(cap)
  // No M2 a faixa por baixo da tampa leva os números 25/26/28 e 15/16/18: sem ranhura.
  for(const y of m2?[75.8]:[75.8,faceBottom-2.95])root.add(box(.65,5.4,.25,black,'industrial_geya_cover_slot_'+y,[0,y,bodyFront(y)+.05]))
  for(const y of [72.1,faceBottom-.85])root.add(box(.32,1.2,.5,dark,'industrial_geya_cover_catch_'+y,[-8.85,y,58.6]))
  for(const y of [80,16])for(const x of [-9,9])root.add(box(.08,5,.35,GREY_D,'industrial_geya_mould_seam_'+x+'_'+y,[x,y,10]))
 }
 function bodyFront(y){return y>73?64-(y-73)*6.5:y<stepY?38:64}
 root.add(shapePlate(16,5,1.5,[[0,0,2.1]],GREY_D,'industrial_din_latch_bottom',[0,2.5,1]))
 root.add(shapePlate(16,5,1.5,[[0,0,2.1]],red,'industrial_din_latch_top',[0,92.5,1]))
 // A tampa frontal acaba onde acaba a frente: no M2 o degrau dos bornes 25/26/28 começa mais acima
 // (antes a placa descia sobre essa fila e o texto «GRT8-M2» flutuava à frente dos bornes).
 root.add(plane(17.6,faceTop-faceBottom,white,'industrial_fascia',[0,(faceTop+faceBottom)/2,64.07]))
 {
  const controls=[['industrial_range',-2.4,59.5],['industrial_fraction',.45,51.9]]
  if(!b1)controls.push(['industrial_function',-2.4,44.3])
  for(const [name,x,y] of controls){
   const pivot=new T.Group();pivot.name=name;pivot.position.set(x,y,64.65)
   pivot.add(cylinder(2.55,.28,GREY_D,name+'_seat',[0,0,-.35]))
   const shape=new T.Shape();shape.absarc(0,0,2.4,0,Math.PI*2,false)
   const cross=new T.Path(),a=.35,b=1.65
   ;[[-a,b],[a,b],[a,a],[b,a],[b,-a],[a,-a],[a,-b],[-a,-b],[-a,-a],[-b,-a],[-b,a],[-a,a]].forEach(([px,py],i)=>i?cross.lineTo(px,py):cross.moveTo(px,py));cross.closePath();shape.holes.push(cross)
   const head=new T.Mesh(new T.ExtrudeGeometry(shape,{depth:.55,bevelEnabled:true,bevelSize:.07,bevelThickness:.07,bevelSegments:2,curveSegments:32}),red)
   head.name=name+'_body';pivot.add(head)
   pivot.add(cylinder(2.32,.18,mat('#8e151a',.08,.43),name+'_recess_floor',[0,0,-.08]))
   // Índice radial: zero em 225°, igual à escala e à rotação de estado.
   const index=box(.3,.95,.09,black,name+'_index',[-1.17,-1.17,.655]);index.rotation.z=-Math.PI/4;pivot.add(index)
   root.add(pivot)
  }
 }
 led(root,-2.6,66.7,64.5,'#18a33b','industrial_led_power',1.2);led(root,2.55,66.7,64.5,'#cb1430','industrial_led_relay',1.2)
 for(const name of ['industrial_led_power','industrial_led_relay']){
  const lens=root.getObjectByName(name),color=lens.userData.ledColor
  lens.geometry.dispose();lens.geometry=new T.SphereGeometry(1.16,24,12,0,Math.PI*2,0,Math.PI/2)
  lens.material=new T.MeshPhysicalMaterial({color,roughness:.18,clearcoat:1,clearcoatRoughness:.1})
  lens.scale.y=.4;lens.position.z=64.73
 }
 // Bornes: uma só fila por degrau, como no produto real (A1 S A2 em cima,
 // 15 16 18 em baixo). O corpo do produto não tem degraus de duas alturas
 // dentro do mesmo bloco: cada borne é um parafuso numa só parede, com a
 // entrada do condutor na face superior/inferior e a serigrafia impressa
 // por cima do poço (fotos do manual GRT8-M p.1 e GRT8-A/B p.1).
 // GRT8-M2 é 2×SPDT: além de 15/16/18 tem o segundo inversor 25/26/28, numa
 // fila própria atrás da primeira, como no desenho do manual (p.1).
 // M2: duas filas na mesma parede do degrau inferior (y 8…22). 15/16/18 em baixo com a
 // entrada na base traseira; 25/26/28 por cima, com a entrada na face do degrau (y 8),
 // atrás do poço inferior. Os números vão impressos na frente, por baixo da tampa.
 const rows = m2
   ? [{ top: true, y: 82.6, z: 38, names: ['A1','S','A2'] },
      { top: false, y: 18.6, z: 38, depth: 9.4, mouthY: 8, mouthZ: 26.2, mouthR: 2.1, labelY: 25.9, names: ['25','26','28'] },
      { top: false, y: 11.0, z: 38, depth: 9.4, shank: 8, labelY: 23.6, names: ['15','16','18'] }]
   : [{ top: true, y: 82.6, z: 38, names: ['A1','S','A2'] },
      { top: false, y: 12.4, z: 38, names: ['15','16','18'] }]
 for(const { top, y, z, depth=9.6, shank=22.4, mouthY=top?92.5:2.5, mouthZ=14, mouthR=2.6, clampDy=10.4, labelY, names } of rows){
  for(const [i,label] of names.entries()){
   const x = -5.2 + i * 5.2
   // Poço frontal com parafuso cativo no fundo (Pozidriv), aberto na parede
   // do degrau (z 38 mm) e cavidade de 9,6 mm.
   drill([body],'z',[x,y,z],2.6,z-depth,z+.1)
   const screw=buildCaptiveTerminalScrew('geya_'+label,2.15);screw.position.set(x,y,z-1.25);root.add(screw)
   root.add(cylinder(.8,shank,steel,'industrial_geya_screw_shank_'+label,[x,y,z-2-shank/2]))
   // Janela oblonga do borne (a ranhura escura da referência) entre a
   // parede do degrau e o poço do parafuso.
   {
    // Parede aberta: nunca uma placa opaca por cima da cabeça metálica.
    const wall=new T.Mesh(new T.CylinderGeometry(2.53,2.53,3.7,32,1,true),mat('#494a45',.05,.7))
    wall.name='industrial_geya_driver_well_'+label;wall.position.set(x,y,z-1.85);wall.rotation.x=Math.PI/2;wall.material.side=T.DoubleSide;root.add(wall)
   }
   // Entrada do condutor na face superior/inferior, com grampo de cobre.
   drill([body],'y',[x,mouthY,mouthZ],mouthR,top?mouthY-10:mouthY-.1,top?mouthY+.3:mouthY+10)
   root.add(box(3.4,1.2,mouthR===2.6?9:4,copper,'industrial_geya_clamp_'+label,[x,top?mouthY-9.5:mouthY+clampDy,mouthZ]))
   terms.push(terminal(root,label,x,mouthY,mouthZ,{r:2.0,depth:8.6,face:top?'top':'bottom'}))
   // Serigrafia do degrau: a etiqueta real fica imediatamente acima do poço
   // (M2: duas linhas na frente, entre a tampa e o degrau, como na fotografia).
   root.add(plane(4.6,1.9,white,'industrial_geya_label_'+label,labelY?[x,labelY,64.06]:[x, y + (top?3.5:-3.5), z+.06]))
  }
 }
 // Paredes divisoras entre os três bornes de cada degrau, dentro do volume
 // do corpo (face a z 38, fundo a z 8). As antigas saíam 15 mm à frente do
 // degrau e liam-se como duas barbatanas soltas no ar.
 for(const dx of [-2.6,2.6]){
  root.add(box(1,8.4,10,GREY,'industrial_geya_divider_top_'+dx,[dx,82.5,33]))
  root.add(m2?box(1,13,10,GREY,'industrial_geya_divider_bot_'+dx,[dx,14.8,33]):box(1,8.0,10,GREY,'industrial_geya_divider_bot_'+dx,[dx,12.5,33]))
 }
 // Patilha vermelha de desbloqueio da calha DIN, visível na frente inferior.
 root.add(box(9,3.6,2.6,GREY_D,'industrial_geya_din_tab',[0,4,24.6]))
 {
  root.add(box(10,2.7,2.2,red,'industrial_geya_release_clip',[0,3.6,21.8]))
  root.add(box(6,.55,.6,dark,'industrial_geya_release_grip',[0,3,23]))
 }
 // Serigrafia lateral: diagramas de função/temporização (faces ±X do módulo).
 // Só dentro da zona em que a lateral tem a profundidade toda (y stepY…73, z 0…64):
 // o retângulo antigo saía da silhueta em baixo e lia-se como uma segunda placa (relé «duplicado»).
 const sideY0=stepY+1.5,sideY1=72,sideH=sideY1-sideY0,sideYc=(sideY0+sideY1)/2
 const sideR=plane(58,sideH,white,'industrial_geya_side_r',[9.04,sideYc,33]);sideR.rotation.y=Math.PI/2;root.add(sideR)
 const sideL=plane(58,sideH,white,'industrial_geya_side_l',[-9.04,sideYc,33]);sideL.rotation.y=-Math.PI/2;root.add(sideL)
 await store(type,root,terms,{kind:'dimensioned-reconstruction',source:type.startsWith('timerGeyaGrt8M')?'https://www.geya.net/wp-content/uploads/2021/05/GRT8-M-Instruction-Manual.pdf':'https://www.geya.net/wp-content/uploads/2022/10/GRT8-AB-Manual.pdf',changes:(b1?'B1/A230 refined against user product photograph: open driver wells, visible cross screws 1.25 mm behind the deck, cross-recess red selectors with radial indices, convex state-driven LED lenses, rounded cover, mould seams and flank timing/wiring serigraphy. Existing 18.08×95×65.35 mm asset envelope and all conductor endpoints retained. ':'')+'Nominal 18×90×64 mm body, 95 mm overall mounting tabs. Stepped body and open DIN notch. Six finite top/bottom conductor inlet slots aligned with the front wells, each with a visible copper clamp inside; recessed captive Pozidriv screws near the deck faces; divider walls between poles on both decks; red DIN release tab at the bottom front; function/timing diagram serigraphy on both flanks (photos IMG_5849-5851). Exact terminal identities A1/S/A2/15/16/18 retained. Manual fascia has separate knobs / LEDs; B1 reference retyped where applicable. Dimensioned visualization, not manufacturer STEP or certified metrology.'})
}

async function avel(){
 const type='levelRelayAvel411',root=device(type),terms=[]
 root.add(box(35,79,61.6,white,'industrial_avel_body',[0,39.5,46.8]))
 root.add(box(34,78,1,dark,'industrial_avel_base',[0,39.5,16.5]))
 root.add(cylinder(4.1,10,dark,'industrial_avel_key',[0,39.5,11]))
 root.add(plane(33,75.3,white,'industrial_avel_label',[0,39.5,77.61]))
 const lamps=[['industrial_led_tank_water',44.8,'#24a840'],['industrial_led_tank_dry',40.0,'#de2436'],['industrial_led_well_water',30.1,'#24a840'],['industrial_led_well_dry',24.9,'#de2436'],['industrial_led_relay',14.8,'#e3d21b'],['industrial_led_power',10.0,'#e3d21b']]
 for(const[name,y,c]of lamps)led(root,-11.5,y,77.63,c,name,.85)
 for(const t of before[type].terminals){const x=(t.x-.5)*35,y=(1-t.y)*79;root.add(cylinder(.78,16,steel,'industrial_pin_'+t.label,[x,y,8]));terms.push({label:t.label,point:[x,y,0],face:'back',contact:'pin',diameterMm:1.56,holeDepthMm:16})}
 await store(type,root,terms,{kind:'dimensioned-reconstruction',source:'https://www.caiado.pt/images/uploaded/CatalogosCaiado/catalogo-avel-reles-eletronicos.pdf',page:14,changes:'35×79×77 mm nominal, 77.61 mm visual envelope including label. Eleven undecal pins and six physical LEDs (tank wet/dry, well wet/dry, relay, supply). Front label rectified from original catalogue photo. No switches, display or automatically included base.'})
}

async function metaltex(){
 const type='buzzerMetaltexTby301',root=device(type),terms=[]
 // Corpo traseiro 47×47×36 mm. Face traseira (z=0) conforme foto IMG_5858:
 // boss circular do magneto, 4 parafusos M4 com anilha nos cantos, parafuso
 // central, etiqueta «BUZZER / AC110V / tend» e os 2 bornes na borda inferior.
 const body=box(47,47,36,dark,'industrial_tby_body',[0,0,18]);root.add(body)
 root.add(cylinder(16,2.4,mat('#2c2e28'),'industrial_tby_rear_dome',[0,5,-1.2]))
 for(const[px,py]of [[-19.5,-19.5],[19.5,-19.5],[-19.5,19.5],[19.5,19.5]]){
  root.add(cylinder(4.1,.55,steel,'industrial_tby_washer',[px,py,-0.28]))
  root.add(cylinder(3.1,1.7,steel,'industrial_tby_screw',[px,py,-1.35]))
  const slot=box(4.6,.8,.3,black,'industrial_tby_screw_slot',[px,py,-2.22]);root.add(slot)
 }
 // Parafuso central da tampa (fenda simples), por cima da etiqueta.
 root.add(cylinder(2.2,1.3,steel,'industrial_tby_screw_center',[0,10,-0.65]))
 const cslot=box(3.4,.6,.26,black,'industrial_tby_screw_center_slot',[0,10,-1.32]);root.add(cslot)
 // Etiqueta do fabricante na traseira, entre o parafuso central e os bornes.
 const sticker=plane(26,13,white,'industrial_metaltex_label',[0,-5,-0.06]);sticker.rotation.y=Math.PI;root.add(sticker)
 // Bornes de parafuso na borda inferior da traseira (1 à esquerda, 2 à direita),
 // com poço, contacto de latão e cabeça Pozidriv dentro do poço.
 for(const[label,tx]of [['1',-12],['2',12]]){
  drill([body],'z',[tx,-17,-18],2.3,-18.1,-12.4)
  terms.push(terminal(root,label,tx,-17,0,{r:2.3,depth:5.6,face:'back'}))
  const screw=buildCaptiveTerminalScrew('tby_'+label,1.8);screw.rotation.y=Math.PI;screw.position.set(tx,-17,-4.6);root.add(screw)
 }
 // Pescoço Ø30 de passagem na chapa e transição cónica a partir do corpo.
 const shoulder=cylinder(16.5,8,dark,'industrial_tby_shoulder',[0,0,40]);root.add(shoulder)
 root.add(cylinder(15,14,dark,'industrial_tby_neck',[0,0,51]))
 // Porca de aperto frontal Ø36 serrilhada fina (foto IMG_5859: estrias verticais densas).
 const bezel=cylinder(18,6,nickel,'industrial_tby_bezel',[0,0,58]);root.add(bezel)
 for(let i=0;i<48;i++){const a=i/48*Math.PI*2,knurl=box(.75,.75,6.2,zamac,'industrial_tby_bezel_knurl_'+i,[Math.cos(a)*17.9,Math.sin(a)*17.9,58]);knurl.rotation.z=a;root.add(knurl)}
 // Tampa acústica preta: base cilíndrica Ø28, rebordo com 12 estrias radiais
 // verticais (foto IMG_5859) e cúpula central suave.
 root.add(cylinder(14,7.4,black,'industrial_tby_horn',[0,0,64.3]))
 for(let i=0;i<12;i++){const a=i/12*Math.PI*2,r=box(1.3,1.3,6.4,black,'industrial_tby_ridge_'+i,[Math.cos(a)*13.9,Math.sin(a)*13.9,65]);r.rotation.z=a;root.add(r)}
 const dome=new T.Mesh(new T.SphereGeometry(13.2,32,10,0,Math.PI*2,0,Math.PI/2.7),black)
 dome.name='industrial_tby_dome';dome.scale.set(1,.4,1);dome.rotation.x=Math.PI/2;dome.position.set(0,0,67.6);root.add(dome)
 await store(type,root,terms,{kind:'dimensioned-reconstruction',source:'https://arquivo.metaltex.com.br/produtos/pdf/tby.pdf',changes:'47×47 mm rear body, nominal 69.5 mm depth; Ø30 panel neck, Ø36 finely knurled chrome front nut, Ø28 acoustic cap with dome and 8 radial slots (photo IMG_5859). Rear face per photo IMG_5858: circular magnet boss, four M4 corner screws with washers, centre screw, «BUZZER / AC110V / tend» sticker between centre screw and the two bottom-edge screw terminals (1 left, 2 right) with recessed Pozidriv heads. Sound is synthesized, not a recording or calibrated SPL.'})
}

/**
 * Botoeira Ø22 mm KEOLEA KL-XB2 (padrão XB2-BA31 / ZB2-BZ101). Reconstrução
 * cotada das fotos do utilizador: IMG_5854 (desenho cotado: cabeça metálica
 * Ø29, 55 mm total) e IMG_5853/5855/5856/5857 (bloco de contacto em poliamida
 * preta com serigrafia CE/KEOLEA/KL-XB2/Ui 660V/Ith 10A/Uimp 6kV/AC-15/DC-13/
 * GB/T14048.5 e bornes de parafuso NF 1-2 / NA 4-3 com entrada de condutor por
 * cima e por baixo).
 *
 * Eixo do aparelho = Z, cabeça em +Z. Pilha real (da frente para trás):
 *   disco colorido 2,5 · aro cromado Ø29 2,5 · cabeça/bainha 9,5 ·
 *   porca sextavada (aperta no painel) 3,5 · placa de zamak 30×30 10 ·
 *   bloco de contacto 33 mm (com os bornes atrás).
 *
 * O que estava errado na versão anterior e aqui se corrige:
 *  - os parafusos dos bornes eram parafusos captivos com o veio a crescer para
 *    TRÁS: a cabeça ficava 4,1 mm atrás da face traseira, a flutuar no ar, e o
 *    veio saía pela frente do bloco. São agora cabeças de fenda assentes na
 *    face traseira, com o veio para dentro do bloco (como no aparelho real).
 *  - o aro (Ø29) era mais largo do que a cabeça e ficava à frente do disco, com
 *    o «espigão» de fixação a atravessar o aro cromado: parecia uma porca solta
 *    em cima do botão. O aro é agora a aba frontal da cabeça, o disco assenta
 *    dentro dele, e o parafuso de fixação passou a ser a porca sextavada real
 *    atrás do painel.
 *  - os bornes não tinham identificação. A face traseira leva agora o número
 *    do borne gravado ao lado de cada poço (1/2 à esquerda, 4/3 à direita).
 */
async function xb2(type){
 const root=device(type),terms=[]
 const capColor={No:mat('#2f9e3f'),Nc:mat('#c8202b'),Black:mat('#20242a'),Yellow:mat('#f2c200'),Blue:mat('#1f5fd0'),White:mat('#f4f4ee')}[type.replace('pushButtonXb2','')]
 const isNc=type==='pushButtonXb2Nc'
 const pair=isNc?'12':'34'
 // Face traseira do bloco (z=0) e frente da cabeça (z≈58).
 const BACK=0, CONTACT_D=33
 const acetate=mat('#1b1d18',.04,.42)   // poliamida preta acetinada do bloco
 const steelScrew=mat('#b6bcc2',.88,.3) // parafusos zincados dos bornes
 // Bloco de contactos em poliamida preta 24×27×33 mm (largo×alto×fundo).
 const block=box(24,27,CONTACT_D,acetate,'industrial_xb2_contact',[0,0,BACK+CONTACT_D/2]);root.add(block)
 // Patilha metálica de retenção na borda inferior da face traseira (fotos do bloco).
 root.add(box(4,1.8,2.6,steel,'industrial_xb2_latch',[0,-13.2,1.4]))
 // Serigrafia branca nas duas faces laterais grandes (24×33 mm), texto legível
 // com a cabeça para cima (+Z). Planos 21×30 mm assentes nas faces ±Y.
 const etch=plane(21,30,polyamide,'industrial_xb2_etch_side_'+pair,[0,13.65,16.5]);etch.rotation.set(-Math.PI/2,0,Math.PI);root.add(etch)
 const etch2=plane(21,30,polyamide,'industrial_xb2_etch_side_rev_'+pair,[0,-13.65,16.5]);etch2.rotation.set(Math.PI/2,0,0);root.add(etch2)
 // Bornes de parafuso na face traseira (z=0), uma coluna por bloco:
 // NF à esquerda (1 em cima, 2 em baixo), NA à direita (4 em cima, 3 em baixo).
 const col=isNc?-6:6,labels=isNc?['1','2']:['4','3']
 // ATENÇÃO: drill/bore usam coordenadas LOCAIS da malha. O bloco tem 33 mm de
 // fundo e está centrado a z=16,5, logo a face traseira (mundo z=0) é a local
 // z=-16,5: o poço vai de -16,7 (boca) a -11,3 (fundo). Com coordenadas de
 // mundo o drill não cortava nada e a face traseira ficava cega — era isso que
 // tornava os parafusos «soltos».
 const REAR=-CONTACT_D/2
 for(const[label,wy]of [[labels[0],7],[labels[1],-7]]){
  drill([block],'z',[col,wy,REAR],2.05,REAR-.2,REAR+5.2)
  // Cabeça de fenda assente no FUNDO do poço, com o veio para dentro do bloco.
  // O parafuso fica no FUNDO do poço (cara a 4,4 mm da boca): o poço continua
  // aberto para o condutor entrar, como no borne real, e deixa de haver metal à
  // frente da cavidade declarada (holeDepthMm = 5,2).
  root.add(cylinder(1.95,.9,steelScrew,'terminal_screw_head_xb2_'+label,[col,wy,4.45],'z',20))
  root.add(box(1.7,.5,.45,mat('#4a4f52',.6,.5),'terminal_screw_slot_xb2_'+label,[col,wy,4.95]))
  root.add(cylinder(.95,7,steelScrew,'terminal_screw_shank_xb2_'+label,[col,wy,8.4],'z',12))
  // Entrada do condutor por cima (1/4) ou por baixo (2/3), ao encontro do poço.
  const top=wy>0
  drill([block],'y',[col,0,REAR+2.6],1.7,top?7.4:-13.6,top?13.6:-7.4)
  // Número do borne gravado ao lado do poço, na face traseira (plano virado a -Z).
  const num=plane(2.9,2.9,mat('#1b1d18',.04,.42),'industrial_xb2_terminal_'+label,[col+(col>0?-3.7:3.7),wy,-.04])
  num.rotation.y=Math.PI;root.add(num)
  terms.push(terminal(root,label,col,wy,0,{r:2.05,depth:5.2,face:'back',screw:false}))
 }
 // Placa média de zamak 30×30×10 mm — assenta na cara interior do painel.
 const PLATE=BACK+CONTACT_D, PLATE_D=10
 const plate=box(30,30,PLATE_D,zamac,'industrial_xb2_plate',[0,0,PLATE+PLATE_D/2]);root.add(plate)
 // Porca sextavada de fixação ao painel (a peça real que aperta a cabeça).
 const NUT=PLATE+PLATE_D
 const hexShape=new T.Shape();for(let i=0;i<6;i++){const a=Math.PI/6+i*Math.PI/3,px=Math.cos(a)*9.2,py=Math.sin(a)*9.2;i?hexShape.lineTo(px,py):hexShape.moveTo(px,py)}hexShape.closePath()
 const hexNut=new T.Mesh(new T.ExtrudeGeometry(hexShape,{depth:3.5,bevelEnabled:false}),nickel);hexNut.name='industrial_xb2_nut';hexNut.position.set(0,0,NUT);root.add(hexNut)
 // Vedação negra na base da cabeça (junta IP65 contra o painel).
 root.add(cylinder(13.2,1.1,mat('#141614',.02,.7),'industrial_xb2_gasket',[0,0,NUT+3.5]))
 // Cabeça cromada Ø29: bainha roscada + aba frontal (o aro que se vê no painel).
 const HEAD=NUT+3.5
 root.add(cylinder(13.6,9.5,nickel,'industrial_xb2_head',[0,0,HEAD+4.75]))
 // Aba/aro cromado Ø29 com rebaixo, onde o disco do actuador assenta (flush).
 const bezelShape=new T.Shape();bezelShape.absarc(0,0,14.5,0,Math.PI*2,false)
 const bezelHole=new T.Path();bezelHole.absarc(0,0,11.6,0,Math.PI*2,true);bezelShape.holes.push(bezelHole)
 const bezel=new T.Mesh(new T.ExtrudeGeometry(bezelShape,{depth:2.5,bevelEnabled:false,curveSegments:48}),nickel)
 bezel.name='industrial_xb2_bezel';bezel.position.set(0,0,HEAD+9.5);root.add(bezel)
 // Disco colorido do actuador, embutido no aro (flush, como no XB2-BA real).
 root.add(cylinder(11.7,2.4,capColor,'industrial_xb2_cap',[0,0,HEAD+10.5],'z',48))
 await store(type,root,terms,{kind:'dimensioned-reconstruction',source:'https://www.keolea.com/uploads/xb2-ba.pdf',changes:'Ø22 mm panel hole (22,5 mm cut-out); dimensioned from user photo set: Ø29 mm chrome head with the coloured actuator disc flush inside its front bezel (2,2 mm travel), hex fixing nut behind the 30×30×10 mm zinc-alloy plate, 24×27×33 mm black polyamide contact block, 55 mm overall. Rear-face screw terminals in one column: NC 1 over 2 left, NO 4 over 3 right, each with a slot-head screw seated inside the recess and its number engraved beside the well; conductor inlets from top/bottom; white serigraphy CE/KEOLEA/KL-XB2/Ui 660V/Ith 10A/Uimp 6kV/AC-15/DC-13/GB/T14048.5 on both flanks; coloured actuator disc travels 2 mm into the head and clicks to red on press (press feedback). Momentary with spring return; no latching or illumination invented.'})
}

// MICO Classic 4.6: reconstrução fotográfica, com a cota oficial 70 × 90 × 80 mm.
async function mico(){
 const {root,terms}=buildMicoClassic(bodyProfile)
 await store('breakerMurrelektronikMico46',root,terms,{kind:'dimensioned-reconstruction',source:'https://media.automation24.com/manual/101523.pdf',changes:'Rebuilt from the Classic 4.6 product photograph and manual V2.5: inclined spring terminals with two ON entries, open roof slots, charcoal rounded case, clear keys and separate protective flap, four sloping lower blades and side circuit marking. Manual envelope W70 H90 D80 mm. Reconstructed appearance, not manufacturer STEP.'})
}

const jobs=[['vfdSchneiderAtv320',atv],['relaySocketFinder9023',finderSocket],['relayFinder5534',finderRelay],['timerGeyaGrt8M1',()=>geya('timerGeyaGrt8M1')],['timerGeyaGrt8M2',()=>geya('timerGeyaGrt8M2')],['timerGeyaGrt8B1',()=>geya('timerGeyaGrt8B1')],['levelRelayAvel411',avel],['buzzerMetaltexTby301',metaltex],['pushButtonXb2No',()=>xb2('pushButtonXb2No')],['pushButtonXb2Nc',()=>xb2('pushButtonXb2Nc')],['pushButtonXb2Black',()=>xb2('pushButtonXb2Black')],['pushButtonXb2Yellow',()=>xb2('pushButtonXb2Yellow')],['pushButtonXb2Blue',()=>xb2('pushButtonXb2Blue')],['pushButtonXb2White',()=>xb2('pushButtonXb2White')],['breakerMurrelektronikMico46',mico]]
jobs.push(['breakerMurrelektronikMico24',async()=>{
 const {root,terms}=buildMico24(bodyProfile)
 await store('breakerMurrelektronikMico24',root,terms,{kind:'dimensioned-reconstruction',source:'https://shop.murrelektronik.com/index.php?anid=9000-41042-0100400_1&cl=details&fnc=outputSpecSheet&lang=5',changes:'Separate 36 × 90 × 80 mm MICO 2.4 reconstruction from user photograph and manufacturer product sheet. Two clear keys, 1/2/3/4 A selectors, protective flap, two lower channel blades, one input, duplicated ON, 13/14, GND and two duplicated output pairs. No invented serial or certification artwork. Not manufacturer STEP.'})
}])
for(const[type,job]of jobs)if(!process.argv[3]||process.argv[3]===type)await job()
await fs.writeFile('src/data/industrial-device-geometry.json',JSON.stringify(data,null,2)+'\n')
let previous=[];try{previous=JSON.parse(await fs.readFile(path.join(output,'sources.json'),'utf8')).models??[]}catch{}
await fs.writeFile(path.join(output,'sources.json'),JSON.stringify({notice:'Manufacturer trademarks belong to their owners. Adapted CAD / reconstructions are educational visualizations, not official replacement CAD, certified hardware, or fabrication data.',models:[...previous.filter(m=>!records.some(r=>r.type===m.type)),...records]},null,2)+'\n')
