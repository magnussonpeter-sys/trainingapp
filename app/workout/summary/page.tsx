"use client";

import { useRouter } from "next/navigation";

export default function WorkoutSummaryPage() {
  const router = useRouter();

  return (
    <main className="min-h-screen bg-gray-50 p-4">
      <div className="mx-auto max-w-md rounded-2xl border bg-white p-5 shadow-sm">
        <p className="text-sm text-gray-600">Summering</p>
        <h1 className="mt-1 text-2xl font-bold text-gray-900">
          Passet är klart
        </h1>
        <p className="mt-3 text-sm text-gray-700">
          Bra jobbat. Nu har du ett enkelt flöde hela vägen från förslag till
          avslutat pass.
        </p>

        <button
          onClick={() => router.push("/home")}
          className="mt-5 w-full rounded-2xl bg-blue-600 px-4 py-3 text-base font-semibold text-white"
        >
          Till startsidan
        </button>
      </div>
    </main>
  );
}