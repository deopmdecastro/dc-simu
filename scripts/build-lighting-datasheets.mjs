/**
 * Gera a ficha técnica de referência em PDF para a lâmpada incandescente A60 E27
 * (incluindo tabela comparativa Incandescente vs Fluorescente CFL vs LED e esquemas
 * de ligação E27 / comutação de escada) e atualiza o manifesto de proveniência
 * `public/datasheets/lighting/sources.json`.
 */
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { jsPDF } from 'jspdf'

const OUT_DIR = path.resolve('public/datasheets/lighting')

async function buildIncandescentPdf() {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

  // Cabeçalho técnico
  doc.setFillColor(18, 52, 92)
  doc.rect(0, 0, 210, 28, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.text('PHILIPS · Standard Classic A60 E27 — Lâmpada Incandescente', 14, 13)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9.5)
  doc.text('Ficha técnica de referência (IEC 60064 / EN 60432-1) · Guia comparativo de iluminação residencial DC-Simu', 14, 21)

  // Aviso de proveniência
  doc.setTextColor(70, 80, 92)
  doc.setFontSize(8.5)
  doc.text('Documento técnico compilado de referência didática para simulação (lâmpadas incandescentes clássicas A60 230 V~, casquilho E27).', 14, 35)

  // Secção 1 — Características principais
  doc.setTextColor(18, 52, 92)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.text('1. Especificações Elétricas e Fotométricas (A60 E27 · 230 V~ 50/60 Hz)', 14, 45)
  doc.setDrawColor(200, 210, 220)
  doc.line(14, 47, 196, 47)

  const specs = [
    ['Tecnologia / Filamento', 'Incandescente de tungsténio em ampola de vidro transparente A60 (Ø60 × 104 mm)'],
    ['Casquilho / Soquete', 'Rosca Edison E27 (latão) com base de ligação de 2 bornes: L (contacto central) e N (rosca lateral)'],
    ['Tensão nominal / Fator de potência', '220–240 V CA · 50/60 Hz · cos φ = 1,00 (carga puramente resistiva)'],
    ['Potências disponíveis', '40 W (415 lm · 0,17 A) · 60 W (710 lm · 0,26 A) · 75 W (935 lm · 0,33 A) · 100 W (1340 lm · 0,43 A)'],
    ['Temperatura de cor / IRC', '2700 K (Branco quente) · IRC (Ra) = 100 · Acendimento instantâneo (0,0 s)'],
    ['Vida útil média / Poupança', '~1 000 horas (~1 ano a 2,7 h/dia) · 0 % de poupança energética (referência base)'],
    ['Regulação / Normas', 'Regulável (dimmer resistivo) · IEC 60064 · IEC 60238 (soquete E27)'],
  ]

  let y = 54
  doc.setFontSize(9.5)
  for (const [k, v] of specs) {
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(35, 45, 55)
    doc.text(k, 14, y)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(55, 65, 75)
    doc.text(v, 72, y, { maxWidth: 124 })
    y += 8.5
  }

  // Secção 2 — Tabela comparativa Incandescente vs Fluorescente CFL vs LED
  y += 6
  doc.setTextColor(18, 52, 92)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.text('2. Comparação de Tecnologias de Iluminação (Equivalência Luminosa)', 14, y)
  doc.line(14, y + 2, 196, y + 2)
  y += 8

  const cols = [14, 58, 104, 150]
  const headers = ['Parâmetro', 'Incandescente (A60)', 'Fluorescente CFL (Genie)', 'LED (CorePro A60)']
  const headerColors = [
    [235, 240, 246],
    [206, 228, 242],
    [164, 212, 198],
    [244, 199, 128],
  ]

  doc.setFontSize(9.5)
  for (let i = 0; i < 4; i++) {
    const [r, g, b] = headerColors[i]
    doc.setFillColor(r, g, b)
    doc.rect(cols[i], y, i === 3 ? 46 : 44, 8, 'F')
    doc.setTextColor(22, 32, 42)
    doc.setFont('helvetica', 'bold')
    doc.text(headers[i], cols[i] + 2, y + 5.5)
  }
  y += 8

  const rows = [
    ['Nível 1 (~400 lm)', '40 W (0,17 A)', '8 W (0,06 A)', '4 W (0,025 A)'],
    ['Nível 2 (~650–806 lm)', '60 W (0,26 A)', '12 W (0,09 A)', '6–8 W (0,04–0,05 A)'],
    ['Nível 3 (~900 lm)', '75 W (0,33 A)', '15 W (0,11 A)', '8 W (0,05 A)'],
    ['Nível 4 (~1055–1340 lm)', '100 W (0,43 A)', '20 W (0,15 A)', '10 W (0,06 A)'],
    ['Vida útil típica', '1 ano (~1 000 h)', '6 a 10 anos (8–10 000 h)', '15 a 25 anos (15–25 000 h)'],
    ['Poupança de energia', '0 % (base)', 'Até 80 %', 'Até 95 %'],
    ['Fator de potência (cos φ)', '1,00', '0,60', '0,70'],
    ['Arranque / Luz', 'Instantâneo (2700 K)', 'Aquecimento suave (~0,4 s)', 'Instantâneo (2700–6500 K)'],
  ]

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  for (let rIdx = 0; rIdx < rows.length; rIdx++) {
    if (rIdx % 2 === 1) {
      doc.setFillColor(246, 248, 250)
      doc.rect(14, y, 182, 7.5, 'F')
    }
    for (let c = 0; c < 4; c++) {
      doc.setFont('helvetica', c === 0 ? 'bold' : 'normal')
      doc.setTextColor(35, 45, 55)
      doc.text(rows[rIdx][c], cols[c] + 2, y + 5.2)
    }
    doc.setDrawColor(224, 230, 236)
    doc.line(14, y + 7.5, 196, y + 7.5)
    y += 7.5
  }

  // Secção 3 — Esquemas de ligação (Simples, Duplo e Comutação de Escada)
  y += 10
  doc.setTextColor(18, 52, 92)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.text('3. Ligações Elétricas Recomendadas (Soquete E27 + Schneider Electric Odace)', 14, y)
  doc.line(14, y + 2, 196, y + 2)
  y += 9

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9.2)
  doc.setTextColor(45, 55, 65)
  const wiringNotes = [
    '• Segurança do casquilho E27: ligar sempre a FASE comutada (retorno) ao borne L (contacto central do fundo do soquete) e o NEUTRO (azul) ao borne N (rosca lateral), evitando choque elétrico ao enroscar a lâmpada.',
    '• Interruptor Simples (Odace S520201 · 10AX 250V~): Fase (L) -> borne L do interruptor; borne 1 -> borne L da lâmpada; borne N da lâmpada -> Neutro.',
    '• Interruptor Duplo (Odace S520214 · 2×10AX 250V~): Fase (L) -> borne comum L; borne 1 -> Lâmpada 1 (L); borne 2 -> Lâmpada 2 (L); Neutro comum aos bornes N das duas lâmpadas.',
    '• Comutação de Escada (2× Odace S520204 · 10AX 250V~): Fase (L) -> Comutador 1 (borne L); bornes 1 e 2 do Comutador 1 ligados respetivamente aos bornes 1 e 2 do Comutador 2 (fios de retorno/navegadores); borne L do Comutador 2 -> borne L da lâmpada; borne N -> Neutro.',
  ]
  for (const line of wiringNotes) {
    const wrapped = doc.splitTextToSize(line, 180)
    doc.text(wrapped, 14, y)
    y += wrapped.length * 4.8 + 2.5
  }

  // Rodapé
  doc.setDrawColor(210, 216, 224)
  doc.line(14, 282, 196, 282)
  doc.setFontSize(8)
  doc.setTextColor(110, 120, 130)
  doc.text('DC-Simu · Biblioteca de Iluminação Residencial · Normas IEC 60064 / IEC 60617 / EN 60669-1', 14, 287)

  const outPath = path.join(OUT_DIR, 'philips-standard-a60-incandescente-e27-pt.pdf')
  const bytes = Buffer.from(doc.output('arraybuffer'))
  await fs.writeFile(outPath, bytes)
  console.log(`✓ ${path.relative(process.cwd(), outPath)} (${bytes.length} bytes)`)
}

