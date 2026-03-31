export type ExtraRepsOption = 0 | 2 | 4 | 6;

export type DbCompletedSetInput = {
  setNumber: number;
  plannedReps: number | null;
  plannedWeight: number | null;
  actualReps: number | null;
  actualWeight: number | null;
  repsLeft: ExtraRepsOption | null;
  completedAt: string;
  context?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
};

export type DbCompletedExerciseInput = {
  exerciseId: string;
  exerciseName: string;
  plannedSets: number;
  plannedReps: number | null;
  plannedDuration: number | null;
  isNewExercise: boolean;
  rating: number | null;
  extraReps: ExtraRepsOption | null;
  sets: DbCompletedSetInput[];
  context?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
};

export type CreateWorkoutLogInput = {
  userId: string;
  workoutId: string | null;
  workoutName: string;
  startedAt: string;
  completedAt: string;
  durationSeconds: number;
  status: "completed" | "aborted";
  exercises: DbCompletedExerciseInput[];
  context?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  events?: Array<{
    eventType: string;
    eventAt?: string;
    payload?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  }>;
};