# PULSO nativa (Android) — base con Capacitor

La misma web de PULSO, empaquetada como app Android con **Capacitor 8**.
La web sigue igual: se despliega en Vercel como siempre; Capacitor solo
lee la carpeta `dist` que genera `npm run build`.

## Rediseño 2026-11-18 (paleta cálida pastel, elegida por Luis)

- **Paleta nueva** (reemplaza azul noche/rojo): fondo marfil `#FFF9F0`,
  rosa suave `#F2A7B8` (principal), lila `#D9B8E6` (secundario),
  albaricoque `#FFD9B8`, menta crema `#CDE8C5`, texto marrón `#4A2E28`.
  Los nombres de clases Tailwind se mantienen como alias
  (`tailwind.config.js`): `night` = marrón, `pulso` = rosa,
  `teal` = lila. El texto sobre rosa es marrón oscuro, no blanco.
  El mapa sigue oscuro (se lee mejor).
- **Logo nuevo**: P gruesa con línea de pulso, degradado rosa→lila
  (`src/components/Logo.tsx`, SVG inline, sin archivo de imagen).
  **PENDIENTE: el ícono launcher de Android** sigue siendo el viejo:
  cambiarlo requiere subir los PNG por la web de GitHub (el push por
  API rechaza binarios); no se hizo en este cambio.
- **Rediseño urgente**: FAB "+" solo en Sesiones (abre el formulario,
  con etiqueta "Crear"); importadores GPX/reloj colapsados al final de
  Entrenar en "⋯ Más opciones"; campana del header quitada (indicador
  falso); un solo botón rosa por pantalla; hero de Inicio compacto
  (120 px) y sin "Tus deportes".

## Qué trae esta base

- **App Android `com.pulso.app` ("PULSO")**, con la carpeta `android/`
  generada por Capacitor (`npx cap add android`).
- **GPS en segundo plano**: plugin `@capacitor-community/background-geolocation`
  (v1.3.1). En la app instalada, al grabar un entrenamiento el GPS sigue
  con la pantalla apagada: Android corre un servicio en primer plano con
  la notificación "PULSO · Grabando" y las posiciones siguen llegando,
  como Strava. En web no cambia nada: ahí el GPS se pausa al apagar la
  pantalla (límite del navegador, no de PULSO).
- **Pasos con Health Connect**: plugin `@capgo/capacitor-health` (v8.13.0).
  En la app instalada, Entrenar → Grabar con GPS tiene el botón
  "Ver mis pasos" que lee los pasos de hoy de Health Connect (donde
  Samsung Health y Google Fit juntan sus datos).
- **Pasos precisos al grabar (app nativa)**: plugin propio
  `StepCounter` (`android/app/src/main/java/com/pulso/app/
  StepCounterPlugin.java`, sensor TYPE_STEP_COUNTER del sistema, con
  permiso ACTIVITY_RECOGNITION). Es la fuente principal mientras se
  graba: es precisa y sigue contando con la pantalla apagada (al
  volver se lee el delta acumulado). Si el teléfono no tiene ese
  sensor o no hay permiso, cae a Health Connect (delta de los pasos
  de hoy) y, si tampoco hay, a la estimación por aceleración
  (DeviceMotion), que es la única que existe en web. La pantalla dice
  de dónde viene el conteo ("Pasos del sistema" / "Health Connect" /
  "estimado").
- **Mapa que se recupera al encender la pantalla**: MapView distingue
  la pérdida transitoria de contexto WebGL (apagar/encender suspende
  la WebView) de WebGL realmente no soportado. Al perder el contexto
  muestra "Recuperando el mapa…" y al volver a primer plano lo
  re-inicializa con la ruta y la posición actuales; la grabación GPS
  no se toca (vive fuera del mapa).
