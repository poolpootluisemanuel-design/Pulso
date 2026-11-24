# Diagnóstico — GPS graba pero no marca (build 42, 24 nov 2026)

Solo diagnóstico (arquitecto, sistema v2). No se cambió ningún archivo.
Base: clon local, rama feature/separate-routes-from-sessions, HEAD 1c684bc2.
Leído: GpsTracker.tsx (completo), nativeGps.ts, stepCounter.ts,
permissions.ts, StepCounterPlugin.java, manifest. Historia git de
GpsTracker.tsx: últimos cambios 4492fbd (cronómetro por reloj),
f902d22c (B1).

## Hechos de campo

- Captura 1 (~06:03 EST): Entrenar → Grabar con GPS: 02:01, 0.00 km,
  ritmo —, «0 pasos · Pasos del sistema». Sin línea de ruta. Mini-barra
  «Música para… / En pausa · YouTube / 0:00 0:00». Luis: «Ya no marca
  nada». «El tiempo sigue corriendo».
- Captura 2 (~06:14 EST, A PIE): 03:28, 0.10 km, 33:46 min/km,
  119 pasos, línea de ruta rosa visible y punto azul. **El GPS SÍ
  funciona a pie.** Esto descarta: watcher roto, permiso de ubicación,
  filtro roto en general, contador de pasos roto.
- Cronómetro sin bug: entre capturas pasaron ~11 min reales y el
  cronómetro solo avanzó 1:27 (02:01 → 03:28) — la grabación estuvo en
  pausa la mayor parte y el cronómetro por reloj no suma la pausa.
- Ritmo 33:46 min/km no es bug: 0.10 km en 3:28 totales (incluyen los
  2:01 parado) = 34.8 min/km.
- «0 pasos» de la captura 1 descartado como síntoma: en moto no se
  camina. Los 119 pasos de la captura 2 confirman que el contador del
  sistema (TYPE_STEP_COUNTER, base en el primer evento) funciona.
- Música en pausa 0:00 por extractor bloqueado (intermitente del VPS).
  No es parte de este diagnóstico.

## Causas ordenadas

### 1. En moto + filtro de velocidad por deporte (LA MÁS PROBABLE, si iba en moto en esos 2:01)

La app no tiene modo moto. Filtro de velocidad implícita
(GpsTracker.tsx:433-434):

```js
const maxSpeedMs = sport === 'Ciclismo' ? 15 : sport === 'Correr' ? 6 : 2.5
if (speedMs > maxSpeedMs) return
```

Topes: Caminata 2.5 m/s = 9 km/h; Correr 6 m/s = 21.6 km/h; Ciclismo
15 m/s = 54 km/h. La velocidad se mide desde el ancla
(speedMs = (d * 1000) / dtSec, :431-432) y el ancla solo se mueve al
aceptar un punto — en moto la velocidad media desde el ancla es siempre
la velocidad de la moto, y TODOS los fixes se descartan en silencio,
sin ningún aviso en pantalla. A 30 km/h (8.3 m/s) se descarta con
Caminata y con Correr; a 60 km/h (16.7 m/s) se descarta incluso con
Ciclismo. Solo funciona si deporte = Ciclismo Y velocidad < 54 km/h.
El watcher entrega fixes con frecuencia (distanceFilter: 5 m,
nativeGps.ts:43: a 40 km/h un fix cada ~0.5 s), así que los saltos
entre fixes son de ~5–20 m — el filtro de 200 m NO es el mecanismo
aquí; es el filtro de velocidad.

El B1 NO rescata a un usuario rápido. Cuando d > 0.2 km (:402), el
re-anclaje exige (:417):

```js
if (gapSec >= 60 && (n === 2 || n === 3) && accuracy <= 25)
```

A 11 m/s, d supera 200 m a los ~18 s: descarte nº1 (~18 s), nº2
(~19 s, gapSec 19 < 60 → no), nº3 (~20 s, gapSec 20 < 60 → no), y a
partir de nº4 la condición `n === 2 || n === 3` no se cumple nunca
más. El contador sigue subiendo sin resetearse (solo se resetea al
aceptar, re-anclar o reiniciar el watch). La grabación queda congelada
en 0.00 km hasta Pausar/Reanudar manual — y al reanudar se repite lo
mismo en segundos. El B1 fue diseñado para un caminante con hueco de
señal, no para un usuario en movimiento continuo rápido. Agujero real
del B1, independiente del deporte.

La pausa automática es un segundo candado: a los 30 s con < 10 m
aceptados (:439, stillWindowDistKm < 0.010) entra autoPaused; para
salir exige d >= 0.015 Y accuracy <= 15 (:448). En moto nunca se
cumple porque el filtro de velocidad descarta antes de llegar ahí.

