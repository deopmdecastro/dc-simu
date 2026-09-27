import { useEffect, useRef, useState } from 'react'
import type { ComponentType } from '../types'
import { getDatasheet, removeDatasheet, saveDatasheet, type Datasheet } from '../utils/datasheets'

/** A ficha é comum a todos os exemplares de um tipo, não é guardada no projeto. */
export default function DatasheetPanel({ type }: { type: ComponentType }) {
  const [entry, setEntry] = useState<Datasheet | undefined>()
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => {
    let active = true
    setBusy(true)
    setError('')
    setEntry(undefined)
    getDatasheet(type).then((found) => { if (active) setEntry(found) })
      .catch(() => { if (active) setError('Não foi possível aceder às fichas deste navegador.') })
      .finally(() => { if (active) setBusy(false) })
    return () => { active = false }
  }, [type])

  const openFile = (download: boolean) => {
    if (!entry) return
    const url = URL.createObjectURL(entry.blob)
    if (download) {
      const a = document.createElement('a')
      a.href = url
      a.download = entry.name
      document.body.append(a)
      a.click()
      a.remove()
    } else {
      const tab = window.open(url, '_blank', 'noopener,noreferrer')
      if (!tab) setError('O navegador bloqueou a nova janela. Autorize pop-ups para consultar o PDF.')
    }
    // Manter o URL ativo durante a abertura/carregamento do visualizador de PDFs.
    window.setTimeout(() => URL.revokeObjectURL(url), 120_000)
  }

  const upload = async (file?: File) => {
    if (!file) return
    setBusy(true)
    setError('')
    try { setEntry(await saveDatasheet(type, file)) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível guardar o PDF.') }
    finally { setBusy(false); if (input.current) input.current.value = '' }
  }

  return <details className="dc-inspector-group"><summary>Ficha técnica {entry && <span className="dc-inspector-count">PDF</span>}</summary>
    <div className="dc-inspector-group-body">
      <p className="text-[10px] text-ink-500 leading-relaxed">PDF associado a este tipo de componente, guardado apenas neste navegador. Não é incluído no ficheiro do projeto.</p>
      {busy && <span className="text-ink-400">A carregar…</span>}
      {error && <p role="alert" className="text-state-error text-[10px]">{error}</p>}
      {entry && <>
        <span className="font-medium break-all" title={entry.name}>{entry.name}</span>
        <div className="flex flex-wrap gap-1">
          <button type="button" className="dc-btn" onClick={() => openFile(false)}>Ver PDF ↗</button>
          <button type="button" className="dc-btn" onClick={() => openFile(true)}>↓ Descarregar</button>
          <button type="button" className="dc-btn dc-btn-danger" onClick={async () => {
            if (!window.confirm(`Remover a ficha «${entry.name}» deste navegador?`)) return
            try { await removeDatasheet(type); setEntry(undefined); setError('') }
            catch { setError('Não foi possível remover o PDF.') }
          }}>Remover</button>
        </div>
      </>}
      <label className="dc-btn self-start cursor-pointer">
        {entry ? 'Substituir PDF' : 'Adicionar PDF'}
        <input ref={input} type="file" accept="application/pdf,.pdf" className="sr-only" disabled={busy} onChange={(e) => { void upload(e.target.files?.[0]) }} />
      </label>
      {type === 'plcSiemensLogo1224RC' && !entry && <p className="text-[10px] text-ink-500">Carregue a ficha da versão 0BA2 correspondente ao modelo 3D. O manual 0BA4 não é associado automaticamente.</p>}
    </div>
  </details>
}
