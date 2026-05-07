import {
  buildInitialWeeklyPlan,
  formatWeekdayLabel,
  type PlannedSessionFocus,
  type Weekday,
  type WeeklyPlanSettings,
} from "@/lib/planning/weekly-plan";
import type { MuscleBudgetGroup } from "@/lib/planning/muscle-budget";
import type { WorkoutLog } from "@/lib/workout-log-storage";
import type {
  SimulationDailySnapshot,
  SimulationScenario,
  SimulationUserProfile,
} from "@/lib/simulation/types";

const WEEKDAY_BY_INDEX: Record<number, Weekday> = {
  0: "sunday",
  1: "monday",
  2: "tuesday",
  3: "wednesday",
  4: "thursday",
  5: "friday",
  6: "saturday",
};

function normalizeExtraReps(value: number | undefined) {
  if (value === 0 || value === 2 || value === 4 || value === 6) {
    return value;
  }

  return null;
}

function toSimulationCompletedAt(date: string) {
  return `${date}T18:00:00.000Z`;
}

function toSimulationStartedAt(date: string, actualDurationMin: number) {
  const endTime = new Date(toSimulationCompletedAt(date));
  endTime.setMinutes(endTime.getMinutes() - Math.max(1, Math.round(actualDurationMin)));
  return endTime.toISOString();
}

export function mapWeekdayIndexToWeeklyPlanDay(index: number): Weekday {
  return WEEKDAY_BY_INDEX[((index % 7) + 7) % 7] ?? "monday";
}

export function getSimulationPriorityMuscles(
  scenario: SimulationScenario,
): MuscleBudgetGroup[] {
  if (scenario === "priority_upper_body") {
    return ["chest", "back", "biceps", "triceps", "shoulders"];
  }

  return [];
}

export function buildSimulationWeeklyPlanSettings(params: {
  profile: SimulationUserProfile;
  plannedWorkoutDayIndices: number[];
  priorityMuscles?: MuscleBudgetGroup[];
  nowIso: string;
}): WeeklyPlanSettings {
  const preferredDays = params.plannedWorkoutDayIndices.map(mapWeekdayIndexToWeeklyPlanDay);
  const normalizedPreferredDays: Weekday[] =
    preferredDays.length > 0 ? preferredDays : ["monday", "wednesday", "friday"];
  const defaultDurationMinutes = Math.max(20, Math.round(params.profile.preferredSessionDurationMin));
  const minDurationMinutes =
    typeof params.profile.weeklyPlanMinDurationMin === "number"
      ? Math.max(10, Math.round(params.profile.weeklyPlanMinDurationMin))
      : Math.max(15, Math.round(defaultDurationMinutes * 0.55));
  const maxDurationMinutes =
    typeof params.profile.weeklyPlanMaxDurationMin === "number"
      ? Math.max(minDurationMinutes, Math.round(params.profile.weeklyPlanMaxDurationMin))
      : Math.max(defaultDurationMinutes, Math.round(defaultDurationMinutes * 1.35));

  return {
    userId: params.profile.id,
    sessionsPerWeek: Math.min(Math.max(params.profile.preferredWorkoutDaysPerWeek, 1), 6),
    preferredDays: normalizedPreferredDays,
    defaultDurationMinutes,
    minDurationMinutes,
    maxDurationMinutes,
    preferredGymId:
      typeof params.profile.availableGymId === "number"
        ? String(params.profile.availableGymId)
        : null,
    flexibility:
      params.profile.weeklyPlanFlexibility ??
      (params.profile.adherenceProfile === "high"
        ? "strict"
        : params.profile.adherenceProfile === "low"
          ? "flexible"
          : "balanced"),
    // Simulationsläget återanvänder riktiga plannerkedjan utan att införa manuella veckoval i UI.
    priorityMuscles: params.priorityMuscles ?? [],
    easyMuscles: [],
    updatedAt: `${params.nowIso}T00:00:00.000Z`,
  };
}

export function buildSimulationWorkoutLogsFromSnapshots(params: {
  profile: SimulationUserProfile;
  snapshots: SimulationDailySnapshot[];
}): WorkoutLog[] {
  return params.snapshots
    .filter((snapshot) => snapshot.workoutResult && !snapshot.workoutResult.skipped)
    .map((snapshot) => {
      const workoutResult = snapshot.workoutResult!;
      const completedAt = toSimulationCompletedAt(workoutResult.date);
      const startedAt = toSimulationStartedAt(workoutResult.date, workoutResult.actualDurationMin);

      return {
        id: `simulation-log:${workoutResult.workoutId}`,
        userId: params.profile.id,
        workoutId: workoutResult.workoutId,
        workoutName: workoutResult.workoutName,
        startedAt,
        completedAt,
        durationSeconds: Math.max(0, Math.round(workoutResult.actualDurationMin * 60)),
        status: "completed",
        exercises: workoutResult.exerciseResults.map((exercise) => ({
          exerciseId: exercise.exerciseId,
          exerciseName: exercise.exerciseName,
          plannedSets: exercise.plannedSets,
          plannedReps: exercise.plannedReps ?? null,
          plannedDuration: exercise.plannedDurationSec ?? null,
          isNewExercise: false,
          rating: Math.round(exercise.exerciseRating),
          extraReps: normalizeExtraReps(exercise.extraRepsEstimate),
          timedEffort: null,
          sets: Array.from({ length: exercise.completedSets }, (_, setIndex) => ({
            setNumber: setIndex + 1,
            plannedReps: exercise.plannedReps ?? null,
            plannedDuration: exercise.plannedDurationSec ?? null,
            plannedWeight: exercise.plannedWeightKg ?? null,
            actualReps: exercise.actualAvgReps ?? exercise.plannedReps ?? null,
            actualDuration: exercise.actualAvgDurationSec ?? exercise.plannedDurationSec ?? null,
            actualWeight: exercise.actualAvgWeightKg ?? exercise.plannedWeightKg ?? null,
            repsLeft: normalizeExtraReps(exercise.extraRepsEstimate),
            timedEffort: null,
            completedAt,
          })),
        })),
        metadata: {
          simulation: true,
          plannerSource: snapshot.generatedWorkoutSummary?.plannerSource ?? "synthetic",
          dayEvent: snapshot.dayEvent,
        },
        excludeFromAnalysis: false,
        analysisExclusionReason: null,
      } satisfies WorkoutLog;
    });
}

export function buildSimulationWeekPlannedSessions(params: {
  settings: WeeklyPlanSettings;
  weekStartDate: string;
}) {
  return buildInitialWeeklyPlan(params.settings, params.weekStartDate);
}

export function formatSimulationFocusLabel(focus: PlannedSessionFocus) {
  return focus === "upper"
    ? "Överkropp"
    : focus === "lower"
      ? "Ben"
      : focus === "full_body"
        ? "Helkropp"
        : focus === "push"
          ? "Press"
          : focus === "pull"
            ? "Drag"
            : focus === "core"
              ? "Bål"
              : "Rörlighet";
}

export function formatSimulationPreferredDayLabels(dayIndices: number[]) {
  return dayIndices.map((index) => formatWeekdayLabel(mapWeekdayIndexToWeeklyPlanDay(index)));
}
