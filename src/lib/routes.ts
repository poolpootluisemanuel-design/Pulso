// Rutas recomendadas para correr, estilo Strava: rutas conocidas de la
// zona con su trazado aproximado sobre el mapa, para recorrerlas con
// GPS como guía. Las coordenadas son aproximadas (puntos sobre las
// avenidas / malecones / playas reales) y la distancia se calcula con
// haversine sobre la polilínea: por eso siempre se muestra como
// aproximada ("~5.2 km"), nunca como medida exacta. La zona es plana
// (costa), así que el desnivel es bajo y también aproximado.
import { haversineKm } from './utils'

export interface RoutePoint { lat: number; lng: number }

export interface RecommendedRoute {
  id: string
  name: string
  zone: string
  points: RoutePoint[]
  difficulty: 'Fácil' | 'Media' | 'Exigente'
  surface: string
  elevationGainM: number
  blurb: string
}

// Centro por defecto: Cancún centro.
export const CANCUN_CENTER: RoutePoint = { lat: 21.1619, lng: -86.8515 }
// Centro de Isla Mujeres: en el mapa oscuro casi todo es mar gris,
// por eso allí el mapa arranca en satélite (ver MapView).
export const ISLA_MUJERES_CENTER: RoutePoint = { lat: 21.25, lng: -86.72 }

export const ZONE_CENTERS: Record<string, RoutePoint> = {
  'Cancún centro': CANCUN_CENTER,
  'Isla Mujeres': ISLA_MUJERES_CENTER,
  'Zona Hotelera': { lat: 21.12, lng: -86.77 },
  'Puerto Cancún': { lat: 21.17, lng: -86.80 },
  'Playa del Carmen': { lat: 20.62, lng: -87.07 },
  'Puerto Morelos': { lat: 20.84, lng: -86.87 },
  'Tulum': { lat: 20.21, lng: -87.43 },
  'Riviera Maya': { lat: 20.62, lng: -87.07 },
  'Cozumel': { lat: 20.51, lng: -86.95 },
}

export function zoneCenter(zone: string): RoutePoint {
  return ZONE_CENTERS[zone] || CANCUN_CENTER
}

/** Rutas de una zona primero, luego las demás (mismo orden dentro). */
export function routesSortedByZone(zone: string): RecommendedRoute[] {
  const mine = RECOMMENDED_ROUTES.filter((r) => r.zone === zone)
  const rest = RECOMMENDED_ROUTES.filter((r) => r.zone !== zone)
  return [...mine, ...rest]
}

export function routeDistanceKm(route: RecommendedRoute): number {
  let total = 0
  for (let i = 1; i < route.points.length; i++) total += haversineKm(route.points[i - 1], route.points[i])
  return total
}

