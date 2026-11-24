# Spec — Deporte claro y cambio en vivo en «Grabar con GPS»

Encargo del programador (sistema v2). Luis aprobó la maqueta el
2026-11-24 y pidió cambiar de deporte EN MEDIO del entrenamiento.
Agregado el mismo día: la celda de Ritmo se ve confusa («25:42» y
«min/km» ENORME en otra línea, parece otro número).

Base: rama feature/separate-routes-from-sessions, HEAD 1c684bc2
(local 1db1cba + cambios P0 en el árbol). Solo GpsTracker.tsx + esta
spec. Sin commit ni push.

## Contexto (verificado en código, no supuesto)

- Selector actual: GpsTracker.tsx:673, tres botones
  `['Caminata', 'Correr', 'Ciclismo']`, default 'Caminata' (:62,
  `saved?.sport || 'Caminata'`; el deporte elegido persiste en
  localStorage vía el efecto de guardado, que ya incluye `sport`).
- Filtro de velocidad: :433-434, `maxSpeedMs = Ciclismo ? 15 :
  Correr ? 6 : 2.5` m/s → Caminata 9 km/h, Correr 21.6 km/h,
  Ciclismo 54 km/h. El descarte por velocidad es SILENCIOSO
  (`return` sin aviso). Diagnóstico de fondo:
  docs/diagnostico-gps-no-marca-2026-11-24.md — en moto con
  Caminata, TODOS los fixes se descartan y la distancia se queda en
  0.00 km sin que nada lo explique.
- `paceMinKm` (src/lib/utils.ts:42) devuelve UN solo string,
  `"25:42 min/km"`. La celda de Ritmo lo renderiza todo en
  `text-xl font-black` (:754), así que «min/km» se parte a otra
  línea con el mismo tamaño que el número. Captura de Luis 24 nov
  06:20: a pie ya marca bien (0.35 km, 503 pasos en 09:03) — esto
  es solo presentación, el GPS funciona.
- Aviso de pausa automática ya existe: banner ámbar :772. El aviso
  nuevo debe ser OTRO banner, distinto.
- Pasos: con Ciclismo NO se cuentan (:222, :267, :554, :581).
  Comportamiento existente, NO se cambia (ver Riesgos).

## Hallazgo que cambia la implementación (cierre del watcher)

La suposición del encargo —«maxSpeedMs ya se lee del estado sport,
así que cambiar el deporte cambia el tope en el siguiente fix»— es
FALSA para el watcher en marcha: `startWatch` registra el callback
del watcher (nativo o web) UNA vez al iniciar, y ese callback cierra
sobre el `handleFix` del render de ese momento, que a su vez cierra
sobre el `sport` de ese momento. Un `setSport` posterior re-renderiza
la UI pero el watcher seguiría usando el tope viejo.

Solución (sin reiniciar el watch): espejo del deporte en un ref
(`sportRef`, sincronizado con `useEffect` sobre `sport`) y que
`handleFix` lea `sportRef.current` para el tope. Los demás valores
que lee `handleFix` ya son refs (`lastPoint`, `anchorAtRef`,
`jumpDiscardsRef`, `autoPausedRef`) o setters estables, así que el
`handleFix` viejo sigue siendo válido con el deporte nuevo.

## Qué cambia (todo en src/components/GpsTracker.tsx)

1. **Tarjeta de inicio (antes de grabar):** cada botón de deporte
   lleva su límite visible en dos líneas — nombre + «hasta 9 km/h»
   / «hasta 20 km/h» / «hasta 50 km/h» (valores redondeados de la
   maqueta aprobada; el código usa 9 / 21.6 / 54). Debajo de los
   botones, una línea corta: «Si vas más rápido que tu deporte, la
   distancia no se suma.» Mismo estilo (pastillas, teal cuando está
   elegido, sage-100 cuando no).

2. **Cambio en plena grabación:** mientras graba (también en pausa,
   mismo bloque) aparece un selector compacto de los 3 deportes
   («Deporte:» + 3 pastillas chicas). Al tocar uno, `changeSport`
   hace `setSport` + limpia la racha de descartes y el aviso. NO se
   reinicia el watch, el cronómetro, la distancia, la ruta ni el
   ancla; el tope nuevo aplica en el siguiente fix vía `sportRef`.
   La etiqueta Ritmo/Velocidad y el toggle de entrenamiento en vivo
   ya leen el estado `sport`, así que se actualizan solos.

