/** Diálogo «Exportar para PDF»: escolher o que entra no documento —
 *  capa/dados, tabela de tags, esquema 3D, páginas de GRAFCET e blocos
 *  de ladder com seleção network a network. */
import { useMemo, useState } from 'react'
import PropertyDialog from '../ui/PropertyDialog'
import { useSimStore } from '../store/useSimStore'
import {
  collectLadderBlocks, defaultPdfOptions, generateProjectPdf,
  type PdfExportOptions, type PdfLadderBlock,
} from './pdfExport'

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
  const toggleRung = (block: PdfLadderBlock, index: number) => {
    const cur = new Set(opts.ladder[block.id] ?? [])
    if (cur.has(index)) cur.delete(index); else cur.add(index)
    setOpts({ ...opts, ladder: { ...opts.ladder, [block.id]: [...cur].sort((a, b) => a - b) } })
  }

  const nothing =
    !opts.cover && !opts.info && !opts.tags && !opts.schematic && !opts.grafcet &&
    !Object.values(opts.ladder).some((v) => v.length > 0)

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
        projectFiles: s.projectFiles,
        grafcet: s.grafcet,
        tags: s.tags,
        components: s.components,
        wires: s.wires,
      }, opts)
      saveBlob(result.blob, `dc-simu-${fileSlugOf(s.currentProjectName)}.pdf`)
      setNotice(
        result.skippedImages.length
          ? `PDF gerado (${result.pages} páginas). Nota: ${result.skippedImages.join('; ')}.`
          : `PDF gerado com ${result.pages} páginas.`,
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
      title="Exportar para PDF" subtitle="Escolhe os conteúdos do documento"
      onClose={onClose} onSave={() => void run()}
      saveLabel={busy ? 'A gerar…' : 'Exportar PDF'} saveDisabled={busy || nothing}
      closeLabel="Fechar" footerHint=""
      className="pdf-export-dialog"
    >
      <div className="pdf-export-body">
        <section>
          <strong>Documento</strong>
          <label><input type="checkbox" checked={opts.cover} onChange={() => toggle('cover')} /> Capa com dados da plataforma e estatísticas</label>
          <label><input type="checkbox" checked={opts.info} onChange={() => toggle('info')} /> Informações do projeto</label>
          <label><input type="checkbox" checked={opts.tags} onChange={() => toggle('tags')} /> Tabela de tags ({state.tags.length})</label>
        </section>
        <section>
          <strong>Esquema</strong>
          <label><input type="checkbox" checked={opts.schematic} onChange={() => toggle('schematic')} /> Esquema elétrico — vista 3D atual ({state.components.length} componentes)</label>
        </section>
        <section>
          <label><input type="checkbox" checked={opts.grafcet} onChange={() => toggle('grafcet')} /> <strong>GRAFCET</strong> ({state.grafcet.steps.length} etapas)</label>
          {charts.length > 1 && opts.grafcet && (
            <div className="pdf-export-sub">
              Páginas:
              {charts.map((c) => (
                <label key={c.id} className="pdf-export-chip">
                  <input type="checkbox" checked={chartPicked(c.id)} onChange={() => toggleChart(c.id)} /> {c.title || c.name}
                </label>
              ))}
            </div>
          )}
        </section>
        <section>
          <strong>Ladder</strong>
          <ul className="pdf-export-blocks">
            {blocks.map((block) => {
              const picked = opts.ladder[block.id] ?? []
              const openBlock = expanded === block.id
              return (
                <li key={block.id}>
                  <div className="pdf-export-block-row">
                    <label>
                      <input
                        type="checkbox"
                        checked={picked.length === block.rungs.length && block.rungs.length > 0}
                        ref={(el) => { if (el) el.indeterminate = picked.length > 0 && picked.length < block.rungs.length }}
                        onChange={() => toggleBlock(block)}
                      />
                      {block.title} <em>({picked.length}/{block.rungs.length} networks)</em>
                    </label>
                    {block.rungs.length > 0 && (
                      <button type="button" className="pdf-export-expand" onClick={() => setExpanded(openBlock ? null : block.id)}>
                        {openBlock ? '▾ networks' : '▸ escolher networks'}
                      </button>
                    )}
                  </div>
                  {openBlock && (
                    <div className="pdf-export-rungs">
                      {block.rungs.map((r, i) => (
                        <label key={r.id}>
                          <input type="checkbox" checked={picked.includes(i)} onChange={() => toggleRung(block, i)} />
                          Network {i + 1}{r.name ? ` — ${r.name}` : ''}
                        </label>
                      ))}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </section>
        {notice && <p className="pdf-export-notice">{notice}</p>}
      </div>
    </PropertyDialog>
  )
}
