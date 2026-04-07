"use client";

// AI + historikbaserad avslutssammanfattning.
// Har alltid en lokal fallback så att UX inte blir skör.

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
      title: "Stark träningsstimulans",
      achieved:
        "Du genomförde ett relativt krävande pass som sannolikt ger tydlig signal för fortsatt utveckling.",
      historicalContext:
        "Den lokala fallbacken saknar full historikanalys, men själva passbelastningen ser hög ut.",
      nextStep:
        "Nästa liknande pass bör antingen matcha dagens kvalitet eller vara något lättare för att hålla progressionen hållbar över veckan.",
      nextSessionTiming:
        "Ett nytt liknande styrkepass passar ofta bäst om ungefär 48 timmar.",
      coachNote:
        "För långsiktig progression är det ofta bättre med jämn kvalitet över flera pass än att pressa maximal belastning varje gång.",
    };
  }

  return {
    title: "Bra genomfört pass",
    achieved:
      "Du har byggt vidare på träningsvanan och skapat en användbar träningssignal.",
    historicalContext:
      "Den lokala fallbacken saknar full historikanalys, så råden bygger främst på dagens pass.",
    nextStep:
      "Nästa pass bör försöka skapa liten progression i minst en huvuddel, till exempel fler set, högre vikt eller bättre kvalitet.",
    nextSessionTiming:
      "Nästa pass kan ofta fungera inom 24–48 timmar beroende på hur kroppen känns.",
    coachNote:
      "Små, upprepade förbättringar över tid är ofta mer effektiva än stora hopp mellan enstaka pass.",
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
      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">
        {label}
      </p>
      <p className="mt-2 text-sm leading-6 text-slate-700">{text}</p>
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
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">
            Träningsanalys
          </p>
          <h2 className="mt-2 text-xl font-semibold tracking-tight text-slate-900">
            {analysis.title}
          </h2>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">
          {loading ? "Analyserar..." : source === "ai" ? "AI + historik" : "Fallback"}
        </div>
      </div>

      <div className="mt-4 grid gap-3">
        <AnalysisBlock label="Det här uppnådde du" text={analysis.achieved} />
        <AnalysisBlock
          label="I relation till din historik"
          text={analysis.historicalContext}
        />
        <AnalysisBlock label="Plan framåt" text={analysis.nextStep} />
        <AnalysisBlock label="När nästa pass?" text={analysis.nextSessionTiming} />
        <AnalysisBlock label="PT-råd" text={analysis.coachNote} />
      </div>
    </section>
  );
}