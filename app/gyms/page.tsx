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
  weightsInput: string;
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
    weightsInput: "",
    bandLevel: "medium",
  };
}

function isWeightBasedType(type: EquipmentType) {
  return type === "dumbbell" || type === "barbell" || type === "kettlebell";
}

function formatWeights(weights?: number[] | null) {
  if (!weights || weights.length === 0) return "Alla vikter / ej specificerat";
  return `${weights.join(", ")} kg`;
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

function getEquipmentTypeLabel(type: EquipmentType) {
  return (
    EQUIPMENT_TYPE_OPTIONS.find((option) => option.value === type)?.label ?? type
  );
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

  const [expandedGymId, setExpandedGymId] = useState<string | null>(null);

  // State för redigering av gymnamn/beskrivning.
  const [editingGymId, setEditingGymId] = useState<string | null>(null);
  const [editingGymName, setEditingGymName] = useState("");
  const [editingGymDescription, setEditingGymDescription] = useState("");
  const [isUpdatingGym, setIsUpdatingGym] = useState(false);

  // State för utrustningsformulär per gym.
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
    // Sortera alfabetiskt för lite lugnare UI.
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

  const fetchGyms = useCallback(async (currentUserId: string) => {
    setIsLoading(true);
    setPageError(null);

    try {
      // Viktigt: skicka med credentials så session-cookie följer med.
      const res = await fetch(`/api/gyms?userId=${encodeURIComponent(currentUserId)}`, {
        cache: "no-store",
        credentials: "include",
      });

      const data = await res.json();

      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Kunde inte hämta gym.");
      }

      const nextGyms = Array.isArray(data.gyms) ? (data.gyms as Gym[]) : [];
      setGyms(nextGyms);

      // Öppna första gymmet automatiskt om inget redan är valt.
      setExpandedGymId((prev) => {
        if (prev && nextGyms.some((gym) => gym.id === prev)) return prev;
        return nextGyms[0]?.id ?? null;
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

        // Samma auth-mönster som på /home.
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
        setExpandedGymId(String(data.gym.id));
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
      cancelEditGym();
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
        ? draft.weightsInput
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean)
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
      setSuccessMessage("Utrustning tillagd.");
      await fetchGyms(userId);
      setExpandedGymId(gymId);
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
      <main className="min-h-screen bg-[var(--app-page-bg)] px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl rounded-[32px] border border-[var(--app-border)] bg-[var(--app-surface)] p-8 shadow-[0_30px_90px_rgba(15,23,42,0.08)]">
          <p className="text-sm font-medium text-[var(--app-text-muted)]">
            Kontrollerar inloggning...
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[var(--app-page-bg)] px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="overflow-hidden rounded-[32px] border border-[var(--app-border)] bg-[var(--app-surface)] shadow-[0_30px_90px_rgba(15,23,42,0.08)]">
          <div className="grid lg:grid-cols-[1.2fr_0.8fr]">
            <section className="border-b border-[var(--app-border)] bg-[linear-gradient(180deg,#f8fbff_0%,#f4f7fb_100%)] p-6 sm:p-8 lg:border-b-0 lg:border-r lg:p-10">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--app-accent-strong)]">
                    Träningsapp
                  </p>
                  <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--app-text-strong)] sm:text-4xl">
                    Hantera gym
                  </h1>
<p className="mt-3 max-w-2xl text-base leading-7 text-[var(--app-text)]">
  Lägg till gym och ange vilken utrustning som finns i varje gym.
  Dina sparade gym används sedan för att anpassa AI-genererade pass
  efter tillgänglig utrustning.
</p>
                </div>

                <Link
                  href="/home"
                  className="inline-flex items-center justify-center rounded-2xl border border-[var(--app-border-strong)] bg-[var(--app-surface)] px-4 py-3 text-sm font-semibold text-[var(--app-text-strong)] transition hover:border-[var(--app-accent)] hover:bg-[var(--app-accent-soft)]"
                >
                  ← Tillbaka till hem
                </Link>
              </div>

              {pageError ? (
                <div className="mt-6 rounded-2xl border border-[var(--app-danger-border)] bg-[var(--app-danger-bg)] px-4 py-3 text-sm text-[var(--app-danger-text)]">
                  {pageError}
                </div>
              ) : null}

              {successMessage ? (
                <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                  {successMessage}
                </div>
              ) : null}

              <div className="mt-8 grid gap-4 sm:grid-cols-3">
                <div className="rounded-[24px] border border-[var(--app-border)] bg-[var(--app-surface)] px-5 py-5 shadow-sm">
                  <p className="text-sm text-[var(--app-text-muted)]">Sparade gym</p>
                  <p className="mt-2 text-2xl font-semibold text-[var(--app-text-strong)]">
                    {gyms.length}
                  </p>
                </div>

                <div className="rounded-[24px] border border-[var(--app-border)] bg-[var(--app-surface)] px-5 py-5 shadow-sm">
                  <p className="text-sm text-[var(--app-text-muted)]">Total utrustning</p>
                  <p className="mt-2 text-2xl font-semibold text-[var(--app-text-strong)]">
                    {gyms.reduce((sum, gym) => sum + gym.equipment.length, 0)}
                  </p>
                </div>

                <div className="rounded-[24px] border border-[var(--app-border)] bg-[var(--app-surface)] px-5 py-5 shadow-sm">
                  <p className="text-sm text-[var(--app-text-muted)]">Inloggad användare</p>
                  <p className="mt-2 text-lg font-semibold text-[var(--app-text-strong)]">
                    {authUser?.username || authUser?.email || "Användare"}
                  </p>
                </div>
              </div>

              <div className="mt-8 rounded-[28px] border border-[var(--app-border)] bg-[var(--app-surface)] p-6 shadow-sm sm:p-7">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--app-accent-strong)]">
                      Sparade gym
                    </p>
                    <h2 className="mt-2 text-2xl font-semibold tracking-tight text-[var(--app-text-strong)]">
                      Dina träningsmiljöer
                    </h2>
                  </div>
                </div>

                <div className="mt-6">
                  {isLoading ? (
                    <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface-muted)] px-4 py-4 text-sm text-[var(--app-text-muted)]">
                      Hämtar gym...
                    </div>
                  ) : sortedGyms.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-[var(--app-border-strong)] bg-[var(--app-surface-muted)] px-4 py-6 text-sm text-[var(--app-text-muted)]">
                      Inga gym sparade ännu.
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {sortedGyms.map((gym) => {
                        const isExpanded = expandedGymId === gym.id;
                        const isEditing = editingGymId === gym.id;
                        const draft = getDraftForGym(gym.id);

                        return (
                          <div
                            key={gym.id}
                            className="overflow-hidden rounded-[24px] border border-[var(--app-border)] bg-[var(--app-surface)]"
                          >
                            <div className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-start sm:justify-between">
                              <div className="min-w-0">
                                {isEditing ? (
                                  <div className="space-y-3">
                                    <input
                                      value={editingGymName}
                                      onChange={(e) => setEditingGymName(e.target.value)}
                                      className="w-full rounded-2xl border border-[var(--app-border-strong)] bg-[var(--app-input-bg)] px-4 py-3 text-base text-[var(--app-text-strong)] outline-none focus:border-[var(--app-accent)] focus:ring-4 focus:ring-[var(--app-accent-ring)]"
                                      placeholder="Namn på gym"
                                    />

                                    <textarea
                                      value={editingGymDescription}
                                      onChange={(e) =>
                                        setEditingGymDescription(e.target.value)
                                      }
                                      className="min-h-[90px] w-full rounded-2xl border border-[var(--app-border-strong)] bg-[var(--app-input-bg)] px-4 py-3 text-sm text-[var(--app-text-strong)] outline-none focus:border-[var(--app-accent)] focus:ring-4 focus:ring-[var(--app-accent-ring)]"
                                      placeholder="Kort beskrivning av gymmet"
                                    />

                                    <div className="flex flex-wrap gap-3">
                                      <button
                                        type="button"
                                        onClick={() => handleSaveGym(gym.id)}
                                        disabled={isUpdatingGym}
                                        className="rounded-2xl bg-[var(--app-accent)] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[var(--app-accent-strong)] disabled:cursor-not-allowed disabled:opacity-60"
                                      >
                                        {isUpdatingGym ? "Sparar..." : "Spara ändringar"}
                                      </button>

                                      <button
                                        type="button"
                                        onClick={cancelEditGym}
                                        className="rounded-2xl border border-[var(--app-border-strong)] bg-[var(--app-surface)] px-4 py-3 text-sm font-semibold text-[var(--app-text-strong)] transition hover:border-[var(--app-accent)] hover:bg-[var(--app-accent-soft)]"
                                      >
                                        Avbryt
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <>
                                    <h3 className="text-xl font-semibold text-[var(--app-text-strong)]">
                                      {gym.name}
                                    </h3>

                                    {gym.description?.trim() ? (
                                      <p className="mt-2 text-sm leading-6 text-[var(--app-text)]">
                                        {gym.description}
                                      </p>
                                    ) : (
                                      <p className="mt-2 text-sm text-[var(--app-text-muted)]">
                                        Ingen beskrivning sparad.
                                      </p>
                                    )}

                                    <div className="mt-3 flex flex-wrap gap-2">
                                      <span className="rounded-full bg-[var(--app-accent-soft)] px-3 py-1 text-xs font-semibold text-[var(--app-accent-strong)]">
                                        {gym.equipment.length} utrustningsposter
                                      </span>
                                    </div>
                                  </>
                                )}
                              </div>

                              <div className="flex flex-wrap gap-3">
                                {!isEditing ? (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setExpandedGymId((prev) =>
                                          prev === gym.id ? null : gym.id
                                        )
                                      }
                                      className="rounded-2xl border border-[var(--app-border-strong)] bg-[var(--app-surface)] px-4 py-3 text-sm font-semibold text-[var(--app-text-strong)] transition hover:border-[var(--app-accent)] hover:bg-[var(--app-accent-soft)]"
                                    >
                                      {isExpanded ? "Dölj" : "Visa"}
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() => startEditGym(gym)}
                                      className="rounded-2xl border border-[var(--app-border-strong)] bg-[var(--app-surface)] px-4 py-3 text-sm font-semibold text-[var(--app-text-strong)] transition hover:border-[var(--app-accent)] hover:bg-[var(--app-accent-soft)]"
                                    >
                                      Redigera gym
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() => handleDeleteGym(gym.id)}
                                      disabled={deletingGymId === gym.id}
                                      className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                      {deletingGymId === gym.id
                                        ? "Tar bort..."
                                        : "Ta bort"}
                                    </button>
                                  </>
                                ) : null}
                              </div>
                            </div>

                            {isExpanded ? (
                              <div className="border-t border-[var(--app-border)] bg-[var(--app-surface-muted)] px-5 py-5">
                                <div className="grid gap-6 xl:grid-cols-[1fr_0.95fr]">
                                  <div>
                                    <div className="flex items-center justify-between gap-3">
                                      <h4 className="text-lg font-semibold text-[var(--app-text-strong)]">
                                        Utrustning
                                      </h4>
                                    </div>

                                    <div className="mt-4">
                                      {gym.equipment.length === 0 ? (
                                        <div className="rounded-2xl border border-dashed border-[var(--app-border-strong)] bg-[var(--app-surface)] px-4 py-5 text-sm text-[var(--app-text-muted)]">
                                          Ingen utrustning sparad ännu.
                                        </div>
                                      ) : (
                                        <div className="space-y-3">
                                          {gym.equipment.map((item) => (
                                            <div
                                              key={item.id}
                                              className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface)] px-4 py-4"
                                            >
                                              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                                <div className="min-w-0">
                                                  <p className="text-sm font-semibold text-[var(--app-text-strong)]">
                                                    {item.label}
                                                  </p>
                                                  <p className="mt-1 text-xs uppercase tracking-[0.14em] text-[var(--app-text-muted)]">
                                                    {getEquipmentTypeLabel(
                                                      item.equipment_type
                                                    )}
                                                  </p>

                                                  {formatEquipmentMeta(item) ? (
                                                    <p className="mt-2 text-sm text-[var(--app-text)]">
                                                      {formatEquipmentMeta(item)}
                                                    </p>
                                                  ) : null}
                                                </div>

                                                <button
                                                  type="button"
                                                  onClick={() =>
                                                    handleDeleteEquipment(item.id)
                                                  }
                                                  disabled={deletingEquipmentId === item.id}
                                                  className="rounded-2xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
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
                                  </div>

                                  <div className="rounded-[24px] border border-[var(--app-border)] bg-[var(--app-surface)] p-5">
                                    <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--app-accent-strong)]">
                                      Lägg till utrustning
                                    </p>
                                    <h4 className="mt-2 text-lg font-semibold text-[var(--app-text-strong)]">
                                      Ny utrustning i {gym.name}
                                    </h4>

                                    <div className="mt-5 space-y-4">
                                      <div>
                                        <label className="text-sm font-semibold text-[var(--app-text-strong)]">
                                          Typ
                                        </label>
                                        <select
                                          value={draft.equipmentType}
                                          onChange={(e) => {
                                            const nextType = e.target
                                              .value as EquipmentType;
                                            updateDraftForGym(gym.id, {
                                              equipmentType: nextType,
                                              label:
                                                draft.label ===
                                                DEFAULT_LABELS[draft.equipmentType]
                                                  ? DEFAULT_LABELS[nextType]
                                                  : draft.label,
                                            });
                                          }}
                                          className="mt-2 w-full rounded-2xl border border-[var(--app-border-strong)] bg-[var(--app-input-bg)] px-4 py-3 text-base text-[var(--app-text-strong)] outline-none focus:border-[var(--app-accent)] focus:ring-4 focus:ring-[var(--app-accent-ring)]"
                                        >
                                          {EQUIPMENT_TYPE_OPTIONS.map((option) => (
                                            <option
                                              key={option.value}
                                              value={option.value}
                                            >
                                              {option.label}
                                            </option>
                                          ))}
                                        </select>
                                      </div>

                                      <div>
                                        <label className="text-sm font-semibold text-[var(--app-text-strong)]">
                                          Namn
                                        </label>
                                        <input
                                          value={draft.label}
                                          onChange={(e) =>
                                            updateDraftForGym(gym.id, {
                                              label: e.target.value,
                                            })
                                          }
                                          placeholder={DEFAULT_LABELS[draft.equipmentType]}
                                          className="mt-2 w-full rounded-2xl border border-[var(--app-border-strong)] bg-[var(--app-input-bg)] px-4 py-3 text-base text-[var(--app-text-strong)] outline-none focus:border-[var(--app-accent)] focus:ring-4 focus:ring-[var(--app-accent-ring)]"
                                        />
                                      </div>

                                      {isWeightBasedType(draft.equipmentType) ? (
                                        <div>
                                          <label className="text-sm font-semibold text-[var(--app-text-strong)]">
                                            Specifika vikter
                                          </label>
                                          <input
                                            value={draft.weightsInput}
                                            onChange={(e) =>
                                              updateDraftForGym(gym.id, {
                                                weightsInput: e.target.value,
                                              })
                                            }
                                            placeholder="t.ex. 5, 7.5, 10, 12.5, 15"
                                            className="mt-2 w-full rounded-2xl border border-[var(--app-border-strong)] bg-[var(--app-input-bg)] px-4 py-3 text-base text-[var(--app-text-strong)] outline-none focus:border-[var(--app-accent)] focus:ring-4 focus:ring-[var(--app-accent-ring)]"
                                          />
                                          <p className="mt-2 text-xs text-[var(--app-text-muted)]">
                                            Lämna tomt om alla vikter ska antas finnas.
                                          </p>
                                        </div>
                                      ) : null}

                                      {draft.equipmentType === "bands" ? (
                                        <div>
                                          <label className="text-sm font-semibold text-[var(--app-text-strong)]">
                                            Motstånd
                                          </label>
                                          <select
                                            value={draft.bandLevel}
                                            onChange={(e) =>
                                              updateDraftForGym(gym.id, {
                                                bandLevel: e.target
                                                  .value as BandLevel,
                                              })
                                            }
                                            className="mt-2 w-full rounded-2xl border border-[var(--app-border-strong)] bg-[var(--app-input-bg)] px-4 py-3 text-base text-[var(--app-text-strong)] outline-none focus:border-[var(--app-accent)] focus:ring-4 focus:ring-[var(--app-accent-ring)]"
                                          >
                                            <option value="light">Lätt</option>
                                            <option value="medium">Medium</option>
                                            <option value="heavy">Tung</option>
                                          </select>
                                        </div>
                                      ) : null}

                                      <div>
                                        <label className="text-sm font-semibold text-[var(--app-text-strong)]">
                                          Antal
                                        </label>
                                        <input
                                          inputMode="numeric"
                                          value={draft.quantity}
                                          onChange={(e) =>
                                            updateDraftForGym(gym.id, {
                                              quantity: e.target.value.replace(
                                                /[^\d]/g,
                                                ""
                                              ),
                                            })
                                          }
                                          placeholder="t.ex. 2"
                                          className="mt-2 w-full rounded-2xl border border-[var(--app-border-strong)] bg-[var(--app-input-bg)] px-4 py-3 text-base text-[var(--app-text-strong)] outline-none focus:border-[var(--app-accent)] focus:ring-4 focus:ring-[var(--app-accent-ring)]"
                                        />
                                      </div>

                                      <div>
                                        <label className="text-sm font-semibold text-[var(--app-text-strong)]">
                                          Notering
                                        </label>
                                        <textarea
                                          value={draft.notes}
                                          onChange={(e) =>
                                            updateDraftForGym(gym.id, {
                                              notes: e.target.value,
                                            })
                                          }
                                          placeholder="Valfritt"
                                          className="mt-2 min-h-[90px] w-full rounded-2xl border border-[var(--app-border-strong)] bg-[var(--app-input-bg)] px-4 py-3 text-sm text-[var(--app-text-strong)] outline-none focus:border-[var(--app-accent)] focus:ring-4 focus:ring-[var(--app-accent-ring)]"
                                        />
                                      </div>

                                      <div className="flex flex-wrap gap-3">
                                        <button
                                          type="button"
                                          onClick={() => handleAddEquipment(gym.id)}
                                          disabled={savingEquipmentGymId === gym.id}
                                          className="rounded-2xl bg-[var(--app-accent)] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[var(--app-accent-strong)] disabled:cursor-not-allowed disabled:opacity-60"
                                        >
                                          {savingEquipmentGymId === gym.id
                                            ? "Sparar..."
                                            : "Lägg till utrustning"}
                                        </button>

                                        <button
                                          type="button"
                                          onClick={() => resetDraftForGym(gym.id)}
                                          className="rounded-2xl border border-[var(--app-border-strong)] bg-[var(--app-surface)] px-4 py-3 text-sm font-semibold text-[var(--app-text-strong)] transition hover:border-[var(--app-accent)] hover:bg-[var(--app-accent-soft)]"
                                        >
                                          Rensa
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-8 rounded-[28px] border border-[var(--app-border)] bg-[var(--app-surface)] p-6 shadow-sm sm:p-7">
                <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--app-accent-strong)]">
                  Skapa nytt gym
                </p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight text-[var(--app-text-strong)]">
                  Lägg till ny träningsmiljö
                </h2>

                <form onSubmit={handleCreateGym} className="mt-6 grid gap-4">
                  <div>
                    <label
                      htmlFor="new-gym-name"
                      className="text-sm font-semibold text-[var(--app-text-strong)]"
                    >
                      Namn på gym
                    </label>
                    <input
                      id="new-gym-name"
                      value={newGymName}
                      onChange={(e) => setNewGymName(e.target.value)}
                      placeholder="t.ex. Hemmagym, Friskis, Jobbgym"
                      className="mt-2 w-full rounded-2xl border border-[var(--app-border-strong)] bg-[var(--app-input-bg)] px-4 py-3 text-base text-[var(--app-text-strong)] outline-none focus:border-[var(--app-accent)] focus:ring-4 focus:ring-[var(--app-accent-ring)]"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="new-gym-description"
                      className="text-sm font-semibold text-[var(--app-text-strong)]"
                    >
                      Beskrivning
                    </label>
                    <textarea
                      id="new-gym-description"
                      value={newGymDescription}
                      onChange={(e) => setNewGymDescription(e.target.value)}
                      placeholder="Valfritt, t.ex. litet hemmagym i garaget"
                      className="mt-2 min-h-[100px] w-full rounded-2xl border border-[var(--app-border-strong)] bg-[var(--app-input-bg)] px-4 py-3 text-sm text-[var(--app-text-strong)] outline-none focus:border-[var(--app-accent)] focus:ring-4 focus:ring-[var(--app-accent-ring)]"
                    />
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <button
                      type="submit"
                      disabled={isSavingGym}
                      className="rounded-2xl bg-[var(--app-accent)] px-5 py-3.5 text-sm font-semibold text-white transition hover:bg-[var(--app-accent-strong)] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isSavingGym ? "Sparar..." : "Skapa gym"}
                    </button>
                  </div>
                </form>
              </div>
            </section>

            <aside className="bg-[var(--app-surface)] p-6 sm:p-8 lg:p-10">
              <div className="space-y-6">
                <div className="rounded-[28px] border border-[var(--app-border)] bg-[var(--app-surface-muted)] p-6">
                  <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--app-accent-strong)]">
                    Översikt
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-tight text-[var(--app-text-strong)]">
                    Gym & utrustning
                  </h2>
                  <p className="mt-3 text-sm leading-6 text-[var(--app-text)]">
                    Här bygger du upp dina träningsmiljöer så att kommande pass blir
                    bättre anpassade efter vad du faktiskt har tillgång till.
                  </p>
                </div>

                <div className="rounded-[28px] border border-[var(--app-border)] bg-[var(--app-surface)] p-6 shadow-sm">
                  <h3 className="text-lg font-semibold text-[var(--app-text-strong)]">
                    Snabbnavigering
                  </h3>

                  <div className="mt-5 grid gap-3">
                    <Link
                      href="/home"
                      className="rounded-2xl border border-[var(--app-border-strong)] px-4 py-3 text-sm font-medium text-[var(--app-text-strong)] transition hover:border-[var(--app-accent)] hover:bg-[var(--app-accent-soft)]"
                    >
                      Till hem
                    </Link>

                    <Link
                      href="/history"
                      className="rounded-2xl border border-[var(--app-border-strong)] px-4 py-3 text-sm font-medium text-[var(--app-text-strong)] transition hover:border-[var(--app-accent)] hover:bg-[var(--app-accent-soft)]"
                    >
                      Träningshistorik
                    </Link>

                    <Link
                      href="/settings"
                      className="rounded-2xl border border-[var(--app-border-strong)] px-4 py-3 text-sm font-medium text-[var(--app-text-strong)] transition hover:border-[var(--app-accent)] hover:bg-[var(--app-accent-soft)]"
                    >
                      Inställningar
                    </Link>
                  </div>
                </div>

                <div className="rounded-[28px] border border-[var(--app-border)] bg-[linear-gradient(180deg,#ecfdf5_0%,#f8fafc_100%)] p-6">
                  <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--app-accent-strong)]">
                    Tips
                  </p>
                  <h3 className="mt-2 text-lg font-semibold text-[var(--app-text-strong)]">
                    Bra upplägg
                  </h3>
                  <p className="mt-3 text-sm leading-6 text-[var(--app-text)]">
                    Skapa gärna separata gym för till exempel hemmagym, kommersiellt
                    gym och kroppsvikt. Då blir AI-pass lättare att anpassa efter rätt
                    miljö.
                  </p>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </div>
    </main>
  );
}