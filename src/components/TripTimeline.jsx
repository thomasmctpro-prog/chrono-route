import React from 'react'
import { Moon, Package, Fuel, Wrench, MapPin, Coffee } from 'lucide-react'
import { formatTime, formatDuration } from '../lib/regulations.js'
import { STOP_TYPES } from '../lib/calculator.js'

const SEGMENT_STYLES = {
  drive:          { bar: 'bg-drive',       text: 'text-drive',     label: 'Conduite',         dotColor: 'bg-drive' },
  break:          { bar: 'bg-pause',       text: 'text-pause',     label: 'Pause',            dotColor: 'bg-pause' },
  stop:           { bar: 'bg-accent',      text: 'text-accent',    label: 'Arrêt',            dotColor: 'bg-accent' },
  overnight_rest: { bar: 'bg-blue-600',    text: 'text-blue-400',  label: 'Repos journalier', dotColor: 'bg-blue-500' },
  buffer:         { bar: 'bg-muted/50',    text: 'text-muted',     label: 'Marge',            dotColor: 'bg-muted' },
  rest:           { bar: 'bg-blue-600',    text: 'text-blue-400',  label: 'Repos',            dotColor: 'bg-blue-500' },
}

const STOP_ICONS = {
  loading:    <Wrench size={10} />,
  delivery:   <Package size={10} />,
  fuel:       <Fuel size={10} />,
  rest_stop:  <Coffee size={10} />,
  customs:    <MapPin size={10} />,
  other:      <MapPin size={10} />,
}

function getStopTypeInfo(id) {
  return STOP_TYPES.find(s => s.id === id) || STOP_TYPES[STOP_TYPES.length - 1]
}

export default function TripTimeline({ timeline, totalTripMinutes, bufferMinutes = 0, days }) {
  if (!timeline || timeline.length === 0) return null

  const allEvents = [...timeline]
  if (bufferMinutes > 0) {
    const lastEnd = allEvents[allEvents.length - 1]?.endTime
    if (lastEnd) {
      allEvents.push({
        type: 'buffer',
        duration: bufferMinutes,
        startTime: lastEnd,
        endTime: new Date(new Date(lastEnd).getTime() + bufferMinutes * 60_000),
        reason: `Marge de sécurité`,
      })
    }
  }

  const totalMin = allEvents.reduce((s, e) => s + e.duration, 0)
  const isMultiDay = days && days.length > 1

  // Si multi-jours, afficher par jour
  if (isMultiDay) {
    return <MultiDayTimeline days={days} bufferMinutes={bufferMinutes} />
  }

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-bright text-sm">Timeline du trajet</h3>
        <span className="text-muted text-xs">{formatDuration(totalMin)} total</span>
      </div>

      <TimelineBar events={allEvents} totalMin={totalMin} />
      <Legend events={allEvents} />
      <EventList events={allEvents} />
    </div>
  )
}

