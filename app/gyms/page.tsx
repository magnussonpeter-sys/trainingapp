"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
};

type GymEquipment = {
  id: string;
  type: EquipmentType;
  name: string;
  notes?: string;
  weightsKg?: number[];
  bandLevel?: BandLevel;
  quantity?: number;
};

type Gym = {
  id: string;
  name: string;
  equipment: GymEquipment[];
};

type ApiGymEquipment = {
  id: string | number;
  gym_id: string | number;
  equipment_type: EquipmentType;
  label: string;
  notes?: string | null;
  weights_kg?: number[] | null;
  band_level?: BandLevel | null;
  quantity?: number | null;
};

type ApiGym = {
  id: string | number;
  name: string;
  equipment?: ApiGymEquipment[] | null;
};

const EQUIPMENT_TYPE_OPTIONS: { value: EquipmentType; label: string }[] = [
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
  { value: "other", label: "Annat" },
];

const BAND_LEVEL_OPTIONS: { value: BandLevel; label: string }[] = [
  { value: "light", label: "Lätt" },
  { value: "medium", label: "Medium" },
  { value: "heavy", label: "Tung" },
];

function getEquipmentTypeLabel(type: EquipmentType) {
  return (
    EQUIPMENT_TYPE_OPTIONS.find((option) => option.value === type)?.label ?? type
  );
}

function getBandLevelLabel(level?: BandLevel) {
  return (
    BAND_LEVEL_OPTIONS.find((option) => option.value === level)?.label ?? ""
  );
}

function formatEquipmentType(type: EquipmentType) {
  return getEquipmentTypeLabel(type);
}

function formatWeights(weights?: number[]) {
  if (!weights || weights.length === 0) return "";
  return weights.map((weight) => Number(weight).toString()).join(", ") + " kg";
}

function getWeightStep(type: EquipmentType) {
  switch (type) {
    case "dumbbell":
      return 0.5;
    case "kettlebell":
    case "barbell":
      return 1;
    default:
      return 0.5;
  }
}

function isWeightBasedType(type: EquipmentType) {
  return type === "dumbbell" || type === "kettlebell" || type === "barbell";
}

function defaultNameForType(type: EquipmentType) {
  return getEquipmentTypeLabel(type);
}

function normalizeWeight(value: number, step: number) {
  const decimals = step === 0.5 ? 1 : 0;
  return Number(value.toFixed(decimals));
}

function mapApiEquipment(item: ApiGymEquipment): GymEquipment {
  return {
    id: String(item.id),
    type: item.equipment_type,
    name: item.label,
    notes: item.notes ?? undefined,
    weightsKg: item.weights_kg ?? undefined,
    bandLevel: item.band_level ?? undefined,
    quantity: item.quantity ?? undefined,
  };
}

function mapApiGym(item: ApiGym): Gym {
  return {
    id: String(item.id),
    name: item.name,
    equipment: Array.isArray(item.equipment)
      ? item.equipment.map(mapApiEquipment)
      : [],
  };
}

