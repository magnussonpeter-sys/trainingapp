import type { WorkoutBlock } from "@/types/workout";

// Lokal builder-draft gör att användaren kan fortsätta bygga sitt pass senare.
const CUSTOM_WORKOUT_BUILDER_KEY_PREFIX = "custom_workout_builder:";

export type CustomWorkoutBuilderDraft = {
  version: 1;
  name: string;
  targetDurationMinutes: number | null;
  gymId: string;
  blocks: WorkoutBlock[];
};

function getKey(userId: string) {
  return `${CUSTOM_WORKOUT_BUILDER_KEY_PREFIX}${userId}`;
}

export function saveCustomWorkoutBuilderDraft(
  userId: string,
  draft: CustomWorkoutBuilderDraft,
) {
  try {
    localStorage.setItem(getKey(userId), JSON.stringify(draft));
  } catch (error) {
    console.error("Failed to save custom workout builder draft", error);
  }
}

export function getCustomWorkoutBuilderDraft(userId: string) {
  try {
    const raw = localStorage.getItem(getKey(userId));
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<CustomWorkoutBuilderDraft> | null;

    if (
      !parsed ||
      parsed.version !== 1 ||
      typeof parsed.name !== "string" ||
      typeof parsed.gymId !== "string" ||
      !Array.isArray(parsed.blocks)
    ) {
      return null;
    }

    return {
      version: 1,
      name: parsed.name,
      targetDurationMinutes:
        typeof parsed.targetDurationMinutes === "number" &&
        Number.isFinite(parsed.targetDurationMinutes)
          ? parsed.targetDurationMinutes
          : null,
      gymId: parsed.gymId,
      blocks: parsed.blocks,
    } satisfies CustomWorkoutBuilderDraft;
  } catch (error) {
    console.error("Failed to load custom workout builder draft", error);
    return null;
  }
}

export function clearCustomWorkoutBuilderDraft(userId: string) {
  try {
    localStorage.removeItem(getKey(userId));
  } catch (error) {
    console.error("Failed to clear custom workout builder draft", error);
  }
}
