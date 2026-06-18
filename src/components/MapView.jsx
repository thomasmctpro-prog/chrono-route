import React, { useEffect } from 'react'
import { Map, ChevronDown, ChevronUp } from 'lucide-react'
import { MapContainer, TileLayer, Polyline, Marker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// Couleurs des tronçons (un par jambe)
const LEG_COLORS = ['#f97316', '#3b82f6', '#22c55e', '#a855f7', '#ef4444', '#eab308']

// Marqueur circulaire personnalisé (évite les images manquantes avec Vite)
function makeDivIcon(bg, text) {
  return L.divIcon({
    className: '',
    html: `<div style="
      background:${bg};
      border:2.5px solid #fff;
      border-radius:50%;
      width:28px;height:28px;
      display:flex;align-items:center;justify-content:center;
      font-size:11px;font-weight:800;color:#fff;
      box-shadow:0 2px 6px rgba(0,0,0,.5);
    ">${text}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -16],
  })
}

// Sous-composant : ajuste automatiquement le zoom sur tous les points
function FitBounds({ geometries, points }) {
  const map = useMap()
  useEffect(() => {
    const latlngs = []
    ;(geometries || []).forEach(g => {
      ;(g?.coordinates || []).forEach(([lon, lat]) => latlngs.push([lat, lon]))
    })
    // Fallback si pas de géométrie : utiliser les coordonnées brutes
    if (latlngs.length === 0) {
      ;(points || []).forEach(p => p?.lat && latlngs.push([p.lat, p.lon]))
    }
    if (latlngs.length >= 2) {
      map.fitBounds(L.latLngBounds(latlngs), { padding: [30, 30] })
    } else if (latlngs.length === 1) {
      map.setView(latlngs[0], 11)
    }
  }, [map, geometries, points])
  return null
}

export default function MapView({ points, geometries, open, onToggle }) {
  if (!points || points.filter(Boolean).length < 2) return null

  const center = [points[0]?.lat ?? 46.5, points[0]?.lon ?? 2.3]

  // Convertir les géométries GeoJSON en tableaux [lat, lon] pour Leaflet
  const polylines = (geometries || []).map((geom, i) => {
    if (geom?.coordinates?.length > 1) {
      return geom.coordinates.map(([lon, lat]) => [lat, lon])
    }
    // Fallback : ligne droite entre deux points consécutifs
    const from = points[i]
    const to = points[i + 1]
    if (from?.lat && to?.lat) return [[from.lat, from.lon], [to.lat, to.lon]]
    return []
  })

  return (
    <div className="card overflow-hidden">
      {/* En-tête cliquable */}
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-bg-elevated transition-colors"
      >
        <div className="flex items-center gap-2">
          <Map size={14} className="text-accent" />
          <span className="font-semibold text-bright text-sm">Carte de l'itinéraire</span>
          {!open && (
            <span className="text-xs text-muted ml-1">
              ({points.filter(Boolean).length} points)
            </span>
          )}
        </div>
        {open
          ? <ChevronUp size={14} className="text-muted" />
          : <ChevronDown size={14} className="text-muted" />}
      </button>

      {open && (
        <div className="relative" style={{ height: 320 }}>
          <MapContainer
            center={center}
            zoom={7}
            style={{ height: '100%', width: '100%' }}
            scrollWheelZoom={false}
            zoomControl
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            {/* Tracés de chaque tronçon */}
            {polylines.map((positions, i) =>
              positions.length > 1 ? (
                <Polyline
                  key={i}
                  positions={positions}
                  pathOptions={{
                    color: LEG_COLORS[i % LEG_COLORS.length],
                    weight: 5,
                    opacity: 0.85,
                  }}
                />
              ) : null
            )}

            {/* Marqueurs */}
            {points.map((pt, i) => {
              if (!pt?.lat) return null
              const isFirst = i === 0
              const isLast = i === points.length - 1
              const bg = isFirst ? '#22c55e' : isLast ? '#ef4444' : '#f97316'
              const lbl = isFirst ? 'A' : isLast ? 'B' : String(i)
              return (
                <Marker
                  key={i}
                  position={[pt.lat, pt.lon]}
                  icon={makeDivIcon(bg, lbl)}
                >
                  <Popup>
                    <span style={{ fontFamily: 'sans-serif', fontSize: 13, fontWeight: 600 }}>
                      {pt.shortLabel || pt.label || ''}
                    </span>
                  </Popup>
                </Marker>
              )
            })}

            <FitBounds geometries={geometries} points={points} />
          </MapContainer>

          {/* Légende superposée en bas à gauche */}
          <div
            className="absolute bottom-3 left-2 bg-bg-base/90 border border-bg-border rounded-lg px-2.5 py-2 text-xs space-y-1"
            style={{ zIndex: 1000, pointerEvents: 'none', backdropFilter: 'blur(4px)' }}
          >
            {points.map((pt, i) => {
              if (!pt) return null
              const isFirst = i === 0
              const isLast = i === points.length - 1
              const cls = isFirst ? 'text-drive' : isLast ? 'text-danger' : 'text-accent'
              const lbl = isFirst ? 'A' : isLast ? 'B' : String(i)
              return (
                <div key={i} className="flex items-center gap-1.5">
                  <span className={`font-bold w-3 ${cls}`}>{lbl}</span>
                  <span className="text-sub truncate" style={{ maxWidth: 160 }}>
                    {pt.shortLabel || pt.label || ''}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
