/**
 * Dados para a verificação visual dos bornes: por componente, o GLB, a rotação
 * base, o tamanho físico e a posição de cada borne ANTES (convenção de altura
 * invertida) e DEPOIS (a que o Painel 3D consome).
 *
 * Corre sem navegador: `npx tsx scripts/terminal-verify-data.ts > /tmp/verify.json`.
 */
import { TEMPLATES } from '../src/electrical/factory'
import { getComponentModelSpec } from '../src/three/modelPaths'
import type { ComponentType } from '../src/types'

const out: Array<Record<string, unknown>> = []

for (const [type, tpl] of Object.entries(TEMPLATES) as Array<[ComponentType, (typeof TEMPLATES)[ComponentType]]>) {
  const spec = getComponentModelSpec(type)
  if (!spec || !tpl.terminals.length) continue
  out.push({
    type,
    name: tpl.paletteName,
    // Caminho servido pelo Vite: os ficheiros de `public/` ficam na raiz.
    path: spec.path,
    rotation: spec.rotation,
    flipDepth: !!spec.flipDepth,
    targetHeight: spec.targetHeight,
    size: spec.physicalSizeMm,
    placement: spec.placement,
    terminals: tpl.terminals.map((terminal) => ({
      label: terminal.label,
      face: (terminal as { position3DFace?: string }).position3DFace ?? null,
      after: terminal.position3D ?? null,
      before: terminal.position3D ? { x: terminal.position3D.x, y: 1 - terminal.position3D.y, z: terminal.position3D.z } : null,
    })),
  })
}

console.log(JSON.stringify(out, null, 1))
