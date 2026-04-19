import { NextResponse } from "next/server";
import { z } from "zod";
import {
  deleteAllWorkoutLogsByUser,
  getWorkoutLogsByUser,
  insertWorkoutLog,
} from "@/lib/workout-log-repository";
import { requireAuthorizedUserId } from "@/lib/server-auth";

// ===== Scheman =====

const extraRepsSchema = z.union([
  z.literal(0),
  z.literal(2),
  z.literal(4),
  z.literal(6),
]);

const completedSetSchema = z.object({
  setNumber: z.number().int().min(1),
  plannedReps: z.number().int().nullable(),
  plannedWeight: z.number().nullable(),
  actualReps: z.number().int().nullable(),
  actualWeight: z.number().nullable(),
  repsLeft: extraRepsSchema.nullable(),
  completedAt: z.string(),
  context: z.record(z.string(), z.unknown()).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const completedExerciseSchema = z.object({
  exerciseId: z.string(),
  exerciseName: z.string(),
  plannedSets: z.number().int(),
  plannedReps: z.number().int().nullable(),
  plannedDuration: z.number().int().nullable(),
  isNewExercise: z.boolean(),
  rating: z.number().int().min(1).max(5).nullable(),
  extraReps: extraRepsSchema.nullable(),
  sets: z.array(completedSetSchema),
  context: z.record(z.string(), z.unknown()).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const createWorkoutLogSchema = z.object({
  userId: z.string(),
  workoutId: z.string().nullable(),
  workoutName: z.string(),
  startedAt: z.string(),
  completedAt: z.string(),
  durationSeconds: z.number().int(),
  status: z.union([z.literal("completed"), z.literal("aborted")]),
  exercises: z.array(completedExerciseSchema),
  context: z.record(z.string(), z.unknown()).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  events: z
    .array(
      z.object({
        eventType: z.string(),
        eventAt: z.string().optional(),
        payload: z.record(z.string(), z.unknown()).optional(),
        metadata: z.record(z.string(), z.unknown()).optional(),
      }),
    )
    .optional(),
});

// ===== POST (spara pass) =====

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const parsed = createWorkoutLogSchema.parse(body);
    const user = await requireAuthorizedUserId(parsed.userId);

    const result = await insertWorkoutLog({
      ...parsed,
      userId: user.id,
    });

    return NextResponse.json(
      {
        ok: true,
        id: result.id,
        deduped: Boolean(result.deduped),
      },
      { status: result.deduped ? 200 : 201 },
    );
  } catch (error) {
    console.error("POST /api/workout-logs error:", error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          ok: false,
          error: "Invalid workout log payload",
          issues: error.issues,
        },
        { status: 400 },
      );
    }

    if (error instanceof Error) {
      if (error.message === "Unauthorized") {
        return NextResponse.json(
          { ok: false, error: "Ej inloggad" },
          { status: 401 },
        );
      }

      if (error.message === "Account disabled") {
        return NextResponse.json(
          { ok: false, error: "Kontot är inaktiverat" },
          { status: 403 },
        );
      }

      if (error.message === "Forbidden") {
        return NextResponse.json(
          { ok: false, error: "Ingen behörighet" },
          { status: 403 },
        );
      }
    }

    return NextResponse.json(
      {
        ok: false,
        error: "Failed to save workout log",
      },
      { status: 500 },
    );
  }
}

// ===== GET (hämta loggar) =====

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const requestedUserId = searchParams.get("userId");
    const limitParam = searchParams.get("limit");
    const user = await requireAuthorizedUserId(requestedUserId);

    const limit = limitParam ? Number(limitParam) : 20;

    if (!Number.isFinite(limit) || limit <= 0) {
      return NextResponse.json(
        { ok: false, error: "Invalid limit" },
        { status: 400 },
      );
    }

    const logs = await getWorkoutLogsByUser(user.id, limit);

    return NextResponse.json({
      ok: true,
      logs,
    });
  } catch (error) {
    console.error("GET /api/workout-logs error:", error);

    if (error instanceof Error) {
      if (error.message === "Unauthorized") {
        return NextResponse.json(
          { ok: false, error: "Ej inloggad" },
          { status: 401 },
        );
      }

      if (error.message === "Account disabled") {
        return NextResponse.json(
          { ok: false, error: "Kontot är inaktiverat" },
          { status: 403 },
        );
      }

      if (error.message === "Forbidden") {
        return NextResponse.json(
          { ok: false, error: "Ingen behörighet" },
          { status: 403 },
        );
      }
    }

    return NextResponse.json(
      {
        ok: false,
        error: "Failed to fetch workout logs",
      },
      { status: 500 },
    );
  }
}

// ===== DELETE (radera all träningsdata för användaren) =====

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const requestedUserId = searchParams.get("userId");
    const user = await requireAuthorizedUserId(requestedUserId);

    const result = await deleteAllWorkoutLogsByUser(user.id);

    return NextResponse.json({
      ok: true,
      deletedCount: result.deletedCount,
    });
  } catch (error) {
    console.error("DELETE /api/workout-logs error:", error);

    if (error instanceof Error) {
      if (error.message === "Unauthorized") {
        return NextResponse.json(
          { ok: false, error: "Ej inloggad" },
          { status: 401 },
        );
      }

      if (error.message === "Account disabled") {
        return NextResponse.json(
          { ok: false, error: "Kontot är inaktiverat" },
          { status: 403 },
        );
      }

      if (error.message === "Forbidden") {
        return NextResponse.json(
          { ok: false, error: "Ingen behörighet" },
          { status: 403 },
        );
      }
    }

    return NextResponse.json(
      {
        ok: false,
        error: "Failed to delete workout logs",
      },
      { status: 500 },
    );
  }
}
