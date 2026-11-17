# PULSO nativa (Android) — base con Capacitor

La misma web de PULSO, empaquetada como app Android con **Capacitor 8**.
La web sigue igual: se despliega en Vercel como siempre; Capacitor solo
lee la carpeta `dist` que genera `npm run build`.

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
  Samsung Health y Google Fit juntan sus datos). El conteo de pasos en
  vivo mientras grabas sigue usando el sensor del teléfono.
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
   funcionando; solo no muestra los pasos de hoy.
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
   actualizar). Caveat: al entrar/salir un entrenador, `MapView`
   puede recentrar el mapa (su `fitBounds` depende de los
   marcadores).
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
