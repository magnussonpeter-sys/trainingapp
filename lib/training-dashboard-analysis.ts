import {
  analyzeTraining,
  getGoalBenchmarkProfile,
  type GoalAnalysis,
  type GoalBenchmarkProfile,
  type GoalType,
} from "@/lib/goal-analysis";
import type { WorkoutLog } from "@/lib/workout-log-storage";

// Dashboarden använder samma måltyper som analysmotorn.
export type DashboardUserSettings = {
  training_goal?: GoalType | null;
  experience_level?: string | null;
  age?: number | null;
  weight_kg?: number | null;
  height_cm?: number | null;
};

export type DashboardMetric = {
  label: string;
  value: string;
  hint: string;
};

export type DashboardRecommendation = {
  title: string;
  detail: string;
  timeframe?: string;
};

export type DashboardRequirementItem = {
  label: string;
  target: string;
  actual: string;
  status: "good" | "warning" | "low";
};

export type DashboardActionStep = {
  title: string;
  detail: string;
};

export type DashboardAnalysis = {
  title: string;
  summary: string;
  status: "excellent" | "good" | "building" | "needs_attention" | "no_data";
  statusLabel: string;
  goalLabel: string;
  consistencyScore: number;
  metrics: DashboardMetric[];
  focusAreas: string[];
  recommendations: DashboardRecommendation[];
  requirementItems: DashboardRequirementItem[];
  actionPlan: DashboardActionStep[];
  strengths: string[];
  gaps: string[];
  structuredAnalysis: GoalAnalysis | null;
};

// Enkel fallback för okänt eller saknat mål.
function getGoalProfile(goal: GoalType | null | undefined): GoalBenchmarkProfile {
  return getGoalBenchmarkProfile(goal ?? "health");
}

// Hjälper oss att mappa målmotorns etiketter till dashboard-etiketter.
function mapStatus(status: GoalAnalysis["evaluation"]["status"]) {
  switch (status) {
    case "on_track":
      return {
        status: "excellent" as const,
        statusLabel: "På rätt väg",
      };
    case "needs_attention":
      return {
        status: "needs_attention" as const,
        statusLabel: "Behöver fokus",
      };
    case "steady":
    default:
      return {
        status: "good" as const,
        statusLabel: "Stabil grund",
      };
  }
}

// Kort etikett för rekommendationens tidshorisont.
function getTimeframeLabel(timeframe?: string) {
  switch (timeframe) {
    case "next_workout":
      return "Nästa pass";
    case "next_7_days":
      return "Nästa 7 dagar";
    case "next_14_days":
      return "Nästa 14 dagar";
    default:
      return undefined;
  }
}

// Bedömer hur nära användaren ligger det som målet vanligtvis kräver.
function getRequirementStatus(
  actual: number,
  min: number,
  good: number
): DashboardRequirementItem["status"] {
  if (actual >= good) {
    return "good";
  }

  if (actual >= min) {
    return "warning";
  }

  return "low";
}

// Text för sektioner där vi tydligt vill säga vad målet kräver.
function buildRequirementItems(
  analysis: GoalAnalysis,
  goalProfile: GoalBenchmarkProfile
): DashboardRequirementItem[] {
  const { metrics } = analysis;

  return [
    {
      label: "Passfrekvens",
      target: goalProfile.weeklyFrequencyTargetLabel,
      actual: `${metrics.weeklyFrequency.toFixed(1)} pass / vecka`,
      status: getRequirementStatus(
        metrics.weeklyFrequency,
        goalProfile.weeklyFrequencyMin,
        goalProfile.weeklyFrequencyIdeal
      ),
    },
    {
      label: "Total träningsvolym",
      target: goalProfile.sets28dTargetLabel,
      actual: `${metrics.totalSets28d} set / 28 dagar`,
      status: getRequirementStatus(
        metrics.totalSets28d,
        goalProfile.sets28dMin,
        goalProfile.sets28dIdeal
      ),
    },
    {
      label: "Övningsbredd",
      target: goalProfile.varietyTargetLabel,
      actual: `${metrics.uniqueExercises28d} unika övningar / 28 dagar`,
      status: getRequirementStatus(
        metrics.uniqueExercises28d,
        goalProfile.varietyMin,
        goalProfile.varietyIdeal
      ),
    },
  ];
}

// Bygger en mer direkt måljämförelse än den gamla dashboard-varianten.
function buildGoalSpecificSummary(
  analysis: GoalAnalysis,
  goalProfile: GoalBenchmarkProfile
) {
  const { metrics, evaluation } = analysis;

  const intro =
    `${goalProfile.primaryAdvice} ` +
    `Just nu ligger du på ${metrics.weeklyFrequency.toFixed(
      1
    )} pass per vecka, ${metrics.totalSets28d} set senaste 28 dagarna ` +
    `och ${metrics.uniqueExercises28d} unika övningar under samma period. `;

  if (evaluation.status === "on_track") {
    return (
      intro +
      "Det talar för att du i stora drag tränar på ett sätt som kan föra dig mot målet, så nästa steg är att fortsätta bygga vidare utan att tappa kontinuitet."
    );
  }

  if (evaluation.status === "needs_attention") {
    return (
      intro +
      "Det här är sannolikt för lite eller för ojämnt i förhållande till målet just nu. För att komma närmare målet behöver du först höja regelbundenheten och därefter säkerställa tillräcklig träningsmängd."
    );
  }

  return (
    intro +
    "Du har en grund att bygga vidare på, men för att nå målet tydligare behöver träningen bli lite mer konsekvent eller lite bättre matchad mot målets krav."
  );
}

