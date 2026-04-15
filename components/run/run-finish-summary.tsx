"use client";

import { useEffect, useMemo, useState } from "react";

import {
  getExercisePreferences,
  setLessOftenPreference,
} from "@/lib/exercise-preference-storage";
import {
  getWorkoutLogs,
  type CompletedExercise,
  type WorkoutLog,
} from "@/lib/workout-log-storage";

type RunFinishSummaryProps = {
  completedExercises: CompletedExercise[];
  goal?: string;
  totalCompletedSets: number;
  totalVolume: number;
  timedExercises: number;
  durationMinutes: number;
  userId: string;
  workoutName: string;
};

type MetricCard = {
  label: string;
  value: string;
  helper: string;
};

type CoachingCard = {
  accentClassName: string;
  label: string;
  title: string;
  body: string;
};

type TrafficLightItem = {
  accentClassName: string;
  icon: string;
  title: string;
  area: string;
  action: string;
};

type FinishAnalysisResponse = {
  ok?: boolean;
  analysis?: {
    title: string;
    achieved: string;
    historicalContext: string;
    nextStep: string;
    nextSessionTiming: string;
    coachNote: string;
    scienceMinute: string;
  };
};

type FinishAnalysis = NonNullable<FinishAnalysisResponse["analysis"]>;

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function formatMetricNumber(value: number) {
  return new Intl.NumberFormat("sv-SE", {
    maximumFractionDigits: value >= 100 ? 0 : 1,
  }).format(value);
}

