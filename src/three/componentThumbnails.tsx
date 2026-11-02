/**
 * Miniaturas da biblioteca de componentes.
 *
 * Só imagens do modelo real: capa pré-gerada do GLB (public/component-covers) → IndexedDB → captura
 * única do GLB (WebP). Sem miniaturas genéricas desenhadas à mão: enquanto a capa não chega o cartão
 * fica vazio e neutro, e os tipos sem GLB mostram só o espaço vazio (o cartão indica o bloqueio).
 * A grelha nunca mantém WebGL por cartão.
 *
 * O turntable interativo (InteractiveComponentThumb) gera fotogramas a pedido
 * quando o utilizador explora o modelo; não é usado na lista da biblioteca.
 */
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { defaultComponentTurntablePitch, getComponentTurntableFrames, getComponentTurntableHero } from './componentTurntable'
import { findStaticCover, resolveLibraryCover } from './componentCoverAssets'
import type { ComponentType } from '../types'

/**
 * Capa do cartão da biblioteca: imagem do modelo real (estática ou em cache) — sem WebGL.
 * Preferência: /component-covers/{type}.webp → IndexedDB → captura do GLB → espaço vazio.
 */
export function ComponentThumb({ type, size = 26 }: { type: ComponentType; size?: number }) {
  const [coverSrc, setCoverSrc] = useState<string | null>(null)
  const [resolved, setResolved] = useState(false)
  const holderRef = useRef<HTMLDivElement | null>(null)
  const [inView, setInView] = useState(false)

  useEffect(() => {
    if (inView) return
    const node = holderRef.current
    if (!node || typeof IntersectionObserver === 'undefined') { setInView(true); return }
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setInView(true); io.disconnect() }
    }, { rootMargin: '240px' })
    io.observe(node)
    return () => io.disconnect()
  }, [inView])

  useEffect(() => {
    setCoverSrc(null)
    setResolved(false)
    if (!inView) return
    let active = true
    resolveLibraryCover(type).then((url) => {
      if (!active) return
      setCoverSrc(url)
      setResolved(true)
    })
    return () => { active = false }
  }, [inView, type])

  if (!coverSrc) {
    return (
      <div
        ref={holderRef}
        style={{ width: size, height: size }}
        className={`shrink-0 rounded-[4px] bg-surface-sunken${resolved ? '' : ' animate-pulse'}`}
        data-thumb-state={resolved ? 'sem-modelo' : 'a-carregar'}
        role="img"
        aria-label={resolved ? 'Sem imagem do modelo 3D' : 'A carregar a imagem do modelo 3D'}
      />
    )
  }
  return (
    <img
      src={coverSrc}
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
      draggable={false}
      className="shrink-0 rounded-[4px] bg-transparent"
      style={{ width: size, height: size, objectFit: 'contain' }}
    />
  )
}

/**
 * Turntable GLB estático até o utilizador o navegar. Mantém apenas imagens no
 * DOM: cada faixa vertical é renderizada a pedido e o contexto WebGL é fechado.
 */
