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
equal('conflito ganha _coppy', uniqueProjectName('teste', ['teste']), 'teste_coppy')
equal('com _coppy também ocupado passa a _coppy2', uniqueProjectName('teste', ['teste', 'teste_coppy']), 'teste_coppy2')
equal('sequência continua _coppy3, _coppy4…', uniqueProjectName('teste', ['teste', 'teste_coppy', 'teste_coppy2', 'teste_coppy3']), 'teste_coppy4')
equal('ignora maiúsculas', uniqueProjectName('TESTE', ['teste']), 'TESTE_coppy')
equal('ignora acentos', uniqueProjectName('analise', ['Análise']), 'analise_coppy')
equal('margens e espaços duplos contam o mesmo', uniqueProjectName('  meu  projeto  ', ['meu projeto']), 'meu projeto_coppy')
equal('normaliza espaços internos', normalizeProjectName('  meu   projeto '), 'meu projeto')
equal('nome vazio devolve vazio', uniqueProjectName('   ', ['x']), '')
equal('lista vazia devolve o próprio nome', uniqueProjectName('teste', []), 'teste')
equal('base já com _coppy tratada como qualquer nome', uniqueProjectName('teste_coppy', ['teste_coppy']), 'teste_coppy_coppy')
equal('não pula para _coppy2 quando _coppy2 existe mas _coppy está livre', uniqueProjectName('teste', ['teste', 'teste_coppy2']), 'teste_coppy')
equal('acentos + maiúsculas combinados', uniqueProjectName('ANALISE', ['análise']), 'ANALISE_coppy')
equal('nomes diferentes por acento ficam livres quando comparação já acentuada', uniqueProjectName('ação', ['açãoo']), 'ação')

console.log(`[project-names] OK — ${checks} verificações`)
