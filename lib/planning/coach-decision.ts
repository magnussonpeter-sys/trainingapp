import type {
  ConfidenceScore,
  MuscleBudgetEntry,
  MuscleBudgetGroup,
} from "@/lib/planning/muscle-budget";
import type { WorkoutFocus } from "@/types/workout";

export type CoachStatus =
  | "on_track"
  | "need_more_volume"
  | "need_extra_session"
  | "rebalance_focus"
  | "recovery_needed";

export type CoachDecision = {
  status: CoachStatus;
  message: string;
  suggestedFocus?: WorkoutFocus;
  suggestedExtraSession?: boolean;
  priorityGroups?: MuscleBudgetGroup[];
};

const FOCUS_GROUPS: Record<WorkoutFocus, MuscleBudgetGroup[]> = {
  full_body: ["quads", "glutes", "back", "chest", "core"],
  upper_body: ["chest", "back", "shoulders", "biceps", "triceps"],
  lower_body: ["quads", "hamstrings", "glutes", "calves", "core"],
  core: ["core", "glutes"],
};

const PRIORITY_MULTIPLIERS = [1.75, 1.5, 1.35] as const;

function formatWorkoutFocusLabel(focus: WorkoutFocus) {
  if (focus === "upper_body") {
    return "överkropp";
  }

  if (focus === "lower_body") {
    return "ben";
  }

  if (focus === "core") {
    return "bål";
  }

  return "helkropp";
}

function formatMuscleGroupLabel(group: MuscleBudgetGroup) {
  if (group === "chest") return "bröst";
  if (group === "back") return "rygg";
  if (group === "quads") return "framsida lår";
  if (group === "hamstrings") return "baksida lår";
  if (group === "glutes") return "säte";
  if (group === "shoulders") return "axlar";
  if (group === "biceps") return "biceps";
  if (group === "triceps") return "triceps";
  if (group === "calves") return "vader";
  return "bål";
}

function getPriorityRank(
  configuredPriorityMuscles: MuscleBudgetGroup[],
  group: MuscleBudgetGroup,
) {
  const index = configuredPriorityMuscles.indexOf(group);
  return index >= 0 ? index : null;
}

function getOverloadPenalty(entry: MuscleBudgetEntry) {
  if (entry.loadStatus === "high_risk") {
    return 3;
  }

  if (entry.loadStatus === "over") {
    return 1.5;
  }

  return 0;
}

function buildPriorityGroups(
  entries: MuscleBudgetEntry[],
  configuredPriorityMuscles: MuscleBudgetGroup[],
) {
  return [...entries]
    .filter(
      (entry) =>
        entry.remainingSets > 0 &&
        entry.loadStatus !== "high_risk" &&
        entry.loadStatus !== "over",
    )
    .sort((left, right) => {
      const leftRank = getPriorityRank(configuredPriorityMuscles, left.group);
      const rightRank = getPriorityRank(configuredPriorityMuscles, right.group);

      if (leftRank !== rightRank) {
        if (leftRank === null) return 1;
        if (rightRank === null) return -1;
        return leftRank - rightRank;
      }

      if (right.remainingSets !== left.remainingSets) {
        return right.remainingSets - left.remainingSets;
      }

      const priorityOrder = { high: 0, medium: 1, low: 2 };
      return priorityOrder[left.priority] - priorityOrder[right.priority];
    })
    .map((entry) => entry.group)
    .slice(0, 4);
}

function getFocusUrgencyScore(params: {
  focus: WorkoutFocus;
  entries: MuscleBudgetEntry[];
  configuredPriorityMuscles: MuscleBudgetGroup[];
  patternPreferredFocus: WorkoutFocus;
}) {
  const focusEntries = params.entries.filter((entry) =>
    FOCUS_GROUPS[params.focus].includes(entry.group),
  );

  if (focusEntries.length === 0) {
    return {
      focus: params.focus,
      score: params.focus === params.patternPreferredFocus ? 0.5 : 0,
      hasUsableBudget: false,
    };
  }

  let score = 0;
  let usableBudget = 0;

  for (const entry of focusEntries) {
    const priorityRank = getPriorityRank(
      params.configuredPriorityMuscles,
      entry.group,
    );
    const multiplier =
      priorityRank === null ? 1 : (PRIORITY_MULTIPLIERS[priorityRank] ?? 1);

    score += entry.remainingSets * multiplier;
    score -= getOverloadPenalty(entry);

    if (entry.remainingSets > 0 && entry.loadStatus !== "high_risk") {
      usableBudget += entry.remainingSets;
    }
  }

  // Veckorytmen får vara en liten knuff, inte huvudorsaken.
  if (params.focus === params.patternPreferredFocus) {
    score += 0.5;
  }

  return {
    focus: params.focus,
    score,
    hasUsableBudget: usableBudget > 0,
  };
}

