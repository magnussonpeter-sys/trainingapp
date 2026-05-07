import type { SimulationPlannerMode, SimulationReport } from "@/lib/simulation/types";

function plannerModeLabel(mode: SimulationPlannerMode | undefined) {
  if (mode === "full_app_chain") {
    return "Full app-kedja – veckoplan + AI-pass";
  }

  if (mode === "real_app_planner") {
    return "Riktig veckoplanering – mockat pass";
  }

  if (mode === "hybrid_ai") {
    return "Hybrid AI-labb";
  }

  return "Syntetisk snabbmodell";
}

function dayEventLabel(value: string) {
  if (value === "planned_training") {
    return "planerat";
  }

  if (value === "missed_planned") {
    return "missat";
  }

  if (value === "spontaneous_training") {
    return "spontant";
  }

  return "vila";
}

export function buildSimulationAnalysisExport(report: SimulationReport) {
  const dayDebugByIndex = new Map(
    (report.plannerDebug ?? []).map((entry) => [entry.dayIndex, entry]),
  );
  const meaningfulSnapshots = report.dailySnapshots.filter(
    (snapshot) => snapshot.dayEvent !== "rest",
  );
  const completedCount = report.dailySnapshots.filter(
    (snapshot) => snapshot.workoutResult?.completed,
  ).length;
  const missedCount = report.dailySnapshots.filter(
    (snapshot) => snapshot.dayEvent === "missed_planned",
  ).length;
  const spontaneousCount = report.dailySnapshots.filter(
    (snapshot) => snapshot.dayEvent === "spontaneous_training",
  ).length;
  const avgActualDuration =
    meaningfulSnapshots.length > 0
      ? Math.round(
          meaningfulSnapshots.reduce(
            (sum, snapshot) => sum + (snapshot.workoutResult?.actualDurationMin ?? 0),
            0,
          ) / meaningfulSnapshots.length,
        )
      : 0;
  const avgPlannedDuration =
    meaningfulSnapshots.length > 0
      ? Math.round(
          meaningfulSnapshots.reduce(
            (sum, snapshot) =>
              sum + (snapshot.workoutResult?.plannedDurationMin ?? snapshot.plannedTraining.targetDurationMin),
            0,
          ) / meaningfulSnapshots.length,
        )
      : 0;

  const lines = [
    "# Simulationsanalys",
    "",
    "## Metadata",
    `- Profil: ${report.profile.name} (${report.profile.id})`,
    report.effectiveUserProfile
      ? `- Effektiv profil: mål ${report.effectiveUserProfile.effectiveGoal}, nivå ${report.effectiveUserProfile.effectiveExperienceLevel}, ålder ${report.effectiveUserProfile.effectiveAge ?? "-"}, längd ${report.effectiveUserProfile.effectiveHeightCm ?? "-"} cm, vikt ${report.effectiveUserProfile.effectiveWeightKg ?? "-"} kg`
      : "- Effektiv profil: saknas",
    report.effectiveUserProfile
      ? `- Sportspecifikt mål: ${report.effectiveUserProfile.effectiveSportFocus}`
      : "- Sportspecifikt mål: saknas",
    report.effectiveUserProfile
      ? `- Prioriterade muskler: ${report.effectiveUserProfile.effectivePriorityMuscles.join(", ") || "inga"}`
      : "- Prioriterade muskler: saknas",
    `- Mål: ${report.profile.goal}`,
    `- Erfarenhetsnivå: ${report.profile.experienceLevel}`,
    `- Planner mode: ${report.config.plannerMode} (${plannerModeLabel(report.config.plannerMode)})`,
    `- Scenario: ${report.config.scenario ?? "normal"}`,
    `- Startdatum: ${report.config.startDate}`,
    `- Antal dagar: ${report.config.totalDays}`,
    `- Seed: ${report.config.randomSeed}`,
    `- Planerade träningsdagar: ${report.plannedWorkoutDayLabels.join(", ") || "inga"}`,
    `- Tillgänglig utrustning: ${report.profile.availableEquipmentIds.join(", ") || "okänd"}`,
    report.effectiveUserProfile
      ? `- Effektiv utrustning: ${report.effectiveUserProfile.effectiveEquipment.join(", ") || "okänd"}`
      : "- Effektiv utrustning: saknas",
    report.effectiveUserProfile?.warnings.length
      ? `- Profilvarningar: ${report.effectiveUserProfile.warnings.join("; ")}`
      : "- Profilvarningar: inga",
    `- Max AI-pass: ${report.config.maxAiGeneratedWorkouts ?? "n/a"}`,
    `- Faktiska AI-anrop: ${report.aiGeneratedWorkoutCount ?? 0}`,
    `- AI-fallback/mock: ${report.aiFallbackWorkoutCount ?? 0}`,
    "",
    "## Sammanfattning",
    `- Planerade pass: ${report.dailySnapshots.filter((snapshot) => snapshot.plannedTraining.isPlannedTrainingDay).length}`,
    `- Genomförda pass: ${completedCount}`,
    `- Missade pass: ${missedCount}`,
    `- Spontana pass: ${spontaneousCount}`,
    `- Genomsnittlig faktisk duration: ${avgActualDuration} min`,
    `- Genomsnittlig planerad duration: ${avgPlannedDuration} min`,
    `- Utvärdering: ${report.evaluation.summary}`,
    "",
    "## Per träningsdag",
  ];

  for (const snapshot of meaningfulSnapshots) {
    const debug = dayDebugByIndex.get(snapshot.dayIndex);
    const plannerSummary = debug?.realAppPlanner;
    const historySummary = debug?.trainingHistoryContextSummary;
    const validationDiagnostics = debug?.validationDiagnostics;
    lines.push(
      `### Dag ${snapshot.dayIndex + 1} – ${snapshot.date} (${snapshot.plannedTraining.weekday})`,
      `- Händelse: ${dayEventLabel(snapshot.dayEvent)}`,
      `- Planner mode: ${debug?.plannerMode ?? report.config.plannerMode}`,
      `- Planner source: ${snapshot.generatedWorkoutSummary?.plannerSource ?? "-"}`,
      `- Rekommenderat fokus: ${plannerSummary?.suggestedNextWorkoutFocus ?? plannerSummary?.suggestedNextFocus ?? "-"}`,
      `- Rekommenderad längd: ${plannerSummary?.suggestedNextDurationMinutes ?? snapshot.plannedTraining.targetDurationMin} min`,
      `- Faktisk längd: ${snapshot.workoutResult?.actualDurationMin ?? 0} min`,
      `- Coachtext: ${plannerSummary?.coachText ?? debug?.note ?? "-"}`,
      `- Priority muscles: ${plannerSummary?.priorityMuscles.join(", ") || "inga"}`,
      `- Recovery-limited muscles: ${plannerSummary?.recoveryLimitedMuscles.join(", ") || "inga"}`,
      historySummary
        ? `- Training history context: ${historySummary.recentWorkoutsCount} recent, ${historySummary.progressionMemoryExerciseCount} progression, ${historySummary.mediumTermWindowDays} dagar, data ${historySummary.dataQuality}${typeof historySummary.typicalWorkoutDurationMinutes === "number" ? `, typisk längd ${historySummary.typicalWorkoutDurationMinutes} min` : ""}`
        : "- Training history context: saknas",
      `- Passgenerering: ${snapshot.generatedWorkoutSummary?.passGenerationMode ?? "okänd"}`,
      `- Före normalisering: ${debug?.beforeNormalization.map((exercise) => exercise.exerciseName).join(", ") || "saknas"}`,
      `- Efter normalisering: ${debug?.afterNormalization.map((exercise) => exercise.exerciseName).join(", ") || "saknas"}`,
      validationDiagnostics
        ? `- Focus integrity: ${validationDiagnostics.focusIntegrityScore}/100 (loss ${validationDiagnostics.normalizationLossScore})`
        : "- Focus integrity: saknas",
      validationDiagnostics
        ? `- Strength specificity: ${validationDiagnostics.strengthSpecificityScore}/100`
        : "- Strength specificity: saknas",
      validationDiagnostics
        ? `- Quality preservation: ${validationDiagnostics.qualityPreservationScore}/100 (målförlust ${validationDiagnostics.goalSpecificityLoss}, sportförlust ${validationDiagnostics.sportSpecificityLoss}, catalog loss ${validationDiagnostics.catalogResolutionLoss})`
        : "- Quality preservation: saknas",
      validationDiagnostics?.mustKeepViolations.length
        ? `- Must-keep violationer: ${validationDiagnostics.mustKeepViolations.join("; ")}`
        : "- Must-keep violationer: inga",
      validationDiagnostics?.offFocusWarnings.length
        ? `- Off-focus varningar: ${validationDiagnostics.offFocusWarnings.join("; ")}`
        : "- Off-focus varningar: inga",
      validationDiagnostics?.offFocusViolations.length
        ? `- Off-focus violationer: ${validationDiagnostics.offFocusViolations.join("; ")}`
        : "- Off-focus violationer: inga",
      validationDiagnostics?.forbiddenExerciseViolations.length
        ? `- Förbjudna övningar: ${validationDiagnostics.forbiddenExerciseViolations.join("; ")}`
        : "- Förbjudna övningar: inga",
      validationDiagnostics?.lostMovementPatterns.length
        ? `- Tappade rörelsemönster: ${validationDiagnostics.lostMovementPatterns.join(", ")}`
        : "- Tappade rörelsemönster: inga",
      validationDiagnostics?.lostPriorityMuscles.length
        ? `- Tappade prioriterade muskler: ${validationDiagnostics.lostPriorityMuscles.join(", ")}`
        : "- Tappade prioriterade muskler: inga",
      validationDiagnostics?.deferredPriorityMuscles.length
        ? `- Deferred priorities: ${validationDiagnostics.deferredPriorityMuscles.join(", ")}`
        : "- Deferred priorities: inga",
      validationDiagnostics?.lostPrimaryRoles.length
        ? `- Tappade primärroller: ${validationDiagnostics.lostPrimaryRoles.join("; ")}`
        : "- Tappade primärroller: inga",
      validationDiagnostics?.lostUsefulRoles.length
        ? `- Tappade nyttiga roller: ${validationDiagnostics.lostUsefulRoles.join(", ")}`
        : "- Tappade nyttiga roller: inga",
      validationDiagnostics?.lostPrimaryOrHighValueExercises.length
        ? `- Tappade högvärdesövningar: ${validationDiagnostics.lostPrimaryOrHighValueExercises.join(", ")}`
        : "- Tappade högvärdesövningar: inga",
      validationDiagnostics?.lostSportRelevantExercises.length
        ? `- Tappade sportrelevanta övningar: ${validationDiagnostics.lostSportRelevantExercises.join(", ")}`
        : "- Tappade sportrelevanta övningar: inga",
      validationDiagnostics?.sportRelevantExercisesKept.length
        ? `- Behållna sportrelevanta övningar: ${validationDiagnostics.sportRelevantExercisesKept.join(", ")}`
        : "- Behållna sportrelevanta övningar: inga",
      validationDiagnostics?.removedPrimaryExercises.length
        ? `- Borttagna primärövningar: ${validationDiagnostics.removedPrimaryExercises.join(", ")}`
        : "- Borttagna primärövningar: inga",
      validationDiagnostics?.addedOffFocusExercises.length
        ? `- Tillagda off-focus-övningar: ${validationDiagnostics.addedOffFocusExercises.join(", ")}`
        : "- Tillagda off-focus-övningar: inga",
      validationDiagnostics?.fallbackExercisesAdded.length
        ? `- Tillagda fallback-övningar: ${validationDiagnostics.fallbackExercisesAdded.join(", ")}`
        : "- Tillagda fallback-övningar: inga",
      validationDiagnostics?.fallbackBiasWarning
        ? `- Fallback-bias: ${validationDiagnostics.fallbackBiasWarning}`
        : "- Fallback-bias: ingen tydlig",
      validationDiagnostics?.priorityMuscleResolutionStatus.length
        ? `- Priority status: ${validationDiagnostics.priorityMuscleResolutionStatus.map((entry) => `${entry.muscle}=${entry.status}`).join(", ")}`
        : "- Priority status: saknas",
      validationDiagnostics?.durationTrimReason
        ? `- Duration trim: ${validationDiagnostics.durationTrimReason}`
        : "- Duration trim: ingen särskild trimning",
      validationDiagnostics?.roleTrimReason
        ? `- Rolltrimning: ${validationDiagnostics.roleTrimReason}`
        : "- Rolltrimning: ingen särskild rollförlust",
      validationDiagnostics?.compatibleExercisesRejectedWithReason.length
        ? `- Avvisade kompatibla övningar: ${validationDiagnostics.compatibleExercisesRejectedWithReason.map((entry) => `${entry.exerciseName} [${entry.stage}] (${entry.reason})`).join("; ")}`
        : "- Avvisade kompatibla övningar: inga",
      validationDiagnostics?.beforeAfterDiff.length
        ? `- Före→efter diff: ${validationDiagnostics.beforeAfterDiff.map((entry) => `${entry.type === "removed" ? "bort" : "till"} ${entry.exerciseName} (${entry.reason})`).join("; ")}`
        : "- Före→efter diff: ingen större skillnad",
      validationDiagnostics?.rawToCatalogDiff.length
        ? `- Raw→catalog diff: ${validationDiagnostics.rawToCatalogDiff.map((entry) => `${entry.type === "removed" ? "bort" : "till"} ${entry.exerciseName} (${entry.reason})`).join("; ")}`
        : "- Raw→catalog diff: ingen större skillnad",
      validationDiagnostics?.catalogToFocusRepairDiff.length
        ? `- Catalog→focus repair diff: ${validationDiagnostics.catalogToFocusRepairDiff.map((entry) => `${entry.type === "removed" ? "bort" : "till"} ${entry.exerciseName} (${entry.reason})`).join("; ")}`
        : "- Catalog→focus repair diff: ingen större skillnad",
      validationDiagnostics?.focusRepairToFinalDiff.length
        ? `- Focus repair→final diff: ${validationDiagnostics.focusRepairToFinalDiff.map((entry) => `${entry.type === "removed" ? "bort" : "till"} ${entry.exerciseName} (${entry.reason})`).join("; ")}`
        : "- Focus repair→final diff: ingen större skillnad",
      validationDiagnostics?.validationContext
        ? `- Validation context: fokus ${validationDiagnostics.validationContext.plannedFocus ?? "-"}, mål ${validationDiagnostics.validationContext.goal}, nivå ${validationDiagnostics.validationContext.experienceLevel ?? "-"}, duration ${validationDiagnostics.validationContext.durationMinutes} min, sport ${validationDiagnostics.validationContext.sportFocus ?? "none"}, compatible ${validationDiagnostics.validationContext.focusCompatiblePriorities.join(", ") || "inga"}, deferred ${validationDiagnostics.validationContext.deferredPriorities.join(", ") || "inga"}`
        : "- Validation context: saknas",
      `- Nyligen upprepade övningsmönster: ${debug?.repeatedAggregationKeys.length ?? 0}`,
      `- Debugnotering: ${debug?.note ?? snapshot.generatedWorkoutSummary?.plannerNote ?? "-"}`,
      "",
    );
  }

  lines.push(
    "## Frågor att analysera",
    "Viktigast att analysera: Försämras passet mellan “före normalisering” och “efter normalisering”, och i så fall exakt varför?",
    "",
    "Övrigt:",
    "1. Är /simulation konsekvent med veckoplanens rekommendation?",
    "   - Stämmer effektiv profil, mål, erfarenhetsnivå, utrustning och sportmål med det som används i planering och passgenerering?",
    "   - Finns konflikt mellan preset-profil och faktiska användarinställningar?",
    "",
    "2. Gör veckoplaneringen rimliga val?",
    "   - Väljer den rätt fokus utifrån mål, historik, missade pass, spontana pass och återhämtning?",
    "   - Justeras planeringen pedagogiskt efter korta, missade eller spontana pass?",
    "   - Är coachtexten konkret nog, eller mest generisk malltext?",
    "",
    "3. Blir rekommenderad passlängd realistisk?",
    "   - Anpassas längden efter faktisk typisk träningslängd?",
    "   - Är längden samtidigt ärlig i förhållande till målet, till exempel hypertrofi?",
    "   - Borde appen ge feedback om träningsgap eller låg träningsdos?",
    "",
    "4. Är AI-förslaget före normalisering bra?",
    "   - Följer råförslaget rekommenderat fokus?",
    "   - Är övningsvalen rimliga för mål, erfarenhetsnivå, utrustning, sportmål och passlängd?",
    "   - Finns uppenbara problem redan innan katalogmatchning/normalisering?",
    "",
    "5. Försämras passet av katalogmatchning, focus repair eller normalisering?",
    "   - Vilka bra övningar tas bort?",
    "   - Vilka sämre fallback-övningar läggs till?",
    "   - Tappas basövningar, prioriterade muskler, core, armar, vader, carry eller sportrelevanta övningar?",
    "   - Är focus integrity/strength specificity missvisande höga trots kvalitetsförlust?",
    "",
    "6. Får huvudmålet tillräckligt genomslag?",
    "   - För hypertrofi: finns tillräcklig basvolym, press/drag/ben/hinge och progressionsmöjlighet?",
    "   - Blir korta pass för generiska eller för tunna för målet?",
    "   - Behövs särskilda minimum templates för 15–25 eller 25–35 minuter?",
    "",
    "7. Får sportmålet lagom genomslag?",
    "   - Påverkar sportmålet övningsval och prioritering på ett rimligt sätt?",
    "   - Tar sportmålet över huvudmålet, eller syns det för lite?",
    "   - För surf_sports: syns rygg/lats, bål, höft, posterior chain, skulderkontroll och grepp/carry tillräckligt?",
    "",
    "8. Hanteras prioriterade och deferred muscles korrekt?",
    "   - Blir prioriterade muskler faktiskt tränade?",
    "   - Defereras samma muskler upprepade gånger?",
    "   - Är det missvisande att ange en muskel som priority om den nästan alltid kapas?",
    "",
    "9. Kapas vissa träningsdelar systematiskt?",
    "   - Core?",
    "   - Armar?",
    "   - Vader?",
    "   - Hamstrings/posterior chain?",
    "   - Carry/grepp?",
    "   - Triceps eller pressövningar?",
    "",
    "10. Upprepas samma övningar eller rörelsemönster för ofta?",
    "   - Är repetitionen rimlig progression eller bara fallback-bias?",
    "   - Blir passen för lika efter normalisering?",
    "   - Behövs variationsregler per rörelsemönster eller variantGroup?",
    "",
    "11. Finns förbjudna, olämpliga eller felplacerade övningar?",
    "   - Exempel: avancerade övningar för fel nivå, upper-body-övningar i lower-body-pass, eller övningar som inte passar återhämtning.",
    "   - Har tidigare problem som pike push-ups i lower_body eller assisterad pistol squat hos nybörjare försvunnit?",
    "",
    "12. Vad är den mest sannolika felkällan?",
    "   - Profil/inställningar?",
    "   - Veckoplanering?",
    "   - Coach decision?",
    "   - AI-prompt?",
    "   - Katalogmatchning?",
    "   - Normalisering/focus repair?",
    "   - Övningskatalogens metadata?",
    "   - Simuleringsscenariot/mock synthetic-pass?",
    "",
    "13. Vilka 3–5 konkreta kodförbättringar bör prioriteras?",
    "   - Skriv förbättringarna så att de kan omvandlas till Codex-instruktioner.",
    "   - Skilj mellan snabb fix, strukturell förbättring och debug/diagnostik.",
  );

  if (
    report.config.scenario === "spontaneous_lower_before_planned_lower" &&
    spontaneousCount === 0
  ) {
    lines.push(
      "",
      "## Scenariovarning",
      "- Scenario spontaneous_lower_before_planned_lower gav inga spontana pass i denna körning. Granska seed och vilodagar innan resultatet tolkas som planner-beteende.",
    );
  }

  return lines.join("\n");
}
