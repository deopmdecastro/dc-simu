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

  const min = await generateProjectPdf(src, { cover: true, info: false, tags: false, schematic: false, iec: false, iecPages: [], grafcet: false, ladder: { main: [1] }, grafcetCharts: [] }, null)
  ok('seleção parcial: só capa + Main (1 network)', min.sections.length === 2 && min.sections.includes('Ladder — Main [OB1]'))
  ok('FC1 fora da seleção não aparece', !min.sections.some((s) => s.includes('FC1')))

  const longProjectName = `PROJECT_INFO_START ${'Longa descrição de projeto industrial '.repeat(180)} PROJECT_INFO_END`
  const longInfo = await generateProjectPdf({
    ...src,
    projectName: longProjectName,
    components: Array.from({ length: 180 }, (_, i) => ({ id: `c${i}`, type: `COMPONENT_${String(i).padStart(3, '0')}` })),
    grafcet: { ...src.grafcet, name: `GRAFCET_INFO_START ${'Sequência de produção automatizada '.repeat(80)} GRAFCET_INFO_END` },
  }, {
    cover: false, info: true, tags: false, schematic: false, iec: false, iecPages: [],
    grafcet: false, ladder: {}, grafcetCharts: [], orientation: 'portrait',
    titleBlock: { ...opts.titleBlock, enabled: true },
  }, null)
  const longPdfText = await longInfo.blob.text()
  ok('metadados extensos criam páginas adicionais em vez de ultrapassar o rodapé', longInfo.pages >= 3)
  ok('o início e o fim dos metadados longos permanecem no PDF', longPdfText.includes('PROJECT_INFO_START') && longPdfText.includes('PROJECT_INFO_END'))
  ok('linhas de metadados posteriores continuam presentes após a paginação', longPdfText.includes('GRAFCET_INFO_START') && longPdfText.includes('GRAFCET_INFO_END') && longPdfText.includes('COMPONENT_179'))

  // ---- Esquema IEC: folhas com conteúdo entram, vazias não
  const withIec: PdfProjectSource = { ...src, components: [], wires: [], iec: [{ id: 'page-1', name: 'Potência', parts: 12 }, { id: 'page-2', name: 'Vazia', parts: 0 }] }
  const iecOpts = defaultPdfOptions(withIec)
  const tinyPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
  let asked: string[] = []
  const iec = await generateProjectPdf(withIec, { ...iecOpts, ladder: {} }, null, {
    captureIec: async (ids) => { asked = ids; return [{ pageId: 'page-1', name: 'Potência', png: tinyPng, w: 400, h: 300 }] },
  })
  ok('IEC: só a folha com símbolos é pedida', asked.join(',') === 'page-1')
  ok('IEC: secção «Esquema IEC — Potência» no PDF mesmo sem componentes 3D', iec.sections.includes('Esquema IEC — Potência') && !iec.sections.some((x) => x.includes('Vazia')))
  const noIec = await generateProjectPdf(withIec, { ...iecOpts, iec: false, ladder: {} }, null)
  ok('IEC desligado => sem secção IEC', !noIec.sections.some((x) => x.startsWith('Esquema IEC')))
  const only = await generateProjectPdf({ ...withIec, iec: [{ id: 'page-1', name: 'Potência', parts: 3 }, { id: 'page-2', name: 'Comando', parts: 5 }] }, { ...iecOpts, iecPages: ['page-2'], ladder: {} }, null, {
    captureIec: async (ids) => ids.map((id) => ({ pageId: id, name: 'Comando', png: tinyPng, w: 300, h: 200 })),
  })
  ok('IEC: escolha de folhas respeitada', only.sections.includes('Esquema IEC — Comando') && !only.sections.includes('Esquema IEC — Potência'))

  console.log(`[pdf-export] OK — ${checks} verificações`)
}
void main()
