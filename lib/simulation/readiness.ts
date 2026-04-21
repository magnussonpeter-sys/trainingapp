import { clamp, round } from "@/lib/simulation/random";
import type { SimulationUserProfile, SimulationUserState } from "@/lib/simulation/types";

export function calculateReadiness(
  state: Pick<SimulationUserState, "fatigue" | "soreness" | "motivation" | "lifeStress">,
  profile: SimulationUserProfile,
) {
  const recoveryBuffer = (profile.recoveryCapacity - 50) * 0.28;
  const score =
    74 +
    recoveryBuffer +
    state.motivation * 0.18 -
    state.fatigue * 0.34 -
    state.soreness * 0.24 -
    state.lifeStress * 0.22;

  return round(clamp(score, 0, 100), 1);
}

