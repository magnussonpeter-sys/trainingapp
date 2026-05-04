export type TrainingGoal =
  | "strength"
  | "hypertrophy"
  | "health"
  | "body_composition";

export type SportFocus =
  | "none"
  | "running"
  | "cross_country_skiing"
  | "alpine_skiing"
  | "cycling"
  | "ball_sports"
  | "swimming"
  | "golf"
  | "surf_sports"
  | "general_athletic";

export type UserTrainingProfile = {
  trainingGoal: TrainingGoal;
  sportFocus: SportFocus;
  priorityMuscles: string[];
  experienceLevel: "beginner" | "some_experience" | "experienced";
};

export const SPORT_FOCUS_VALUES: SportFocus[] = [
  "none",
  "running",
  "cross_country_skiing",
  "alpine_skiing",
  "cycling",
  "ball_sports",
  "swimming",
  "golf",
  "surf_sports",
  "general_athletic",
];

export function isSportFocus(value: unknown): value is SportFocus {
  return (
    value === "none" ||
    value === "running" ||
    value === "cross_country_skiing" ||
    value === "alpine_skiing" ||
    value === "cycling" ||
    value === "ball_sports" ||
    value === "swimming" ||
    value === "golf" ||
    value === "surf_sports" ||
    value === "general_athletic"
  );
}

export function normalizeSportFocus(value: unknown): SportFocus {
  // Äldre värdet "skiing" mappas till utförsåkning för bakåtkompatibilitet.
  if (value === "skiing") {
    return "alpine_skiing";
  }

  return isSportFocus(value) ? value : "none";
}
