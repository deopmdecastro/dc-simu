/**
 * Testes rápidos à unicidade de nomes de projetos (src/project/name.ts) —
 * no binário corre com `npx tsx scripts/project-names-smoke.ts`.
 */
import { normalizeProjectName, uniqueProjectName } from '../src/project/name'

let checks = 0
const equal = (label: string, actual: unknown, expected: unknown) => {
  checks += 1
  if (actual !== expected) {
    console.error(`[project-names] ${label}\n  esperado: ${expected}\n  obtido:   ${actual}`)
    process.exit(1)
  }
}

equal('sem conflito devolve o nome limpo', uniqueProjectName('teste', ['outro']), 'teste')
equal('conflito ganha _copy', uniqueProjectName('teste', ['teste']), 'teste_copy')
equal('com _copy também ocupado passa a _copy2', uniqueProjectName('teste', ['teste', 'teste_copy']), 'teste_copy2')
equal('sequência continua _copy3, _copy4…', uniqueProjectName('teste', ['teste', 'teste_copy', 'teste_copy2', 'teste_copy3']), 'teste_copy4')
equal('ignora maiúsculas', uniqueProjectName('TESTE', ['teste']), 'TESTE_copy')
equal('ignora acentos', uniqueProjectName('analise', ['Análise']), 'analise_copy')
equal('margens e espaços duplos contam o mesmo', uniqueProjectName('  meu  projeto  ', ['meu projeto']), 'meu projeto_copy')
equal('normaliza espaços internos', normalizeProjectName('  meu   projeto '), 'meu projeto')
equal('nome vazio devolve vazio', uniqueProjectName('   ', ['x']), '')
equal('lista vazia devolve o próprio nome', uniqueProjectName('teste', []), 'teste')
equal('base já com _copy tratada como qualquer nome', uniqueProjectName('teste_copy', ['teste_copy']), 'teste_copy_copy')
equal('não pula para _copy2 quando _copy2 existe mas _copy está livre', uniqueProjectName('teste', ['teste', 'teste_copy2']), 'teste_copy')
equal('acentos + maiúsculas combinados', uniqueProjectName('ANALISE', ['análise']), 'ANALISE_copy')
equal('nomes diferentes por acento ficam livres quando comparação já acentuada', uniqueProjectName('ação', ['açãoo']), 'ação')

console.log(`[project-names] OK — ${checks} verificações`)
