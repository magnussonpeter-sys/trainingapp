import { formatAiDebugSummary } from "@/lib/analysis/format-ai-debug-summary";
import type { AiDebugExport } from "@/lib/analysis/ai-debug-types";

export function formatAiDebugPrompt(exportData: AiDebugExport) {
  const summary = formatAiDebugSummary(exportData);
  const payload = JSON.stringify(exportData, null, 2);

  return [
    "Analysera detta debugunderlag från min träningsapp.",
    "",
    "Du ska bedöma både:",
    "1. senaste genererade passet",
    "2. om passet är rimligt som del av den långsiktiga planen",
    "3. om användarens prioriterade muskler får tillräckligt genomslag över tid",
    "4. om veckobudget, historik och progression verkar rimliga",
    "5. om datakvaliteten är tillräcklig",
    "6. om modellen har systematiska bias",
    "",
    "Viktigt:",
    "- Skilj på problem i senaste passet och problem i den långsiktiga planeringen.",
    "- Skilj på träningsfysiologiska problem och debug-/datakvalitetsproblem.",
    "- Innan du analyserar senaste passet: kontrollera analysisAvailability och latestWorkoutEvaluationContext.",
    "- Om senaste AI-pass saknas ska du inte låtsas bedöma övningsval, utan tydligt säga att bara plan/historik kan analyseras.",
    "- Om senaste pass bara finns som fallback_from_history ska du beskriva det som en osäker fallback, inte som säkert senaste AI-genererade pass.",
    "- Var särskilt uppmärksam på korta eller tomma pass i historiken.",
    "- Bedöm om prioriterade muskler får direkt volym, inte bara indirekt träff.",
    "- Bedöm om planens kommande steg verkar kunna täcka kvarvarande budget.",
    "- Om trainingGap och adherenceDiagnostics verkar motsäga varandra, kontrollera deras windowType/windowStart/windowEnd innan du drar slutsats.",
    "- Ge konkreta rekommendationer för vad träningsmodellen bör ändra.",
    "- Use thirtyDayEffect only as coaching context. Do not claim measured muscle growth.",
    "- Phrase adaptations as likely training stimulus, not exact outcomes.",
    "",
    "Besvara med rubriker:",
    "1. Kort slutsats",
    "2. Senaste passet",
    "3. Långsiktig plan",
    "4. Prioriterade muskler",
    "5. Progression",
    "6. Historik och datakvalitet",
    "7. Bias/systematiska fel",
    "8. Rekommenderade modelländringar",
    "",
    "Kort sammanfattning:",
    summary,
    "",
    "Data:",
    payload,
  ].join("\n");
}
