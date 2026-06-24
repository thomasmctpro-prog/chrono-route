import { getRules } from './regulations.js'

// ---------------------------------------------------------------------------
// Planification multi-étapes avec gestion multi-jours
// ---------------------------------------------------------------------------

/**
 * @param {object} params
 * @param {Array}  params.legs  — [{driveMinutes, distanceKm, stopLabel, stopDurationMinutes, stopType,
 *                                   departureStop?, arrivalStop?}]
 *   departureStop / arrivalStop : { durationMinutes, type, label }
 *   (premier / dernier leg uniquement)
 * @param {string} params.vehicleTypeId
 * @param {'arrival'|'departure'} params.mode
 * @param {Date}   params.targetTime
 * @param {number} params.bufferMinutes
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
    workMinutesSinceBreak = 0,
  } = driverState

  const maxDaily = useDerogations ? rules.maxDailyDriveExtended : rules.maxDailyDrive

  // --- 1. Construire tous les segments ---
  const segments = buildMultiLegSegments({
    legs, rules, maxDaily,
    continuousMinutesSinceBreak, dailyDriveMinutes,
    breakStrategy, useDerogations, workMinutesSinceBreak,
  })

  // --- 2. Synthèse ---
  const totalDriveMinutes = segments.filter(s => s.type === 'drive').reduce((s, seg) => s + seg.duration, 0)
  const totalBreakMinutes = segments.filter(s => s.type === 'break').reduce((s, seg) => s + seg.duration, 0)
  const totalStopMinutes  = segments.filter(s => s.type === 'stop').reduce((s, seg) => s + seg.duration, 0)
  const totalRestMinutes  = segments.filter(s => s.type === 'overnight_rest').reduce((s, seg) => s + seg.duration, 0)
  const totalTripMinutes  = totalDriveMinutes + totalBreakMinutes + totalStopMinutes + totalRestMinutes

  // --- 3. Horaires absolus (provisoires — sans créneaux) ---
  let departure, arrival
  const totalWithBuffer = totalTripMinutes + bufferMinutes

  if (!targetTime) {
    departure = new Date()
    arrival   = new Date(departure.getTime() + totalWithBuffer * 60_000)
  } else if (mode === 'arrival') {
    arrival   = new Date(targetTime)
    departure = new Date(arrival.getTime() - totalWithBuffer * 60_000)
  } else {
    departure = new Date(targetTime)
    arrival   = new Date(departure.getTime() + totalWithBuffer * 60_000)
  }

  // --- 3b. Injection des attentes pour créneaux horaires ---
  // Passe 1 : calcul provisoire depuis la première estimation de départ
  let { segments: segs1, totalWaitMinutes: wait1, timeWindowViolations } =
    injectTimeWindowWaits(segments, departure, legs)

  // En mode arrivée : le départ recule d'autant que les attentes ajoutées
  // Passe 2 : recalcul avec le départ corrigé pour plus de précision
  let finalSegments = segs1
  let totalWaitMinutes = wait1

  if (mode === 'arrival' && wait1 > 0) {
    departure = new Date(departure.getTime() - wait1 * 60_000)
    const pass2 = injectTimeWindowWaits(segments, departure, legs)
    finalSegments       = pass2.segments
    totalWaitMinutes    = pass2.totalWaitMinutes
    timeWindowViolations = pass2.timeWindowViolations
  } else if (mode === 'departure' && wait1 > 0) {
    // Mode départ : l'arrivée est décalée en avant
    arrival = new Date(departure.getTime() + (totalTripMinutes + totalWaitMinutes + bufferMinutes) * 60_000)
  }

  // --- 4. Timeline absolue ---
  const timeline = buildTimeline(finalSegments, departure)

  // --- 5. Résumé par jour ---
  const days = buildDaySummaries(timeline)

  // --- 6. Conformité ---
  const compliance = analyzeCompliance({
    segments: finalSegments, rules, dailyDriveMinutes, weeklyDriveMinutes,
    biweeklyDriveMinutes, extendedDaysThisWeek, useDerogations, maxDaily,
    timeWindowViolations,
  })

  // --- 7. Recommandations ---
  const recommendations = generateRecommendations(compliance, rules, finalSegments, driverState, days)

  const totalWithWait = totalTripMinutes + totalWaitMinutes + bufferMinutes

  return {
    departure, arrival,
    totalDriveMinutes, totalBreakMinutes, totalStopMinutes, totalRestMinutes,
    totalTripMinutes, totalWaitMinutes,
    totalWithBuffer: totalWithWait,
    segments: finalSegments, timeline, days, compliance, recommendations, rules,
    isMultiDay: days.length > 1,
    timeWindowViolations,
  }
}

// ---------------------------------------------------------------------------
// Constructeur de segments — cœur du planificateur
// ---------------------------------------------------------------------------

function buildMultiLegSegments({
  legs,
  rules,
  maxDaily,
  continuousMinutesSinceBreak,
  dailyDriveMinutes,
  breakStrategy,
  useDerogations,
  workMinutesSinceBreak = 0,
}) {
  const MAX_CONT  = rules.maxContinuousDrive   // 270 min = 4h30
  const BREAK_DUR = rules.mandatoryBreak        // 45 min
  const S1        = rules.splitBreakPart1       // 15 min (1ère partie fractionnée)
  const S2        = rules.splitBreakPart2       // 30 min (2ème partie fractionnée)
  const MIN_REST  = useDerogations ? rules.minDailyRestReduced : rules.minDailyRest

  // Pause fractionnée : seuil pour insérer le S1 (à 2h de conduite continue)
  // Après S1, le conducteur peut conduire jusqu'à 4h30 TOTAL (S1 n'interrompt pas le compteur)
  const S1_THRESHOLD = 120  // 2h → pause 15 min anticipée

  // Directive 2002/15/CE — temps de travail effectif
  const WORK_6H = 360   // après 6h de travail : pause 30 min
  const WORK_9H = 540   // après 9h de travail : pause 45 min

  const segments = []
  // continuous : conduite continue depuis dernière VRAIE pause (Art. 7)
  // Les arrêts de travail (chargement, livraison…) NE resetent PAS ce compteur.
  let continuous    = continuousMinutesSinceBreak
  let dailyDriven   = dailyDriveMinutes
  let dayNumber     = 1
  // work : travail cumulé depuis la dernière pause (conduite + activités pro)
  let work          = Math.max(workMinutesSinceBreak, continuousMinutesSinceBreak)
  let totalKm       = 0  // km cumulés depuis le départ
  // splitS1Done : si la 1ère partie de la pause fractionnée a été faite dans ce cycle
  let splitS1Done   = false

  // --- Helpers ---

  /**
   * Insère la 1ère partie fractionnée (S1 = 15 min).
   * NE réinitialise PAS continuous — le compteur 4h30 continue de tourner.
   * La conduite AVANT + APRÈS S1 doit totaliser ≤ 4h30 avant S2.
   */
  function insertS1(atKm) {
    segments.push({
      type: 'break', duration: S1,
      reason: `Pause fractionnée 1/2 — ${S1} min (Art. 7 UE 561/2006)`,
      atKm: Math.round(atKm),
      isSplitS1: true,
    })
    splitS1Done = true
    // continuous et work INCHANGÉS (S1 n'interrompt pas le compteur de conduite cumulée)
  }

  /** Insère une pause conduite complète (Art. 7 UE 561/2006). */
  function insertDrivingBreak(atKm) {
    if (breakStrategy === 'split') {
      if (!splitS1Done) {
        // S1 non effectué : on insère les deux ensemble (réglementairement acceptable)
        segments.push({
          type: 'break', duration: S1,
          reason: `Pause fractionnée 1/2 — ${S1} min (Art. 7 UE 561/2006)`,
          atKm: Math.round(atKm),
        })
      }
      // S2 = fin obligatoire du cycle
      segments.push({
        type: 'break', duration: S2,
        reason: `Pause fractionnée 2/2 — ${S2} min (Art. 7 UE 561/2006)`,
        atKm: Math.round(atKm),
      })
    } else {
      segments.push({
        type: 'break', duration: BREAK_DUR,
        reason: `Pause réglementaire — ${BREAK_DUR} min (Art. 7 UE 561/2006)`,
        atKm: Math.round(atKm),
      })
    }
    continuous  = 0
    work        = 0   // la pause conduite satisfait aussi la pause travail
    splitS1Done = false
  }

  /** Insère une pause temps de travail (Directive 2002/15/CE). */
  function insertWorkBreak(atKm) {
    const dur = work >= WORK_9H ? 45 : 30
    segments.push({
      type: 'break', duration: dur,
      reason: `Pause travail — ${dur} min (Dir. 2002/15/CE)`,
      isWorkBreak: true,
      atKm: Math.round(atKm),
    })
    work = 0
    // Une pause travail de 45 min satisfait aussi la pause conduite
    if (dur >= 45) { continuous = 0; splitS1Done = false }
  }

  // --- Boucle sur les legs ---
  for (let legIdx = 0; legIdx < legs.length; legIdx++) {
    const leg   = legs[legIdx]
    const legKm = leg.distanceKm || 0
    let legRemaining = leg.driveMinutes
    let legDriven    = 0    // minutes conduites dans ce leg (pour interpolation km)

    // ── Activité au départ (premier leg seulement) ──
    if (legIdx === 0 && leg.departureStop?.durationMinutes > 0) {
      const dep = leg.departureStop
      segments.push({
        type: 'stop', duration: dep.durationMinutes,
        label: dep.label || 'Départ',
        stopType: dep.type || 'loading',
        reason: `${STOP_TYPE_LABELS[dep.type] || 'Chargement'} au départ`,
        atKm: 0, isDeparture: true,
      })
      if (dep.type !== 'rest_stop') work += dep.durationMinutes
      if      (work >= WORK_9H) insertWorkBreak(0)
      else if (work >= WORK_6H) insertWorkBreak(0)
    }

    // ── Conduire ce leg ──
    while (legRemaining > 0) {

      // Limite journalière atteinte → repos obligatoire
      if (dailyDriven >= maxDaily) {
        segments.push({
          type: 'overnight_rest', duration: MIN_REST,
          reason: `Repos journalier obligatoire (${MIN_REST / 60}h) — Jour ${dayNumber}/${dayNumber + 1}`,
          dayNumber,
          derogation: useDerogations && MIN_REST === rules.minDailyRestReduced,
        })
        dayNumber++
        dailyDriven = 0
        continuous  = 0
        work        = 0
        splitS1Done = false
        continue
      }

      // Combien peut-on conduire ?
      const canCont  = MAX_CONT - continuous                     // marge conduite continue (Art. 7)
      const canDay   = maxDaily - dailyDriven                    // marge journalière
      const canWork  = work >= WORK_6H ? 0 : (WORK_6H - work)  // marge travail (Directive)
      // Pause fractionnée : conduire jusqu'au seuil S1 si pas encore effectué
      const canS1    = (breakStrategy === 'split' && !splitS1Done && continuous < S1_THRESHOLD)
        ? (S1_THRESHOLD - continuous)
        : Infinity
      const canDrive = Math.min(canCont, canDay, canWork, canS1, legRemaining)

      if (canDrive <= 0) {
        // Doit insérer une pause avant de conduire
        const kmHere = totalKm + (leg.driveMinutes > 0 ? (legDriven / leg.driveMinutes) * legKm : 0)
        if (continuous >= MAX_CONT) {
          // La pause conduite a la priorité (elle satisfait aussi la pause travail)
          insertDrivingBreak(kmHere)
        } else if (work >= WORK_6H) {
          insertWorkBreak(kmHere)
        } else if (breakStrategy === 'split' && !splitS1Done && continuous >= S1_THRESHOLD) {
          insertS1(kmHere)
        } else {
          break  // garde-fou — ne devrait pas arriver
        }
        continue
      }

      // Position km de ce bloc
      const f0     = leg.driveMinutes > 0 ? legDriven / leg.driveMinutes : 0
      const f1     = leg.driveMinutes > 0 ? (legDriven + canDrive) / leg.driveMinutes : 1
      const kmStart = totalKm + f0 * legKm
      const kmEnd   = totalKm + f1 * legKm

      // Segment de conduite
      segments.push({
        type: 'drive', duration: canDrive,
        legIndex: legIdx,
        atKm:   Math.round(kmStart),
        endKm:  Math.round(kmEnd),
      })
      legRemaining -= canDrive
      legDriven    += canDrive
      dailyDriven  += canDrive
      continuous   += canDrive
      work         += canDrive

      const hasMore = legRemaining > 0 || legIdx < legs.length - 1

      if (continuous >= MAX_CONT && hasMore) {
        // Pause conduite obligatoire à 4h30 (S2 si split S1 déjà fait, ou 45 min sinon)
        insertDrivingBreak(kmEnd)
      } else if (breakStrategy === 'split' && !splitS1Done && continuous >= S1_THRESHOLD && hasMore) {
        // Seuil S1 atteint : pause anticipée 15 min (conduite continue inchangée)
        insertS1(kmEnd)
      } else if (work >= WORK_6H && hasMore) {
        // Pause travail Directive (seulement si pas de pause conduite déjà insérée)
        insertWorkBreak(kmEnd)
      }
    }

    // Mise à jour du cumul km après ce leg
    totalKm += legKm
    const isLast = legIdx === legs.length - 1

    // ── Arrêt à l'étape intermédiaire ──
    if (!isLast && leg.stopDurationMinutes > 0) {
      segments.push({
        type: 'stop', duration: leg.stopDurationMinutes,
        label:    leg.stopLabel || `Arrêt ${legIdx + 1}`,
        stopType: leg.stopType  || 'other',
        reason:   `${STOP_TYPE_LABELS[leg.stopType] || 'Arrêt'} — ${leg.stopLabel || ''}`,
        atKm: Math.round(totalKm),
        legIndex: legIdx,  // pour la correspondance avec les créneaux horaires
      })

      const isRest = leg.stopType === 'rest_stop'

      if (isRest && leg.stopDurationMinutes >= 45) {
        // Repos complet : reset conduite ET travail
        continuous = 0
        work       = 0
      } else if (isRest && leg.stopDurationMinutes >= S2) {
        // Repos ≥ 30 min : reset conduite (équivaut à la 2ème partie fractionnée)
        continuous = 0
        work       = 0
      } else if (!isRest) {
        // Arrêt de travail (chargement, livraison…) : NE reset PAS la conduite continue
        work += leg.stopDurationMinutes
      }
      // rest_stop < 30 min → ni reset conduite, ni ajout travail (simple pause courte)

      // Vérifier si pause travail nécessaire après l'arrêt
      if (!isRest || leg.stopDurationMinutes < S2) {
        if      (work >= WORK_9H) insertWorkBreak(totalKm)
        else if (work >= WORK_6H) insertWorkBreak(totalKm)
      }
    }

    // ── Activité à l'arrivée (dernier leg seulement) ──
    if (isLast && leg.arrivalStop?.durationMinutes > 0) {
      const arr = leg.arrivalStop
      segments.push({
        type: 'stop', duration: arr.durationMinutes,
        label: arr.label || 'Arrivée',
        stopType: arr.type || 'delivery',
        reason: `${STOP_TYPE_LABELS[arr.type] || 'Livraison'} à l'arrivée`,
        atKm: Math.round(totalKm), isArrival: true,
      })
      if (arr.type !== 'rest_stop') work += arr.durationMinutes
    }
  }

  return segments
}

