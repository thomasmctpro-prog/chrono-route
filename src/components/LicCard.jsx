import React, { useState, useRef } from 'react'
import { ChevronDown, ChevronUp, BookOpen, Printer, Download } from 'lucide-react'
import { formatTime, formatDuration } from '../lib/regulations.js'
import { STOP_TYPES } from '../lib/calculator.js'

// ---------------------------------------------------------------------------
// Couleurs par type d'activité (LIC standard)
// ---------------------------------------------------------------------------
const COLORS = {
  drive:          '#16a34a',  // vert   — conduite
  stop_work:      '#ea580c',  // orange — travaux divers
  rest_stop:      '#7c3aed',  // violet — pause technique (repos)
  break_drive:    '#d97706',  // ambre  — pause conduite
  break_work:     '#ca8a04',  // jaune  — pause travail (Directive)
  overnight_rest: '#1d4ed8',  // bleu   — repos journalier
}

// Lignes de la grille LIC (conforme au vrai feuillet quotidien)
const LIC_ROWS = [
  { key: 'conduite', num: '4', iconChar: '🚛', label: 'Conduite',     color: COLORS.drive },
  { key: 'travaux',  num: '5', iconChar: '⚒️', label: 'Travaux',      color: COLORS.stop_work },
  { key: 'dispo',    num: '6', iconChar: '⬜', label: 'Disponibilité', color: '#0e7490' },
  { key: 'repos',    num: '7', iconChar: '🛏',  label: 'Repos',        color: COLORS.overnight_rest },
]

// Résolution : 15 minutes par cellule
const CELL_MINUTES = 15

// ---------------------------------------------------------------------------
// Utilitaires
// ---------------------------------------------------------------------------

/** Convertit une Date en minutes depuis minuit */
function toMinutesSinceMidnight(date) {
  const d = new Date(date)
  return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60
}

/** Determine the row index and fill color for a segment */
function getSegmentRow(seg) {
  if (seg.type === 'drive') return { row: 0, color: COLORS.drive }
  if (seg.type === 'stop') {
    if (seg.stopType === 'rest_stop') return { row: 3, color: COLORS.rest_stop }
    return { row: 1, color: COLORS.stop_work }
  }
  if (seg.type === 'break') {
    if (seg.isWorkBreak) return { row: 3, color: COLORS.break_work }
    return { row: 3, color: COLORS.break_drive }
  }
  if (seg.type === 'overnight_rest') return { row: 3, color: COLORS.overnight_rest }
  if (seg.type === 'wait') return { row: 2, color: '#0e7490' }  // disponibilité
  return null
}

// ---------------------------------------------------------------------------
// Grille 12h (0→12 ou 12→24)
// ---------------------------------------------------------------------------