- **Entrenamientos del reloj (Samsung Watch, Garmin...)**: plugin
  `@capgo/capacitor-health` (v8.13.0), método `queryWorkouts()`. En la
  app instalada, Entrenar tiene la tarjeta "⌚ Traer entrenamientos del
  reloj": pide permiso de lectura de entrenamientos, lee las sesiones
  de los últimos 30 días de Health Connect y deja elegir cuáles
  importar al historial (con aviso de duplicado, mismo criterio que el
  importador GPX). El entrenamiento importado queda marcado "⌚ Del
  reloj · Samsung Health" en las notas. No hace falta plugin nativo
  propio: el plugin ya expone las sesiones con tipo, inicio, fin,
  duración, distancia y calorías.
  - **Cómo llega el dato**: el reloj guarda en su app (Samsung Health,
    Garmin Connect...), esa app lo sincroniza al teléfono y Health
    Connect lo junta. No hay conexión directa con el reloj ni Bluetooth.
    Samsung Health: activar "Sincronizar con Health Connect" en sus
    ajustes. Garmin: activar "Health Connect" en Garmin Connect →
    Ajustes; si no, las sesiones no aparecen.
  - **Límites honestos**: no trae la ruta GPS ni la frecuencia
    cardíaca de la sesión (Health Connect no las expone en este
    plugin), así que el entrenamiento importado entra sin ruta
    dibujada. Solo se importan correr, caminar, ciclismo, natación,
    gym, yoga, CrossFit y surf; otros tipos (fútbol, tenis, esquí...)
    se cuentan pero no se muestran, para no guardar un deporte
    inventado. Sin el permiso de historial, Health Connect solo deja
    leer ~30 días (se pide junto con el permiso; en teléfonos viejos
    se ignora sin romper nada). Sesiones de menos de 1 minuto no se
    muestran.
- **Permisos declarados** en `android/app/src/main/AndroidManifest.xml`:
  ubicación precisa, ubicación en segundo plano (`ACCESS_BACKGROUND_LOCATION`),
  reconocimiento de actividad (pasos) e historial de salud. El servicio
  en primer plano de tipo `location` y los permisos de salud básicos los
  declaran los propios plugins en sus manifests.

## Permisos que pide la app (y por qué)

Al instalarla y al grabar por primera vez, Android pide:

1. **Ubicación "Permitir todo el tiempo"** — es el permiso clave: con
   solo "Permitir mientras se usa la app", el GPS se corta al apagar la
   pantalla. Android lo pide en dos pasos: primero "mientras se usa",
   luego hay que ir a Ajustes → PULSO → Ubicación → "Permitir todo el
   tiempo". La app lo explica en pantalla si no está dado.
2. **Notificaciones** — Android exige mostrar la notificación del
   servicio en primer plano mientras graba ("PULSO · Grabando").
3. **Actividad física** — para el sensor de pasos mientras grabas.
4. **Health Connect** — se pide desde la pantalla de Salud del sistema
   (pasos, distancia, entrenamientos). Sin permiso, PULSO sigue
   funcionando; solo no muestra los pasos de hoy ni puede traer los
   entrenamientos del reloj.
5. **Health Connect instalado** — Android 14+ lo trae de serie. En
   Android 13 o menos hay que instalar "Health Connect by Android"
   desde Play Store (la app tiene un botón que abre sus ajustes).
6. **Samsung Health** — no tiene API web ni directa: para que sus pasos
   lleguen a PULSO, el usuario debe activar en Samsung Health
   → Ajustes → "Sincronizar con Health Connect". Eso no se puede
   forzar desde PULSO; la app lo explica en pantalla.

## Bajar el APK sin computadora (recomendado)

Cada vez que se sube código a la rama `main` de GitHub, GitHub Actions
compila el APK debug automáticamente (workflow
`.github/workflows/build-apk.yml`: Node 20 → `npm run build` →
`npx cap sync android` → JDK 17 + Android SDK API 36 →
`./gradlew assembleDebug`) y lo deja como artifact
**`pulso-debug-apk`** por 30 días. Solo APK debug para probar: no hay
keystore, no hay firma release y no se publica nada en Play Store.

Desde el teléfono, sin computadora:

1. Abrir en Chrome: https://github.com/poolpootluisemanuel-design/Pulso/actions
2. Entrar al último run de **"Build APK debug"** (debe decir ✅ verde;
   tarda unos minutos en compilar; si está en amarillo, esperar a que
   termine).
