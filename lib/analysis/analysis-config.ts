// Enkla coachintervall för MVP-versionen.
// De ska ses som praktiska appzoner, inte som kliniska eller universella facit.

export const ANALYSIS_LOOKBACK_WEEKS = 6;
export const HYPERTROPHY_AVERAGE_WEEKS = 4;
export const STRENGTH_RECENT_EXPOSURES = 3;

export const HYPERTROPHY_TARGETS = {
  chest: { label: "Bröst", min: 8, max: 16 },
  back: { label: "Rygg", min: 10, max: 18 },
  legs: { label: "Ben", min: 10, max: 18 },
  shoulders: { label: "Axlar", min: 6, max: 14 },
  arms: { label: "Armar", min: 6, max: 14 },
  core: { label: "Core", min: 4, max: 12 },
} as const;

export const STRENGTH_PROGRESS_THRESHOLDS = {
  positivePercent: 3,
  fallingPercent: -3,
};

export const RECOVERY_SIGNAL_THRESHOLDS = {
  elevatedWeeklyLoadPercent: 20,
  highFrequency7d: 5,
} as const;
