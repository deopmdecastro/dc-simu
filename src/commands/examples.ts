// Exemplos de esquemas de comando (didáticos, sem dados de clientes).
import type { CmdKind, CmdPart, CmdRotation, CommandsDiagram } from './model'

function builder(name: string) {
  const diagram: CommandsDiagram = { name, parts: [], wires: [], texts: [] }
  let n = 0
  const part = (kind: CmdKind, x: number, y: number, tag = '', extra: Partial<CmdPart> = {}, rot: CmdRotation = 0) => {
    const p: CmdPart = { id: `p${++n}`, kind, x, y, rot, tag, ...extra }
    diagram.parts.push(p)
    return p
  }
  const node = (x: number, y: number) => part('node', x, y)
  const wire = (a: CmdPart, ta: number, b: CmdPart, tb: number, mid?: number) => {
    diagram.wires.push({ id: `w${diagram.wires.length + 1}`, a: { part: a.id, term: ta }, b: { part: b.id, term: tb }, ...(mid !== undefined ? { mid } : {}) })
  }
  /** Liga os três polos de dois aparelhos trifásicos (bornes de baixo de `a` aos de cima de `b`). */
  const wire3 = (a: CmdPart, b: CmdPart, aBottom = true, bTop = true) => {
    for (let i = 0; i < 3; i++) wire(a, aBottom ? i * 2 + 1 : i * 2, b, bTop ? i * 2 : i * 2 + 1)
  }
  const text = (x: number, y: number, value: string) => diagram.texts!.push({ id: `t${diagram.texts!.length + 1}`, x, y, text: value })
  return { diagram, part, node, wire, wire3, text }
}

/** Arranque direto com retenção (auto-alimentação), paragem e relé térmico. */
export function directStartExample(): CommandsDiagram {
  const b = builder('Arranque direto')
  b.text(60, 0, 'Circuito de potência')
  const net = b.part('supply', 80, 40, '', { lines: ['L1', 'L2', 'L3'] })
  const q1 = b.part('breaker3', 80, 60, 'Q1')
  const k1 = b.part('contact3', 80, 160, 'K1')
  const f1 = b.part('thermal3', 80, 260, 'F1')
  const m1 = b.part('motor3', 80, 360, 'M1')
  for (let i = 0; i < 3; i++) b.wire(net, i, q1, i * 2)
  b.wire3(q1, k1); b.wire3(k1, f1)
  for (let i = 0; i < 3; i++) b.wire(f1, i * 2 + 1, m1, i)

  b.text(300, 0, 'Circuito de comando')
  const l1 = b.part('supply', 320, 40, '', { lines: ['L1'] })
  const f2 = b.part('fuse', 320, 60, 'F2')
  const f1nc = b.part('thermalNC', 320, 140, 'F1')
  const s1 = b.part('pushNC', 320, 220, 'S1')
  const p1 = b.node(320, 300)
  const s2 = b.part('pushNO', 320, 320, 'S2')
  const seal = b.part('contactNO', 400, 320, 'K1')
  const r1 = b.node(320, 420)
  const r2 = b.node(400, 420)
  const r3 = b.node(480, 420)
  const coil = b.part('coil', 320, 460, 'K1')
  const run = b.part('contactNO', 480, 460, 'K1', { labels: ['23', '24'] })
  const h1 = b.part('lamp', 480, 540, 'H1', { color: 'green' })
  const n = b.part('supply', 240, 640, '', { lines: ['N'] })
  const t1 = b.node(320, 640)
  const t2 = b.node(480, 640)
  b.wire(l1, 0, f2, 0); b.wire(f2, 1, f1nc, 0); b.wire(f1nc, 1, s1, 0); b.wire(s1, 1, p1, 0)
  b.wire(p1, 0, s2, 0); b.wire(p1, 0, seal, 0, 300)
  b.wire(s2, 1, r1, 0); b.wire(seal, 1, r2, 0); b.wire(r1, 0, r2, 0); b.wire(r2, 0, r3, 0)
  b.wire(r1, 0, coil, 0); b.wire(r3, 0, run, 0); b.wire(run, 1, h1, 0)
  b.wire(coil, 1, t1, 0); b.wire(h1, 1, t2, 0); b.wire(n, 0, t1, 0); b.wire(t1, 0, t2, 0)
  return b.diagram
}

/**
 * Arranque estrela-triângulo: K1 de linha, K3 em estrela e, após o tempo de K6, K2 em triângulo.
 * K2 e K3 encravam-se mutuamente (contactos NF), porque os dois juntos curto-circuitam as fases.
 */