3. Abajo, en **Artifacts**, tocar **pulso-debug-apk** para bajar el .zip.
4. Abrir el .zip descargado y tocar `app-debug.apk` para instalarlo
   (permitir "instalar apps desconocidas" solo para esa vez, si Chrome
   lo pide).

También se puede lanzar a mano: en esa misma página, botón **Run
workflow** → **Run workflow** (sin tocar nada más).

> ⚠️ La primera compilación en GitHub Actions todavía no se ha probado:
> el workflow se sube con este cambio y su primer run es el que
> confirma que compila. Si el run falla en rojo, hay que ver el log
> del paso que falló (normalmente versión de Gradle/JDK o del SDK) y
> ajustar el workflow. La web de Vercel no depende de esto: sigue
> desplegándose igual aunque el APK falle.

## Generar el APK en una computadora (alternativa)

Si prefieres compilarlo en local, hace falta Android Studio con el SDK
de Android (y Java 17+). Pasos:

```bash
cd activa-propia
npm install          # instala Capacitor y los plugins
npm run build        # genera dist (la web)
npx cap sync android # copia dist a android/ y actualiza los plugins
```

Luego, en Android Studio: **File → Open** → la carpeta `android/` →
esperar a que sincronice Gradle → **Build → Build App Bundle(s) / APK(s)
→ Build APK(s)**. El APK queda en
`android/app/build/outputs/apk/debug/app-debug.apk`.

Para probarlo en el teléfono (Samsung Galaxy A56 de Luis):

**Ícono de la app:** el proyecto Android trae todavía el ícono por
defecto de Capacitor. Antes de publicar, genera el ícono de PULSO en
Android Studio (clic derecho en `app/res` → New → Image Asset →
Launcher Icons) usando `public/icons/icon-512.png`.

1. Pasar el APK al teléfono (cable, Drive o WhatsApp) e instalarlo
   (permitir "instalar apps desconocidas" solo para esa vez).
2. Abrir PULSO, entrar con su cuenta (la misma de la web, en Supabase).
3. Entrenar → Grabar con GPS → dar ubicación "Permitir todo el tiempo".
4. Apagar la pantalla, caminar 2–3 minutos, volver a abrir: la ruta,
   la distancia y el ritmo deben seguir sumando con la pantalla apagada.
5. Probar el botón "Ver mis pasos" (Health Connect) con Samsung Health
   sincronizando con Health Connect.

**Qué NO se ha podido probar aquí:** no hay Android Studio ni SDK en
este servidor, así que el APK no se ha compilado ni probado en un
teléfono real. El build web (`npm run build`) sí pasa y la web sigue
live. La primera compilación en Android Studio puede pedir ajustes
(versión de Gradle/JDK, permisos) que habrá que resolver allí.

## Qué falta para Play Store (no hecho todavía)

- **Cuenta de desarrollador de Google Play: $25 USD, pago único**,
  a nombre de Luis. Se crea en play.google.com/console con su cuenta
  de Google. Nadie la ha creado ni pagado nada.
- **Firmar la app (release)**: generar un keystore (`keytool`) y
  configurar `android/app/build.gradle` con la firma. El keystore y
  sus contraseñas son de Luis y nunca van al repo ni al chat.
- **App Bundle (AAB) de release** en vez de APK de debug:
  `Build → Generate Signed App Bundle / APK` en Android Studio.
- **Ficha de Play Store**: descripción, capturas, ícono 512×512
  (ya existe en `public/icons/icon-512.png`), política de privacidad
  (URL pública que explique qué datos se guardan: cuentas y
  entrenamientos en Supabase, ubicación solo mientras grabas).
- **Revisión de Google**: al subir la primera versión, Google revisa
  la app (puede tardar días) y es estricta con el permiso de ubicación
  en segundo plano: hay que justificar en la ficha por qué PULSO lo
  necesita (grabar rutas corriendo con la pantalla apagada) y mostrar
  la función en un video si lo piden.