export default function GymsPage() {
  const router = useRouter();

  const [authChecked, setAuthChecked] = useState(false);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);

  const [gyms, setGyms] = useState<Gym[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [pageError, setPageError] = useState("");

  const [newGymName, setNewGymName] = useState("");
  const [isSavingGym, setIsSavingGym] = useState(false);

  const [expandedGymId, setExpandedGymId] = useState<string | null>(null);

  const [editingGymId, setEditingGymId] = useState<string | null>(null);
  const [editingGymName, setEditingGymName] = useState("");
  const [isSavingGymName, setIsSavingGymName] = useState(false);
  const editingGymInputRef = useRef<HTMLInputElement | null>(null);

  const [equipmentTypeByGym, setEquipmentTypeByGym] = useState<
    Record<string, EquipmentType>
  >({});
  const [equipmentNameByGym, setEquipmentNameByGym] = useState<
    Record<string, string>
  >({});
  const [equipmentNotesByGym, setEquipmentNotesByGym] = useState<
    Record<string, string>
  >({});
  const [equipmentWeightsByGym, setEquipmentWeightsByGym] = useState<
    Record<string, number[]>
  >({});
  const [equipmentWeightInputByGym, setEquipmentWeightInputByGym] = useState<
    Record<string, string>
  >({});
  const [equipmentBandLevelByGym, setEquipmentBandLevelByGym] = useState<
    Record<string, BandLevel | "">
  >({});
  const [isSavingEquipmentByGym, setIsSavingEquipmentByGym] = useState<
    Record<string, boolean>
  >({});
  const [isDeletingEquipmentId, setIsDeletingEquipmentId] = useState<
    string | null
  >(null);
  const [isDeletingGymId, setIsDeletingGymId] = useState<string | null>(null);

  useEffect(() => {
    async function checkAuth() {
      try {
        const res = await fetch("/api/auth/me", { cache: "no-store" });
        const data = await res.json();

        if (!res.ok || !data?.ok || !data.user) {
          router.replace("/");
          return;
        }

        setAuthUser(data.user);
        setAuthChecked(true);
      } catch {
        router.replace("/");
      }
    }

    void checkAuth();
  }, [router]);

  useEffect(() => {
    if (!editingGymId) return;
    editingGymInputRef.current?.focus();
    editingGymInputRef.current?.select();
  }, [editingGymId]);

  const fetchGyms = useCallback(async () => {
    if (!authUser) return;

    setIsLoading(true);
    setPageError("");

    const userId = String(authUser.id);

    try {
      const res = await fetch(`/api/gyms?userId=${encodeURIComponent(userId)}`, {
        cache: "no-store",
      });

      const data = await res.json();

      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Kunde inte hämta gym");
      }

      const nextGyms = Array.isArray(data.gyms)
        ? (data.gyms as ApiGym[]).map(mapApiGym)
        : [];

      setGyms(nextGyms);
    } catch (error) {
      setPageError(
        error instanceof Error ? error.message : "Kunde inte hämta gym"
      );
      setGyms([]);
    } finally {
      setIsLoading(false);
    }
  }, [authUser]);

  useEffect(() => {
    if (!authChecked || !authUser) return;
    void fetchGyms();
  }, [authChecked, authUser, fetchGyms]);

  const addGym = async () => {
    if (!authUser) return;

    const trimmedName = newGymName.trim();
    if (!trimmedName || isSavingGym) return;

    setIsSavingGym(true);
    setPageError("");

    const userId = String(authUser.id);

    try {
      const res = await fetch("/api/gyms", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId,
          name: trimmedName,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Kunde inte skapa gym");
      }

      setNewGymName("");
      await fetchGyms();
    } catch (error) {
      setPageError(
        error instanceof Error ? error.message : "Kunde inte skapa gym"
      );
    } finally {
      setIsSavingGym(false);
    }
  };

  const removeGym = async (gymId: string) => {
    if (!authUser || isDeletingGymId) return;

    setIsDeletingGymId(gymId);
    setPageError("");

    const userId = String(authUser.id);

    try {
      const res = await fetch(`/api/gyms/${encodeURIComponent(gymId)}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ userId }),
      });

      const data = await res.json();

      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Kunde inte ta bort gym");
      }

      setGyms((prev) => prev.filter((gym) => gym.id !== gymId));

      if (expandedGymId === gymId) setExpandedGymId(null);
      if (editingGymId === gymId) {
        setEditingGymId(null);
        setEditingGymName("");
      }
    } catch (error) {
      setPageError(
        error instanceof Error ? error.message : "Kunde inte ta bort gym"
      );
    } finally {
      setIsDeletingGymId(null);
    }
  };

  const startEditGym = (gym: Gym) => {
    setEditingGymId(gym.id);
    setEditingGymName(gym.name);
  };

  const saveGymName = async (gymId: string) => {
    if (!authUser) return;

    const trimmedName = editingGymName.trim();
    if (!trimmedName || isSavingGymName) return;

    setIsSavingGymName(true);
    setPageError("");

    const userId = String(authUser.id);

    try {
      const res = await fetch(`/api/gyms/${encodeURIComponent(gymId)}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId,
          name: trimmedName,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Kunde inte uppdatera gymnamn");
      }

      setGyms((prev) =>
        prev.map((gym) =>
          gym.id === gymId ? { ...gym, name: trimmedName } : gym
        )
      );

      setEditingGymId(null);
      setEditingGymName("");
    } catch (error) {
      setPageError(
        error instanceof Error ? error.message : "Kunde inte uppdatera gymnamn"
      );
    } finally {
      setIsSavingGymName(false);
    }
  };

  const cancelEditGym = () => {
    setEditingGymId(null);
    setEditingGymName("");
  };

  const handleGymNameBlur = async (gymId: string) => {
    if (isSavingGymName) return;

    const trimmedName = editingGymName.trim();
    if (!trimmedName) {
      cancelEditGym();
      return;
    }

    await saveGymName(gymId);
  };

  const handleEquipmentTypeChange = (gymId: string, nextType: EquipmentType) => {
    const nextDefaultName = defaultNameForType(nextType);

    setEquipmentTypeByGym((prev) => ({
      ...prev,
      [gymId]: nextType,
    }));

    setEquipmentNameByGym((prev) => {
      const currentName = prev[gymId] ?? "";
      const previousType = equipmentTypeByGym[gymId] ?? "other";
      const previousDefaultName = defaultNameForType(previousType);

      if (!currentName || currentName === previousDefaultName) {
        return {
          ...prev,
          [gymId]: nextDefaultName,
        };
      }

      return prev;
    });

    if (!isWeightBasedType(nextType)) {
      setEquipmentWeightsByGym((prev) => ({
        ...prev,
        [gymId]: [],
      }));
      setEquipmentWeightInputByGym((prev) => ({
        ...prev,
        [gymId]: "",
      }));
    }

    if (nextType !== "bands") {
      setEquipmentBandLevelByGym((prev) => ({
        ...prev,
        [gymId]: "",
      }));
    }
  };

  const addWeightToEquipment = (gymId: string) => {
    const type = equipmentTypeByGym[gymId] ?? "other";
    if (!isWeightBasedType(type)) return;

    const rawValue = (equipmentWeightInputByGym[gymId] ?? "").trim();
    if (!rawValue) return;

    const parsedValue = Number(rawValue.replace(",", "."));
    if (!Number.isFinite(parsedValue) || parsedValue <= 0) return;

    const step = getWeightStep(type);
    const normalized = normalizeWeight(parsedValue, step);

    setEquipmentWeightsByGym((prev) => {
      const current = prev[gymId] ?? [];
      const next = [...new Set([...current, normalized])].sort((a, b) => a - b);

      return {
        ...prev,
        [gymId]: next,
      };
    });

    setEquipmentWeightInputByGym((prev) => ({
      ...prev,
      [gymId]: "",
    }));
  };

  const removeWeightFromEquipment = (gymId: string, weightToRemove: number) => {
    setEquipmentWeightsByGym((prev) => ({
      ...prev,
      [gymId]: (prev[gymId] ?? []).filter((weight) => weight !== weightToRemove),
    }));
  };

  const addEquipment = async (gymId: string) => {
    if (!authUser) return;

    const type = equipmentTypeByGym[gymId] ?? "other";
    const rawName = (equipmentNameByGym[gymId] ?? "").trim();
    const name = rawName || (type !== "other" ? defaultNameForType(type) : "");
    const notes = (equipmentNotesByGym[gymId] ?? "").trim();
    const weightsKg = isWeightBasedType(type)
      ? (equipmentWeightsByGym[gymId] ?? [])
      : [];
    const bandLevel = equipmentBandLevelByGym[gymId] ?? "";

    if (!name) return;
    if (type === "bands" && !bandLevel) return;
    if (isSavingEquipmentByGym[gymId]) return;

    setIsSavingEquipmentByGym((prev) => ({
      ...prev,
      [gymId]: true,
    }));
    setPageError("");

    const userId = String(authUser.id);

    try {
      const res = await fetch("/api/gym-equipment", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId,
          gym_id: gymId,
          equipment_type: type,
          label: name,
          weights_kg: isWeightBasedType(type)
            ? weightsKg.length > 0
              ? weightsKg
              : null
            : null,
          band_level: type === "bands" ? bandLevel : null,
          quantity: null,
          notes: notes || null,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Kunde inte lägga till utrustning");
      }

      const createdItem = mapApiEquipment(data.equipment as ApiGymEquipment);

      setGyms((prev) =>
        prev.map((gym) =>
          gym.id === gymId
            ? {
                ...gym,
                equipment: [...gym.equipment, createdItem],
              }
            : gym
        )
      );

      setEquipmentTypeByGym((prev) => ({ ...prev, [gymId]: "other" }));
      setEquipmentNameByGym((prev) => ({ ...prev, [gymId]: "" }));
      setEquipmentNotesByGym((prev) => ({ ...prev, [gymId]: "" }));
      setEquipmentWeightsByGym((prev) => ({ ...prev, [gymId]: [] }));
      setEquipmentWeightInputByGym((prev) => ({ ...prev, [gymId]: "" }));
      setEquipmentBandLevelByGym((prev) => ({ ...prev, [gymId]: "" }));
    } catch (error) {
      setPageError(
        error instanceof Error
          ? error.message
          : "Kunde inte lägga till utrustning"
      );
    } finally {
      setIsSavingEquipmentByGym((prev) => ({
        ...prev,
        [gymId]: false,
      }));
    }
  };

  const removeEquipment = async (gymId: string, equipmentId: string) => {
    if (!authUser || isDeletingEquipmentId) return;

    setIsDeletingEquipmentId(equipmentId);
    setPageError("");

    const userId = String(authUser.id);

    try {
      const res = await fetch(
        `/api/gym-equipment/${encodeURIComponent(equipmentId)}`,
        {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ userId }),
        }
      );

      const data = await res.json();

      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Kunde inte ta bort utrustning");
      }

      setGyms((prev) =>
        prev.map((gym) =>
          gym.id === gymId
            ? {
                ...gym,
                equipment: gym.equipment.filter((item) => item.id !== equipmentId),
              }
            : gym
        )
      );
    } catch (error) {
      setPageError(
        error instanceof Error ? error.message : "Kunde inte ta bort utrustning"
      );
    } finally {
      setIsDeletingEquipmentId(null);
    }
  };

  if (!authChecked) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <div className="text-sm text-gray-600">Kontrollerar inloggning...</div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 p-4">
      <div className="mx-auto max-w-md space-y-4 pb-24">
        <header className="space-y-3">
          <button
            type="button"
            onClick={() => router.push("/home")}
            className="text-sm font-semibold text-blue-600"
          >
            ← Tillbaka
          </button>

          <div>
            <p className="text-sm text-gray-600">Gym</p>
            <h1 className="text-3xl font-bold text-gray-950">Hantera gym</h1>
            <p className="mt-2 text-sm text-gray-600">
              Lägg till gym och ange vilken utrustning som finns i varje gym.
            </p>
          </div>
        </header>

        {pageError ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {pageError}
          </div>
        ) : null}

        <section className="rounded-2xl border bg-white p-4 shadow-sm">
          <h2 className="text-base font-semibold text-gray-900">Skapa nytt gym</h2>

          <div className="mt-3 space-y-3">
            <input
              type="text"
              value={newGymName}
              onChange={(e) => setNewGymName(e.target.value)}
              placeholder="Namn på gym"
              className="w-full rounded-xl border px-3 py-3 text-base"
            />

            <button
              type="button"
              onClick={addGym}
              disabled={isSavingGym}
              className="w-full rounded-2xl bg-blue-600 px-4 py-3 font-semibold text-white disabled:opacity-60"
            >
              {isSavingGym ? "Sparar..." : "Spara gym"}
            </button>
          </div>
        </section>

        <section className="space-y-3">
          {isLoading ? (
            <div className="rounded-2xl border bg-white p-4 text-sm text-gray-600 shadow-sm">
              Hämtar gym...
            </div>
          ) : gyms.length === 0 ? (
            <div className="rounded-2xl border bg-white p-4 text-sm text-gray-600 shadow-sm">
              Inga gym sparade ännu.
            </div>
          ) : (
            gyms.map((gym) => {
              const isExpanded = expandedGymId === gym.id;
              const isEditing = editingGymId === gym.id;
              const selectedType = equipmentTypeByGym[gym.id] ?? "other";
              const selectedWeights = equipmentWeightsByGym[gym.id] ?? [];
              const showWeights = isWeightBasedType(selectedType);
              const showBandLevel = selectedType === "bands";
              const weightStep = getWeightStep(selectedType);
              const isSavingEquipment = !!isSavingEquipmentByGym[gym.id];

              return (
                <div
                  key={gym.id}
                  className="rounded-2xl border bg-white p-4 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      {isEditing ? (
                        <div className="space-y-2">
                          <input
                            ref={editingGymInputRef}
                            type="text"
                            value={editingGymName}
                            onChange={(e) => setEditingGymName(e.target.value)}
                            onBlur={() => void handleGymNameBlur(gym.id)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                void saveGymName(gym.id);
                              }

                              if (e.key === "Escape") {
                                e.preventDefault();
                                cancelEditGym();
                              }
                            }}
                            disabled={isSavingGymName}
                            className="w-full rounded-xl border px-3 py-3 text-base"
                          />
                          <p className="text-xs text-gray-500">
                            Enter = spara, Escape = avbryt
                          </p>
                        </div>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => startEditGym(gym)}
                            className="text-left text-lg font-semibold text-gray-950"
                          >
                            {gym.name}
                          </button>
                          <p className="mt-1 text-sm text-gray-600">
                            {gym.equipment.length > 0
                              ? `${gym.equipment.length} utrustningsobjekt`
                              : "Ingen utrustning angiven"}
                          </p>
                        </>
                      )}
                    </div>

                    {!isEditing && (
                      <div className="flex flex-col gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedGymId((prev) =>
                              prev === gym.id ? null : gym.id
                            )
                          }
                          className="rounded-xl border px-3 py-2 text-sm font-semibold text-gray-900"
                        >
                          {isExpanded ? "Dölj" : "Öppna"}
                        </button>

                        <button
                          type="button"
                          onClick={() => removeGym(gym.id)}
                          disabled={isDeletingGymId === gym.id}
                          className="rounded-xl border px-3 py-2 text-sm font-semibold text-red-600 disabled:opacity-60"
                        >
                          {isDeletingGymId === gym.id ? "Tar bort..." : "Ta bort"}
                        </button>
                      </div>
                    )}
                  </div>

                  {isExpanded && (
                    <div className="mt-4 space-y-4">
                      <div>
                        <h4 className="text-sm font-semibold text-gray-900">
                          Utrustning
                        </h4>

                        <div className="mt-3 space-y-3">
                          {gym.equipment.length === 0 ? (
                            <div className="rounded-xl bg-gray-50 p-3 text-sm text-gray-600">
                              Ingen utrustning tillagd ännu.
                            </div>
                          ) : (
                            gym.equipment.map((item) => (
                              <div
                                key={item.id}
                                className="rounded-xl bg-gray-50 p-3"
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div>
                                    <div className="font-semibold text-gray-900">
                                      {item.name}
                                    </div>

                                    <div className="mt-1 text-sm text-gray-600">
                                      {formatEquipmentType(item.type)}
                                    </div>

                                    {isWeightBasedType(item.type) ? (
                                      <div className="mt-1 text-sm text-gray-700">
                                        Vikter:{" "}
                                        {item.weightsKg && item.weightsKg.length > 0
                                          ? formatWeights(item.weightsKg)
                                          : "Alla vikter"}
                                      </div>
                                    ) : null}

                                    {item.type === "bands" && item.bandLevel ? (
                                      <div className="mt-1 text-sm text-gray-700">
                                        Motstånd: {getBandLevelLabel(item.bandLevel)}
                                      </div>
                                    ) : null}

                                    {item.notes ? (
                                      <div className="mt-1 text-sm text-gray-700">
                                        Notering: {item.notes}
                                      </div>
                                    ) : null}
                                  </div>

                                  <button
                                    type="button"
                                    onClick={() =>
                                      removeEquipment(gym.id, item.id)
                                    }
                                    disabled={isDeletingEquipmentId === item.id}
                                    className="rounded-xl border px-3 py-2 text-sm font-semibold text-red-600 disabled:opacity-60"
                                  >
                                    {isDeletingEquipmentId === item.id
                                      ? "Tar bort..."
                                      : "Ta bort"}
                                  </button>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>

                      <div className="rounded-2xl border p-4">
                        <h4 className="text-sm font-semibold text-gray-900">
                          Lägg till utrustning
                        </h4>

                        <div className="mt-3 space-y-3">
                          <select
                            value={selectedType}
                            onChange={(e) =>
                              handleEquipmentTypeChange(
                                gym.id,
                                e.target.value as EquipmentType
                              )
                            }
                            className="w-full rounded-xl border bg-white px-3 py-3 text-base"
                          >
                            {EQUIPMENT_TYPE_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>

                          <input
                            type="text"
                            value={equipmentNameByGym[gym.id] ?? ""}
                            onChange={(e) =>
                              setEquipmentNameByGym((prev) => ({
                                ...prev,
                                [gym.id]: e.target.value,
                              }))
                            }
                            placeholder="Namn på utrustning"
                            className="w-full rounded-xl border px-3 py-3 text-base"
                          />

                          {showWeights && (
                            <div className="space-y-2">
                              <div className="flex gap-2">
                                <input
                                  type="number"
                                  inputMode="decimal"
                                  step={weightStep}
                                  min={0}
                                  value={equipmentWeightInputByGym[gym.id] ?? ""}
                                  onChange={(e) =>
                                    setEquipmentWeightInputByGym((prev) => ({
                                      ...prev,
                                      [gym.id]: e.target.value,
                                    }))
                                  }
                                  placeholder={
                                    weightStep === 0.5
                                      ? "Lägg till vikt, t.ex. 12.5"
                                      : "Lägg till vikt, t.ex. 16"
                                  }
                                  className="w-full rounded-xl border px-3 py-3 text-base"
                                />

                                <button
                                  type="button"
                                  onClick={() => addWeightToEquipment(gym.id)}
                                  className="rounded-xl border px-4 py-3 text-sm font-semibold text-gray-900"
                                >
                                  Lägg till vikt
                                </button>
                              </div>

                              {selectedWeights.length > 0 ? (
                                <div className="flex flex-wrap gap-2">
                                  {selectedWeights.map((weight) => (
                                    <button
                                      key={weight}
                                      type="button"
                                      onClick={() =>
                                        removeWeightFromEquipment(gym.id, weight)
                                      }
                                      className="rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-800"
                                    >
                                      {weight} kg ×
                                    </button>
                                  ))}
                                </div>
                              ) : (
                                <div className="rounded-xl bg-blue-50 p-3 text-sm text-blue-900">
                                  Inga specifika vikter angivna. AI kommer då att
                                  anta att alla vikter finns.
                                </div>
                              )}
                            </div>
                          )}

                          {showBandLevel && (
                            <select
                              value={equipmentBandLevelByGym[gym.id] ?? ""}
                              onChange={(e) =>
                                setEquipmentBandLevelByGym((prev) => ({
                                  ...prev,
                                  [gym.id]: e.target.value as BandLevel,
                                }))
                              }
                              className="w-full rounded-xl border bg-white px-3 py-3 text-base"
                            >
                              <option value="">Välj motståndsnivå</option>
                              {BAND_LEVEL_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          )}

                          <input
                            type="text"
                            value={equipmentNotesByGym[gym.id] ?? ""}
                            onChange={(e) =>
                              setEquipmentNotesByGym((prev) => ({
                                ...prev,
                                [gym.id]: e.target.value,
                              }))
                            }
                            placeholder="Valfri notering"
                            className="w-full rounded-xl border px-3 py-3 text-base"
                          />

                          <button
                            type="button"
                            onClick={() => addEquipment(gym.id)}
                            disabled={isSavingEquipment}
                            className="w-full rounded-2xl bg-gray-900 px-4 py-3 font-semibold text-white disabled:opacity-60"
                          >
                            {isSavingEquipment
                              ? "Sparar..."
                              : "Lägg till utrustning"}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </section>
      </div>
    </main>
  );
}