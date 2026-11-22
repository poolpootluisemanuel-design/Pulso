# Spec — Música se corta con pantalla apagada (build 39)

Estado: SPEC, pendiente de autorización de Luis para implementar.
Fecha: 2026-11-22. Rama: feature/separate-routes-from-sessions.

## Qué pasa

En build 39 (ExoPlayer nativo) la música de YouTube sí suena con la
pantalla prendida, pero al apagar la pantalla se corta. El teléfono no
muestra la música como sonando (sin tarjeta de medios; la sesión solo
se ve en Ajustes → salida de audio).

## Por qué (diagnóstico verificado)

- `PulsoAudioPlugin.ensurePlayer()` crea el ExoPlayer SIN `setWakeMode`
  → por defecto `WAKE_MODE_NONE`: el reproductor no mantiene despiertos
  ni el CPU ni el WiFi.
- El servicio en primer plano (`AudioForegroundService`, tipo
  mediaPlayback + notificación MediaStyle) mantiene viva la app, pero
  NO mantiene despiertos CPU ni WiFi.
- Al apagar la pantalla ambos duermen y el stream remoto (YouTube) se
  queda sin datos: el audio se corta.
- La batería NO es la causa (descartada por Luis, 22 nov).
- No hay pausa por parte de la web al ocultar: el efecto del servicio
  en `MusicPlayer` no se toca en modo nativo, y `pauseNative` solo se
  llama cuando el estado React dice "no suena".
- Verificado en la documentación de Android/media3 (`C.WakeMode`:
  `WAKE_MODE_NONE` / `WAKE_MODE_LOCAL` / `WAKE_MODE_NETWORK`; con
  `WAKE_MODE_NETWORK` el reproductor mantiene CPU y WiFi despiertos
  mientras carga y suena).

## Fix (plan)

1. `android/app/src/main/java/com/pulso/app/PulsoAudioPlugin.java`,
   en `ensurePlayer()`, tras construir el reproductor:
   `p.setWakeMode(C.WAKE_MODE_NETWORK);`
   (NETWORK y no LOCAL porque YouTube es stream de red: mantiene CPU
   + WiFi; para música local vale igual.)
2. `android/app/src/main/AndroidManifest.xml`:
   `<uses-permission android:name="android.permission.WAKE_LOCK" />`
   (permiso normal, sin diálogo al usuario).

No se toca: UI, WebView, cola, servicio, sesión de medios, Fase 3
(B1, I1–I4, I7), firma APK.

## Riesgos

- Consumo de batería mientras suena con pantalla apagada: es lo
  esperado (así funcionan las apps de música); el lock solo se
  mantiene mientras el reproductor suena y se suelta al pausar/parar.
- Si el servicio no estuviera corriendo, el wake lock solo no basta:
  verificar en la prueba que la notificación "PULSO · Sonando"
  aparece con controles.

## Aceptación (prueba en el A56 de Luis, build 40/RC)

1. YouTube suena 1 min con pantalla apagada, sin cortarse.
2. Música local igual, 1 min con pantalla apagada.
3. La notificación "PULSO · Sonando" aparece con anterior / play-pausa /
   siguiente mientras suena.
4. Al pausar, todo se apaga (sin notificación huérfana ni consumo raro).
