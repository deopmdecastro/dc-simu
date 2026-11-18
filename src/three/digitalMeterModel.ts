import { bindCachedCanvasTexture } from './canvasTextureCache'
import * as THREE from 'three'
import { getComponentPhysicalSizeMm, PANEL_UNITS_PER_MM as U, type ComponentModelSpec } from './modelPaths'
import { fitComponentModel, disposeModelClone } from './modelFit'
import { finiteBore } from './finiteBore'
import { cachedCanvasTexture } from './protectionMarkings'

export type DigitalMeterType = 'meterD522066' | 'meterKws306' | 'currentTransformerSplitCore'
export const isDigitalMeterType = (type: string): type is DigitalMeterType => type === 'meterD522066' || type === 'meterKws306' || type === 'currentTransformerSplitCore'

export function digitalMeterSpec(type: DigitalMeterType): ComponentModelSpec {
  const physicalSizeMm = getComponentPhysicalSizeMm(type)!
  return { path:`procedural:${type}`,rotation:[0,0,0],placement:type==='currentTransformerSplitCore'?'machine':'din-rail',targetHeight:physicalSizeMm.height*U,physicalSizeMm }
}
const material=(color:string,metalness=0)=>new THREE.MeshStandardMaterial({color,metalness,roughness:.55})

/** Seven-segment phosphor layout drawn locally; no downloaded font or demo
 * screenshot. Values still come exclusively from the wired electrical state. */
function sevenSegmentText(ctx:CanvasRenderingContext2D,x:number,bottom:number,text:string,height:number,color:string,align:CanvasTextAlign='right',maxWidth=600):void {
  const step=(c:string)=>height*(c==='.'?.22:.65),width=[...text].reduce((n,c)=>n+step(c),0),k=Math.min(1,maxWidth/Math.max(1,width))
  ctx.save();ctx.translate(x-(align==='right'?width*k:align==='center'?width*k/2:0),bottom-height*k);ctx.scale(k,k);ctx.fillStyle=color
  const w=height*.52,t=height*.095,gap=height*.025
  const polygon=(p:number[][])=>{ctx.beginPath();p.forEach(([a,b],i)=>i?ctx.lineTo(a,b):ctx.moveTo(a,b));ctx.closePath();ctx.fill()}
  const horizontal=(y:number)=>polygon([[t/2,y],[w-t/2,y],[w,y+t/2],[w-t/2,y+t],[t/2,y+t],[0,y+t/2]])
  const vertical=(a:number,y:number)=>{const h=(height-t)/2-gap;polygon([[a,y+t/2],[a+t/2,y],[a+t,y+t/2],[a+t,y+h-t/2],[a+t/2,y+h],[a,y+h-t/2]])}
  const segments:Record<string,string>={'0':'abcdef','1':'bc','2':'abged','3':'abgcd','4':'fgbc','5':'afgcd','6':'afgecd','7':'abc','8':'abcdefg','9':'abfgcd','-':'g'}
  for(const c of text){
    if(c==='.'){ctx.beginPath();ctx.arc(height*.055,height-height*.055,height*.052,0,Math.PI*2);ctx.fill()}
    else for(const segment of segments[c]??''){
      if(segment==='a')horizontal(0);if(segment==='g')horizontal((height-t)/2);if(segment==='d')horizontal(height-t)
      if(segment==='f')vertical(0,t/2+gap);if(segment==='b')vertical(w-t,t/2+gap)
      if(segment==='e')vertical(0,(height+t)/2+gap);if(segment==='c')vertical(w-t,(height+t)/2+gap)
    }
    ctx.translate(step(c),0)
  }
  ctx.restore()
}

function profileBody(width:number,points:Array<[number,number]>,holes:Array<[number,number,number]>,mat:THREE.Material):THREE.Mesh {
  const shape=new THREE.Shape();points.forEach(([z,y],i)=>i?shape.lineTo(-z,y):shape.moveTo(-z,y));shape.closePath()
  for(const[z,y,r]of holes){const p=new THREE.Path();p.absarc(-z,y,r,0,Math.PI*2,true);shape.holes.push(p)}
  const g=new THREE.ExtrudeGeometry(shape,{depth:width,bevelEnabled:false,curveSegments:24})
  g.applyMatrix4(new THREE.Matrix4().set(0,0,1,-width/2,0,1,0,0,-1,0,0,0,0,0,0,1))
  return new THREE.Mesh(g,mat)
}

