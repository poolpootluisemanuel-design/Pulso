# Push nativas de PULSO — activar el push real con Firebase

> ⚠️ **Sin este paso, el registro de token NO funciona y la app sigue
> igual.** La base ya está instalada en el código
> (`src/lib/pushNotifications.ts` + `@capacitor/push-notifications`),
> pero sin Firebase el registro devuelve un error legible y no pasa
> nada: no se rompe nada, no hay notificaciones, todo lo demás funciona
> igual. Esto lo tiene que hacer Luis en su cuenta de Google/Firebase;
> no se puede hacer solo con código y no se inventaron claves.

## Lo que ya está hecho (no hay que tocarlo)

- `@capacitor/push-notifications` ^8.1.3 instalado (compatible con
  Capacitor 8).
- `src/lib/pushNotifications.ts`: registro del token FCM, guardado
  local + Supabase, y avisos cuando llega una push con la app abierta.
- `supabase/migration_push_tokens.sql`: tabla `push_tokens` (hay que
  correrla en Supabase → SQL Editor).
- `android/app/src/main/AndroidManifest.xml` ya declara
  `POST_NOTIFICATIONS` (el permiso que pide el flujo de permisos).
  No hace falta añadir nada más al Manifest ni a `MainActivity.java`.

## Pasos exactos en Firebase Console

1. Entra a [Firebase Console](https://console.firebase.google.com/)
   con la cuenta de Google de PULSO (la misma que usaste para Vercel
   si es la misma).
2. **Crear proyecto** → nombre: `PULSO` → desactiva Google Analytics
   (no hace falta para push) → Crear proyecto.
3. En la página del proyecto, haz clic en el icono **Android**
   (🤖 "Añadir app" → Android).
4. **Nombre del paquete de Android:** escribe exactamente
   `com.pulso.app` (es el `appId` de `capacitor.config.ts`; si pones
   otro, el token no llegará).
   - Apodo de la app: `PULSO` (opcional).
   - **No** hace falta el certificado de firma SHA-1 para push.
   - Clic en **Registrar app**.
5. **Descargar `google-services.json`** → guárdalo en el proyecto en
   `android/app/google-services.json` (junto a `build.gradle`, NO en
   `android/` raíz ni en `src/`).
   - ⚠️ Este archivo es de PULSO: no lo compartas en público ni lo
     subas a un repo público. En este repo privado va bien.
6. En Firebase Console → **Compilación → Cloud Messaging**: ahí verás
   la API de Cloud Messaging. En proyectos nuevos ya viene activada
   (FCM v1); si pide activarla, actívala.
7. **Después, en el código** (esto lo hace Muse, no Luis):
   - `npx cap sync android` (copia el plugin y el
     `google-services.json` al proyecto Android).
   - Nueva build del APK en GitHub Actions (como las anteriores):
     hay que desinstalar el APK viejo e instalar el nuevo.
   - Correr `supabase/migration_push_tokens.sql` en Supabase.

## Qué pasa después (cómo se usa)

- Al entrar a su cuenta, la app registra el teléfono en Firebase y
  guarda el token en `push_tokens` (tabla de Supabase).
- Por ahora **nadie envía notificaciones**: falta el servidor que
  las mande (ese es el siguiente paso, aparte: una función que lea
  `push_tokens` y llame a FCM cuando haya una sesión o un reto).
- Con la app abierta, una push que llegue se muestra como aviso
  dentro de la app; con la app cerrada, Android muestra la
  notificación del sistema.

## Probarlo

1. Con `google-services.json` en `android/app/` y la migración
   corrida, instala el APK nuevo y entra con tu cuenta.
2. En Supabase → Table Editor → `push_tokens`: debe aparecer una fila
   con tu `profile_id` y un token largo (empieza por algo como
   `dX...` o `c...`).
3. Prueba de envío: en Firebase Console → Cloud Messaging → "Enviar
   tu primera notificación" → pon título y texto → en destino elige
   **"Enviar mensaje de prueba"** y pega ese token → Enviar.
   - Con la app cerrada debe llegar la notificación del sistema.
   - Con la app abierta debe salir el aviso dentro de la app.
4. Si no aparece fila en `push_tokens`, revisa: `google-services.json`
   en `android/app/` (no en otro lado), paquete `com.pulso.app`
   exacto, permiso de Notificaciones concedido, y `npx cap sync
   android` corrido antes de la build.
