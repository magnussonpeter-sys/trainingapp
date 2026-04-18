import { RECOVERY_SIGNAL_THRESHOLDS } from "@/lib/analysis/analysis-config";
import {
  getCompletedWorkouts,
  getWeekStart,
  parseDateMs,
  roundToSingleDecimal,
} from "@/lib/analysis/analysis-helpers";
import type {
  RecoverySignalData,
  StrengthProgressData,
} from "@/lib/analysis/analysis-types";
import type { WorkoutLog } from "@/lib/workout-log-storage";

function countWithinDays(logs: WorkoutLog[], days: number) {
  const now = Date.now();
  const threshold = days * 24 * 60 * 60 * 1000;

  return logs.filter((log) => {
    const completedAtMs = parseDateMs(log.completedAt);
    return completedAtMs > 0 && now - completedAtMs <= threshold;
  }).length;
}

function calculateWeeklyLoad(logs: WorkoutLog[]) {
  const byWeek = new Map<string, { sets: number; volume: number }>();

  for (const workout of logs) {
    const weekStart = getWeekStart(parseDateMs(workout.completedAt));
    const weekKey = weekStart.toISOString().slice(0, 10);
    const current = byWeek.get(weekKey) ?? { sets: 0, volume: 0 };

    for (const exercise of workout.exercises) {
      current.sets += exercise.sets.length;
      current.volume += exercise.sets.reduce((sum, set) => {
        if (set.actualWeight == null || set.actualReps == null) {
          return sum;
        }

        return sum + set.actualWeight * set.actualReps;
      }, 0);
    }

    byWeek.set(weekKey, current);
  }

  return Array.from(byWeek.entries()).sort((a, b) => (a[0] < b[0] ? -1 : 1));
}

export function calculateRecoverySignal(
  logs: WorkoutLog[],
  strengthProgress: StrengthProgressData,
): RecoverySignalData {
  const completedWorkouts = getCompletedWorkouts(logs);

  if (completedWorkouts.length < 3) {
    return {
      title: "Återhämtningssignal",
      status: "unclear",
      statusLabel: "Osäker signal",
      body: "Det finns ännu för lite historik för att tolka balansen mellan belastning och återhämtning säkert.",
      keyData: `${completedWorkouts.length} genomförda pass`,
      supportingPoints: [
        "Signalen bygger i MVP på trend i belastning, frekvens och tydliga avvikelser.",
      ],
      recent7dFrequency: countWithinDays(completedWorkouts, 7),
      loadDeltaPercent: null,
    };
  }

  const weeklyLoad = calculateWeeklyLoad(completedWorkouts);
  const recentWeek = weeklyLoad[weeklyLoad.length - 1]?.[1] ?? { sets: 0, volume: 0 };
  const previousWeek = weeklyLoad[weeklyLoad.length - 2]?.[1] ?? { sets: 0, volume: 0 };
  const recent7dFrequency = countWithinDays(completedWorkouts, 7);

  const recentLoadScore = recentWeek.volume > 0 ? recentWeek.volume : recentWeek.sets * 100;
  const previousLoadScore =
    previousWeek.volume > 0 ? previousWeek.volume : previousWeek.sets * 100;
  const loadDeltaPercent =
    previousLoadScore > 0
      ? ((recentLoadScore - previousLoadScore) / previousLoadScore) * 100
      : null;

  const recentAbortedCount = logs.filter((log) => log.status === "aborted").length;

  const shouldWatch =
    (loadDeltaPercent !== null &&
      loadDeltaPercent >= RECOVERY_SIGNAL_THRESHOLDS.elevatedWeeklyLoadPercent) ||
    recent7dFrequency >= RECOVERY_SIGNAL_THRESHOLDS.highFrequency7d ||
    (strengthProgress.status === "watch" &&
      loadDeltaPercent !== null &&
      loadDeltaPercent > 0) ||
    recentAbortedCount > 0;

  const status = shouldWatch ? "watch" : "stable";
  const statusLabel = shouldWatch ? "Bevaka återhämtning" : "Stabil signal";
  const body = shouldWatch
    ? "Belastningen har ökat eller ligger tätt nog för att det är värt att bevaka hur kroppen svarar nästa vecka."
    : "Frekvens och belastning ser relativt balanserade ut just nu utifrån den data som finns.";

  const supportingPoints = [
    loadDeltaPercent !== null
      ? `Veckobelastningen förändrades cirka ${roundToSingleDecimal(loadDeltaPercent)}% jämfört med veckan innan.`
      : "Vi saknar tillräckligt jämna veckodata för en tydlig belastningstrend.",
    recentAbortedCount > 0
      ? `Det finns ${recentAbortedCount} avbrutna pass i historiken, vilket kan vara värt att hålla koll på.`
      : "Inga tydliga avbrottssignaler syns i den senaste historiken.",
  ];

  return {
    title: "Återhämtningssignal",
    status,
    statusLabel,
    body,
    keyData: `${recent7dFrequency} pass senaste 7 dagarna`,
    supportingPoints,
    recent7dFrequency,
    loadDeltaPercent: loadDeltaPercent !== null ? roundToSingleDecimal(loadDeltaPercent) : null,
  };
}
