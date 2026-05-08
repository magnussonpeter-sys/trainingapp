import type { TrainingConstraint } from "@/lib/workout-generation/types";

export const RUNNER_KNEE_CONSTRAINT: TrainingConstraint = {
  id: "runner_knee",
  type: "pain",
  affectedAreas: ["knee", "quads", "patellofemoral_joint"],
  avoidTags: [
    "high_impact",
    "deep_knee_flexion",
    "jumping",
    "painful_lunge",
    "high_volume_knee_dominant",
  ],
  preferTags: [
    "hip_strength",
    "glute_medius",
    "hamstring_control",
    "calf_strength",
    "low_pain_range",
    "isometric_option",
  ],
  severity: "moderate",
  painRule: "Håll upplevd smärta på högst 3/10 och undvik försämring dagen efter.",
  userFacingNote:
    "Utifrån att du anger knäbesvär anpassar vi passet försiktigt med fokus på höft, baksida lår, vader och kontrollerad knävinkel.",
};

export function getDefaultTrainingConstraints(): TrainingConstraint[] {
  // Första versionen lägger bara grunden för constraints.
  return [];
}
