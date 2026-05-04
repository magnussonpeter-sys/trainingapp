import type {
  PlannedSession,
  WeeklyPlanFlexibility,
  WeeklyPlanState,
} from "@/lib/planning/weekly-plan";

function toIsoDate(value: Date | string) {
  const date = typeof value === "string" ? new Date(value) : new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getDateDiffInDays(left: string, right: string) {
  const leftDate = new Date(left);
  const rightDate = new Date(right);
  leftDate.setHours(0, 0, 0, 0);
  rightDate.setHours(0, 0, 0, 0);
  return Math.round((leftDate.getTime() - rightDate.getTime()) / (24 * 60 * 60 * 1000));
}

function getMatchWindowDays(flexibility: WeeklyPlanFlexibility) {
  if (flexibility === "strict") {
    return 0;
  }

  if (flexibility === "balanced") {
    return 1;
  }

  return 7;
}

export function postponePlannedSession(
  plannedSessions: PlannedSession[],
  sessionId: string,
  newDate: string,
) {
  return plannedSessions.map((session) => {
    if (session.id !== sessionId) {
      return session;
    }

    return {
      ...session,
      plannedDate: newDate,
      status: "moved" as const,
      movedFromDate: session.plannedDate,
      movedToDate: newDate,
    };
  });
}

export function markMissedSessions(
  plannedSessions: PlannedSession[],
  currentDate: string | Date,
  flexibility: WeeklyPlanFlexibility,
) {
  const currentDateIso = toIsoDate(currentDate);
  const graceDays = flexibility === "flexible" ? 2 : 0;

  return plannedSessions.map((session) => {
    if (session.status !== "planned" && session.status !== "moved") {
      return session;
    }

    if (getDateDiffInDays(currentDateIso, session.plannedDate) <= graceDays) {
      return session;
    }

    return {
      ...session,
      status: "missed" as const,
    };
  });
}

export function reconcileWorkoutWithWeeklyPlan(
  workoutLog: {
    id: string;
    completedAt: string;
    status: "completed" | "aborted";
  },
  currentPlanState: WeeklyPlanState,
) {
  const workoutDate = toIsoDate(workoutLog.completedAt);
  const matchWindowDays = getMatchWindowDays(currentPlanState.settings.flexibility);
  const nextSessions = currentPlanState.plannedSessions.map((session) => ({ ...session }));

  const directMatch = nextSessions
    .filter((session) => session.status === "planned" || session.status === "moved")
    .filter((session) => Math.abs(getDateDiffInDays(workoutDate, session.plannedDate)) <= matchWindowDays)
    .sort(
      (left, right) =>
        Math.abs(getDateDiffInDays(workoutDate, left.plannedDate)) -
        Math.abs(getDateDiffInDays(workoutDate, right.plannedDate)),
    )[0];

  if (directMatch) {
    directMatch.status = "completed";
    directMatch.completedWorkoutLogId = workoutLog.id;

    return {
      plannedSessions: nextSessions,
      matchedSessionId: directMatch.id,
      reconciliationMode: "matched_planned_session" as const,
    };
  }

  const replaceCandidate =
    currentPlanState.settings.flexibility === "strict"
      ? null
      : nextSessions
          .filter((session) => session.status === "planned" || session.status === "moved")
          .filter((session) => getDateDiffInDays(session.plannedDate, workoutDate) >= 0)
          .sort(
            (left, right) =>
              Math.abs(getDateDiffInDays(left.plannedDate, workoutDate)) -
              Math.abs(getDateDiffInDays(right.plannedDate, workoutDate)),
          )[0] ?? null;

  if (replaceCandidate) {
    replaceCandidate.status = "replaced_by_spontaneous";
    replaceCandidate.replacedByWorkoutLogId = workoutLog.id;

    return {
      plannedSessions: nextSessions,
      matchedSessionId: replaceCandidate.id,
      reconciliationMode: "replaced_future_session" as const,
    };
  }

  return {
    plannedSessions: nextSessions,
    matchedSessionId: null,
    reconciliationMode: "spontaneous_workout" as const,
  };
}
