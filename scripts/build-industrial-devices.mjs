/**
 * node --import tsx scripts/build-industrial-devices.mjs <pasta STEP> [tipo]
 * ATV / Finder: CAD original, sem redimensionamento não uniforme.
 * GEYA / AVEL / Metaltex: reconstruções cotadas, NÃO CAD oficial.
 * Impressos: scripts/build-industrial-labels.py; fontes/hash em sources.json.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import * as T from 'three'
import { readStep, mat, fromOcc, box, plane, cylinder, shapePlate, drill, terminal, led, writeGlb } from './lib/cad-building.mjs'
import { buildCaptiveTerminalScrew } from '../src/three/terminalHardware.ts'

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
function knob(root,name,x,y,z,r=2.25,color=red) {
 const group=new T.Group();group.name=name;group.position.set(x,y,z)
 group.add(cylinder(r,.7,color,name+'_body'))
 const slot=box(r*1.4,.42,.12,black,name+'_slot',[0,0,.39]);slot.rotation.z=Math.PI/4;group.add(slot);root.add(group)
}
function bodyProfile(width,points,material,name) {
 const s=new T.Shape();points.forEach(([z,y],i)=>i?s.lineTo(z,y):s.moveTo(z,y));s.closePath()
 const g=new T.ExtrudeGeometry(s,{depth:width,bevelEnabled:false});g.applyMatrix4(new T.Matrix4().set(0,0,1,-width/2,0,1,0,0,-1,0,0,0,0,0,0,1))
 const m=new T.Mesh(g,material);m.name=name;return m
}
async function store(type,root,terms,provenance) {
 root.updateMatrixWorld(true)
 const bounds=new T.Box3().setFromObject(root,true),size=bounds.getSize(new T.Vector3()),center=bounds.getCenter(new T.Vector3())
 const round=v=>+v.toFixed(6)
 const physicalSizeMm={width:round(size.x),height:round(size.y),depth:round(size.z)}
 const recess=RECESS_ONLY[type]
 data[type]={path:`/models/industriais/${type}.glb`,physicalSizeMm,terminals:terms.map(t=>({label:t.label,face:t.face,contact:recess?.has(t.label)?'surface':t.contact,x:round((t.point[0]-bounds.min.x)/size.x),y:round(1-(t.point[1]-bounds.min.y)/size.y),z:round((t.point[2]-bounds.min.z)/size.z),diameterMm:t.diameterMm,holeDepthMm:t.holeDepthMm}))}
 // Bake translation once; parent remains identity for the Admin's named pivots.
 const offset=new T.Vector3(-center.x,-bounds.min.y,-bounds.min.z)
 for(const child of root.children)child.position.add(offset)
 const result=await writeGlb(new URL('file://'+path.join(output,type+'.glb')),root)
 const record={type,...provenance,physicalSizeMm,interfaces:terms.length,cavities:terms.filter(t=>t.contact==='socket').length,pins:terms.filter(t=>t.contact==='pin').length,...result}
 records.push(record);console.log(type,result.bytes,physicalSizeMm,`${record.cavities} cavidades, ${record.pins} pinos`)
}

async function atv() {
 const type='vfdSchneiderAtv320',r=await readStep(path.join(source,'MCADID0000926_3D-simplified.stp')),root=device(type),map=(x,y,z)=>[x-36,-z,y]
 const cover=new T.Group();cover.name='industrial_control_cover';root.add(cover)
 // Materiais fiéis à unidade real (fotografia eibabo ATV320U04M2C): tampa e
 // flap quase negros (#2e2f2c), corpo cinzento-escuro quente (#3a3b36).
 const faceDark=mat('#2e2f2c')
 const solids=[]
 for(const [i,m] of r.meshes.entries()){
  const material=i===7?green:i===14||i===15||i===12?steel:i===10||i===11?faceDark:dark
  const node=fromOcc(m,map,material,'atv320_cad_'+i)
  if(i===7){node.geometry.computeBoundingBox();const c=node.geometry.boundingBox.getCenter(new T.Vector3());node.geometry.translate(-c.x,-c.y,-c.z);const pivot=new T.Group();pivot.name='industrial_encoder';pivot.position.copy(c);node.name='industrial_encoder_body';pivot.add(node);root.add(pivot)}
  else if(i===10||i===11)cover.add(node)
  else {root.add(node);solids.push(node)}
 }
 // Serigrafia do HMI real (fotografia eibabo ATV320U04M2C): janela LCD no
 // topo; "CAN Run"/"CAN Err" com LED verde/vermelho por cima da janela;
 // coluna Ref/Mon/Conf à esquerda e Value/Unit à direita; ESC (quadrado
 // escuro com rótulo por baixo) à esquerda do encoder; autocolante QR de
 // fábrica à direita do encoder. Plano frontal da tampa: z≈132 mm.
 const FACE=132.14
 root.add(plane(52,17.5,faceDark,'industrial_display_frame',[-3,113.4,131.98]))
 root.add(plane(35,10.5,black,'industrial_lcd',[-3,113.4,FACE+.02]))
 const legendPlane=(name,w,h,x,y)=>root.add(plane(w,h,white,name,[x,y,FACE+.04]))
 legendPlane('industrial_hmi_legend_can_run',9,2.4,-8,122.9)
 legendPlane('industrial_hmi_legend_can_err',9,2.4,6,122.9)
 led(root,-8,121.1,FACE+.05,'#16a56b','industrial_led_run',.9)
 led(root,6,121.1,FACE+.05,'#c52224','industrial_led_fault',.9)
 legendPlane('industrial_hmi_legend_ref',6,2.6,-22,116.9)
 legendPlane('industrial_hmi_legend_mon',6,2.6,-22,113.4)
 legendPlane('industrial_hmi_legend_conf',6,2.6,-22,109.9)
 legendPlane('industrial_hmi_legend_value',7,2.6,15.5,115.4)
 legendPlane('industrial_hmi_legend_unit',7,2.6,15.5,111.4)
 // Botão ESC físico (quadrado escuro, rótulo "ESC" impresso por baixo).
 root.add(box(6.5,6.5,1.4,faceDark,'industrial_escape',[-19.5,95.5,FACE-.3]))
 legendPlane('industrial_escape_label',5.5,2.6,-19.5,90.6)
 // Autocolante QR de fábrica à direita do encoder (conteúdo reconstruído, sem
 // ligação real: ver sources.json — não inventa URL nem número de série).
 cover.add(plane(15,15,white,'industrial_qr_sticker',[26.5,95.5,131.99]))
 // Etiqueta de características na face lateral direita, como na unidade real.
 const side=plane(26,40,white,'industrial_product_sticker',[36.15,88,75]);side.rotation.y=Math.PI/2;root.add(side)
 cover.add(plane(20,26,dark,'industrial_danger_label',[-23.4,31.1,131.96]))
 cover.add(plane(16,16,dark,'industrial_altivar_label',[0,25.1,131.96]))
 cover.add(plane(14,4.8,white,'industrial_schneider_logo',[24,20.5,131.96]))
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
 // y/z profile extruded along X. DIN notch and stepped access ends are real voids.
 const profile=[[0,2.5],[0,37],[-7.5,37],[-7.5,58],[0,58],[0,92.5],[-24,92.5],[-24,87],[-38,87],[-38,77],[-64,73],[-64,22],[-38,18],[-38,8],[-24,8],[-24,2.5]]
 const body=bodyProfile(18,profile,white,'industrial_geya_body');root.add(body)
 root.add(shapePlate(16,5,1.5,[[0,0,2.1]],red,'industrial_din_latch_bottom',[0,2.5,1]))
 root.add(shapePlate(16,5,1.5,[[0,0,2.1]],red,'industrial_din_latch_top',[0,92.5,1]))
 root.add(plane(17.6,43.5,white,'industrial_fascia',[0,49.5,64.015]))
 knob(root,'industrial_range',-2.4,59.5,64.9,2.4)
 knob(root,'industrial_fraction',.45,51.9,64.9,2.4)
 if(type==='timerGeyaGrt8M1')knob(root,'industrial_function',-2.4,44.3,64.9,2.4)
 led(root,-2.6,66.7,64.5,'#18a33b','industrial_led_power',1.2);led(root,2.55,66.7,64.5,'#cb1430','industrial_led_relay',1.2)
 const labels=['A1','S','A2','15','16','18']
 for(const [i,label]of labels.entries()){
  const x=-5.2+(i%3)*5.2,top=i<3,screwY=top?83.5:11.5
  // Keep each complete rim inside its stepped deck. The former 86.5/8.5 mm
  // centres cut across its edge and left half the cavity floating in space.
  const p=[x,screwY,38];drill([body],'z',p,2.2,29,38.1)
  terminal(root,'driver_'+label,...p,{r:2.2,depth:9,screw:false})
  const screw=buildCaptiveTerminalScrew('geya_'+label,1.78);screw.position.set(x,screwY,34.1);root.add(screw)
  root.add(cylinder(.8,19,steel,'industrial_geya_screw_shank_'+label,[x,screwY,23.6]))
  // Real conductor inlets are separate from the front screw/key access.
  const mouth=[x,top?92.5:2.5,14]
  drill([body],'y',mouth,1.75,top?83.5:2.4,top?92.6:11.5)
  terms.push(terminal(root,label,...mouth,{r:1.75,depth:9,face:top?'top':'bottom'}))
 }
 await store(type,root,terms,{kind:'dimensioned-reconstruction',source:type==='timerGeyaGrt8M1'?'https://www.geya.net/wp-content/uploads/2021/05/GRT8-M-Instruction-Manual.pdf':'https://www.geya.net/wp-content/uploads/2022/10/GRT8-AB-Manual.pdf',changes:'Nominal 18×90×64 mm body, 95 mm overall mounting tabs. Stepped body and open DIN notch. Six finite top/bottom conductor inlets, distinct from fully enclosed front screw wells; recessed captive screws with geometric cross slots. Exact terminal identities A1/S/A2/15/16/18 retained. Manual fascia has separate knobs / LEDs; B1 reference retyped where applicable. Dimensioned visualization, not manufacturer STEP or certified metrology.'})
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
 // Corpo traseiro 47×47×36 mm (nas fotos tend o borne fica nesta caixa), gola de
 // transição Ø30, pescoço de passagem na chapa, aro cromado serrilhado Ø35 à frente
 // e tampa acústica preta com grelha de ranhuras.
 const body=box(47,47,36,dark,'industrial_tby_body',[0,0,18]);root.add(body)
 // Quatro parafusos M3 de montagem da tampa traseira (cabeças visíveis, fenda simples).
 for(const[px,py]of [[-19.5,-19.5],[19.5,-19.5],[-19.5,19.5],[19.5,19.5]]){
  const head=cylinder(2.6,1.1,steel,'industrial_tby_screw',[px,py,-0.55]);root.add(head)
  const slot=box(4.2,.7,.24,black,'industrial_tby_screw_slot',[px,py,-1.08]);root.add(slot)
 }
 // Etiqueta do fabricante na traseira, entre os parafusos (foto IMG_5858).
 const sticker=plane(28,20,white,'industrial_metaltex_label',[0,0,-1.02]);sticker.rotation.y=Math.PI;root.add(sticker)
 const shoulder=cylinder(16.5,8,dark,'industrial_tby_shoulder',[0,0,40]);root.add(shoulder)
 root.add(cylinder(15,14,dark,'industrial_tby_neck',[0,0,51]))
 // Aro de aperto serrilhado (estrias radiais visíveis na foto).
 const bezel=cylinder(17.5,3,nickel,'industrial_tby_bezel',[0,0,59.5]);root.add(bezel)
 for(let i=0;i<36;i++){const a=i/36*Math.PI*2,knurl=box(1.1,1.1,3,zamac,'industrial_tby_bezel_knurl_'+i,[Math.cos(a)*17.4,Math.sin(a)*17.4,59.5]);knurl.rotation.z=a;root.add(knurl)}
 root.add(cylinder(12.5,9.5,black,'industrial_tby_horn',[0,0,64.75]))
 // Grelha côncava com furos reais atravessados na tampa (não é uma lente luminosa).
 const holes=[];for(let x=-7.5;x<=7.5;x+=3)for(let y=-7.5;y<=7.5;y+=3)if(x*x+y*y<85)holes.push([x,y,.8])
 const grille=shapePlate(21,21,.5,holes,dark,'industrial_tby_grille',[0,0,69]);root.add(grille)
 for(const[label,y]of [['1',-6.5],['2',6.5]]){drill([body],'z',[0,y,-18],2.1,-18.1,-13);terms.push(terminal(root,label,0,y,0,{r:2.1,depth:5,face:'back'}))}
 await store(type,root,terms,{kind:'dimensioned-reconstruction',source:'https://arquivo.metaltex.com.br/produtos/pdf/tby.pdf',changes:'47×47 mm rear body, nominal 69.5 mm depth; Ø30 panel neck, Ø35 knurled chrome bezel and Ø25 acoustic mouth with recessed grille; four rear M3 cover screws; maker sticker relocated to the rear face as in the user photographs («tend / BUZZER / AC110V»); two rear screw connections. Printed brand cropped from actual PDF; nominal 110 V AC label reconstructed. Sound is synthesized, not a recording or calibrated SPL.'})
}

/**
 * Botoeira Ø22 mm KEOLEA KL-XB2 (padrão XB2-BA). Reconstrução cotada das fotos
 * do utilizador (IMG_5853–5857): cabeça metálica com aro serrilhado Ø29 mm,
 * anel de fixação, tampa redonda da cor do actuador e bloco de contactos
 * NO (verde, 3-4) ou NC (vermelho, 1-2) com serigrafia elétrica nas faces.
 * Posição de instalação: cabeça virada para +Z (fora da chapa), contactos atrás.
 */
