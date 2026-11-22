# Spec — Rediseño del reproductor estilo app nativa

Estado: SPEC, pendiente del «aplica» de Luis sobre la muestra.
Fecha: 2026-11-22. Rama: feature/separate-routes-from-sessions.

## Qué pide Luis

Arreglar el reproductor de música: menú, funciones, botones,
plantilla, animación, UI, adaptable a presentación de app, no de
web. Aprobado junto con el auto-diagnóstico (misma pantalla); ambos
se implementan juntos.

## Estado actual (verificado en código 22 nov)

`src/components/MusicPlayer.tsx` (1.263 líneas):
- Mini-barra oscura (play/pausa, título truncado, prev/next, ▲).
- Hoja expandida BAJA: `max-h-[40vh]` con scroll interno, tarjeta
  blanca, encabezado «🎵 Música para entrenar», botón «▼ Recoger»,
  párrafo explicativo largo sobre el segundo plano, botones píldora
  (YouTube / Música local), avisos, lista de la cola.
- Eso es lo que se siente web: hoja corta, mucho texto, botones
  chicos, sin portada grande ni gestos.

## Rediseño (según la muestra mostrada a Luis)

Reproductor de pantalla casi completa (hoja alta, ~92vh, con tirador
arriba y «⌄ Recoger»):
- Portada grande (miniatura de YouTube / portada local) con sombra.
- Título grande + subtítulo (fuente · N de 7).
- Barra de progreso con tiempos actual/total, tocable para adelantar.
- Controles grandes: anterior, play/pausa redondo rosa (72 px),
  siguiente.
- Interruptor de fuente (YouTube / Música local) como control
  segmentado.
- Tarjeta de auto-diagnóstico integrada (checks + Reintentar +
  Reportar a soporte) — spec en
  `docs/fix-autodiagnostico-reproductor.md`.
- Lista de la cola debajo, con miniatura, título, duración y ✕
  (conservar agregar por link, borrar, mover ↑ ↓).
- Mini-barra sin cambios (oscura, con ▲ que abre el reproductor).
- Animación: la hoja sube con transición (transform/opacity); la
  portada y los controles con transiciones suaves; sin saltos.
- Sin párrafos explicativos largos: la info de segundo plano queda
  en una línea pequeña o desaparece (el diagnóstico la cubre cuando
  falla algo).

## Funciones que se conservan (no se pierde nada)

YouTube por extractor + música local, cola personalizable (agregar
por link, borrar, mover), barrita de minutos tocable, controles de
auriculares / notificación, servicio en primer plano, wake lock
(build 40), «Abrir en YouTube».

## Archivos (alcance)

- `src/components/MusicPlayer.tsx`: estructura de la hoja (alta en
  vez de 40vh), portada, controles, animaciones, tarjeta de
  diagnóstico (con `src/lib/youtubeExtractor.ts` para clasificar el
  error).
- No se toca: reproductor nativo (PulsoAudioPlugin), servicio,
  extractor del servidor, cola guardada, Entrenar/GPS, Fase 3
  (B1, I1–I4, I7), firma APK.

## Riesgos

- La hoja alta cubre casi toda la pantalla: debe recogerse fácil
  (tirador + botón ⌄ + botón atrás) y no tapar la mini-barra al
  recoger.
- El gesto de deslizar para recoger es lo más delicado: si no queda
  bien con touch, se deja el botón ⌄ como camino principal.
- No romper el flujo actual: la ▲ de la mini-barra sigue abriendo
  el reproductor; en Entrenar sigue abriéndose igual.

## Aceptación (prueba en el A56 de Luis, siguiente build)

1. El reproductor abre a pantalla casi completa, con portada grande
   y controles grandes; se recoge con ⌄ / tirador.
2. Todas las funciones siguen: YouTube suena, local suena, cola
   (agregar/borrar/mover), barra de minutos adelanta al tocar.
3. El auto-diagnóstico aparece cuando falla (ver su spec).
4. La mini-barra sigue igual y la ▲ abre el reproductor.
5. Sin regresión en Entrenar (grabar con GPS + música a la vez).
