import {
  EXERCISE_CATALOG,
  getExerciseById,
} from "@/lib/exercise-catalog";

type ExerciseLike = {
  id?: string | null;
  name?: string | null;
  description?: string | null;
  isCustom?: boolean | null;
  isNewExercise?: boolean | null;
};

function normalizeText(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

// Avgör om övningen ska betraktas som egen/custom.
// Då ska vi inte försöka fylla på katalogbeskrivning.
function isCustomExercise(exercise: ExerciseLike) {
  if (exercise.isCustom === true || exercise.isNewExercise === true) {
    return true;
  }

  const id = exercise.id?.trim().toLowerCase() ?? "";
  if (id.startsWith("custom_")) {
    return true;
  }

  return false;
}

// Hämtar beskrivning från katalogen i första hand via id, annars via namn.
export function resolveExerciseDescription(exercise: ExerciseLike) {
  const existingDescription = exercise.description?.trim();
  if (existingDescription) {
    return existingDescription;
  }

  if (isCustomExercise(exercise)) {
    return undefined;
  }

  const exerciseId = exercise.id?.trim();
  if (exerciseId) {
    const byId = getExerciseById(exerciseId);
    if (byId?.description?.trim()) {
      return byId.description.trim();
    }
  }

  const exerciseName = exercise.name?.trim();
  if (!exerciseName) {
    return undefined;
  }

  const normalizedName = normalizeText(exerciseName);

  const byName = EXERCISE_CATALOG.find((item) => {
    return normalizeText(item.name) === normalizedName;
  });

  return byName?.description?.trim() || undefined;
}