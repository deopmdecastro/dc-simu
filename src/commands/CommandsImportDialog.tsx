/** Diálogo «Importar esquema» — FluidSIM 4 (.ct) e CADe SIMU (.cad / JSON). */
import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import PropertyDialog from '../ui/PropertyDialog'
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
      subtitle="FluidSIM 4 (.ct) ou CADe SIMU (.cad / JSON)"
      eyebrow="ESQUEMA IEC · IMPORTAÇÃO"
      hideSave
      closeLabel="Cancelar"
      footerHint={busy ? 'A ler ficheiro…' : 'A importação substitui o esquema atual; pode desfazer depois'}
      onClose={onClose}
      onSave={() => undefined}
    >
      <div className="grafcet-import-body">
        <fieldset className="grid gap-2 text-sm">
          <legend className="font-semibold mb-1">Origem</legend>
          <p className="text-[12.5px] leading-relaxed text-ink-500 m-0">
            <strong>FluidSIM 4</strong> — ficheiros <code>.ct</code> de circuitos elétricos ou pneumáticos
            (não GRAFCET; para GRAFCET use o editor GRAFCET → Importar).
          </p>
          <p className="text-[12.5px] leading-relaxed text-ink-500 m-0">
            <strong>CADe SIMU</strong> — ficheiros <code>.cad</code> (leitura parcial das referências) ou
            JSON intermédio (<code>dc-simu-cade-import</code>).
          </p>
        </fieldset>
        <input ref={inputRef} type="file" hidden accept={ACCEPT} onChange={onInput} disabled={busy} />
        <section
          className={`grafcet-import-dropzone ${dragging ? 'is-dragging' : ''}`}
          onDragEnter={(e) => { e.preventDefault(); setDragging(true) }}
          onDragOver={(e) => e.preventDefault()}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          <p>Arraste o ficheiro para aqui</p>
          <button type="button" className="dc-btn dc-btn-primary" disabled={busy} onClick={() => inputRef.current?.click()}>
            {busy ? 'A importar…' : 'Escolher ficheiro'}
          </button>
          <small>.ct · .cad · .json</small>
        </section>
        {error && <p className="grafcet-import-error" role="alert">{error}</p>}
      </div>
    </PropertyDialog>
  )
}
