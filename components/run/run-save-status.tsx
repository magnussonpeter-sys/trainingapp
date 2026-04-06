"use client";

// Minimalistisk /run-sida.
// Fokus:
// - en huvudhandling i taget
// - AI-vikt vald direkt
// - chips för snabb viktändring
// - timer utan störande extralogik
// - lokal sparstatus tydlig men diskret
// - delade knappstilar i stället för hårdkodade färger
// - tydligare header och klickbar övningsbeskrivning

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getWorkoutDraft } from "@/lib/workout-flow/workout-draft-store";
import { clearActiveWorkoutSessionDraft } from "@/lib/active-workout-session-storage";
import { useActiveWorkout } from "@/hooks/use-active-workout";
import { uiButtonClasses } from "@/lib/ui/button-classes";
import type { Workout } from "@/types/workout";

type AuthUser = {
  id?: string | number | null;
  name?: string | null;
  displayName?: string | null;
  username?: string | null;
  email?: string | null;
};

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function getDisplayName(user: AuthUser | null) {
  if (!user) {
    return "där";
  }

  return (
    user.displayName?.trim() ||
    user.name?.trim() ||
    user.username?.trim() ||
    user.email?.split("@")[0]?.trim() ||
    "där"
  );
}

function formatTimerClock(totalSeconds: number) {
  const safeSeconds = Math.max(0, totalSeconds);
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatDuration(seconds: number) {
  if (seconds < 60) {
    return `${seconds} s`;
  }

  const minutes = Math.floor(seconds / 60);
  const restSeconds = seconds % 60;

  if (!restSeconds) {
    return `${minutes} min`;
  }

  return `${minutes} min ${restSeconds} s`;
}

// Fallback för att kunna återställa lokalt även om nätet tillfälligt saknas.
function resolveLocalFallbackUserId() {
  if (typeof window === "undefined") {
    return "";
  }

  try {
    const storage = window.localStorage;
    const prefixes = ["active_workout_session:", "workout_draft:"];

    for (const prefix of prefixes) {
      for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index);
        if (key && key.startsWith(prefix)) {
          return key.slice(prefix.length);
        }
      }
    }
  } catch {
    return "";
  }

  return "";
}

function SaveStatusPill({
  status,
}: {
  status: "idle" | "saving" | "saved_local" | "error_local";
}) {
  const label =
    status === "saving"
      ? "Sparar lokalt..."
      : status === "saved_local"
        ? "Sparat lokalt"
        : status === "error_local"
          ? "Kunde inte spara lokalt"
          : "Pass pågår";

  return (
    <span
      className={cn(
        "inline-flex rounded-full px-3 py-1 text-xs font-medium",
        status === "error_local"
          ? "bg-rose-100 text-rose-700"
          : status === "saving"
            ? "bg-amber-100 text-amber-800"
            : "bg-emerald-100 text-emerald-700",
      )}
    >
      {label}
    </span>
  );
}

function SetDots({
  totalSets,
  currentSet,
}: {
  totalSets: number;
  currentSet: number;
}) {
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: totalSets }).map((_, index) => {
        const setNumber = index + 1;
        const active = setNumber === currentSet;
        const completed = setNumber < currentSet;

        return (
          <span
            key={setNumber}
            className={cn(
              "h-2.5 rounded-full transition-all",
              active
                ? "w-8 bg-indigo-600"
                : completed
                  ? "w-2.5 bg-slate-400"
                  : "w-2.5 bg-slate-200",
            )}
          />
        );
      })}
    </div>
  );
}

function WeightChipRow({
  chips,
  selectedWeight,
  suggestedWeight,
  onSelect,
}: {
  chips: string[];
  selectedWeight: string;
  suggestedWeight: string;
  onSelect: (value: string) => void;
}) {
  const normalizedSelected = selectedWeight.trim().replace(",", ".");
  const normalizedSuggested = suggestedWeight.trim().replace(",", ".");

  if (chips.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {chips.map((chip) => {
        const normalizedChip = chip.trim().replace(",", ".");
        const isSelected = normalizedChip === normalizedSelected;
        const isSuggested = normalizedChip === normalizedSuggested;

        return (
          <button
            key={chip}
            type="button"
            onClick={() => onSelect(chip)}
            className={cn(
              uiButtonClasses.chip,
              isSelected
                ? uiButtonClasses.chipSelected
                : isSuggested
                  ? uiButtonClasses.chipSuggested
                  : uiButtonClasses.chipDefault,
            )}
          >
            {chip} kg
            {isSuggested ? " · förslag" : ""}
          </button>
        );
      })}
    </div>
  );
}

