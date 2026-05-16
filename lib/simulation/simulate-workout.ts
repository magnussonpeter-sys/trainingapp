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
import type { WorkoutFocus } from "@/types/workout";

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
  { exerciseId: "dumbbell_row", exerciseName: "Hantelrodd", difficulty: 58, baseLoadScore: 13, category: "accessory", goals: ["strength", "hypertrophy", "health"], equipment: ["dumbbells"] },
  { exerciseId: "chest_supported_row", exerciseName: "Bröststödd rodd med hantlar", difficulty: 60, baseLoadScore: 13, category: "accessory", goals: ["strength", "hypertrophy", "health"], equipment: ["dumbbells", "bench"] },
  { exerciseId: "ring_row", exerciseName: "Ring rows", difficulty: 56, baseLoadScore: 12, category: "accessory", goals: ["strength", "hypertrophy", "health"], equipment: ["rings"] },
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

function createSyntheticPlanForCandidate(params: {
  candidate: (typeof SYNTHETIC_EXERCISES)[number];
  profile: SimulationUserProfile;
  random: SeededRandom;
  state: SimulationUserState;
}) {
  const { candidate, profile, random, state } = params;
  const strengthScale =
    profile.experienceLevel === "advanced"
      ? 0.52
      : profile.experienceLevel === "intermediate"
        ? 0.42
        : 0.32;
  const sets =
    candidate.category === "compound"
      ? profile.goal === "strength"
        ? 4
        : 3
      : 2 + random.int(0, 1);
  const reps =
    candidate.category === "core"
      ? undefined
      : profile.goal === "strength" && candidate.category === "compound"
        ? 5
        : random.int(8, 12);
  const duration =
    candidate.category === "core" ? random.pick([30, 40, 45, 60]) : undefined;
  const weight =
    reps != null && candidate.category !== "conditioning"
      ? round(
          Math.max(
            2.5,
            state.strengthLevel * strengthScale * (candidate.difficulty / 70),
          ),
          1,
        )
      : undefined;

  return {
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
  } satisfies SyntheticExercisePlan;
}

function pickPreferredFallbackExercises(params: {
  candidates: (typeof SYNTHETIC_EXERCISES)[number][];
  targetExerciseCount: number;
  goal: SimulationGoal;
  focusHint?: WorkoutFocus;
}) {
  const selected: (typeof SYNTHETIC_EXERCISES)[number][] = [];
  const normalizedFocus = params.focusHint ?? "full_body";

  if (
    params.goal !== "strength" ||
    normalizedFocus !== "full_body" ||
    params.targetExerciseCount < 4
  ) {
    return selected;
  }

  const rolePreferences = [
    ["goblet_squat", "split_squat", "barbell_squat", "walking_lunge"],
    ["romanian_deadlift", "deadlift", "barbell_hip_thrust"],
    ["dumbbell_bench_press", "bench_press", "push_up", "dumbbell_shoulder_press"],
    ["chest_supported_row", "ring_row", "dumbbell_row", "pull_up", "barbell_row", "lat_pulldown"],
  ];

  for (const preferredIds of rolePreferences) {
    const candidate = preferredIds
      .map((exerciseId) =>
        params.candidates.find((entry) => entry.exerciseId === exerciseId),
      )
      .find(Boolean);

    if (candidate && !selected.some((entry) => entry.exerciseId === candidate.exerciseId)) {
      selected.push(candidate);
    }
  }

  return selected.slice(0, params.targetExerciseCount);
}

function matchesFocusHint(
  exercise: (typeof SYNTHETIC_EXERCISES)[number],
  focusHint: WorkoutFocus | undefined,
) {
  if (!focusHint || focusHint === "full_body") {
    return true;
  }

  if (focusHint === "core") {
    return exercise.category === "core" || exercise.exerciseId === "walking_lunge";
  }

  const lowerBodyIds = new Set([
    "deadlift",
    "barbell_squat",
    "romanian_deadlift",
    "split_squat",
    "barbell_hip_thrust",
    "goblet_squat",
    "walking_lunge",
  ]);
  const upperBodyIds = new Set([
    "bench_press",
    "overhead_press",
    "barbell_row",
    "pull_up",
    "dumbbell_row",
    "dumbbell_bench_press",
    "dumbbell_shoulder_press",
    "lat_pulldown",
    "face_pull",
    "push_up",
  ]);

  if (focusHint === "lower_body") {
    return lowerBodyIds.has(exercise.exerciseId) || exercise.category === "core";
  }

  return upperBodyIds.has(exercise.exerciseId) || exercise.category === "core";
}

export function buildSyntheticWorkoutPlan(params: {
  dayPlan: SimulationDayPlan;
  profile: SimulationUserProfile;
  random: SeededRandom;
  state: SimulationUserState;
  focusHint?: WorkoutFocus;
}) {
  const { dayPlan, profile, random, state, focusHint } = params;
  const targetExerciseCount = clamp(
    profile.goal === "strength" &&
      (focusHint ?? "full_body") === "full_body" &&
      dayPlan.targetDurationMin >= 30
      ? Math.max(Math.round(dayPlan.targetDurationMin / 12), 4)
      : Math.round(dayPlan.targetDurationMin / 12),
    2,
    6,
  );
  const focusPool = SYNTHETIC_EXERCISES.filter((exercise) =>
    matchesFocusHint(exercise, focusHint),
  );
  const pool = focusPool.filter((exercise) => {
    return (
      exercise.goals.includes(profile.goal) &&
      canUseExercise(exercise, profile.availableEquipmentIds)
    );
  });
  const fallbackPool = focusPool.filter((exercise) =>
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
  const preferredCandidates = pickPreferredFallbackExercises({
    candidates,
    targetExerciseCount,
    goal: profile.goal,
    focusHint,
  });
  const selectedCandidates = [...preferredCandidates];

  while (
    selectedCandidates.length < targetExerciseCount &&
    selectedCandidates.length < candidates.length
  ) {
    const candidate = random.pick(candidates);

    if (
      selectedCandidates.some((item) => item.exerciseId === candidate.exerciseId)
    ) {
      continue;
    }

    selectedCandidates.push(candidate);
  }

  return selectedCandidates.map((candidate) =>
    createSyntheticPlanForCandidate({
      candidate,
      profile,
      random,
      state,
    }),
  );
}

export function simulateWorkout(params: {
  dayPlan: SimulationDayPlan;
  plannedExercises?: SyntheticExercisePlan[];
  profile: SimulationUserProfile;
  random: SeededRandom;
  state: SimulationUserState;
}) {
  const { dayPlan, profile, random, state } = params;
  const exercises = params.plannedExercises ?? buildSyntheticWorkoutPlan(params);
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
