import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
  MapContainer, TileLayer, Polyline, Marker, Popup, useMap, useMapEvents,
} from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import {
  Satellite, Layers, RefreshCw, X, Info,
  ParkingSquare, Coffee, AlertTriangle, Truck,
} from 'lucide-react'
import { getLastRoute } from '../lib/storage.js'

// ---------------------------------------------------------------------------
// Tuiles
// ---------------------------------------------------------------------------
const TILES = {
  standard: {
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com">CARTO</a>',
  },
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: '&copy; Esri, Maxar, Earthstar Geographics, USDA FSA, USGS',
    maxZoom: 19,
  },
}

// Couleurs des tronçons
const LEG_COLORS = ['#f97316', '#3b82f6', '#22c55e', '#a855f7', '#ef4444', '#eab308']

// ---------------------------------------------------------------------------
// Icônes personnalisées
// ---------------------------------------------------------------------------
function makeDivIcon(emoji, bg = '#1e40af', size = 32) {
  return L.divIcon({
    className: '',
    html: `<div style="background:${bg};border:2.5px solid #fff;border-radius:50%;width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;font-size:${Math.round(size * 0.5)}px;box-shadow:0 2px 8px rgba(0,0,0,.6);">${emoji}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -(size / 2 + 4)],
  })
}

const ICONS = {
  truckStop:  makeDivIcon('🅿', '#1d4ed8', 30),
  restArea:   makeDivIcon('☕', '#065f46', 30),
  height:     makeDivIcon('⚠️', '#92400e', 30),
  ptac:       makeDivIcon('🚫', '#7f1d1d', 30),
  waypoint_a: makeDivIcon('A', '#16a34a', 28),
  waypoint_b: makeDivIcon('B', '#dc2626', 28),
  waypoint_n: (n) => makeDivIcon(String(n), '#f97316', 26),
}

// ---------------------------------------------------------------------------
// Overpass API
// ---------------------------------------------------------------------------
const OVERPASS_URL = 'https://overpass-api.de/api/interpreter'

async function fetchOverpass(bbox, query) {
  const [s, w, n, e] = bbox
  // Overpass bbox syntax : (south,west,north,east) avec parenthèses
  const full = `[out:json][timeout:15];(${query.replace(/\{bbox\}/g, `(${s},${w},${n},${e})`)});out center;`
  const res = await fetch(OVERPASS_URL, {
    method: 'POST',
    body: full,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  })
  const data = await res.json()
  return data.elements || []
}

// ---------------------------------------------------------------------------
// Hook Overpass par filtre
// ---------------------------------------------------------------------------
function useOverpassLayer(enabled, query, bbox) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const abortRef = useRef(null)

  useEffect(() => {
    if (!enabled || !bbox) {
      setItems([])
      return
    }
    if (abortRef.current) abortRef.current = false
    setLoading(true)
    let cancelled = false
    abortRef.current = () => { cancelled = true }

    fetchOverpass(bbox, query)
      .then(els => { if (!cancelled) setItems(els) })
      .catch(() => { if (!cancelled) setItems([]) })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [enabled, bbox, query])

  return { items, loading }
}

// ---------------------------------------------------------------------------
// Composant interne : suit les bounds de la carte
// ---------------------------------------------------------------------------
function BoundsWatcher({ onBoundsChange }) {
  const map = useMapEvents({
    moveend: () => {
      const b = map.getBounds()
      onBoundsChange([b.getSouth(), b.getWest(), b.getNorth(), b.getEast()])
    },
    zoomend: () => {
      const b = map.getBounds()
      onBoundsChange([b.getSouth(), b.getWest(), b.getNorth(), b.getEast()])
    },
  })
  useEffect(() => {
    const b = map.getBounds()
    onBoundsChange([b.getSouth(), b.getWest(), b.getNorth(), b.getEast()])
  }, [])
  return null
}

// ---------------------------------------------------------------------------
// Ajuste la vue sur la route
// ---------------------------------------------------------------------------
function FitRoute({ geometries, points }) {
  const map = useMap()
  const fitted = useRef(false)

  useEffect(() => {
    if (fitted.current) return
    const latlngs = []
    ;(geometries || []).forEach(g => {
      ;(g?.coordinates || []).forEach(([lon, lat]) => latlngs.push([lat, lon]))
    })
    if (latlngs.length === 0) {
      ;(points || []).forEach(p => p?.lat && latlngs.push([p.lat, p.lon]))
    }
    if (latlngs.length >= 2) {
      map.fitBounds(L.latLngBounds(latlngs), { padding: [40, 40] })
      fitted.current = true
    }
  }, [map, geometries, points])

  return null
}

// ---------------------------------------------------------------------------
// Composant de marqueurs
// ---------------------------------------------------------------------------
function PoiMarkers({ items, icon, getTitle, getBody }) {
  return items.map((el, i) => {
    const lat = el.lat ?? el.center?.lat
    const lon = el.lon ?? el.center?.lon
    if (!lat || !lon) return null
    return (
      <Marker key={`${el.id}-${i}`} position={[lat, lon]} icon={icon}>
        <Popup>
          <div style={{ fontFamily: 'sans-serif', fontSize: 12, lineHeight: 1.5, minWidth: 140 }}>
            <div style={{ fontWeight: 700, marginBottom: 3 }}>{getTitle(el)}</div>
            <div style={{ color: '#555' }}>{getBody(el)}</div>
          </div>
        </Popup>
      </Marker>
    )
  })
}

// ---------------------------------------------------------------------------
// Composant principal MapPage
// ---------------------------------------------------------------------------
export default function MapPage() {
  const [satellite, setSatellite] = useState(false)
  const [filters, setFilters] = useState({
    truckStop: false,
    restArea: false,
    height: false,
    ptac: false,
  })
  const [bbox, setBbox] = useState(null)
  const [lastRoute, setLastRoute] = useState(null)

  useEffect(() => {
    setLastRoute(getLastRoute())
  }, [])

  function toggleFilter(key) {
    setFilters(f => ({ ...f, [key]: !f[key] }))
  }

  // Overpass layers
  const { items: truckStops, loading: loadTS } = useOverpassLayer(
    filters.truckStop, 'node["amenity"="truck_stop"]{bbox};node["highway"="services"]["truck"="yes"]{bbox};', bbox
  )
  const { items: restAreas, loading: loadRA } = useOverpassLayer(
    filters.restArea, 'node["highway"="rest_area"]{bbox};node["amenity"="rest_area"]{bbox};', bbox
  )
  const { items: heightEls, loading: loadH } = useOverpassLayer(
    filters.height, 'way["maxheight"]{bbox};node["maxheight"]{bbox};', bbox
  )
  const { items: ptacEls, loading: loadP } = useOverpassLayer(
    filters.ptac, 'way["maxweight"]{bbox};way["hgv"="no"]{bbox};node["hgv"="no"]{bbox};', bbox
  )

  const anyLoading = loadTS || loadRA || loadH || loadP

  // Geometry / waypoints from last route
  const points     = lastRoute?.waypoints || []
  const geometries = lastRoute?.geometries || []

  const polylines = (geometries || []).map((geom, i) => {
    if (geom?.coordinates?.length > 1) {
      return geom.coordinates.map(([lon, lat]) => [lat, lon])
    }
    const from = points[i], to = points[i + 1]
    if (from?.lat && to?.lat) return [[from.lat, from.lon], [to.lat, to.lon]]
    return []
  })

  const center = points[0]?.lat
    ? [points[0].lat, points[0].lon]
    : [46.5, 2.3]
  const zoom = points.length >= 2 ? 7 : 6

  const tileLayer = satellite ? TILES.satellite : TILES.standard

  const FILTER_BUTTONS = [
    { key: 'truckStop', icon: '🅿', label: 'Parking PL', color: '#1d4ed8', loading: loadTS },
    { key: 'restArea',  icon: '☕', label: 'Aire de repos', color: '#065f46', loading: loadRA },
    { key: 'height',    icon: '⚠️', label: 'Hauteur <4.30m', color: '#92400e', loading: loadH },
    { key: 'ptac',      icon: '🚫', label: 'PTAC/HGV', color: '#7f1d1d', loading: loadP },
  ]

  // Hauteur explicite : plein écran moins header (56px) et nav (64px)
  const mapHeight = 'calc(100dvh - 56px - 64px)'

  return (
    <div style={{ position: 'relative', width: '100%', height: mapHeight }}>
      {/* Carte */}
      <MapContainer
        center={center}
        zoom={zoom}
        style={{ width: '100%', height: '100%' }}
        scrollWheelZoom
        zoomControl
      >
        <TileLayer
          key={satellite ? 'sat' : 'std'}
          url={tileLayer.url}
          attribution={tileLayer.attribution}
          maxZoom={tileLayer.maxZoom || 19}
        />

        {/* Tracé de la route */}
        {polylines.map((positions, i) =>
          positions.length > 1 ? (
            <Polyline
              key={i}
              positions={positions}
              pathOptions={{
                color: LEG_COLORS[i % LEG_COLORS.length],
                weight: 5,
                opacity: 0.9,
              }}
            />
          ) : null
        )}

        {/* Marqueurs de points du trajet */}
        {points.map((pt, i) => {
          if (!pt?.lat) return null
          const isFirst = i === 0
          const isLast  = i === points.length - 1
          const icon = isFirst
            ? ICONS.waypoint_a
            : isLast
              ? ICONS.waypoint_b
              : ICONS.waypoint_n(i)
          return (
            <Marker key={`wp-${i}`} position={[pt.lat, pt.lon]} icon={icon}>
              <Popup>
                <span style={{ fontFamily: 'sans-serif', fontSize: 13, fontWeight: 600 }}>
                  {pt.shortLabel || pt.label || `Point ${i + 1}`}
                </span>
              </Popup>
            </Marker>
          )
        })}

        {/* POIs Overpass */}
        {filters.truckStop && (
          <PoiMarkers
            items={truckStops}
            icon={ICONS.truckStop}
            getTitle={el => el.tags?.name || 'Parking poids lourd'}
            getBody={el => [
              el.tags?.['operator'] && `Exploitant : ${el.tags['operator']}`,
              el.tags?.['capacity:trucks'] && `Capacité : ${el.tags['capacity:trucks']} PL`,
              el.tags?.['opening_hours'] && `Horaires : ${el.tags['opening_hours']}`,
            ].filter(Boolean).join('\n') || 'Parking PL — OpenStreetMap'}
          />
        )}

        {filters.restArea && (
          <PoiMarkers
            items={restAreas}
            icon={ICONS.restArea}
            getTitle={el => el.tags?.name || 'Aire de repos'}
            getBody={el => [
              el.tags?.['amenity'] === 'fuel' && '⛽ Carburant disponible',
              el.tags?.['toilets'] === 'yes' && '🚻 Toilettes',
              el.tags?.['trucks'] === 'yes' && '🚛 Adapté aux PL',
            ].filter(Boolean).join(' · ') || 'Aire de repos — OpenStreetMap'}
          />
        )}

        {filters.height && heightEls
          .filter(el => {
            const h = parseFloat(el.tags?.maxheight)
            return !isNaN(h) && h < 4.3
          })
          .map((el, i) => {
            const lat = el.lat ?? el.center?.lat
            const lon = el.lon ?? el.center?.lon
            if (!lat || !lon) return null
            const h = el.tags?.maxheight
            return (
              <Marker key={`h-${el.id}-${i}`} position={[lat, lon]} icon={ICONS.height}>
                <Popup>
                  <div style={{ fontFamily: 'sans-serif', fontSize: 12, lineHeight: 1.5 }}>
                    <div style={{ fontWeight: 700, color: '#b45309' }}>⚠️ Hauteur limitée : {h} m</div>
                    <div style={{ color: '#555', marginTop: 3 }}>
                      {el.tags?.name || el.tags?.['ref'] || 'Ouvrage d\'art'}
                    </div>
                    <div style={{ color: '#888', fontSize: 11, marginTop: 2 }}>
                      Votre hauteur garage doit être &lt; {h} m
                    </div>
                  </div>
                </Popup>
              </Marker>
            )
          })}

        {filters.ptac && (
          <PoiMarkers
            items={ptacEls}
            icon={ICONS.ptac}
            getTitle={el => `🚫 ${el.tags?.maxweight ? `Charge max : ${el.tags.maxweight} t` : 'Route interdite HGV'}`}
            getBody={el => [
              el.tags?.['hgv'] === 'no' && 'Interdit aux poids lourds (HGV)',
              el.tags?.['maxweight'] && `Charge maximale : ${el.tags['maxweight']} t`,
              el.tags?.['note'] || el.tags?.['description'],
            ].filter(Boolean).join('\n') || 'Restriction PTAC — OpenStreetMap'}
          />
        )}

        <BoundsWatcher onBoundsChange={setBbox} />
        {points.length >= 2 && <FitRoute geometries={geometries} points={points} />}
      </MapContainer>

      {/* Barre de contrôles (overlay) */}
      <div
        style={{
          position: 'absolute',
          top: 10,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 1000,
          display: 'flex',
          gap: 6,
          flexWrap: 'wrap',
          justifyContent: 'center',
          pointerEvents: 'none',
        }}
      >
        {/* Satellite toggle */}
        <button
          onClick={() => setSatellite(s => !s)}
          style={{
            pointerEvents: 'auto',
            display: 'flex', alignItems: 'center', gap: 5,
            background: satellite ? '#f97316' : 'rgba(15,23,42,0.92)',
            color: '#f1f5f9',
            border: `1.5px solid ${satellite ? '#ea580c' : '#334155'}`,
            borderRadius: 8, padding: '5px 11px',
            fontSize: 12, fontWeight: 600, cursor: 'pointer',
            backdropFilter: 'blur(6px)',
            boxShadow: '0 2px 8px rgba(0,0,0,.4)',
          }}
          title={satellite ? 'Carte standard' : 'Vue satellite'}
        >
          {satellite ? '🗺️' : '🛰️'} {satellite ? 'Standard' : 'Satellite'}
        </button>

        {/* Filtres POI */}
        {FILTER_BUTTONS.map(({ key, icon, label, color, loading }) => (
          <button
            key={key}
            onClick={() => toggleFilter(key)}
            style={{
              pointerEvents: 'auto',
              display: 'flex', alignItems: 'center', gap: 5,
              background: filters[key] ? color : 'rgba(15,23,42,0.92)',
              color: '#f1f5f9',
              border: `1.5px solid ${filters[key] ? color : '#334155'}`,
              borderRadius: 8, padding: '5px 11px',
              fontSize: 12, fontWeight: 600, cursor: 'pointer',
              backdropFilter: 'blur(6px)',
              boxShadow: '0 2px 8px rgba(0,0,0,.4)',
              opacity: loading ? 0.75 : 1,
            }}
            title={label}
          >
            {loading ? '⟳' : icon} {label}
          </button>
        ))}
      </div>

      {/* Info : pas de route */}
      {!lastRoute && (
        <div
          style={{
            position: 'absolute',
            bottom: 20,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 1000,
            background: 'rgba(15,23,42,0.92)',
            border: '1.5px solid #334155',
            borderRadius: 10,
            padding: '10px 18px',
            color: '#94a3b8',
            fontSize: 13,
            textAlign: 'center',
            backdropFilter: 'blur(6px)',
            boxShadow: '0 2px 12px rgba(0,0,0,.5)',
            pointerEvents: 'none',
          }}
        >
          🗺️ Planifiez un trajet dans l'onglet <strong style={{ color: '#f97316' }}>Planifier</strong> pour voir la route ici
        </div>
      )}

      {/* Info chargement Overpass */}
      {anyLoading && (
        <div
          style={{
            position: 'absolute',
            top: 55,
            right: 10,
            zIndex: 1000,
            background: 'rgba(15,23,42,0.92)',
            border: '1px solid #334155',
            borderRadius: 8,
            padding: '5px 12px',
            color: '#94a3b8',
            fontSize: 11,
            backdropFilter: 'blur(6px)',
            pointerEvents: 'none',
          }}
        >
          ⟳ Chargement des données OSM…
        </div>
      )}

      {/* Légende de la route */}
      {lastRoute && (lastRoute.origin || lastRoute.dest) && (
        <div
          style={{
            position: 'absolute',
            bottom: 20,
            left: 10,
            zIndex: 1000,
            background: 'rgba(15,23,42,0.92)',
            border: '1.5px solid #334155',
            borderRadius: 10,
            padding: '8px 12px',
            color: '#e2e8f0',
            fontSize: 12,
            backdropFilter: 'blur(6px)',
            boxShadow: '0 2px 12px rgba(0,0,0,.5)',
            maxWidth: 200,
            pointerEvents: 'none',
          }}
        >
          <div style={{ color: '#f97316', fontWeight: 700, marginBottom: 4, fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>
            Dernier trajet
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
            <span style={{ color: '#22c55e', fontWeight: 800, flexShrink: 0 }}>A</span>
            <span style={{ color: '#94a3b8', lineHeight: 1.3 }}>{lastRoute.origin}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginTop: 3 }}>
            <span style={{ color: '#ef4444', fontWeight: 800, flexShrink: 0 }}>B</span>
            <span style={{ color: '#94a3b8', lineHeight: 1.3 }}>{lastRoute.dest}</span>
          </div>
        </div>
      )}
    </div>
  )
}
