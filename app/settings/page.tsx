"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { saveCachedHomeSettings } from "@/lib/home-settings-cache";

type Sex = "male" | "female" | "other" | "na";
type Experience = "beginner" | "novice" | "intermediate" | "advanced";
type Goal = "strength" | "hypertrophy" | "health" | "body_composition";

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
    training_goal?: Goal | null;
  };
};

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

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [pageError, setPageError] = useState("");

  useEffect(() => {
    let isMounted = true;

    async function checkAuthAndLoad() {
      try {
        // Hämta aktuell användare från nya auth-formatet: { user }.
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
          }
        );

        const settingsData =
          (await settingsRes.json()) as UserSettingsResponse;

        if (!settingsRes.ok || !settingsData?.ok) {
          throw new Error(
            settingsData?.error || "Kunde inte hämta inställningar"
          );
        }

        if (settingsData?.settings) {
          const s = settingsData.settings;
          setSex(s.sex ?? "");
          setAge(s.age?.toString() ?? "");
          setWeight(s.weight_kg?.toString() ?? "");
          setHeight(s.height_cm?.toString() ?? "");
          setExperience(s.experience_level ?? "");
          setGoal(s.training_goal ?? "");
        }
      } catch (error) {
        if (!isMounted) return;

        setPageError(
          error instanceof Error
            ? error.message
            : "Kunde inte hämta inställningar"
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

  const save = async () => {
    if (!authUser) return;

    setSaving(true);
    setMessage("");
    setPageError("");

    try {
      const userId = String(authUser.id);

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
        }),
      });

      const data = (await res.json()) as UserSettingsResponse;

      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Kunde inte spara");
      }

      // Uppdatera home-cachen direkt så att första AI-genereringen använder
      // det nya målet även om home-sidan ännu inte hunnit refetcha.
      saveCachedHomeSettings(userId, {
        training_goal: (goal || null) as Goal | null,
      });

      setMessage("Sparat!");
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "Kunde inte spara");
      setMessage("");
    } finally {
      setSaving(false);
    }
  };

  if (!authChecked) {
    return <div className="p-6">Kontrollerar inloggning...</div>;
  }

  return (
    <main className="mx-auto max-w-2xl p-6">
      <button
        type="button"
        onClick={() => router.back()}
        className="text-sm font-semibold text-blue-600"
      >
        ← Tillbaka
      </button>

      <h1 className="mt-4 text-3xl font-bold text-gray-950">Inställningar</h1>

      {pageError ? (
        <div className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">
          {pageError}
        </div>
      ) : null}

      <section className="mt-6 rounded-3xl border bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-950">Profil</h2>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="text-sm font-medium text-gray-900">Kön</label>
            <select
              value={sex}
              onChange={(e) => setSex(e.target.value as Sex)}
              className="mt-2 w-full rounded border p-2"
            >
              <option value="">Välj kön</option>
              <option value="male">Man</option>
              <option value="female">Kvinna</option>
              <option value="other">Annat</option>
              <option value="na">Vill ej ange</option>
            </select>
          </div>

          <div>
            <label className="text-sm font-medium text-gray-900">Ålder</label>
            <input
              value={age}
              onChange={(e) => setAge(e.target.value)}
              placeholder="Ålder"
              inputMode="numeric"
              className="mt-2 w-full rounded border p-2"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-gray-900">Vikt</label>
            <input
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              placeholder="Vikt (kg)"
              inputMode="decimal"
              className="mt-2 w-full rounded border p-2"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-gray-900">Längd</label>
            <input
              value={height}
              onChange={(e) => setHeight(e.target.value)}
              placeholder="Längd (cm)"
              inputMode="numeric"
              className="mt-2 w-full rounded border p-2"
            />
          </div>
        </div>
      </section>

      <section className="mt-4 rounded-3xl border bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-950">Erfarenhet</h2>

        <select
          value={experience}
          onChange={(e) => setExperience(e.target.value as Experience)}
          className="mt-2 w-full rounded border p-2"
        >
          <option value="">Välj nivå</option>
          <option value="beginner">Nybörjare</option>
          <option value="novice">Viss vana</option>
          <option value="intermediate">Erfaren</option>
          <option value="advanced">Avancerad</option>
        </select>
      </section>

      <section className="mt-4 rounded-3xl border bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-950">Mål</h2>

        <div className="mt-4 grid gap-3">
          <button
            type="button"
            onClick={() => setGoal("strength")}
            className={`w-full rounded-xl border p-3 text-left ${
              goal === "strength"
                ? "border-blue-600 bg-blue-50"
                : "border-gray-200"
            }`}
          >
            <div className="font-semibold text-gray-950">Bli starkare</div>
            <p className="mt-1 text-sm text-gray-800">
              Fokuserar på att öka styrka i basövningar med tyngre vikter och
              längre vila.
            </p>
          </button>

          <button
            type="button"
            onClick={() => setGoal("hypertrophy")}
            className={`w-full rounded-xl border p-3 text-left ${
              goal === "hypertrophy"
                ? "border-blue-600 bg-blue-50"
                : "border-gray-200"
            }`}
          >
            <div className="font-semibold text-gray-950">Bygga muskler</div>
            <p className="mt-1 text-sm text-gray-800">
              Mer träningsvolym och medelhöga reps för att stimulera
              muskelmassa.
            </p>
          </button>

          <button
            type="button"
            onClick={() => setGoal("health")}
            className={`w-full rounded-xl border p-3 text-left ${
              goal === "health"
                ? "border-blue-600 bg-blue-50"
                : "border-gray-200"
            }`}
          >
            <div className="font-semibold text-gray-950">
              Hälsa och funktion
            </div>
            <p className="mt-1 text-sm text-gray-800">
              Helkroppsträning för att må bättre, bli starkare i vardagen och
              minska skaderisk.
            </p>
          </button>

          <button
            type="button"
            onClick={() => setGoal("body_composition")}
            className={`w-full rounded-xl border p-3 text-left ${
              goal === "body_composition"
                ? "border-blue-600 bg-blue-50"
                : "border-gray-200"
            }`}
          >
            <div className="font-semibold text-gray-950">
              Kroppssammansättning
            </div>
            <p className="mt-1 text-sm text-gray-800">
              Kombinerar styrka och tempo för att minska fettmassa och behålla
              muskler.
            </p>
          </button>
        </div>
      </section>

      <div className="mt-6 flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="rounded-2xl bg-gray-900 px-5 py-3 font-semibold text-white disabled:opacity-60"
        >
          {saving ? "Sparar..." : "Spara"}
        </button>

        {message ? <p className="text-sm text-green-700">{message}</p> : null}
      </div>
    </main>
  );
}
