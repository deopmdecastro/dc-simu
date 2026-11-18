/**
 * node scripts/build-industrial-devices.mjs <pasta STEP> [tipo]
 * ATV / Finder: CAD original, sem redimensionamento não uniforme.
 * GEYA / AVEL / Metaltex: reconstruções cotadas, NÃO CAD oficial.
 * Impressos: scripts/build-industrial-labels.py; fontes/hash em sources.json.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import * as T from 'three'
import { readStep, mat, fromOcc, box, plane, cylinder, shapePlate, drill, terminal, led, writeGlb } from './lib/cad-building.mjs'

const source = path.resolve(process.argv[2] ?? '/home/user/work/industrial-devices-audit/cad-rebuilt')
const output = path.resolve('public/models/industriais')
await fs.mkdir(output, { recursive: true })
const before = JSON.parse(await fs.readFile('src/data/industrial-device-geometry.json', 'utf8'))
const data = { ...before }, records = []
const dark=mat('#3a3b36'),white=mat('#e5e5da'),blue=mat('#0b478a'),red=mat('#ce1229'),steel=mat('#aab0a8',.75,.32),black=mat('#151712'),green=mat('#3eae27'),copper=mat('#ac6631',.75,.4)
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
 data[type]={path:`/models/industriais/${type}.glb`,physicalSizeMm,terminals:terms.map(t=>({label:t.label,face:t.face,contact:t.contact,x:round((t.point[0]-bounds.min.x)/size.x),y:round(1-(t.point[1]-bounds.min.y)/size.y),z:round((t.point[2]-bounds.min.z)/size.z),diameterMm:t.diameterMm,holeDepthMm:t.holeDepthMm}))}
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
 const solids=[]
 for(const [i,m] of r.meshes.entries()){
  const node=fromOcc(m,map,i===7?green:i===14||i===15||i===12?steel:dark,'atv320_cad_'+i)
  if(i===7){node.geometry.computeBoundingBox();const c=node.geometry.boundingBox.getCenter(new T.Vector3());node.geometry.translate(-c.x,-c.y,-c.z);const pivot=new T.Group();pivot.name='industrial_encoder';pivot.position.copy(c);node.name='industrial_encoder_body';pivot.add(node);root.add(pivot)}
  else if(i===10||i===11)cover.add(node)
  else {root.add(node);solids.push(node)}
 }
 root.add(box(8,8,1.1,dark,'industrial_escape',[-23.7,94.5,132.5]))
 root.add(plane(50.4,16.2,dark,'industrial_display_frame',[-1,116.8,131.95]))
 root.add(plane(30.3,8.1,black,'industrial_lcd',[-1,115.1,132.02]))
 cover.add(plane(14,21,white,'industrial_product_sticker',[24.6,94.4,131.96]))
 cover.add(plane(20,26,dark,'industrial_danger_label',[-23.4,31.1,131.96]))
 cover.add(plane(16,16,dark,'industrial_altivar_label',[0,25.1,131.96]))
 cover.add(plane(14,4.8,white,'industrial_schneider_logo',[24,20.5,131.96]))
 root.add(box(3,16,1,dark,'industrial_cover_latch',[31.5,39,132.1]))
 for(const [i,color]of ['#c52224','#16a56b','#c52224'].entries())led(root,-12+i*10,121.5,132.1,color,['industrial_led_fault','industrial_led_run','industrial_led_can'][i])
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
 await store(type,root,terms,{kind:'adapted-manufacturer-CAD',source:'https://media.distributordatasolutions.com/228/schneider_synd_us_xlsx/4cd04adf5708d2c1d973e6277f32c6ca12387619.zip',cadMember:'MCADID0000926_3D-simplified.stp',cadSha256:r.sha256,changes:'Rigid Rx(+90°). Functional lower power cavities / control block rebuilt to NVE41289 pp.100/120/123. Named encoder, ESC, service cover and three original-function LEDs. Control connector placement is functional, not certified metrology.'})
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
 for(const [i,label]of labels.entries()){const p=[-5.2+(i%3)*5.2,i<3?86.5:8.5,38];drill([body],'z',p,2.3,33,38.1);terms.push(terminal(root,label,...p,{r:2.3,depth:5}))}
 await store(type,root,terms,{kind:'dimensioned-reconstruction',source:type==='timerGeyaGrt8M1'?'https://www.geya.net/wp-content/uploads/2021/05/GRT8-M-Instruction-Manual.pdf':'https://www.geya.net/wp-content/uploads/2022/10/GRT8-AB-Manual.pdf',changes:'Nominal 18×90×64 mm body, 95 mm overall mounting tabs. Stepped body, open DIN notch, six real-depth front cavities. Local manual fascia adapted: knobs / LEDs separated; common A2 illustration relabelled B1 where applicable. No manufacturer STEP obtained.'})
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
 const body=box(47,47,36, dark,'industrial_tby_body',[0,0,18]);root.add(body)
 root.add(box(47,47,8, dark,'industrial_tby_shoulder',[0,0,40]))
 root.add(cylinder(15,14, dark,'industrial_tby_neck',[0,0,51]))
 root.add(cylinder(17.5,3, steel,'industrial_tby_bezel',[0,0,59.5]))
 root.add(cylinder(12.5,9.5,black,'industrial_tby_horn',[0,0,64.75]))
 // Recessed grille: actual slots through a thin perforated face, not a luminous lens.
 const holes=[];for(let x=-7.5;x<=7.5;x+=3)for(let y=-7.5;y<=7.5;y+=3)if(x*x+y*y<85)holes.push([x,y,.8])
 const grille=shapePlate(21,21,.5,holes,dark,'industrial_tby_grille', [0,0,69]);root.add(grille)
 for(const[label,y]of [['1',-6.5],['2',6.5]]){drill([body],'z',[0,y,-18],2.1,-18.1,-13);terms.push(terminal(root,label,0,y,0,{r:2.1,depth:5,face:'back'}))}
 const label=plane(28,10,white,'industrial_metaltex_label',[0,23.51,24]);label.rotation.x=-Math.PI/2;root.add(label)
 await store(type,root,terms,{kind:'dimensioned-reconstruction',source:'https://arquivo.metaltex.com.br/produtos/pdf/tby.pdf',changes:'47×47 mm rear body, nominal 69.5 mm depth; Ø30 panel neck, Ø35 bezel and Ø25 acoustic mouth, two rear connections. Printed brand cropped from actual PDF; nominal 110 V AC label reconstructed. Sound is synthesized, not a recording or calibrated SPL.'})
}

const jobs=[['vfdSchneiderAtv320',atv],['relaySocketFinder9023',finderSocket],['relayFinder5534',finderRelay],['timerGeyaGrt8M1',()=>geya('timerGeyaGrt8M1')],['timerGeyaGrt8B1',()=>geya('timerGeyaGrt8B1')],['levelRelayAvel411',avel],['buzzerMetaltexTby301',metaltex]]
for(const[type,job]of jobs)if(!process.argv[3]||process.argv[3]===type)await job()
await fs.writeFile('src/data/industrial-device-geometry.json',JSON.stringify(data,null,2)+'\n')
let previous=[];try{previous=JSON.parse(await fs.readFile(path.join(output,'sources.json'),'utf8')).models??[]}catch{}
await fs.writeFile(path.join(output,'sources.json'),JSON.stringify({notice:'Manufacturer trademarks belong to their owners. Adapted CAD / reconstructions are educational visualizations, not official replacement CAD, certified hardware, or fabrication data.',models:[...previous.filter(m=>!records.some(r=>r.type===m.type)),...records]},null,2)+'\n')
