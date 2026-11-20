/** MICO 2.4 9000-41042-0100400. Photo reconstruction, W36 H90 D80 mm.
 * Separate narrow housing and terminal layout; not a scaled MICO 4.6. */
import * as T from 'three'
import {RoundedBoxGeometry} from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import {mat,box,plane,cylinder,shapePlate,drill,cutBox,terminal,led} from './cad-building.mjs'

export function buildMico24(bodyProfile){
 const root=new T.Group(),terms=[]
 root.name='industrial_device_breakerMurrelektronikMico24';root.userData.industrialType='breakerMurrelektronikMico24'
 root.userData.visualRefinement={reference:'User photograph and Murrelektronik product sheet 9000-41042-0100400',details:'Narrow 36 mm case, one large input clamp, four signal entries, one GND and two duplicated output pairs. Two clear keys, current selectors and lower blades, separate transparent guard, recessed vents and housing-bound marking. Reconstructed appearance, not manufacturer CAD.'}
 const bodyMat=mat('#35343a',0,.55),edge=mat('#454149',0,.52),dark=mat('#222127',0,.7),green=mat('#4c8962',0,.47),greenDark=mat('#31583c',0,.6),ink=mat('#bcb6a1',0,.8),print=mat('#ffffff',0,.8)
 const clear=new T.MeshPhysicalMaterial({color:'#e1e0e9',transparent:true,opacity:.23,roughness:.18,transmission:.3,thickness:.7,ior:1.49,depthWrite:false,side:T.DoubleSide});clear.userData.keepTransparent=true
 const rounded=(w,h,d,r,material,name,at)=>{const m=new T.Mesh(new RoundedBoxGeometry(w,h,d,3,r),material);m.name=name;m.position.set(...at);return m}
 const body=bodyProfile(36,[[0,4],[0,88],[3,90],[51,90],[57,87],[75,69],[75,53],[72,51],[72,37],[66,17],[63,12],[63,4],[9,4],[9,0],[4,0],[4,4]].map(([z,y])=>[-z,y]),bodyMat,'industrial_mico_body',1.2);root.add(body)
 // Real roof openings and recessed side ventilation; no raised painted strips.
 cutBox(body,[-15.5,88.7,3],[15.5,91,49])
 const roof=new T.Shape();roof.moveTo(-15.5,-23);roof.lineTo(15.5,-23);roof.lineTo(15.5,23);roof.lineTo(-15.5,23);roof.closePath()
 for(let row=0;row<10;row++)for(let col=0;col<4;col++){
  const x=-11.7+col*7.8,y=-20+row*4.4,p=new T.Path();p.moveTo(x-2.6,y-1);p.lineTo(x-2.6,y+1);p.lineTo(x+2.6,y+1);p.lineTo(x+2.6,y-1);p.closePath();roof.holes.push(p)
 }
 const top=new T.Mesh(new T.ExtrudeGeometry(roof,{depth:1,bevelEnabled:false}),bodyMat);top.name='industrial_mico_perforated_roof';top.rotation.x=-Math.PI/2;top.position.set(0,89,26);root.add(top)
 root.add(box(30,1,46,dark,'industrial_mico_roof_recess',[0,87.6,26]))
 for(const side of [-1,1]){
  for(let i=0;i<10;i++){
   const z=4+i*4.65,loX=side<0?-19:15,hiX=side<0?-15:19
   cutBox(body,[loX,70,z-.75],[hiX,87,z+.75]);cutBox(body,[loX,6,z-.75],[hiX,22,z+.75])
  }
  root.add(box(.4,27,53,dark,'industrial_mico_vent_baffle_'+side,[side*14.8,75,26.5]))
  root.add(box(.4,22,53,dark,'industrial_mico_low_baffle_'+side,[side*14.8,13,26.5]))
 }
 // Left edge includes the ledges around the key window and lower connectors.
 body.updateWorldMatrix(true,false)
 for(const [i,y] of [65,52.5,38,32,18,13].entries()){
  const seat=new T.Raycaster(new T.Vector3(-16.2,y,90),new T.Vector3(0,0,-1)).intersectObject(body,false)[0]
  if(!seat)throw new Error('MICO 2.4: missing housing under ledge '+i)
  root.add(rounded(3.2,2.1,3.3,.5,edge,'industrial_mico_left_ledge_'+i,[-16.2,y,seat.point.z+.65]))
 }
 root.add(rounded(31,3.5,13,.7,dark,'industrial_mico_din_foot',[0,1.75,24]))
 root.add(box(8,2.5,3,green,'industrial_mico_din_latch',[0,2,3]))
 // All entries are drilled through both the clamp and the underlying case.
 const socket=(parent,label,x,y,z,r,depth,face)=>{
  const t=terminal(parent,label,x,y,z,{r,depth,face:'front'});parent.updateWorldMatrix(true,true)
  t.point=new T.Vector3(x,y,z).applyMatrix4(parent.matrixWorld).toArray();t.normal=new T.Vector3(0,0,1).transformDirection(parent.matrixWorld).toArray();t.face=face;terms.push(t)
  const m=parent.matrixWorld.clone();body.geometry.applyMatrix4(m.clone().invert());drill([body],'z',[x,y,z],r,z-depth,z+2);body.geometry.applyMatrix4(m)
 }
 const deck=new T.Group();deck.name='industrial_mico_input_deck';deck.position.set(0,79,65);deck.rotation.x=-Math.atan2(18,22);root.add(deck)
 deck.add(shapePlate(12.5,21,7,[[0,4,3.75],[0,-2.7,1.1]],green,'industrial_mico_input_block',[-8.5,-1,-6]))
 deck.add(box(6,4.3,.5,greenDark,'industrial_mico_input_release',[-8.5,-8.4,1.15]))
 for(const x of [-12,-5])deck.add(box(1,5.2,2,green,'industrial_mico_input_release_wall_'+x,[x,-8.4,1.6]))
 deck.add(box(7.7,1,2,green,'industrial_mico_input_release_lip',[-8.5,-11,1.6]))
 socket(deck,'L+',-8.5,3,1,3.65,10,'top')
 deck.add(box(13,3.5,.8,edge,'industrial_mico_input_top_frame',[-8.5,11,0]))
 deck.add(plane(10,2.8,print,'industrial_mico_print_24v_1',[-8.5,11,.43]))
 for(const [row,y]of [5.5,-4.8].entries()){
  deck.add(shapePlate(13.5,9.4,7,[[-3.1,1.1,1.6],[3.1,1.1,1.6]],green,'industrial_mico_signals_'+row,[7,y,-5.8]))
  for(const [col,x]of [3.9,10.1].entries()){
   const label=row?(col?'14':'13'):(col?'ON2':'ON')
   socket(deck,label,x,y+1.1,1.2,1.5,7,'top')
   deck.add(box(3.9,2.5,.25,greenDark,'industrial_mico_signal_release_'+label,[x,y-2.5,1.4]))
   for(const dx of [-2.1,2.1])deck.add(box(.7,5.3,2.3,green,'industrial_mico_signal_fork_'+label+'_'+dx,[x+dx,y+1.5,2.2]))
  }
 }
 for(const xof of [-.8,15.4])for(let i=0;i<7;i++)deck.add(rounded(2.4,1.5,2,.35,edge,'industrial_mico_deck_rib_'+xof+'_'+i,[xof,-10+i*3.5,2]))
 deck.add(box(14,3.5,.8,edge,'industrial_mico_signal_top_frame',[7,11,0]))
 deck.add(plane(8,2.8,print,'industrial_mico_signal_labels',[6,11,.43]))
 // The compact Classic has the silver emblem at the left, not the wide green mark.
 root.add(plane(7,6,print,'industrial_mico_logo',[-12.7,66.9,75.08]))
 root.add(box(20,5.7,1,dark,'industrial_mico_bridge_slot',[3.5,66.5,75.35]))
 root.add(box(13,1,1,edge,'industrial_mico_bridge_slot_lip',[3.5,63.9,76]))
 const xs=[-6.2,7]
 for(let i=0;i<2;i++){
  const ch=i+1,x=xs[i]
  root.add(rounded(10,10,1,.6,dark,'industrial_mico_key_recess_'+ch,[x,59.3,75.3]))
  const btn=new T.Group();btn.name='industrial_mico_button_'+ch;btn.position.set(x,59.3,76.5);root.add(btn)
  const cap=rounded(8.7,8.4,2.3,.8,clear,'industrial_mico_button_cap_'+ch,[0,0,0]);btn.add(cap)
  for(let j=0;j<12;j++)btn.add(box(7.1,.1,.1,ink,'industrial_mico_key_hatch_'+ch+'_'+j,[0,-3.35+j*.61,1.2]))
  led(root,x,59.3,76.25,'#514c51','industrial_mico_led_'+ch,2.1)
  const sel=new T.Group();sel.name='industrial_mico_select_'+ch;sel.position.set(x,46.4,77);root.add(sel)
  sel.add(cylinder(2.85,.35,green,'industrial_mico_select_body_'+ch))
  const a=new T.Shape();a.moveTo(0,2.3);a.lineTo(1.6,.4);a.lineTo(.6,.4);a.lineTo(.6,-2);a.lineTo(-.6,-2);a.lineTo(-.6,.4);a.lineTo(-1.6,.4);a.closePath()
  const arrow=new T.Mesh(new T.ExtrudeGeometry(a,{depth:.15,bevelEnabled:false}),greenDark);arrow.name='industrial_mico_select_arrow_'+ch;arrow.position.z=.2;sel.add(arrow)
  root.add(plane(10.4,10.4,print,'industrial_mico_scale_'+ch,[x,46.4,76.88]))
  const blade=rounded(10.5,24,2.9,.65,bodyMat,'industrial_mico_channel_blade_'+ch,[x,28,70.5]);blade.rotation.x=.29;root.add(blade)
  for(const [j,y]of [25,32].entries()){
   const notch=box(2.5,5,.5,dark,'industrial_mico_channel_notch_'+ch+'_'+j,[x+3,y,72.3+(y-28)*Math.sin(.29)]);notch.rotation.x=.29;root.add(notch)
  }
 }
 const guard=rounded(31.6,14,.7,.25,clear,'industrial_mico_guard_panel',[-.4,46.3,79.5]);root.add(guard)
 for(const y of [39.3,53.3])root.add(rounded(31.6,.65,.9,.25,clear,'industrial_mico_guard_edge_'+y,[-.4,y,79.35]))
 for(const x of [-16.2,15.4]){
  root.add(rounded(.7,16,3.3,.3,clear,'industrial_mico_guard_cheek_'+x,[x,45.3,78.15]))
  root.add(cylinder(1.15,2,clear,'industrial_mico_guard_hinge_'+x,[x,52.8,78.15],'x'))
  root.add(cylinder(1.7,1.3,edge,'industrial_mico_front_fixing_'+x,[x,37.6,75]))
 }
 root.add(plane(28,2.4,print,'industrial_mico_guard_numbers',[-.4,40.9,79.9]))
 for(const x of [-12.7,.4,13.7]){
  const rib=rounded(1.5,25,3,.5,edge,'industrial_mico_blade_separator_'+x,[x,28,70.3]);rib.rotation.x=.29;root.add(rib)
 }
 // Label ledge closes the lower blades; GND and Class 2 are printed on plastic.
 const lip=rounded(32,6.8,2.1,.65,edge,'industrial_mico_lower_label_ledge',[-.6,15.5,67.4]);lip.rotation.x=.29;root.add(lip)
 const gnd=plane(5.7,4,print,'industrial_mico_print_gnd',[-13.2,15.5,68.51]);gnd.rotation.x=.29;root.add(gnd)
 const warning=plane(23,5.3,print,'industrial_mico_class2',[3.1,15.5,68.51]);warning.rotation.x=.29;root.add(warning)
 // Lower 0V block and two separate duplicated output banks.
 const lower=new T.Group();lower.name='industrial_mico_output_deck';lower.position.set(0,7.1,63.2);lower.rotation.x=.55;root.add(lower)
 lower.add(shapePlate(10,11,5,[[0,2.3,2.6]],green,'industrial_mico_gnd_block',[-11.2,0,-3]))
 lower.add(box(4.5,2.6,.4,greenDark,'industrial_mico_gnd_release',[-11.2,-2.5,2.25]))
 socket(lower,'GND',-11.2,2.3,2,2.5,7,'bottom')
 for(let i=0;i<2;i++){
  const x=1.2+i*9.1,label='OUT'+(i+1)
  lower.add(shapePlate(8.2,11,5,[[0,2.8,1.7],[0,-2.5,1.7]],green,'industrial_mico_output_bank_'+(i+1),[x,0,-3]))
  socket(lower,label,x,2.8,2,1.6,7,'bottom');socket(lower,label+'-2',x,-2.5,2,1.6,7,'bottom')
 }
 // Side printing avoids fictional serials or certification logos.
 const side=plane(48,48,print,'industrial_mico_side_label',[18,47,28]);side.rotation.y=Math.PI/2;root.add(side)
 return{root,terms}
}
