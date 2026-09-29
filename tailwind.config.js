/** @type {import('tailwindcss').Config} */

/**
 * DC-SIMU — Sistema de design (Light Mode)
 * -----------------------------------------
 * Identidade visual: automação industrial + engenharia + precisão.
 * Todos os componentes consomem estes tokens — nunca cores soltas.
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
          app: '#eef1f6', // fundo geral da aplicação
          rail: '#f7f9fc', // header / barras (acima do conteúdo)
          panel: '#ffffff', // painéis, cartões, popovers
          sunken: '#e4e9f0', // áreas rebaixadas (canvas, campos disabled)
        },
        /* ----------------------------------------------------- texto */
        ink: {
          900: '#0e1620', // títulos, valores
          700: '#3b4757', // corpo
          500: '#63707f', // secundário
          400: '#8a95a3', // rótulos discretos
          300: '#aab4c2', // placeholders
          disabled: '#b9c2ce',
        },
        /* ---------------------------------------------------- bordas */
        line: {
          strong: '#c8d1dc',
          DEFAULT: '#dde3ea',
          soft: '#e8edf3',
        },
        /* ------------------------------------ identidade DC-SIMU (primary) */
        brand: {
          50: '#f2f6ff',
          100: '#eaf0ff',
          200: '#cddcff',
          300: '#9cbaff',
          400: '#6d97ff',
          500: '#4a7cff',
          600: '#2f6bff',
          700: '#1f56e0',
          800: '#1a45b8',
          900: '#16378f',
        },
        /* ------------------------------------------- superfícies escuras */
        graphite: {
          900: '#080b10',
          800: '#0d131b',
          700: '#131b25',
          600: '#1b2531',
          500: '#2a3949',
        },
        /* ------------------------------- estados do PLC / simulação */
        state: {
          run: '#16a34a',
          runbg: '#e8f7ef',
          pause: '#d97706',
          pausebg: '#fdf3e3',
          stop: '#64748b',
          stopbg: '#eef1f5',
          ready: '#2f6bff',
          readybg: '#eaf0ff',
          error: '#e5484d',
          errorbg: '#fdecec',
        },
        /* ------------------------------------------- energia viva */
        energy: {
          DEFAULT: '#ffab2e',
          deep: '#d97706',
        },
      },
      boxShadow: {
        xs: '0 1px 1px rgba(23,32,46,.06)',
        sm: '0 1px 2px rgba(23,32,46,.08)',
        DEFAULT: '0 1px 3px rgba(23,32,46,.1), 0 1px 2px rgba(23,32,46,.05)',
        md: '0 3px 8px rgba(23,32,46,.12)',
        lg: '0 10px 28px rgba(23,32,46,.18)',
        focus: '0 0 0 3px rgba(47,107,255,.2)',
      },
    },
  },
  plugins: [],
}
