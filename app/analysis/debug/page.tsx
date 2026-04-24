"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import {
  getAiDebugGeneratedWorkoutHistory,
} from "@/lib/analysis/ai-debug-generated-history";
import { buildAiDebugExport } from "@/lib/analysis/build-ai-debug-export";
import { formatAiDebugPrompt } from "@/lib/analysis/format-ai-debug-prompt";
import { formatAiDebugSummary } from "@/lib/analysis/format-ai-debug-summary";
import type {
  AiDebugExportOptions,
  StoredAiGeneratedWorkoutSnapshot,
} from "@/lib/analysis/ai-debug-types";
import { getAllExerciseProgression } from "@/lib/progression-store";
import { uiButtonClasses } from "@/lib/ui/button-classes";
import { uiCardClasses } from "@/lib/ui/card-classes";
import { uiPageShellClasses } from "@/lib/ui/page-shell-classes";
import {
  getGeneratedWorkout,
} from "@/lib/workout-storage";
import type { WorkoutLog } from "@/lib/workout-log-storage";
import { getWorkoutLogs } from "@/lib/workout-log-storage";
import {
  getWorkoutDraft,
} from "@/lib/workout-flow/workout-draft-store";
import type { Workout } from "@/types/workout";

type AuthUser = {
  id: number | string;
  email: string | null;
  username?: string | null;
  name?: string | null;
  displayName?: string | null;
};

type UserSettingsResponse = {
  training_goal?: string | null;
  sex?: string | null;
  age?: number | null;
  height_cm?: number | null;
  weight_kg?: number | null;
  experience_level?: string | null;
  primary_priority_muscle?: string | null;
  secondary_priority_muscle?: string | null;
  tertiary_priority_muscle?: string | null;
};

