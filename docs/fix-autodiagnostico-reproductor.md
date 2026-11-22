# Spec — Auto-diagnóstico del reproductor (falla del extractor)

Estado: SPEC, pendiente del «te late» de Luis sobre la muestra.
Fecha: 2026-11-22. Rama: feature/separate-routes-from-sessions.

## Qué pasa

Cuando el extractor falla, la app hoy solo dice «El extractor no
respondió» y la cola sigue diciendo «Sonando...» aunque no suena
nada. Luis pidió (22 nov): que la app misma revise por qué falla,
lo diga y lo intente arreglar, o salga «Reportar a soporte».

Contexto medido 22 nov: el bloqueo de YouTube es INTERMITENTE (mismo
video 200 OK a las 14:32 GMT y 502 a las 15:28 GMT; 2 de 4 videos
fallaron en la prueba fresca). El servicio del extractor sí está
prendido (/health ok).

## Diagnóstico (en la app, sin servidor nuevo)

Cuando un `/resolve` falla, clasificar el error:
1. Sin internet (`navigator.onLine` false o fetch a /health con error
   de red) → «No tienes internet».
2. El servidor no responde (timeout a /health) → «El servidor del
   extractor no responde».
3. `/resolve` 502 «Sign in to confirm you're not a bot» → «YouTube
   bloqueó este video por ahora».
4. `/resolve` 401 → «La clave del extractor no es válida».
5. Otro error / timeout del resolve → «No se pudo resolver el video».

Mostrarlo en palabras simples en la tarjeta de la canción, con los
3 checks (internet ✓/✗, servidor ✓/✗, YouTube ✓/✗) como en la
muestra.

## Auto-arreglo

- Reintento automático con espera (2 intentos: a los 5 s y a los
  15 s), porque el bloqueo es intermitente y a veces se levanta solo.
- Si el video sigue fallando, pasar sola a la siguiente canción de
  la lista.
- Si toda la lista falla, ofrecer cambiar a música local.
- No reintentar en bucle infinito: máximo 2 reintentos por canción.

## Reportar a soporte

Botón «Reportar a soporte» que arma el texto y lo abre en la hoja
de compartir (WhatsApp / correo, lo que el usuario elija):
«La música de YouTube no sonó. Video: <título> (N de 7). Error:
<causa en palabras simples + código>. Hora: <fecha/hora>. App:
build <APP_BUILD>.» Sin datos personales, sin claves.

## Corrección del «Sonando...» falso

La cola solo muestra «Sonando...» si el reproductor nativo confirma
que está sonando (isPlaying real), no solo porque sea la canción
actual. Si no suena, dice «No está sonando».

## Archivos (alcance)

- `src/components/MusicPlayer.tsx`: estado de diagnóstico, reintentos,
  UI de la tarjeta, botón de reporte, estado real de sonando.
- `src/lib/youtubeExtractor.ts`: clasificar el error del resolve
  (502 bot / 401 / timeout / red) para que el diagnóstico lo use.
- No se toca: reproductor nativo, servicio, extractor del servidor,
  cola guardada, Fase 3 (B1, I1–I4, I7), firma APK.

## Riesgos

- El diagnóstico por /health no distingue bloqueo por video (eso lo
  da el /resolve 502); la tarjeta debe decirlo así.
- Los reintentos no arreglan un bloqueo total: ahí manda el reporte
  y la música local.
- El reporte por compartir depende de que el usuario tenga WhatsApp
  o correo en el teléfono.

## Aceptación (prueba en el A56 de Luis, build 40/RC o siguiente)

1. Con el extractor fallando, la tarjeta dice la causa correcta en
   palabras simples (probar con un video bloqueado y con el avión
   prendido para el caso sin internet).
2. El reintento automático suena solo cuando el bloqueo se levanta.
3. Si la lista entera falla, ofrece música local.
4. «Reportar a soporte» arma el texto con video, error, hora y build.
5. La cola no dice «Sonando...» si nada suena.