async function xb2(type){
 const root=device(type),terms=[]
 // Família KEOLEA KL-XB2: 6 cores de cabeça, corpo metálico cromado e bloco de contacto
 // preto com êmbolo colorido por função (verde=NA 3-4, vermelho=NF 1-2).
 const capColor={No:mat('#16a34a'),Nc:mat('#dc2626'),Black:mat('#1f2937'),Yellow:mat('#eab308'),Blue:mat('#2563eb'),White:mat('#f8fafc')}[type.replace('pushButtonXb2','')]
 const plungerColor=type==='pushButtonXb2No'||type==='pushButtonXb2Black'||type==='pushButtonXb2Yellow'||type==='pushButtonXb2Blue'||type==='pushButtonXb2White'?green:red
 const contactColor=black
 // Tampa Ø22,5 mm: corpo metálico com disco superior colorido.
 root.add(cylinder(11.25,9.5,zamac,'industrial_xb2_cap',[0,0,42.15]))
 root.add(cylinder(10.8,1.2,capColor,'industrial_xb2_cap_face',[0,0,47.45]))
 for(let i=0;i<28;i++){const a=i/28*Math.PI*2,knurl=box(1.05,1.05,2.1,zamac,'industrial_xb2_bezel_knurl_'+i,[Math.cos(a)*13.35,Math.sin(a)*13.35,37.6]);knurl.rotation.z=a;root.add(knurl)}
 root.add(cylinder(14.5,2.6,nickel,'industrial_xb2_bezel',[0,0,36.6]))
 // Parafuso de fixação lateral embutido na parede da cabeça (centro no eixo do anel).
 const fixing=buildCaptiveTerminalScrew('xb2_fixing',1.0);fixing.position.set(13.2,0,36.0);root.add(fixing)
 // Furo Ø22 mm na chapa; porca de aperto atrás.
 root.add(cylinder(11,22,dark,'industrial_xb2_body',[0,0,24]))
 root.add(cylinder(13.5,4.5,nickel,'industrial_xb2_locknut',[0,0,15.8]))
 for(let i=0;i<24;i++){const a=i/24*Math.PI*2,knurl=box(1.1,1.1,4.5,zamac,'industrial_xb2_locknut_knurl_'+i,[Math.cos(a)*13.6,Math.sin(a)*13.6,15.8]);knurl.rotation.z=a;root.add(knurl)}
 // Bloco de contactos cúbico 22×46×22 mm em poliamida preta.
 root.add(box(22,46,22,contactColor,'industrial_xb2_contact',[0,0,2]))
 // Êmbolo de comando colorido no topo do bloco (indica a função elétrica).
 root.add(cylinder(6,2.2,plungerColor,'industrial_xb2_plunger',[0,0,24.9]))
 // Serigrafia elétrica nas faces laterais (Ui 660V / Ith 10A / AC-15 / DC-13 / diagrama).
 const pair=type==='pushButtonXb2No'||type==='pushButtonXb2Black'||type==='pushButtonXb2Yellow'||type==='pushButtonXb2Blue'||type==='pushButtonXb2White'?'34':'12'
 const etch=plane(19.6,17.6,polyamide,'industrial_xb2_etch_side_'+pair,[0,23.15,2]);etch.rotation.x=Math.PI/2;root.add(etch)
 const etch2=plane(19.6,17.6,polyamide,'industrial_xb2_etch_side_rev_'+pair,[0,-23.15,2]);etch2.rotation.x=-Math.PI/2;root.add(etch2)
 const backPlate=plane(19.6,19.6,polyamide,'industrial_xb2_etch_back',[0,0,-9.15]);backPlate.rotation.y=Math.PI;root.add(backPlate)
 // Bornes 1-2 (NC) ou 3-4 (NO) com cabeça de parafuso Pozidriv; bornes ficam no topo do bloco.
 const labels=pair==='34'?['3','4']:['1','2']
 for(const[label,y]of [[labels[0],-6.6],[labels[1],6.6]]){
  drill([root.getObjectByName('industrial_xb2_contact')],'z',[0,y,11],1.9,8.6,11.1)
  terms.push(terminal(root,label,0,y,11,{r:1.9,depth:2.4,face:'bottom',contact:'socket'}))
  const head=buildCaptiveTerminalScrew('xb2_'+label,1.35);head.position.set(0,y,9.6);root.add(head)
  const pin=cylinder(1.5,8.2,copper,'industrial_xb2_pin_'+label,[0,y,4.4]);root.add(pin)
 }
 await store(type,root,terms,{kind:'dimensioned-reconstruction',source:'https://www.keolea.com/uploads/xb2-ba.pdf',changes:'Ø22 mm panel hole; Ø29 mm knurled chrome bezel; metallic cap body with coloured top disc; zamac body; 22×46×22 mm black polyamide contact block with coloured function plunger (green NO 3-4, red NC 1-2) and Pozidriv screw terminals; serigraphic electrical ratings on sides/back. Contacts are momentary with spring return; no latching or illumination invented.'})
}

