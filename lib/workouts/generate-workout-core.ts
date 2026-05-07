import OpenAI from "openai";

import {
  getAvailableExercises,
  getAvailableProgressionTracks,
  getSportRelevanceHint,
} from "@/lib/exercise-catalog";
import { normalizePreviewWorkout } from "@/lib/workout-flow/normalize-preview-workout";
import {
  validateGeneratedWorkout,
  getTargetMainExerciseCount,
  type AiGeneratedWorkoutCandidate,
  type GeneratedWorkoutValidationFocusContext,
} from "@/lib/workout-flow/validate-generated-workout";
import {
  buildTrainingHistoryContext,
  type TrainingHistoryContext,
} from "@/lib/planning/training-history-context";
import type {
  ConfidenceScore,
  MuscleBudgetEntry,
  MuscleBudgetGroup,
} from "@/lib/planning/muscle-budget";
import type { TrainingGap } from "@/lib/planning/training-gap";
import type { WeeklyPlanContext } from "@/lib/planning/weekly-plan";
import type { WorkoutLog } from "@/lib/workout-log-storage";
import type { PlannedTrainingMode } from "@/lib/weekly-workout-structure";
import {
  normalizeSportFocus,
  type SportFocus,
} from "@/types/training-profile";
import type { Workout, WorkoutFocus } from "@/types/workout";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export type UserSettingsSummary = {
  sex?: string | null;
  age?: number | null;
  weight_kg?: number | null;
  height_cm?: number | null;
  experience_level?: string | null;
  training_goal?: string | null;
  sport_focus?: SportFocus | null;
  avoid_supersets?: boolean | null;
  superset_preference?: "allowed" | "avoid_all" | "avoid_all_dumbbell" | null;
  primary_priority_muscle?: string | null;
  secondary_priority_muscle?: string | null;
  tertiary_priority_muscle?: string | null;
};

export type GymEquipmentPromptItem = {
  equipment_type?: string | null;
  equipmentType?: string | null;
  label?: string | null;
  weights_kg?: number[] | null;
  quantity?: number | null;
};

export type WeeklyPlanPromptItem = {
  date?: string | null;
  dayLabel?: string | null;
  focus?: WorkoutFocus | null;
  type?: "training" | "recovery" | null;
};

export type WeeklyBudgetPromptItem = Pick<
  MuscleBudgetEntry,
  | "group"
  | "label"
  | "priority"
  | "targetSets"
  | "completedSets"
  | "effectiveSets"
  | "remainingSets"
  | "recent4WeekAvgSets"
  | "loadStatus"
>;

type WeeklyBudgetValidationItem = Pick<
  MuscleBudgetEntry,
  "group" | "remainingSets" | "priority"
> & {
  loadStatus?: MuscleBudgetEntry["loadStatus"];
};

export type TrainingGapPromptItem = Pick<
  TrainingGap,
  | "status"
  | "completionRatio"
  | "plannedSessions"
  | "completedSessions"
  | "plannedMinutes"
  | "completedMinutes"
  | "missingMinutes"
  | "missingSets"
  | "missingMuscles"
  | "message"
  | "suggestedCatchUpOptions"
  | "thirtyDayEffect"
>;

export type PlanModePromptItem = PlannedTrainingMode;
export type WeeklyPlanContextPromptItem = WeeklyPlanContext;
export type TrainingHistoryContextPromptItem = TrainingHistoryContext;
export type PlanIntentionSource = "weekly_plan" | "adaptive_fallback";

export type FocusMuscle =
  | "chest"
  | "back"
  | "quads"
  | "hamstrings"
  | "glutes"
  | "shoulders"
  | "biceps"
  | "triceps"
  | "calves"
  | "core";

export type SupersetPreference = "allowed" | "avoid_all" | "avoid_all_dumbbell";

type ProgressionTrackPromptItem = {
  name: string;
  intent: string;
  stepNames: string[];
};

function getOptionalBonusInstruction(params: {
  goal: string;
  nextFocus: WorkoutFocus | null;
  sportFocus: SportFocus;
}) {
  if (params.nextFocus === "upper_body") {
    return params.sportFocus === "surf_sports"
      ? "Bonusövningar får i första hand vara carry, bål/skulderkontroll eller extra armar."
      : "Bonusövningar får i första hand vara extra biceps, triceps, skulderaccessoar eller bål.";
  }

  if (params.nextFocus === "lower_body") {
    return "Bonusövningar får i första hand vara vader, bål eller glute/posterior-chain-accessoar.";
  }

  if (params.nextFocus === "full_body") {
    return "Bonusövningar får i första hand vara bål, carry eller en liten prioriterad accessoar som inte stör huvudrollerna.";
  }

  if (params.goal === "strength") {
    return "Var försiktig med bonusövningar. De ska inte störa huvudlyft eller progression.";
  }

  return "Bonusövningar är valfria och får bara föreslås om huvudpasset redan är komplett.";
}

