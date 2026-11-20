/** MICO Classic 4.6, 9000-41034-0100600. Photo reconstruction in mm.
 * Envelope: installation manual V2.5, W70 H90 D80. Not manufacturer CAD. */
import * as T from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { mat, box, plane, cylinder, shapePlate, drill, terminal, led } from './cad-building.mjs'

export function buildMicoClassic(bodyProfile) {
  const root = new T.Group(), terms = []
  root.name = 'industrial_device_breakerMurrelektronikMico46'
  root.userData.industrialType = 'breakerMurrelektronikMico46'
  root.userData.visualRefinement = { reference: 'MICO Classic 4.6 product photograph and installation manual V2.5', details: '70 × 90 × 80 mm case, inclined spring terminals, duplicated ON, perforated roof, clear keys and protective flap, four sloping lower channel blades and side circuit marking. Reconstructed appearance, not manufacturer STEP.' }
  const bodyMat = mat('#3c3940', 0, .53), edgeMat = mat('#464149', 0, .5), dark = mat('#242228', 0, .7)
  const green = mat('#26a62b', 0, .42), greenDark = mat('#207c25', 0, .5), ink = mat('#bbb59d', 0, .8)
  const print = mat('#ffffff', 0, .8)
  const glass = new T.MeshPhysicalMaterial({ color: '#e1e0e9', roughness: .18, metalness: 0, transparent: true, opacity: .28, transmission: .3, thickness: .8, ior: 1.49, depthWrite: false, side: T.DoubleSide })
  glass.userData.keepTransparent = true
  const rounded = (w,h,d,r,material,name,at) => {
    const mesh = new T.Mesh(new RoundedBoxGeometry(w,h,d,3,r), material)
    mesh.name=name;mesh.position.set(...at);return mesh
  }
  const body = bodyProfile(70, [[0,4],[0,88],[3,90],[53,90],[58,87],[76,60],[76,43],[72,40],[62,8],[65,4],[65,0],[8,0],[8,4]].map(([z,y])=>[-z,y]), bodyMat, 'industrial_mico_body', 1.1)
  root.add(body)
  // Remove the original roof, then replace it with an actually perforated lid.
  const g=body.geometry.index?body.geometry.toNonIndexed():body.geometry, p=g.attributes.position, n=g.attributes.normal, pos=[],norm=[]
  for(let i=0;i<p.count;i+=3){
    if([0,1,2].every(j=>p.getY(i+j)>89.8&&n.getY(i+j)>.9))continue
    for(let j=0;j<3;j++){pos.push(p.getX(i+j),p.getY(i+j),p.getZ(i+j));norm.push(n.getX(i+j),n.getY(i+j),n.getZ(i+j))}
  }
  body.geometry=new T.BufferGeometry();body.geometry.setAttribute('position',new T.Float32BufferAttribute(pos,3));body.geometry.setAttribute('normal',new T.Float32BufferAttribute(norm,3))
  const roof=new T.Shape();roof.moveTo(-32,-23);roof.lineTo(32,-23);roof.lineTo(32,23);roof.lineTo(-32,23);roof.closePath()
  for(let row=0;row<10;row++)for(let col=0;col<8;col++){
    const x=-28+col*8,y=-20+row*4.4,h=new T.Path();h.moveTo(x-2.7,y-1);h.lineTo(x-2.7,y+1);h.lineTo(x+2.7,y+1);h.lineTo(x+2.7,y-1);h.closePath();roof.holes.push(h)
  }
  const roofMesh=new T.Mesh(new T.ExtrudeGeometry(roof,{depth:1.1,bevelEnabled:false}),bodyMat);roofMesh.name='industrial_mico_perforated_roof';roofMesh.rotation.x=-Math.PI/2;roofMesh.position.set(0,88.9,26);root.add(roofMesh)
  root.add(box(62,1,44,dark,'industrial_mico_roof_recess',[0,86.5,26]))
  // Finite rectangular cuts remove the side wall, with a dark floor 2.7 mm inside.
  const cutBox=(lo,hi)=>{
    const old=body.geometry,input=old.index?old.toNonIndexed():old,p=input.attributes.position,n=input.attributes.normal,positions=[],normals=[]
    const planes=[[1,0,0,-lo[0]],[-1,0,0,hi[0]],[0,1,0,-lo[1]],[0,-1,0,hi[1]],[0,0,1,-lo[2]],[0,0,-1,hi[2]]]
    const clip=(poly,plane,sign)=>{const out=[],dist=v=>sign*(v[0]*plane[0]+v[1]*plane[1]+v[2]*plane[2]+plane[3]);for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],da=dist(a),db=dist(b);if(da>=-1e-8)out.push(a);if(da*db<0)out.push(a.map((x,j)=>x+(b[j]-x)*da/(da-db)))}return out}
    const emit=poly=>{for(let i=1;i<poly.length-1;i++)for(const v of [poly[0],poly[i],poly[i+1]]){positions.push(...v.slice(0,3));normals.push(...v.slice(3))}}
    for(let i=0;i<p.count;i+=3){let poly=[0,1,2].map(j=>[p.getX(i+j),p.getY(i+j),p.getZ(i+j),n.getX(i+j),n.getY(i+j),n.getZ(i+j)]);if([0,1,2].some(k=>Math.max(...poly.map(v=>v[k]))<lo[k]||Math.min(...poly.map(v=>v[k]))>hi[k])){emit(poly);continue}for(const plane of planes){emit(clip(poly,plane,-1));poly=clip(poly,plane,1);if(poly.length<3)break}}
    body.geometry=new T.BufferGeometry();body.geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));body.geometry.setAttribute('normal',new T.Float32BufferAttribute(normals,3));old.dispose()
  }
  // Side ventilation follows the rounded roof edge, with actual recessed slots.
  for(const side of [-1,1])for(let i=0;i<10;i++){
    const z=4+i*4.7
    cutBox(side<0?[-36,69,z-.85]:[32,69,z-.85],side<0?[-32,87,z+.85]:[36,87,z+.85])
    root.add(box(.3,18,1.7,dark,'industrial_mico_side_vent_'+side+'_'+i,[side*32.2,78,z]))
    cutBox(side<0?[-36,3.7,z-.85]:[32,3.7,z-.85],side<0?[-32,12.3,z+.85]:[36,12.3,z+.85])
    root.add(box(.3,8.6,1.7,dark,'industrial_mico_low_side_vent_'+side+'_'+i,[side*32.2,8,z]))
  }
  for(const side of [-1,1]){
    root.add(box(.5,28,53,dark,'industrial_mico_inner_vent_baffle_'+side,[side*31.7,75,26.5]))
    root.add(box(.5,20,53,dark,'industrial_mico_lower_vent_baffle_'+side,[side*31.7,10,26.5]))
  }
  root.add(box(58,5,8,dark,'industrial_mico_din_base',[0,3,4]))
  root.add(rounded(12,3,3,.6,edgeMat,'industrial_mico_din_clip',[0,1.5,1.5]))
  // Inclined face: all spring clamps share its true entry axis.
  const deck=new T.Group();deck.name='industrial_mico_inclined_terminal_deck';deck.position.set(0,74,66.5);deck.rotation.x=-Math.atan2(18,27);root.add(deck)
  deck.updateMatrixWorld(true)
  const socket=(parent,label,x,y,z,r,depth,face='top')=>{
    const t=terminal(parent,label,x,y,z,{r,depth,face:'front'})
    parent.updateMatrixWorld(true);t.point=new T.Vector3(x,y,z).applyMatrix4(parent.matrixWorld).toArray()
    t.normal=new T.Vector3(0,0,1).transformDirection(parent.matrixWorld).toArray();t.face=face;terms.push(t)
    // Bore the underlying shell too, so the wire really enters a cavity.
    const m=parent.matrixWorld.clone(),inv=m.clone().invert();body.geometry.applyMatrix4(inv);drill([body],'z',[x,y,z],r,z-depth,z+2);body.geometry.applyMatrix4(m)
  }
  for(const [i,x] of [-22,22].entries()){
    const name='industrial_mico_power_'+(i+1)
    deck.add(shapePlate(14,27,7,[[0,5,4.12],[0,-3,1.25]],green,name,[x,-1,-6]))
    deck.add(box(7,5,1.5,greenDark,name+'_release_recess',[x,-10,1.1]))
    for(const dx of [-3.8,3.8])deck.add(box(1.1,6,2.4,green,name+'_release_wall_'+dx,[x+dx,-10,1.6]))
    deck.add(box(7,1.3,2.4,green,name+'_release_lip',[x,-13,1.6]))
    socket(deck,i?'L+2':'L+',x,4,1,4,10)
    deck.add(plane(10,3.5,print,'industrial_mico_print_24v_'+(i+1),[x,15,2.3]))
  }
  // The ON input is duplicated, above the separate 13/14 signal pair.
  for(const [row,y] of [7.5,-7.5].entries()){
    deck.add(shapePlate(16,12,7,[[-3.7,1.8,1.75],[3.7,1.8,1.75]],green,'industrial_mico_signal_block_'+row,[0,y,-5.6]))
    for(const [col,x] of [-3.7,3.7].entries()){
      const label=row?(col?'14':'13'):(col?'ON2':'ON')
      socket(deck,label,x,y+1.8,1.4,1.65,8)
      deck.add(box(4.3,3.2,.2,dark,'industrial_mico_signal_release_'+label,[x,y-3.2,1.6]))
      for(const dx of [-2.3,2.3])deck.add(box(.8,6,3,green,'industrial_mico_signal_fork_'+label+'_'+dx,[x+dx,y+2.5,2.7]))
    }
  }
  for(const x of [-11.8,11.8])for(let i=0;i<8;i++)deck.add(rounded(5.8,1.7,2,.35,edgeMat,'industrial_mico_deck_rib_'+x+'_'+i,[x,-14+i*4.1,2.1]))
  deck.add(plane(6,30,print,'industrial_mico_signal_labels',[-10,0,3.3]))
  // Band below the sloping terminal field: old MURR ELEKTRONIK mark and fine legend.
  root.add(plane(22,10,print,'industrial_mico_logo',[-22,55,76.06]))
  root.add(plane(26,10,print,'industrial_mico_legend',[20,55,76.06]))
  root.add(box(18,5,2,dark,'industrial_mico_bridge_slot',[-3,54,76.2]))
  root.add(box(12,1,1,edgeMat,'industrial_mico_bridge_slot_floor',[-3,51.8,77]))
  const chX=[-22,-7.33,7.33,22]
  for(let i=0;i<4;i++){
    const ch=String(i+1),x=chX[i]
    root.add(rounded(10.3,9.7,1.1,.5,dark,'industrial_mico_key_recess_'+ch,[x,46.7,76.25]))
    const btn=new T.Group();btn.name='industrial_mico_button_'+ch;btn.position.set(x,46.7,77.3);root.add(btn)
    const cap=rounded(8.7,8.5,2.1,.8,glass,'industrial_mico_button_cap_'+ch,[0,0,0]);cap.userData.keepTransparent=true;btn.add(cap)
    for(let j=0;j<11;j++)btn.add(box(6.8,.12,.1,ink,'industrial_mico_button_hatch_'+ch+'_'+j,[0,-3.4+j*.63,1.09]))
    led(root,x,46.7,77.05,'#514c51','industrial_mico_led_'+ch,2.35)
    const sel=new T.Group();sel.name='industrial_mico_select_'+ch;sel.position.set(x,35.8,77.3);root.add(sel)
    sel.add(cylinder(3.5,.3,green,'industrial_mico_select_body_'+ch))
    const a=new T.Shape();a.moveTo(0,2.5);a.lineTo(1.8,.5);a.lineTo(.65,.5);a.lineTo(.65,-2.1);a.lineTo(-.65,-2.1);a.lineTo(-.65,.5);a.lineTo(-1.8,.5);a.closePath()
    const arrow=new T.Mesh(new T.ExtrudeGeometry(a,{depth:.15,bevelEnabled:false}),greenDark);arrow.name='industrial_mico_select_arrow_'+ch;arrow.position.z=.18;sel.add(arrow)
  }
  // Clear protective flap, separate from the four clear operating keys.
  const guard=rounded(65,15.6,.7,.3,glass,'industrial_mico_guard_panel',[0,35.5,79.5]);guard.userData.keepTransparent=true;root.add(guard)
  for(const y of [27.7,43.3])root.add(rounded(65,.65,.9,.25,glass,'industrial_mico_guard_edge_'+y,[0,y,79.35]))
  for(const x of [-32.5,32.5]){
    root.add(rounded(.7,15.6,3,.3,glass,'industrial_mico_guard_cheek_'+x,[x,35.5,78.1]))
    root.add(cylinder(1.25,2.4,glass,'industrial_mico_guard_hinge_'+x,[x,43.4,78.3],'x'))
  }
  root.add(plane(61,4,print,'industrial_mico_guard_numbers',[0,29.8,79.9]))
  // Four broad sloping channel blades; narrow gaps and separate side fixings.
  for(let i=0;i<4;i++){
    const blade=rounded(11.7,27,2.6,.7,bodyMat,'industrial_mico_channel_blade_'+(i+1),[chX[i],18.5,71.3]);blade.rotation.x=.36;root.add(blade)
    const notch=box(3.7,5,.5,dark,'industrial_mico_channel_notch_'+i,[chX[i]+3.4,17,73.4]);notch.rotation.x=.36;root.add(notch)
  }
  for(const x of [-30,-14.7,0,14.7,30]){
    const rib=rounded(1.6,28,4,.5,edgeMat,'industrial_mico_channel_separator_'+x,[x,18.5,71.2]);rib.rotation.x=.36;root.add(rib)
  }
  for(const x of [-31,31]){
    root.add(cylinder(2.1,1.5,edgeMat,'industrial_mico_front_fixing_'+x,[x,26.8,77]))
    root.add(cylinder(1.05,.3,dark,'industrial_mico_front_fixing_hole_'+x,[x,26.8,77.85]))
  }
  // Lower six clamps, under the recessed output step, facing down and forward.
  const lower=new T.Group();lower.name='industrial_mico_output_deck';lower.position.set(0,4.4,63);lower.rotation.x=.94;root.add(lower)
  const labels=['GND','OUT1','OUT2','OUT3','OUT4','GND2']
  for(let i=0;i<6;i++){
    const x=-28+i*11.2,label=labels[i]
    lower.add(shapePlate(10.2,8,5,[[0,1.4,2.2]],green,'industrial_mico_output_block_'+label,[x,0,-3]))
    lower.add(box(4.6,2,.35,greenDark,'industrial_mico_output_release_'+label,[x,-2.5,2.2]))
    socket(lower,label,x,1.4,2,2.1,7,'bottom')
  }
  // Side marking is a reconstruction of the model reference and circuit, no serial/certification facsimile.
  const side=plane(49,49,print,'industrial_mico_side_label',[35,44,29]);side.rotation.y=Math.PI/2;root.add(side)
  // Serigrafia na estreita face da carcaça à direita das lâminas, coplanar
  // com a rampa real. O plano anterior ficava ~10 mm à frente do plástico.
  body.updateWorldMatrix(true,false)
  const seat=new T.Raycaster(new T.Vector3(32.75,15,85),new T.Vector3(0,0,-1)).intersectObject(body,false)[0]
  if(!seat?.face)throw new Error('MICO: carcaça ausente sob a marcação GND 0V')
  const normal=seat.face.normal.clone().normalize(),at=seat.point.clone().addScaledVector(normal,.035)
  const gnd=plane(4.4,3,print,'industrial_mico_print_gnd',at.toArray())
  gnd.quaternion.setFromUnitVectors(new T.Vector3(0,0,1),normal)
  body.add(gnd)
  return {root,terms}
}