- **iOS / App Store**: no está hecho. Haría falta una Mac con Xcode
  y cuenta de Apple Developer ($99 USD/año). La base de Capacitor
  sirve para iOS después (`npx cap add ios`), pero no está configurada.

## Música local del teléfono (nativa, sin cargar archivos)

- En la app instalada de Android, Entrenar → reproductor → 📱 Música local
  tiene el botón **🎵 Mis canciones del teléfono**: pide el permiso de
  "Música y audio" una sola vez y lee la lista con MediaStore (título,
  artista, duración), sin elegir archivos uno por uno y sin copiar ni
  subir nada. La lista (solo metadatos) queda guardada en el teléfono.
- Implementación: plugin propio `DeviceMusic`
  (`android/app/src/main/java/com/pulso/app/DeviceMusicPlugin.java`,
  registrado en `MainActivity`), permiso `READ_MEDIA_AUDIO` (Android 13+)
  o `READ_EXTERNAL_STORAGE` (Android 12 o menos) en `AndroidManifest.xml`,
  puente en `src/lib/deviceMusic.ts`. En web no existe: ahí sigue el
  selector de archivos de siempre.
- **Límite honesto**: el audio lo reproduce el `<audio>` de la WebView
  con Media Session (controles en pantalla de bloqueo). Con la pantalla
  apagada mucho tiempo Android puede pausar la WebView; sonido garantizado
  con pantalla apagada necesitaría un reproductor nativo con foreground
  service (p. ej. @capgo/native-audio), que no está implementado.

## Límites honestos

- **Con el móvil apagado no se graba nada**: ni GPS, ni pasos, ni
  música. Ninguna app puede: el sensor está apagado.
- **La web (PWA) no cambia**: con la pantalla apagada el GPS se pausa.
  Solo la app instalada graba en segundo plano.
- **Los pasos de Health Connect son del día**, no en vivo durante la
  grabación: el conteo en vivo sigue siendo el sensor del teléfono
  (estimado). Health Connect no da pasos en tiempo real.
- **La música en segundo plano con pantalla apagada** sigue necesitando
  YouTube Premium en la web. En la app nativa, el reproductor local
  (canciones del teléfono) se controla desde la pantalla de bloqueo con
  Media Session, pero Android puede pausarlo si duerme la WebView con
  la pantalla apagada mucho tiempo: para sonido garantizado haría falta
  un reproductor nativo con foreground service, que no está implementado.
  YouTube en nativo tampoco suena con la pantalla apagada sin Premium.

## Tutorial y permisos al primer inicio (app nativa)

- **Mini tutorial** (`src/components/Tutorial.tsx`): 4 tarjetas, una
  frase corta por paso, menos de 30 segundos. Sale solo al primer
  inicio con sesión; se reabre desde Perfil → "Ver tutorial". El paso
  2 tiene el botón "Dar permisos ahora" que abre el flujo de permisos.
- **Flujo de permisos** (`src/components/PermissionsFlow.tsx` +
  `src/lib/permissions.ts`): pide en secuencia Ubicación, Actividad
  física, Notificaciones, Música y audio y Salud / Health Connect, con
  botón "Permitir todo". Sale solo la primera vez; se reabre desde
  Perfil → "Dar todos los permisos". En web no se muestra.
- **Límites de Android**: no se pueden pedir varios permisos en un
  solo diálogo (cada uno abre el suyo); la ubicación "Permitir todo el
  tiempo" solo se concede desde Ajustes (el flujo abre Ajustes) y no
  se puede comprobar desde el código, así que se muestra como
  "revisar en Ajustes". Actividad y Notificaciones se piden con el
  plugin propio `PulsoPermissionsPlugin` (sin dependencias nuevas);
  el permiso POST_NOTIFICATIONS se declaró en el Manifest.

## UI: barra de música, safe-area y tarjeta de racha

- Alturas fijas en `src/index.css` (nav 64 px, música 64 px, GPS 52 px)
  con `env(safe-area-inset-*)`: la mini-barra va siempre ENCIMA de la
  navegación, el contenido reserva ese espacio y el header ya no queda
  debajo de la barra de estado (Android 15 edge-to-edge).
