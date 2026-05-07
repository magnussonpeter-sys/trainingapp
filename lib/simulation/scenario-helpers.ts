import type {
  SimulationConfig,
  SimulationPlannerMode,
  SimulationScenario,
  SimulationUserProfile,
} from "@/lib/simulation/types";

const WEEKDAY_LABELS = [
  "Söndag",
  "Måndag",
  "Tisdag",
  "Onsdag",
  "Torsdag",
  "Fredag",
  "Lördag",
] as const;

export function addDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00`);
  value.setDate(value.getDate() + days);
  return value.toISOString().slice(0, 10);
}

export function getWeekdayIndexForDate(date: string) {
  return new Date(`${date}T00:00:00`).getDay();
}

export function getWeekdayLabel(index: number) {
  return WEEKDAY_LABELS[((index % 7) + 7) % 7];
}

export function normalizePlannedWorkoutDayIndices(indices?: number[]) {
  if (!indices?.length) {
    return [];
  }

  return Array.from(
    new Set(
      indices
        .filter((value) => Number.isFinite(value))
        .map((value) => ((Math.round(value) % 7) + 7) % 7),
    ),
  ).sort((left, right) => left - right);
}

export function getDefaultPlannedWorkoutDayIndices(daysPerWeek: number) {
  const templates: Record<number, number[]> = {
    1: [1],
    2: [1, 4],
    3: [1, 3, 5],
    4: [1, 2, 4, 6],
    5: [1, 2, 3, 5, 6],
    6: [0, 1, 2, 3, 5, 6],
    7: [0, 1, 2, 3, 4, 5, 6],
  };

  return templates[Math.min(Math.max(daysPerWeek, 1), 7)];
}

export function formatPlannedWorkoutDayLabels(indices: number[]) {
  return normalizePlannedWorkoutDayIndices(indices).map((index) => getWeekdayLabel(index));
}

export function normalizeSimulationPlannerMode(
  mode: SimulationPlannerMode | undefined,
) {
  if (mode === "hybrid_ai" || mode === "real_app_planner") {
    return mode;
  }

  return "synthetic";
}

export function normalizeSimulationScenario(
  scenario: SimulationScenario | undefined,
) {
  return scenario ?? "normal";
}

export function applyScenarioProfileTweaks(params: {
  profile: SimulationUserProfile;
  scenario: SimulationScenario;
}) {
  const profile = { ...params.profile };
  const notes: string[] = [];

  if (params.scenario === "low_adherence") {
    profile.adherenceProfile = "low";
    notes.push("Scenariot drar ned följsamheten på planerade träningsdagar.");
  }

  if (params.scenario === "high_fatigue") {
    profile.recoveryProfile = "poor";
    profile.energyTrend = "declining";
    profile.lifeStressBase = Math.max(profile.lifeStressBase, 68);
    notes.push("Scenariot startar med sämre återhämtning och högre vardagsstress.");
  }

  if (params.scenario === "priority_upper_body") {
    notes.push("Scenariot används för att observera hur pass ligger över veckan när överkropp antas extra viktig.");
  }

  return { profile, notes };
}

export function buildScenarioNotes(params: {
  plannerMode: SimulationPlannerMode;
  scenario: SimulationScenario;
}) {
  const notes: string[] = [];

  if (params.plannerMode === "real_app_planner") {
    // TODO: När riktigt planner-läge finns ska simulation använda appens skarpa planner.
    notes.push("real_app_planner finns förberett men faller i nuläget tillbaka till hybrid_ai.");
  }

  if (params.scenario === "short_sessions") {
    notes.push("Scenariot kortar ned genomförda pass för att testa delvis uppfyllda planerade dagar.");
  }

  if (params.scenario === "missed_workouts") {
    notes.push("Scenariot missar vissa planerade pass deterministiskt.");
  }

  if (params.scenario === "spontaneous_lower_before_planned_lower") {
    notes.push("Scenariot lägger in ett spontant pass dagen före vissa planerade träningsdagar.");
  }

  return notes;
}

export function shouldForceMissPlannedWorkout(params: {
  scenario: SimulationScenario;
  plannedWorkoutOrdinal: number;
}) {
  if (params.scenario === "missed_workouts") {
    return params.plannedWorkoutOrdinal % 2 === 1;
  }

  if (params.scenario === "low_adherence") {
    return params.plannedWorkoutOrdinal % 3 === 2;
  }

  return false;
}

export function shouldAddSpontaneousWorkout(params: {
  scenario: SimulationScenario;
  dayIndex: number;
  date: string;
  plannedWeekDays: Set<number>;
}) {
  if (params.scenario !== "spontaneous_lower_before_planned_lower") {
    return false;
  }

  const tomorrow = addDays(params.date, 1);
  const tomorrowWeekday = getWeekdayIndexForDate(tomorrow);

  return !params.plannedWeekDays.has(getWeekdayIndexForDate(params.date)) &&
    params.plannedWeekDays.has(tomorrowWeekday) &&
    params.dayIndex % 7 <= 4;
}

export function adjustScenarioWorkoutDuration(params: {
  scenario: SimulationScenario;
  plannedDurationMin: number;
  actualDurationMin: number;
}) {
  if (params.scenario !== "short_sessions") {
    return params.actualDurationMin;
  }

  return Math.max(
    8,
    Math.min(
      params.actualDurationMin,
      Math.round(params.plannedDurationMin * 0.55),
    ),
  );
}

export function buildPlannedWorkoutDaySet(params: {
  config: SimulationConfig;
  profile: SimulationUserProfile;
}) {
  const normalized = normalizePlannedWorkoutDayIndices(
    params.config.plannedWorkoutDayIndices,
  );

  if (normalized.length > 0) {
    return new Set(normalized);
  }

  return new Set(getDefaultPlannedWorkoutDayIndices(params.profile.preferredWorkoutDaysPerWeek));
}
