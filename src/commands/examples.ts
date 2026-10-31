// Exemplos de esquemas de comando (didáticos, sem dados de clientes).
import type { CmdKind, CmdPart, CmdRotation, CommandsDiagram } from './model'
import { DEFAULT_PAGE_ID } from './pages'

function builder(name: string, pages?: Array<{ id: string; name: string }>) {
  const diagram: CommandsDiagram = {
    name,
    parts: [],
    wires: [],
    texts: [],
    ...(pages ? { pages } : {}),
  }
  let n = 0
  let activePage = pages?.[0]?.id ?? DEFAULT_PAGE_ID
  const setPage = (id: string) => { activePage = id }
  const part = (kind: CmdKind, x: number, y: number, tag = '', extra: Partial<CmdPart> = {}, rot: CmdRotation = 0) => {
    const p: CmdPart = { id: `p${++n}`, kind, x, y, rot, tag, page: activePage, ...extra }
    diagram.parts.push(p)
    return p
  }
  const node = (x: number, y: number) => part('node', x, y)
  const wire = (a: CmdPart, ta: number, b: CmdPart, tb: number, mid?: number) => {
    diagram.wires.push({
      id: `w${diagram.wires.length + 1}`,
      a: { part: a.id, term: ta },
      b: { part: b.id, term: tb },
      page: activePage,
      ...(mid !== undefined ? { mid } : {}),
    })
  }
  /** Liga os três polos de dois aparelhos trifásicos (bornes de baixo de `a` aos de cima de `b`). */
  const wire3 = (a: CmdPart, b: CmdPart, aBottom = true, bTop = true) => {
    for (let i = 0; i < 3; i++) wire(a, aBottom ? i * 2 + 1 : i * 2, b, bTop ? i * 2 : i * 2 + 1)
  }
  const text = (x: number, y: number, value: string) => {
    diagram.texts!.push({ id: `t${diagram.texts!.length + 1}`, x, y, text: value, page: activePage })
  }
  return { diagram, part, node, wire, wire3, text, setPage }
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
  b.wire(l1, 0, f2, 0); b.wire(f2, 1, f1nc, 0); b.wire(f1nc, 1, s1, 0); b.wire(s1, 1, p1, 0)
  b.wire(p1, 0, s2, 0); b.wire(p1, 0, seal, 0, 300)
  b.wire(s2, 1, r1, 0); b.wire(seal, 1, r2, 0)
  b.wire(r1, 0, r2, 0); b.wire(r2, 0, r3, 0)
  b.wire(r1, 0, coil, 0); b.wire(r3, 0, run, 0); b.wire(run, 1, h1, 0)
  const n = b.part('supply', 280, 620, '', { lines: ['N'] })
  const bottom = [b.node(320, 620), b.node(400, 620), b.node(480, 620)]
  b.wire(coil, 1, bottom[0], 0); b.wire(h1, 1, bottom[2], 0)
  b.wire(n, 0, bottom[0], 0); b.wire(bottom[0], 0, bottom[1], 0); b.wire(bottom[1], 0, bottom[2], 0)
  return b.diagram
}

