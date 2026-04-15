"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import EquipmentEditorSheet from "@/components/gyms/equipment-editor-sheet";
import ConfirmSheet from "@/components/shared/confirm-sheet";
import {
  createDefaultEquipmentDraft,
  createDraftFromEquipment,
  formatEquipmentMeta,
  getEquipmentTypeLabel,
  type GymEquipment,
  isWeightBasedType,
  parseManualWeightsInput,
  sortUniqueWeights,
  type EquipmentDraft,
} from "@/lib/gyms";
import { uiButtonClasses } from "@/lib/ui/button-classes";
import { uiCardClasses } from "@/lib/ui/card-classes";
import { uiPageShellClasses } from "@/lib/ui/page-shell-classes";

type AuthUser = {
  id: string;
  role: "user" | "admin";
  status: "active" | "disabled";
};

type AdminGymDetail = {
  id: string;
  user_id: string | null;
  name: string;
  description: string | null;
  is_shared: boolean;
  owner_email: string | null;
  owner_name: string | null;
  equipment: GymEquipment[];
};

type EquipmentSheetState =
  | { open: false }
  | { open: true; mode: "create"; equipment: null }
  | { open: true; mode: "edit"; equipment: GymEquipment };

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export default function AdminGymDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const gymId = String(params?.id ?? "");

  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [gym, setGym] = useState<AdminGymDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [savingGym, setSavingGym] = useState(false);
  const [savingEquipment, setSavingEquipment] = useState(false);
  const [deletingEquipment, setDeletingEquipment] = useState(false);
  const [sheetState, setSheetState] = useState<EquipmentSheetState>({ open: false });
  const [equipmentToDelete, setEquipmentToDelete] = useState<GymEquipment | null>(null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isShared, setIsShared] = useState(false);

  async function loadPage() {
    try {
      setLoading(true);
      setError(null);

      const meResponse = await fetch("/api/auth/me", {
        credentials: "include",
        cache: "no-store",
      });
      const meData = await meResponse.json().catch(() => null);
      if (!meResponse.ok || !meData?.user) {
        router.replace("/login");
        return;
      }

      const currentUser = meData.user as AuthUser;
      setAuthUser(currentUser);
      if (currentUser.role !== "admin") {
        setError("Du saknar adminbehörighet.");
        return;
      }

      const response = await fetch(`/api/admin/gyms/${gymId}`, {
        credentials: "include",
        cache: "no-store",
      });
      const data = await response.json();

      if (!response.ok || !data?.gym) {
        throw new Error(data?.error || "Kunde inte hämta gymmet.");
      }

      const nextGym = data.gym as AdminGymDetail;
      setGym(nextGym);
      setName(nextGym.name);
      setDescription(nextGym.description ?? "");
      setIsShared(Boolean(nextGym.is_shared));
    } catch (loadError) {
      console.error("Admin gym detail load failed:", loadError);
      setError(
        loadError instanceof Error ? loadError.message : "Kunde inte läsa gymmet.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadPage();
  }, [gymId]);

  const initialDraft = useMemo(() => {
    if (!sheetState.open || sheetState.mode === "create") {
      return createDefaultEquipmentDraft();
    }

    return createDraftFromEquipment(sheetState.equipment);
  }, [sheetState]);

  async function handleSaveGym() {
    try {
      setSavingGym(true);
      setError(null);
      setSuccess(null);

      const response = await fetch(`/api/admin/gyms/${gymId}`, {
        method: "PATCH",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name,
          description,
          is_shared: isShared,
        }),
      });
      const data = await response.json();

      if (!response.ok || !data?.gym) {
        throw new Error(data?.error || "Kunde inte spara gymmet.");
      }

      setSuccess("Gym uppdaterat.");
      await loadPage();
    } catch (saveError) {
      console.error("Admin save gym failed:", saveError);
      setError(
        saveError instanceof Error ? saveError.message : "Kunde inte spara gymmet.",
      );
    } finally {
      setSavingGym(false);
    }
  }

  async function handleSaveEquipment(draft: EquipmentDraft) {
    try {
      setSavingEquipment(true);
      setError(null);
      setSuccess(null);

      const payload = {
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
        ? `/api/admin/gym-equipment/${sheetState.equipment.id}`
        : "/api/admin/gym-equipment";
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

      if (!response.ok) {
        throw new Error(data?.error || "Kunde inte spara utrustningen.");
      }

      setSheetState({ open: false });
      setSuccess(isEditMode ? "Utrustning uppdaterad." : "Utrustning tillagd.");
      await loadPage();
    } catch (saveError) {
      console.error("Admin save equipment failed:", saveError);
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Kunde inte spara utrustningen.",
      );
    } finally {
      setSavingEquipment(false);
    }
  }

  async function handleDeleteEquipment() {
    if (!equipmentToDelete) return;

    try {
      setDeletingEquipment(true);
      setError(null);
      setSuccess(null);

      const response = await fetch(`/api/admin/gym-equipment/${equipmentToDelete.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || "Kunde inte ta bort utrustningen.");
      }

      setEquipmentToDelete(null);
      setSheetState({ open: false });
      setSuccess("Utrustning borttagen.");
      await loadPage();
    } catch (deleteError) {
      console.error("Admin delete equipment failed:", deleteError);
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Kunde inte ta bort utrustningen.",
      );
    } finally {
      setDeletingEquipment(false);
    }
  }

  if (loading) {
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

  if (!authUser || authUser.role !== "admin" || !gym) {
    return (
      <main className={uiPageShellClasses.page}>
        <div className={uiPageShellClasses.content}>
          <div className={uiCardClasses.danger}>
            {error ?? "Kunde inte öppna gymmet."}
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
          <Link href="/admin/gyms" className="text-sm font-medium text-slate-500">
            ← Tillbaka till gym
          </Link>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
            {gym.name}
          </h1>
          <div className="mt-3 flex flex-wrap gap-3 text-sm text-slate-500">
            <span>Ägare: {gym.owner_name || gym.owner_email || "Okänd"}</span>
            <span>{gym.is_shared ? "Delat" : "Privat"}</span>
            <span>{gym.equipment.length} utrustningsposter</span>
          </div>
        </section>

        {error ? <div className={uiCardClasses.danger}>{error}</div> : null}
        {success ? <div className={uiCardClasses.success}>{success}</div> : null}

        <section className={cn(uiCardClasses.section, uiCardClasses.sectionPadded)}>
          <h2 className="text-xl font-semibold tracking-tight text-slate-950">
            Gymdata
          </h2>
          <div className="mt-4 space-y-4">
            <label className="block space-y-2 text-sm">
              <span className="font-medium text-slate-700">Namn</span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="min-h-11 w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-lime-300 focus:ring-4 focus:ring-lime-100"
              />
            </label>
            <label className="block space-y-2 text-sm">
              <span className="font-medium text-slate-700">Beskrivning</span>
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={4}
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-lime-300 focus:ring-4 focus:ring-lime-100"
              />
            </label>
            <label className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
              <input
                type="checkbox"
                checked={isShared}
                onChange={(event) => setIsShared(event.target.checked)}
                className="mt-1 h-5 w-5 rounded border-slate-300 text-lime-500 focus:ring-lime-300"
              />
              <span>
                <span className="block text-sm font-semibold text-slate-900">
                  Delat gym
                </span>
                <span className="mt-1 block text-sm leading-6 text-slate-600">
                  Delade gym kan användas av flera användare när delningsflödet byggs ut.
                </span>
              </span>
            </label>
            <button
              type="button"
              onClick={() => void handleSaveGym()}
              disabled={savingGym}
              className={cn(uiButtonClasses.primary, "w-full sm:w-auto")}
            >
              {savingGym ? "Sparar..." : "Spara gym"}
            </button>
          </div>
        </section>

        <section className={cn(uiCardClasses.section, uiCardClasses.sectionPadded)}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold tracking-tight text-slate-950">
                Utrustning
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Felsök och redigera gymspecifik data utan att lämna adminflödet.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSheetState({ open: true, mode: "create", equipment: null })}
              className={uiButtonClasses.primary}
            >
              + Lägg till utrustning
            </button>
          </div>

          <div className="mt-5 space-y-3">
            {gym.equipment.map((item) => (
              <article key={item.id} className={cn(uiCardClasses.base, "p-4")}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-semibold text-slate-950">
                        {item.label}
                      </h3>
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                        {getEquipmentTypeLabel(item.equipment_type)}
                      </span>
                    </div>
                    {formatEquipmentMeta(item) ? (
                      <p className="mt-2 text-sm leading-6 text-slate-600">
                        {formatEquipmentMeta(item)}
                      </p>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => setSheetState({ open: true, mode: "edit", equipment: item })}
                    className={uiButtonClasses.secondary}
                  >
                    Redigera
                  </button>
                </div>
              </article>
            ))}

            {gym.equipment.length === 0 ? (
              <div className={cn(uiCardClasses.soft, "text-sm text-slate-600")}>
                Ingen utrustning tillagd ännu.
              </div>
            ) : null}
          </div>
        </section>
      </div>

      <EquipmentEditorSheet
        open={sheetState.open}
        mode={sheetState.open ? sheetState.mode : "create"}
        title={
          sheetState.open && sheetState.mode === "edit"
            ? sheetState.equipment.label
            : "Ny utrustning"
        }
        initialDraft={initialDraft}
        isSaving={savingEquipment}
        isDeleting={deletingEquipment}
        onClose={() => setSheetState({ open: false })}
        onSave={handleSaveEquipment}
        onDelete={
          sheetState.open && sheetState.mode === "edit"
            ? async () => setEquipmentToDelete(sheetState.equipment)
            : undefined
        }
      />

      <ConfirmSheet
        open={Boolean(equipmentToDelete)}
        title="Ta bort utrustning?"
        description={
          equipmentToDelete
            ? `${equipmentToDelete.label} tas bort från gymmet.`
            : undefined
        }
        confirmLabel={deletingEquipment ? "Tar bort..." : "Ta bort"}
        destructive
        onConfirm={() => void handleDeleteEquipment()}
        onCancel={() => setEquipmentToDelete(null)}
      />
    </main>
  );
}

