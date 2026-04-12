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
  rest: number;
  description?: string;
  isCustom?: boolean;
  isNewExercise?: boolean;
  suggestedWeight?: number | string | null;
};

export type WorkoutBlockType = "straight_sets";

export type StraightSetsWorkoutBlock = {
  type: "straight_sets";
  title?: string;
  exercises: Exercise[];
};

export type WorkoutBlock = StraightSetsWorkoutBlock;

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
  blocks: WorkoutBlock[];
  createdAt?: string;
};

// Användbar unions-typ när vi läser gamla sparade workouts.
export type WorkoutLike = Workout | LegacyWorkoutShape;