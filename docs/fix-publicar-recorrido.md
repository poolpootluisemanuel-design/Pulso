# Spec — Publicar un recorrido GPS como Strava

Fecha: 2026-11-24. Autor: programador (sistema v2). Estado: implementada,
pendiente de prueba en el A56 de Luis. Sin commit ni push.

## Objetivo

Al terminar de grabar con GPS, mostrar la tarjeta con el mapa dibujado,
los números, un texto opcional y la visibilidad (Comunidad PULSO /
Solo yo). Con Comunidad PULSO el recorrido aparece en Comunidad →
Publicaciones con su mapa, números y texto. Con Solo yo no se crea
post: el entrenamiento queda guardado y visible solo para el dueño,
con su detalle con mapa en el historial.

Maqueta aprobada por Luis: mini-mapa con la ruta, stats, descripción,
selector de visibilidad, botón «Publicar recorrido».

## Lo que ya existía (no se reescribe)

- La ruta YA se guarda: `Workout.route?: { lat, lng }[]` (types.ts:78);
  `logWorkout` hace insert/upsert con `route: route || null`
  (store.ts:176, :951). El guardado no se toca.
- El dibujo de la ruta YA existía como `RouteMini` en Train.tsx (SVG,
  trazo lila #7E57A8, inicio verde, fin rosa). Se mueve tal cual a
  `src/components/RouteMini.tsx` para reutilizarlo en la tarjeta de
  publicar, en el feed y en el detalle. No se inventa un mapa nuevo.
- Publicar texto YA existía: `createPost` (store.ts:1068) y el form de
  Community.tsx:45-91. No se toca su flujo (offline, límite 1000
  caracteres, assertNotBlocked).

## Restricción dura: sin migración

La tabla `posts` (supabase/schema.sql:120-126) tiene solo
`id, profile_id, author_name, text, created_at`. NO existe `workout_id`.

Además, RLS de workouts (schema.sql:207-208) solo deja leer los
entrenamientos propios (`auth.uid() = profile_id`); los posts sí son
públicos (`posts visibles`, :226). Por eso un post NO puede referenciar
el workout por id y esperar que los demás lo lean: solo el autor
podría resolver la ruta. La tarjeta del post tiene que ser
autocontenida.

### Solución: marcador + polilínea en el texto del post

El texto del post es:

```
[recorrido:<workoutId>|<deporte>|<distanciaKm>|<duracionMin>|<pasos>|<polilinea>]
<texto del usuario (opcional)>
```

- `<polilinea>`: ruta codificada con el algoritmo de polilínea de
  Google (5 decimales), reducida a 40 puntos como máximo
  (muestreo uniforme). 40 puntos ≈ 250-350 caracteres.
- El texto total se limita a 950 caracteres (el límite de la base es
  1000; `createPost` ya lo exige): la nota del usuario se recorta a lo
  que quepa.
- La UI oculta la línea del marcador al renderizar: nunca se ve el
  código. Un post viejo o con el marcador roto se renderiza como
  texto normal (parse tolerante, sin romper nada).

Limpieza post-lanzamiento (NO en este encargo): columna
`workout_id` en posts + política RLS «recorridos publicados
visibles» para que la tarjeta lea la ruta completa del workout en
vez de la polilínea reducida.

## Cambios

### Nuevos archivos

1. `src/lib/routeShare.ts`
   - `encodePolyline(route) / decodePolyline(str)`: algoritmo de
     polilínea de Google, 5 decimales, ~30 líneas, sin dependencias.
   - `downsampleRoute(route, max = 40)`.
   - `buildRoutePostText(workout, note)`: construye el texto con el
     marcador; recorta la nota a 950 caracteres totales.
   - `parseRoutePost(text)`: devuelve `{ workoutId, sport,
     distanceKm, durationMin, steps, route, note } | null`.
     El `route` decodificado es la ruta reducida (para el mapa del
     feed); si el workout propio está disponible se prefiere su ruta
     completa.
2. `src/components/RouteMini.tsx`: `RouteMini` movido desde Train.tsx
   sin cambios de dibujo. Props `{ route, h }`.
3. `src/components/WorkoutPostCard.tsx`: cuerpo de una publicación de
   recorrido: `RouteMini` (si hay ≥2 puntos), fila de stats
   (distancia, tiempo, ritmo o velocidad según deporte, pasos si hay)
   y la nota del usuario. No incluye el encabezado de autor (lo pone
   quien la usa).
4. `src/components/PublishWorkoutCard.tsx`: tarjeta tras guardar el
   GPS: `RouteMini` + stats + textarea «¿Cómo te fue?» (opcional) +
   selector Comunidad PULSO / Solo yo + botón que cambia de texto:
   «Publicar recorrido» (Comunidad) o «Guardar solo para mí»
   (Solo yo). Props: `{ workout, onPublish(note, visibility),
   onClose }`.

### Archivos modificados

5. `src/components/Train.tsx`
   - Importa `RouteMini` del nuevo archivo; se borra la definición
     local.
   - `onSave` del GPS: guarda con `logWorkout` (como antes) y guarda
     el `Workout` devuelto en `justSaved`; se muestra
     `PublishWorkoutCard` con ese entrenamiento. `handlePublish`:
     Comunidad → `createPost` con `buildRoutePostText`; Solo yo → sin
     post; en ambos casos se cierra la tarjeta, se muestra el mensaje
     y se refresca.
   - Historial: la tarjeta se toca para abrir el detalle (se quita el
     botón «Ver ruta» / estado `openRoute`; un solo mecanismo). El
     detalle muestra `RouteMini` (si hay ruta), stats completos, notas
     y: si el entrenamiento fue publicado (hay un post cuyo marcador
     apunta a su id) → «Publicado en Comunidad» + su texto; si no →
     botón «Publicar recorrido» que abre `PublishWorkoutCard` con ese
     entrenamiento. Sin ruta (manual o importado sin GPS): solo
     números, sin romperse.
   - Recibe nueva prop `posts: Post[]` (la pasa App).
6. `src/components/Community.tsx`
   - Nueva prop `workouts: Workout[]`.
   - En el feed, cada post se pasa por `parseRoutePost`: si es un
     recorrido, el cuerpo es `WorkoutPostCard` (ruta completa propia
     si el workout está en `workouts`, si no la polilínea del
     marcador); si no, el `<p>` de texto de siempre.
   - El filtro por deporte sigue funcionando: el marcador lleva el
     deporte en texto, así que un recorrido sin nota sigue apareciendo
     bajo su deporte.
   - Pasa `workouts` a `PublicProfile`.
7. `src/components/PublicProfile.tsx`
   - Nueva prop opcional `workouts?: Workout[]`. Sus publicaciones
     usan el mismo cuerpo (`WorkoutPostCard` si es recorrido, texto
     si no) para que el marcador nunca se vea en crudo.
8. `src/App.tsx`
   - `<Community … workouts={workouts} />` y
     `<Train … posts={posts} />`. Solo paso de props.

### No se toca

- `GpsTracker.tsx` (grabación, filtros, B1, cronómetro), `MusicPlayer`,
  login, `store.ts` (ni `createPost` ni `logWorkout`), `schema.sql`
  ni migraciones, `Home.tsx`.

## Aceptación

- `npm run build` exit 0.
- Publicar un recorrido GPS con Comunidad crea el post; en Comunidad
  se ve la tarjeta con mapa + números + texto; el marcador no se ve
  en ningún sitio.
- Solo yo no crea post; el entrenamiento queda en el historial con
  su detalle con mapa.
- Tocar un entrenamiento del historial abre su detalle (mapa +
  números + texto si fue publicado + botón de publicar si no).
- Un entrenamiento sin ruta muestra el detalle sin mapa y sin errores.
- Un post de texto normal se ve exactamente igual que antes.

## Riesgos

- R1 — La polilínea del feed es una ruta reducida (40 puntos): el
  dibujo del mapa en Comunidad es aproximado, no punto a punto. La
  ruta completa solo la ve el dueño en su historial. Aceptado por
  diseño (sin migración no hay otra vía).
- R2 — Si el usuario borra el entrenamiento después de publicarlo,
  la tarjeta del feed sigue mostrando el mapa y los números desde el
  marcador (autocontenida). No se rompe; el detalle del historial ya
  no existe.
- R3 — El marcador vive en el texto del post: si alguien edita el
  texto fuera de la app, el parseo falla y el post se ve como texto.
  No hay edición de posts en la app.
- R4 — `PublicProfile` de otro usuario dibuja el mapa solo desde la
  polilínea del marcador (no puede leer su workout por RLS). Igual
  que en el feed.
- R5 — Al cambiar a Ciclismo en vivo el contador de pasos sigue
  sumando en segundo plano (borde preexistente del build 43, fuera
  de alcance): si se publica ese entrenamiento, los pasos guardados
  pueden no ser cero. No se toca aquí.
