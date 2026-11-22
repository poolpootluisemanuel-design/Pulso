# Spec — El cronómetro se congela con pantalla apagada

Estado: SPEC, pendiente de autorización de Luis para implementar.
Fecha: 2026-11-22. Rama: feature/separate-routes-from-sessions.

## Qué pasa

El tiempo de la grabación se detiene con la pantalla apagada. Luis lo
vivió una noche: dejó grabando con la pantalla apagada y al prenderla
el cronómetro marcaba apenas 2:45 en vez de toda la noche.

## Por qué (diagnóstico verificado en código)

- `GpsTracker.tsx` (línea ~171): el cronómetro es un contador por
  `setInterval(() => setSeconds(s => s + 1), 1000)`. En el WebView de
  Android, con la pantalla apagada los temporizadores de JS se
  detienen: el contador no avanza.
- Nada lo compensa: el guardado en localStorage (`GPS_SAVED_KEY`)
  guarda `seconds` y `savedAt`, pero `loadSavedGps` restaura `seconds`
  tal cual, sin sumar el hueco `Date.now() - savedAt`.
- El Wake Lock de pantalla que pide GpsTracker ("Mantener la pantalla
  encendida mientras graba") solo evita el apagado AUTOMÁTICO; si Luis
  apaga la pantalla con el botón, se apaga igual y el contador se
  congela.
- La DISTANCIA no tiene este problema en nativo: `nativeGps.ts` usa
  `@capacitor-community/background-geolocation` con servicio en primer
  plano ("PULSO · Grabando") y sigue dando posiciones con la pantalla
  apagada, siempre que la ubicación esté en "Permitir todo el tiempo"
  (paso manual en Ajustes, parte de I5). Los PASOS del sistema
  (TYPE_STEP_COUNTER) también siguen y se recuperan al volver (delta
  contra el offset). Solo el TIEMPO está roto.

## Fix (plan)

Medir el tiempo por reloj en vez de contar ticks:

1. Guardar `startedAtRef` (Date.now() al iniciar / reanudar) y
   `pausedTotalRef` (ms acumulados en pausa).
2. El intervalo de 1 s ya no suma: calcula
   `seconds = floor((Date.now() - startedAtRef - pausedTotalRef) / 1000)`.
   Si el WebView duerme horas, al siguiente tick el valor salta al
   correcto.
3. Al pausar: sumar el tramo al `pausedTotalRef`; al reanudar: nuevo
   `startedAtRef`. Al guardar en localStorage: guardar también el
   `startedAt` efectivo para que la restauración recupere el hueco.
4. No se toca: filtro anti-deriva, B1, distancia, ruta, pasos, guardado
   de la sesión, UI.

## Riesgos

- Bajo: el cálculo por reloj es el patrón estándar; el intervalo solo
  refresca la pantalla.
- Si el usuario pausa y deja la app días, el `startedAt` guardado debe
  sobrevivir al restore (punto 3); si no, el tiempo se congela en el
  valor guardado (comportamiento actual, no peor).

## Aceptación (prueba en el A56 de Luis, build 40/RC)

1. Grabar, apagar la pantalla 5 min, prender: el tiempo subió ~5 min.
2. Grabar, apagar la pantalla 1 min, prender: la distancia también
   subió (valida I5 + "Permitir todo el tiempo").
3. Pausar 2 min y reanudar: el tiempo no suma la pausa.
4. Matar la app grabando y reabrir: el tiempo restaurado no pierde el
   hueco (si el punto 3 quedó implementado).
