import React, { useState, useEffect, useCallback, useRef } from 'react'
import {
  ArrowRight, Clock, ChevronDown, ChevronUp, Loader2, RefreshCw,
  Zap, CalendarClock, ArrowRightLeft, AlertCircle, CheckCircle2,
  Info, Coffee, Lightbulb, BookCheck, Plus, X, GripVertical,
  Moon, Truck, MapPin, Package, Fuel, Wrench,
} from 'lucide-react'
import AddressInput from '../components/AddressInput.jsx'
import TripTimeline from '../components/TripTimeline.jsx'
import ComplianceBadges from '../components/ComplianceBadges.jsx'
import MapView from '../components/MapView.jsx'
import FuelEstimate from '../components/FuelEstimate.jsx'
import { planMultiLegTrip, STOP_TYPES } from '../lib/calculator.js'
import { getRouteDuration } from '../lib/api.js'
import {
  getDefaultVehicle, getVehicles, getWeeklyStats,
  addTripToHistory, addDayEntry, getWeeklyLog,
  savePlannerForm, getPlannerForm, getSettings,
} from '../lib/storage.js'
import {
  VEHICLE_TYPES, formatTime, formatDuration, getVehicleType, getRules,
} from '../lib/regulations.js'

const REC_ICONS = { success: CheckCircle2, warning: AlertCircle, error: AlertCircle, info: Lightbulb }
const REC_COLORS = { success: 'text-drive', warning: 'text-pause', error: 'text-danger', info: 'text-blue-400' }

