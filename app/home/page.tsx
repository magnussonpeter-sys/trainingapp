"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type AuthUser = {
  id: number | string;
  email?: string | null;
  username?: string | null;
  name?: string | null;
  role?: "user" | "admin";
  status?: "active" | "disabled";
};

type Gym = {
  id: string | number;
  name: string;
};

const QUICK_DURATION_OPTIONS = [15, 20, 30, 45] as const;
const BODYWEIGHT_GYM_ID = "bodyweight";
const MIN_DURATION = 5;
const MAX_DURATION = 180;

function normalizeGyms(data: unknown): Gym[] {
  if (Array.isArray(data)) {
    return data
      .filter(
        (item): item is { id: string | number; name: string } =>
          typeof item === "object" &&
          item !== null &&
          "id" in item &&
          "name" in item &&
          (typeof (item as { id: unknown }).id === "string" ||
            typeof (item as { id: unknown }).id === "number") &&
          typeof (item as { name: unknown }).name === "string"
      )
      .map((gym) => ({
        id: gym.id,
        name: gym.name,
      }));
  }

  if (
    typeof data === "object" &&
    data !== null &&
    "gyms" in data &&
    Array.isArray((data as { gyms?: unknown }).gyms)
  ) {
    return normalizeGyms((data as { gyms: unknown[] }).gyms);
  }

  return [];
}

function getAiSettingsStorageKey(userId: string) {
  return `ai-workout-settings:${userId}`;
}

function clampDuration(value: number) {
  if (!Number.isFinite(value)) return 30;
  return Math.min(MAX_DURATION, Math.max(MIN_DURATION, Math.round(value)));
}