// Tydligare rubrik för dashboarden.
function buildTitle(analysis: GoalAnalysis, goalProfile: GoalBenchmarkProfile) {
  const biggestGap = analysis.focusAreas[0]?.title ?? null;

  if (analysis.evaluation.status === "on_track") {
    return `Du ligger bra till mot målet ${goalProfile.label.toLowerCase()}`;
  }

  if (analysis.evaluation.status === "needs_attention") {
    return biggestGap
      ? `För att nå ${goalProfile.label.toLowerCase()} behöver du främst förbättra: ${biggestGap.toLowerCase()}`
      : `Du behöver justera träningen för att nå målet ${goalProfile.label.toLowerCase()}`;
  }

  return `Du har en stabil grund för ${goalProfile.label.toLowerCase()}, men nästa steg behöver bli tydligare`;
}

// Mappning till dashboardens egna metric-kort.
function buildMetrics(
  analysis: GoalAnalysis,
  goalProfile: GoalBenchmarkProfile
): DashboardMetric[] {
  return [
    {
      label: "Pass / vecka",
      value: analysis.metrics.weeklyFrequency.toFixed(1),
      hint: `Målbild: ${goalProfile.weeklyFrequencyTargetLabel}`,
    },
    {
      label: "Set senaste 28 dagar",
      value: String(analysis.metrics.totalSets28d),
      hint: `Målbild: ${goalProfile.sets28dTargetLabel}`,
    },
    {
      label: "Snittlängd",
      value: `${analysis.metrics.averageWorkoutMinutes} min`,
      hint: "Visar om passen blivit väldigt korta eller långa",
    },
    {
      label: "Övningsbredd",
      value: String(analysis.metrics.uniqueExercises28d),
      hint: `Målbild: ${goalProfile.varietyTargetLabel}`,
    },
  ];
}

// Samlar fokusområden till ren text för UI.
function buildFocusAreas(
  analysis: GoalAnalysis,
  requirementItems: DashboardRequirementItem[]
) {
  const focusAreas = analysis.focusAreas.map(
    (area) => `${area.title}: ${area.reason}`
  );

  // Lägg till extra målgap om användaren ligger under kravbilden.
  for (const item of requirementItems) {
    if (item.status === "low") {
      focusAreas.unshift(
        `${item.label}: Du ligger på ${item.actual}, men för målet behövs ungefär ${item.target}.`
      );
    }
  }

  return Array.from(new Set(focusAreas)).slice(0, 5);
}

// Gör rekommendationerna mer dashboard-vänliga.
function buildRecommendations(
  analysis: GoalAnalysis
): DashboardRecommendation[] {
  return analysis.recommendations.map((recommendation) => ({
    title: recommendation.title,
    detail: recommendation.description,
    timeframe: getTimeframeLabel(recommendation.timeframe),
  }));
}

// Direkt handlingsplan för användaren.
function buildActionPlan(
  analysis: GoalAnalysis,
  goalProfile: GoalBenchmarkProfile
): DashboardActionStep[] {
  const steps: DashboardActionStep[] = [];
  const { metrics } = analysis;

  if (metrics.weeklyFrequency < goalProfile.weeklyFrequencyMin) {
    steps.push({
      title: "1. Höj frekvensen först",
      detail: `Du behöver komma närmare minst ${goalProfile.weeklyFrequencyMin} pass per vecka. Börja med att planera in ett extra pass redan denna vecka.`,
    });
  }

  if (metrics.totalSets28d < goalProfile.sets28dMin) {
    steps.push({
      title: "2. Höj den totala träningsmängden",
      detail: `Du ligger på ${metrics.totalSets28d} set senaste 28 dagarna. För målet behöver du ungefär minst ${goalProfile.sets28dMin} set på 28 dagar som första nivå.`,
    });
  }

  if (metrics.uniqueExercises28d < goalProfile.varietyMin) {
    steps.push({
      title: "3. Bredda stimulansen lite",
      detail: `Lägg till någon kompletterande övning så att du närmar dig ${goalProfile.varietyTargetLabel}. Det ger bättre täckning och bättre chans att nå målet.`,
    });
  }

  if (steps.length === 0) {
    steps.push({
      title: "1. Behåll rytmen",
      detail:
        "Du ligger redan nära målbilden. Nästa steg är att fortsätta träna jämnt och bygga vidare utan onödiga uppehåll.",
    });
    steps.push({
      title: "2. Höj försiktigt",
      detail:
        "Öka volym eller svårighetsgrad i små steg när träningen känns stabil, i stället för att ändra för mycket på en gång.",
    });
  }

  return steps.slice(0, 3);
}

