/** Diálogo «Importar esquema» — FluidSIM 4 (.ct) e CADe SIMU (.cad / JSON). */
import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import PropertyDialog from '../ui/PropertyDialog'
import { IconFileUpload, IconImport } from '../ui/icons'
import { importFluidSimCircuitFile, type CircuitImportResult } from './fluidSimCircuit'
import { importCadeSimuFile } from './cadeSimuImport'

const ACCEPT = '.ct,.cad,.json,application/json'

function acceptedFileError(file: File): string | null {
  const n = file.name.toLowerCase()
  if (n.endsWith('.ct') || n.endsWith('.cad') || n.endsWith('.json')) return null
  return 'Formatos aceites: .ct (FluidSIM 4), .cad (CADe SIMU) e .json intermédio.'
}

export default function CommandsImportDialog({
  open,
  onClose,
  onImported,
}: {
  open: boolean
  onClose: () => void
  onImported: (result: CircuitImportResult, source: string) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setDragging(false)
    setError('')
    setBusy(false)
  }, [open])

  const run = async (file: File | undefined) => {
    if (!file) return
    const problem = acceptedFileError(file)
    if (problem) { setError(problem); return }
    setBusy(true); setError('')
    try {
      const name = file.name.toLowerCase()
      const result = name.endsWith('.ct')
        ? await importFluidSimCircuitFile(file)
        : await importCadeSimuFile(file)
      onImported(result, file.name)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao importar o ficheiro.')
    } finally {
      setBusy(false)
    }
  }

  const onInput = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.currentTarget.value = ''
    void run(file)
  }

  const onDrop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault()
    setDragging(false)
    void run(event.dataTransfer.files?.[0])
  }

  return (
    <PropertyDialog
      open={open}
      id="commands-import-dialog"
      className="grafcet-compact-dialog grafcet-import-dialog"
      title="Importar esquema IEC"
      subtitle="Escolha um ficheiro ou arraste-o para a zona abaixo."
      eyebrow="ESQUEMA IEC · IMPORTAÇÃO"
      hideSave
      closeLabel="Cancelar"
      footerHint={busy ? 'A ler ficheiro…' : 'A importação substitui o esquema atual; pode desfazer depois'}
      onClose={onClose}
      onSave={() => undefined}
    >
      <div className="grafcet-import-body">
        <input ref={inputRef} type="file" hidden accept={ACCEPT} onChange={onInput} disabled={busy} />
        <section
          className={`grafcet-import-dropzone${dragging ? ' is-dragging' : ''}`}
          aria-label="Zona para largar ficheiro de esquema IEC"
          onDragEnter={(event) => { event.preventDefault(); setDragging(true) }}
          onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; setDragging(true) }}
          onDragLeave={(event) => { if (event.currentTarget === event.target) setDragging(false) }}
          onDrop={onDrop}
        >
          <span className="grafcet-import-drop-icon" aria-hidden="true"><IconFileUpload size={26} /></span>
          <strong>Arraste e solte o ficheiro aqui</strong>
          <span>ou</span>
          <button type="button" className="dc-btn dc-btn-primary" data-initial-focus disabled={busy} onClick={() => inputRef.current?.click()}>
            <IconImport size={15} />{busy ? 'A importar…' : 'Escolher ficheiro'}
          </button>
          <small>É importado um ficheiro de cada vez</small>
        </section>

        {error && <p className="grafcet-import-error" role="alert">{error}</p>}

        <section className="grafcet-import-formats" aria-labelledby="commands-import-formats-title">
          <h3 id="commands-import-formats-title">Formatos aceites</h3>
          <div className="grafcet-import-format-list">
            <article><code>.ct</code><div><strong>FluidSIM 4</strong><span>Circuitos elétricos ou pneumáticos (não GRAFCET; para GRAFCET use o editor GRAFCET → Importar).</span></div></article>
            <article><code>.cad</code><div><strong>CADe SIMU</strong><span>Símbolos, ligações e textos; os botões do painel de simulação do CADe ficam de fora — no DC-Simu clica-se no próprio símbolo.</span></div></article>
            <article><code>.json</code><div><strong>JSON intermédio</strong><span>Formato <code>dc-simu-cade-import</code>.</span></div></article>
          </div>
        </section>

        <p className="grafcet-import-note">A importação substitui todo o esquema IEC do projeto atual, mas pode ser desfeita.</p>
      </div>
    </PropertyDialog>
  )
}
