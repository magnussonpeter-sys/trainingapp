import type { WorkoutLog } from "@/lib/workout-log-storage";

// Samma måltyper som redan används i appen.
export type TrainingGoal =
  | "strength"
  | "hypertrophy"
  | "health"
  | "body_composition";

export type DashboardUserSettings = {
  training_goal?: TrainingGoal | null;
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
};

const GOAL_LABELS: Record<TrainingGoal, string> = {
  strength: "Styrka",
  hypertrophy: "Muskelbyggnad",
  health: "Hälsa och funktion",
  body_composition: "Kroppssammansättning",
};

function average(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function daysBetween(from: Date, to: Date) {
  const diffMs = to.getTime() - from.getTime();
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
}

function safeDate(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getCompletedLogs(logs: WorkoutLog[]) {
  return [...logs]
    .filter((log) => log.status === "completed")
    .sort(
      (a, b) =>
        new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime()
    );
}

function getGoalLabel(goal?: TrainingGoal | null) {
  return goal ? GOAL_LABELS[goal] : "Allmän träning";
}

function buildNoDataAnalysis(goal?: TrainingGoal | null): DashboardAnalysis {
  const goalLabel = getGoalLabel(goal);

  return {
    title: "AI-analysen väntar på första passen",
    summary: `När du har loggat några pass kan dashboarden börja bedöma hur träningen ligger till mot målet ${goalLabel.toLowerCase()}. Just nu är bästa nästa steg att komma igång med regelbundenhet.`,
    status: "no_data",
    statusLabel: "Behöver underlag",
    goalLabel,
    consistencyScore: 0,
    metrics: [
      {
        label: "Pass senaste 7 dagar",
        value: "0",
        hint: "Börja med ett första pass",
      },
      {
        label: "Pass senaste 28 dagar",
        value: "0",
        hint: "Mer data ger bättre råd",
      },
      {
        label: "Snittlängd",
        value: "0 min",
        hint: "Kommer efter första genomförda pass",
      },
      {
        label: "Snitt set per pass",
        value: "0",
        hint: "Kommer efter första genomförda pass",
      },
    ],
    focusAreas: [
      "Skapa en första träningsrutin med 2 pass per vecka.",
      "Välj passlängd som känns realistisk att hålla över tid.",
      "Logga passen så AI-analysen får bättre beslutsunderlag.",
    ],
    recommendations: [
      {
        title: "Starta enkelt",
        detail: "Sikta på korta pass som du faktiskt genomför, hellre än perfekta upplägg som blir uppskjutna.",
      },
      {
        title: "Bygg vana först",
        detail: "När du har 2–4 genomförda pass blir rekommendationerna betydligt mer träffsäkra.",
      },
      {
        title: "Sätt rätt mål i inställningar",
        detail: "Om träningsmålet är sparat kan dashboarden anpassa analysen tydligare.",
      },
    ],
  };
}

function getWeeklyTarget(goal?: TrainingGoal | null) {
  switch (goal) {
    case "strength":
      return { min: 2, ideal: 3 };
    case "hypertrophy":
      return { min: 2, ideal: 4 };
    case "health":
      return { min: 2, ideal: 3 };
    case "body_composition":
      return { min: 3, ideal: 4 };
    default:
      return { min: 2, ideal: 3 };
  }
}

export function buildTrainingDashboardAnalysis(params: {
  logs: WorkoutLog[];
  settings?: DashboardUserSettings | null;
}): DashboardAnalysis {
  const goal = params.settings?.training_goal ?? null;
  const goalLabel = getGoalLabel(goal);
  const completedLogs = getCompletedLogs(params.logs);

  if (completedLogs.length === 0) {
    return buildNoDataAnalysis(goal);
  }

  const now = new Date();
  const target = getWeeklyTarget(goal);
  const lastWorkout = completedLogs[0];
  const lastWorkoutDate = safeDate(lastWorkout.completedAt);
  const daysSinceLastWorkout = lastWorkoutDate
    ? daysBetween(lastWorkoutDate, now)
    : 999;

  const workoutsLast7Days = completedLogs.filter((log) => {
    const date = safeDate(log.completedAt);
    return date ? daysBetween(date, now) <= 7 : false;
  }).length;

  const workoutsLast28Days = completedLogs.filter((log) => {
    const date = safeDate(log.completedAt);
    return date ? daysBetween(date, now) <= 28 : false;
  }).length;

  const avgDurationMinutes = average(
    completedLogs.map((log) => Math.max(1, Math.round(log.durationSeconds / 60)))
  );

  const avgSetsPerWorkout = average(
    completedLogs.map((log) =>
      log.exercises.reduce((sum, exercise) => sum + exercise.sets.length, 0)
    )
  );

  const completedRatio =
    params.logs.length > 0 ? completedLogs.length / params.logs.length : 1;

  // Enkel poäng som är lätt att bygga vidare på senare.
  const frequencyScore = Math.min(
    100,
    Math.round((workoutsLast7Days / target.ideal) * 45)
  );
  const recencyScore =
    daysSinceLastWorkout <= 2
      ? 30
      : daysSinceLastWorkout <= 4
      ? 22
      : daysSinceLastWorkout <= 7
      ? 12
      : 0;
  const completionScore = Math.round(completedRatio * 25);

  const consistencyScore = Math.max(
    0,
    Math.min(100, frequencyScore + recencyScore + completionScore)
  );

  let status: DashboardAnalysis["status"] = "building";
  let statusLabel = "Bygger vana";
  let title = "Träningen är på väg åt rätt håll";

  if (
    workoutsLast7Days >= target.ideal &&
    daysSinceLastWorkout <= 3 &&
    completedRatio >= 0.85
  ) {
    status = "excellent";
    statusLabel = "Mycket stark trend";
    title = "Du ligger riktigt bra till just nu";
  } else if (
    workoutsLast7Days >= target.min &&
    daysSinceLastWorkout <= 5 &&
    completedRatio >= 0.7
  ) {
    status = "good";
    statusLabel = "Stabil trend";
    title = "Du har en bra träningsrytm";
  } else if (daysSinceLastWorkout > 8) {
    status = "needs_attention";
    statusLabel = "Behöver komma igång igen";
    title = "Det viktigaste nu är att återfå kontinuiteten";
  }

  const summaryParts: string[] = [];

  summaryParts.push(
    `För målet ${goalLabel.toLowerCase()} har du genomfört ${workoutsLast7Days} pass senaste veckan och ${workoutsLast28Days} pass senaste 28 dagarna.`
  );

  if (daysSinceLastWorkout <= 2) {
    summaryParts.push("Du har tränat nyligen, vilket talar för god kontinuitet.");
  } else if (daysSinceLastWorkout <= 7) {
    summaryParts.push("Du är fortfarande nära senaste passet men bör hålla rytmen uppe.");
  } else {
    summaryParts.push("Det var ett tag sedan senaste passet, så nästa steg bör vara att få igång rutinen igen.");
  }

  if (avgDurationMinutes < 20) {
    summaryParts.push("Passen är relativt korta, vilket är bra för regelbundenhet men kan behöva kompletteras med lite mer volym över tid.");
  } else if (avgDurationMinutes > 50) {
    summaryParts.push("Du lägger in ganska rejäla pass, så återhämtning och jämn belastning blir extra viktiga.");
  } else {
    summaryParts.push("Passlängden ser balanserad ut för att bygga kontinuitet.");
  }

  const focusAreas: string[] = [];
  const recommendations: DashboardRecommendation[] = [];

  if (workoutsLast7Days < target.min) {
    focusAreas.push("Öka regelbundenheten till minst 2–3 pass per vecka.");
    recommendations.push({
      title: "Prioritera nästa pass tidigt",
      detail: "Planera nästa pass inom 1–3 dagar för att undvika att avståndet mellan passen blir för långt.",
    });
  } else {
    focusAreas.push("Behåll nuvarande träningsrytm och undvik långa uppehåll.");
  }

  if (avgSetsPerWorkout < 10) {
    focusAreas.push("Öka den totala träningsvolymen något när rutinen känns stabil.");
    recommendations.push({
      title: "Lägg till lite volym",
      detail: "Sikta på 1–2 extra arbetsset i något av kommande pass om återhämtningen känns bra.",
    });
  } else {
    focusAreas.push("Volymen ser tillräcklig ut för fortsatt progression.");
  }

  if (completedRatio < 0.75) {
    focusAreas.push("Minska risken för avbrutna pass genom mer realistisk passplanering.");
    recommendations.push({
      title: "Gör passen lättare att fullfölja",
      detail: "Kortare pass eller enklare startövningar kan ge fler slutförda pass och bättre total effekt.",
    });
  } else {
    recommendations.push({
      title: "Bygg vidare på det som fungerar",
      detail: "Du slutför en stor del av passen. Behåll ungefär samma nivå och höj försiktigt först när det känns stabilt.",
    });
  }

  switch (goal) {
    case "strength":
      recommendations.push({
        title: "Styrkefokus framåt",
        detail: "Prioritera basövningar först i passen och låt minst några pass ha lite längre vila mellan de tyngsta seten.",
      });
      break;
    case "hypertrophy":
      recommendations.push({
        title: "Muskelbyggnad framåt",
        detail: "Fortsätt samla kvalitetsset och se till att större muskelgrupper återkommer regelbundet varje vecka.",
      });
      break;
    case "health":
      recommendations.push({
        title: "Hälsospår framåt",
        detail: "Jämn träning över veckan slår enstaka hårda pass. Satsa på hållbar frekvens och helkroppstänk.",
      });
      break;
    case "body_composition":
      recommendations.push({
        title: "Kroppssammansättning framåt",
        detail: "Behåll styrkeinslagen men låt passen ha tillräcklig täthet och frekvens för att stötta energiomsättning och kontinuitet.",
      });
      break;
    default:
      recommendations.push({
        title: "Nästa steg",
        detail: "Spara träningsmål i inställningar för mer målspecifika rekommendationer på dashboarden.",
      });
      break;
  }

  return {
    title,
    summary: summaryParts.join(" "),
    status,
    statusLabel,
    goalLabel,
    consistencyScore,
    metrics: [
      {
        label: "Pass senaste 7 dagar",
        value: String(workoutsLast7Days),
        hint: `Målbild: cirka ${target.min}–${target.ideal}/vecka`,
      },
      {
        label: "Pass senaste 28 dagar",
        value: String(workoutsLast28Days),
        hint: "Visar din kontinuitet över tid",
      },
      {
        label: "Snittlängd",
        value: `${Math.round(avgDurationMinutes)} min`,
        hint: "Baserat på genomförda pass",
      },
      {
        label: "Snitt set per pass",
        value: `${Math.round(avgSetsPerWorkout)}`,
        hint: "Grovt mått på träningsvolym",
      },
    ],
    focusAreas,
    recommendations,
  };
}