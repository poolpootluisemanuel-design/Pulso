# Fix P0 — hoja del reproductor, «Pasos hoy» e iconos (2026-11-22)

Spec antes de programar (sistema v2). Autorizado por Luis («Si»,
22 nov 2026) a arreglar los tres P0 de
docs/auditoria-app-vs-web-2026-11-22.md (§1 y §6). Rama:
feature/separate-routes-from-sessions, base GitHub HEAD 1db1cba
(build 41). Solo estos tres arreglos; nada más.

## P0-1 — Geometría de la hoja del reproductor

**Qué:** la hoja expandida se corta arriba (~41 px con 3 botones de
navegación y sin GPS grabando, que es el caso de Luis): no se ven
el tirador ni el encabezado «🎵 Música para entrenar» y la portada
sale cortada. Además el usuario no puede recuperar el tope: el
scroll interno ya está arriba y el arrastre solo baja.

**Por qué:** la hoja mide `h-[92dvh]` contra el viewport
(`MusicPlayer.tsx:1195`) pero vive dentro del dock `#pulso-music`,
cuyo borde inferior está a `64 px + safe-area` del borde del
viewport (`index.css:33`, `--pulso-nav-h: 64px`). Nada resta ese
offset de la altura, así que el tope queda fuera de la pantalla.
La pastilla GPS (`App.tsx:537-548`) vive en el mismo dock y, con
GPS grabando, empuja el conjunto 52 px más arriba.

**Cómo:**
1. Nueva clase `.pulso-player-sheet` en `src/index.css`:
   `height: calc(92dvh - var(--pulso-nav-h) - env(safe-area-inset-bottom, 0px))`.
   La hoja usa esa clase en vez de `h-[92dvh]`. El tope queda a
   8dvh del borde superior del viewport, sin cortar nada, tanto
   con safe-area 0 como con barra de gestos o 3 botones.
2. La pastilla GPS del dock se oculta mientras el reproductor está
   expandido (`App.tsx`: condición `!musicExpanded`). El estado de
   grabación sigue visible en Entrenar; la pastilla vuelve al
   recoger la hoja.
3. Al abrir la hoja, su scroll interno se lleva a arriba
   (`sheetRef.current.scrollTop = 0` en el efecto de `expanded`),
   para que el tirador y el encabezado sean lo primero que se ve
   aunque el contenido cambie después (diagnóstico, cola).

**Aceptación:** con nav 64 px + safe-area, el tope de la hoja queda
≥ 0 px del viewport tanto sin GPS como con GPS grabando; tirador,
encabezado y portada completos y visibles.

**Verificar en el A56:** abrir la hoja sin GPS y con GPS grabando;
tirador, encabezado y portada completos; recoger con ⌄ y con el
tirador; la pastilla GPS no se ve con la hoja abierta y vuelve al
recogerla.

## P0-2 — «Pasos hoy» en 0

**Qué:** la tarjeta «Pasos hoy» a veces marca 0 con fuente «Pasos
del sistema»: a las 19:00 local se resetea sola, y si Luis abre la
app al mediodía después de caminar, los pasos de la mañana no se
cuentan.

**Por qué (tres mecanismos, `src/lib/todaySteps.ts`):**
1. `todayISO()` usa `new Date().toISOString()` — fecha UTC, no
   local. En Cancún (UTC-5) el «día» cambia a las 19:00 local y
   la base guardada deja de coincidir → 0. El comentario del
   archivo dice «base de hoy a las 00:00» pero el código usa UTC.
2. La base del día se fija en la primera lectura del día: si abre
   la app tarde, los pasos caminados antes se pierden.
3. Tras reiniciar el teléfono el sensor vuelve a ~0 y se toma base
   nueva (los pasos de antes del reinicio se pierden).
Defecto aparte: `healthConnect.ts:61` devuelve `0` cuando no hay
muestras, en vez de `null` (sin datos) — un 0 engañoso.

**Cómo:**
1. `todayISO()` usa la fecha LOCAL (año/mes/día del `Date` local),
   como ya hace `healthConnect.ts:52` con `setHours(0,0,0,0)`.
   El día pasa a ser de 00:00 a 00:00 local.
2. Corregir el comentario del encabezado de `todaySteps.ts`
   (líneas 5-7) para que describa lo que el código hace de verdad,
   incluido el nuevo paso con Health Connect.
