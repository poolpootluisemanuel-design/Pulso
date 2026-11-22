# Auditoría — PULSO estilo app vs website (2026-11-22)

Inspección completa con el sistema multiagente v2 (coordinador +
/arquitecto + /diseñador + /tester + /auditor). Solo inspección:
no se implementó nada. Rama: feature/separate-routes-from-sessions,
GitHub HEAD 1db1cba (build 41). Pedido por Luis: re-inspeccionar la
estructura, las funciones, las animaciones, que sea responsive y que
tenga diseño de app, no de website.

## 1. Los dos reportes de Luis — causa exacta verificada

### (a) La hoja del reproductor se corta arriba — CONFIRMADO

La hoja mide su altura contra el viewport (`h-[92dvh]`,
`MusicPlayer.tsx:1195`) pero su borde inferior no está en el borde
del viewport: vive dentro del dock `#pulso-music`, anclado a
`bottom: calc(var(--pulso-nav-h) + env(safe-area-inset-bottom, 0px))`
(`index.css:33`, `--pulso-nav-h: 64px`, `App.tsx:536`). Nada resta
ese offset de la altura.

Fórmula (H = alto del viewport en px CSS):
**recorte = 64 + safe-area + 52·(GPS grabando) − 0,08·H**.

Contenido interno: tirador 0–18 px, encabezado ~18–46 px, portada
desde ~58 px (`MusicPlayer.tsx:1264-1291`). En un A56 (viewport
~411×891): sin GPS, recorte típico 9–27 px (gestos) o ~41 px
(3 botones); con GPS grabando, 45–79 px (gestos) y hasta ~100 px
(botones), porque la pastilla GPS (`h-11` + `mb-2` = 52 px) se
renderiza como hermana encima de la hoja dentro del mismo dock sin
condición de `musicExpanded` (`App.tsx:537-548`). Eso reproduce
exactamente lo que vio Luis: sin tirador, sin encabezado, portada
cortada. El corte es irrecuperable por el usuario: `scrollTop = 0`
ya muestra el tope, el arrastre solo baja (`Math.max(0, …)`,
`MusicPlayer.tsx:237`), y no hay gesto que suba la hoja.

Queda abierto: no se sabe si Luis tenía el GPS grabando ni su modo
de navegación (gestos o 3 botones) — esos dos datos fijan el
recorte real entre ~15 px y ~100 px.

### (b) «Pasos hoy» a veces marca 0 — CONFIRMADO, tres mecanismos

Cadena: `TodaySteps.tsx` → `todaySteps.ts` → `stepCounter.ts` →
`StepCounterPlugin.java`.

- Mecanismo 1: `todayISO()` usa `new Date().toISOString()` — fecha
  UTC, no local (`todaySteps.ts:22-24`). En Cancún (UTC-5) el día
  cambia a las 19:00 local: a esa hora la base guardada deja de
  coincidir y el contador se pone en 0; el «día» medido es de 19:00
  a 19:00. El comentario del archivo dice «base de hoy a las 00:00»
  (`:5-7`) pero el código usa UTC.
- Mecanismo 2: la base se fija en la primera lectura del día
  (`:55-58`): si Luis abre la app tarde, los pasos caminados antes
  se pierden y marca 0 con «Pasos del sistema».
- Mecanismo 3: tras reiniciar el teléfono el sensor vuelve a ~0 y
  se toma base nueva (`:59-62`; plugin `latestTotal = -1` hasta el
  primer evento).
- Descartado: falta de permiso/sensor no explica el 0 con esa
  etiqueta (cae al fallback Health Connect, etiqueta distinta).
- Defecto aparte: el fallback Health Connect devuelve 0 en vez de
  null cuando no hay muestras (`healthConnect.ts:61`); su fecha sí
  es local correcta (`:52`, `setHours(0,0,0,0)`).

## 2. Qué ya se siente como app y qué se siente como web