export type GenerateWorkoutWithAiCoreInput = {
  goal: string;
  durationMinutes: number;
  equipment: string[];
  gymEquipmentDetails: GymEquipmentPromptItem[];
  gym: string | null;
  gymLabel: string | null;
  confidenceScore: ConfidenceScore | null;
  nextFocus: WorkoutFocus | null;
  splitStyle: string | null;
  weeklyBudget: WeeklyBudgetPromptItem[];
  weeklyPlan: WeeklyPlanPromptItem[];
  selectedPlanMode: PlanModePromptItem | null;
  focusIntent: string | null;
  targetMuscles: MuscleBudgetGroup[];
  avoidMuscles: MuscleBudgetGroup[];
  limitedMuscles: MuscleBudgetGroup[];
  weeklyPlanContext: WeeklyPlanContextPromptItem | null;
  trainingGap: TrainingGapPromptItem | null;
  lessOftenExerciseIds: string[];
  focusMuscles: FocusMuscle[];
  avoidSupersets: boolean;
  supersetPreference: SupersetPreference | null;
  settings: UserSettingsSummary | null;
  historyLogs: WorkoutLog[];
};

export type GenerateWorkoutWithAiCoreResult =
  | {
      ok: true;
      workout: Workout;
    }
  | {
      ok: false;
      status: number;
      error: string;
    };

function hasCompletedSets(exercise: { sets?: unknown[] }) {
  return Array.isArray(exercise.sets) && exercise.sets.length > 0;
}

function safeParseJSON(text: string) {
  const trimmed = text.trim();

  try {
    return JSON.parse(trimmed);
  } catch {
    const codeBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);

    if (codeBlockMatch?.[1]) {
      try {
        return JSON.parse(codeBlockMatch[1]);
      } catch {
        return null;
      }
    }

    return null;
  }
}

export function normalizeSupersetPreference(value: unknown): SupersetPreference | null {
  return value === "allowed" ||
    value === "avoid_all" ||
    value === "avoid_all_dumbbell"
    ? value
    : null;
}

export function normalizeFocusMuscles(input: unknown): FocusMuscle[] {
  const allowed = new Set<FocusMuscle>([
    "chest",
    "back",
    "quads",
    "hamstrings",
    "glutes",
    "shoulders",
    "biceps",
    "triceps",
    "calves",
    "core",
  ]);

  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .filter(
      (value): value is FocusMuscle =>
        typeof value === "string" && allowed.has(value as FocusMuscle),
    )
    .slice(0, 5);
}

export function getLongTermPriorityMuscles(params: {
  settings: UserSettingsSummary | null;
  weeklyPlanContext: WeeklyPlanContextPromptItem | null;
}) {
  const weeklyPlanPriorities =
    params.weeklyPlanContext?.longTermPriorityMuscles ??
    params.weeklyPlanContext?.profilePriorityMuscles ??
    [];

  if (weeklyPlanPriorities.length > 0) {
    return weeklyPlanPriorities;
  }

  const priorities = [
    params.settings?.primary_priority_muscle,
    params.settings?.secondary_priority_muscle,
    params.settings?.tertiary_priority_muscle,
  ].filter(
    (value): value is MuscleBudgetGroup =>
      typeof value === "string" && value.length > 0,
  );

  return Array.from(new Set(priorities));
}

function buildSportFocusPromptInstruction(
  sportFocus: SportFocus,
  trainingGoal: string,
) {
  return `
Användarens träningsinriktning är: ${sportFocus}.
Huvudmålet är: ${trainingGoal}.

Sportinriktningen är sekundär och får inte ta över passet.

Justera träningen enligt:
- running: höft, vader, säte, enbensstyrka, undvik onödig tung ben-DOMS
- cross_country_skiing: bål, dragstyrka, lats, uthållighet, höftdriv
- alpine_skiing: benstyrka, excentrisk kontroll, enbensstyrka, bål
- cycling: säte, lår, bål, undvik överdriven benvolym
- ball_sports: acceleration, riktningsförändring, hamstrings, adduktorer
- swimming: dragstyrka, skulderkontroll, rotatorcuff, undvik tung press vid trötta axlar
- golf: rotation, antirotation, höftkontroll, bål
- surf_sports: grepp, dragstyrka, bål, balans, undvik för mycket press
- general_athletic: balanserad helkropp
- none: ingen justering

Respektera alltid:
- utrustning
- passlängd
- historik
- överbelastning
`.trim();
}

function buildRecentExercisePreferences(logs: WorkoutLog[]) {
  const recentExerciseIds = new Set<string>();
  const recentExerciseNames = new Set<string>();

  for (const log of logs.slice(0, 3)) {
    if (!Array.isArray(log.exercises)) {
      continue;
    }

    for (const exercise of log.exercises) {
      if (!hasCompletedSets(exercise)) {
        continue;
      }

      if (typeof exercise.exerciseId === "string" && exercise.exerciseId.trim()) {
        recentExerciseIds.add(exercise.exerciseId.trim());
      }

      if (
        typeof exercise.exerciseName === "string" &&
        exercise.exerciseName.trim()
      ) {
        recentExerciseNames.add(exercise.exerciseName.trim());
      }
    }
  }

  return {
    recentExerciseIds: Array.from(recentExerciseIds),
    recentExerciseNames: Array.from(recentExerciseNames),
  };
}

