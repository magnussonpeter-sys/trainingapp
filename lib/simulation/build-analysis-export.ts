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
  const snapshotsForDuration = report.dailySnapshots.filter(
    (snapshot) =>
      snapshot.dayEvent !== "rest" || snapshot.generationStatus === "generation_failed",
  );
  const exportSnapshots = report.dailySnapshots;
  const scenarioCompletedCount = report.dailySnapshots.filter(
    (snapshot) => snapshot.userOutcome === "completed",
  ).length;
  const completedCount = report.dailySnapshots.filter(
    (snapshot) => snapshot.workoutResult?.completed,
  ).length;
  const missedCount = report.dailySnapshots.filter(
    (snapshot) => snapshot.userOutcome === "user_missed",
  ).length;
  const generationFailedCount = report.dailySnapshots.filter(
    (snapshot) => snapshot.generationStatus === "generation_failed",
  ).length;
  const spontaneousCount = report.dailySnapshots.filter(
    (snapshot) => snapshot.dayEvent === "spontaneous_training",
  ).length;
  const avgActualDuration =
    snapshotsForDuration.length > 0
      ? Math.round(
          snapshotsForDuration.reduce(
            (sum, snapshot) => sum + (snapshot.workoutResult?.actualDurationMin ?? 0),
            0,
          ) / snapshotsForDuration.length,
        )
      : 0;
  const avgPlannedDuration =
    snapshotsForDuration.length > 0
      ? Math.round(
          snapshotsForDuration.reduce(
            (sum, snapshot) =>
              sum + (snapshot.workoutResult?.plannedDurationMin ?? snapshot.plannedTraining.targetDurationMin),
            0,
          ) / snapshotsForDuration.length,
        )
      : 0;
  const durationDebugEntries = snapshotsForDuration
    .map((snapshot) => dayDebugByIndex.get(snapshot.dayIndex)?.realAppPlanner)
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
  const avgOriginalRecommendedDuration =
    durationDebugEntries.length > 0
      ? Math.round(
          durationDebugEntries.reduce(
            (sum, entry) =>
              sum +
              (entry.actualRecommendedDurationBeforeAdjustment ??
                entry.suggestedNextDurationMinutes),
            0,
          ) / durationDebugEntries.length,
        )
      : avgPlannedDuration;
  const avgAdjustedRecommendedDuration =
    durationDebugEntries.length > 0
      ? Math.round(
          durationDebugEntries.reduce(
            (sum, entry) =>
              sum +
              (entry.actualRecommendedDurationAfterAdjustment ??
                entry.suggestedNextDurationMinutes),
            0,
          ) / durationDebugEntries.length,
        )
      : avgPlannedDuration;

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
    `- Genereringsmotor: ${report.config.generationMode ?? "legacy_ai_chain"}`,
    `- Scenario: ${report.config.scenario ?? "normal"}`,
    `- Startdatum: ${report.config.startDate}`,
    `- Antal dagar: ${report.config.totalDays}`,
    `- Seed: ${report.config.randomSeed}`,
    `- Training dose mode: ${report.trainingDoseMode ?? "recommended"}`,
    `- Målpass per vecka: ${report.targetSessionsPerWeek ?? report.profile.preferredWorkoutDaysPerWeek}`,
    `- Tillgängliga träningsdagar: ${report.availableTrainingDayLabels?.join(", ") || "inga"}`,
    `- Planerade träningsdagar: ${report.plannedWorkoutDayLabels.join(", ") || "inga"}`,
    `- Antal tillgängliga dagar: ${report.availableTrainingDayIndices?.length ?? 0}`,
    `- Antal planerade dagar: ${report.plannedWorkoutDayIndices.length}`,
    `- Preferred days treated as availability: ${report.preferredDaysWereUsedAsAvailability ? "true" : "false"}`,
    `- Planner reduced available days to target sessions: ${report.plannedDaysWereClampedToTargetSessions ? "true" : "false"}`,
    `- High frequency warning shown: ${report.highFrequencyWarningShown ? "true" : "false"}`,
    `- Tillgänglig utrustning: ${report.profile.availableEquipmentIds.join(", ") || "okänd"}`,
    report.effectiveUserProfile
      ? `- Effektiv utrustning: ${report.effectiveUserProfile.effectiveEquipment.join(", ") || "okänd"}`
      : "- Effektiv utrustning: saknas",
    report.effectiveUserProfile?.warnings.length
      ? `- Profilvarningar: ${report.effectiveUserProfile.warnings.join("; ")}`
      : "- Profilvarningar: inga",
    `- Max AI-pass: ${report.config.maxAiGeneratedWorkouts ?? "n/a"}`,
    `- Faktiska AI-anrop: ${report.actualAiAttemptCount ?? report.aiGeneratedWorkoutCount ?? 0}`,
    `- Riktiga AI-pass: ${report.aiGeneratedWorkoutCount ?? 0}`,
    `- Safe template valid: ${report.dailySnapshots.filter((snapshot) => snapshot.generationStatus === "safe_template_valid").length}`,
    `- AI-fallback/mock: ${report.aiFallbackWorkoutCount ?? 0}`,
    "",
    "## Sammanfattning",
    `- Planerade pass: ${report.dailySnapshots.filter((snapshot) => snapshot.plannedTraining.isPlannedTrainingDay).length}`,
    `- Scenario completed-dagar: ${scenarioCompletedCount}`,
    `- Genomförda pass: ${completedCount}`,
    `- Missade pass: ${missedCount}`,
    `- Genereringsfel: ${generationFailedCount}`,
    `- Fallbackförsök: ${report.fallbackAttemptCount ?? report.aiFallbackWorkoutCount ?? 0}`,
    `- Underkända fallbackförsök: ${report.fallbackValidationFailureCount ?? 0}`,
    `- Spontana pass: ${spontaneousCount}`,
    `- Genomsnittlig ursprunglig rekommenderad duration: ${avgOriginalRecommendedDuration} min`,
    `- Genomsnittlig justerad rekommenderad duration: ${avgAdjustedRecommendedDuration} min`,
    `- Genomsnittlig faktisk duration: ${avgActualDuration} min`,
    `- Genomsnittlig planerad duration: ${avgPlannedDuration} min`,
    `- Utvärdering: ${report.evaluation.summary}`,
    "",
    "## Per träningsdag",
  ];

  for (const snapshot of exportSnapshots) {
    const debug = dayDebugByIndex.get(snapshot.dayIndex);
    const plannerSummary = debug?.realAppPlanner;
    const historySummary = debug?.trainingHistoryContextSummary;
    const validationDiagnostics = debug?.validationDiagnostics;
    lines.push(
      `### Dag ${snapshot.dayIndex + 1} – ${snapshot.date} (${snapshot.plannedTraining.weekday})`,
      `- Händelse: ${dayEventLabel(snapshot.dayEvent)}`,
      `- Planerad av scenario: ${snapshot.plannedByScenario ? "ja" : "nej"}`,
      `- User outcome: ${snapshot.userOutcome}`,
      `- Generation status: ${snapshot.generationStatus}`,
      `- Real AI försökt: ${plannerSummary?.attemptedRealAi ? "ja" : "nej"}`,
      `- Fallback använd: ${plannerSummary?.usedFallback ? "ja" : "nej"}`,
      `- Genereringsorsak: ${plannerSummary?.realAiFailureReason ?? snapshot.generatedWorkoutSummary?.fallbackFailureReasons?.join(", ") ?? "-"}`,
      `- Planner mode: ${debug?.plannerMode ?? report.config.plannerMode}`,
      `- Planner source: ${snapshot.generatedWorkoutSummary?.plannerSource ?? "-"}`,
      `- Rekommenderat fokus: ${plannerSummary?.suggestedNextWorkoutFocus ?? plannerSummary?.suggestedNextFocus ?? "-"}`,
      `- Rekommenderad längd: ${plannerSummary?.suggestedNextDurationMinutes ?? snapshot.plannedTraining.targetDurationMin} min`,
      typeof plannerSummary?.planningDurationBucket === "number"
        ? `- Intern duration bucket: ${plannerSummary.planningDurationBucket} min${typeof plannerSummary.displayDurationMinutes === "number" ? ` (display ${plannerSummary.displayDurationMinutes} min)` : ""}`
        : "- Intern duration bucket: saknas",
      `- Faktisk längd: ${snapshot.workoutResult?.actualDurationMin ?? 0} min`,
      `- Coachtext: ${plannerSummary?.coachText ?? debug?.note ?? "-"}`,
      `- Priority muscles: ${plannerSummary?.priorityMuscles.join(", ") || "inga"}`,
      `- Recovery-limited muscles: ${plannerSummary?.recoveryLimitedMuscles.join(", ") || "inga"}`,
      `- Genereringsmotor använd: ${plannerSummary?.generationEngineUsed ?? report.config.generationMode ?? "legacy_ai_chain"}${plannerSummary?.generationFallbackUsed ? ` (fallback från slot: ${plannerSummary.generationFallbackReason ?? "okänd orsak"})` : ""}`,
      plannerSummary?.generationComparison
        ? `- Jämförelse legacy vs slot: vald ${plannerSummary.generationComparison.selectedEngine}, legacy ok=${plannerSummary.generationComparison.legacyPassed ? "ja" : "nej"}, slot ok=${plannerSummary.generationComparison.slotPassed ? "ja" : "nej"}, legacy övningar=${plannerSummary.generationComparison.legacyExerciseCount ?? "-"}, slot övningar=${plannerSummary.generationComparison.slotExerciseCount ?? "-"}, vald orsak=${plannerSummary.generationComparison.selectedBecause}`
        : "- Jämförelse legacy vs slot: ej körd",
      historySummary
        ? `- Training history context: ${historySummary.recentWorkoutsCount} recent, ${historySummary.progressionMemoryExerciseCount} progression, ${historySummary.mediumTermWindowDays} dagar, data ${historySummary.dataQuality}${typeof historySummary.typicalWorkoutDurationMinutes === "number" ? `, typisk längd ${historySummary.typicalWorkoutDurationMinutes} min` : ""}`
        : "- Training history context: saknas",
      `- Passgenerering: ${snapshot.generatedWorkoutSummary?.passGenerationMode ?? "okänd"}`,
      `- Före normalisering: ${debug?.beforeNormalization.map((exercise) => exercise.exerciseName).join(", ") || "saknas"}`,
      `- Efter normalisering: ${debug?.afterNormalization.map((exercise) => exercise.exerciseName).join(", ") || "saknas"}`,
      validationDiagnostics
        ? `- AI huvudövningar: mål ${validationDiagnostics.targetMainExerciseCount ?? "-"}, AI föreslog ${validationDiagnostics.actualMainExerciseCountFromAi ?? "-"}, finalt ${validationDiagnostics.finalMainExerciseCount ?? "-"}, bonus ${validationDiagnostics.optionalBonusExerciseCount ?? 0}`
        : "- AI huvudövningar: saknas",
      validationDiagnostics?.trimmedBecauseTooManyExercises
        ? `- AI-trimning: ja (${validationDiagnostics.trimmedExercises?.map((entry) => `${entry.name} [${entry.role ?? "okänd roll"}] -> ${entry.trimReason}`).join("; ") || "okänd trimning"})`
        : "- AI-trimning: nej",
      validationDiagnostics?.keptExerciseRoles?.length
        ? `- Behållna AI-roller: ${validationDiagnostics.keptExerciseRoles.join(", ")}`
        : "- Behållna AI-roller: saknas",
      validationDiagnostics?.lostExerciseRoles?.length
        ? `- Tappade AI-roller vid trimning: ${validationDiagnostics.lostExerciseRoles.join(", ")}`
        : "- Tappade AI-roller vid trimning: inga",
      typeof validationDiagnostics?.fallbackAddedDespiteEnoughAiExercises === "boolean"
        ? `- Fallback trots tillräckligt många AI-övningar: ${validationDiagnostics.fallbackAddedDespiteEnoughAiExercises ? "ja" : "nej"}`
        : "- Fallback trots tillräckligt många AI-övningar: okänt",
      validationDiagnostics?.bonusExercisesRejectedReason?.length
        ? `- Bonusövningar utanför huvudpasset: ${validationDiagnostics.bonusExercisesRejectedReason.join("; ")}`
        : "- Bonusövningar utanför huvudpasset: inga eller saknas",
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
      validationDiagnostics?.safetyGateTriggered
        ? `- Safety gate: aktiv (${validationDiagnostics.safetyGateRecoveryMode ?? "okänd strategi"}) eftersom ${validationDiagnostics.safetyGateReasons.join(", ")}`
        : "- Safety gate: inte triggad",
      validationDiagnostics?.priorityMuscleResolutionStatus.length
        ? `- Priority status: ${validationDiagnostics.priorityMuscleResolutionStatus.map((entry) => `${entry.muscle}=${entry.status}`).join(", ")}`
        : "- Priority status: saknas",
      validationDiagnostics?.durationTrimReason
        ? `- Duration trim: ${validationDiagnostics.durationTrimReason}`
        : "- Duration trim: ingen särskild trimning",
      validationDiagnostics?.durationTrimWarnings?.length
        ? `- Duration trim-varningar: ${validationDiagnostics.durationTrimWarnings.join("; ")}`
        : "- Duration trim-varningar: inga",
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
