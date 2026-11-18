import * as THREE from 'three'

/** Subtrai um cilindro FINITO das superfícies existentes. Não acrescenta discos
 * pretos sobre plástico fechado. A parede/cabo de contacto é uma peça separada.
 * Executa só na construção da geometria, nunca num frame de simulação. */
export function finiteBore(source: THREE.BufferGeometry, axis: 'x'|'y'|'z', centre: [number,number,number], radius: number, min: number, max: number, sides = 24): THREE.BufferGeometry {
  const input = source.index ? source.toNonIndexed() : source.clone()
  if (!input.attributes.normal) input.computeVertexNormals()
  const p=input.attributes.position,n=input.attributes.normal,positions:number[]=[],normals:number[]=[]
  const k={x:0,y:1,z:2}[axis],uv=[0,1,2].filter(i=>i!==k)
  const planes=Array.from({length:sides},(_,i)=>{
    const a=2*Math.PI*i/sides,v=[0,0,0];v[uv[0]]=Math.cos(a);v[uv[1]]=Math.sin(a)
    return [...v,radius-v[0]*centre[0]-v[1]*centre[1]-v[2]*centre[2]]
  })
  const lo=[0,0,0,-min],hi=[0,0,0,max];lo[k]=1;hi[k]=-1;planes.push(lo,hi)
  const clip=(poly:number[][],plane:number[],sign:number)=>{
    const out:number[][]=[],dist=(v:number[])=>sign*(v[0]*plane[0]+v[1]*plane[1]+v[2]*plane[2]+plane[3])
    for(let i=0;i<poly.length;i++){
      const a=poly[i],b=poly[(i+1)%poly.length],da=dist(a),db=dist(b)
      if(da>=-1e-8)out.push(a)
      if(da*db<0)out.push(a.map((x,j)=>x+(b[j]-x)*da/(da-db)))
    }
    return out
  }
  const emit=(poly:number[][])=>{for(let i=1;i<poly.length-1;i++)for(const v of [poly[0],poly[i],poly[i+1]]){positions.push(...v.slice(0,3));normals.push(...v.slice(3))}}
  for(let i=0;i<p.count;i+=3){
    let poly=[0,1,2].map(j=>[p.getX(i+j),p.getY(i+j),p.getZ(i+j),n.getX(i+j),n.getY(i+j),n.getZ(i+j)])
    if(Math.max(...poly.map(v=>v[k]))<min||Math.min(...poly.map(v=>v[k]))>max||uv.some(j=>Math.max(...poly.map(v=>v[j]))<centre[j]-radius||Math.min(...poly.map(v=>v[j]))>centre[j]+radius)){emit(poly);continue}
    for(const plane of planes){emit(clip(poly,plane,-1));poly=clip(poly,plane,1);if(poly.length<3)break}
  }
  input.dispose()
  const result=new THREE.BufferGeometry();result.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));result.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));result.normalizeNormals();return result
}
