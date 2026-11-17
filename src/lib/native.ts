// Detectar si PULSO corre como app nativa (Capacitor) o como web.
// En web (Chrome / PWA) todo sigue igual que antes; en nativo se usan
// los plugins de Capacitor (GPS en segundo plano, Health Connect).
import { Capacitor } from '@capacitor/core'

/** true solo dentro de la app instalada (Android/iOS con Capacitor). */
export function isNative(): boolean {
  try {
    return Capacitor.isNativePlatform()
  } catch {
    return false
  }
}

/** 'android' | 'ios' | 'web' */
export function nativePlatform(): string {
  try {
    return Capacitor.getPlatform()
  } catch {
    return 'web'
  }
}

export function isAndroid(): boolean {
  return nativePlatform() === 'android'
}
