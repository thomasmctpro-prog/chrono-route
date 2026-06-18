// EU Regulation 561/2006 + French transport code
// All durations in MINUTES

export const VEHICLE_TYPES = [
  {
    id: 'pl',
    label: 'Poids Lourd',
    sublabel: '> 3,5 t — Camion / Semi-remorque',
    emoji: '🚛',
    regulation: 'UE 561/2006',
    color: '#f97316',
  },
  {
    id: 'vul',
    label: 'Utilitaire',
    sublabel: '≤ 3,5 t — Fourgon / Fourgonnette',
    emoji: '🚐',
    regulation: 'Code des Transports FR',
    color: '#3b82f6',
  },
  {
    id: 'bus',
    label: 'Bus / Autocar',
    sublabel: 'Transport de voyageurs',
    emoji: '🚌',
    regulation: 'UE 561/2006',
    color: '#a855f7',
  },
]

export const RULES = {
  // Poids lourd > 3.5t — Règlement UE 561/2006
  pl: {
    name: 'Poids Lourd (UE 561/2006)',
    shortName: 'PL',
    // --- Pauses (Art. 7) ---
    maxContinuousDrive: 270,      // 4h30 max sans interruption
    mandatoryBreak: 45,            // 45 min de pause obligatoire
    splitBreakPart1: 15,          // Fractionnée : 1re partie ≥ 15 min
    splitBreakPart2: 30,          // Fractionnée : 2e partie ≥ 30 min (dans cet ordre)
    // --- Conduite journalière (Art. 6) ---
    maxDailyDrive: 540,           // 9h/jour (standard)
    maxDailyDriveExtended: 600,   // 10h/jour (dérogation, 2x/semaine max)
    maxExtendedPerWeek: 2,
    // --- Repos journalier (Art. 8) ---
    minDailyRest: 660,            // 11h de repos minimum
    minDailyRestReduced: 540,     // 9h de repos réduit (3x/semaine max entre 2 repos hebdo)
    maxReducedRestPerWeek: 3,
    splitDailyRest: [180, 540],   // Repos fractionné : 3h + 9h (dans cet ordre)
    // --- Conduite hebdomadaire (Art. 6) ---
    maxWeeklyDrive: 3360,         // 56h/semaine
    maxBiweeklyDrive: 5400,       // 90h sur 2 semaines consécutives
    // --- Repos hebdomadaire (Art. 8) ---
    minWeeklyRest: 2700,          // 45h minimum
    minWeeklyRestReduced: 1440,   // 24h (dérogation, alternée, compensation obligatoire)
    // --- Routage ---
    speedFactor: 0.78,            // Rapport vitesse camion/voiture (limites 90/130 sur autoroute)
    vehicleLabel: 'Camion / Semi-remorque',
    maxSpeedHighway: 90,
    maxSpeedRoad: 80,
  },

  // Utilitaire ≤ 3.5t — Code des Transports + Directive temps de travail
  vul: {
    name: 'Utilitaire ≤ 3,5t (Code Transports FR)',
    shortName: 'VUL',
    // --- Pauses ---
    maxContinuousDrive: 270,      // 4h30 (même principe, art. L3312-1)
    mandatoryBreak: 45,
    splitBreakPart1: 15,
    splitBreakPart2: 30,
    // --- Conduite journalière ---
    maxDailyDrive: 600,           // 10h/jour (VUL transport marchandises)
    maxDailyDriveExtended: 600,
    maxExtendedPerWeek: 0,
    // --- Repos journalier ---
    minDailyRest: 540,            // 9h
    minDailyRestReduced: 540,
    maxReducedRestPerWeek: 0,
    splitDailyRest: null,
    // --- Hebdomadaire ---
    maxWeeklyDrive: 2880,         // 48h (directive UE temps de travail)
    maxBiweeklyDrive: 5400,
    // --- Repos hebdo ---
    minWeeklyRest: 2100,          // 35h (Code du Travail FR)
    minWeeklyRestReduced: 1440,
    // --- Routage ---
    speedFactor: 1.0,             // VUL = vitesse voiture (limité à 110 sur autoroute)
    vehicleLabel: 'Fourgon / Utilitaire',
    maxSpeedHighway: 110,
    maxSpeedRoad: 80,
  },

  // Bus / Autocar — Règlement UE 561/2006
  bus: {
    name: 'Bus / Autocar (UE 561/2006)',
    shortName: 'Bus',
    maxContinuousDrive: 270,
    mandatoryBreak: 45,
    splitBreakPart1: 15,
    splitBreakPart2: 30,
    maxDailyDrive: 540,           // 9h
    maxDailyDriveExtended: 600,   // 10h (dérogation 2x/semaine)
    maxExtendedPerWeek: 2,
    minDailyRest: 660,            // 11h
    minDailyRestReduced: 540,     // 9h réduit
    maxReducedRestPerWeek: 3,
    splitDailyRest: [180, 540],
    maxWeeklyDrive: 3360,         // 56h
    maxBiweeklyDrive: 5400,       // 90h
    minWeeklyRest: 2700,          // 45h
    minWeeklyRestReduced: 1440,   // 24h
    speedFactor: 0.88,            // Bus limité à 100 km/h
    vehicleLabel: 'Bus / Autocar',
    maxSpeedHighway: 100,
    maxSpeedRoad: 80,
  },
}

