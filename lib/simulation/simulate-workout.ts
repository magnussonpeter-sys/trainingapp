import { clamp, round, type SeededRandom } from "@/lib/simulation/random";
import { createSimulationVariantGroup } from "@/lib/simulation/exercise-identity";
import { simulateExercise, type SyntheticExercisePlan } from "@/lib/simulation/simulate-exercise";
import type {
  SimulationDayPlan,
  SimulationGoal,
  SimulationUserProfile,
  SimulationUserState,
  SimulationWorkoutResult,
} from "@/lib/simulation/types";

const SYNTHETIC_EXERCISES: Array<Omit<SyntheticExercisePlan, "plannedSets" | "plannedReps" | "plannedWeightKg" | "plannedDurationSec"> & {
  goals: SimulationGoal[];
  equipment: string[];
}> = [
  { exerciseId: "deadlift", exerciseName: "Marklyft", difficulty: 88, baseLoadScore: 24, category: "compound", goals: ["strength"], equipment: ["barbell"] },
  { exerciseId: "barbell_squat", exerciseName: "Knäböj", difficulty: 82, baseLoadScore: 22, category: "compound", goals: ["strength", "hypertrophy"], equipment: ["barbell", "rack"] },
  { exerciseId: "bench_press", exerciseName: "Bänkpress", difficulty: 76, baseLoadScore: 20, category: "compound", goals: ["strength", "hypertrophy"], equipment: ["barbell", "bench"] },
  { exerciseId: "overhead_press", exerciseName: "Militärpress", difficulty: 74, baseLoadScore: 18, category: "compound", goals: ["strength", "hypertrophy"], equipment: ["barbell", "rack"] },
  { exerciseId: "barbell_row", exerciseName: "Skivstångsrodd", difficulty: 70, baseLoadScore: 17, category: "compound", goals: ["strength", "hypertrophy"], equipment: ["barbell"] },
  { exerciseId: "romanian_deadlift", exerciseName: "Rumänska marklyft", difficulty: 72, baseLoadScore: 18, category: "compound", goals: ["strength", "hypertrophy"], equipment: ["barbell", "dumbbells"] },
  { exerciseId: "split_squat", exerciseName: "Split squat", difficulty: 62, baseLoadScore: 14, category: "accessory", goals: ["strength", "hypertrophy", "health"], equipment: ["bodyweight", "dumbbells", "barbell"] },
  { exerciseId: "barbell_hip_thrust", exerciseName: "Hip thrust", difficulty: 66, baseLoadScore: 16, category: "compound", goals: ["strength", "hypertrophy"], equipment: ["barbell", "bench"] },
  { exerciseId: "pull_up", exerciseName: "Chins", difficulty: 68, baseLoadScore: 15, category: "compound", goals: ["strength", "hypertrophy", "health"], equipment: ["pullup_bar", "bodyweight"] },
  { exerciseId: "dumbbell_row", exerciseName: "Hantelrodd", difficulty: 58, baseLoadScore: 13, category: "accessory", goals: ["hypertrophy", "health"], equipment: ["dumbbells"] },
  { exerciseId: "dumbbell_bench_press", exerciseName: "Hantelpress", difficulty: 60, baseLoadScore: 14, category: "accessory", goals: ["strength", "hypertrophy"], equipment: ["dumbbells", "bench"] },
  { exerciseId: "dumbbell_shoulder_press", exerciseName: "Hantelpress axlar", difficulty: 58, baseLoadScore: 13, category: "accessory", goals: ["strength", "hypertrophy"], equipment: ["dumbbells"] },
  { exerciseId: "goblet_squat", exerciseName: "Goblet squat", difficulty: 55, baseLoadScore: 13, category: "compound", goals: ["health", "body_composition", "hypertrophy"], equipment: ["dumbbells", "kettlebells"] },
  { exerciseId: "push_up", exerciseName: "Armhävningar", difficulty: 48, baseLoadScore: 10, category: "accessory", goals: ["health", "body_composition", "hypertrophy", "strength"], equipment: ["bodyweight"] },
  { exerciseId: "lat_pulldown", exerciseName: "Latsdrag", difficulty: 57, baseLoadScore: 13, category: "accessory", goals: ["hypertrophy", "health"], equipment: ["machines", "cable_machine"] },
  { exerciseId: "walking_lunge", exerciseName: "Utfallsgång", difficulty: 60, baseLoadScore: 14, category: "conditioning", goals: ["body_composition", "health"], equipment: ["bodyweight", "dumbbells"] },
  { exerciseId: "plank", exerciseName: "Planka", difficulty: 42, baseLoadScore: 8, category: "core", goals: ["health", "body_composition", "strength"], equipment: ["bodyweight"] },
  { exerciseId: "face_pull", exerciseName: "Face pull", difficulty: 38, baseLoadScore: 7, category: "accessory", goals: ["health", "hypertrophy"], equipment: ["bands", "cable_machine"] },
];

function canUseExercise(exercise: (typeof SYNTHETIC_EXERCISES)[number], equipment: string[]) {
  return exercise.equipment.some((item) => equipment.includes(item));
}

