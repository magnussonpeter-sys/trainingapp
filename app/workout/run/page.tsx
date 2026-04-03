"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  clearActiveWorkout,
  getActiveWorkout,
} from "../../../lib/workout-storage";
import {
  clearActiveWorkoutSessionDraft,
  getActiveWorkoutSessionDraft,
  isDraftForWorkout,
  saveActiveWorkoutSessionDraft,
  type LoggedSetDraft,
  type TimedSetPhaseDraft,
} from "../../../lib/active-workout-session-storage";
import {
  hasExerciseBeenRated,
  saveExerciseFeedbackEntry,
} from "../../../lib/exercise-feedback-storage";
import {
  getLastWeightForExercise,
  saveLastWeightForExercise,
} from "../../../lib/exercise-weight-storage";
import {
  getLastRestForExercise,
  saveLastRestForExercise,
} from "../../../lib/exercise-rest-storage";
import {
  createEmptyExerciseLog,
  createWorkoutLog,
  saveWorkoutLog,
  type CompletedExercise,
  type CompletedSet,
  type WorkoutLog,
  type ExtraRepsOption,
} from "../../../lib/workout-log-storage";
import { saveWorkoutLogToApi } from "../../../lib/workout-log-api";
import type { Workout, Exercise } from "../../../types/workout";
import type {
  TimedEffortOption,
  ExerciseFeedbackEntry,
} from "../../../types/exercise-feedback";

type AuthUser = {
  id: number | string;
  email: string | null;
  username?: string | null;
  name?: string | null;
  displayName?: string | null;
};

type LoggedSet = LoggedSetDraft;
type TimedSetPhase = TimedSetPhaseDraft;

type EquipmentType = "dumbbell" | "barbell" | "kettlebell";

type GymEquipment = {
  id: string;
  equipment_type: string;
  label: string;
  weights_kg?: number[] | null;
  specific_weights?: number[] | null;
  specificWeights?: number[] | null;
};

type Gym = {
  id: string;
  name: string;
  equipment: GymEquipment[];
};

const EXTRA_REP_OPTIONS: Array<{
  value: ExtraRepsOption;
  label: string;
  description: string;
}> = [
  { value: 0, label: "0", description: "Tungt – ungefär nära max för setet." },
  { value: 2, label: "2", description: "Lagom – bra arbetsnivå." },
  { value: 4, label: "4", description: "Lätt – tydlig marginal kvar." },
  { value: 6, label: "6+", description: "Mycket lätt – klart mer kvar." },
];

const TIMED_EFFORT_OPTIONS: Array<{
  value: TimedEffortOption;
  label: string;
  description: string;
}> = [
  {
    value: "light",
    label: "Lätt",
    description: "Du hade tydlig marginal kvar.",
  },
  {
    value: "just_right",
    label: "Lagom",
    description: "Bra nivå för övningen.",
  },
  {
    value: "tough",
    label: "Tungt",
    description: "Det var riktigt jobbigt.",
  },
];

const RATING_OPTIONS = [1, 2, 3, 4, 5] as const;

function toNullableNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const normalized = trimmed.replace(",", ".");
  const parsed = Number(normalized);

  return Number.isFinite(parsed) ? parsed : null;
}

function getDefaultRepsValue(reps: number | undefined) {
  return typeof reps === "number" && Number.isFinite(reps) ? String(reps) : "";
}

function getDefaultDurationValue(duration: number | undefined) {
  return typeof duration === "number" && Number.isFinite(duration)
    ? String(duration)
    : "";
}

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  if (minutes === 0) return `${remainingSeconds} s`;
  return `${minutes} min ${remainingSeconds} s`;
}

