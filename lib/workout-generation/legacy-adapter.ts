import {
  generateWorkoutWithAiCore,
  type GenerateWorkoutWithAiCoreInput,
  type GenerateWorkoutWithAiCoreResult,
} from "@/lib/workouts/generate-workout-core";

export async function runLegacyWorkoutGeneration(
  input: GenerateWorkoutWithAiCoreInput,
): Promise<GenerateWorkoutWithAiCoreResult> {
  // Legacy-kedjan lämnas intakt och kapslas bara in bakom en adapter.
  return generateWorkoutWithAiCore(input);
}
