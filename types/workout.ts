export type Exercise = {
  id: string;
  name: string;
  sets: number;
  reps?: number;
  duration?: number;
  rest: number;
  description?: string;
};

export type Workout = {
  id?: string;
  name: string;
  duration: number;
  goal?: string;
  gym?: string;
  aiComment?: string; // Kort coach-kommentar från AI inför dagens pass.
  exercises: Exercise[];
  createdAt?: string;
};