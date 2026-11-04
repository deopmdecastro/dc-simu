/** Diálogo «Exportar para PDF»: escolher o que entra no documento —
 *  capa/dados, tabela de tags, esquema 3D, páginas de GRAFCET e blocos
 *  de ladder com seleção network a network. Desenho REAL do editor nas
 *  imagens (NetworkDiagram/GrafcetEditor montados fora do ecrã). */
import { useMemo, useState } from 'react'
import PropertyDialog from '../ui/PropertyDialog'
import { IconChevronDown } from '../ui/icons'
import { useSimStore } from '../store/useSimStore'
import {
  collectLadderBlocks, defaultPdfOptions, generateProjectPdf,
  type PdfExportOptions, type PdfLadderBlock, type PdfOrientation, type PdfTitleBlock,
} from './pdfExport'
import { captureGrafcetChart, captureIecPages, captureLadderRungs } from './realCapture'
import { pagesOf, partsOnPage } from '../commands/pages'

const saveBlob = (blob: Blob, name: string) => {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

/** Folhas do Esquema IEC e n.º de símbolos de cada uma. */
const iecSheetsOf = (diagram: ReturnType<typeof useSimStore.getState>['commands']) =>
  pagesOf(diagram).map((p) => ({ id: p.id, name: p.name, parts: partsOnPage(diagram, p.id).length }))

const fileSlugOf = (name: string | null) =>
  (name ?? 'projeto').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'projeto'

const Section = ({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) => (
  <section className="pdfx-section">
    <header><strong>{title}</strong>{hint && <small>{hint}</small>}</header>
    {children}
  </section>
)

type TitleField = [keyof PdfTitleBlock, string, string]
const TITLE_GROUPS: Array<{ title: string; columns: 2 | 4; fields: TitleField[] }> = [
  { title: 'Autoria', columns: 2, fields: [['company', 'Empresa / marca', 'Ex.: DC-Simu'], ['companyLine', 'Subtítulo da empresa', 'Ex.: Automação industrial'], ['author', 'Desenhado por', 'Nome'], ['role', 'Função', 'Ex.: Projetista']] },
  { title: 'Projeto', columns: 2, fields: [['projectName', 'Projeto', 'Nome do projeto'], ['drawingTitle', 'Título do desenho', 'Ex.: Documentação do projeto'], ['client', 'Cliente', 'Opcional'], ['location', 'Local', 'Opcional']] },
  { title: 'Folha', columns: 4, fields: [['sheetNumber', 'N.º da folha', '01'], ['revision', 'Revisão', '0'], ['date', 'Data', 'dd/mm/aaaa'], ['scale', 'Escala', '—'], ['discipline', 'Disciplina', 'Ex.: Automação'], ['notes', 'Notas', 'Opcional']] },
]

/** Símbolo DC-Simu (o mesmo desenhado no PDF). */
const LogoMark = ({ size = 22 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" className="pdfx-logo"><rect x="3" y="3" width="58" height="58" rx="14" fill="#2655e5" /><path d="M35 10 17 35h12l-3 19 21-29H34z" fill="#fff" stroke="#fff" strokeLinejoin="round" strokeWidth="2" /></svg>
)

/** Miniatura A4 com a esquadria no rodapé, para escolher a orientação de relance. */
const PageThumb = ({ orientation, titleBlock }: { orientation: PdfOrientation; titleBlock: boolean }) => {
  const [w, h] = orientation === 'portrait' ? [26, 36] : [36, 26]
  return (
    <svg className="pdfx-orient-thumb" width="40" height="40" viewBox="0 0 40 40" aria-hidden="true">
      <rect x={(40 - w) / 2} y={(40 - h) / 2} width={w} height={h} rx="2" fill="#fff" stroke="currentColor" strokeWidth="1.4" />
      {[0, 1, 2].map((i) => <line key={i} x1={(40 - w) / 2 + 4} x2={(40 + w) / 2 - 4} y1={(40 - h) / 2 + 6 + i * 4} y2={(40 - h) / 2 + 6 + i * 4} stroke="currentColor" strokeOpacity=".35" strokeWidth="1.4" />)}
      {titleBlock && <rect x={(40 - w) / 2 + 3} y={(40 + h) / 2 - 8} width={w - 6} height="5" rx="1" fill="currentColor" fillOpacity=".55" />}
    </svg>
  )
}

export default function ExportPdfDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [opts, setOpts] = useState<PdfExportOptions | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [tbOpen, setTbOpen] = useState(false)
  const [notice, setNotice] = useState('')

  // Fonte atual do projeto: lida na abertura (o diálogo não acompanha edições a meio).
  if (open && !opts) {
    const s = useSimStore.getState()
    setOpts(defaultPdfOptions({
      projectName: s.currentProjectName ?? 'Projeto sem nome',
      ladder: s.ladder.rungs,
      fcBlocks: s.fcBlocks,
      fcNames: s.fcNames,
      fcAdded: s.fcAdded,
      projectFiles: s.projectFiles,
      grafcet: s.grafcet,
      tags: s.tags,
      components: s.components,
      wires: s.wires,
      iec: iecSheetsOf(s.commands),
    }))
    setExpanded(null)
    setTbOpen(false)
    setNotice('')
  }
  if (!open && opts) { setOpts(null); setBusy(false) }

  const state = useSimStore.getState()
  const blocks = useMemo(() => collectLadderBlocks({
    projectName: state.currentProjectName ?? '',
    ladder: state.ladder.rungs,
    fcBlocks: state.fcBlocks,
    fcNames: state.fcNames,
    fcAdded: state.fcAdded,
    projectFiles: state.projectFiles,
    grafcet: state.grafcet,
    tags: state.tags,
    components: state.components,
    wires: state.wires,
  }), [state])
  const charts = state.grafcet.charts ?? []

  if (!open || !opts) return null

  const tb = opts.titleBlock
  const toggle = (key: 'cover' | 'info' | 'tags' | 'schematic' | 'iec' | 'grafcet') => setOpts({ ...opts, [key]: !opts[key] })

  const toggleChart = (id: string) => {
    const cur = opts.grafcetCharts.length ? opts.grafcetCharts : charts.map((c) => c.id)
    const next = cur.includes(id) ? cur.filter((c) => c !== id) : [...cur, id]
    const all = charts.map((c) => c.id)
    setOpts({ ...opts, grafcetCharts: next.length === all.length ? [] : next })
  }
  const chartPicked = (id: string) => (opts.grafcetCharts.length ? opts.grafcetCharts : charts.map((c) => c.id)).includes(id)

  const toggleBlock = (block: PdfLadderBlock) => {
    const cur = opts.ladder[block.id] ?? []
    setOpts({ ...opts, ladder: { ...opts.ladder, [block.id]: cur.length ? [] : block.rungs.map((_, i) => i) } })
  }
  const setBlockRungs = (block: PdfLadderBlock, indices: number[]) =>
    setOpts({ ...opts, ladder: { ...opts.ladder, [block.id]: indices.sort((a, b) => a - b) } })
  const toggleRung = (block: PdfLadderBlock, index: number) => {
    const cur = new Set(opts.ladder[block.id] ?? [])
    if (cur.has(index)) cur.delete(index); else cur.add(index)
    setBlockRungs(block, [...cur])
  }

  const iecSheets = iecSheetsOf(state.commands).filter((p) => p.parts > 0)
  const iecEmpty = iecSheets.length === 0
  const iecPicks = opts.iecPages.length ? opts.iecPages : iecSheets.map((p) => p.id)
  const iecPicked = (id: string) => iecPicks.includes(id)
  const toggleIecPage = (id: string) => {
    const next = iecPicked(id) ? iecPicks.filter((x) => x !== id) : [...iecPicks, id]
    setOpts({ ...opts, iecPages: next.length === iecSheets.length ? [] : next })
  }
  const iecCount = opts.iec && !iecEmpty ? iecPicks.filter((id) => iecSheets.some((p) => p.id === id)).length : 0
  const schematicEmpty = state.components.length === 0
  const grafcetEmpty = state.grafcet.steps.length === 0
  const tagsEmpty = state.tags.length === 0
  const omittedDiagrams = [schematicEmpty && 'Esquema 3D', iecEmpty && 'Esquema IEC', grafcetEmpty && 'GRAFCET'].filter(Boolean) as string[]

  const networksPicked = Object.values(opts.ladder).reduce((n, v) => n + v.length, 0)
  const networksTotal = blocks.reduce((n, b) => n + b.rungs.length, 0)
  // Só conta o que realmente entra no PDF (áreas vazias são omitidas).
  const nothing =
    !opts.cover && !opts.info && !(opts.tags && !tagsEmpty) && !(opts.schematic && !schematicEmpty) && iecCount === 0 && !(opts.grafcet && !grafcetEmpty) && networksPicked === 0


  // Estimativa de páginas: capa/info/tags/esquema/GRAFCET = 1 cada; ladder ≈ 4 networks por página.
  const pageEstimate =
    (opts.cover ? 1 : 0) + (opts.info ? 1 : 0) + (opts.tags && !tagsEmpty ? Math.ceil(state.tags.length / 40) : 0) +
    (opts.schematic && !schematicEmpty ? 1 : 0) + iecCount +
    (opts.grafcet && !grafcetEmpty ? Math.max(1, opts.grafcetCharts.length || charts.length) : 0) +
    blocks.reduce((n, b) => { const k = (opts.ladder[b.id] ?? []).length; return n + (k ? Math.ceil(k / 4) : 0) }, 0)

  // Resumo do que entra no documento, para o rodapé.
  const included = [
    opts.cover && 'Capa', opts.info && 'Informações', opts.tags && !tagsEmpty && 'Tags',
    opts.schematic && !schematicEmpty && 'Esquema 3D', iecCount > 0 && `IEC (${iecCount})`, opts.grafcet && !grafcetEmpty && 'GRAFCET',
    networksPicked > 0 && `${networksPicked}/${networksTotal} networks`,
  ].filter(Boolean) as string[]
  const footerHint = nothing ? 'Escolhe pelo menos um conteúdo para exportar' : `${included.join(' · ')} · A4 ${opts.orientation === 'portrait' ? 'vertical' : 'horizontal'}`

  const preset = (kind: 'all' | 'ladder' | 'none') => {
    const ladder: Record<string, number[]> = {}
    for (const b of blocks) ladder[b.id] = kind === 'none' ? [] : b.rungs.map((_, i) => i)
    setOpts({
      ...opts, ladder,
      cover: kind === 'all', info: kind === 'all', tags: kind === 'all',
      schematic: kind === 'all', iec: kind === 'all', grafcet: kind === 'all',
    })
  }

  const run = async () => {
    setBusy(true)
    setNotice('')
    try {
      const s = useSimStore.getState()
      const result = await generateProjectPdf({
        projectName: s.currentProjectName ?? 'Projeto sem nome',
        ladder: s.ladder.rungs,
        fcBlocks: s.fcBlocks,
        fcNames: s.fcNames,
      fcAdded: s.fcAdded,
        projectFiles: s.projectFiles,
        grafcet: s.grafcet,
        tags: s.tags,
        components: s.components,
        wires: s.wires,
        iec: iecSheetsOf(s.commands),
      }, opts, null, { captureLadder: captureLadderRungs, captureGrafcet: captureGrafcetChart, captureIec: captureIecPages })
      saveBlob(result.blob, `dc-simu-${fileSlugOf(s.currentProjectName)}.pdf`)
      setNotice(
        result.skippedImages.length
          ? `PDF gerado (${result.pages} páginas). Nota: ${result.skippedImages.join('; ')}.`
          : `PDF gerado com ${result.pages} páginas — com o desenho real do editor.`,
      )
    } catch (error) {
      console.error(error)
      setNotice('Falha ao gerar o PDF. Consulta a consola para detalhes.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <PropertyDialog
      open={open} id="export-pdf" eyebrow="Projeto · Exportação"
      title="Exportar para PDF" subtitle="Escolhe os conteúdos — o documento usa o desenho real do editor"
      onClose={onClose} onSave={() => void run()}
      saveLabel={busy ? 'A gerar…' : 'Exportar PDF'} saveDisabled={busy || nothing}
      closeLabel="Fechar" footerHint={footerHint} saveShortcutLabel="exportar"
      className="pdf-export-dialog is-wide"
    >
      <div className="pdf-export-body">
        <div className="pdfx-summary" role="group" aria-label="Resumo e seleção rápida">
          <div className="pdfx-summary-main">
            <span className="pdfx-summary-pages" title="Estimativa — o número final depende do tamanho dos diagramas"><b>≈ {pageEstimate}</b> página{pageEstimate === 1 ? '' : 's'}</span>
            <span className="pdfx-summary-list">{nothing ? 'Nada selecionado' : included.join(' · ')}</span>
          </div>
          <div className="pdfx-seg" role="group" aria-label="Seleção rápida">
            <button type="button" onClick={() => preset('all')}>Tudo</button>
            <button type="button" onClick={() => preset('ladder')} disabled={networksTotal === 0} title={networksTotal === 0 ? 'Este projeto ainda não tem networks de ladder' : undefined}>Só ladder</button>
            <button type="button" onClick={() => preset('none')}>Nada</button>
          </div>
        </div>
        <div className="pdf-export-grid">
          <Section title="Documento" hint="Capa e dados do projeto">
            <label><input type="checkbox" checked={opts.cover} onChange={() => toggle('cover')} /> <span>Capa com a marca DC-Simu e estatísticas</span></label>
            <label><input type="checkbox" checked={opts.info} onChange={() => toggle('info')} /> <span>Informações do projeto</span></label>
            {!tagsEmpty && <label><input type="checkbox" checked={opts.tags} onChange={() => toggle('tags')} /> <span>Tabela de tags <em>({state.tags.length})</em></span></label>}
            {tagsEmpty && <p className="pdfx-omitted">Sem conteúdo, omitido: <b>Tabela de tags</b></p>}
          </Section>
          <Section title="Diagramas" hint="Capturados tal como estão no editor">
            {!schematicEmpty && <label><input type="checkbox" checked={opts.schematic} onChange={() => toggle('schematic')} /> <span>Esquema 3D — vista atual <em>({state.components.length} componentes)</em></span></label>}
            {!iecEmpty && <label><input type="checkbox" checked={opts.iec} onChange={() => toggle('iec')} /> <span>Esquema IEC <em>({iecSheets.length} folha{iecSheets.length === 1 ? '' : 's'})</em></span></label>}
            {iecSheets.length > 1 && opts.iec && (
              <div className="pdf-export-sub">
                Folhas:
                {iecSheets.map((p) => (
                  <label key={p.id} className={`pdf-export-chip ${iecPicked(p.id) ? 'is-on' : ''}`}>
                    <input type="checkbox" checked={iecPicked(p.id)} onChange={() => toggleIecPage(p.id)} /> {p.name}
                  </label>
                ))}
              </div>
            )}
            {!grafcetEmpty && <label><input type="checkbox" checked={opts.grafcet} onChange={() => toggle('grafcet')} /> <span>GRAFCET <em>({state.grafcet.steps.length} etapas)</em></span></label>}
            {charts.length > 1 && opts.grafcet && !grafcetEmpty && (
              <div className="pdf-export-sub">
                Páginas:
                {charts.map((c) => (
                  <label key={c.id} className={`pdf-export-chip ${chartPicked(c.id) ? 'is-on' : ''}`}>
                    <input type="checkbox" checked={chartPicked(c.id)} onChange={() => toggleChart(c.id)} /> {c.title || c.name}
                  </label>
                ))}
              </div>
            )}
            {omittedDiagrams.length > 0 && <p className="pdfx-omitted">Sem conteúdo, omitido: <b>{omittedDiagrams.join(' · ')}</b></p>}
          </Section>
        </div>
        <Section title="Ladder" hint={networksTotal ? `${blocks.length} bloco(s) · escolhe blocos e networks` : 'sem networks'}>
          {!networksTotal && (
            <div className="pdfx-empty" role="note">
              <strong>Ainda não há networks de ladder neste projeto</strong>
              <span>Cria networks no editor Ladder (ou gera-as a partir do GRAFCET) e aparecem aqui para escolheres o que exportar.</span>
            </div>
          )}
          <ul className="pdf-export-blocks">
            {blocks.map((block) => {
              const picked = opts.ladder[block.id] ?? []
              const openBlock = expanded === block.id
              return (
                <li key={block.id} className={picked.length ? 'is-picked' : ''}>
                  <div className="pdf-export-block-row">
                    <label>
                      <input
                        type="checkbox"
                        checked={picked.length === block.rungs.length && block.rungs.length > 0}
                        ref={(el) => { if (el) el.indeterminate = picked.length > 0 && picked.length < block.rungs.length }}
                        onChange={() => toggleBlock(block)}
                      />
                      <span className="pdfx-block-name"><strong>{block.title}</strong><em>{picked.length}/{block.rungs.length} networks</em></span>
                    </label>
                    <span className="pdf-export-row-tools">
                      {block.rungs.length > 1 && <>
                        <button type="button" onClick={() => setBlockRungs(block, block.rungs.map((_, i) => i))}>todas</button>
                        <button type="button" onClick={() => setBlockRungs(block, [])}>nenhuma</button>
                        <span className="pdf-export-tools-sep" aria-hidden="true" />
                      </>}
                      {block.rungs.length > 0 && (
                        <button type="button" className={`pdf-export-expand ${openBlock ? 'is-open' : ''}`} onClick={() => setExpanded(openBlock ? null : block.id)} aria-expanded={openBlock}>
                          {openBlock ? 'fechar' : 'escolher networks'}
                          <IconChevronDown size={10} className="pdf-export-chevron" />
                        </button>
                      )}
                    </span>
                  </div>
                  {openBlock && (
                    <div className="pdf-export-rungs">
                      {block.rungs.map((r, i) => (
                        <label key={r.id}>
                          <input type="checkbox" checked={picked.includes(i)} onChange={() => toggleRung(block, i)} />
                          <span>Network {i + 1}{r.name ? ` — ${r.name}` : ''}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </Section>
        <Section title="Folha e esquadria" hint="Formato A4 e bloco de legenda de cada página">
          <div className="pdfx-orient" role="radiogroup" aria-label="Orientação">
            {([['portrait', 'Vertical', 'retrato · 210 × 297 mm'], ['landscape', 'Horizontal', 'paisagem · 297 × 210 mm']] as Array<[PdfOrientation, string, string]>).map(([value, label, detail]) => (
              <label key={value} className={`pdfx-orient-opt ${opts.orientation === value ? 'is-on' : ''}`}>
                <input type="radio" name="pdf-orient" checked={opts.orientation === value} onChange={() => setOpts({ ...opts, orientation: value })} />
                <PageThumb orientation={value} titleBlock={opts.titleBlock.enabled} />
                <span className="pdfx-orient-text"><strong>{label}</strong><small>{detail}</small></span>
              </label>
            ))}
          </div>
          <label className="pdfx-tb-enable">
            <input type="checkbox" checked={opts.titleBlock.enabled} onChange={() => setOpts({ ...opts, titleBlock: { ...opts.titleBlock, enabled: !opts.titleBlock.enabled } })} />
            <span><strong>Incluir esquadria</strong><small>{opts.titleBlock.enabled ? 'Aparece no rodapé de todas as páginas.' : 'Sem esquadria: só o nome do projeto e o número da página no rodapé.'}</small></span>
          </label>
          {opts.titleBlock.enabled && <>
            <div className="pdfx-tb-preview" aria-label="Pré-visualização da esquadria">
              <div className="pdfx-tb-company">{tb.logo && <LogoMark size={26} />}<span><b>{tb.company || 'Empresa'}</b><small>{tb.companyLine}</small></span></div>
              <div><small>{[tb.client, tb.location].filter(Boolean).join(' · ') || 'Cliente · Local'}</small><b>{tb.projectName || 'Projeto'}</b><small>{tb.drawingTitle}</small></div>
              <div className="pdfx-tb-preview-meta"><span>Folha <b>{tb.sheetNumber || '—'}</b></span><span>Rev. <b>{tb.revision || '—'}</b></span><span>Data <b>{tb.date || '—'}</b></span><span>Esc. <b>{tb.scale || '—'}</b></span></div>
            </div>
            <label className="pdfx-tb-enable pdfx-tb-logo">
              <input type="checkbox" checked={opts.titleBlock.logo} onChange={() => setOpts({ ...opts, titleBlock: { ...opts.titleBlock, logo: !opts.titleBlock.logo } })} />
              <span><strong>Logótipo na esquadria</strong><small>Símbolo DC-Simu ao lado do nome da empresa.</small></span>
            </label>
            <button type="button" className="pdfx-tb-toggle" onClick={() => setTbOpen(!tbOpen)} aria-expanded={tbOpen}>
              {tbOpen ? 'Esconder campos da esquadria' : 'Editar campos da esquadria'}
              <IconChevronDown size={10} className={`pdf-export-chevron ${tbOpen ? 'is-open' : ''}`} />
            </button>
            {tbOpen && <div className="pdfx-tb-fields">
            {TITLE_GROUPS.map((group) => (
              <fieldset key={group.title} className="pdfx-tb-group">
                <legend>{group.title}</legend>
                <div className={`pdfx-tb-grid is-${group.columns}`}>
                  {group.fields.map(([key, label, placeholder]) => (
                    <label key={key} className={`pdfx-tb-field${key === 'notes' ? ' is-wide' : ''}`}>
                      <span>{label}</span>
                      <input type="text" value={String(tb[key] ?? '')} placeholder={placeholder}
                        onChange={(e) => setOpts({ ...opts, titleBlock: { ...opts.titleBlock, [key]: e.target.value } })} />
                    </label>
                  ))}
                </div>
              </fieldset>
            ))}
            </div>}
          </>}
        </Section>
        {busy && <p className="pdf-export-notice is-busy" role="status"><span className="pdfx-spinner" aria-hidden="true" /> A desenhar networks e diagramas do editor… pode demorar alguns segundos.</p>}
        {!busy && notice && <p className={`pdf-export-notice ${/^Falha/.test(notice) ? 'is-error' : 'is-ok'}`} role="status">{notice}</p>}
      </div>
    </PropertyDialog>
  )
}
