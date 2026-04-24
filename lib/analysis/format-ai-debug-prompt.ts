import { formatAiDebugSummary } from "@/lib/analysis/format-ai-debug-summary";
import type { AiDebugExport } from "@/lib/analysis/ai-debug-types";

export function formatAiDebugPrompt(exportData: AiDebugExport) {
  const summary = formatAiDebugSummary(exportData);
  const payload = JSON.stringify(exportData, null, 2);

  return [
    "Analysera detta analysunderlag från min träningsapp.",
    "Bedöm särskilt:",
    "1. Om valda övningar är lämpliga för träningsmålet",
    "2. Om prioriterade muskelgrupper får tillräckligt fokus",
    "3. Om progressionen verkar rimlig utifrån tidigare pass",
    "4. Om veckobudget och historik verkar stämma med passförslagen",
    "5. Om modellen verkar ha systematiska bias, t.ex. för stort benfokus",
    "",
    "Utgå både från användarens mål, senaste träningshistorik, föreslagna pass och progression diagnostics.",
    "",
    "Kort sammanfattning:",
    summary,
    "",
    "Data:",
    payload,
  ].join("\n");
}