function formatDateTime(value: string) {
  try {
    return new Date(value).toLocaleString("sv-SE", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return value;
  }
}

function formatTimerClock(totalSeconds: number) {
  const safeSeconds = Math.max(0, totalSeconds);
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(
    2,
    "0"
  )}`;
}

function formatWeightValue(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function isTimedExercise(exercise: { duration?: number; reps?: number }) {
  return (
    typeof exercise.duration === "number" &&
    exercise.duration > 0 &&
    !(typeof exercise.reps === "number" && exercise.reps > 0)
  );
}

function getTimedEffortLabel(value: TimedEffortOption | null | undefined) {
  if (value === "light") return "Lätt";
  if (value === "just_right") return "Lagom";
  if (value === "tough") return "Tungt";
  return null;
}

function normalizeRating(
  value: number | null | undefined
): 1 | 2 | 3 | 4 | 5 | null {
  return value === 1 ||
    value === 2 ||
    value === 3 ||
    value === 4 ||
    value === 5
    ? value
    : null;
}

function getDisplayName(user: AuthUser | null) {
  if (!user) return "där";

  return (
    user.displayName?.trim() ||
    user.name?.trim() ||
    user.username?.trim() ||
    user.email?.split("@")[0]?.trim() ||
    "där"
  );
}

function getBadgeClasses(variant: "accent" | "neutral" | "warning" | "danger") {
  switch (variant) {
    case "accent":
      return "border-indigo-100 bg-indigo-50 text-indigo-700";
    case "warning":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "danger":
      return "border-rose-200 bg-rose-50 text-rose-700";
    default:
      return "border-slate-200 bg-slate-50 text-slate-700";
  }
}

// Enkel heuristik för vilken typ av vikt som oftast hör till övningen.
function inferPreferredWeightType(exercise: Exercise): EquipmentType | null {
  const haystack = `${exercise.name} ${exercise.description ?? ""}`.toLowerCase();

  if (
    haystack.includes("dumbbell") ||
    haystack.includes("hantel") ||
    haystack.includes("hantel")
  ) {
    return "dumbbell";
  }

  if (
    haystack.includes("kettlebell") ||
    haystack.includes("kb ") ||
    haystack.includes("kettlebell")
  ) {
    return "kettlebell";
  }

  if (
    haystack.includes("barbell") ||
    haystack.includes("skivstång") ||
    haystack.includes("skivstang")
  ) {
    return "barbell";
  }

  return null;
}

// Läser ut vikter från flera möjliga fältnamn för att minska risken att chips försvinner.
function extractWeightOptionsFromGym(gym: Gym | null) {
  const grouped: Record<EquipmentType, number[]> = {
    dumbbell: [],
    barbell: [],
    kettlebell: [],
  };

  if (!gym) {
    return grouped;
  }

  for (const item of gym.equipment) {
    if (
      item.equipment_type === "dumbbell" ||
      item.equipment_type === "barbell" ||
      item.equipment_type === "kettlebell"
    ) {
      const rawWeights = Array.isArray(item.weights_kg)
        ? item.weights_kg
        : Array.isArray(item.specific_weights)
        ? item.specific_weights
        : Array.isArray(item.specificWeights)
        ? item.specificWeights
        : [];

      const weights = rawWeights.filter((value) =>
        Number.isFinite(Number(value))
      );

      grouped[item.equipment_type] = [
        ...new Set([
          ...grouped[item.equipment_type],
          ...weights.map((value) => Number(value)),
        ]),
      ].sort((a, b) => a - b);
    }
  }

  return grouped;
}

function getInitialSetLog(exercise: Exercise, initialWeight = ""): LoggedSet {
  return {
    reps: getDefaultRepsValue(exercise.reps),
    durationSeconds: getDefaultDurationValue(exercise.duration),
    weight: initialWeight,
    completed: false,
  };
}

function getNextSetLog(exercise: Exercise, savedWeight = ""): LoggedSet {
  return {
    reps: getDefaultRepsValue(exercise.reps),
    durationSeconds: getDefaultDurationValue(exercise.duration),
    weight: savedWeight,
    completed: false,
  };
}

function getSavedWeightForExercise(
  userId: string | null,
  exerciseId: string
): string {
  if (!userId) return "";
  return getLastWeightForExercise(userId, exerciseId);
}

// Hjälper till att jämföra vikter även om de skrivs med komma/punkt.
function normalizeWeightString(value: string) {
  return value.trim().replace(",", ".");
}

export default function WorkoutRunPage() {
  const router = useRouter();

  const [authChecked, setAuthChecked] = useState(false);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [workout, setWorkout] = useState<Workout | null>(null);

  // Starttid ska kunna återställas från lokal backup.
  const [sessionStartedAt, setSessionStartedAt] = useState(() =>
    new Date().toISOString()
  );

  const [currentExerciseIndex, setCurrentExerciseIndex] = useState(0);
  const [currentSet, setCurrentSet] = useState(1);
  const [lastWeightByExercise, setLastWeightByExercise] = useState<
    Record<string, string>
  >({});
  const [matchedGym, setMatchedGym] = useState<Gym | null>(null);

  const [setLog, setSetLog] = useState<LoggedSet>({
    reps: "",
    durationSeconds: "",
    weight: "",
    completed: false,
  });

  const [completedExercises, setCompletedExercises] = useState<
    CompletedExercise[]
  >([]);
  const [savedWorkoutLog, setSavedWorkoutLog] = useState<WorkoutLog | null>(
    null
  );
  const [workoutFinished, setWorkoutFinished] = useState(false);

  const [showExerciseFeedback, setShowExerciseFeedback] = useState(false);
  const [selectedExtraReps, setSelectedExtraReps] =
    useState<ExtraRepsOption | null>(null);
  const [selectedTimedEffort, setSelectedTimedEffort] =
    useState<TimedEffortOption | null>(null);
  const [selectedRating, setSelectedRating] = useState<
    1 | 2 | 3 | 4 | 5 | null
  >(null);

  const [pageError, setPageError] = useState<string | null>(null);
  const [isFinishingWorkout, setIsFinishingWorkout] = useState(false);

  const [exerciseTimerElapsedSeconds, setExerciseTimerElapsedSeconds] =
    useState(0);
  const [exerciseTimerAlarmPlayed, setExerciseTimerAlarmPlayed] =
    useState(false);
  const [timedSetPhase, setTimedSetPhase] = useState<TimedSetPhase>("idle");

  const [showRestTimer, setShowRestTimer] = useState(false);
  const [restTimerRunning, setRestTimerRunning] = useState(false);
  const [restDurationSeconds, setRestDurationSeconds] = useState(0);
  const [restRemainingSeconds, setRestRemainingSeconds] = useState(0);

  // Hindrar autosave innan första init är klar.
  const [isSessionHydrated, setIsSessionHydrated] = useState(false);

  // Visas när backup återställts.
  const [restoreNotice, setRestoreNotice] = useState<string | null>(null);

  // Håller koll på sista nedräkningspipet.
  const lastCountdownSecondRef = useRef<number | null>(null);

  // Delad audio context gör Safari/iPhone stabilare.
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioPrimedRef = useRef(false);

  const userId = authUser ? String(authUser.id) : null;

  const exercise = workout?.exercises[currentExerciseIndex] ?? null;
  const timedExercise = exercise ? isTimedExercise(exercise) : false;
  const isLastSet = exercise ? currentSet >= exercise.sets : false;
  const isLastExercise = workout
    ? currentExerciseIndex >= workout.exercises.length - 1
    : false;

  const isNewExerciseForRating = useMemo(() => {
    if (!userId || !exercise) return false;
    return !hasExerciseBeenRated(userId, exercise.id);
  }, [userId, exercise]);

  const weightOptionsByType = useMemo(
    () => extractWeightOptionsFromGym(matchedGym),
    [matchedGym]
  );

  const preferredWeightType = useMemo(
    () => (exercise ? inferPreferredWeightType(exercise) : null),
    [exercise]
  );

  const suggestedWeightOptions = useMemo(() => {
    if (!preferredWeightType) return [];
    return weightOptionsByType[preferredWeightType];
  }, [preferredWeightType, weightOptionsByType]);

  // "AI-liknande" viktförslag baseras här på tidigare resultat för samma övning.
  const suggestedWeightValue = useMemo(() => {
    if (!exercise) return "";
    return lastWeightByExercise[exercise.id] || "";
  }, [exercise, lastWeightByExercise]);

  const totalCompletedSets = useMemo(() => {
    return completedExercises.reduce((sum, item) => sum + item.sets.length, 0);
  }, [completedExercises]);

  const totalVolume = useMemo(() => {
    return completedExercises.reduce((exerciseSum, exerciseItem) => {
      return (
        exerciseSum +
        exerciseItem.sets.reduce((setSum, setItem) => {
          const reps = setItem.actualReps ?? 0;
          const weight = setItem.actualWeight ?? 0;
          return setSum + reps * weight;
        }, 0)
      );
    }, 0);
  }, [completedExercises]);

  // Försöker "låsa upp" ljud tidigt för iPhone/Safari.
  async function ensureAudioReady() {
    try {
      const AudioContextClass =
        window.AudioContext ||
        // @ts-expect-error Safari fallback
        window.webkitAudioContext;

      if (!AudioContextClass) return null;

      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContextClass();
      }

      if (audioContextRef.current.state === "suspended") {
        await audioContextRef.current.resume();
      }

      audioPrimedRef.current = true;
      return audioContextRef.current;
    } catch (error) {
      console.error("Could not initialize audio context", error);
      return null;
    }
  }

  function playTone(params: {
    frequency: number;
    durationSeconds: number;
    gain?: number;
    type?: OscillatorType;
  }) {
    void (async () => {
      try {
        const audioContext = await ensureAudioReady();
        if (!audioContext) return;

        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.type = params.type ?? "sine";
        oscillator.frequency.value = params.frequency;
        gainNode.gain.value = params.gain ?? 0.09;

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        const now = audioContext.currentTime;
        oscillator.start(now);
        oscillator.stop(now + params.durationSeconds);
      } catch (error) {
        console.error("Could not play timer sound", error);
      }
    })();
  }

  function playCountdownBeep() {
    playTone({
      frequency: 900,
      durationSeconds: 0.12,
      gain: 0.12,
      type: "square",
    });
  }

  function playFinishBeep() {
    playTone({
      frequency: 760,
      durationSeconds: 0.55,
      gain: 0.16,
      type: "square",
    });
  }

  function playRestFinishedBeep() {
    playTone({
      frequency: 640,
      durationSeconds: 0.3,
      gain: 0.14,
      type: "triangle",
    });
  }

  useEffect(() => {
    function primeFromGesture() {
      void ensureAudioReady();
    }

    window.addEventListener("touchstart", primeFromGesture, { passive: true });
    window.addEventListener("pointerdown", primeFromGesture, { passive: true });

    return () => {
      window.removeEventListener("touchstart", primeFromGesture);
      window.removeEventListener("pointerdown", primeFromGesture);
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      try {
        setPageError(null);

        const authRes = await fetch("/api/auth/me", {
          cache: "no-store",
          credentials: "include",
        });

        let authData: unknown = null;

        try {
          authData = await authRes.json();
        } catch {
          authData = null;
        }

        if (
          !authRes.ok ||
          !authData ||
          typeof authData !== "object" ||
          !("user" in authData) ||
          !(authData as { user?: unknown }).user
        ) {
          router.replace("/");
          return;
        }

        const user = (authData as { user: AuthUser }).user;
        const nextUserId = String(user.id);
        const activeWorkout = getActiveWorkout(nextUserId);

        if (!isMounted) return;

        setAuthUser(user);
        setAuthChecked(true);

        if (!activeWorkout) {
          setWorkout(null);
          clearActiveWorkoutSessionDraft(nextUserId);
          setIsSessionHydrated(true);
          return;
        }

        setWorkout(activeWorkout);

        const initialWeights: Record<string, string> = {};
        activeWorkout.exercises.forEach((exerciseItem) => {
          const savedWeight = getLastWeightForExercise(
            nextUserId,
            exerciseItem.id
          );

          if (savedWeight) {
            initialWeights[exerciseItem.id] = savedWeight;
          }
        });

        const firstExercise = activeWorkout.exercises[0];
        const initialWeight = firstExercise
          ? getLastWeightForExercise(nextUserId, firstExercise.id)
          : "";

        const draft = getActiveWorkoutSessionDraft(nextUserId);

        if (draft && isDraftForWorkout(draft, activeWorkout)) {
          setSessionStartedAt(draft.sessionStartedAt);
          setCurrentExerciseIndex(draft.currentExerciseIndex);
          setCurrentSet(draft.currentSet);
          setLastWeightByExercise(draft.lastWeightByExercise);
          setSetLog(draft.setLog);
          setCompletedExercises(draft.completedExercises);
          setShowExerciseFeedback(draft.showExerciseFeedback);
          setSelectedExtraReps(draft.selectedExtraReps);
          setSelectedTimedEffort(draft.selectedTimedEffort);
          setSelectedRating(normalizeRating(draft.selectedRating));
          setExerciseTimerElapsedSeconds(draft.exerciseTimerElapsedSeconds);
          setExerciseTimerAlarmPlayed(draft.exerciseTimerAlarmPlayed);
          setTimedSetPhase(draft.timedSetPhase);
          setShowRestTimer(draft.showRestTimer);
          setRestTimerRunning(draft.restTimerRunning);
          setRestDurationSeconds(draft.restDurationSeconds);
          setRestRemainingSeconds(draft.restRemainingSeconds);
          lastCountdownSecondRef.current = null;
          setRestoreNotice("Vi återställde ditt pågående pass från lokal backup.");
        } else {
          if (draft) {
            clearActiveWorkoutSessionDraft(nextUserId);
          }

          setSessionStartedAt(new Date().toISOString());
          setCurrentExerciseIndex(0);
          setCurrentSet(1);
          setLastWeightByExercise(initialWeights);
          setSetLog(
            firstExercise
              ? getInitialSetLog(firstExercise, initialWeight)
              : {
                  reps: "",
                  durationSeconds: "",
                  weight: "",
                  completed: false,
                }
          );
          setCompletedExercises([]);
          setShowExerciseFeedback(false);
          setSelectedExtraReps(null);
          setSelectedTimedEffort(null);
          setSelectedRating(null);
          setExerciseTimerElapsedSeconds(0);
          setExerciseTimerAlarmPlayed(false);
          setTimedSetPhase("idle");
          setShowRestTimer(false);
          setRestTimerRunning(false);
          setRestDurationSeconds(0);
          setRestRemainingSeconds(0);
          lastCountdownSecondRef.current = null;
        }

        try {
          const gymsRes = await fetch(
            `/api/gyms?userId=${encodeURIComponent(nextUserId)}`,
            {
              cache: "no-store",
              credentials: "include",
            }
          );

          let gymsData: unknown = null;

          try {
            gymsData = await gymsRes.json();
          } catch {
            gymsData = null;
          }

          if (!isMounted) return;

          const gyms = Array.isArray(gymsData)
            ? (gymsData as Gym[])
            : Array.isArray((gymsData as { gyms?: unknown })?.gyms)
            ? ((gymsData as { gyms?: Gym[] }).gyms ?? [])
            : [];

          const workoutGymName = activeWorkout.gym?.trim().toLowerCase();

          if (workoutGymName) {
            const matched =
              gyms.find(
                (gym) => gym.name.trim().toLowerCase() === workoutGymName
              ) ?? null;

            setMatchedGym(matched);
          } else {
            setMatchedGym(null);
          }
        } catch {
          setMatchedGym(null);
        }

        setIsSessionHydrated(true);
      } catch {
        router.replace("/");
      }
    }

    void load();

    return () => {
      isMounted = false;
    };
  }, [router]);

  // Sparar pågående pass lokalt som backup.
  useEffect(() => {
    if (!userId || !workout || workoutFinished || !isSessionHydrated) {
      return;
    }

    saveActiveWorkoutSessionDraft(userId, {
      workoutId: workout.id ?? null,
      workoutName: workout.name,
      sessionStartedAt,
      currentExerciseIndex,
      currentSet,
      lastWeightByExercise,
      setLog,
      completedExercises,
      showExerciseFeedback,
      selectedExtraReps,
      selectedTimedEffort,
      selectedRating,
      exerciseTimerElapsedSeconds,
      exerciseTimerAlarmPlayed,
      timedSetPhase,
      showRestTimer,
      restTimerRunning,
      restDurationSeconds,
      restRemainingSeconds,
    });
  }, [
    userId,
    workout,
    workoutFinished,
    isSessionHydrated,
    sessionStartedAt,
    currentExerciseIndex,
    currentSet,
    lastWeightByExercise,
    setLog,
    completedExercises,
    showExerciseFeedback,
    selectedExtraReps,
    selectedTimedEffort,
    selectedRating,
    exerciseTimerElapsedSeconds,
    exerciseTimerAlarmPlayed,
    timedSetPhase,
    showRestTimer,
    restTimerRunning,
    restDurationSeconds,
    restRemainingSeconds,
  ]);

  // Om en övning har tidigare sparad vikt fylls den in som föreslagen vikt.
  useEffect(() => {
    if (!exercise || showExerciseFeedback) return;

    const preferredWeight =
      lastWeightByExercise[exercise.id] ||
      getSavedWeightForExercise(userId, exercise.id);

    if (!preferredWeight) return;

    setSetLog((prev) => {
      if (prev.weight.trim()) return prev;
      return {
        ...prev,
        weight: preferredWeight,
      };
    });
  }, [
    exercise,
    showExerciseFeedback,
    lastWeightByExercise,
    userId,
    currentExerciseIndex,
    currentSet,
  ]);

  // Timer för tidsstyrt set.
  useEffect(() => {
    if (timedSetPhase !== "running") return;

    const timeout = window.setTimeout(() => {
      setExerciseTimerElapsedSeconds((prev) => prev + 1);
    }, 1000);

    return () => window.clearTimeout(timeout);
  }, [timedSetPhase, exerciseTimerElapsedSeconds]);

  // Nedräkningspip.
  useEffect(() => {
    if (!exercise || !timedExercise || timedSetPhase !== "running") {
      lastCountdownSecondRef.current = null;
      return;
    }

    const targetSeconds = exercise.duration ?? 0;
    const remaining = targetSeconds - exerciseTimerElapsedSeconds;

    if (remaining > 0 && remaining <= 3) {
      if (lastCountdownSecondRef.current !== remaining) {
        playCountdownBeep();
        lastCountdownSecondRef.current = remaining;
      }
    } else {
      lastCountdownSecondRef.current = null;
    }
  }, [exercise, timedExercise, timedSetPhase, exerciseTimerElapsedSeconds]);

  // Slutpip när måltid nås.
  useEffect(() => {
    if (!exercise || !timedExercise) return;

    const targetSeconds = exercise.duration ?? 0;

    if (
      timedSetPhase === "running" &&
      !exerciseTimerAlarmPlayed &&
      targetSeconds > 0 &&
      exerciseTimerElapsedSeconds >= targetSeconds
    ) {
      playFinishBeep();
      setExerciseTimerAlarmPlayed(true);
    }
  }, [
    exercise,
    timedExercise,
    timedSetPhase,
    exerciseTimerElapsedSeconds,
    exerciseTimerAlarmPlayed,
  ]);

  // Synkar tidfält med timer.
  useEffect(() => {
    if (!exercise || !timedExercise) return;

    setSetLog((prev) => ({
      ...prev,
      durationSeconds: String(exerciseTimerElapsedSeconds),
    }));
  }, [exercise, timedExercise, exerciseTimerElapsedSeconds]);

  // Vilotimer.
  useEffect(() => {
    if (!showRestTimer || !restTimerRunning || restRemainingSeconds <= 0) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setRestRemainingSeconds((prev) => Math.max(0, prev - 1));
    }, 1000);

    return () => window.clearTimeout(timeout);
  }, [showRestTimer, restTimerRunning, restRemainingSeconds]);

  useEffect(() => {
    if (!showRestTimer || !restTimerRunning || restRemainingSeconds > 0) {
      return;
    }

    setRestTimerRunning(false);
    playRestFinishedBeep();
  }, [showRestTimer, restTimerRunning, restRemainingSeconds]);

  function stopRestTimer() {
    setRestTimerRunning(false);
  }

  function hideRestTimer() {
    setShowRestTimer(false);
    setRestTimerRunning(false);
    setRestDurationSeconds(0);
    setRestRemainingSeconds(0);
  }

  function startRestTimer(seconds: number) {
    const safeSeconds = Math.max(0, Math.round(seconds));

    if (safeSeconds <= 0) {
      hideRestTimer();
      return;
    }

    setShowRestTimer(true);
    setRestDurationSeconds(safeSeconds);
    setRestRemainingSeconds(safeSeconds);
    setRestTimerRunning(true);
  }

  function adjustRestTimer(deltaSeconds: number) {
    setRestDurationSeconds((prev) => Math.max(0, prev + deltaSeconds));
    setRestRemainingSeconds((prev) => Math.max(0, prev + deltaSeconds));
  }

  function resetTimedSetUi(nextExercise?: Exercise | null) {
    const defaultDuration =
      nextExercise && isTimedExercise(nextExercise)
        ? getDefaultDurationValue(nextExercise.duration)
        : "";

    setExerciseTimerElapsedSeconds(0);
    setExerciseTimerAlarmPlayed(false);
    setTimedSetPhase("idle");
    lastCountdownSecondRef.current = null;

    setSetLog((prev) => ({
      ...prev,
      durationSeconds: defaultDuration,
    }));
  }

  function startTimedSet() {
    void ensureAudioReady();

    if (!exercise || !timedExercise) return;

    hideRestTimer();
    setExerciseTimerElapsedSeconds(0);
    setExerciseTimerAlarmPlayed(false);
    setTimedSetPhase("running");
    lastCountdownSecondRef.current = null;
  }

  function stopTimedSet() {
    void ensureAudioReady();

    if (timedSetPhase !== "running") return;
    setTimedSetPhase("ready_to_save");
  }

  function updateSetField(field: keyof LoggedSet, value: string | boolean) {
    setSetLog((prev) => ({
      ...prev,
      [field]: value,
    }));
  }

  function getOrCreateExerciseLog(targetExercise: Exercise) {
    const existing = completedExercises.find(
      (item) => item.exerciseId === targetExercise.id
    );

    if (existing) {
      return existing;
    }

    const isNewExercise = userId
      ? !hasExerciseBeenRated(userId, targetExercise.id)
      : true;

    return createEmptyExerciseLog(targetExercise, isNewExercise);
  }

  function replaceExerciseLog(
    currentLogs: CompletedExercise[],
    updatedLog: CompletedExercise
  ) {
    const exists = currentLogs.some(
      (item) => item.exerciseId === updatedLog.exerciseId
    );

    if (exists) {
      return currentLogs.map((item) =>
        item.exerciseId === updatedLog.exerciseId ? updatedLog : item
      );
    }

    return [...currentLogs, updatedLog];
  }

  function buildCompletedSet(targetExercise: Exercise): CompletedSet {
    return {
      setNumber: currentSet,
      plannedReps: targetExercise.reps ?? null,
      plannedDuration: targetExercise.duration ?? null,
      plannedWeight: toNullableNumber(setLog.weight),
      actualReps: timedExercise ? null : toNullableNumber(setLog.reps),
      actualDuration: timedExercise
        ? toNullableNumber(setLog.durationSeconds)
        : null,
      actualWeight: toNullableNumber(setLog.weight),
      repsLeft: null,
      timedEffort: null,
      completedAt: new Date().toISOString(),
    };
  }

  function persistWeightIfNeeded(targetExercise: Exercise) {
    if (!userId) return;

    const trimmedWeight = setLog.weight.trim();
    if (!trimmedWeight) return;

    saveLastWeightForExercise(userId, targetExercise.id, trimmedWeight);
    setLastWeightByExercise((prev) => ({
      ...prev,
      [targetExercise.id]: trimmedWeight,
    }));
  }

  function persistRestIfNeeded(targetExercise: Exercise) {
    if (!userId) return;
    saveLastRestForExercise(userId, targetExercise.id, targetExercise.rest);
  }

  function moveToExercise(nextExerciseIndex: number) {
    if (!workout || !userId) return;

    const nextExercise = workout.exercises[nextExerciseIndex];
    if (!nextExercise) return;

    const nextSavedWeight =
      lastWeightByExercise[nextExercise.id] ||
      getSavedWeightForExercise(userId, nextExercise.id);

    setCurrentExerciseIndex(nextExerciseIndex);
    setCurrentSet(1);
    setSetLog(getNextSetLog(nextExercise, nextSavedWeight));
    hideRestTimer();
    resetTimedSetUi(nextExercise);
    setShowExerciseFeedback(false);
    setSelectedExtraReps(null);
    setSelectedTimedEffort(null);
    setSelectedRating(null);
  }

  function startNextSet() {
    if (!exercise || !userId) return;

    const savedWeight =
      lastWeightByExercise[exercise.id] ||
      getSavedWeightForExercise(userId, exercise.id);

    setCurrentSet((prev) => prev + 1);
    setSetLog(getNextSetLog(exercise, savedWeight));
    hideRestTimer();
    resetTimedSetUi(exercise);
  }

  function goToNextExercise() {
    if (!workout) return;

    const nextIndex = currentExerciseIndex + 1;
    if (nextIndex >= workout.exercises.length) return;

    moveToExercise(nextIndex);
  }

  function openFeedbackStep() {
    setShowExerciseFeedback(true);
    setSelectedExtraReps(null);
    setSelectedTimedEffort(null);
    setSelectedRating(null);
  }

  // Sparar ett set till övningsloggen.
  function saveCurrentSetIntoExerciseLog(targetExercise: Exercise) {
    const nextSet: CompletedSet = buildCompletedSet(targetExercise);
    const currentExerciseLog = getOrCreateExerciseLog(targetExercise);

    const updatedExerciseLog: CompletedExercise = {
      ...currentExerciseLog,
      sets: [...currentExerciseLog.sets, nextSet],
    };

    return replaceExerciseLog(completedExercises, updatedExerciseLog);
  }

  function completeSet() {
    void ensureAudioReady();

    if (!exercise) return;

    if (timedExercise) {
      const seconds = toNullableNumber(setLog.durationSeconds);

      if (seconds === null || seconds <= 0) {
        setPageError("Ange eller registrera tid för setet.");
        return;
      }
    } else {
      const reps = toNullableNumber(setLog.reps);

      if (reps === null || reps <= 0) {
        setPageError("Ange antal reps för setet.");
        return;
      }
    }

    setPageError(null);

    const nextCompletedExercises = saveCurrentSetIntoExerciseLog(exercise);
    setCompletedExercises(nextCompletedExercises);

    persistWeightIfNeeded(exercise);
    persistRestIfNeeded(exercise);

    // Feedback visas bara efter sista setet i övningen.
    if (isLastSet) {
      openFeedbackStep();
      return;
    }

    // Annars går vi direkt vidare till nästa set.
    startNextSet();

    if (exercise.rest > 0) {
      const savedRest = userId
        ? getLastRestForExercise(userId, exercise.id)
        : null;
      startRestTimer(savedRest ?? exercise.rest);
    }
  }

  async function completeExerciseFeedback() {
    if (!exercise) return;

    const ratingToSave = isNewExerciseForRating ? selectedRating : null;

    const nextCompletedExercises = completedExercises.map((item) => {
      if (item.exerciseId !== exercise.id) return item;

      const updatedSets = item.sets.map((set, index) => {
        if (index !== item.sets.length - 1) return set;

        return {
          ...set,
          repsLeft: timedExercise ? null : selectedExtraReps,
          timedEffort: timedExercise ? selectedTimedEffort : null,
        };
      });

      return {
        ...item,
        extraReps: timedExercise ? null : selectedExtraReps,
        timedEffort: timedExercise ? selectedTimedEffort : null,
        rating: ratingToSave ?? item.rating,
        sets: updatedSets,
      };
    });

    setCompletedExercises(nextCompletedExercises);

    if (userId) {
      const entry: ExerciseFeedbackEntry = {
        exerciseId: exercise.id,
        exerciseName: exercise.name,
        completedAt: new Date().toISOString(),
        extraReps: timedExercise ? undefined : selectedExtraReps ?? undefined,
        timedEffort: timedExercise
          ? selectedTimedEffort ?? undefined
          : undefined,
        rating: ratingToSave ?? undefined,
      };

      saveExerciseFeedbackEntry(userId, entry);
    }

    setShowExerciseFeedback(false);
    setSelectedExtraReps(null);
    setSelectedTimedEffort(null);
    setSelectedRating(null);

    if (isLastExercise) {
      await finishWorkout("completed", nextCompletedExercises);
      return;
    }

    const savedRest = userId ? getLastRestForExercise(userId, exercise.id) : null;
    if ((savedRest ?? exercise.rest) > 0) {
      startRestTimer(savedRest ?? exercise.rest);
    }

    goToNextExercise();
  }

  async function finishWorkout(
    status: "completed" | "aborted",
    exercisesOverride?: CompletedExercise[]
  ) {
    if (!workout || !userId || isFinishingWorkout) return;

    try {
      setIsFinishingWorkout(true);
      setPageError(null);

      const exercisesToSave = exercisesOverride ?? completedExercises;

      const workoutLog = createWorkoutLog({
        userId,
        workout,
        startedAt: sessionStartedAt,
        exercises: exercisesToSave,
        status,
      });

      // Sparar alltid lokalt först.
      saveWorkoutLog(workoutLog);

      try {
        // Försöker sedan spara till servern.
        await saveWorkoutLogToApi(workoutLog);
      } catch (error) {
        console.error("Could not save workout log to API", error);
      }

      clearActiveWorkoutSessionDraft(userId);
      clearActiveWorkout(userId);

      setSavedWorkoutLog(workoutLog);
      setWorkoutFinished(true);
      stopRestTimer();
      hideRestTimer();
    } catch (error) {
      console.error("Could not finish workout", error);
      setPageError("Kunde inte avsluta passet korrekt.");
    } finally {
      setIsFinishingWorkout(false);
    }
  }

  async function skipExercise() {
    if (!exercise) return;

    if (isLastExercise) {
      await finishWorkout("completed");
      return;
    }

    goToNextExercise();
  }

  function getExerciseProgressLabel() {
    if (!workout) return "";
    return `Övning ${currentExerciseIndex + 1} av ${workout.exercises.length}`;
  }

  function renderSetDots() {
    if (!exercise) return null;

    return (
      <div className="flex items-center gap-2">
        {Array.from({ length: exercise.sets }).map((_, index) => {
          const setNumber = index + 1;
          const isCurrent = setNumber === currentSet;
          const isCompleted = setNumber < currentSet;

          return (
            <span
              key={setNumber}
              className={`h-3 w-3 rounded-full border ${
                isCurrent
                  ? "border-blue-600 bg-blue-600"
                  : isCompleted
                  ? "border-emerald-600 bg-emerald-600"
                  : "border-slate-300 bg-white"
              }`}
              aria-hidden="true"
            />
          );
        })}
      </div>
    );
  }

  const setProgressLabel = exercise
    ? `Set ${currentSet} av ${exercise.sets}`
    : "";

  const saveButtonLabel = exercise
    ? `Spara set ${currentSet}/${exercise.sets}`
    : "Spara set";

  const normalizedCurrentWeight = normalizeWeightString(setLog.weight);
  const normalizedSuggestedWeight = normalizeWeightString(suggestedWeightValue);

  if (!authChecked) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-6 text-slate-900">
        <div className="mx-auto max-w-3xl rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          Kontrollerar inloggning...
        </div>
      </main>
    );
  }

  if (!workout || !userId) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-6 text-slate-900">
        <div className="mx-auto max-w-3xl rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-bold">Inget aktivt pass</h1>
          <p className="mt-3 text-slate-600">
            Det finns inget pass att köra just nu.
          </p>
          <button
            onClick={() => router.push("/home")}
            className="mt-6 w-full rounded-2xl bg-blue-600 px-4 py-3 font-semibold text-white"
          >
            Till startsidan
          </button>
        </div>
      </main>
    );
  }

  if (workoutFinished && savedWorkoutLog) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-6 text-slate-900">
        <div className="mx-auto flex max-w-3xl flex-col gap-4">
          <section className="rounded-3xl border border-emerald-200 bg-white p-6 shadow-sm">
            <div className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-700">
              Pass sparat
            </div>

            <h1 className="mt-4 text-2xl font-bold">{savedWorkoutLog.workoutName}</h1>

            <p className="mt-2 text-slate-600">
              Bra jobbat, {getDisplayName(authUser)}.
            </p>

            <div className="mt-6 grid gap-3 md:grid-cols-3">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-sm text-slate-500">Genomförda set</div>
                <div className="mt-1 text-2xl font-bold">{totalCompletedSets}</div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-sm text-slate-500">Total volym</div>
                <div className="mt-1 text-2xl font-bold">
                  {Math.round(totalVolume)}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-sm text-slate-500">Avslutat</div>
                <div className="mt-1 text-base font-semibold">
                  {formatDateTime(savedWorkoutLog.completedAt)}
                </div>
              </div>
            </div>

            <button
              onClick={() => router.push("/home")}
              className="mt-6 w-full rounded-2xl bg-blue-600 px-4 py-3 font-semibold text-white"
            >
              Till startsidan
            </button>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 text-slate-900">
      <div className="mx-auto flex max-w-4xl flex-col gap-4">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <div
                className={`inline-flex rounded-full border px-3 py-1 text-sm font-medium ${getBadgeClasses(
                  "accent"
                )}`}
              >
                Pågående pass
              </div>

              <h1 className="mt-3 text-2xl font-bold">{workout.name}</h1>

              <p className="mt-2 text-slate-600">
                Hej {getDisplayName(authUser)}.
              </p>

              <div className="mt-3 flex flex-wrap gap-2 text-sm">
                <span
                  className={`rounded-full border px-3 py-1 ${getBadgeClasses(
                    "neutral"
                  )}`}
                >
                  {getExerciseProgressLabel()}
                </span>

                <span
                  className={`rounded-full border px-3 py-1 ${getBadgeClasses(
                    "neutral"
                  )}`}
                >
                  Set {currentSet} / {exercise?.sets ?? 0}
                </span>

                {workout.gym ? (
                  <span
                    className={`rounded-full border px-3 py-1 ${getBadgeClasses(
                      "neutral"
                    )}`}
                  >
                    Gym: {workout.gym}
                  </span>
                ) : null}
              </div>
            </div>

            <button
              onClick={() => void finishWorkout("aborted")}
              disabled={isFinishingWorkout}
              className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 font-semibold text-rose-700 disabled:opacity-50"
            >
              Avsluta pass
            </button>
          </div>
        </section>

        {pageError ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
            {pageError}
          </div>
        ) : null}

        {restoreNotice ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
            {restoreNotice}
          </div>
        ) : null}

        {exercise ? (
          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-3">
              <div>
                <div className="text-sm font-medium uppercase tracking-wide text-slate-500">
                  Aktuell övning
                </div>

                <h2 className="mt-1 text-2xl font-bold">{exercise.name}</h2>

                {exercise.description ? (
                  <p className="mt-2 text-slate-600">{exercise.description}</p>
                ) : null}
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-sm text-slate-500">Planerade set</div>
                  <div className="mt-1 text-xl font-bold">{exercise.sets}</div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-sm text-slate-500">
                    {timedExercise ? "Planerad tid" : "Planerade reps"}
                  </div>
                  <div className="mt-1 text-xl font-bold">
                    {timedExercise
                      ? formatDuration(exercise.duration ?? 0)
                      : exercise.reps ?? "-"}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-sm text-slate-500">Vila</div>
                  <div className="mt-1 text-xl font-bold">
                    {formatDuration(exercise.rest)}
                  </div>
                </div>
              </div>
            </div>
          </section>
        ) : null}

        {exercise && !showExerciseFeedback ? (
          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="grid gap-4">
              {/* Tydlig visualisering av vilket set som loggas just nu */}
              <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="text-sm font-medium uppercase tracking-wide text-blue-700">
                      Aktuellt set
                    </div>
                    <div className="mt-1 text-2xl font-bold text-blue-900">
                      {setProgressLabel}
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    {renderSetDots()}
                  </div>
                </div>
              </div>

              {timedExercise ? (
                <>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-center">
                    <div className="text-sm uppercase tracking-wide text-slate-500">
                      Tid för set
                    </div>
                    <div className="mt-2 text-5xl font-bold tracking-tight">
                      {formatTimerClock(exerciseTimerElapsedSeconds)}
                    </div>
                    <div className="mt-2 text-sm text-slate-500">
                      Mål: {formatDuration(exercise.duration ?? 0)}
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <button
                      onClick={startTimedSet}
                      disabled={timedSetPhase === "running"}
                      className="rounded-2xl bg-emerald-600 px-4 py-3 font-semibold text-white disabled:opacity-50"
                    >
                      Starta set
                    </button>

                    <button
                      onClick={stopTimedSet}
                      disabled={timedSetPhase !== "running"}
                      className="rounded-2xl bg-rose-600 px-4 py-3 font-semibold text-white disabled:opacity-50"
                    >
                      Stoppa set
                    </button>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <label className="mb-2 block text-sm font-medium text-slate-700">
                        Registrerad tid (sekunder)
                      </label>
                      <input
                        type="number"
                        min="0"
                        inputMode="numeric"
                        value={setLog.durationSeconds}
                        onChange={(event) =>
                          updateSetField("durationSeconds", event.target.value)
                        }
                        className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 outline-none ring-0 focus:border-blue-500"
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-medium text-slate-700">
                        Vikt (kg)
                      </label>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={setLog.weight}
                        onChange={(event) =>
                          updateSetField("weight", event.target.value)
                        }
                        className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 outline-none ring-0 focus:border-blue-500"
                      />
                      {suggestedWeightValue ? (
                        <p className="mt-2 text-xs text-slate-500">
                          Föreslagen vikt från tidigare resultat:{" "}
                          <span className="font-semibold text-slate-700">
                            {suggestedWeightValue} kg
                          </span>
                        </p>
                      ) : null}
                    </div>
                  </div>

                  {suggestedWeightOptions.length > 0 ? (
                    <div>
                      <div className="mb-2 text-sm font-medium text-slate-700">
                        Snabbval vikter
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {suggestedWeightOptions.map((weight) => {
                          const chipValue = formatWeightValue(weight);
                          const isSelected =
                            normalizeWeightString(chipValue) ===
                            normalizedCurrentWeight;
                          const isSuggested =
                            normalizeWeightString(chipValue) ===
                            normalizedSuggestedWeight;

                          return (
                            <button
                              key={weight}
                              onClick={() => updateSetField("weight", chipValue)}
                              className={`rounded-full border px-3 py-2 text-sm font-medium ${
                                isSelected
                                  ? "border-blue-600 bg-blue-600 text-white"
                                  : isSuggested
                                  ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                                  : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
                              }`}
                            >
                              {chipValue} kg
                              {isSuggested ? " · förslag" : ""}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}

                  <button
                    onClick={completeSet}
                    disabled={timedSetPhase !== "ready_to_save"}
                    className="rounded-2xl bg-blue-600 px-4 py-3 font-semibold text-white disabled:opacity-50"
                  >
                    {saveButtonLabel}
                  </button>
                </>
              ) : (
                <>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <label className="mb-2 block text-sm font-medium text-slate-700">
                        Reps
                      </label>
                      <input
                        type="number"
                        min="0"
                        inputMode="numeric"
                        value={setLog.reps}
                        onChange={(event) =>
                          updateSetField("reps", event.target.value)
                        }
                        className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 outline-none ring-0 focus:border-blue-500"
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-medium text-slate-700">
                        Vikt (kg)
                      </label>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={setLog.weight}
                        onChange={(event) =>
                          updateSetField("weight", event.target.value)
                        }
                        className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 outline-none ring-0 focus:border-blue-500"
                      />
                      {suggestedWeightValue ? (
                        <p className="mt-2 text-xs text-slate-500">
                          Föreslagen vikt från tidigare resultat:{" "}
                          <span className="font-semibold text-slate-700">
                            {suggestedWeightValue} kg
                          </span>
                        </p>
                      ) : null}
                    </div>
                  </div>

                  {suggestedWeightOptions.length > 0 ? (
                    <div>
                      <div className="mb-2 text-sm font-medium text-slate-700">
                        Snabbval vikter
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {suggestedWeightOptions.map((weight) => {
                          const chipValue = formatWeightValue(weight);
                          const isSelected =
                            normalizeWeightString(chipValue) ===
                            normalizedCurrentWeight;
                          const isSuggested =
                            normalizeWeightString(chipValue) ===
                            normalizedSuggestedWeight;

                          return (
                            <button
                              key={weight}
                              onClick={() => updateSetField("weight", chipValue)}
                              className={`rounded-full border px-3 py-2 text-sm font-medium ${
                                isSelected
                                  ? "border-blue-600 bg-blue-600 text-white"
                                  : isSuggested
                                  ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                                  : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
                              }`}
                            >
                              {chipValue} kg
                              {isSuggested ? " · förslag" : ""}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}

                  <button
                    onClick={completeSet}
                    className="rounded-2xl bg-blue-600 px-4 py-3 font-semibold text-white"
                  >
                    {saveButtonLabel}
                  </button>
                </>
              )}

              <button
                onClick={() => void skipExercise()}
                className="rounded-2xl border border-slate-300 bg-white px-4 py-3 font-semibold text-slate-700"
              >
                Hoppa över övning
              </button>
            </div>
          </section>
        ) : null}

        {showExerciseFeedback ? (
          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-xl font-bold">Hur kändes övningen?</h3>

            <div className="mt-2 text-sm text-slate-500">
              Denna fråga visas efter sista setet i övningen.
            </div>

            <div className="mt-4 grid gap-3">
              {timedExercise ? (
                <div className="grid gap-3">
                  {TIMED_EFFORT_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => setSelectedTimedEffort(option.value)}
                      className={`rounded-2xl border px-4 py-3 text-left ${
                        selectedTimedEffort === option.value
                          ? "border-blue-500 bg-blue-50 text-blue-800"
                          : "border-slate-200 bg-white text-slate-800"
                      }`}
                    >
                      <div className="font-semibold">{option.label}</div>
                      <div className="mt-1 text-sm text-slate-600">
                        {option.description}
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="grid gap-3">
                  {EXTRA_REP_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => setSelectedExtraReps(option.value)}
                      className={`rounded-2xl border px-4 py-3 text-left ${
                        selectedExtraReps === option.value
                          ? "border-blue-500 bg-blue-50 text-blue-800"
                          : "border-slate-200 bg-white text-slate-800"
                      }`}
                    >
                      <div className="font-semibold">{option.label}</div>
                      <div className="mt-1 text-sm text-slate-600">
                        {option.description}
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {isNewExerciseForRating ? (
                <div className="mt-2">
                  <div className="mb-2 text-sm font-medium text-slate-700">
                    Betyg på övningen
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {RATING_OPTIONS.map((rating) => (
                      <button
                        key={rating}
                        onClick={() => setSelectedRating(rating)}
                        className={`rounded-full border px-4 py-2 font-semibold ${
                          selectedRating === rating
                            ? "border-blue-500 bg-blue-50 text-blue-800"
                            : "border-slate-200 bg-white text-slate-700"
                        }`}
                      >
                        {rating}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              <button
                onClick={() => void completeExerciseFeedback()}
                disabled={
                  timedExercise
                    ? !selectedTimedEffort
                    : selectedExtraReps === null
                }
                className="mt-2 rounded-2xl bg-blue-600 px-4 py-3 font-semibold text-white disabled:opacity-50"
              >
                Fortsätt
              </button>
            </div>
          </section>
        ) : null}

        {showRestTimer && !timedExercise ? (
          <section className="rounded-3xl border border-amber-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="text-sm font-medium uppercase tracking-wide text-amber-700">
                  Vilotimer
                </div>
                <div className="mt-2 text-4xl font-bold">
                  {formatTimerClock(restRemainingSeconds)}
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => {
                    void ensureAudioReady();
                    setRestTimerRunning((prev) => !prev);
                  }}
                  className="rounded-2xl border border-slate-300 bg-white px-4 py-3 font-semibold text-slate-700"
                >
                  {restTimerRunning ? "Pausa" : "Starta"}
                </button>

                <button
                  onClick={() => adjustRestTimer(-15)}
                  className="rounded-2xl border border-slate-300 bg-white px-4 py-3 font-semibold text-slate-700"
                >
                  -15 s
                </button>

                <button
                  onClick={() => adjustRestTimer(15)}
                  className="rounded-2xl border border-slate-300 bg-white px-4 py-3 font-semibold text-slate-700"
                >
                  +15 s
                </button>

                <button
                  onClick={hideRestTimer}
                  className="rounded-2xl border border-slate-300 bg-white px-4 py-3 font-semibold text-slate-700"
                >
                  Dölj
                </button>
              </div>
            </div>
          </section>
        ) : null}

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-bold">Status hittills</h3>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-sm text-slate-500">Genomförda övningar</div>
              <div className="mt-1 text-2xl font-bold">
                {completedExercises.filter((item) => item.sets.length > 0).length}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-sm text-slate-500">Genomförda set</div>
              <div className="mt-1 text-2xl font-bold">{totalCompletedSets}</div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-sm text-slate-500">Total volym</div>
              <div className="mt-1 text-2xl font-bold">
                {Math.round(totalVolume)}
              </div>
            </div>
          </div>

          {completedExercises.length > 0 ? (
            <div className="mt-6 space-y-3">
              {completedExercises.map((exerciseItem) => (
                <div
                  key={exerciseItem.exerciseId}
                  className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                >
                  <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div className="font-semibold">{exerciseItem.exerciseName}</div>

                    <div className="text-sm text-slate-500">
                      {exerciseItem.sets.length} set
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    {exerciseItem.sets.map((setItem) => (
                      <span
                        key={`${exerciseItem.exerciseId}-${setItem.setNumber}-${setItem.completedAt}`}
                        className="rounded-full border border-slate-200 bg-white px-3 py-1 text-sm text-slate-700"
                      >
                        Set {setItem.setNumber}
                        {setItem.actualReps !== null
                          ? ` · ${setItem.actualReps} reps`
                          : ""}
                        {setItem.actualDuration !== null
                          ? ` · ${setItem.actualDuration} s`
                          : ""}
                        {setItem.actualWeight !== null
                          ? ` · ${formatWeightValue(setItem.actualWeight)} kg`
                          : ""}
                        {setItem.repsLeft !== null
                          ? ` · ${setItem.repsLeft} kvar`
                          : ""}
                        {setItem.timedEffort
                          ? ` · ${getTimedEffortLabel(setItem.timedEffort)}`
                          : ""}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}