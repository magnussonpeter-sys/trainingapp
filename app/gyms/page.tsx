"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type EquipmentType =
  | "dumbbell"
  | "barbell"
  | "bench"
  | "rack"
  | "kettlebell"
  | "machine"
  | "cable"
  | "bands"
  | "rings"
  | "bodyweight"
  | "other";

type BandLevel = "light" | "medium" | "heavy";

type AuthUser = {
  id: number;
  email: string | null;
  username: string | null;
  name?: string | null;
  role?: "user" | "admin";
};

type GymEquipment = {
  id: string;
  gym_id: string;
  equipment_type: EquipmentType;
  label: string;
  notes?: string | null;
  weights_kg?: number[] | null;
  band_level?: BandLevel | null;
  quantity?: number | null;
};

type Gym = {
  id: string;
  user_id: string;
  name: string;
  description?: string | null;
  equipment: GymEquipment[];
};

type EquipmentDraft = {
  equipmentType: EquipmentType;
  label: string;
  quantity: string;
  notes: string;
  selectedWeights: number[];
  manualWeightInput: string;
  bandLevel: BandLevel;
};

const EQUIPMENT_TYPE_OPTIONS: Array<{ value: EquipmentType; label: string }> = [
  { value: "dumbbell", label: "Hantlar" },
  { value: "barbell", label: "Skivstång" },
  { value: "bench", label: "Bänk" },
  { value: "rack", label: "Rack / ställning" },
  { value: "kettlebell", label: "Kettlebells" },
  { value: "machine", label: "Maskin" },
  { value: "cable", label: "Kabelmaskin" },
  { value: "bands", label: "Gummiband" },
  { value: "rings", label: "Romerska ringar" },
  { value: "bodyweight", label: "Kroppsvikt" },
  { value: "other", label: "Övrigt" },
];

const DEFAULT_LABELS: Record<EquipmentType, string> = {
  dumbbell: "Hantlar",
  barbell: "Skivstång",
  bench: "Bänk",
  rack: "Rack",
  kettlebell: "Kettlebells",
  machine: "Maskin",
  cable: "Kabelmaskin",
  bands: "Gummiband",
  rings: "Romerska ringar",
  bodyweight: "Kroppsvikt",
  other: "Namn på utrustning",
};

function createDefaultEquipmentDraft(
  equipmentType: EquipmentType = "dumbbell"
): EquipmentDraft {
  return {
    equipmentType,
    label: DEFAULT_LABELS[equipmentType],
    quantity: "",
    notes: "",
    selectedWeights: [],
    manualWeightInput: "",
    bandLevel: "medium",
  };
}

function isWeightBasedType(type: EquipmentType) {
  return type === "dumbbell" || type === "barbell" || type === "kettlebell";
}

function getEquipmentTypeLabel(type: EquipmentType) {
  return (
    EQUIPMENT_TYPE_OPTIONS.find((option) => option.value === type)?.label ?? type
  );
}

