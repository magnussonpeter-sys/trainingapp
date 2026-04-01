// lib/workout-summary.ts

import { pool } from "@/lib/db";
import { getExerciseById, type MovementPattern } from "@/lib/exercise-catalog";

export type ExerciseSummaryForAI = {
  exerciseId: string;
  avgRating: number | null;
  avgExtraReps: number | null;
  lastWeight: number | null;
  lastReps: number | null;
  completedCount: number;
  recentCompletedCount: number;
  recent7dCount: number;
  recent14dCount: number;
  lastCompletedAt: string | null;
};

type ExerciseInsight = {
  exerciseId: string;
  count: number;
  avgRating: number | null;
  avgExtraReps: number | null;
  lastCompletedAt: string | null;
};

type MovementPatternLoad = Record<
  MovementPattern,
  {
    completedExercises: number;
    uniqueExercises: number;
  }
>;

export type WorkoutSummaryForAI = {
  recentWorkouts: number;
  adherence: {
    completed: number;
    aborted: number;
  };
  exercises: ExerciseSummaryForAI[];
  recentExerciseIds: string[];
  avoidExerciseIds: string[];
  preferredExerciseIds: string[];
  topPositiveExercises: ExerciseInsight[];
  topNegativeExercises: ExerciseInsight[];
  movementPatternLoad7d: MovementPatternLoad;
  movementPatternLoad14d: MovementPatternLoad;
};

