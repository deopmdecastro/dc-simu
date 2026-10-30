import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { ComponentType } from '../types'
import { WIRE_COLORS } from '../schematic/symbols'
import { hasComponent3DVisual } from '../three/modelPaths'
import { getOrientedComponentImage } from '../three/orientedComponentImage'
import type { ProjectPreviewData, PreviewComponent, PreviewWire } from './projectPreview'

const imageKey = (c: PreviewComponent) => `${c.t}:${(c.o ?? [0, 0, 0]).join(':')}`

/** Imagens ortográficas reais dos componentes (mesmas do Esquema 2D), capturadas
 *  só quando o cover entra no ecrã e partilhadas por tipo/orientação. */
function useCoverImages(components: PreviewComponent[], active: boolean) {
  const [images, setImages] = useState<Record<string, string>>({})
  const wanted = useMemo(() => {
    const seen = new Map<string, PreviewComponent>()
    for (const c of components) {
      if (/rail/i.test(c.t) || !c.t) continue
      const key = imageKey(c)
      if (!seen.has(key)) seen.set(key, c)
    }
    return [...seen.entries()].slice(0, 24)
  }, [components])

  useEffect(() => {
    if (!active) return
    let cancelled = false
    ;(async () => {
      for (const [key, c] of wanted) {
        if (cancelled) return
        if (!hasComponent3DVisual(c.t as ComponentType)) continue
        try {
          const url = await getOrientedComponentImage(c.t as ComponentType, c.o ? { x: c.o[0], y: c.o[1], z: c.o[2] } : null)
          if (!cancelled) setImages((prev) => (prev[key] ? prev : { ...prev, [key]: url }))
        } catch (_e) {
          void _e
        }
      }
    })()
    return () => { cancelled = true }
  }, [wanted, active])
  return images
}

function useInView<T extends Element>() {
  const ref = useRef<T>(null)
  const [seen, setSeen] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || seen) return
    if (typeof IntersectionObserver === 'undefined') { setSeen(true); return }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { setSeen(true); io.disconnect() }
    }, { rootMargin: '120px' })
    io.observe(el)
    return () => io.disconnect()
  }, [seen])
  return [ref, seen] as const
}

const wireColor = (c?: string) => (c && (c.startsWith('#') ? c : WIRE_COLORS[c])) || '#64748b'