- La tarjeta de racha salía vacía porque `Card` ponía siempre
  `bg-white` y el `bg-night` que le pasaba Inicio perdía: texto
  blanco sobre fondo blanco. `Card` ya no pone `bg-white` cuando se
  le pasa un fondo propio (también arregla la tarjeta coral de Retos).
- La mini-barra ya no trae el botón "Entrenar →" (la ▲ ya lleva a
  Entrenar) y el título es corto (deporte o nombre de la canción),
  así ya no se corta como "Músic…".

## Las 5 funciones nuevas (chat, push, mapa en vivo, premios, coach)

Todo en una sola operación, cableado en la app (`npm run build` en verde):

1. **Chat de sesiones** (`src/lib/sessionChat.ts`, `src/components/SessionChat.tsx`):
   botón 💬 Chat en cada sesión de la lista. Solo participantes
   confirmados y el anfitrión pueden escribir; los demás lo ven en
   solo lectura. Supabase Realtime + polling cada 5 s + cola offline
   (outbox). Migración: `supabase/migration_session_messages.sql`
   (incluye `alter publication supabase_realtime add table`).
2. **Notificaciones push** (`src/lib/pushNotifications.ts`,
   `@capacitor/push-notifications`): se registra el token FCM una
   vez por sesión tras el login (`App.tsx`). Migración:
   `supabase/migration_push_tokens.sql`. **Pendiente de Luis (sin
   esto no llega ninguna push):** seguir `docs-push-firebase.md`
   (crear proyecto Firebase, app Android `com.pulso.app`, bajar
   `google-services.json` a `android/app/`, `npx cap sync android`).
   Tampoco existe aún un servidor que envíe las push (habría que
   leer `push_tokens` y llamar a FCM al haber sesión/reto nuevo).
