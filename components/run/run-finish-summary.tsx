"use client";

// AI + historikbaserad avslutssammanfattning.
// Fokus:
// - kort, kärnfull och lättläst feedback
// - större text för mobil
// - alltid en stabil lokal fallback

import { useEffect, useMemo, useState } from "react";

type RunFinishSummaryProps = {
  userId: string;
  totalCompletedSets: number;
  totalVolume: number;
  timedExercises: number;
  durationMinutes: number;
  workoutName: string;
};

type FinishAnalysis = {
  title: string;
  achieved: string;
  historicalContext: string;
  nextStep: string;
  nextSessionTiming: string;
  coachNote: string;
};

function getLocalFallback({
  totalCompletedSets,
  totalVolume,
  durationMinutes,
}: {
  totalCompletedSets: number;
  totalVolume: number;
  durationMinutes: number;
}): FinishAnalysis {
  const heavySession =
    totalCompletedSets >= 16 || totalVolume >= 5000 || durationMinutes >= 70;

  if (heavySession) {
    return {
      title: "Stark träningsstimulus",
      achieved:
        "Du genomförde ett tungt pass som sannolikt ger bra effekt för fortsatt utveckling.",
      historicalContext:
        "Passet ser tyngre ut än ett genomsnittligt vardagspass och talar för att belastningen var hög.",
      nextStep:
        "Nästa pass bör vara lika bra tekniskt, men inte nödvändigtvis tyngre.",
      nextSessionTiming:
        "Sikta på nästa liknande pass om ungefär 48 timmar.",
      coachNote:
        "Bygg vidare med små steg i belastning eller volym, inte stora hopp.",
    };
  }

  return {
    title: "Bra genomfört pass",
    achieved:
      "Du skapade en användbar träningsstimulus och byggde vidare på din träningsnivå.",
    historicalContext:
      "Passet ser ut att ligga i ett rimligt spann för fortsatt progression.",
    nextStep:
      "Försök skapa liten progression nästa gång i en huvudövning.",
    nextSessionTiming:
      "Nästa pass kan ofta fungera inom 24–48 timmar.",
    coachNote:
      "Jämn kvalitet över flera pass är ofta viktigare än ett enstaka toppass.",
    };
}

function AnalysisBlock({
  label,
  text,
}: {
  label: string;
  text: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-base leading-7 text-slate-800 sm:text-[17px]">
        {text}
      </p>
    </div>
  );
}

export default function RunFinishSummary({
  userId,
  totalCompletedSets,
  totalVolume,
  timedExercises,
  durationMinutes,
  workoutName,
}: RunFinishSummaryProps) {
  const fallback = useMemo(() => {
    return getLocalFallback({
      totalCompletedSets,
      totalVolume,
      durationMinutes,
    });
  }, [durationMinutes, totalCompletedSets, totalVolume]);

  const [analysis, setAnalysis] = useState<FinishAnalysis>(fallback);
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState<"ai" | "fallback">("fallback");

  useEffect(() => {
    let isMounted = true;

    async function loadAnalysis() {
      try {
        setLoading(true);

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
          }),
        });

        const data = (await response.json().catch(() => null)) as
          | {
              ok?: boolean;
              source?: "ai" | "fallback";
              analysis?: FinishAnalysis;
            }
          | null;

        if (!isMounted) {
          return;
        }

        if (response.ok && data?.ok && data.analysis) {
          setAnalysis(data.analysis);
          setSource(data.source === "ai" ? "ai" : "fallback");
          return;
        }

        setAnalysis(fallback);
        setSource("fallback");
      } catch {
        if (!isMounted) {
          return;
        }

        setAnalysis(fallback);
        setSource("fallback");
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    void loadAnalysis();

    return () => {
      isMounted = false;
    };
  }, [
    durationMinutes,
    fallback,
    timedExercises,
    totalCompletedSets,
    totalVolume,
    userId,
    workoutName,
  ]);

  return (
    <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            Träningsanalys
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 sm:text-[30px]">
            {analysis.title}
          </h2>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600">
          {loading ? "Analyserar..." : source === "ai" ? "AI + historik" : "Fallback"}
        </div>
      </div>

      <div className="mt-4 grid gap-3">
        <AnalysisBlock label="Det här gav passet" text={analysis.achieved} />
        <AnalysisBlock label="Jämfört med din historik" text={analysis.historicalContext} />
        <AnalysisBlock label="Plan framåt" text={analysis.nextStep} />
        <AnalysisBlock label="När nästa pass?" text={analysis.nextSessionTiming} />
        <AnalysisBlock label="PT-råd" text={analysis.coachNote} />
      </div>
    </section>
  );
}