function formatWeightValue(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function formatWeights(weights?: number[] | null) {
  if (!weights || weights.length === 0) {
    return "Alla vikter / ej specificerat";
  }

  return `${[...weights].sort((a, b) => a - b).map(formatWeightValue).join(", ")} kg`;
}

function formatEquipmentMeta(item: GymEquipment) {
  const parts: string[] = [];

  if (isWeightBasedType(item.equipment_type)) {
    parts.push(formatWeights(item.weights_kg));
  }

  if (item.equipment_type === "bands" && item.band_level) {
    const bandLabel =
      item.band_level === "light"
        ? "Lätt"
        : item.band_level === "medium"
        ? "Medium"
        : "Tung";
    parts.push(`Motstånd: ${bandLabel}`);
  }

  if (item.quantity && item.quantity > 0) {
    parts.push(`Antal: ${item.quantity}`);
  }

  if (item.notes?.trim()) {
    parts.push(item.notes.trim());
  }

  return parts.join(" • ");
}

function getGymDisplayCount(gym: Gym) {
  return gym.equipment.length;
}

// Snabbval för hantlar: 0,5 kg-steg upp till 20 kg.
function getDumbbellQuickWeights() {
  const weights: number[] = [];

  for (let weight = 0.5; weight <= 20; weight += 0.5) {
    weights.push(Number(weight.toFixed(1)));
  }

  return weights;
}

// Snabbval för skivstång/kettlebell: helt kilo upp till 20 kg.
function getWholeKiloQuickWeights() {
  return Array.from({ length: 20 }, (_, index) => index + 1);
}

function getQuickWeightsForType(type: EquipmentType) {
  if (type === "dumbbell") {
    return getDumbbellQuickWeights();
  }

  if (type === "barbell" || type === "kettlebell") {
    return getWholeKiloQuickWeights();
  }

  return [];
}

// Tillåt flera vikter i samma manuella input.
function parseManualWeightsInput(value: string) {
  return value
    .split(/[\s,;]+/)
    .map((item) => item.trim().replace(",", "."))
    .filter(Boolean)
    .map((item) => Number(item))
    .filter((item) => Number.isFinite(item) && item > 0);
}

function sortUniqueWeights(weights: number[]) {
  return [...new Set(weights)].sort((a, b) => a - b);
}

export default function GymsPage() {
  const router = useRouter();

  const [authChecked, setAuthChecked] = useState(false);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);

  const [gyms, setGyms] = useState<Gym[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [pageError, setPageError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [newGymName, setNewGymName] = useState("");
  const [newGymDescription, setNewGymDescription] = useState("");
  const [isSavingGym, setIsSavingGym] = useState(false);

  const [editingGymId, setEditingGymId] = useState<string | null>(null);
  const [editingGymName, setEditingGymName] = useState("");
  const [editingGymDescription, setEditingGymDescription] = useState("");
  const [isUpdatingGym, setIsUpdatingGym] = useState(false);

  // Ett draft-formulär per gym i edit-läge.
  const [equipmentDrafts, setEquipmentDrafts] = useState<
    Record<string, EquipmentDraft>
  >({});
  const [savingEquipmentGymId, setSavingEquipmentGymId] = useState<string | null>(
    null
  );
  const [deletingGymId, setDeletingGymId] = useState<string | null>(null);
  const [deletingEquipmentId, setDeletingEquipmentId] = useState<string | null>(
    null
  );

  const userId = authUser?.id ? String(authUser.id) : "";

  const sortedGyms = useMemo(() => {
    return [...gyms].sort((a, b) => a.name.localeCompare(b.name, "sv"));
  }, [gyms]);

  const getDraftForGym = useCallback(
    (gymId: string) => {
      return equipmentDrafts[gymId] ?? createDefaultEquipmentDraft();
    },
    [equipmentDrafts]
  );

  const updateDraftForGym = useCallback(
    (gymId: string, updates: Partial<EquipmentDraft>) => {
      setEquipmentDrafts((prev) => {
        const current = prev[gymId] ?? createDefaultEquipmentDraft();

        return {
          ...prev,
          [gymId]: {
            ...current,
            ...updates,
          },
        };
      });
    },
    []
  );

  const resetDraftForGym = useCallback((gymId: string) => {
    setEquipmentDrafts((prev) => ({
      ...prev,
      [gymId]: createDefaultEquipmentDraft(),
    }));
  }, []);

  const addQuickWeightToDraft = useCallback(
    (gymId: string, weight: number) => {
      const current = getDraftForGym(gymId);

      updateDraftForGym(gymId, {
        selectedWeights: sortUniqueWeights([...current.selectedWeights, weight]),
      });
    },
    [getDraftForGym, updateDraftForGym]
  );

  const removeWeightFromDraft = useCallback(
    (gymId: string, weight: number) => {
      const current = getDraftForGym(gymId);

      updateDraftForGym(gymId, {
        selectedWeights: current.selectedWeights.filter((item) => item !== weight),
      });
    },
    [getDraftForGym, updateDraftForGym]
  );

  const applyManualWeightsToDraft = useCallback(
    (gymId: string) => {
      const current = getDraftForGym(gymId);
      const parsed = parseManualWeightsInput(current.manualWeightInput);

      if (parsed.length === 0) {
        return;
      }

      updateDraftForGym(gymId, {
        selectedWeights: sortUniqueWeights([
          ...current.selectedWeights,
          ...parsed,
        ]),
        manualWeightInput: "",
      });
    },
    [getDraftForGym, updateDraftForGym]
  );

  const fetchGyms = useCallback(async (currentUserId: string) => {
    setIsLoading(true);
    setPageError(null);

    try {
      const res = await fetch(
        `/api/gyms?userId=${encodeURIComponent(currentUserId)}`,
        {
          cache: "no-store",
          credentials: "include",
        }
      );

      const data = await res.json();

      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Kunde inte hämta gym.");
      }

      const nextGyms = Array.isArray(data.gyms) ? (data.gyms as Gym[]) : [];
      setGyms(nextGyms);

      setEditingGymId((prev) => {
        if (!prev) return null;
        return nextGyms.some((gym) => gym.id === prev) ? prev : null;
      });
    } catch (error) {
      console.error("GET gyms failed:", error);
      setPageError(
        error instanceof Error ? error.message : "Kunde inte hämta gym."
      );
      setGyms([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function checkAuth() {
      try {
        setPageError(null);

        const res = await fetch("/api/auth/me", {
          cache: "no-store",
          credentials: "include",
        });

        let data: unknown = null;

        try {
          data = await res.json();
        } catch {
          data = null;
        }

        if (
          !res.ok ||
          !data ||
          typeof data !== "object" ||
          !("user" in data) ||
          !(data as { user?: unknown }).user
        ) {
          router.replace("/");
          return;
        }

        const user = (data as { user: AuthUser }).user;

        if (!isMounted) return;

        setAuthUser(user);
        setAuthChecked(true);

        await fetchGyms(String(user.id));
      } catch (error) {
        console.error("Auth check failed on /gyms:", error);

        if (!isMounted) return;

        router.replace("/");
      } finally {
        if (isMounted) {
          setAuthChecked(true);
        }
      }
    }

    void checkAuth();

    return () => {
      isMounted = false;
    };
  }, [fetchGyms, router]);

  async function handleCreateGym(e: React.FormEvent) {
    e.preventDefault();

    if (!userId) return;

    if (!newGymName.trim()) {
      setPageError("Ange ett namn på gymmet.");
      return;
    }

    setIsSavingGym(true);
    setPageError(null);
    setSuccessMessage(null);

    try {
      const res = await fetch("/api/gyms", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId,
          name: newGymName.trim(),
          description: newGymDescription.trim() || null,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Kunde inte skapa gym.");
      }

      setNewGymName("");
      setNewGymDescription("");
      setSuccessMessage("Gym sparat.");

      await fetchGyms(userId);

      if (data?.gym?.id) {
        startEditGym({
          id: String(data.gym.id),
          user_id: String(userId),
          name: String(data.gym.name ?? newGymName),
          description:
            typeof data.gym.description === "string" ? data.gym.description : null,
          equipment: [],
        });
      }
    } catch (error) {
      console.error("Create gym failed:", error);
      setPageError(error instanceof Error ? error.message : "Kunde inte skapa gym.");
    } finally {
      setIsSavingGym(false);
    }
  }

  function startEditGym(gym: Gym) {
    setEditingGymId(gym.id);
    setEditingGymName(gym.name);
    setEditingGymDescription(gym.description ?? "");
    setSuccessMessage(null);
    setPageError(null);
  }

  function cancelEditGym() {
    setEditingGymId(null);
    setEditingGymName("");
    setEditingGymDescription("");
  }

  async function handleSaveGym(gymId: string) {
    if (!userId) return;

    if (!editingGymName.trim()) {
      setPageError("Gymmet måste ha ett namn.");
      return;
    }

    setIsUpdatingGym(true);
    setPageError(null);
    setSuccessMessage(null);

    try {
      const res = await fetch(`/api/gyms/${gymId}`, {
        method: "PATCH",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId,
          name: editingGymName.trim(),
          description: editingGymDescription.trim() || null,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Kunde inte spara ändringar.");
      }

      setSuccessMessage("Gym uppdaterat.");
      await fetchGyms(userId);
    } catch (error) {
      console.error("Update gym failed:", error);
      setPageError(
        error instanceof Error ? error.message : "Kunde inte uppdatera gym."
      );
    } finally {
      setIsUpdatingGym(false);
    }
  }

  async function handleDeleteGym(gymId: string) {
    if (!userId) return;

    const confirmed = window.confirm(
      "Vill du verkligen ta bort detta gym och dess utrustning?"
    );

    if (!confirmed) return;

    setDeletingGymId(gymId);
    setPageError(null);
    setSuccessMessage(null);

    try {
      const res = await fetch(`/api/gyms/${gymId}`, {
        method: "DELETE",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ userId }),
      });

      const data = await res.json();

      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Kunde inte ta bort gym.");
      }

      setSuccessMessage("Gym borttaget.");
      await fetchGyms(userId);

      if (editingGymId === gymId) {
        cancelEditGym();
      }
    } catch (error) {
      console.error("Delete gym failed:", error);
      setPageError(error instanceof Error ? error.message : "Kunde inte ta bort gym.");
    } finally {
      setDeletingGymId(null);
    }
  }

  async function handleAddEquipment(gymId: string) {
    if (!userId) return;

    const draft = getDraftForGym(gymId);

    if (!draft.label.trim()) {
      setPageError("Ange ett namn på utrustningen.");
      return;
    }

    setSavingEquipmentGymId(gymId);
    setPageError(null);
    setSuccessMessage(null);

    try {
      const weights = isWeightBasedType(draft.equipmentType)
        ? sortUniqueWeights([
            ...draft.selectedWeights,
            ...parseManualWeightsInput(draft.manualWeightInput),
          ])
        : null;

      const res = await fetch("/api/gym-equipment", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId,
          gym_id: gymId,
          equipment_type: draft.equipmentType,
          label: draft.label.trim(),
          quantity: draft.quantity ? Number(draft.quantity) : null,
          notes: draft.notes.trim() || null,
          weights_kg: weights,
          band_level: draft.equipmentType === "bands" ? draft.bandLevel : null,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Kunde inte spara utrustning.");
      }

      resetDraftForGym(gymId);
      setSuccessMessage("Utrustning sparad.");
      await fetchGyms(userId);
      setEditingGymId(gymId);
    } catch (error) {
      console.error("Add equipment failed:", error);
      setPageError(
        error instanceof Error ? error.message : "Kunde inte spara utrustning."
      );
    } finally {
      setSavingEquipmentGymId(null);
    }
  }

  async function handleDeleteEquipment(equipmentId: string) {
    if (!userId) return;

    const confirmed = window.confirm("Vill du ta bort denna utrustning?");
    if (!confirmed) return;

    setDeletingEquipmentId(equipmentId);
    setPageError(null);
    setSuccessMessage(null);

    try {
      const res = await fetch(`/api/gym-equipment/${equipmentId}`, {
        method: "DELETE",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ userId }),
      });

      const data = await res.json();

      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Kunde inte ta bort utrustning.");
      }

      setSuccessMessage("Utrustning borttagen.");
      await fetchGyms(userId);
    } catch (error) {
      console.error("Delete equipment failed:", error);
      setPageError(
        error instanceof Error ? error.message : "Kunde inte ta bort utrustning."
      );
    } finally {
      setDeletingEquipmentId(null);
    }
  }

  if (!authChecked) {
    return (
      <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(99,102,241,0.16),_transparent_28%),linear-gradient(180deg,#f7f9fc_0%,#eef3f9_100%)] px-4 py-10 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <div className="rounded-[32px] border border-white/70 bg-white/85 p-8 shadow-[0_24px_80px_-48px_rgba(15,23,42,0.4)] backdrop-blur">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-indigo-700">
              Träningsapp
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900">
              Laddar gym...
            </h1>
            <p className="mt-3 text-base leading-7 text-slate-600">
              Kontrollerar inloggning och hämtar dina gym.
            </p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(99,102,241,0.16),_transparent_28%),linear-gradient(180deg,#f7f9fc_0%,#eef3f9_100%)] px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-6 flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-indigo-700">
              Träningsapp
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
              Hantera gym
            </h1>
            <p className="mt-3 max-w-3xl text-base leading-7 text-slate-600">
              Lägg till gym och ange vilken utrustning som finns i varje gym.
              Sparade gym används sedan för att anpassa AI-genererade pass efter
              tillgänglig utrustning.
            </p>
          </div>

          <Link
            href="/home"
            className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Tillbaka till hem
          </Link>
        </header>

        {pageError ? (
          <div className="mb-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {pageError}
          </div>
        ) : null}

        {successMessage ? (
          <div className="mb-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {successMessage}
          </div>
        ) : null}

        <section className="mb-6 rounded-[32px] border border-white/70 bg-white/90 p-6 shadow-[0_24px_80px_-48px_rgba(15,23,42,0.4)]">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-indigo-700">
            Lägg till gym
          </p>

          <form onSubmit={handleCreateGym} className="mt-5 space-y-4">
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-900">
                Namn
              </label>
              <input
                value={newGymName}
                onChange={(e) => setNewGymName(e.target.value)}
                placeholder="Till exempel Hemmagym"
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 outline-none transition focus:border-indigo-300 focus:ring-4 focus:ring-indigo-100"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-900">
                Beskrivning
              </label>
              <textarea
                value={newGymDescription}
                onChange={(e) => setNewGymDescription(e.target.value)}
                placeholder="Kort beskrivning av gymmet"
                rows={3}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 outline-none transition focus:border-indigo-300 focus:ring-4 focus:ring-indigo-100"
              />
            </div>

            <button
              type="submit"
              disabled={isSavingGym}
              className="rounded-2xl bg-indigo-600 px-5 py-3.5 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSavingGym ? "Sparar..." : "Spara gym"}
            </button>
          </form>
        </section>

        <section className="rounded-[32px] border border-white/70 bg-white/90 p-6 shadow-[0_24px_80px_-48px_rgba(15,23,42,0.4)]">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-indigo-700">
            Sparade gym
          </p>

          {isLoading ? (
            <div className="mt-5 rounded-[24px] border border-slate-200 bg-slate-50/80 p-5 text-sm text-slate-600">
              Hämtar gym...
            </div>
          ) : sortedGyms.length === 0 ? (
            <div className="mt-5 rounded-[24px] border border-dashed border-slate-300 bg-slate-50/80 p-6 text-sm text-slate-600">
              Inga gym sparade ännu.
            </div>
          ) : (
            <div className="mt-5 space-y-5">
              {sortedGyms.map((gym) => {
                const isEditing = editingGymId === gym.id;
                const draft = getDraftForGym(gym.id);
                const quickWeights = getQuickWeightsForType(draft.equipmentType);

                return (
                  <div
                    key={gym.id}
                    className="rounded-[28px] border border-slate-200 bg-slate-50/80 p-5"
                  >
                    {!isEditing ? (
                      <>
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <h2 className="text-xl font-semibold text-slate-900">
                              {gym.name}
                            </h2>

                            {gym.description?.trim() ? (
                              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                                {gym.description}
                              </p>
                            ) : (
                              <p className="mt-2 text-sm leading-6 text-slate-500">
                                Ingen beskrivning ännu.
                              </p>
                            )}

                            <p className="mt-3 text-sm font-medium text-slate-500">
                              {getGymDisplayCount(gym)} utrustningsposter
                            </p>
                          </div>

                          <div className="flex flex-wrap gap-3">
                            <button
                              type="button"
                              onClick={() => startEditGym(gym)}
                              className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 transition hover:bg-slate-50"
                            >
                              Redigera
                            </button>

                            <button
                              type="button"
                              onClick={() => void handleDeleteGym(gym.id)}
                              disabled={deletingGymId === gym.id}
                              className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {deletingGymId === gym.id ? "Tar bort..." : "Ta bort"}
                            </button>
                          </div>
                        </div>

                        {gym.equipment.length > 0 ? (
                          <div className="mt-5 space-y-3">
                            {gym.equipment.map((item) => (
                              <div
                                key={item.id}
                                className="rounded-2xl border border-slate-200 bg-white p-4"
                              >
                                <div className="flex items-start justify-between gap-4">
                                  <div>
                                    <p className="text-sm font-semibold text-slate-900">
                                      {item.label}
                                    </p>
                                    <p className="mt-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                                      {getEquipmentTypeLabel(item.equipment_type)}
                                    </p>
                                    <p className="mt-2 text-sm leading-6 text-slate-600">
                                      {formatEquipmentMeta(item)}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </>
                    ) : (
                      <>
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-indigo-700">
                              Redigerar gym
                            </p>
                            <h2 className="mt-2 text-xl font-semibold text-slate-900">
                              {gym.name}
                            </h2>
                          </div>

                          <div className="flex flex-wrap gap-3">
                            <button
                              type="button"
                              onClick={() => void handleSaveGym(gym.id)}
                              disabled={isUpdatingGym}
                              className="rounded-2xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {isUpdatingGym ? "Sparar..." : "Spara ändringar"}
                            </button>

                            <button
                              type="button"
                              onClick={cancelEditGym}
                              className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 transition hover:bg-slate-50"
                            >
                              Klar
                            </button>
                          </div>
                        </div>

                        <div className="mt-5 grid gap-4">
                          <div>
                            <label className="mb-2 block text-sm font-semibold text-slate-900">
                              Namn
                            </label>
                            <input
                              value={editingGymName}
                              onChange={(e) => setEditingGymName(e.target.value)}
                              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 outline-none transition focus:border-indigo-300 focus:ring-4 focus:ring-indigo-100"
                            />
                          </div>

                          <div>
                            <label className="mb-2 block text-sm font-semibold text-slate-900">
                              Beskrivning
                            </label>
                            <textarea
                              value={editingGymDescription}
                              onChange={(e) =>
                                setEditingGymDescription(e.target.value)
                              }
                              rows={3}
                              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 outline-none transition focus:border-indigo-300 focus:ring-4 focus:ring-indigo-100"
                            />
                          </div>
                        </div>

                        <div className="mt-6 rounded-[24px] border border-slate-200 bg-white p-4">
                          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">
                            Utrustning i gymmet
                          </p>

                          {gym.equipment.length === 0 ? (
                            <p className="mt-3 text-sm text-slate-500">
                              Ingen utrustning sparad ännu.
                            </p>
                          ) : (
                            <div className="mt-4 space-y-3">
                              {gym.equipment.map((item) => (
                                <div
                                  key={item.id}
                                  className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4"
                                >
                                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                    <div>
                                      <p className="text-sm font-semibold text-slate-900">
                                        {item.label}
                                      </p>
                                      <p className="mt-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                                        {getEquipmentTypeLabel(item.equipment_type)}
                                      </p>
                                      <p className="mt-2 text-sm leading-6 text-slate-600">
                                        {formatEquipmentMeta(item)}
                                      </p>
                                    </div>

                                    <button
                                      type="button"
                                      onClick={() =>
                                        void handleDeleteEquipment(item.id)
                                      }
                                      disabled={deletingEquipmentId === item.id}
                                      className="rounded-2xl border border-rose-200 bg-white px-4 py-3 text-sm font-semibold text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                      {deletingEquipmentId === item.id
                                        ? "Tar bort..."
                                        : "Ta bort"}
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="mt-6 rounded-[24px] border border-indigo-100 bg-indigo-50/60 p-4">
                          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-indigo-700">
                            Lägg till utrustning
                          </p>

                          <div className="mt-4 grid gap-4 md:grid-cols-2">
                            <div>
                              <label className="mb-2 block text-sm font-semibold text-slate-900">
                                Typ
                              </label>
                              <select
                                value={draft.equipmentType}
                                onChange={(e) => {
                                  const nextType = e.target.value as EquipmentType;

                                  updateDraftForGym(gym.id, {
                                    equipmentType: nextType,
                                    label: DEFAULT_LABELS[nextType],
                                    bandLevel:
                                      nextType === "bands" ? "medium" : draft.bandLevel,
                                    selectedWeights: [],
                                    manualWeightInput: "",
                                  });
                                }}
                                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 outline-none transition focus:border-indigo-300 focus:ring-4 focus:ring-indigo-100"
                              >
                                {EQUIPMENT_TYPE_OPTIONS.map((option) => (
                                  <option key={option.value} value={option.value}>
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div>
                              <label className="mb-2 block text-sm font-semibold text-slate-900">
                                Namn
                              </label>
                              <input
                                value={draft.label}
                                onChange={(e) =>
                                  updateDraftForGym(gym.id, {
                                    label: e.target.value,
                                  })
                                }
                                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 outline-none transition focus:border-indigo-300 focus:ring-4 focus:ring-indigo-100"
                              />
                            </div>

                            {isWeightBasedType(draft.equipmentType) ? (
                              <>
                                <div className="md:col-span-2">
                                  <label className="mb-2 block text-sm font-semibold text-slate-900">
                                    Snabbval av vikter
                                  </label>

                                  <div className="max-h-56 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-3">
                                    <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10">
                                      {quickWeights.map((weight) => {
                                        const isSelected = draft.selectedWeights.includes(
                                          weight
                                        );

                                        return (
                                          <button
                                            key={`${draft.equipmentType}-${weight}`}
                                            type="button"
                                            onClick={() => {
                                              if (isSelected) {
                                                removeWeightFromDraft(gym.id, weight);
                                              } else {
                                                addQuickWeightToDraft(gym.id, weight);
                                              }
                                            }}
                                            className={`rounded-xl border px-2 py-2 text-sm font-semibold transition ${
                                              isSelected
                                                ? "border-indigo-200 bg-indigo-50 text-indigo-700"
                                                : "border-slate-200 bg-white text-slate-900 hover:bg-slate-50"
                                            }`}
                                          >
                                            {formatWeightValue(weight)}
                                          </button>
                                        );
                                      })}
                                    </div>
                                  </div>

                                  <p className="mt-2 text-xs text-slate-500">
                                    {draft.equipmentType === "dumbbell"
                                      ? "Hantlar visas med 0,5 kg-steg upp till 20 kg."
                                      : "Skivstång och kettlebells visas med hela kilo upp till 20 kg."}
                                  </p>
                                </div>

                                <div className="md:col-span-2">
                                  <label className="mb-2 block text-sm font-semibold text-slate-900">
                                    Lägg till egna vikter
                                  </label>

                                  <div className="flex flex-col gap-3 sm:flex-row">
                                    <input
                                      value={draft.manualWeightInput}
                                      onChange={(e) =>
                                        updateDraftForGym(gym.id, {
                                          manualWeightInput: e.target.value,
                                        })
                                      }
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter") {
                                          e.preventDefault();
                                          applyManualWeightsToDraft(gym.id);
                                        }
                                      }}
                                      inputMode="decimal"
                                      placeholder="Till exempel 22 eller 22, 24, 26"
                                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 outline-none transition focus:border-indigo-300 focus:ring-4 focus:ring-indigo-100"
                                    />

                                    <button
                                      type="button"
                                      onClick={() => applyManualWeightsToDraft(gym.id)}
                                      className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-900 transition hover:bg-slate-50"
                                    >
                                      Lägg till
                                    </button>
                                  </div>

                                  <p className="mt-2 text-xs text-slate-500">
                                    Över 20 kg skriver du in manuellt. Du kan lägga till
                                    flera vikter samtidigt med komma eller mellanslag.
                                  </p>
                                </div>

                                <div className="md:col-span-2">
                                  <label className="mb-2 block text-sm font-semibold text-slate-900">
                                    Valda vikter
                                  </label>

                                  {draft.selectedWeights.length > 0 ? (
                                    <div className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-3">
                                      {draft.selectedWeights
                                        .slice()
                                        .sort((a, b) => a - b)
                                        .map((weight) => (
                                          <button
                                            key={`selected-${weight}`}
                                            type="button"
                                            onClick={() =>
                                              removeWeightFromDraft(gym.id, weight)
                                            }
                                            className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-100"
                                          >
                                            {formatWeightValue(weight)} kg ×
                                          </button>
                                        ))}
                                    </div>
                                  ) : (
                                    <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-3 text-sm text-slate-500">
                                      Inga vikter valda ännu.
                                    </div>
                                  )}
                                </div>
                              </>
                            ) : null}

                            {draft.equipmentType === "bands" ? (
                              <div>
                                <label className="mb-2 block text-sm font-semibold text-slate-900">
                                  Motstånd
                                </label>
                                <select
                                  value={draft.bandLevel}
                                  onChange={(e) =>
                                    updateDraftForGym(gym.id, {
                                      bandLevel: e.target.value as BandLevel,
                                    })
                                  }
                                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 outline-none transition focus:border-indigo-300 focus:ring-4 focus:ring-indigo-100"
                                >
                                  <option value="light">Lätt</option>
                                  <option value="medium">Medium</option>
                                  <option value="heavy">Tung</option>
                                </select>
                              </div>
                            ) : null}

                            <div>
                              <label className="mb-2 block text-sm font-semibold text-slate-900">
                                Antal
                              </label>
                              <input
                                value={draft.quantity}
                                onChange={(e) =>
                                  updateDraftForGym(gym.id, {
                                    quantity: e.target.value,
                                  })
                                }
                                inputMode="numeric"
                                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 outline-none transition focus:border-indigo-300 focus:ring-4 focus:ring-indigo-100"
                              />
                            </div>
                          </div>

                          <div className="mt-4">
                            <label className="mb-2 block text-sm font-semibold text-slate-900">
                              Anteckning
                            </label>
                            <textarea
                              value={draft.notes}
                              onChange={(e) =>
                                updateDraftForGym(gym.id, {
                                  notes: e.target.value,
                                })
                              }
                              rows={2}
                              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 outline-none transition focus:border-indigo-300 focus:ring-4 focus:ring-indigo-100"
                            />
                          </div>

                          <div className="mt-4 flex flex-wrap gap-3">
                            <button
                              type="button"
                              onClick={() => void handleAddEquipment(gym.id)}
                              disabled={savingEquipmentGymId === gym.id}
                              className="rounded-2xl bg-indigo-600 px-5 py-3.5 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {savingEquipmentGymId === gym.id
                                ? "Sparar..."
                                : "Lägg till utrustning"}
                            </button>

                            <button
                              type="button"
                              onClick={() => resetDraftForGym(gym.id)}
                              className="rounded-2xl border border-slate-200 bg-white px-5 py-3.5 text-sm font-semibold text-slate-900 transition hover:bg-slate-50"
                            >
                              Återställ
                            </button>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}