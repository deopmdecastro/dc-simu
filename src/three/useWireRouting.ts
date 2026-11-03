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
    let worker: Worker | undefined
    // Não fazer setResult(null) aqui: evita overlay de loading e “piscar” dos cabos.
    const fail = (message: string) => {
      if (active) setResult({ key, error: message })
      worker?.terminate()
    }
    try {
      const input = latestJob.current()
      if (!input.wires.length) {
        const empty = new Map<string, WirePath3D>()
        lastGood.current = { key, paths: empty }
        setResult({ key, paths: empty })
        return
      }
      worker = createWireRoutingWorker()
      worker.onmessage = (event: MessageEvent<WireRoutingReply>) => {
        if (!active) return
        if ('error' in event.data) fail(event.data.error)
        else {
          const paths = new Map(event.data.paths)
          lastGood.current = { key, paths }
          setResult({ key, paths })
          worker?.terminate()
        }
      }
      worker.onerror = () => fail('Falha ao carregar o cálculo dos cabos')
      worker.onmessageerror = () => fail('Resposta inválida no cálculo dos cabos')
      worker.postMessage(input)
    } catch (error) {
      fail(error instanceof Error ? error.message : 'Falha no cálculo dos cabos')
    }
    return () => { active = false; worker?.terminate() }
  }, [key, attempt])

  // Preferir resultado da chave atual; senão o último bom (evita loading a cada re-key).
  const paths =
    (result?.key === key && result.paths)
      ? result.paths
      : lastGood.current?.paths
  const error = result?.key === key ? result.error : undefined
  /** Só “a carregar” na 1.ª vez — nunca quando já há traçado em ecrã. */
  const loading = !paths && !error

  return {
    paths,
    error,
    loading,
    retry: () => setAttempt((value) => value + 1),
  }
}
