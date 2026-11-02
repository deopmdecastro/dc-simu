/**
 * Alinhar e distribuir a seleção múltipla (textos e elementos) — igual no Esquema 3D, GRAFCET e Esquema IEC.
 *
 * Cada editor mede a caixa de cada elemento selecionado no seu sistema de coordenadas (símbolos, etapas e
 * componentes pela geometria; textos pelo DOM) e aplica os deslocamentos devolvidos pelo seu próprio caminho
 * de gravação (um só passo de Desfazer). A barra pede a ação com `requestAlign` e só o editor da vista
 * indicada responde (no modo «Dois canvas» há mais de um editor montado).
 */
import { useEffect, useRef } from 'react'

export type AlignAction = 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom' | 'distH' | 'distV'
export type AlignView = 'schematic' | 'grafcet' | 'commands'

/** Caixa no sistema de coordenadas do editor. `yUp`: no 3D o eixo Y cresce para cima. */
export interface AlignBox { id: string; x0: number; y0: number; x1: number; y1: number }
export interface AlignDelta { dx: number; dy: number }

export const ALIGN_ACTIONS: { id: AlignAction; label: string; hint: string; min: number }[] = [
  { id: 'left', label: 'Alinhar à esquerda', hint: 'Encosta tudo à margem esquerda do elemento mais à esquerda', min: 2 },
  { id: 'hcenter', label: 'Centrar na horizontal', hint: 'Mesmo eixo vertical (centro da seleção)', min: 2 },
  { id: 'right', label: 'Alinhar à direita', hint: 'Encosta tudo à margem direita do elemento mais à direita', min: 2 },
  { id: 'top', label: 'Alinhar ao topo', hint: 'Encosta tudo ao topo do elemento mais acima', min: 2 },
  { id: 'vcenter', label: 'Centrar na vertical', hint: 'Mesma linha horizontal (centro da seleção)', min: 2 },
  { id: 'bottom', label: 'Alinhar à base', hint: 'Encosta tudo à base do elemento mais abaixo', min: 2 },
  { id: 'distH', label: 'Distribuir na horizontal', hint: 'Espaços iguais entre elementos (mín. 3)', min: 3 },
  { id: 'distV', label: 'Distribuir na vertical', hint: 'Espaços iguais entre elementos (mín. 3)', min: 3 },
]

const EPS = 1e-6

/**
 * Deslocamentos para alinhar/distribuir as caixas. Só devolve os elementos que mudam de sítio.
 * Com `yUp` (3D), «topo» é o maior Y e «base» o menor.
 * Distribuir mantém o primeiro e o último no lugar e iguala os espaços livres entre caixas vizinhas.
 */
export function alignOffsets(boxes: AlignBox[], action: AlignAction, yUp = false): Map<string, AlignDelta> {
  const out = new Map<string, AlignDelta>()
  const min = ALIGN_ACTIONS.find((a) => a.id === action)?.min ?? 2
  if (boxes.length < min) return out
  const put = (id: string, dx: number, dy: number) => { if (Math.abs(dx) > EPS || Math.abs(dy) > EPS) out.set(id, { dx, dy }) }
  const left = Math.min(...boxes.map((b) => b.x0))
  const right = Math.max(...boxes.map((b) => b.x1))
  const low = Math.min(...boxes.map((b) => b.y0))
  const high = Math.max(...boxes.map((b) => b.y1))
  const top = yUp ? high : low
  const bottom = yUp ? low : high
  switch (action) {
    case 'left': boxes.forEach((b) => put(b.id, left - b.x0, 0)); break
    case 'right': boxes.forEach((b) => put(b.id, right - b.x1, 0)); break
    case 'hcenter': { const c = (left + right) / 2; boxes.forEach((b) => put(b.id, c - (b.x0 + b.x1) / 2, 0)); break }
    case 'top': boxes.forEach((b) => put(b.id, 0, yUp ? top - b.y1 : top - b.y0)); break
    case 'bottom': boxes.forEach((b) => put(b.id, 0, yUp ? bottom - b.y0 : bottom - b.y1)); break
    case 'vcenter': { const c = (low + high) / 2; boxes.forEach((b) => put(b.id, 0, c - (b.y0 + b.y1) / 2)); break }
    case 'distH':
    case 'distV': {
      const horizontal = action === 'distH'
      const a0 = (b: AlignBox) => (horizontal ? b.x0 : b.y0)
      const a1 = (b: AlignBox) => (horizontal ? b.x1 : b.y1)
      const sorted = [...boxes].sort((p, q) => (a0(p) + a1(p)) - (a0(q) + a1(q)))
      const span = a1(sorted[sorted.length - 1]) - a0(sorted[0])
      const sizes = sorted.reduce((sum, b) => sum + (a1(b) - a0(b)), 0)
      const gap = (span - sizes) / (sorted.length - 1)
      let cursor = a0(sorted[0])
      for (const b of sorted) {
        const shift = cursor - a0(b)
        put(b.id, horizontal ? shift : 0, horizontal ? 0 : shift)
        cursor += a1(b) - a0(b) + gap
      }
      break
    }
  }
  return out
}

/** Caixa de um elemento do DOM convertida para o mundo do editor (`toWorld` do próprio editor). */
export function domWorldBox(id: string, el: Element | null | undefined, toWorld: (cx: number, cy: number) => { x: number; y: number }): AlignBox | null {
  if (!el) return null
  const r = el.getBoundingClientRect()
  if (!r.width && !r.height) return null
  const a = toWorld(r.left, r.top)
  const b = toWorld(r.right, r.bottom)
  return { id, x0: Math.min(a.x, b.x), y0: Math.min(a.y, b.y), x1: Math.max(a.x, b.x), y1: Math.max(a.y, b.y) }
}

/** Mensagem curta para o resultado (o editor mostra-a na barra de estado). */
export function alignMessage(action: AlignAction, count: number, moved: number): string {
  const def = ALIGN_ACTIONS.find((a) => a.id === action)!
  if (count < def.min) return def.min === 3 ? 'Distribuir precisa de, pelo menos, 3 elementos selecionados' : 'Selecione pelo menos 2 elementos ou textos para alinhar'
  if (!moved) return `${def.label}: a seleção já está alinhada`
  return `${def.label} · ${count} elementos · Ctrl+Z desfaz`
}

const ALIGN_EVENT = 'dcsimu:align-selection'

/** A barra pede ao editor da vista indicada que alinhe/distribua a seleção. */
export function requestAlign(view: AlignView, action: AlignAction) {
  window.dispatchEvent(new CustomEvent(ALIGN_EVENT, { detail: { view, action } }))
}

/** O editor regista-se para cumprir os pedidos de alinhamento da sua vista. */
export function useAlignAction(view: AlignView, handler: (action: AlignAction) => void) {
  const ref = useRef(handler)
  ref.current = handler
  useEffect(() => {
    const onRequest = (event: Event) => {
      const detail = (event as CustomEvent<{ view: AlignView; action: AlignAction }>).detail
      if (detail?.view === view) ref.current(detail.action)
    }
    window.addEventListener(ALIGN_EVENT, onRequest)
    return () => window.removeEventListener(ALIGN_EVENT, onRequest)
  }, [view])
}