function parseDateMs(value: string) {
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function getAverage(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function getCurrentIntensityScore(completedExercises: CompletedExercise[]) {
  const scores: number[] = [];

  for (const exercise of completedExercises) {
    if (exercise.extraReps === 0) {
      scores.push(9.5);
    } else if (exercise.extraReps === 2) {
      scores.push(8.5);
    } else if (exercise.extraReps === 4) {
      scores.push(7.5);
    } else if (exercise.extraReps === 6) {
      scores.push(6.5);
    }

    if (exercise.timedEffort === "tough") {
      scores.push(8.5);
    } else if (exercise.timedEffort === "just_right") {
      scores.push(7.5);
    } else if (exercise.timedEffort === "light") {
      scores.push(6.5);
    }
  }

  return scores.length > 0 ? getAverage(scores) : 7.5;
}

function getWorkoutVolume(log: WorkoutLog) {
  return log.exercises.reduce((sum, exercise) => {
    return (
      sum +
      exercise.sets.reduce((setSum, set) => {
        if (set.actualWeight == null || set.actualReps == null) {
          return setSum;
        }

        return setSum + set.actualWeight * set.actualReps;
      }, 0)
    );
  }, 0);
}

function getWorkoutIntensity(log: WorkoutLog) {
  return getCurrentIntensityScore(log.exercises);
}

function getRecentCompletedLogs(userId: string) {
  const now = Date.now();
  const twentyEightDaysMs = 28 * 24 * 60 * 60 * 1000;

  return [...getWorkoutLogs(userId)]
    .filter((log) => log.status === "completed")
    .sort((left, right) => parseDateMs(right.completedAt) - parseDateMs(left.completedAt))
    .filter((log, index) => {
      if (index === 0) {
        return false;
      }

      const completedAtMs = parseDateMs(log.completedAt);
      return completedAtMs > 0 && now - completedAtMs <= twentyEightDaysMs;
    });
}

function getBenchmark({
  comparisonLogs,
  totalCompletedSets,
  totalVolume,
}: {
  comparisonLogs: WorkoutLog[];
  totalCompletedSets: number;
  totalVolume: number;
}) {
  if (totalVolume > 0) {
    return {
      current: totalVolume,
      average:
        comparisonLogs.length > 0
          ? getAverage(comparisonLogs.map((log) => getWorkoutVolume(log)))
          : 0,
      label: "volym",
      unit: "kg",
    };
  }

  return {
    current: totalCompletedSets,
    average:
      comparisonLogs.length > 0
        ? getAverage(
            comparisonLogs.map((log) =>
              log.exercises.reduce((sum, exercise) => sum + exercise.sets.length, 0),
            ),
          )
        : 0,
    label: "set",
    unit: "set",
  };
}

function getScienceMinute(params: {
  durationMinutes: number;
  goal?: string;
  intensityScore: number;
  timedExercises: number;
}) {
  const normalizedGoal = params.goal?.trim().toLowerCase() ?? "";

  if (normalizedGoal.includes("hypert")) {
    return (
      <>
        Dagens pass gav en tydlig signal för <strong>muskelproteinsyntes</strong> och
        lokal trötthet i arbetande muskulatur. För att maximera <strong>hypertrofi</strong>
        krävs nu ungefär 24-48 timmars återhämtning innan liknande muskler pressas hårt igen.
      </>
    );
  }

  if (normalizedGoal.includes("styrka")) {
    return (
      <>
        Dagens pass gav sannolikt en användbar stimulans för <strong>styrka</strong>
        genom upprepad kvalitet under belastning. Nästa steg är att låta nervsystem och
        vävnader återhämta sig i cirka <strong>24-48 timmar</strong> innan ny progression.
      </>
    );
  }

  if (params.timedExercises > 0 && params.intensityScore >= 8) {
    return (
      <>
        Dagens pass drev upp både <strong>ansträngning</strong> och lokal uthållighet,
        särskilt i de tidsstyrda momenten. För god adaptation bör nästa liknande pass få
        minst <strong>24 timmar</strong> med rimlig återhämtning emellan.
      </>
    );
  }

  return (
    <>
      Dagens pass gav en tydlig träningssignal genom <strong>tillräcklig volym</strong> och
      meningsfull ansträngning. För att få effekt över tid behöver du nu bara fortsätta med
      <strong>kontinuitet</strong> och låta kroppen återhämta sig till nästa pass.
    </>
  );
}

function getFirstExerciseAdjustment(exercise: CompletedExercise | null) {
  if (!exercise) {
    return "Bygg vidare med en liten ökning i en huvudövning om tekniken känns stabil.";
  }

  const lastSet = exercise.sets[exercise.sets.length - 1];
  const hasWeight =
    typeof lastSet?.actualWeight === "number" && Number.isFinite(lastSet.actualWeight);

  if (exercise.plannedDuration && !exercise.plannedReps) {
    if (exercise.timedEffort === "light") {
      return `Lägg på 5-10 sek i ${exercise.exerciseName.toLowerCase()} eller öka tempot något.`;
    }

    return `Håll samma tid i ${exercise.exerciseName.toLowerCase()} men försök få bättre kontroll eller något jämnare tempo.`;
  }

  if (hasWeight && (exercise.extraReps === 4 || exercise.extraReps === 6)) {
    return `Addera 2.5 kg eller nästa tillgängliga viktsteg i ${exercise.exerciseName.toLowerCase()}.`;
  }

  if (hasWeight) {
    return `Behåll vikten i ${exercise.exerciseName.toLowerCase()} och sikta på 1-2 fler reps med samma kvalitet.`;
  }

  if (exercise.extraReps === 4 || exercise.extraReps === 6) {
    return `Lägg till 2 reps i ${exercise.exerciseName.toLowerCase()} eller ett extra set om passet fortfarande känns kontrollerat.`;
  }

  return `Försök matcha dagens kvalitet i ${exercise.exerciseName.toLowerCase()} innan du ökar vidare.`;
}

function getFallbackMainInsight(params: {
  comparisonPercent: number;
  intensityScore: number;
  totalCompletedSets: number;
}) {
  if (params.comparisonPercent >= 105) {
    return "Bra träningssignal idag, bygg vidare med samma kontinuitet.";
  }

  if (params.intensityScore >= 8.5) {
    return "Du låg högt i ansträngning idag, så nästa steg är smart återhämtning.";
  }

  if (params.totalCompletedSets >= 10) {
    return "Du fick in ett stabilt arbetspass idag, fortsätt på samma spår.";
  }

  return "Bra jobbat, nu är det viktigaste att hålla rytmen i nästa pass.";
}

function isGenericMainInsight(value: string | null | undefined) {
  if (!value) {
    return true;
  }

  const normalized = value.trim().toLowerCase();

  return (
    normalized.length < 12 ||
    normalized === "kort analys av passet" ||
    normalized === "sammanfattning" ||
    normalized === "summering" ||
    normalized === "bra jobbat" ||
    normalized === "passet är klart"
  );
}

function buildTrafficLights(params: {
  comparisonLogs: WorkoutLog[];
  completedExercises: CompletedExercise[];
  durationMinutes: number;
  intensityScore: number;
}) {
  const recentSevenDays = params.comparisonLogs.filter((log) => {
    return Date.now() - parseDateMs(log.completedAt) <= 7 * 24 * 60 * 60 * 1000;
  }).length;
  const firstExercise = params.completedExercises[0] ?? null;

  const recoveryText =
    params.intensityScore >= 8.5 || params.durationMinutes >= 70
      ? "Passet var rätt krävande. Prioritera återhämtning och håll nästa liknande pass något kontrollerat om kroppen känns sliten."
      : "Belastningen såg rimlig ut. Bevaka stelhet och trötthet, men återhämtningen bör vara hanterbar om du håller nästa steg smått.";

  return [
    {
      accentClassName: "border-emerald-200 bg-emerald-50",
      icon: "🟢",
      title: "Gör mer av",
      area: "Kontinuitet",
      action:
        recentSevenDays >= 3
          ? `Du har hållit frekvensen uppe med ${recentSevenDays} pass senaste veckan. Grymt jobbat, fortsätt så.`
          : "Du byggde ännu ett genomfört pass. Fortsatt regelbundenhet kommer ge mer effekt än enstaka toppass.",
    },
    {
      accentClassName: "border-amber-200 bg-amber-50",
      icon: "🟡",
      title: "Justera",
      area: "Belastning",
      action: getFirstExerciseAdjustment(firstExercise),
    },
    {
      accentClassName: "border-rose-200 bg-rose-50",
      icon: "🔴",
      title: "Bevaka",
      area: "Återhämtning",
      action: recoveryText,
    },
  ] satisfies TrafficLightItem[];
}

function MetricCard({ helper, label, value }: MetricCard) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
        {label}
      </p>
      <p className="mt-3 text-2xl font-bold tracking-tight text-slate-950">{value}</p>
      <p className="mt-2 text-xs leading-5 text-slate-500">{helper}</p>
    </div>
  );
}