function MultiDayTimeline({ days, bufferMinutes }) {
  return (
    <div className="space-y-3">
      {days.map((day, i) => {
        const dayEvents = day.segments || []
        const isLastDay = i === days.length - 1
        const totalMin = dayEvents.reduce((s, e) => s + e.duration, 0)

        // Ajouter le buffer sur le dernier jour
        const events = isLastDay && bufferMinutes > 0
          ? [...dayEvents, {
              type: 'buffer',
              duration: bufferMinutes,
              startTime: day.endTime,
              endTime: new Date(new Date(day.endTime).getTime() + bufferMinutes * 60_000),
              reason: 'Marge de sécurité',
            }]
          : dayEvents

        const totalWithBuffer = events.reduce((s, e) => s + e.duration, 0)

        return (
          <div key={i} className="card p-4 space-y-3">
            {/* En-tête jour */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="bg-accent/15 text-accent text-xs font-bold px-2 py-1 rounded-lg">
                  Jour {day.number}
                </div>
                <span className="text-bright font-semibold text-sm">
                  {day.startTime
                    ? new Date(day.startTime).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
                    : ''}
                </span>
              </div>
              <span className="text-muted text-xs">{formatDuration(totalWithBuffer)}</span>
            </div>

            <TimelineBar events={events} totalMin={totalWithBuffer} />
            <EventList events={events} compact />

            {/* Repos entre les jours */}
            {day.restStart && (
              <div className="flex items-center gap-3 mt-2 bg-blue-500/10 border border-blue-500/30 rounded-lg px-3 py-2.5">
                <Moon size={16} className="text-blue-400 shrink-0" />
                <div>
                  <div className="text-blue-400 font-semibold text-sm">
                    Repos obligatoire — {formatTime(day.restStart)} → {formatTime(day.restEnd)}
                  </div>
                  <div className="text-muted text-xs">
                    Minimum {formatDuration((new Date(day.restEnd) - new Date(day.restStart)) / 60_000)} — Parking PL ou hébergement
                  </div>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function TimelineBar({ events, totalMin }) {
  return (
    <div>
      <div className="flex h-10 rounded-lg overflow-hidden gap-px">
        {events.map((evt, i) => {
          const pct = (evt.duration / totalMin) * 100
          const style = SEGMENT_STYLES[evt.type] || SEGMENT_STYLES.drive
          const stopInfo = evt.type === 'stop' ? getStopTypeInfo(evt.stopType) : null

          return (
            <div
              key={i}
              title={`${evt.reason || style.label} — ${formatDuration(evt.duration)}\n${formatTime(evt.startTime)} → ${formatTime(evt.endTime)}`}
              className={`${style.bar} opacity-90 hover:opacity-100 transition-opacity relative group cursor-default flex items-center justify-center`}
              style={{ width: `${pct}%`, minWidth: pct > 3 ? undefined : '3px' }}
            >
              {pct > 6 && (
                <span className="text-white text-xs font-semibold select-none truncate px-1">
                  {evt.type === 'stop' ? (stopInfo?.icon || '📍') : formatDuration(evt.duration)}
                </span>
              )}
            </div>
          )
        })}
      </div>

      {/* Marqueurs temps */}
      <div className="flex justify-between mt-1 relative h-4">
        {events.map((evt, i) => {
          const pctLeft = (events.slice(0, i).reduce((s, e) => s + e.duration, 0) / totalMin) * 100
          return (
            <div
              key={i}
              className="absolute text-muted text-xs"
              style={{ left: `${pctLeft}%`, transform: 'translateX(-50%)' }}
            >
              {formatTime(evt.startTime)}
            </div>
          )
        })}
        <div className="absolute right-0 text-muted text-xs">
          {formatTime(events[events.length - 1]?.endTime)}
        </div>
      </div>
    </div>
  )
}

function Legend({ events }) {
  const types = [...new Set(events.map(e => e.type))]
  return (
    <div className="flex flex-wrap gap-3 pt-1">
      {types.map(type => {
        const style = SEGMENT_STYLES[type]
        if (!style) return null
        const total = events.filter(e => e.type === type).reduce((s, e) => s + e.duration, 0)
        return (
          <div key={type} className="flex items-center gap-1.5">
            <div className={`w-3 h-3 rounded-sm ${style.bar}`} />
            <span className="text-xs text-sub">{style.label}</span>
            <span className={`text-xs font-medium ${style.text}`}>{formatDuration(total)}</span>
          </div>
        )
      })}
    </div>
  )
}

function EventList({ events, compact = false }) {
  return (
    <div className={`space-y-1 ${compact ? '' : 'border-t border-bg-border pt-2'}`}>
      {events.map((evt, i) => {
        const style = SEGMENT_STYLES[evt.type] || SEGMENT_STYLES.drive
        const stopInfo = evt.type === 'stop' ? getStopTypeInfo(evt.stopType) : null

        return (
          <div key={i} className="flex items-center gap-3 py-0.5">
            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${style.dotColor}`} />
            <div className="flex items-center justify-between w-full gap-2 min-w-0">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="font-mono text-xs text-accent font-medium flex-shrink-0">
                  {formatTime(evt.startTime)}
                </span>
                <span className="text-sm text-sub truncate">
                  {evt.type === 'stop'
                    ? `${stopInfo?.icon || '📍'} ${evt.reason || evt.label || 'Arrêt'}`
                    : evt.type === 'overnight_rest'
                      ? '🌙 ' + (evt.reason || 'Repos obligatoire')
                      : evt.reason || style.label
                  }
                </span>
                {evt.type === 'break' && evt.atKm > 0 && (
                  <span className="text-muted/60 text-xs flex-shrink-0">≈{evt.atKm} km</span>
                )}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className={`text-xs font-semibold ${style.text}`}>
                  {formatDuration(evt.duration)}
                </span>
                <span className="font-mono text-xs text-muted">→ {formatTime(evt.endTime)}</span>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
