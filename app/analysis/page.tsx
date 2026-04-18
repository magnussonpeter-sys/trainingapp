"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import AnalysisInsightsAccordion from "@/components/analysis/analysis-insights-accordion";
import AnalysisMetricCard from "@/components/analysis/analysis-metric-card";
import AnalysisNextSteps from "@/components/analysis/analysis-next-steps";
import AnalysisSummaryCard from "@/components/analysis/analysis-summary-card";
import AnalysisTrendChart from "@/components/analysis/analysis-trend-chart";
import { buildAnalysisData } from "@/lib/analysis/build-analysis-data";
import type { AnalysisData } from "@/lib/analysis/analysis-types";
import type { WorkoutLog } from "@/lib/workout-log-storage";
import { getWorkoutLogs } from "@/lib/workout-log-storage";
import { uiButtonClasses } from "@/lib/ui/button-classes";
import { uiCardClasses } from "@/lib/ui/card-classes";
import { uiPageShellClasses } from "@/lib/ui/page-shell-classes";

type AuthUser = {
  id: number | string;
  email: string | null;
  username?: string | null;
  name?: string | null;
  displayName?: string | null;
};

type UserSettingsSummary = {
  training_goal?: string | null;
};

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function mergeWorkoutLogs(apiLogs: WorkoutLog[], localLogs: WorkoutLog[]) {
  const merged = [...apiLogs];
  const seen = new Set(
    apiLogs.map((log) => `${log.workoutName}:${log.completedAt}:${log.status}`),
  );

  for (const log of localLogs) {
    const key = `${log.workoutName}:${log.completedAt}:${log.status}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    merged.push(log);
  }

  return merged.sort((a, b) => {
    return new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime();
  });
}

function getStatusExtra(data: AnalysisData) {
  return {
    strength: (
      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
        {data.strengthProgress.driverLabels.length > 0
          ? `Driver främst från: ${data.strengthProgress.driverLabels.join(", ")}`
          : "Fler återkommande belastade övningar behövs för tydliga drivare."}
      </div>
    ),
    hypertrophy: (
      <div className="grid grid-cols-2 gap-2">
        {data.hypertrophyDose.groups.map((group) => (
          <div
            key={group.key}
            className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm"
          >
            <p className="font-medium text-slate-900">{group.label}</p>
            <p className="mt-1 text-slate-600">
              {group.averageWeeklySets} set / vecka
            </p>
          </div>
        ))}
      </div>
    ),
  };
}

export default function AnalysisPage() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [logs, setLogs] = useState<WorkoutLog[]>([]);
  const [settings, setSettings] = useState<UserSettingsSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadAnalysis() {
      try {
        setError(null);

        const authRes = await fetch("/api/auth/me", {
          cache: "no-store",
          credentials: "include",
        });

        let authData: unknown = null;
        try {
          authData = await authRes.json();
        } catch {
          authData = null;
        }

        if (
          !authRes.ok ||
          !authData ||
          typeof authData !== "object" ||
          !("user" in authData) ||
          !(authData as { user?: unknown }).user
        ) {
          router.replace("/");
          return;
        }

        const user = (authData as { user: AuthUser }).user;
        const userId = String(user.id);

        const [logsRes, settingsRes] = await Promise.all([
          fetch(`/api/workout-logs?userId=${encodeURIComponent(userId)}&limit=80`, {
            cache: "no-store",
            credentials: "include",
          }),
          fetch(`/api/user-settings?userId=${encodeURIComponent(userId)}`, {
            cache: "no-store",
            credentials: "include",
          }),
        ]);

        const logsData = await logsRes.json().catch(() => null);
        const settingsData = await settingsRes.json().catch(() => null);
        const localLogs = getWorkoutLogs(userId);
        const apiLogs =
          logsRes.ok && logsData?.ok && Array.isArray(logsData.logs)
            ? (logsData.logs as WorkoutLog[])
            : [];

        if (!isMounted) {
          return;
        }

        setAuthUser(user);
        setLogs(mergeWorkoutLogs(apiLogs, localLogs));
        setSettings(
          settingsRes.ok && settingsData?.ok && settingsData.settings
            ? (settingsData.settings as UserSettingsSummary)
            : null,
        );
      } catch (loadError) {
        console.error("Failed to load analysis page", loadError);

        if (!isMounted) {
          return;
        }

        setError("Kunde inte läsa analysdata just nu.");
      } finally {
        if (isMounted) {
          setAuthChecked(true);
        }
      }
    }

    void loadAnalysis();

    return () => {
      isMounted = false;
    };
  }, [router]);

  const analysis = useMemo(() => {
    return buildAnalysisData({
      logs,
      settings,
    });
  }, [logs, settings]);

  const extra = getStatusExtra(analysis);

  if (!authChecked) {
    return (
      <main className={uiPageShellClasses.page}>
        <div className={uiPageShellClasses.content}>
          <section className={cn(uiCardClasses.section, uiCardClasses.sectionPadded)}>
            <p className="text-sm text-slate-600">Laddar analys...</p>
          </section>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className={uiPageShellClasses.page}>
        <div className={uiPageShellClasses.content}>
          <section className={cn(uiCardClasses.section, uiCardClasses.sectionPadded)}>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-950">
              Kunde inte visa analysen
            </h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">{error}</p>
            <button
              type="button"
              onClick={() => router.push("/home")}
              className={cn(uiButtonClasses.primary, "mt-4")}
            >
              Till hem
            </button>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className={uiPageShellClasses.page}>
      <div className={cn(uiPageShellClasses.content, "pb-8")}>
        <div className="space-y-5">
          <section className={cn(uiCardClasses.base, uiCardClasses.padded)}>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
              Analys
            </p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">
              Så utvecklas din träning just nu
            </h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Följ styrkeprogress, träningsdos och återhämtningssignal med tydliga
              delanalyser.
            </p>
            {authUser ? (
              <p className="mt-3 text-xs text-slate-400">
                Analysen bygger på {analysis.dataQuality.completedWorkoutCount} genomförda pass
                för {authUser.displayName ?? authUser.name ?? "dig"}.
              </p>
            ) : null}
          </section>

          <AnalysisSummaryCard summary={analysis.summary} />

          {analysis.dataQuality.message ? (
            <section className={cn(uiCardClasses.base, uiCardClasses.padded)}>
              <h2 className="text-lg font-semibold text-slate-950">Mer data behövs för full analys</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                {analysis.dataQuality.message}
              </p>
            </section>
          ) : null}

          <div className="space-y-4">
            <AnalysisMetricCard data={analysis.strengthProgress} extra={extra.strength} />
            <AnalysisMetricCard data={analysis.hypertrophyDose} extra={extra.hypertrophy} />
            <AnalysisMetricCard data={analysis.recoverySignal} />
          </div>

          <AnalysisTrendChart trends={analysis.trends} />
          <AnalysisNextSteps nextSteps={analysis.nextSteps} />
          <AnalysisInsightsAccordion data={analysis} />
        </div>
      </div>
    </main>
  );
}
