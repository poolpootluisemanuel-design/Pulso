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

## Generar el APK de prueba (sin publicar nada)

No se puede generar el APK en este servidor: hace falta Android Studio
con el SDK de Android (y Java 17+). Pasos en una computadora con
Android Studio instalado:

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

## Límites honestos

- **Con el móvil apagado no se graba nada**: ni GPS, ni pasos, ni
  música. Ninguna app puede: el sensor está apagado.
- **La web (PWA) no cambia**: con la pantalla apagada el GPS se pausa.
  Solo la app instalada graba en segundo plano.
- **Los pasos de Health Connect son del día**, no en vivo durante la
  grabación: el conteo en vivo sigue siendo el sensor del teléfono
  (estimado). Health Connect no da pasos en tiempo real.
- **La música en segundo plano con pantalla apagada** sigue necesitando
  YouTube Premium en la web; en la app nativa, el reproductor local
  (canciones del teléfono) suena con la pantalla apagada, YouTube no.
