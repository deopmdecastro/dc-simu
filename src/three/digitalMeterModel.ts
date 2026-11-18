import { bindCachedCanvasTexture } from './canvasTextureCache'
import * as THREE from 'three'
import { getComponentPhysicalSizeMm, PANEL_UNITS_PER_MM as U, type ComponentModelSpec } from './modelPaths'
import { fitComponentModel, disposeModelClone } from './modelFit'
import { finiteBore } from './finiteBore'
import { cachedCanvasTexture } from './protectionMarkings'
import { DEVICE_LCD_SIZE, deviceLcdFrame, drawDeviceLcd, type DeviceLcdProfile } from './deviceLcd'

export type DigitalMeterType = 'meterD522066' | 'meterKws306' | 'currentTransformerSplitCore'
export const isDigitalMeterType = (type: string): type is DigitalMeterType => type === 'meterD522066' || type === 'meterKws306' || type === 'currentTransformerSplitCore'

export function digitalMeterSpec(type: DigitalMeterType): ComponentModelSpec {
  const physicalSizeMm = getComponentPhysicalSizeMm(type)!
  return { path:`procedural:${type}`,rotation:[0,0,0],placement:type==='currentTransformerSplitCore'?'machine':'din-rail',targetHeight:physicalSizeMm.height*U,physicalSizeMm }
}
const material=(color:string,metalness=0)=>new THREE.MeshStandardMaterial({color,metalness,roughness:.55})

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
    // Photographed LCD is ~1.48:1, not the almost-square full fascia.
    plane(52,35.1,new THREE.MeshBasicMaterial({color:'#090c0b'}),'digital_meter_lcd',[-5,44.2,65.01])
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
  const profile:DeviceLcdProfile=type==='meterD522066'?'d52-2066':'kws-306'
  let entry=displays.get(display)
  if(!entry){
    const canvas=document.createElement('canvas'),size=DEVICE_LCD_SIZE[profile];canvas.width=size.width;canvas.height=size.height
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4
    entry={texture,canvas,signature:''};displays.set(display,entry)
    for(const material of Array.isArray(display.material)?display.material:[display.material])material.dispose()
    display.material=new THREE.MeshBasicMaterial({map:texture,toneMapped:false});display.material.userData.protectionMarking=true
  }
  const frame=deviceLcdFrame(profile,s),signature=JSON.stringify(frame)
  if(signature===entry.signature)return;entry.signature=signature
  drawDeviceLcd(entry.canvas,frame)
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
