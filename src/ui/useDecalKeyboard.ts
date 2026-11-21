import { useEffect } from 'react'
import { useSimStore } from '../store/useSimStore'
import { isTypingTarget } from './editorKeys'

let users = 0
let dx = 0, dy = 0
const arrows = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'])
const stop = () => { useSimStore.getState().endDecalMove(); dx = 0; dy = 0 }
function down(event: KeyboardEvent) {
  const state = useSimStore.getState()
  if (event.defaultPrevented || !state.selectedDecal || isTypingTarget(event.target) || event.ctrlKey || event.metaKey || event.altKey) return
  if (!arrows.has(event.key) && !['Escape', 'Delete', 'Backspace'].includes(event.key)) return
  event.preventDefault()
  event.stopImmediatePropagation()
  if (event.key === 'Escape') { state.cancelDecalMove(); state.selectDecal(state.selectedDecal.componentId, null); dx = 0; dy = 0; return }
  if (event.key === 'Delete' || event.key === 'Backspace') { stop(); state.removeDecal(state.selectedDecal.componentId, state.selectedDecal.decalId); return }
  if (!state._decalMove) { state.beginDecalMove(); dx = 0; dy = 0 }
  const step = event.shiftKey ? 10 : 1
  dx += event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0
  dy += event.key === 'ArrowUp' ? step : event.key === 'ArrowDown' ? -step : 0
  state.moveSelectedDecal(dx, dy)
}
function up(event: KeyboardEvent) { if (arrows.has(event.key)) stop() }

/** Uma subscrição global, mesmo com as vistas 2D e 3D lado a lado. */
export function useDecalKeyboard() {
  useEffect(() => {
    if (users++ === 0) { window.addEventListener('keydown', down, true); window.addEventListener('keyup', up, true); window.addEventListener('blur', stop) }
    return () => { if (--users === 0) { stop(); window.removeEventListener('keydown', down, true); window.removeEventListener('keyup', up, true); window.removeEventListener('blur', stop) } }
  }, [])
}