function DescriptionToggle({
  description,
}: {
  description?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);

  if (!description?.trim()) {
    return null;
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white">
      <button
        type="button"
        onClick={() => setIsOpen((previous) => !previous)}
        className="flex min-h-11 w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">
            Övningsbeskrivning
          </p>
          <p className="mt-1 text-sm font-medium text-slate-700">
            {isOpen ? "Dölj beskrivning" : "Visa beskrivning"}
          </p>
        </div>

        <span
          className={cn(
            "text-lg font-semibold text-slate-500 transition-transform",
            isOpen ? "rotate-180" : "",
          )}
        >
          ˅
        </span>
      </button>

      {isOpen ? (
        <div className="border-t border-slate-100 px-4 py-4">
          <p className="text-sm leading-6 text-slate-600">{description}</p>
        </div>
      ) : null}
    </section>
  );
}

function RepsFeedbackRow({
  value,
  onChange,
  onSkip,
  onContinue,
}: {
  value: 0 | 2 | 4 | 6 | null;
  onChange: (value: 0 | 2 | 4 | 6) => void;
  onSkip: () => void;
  onContinue: () => void;
}) {
  const options: Array<{ value: 0 | 2 | 4 | 6; label: string }> = [
    { value: 0, label: "0 · tungt" },
    { value: 2, label: "2 · bra" },
    { value: 4, label: "4 · lätt" },
    { value: 6, label: "6+ · mycket lätt" },
  ];

  return (
    <div className="space-y-4 rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
      <div>
        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">
          Feedback
        </p>
        <h3 className="mt-1 text-lg font-semibold text-slate-900">
          Hur kändes sista seten?
        </h3>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={cn(
              "min-h-11 rounded-2xl border px-3 py-3 text-sm font-medium transition",
              value === option.value
                ? uiButtonClasses.feedbackSelected
                : uiButtonClasses.feedbackDefault,
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="flex gap-3">
        <button type="button" onClick={onSkip} className={uiButtonClasses.secondary}>
          Hoppa över
        </button>
        <button
          type="button"
          onClick={onContinue}
          className={cn(uiButtonClasses.primary, "flex-[1.3]")}
        >
          Fortsätt
        </button>
      </div>
    </div>
  );
}

function TimedFeedbackRow({
  value,
  onChange,
  onSkip,
  onContinue,
}: {
  value: "light" | "just_right" | "tough" | null;
  onChange: (value: "light" | "just_right" | "tough") => void;
  onSkip: () => void;
  onContinue: () => void;
}) {
  const options: Array<{ value: "light" | "just_right" | "tough"; label: string }> = [
    { value: "light", label: "Lätt" },
    { value: "just_right", label: "Lagom" },
    { value: "tough", label: "Tufft" },
  ];

  return (
    <div className="space-y-4 rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
      <div>
        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">
          Feedback
        </p>
        <h3 className="mt-1 text-lg font-semibold text-slate-900">
          Hur kändes tidsövningen?
        </h3>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={cn(
              "min-h-11 rounded-2xl border px-3 py-3 text-sm font-medium transition",
              value === option.value
                ? uiButtonClasses.feedbackSelected
                : uiButtonClasses.feedbackDefault,
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="flex gap-3">
        <button type="button" onClick={onSkip} className={uiButtonClasses.secondary}>
          Hoppa över
        </button>
        <button
          type="button"
          onClick={onContinue}
          className={cn(uiButtonClasses.primary, "flex-[1.3]")}
        >
          Fortsätt
        </button>
      </div>
    </div>
  );
}

export default function RunPage() {
  const router = useRouter();

  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [resolvedUserId, setResolvedUserId] = useState("");
  const [workout, setWorkout] = useState<Workout | null>(null);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);

  // Ladda användare. Om nätet faller tillbaka används lokal nyckel.
  useEffect(() => {
    let isMounted = true;

    async function loadUser() {
      try {
        const response = await fetch("/api/auth/me", {
          credentials: "include",
          cache: "no-store",
        });

        const data = (await response.json().catch(() => null)) as
          | { user?: AuthUser | null }
          | null;

        const user = data?.user ?? null;
        const nextUserId =
          user?.id !== undefined && user?.id !== null ? String(user.id) : "";

        if (!isMounted) {
          return;
        }

        if (nextUserId) {
          setAuthUser(user);
          setResolvedUserId(nextUserId);
          return;
        }

        const fallbackUserId = resolveLocalFallbackUserId();
        setResolvedUserId(fallbackUserId);
      } catch {
        if (!isMounted) {
          return;
        }

        const fallbackUserId = resolveLocalFallbackUserId();
        setResolvedUserId(fallbackUserId);
      }
    }

    void loadUser();

    return () => {
      isMounted = false;
    };
  }, []);

  // Ladda workout draft lokalt.
  useEffect(() => {
    if (!resolvedUserId) {
      setLoading(false);
      return;
    }

    try {
      const storedWorkout = getWorkoutDraft(resolvedUserId) as Workout | null;
      setWorkout(storedWorkout);
      setLoading(false);
    } catch {
      setWorkout(null);
      setLoading(false);
      setPageError("Kunde inte läsa in pågående pass.");
    }
  }, [resolvedUserId]);

  const {
    currentExercise,
    currentSet,
    reps,
    setReps,
    weight,
    updateWeight,
    chooseWeightChip,
    suggestedWeightValue,
    weightChipOptions,
    timedExercise,
    timerState,
    elapsedSeconds,
    startTimer,
    stopTimer,
    resetTimer,
    saveSet,
    skipExercise,
    totalCompletedSets,
    totalVolume,
    showExerciseFeedback,
    selectedExtraReps,
    setSelectedExtraReps,
    selectedTimedEffort,
    setSelectedTimedEffort,
    submitExerciseFeedback,
    moveToNextExercise,
    showRestTimer,
    restTimerRunning,
    setRestTimerRunning,
    restRemainingSeconds,
    restoreNotice,
    saveStatus,
    isWorkoutComplete,
  } = useActiveWorkout({
    userId: resolvedUserId,
    workout,
  });

  const nextExerciseName = useMemo(() => {
    if (!workout || !currentExercise) {
      return "";
    }

    const currentIndex = workout.exercises.findIndex(
      (item) => item.id === currentExercise.id,
    );
    if (currentIndex === -1) {
      return "";
    }

    return workout.exercises[currentIndex + 1]?.name ?? "";
  }, [currentExercise, workout]);

  const primaryButtonLabel = useMemo(() => {
    if (timedExercise) {
      if (timerState === "idle") {
        return "Starta set";
      }

      if (timerState === "running") {
        return "Stoppa set";
      }

      return "Spara set";
    }

    return "Spara set";
  }, [timedExercise, timerState]);

  const canUsePrimaryAction = true;

  function handlePrimaryAction() {
    if (timedExercise) {
      if (timerState === "idle") {
        startTimer();
        return;
      }

      if (timerState === "running") {
        stopTimer();
        return;
      }

      saveSet();
      return;
    }

    saveSet();
  }

  function handleGoHome() {
    if (resolvedUserId) {
      clearActiveWorkoutSessionDraft(resolvedUserId);
    }

    router.push("/home");
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-6">
        <div className="mx-auto max-w-3xl">
          <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-sm text-slate-600">Laddar pass...</p>
          </section>
        </div>
      </main>
    );
  }

  if (!workout || !resolvedUserId) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-6">
        <div className="mx-auto max-w-3xl space-y-4">
          <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-sm leading-6 text-slate-600">
              Inget aktivt pass hittades. Gå tillbaka till home och starta ett nytt pass.
            </p>

            <button
              type="button"
              onClick={() => router.push("/home")}
              className={cn(uiButtonClasses.primary, "mt-4")}
            >
              Till home
            </button>
          </section>

          {pageError ? (
            <section className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
              {pageError}
            </section>
          ) : null}
        </div>
      </main>
    );
  }

  if (isWorkoutComplete) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-6">
        <div className="mx-auto max-w-3xl space-y-4">
          <section className="overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-sm">
            <div className="bg-slate-900 px-6 py-6 text-white">
              <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-300">
                Pass klart
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight">
                {workout.name}
              </h1>
              <p className="mt-3 text-sm leading-6 text-slate-200">
                Bra jobbat, {getDisplayName(authUser)}.
              </p>
            </div>

            <div className="grid gap-3 px-6 py-5 sm:grid-cols-3">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">
                  Genomförda set
                </p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">
                  {totalCompletedSets}
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">
                  Total volym
                </p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">
                  {Math.round(totalVolume)}
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">
                  Status
                </p>
                <p className="mt-2 text-base font-semibold text-emerald-700">
                  Sparat lokalt
                </p>
              </div>
            </div>
          </section>

          <button
            type="button"
            onClick={handleGoHome}
            className={cn(uiButtonClasses.primary, "w-full")}
          >
            Till home
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 pb-32">
      <div className="mx-auto max-w-3xl px-4 py-5 sm:px-6">
        <section className="overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-sm">
          <div className="bg-slate-900 px-5 pb-6 pt-5 text-white">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-300">
                  Pass pågår
                </p>
                <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
                  {workout.name}
                </h1>
                <p className="mt-3 text-sm leading-6 text-slate-200">
                  Hej {getDisplayName(authUser)}. Fokusera bara på nästa handling.
                </p>
              </div>

              <button
                type="button"
                onClick={() => router.push("/home")}
                className="min-h-11 shrink-0 rounded-2xl border border-white/30 bg-white px-4 py-2 text-sm font-semibold text-slate-900 shadow-sm transition hover:bg-slate-100 active:scale-[0.99]"
              >
                Avbryt
              </button>
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-2">
              <SaveStatusPill status={saveStatus} />
              {restoreNotice ? (
                <span className="inline-flex rounded-full bg-slate-800 px-3 py-1 text-xs text-slate-200">
                  {restoreNotice}
                </span>
              ) : null}
            </div>
          </div>

          <div className="space-y-4 px-5 py-5">
            {pageError ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
                {pageError}
              </div>
            ) : null}

            {currentExercise ? (
              <>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">
                      Aktuell övning
                    </p>
                    <h2 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
                      {currentExercise.name}
                    </h2>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-right">
                    <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">
                      Set
                    </p>
                    <p className="mt-1 text-base font-semibold text-slate-900">
                      {currentSet} / {currentExercise.sets}
                    </p>
                  </div>
                </div>

                <SetDots totalSets={currentExercise.sets} currentSet={currentSet} />

                <DescriptionToggle description={currentExercise.description} />

                {!showExerciseFeedback ? (
                  <>
                    {!timedExercise ? (
                      <section className="space-y-4 rounded-[28px] border border-slate-200 bg-slate-50 p-4">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="rounded-2xl border border-slate-200 bg-white p-4">
                            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">
                              Reps
                            </p>
                            <input
                              inputMode="numeric"
                              value={reps}
                              onChange={(event) => setReps(event.target.value)}
                              className="mt-2 w-full border-none bg-transparent p-0 text-3xl font-semibold text-slate-900 outline-none"
                            />
                            <p className="mt-1 text-sm text-slate-500">
                              Planerat: {currentExercise.reps ?? "-"}
                            </p>
                          </div>

                          <div className="rounded-2xl border border-slate-200 bg-white p-4">
                            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">
                              Vikt
                            </p>
                            <div className="mt-2 flex items-end gap-2">
                              <input
                                inputMode="decimal"
                                value={weight}
                                onChange={(event) => updateWeight(event.target.value)}
                                className="w-full border-none bg-transparent p-0 text-3xl font-semibold text-slate-900 outline-none"
                              />
                              <span className="pb-1 text-sm font-medium text-slate-500">
                                kg
                              </span>
                            </div>
                            <p className="mt-1 text-sm text-slate-500">
                              {suggestedWeightValue
                                ? `AI-förslag: ${suggestedWeightValue} kg`
                                : "Ingen vikt föreslagen"}
                            </p>
                          </div>
                        </div>

                        <WeightChipRow
                          chips={weightChipOptions}
                          selectedWeight={weight}
                          suggestedWeight={suggestedWeightValue}
                          onSelect={chooseWeightChip}
                        />
                      </section>
                    ) : (
                      <section className="space-y-4 rounded-[28px] border border-slate-200 bg-slate-50 p-4">
                        <div className="rounded-[28px] border border-slate-200 bg-white p-5 text-center shadow-sm">
                          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">
                            Tid för set
                          </p>
                          <div className="mt-3 text-6xl font-semibold tracking-tight text-slate-900">
                            {formatTimerClock(elapsedSeconds)}
                          </div>
                          <p className="mt-3 text-sm text-slate-500">
                            Mål: {formatDuration(currentExercise.duration ?? 0)}
                          </p>
                        </div>

                        <div className="rounded-2xl border border-slate-200 bg-white p-4">
                          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">
                            Vikt
                          </p>
                          <div className="mt-2 flex items-end gap-2">
                            <input
                              inputMode="decimal"
                              value={weight}
                              onChange={(event) => updateWeight(event.target.value)}
                              className="w-full border-none bg-transparent p-0 text-3xl font-semibold text-slate-900 outline-none"
                            />
                            <span className="pb-1 text-sm font-medium text-slate-500">
                              kg
                            </span>
                          </div>
                          <p className="mt-1 text-sm text-slate-500">
                            {suggestedWeightValue
                              ? `AI-förslag: ${suggestedWeightValue} kg`
                              : "Valfri vikt"}
                          </p>
                        </div>

                        <WeightChipRow
                          chips={weightChipOptions}
                          selectedWeight={weight}
                          suggestedWeight={suggestedWeightValue}
                          onSelect={chooseWeightChip}
                        />
                      </section>
                    )}

                    {showRestTimer ? (
                      <section className="rounded-[24px] border border-sky-100 bg-sky-50 px-4 py-4">
                        <div className="flex items-center justify-between gap-4">
                          <div>
                            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-sky-600">
                              Vila
                            </p>
                            <p className="mt-1 text-2xl font-semibold text-sky-950">
                              {formatTimerClock(restRemainingSeconds)}
                            </p>
                          </div>

                          <button
                            type="button"
                            onClick={() => setRestTimerRunning(!restTimerRunning)}
                            className={uiButtonClasses.secondary}
                          >
                            {restTimerRunning ? "Pausa" : "Starta"}
                          </button>
                        </div>
                      </section>
                    ) : null}
                  </>
                ) : timedExercise ? (
                  <TimedFeedbackRow
                    value={selectedTimedEffort}
                    onChange={setSelectedTimedEffort}
                    onSkip={moveToNextExercise}
                    onContinue={submitExerciseFeedback}
                  />
                ) : (
                  <RepsFeedbackRow
                    value={selectedExtraReps}
                    onChange={setSelectedExtraReps}
                    onSkip={moveToNextExercise}
                    onContinue={submitExerciseFeedback}
                  />
                )}

                {!showExerciseFeedback && nextExerciseName ? (
                  <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
                    Nästa övning:{" "}
                    <span className="font-medium text-slate-900">
                      {nextExerciseName}
                    </span>
                  </div>
                ) : null}

                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">
                      Genomförda set
                    </p>
                    <p className="mt-2 text-2xl font-semibold text-slate-900">
                      {totalCompletedSets}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">
                      Total volym
                    </p>
                    <p className="mt-2 text-2xl font-semibold text-slate-900">
                      {Math.round(totalVolume)}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">
                      Gym
                    </p>
                    <p className="mt-2 text-base font-semibold text-slate-900">
                      {workout.gym ?? "Valt gym"}
                    </p>
                  </div>
                </div>
              </>
            ) : null}
          </div>
        </section>
      </div>

      {!showExerciseFeedback ? (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 px-4 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-3 backdrop-blur">
          <div className="mx-auto flex max-w-3xl items-center gap-3">
            <button
              type="button"
              onClick={skipExercise}
              className={cn(uiButtonClasses.secondary, "flex-1")}
            >
              Hoppa över
            </button>

            {timedExercise && timerState === "ready_to_save" ? (
              <button
                type="button"
                onClick={resetTimer}
                className={uiButtonClasses.secondary}
              >
                Kör igen
              </button>
            ) : null}

            <button
              type="button"
              onClick={handlePrimaryAction}
              disabled={!canUsePrimaryAction}
              className={cn(uiButtonClasses.primary, "flex-[1.4]")}
            >
              {primaryButtonLabel}
            </button>
          </div>
        </div>
      ) : null}
    </main>
  );
}