// Murrelektronik MICO Classic 4.6 (9000-41034-0100600): proteção eletrónica 24 V DC,
// 4 canais, corpo calha DIN 90(A)×70(L)×80(P) mm com bornes de mola verdes.
// Nota: drill/bore usa coordenadas LOCAIS do mesh (box() é centrado na posição).
async function mico(){
 const type='breakerMurrelektronikMico46',root=device(type),terms=[]
 const GREEN=mat('#3a9b2e'),DARKGREEN=mat('#1f5c1a'),BODY=mat('#2b2d2a'),BODY2=mat('#3a3d38')
 // Corpo principal 70L × 80A × 58P mm (frente em +Z). Centro mundial [0,40,29].
 const body=box(70,80,58,BODY,'industrial_mico_body',[0,40,29]);root.add(body)
 // Rebordo inferior com reentrância DIN (trilho TH35 à traseira, z=0 lado calha).
 root.add(box(70,14,10,BODY2,'industrial_mico_din_base',[0,7,5]))
 root.add(box(70,9,6,black,'industrial_mico_din_clip',[0,3.5,2]))
 // Degrau superior: grelhas de ventilação horizontais.
 for(let i=0;i<7;i++)root.add(box(2.4,1.6,50,black,'industrial_mico_vent_top_'+i,[-21+i*7,79.4,30]))
 // Helper: cavidade aberta na face superior (mundo y=80; corpo local y=40).
 // O bloco verde é decorativo; o contacto fica na superfície do corpo.
 const cavityTop=(name,x,y,z,r,label)=>{
  const blk=box(name.includes('small')?7.5:9.5,name.includes('small')?9:12,name.includes('small')?7.5:9,GREEN,name,[x,y,z]);root.add(blk)
  root.add(box(name.includes('small')?3.6:4.4,2,1,DARKGREEN,name+'_slot',[x,y,z+(name.includes('small')?3.6:4.0)]))
  drill([body],'y',[x,40,z],r,34,40)
  terms.push(terminal(root,label,x,80.0,z,{r,depth:6,face:'top',contact:'surface'}))
 }
 // Entradas +24V (esq/dir, topo).
 cavityTop('industrial_mico_in_plus_1',-17,68,56,2.0,'L+')
 cavityTop('industrial_mico_in_plus_2', 17,68,56,2.0,'L+2')
 // Bloco central ON (remote) + 13/14 (Sammelmeldung): bornes de mola pequenos.
 cavityTop('industrial_mico_on_small',-9,76.25,56,1.7,'ON')
 cavityTop('industrial_mico_alarm13_small',1.5,76.25,56,1.7,'13')
 cavityTop('industrial_mico_alarm14_small',11,76.25,56,1.7,'14')
 // Serigrafia: logótipo (esq) + legenda LED (dir).
 root.add(plane(20,10,white,'industrial_mico_logo',[-21,55,58.6]))
 root.add(plane(26,10,white,'industrial_mico_legend',[14,55,58.6]))
 // 4 canais: seletor de corrente, LED, botão ON/OFF.
 const chX=[-24.5,-8.2,8.2,24.5]
 for(let i=0;i<4;i++){
  const x=chX[i],ch=String(i+1)
  const sel=new T.Group();sel.name='industrial_mico_select_'+ch;sel.position.set(x,44,58.6)
  sel.add(cylinder(2.6,.9,mat('#1a1c1a'),'industrial_mico_select_body_'+ch))
  sel.add(box(3.4,.5,.14,mat('#e8e8de'),'industrial_mico_select_mark_'+ch,[0,0,.48]))
  root.add(sel)
  led(root,x,36.5,58.6,'#d8e6d8','industrial_mico_led_'+ch,1.15)
  const btn=new T.Group();btn.name='industrial_mico_button_'+ch;btn.position.set(x,29,58.6)
  btn.add(cylinder(2.7,1.1,mat('#2f9e2c'),'industrial_mico_button_cap_'+ch))
  btn.add(box(2.6,.4,.2,mat('#0f3010'),'industrial_mico_button_slot_'+ch,[0,0,.5]))
  root.add(btn)
 }
 // Grelha de ventilação frontal.
 for(let i=0;i<11;i++)root.add(box(1.7,8,2.2,BODY2,'industrial_mico_vent_'+i,[-25+i*5,18,57.4]))
 // Saídas OUT1-4 (fundo): blocos verdes decorativos; contacto na superfície do corpo.
 for(let i=0;i<4;i++){
  const x=chX[i]
  const blk=box(9.5,12,9,GREEN,'industrial_mico_out_'+String(i+1),[x,6,56]);root.add(blk)
  root.add(box(4.4,2.5,1.2,DARKGREEN,'industrial_mico_out_slot_'+String(i+1),[x,6,60.0]))
  drill([body],'y',[x,40,56],2.0,-40,-28)
  terms.push(terminal(root,'OUT'+String(i+1),x,0.0,56,{r:2.0,depth:6,face:'bottom',contact:'surface'}))
 }
 // GND 0V entradas (fundo, cantos).
 const gnd=(name,x,label)=>{
  const blk=box(9.5,12,9,GREEN,name,[x,6,56]);root.add(blk)
  root.add(box(4.4,2.5,1.2,DARKGREEN,name+'_slot',[x,6,60.0]))
  drill([body],'y',[x,40,56],2.0,-40,-28)
  terms.push(terminal(root,label,x,0.0,56,{r:2.0,depth:6,face:'bottom',contact:'surface'}))
 }
 gnd('industrial_mico_gnd_1',-30,'GND')
 gnd('industrial_mico_gnd_2', 30,'GND2')
 // Texto "Output not intended to be interconnected" na base frontal.
 root.add(plane(40,4.5,white,'industrial_mico_class2',[0,2.2,58.6]))
 await store(type,root,terms,{kind:'dimensioned-reconstruction',source:'https://media.automation24.com/manual/101523.pdf',changes:'90×70×80 mm (H×W×D) DIN TH35 housing, 4-channel electronic circuit protection. Spring-clamp terminals: 2× +24V inputs 16 mm² top, ON/13/14 signal terminals 2.5 mm² top-center, 4× OUT 4 mm² bottom, 2× GND 4 mm² bottom corners. Per-channel: countersunk 1/2/4/6 A current selector, bi-colour LED (green/red, flash states), ON/OFF button. Group alarm potential-free 13-14, remote ON, cascading 75 ms channel start, status memory. Front serigraphy MURR ELEKTRONIK + LED legend. Dimensioned reconstruction, not manufacturer STEP.'})
}

