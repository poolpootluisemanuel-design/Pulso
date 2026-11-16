# PULSO — tu propia app, con control total

PULSO es la app para entrenar acompañado en Cancún y la Riviera Maya:
encontrar compañero por deporte y nivel, crear sesiones con cupo y
confirmación, registrar entrenamientos con GPS, retos, medallas,
comunidad y negocios locales.

Esto es **tu** app: el código está en esta carpeta, la base de datos es
tuya en Supabase, el hosting es tuyo en Vercel y el dominio será tuyo.
No vive dentro de Muse: es tu app instalada, independiente.

> **Fase 0 / MVP.** Esta es la base instalable. Ya funciona completa en
> el teléfono como web app. Play Store es la fase 5 del plan.

---

## 1. ¿Qué incluye?

| Función | Qué hace |
|---|---|
| Cuentas | Registro con correo y contraseña, entrar, salir, recuperar contraseña, cambiar contraseña |
| Perfil | Nombre, zona, bio, deportes con nivel, disponibilidad por día, modo principiante |
| Buscar compañero | Filtros por deporte, nivel, zona y día |
| Sesiones | Crear sesión (la fecha muestra su día de la semana para no cruzarla), cupo, apuntarse, lista de espera automática, cancelar (promueve al primero en espera) |
| Entrenar | Registro manual y **Grabar con GPS**: tiempo, distancia, ritmo, ruta dibujada, pausa y reanudar, guardar. Historial con ruta y totales |
| Música | **Música para entrenar con YouTube**: playlists por tipo de entrenamiento, reproductor embebido, play/pausa, o pega tu propia playlist de YouTube |
| Entrenador IA | **Plan semanal por deporte**: elige deporte, nivel, meta, días y minutos; te arma tareas por día con metas y progresión según tu historial; marca tareas y regístralas como entrenamiento |
| Retos y logros | Racha de días, medallas calculadas de tus entrenamientos, retos de 7 y 30 días |
| Comunidad | Publicar en el muro local |
| Negocios | Directorio básico de coaches, gyms y canchas (listo para crecer en la fase 4) |
| Instalable (PWA) | Ícono en pantalla, abre a pantalla completa, sin navegador |

Diseño PULSO: fondo blanco / azul noche claro, azul noche oscuro en
encabezado, rojo pulso como color principal en botones y rachas, y
teal solo como acento. Eslogan: «Entrena con pulso».

---

## 2. Instalarla en el teléfono (para Luis y para probar)

Primero hay que publicarla (paso 3). Una vez publicada en tu dominio:

**Android (Chrome)**
1. Abre tu link (por ejemplo `https://pulso.mx`).
2. Toca los 3 puntos ⋮ → **Instalar app** (o “Agregar a pantalla de inicio”).
3. Acepta. Queda el ícono de PULSO en tu pantalla. Ábrela desde ahí.

**iPhone (Safari)**
1. Abre tu link en Safari.
2. Toca **Compartir** (el cuadrito con flecha) → **Agregar a pantalla de inicio**.
3. Toca **Agregar**. Queda el ícono de PULSO en tu pantalla.

> Para que el GPS funcione, el teléfono debe dar permiso de ubicación
> a la app la primera vez que grabes. Sin permiso, la app lo dice y
> puedes seguir con el registro manual.

> **Música:** las playlists de PULSO usan el buscador de YouTube, sin
> API key y sin cuenta de Spotify. Si pegas tu propia playlist, queda
> guardada solo en ese teléfono. Nota honesta: en la web del teléfono,
> si bloqueas la pantalla o cambias de app, YouTube puede pausar la
> música. Para reproducción en segundo plano completa haría falta
> Spotify Premium, que es un paso aparte.

> **Entrenador IA:** el plan se genera con reglas por deporte, nivel y
> meta, ajustado con tus entrenamientos de la última semana. Es un plan
> general, no médico: si tienes una lesión o condición de salud,
> consúltalo con un profesional.

---

## 3. Desplegarla paso a paso (Vercel + Supabase)

Haz esto una sola vez, con calma. Nada se cobra sin que tú lo apruebes.
Las contraseñas las creas tú en las páginas oficiales, nunca por chat.

