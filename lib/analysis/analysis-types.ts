import type { WorkoutLog } from "@/lib/workout-log-storage";

export type AnalysisStatus = "positive" | "stable" | "watch" | "unclear" | "low" | "high";

export type TrendPoint = {
  weekKey: string;
  weekLabel: string;
  strengthIndex: number;
  hypertrophyDose: number;
  load: number;
};

export type AnalysisSummary = {
  title: string;
  subtitle: string;
  bullets: string[];
  confidenceLabel: string;
};

export type AnalysisMetricCardData = {
  title: string;
  status: AnalysisStatus;
  statusLabel: string;
  body: string;
  keyData: string;
  supportingPoints: string[];
};

export type StrengthProgressData = AnalysisMetricCardData & {
  driverLabels: string[];
  reliabilityLabel: string;
};

export type HypertrophyDoseGroup = {
  key: "chest" | "back" | "legs" | "shoulders" | "arms" | "core";
  label: string;
  averageWeeklySets: number;
  minTarget: number;
  maxTarget: number;
  status: "under" | "within" | "high" | "unclear";
};

export type HypertrophyDoseData = AnalysisMetricCardData & {
  groups: HypertrophyDoseGroup[];
};

export type RecoverySignalData = AnalysisMetricCardData & {
  recent7dFrequency: number;
  loadDeltaPercent: number | null;
};

export type AnalysisNextStep = {
  label: string;
  detail: string;
};

export type AnalysisData = {
  summary: AnalysisSummary;
  strengthProgress: StrengthProgressData;
  hypertrophyDose: HypertrophyDoseData;
  recoverySignal: RecoverySignalData;
  trends: TrendPoint[];
  nextSteps: AnalysisNextStep[];
  dataQuality: {
    workoutCount: number;
    completedWorkoutCount: number;
    hasEnoughData: boolean;
    message: string | null;
  };
  sourceLogs: WorkoutLog[];
};