function buildAvailableExercisePrompt(
  availableExercises: ReturnType<typeof getAvailableExercises>,
  sportFocus?: SportFocus | null,
) {
  return availableExercises
    .map((exercise) => {
      const dose =
        typeof exercise.defaultDuration === "number" && !exercise.defaultReps
          ? `${exercise.defaultSets} x ${exercise.defaultDuration}s`
          : `${exercise.defaultSets} x ${exercise.defaultReps ?? 10}`;
      const sportRelevanceHint = getSportRelevanceHint(exercise, sportFocus);

      const promptParts = [
        `- id: ${exercise.id}`,
        `namn: ${exercise.name}`,
        `mönster: ${exercise.movementPattern}`,
        `utrustning: ${exercise.requiredEquipment.join(", ")}`,
        `primära muskler: ${exercise.primaryMuscles.join(", ")}`,
        `sekundära muskler: ${exercise.secondaryMuscles?.join(", ") ?? "inga"}`,
        `variantgrupp: ${exercise.variantGroup}`,
        `standard: ${dose}`,
        `vila: ${exercise.defaultRest}s`,
      ];

      if (sportFocus && sportFocus !== "none" && sportRelevanceHint > 0) {
        promptParts.push(`sportRelevanceHint: ${sportRelevanceHint}`);
      }

      return promptParts.join(" | ");
    })
    .join("\n");
}

function buildProgressionTrackPrompt(availableEquipment: string[]) {
  const availableExercises = getAvailableExercises(availableEquipment);
  const availableExerciseNames = new Map(
    availableExercises.map((exercise) => [exercise.id, exercise.name]),
  );
  const tracks = getAvailableProgressionTracks(availableEquipment);

  if (tracks.length === 0) {
    return {
      text: "inga tydliga progressionstrappor tillgängliga i denna miljö",
      items: [] as ProgressionTrackPromptItem[],
    };
  }

  const items = tracks.map((track) => ({
    name: track.name,
    intent: track.intent,
    stepNames: track.availableStepIds.map(
      (stepId) => availableExerciseNames.get(stepId) ?? stepId,
    ),
  }));

  return {
    items,
    text: items
      .map(
        (track) =>
          `- ${track.name}: ${track.stepNames.join(" -> ")}. Syfte: ${track.intent}`,
      )
      .join("\n"),
  };
}

