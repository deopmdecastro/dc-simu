import * as T from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { SOCKET_DEVICES, socketWiringPoint, type SocketDeviceType } from '../electrical/socketDevices'

const ivory='#d9dbd7',blue='#0845bd',red='#c52b25'
const plastic=(color:string,roughness=.34)=>new T.MeshStandardMaterial({color,roughness,metalness:0})
const metal=()=>new T.MeshStandardMaterial({color:'#b8bec0',roughness:.23,metalness:.85})
function mesh(parent:T.Object3D,geometry:T.BufferGeometry,material:T.Material,p:number[]=[0,0,0],name=''){
  const m=new T.Mesh(geometry,material);m.position.set(p[0],p[1],p[2]);m.name=name;m.castShadow=true;m.receiveShadow=true;parent.add(m);return m
}
function box(parent:T.Object3D,w:number,h:number,d:number,p:number[],color:string,r=1,name=''){
  return mesh(parent,new RoundedBoxGeometry(w,h,d,3,Math.min(r,w/3,h/3,d/3)),plastic(color),p,name)
}
function roundedRect(w:number,h:number,r:number){
  const s=new T.Shape();s.moveTo(-w/2+r,-h/2);s.lineTo(w/2-r,-h/2);s.quadraticCurveTo(w/2,-h/2,w/2,-h/2+r);s.lineTo(w/2,h/2-r);s.quadraticCurveTo(w/2,h/2,w/2-r,h/2);s.lineTo(-w/2+r,h/2);s.quadraticCurveTo(-w/2,h/2,-w/2,h/2-r);s.lineTo(-w/2,-h/2+r);s.quadraticCurveTo(-w/2,-h/2,-w/2+r,-h/2);return s
}
function shell(parent:T.Object3D,w:number,h:number,d:number,back:number,color:string,r:number){
  const s=roundedRect(w,h,r),inside=roundedRect(w-6,h-6,Math.max(1,r-3))
  s.holes.push(new T.Path(inside.getPoints(24).reverse()))
  mesh(parent,new T.ExtrudeGeometry(s,{depth:d-3,steps:1,bevelEnabled:true,bevelSize:.6,bevelThickness:.6,bevelSegments:3,curveSegments:12}),plastic(color),[0,0,back+3],'socket-case-shell')
}
function disc(parent:T.Object3D,r:number,d:number,p:number[],color:string,name=''){
  const m=mesh(parent,new T.CylinderGeometry(r,r,d,64),plastic(color),p,name);m.rotation.x=Math.PI/2;return m
}
function ring(parent:T.Object3D,outer:number,inner:number,d:number,p:number[],color:string,name=''){
  const s=new T.Shape();s.absarc(0,0,outer,0,Math.PI*2,false)
  const hole=new T.Path();hole.absarc(0,0,inner,0,Math.PI*2,true);s.holes.push(hole)
  const g=new T.ExtrudeGeometry(s,{depth:d,bevelEnabled:false,curveSegments:48});g.translate(0,0,-d/2)
  return mesh(parent,g,plastic(color),p,name)
}
function screw(parent:T.Object3D,x:number,y:number,z:number,r=3,quarter=false){
  const m=mesh(parent,new T.CylinderGeometry(r,r,1.5,24),quarter?plastic('#c5c7bf'):metal(),[x,y,z],'socket-screw');m.rotation.x=Math.PI/2
  box(parent,r*1.4,.55,.3,[x,y,z+.8],'#626863',.1)
  if(!quarter)box(parent,.55,r*1.4,.3,[x,y,z+.81],'#626863',.1)
}
function label(parent:T.Object3D,w:number,h:number,p:number[],lines:string[],options:{bg?:string;fg?:string;name?:string}={}){
  if(typeof document==='undefined')return
  const c=document.createElement('canvas');c.width=768;c.height=384
  const ctx=c.getContext('2d');if(!ctx)return
  ctx.fillStyle=options.bg??'#eeeede';ctx.fillRect(0,0,c.width,c.height)
  ctx.fillStyle=options.fg??'#262b25';ctx.textAlign='center';ctx.textBaseline='middle'
  lines.forEach((text,i)=>{
    ctx.font=`${i===0?'bold ':''}${i===0?(lines.length===1?84:112):44}px Arial`
    ctx.fillText(text,384,lines.length===1?192:lines.length===2?(i===0?112:286):64+i*(266/Math.max(lines.length-1,1)),732)
  })
  const map=new T.CanvasTexture(c);map.colorSpace=T.SRGBColorSpace;map.anisotropy=8
  return mesh(parent,new T.PlaneGeometry(w,h),new T.MeshStandardMaterial({map,roughness:.6,polygonOffset:true,polygonOffsetFactor:-2}),p,options.name??'socket-print')
}
/** Fundo perfurado e mangas metálicas: os alvéolos são cavidades reais. */
function contactFace(parent:T.Object3D,r:number,z:number,holes:Array<[number,number]>,color:string){
  const s=new T.Shape();s.absarc(0,0,r,0,Math.PI*2,false)
  holes.forEach(([x,y])=>{const h=new T.Path();h.absarc(x,y,2.5,0,Math.PI*2,true);s.holes.push(h)})
  mesh(parent,new T.ExtrudeGeometry(s,{depth:2,bevelEnabled:false,curveSegments:48}),plastic(color),[0,0,z],'socket-contact-face')
  holes.forEach(([x,y],i)=>{
    const sleeve=ring(parent,2.45,1.65,6,[x,y,z-3],'#a69a6a',`socket-contact-${i}`)
    sleeve.material=new T.MeshStandardMaterial({color:'#a9a58d',metalness:.78,roughness:.28})
    disc(parent,1.7,.4,[x,y,z-6.2],'#222520')
  })
}
function hinge(parent:T.Object3D,x:number,y:number,z:number,w:number,color:string){
  const pin=mesh(parent,new T.CylinderGeometry(2.4,2.4,w,24),metal(),[x,y,z],'socket-hinge-pin');pin.rotation.z=Math.PI/2
  for(const side of [-1,1])box(parent,7,8,9,[x+side*(w/2-3),y,z],color,1.2)
}
function schuko(parent:T.Object3D,color:string,flange:boolean,action:string,closedZ:number){
  const root=new T.Group();parent.add(root)
  if(flange){
    const s=new T.Shape();s.moveTo(-23,-32);s.lineTo(23,-32);s.quadraticCurveTo(27,-32,27,-28);s.lineTo(27,28);s.quadraticCurveTo(27,32,23,32);s.lineTo(-23,32);s.quadraticCurveTo(-27,32,-27,28);s.lineTo(-27,-28);s.quadraticCurveTo(-27,-32,-23,-32)
    const hole=new T.Path();hole.absarc(0,0,21,0,Math.PI*2,true);s.holes.push(hole)
    mesh(root,new T.ExtrudeGeometry(s,{depth:5,bevelEnabled:false,curveSegments:48}),plastic(color),[0,0,0],'schuko-mounting-flange')
    for(const x of [-21,21])for(const y of [-25,25])screw(root,x,y,5.8,2.5)
  }
  const front=closedZ-4,floor=front-17
  ring(root,23,20.4,18,[0,0,front-9],color,'schuko-well');ring(root,24.3,20.4,2,[0,0,front],color,'schuko-lip')
  contactFace(root,20.4,floor,[[-9.5,0],[9.5,0]],color)
  for(const sign of [-1,1]){
    const clip=box(root,4,7,12,[0,sign*18,front-7],'#b6a577',.5,`schuko-earth-${sign}`)
    clip.material=new T.MeshStandardMaterial({color:'#b8af8c',roughness:.25,metalness:.75})
    box(root,5,2,2,[0,sign*20,front],color,.4)
  }
  if(action){
    const lid=new T.Group();lid.name=action;lid.userData.socketAction=action;lid.position.set(0,29,front+1);root.add(lid)
    disc(lid,25.2,3.2,[0,-29,1.6],color,'schuko-cover-disc');ring(lid,24.8,22.7,3,[0,-29,-.5],color,'schuko-cover-seal')
    box(lid,15,6,4,[0,-53,2.7],color,1.3,'schuko-cover-tab');box(lid,17,10,4,[0,-3,1.5],color,1.2)
    hinge(root,0,29,front+1,32,color)
  }
  return root
}
function cee(parent:T.Object3D,poles:3|5,color:string,action:string,fw:number,fh:number,projection:number,tilt=false){
  const frame=new T.Group();parent.add(frame);box(frame,fw,fh,6,[0,0,3],poles===5?ivory:color,5,'cee-mounting-flange')
  for(const x of [-1,1])for(const y of [-1,1])screw(frame,x*(fw/2-8),y*(fh/2-8),7,3)
  const root=new T.Group();root.rotation.x=tilt?T.MathUtils.degToRad(10):0;root.position.z=5;frame.add(root)
  const r=poles===5?29:24,mouth=projection-8
  ring(root,r+3,r-1,mouth-3,[0,0,(mouth+3)/2],poles===5?ivory:color,'cee-barrel');ring(root,r+3,r-1,3,[0,0,mouth],color,'cee-mouth-lip')
  const holes:Array<[number,number]>=poles===3?[[-9,6],[9,6],[0,-11]]:[[-11,8],[11,8],[-11,-8],[11,-8],[0,-17]]
  contactFace(root,r-1,7,holes,poles===5?'#ece9da':color);box(root,5,8,3,[0,-r+2,mouth+1],color,.6,'cee-keyway')
  const lid=new T.Group();lid.position.set(0,r+5,mouth+2);lid.name=action;lid.userData.socketAction=action;root.add(lid)
  disc(lid,r+4,4,[0,-r-5,2],color,'cee-cover-disc');ring(lid,r+3,r+1,3,[0,-r-5,-1],color,'cee-cover-rim')
  box(lid,poles===5?27:18,poles===5?19:9,5,[0,poles===5?6:-3,2],color,1.5,'cee-cover-hinge-web');box(lid,17,5,4,[0,-2*r-6,2],color,1,'cee-cover-tab')
  if(poles===5)label(lid,38,23,[0,-r-5,4.1],['Famatel','16A  3P+N+T  6h','380–415 V~  50/60Hz','IP44   Ref. 23331'],{name:'famatel-rating'})
  else label(lid,21,19,[-3,-r-7,4.1],['PCE','16A  2P+E','200–250 V~','6h    IP44'],{name:'pce-rating'})
  hinge(root,0,r+5,mouth+2,37,color);return frame
}
function caseShell(root:T.Group,type:SocketDeviceType){
  const d=SOCKET_DEVICES[type],back=-d.depth/2,front=back+d.caseDepth
  box(root,d.width,d.height,3,[0,0,back+1.5],ivory,2,'socket-case-back')
  shell(root,d.width,d.height,d.caseDepth,back,ivory,7)
  const fascia=new T.Group();fascia.name='socket-service-fascia';root.add(fascia);box(fascia,d.width+.5,d.height+.5,6,[0,0,front-1],ivory,5,'socket-case-fascia')
  // Parafusos de fecho da fascia (sempre metálicos — aparafusados)
  for(const x of [-1,1])for(const y of [-1,1]){
    disc(fascia,7,1,[x*(d.width/2-10),y*(d.height/2-10),front+2.2],'#babeb6')
    screw(fascia,x*(d.width/2-10),y*(d.height/2-10),front+3.3,5,false)
  }
  for(const side of [-1,1])for(const y of [-d.height*.23,d.height*.23]){const k=ring(root,10,9.5,.35,[side*(d.width/2+.2),y,back+d.caseDepth*.45],ivory,'socket-knockout');k.rotation.y=Math.PI/2}
  // Orelhas de fixação à parede / pilar / final de esteira (aparafusadas)
  // Combo já tinha; RoadEu 70929 e restantes passam a ter também para fixação visível.
  for(const x of [-1,1])for(const y of [-1,1]){
    const lug=box(root,14,16,4.5,[x*(d.width/2-5),y*(d.height/2+5),back+3.5],ivory,2,'socket-wall-lug')
    ring(lug,3.4,1.8,1.2,[0,0,2.4],'#b7bab4')
    // Parafuso de fixação (cabeça visível na orelha)
    screw(lug,0,0,3.2,2.8,false)
  }
  // Abas laterais extras no RoadEu (fixação a pilar IPE / final de esteira)
  if(type==='socketFamatelSwitch'){
    for(const side of [-1,1]){
      const ear=box(root,5,28,12,[side*(d.width/2+2.5),0,back+d.caseDepth*0.35],ivory,1.2,'socket-side-mount-ear')
      for(const yy of [-8,8])screw(ear,side*1.2,yy,7,2.4,false)
    }
  }
  return {fascia,front,back}
}
function serviceTerminals(root:T.Group,type:SocketDeviceType){
  const strip=new T.Group();strip.name='socket-wiring-compartment';root.add(strip)
  const labels=type==='socketFamatelCombo'?['L1','L2','L3','N','PE']:['L','N','PE']
  labels.forEach(text=>{
    const [x,y,z]=socketWiringPoint(type,text);box(strip,10,16,12,[x,y,z-5],text==='PE'?'#75896a':text==='N'?'#7491a0':'#c7bda6',1)
    const t=new T.Group();t.position.set(x,y,z);t.name=`socket-terminal-${text}`;strip.add(t);ring(t,3.3,2.2,2,[0,0,-1],'#a1a38c')
    const s=mesh(t,new T.CylinderGeometry(2,2,.8,24),metal(),[0,0,-2.5],'socket-terminal-screw');s.rotation.x=Math.PI/2
    box(strip,4,.5,.3,[x,y,z-2],'#565e55',.1);label(strip,8,4,[x,y+11,z],[text])
  })
}
function efapel(root:T.Group){
  const d=SOCKET_DEVICES.socketEfapelIp65,back=-d.depth/2,face=d.depth/2-4
  box(root,d.width,d.height,3,[0,0,back+1.5],'#c5c8c2',2,'efapel-box-back')
  shell(root,d.width,d.height,39,back,'#c5c8c2',4)
  const fascia=new T.Group();fascia.name='socket-service-fascia';root.add(fascia)
  for(const [x,y,w,h] of [[0,32,60,8],[0,-32,60,8],[-27,0,6,56],[27,0,6,56]])box(fascia,w,h,7,[x,y,face-10],'#cdd0c9',1.2,'efapel-inner-frame')
  for(const x of [-25.5,25.5])for(const y of [-26,26]){box(fascia,7,12,7,[x,y,face-10],'#b7bdb3',.7);screw(fascia,x,y,face-5.5,2.7)}
  const socket=new T.Group();socket.position.set(0,-2,face-19);fascia.add(socket);schuko(socket,'#d3d6cf',false,'',19)
  const lid=new T.Group();lid.name='socket-cover-main';lid.userData.socketAction=lid.name;lid.position.set(0,34,face);fascia.add(lid)
  box(lid,62,70,3,[0,-34,1.5],'#d1d4ce',2.4,'efapel-lid')
  for(const [x,y,w,h] of [[0,-1.8,57,2.5],[0,-66,57,2.5],[-29,-34,2.5,65],[29,-34,2.5,65]])box(lid,w,h,4,[x,y,-1.5],'#bfc5ba',.7,'efapel-lid-rib')
  ring(lid,23,20,6,[0,-36,-3],'#babfb5','efapel-lid-seal');box(lid,16,3.8,4,[0,-69,0],'#c4c9c0',.8,'efapel-latch')
  hinge(fascia,0,34,face,49,'#c9cdc5');label(lid,29,7,[0,-57,3.1],['EFAPEL'],{bg:'#d1d4ce',fg:'#b0b6ac',name:'efapel-emboss'})
}
function isolator(fascia:T.Group,x:number,y:number,z:number){
  const root=new T.Group();root.position.set(x,y,z);fascia.add(root);box(root,66,66,6,[0,0,3],'#ecde11',5,'isolator-yellow-plate')
  const dial=new T.Group();dial.position.z=8;dial.name='socket-isolator';dial.userData.socketAction=dial.name;root.add(dial)
  disc(dial,29,6,[0,0,3],red,'isolator-disc');ring(dial,29,25,7,[0,0,7],red,'isolator-raised-rim')
  box(dial,48,11,18,[0,0,14],red,3,'isolator-grip');screw(dial,-17,0,23.3,2)
  const lock=ring(dial,4.5,2.5,4,[-21,0,23],red,'isolator-padlock-hole');lock.rotation.y=Math.PI/2
  label(root,7,6,[0,24,15.2],['0'],{bg:red,fg:'#eab3a4',name:'isolator-zero'});label(root,7,6,[22,0,15.2],['I'],{bg:red,fg:'#eab3a4',name:'isolator-one'})
}
/** Ficha CEE 16A 2P+T (macho) — corpo azul, pinos, bucim traseiro para cabo revestido. */
function ceePlug(root:T.Group){
  const d=SOCKET_DEVICES.ceePlug16A,back=-d.depth/2,front=back+d.caseDepth
  // Corpo principal
  box(root,d.width,d.height,d.caseDepth-8,[0,0,(back+front)/2],blue,6,'cee-plug-body')
  // Anel / flange frontal
  ring(root,26,18,4,[0,0,front-2],blue,'cee-plug-collar')
  // Pinos macho (L, N, PE)
  for(const [x,y,name] of [[-9,6,'pin-L'],[9,6,'pin-N'],[0,-11,'pin-PE']] as const){
    const pin=mesh(root,new T.CylinderGeometry(2.2,2.2,14,16),metal(),[x,y,front+7],name)
    pin.rotation.x=Math.PI/2
  }
  // Bucim / prensa-cabos traseiro (entrada do cabo revestido)
  const gland=new T.Group();gland.name='auto-cable-gland';gland.position.set(0,0,back+4);root.add(gland)
  for(const [z,r,h] of [[0,14,5],[6,12,8],[13,9,6]])mesh(gland,new T.CylinderGeometry(r,r,h,20),plastic('#b5b9b1'),[0,0,z])
  const bore=ring(gland,7,4,2,[0,0,18],'#555e52','cable-gland-bore');bore.rotation.x=Math.PI/2
  // Bornes internos L/N/PE (lado do cabo)
  for(const [label,x,y] of [['L',-10,6],['N',10,6],['PE',0,-8]] as const){
    const t=new T.Group();t.position.set(x,y,back+16);t.name=`socket-terminal-${label}`;root.add(t)
    ring(t,3.2,2.1,2,[0,0,0],'#a1a38c')
    const s=mesh(t,new T.CylinderGeometry(1.8,1.8,.7,16),metal(),[0,0,-2],'socket-terminal-screw');s.rotation.x=Math.PI/2
  }
  label(root,28,10,[0,18,front-6],['CEE 16A','2P+T IP44'],{bg:blue,fg:'#e2e8f0',name:'cee-plug-rating'})
}

