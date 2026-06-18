import { getRules } from './regulations.js'

// ---------------------------------------------------------------------------
// Planification multi-étapes avec gestion multi-jours
// ---------------------------------------------------------------------------

/**
 * @param {object} params
 * @param {Array}  params.legs              - [{driveMinutes, stopLabel, stopDurationMinutes, stopType}]
 *                                            Le dernier leg n'a pas de stop (c'est la destination finale)
 * @param {string} params.vehicleTypeId
 * @param {'arrival'|'departure'} params.mode
 * @param {Date}   params.targetTime
 * @param {number} params.bufferMinutes     - 0..180
 * @param {'single'|'split'} params.breakStrategy
 * @param {boolean} params.useDerogations
 * @param {object} params.driverState
 */
export function planMultiLegTrip({
  legs,
  vehicleTypeId = 'pl',
  mode = 'arrival',
  targetTime,
  bufferMinutes = 0,
  breakStrategy = 'single',
  useDerogations = true,
  driverState = {},
}) {
  const rules = getRules(vehicleTypeId)
  const {
    dailyDriveMinutes = 0,
    continuousMinutesSinceBreak = 0,
    weeklyDriveMinutes = 0,
    biweeklyDriveMinutes = 0,
    extendedDaysThisWeek = 0,
    reducedRestDays = 0,
  } = driverState

  const maxDaily = useDerogations ? rules.maxDailyDriveExtended : rules.maxDailyDrive

  // --- 1. Construire tous les segments (conduite + arrêts + repos inter-jours) ---
  const segments = buildMultiLegSegments({
    legs,
    rules,
    maxDaily,
    continuousMinutesSinceBreak,
    dailyDriveMinutes,
    breakStrategy,
    useDerogations,
  })

  // --- 2. Calculs de synthèse ---
  const totalDriveMinutes = segments
    .filter(s => s.type === 'drive')
    .reduce((s, seg) => s + seg.duration, 0)
  const totalBreakMinutes = segments
    .filter(s => s.type === 'break')
    .reduce((s, seg) => s + seg.duration, 0)
  const totalStopMinutes = segments
    .filter(s => s.type === 'stop')
    .reduce((s, seg) => s + seg.duration, 0)
  const totalRestMinutes = segments
    .filter(s => s.type === 'overnight_rest')
    .reduce((s, seg) => s + seg.duration, 0)
  const totalTripMinutes = totalDriveMinutes + totalBreakMinutes + totalStopMinutes + totalRestMinutes

  // --- 3. Horaires absolus ---
  let departure, arrival
  const totalWithBuffer = totalTripMinutes + bufferMinutes

  if (!targetTime) {
    departure = new Date()
    arrival = new Date(departure.getTime() + totalWithBuffer * 60_000)
  } else if (mode === 'arrival') {
    arrival = new Date(targetTime)
    departure = new Date(arrival.getTime() - totalWithBuffer * 60_000)
  } else {
    departure = new Date(targetTime)
    arrival = new Date(departure.getTime() + totalWithBuffer * 60_000)
  }

  // --- 4. Timeline absolue ---
  const timeline = buildTimeline(segments, departure)

  // --- 5. Jours distincts ---
  const days = buildDaySummaries(timeline)

  // --- 6. Conformité ---
  const compliance = analyzeCompliance({
    segments,
    rules,
    dailyDriveMinutes,
    weeklyDriveMinutes,
    biweeklyDriveMinutes,
    extendedDaysThisWeek,
    useDerogations,
    maxDaily,
  })

  // --- 7. Recommandations ---
  const recommendations = generateRecommendations(compliance, rules, segments, driverState, days)

  return {
    departure,
    arrival,
    totalDriveMinutes,
    totalBreakMinutes,
    totalStopMinutes,
    totalRestMinutes,
    totalTripMinutes,
    totalWithBuffer,
    segments,
    timeline,
    days,
    compliance,
    recommendations,
    rules,
    isMultiDay: days.length > 1,
  }
}

// ---------------------------------------------------------------------------
// Constructeur de segments multi-étapes
// ---------------------------------------------------------------------------

