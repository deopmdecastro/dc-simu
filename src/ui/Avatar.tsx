import { useEffect, useState } from 'react'

/** Tons do avatar: o mesmo utilizador tem sempre a mesma cor (a partir do e-mail ou nome). */
const TONES = 8

function hashOf(value: string): number {
  let hash = 0
  for (let index = 0; index < value.length; index++) hash = (hash * 31 + value.charCodeAt(index)) >>> 0
  return hash
}

/** Até duas iniciais: «Maria Silva» → MS; «admin@dcsimu.local» → A. */
export function initialsOf(name?: string, email?: string): string {
  const base = (name || email || '?').trim()
  const words = base.replace(/@.*$/, '').split(/[\s._-]+/).filter(Boolean)
  if (words.length === 0) return '?'
  const letters = words.length === 1 ? words[0].slice(0, 1) : words[0].slice(0, 1) + words[words.length - 1].slice(0, 1)
  return letters.toUpperCase()
}

export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg'

type Props = {
  name?: string
  email?: string
  /** URL (ou data URL) da fotografia; se falhar, mostra as iniciais. */
  src?: string | null
  size?: AvatarSize
  /** Ponto de estado no canto: ativa/bloqueada. */
  status?: 'active' | 'off'
  className?: string
}

/** Avatar do utilizador: fotografia quando existe, iniciais coloridas quando não. Decorativo: o nome vem sempre ao lado. */
export default function Avatar({ name, email, src, size = 'md', status, className = '' }: Props) {
  const [failed, setFailed] = useState(false)
  useEffect(() => { setFailed(false) }, [src])
  const tone = hashOf((email || name || '?').toLowerCase()) % TONES
  const showImage = !!src && !failed
  return <span className={`ui-avatar is-${size} av-t${tone} ${className}`.trim()} aria-hidden="true">
    {showImage
      ? <img src={src as string} alt="" draggable={false} onError={() => setFailed(true)} />
      : <span className="ui-avatar-initials">{initialsOf(name, email)}</span>}
    {status && <i className={`ui-avatar-dot is-${status}`} />}
  </span>
}

/** Tom de cor estável para capas sem imagem (projetos, componentes). */
export function toneOf(value: string): number { return hashOf(value.toLowerCase()) % TONES }
