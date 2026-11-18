import * as THREE from 'three'

/** Front layout transcribed from 440R-IN079D-EN-P fig.3 and the 440R-N23132
 * product photograph. Coordinates are a documented visual reconstruction,
 * not a manufacturer metrology/CAD claim. */
export const MSR127_LED_LAYOUT=[
 {name:'pwr',state:'powered',xMm:-6.7,yFraction:.63},
 {name:'ch1',state:'channel1On',xMm:-6.7,yFraction:.51},
 {name:'ch2',state:'channel2On',xMm:-6.7,yFraction:.43},
] as const
export function prepareMsr127Leds(root:THREE.Object3D,u:number,anchor:'center'|'bottom',heightMm:number,depthMm:number):void {
 for(const light of MSR127_LED_LAYOUT){
  if(root.getObjectByName('msr127_led_'+light.name))continue
  const mesh=new THREE.Mesh(new THREE.SphereGeometry(1.25*u,16,10),new THREE.MeshStandardMaterial({color:'#21543d',roughness:.28,metalness:.05}))
  mesh.name='msr127_led_'+light.name;mesh.scale.z=.45;mesh.position.set(light.xMm*u,(heightMm*light.yFraction-(anchor==='center'?heightMm/2:0))*u,depthMm*u/2+.08*u)
  mesh.userData.msr127Led=light.state;mesh.raycast=()=>{};root.add(mesh)
 }
}
export function applyMsr127Leds(root:THREE.Object3D,state:Record<string,unknown>):void {
 for(const light of MSR127_LED_LAYOUT){
  const mesh=root.getObjectByName('msr127_led_'+light.name) as THREE.Mesh<THREE.SphereGeometry,THREE.MeshStandardMaterial>|undefined
  if(!mesh)continue
  const on=!!state[light.state];mesh.material.color.set(on?'#36ce6d':'#21543d');mesh.material.emissive.set(on?'#18b856':'#000000');mesh.material.emissiveIntensity=on?1.7:0
 }
}