function LicGrid12h({ segments, startHour, dayDate }) {
  const endHour = startHour + 12
  const TOTAL_CELLS = 12 * 4   // 48 cellules de 15 min
  const START_MIN = startHour * 60

  // Matrice d'occupation PLATE : occ[cell] = { row, color } | null
  // Un seul titulaire par cellule → pas de chevauchement visuel entre lignes
  const occ = new Array(TOTAL_CELLS).fill(null)

  for (const seg of segments) {
    if (!seg.startTime || !seg.endTime) continue
    const info = getSegmentRow(seg)
    if (!info) continue

    // Minutes depuis minuit (ce jour)
    const segStartMin = toMinutesSinceMidnight(seg.startTime)
    const segEndMin   = toMinutesSinceMidnight(seg.endTime)

    // Gérer le cas où le segment chevauche minuit (endTime < startTime en heures)
    const adjEnd = segEndMin < segStartMin ? segEndMin + 1440 : segEndMin

    // Clamp dans la plage de cette grille (startHour*60 → endHour*60)
    const clampStart = Math.max(segStartMin, START_MIN) - START_MIN
    const clampEnd   = Math.min(adjEnd, endHour * 60) - START_MIN
    if (clampEnd <= clampStart) continue

    const cellStart = Math.floor(clampStart / CELL_MINUTES)
    const cellEnd   = Math.ceil(clampEnd   / CELL_MINUTES)

    for (let c = cellStart; c < cellEnd && c < TOTAL_CELLS; c++) {
      if (c >= 0) occ[c] = { row: info.row, color: info.color }
    }
  }

  const ROW_H = 20   // px
  const ICON_W = 28  // px
  const TOTAL_H = 4 * ROW_H

  return (
    <div className="select-none">
      {/* Numéros d'heures */}
      <div className="flex" style={{ paddingLeft: ICON_W }}>
        {Array.from({ length: 13 }, (_, i) => (
          <div
            key={i}
            className="text-center font-mono text-muted border-l border-bg-border first:border-l-2 last:border-r-2"
            style={{
              width: `${100 / 12}%`,
              fontSize: 9,
              lineHeight: '16px',
              borderColor: i === 0 || i === 12 ? '#334155' : '#1e293b',
              flexShrink: 0,
            }}
          >
            {startHour + i}
          </div>
        ))}
      </div>

      {/* Corps de la grille */}
      <div
        className="flex border-2 border-bg-border rounded-sm overflow-hidden"
        style={{ height: TOTAL_H }}
      >
        {/* Colonne icônes */}
        <div className="flex flex-col flex-shrink-0 border-r-2 border-bg-border" style={{ width: ICON_W }}>
          {LIC_ROWS.map((row, ri) => (
            <div
              key={row.key}
              className="flex items-center justify-center border-b border-bg-border last:border-b-0"
              style={{ height: ROW_H, fontSize: 9, color: row.color }}
              title={row.label}
            >
              <span style={{ fontSize: 8, fontWeight: 700, color: '#64748b', marginRight: 2 }}>{row.num}</span>
              <span style={{ fontSize: 10 }}>{row.iconChar}</span>
            </div>
          ))}
        </div>

        {/* Cellules de données */}
        <div className="flex-1 relative" style={{ position: 'relative' }}>
          {/* Lignes horizontales entre les rows */}
          {[1, 2, 3].map(ri => (
            <div
              key={ri}
              style={{
                position: 'absolute', left: 0, right: 0,
                top: ri * ROW_H, height: 1,
                backgroundColor: '#334155', zIndex: 2,
              }}
            />
          ))}

          {/* Lignes verticales des heures */}
          {Array.from({ length: 13 }, (_, i) => (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: `${(i / 12) * 100}%`,
                top: 0, bottom: 0, width: i === 0 || i === 12 ? 2 : 1,
                backgroundColor: i === 0 || i === 12 ? '#334155' : '#1e293b',
                zIndex: i === 0 || i === 12 ? 3 : 1,
              }}
            />
          ))}

          {/* Lignes verticales des quarts d'heure */}
          {Array.from({ length: 48 }, (_, i) => {
            if (i % 4 === 0) return null  // déjà tracé par heure
            return (
              <div
                key={i}
                style={{
                  position: 'absolute',
                  left: `${(i / 48) * 100}%`,
                  top: 0, bottom: 0, width: 1,
                  backgroundColor: '#0f172a',
                  zIndex: 0,
                }}
              />
            )
          })}

          {/* Barres d'activité — on itère par ligne, chaque cellule n'appartient qu'à une ligne */}
          {Array.from({ length: 4 }, (_, rowIdx) => {
            // Regrouper les cellules consécutives appartenant à ce row (même couleur)
            const bars = []
            let i = 0
            while (i < TOTAL_CELLS) {
              if (occ[i]?.row === rowIdx) {
                const color = occ[i].color
                let j = i
                while (j < TOTAL_CELLS && occ[j]?.row === rowIdx && occ[j]?.color === color) j++
                bars.push({ start: i, end: j, color })
                i = j
              } else {
                i++
              }
            }
            return bars.map((bar, bi) => (
              <div
                key={`${rowIdx}-${bi}`}
                style={{
                  position: 'absolute',
                  left:   `${(bar.start / 48) * 100}%`,
                  width:  `${((bar.end - bar.start) / 48) * 100}%`,
                  top:    rowIdx * ROW_H + 1,
                  height: ROW_H - 1,
                  backgroundColor: bar.color,
                  opacity: 0.88,
                  zIndex: 4,
                }}
              />
            ))
          })}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Section par jour (entête + deux grilles 12h)
// ---------------------------------------------------------------------------

