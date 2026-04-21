import type { SimulationDailySnapshot, SimulationSeriesPoint } from "@/lib/simulation/types";

export function buildTimeSeries(
  dailySnapshots: SimulationDailySnapshot[],
): SimulationSeriesPoint[] {
  return dailySnapshots.map((snapshot) => ({
    dayIndex: snapshot.dayIndex,
    date: snapshot.date,
    readiness: snapshot.stateAfter.readiness,
    fatigue: snapshot.stateAfter.fatigue,
    motivation: snapshot.stateAfter.motivation,
    soreness: snapshot.stateAfter.soreness,
    strengthLevel: snapshot.stateAfter.strengthLevel,
    workCapacity: snapshot.stateAfter.workCapacity,
    bodyWeightKg: snapshot.stateAfter.bodyWeightKg,
    sessionLoad: snapshot.workoutResult?.estimatedLoadScore,
    sessionDifficulty: snapshot.workoutResult?.sessionDifficultyScore,
    sessionSatisfaction: snapshot.workoutResult?.sessionSatisfactionScore,
  }));
}

