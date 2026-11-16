/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Paleta PULSO: azul noche oscuro, rojo pulso principal, blanco y teal de acento.
        night: { 50: '#f0f4f9', 100: '#e6edf5', 200: '#c9d6e6', 300: '#a8bdd4', 500: '#5b7ba0', DEFAULT: '#0A1B2E', dark: '#071223' },
        pulso: { DEFAULT: '#E63946', dark: '#C81E2B', light: '#FF6B74' },
        teal: { DEFAULT: '#14B8A6', dark: '#0F766E' },
        // Alias de compatibilidad: las clases viejas (sage/coral/lime) ya apuntan a la paleta PULSO.
        sage: { 50: '#f0f4f9', 100: '#e6edf5', 200: '#c9d6e6', 300: '#a8bdd4', 500: '#5b7ba0' },
        coral: { DEFAULT: '#E63946', dark: '#C81E2B' },
        lime: { tag: '#CCFBF1' },
      },
      fontFamily: { sans: ['system-ui', 'Segoe UI', 'Roboto', 'sans-serif'] },
    },
  },
  plugins: [],
}
