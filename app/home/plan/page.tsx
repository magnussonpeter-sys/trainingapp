"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import PageNavActions from "@/components/shared/page-nav-actions";
import { useHomeData } from "@/hooks/use-home-data";
import { generateWorkout } from "@/lib/workout-generator";
import { extractEquipmentIdsFromRecords } from "@/lib/equipment";
import {
  buildInitialWeeklyPlan,
  buildWeeklyPlanContext,
  deriveWeeklyPlanState,
  formatPlannedSessionFocus,
  formatWeekdayLabel,
  getDefaultWeeklyPlanSettings,
  getWeekStartDate,
  mapPlannedFocusToWorkoutFocus,
  type PlannedSession,
  type Weekday,
  type WeeklyPlanFlexibility,
  type WeeklyPlanSettings,
  type WeeklyPlanState,
} from "@/lib/planning/weekly-plan";
import {
  getLocalWeeklyPlanSettings,
  saveLocalWeeklyPlanSettings,
} from "@/lib/planning/weekly-plan-local-store";
import { saveWorkoutDraft } from "@/lib/workout-flow/workout-draft-store";
import { uiButtonClasses } from "@/lib/ui/button-classes";
import { uiCardClasses } from "@/lib/ui/card-classes";
import { uiPageShellClasses } from "@/lib/ui/page-shell-classes";
import { getExercisePreferences } from "@/lib/exercise-preference-storage";

const MUSCLE_OPTIONS = [
  { value: "chest", label: "Bröst" },
  { value: "back", label: "Rygg" },
  { value: "quads", label: "Framsida lår" },
  { value: "hamstrings", label: "Baksida lår" },
  { value: "glutes", label: "Säte" },
  { value: "shoulders", label: "Axlar" },
  { value: "biceps", label: "Biceps" },
  { value: "triceps", label: "Triceps" },
  { value: "calves", label: "Vader" },
  { value: "core", label: "Bål" },
] as const;

const WEEKDAY_OPTIONS: Array<{ value: Weekday; label: string }> = [
  { value: "monday", label: "Mån" },
  { value: "tuesday", label: "Tis" },
  { value: "wednesday", label: "Ons" },
  { value: "thursday", label: "Tor" },
  { value: "friday", label: "Fre" },
  { value: "saturday", label: "Lör" },
  { value: "sunday", label: "Sön" },
];

type WeeklyPlanApiResponse = {
  ok?: boolean;
  error?: string;
  settings?: WeeklyPlanSettings;
  plannedSessions?: PlannedSession[];
  state?: WeeklyPlanState;
};

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function normalizeEquipmentStrings(input: unknown[]) {
  return extractEquipmentIdsFromRecords(input as Array<Record<string, unknown>>, {
    includeBodyweightFallback: true,
  });
}

function clampDuration(value: number, min: number, max: number) {
  return Math.min(Math.max(Math.round(value), min), max);
}

function formatMuscleLabel(value: string) {
  return (
    MUSCLE_OPTIONS.find((option) => option.value === value)?.label ?? value
  );
}

function getStatusLabel(status: PlannedSession["status"]) {
  if (status === "completed") return "Genomfört";
  if (status === "missed") return "Missat";
  if (status === "moved") return "Flyttat";
  if (status === "replaced_by_spontaneous") return "Ersatt av spontant pass";
  return "Planerat";
}

function buildFeedbackLines(state: WeeklyPlanState) {
  const lines = [
    `Du har genomfört ${state.completedWorkoutLogIds.length} av ${state.settings.sessionsPerWeek} planerade pass.`,
  ];

  if (state.spontaneousWorkoutLogIds.length > 0) {
    lines.push("Ett spontant pass den här veckan räknas också in i veckans träning.");
  }

  if (state.remainingTrainingNeed.sessionsRemaining > 0) {
    lines.push(
      `För att hålla planen räcker det med ${state.remainingTrainingNeed.sessionsRemaining} pass på cirka ${state.remainingTrainingNeed.suggestedNextDurationMinutes} minuter.`,
    );
  }

  const nextFocusDeficits = Object.entries(state.remainingTrainingNeed.muscleSetDeficits)
    .filter(([, value]) => value > 0)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 2)
    .map(([muscle]) => formatMuscleLabel(muscle));

  if (nextFocusDeficits.length > 0) {
    lines.push(`${nextFocusDeficits.join(" och ")} bör prioriteras i nästa pass.`);
  }

  return lines;
}

