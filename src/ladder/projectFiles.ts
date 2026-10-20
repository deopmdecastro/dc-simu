import type { LadderRung } from '../types'

export type ProjectFolder = 'programBlocks' | 'dataBlocks' | 'technologyObjects' | 'externalSources' | 'plcVariables' | 'watchTables' | 'backups' | 'documentation'
export const PROJECT_FOLDERS: ProjectFolder[] = ['programBlocks', 'dataBlocks', 'technologyObjects', 'externalSources', 'plcVariables', 'watchTables', 'backups', 'documentation']
export type ProjectFile = {
  id: string
  folder: ProjectFolder
  name: string
  content: string
  /** Atualizado por cada edição — usado pela árvore e pelas vistas de projeto. */
  updatedAt?: string
  /** Só os blocos Ladder são editáveis como networks; os sem `exec` correm via CALL. */
  rungs?: LadderRung[]
  /**
   * Semântica de execução do bloco (OBs criados na modal «Adicionar bloco»):
   *  - 'obCyclic'  → corre em todos os scans, após o Main [OB1];
   *  - 'obStartup' → corre uma vez, na primeira passagem depois de entrar em RUN;
   *  - vazio       → só corre quando chamado (CALL), como um FC.
   */
  exec?: 'obCyclic' | 'obStartup'
  createdAt: string
}

/** Conteúdo inicial útil para cada item que pode ser criado na árvore do PLC.
 * Assim as pastas não são apenas marcadores visuais: cada item abre logo numa
 * vista editável e é persistido no próprio projeto. */
export function defaultProjectFileContent(folder: ProjectFolder, name: string): string {
  if (folder === 'technologyObjects') return JSON.stringify({
    type: 'Motor',
    address: '',
    setpoint: 0,
    unit: 'rpm',
    enabled: true,
    description: `Objeto tecnológico ${name}`,
  }, null, 2)
  if (folder === 'externalSources') return `// ${name}\n// Fonte externa guardada no projeto.\n// Pode usar SCL, ST ou STL como referência; a compilação ainda não está disponível.\n\n`
  if (folder === 'documentation') return `# ${name}\n\nDescreva aqui a operação, manutenção ou validação deste PLC.\n`
  return ''
}

/** OBs de execução automática de uma lista de ficheiros (arranque/cíclicos). */
export function autoExecRungs(files: ProjectFile[], kind: 'obCyclic' | 'obStartup'): LadderRung[] {
  return files
    .filter((file) => file.folder === 'programBlocks' && file.exec === kind)
    .flatMap((file) => file.rungs ?? [])
}

/** Mapa id → networks para a instrução CALL (blocos de programa de uma lista de ficheiros). */
export function callableBlocks(files: ProjectFile[]): Record<string, LadderRung[]> {
  return files
    .filter((file) => file.folder === 'programBlocks')
    .reduce<Record<string, LadderRung[]>>((map, file) => ({ ...map, [file.id]: file.rungs ?? [] }), {})
}
