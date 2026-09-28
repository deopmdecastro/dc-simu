import type { LadderRung } from '../types'

export type ProjectFolder = 'programBlocks' | 'dataBlocks' | 'technologyObjects' | 'externalSources' | 'plcVariables' | 'watchTables' | 'backups' | 'documentation'
export const PROJECT_FOLDERS: ProjectFolder[] = ['programBlocks', 'dataBlocks', 'technologyObjects', 'externalSources', 'plcVariables', 'watchTables', 'backups', 'documentation']
export type ProjectFile = {
  id: string
  folder: ProjectFolder
  name: string
  content: string
  /** Só os blocos Ladder são editáveis como networks; não se executam sem CALL. */
  rungs?: LadderRung[]
  createdAt: string
}
