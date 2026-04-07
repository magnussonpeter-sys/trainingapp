import { pool } from "@/lib/db";
import type { CreateWorkoutLogInput } from "@/lib/workout-log-db-types";

// Hämtar clientSyncId från metadata om det finns.
// Vi använder den för idempotent offline-sync.
function getClientSyncId(input: CreateWorkoutLogInput) {
  const rawValue = input.metadata?.clientSyncId;

  return typeof rawValue === "string" && rawValue.trim()
    ? rawValue.trim()
    : null;
}

// Letar efter befintligt pass med samma clientSyncId.
// Vi begränsar till samma användare för säkerhets skull.
async function findWorkoutLogByClientSyncId(
  userId: string,
  clientSyncId: string,
) {
  const result = await pool.query<{ id: string }>(
    `
      select wl.id
      from workout_logs wl
      where wl.user_id = $1
        and coalesce(wl.metadata->>'clientSyncId', '') = $2
      order by wl.completed_at desc
      limit 1
    `,
    [userId, clientSyncId],
  );

  return result.rows[0] ?? null;
}

export async function insertWorkoutLog(input: CreateWorkoutLogInput) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const clientSyncId = getClientSyncId(input);

    // Advisory lock skyddar mot race condition om samma offline-pass
    // skickas två gånger nästan samtidigt.
    if (clientSyncId) {
      await client.query(
        `
          select pg_advisory_xact_lock(
            hashtext($1),
            hashtext($2)
          )
        `,
        [input.userId, clientSyncId],
      );

      const existingResult = await client.query<{ id: string }>(
        `
          select wl.id
          from workout_logs wl
          where wl.user_id = $1
            and coalesce(wl.metadata->>'clientSyncId', '') = $2
          order by wl.completed_at desc
          limit 1
        `,
        [input.userId, clientSyncId],
      );

      const existingRow = existingResult.rows[0];

      if (existingRow) {
        await client.query("COMMIT");

        return {
          id: existingRow.id,
          deduped: true as const,
        };
      }
    }

    // Sparar själva passet först.
    const workoutLogResult = await client.query<{ id: string }>(
      `
        insert into workout_logs (
          user_id,
          workout_id,
          workout_name,
          started_at,
          completed_at,
          duration_seconds,
          status,
          context,
          metadata
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb)
        returning id
      `,
      [
        input.userId,
        input.workoutId,
        input.workoutName,
        input.startedAt,
        input.completedAt,
        input.durationSeconds,
        input.status,
        JSON.stringify(input.context ?? {}),
        JSON.stringify(input.metadata ?? {}),
      ],
    );

    const workoutLogId = workoutLogResult.rows[0].id;

    // Sparar övningarna.
    for (let exerciseIndex = 0; exerciseIndex < input.exercises.length; exerciseIndex += 1) {
      const exercise = input.exercises[exerciseIndex];

      const exerciseResult = await client.query<{ id: string }>(
        `
          insert into workout_log_exercises (
            workout_log_id,
            exercise_id,
            exercise_name,
            order_index,
            planned_sets,
            planned_reps,
            planned_duration,
            is_new_exercise,
            rating,
            extra_reps,
            context,
            metadata
          )
          values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12::jsonb)
          returning id
        `,
        [
          workoutLogId,
          exercise.exerciseId,
          exercise.exerciseName,
          exerciseIndex,
          exercise.plannedSets,
          exercise.plannedReps,
          exercise.plannedDuration,
          exercise.isNewExercise,
          exercise.rating,
          exercise.extraReps,
          JSON.stringify(exercise.context ?? {}),
          JSON.stringify(exercise.metadata ?? {}),
        ],
      );

      const workoutLogExerciseId = exerciseResult.rows[0].id;

      // Sparar alla set.
      for (const set of exercise.sets) {
        await client.query(
          `
            insert into workout_log_sets (
              workout_log_exercise_id,
              set_number,
              planned_reps,
              planned_weight,
              actual_reps,
              actual_weight,
              reps_left,
              completed_at,
              context,
              metadata
            )
            values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb)
          `,
          [
            workoutLogExerciseId,
            set.setNumber,
            set.plannedReps,
            set.plannedWeight,
            set.actualReps,
            set.actualWeight,
            set.repsLeft,
            set.completedAt,
            JSON.stringify(set.context ?? {}),
            JSON.stringify(set.metadata ?? {}),
          ],
        );
      }
    }

    // Sparar event om sådana finns.
    for (const event of input.events ?? []) {
      await client.query(
        `
          insert into workout_log_events (
            workout_log_id,
            event_type,
            event_at,
            payload,
            metadata
          )
          values ($1, $2, $3, $4::jsonb, $5::jsonb)
        `,
        [
          workoutLogId,
          event.eventType,
          event.eventAt ?? new Date().toISOString(),
          JSON.stringify(event.payload ?? {}),
          JSON.stringify(event.metadata ?? {}),
        ],
      );
    }

    await client.query("COMMIT");

    return {
      id: workoutLogId,
      deduped: false as const,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function getWorkoutLogsByUser(userId: string, limit = 20) {
  const result = await pool.query(
    `
      select
        wl.id,
        wl.user_id as "userId",
        wl.workout_id as "workoutId",
        wl.workout_name as "workoutName",
        wl.started_at as "startedAt",
        wl.completed_at as "completedAt",
        wl.duration_seconds as "durationSeconds",
        wl.status,
        wl.context,
        wl.metadata,
        coalesce(
          json_agg(
            json_build_object(
              'exerciseId', wle.exercise_id,
              'exerciseName', wle.exercise_name,
              'plannedSets', wle.planned_sets,
              'plannedReps', wle.planned_reps,
              'plannedDuration', wle.planned_duration,
              'isNewExercise', wle.is_new_exercise,
              'rating', wle.rating,
              'extraReps', wle.extra_reps,
              'context', wle.context,
              'metadata', wle.metadata,
              'sets',
                coalesce(
                  (
                    select json_agg(
                      json_build_object(
                        'setNumber', wls.set_number,
                        'plannedReps', wls.planned_reps,
                        'plannedWeight', wls.planned_weight,
                        'actualReps', wls.actual_reps,
                        'actualWeight', wls.actual_weight,
                        'repsLeft', wls.reps_left,
                        'completedAt', wls.completed_at,
                        'context', wls.context,
                        'metadata', wls.metadata
                      )
                      order by wls.set_number
                    )
                    from workout_log_sets wls
                    where wls.workout_log_exercise_id = wle.id
                  ),
                  '[]'::json
                )
            )
            order by wle.order_index
          ) filter (where wle.id is not null),
          '[]'::json
        ) as exercises
      from workout_logs wl
      left join workout_log_exercises wle on wle.workout_log_id = wl.id
      where wl.user_id = $1
        and wl.status = 'completed'
      group by wl.id
      order by wl.completed_at desc
      limit $2
    `,
    [userId, limit],
  );

  return result.rows;
}

export async function getLatestExercisePerformance(
  userId: string,
  exerciseId: string,
) {
  const result = await pool.query(
    `
      select
        wl.completed_at as "completedAt",
        wls.actual_weight as "actualWeight",
        wls.actual_reps as "actualReps",
        wls.reps_left as "repsLeft"
      from workout_logs wl
      join workout_log_exercises wle on wle.workout_log_id = wl.id
      join workout_log_sets wls on wls.workout_log_exercise_id = wle.id
      where wl.user_id = $1
        and wle.exercise_id = $2
        and wl.status = 'completed'
      order by wl.completed_at desc, wls.set_number desc
      limit 1
    `,
    [userId, exerciseId],
  );

  return result.rows[0] ?? null;
}

export async function deleteWorkoutLogById(userId: string, workoutLogId: string) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const exerciseIdsResult = await client.query<{ id: string }>(
      `
        select wle.id
        from workout_log_exercises wle
        join workout_logs wl on wl.id = wle.workout_log_id
        where wl.id = $1
          and wl.user_id = $2
      `,
      [workoutLogId, userId],
    );

    const exerciseIds = exerciseIdsResult.rows.map((row) => row.id);

    if (exerciseIds.length > 0) {
      await client.query(
        `
          delete from workout_log_sets
          where workout_log_exercise_id = any($1::uuid[])
        `,
        [exerciseIds],
      );
    }

    await client.query(
      `
        delete from workout_log_events
        where workout_log_id = $1
      `,
      [workoutLogId],
    );

    await client.query(
      `
        delete from workout_log_exercises
        where workout_log_id = $1
      `,
      [workoutLogId],
    );

    const deleteResult = await client.query<{ id: string }>(
      `
        delete from workout_logs
        where id = $1
          and user_id = $2
        returning id
      `,
      [workoutLogId, userId],
    );

    await client.query("COMMIT");

    return {
      deleted: (deleteResult.rowCount ?? 0) > 0,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function deleteAllWorkoutLogsByUser(userId: string) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const exerciseIdsResult = await client.query<{ id: string }>(
      `
        select wle.id
        from workout_log_exercises wle
        join workout_logs wl on wl.id = wle.workout_log_id
        where wl.user_id = $1
      `,
      [userId],
    );

    const exerciseIds = exerciseIdsResult.rows.map((row) => row.id);

    if (exerciseIds.length > 0) {
      await client.query(
        `
          delete from workout_log_sets
          where workout_log_exercise_id = any($1::uuid[])
        `,
        [exerciseIds],
      );
    }

    await client.query(
      `
        delete from workout_log_events
        where workout_log_id in (
          select id from workout_logs where user_id = $1
        )
      `,
      [userId],
    );

    await client.query(
      `
        delete from workout_log_exercises
        where workout_log_id in (
          select id from workout_logs where user_id = $1
        )
      `,
      [userId],
    );

    const deleteLogsResult = await client.query(
      `
        delete from workout_logs
        where user_id = $1
      `,
      [userId],
    );

    await client.query("COMMIT");

    return {
      deletedCount: deleteLogsResult.rowCount ?? 0,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

// Extra hjälpfunktion för framtida debug/cleanup.
// Inte använd ännu, men praktisk om du senare vill felsöka clientSyncId.
export async function findExistingWorkoutLogByClientSyncId(
  userId: string,
  clientSyncId: string,
) {
  return findWorkoutLogByClientSyncId(userId, clientSyncId);
}