"use client";

import { useEffect, useState } from "react";

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
import { getSimulationProfilePreset } from "@/lib/simulation/profile-presets";
import { runSimulation } from "@/lib/simulation/run-simulation";
import type { SimulationGoal, SimulationReport } from "@/lib/simulation/types";

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

function clampSimulationDays(value: number) {
  // Håll UI och API i samma intervall så användaren ser exakt vad som körs.
  if (!Number.isFinite(value)) {
    return 56;
  }

  return Math.min(84, Math.max(28, Math.round(value)));
}

export default function SimulationPage() {
  const [preset, setPreset] = useState("beginner_hypertrophy");
  const [days, setDays] = useState(56);
  const [seed, setSeed] = useState(42);
  const [goal, setGoal] = useState<SimulationGoal>("hypertrophy");
  const [gymOptions, setGymOptions] = useState<SimulationGymOption[]>([]);
  const [selectedGymId, setSelectedGymId] = useState("");
  const [plannerMode, setPlannerMode] = useState<"synthetic" | "hybrid_ai">("synthetic");
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<SimulationReport | null>(() =>
    runSimulation({ profilePreset: "beginner_hypertrophy", config: { totalDays: 56, randomSeed: 42 } }),
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
          data.gyms.map((gym) => ({
            id: String(gym.id),
            name: gym.name,
            // Gymutrustning översätts till samma EquipmentId-nivå som generatorn använder.
            equipmentIds: extractEquipmentIdsFromRecords(gym.equipment ?? [], {
              includeBodyweightFallback: true,
            }),
          })),
        );
      } catch {
        // Simuleringen ska fungera även när användaren inte är inloggad eller DB saknas.
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
            startDate: new Date().toISOString().slice(0, 10),
          },
        }),
      });
      const data = (await response.json()) as { ok?: boolean; report?: SimulationReport };

      if (data.ok && data.report) {
        setDays(data.report.config.totalDays);
        setReport(data.report);
      }
    } finally {
      setLoading(false);
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
          onDaysChange={setDays}
          onGoalChange={setGoal}
          onGymChange={setSelectedGymId}
          onPlannerModeChange={setPlannerMode}
          onPresetChange={setPreset}
          onRun={runRemoteSimulation}
          plannerMode={plannerMode}
          preset={preset}
          report={report}
          selectedGymId={selectedGymId}
          seed={seed}
          onSeedChange={setSeed}
        />

        {report ? (
          <>
            <SimulationSummaryCards evaluation={report.evaluation} />
            <SimulationPlannerStatusCard report={report} />
            <SimulationFlagsPanel evaluation={report.evaluation} />
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
