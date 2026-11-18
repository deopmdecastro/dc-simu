import tsParser from '@typescript-eslint/parser'
import reactHooks from 'eslint-plugin-react-hooks'

// Ordem e número de hooks têm de ser estáveis em todos os renders, incluindo
// subscrições Zustand. Não ativar regras de compilador/estilo neste projeto.
export default [{
  files: ['src/**/*.{ts,tsx}'],
  linterOptions: { reportUnusedDisableDirectives: false },
  languageOptions: {
    parser: tsParser,
    ecmaVersion: 'latest',
    sourceType: 'module',
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
  plugins: { 'react-hooks': reactHooks },
  rules: { 'react-hooks/rules-of-hooks': 'error' },
}]
