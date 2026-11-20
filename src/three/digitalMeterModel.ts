import { bindCachedCanvasTexture } from './canvasTextureCache'
import * as THREE from 'three'
import { getComponentPhysicalSizeMm, PANEL_UNITS_PER_MM as U, type ComponentModelSpec } from './modelPaths'
import { fitComponentModel, disposeModelClone } from './modelFit'
import { finiteBore } from './finiteBore'
import { buildCaptiveTerminalScrew } from './terminalHardware'
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
  const bore=(body:THREE.Mesh,label:string,point:[number,number,number],axis:'x'|'y'|'z',normal:[number,number,number],radius:number,depth:number,through=false,wallColor='#33372f')=>{
    const k={x:0,y:1,z:2}[axis],v=point[k],dir=normal[k],old=body.geometry
    body.geometry=finiteBore(old,axis,point,radius,through?-100:Math.min(v,v-dir*depth)-.01,through?100:Math.max(v,v-dir*depth)+.01);old.dispose()
    const group=new THREE.Group();group.name='digital_meter_connection_'+label;group.position.set(...point)
    group.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),new THREE.Vector3(...normal))
    const wallG=new THREE.CylinderGeometry(radius-.02,radius-.02,depth,24,1,true);wallG.rotateX(Math.PI/2);wallG.translate(0,0,-depth/2)
    const wallM=material(wallColor);wallM.side=THREE.DoubleSide
    const wall=new THREE.Mesh(wallG,wallM);wall.name='cavity_'+label;group.add(wall)
    if(!through){const g=new THREE.CylinderGeometry(radius*.65,radius*.65,.6,24);g.rotateX(Math.PI/2);const screw=new THREE.Mesh(g,steel);screw.position.z=-depth+.4;screw.name='contact_'+label;group.add(screw)}
    root.add(group)
  }
  const marking=(text:string,x:number,y:number,z:number,w:number,h:number,name:string)=>{
    const tex=cachedCanvasTexture(`meter:ink:${text}`,512,128,(ctx,pw,ph)=>{ctx.fillStyle='#343b3b';ctx.font='600 64px Arial, sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,pw/2,ph/2,pw-10)})
    if(tex){const mat=new THREE.MeshBasicMaterial({map:tex,transparent:true,polygonOffset:true,polygonOffsetFactor:-2});bindCachedCanvasTexture(mat,tex);const n=plane(w,h,mat,name,[x,y,z]);n.raycast=()=>{}}
  }
  /** Serigrafia sem deformação: o plano segue a proporção do texto; `capMm` = altura das maiúsculas. */
  const silk=(text:string,x:number,y:number,z:number,capMm:number,name:string,ink:{italic?:boolean;weight?:number;color?:string}={})=>{
    const font=`${ink.italic?'italic ':''}${ink.weight??600} 72px Arial, sans-serif`,color=ink.color??'#3a4040'
    const cw=Math.max(64,Math.ceil((text.length*44+24)/32)*32),ch=96
    const tex=cachedCanvasTexture(`meter:silk:${font}:${color}:${text}`,cw,ch,(ctx,pw,ph)=>{ctx.fillStyle=color;ctx.font=font;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,pw/2,ph/2+2,pw-8)})
    if(!tex)return
    const mat=new THREE.MeshBasicMaterial({map:tex,transparent:true,polygonOffset:true,polygonOffsetFactor:-2});bindCachedCanvasTexture(mat,tex)
    const h=capMm*ch/52,n=plane(h*cw/ch,h,mat,name,[x,y,z]);n.raycast=()=>{}
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
    // D52-2066 / YD52-2066 (TC externo): 3 módulos DIN, 54 × 80 × 64 mm.
    // Fotografias de referência: degraus dos bornes a 50 mm, capuz frontal 22–66 mm
    // com moldura arredondada, janela LCD com aro preto e vidro, RESET azul à direita.
    // Bornes: 1/2 (tensão) em baixo, 3/4 (secundário do TC) em cima — parafusos de
    // latão em gaiola, entrada do cabo junto à aresta (fenda em U) e chave pela frente.
    const shell=material('#e7e9e4'),bezelM=material('#f0f1ed'),brass=new THREE.MeshStandardMaterial({color:'#c9a85c',metalness:.85,roughness:.32})
    shell.roughness=.62;bezelM.roughness=.5
    const SH=50 // face dos degraus (bornes), medida a partir da parede traseira
    const body=profileBody(54,[[0,0],[SH,0],[SH,22],[62,22],[62,66],[SH,66],[SH,80],[0,80],[0,57.5],[7.5,57.5],[7.5,22.5],[0,22.5]],[],shell);body.name='digital_meter_body';root.add(body)
    // Moldura frontal (tampa do visor) com arestas boleadas.
    const bezelShape=new THREE.Shape(),bw=53.2,bh=43.4,br=1.6
    bezelShape.moveTo(-bw/2+br,-bh/2);bezelShape.lineTo(bw/2-br,-bh/2);bezelShape.quadraticCurveTo(bw/2,-bh/2,bw/2,-bh/2+br);bezelShape.lineTo(bw/2,bh/2-br);bezelShape.quadraticCurveTo(bw/2,bh/2,bw/2-br,bh/2)
    bezelShape.lineTo(-bw/2+br,bh/2);bezelShape.quadraticCurveTo(-bw/2,bh/2,-bw/2,bh/2-br);bezelShape.lineTo(-bw/2,-bh/2+br);bezelShape.quadraticCurveTo(-bw/2,-bh/2,-bw/2+br,-bh/2)
    mesh(new THREE.ExtrudeGeometry(bezelShape,{depth:1.4,bevelEnabled:true,bevelThickness:.6,bevelSize:.6,bevelSegments:3,curveSegments:8}),bezelM,'digital_meter_frame',[0,44,62])
    // Janela: aro preto do LCD, ecrã ativo e vidro com reflexo (sem apanhar cliques).
    const WX=-2,WY=44.6
    box(44,36.6,.3,material('#15181a'),'digital_meter_lcd_recess',[WX,WY,64.05])
    plane(41.6,34.2,new THREE.MeshBasicMaterial({color:'#090c0b'}),'digital_meter_lcd',[WX,WY,64.22])
    /* Vidro do visor. Sem `keepTransparent`, o `applyRenderMode` do painel trata qualquer
     * `MeshStandardMaterial` como superfície física e força `opacity = 1` / `transparent =
     * false`: o vidro ficava uma placa branca opaca sobre o ecrã e lia-se «LCD branco». */
    const glassMaterial=new THREE.MeshStandardMaterial({color:'#ffffff',transparent:true,opacity:.1,roughness:.06,metalness:.1,depthWrite:false})
    glassMaterial.userData.keepTransparent=true
    const glass=plane(44,36.6,glassMaterial,'digital_meter_glass',[WX,WY,64.32])
    glass.raycast=()=>{};glass.userData.protectionMarking=false
    button(22.7,46,64.2,1.95,'digital_meter_reset',blue)
    // Janelas das patilhas e junta base/tampa nas duas laterais.
    const shade=material('#b9bcb5'),seam=material('#cbcec7')
    for(const sx of [-1,1]){
      for(const y of [18,62])box(.3,4.2,2.2,shade,'digital_meter_latch_window',[sx*27.02,y,21])
      box(.06,79.4,.22,seam,'digital_meter_mold_seam',[sx*27.03,40,16.5])
    }
    const terminal=(label:string,x:number,top:boolean)=>{
      const yWell=top?73:7,yFace=top?80:0,n=top?1:-1
      // Entrada do cabo atrás da cabeça do parafuso (gaiola), poço da chave pela frente.
      bore(body,label,[x,yFace,44],'y',[0,n,0],2.3,10,false,'#7d8079')
      bore(body,'screwdriver_'+label,[x,yWell,SH],'z',[0,0,1],2.9,6.2,false,'#a3a69f')
      const screw=buildCaptiveTerminalScrew('d52_'+label,2.18)
      screw.traverse(o=>{const m=o as THREE.Mesh;if(m.isMesh&&o.name.startsWith('terminal_screw_head_')){(m.material as THREE.Material).dispose();m.material=brass}})
      screw.position.set(x,yWell,SH-2.6);root.add(screw)
      const shank=new THREE.CylinderGeometry(1.05,1.05,6,20);shank.rotateX(Math.PI/2)
      mesh(shank,brass,'digital_meter_screw_shank_'+label,[x,yWell,SH-6.2])
      box(5,5.4,3.2,brass,'digital_meter_clamp_'+label,[x,yWell,43.6])
    }
    // Posições pela vista frontal das fotos: 3/4 junto ao centro, 1/2 desviados à direita.
    for(const[label,x]of [['3',-1],['4',7]] as const)terminal(label,x,true)
    for(const[label,x]of [['1',3],['2',11]] as const){terminal(label,x,false);silk(label,x,13.6,SH+.025,1.8,'digital_meter_voltage_terminals',{weight:700})}
    silk('D52-2066',-17,64.35,64.08,1.75,'digital_meter_type',{italic:true,weight:800})
    silk('Multi-Function Digital Meter',1.5,24.2,64.08,1.35,'digital_meter_legend',{italic:true,weight:700})
    silk('RESET',22.7,43.2,64.08,.75,'digital_meter_reset_label',{weight:700})
    for(const y of [18,61]){box(11,2,2,shell,'digital_meter_din_clip_bar',[0,y,1]);for(const x of [-4,4])box(1.4,6,1.8,shell,'digital_meter_din_clip_arm',[x,y+2,1])}
  }else{
    /* KWS-306 trifásico (4 módulos DIN, 74 × 86,5 × 65 mm). Mesmo acabamento do D52:
     * corpo marfim com degraus de borne, tampa frontal boleada, vidro sobre o LCD e
     * parafusos de latão captivos em gaiola. Cotas da vista frontal do produto:
     * degraus dos bornes a 43 mm, tampa 43…65 mm, janela preta do LCD e coluna de
     * quatro teclas à direita. Serigrafia A/B/C/N junto aos bornes e seta de sentido
     * de corrente, como no aparelho real. */
    const SH=43 // face dos degraus (bornes), medida a partir da parede traseira
    const shell=material('#e7e9e4'),bezelM=material('#f0f1ed'),brass=new THREE.MeshStandardMaterial({color:'#c9a85c',metalness:.85,roughness:.32})
    shell.roughness=.62;bezelM.roughness=.5
    const body=profileBody(74,[[0,0],[SH,0],[SH,25],[65,25],[65,61.5],[SH,61.5],[SH,86.5],[0,86.5],[0,61],[7.5,61],[7.5,25],[0,25]],[],shell);body.name='digital_meter_body';root.add(body)
    // Tampa frontal com arestas boleadas, igual à do D52.
    const bezelShape=new THREE.Shape(),bw=71,bh=33,br=1.8
    bezelShape.moveTo(-bw/2+br,-bh/2);bezelShape.lineTo(bw/2-br,-bh/2);bezelShape.quadraticCurveTo(bw/2,-bh/2,bw/2,-bh/2+br);bezelShape.lineTo(bw/2,bh/2-br);bezelShape.quadraticCurveTo(bw/2,bh/2,bw/2-br,bh/2)
    bezelShape.lineTo(-bw/2+br,bh/2);bezelShape.quadraticCurveTo(-bw/2,bh/2,-bw/2,bh/2-br);bezelShape.lineTo(-bw/2,-bh/2+br)
    bezelShape.quadraticCurveTo(-bw/2,-bh/2,-bw/2+br,-bh/2)
    mesh(new THREE.ExtrudeGeometry(bezelShape,{depth:1.4,bevelEnabled:true,bevelThickness:.6,bevelSize:.6,bevelSegments:3,curveSegments:8}),bezelM,'digital_meter_frame',[0,43.25,63.0])
    // Janela do LCD: aro preto + ecrã + vidro (o vidro mantém-se transparente no painel).
    const WY=43.25
    box(70,31,.3,material('#15181a'),'digital_meter_lcd_recess',[0,WY,65.05])
    plane(58,29.2,new THREE.MeshBasicMaterial({color:'#090c0b'}),'digital_meter_lcd',[-5,WY,65.22])
    const glassMaterial=new THREE.MeshStandardMaterial({color:'#ffffff',transparent:true,opacity:.1,roughness:.06,metalness:.1,depthWrite:false})
    glassMaterial.userData.keepTransparent=true
    const glass=plane(58,29.2,glassMaterial,'digital_meter_glass',[-5,WY,65.32])
    glass.raycast=()=>{};glass.userData.protectionMarking=false
    // Junta base/tampa e janelas das patilhas DIN nas laterais.
    const shade=material('#b9bcb5'),seam=material('#cbcec7')
    for(const sx of [-1,1]){
      for(const y of [22,64])box(.3,4.2,2.2,shade,'digital_meter_latch_window',[sx*37.02,y,21])
      box(.06,85.4,.22,seam,'digital_meter_mold_seam',[sx*37.03,43,16.5])
    }
    /* Teclas: coluna de quatro pastilhas à direita da janela, como no produto. A de baixo
     * é ON/OFF (texto serigrafado ao lado); as restantes são M, + e −. */
    /* Quatro pastilhas separadas (não uma barra contínua), como no produto. */
    const KEY_X=29.5
    const keys=[['digital_meter_menu',KEY_X,54],['digital_meter_menu_1',KEY_X,49],['digital_meter_menu_2',KEY_X,44],['digital_meter_switch',KEY_X,39]] as const
    for(const [name,kx,ky] of keys){
      box(4.2,4.2,1.2,white,name,[kx,ky,65.3])
      if(name==='digital_meter_switch')continue
      silk(name==='digital_meter_menu'?'M':name==='digital_meter_menu_1'?'+':'−',kx,ky,65.92,1.7,'digital_meter_button_ink_'+name,{weight:800})
    }
    silk('ON/OFF',KEY_X,35.4,65.9,.75,'digital_meter_switch_label',{weight:700,color:'#c8cdc9'})
    const terminal=(label:string,x:number,top:boolean)=>{
      const yWell=top?77:9,yFace=top?86.5:0,n=top?1:-1
      // Entrada do cabo atrás da cabeça do parafuso (gaiola), poço da chave pela frente.
      bore(body,label,[x,yFace,37],'y',[0,n,0],2.6,11,false,'#7d8079')
      bore(body,'screwdriver_'+label,[x,yWell,SH],'z',[0,0,1],3.1,6.6,false,'#a3a69f')
      const screw=buildCaptiveTerminalScrew('kws_'+label,2.36)
      screw.traverse(o=>{const m=o as THREE.Mesh;if(m.isMesh&&o.name.startsWith('terminal_screw_head_')){(m.material as THREE.Material).dispose();m.material=brass}})
      screw.position.set(x,yWell,SH-2.7);root.add(screw)
      const shank=new THREE.CylinderGeometry(1.15,1.15,6.4,20);shank.rotateX(Math.PI/2)
      mesh(shank,brass,'digital_meter_screw_shank_'+label,[x,yWell,SH-6.4])
      box(5.6,6,3.4,brass,'digital_meter_clamp_'+label,[x,yWell,36.6])
    }
    /* Serigrafia de fábrica: A B C N nos degraus de cima e de baixo e a seta de
     * sentido da corrente entre os dois bornes do meio. */
    const PHASES=['A','B','C','N'] as const
    for(const [i,x] of [-27,-9,9,27].entries()){
      terminal(PHASES[i]+'-IN',x,true)
      terminal(PHASES[i]+'-OUT',x,false)
      // Nos degraus de borne: em cima y 61,5…86,5 e em baixo y 0…25 (não é Z!).
      silk(PHASES[i],x,68.5,SH+.03,2.6,'digital_meter_input_marking_'+PHASES[i],{weight:800,color:'#2f3534'})
      silk(PHASES[i],x,17.5,SH+.03,2.6,'digital_meter_output_marking_'+PHASES[i],{weight:800,color:'#2f3534'})
    }
    silk('↓',0,68.5,SH+.03,3.4,'digital_meter_flow_arrow_top',{weight:800,color:'#2f3534'})
    silk('↓',0,17.5,SH+.03,3.4,'digital_meter_flow_arrow_bottom',{weight:800,color:'#2f3534'})
    silk('KWS-306',-26.5,28.6,65.26,1.45,'digital_meter_type',{italic:true,weight:800,color:'#d7dbd6'})
    for(const y of [22,60]){box(16,2,2,shell,'digital_meter_din_clip_bar',[0,y,1]);for(const x of [-6,6])box(1.4,6,1.8,shell,'digital_meter_din_clip_arm',[x,y+2,1])}
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
