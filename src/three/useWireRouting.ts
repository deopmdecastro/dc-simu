import { useEffect, useRef, useState } from 'react'
import type { WirePath3D } from './wireGeometry3D'
import type { WireRoutingJob, WireRoutingReply } from './wireRoutingJob'

export function createWireRoutingWorker(): Worker {
  return new Worker(new URL('./wireRouting.worker.ts', import.meta.url), { type: 'module' })
}

/**
 * Encaminhamento coordenado fora da UI thread.
 * Mantém o último traçado válido enquanto recalcula (stale-while-revalidate),
 * para um clique num cabo / seleção não limpar a cena nem mostrar «A carregar…».
 */
/** A partir deste número de cabos corre primeiro um traçado provisório (sem relaxação). */
export const QUICK_ROUTING_MIN_WIRES = 60

export function useWireRouting(key: string, job: () => WireRoutingJob) {
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState<{ key: string; paths?: Map<string, WirePath3D>; error?: string } | null>(null)
  const latestJob = useRef(job)
  latestJob.current = job
  /** Últimos caminhos válidos — servem a UI até o worker devolver a chave atual. */
  const lastGood = useRef<{ key: string; paths: Map<string, WirePath3D> } | null>(null)
  if (result?.paths && result.key === key) lastGood.current = { key: result.key, paths: result.paths }

  useEffect(() => {
    let active = true
    let fullDone = false
    const workers: Worker[] = []
    let watchdog: ReturnType<typeof setTimeout> | undefined
    // Não fazer setResult(null) aqui: evita overlay de loading e “piscar” dos cabos.
    const stopAll = () => { if (watchdog) clearTimeout(watchdog); for (const w of workers) w.terminate() }
    const fail = (message: string) => {
      if (!active) return
      // Com o traçado provisório já em ecrã, um atraso do completo não apaga os cabos nem mostra erro.
      setResult((prev) => (prev?.key === key && prev.paths ? prev : { key, error: message }))
      stopAll()
    }
    const run = (input: WireRoutingJob, onPaths: (paths: Map<string, WirePath3D>) => void, onError: (message: string) => void) => {
      const worker = createWireRoutingWorker()
      workers.push(worker)
      worker.onmessage = (event: MessageEvent<WireRoutingReply>) => {
        if (!active) return
        worker.terminate()
        if ('error' in event.data) onError(event.data.error)
        else onPaths(new Map(event.data.paths))
      }
      worker.onerror = () => onError('Falha ao carregar o cálculo dos cabos')
      worker.onmessageerror = () => onError('Resposta inválida no cálculo dos cabos')
      worker.postMessage(input)
    }
    try {
      const input = latestJob.current()
      if (!input.wires.length) {
        const empty = new Map<string, WirePath3D>()
        lastGood.current = { key, paths: empty }
        setResult({ key, paths: empty })
        return
      }
      // Projetos grandes (maquetes): um traçado provisório sem relaxação cabo-a-cabo pinta os cabos em
      // ~1 s; o traçado completo corre em paralelo e substitui-o quando termina.
      if (input.wires.length > QUICK_ROUTING_MIN_WIRES) {
        run({ ...input, quick: true }, (paths) => {
          if (fullDone) return
          lastGood.current = { key, paths }
          setResult({ key, paths })
        }, () => { /* o completo continua; só ele reporta erro */ })
      }
      run(input, (paths) => {
        fullDone = true
        if (watchdog) clearTimeout(watchdog)
        lastGood.current = { key, paths }
        setResult({ key, paths })
      }, fail)
      // Segurança: o cálculo completo nunca prende o editor — sem traçado nenhum ao fim de 90 s, avisa.
      watchdog = setTimeout(() => fail('Cálculo dos cabos excedeu o tempo limite'), 90000)
    } catch (error) {
      fail(error instanceof Error ? error.message : 'Falha no cálculo dos cabos')
    }
    return () => { active = false; stopAll() }
  }, [key, attempt])

  // Preferir resultado da chave atual; senão o último bom (evita loading a cada re-key).
  const paths =
    (result?.key === key && result.paths)
      ? result.paths
      : lastGood.current?.paths
  const error = result?.key === key ? result.error : undefined
  /** Só “a carregar” na 1.ª vez sem qualquer traçado — nunca quando já há cabos em ecrã. */
  const loading = !paths && !error && !lastGood.current

  return {
    paths,
    /** True quando `paths` corresponde à chave atual (não é o último traçado de outra configuração). */
    current: result?.key === key && !!result.paths,
    error,
    loading,
    retry: () => setAttempt((value) => value + 1),
  }
}
