/** @type {import('tailwindcss').Config} */

/**
 * DC-SIMU — Design tokens (editor)
 * --------------------------------
 * Identidade: instrumento de engenharia — grafite frio, papel técnico,
 * âmbar de energia como assinatura e azul cobalto exclusivamente interação.
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
          app: '#f3f5f7', // fundo geral da aplicação
          rail: '#f7f8fa', // header / barras (acima do conteúdo)
          panel: '#ffffff', // painéis, cartões, popovers
          sunken: '#e9ecef', // áreas rebaixadas (canvas, campos disabled)
        },
        /* ----------------------------------------------------- texto */
        ink: {
          900: '#10161d', // títulos, valores
          700: '#39434f', // corpo
          500: '#5f6b78', // secundário
          400: '#8b96a3', // rótulos discretos
          300: '#aab3bf', // placeholders
          disabled: '#bcc4cd',
        },
        /* ---------------------------------------------------- bordas */
        line: {
          strong: '#c7ced6',
          DEFAULT: '#dfe4e9',
          soft: '#edf0f3',
        },
        /* --------------------------- interação (cobalto — só ações/foco) */
        brand: {
          50: '#edf2fe',
          100: '#dbe6fc',
          200: '#b9cdf8',
          300: '#8fadf2',
          400: '#5f84ea',
          500: '#2457e6',
          600: '#1a44c8',
          700: '#17379e',
          800: '#142d7a',
          900: '#12255c',
        },
        /* ------------------------------- estados do PLC / simulação */
        state: {
          run: '#16a34a',
          runbg: '#e9f7ee',
          pause: '#d97706',
          pausebg: '#fdf3e3',
          stop: '#5f6b78',
          stopbg: '#eef1f4',
          ready: '#2457e6',
          readybg: '#edf2fe',
          error: '#dc2626',
          errorbg: '#fdecec',
        },
        /* ------------------------------------- energia — assinatura */
        energy: {
          50: '#fef6e4',
          100: '#fdebc3',
          200: '#fbd98a',
          300: '#f9c453',
          400: '#f6ae2e',
          500: '#f5a524', // assinatura DC-SIMU
          600: '#dd8e0f',
          700: '#b9720a',
          800: '#8f550a',
          900: '#6b3f0b',
          DEFAULT: '#f5a524',
          deep: '#dd8e0f',
        },
      },
      boxShadow: {
        xs: '0 1px 1px rgba(16,22,29,.05)',
        sm: '0 1px 2px rgba(16,22,29,.07)',
        DEFAULT: '0 1px 3px rgba(16,22,29,.09), 0 1px 2px rgba(16,22,29,.05)',
        md: '0 3px 8px rgba(16,22,29,.11)',
        lg: '0 10px 28px rgba(16,22,29,.16)',
        focus: '0 0 0 3px rgba(36,87,230,.18)',
      },
    },
  },
  plugins: [],
}
