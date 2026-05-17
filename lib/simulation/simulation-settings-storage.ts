"use client";

import type {
  SimulationExperienceLevel,
  SimulationGoal,
  SimulationPlannerMode,
  SimulationPriorityMuscle,
  SimulationScenario,
  SimulationSportFocus,
  SimulationTrainingDoseMode,
  SimulationWeeklyPlanFlexibility,
} from "@/lib/simulation/types";
import type { SimulationWorkoutGenerationMode } from "@/lib/workout-generation/types";
import { normalizeSimulationWorkoutGenerationMode } from "@/lib/workout-generation/types";

type StoredSimulationSettings = {
  version: 1;
  days?: number;
  seed?: number;
  startDate?: string;
  scenario?: SimulationScenario;
  goal?: SimulationGoal;
  sex?: "male" | "female" | "other";
  age?: number;
  heightCm?: number;
  weightKg?: number;
  experienceLevel?: SimulationExperienceLevel | "novice";
  trainingDoseMode?: SimulationTrainingDoseMode;
  sessionsPerWeek?: number;
  preferredSessionDurationMin?: number;
  minDurationMinutes?: number;
  maxDurationMinutes?: number;
  weeklyPlanFlexibility?: SimulationWeeklyPlanFlexibility;
  sportFocus?: SimulationSportFocus;
  priorityMuscles?: SimulationPriorityMuscle[];
  selectedGymId?: string;
  plannerMode?: SimulationPlannerMode;
  generationMode?: SimulationWorkoutGenerationMode;
  maxAiGeneratedWorkouts?: number;
  availableTrainingDayIndices?: number[];
  plannedWorkoutDayIndices?: number[];
};

const STORAGE_KEY = "simulation_settings:v1";

function isSimulationGoal(value: unknown): value is SimulationGoal {
  return (
    value === "strength" ||
    value === "hypertrophy" ||
    value === "body_composition" ||
    value === "health"
  );
}

function isExperienceLevel(
  value: unknown,
): value is SimulationExperienceLevel | "novice" {
  return (
    value === "beginner" ||
    value === "novice" ||
    value === "intermediate" ||
    value === "advanced"
  );
}

function isPlannerMode(value: unknown): value is SimulationPlannerMode {
  return (
    value === "synthetic" ||
    value === "hybrid_ai" ||
    value === "real_app_planner" ||
    value === "full_app_chain"
  );
}

function isScenario(value: unknown): value is SimulationScenario {
  return (
    value === "normal" ||
    value === "realistic_user" ||
    value === "missed_workouts" ||
    value === "short_sessions" ||
    value === "spontaneous_lower_before_planned_lower" ||
    value === "high_fatigue" ||
    value === "low_adherence" ||
    value === "priority_upper_body"
  );
}

function isSportFocus(value: unknown): value is SimulationSportFocus {
  return (
    value === "none" ||
    value === "running" ||
    value === "cross_country_skiing" ||
    value === "alpine_skiing" ||
    value === "cycling" ||
    value === "ball_sports" ||
    value === "swimming" ||
    value === "golf" ||
    value === "surf_sports" ||
    value === "general_athletic"
  );
}

function isPriorityMuscle(value: unknown): value is SimulationPriorityMuscle {
  return (
    value === "chest" ||
    value === "back" ||
    value === "quads" ||
    value === "hamstrings" ||
    value === "glutes" ||
    value === "shoulders" ||
    value === "biceps" ||
    value === "triceps" ||
    value === "calves" ||
    value === "core"
  );
}

function isWeeklyPlanFlexibility(
  value: unknown,
): value is SimulationWeeklyPlanFlexibility {
  return value === "strict" || value === "balanced" || value === "flexible";
}

function isTrainingDoseMode(value: unknown): value is SimulationTrainingDoseMode {
  return value === "recommended" || value === "manual";
}

function normalizePositiveNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.round(value)
    : null;
}

export function getStoredSimulationSettings(): StoredSimulationSettings | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Record<string, unknown>;

    return {
      version: 1,
      days: normalizePositiveNumber(parsed.days) ?? undefined,
      seed: normalizePositiveNumber(parsed.seed) ?? undefined,
      startDate:
        typeof parsed.startDate === "string" && parsed.startDate.trim().length > 0
          ? parsed.startDate
          : undefined,
      scenario: isScenario(parsed.scenario) ? parsed.scenario : undefined,
      goal: isSimulationGoal(parsed.goal) ? parsed.goal : undefined,
      sex:
        parsed.sex === "male" || parsed.sex === "female" || parsed.sex === "other"
          ? parsed.sex
          : undefined,
      age: normalizePositiveNumber(parsed.age) ?? undefined,
      heightCm: normalizePositiveNumber(parsed.heightCm) ?? undefined,
      weightKg: normalizePositiveNumber(parsed.weightKg) ?? undefined,
      experienceLevel: isExperienceLevel(parsed.experienceLevel)
        ? parsed.experienceLevel
        : undefined,
      trainingDoseMode: isTrainingDoseMode(parsed.trainingDoseMode)
        ? parsed.trainingDoseMode
        : undefined,
      sessionsPerWeek: normalizePositiveNumber(parsed.sessionsPerWeek) ?? undefined,
      preferredSessionDurationMin:
        normalizePositiveNumber(parsed.preferredSessionDurationMin) ?? undefined,
      minDurationMinutes:
        normalizePositiveNumber(parsed.minDurationMinutes) ?? undefined,
      maxDurationMinutes:
        normalizePositiveNumber(parsed.maxDurationMinutes) ?? undefined,
      weeklyPlanFlexibility: isWeeklyPlanFlexibility(parsed.weeklyPlanFlexibility)
        ? parsed.weeklyPlanFlexibility
        : undefined,
      sportFocus: isSportFocus(parsed.sportFocus) ? parsed.sportFocus : undefined,
      priorityMuscles: Array.isArray(parsed.priorityMuscles)
        ? parsed.priorityMuscles.filter(isPriorityMuscle).slice(0, 3)
        : undefined,
      selectedGymId:
        typeof parsed.selectedGymId === "string" ? parsed.selectedGymId : undefined,
      plannerMode: isPlannerMode(parsed.plannerMode) ? parsed.plannerMode : undefined,
      generationMode:
        typeof parsed.generationMode === "string"
          ? normalizeSimulationWorkoutGenerationMode(parsed.generationMode)
          : undefined,
      maxAiGeneratedWorkouts:
        normalizePositiveNumber(parsed.maxAiGeneratedWorkouts) ?? undefined,
      availableTrainingDayIndices: Array.isArray(parsed.availableTrainingDayIndices)
        ? parsed.availableTrainingDayIndices
            .filter((value): value is number => typeof value === "number" && Number.isFinite(value))
            .map((value) => ((Math.round(value) % 7) + 7) % 7)
            .slice(0, 7)
        : undefined,
      plannedWorkoutDayIndices: Array.isArray(parsed.plannedWorkoutDayIndices)
        ? parsed.plannedWorkoutDayIndices
            .filter((value): value is number => typeof value === "number" && Number.isFinite(value))
            .map((value) => ((Math.round(value) % 7) + 7) % 7)
            .slice(0, 7)
        : undefined,
    };
  } catch {
    return null;
  }
}

export function saveStoredSimulationSettings(settings: StoredSimulationSettings) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Ignorera lokala cachefel. Simulationen fungerar fortfarande utan persistens.
  }
}
