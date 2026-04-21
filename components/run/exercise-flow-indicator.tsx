"use client";

import type { Exercise } from "@/types/workout";
import { formatExerciseTarget } from "@/lib/exercise-execution";

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

type FlowNode = {
  key: string;
  label: string;
  sublabel?: string;
  active?: boolean;
  accent?: "exercise" | "rest";
};

type ExerciseFlowIndicatorProps = {
  blockType: "straight_sets" | "superset" | "circuit";
  currentExercise: Exercise | null;
  currentExerciseIndex: number;
  currentExerciseCount: number;
  currentSet: number;
  currentSetTotal: number;
  currentRound: number;
  currentRoundTotal: number;
  currentBlockExercises: Exercise[];
  showRestTimer: boolean;
  restRemainingSeconds: number;
  nextExerciseName?: string;
};

function formatDuration(seconds: number) {
  if (seconds < 60) {
    return `${seconds} s`;
  }

  const minutes = Math.floor(seconds / 60);
  const restSeconds = seconds % 60;

  if (!restSeconds) {
    return `${minutes} min`;
  }

  return `${minutes} min ${restSeconds} s`;
}

function buildStraightSetNodes(
  props: ExerciseFlowIndicatorProps,
): FlowNode[] {
  const nodes: FlowNode[] = [];
  const nextSet = props.currentSet + 1;
  const restLabel = props.showRestTimer
    ? `${props.restRemainingSeconds}s kvar`
    : props.currentExercise?.rest
      ? formatDuration(props.currentExercise.rest)
      : undefined;

  nodes.push({
    key: "current-set",
    label: `Set ${props.currentSet} av ${props.currentSetTotal}`,
    sublabel: props.currentExercise?.name,
    active: !props.showRestTimer,
    accent: "exercise",
  });

  if (props.currentExercise?.rest && (props.currentSet < props.currentSetTotal || props.nextExerciseName)) {
    nodes.push({
      key: "rest",
      label: "Vila",
      sublabel: restLabel,
      active: props.showRestTimer,
      accent: "rest",
    });
  }

  if (nextSet <= props.currentSetTotal) {
    nodes.push({
      key: "next-set",
      label: `Set ${nextSet} av ${props.currentSetTotal}`,
      sublabel: props.currentExercise?.name,
      accent: "exercise",
    });
  } else if (props.nextExerciseName) {
    nodes.push({
      key: "next-exercise",
      label: "Nästa",
      sublabel: props.nextExerciseName,
      accent: "exercise",
    });
  }

  return nodes;
}

function buildSupersetNodes(
  props: ExerciseFlowIndicatorProps,
): FlowNode[] {
  const exerciseNodes = props.currentBlockExercises.map((exercise, index) => ({
    key: exercise.id,
    label: `${String.fromCharCode(65 + index)} ${exercise.name}`,
    sublabel: formatExerciseTarget(exercise),
    active:
      !props.showRestTimer &&
      index + 1 === props.currentExerciseIndex &&
      exercise.id === props.currentExercise?.id,
    accent: "exercise" as const,
  }));

  const restNode: FlowNode = {
    key: "rest",
    label: "Vila",
    sublabel: props.showRestTimer
      ? `${props.restRemainingSeconds}s kvar`
      : props.currentExercise?.rest
        ? formatDuration(props.currentExercise.rest)
        : "Nästa varv ↺",
    active: props.showRestTimer,
    accent: "rest",
  };

  return [...exerciseNodes, restNode];
}

export default function ExerciseFlowIndicator(
  props: ExerciseFlowIndicatorProps,
) {
  const nodes =
    props.blockType === "superset"
      ? buildSupersetNodes(props)
      : buildStraightSetNodes(props);

  if (nodes.length === 0) {
    return null;
  }

  return (
    <section
      className={cn(
        "rounded-[26px] border px-3 py-3 shadow-[0_10px_30px_rgba(15,23,42,0.05)] backdrop-blur",
        props.blockType === "superset"
          ? "border-emerald-100 bg-emerald-50/55"
          : "border-slate-200/70 bg-white/80",
      )}
    >
      <div className="flex items-center justify-between gap-3 px-1">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-400">
            Flöde
          </p>
          <p className="mt-0.5 text-sm font-medium text-slate-700">
            {props.blockType === "superset"
              ? `Varv ${props.currentRound} av ${props.currentRoundTotal}`
              : `Set ${props.currentSet} av ${props.currentSetTotal}`}
          </p>
        </div>

        {props.blockType === "superset" ? (
          <span className="rounded-full border border-emerald-200 bg-white px-3 py-1 text-xs font-semibold text-emerald-700">
            Loop ↺
          </span>
        ) : null}
      </div>

      <div className="mt-3 overflow-x-auto">
        <div className="flex min-w-max items-center gap-1.5 pb-1">
          {nodes.map((node, index) => (
            <div key={node.key} className="flex items-center gap-1.5">
              <div
                className={cn(
                  "min-w-[104px] rounded-[20px] border px-3 py-2.5 shadow-sm transition",
                  node.active
                    ? "border-emerald-300 bg-white shadow-[0_8px_24px_rgba(74,222,128,0.18)]"
                    : node.accent === "rest"
                      ? "border-slate-200 bg-white/70"
                      : "border-slate-200 bg-white",
                )}
              >
                <p className="truncate text-sm font-semibold text-slate-900">
                  {node.label}
                </p>
                {node.sublabel ? (
                  <p className="mt-1 truncate text-xs text-slate-500">
                    {node.sublabel}
                  </p>
                ) : null}
              </div>

              {index < nodes.length - 1 ? (
                <span className="text-base font-semibold text-emerald-400">→</span>
              ) : null}
            </div>
          ))}
        </div>
      </div>

      {props.blockType === "superset" ? (
        <p className="mt-1 px-1 text-xs font-medium text-emerald-800/70">
          Efter sista övningen: vila och tillbaka till A.
        </p>
      ) : null}
    </section>
  );
}