| Pantalla | Ya app | Se siente web (evidencia) |
|---|---|---|
| Inicio | Hero compacto, botón grande «Entrenar con GPS», puntos de semana | Feed de tarjetas blancas; gráfica SVG de 12 semanas estilo dashboard (`Home.tsx:176-196`); pie explicativo (`:211`); `Empty` solo texto gris |
| Sesiones (lista) | Píldoras Lista/Mapa, FAB «+ Crear», chat como hoja, cancelar con doble toque | Sesiones como `Card` con acciones como enlaces de texto subrayados (`SessionsTab.tsx:375-398`); formulario de crear largo apilado (`:199-247`); «Me apunto» ~33 px (`:386`) |
| Sesiones (mapa inmersivo) | Mapa a pantalla completa, hoja de 3 estados (76 px / 42 % / 85 %), panel lateral ≥768 px, anillo pulsante | Filas de la hoja solo lectura (tocar no hace nada; detalle solo en popup del marcador, `:190-196`); texto de ayuda repetido (`:281`, `:356`) |
| Explorar — Rutas | Elegir ruta → guía en Entrenar | Mapa metido en tarjeta de 320 px fijos (`RoutesTab.tsx:110-122`) — el patrón web viejo |
| Comunidad — feed | Chips por deporte; autor abre perfil público | Compositor web (`Card` + `textarea` + botón, `Community.tsx:88-102`); texto «Esta parte crece cuando ya haya usuarios» (`:132`) |
| Entrenar | Botón grande «Grabar con GPS»; historial con mini-mapa SVG | `<details>/<summary>` para importar (`Train.tsx:164-179`) — widget web; 3 tarjetas de estadísticas; registro manual como formulario |
| GPS | Números grandes `tabular-nums`; tarjeta oscura de navegación; botones a ancho completo | Párrafos explicativos largos: caja Health Connect con 3 párrafos (`GpsTracker.tsx:687-708`), «La línea teal es la ruta recomendada…» (`:661`), «En la app instalada el GPS sigue grabando…» (`:774`); «Quitar guía» en `text-xs` (`:652`) |
| Perfil | «👀 Ver como me ven»; cabecera con avatar | Una página larga con 6 `Card` apiladas; chips ~33 px (`:194,213`); «Borrar» en `text-xs` (`:149`); pies de ayuda |
| Reproductor (mini-barra) | Persistente, miniatura, barrita tocable, nunca se desmonta | Play/pausa con emoji ⏸/▶ (`:1206`); anterior/siguiente ~28 px (`:1225-1248`); «▲» glifo, no icono |
| Reproductor (hoja) | Hoja con tirador (90 px), «⌄ Recoger», portada grande, play 72 px, SeekBar grande, diagnóstico con 3 checks + reintento + «Reportar a soporte» (`:1370-1395`) — esto ya es app y Luis lo vio funcionar | Corte superior (§1a); emojis también en el botón grande (`:1322`); portada cuadrada con miniatura 16:9 → recorte lateral ~44 % (`mqdefault.jpg` 320×180, `youtubeExtractor.ts:57-59`; `object-cover`, `:1288`); SeekBar solo `onClick`, sin arrastre ni thumb (`:175-186`); la hoja es una página larga con scroll (diagnóstico + cola + presets + link + local + interruptor) |
| Mapa | Selector Deportivo/Oscuro/Satélite, 2D/3D, «📍 Seguirme» con `easeTo` 600 ms; controles `h-11` | Tarjeta de controles de ancho fijo `w-28` × 5 filas ≈ 220 px tapando el mapa (`MapView.tsx:641-656`); píldoras ~30 px (`:613-621`); aviso en `text-[11px]`; overlay «Cargando mapa…» |
| Global | Nav de 4 pestañas con iconos SVG reales (`icons.tsx`); safe-area en encabezado/nav; apilado nav+música+GPS calculado | Toda la app es un feed de tarjetas blancas `rounded-3xl` sobre marfil (`ui.tsx:13-15`); `Empty` es solo `<p>` gris (`ui.tsx:60-62`, usado en 12 sitios); `Btn` base ~48 px pero se achica con `py-1.5` en media app; etiquetas de nav en `text-[11px]` |

