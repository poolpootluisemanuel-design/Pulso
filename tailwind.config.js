/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Paleta PULSO (2026-11-18, elegida por Luis): cálida pastel.
        // Fondo marfil, rosa suave principal, lila secundario, albaricoque
        // y menta crema, texto marrón cálido oscuro. Los nombres viejos
        // (night/pulso/teal/coral/sage) se mantienen como alias para no
        // reescribir todas las clases: night = marrón oscuro, pulso =
        // rosa, teal = lila. El texto sobre rosa es marrón oscuro (no
        // blanco) para que se lea bien; el mapa sigue oscuro.
        night: { 50: '#FFF9F0', 100: '#FBEFDF', 200: '#F2DCC6', 300: '#E3C3A6', 500: '#96705E', DEFAULT: '#4A2E28', dark: '#33201B' },
        pulso: { DEFAULT: '#F2A7B8', dark: '#D14D72', light: '#FBDCE4' },
        teal: { DEFAULT: '#A87FD1', dark: '#7E57A8' },
        sage: { 50: '#FFF9F0', 100: '#F3EFE3', 200: '#E4DCC8', 300: '#CDE8C5', 500: '#7FA87A' },
        coral: { DEFAULT: '#F2A7B8', dark: '#D14D72' },
        lime: { tag: '#CDE8C5' },
      },
      fontFamily: { sans: ['system-ui', 'Segoe UI', 'Roboto', 'sans-serif'], display: ['system-ui', 'Segoe UI', 'Roboto', 'sans-serif'] },
      boxShadow: { card: '0 10px 30px rgba(74,46,40,0.08)' },
    },
  },
  plugins: [],
}
