import { useRef, useState } from 'react'
import { uiAlert } from '../ui/dialogs'
import { downloadWorkbook, readWorkbookFile, type RawSheet, type SheetData } from './sheetIO'

interface SheetTransferBarProps {
  /** Nome base dos ficheiros descarregados (sem extensão). */
  fileName: string
  /** Folhas do modelo vazio com exemplos e instruções. */
  template: () => SheetData[]
  /** Folhas com o conteúdo atual. */
  current: () => SheetData[]
  /** Recebe as folhas lidas; quem chama valida e mostra a pré-visualização. */
  onImport: (sheets: RawSheet[], fileName: string) => void
  disabled?: boolean
  className?: string
}

/** Modelo · Exportar · Importar — o mesmo trio de ações Excel em todas as tabelas da plataforma. */
export default function SheetTransferBar({ fileName, template, current, onImport, disabled = false, className = '' }: SheetTransferBarProps) {
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  const run = async (task: () => Promise<void>) => {
    setBusy(true)
    try { await task() } catch (error) { await uiAlert(error instanceof Error ? error.message : 'Não foi possível concluir a operação.', { title: 'Excel' }) } finally { setBusy(false) }
  }

  return (
    <div className={`sheet-bar ${className}`} role="group" aria-label="Tabela em Excel">
      <button type="button" className="dc-btn" disabled={busy} title="Descarrega um .xlsx de exemplo com instruções" onClick={() => run(() => downloadWorkbook(`${fileName}-modelo`, template()))}>Modelo</button>
      <button type="button" className="dc-btn" disabled={busy} title="Exporta a tabela atual para .xlsx" onClick={() => run(() => downloadWorkbook(fileName, current()))}>Exportar</button>
      <button type="button" className="dc-btn" disabled={busy || disabled} title="Importa uma tabela de um ficheiro .xlsx" onClick={() => input.current?.click()}>Importar</button>
      <input ref={input} type="file" hidden accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (file) void run(async () => onImport(await readWorkbookFile(file), file.name))
        }} />
    </div>
  )
}
