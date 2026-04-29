"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import EquipmentEditorSheet from "@/components/gyms/equipment-editor-sheet";
import ConfirmSheet from "@/components/shared/confirm-sheet";
import {
  createDefaultEquipmentDraft,
  createDraftFromEquipment,
  type AuthUser,
  type EquipmentDraft,
  formatEquipmentMeta,
  getEquipmentTypeLabel,
  type Gym,
  type GymEquipment,
  isWeightBasedType,
  parseManualWeightsInput,
  sortUniqueWeights,
} from "@/lib/gyms";
import { uiButtonClasses } from "@/lib/ui/button-classes";
import { uiCardClasses } from "@/lib/ui/card-classes";
import { uiPageShellClasses } from "@/lib/ui/page-shell-classes";

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

type EquipmentSheetState =
  | { open: false }
  | { open: true; mode: "create"; equipment: null }
  | { open: true; mode: "edit"; equipment: GymEquipment };

export default function GymDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const gymId = String(params?.id ?? "").trim();

  const [authChecked, setAuthChecked] = useState(false);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [gym, setGym] = useState<Gym | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [sheetState, setSheetState] = useState<EquipmentSheetState>({
    open: false,
  });
  const [isSavingEquipment, setIsSavingEquipment] = useState(false);
  const [isDeletingEquipment, setIsDeletingEquipment] = useState(false);
  const [equipmentToDelete, setEquipmentToDelete] = useState<GymEquipment | null>(
    null,
  );
  const canManageGym =
    gym !== null && authUser !== null && String(gym.user_id) === String(authUser.id);

  const equipmentCount = gym?.equipment.length ?? 0;
  const initialDraft = useMemo(() => {
    if (!sheetState.open || sheetState.mode === "create") {
      return createDefaultEquipmentDraft();
    }

    return createDraftFromEquipment(sheetState.equipment);
  }, [sheetState]);

  const fetchGym = useCallback(async (userId: string) => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch(`/api/gyms/${gymId}?userId=${userId}`, {
        cache: "no-store",
        credentials: "include",
      });
      const data = await response.json();

      if (!response.ok || !data?.ok || !data?.gym) {
        throw new Error(data?.error || "Kunde inte hämta gymmet.");
      }

      setGym(data.gym as Gym);
    } catch (fetchError) {
      console.error("GET gym failed:", fetchError);
      setError(
        fetchError instanceof Error
          ? fetchError.message
          : "Kunde inte hämta gymmet.",
      );
      setGym(null);
    } finally {
      setIsLoading(false);
    }
  }, [gymId]);

  useEffect(() => {
    let isMounted = true;

    async function checkAuth() {
      try {
        const response = await fetch("/api/auth/me", {
          cache: "no-store",
          credentials: "include",
        });
        const data = await response.json().catch(() => null);

        if (!response.ok || !data?.user) {
          router.replace("/");
          return;
        }

        if (!isMounted) {
          return;
        }

        const nextUser = data.user as AuthUser;
        setAuthUser(nextUser);
        setAuthChecked(true);
        await fetchGym(String(nextUser.id));
      } catch (authError) {
        console.error("Auth check failed on /gyms/[id]:", authError);
        if (isMounted) {
          router.replace("/");
        }
      } finally {
        if (isMounted) {
          setAuthChecked(true);
        }
      }
    }

    if (gymId) {
      void checkAuth();
    }

    return () => {
      isMounted = false;
    };
  }, [fetchGym, gymId, router]);

  async function handleSaveEquipment(draft: EquipmentDraft) {
    if (!authUser?.id || !gymId) {
      return;
    }

    try {
      setIsSavingEquipment(true);
      setError(null);
      setSuccessMessage(null);

      const payload = {
        userId: String(authUser.id),
        gym_id: gymId,
        equipment_type: draft.equipmentType,
        label: draft.label.trim(),
        quantity: draft.quantity ? Number(draft.quantity) : null,
        notes: draft.notes.trim() || null,
        weights_kg: isWeightBasedType(draft.equipmentType)
          ? sortUniqueWeights([
              ...draft.selectedWeights,
              ...parseManualWeightsInput(draft.manualWeightInput),
            ])
          : null,
        band_level:
          draft.equipmentType === "bands" ? draft.bandLevels[0] ?? null : null,
        band_levels: draft.equipmentType === "bands" ? draft.bandLevels : null,
      };

      const isEditMode = sheetState.open && sheetState.mode === "edit";
      const endpoint = isEditMode
        ? `/api/gym-equipment/${sheetState.equipment.id}`
        : "/api/gym-equipment";
      const method = isEditMode ? "PATCH" : "POST";

      const response = await fetch(endpoint, {
        method,
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const data = await response.json();

      if (!response.ok || !data?.ok) {
        throw new Error(data?.error || "Kunde inte spara utrustningen.");
      }

      setSheetState({ open: false });
      setSuccessMessage(isEditMode ? "Utrustning uppdaterad." : "Utrustning tillagd.");
      await fetchGym(String(authUser.id));
    } catch (saveError) {
      console.error("Save equipment failed:", saveError);
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Kunde inte spara utrustningen.",
      );
    } finally {
      setIsSavingEquipment(false);
    }
  }

  async function confirmDeleteEquipment() {
    if (!authUser?.id || !equipmentToDelete) {
      return;
    }

    try {
      setIsDeletingEquipment(true);
      setError(null);
      setSuccessMessage(null);

      const response = await fetch(`/api/gym-equipment/${equipmentToDelete.id}`, {
        method: "DELETE",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ userId: String(authUser.id) }),
      });
      const data = await response.json();

      if (!response.ok || !data?.ok) {
        throw new Error(data?.error || "Kunde inte ta bort utrustningen.");
      }

      setSheetState({ open: false });
      setEquipmentToDelete(null);
      setSuccessMessage("Utrustning borttagen.");
      await fetchGym(String(authUser.id));
    } catch (deleteError) {
      console.error("Delete equipment failed:", deleteError);
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Kunde inte ta bort utrustningen.",
      );
    } finally {
      setIsDeletingEquipment(false);
    }
  }

  if (!authChecked) {
    return (
      <main className={uiPageShellClasses.page}>
        <div className={uiPageShellClasses.content}>
          <div className={cn(uiCardClasses.section, uiCardClasses.sectionPadded)}>
            <p className="text-sm text-slate-500">Laddar gym...</p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className={uiPageShellClasses.page}>
      <div className={cn(uiPageShellClasses.content, uiPageShellClasses.stack)}>
        <section
          className={cn(
            uiCardClasses.section,
            uiCardClasses.sectionPadded,
            "bg-[radial-gradient(circle_at_top,_rgba(190,242,100,0.28),_rgba(255,255,255,1)_66%)]",
          )}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2">
              <Link href="/gyms" className="text-sm font-medium text-slate-500">
                ← Tillbaka till gym
              </Link>
              <h1 className="text-3xl font-semibold tracking-tight text-slate-950">
                {gym?.name ?? "Gym"}
              </h1>
              <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
                <span>{equipmentCount} utrustningsposter</span>
                <span>•</span>
                <span
                  className={cn(
                    "rounded-full px-2.5 py-1 text-xs font-semibold",
                    gym?.is_shared
                      ? "bg-lime-100 text-lime-800"
                      : "bg-slate-100 text-slate-600",
                  )}
                >
                  {gym?.is_shared ? "Delat" : "Privat"}
                </span>
              </div>
              {gym?.description?.trim() ? (
                <p className="max-w-2xl text-sm leading-6 text-slate-600">
                  {gym.description.trim()}
                </p>
              ) : null}
              {!canManageGym && gym?.is_shared ? (
                <p className="max-w-2xl text-sm leading-6 text-slate-500">
                  Detta delade gym kan användas i appen av alla användare, men bara
                  redigeras av ägaren.
                </p>
              ) : null}
            </div>

            {canManageGym ? (
              <Link href={`/gyms/${gymId}/edit`} className={uiButtonClasses.secondary}>
                Redigera gym
              </Link>
            ) : null}
          </div>
        </section>

        {error ? <div className={uiCardClasses.danger}>{error}</div> : null}
        {successMessage ? (
          <div className={uiCardClasses.success}>{successMessage}</div>
        ) : null}

        <section className={cn(uiCardClasses.section, uiCardClasses.sectionPadded)}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold tracking-tight text-slate-950">
                Utrustning
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Håll varje post enkel och tydlig så blir gymvalet bättre i resten av
                appen.
              </p>
            </div>

            {canManageGym ? (
              <button
                type="button"
                onClick={() => setSheetState({ open: true, mode: "create", equipment: null })}
                className={uiButtonClasses.primary}
              >
                + Lägg till utrustning
              </button>
            ) : null}
          </div>

          <div className="mt-5 space-y-3">
            {isLoading ? (
              <p className="text-sm text-slate-500">Hämtar utrustning...</p>
            ) : gym && gym.equipment.length > 0 ? (
              gym.equipment.map((item) => (
                <article
                  key={item.id}
                  className={cn(uiCardClasses.base, "p-4 transition hover:border-lime-300")}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-semibold text-slate-950">
                          {item.label}
                        </h3>
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                          {getEquipmentTypeLabel(item.equipment_type)}
                        </span>
                      </div>

                      {formatEquipmentMeta(item) ? (
                        <p className="mt-2 text-sm leading-6 text-slate-600">
                          {formatEquipmentMeta(item)}
                        </p>
                      ) : null}
                    </div>

                    {canManageGym ? (
                      <button
                        type="button"
                        onClick={() =>
                          setSheetState({ open: true, mode: "edit", equipment: item })
                        }
                        className={uiButtonClasses.secondary}
                      >
                        Redigera
                      </button>
                    ) : null}
                  </div>
                </article>
              ))
            ) : (
              <div className={cn(uiCardClasses.soft, "text-sm text-slate-600")}>
                Ingen utrustning tillagd ännu.
              </div>
            )}
          </div>
        </section>
      </div>

      {canManageGym ? (
        <EquipmentEditorSheet
          open={sheetState.open}
          mode={sheetState.open ? sheetState.mode : "create"}
          title={
            sheetState.open && sheetState.mode === "edit"
              ? sheetState.equipment.label
              : "Ny utrustning"
          }
          initialDraft={initialDraft}
          isSaving={isSavingEquipment}
          isDeleting={isDeletingEquipment}
          onClose={() => setSheetState({ open: false })}
          onSave={handleSaveEquipment}
          onDelete={
            sheetState.open && sheetState.mode === "edit"
              ? async () => {
                  setEquipmentToDelete(sheetState.equipment);
                }
              : undefined
          }
        />
      ) : null}

      {canManageGym ? (
        <ConfirmSheet
          open={Boolean(equipmentToDelete)}
          title="Ta bort utrustning?"
          description={
            equipmentToDelete
              ? `${equipmentToDelete.label} tas bort från gymmet.`
              : undefined
          }
          confirmLabel="Ta bort"
          destructive
          onConfirm={() => void confirmDeleteEquipment()}
          onCancel={() => setEquipmentToDelete(null)}
        />
      ) : null}
    </main>
  );
}
