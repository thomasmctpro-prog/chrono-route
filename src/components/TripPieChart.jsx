import React from 'react'
import { formatDuration } from '../lib/regulations.js'

// Couleurs exactes du thème (tailwind.config.js)
const SEGMENT_COLORS = {
  drive:          '#22c55e',
  break:          '#f59e0b',
  stop:           '#f97316',
  overnight_rest: '#3b82f6',
  buffer:         '#64748b',
  rest:           '#3b82f6',
}

const SEGMENT_LABELS = {
  drive:          'Conduite',
  break:          'Pauses conduite',
  stop:           'Arrêts',
  overnight_rest: 'Repos journalier',
  buffer:         'Marge de sécurité',
  rest:           'Repos',
}

// Paramètres du donut SVG
const CX = 110
const CY = 110
const R  = 80
const STROKE = 32
const CIRC  = 2 * Math.PI * R  // ≈ 502.65
const GAP   = 1.5               // espace entre segments (SVG units)

export default function TripPieChart({ timeline, bufferMinutes = 0, days }) {
  // Agrégation : utilise la timeline plate (inclut overnight_rest, breaks, stops…)
  const source = (() => {
    if (days && days.length > 1) {
      return days.flatMap(d => d.segments || [])
    }
    return timeline || []
  })()

  const agg = {}
  source.forEach(evt => {
    if (!evt?.type) return
    agg[evt.type] = (agg[evt.type] || 0) + (evt.duration || 0)
  })
  if (bufferMinutes > 0) {
    agg.buffer = (agg.buffer || 0) + bufferMinutes
  }

  const total = Object.values(agg).reduce((s, v) => s + v, 0)
  if (total === 0) return null

  // Construire les segments du donut (ordre : drive, break, stop, overnight_rest, rest, buffer)
  const ORDER = ['drive', 'break', 'stop', 'overnight_rest', 'rest', 'buffer']
  let offset = 0
  const segments = ORDER
    .filter(type => agg[type] > 0)
    .map(type => {
      const duration = agg[type]
      const raw = (duration / total) * CIRC
      const len = Math.max(0, raw - GAP)
      const seg = {
        type,
        duration,
        len,
        offset,
        pct: Math.round((duration / total) * 100),
        color: SEGMENT_COLORS[type] || '#888',
        label: SEGMENT_LABELS[type] || type,
      }
      offset += raw  // advance by raw (not len) pour compenser le gap
      return seg
    })

  return (
    <div className="card p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-bright text-sm">Répartition du trajet</h3>
        <span className="text-muted text-xs">{formatDuration(total)} total</span>
      </div>

      <div className="flex flex-col sm:flex-row items-center gap-5">
        {/* ── Donut SVG ── */}
        <div className="shrink-0">
          <svg viewBox="0 0 220 220" width={190} height={190}>
            {/* Fond du donut (anneau gris foncé) */}
            <circle
              cx={CX} cy={CY} r={R}
              fill="none"
              stroke="#1e2d47"
              strokeWidth={STROKE}
            />

            {/* Segments */}
            <g transform={`rotate(-90, ${CX}, ${CY})`}>
              {segments.map((seg, i) => (
                <circle
                  key={i}
                  cx={CX} cy={CY} r={R}
                  fill="none"
                  stroke={seg.color}
                  strokeWidth={STROKE}
                  strokeLinecap="butt"
                  strokeDasharray={`${seg.len} ${CIRC}`}
                  strokeDashoffset={-seg.offset}
                  opacity={0.92}
                />
              ))}
            </g>

            {/* Texte central */}
            <text
              x={CX} y={CY - 10}
              textAnchor="middle"
              fill="#f8fafc"
              fontSize="19"
              fontWeight="800"
              fontFamily="JetBrains Mono, monospace"
            >
              {formatDuration(total)}
            </text>
            <text
              x={CX} y={CY + 10}
              textAnchor="middle"
              fill="#64748b"
              fontSize="9"
              fontFamily="Inter, sans-serif"
            >
              durée totale
            </text>
            {days && days.length > 1 && (
              <text
                x={CX} y={CY + 24}
                textAnchor="middle"
                fill="#3b82f6"
                fontSize="9"
                fontFamily="Inter, sans-serif"
              >
                {days.length} jours
              </text>
            )}
          </svg>
        </div>

        {/* ── Légende ── */}
        <div className="flex-1 min-w-0 space-y-2.5">
          {segments.map((seg, i) => (
            <div key={i} className="space-y-0.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div
                    className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                    style={{ backgroundColor: seg.color }}
                  />
                  <span className="text-sm text-sub truncate">{seg.label}</span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="font-mono text-xs font-semibold text-text">
                    {formatDuration(seg.duration)}
                  </span>
                  <span className="text-xs text-muted w-7 text-right">
                    {seg.pct}%
                  </span>
                </div>
              </div>
              {/* Mini barre proportionnelle */}
              <div className="h-1 bg-bg-elevated rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${seg.pct}%`,
                    backgroundColor: seg.color,
                    opacity: 0.8,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
