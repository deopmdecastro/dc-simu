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

export const NATIVE_ESTRELA_ID = 'native-estrela-triangulo-v1'
export const NATIVE_ESTRELA_NAME = 'Estrela-Triângulo com LOGO! (QE1)'

function tid(c: ElectricalComponent, label: string): string {
  const t = c.terminals.find((x) => x.label === label)
  if (!t) throw new Error(`Borne ${c.ref}.${label} em falta (tem ${c.terminals.map(z=>z.label).join(',')})`)
  return t.id
}
function mkWire(from: string, to: string, color: WireColor, num: string, gauge = '1.5mm²'): Wire {
  return {
    id: nanoid(8), fromTerminalId: from, toTerminalId: to, color, gauge,
    kind: (color === 'red' || color === 'black' || color === 'brown') ? 'power' as const : 'control' as const,
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
  qe.w = 800/1.5; qe.h = 600/1.5
  qe.state = { ...(qe.state as any), widthMm: 800, heightMm: 600, depthMm: 250, hingeSide: 'right', doorOpen: false, bodyColor: '#cfd1cb', plateColor: '#e5e7eb' }
  qe.decals = [
    { id:'dec-qe1-warn', kind:'warning', face:'door', offsetXmm:0, offsetYmm:110, widthMm:120, heightMm:28, text:' PERIGO 400V ', icon:'bolt', background:'#facc15', color:'#0f172a', border:true },
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
  const f1 = createComponent('thermalRelay', 'F1', 'Térmico 7,5A'); (f1.state as any).currentA = 7.5
  ;(f1 as any).mountedOn = km1.id
  const m1 = createComponent('motor3ph', 'M1', 'Motor 4kW 400V'); (m1.state as any).motorConnection='star'

  // ── Comando 24V + LOGO ──
  const qf1 = createComponent('breaker1p', 'QF1', 'Monofásico comando 6A'); (qf1.state as any).inA = 6; (qf1.state as any).curve='C'
  const qf2 = createComponent('breaker1p', 'QF2', 'Reserva tomada 10A'); (qf2.state as any).inA = 10
  const ps = createComponent('powerSupplyProauto24A', 'G1', 'Fonte 24V 5A / 120W')
  const plc = createComponent('plcSiemensLogo1224RC', 'A1', 'LOGO! 12/24RCE')
  // LOGO! nativo só tem Q0.0..Q0.3 (4 relés); acrescentamos Q0.4/Q0.5 virtuais para os sinaleiros extra
  for (const lbl of ['Q0.4','Q0.5']) {
    const base = plc.terminals.find(t=>t.label==='Q0.3')!
    plc.terminals.push({ id:`${plc.id}-${lbl}`, componentId: plc.id, label: lbl, kind:'io' as any, terminalType:'screw' as any, color:'#f59e0b', x: 0.16 + 4*0.24 + (lbl==='Q0.5'?0.24:0), y:1, energized:false } as any)
    plc.terminals.push({ id:`${plc.id}-${lbl}·2`, componentId: plc.id, label:`${lbl}·2`, kind:'io' as any, terminalType:'screw' as any, color:'#f59e0b', x: 0.21 + 4*0.24 + (lbl==='Q0.5'?0.24:0), y:1, energized:false } as any)
  }

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
  const x5_5 = mkBorne('X5:5', 'Q0.4 H3')
  const x5_6 = mkBorne('X5:6', 'M H2 falha')

  // ── Operadores porta (panelMount Ø22) ──
  const h1 = createComponent('pilotLightAd22', 'H1', 'Marcha verde')
  const h2 = createComponent('pilotLightAd22', 'H2', 'Falha vermelho')
  const h3 = createComponent('pilotLightAd22', 'H3', 'Estrela laranja')
  const s1Btn = createComponent('buttonNO', 'S1', 'START verde')
  const s0Btn = createComponent('buttonNC', 'S0', 'STOP vermelho')
  const emer = createComponent('emergencyButton', 'B0', 'Emergência NF')
  const sel = createComponent('selector2', 'S3', 'Auto/Manual')

  // Posicionamento no esquema (evitar sobreposição, grelha limpa)
  qe.schematicX=80; qe.schematicY=80
  rail.schematicX=110; rail.schematicY=260
  ductH.schematicX=110; ductH.schematicY=190
  ductV.schematicX=640; ductV.schematicY=190
  esp.schematicX=340; esp.schematicY=760
  xg.schematicX=120; xg.schematicY=340; q0.schematicX=250; q0.schematicY=340; qm.schematicX=380; qm.schematicY=340
  km1.schematicX=500; km1.schematicY=320; f1.schematicX=500; f1.schematicY=400
  km2.schematicX=500; km2.schematicY=500; km3.schematicX=380; km3.schematicY=500; m1.schematicX=660; m1.schematicY=480
  qf1.schematicX=120; qf1.schematicY=560; qf2.schematicX=200; qf2.schematicY=560; ps.schematicX=310; ps.schematicY=560; plc.schematicX=500; plc.schematicY=600
  xb1.schematicX=120; xb1.schematicY=470; xb2.schematicX=660; xb2.schematicY=400; xb3.schematicX=120; xb3.schematicY=680
  // Régua X4/X5 encostada à calha, por baixo do PLC
  x4_1.schematicX=120; x4_1.schematicY=740; x4_2.schematicX=200; x4_2.schematicY=740; x4_3.schematicX=280; x4_3.schematicY=740; x4_4.schematicX=360; x4_4.schematicY=740; x4_5.schematicX=440; x4_5.schematicY=740
  x5_1.schematicX=120; x5_1.schematicY=790; x5_2.schematicX=200; x5_2.schematicY=790; x5_3.schematicX=280; x5_3.schematicY=790; x5_4.schematicX=360; x5_4.schematicY=790; x5_5.schematicX=440; x5_5.schematicY=790; x5_6.schematicX=520; x5_6.schematicY=790
  h1.schematicX=500; h1.schematicY=120; h2.schematicX=560; h2.schematicY=120; h3.schematicX=620; h3.schematicY=120
  s1Btn.schematicX=500; s1Btn.schematicY=200; s0Btn.schematicX=560; s0Btn.schematicY=200; emer.schematicX=620; emer.schematicY=200; sel.schematicX=680; sel.schematicY=200

  for (const c of [h1,h2,h3,s1Btn,s0Btn,emer,sel]) (c as any).panelMount = { enclosureId: qe.id, face:'door', offsetXmm:0, offsetYmm:0, cutoutMm:22 }

  // ── Etiquetas equipamentos (decals) ──
  km1.decals=[{ id:'dkm1', kind:'text', face:'front', text:'KM1 LINHA', background:'#0f172a', color:'#fff', widthMm:32, heightMm:10, offsetYmm:18 }]
  km2.decals=[{ id:'dkm2', kind:'text', face:'front', text:'KM2 Δ', background:'#0f172a', color:'#fff', widthMm:24, heightMm:10, offsetYmm:18 }]
  km3.decals=[{ id:'dkm3', kind:'text', face:'front', text:'KM3 Y', background:'#1e3a8a', color:'#fff', widthMm:24, heightMm:10, offsetYmm:18 }]
  q0.decals=[{ id:'dq0', kind:'symbol', face:'front', text:'Q0 25A C', icon:'bolt', background:'#facc15', color:'#0f172a', widthMm:26, heightMm:12 }]
  qm.decals=[{ id:'dqm1', kind:'text', face:'front', text:'QM1 6,3-10A', background:'#dc2626', color:'#fff', widthMm:34, heightMm:10, offsetYmm:18 }]
  qf1.decals=[{ id:'dqf1', kind:'symbol', face:'front', text:'QF1 6A', icon:'bolt', background:'#0ea5e9', color:'#fff', widthMm:20, heightMm:10 }]
  qf2.decals=[{ id:'dqf2', kind:'symbol', face:'front', text:'QF2 10A', icon:'bolt', background:'#64748b', color:'#fff', widthMm:20, heightMm:10 }]
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

  const components: ElectricalComponent[] = [
    qe, rail, ductH, ductV, esp,
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
  add(xg,'L1',q0,'1','black','W01','4mm²'); add(xg,'L2',q0,'3','black','W02','4mm²'); add(xg,'L3',q0,'5','black','W03','4mm²')
  add(q0,'2',qm,'1','black','W04','4mm²'); add(q0,'4',qm,'3','black','W05','4mm²'); add(q0,'6',qm,'5','black','W06','4mm²')
  add(qm,'2',km1,'1L1','black','W07','4mm²'); add(qm,'4',km1,'3L2','black','W08','4mm²'); add(qm,'6',km1,'5L3','black','W09','4mm²')
  add(km1,'2T1',f1,'1L1','black','W10','2.5mm²'); add(km1,'4T2',f1,'3L2','black','W11','2.5mm²'); add(km1,'6T3',f1,'5L3','black','W12','2.5mm²')
  add(f1,'2T1',km2,'1L1','black','W13','2.5mm²'); add(f1,'4T2',km2,'3L2','black','W14','2.5mm²'); add(f1,'6T3',km2,'5L3','black','W15','2.5mm²')

  // Motor — troço externo com espiral + bucim M20 (isolation+spiral só fora)
  for (const [fl, ml, num] of [['2T1','U1','W20'],['4T2','V1','W21'],['6T3','W1','W22']] as const) {
    const w2 = mkWire(tid(km2, fl), tid(m1, ml), 'black', num, '2.5mm²')
    ;(w2 as any).isolation=[{ start:0.45, end:1.0, color:'#1e293b' }]
    ;(w2 as any).spirals=[{ start:0.5, end:0.85, color:'#0a0a0a', pitchMm:8, innerDiaMm:10 }]
    ;(w2 as any).grommet = 'M20'
    wires.push(w2)
  }
  add(km3,'2T1',m1,'W2','black','W23','2.5mm²'); add(km3,'4T2',m1,'U2','black','W24','2.5mm²'); add(km3,'6T3',m1,'V2','black','W25','2.5mm²')
  add(km3,'1L1',km3,'3L2','black','W26','1.5mm²'); add(km3,'3L2',km3,'5L3','black','W27','1.5mm²')

  // Comando monofásico: QF1 corta fase → Fonte
  add(q0,'2',qf1,'1','brown','W30','1.5mm²')
  add(qf1,'2',ps,'L','brown','W31','1.5mm²')
  add(xg,'N',ps,'N','lightblue','W32','1.5mm²')
  add(xg,'PE',ps,'PE','green-yellow','W33','1.5mm²')
  // Fonte → X3 distribuição 24V
  add(ps,'+V1', xb3,'+24V-IN','red','W35','1.5mm²'); add(ps,'+V2', xb3,'+24V-IN','red','W36','1.5mm²')
  add(ps,'-V1', xb3,'0V-IN','lightblue','W37','1.5mm²'); add(ps,'-V2', xb3,'0V-IN','lightblue','W38','1.5mm²')
  add(xb3,'+24V-OUT',qf2,'1','red','W39','1.5mm²')

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
  doorOut('Q0.0', x5_1, km1,'A1', 'W60','W61','red')
  doorOut('Q0.1', x5_2, km2,'A1', 'W62','W63','red')
  doorOut('Q0.2', x5_3, km3,'A1', 'W64','W65','red')
  doorOut('Q0.3', x5_4, h1,'X1', 'W66','W67','green')
  doorOut('Q0.4', x5_5, h2,'X1', 'W68','W69','red')
  doorOut('Q0.5', x5_6, h3,'X1', 'W70','W71','orange')
  // Retornos 0V / A2 bobinas (via X3 0V)
  add(km1,'A2', xb3,'0V-IN','lightblue','W72','1.0mm²')
  add(km2,'A2', xb3,'0V-IN','lightblue','W73','1.0mm²')
  add(km3,'A2', xb3,'0V-IN','lightblue','W74','1.0mm²')
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
    { id:'tQ04', address:'Q0.4', name:'H3', dataType:'Bool', comment:'H3 estrela laranja via X5:5 ← Q0.4 + espiral porta' },
    { id:'tQ05', address:'Q0.5', name:'H2', dataType:'Bool', comment:'H2 falha via X5:6 ← Q0.5 + espiral porta' },
  ]

  // PE
  add(xb1,'PE-IN', xg,'PE','green-yellow','W80','2.5mm²')
  add(xb2,'PE-IN', m1,'PE','green-yellow','W81','2.5mm²')
  add(xg,'PE', xb1,'PE-OUT','green-yellow','W82','2.5mm²')
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
    { id:gs0, name:'0', initial:true, stepType:'initial', action:'', condition:'', description:'Repouso', actions:[{ id:nanoid(6), address:'Q0.2', variable:'H2', description:'H2 PARADO', condition:'1', kind:'N', displayDescription:true }]},
    { id:gs10, name:'10', initial:false, stepType:'simple', action:'', condition:'', description:'Estrela', actions:[{ id:nanoid(6), address:'Q0.0', variable:'KM1', description:'KM1 Linha', condition:'1', kind:'N', displayDescription:true },{ id:nanoid(6), address:'Q0.2', variable:'KM3', description:'KM3 Estrela', condition:'1', kind:'N', displayDescription:true },{ id:nanoid(6), address:'Q0.4', variable:'H3', description:'H3 Estrela', condition:'1', kind:'N', displayDescription:true }]},
    { id:gs11, name:'11', initial:false, stepType:'simple', action:'', condition:'', description:'Triângulo', actions:[{ id:nanoid(6), address:'Q0.0', variable:'KM1', description:'KM1', condition:'1', kind:'N', displayDescription:true },{ id:nanoid(6), address:'Q0.1', variable:'KM2', description:'KM2 Δ', condition:'1', kind:'N', displayDescription:true },{ id:nanoid(6), address:'Q0.3', variable:'H1', description:'H1 Marcha', condition:'1', kind:'N', displayDescription:true }]},
    { id:gs12, name:'12', initial:false, stepType:'simple', action:'', condition:'', description:'Falha', actions:[{ id:nanoid(6), address:'Q0.5', variable:'H2', description:'H2 Falha', condition:'1', kind:'N', displayDescription:true }]},
  ]
  const transitions: GrafcetTransition[] = [
    { id:'t10', name:'T10', from:[gs0], to:[gs10], condition:'I0.0*!I0.2*!I0.4*I0.3', description:'START X4:1 + AUTO X4:4' },
    { id:'t11', name:'T11', from:[gs10], to:[gs11], condition:'5s/X10', description:'5s em estrela → triângulo' },
    { id:'t12', name:'T12', from:[gs11], to:[gs0], condition:'!I0.1+I0.2+I0.4', description:'STOP X4:2 / Emerg X4:3 / F1 X4:5 → repouso' },
    { id:'t13', name:'T13', from:[gs0], to:[gs12], condition:'I0.4', description:'Térmico F1 via X4:5' },
    { id:'t14', name:'T14', from:[gs12], to:[gs0], condition:'!I0.4', description:'Rearme térmico' },
    { id:'t15', name:'T15', from:[gs10], to:[gs0], condition:'I0.2+I0.4', description:'Emerg/térmico em estrela → repouso' },
  ]
  const pos = autoLayout(steps, transitions)
  const grafcet: GrafcetProgram = {
    name:'Estrela-Triângulo',
    steps: steps.map(s=>{ const at=pos.get(s.id); return at?{...s,x:at.x,y:at.y,pinned:true}:s }),
    transitions: transitions.map((tr,i)=>({ ...tr, x: SPINE_X, y: 90 + i*110 })),
    comments:[
      { id:'c-title', text:'Estrela-Triângulo 4kW — QE1 (E/S via X4/X5 + espiral porta)', x:40, y:24, fontSize:15, fontWeight:'700', color:'#0f172a' },
      { id:'c-desc', text:'Entradas X4:1..5 → I1..I5 | Saídas Q1..Q6 → X5:1..6 → KM/H | Espiral ESP1 porta | Filaças W01-W38 na calha', x:420, y:80, fontSize:11, color:'#334155' },
    ]
  }

  return { components: components as any, wires: bakeNativeRouting(components as any, wires as any), grafcet, tags }
}

export function nativeEstrelaTrianguloContent(): Record<string, unknown> {
  const built = buildNativeEstrelaTriangulo()
  return {
    app:'dc-simu', version:6, projectKind:'all', nativeId: NATIVE_ESTRELA_ID,
    nativeFeatures:['estrela-triangulo-v2-borne-espiral-filaça'],
    savedAt: new Date().toISOString(),
    components: built.components, wires: built.wires, ladder:{ rungs:[] }, grafcet: built.grafcet, tags: built.tags,
    projectFiles:{}, hiddenProjectFolders:{}, projectFolderLabels:{}, fcBlocks:{ fc1:[], fc2:[] }, fcAdded:{ fc1:false, fc2:false },
    activePlcId:'native-plc-estrela', plcPrograms:{}, plcTags:{}, commands:{ pages:[{id:'page-1',name:'Página 1'}], parts:[], texts:[], wires:[] },
    canvasNotes: (()=>{ const at=new Date().toISOString(); const msg=(id:string,t:string)=>({id,text:t,author:'DC-SIMU',createdAt:at}); return [
      { id:'n-estrela-func', text:'Como testar', view:'3d', x:2.9, y:2.2, z:0.35, color:'#fde68a', messages:[msg('n-estrela-func-m0','1) QE1 fechado, EMERG OK, F1 armado.\n2) S3 AUTO + START (X4:1) → estrela 5s H3 (X5:5) → triângulo H1 (X5:4).\n3) STOP X4:2 / B0 X4:3 / F1 X4:5 → repouso H2.\nE/S sempre via bornes X4/X5; porta via espiral ESP1.')], createdAt:at },
      { id:'n-estrela-bornes', text:'Bornes', view:'3d', x:2.9, y:1.6, z:0.35, color:'#93c5fd', messages:[msg('n-estrela-bornes-m0','X1 Força | X2 Motor | X3 24V\nX4:1..5 entradas → I1..I5\nX5:1..6 saídas Q1..Q6 → KM/H\nFilaças W01-W38 na calha D1/D2')], createdAt:at },
    ]})(),
    canvasTexts:[
      { id:'txt-estrela', view:'3d', text:'QE1 — Estrela-Triângulo 4kW (X4/X5 + ESP1)', x:-2.8, y:2.35, z:0.35, font:'sans', size:16, color:'#0f172a', bold:true, createdAt:new Date().toISOString() },
    ],
    virtualInputs:{}, virtualInputModes:{}, virtualInputCount:8, virtualOutputCount:8, virtualMemoryCount:4,
  }
}
