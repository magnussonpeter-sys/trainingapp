import { clamp } from "@/lib/simulation/random";
import type { SeededRandom } from "@/lib/simulation/random";
import type {
  SimulationConfig,
  SimulationScenario,
  SimulationUserProfile,
  SimulationUserState,
} from "@/lib/simulation/types";

function adherenceBase(profile: SimulationUserProfile) {
  if (profile.adherenceProfile === "high") return 0.9;
  if (profile.adherenceProfile === "low") return 0.58;
  return 0.76;
}

export function shouldTrainToday(params: {
  config: SimulationConfig;
  profile: SimulationUserProfile;
  random: SeededRandom;
  state: SimulationUserState;
  scenario?: SimulationScenario;
}) {
  const { config, profile, random, state, scenario } = params;

  if (!config.enableMissedWorkouts) {
    return { train: true, skipReason: undefined };
  }

  let probability = clamp(
    adherenceBase(profile) +
      (state.readiness - 60) * 0.006 +
      (state.motivation - 60) * 0.005 -
      state.fatigue * 0.003 -
      state.lifeStress * 0.0025,
    0.08,
    0.98,
  );

  if (scenario === "realistic_user") {
    // realistic_user should miss some passes, but stay near everyday
    // "mostly trains" behavior rather than stacking multiple heavy penalties.
    probability = clamp(probability + 0.1, 0.82, 0.94);
  }

  if (random.chance(probability)) {
    return { train: true, skipReason: undefined };
  }

  const skipReason =
    state.fatigue > 75
      ? "fatigue"
      : state.lifeStress > 70
        ? "life"
        : state.motivation < 45
          ? "motivation"
          : "random";

  return { train: false, skipReason: skipReason as "fatigue" | "life" | "motivation" | "random" };
}
