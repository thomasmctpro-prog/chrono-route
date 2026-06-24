// Persistance localStorage
// Clés préfixées 'cr_' pour éviter les conflits

const PREFIX = 'cr_'

function key(name) { return PREFIX + name }

function load(name, fallback = null) {
  try {
    const raw = localStorage.getItem(key(name))
    return raw !== null ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

function save(name, value) {
  try {
    localStorage.setItem(key(name), JSON.stringify(value))
  } catch (e) {
    console.error('localStorage save error:', e)
  }
}

function remove(name) {
  localStorage.removeItem(key(name))
}

// ---------------------------------------------------------------------------
// Profils véhicules
// ---------------------------------------------------------------------------

const defaultVehicles = [
  {
    id: 'default-pl',
    name: 'Mon Camion',
    type: 'pl',
    licensePlate: '',
    height: 4.0,
    totalWeight: 26,
    length: 12,
    fuelConsumption: 30,
    isDefault: true,
    createdAt: new Date().toISOString(),
  },
]

export function getVehicles() {
  return load('vehicles', defaultVehicles)
}

export function saveVehicles(vehicles) {
  save('vehicles', vehicles)
}

export function addVehicle(vehicle) {
  const vehicles = getVehicles()
  const newV = { ...vehicle, id: `v_${Date.now()}`, createdAt: new Date().toISOString() }
  if (vehicle.isDefault) {
    vehicles.forEach(v => { v.isDefault = false })
  }
  vehicles.push(newV)
  saveVehicles(vehicles)
  return newV
}

export function updateVehicle(id, updates) {
  const vehicles = getVehicles()
  const idx = vehicles.findIndex(v => v.id === id)
  if (idx === -1) return
  if (updates.isDefault) {
    vehicles.forEach(v => { v.isDefault = false })
  }
  vehicles[idx] = { ...vehicles[idx], ...updates }
  saveVehicles(vehicles)
}

export function deleteVehicle(id) {
  const vehicles = getVehicles().filter(v => v.id !== id)
  // S'assurer qu'il reste au moins un véhicule par défaut
  if (vehicles.length > 0 && !vehicles.some(v => v.isDefault)) {
    vehicles[0].isDefault = true
  }
  saveVehicles(vehicles)
}

export function getDefaultVehicle() {
  const vehicles = getVehicles()
  return vehicles.find(v => v.isDefault) || vehicles[0] || null
}

// ---------------------------------------------------------------------------
// Journal hebdomadaire
// ---------------------------------------------------------------------------

function getWeekKey(date = new Date()) {
  // ISO week (lundi = début de semaine)
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  const day = d.getDay() === 0 ? 7 : d.getDay()
  d.setDate(d.getDate() - day + 1)
  return d.toISOString().substring(0, 10) // YYYY-MM-DD du lundi
}

function getPrevWeekKey(currentWeekKey) {
  const d = new Date(currentWeekKey)
  d.setDate(d.getDate() - 7)
  return d.toISOString().substring(0, 10)
}

export function getWeeklyLog(weekKey = null) {
  const wk = weekKey || getWeekKey()
  return load(`week_${wk}`, {
    weekKey: wk,
    days: {},  // { 'YYYY-MM-DD': { driveMinutes, workMinutes, restMinutes, notes, extendedDay } }
    extendedDaysCount: 0,
    reducedRestCount: 0,
    notes: '',
  })
}

export function saveWeeklyLog(log) {
  save(`week_${log.weekKey}`, log)
}

export function getCurrentWeekKey() {
  return getWeekKey()
}

export function getPreviousWeekKey() {
  return getPrevWeekKey(getWeekKey())
}

export function addDayEntry(entry) {
  // entry: { date: 'YYYY-MM-DD', driveMinutes, workMinutes, restMinutes, notes, extendedDay, reducedRest }
  const wk = getWeekKey(new Date(entry.date))
  const log = getWeeklyLog(wk)

  log.days[entry.date] = { ...entry }

  // Recalcul des compteurs
  log.extendedDaysCount = Object.values(log.days).filter(d => d.extendedDay).length
  log.reducedRestCount = Object.values(log.days).filter(d => d.reducedRest).length

  saveWeeklyLog(log)
  return log
}

export function removeDayEntry(dateStr) {
  const wk = getWeekKey(new Date(dateStr))
  const log = getWeeklyLog(wk)
  delete log.days[dateStr]
  log.extendedDaysCount = Object.values(log.days).filter(d => d.extendedDay).length
  log.reducedRestCount = Object.values(log.days).filter(d => d.reducedRest).length
  saveWeeklyLog(log)
}

export function getWeeklyStats(weekKey = null) {
  const wk = weekKey || getWeekKey()
  const prevWk = getPrevWeekKey(wk)

  const log = getWeeklyLog(wk)
  const prevLog = getWeeklyLog(prevWk)

  const totalDrive = Object.values(log.days).reduce((s, d) => s + (d.driveMinutes || 0), 0)
  const prevDrive = Object.values(prevLog.days).reduce((s, d) => s + (d.driveMinutes || 0), 0)

  return {
    weekKey: wk,
    totalDriveMinutes: totalDrive,
    prevWeekDriveMinutes: prevDrive,
    biweeklyDriveMinutes: totalDrive + prevDrive,
    extendedDaysCount: log.extendedDaysCount || 0,
    reducedRestCount: log.reducedRestCount || 0,
    daysWorked: Object.keys(log.days).length,
    days: log.days,
  }
}

// ---------------------------------------------------------------------------
// Paramètres de l'application
// ---------------------------------------------------------------------------

const defaultSettings = {
  defaultBufferMinutes: 15,
  defaultBreakStrategy: 'single',
  defaultVehicleId: null,
  useDerogations: true,
  showAlternatives: true,
  distanceUnit: 'km',
  theme: 'dark',
  fuelPrice: 1.65,
  timelineStyle: 'bar',       // 'bar' = chronogramme | 'pie' = camembert
  notificationsEnabled: false, // Rappels de pause (Web Notifications API)
  notifLeadMinutes: 10,        // Minutes d'avance pour les rappels
}

export function getSettings() {
  return { ...defaultSettings, ...load('settings', {}) }
}

export function saveSettings(settings) {
  save('settings', settings)
}

export function updateSetting(key_, value) {
  const settings = getSettings()
  settings[key_] = value
  saveSettings(settings)
}

// ---------------------------------------------------------------------------
// Persistance du formulaire planificateur
// ---------------------------------------------------------------------------

export function savePlannerForm(state) {
  save('planner_form', {
    ...state,
    // Sérialiser les dates en string ISO
    savedAt: new Date().toISOString(),
  })
}

export function getPlannerForm() {
  const form = load('planner_form', null)
  if (!form) return null
  // Ignorer si sauvegardé il y a plus de 24h (le trajet n'est plus pertinent)
  if (form.savedAt) {
    const age = Date.now() - new Date(form.savedAt).getTime()
    if (age > 24 * 60 * 60 * 1000) return null
  }
  return form
}

export function clearPlannerForm() {
  remove('planner_form')
}

// ---------------------------------------------------------------------------
// Historique des trajets
// ---------------------------------------------------------------------------

export function getTripHistory() {
  return load('trip_history', [])
}

export function addTripToHistory(trip) {
  const history = getTripHistory()
  const entry = {
    id: `t_${Date.now()}`,
    savedAt: new Date().toISOString(),
    originLabel: trip.originLabel,
    destLabel: trip.destLabel,
    departure: trip.departure?.toISOString?.() || trip.departure,
    arrival: trip.arrival?.toISOString?.() || trip.arrival,
    driveDurationMinutes: trip.rawDriveMinutes,
    distanceKm: trip.distanceKm,
    vehicleTypeId: trip.vehicleTypeId,
    totalBreakTime: trip.totalBreakTime,
  }
  history.unshift(entry)
  if (history.length > 50) history.length = 50 // Garder les 50 derniers
  save('trip_history', history)
  return entry
}

export function clearHistory() {
  remove('trip_history')
}

export function clearAllData() {
  Object.keys(localStorage)
    .filter(k => k.startsWith(PREFIX))
    .forEach(k => localStorage.removeItem(k))
}

// ---------------------------------------------------------------------------
// Dernière route planifiée (pour la page Carte)
// ---------------------------------------------------------------------------

export function saveLastRoute(routeData) {
  save('last_route', routeData)
}

export function getLastRoute() {
  return load('last_route', null)
}
