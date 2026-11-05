import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import type { ElectricalComponent } from '../types'
import { PANEL_UNITS_PER_MM } from './modelPaths'

type Decal = NonNullable<ElectricalComponent['decals']>[number]

/** Etiqueta física: milímetros reais, ocultação pela porta e perspetiva da cena. */
export function EquipmentDecal3D({ decal: d }: { decal: Decal }) {
  const width = d.widthMm ?? 30
  const height = d.heightMm ?? 15
  const imageTexture = useMemo(() => {
    if (d.kind !== 'image' || !d.imageUrl) return null
    const loader = new THREE.TextureLoader()
    const tex = loader.load(d.imageUrl)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = 4
    return tex
  }, [d.kind, d.imageUrl])
  const texture = useMemo(() => {
    if (d.kind === 'image' && d.imageUrl) {
      // placeholder — será substituído por imageTexture quando carregar
      const canvas = document.createElement('canvas')
      canvas.width = 64; canvas.height = 64
      const ctx = canvas.getContext('2d')!
      ctx.fillStyle = '#e2e8f0'; ctx.fillRect(0,0,64,64)
      const map = new THREE.CanvasTexture(canvas)
      map.colorSpace = THREE.SRGBColorSpace
      return map
    }
    const canvas = document.createElement('canvas')
    canvas.width = 1024
    canvas.height = Math.max(64, Math.round(1024 * height / width))
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = d.background ?? '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = d.color ?? '#0f172a'
    if (d.border !== false) {
      ctx.strokeStyle = ctx.fillStyle
      ctx.lineWidth = Math.max(2, canvas.height * 0.025)
      ctx.strokeRect(ctx.lineWidth / 2, ctx.lineWidth / 2, canvas.width - ctx.lineWidth, canvas.height - ctx.lineWidth)
    }
    const icons: Record<string, string> = { bolt: '⚡', danger: '☠', ce: 'CE', wago: 'WAGO', siemens: 'Siemens' }
    const text = [d.icon ? (icons[d.icon] ?? d.icon) : '', d.text ?? ''].filter(Boolean).join(' ')
    let size = canvas.height * 0.45
    ctx.font = `${d.kind === 'logo' ? 800 : 700} ${size}px system-ui, sans-serif`
    const available = canvas.width * 0.9
    if (ctx.measureText(text).width > available) size *= available / ctx.measureText(text).width
    ctx.font = `${d.kind === 'logo' ? 800 : 700} ${size}px system-ui, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, canvas.width / 2, canvas.height / 2)
    const map = new THREE.CanvasTexture(canvas)
    map.colorSpace = THREE.SRGBColorSpace
    map.anisotropy = 4
    return map
  }, [d, width, height])
  useEffect(() => () => texture.dispose(), [texture])
  useEffect(() => () => { if (imageTexture) imageTexture.dispose() }, [imageTexture])
  const activeTexture = d.kind === 'image' && imageTexture ? imageTexture : texture
  return <mesh raycast={() => {}}>
    <planeGeometry args={[width * PANEL_UNITS_PER_MM, height * PANEL_UNITS_PER_MM]} />
    <meshBasicMaterial map={activeTexture} toneMapped={false} polygonOffset polygonOffsetFactor={-1} transparent={d.kind === 'image'} />
  </mesh>
}