// ---------------------------------------------------------------------------
// Créneaux horaires — injection des attentes
// ---------------------------------------------------------------------------

/**
 * Parse une chaîne "HH:MM" sur le même jour calendaire que referenceDate.
 * Si l'heure calculée est plus de 30 min dans le passé → avance d'un jour.
 */
function parseTimeWindowDate(timeStr, referenceDate) {
  if (!timeStr || !timeStr.includes(':')) return null
  const [h, m] = timeStr.split(':').map(Number)
  if (isNaN(h) || isNaN(m)) return null
  const d = new Date(referenceDate)
  d.setHours(h, m, 0, 0)
  // Si le créneau est clairement passé (ex : référence=14h, créneau=08h) → lendemain
  if (d.getTime() < referenceDate.getTime() - 30 * 60_000) {
    d.setDate(d.getDate() + 1)
  }
  return d
}

/**
 * Injecte des segments « wait » avant chaque stop dont le créneau horaire
 * impose d'attendre. Retourne aussi la liste des violations (arrivée trop tardive).
 *
 * @param {Array}  segments      - segments bruts (sans attentes)
 * @param {Date}   departureTime - heure de départ provisoire
 * @param {Array}  legs          - legs avec stopTimeWindow, departureStop.timeWindow, arrivalStop.timeWindow
 */
