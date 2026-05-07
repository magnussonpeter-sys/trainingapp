"use client";

import { useEffect, useMemo, useState } from "react";

import SimulationControls from "@/components/simulation/simulation-controls";
import SimulationDebugTable from "@/components/simulation/simulation-debug-table";
import SimulationExerciseFrequencyChart from "@/components/simulation/simulation-exercise-frequency-chart";
import SimulationFlagsPanel from "@/components/simulation/simulation-flags-panel";
import SimulationLoadChart from "@/components/simulation/simulation-load-chart";
import SimulationPlannerStatusCard from "@/components/simulation/simulation-planner-status-card";
import SimulationProgressChart from "@/components/simulation/simulation-progress-chart";
import SimulationReadinessChart from "@/components/simulation/simulation-readiness-chart";
import SimulationSummaryCards from "@/components/simulation/simulation-summary-cards";
import type { SimulationGymOption } from "@/components/simulation/simulation-controls";
import { extractEquipmentIdsFromRecords } from "@/lib/equipment";
import { buildSimulationAnalysisExport } from "@/lib/simulation/build-analysis-export";
import { getSimulationProfilePreset } from "@/lib/simulation/profile-presets";
import { runSimulation } from "@/lib/simulation/run-simulation";
import type {
  SimulationGoal,
  SimulationPlannerMode,
  SimulationReport,
  SimulationScenario,
} from "@/lib/simulation/types";

type ApiGym = {
  id: number | string;
  name: string;
  equipment?: Array<{
    equipment_type?: string | null;
    equipmentType?: string | null;
    label?: string | null;
    name?: string | null;
    type?: string | null;
  }>;
};

const SIMULATION_ONLY_GYM: SimulationGymOption = {
  id: "simulation:dumbbells-bench-rings",
  name: "Simulation: Hantlar, bänk och ringar",
  // Ett fast simulationsgym gör det lätt att reproducera samma utrustningsmiljö.
  equipmentIds: ["dumbbells", "bench", "rings"],
};

function clampSimulationDays(value: number) {
  // Tillåt korta veckotester när simulationen använder riktiga AI-anrop.
  if (!Number.isFinite(value)) {
    return 14;
  }

  return Math.min(84, Math.max(7, Math.round(value)));
}

function normalizeSimulationReport(report: SimulationReport): SimulationReport {
  return {
    ...report,
    plannedWorkoutDayIndices: Array.isArray(report.plannedWorkoutDayIndices)
      ? report.plannedWorkoutDayIndices
      : [],
    plannedWorkoutDayLabels: Array.isArray(report.plannedWorkoutDayLabels)
      ? report.plannedWorkoutDayLabels
      : [],
    notes: Array.isArray(report.notes) ? report.notes : [],
  };
}

function buildInitialSimulationReport(): SimulationReport | null {
  try {
    return normalizeSimulationReport(
      runSimulation({
        profilePreset: "beginner_hypertrophy",
        config: {
          totalDays: 14,
          randomSeed: 42,
          startDate: new Date().toISOString().slice(0, 10),
          scenario: "normal",
          plannedWorkoutDayIndices: [1, 3, 5],
        },
      }),
    );
  } catch (error) {
    // En simulationssida ska falla tillbaka till tomt läge hellre än att hela sidan kraschar.
    console.error("Could not build initial simulation report:", error);
    return null;
  }
}

