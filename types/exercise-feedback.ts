// types/exercise-feedback.ts

export type ExtraRepsOption = 0 | 2 | 4 | 6;

// För tidsstyrda övningar vill vi inte använda "extra reps".
// Då sparar vi i stället en enklare känsla/ansträngning.
export type TimedEffortOption = "light" | "just_right" | "tough";

export type ExerciseFeedbackEntry = {
  exerciseId: string;
  exerciseName: string;
  completedAt: string;

  // Vanliga styrkeövningar använder extra reps.
  extraReps?: ExtraRepsOption;

  // Tidsstyrda övningar använder upplevd ansträngning.
  timedEffort?: TimedEffortOption;

  rating?: number;
};