function injectTimeWindowWaits(segments, departureTime, legs) {
  const result    = []
  const violations = []
  let elapsed = 0   // minutes écoulées depuis le départ

  for (const seg of segments) {
    if (seg.type === 'stop') {
      // Retrouver le créneau correspondant à cet arrêt
      let tw = null
      if (seg.isDeparture) {
        tw = legs[0]?.departureStop?.timeWindow
      } else if (seg.isArrival) {
        tw = legs[legs.length - 1]?.arrivalStop?.timeWindow
      } else if (seg.legIndex !== undefined) {
        tw = legs[seg.legIndex]?.stopTimeWindow
      }

      if (tw?.enabled && (tw.exact || tw.from)) {
        const arrivalDate = new Date(departureTime.getTime() + elapsed * 60_000)

        const openDate  = parseTimeWindowDate(tw.mode === 'exact' ? tw.exact : tw.from, arrivalDate)
        const closeDate = tw.mode === 'window' && tw.to
          ? parseTimeWindowDate(tw.to, arrivalDate)
          : openDate   // pour 'exact', on tolère 1 min après

        if (openDate && arrivalDate < openDate) {
          // Trop tôt — attendre l'ouverture du créneau
          const waitMin = Math.max(1, Math.round((openDate - arrivalDate) / 60_000))
          result.push({
            type: 'wait',
            duration: waitMin,
            reason: tw.mode === 'exact'
              ? `⏳ Attente créneau — heure fixée à ${tw.exact}`
              : `⏳ Attente ouverture créneau ${tw.from}–${tw.to}`,
            isTimeWindowWait: true,
            atKm: seg.atKm || 0,
            windowInfo: { ...tw },
          })
          elapsed += waitMin
        } else if (closeDate && arrivalDate > new Date(closeDate.getTime() + 60_000)) {
          // Trop tard — violation de créneau
          violations.push({
            stopLabel: seg.label || seg.reason?.split(' — ')[0] || 'Arrêt',
            windowStr: tw.mode === 'exact'
              ? `exactement à ${tw.exact}`
              : `entre ${tw.from} et ${tw.to}`,
            lateBy: Math.round((arrivalDate - closeDate) / 60_000),
          })
        }
      }
    }

    result.push(seg)
    elapsed += seg.duration
  }

  const totalWaitMinutes = result
    .filter(s => s.type === 'wait')
    .reduce((s, x) => s + x.duration, 0)

  return { segments: result, totalWaitMinutes, timeWindowViolations: violations }
}