**Animaciones — existen:** cambio de pestaña fade +
`translateY(6px)` 0,15 s (`index.css:89-90`); presión `scale(.96)`
en `Btn`/nav/FAB/segmentados; entrada de la hoja del reproductor
`translateY(100%→0)` + opacidad 0,3 s; transición de altura en
`MapBottomSheet`; ping del marcador; `animate-pulse` del punto GPS;
`easeTo` 600 ms en «Seguirme». **Faltan / se sienten web:** la hoja
del reproductor no tiene animación de salida (al recogerla cambia a
mini-barra al instante); el chat aparece sin slide ni fade;
`MapBottomSheet` anima `height` en % (propenso a tirones); no hay
deslizamiento entre pestañas, ni pull-to-refresh, ni
swipe-to-delete/dismiss (el único arrastre de toda la app es el de
las dos hojas); `pulso-press` no está en chips, filas de cola ni
enlaces; los estados de carga son texto plano («Cargando mapa…»,
sin esqueletos).

**Táctil / responsive:** controles < 44 px por todas partes —
chips/píldoras ~33 px (presets, «Me apunto», «Entrenando ahora»,
deportes/días, grupos), ↑↓✕ de la cola ~20 px, anterior/siguiente
de la mini-barra ~28 px, interruptor «Mantener pantalla encendida»
~28 px, «Seguirme» ~30 px, tirador de `MapBottomSheet` ~18 px,
avatar del encabezado 36 px. Lo que sí cumple: `Btn` base ~48 px,
FAB 56 px, play grande 72 px, controles de zoom 44 px. Sin roturas
en 412 px (rejillas de 2–3 columnas caben; SVG con `viewBox`
escala); frágiles solo el `w-28` del mapa y el `w-28` de Perfil.
El apilado nav (64) + música (64) + GPS (52) + safe-area está bien
calculado (`index.css:22-48`); el punto débil es solo la hoja del
reproductor.

## 3. Funciones: existe / a medias / solo texto

Existe: 4 pestañas + Entrenar siempre montado (`App.tsx:489-490`);
música local + YouTube por extractor; GPS con B1 y cronómetro por
reloj; mapa Deportivo + satélite; mapa en vivo (código; Realtime
Authorization en panel sin verificar); chat con Realtime + polling
5 s; sesiones + RSVP + lista de espera; publicaciones, perfiles
públicos, buscar; retos/logros (cálculo local); importar del reloj
(sin ruta GPS ni FC, 30 días) y GPX/TCX; modo invitado; offline +
cola; tutorial + permisos; guía por ruta; actualización web por
service worker.

A medias: «Entrenador IA» — son solo reglas, no hay IA
(`coach.ts:1`; etiqueta `🤖 Entrenador IA` en `CoachPlan.tsx:70`);
Negocios — solo lectura (`Businesses.tsx:15`, «Pronto podrás
registrarte aquí»); AdminPanel — depende de migración no aplicada
(`AdminPanel.tsx:106`); push — solo registro del token FCM, nadie
envía nada (`pushNotifications.ts:1-16`; sin envío en `src/` ni
`supabase/`), y `onPushReceived` nunca se cablea (`App.tsx:166`
llama a `setupPushNotifications(user.id)` sin callbacks;
`pushNotifications.ts:183` solo lo cablea si se pasa
`callbacks.onReceived`); aviso de actualización APK — muerto hoy
(`APP_BUILD = 24` = remoto 24, `appUpdate.ts:21`; es I7, no se
reabre).

Código muerto: `MoreMenu.tsx` (58 líneas, nadie lo importa).

No existe en PULSO: campana/centro de avisos (eliminado a
propósito), pagos/membresías (eso es MercaIslaMX).

Estructura (riesgos): tres monolitos — `MusicPlayer.tsx` 1580
líneas, `store.ts` 1205, `GpsTracker.tsx` 800 — sin suite de tests
(`find src -name "*.test.*"` vacío; `package.json` sin script
`test`). Estado repartido (música en `MusicPlayer` + `store.ts` +
`activity.music`; GPS en `GpsTracker` + `Train` +
`activity.gps`). `MapView` se instancia en 4 sitios
(`SessionsTab.tsx:267,303`, `RoutesTab.tsx:93`,
`GpsTracker.tsx:621`): salir de Comunidad destruye el mapa y la
suscripción de presencia, y volver lo reconstruye con re-descarga
de tiles. Dos sistemas de actualización que no se hablan (web por
SW, APK por `version.json`).

