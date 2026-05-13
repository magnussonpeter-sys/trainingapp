"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import PageNavActions from "@/components/shared/page-nav-actions";
import { saveCachedHomeSettings } from "@/lib/home-settings-cache";
import { uiButtonClasses } from "@/lib/ui/button-classes";
import { uiCardClasses } from "@/lib/ui/card-classes";
import { uiPageShellClasses } from "@/lib/ui/page-shell-classes";
import type { WorkoutGenerationMode } from "@/lib/workout-generation/types";
import type {
  SportFocus,
  TrainingGoal,
} from "@/types/training-profile";

type Sex = "male" | "female" | "other" | "na";
type Experience = "beginner" | "novice" | "intermediate" | "advanced";
type SupersetPreference = "allowed" | "avoid_all_dumbbell" | "avoid_all";
type PriorityMuscle =
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

type AuthUser = {
  id: number | string;
  email: string | null;
  username?: string | null;
  name?: string | null;
};

type UserSettingsResponse = {
  ok?: boolean;
  error?: string;
  settings?: {
    sex?: Sex | null;
    age?: number | null;
    weight_kg?: number | null;
    height_cm?: number | null;
    experience_level?: Experience | null;
    training_goal?: TrainingGoal | null;
    sport_focus?: SportFocus | null;
    generation_mode?: WorkoutGenerationMode | null;
    avoid_supersets?: boolean | null;
    superset_preference?: SupersetPreference | null;
    primary_priority_muscle?: PriorityMuscle | null;
    secondary_priority_muscle?: PriorityMuscle | null;
    tertiary_priority_muscle?: PriorityMuscle | null;
  };
};

const PRIORITY_MUSCLE_OPTIONS: Array<{
  value: PriorityMuscle;
  label: string;
  shortLabel: string;
}> = [
  { value: "chest", label: "Bröst", shortLabel: "Bröst" },
  { value: "back", label: "Rygg", shortLabel: "Rygg" },
  { value: "quads", label: "Framsida lår", shortLabel: "Quads" },
  { value: "hamstrings", label: "Baksida lår", shortLabel: "Hamstrings" },
  { value: "glutes", label: "Säte", shortLabel: "Säte" },
  { value: "shoulders", label: "Axlar", shortLabel: "Axlar" },
  { value: "biceps", label: "Biceps", shortLabel: "Biceps" },
  { value: "triceps", label: "Triceps", shortLabel: "Triceps" },
  { value: "calves", label: "Vader", shortLabel: "Vader" },
  { value: "core", label: "Bål", shortLabel: "Bål" },
];

const SPORT_FOCUS_OPTIONS: Array<{
  value: SportFocus;
  title: string;
  description: string;
}> = [
  {
    value: "none",
    title: "Ingen särskild inriktning",
    description: "Ingen extra sportjustering. Huvudmålet styr som vanligt.",
  },
  {
    value: "running",
    title: "Löpning",
    description:
      "Fokus på höftstabilitet, vader, säte, hamstrings och bål utan onödig tung benvolym.",
  },
  {
    value: "cross_country_skiing",
    title: "Längdskidor",
    description:
      "Fokus på båluthållighet, dragstyrka, rygg/lats och höftdriv.",
  },
  {
    value: "alpine_skiing",
    title: "Utförsåkning",
    description:
      "Fokus på benstyrka, framsida lår, säte, enbenskontroll och bålstabilitet.",
  },
  {
    value: "cycling",
    title: "Cykling",
    description:
      "Fokus på säte, framsida lår, hamstrings och positionstålig bål.",
  },
  {
    value: "ball_sports",
    title: "Bollsport / lagidrott",
    description:
      "Fokus på acceleration, riktningsförändring, hamstrings, adduktorer och enbensstyrka.",
  },
  {
    value: "swimming",
    title: "Simning",
    description:
      "Fokus på dragstyrka, skulderkontroll, rotatorcuff och bål.",
  },
  {
    value: "golf",
    title: "Golf",
    description:
      "Fokus på rotation, antirotation, höftkontroll och ryggstyrka.",
  },
  {
    value: "surf_sports",
    title: "Surfsporter",
    description:
      "Fokus på grepp, dragstyrka, skulderstabilitet, bål och balans.",
  },
  {
    value: "general_athletic",
    title: "Allmän idrott",
    description: "Balanserad helkroppsstyrka och basrörelser.",
  },
];

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function getPriorityLabel(muscle: PriorityMuscle) {
  return (
    PRIORITY_MUSCLE_OPTIONS.find((option) => option.value === muscle)?.label ??
    muscle
  );
}

