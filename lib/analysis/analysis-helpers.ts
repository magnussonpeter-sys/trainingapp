import { getExerciseById, type MovementPattern } from "@/lib/exercise-catalog";
import type {
  CompletedExercise,
  CompletedSet,
  WorkoutLog,
} from "@/lib/workout-log-storage";

export type PrimaryDoseGroupKey =
  | "chest"
  | "back"
  | "legs"
  | "shoulders"
  | "arms"
  | "core";

const MUSCLE_TO_GROUP: Record<string, PrimaryDoseGroupKey> = {
  chest: "chest",
  upper_back: "back",
  lats: "back",
  back: "back",
  quads: "legs",
  glutes: "legs",
  hamstrings: "legs",
  calves: "legs",
  shoulders: "shoulders",
  side_delts: "shoulders",
  rear_delts: "shoulders",
  front_delts: "shoulders",
  biceps: "arms",
  triceps: "arms",
  forearms: "arms",
  core: "core",
  obliques: "core",
};

const PATTERN_TO_GROUP: Record<MovementPattern, PrimaryDoseGroupKey> = {
  horizontal_push: "chest",
  horizontal_pull: "back",
  vertical_push: "shoulders",
  vertical_pull: "back",
  squat: "legs",
  hinge: "legs",
  lunge: "legs",
  core: "core",
  carry: "core",
};

export function parseDateMs(value: string | null | undefined) {
  if (!value) {
    return 0;
  }

  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

export function getWeekStart(dateMs: number) {
  const date = new Date(dateMs);
  const day = date.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + mondayOffset);
  return date;
}

export function formatWeekLabel(date: Date) {
  return `${date.getDate()}/${date.getMonth() + 1}`;
}

export function getCompletedWorkouts(logs: WorkoutLog[]) {
  return logs
    .filter((log) => log.status === "completed")
    .sort((a, b) => parseDateMs(a.completedAt) - parseDateMs(b.completedAt));
}

export function estimateSetStrengthScore(set: CompletedSet) {
  if (set.actualWeight == null || set.actualReps == null || set.actualReps <= 0) {
    return null;
  }

  return set.actualWeight * (1 + set.actualReps / 30);
}

export function estimateExerciseStrengthScore(exercise: CompletedExercise) {
  const setScores = exercise.sets
    .map((set) => estimateSetStrengthScore(set))
    .filter((value): value is number => typeof value === "number" && value > 0);

  if (setScores.length === 0) {
    return null;
  }

  return Math.max(...setScores);
}

export function getDoseGroupsForExercise(exerciseId: string) {
  const catalogExercise = getExerciseById(exerciseId);

  if (!catalogExercise) {
    return [] as PrimaryDoseGroupKey[];
  }

  const directGroups = Array.from(
    new Set(
      catalogExercise.primaryMuscles
        .map((muscle) => MUSCLE_TO_GROUP[muscle])
        .filter((group): group is PrimaryDoseGroupKey => Boolean(group)),
    ),
  );

  if (directGroups.length > 0) {
    return directGroups;
  }

  const patternGroup = PATTERN_TO_GROUP[catalogExercise.movementPattern];
  return patternGroup ? [patternGroup] : [];
}

export function getMovementPatternLabel(exerciseId: string) {
  const catalogExercise = getExerciseById(exerciseId);
  return catalogExercise?.movementPattern ?? null;
}

export function getExerciseDisplayLabel(exerciseId: string, exerciseName: string) {
  const catalogExercise = getExerciseById(exerciseId);
  return catalogExercise?.name ?? exerciseName;
}

export function roundToSingleDecimal(value: number) {
  return Math.round(value * 10) / 10;
}