### Paso A. Supabase (base de datos y cuentas) — gratis para empezar
1. Entra a [supabase.com](https://supabase.com) y crea una cuenta con tu correo.
2. Crea un proyecto nuevo (nombre: `pulso`, región: la más cercana, por ejemplo US East).
3. Espera a que se cree. Ve a **SQL Editor** → **New query**.
4. Abre el archivo `supabase/schema.sql` de este proyecto, copia todo,
   pégalo en el editor y pulsa **Run**. Así se crean las tablas y la seguridad.
5. Ve a **Settings → API** y copia dos valores: **Project URL** y
   **anon public key**. Guárdalos en tu gestor de contraseñas.
6. En **Authentication → Sign In / Email**, deja activado el login por correo.
   Si pide confirmar el correo al registrarse, así queda: cada persona
   confirma su cuenta desde su correo.

### Paso B. Código en GitHub (opcional pero recomendado)
1. Crea una cuenta en [github.com](https://github.com) si no tienes.
2. Crea un repositorio nuevo llamado `pulso` (privado está bien).
3. Sube esta carpeta completa al repositorio (menos `node_modules` y `.env`,
   que ya están ignorados en `.gitignore`).

### Paso C. Vercel (hosting) — gratis para empezar
1. Entra a [vercel.com](https://vercel.com) y crea una cuenta.
2. **Add New → Project** → importa tu repositorio `pulso` (o sube la carpeta).
3. En **Environment Variables** agrega:
   - `VITE_SUPABASE_URL` = tu Project URL de Supabase
   - `VITE_SUPABASE_ANON_KEY` = tu anon public key de Supabase
4. Pulsa **Deploy**. Te dará un link como `pulso.vercel.app`.
5. Prueba: abre el link, crea tu cuenta, completa tu perfil, crea una
   sesión de prueba y graba una caminata corta con GPS.

### Paso D. Tu dominio (cuando Luis elija el nombre)
1. Compra el dominio a tu nombre (por ejemplo `pulso.mx`, aprox.
   $10–$20 USD al año).
2. En Vercel: **Settings → Domains** → agrega tu dominio y sigue las
   instrucciones para apuntar el DNS.
3. A partir de ahí, tu link para compartir es tu dominio, no el de Vercel.

---

## 4. Probarla en tu computadora (sin publicar)

```bash
cd activa-propia
npm install
npm run dev        # abre http://localhost:5173
npm run build      # verifica que todo compile (crea la carpeta dist/)
npm run preview    # prueba la versión ya compilada
```

**Sin Supabase todavía:** la app arranca en **modo local de
demostración**. Las cuentas y datos se guardan solo en ese teléfono o
navegador (localStorage), con 2 perfiles y 2 sesiones de ejemplo para
probar Buscar y Sesiones. Verás el aviso “Modo local (demo)”.
Al poner las variables de Supabase en `.env`, la app usa cuentas
reales y datos compartidos: el modo local ya no se usa.

Para el modo local, copia `.env.example` a `.env` solo cuando tengas
tus claves reales. Nunca escribas claves inventadas: si no hay claves,
la app lo dice y trabaja en local.

---

## 5. Qué falta todavía

- [ ] **Dominio de Luis:** elegir el nombre (por ejemplo `pulso.mx`).
- [ ] **Proyecto Supabase de Luis:** crearlo con su cuenta y sus credenciales (paso A).
- [ ] **Deploy en Vercel:** publicar con sus variables (paso C).
- [ ] **Probar en su teléfono:** crear su cuenta real, instalarla desde
      su dominio y probar una sesión y una caminata con GPS.
- [ ] **Primeros 15:** invitar a tu grupo con el link de su dominio.
- [ ] **Fase 4 — Negocios:** panel para que coaches/gyms/canchas publiquen
      sus clases y reservas.
- [ ] **Fase 5 — Play Store:** cuenta de desarrollador de Google
      ($25 USD, pago único) y convertir esta misma base con Capacitor.
      App Store después, solo si se decide ($99 USD/año).

## 6. Estructura del código

```
activa-propia/
├── index.html                  Título, manifest, meta de PWA
├── public/
│   ├── manifest.webmanifest    Nombre, colores, íconos de la app instalada
│   ├── sw.js                   Service worker (caché básico, solo archivos propios)
│   └── icons/                  Íconos 192, 512, maskable y Apple
├── supabase/schema.sql         Tablas + seguridad (RLS) — pégalo en Supabase
├── src/
│   ├── main.tsx                Arranque + registro del service worker
│   ├── App.tsx                 Pestañas, encabezado, aviso de instalación
│   ├── index.css               Tailwind + colores PULSO
│   ├── lib/
│   │   ├── types.ts            Tipos: perfil, sesión, entrenamiento, reto, plan…
│   │   ├── supabase.ts         Cliente Supabase (solo variables de entorno)
│   │   ├── store.ts            Datos: Supabase si hay claves, local si no
│   │   ├── coach.ts            Entrenador IA: reglas de planes por deporte/nivel/meta
│   │   └── utils.ts            Fechas, distancia GPS, rachas, medallas
│   └── components/
│       ├── Auth.tsx            Entrar, crear cuenta, recuperar contraseña
│       ├── Home.tsx            Inicio: racha, semana, próxima sesión
│       ├── Search.tsx          Buscar compañero por filtros
│       ├── SessionsTab.tsx     Crear sesión, cupo, lista de espera
│       ├── Train.tsx           Entrenamiento manual + historial con ruta
│       ├── GpsTracker.tsx      Grabar con GPS: tiempo, distancia, ritmo, ruta en mapa real
│       ├── MapView.tsx         Mapa real (Leaflet + OpenStreetMap): ruta y sesiones
│       ├── MusicPlayer.tsx     Música YouTube por tipo de entrenamiento + tu playlist
│       ├── CoachPlan.tsx       Entrenador IA: formulario, plan semanal, tareas
│       ├── Challenges.tsx      Retos y medallas
│       ├── Community.tsx       Muro local y negocios
│       ├── ProfileTab.tsx      Editar perfil y cambiar contraseña
│       └── ui.tsx              Botones, tarjetas y etiquetas comunes
├── .env.example                Plantilla de variables (sin valores reales)
├── vercel.json                 Configuración de deploy en Vercel
└── README.md                   Este documento
```

## 7. Notas honestas

- El GPS depende del teléfono y del permiso de ubicación. En el
  navegador de la computadora no se puede probar una ruta real.
- Las contraseñas en modo Supabase las guarda Supabase (con hash).
  En modo local se guardan con hash SHA-256 en el propio teléfono y
  solo sirven para probar: no es un sistema de cuentas real.
- Los datos de la app de Muse no se migran solos: al lanzar la app
  propia, cada persona crea su cuenta nueva (su perfil se vuelve a
  completar en un minuto).
- Costos estimados (pueden cambiar, se confirman antes de pagar):
  dominio aprox. $10–$20 USD/año; Supabase y Vercel $0 al empezar;
  Play Store $25 USD una sola vez, solo en la fase 5.
