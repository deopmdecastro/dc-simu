/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        panel: '#1e2530',
        din: '#c9ccd1',
      },
    },
  },
  plugins: [],
}