Evidencia a favor: distancia 0.00 exacta, sin línea de ruta, punto
azul sin moverse, sin mensaje de error (los descartes por velocidad
son silenciosos por diseño), cronómetro corriendo (independiente de
los fixes). Antecedente: el 20 nov Luis confirmó +0.01 km caminando —
a pie el filtro deja pasar; en moto no.

### 2. Estaba parado sin moverse en esos 2:01

Si estaba quieto, 0.00 km y 0 pasos son correctos y no hay bug.
Discriminador: qué hacía en esos 2 minutos.

### 3. Sin fix útil al inicio / señal débil en interiores

El primer fix se acepta solo con accuracy <= 25 (GpsTracker.tsx:522;
el watcher descarta accuracy > 25 en :488 y :499). Si empezó dentro
de casa, el primer fix pudo ser uno en caché y los siguientes, todos
con precisión 30–100 m, se descartan en silencio. Al salir a la
calle, los fixes pasan y empieza a marcar — lo que muestra la
captura 2. Discriminador: ¿empezó dentro de casa?

### 4. Trampa de pausa automática con precisión 16–25 m

Si en los primeros 30 s no se aceptaron 10 m, entra la pausa
automática; para salir exige precisión ≤ 15 m. Con señal mediocre
(16–25 m), la pausa no se quita nunca aunque camine. Discriminador:
¿se veía el banner ámbar «Parece que estás parado»?

### 5. Watcher sin fixes / permiso (POCO PROBABLE)

El primer fix funcionó (la grabación arrancó), no hay banner de
error, y a pie funciona. El manifest declara ACCESS_FINE_LOCATION,
ACCESS_BACKGROUND_LOCATION y FOREGROUND_SERVICE_LOCATION. El permiso
«todo el tiempo» solo afecta a pantalla apagada; en primer plano
basta «solo con la app en uso».

## Verificación de cambios recientes

- P0 (1db1cba → 1c684bc2) NO tocó el GPS: solo index.css,
  MusicPlayer.tsx, App.tsx, icons.tsx, todaySteps.ts,
  healthConnect.ts.
- B1 (f902d22c) y cronómetro por reloj (4492fbd): el cronómetro
  funciona bien. El B1 tiene el agujero de la ventana
  `n === 2 || n === 3`, pero no es la causa primaria en moto (el
  filtro de velocidad descarta antes).

## Propuesta (sin implementar — necesita autorización de Luis)

1. Modo moto (decisión de producto): añadir deporte «Moto» (o
   «Vehículo») con tope ~30–40 m/s, o subir los topes. Sin esto,
   PULSO no puede registrar trayectos en moto por diseño.
2. Arreglar la ventana del B1: cambiar `n === 2 || n === 3` por
   `n >= 2` (con gapSec >= 60 y accuracy <= 25).
3. Aviso visible cuando se descartan fixes por velocidad: «Vas
   demasiado rápido para Caminata — cambia a Ciclismo o Moto».
   Hoy el descarte es totalmente silencioso.

## Riesgos

- R1: la causa 1 depende de un dato sin confirmar (¿iba en moto en
  los 2:01? ¿qué deporte?). Si estaba parado o dentro de casa, la
  app se comportó correctamente.
- R2: aunque se arregle el tope de velocidad, el B1 seguiría sin
  rescatar a un usuario rápido por la ventana `n === 2 || n === 3`.
- R3: añadir «Moto» cambia el producto: ritmo/pace y retos están
  pensados para deporte humano; grabar en moto como «Caminata»
  contaminaría sus estadísticas y las de la comunidad si se publica.
- R4: mientras los rechazos no se muestren, cualquier fallo futuro
  de GPS se verá igual («no marca nada»).

## Plan de pruebas para Luis, en moto (< 5 min)

1. Confirma los dos datos: ¿ibas en moto durante esos primeros 2:01?
   ¿Qué deporte tenías elegido — Caminata, Correr o Ciclismo?
2. Prueba lenta: con Caminata, ve a menos de 9 km/h unos 30 segundos
   en calle abierta y mira la distancia. Si empieza a contar, el
   filtro de velocidad es la causa. (Con Correr, el límite es
   ~20 km/h.)
3. Prueba con Ciclismo: cambia el deporte a Ciclismo y ve a velocidad
   normal de pueblo (menos de 50 km/h). Si marca, confirmado; si
   pasas de ~54 km/h se congela otra vez.
4. Mira el mapa mientras vas: ¿se mueve el punto azul? Si no se
   mueve, ningún fix se está aceptando. Y dime si sale el aviso
   ámbar «Parece que estás parado».