export default function SettingsPage() {
  const router = useRouter();

  const [authChecked, setAuthChecked] = useState(false);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);

  const [sex, setSex] = useState("");
  const [age, setAge] = useState("");
  const [weight, setWeight] = useState("");
  const [height, setHeight] = useState("");
  const [experience, setExperience] = useState("");
  const [goal, setGoal] = useState("");
  const [sportFocus, setSportFocus] = useState<SportFocus>("none");
  const [generationMode, setGenerationMode] =
    useState<WorkoutGenerationMode>("legacy_ai_chain");
  const [supersetPreference, setSupersetPreference] =
    useState<SupersetPreference>("allowed");
  const [priorityMuscles, setPriorityMuscles] = useState<PriorityMuscle[]>([]);
  const [draggedPriorityIndex, setDraggedPriorityIndex] = useState<number | null>(
    null,
  );

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [pageError, setPageError] = useState("");

  const canUsePriorityMuscles =
    goal === "hypertrophy" || goal === "body_composition";

  const selectedPriorityDescription = useMemo(() => {
    if (priorityMuscles.length === 0) {
      return "Ingen särskild muskelgrupp är prioriterad just nu.";
    }

    if (priorityMuscles.length === 1) {
      return `${getPriorityLabel(priorityMuscles[0])} får extra fokus i veckoplanen.`;
    }

    return `${priorityMuscles
      .map((muscle, index) => `${index + 1}. ${getPriorityLabel(muscle).toLowerCase()}`)
      .join(", ")} styr extra fokus i veckoplanen.`;
  }, [priorityMuscles]);

  useEffect(() => {
    let isMounted = true;

    async function checkAuthAndLoad() {
      try {
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

        if (!isMounted) return;

        setAuthUser(user);
        setAuthChecked(true);

        const userId = String(user.id);
        const settingsRes = await fetch(
          `/api/user-settings?userId=${encodeURIComponent(userId)}`,
          {
            cache: "no-store",
            credentials: "include",
          },
        );

        const settingsData = (await settingsRes.json()) as UserSettingsResponse;

        if (!settingsRes.ok || !settingsData?.ok) {
          throw new Error(
            settingsData?.error || "Kunde inte hämta inställningar",
          );
        }

        if (settingsData.settings) {
          const s = settingsData.settings;
          setSex(s.sex ?? "");
          setAge(s.age?.toString() ?? "");
          setWeight(s.weight_kg?.toString() ?? "");
          setHeight(s.height_cm?.toString() ?? "");
          setExperience(s.experience_level ?? "");
          setGoal(s.training_goal ?? "");
          setSportFocus(s.sport_focus ?? "none");
          setGenerationMode(
            s.generation_mode === "slot_based_v1" ||
              s.generation_mode === "hybrid"
              ? s.generation_mode
              : "legacy_ai_chain",
          );
          setSupersetPreference(
            s.superset_preference === "allowed" ||
              s.superset_preference === "avoid_all" ||
              s.superset_preference === "avoid_all_dumbbell"
              ? s.superset_preference
              : Boolean(s.avoid_supersets)
                ? "avoid_all"
                : "allowed",
          );
          setPriorityMuscles(
            [
              s.primary_priority_muscle,
              s.secondary_priority_muscle,
              s.tertiary_priority_muscle,
            ].filter(
              (value): value is PriorityMuscle => typeof value === "string",
            ),
          );
        }
      } catch (error) {
        if (!isMounted) return;

        setPageError(
          error instanceof Error
            ? error.message
            : "Kunde inte hämta inställningar",
        );
      } finally {
        if (isMounted) {
          setAuthChecked(true);
        }
      }
    }

    void checkAuthAndLoad();

    return () => {
      isMounted = false;
    };
  }, [router]);

  useEffect(() => {
    if (canUsePriorityMuscles) {
      return;
    }

    setPriorityMuscles([]);
  }, [canUsePriorityMuscles]);

  function togglePriorityMuscle(muscle: PriorityMuscle) {
    setPriorityMuscles((current) => {
      if (current.includes(muscle)) {
        return current.filter((item) => item !== muscle);
      }

      if (current.length >= 3) {
        return current;
      }

      return [...current, muscle];
    });
  }

  function movePriorityMuscle(fromIndex: number, toIndex: number) {
    if (
      fromIndex === toIndex ||
      fromIndex < 0 ||
      toIndex < 0 ||
      fromIndex >= priorityMuscles.length ||
      toIndex >= priorityMuscles.length
    ) {
      return;
    }

    setPriorityMuscles((current) => {
      const next = [...current];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  }

  async function save() {
    if (!authUser) return;

    setSaving(true);
    setMessage("");
    setPageError("");

    try {
      const userId = String(authUser.id);
      const primaryPriorityMuscle = canUsePriorityMuscles
        ? priorityMuscles[0] ?? null
        : null;
      const secondaryPriorityMuscle = canUsePriorityMuscles
        ? priorityMuscles[1] ?? null
        : null;
      const tertiaryPriorityMuscle = canUsePriorityMuscles
        ? priorityMuscles[2] ?? null
        : null;

      const res = await fetch("/api/user-settings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          userId,
          sex: sex || null,
          age: age ? Number(age) : null,
          weight_kg: weight ? Number(weight) : null,
          height_cm: height ? Number(height) : null,
          experience_level: experience || null,
          training_goal: goal || null,
          sport_focus: sportFocus,
          generation_mode: generationMode,
          avoid_supersets: supersetPreference === "avoid_all",
          superset_preference: supersetPreference,
          primary_priority_muscle: primaryPriorityMuscle,
          secondary_priority_muscle: secondaryPriorityMuscle,
          tertiary_priority_muscle: tertiaryPriorityMuscle,
        }),
      });

      const data = (await res.json()) as UserSettingsResponse;

      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Kunde inte spara");
      }

      saveCachedHomeSettings(userId, {
        training_goal: (goal || null) as TrainingGoal | null,
        sport_focus: sportFocus,
        generation_mode: generationMode,
        avoid_supersets: supersetPreference === "avoid_all",
        superset_preference: supersetPreference,
        primary_priority_muscle: primaryPriorityMuscle,
        secondary_priority_muscle: secondaryPriorityMuscle,
        tertiary_priority_muscle: tertiaryPriorityMuscle,
      });

      setMessage("Inställningarna sparades.");
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "Kunde inte spara");
      setMessage("");
    } finally {
      setSaving(false);
    }
  }

  if (!authChecked) {
    return <div className="p-6">Kontrollerar inloggning...</div>;
  }

  return (
    <main className={uiPageShellClasses.page}>
      <div className={cn(uiPageShellClasses.content, uiPageShellClasses.stack)}>
        <PageNavActions
          backAction={{ label: "Till hem", href: "/home" }}
          cancelAction={{ label: "Avbryt", href: "/home" }}
        />

        <section className={cn(uiCardClasses.section, uiCardClasses.sectionPadded)}>
          <div className="space-y-2">
            <p className="text-sm font-medium text-slate-500">Inställningar</p>
            <h1 className="text-3xl font-semibold tracking-tight text-slate-950">
              Din träningsprofil
            </h1>
            <p className="max-w-2xl text-sm leading-6 text-slate-600">
              Här styr du hur AI:n tänker kring mål, passupplägg och vilka
              muskelgrupper som ska få extra fokus i veckoplanen.
            </p>
          </div>
        </section>

        {pageError ? <div className={uiCardClasses.danger}>{pageError}</div> : null}
        {message ? <div className={uiCardClasses.success}>{message}</div> : null}

        <section className={cn(uiCardClasses.section, uiCardClasses.sectionPadded)}>
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-950">Profil</h2>
              <p className="mt-1 text-sm text-slate-600">
                Grunddata som hjälper planeringen att hitta rätt nivå och dos.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="text-sm font-medium text-slate-900">Kön</label>
                <select
                  value={sex}
                  onChange={(e) => setSex(e.target.value as Sex)}
                  className="mt-2 min-h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                >
                  <option value="">Välj kön</option>
                  <option value="male">Man</option>
                  <option value="female">Kvinna</option>
                  <option value="other">Annat</option>
                  <option value="na">Vill ej ange</option>
                </select>
              </div>

              <div>
                <label className="text-sm font-medium text-slate-900">Ålder</label>
                <input
                  value={age}
                  onChange={(e) => setAge(e.target.value)}
                  placeholder="Ålder"
                  inputMode="numeric"
                  className="mt-2 min-h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-slate-900">Vikt</label>
                <input
                  value={weight}
                  onChange={(e) => setWeight(e.target.value)}
                  placeholder="Vikt (kg)"
                  inputMode="decimal"
                  className="mt-2 min-h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-slate-900">Längd</label>
                <input
                  value={height}
                  onChange={(e) => setHeight(e.target.value)}
                  placeholder="Längd (cm)"
                  inputMode="numeric"
                  className="mt-2 min-h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                />
              </div>
            </div>
          </div>
        </section>

        <section className={cn(uiCardClasses.section, uiCardClasses.sectionPadded)}>
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-950">Erfarenhet</h2>
              <p className="mt-1 text-sm text-slate-600">
                Hjälper appen att välja rätt volym, svårighetsgrad och variation.
              </p>
            </div>

            <select
              value={experience}
              onChange={(e) => setExperience(e.target.value as Experience)}
              className="min-h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
            >
              <option value="">Välj nivå</option>
              <option value="beginner">Nybörjare</option>
              <option value="novice">Viss vana</option>
              <option value="intermediate">Erfaren</option>
              <option value="advanced">Avancerad</option>
            </select>
          </div>
        </section>

        <section className={cn(uiCardClasses.section, uiCardClasses.sectionPadded)}>
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-950">Mål</h2>
              <p className="mt-1 text-sm text-slate-600">
                Ditt mål styr veckostruktur, träningsdos och hur AI prioriterar.
              </p>
            </div>

            <div className="grid gap-3">
              {[
                {
                  value: "strength" as TrainingGoal,
                  title: "Bli starkare",
                  description:
                    "Fokuserar på styrkeutveckling i större lyft med mer vila och tydligare toppset.",
                },
                {
                  value: "hypertrophy" as TrainingGoal,
                  title: "Bygga muskler",
                  description:
                    "Mer träningsvolym och fler effektiva arbetsset för att stimulera muskelmassa.",
                },
                {
                  value: "health" as TrainingGoal,
                  title: "Hälsa och funktion",
                  description:
                    "Helkroppsträning för vardagsstyrka, hållbarhet och låg tröskel att genomföra.",
                },
                {
                  value: "body_composition" as TrainingGoal,
                  title: "Kroppssammansättning",
                  description:
                    "Kombinerar styrka och täthet för att behålla muskler och förbättra kroppssammansättningen.",
                },
              ].map((option) => {
                const selected = goal === option.value;

                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setGoal(option.value)}
                    className={cn(
                      "rounded-[24px] border p-4 text-left transition",
                      selected
                        ? "border-lime-500 bg-lime-100 shadow-sm"
                        : "border-slate-200 bg-white hover:bg-slate-50",
                    )}
                  >
                    <div className="font-semibold text-slate-950">{option.title}</div>
                    <p className="mt-1 text-sm leading-6 text-slate-600">
                      {option.description}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        <section className={cn(uiCardClasses.section, uiCardClasses.sectionPadded)}>
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-950">
                Träningsinriktning
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Valfritt. Påverkar övningsval, belastning och hur AI prioriterar träningen.
              </p>
            </div>

            <div className="grid gap-3">
              {SPORT_FOCUS_OPTIONS.map((option) => {
                const selected = sportFocus === option.value;

                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setSportFocus(option.value)}
                    className={cn(
                      "rounded-[24px] border p-4 text-left transition",
                      selected
                        ? "border-lime-500 bg-lime-100 shadow-sm"
                        : "border-slate-200 bg-white hover:bg-slate-50",
                    )}
                  >
                    <div className="font-semibold text-slate-950">{option.title}</div>
                    <p className="mt-1 text-sm leading-6 text-slate-600">
                      {option.description}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        <section className={cn(uiCardClasses.section, uiCardClasses.sectionPadded)}>
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-950">
                Muskelgruppsprio
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Välj upp till tre muskelgrupper som ska få extra fokus i
                veckobudgeten. Ordningen styr vilken som är viktigast.
              </p>
            </div>

            {canUsePriorityMuscles ? (
              <>
                <div className={uiCardClasses.soft}>
                  <p className="text-sm font-medium text-slate-900">
                    Prioriteringsordning
                  </p>
                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    Använd pilarna för att byta ordning. Du kan också dra korten om du vill.
                  </p>

                  <div className="mt-4 space-y-3">
                    {priorityMuscles.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-slate-300 bg-white/60 p-4 text-sm text-slate-500">
                        Ingen muskelgrupp vald ännu.
                      </div>
                    ) : null}

                    {priorityMuscles.map((muscle, index) => (
                      <div
                        key={muscle}
                        draggable
                        onDragStart={() => setDraggedPriorityIndex(index)}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={() => {
                          if (draggedPriorityIndex === null) {
                            return;
                          }

                          movePriorityMuscle(draggedPriorityIndex, index);
                          setDraggedPriorityIndex(null);
                        }}
                        onDragEnd={() => setDraggedPriorityIndex(null)}
                        className={cn(
                          "flex items-center justify-between gap-3 rounded-2xl border px-4 py-3",
                          draggedPriorityIndex === index
                            ? "border-lime-500 bg-lime-100"
                            : "border-slate-200 bg-white",
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-sm font-semibold text-white">
                            {index + 1}
                          </div>
                          <div>
                            <p className="font-medium text-slate-950">
                              {getPriorityLabel(muscle)}
                            </p>
                            <p className="text-xs text-slate-500">
                              {index === 0
                                ? "Högst prioriterad"
                                : index === 1
                                  ? "Sekundär prioritet"
                                  : "Tredje prioritet"}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => movePriorityMuscle(index, index - 1)}
                            disabled={index === 0}
                            className={uiButtonClasses.ghost}
                            aria-label={`Flytta upp ${getPriorityLabel(muscle)}`}
                            title="Flytta upp"
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            onClick={() => movePriorityMuscle(index, index + 1)}
                            disabled={index === priorityMuscles.length - 1}
                            className={uiButtonClasses.ghost}
                            aria-label={`Flytta ned ${getPriorityLabel(muscle)}`}
                            title="Flytta ned"
                          >
                            ↓
                          </button>
                          <button
                            type="button"
                            onClick={() => togglePriorityMuscle(muscle)}
                            className={uiButtonClasses.ghost}
                            aria-label={`Ta bort ${getPriorityLabel(muscle)} från prioriteringen`}
                          >
                            Ta bort
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <p className="mt-4 text-sm leading-6 text-slate-600">
                    {selectedPriorityDescription}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  {PRIORITY_MUSCLE_OPTIONS.map((option) => {
                    const selected = priorityMuscles.includes(option.value);
                    const disabled = !selected && priorityMuscles.length >= 3;

                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => togglePriorityMuscle(option.value)}
                        disabled={disabled}
                        className={cn(
                          uiButtonClasses.chip,
                          selected
                            ? uiButtonClasses.chipSelected
                            : uiButtonClasses.chipDefault,
                          disabled && "opacity-50",
                        )}
                      >
                        {option.shortLabel}
                      </button>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className={uiCardClasses.soft}>
                <p className="text-sm font-medium text-slate-900">
                  Muskelgruppsprio aktiveras för mål där extra fokus är mest
                  relevant.
                </p>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  Välj främst <span className="font-medium">Bygga muskler</span>{" "}
                  eller <span className="font-medium">Kroppssammansättning</span>{" "}
                  om du vill styra 1–3 prioriterade muskelgrupper.
                </p>
              </div>
            )}
          </div>
        </section>

        <section className={cn(uiCardClasses.section, uiCardClasses.sectionPadded)}>
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-950">
                Passmotor
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Välj vilken passgenerator som ska användas som standard i appen.
                Legacy är stabilast. Slot-baserad v1 är den nya modellen som vi
                utvecklar vidare.
              </p>
            </div>

            <div className="grid gap-3">
              {[
                {
                  value: "legacy_ai_chain" as WorkoutGenerationMode,
                  title: "Legacy AI-kedja",
                  description:
                    "Nuvarande standardkedja. Mest beprövad och bäst fallback-kompatibilitet.",
                },
                {
                  value: "slot_based_v1" as WorkoutGenerationMode,
                  title: "Slot-baserad v1",
                  description:
                    "Nyare modell med tydligare passstruktur och starkare slot-kontrakt.",
                },
              ].map((option) => {
                const selected = generationMode === option.value;

                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setGenerationMode(option.value)}
                    className={cn(
                      "rounded-[24px] border p-4 text-left transition",
                      selected
                        ? "border-lime-500 bg-lime-100 shadow-sm"
                        : "border-slate-200 bg-white hover:bg-slate-50",
                    )}
                  >
                    <div className="font-semibold text-slate-950">{option.title}</div>
                    <p className="mt-1 text-sm leading-6 text-slate-600">
                      {option.description}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        <section className={cn(uiCardClasses.section, uiCardClasses.sectionPadded)}>
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-950">Passupplägg</h2>
              <p className="mt-1 text-sm text-slate-600">
                Styr om AI:n får använda supersets fritt eller ska undvika vissa
                kombinationer.
              </p>
            </div>

            <div className="grid gap-3">
              {[
                {
                  value: "allowed" as const,
                  title: "Tillåt supersets",
                  description:
                    "AI:n får använda relevanta supersets i korta pass när det sparar tid.",
                },
                {
                  value: "avoid_all_dumbbell" as const,
                  title: "Max en hantelövning per superset",
                  description:
                    "Supersets får innehålla hantlar, men inte fler än en hantelövning i samma superset.",
                },
                {
                  value: "avoid_all" as const,
                  title: "Undvik alla supersets",
                  description:
                    "AI:n bygger passet utan superset och använder straight sets i stället.",
                },
              ].map((option) => {
                const selected = supersetPreference === option.value;

                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setSupersetPreference(option.value)}
                    className={cn(
                      "rounded-[24px] border p-4 text-left transition",
                      selected
                        ? "border-lime-500 bg-lime-100 shadow-sm"
                        : "border-slate-200 bg-white hover:bg-slate-50",
                    )}
                  >
                    <div className="font-semibold text-slate-950">{option.title}</div>
                    <p className="mt-1 text-sm leading-6 text-slate-600">
                      {option.description}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        <div className="flex flex-wrap items-center gap-4 px-1">
          <Link
            href="/home/plan"
            className="inline-flex text-sm text-slate-500 underline-offset-4 transition hover:text-slate-700 hover:underline"
          >
            Öppna veckoplanen
          </Link>
          <Link
            href="/analysis/debug"
            className="inline-flex text-sm text-slate-500 underline-offset-4 transition hover:text-slate-700 hover:underline"
          >
            Öppna debug-sidan
          </Link>
        </div>

        <div className="flex items-center gap-3 pb-4">
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className={uiButtonClasses.primary}
          >
            {saving ? "Sparar..." : "Spara inställningar"}
          </button>
          <Link href="/home" className={uiButtonClasses.secondary}>
            Avbryt
          </Link>
        </div>
      </div>
    </main>
  );
}
