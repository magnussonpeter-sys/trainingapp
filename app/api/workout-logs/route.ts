import { NextResponse } from "next/server";
import { z } from "zod";
import {
  deleteAllWorkoutLogsByUser,
  getWorkoutLogsByUser,
  insertWorkoutLog,
} from "@/lib/workout-log-repository";

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
      })
    )
    .optional(),
});

// ===== POST (spara pass) =====

export async function POST(request: Request) {
  try {
    const body = await request.json();

    console.log("POST /api/workout-logs body:", body);

    const parsed = createWorkoutLogSchema.parse(body);

    console.log("POST /api/workout-logs parsed:", {
      userId: parsed.userId,
      workoutId: parsed.workoutId,
      workoutName: parsed.workoutName,
      status: parsed.status,
      exerciseCount: parsed.exercises.length,
    });

    const result = await insertWorkoutLog(parsed);

    console.log("POST /api/workout-logs inserted:", result);

    return NextResponse.json(
      {
        ok: true,
        id: result.id,
      },
      { status: 201 }
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
        { status: 400 }
      );
    }

    const message =
      error instanceof Error ? error.message : "Unknown database error";

    return NextResponse.json(
      {
        ok: false,
        error: "Failed to save workout log",
        details: message,
      },
      { status: 500 }
    );
  }
}

// ===== GET (hämta loggar) =====

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);

    const userId = searchParams.get("userId");
    const limitParam = searchParams.get("limit");

    if (!userId) {
      return NextResponse.json(
        { ok: false, error: "Missing userId" },
        { status: 400 }
      );
    }

    const limit = limitParam ? Number(limitParam) : 20;

    if (!Number.isFinite(limit) || limit <= 0) {
      return NextResponse.json(
        { ok: false, error: "Invalid limit" },
        { status: 400 }
      );
    }

    console.log("GET /api/workout-logs", { userId, limit });

    const logs = await getWorkoutLogsByUser(userId, limit);

    console.log("GET /api/workout-logs result count:", logs.length);

    return NextResponse.json({
      ok: true,
      logs,
    });
  } catch (error) {
    console.error("GET /api/workout-logs error:", error);

    const message =
      error instanceof Error ? error.message : "Unknown fetch error";

    return NextResponse.json(
      {
        ok: false,
        error: "Failed to fetch workout logs",
        details: message,
      },
      { status: 500 }
    );
  }
}

// ===== DELETE (radera all träningsdata för användaren) =====

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");

    if (!userId) {
      return NextResponse.json(
        { ok: false, error: "Missing userId" },
        { status: 400 }
      );
    }

    const result = await deleteAllWorkoutLogsByUser(userId);

    return NextResponse.json({
      ok: true,
      deletedCount: result.deletedCount,
    });
  } catch (error) {
    console.error("DELETE /api/workout-logs error:", error);

    const message =
      error instanceof Error ? error.message : "Unknown delete error";

    return NextResponse.json(
      {
        ok: false,
        error: "Failed to delete workout logs",
        details: message,
      },
      { status: 500 }
    );
  }
}