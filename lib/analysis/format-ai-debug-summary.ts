import type { AiDebugExport } from "@/lib/analysis/ai-debug-types";

function formatList(values: string[]) {
  return values.length > 0 ? values.join(", ") : "inga tydliga";
}

export function formatAiDebugSummary(exportData: AiDebugExport) {
  const topBudget = [...exportData.muscleBudgetSnapshot]
    .sort((left, right) => right.remainingSets - left.remainingSets)
    .slice(0, 3);
  const overloaded = exportData.muscleBudgetSnapshot
    .filter((entry) => entry.status === "over" || entry.status === "high_risk")
    .map((entry) => entry.label.toLowerCase());
  const recentAiPasses = exportData.recentGeneratedWorkouts.slice(0, 3);
  const progressionHighlights = exportData.progressionDiagnostics
    .slice(0, 3)
    .map((item) => {
      const suggested =
        item.suggestedWeight != null
          ? `${item.suggestedWeight}`
          : item.suggestedDuration != null
            ? `${item.suggestedDuration} sek`
            : "ingen tydlig progression";

      return `${item.exerciseName}: ${suggested}`;
    });

  const lines = [
    `- Mål: ${exportData.userContext.trainingGoal ?? "okänt"}`,
    `- Prioriterade muskler: ${formatList(exportData.userContext.priorityMuscles)}`,
    `- Vald utrustning: ${formatList(exportData.userContext.availableEquipment)}`,
    `- Mest eftersatta muskler nu: ${formatList(
      topBudget.map((entry) => `${entry.label.toLowerCase()} (${entry.remainingSets} set kvar)`),
    )}`,
    `- Överbelastade grupper: ${formatList(overloaded)}`,
    `- Senaste AI-pass: ${recentAiPasses.length > 0 ? recentAiPasses.map((item) => item.normalizedWorkout?.name ?? "pass").join(", ") : "inga sparade AI-pass"}`,
    `- Föreslagen progression: ${formatList(progressionHighlights)}`,
    `- Viktiga frågor: ${exportData.evaluationQuestions.slice(0, 3).join(" | ")}`,
  ];

  if (exportData.warnings.length > 0) {
    lines.push(`- Warnings: ${exportData.warnings.join(" | ")}`);
  }

  return lines.join("\n");
}
