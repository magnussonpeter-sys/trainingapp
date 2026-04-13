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

type HeroMetric = {
  label: string;
  value: string;
  helper: string;
};

type TrafficLightItem = {
  accentClassName: string;
  icon: string;
  title: string;
  area: string;
  action: string;
};

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
    return "Nästa gång: bygg vidare med en liten ökning i en huvudövning om tekniken känns stabil.";
  }

  const lastSet = exercise.sets[exercise.sets.length - 1];
  const hasWeight =
    typeof lastSet?.actualWeight === "number" && Number.isFinite(lastSet.actualWeight);

  if (exercise.plannedDuration && !exercise.plannedReps) {
    if (exercise.timedEffort === "light") {
      return `Nästa gång: lägg på 5-10 sek i ${exercise.exerciseName.toLowerCase()} eller öka tempot något.`;
    }

    return `Nästa gång: håll samma tid i ${exercise.exerciseName.toLowerCase()} men försök få bättre kontroll eller något jämnare tempo.`;
  }

  if (hasWeight && (exercise.extraReps === 4 || exercise.extraReps === 6)) {
    return `Nästa gång: addera 2.5 kg eller nästa tillgängliga viktsteg i ${exercise.exerciseName.toLowerCase()}.`;
  }

  if (hasWeight) {
    return `Nästa gång: behåll vikten i ${exercise.exerciseName.toLowerCase()} och sikta på 1-2 fler reps med samma kvalitet.`;
  }

  if (exercise.extraReps === 4 || exercise.extraReps === 6) {
    return `Nästa gång: lägg till 2 reps i ${exercise.exerciseName.toLowerCase()} eller ett extra set om passet fortfarande känns kontrollerat.`;
  }

  return `Nästa gång: försök matcha dagens kvalitet i ${exercise.exerciseName.toLowerCase()} innan du ökar vidare.`;
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

function MetricBubble({ helper, label, value }: HeroMetric) {
  return (
    <div className="flex h-28 flex-col items-center justify-center rounded-full border border-slate-200 bg-white text-center shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-2xl font-bold text-slate-950">{value}</p>
      <p className="mt-1 max-w-[8rem] text-xs leading-5 text-slate-500">{helper}</p>
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

  useEffect(() => {
    const currentLessPreferences = getExercisePreferences(userId)
      .filter((entry) => entry.preference === "less_often")
      .map((entry) => entry.exerciseId);

    setLessPreferenceIds(currentLessPreferences);
  }, [userId]);

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

  const heroMetrics: HeroMetric[] = [
    {
      label: "Volym",
      value: `${Math.round(totalVolume)} kg`,
      helper: "Total vikt lyft",
    },
    {
      label: "Intensitet",
      value: `RPE ${formatMetricNumber(intensityScore)}`,
      helper: "Genomsnittlig ansträngning",
    },
    {
      label: "Tempo",
      value: `${durationMinutes} min`,
      helper: "Passets längd",
    },
    {
      label: "Set",
      value: String(totalCompletedSets),
      helper: "Genomförda arbetsset",
    },
  ];

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
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-white px-4 py-2 text-sm font-semibold text-emerald-800">
              <span className="text-base">✓</span>
              Passet genomfört
            </div>

            <h2 className="mt-4 text-3xl font-bold tracking-tight text-slate-950">
              Den snabba blicken
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {workoutName} är klart. Här ser du direkt hur passet landade utan att behöva
              tolka en massa text.
            </p>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              Progress
            </p>
            <p className="mt-1 text-lg font-semibold text-slate-950">
              {comparisonPercent >= 105
                ? "Progress uppnådd"
                : comparisonPercent >= 95
                  ? "I fas med snittet"
                  : "Stabil arbetsinsats"}
            </p>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {heroMetrics.map((metric) => (
            <MetricBubble key={metric.label} {...metric} />
          ))}
        </div>
      </section>

      <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              Prestationsgraf
            </p>
            <h3 className="mt-2 text-xl font-semibold text-slate-950">
              Dagens pass jämfört med snittet
            </h3>
          </div>

          <div className="rounded-2xl bg-slate-100 px-3 py-2 text-right">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              4 veckor
            </p>
            <p className="text-sm font-semibold text-slate-900">
              {benchmark.average > 0
                ? `${formatMetricNumber(benchmark.average)} ${benchmark.unit}`
                : "Saknar snitt"}
            </p>
          </div>
        </div>

        <div className="mt-5 space-y-3">
          <div className="flex items-center justify-between text-sm text-slate-600">
            <span>Dagens {benchmark.label}</span>
            <span className="font-semibold text-slate-900">
              {formatMetricNumber(benchmark.current)} {benchmark.unit}
            </span>
          </div>

          <div className="h-4 overflow-hidden rounded-full bg-slate-100">
            <div
              className={cn(
                "h-full rounded-full bg-gradient-to-r from-emerald-500 to-cyan-500 transition-all",
              )}
              style={{ width: `${progressWidth}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-500">
              {benchmark.average > 0
                ? `Det här är ${comparisonPercent}% av ditt 4-veckorssnitt.`
                : "Det här blir din första referenspunkt för kommande jämförelser."}
            </span>
            <span className="font-semibold text-slate-900">
              Snittintensitet 4 veckor:{" "}
              {comparisonLogs.length > 0 ? `RPE ${formatMetricNumber(averageRecentIntensity)}` : "saknas"}
            </span>
          </div>
        </div>
      </section>

      <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
          The Science Minute
        </p>
        <div className="mt-3 text-base leading-7 text-slate-800 sm:text-[17px]">
          {getScienceMinute({
            durationMinutes,
            goal,
            intensityScore,
            timedExercises,
          })}
        </div>
      </section>

      <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
          Trafikljusmodellen
        </p>
        <div className="mt-4 grid gap-3">
          {trafficLights.map((item) => (
            <article
              key={item.title}
              className={cn("rounded-3xl border p-4", item.accentClassName)}
            >
              <div className="grid gap-3 sm:grid-cols-[auto_minmax(0,1fr)_minmax(0,2fr)] sm:items-start">
                <div className="text-2xl">{item.icon}</div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-600">
                    {item.title}
                  </p>
                  <p className="mt-1 text-lg font-semibold text-slate-950">{item.area}</p>
                </div>
                <p className="text-sm leading-6 text-slate-700">{item.action}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              Frivillig feedback
            </p>
            <h3 className="mt-2 text-xl font-semibold text-slate-950">
              Vill du ha mindre av någon övning framöver?
            </h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Valfritt. Din markering sparas direkt och hindrar inte att du går vidare.
            </p>
          </div>
        </div>

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
    </div>
  );
}
