"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import PageNavActions from "@/components/shared/page-nav-actions";
import { useHomeData } from "@/hooks/use-home-data";
import { extractEquipmentIdsFromRecords } from "@/lib/equipment";
import { getExercisePreferences } from "@/lib/exercise-preference-storage";
import {
  buildInitialWeeklyPlan,
  buildWeeklyPlanContext,
  buildWeeklyPlanRecommendation,
  buildWeeklyPlanStatus,
  deriveWeeklyPlanState,
  formatPlannedSessionFocus,
  formatWeekdayLabel,
  getDefaultWeeklyPlanSettings,
  getWeekStartDate,
  mapPlannedFocusToWorkoutFocus,
  type PlannedSession,
  type Weekday,
  type WeeklyPlanFlexibility,
  type WeeklyPlanContext,
  type WeeklyPlanSettings,
  type WeeklyPlanStatus,
  type WeeklyPlanState,
} from "@/lib/planning/weekly-plan";
import {
  getLocalWeeklyPlanSettings,
  saveLocalWeeklyPlanSettings,
} from "@/lib/planning/weekly-plan-local-store";
import type { MuscleBudgetGroup } from "@/lib/planning/muscle-budget";
import { uiButtonClasses } from "@/lib/ui/button-classes";
import { uiCardClasses } from "@/lib/ui/card-classes";
import { uiPageShellClasses } from "@/lib/ui/page-shell-classes";
import { saveWorkoutDraft } from "@/lib/workout-flow/workout-draft-store";
import { saveGeneratedWorkout } from "@/lib/workout-storage";
import { generateWorkout } from "@/lib/workout-generator";

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
  status?: WeeklyPlanStatus;
  context?: WeeklyPlanContext;
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

function getStatusLabel(status: PlannedSession["status"]) {
  if (status === "completed") return "Genomfört";
  if (status === "missed") return "Missat";
  if (status === "moved") return "Flyttat";
  if (status === "replaced_by_spontaneous") return "Ersatt av spontant pass";
  return "Planerat";
}

function formatDurationRange(min: number, max: number) {
  return min === max ? `${min} min` : `${min}–${max} min`;
}

function formatSuggestedRange(
  suggestedMinutes: number,
  settings: WeeklyPlanSettings,
) {
  const lower = Math.max(settings.minDurationMinutes, suggestedMinutes - 5);
  const upper = Math.min(settings.maxDurationMinutes, suggestedMinutes + 5);
  return formatDurationRange(lower, upper);
}

function formatFocusLabel(
  focus: ReturnType<typeof buildWeeklyPlanStatus>["suggestedNextWorkoutFocus"],
) {
  if (focus === "upper_body") return "Överkropp";
  if (focus === "lower_body") return "Ben";
  if (focus === "core") return "Bål";
  if (focus === "recovery_strength") return "Återhämtande styrka";
  return "Helkropp";
}

function stripLegacyPlanMuscles(settings: WeeklyPlanSettings): WeeklyPlanSettings {
  return {
    ...settings,
    // Veckoplanen styr nu bara ramar. Äldre muskelval ignoreras här.
    priorityMuscles: [],
    easyMuscles: [],
  };
}

