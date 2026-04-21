import type { SyntheticExercisePlan } from "@/lib/simulation/simulate-exercise";
import type {
  SimulationExercisePerformance,
  SimulationPlannerDebugExercise,
} from "@/lib/simulation/types";

type SimulationExerciseIdentityInput =
  | Pick<SyntheticExercisePlan, "exerciseId" | "exerciseName" | "variantGroup">
  | Pick<SimulationExercisePerformance, "exerciseId" | "exerciseName" | "variantGroup">;

function normalizeToken(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[åä]/g, "a")
    .replace(/ö/g, "o")
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function normalizeSimulationExerciseDisplayName(name: string) {
  // Statistiknamn ska inte fragmenteras av extra whitespace eller små formatvariationer.
  return name.replace(/\s+/g, " ").trim();
}

export function getSimulationExerciseAggregationKey(
  exercise: SimulationExerciseIdentityInput,
) {
  const variantGroup = exercise.variantGroup?.trim();

  if (variantGroup) {
    return normalizeToken(variantGroup);
  }

  const id = exercise.exerciseId?.trim();
  const normalizedId = id ? normalizeToken(id) : "";

  if (normalizedId) {
    return normalizedId;
  }

  return normalizeToken(exercise.exerciseName);
}

export function createSimulationVariantGroup(
  exercise: Pick<SyntheticExercisePlan, "exerciseId" | "exerciseName">,
) {
  // AI kan variera id även när namnet är samma; variantGroup gör simulatorstatistiken stabil.
  const normalizedName = normalizeToken(exercise.exerciseName);

  return normalizedName || normalizeToken(exercise.exerciseId);
}

export function toPlannerDebugExercise(
  exercise: SimulationExerciseIdentityInput,
): SimulationPlannerDebugExercise {
  return {
    exerciseId: exercise.exerciseId,
    exerciseName: normalizeSimulationExerciseDisplayName(exercise.exerciseName),
    variantGroup: exercise.variantGroup,
    aggregationKey: getSimulationExerciseAggregationKey(exercise),
  };
}
