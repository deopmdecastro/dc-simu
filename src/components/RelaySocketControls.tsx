import type { ElectricalComponent } from '../types'
import { useSimStore } from '../store/useSimStore'
import { findSocketMountTarget, isPlugInRelay, isRelaySocket } from '../three/relaySocketMount'

/**
 * Encaixe plug-in: relé de nível AVEL 411RNPD0023 ↔ base undecal Finder 90.23.
 *
 * O relé entra de frente nos alvéolos P1…P11 da base; cada pino i fica ligado ao
 * borne de parafuso i pela ponte interna da base. Sem base no esquema, o relé
 * fica solto (não assenta na calha DIN — fisicamente não tem patim).
 */
export default function RelaySocketControls({ component: c }: { component: ElectricalComponent }) {
  const components = useSimStore((s) => s.components)
  const mountRelayOnSocket = useSimStore((s) => s.mountRelayOnSocket)
  const unmountRelayFromSocket = useSimStore((s) => s.unmountRelayFromSocket)
  const locked = !!c.locked

  if (isPlugInRelay(c)) {
    const socket = c.mountedOn ? components.find((o) => o.id === c.mountedOn && isRelaySocket(o)) : undefined
    const candidate = socket ? undefined : findSocketMountTarget(c, components)?.socket
    const freeSockets = components.filter((o) => isRelaySocket(o) && !components.some((other) => other.id !== c.id && other.mountedOn === o.id))
    return (
      <div className="flex flex-col gap-2" data-relay-socket-controls>
        {socket ? (
          <>
            <div className="flex items-center justify-between rounded-md border border-emerald-200 bg-emerald-50/70 p-2 text-xs">
              <div className="text-emerald-800">
                <span className="font-medium">Encaixado: </span>
                <span className="font-semibold">{socket.ref}</span>
                <span className="text-[11px] text-emerald-600"> · pinos 1–11 nos alvéolos P1–P11</span>
              </div>
              <button
                type="button"
                disabled={locked}
                onClick={() => unmountRelayFromSocket(c.id)}
                className="rounded border border-red-200 bg-white px-2 py-0.5 text-[11px] font-medium text-red-700 hover:bg-red-50 cursor-pointer disabled:opacity-50"
              >
                Desencaixar
              </button>
            </div>
            <small className="text-ink-400">
              Os pinos ligam por dentro: cada pino i fica no alvéolo Pi, que a base ponteia ao borne de parafuso i.
              Os cabos ligam-se aos bornes da base (bobina 2–10, contacto 1–3/1–4, sondas 5–9/11).
            </small>
          </>
        ) : (
          <>
            {candidate ? (
              <div className="flex items-center justify-between rounded-md border border-brand-200 bg-brand-50/60 p-2 text-xs">
                <div className="text-ink-700">
                  <span>Base detetada por perto: </span>
                  <span className="font-semibold text-brand-700">{candidate.ref}</span>
                </div>
                <button
                  type="button"
                  disabled={locked}
                  onClick={() => mountRelayOnSocket(c.id, candidate.id)}
                  className="rounded border border-brand-600 bg-brand-600 px-2.5 py-1 text-xs font-semibold text-white shadow-xs hover:bg-brand-700 cursor-pointer disabled:opacity-50"
                >
                  Encaixar agora
                </button>
              </div>
            ) : freeSockets.length > 0 ? (
              <div className="flex items-center gap-1.5">
                <select
                  className="dc-input flex-1 text-xs"
                  aria-label="Selecionar base para encaixe"
                  value=""
                  disabled={locked}
                  onChange={(e) => {
                    if (e.target.value) mountRelayOnSocket(c.id, e.target.value)
                  }}
                >
                  <option value="">Escolher base para encaixar...</option>
                  {freeSockets.map((s) => (
                    <option key={s.id} value={s.id}>{s.ref} · {s.label}</option>
                  ))}
                </select>
              </div>
            ) : (
              <small className="text-ink-400">
                Sem base livre no esquema. Adicione a «Base undecal Finder 90.23» (Relés) à calha DIN e encaixe este relé nela —
                sozinho, o relé plug-in de 11 pinos não assenta na calha.
              </small>
            )}
            <small className="text-ink-400">
              Também pode arrastar o relé para cima da base no Esquema ou no Painel 3D: o íman alinha os pinos aos alvéolos.
            </small>
          </>
        )}
      </div>
    )
  }

  if (isRelaySocket(c)) {
    const relay = components.find((o) => o.mountedOn === c.id && isPlugInRelay(o))
    return (
      <div className="flex flex-col gap-2" data-relay-socket-controls>
        {relay ? (
          <div className="flex items-center justify-between rounded-md border border-emerald-200 bg-emerald-50/70 p-2 text-xs">
            <div className="text-emerald-800">
              <span className="font-medium">Relé encaixado: </span>
              <span className="font-semibold">{relay.ref}</span>
              <span className="text-[11px] text-emerald-600"> · {relay.label}</span>
            </div>
            <button
              type="button"
              disabled={locked}
              onClick={() => unmountRelayFromSocket(relay.id)}
              className="rounded border border-red-200 bg-white px-2 py-0.5 text-[11px] font-medium text-red-700 hover:bg-red-50 cursor-pointer disabled:opacity-50"
            >
              Desencaixar
            </button>
          </div>
        ) : (
          <small className="text-ink-400">
            Base vazia. Encaixe um relé plug-in de 11 pinos (ex.: relé de nível AVEL 411RNPD0023): arraste-o para cima
            desta base ou use «Encaixar agora» no inspetor do relé. Os alvéolos P1–P11 ligam aos bornes 1–11 do mesmo número.
          </small>
        )}
      </div>
    )
  }

  return null
}