function buildMultiLegSegments({
  legs,
  rules,
  maxDaily,
  continuousMinutesSinceBreak,
  dailyDriveMinutes,
  breakStrategy,
  useDerogations,
}) {
  const MAX_CONT = rules.maxContinuousDrive  // 270
  const BREAK_DUR = rules.mandatoryBreak     // 45
  const S1 = rules.splitBreakPart1           // 15
  const S2 = rules.splitBreakPart2           // 30
  const MIN_REST = useDerogations ? rules.minDailyRestReduced : rules.minDailyRest

  const segments = []
  let continuous = continuousMinutesSinceBreak
  let dailyDriven = dailyDriveMinutes
  let dayNumber = 1

  for (let legIdx = 0; legIdx < legs.length; legIdx++) {
    const leg = legs[legIdx]
    let legRemaining = leg.driveMinutes

    // Conduire ce leg (avec pauses si nécessaire et repos inter-jours si limite atteinte)
    while (legRemaining > 0) {
      // Vérifier si on dépasse la limite journalière
      if (dailyDriven >= maxDaily) {
        // Insérer repos obligatoire
        segments.push({
          type: 'overnight_rest',
          duration: MIN_REST,
          reason: `Repos journalier obligatoire (${MIN_REST / 60}h) — Jour ${dayNumber}/${dayNumber + 1}`,
          dayNumber,
          derogation: useDerogations && MIN_REST === rules.minDailyRestReduced,
        })
        dayNumber++
        dailyDriven = 0
        continuous = 0
        continue
      }

      // Combien peut-on conduire avant la prochaine pause obligatoire ?
      const canContinuous = MAX_CONT - continuous
      // Combien peut-on conduire avant la limite journalière ?
      const canDaily = maxDaily - dailyDriven
      // Combien peut-on conduire ?
      const canDrive = Math.min(canContinuous, canDaily, legRemaining)

      if (canDrive <= 0) {
        // Limite continue atteinte → pause obligatoire
        if (continuous >= MAX_CONT) {
          if (breakStrategy === 'split' && legRemaining > 0) {
            segments.push({ type: 'break', duration: S1, reason: 'Pause fractionnée 1/2 — 15 min' })
            // Après S1, on peut conduire le reste du bloc (jusqu'à 4h30 total)
            const canAfterS1 = Math.min(MAX_CONT - continuous, canDaily, legRemaining)
            if (canAfterS1 > 0) {
              const driveAfterS1 = Math.min(canAfterS1, legRemaining)
              segments.push({ type: 'drive', duration: driveAfterS1 })
              legRemaining -= driveAfterS1
              dailyDriven += driveAfterS1
              continuous += driveAfterS1
            }
            if (legRemaining > 0 || continuous >= MAX_CONT) {
              segments.push({ type: 'break', duration: S2, reason: 'Pause fractionnée 2/2 — 30 min' })
              continuous = 0
            }
          } else {
            segments.push({ type: 'break', duration: BREAK_DUR, reason: 'Pause réglementaire — 45 min' })
            continuous = 0
          }
        }
        continue
      }

      // Conduire
      segments.push({ type: 'drive', duration: canDrive, legIndex: legIdx })
      legRemaining -= canDrive
      dailyDriven += canDrive
      continuous += canDrive

      // Pause si continue atteinte ET encore à conduire
      if (continuous >= MAX_CONT && (legRemaining > 0 || legIdx < legs.length - 1)) {
        if (breakStrategy === 'split') {
          segments.push({ type: 'break', duration: S1, reason: 'Pause fractionnée 1/2 — 15 min' })
          const nextDrive = Math.min(MAX_CONT - continuous + S1, legRemaining)
          if (nextDrive > 0) {
            segments.push({ type: 'drive', duration: nextDrive, legIndex: legIdx })
            legRemaining -= nextDrive
            dailyDriven += nextDrive
            continuous += nextDrive
          }
          segments.push({ type: 'break', duration: S2, reason: 'Pause fractionnée 2/2 — 30 min' })
        } else {
          segments.push({ type: 'break', duration: BREAK_DUR, reason: 'Pause réglementaire — 45 min' })
        }
        continuous = 0
      }
    }

    // Arrêt à l'étape (sauf dernière destination)
    if (leg.stopDurationMinutes > 0 && legIdx < legs.length - 1) {
      segments.push({
        type: 'stop',
        duration: leg.stopDurationMinutes,
        label: leg.stopLabel || `Arrêt ${legIdx + 1}`,
        stopType: leg.stopType || 'other',
        reason: `${STOP_TYPE_LABELS[leg.stopType] || 'Arrêt'} — ${leg.stopLabel || ''}`,
      })
      // Un arrêt reset le compteur continu si ≥ 15 min
      if (leg.stopDurationMinutes >= 15) {
        continuous = 0
      }
    }
  }

  return segments
}