export function InteractiveComponentThumb({ type, size = 112 }: { type: ComponentType; size?: number }) {
  const defaultPitch = defaultComponentTurntablePitch()
  const [heroSrc, setHeroSrc] = useState<string | null>(null)
  const [frames, setFrames] = useState<string[] | null>(null)
  const [interactiveLoaded, setInteractiveLoaded] = useState(false)
  const [yawSteps, setYawSteps] = useState(12)
  const [pitchSteps, setPitchSteps] = useState(5)
  const [yaw, setYaw] = useState(0)
  const [pitch, setPitch] = useState(defaultPitch)
  const [displayPitch, setDisplayPitch] = useState(defaultPitch)
  const [dragging, setDragging] = useState(false)
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState(false)
  const requestRef = useRef(0)
  const pointer = useRef({ id: -1, x: 0, y: 0, yaw: 0, pitch: defaultPitch })

  // 1.º fotograma: a capa pré-gerada (imagem de ~5 KiB, sem descarregar o GLB); só sem capa é que se
  // desenha o modelo. A rotação completa (GLB) só se gera quando o utilizador interage.
  useEffect(() => {
    let alive = true
    setFailed(false)
    void findStaticCover(type)
      .then((cover) => cover ?? getComponentTurntableHero(type, defaultPitch))
      .then((src) => {
        if (!alive) return
        setHeroSrc(src)
      })
      .catch(() => {
        if (!alive) return
        setFailed(true)
      })
    return () => { alive = false }
  }, [defaultPitch, type])

  // Faixa de rotação completa: gerada apenas quando o utilizador interage (arrasto/teclado).
  useEffect(() => {
    if (!interactiveLoaded && pitch === defaultPitch) return
    const request = ++requestRef.current
    setPending(true)
    setFailed(false)
    void getComponentTurntableFrames(type, pitch)
      .then((value) => {
        if (request !== requestRef.current) return
        setFrames(value.frames)
        setYawSteps(value.yawSteps)
        setPitchSteps(value.pitchSteps)
        setDisplayPitch(value.pitchIndex)
        setPending(false)
      })
      .catch(() => {
        if (request !== requestRef.current) return
        setFailed(true)
        setPending(false)
      })
    return () => { requestRef.current += 1 }
  }, [defaultPitch, interactiveLoaded, pitch, type])

  useEffect(() => {
    setHeroSrc(null)
    setFrames(null)
    setInteractiveLoaded(false)
    setYaw(0)
    setPitch(defaultPitch)
    setDisplayPitch(defaultPitch)
  }, [defaultPitch, type])

  const normalizedYaw = (value: number) => (value % yawSteps + yawSteps) % yawSteps
  const movePitch = (delta: number) => {
    setInteractiveLoaded(true)
    setPitch((value) => Math.max(0, Math.min(pitchSteps - 1, value + delta)))
  }
  const finishPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (pointer.current.id !== event.pointerId) return
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    pointer.current.id = -1
    setDragging(false)
  }
  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault()
      setInteractiveLoaded(true)
      setYaw((value) => normalizedYaw(value + (event.key === 'ArrowLeft' ? -1 : 1)))
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault()
      movePitch(event.key === 'ArrowUp' ? -1 : 1)
    } else if (event.key === 'Home') {
      event.preventDefault()
      setYaw(0)
      setPitch(defaultPitch)
    }
  }

  const src = frames ? frames[normalizedYaw(yaw)] : heroSrc
  if (!src) return <div className={`dc-real-glb-loading${failed ? ' is-error' : ''}`} style={{ width: size, height: size }} role="status" aria-label={failed ? 'Modelo 3D indisponível' : 'A carregar modelo 3D'} />
  return <div
    className={`dc-turntable-control${dragging ? ' is-dragging' : ''}${pending || displayPitch !== pitch ? ' is-rendering' : ''}`}
    style={{ width: size, height: size }}
    role="group"
    tabIndex={0}
    aria-label="Modelo 3D interativo. Arraste na horizontal e na vertical; use também as quatro setas."
    aria-busy={pending}
    onPointerDown={(event) => {
      event.preventDefault()
      setInteractiveLoaded(true)
      pointer.current = { id: event.pointerId, x: event.clientX, y: event.clientY, yaw, pitch }
      event.currentTarget.setPointerCapture(event.pointerId)
      setDragging(true)
    }}
    onPointerMove={(event) => {
      if (pointer.current.id !== event.pointerId) return
      event.preventDefault()
      const dx = event.clientX - pointer.current.x
      const dy = event.clientY - pointer.current.y
      setYaw(normalizedYaw(pointer.current.yaw - Math.round(dx / 15)))
      setPitch(Math.max(0, Math.min(pitchSteps - 1, pointer.current.pitch + Math.round(dy / 28))))
    }}
    onPointerUp={finishPointer}
    onPointerCancel={finishPointer}
    onKeyDown={onKeyDown}
  >
    <img className="dc-turntable-thumb" src={src} alt="" aria-hidden="true" width={size} height={size} draggable={false} />
  </div>
}
