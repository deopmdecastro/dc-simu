/**
 * Despeja as posições dos bornes de todos os componentes com modelo 3D, para a
 * verificação visual da varredura (`scripts/draw-terminal-map.py`).
 *
 * `before` é o valor antes da correção da convenção de altura em `factory.ts`
 * (a mesma medida com o eixo vertical invertido); `after` é o que o Painel 3D
 * e o editor de bornes consomem agora.
 *
 * Corre sem navegador: `npx tsx scripts/dump-terminal-positions.ts`.
 */
import { TEMPLATES } from '../src/electrical/factory'
import { getComponentModelSpec } from '../src/three/modelPaths'
import type { ComponentType } from '../src/types'

interface Row {
  label: string
  kind: string
  face: string | null
  after: { x: number; y: number; z: number } | null
  before: { x: number; y: number; z: number } | null
}

const out: Record<string, { size: { width: number; height: number; depth: number }; placement: string; name: string; terminals: Row[] }> = {}

for (const [type, tpl] of Object.entries(TEMPLATES) as Array<[ComponentType, (typeof TEMPLATES)[ComponentType]]>) {
  const spec = getComponentModelSpec(type)
  if (!spec || !tpl.terminals.length) continue
  out[type] = {
    name: tpl.paletteName,
    size: spec.physicalSizeMm,
    placement: spec.placement,
    terminals: tpl.terminals.map((terminal) => {
      const p = terminal.position3D ?? null
      return {
        label: terminal.label,
        kind: terminal.kind,
        face: (terminal as { face?: string }).face ?? null,
        after: p ? { x: p.x, y: p.y, z: p.z } : null,
        before: p ? { x: p.x, y: 1 - p.y, z: p.z } : null,
      }
    }),
  }
}

console.log(JSON.stringify(out, null, 2))