export default function WeeklyPlanPage() {
  const router = useRouter();
  const {
    authChecked,
    authUser,
    gyms,
    settings,
    workoutLogs,
    gymError,
    pageError,
  } = useHomeData({ router });
  const userId = authUser?.id ? String(authUser.id) : "";
  const [planSettings, setPlanSettings] = useState<WeeklyPlanSettings | null>(null);
  const [plannedSessions, setPlannedSessions] = useState<PlannedSession[]>([]);
  const [isLoadingPlan, setIsLoadingPlan] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isGenerating, setIsGenerating] = useState<string | null>(null);
  const [dateDrafts, setDateDrafts] = useState<Record<string, string>>({});

  const gymOptions = useMemo(() => {
    return [
      { id: "bodyweight", name: "Kroppsvikt / utan gym", equipment: [] as unknown[] },
      ...gyms.map((gym) => ({
        id: String(gym.id),
        name: gym.name,
        equipment: gym.equipment ?? [],
      })),
    ];
  }, [gyms]);

  useEffect(() => {
    if (!userId) {
      return;
    }

    let isMounted = true;

    async function loadWeeklyPlan() {
      setIsLoadingPlan(true);
      setPlanError(null);

      try {
        const response = await fetch(`/api/weekly-plan?userId=${encodeURIComponent(userId)}`, {
          cache: "no-store",
          credentials: "include",
        });
        const payload = (await response.json().catch(() => null)) as WeeklyPlanApiResponse | null;

        if (!response.ok || !payload?.ok) {
          throw new Error(payload?.error || "Kunde inte läsa veckoplanen");
        }

        if (!isMounted) {
          return;
        }

        const nextSettings = payload.settings ?? getDefaultWeeklyPlanSettings(userId);
        setPlanSettings(nextSettings);
        saveLocalWeeklyPlanSettings(nextSettings);
        setPlannedSessions(payload.plannedSessions ?? buildInitialWeeklyPlan(nextSettings, getWeekStartDate(new Date())));
      } catch (error) {
        if (!isMounted) {
          return;
        }

        const localSettings = getLocalWeeklyPlanSettings(userId) ?? getDefaultWeeklyPlanSettings(userId);
        setPlanSettings(localSettings);
        setPlannedSessions(buildInitialWeeklyPlan(localSettings, getWeekStartDate(new Date())));
        setPlanError(
          error instanceof Error
            ? `${error.message}. Visar lokal fallback så länge.`
            : "Kunde inte läsa veckoplanen. Visar lokal fallback så länge.",
        );
      } finally {
        if (isMounted) {
          setIsLoadingPlan(false);
        }
      }
    }

    void loadWeeklyPlan();

    return () => {
      isMounted = false;
    };
  }, [userId]);

  const derivedPlanState = useMemo(() => {
    if (!userId || !planSettings) {
      return null;
    }

    return deriveWeeklyPlanState({
      settings: planSettings,
      plannedSessions,
      workoutLogs,
      now: new Date(),
    });
  }, [planSettings, plannedSessions, userId, workoutLogs]);

  const feedbackLines = useMemo(
    () => (derivedPlanState ? buildFeedbackLines(derivedPlanState) : []),
    [derivedPlanState],
  );

  function togglePreferredDay(day: Weekday) {
    if (!planSettings) {
      return;
    }

    const nextDays = planSettings.preferredDays.includes(day)
      ? planSettings.preferredDays.filter((value) => value !== day)
      : [...planSettings.preferredDays, day];

    setPlanSettings({
      ...planSettings,
      preferredDays: nextDays.length > 0 ? nextDays : [day],
    });
  }

  function toggleMuscleList(
    field: "priorityMuscles" | "easyMuscles",
    muscle: WeeklyPlanSettings["priorityMuscles"][number],
  ) {
    if (!planSettings) {
      return;
    }

    const currentValues = planSettings[field];
    const nextValues = currentValues.includes(muscle)
      ? currentValues.filter((value) => value !== muscle)
      : [...currentValues, muscle].slice(0, 5);

    setPlanSettings({
      ...planSettings,
      [field]:
        field === "priorityMuscles"
          ? nextValues.filter((value) => !planSettings.easyMuscles.includes(value))
          : nextValues.filter((value) => !planSettings.priorityMuscles.includes(value)),
    });
  }

  async function handleSaveSettings() {
    if (!planSettings || !userId) {
      return;
    }

    try {
      setIsSaving(true);
      setPlanError(null);
      setSaveMessage(null);

      const response = await fetch("/api/weekly-plan/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(planSettings),
      });
      const payload = (await response.json().catch(() => null)) as WeeklyPlanApiResponse | null;

      if (!response.ok || !payload?.ok || !payload.settings) {
        throw new Error(payload?.error || "Kunde inte spara veckoplanen");
      }

      setPlanSettings(payload.settings);
      setPlannedSessions(payload.plannedSessions ?? []);
      saveLocalWeeklyPlanSettings(payload.settings);
      setSaveMessage("Veckoplanen sparades.");
    } catch (error) {
      saveLocalWeeklyPlanSettings(planSettings);
      setPlannedSessions(buildInitialWeeklyPlan(planSettings, getWeekStartDate(new Date())));
      setPlanError(
        error instanceof Error
          ? `${error.message}. Ändringarna sparades lokalt så länge.`
          : "Kunde inte spara veckoplanen. Ändringarna sparades lokalt så länge.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handlePostponeSession(session: PlannedSession, newDate: string) {
    if (!userId || !newDate) {
      return;
    }

    try {
      setPlanError(null);
      const response = await fetch("/api/weekly-plan/postpone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          userId,
          sessionId: session.id,
          newDate,
        }),
      });
      const payload = (await response.json().catch(() => null)) as WeeklyPlanApiResponse | null;

      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || "Kunde inte flytta passet");
      }

      setPlannedSessions(payload.plannedSessions ?? []);
      setSaveMessage("Passet flyttades.");
    } catch (error) {
      setPlanError(error instanceof Error ? error.message : "Kunde inte flytta passet.");
    }
  }

  async function handleCreatePlannedWorkout(session: PlannedSession) {
    if (!userId || !derivedPlanState) {
      return;
    }

    const selectedGym =
      gymOptions.find((gym) => gym.id === (session.preferredGymId ?? planSettings?.preferredGymId ?? "bodyweight")) ??
      gymOptions[0];
    const equipment = normalizeEquipmentStrings(selectedGym.equipment);
    const weeklyPlanContext = buildWeeklyPlanContext(derivedPlanState);
    const goal = settings?.training_goal?.trim() || "health";

    try {
      setPlanError(null);
      setIsGenerating(session.id);

      const lessOftenExerciseIds = getExercisePreferences(userId)
        .filter((entry) => entry.preference === "less_often")
        .map((entry) => entry.exerciseId);
      const gymId = selectedGym.id === "bodyweight" ? null : String(selectedGym.id);
      const gymLabel =
        selectedGym.id === "bodyweight" ? "Kroppsvikt / utan gym" : selectedGym.name;
      const { workout } = await generateWorkout({
        userId,
        goal,
        durationMinutes: session.targetDurationMinutes,
        equipment,
        gym: gymId,
        gymLabel,
        gymEquipmentDetails: selectedGym.equipment as Array<Record<string, unknown>>,
        nextFocus: mapPlannedFocusToWorkoutFocus(session.focus),
        weeklyPlanContext,
        focusMuscles: session.priorityMuscles,
        lessOftenExerciseIds,
      });

      saveWorkoutDraft(userId, {
        ...workout,
        duration: session.targetDurationMinutes,
        gym: gymId,
        gymLabel,
        availableEquipment: equipment,
        plannedFocus: mapPlannedFocusToWorkoutFocus(session.focus),
      });

      router.push(`/workout/preview?userId=${encodeURIComponent(userId)}`);
    } catch (error) {
      setPlanError(
        error instanceof Error ? error.message : "Kunde inte skapa passet just nu.",
      );
    } finally {
      setIsGenerating(null);
    }
  }

  if (!authChecked || !planSettings || !derivedPlanState) {
    return (
      <main className={cn(uiPageShellClasses.page, "pb-16")}>
        <div className={uiPageShellClasses.content}>
          <section className={cn(uiCardClasses.base, "p-6")}>
            <p className="text-base text-slate-700">
              {isLoadingPlan ? "Laddar veckoplan..." : "Förbereder veckoplanen..."}
            </p>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className={cn(uiPageShellClasses.page, "pb-16")}>
      <div className={uiPageShellClasses.content}>
        <section className={cn(uiCardClasses.base, "p-6")}>
          <PageNavActions backAction={{ label: "Till hem", href: "/home" }} compact />
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-emerald-700">
            Veckoplan
          </p>
          <h1 className="mt-2 text-[clamp(2rem,7vw,2.6rem)] font-semibold tracking-tight text-slate-950">
            Veckoplan
          </h1>
          <p className="mt-3 text-base leading-7 text-slate-700">
            Den här planen hjälper AI:n att föreslå rätt pass under veckan.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => router.push("/home")}
              className={uiButtonClasses.secondary}
            >
              Till hem
            </button>
            <button
              type="button"
              onClick={handleSaveSettings}
              disabled={isSaving}
              className={uiButtonClasses.primary}
            >
              {isSaving ? "Sparar..." : "Spara veckoplan"}
            </button>
          </div>
          {saveMessage ? <p className="mt-4 text-sm text-emerald-700">{saveMessage}</p> : null}
          {planError ? <div className={cn(uiCardClasses.danger, "mt-4")}>{planError}</div> : null}
          {gymError ? <div className={cn(uiCardClasses.danger, "mt-4")}>{gymError}</div> : null}
          {pageError ? <div className={cn(uiCardClasses.danger, "mt-4")}>{pageError}</div> : null}
        </section>

        <section className={cn(uiCardClasses.base, "p-6")}>
          <h2 className="text-xl font-semibold tracking-tight text-slate-950">Dina ramar</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">
                Antal pass per vecka
              </span>
              <select
                value={planSettings.sessionsPerWeek}
                onChange={(event) =>
                  setPlanSettings({
                    ...planSettings,
                    sessionsPerWeek: Number(event.target.value),
                  })
                }
                className="min-h-[52px] w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-base text-slate-900 outline-none transition focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100"
              >
                {[1, 2, 3, 4, 5, 6].map((count) => (
                  <option key={count} value={count}>
                    {count} pass
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">Favoritgym</span>
              <select
                value={planSettings.preferredGymId ?? "bodyweight"}
                onChange={(event) =>
                  setPlanSettings({
                    ...planSettings,
                    preferredGymId:
                      event.target.value === "bodyweight" ? null : event.target.value,
                  })
                }
                className="min-h-[52px] w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-base text-slate-900 outline-none transition focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100"
              >
                {gymOptions.map((gym) => (
                  <option key={gym.id} value={gym.id}>
                    {gym.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="mt-5">
            <p className="text-sm font-medium text-slate-700">Föredragna dagar</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {WEEKDAY_OPTIONS.map((day) => {
                const isSelected = planSettings.preferredDays.includes(day.value);
                return (
                  <button
                    key={day.value}
                    type="button"
                    onClick={() => togglePreferredDay(day.value)}
                    className={cn(
                      "min-h-[44px] rounded-full border px-4 py-2 text-sm font-medium transition",
                      isSelected
                        ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                        : "border-slate-200 bg-white text-slate-700",
                    )}
                  >
                    {day.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">Vanlig längd</span>
              <input
                type="number"
                min={10}
                max={180}
                value={planSettings.defaultDurationMinutes}
                onChange={(event) =>
                  setPlanSettings({
                    ...planSettings,
                    defaultDurationMinutes: clampDuration(
                      Number(event.target.value),
                      10,
                      180,
                    ),
                  })
                }
                className="min-h-[52px] w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-base text-slate-900 outline-none transition focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">Kortaste pass</span>
              <input
                type="number"
                min={5}
                max={120}
                value={planSettings.minDurationMinutes}
                onChange={(event) =>
                  setPlanSettings({
                    ...planSettings,
                    minDurationMinutes: clampDuration(Number(event.target.value), 5, 120),
                  })
                }
                className="min-h-[52px] w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-base text-slate-900 outline-none transition focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">Längsta pass</span>
              <input
                type="number"
                min={10}
                max={180}
                value={planSettings.maxDurationMinutes}
                onChange={(event) =>
                  setPlanSettings({
                    ...planSettings,
                    maxDurationMinutes: clampDuration(Number(event.target.value), 10, 180),
                  })
                }
                className="min-h-[52px] w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-base text-slate-900 outline-none transition focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100"
              />
            </label>
          </div>

          <div className="mt-6">
            <p className="text-sm font-medium text-slate-700">Flexibilitet</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              {[
                {
                  value: "strict",
                  title: "Strikt",
                  description: "Håll planen nära valda dagar.",
                },
                {
                  value: "balanced",
                  title: "Balanserad",
                  description: "Flytta pass inom någon dag vid behov.",
                },
                {
                  value: "flexible",
                  title: "Flexibel",
                  description: "Anpassa veckan efter det du faktiskt hinner.",
                },
              ].map((option) => {
                const isSelected = planSettings.flexibility === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() =>
                      setPlanSettings({
                        ...planSettings,
                        flexibility: option.value as WeeklyPlanFlexibility,
                      })
                    }
                    className={cn(
                      "rounded-2xl border px-4 py-4 text-left transition",
                      isSelected
                        ? "border-emerald-300 bg-emerald-50"
                        : "border-slate-200 bg-white",
                    )}
                  >
                    <p className="text-base font-semibold text-slate-950">{option.title}</p>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{option.description}</p>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-6">
            <p className="text-sm font-medium text-slate-700">Prioriterade muskler</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {MUSCLE_OPTIONS.map((option) => {
                const isSelected = planSettings.priorityMuscles.includes(option.value);
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => toggleMuscleList("priorityMuscles", option.value)}
                    className={cn(
                      "min-h-[44px] rounded-full border px-4 py-2 text-sm font-medium transition",
                      isSelected
                        ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                        : "border-slate-200 bg-white text-slate-700",
                    )}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-6">
            <p className="text-sm font-medium text-slate-700">Muskler att ta det lugnt med</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {MUSCLE_OPTIONS.map((option) => {
                const isSelected = planSettings.easyMuscles.includes(option.value);
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => toggleMuscleList("easyMuscles", option.value)}
                    className={cn(
                      "min-h-[44px] rounded-full border px-4 py-2 text-sm font-medium transition",
                      isSelected
                        ? "border-amber-300 bg-amber-50 text-amber-900"
                        : "border-slate-200 bg-white text-slate-700",
                    )}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        <section className={cn(uiCardClasses.base, "p-6")}>
          <h2 className="text-xl font-semibold tracking-tight text-slate-950">Aktuell vecka</h2>
          <div className="mt-4 space-y-3">
            {derivedPlanState.plannedSessions.map((session) => {
              const postponeDate = dateDrafts[session.id] ?? session.plannedDate;
              return (
                <article
                  key={session.id}
                  className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-slate-500">
                        {formatWeekdayLabel(session.weekday)}
                      </p>
                      <h3 className="mt-1 text-lg font-semibold text-slate-950">
                        {session.targetDurationMinutes} min – {formatPlannedSessionFocus(session.focus)}
                      </h3>
                      <p className="mt-2 text-sm text-slate-700">
                        Status: {getStatusLabel(session.status)}
                      </p>
                      {session.priorityMuscles.length > 0 ? (
                        <p className="mt-1 text-sm text-slate-600">
                          Fokus: {session.priorityMuscles.map((muscle) => formatMuscleLabel(muscle)).join(" · ")}
                        </p>
                      ) : null}
                    </div>

                    <button
                      type="button"
                      onClick={() => void handleCreatePlannedWorkout(session)}
                      disabled={isGenerating === session.id}
                      className={uiButtonClasses.primary}
                    >
                      {isGenerating === session.id ? "Skapar..." : "Skapa pass"}
                    </button>
                  </div>

                  <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
                    <label className="block flex-1">
                      <span className="mb-2 block text-sm font-medium text-slate-700">
                        Flytta till
                      </span>
                      <input
                        type="date"
                        value={postponeDate}
                        onChange={(event) =>
                          setDateDrafts((previous) => ({
                            ...previous,
                            [session.id]: event.target.value,
                          }))
                        }
                        className="min-h-[48px] w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 outline-none transition focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => void handlePostponeSession(session, postponeDate)}
                      className={uiButtonClasses.secondary}
                    >
                      Flytta
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const nextDate = new Date(`${session.plannedDate}T12:00:00`);
                        nextDate.setDate(nextDate.getDate() + 1);
                        void handlePostponeSession(
                          session,
                          `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, "0")}-${String(nextDate.getDate()).padStart(2, "0")}`,
                        );
                      }}
                      className={uiButtonClasses.secondary}
                    >
                      Skjut upp en dag
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <section className={cn(uiCardClasses.base, "p-6")}>
          <h2 className="text-xl font-semibold tracking-tight text-slate-950">Veckans läge</h2>
          <div className="mt-4 space-y-3">
            {feedbackLines.map((line) => (
              <p key={line} className="text-base leading-7 text-slate-700">
                {line}
              </p>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
