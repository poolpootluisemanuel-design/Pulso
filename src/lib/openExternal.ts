// Abrir un enlace externo (YouTube, etc.) desde PULSO.
// - En la app NATIVA de Android se usa el plugin oficial
//   @capacitor/browser (Chrome Custom Tab): ANTES se usaba
//   window.open(url, '_blank'), pero la WebView de Capacitor no
//   implementa onCreateWindow ni ventanas múltiples, así que ese
//   window.open se ignoraba en silencio y el botón "Abrir en
//   YouTube" no abría nada: la playlist de Luis nunca salía. Con
//   Browser.open el enlace sí se abre, y desde ahí YouTube ofrece
//   abrirlo en la app de YouTube con su playlist completa.
// - En web, window.open sí funciona: abre una pestaña nueva.
import { Browser } from '@capacitor/browser'
import { isNative } from './native'

/** Abre una URL externa (navegador del sistema / app de YouTube). */
export async function openExternalUrl(url: string): Promise<void> {
  if (isNative()) {
    try {
      await Browser.open({ url })
      return
    } catch {
      // Si el plugin falla, se intenta con window.open como respaldo.
    }
  }
  window.open(url, '_blank', 'noopener,noreferrer')
}
