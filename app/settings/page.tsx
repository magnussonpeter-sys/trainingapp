"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Sex = "male" | "female" | "other" | "na";
type Experience = "beginner" | "novice" | "intermediate" | "advanced";
type Goal = "strength" | "hypertrophy" | "health" | "body_composition";

type AuthUser = {
  id: number;
  email: string | null;
  username: string | null;
};

export default function SettingsPage() {
  const router = useRouter();

  const [authChecked, setAuthChecked] = useState(false);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);

  const [sex, setSex] = useState<Sex | "">("");
  const [age, setAge] = useState("");
  const [weight, setWeight] = useState("");
  const [height, setHeight] = useState("");
  const [experience, setExperience] = useState<Experience | "">("");
  const [goal, setGoal] = useState<Goal | "">("");

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [pageError, setPageError] = useState("");

  useEffect(() => {
    async function checkAuthAndLoad() {
      try {
        const authRes = await fetch("/api/auth/me", { cache: "no-store" });
        const authData = await authRes.json();

        if (!authRes.ok || !authData?.ok || !authData.user) {
          router.replace("/");
          return;
        }

        const user = authData.user as AuthUser;
        setAuthUser(user);
        setAuthChecked(true);

        const userId = String(user.id);
        const settingsRes = await fetch(
          `/api/user-settings?userId=${encodeURIComponent(userId)}`,
          { cache: "no-store" }
        );
        const settingsData = await settingsRes.json();

        if (!settingsRes.ok || !settingsData?.ok) {
          throw new Error(settingsData?.error || "Kunde inte hämta inställningar");
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
        setPageError(
          error instanceof Error ? error.message : "Kunde inte hämta inställningar"
        );
      }
    }

    void checkAuthAndLoad();
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

      const data = await res.json();

      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Kunde inte spara");
      }

      setMessage("Sparat!");
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "Kunde inte spara");
      setMessage("");
    } finally {
      setSaving(false);
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
      <div className="mx-auto max-w-md space-y-4">
        <div className="flex items-center justify-between">
          <button
            onClick={() => router.back()}
            className="text-sm font-semibold text-blue-600"
          >
            ← Tillbaka
          </button>
          <h1 className="text-xl font-bold">Inställningar</h1>
          <div />
        </div>

        {pageError ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {pageError}
          </div>
        ) : null}

        <section className="rounded-2xl bg-white p-4 shadow">
          <h2 className="font-semibold">Profil</h2>

          <select
            value={sex}
            onChange={(e) => setSex(e.target.value as Sex)}
            className="mt-2 w-full rounded border p-2"
          >
            <option value="">Kön</option>
            <option value="male">Man</option>
            <option value="female">Kvinna</option>
            <option value="other">Annat</option>
            <option value="na">Vill ej ange</option>
          </select>

          <input
            value={age}
            onChange={(e) => setAge(e.target.value)}
            placeholder="Ålder"
            className="mt-2 w-full rounded border p-2"
          />

          <input
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            placeholder="Vikt (kg)"
            className="mt-2 w-full rounded border p-2"
          />

          <input
            value={height}
            onChange={(e) => setHeight(e.target.value)}
            placeholder="Längd (cm)"
            className="mt-2 w-full rounded border p-2"
          />
        </section>

        <section className="rounded-2xl bg-white p-4 shadow">
          <h2 className="font-semibold">Erfarenhet</h2>

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

        <section className="rounded-2xl bg-white p-4 shadow">
          <h2 className="font-semibold">Mål</h2>

          <div className="mt-2 space-y-2">
            <button
              type="button"
              onClick={() => setGoal("strength")}
              className={`w-full rounded-xl border p-3 text-left ${
                goal === "strength" ? "border-blue-600 bg-blue-50" : "border-gray-200"
              }`}
            >
              <div className="font-semibold">Bli starkare</div>
              <div className="text-sm text-gray-600">
                Fokuserar på att öka styrka i basövningar med tyngre vikter och längre vila.
              </div>
            </button>

            <button
              type="button"
              onClick={() => setGoal("hypertrophy")}
              className={`w-full rounded-xl border p-3 text-left ${
                goal === "hypertrophy" ? "border-blue-600 bg-blue-50" : "border-gray-200"
              }`}
            >
              <div className="font-semibold">Bygga muskler</div>
              <div className="text-sm text-gray-600">
                Mer träningsvolym och medelhöga reps för att stimulera muskelmassa.
              </div>
            </button>

            <button
              type="button"
              onClick={() => setGoal("health")}
              className={`w-full rounded-xl border p-3 text-left ${
                goal === "health" ? "border-blue-600 bg-blue-50" : "border-gray-200"
              }`}
            >
              <div className="font-semibold">Hälsa och funktion</div>
              <div className="text-sm text-gray-600">
                Helkroppsträning för att må bättre, bli starkare i vardagen och minska skaderisk.
              </div>
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
              <div className="font-semibold">Kroppssammansättning</div>
              <div className="text-sm text-gray-600">
                Kombinerar styrka och tempo för att minska fettmassa och behålla muskler.
              </div>
            </button>
          </div>
        </section>

        <button
          onClick={save}
          disabled={saving}
          className="w-full rounded-xl bg-blue-600 p-3 text-white"
        >
          {saving ? "Sparar..." : "Spara"}
        </button>

        {message && <p className="text-center text-sm">{message}</p>}
      </div>
    </main>
  );
}