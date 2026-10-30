import { useEffect, useRef, useState } from 'react'
import type { WirePath3D } from './wireGeometry3D'
import type { WireRoutingJob, WireRoutingReply } from './wireRoutingJob'

export function createWireRoutingWorker(): Worker {
  return new Worker(new URL('./wireRouting.worker.ts', import.meta.url), { type: 'module' })
}

/** Nunca executa o encaminhamento coordenado na thread da interface, nem em caso de erro.
 * Uma mudança de geometria cancela o trabalho anterior; ticks elétricos não mudam a chave. */
export function useWireRouting(key: string, job: () => WireRoutingJob) {
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState<{ key: string; paths?: Map<string, WirePath3D>; error?: string } | null>(null)
  const latestJob = useRef(job)
  latestJob.current = job
  useEffect(() => {
    let active = true
    let worker: Worker | undefined
    setResult(null)
    const fail = (message: string) => {
      if (active) setResult({ key, error: message })
      worker?.terminate()
    }
    try {
      const input = latestJob.current()
      if (!input.wires.length) { setResult({ key, paths: new Map() }); return }
      worker = createWireRoutingWorker()
      worker.onmessage = (event: MessageEvent<WireRoutingReply>) => {
        if (!active) return
        if ('error' in event.data) fail(event.data.error)
        else {
          setResult({ key, paths: new Map(event.data.paths) })
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
  const current = result?.key === key ? result : null
  return { paths: current?.paths, error: current?.error, retry: () => setAttempt(value => value + 1) }
}
