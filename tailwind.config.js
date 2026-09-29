/** @type {import('tailwindcss').Config} */

/**
 * DC-SIMU — Design tokens
 * -----------------------
 * Identidade: tema claro, azul institucional (o mesmo do simulador) sobre
 * neutros slate. O âmbar existe apenas como cor semântica de "energizado".
 * Estes valores espelham src/styles/dx.css. Nada de cores soltas nos componentes.
 */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'Segoe UI', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Cascadia Code', 'Consolas', 'ui-monospace', 'monospace'],
      },
      colors: {
        /* ------------------------------------------------ superfícies */
        surface: {
          app: '#edf0f5', // fundo geral da aplicação
          rail: '#f6f8fb', // header / barras (acima do conteúdo)
          panel: '#ffffff', // painéis, cartões, popovers
          sunken: '#e3e8ef', // áreas rebaixadas (canvas, campos disabled)
        },
        /* ----------------------------------------------------- texto */
        ink: {
          900: '#17202e', // títulos, valores
          700: '#3d4b5e', // corpo
          500: '#64748b', // secundário
          400: '#8b98a9', // rótulos discretos
          300: '#aab4c2', // placeholders
          disabled: '#b9c2ce',
        },
        /* ---------------------------------------------------- bordas */
        line: {
          strong: '#c2ccda',
          DEFAULT: '#d3dbe5',
          soft: '#e2e8f0',
        },
        /* ------------------------------------ identidade DC-SIMU (primary) */
        brand: {
          50: '#eef4ff',
          100: '#dce7fd',
          200: '#c0d4fc',
          300: '#94b6fa',
          400: '#6192f6',
          500: '#3c6ff0',
          600: '#2655e5',
          700: '#1e42d3',
          800: '#1f38ab',
          900: '#1f3388',
        },
        /* ------------------------------- estados do PLC / simulação */
        state: {
          run: '#16a34a',
          runbg: '#e9f7ee',
          pause: '#d97706',
          pausebg: '#fdf3e3',
          stop: '#64748b',
          stopbg: '#eef1f5',
          ready: '#2655e5',
          readybg: '#eaf0fe',
          error: '#dc2626',
          errorbg: '#fdecec',
        },
        /* ------------------- energia (semântica: condutor energizado) */
        energy: {
          50: '#fffbeb',
          100: '#fef3c7',
          200: '#fde68a',
          300: '#fcd34d',
          400: '#fbbf24',
          500: '#f59e0b',
          600: '#d97706',
          700: '#b45309',
          800: '#92400e',
          900: '#78350f',
          DEFAULT: '#f59e0b',
          deep: '#d97706',
        },
      },
      boxShadow: {
        xs: '0 1px 1px rgba(23,32,46,.06)',
        sm: '0 1px 2px rgba(23,32,46,.08)',
        DEFAULT: '0 1px 3px rgba(23,32,46,.1), 0 1px 2px rgba(23,32,46,.05)',
        md: '0 3px 8px rgba(23,32,46,.12)',
        lg: '0 10px 28px rgba(23,32,46,.18)',
        focus: '0 0 0 3px rgba(38,85,229,.16)',
      },
    },
  },
  plugins: [],
}
