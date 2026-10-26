export type PlanId = 'free' | 'pro' | 'escola' | 'empresa'
export type FeatureKey = 'view3d' | 'ladder' | 'grafcet' | 'ladderDebug' | 'fluidsimImport' | 'pdfExport' | 'excelExport' | 'sharing' | 'comments'
export type LimitKey = 'projects' | 'collaborators'
export type ComponentStatus = 'active' | 'blocked' | 'archived' | 'deleted'
export type CommentAnchor = 'geral' | 'esquema' | '3d' | 'ladder' | 'grafcet'

export interface PlanConfig {
  id: PlanId
  name: string
  tagline: string
  /** null = sob consulta */
  priceMonthly: number | null
  priceYearly: number | null
  showOnLanding: boolean
  highlighted: boolean
  ctaLabel: string
  order: number
  features: Record<FeatureKey, boolean>
  /** null = ilimitado */
  limits: Record<LimitKey, number | null>
  extras: string[]
}

export interface PricingConfig {
  showPricing: boolean
  defaultPlan: PlanId
  currency: string
  yearlyNote: string
  plans: PlanConfig[]
  updatedAt?: string
  updatedBy?: string
}

export interface PlanSubject { id?: string; role?: 'admin' | 'user'; plan?: string | null; planExpiresAt?: string | null }
export interface ComponentSettingLike { status?: ComponentStatus; enabled?: boolean; note?: string; minPlan?: PlanId | null }
export interface ComponentChange { status: ComponentStatus; note: string; minPlan: PlanId | null }
export interface ComponentAccess { visible: boolean; insertable: boolean; reason: string | null }

export const PLAN_IDS: PlanId[]
export const FEATURES: Array<{ key: FeatureKey; label: string; description: string }>
export const FEATURE_KEYS: FeatureKey[]
export const LIMIT_KEYS: LimitKey[]
export const LIMIT_LABEL: Record<LimitKey, string>
export const DEFAULT_PRICING: PricingConfig
export function sanitizePricing(input: unknown): PricingConfig
export function readPricing(stored: unknown): PricingConfig
export function isPlanId(value: unknown): value is PlanId
export function effectivePlanId(user: PlanSubject | null | undefined, config: PricingConfig, now?: number): PlanId
export function planById(config: PricingConfig, id: string): PlanConfig
export function canUse(user: PlanSubject | null | undefined, config: PricingConfig, feature: FeatureKey, now?: number): boolean
export function limitFor(user: PlanSubject | null | undefined, config: PricingConfig, key: LimitKey, now?: number): number | null
export function withinLimit(user: PlanSubject | null | undefined, config: PricingConfig, key: LimitKey, currentCount: number, now?: number): boolean
export function cheapestPlanWith(config: PricingConfig, feature: FeatureKey): PlanConfig | null
export function planRank(config: PricingConfig, id: string): number
export function featureLabel(key: string): string
export function upgradeMessage(config: PricingConfig, feature: FeatureKey): string
export function limitMessage(config: PricingConfig, user: PlanSubject | null | undefined, key: LimitKey): string
export function periodEnd(period: 'monthly' | 'yearly', from?: Date): string

export const COMPONENT_STATUSES: ComponentStatus[]
export const COMPONENT_STATUS_LABEL: Record<ComponentStatus, string>
export function componentStatusOf(setting: ComponentSettingLike | null | undefined): ComponentStatus
export function sanitizeComponentChange(body: unknown): ComponentChange
export function isDefaultComponentSetting(change: ComponentChange): boolean
export function componentAccess(setting: ComponentSettingLike | null | undefined, user: PlanSubject | null | undefined, config: PricingConfig): ComponentAccess

export const COMMENT_MAX: number
export const COMMENT_ANCHORS: CommentAnchor[]
export function sanitizeCommentBody(value: unknown): string
export function sanitizeCommentAnchor(value: unknown): CommentAnchor
export function commentPermissions(comment: { authorId: string }, user: PlanSubject | null | undefined, projectRole: 'owner' | 'editor' | null | undefined): { edit: boolean; remove: boolean; resolve: boolean }
export function canCommentOn(user: PlanSubject | null | undefined, owner: PlanSubject | null | undefined, config: PricingConfig): boolean
