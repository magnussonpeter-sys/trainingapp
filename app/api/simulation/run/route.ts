import { NextResponse } from "next/server";

import { runHybridSimulation } from "@/lib/simulation/run-hybrid-simulation";
import { runRealAppPlannerSimulation } from "@/lib/simulation/run-real-app-planner-simulation";
import { runSimulation } from "@/lib/simulation/run-simulation";
import type { SimulationConfig, SimulationUserProfile } from "@/lib/simulation/types";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      profilePreset?: string;
      profile?: SimulationUserProfile;
      config?: Partial<SimulationConfig>;
    };

    const report =
      body.config?.plannerMode === "real_app_planner"
        ? await runRealAppPlannerSimulation({
            profilePreset: body.profilePreset,
            profile: body.profile,
            config: body.config,
          })
        : body.config?.plannerMode === "hybrid_ai"
          ? await runHybridSimulation({
            profilePreset: body.profilePreset,
            profile: body.profile,
            config: body.config,
          })
          : runSimulation({
            profilePreset: body.profilePreset,
            profile: body.profile,
            config: body.config,
          });

    return NextResponse.json({ ok: true, report });
  } catch (error) {
    console.error("POST /api/simulation/run error:", error);

    return NextResponse.json(
      { ok: false, error: "Kunde inte köra simulering" },
      { status: 500 },
    );
  }
}
