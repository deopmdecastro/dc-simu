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
}

export interface PdfProjectSource {
  projectName: string
  ladder: LadderRung[]
  fcBlocks: { fc1: LadderRung[]; fc2: LadderRung[] }
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
  if (src.fcBlocks.fc1.length) blocks.push({ id: 'fc1', title: src.fcNames?.fc1?.trim() || 'FC1', rungs: src.fcBlocks.fc1 })
  if (src.fcBlocks.fc2.length) blocks.push({ id: 'fc2', title: src.fcNames?.fc2?.trim() || 'FC2', rungs: src.fcBlocks.fc2 })
  for (const files of Object.values(src.projectFiles ?? {}))
    for (const f of files ?? [])
      if (f.rungs?.length) blocks.push({ id: `file:${f.id}`, title: f.name || 'Bloco', rungs: f.rungs })
  return blocks
}

/** Seleção por omissão: tudo incluído. */
export function defaultPdfOptions(src: PdfProjectSource): PdfExportOptions {
  const ladder: Record<string, number[]> = {}
  for (const block of collectLadderBlocks(src)) ladder[block.id] = block.rungs.map((_, i) => i)
  return { cover: true, info: true, tags: true, schematic: true, grafcet: true, ladder, grafcetCharts: [] }
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

const PAGE_W = 595.28 // A4 em pontos
const PAGE_H = 841.89
const MARGIN = 48
const CONTENT_W = PAGE_W - MARGIN * 2

const shortDate = () => {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`
}

function header(doc: jsPDF, section: string, projectName: string) {
  doc.setFillColor(BRAND)
  doc.rect(0, 0, PAGE_W, 30, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor('#ffffff')
  doc.text('DC-Simu · Simulador de Automação Industrial', MARGIN, 19)
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

function footers(doc: jsPDF) {
  const pages = doc.getNumberOfPages()
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(MUTED)
    doc.text(`Gerado por DC-Simu · ${shortDate()}`, MARGIN, PAGE_H - 18)
    doc.text(`Página ${i} de ${pages}`, PAGE_W - MARGIN, PAGE_H - 18, { align: 'right' })
  }
  doc.setTextColor(INK)
}

function coverPage(doc: jsPDF, src: PdfProjectSource) {
  // banda superior da marca
  doc.setFillColor(BRAND)
  doc.rect(0, 0, PAGE_W, 150, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setTextColor('#ffffff')
  doc.setFontSize(26)
  doc.text('DC-Simu', MARGIN, 72)
  doc.setFontSize(12)
  doc.setFont('helvetica', 'normal')
  doc.text('Simulador de Automação Industrial — Documentação do Projeto', MARGIN, 94)

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
  const cols: Array<[string, number]> = [['Nome', 0], ['Endereço', 150], ['Tipo', 240], ['Comentário', 310]]
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(MUTED)
  for (const [h, dx] of cols) doc.text(h, MARGIN + dx, y)
  y += 6
  doc.setDrawColor('#d7deeb'); doc.setLineWidth(0.8); doc.line(MARGIN, y, PAGE_W - MARGIN, y)
  y += 14
  doc.setFont('helvetica', 'normal'); doc.setTextColor(INK)
  const sorted = [...src.tags].sort((a, b) => a.address.localeCompare(b.address, undefined, { numeric: true }))
  if (!sorted.length) { doc.setTextColor(MUTED); doc.text('Sem tags definidas no projeto.', MARGIN, y); return }
  for (const t of sorted) {
    if (y > PAGE_H - 60) { doc.addPage(); header(doc, 'Tabela de tags', src.projectName); y = 92 }
    doc.text(t.name || '—', MARGIN, y)
    doc.text(`%${t.address}`, MARGIN + 150, y)
    doc.text(t.dataType || '—', MARGIN + 240, y)
    doc.setTextColor(MUTED); doc.text(t.comment || '', MARGIN + 310, y); doc.setTextColor(INK)
    y += 14
  }
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
export async function generateProjectPdf(src: PdfProjectSource, opts: PdfExportOptions, schematicImage?: string | null): Promise<PdfExportResult> {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const sections: string[] = []
  const skippedImages: string[] = []
  let first = true
  const newPage = () => { if (first) first = false; else doc.addPage() }

  if (opts.cover) { newPage(); coverPage(doc, src); sections.push('Capa') }
  if (opts.info) { newPage(); infoPage(doc, src); sections.push('Informações do projeto') }
  if (opts.tags) { newPage(); tagsPage(doc, src); sections.push('Tabela de tags') }

  if (opts.schematic) {
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
      const svg = grafcetCoverSvg(program, title)
      const img = canRaster() && svg ? await svgToJpegDataUrl(svg) : null
      newPage(); header(doc, 'GRAFCET', src.projectName)
      if (img) {
        addImageFit(doc, img, 92, PAGE_H - 180, `${program.steps.length} etapas · ${(program.transitions ?? []).length} transições`)
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
    const rungs = selectedRungs(block, opts.ladder[block.id])
    if (!rungs.length) continue
    const svg = ladderCoverSvg(rungs, block.title)
    const img = canRaster() && svg ? await svgToJpegDataUrl(svg) : null
    newPage(); header(doc, `Ladder — ${block.title}`, src.projectName)
    if (img) {
      addImageFit(doc, img, 92, PAGE_H - 180, `${rungs.length} de ${block.rungs.length} networks exportadas`)
    } else {
      // sem DOM: listar as networks em texto para o PDF continuar útil (e testável)
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10)
      let y = 96
      rungs.forEach((r, i) => {
        if (y > PAGE_H - 60) return
        doc.setTextColor(MUTED); doc.text(`Network ${i + 1}`, MARGIN, y)
        doc.setTextColor(INK); doc.text(r.name || '—', MARGIN + 80, y)
        y += 16
      })
      skippedImages.push(`Ladder — ${block.title}`)
    }
    sections.push(`Ladder — ${block.title}`)
  }

  footers(doc)
  return { blob: doc.output('blob'), pages: doc.getNumberOfPages(), sections, skippedImages }
}
