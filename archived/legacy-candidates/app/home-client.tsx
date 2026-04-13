"use client";

import { useEffect, useState } from "react";

type Exercise = {
  exercise_name: string;
  reps: string;
  sets: string;
};

type Session = {
  id: number;
  performed_at: string;
};

const QUICK_EXERCISES = [
  "Push-up",
  "Bordsrodd",
  "Knaboj",
  "Planka",
  "Utfall",
];

export default function HomeClient({
  user,
}: {
  user?: { email?: string | null; name?: string | null; image?: string | null };
}) {
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function loadSessions() {
    const res = await fetch("/api/sessions", { cache: "no-store" });
    const data = await res.json();
    if (data.ok) setSessions(data.sessions);
  }

  async function loadSuggestion() {
    const res = await fetch("/api/ai-suggestion", { cache: "no-store" });
    const data = await res.json();

    if (data.ok) {
      setExercises(
        data.suggestion.exercises.map((e: any) => ({
          exercise_name: e.name,
          reps: String(e.reps),
          sets: String(e.sets),
        }))
      );
    }
  }

  useEffect(() => {
    loadSessions();
    loadSuggestion();
  }, []);

  function handleQuickAdd(name: string) {
    setExercises((prev) => [
      ...prev,
      { exercise_name: name, reps: "10", sets: "3" },
    ]);
    setMessage(name + " tillagd");
  }

  async function saveWorkout() {
    setLoading(true);
    setMessage("");

    const res = await fetch("/api/sessions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ exercises }),
    });

    const data = await res.json();

    if (data.ok) {
      setMessage("Pass sparat");
      await loadSessions();
    } else {
      setMessage("Kunde inte spara pass");
    }

    setLoading(false);
  }

  return (
    <main
      style={{
        maxWidth: 600,
        margin: "0 auto",
        padding: 16,
        fontFamily: "Arial, sans-serif",
      }}
    >
      <h1 style={{ fontSize: 20 }}>Hej {user?.email}</h1>

      <section
        style={{
          background: "#ffffff",
          padding: 16,
          borderRadius: 16,
          marginBottom: 16,
          boxShadow: "0 2px 10px rgba(0,0,0,0.05)",
        }}
      >
        <h2>Dagens AI-pass</h2>

        {exercises.map((e, i) => (
          <div
            key={i}
            style={{
              padding: 10,
              borderBottom: "1px solid #eeeeee",
            }}
          >
            <strong>{e.exercise_name}</strong>
            <div style={{ fontSize: 14, color: "#555555" }}>
              {e.sets} x {e.reps}
            </div>
          </div>
        ))}

        <button onClick={loadSuggestion} style={buttonStyle("#6366f1")}>
          Nytt forslag
        </button>
      </section>

      <section
        style={{
          background: "#ffffff",
          padding: 16,
          borderRadius: 16,
          marginBottom: 16,
          boxShadow: "0 2px 10px rgba(0,0,0,0.05)",
        }}
      >
        <h3>Snabbval</h3>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {QUICK_EXERCISES.map((name) => (
            <button
              key={name}
              onClick={() => handleQuickAdd(name)}
              style={chipStyle}
            >
              + {name}
            </button>
          ))}
        </div>
      </section>

      <button onClick={saveWorkout} disabled={loading} style={buttonStyle("#22c55e")}>
        {loading ? "Sparar..." : "Spara pass"}
      </button>

      {message && <p>{message}</p>}

      <section style={{ marginTop: 20 }}>
        <h3>Senaste pass</h3>

        {sessions.map((s) => (
          <div key={s.id} style={{ fontSize: 14, marginBottom: 6 }}>
            {new Date(s.performed_at).toLocaleString("sv-SE", {
              timeZone: "Europe/Stockholm",
              year: "numeric",
              month: "2-digit",
              day: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </div>
        ))}
      </section>
    </main>
  );
}

function buttonStyle(color: string): React.CSSProperties {
  return {
    width: "100%",
    padding: 14,
    marginTop: 12,
    borderRadius: 12,
    border: "none",
    background: color,
    color: "white",
    fontWeight: "bold",
    cursor: "pointer",
  };
}

const chipStyle: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 20,
  border: "1px solid #dddddd",
  background: "#f9fafb",
  cursor: "pointer",
};