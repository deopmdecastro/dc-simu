/**
 * Projeto nativo #2 — Estrela-Triângulo com LOGO! (QE1) — v2
 * 800×600×250, calhas, bornes de passagem p/ E/S, espiral porta, filaças, etiquetas
 */
import { createComponent } from '../electrical/factory'
import type { ElectricalComponent, Wire, WireColor } from '../types'
import { nanoid } from 'nanoid'
import { autoLayout, SPINE_X } from '../grafcet/layout'
import type { GrafcetProgram, GrafcetStep, GrafcetTransition } from '../grafcet/engine'
import { bakeNativeRouting } from './nativeRouting'
import { syncMounted } from '../three/thermalMount'
import { SCHEMATIC_PX_PER_MM } from '../three/modelPaths'

export const NATIVE_ESTRELA_ID = 'native-estrela-triangulo-v1'
export const NATIVE_ESTRELA_FEATURE = 'estrela-triangulo-v3-layout-circuit'
export const NATIVE_ESTRELA_NAME = 'Estrela-Triângulo com LOGO! (QE1)'

function tid(c: ElectricalComponent, label: string): string {
  const t = c.terminals.find((x) => x.label === label)
  if (!t) throw new Error(`Borne ${c.ref}.${label} em falta (tem ${c.terminals.map(z=>z.label).join(',')})`)
  return t.id
}
function mkWire(from: string, to: string, color: WireColor, num: string, gauge = '1.5mm²'): Wire {
  return {
    id: nanoid(8), fromTerminalId: from, toTerminalId: to, color, gauge,
    kind: color === 'green-yellow' ? 'earth' : (color === 'red' || color === 'black' || color === 'brown') ? 'power' as const : 'control' as const,
    flexibility: 'flexible' as const, endType: 'ferrule' as const, fromEndType: 'ferrule' as const, toEndType: 'ferrule' as const,
    fromEndLayer: 'back' as const, toEndLayer: 'back' as const,
    route: 'orthogonal' as const, bend: 0.5, curveOffset: 0, number: num, energized: false,
  }
}

