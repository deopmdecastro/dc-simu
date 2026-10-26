import { useNavigate } from 'react-router-dom'
import { ROUTES } from '../routing/routes'
import type { FeatureKey } from './platformCore.mjs'
import { featureLabel } from './platformCore.mjs'
import { featureBlockedMessage } from './usePlan'

/** Ecrã mostrado no lugar de uma vista que o plano atual não inclui (SAAS-PLANS-01). */
export default function PlanLocked({ feature, compact = false }: { feature: FeatureKey; compact?: boolean }) {
  const navigate = useNavigate()
  return <div className={`dc-plan-locked ${compact ? 'is-compact' : ''}`} role="note" data-feature={feature}>
    <strong>{featureLabel(feature)} não está incluído no seu plano</strong>
    <p>{featureBlockedMessage(feature)}</p>
    <button type="button" className="dc-btn" onClick={() => navigate(ROUTES.dashboard)}>Ver o meu plano</button>
  </div>
}
