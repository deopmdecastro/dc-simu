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
  type PdfExportOptions, type PdfLadderBlock,
} from './pdfExport'
import { captureGrafcetChart, captureLadderRungs } from './realCapture'

const saveBlob = (blob: Blob, name: string) => {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

const fileSlugOf = (name: string | null) =>
  (name ?? 'projeto').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'projeto'

const Section = ({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) => (
  <section className="pdfx-section">
    <header><strong>{title}</strong>{hint && <small>{hint}</small>}</header>
    {children}
  </section>
)

export default function ExportPdfDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [opts, setOpts] = useState<PdfExportOptions | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
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
    }))
    setExpanded(null)
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

  const toggle = (key: 'cover' | 'info' | 'tags' | 'schematic' | 'grafcet') => setOpts({ ...opts, [key]: !opts[key] })

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

  const schematicEmpty = state.components.length === 0
  const grafcetEmpty = state.grafcet.steps.length === 0
  const tagsEmpty = state.tags.length === 0

  const networksPicked = Object.values(opts.ladder).reduce((n, v) => n + v.length, 0)
  const networksTotal = blocks.reduce((n, b) => n + b.rungs.length, 0)
  // Só conta o que realmente entra no PDF (áreas vazias são omitidas).
  const nothing =
    !opts.cover && !opts.info && !(opts.tags && !tagsEmpty) && !(opts.schematic && !schematicEmpty) && !(opts.grafcet && !grafcetEmpty) && networksPicked === 0


  // Estimativa de páginas: capa/info/tags/esquema/GRAFCET = 1 cada; ladder ≈ 4 networks por página.
  const pageEstimate =
    (opts.cover ? 1 : 0) + (opts.info ? 1 : 0) + (opts.tags && !tagsEmpty ? Math.ceil(state.tags.length / 40) : 0) +
    (opts.schematic && !schematicEmpty ? 1 : 0) +
    (opts.grafcet && !grafcetEmpty ? Math.max(1, opts.grafcetCharts.length || charts.length) : 0) +
    blocks.reduce((n, b) => { const k = (opts.ladder[b.id] ?? []).length; return n + (k ? Math.ceil(k / 4) : 0) }, 0)

  const preset = (kind: 'all' | 'ladder' | 'none') => {
    const ladder: Record<string, number[]> = {}
    for (const b of blocks) ladder[b.id] = kind === 'none' ? [] : b.rungs.map((_, i) => i)
    setOpts({
      ...opts, ladder,
      cover: kind === 'all', info: kind === 'all', tags: kind === 'all',
      schematic: kind === 'all', grafcet: kind === 'all',
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
      }, opts, null, { captureLadder: captureLadderRungs, captureGrafcet: captureGrafcetChart })
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
      closeLabel="Fechar" footerHint={`${networksPicked}/${networksTotal} networks de ladder · ≈ ${pageEstimate} pág.`} saveShortcutLabel="exportar"
      className="pdf-export-dialog is-wide"
    >
      <div className="pdf-export-body">
        <div className="pdfx-toolbar" role="group" aria-label="Seleção rápida">
          <span className="pdfx-brand" aria-hidden="true"><svg width="22" height="22" viewBox="0 0 64 64"><rect x="3" y="3" width="58" height="58" rx="14" fill="#2655e5" /><path d="M35 10 17 35h12l-3 19 21-29H34z" fill="#fff" stroke="#fff" strokeLinejoin="round" strokeWidth="2" /></svg></span>
          <span className="pdfx-toolbar-label">Seleção rápida</span>
          <button type="button" onClick={() => preset('all')}>Tudo</button>
          <button type="button" onClick={() => preset('ladder')} disabled={networksTotal === 0} title={networksTotal === 0 ? 'Este projeto ainda não tem networks de ladder' : undefined}>Só ladder</button>
          <button type="button" onClick={() => preset('none')}>Nada</button>
          <span className="pdfx-pages" title="Estimativa — o número final depende do tamanho dos diagramas">≈ {pageEstimate} página{pageEstimate === 1 ? '' : 's'}</span>
        </div>
        <div className="pdf-export-grid">
          <Section title="Documento" hint="Estrutura e dados do projeto">
            <label><input type="checkbox" checked={opts.cover} onChange={() => toggle('cover')} /> <span>Capa com a marca DC-Simu e estatísticas</span></label>
            <label><input type="checkbox" checked={opts.info} onChange={() => toggle('info')} /> <span>Informações do projeto</span></label>
            <label className={tagsEmpty ? 'is-empty' : ''} title={tagsEmpty ? 'Sem tags — esta página seria omitida' : undefined}><input type="checkbox" checked={opts.tags && !tagsEmpty} disabled={tagsEmpty} onChange={() => toggle('tags')} /> <span>Tabela de tags <em>({tagsEmpty ? 'vazia — omitida' : state.tags.length})</em></span></label>
          </Section>
          <Section title="Diagramas" hint="Capturados tal como estão no editor">
            <label className={schematicEmpty ? 'is-empty' : ''} title={schematicEmpty ? 'Sem componentes no esquema — esta página seria omitida' : undefined}><input type="checkbox" checked={opts.schematic && !schematicEmpty} disabled={schematicEmpty} onChange={() => toggle('schematic')} /> <span>Esquema elétrico — vista 3D atual <em>({schematicEmpty ? 'vazio — omitido' : `${state.components.length} componentes`})</em></span></label>
            <label className={grafcetEmpty ? 'is-empty' : ''} title={grafcetEmpty ? 'Sem etapas GRAFCET — esta página seria omitida' : undefined}><input type="checkbox" checked={opts.grafcet && !grafcetEmpty} disabled={grafcetEmpty} onChange={() => toggle('grafcet')} /> <span><strong>GRAFCET</strong> <em>({grafcetEmpty ? 'vazio — omitido' : `${state.grafcet.steps.length} etapas`})</em></span></label>
            {charts.length > 1 && opts.grafcet && (
              <div className="pdf-export-sub">
                Páginas:
                {charts.map((c) => (
                  <label key={c.id} className={`pdf-export-chip ${chartPicked(c.id) ? 'is-on' : ''}`}>
                    <input type="checkbox" checked={chartPicked(c.id)} onChange={() => toggleChart(c.id)} /> {c.title || c.name}
                  </label>
                ))}
              </div>
            )}
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
        {busy && <p className="pdf-export-notice is-busy" role="status"><span className="pdfx-spinner" aria-hidden="true" /> A desenhar networks e diagramas do editor… pode demorar alguns segundos.</p>}
        {!busy && notice && <p className={`pdf-export-notice ${/^Falha/.test(notice) ? 'is-error' : 'is-ok'}`} role="status">{notice}</p>}
      </div>
    </PropertyDialog>
  )
}