export function starDeltaExample(): CommandsDiagram {
  const b = builder('Arranque estrela-triângulo')
  b.text(60, 0, 'Circuito de potência')
  const net = b.part('supply', 80, 40, '', { lines: ['L1', 'L2', 'L3'] })
  const f1 = b.part('fuse3', 80, 60, 'F1')
  const k1 = b.part('contact3', 80, 160, 'K1')
  const f7 = b.part('thermal3', 80, 300, 'F7')
  const m1 = b.part('motor6', 80, 440, 'M1')
  for (let i = 0; i < 3; i++) b.wire(net, i, f1, i * 2)
  b.wire3(f1, k1)
  // Saída de K1: alimenta o térmico (U1 V1 W1) e o contactor de triângulo K2.
  const nu = b.node(80, 240), nv = b.node(100, 260), nw = b.node(120, 280)
  b.wire(k1, 1, nu, 0); b.wire(k1, 3, nv, 0); b.wire(k1, 5, nw, 0)
  b.wire(nu, 0, f7, 0); b.wire(nv, 0, f7, 2); b.wire(nw, 0, f7, 4)
  for (let i = 0; i < 3; i++) b.wire(f7, i * 2 + 1, m1, i)
  const k2 = b.part('contact3', 220, 380, 'K2')
  b.wire(nu, 0, k2, 0, 240); b.wire(nv, 0, k2, 2, 260); b.wire(nw, 0, k2, 4, 280)
  // Triângulo: U1-W2, V1-U2, W1-V2 (W2 V2 U2 à direita do motor).
  const nW2 = b.node(220, 480), nV2 = b.node(200, 500), nU2 = b.node(180, 520)
  b.wire(k2, 1, nW2, 0); b.wire(k2, 5, nV2, 0, 500); b.wire(k2, 3, nU2, 0, 520)
  b.wire(nW2, 0, m1, 5); b.wire(nV2, 0, m1, 4); b.wire(nU2, 0, m1, 3)
  // Estrela: K3 une U2 V2 W2.
  const k3 = b.part('contact3', 180, 560, 'K3')
  b.wire(nU2, 0, k3, 0); b.wire(nV2, 0, k3, 2); b.wire(nW2, 0, k3, 4)
  b.wire(k3, 1, k3, 3); b.wire(k3, 3, k3, 5)

  b.text(460, 0, 'Circuito de comando')
  const l1 = b.part('supply', 480, 40, '', { lines: ['L1'] })
  const f21 = b.part('fuse', 480, 60, 'F21')
  const f7nc = b.part('thermalNC', 480, 140, 'F7')
  const s0 = b.part('pushNC', 480, 220, 'S0')
  const p1 = b.node(480, 300)
  const s1 = b.part('pushNO', 480, 320, 'S1')
  const seal = b.part('contactNO', 560, 320, 'K1')
  const r1 = b.node(480, 420), r2 = b.node(560, 420), r3 = b.node(640, 420), r4 = b.node(720, 420), r5 = b.node(800, 420)
  b.wire(l1, 0, f21, 0); b.wire(f21, 1, f7nc, 0); b.wire(f7nc, 1, s0, 0); b.wire(s0, 1, p1, 0)
  b.wire(p1, 0, s1, 0); b.wire(p1, 0, seal, 0, 300)
  b.wire(s1, 1, r1, 0); b.wire(seal, 1, r2, 0)
  b.wire(r1, 0, r2, 0); b.wire(r2, 0, r3, 0); b.wire(r3, 0, r4, 0); b.wire(r4, 0, r5, 0)
  const k1c = b.part('coil', 480, 640, 'K1')
  const k6 = b.part('timerCoil', 560, 640, 'K6', { delayMs: 5000 })
  const k6nc = b.part('timedNC', 640, 460, 'K6')
  const k2nc = b.part('contactNC', 640, 540, 'K2')
  const k3c = b.part('coil', 640, 640, 'K3')
  const k6no = b.part('timedNO', 720, 460, 'K6')
  const k3nc = b.part('contactNC', 720, 540, 'K3')
  const k2c = b.part('coil', 720, 640, 'K2')
  const k1run = b.part('contactNO', 800, 460, 'K1', { labels: ['23', '24'] })
  const h1 = b.part('lamp', 800, 640, 'H1', { color: 'green' })
  b.wire(r1, 0, k1c, 0); b.wire(r2, 0, k6, 0)
  b.wire(r3, 0, k6nc, 0); b.wire(k6nc, 1, k2nc, 0); b.wire(k2nc, 1, k3c, 0)
  b.wire(r4, 0, k6no, 0); b.wire(k6no, 1, k3nc, 0); b.wire(k3nc, 1, k2c, 0)
  b.wire(r5, 0, k1run, 0); b.wire(k1run, 1, h1, 0)
  const n = b.part('supply', 400, 720, '', { lines: ['N'] })
  const bottom = [b.node(480, 720), b.node(560, 720), b.node(640, 720), b.node(720, 720), b.node(800, 720)]
  ;[k1c, k6, k3c, k2c, h1].forEach((load, i) => b.wire(load, 1, bottom[i], 0))
  b.wire(n, 0, bottom[0], 0)
  bottom.slice(1).forEach((node, i) => b.wire(bottom[i], 0, node, 0))
  return b.diagram
}

export const COMMANDS_EXAMPLES: Array<{ id: string; title: string; detail: string; build: () => CommandsDiagram }> = [
  { id: 'direct', title: 'Arranque direto', detail: 'Retenção pelo K1, paragem S1, relé térmico F1 e sinalizador de marcha.', build: directStartExample },
  { id: 'star-delta', title: 'Arranque estrela-triângulo', detail: 'K1 + K3 (estrela) e, após o tempo de K6, K2 (triângulo), com encravamentos.', build: starDeltaExample },
]