function createDurationDrafts(settings: WeeklyPlanSettings) {
  return {
    defaultDurationMinutes: String(settings.defaultDurationMinutes),
    minDurationMinutes: String(settings.minDurationMinutes),
    maxDurationMinutes: String(settings.maxDurationMinutes),
  };
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
  const [serverPlanState, setServerPlanState] = useState<WeeklyPlanState | null>(null);
  const [serverPlanStatus, setServerPlanStatus] = useState<WeeklyPlanStatus | null>(null);
  const [serverPlanContext, setServerPlanContext] = useState<WeeklyPlanContext | null>(null);
  const [isLoadingPlan, setIsLoadingPlan] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [durationDrafts, setDurationDrafts] = useState({
    defaultDurationMinutes: "",
    minDurationMinutes: "",
    maxDurationMinutes: "",
  });

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

        const nextSettings = stripLegacyPlanMuscles(
          payload.settings ?? getDefaultWeeklyPlanSettings(userId),
        );
        setPlanSettings(nextSettings);
        setDurationDrafts(createDurationDrafts(nextSettings));
        saveLocalWeeklyPlanSettings(nextSettings);
        setPlannedSessions(
          payload.plannedSessions ??
            buildInitialWeeklyPlan(nextSettings, getWeekStartDate(new Date())),
        );
        setServerPlanState(payload.state ?? null);
        setServerPlanStatus(payload.status ?? null);
        setServerPlanContext(payload.context ?? null);
      } catch (error) {
        if (!isMounted) {
          return;
        }

        const localSettings = stripLegacyPlanMuscles(
          getLocalWeeklyPlanSettings(userId) ?? getDefaultWeeklyPlanSettings(userId),
        );
        setPlanSettings(localSettings);
        setDurationDrafts(createDurationDrafts(localSettings));
        setPlannedSessions(
          buildInitialWeeklyPlan(localSettings, getWeekStartDate(new Date())),
        );
        setServerPlanState(null);
        setServerPlanStatus(null);
        setServerPlanContext(null);
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

  const fallbackPlanState = useMemo(() => {
    if (!userId || !planSettings) {
      return null;
    }

    return deriveWeeklyPlanState({
      settings: planSettings,
      plannedSessions,
      workoutLogs,
      now: new Date(),
      goal: settings?.training_goal ?? null,
      priorityMuscles: [
        settings?.primary_priority_muscle ?? null,
        settings?.secondary_priority_muscle ?? null,
        settings?.tertiary_priority_muscle ?? null,
      ].filter((group): group is MuscleBudgetGroup => Boolean(group)),
    });
  }, [
    planSettings,
    plannedSessions,
    settings?.primary_priority_muscle,
    settings?.secondary_priority_muscle,
    settings?.tertiary_priority_muscle,
    settings?.training_goal,
    userId,
    workoutLogs,
  ]);
  // Serverberäknad veckoplanstatus är primär för att /home och /home/plan ska visa samma rekommendation.
  const derivedPlanState = serverPlanState ?? fallbackPlanState;

  const weeklyPlanRecommendation = useMemo(() => {
    return buildWeeklyPlanRecommendation(settings?.training_goal ?? null);
  }, [settings?.training_goal]);

  const weeklyPlanStatus = useMemo(() => {
    return serverPlanStatus ?? (derivedPlanState ? buildWeeklyPlanStatus(derivedPlanState) : null);
  }, [derivedPlanState, serverPlanStatus]);
  const weeklyPlanContext = useMemo(() => {
    return serverPlanContext ?? (derivedPlanState ? buildWeeklyPlanContext(derivedPlanState) : null);
  }, [derivedPlanState, serverPlanContext]);

  const nextPlannedSessions = useMemo(() => {
    if (!derivedPlanState) {
      return [];
    }

    return derivedPlanState.plannedSessions
      .filter((session) => session.status === "planned" || session.status === "moved")
      .slice(0, 2);
  }, [derivedPlanState]);

  function updateDurationDraft(
    field: "defaultDurationMinutes" | "minDurationMinutes" | "maxDurationMinutes",
    value: string,
  ) {
    if (!/^\d*$/.test(value)) {
      return;
    }

    setDurationDrafts((previous) => ({
      ...previous,
      [field]: value,
    }));
  }

  function commitDurationDraft(
    field: "defaultDurationMinutes" | "minDurationMinutes" | "maxDurationMinutes",
  ) {
    if (!planSettings) {
      return null;
    }

    const draftValue = durationDrafts[field];
    const fallbackValue = planSettings[field];
    const parsedValue =
      draftValue.trim().length > 0 ? Number(draftValue) : fallbackValue;

    const nextValue =
      field === "defaultDurationMinutes"
        ? clampDuration(parsedValue, 10, 180)
        : field === "minDurationMinutes"
          ? clampDuration(parsedValue, 5, 120)
          : clampDuration(parsedValue, 10, 180);

    const nextSettings = {
      ...planSettings,
      [field]: nextValue,
    };

    setPlanSettings(nextSettings);
    setDurationDrafts(createDurationDrafts(nextSettings));
    return nextSettings;
  }

  async function handleSaveSettings() {
    if (!planSettings || !userId) {
      return;
    }

    const committedDefaultSettings =
      commitDurationDraft("defaultDurationMinutes") ?? planSettings;
    const committedMinSettings =
      commitDurationDraft("minDurationMinutes") ?? committedDefaultSettings;
    const committedMaxSettings =
      commitDurationDraft("maxDurationMinutes") ?? committedMinSettings;
    const normalizedSettings = stripLegacyPlanMuscles(committedMaxSettings);

    try {
      setIsSaving(true);
      setPlanError(null);
      setSaveMessage(null);

      const response = await fetch("/api/weekly-plan/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(normalizedSettings),
      });
      const payload = (await response.json().catch(() => null)) as WeeklyPlanApiResponse | null;

      if (!response.ok || !payload?.ok || !payload.settings) {
        throw new Error(payload?.error || "Kunde inte spara veckoplanen");
      }

      const nextSettings = stripLegacyPlanMuscles(payload.settings);
      setPlanSettings(nextSettings);
      setDurationDrafts(createDurationDrafts(nextSettings));
      setPlannedSessions(payload.plannedSessions ?? []);
      setServerPlanState(payload.state ?? null);
      setServerPlanStatus(payload.status ?? null);
      setServerPlanContext(payload.context ?? null);
      saveLocalWeeklyPlanSettings(nextSettings);
      setSaveMessage("Veckoplanen sparades.");
    } catch (error) {
      saveLocalWeeklyPlanSettings(normalizedSettings);
      setPlanSettings(normalizedSettings);
      setDurationDrafts(createDurationDrafts(normalizedSettings));
      setPlannedSessions(
        buildInitialWeeklyPlan(normalizedSettings, getWeekStartDate(new Date())),
      );
      setServerPlanState(null);
      setServerPlanStatus(null);
      setServerPlanContext(null);
      setPlanError(
        error instanceof Error
          ? `${error.message}. Ändringarna sparades lokalt så länge.`
          : "Kunde inte spara veckoplanen. Ändringarna sparades lokalt så länge.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleCreateRecommendedWorkout() {
    if (!userId || !derivedPlanState || !weeklyPlanStatus || !planSettings) {
      return;
    }

    const selectedGym =
      gymOptions.find((gym) => gym.id === (planSettings.preferredGymId ?? "bodyweight")) ??
      gymOptions[0];
    const equipment = normalizeEquipmentStrings(selectedGym.equipment);
    const effectiveWeeklyPlanContext =
      weeklyPlanContext ?? buildWeeklyPlanContext(derivedPlanState);
    const goal = settings?.training_goal?.trim() || "health";
    const recommendedFocus =
      weeklyPlanStatus.suggestedNextWorkoutFocus === "recovery_strength"
        ? mapPlannedFocusToWorkoutFocus(
            derivedPlanState.remainingTrainingNeed.suggestedNextFocus,
          )
        : weeklyPlanStatus.suggestedNextWorkoutFocus;

    try {
      setPlanError(null);
      setIsGenerating(true);

      const lessOftenExerciseIds = getExercisePreferences(userId)
        .filter((entry) => entry.preference === "less_often")
        .map((entry) => entry.exerciseId);
      const gymId = selectedGym.id === "bodyweight" ? null : String(selectedGym.id);
      const gymLabel =
        selectedGym.id === "bodyweight" ? "Kroppsvikt / utan gym" : selectedGym.name;
      const { workout } = await generateWorkout({
        userId,
        goal,
        durationMinutes: weeklyPlanStatus.suggestedNextDurationMinutes,
        equipment,
        gym: gymId,
        gymLabel,
        gymEquipmentDetails: selectedGym.equipment as Array<Record<string, unknown>>,
        nextFocus: recommendedFocus,
        weeklyPlanContext: effectiveWeeklyPlanContext,
        focusMuscles: effectiveWeeklyPlanContext.priorityMuscles,
        lessOftenExerciseIds,
      });

      saveWorkoutDraft(userId, {
        ...workout,
        duration: weeklyPlanStatus.suggestedNextDurationMinutes,
        gym: gymId,
        gymLabel,
        availableEquipment: equipment,
        plannedFocus: recommendedFocus,
      });
      saveGeneratedWorkout(userId, {
        ...workout,
        duration: weeklyPlanStatus.suggestedNextDurationMinutes,
        gym: gymId,
        gymLabel,
        availableEquipment: equipment,
        plannedFocus: recommendedFocus,
      });

      router.push(`/workout/preview?userId=${encodeURIComponent(userId)}`);
    } catch (error) {
      setPlanError(
        error instanceof Error ? error.message : "Kunde inte skapa passet just nu.",
      );
    } finally {
      setIsGenerating(false);
    }
  }

  if (!authChecked || !planSettings || !derivedPlanState || !weeklyPlanStatus) {
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
      <div className={cn(uiPageShellClasses.content, uiPageShellClasses.stack)}>
        <section className={cn(uiCardClasses.base, "p-6")}>
          <PageNavActions backAction={{ label: "Till hem", href: "/home" }} compact />
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-emerald-700">
            Veckoplan
          </p>
          <h1 className="mt-2 text-[clamp(2rem,7vw,2.6rem)] font-semibold tracking-tight text-slate-950">
            Veckoplan
          </h1>
          <p className="mt-3 text-base leading-7 text-slate-700">
            Vi föreslår en enkel ram för veckan. Planen räknas om automatiskt när du tränar.
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
              {isSaving ? "Sparar..." : "Spara ramar"}
            </button>
          </div>

          {saveMessage ? <p className="mt-4 text-sm text-emerald-700">{saveMessage}</p> : null}
          {planError ? <div className={cn(uiCardClasses.danger, "mt-4")}>{planError}</div> : null}
          {gymError ? <div className={cn(uiCardClasses.danger, "mt-4")}>{gymError}</div> : null}
          {pageError ? <div className={cn(uiCardClasses.danger, "mt-4")}>{pageError}</div> : null}
        </section>

        <section className={cn(uiCardClasses.base, "p-6")}>
          <p className="text-sm font-semibold text-slate-900">Coachens förslag</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
            Rekommenderad veckoplan
          </h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className={uiCardClasses.soft}>
              <p className="text-xs uppercase tracking-[0.16em] text-slate-400">Miniminivå</p>
              <p className="mt-2 text-lg font-semibold text-slate-950">
                {weeklyPlanRecommendation.minimumSessionsPerWeek} pass per vecka
              </p>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                För ditt mål är detta en bra miniminivå.
              </p>
            </div>
            <div className={uiCardClasses.soft}>
              <p className="text-xs uppercase tracking-[0.16em] text-slate-400">Rekommenderad nivå</p>
              <p className="mt-2 text-lg font-semibold text-slate-950">
                {weeklyPlanRecommendation.recommendedSessionsPerWeek} pass ·{" "}
                {formatDurationRange(
                  weeklyPlanRecommendation.recommendedMinutesRange.min,
                  weeklyPlanRecommendation.recommendedMinutesRange.max,
                )}
              </p>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                Vill du träna mer går det bra, men appen försöker hålla progressionen rimlig.
              </p>
            </div>
          </div>
          <p className="mt-4 text-base leading-7 text-slate-700">
            {weeklyPlanRecommendation.explanation}
          </p>
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
            <p className="text-sm font-medium text-slate-700">Föredragna träningsdagar</p>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Det här är hjälpsamma riktmärken, inte hårda låsningar.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {WEEKDAY_OPTIONS.map((day) => {
                const isSelected = planSettings.preferredDays.includes(day.value);
                return (
                  <button
                    key={day.value}
                    type="button"
                    onClick={() => {
                      const nextDays = planSettings.preferredDays.includes(day.value)
                        ? planSettings.preferredDays.filter((value) => value !== day.value)
                        : [...planSettings.preferredDays, day.value];

                      setPlanSettings({
                        ...planSettings,
                        preferredDays: nextDays.length > 0 ? nextDays : [day.value],
                      });
                    }}
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
                value={durationDrafts.defaultDurationMinutes}
                onChange={(event) =>
                  updateDurationDraft("defaultDurationMinutes", event.target.value)
                }
                onBlur={() => commitDurationDraft("defaultDurationMinutes")}
                className="min-h-[52px] w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-base text-slate-900 outline-none transition focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">Kortaste pass</span>
              <input
                type="number"
                min={5}
                max={120}
                value={durationDrafts.minDurationMinutes}
                onChange={(event) =>
                  updateDurationDraft("minDurationMinutes", event.target.value)
                }
                onBlur={() => commitDurationDraft("minDurationMinutes")}
                className="min-h-[52px] w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-base text-slate-900 outline-none transition focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">Längsta pass</span>
              <input
                type="number"
                min={10}
                max={180}
                value={durationDrafts.maxDurationMinutes}
                onChange={(event) =>
                  updateDurationDraft("maxDurationMinutes", event.target.value)
                }
                onBlur={() => commitDurationDraft("maxDurationMinutes")}
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
                  description: "Håll rekommendationerna nära dina valda dagar.",
                },
                {
                  value: "balanced",
                  title: "Balanserad",
                  description: "Låt pass flyta någon dag för bättre återhämtning.",
                },
                {
                  value: "flexible",
                  title: "Flexibel",
                  description: "Låt veckan anpassa sig efter det du faktiskt hinner.",
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
        </section>

        <section className={cn(uiCardClasses.base, "p-6")}>
          <h2 className="text-xl font-semibold tracking-tight text-slate-950">Veckans läge</h2>
          <p className="mt-2 text-base leading-7 text-slate-700">
            {weeklyPlanStatus.message}
          </p>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className={uiCardClasses.soft}>
              <p className="text-xs uppercase tracking-[0.16em] text-slate-400">Pass</p>
              <p className="mt-2 text-lg font-semibold text-slate-950">
                {weeklyPlanStatus.completedSessions} av {weeklyPlanStatus.plannedSessions}
              </p>
            </div>
            <div className={uiCardClasses.soft}>
              <p className="text-xs uppercase tracking-[0.16em] text-slate-400">Återstår</p>
              <p className="mt-2 text-lg font-semibold text-slate-950">
                {weeklyPlanStatus.remainingSessions} pass
              </p>
            </div>
            <div className={uiCardClasses.soft}>
              <p className="text-xs uppercase tracking-[0.16em] text-slate-400">Minuter kvar</p>
              <p className="mt-2 text-lg font-semibold text-slate-950">
                {weeklyPlanStatus.remainingMinutes} min
              </p>
            </div>
          </div>

          <div className={cn(uiCardClasses.soft, "mt-5")}>
            <p className="text-xs uppercase tracking-[0.16em] text-slate-400">
              Nästa rekommenderade pass
            </p>
            <h3 className="mt-2 text-xl font-semibold text-slate-950">
              {formatFocusLabel(weeklyPlanStatus.suggestedNextWorkoutFocus)}
            </h3>
            <p className="mt-2 text-base leading-7 text-slate-700">
              Ungefär {formatSuggestedRange(weeklyPlanStatus.suggestedNextDurationMinutes, planSettings)}.
            </p>
            <button
              type="button"
              onClick={() => void handleCreateRecommendedWorkout()}
              disabled={isGenerating}
              className={cn(uiButtonClasses.primary, "mt-4")}
            >
              {isGenerating ? "Skapar..." : "Skapa pass"}
            </button>
          </div>

          {nextPlannedSessions.length > 0 ? (
            <div className="mt-5 space-y-3">
              {nextPlannedSessions.map((session) => (
                <article
                  key={session.id}
                  className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                >
                  <p className="text-sm font-medium text-slate-500">
                    {formatWeekdayLabel(session.weekday)}
                  </p>
                  <h3 className="mt-1 text-lg font-semibold text-slate-950">
                    {session.targetDurationMinutes} min – {formatPlannedSessionFocus(session.focus)}
                  </h3>
                  <p className="mt-2 text-sm text-slate-700">
                    Status: {getStatusLabel(session.status)}
                  </p>
                </article>
              ))}
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}
