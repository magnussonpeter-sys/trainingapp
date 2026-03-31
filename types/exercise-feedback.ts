export type ExtraRepsOption = 0 | 2 | 4 | 6;

export type ExerciseFeedbackEntry = {
  exerciseId: string;
  exerciseName: string;
  completedAt: string;
  extraReps: ExtraRepsOption;
  rating?: number;
};