"use client";

import type { SimulationGoal, SimulationReport } from "@/lib/simulation/types";

export type SimulationGymOption = {
  id: string;
  name: string;
  equipmentIds: string[];
};

function clampDays(value: number) {
  // Samma gräns som simulationsmotorn använder, så fältet inte visar ett annat värde.
  if (!Number.isFinite(value)) {
    return 56;
  }

  return Math.min(84, Math.max(28, Math.round(value)));
}

type SimulationControlsProps = {
  days: number;
  goal: SimulationGoal;
  gymOptions: SimulationGymOption[];
  loading: boolean;
  onDaysChange: (days: number) => void;
  onGoalChange: (goal: SimulationGoal) => void;
  onGymChange: (gymId: string) => void;
  onPlannerModeChange: (mode: "synthetic" | "hybrid_ai") => void;
  onPresetChange: (preset: string) => void;
  onRun: () => void;
  plannerMode: "synthetic" | "hybrid_ai";
  preset: string;
  report: SimulationReport | null;
  selectedGymId: string;
  seed: number;
  onSeedChange: (seed: number) => void;
};

const PRESETS = [
  ["beginner_hypertrophy", "Beginner hypertrophy"],
  ["intermediate_strength", "Intermediate strength"],
  ["busy_inconsistent", "Busy inconsistent"],
  ["low_recovery_stressed", "Low recovery stressed"],
];

export default function SimulationControls(props: SimulationControlsProps) {
  return (
    <section className="rounded-[32px] border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
        Simuleringslabb
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
        Modelltest över tid
      </h1>
      <p className="mt-3 text-sm leading-6 text-slate-600">
        Kör en deterministisk virtuell användare dag för dag. Första versionen använder en intern syntetisk träningsmodell.
      </p>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <label className="grid gap-2 text-sm font-medium text-slate-700">
          Profil
          <select
            value={props.preset}
            onChange={(event) => props.onPresetChange(event.target.value)}
            className="min-h-12 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-slate-950 outline-none focus:border-emerald-400"
          >
            {PRESETS.map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <label className="grid gap-2 text-sm font-medium text-slate-700">
          Gym
          <select
            value={props.selectedGymId}
            onChange={(event) => props.onGymChange(event.target.value)}
            className="min-h-12 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-slate-950 outline-none focus:border-emerald-400"
          >
            <option value="">Preset-utrustning</option>
            {props.gymOptions.map((gym) => (
              <option key={gym.id} value={gym.id}>
                {gym.name}
              </option>
            ))}
          </select>
          <span className="text-xs font-normal text-slate-500">
            Valet påverkar den syntetiska övningspoolen i simuleringen.
          </span>
        </label>

        <label className="grid gap-2 text-sm font-medium text-slate-700">
          Mål
          <select
            value={props.goal}
            onChange={(event) => props.onGoalChange(event.target.value as SimulationGoal)}
            className="min-h-12 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-slate-950 outline-none focus:border-emerald-400"
          >
            <option value="strength">Styrka</option>
            <option value="hypertrophy">Hypertrofi</option>
            <option value="body_composition">Kroppssammansättning</option>
            <option value="health">Hälsa</option>
          </select>
        </label>

        <label className="grid gap-2 text-sm font-medium text-slate-700">
          Antal dagar (28-84)
          <input
            min={28}
            max={84}
            type="number"
            value={props.days}
            onChange={(event) => props.onDaysChange(Number(event.target.value))}
            onBlur={(event) => props.onDaysChange(clampDays(Number(event.target.value)))}
            className="min-h-12 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-slate-950 outline-none focus:border-emerald-400"
          />
        </label>

        <label className="grid gap-2 text-sm font-medium text-slate-700">
          Random seed
          <input
            min={1}
            type="number"
            value={props.seed}
            onChange={(event) => props.onSeedChange(Number(event.target.value))}
            className="min-h-12 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-slate-950 outline-none focus:border-emerald-400"
          />
        </label>

        <label className="grid gap-2 text-sm font-medium text-slate-700">
          Planeringsläge
          <select
            value={props.plannerMode}
            onChange={(event) =>
              props.onPlannerModeChange(event.target.value as "synthetic" | "hybrid_ai")
            }
            className="min-h-12 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-slate-950 outline-none focus:border-emerald-400"
          >
            <option value="synthetic">Syntetisk snabbmodell</option>
            <option value="hybrid_ai">Hybrid: AI föreslår pass</option>
          </select>
          <span className="text-xs font-normal text-slate-500">
            Hybrid använder OpenAI på planerade passdagar och kan därför ta längre tid.
          </span>
        </label>
      </div>

      <button
        type="button"
        onClick={props.onRun}
        disabled={props.loading}
        className="mt-5 min-h-12 w-full rounded-2xl bg-emerald-700 px-5 py-3 text-sm font-semibold text-white shadow-sm transition disabled:opacity-60"
      >
        {props.loading ? "Kör simulering..." : "Kör simulering"}
      </button>

      {props.report ? (
        <p className="mt-3 text-xs text-slate-500">
          Senaste körning: {props.report.config.totalDays} dagar, seed{" "}
          {props.report.config.randomSeed},{" "}
          {props.report.config.plannerMode === "hybrid_ai" ? "hybrid AI" : "syntetisk modell"}.
        </p>
      ) : null}
    </section>
  );
}
