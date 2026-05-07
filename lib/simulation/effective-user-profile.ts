import type { UserSettingsSummary } from "@/lib/workouts/generate-workout-core";
import type {
  SimulationEffectiveUserProfile,
  SimulationGoal,
  SimulationUserProfile,
} from "@/lib/simulation/types";

function normalizeGoal(value: unknown): SimulationGoal | null {
  return value === "strength" ||
    value === "hypertrophy" ||
    value === "body_composition" ||
    value === "health"
    ? value
    : null;
}

function normalizeExperienceLevel(value: unknown) {
  return value === "beginner" ||
    value === "intermediate" ||
    value === "advanced"
    ? value
    : null;
}

function normalizePositiveNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.round(value)
    : null;
}

function derivePresetExpectation(presetProfileId: string | null) {
  if (presetProfileId === "intermediate_strength") {
    return {
      goal: "strength" as const,
      experienceLevel: "intermediate" as const,
    };
  }

  if (presetProfileId === "beginner_hypertrophy") {
    return {
      goal: "hypertrophy" as const,
      experienceLevel: "beginner" as const,
    };
  }

  return null;
}

// Simuleringen ska använda samma fältnamn som verkliga user settings så att
// veckoplan, AI-generering och debug lutar sig mot samma effektiva profil.
export function buildEffectiveSimulationUserProfile(params: {
  profile: SimulationUserProfile;
  plannedWorkoutDayIndices: number[];
  profilePresetId?: string | null;
  settingsOverride?: UserSettingsSummary | null;
}) {
  const sourceProfile = params.profile.name || params.profile.id;
  const settings = params.settingsOverride ?? null;
  const presetExpectation = derivePresetExpectation(params.profilePresetId ?? null);
  const goal =
    normalizeGoal(settings?.training_goal) ??
    normalizeGoal(params.profile.goal) ??
    "health";
  const experienceLevel =
    normalizeExperienceLevel(settings?.experience_level) ??
    normalizeExperienceLevel(params.profile.experienceLevel) ??
    "beginner";
  const age =
    normalizePositiveNumber(settings?.age) ??
    normalizePositiveNumber(params.profile.age);
  const heightCm =
    normalizePositiveNumber(settings?.height_cm) ??
    normalizePositiveNumber(params.profile.heightCm);
  const weightKg =
    normalizePositiveNumber(settings?.weight_kg) ??
    normalizePositiveNumber(params.profile.weightKg);
  const preferredDurationMinutes =
    normalizePositiveNumber(params.profile.preferredSessionDurationMin);
  const plannedTrainingDays =
    params.plannedWorkoutDayIndices.length > 0
      ? params.plannedWorkoutDayIndices
      : [1, 3, 5];
  const equipment =
    params.profile.availableEquipmentIds.length > 0
      ? params.profile.availableEquipmentIds
      : ["bodyweight"];
  const warnings: string[] = [];

  if (presetExpectation && presetExpectation.goal !== goal) {
    warnings.push(
      `Preset ${params.profilePresetId} antyder målet ${presetExpectation.goal}, men effectiveGoal blev ${goal}.`,
    );
  }

  if (
    presetExpectation &&
    presetExpectation.experienceLevel !== experienceLevel
  ) {
    warnings.push(
      `Preset ${params.profilePresetId} antyder erfarenhetsnivån ${presetExpectation.experienceLevel}, men effectiveExperienceLevel blev ${experienceLevel}.`,
    );
  }

  return {
    effectiveUserProfile: {
      sourceProfile,
      presetProfileId: params.profilePresetId ?? null,
      effectiveGoal: goal,
      effectiveExperienceLevel: experienceLevel,
      effectiveAge: age,
      effectiveHeightCm: heightCm,
      effectiveWeightKg: weightKg,
      effectivePlannedTrainingDays: plannedTrainingDays,
      effectivePreferredDurationMinutes: preferredDurationMinutes,
      effectiveEquipment: equipment,
      sourceByField: {
        goal: normalizeGoal(settings?.training_goal) ? "override" : "preset",
        experienceLevel: normalizeExperienceLevel(settings?.experience_level)
          ? "override"
          : "preset",
        age: normalizePositiveNumber(settings?.age) ? "override" : "preset",
        heightCm: normalizePositiveNumber(settings?.height_cm)
          ? "override"
          : "preset",
        weightKg: normalizePositiveNumber(settings?.weight_kg)
          ? "override"
          : "preset",
        plannedTrainingDays: params.plannedWorkoutDayIndices.length > 0
          ? "override"
          : "preset",
        preferredDurationMinutes: preferredDurationMinutes ? "preset" : "fallback",
        equipment: params.profile.availableEquipmentIds.length > 0
          ? "preset"
          : "fallback",
      },
      warnings,
    } satisfies SimulationEffectiveUserProfile,
    settingsSummary: {
      sex: params.profile.sex,
      age,
      weight_kg: weightKg,
      height_cm: heightCm,
      experience_level: experienceLevel,
      training_goal: goal,
      sport_focus: "none",
      avoid_supersets: false,
      superset_preference: "allowed",
      primary_priority_muscle: null,
      secondary_priority_muscle: null,
      tertiary_priority_muscle: null,
    } satisfies UserSettingsSummary,
  };
}
