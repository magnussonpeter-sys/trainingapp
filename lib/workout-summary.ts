import { pool } from "@/lib/db";

type ExerciseSummary = {
  exerciseId: string;
  avgRating: number | null;
  avgExtraReps: number | null;
  lastWeight: number | null;
  lastReps: number | null;
  completedCount: number;
  recentCompletedCount: number;
};

function toNumberOrNull(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function getWorkoutSummaryForAI(userId: string) {
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
      avg(wle.rating) as avg_rating,
      avg(wle.extra_reps) as avg_extra_reps,
      count(*) filter (where wl.status = 'completed') as completed_count
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
      : { rows: [] as Array<{ exercise_id: string; recent_completed_count: string }> };

  const recentUsageMap = new Map(
    recentExerciseUsageRes.rows.map((row) => [
      row.exercise_id,
      Number(row.recent_completed_count),
    ])
  );

  // ===== 5. Kombinera till AI-underlag =====
  const exercises: ExerciseSummary[] = exerciseStatsRes.rows.map((row) => {
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
    };
  });

  // ===== 6. Styrsignaler till AI =====
  // avoidExerciseIds:
  // - nyligen ofta använda
  // - eller tydligt lågt omdöme / dålig tolerans
  const avoidExerciseIds = exercises
    .filter((exercise) => {
      const lowRating =
        exercise.avgRating !== null && exercise.avgRating > 0 && exercise.avgRating <= 2.5;

      const poorTolerance =
        exercise.avgExtraReps !== null && exercise.avgExtraReps < 0.5;

      const overusedRecently = exercise.recentCompletedCount >= 2;

      return lowRating || poorTolerance || overusedRecently;
    })
    .map((exercise) => exercise.exerciseId);

  // preferredExerciseIds:
  // - bra betyg
  // - bra marginal
  // - inte överanvända allra senast
  const preferredExerciseIds = exercises
    .filter((exercise) => {
      const goodRating =
        exercise.avgRating !== null && exercise.avgRating >= 4;

      const goodTolerance =
        exercise.avgExtraReps !== null && exercise.avgExtraReps >= 2;

      const notOverusedRecently = exercise.recentCompletedCount < 2;

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

  // recentExerciseIds:
  // separat lista för variation från senaste passen
  const recentExerciseIds = Array.from(
    new Set(
      exercises
        .filter((exercise) => exercise.recentCompletedCount > 0)
        .sort((a, b) => b.recentCompletedCount - a.recentCompletedCount)
        .map((exercise) => exercise.exerciseId)
    )
  ).slice(0, 12);

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
  };
}