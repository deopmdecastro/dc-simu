import { useEffect, useMemo, useState } from 'react'
import type { ComponentDecal } from '../types'
import { createDecalCanvas, decalContentKey, paintDecalImage } from '../three/decalContent'

export function useDecalRaster(decal: ComponentDecal) {
  const key = decalContentKey(decal)
  const canvas = useMemo(() => typeof document === 'undefined' ? null : createDecalCanvas(decal), [key])
  const [image, setImage] = useState('')
  useEffect(() => {
    if (!canvas) return
    let live = true
    setImage(canvas.toDataURL())
    paintDecalImage(canvas, decal).then(() => { if (live) setImage(canvas.toDataURL()) }).catch(() => { /* a UI de importação apresenta o erro antes de inserir */ })
    return () => { live = false }
  }, [canvas])
  return image
}

export default function DecalPreview({ decal, className = '' }: { decal: ComponentDecal; className?: string }) {
  const raster = useDecalRaster(decal)
  return <span className={`dc-decal-preview ${className}`} style={{ aspectRatio: `${decal.widthMm ?? 30} / ${decal.heightMm ?? 15}` }}>{raster ? <img src={raster} alt="" draggable={false} /> : <span>{decal.text}</span>}</span>
}