export function buildNativeEstrelaTriangulo(): {
  components: ElectricalComponent[]
  wires: Wire[]
  grafcet: GrafcetProgram
  tags: Array<{ id: string; address: string; name: string; dataType: string; comment: string }>
} {
  // ── Quadro ──
  const qe = createComponent('panelEnclosure', 'QE1', 'Quadro Estrela-Triângulo')
  qe.w = 800*SCHEMATIC_PX_PER_MM; qe.h = 600*SCHEMATIC_PX_PER_MM
  qe.state = { ...(qe.state as any), widthMm: 800, heightMm: 600, depthMm: 250, hingeSide: 'right', doorOpen: false, bodyColor: '#cfd1cb', plateColor: '#e5e7eb' }
  qe.decals = [
    { id:'dec-qe1-warn', kind:'warning', face:'door', offsetXmm:0, offsetYmm:160, widthMm:120, heightMm:28, text:' PERIGO 400V ', icon:'bolt', background:'#facc15', color:'#0f172a', border:true },
    { id:'dec-qe1-ce', kind:'logo', face:'door', offsetXmm:0, offsetYmm:-250, widthMm:48, heightMm:20, text:'CE 0081', background:'#22c55e', color:'#fff', border:false },
    { id:'dec-qe1-id', kind:'text', face:'door', offsetXmm:-280, offsetYmm:-250, widthMm:90, heightMm:16, text:'QE1 400V/16A', background:'#0f172a', color:'#fff' },
    { id:'dec-qe1-doc', kind:'text', face:'door', offsetXmm:260, offsetYmm:-250, widthMm:70, heightMm:16, text:'IP65 IK08', background:'#334155', color:'#fff' },
  ]

  const rail = createComponent('dinRail15x55', 'R1', 'Calha DIN'); (rail.state as any).lengthMm = 650
  const ductH = createComponent('cableDuct', 'D1', 'Calha 40×60 H'); ductH.w=650/1.5; ductH.h=25; (ductH.state as any)={ lengthMm:650, widthMm:40, heightMm:60, coverOn:true }
  const ductV = createComponent('cableDuct', 'D2', 'Calha 25×60 V'); ductV.w=22; ductV.h=380/1.5; (ductV.state as any)={ lengthMm:380, widthMm:25, heightMm:60, coverOn:true }
  // Espiral porta (proteção cabo porta)
  const esp = createComponent('spiralWrap', 'ESP1', 'Espiral porta Ø16'); (esp.state as any)={ lengthMm: 320, innerDiaMm: 16, pitchMm: 8, color:'#0a0a0a' }

  // ── Força ──
  const xg = createComponent('powerSource3ph', 'XG', 'Rede 400V 3+N+PE')
  const q0 = createComponent('breaker3p', 'Q0', 'Geral trifásico 25A'); (q0.state as any).inA = 25; (q0.state as any).curve='C'
  const qm = createComponent('motorBreakerPkzmC10', 'QM1', 'Disjuntor-motor 6,3-10A'); (qm.state as any).inA = 10
  const km1 = createComponent('contactor', 'KM1', 'Linha')
  const km2 = createComponent('contactor', 'KM2', 'Triângulo')
  const km3 = createComponent('contactor', 'KM3', 'Estrela')
  km2.state.interlockWith = km3.id; km3.state.interlockWith = km2.id
  for (const c of [km1, km2, km3]) {
    c.label += ' · bobina 230 V AC'
    for (const t of c.terminals) if (t.label === 'A1' || t.label === 'A2') t.electricalClass = 'ac'
  }
  const f1 = createComponent('thermalRelay', 'F1', 'Térmico 7,5A'); (f1.state as any).currentA = 7.5
  ;(f1 as any).mountedOn = km1.id
  const m1 = createComponent('motor3ph', 'M1', 'Motor 4kW 400V'); (m1.state as any).motorConnection='star'

  // ── Comando 24V + LOGO ──
  const qf1 = createComponent('breaker1p', 'QF1', 'Monofásico comando 6A'); (qf1.state as any).inA = 6; (qf1.state as any).curve='C'
  const qf2 = createComponent('breaker1p', 'QF2', 'Comando contactores 2A'); (qf2.state as any).inA = 2
  const ps = createComponent('powerSupplyProauto24A', 'G1', 'Fonte 24V 5A / 120W')
  const plc = createComponent('plcSiemensLogo1224RC', 'A1', 'LOGO! 12/24RCE')
  // ── Régua de bornes ──
  const xb1 = createComponent('terminalSet3ph', 'X1', 'Borne força L1/L2/L3')
  const xb2 = createComponent('terminalSet3ph', 'X2', 'Borne motor U/V/W')
  const xb3 = createComponent('terminalSet24v', 'X3', 'Borne 24V distrib.')
  // Bornes de passagem para E/S do PLC (fila dupla, Push-in PTI6)
  // X4 = entradas (5 bornes), X5 = saídas (6 bornes)
  const mkBorne = (ref: string, label: string) => {
    const b = createComponent('terminalPhoenixPti6', ref, label)
    b.decals = [{ id:`d-${ref}`, kind:'text', face:'front', text: ref, background:'#eef2ff', color:'#0f172a', widthMm:14, heightMm:7, offsetYmm:10 }]
    return b
  }
  const x4_1 = mkBorne('X4:1', 'I0.0 START')
  const x4_2 = mkBorne('X4:2', 'I0.1 STOP')
  const x4_3 = mkBorne('X4:3', 'I0.2 B0')
  const x4_4 = mkBorne('X4:4', 'I0.3 AUTO')
  const x4_5 = mkBorne('X4:5', 'I0.4 F1')
  const x5_1 = mkBorne('X5:1', 'Q0.0 KM1')
  const x5_2 = mkBorne('X5:2', 'Q0.1 KM2 Δ')
  const x5_3 = mkBorne('X5:3', 'Q0.2 KM3 Y')
  const x5_4 = mkBorne('X5:4', 'Q0.3 H1')
  const x5_5 = mkBorne('X5:5', 'KM3 13-14 H3')
  const x5_6 = mkBorne('X5:6', 'F1 97-98 H2 falha')

  // ── Operadores porta (panelMount Ø22) ──
  const h1 = createComponent('pilotLightAd22', 'H1', 'Marcha verde')
  const h2 = createComponent('pilotLightAd22', 'H2', 'Falha vermelho')
  const h3 = createComponent('pilotLightAd22', 'H3', 'Estrela laranja')
  h1.state.color = '#22c55e'; h2.state.color = '#ef4444'; h3.state.color = '#f59e0b'
  const s1Btn = createComponent('buttonNO', 'S1', 'START verde')
  const s0Btn = createComponent('buttonNC', 'S0', 'STOP vermelho')
  const emer = createComponent('emergencyButton', 'B0', 'Emergência NF')
  const sel = createComponent('selector2', 'S3', 'Auto/Manual')

  // Layout: ocupa os 600 mm de altura do QE1 sem deixar topo vazio,
  // com as 3 calhas distribuídas e as calhas a cobrir os feixes.
  const place = (c: ElectricalComponent, x: number, y: number) => {
    c.schematicX = 1000 + x * SCHEMATIC_PX_PER_MM - c.w / 2
    c.schematicY = 700 - y * SCHEMATIC_PX_PER_MM - c.h / 2
  }
  place(qe, 0, 0)
  // 3 calhas: topo (força), meio (comando), base (bornes) — preenchem o quadro
  rail.w = 620 * SCHEMATIC_PX_PER_MM; place(rail, 0, 180)
  const rail2 = createComponent('dinRail15x55', 'R2', 'Calha DIN comando')
  const rail3 = createComponent('dinRail15x55', 'R3', 'Calha DIN bornes')
  for (const r of [rail2, rail3]) { r.state.lengthMm = 620; r.w = rail.w }
  place(rail2, 0, 20); place(rail3, 0, -170)
  // Calhas: H topo, H meia, V lateral — todas com tampa e dentro do quadro
  ductH.w = 620 * SCHEMATIC_PX_PER_MM; ductH.h = 32 * SCHEMATIC_PX_PER_MM
  place(ductH, 0, 245)
  const ductM = createComponent('cableDuct', 'D3', 'Calha 40×60 M'); ductM.w = ductH.w; ductM.h = ductH.h; (ductM.state as any)={ lengthMm:620, widthMm:40, heightMm:60, coverOn:true }
  place(ductM, 0, 95)
  ductV.rotation = 90; ductV.w = 520 * SCHEMATIC_PX_PER_MM; ductV.h = 28 * SCHEMATIC_PX_PER_MM
  place(ductV, 330, 15)
  const ductV2 = createComponent('cableDuct', 'D4', 'Calha 25×60 V2'); ductV2.rotation = 90; ductV2.w = ductV.w; ductV2.h = ductV.h; (ductV2.state as any)={ lengthMm:520, widthMm:25, heightMm:60, coverOn:true }
  place(ductV2, -330, 15)
  place(esp, -340, -80)
  const row = (r: ElectricalComponent, y: number, items: Array<[ElectricalComponent, number]>) => {
    for (const [c, x] of items) { place(c, x, y); (c as any).railId = r.id; c.mountedOn = undefined }
  }
  // Topo: força bem distribuída (6 aparelhos em 620 mm → 100 mm passo)
  row(rail, 180, [[xg,-260],[q0,-180],[qm,-100],[km1,-10],[km2,95],[km3,200]])
  // F1 encaixa mesmo por baixo do KM1 (mesma coluna, sem rail próprio)
  place(f1, -10, 118); f1.mountedOn = km1.id; (f1 as any).railId = undefined
  // Meio: comando + distribuição
  row(rail2, 20, [[qf1,-260],[qf2,-210],[ps,-110],[plc,80],[xb1,190],[xb2,260],[xb3,320]])
  // Base: régua de bornes compacta (11 bornes em 620 mm → 56 mm passo, sem sobrepor)
  row(rail3, -170, [[x4_1,-250],[x4_2,-200],[x4_3,-150],[x4_4,-100],[x4_5,-50],
    [x5_1,40],[x5_2,90],[x5_3,140],[x5_4,190],[x5_5,240],[x5_6,290]])
  place(m1, 580, -40)
  // Porta: zona dedicada mas próxima (base 1350 em vez de 1700 → -350 px, fios encurtam 50%)
  for (const [c, x, y] of [[h1,-160,80],[h2,0,80],[h3,160,80],[s1Btn,-160,-20],
    [s0Btn,0,-20],[sel,160,-20],[emer,0,-120]] as Array<[ElectricalComponent,number,number]>) {
    c.schematicX = 1380 + (x + 160) * 1.05
    c.schematicY = y == 80 ? 300 : y == -20 ? 410 : 520
    c.panelMount = { enclosureId: qe.id, face:'doorOuter', offsetXmm:x, offsetYmm:y, cutoutMm:22 }
  }

  // ── Etiquetas equipamentos (decals) ──
  km1.decals=[{ id:'dkm1', kind:'text', face:'front', text:'KM1 LINHA', background:'#0f172a', color:'#fff', widthMm:32, heightMm:10, offsetYmm:18 }]
  km2.decals=[{ id:'dkm2', kind:'text', face:'front', text:'KM2 Δ', background:'#0f172a', color:'#fff', widthMm:24, heightMm:10, offsetYmm:18 }]
  km3.decals=[{ id:'dkm3', kind:'text', face:'front', text:'KM3 Y', background:'#1e3a8a', color:'#fff', widthMm:24, heightMm:10, offsetYmm:18 }]
  q0.decals=[{ id:'dq0', kind:'symbol', face:'front', text:'Q0 25A C', icon:'bolt', background:'#facc15', color:'#0f172a', widthMm:26, heightMm:12 }]
  qm.decals=[{ id:'dqm1', kind:'text', face:'front', text:'QM1 6,3-10A', background:'#dc2626', color:'#fff', widthMm:34, heightMm:10, offsetYmm:18 }]
  qf1.decals=[{ id:'dqf1', kind:'symbol', face:'front', text:'QF1 6A', icon:'bolt', background:'#0ea5e9', color:'#fff', widthMm:20, heightMm:10 }]
  qf2.decals=[{ id:'dqf2', kind:'symbol', face:'front', text:'QF2 2A', icon:'bolt', background:'#64748b', color:'#fff', widthMm:20, heightMm:10 }]
  ps.decals=[{ id:'dps1', kind:'text', face:'front', text:'G1 24V 5A', background:'#0f172a', color:'#fff', widthMm:30, heightMm:10, offsetYmm:22 }]
  plc.decals=[{ id:'dplc1', kind:'text', face:'front', text:'A1 LOGO!', background:'#0e7490', color:'#fff', widthMm:30, heightMm:10, offsetYmm:20 }]
  xb1.decals=[{ id:'dxb1', kind:'text', face:'front', text:'X1 FORÇA', background:'#f8fafc', color:'#0f172a', widthMm:28, heightMm:8, offsetYmm:12 }]
  xb2.decals=[{ id:'dxb2', kind:'text', face:'front', text:'X2 MOTOR', background:'#f8fafc', color:'#0f172a', widthMm:28, heightMm:8, offsetYmm:12 }]
  xb3.decals=[{ id:'dxb3', kind:'text', face:'front', text:'X3 24V', background:'#e0f2fe', color:'#0c4a6e', widthMm:22, heightMm:8, offsetYmm:12 }]
  xg.decals=[{ id:'dxg', kind:'text', face:'front', text:'XG REDE', background:'#fef3c7', color:'#92400e', widthMm:26, heightMm:8, offsetYmm:14 }]
  m1.decals=[{ id:'dm1', kind:'text', face:'front', text:'M1 4kW Y/Δ', background:'#14532d', color:'#fff', widthMm:32, heightMm:10, offsetYmm:16 }]
  f1.decals=[{ id:'df1', kind:'text', face:'front', text:'F1 7,5A', background:'#a16207', color:'#fff', widthMm:22, heightMm:8, offsetYmm:14 }]
  // Etiquetas porta (gravadas)
  h1.decals=[{ id:'dh1', kind:'text', face:'front', text:'H1 MARCHA', background:'#022c22', color:'#fff', widthMm:28, heightMm:8, offsetYmm:14 }]
  h2.decals=[{ id:'dh2', kind:'text', face:'front', text:'H2 FALHA', background:'#450a0a', color:'#fff', widthMm:28, heightMm:8, offsetYmm:14 }]
  h3.decals=[{ id:'dh3', kind:'text', face:'front', text:'H3 ESTRELA', background:'#431407', color:'#fff', widthMm:28, heightMm:8, offsetYmm:14 }]
  s1Btn.decals=[{ id:'ds1', kind:'text', face:'front', text:'S1 START', background:'#14532d', color:'#fff', widthMm:26, heightMm:8, offsetYmm:14 }]
  s0Btn.decals=[{ id:'ds0', kind:'text', face:'front', text:'S0 STOP', background:'#7f1d1d', color:'#fff', widthMm:26, heightMm:8, offsetYmm:14 }]
  emer.decals=[{ id:'db0', kind:'text', face:'front', text:'B0 EMERG', background:'#dc2626', color:'#fff', widthMm:28, heightMm:8, offsetYmm:16 }]
  sel.decals=[{ id:'ds3', kind:'text', face:'front', text:'S3 AUTO/MAN', background:'#1e293b', color:'#fff', widthMm:32, heightMm:8, offsetYmm:14 }]

  // F1 fica encaixado sob KM1
  f1.mountedOn = km1.id
  // Garante que as calhas ficam por trás dos aparelhos no 3D/esquema
  for (const d of [ductH, ductM, ductV, ductV2]) (d as any).zIndex = -1
  const components: ElectricalComponent[] = [
    qe, rail, rail2, rail3, ductH, ductM, ductV, ductV2, esp,
    xg,q0,qm,km1,f1,km2,km3,m1,
    qf1,qf2,ps,plc,
    xb1,xb2,xb3,
    x4_1,x4_2,x4_3,x4_4,x4_5, x5_1,x5_2,x5_3,x5_4,x5_5,x5_6,
    h1,h2,h3,s1Btn,s0Btn,emer,sel
  ]

  // ── Cablagem ──
  const wires: Wire[] = []
  const add = (a: ElectricalComponent, al: string, b: ElectricalComponent, bl: string, color: WireColor, num: string, gauge?: string) => {
    wires.push(mkWire(tid(a, al), tid(b, bl), color, num, gauge))
  }

  // Força: Rede → Q0 → QM1 → KM1 → F1 → KM2 (filaça dentro da calha = filaça/ferrule com numeração)
  add(xb1,'L1-OUT',q0,'1','black','W01','4mm²'); add(xb1,'L2-OUT',q0,'3','black','W02','4mm²'); add(xb1,'L3-OUT',q0,'5','black','W03','4mm²')
  add(q0,'2',qm,'1','black','W04','4mm²'); add(q0,'4',qm,'3','black','W05','4mm²'); add(q0,'6',qm,'5','black','W06','4mm²')
  add(qm,'2',km1,'1L1','black','W07','4mm²'); add(qm,'4',km1,'3L2','black','W08','4mm²'); add(qm,'6',km1,'5L3','black','W09','4mm²')
  add(km1,'2T1',f1,'1L1','black','W10','2.5mm²'); add(km1,'4T2',f1,'3L2','black','W11','2.5mm²'); add(km1,'6T3',f1,'5L3','black','W12','2.5mm²')
  add(f1,'2T1',km2,'1L1','black','W13','2.5mm²'); add(f1,'4T2',km2,'3L2','black','W14','2.5mm²'); add(f1,'6T3',km2,'5L3','black','W15','2.5mm²')

  // Motor — troço externo com espiral + bucim M20 (isolation+spiral só fora)
  for (const [fl, ml, num] of [['2T1','U1','W20'],['4T2','V1','W21'],['6T3','W1','W22']] as const) {
    const w2 = mkWire(tid(xb2, ({'2T1':'L1-OUT','4T2':'L2-OUT','6T3':'L3-OUT'} as const)[fl]), tid(m1, ml), 'black', num, '2.5mm²')
    ;(w2 as any).isolation=[{ start:0.45, end:1.0, color:'#1e293b' }]
    ;(w2 as any).spirals=[{ start:0.5, end:0.85, color:'#0a0a0a', pitchMm:8, innerDiaMm:10 }]
    ;(w2 as any).grommet = 'M20'
    wires.push(w2)
  }
  // Linha → U1/V1/W1; triângulo → W2/U2/V2; estrela fecha o ponto comum.
  for (const [phase, out, end, n] of [['L1','2T1','W2',0],['L2','4T2','U2',1],['L3','6T3','V2',2]] as const) {
    add(xg,phase,xb1,`${phase}-IN`,'black',`W${90+n}`,'4mm²')
    add(f1,out,xb2,`${phase}-IN`,'black',`W${93+n}`,'2.5mm²')
    add(km2,out,m1,end,'black',`W${96+n}`,'2.5mm²')
    add(km3,out,m1,end,'black',`W${23+n}`,'2.5mm²')
  }
  add(km3,'1L1',km3,'3L2','black','W26','2.5mm²'); add(km3,'3L2',km3,'5L3','black','W27','2.5mm²')

  // Comando monofásico: QF1 corta fase → Fonte
  add(q0,'2',qf1,'1','brown','W30','1.5mm²')
  add(qf1,'2',ps,'L','brown','W31','1.5mm²')
  add(xg,'N',ps,'N','lightblue','W32','1.5mm²')
  add(xg,'PE',ps,'PE','green-yellow','W33','1.5mm²')
  // Fonte → X3 distribuição 24V
  add(ps,'+V1', xb3,'+24V-IN','red','W35','1.5mm²'); add(ps,'+V2', xb3,'+24V-IN','red','W36','1.5mm²')
  add(ps,'-V1', xb3,'0V-IN','lightblue','W37','1.5mm²'); add(ps,'-V2', xb3,'0V-IN','lightblue','W38','1.5mm²')
  add(q0,'2',qf2,'1','brown','W39','1.5mm²')
  add(qf2,'2',f1,'95','brown','W45')
  add(xb3,'+24V-OUT',plc,'L+','red','W46')
  add(xb3,'0V-OUT',plc,'M','lightblue','W47')
  for (const q of ['Q0.0','Q0.1','Q0.2']) add(f1,'96',plc,`${q}·2`,'brown',`W48-${q}`)
  add(xb3,'+24V-OUT',plc,'Q0.3·2','red','W49')

  // ── E/S via bornes X4/X5 (não direto ao PLC) ──
  // +24V comum (X3 +24V-OUT) → botões porta + F1 97
  add(xb3,'+24V-OUT', s1Btn,'13','red','W40','1.5mm²')
  add(xb3,'+24V-OUT', s0Btn,'21','red','W41','1.5mm²')
  add(xb3,'+24V-OUT', emer,'21','red','W42','1.5mm²')
  add(xb3,'+24V-OUT', sel,'13','red','W43','1.5mm²')
  add(xb3,'+24V-OUT', f1,'97','red','W44','1.5mm²')
  // Botão porta → X4 borne (espiral ESP1) → PLC I
  const doorIn = (btn: ElectricalComponent, btnTerm: string, borne: ElectricalComponent, plcTerm: string, numA: string, numB: string, color: WireColor) => {
    const wA = mkWire(tid(btn, btnTerm), tid(borne,'1'), color, numA, '1.0mm²')
    ;(wA as any).spirals=[{ start:0.05, end:0.90, color:'#0a0a0a', pitchMm:8, innerDiaMm:12 }]
    ;(wA as any).grommet='M20'
    wires.push(wA)
    const wB = mkWire(tid(borne,'2'), tid(plc, plcTerm), color, numB, '1.0mm²')
    wires.push(wB)
  }
  doorIn(s1Btn,'14', x4_1, 'I0.0', 'W50','W51','violet')
  doorIn(s0Btn,'22', x4_2, 'I0.1', 'W52','W53','violet')
  doorIn(emer,'22', x4_3, 'I0.2', 'W54','W55','violet')
  doorIn(sel,'14', x4_4, 'I0.3', 'W56','W57','orange')
  add(f1,'98', x4_5,'1','violet','W58','1.5mm²'); add(x4_5,'2', plc,'I0.4','violet','W59','1.0mm²')

  // Saídas PLC Q → X5 borne → atuador/porta (espiral na porta)
  const doorOut = (plcTerm: string, borne: ElectricalComponent, target: ElectricalComponent, targetTerm: string, numA: string, numB: string, color: WireColor) => {
    const wA = mkWire(tid(plc, plcTerm), tid(borne,'1'), color, numA, '1.0mm²')
    wires.push(wA)
    const wB = mkWire(tid(borne,'2'), tid(target, targetTerm), color, numB, '1.0mm²')
    if (['H1','H2','H3'].includes(target.ref)) {
      ;(wB as any).spirals=[{ start:0.05, end:0.90, color:'#0a0a0a', pitchMm:8, innerDiaMm:12 }]
      ;(wB as any).grommet='M20'
    }
    wires.push(wB)
  }
  doorOut('Q0.0', x5_1, km1,'A1', 'W60','W61','brown')
  doorOut('Q0.1', x5_2, km2,'A1', 'W62','W63','brown')
  doorOut('Q0.2', x5_3, km3,'A1', 'W64','W65','brown')
  doorOut('Q0.3', x5_4, h1,'X1', 'W66','W67','green')
  add(xb3,'+24V-OUT',km3,'13','red','W68')
  add(km3,'14',x5_5,'1','orange','W69')
  add(x5_5,'2',h3,'X1','orange','W70')
  add(f1,'98',x5_6,'1','red','W71')
  add(x5_6,'2',h2,'X1','red','W78')
  // Retornos 0V / A2 bobinas (via X3 0V)
  add(km1,'A2', xg,'N','lightblue','W72','1.0mm²')
  add(km2,'A2', xg,'N','lightblue','W73','1.0mm²')
  add(km3,'A2', xg,'N','lightblue','W74','1.0mm²')
  add(h1,'X2', xb3,'0V-IN','lightblue','W75','1.0mm²')
  add(h2,'X2', xb3,'0V-IN','lightblue','W76','1.0mm²')
  add(h3,'X2', xb3,'0V-IN','lightblue','W77','1.0mm²')

  const tags = [
    { id:'tI00', address:'I0.0', name:'START', dataType:'Bool', comment:'S1 START porta (NA) via X4:1 → I0.0' },
    { id:'tI01', address:'I0.1', name:'STOP', dataType:'Bool', comment:'S0 STOP (NF) via X4:2 → I0.1' },
    { id:'tI02', address:'I0.2', name:'EMERG', dataType:'Bool', comment:'B0 emergência (NF) via X4:3 → I0.2' },
    { id:'tI03', address:'I0.3', name:'AUTO', dataType:'Bool', comment:'S3 seletor Auto via X4:4 → I0.3' },
    { id:'tI04', address:'I0.4', name:'F1', dataType:'Bool', comment:'Relé térmico 97-98 via X4:5 → I0.4' },
    { id:'tQ00', address:'Q0.0', name:'KM1', dataType:'Bool', comment:'Contactor linha via X5:1 ← Q0.0' },
    { id:'tQ01', address:'Q0.1', name:'KM2', dataType:'Bool', comment:'Contactor triângulo via X5:2 ← Q0.1' },
    { id:'tQ02', address:'Q0.2', name:'KM3', dataType:'Bool', comment:'Contactor estrela via X5:3 ← Q0.2' },
    { id:'tQ03', address:'Q0.3', name:'H1', dataType:'Bool', comment:'H1 marcha verde via X5:4 ← Q0.3 + espiral porta' },
  ]

  // PE
  add(xb1,'PE-IN', xg,'PE','green-yellow','W80','2.5mm²')
  add(xb2,'PE-IN', m1,'PE','green-yellow','W81','2.5mm²')
  add(xb1,'PE-OUT', xb2,'PE-IN','green-yellow','W82','2.5mm²')
  add(ps,'PE', xb3,'PE-IN','green-yellow','W83','1.5mm²')

  // Filaças / marcação cabos: todos os fios dentro da calha levam filaça dupla
  // (a função bakeNativeRouting já calcula, mas marcamos explicitamente)
  for (const w of wires) {
    const insideDuct = ['W01','W02','W03','W04','W05','W06','W07','W08','W09','W10','W11','W12','W13','W14','W15','W30','W31','W35','W36','W37','W38'].includes((w as any).number)
    if (insideDuct) {
      ;(w as any).ferrule = true
      ;(w as any).marker = (w as any).number
    }
  }

  // ── Grafcet 4 etapas ──
  const gs0='gs0', gs10='gs10', gs11='gs11', gs12='gs12'
  const steps: GrafcetStep[] = [
    { id:gs0, name:'0', initial:true, stepType:'initial', action:'', condition:'', description:'Repouso', actions:[]},
    { id:gs10, name:'10', initial:false, stepType:'simple', action:'', condition:'', description:'Estrela', actions:[{ id:nanoid(6), address:'Q0.0', variable:'KM1', description:'KM1 Linha', condition:'1', kind:'N', displayDescription:true },{ id:nanoid(6), address:'Q0.2', variable:'KM3', description:'KM3 Estrela', condition:'1', kind:'N', displayDescription:true }]},
    { id:gs11, name:'11', initial:false, stepType:'simple', action:'', condition:'', description:'Triângulo', actions:[{ id:nanoid(6), address:'Q0.0', variable:'KM1', description:'KM1', condition:'1', kind:'N', displayDescription:true },{ id:nanoid(6), address:'Q0.1', variable:'KM2', description:'KM2 Δ', condition:'1', kind:'N', displayDescription:true },{ id:nanoid(6), address:'Q0.3', variable:'H1', description:'H1 Marcha', condition:'1', kind:'N', displayDescription:true }]},
    { id:gs12, name:'12', initial:false, stepType:'simple', action:'', condition:'', description:'Falha', actions:[]},
  ]
  const transitions: GrafcetTransition[] = [
    { id:'t10', name:'T10', from:[gs0], to:[gs10], condition:'I0.0*I0.1*I0.2*!I0.4*I0.3', description:'START X4:1 + AUTO X4:4' },
    { id:'t11', name:'T11', from:[gs10], to:[gs11], condition:'5s/X10', description:'5s em estrela → triângulo' },
    { id:'t12', name:'T12', from:[gs11], to:[gs0], condition:'!I0.1+!I0.2+I0.4', description:'STOP X4:2 / Emerg X4:3 / F1 X4:5 → repouso' },
    { id:'t13', name:'T13', from:[gs0], to:[gs12], condition:'I0.4', description:'Térmico F1 via X4:5' },
    { id:'t14', name:'T14', from:[gs12], to:[gs0], condition:'!I0.4', description:'Rearme térmico' },
    { id:'t15', name:'T15', from:[gs10], to:[gs0], condition:'!I0.1+!I0.2+I0.4', description:'Emerg/térmico em estrela → repouso' },
  ]
  const pos = autoLayout(steps, transitions)
  const grafcet: GrafcetProgram = {
    name:'Estrela-Triângulo',
    steps: steps.map(s=>{ const at=pos.get(s.id); return at?{...s,x:at.x,y:at.y,pinned:true}:s }),
    transitions: transitions.map((tr,i)=>({ ...tr, x: SPINE_X, y: 90 + i*110 })),
    comments:[
      { id:'c-title', text:'Estrela-Triângulo 4kW — QE1 (E/S via X4/X5 + espiral porta)', x:40, y:24, fontSize:15, fontWeight:'700', color:'#0f172a' },
      { id:'c-desc', text:'Entradas X4:1..5 → I1..I5 | Saídas Q1..Q4 → X5:1..4 | H3 via KM3 | H2 via F1 | Espiral ESP1 porta | Filaças W01-W38 na calha', x:420, y:80, fontSize:11, color:'#334155' },
    ]
  }

  const mounted = syncMounted(components)
  return { components: mounted, wires: bakeNativeRouting(mounted.filter(c => !['panelEnclosure','cableDuct','spiralWrap','dinRail15x55'].includes(c.type)), wires), grafcet, tags }
}