async function writeSourcesManifest() {
  const entries = [
    {
      file: 'schneider-odace-s520204.pdf',
      brand: 'Schneider Electric',
      series: 'Odace (S520201 / S520204 / S520214)',
      origin: 'Official Schneider Electric Odace datasheet PDF (entrepot-du-bricolage.fr)',
    },
    {
      file: 'philips-corepro-ledbulb-a60-e27.pdf',
      brand: 'Philips (Signify)',
      series: 'CorePro LEDbulb A60 E27 5CCT',
      origin: 'Official Signify / Philips datasheet PDF (signify.com)',
    },
    {
      file: 'philips-genie-cfl-e27.pdf',
      brand: 'Philips (Signify)',
      series: 'Genie CFL Integrated E27',
      origin: 'Official Signify / Philips Genie technical datasheet PDF (assets.signify.com)',
    },
    {
      file: 'philips-standard-a60-incandescente-e27-pt.pdf',
      brand: 'Philips (Referência técnica IEC 60064)',
      series: 'Standard Classic A60 E27 + Guia Comparativo & Ligações',
      origin: 'Generated local technical reference PDF compiled from IEC 60064 / Philips A60 specs',
    },
  ]

  const files = []
  for (const e of entries) {
    const buf = await fs.readFile(path.join(OUT_DIR, e.file))
    files.push({
      ...e,
      bytes: buf.length,
      sha256: crypto.createHash('sha256').update(buf).digest('hex'),
    })
  }

  const manifest = {
    notice: 'Official manufacturer PDFs (Schneider Odace, Philips CorePro LED, Philips Genie CFL) plus compiled IEC 60064 reference sheet for classic A60 incandescent.',
    files,
  }
  await fs.writeFile(path.join(OUT_DIR, 'sources.json'), JSON.stringify(manifest, null, 2) + '\n')
  console.log(`✓ public/datasheets/lighting/sources.json (${files.length} fichas)`)
}

await fs.mkdir(OUT_DIR, { recursive: true })
await buildIncandescentPdf()
await writeSourcesManifest()
