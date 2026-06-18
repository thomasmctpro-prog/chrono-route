// APIs gratuites, sans clé requise
// Geocoding : Nominatim (OpenStreetMap)
// Routing   : OSRM (Open Source Routing Machine)

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org'
const OSRM_URL = 'https://router.project-osrm.org'
const USER_AGENT = 'ChronoRoute/1.0 (route planner for professional drivers)'

// Cache simple pour éviter les appels répétés
const geocodeCache = new Map()
const routeCache = new Map()

// ---------------------------------------------------------------------------
// Géocodage
// ---------------------------------------------------------------------------

/**
 * Recherche de lieux avec autocomplétion
 * @param {string} query
 * @returns {Promise<Array>} résultats normalisés
 */
export async function searchPlaces(query) {
  if (!query || query.trim().length < 3) return []

  const q = query.trim()
  if (geocodeCache.has(q)) return geocodeCache.get(q)

  try {
    const params = new URLSearchParams({
      q,
      format: 'json',
      limit: '6',
      countrycodes: 'fr,be,ch,lu,de,es,it,nl,gb',
      addressdetails: '1',
      'accept-language': 'fr',
    })

    const res = await fetch(`${NOMINATIM_URL}/search?${params}`, {
      headers: { 'User-Agent': USER_AGENT },
    })

    if (!res.ok) throw new Error(`Nominatim ${res.status}`)

    const data = await res.json()

    const results = data.map(item => ({
      id: item.place_id,
      label: item.display_name,
      shortLabel: buildShortLabel(item),
      lat: parseFloat(item.lat),
      lon: parseFloat(item.lon),
      type: item.type,
      class: item.class,
    }))

    geocodeCache.set(q, results)
    setTimeout(() => geocodeCache.delete(q), 5 * 60_000) // TTL 5 min

    return results
  } catch (err) {
    console.error('Nominatim error:', err)
    return []
  }
}

function buildShortLabel(item) {
  const a = item.address || {}
  const parts = []

  if (a.city || a.town || a.village || a.municipality) {
    parts.push(a.city || a.town || a.village || a.municipality)
  }
  if (a.postcode) parts.push(a.postcode)
  if (a.state) parts.push(a.state)
  if (a.country && a.country !== 'France') parts.push(a.country)

  return parts.length > 0 ? parts.join(', ') : item.display_name.split(',').slice(0, 2).join(',')
}

// ---------------------------------------------------------------------------
// Calcul d'itinéraire
// ---------------------------------------------------------------------------

/**
 * Calcule la durée et distance d'un trajet via OSRM
 * @param {{ lat: number, lon: number }} origin
 * @param {{ lat: number, lon: number }} dest
 * @param {number} speedFactor - facteur de correction pour le type de véhicule
 * @returns {Promise<{ durationMinutes: number, distanceKm: number }>}
 */
export async function getRouteDuration(origin, dest, speedFactor = 1.0) {
  const key = `${origin.lat},${origin.lon}→${dest.lat},${dest.lon}`
  if (routeCache.has(key)) {
    const cached = routeCache.get(key)
    return {
      durationMinutes: Math.round(cached.durationSeconds / 60 / speedFactor),
      distanceKm: Math.round(cached.distanceMeters / 100) / 10,
      geometry: cached.geometry || null,
      source: 'cache',
    }
  }

  try {
    const coords = `${origin.lon},${origin.lat};${dest.lon},${dest.lat}`
    const params = new URLSearchParams({
      overview: 'full',
      geometries: 'geojson',
      alternatives: 'false',
      steps: 'false',
    })

    const res = await fetch(`${OSRM_URL}/route/v1/driving/${coords}?${params}`)
    if (!res.ok) throw new Error(`OSRM ${res.status}`)

    const data = await res.json()

    if (data.code !== 'Ok' || !data.routes?.length) {
      throw new Error('No route found')
    }

    const route = data.routes[0]

    routeCache.set(key, {
      durationSeconds: route.duration,
      distanceMeters: route.distance,
      geometry: route.geometry || null,
    })
    setTimeout(() => routeCache.delete(key), 10 * 60_000) // TTL 10 min

    return {
      durationMinutes: Math.round(route.duration / 60 / speedFactor),
      distanceKm: Math.round(route.distance / 100) / 10,
      geometry: route.geometry || null,
      source: 'osrm',
    }
  } catch (err) {
    console.error('OSRM error:', err)
    // Fallback : estimation par la distance à vol d'oiseau (moins précis)
    const distKm = haversineKm(origin, dest)
    const avgSpeedKmh = 85 * speedFactor
    const durationMinutes = Math.round((distKm / avgSpeedKmh) * 60)

    return {
      durationMinutes,
      distanceKm: Math.round(distKm),
      geometry: null,
      source: 'fallback_haversine',
      warning: 'Estimation approximative (API temporairement indisponible)',
    }
  }
}

function haversineKm(p1, p2) {
  const R = 6371
  const dLat = toRad(p2.lat - p1.lat)
  const dLon = toRad(p2.lon - p1.lon)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(p1.lat)) * Math.cos(toRad(p2.lat)) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function toRad(deg) {
  return (deg * Math.PI) / 180
}

// ---------------------------------------------------------------------------
// Reverse geocoding (coordonnées → adresse)
// ---------------------------------------------------------------------------

export async function reverseGeocode(lat, lon) {
  try {
    const params = new URLSearchParams({
      lat: String(lat),
      lon: String(lon),
      format: 'json',
      'accept-language': 'fr',
    })

    const res = await fetch(`${NOMINATIM_URL}/reverse?${params}`, {
      headers: { 'User-Agent': USER_AGENT },
    })
    if (!res.ok) throw new Error(`${res.status}`)

    const data = await res.json()
    return {
      label: data.display_name,
      shortLabel: buildShortLabel(data),
      lat,
      lon,
    }
  } catch (err) {
    return null
  }
}