## 4. Falsos positivos corregidos por el auditor (no van al informe final)

- D-1 «El trabajo del build 41 está perdido» — DESCARTADO.
  `git ls-remote` → `origin/feature/separate-routes-from-sessions`
  = `1db1cba`; `git diff 1db1cba -- src` = 0 líneas; su historia
  incluye `f902d22` (B1+I1+I4), `9eeabd6` (I2+I3), `4492fbd` (wake
  lock + cronómetro) y `1db1cba`. El código del build 41 está a
  salvo en GitHub. El riesgo real es otro: divergencia de
  historiales — HEAD local `4a0a208` es una línea paralela con los
  mismos mensajes pero hashes distintos (merge-base `fd8eb33`); un
  push descuidado desde local (peor con `--force`) pisaría la línea
  buena. CORREGIDO 22 nov 11:39 EST por el agente principal: local
  alineado a `1db1cba` (`git reset --hard`, `git add docs/`),
  `git status` limpio, `git diff HEAD` vacío. Nada se subió a
  GitHub en esa operación.
- D-2 «Push imposible por falta de google-services.json» —
  CORREGIDO. El archivo no existe localmente, pero está en
  `.gitignore:31` por diseño (se filtró el 2026-11-17) y el CI lo
  restaura desde el secreto (`.github/workflows/build-apk.yml:39-40`).
- D-3 «En la previa web la hoja cabe» — CORREGIDO. La previa de la
  rama devuelve «Protected Deployment – Vercel / Login – Vercel»;
  nadie observó la hoja en la previa.
- D-4 Pasos en 0 por falta de permiso/sensor — descartado
  (etiqueta distinta). D-5 «Commits duplicados idénticos» — mismo
  mensaje, árboles distintos. D-6 «El corte es solo por el 92dvh»
  — es 92dvh + offset del dock + GPS.

## 5. Lo que NO se pudo verificar

La previa de la rama en modo invitado (Deployment Protection pide
login de Vercel; hace falta navegador en vivo con sesión o quitar
la protección). Todo lo nativo solo se prueba en el A56: GPS en
campo y segundo plano, ExoPlayer y wake lock con pantalla apagada,
notificaciones, pasos del sistema, gestos táctiles, audio real de
YouTube/extractor, instalación encima (firma). Realtime
Authorization / RLS en el panel de Supabase (no verificable en
código). Pantallas no revisadas a fondo en este pase:
`Businesses.tsx`, `CoachPanel.tsx`, `Challenges.tsx`, `Search.tsx`.

## 6. Lista priorizada de arreglos

### P0 — Rompe el uso o se ve mal en el teléfono. Antes de la RC del 25 nov.