/** Arranque estrela-triângulo clássico com temporizador e encravamentos. */
export function starDeltaExample(): CommandsDiagram {
  const b = builder('Arranque estrela-triângulo')
  b.text(60, 0, 'Circuito de potência')
  const net = b.part('supply', 80, 40, '', { lines: ['L1', 'L2', 'L3'] })
  const q1 = b.part('breaker3', 80, 60, 'Q1')
  const k1 = b.part('contact3', 80, 160, 'K1')
  const f7 = b.part('thermal3', 80, 260, 'F7')
  const m1 = b.part('motor6', 80, 360, 'M1')
  for (let i = 0; i < 3; i++) b.wire(net, i, q1, i * 2)
  b.wire3(q1, k1); b.wire3(k1, f7)
  for (let i = 0; i < 3; i++) b.wire(f7, i * 2 + 1, m1, i)

  const k2 = b.part('contact3', 220, 200, 'K2')
  const k3 = b.part('contact3', 220, 320, 'K3')
  const nU = b.node(180, 160), nV = b.node(180, 180), nW = b.node(180, 200)
  const nU2 = b.node(180, 320), nV2 = b.node(180, 340), nW2 = b.node(180, 360)
  b.wire(m1, 3, nU, 0); b.wire(m1, 4, nV, 0); b.wire(m1, 5, nW, 0)
  b.wire(nU, 0, k2, 0); b.wire(nV, 0, k2, 2); b.wire(nW, 0, k2, 4)
  b.wire(k2, 1, nU2, 0); b.wire(k2, 3, nV2, 0); b.wire(k2, 5, nW2, 0)
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

/** Inversão de marcha: dois contactores com encravamento elétrico. */
export function reversingStartExample(): CommandsDiagram {
  const b = builder('Inversão de marcha')
  b.text(40, 0, 'Potência')
  const net = b.part('supply', 60, 40, '', { lines: ['L1', 'L2', 'L3'] })
  const q1 = b.part('breaker3', 60, 60, 'Q1')
  const kf = b.part('contact3', 60, 160, 'KF')
  const kr = b.part('contact3', 200, 160, 'KR')
  const f1 = b.part('thermal3', 60, 280, 'F1')
  const m1 = b.part('motor3', 60, 380, 'M1')
  for (let i = 0; i < 3; i++) b.wire(net, i, q1, i * 2)
  b.wire3(q1, kf)
  // KR inverte duas fases: L1↔L3
  b.wire(q1, 1, kr, 0); b.wire(q1, 3, kr, 2); b.wire(q1, 5, kr, 4)
  b.wire(kr, 1, f1, 4); b.wire(kr, 3, f1, 2); b.wire(kr, 5, f1, 0)
  b.wire3(kf, f1)
  for (let i = 0; i < 3; i++) b.wire(f1, i * 2 + 1, m1, i)

  b.text(360, 0, 'Comando')
  const l1 = b.part('supply', 380, 40, '', { lines: ['L1'] })
  const fuse = b.part('fuse', 380, 60, 'F2')
  const f1nc = b.part('thermalNC', 380, 140, 'F1')
  const s0 = b.part('pushNC', 380, 220, 'S0')
  const p = b.node(380, 300)
  const sf = b.part('pushNO', 380, 320, 'SF')
  const sr = b.part('pushNO', 500, 320, 'SR')
  const sealF = b.part('contactNO', 380, 400, 'KF')
  const sealR = b.part('contactNO', 500, 400, 'KR')
  const interF = b.part('contactNC', 380, 480, 'KR')
  const interR = b.part('contactNC', 500, 480, 'KF')
  const coilF = b.part('coil', 380, 560, 'KF')
  const coilR = b.part('coil', 500, 560, 'KR')
  const hF = b.part('lamp', 380, 640, 'HF', { color: 'green' })
  const hR = b.part('lamp', 500, 640, 'HR', { color: 'yellow' })
  b.wire(l1, 0, fuse, 0); b.wire(fuse, 1, f1nc, 0); b.wire(f1nc, 1, s0, 0); b.wire(s0, 1, p, 0)
  b.wire(p, 0, sf, 0); b.wire(p, 0, sr, 0, 300)
  b.wire(sf, 1, sealF, 0); b.wire(p, 0, sealF, 0, 400)
  b.wire(sr, 1, sealR, 0); b.wire(p, 0, sealR, 0, 400)
  b.wire(sealF, 1, interF, 0); b.wire(interF, 1, coilF, 0)
  b.wire(sealR, 1, interR, 0); b.wire(interR, 1, coilR, 0)
  b.wire(coilF, 0, hF, 0, 560); b.wire(coilR, 0, hR, 0, 560)
  const n = b.part('supply', 340, 720, '', { lines: ['N'] })
  const b0 = b.node(380, 720), b1 = b.node(500, 720)
  b.wire(coilF, 1, b0, 0); b.wire(hF, 1, b0, 0); b.wire(coilR, 1, b1, 0); b.wire(hR, 1, b1, 0)
  b.wire(n, 0, b0, 0); b.wire(b0, 0, b1, 0)
  return b.diagram
}

/** Paragem de emergência em série com o circuito de comando. */
export function emergencyStopExample(): CommandsDiagram {
  const b = builder('Paragem de emergência')
  b.text(40, 0, 'Potência')
  const net = b.part('supply', 60, 40, '', { lines: ['L1', 'L2', 'L3'] })
  const q1 = b.part('breaker3', 60, 60, 'Q1')
  const k1 = b.part('contact3', 60, 160, 'K1')
  const f1 = b.part('thermal3', 60, 260, 'F1')
  const m1 = b.part('motor3', 60, 360, 'M1')
  for (let i = 0; i < 3; i++) b.wire(net, i, q1, i * 2)
  b.wire3(q1, k1); b.wire3(k1, f1)
  for (let i = 0; i < 3; i++) b.wire(f1, i * 2 + 1, m1, i)

  b.text(300, 0, 'Comando com emergência')
  const l1 = b.part('supply', 320, 40, '', { lines: ['L1'] })
  const fuse = b.part('fuse', 320, 60, 'F2')
  const em = b.part('emergency', 320, 140, 'S0')
  const f1nc = b.part('thermalNC', 320, 220, 'F1')
  const s1 = b.part('pushNC', 320, 300, 'S1')
  const p = b.node(320, 380)
  const s2 = b.part('pushNO', 320, 400, 'S2')
  const seal = b.part('contactNO', 400, 400, 'K1')
  const coil = b.part('coil', 320, 500, 'K1')
  const hRun = b.part('lamp', 400, 500, 'H1', { color: 'green' })
  const hEm = b.part('lamp', 480, 500, 'H0', { color: 'red' })
  b.wire(l1, 0, fuse, 0); b.wire(fuse, 1, em, 0); b.wire(em, 1, f1nc, 0); b.wire(f1nc, 1, s1, 0); b.wire(s1, 1, p, 0)
  b.wire(p, 0, s2, 0); b.wire(p, 0, seal, 0, 380)
  b.wire(s2, 1, coil, 0); b.wire(seal, 1, coil, 0)
  b.wire(coil, 0, hRun, 0, 500)
  // Lâmpada de emergência alimentada a montante do cogumelo (fica acesa se o circuito a jusante abrir — simplificado: ramo paralelo após fusível)
  const pEm = b.node(480, 140)
  b.wire(fuse, 1, pEm, 0, 140); b.wire(pEm, 0, hEm, 0)
  const n = b.part('supply', 280, 600, '', { lines: ['N'] })
  const b0 = b.node(320, 600), b1 = b.node(400, 600), b2 = b.node(480, 600)
  b.wire(coil, 1, b0, 0); b.wire(hRun, 1, b1, 0); b.wire(hEm, 1, b2, 0)
  b.wire(n, 0, b0, 0); b.wire(b0, 0, b1, 0); b.wire(b1, 0, b2, 0)
  return b.diagram
}

/** Arranque temporizado: a bobina do motor só fecha após o tempo de K6. */
export function delayedStartExample(): CommandsDiagram {
  const b = builder('Arranque temporizado')
  b.text(40, 0, 'Potência')
  const net = b.part('supply', 60, 40, '', { lines: ['L1', 'L2', 'L3'] })
  const q1 = b.part('breaker3', 60, 60, 'Q1')
  const k1 = b.part('contact3', 60, 160, 'K1')
  const f1 = b.part('thermal3', 60, 260, 'F1')
  const m1 = b.part('motor3', 60, 360, 'M1')
  for (let i = 0; i < 3; i++) b.wire(net, i, q1, i * 2)
  b.wire3(q1, k1); b.wire3(k1, f1)
  for (let i = 0; i < 3; i++) b.wire(f1, i * 2 + 1, m1, i)

  b.text(300, 0, 'Comando com temporizador')
  const l1 = b.part('supply', 320, 40, '', { lines: ['L1'] })
  const fuse = b.part('fuse', 320, 60, 'F2')
  const s1 = b.part('pushNC', 320, 140, 'S1')
  const p = b.node(320, 220)
  const s2 = b.part('pushNO', 320, 240, 'S2')
  const seal = b.part('contactNO', 400, 240, 'K0')
  const k0 = b.part('coil', 320, 340, 'K0')
  const k6 = b.part('timerCoil', 400, 340, 'K6', { delayMs: 3000 })
  const tNO = b.part('timedNO', 320, 440, 'K6')
  const k1c = b.part('coil', 320, 520, 'K1')
  const h1 = b.part('lamp', 400, 520, 'H1', { color: 'green' })
  const hWait = b.part('lamp', 480, 340, 'H2', { color: 'yellow' })
  b.wire(l1, 0, fuse, 0); b.wire(fuse, 1, s1, 0); b.wire(s1, 1, p, 0)
  b.wire(p, 0, s2, 0); b.wire(p, 0, seal, 0, 220)
  b.wire(s2, 1, k0, 0); b.wire(seal, 1, k0, 0)
  b.wire(k0, 0, k6, 0, 340); b.wire(k0, 0, hWait, 0, 340)
  b.wire(p, 0, tNO, 0, 440); b.wire(tNO, 1, k1c, 0); b.wire(k1c, 0, h1, 0, 520)
  const n = b.part('supply', 280, 600, '', { lines: ['N'] })
  const bottoms = [b.node(320, 600), b.node(400, 600), b.node(480, 600)]
  b.wire(k0, 1, bottoms[0], 0); b.wire(k6, 1, bottoms[1], 0); b.wire(k1c, 1, bottoms[0], 0)
  b.wire(h1, 1, bottoms[1], 0); b.wire(hWait, 1, bottoms[2], 0)
  b.wire(n, 0, bottoms[0], 0); b.wire(bottoms[0], 0, bottoms[1], 0); b.wire(bottoms[1], 0, bottoms[2], 0)
  return b.diagram
}

/** Painel de sinalização: botões iluminados, seletor e lâmpadas. */
export function signalingPanelExample(): CommandsDiagram {
  const b = builder('Painel de sinalização')
  b.text(40, 0, 'Alimentação 24 V')
  const p24 = b.part('supply', 60, 40, '', { lines: ['+24V'] })
  const fuse = b.part('fuse', 60, 60, 'F1')
  b.wire(p24, 0, fuse, 0)

  b.text(40, 120, 'Comando local')
  const s1 = b.part('pushIllum', 60, 160, 'S1', { color: 'green' })
  const s2 = b.part('pushIllum', 140, 160, 'S2', { color: 'red' })
  const sel = b.part('selector', 220, 160, 'S3')
  const lim = b.part('limitNO', 300, 160, 'B1')
  // Contactos NA (13-14)
  b.wire(fuse, 1, s1, 0); b.wire(fuse, 1, s2, 0, 160); b.wire(fuse, 1, sel, 0, 160); b.wire(fuse, 1, lim, 0, 160)
  // Lâmpadas integradas dos botões (X1-X2) sempre alimentadas a 24 V
  b.wire(fuse, 1, s1, 2, 160); b.wire(fuse, 1, s2, 2, 160)

  const k1 = b.part('coil', 60, 280, 'K1')
  const k2 = b.part('coil', 140, 280, 'K2')
  b.wire(s1, 1, k1, 0); b.wire(s2, 1, k2, 0)
  b.wire(sel, 1, k1, 0, 280); b.wire(lim, 1, k2, 0, 280)

  b.text(40, 360, 'Sinalização')
  const h1 = b.part('lamp', 60, 400, 'H1', { color: 'green' })
  const h2 = b.part('lamp', 140, 400, 'H2', { color: 'red' })
  const h3 = b.part('lamp', 220, 400, 'H3', { color: 'yellow' })
  const buzz = b.part('buzzer', 300, 400, 'H4')
  const c1 = b.part('contactNO', 60, 360, 'K1')
  const c2 = b.part('contactNO', 140, 360, 'K2')
  b.wire(fuse, 1, c1, 0, 360); b.wire(c1, 1, h1, 0)
  b.wire(fuse, 1, c2, 0, 360); b.wire(c2, 1, h2, 0)
  b.wire(fuse, 1, h3, 0, 400); b.wire(fuse, 1, buzz, 0, 400)

  const n = b.part('supply', 40, 500, '', { lines: ['0V'] })
  const row = [b.node(60, 500), b.node(140, 500), b.node(220, 500), b.node(300, 500), b.node(80, 500), b.node(160, 500)]
  b.wire(k1, 1, row[0], 0); b.wire(k2, 1, row[1], 0)
  b.wire(h1, 1, row[0], 0); b.wire(h2, 1, row[1], 0); b.wire(h3, 1, row[2], 0); b.wire(buzz, 1, row[3], 0)
  // Retorno 0 V das lâmpadas dos botões iluminados (X2)
  b.wire(s1, 3, row[4], 0); b.wire(s2, 3, row[5], 0)
  b.wire(n, 0, row[0], 0)
  row.slice(1).forEach((nd, i) => b.wire(row[i], 0, nd, 0))
  return b.diagram
}

/** Duas páginas ligadas por referência de potencial (pageRef). */
export function multiPageExample(): CommandsDiagram {
  const pages = [
    { id: 'page-1', name: 'Potência' },
    { id: 'page-2', name: 'Comando' },
  ]
  const b = builder('Esquema em 2 páginas', pages)

  // Página 1 — potência
  b.setPage('page-1')
  b.text(40, 0, 'Página 1 — potência')
  const net = b.part('supply', 60, 40, '', { lines: ['L1', 'L2', 'L3'] })
  const q1 = b.part('breaker3', 60, 60, 'Q1')
  const k1 = b.part('contact3', 60, 160, 'K1')
  const f1 = b.part('thermal3', 60, 260, 'F1')
  const m1 = b.part('motor3', 60, 360, 'M1')
  for (let i = 0; i < 3; i++) b.wire(net, i, q1, i * 2)
  b.wire3(q1, k1); b.wire3(k1, f1)
  for (let i = 0; i < 3; i++) b.wire(f1, i * 2 + 1, m1, i)
  // Conectores para o comando
  const xL = b.part('pageRef', 280, 60, 'L1')
  const xN = b.part('pageRef', 280, 140, 'N')
  const xK = b.part('pageRef', 280, 220, 'K1-A1')
  b.wire(net, 0, xL, 0)
  const nRail = b.part('supply', 200, 420, '', { lines: ['N'] })
  b.wire(nRail, 0, xN, 0)
  // bobina K1 nesta página ligada ao conector
  const coil = b.part('coil', 200, 300, 'K1')
  b.wire(xK, 0, coil, 0); b.wire(coil, 1, xN, 0)

  // Página 2 — comando
  b.setPage('page-2')
  b.text(40, 0, 'Página 2 — comando (ligado por L1 / N / K1-A1)')
  const yL = b.part('pageRef', 60, 40, 'L1')
  const yN = b.part('pageRef', 60, 420, 'N')
  const yK = b.part('pageRef', 300, 300, 'K1-A1')
  const fuse = b.part('fuse', 60, 80, 'F2')
  const f1nc = b.part('thermalNC', 60, 160, 'F1')
  const s1 = b.part('pushNC', 60, 240, 'S1')
  const p = b.node(60, 300)
  const s2 = b.part('pushNO', 60, 320, 'S2')
  const seal = b.part('contactNO', 140, 320, 'K1')
  const h1 = b.part('lamp', 220, 320, 'H1', { color: 'green' })
  b.wire(yL, 0, fuse, 0); b.wire(fuse, 1, f1nc, 0); b.wire(f1nc, 1, s1, 0); b.wire(s1, 1, p, 0)
  b.wire(p, 0, s2, 0); b.wire(p, 0, seal, 0, 300)
  b.wire(s2, 1, yK, 0); b.wire(seal, 1, yK, 0)
  b.wire(p, 0, h1, 0, 320); b.wire(h1, 1, yN, 0)
  return b.diagram
}

/** Cilindro pneumático de duplo efeito com válvula 5/2. */
export function pneumaticCylinderExample(): CommandsDiagram {
  const b = builder('Cilindro pneumático 5/2')
  b.text(40, 0, 'Circuito pneumático')
  const air = b.part('airSource', 60, 40, 'P')
  const v = b.part('valve52', 60, 100, 'V1')
  const cyl = b.part('cylDE', 200, 100, 'A1')
  const ex1 = b.part('exhaust', 40, 200, 'R1')
  const ex2 = b.part('exhaust', 40, 260, 'R2')
  b.wire(air, 0, v, 0)
  b.wire(v, 1, cyl, 0)
  b.wire(v, 2, cyl, 1)
  b.wire(v, 3, ex1, 0)
  b.wire(v, 4, ex2, 0)

  b.text(40, 320, 'Comando elétrico da válvula')
  const l1 = b.part('supply', 60, 360, '', { lines: ['+24V'] })
  const fuse = b.part('fuse', 60, 380, 'F1')
  const s1 = b.part('pushNO', 60, 460, 'S1')
  const s2 = b.part('pushNO', 160, 460, 'S2')
  const solA = b.part('solenoid', 60, 540, 'Y1')
  const solB = b.part('solenoid', 160, 540, 'Y2')
  b.wire(l1, 0, fuse, 0); b.wire(fuse, 1, s1, 0); b.wire(fuse, 1, s2, 0, 460)
  b.wire(s1, 1, solA, 0); b.wire(s2, 1, solB, 0)
  const n = b.part('supply', 40, 620, '', { lines: ['0V'] })
  const b0 = b.node(60, 620), b1 = b.node(160, 620)
  b.wire(solA, 1, b0, 0); b.wire(solB, 1, b1, 0)
  b.wire(n, 0, b0, 0); b.wire(b0, 0, b1, 0)
  return b.diagram
}

export type CommandsExampleCategory = 'motores' | 'seguranca' | 'sinalizacao' | 'avancado'

export interface CommandsExampleInfo {
  id: string
  title: string
  detail: string
  category: CommandsExampleCategory
  /** 1 = básico, 2 = intermédio, 3 = avançado */
  level: 1 | 2 | 3
  order: number
  tag?: string
  build: () => CommandsDiagram
}

/** Metadados alinhados ao diálogo de modelos do GRAFCET (categorias + nível). */
export const COMMANDS_EXAMPLE_CATEGORIES: Array<{ id: CommandsExampleCategory; label: string; hint: string }> = [
  { id: 'motores', label: 'Motores e arranques', hint: 'Partidas industriais com contactores e temporização' },
  { id: 'seguranca', label: 'Segurança', hint: 'Paragens e encravamentos de proteção' },
  { id: 'sinalizacao', label: 'Sinalização e painel', hint: 'Botões, lâmpadas e seletores' },
  { id: 'avancado', label: 'Avançado', hint: 'Várias páginas e circuitos mistos' },
]

export const COMMANDS_EXAMPLES: CommandsExampleInfo[] = [
  { id: 'direct', title: 'Arranque direto', detail: 'Retenção pelo K1, paragem S1, relé térmico F1 e sinalizador de marcha.', category: 'motores', level: 1, order: 1, tag: 'Retenção', build: directStartExample },
  { id: 'star-delta', title: 'Arranque estrela-triângulo', detail: 'K1 + K3 (estrela) e, após o tempo de K6, K2 (triângulo), com encravamentos.', category: 'motores', level: 2, order: 2, tag: 'Temporizador', build: starDeltaExample },
  { id: 'reversing', title: 'Inversão de marcha', detail: 'Dois contactores KF/KR com encravamento elétrico e sinalização de sentido.', category: 'motores', level: 2, order: 3, tag: 'Encravamento', build: reversingStartExample },
  { id: 'delayed', title: 'Arranque temporizado', detail: 'Temporizador K6 (3 s) antes de fechar o contactor do motor.', category: 'motores', level: 1, order: 4, tag: 'TON', build: delayedStartExample },
  { id: 'emergency', title: 'Paragem de emergência', detail: 'Cogumelo S0 em série no comando, lâmpada de emergência e retenção K1.', category: 'seguranca', level: 1, order: 1, tag: 'S0', build: emergencyStopExample },
  { id: 'signaling', title: 'Painel de sinalização', detail: 'Botões iluminados, seletor, fim-de-curso, lâmpadas e buzzer a 24 V.', category: 'sinalizacao', level: 2, order: 1, build: signalingPanelExample },
  { id: 'multipage', title: 'Duas páginas (potência + comando)', detail: 'Potência e comando em folhas separadas, unidos por ligações entre páginas.', category: 'avancado', level: 3, order: 1, tag: 'Páginas', build: multiPageExample },
  { id: 'pneumatic', title: 'Cilindro pneumático 5/2', detail: 'Fonte de ar, válvula 5/2, cilindro de duplo efeito e solenoides de comando.', category: 'avancado', level: 2, order: 2, tag: 'Pneumática', build: pneumaticCylinderExample },
]
