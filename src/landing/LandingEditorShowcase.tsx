import { Suspense, lazy, useEffect, useRef, useState } from 'react'
import { useSimStore } from '../store/useSimStore'
import { useCatalogStore } from '../catalog/registry'
import { accountApi } from '../auth/accountApi'
import { nativeLandingPayload, type LandingPublishedPayload } from '../project/landingPublish'

const App = lazy(() => import('../App'))

/**
 * Demonstração da landing: o **editor real** carregado com o projeto publicado
 * na landing (fallback: o nativo «Partida direta»), mas com apenas os
 * controlos de simulação ativos (modo `demo` do App/Toolbar).
 *
 * Como a rota da landing nunca coexiste com a rota do editor, é seguro usar a
 * loja global: ao montar guarda-se um instantâneo do estado corrente,
 * carrega-se o projeto da demonstração e ativa-se `demoMode`; ao desmontar,
 * tudo regressa ao estado anterior.
 */
export default function LandingEditorShowcase({ onAccess }: { onAccess: () => void }) {
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    const store = useSimStore.getState()
    const snapshot = store.saveJSON()
    const previousName = store.currentProjectName
    const wasDemo = store.demoMode

    void (async () => {
      try {
        store.stop()
        await useCatalogStore.getState().ensureLoaded()
        let payload: LandingPublishedPayload = nativeLandingPayload()
        try {
          const published = await accountApi<LandingPublishedPayload>('/landing/published')
          if (published?.content) payload = published
        } catch {
          /* sem rede/backend: fica o nativo */
        }
        if (!mounted.current) return
        store.loadJSON(JSON.stringify(payload.content))
        store.setCurrentProjectName(payload.name)
        store.setDemoMode(true)
        setReady(true)
      } catch {
        if (mounted.current) setFailed(true)
      }
    })()

    return () => {
      mounted.current = false
      const current = useSimStore.getState()
      try {
        current.stop()
        current.setDemoMode(wasDemo)
        current.loadJSON(snapshot)
        current.setCurrentProjectName(previousName)
      } catch {
        /* restaurar o melhor possível */
      }
    }
  }, [])

  if (failed) {
    return (
      <div className="dx-stage-skeleton" role="alert">
        Não foi possível preparar a demonstração do editor. Tente recarregar a página.
      </div>
    )
  }

  return (
    <div className="landing-editor-embed" data-testid="landing-editor-embed">
      {ready ? (
        <Suspense fallback={<div className="dx-stage-skeleton" role="status">A carregar o editor…</div>}>
          <App demo onBack={onAccess} onEnterEditor={onAccess} />
        </Suspense>
      ) : (
        <div className="dx-stage-skeleton" role="status">A preparar a demonstração…</div>
      )}
    </div>
  )
}
