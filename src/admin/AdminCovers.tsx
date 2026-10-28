import { useEffect, useRef, useState } from 'react'
import ProjectCover from '../dashboard/ProjectCover'
import type { ProjectPreviewData } from '../dashboard/projectPreview'
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
    const observer = new IntersectionObserver((entries) => { if (entries.some((entry) => entry.isIntersecting)) { setNear(true); observer.disconnect() } }, { rootMargin: '160px' })
    observer.observe(el)
    return () => observer.disconnect()
  }, [near])
  return [ref, near] as const
}

/**
 * Capa de um projeto nas listas de administração.
 * Com pré-visualização usa a mesma composição do painel de projetos; sem ela
 * (projeto vazio ou servidor antigo) mostra uma capa de cor estável com o ícone.
 */
export function ProjectThumb({ name, preview, size = 'md' }: { name: string; preview?: ProjectPreviewData; size?: 'md' | 'lg' }) {
  const [ref, near] = useNearScreen<HTMLSpanElement>()
  const hasContent = !!preview && (!!preview.cover || preview.components.length > 0)
  return <span ref={ref} className={`adm-cover adm-cover-project is-${size} ${hasContent ? 'has-art' : `av-t${toneOf(name)} is-plain`}`} aria-hidden="true">
    {hasContent
      ? (near ? <ProjectCover preview={preview} /> : null)
      : <IconProjects size={size === 'lg' ? 22 : 16} />}
  </span>
}

/** Capa de um componente (miniatura 3D real) com moldura e reserva de espaço enquanto carrega. */
export function ComponentCover({ type, size = 'md' }: { type: ComponentType | string; size?: 'md' | 'lg' }) {
  const [ref, near] = useNearScreen<HTMLSpanElement>()
  const px = size === 'lg' ? 64 : 48
  return <span ref={ref} className={`adm-cover adm-cover-component is-${size}`} aria-hidden="true">
    {near ? <ComponentThumb type={type as ComponentType} size={px} /> : <IconCube size={16} />}
  </span>
}