/** Cover do projeto: composição do esquema com as peças reais, calhas, fios e bornes. */
export default function ProjectCover({ preview, large = false }: { preview?: ProjectPreviewData; large?: boolean }) {
  const comps = preview?.components ?? []
  const [hostRef, inView] = useInView<HTMLDivElement>()
  const images = useCoverImages(comps, inView)
  const clipId = `cv${useId().replace(/:/g, '')}`

  const geom = useMemo(() => {
    if (!comps.length) return null
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    const focus = comps.filter((c) => !/rail/i.test(c.t))
    for (const c of focus.length ? focus : comps) {
      const swap = Math.round(c.r / 90) % 2 !== 0
      const cx = c.x + c.w / 2, cy = c.y + c.h / 2
      const hw = (swap ? c.h : c.w) / 2, hh = (swap ? c.w : c.h) / 2
      minX = Math.min(minX, cx - hw); maxX = Math.max(maxX, cx + hw)
      minY = Math.min(minY, cy - hh); maxY = Math.max(maxY, cy + hh)
    }
    const span = Math.max(maxX - minX, maxY - minY, 80)
    const pad = Math.max(28, span * 0.07)
    return { minX, minY, maxX, maxY, span, pad }
  }, [comps])

  const photo = preview?.cover ?? preview?.flow
  if (photo) {
    return (
      <div className={`dx-cover dx-cover-real${large ? ' is-large' : ''}`} ref={hostRef} aria-hidden="true">
        <img src={photo} alt="" className="dx-cover-photo" draggable={false} />
      </div>
    )
  }

  // Sem capa nem geometria: o mesmo logótipo para todos os tipos de projeto (só o título muda).
  if (!geom || !preview) {
    const emptyTitle = preview?.kind === 'grafcet' ? 'GRAFCET vazio' : preview?.kind === 'ladder' ? 'Ladder vazio' : 'Projeto vazio'
    const emptyHint = preview?.kind === 'grafcet' ? 'Abra o editor para criar as etapas' : preview?.kind === 'ladder' ? 'Abra o editor para criar as networks' : 'Abra o editor para adicionar componentes'
    return (
      <div className="dx-cover dx-cover-empty" ref={hostRef} aria-hidden="true">
        {/* Logo na mesma paleta do ghost SVG (#c4cfde stroke / #e1e8f1 fill). */}
        <span className="dx-cover-empty-logo" aria-hidden="true">
          <svg viewBox="0 0 32 32" width="44" height="44">
            <rect width="32" height="32" rx="8" fill="#e1e8f1" />
            <path
              d="M18.2 6.5 11 16.8h4.2l-1.6 8.7L21 14.2h-4.1l1.3-7.7Z"
              fill="#c4cfde"
            />
          </svg>
        </span>
        <span>{emptyTitle}</span>
        <small>{emptyHint}</small>
      </div>
    )
  }

  const { minX, minY, maxX, maxY, span, pad } = geom
  const stroke = Math.max(0.8, span / 340)
  const plate = pad * 0.55
  const vb = `${minX - pad} ${minY - pad} ${maxX - minX + pad * 2} ${maxY - minY + pad * 2}`
  const rails = comps.filter((c) => /rail/i.test(c.t))
  const devices = comps.filter((c) => !/rail/i.test(c.t))
  const labelSize = Math.max(span / 46, 7)

  return (
    <div className={`dx-cover${large ? ' is-large' : ''}`} ref={hostRef} aria-hidden="true">
      <svg viewBox={vb} preserveAspectRatio="xMidYMid meet">
        <defs>
          <clipPath id={clipId}>
            <rect x={minX - plate} y={minY - plate} width={maxX - minX + plate * 2} height={maxY - minY + plate * 2} rx={plate * 0.7} />
          </clipPath>
        </defs>
        <rect x={minX - plate} y={minY - plate} width={maxX - minX + plate * 2} height={maxY - minY + plate * 2} rx={plate * 0.7} className="dx-cover-plate" strokeWidth={stroke} />
        <g clipPath={`url(#${clipId})`}>
        {rails.map((c, i) => {
          const rot = c.r ? `rotate(${c.r} ${c.x + c.w / 2} ${c.y + c.h / 2})` : undefined
          return (
            <g key={`r${i}`} transform={rot}>
              <rect x={c.x} y={c.y} width={c.w} height={c.h} rx={stroke * 2} fill="#cfd8e3" stroke="#b4c0cf" strokeWidth={stroke * 0.7} />
              <line x1={c.x + c.w * 0.02} x2={c.x + c.w * 0.98} y1={c.y + c.h / 2} y2={c.y + c.h / 2} stroke="#97a6b9" strokeWidth={Math.max(stroke * 0.8, c.h * 0.16)} strokeDasharray={`${c.h * 0.9} ${c.h * 0.7}`} />
            </g>
          )
        })}
        </g>
        {devices.map((c, i) => {
          const cx = c.x + c.w / 2, cy = c.y + c.h / 2
          const img = images[imageKey(c)]
          const tf = [c.r ? `rotate(${c.r} ${cx} ${cy})` : '', c.m ? `translate(${cx * 2} 0) scale(-1 1)` : ''].filter(Boolean).join(' ') || undefined
          return (
            <g key={`c${i}`} transform={tf}>
              {img ? (
                <image href={img} x={c.x} y={c.y} width={c.w} height={c.h} preserveAspectRatio="xMidYMid meet" className="dx-cover-img" />
              ) : (
                <>
                  <rect x={c.x} y={c.y} width={c.w} height={c.h} rx={Math.min(c.w, c.h) * 0.12} fill={c.c && /^#/.test(c.c) ? c.c : '#eef4ff'} stroke="#7d9fe0" strokeWidth={stroke} />
                  {c.ref && c.w > span / 16 && <text x={cx} y={cy} fontSize={Math.min(c.h * 0.35, c.w * 0.3, labelSize * 1.4)} textAnchor="middle" dominantBaseline="central" fill="#284467" fontWeight="700">{c.ref}</text>}
                </>
              )}
            </g>
          )
        })}
        {preview.wires.map((w, i) => (
          <path key={`w${i}`} d={coverWirePath(w, i, stroke)} fill="none" stroke={wireColor(w.c)} strokeWidth={stroke * 1.5} strokeLinejoin="round" strokeLinecap="round" opacity=".9" />
        ))}
        {devices.map((c) => c.p.map((pt, k) => <circle key={`${c.ref}${k}${pt[0]}`} cx={pt[0]} cy={pt[1]} r={stroke * 1.7} className="dx-cover-pin" />))}
      </svg>
    </div>
  )
}

/**
 * Traçado de um cabo na capa, como num quadro: sai do borne na vertical até uma
 * calha acima/abaixo do aparelho, segue na horizontal numa faixa própria (para
 * não se sobrepor aos outros) e desce/sobe até ao borne de destino.
 */
function coverWirePath(w: PreviewWire, index: number, stroke: number): string {
  const [ax, ay] = w.a
  const [bx, by] = w.b
  if (w.sa === undefined || w.sb === undefined || w.ea === undefined || w.eb === undefined) {
    const mx = (ax + bx) / 2
    return `M${ax} ${ay}H${mx}V${by}H${bx}`
  }
  const lane = (index % 7) * stroke * 2.6
  const gap = stroke * 6 + lane
  const channel = (side: -1 | 1, limit: number) => limit + side * gap
  if (w.sa === w.sb) {
    // Os dois bornes saem para o mesmo lado: uma só calha para lá do aparelho mais saliente.
    const y = w.sa < 0 ? Math.min(channel(-1, w.ea), channel(-1, w.eb)) : Math.max(channel(1, w.ea), channel(1, w.eb))
    return `M${ax} ${ay}V${y}H${bx}V${by}`
  }
  // Lados opostos: calha de cada aparelho e uma prumada vertical entre os dois.
  const ya = channel(w.sa, w.ea)
  const yb = channel(w.sb, w.eb)
  const x = (ax + bx) / 2 + (index % 5 - 2) * stroke * 2.6
  return `M${ax} ${ay}V${ya}H${x}V${yb}H${bx}V${by}`
}