export function buildCoachDecision(params: {
  entries: MuscleBudgetEntry[];
  configuredPriorityMuscles: MuscleBudgetGroup[];
  currentWeekFocuses: WorkoutFocus[];
  completedLast7Days: number;
  passCount: number;
  patternPreferredFocus: WorkoutFocus;
  confidenceScore: ConfidenceScore;
}): CoachDecision {
  const priorityGroups = buildPriorityGroups(
    params.entries,
    params.configuredPriorityMuscles,
  );
  const highRiskEntries = params.entries.filter(
    (entry) => entry.loadStatus === "high_risk",
  );
  const overloadedEntries = params.entries.filter(
    (entry) => entry.loadStatus === "high_risk" || entry.loadStatus === "over",
  );
  const remainingEntries = params.entries.filter(
    (entry) =>
      entry.remainingSets > 0 &&
      entry.loadStatus !== "high_risk" &&
      entry.loadStatus !== "over",
  );
  const totalRemainingSets = remainingEntries.reduce(
    (sum, entry) => sum + entry.remainingSets,
    0,
  );
  const recentRepeatedFocus =
    params.currentWeekFocuses.length >= 3 &&
    new Set(params.currentWeekFocuses.slice(-3)).size === 1;
  const focusScores = (
    ["upper_body", "lower_body", "core", "full_body"] as WorkoutFocus[]
  )
    .map((focus) =>
      getFocusUrgencyScore({
        focus,
        entries: params.entries,
        configuredPriorityMuscles: params.configuredPriorityMuscles,
        patternPreferredFocus: params.patternPreferredFocus,
      }),
    )
    .sort((left, right) => right.score - left.score);
  const suggestedFocus = focusScores.find((entry) => entry.hasUsableBudget)?.focus;
  const topPriorityLabels = priorityGroups
    .slice(0, 3)
    .map((group) => formatMuscleGroupLabel(group));
  const overloadedLabels = overloadedEntries
    .slice(0, 3)
    .map((entry) => entry.label.toLowerCase());

  // Många överbelastade grupper betyder att coachlagret ska bromsa först.
  if (
    highRiskEntries.length >= 3 ||
    (params.completedLast7Days >= params.passCount && highRiskEntries.length >= 2)
  ) {
    return {
      status: "recovery_needed",
      message:
        overloadedLabels.length > 0
          ? `Återhämtning behöver väga tyngre nu. ${overloadedLabels.join(", ")} ligger redan högt, så nästa pass bör hållas lättare eller flyttas fram.`
          : "Återhämtning behöver väga tyngre nu innan nästa tunga pass.",
      suggestedFocus,
      priorityGroups,
    };
  }

  // Om mycket återstår trots att veckans normala pass redan är gjorda bör coachen öppna för ett extrapass.
  if (
    totalRemainingSets >= 12 &&
    params.completedLast7Days >= params.passCount &&
    params.confidenceScore !== "low"
  ) {
    return {
      status: "need_extra_session",
      message:
        topPriorityLabels.length > 0
          ? `Du har fortfarande tydlig träningsbudget kvar i ${topPriorityLabels.join(", ")}. Ett extra kort pass kan vara värt att lägga in.`
          : "Du har fortfarande tydlig träningsbudget kvar. Ett extra kort pass kan vara värt att lägga in.",
      suggestedFocus,
      suggestedExtraSession: true,
      priorityGroups,
    };
  }

  // Om rytmen säger en sak men budgeten säger något annat ska coachlagret få styra om fokus.
  if (
    suggestedFocus &&
    suggestedFocus !== params.patternPreferredFocus &&
    focusScores[0] &&
    focusScores[1] &&
    focusScores[0].score - focusScores[1].score >= 1
  ) {
    return {
      status: "rebalance_focus",
      message:
        topPriorityLabels.length > 0
          ? `Veckan behöver balanseras om mot ${formatWorkoutFocusLabel(
              suggestedFocus,
            )}. Mest angeläget nu är ${topPriorityLabels.join(", ")}.`
          : `Veckan behöver balanseras om mot ${formatWorkoutFocusLabel(
              suggestedFocus,
            )}.`,
      suggestedFocus,
      priorityGroups,
    };
  }

  if (totalRemainingSets >= 8 || recentRepeatedFocus) {
    return {
      status: "need_more_volume",
      message:
        topPriorityLabels.length > 0
          ? `Du har fortfarande meningsfull budget kvar, främst för ${topPriorityLabels.join(", ")}. Sikta på ett pass som fyller det gapet.`
          : "Du har fortfarande meningsfull budget kvar. Sikta på ett pass som fyller det gapet.",
      suggestedFocus,
      priorityGroups,
    };
  }

  return {
    status: "on_track",
    message:
      topPriorityLabels.length > 0
        ? `Du ligger i stort på rätt spår. Håll jämn nivå och låt ${topPriorityLabels.join(", ")} styra finjusteringen framåt.`
        : "Du ligger i stort på rätt spår. Håll jämn nivå och låt återhämtningen styra finjusteringen framåt.",
    suggestedFocus,
    priorityGroups,
  };
}