3. **Mapa en vivo** (`src/lib/liveTraining.ts`,
   `src/components/LiveTrainingLayer.tsx`,
   `src/components/LiveTrainingToggle.tsx`): en Sesiones → Mapa,
   capa "🔴 Entrenando ahora (N)". Presencia efímera por Supabase
   Realtime Presence, sin escribir en ninguna tabla. Opt-in
   explícito en Entrenar → Grabar con GPS ("📍 Que se me vea
   entrenando ahora", apagado por defecto); se publica solo
   mientras graba y se quita al terminar/pausar (o a los 60 s sin
   actualizar). **Privacidad (auditoría 2026-11-18):** la posición
   se publica redondeada a 3 decimales (~100 m), no exacta, porque
   los canales Realtime son abiertos para quien tenga la anon key
   (que va dentro del APK). Para ubicación precisa solo para
   usuarios autenticados, hay que activar **Realtime
   Authorization** en Supabase (Database → Replication → canal
   `live-training` → RLS) y comprobarlo en el panel; la app no
   puede verificarlo desde el código. Caveat: al entrar/salir un
   entrenador, `MapView` puede recentrar el mapa (su `fitBounds`
   depende de los marcadores).
4. **Retos con premios** (`src/lib/challengePrizes.ts`,
   `src/components/ChallengePrize.tsx`): un reto puede tener
   `prize_text` + `business_id` (migración
   `supabase/migration_challenge_prizes.sql`, update solo-admin).
   En Retos se ve "🎁 Premio al completarlo" o "🏆 Premio" con el
   negocio. Pendiente: no hay `createChallenge`/`updateChallenge`
   ni formulario en Admin, así que hoy el premio se asigna por SQL
   (`update challenges set prize_text='...', business_id='...'
   where id='...';`). Además la regla de "completado" hereda el
   defecto de `Challenges.tsx`: cuenta todos los entrenamientos,
   sin filtrar por la ventana del reto ni `target_km`.
5. **Modo coach** (`src/lib/coachMode.ts`,
   `src/components/CoachPanel.tsx`): en Perfil, "¿Eres coach?"
   (especialidad + experiencia). El coach ve estadísticas
   (sesiones, asistentes, próximas), sus alumnos (participantes
   confirmados de sus sesiones) y crea clases/sesiones. Sin pagos.
   Migración: `supabase/migration_coach_mode.sql`
   (`is_coach`, `coach_specialty`, `coach_experience`).

**Migraciones a correr en Supabase → SQL Editor (una vez cada una,
en cualquier orden):** `migration_session_messages.sql`,
`migration_push_tokens.sql`, `migration_challenge_prizes.sql`,
`migration_coach_mode.sql`. Sin correrlas, cada función cae a su
modo local o no muestra su dato nuevo, sin romper la app.

## Arreglos de seguridad y robustez (auditoría 2026-11-18)

Aplicados en el código; las migraciones SQL están listas en
`supabase/` pero **NO se ejecutaron en Supabase** (eso se hace
aparte, en el SQL Editor, en el orden de abajo):

1. `migration_admin_flags.sql`: los permisos viven en la tabla
   `admin_flags` (solo la toca un admin) y un trigger impide que
   un usuario normal cambie `is_admin`/`is_blocked` en profiles.
   La app lee el rol desde la vista `profiles_public`.
2. `migration_profiles_public.sql`: vista pública SIN correo; la
   app ya no hace `select('*')` sobre profiles.
3. `migration_chat_moderation.sql`: escribir en el chat exige ser
   participante confirmado o anfitrión (en el servidor), el nombre
   del autor lo fija un trigger desde el perfil, y el autor o un
   admin pueden borrar mensajes (botón Borrar en el chat).
4. `migration_challenges_businesses_admin.sql`: retos y negocios
   solo los crea/edita/borra un admin.
5. `migration_join_session_rpc.sql`: función `join_session` que
   reserva el lugar en una transacción (sin pasarse del cupo);
   la app la usa con fallback al conteo anterior si la migración
   no está corrida.
6. `migration_limits.sql`: CHECKs de tamaño (post ≤1000, título
   ≤80, lugar ≤100, cupo 2–50). La fecha no pasada solo se valida
   en la app.
7. Modo local: sesión por token aleatorio de 128 bits (ya no por
   id), hash viejo `local-…` ya no se acepta, y la recuperación
   sin correo exige haberla pedido en el mismo teléfono.
8. Outbox: tras 3 fallos que no son de red, la operación sale de
   la cola y aparece en Perfil → "No se pudieron subir", con su
   motivo y botón Descartar. Lo mismo para los mensajes del chat.
9. Mapa en vivo: posición redondeada a ~100 m (ver punto 3 de
   arriba); falta activar Realtime Authorization en Supabase.
10. Errores visibles: si la carga falla con internet y no es un
    error de red, sale un aviso con botón Reintentar; el botón
    Cancelar de una sesión pide confirmación y avisa si falla.
11. `android/app/google-services.json` ya está en `.gitignore`
    (antes solo se había borrado a mano del repo).
12. `android:allowBackup="false"` en el manifiesto: el respaldo
    de Android ya no sube los datos locales a Google Drive.

**OJO al correr las migraciones:** el `schema.sql` completo
nunca se corrió entero en la base real, así que las políticas
vivas pueden diferir del archivo. Corre primero
`migration_admin_flags.sql` y luego las demás, y verifica en
Authentication → Policies que no queden dos políticas
contradictorias sobre la misma tabla. Si `profiles_public` no
existe aún, la app cae al espejo local para perfiles (los
nombres pueden verse vacíos hasta correrla).

## Aviso de actualización del APK (desde el paquete de rediseño)

- Al abrir, la app descarga `public/version.json` remoto de GitHub
  (raw, rama main) y compara su `versionCode` con `APP_BUILD` de
  `src/lib/appUpdate.ts`. Si el remoto es mayor, sale el modal "Hay
  una actualización" con "Actualizar ahora" (abre el apkUrl) y
  "Después" (vuelve a salir al abrir). Sin internet o si falla la
  revisión, no sale nada y la app sigue igual.
- Proceso de cada release (¡no olvidar!):
  1. Subir `APP_BUILD` y `versionCode` en `public/version.json` al
     mismo número nuevo.
  2. Compilar y subir el APK nuevo al descargador directo.
  3. Actualizar `apkUrl` en `public/version.json` con el enlace
     nuevo (se lee en remoto, no hace falta recompilar).

## Build 22 (2026-11-19): distancia/ritmo GPS, música sin cortes, mapa que sigue, playlist en YouTube

Cinco fallas que Luis encontró probando el APK 21 en su A56, con su causa real:

1. **Distancia y ritmo en 0 al caminar (pasos sí subían).** Causa en `GpsTracker.tsx` (`handleFix`): la velocidad implícita se medía desde la ÚLTIMA lectura, no desde el ancla. Caminando, cada fix queda a ~5 m del ancla pero llega ~1 s después del anterior, así que la "velocidad" salía ≥5 m/s y superaba el tope de Caminata (2.5 m/s): TODOS los fixes se descartaban para siempre y el ancla nunca se movía. Arreglo: `anchorAtRef` — la velocidad se mide desde que se fijó el ancla (último punto aceptado); 10 m en 7 s son 1.4 m/s y se acepta; un salto de deriva de 10 m en 1 s sigue rechazándose. El filtro anti-deriva (umbral 8 m, pausa a los 30 s parado) se mantiene igual.
2. **Música cortada al cambiar de pestaña.** Causa en `App.tsx`: mientras se grababa GPS, la barrita de GPS REEMPLAZABA a la mini-barra de música al salir de Entrenar, así que `MusicPlayer` se desmontaba, el reproductor de YouTube se destruía y el `<audio>` se paraba. Arreglo: el reproductor vive siempre montado en el dock; la barrita de GPS se apila ENCIMA de la mini-barra (CSS `.pulso-main-gps` y `.pulso-fab-gps` ahora reservan nav + música + GPS).
3. **Música cortada al salir de la app / pantalla apagada.** Causa: el audio suena en la WebView y Android la duerme en segundo plano; el Wake Lock solo sirve con pantalla encendida. Arreglo: plugin propio `PulsoAudioPlugin` + `AudioForegroundService` (tipo `mediaPlayback`, notificación "PULSO · Sonando", permisos `FOREGROUND_SERVICE` y `FOREGROUND_SERVICE_MEDIA_PLAYBACK` en el Manifest, registrado en `MainActivity`). `MusicPlayer` lo arranca al sonar y lo para al pausar (`src/lib/audioService.ts`). El GPS en segundo plano ya lo cubría el plugin de background-geolocation con su propio servicio; con el arreglo 1 la distancia ya se acumula con la pantalla apagada. YouTube con pantalla apagada puede pausarse igual (límite del embed): la app lo dice honesto y recomienda Premium.
4. **Mapa que no se movía.** Causa principal: la misma que la 1 — sin puntos aceptados no había nada que seguir ni dibujar. Además el efecto de seguimiento salía antes de tiempo si el estilo aún no cargaba, y no había forma de soltar el seguimiento. Arreglo en `MapView.tsx`: el centrado en vivo ya no depende de que la fuente 'route' exista, y al arrastrar el mapa el seguimiento se suelta (sale el botón "📍 Seguirme" para volver a centrarte).
5. **"Abrir en YouTube" no abría su playlist.** Causa: el botón usaba `window.open(url, '_blank')`, pero la WebView de Capacitor no implementa `onCreateWindow` ni ventanas múltiples (verificado en el código de Capacitor en `node_modules`): ese `window.open` se ignora en silencio y no se abría nada. Arreglo: plugin oficial `@capacitor/browser` 8.0.5 (`src/lib/openExternal.ts`: `Browser.open({ url })` en nativo, `window.open` en web). También se endureció `parseYouTubeUrl` (ID de playlist pegado suelto, `list=` en el fragmento) y la hoja muestra el nombre de la playlist guardada junto al botón.

Archivos nuevos: `android/app/src/main/java/com/pulso/app/PulsoAudioPlugin.java`, `AudioForegroundService.java`, `src/lib/audioService.ts`, `src/lib/openExternal.ts`. El `cap sync` del workflow incluye `@capacitor/browser` solo (los plugins propios se compilan porque viven en `android/app/src/main/java` y están registrados en `MainActivity`).