export function nativeEstrelaTrianguloContent(): Record<string, unknown> {
  const built = buildNativeEstrelaTriangulo()
  return {
    app:'dc-simu', version:6, projectKind:'all', nativeId: NATIVE_ESTRELA_ID,
    nativeFeatures:['estrela-triangulo-v2-borne-espiral-filaça', NATIVE_ESTRELA_FEATURE],
    savedAt: new Date().toISOString(),
    components: built.components, wires: built.wires, ladder:{ rungs:[] }, grafcet: built.grafcet, tags: built.tags,
    projectFiles:{}, hiddenProjectFolders:{}, projectFolderLabels:{}, fcBlocks:{ fc1:[], fc2:[] }, fcAdded:{ fc1:false, fc2:false },
    activePlcId:built.components.find(c => c.ref === 'A1')!.id, plcPrograms:{}, plcTags:{}, commands:{ pages:[{id:'page-1',name:'Página 1'}], parts:[], texts:[], wires:[] },
    canvasNotes: (()=>{ const at=new Date().toISOString(); const msg=(id:string,t:string)=>({id,text:t,author:'DC-SIMU',createdAt:at}); return [
      { id:'n-estrela-func', text:'Como testar', view:'3d', x:2.9, y:2.2, z:0.35, color:'#fde68a', messages:[msg('n-estrela-func-m0','1) QE1 fechado, EMERG OK, F1 armado.\n2) S3 AUTO + START (X4:1) → estrela 5s H3 (X5:5) → triângulo H1 (X5:4).\n3) STOP X4:2 / B0 X4:3 / F1 X4:5 → repouso. H2 indica disparo térmico.\nE/S sempre via bornes X4/X5; porta via espiral ESP1.')], createdAt:at },
      { id:'n-estrela-bornes', text:'Bornes', view:'3d', x:2.9, y:1.6, z:0.35, color:'#93c5fd', messages:[msg('n-estrela-bornes-m0','X1 Força | X2 Motor | X3 24V\nX4:1..5 entradas → I1..I5\nX5:1..4 saídas Q1..Q4 → KM/H1; X5:5 H3 via KM3; X5:6 H2 via F1\nFilaças W01-W38 na calha D1/D2')], createdAt:at },
    ]})(),
    canvasTexts:[
      { id:'txt-estrela', view:'3d', text:'QE1 — Estrela-Triângulo 4kW (X4/X5 + ESP1)', x:-2.8, y:2.35, z:0.35, font:'sans', size:16, color:'#0f172a', bold:true, createdAt:new Date().toISOString() },
    ],
    virtualInputs:{}, virtualInputModes:{}, virtualInputCount:8, virtualOutputCount:8, virtualMemoryCount:4,
  }
}
