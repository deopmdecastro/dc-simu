import type { ComponentType } from '../types'

export type ContributionKind = 'datasheet' | 'model3d'
export type ContributionStatus = 'pending' | 'approved' | 'rejected'

/** Limites de ficheiro (também aplicados pelo servidor). */
export const MAX_PDF_BYTES = 25 * 1024 * 1024
export const MAX_GLB_BYTES = 40 * 1024 * 1024

export const KIND_LABEL: Record<ContributionKind, string> = { datasheet: 'Datasheet (PDF)', model3d: 'Modelo 3D (GLB)' }
export const STATUS_LABEL: Record<ContributionStatus, string> = { pending: 'Em revisão', approved: 'Aprovada', rejected: 'Rejeitada' }

export interface GlbInfo {
  version: number
  meshes: number
  nodes: number
  materials: number
  generator?: string
}

/** Metadados de uma contribuição (o ficheiro é guardado à parte). */
export interface Contribution {
  id: string
  kind: ContributionKind
  title: string
  /** Tipo de componente do simulador a que se aplica; `null` = componente novo (ver `customName`). */
  componentType: ComponentType | null
  customName?: string
  description: string
  fileName: string
  size: number
  authorId: string
  authorName: string
  authorEmail: string
  status: ContributionStatus
  createdAt: string
  updatedAt: string
  reviewedBy?: string
  reviewNote?: string
  glb?: GlbInfo
}

export interface ContributionInput {
  kind: ContributionKind
  title: string
  componentType: ComponentType | null
  customName?: string
  description: string
}

export interface ContributionFilter {
  status?: ContributionStatus
  kind?: ContributionKind
  componentType?: ComponentType
  /** `true` = apenas as do utilizador atual. */
  mine?: boolean
}

export interface ContribStats {
  total: number
  pending: number
  approved: number
  rejected: number
  datasheets: number
  models: number
  bytes: number
}