/** Procedural, cotado e identificável — não é apresentado como CAD do fabricante.
 * A janela do D52 atravessa X; o TC externo atravessa Z. São volumes vazados,
 * nunca um cilindro preto maciço. As bocas de aperto são subtraídas do corpo. */
export function createDigitalMeterObject(type:DigitalMeterType,state:Record<string,unknown>={}):THREE.Group {
  const root=new THREE.Group();root.name=type;root.userData.digitalMeterType=type
  // Nominal physical frame is independent of a protruding key or printed ink.
  root.userData.proceduralScalePreserved=true;root.userData.physicalFrameMm={...getComponentPhysicalSizeMm(type)!};root.userData.frameUnitsPerMm=U
  const white=material('#e1e1d7'),dark=material('#23272b'),steel=material('#b7b9b3',.7),blue=material('#148aca')
  const mesh=(g:THREE.BufferGeometry,m:THREE.Material,name:string,at:[number,number,number]=[0,0,0])=>{const n=new THREE.Mesh(g,m);n.name=name;n.position.set(...at);root.add(n);return n}
  const box=(w:number,h:number,d:number,m:THREE.Material,name:string,at:[number,number,number])=>mesh(new THREE.BoxGeometry(w,h,d),m,name,at)
  const plane=(w:number,h:number,m:THREE.Material,name:string,at:[number,number,number])=>{const n=mesh(new THREE.PlaneGeometry(w,h),m,name,at);n.userData.protectionMarking=true;return n}
  const button=(x:number,y:number,z:number,r:number,name:string,m=white)=>{const g=new THREE.CylinderGeometry(r,r,1.2,24);g.rotateX(Math.PI/2);return mesh(g,m,name,[x,y,z])}
  const bore=(body:THREE.Mesh,label:string,point:[number,number,number],axis:'x'|'y'|'z',normal:[number,number,number],radius:number,depth:number,through=false)=>{
    const k={x:0,y:1,z:2}[axis],v=point[k],dir=normal[k],old=body.geometry
    body.geometry=finiteBore(old,axis,point,radius,through?-100:Math.min(v,v-dir*depth)-.01,through?100:Math.max(v,v-dir*depth)+.01);old.dispose()
    const group=new THREE.Group();group.name='digital_meter_connection_'+label;group.position.set(...point)
    group.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),new THREE.Vector3(...normal))
    const wallG=new THREE.CylinderGeometry(radius-.02,radius-.02,depth,24,1,true);wallG.rotateX(Math.PI/2);wallG.translate(0,0,-depth/2)
    const wallM=material('#33372f');wallM.side=THREE.DoubleSide
    const wall=new THREE.Mesh(wallG,wallM);wall.name='cavity_'+label;group.add(wall)
    if(!through){const g=new THREE.CylinderGeometry(radius*.65,radius*.65,.6,24);g.rotateX(Math.PI/2);const screw=new THREE.Mesh(g,steel);screw.position.z=-depth+.4;screw.name='contact_'+label;group.add(screw)}
    root.add(group)
  }
  const marking=(text:string,x:number,y:number,z:number,w:number,h:number,name:string)=>{
    const tex=cachedCanvasTexture(`meter:ink:${text}`,512,128,(ctx,pw,ph)=>{ctx.fillStyle='#343b3b';ctx.font='600 64px Arial, sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,pw/2,ph/2,pw-10)})
    if(tex){const mat=new THREE.MeshBasicMaterial({map:tex,transparent:true,polygonOffset:true,polygonOffsetFactor:-2});bindCachedCanvasTexture(mat,tex);const n=plane(w,h,mat,name,[x,y,z]);n.raycast=()=>{}}
  }
  if(type==='currentTransformerSplitCore'){
    const shape=new THREE.Shape();shape.moveTo(-15,0);shape.lineTo(15,0);shape.quadraticCurveTo(18,0,18,3);shape.lineTo(18,45);shape.quadraticCurveTo(18,48,15,48);shape.lineTo(-15,48);shape.quadraticCurveTo(-18,48,-18,45);shape.lineTo(-18,3);shape.quadraticCurveTo(-18,0,-15,0);shape.closePath()
    const hole=new THREE.Path();hole.absarc(0,28,8,0,Math.PI*2,true);shape.holes.push(hole)
    const body=mesh(new THREE.ExtrudeGeometry(shape,{depth:24,bevelEnabled:false,curveSegments:32}),dark,'digital_meter_ct_body')
    // Joint line and hinge are outside the primary window, so it remains open.
    box(36,.18,.12,material('#111819'),'digital_meter_ct_split',[0,28,24.03]);
    const seam=root.getObjectByName('digital_meter_ct_split') as THREE.Mesh;seam.geometry.dispose();seam.geometry=new THREE.BoxGeometry(9.7,.18,.12);seam.position.x=-13.1
    box(9.7,.18,.12,material('#111819'),'digital_meter_ct_split_right',[13.1,28,24.03])
    for(const[label,x]of [['S1',-4],['S2',4]] as const)bore(body,label,[x,5,24],'z',[0,0,1],2.2,5)
    box(3.2,8,23.5,dark,'digital_meter_ct_hinge',[-16,28,12])
    box(3.2,10,3.5,dark,'digital_meter_ct_latch',[16,28,22.3])
    mesh(new THREE.TorusGeometry(8.3,.2,6,48),material('#747b78',.55),'digital_meter_ct_core_lip',[0,28,24.01])
    marking('QNCTK1-16',0,43,24.04,26,3.1,'digital_meter_ct_type')
    marking('100 A / 50 mA',0,12.5,24.04,25,3,'digital_meter_ct_rating')
  }else if(type==='meterD522066'){
    const body=profileBody(54,[[0,0],[42,0],[42,22],[64,22],[64,67],[44,67],[44,80],[0,80],[0,57],[7.5,57],[7.5,22],[0,22]],[[18,12,7.5]],white);body.name='digital_meter_body';root.add(body)
    const tube=new THREE.CylinderGeometry(7.45,7.45,53.7,36,1,true);tube.rotateZ(Math.PI/2)
    const wall=material('#3b4039');wall.side=THREE.DoubleSide;mesh(tube,wall,'digital_meter_ct_tunnel',[0,12,18])
    box(53,44.6,.8,material('#eeeee6'),'digital_meter_frame',[0,44.5,63.6])
    box(46,38,.1,dark,'digital_meter_lcd_recess',[-3.1,44,64.01])
    plane(43.5,35.5,new THREE.MeshBasicMaterial({color:'#090c0b'}),'digital_meter_lcd',[-3.3,44,64.08])
    button(22.5,45,63.7,1.65,'digital_meter_reset',blue)
    for(const[label,x]of [['1',-14],['2',-4]] as const){
      bore(body,label,[x,0,30],'y',[0,-1,0],2.7,12)
      // Front screwdriver wells are distinct from the bottom conductor mouths.
      bore(body,'screwdriver_'+label,[x,12,42],'z',[0,0,1],2.8,11)
    }
    marking('D52-2066',-13.4,65.1,64.09,21.5,2.1,'digital_meter_type')
    marking('Multi-Function Digital Meter',-2.5,24.1,64.09,43,2,'digital_meter_legend')
    marking('1    2',-9,17,42.025,22,2.5,'digital_meter_voltage_terminals')
    marking('RESET',22.4,41.4,64.09,5.3,1.5,'digital_meter_reset_label')
    // Fine molded joints, not contrasting stripes across a generic block.
    for(const x of [-18,18])box(.10,79,.05,material('#cdd0c7'),'digital_meter_mold_seam',[x,40,43.96])
    for(const y of [18,61]){box(11,2,2,white,'digital_meter_din_clip_bar',[0,y,1]);for(const x of [-4,4])box(1.4,6,1.8,white,'digital_meter_din_clip_arm',[x,y+2,1])}
  }else{
    const body=profileBody(74,[[0,0],[43,0],[43,18],[65,20],[65,66.5],[43,68.5],[43,86.5],[0,86.5],[0,61],[7.5,61],[7.5,25],[0,25]],[],white);body.name='digital_meter_body';root.add(body)
    box(68,48,1,dark,'digital_meter_frame',[0,43.25,64.45])
    plane(52,42,new THREE.MeshBasicMaterial({color:'#090c0b'}),'digital_meter_lcd',[-5,43.25,65.01])
    for(const [i,label]of ['M','+','−','ON/OFF'].entries()){
      const y=58.25-i*10,name=i===3?'digital_meter_switch':i===0?'digital_meter_menu':`digital_meter_menu_${i}`
      box(3.7,7,1.2,i===3?material('#e8e8db'):white,name,[30.7,y,64.5]);marking(label,25.6,y,65.13,i===3?6:3.3,2.3,'digital_meter_button_ink')
    }
    for(const [i,x]of [-28,-9.3,9.3,28].entries()){
      bore(body,['L1-IN','L2-IN','L3-IN','N-IN'][i],[x,86.5,30],'y',[0,1,0],3.7,12)
      bore(body,['L1-OUT','L2-OUT','L3-OUT','N-OUT'][i],[x,0,30],'y',[0,-1,0],3.7,12)
      bore(body,'screwdriver_top_'+i,[x,78.5,43],'z',[0,0,1],3.5,11)
      bore(body,'screwdriver_bottom_'+i,[x,7.5,43],'z',[0,0,1],3.5,11)
    }
    marking('A        B        C        N',0,84,43.02,65,4,'digital_meter_input_marking')
    marking('A        B        C        N',0,14.5,43.02,65,4,'digital_meter_output_marking')
    marking('KWS-306',-25,20.5,65.14,17,2.1,'digital_meter_type')
  }
  root.traverse(n=>{if(n instanceof THREE.Mesh){n.geometry.scale(U,U,U);n.position.multiplyScalar(U);n.castShadow=n.receiveShadow=true;n.userData.digitalMeterPart=n.name}else if(n!==root)n.position.multiplyScalar(U)})
  applyDigitalMeterState(root,type,state);return root
}

const displays=new WeakMap<THREE.Object3D,{texture:THREE.CanvasTexture;canvas:HTMLCanvasElement;signature:string}>()
/** Uma textura por LCD, atualizada in-place; sem alocar uma textura por scan. */
export function applyDigitalMeterState(root:THREE.Object3D,type:DigitalMeterType,s:Record<string,unknown>):void {
  const display=root.getObjectByName('digital_meter_lcd') as THREE.Mesh|undefined
  if(!display||typeof document==='undefined')return
  let entry=displays.get(display)
  if(!entry){const canvas=document.createElement('canvas');canvas.width=640;canvas.height=560;const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;entry={texture,canvas,signature:''};displays.set(display,entry);for(const material of Array.isArray(display.material)?display.material:[display.material])material.dispose();display.material=new THREE.MeshBasicMaterial({map:texture,toneMapped:false})}
  const fields=type==='meterD522066'?['on','voltage','current','power','energy','frequency','powerFactor']:['on','switchOn','screenMode','vA','vB','vC','iA','iB','iC','pA','pB','pC','energy','frequency','temp']
  const signature=JSON.stringify(fields.map(k=>s[k]));if(signature===entry.signature)return;entry.signature=signature
  const ctx=entry.canvas.getContext('2d');if(!ctx)return
  ctx.fillStyle='#060908';ctx.fillRect(0,0,640,560)
  const on=!!s.on
  if(on){
    const value=(key:string,digits:number)=>Number(s[key]??0).toFixed(digits)
    const text=(x:number,y:number,t:string,size:number,color:string,align:CanvasTextAlign='right')=>{if(/^-?\d+(?:\.\d+)?$/.test(t)){sevenSegmentText(ctx,x,y,t,size,color,align);return}ctx.fillStyle=color;ctx.font=`bold ${size}px Arial, sans-serif`;ctx.textAlign=align;ctx.fillText(t,x,y)}
    if(type==='meterD522066'){
      sevenSegmentText(ctx,532,104,value('power',1),86,'#e7ef24','right',500);text(610,103,'W',48,'#e7ef24')
      sevenSegmentText(ctx,506,235,value('energy',2),82,'#e88632','right',480);text(616,233,'kWh',41,'#e88632')
      sevenSegmentText(ctx,313,381,value('voltage',1),65,'#18cbd3','right',290);text(355,381,'V',37,'#18cbd3')
      sevenSegmentText(ctx,557,381,value('frequency',1),61,'#dce9e4','right',195);text(617,381,'Hz',32,'#dce9e4')
      sevenSegmentText(ctx,313,507,value('current',2),65,'#f24836','right',290);text(355,507,'A',37,'#f24836')
      sevenSegmentText(ctx,557,507,value('powerFactor',2),61,'#24b9d4','right',195);text(617,507,'PF',32,'#24b9d4')
    }else{
      // Presentation pages share the same wired measurements. This is not an
      // emulation of undocumented KWS firmware/configuration menus.
      const mode=((Number(s.screenMode)||0)%3+3)%3
      if(mode===1){
        text(30,66,'ENERGY',40,'#8ab8b1','left');text(612,195,value('energy',3)+' kWh',74,'#35c4b2')
        text(30,315,'TOTAL',35,'#b2c7c2','left');text(612,394,(Number(s.pA??0)+Number(s.pB??0)+Number(s.pC??0)).toFixed(3)+' kW',70,'#e0c94b')
        text(30,510,value('frequency',1)+' Hz',42,'#c5ddda','left')
      }else if(mode===2){
        text(28,50,'PHASE POWER',36,'#a9c9c0','left')
        for(const [i,phase]of ['A','B','C'].entries()){const y=150+i*125;text(28,y,phase,48,'#cbd2cb','left');text(615,y,value('p'+phase,3)+' kW',65,'#e0c94b');text(615,y+51,value('v'+phase,1)+' V  '+value('i'+phase,3)+' A',33,'#69aaba')}
      }else for(const [i,phase]of ['A','B','C'].entries()){
        const y=100+i*112;text(23,y,phase,39,'#cbd2cb','left');text(230,y,value('v'+phase,1),51,'#44bbde');text(423,y,value('i'+phase,3),51,'#e35c54');text(618,y,value('p'+phase,3),49,'#e0c94b')
      }
      if(mode===0){text(230,35,'V',32,'#44bbde');text(423,35,'A',32,'#e35c54');text(618,35,'kW',32,'#e0c94b');text(25,462,value('energy',2)+' kWh',50,'#35c4b2','left');text(618,462,value('frequency',0)+' Hz',47,'#c5ddda')}
      text(25,535,s.switchOn===false?'OFF':'ON',36,s.switchOn===false?'#dc7169':'#42c759','left');text(618,535,'KWS-306',29,'#7c918b')
    }
  }
  entry.texture.needsUpdate=true
}
export function releaseDigitalMeterDisplay(root:THREE.Object3D):void {const mesh=root.getObjectByName('digital_meter_lcd');if(mesh){displays.get(mesh)?.texture.dispose();displays.delete(mesh)}}

/** Editável no Admin: mesma geometria vazada, não uma miniatura ou fotografia. */
export async function digitalMeterGlbData(type:DigitalMeterType,state:Record<string,unknown>):Promise<string>{
  const {GLTFExporter}=await import('three/examples/jsm/exporters/GLTFExporter.js')
  const root=fitComponentModel(createDigitalMeterObject(type,state),digitalMeterSpec(type),.001,'bottom')
  // Persist the nominal metre frame. Admin must convert it rigidly to mm,
  // not recentre/re-scale its envelope using protruding keys, ink or clips.
  root.userData.digitalMeterType=type;root.userData.digitalMeterUnitsPerMm=.001
  let buffer:ArrayBuffer
  try{buffer=await new GLTFExporter().parseAsync(root,{binary:true}) as ArrayBuffer}finally{releaseDigitalMeterDisplay(root);disposeModelClone(root)}
  const bytes=new Uint8Array(buffer);let binary='';for(let i=0;i<bytes.length;i+=0x8000)binary+=String.fromCharCode(...bytes.subarray(i,i+0x8000))
  return `data:model/gltf-binary;base64,${btoa(binary)}`
}