// Fallback när ingen träningshistorik finns ännu.
function buildNoDataAnalysis(goal: GoalType | null | undefined): DashboardAnalysis {
  const goalProfile = getGoalProfile(goal);

  return {
    title: `AI-analysen väntar på fler pass`,
    summary:
      `För målet ${goalProfile.label.toLowerCase()} behöver appen lite mer träningsdata för att kunna ge träffsäkra råd. ` +
      `Det viktigaste nu är att börja bygga en stabil rytm och logga dina pass.`,
    status: "no_data",
    statusLabel: "Behöver underlag",
    goalLabel: goalProfile.label,
    consistencyScore: 0,
    metrics: [
      {
        label: "Pass / vecka",
        value: "0.0",
        hint: `Målbild: ${goalProfile.weeklyFrequencyTargetLabel}`,
      },
      {
        label: "Set senaste 28 dagar",
        value: "0",
        hint: `Målbild: ${goalProfile.sets28dTargetLabel}`,
      },
      {
        label: "Snittlängd",
        value: "0 min",
        hint: "Kommer när du loggat pass",
      },
      {
        label: "Övningsbredd",
        value: "0",
        hint: `Målbild: ${goalProfile.varietyTargetLabel}`,
      },
    ],
    focusAreas: [
      "Kom igång med minst 2 pass per vecka.",
      "Välj passlängd som du realistiskt kan hålla över tid.",
      "Logga passen så att analysen får bättre beslutsunderlag.",
    ],
    recommendations: [
      {
        title: "Starta enkelt",
        detail:
          "Satsa hellre på korta pass som faktiskt blir av än på perfekta upplägg som skjuts upp.",
        timeframe: "Nästa 7 dagar",
      },
      {
        title: "Bygg regelbundenhet först",
        detail:
          "När du har några genomförda pass blir råden betydligt mer personliga och träffsäkra.",
        timeframe: "Nästa 14 dagar",
      },
    ],
    requirementItems: [
      {
        label: "Passfrekvens",
        target: goalProfile.weeklyFrequencyTargetLabel,
        actual: "0.0 pass / vecka",
        status: "low",
      },
      {
        label: "Total träningsvolym",
        target: goalProfile.sets28dTargetLabel,
        actual: "0 set / 28 dagar",
        status: "low",
      },
      {
        label: "Övningsbredd",
        target: goalProfile.varietyTargetLabel,
        actual: "0 unika övningar / 28 dagar",
        status: "low",
      },
    ],
    actionPlan: [
      {
        title: "1. Kom igång med regelbundenhet",
        detail:
          "Börja med att få in 2 pass per vecka innan du försöker optimera detaljer.",
      },
      {
        title: "2. Logga passen",
        detail:
          "När du har några genomförda pass kan dashboarden börja ge betydligt mer precisa råd.",
      },
    ],
    strengths: [],
    gaps: [
      "Det finns ännu inte tillräckligt med träningsdata för att bedöma om upplägget matchar målet.",
    ],
    structuredAnalysis: null,
  };
}

// Publik funktion som dashboarden använder.
export function buildTrainingDashboardAnalysis(params: {
  logs: WorkoutLog[];
  settings?: DashboardUserSettings | null;
}): DashboardAnalysis {
  const goal = params.settings?.training_goal ?? "health";
  const completedLogs = params.logs.filter((log) => log.status === "completed");

  if (completedLogs.length === 0) {
    return buildNoDataAnalysis(goal);
  }

  // Återanvänd den rikare analysmotorn som redan finns i repo:t.
  const structuredAnalysis = analyzeTraining(params.logs, goal);
  const goalProfile = getGoalProfile(goal);
  const mappedStatus = mapStatus(structuredAnalysis.evaluation.status);
  const requirementItems = buildRequirementItems(structuredAnalysis, goalProfile);

  return {
    title: buildTitle(structuredAnalysis, goalProfile),
    summary: buildGoalSpecificSummary(structuredAnalysis, goalProfile),
    status: mappedStatus.status,
    statusLabel: mappedStatus.statusLabel,
    goalLabel: goalProfile.label,
    consistencyScore: Math.round(
      structuredAnalysis.evaluation.overallScore * 100
    ),
    metrics: buildMetrics(structuredAnalysis, goalProfile),
    focusAreas: buildFocusAreas(structuredAnalysis, requirementItems),
    recommendations: buildRecommendations(structuredAnalysis),
    requirementItems,
    actionPlan: buildActionPlan(structuredAnalysis, goalProfile),
    strengths: structuredAnalysis.evaluation.strengths,
    gaps: structuredAnalysis.evaluation.gaps,
    structuredAnalysis,
  };
}