export default function RunFinishSummary({
  completedExercises,
  durationMinutes,
  goal,
  timedExercises,
  totalCompletedSets,
  totalVolume,
  userId,
  workoutName,
}: RunFinishSummaryProps) {
  const [lessPreferenceIds, setLessPreferenceIds] = useState<string[]>([]);
  const [analysis, setAnalysis] = useState<FinishAnalysis | null>(null);
  const [analysisState, setAnalysisState] = useState<"loading" | "ready" | "fallback">(
    "loading",
  );

  useEffect(() => {
    const currentLessPreferences = getExercisePreferences(userId)
      .filter((entry) => entry.preference === "less_often")
      .map((entry) => entry.exerciseId);

    setLessPreferenceIds(currentLessPreferences);
  }, [userId]);

  useEffect(() => {
    let isMounted = true;

    async function loadFinishAnalysis() {
      setAnalysisState("loading");

      const weightedSetCount = completedExercises.reduce((sum, exercise) => {
        return (
          sum +
          exercise.sets.filter(
            (set) =>
              typeof set.actualWeight === "number" &&
              Number.isFinite(set.actualWeight) &&
              set.actualWeight > 0,
          ).length
        );
      }, 0);
      const bodyweightSetCount = completedExercises.reduce((sum, exercise) => {
        return (
          sum +
          exercise.sets.filter((set) => {
            const noExternalWeight =
              set.actualWeight == null ||
              !Number.isFinite(set.actualWeight) ||
              set.actualWeight <= 0;

            return noExternalWeight && (set.actualReps != null || set.actualDuration != null);
          }).length
        );
      }, 0);

      try {
        const response = await fetch("/api/workout-finish-analysis", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            userId,
            workoutName,
            totalCompletedSets,
            totalVolume,
            timedExercises,
            durationMinutes,
            weightedSetCount,
            bodyweightSetCount,
          }),
        });

        const data = (await response.json().catch(() => null)) as
          | FinishAnalysisResponse
          | null;

        if (!isMounted || !response.ok || !data?.ok) {
          if (isMounted) {
            setAnalysisState("fallback");
          }
          return;
        }

        // Use the analyzed summary when it exists, but keep the page functional offline.
        setAnalysis(data.analysis ?? null);
        setAnalysisState(data.analysis ? "ready" : "fallback");
      } catch {
        // Offline or API failure should not block the local finish summary.
        if (isMounted) {
          setAnalysisState("fallback");
        }
      }
    }

    void loadFinishAnalysis();

    return () => {
      isMounted = false;
    };
  }, [
    durationMinutes,
    timedExercises,
    totalCompletedSets,
    totalVolume,
    userId,
    workoutName,
  ]);

  const comparisonLogs = useMemo(() => getRecentCompletedLogs(userId), [userId]);
  const intensityScore = useMemo(
    () => getCurrentIntensityScore(completedExercises),
    [completedExercises],
  );
  const averageRecentIntensity = useMemo(() => {
    return comparisonLogs.length > 0
      ? getAverage(comparisonLogs.map((log) => getWorkoutIntensity(log)))
      : 0;
  }, [comparisonLogs]);
  const benchmark = useMemo(
    () =>
      getBenchmark({
        comparisonLogs,
        totalCompletedSets,
        totalVolume,
      }),
    [comparisonLogs, totalCompletedSets, totalVolume],
  );
  const comparisonPercent =
    benchmark.average > 0
      ? Math.round((benchmark.current / benchmark.average) * 100)
      : 100;
  const progressWidth = Math.max(
    12,
    Math.min(100, benchmark.average > 0 ? (benchmark.current / benchmark.average) * 100 : 100),
  );
  const trafficLights = useMemo(
    () =>
      buildTrafficLights({
        comparisonLogs,
        completedExercises,
        durationMinutes,
        intensityScore,
      }),
    [comparisonLogs, completedExercises, durationMinutes, intensityScore],
  );
  const uniqueExercises = useMemo(() => {
    const seen = new Set<string>();

    return completedExercises.filter((exercise) => {
      if (seen.has(exercise.exerciseId)) {
        return false;
      }

      seen.add(exercise.exerciseId);
      return true;
    });
  }, [completedExercises]);

  const keyMetrics: MetricCard[] = [
    {
      label: "Ansträngning",
      value: `RPE ${formatMetricNumber(intensityScore)}`,
      helper: "Genomsnitt i passet",
    },
    {
      label: "Arbetsset",
      value: String(totalCompletedSets),
      helper: "Genomförda set",
    },
    {
      label: totalVolume > 0 ? "Volym" : "Tid",
      value: totalVolume > 0 ? `${Math.round(totalVolume)} kg` : `${durationMinutes} min`,
      helper: totalVolume > 0 ? "Total vikt lyft" : "Passets längd",
    },
  ];

  const mainInsight =
    analysisState === "ready" && !isGenericMainInsight(analysis?.title)
      ? analysis?.title.trim()
      : getFallbackMainInsight({
          comparisonPercent,
          intensityScore,
          totalCompletedSets,
        });

  const nextStepItems: CoachingCard[] = [
    {
      accentClassName: "border-emerald-200 bg-emerald-50",
      label: "Fortsätt",
      title: "Det här fungerade",
      body:
        analysis?.achieved?.trim() ||
        "Du fick in en tydlig träningssignal idag. Fortsätt bygga på regelbundenheten.",
    },
    {
      accentClassName: "border-amber-200 bg-amber-50",
      label: "Justera",
      title: "Till nästa pass",
      body:
        analysis?.nextStep?.trim() ||
        getFirstExerciseAdjustment(completedExercises[0] ?? null),
    },
    {
      accentClassName: "border-sky-200 bg-sky-50",
      label: "Tänk på",
      title: "Timing och återhämtning",
      body:
        analysis?.nextSessionTiming?.trim() ||
        analysis?.coachNote?.trim() ||
        "Låt återhämtningen styra tempot till nästa liknande pass.",
    },
  ];

  const comparisonSummaryText =
    benchmark.average > 0
      ? `Det här passet landade på ${comparisonPercent}% av ditt 4-veckorssnitt i ${benchmark.label}.`
      : "Det här blir din första tydliga referenspunkt för kommande jämförelser.";

  function toggleLessPreference(exercise: CompletedExercise) {
    const nextEnabled = !lessPreferenceIds.includes(exercise.exerciseId);

    setLessOftenPreference({
      enabled: nextEnabled,
      exercise,
      userId,
    });

    setLessPreferenceIds((previous) =>
      nextEnabled
        ? [...previous, exercise.exerciseId]
        : previous.filter((exerciseId) => exerciseId !== exercise.exerciseId),
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-cyan-50 p-5 shadow-sm sm:p-6">
        <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-white px-4 py-2 text-sm font-semibold text-emerald-800">
          <span className="text-base">✓</span>
          Passet genomfört
        </div>

        <h2 className="mt-4 text-3xl font-bold tracking-tight text-slate-950">
          Bra jobbat, här är det viktigaste
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Snabb sammanfattning direkt efter passet. Fokusera på huvudinsikten och nästa steg först.
        </p>
      </section>

      <section className="rounded-[28px] border border-emerald-200 bg-white p-5 shadow-sm sm:p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
          Huvudinsikt
        </p>
        {analysisState === "loading" ? (
          <div className="mt-4 flex items-center gap-3 text-slate-600">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-emerald-200 border-t-emerald-600" />
            <span className="text-sm font-medium">AI analyserar passet...</span>
          </div>
        ) : (
          <p className="mt-3 text-2xl font-semibold leading-tight text-slate-950">
            {mainInsight}
          </p>
        )}
      </section>

      <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
          Nyckelmått
        </p>
        <h3 className="mt-2 text-xl font-semibold text-slate-950">
          Det viktigaste från passet
        </h3>

        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {keyMetrics.map((metric) => (
            <MetricCard key={metric.label} {...metric} />
          ))}
        </div>
      </section>

      <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
          Nästa steg
        </p>
        <h3 className="mt-2 text-xl font-semibold text-slate-950">
          Ta med dig detta till nästa pass
        </h3>

        <div className="mt-4 grid gap-3">
          {nextStepItems.map((item) => (
            <article
              key={item.label}
              className={cn("rounded-3xl border p-4", item.accentClassName)}
            >
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-600">
                {item.label}
              </p>
              <p className="mt-2 text-lg font-semibold text-slate-950">{item.title}</p>
              <p className="mt-2 text-sm leading-6 text-slate-700">{item.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
          Frivillig feedback
        </p>
        <h3 className="mt-2 text-xl font-semibold text-slate-950">
          Vill du ändra något till nästa gång?
        </h3>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Helt valfritt. Tryck på en övning om du vill få mindre av den framöver.
        </p>

        <div className="mt-4 flex flex-wrap gap-3">
          {uniqueExercises.map((exercise) => {
            const selected = lessPreferenceIds.includes(exercise.exerciseId);

            return (
              <button
                key={exercise.exerciseId}
                type="button"
                onClick={() => toggleLessPreference(exercise)}
                className={cn(
                  "rounded-2xl border px-4 py-3 text-sm font-semibold transition",
                  selected
                    ? "border-rose-300 bg-rose-100 text-rose-900"
                    : "border-slate-200 bg-white text-slate-700",
                )}
              >
                {selected ? `Mindre av ${exercise.exerciseName}` : exercise.exerciseName}
              </button>
            );
          })}
        </div>
      </section>

      <details className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <summary className="cursor-pointer list-none">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                Fördjupning
              </p>
              <h3 className="mt-2 text-xl font-semibold text-slate-950">
                Se mer analys och jämförelse
              </h3>
            </div>
            <span className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600">
              Visa mer
            </span>
          </div>
        </summary>

        <div className="mt-6 space-y-6">
          <section className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Jämförelse
                </p>
                <h4 className="mt-2 text-lg font-semibold text-slate-950">
                  Dagens pass mot din baslinje
                </h4>
              </div>

              <div className="rounded-2xl bg-white px-3 py-2 text-right shadow-sm">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  4 veckor
                </p>
                <p className="text-sm font-semibold text-slate-900">
                  {benchmark.average > 0
                    ? `${formatMetricNumber(benchmark.average)} ${benchmark.unit}`
                    : "Mer data behövs"}
                </p>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between text-sm text-slate-600">
                <span>Dagens {benchmark.label}</span>
                <span className="font-semibold text-slate-900">
                  {formatMetricNumber(benchmark.current)} {benchmark.unit}
                </span>
              </div>

              <div className="h-3 overflow-hidden rounded-full bg-white">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-cyan-500 transition-all"
                  style={{ width: `${progressWidth}%` }}
                />
              </div>

              <p className="text-sm leading-6 text-slate-600">{comparisonSummaryText}</p>

              <p className="text-sm text-slate-500">
                Snittintensitet 4 veckor:{" "}
                {comparisonLogs.length > 0
                  ? `RPE ${formatMetricNumber(averageRecentIntensity)}`
                  : "saknas ännu"}
              </p>
            </div>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              The Science Minute
            </p>
            <div className="mt-3 text-base leading-7 text-slate-800">
              {analysis?.scienceMinute?.trim() ? (
                <p>{analysis.scienceMinute}</p>
              ) : (
                getScienceMinute({
                  durationMinutes,
                  goal,
                  intensityScore,
                  timedExercises,
                })
              )}
            </div>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              Mer coachning
            </p>

            <div className="mt-4 grid gap-3">
              {trafficLights.map((item) => (
                <article
                  key={item.title}
                  className={cn("rounded-3xl border p-4", item.accentClassName)}
                >
                  <div className="flex items-start gap-3">
                    <div className="text-xl">{item.icon}</div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-600">
                        {item.title}
                      </p>
                      <p className="mt-1 text-base font-semibold text-slate-950">
                        {item.area}
                      </p>
                      <p className="mt-2 text-sm leading-6 text-slate-700">
                        {item.action}
                      </p>
                    </div>
                  </div>
                </article>
              ))}
            </div>

            {analysis?.historicalContext?.trim() ? (
              <div className="mt-4 rounded-3xl border border-slate-200 bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Historisk kontext
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-700">
                  {analysis.historicalContext}
                </p>
              </div>
            ) : null}
          </section>
        </div>
      </details>
    </div>
  );
}
