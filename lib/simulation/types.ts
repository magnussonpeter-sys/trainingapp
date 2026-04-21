export type SimulationGoal =
  | "strength"
  | "hypertrophy"
  | "body_composition"
  | "health";

export type SimulationExperienceLevel =
  | "beginner"
  | "intermediate"
  | "advanced";

export type SimulationEnergyTrend =
  | "stable"
  | "improving"
  | "declining";

export type SimulationRecoveryProfile =
  | "poor"
  | "average"
  | "good";

export type SimulationAdherenceProfile =
  | "low"
  | "medium"
  | "high";

export type SimulationExercisePerformance = {
  exerciseId: string;
  exerciseName: string;
  variantGroup?: string;
  plannedSets: number;
  plannedReps?: number;
  plannedDurationSec?: number;
  plannedWeightKg?: number;
  completedSets: number;
  actualAvgReps?: number;
  actualAvgDurationSec?: number;
  actualAvgWeightKg?: number;
  extraRepsEstimate?: number;
  effortScore: number;
  exerciseRating: number;
  completed: boolean;
};

export type SimulationWorkoutResult = {
  workoutId: string;
  workoutName: string;
  dayIndex: number;
  date: string;
  goal: SimulationGoal;
  plannedDurationMin: number;
  actualDurationMin: number;
  completed: boolean;
  skipped: boolean;
  skipReason?: "fatigue" | "life" | "motivation" | "random";
  sessionDifficultyScore: number;
  sessionSatisfactionScore: number;
  estimatedLoadScore: number;
  exerciseResults: SimulationExercisePerformance[];
};

export type SimulationUserProfile = {
  id: string;
  name: string;
  age: number;
  sex: "male" | "female" | "other";
  heightCm: number;
  weightKg: number;
  goal: SimulationGoal;
  experienceLevel: SimulationExperienceLevel;
  preferredWorkoutDaysPerWeek: number;
  preferredSessionDurationMin: number;
  adherenceProfile: SimulationAdherenceProfile;
  recoveryProfile: SimulationRecoveryProfile;
  energyTrend: SimulationEnergyTrend;
  motivationBase: number;
  recoveryCapacity: number;
  lifeStressBase: number;
  strengthBase: number;
  hypertrophyResponsiveness: number;
  skillLearningRate: number;
  availableGymId?: number | null;
  availableEquipmentIds: string[];
  favoriteExerciseIds?: string[];
  dislikedExerciseIds?: string[];
};

export type SimulationUserState = {
  dayIndex: number;
  readiness: number;
  fatigue: number;
  motivation: number;
  soreness: number;
  lifeStress: number;
  strengthLevel: number;
  workCapacity: number;
  movementSkill: number;
  bodyWeightKg: number;
  completedWorkouts: number;
  skippedWorkouts: number;
  consecutiveTrainingDays: number;
  consecutiveMissedPlannedDays: number;
  lastWorkoutDate?: string;
  lastDeloadDayIndex?: number | null;
};

export type SimulationDayPlan = {
  dayIndex: number;
  date: string;
  isPlannedTrainingDay: boolean;
  targetDurationMin: number;
};

export type SimulationDailySnapshot = {
  dayIndex: number;
  date: string;
  stateBefore: SimulationUserState;
  plannedTraining: SimulationDayPlan;
  generatedWorkoutSummary?: {
    workoutId: string;
    workoutName: string;
    blockCount: number;
    exerciseCount: number;
    estimatedVolumeScore: number;
    plannerSource?: "synthetic" | "ai" | "ai_fallback";
    plannerNote?: string;
  };
  workoutResult?: SimulationWorkoutResult;
  stateAfter: SimulationUserState;
};

export type SimulationPlannerDebugExercise = {
  exerciseId: string;
  exerciseName: string;
  variantGroup?: string;
  aggregationKey: string;
};

export type SimulationPlannerDebugEntry = {
  dayIndex: number;
  date: string;
  plannerMode: "synthetic" | "hybrid_ai";
  source: "synthetic" | "ai" | "ai_fallback";
  beforeNormalization: SimulationPlannerDebugExercise[];
  afterNormalization: SimulationPlannerDebugExercise[];
  repeatedAggregationKeys: string[];
  note?: string;
};

export type SimulationConfig = {
  totalDays: number;
  startDate: string;
  randomSeed: number;
  plannerMode?: "synthetic" | "hybrid_ai";
  enablePlannerDebug?: boolean;
  enableMissedWorkouts: boolean;
  enableFatigueModel: boolean;
  enableWeightProgressionEstimate: boolean;
  enableDeloadDetection: boolean;
  minRestDayProbability: number;
  plannedWorkoutDayIndices?: number[];
  maxFatigue: number;
  maxSoreness: number;
  deloadFatigueThreshold: number;
  lowReadinessThreshold: number;
};

export type SimulationSeriesPoint = {
  dayIndex: number;
  date: string;
  readiness: number;
  fatigue: number;
  motivation: number;
  soreness: number;
  strengthLevel: number;
  workCapacity: number;
  bodyWeightKg: number;
  sessionLoad?: number;
  sessionDifficulty?: number;
  sessionSatisfaction?: number;
};

export type SimulationExerciseAggregate = {
  exerciseId: string;
  exerciseName: string;
  timesSelected: number;
  timesCompleted: number;
  avgEffortScore: number;
  avgExerciseRating: number;
  avgExtraRepsEstimate: number;
  avgPlannedWeightKg?: number;
  avgActualWeightKg?: number;
};

export type SimulationEvaluation = {
  adherenceRate: number;
  completionRate: number;
  avgSessionDifficulty: number;
  avgSessionSatisfaction: number;
  avgReadiness: number;
  avgFatigue: number;
  strengthTrend: number;
  workCapacityTrend: number;
  exerciseVariationScore: number;
  goalAlignmentScore: number;
  overloadRiskScore: number;
  stagnationRiskScore: number;
  progressionQualityScore: number;
  flags: string[];
  summary: string;
};

export type SimulationReport = {
  config: SimulationConfig;
  profile: SimulationUserProfile;
  dailySnapshots: SimulationDailySnapshot[];
  timeSeries: SimulationSeriesPoint[];
  exerciseAggregates: SimulationExerciseAggregate[];
  evaluation: SimulationEvaluation;
  plannerDebug?: SimulationPlannerDebugEntry[];
};