// ---------------------------------------------------------------------------
// Timeline absolue
// ---------------------------------------------------------------------------

function buildTimeline(segments, departure) {
  const timeline = []
  let current = new Date(departure)

  for (let i = 0; i < segments.length; i++) {
    const seg   = segments[i]
    const start = new Date(current)
    const end   = new Date(current.getTime() + seg.duration * 60_000)
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
      currentDay.restEnd   = event.endTime
      days.push(currentDay)
      currentDay = {
        number:      currentDay.number + 1,
        segments:    [],
        driveMinutes: 0, breakMinutes: 0, stopMinutes: 0,
        startTime: event.endTime,
      }
    } else {
      currentDay.segments.push(event)
      if (event.type === 'drive')  currentDay.driveMinutes += event.duration
      if (event.type === 'break')  currentDay.breakMinutes += event.duration
      if (event.type === 'stop')   currentDay.stopMinutes  += event.duration
      if (!currentDay.startTime)   currentDay.startTime     = event.startTime
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
  timeWindowViolations = [],
}) {
  const tripDrive    = segments.filter(s => s.type === 'drive').reduce((s, seg) => s + seg.duration, 0)
  const newWeekly    = weeklyDriveMinutes + tripDrive
  const newBiweekly  = biweeklyDriveMinutes + tripDrive

  const violations        = []
  const warnings          = []
  const derogationsUsed   = []

  if (newWeekly > rules.maxWeeklyDrive) {
    violations.push({
      severity: 'critical',
      message: `Limite hebdomadaire dépassée : ${Math.round(newWeekly / 60)}h > 56h`,
      article: 'Art. 6(2) UE 561/2006',
    })
  } else if (newWeekly > rules.maxWeeklyDrive * 0.9) {
    warnings.push({ message: `Proche de la limite hebdomadaire : ${Math.round(newWeekly / 60)}h / 56h` })
  }

  if (newBiweekly > rules.maxBiweeklyDrive) {
    violations.push({
      severity: 'critical',
      message: `Limite bihebdomadaire dépassée : ${Math.round(newBiweekly / 60)}h > 90h`,
      article: 'Art. 6(3) UE 561/2006',
    })
  }

  const usedReducedRest = segments.some(s => s.type === 'overnight_rest' && s.derogation)
  if (usedReducedRest) {
    derogationsUsed.push({
      type: 'reduced_rest', label: 'Repos journalier réduit à 9h (dérogation)',
      article: 'Art. 8(1) UE 561/2006',
      info: 'Autorisé 3 fois maximum entre deux repos hebdomadaires',
    })
  }

  if (maxDaily > rules.maxDailyDrive && useDerogations) {
    derogationsUsed.push({
      type: 'extended_daily',
      label: `Dérogation 10h/jour appliquée (${extendedDaysThisWeek + 1}/${rules.maxExtendedPerWeek} cette semaine)`,
      article: 'Art. 6(1) UE 561/2006',
    })
  }

  const infosReglementaires = []
  const breakCount = segments.filter(s => s.type === 'break').length
  const restCount  = segments.filter(s => s.type === 'overnight_rest').length
  if (breakCount > 0) infosReglementaires.push(`${breakCount} pause${breakCount > 1 ? 's' : ''} planifiée${breakCount > 1 ? 's' : ''}`)
  if (restCount  > 0) infosReglementaires.push(`${restCount} repos journalier${restCount > 1 ? 's' : ''} intercalé${restCount > 1 ? 's' : ''} (trajet sur ${restCount + 1} jours)`)

  // Détecter les pauses travail (Directive)
  const workBreakCount = segments.filter(s => s.type === 'break' && s.isWorkBreak).length
  if (workBreakCount > 0) {
    infosReglementaires.push(`${workBreakCount} pause${workBreakCount > 1 ? 's' : ''} temps de travail (Directive 2002/15/CE)`)
  }

  // Violations de créneaux horaires
  for (const v of timeWindowViolations) {
    violations.push({
      severity: 'warning',
      message:  `Créneau manqué — ${v.stopLabel} : attendu ${v.windowStr}, retard de ${v.lateBy} min`,
      article:  'Contrainte client',
    })
  }

  return {
    isCompliant: violations.length === 0,
    violations, warnings, derogationsUsed, infosReglementaires,
    tripDrive, newWeeklyTotal: newWeekly, newBiweeklyTotal: newBiweekly,
    remainingWeeklyDrive:    Math.max(0, rules.maxWeeklyDrive    - newWeekly),
    remainingBiweeklyDrive:  Math.max(0, rules.maxBiweeklyDrive  - newBiweekly),
    timeWindowViolations,
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
  const recs   = []
  const breaks = segments.filter(s => s.type === 'break')
  const rests  = segments.filter(s => s.type === 'overnight_rest')

  if (rests.length > 0) {
    recs.push({
      type: 'info', title: `Trajet sur ${days.length} jours`,
      body: `Ce trajet nécessite ${rests.length} repos journalier${rests.length > 1 ? 's' : ''} intercalé${rests.length > 1 ? 's' : ''}. Prévoyez un hébergement ou un parking PL sécurisé.`,
    })
  }

  if (compliance.derogationsUsed.some(d => d.type === 'extended_daily')) {
    recs.push({
      type: 'warning', title: 'Dérogation 10h/jour',
      body: `Vérifiez que vous n'avez pas déjà utilisé cette dérogation ${rules.maxExtendedPerWeek} fois cette semaine.`,
    })
  }

  if (breaks.length === 0 && rests.length === 0) {
    recs.push({
      type: 'success', title: 'Trajet fluide',
      body: 'Aucune pause ni repos obligatoire requis pour ce trajet.',
    })
  }

  if (compliance.remainingWeeklyDrive < 300) {
    recs.push({
      type: 'warning', title: 'Solde hebdo faible',
      body: `Il vous reste ${Math.round(compliance.remainingWeeklyDrive / 60 * 10) / 10}h de conduite autorisées cette semaine.`,
    })
  }

  if (compliance.violations.length > 0) {
    recs.push({
      type: 'error', title: 'Trajet non conforme',
      body: 'Ce trajet dépasse vos quotas restants. Envisagez de décaler le départ à la semaine suivante.',
    })
  }

  // Rappel sur les pauses travail
  const workBreaks = segments.filter(s => s.type === 'break' && s.isWorkBreak)
  if (workBreaks.length > 0) {
    recs.push({
      type: 'info', title: `${workBreaks.length} pause${workBreaks.length > 1 ? 's' : ''} travail planifiée${workBreaks.length > 1 ? 's' : ''} (Directive)`,
      body: `La Directive 2002/15/CE impose une pause après 6h de travail effectif (conduite + activités). Ces pauses sont intégrées au planning.`,
    })
  }

  return recs
}

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

export const STOP_TYPES = [
  { id: 'loading',   label: 'Chargement',     icon: '🔧', defaultDuration: 45 },
  { id: 'delivery',  label: 'Livraison',       icon: '📦', defaultDuration: 20 },
  { id: 'fuel',      label: 'Carburant',       icon: '⛽', defaultDuration: 15 },
  { id: 'customs',   label: 'Douane',          icon: '🛂', defaultDuration: 30 },
  { id: 'rest_stop', label: 'Pause technique', icon: '🅿️', defaultDuration: 30 },
  { id: 'other',     label: 'Autre arrêt',     icon: '📍', defaultDuration: 15 },
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
    legs: [{ driveMinutes: rawDriveMinutes, stopDurationMinutes: 0, stopLabel: '', distanceKm: 0 }],
    vehicleTypeId, mode, targetTime, bufferMinutes, breakStrategy, useDerogations, driverState,
  })
}
