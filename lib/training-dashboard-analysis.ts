import {
  analyzeTraining,
  type GoalAnalysis,
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
  strengths: string[];
  gaps: string[];
  structuredAnalysis: GoalAnalysis | null;
};

type GoalProfile = {
  label: string;
  weeklyFrequencyTarget: string;
  weeklyFrequencyMin: number;
  weeklyFrequencyGood: number;
  sets28dTarget: string;
  sets28dMin: number;
  sets28dGood: number;
  varietyTarget: string;
  varietyMin: number;
  primaryAdvice: string;
};

const GOAL_PROFILES: Record<GoalType, GoalProfile> = {
  strength: {
    label: "Styrka",
    weeklyFrequencyTarget: "2–4 pass / vecka",
    weeklyFrequencyMin: 1.75,
    weeklyFrequencyGood: 2.5,
    sets28dTarget: "32–64 set / 28 dagar",
    sets28dMin: 32,
    sets28dGood: 48,
    varietyTarget: "måttlig variation",
    varietyMin: 5,
    primaryAdvice:
      "För styrkemål behöver du regelbundna pass, tydliga huvudövningar och tillräcklig återhämtning mellan tyngre belastningar.",
  },
  hypertrophy: {
    label: "Muskelbyggnad",
    weeklyFrequencyTarget: "3–5 pass / vecka",
    weeklyFrequencyMin: 2.25,
    weeklyFrequencyGood: 3,
    sets28dTarget: "48–96 set / 28 dagar",
    sets28dMin: 48,
    sets28dGood: 72,
    varietyTarget: "god övningsbredd",
    varietyMin: 7,
    primaryAdvice:
      "För hypertrofi behöver du oftast både tillräcklig träningsfrekvens och tillräcklig total veckovolym. För lite pass eller för få set gör att muskelbyggnaden bromsas.",
  },
  health: {
    label: "Hälsa och funktion",
    weeklyFrequencyTarget: "2–4 pass / vecka",
    weeklyFrequencyMin: 1.75,
    weeklyFrequencyGood: 2.5,
    sets28dTarget: "28–64 set / 28 dagar",
    sets28dMin: 28,
    sets28dGood: 44,
    varietyTarget: "bred helkroppstäckning",
    varietyMin: 7,
    primaryAdvice:
      "För hälsomål är hållbar regelbundenhet och bred helkroppstäckning viktigare än maximal belastning i enskilda pass.",
  },
  body_composition: {
    label: "Kroppssammansättning",
    weeklyFrequencyTarget: "3–5 pass / vecka",
    weeklyFrequencyMin: 2.5,
    weeklyFrequencyGood: 3.25,
    sets28dTarget: "40–84 set / 28 dagar",
    sets28dMin: 40,
    sets28dGood: 60,
    varietyTarget: "god övningsbredd",
    varietyMin: 6,
    primaryAdvice:
      "För kroppssammansättning behöver du framför allt jämn träningsfrekvens och tillräcklig mängd arbete över tid, inte bara enstaka hårda pass.",
  },
};

// Enkel fallback för okänt eller saknat mål.
function getGoalProfile(goal: GoalType | null | undefined): GoalProfile {
  return GOAL_PROFILES[goal ?? "health"];
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
  goalProfile: GoalProfile
): DashboardRequirementItem[] {
  const { metrics } = analysis;

  return [
    {
      label: "Passfrekvens",
      target: goalProfile.weeklyFrequencyTarget,
      actual: `${metrics.weeklyFrequency.toFixed(1)} pass / vecka`,
      status: getRequirementStatus(
        metrics.weeklyFrequency,
        goalProfile.weeklyFrequencyMin,
        goalProfile.weeklyFrequencyGood
      ),
    },
    {
      label: "Total träningsvolym",
      target: goalProfile.sets28dTarget,
      actual: `${metrics.totalSets28d} set / 28 dagar`,
      status: getRequirementStatus(
        metrics.totalSets28d,
        goalProfile.sets28dMin,
        goalProfile.sets28dGood
      ),
    },
    {
      label: "Övningsbredd",
      target: goalProfile.varietyTarget,
      actual: `${metrics.uniqueExercises28d} unika övningar / 28 dagar`,
      status: getRequirementStatus(
        metrics.uniqueExercises28d,
        goalProfile.varietyMin,
        goalProfile.varietyMin + 2
      ),
    },
  ];
}

// Bygger en mer direkt måljämförelse än den gamla dashboard-varianten.
function buildGoalSpecificSummary(
  analysis: GoalAnalysis,
  goalProfile: GoalProfile
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
function buildTitle(analysis: GoalAnalysis, goalProfile: GoalProfile) {
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
  goalProfile: GoalProfile
): DashboardMetric[] {
  return [
    {
      label: "Pass / vecka",
      value: analysis.metrics.weeklyFrequency.toFixed(1),
      hint: `Målbild: ${goalProfile.weeklyFrequencyTarget}`,
    },
    {
      label: "Set senaste 28 dagar",
      value: String(analysis.metrics.totalSets28d),
      hint: `Målbild: ${goalProfile.sets28dTarget}`,
    },
    {
      label: "Snittlängd",
      value: `${analysis.metrics.averageWorkoutMinutes} min`,
      hint: "Visar om passen blivit väldigt korta eller långa",
    },
    {
      label: "Övningsbredd",
      value: String(analysis.metrics.uniqueExercises28d),
      hint: `Målbild: ${goalProfile.varietyTarget}`,
    },
  ];
}

// Samlar fokusområden till ren text för UI.
function buildFocusAreas(analysis: GoalAnalysis, requirementItems: DashboardRequirementItem[]) {
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
        hint: `Målbild: ${goalProfile.weeklyFrequencyTarget}`,
      },
      {
        label: "Set senaste 28 dagar",
        value: "0",
        hint: `Målbild: ${goalProfile.sets28dTarget}`,
      },
      {
        label: "Snittlängd",
        value: "0 min",
        hint: "Kommer när du loggat pass",
      },
      {
        label: "Övningsbredd",
        value: "0",
        hint: `Målbild: ${goalProfile.varietyTarget}`,
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
        target: goalProfile.weeklyFrequencyTarget,
        actual: "0.0 pass / vecka",
        status: "low",
      },
      {
        label: "Total träningsvolym",
        target: goalProfile.sets28dTarget,
        actual: "0 set / 28 dagar",
        status: "low",
      },
      {
        label: "Övningsbredd",
        target: goalProfile.varietyTarget,
        actual: "0 unika övningar / 28 dagar",
        status: "low",
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
    strengths: structuredAnalysis.evaluation.strengths,
    gaps: structuredAnalysis.evaluation.gaps,
    structuredAnalysis,
  };
}