// ---------------------------------------------------------------------------
// Timeline absolue
// ---------------------------------------------------------------------------

function buildTimeline(segments, departure) {
  const timeline = []
  let current = new Date(departure)

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]
    const start = new Date(current)
    const end = new Date(current.getTime() + seg.duration * 60_000)
    timeline.push({ ...seg, index: i, startTime: start, endTime: end })
    current = end
  }

  return timeline
}

// ---------------------------------------------------------------------------
// Résumé par jour
// ---------------------------------------------------------------------------

function buildDaySummaries(timeline) {
  const days = []
  let currentDay = { number: 1, segments: [], driveMinutes: 0, breakMinutes: 0, stopMinutes: 0 }

  for (const event of timeline) {
    if (event.type === 'overnight_rest') {
      currentDay.restStart = event.startTime
      currentDay.restEnd = event.endTime
      days.push(currentDay)
      currentDay = {
        number: currentDay.number + 1,
        segments: [],
        driveMinutes: 0,
        breakMinutes: 0,
        stopMinutes: 0,
        startTime: event.endTime,
      }
    } else {
      currentDay.segments.push(event)
      if (event.type === 'drive') currentDay.driveMinutes += event.duration
      if (event.type === 'break') currentDay.breakMinutes += event.duration
      if (event.type === 'stop') currentDay.stopMinutes += event.duration
      if (!currentDay.startTime) currentDay.startTime = event.startTime
      currentDay.endTime = event.endTime
    }
  }

  days.push(currentDay)
  return days
}

// ---------------------------------------------------------------------------
// Analyse de conformité
// ---------------------------------------------------------------------------

function analyzeCompliance({
  segments, rules, dailyDriveMinutes, weeklyDriveMinutes,
  biweeklyDriveMinutes, extendedDaysThisWeek, useDerogations, maxDaily,
}) {
  const tripDrive = segments.filter(s => s.type === 'drive').reduce((s, seg) => s + seg.duration, 0)
  const newWeekly = weeklyDriveMinutes + tripDrive
  const newBiweekly = biweeklyDriveMinutes + tripDrive

  // Calculer la conduite max sur une seule journée (pour vérifier sans les repos)
  const singleDayDrive = dailyDriveMinutes + segments
    .filter(s => s.type === 'drive')
    .slice(0, countDriveSegmentsBeforeFirstRest(segments))
    .reduce((s, seg) => s + seg.duration, 0)

  const violations = []
  const warnings = []
  const derogationsUsed = []

  // Vérification hebdomadaire
  if (newWeekly > rules.maxWeeklyDrive) {
    violations.push({
      severity: 'critical',
      message: `Limite hebdomadaire dépassée : ${Math.round(newWeekly / 60)}h > 56h`,
      article: 'Art. 6(2) UE 561/2006',
    })
  } else if (newWeekly > rules.maxWeeklyDrive * 0.9) {
    warnings.push({
      message: `Proche de la limite hebdomadaire : ${Math.round(newWeekly / 60)}h / 56h`,
    })
  }

  // Vérification bihebdomadaire
  if (newBiweekly > rules.maxBiweeklyDrive) {
    violations.push({
      severity: 'critical',
      message: `Limite bihebdomadaire dépassée : ${Math.round(newBiweekly / 60)}h > 90h`,
      article: 'Art. 6(3) UE 561/2006',
    })
  }

  // Dérogation utilisée si repos réduit inséré
  const usedReducedRest = segments.some(s => s.type === 'overnight_rest' && s.derogation)
  if (usedReducedRest) {
    derogationsUsed.push({
      type: 'reduced_rest',
      label: 'Repos journalier réduit à 9h (dérogation)',
      article: 'Art. 8(1) UE 561/2006',
      info: 'Autorisé 3 fois maximum entre deux repos hebdomadaires',
    })
  }

  // Check dérogation 10h
  const daysWithExtended = segments
    .filter(s => s.type === 'overnight_rest')
    .length + 1 // +1 pour le premier jour
  if (maxDaily > rules.maxDailyDrive && useDerogations) {
    derogationsUsed.push({
      type: 'extended_daily',
      label: `Dérogation 10h/jour appliquée (${extendedDaysThisWeek + 1}/${rules.maxExtendedPerWeek} cette semaine)`,
      article: 'Art. 6(1) UE 561/2006',
    })
  }

  const infosReglementaires = []
  const breakCount = segments.filter(s => s.type === 'break').length
  const restCount = segments.filter(s => s.type === 'overnight_rest').length
  if (breakCount > 0) infosReglementaires.push(`${breakCount} pause${breakCount > 1 ? 's' : ''} de conduite planifiée${breakCount > 1 ? 's' : ''}`)
  if (restCount > 0) infosReglementaires.push(`${restCount} repos journalier${restCount > 1 ? 's' : ''} intercalé${restCount > 1 ? 's' : ''} (trajet sur ${restCount + 1} jours)`)

  return {
    isCompliant: violations.length === 0,
    violations,
    warnings,
    derogationsUsed,
    infosReglementaires,
    tripDrive,
    newWeeklyTotal: newWeekly,
    newBiweeklyTotal: newBiweekly,
    remainingWeeklyDrive: Math.max(0, rules.maxWeeklyDrive - newWeekly),
    remainingBiweeklyDrive: Math.max(0, rules.maxBiweeklyDrive - newBiweekly),
  }
}

