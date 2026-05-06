import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthorizedUserId } from "@/lib/server-auth";
import {
  getDefaultWeeklyPlanSettings,
  type Weekday,
  type WeeklyPlanFlexibility,
  type WeeklyPlanSettings,
} from "@/lib/planning/weekly-plan";
import { saveWeeklyPlanSettingsAndRebuildCurrentWeek } from "@/lib/planning/weekly-plan-repository";

const weekdaySchema = z.union([
  z.literal("monday"),
  z.literal("tuesday"),
  z.literal("wednesday"),
  z.literal("thursday"),
  z.literal("friday"),
  z.literal("saturday"),
  z.literal("sunday"),
]);

const muscleSchema = z.union([
  z.literal("chest"),
  z.literal("back"),
  z.literal("quads"),
  z.literal("hamstrings"),
  z.literal("glutes"),
  z.literal("shoulders"),
  z.literal("biceps"),
  z.literal("triceps"),
  z.literal("calves"),
  z.literal("core"),
]);

const flexibilitySchema = z.union([
  z.literal("strict"),
  z.literal("balanced"),
  z.literal("flexible"),
]);

const weeklyPlanSettingsSchema = z.object({
  userId: z.string().min(1),
  sessionsPerWeek: z.number().int().min(1).max(6),
  preferredDays: z.array(weekdaySchema).min(1).max(7),
  defaultDurationMinutes: z.number().int().min(10).max(180),
  minDurationMinutes: z.number().int().min(5).max(180),
  maxDurationMinutes: z.number().int().min(10).max(240),
  preferredGymId: z.string().nullable().optional(),
  flexibility: flexibilitySchema,
  priorityMuscles: z.array(muscleSchema).max(5),
  easyMuscles: z.array(muscleSchema).max(5),
});

function buildNormalizedSettings(
  input: z.infer<typeof weeklyPlanSettingsSchema>,
): WeeklyPlanSettings {
  const defaultSettings = getDefaultWeeklyPlanSettings(input.userId);
  const minDurationMinutes = Math.min(input.minDurationMinutes, input.defaultDurationMinutes);
  const maxDurationMinutes = Math.max(input.maxDurationMinutes, input.defaultDurationMinutes);
  const priorityMuscles = Array.from(new Set(input.priorityMuscles));
  const easyMuscles = Array.from(
    new Set(input.easyMuscles.filter((group) => !priorityMuscles.includes(group))),
  );

  return {
    ...defaultSettings,
    userId: input.userId,
    sessionsPerWeek: input.sessionsPerWeek,
    preferredDays: Array.from(new Set(input.preferredDays)) as Weekday[],
    defaultDurationMinutes: input.defaultDurationMinutes,
    minDurationMinutes,
    maxDurationMinutes,
    preferredGymId: input.preferredGymId ?? null,
    flexibility: input.flexibility as WeeklyPlanFlexibility,
    priorityMuscles,
    easyMuscles,
    updatedAt: new Date().toISOString(),
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = weeklyPlanSettingsSchema.parse(body);
    const user = await requireAuthorizedUserId(parsed.userId);
    const normalizedSettings = buildNormalizedSettings({
      ...parsed,
      userId: user.id,
    });
    const result = await saveWeeklyPlanSettingsAndRebuildCurrentWeek(normalizedSettings);

    return NextResponse.json({
      ok: true,
      settings: result.settings,
      plannedSessions: result.plannedSessions,
      state: result.state,
      status: result.status,
      context: result.context,
    });
  } catch (error) {
    console.error("POST /api/weekly-plan/settings error:", error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { ok: false, error: "Ogiltiga veckoplansinställningar", issues: error.issues },
        { status: 400 },
      );
    }

    if (error instanceof Error) {
      if (error.message === "Unauthorized") {
        return NextResponse.json({ ok: false, error: "Ej inloggad" }, { status: 401 });
      }

      if (error.message === "Account disabled") {
        return NextResponse.json(
          { ok: false, error: "Kontot är inaktiverat" },
          { status: 403 },
        );
      }

      if (error.message === "Forbidden") {
        return NextResponse.json({ ok: false, error: "Ingen behörighet" }, { status: 403 });
      }
    }

    return NextResponse.json(
      { ok: false, error: "Kunde inte spara veckoplansinställningarna" },
      { status: 500 },
    );
  }
}
