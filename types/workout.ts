// types/workout.ts
// Grundtyper för träningspass.
// Viktigt: vi går från platt exercises-lista till blocks,
// men behåller en legacy-variant för säker bakåtkompatibilitet.

export type Exercise = {
  id: string;
  name: string;
  sets: number;
  reps?: number | null;
  duration?: number | null;
  sidedness?: "none" | "per_side" | "alternating";
  rest: number;
  description?: string;
  isCustom?: boolean;
  isNewExercise?: boolean;
  suggestedWeight?: number | string | null;
  suggestedWeightLabel?: string;
  availableWeightsKg?: number[];
  weightUnitLabel?: string;
  weightSelectionMode?: "total" | "single_implement" | "per_hand";
  lastPerformedWeight?: number | null;
  lastPerformedDuration?: number | null;
  progressionNote?: string;
};

export type WorkoutPreparationLevel = "low" | "medium" | "high";

export type WorkoutFocus =
  | "full_body"
  | "upper_body"
  | "lower_body"
  | "core";

export type WorkoutPreparationFeedback = {
  energy?: WorkoutPreparationLevel;
  focus?: WorkoutPreparationLevel;
  note?: string;
  updatedAt?: string;
};

export type WorkoutAiDebug = {
  request?: unknown;
  generationContext?: unknown;
  prompt?: string;
  rawAiText?: string;
  parsedAiResponse?: unknown;
  validatedWorkout?: unknown;
  normalizedWorkout?: unknown;
};

export type WorkoutBlockType = "straight_sets" | "superset" | "circuit";

export type WorkoutWarmupGuide = {
  recommended: boolean;
  instruction?: string;
};

export type StraightSetsWorkoutBlock = {
  type: "straight_sets";
  title?: string;
  purpose?: string;
  coachNote?: string;
  targetRpe?: number | null;
  targetRir?: number | null;
  warmup?: WorkoutWarmupGuide;
  exercises: Exercise[];
};

export type SupersetWorkoutBlock = {
  type: "superset";
  title?: string;
  purpose?: string;
  coachNote?: string;
  targetRpe?: number | null;
  targetRir?: number | null;
  warmup?: WorkoutWarmupGuide;
  rounds?: number | null;
  restBetweenExercises?: number | null;
  restAfterRound?: number | null;
  exercises: Exercise[];
};

export type CircuitWorkoutBlock = {
  type: "circuit";
  title?: string;
  purpose?: string;
  coachNote?: string;
  targetRpe?: number | null;
  targetRir?: number | null;
  warmup?: WorkoutWarmupGuide;
  rounds?: number | null;
  restBetweenExercises?: number | null;
  restAfterRound?: number | null;
  exercises: Exercise[];
};

export type WorkoutBlock =
  | StraightSetsWorkoutBlock
  | SupersetWorkoutBlock
  | CircuitWorkoutBlock;

// Legacy-form används bara för att kunna läsa äldre sparade pass.
// Ny kod ska alltid skapa `blocks`.
export type LegacyWorkoutShape = {
  id?: string;
  name: string;
  duration: number;
  goal?: string;
  gym?: string | null;
  gymLabel?: string | null;
  aiComment?: string;
  aiDebug?: WorkoutAiDebug;
  preparationFeedback?: WorkoutPreparationFeedback;
  plannedFocus?: WorkoutFocus | null;
  exercises: Exercise[];
  createdAt?: string;
};

export type Workout = {
  id?: string;
  name: string;
  duration: number;
  goal?: string;
  gym?: string | null;
  gymLabel?: string | null;
  aiComment?: string; // Kort coach-kommentar från AI inför dagens pass.
  aiDebug?: WorkoutAiDebug;
  preparationFeedback?: WorkoutPreparationFeedback;
  plannedFocus?: WorkoutFocus | null;
  blocks: WorkoutBlock[];
  createdAt?: string;
};

// Användbar unions-typ när vi läser gamla sparade workouts.
export type WorkoutLike = Workout | LegacyWorkoutShape;
