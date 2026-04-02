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

function getDisplayName(user: AuthUser | null) {
  if (!user) return "Där";
  return (
    user.name?.trim() ||
    user.username?.trim() ||
    user.email?.split("@")[0]?.trim() ||
    "Där"
  );
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
  const [pageError, setPageError] = useState<string | null>(null);

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      try {
        setPageError(null);

        // Viktigt för Safari/iPhone: skicka alltid med credentials.
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

        // /api/auth/me returnerar { user }.
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
          const rawSettings = localStorage.getItem(
            getAiSettingsStorageKey(userId)
          );

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

        // Behåll credentials även här.
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

        // Om tidigare valt gym inte finns kvar, fall tillbaka till kroppsvikt.
        setSelectedGymId((prev) => {
          if (prev === BODYWEIGHT_GYM_ID) return prev;

          const gymExists = normalizedGyms.some(
            (gym) => String(gym.id) === prev
          );

          return gymExists ? prev : BODYWEIGHT_GYM_ID;
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
  const displayName = getDisplayName(authUser);

  const overviewItems = useMemo(
    () => [
      {
        label: "Vald passlängd",
        value: `${selectedDuration} min`,
      },
      {
        label: "Gym sparade",
        value: String(gyms.length),
      },
      {
        label: "Träningsmiljö",
        value:
          selectedGymId === BODYWEIGHT_GYM_ID ? "Kroppsvikt" : "Gym valt",
      },
    ],
    [gyms.length, selectedDuration, selectedGymId]
  );

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
    // Säkerställ alltid ett giltigt värde.
    const parsed = Number(durationInput);
    const nextDuration = clampDuration(parsed);
    setSelectedDuration(nextDuration);
    setDurationInput(String(nextDuration));
  }

  function handleGenerateAiWorkout() {
    // Extra skydd så att användaren inte navigerar innan auth är klar.
    if (!authUser?.id) {
      setPageError("Användaren är inte färdigladdad ännu. Försök igen.");
      return;
    }

    setPageError(null);

    const params = new URLSearchParams();
    params.set("duration", String(selectedDuration));
    params.set("userId", String(authUser.id));

    // Vid kroppsvikt skickas inget vanligt gymId.
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
    return (
      <main className="min-h-screen bg-[var(--app-page-bg)] px-6 py-10">
        <div className="mx-auto max-w-6xl">
          <div className="rounded-[28px] border border-[var(--app-border)] bg-[var(--app-surface)] px-6 py-10 shadow-[0_24px_80px_rgba(15,23,42,0.06)]">
            <p className="text-sm font-medium text-[var(--app-text-muted)]">
              Laddar...
            </p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[var(--app-page-bg)] px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="overflow-hidden rounded-[32px] border border-[var(--app-border)] bg-[var(--app-surface)] shadow-[0_30px_90px_rgba(15,23,42,0.08)]">
          <div className="grid min-h-[calc(100vh-2rem)] lg:grid-cols-[1.2fr_0.8fr]">
            {/* Vänster del: tydlig dashboard-känsla */}
            <section className="border-b border-[var(--app-border)] bg-[linear-gradient(180deg,#f8fbff_0%,#f4f7fb_100%)] p-6 sm:p-8 lg:border-b-0 lg:border-r lg:border-[var(--app-border)] lg:p-10">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--app-accent-strong)]">
                    Träningsapp
                  </p>
                  <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--app-text-strong)] sm:text-4xl">
                    Hej {displayName}
                  </h1>
                  <p className="mt-3 max-w-2xl text-base leading-7 text-[var(--app-text)]">
                    Här startar du nästa pass, ser din träningsöversikt och får
                    en tydlig plats för framtida AI-analys.
                  </p>
                </div>

                <div className="relative shrink-0" ref={menuRef}>
                  <button
                    type="button"
                    onClick={() => setIsMenuOpen((prev) => !prev)}
                    className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[var(--app-border-strong)] bg-[var(--app-surface)] text-[var(--app-text-strong)] shadow-sm transition hover:border-[var(--app-accent)] hover:bg-[var(--app-accent-soft)]"
                    aria-label="Öppna meny"
                  >
                    ☰
                  </button>

                  {isMenuOpen ? (
                    <div className="absolute right-0 top-14 z-20 w-56 overflow-hidden rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface)] shadow-[0_18px_60px_rgba(15,23,42,0.12)]">
                      <Link
                        href="/settings"
                        onClick={() => setIsMenuOpen(false)}
                        className="block px-4 py-3 text-sm font-medium text-[var(--app-text-strong)] transition hover:bg-[var(--app-surface-muted)]"
                      >
                        Inställningar
                      </Link>

                      <Link
                        href="/history"
                        onClick={() => setIsMenuOpen(false)}
                        className="block border-t border-[var(--app-border)] px-4 py-3 text-sm font-medium text-[var(--app-text-strong)] transition hover:bg-[var(--app-surface-muted)]"
                      >
                        Träningshistorik
                      </Link>

                      <Link
                        href="/gyms"
                        onClick={() => setIsMenuOpen(false)}
                        className="block border-t border-[var(--app-border)] px-4 py-3 text-sm font-medium text-[var(--app-text-strong)] transition hover:bg-[var(--app-surface-muted)]"
                      >
                        Hantera gym
                      </Link>

                      {authUser?.role === "admin" ? (
                        <Link
                          href="/admin/users"
                          onClick={() => setIsMenuOpen(false)}
                          className="block border-t border-[var(--app-border)] px-4 py-3 text-sm font-medium text-[var(--app-text-strong)] transition hover:bg-[var(--app-surface-muted)]"
                        >
                          Admin
                        </Link>
                      ) : null}

                      <button
                        type="button"
                        onClick={handleLogout}
                        disabled={isLoggingOut}
                        className="block w-full border-t border-[var(--app-border)] px-4 py-3 text-left text-sm font-medium text-[var(--app-text-strong)] transition hover:bg-[var(--app-surface-muted)] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isLoggingOut ? "Loggar ut..." : "Logga ut"}
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>

              {/* Översiktskort högst upp */}
              <div className="mt-8 grid gap-4 sm:grid-cols-3">
                {overviewItems.map((item) => (
                  <div
                    key={item.label}
                    className="rounded-[24px] border border-[var(--app-border)] bg-[var(--app-surface)] px-5 py-5 shadow-sm"
                  >
                    <p className="text-sm text-[var(--app-text-muted)]">
                      {item.label}
                    </p>
                    <p className="mt-2 text-2xl font-semibold text-[var(--app-text-strong)]">
                      {item.value}
                    </p>
                  </div>
                ))}
              </div>

              {/* Huvudkort för nytt pass */}
              <div className="mt-8 rounded-[28px] border border-[var(--app-border)] bg-[var(--app-surface)] p-6 shadow-sm sm:p-7">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--app-accent-strong)]">
                      Starta nytt pass
                    </p>
                    <h2 className="mt-2 text-2xl font-semibold tracking-tight text-[var(--app-text-strong)]">
                      Inställningar för AI-pass
                    </h2>
                    <p className="mt-2 text-sm leading-6 text-[var(--app-text)]">
                      Välj längd och träningsmiljö. Därefter kan du starta ett
                      AI-genererat pass eller gå vidare till eget upplägg.
                    </p>
                  </div>

                  <div className="rounded-2xl bg-[var(--app-accent-soft)] px-4 py-3 text-sm font-medium text-[var(--app-accent-strong)]">
                    {selectedDuration} min • {selectedGym?.name ?? "Ingen vald"}
                  </div>
                </div>

                <div className="mt-8 grid gap-6 lg:grid-cols-2">
                  <div>
                    <label
                      htmlFor="duration"
                      className="text-sm font-semibold text-[var(--app-text-strong)]"
                    >
                      Passlängd
                    </label>
                    <p className="mt-1 text-sm text-[var(--app-text-muted)]">
                      Ange mellan {MIN_DURATION} och {MAX_DURATION} minuter.
                    </p>

                    <input
                      id="duration"
                      inputMode="numeric"
                      value={durationInput}
                      onChange={(e) => handleDurationInputChange(e.target.value)}
                      onBlur={handleDurationInputBlur}
                      className="mt-3 w-full rounded-2xl border border-[var(--app-border-strong)] bg-[var(--app-input-bg)] px-4 py-3 text-base text-[var(--app-text-strong)] outline-none transition placeholder:text-[var(--app-text-muted)] focus:border-[var(--app-accent)] focus:ring-4 focus:ring-[var(--app-accent-ring)]"
                      placeholder="Antal minuter"
                    />

                    <div className="mt-4 flex flex-wrap gap-3">
                      {QUICK_DURATION_OPTIONS.map((duration) => {
                        const isSelected = selectedDuration === duration;

                        return (
                          <button
                            key={duration}
                            type="button"
                            onClick={() => handleQuickDurationSelect(duration)}
                            className={`rounded-2xl border px-4 py-3 text-sm font-semibold transition ${
                              isSelected
                                ? "border-[var(--app-accent)] bg-[var(--app-accent)] text-white"
                                : "border-[var(--app-border-strong)] bg-[var(--app-surface)] text-[var(--app-text-strong)] hover:border-[var(--app-accent)] hover:bg-[var(--app-accent-soft)]"
                            }`}
                          >
                            {duration} min
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <label
                          htmlFor="gym"
                          className="text-sm font-semibold text-[var(--app-text-strong)]"
                        >
                          Valt gym
                        </label>
                        <p className="mt-1 text-sm text-[var(--app-text-muted)]">
                          Välj sparat gym eller kör kroppsvikt.
                        </p>
                      </div>

                      <Link
                        href="/gyms"
                        className="rounded-2xl border border-[var(--app-border-strong)] bg-[var(--app-surface)] px-4 py-2 text-sm font-medium text-[var(--app-text-strong)] transition hover:border-[var(--app-accent)] hover:bg-[var(--app-accent-soft)]"
                      >
                        Redigera gym
                      </Link>
                    </div>

                    {isLoadingGyms ? (
                      <div className="mt-3 rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface-muted)] px-4 py-3 text-sm text-[var(--app-text-muted)]">
                        Hämtar gym...
                      </div>
                    ) : (
                      <>
                        <select
                          id="gym"
                          value={selectedGymId}
                          onChange={(e) => setSelectedGymId(e.target.value)}
                          className="mt-3 w-full rounded-2xl border border-[var(--app-border-strong)] bg-[var(--app-input-bg)] px-4 py-3 text-base text-[var(--app-text-strong)] outline-none transition focus:border-[var(--app-accent)] focus:ring-4 focus:ring-[var(--app-accent-ring)]"
                        >
                          <option value={BODYWEIGHT_GYM_ID}>
                            Kroppsvikt / utan gym
                          </option>

                          {gyms.map((gym) => (
                            <option key={gym.id} value={String(gym.id)}>
                              {gym.name}
                            </option>
                          ))}
                        </select>

                        {selectedGym ? (
                          <div className="mt-3 rounded-2xl bg-[var(--app-surface-muted)] px-4 py-3 text-sm text-[var(--app-text)]">
                            Vald träningsmiljö:{" "}
                            <span className="font-semibold text-[var(--app-text-strong)]">
                              {selectedGym.name}
                            </span>
                          </div>
                        ) : null}

                        {gymError ? (
                          <div className="mt-3 rounded-2xl border border-[var(--app-danger-border)] bg-[var(--app-danger-bg)] px-4 py-3 text-sm text-[var(--app-danger-text)]">
                            {gymError}
                          </div>
                        ) : null}
                      </>
                    )}
                  </div>
                </div>

                {pageError ? (
                  <div className="mt-6 rounded-2xl border border-[var(--app-danger-border)] bg-[var(--app-danger-bg)] px-4 py-3 text-sm text-[var(--app-danger-text)]">
                    {pageError}
                  </div>
                ) : null}

                <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                  <button
                    type="button"
                    onClick={handleGenerateAiWorkout}
                    disabled={!canGenerateAiWorkout}
                    className="inline-flex items-center justify-center rounded-2xl bg-[var(--app-accent)] px-5 py-3.5 text-sm font-semibold text-white transition hover:bg-[var(--app-accent-strong)] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {canGenerateAiWorkout
                      ? "Generera AI-pass"
                      : "Laddar användardata..."}
                  </button>

                  <Link
                    href="/generate"
                    className="inline-flex items-center justify-center rounded-2xl border border-[var(--app-border-strong)] bg-[var(--app-surface)] px-5 py-3.5 text-sm font-semibold text-[var(--app-text-strong)] transition hover:border-[var(--app-accent)] hover:bg-[var(--app-accent-soft)]"
                  >
                    Eget pass
                  </Link>
                </div>
              </div>

              {/* Förberedd yta för framtida analys */}
              <div className="mt-8 rounded-[28px] border border-dashed border-[var(--app-border-strong)] bg-[var(--app-surface)] p-6 sm:p-7">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--app-accent-strong)]">
                      Kommande funktion
                    </p>
                    <h2 className="mt-2 text-2xl font-semibold tracking-tight text-[var(--app-text-strong)]">
                      AI-analys av din träning
                    </h2>
                    <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--app-text)]">
                      Här kan nästa steg bli en sammanfattning av senaste pass,
                      träningsfrekvens, progression och råd utifrån dina mål.
                    </p>
                  </div>

                  <div className="text-sm text-[var(--app-text-muted)]">
                    Förberedd plats i UI
                  </div>
                </div>

                <div className="mt-6 grid gap-4 md:grid-cols-3">
                  <div className="rounded-2xl bg-[var(--app-surface-muted)] px-4 py-4">
                    <p className="text-sm font-medium text-[var(--app-text-strong)]">
                      Träningsstatus
                    </p>
                    <p className="mt-2 text-sm text-[var(--app-text-muted)]">
                      Exempel: stabil, ökande eller ojämn träningsbelastning.
                    </p>
                  </div>

                  <div className="rounded-2xl bg-[var(--app-surface-muted)] px-4 py-4">
                    <p className="text-sm font-medium text-[var(--app-text-strong)]">
                      Fokusområden
                    </p>
                    <p className="mt-2 text-sm text-[var(--app-text-muted)]">
                      Exempel: överkropp, ben, återhämtning eller kontinuitet.
                    </p>
                  </div>

                  <div className="rounded-2xl bg-[var(--app-surface-muted)] px-4 py-4">
                    <p className="text-sm font-medium text-[var(--app-text-strong)]">
                      Rekommendation
                    </p>
                    <p className="mt-2 text-sm text-[var(--app-text-muted)]">
                      Exempel: kortare pass oftare eller stegvis ökad volym.
                    </p>
                  </div>
                </div>
              </div>
            </section>

            {/* Höger del: snabb översikt och navigation */}
            <aside className="bg-[var(--app-surface)] p-6 sm:p-8 lg:p-10">
              <div className="space-y-6">
                <div className="rounded-[28px] border border-[var(--app-border)] bg-[var(--app-surface-muted)] p-6">
                  <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--app-accent-strong)]">
                    Idag
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-tight text-[var(--app-text-strong)]">
                    Din startvy
                  </h2>
                  <p className="mt-3 text-sm leading-6 text-[var(--app-text)]">
                    Använd sidan som en tydlig hubb för att starta pass, gå till
                    historik och hantera dina sparade gym.
                  </p>
                </div>

                <div className="rounded-[28px] border border-[var(--app-border)] bg-[var(--app-surface)] p-6 shadow-sm">
                  <h3 className="text-lg font-semibold text-[var(--app-text-strong)]">
                    Snabböversikt
                  </h3>

                  <div className="mt-5 space-y-4">
                    <div className="rounded-2xl border border-[var(--app-border)] px-4 py-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--app-text-muted)]">
                        Nästa pass
                      </p>
                      <p className="mt-2 text-sm text-[var(--app-text-strong)]">
                        {selectedDuration} minuter
                      </p>
                    </div>

                    <div className="rounded-2xl border border-[var(--app-border)] px-4 py-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--app-text-muted)]">
                        Vald miljö
                      </p>
                      <p className="mt-2 text-sm text-[var(--app-text-strong)]">
                        {selectedGym?.name ?? "Kroppsvikt / utan gym"}
                      </p>
                    </div>

                    <div className="rounded-2xl border border-[var(--app-border)] px-4 py-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--app-text-muted)]">
                        Konto
                      </p>
                      <p className="mt-2 text-sm text-[var(--app-text-strong)]">
                        {authUser?.email || authUser?.username || "Inloggad"}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="rounded-[28px] border border-[var(--app-border)] bg-[var(--app-surface)] p-6 shadow-sm">
                  <h3 className="text-lg font-semibold text-[var(--app-text-strong)]">
                    Snabbnavigering
                  </h3>

                  <div className="mt-5 grid gap-3">
                    <Link
                      href="/history"
                      className="rounded-2xl border border-[var(--app-border-strong)] px-4 py-3 text-sm font-medium text-[var(--app-text-strong)] transition hover:border-[var(--app-accent)] hover:bg-[var(--app-accent-soft)]"
                    >
                      Se träningshistorik
                    </Link>

                    <Link
                      href="/gyms"
                      className="rounded-2xl border border-[var(--app-border-strong)] px-4 py-3 text-sm font-medium text-[var(--app-text-strong)] transition hover:border-[var(--app-accent)] hover:bg-[var(--app-accent-soft)]"
                    >
                      Hantera gym
                    </Link>

                    <Link
                      href="/settings"
                      className="rounded-2xl border border-[var(--app-border-strong)] px-4 py-3 text-sm font-medium text-[var(--app-text-strong)] transition hover:border-[var(--app-accent)] hover:bg-[var(--app-accent-soft)]"
                    >
                      Personliga inställningar
                    </Link>

                    {authUser?.role === "admin" ? (
                      <Link
                        href="/admin/users"
                        className="rounded-2xl border border-[var(--app-border-strong)] px-4 py-3 text-sm font-medium text-[var(--app-text-strong)] transition hover:border-[var(--app-accent)] hover:bg-[var(--app-accent-soft)]"
                      >
                        Admin: användare
                      </Link>
                    ) : null}
                  </div>
                </div>

                <div className="rounded-[28px] border border-[var(--app-border)] bg-[linear-gradient(180deg,#ecfdf5_0%,#f8fafc_100%)] p-6">
                  <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--app-accent-strong)]">
                    Nästa steg
                  </p>
                  <h3 className="mt-2 text-lg font-semibold text-[var(--app-text-strong)]">
                    Bygg vidare härifrån
                  </h3>
                  <p className="mt-3 text-sm leading-6 text-[var(--app-text)]">
                    Nästa naturliga steg är att koppla in senaste pass,
                    träningsfrekvens och faktisk analysdata i denna högerspalt.
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