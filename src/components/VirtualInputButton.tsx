import { useRef, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import { useSimStore, type VirtualInputMode } from '../store/useSimStore'

/** Botão de uma entrada virtual.
 *  - Encravamento (latch): cada clique liga/desliga e mantém o estado.
 *  - Pressão (push, NO): só está a 1 enquanto o botão é premido (rato, toque ou Espaço/Enter).
 *  - NC (nc): repousa a 1 e cai a 0 enquanto o botão é premido (ex.: botão Stop/emergência).
 *  Com Shift premido, uma entrada com encravamento comporta-se como pressão (atalho histórico). */
export default function VirtualInputButton({
  address,
  className = '',
  children,
  title,
  disabled = false,
}: {
  address: string
  className?: string
  children?: ReactNode
  title?: string
  /** Simulador parado (STOP): a entrada não responde — ligá-la com Run. */
  disabled?: boolean
}) {
  const on = useSimStore((s) => !!s.virtualInputs[address])
  const mode: VirtualInputMode = useSimStore((s) => s.virtualInputModes[address] ?? 'latch')
  const setInput = useSimStore((s) => s.setVirtualInput)
  const setMode = useSimStore((s) => s.setVirtualInputMode)

  /** true enquanto um premir momentâneo (rato/toque) está a decorrer */
  const held = useRef(false)
  /** o clique que se segue a um premir momentâneo não deve alternar o estado */
  const swallowClick = useRef(false)

  // Botões momentâneos: NO repousa a 0 e vai a 1 premido; NC repousa a 1 e vai a 0 premido.
  const momentary = mode === 'push' || mode === 'nc'
  const rest = mode === 'nc'
  const active = mode !== 'nc'
  const press = (event: PointerEvent<HTMLButtonElement>) => {
    if (disabled || event.button !== 0 || !(momentary || event.shiftKey)) return
    event.preventDefault()
    event.currentTarget.setPointerCapture?.(event.pointerId)
    held.current = true
    swallowClick.current = true
    setInput(address, active)
  }
  const release = () => {
    if (!held.current) return
    held.current = false
    setInput(address, rest)
  }
  const click = () => {
    if (disabled) return
    if (swallowClick.current) {
      swallowClick.current = false
      return
    }
    // Em modo pressão, um clique sem pointerdown (ex.: leitor de ecrã) dá um pulso curto.
    if (momentary) {
      setInput(address, active)
      window.setTimeout(() => setInput(address, rest), 150)
      return
    }
    setInput(address, !useSimStore.getState().virtualInputs[address])
  }
  const keyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (disabled || !momentary || (event.key !== ' ' && event.key !== 'Enter') || event.repeat) return
    event.preventDefault()
    setInput(address, active)
  }
  const keyUp = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!momentary || (event.key !== ' ' && event.key !== 'Enter')) return
    event.preventDefault()
    setInput(address, rest)
  }

  const hint =
    mode === 'push'
      ? 'Botão de pressão (NO): mantenha premido para ligar · botão direito muda o tipo'
      : mode === 'nc'
        ? 'Botão NC (ex.: Stop): em repouso está a 1, premido passa a 0 · botão direito muda o tipo'
          : `Interruptor: clique para ${on ? 'desligar' : 'ligar'} (Shift = pressão · botão direito muda o tipo)`

  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      className={`${className} ${on ? 'is-on' : ''} is-${mode}`.trim()}
      title={title ? `${title} — ${hint}` : hint}
      onPointerDown={press}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={release}
      onClick={click}
      onKeyDown={keyDown}
      onKeyUp={keyUp}
      onBlur={() => {
        if (momentary && useSimStore.getState().virtualInputs[address] === active) setInput(address, rest)
      }}
      onContextMenu={(event) => {
        event.preventDefault()
        setMode(address, mode === 'latch' ? 'push' : mode === 'push' ? 'nc' : 'latch')
      }}
    >
      {children}
    </button>
  )
}
