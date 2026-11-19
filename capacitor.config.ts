import type { CapacitorConfig } from '@capacitor/cli';

// PULSO nativa (Capacitor 8): la misma web (dist) empaquetada como app
// Android (com.pulso.app). La web sigue desplegándose en Vercel igual:
// Capacitor solo lee dist, no cambia el build web.
// - backgroundColor: marfil PULSO mientras carga la app (paleta
//   cálida 2026-11-18; antes azul noche, que hacía un flash oscuro
//   al abrir porque la app ya es marfil).
// - El permiso de ubicación se pide en tiempo de ejecución; el de
//   segundo plano se declara en android/app/src/main/AndroidManifest.xml.
const config: CapacitorConfig = {
  appId: 'com.pulso.app',
  appName: 'PULSO',
  webDir: 'dist',
  backgroundColor: '#FFF9F0',
};

export default config;