function buildGenerationPrompt(params: {
  availableExercisePrompt: string;
  durationMinutes: number;
  equipment: string[];
  gymEquipmentDetails: GymEquipmentPromptItem[];
  goal: string;
  gym: string | null;
  gymLabel: string | null;
  confidenceScore: ConfidenceScore | null;
  nextFocus: WorkoutFocus | null;
  recentExerciseIds: string[];
  recentExerciseNames: string[];
  trainingHistoryContext: TrainingHistoryContextPromptItem | null;
  settings: UserSettingsSummary | null;
  splitStyle: string | null;
  supersetPreference: SupersetPreference;
  weeklyBudget: WeeklyBudgetPromptItem[];
  weeklyPlan: WeeklyPlanPromptItem[];
  planIntentionSource: PlanIntentionSource;
  selectedPlanMode: PlanModePromptItem | null;
  focusIntent: string | null;
  targetMuscles: MuscleBudgetGroup[];
  avoidMuscles: MuscleBudgetGroup[];
  limitedMuscles: MuscleBudgetGroup[];
  trainingGap: TrainingGapPromptItem | null;
  weeklyPlanContext: WeeklyPlanContextPromptItem | null;
  longTermPriorityMuscles: MuscleBudgetGroup[];
  lessOftenExerciseIds?: string[];
  focusMuscles?: FocusMuscle[];
}) {
  const targetMainExerciseCount = getTargetMainExerciseCount(
    params.durationMinutes,
    params.goal === "strength" ||
      params.goal === "hypertrophy" ||
      params.goal === "health" ||
      params.goal === "body_composition"
      ? params.goal
      : "health",
    params.nextFocus,
  );
  const trainingHistoryText = params.trainingHistoryContext
    ? JSON.stringify(params.trainingHistoryContext, null, 2)
    : "null";
  const settingsText = params.settings ? JSON.stringify(params.settings, null, 2) : "null";
  const equipmentText =
    params.equipment.length > 0 ? params.equipment.join(", ") : "bodyweight";
  const gymEquipmentDetailText =
    params.gymEquipmentDetails.length > 0
      ? JSON.stringify(params.gymEquipmentDetails, null, 2)
      : "[]";
  const recentExerciseIdsText =
    params.recentExerciseIds.length > 0
      ? params.recentExerciseIds.join(", ")
      : "inga";
  const recentExerciseNamesText =
    params.recentExerciseNames.length > 0
      ? params.recentExerciseNames.join(", ")
      : "inga";
  const weeklyPlanText =
    params.weeklyPlan.length > 0 ? JSON.stringify(params.weeklyPlan, null, 2) : "[]";
  const weeklyBudgetText =
    params.weeklyBudget.length > 0
      ? JSON.stringify(params.weeklyBudget, null, 2)
      : "[]";
  const underservedMusclesText =
    params.weeklyBudget
      .filter((entry) => entry.remainingSets > 0)
      .sort((left, right) => right.remainingSets - left.remainingSets)
      .slice(0, 5)
      .map((entry) => entry.group)
      .join(", ") || "inga tydliga";
  const overloadedMusclesText =
    params.weeklyBudget
      .filter(
        (entry) => entry.loadStatus === "high_risk" || entry.loadStatus === "over",
      )
      .map((entry) => entry.group)
      .join(", ") || "inga tydliga";
  const trainingGapText = params.trainingGap
    ? JSON.stringify(params.trainingGap, null, 2)
    : "null";
  const weeklyPlanContextText = params.weeklyPlanContext
    ? JSON.stringify(params.weeklyPlanContext, null, 2)
    : "null";
  const longTermPriorityMusclesText =
    params.longTermPriorityMuscles.length > 0
      ? params.longTermPriorityMuscles.join(", ")
      : "inga tydliga";
  const targetMusclesText =
    params.targetMuscles.length > 0 ? params.targetMuscles.join(", ") : "inga";
  const avoidMusclesText =
    params.avoidMuscles.length > 0 ? params.avoidMuscles.join(", ") : "inga";
  const limitedMusclesText =
    params.limitedMuscles.length > 0 ? params.limitedMuscles.join(", ") : "inga";
  const nextFocusText = params.nextFocus ?? "full_body";
  const confidenceText = params.confidenceScore ?? "medium";
  const splitStyleText = params.splitStyle ?? "adaptive";
  const supersetPreferenceText =
    params.supersetPreference === "avoid_all"
      ? "AVOID"
      : params.supersetPreference === "avoid_all_dumbbell"
        ? "AVOID_ALL_DUMBBELL_SUPERSETS"
        : "ALLOWED";
  const progressionTracks = buildProgressionTrackPrompt(params.equipment);
  const requestedFocusMusclesText =
    params.focusMuscles && params.focusMuscles.length > 0
      ? params.focusMuscles.join(", ")
      : "inga uttryckligt valda fokusmuskler";
  const sportFocus = normalizeSportFocus(params.settings?.sport_focus);
  const sportFocusInstruction = buildSportFocusPromptInstruction(
    sportFocus,
    params.goal,
  );
  const optionalBonusInstruction = getOptionalBonusInstruction({
    goal: params.goal,
    nextFocus: params.nextFocus,
    sportFocus,
  });

  return `
Skapa ett evidensbaserat träningspass som strikt JSON.

Du får själv bestämma blockstruktur och ordning, men passet måste vara realistiskt, välbalanserat och följa grundläggande träningsprinciper.

Kontext:
- mål: ${params.goal}
- passlängd: cirka ${params.durationMinutes} minuter
- exakt antal huvudövningar som ska genereras: ${targetMainExerciseCount}
- gym-id: ${params.gym ?? "saknas"}
- gymnamn: ${params.gymLabel ?? "saknas"}
- tillgänglig utrustning: ${equipmentText}
- registrerade vikter/utrustningsdetaljer i gymmet: ${gymEquipmentDetailText}
- användarinställningar: ${settingsText}
- träningsinriktning (sekundär till huvudmålet): ${sportFocus}
- strukturerat träningsminne: ${trainingHistoryText}
- senaste övnings-id:n: ${recentExerciseIdsText}
- senaste övningsnamn: ${recentExerciseNamesText}
- rekommenderat fokus för nästa pass: ${nextFocusText}
- confidence score för planeringen: ${confidenceText}
- föreslagen split-stil denna vecka: ${splitStyleText}
- veckans muskelbudget och återstående set: ${weeklyBudgetText}
- enkel veckoplan för kommande 7 dagar: ${weeklyPlanText}
- automatisk veckoplan för denna vecka: ${weeklyPlanContextText}
- regelbaserat träningsgap för veckan: ${trainingGapText}
- primär planintention för detta pass: ${params.planIntentionSource}
- planläge från lokala coachmotorn: ${params.selectedPlanMode ?? "normal_training"}
- planens fokusavsikt: ${params.focusIntent ?? "ingen extra fokusavsikt"}
- targetMuscles: ${targetMusclesText}
- avoidMuscles: ${avoidMusclesText}
- limitedMuscles: ${limitedMusclesText}
- långsiktigt prioriterade muskler: ${longTermPriorityMusclesText}
- muscles som fortfarande behöver volym: ${underservedMusclesText}
- muscles som är överbelastade eller bör skyddas: ${overloadedMusclesText}
- uttryckligt valda fokusmuskler för detta builder-pass: ${requestedFocusMusclesText}
- superset-preferens: ${supersetPreferenceText}
- övningar användaren vill ha mindre av: ${
    params.lessOftenExerciseIds && params.lessOftenExerciseIds.length > 0
      ? params.lessOftenExerciseIds.join(", ")
      : "inga uttryckliga negativa preferenser"
  }

Sportinriktning:
${sportFocusInstruction}

${
  sportFocus !== "none"
    ? "Vissa övningar har sportRelevanceHint. Använd detta som en svag positiv signal när flera övningar annars är lika bra. Det är inte ett krav. Välj fortfarande efter huvudmål, utrustning, muskelbudget, historik, överbelastning, risknivå och passlängd."
    : ""
}

${
  params.selectedPlanMode === "selective_priority_accessory"
    ? "Skapa ett lätt och selektivt pass. Välj i första hand övningar som direkt träffar targetMuscles. Undvik övningar där avoidMuscles är primära. Undvik också övningar där avoidMuscles får stor indirekt volym. Håll totalvolym och intensitet låg."
    : params.selectedPlanMode === "light_accessory"
      ? "Skapa ett lätt tillbehörspass. Håll systemisk belastning låg och prioritera låg-risk-volym framför tung progression."
      : params.selectedPlanMode === "recovery_mobility"
        ? "Återhämtning rekommenderas. Om du ändå måste generera ett pass ska det vara mycket lätt, kort och utan tydlig volymdrivning för already overloaded muscles."
        : ""
}

Tillgängliga övningar från katalogen:
${params.availableExercisePrompt}

Kända progressionsstegar i denna miljö:
${progressionTracks.text}

Viktförslag:
- Om övningen använder extern belastning ska du fylla i suggestedWeight med ett realistiskt startförslag i kg.
- suggestedWeight ska för en övning utan tidigare historik uppskattas utifrån användarens kön, kroppsvikt, ålder, träningsvana och den aktuella övningens karaktär.
- Anpassa viktförslaget till övningens risknivå, repintervall och om övningen är unilateral, bilateral, hantel per hand eller total skivstångsvikt.
- Var konservativ för nybörjare, låg confidence score, högre ålder och tekniskt krävande övningar.
- Om registrerade vikter finns i gymmet ska du försöka lägga suggestedWeight nära en rimlig faktisk vikt i gymmet.
- För kroppsviktsövningar eller tidsstyrda övningar där extern vikt inte är relevant ska suggestedWeight vara null.
- Om du är osäker mellan två nivåer, välj den lättare och säkrare nivån.
- Use thirtyDayEffect only as coaching context. Do not claim measured muscle growth.
- Phrase long-term adaptations as likely training stimulus, not exact outcomes.
- Följ användarens uttryckliga längdval om en sådan finns i requesten. Om längden känns osäker, använd veckoplanens suggestedNextDurationMinutes som mjuk riktning.
- Tolka preferredDays, flexibility och coachText i veckoplanen som mjuk coachkontext. Det är hjälp för veckan, inte ett hårt schema som måste följas exakt.
- Om primär planintention är weekly_plan ska weeklyPlanContext styra huvudfokus, längd och coachavsikt. Använd weeklyBudget och trainingGap som kompletterande analys, inte som konkurrerande plan.
- Kompensera inte missade pass aggressivt. Välj hellre ett genomförbart pass än ett långt kompensationspass.
- Om användaren spontant har tränat extra denna vecka ska du undvika att överbelasta samma muskler igen.
- Använd recentWorkouts i träningsminnet för återhämtning, variation och att inte upprepa samma upplägg för tätt.
- Använd exerciseProgressionMemory för suggestedWeight, progression och rimliga reps även om övningen inte låg i de 3 senaste passen.
- Använd mediumTermTrainingSummary för att förstå typisk passlängd, träningsvanor och volymmönster.
- Om dataQuality i träningsminnet är limited eller mixed ska progression och viktökningar vara försiktiga.
- Om exakt övning saknas men variantgrupp finns i progression memory kan du använda variantgruppen som försiktig vägledning.
- Långsiktigt prioriterade muskler är mjuka coachsignaler. Väg in dem extra när det är förenligt med återhämtning och veckobehov, men överbelasta dem inte.

För korta pass ska du tänka i denna ordning:
1. välj blockstruktur
2. välj om block ska vara straight_sets eller superset
3. välj övningar som passar varje block
4. fyll sedan in sets, reps, vila och coachning
5. håll dig till exakt ${targetMainExerciseCount} huvudövningar i huvudpasset

Output-format:
{
  "name": "...",
  "duration": number,
  "rationale": "kort motivering",
  "superset_considered": boolean,
  "superset_reason": "kort förklaring till varför du använde eller inte använde superset",
  "blocks": [
    {
      "type": "straight_sets | superset",
      "title": "...",
      "purpose": "kort syfte",
      "coach_note": "kort coachning på max 15 ord",
      "target_rpe": number | null,
      "target_rir": number | null,
      "rounds": number | null,
      "restBetweenExercises": number | null,
      "restAfterRound": number | null,
      "exercises": [
        {
          "id": "måste vara ett id från katalogen ovan",
          "name": "matchande namn",
          "sets": number,
          "reps": number | null,
          "duration": number | null,
          "rest": number,
          "suggestedWeight": number | null,
          "movementPattern": "movement pattern från katalogen",
          "role": "kort träningsroll, till exempel main_push eller direct_triceps",
          "priorityRank": number,
          "canDropIfShort": boolean,
          "intensityTag": "primary | secondary | accessory | finisher",
          "rationale": "kort motivering",
          "reason": "kort motivering till varför övningen är med"
        }
      ],
      "warmup": {
        "recommended": boolean,
        "instruction": "kort uppvärmningsinstruktion om relevant"
      }
    }
  ],
  "optionalBonusExercises": [
    {
      "id": "måste vara ett id från katalogen ovan",
      "name": "matchande namn",
      "sets": number,
      "reps": number | null,
      "duration": number | null,
      "rest": number,
      "suggestedWeight": number | null,
      "movementPattern": "movement pattern från katalogen",
      "role": "bonusroll",
      "priorityRank": number,
      "canDropIfShort": true,
      "intensityTag": "accessory",
      "rationale": "kort motivering",
      "reason": "extra övning om tid finns"
    }
  ]
}

Viktiga regler:
- Svara endast med giltig JSON
- Inga markdown-block, inga förklaringar utanför JSON
- Använd blocks, inte top-level exercises om du inte absolut måste
- Använd bara övningar från kataloglistan ovan
- Huvudpasset måste innehålla exakt ${targetMainExerciseCount} huvudövningar totalt
- Lägg inte extra övningar i huvudpasset för säkerhets skull
- Om du vill föreslå extra övningar ska de ligga i optionalBonusExercises och huvudpasset ska redan vara komplett utan dem
- optionalBonusExercises får innehålla högst 2 övningar
- Inkludera alltid både superset_considered och superset_reason i toppnivån
- suggestedWeight ska vara ett genomtänkt startförslag när övningen använder extern belastning, inte ett slumpmässigt eller tomt värde
- Basera suggestedWeight på användarens kön, kroppsvikt, ålder, träningsvana och den aktuella övningen om tidigare historik saknas
- För kroppsviktsövningar och andra övningar där extern belastning inte är relevant ska suggestedWeight vara null
- Använd aldrig circuit just nu
- Tolkningsregel: superset-preferens ALLOWED betyder att användaren inte har förbjudit supersets
- Tolkningsregel: superset-preferens AVOID betyder att användaren uttryckligen vill undvika supersets
- Tolkningsregel: superset-preferens AVOID_ALL_DUMBBELL_SUPERSETS betyder att du får använda hantlar i superset, men högst en hantelövning per superset
- Om superset-preferens är AVOID ska du inte använda superset alls
- Om superset-preferens är AVOID_ALL_DUMBBELL_SUPERSETS ska du inte skapa superset med två eller fler hantelövningar
- För pass på 20 minuter eller kortare ska superset i normalfallet bestå av exakt 2 övningar, inte 3
- För sådana mycket korta pass ska du undvika 3-övnings-superset eftersom de blir svårare att hålla tidseffektiva och robusta
- För pass på 30 minuter eller kortare ska du som standard bygga passet runt ett eller flera superset-block när rimliga och säkra parningar finns
- För sådana korta pass ska straight_sets bara användas för övningar som inte passar i superset eller som bör stå ensamma av kvalitets- eller säkerhetsskäl
- Om du väljer bort superset i ett kort pass ska det bero på att säkra och logiska superset-parningar saknas
- För pass mellan 31 och 40 minuter får du använda högst ett superset-block om det tydligt sparar tid utan att sänka kvaliteten
- Ett superset ska helst para press + drag eller underkropp + bål/lågriskövning
- Lägg aldrig två högrisklyft eller två tunga stora underkroppslyft i samma superset
- Om passet är längre eller tyngre ska straight_sets vara standard
- Varje block ska ha en kort coach_note och ett target_rpe eller target_rir
- Tunga flerledsövningar tidigt i passet bör oftast ligga runt RPE 7-8 eller 1-3 RIR
- Säkrare isolationsövningar eller sena block kan ligga närmare RPE 8-9
- Om första blocket innehåller en tung eller högriskövning ska warmup.recommended vara true med en enkel uppvärmningsinstruktion
- När en relevant progressionstege finns, välj gärna ett steg som passar användarens nivå i stället för att bara höja reps på obestämd tid
- Prioritera stora flerledsövningar tidigt när målet eller passets längd motiverar det
- Anpassa vila, dos och övningsval till träningsmålet
- Om utrustning finns ska den användas men utan att förstöra passets kvalitet
- Undvik dubbletter och nästan identiska övningar i samma pass
- Sträva efter att dragvolymen matchar eller överstiger pressvolymen när passet innehåller båda
- När likvärdiga alternativ finns ska du variera bort från övningar och variantgrupper som användes i de senaste 1-3 passen
- Behåll bara samma övning som nyligen om den är tydligt bäst givet mål, utrustning eller progression
- Planera utifrån faktisk prestation, inte bara vad tidigare pass var planerade att innehålla
- Pass med status no_logged_work ska inte räknas som träningsstimulans eller som att övningarna faktiskt tränades
- Om senaste prestation låg lower_than_plan eller much_lower_than_plan ska du vara mer konservativ med volym, komplexitet och suggestedWeight
- Om senaste prestation låg higher_than_plan ska du bara öka försiktigt och ta hänsyn till återhämtning
- Låt veckoplanen påverka passets huvudfokus. Om nästa fokus är upper_body, lower_body, core eller full_body ska passet tydligt kännas som detta utan att bli obalanserat
- Huvudövningarna ska ensamma vara ett komplett pass för ${params.durationMinutes} minuter
- Märk huvudövningarna med priorityRank där 1 är viktigast att behålla om passet behöver kortas
- Märk övningar som lättare kan kapas med canDropIfShort=true, men kapa inte bort nödvändiga prioriterade muskler eller sportrelevanta roller av gammal vana
- ${optionalBonusInstruction}
- Prioritera muskelgrupper som fortfarande har återstående veckobudget, men håll passet realistiskt inom vald passlängd
- Om uttryckligt valda fokusmuskler finns för detta builder-pass ska de prioriteras tydligt i övningsval, så länge passet fortfarande blir balanserat och realistiskt
- Vid låg confidence score ska du vara mer konservativ med volym, komplexitet och övningssvårighet
- Passet ska kännas coachat, inte slumpat
`.trim();
}