function newStop() {
  return { id: `s_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, place: null, type: 'delivery', duration: 20 }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function todayStr() { return new Date().toISOString().substring(0, 10) }
function formatDateShort(date) {
  if (!date) return ''
  return new Date(date).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })
}

// ---------------------------------------------------------------------------
// Page principale
// ---------------------------------------------------------------------------
export default function PlannerPage({ settings }) {
  // Charger le formulaire sauvegardé ou valeurs par défaut
  const savedForm = getPlannerForm()

  const [origin, setOrigin] = useState(savedForm?.origin || null)
  const [dest, setDest] = useState(savedForm?.dest || null)
  const [stops, setStops] = useState(savedForm?.stops || [])
  const [mode, setMode] = useState(savedForm?.mode || 'arrival')
  const [targetDate, setTargetDate] = useState(savedForm?.targetDate || todayStr())
  const [targetTimeStr, setTargetTimeStr] = useState(savedForm?.targetTimeStr || '08:00')
  const [vehicleTypeId, setVehicleTypeId] = useState(savedForm?.vehicleTypeId || 'pl')
  const [buffer, setBuffer] = useState(savedForm?.buffer ?? settings?.defaultBufferMinutes ?? 15)
  const [breakStrategy, setBreakStrategy] = useState(savedForm?.breakStrategy || settings?.defaultBreakStrategy || 'single')
  const [useDerogations, setUseDerogations] = useState(savedForm?.useDerogations ?? settings?.useDerogations ?? true)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [useDailyCarryOver, setUseDailyCarryOver] = useState(false)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)

  const rules = getRules(vehicleTypeId)

  // --- Sauvegarde automatique du formulaire ---
  const saveFormRef = useRef(null)
  useEffect(() => {
    clearTimeout(saveFormRef.current)
    saveFormRef.current = setTimeout(() => {
      savePlannerForm({ origin, dest, stops, mode, targetDate, targetTimeStr, vehicleTypeId, buffer, breakStrategy, useDerogations })
    }, 500)
    return () => clearTimeout(saveFormRef.current)
  }, [origin, dest, stops, mode, targetDate, targetTimeStr, vehicleTypeId, buffer, breakStrategy, useDerogations])

  // --- Stats conducteur ---
  const weekStats = getWeeklyStats()
  const todayKey = new Date().toISOString().substring(0, 10)
  const todayEntry = weekStats.days[todayKey]
  const dailyCarryOver = useDailyCarryOver ? (todayEntry?.driveMinutes || 0) : 0

  // --- Ajout / suppression d'arrêts ---
  function addStop() { setStops(s => [...s, newStop()]); setResult(null) }
  function removeStop(id) { setStops(s => s.filter(st => st.id !== id)); setResult(null) }
  function updateStop(id, patch) { setStops(s => s.map(st => st.id === id ? { ...st, ...patch } : st)); setResult(null) }

  function handleSwap() { const t = origin; setOrigin(dest); setDest(t); setResult(null) }
  function handleModeToggle() { setMode(m => m === 'arrival' ? 'departure' : 'arrival'); setResult(null) }

  // --- Calcul ---
  async function handleCalculate() {
    if (!origin || !dest) { setError("Veuillez saisir le départ et l'arrivée."); return }
    const incompleteStop = stops.find(s => !s.place)
    if (incompleteStop) { setError("Complétez tous les arrêts ou supprimez ceux sans adresse."); return }

    setError(null)
    setLoading(true)
    setResult(null)

    try {
      // Construire la liste des waypoints
      const waypoints = [origin, ...stops.map(s => s.place), dest]

      // Facteur vitesse selon le type de véhicule
      const SPEED_FACTORS = { pl: 0.78, vul: 1.0, bus: 0.88 }
      const factor = SPEED_FACTORS[vehicleTypeId] || 0.78

      // Calcul en parallèle de tous les tronçons
      const legResults = await Promise.all(
        waypoints.slice(0, -1).map((wp, i) =>
          getRouteDuration(
            { lat: wp.lat, lon: wp.lon },
            { lat: waypoints[i + 1].lat, lon: waypoints[i + 1].lon },
            1.0 // toujours demander le temps voiture, on applique le facteur ensuite
          )
        )
      )

      // Construire les legs avec le facteur véhicule
      const legs = legResults.map((legRes, i) => ({
        driveMinutes: Math.round(legRes.durationMinutes / factor),
        distanceKm: legRes.distanceKm,
        stopDurationMinutes: i < stops.length ? (stops[i].duration || 0) : 0,
        stopLabel: i < stops.length ? (stops[i].place?.shortLabel || `Arrêt ${i + 1}`) : '',
        stopType: i < stops.length ? stops[i].type : 'other',
        routeSource: legRes.source,
        routeWarning: legRes.warning,
      }))

      const totalDistanceKm = Math.round(legs.reduce((s, l) => s + (l.distanceKm || 0), 0))
      const totalRawDrive = legs.reduce((s, l) => s + l.driveMinutes, 0)
      const hasWarning = legs.some(l => l.routeWarning)

      // Géométries de tracé (GeoJSON → carte)
      const geometries = legResults.map(lr => lr.geometry || null)

      // Données carburant
      const fuelDefaults = { pl: 30, vul: 10, bus: 25 }
      const allVehicles = getVehicles()
      const matchVehicle = allVehicles.find(v => v.type === vehicleTypeId && v.isDefault)
        || allVehicles.find(v => v.type === vehicleTypeId)
      const fuelConsumption = matchVehicle?.fuelConsumption ?? fuelDefaults[vehicleTypeId] ?? 30
      const { fuelPrice = 1.65 } = getSettings()

      const targetTime = new Date(`${targetDate}T${targetTimeStr}:00`)

      const plan = planMultiLegTrip({
        legs,
        vehicleTypeId,
        mode,
        targetTime,
        bufferMinutes: buffer,
        breakStrategy,
        useDerogations,
        driverState: {
          dailyDriveMinutes: dailyCarryOver,
          continuousMinutesSinceBreak: 0,
          weeklyDriveMinutes: weekStats.totalDriveMinutes,
          biweeklyDriveMinutes: weekStats.biweeklyDriveMinutes,
          extendedDaysThisWeek: weekStats.extendedDaysCount,
        },
      })

      const vt = getVehicleType(vehicleTypeId)
      setResult({
        ...plan,
        totalDistanceKm,
        totalRawDrive,
        legs,
        hasApiWarning: hasWarning,
        vehicleTypeId,
        originLabel: origin.shortLabel,
        destLabel: dest.shortLabel,
        stopsLabels: stops.map(s => s.place?.shortLabel || '?'),
        vehicleSpeedMax: rules.maxSpeedHighway,
        vehicleLabel: vt?.label,
        waypoints,
        geometries,
        fuelConsumption,
        fuelPrice,
      })

      addTripToHistory({
        ...plan,
        distanceKm: totalDistanceKm,
        vehicleTypeId,
        originLabel: origin.shortLabel,
        destLabel: dest.shortLabel,
      })
    } catch (e) {
      console.error(e)
      setError('Erreur lors du calcul. Vérifiez votre connexion et réessayez.')
    } finally {
      setLoading(false)
    }
  }

  const vt = getVehicleType(vehicleTypeId)

  return (
    <div className="space-y-4 slide-up">
      <div>
        <h1 className="section-title">Planifier mon trajet</h1>
        <p className="text-muted text-sm mt-1">
          {vt?.emoji} {vt?.label} — {vt?.regulation} — max {rules.maxSpeedHighway} km/h autoroute
        </p>
      </div>

      <div className="card p-4 space-y-4">
        {/* Type de véhicule */}
        <div>
          <label className="label">Véhicule</label>
          <div className="flex gap-2 flex-wrap">
            {VEHICLE_TYPES.map(v => (
              <button
                key={v.id}
                onClick={() => { setVehicleTypeId(v.id); setResult(null) }}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors
                  ${vehicleTypeId === v.id
                    ? 'border-accent bg-accent/10 text-accent'
                    : 'border-bg-border bg-bg-elevated text-sub hover:text-text'}`}
              >
                <span>{v.emoji}</span>
                <span>{v.label}</span>
              </button>
            ))}
          </div>
          {vehicleTypeId && (
            <div className="flex gap-4 mt-2 text-xs text-muted">
              <span>🛣️ Autoroute : <strong className="text-sub">{rules.maxSpeedHighway} km/h</strong></span>
              <span>🏠 Route : <strong className="text-sub">{rules.maxSpeedRoad} km/h</strong></span>
              <span>⏱ Max journalier : <strong className="text-sub">{rules.maxDailyDriveExtended / 60}h</strong></span>
            </div>
          )}
        </div>

        {/* Itinéraire avec multi-arrêts */}
        <div>
          <label className="label">Itinéraire</label>
          <div className="space-y-1.5">
            {/* Départ */}
            <div className="flex items-center gap-2">
              <div className="flex flex-col items-center gap-0.5 self-stretch pt-2">
                <div className="w-3 h-3 rounded-full bg-drive border-2 border-bg-base flex-shrink-0" />
                {(stops.length > 0) && <div className="w-px flex-1 bg-bg-border min-h-[12px]" />}
              </div>
              <div className="flex-1">
                <AddressInput
                  value={origin}
                  onChange={v => { setOrigin(v); setResult(null) }}
                  placeholder="Départ…"
                />
              </div>
            </div>

            {/* Arrêts intermédiaires */}
            {stops.map((stop, i) => {
              const stopInfo = STOP_TYPES.find(s => s.id === stop.type) || STOP_TYPES[0]
              return (
                <div key={stop.id}>
                  <div className="flex items-center gap-2">
                    <div className="flex flex-col items-center gap-0.5 self-stretch">
                      <div className="w-px flex-none bg-bg-border h-1.5 ml-1" />
                      <div className="w-3 h-3 rounded-full bg-accent border-2 border-bg-base flex-shrink-0" />
                      <div className="w-px flex-1 bg-bg-border min-h-[12px] ml-0" />
                    </div>
                    <div className="flex-1 space-y-1.5 py-1">
                      <AddressInput
                        value={stop.place}
                        onChange={v => { updateStop(stop.id, { place: v }); setResult(null) }}
                        placeholder={`Arrêt ${i + 1}…`}
                      />
                      <div className="flex gap-2 items-center">
                        <select
                          value={stop.type}
                          onChange={e => {
                            const newType = e.target.value
                            const defaultDur = STOP_TYPES.find(s => s.id === newType)?.defaultDuration || 20
                            updateStop(stop.id, { type: newType, duration: defaultDur })
                          }}
                          className="input-field text-sm flex-1"
                        >
                          {STOP_TYPES.map(s => (
                            <option key={s.id} value={s.id}>{s.icon} {s.label}</option>
                          ))}
                        </select>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <input
                            type="number"
                            min={0}
                            max={480}
                            step={5}
                            value={stop.duration}
                            onChange={e => updateStop(stop.id, { duration: +e.target.value })}
                            className="input-field w-20 text-sm text-center"
                          />
                          <span className="text-muted text-xs">min</span>
                        </div>
                        <button onClick={() => removeStop(stop.id)} className="btn-ghost p-1.5 text-danger/60 hover:text-danger">
                          <X size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}

            {/* Destination */}
            <div className="flex items-center gap-2">
              <div className="flex flex-col items-center gap-0.5 self-stretch pt-1">
                {(stops.length > 0) && <div className="w-px flex-none bg-bg-border h-1.5 ml-1" />}
                <div className="w-3 h-3 rounded-full bg-danger border-2 border-bg-base flex-shrink-0" />
              </div>
              <div className="flex-1">
                <AddressInput
                  value={dest}
                  onChange={v => { setDest(v); setResult(null) }}
                  placeholder="Destination…"
                />
              </div>
            </div>
          </div>

          {/* Boutons sous l'itinéraire */}
          <div className="flex gap-2 mt-2">
            <button
              onClick={addStop}
              className="flex items-center gap-1.5 text-sm text-accent hover:text-accent-light transition-colors font-medium"
            >
              <Plus size={14} />
              Ajouter un arrêt
            </button>
            {(origin || dest) && (
              <button
                onClick={handleSwap}
                className="ml-auto flex items-center gap-1.5 text-xs text-muted hover:text-sub transition-colors"
              >
                <ArrowRightLeft size={12} />
                Inverser
              </button>
            )}
          </div>
        </div>

        {/* Mode + heure cible */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="label mb-0">
              {mode === 'arrival' ? "Heure d'arrivée souhaitée" : "Heure de départ prévue"}
            </label>
            <button onClick={handleModeToggle} className="text-accent text-xs font-medium flex items-center gap-1 hover:text-accent-light">
              <RefreshCw size={11} />
              {mode === 'arrival' ? 'Calculer depuis départ' : 'Calculer depuis arrivée'}
            </button>
          </div>
          <div className="flex gap-2">
            <input type="date" value={targetDate} min={todayStr()}
              onChange={e => { setTargetDate(e.target.value); setResult(null) }}
              className="input-field flex-1" />
            <input type="time" value={targetTimeStr}
              onChange={e => { setTargetTimeStr(e.target.value); setResult(null) }}
              className="input-field w-28" />
          </div>
          {mode === 'arrival' && (
            <p className="text-muted text-xs mt-1.5 flex items-center gap-1">
              <CalendarClock size={11} />
              L'heure de départ optimale sera calculée automatiquement
            </p>
          )}
        </div>

        {/* Marge — jusqu'à 3h */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="label mb-0">Marge de sécurité</label>
            <span className="text-accent font-bold text-sm">{formatBufferLabel(buffer)}</span>
          </div>
          <input
            type="range" min={0} max={180} step={5}
            value={buffer}
            onChange={e => { setBuffer(+e.target.value); setResult(null) }}
            className="w-full accent-orange-500"
          />
          <div className="flex justify-between text-muted text-xs mt-1">
            {[0, 15, 30, 60, 90, 120, 180].map(v => (
              <button key={v} onClick={() => { setBuffer(v); setResult(null) }}
                className={`text-xs transition-colors ${buffer === v ? 'text-accent font-bold' : 'hover:text-sub'}`}>
                {v === 0 ? '0' : v < 60 ? `${v}min` : v === 60 ? '1h' : v === 90 ? '1h30' : v === 120 ? '2h' : '3h'}
              </button>
            ))}
          </div>
          {buffer > 0 && (
            <p className="text-muted text-xs mt-1">
              Vous arriverez <strong className="text-sub">{formatBufferLabel(buffer)} en avance</strong> sur l'heure cible
            </p>
          )}
        </div>

        {/* Avancé */}
        <div>
          <button onClick={() => setAdvancedOpen(o => !o)}
            className="flex items-center gap-2 text-sub text-sm hover:text-text transition-colors">
            {advancedOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            Options avancées
          </button>

          {advancedOpen && (
            <div className="mt-3 space-y-4 pl-2 border-l-2 border-bg-border">
              {/* Stratégie pause */}
              <div>
                <label className="label">Stratégie de pause conduite</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'single', label: 'Pause unique 45 min', desc: 'Après 4h30 de conduite' },
                    { id: 'split', label: 'Fractionnée 15+30', desc: 'Arrêt à mi-chemin recommandé' },
                  ].map(opt => (
                    <button key={opt.id}
                      onClick={() => { setBreakStrategy(opt.id); setResult(null) }}
                      className={`p-3 rounded-lg border text-left transition-colors ${
                        breakStrategy === opt.id ? 'border-accent bg-accent/10' : 'border-bg-border bg-bg-elevated hover:bg-bg-border'}`}>
                      <div className="text-sm font-medium text-bright">{opt.label}</div>
                      <div className="text-xs text-muted mt-0.5">{opt.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Dérogations */}
              <ToggleRow
                label="Dérogations (10h/jour, repos 9h)"
                desc={`Autorisé : 2× dérogation 10h/sem, 3× repos 9h entre repos hebdo`}
                value={useDerogations}
                onChange={v => { setUseDerogations(v); setResult(null) }}
              />

              {/* Temps déjà conduit */}
              <ToggleRow
                label="Inclure le temps déjà conduit aujourd'hui"
                desc={todayEntry ? `${formatDuration(todayEntry.driveMinutes)} déjà enregistrés` : 'Aucune entrée ce jour dans Mon solde'}
                value={useDailyCarryOver && !!todayEntry}
                onChange={v => { setUseDailyCarryOver(v); setResult(null) }}
                disabled={!todayEntry}
              />
            </div>
          )}
        </div>

        {/* Erreur */}
        {error && (
          <div className="flex items-center gap-2 text-danger text-sm bg-danger/10 border border-danger/30 rounded-lg px-3 py-2.5">
            <AlertCircle size={14} className="shrink-0" />
            {error}
          </div>
        )}

        {/* Calculer */}
        <button
          onClick={handleCalculate}
          disabled={loading || !origin || !dest}
          className="btn-primary w-full flex items-center justify-center gap-2 py-3 text-base disabled:opacity-50"
        >
          {loading
            ? <><Loader2 size={18} className="animate-spin" /> Calcul en cours…</>
            : <><Zap size={18} /> Calculer l'itinéraire</>
          }
        </button>
      </div>

      {/* Résultats */}
      {result && <TripResult result={result} mode={mode} buffer={buffer} />}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Résultats
// ---------------------------------------------------------------------------

function TripResult({ result, mode, buffer }) {
  const [showAlternative, setShowAlternative] = useState(false)
  const [mapOpen, setMapOpen] = useState(true)
  const [loggedToday, setLoggedToday] = useState(() => {
    const todayKey = new Date().toISOString().substring(0, 10)
    const log = getWeeklyLog()
    return !!(log?.days?.[todayKey])
  })

  const {
    departure, arrival, totalDriveMinutes, totalBreakMinutes, totalStopMinutes,
    totalRestMinutes, totalTripMinutes, totalWithBuffer,
    segments, timeline, days, compliance, recommendations,
    totalDistanceKm, hasApiWarning, vehicleTypeId, originLabel, destLabel,
    stopsLabels, vehicleSpeedMax, vehicleLabel, isMultiDay, legs,
    waypoints, geometries, fuelConsumption, fuelPrice,
  } = result

  function handleMarkDone() {
    const dateKey = new Date(departure).toISOString().substring(0, 10)
    const log = getWeeklyLog()
    const existing = log?.days?.[dateKey]
    const prevDrive = existing?.driveMinutes || 0
    addDayEntry({
      date: dateKey,
      driveMinutes: prevDrive + totalDriveMinutes,
      workMinutes: existing?.workMinutes || (prevDrive + totalDriveMinutes),
      extendedDay: (prevDrive + totalDriveMinutes) > 540,
      reducedRest: existing?.reducedRest || false,
      notes: existing?.notes
        ? `${existing.notes} | +${Math.round(totalDriveMinutes / 60 * 10) / 10}h`
        : `${Math.round(totalDriveMinutes / 60 * 10) / 10}h — ${originLabel} → ${destLabel}`,
    })
    setLoggedToday(true)
  }

  const vt = getVehicleType(vehicleTypeId)

  return (
    <div className="space-y-4 slide-up">
      {/* Carte principale */}
      <div className="card p-5">
        {/* Itinéraire */}
        <div className="flex items-center gap-1 text-sub text-sm mb-4 flex-wrap">
          <span className="text-bright font-medium">{originLabel}</span>
          {stopsLabels.map((l, i) => (
            <React.Fragment key={i}>
              <ArrowRight size={12} className="text-accent flex-shrink-0" />
              <span className="text-accent font-medium">{l}</span>
            </React.Fragment>
          ))}
          <ArrowRight size={12} className="text-accent flex-shrink-0" />
          <span className="text-bright font-medium">{destLabel}</span>
        </div>

        {/* Horaires */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          <TimeCard
            label="Départ"
            time={departure}
            highlighted={mode === 'departure'}
            prefix={mode === 'arrival' ? 'Partir à' : undefined}
          />
          <TimeCard
            label={`Arrivée${buffer > 0 ? ` (+${formatBufferLabel(buffer)})` : ''}`}
            time={arrival}
            highlighted={mode === 'arrival'}
          />
        </div>

        {/* Bannière départ recommandé */}
        {mode === 'arrival' && (
          <div className="bg-accent/5 border border-accent/20 rounded-lg px-4 py-3 mb-4">
            <div className="flex items-center gap-2">
              <Clock size={16} className="text-accent" />
              <span className="text-bright font-semibold">
                Partez à <span className="text-accent text-xl">{formatTime(departure)}</span>
                {isMultiDay && <span className="text-sub text-sm ml-2">(Jour 1)</span>}
              </span>
            </div>
            {isMultiDay && (
              <p className="text-pause text-xs mt-1 flex items-center gap-1">
                <Moon size={11} />
                Trajet sur {days.length} jours — repos journalier intercalé
              </p>
            )}
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatCell icon="🛣️" label="Distance" value={totalDistanceKm ? `${totalDistanceKm} km` : '—'} />
          <StatCell icon="🚛" label="Conduite" value={formatDuration(totalDriveMinutes)} color="text-drive" />
          <StatCell icon="☕" label={`${segments.filter(s => s.type === 'break').length} pause(s)`}
            value={totalBreakMinutes > 0 ? formatDuration(totalBreakMinutes) : 'Aucune'} color="text-pause" />
          {totalStopMinutes > 0 && (
            <StatCell icon="📦" label={`${legs.length - 1} arrêt(s)`} value={formatDuration(totalStopMinutes)} color="text-accent" />
          )}
          {isMultiDay && (
            <StatCell icon="🌙" label="Repos inter-jour" value={formatDuration(totalRestMinutes)} color="text-blue-400" />
          )}
          {days.length > 1 && (
            <StatCell icon="📅" label="Nombre de jours" value={`${days.length} jours`} color="text-blue-400" />
          )}
        </div>

        {/* Note véhicule */}
        <div className="mt-3 flex flex-wrap gap-3 text-xs">
          <div className="flex items-center gap-1 text-muted">
            <Truck size={11} />
            <span>{vehicleLabel} — max {vehicleSpeedMax} km/h autoroute — temps calculé en conséquence</span>
          </div>
          {hasApiWarning && (
            <div className="flex items-center gap-1 text-pause">
              <AlertCircle size={11} />
              <span>Estimation approximative (vérifiez la connexion)</span>
            </div>
          )}
        </div>

        {/* Bouton marquer effectué */}
        <div className="mt-4 pt-4 border-t border-bg-border">
          {loggedToday ? (
            <div className="flex items-center gap-2 text-drive text-sm font-medium">
              <CheckCircle2 size={15} />
              Trajet enregistré dans votre solde journalier
            </div>
          ) : (
            <button onClick={handleMarkDone}
              className="w-full flex items-center justify-center gap-2 bg-drive/10 hover:bg-drive/20 border border-drive/30 text-drive font-semibold py-2.5 rounded-lg transition-colors">
              <BookCheck size={15} />
              Marquer comme effectué — {formatDuration(totalDriveMinutes)} ajoutés au solde
            </button>
          )}
        </div>
      </div>

      {/* Carte interactive */}
      <MapView
        points={waypoints}
        geometries={geometries}
        open={mapOpen}
        onToggle={() => setMapOpen(o => !o)}
      />

      {/* Estimation carburant */}
      <FuelEstimate
        distanceKm={totalDistanceKm}
        fuelConsumption={fuelConsumption}
        fuelPrice={fuelPrice}
      />

      {/* Timeline */}
      <TripTimeline
        timeline={timeline}
        totalTripMinutes={totalTripMinutes}
        bufferMinutes={buffer}
        days={days}
      />

      {/* Conformité */}
      <div>
        <h3 className="section-title mb-3">Conformité réglementaire</h3>
        <ComplianceBadges compliance={compliance} />
      </div>

      {/* Bilan quotas */}
      <div className="card p-4">
        <h3 className="font-semibold text-bright text-sm mb-3">Bilan après ce trajet</h3>
        <div className="space-y-3">
          <UsageBar label="Hebdomadaire" used={compliance.newWeeklyTotal} max={result.rules.maxWeeklyDrive} />
          <UsageBar label="Bihebdomadaire" used={compliance.newBiweeklyTotal} max={result.rules.maxBiweeklyDrive} />
        </div>
      </div>

      {/* Recommandations */}
      {recommendations?.length > 0 && (
        <div className="space-y-2">
          <h3 className="section-title">Recommandations</h3>
          {recommendations.map((rec, i) => {
            const Icon = REC_ICONS[rec.type] || Info
            const color = REC_COLORS[rec.type] || 'text-sub'
            return (
              <div key={i} className="card px-4 py-3 flex items-start gap-3">
                <Icon size={15} className={`${color} shrink-0 mt-0.5`} />
                <div>
                  <div className={`text-sm font-medium ${color}`}>{rec.title}</div>
                  <div className="text-sub text-xs mt-0.5">{rec.body}</div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Composants UI atomiques
// ---------------------------------------------------------------------------

function TimeCard({ label, time, highlighted, prefix }) {
  return (
    <div className={`rounded-xl p-4 ${highlighted ? 'bg-accent/10 border border-accent/30' : 'bg-bg-elevated'}`}>
      {prefix && <div className="text-xs text-accent mb-0.5">{prefix}</div>}
      <div className="text-xs text-sub mb-1">{label}</div>
      <div className={`text-3xl font-bold tabular-nums ${highlighted ? 'text-accent' : 'text-bright'}`}>
        {formatTime(time)}
      </div>
      <div className="text-xs text-muted mt-1">{formatDateShort(time)}</div>
    </div>
  )
}

function StatCell({ icon, label, value, color = 'text-text' }) {
  return (
    <div className="bg-bg-elevated rounded-lg p-3 text-center">
      <div className="text-lg mb-1">{icon}</div>
      <div className={`font-bold text-sm ${color}`}>{value}</div>
      <div className="text-muted text-xs mt-0.5">{label}</div>
    </div>
  )
}

function UsageBar({ label, used, max }) {
  const pct = Math.min(100, Math.round((used / max) * 100))
  const isOver = used > max
  const color = isOver ? 'bg-danger' : pct > 85 ? 'bg-pause' : 'bg-drive'
  const textColor = isOver ? 'text-danger' : pct > 85 ? 'text-pause' : 'text-text'
  return (
    <div>
      <div className="flex justify-between mb-1 text-sm">
        <span className="text-sub">{label}</span>
        <span className={`${textColor} font-mono font-medium`}>
          {Math.floor(used / 60)}h{String(Math.floor(used % 60)).padStart(2, '0')} / {Math.floor(max / 60)}h
        </span>
      </div>
      <div className="h-2 bg-bg-elevated rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function ToggleRow({ label, desc, value, onChange, disabled }) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <div className={`text-sm font-medium ${disabled ? 'text-muted' : 'text-text'}`}>{label}</div>
        {desc && <div className="text-xs text-muted mt-0.5">{desc}</div>}
      </div>
      <button
        onClick={() => !disabled && onChange(!value)}
        disabled={disabled}
        className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ml-4 ${
          value && !disabled ? 'bg-accent' : 'bg-bg-border'} disabled:opacity-40`}
      >
        <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
          value && !disabled ? 'left-6' : 'left-1'}`} />
      </button>
    </div>
  )
}

function formatBufferLabel(min) {
  if (min === 0) return '0'
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, '0')}`
}