export default function SimulationPage() {
  const [preset, setPreset] = useState("beginner_hypertrophy");
  const [days, setDays] = useState(14);
  const [seed, setSeed] = useState(42);
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [scenario, setScenario] = useState<SimulationScenario>("normal");
  const [goal, setGoal] = useState<SimulationGoal>("hypertrophy");
  const [gymOptions, setGymOptions] = useState<SimulationGymOption[]>([]);
  const [selectedGymId, setSelectedGymId] = useState("");
  const [plannerMode, setPlannerMode] = useState<SimulationPlannerMode>("synthetic");
  const [maxAiGeneratedWorkouts, setMaxAiGeneratedWorkouts] = useState(4);
  const [plannedWorkoutDayIndices, setPlannedWorkoutDayIndices] = useState<number[]>([1, 3, 5]);
  const [loading, setLoading] = useState(false);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "error">("idle");
  const [showExport, setShowExport] = useState(false);
  const [report, setReport] = useState<SimulationReport | null>(buildInitialSimulationReport);
  const analysisExport = useMemo(
    () => (report ? buildSimulationAnalysisExport(report) : ""),
    [report],
  );

  useEffect(() => {
    let isMounted = true;

    async function loadGyms() {
      try {
        const response = await fetch("/api/gyms", {
          cache: "no-store",
          credentials: "include",
        });
        const data = (await response.json().catch(() => null)) as
          | { ok?: boolean; gyms?: ApiGym[] }
          | null;

        if (!isMounted || !data?.ok || !Array.isArray(data.gyms)) {
          return;
        }

        setGymOptions(
          [
            SIMULATION_ONLY_GYM,
            ...data.gyms.map((gym) => ({
              id: String(gym.id),
              name: gym.name,
              // Gymutrustning översätts till samma EquipmentId-nivå som generatorn använder.
              equipmentIds: extractEquipmentIdsFromRecords(gym.equipment ?? [], {
                includeBodyweightFallback: true,
              }),
            })),
          ],
        );
      } catch {
        // Simuleringen ska fungera även när användaren inte är inloggad eller DB saknas.
        setGymOptions([SIMULATION_ONLY_GYM]);
      }
    }

    void loadGyms();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const profile = getSimulationProfilePreset(preset);
    setGoal(profile.goal);
  }, [preset]);

  function handlePlannerModeChange(mode: SimulationPlannerMode) {
    setPlannerMode(mode);

    if (mode === "full_app_chain" && days > 14) {
      // Håll första körningen kort när riktiga AI-anrop används.
      setDays(14);
    }
  }

  async function runRemoteSimulation() {
    setLoading(true);

    try {
      const normalizedDays = clampSimulationDays(days);
      const profile = {
        ...getSimulationProfilePreset(preset),
        goal,
      };
      const selectedGym = gymOptions.find((gym) => gym.id === selectedGymId);
      const simulationProfile = selectedGym
        ? {
            ...profile,
            availableGymId: Number.isFinite(Number(selectedGym.id))
              ? Number(selectedGym.id)
              : null,
            availableEquipmentIds: selectedGym.equipmentIds,
          }
        : profile;
      const response = await fetch("/api/simulation/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profile: simulationProfile,
          config: {
            totalDays: normalizedDays,
            randomSeed: seed,
            plannerMode,
            enablePlannerDebug: true,
            startDate,
            scenario,
            plannedWorkoutDayIndices,
            maxAiGeneratedWorkouts,
          },
        }),
      });
      const data = (await response.json()) as { ok?: boolean; report?: SimulationReport };

      if (data.ok && data.report) {
        const normalizedReport = normalizeSimulationReport(data.report);
        setDays(normalizedReport.config.totalDays);
        setReport(normalizedReport);
        setCopyStatus("idle");
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleCopyAnalysisExport() {
    try {
      await navigator.clipboard.writeText(analysisExport);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("error");
    }
  }

  return (
    <main className="min-h-screen bg-[#f6f7f2] px-4 py-6 text-slate-950 sm:px-6">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
        <SimulationControls
          days={days}
          goal={goal}
          gymOptions={gymOptions}
          loading={loading}
          onPlannedWorkoutDayIndicesChange={setPlannedWorkoutDayIndices}
          onDaysChange={setDays}
          onGoalChange={setGoal}
          onGymChange={setSelectedGymId}
          onMaxAiGeneratedWorkoutsChange={setMaxAiGeneratedWorkouts}
          onPlannerModeChange={handlePlannerModeChange}
          onPresetChange={setPreset}
          onRun={runRemoteSimulation}
          onScenarioChange={setScenario}
          onStartDateChange={setStartDate}
          maxAiGeneratedWorkouts={maxAiGeneratedWorkouts}
          plannerMode={plannerMode}
          plannedWorkoutDayIndices={plannedWorkoutDayIndices}
          preset={preset}
          report={report}
          scenario={scenario}
          selectedGymId={selectedGymId}
          seed={seed}
          onSeedChange={setSeed}
          startDate={startDate}
        />

        {report ? (
          <>
            <SimulationSummaryCards evaluation={report.evaluation} />
            <SimulationPlannerStatusCard report={report} />
            <SimulationFlagsPanel evaluation={report.evaluation} />
            <section className="rounded-[32px] border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold text-slate-950">Analys-export</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Kopiera en kompakt export för att låta ChatGPT granska veckoplanering, AI-pass och historik.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setShowExport((value) => !value)}
                    className="min-h-11 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-medium text-slate-700"
                  >
                    {showExport ? "Dölj export" : "Visa export"}
                  </button>
                  <button
                    type="button"
                    onClick={handleCopyAnalysisExport}
                    className="min-h-11 rounded-2xl bg-emerald-700 px-4 text-sm font-semibold text-white"
                  >
                    Kopiera analys-export
                  </button>
                </div>
              </div>
              <p className="mt-3 text-xs text-slate-500">
                {copyStatus === "copied"
                  ? "Exporten kopierades."
                  : copyStatus === "error"
                    ? "Kunde inte kopiera exporten automatiskt."
                    : `Planner mode: ${report.config.plannerMode}. AI-pass: ${report.aiGeneratedWorkoutCount ?? 0}, fallback/mock: ${report.aiFallbackWorkoutCount ?? 0}.`}
              </p>
              {showExport ? (
                <pre className="mt-4 max-h-[420px] overflow-auto rounded-3xl border border-slate-200 bg-slate-50 p-4 text-xs leading-5 text-slate-700 whitespace-pre-wrap">
                  {analysisExport}
                </pre>
              ) : null}
            </section>
            <div className="grid gap-5 lg:grid-cols-2">
              <SimulationReadinessChart points={report.timeSeries} />
              <SimulationProgressChart points={report.timeSeries} />
              <SimulationLoadChart points={report.timeSeries} />
              <SimulationExerciseFrequencyChart aggregates={report.exerciseAggregates} />
            </div>
            <SimulationDebugTable
              plannerDebug={report.plannerDebug}
              snapshots={report.dailySnapshots}
            />
          </>
        ) : null}
      </div>
    </main>
  );
}
