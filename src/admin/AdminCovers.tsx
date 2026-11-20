import { useEffect, useRef, useState } from 'react'
import ProjectCover from '../dashboard/ProjectCover'
import { isEmptyPreview, type ProjectPreviewData } from '../dashboard/projectPreview'
import { ComponentThumb } from '../three/componentThumbnails'
import type { ComponentType } from '../types'
import { toneOf } from '../ui/Avatar'
import { IconCube, IconProjects } from '../ui/icons'

/** Só monta o conteúdo pesado (capturas 3D) quando a linha se aproxima do ecrã. */
function useNearScreen<T extends Element>() {
  const ref = useRef<T>(null)
  const [near, setNear] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || near) return
    if (typeof IntersectionObserver === 'undefined') { setNear(true); return }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setNear(true)
        observer.disconnect()
      }
    }, { rootMargin: '200px' })
    observer.observe(el)
    return () => observer.disconnect()
  }, [near])
  return [ref, near] as const
}

/**
 * Capa de um projeto nas listas de administração — a mesma composição do painel
 * do utilizador (foto 3D do canvas ou esquema real com componentes e cabos).
 */
export function ProjectThumb({
  name,
  preview,
  size = 'lg',
}: {
  name: string
  preview?: ProjectPreviewData
  size?: 'md' | 'lg' | 'xl'
}) {
  const [ref, near] = useNearScreen<HTMLSpanElement>()
  const hasArt = !isEmptyPreview(preview)
  return (
    <span
      ref={ref}
      className={`adm-cover adm-cover-project is-${size} ${hasArt ? 'has-art' : `av-t${toneOf(name)} is-plain`}`}
      aria-hidden="true"
    >
      {hasArt
        ? (near ? <ProjectCover preview={preview} large={size === 'xl'} /> : <span className="adm-cover-placeholder" />)
        : <IconProjects size={size === 'xl' ? 28 : size === 'lg' ? 22 : 16} />}
    </span>
  )
}

/** Capa de um componente (miniatura 3D real) com moldura e reserva de espaço enquanto carrega. */
export function ComponentCover({ type, size = 'md' }: { type: ComponentType | string; size?: 'md' | 'lg' }) {
  const [ref, near] = useNearScreen<HTMLSpanElement>()
  const px = size === 'lg' ? 64 : 48
  return (
    <span ref={ref} className={`adm-cover adm-cover-component is-${size}`} aria-hidden="true">
      {near ? <ComponentThumb type={type as ComponentType} size={px} /> : <IconCube size={16} />}
    </span>
  )
}
