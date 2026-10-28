/** Bandeira partilhada e leve do modo demonstração (landing).
 *  Use-se nos pontos onde importar a loja completa criaria um ciclo
 *  (ex.: grafcetBus). A fonte da verdade reativa é `useSimStore.demoMode`;
 *  esta variável é apenas o reflexo síncrono dessa flag. */
let demo = false
export const isDemoMode = () => demo
export const syncDemoMode = (on: boolean) => {
  demo = on
}
