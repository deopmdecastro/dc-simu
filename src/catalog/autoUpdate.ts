import { useSimStore } from '../store/useSimStore'
import { useCatalogStore } from './registry'
import { applyOfficialUpdates } from './update'

let started = false

/** Liga a atualização automática: corre quando o catálogo carrega e sempre que os componentes do projeto mudam (abrir/importar projeto). */
export function startCatalogAutoUpdate() {
  if (started) return
  started = true
  const run = () => {
    const catalog = useCatalogStore.getState()
    if (!catalog.loaded || !catalog.entries.length) return
    applyOfficialUpdates(catalog.entries)
  }
  useCatalogStore.subscribe((state, previous) => { if (state.revision !== previous.revision) run() })
  let lastComponents = useSimStore.getState().components
  useSimStore.subscribe((state) => {
    if (state.components === lastComponents) return
    lastComponents = state.components
    run()
  })
  run()
}