const jobs=[['vfdSchneiderAtv320',atv],['relaySocketFinder9023',finderSocket],['relayFinder5534',finderRelay],['timerGeyaGrt8M1',()=>geya('timerGeyaGrt8M1')],['timerGeyaGrt8B1',()=>geya('timerGeyaGrt8B1')],['levelRelayAvel411',avel],['buzzerMetaltexTby301',metaltex],['pushButtonXb2No',()=>xb2('pushButtonXb2No')],['pushButtonXb2Nc',()=>xb2('pushButtonXb2Nc')],['pushButtonXb2Black',()=>xb2('pushButtonXb2Black')],['pushButtonXb2Yellow',()=>xb2('pushButtonXb2Yellow')],['pushButtonXb2Blue',()=>xb2('pushButtonXb2Blue')],['pushButtonXb2White',()=>xb2('pushButtonXb2White')],['breakerMurrelektronikMico46',mico]]
for(const[type,job]of jobs)if(!process.argv[3]||process.argv[3]===type)await job()
await fs.writeFile('src/data/industrial-device-geometry.json',JSON.stringify(data,null,2)+'\n')
let previous=[];try{previous=JSON.parse(await fs.readFile(path.join(output,'sources.json'),'utf8')).models??[]}catch{}
await fs.writeFile(path.join(output,'sources.json'),JSON.stringify({notice:'Manufacturer trademarks belong to their owners. Adapted CAD / reconstructions are educational visualizations, not official replacement CAD, certified hardware, or fabrication data.',models:[...previous.filter(m=>!records.some(r=>r.type===m.type)),...records]},null,2)+'\n')