type GymResponse = {
  id: string | number;
  name: string;
  equipment?: Array<Record<string, unknown>>;
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

function formatApproxSize(value: string) {
  const byteCount = new Blob([value]).size;
  const kb = byteCount / 1024;

  if (kb < 1024) {
    return `${kb.toFixed(1)} KB`;
  }

  return `${(kb / 1024).toFixed(2)} MB`;
}

function downloadJson(filename: string, content: string) {
  const blob = new Blob([content], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = filename;
  anchor.click();

  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 250);
}

const DEFAULT_OPTIONS: AiDebugExportOptions = {
  exportType: "quick",
  includeLast7Days: false,
  includeLast30Days: true,
  includeGeneratedWorkouts: true,
  includeCompletedWorkouts: true,
  includeProgressionDiagnostics: true,
  includePlannerDiagnostics: true,
  anonymize: true,
};

export default function AnalysisDebugPage() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [settings, setSettings] = useState<UserSettingsResponse | null>(null);
  const [logs, setLogs] = useState<WorkoutLog[]>([]);
  const [gyms, setGyms] = useState<GymResponse[]>([]);
  const [generatedHistory, setGeneratedHistory] = useState<StoredAiGeneratedWorkoutSnapshot[]>([]);
  const [draftWorkout, setDraftWorkout] = useState<Workout | null>(null);
  const [progressionSnapshots, setProgressionSnapshots] = useState<
    Record<string, ReturnType<typeof getAllExerciseProgression>[string]>
  >({});
  const [options, setOptions] = useState<AiDebugExportOptions>(DEFAULT_OPTIONS);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [showJsonPreview, setShowJsonPreview] = useState(true);
  const [showSummaryPreview, setShowSummaryPreview] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function loadPage() {
      try {
        setError(null);

        const authRes = await fetch("/api/auth/me", {
          cache: "no-store",
          credentials: "include",
        });
        const authData = await authRes.json().catch(() => null);

        if (!authRes.ok || !authData?.ok || !authData.user) {
          router.replace("/");
          return;
        }

        const user = authData.user as AuthUser;
        const userId = String(user.id);

        const [logsRes, settingsRes, gymsRes] = await Promise.all([
          fetch(`/api/workout-logs?userId=${encodeURIComponent(userId)}&limit=80`, {
            cache: "no-store",
            credentials: "include",
          }),
          fetch(`/api/user-settings?userId=${encodeURIComponent(userId)}`, {
            cache: "no-store",
            credentials: "include",
          }),
          fetch(`/api/gyms?userId=${encodeURIComponent(userId)}`, {
            cache: "no-store",
            credentials: "include",
          }),
        ]);

        const logsPayload = await logsRes.json().catch(() => null);
        const settingsPayload = await settingsRes.json().catch(() => null);
        const gymsPayload = await gymsRes.json().catch(() => null);
        const apiLogs =
          logsRes.ok && logsPayload?.ok && Array.isArray(logsPayload.logs)
            ? (logsPayload.logs as WorkoutLog[])
            : [];
        const localLogs = getWorkoutLogs(userId);
        const localDraft = getWorkoutDraft(userId) as Workout | null;
        const generatedWorkout = getGeneratedWorkout(userId);
        const localHistory = getAiDebugGeneratedWorkoutHistory(userId);
        const progression = getAllExerciseProgression(userId);

        if (!isMounted) {
          return;
        }

        setAuthUser(user);
        setSettings(
          settingsRes.ok && settingsPayload?.ok
            ? (settingsPayload.settings as UserSettingsResponse | null)
            : null,
        );
        setLogs(mergeWorkoutLogs(apiLogs, localLogs));
        setGyms(
          gymsRes.ok && gymsPayload?.ok && Array.isArray(gymsPayload.gyms)
            ? (gymsPayload.gyms as GymResponse[])
            : [],
        );
        setGeneratedHistory(localHistory);
        setDraftWorkout(localDraft ?? generatedWorkout ?? null);
        setProgressionSnapshots(progression);
      } catch (loadError) {
        console.error("Failed to load analysis debug page", loadError);

        if (isMounted) {
          setError("Kunde inte läsa debugdata just nu.");
        }
      } finally {
        if (isMounted) {
          setAuthChecked(true);
        }
      }
    }

    void loadPage();

    return () => {
      isMounted = false;
    };
  }, [router]);

  const exportData = useMemo(() => {
    return buildAiDebugExport({
      settings,
      logs,
      gyms,
      generatedWorkouts: generatedHistory,
      draftWorkout,
      progressionSnapshots,
      options,
    });
  }, [draftWorkout, generatedHistory, gyms, logs, options, progressionSnapshots, settings]);

  const jsonPreview = useMemo(() => {
    return JSON.stringify(exportData, null, 2);
  }, [exportData]);

  const summaryText = useMemo(() => {
    return formatAiDebugSummary(exportData);
  }, [exportData]);

  const aiPrompt = useMemo(() => {
    return formatAiDebugPrompt(exportData);
  }, [exportData]);

  const previewStats = useMemo(() => {
    return {
      completedWorkouts: exportData.recentCompletedWorkouts.length,
      generatedWorkouts: exportData.recentGeneratedWorkouts.length,
      muscleBudgetCount: exportData.muscleBudgetSnapshot.length,
      exportType: exportData.meta.exportType,
      approxSize: formatApproxSize(jsonPreview),
    };
  }, [exportData, jsonPreview]);

  async function copyToClipboard(value: string, successMessage: string) {
    try {
      await navigator.clipboard.writeText(value);
      setStatusMessage(successMessage);
    } catch {
      setStatusMessage("Kunde inte kopiera automatiskt. Markera och kopiera manuellt.");
    }
  }

  function updateOption<Key extends keyof AiDebugExportOptions>(
    key: Key,
    value: AiDebugExportOptions[Key],
  ) {
    setOptions((previous) => ({
      ...previous,
      [key]: value,
    }));
  }

  if (!authChecked) {
    return (
      <main className={uiPageShellClasses.page}>
        <div className={uiPageShellClasses.content}>
          <section className={cn(uiCardClasses.section, uiCardClasses.sectionPadded)}>
            <p className="text-sm text-slate-600">Laddar analys-debug...</p>
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
              Kunde inte visa debug-exporten
            </h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">{error}</p>
            <button
              type="button"
              onClick={() => router.push("/analysis")}
              className={cn(uiButtonClasses.primary, "mt-4")}
            >
              Till analys
            </button>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className={uiPageShellClasses.page}>
      <div className={cn(uiPageShellClasses.content, "space-y-5 pb-8")}>
        <section className={cn(uiCardClasses.base, uiCardClasses.padded)}>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
            Analysdebug
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">
            Exportera analysunderlag för AI-modellen
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Exportera analysunderlag för att utvärdera hur AI väljer övningar,
            fördelar träningsvolym och föreslår progression.
          </p>
          {authUser ? (
            <p className="mt-3 text-xs text-slate-400">
              Debug-exporten bygger på lokala snapshots samt {logs.length} träningsloggar
              för {authUser.displayName ?? authUser.name ?? "dig"}.
            </p>
          ) : null}
        </section>

        <section className={cn(uiCardClasses.base, uiCardClasses.padded)}>
          <div className="space-y-4">
            <div>
              <p className="text-sm font-semibold text-slate-900">Exporttyp</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => updateOption("exportType", "quick")}
                  className={cn(
                    uiButtonClasses.chip,
                    options.exportType === "quick"
                      ? uiButtonClasses.chipSelected
                      : uiButtonClasses.chipDefault,
                  )}
                >
                  Quick
                </button>
                <button
                  type="button"
                  onClick={() => updateOption("exportType", "full")}
                  className={cn(
                    uiButtonClasses.chip,
                    options.exportType === "full"
                      ? uiButtonClasses.chipSelected
                      : uiButtonClasses.chipDefault,
                  )}
                >
                  Full
                </button>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {[
                ["includeLast7Days", "Inkludera senaste 7 dagar"],
                ["includeLast30Days", "Inkludera senaste 30 dagar"],
                ["includeGeneratedWorkouts", "Inkludera AI-genererade pass"],
                ["includeCompletedWorkouts", "Inkludera genomförda pass"],
                ["includeProgressionDiagnostics", "Inkludera progression diagnostics"],
                ["includePlannerDiagnostics", "Inkludera planner diagnostics"],
                ["anonymize", "Anonymisera data"],
              ].map(([key, label]) => {
                const optionKey = key as keyof AiDebugExportOptions;

                return (
                  <label
                    key={key}
                    className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700"
                  >
                    <span>{label}</span>
                    <input
                      type="checkbox"
                      checked={Boolean(options[optionKey])}
                      onChange={(event) =>
                        updateOption(optionKey, event.target.checked as never)
                      }
                      className="h-4 w-4 rounded border-slate-300 text-lime-500 focus:ring-lime-400"
                    />
                  </label>
                );
              })}
            </div>
          </div>
        </section>

        <section className={cn(uiCardClasses.base, uiCardClasses.padded)}>
          <p className="text-sm font-semibold text-slate-900">Preview</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className={uiCardClasses.soft}>
              <p className="text-xs uppercase tracking-[0.16em] text-slate-400">Genomförda pass</p>
              <p className="mt-2 text-2xl font-semibold text-slate-950">
                {previewStats.completedWorkouts}
              </p>
            </div>
            <div className={uiCardClasses.soft}>
              <p className="text-xs uppercase tracking-[0.16em] text-slate-400">AI-pass</p>
              <p className="mt-2 text-2xl font-semibold text-slate-950">
                {previewStats.generatedWorkouts}
              </p>
            </div>
            <div className={uiCardClasses.soft}>
              <p className="text-xs uppercase tracking-[0.16em] text-slate-400">Muskelgrupper</p>
              <p className="mt-2 text-2xl font-semibold text-slate-950">
                {previewStats.muscleBudgetCount}
              </p>
            </div>
            <div className={uiCardClasses.soft}>
              <p className="text-xs uppercase tracking-[0.16em] text-slate-400">Storlek</p>
              <p className="mt-2 text-2xl font-semibold text-slate-950">
                {previewStats.approxSize}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Typ: {previewStats.exportType}
              </p>
            </div>
          </div>
        </section>

        <section className={cn(uiCardClasses.base, uiCardClasses.padded)}>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => setStatusMessage("Analysunderlaget är uppdaterat.")}
              className={uiButtonClasses.primary}
            >
              Generera analysunderlag
            </button>
            <button
              type="button"
              onClick={() => void copyToClipboard(jsonPreview, "JSON kopierad till clipboard.")}
              className={uiButtonClasses.secondary}
            >
              Kopiera JSON
            </button>
            <button
              type="button"
              onClick={() =>
                downloadJson(
                  `ai-analysis-debug-${new Date().toISOString().slice(0, 10)}.json`,
                  jsonPreview,
                )
              }
              className={uiButtonClasses.secondary}
            >
              Ladda ner JSON
            </button>
            <button
              type="button"
              onClick={() => void copyToClipboard(summaryText, "Textsammafattning kopierad.")}
              className={uiButtonClasses.secondary}
            >
              Generera textsammanfattning
            </button>
            <button
              type="button"
              onClick={() => void copyToClipboard(aiPrompt, "AI-prompt kopierad.")}
              className={uiButtonClasses.secondary}
            >
              Kopiera AI-prompt
            </button>
          </div>
          {statusMessage ? (
            <p className="mt-3 text-sm text-slate-600">{statusMessage}</p>
          ) : null}
        </section>

        {exportData.warnings.length > 0 ? (
          <section className={uiCardClasses.danger}>
            <p className="font-semibold">Warnings</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {exportData.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className={cn(uiCardClasses.base, uiCardClasses.padded)}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">JSON-preview</p>
              <p className="mt-1 text-sm text-slate-600">
                Kompakt eller full export för klistra in till extern AI.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowJsonPreview((previous) => !previous)}
              className={uiButtonClasses.ghost}
            >
              {showJsonPreview ? "Dölj" : "Visa"}
            </button>
          </div>
          {showJsonPreview ? (
            <pre className="mt-4 max-h-[28rem] overflow-auto rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs leading-6 text-slate-800">
              {jsonPreview}
            </pre>
          ) : null}
        </section>

        <section className={cn(uiCardClasses.base, uiCardClasses.padded)}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">Textsammanfattning</p>
              <p className="mt-1 text-sm text-slate-600">
                Kort läsbar sammanfattning för snabb bedömning i ChatGPT.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowSummaryPreview((previous) => !previous)}
              className={uiButtonClasses.ghost}
            >
              {showSummaryPreview ? "Dölj" : "Visa"}
            </button>
          </div>
          {showSummaryPreview ? (
            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <pre className="whitespace-pre-wrap text-sm leading-7 text-slate-800">
                {summaryText}
              </pre>
            </div>
          ) : null}
        </section>

        <section className={cn(uiCardClasses.base, uiCardClasses.padded)}>
          <p className="text-sm font-semibold text-slate-900">AI-prompt</p>
          <p className="mt-1 text-sm text-slate-600">
            Färdig prompt som kan kopieras tillsammans med exporten.
          </p>
          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <pre className="max-h-[22rem] overflow-auto whitespace-pre-wrap text-xs leading-6 text-slate-800">
              {aiPrompt}
            </pre>
          </div>
        </section>
      </div>
    </main>
  );
}
