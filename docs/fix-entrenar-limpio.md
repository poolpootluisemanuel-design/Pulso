# Spec — Entrenar limpio: solo GPS y mapa, sin música

Fecha: 2026-11-24. Autor: programador (sistema v2). Estado: implementada,
pendiente de prueba en el A56 de Luis. Sin commit ni push.

## Objetivo

Reestructurar Entrenar para que el mapa sea el protagonista y los
controles/números de GPS vayan en una hoja inferior, sin nada de
música dentro de Entrenar. La música queda en su reproductor aparte
(mini-barra global + hoja del reproductor, montados en App.tsx).

Maqueta aprobada por Luis: mapa grande arriba (Deportivo, controles
+/−, Ubicación) y hoja inferior con tirador, stats Tiempo/Distancia/
Ritmo (unidad chica, como se arregló en el build 43), selector de
deporte (Caminata/Correr/Ciclismo con su límite) y botón grande
«Empezar a grabar» / controles de grabación.

## Lo que ya existía (no se reescribe)

- Entrenar = `Train.tsx` (pantalla: totales, GPS, plan del entrenador,
  registro manual, historial con detalle, importar GPX/TCX/reloj) +
  `GpsTracker.tsx` (grabación GPS: mapa en vivo `MapView`, stats,
  controles, cambio de deporte en vivo con `sportRef`, aviso de
  velocidad, pausa automática, B1, cronómetro por reloj).
- El mapa YA existía como `routeMap` (MapLibre, `height={260}`,
  `follow`, marcadores inicio/actual, guía teal punteada). Solo se
  hace protagonista: siempre visible arriba, más alto (320 px).
- La tarjeta de publicar-recorrido (`PublishWorkoutCard`, build 44)
  se muestra tras guardar el GPS — no se toca.
- La música NUNCA vivió dentro de `GpsTracker`; el reproductor está
  montado en `App.tsx` y se ve como mini-barra global. No se toca
  `MusicPlayer` ni la mini-barra.

## Hallazgo: la música SÍ estaba dentro de Entrenar

`Train.tsx` tenía una tarjeta-botón «🎵 Música para entrenar» (con
prop `onShowMusic` que bajaba hasta el reproductor). Es un control
de música dentro de Entrenar y contradice la maqueta aprobada («nada
de música ahí», corrección de Luis 24 nov). Se elimina la tarjeta y
la prop `onShowMusic` (de `Train` y de su llamada en `App.tsx`).
El reproductor se sigue abriendo desde la mini-barra global, como
en las demás pestañas.

## Cambios

### 1. `src/components/GpsTracker.tsx` (la reestructura)

- El `<Card>` único se sustituye por mapa + hoja:
  - Mapa arriba siempre (`routeMap`, `height` 260 → 320, mismo
    `MapView` con `follow`, marcadores y guía; el fallback del
    `Suspense` pasa a 320 para no saltar de altura al cargar).
  - Hoja debajo: `relative z-10 -mt-4 rounded-t-3xl bg-white
    px-4 pb-4 pt-2 shadow-lg`, con tirador visual
    (`mx-auto mb-2 h-1.5 w-11 rounded-full bg-slate-200`, sin
    gesto de arrastre: la hoja es fija, la página hace scroll como
    hoy; un gesto real es trabajo aparte y no lo pide la maqueta).
- En reposo (`idle`): la hoja lleva el título «Grabar con GPS» y el
  subtítulo, `LiveTrainingToggle`, el aviso de ruta guiada, los
  botones de deporte con su límite, la nota de velocidad, el
  checkbox de pasos, el bloque nativo/Health Connect, el error, el
  botón «Iniciar grabación GPS» y «Usar registro manual». El mapa ya
  no sale solo con guía: se ve siempre (antes, sin guía, no había
  mapa en reposo). La leyenda de la guía y el checkbox de voz quedan
  en la hoja.
- Grabando/en pausa: la hoja lleva la tarjeta de navegación guiada,
  la fila de stats (Tiempo/Distancia/Ritmo con unidad chica), la
  tarjeta de pasos, el cambio de deporte en vivo, la línea de
  estado, los avisos de pausa automática y velocidad, la nota
  informativa, el error y los botones Pausar/Reanudar + Terminar.
  El `{routeMap}` que iba entre el selector y la línea de estado se
  quita de ahí (el mapa ya está arriba).
- Terminado (`done`): la hoja lleva el resumen y los botones
  Guardar / Descartar; el `{routeMap}` de en medio se quita (el
  mapa ya está arriba).
- `Card` deja de usarse en el archivo y se quita del import
  (`noUnusedLocals` está activado).
- No se toca NADA de la lógica: `handleFix`, filtros de velocidad,
  B1, cronómetro por reloj, pausa automática, pasos, `changeSport`
  / `sportRef`, aviso de velocidad, `LiveTrainingToggle`, guía ni
  `onSave`/`onCancel`.

### 2. `src/components/Train.tsx`

- Se elimina la tarjeta-botón «🎵 Música para entrenar» y la prop
  `onShowMusic` de la firma. Nada más cambia: totales, GPS,
  `CoachPlan`, registro manual, historial con detalle, importar
  GPX/TCX/reloj siguen donde estaban.
- El tipo `TrainActivity` (con `music: MusicStatus | null`) y el
  `onActivity({ gps, music: null })` NO se tocan: los usa App para
  la actividad del dock.

### 3. `src/App.tsx`

- Solo se quita `onShowMusic={() => setMusicExpanded(true)}` de la
  llamada a `<Train … />`. El reproductor y la mini-barra no se
  tocan.

### No se toca

- `MusicPlayer.tsx`, mini-barra global, `PublishWorkoutCard`,
  `WorkoutPostCard`, `routeShare.ts`, `store.ts`, `schema.sql`,
  login, `Home.tsx`, `Community.tsx`, `MapView.tsx`.

## Aceptación

- `npm run build` exit 0.
- Entrenar muestra mapa grande arriba + hoja inferior con tirador;
  en reposo la hoja trae deporte + empezar; grabando trae
  tiempo/distancia/ritmo y el cambio de deporte en vivo sigue
  funcionando (mismo `changeSport`/`sportRef`).
- Historial, registro manual, importaciones (GPX/TCX/reloj) y plan
  del entrenador siguen accesibles y funcionando.
- No hay ningún control de música dentro de Entrenar (ni tarjeta,
  ni botón, ni `onShowMusic`); la mini-barra y el reproductor
  siguen como antes.
- Diff solo en `GpsTracker.tsx`, `Train.tsx`, `App.tsx` + esta spec.

## Riesgos

- R1 — El mapa ahora carga al abrir el GPS en reposo (antes, sin
  guía, no se montaba `MapView` hasta grabar): el bundle de MapLibre
  (~1 MB) se descarga al tocar «Grabar con GPS», no al abrir la
  app. Aceptado: el usuario ya pidió el GPS.
- R2 — La hoja es fija (tirador solo visual): no se colapsa ni se
  arrastra. Si Luis la quiere colapsable, es un encargo aparte.
- R3 — Con el mapa arriba, la hoja con todos los controles queda
  más abajo y la página hace scroll como hoy; en grabación los
  stats pueden quedar bajo el pliegue al abrir. El mapa sigue
  (`follow`) la posición; los botones Pausar/Terminar se alcanzan
  con scroll.
