"use client";

import type {
  SimulationGoal,
  SimulationPlannerMode,
  SimulationReport,
  SimulationScenario,
} from "@/lib/simulation/types";

export type SimulationGymOption = {
  id: string;
  name: string;
  equipmentIds: string[];
};

function clampDays(value: number) {
  // Tillåt kortare körningar så full app-kedja kan testas utan för många AI-anrop.
  if (!Number.isFinite(value)) {
    return 14;
  }

  return Math.min(84, Math.max(7, Math.round(value)));
}

type SimulationControlsProps = {
  days: number;
  goal: SimulationGoal;
  gymOptions: SimulationGymOption[];
  loading: boolean;
  onPlannedWorkoutDayIndicesChange: (indices: number[]) => void;
  onDaysChange: (days: number) => void;
  onGoalChange: (goal: SimulationGoal) => void;
  onGymChange: (gymId: string) => void;
  onMaxAiGeneratedWorkoutsChange: (value: number) => void;
  onPlannerModeChange: (mode: SimulationPlannerMode) => void;
  onPresetChange: (preset: string) => void;
  onRun: () => void;
  onScenarioChange: (scenario: SimulationScenario) => void;
  onStartDateChange: (startDate: string) => void;
  plannerMode: SimulationPlannerMode;
  plannedWorkoutDayIndices: number[];
  preset: string;
  report: SimulationReport | null;
  scenario: SimulationScenario;
  selectedGymId: string;
  seed: number;
  onSeedChange: (seed: number) => void;
  startDate: string;
  maxAiGeneratedWorkouts: number;
};

const PRESETS = [
  ["beginner_hypertrophy", "Beginner hypertrophy"],
  ["intermediate_strength", "Intermediate strength"],
  ["busy_inconsistent", "Busy inconsistent"],
  ["low_recovery_stressed", "Low recovery stressed"],
];

const SCENARIOS: Array<[SimulationScenario, string]> = [
  ["normal", "Normal vecka"],
  ["missed_workouts", "Missade pass"],
  ["short_sessions", "Korta pass"],
  ["spontaneous_lower_before_planned_lower", "Spontant pass före planerad dag"],
  ["high_fatigue", "Hög trötthet"],
  ["low_adherence", "Låg följsamhet"],
  ["priority_upper_body", "Prioritet överkropp"],
];

const WEEKDAY_OPTIONS = [
  { index: 1, shortLabel: "Mån" },
  { index: 2, shortLabel: "Tis" },
  { index: 3, shortLabel: "Ons" },
  { index: 4, shortLabel: "Tor" },
  { index: 5, shortLabel: "Fre" },
  { index: 6, shortLabel: "Lör" },
  { index: 0, shortLabel: "Sön" },
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
        Kör en deterministisk virtuell användare dag för dag. Startdatum gör veckodagstester reproducerbara.
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
          Startdatum
          <input
            type="date"
            value={props.startDate}
            onChange={(event) => props.onStartDateChange(event.target.value)}
            className="min-h-12 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-slate-950 outline-none focus:border-emerald-400"
          />
          <span className="text-xs font-normal text-slate-500">
            Välj startdatum för att kunna testa samma veckodagsupplägg igen.
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
          Antal dagar (7-84)
          <input
            min={7}
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
          Scenario
          <select
            value={props.scenario}
            onChange={(event) =>
              props.onScenarioChange(event.target.value as SimulationScenario)
            }
            className="min-h-12 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-slate-950 outline-none focus:border-emerald-400"
          >
            {SCENARIOS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <label className="grid gap-2 text-sm font-medium text-slate-700">
          Planeringsläge
          <select
            value={props.plannerMode}
            onChange={(event) =>
              props.onPlannerModeChange(event.target.value as SimulationPlannerMode)
            }
            className="min-h-12 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-slate-950 outline-none focus:border-emerald-400"
          >
            <option value="synthetic">Syntetisk snabbmodell</option>
            <option value="hybrid_ai">Hybrid AI-labb</option>
            <option value="real_app_planner">Riktig veckoplanering – mockat pass</option>
            <option value="full_app_chain">Full app-kedja: veckoplan + AI-pass</option>
          </select>
          <span className="text-xs font-normal text-slate-500">
            {props.plannerMode === "full_app_chain"
              ? "Detta läge använder riktiga AI-anrop och är långsammare samt dyrare än övriga lägen."
              : props.plannerMode === "real_app_planner"
                ? "Använder appens riktiga veckoplanering och historikcontext. Själva passet simuleras."
                : props.plannerMode === "hybrid_ai"
                  ? "Använder simulationens egen AI-planner. Bra för AI-tendenser, men inte hela appkedjan."
                  : "Snabb lokal simulering utan AI. Bra för grova mönster."}
          </span>
        </label>
      </div>

      {props.plannerMode === "full_app_chain" ? (
        <div className="mt-4 grid gap-2 sm:max-w-xs">
          <label className="grid gap-2 text-sm font-medium text-slate-700">
            Max AI-genererade pass
            <input
              min={1}
              max={10}
              type="number"
              value={props.maxAiGeneratedWorkouts}
              onChange={(event) =>
                props.onMaxAiGeneratedWorkoutsChange(Number(event.target.value))
              }
              className="min-h-12 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-slate-950 outline-none focus:border-emerald-400"
            />
            <span className="text-xs font-normal text-slate-500">
              Begränsar hur många riktiga AI-pass som får genereras i en körning.
            </span>
          </label>
        </div>
      ) : null}

      <div className="mt-5">
        <p className="text-sm font-medium text-slate-700">Planerade träningsdagar</p>
        <p className="mt-1 text-xs text-slate-500">
          Välj veckodagar för att testa hur passen sprids över datum.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {WEEKDAY_OPTIONS.map((day) => {
            const selected = props.plannedWorkoutDayIndices.includes(day.index);

            return (
              <button
                key={day.index}
                type="button"
                onClick={() => {
                  const next = selected
                    ? props.plannedWorkoutDayIndices.filter((value) => value !== day.index)
                    : [...props.plannedWorkoutDayIndices, day.index].sort(
                        (left, right) => left - right,
                      );
                  props.onPlannedWorkoutDayIndicesChange(next);
                }}
                className={`min-h-11 rounded-2xl border px-4 text-sm font-medium transition ${
                  selected
                    ? "border-emerald-400 bg-emerald-50 text-emerald-900"
                    : "border-slate-200 bg-slate-50 text-slate-700"
                }`}
              >
                {day.shortLabel}
              </button>
            );
          })}
        </div>
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
          {props.report.config.randomSeed}, start {props.report.config.startDate},{" "}
          {props.report.config.plannerMode === "full_app_chain"
            ? "full app-kedja"
            : props.report.config.plannerMode === "hybrid_ai"
              ? "hybrid AI"
              : props.report.config.plannerMode === "real_app_planner"
                ? "riktig veckoplanering"
                : "syntetisk modell"}
          .
        </p>
      ) : null}
    </section>
  );
}
