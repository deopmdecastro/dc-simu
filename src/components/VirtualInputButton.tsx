import { useRef, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import { useSimStore, type VirtualInputMode } from '../store/useSimStore'

/** Botão de uma entrada virtual.
 *  - Encravamento (latch): cada clique liga/desliga e mantém o estado.
 *  - Pressão (push): só está a 1 enquanto o botão é premido (rato, toque ou Espaço/Enter).
 *  Com Shift premido, uma entrada com encravamento comporta-se como pressão (atalho histórico). */
export default function VirtualInputButton({
  address,
  className = '',
  children,
  title,
}: {
  address: string
  className?: string
  children?: ReactNode
  title?: string
}) {
  const on = useSimStore((s) => !!s.virtualInputs[address])
  const mode: VirtualInputMode = useSimStore((s) => s.virtualInputModes[address] ?? 'latch')
  const setInput = useSimStore((s) => s.setVirtualInput)
  const setMode = useSimStore((s) => s.setVirtualInputMode)

  /** true enquanto um premir momentâneo (rato/toque) está a decorrer */
  const held = useRef(false)
  /** o clique que se segue a um premir momentâneo não deve alternar o estado */
  const swallowClick = useRef(false)

  const press = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0 || !(mode === 'push' || event.shiftKey)) return
    event.preventDefault()
    event.currentTarget.setPointerCapture?.(event.pointerId)
    held.current = true
    swallowClick.current = true
    setInput(address, true)
  }
  const release = () => {
    if (!held.current) return
    held.current = false
    setInput(address, false)
  }
  const click = () => {
    if (swallowClick.current) {
      swallowClick.current = false
      return
    }
    // Em modo pressão, um clique sem pointerdown (ex.: leitor de ecrã) dá um pulso curto.
    if (mode === 'push') {
      setInput(address, true)
      window.setTimeout(() => setInput(address, false), 150)
      return
    }
    setInput(address, !useSimStore.getState().virtualInputs[address])
  }
  const keyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (mode !== 'push' || (event.key !== ' ' && event.key !== 'Enter') || event.repeat) return
    event.preventDefault()
    setInput(address, true)
  }
  const keyUp = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (mode !== 'push' || (event.key !== ' ' && event.key !== 'Enter')) return
    event.preventDefault()
    setInput(address, false)
  }

  const hint =
    mode === 'push'
      ? 'Botão de pressão: mantenha premido para ligar'
      : `Botão com encravamento: clique para ${on ? 'desligar' : 'ligar'} (Shift = pressão)`

  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
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
        if (mode === 'push' && useSimStore.getState().virtualInputs[address]) setInput(address, false)
      }}
      onContextMenu={(event) => {
        event.preventDefault()
        setMode(address, mode === 'push' ? 'latch' : 'push')
      }}
    >
      {children}
    </button>
  )
}