function countDriveSegmentsBeforeFirstRest(segments) {
  let count = 0
  for (const seg of segments) {
    if (seg.type === 'overnight_rest') break
    if (seg.type === 'drive') count++
  }
  return count
}

// ---------------------------------------------------------------------------
// Recommandations
// ---------------------------------------------------------------------------

function generateRecommendations(compliance, rules, segments, driverState, days) {
  const recs = []
  const breaks = segments.filter(s => s.type === 'break')
  const rests = segments.filter(s => s.type === 'overnight_rest')

  if (rests.length > 0) {
    recs.push({
      type: 'info',
      title: `Trajet sur ${days.length} jours`,
      body: `Ce trajet nécessite ${rests.length} repos journalier${rests.length > 1 ? 's' : ''} intercalé${rests.length > 1 ? 's' : ''}. Prévoyez un hébergement ou un parking PL sécurisé.`,
    })
  }

  if (compliance.derogationsUsed.some(d => d.type === 'extended_daily')) {
    recs.push({
      type: 'warning',
      title: 'Dérogation 10h/jour',
      body: `Vérifiez que vous n'avez pas déjà utilisé cette dérogation ${rules.maxExtendedPerWeek} fois cette semaine.`,
    })
  }

  if (breaks.length === 0 && rests.length === 0) {
    recs.push({
      type: 'success',
      title: 'Trajet fluide',
      body: 'Aucune pause ni repos obligatoire requis pour ce trajet.',
    })
  }

  if (compliance.remainingWeeklyDrive < 300) {
    recs.push({
      type: 'warning',
      title: 'Solde hebdo faible',
      body: `Il vous reste ${Math.round(compliance.remainingWeeklyDrive / 60 * 10) / 10}h de conduite autorisées cette semaine.`,
    })
  }

  if (compliance.violations.length > 0) {
    recs.push({
      type: 'error',
      title: 'Trajet non conforme',
      body: 'Ce trajet dépasse vos quotas restants. Envisagez de décaler le départ à la semaine suivante.',
    })
  }

  return recs
}

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

export const STOP_TYPES = [
  { id: 'loading', label: 'Chargement', icon: '🔧', defaultDuration: 45 },
  { id: 'delivery', label: 'Livraison', icon: '📦', defaultDuration: 20 },
  { id: 'fuel', label: 'Carburant', icon: '⛽', defaultDuration: 15 },
  { id: 'customs', label: 'Douane', icon: '🛂', defaultDuration: 30 },
  { id: 'rest_stop', label: 'Pause technique', icon: '🅿️', defaultDuration: 30 },
  { id: 'other', label: 'Autre arrêt', icon: '📍', defaultDuration: 15 },
]

export const STOP_TYPE_LABELS = Object.fromEntries(STOP_TYPES.map(s => [s.id, s.label]))

// ---------------------------------------------------------------------------
// Compatibilité : ancienne API mono-segment
// ---------------------------------------------------------------------------

export function planTrip({
  rawDriveMinutes,
  vehicleTypeId = 'pl',
  mode = 'arrival',
  targetTime,
  bufferMinutes = 0,
  breakStrategy = 'single',
  useDerogations = true,
  driverState = {},
}) {
  return planMultiLegTrip({
    legs: [{ driveMinutes: rawDriveMinutes, stopDurationMinutes: 0, stopLabel: '' }],
    vehicleTypeId,
    mode,
    targetTime,
    bufferMinutes,
    breakStrategy,
    useDerogations,
    driverState,
  })
}
