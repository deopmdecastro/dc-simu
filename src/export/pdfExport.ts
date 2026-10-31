/** Exportação do projeto para PDF com o design da plataforma DC-Simu.
 *
 *  Estrutura do documento:
 *   1. Capa — marca DC-Simu, nome do projeto, data e estatísticas;
 *   2. Informações do projeto (tabela de resumo);
 *   3. Tabela de tags (%I/%Q/%M/MW…);
 *   4. Esquema elétrico — captura real da vista 3D do editor;
 *   5. GRAFCET — diagrama gerado a partir do programa (por página/chart);
 *   6. Ladder — por bloco (Main, FC1, FC2, ficheiros de projeto) e com
 *      seleção de networks: o utilizador escolhe o que entra no PDF.
 *
 *  As partes vetoriais (ladder/GRAFCET) vêm do mesmo gerador SVG usado nas
 *  covers reais do dashboard, convertidas para JPEG em 2× para qualidade de
 *  impressão. Em contexto sem DOM (testes), as imagens são omitidas e o
 *  resto do documento é gerado na mesma. */
import { jsPDF } from 'jspdf'
import type { LadderRung } from '../types'
import type { GrafcetProgram, GrafcetChart } from '../grafcet/engine'
import type { ProjectFile } from '../ladder/projectFiles'
import { ladderCoverSvg, grafcetCoverSvg, svgToJpegDataUrl } from '../dashboard/flowCover'
import { captureCover } from '../three/coverCapture'

// ---------- modelo de seleção ----------

export interface PdfLadderBlock {
  /** Identificador estável usado na seleção: 'main', 'fc1', 'fc2' ou `file:<id>`. */
  id: string
  title: string
  rungs: LadderRung[]
}

export type PdfOrientation = 'portrait' | 'landscape'

/** Campos da esquadria (bloco de legenda no canto da folha). */
export interface PdfTitleBlock {
  enabled: boolean
  company: string
  companyLine: string
  author: string
  role: string
  client: string
  location: string
  projectName: string
  drawingTitle: string
  discipline: string
  sheetNumber: string
  scale: string
  revision: string
  date: string
  notes: string
}

export interface PdfExportOptions {
  cover: boolean
  info: boolean
  tags: boolean
  schematic: boolean
  grafcet: boolean
  /** blocos de ladder a incluir: id do bloco → índices de networks incluídas */
  ladder: Record<string, number[]>
  /** charts/páginas do GRAFCET a incluir (ids); vazio = todos */
  grafcetCharts: string[]
  /** Orientação A4 da folha. */
  orientation: PdfOrientation
  /** Dados da esquadria (desenhada no rodapé de cada página de conteúdo). */
  titleBlock: PdfTitleBlock
}

export interface PdfProjectSource {
  projectName: string
  ladder: LadderRung[]
  fcBlocks: { fc1: LadderRung[]; fc2: LadderRung[] }
  /** Blocos FC adicionados manualmente (ausente = projeto antigo: mostrar os que têm conteúdo). */
  fcAdded?: Record<'fc1' | 'fc2', boolean>
  fcNames?: Partial<Record<'fc1' | 'fc2', string>>
  projectFiles: Record<string, ProjectFile[]>
  grafcet: GrafcetProgram
  tags: Array<{ name: string; address: string; dataType?: string; comment?: string }>
  components: Array<{ id: string; type: string; name?: string }>
  wires: Array<unknown>
}

/** Todos os blocos de ladder disponíveis para escolha no diálogo de exportação. */
export function collectLadderBlocks(src: PdfProjectSource): PdfLadderBlock[] {
  const blocks: PdfLadderBlock[] = []
  if (src.ladder.length) blocks.push({ id: 'main', title: 'Main [OB1]', rungs: src.ladder })
  if ((src.fcAdded?.fc1 ?? (src.fcBlocks.fc1.length > 0 || !!src.fcNames?.fc1?.trim())) && src.fcBlocks.fc1.length)
    blocks.push({ id: 'fc1', title: src.fcNames?.fc1?.trim() || 'FC1', rungs: src.fcBlocks.fc1 })
  if ((src.fcAdded?.fc2 ?? (src.fcBlocks.fc2.length > 0 || !!src.fcNames?.fc2?.trim())) && src.fcBlocks.fc2.length)
    blocks.push({ id: 'fc2', title: src.fcNames?.fc2?.trim() || 'FC2', rungs: src.fcBlocks.fc2 })
  for (const files of Object.values(src.projectFiles ?? {}))
    for (const f of files ?? [])
      if (f.rungs?.length) blocks.push({ id: `file:${f.id}`, title: f.name || 'Bloco', rungs: f.rungs })
  return blocks
}