export async function generateWorkoutWithAiCore(
  params: GenerateWorkoutWithAiCoreInput,
): Promise<GenerateWorkoutWithAiCoreResult> {
  const sportFocus = normalizeSportFocus(params.settings?.sport_focus);
  const availableExercises = getAvailableExercises(params.equipment);
  const recentExercisePreferences = buildRecentExercisePreferences(params.historyLogs);
  const longTermPriorityMuscles = getLongTermPriorityMuscles({
    settings: params.settings,
    weeklyPlanContext: params.weeklyPlanContext,
  });
  const trainingHistoryContext = buildTrainingHistoryContext({
    workoutLogs: params.historyLogs,
    weeklyPlanPriorityMuscles:
      params.weeklyPlanContext?.priorityMuscles ?? longTermPriorityMuscles,
    weeklyPlanDeficits: params.weeklyPlanContext?.muscleSetDeficits ?? null,
    weeklyBudget: params.weeklyBudget as WeeklyBudgetValidationItem[],
    adherenceEstimate:
      params.weeklyPlanContext && params.weeklyPlanContext.sessionsPerWeek > 0
        ? params.weeklyPlanContext.completedSessionCreditThisWeek /
          params.weeklyPlanContext.sessionsPerWeek
        : null,
  });
  const planIntentionSource: PlanIntentionSource = params.weeklyPlanContext
    ? "weekly_plan"
    : "adaptive_fallback";
  const supersetPreference =
    params.supersetPreference ??
    normalizeSupersetPreference(params.settings?.superset_preference) ??
    (params.avoidSupersets || params.settings?.avoid_supersets === true
      ? "avoid_all"
      : "allowed");
  const avoidSupersets = supersetPreference === "avoid_all";
  const availableExercisePrompt = buildAvailableExercisePrompt(
    availableExercises,
    sportFocus,
  );
  const prompt = buildGenerationPrompt({
    availableExercisePrompt,
    durationMinutes: params.durationMinutes,
    equipment: params.equipment,
    gymEquipmentDetails: params.gymEquipmentDetails,
    goal: params.goal,
    gym: params.gym,
    gymLabel: params.gymLabel,
    confidenceScore: params.confidenceScore,
    nextFocus: params.nextFocus,
    recentExerciseIds: recentExercisePreferences.recentExerciseIds,
    recentExerciseNames: recentExercisePreferences.recentExerciseNames,
    trainingHistoryContext,
    settings: params.settings,
    splitStyle: params.splitStyle,
    supersetPreference,
    weeklyBudget: params.weeklyBudget,
    weeklyPlan: params.weeklyPlan,
    planIntentionSource,
    selectedPlanMode: params.selectedPlanMode,
    focusIntent: params.focusIntent,
    targetMuscles: params.targetMuscles,
    avoidMuscles: params.avoidMuscles,
    limitedMuscles: params.limitedMuscles,
    weeklyPlanContext: params.weeklyPlanContext,
    longTermPriorityMuscles,
    trainingGap: params.trainingGap,
    lessOftenExerciseIds: params.lessOftenExerciseIds,
    focusMuscles: params.focusMuscles,
  });

  const response = await client.chat.completions.create({
    model: "gpt-5.4-mini",
    messages: [
      {
        role: "system",
        content:
          "Du är en erfaren personlig tränare som svarar med strikt JSON och optimerar för effektiva, realistiska träningspass.",
      },
      {
        role: "user",
        content: prompt,
      },
    ],
    temperature: 0.5,
  });

  const rawAiText = response.choices?.[0]?.message?.content ?? "";
  const parsed = safeParseJSON(rawAiText) as AiGeneratedWorkoutCandidate | null;

  if (!parsed) {
    return {
      ok: false,
      status: 500,
      error: "AI-svar kunde inte tolkas",
    };
  }

  const validated = validateGeneratedWorkout({
    // Validationen behöver samma planfokus som AI:n fick, så att fallback och trimning
    // inte glider över till fel kroppsdel när passet kortas eller normaliseras.
    focusContext: {
      plannedFocus:
        params.selectedPlanMode === "recovery" ||
        params.selectedPlanMode === "recovery_mobility" ||
        params.selectedPlanMode === "light_accessory"
          ? "recovery_strength"
          : params.nextFocus,
      goal:
        params.goal === "strength" ||
        params.goal === "hypertrophy" ||
        params.goal === "health" ||
        params.goal === "body_composition"
          ? params.goal
          : "health",
      experienceLevel: params.settings?.experience_level ?? null,
      durationMinutes: params.durationMinutes,
      priorityMuscles: Array.from(
        new Set([
          ...longTermPriorityMuscles,
          ...(params.weeklyPlanContext?.priorityMuscles ?? []),
        ]),
      ),
      recoveryLimitedMuscles: Array.from(
        new Set([
          ...(params.weeklyPlanContext?.recoveryLimitedMuscles ?? []),
          ...trainingHistoryContext.mediumTermTrainingSummary.recoveryLimitedMuscles,
        ]),
      ),
      availableEquipment: params.equipment,
      sportFocus,
    } satisfies GeneratedWorkoutValidationFocusContext,
    availableEquipment: params.equipment,
    candidate: parsed,
    durationMinutes: params.durationMinutes,
    goal:
      params.goal === "strength" ||
      params.goal === "hypertrophy" ||
      params.goal === "health" ||
      params.goal === "body_composition"
        ? params.goal
        : "health",
    gym: params.gym,
    gymLabel: params.gymLabel,
    recentExerciseIds: recentExercisePreferences.recentExerciseIds,
    recentVariantGroups: recentExercisePreferences.recentExerciseIds
      .map(
        (exerciseId) =>
          availableExercises.find((item) => item.id === exerciseId)?.variantGroup,
      )
      .filter((value): value is string => typeof value === "string" && value.length > 0),
    weeklyBudget: params.weeklyBudget as WeeklyBudgetValidationItem[],
    lessOftenExerciseIds: params.lessOftenExerciseIds,
    avoidSupersets,
    supersetPreference,
  });

  const parsedWithContext = {
    ...validated.workout,
    goal: params.goal,
    duration: validated.workout.duration ?? params.durationMinutes,
    gym: params.gym,
    gymLabel: params.gymLabel,
    plannedFocus: params.nextFocus,
    availableEquipment: params.equipment,
    aiDebug: {
      request: {
        goal: params.goal,
        durationMinutes: params.durationMinutes,
        nextFocus: params.nextFocus,
        planIntentionSource,
        selectedPlanMode: params.selectedPlanMode,
        focusIntent: params.focusIntent,
        targetMuscles: params.targetMuscles,
        avoidMuscles: params.avoidMuscles,
        limitedMuscles: params.limitedMuscles,
        weeklyPlanContext: params.weeklyPlanContext,
        longTermPriorityMuscles,
      },
      generationContext: {
        trainingHistoryContextSummary: {
          recentWorkoutsCount: trainingHistoryContext.recentWorkouts.length,
          progressionMemoryExerciseCount:
            trainingHistoryContext.exerciseProgressionMemory.length,
          mediumTermWindowDays:
            trainingHistoryContext.mediumTermTrainingSummary.windowDays,
          dataQuality: trainingHistoryContext.dataQuality,
          typicalWorkoutDurationMinutes:
            trainingHistoryContext.mediumTermTrainingSummary
              .typicalWorkoutDurationMinutes,
        },
        trainingHistoryContext,
        weeklyPlanContext: params.weeklyPlanContext,
        weeklyBudget: params.weeklyBudget,
        trainingGap: params.trainingGap,
        planIntentionSource,
      },
      prompt,
      rawAiText,
      parsedAiResponse: parsed,
      validatedWorkout: validated.debug,
    },
  };

  const normalizedWorkout = normalizePreviewWorkout(parsedWithContext);

  if (!normalizedWorkout) {
    return {
      ok: false,
      status: 500,
      error: "Kunde inte normalisera träningspass",
    };
  }

  return {
    ok: true,
    workout: {
      ...normalizedWorkout,
      aiDebug: {
        ...normalizedWorkout.aiDebug,
        normalizedWorkout,
      },
    },
  };
}
