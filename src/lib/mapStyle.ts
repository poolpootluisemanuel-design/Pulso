// Configuración centralizada del mapa deportivo de PULSO (MapLibre GL).
// - Fondo principal: OpenFreeMap Liberty (tiles vectoriales de
//   OpenStreetMap, gratis, sin llave, uso comercial permitido, sin SLA).
//   Verificado en el teléfono de Luis (Galaxy A56) a zoom 16, 18 y 19:
//   calles, nombres en español, parques, costa y edificios se ven bien
//   y no hay zonas en blanco (los datos vectoriales llegan hasta zoom
//   14 y de ahí se sigue dibujando por sobrezoom, sin huecos).
// - OJO: la URL corta de tiles (planet/{z}/{x}/{y}.pbf) devuelve 200
//   con 0 bytes; la plantilla vigente viene en el TileJSON de
//   https://tiles.openfreemap.org/planet (carpeta con fecha). MapLibre
//   la resuelve solo desde el style JSON, por eso aquí solo se guarda
//   la URL del estilo, no la de los tiles.
// - Respaldo: Esri satélite (el oscuro queda como tercera opción).
// - La primera carga de los tiles vectoriales tarda unos segundos en el
//   teléfono: eso NO es un error y NO dispara el respaldo.
import type { Map as MapLibreMap, StyleSpecification } from 'maplibre-gl'
import { setWorkerUrl } from 'maplibre-gl'
// El worker de MapLibre 6 es el que procesa los tiles vectoriales.
// Vite NO lo emite solo (la URL se arma en tiempo de ejecución dentro
// de MapLibre como './maplibre-gl-worker.mjs' junto al bundle), así que
// sin esto el mapa vectorial quedaba en blanco y solo los raster
// (oscuro / satélite, que no usan worker) se veían. Con ?url Vite emite
// el archivo con hash y setWorkerUrl apunta ahí antes de crear el mapa.
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
setWorkerUrl(maplibreWorkerUrl)

export type Basemap = 'sport' | 'satellite' | 'dark'

export const BASEMAP_KEY = 'pulso_map_basemap'

export const LIBERTY_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty'

/** Fondo principal para usuarios nuevos. */
export const DEFAULT_BASEMAP: Basemap = 'sport'

/** A dónde se cae el mapa si el estilo deportivo falla de verdad. */
export const SPORT_FALLBACK: Basemap = 'satellite'

/** Tiempo de espera antes de considerar que el estilo deportivo no
 *  cargó (la primera carga tarda unos segundos; no confundir una
 *  manzana sin edificios dibujados con un error de tiles). */
export const STYLE_LOAD_TIMEOUT_MS = 20000

// Colores PULSO para la cartografía y las rutas.
export const ROUTE_CASING_COLOR = '#FFFFFF'
export const ROUTE_CASING_WIDTH = 9
export const ROUTE_COLOR = '#D14D72' // rosa oscuro PULSO
export const ROUTE_WIDTH = 5
export const GUIDE_COLOR = '#A87FD1' // lila PULSO
export const GUIDE_WIDTH = 3
export const START_MARKER_COLOR = '#1F9D63' // verde inicio
export const YOU_MARKER_COLOR = '#2B7FFF' // azul "estás aquí"
export const WATER_COLOR = '#5ECFC7' // mar turquesa
export const PARK_COLOR = '#CDE8C5' // parques verde menta PULSO
export const WOOD_COLOR = '#B7DFA8'

export function isValidBasemap(v: string | null): v is Basemap {
  return v === 'sport' || v === 'satellite' || v === 'dark'
}

/** Fondo inicial: la preferencia guardada manda (quien ya tenía
 *  'dark' o 'satellite' lo conserva); los usuarios nuevos ven 'sport'. */
export function resolveInitialBasemap(saved: string | null): Basemap {
  return isValidBasemap(saved) ? saved : DEFAULT_BASEMAP
}

// Parche de colores PULSO sobre el estilo Liberty. Ids de capa
// verificados en el style JSON (2026-11-19, 111 capas): 'water',
// 'park', 'landcover_grass', 'landcover_wood' y 'waterway_*' existen
// con esos nombres. Si una versión futura del estilo cambia un id, ese
// parche se ignora sin romper nada.
const PULSO_PAINT_OVERRIDES: { layer: string; prop: 'fill-color' | 'line-color'; value: string }[] = [
  { layer: 'water', prop: 'fill-color', value: WATER_COLOR },
  { layer: 'waterway_river', prop: 'line-color', value: WATER_COLOR },
  { layer: 'waterway_other', prop: 'line-color', value: WATER_COLOR },
  { layer: 'waterway_tunnel', prop: 'line-color', value: WATER_COLOR },
  { layer: 'park', prop: 'fill-color', value: PARK_COLOR },
  { layer: 'landcover_grass', prop: 'fill-color', value: PARK_COLOR },
  { layer: 'landcover_wood', prop: 'fill-color', value: WOOD_COLOR },
]

/** Aplica los colores PULSO sobre un estilo Liberty ya cargado. */
export function applyPulsoPaint(map: MapLibreMap): void {
  for (const o of PULSO_PAINT_OVERRIDES) {
    try {
      if (map.getLayer(o.layer)) map.setPaintProperty(o.layer, o.prop, o.value)
    } catch {
      /* capa ausente en esta versión del estilo: se ignora */
    }
  }
}

function esriStyle(sat: boolean): StyleSpecification {
  if (sat) {
    return {
      version: 8,
      sources: {
        'esri-sat': {
          type: 'raster',
          tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
          tileSize: 256,
          attribution: '© Esri, Maxar, Earthstar Geographics',
        },
        'esri-sat-ref': {
          type: 'raster',
          tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}'],
          tileSize: 256,
        },
      },
      layers: [
        { id: 'esri-sat', type: 'raster', source: 'esri-sat' },
        { id: 'esri-sat-ref', type: 'raster', source: 'esri-sat-ref' },
      ],
    }
  }
  return {
    version: 8,
    sources: {
      'esri-dark-base': {
        type: 'raster',
        tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}'],
        tileSize: 256,
        attribution: '© Esri, HERE, Garmin, OpenStreetMap contributors',
      },
      'esri-dark-ref': {
        type: 'raster',
        tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}'],
        tileSize: 256,
      },
    },
    layers: [
      { id: 'esri-dark-base', type: 'raster', source: 'esri-dark-base' },
      { id: 'esri-dark-ref', type: 'raster', source: 'esri-dark-ref' },
    ],
  }
}

/** Estilo MapLibre para cada fondo. 'sport' es la URL del estilo
 *  Liberty (MapLibre descarga el JSON y resuelve sus fuentes solo). */
export function styleFor(basemap: Basemap): StyleSpecification | string {
  if (basemap === 'sport') return LIBERTY_STYLE_URL
  return esriStyle(basemap === 'satellite')
}