function toNumberOrNull(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function createEmptyMovementPatternLoad(): MovementPatternLoad {
  return {
    horizontal_push: { completedExercises: 0, uniqueExercises: 0 },
    horizontal_pull: { completedExercises: 0, uniqueExercises: 0 },
    vertical_push: { completedExercises: 0, uniqueExercises: 0 },
    vertical_pull: { completedExercises: 0, uniqueExercises: 0 },
    squat: { completedExercises: 0, uniqueExercises: 0 },
    hinge: { completedExercises: 0, uniqueExercises: 0 },
    lunge: { completedExercises: 0, uniqueExercises: 0 },
    core: { completedExercises: 0, uniqueExercises: 0 },
    carry: { completedExercises: 0, uniqueExercises: 0 },
  };
}

function addToMovementLoad(
  load: MovementPatternLoad,
  exerciseId: string,
  count: number
) {
  const catalogExercise = getExerciseById(exerciseId);

  if (!catalogExercise || count <= 0) {
    return;
  }

  const bucket = load[catalogExercise.movementPattern];
  bucket.completedExercises += count;
  bucket.uniqueExercises += 1;
}

function mapExerciseInsight(exercise: ExerciseSummaryForAI): ExerciseInsight {
  return {
    exerciseId: exercise.exerciseId,
    count: exercise.completedCount,
    avgRating: exercise.avgRating,
    avgExtraReps: exercise.avgExtraReps,
    lastCompletedAt: exercise.lastCompletedAt,
  };
}

export async function getWorkoutSummaryForAI(
  userId: string
): Promise<WorkoutSummaryForAI> {
  // ===== 1. Senaste pass =====
  const workoutsRes = await pool.query(
    `
    select id, status, completed_at
    from workout_logs
    where user_id = $1
    order by completed_at desc nulls last
    limit 12
    `,
    [userId]
  );

  const workouts = workoutsRes.rows;

  const completed = workouts.filter((w) => w.status === "completed").length;
  const aborted = workouts.filter((w) => w.status === "aborted").length;

  const recentCompletedWorkoutIds = workouts
    .filter((w) => w.status === "completed" && w.id)
    .map((w) => w.id)
    .slice(0, 4);

  // ===== 2. Summerad övningsdata =====
  const exerciseStatsRes = await pool.query(
    `
    select
      wle.exercise_id,
      avg(wle.rating) filter (
        where wl.status = 'completed' and wle.rating is not null
      ) as avg_rating,
      avg(wle.extra_reps) filter (
        where wl.status = 'completed' and wle.extra_reps is not null
      ) as avg_extra_reps,
      count(*) filter (where wl.status = 'completed') as completed_count,
      count(*) filter (
        where wl.status = 'completed'
          and wl.completed_at is not null
          and wl.completed_at >= now() - interval '7 days'
      ) as recent_7d_count,
      count(*) filter (
        where wl.status = 'completed'
          and wl.completed_at is not null
          and wl.completed_at >= now() - interval '14 days'
      ) as recent_14d_count,
      max(wl.completed_at) filter (
        where wl.status = 'completed'
      ) as last_completed_at
    from workout_log_exercises wle
    join workout_logs wl on wl.id = wle.workout_log_id
    where wl.user_id = $1
      and wle.exercise_id is not null
    group by wle.exercise_id
    `,
    [userId]
  );

  // ===== 3. Senaste prestation per övning =====
  const lastPerformanceRes = await pool.query(
    `
    select distinct on (wle.exercise_id)
      wle.exercise_id,
      wls.actual_weight,
      wls.actual_reps
    from workout_logs wl
    join workout_log_exercises wle on wle.workout_log_id = wl.id
    join workout_log_sets wls on wls.workout_log_exercise_id = wle.id
    where wl.user_id = $1
      and wl.status = 'completed'
      and wle.exercise_id is not null
      and (wls.actual_weight is not null or wls.actual_reps is not null)
    order by wle.exercise_id, wl.completed_at desc nulls last, wls.set_number desc
    `,
    [userId]
  );

  const lastPerformanceMap = new Map(
    lastPerformanceRes.rows.map((row) => [
      row.exercise_id,
      {
        lastWeight: toNumberOrNull(row.actual_weight),
        lastReps: toNumberOrNull(row.actual_reps),
      },
    ])
  );

  // ===== 4. Övningar i de senaste genomförda passen =====
  const recentExerciseUsageRes =
    recentCompletedWorkoutIds.length > 0
      ? await pool.query(
          `
          select
            wle.exercise_id,
            count(*) as recent_completed_count
          from workout_log_exercises wle
          where wle.workout_log_id = any($1::uuid[])
            and wle.exercise_id is not null
          group by wle.exercise_id
          `,
          [recentCompletedWorkoutIds]
        )
      : {
          rows: [] as Array<{
            exercise_id: string;
            recent_completed_count: string;
          }>,
        };

  const recentUsageMap = new Map(
    recentExerciseUsageRes.rows.map((row) => [
      row.exercise_id,
      Number(row.recent_completed_count),
    ])
  );

  // ===== 5. Kombinera till AI-underlag =====
  const exercises: ExerciseSummaryForAI[] = exerciseStatsRes.rows.map((row) => {
    const last = lastPerformanceMap.get(row.exercise_id);
    const recentCompletedCount = recentUsageMap.get(row.exercise_id) ?? 0;

    return {
      exerciseId: row.exercise_id,
      avgRating: toNumberOrNull(row.avg_rating),
      avgExtraReps: toNumberOrNull(row.avg_extra_reps),
      lastWeight: last?.lastWeight ?? null,
      lastReps: last?.lastReps ?? null,
      completedCount: Number(row.completed_count ?? 0),
      recentCompletedCount,
      recent7dCount: Number(row.recent_7d_count ?? 0),
      recent14dCount: Number(row.recent_14d_count ?? 0),
      lastCompletedAt:
        typeof row.last_completed_at === "string"
          ? row.last_completed_at
          : row.last_completed_at instanceof Date
          ? row.last_completed_at.toISOString()
          : null,
    };
  });

  // ===== 6. Rörelsemönster senaste 7 respektive 14 dagar =====
  const movementPatternLoad7d = createEmptyMovementPatternLoad();
  const movementPatternLoad14d = createEmptyMovementPatternLoad();

  for (const exercise of exercises) {
    addToMovementLoad(
      movementPatternLoad7d,
      exercise.exerciseId,
      exercise.recent7dCount
    );
    addToMovementLoad(
      movementPatternLoad14d,
      exercise.exerciseId,
      exercise.recent14dCount
    );
  }

  // ===== 7. Styrsignaler till AI =====
  const avoidExerciseIds = exercises
    .filter((exercise) => {
      const lowRating =
        exercise.avgRating !== null &&
        exercise.avgRating > 0 &&
        exercise.avgRating <= 2.5;

      const poorTolerance =
        exercise.avgExtraReps !== null && exercise.avgExtraReps < 0.5;

      const overusedRecently =
        exercise.recent7dCount >= 2 || exercise.recent14dCount >= 3;

      return lowRating || poorTolerance || overusedRecently;
    })
    .map((exercise) => exercise.exerciseId);

  const preferredExerciseIds = exercises
    .filter((exercise) => {
      const goodRating =
        exercise.avgRating !== null && exercise.avgRating >= 4;

      const goodTolerance =
        exercise.avgExtraReps !== null && exercise.avgExtraReps >= 2;

      const notOverusedRecently = exercise.recent7dCount < 2;

      return (goodRating || goodTolerance) && notOverusedRecently;
    })
    .sort((a, b) => {
      const aScore =
        (a.avgRating ?? 0) * 2 +
        (a.avgExtraReps ?? 0) +
        Math.min(a.completedCount, 5) * 0.2;

      const bScore =
        (b.avgRating ?? 0) * 2 +
        (b.avgExtraReps ?? 0) +
        Math.min(b.completedCount, 5) * 0.2;

      return bScore - aScore;
    })
    .map((exercise) => exercise.exerciseId)
    .slice(0, 12);

  const recentExerciseIds = Array.from(
    new Set(
      exercises
        .filter((exercise) => exercise.recentCompletedCount > 0)
        .sort((a, b) => b.recentCompletedCount - a.recentCompletedCount)
        .map((exercise) => exercise.exerciseId)
    )
  ).slice(0, 12);

  const topPositiveExercises = exercises
    .slice()
    .sort((a, b) => {
      const aScore =
        (a.avgRating ?? 0) * 2.2 +
        (a.avgExtraReps ?? 0) * 0.8 -
        a.recent7dCount * 0.5;
      const bScore =
        (b.avgRating ?? 0) * 2.2 +
        (b.avgExtraReps ?? 0) * 0.8 -
        b.recent7dCount * 0.5;

      return bScore - aScore;
    })
    .slice(0, 8)
    .map(mapExerciseInsight);

  const topNegativeExercises = exercises
    .filter(
      (exercise) =>
        (exercise.avgRating ?? 5) <= 3 || (exercise.avgExtraReps ?? 4) <= 1
    )
    .slice()
    .sort((a, b) => {
      const aScore =
        (3 - (a.avgRating ?? 3)) * 2 +
        (1 - Math.min(a.avgExtraReps ?? 1, 1)) +
        a.recent7dCount * 0.5;
      const bScore =
        (3 - (b.avgRating ?? 3)) * 2 +
        (1 - Math.min(b.avgExtraReps ?? 1, 1)) +
        b.recent7dCount * 0.5;

      return bScore - aScore;
    })
    .slice(0, 8)
    .map(mapExerciseInsight);

  return {
    recentWorkouts: workouts.length,
    adherence: {
      completed,
      aborted,
    },
    exercises,
    recentExerciseIds,
    avoidExerciseIds,
    preferredExerciseIds,
    topPositiveExercises,
    topNegativeExercises,
    movementPatternLoad7d,
    movementPatternLoad14d,
  };
}