3. Primera lectura del día (sin base guardada para hoy) o tras
   reinicio (total < base): intentar primero Health Connect
   (`getTodaySteps()`). Si devuelve un número, ese es el total del
   día (fuente `'health'`) y la base del sistema se guarda como
   `total - hc`, para que las lecturas siguientes del contador del
   sistema continúen desde ahí sin saltos. Si Health Connect no
   devuelve nada (null), se cae al comportamiento actual del
   sistema (base = total actual).
4. `healthConnect.ts:61`: devolver `null` en vez de `0` cuando no
   hay muestras. Los dos usos en `GpsTracker.tsx` (líneas ~290 y
   ~368) ya comprueban `!== null` / `=== null`, así que el cambio
   es seguro ahí: sin muestras cae a la estimación o al mensaje
   honesto, en vez de contar desde una base 0 falsa.

**Aceptación:** «Pasos hoy» no se resetea a las 19:00 local
caminando entre medias; abrir la app al mediodía después de
caminar no marca 0 si Health Connect tiene los pasos; tras
reiniciar el teléfono el contador se intenta recuperar con Health
Connect antes de resetear.

**Verificar en el A56:** anotar «Pasos hoy» 18:55 vs 19:05
caminando entre medias; un día no abrir PULSO hasta después de
caminar (mediodía) y anotar al abrir; tras reiniciar el teléfono.

## P0-3 — Iconos del reproductor + portada

**Qué:** los botones del reproductor se ven como emoji amarillo en
Samsung (⏸/▶/⏮/⏭/▲/⌄/↑/↓/✕ son glifos de texto, no iconos). La
portada expandida es cuadrada (224×224) con una miniatura 16:9
(320×180, `mqdefault.jpg`) y `object-cover`: se recorta ~44 % de
los lados.

**Por qué:** el reproductor usa caracteres de texto como iconos;
en Samsung esos glifos se pintan como emoji a color. La portada
cuadrada no corresponde al aspecto 16:9 de la miniatura.

**Cómo:**
1. Añadir a `src/components/icons.tsx` (mismo patrón Feather:
   trazo `currentColor`, vista 24×24) solo los que faltan:
   `IconPause`, `IconSkipBack`, `IconSkipForward`,
   `IconChevronUp`, `IconChevronDown`, `IconArrowUp`,
   `IconArrowDown`, `IconX`. `IconPlay` ya existe.
2. En `src/components/MusicPlayer.tsx`, sustituir los glifos por
   esos SVG (mini-barra y hoja): play/pausa, anterior/siguiente,
   ▲ expandir, ⌄ Recoger, ↑ ↓ ✕ de la cola, el indicador ▶ de la
   fila que suena, «▶ YouTube» y «▶ Abrir en YouTube». Los emoji
   decorativos de texto (🎵 del título, 📱, 🔆…) no son controles
   y no se tocan.
3. La portada expandida deja de ser cuadrada: `aspect-video w-full
   max-w-md` (16:9, ancho completo) tanto en `TrackThumb` como en
   el div de reserva sin canción. Con el mismo aspecto que la
   miniatura, `object-cover` ya no recorta los lados.

**Aceptación:** play/pausa y controles se ven como iconos (no
emoji amarillo); la portada no recorta los lados.

**Verificar en el A56:** abrir la hoja: play/pausa y controles se
ven como iconos; portada completa sin recorte lateral; mini-barra
con iconos; la cola sigue con ↑ ↓ ✕ funcionando.

## Archivos que se tocan (y solo estos)

- `docs/fix-p0-hoja-pasos-iconos.md` (este spec)
- `src/index.css` (clase `.pulso-player-sheet`)
- `src/components/MusicPlayer.tsx` (P0-1 altura + scroll, P0-3 iconos + portada)
- `src/App.tsx` (P0-1 pastilla GPS condicionada a `!musicExpanded`)
- `src/components/icons.tsx` (P0-3 iconos nuevos)
- `src/lib/todaySteps.ts` (P0-2 fecha local + Health Connect en primera lectura + comentario)
- `src/lib/healthConnect.ts` (P0-2 `null` sin muestras)

## No se toca

GpsTracker, store.ts, sesiones, Supabase, workflows, main, firma
APK. No se añaden funciones nuevas. No hay commit ni push (el
coordinador revisa el diff y sube).
