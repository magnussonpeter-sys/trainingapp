import type { Exercise } from "@/types/workout";

export type ExerciseSidedness = "none" | "per_side" | "alternating";

type ExerciseExecutionLike = Pick<Exercise, "id" | "name" | "reps" | "duration"> & {
  sidedness?: ExerciseSidedness;
};

const PER_SIDE_EXERCISE_IDS = new Set([
  "bodyweight_split_squat",
  "reverse_lunge_bodyweight",
  "assisted_pistol_squat",
  "single_leg_glute_bridge",
  "step_up_bodyweight",
  "side_plank",
  "bird_dog",
  "one_arm_dumbbell_row",
  "bulgarian_split_squat",
  "dumbbell_reverse_lunge",
  "dumbbell_step_up",
  "bird_dog_row",
  "dumbbell_suitcase_carry",
  "barbell_walking_lunge",
  "pallof_press",
  "cable_woodchopper",
]);

function isKnownPerSideExercise(exercise: ExerciseExecutionLike) {
  const normalizedName = exercise.name.toLowerCase();

  return (
    PER_SIDE_EXERCISE_IDS.has(exercise.id) ||
    normalizedName.includes("sidoplanka") ||
    normalizedName.includes("per sida")
  );
}

export function getExerciseSidedness(
  exercise: ExerciseExecutionLike | null | undefined,
): ExerciseSidedness {
  if (!exercise) {
    return "none";
  }

  if (exercise.sidedness === "per_side" || exercise.sidedness === "alternating") {
    return exercise.sidedness;
  }

  // Backward compatible fallback for older stored workouts without sidedness.
  return isKnownPerSideExercise(exercise) ? "per_side" : "none";
}

export function isPerSideExercise(exercise: ExerciseExecutionLike | null | undefined) {
  return getExerciseSidedness(exercise) === "per_side";
}

export function getTimedExerciseTotalSeconds(
  exercise: ExerciseExecutionLike | null | undefined,
) {
  const duration = exercise?.duration ?? 0;

  if (duration <= 0) {
    return 0;
  }

  return isPerSideExercise(exercise) ? duration * 2 : duration;
}

export function getSideSwitchSeconds(
  exercise: ExerciseExecutionLike | null | undefined,
) {
  const duration = exercise?.duration ?? 0;

  return isPerSideExercise(exercise) && duration > 0 ? duration : null;
}

export function formatExerciseTarget(exercise: ExerciseExecutionLike) {
  const suffix = isPerSideExercise(exercise) ? " / sida" : "";

  if (typeof exercise.duration === "number" && exercise.duration > 0) {
    return `${exercise.duration}s${suffix}`;
  }

  return `${exercise.reps ?? "-"} reps${suffix}`;
}
