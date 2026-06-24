import React, { useState } from 'react'
import { ChevronDown, ChevronUp, BookOpen } from 'lucide-react'
import { formatTime, formatDuration } from '../lib/regulations.js'
import { STOP_TYPES } from '../lib/calculator.js'

// ---------------------------------------------------------------------------
// Correspondance type de segment → catégorie LIC
// ---------------------------------------------------------------------------

const DRIVE_INFO = {
  cat: 'conduite', label: 'Conduite', icon: '🚛', color: 'text-drive',
}
const REST_INFO = {
  cat: 'repos', label: 'Repos journalier', icon: '🌙', color: 'text-blue-400',
}

function getActivityInfo(seg) {
  if (seg.type === 'drive') return DRIVE_INFO

  if (seg.type === 'break') {
    if (seg.isWorkBreak) {
      return { cat: 'repos', label: 'Pause travail (Directive)', icon: '⏸️', color: 'text-yellow-400' }
    }
    // Identifier si c'est la 1ère ou 2ème partie fractionnée
    if (seg.reason?.includes('1/2')) return { cat: 'repos', label: seg.reason, icon: '☕', color: 'text-pause' }
    if (seg.reason?.includes('2/2')) return { cat: 'repos', label: seg.reason, icon: '☕', color: 'text-pause' }
    return { cat: 'repos', label: 'Pause conduite', icon: '☕', color: 'text-pause' }
  }

  if (seg.type === 'stop') {
    const stopDef = STOP_TYPES.find(s => s.id === seg.stopType)
    const isRest  = seg.stopType === 'rest_stop'
    return {
      cat:   isRest ? 'repos' : 'travaux',
      label: stopDef?.label || 'Arrêt',
      icon:  stopDef?.icon  || '📍',
      color: isRest ? 'text-pause' : 'text-accent',
    }
  }

  return { cat: 'repos', label: 'Repos', icon: '🌙', color: 'text-blue-400' }
}

// ---------------------------------------------------------------------------
// Composant principal
// ---------------------------------------------------------------------------