export function getRules(vehicleTypeId) {
  return RULES[vehicleTypeId] || RULES.pl
}

export function getVehicleType(id) {
  return VEHICLE_TYPES.find(v => v.id === id) || VEHICLE_TYPES[0]
}

// --- Helpers de formatage ---

export function formatDuration(minutes) {
  if (!minutes && minutes !== 0) return '--'
  const m = Math.round(minutes)
  const h = Math.floor(m / 60)
  const min = m % 60
  if (h === 0) return `${min} min`
  if (min === 0) return `${h}h`
  return `${h}h${String(min).padStart(2, '0')}`
}

export function formatTime(date) {
  if (!date) return '--'
  const d = date instanceof Date ? date : new Date(date)
  if (isNaN(d)) return '--'
  return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

export function formatDateTime(date) {
  if (!date) return '--'
  const d = date instanceof Date ? date : new Date(date)
  if (isNaN(d)) return '--'
  return d.toLocaleDateString('fr-FR', {
    weekday: 'short', day: '2-digit', month: 'short',
  }) + ' ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

export function formatDate(date) {
  if (!date) return '--'
  const d = date instanceof Date ? date : new Date(date)
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long' })
}

export function minutesToHHMM(minutes) {
  const h = Math.floor(Math.abs(minutes) / 60)
  const m = Math.abs(minutes) % 60
  const sign = minutes < 0 ? '-' : ''
  return `${sign}${h}h${String(m).padStart(2, '0')}`
}

// Calcule le % d'utilisation (pour les jauges)
export function usagePercent(used, max) {
  return Math.min(100, Math.round((used / max) * 100))
}

export function usageColor(percent) {
  if (percent >= 100) return 'text-danger'
  if (percent >= 85) return 'text-pause'
  return 'text-drive'
}

export function usageBarColor(percent) {
  if (percent >= 100) return 'bg-danger'
  if (percent >= 85) return 'bg-pause'
  return 'bg-drive'
}

// Résumé des infractions potentielles
export const INFRACTIONS = {
  daily_exceeded: {
    severity: 'critical',
    label: 'Dépassement temps journalier',
    article: 'Art. 6(1) UE 561/2006',
    penalty: 'Immobilisation + amende jusqu\'à 750 €',
  },
  continuous_exceeded: {
    severity: 'critical',
    label: 'Dépassement conduite continue (4h30)',
    article: 'Art. 7 UE 561/2006',
    penalty: 'Amende jusqu\'à 375 €',
  },
  weekly_exceeded: {
    severity: 'critical',
    label: 'Dépassement temps hebdomadaire (56h)',
    article: 'Art. 6(2) UE 561/2006',
    penalty: 'Amende lourde + immobilisation possible',
  },
  biweekly_exceeded: {
    severity: 'critical',
    label: 'Dépassement bihebdomadaire (90h)',
    article: 'Art. 6(3) UE 561/2006',
    penalty: 'Infraction grave',
  },
  rest_insufficient: {
    severity: 'serious',
    label: 'Repos journalier insuffisant',
    article: 'Art. 8 UE 561/2006',
    penalty: 'Amende jusqu\'à 750 €',
  },
}