function buildSyntheticWorkout(params: {
  dayPlan: SimulationDayPlan;
  profile: SimulationUserProfile;
  random: SeededRandom;
  state: SimulationUserState;
}) {
  const { dayPlan, profile, random, state } = params;
  const targetExerciseCount = clamp(Math.round(dayPlan.targetDurationMin / 12), 2, 6);
  const pool = SYNTHETIC_EXERCISES.filter((exercise) => {
    return exercise.goals.includes(profile.goal) && canUseExercise(exercise, profile.availableEquipmentIds);
  });
  const fallbackPool = SYNTHETIC_EXERCISES.filter((exercise) =>
    canUseExercise(exercise, profile.availableEquipmentIds),
  );
  const candidates =
    pool.length >= targetExerciseCount
      ? pool
      : [
          ...pool,
          // Fyll ut med rimliga övningar som utrustningen stödjer när målpoolen är för smal.
          ...fallbackPool.filter(
            (exercise) => !pool.some((goalExercise) => goalExercise.exerciseId === exercise.exerciseId),
          ),
        ];
  const selected: SyntheticExercisePlan[] = [];

  while (selected.length < targetExerciseCount && selected.length < candidates.length) {
    const candidate = random.pick(candidates);

    if (selected.some((item) => item.exerciseId === candidate.exerciseId)) {
      continue;
    }

    const strengthScale = profile.experienceLevel === "advanced" ? 0.52 : profile.experienceLevel === "intermediate" ? 0.42 : 0.32;
    const sets = candidate.category === "compound" ? (profile.goal === "strength" ? 4 : 3) : 2 + random.int(0, 1);
    const reps = candidate.category === "core" ? undefined : profile.goal === "strength" && candidate.category === "compound" ? 5 : random.int(8, 12);
    const duration = candidate.category === "core" ? random.pick([30, 40, 45, 60]) : undefined;
    const weight = reps != null && candidate.category !== "conditioning"
      ? round(Math.max(2.5, state.strengthLevel * strengthScale * (candidate.difficulty / 70)), 1)
      : undefined;

    selected.push({
      exerciseId: candidate.exerciseId,
      exerciseName: candidate.exerciseName,
      variantGroup: createSimulationVariantGroup(candidate),
      difficulty: candidate.difficulty,
      baseLoadScore: candidate.baseLoadScore,
      category: candidate.category,
      plannedSets: sets,
      plannedReps: reps,
      plannedDurationSec: duration,
      plannedWeightKg: weight,
    });
  }

  return selected;
}

export function simulateWorkout(params: {
  dayPlan: SimulationDayPlan;
  plannedExercises?: SyntheticExercisePlan[];
  profile: SimulationUserProfile;
  random: SeededRandom;
  state: SimulationUserState;
}) {
  const { dayPlan, profile, random, state } = params;
  const exercises = params.plannedExercises ?? buildSyntheticWorkout(params);
  const exerciseResults = exercises.map((exercise) =>
    simulateExercise({ exercise, profile, random, state }),
  );
  const completedExerciseRatio =
    exerciseResults.length > 0
      ? exerciseResults.filter((exercise) => exercise.completedSets > 0).length / exerciseResults.length
      : 0;
  const estimatedLoadScore = round(
    exerciseResults.reduce((sum, exercise, index) => {
      return sum + exercises[index].baseLoadScore * (exercise.completedSets / Math.max(1, exercise.plannedSets));
    }, 0),
    1,
  );
  const sessionDifficultyScore = round(
    clamp(exerciseResults.reduce((sum, exercise) => sum + exercise.effortScore, 0) / Math.max(1, exerciseResults.length), 1, 5),
    1,
  );
  const sessionSatisfactionScore = round(
    clamp(2.2 + completedExerciseRatio * 1.7 + (state.readiness - 50) * 0.015 - Math.abs(sessionDifficultyScore - 3.2) * 0.22, 1, 5),
    1,
  );

  return {
    workoutId: `sim-${dayPlan.dayIndex}`,
    workoutName: `${profile.goal === "strength" ? "Styrkepass" : profile.goal === "hypertrophy" ? "Hypertrofipass" : "Coachpass"} ${dayPlan.dayIndex + 1}`,
    dayIndex: dayPlan.dayIndex,
    date: dayPlan.date,
    goal: profile.goal,
    plannedDurationMin: dayPlan.targetDurationMin,
    actualDurationMin: round(dayPlan.targetDurationMin * clamp(0.72 + completedExerciseRatio * 0.28, 0.5, 1.05), 0),
    completed: completedExerciseRatio >= 0.75,
    skipped: false,
    sessionDifficultyScore,
    sessionSatisfactionScore,
    estimatedLoadScore,
    exerciseResults,
  } satisfies SimulationWorkoutResult;
}

export function buildMissedWorkoutResult(params: {
  dayPlan: SimulationDayPlan;
  profile: SimulationUserProfile;
  skipReason: "fatigue" | "life" | "motivation" | "random";
}) {
  const { dayPlan, profile, skipReason } = params;

  return {
    workoutId: `missed-${dayPlan.dayIndex}`,
    workoutName: "Missat planerat pass",
    dayIndex: dayPlan.dayIndex,
    date: dayPlan.date,
    goal: profile.goal,
    plannedDurationMin: dayPlan.targetDurationMin,
    actualDurationMin: 0,
    completed: false,
    skipped: true,
    skipReason,
    sessionDifficultyScore: 0,
    sessionSatisfactionScore: 1,
    estimatedLoadScore: 0,
    exerciseResults: [],
  } satisfies SimulationWorkoutResult;
}