| # | Arreglo | Evidencia | Verificar en el A56 |
|---|---|---|---|
| P0-1 | Geometría de la hoja del reproductor: altura contra el dock, no contra el viewport (`calc(100dvh − bottom_del_dock)` o sacar la hoja a `fixed` propio); la pastilla GPS no debe empujarla 52 px más arriba | `MusicPlayer.tsx:1195` `h-[92dvh]` en el dock `index.css:33` (bottom 64 + safe-area); `App.tsx:537-548` pastilla GPS sin condición de `musicExpanded`. Corte 9–27 px sin GPS, 45–79 px con GPS (H=891) | Hoja sin GPS y con GPS grabando: tirador, encabezado y portada completos; corte = 0 en ambos casos |
| P0-2 | «Pasos hoy»: `todayISO()` a fecha local (00:00 local, como ya hace `healthConnect.ts:52`) y no fijar la base en la primera lectura sin más (o avisar); corregir el comentario «00:00» que contradice el código | `todaySteps.ts:22-24` (UTC), `:55-58` (base en primera lectura), `:59-62` (rebase tras reinicio); comentario `:5-7` | Anotar «Pasos hoy» 18:55 vs 19:05 caminando entre medias; un día no abrir PULSO hasta después de caminar (mediodía) y anotar al abrir; tras reiniciar el teléfono |
| P0-3 | Iconos del reproductor: sustituir ⏸/▶/⏮/⏭/▲/⌄/↑/↓/✕ por SVG (patrón `icons.tsx`, `IconPlay` usado en `Home.tsx:131`) y portada 16:9 u `object-contain` en vez de cuadrada con recorte del 44 % | `MusicPlayer.tsx:1206`, `:1322`, `:1225-1248`, `:1187-1189`; `youtubeExtractor.ts:57-59` `mqdefault.jpg`; `MusicPlayer.tsx:1288`. En Samsung los glifos se ven como emoji amarillo | Abrir la hoja: play/pausa y controles se ven como iconos, no emoji; portada sin recorte lateral |
| P0-4 | Fijar la línea canónica de git antes de compilar la RC: `1db1cba` (remoto) es la base buena; alinear el HEAD local con ella y no pushear desde `4a0a208` | Ver §4 D-1. Sin esto, la RC podría compilarse desde la línea equivocada | Confirmar `git rev-parse HEAD` = `1db1cba` (o su descendiente) antes de lanzar el build de RC |
| P0-5 | Verificar que el APK instalado en el A56 corresponde al árbol auditado (huella del certificado; build 41 exige desinstalar el build 40 primero por la llave debug nueva). No reabre la firma; es verificación de correspondencia | Build 41 cert SHA-256 `C6:CC:8F:70…`, 11.266.386 bytes | Comprobar el APK instalado es el build 41 |

### P1 — Se siente web pero funciona. Antes del lanzamiento si da tiempo.

| # | Arreglo | Evidencia |
|---|---|---|
| P1-1 | Barrido de objetivos táctiles < 44 px: chips/píldoras (~33 px), ↑↓✕ de la cola (~20 px), anterior/siguiente de la mini-barra (~28 px), «Me apunto» (~33 px), «Seguirme» (~30 px), tirador de `MapBottomSheet` (~18 px), avatar del encabezado (36 px) | `SessionsTab.tsx:386`, `:333`; `ProfileTab.tsx:194,213`; `Community.tsx:76`; `MusicPlayer.tsx:1187-1189`, `:1225-1248`, `:1132-1144`, `:1472-1479`; `MapView.tsx:613-621,667`; `MapBottomSheet.tsx:126-132`; `App.tsx:368-371` |
| P1-2 | Acciones como texto → botones reales: «Ver quién va / 💬 Chat / Cancelar», «Borrar», «Quitar guía» | `SessionsTab.tsx:375-398,400-426`; `ProfileTab.tsx:149`; `GpsTracker.tsx:652` |
| P1-3 | `Empty` con icono + CTA en vez de texto gris solo | `ui.tsx:60-62`, usado en 12 sitios |
| P1-4 | Filas de sesión/ruta tocables que abran detalle (hoy la hoja es solo lectura y el detalle solo vive en el popup del marcador). Decisión de producto: cambia el contrato de `MapBottomSheet.tsx:8-11` | `SessionsTab.tsx:190-196`, `:275-290`, `:350-360`; `RoutesTab.tsx:93-105` (mapa en tarjeta de 320 px, patrón web viejo) |
| P1-5 | `healthConnect.ts:61`: devolver `null` (sin datos) en vez de `0` | Evita un «0» engañoso con fuente «health» |
| P1-6 | Push: cablear `onPushReceived` en `App.tsx:166` (pasar `callbacks`) y definir el emisor (o retirar la promesa). La parte de `google-services.json` ya NO es un bloqueo para el APK de CI | `pushNotifications.ts:105,175-188`; `build-apk.yml:39-40` |
| P1-7 | «Entrenador IA» → renombrar en UI a «plan por reglas» o documentarlo como tal | `coach.ts:1`; `CoachPlan.tsx:70` |
| P1-8 | Animaciones: salida de la hoja del reproductor, entrada del chat, quitar la transición por % de altura en `MapBottomSheet`, `pulso-press` en chips y filas | `MusicPlayer.tsx:1195-1198`; `SessionsTab.tsx:447-452`; `MapBottomSheet.tsx:103,107` |
| P1-9 | Tarjeta de controles del mapa `w-28` más estrecha (cubre ~27 % del ancho en 412 px) | `MapView.tsx:641-656` |
| P1-10 | Borrar `MoreMenu.tsx` (código muerto) y el comentario obsoleto «cableado pendiente» de `CoachPanel.tsx:7` | `MoreMenu.tsx:20`; `CoachPanel.tsx:7`; `App.tsx:456` |

