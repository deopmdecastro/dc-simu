import * as THREE from 'three'
const LIMIT=96,cache=new Map<string,THREE.CanvasTexture>(),cached=new WeakSet<THREE.Texture>(),users=new WeakMap<THREE.Texture,number>(),bindings=new WeakMap<THREE.Material,{texture:THREE.Texture;release:()=>void}>()
function trim():void {
 if(cache.size<=LIMIT)return
 for(const [key,texture]of cache){if(cache.size<=LIMIT)break;if((users.get(texture)??0)>0)continue;cache.delete(key);texture.dispose()}
}
/** A live decal is never evicted/disposed to make room for another component.
 * LIMIT bounds the cold cache; a scene may legitimately need more live textures. */
export function bindCachedCanvasTexture(material:THREE.Material,texture:THREE.Texture|null|undefined):void {
 const previous=bindings.get(material);if(previous?.texture===texture)return
 previous?.release();if(!texture||!cached.has(texture))return
 users.set(texture,(users.get(texture)??0)+1)
 let released=false
 const release=()=>{if(released)return;released=true;material.removeEventListener('dispose',release);bindings.delete(material);users.set(texture,Math.max(0,(users.get(texture)??1)-1));trim()}
 bindings.set(material,{texture,release});material.addEventListener('dispose',release)
}
export function cachedCanvasTexture(key:string,widthPx:number,heightPx:number,draw:(ctx:CanvasRenderingContext2D,w:number,h:number)=>void):THREE.CanvasTexture|null {
 if(typeof document==='undefined')return null
 key='vector-artwork-v1:'+key
 const hit=cache.get(key);if(hit){cache.delete(key);cache.set(key,hit);return hit}
 const canvas=document.createElement('canvas');canvas.width=widthPx;canvas.height=heightPx;const ctx=canvas.getContext('2d');if(!ctx)return null
 ctx.clearRect(0,0,widthPx,heightPx);draw(ctx,widthPx,heightPx)
 const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=8;texture.minFilter=THREE.LinearMipmapLinearFilter;texture.magFilter=THREE.LinearFilter;texture.needsUpdate=true
 // Trim before insertion: callers bind the returned texture immediately.
 trim();cache.set(key,texture);cached.add(texture);return texture
}