export default function LicCard({ days }) {
  const [open, setOpen] = useState(false)

  if (!days || days.length === 0) return null

  return (
    <div className="card overflow-hidden">
      {/* En-tête cliquable */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-bg-elevated/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <BookOpen size={15} className="text-accent" />
          <span className="font-semibold text-bright text-sm">Livret Individuel de Contrôle</span>
          <span className="text-xs text-muted bg-bg-elevated px-2 py-0.5 rounded-full border border-bg-border">
            {days.length} jour{days.length > 1 ? 's' : ''}
          </span>
        </div>
        {open ? <ChevronUp size={14} className="text-muted" /> : <ChevronDown size={14} className="text-muted" />}
      </button>

      {open && (
        <div className="border-t border-bg-border">
          <div className="px-3 py-2 bg-bg-elevated/50 border-b border-bg-border">
            <p className="text-xs text-muted">
              Format de contrôle journalier — Trajet planifié (à titre indicatif)
            </p>
          </div>

          {days.map((day, di) => (
            <DaySection key={di} day={day} />
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Section par jour
// ---------------------------------------------------------------------------

function DaySection({ day }) {
  const segs = day.segments || []

  // Totaux par catégorie
  const conduite   = segs.filter(s => s.type === 'drive').reduce((t, s) => t + s.duration, 0)
  const travaux    = segs.filter(s => s.type === 'stop' && s.stopType !== 'rest_stop').reduce((t, s) => t + s.duration, 0)
  const pausesCond = segs.filter(s => s.type === 'break' && !s.isWorkBreak).reduce((t, s) => t + s.duration, 0)
  const pausesTrav = segs.filter(s => s.type === 'break' && s.isWorkBreak).reduce((t, s) => t + s.duration, 0)
  const restJour   = day.restStart
    ? Math.round((new Date(day.restEnd) - new Date(day.restStart)) / 60_000)
    : 0

  const dateStr = day.startTime
    ? new Date(day.startTime).toLocaleDateString('fr-FR', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      })
    : `Jour ${day.number}`

  return (
    <div className={day.number > 1 ? 'border-t-4 border-bg-base' : ''}>
      {/* En-tête du jour */}
      <div className="flex items-center justify-between px-3 py-2 bg-accent/5 border-b border-bg-border">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-accent bg-accent/15 px-2 py-0.5 rounded">
            Jour {day.number}
          </span>
          <span className="text-sm font-semibold text-bright capitalize">{dateStr}</span>
        </div>
        <div className="text-xs text-muted font-mono">
          {day.startTime && formatTime(day.startTime)}
          {day.endTime   && ` → ${formatTime(day.endTime)}`}
        </div>
      </div>

      {/* Entête colonnes */}
      <div className="grid grid-cols-[auto_1fr_auto_auto] gap-x-3 px-3 py-1 bg-bg-elevated/30 border-b border-bg-border text-xs text-muted font-medium">
        <span>Heure</span>
        <span>Activité</span>
        <span className="text-right">Durée</span>
        <span className="text-right">km</span>
      </div>

      {/* Lignes d'activités */}
      {segs.map((seg, i) => {
        const info = getActivityInfo(seg)
        const kmDisplay = (() => {
          if (seg.type === 'drive') {
            // Affiche la plage km (départ → arrivée du segment)
            if (seg.atKm !== undefined && seg.endKm !== undefined)
              return `${seg.atKm}→${seg.endKm}`
            return seg.endKm !== undefined ? `${seg.endKm} km` : '—'
          }
          return seg.atKm !== undefined ? `≈${seg.atKm}` : '—'
        })()

        const actLabel = (() => {
          if (seg.type === 'stop') {
            const prefix = seg.isDeparture ? '↗ ' : seg.isArrival ? '↙ ' : ''
            return `${prefix}${info.icon} ${info.label}${seg.label && seg.label !== info.label ? ` — ${seg.label}` : ''}`
          }
          return `${info.icon} ${info.label}`
        })()

        return (
          <div
            key={i}
            className={`grid grid-cols-[auto_1fr_auto_auto] gap-x-3 px-3 py-1.5 text-xs border-b border-bg-border/50 ${
              i % 2 === 0 ? '' : 'bg-bg-elevated/20'
            }`}
          >
            {/* Heure */}
            <div className="font-mono text-muted w-20 flex-shrink-0">
              {seg.startTime ? formatTime(seg.startTime) : '—'}
              <span className="text-muted/50"> →</span>
              <br />
              <span className="text-muted/70">{seg.endTime ? formatTime(seg.endTime) : ''}</span>
            </div>

            {/* Activité */}
            <div className={`font-medium truncate self-center ${info.color}`}>
              {actLabel}
            </div>

            {/* Durée */}
            <div className="font-mono text-sub text-right self-center">
              {formatDuration(seg.duration)}
            </div>

            {/* Km */}
            <div className="font-mono text-muted text-right self-center w-16">
              {kmDisplay}
            </div>
          </div>
        )
      })}

      {/* Repos inter-jour */}
      {day.restStart && (
        <div className="flex items-center justify-between px-3 py-2 bg-blue-500/5 border-t border-bg-border text-xs">
          <span className="text-blue-400">🌙 Repos journalier obligatoire</span>
          <span className="font-mono text-blue-400/80">
            {formatTime(day.restStart)} → {formatTime(day.restEnd)}
            <span className="ml-2 text-blue-400 font-bold">{formatDuration(restJour)}</span>
          </span>
        </div>
      )}

      {/* Totaux journaliers */}
      <div className="px-3 py-2.5 bg-bg-elevated/50 border-t border-bg-border">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1 text-xs">
          <TotalCell label="🚛 Conduite"       value={conduite}   color="text-drive" />
          <TotalCell label="🔧 Travaux divers" value={travaux}    color="text-accent" />
          <TotalCell label="☕ Pauses cond."   value={pausesCond} color="text-pause" />
          {pausesTrav > 0 && (
            <TotalCell label="⏸️ Pauses travail" value={pausesTrav} color="text-yellow-400" />
          )}
          {restJour > 0 && (
            <TotalCell label="🌙 Repos j."      value={restJour}  color="text-blue-400" />
          )}
        </div>
      </div>
    </div>
  )
}

function TotalCell({ label, value, color }) {
  if (!value) return null
  return (
    <div>
      <div className="text-muted">{label}</div>
      <div className={`font-bold tabular-nums ${color}`}>{formatDuration(value)}</div>
    </div>
  )
}