export function createSocketDeviceObject(type:SocketDeviceType):T.Group{
  const root=new T.Group();root.name=`socket-product-${type}`;root.userData.socketDevice=type
  if(type==='ceePlug16A'){ceePlug(root);return root}
  if(type==='socketEfapelIp65')efapel(root)
  else{
    const {fascia,front}=caseShell(root,type)
    if(type==='socketFamatelCombo'){
      const left=new T.Group();left.position.set(-49,6,front+3);fascia.add(left);schuko(left,blue,true,'socket-cover-blue',27)
      const right=new T.Group();right.position.set(43,-10,front+3);fascia.add(right);cee(right,5,red,'socket-cover-red',75,85,32,true)
      label(fascia,23,8,[-60,49,front+2.1],['FAMATEL'],{bg:ivory,fg:'#b7bab1',name:'famatel-emboss'})
    }else{
      const left=new T.Group();left.position.set(-47,-3,front+3);fascia.add(left);cee(left,3,blue,'socket-cover-blue',61,80,34)
      isolator(fascia,40,-7,front+3);label(fascia,43,12,[37,39,front+2.2],['ROADEU','ELEKTROTECHNIK'],{bg:ivory,fg:'#7e877b',name:'roadeu-brand'})
      const warning=new T.Group();warning.position.set(SOCKET_DEVICES[type].width/2+.5,0,front-28);warning.rotation.y=Math.PI/2;root.add(warning)
      const warningLabel=label(warning,81,28,[0,0,0],['WARNING','ISOLATE BEFORE OPENING'],{bg:'#f1e311',fg:'#242a1a',name:'roadeu-warning'});if(warningLabel)warningLabel.rotation.z=Math.PI/2
    }
  }
  serviceTerminals(root,type)
  const d=SOCKET_DEVICES[type],gland=new T.Group();gland.name='auto-cable-gland';gland.position.set(0,d.height/2,-d.depth/2+d.caseDepth*.45);root.add(gland)
  for(const [y,r,h,n] of [[3,12,6,6],[10,10,9,24],[17,8,6,24]])mesh(gland,new T.CylinderGeometry(r,r,h,n),plastic('#b5b9b1'),[0,y,0])
  const bore=ring(gland,7,4,2,[0,21,0],'#555e52','cable-gland-bore');bore.rotation.x=Math.PI/2;return root
}
export function applySocketDeviceState(root:T.Object3D,state:Record<string,any>,hasWires=false){
  for(const [name,key] of [['socket-cover-main','coverOpen'],['socket-cover-blue','blueCoverOpen'],['socket-cover-red','redCoverOpen']]){const lid=root.getObjectByName(name);if(lid)lid.rotation.x=(state[key]??state.coverOpen)?-T.MathUtils.degToRad(name==='socket-cover-main'?128:108):0}
  const fascia=root.getObjectByName('socket-service-fascia');if(fascia)fascia.visible=!state.serviceOpen
  const wiring=root.getObjectByName('socket-wiring-compartment');if(wiring)wiring.visible=Boolean(state.serviceOpen)
  const dial=root.getObjectByName('socket-isolator');if(dial)dial.rotation.z=state.switchOn===false?Math.PI/2:0
  const gland=root.getObjectByName('auto-cable-gland');if(gland)gland.visible=hasWires||state.glandVisible===true
  root.updateMatrixWorld(true)
}
export function disposeSocketDeviceObject(root:T.Object3D){
  const materials=new Set<T.Material>(),geometries=new Set<T.BufferGeometry>(),textures=new Set<T.Texture>()
  root.traverse(o=>{const m=o as T.Mesh;if(!m.isMesh)return;geometries.add(m.geometry);for(const a of Array.isArray(m.material)?m.material:[m.material])materials.add(a)})
  for(const m of materials){for(const v of Object.values(m))if(v instanceof T.Texture)textures.add(v);m.dispose()}textures.forEach(t=>t.dispose());geometries.forEach(g=>g.dispose())
}
