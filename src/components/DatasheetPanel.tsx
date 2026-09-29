import { useEffect, useRef, useState } from 'react'
import type { ComponentType } from '../types'
import { getDatasheet, removeDatasheet, saveDatasheet, type Datasheet } from '../utils/datasheets'

/** A ficha é comum a todos os exemplares de um tipo, não é guardada no projeto. */
export default function DatasheetPanel({ type }: { type: ComponentType }) {
  const [entry, setEntry] = useState<Datasheet | undefined>()
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const builtinInfo = type === 'phoenixEcb3000760'
    ? { path: '/datasheets/phoenix-contact-3000760-pt.pdf', name: 'Phoenix Contact EC 1 12DC/1A S-R · 3000760 (PT).pdf' }
    : type === 'terminalPhoenixPti6'
      ? { path: '/datasheets/phoenix-contact-3213972-pt.pdf', name: 'Phoenix Contact PTI 6 · 3213972 (PT).pdf' }
      : type === 'plcSiemensLogo1224RC'
        ? { path: '/datasheets/logo-manual-0ba4-en.pdf', name: 'LOGO-manual-0BA4-en.pdf' }
        : type === 'powerSupplyProauto24A'
          ? { path: '/datasheets/chinfa-dran120-series.pdf', name: 'Ficha Chinfa DRAN120-24A (série).pdf' }
          : type === 'contactorWegCWC09'
            ? { path: '/datasheets/weg-cwc09-12679840.pdf', name: 'WEG CWC09 · 12679840 (datasheet).pdf' }
            : type === 'motor3ph'
              ? { path: '/datasheets/sew-drn80mk4-b3.pdf', name: 'SEW-EURODRIVE DRN80MK4-B3 · ficha CAD.pdf' }
              : type === 'emergencyButton' || type === 'emergencyButtonKeyP20ACR'
                ? { path: '/datasheets/Push%20Button,%20Emergency%20Push%20Button%20Switch.pdf', name: 'Emergency Push Button Switch.pdf' }
                : null
  const builtin = builtinInfo?.path ?? null
  const builtinName = builtinInfo?.name ?? 'datasheet.pdf'
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

  return <details className="dc-inspector-group"><summary>Ficha técnica {(entry || builtin) && <span className="dc-inspector-count">PDF</span>}</summary>
    <div className="dc-inspector-group-body">
      <p className="text-[10px] text-ink-500 leading-relaxed">PDFs pessoais associados ao tipo de componente ficam apenas neste navegador. Manuais incluídos na aplicação são identificados à parte.</p>
      {builtin && <div className="rounded border border-amber-200 bg-amber-50 p-2 text-[10px] leading-relaxed text-amber-900">
        {type === 'phoenixEcb3000760' ? <><strong>Phoenix Contact EC 1 12DC/1A S-R · artigo 3000760.</strong> Disjuntor eletrónico CC de 1 canal, 12 V DC / 1 A, montagem em calha DIN 35 mm, 12,5 × 80 mm, operação de −20 °C a 60 °C. Terminais funcionais Line+ / LOAD+ / 0V, entrada de reset e saída de status. Nota de aplicação do fabricante: o reset atua por borda descendente e aceita até 30 V DC. A ficha não especifica aqui a polaridade/comportamento do status nem o limiar de disparo.</> : type === 'terminalPhoenixPti6' ? <><strong>Phoenix Contact PTI 6 · artigo 3213972.</strong> Borne de passagem Push-in, duas ligações num potencial, 6 mm² nominais (0,5–10 mm²), 41 A, 800 V e montagem em calha NS 35.</> : type === 'emergencyButton' || type === 'emergencyButtonKeyP20ACR' ? <><strong>Ficha de botão de emergência recebida com o projeto.</strong> O simulador mantém o contacto 1NF 21–22 e distingue o rearme por giro (P20AKR) do rearme por chave (P20ACR).</> : type === 'powerSupplyProauto24A' ? <><strong>Ficha Chinfa DRAN120, variante 24A (parafusos).</strong> O PDF descreve a série Chinfa; a correspondência exata com «Proauto» deve ser confirmada na etiqueta do aparelho.</> : type === 'contactorWegCWC09' ? <><strong>Datasheet WEG CWC09 · código 12679840 (42 V 50 Hz / 48 V 60 Hz).</strong> O modelo 3D é o CWC07 10E da mesma família, usado como referência geométrica; a ficha confirma a série e os valores elétricos do código selecionado.</> : type === 'motor3ph' ? <><strong>SEW-EURODRIVE DRN80MK4/B3 · motor trifásico com montagem de pés B3.</strong> A ficha CAD recebida especifica 0,55 kW, 1435 rpm, 400 V / 1,29 A, cos φ 0,75, binário nominal de 3,65 Nm, carcaça 80 e massa de 11 kg.</> : <><strong>Manual Siemens LOGO! 0BA4 (inglês).</strong> O modelo 3D mostra 0BA2; este documento descreve uma versão posterior e não confirma funções exclusivas do 0BA2.</>}
        {type === 'phoenixEcb3000760' && <p className="mt-2">Na simulação, <strong>Fechado</strong>/<strong>Disparado</strong> controla a passagem entre Line+ e LOAD+; a curva de proteção e a lógica elétrica do STATUS não são simuladas porque não estão especificadas na ficha. O painel 3D usa o modelo CAD GLB recebido; o arranjo dos bornes no esquema elétrico é funcional, não um desenho de montagem.</p>}
        <div className="flex flex-wrap gap-1 mt-2">
          <a className="dc-btn" href={builtin} target="_blank" rel="noopener noreferrer">{type === 'plcSiemensLogo1224RC' ? 'Ver manual ↗' : 'Ver ficha ↗'}</a>
          <a className="dc-btn" href={builtin} download={builtinName}>↓ Descarregar</a>
        </div>
      </div> }
      {!builtin && !entry && !busy && <p className="rounded border border-line-soft bg-surface-sunken/60 p-2 text-[10px] leading-relaxed text-ink-500">Sem datasheet disponível no momento. As informações operacionais do componente continuam disponíveis no inspetor; poderá adicionar a ficha em PDF quando estiver disponível.</p>}
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
      {type === 'plcSiemensLogo1224RC' && !entry && <p className="text-[10px] text-ink-500">Se tiver o manual específico da versão 0BA2, adicione-o como PDF pessoal.</p>}
      {type === 'contactorWegCWC09' && !entry && <p className="text-[10px] text-ink-500">Vida útil, categorias de emprego e calibres de fusível estão na ficha integrada acima.</p>}
    </div>
  </details>
}
