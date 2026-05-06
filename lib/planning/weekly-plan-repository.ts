import { pool } from "@/lib/db";
import {
  buildWeeklyPlanContext,
  buildInitialWeeklyPlan,
  buildWeeklyPlanStatus,
  deriveWeeklyPlanState,
  getDefaultWeeklyPlanSettings,
  getPriorityMusclesFromProfile,
  getWeekStartDate,
  type PlannedSession,
  type ProfilePriorityMuscleFields,
  type WeeklyPlanSettings,
  type WeeklyPlanStatus,
  type WeeklyPlanContext,
  type WeeklyPlanState,
} from "@/lib/planning/weekly-plan";
import {
  markMissedSessions,
  postponePlannedSession,
} from "@/lib/planning/weekly-plan-adjustments";
import { getWorkoutLogsByUser } from "@/lib/workout-log-repository";
import type { MuscleBudgetGroup } from "@/lib/planning/muscle-budget";

type WeeklyPlanSettingsRow = {
  userId: string;
  sessionsPerWeek: number;
  preferredDays: string[];
  defaultDurationMinutes: number;
  minDurationMinutes: number;
  maxDurationMinutes: number;
  preferredGymId: string | null;
  flexibility: WeeklyPlanSettings["flexibility"];
  priorityMuscles: string[];
  easyMuscles: string[];
  updatedAt: string;
};

type PlannedSessionRow = {
  id: string;
  userId: string;
  weekStartDate: string | Date;
  weekday: string;
  plannedDate: string | Date;
  targetDurationMinutes: number;
  focus: string;
  priorityMuscles: string[];
  preferredGymId: string | null;
  status: string;
  completedWorkoutLogId: string | null;
  replacedByWorkoutLogId: string | null;
  movedFromDate: string | null;
  movedToDate: string | null;
};

type UserPlanProfileRow = {
  training_goal: string | null;
  primary_priority_muscle: string | null;
  secondary_priority_muscle: string | null;
  tertiary_priority_muscle: string | null;
};

function normalizeStringArray(value: unknown) {
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === "string");
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed)
        ? parsed.filter((entry): entry is string => typeof entry === "string")
        : [];
    } catch {
      return [];
    }
  }

  return [];
}