export const RECOMMENDED_ROUTES: RecommendedRoute[] = [
  {
    id: 'tajamar',
    name: 'Malecón Tajamar',
    zone: 'Cancún centro',
    difficulty: 'Fácil',
    surface: 'Asfalto y andador',
    elevationGainM: 8,
    blurb: 'Vuelta al malecón con vista a la laguna. Plano, iluminado y con mucha gente corriendo en la mañana.',
    points: [
      { lat: 21.1488, lng: -86.8285 },
      { lat: 21.1505, lng: -86.8245 },
      { lat: 21.1535, lng: -86.8220 },
      { lat: 21.1558, lng: -86.8240 },
      { lat: 21.1565, lng: -86.8280 },
      { lat: 21.1545, lng: -86.8310 },
      { lat: 21.1510, lng: -86.8315 },
      { lat: 21.1488, lng: -86.8285 },
    ],
  },
  {
    id: 'zona-hotelera',
    name: 'Zona Hotelera · Punta Cancún',
    zone: 'Zona Hotelera',
    difficulty: 'Media',
    surface: 'Asfalto (banqueta del Blvd. Kukulcán)',
    elevationGainM: 12,
    blurb: 'El clásico de Cancún: corre por el bulevar con el mar a un lado. De día hay sombra en tramos; lleva agua.',
    points: [
      { lat: 21.1338, lng: -86.7645 },
      { lat: 21.1280, lng: -86.7655 },
      { lat: 21.1210, lng: -86.7685 },
      { lat: 21.1140, lng: -86.7705 },
      { lat: 21.1070, lng: -86.7730 },
      { lat: 21.1010, lng: -86.7755 },
    ],
  },
  {
    id: 'isla-mujeres-sur',
    name: 'Isla Mujeres · Malecón a Punta Sur',
    zone: 'Isla Mujeres',
    difficulty: 'Fácil',
    surface: 'Asfalto y malecón',
    elevationGainM: 15,
    blurb: 'Del centro de la isla hasta Punta Sur, con vista al Caribe todo el camino. Ideal al amanecer.',
    points: [
      { lat: 21.2588, lng: -86.7285 },
      { lat: 21.2520, lng: -86.7240 },
      { lat: 21.2450, lng: -86.7190 },
      { lat: 21.2380, lng: -86.7145 },
      { lat: 21.2335, lng: -86.7120 },
    ],
  },
  {
    id: 'isla-playa-norte',
    name: 'Isla Mujeres · Playa Norte',
    zone: 'Isla Mujeres',
    difficulty: 'Fácil',
    surface: 'Arena compacta y malecón',
    elevationGainM: 5,
    blurb: 'Vuelta por la punta norte de la isla, por Playa Norte: arena blanca, agua turquesa y sombra en el malecón.',
    points: [
      { lat: 21.2608, lng: -86.7395 },
      { lat: 21.2632, lng: -86.7345 },
      { lat: 21.2620, lng: -86.7295 },
      { lat: 21.2590, lng: -86.7280 },
      { lat: 21.2580, lng: -86.7325 },
      { lat: 21.2608, lng: -86.7395 },
    ],
  },
  {
    id: 'isla-sac-bajo',
    name: 'Isla Mujeres · Sac Bajo a Punta Sur',
    zone: 'Isla Mujeres',
    difficulty: 'Media',
    surface: 'Asfalto',
    elevationGainM: 18,
    blurb: 'Del sur de la isla hasta Punta Sur, donde se ve el amanecer primero en México. Hay subida suave al final.',
    points: [
      { lat: 21.2360, lng: -86.7160 },
      { lat: 21.2310, lng: -86.7110 },
      { lat: 21.2260, lng: -86.7060 },
      { lat: 21.2215, lng: -86.7010 },
      { lat: 21.2185, lng: -86.6975 },
    ],
  },
  {
    id: 'isla-la-gloria',
    name: 'Isla Mujeres · Centro a La Gloria',
    zone: 'Isla Mujeres',
    difficulty: 'Fácil',
    surface: 'Asfalto',
    elevationGainM: 8,
    blurb: 'Por la avenida principal del lado oeste, del centro a la colonia La Gloria: plano, con tienditas y gente local.',
    points: [
      { lat: 21.2565, lng: -86.7355 },
      { lat: 21.2510, lng: -86.7330 },
      { lat: 21.2460, lng: -86.7305 },
      { lat: 21.2410, lng: -86.7280 },
      { lat: 21.2365, lng: -86.7245 },
    ],
  },
  {
    id: 'isla-vuelta-completa',
    name: 'Isla Mujeres · Vuelta completa',
    zone: 'Isla Mujeres',
    difficulty: 'Exigente',
    surface: 'Asfalto y malecón',
    elevationGainM: 25,
    blurb: 'La vuelta entera a la isla: bajas por el lado este hasta Punta Sur y regresas por el oeste. La ruta larga de la isla.',
    points: [
      { lat: 21.2615, lng: -86.7320 },
      { lat: 21.2550, lng: -86.7260 },
      { lat: 21.2470, lng: -86.7200 },
      { lat: 21.2380, lng: -86.7130 },
      { lat: 21.2290, lng: -86.7060 },
      { lat: 21.2195, lng: -86.6985 },
      { lat: 21.2280, lng: -86.7120 },
      { lat: 21.2380, lng: -86.7200 },
      { lat: 21.2480, lng: -86.7280 },
      { lat: 21.2560, lng: -86.7350 },
      { lat: 21.2615, lng: -86.7320 },
    ],
  },
  {
    id: 'playa-carmen',
    name: 'Playa del Carmen · Playa y 5ta Av.',
    zone: 'Playa del Carmen',
    difficulty: 'Fácil',
    surface: 'Arena compacta / andador',
    elevationGainM: 6,
    blurb: 'Por la orilla de la playa, con el mar a un lado y la 5ta Avenida cerca para el café de después.',
    points: [
      { lat: 20.6290, lng: -87.0730 },
      { lat: 20.6220, lng: -87.0700 },
      { lat: 20.6150, lng: -87.0670 },
      { lat: 20.6080, lng: -87.0640 },
      { lat: 20.6020, lng: -87.0610 },
    ],
  },
  {
    id: 'puerto-morelos',
    name: 'Puerto Morelos · Malecón',
    zone: 'Puerto Morelos',
    difficulty: 'Fácil',
    surface: 'Asfalto y malecón',
    elevationGainM: 5,
    blurb: 'Ruta corta y tranquila por el malecón del pueblo, frente al muelle. Perfecta para empezar.',
    points: [
      { lat: 20.8490, lng: -86.8760 },
      { lat: 20.8450, lng: -86.8730 },
      { lat: 20.8400, lng: -86.8700 },
      { lat: 20.8350, lng: -86.8670 },
    ],
  },
  {
    id: 'tulum-playa',
    name: 'Tulum · Zona arqueológica a la playa',
    zone: 'Tulum',
    difficulty: 'Media',
    surface: 'Asfalto y arena',
    elevationGainM: 10,
    blurb: 'De las ruinas hacia la zona de playa por la carretera costera. Mejor temprano, antes del calor.',
    points: [
      { lat: 20.2100, lng: -87.4280 },
      { lat: 20.2050, lng: -87.4240 },
      { lat: 20.2000, lng: -87.4200 },
      { lat: 20.1960, lng: -87.4160 },
      { lat: 20.1920, lng: -87.4120 },
    ],
  },
  {
    id: 'parque-kabah',
    name: 'Parque Kabah · Circuito',
    zone: 'Cancún centro',
    difficulty: 'Fácil',
    surface: 'Sendero de tierra compacta',
    elevationGainM: 8,
    blurb: 'Circuito dentro del parque, entre árboles. Sombra, aire fresco y sin carros: ideal para series suaves.',
    points: [
      { lat: 21.1390, lng: -86.8360 },
      { lat: 21.1410, lng: -86.8320 },
      { lat: 21.1380, lng: -86.8290 },
      { lat: 21.1350, lng: -86.8320 },
      { lat: 21.1390, lng: -86.8360 },
    ],
  },
]