function DayFeuillet({ day, plateNumber }) {
  const segs = day.segments || []
  const restJour = day.restStart
    ? Math.round((new Date(day.restEnd) - new Date(day.restStart)) / 60_000)
    : 0

  const dateStr = day.startTime
    ? new Date(day.startTime).toLocaleDateString('fr-FR', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      })
    : `Jour ${day.number}`

  // Totaux
  const conduite = segs.filter(s => s.type === 'drive').reduce((t, s) => t + s.duration, 0)
  const travaux  = segs.filter(s => s.type === 'stop' && s.stopType !== 'rest_stop').reduce((t, s) => t + s.duration, 0)
  const pauses   = segs.filter(s => s.type === 'break').reduce((t, s) => t + s.duration, 0)

  // Tous les segments (du jour + repos éventuel)
  const allSegs = [...segs]
  if (day.restStart) {
    allSegs.push({
      type: 'overnight_rest', duration: restJour,
      startTime: day.restStart, endTime: day.restEnd,
    })
  }

  return (
    <div className="lic-day-section">
      {/* En-tête feuillet */}
      <div className="grid grid-cols-3 gap-2 mb-2 px-1">
        <div className="text-left">
          <div className="text-muted text-xs">N° immatriculation</div>
          <div className="font-mono font-bold text-text text-sm">{plateNumber || '—'}</div>
        </div>
        <div className="text-center">
          <div className="text-muted text-xs uppercase tracking-wider text-xs">Feuillet Quotidien</div>
          <div className="font-bold text-bright text-sm">Jour {day.number}</div>
        </div>
        <div className="text-right">
          <div className="text-muted text-xs">Jour et date</div>
          <div className="font-semibold text-text text-xs capitalize">{dateStr}</div>
        </div>
      </div>

      {/* Grille 0h–12h */}
      <LicGrid12h segments={allSegs} startHour={0} />

      {/* Grille 12h–24h */}
      <div className="mt-1">
        <LicGrid12h segments={allSegs} startHour={12} />
      </div>

      {/* Légende */}
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 px-1">
        {[
          { color: COLORS.drive,          label: '🚛 Conduite' },
          { color: COLORS.stop_work,      label: '⚒️ Travaux' },
          { color: COLORS.break_drive,    label: '☕ Pause cond.' },
          { color: COLORS.break_work,     label: '⏸️ Pause trav.' },
          { color: '#0e7490',             label: '⏳ Attente' },
          { color: COLORS.overnight_rest, label: '🌙 Repos j.' },
        ].map(({ color, label }) => (
          <div key={label} className="flex items-center gap-1 text-xs text-muted">
            <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: color, opacity: 0.9 }} />
            {label}
          </div>
        ))}
      </div>

      {/* Totaux journaliers */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2 bg-bg-elevated rounded-lg px-3 py-2">
        <TotalCell icon="🚛" label="Conduite"    value={conduite} color={COLORS.drive}          />
        <TotalCell icon="⚒️" label="Travaux"     value={travaux}  color={COLORS.stop_work}       />
        <TotalCell icon="☕" label="Pauses"      value={pauses}   color={COLORS.break_drive}     />
        {restJour > 0 && <TotalCell icon="🌙" label="Repos j." value={restJour} color={COLORS.overnight_rest} />}
      </div>
    </div>
  )
}

function TotalCell({ icon, label, value, color }) {
  if (!value) return null
  return (
    <div>
      <div className="text-muted text-xs">{icon} {label}</div>
      <div className="font-bold font-mono text-sm" style={{ color }}>{formatDuration(value)}</div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Composant principal
// ---------------------------------------------------------------------------

export default function LicCard({ days, plateNumber }) {
  const [open, setOpen] = useState(false)
  const printRef        = useRef(null)

  if (!days || days.length === 0) return null

  function handlePrint() {
    const content = printRef.current?.innerHTML
    if (!content) return
    const win = window.open('', '_blank', 'width=800,height=600')
    win.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Livret de Contrôle — ChronoRoute</title>
  <style>
    body { font-family: 'Arial', sans-serif; margin: 10mm; background: #fff; color: #000; }
    .lic-day-section { page-break-after: always; margin-bottom: 8mm; }
    .lic-day-section:last-child { page-break-after: auto; }
    /* Couleurs en noir/gris pour impression B&W */
    div[style*="background-color"] { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    /* Override dark theme colors */
    .text-muted, .text-sub { color: #555 !important; }
    .text-bright, .text-text { color: #000 !important; }
    .bg-bg-elevated { background: #f5f5f5 !important; }
    .border-bg-border { border-color: #ccc !important; }
  </style>
</head>
<body>
  <h2 style="text-align:center;font-size:14pt;margin-bottom:4mm">LIVRET INDIVIDUEL DE CONTRÔLE</h2>
  <p style="text-align:center;font-size:9pt;color:#555;margin-bottom:6mm">
    Trajet planifié via ChronoRoute — À titre indicatif
  </p>
  ${content}
  <p style="text-align:center;font-size:8pt;color:#888;margin-top:6mm">
    Généré le ${new Date().toLocaleDateString('fr-FR')} · ChronoRoute v1.0
  </p>
</body>
</html>`)
    win.document.close()
    setTimeout(() => { win.focus(); win.print() }, 400)
  }

  return (
    <div className="card overflow-hidden">
      {/* Barre de titre */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-bg-border">
        <button
          onClick={() => setOpen(o => !o)}
          className="flex items-center gap-2 hover:opacity-80 transition-opacity"
        >
          <BookOpen size={15} className="text-accent" />
          <span className="font-semibold text-bright text-sm">Livret Individuel de Contrôle</span>
          <span className="text-xs text-muted bg-bg-elevated px-2 py-0.5 rounded-full border border-bg-border">
            {days.length} jour{days.length > 1 ? 's' : ''}
          </span>
          {open ? <ChevronUp size={13} className="text-muted" /> : <ChevronDown size={13} className="text-muted" />}
        </button>

        {open && (
          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 text-xs text-accent hover:text-accent-light transition-colors font-medium"
            title="Télécharger PDF"
          >
            <Download size={13} />
            PDF
          </button>
        )}
      </div>

      {open && (
        <div className="p-4 space-y-6" ref={printRef}>
          {days.map((day, di) => (
            <DayFeuillet key={di} day={day} plateNumber={plateNumber} />
          ))}
        </div>
      )}
    </div>
  )
}