### P2 — Después del lanzamiento.

| # | Arreglo | Evidencia |
|---|---|---|
| P2-1 | Microcopy: acortar párrafos explicativos (GPS, Perfil, Sesiones, reproductor) y pies de ayuda | `GpsTracker.tsx:687-708,774`; `ProfileTab.tsx:251-253,259-261`; `SessionsTab.tsx:459`; `Home.tsx:211` |
| P2-2 | Formularios largos (crear sesión, registro manual, perfil) en secciones o pasos | `SessionsTab.tsx:199-247`; `Train.tsx:117-145`; `ProfileTab.tsx` (6 `Card` apiladas) |
| P2-3 | SeekBar con arrastre + thumb; gestos (swipe entre pestañas, pull-to-refresh, swipe-to-delete/dismiss) | `MusicPlayer.tsx:175-186`; inventario de gestos: solo arrastre de las dos hojas |
| P2-4 | Deuda estructural: extraer lógica de audio de `MusicPlayer.tsx` (1580 líneas); una sola fuente de verdad para GPS/música; evaluar que el mapa de Sesiones sobreviva al cambio de pestaña como ya hace Train; auditar `toISOString()` para «hoy» en todo `src/` | `MusicPlayer.tsx`, `store.ts` (1205), `GpsTracker.tsx` (800); `App.tsx:489-490` |
| P2-5 | Negocios: registro real («Pronto podrás registrarte aquí») y AdminPanel con la migración aplicada | `Businesses.tsx:15`; `AdminPanel.tsx:106` |
| P2-6 | Mapa en vivo: verificar Realtime Authorization / RLS en el panel de Supabase (no verificable en código) | `liveTraining.ts:165-167` |

## 7. Riesgos

- R1 — Divergencia de historiales (el riesgo real de git): HEAD local `4a0a208` y remoto `1db1cba` son líneas paralelas casi idénticas. Un `git push` descuidado desde local (y peor con `--force`) puede borrar la línea buena de GitHub. Mitigación: alinear local a `1db1cba` antes de cualquier push o build de RC. (Hecho 22 nov 11:39 EST.)
- R2 — Hoja inutilizable en su parte superior: mientras el corte exista, el tirador (único gesto de arrastre) es intocable en muchos casos y el botón «⌄ Recoger» puede quedar parcialmente fuera.
- R3 — «Pasos hoy» seguirá marcando 0 a las 19:00 cada día aunque se arregle la base: es un reseteo diario por diseño accidental (fecha UTC). Cualquier prueba de pasos hecha después de las 19:00 dará un 0 engañoso.
- R4 — Sin tests: tocar `MusicPlayer.tsx` (1580 líneas) o `store.ts` (1205) sin suite de tests puede romper música, GPS, sesiones o login. Cada arreglo P0/P1 necesita su prueba en el A56.
- R5 — Falsas promesas en UI que quedan: actualización del APK (I7, ya planificado), notificaciones push (sin emisor + sin cablear) y «Entrenador IA» (reglas, no IA) se presentan como funciones que la estructura actual no sostiene del todo.
- R6 — Previa de la rama no testeable sin login de Vercel: el equipo no puede verificar la rama en web hasta resolver la protección.

## 8. Siguiente paso

Que Luis elija qué se arregla: como mínimo decidir sobre los P0
(fijar la línea de git, geometría de la hoja, pasos, iconos/portada)
y autorizar su implementación, y aportar desde su A56: (1) si el
GPS estaba grabando cuando vio la portada cortada, (2) su modo de
navegación (gestos o 3 botones) y escalado de pantalla, (3) las
pruebas de pasos (18:55 vs 19:05; primera apertura tardía; tras
reinicio). Sin implementar nada hasta su autorización, como exige
el sistema v2.
