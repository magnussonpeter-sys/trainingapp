import type {
  SimulationConfig,
  SimulationPlannerMode,
  SimulationScenario,
  SimulationUserProfile,
} from "@/lib/simulation/types";
import type { SeededRandom } from "@/lib/simulation/random";

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

export function normalizeAvailableTrainingDayIndices(indices?: number[]) {
  return normalizePlannedWorkoutDayIndices(indices);
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

function derivePreferredDaysFromAvailable(params: {
  availableTrainingDayIndices: number[];
  preferredWorkoutDaysPerWeek: number;
}) {
  const normalizedAvailable =
    normalizeAvailableTrainingDayIndices(params.availableTrainingDayIndices);
  const desiredCount = Math.min(Math.max(params.preferredWorkoutDaysPerWeek, 1), 7);

  if (normalizedAvailable.length === 0) {
    return getDefaultPlannedWorkoutDayIndices(desiredCount);
  }

  if (normalizedAvailable.length === desiredCount) {
    return normalizedAvailable;
  }

  const defaultTemplate = getDefaultPlannedWorkoutDayIndices(desiredCount);
  const filteredTemplate = defaultTemplate.filter((index) =>
    normalizedAvailable.includes(index),
  );

  if (filteredTemplate.length >= desiredCount) {
    return filteredTemplate.slice(0, desiredCount);
  }

  const selected = [...new Set([...filteredTemplate, ...normalizedAvailable])];

  if (selected.length >= desiredCount) {
    return selected.slice(0, desiredCount);
  }

  for (const day of [1, 3, 5, 2, 4, 6, 0]) {
    if (selected.length >= desiredCount) {
      break;
    }

    if (!selected.includes(day)) {
      selected.push(day);
    }
  }

  return selected.slice(0, desiredCount).sort((left, right) => left - right);
}

export function deriveSimulationPlannedWorkoutDayIndices(params: {
  availableTrainingDayIndices?: number[];
  plannedWorkoutDayIndices?: number[];
  preferredWorkoutDaysPerWeek: number;
}) {
  const explicitPlanned = normalizePlannedWorkoutDayIndices(
    params.plannedWorkoutDayIndices,
  );

  if (explicitPlanned.length > 0) {
    return explicitPlanned;
  }

  return derivePreferredDaysFromAvailable({
    availableTrainingDayIndices:
      normalizeAvailableTrainingDayIndices(params.availableTrainingDayIndices),
    preferredWorkoutDaysPerWeek: params.preferredWorkoutDaysPerWeek,
  });
}

export function formatPlannedWorkoutDayLabels(indices: number[]) {
  return normalizePlannedWorkoutDayIndices(indices).map((index) => getWeekdayLabel(index));
}

export function normalizeSimulationPlannerMode(
  mode: SimulationPlannerMode | undefined,
) {
  if (
    mode === "hybrid_ai" ||
    mode === "real_app_planner" ||
    mode === "full_app_chain"
  ) {
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

  if (params.scenario === "realistic_user") {
    profile.adherenceProfile = "medium";
    profile.recoveryProfile = "average";
    // Keep vardagsstress realistic, but not so high that it dominates
    // adherence on top of the scenario's own "real user" behavior.
    profile.lifeStressBase = Math.max(profile.lifeStressBase, 40);
    notes.push("Scenariot blandar realistiskt vardagsbeteende: några missade pass, vissa kortare pass och ibland spontana extrapass.");
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
    notes.push("real_app_planner använder appens riktiga weekly-plan-helpers för planeringsbeslut.");
  }

  if (params.plannerMode === "full_app_chain") {
    notes.push("full_app_chain använder riktig veckoplanering, training history context och riktig AI-generering.");
  }

  if (params.scenario === "short_sessions") {
    notes.push("Scenariot kortar ned genomförda pass för att testa delvis uppfyllda planerade dagar.");
  }

  if (params.scenario === "realistic_user") {
    notes.push("Scenariot låter simuleringen bete sig mer som en verklig användare över veckan.");
  }

  if (params.scenario === "missed_workouts") {
    notes.push("Scenariot missar vissa planerade pass deterministiskt.");
  }

  if (params.scenario === "spontaneous_lower_before_planned_lower") {
    notes.push("Scenariot lägger ibland in ett spontant, realistiskt extrapass på vilodagar.");
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
  date: string;
  plannedWeekDays: Set<number>;
  random: SeededRandom;
}) {
  if (
    params.scenario !== "spontaneous_lower_before_planned_lower" &&
    params.scenario !== "realistic_user"
  ) {
    return false;
  }

  const currentWeekday = getWeekdayIndexForDate(params.date);
  if (params.plannedWeekDays.has(currentWeekday)) {
    return false;
  }

  const restDaysPerWeek = Math.max(1, 7 - params.plannedWeekDays.size);
  const weeklyProbability =
    params.scenario === "realistic_user" ? 0.65 : 1;

  // Seedad sannolikhet ger reproducerbara spontana extrapass och landar i snitt runt ett per vecka.
  return params.random.chance(weeklyProbability / restDaysPerWeek);
}

export function adjustScenarioWorkoutDuration(params: {
  scenario: SimulationScenario;
  plannedDurationMin: number;
  actualDurationMin: number;
  random?: SeededRandom;
}) {
  if (params.scenario !== "short_sessions") {
    if (params.scenario !== "realistic_user") {
      return params.actualDurationMin;
    }

    if (!params.random) {
      return params.actualDurationMin;
    }

    if (params.random.chance(0.35)) {
      return Math.max(
        10,
        Math.min(
          params.actualDurationMin,
          Math.round(params.plannedDurationMin * params.random.between(0.55, 0.85)),
        ),
      );
    }

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
  return new Set(
    deriveSimulationPlannedWorkoutDayIndices({
      availableTrainingDayIndices: params.config.availableTrainingDayIndices,
      plannedWorkoutDayIndices: params.config.plannedWorkoutDayIndices,
      preferredWorkoutDaysPerWeek: params.profile.preferredWorkoutDaysPerWeek,
    }),
  );
}
