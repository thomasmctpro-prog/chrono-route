import React, { useState, useEffect } from 'react'
import {
  Plus, Trash2, ChevronLeft, ChevronRight, AlertTriangle,
  Clock, TrendingUp, CalendarDays, Info, CheckCircle2,
} from 'lucide-react'
import {
  getWeeklyLog, saveWeeklyLog, getWeeklyStats, getCurrentWeekKey,
  getPreviousWeekKey, addDayEntry, removeDayEntry, getDefaultVehicle,
} from '../lib/storage.js'
import {
  formatDuration, usagePercent, usageBarColor, usageColor, minutesToHHMM, getRules,
} from '../lib/regulations.js'

const DAYS_FR = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche']

function getWeekDays(weekKey) {
  const start = new Date(weekKey)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start)
    d.setDate(d.getDate() + i)
    return d.toISOString().substring(0, 10)
  })
}

function formatWeekLabel(weekKey) {
  const start = new Date(weekKey)
  const end = new Date(weekKey)
  end.setDate(end.getDate() + 6)
  return `${start.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })} — ${end.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}`
}

export default function WeeklyLogPage({ settings }) {
  const currentWk = getCurrentWeekKey()
  const [weekKey, setWeekKey] = useState(currentWk)
  const [stats, setStats] = useState(null)
  const [addingDay, setAddingDay] = useState(null)
  const [form, setForm] = useState({ driveMinutes: '', workMinutes: '', extendedDay: false, reducedRest: false, notes: '' })

  const vehicle = getDefaultVehicle()
  const rules = getRules(vehicle?.type || 'pl')
  const isCurrentWeek = weekKey === currentWk
  const todayKey = new Date().toISOString().substring(0, 10)

  function reload() {
    setStats(getWeeklyStats(weekKey))
  }

  useEffect(() => { reload() }, [weekKey])

  function prevWeek() {
    const d = new Date(weekKey)
    d.setDate(d.getDate() - 7)
    setWeekKey(d.toISOString().substring(0, 10))
  }

  function nextWeek() {
    const d = new Date(weekKey)
    d.setDate(d.getDate() + 7)
    const nwk = d.toISOString().substring(0, 10)
    if (nwk <= currentWk) setWeekKey(nwk)
  }

  function openAddDay(dateStr) {
    const existing = stats?.days[dateStr]
    setAddingDay(dateStr)
    setForm({
      driveMinutes: existing?.driveMinutes ? Math.round(existing.driveMinutes) : '',
      workMinutes: existing?.workMinutes ? Math.round(existing.workMinutes) : '',
      extendedDay: existing?.extendedDay || false,
      reducedRest: existing?.reducedRest || false,
      notes: existing?.notes || '',
    })
  }

  function handleSaveDay() {
    if (!addingDay) return
    addDayEntry({
      date: addingDay,
      driveMinutes: Number(form.driveMinutes) || 0,
      workMinutes: Number(form.workMinutes) || 0,
      extendedDay: form.extendedDay,
      reducedRest: form.reducedRest,
      notes: form.notes,
    })
    setAddingDay(null)
    reload()
  }

  function handleDeleteDay(dateStr) {
    removeDayEntry(dateStr)
    reload()
  }

  function hoursInput(val) {
    // Convertit "5.5" ou "5:30" en minutes
    const s = String(val).trim()
    if (s.includes(':')) {
      const [h, m] = s.split(':').map(Number)
      return (h || 0) * 60 + (m || 0)
    }
    return Math.round(parseFloat(s) * 60)
  }

  if (!stats) return <div className="text-muted text-center py-10">Chargement…</div>

  const weekDays = getWeekDays(weekKey)
  const totalDrive = stats.totalDriveMinutes
  const biweekly = stats.biweeklyDriveMinutes
  const pctWeekly = usagePercent(totalDrive, rules.maxWeeklyDrive)
  const pctBiweekly = usagePercent(biweekly, rules.maxBiweeklyDrive)

  return (
    <div className="space-y-5 slide-up">
      <div>
        <h1 className="section-title">Mon solde d'heures</h1>
        <p className="text-muted text-sm mt-1">Suivi réglementaire {rules.name}</p>
      </div>

      {/* Navigation semaine */}
      <div className="flex items-center justify-between card px-4 py-3">
        <button onClick={prevWeek} className="btn-ghost p-2">
          <ChevronLeft size={18} />
        </button>
        <div className="text-center">
          <div className="text-bright font-semibold text-sm">
            {isCurrentWeek ? 'Semaine en cours' : 'Semaine passée'}
          </div>
          <div className="text-muted text-xs">{formatWeekLabel(weekKey)}</div>
        </div>
        <button
          onClick={nextWeek}
          disabled={isCurrentWeek}
          className="btn-ghost p-2 disabled:opacity-30"
        >
          <ChevronRight size={18} />
        </button>
      </div>

      {/* Gauges hebdo */}
      <div className="card p-4 space-y-4">
        <h3 className="font-semibold text-bright text-sm flex items-center gap-2">
          <TrendingUp size={15} className="text-accent" />
          Utilisation des quotas
        </h3>

        <GaugeRow
          label="Conduite hebdo"
          used={totalDrive}
          max={rules.maxWeeklyDrive}
          article="Art. 6(2) — max 56h"
          percent={pctWeekly}
        />
        <GaugeRow
          label="Bihebdomadaire"
          used={biweekly}
          max={rules.maxBiweeklyDrive}
          article="Art. 6(3) — max 90h sur 2 sem."
          percent={pctBiweekly}
        />

        <div className="grid grid-cols-2 gap-3 pt-1">
          <div className="bg-bg-elevated rounded-lg p-3">
            <div className="text-xs text-muted mb-1">Jours en dérogation 10h</div>
            <div className={`text-xl font-bold ${stats.extendedDaysCount >= rules.maxExtendedPerWeek ? 'text-danger' : 'text-text'}`}>
              {stats.extendedDaysCount}
              <span className="text-muted text-sm font-normal"> / {rules.maxExtendedPerWeek}</span>
            </div>
            <div className="text-muted text-xs mt-1">Art. 6(1)</div>
          </div>
          <div className="bg-bg-elevated rounded-lg p-3">
            <div className="text-xs text-muted mb-1">Repos réduits (9h)</div>
            <div className={`text-xl font-bold ${stats.reducedRestCount >= rules.maxReducedRestPerWeek ? 'text-danger' : 'text-text'}`}>
              {stats.reducedRestCount}
              <span className="text-muted text-sm font-normal"> / {rules.maxReducedRestPerWeek}</span>
            </div>
            <div className="text-muted text-xs mt-1">Art. 8(1)</div>
          </div>
        </div>

        {/* Alertes */}
        {pctWeekly >= 85 && (
          <div className="flex items-start gap-2 bg-pause/10 border border-pause/30 rounded-lg px-3 py-2.5">
            <AlertTriangle size={14} className="text-pause mt-0.5 shrink-0" />
            <div className="text-xs text-pause">
              {pctWeekly >= 100
                ? 'Limite hebdomadaire atteinte — aucune conduite supplémentaire autorisée cette semaine'
                : `Attention : ${formatDuration(rules.maxWeeklyDrive - totalDrive)} restants cette semaine`
              }
            </div>
          </div>
        )}
      </div>

      {/* Journal journalier */}
      <div className="card p-4">
        <h3 className="font-semibold text-bright text-sm mb-3 flex items-center gap-2">
          <CalendarDays size={15} className="text-accent" />
          Journal de la semaine
        </h3>

        <div className="space-y-2">
          {weekDays.map((dateStr, idx) => {
            const entry = stats.days[dateStr]
            const isToday = dateStr === todayKey
            const dayName = DAYS_FR[idx]
            const dateLabel = new Date(dateStr + 'T12:00:00').toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })
            const isFuture = dateStr > todayKey

            return (
              <div
                key={dateStr}
                className={`rounded-xl border transition-colors ${
                  isToday
                    ? 'border-accent/40 bg-accent/5'
                    : entry
                      ? 'border-bg-border bg-bg-elevated'
                      : 'border-bg-border/50 bg-bg-elevated/50'
                }`}
              >
                <div className="flex items-center justify-between px-3 py-2.5">
                  <div className="flex items-center gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-medium ${isToday ? 'text-accent' : 'text-text'}`}>
                          {dayName}
                        </span>
                        {isToday && (
                          <span className="badge bg-accent/15 text-accent text-xs">Aujourd'hui</span>
                        )}
                      </div>
                      <div className="text-xs text-muted">{dateLabel}</div>
                    </div>
                    {entry && (
                      <div className="flex items-center gap-3 ml-2">
                        <div className="text-xs">
                          <span className="text-drive font-medium">{formatDuration(entry.driveMinutes)}</span>
                          <span className="text-muted"> conduite</span>
                        </div>
                        {entry.extendedDay && (
                          <span className="badge bg-pause/15 text-pause">Dérog. 10h</span>
                        )}
                        {entry.reducedRest && (
                          <span className="badge bg-blue-500/15 text-blue-400">Repos 9h</span>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-1">
                    {!isFuture && (
                      <button
                        onClick={() => openAddDay(dateStr)}
                        className={`btn-ghost p-1.5 ${entry ? 'text-accent' : ''}`}
                        title={entry ? 'Modifier' : 'Ajouter'}
                      >
                        {entry ? '✏️' : <Plus size={14} />}
                      </button>
                    )}
                    {entry && (
                      <button
                        onClick={() => handleDeleteDay(dateStr)}
                        className="btn-ghost p-1.5 text-danger/70 hover:text-danger"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Formulaire d'ajout */}
                {addingDay === dateStr && (
                  <div className="border-t border-bg-border px-3 py-3 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="label">Conduite (heures)</label>
                        <input
                          type="number"
                          min="0" max="14" step="0.25"
                          placeholder="ex: 8.5 ou 8:30"
                          value={form.driveMinutes ? (form.driveMinutes / 60).toFixed(2) : ''}
                          onChange={e => setForm(f => ({ ...f, driveMinutes: Math.round(parseFloat(e.target.value) * 60) || 0 }))}
                          className="input-field"
                        />
                      </div>
                      <div>
                        <label className="label">Temps de travail (h)</label>
                        <input
                          type="number"
                          min="0" max="15" step="0.25"
                          placeholder="ex: 10"
                          value={form.workMinutes ? (form.workMinutes / 60).toFixed(2) : ''}
                          onChange={e => setForm(f => ({ ...f, workMinutes: Math.round(parseFloat(e.target.value) * 60) || 0 }))}
                          className="input-field"
                        />
                      </div>
                    </div>

                    <div className="flex gap-4">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={form.extendedDay}
                          onChange={e => setForm(f => ({ ...f, extendedDay: e.target.checked }))}
                          className="w-4 h-4 accent-orange-500"
                        />
                        <span className="text-sm text-sub">Dérogation 10h utilisée</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={form.reducedRest}
                          onChange={e => setForm(f => ({ ...f, reducedRest: e.target.checked }))}
                          className="w-4 h-4 accent-blue-500"
                        />
                        <span className="text-sm text-sub">Repos réduit (9h)</span>
                      </label>
                    </div>

                    <div>
                      <label className="label">Notes (optionnel)</label>
                      <input
                        type="text"
                        placeholder="Observations, incidents…"
                        value={form.notes}
                        onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                        className="input-field"
                      />
                    </div>

                    <div className="flex gap-2">
                      <button onClick={handleSaveDay} className="btn-primary flex-1">
                        Enregistrer
                      </button>
                      <button onClick={() => setAddingDay(null)} className="btn-secondary">
                        Annuler
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Info réglementaire */}
      <div className="card p-4 space-y-3">
        <h3 className="font-semibold text-bright text-sm flex items-center gap-2">
          <Info size={14} className="text-blue-400" />
          Rappel réglementaire
        </h3>
        <div className="space-y-2 text-xs text-sub">
          {[
            { label: 'Pause obligatoire', value: 'Après 4h30 de conduite continue → 45 min (ou 15 + 30 min)' },
            { label: 'Conduite journalière', value: '9h/jour — dérogation 10h max 2×/semaine' },
            { label: 'Repos journalier', value: '11h minimum — réduit à 9h max 3×/semaine' },
            { label: 'Conduite hebdomadaire', value: '56h max' },
            { label: 'Conduite bihebdomadaire', value: '90h max sur 2 semaines' },
            { label: 'Repos hebdomadaire', value: '45h minimum (réduit à 24h, alternativement)' },
          ].map(({ label, value }) => (
            <div key={label} className="flex gap-2">
              <span className="text-accent font-medium shrink-0">•</span>
              <div>
                <span className="text-text font-medium">{label} : </span>
                <span>{value}</span>
              </div>
            </div>
          ))}
          <div className="text-muted text-xs mt-2 pt-2 border-t border-bg-border">
            Source : Règlement UE n° 561/2006 du Parlement européen
          </div>
        </div>
      </div>
    </div>
  )
}

function GaugeRow({ label, used, max, article, percent }) {
  const barColor = usageBarColor(percent)
  const textColor = usageColor(percent)
  const usedH = Math.floor(used / 60)
  const usedM = used % 60
  const maxH = Math.floor(max / 60)

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <div>
          <span className="text-text text-sm font-medium">{label}</span>
          <span className="text-muted text-xs ml-2">{article}</span>
        </div>
        <span className={`font-mono text-sm font-bold ${textColor}`}>
          {usedH}h{String(usedM).padStart(2, '0')} / {maxH}h
        </span>
      </div>
      <div className="h-3 bg-bg-elevated rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${barColor}`}
          style={{ width: `${Math.min(100, percent)}%` }}
        />
      </div>
      <div className="flex justify-end mt-0.5">
        <span className={`text-xs font-medium ${textColor}`}>{percent}%</span>
      </div>
    </div>
  )
}
