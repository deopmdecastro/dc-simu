import { useEffect, useState } from 'react'

type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }

export default function InstallApp() {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null)
  const [open, setOpen] = useState(false)
  const [standalone, setStandalone] = useState(() => window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true)
  useEffect(() => {
    const onPrompt = (e: Event) => { e.preventDefault(); setPrompt(e as InstallPrompt) }
    const onInstalled = () => { setStandalone(true); setPrompt(null); setOpen(false) }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => { window.removeEventListener('beforeinstallprompt', onPrompt); window.removeEventListener('appinstalled', onInstalled) }
  }, [])
  if (standalone) return null
  const install = async () => {
    if (prompt) {
      await prompt.prompt()
      const choice = await prompt.userChoice
      if (choice.outcome === 'accepted') setOpen(false)
      setPrompt(null)
    } else setOpen(true)
  }
  return <>
    <button type="button" onClick={install} className="ml-2 whitespace-nowrap text-brand-600 font-semibold hover:underline" title="Instalar como aplicação no computador ou telemóvel">⬇ Instalar app</button>
    {open && <div role="dialog" aria-modal="true" aria-label="Instalar DC-SIMU" className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/40 p-4" onClick={() => setOpen(false)}>
      <div className="max-w-sm rounded-lg bg-white p-5 shadow-xl text-sm leading-relaxed text-ink-900" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-base font-bold mb-3">Instalar DC-SIMU</h2>
        <p><strong>iPhone / iPad:</strong> abra no Safari, toque em Partilhar e escolha «Adicionar ao ecrã principal».</p>
        <p className="mt-2"><strong>Android / computador:</strong> no menu do navegador escolha «Instalar aplicação» ou «Adicionar ao ecrã principal». É necessário servir a aplicação por HTTPS (ou localhost).</p>
        <p className="mt-2 text-ink-500">Os projetos ficam guardados neste dispositivo. Exporte um ficheiro de projeto para fazer uma cópia de segurança ou transferi-lo para outro dispositivo.</p>
        <button type="button" onClick={() => setOpen(false)} className="mt-4 rounded bg-brand-600 px-4 py-2 text-white">Fechar</button>
      </div>
    </div>}
  </>
}
