/** Exportação PDF — modelo de seleção e geração headless (sem DOM → imagens omitidas,
 *  mas capa/info/tags/listagens de networks têm de sair e o Blob tem de ser válido).
 *  Corre com `npx tsx scripts/pdf-export-smoke.ts`. */
import { collectLadderBlocks, defaultPdfOptions, generateProjectPdf, selectedRungs, type PdfProjectSource } from '../src/export/pdfExport'

let checks = 0
const ok = (label: string, condition: boolean) => {
  checks += 1
  if (!condition) { console.error(`[pdf-export] ${label}`); process.exit(1) }
}

const rung = (id: string, name: string) => ({ id, name, branches: [], coils: [], enabled: true, collapsed: false })
const src: PdfProjectSource = {
  projectName: 'Célula Pick&Place',
  ladder: [rung('m1', 'Partida'), rung('m2', 'Segurança'), rung('m3', '')],
  fcBlocks: { fc1: [rung('f1', 'Controlo')], fc2: [] },
  projectFiles: {},
  grafcet: { name: 'Seq', steps: [{ id: 's1', name: 'S1', initial: true, action: '', condition: '' }], transitions: [{ id: 't1', from: ['s1'], to: [], condition: '' }] },
  tags: [
    { name: 'Start', address: 'I0.0', dataType: 'Bool', comment: 'botão' },
    { name: 'Motor', address: 'Q0.0', dataType: 'Bool' },
  ],
  components: [{ id: 'c1', type: 'plc-logo' }, { id: 'c2', type: 'motor' }],
  wires: [{}, {}],
}

// ---- coleta de blocos
const blocks = collectLadderBlocks(src)
ok('blocos: Main + FC1 (FC2 vazio fica de fora)', blocks.map((b) => b.id).join(',') === 'main,fc1')
ok('Main tem 3 networks', blocks[0].rungs.length === 3)

// ---- seleção
const opts = defaultPdfOptions(src)
ok('seleção por omissão: todas as networks dos dois blocos', opts.ladder.main.length === 3 && opts.ladder.fc1.length === 1)
ok('selectedRungs filtra índices', selectedRungs(blocks[0], [0, 2]).map((r) => r.id).join(',') === 'm1,m3')
ok('seleção vazia num bloco => nada', selectedRungs(blocks[0], []).length === 0)

// ---- geração headless (sem imagens rasterizadas; text pages only)
const main = async () => {
  const full = await generateProjectPdf(src, opts, null)
  ok('blob gerado e não vazio', full.blob.size > 400)
  const wanted = ['Capa', 'Informações do projeto', 'Tabela de tags', 'Ladder — Main [OB1]']
  ok('todas as secções presentes', wanted.every((s) => full.sections.some((x) => x.startsWith(s))) && full.sections.includes('GRAFCET'))
  ok('esquema sem 3D é reportado em skippedImages', full.skippedImages.some((s) => s.startsWith('Esquema')))
  ok('pelo menos 5 páginas', full.pages >= 5)

  const min = await generateProjectPdf(src, { cover: true, info: false, tags: false, schematic: false, grafcet: false, ladder: { main: [1] }, grafcetCharts: [] }, null)
  ok('seleção parcial: só capa + Main (1 network)', min.sections.length === 2 && min.sections.includes('Ladder — Main [OB1]'))
  ok('FC1 fora da seleção não aparece', !min.sections.some((s) => s.includes('FC1')))

  console.log(`[pdf-export] OK — ${checks} verificações`)
}
void main()
