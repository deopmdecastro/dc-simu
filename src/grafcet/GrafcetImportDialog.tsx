import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import PropertyDialog from '../ui/PropertyDialog'
import { MAX_GRAFCET_IMPORT_BYTES } from './importFile'
import { IconFileUpload, IconImport } from '../ui/icons'

const ACCEPT = '.ct,.json,.grafcet'
const MAX_MB = Math.round(MAX_GRAFCET_IMPORT_BYTES / (1024 * 1024))

const extensionOf = (name: string) => name.trim().toLowerCase().match(/\.[^.]+$/)?.[0] ?? ''
const acceptedFileError = (file: File) => {
  const extension = extensionOf(file.name)
  if (!['.ct', '.json', '.grafcet'].includes(extension)) return 'Formato não suportado. Escolha um ficheiro .ct, .json ou .grafcet.'
  if (!file.size || file.size > MAX_GRAFCET_IMPORT_BYTES) return `Escolha um ficheiro GRAFCET até ${MAX_MB} MB.`
  return ''
}

/** Entrada explícita e acessível para importar GRAFCET sem depender do seletor nativo do browser. */
export default function GrafcetImportDialog({ open, onClose, onChoose }: {
  open: boolean
  onClose: () => void
  onChoose: (file: File) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setDragging(false)
    setError('')
  }, [open])

  const choose = (file: File | undefined) => {
    if (!file) return
    const problem = acceptedFileError(file)
    if (problem) {
      setError(problem)
      return
    }
    onChoose(file)
    onClose()
  }

  const onInput = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.currentTarget.value = ''
    choose(file)
  }

  const onDrop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault()
    setDragging(false)
    choose(event.dataTransfer.files?.[0])
  }

  return (
    <PropertyDialog
      open={open}
      id="grafcet-import-dialog"
      className="grafcet-compact-dialog grafcet-import-dialog"
      title="Importar GRAFCET"
      subtitle="Escolha um ficheiro ou arraste-o para a zona abaixo."
      eyebrow="GRAFCET · IMPORTAÇÃO"
      hideSave
      closeLabel="Cancelar"
      footerHint="A importação substitui o diagrama atual; pode desfazer depois"
      onClose={onClose}
      onSave={() => undefined}
    >
      <div className="grafcet-import-body">
        <input ref={inputRef} type="file" hidden accept={ACCEPT} onChange={onInput} />
        <section
          className={`grafcet-import-dropzone${dragging ? ' is-dragging' : ''}`}
          aria-label="Zona para largar ficheiro GRAFCET"
          onDragEnter={(event) => { event.preventDefault(); setDragging(true) }}
          onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; setDragging(true) }}
          onDragLeave={(event) => { if (event.currentTarget === event.target) setDragging(false) }}
          onDrop={onDrop}
        >
          <span className="grafcet-import-drop-icon" aria-hidden="true"><IconFileUpload size={26} /></span>
          <strong>Arraste e solte o ficheiro aqui</strong>
          <span>ou</span>
          <button type="button" className="dc-btn dc-btn-primary" data-initial-focus onClick={() => inputRef.current?.click()}><IconImport size={15} />Escolher ficheiro</button>
          <small>Máximo de {MAX_MB} MB · é importado um ficheiro de cada vez</small>
        </section>

        {error && <p className="grafcet-import-error" role="alert">{error}</p>}

        <section className="grafcet-import-formats" aria-labelledby="grafcet-import-formats-title">
          <h3 id="grafcet-import-formats-title">Formatos aceites</h3>
          <div className="grafcet-import-format-list">
            <article><code>.ct</code><div><strong>FluidSIM 4</strong><span>Ficheiro CT de GRAFCET; elementos suportados são convertidos para o diagrama.</span></div></article>
            <article><code>.json</code><div><strong>Exportação DC-Simu</strong><span>Projeto GRAFCET exportado em JSON.</span></div></article>
            <article><code>.grafcet</code><div><strong>Projeto GRAFCET</strong><span>Formato JSON com extensão de projeto.</span></div></article>
          </div>
        </section>

        <p className="grafcet-import-note">Antes de aplicar, verá um resumo do conteúdo e eventuais avisos. A importação substitui todas as páginas GRAFCET do projeto atual, mas pode ser desfeita.</p>
      </div>
    </PropertyDialog>
  )
}