3. **Aviso en vivo por velocidad:** en `handleFix`, la rama de
   descarte por velocidad incrementa `speedDiscardsRef` (racha de
   descartes seguidos por velocidad); a partir de 3 seguidos se
   enciende `speedWarning`. Banner ámbar DISTINTO al de pausa
   (`bg-amber-100` + borde izquierdo `border-amber-500`, sin emoji,
   `font-semibold`):
   - Caminata: «Vas demasiado rápido para Caminata — cambia a Correr
     o Ciclismo.»
   - Correr: «Vas demasiado rápido para Correr — cambia a Ciclismo.»
   - Ciclismo: «Vas a más de 50 km/h — baja la velocidad para que la
     distancia se sume.»
   El banner se quita al aceptar un fix o al cambiar de deporte.
   La racha se resetea también con un descarte por salto (>200 m,
   otro motivo) y al iniciar/reanudar el watch.

4. **Celda de Ritmo (y sus vecinas):** el valor y la unidad se
   separan — número en `text-xl font-black` + unidad en
   `text-xs font-bold text-slate-500` en la misma línea
   (`whitespace-nowrap`), etiqueta debajo:
   - Ritmo: «25:42» grande + «min/km» chico, etiqueta «Ritmo».
   - Ciclismo: «X» grande + «km/h» chico, etiqueta «Velocidad».
   - Distancia: «0.35» grande + «km» chico (antes «0.35 km» todo
     grande).
   - Tiempo: «09:03» sin unidad, no cambia.
   El valor de ritmo se saca de `paceMinKm` quitándole el sufijo
   « min/km» (el util NO se toca: se usa en texto corrido en
   ImportWatch, Train y el resumen de GpsTracker, donde la unidad
   dentro de la frase se lee bien).

## Qué NO se toca

- El filtro de velocidad en sí (sigue descartando igual), el B1
  (re-anclaje `n === 2 || n === 3`), el cronómetro por reloj, la
  pausa automática, el conteo de pasos, `LiveTrainingToggle`, el
  guardado en localStorage.
- `paceMinKm` en utils (sigue devolviendo el string completo).
- Nada fuera de GpsTracker.tsx + esta spec.

## Aceptación

- `npm run build` exit 0.
- Los 3 botones muestran su límite antes de grabar + la línea
  «Si vas más rápido que tu deporte…».
- El selector compacto aparece grabando (y en pausa); cambiar de
  deporte no reinicia tiempo/distancia/ruta/ancla (el tope nuevo
  aplica en el siguiente fix).
- El banner aparece tras 3 descartes seguidos por velocidad y
  desaparece al aceptar un fix o cambiar de deporte.
- En 411 px de ancho, el ritmo se lee «25:42 min/km» sin que la
  unidad parezca otro valor; lo mismo para «X km/h» y «0.35 km».
- Diff solo en GpsTracker.tsx + esta spec.

## Riesgos / notas

- **Ciclismo y pasos (borde preexistente, fuera de alcance):** el
  efecto de DeviceMotion se re-registra al cambiar `sport`, así
  que en web la estimación de pasos se detiene sola al pasar a
  Ciclismo. PERO en la app nativa la sesión del contador del
  sistema se inicia en `start()`/`resume()` y su intervalo de 2 s
  no revisa el deporte: si Luis cambia a Ciclismo en plena
  grabación, el contador nativo seguiría sumando pasos (la tarjeta
  de pasos se oculta para Ciclismo, así que no los ve, pero el
  valor se guarda al terminar). No se cambia en este encargo; si
  Luis lo reporta, es un fix aparte (revisar `sportRef` en el
  intervalo de `initStepSession`).
- **Mismo patrón en ImportWorkout.tsx:126:** su celda de Ritmo
  también renderiza `paceMinKm` completo en `text-lg font-black`.
  Fuera de este encargo (otra pantalla); anotado para no olvidar.
- **Topes redondeados en la UI (9/20/50) vs reales (9/21.6/54):**
  la UI redondea para que se lea fácil; el filtro real no cambia.
  A 51-54 km/h en Ciclismo la distancia sí se suma aunque el botón
  diga «hasta 50 km/h» — diferencia despreciable para el aviso.
- **El banner solo aparece grabando:** en pausa el watch está
  parado, así que no hay descartes; al reanudar, si sigue rápido,
  reaparece tras 3 descartes.
