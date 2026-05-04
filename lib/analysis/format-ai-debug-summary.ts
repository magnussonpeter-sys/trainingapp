import type { AiDebugExport } from "@/lib/analysis/ai-debug-types";

const MUSCLE_LABELS: Record<string, string> = {
  chest: "bröst",
  back: "rygg",
  quads: "framsida lår",
  hamstrings: "baksida lår",
  glutes: "säte",
  shoulders: "axlar",
  biceps: "biceps",
  triceps: "triceps",
  calves: "vader",
  core: "bål",
};

function formatList(values: string[]) {
  return values.length > 0 ? values.join(", ") : "inga tydliga";
}

function formatMuscleList(values: string[]) {
  return values.length > 0 ? values.map((value) => MUSCLE_LABELS[value] ?? value).join(", ") : "inga";
}

export function formatAiDebugSummary(exportData: AiDebugExport) {
  const topBudget = [...exportData.muscleBudgetSnapshot]
    .sort((left, right) => right.remainingSets - left.remainingSets)
    .slice(0, 3);
  const overloaded = exportData.muscleBudgetSnapshot
    .filter((entry) => entry.status === "over" || entry.status === "high_risk")
    .map((entry) => entry.label.toLowerCase());
  const progressionHighlights = exportData.progressionDiagnostics
    .slice(0, 3)
    .map((item) => {
      const suggested =
        item.suggestedWeight != null
          ? `${item.suggestedWeight}`
          : item.suggestedDuration != null
            ? `${item.suggestedDuration} sek`
            : item.bodyweightProgressionSuggestion ?? "ingen tydlig progression";

      return `${item.exerciseName}: ${suggested}`;
    });
  const latestContext = exportData.latestWorkoutEvaluationContext;
  const topPlanRisk = exportData.planRiskDiagnostics.upcomingFocusRisks[0] ?? null;
  const equipmentStatus =
    exportData.equipmentContext.equipmentForNextGeneration.length > 0
      ? formatList(exportData.equipmentContext.equipmentForNextGeneration)
      : exportData.equipmentContext.historicallyUsedEquipment28d.length > 0
        ? `saknas, men historiken antyder ${formatList(exportData.equipmentContext.historicallyUsedEquipment28d)}`
        : "saknas";

  const lines = [
    `- Mål: ${exportData.userContext.trainingGoal ?? "okänt"}`,
    `- Erfarenhetsnivå: ${exportData.userContext.experienceLevel ?? "okänd"}`,
    `- Prioriterade muskler: ${formatList(exportData.userContext.priorityMuscles)}`,
    `- Senaste AI-pass: ${latestContext.source === "missing" ? "saknas i exporten" : latestContext.latestGeneratedWorkoutName ?? "okänt pass"}`,
    `- Passanalys möjlig: ${exportData.analysisAvailability.canEvaluateLatestGeneratedWorkout ? "ja" : "nej"}`,
    `- Fallbackpass möjligt att analysera: ${exportData.analysisAvailability.canEvaluateFallbackWorkout ? "ja" : "nej"}`,
    `- Plananalys möjlig: ${exportData.analysisAvailability.canEvaluateLongTermPlan ? "ja" : "nej"}`,
    `- Källsäkerhet för senaste pass: ${latestContext.source} / ${latestContext.sourceConfidence}`,
    `- Vald långsiktig plan/fokus: ${exportData.currentPlanSnapshot.splitStyle ?? "okänd"} / nästa fokus ${exportData.currentPlanSnapshot.selectedWeeklyFocus ?? "okänt"}`,
    `- Planläge: ${exportData.currentPlanSnapshot.selectedPlanMode}`,
    `- Planens intention: ${exportData.currentPlanSnapshot.planInterpretation}`,
    `- Selektivt mål nu: ${formatMuscleList(exportData.currentPlanSnapshot.targetMuscles)}`,
    `- Muskler att undvika nu: ${formatMuscleList(exportData.currentPlanSnapshot.avoidMuscles)}`,
    `- Följsamhet 7 dagar: ${exportData.adherenceDiagnostics.last7Days.interpretation}`,
    `- Följsamhet 28 dagar: ${exportData.adherenceDiagnostics.last28Days.interpretation}`,
    `- Datakvalitet: ${exportData.dataQuality.overallConfidence} (${exportData.dataQuality.reasons.join(" | ")})`,
    `- Utrustning för nästa generering: ${equipmentStatus}`,
    `- Mest eftersatta muskler nu: ${formatList(
      topBudget.map((entry) => `${entry.label.toLowerCase()} (${entry.remainingSets} set kvar)`),
    )}`,
    `- Överbelastade grupper: ${formatList(overloaded)}`,
    `- Passets roll i planen: ${latestContext?.expectedRoleInPlan ?? "oklar"}`,
    `- Direkt träff på prioriterade muskler: ${formatMuscleList(
      latestContext?.priorityMusclesHitDirectly ?? [],
    )}`,
    `- Prioriterade muskler utan direkt träff: ${formatMuscleList(
      latestContext?.priorityMusclesMissing ?? [],
    )}`,
    `- Föreslagen progression: ${formatList(progressionHighlights)}`,
    `- Konflikt mellan veckofönster: ${exportData.adherenceDiagnostics.consistencyCheck.hasConflictingSignals ? exportData.adherenceDiagnostics.consistencyCheck.notes.join(" | ") : "ingen tydlig konflikt"}`,
    `- Viktig planrisk: ${topPlanRisk ? `${topPlanRisk.focus ?? "okänt fokus"} ${topPlanRisk.reason}` : "ingen tydlig hög risk i kommande plan"}`,
    `- Viktigaste utvärderingsfråga: ${exportData.evaluationQuestions[0] ?? "Bedöm helheten i pass och plan."}`,
  ];

  if (exportData.warnings.length > 0) {
    lines.push(`- Varningar: ${exportData.warnings.join(" | ")}`);
  }

  return lines.join("\n");
}