/** Seleção por omissão: tudo incluído. */
export function defaultPdfOptions(src: PdfProjectSource): PdfExportOptions {
  const ladder: Record<string, number[]> = {}
  for (const block of collectLadderBlocks(src)) ladder[block.id] = block.rungs.map((_, i) => i)
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const date = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`
  return {
    cover: true, info: true, tags: true, schematic: true, grafcet: true, ladder, grafcetCharts: [],
    orientation: 'portrait',
    titleBlock: {
      enabled: true,
      company: 'DC-Simu',
      companyLine: 'Simulador de Automação Industrial',
      author: '',
      role: '',
      client: '',
      location: '',
      projectName: src.projectName || '',
      drawingTitle: 'Documentação do projeto',
      discipline: 'Automação',
      sheetNumber: '01',
      scale: '—',
      revision: '0',
      date,
      notes: '',
    },
  }
}

/** Aplica a seleção de networks a um bloco (fora da gama → ignorado). */
export function selectedRungs(block: PdfLadderBlock, picked: number[] | undefined): LadderRung[] {
  if (!picked || !picked.length) return []
  return block.rungs.filter((_, i) => picked.includes(i))
}

// ---------- desenho do documento ----------

const BRAND = '#2655e5'
const INK = '#1e2b44'
const MUTED = '#6b7a90'

const A4_PORTRAIT_W = 595.28 // A4 em pontos
const A4_PORTRAIT_H = 841.89
const MARGIN = 48
/** Métricas da folha atual (atualizadas no início de `generateProjectPdf`). */
let PAGE_W = A4_PORTRAIT_W
let PAGE_H = A4_PORTRAIT_H
let CONTENT_W = PAGE_W - MARGIN * 2
/** Altura reservada à esquadria no rodapé (0 se desligada). */
let TITLE_BLOCK_H = 0

function applyPageLayout(orientation: PdfOrientation, titleBlockEnabled: boolean) {
  if (orientation === 'landscape') {
    PAGE_W = A4_PORTRAIT_H
    PAGE_H = A4_PORTRAIT_W
  } else {
    PAGE_W = A4_PORTRAIT_W
    PAGE_H = A4_PORTRAIT_H
  }
  CONTENT_W = PAGE_W - MARGIN * 2
  TITLE_BLOCK_H = titleBlockEnabled ? 72 : 0
}

function footerSafeY() {
  return PAGE_H - 30 - TITLE_BLOCK_H
}

const shortDate = () => {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/** Logótipo DC-Simu desenhado em vetor (mesmo símbolo de ui/Brand.tsx): nítido a qualquer
 *  zoom, sem ficheiros de imagem e funciona também sem DOM. `onBrand` = sobre fundo azul. */
function drawLogo(doc: jsPDF, x: number, y: number, size: number, onBrand = true) {
  const k = size / 64
  doc.setFillColor(onBrand ? '#ffffff' : BRAND)
  doc.roundedRect(x + 3 * k, y + 3 * k, 58 * k, 58 * k, 14 * k, 14 * k, 'F')
  doc.setFillColor(onBrand ? BRAND : '#ffffff')
  // raio: M35 10 L17 35 h12 l-3 19 L47 25 H34 z
  doc.lines([[-18 * k, 25 * k], [12 * k, 0], [-3 * k, 19 * k], [21 * k, -29 * k], [-13 * k, 0]], x + 35 * k, y + 10 * k, [1, 1], 'F', true)
}

function header(doc: jsPDF, section: string, projectName: string) {
  doc.setFillColor(BRAND)
  doc.rect(0, 0, PAGE_W, 30, 'F')
  drawLogo(doc, MARGIN, 5, 20)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor('#ffffff')
  doc.text('DC-Simu · Simulador de Automação Industrial', MARGIN + 27, 19)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.text(section, PAGE_W - MARGIN, 19, { align: 'right' })
  doc.setTextColor(INK)
  doc.setFontSize(15)
  doc.setFont('helvetica', 'bold')
  doc.text(projectName, MARGIN, 56)
  doc.setDrawColor('#d7deeb')
  doc.setLineWidth(0.8)
  doc.line(MARGIN, 64, PAGE_W - MARGIN, 64)
}

function drawTitleBlock(doc: jsPDF, tb: PdfTitleBlock, pageIndex: number, pageCount: number) {
  if (!tb.enabled) return
  const h = TITLE_BLOCK_H
  const y0 = PAGE_H - MARGIN / 2 - h
  const x0 = MARGIN
  const w = CONTENT_W
  // Grelha tipo esquadria de projeto (canto inferior)
  doc.setDrawColor('#1e2b44')
  doc.setLineWidth(1.1)
  doc.rect(x0, y0, w, h)
  doc.setLineWidth(0.5)

  // Colunas: empresa | projeto | título | meta
  const c1 = w * 0.22
  const c2 = w * 0.28
  const c3 = w * 0.28
  const c4 = w - c1 - c2 - c3
  const x1 = x0 + c1
  const x2 = x1 + c2
  const x3 = x2 + c3

  doc.line(x1, y0, x1, y0 + h)
  doc.line(x2, y0, x2, y0 + h)
  doc.line(x3, y0, x3, y0 + h)
  // linhas horizontais na coluna meta e projeto
  doc.line(x1, y0 + h * 0.45, x3, y0 + h * 0.45)
  doc.line(x3, y0 + h * 0.33, x0 + w, y0 + h * 0.33)
  doc.line(x3, y0 + h * 0.66, x0 + w, y0 + h * 0.66)
  doc.line(x3 + c4 * 0.5, y0 + h * 0.66, x3 + c4 * 0.5, y0 + h)

  const cell = (label: string, value: string, x: number, y: number, maxW: number, valueSize = 9) => {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6); doc.setTextColor(MUTED)
    doc.text(label, x + 3, y + 7)
    doc.setFont('helvetica', 'bold'); doc.setFontSize(valueSize); doc.setTextColor(INK)
    const lines = doc.splitTextToSize((value || '—').trim() || '—', maxW - 6)
    doc.text(lines.slice(0, 2), x + 3, y + 16)
  }

  // Empresa
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(BRAND)
  doc.text(tb.company || 'DC-Simu', x0 + 4, y0 + 16)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(MUTED)
  const sub = doc.splitTextToSize(tb.companyLine || '', c1 - 8)
  doc.text(sub.slice(0, 2), x0 + 4, y0 + 28)
  if (tb.author || tb.role) {
    doc.setTextColor(INK); doc.setFontSize(7)
    doc.text([tb.author, tb.role].filter(Boolean).join(' · '), x0 + 4, y0 + h - 8)
  }

  // Projeto / cliente / local
  cell('Projeto', tb.projectName, x1, y0, c2, 9)
  cell('Cliente / Local', [tb.client, tb.location].filter(Boolean).join(' — ') || '—', x1, y0 + h * 0.45, c2, 8)

  // Título do desenho
  cell('Título', tb.drawingTitle, x2, y0, c3, 9)
  cell('Disciplina', tb.discipline, x2, y0 + h * 0.45, c3, 8)

  // Meta: nº folha, escala, revisão, data
  cell('Folha', `${tb.sheetNumber}.${String(pageIndex).padStart(2, '0')}`, x3, y0, c4 * 0.5, 12)
  cell('Escala', tb.scale || '—', x3 + c4 * 0.5, y0, c4 * 0.5, 9)
  cell('Rev.', tb.revision || '0', x3, y0 + h * 0.33, c4 * 0.5, 9)
  cell('Data', tb.date || shortDate().slice(0, 10), x3 + c4 * 0.5, y0 + h * 0.33, c4 * 0.5, 8)
  cell('Página', `${pageIndex} / ${pageCount}`, x3, y0 + h * 0.66, c4 * 0.5, 8)
  if (tb.notes) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6); doc.setTextColor(MUTED)
    doc.text(doc.splitTextToSize(tb.notes, c4 * 0.5 - 6).slice(0, 2), x3 + c4 * 0.5 + 3, y0 + h * 0.66 + 14)
  }
}

function footers(doc: jsPDF, projectName: string, titleBlock?: PdfTitleBlock) {
  const pages = doc.getNumberOfPages()
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i)
    if (titleBlock?.enabled) {
      drawTitleBlock(doc, titleBlock, i, pages)
      continue
    }
    doc.setDrawColor('#d7deeb')
    doc.setLineWidth(0.6)
    doc.line(MARGIN, PAGE_H - 30, PAGE_W - MARGIN, PAGE_H - 30)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(MUTED)
    doc.text(`Gerado por DC-Simu · ${shortDate()}`, MARGIN, PAGE_H - 18)
    if (i > 1) doc.text(projectName.length > 48 ? `${projectName.slice(0, 47)}…` : projectName, PAGE_W / 2, PAGE_H - 18, { align: 'center' })
    doc.text(`Página ${i} de ${pages}`, PAGE_W - MARGIN, PAGE_H - 18, { align: 'right' })
  }
}


function coverPage(doc: jsPDF, src: PdfProjectSource, contents: string[]) {
  // banda superior da marca
  doc.setFillColor(BRAND)
  doc.rect(0, 0, PAGE_W, 150, 'F')
  drawLogo(doc, MARGIN, 42, 64)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor('#ffffff')
  doc.setFontSize(26)
  doc.text('DC-Simu', MARGIN + 80, 76)
  doc.setFontSize(12)
  doc.setFont('helvetica', 'normal')
  doc.text('Simulador de Automação Industrial — Documentação do Projeto', MARGIN + 80, 96)

  doc.setTextColor(INK)
  doc.setFontSize(30)
  doc.setFont('helvetica', 'bold')
  doc.text(src.projectName || 'Projeto sem nome', MARGIN, 220)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  doc.setTextColor(MUTED)
  doc.text(`Exportado a ${shortDate()}`, MARGIN, 244)

  const blocks = collectLadderBlocks(src)
  const networks = blocks.reduce((n, b) => n + b.rungs.length, 0)
  const steps = src.grafcet?.steps?.length ?? 0
  const transitions = src.grafcet?.transitions?.length ?? 0
  const stats: Array<[string, string]> = [
    ['Componentes no esquema', String(src.components.length)],
    ['Fios', String(src.wires.length)],
    ['Blocos de ladder', String(blocks.length)],
    ['Networks de ladder', String(networks)],
    ['Etapas GRAFCET', String(steps)],
    ['Transições GRAFCET', String(transitions)],
    ['Tags', String(src.tags.length)],
    ['Páginas GRAFCET', String(src.grafcet?.charts?.length || 1)],
  ]
  let y = 300
  doc.setFontSize(11)
  for (const [k, v] of stats) {
    doc.setTextColor(MUTED)
    doc.setFont('helvetica', 'normal')
    doc.text(k, MARGIN, y)
    doc.setTextColor(INK)
    doc.setFont('helvetica', 'bold')
    doc.text(v, MARGIN + 200, y)
    y += 22
  }

  doc.setDrawColor('#d7deeb')
  doc.setLineWidth(0.8)
  doc.line(MARGIN, y + 10, PAGE_W - MARGIN, y + 10)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(MUTED)
  doc.text('Documento gerado automaticamente pela plataforma DC-Simu.', MARGIN, y + 32)
  doc.text('Inclui os conteúdos escolhidos no diálogo de exportação.', MARGIN, y + 46)

  if (contents.length) {
    let cy = y + 86
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(BRAND)
    doc.text('Conteúdo deste documento', MARGIN, cy)
    cy += 18
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(INK)
    for (const item of contents.slice(0, Math.max(0, Math.floor((footerSafeY() - 30 - cy) / 15)))) {
      doc.setFillColor(BRAND); doc.circle(MARGIN + 3, cy - 3, 1.8, 'F')
      doc.text(item, MARGIN + 14, cy)
      cy += 15
    }
  }
}

function infoPage(doc: jsPDF, src: PdfProjectSource) {
  header(doc, 'Informações do projeto', src.projectName)
  let y = 92
  const line = (k: string, v: string) => {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(INK); doc.text(k, MARGIN, y)
    doc.setFont('helvetica', 'normal'); doc.setTextColor(MUTED)
    doc.text(doc.splitTextToSize(v, CONTENT_W - 180), MARGIN + 180, y)
    y += 20 + (doc.getTextDimensions(v).h > 12 ? 10 : 0)
  }
  line('Projeto', src.projectName || '—')
  line('Data de exportação', shortDate())
  line('Componentes', src.components.map((c) => c.type).join(', ') || '—')
  const blocks = collectLadderBlocks(src)
  line('Blocos de ladder', blocks.map((b) => `${b.title} (${b.rungs.length} networks)`).join('  ·  ') || '—')
  line('GRAFCET', `${src.grafcet?.name?.trim() || 'Sequência'}: ${src.grafcet?.steps?.length ?? 0} etapas, ${src.grafcet?.transitions?.length ?? 0} transições`)
}

function tagsPage(doc: jsPDF, src: PdfProjectSource) {
  header(doc, 'Tabela de tags', src.projectName)
  let y = 92
  const cols: Array<[string, number]> = [['Nome', 8], ['Endereço', 158], ['Tipo', 248], ['Comentário', 318]]
  const tableHead = () => {
    doc.setFillColor('#eef3ff'); doc.rect(MARGIN, y - 12, CONTENT_W, 20, 'F')
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(BRAND)
    for (const [h, dx] of cols) doc.text(h, MARGIN + dx, y + 1)
    y += 22
  }
  tableHead()
  doc.setFont('helvetica', 'normal'); doc.setTextColor(INK)
  const sorted = [...src.tags].sort((a, b) => a.address.localeCompare(b.address, undefined, { numeric: true }))
  if (!sorted.length) { doc.setTextColor(MUTED); doc.text('Sem tags definidas no projeto.', MARGIN, y); return }
  sorted.forEach((t, i) => {
    const note = doc.splitTextToSize(t.comment || '', CONTENT_W - 326) as string[]
    const rowH = Math.max(18, note.length * 11 + 7)
    if (y + rowH > footerSafeY() - 20) { doc.addPage(); header(doc, 'Tabela de tags', src.projectName); y = 92; tableHead() }
    if (i % 2 === 0) { doc.setFillColor('#f7f9fd'); doc.rect(MARGIN, y - 11, CONTENT_W, rowH, 'F') }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(INK)
    doc.text(t.name || '—', MARGIN + 8, y + 2)
    doc.setFont('courier', 'normal'); doc.text(`%${t.address}`, MARGIN + 158, y + 2)
    doc.setFont('helvetica', 'normal'); doc.text(t.dataType || '—', MARGIN + 248, y + 2)
    doc.setTextColor(MUTED); doc.text(note, MARGIN + 318, y + 2); doc.setTextColor(INK)
    y += rowH
  })
}

/** Insere uma imagem JPEG dimensionada à largura útil; devolve a altura ocupada. */
function addImageFit(doc: jsPDF, dataUrl: string, y: number, maxH: number, caption?: string) {
  const w = CONTENT_W
  const h = Math.min(maxH, (w * 600) / 960 - (caption ? 42 : 34)) // as covers são 960×600 com moldura
  if (y + h > PAGE_H - 44) { doc.addPage(); y = MARGIN + 30 }
  doc.addImage(dataUrl, 'JPEG', MARGIN, y, w, h)
  let ny = y + h
  if (caption) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(MUTED)
    doc.text(caption, MARGIN, ny + 12)
    doc.setTextColor(INK)
    ny += 20
  }
  return ny
}

const canRaster = () => typeof document !== 'undefined' && typeof Image !== 'undefined'

/** Imagens capturadas do editor REAL (opcional — no browser). Quando presentes,
 *  o PDF usa os desenhos verdadeiros das networks/páginas em vez do resumo gerado. */
export interface PdfCaptureHooks {
  /** Por network selecionada: índice no bloco + PNG 2× do SVG real. */
  captureLadder?: (picks: Array<{ rung: LadderRung; rungIndex: number }>) => Promise<Array<{ rungIndex: number; png: string; w: number; h: number }>>
  /** Por página do GRAFCET (null = programa sem páginas): PNG 2× recortado ao conteúdo. */
  captureGrafcet?: (chartId: string | null) => Promise<{ png: string; w: number; h: number } | null>
}

export interface PdfExportResult {
  blob: Blob
  pages: number
  sections: string[]
  /** imagens que não puderam ser capturadas neste contexto (ex.: sem 3D montado) */
  skippedImages: string[]
}

/**
 * Gera o PDF do projeto conforme a seleção do utilizador.
 * `schematicImage` é opcional: quando omisso tenta-se `captureCover()` (vista 3D real).
 */
export async function generateProjectPdf(src: PdfProjectSource, opts: PdfExportOptions, schematicImage?: string | null, hooks: PdfCaptureHooks = {}): Promise<PdfExportResult> {
  applyPageLayout(opts.orientation ?? 'portrait', !!opts.titleBlock?.enabled)
  const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: opts.orientation === 'landscape' ? 'landscape' : 'portrait' })
  const sections: string[] = []
  const skippedImages: string[] = []
  let first = true
  const newPage = () => { if (first) first = false; else doc.addPage() }

  if (opts.cover) {
    const blocksPlan = collectLadderBlocks(src).filter((b) => (opts.ladder[b.id] ?? []).length > 0)
    const contents = [
      opts.info && 'Informações do projeto',
      opts.tags && src.tags.length > 0 && `Tabela de tags (${src.tags.length})`,
      opts.schematic && src.components.length > 0 && 'Esquema elétrico',
      opts.grafcet && (src.grafcet?.steps?.length ?? 0) > 0 && `GRAFCET (${src.grafcet.steps.length} etapas)`,
      ...blocksPlan.map((b) => `Ladder — ${b.title} (${(opts.ladder[b.id] ?? []).length} networks)`),
    ].filter(Boolean) as string[]
    newPage(); coverPage(doc, src, contents); sections.push('Capa')
  }
  if (opts.info) { newPage(); infoPage(doc, src); sections.push('Informações do projeto') }
  if (opts.tags && src.tags.length > 0) { newPage(); tagsPage(doc, src); sections.push('Tabela de tags') }

  if (opts.schematic && src.components.length === 0) {
    // Sem componentes a captura seria uma grelha vazia: não gasta uma página.
    skippedImages.push('Esquema elétrico (o projeto não tem componentes no esquema)')
  } else if (opts.schematic) {
    const shot = schematicImage ?? (canRaster() ? captureCover() : null)
    if (shot) {
      newPage(); header(doc, 'Esquema elétrico (vista 3D)', src.projectName)
      // a captura da cena 3D é 4:3 ou 16:9 conforme a câmara; caixa de segurança generosa
      const w = CONTENT_W; const h = Math.min(560, w * 0.66)
      doc.addImage(shot, 'JPEG', MARGIN, 100, w, h)
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(MUTED)
      doc.text('Vista do quadro/circuito tal como está montado no editor DC-Simu.', MARGIN, 100 + h + 12)
      doc.setTextColor(INK)
      sections.push('Esquema elétrico')
    } else skippedImages.push('Esquema elétrico (sem vista 3D disponível — abra o projeto no editor 3D)')
  }

  if (opts.grafcet && src.grafcet?.steps?.length) {
    const charts: Array<GrafcetChart | null> = src.grafcet.charts?.length
      ? src.grafcet.charts.filter((c) => !opts.grafcetCharts.length || opts.grafcetCharts.includes(c.id))
      : [null]
    for (const chart of charts) {
      const program: GrafcetProgram = chart
        ? {
            ...src.grafcet,
            steps: src.grafcet.steps.filter((s) => (s.chart ?? src.grafcet.charts![0]?.id) === chart.id),
            transitions: (src.grafcet.transitions ?? []).filter((t) => (t.chart ?? src.grafcet.charts![0]?.id) === chart.id),
            freeActions: (src.grafcet.freeActions ?? []).filter((a) => (a.chart ?? src.grafcet.charts![0]?.id) === chart.id),
            comments: (src.grafcet.comments ?? []).filter((c) => (c.chart ?? src.grafcet.charts![0]?.id) === chart.id),
            charts: undefined,
          }
        : src.grafcet
      if (!program.steps.length) continue
      const title = chart ? `GRAFCET — ${chart.title || chart.name}` : 'GRAFCET'
      const caption = `${program.steps.length} etapas · ${(program.transitions ?? []).length} transições`
      // 1.ª escolha: o editor GRAFCET verdadeiro (mesmo desenho do ecrã)
      let realCap: { png: string; w: number; h: number } | null = null
      if (hooks.captureGrafcet) {
        try { realCap = await hooks.captureGrafcet(chart?.id ?? null) } catch { realCap = null }
      }
      const svg = realCap ? null : grafcetCoverSvg(program, title)
      const img = !realCap && canRaster() && svg ? await svgToJpegDataUrl(svg) : null
      newPage(); header(doc, 'GRAFCET', src.projectName)
      if (realCap) {
        const w = CONTENT_W
        const h = Math.min(footerSafeY() - 160, (w * realCap.h) / realCap.w)
        doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(BRAND)
        doc.text(title, MARGIN, 84)
        doc.setTextColor(INK)
        doc.setDrawColor('#d7deeb'); doc.setLineWidth(0.8)
        doc.roundedRect(MARGIN, 94, w, h, 6, 6)
        doc.addImage(realCap.png, 'PNG', MARGIN + 1, 95, w - 2, h - 2)
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(MUTED)
        doc.text(`${caption} · desenho real do editor`, MARGIN, 94 + h + 14)
        doc.setTextColor(INK)
      } else if (img) {
        addImageFit(doc, img, 92, footerSafeY() - 150, caption)
      } else {
        doc.setTextColor(MUTED); doc.setFontSize(10)
        doc.text(`Diagrama indisponível neste contexto — ${program.steps.length} etapas, ${(program.transitions ?? []).length} transições.`, MARGIN, 100)
        doc.setTextColor(INK)
        skippedImages.push(title)
      }
      sections.push(title)
    }
  }

  const blocks = collectLadderBlocks(src)
  const chosen = blocks.filter((b) => (opts.ladder[b.id] ?? []).length > 0)
  for (const block of chosen) {
    const indices = (opts.ladder[block.id] ?? [])
    const rungs = selectedRungs(block, indices)
    if (!rungs.length) continue
    newPage(); header(doc, `Ladder — ${block.title}`, src.projectName)
    // 1.ª escolha: cada network com o desenho REAL do editor (NetworkDiagram),
    // incluindo o estado vivo da simulação (verde = energizado).
    let real: Array<{ rungIndex: number; png: string; w: number; h: number }> = []
    if (hooks.captureLadder) {
      try { real = await hooks.captureLadder(rungs.map((rung, i) => ({ rung, rungIndex: indices[i] ?? i }))) } catch { real = [] }
    }
    if (real.length) {
      let y = 92
      const byIndex = new Map(real.map((c) => [c.rungIndex, c]))
      rungs.forEach((rung, i) => {
        const idx = indices[i] ?? i
        const cap = byIndex.get(idx)
        const num = `Network ${idx + 1}`
        const title = rung.name?.trim()
        const headH = 16
        const imgH = cap ? Math.min((CONTENT_W * cap.h) / cap.w, 320) : 0
        if (y + headH + imgH + 14 > footerSafeY() - 26) { doc.addPage(); header(doc, `Ladder — ${block.title}`, src.projectName); y = 92 }
        doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(BRAND)
        doc.text(title ? `${num} — ${title}` : num, MARGIN, y + 10)
        y += headH
        if (cap) {
          doc.setDrawColor('#d7deeb'); doc.setLineWidth(0.8)
          doc.roundedRect(MARGIN, y, CONTENT_W, imgH, 6, 6)
          doc.addImage(cap.png, 'PNG', MARGIN + 1, y + 1, CONTENT_W - 2, imgH - 2)
          y += imgH + 14
        } else {
          doc.setFont('helvetica', 'normal'); doc.setTextColor(MUTED); doc.text('(imagem indisponível)', MARGIN, y + 8); y += 18
        }
        doc.setTextColor(INK)
      })
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(MUTED)
      if (y + 14 > footerSafeY() - 20) { doc.addPage(); header(doc, `Ladder — ${block.title}`, src.projectName); y = 92 }
      doc.text(`Desenho real do editor · ${real.length} de ${block.rungs.length} networks exportadas`, MARGIN, y + 10)
      doc.setTextColor(INK)
    } else {
      // Reserva: diagrama gerado (mesma linguagem visual, sem captura disponível)
      const svg = ladderCoverSvg(rungs, block.title)
      const img = canRaster() && svg ? await svgToJpegDataUrl(svg) : null
      if (img) {
        addImageFit(doc, img, 92, footerSafeY() - 150, `${rungs.length} de ${block.rungs.length} networks exportadas`)
      } else {
        doc.setFont('helvetica', 'normal'); doc.setFontSize(10)
        let y = 96
        rungs.forEach((r, i) => {
          if (y > footerSafeY() - 30) return
          doc.setTextColor(MUTED); doc.text(`Network ${(indices[i] ?? i) + 1}`, MARGIN, y)
          doc.setTextColor(INK); doc.text(r.name || '—', MARGIN + 80, y)
          y += 16
        })
        skippedImages.push(`Ladder — ${block.title}`)
      }
    }
    sections.push(`Ladder — ${block.title}`)
  }

  footers(doc, src.projectName || 'Projeto', opts.titleBlock)
  return { blob: doc.output('blob'), pages: doc.getNumberOfPages(), sections, skippedImages }
}