function toIsoDate(value: string | Date | null | undefined) {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return null;
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalizeWeekday(value: string): WeeklyPlanSettings["preferredDays"][number] {
  if (
    value === "monday" ||
    value === "tuesday" ||
    value === "wednesday" ||
    value === "thursday" ||
    value === "friday" ||
    value === "saturday" ||
    value === "sunday"
  ) {
    return value;
  }

  return "monday";
}

function normalizeFlexibility(
  value: string,
): WeeklyPlanSettings["flexibility"] {
  if (value === "strict" || value === "balanced" || value === "flexible") {
    return value;
  }

  return "balanced";
}

function normalizePlannedFocus(value: string): PlannedSession["focus"] {
  if (
    value === "upper" ||
    value === "lower" ||
    value === "full_body" ||
    value === "push" ||
    value === "pull" ||
    value === "core" ||
    value === "mobility"
  ) {
    return value;
  }

  return "full_body";
}

function normalizePlannedStatus(value: string): PlannedSession["status"] {
  if (
    value === "planned" ||
    value === "completed" ||
    value === "missed" ||
    value === "moved" ||
    value === "replaced_by_spontaneous"
  ) {
    return value;
  }

  return "planned";
}

function isMuscleBudgetGroup(value: string): value is MuscleBudgetGroup {
  return (
    value === "chest" ||
    value === "back" ||
    value === "quads" ||
    value === "hamstrings" ||
    value === "glutes" ||
    value === "shoulders" ||
    value === "biceps" ||
    value === "triceps" ||
    value === "calves" ||
    value === "core"
  );
}

function normalizePriorityMuscle(value: string | null) {
  return value && isMuscleBudgetGroup(value) ? value : null;
}

function mapSettingsRow(row: WeeklyPlanSettingsRow): WeeklyPlanSettings {
  const preferredDays = normalizeStringArray(row.preferredDays).map(normalizeWeekday);
  const priorityMuscles = normalizeStringArray(row.priorityMuscles);
  const easyMuscles = normalizeStringArray(row.easyMuscles);

  return {
    userId: row.userId,
    sessionsPerWeek: row.sessionsPerWeek,
    preferredDays,
    defaultDurationMinutes: row.defaultDurationMinutes,
    minDurationMinutes: row.minDurationMinutes,
    maxDurationMinutes: row.maxDurationMinutes,
    preferredGymId: row.preferredGymId,
    flexibility: normalizeFlexibility(row.flexibility),
    priorityMuscles: priorityMuscles as WeeklyPlanSettings["priorityMuscles"],
    easyMuscles: easyMuscles as WeeklyPlanSettings["easyMuscles"],
    updatedAt: row.updatedAt,
  };
}

function mapSessionRow(row: PlannedSessionRow): PlannedSession {
  const priorityMuscles = normalizeStringArray(row.priorityMuscles);

  return {
    id: row.id,
    userId: row.userId,
    weekStartDate: toIsoDate(row.weekStartDate) ?? "",
    weekday: normalizeWeekday(row.weekday),
    plannedDate: toIsoDate(row.plannedDate) ?? "",
    targetDurationMinutes: row.targetDurationMinutes,
    focus: normalizePlannedFocus(row.focus),
    priorityMuscles: priorityMuscles as PlannedSession["priorityMuscles"],
    preferredGymId: row.preferredGymId,
    status: normalizePlannedStatus(row.status),
    completedWorkoutLogId: row.completedWorkoutLogId,
    replacedByWorkoutLogId: row.replacedByWorkoutLogId,
    movedFromDate: row.movedFromDate,
    movedToDate: row.movedToDate,
  };
}

export async function ensureWeeklyPlanTables() {
  await pool.query(`
    create table if not exists weekly_plan_settings (
      id text primary key,
      user_id text not null unique,
      sessions_per_week integer not null,
      preferred_days jsonb not null default '[]'::jsonb,
      default_duration_minutes integer not null,
      min_duration_minutes integer not null,
      max_duration_minutes integer not null,
      preferred_gym_id text null,
      flexibility text not null,
      priority_muscles jsonb not null default '[]'::jsonb,
      easy_muscles jsonb not null default '[]'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `);

  await pool.query(`
    create table if not exists weekly_planned_sessions (
      id text primary key,
      user_id text not null,
      week_start_date date not null,
      weekday text not null,
      planned_date date not null,
      target_duration_minutes integer not null,
      focus text not null,
      priority_muscles jsonb not null default '[]'::jsonb,
      preferred_gym_id text null,
      status text not null,
      completed_workout_log_id text null,
      replaced_by_workout_log_id text null,
      moved_from_date date null,
      moved_to_date date null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `);

  await pool.query(`
    create index if not exists weekly_planned_sessions_user_week_idx
    on weekly_planned_sessions (user_id, week_start_date)
  `);

  // Veckoplanmotorn läser mål och prioriteringar server-side för att undvika
  // att /home och /home/plan bygger olika rekommendationer.
  await pool.query(`
    ALTER TABLE user_settings
    ADD COLUMN IF NOT EXISTS primary_priority_muscle TEXT
  `);
  await pool.query(`
    ALTER TABLE user_settings
    ADD COLUMN IF NOT EXISTS secondary_priority_muscle TEXT
  `);
  await pool.query(`
    ALTER TABLE user_settings
    ADD COLUMN IF NOT EXISTS tertiary_priority_muscle TEXT
  `);
}

async function getWeeklyPlanUserProfile(userId: string) {
  const result = await pool.query<UserPlanProfileRow>(
    `
      select
        training_goal,
        primary_priority_muscle,
        secondary_priority_muscle,
        tertiary_priority_muscle
      from user_settings
      where user_id = $1
      limit 1
    `,
    [userId],
  );

  const row = result.rows[0];
  if (!row) {
    return {
      goal: null,
      priorityMuscles: [] as MuscleBudgetGroup[],
    };
  }

  return {
    goal: row.training_goal ?? null,
    priorityMuscles: getPriorityMusclesFromProfile({
      primary_priority_muscle: normalizePriorityMuscle(row.primary_priority_muscle),
      secondary_priority_muscle: normalizePriorityMuscle(row.secondary_priority_muscle),
      tertiary_priority_muscle: normalizePriorityMuscle(row.tertiary_priority_muscle),
    } satisfies ProfilePriorityMuscleFields),
  };
}

function buildWeeklyPlanBundle(params: {
  settings: WeeklyPlanSettings;
  state: WeeklyPlanState;
}) {
  return {
    settings: params.settings,
    plannedSessions: params.state.plannedSessions,
    state: params.state,
    status: buildWeeklyPlanStatus(params.state),
    context: buildWeeklyPlanContext(params.state),
  };
}

export async function getWeeklyPlanSettingsByUser(userId: string) {
  await ensureWeeklyPlanTables();

  const result = await pool.query<WeeklyPlanSettingsRow>(
    `
      select
        user_id as "userId",
        sessions_per_week as "sessionsPerWeek",
        preferred_days as "preferredDays",
        default_duration_minutes as "defaultDurationMinutes",
        min_duration_minutes as "minDurationMinutes",
        max_duration_minutes as "maxDurationMinutes",
        preferred_gym_id as "preferredGymId",
        flexibility,
        priority_muscles as "priorityMuscles",
        easy_muscles as "easyMuscles",
        updated_at as "updatedAt"
      from weekly_plan_settings
      where user_id = $1
      limit 1
    `,
    [userId],
  );

  return result.rows[0] ? mapSettingsRow(result.rows[0]) : null;
}

export async function upsertWeeklyPlanSettings(settings: WeeklyPlanSettings) {
  await ensureWeeklyPlanTables();

  const id = `weekly-plan-settings:${settings.userId}`;
  const result = await pool.query<WeeklyPlanSettingsRow>(
    `
      insert into weekly_plan_settings (
        id,
        user_id,
        sessions_per_week,
        preferred_days,
        default_duration_minutes,
        min_duration_minutes,
        max_duration_minutes,
        preferred_gym_id,
        flexibility,
        priority_muscles,
        easy_muscles
      )
      values ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb)
      on conflict (user_id)
      do update set
        sessions_per_week = excluded.sessions_per_week,
        preferred_days = excluded.preferred_days,
        default_duration_minutes = excluded.default_duration_minutes,
        min_duration_minutes = excluded.min_duration_minutes,
        max_duration_minutes = excluded.max_duration_minutes,
        preferred_gym_id = excluded.preferred_gym_id,
        flexibility = excluded.flexibility,
        priority_muscles = excluded.priority_muscles,
        easy_muscles = excluded.easy_muscles,
        updated_at = now()
      returning
        user_id as "userId",
        sessions_per_week as "sessionsPerWeek",
        preferred_days as "preferredDays",
        default_duration_minutes as "defaultDurationMinutes",
        min_duration_minutes as "minDurationMinutes",
        max_duration_minutes as "maxDurationMinutes",
        preferred_gym_id as "preferredGymId",
        flexibility,
        priority_muscles as "priorityMuscles",
        easy_muscles as "easyMuscles",
        updated_at as "updatedAt"
    `,
    [
      id,
      settings.userId,
      settings.sessionsPerWeek,
      JSON.stringify(settings.preferredDays),
      settings.defaultDurationMinutes,
      settings.minDurationMinutes,
      settings.maxDurationMinutes,
      settings.preferredGymId ?? null,
      settings.flexibility,
      JSON.stringify(settings.priorityMuscles),
      JSON.stringify(settings.easyMuscles),
    ],
  );

  return mapSettingsRow(result.rows[0]);
}

export async function getWeeklyPlannedSessions(
  userId: string,
  weekStartDate: string,
) {
  await ensureWeeklyPlanTables();

  const result = await pool.query<PlannedSessionRow>(
    `
      select
        id,
        user_id as "userId",
        week_start_date as "weekStartDate",
        weekday,
        planned_date as "plannedDate",
        target_duration_minutes as "targetDurationMinutes",
        focus,
        priority_muscles as "priorityMuscles",
        preferred_gym_id as "preferredGymId",
        status,
        completed_workout_log_id as "completedWorkoutLogId",
        replaced_by_workout_log_id as "replacedByWorkoutLogId",
        moved_from_date as "movedFromDate",
        moved_to_date as "movedToDate"
      from weekly_planned_sessions
      where user_id = $1
        and week_start_date = $2::date
      order by planned_date asc, created_at asc
    `,
    [userId, weekStartDate],
  );

  return result.rows.map(mapSessionRow);
}

export async function replaceWeeklyPlannedSessions(
  userId: string,
  weekStartDate: string,
  sessions: PlannedSession[],
) {
  await ensureWeeklyPlanTables();
  const client = await pool.connect();

  try {
    await client.query("begin");

    await client.query(
      `
        delete from weekly_planned_sessions
        where user_id = $1
          and week_start_date = $2::date
      `,
      [userId, weekStartDate],
    );

    for (const session of sessions) {
      await client.query(
        `
          insert into weekly_planned_sessions (
            id,
            user_id,
            week_start_date,
            weekday,
            planned_date,
            target_duration_minutes,
            focus,
            priority_muscles,
            preferred_gym_id,
            status,
            completed_workout_log_id,
            replaced_by_workout_log_id,
            moved_from_date,
            moved_to_date
          )
          values (
            $1, $2, $3::date, $4, $5::date, $6, $7, $8::jsonb, $9, $10, $11, $12, $13::date, $14::date
          )
        `,
        [
          session.id,
          session.userId,
          session.weekStartDate,
          session.weekday,
          session.plannedDate,
          session.targetDurationMinutes,
          session.focus,
          JSON.stringify(session.priorityMuscles),
          session.preferredGymId ?? null,
          session.status,
          session.completedWorkoutLogId ?? null,
          session.replacedByWorkoutLogId ?? null,
          session.movedFromDate ?? null,
          session.movedToDate ?? null,
        ],
      );
    }

    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

async function getOrCreateWeeklyPlanParts(userId: string, now: Date) {
  const weekStartDate = getWeekStartDate(now);
  const settings =
    (await getWeeklyPlanSettingsByUser(userId)) ?? getDefaultWeeklyPlanSettings(userId);
  let plannedSessions = await getWeeklyPlannedSessions(userId, weekStartDate);

  if (plannedSessions.length === 0) {
    plannedSessions = buildInitialWeeklyPlan(settings, weekStartDate);
    await replaceWeeklyPlannedSessions(userId, weekStartDate, plannedSessions);
  }

  return {
    weekStartDate,
    settings,
    plannedSessions,
  };
}

export async function getWeeklyPlanStateForUser(
  userId: string,
  now = new Date(),
): Promise<{
  settings: WeeklyPlanSettings;
  plannedSessions: PlannedSession[];
  state: WeeklyPlanState;
  status: WeeklyPlanStatus;
  context: WeeklyPlanContext;
}> {
  const { settings, plannedSessions } = await getOrCreateWeeklyPlanParts(userId, now);
  const logs = await getWorkoutLogsByUser(userId, 120);
  const profile = await getWeeklyPlanUserProfile(userId);
  const state = deriveWeeklyPlanState({
    settings,
    plannedSessions,
    workoutLogs: logs,
    now,
    goal: profile.goal,
    priorityMuscles: profile.priorityMuscles,
  });

  return buildWeeklyPlanBundle({
    settings,
    state,
  });
}

export async function saveWeeklyPlanSettingsAndRebuildCurrentWeek(
  settings: WeeklyPlanSettings,
  now = new Date(),
) {
  const savedSettings = await upsertWeeklyPlanSettings(settings);
  const weekStartDate = getWeekStartDate(now);
  const nextSessions = buildInitialWeeklyPlan(savedSettings, weekStartDate);

  // MVP: vi bygger om innevarande vecka helt när användaren ändrar sina ramar.
  await replaceWeeklyPlannedSessions(savedSettings.userId, weekStartDate, nextSessions);

  return getWeeklyPlanStateForUser(savedSettings.userId, now);
}

export async function postponeWeeklyPlanSession(
  userId: string,
  sessionId: string,
  newDate: string,
  now = new Date(),
) {
  const { settings, plannedSessions } = await getOrCreateWeeklyPlanParts(userId, now);
  const profile = await getWeeklyPlanUserProfile(userId);
  const nextSessions = postponePlannedSession(plannedSessions, sessionId, newDate);

  await replaceWeeklyPlannedSessions(userId, getWeekStartDate(now), nextSessions);

  return buildWeeklyPlanBundle({
    settings,
    state: deriveWeeklyPlanState({
      settings,
      plannedSessions: nextSessions,
      workoutLogs: await getWorkoutLogsByUser(userId, 120),
      now,
      goal: profile.goal,
      priorityMuscles: profile.priorityMuscles,
    }),
  });
}

export async function recalculateWeeklyPlanState(
  userId: string,
  now = new Date(),
) {
  const { settings, plannedSessions } = await getOrCreateWeeklyPlanParts(userId, now);
  const logs = await getWorkoutLogsByUser(userId, 120);
  const profile = await getWeeklyPlanUserProfile(userId);
  const markedSessions = markMissedSessions(
    plannedSessions,
    now,
    settings.flexibility,
  );
  const state = deriveWeeklyPlanState({
    settings,
    plannedSessions: markedSessions,
    workoutLogs: logs,
    now,
    goal: profile.goal,
    priorityMuscles: profile.priorityMuscles,
  });

  await replaceWeeklyPlannedSessions(userId, getWeekStartDate(now), state.plannedSessions);

  return buildWeeklyPlanBundle({
    settings,
    state,
  });
}

export async function reconcileWorkoutLogWithWeeklyPlan(
  userId: string,
  workoutLog: {
    id: string;
    completedAt: string;
    status: "completed" | "aborted";
  },
) {
  const now = new Date(workoutLog.completedAt);
  const { settings, plannedSessions } = await getOrCreateWeeklyPlanParts(userId, now);
  const profile = await getWeeklyPlanUserProfile(userId);
  const recalculatedState = deriveWeeklyPlanState({
    settings,
    plannedSessions,
    workoutLogs: await getWorkoutLogsByUser(userId, 120),
    now,
    goal: profile.goal,
    priorityMuscles: profile.priorityMuscles,
  });
  const nextSessions = markMissedSessions(
    recalculatedState.plannedSessions,
    now,
    settings.flexibility,
  );

  await replaceWeeklyPlannedSessions(userId, getWeekStartDate(now), nextSessions);
}