export default function HomePage() {
  const router = useRouter();
  const menuRef = useRef<HTMLDivElement | null>(null);

  const [authChecked, setAuthChecked] = useState(false);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);

  // Fritt val av passlängd i minuter.
  const [selectedDuration, setSelectedDuration] = useState(30);
  const [durationInput, setDurationInput] = useState("30");

  const [gyms, setGyms] = useState<Gym[]>([]);
  const [selectedGymId, setSelectedGymId] = useState(BODYWEIGHT_GYM_ID);
  const [isLoadingGyms, setIsLoadingGyms] = useState(false);
  const [gymError, setGymError] = useState<string | null>(null);

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      try {
        setPageError(null);

        // Viktigt för Safari/iPhone: skicka alltid med credentials vid auth-kontroll.
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

        // OBS: /api/auth/me returnerar nu { user }, inte { ok, user }.
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
        const userId = String(user.id);

        if (!isMounted) return;

        setAuthUser(user);
        setAuthChecked(true);

        // Läs tidigare sparade AI-inställningar för användaren.
        try {
          const rawSettings = localStorage.getItem(getAiSettingsStorageKey(userId));
          if (rawSettings) {
            const parsed = JSON.parse(rawSettings) as {
              duration?: unknown;
              gymId?: unknown;
            };

            if (
              typeof parsed.duration === "number" &&
              Number.isFinite(parsed.duration)
            ) {
              const nextDuration = clampDuration(parsed.duration);
              setSelectedDuration(nextDuration);
              setDurationInput(String(nextDuration));
            }

            if (typeof parsed.gymId === "string" && parsed.gymId.trim()) {
              setSelectedGymId(parsed.gymId);
            }
          }
        } catch (error) {
          console.error("Kunde inte läsa sparade AI-inställningar:", error);
        }

        setIsLoadingGyms(true);
        setGymError(null);

        // Skicka även med credentials här för konsekvent beteende i Safari.
        const gymsRes = await fetch(`/api/gyms?userId=${user.id}`, {
          cache: "no-store",
          credentials: "include",
        });

        let gymsData: unknown = null;
        try {
          gymsData = await gymsRes.json();
        } catch {
          gymsData = null;
        }

        if (!isMounted) return;

        if (!gymsRes.ok) {
          const apiMessage =
            typeof gymsData === "object" &&
            gymsData !== null &&
            "error" in gymsData &&
            typeof (gymsData as { error?: unknown }).error === "string"
              ? (gymsData as { error: string }).error
              : "Kunde inte hämta gym.";

          setGymError(apiMessage);
          setGyms([]);
          return;
        }

        const normalizedGyms = normalizeGyms(gymsData);
        setGyms(normalizedGyms);

        // Om tidigare valt gym inte längre finns kvar, fall tillbaka till kroppsvikt.
        setSelectedGymId((prev) => {
          if (prev === BODYWEIGHT_GYM_ID) return prev;

          const gymExists = normalizedGyms.some(
            (gym) => String(gym.id) === prev
          );

          if (gymExists) return prev;
          return BODYWEIGHT_GYM_ID;
        });
      } catch (error) {
        console.error("Kunde inte ladda home-sidan:", error);

        if (!isMounted) return;

        setPageError("Kunde inte ladda användardata.");
        router.replace("/");
      } finally {
        if (!isMounted) return;
        setIsLoadingGyms(false);
        setAuthChecked(true);
      }
    }

    void load();

    return () => {
      isMounted = false;
    };
  }, [router]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!menuRef.current) return;

      if (!menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    }

    if (isMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isMenuOpen]);

  useEffect(() => {
    if (!authUser) return;

    // Spara senast vald passlängd och gym-val per användare.
    try {
      localStorage.setItem(
        getAiSettingsStorageKey(String(authUser.id)),
        JSON.stringify({
          duration: selectedDuration,
          gymId: selectedGymId,
        })
      );
    } catch (error) {
      console.error("Kunde inte spara AI-inställningar:", error);
    }
  }, [authUser, selectedDuration, selectedGymId]);

  const selectedGym = useMemo(() => {
    if (selectedGymId === BODYWEIGHT_GYM_ID) {
      return {
        id: BODYWEIGHT_GYM_ID,
        name: "Kroppsvikt / utan gym",
      };
    }

    return gyms.find((gym) => String(gym.id) === selectedGymId) ?? null;
  }, [gyms, selectedGymId]);

  const canGenerateAiWorkout = authChecked && !!authUser && !isLoadingGyms;

  function handleQuickDurationSelect(duration: number) {
    const nextDuration = clampDuration(duration);
    setSelectedDuration(nextDuration);
    setDurationInput(String(nextDuration));
  }

  function handleDurationInputChange(value: string) {
    // Tillåt bara siffror i textfältet.
    const sanitized = value.replace(/[^\d]/g, "");
    setDurationInput(sanitized);

    const parsed = Number(sanitized);
    if (Number.isFinite(parsed) && sanitized !== "") {
      setSelectedDuration(clampDuration(parsed));
    }
  }

  function handleDurationInputBlur() {
    // Vid blur säkerställer vi ett giltigt värde.
    const parsed = Number(durationInput);
    const nextDuration = clampDuration(parsed);
    setSelectedDuration(nextDuration);
    setDurationInput(String(nextDuration));
  }

  function handleGenerateAiWorkout() {
    // Extra skydd så att Safari inte hinner navigera vidare innan auth är klar.
    if (!authUser?.id) {
      setPageError("Användaren är inte färdigladdad ännu. Försök igen.");
      return;
    }

    setPageError(null);

    const params = new URLSearchParams();
    params.set("duration", String(selectedDuration));

    // Skicka med userId uttryckligen så preview-sidan har ett robust fallback.
    params.set("userId", String(authUser.id));

    // Vid kroppsvikt skickar vi ingen vanlig gymId, utan markerar kroppsviktsläge.
    if (selectedGymId === BODYWEIGHT_GYM_ID) {
      params.set("gymMode", "bodyweight");
    } else if (selectedGymId) {
      params.set("gymId", selectedGymId);
    }

    router.push(`/workout/preview?${params.toString()}`);
  }

  async function handleLogout() {
    try {
      setIsLoggingOut(true);

      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });

      router.replace("/");
      router.refresh();
    } catch (error) {
      console.error("Kunde inte logga ut:", error);
      router.replace("/");
    } finally {
      setIsLoggingOut(false);
    }
  }

  if (!authChecked) {
    return <div>Laddar...</div>;
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-3xl p-6">
        <header className="mb-6 flex items-start justify-between gap-4">
          <div>
            <p className="text-sm text-gray-500">Träningsapp</p>
            <h1 className="text-3xl font-bold text-gray-900">Dagens pass</h1>
            <p className="mt-2 text-sm text-gray-600">
              Välj inställningar för AI-pass eller skapa ett eget pass.
            </p>
          </div>

          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setIsMenuOpen((prev) => !prev)}
              className="flex h-11 w-11 items-center justify-center rounded-2xl border border-gray-200 bg-white text-gray-900 shadow-sm"
            >
              ☰
            </button>

            {isMenuOpen ? (
              <div className="absolute right-0 z-10 mt-2 w-56 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-lg">
                <Link
                  href="/settings"
                  onClick={() => setIsMenuOpen(false)}
                  className="block px-4 py-3 text-sm font-medium text-gray-900 hover:bg-gray-50"
                >
                  Inställningar
                </Link>

                <Link
                  href="/history"
                  onClick={() => setIsMenuOpen(false)}
                  className="block border-t border-gray-100 px-4 py-3 text-sm font-medium text-gray-900 hover:bg-gray-50"
                >
                  Träningshistorik
                </Link>

                <button
                  type="button"
                  onClick={handleLogout}
                  className="block w-full border-t border-gray-100 px-4 py-3 text-left text-sm font-medium text-gray-900 hover:bg-gray-50"
                >
                  {isLoggingOut ? "Loggar ut..." : "Logga ut"}
                </button>
              </div>
            ) : null}
          </div>
        </header>

        <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-gray-900">
            Inställningar för AI-pass
          </h2>

          <div className="mt-6">
            <div className="mb-2 flex items-center justify-between">
              <label className="text-sm font-medium text-gray-900">
                Passlängd
              </label>
              <span className="text-sm text-gray-500">
                {MIN_DURATION}–{MAX_DURATION} min
              </span>
            </div>

            {/* Fritt val av längd i minuter */}
            <div>
              <label className="text-sm text-gray-600">Antal minuter</label>
              <input
                type="text"
                inputMode="numeric"
                value={durationInput}
                onChange={(e) => handleDurationInputChange(e.target.value)}
                onBlur={handleDurationInputBlur}
                className="mt-2 w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-base outline-none"
              />
            </div>

            <p className="mt-3 text-sm text-gray-600">
              AI-passet genereras för cirka {selectedDuration} minuter.
            </p>

            {/* Snabbval finns kvar för bekvämlighet */}
            <div className="mt-4 flex flex-wrap gap-3">
              {QUICK_DURATION_OPTIONS.map((duration) => {
                const isSelected = selectedDuration === duration;

                return (
                  <button
                    key={duration}
                    type="button"
                    onClick={() => handleQuickDurationSelect(duration)}
                    className={`rounded-2xl border px-3 py-3 text-sm font-semibold ${
                      isSelected
                        ? "border-indigo-600 bg-indigo-600 text-white"
                        : "border-gray-200 bg-white text-gray-900"
                    }`}
                  >
                    {duration} min
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-8">
            <div className="mb-2 flex items-center justify-between">
              <label className="text-sm font-medium text-gray-900">
                Valt gym
              </label>

              <Link href="/gyms" className="text-sm font-medium text-indigo-600">
                Redigera gym
              </Link>
            </div>

            {isLoadingGyms ? (
              <p className="text-sm text-gray-600">Hämtar gym...</p>
            ) : (
              <>
                <select
                  value={selectedGymId}
                  onChange={(e) => setSelectedGymId(e.target.value)}
                  className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-base outline-none"
                >
                  {/* Kroppsvikt finns alltid som alternativ */}
                  <option value={BODYWEIGHT_GYM_ID}>
                    Kroppsvikt / utan gym
                  </option>

                  {gyms.map((gym) => (
                    <option key={String(gym.id)} value={String(gym.id)}>
                      {gym.name}
                    </option>
                  ))}
                </select>

                {selectedGym ? (
                  <p className="mt-3 text-sm text-gray-600">
                    Vald träningsmiljö: {selectedGym.name}
                  </p>
                ) : null}

                {gymError ? (
                  <p className="mt-3 text-sm text-red-600">{gymError}</p>
                ) : null}
              </>
            )}
          </div>

          {pageError ? (
            <div className="mt-6 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
              {pageError}
            </div>
          ) : null}

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={handleGenerateAiWorkout}
              disabled={!canGenerateAiWorkout}
              className="rounded-2xl bg-indigo-600 px-5 py-3 font-semibold text-white disabled:opacity-60"
            >
              {canGenerateAiWorkout ? "Generera AI-pass" : "Laddar användardata..."}
            </button>

            <Link
              href="/workout/custom"
              className="rounded-2xl border border-gray-200 bg-white px-5 py-3 text-center font-semibold text-gray-900"
            >
              Eget pass
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}