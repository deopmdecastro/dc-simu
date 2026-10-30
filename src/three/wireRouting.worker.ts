import { calculateWireRouting, type WireRoutingJob, type WireRoutingReply } from './wireRoutingJob'

self.onmessage = (event: MessageEvent<WireRoutingJob>) => {
  let reply: WireRoutingReply
  try {
    reply = { paths: calculateWireRouting(event.data) }
  } catch (error) {
    reply = { error: error instanceof Error ? error.message : 'Falha no cálculo dos cabos' }
  }
  self.postMessage(reply)
}
