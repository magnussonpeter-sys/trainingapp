"use client";

import DurationSelector from "@/components/home/duration-selector";
import GymSelector from "@/components/home/gym-selector";
import SectionCard from "@/components/app-shell/section-card";
import PrimaryButton from "@/components/shared/primary-button";
import SecondaryButton from "@/components/shared/secondary-button";

type GymOption = {
  id: string | number;
  name: string;
};

type HomeStartCardProps = {
  gyms: GymOption[];
  selectedDuration: number;
  durationInput: string;
  selectedGymId: string;
  selectedGymName: string;
  quickDurationOptions: readonly number[];
  bodyweightId: string;
  bodyweightLabel: string;
  canUseStartActions: boolean;
  isStartingWorkout: boolean;
  isOpeningPreview: boolean;
  onDurationSelect: (duration: number) => void;
  onDurationInputChange: (value: string) => void;
  onDurationInputBlur: () => void;
  onGymChange: (value: string) => void;
  onStartWorkout: () => void;
  onReviewFirst: () => void;
};

// Huvudkortet på home med snabb väg till AI-pass eller manuell väg.
export default function HomeStartCard({
  gyms,
  selectedDuration,
  durationInput,
  selectedGymId,
  selectedGymName,
  quickDurationOptions,
  bodyweightId,
  bodyweightLabel,
  canUseStartActions,
  isStartingWorkout,
  isOpeningPreview,
  onDurationSelect,
  onDurationInputChange,
  onDurationInputBlur,
  onGymChange,
  onStartWorkout,
  onReviewFirst,
}: HomeStartCardProps) {
  // En gemensam disabled-flagga gör CTA-logiken lättare att läsa.
  const isStartDisabled = !canUseStartActions || isStartingWorkout;
  const isPreviewDisabled = !canUseStartActions || isOpeningPreview;
  const isAnyActionBusy = isStartingWorkout || isOpeningPreview;

  return (
    <SectionCard
      kicker="Dagens pass"
      title="Välj upplägg"
      subtitle="Starta direkt eller granska passet först. Utrustning och passlängd styr AI-förslaget."
      className="rounded-[28px] p-6"
      contentClassName="grid gap-5"
    >
      <DurationSelector
        value={selectedDuration}
        inputValue={durationInput}
        quickOptions={quickDurationOptions}
        onQuickSelect={onDurationSelect}
        onInputChange={onDurationInputChange}
        onInputBlur={onDurationInputBlur}
      />

      <GymSelector
        gyms={gyms}
        value={selectedGymId}
        selectedGymName={selectedGymName}
        isLoading={false}
        bodyweightLabel={bodyweightLabel}
        bodyweightId={bodyweightId}
        onChange={onGymChange}
      />

      <div className="grid gap-3 pt-1">
        <PrimaryButton
          onClick={onStartWorkout}
          disabled={isStartDisabled}
          className="w-full"
        >
          {isStartingWorkout ? "Startar pass..." : "Starta pass"}
        </PrimaryButton>

        <SecondaryButton
          onClick={onReviewFirst}
          disabled={isPreviewDisabled}
          className="w-full"
        >
          {isOpeningPreview ? "Öppnar..." : "Granska först"}
        </SecondaryButton>

        <SecondaryButton
          href="/workout/custom"
          className={`w-full ${isAnyActionBusy ? "pointer-events-none opacity-60" : ""}`}
        >
          Eget pass
        </SecondaryButton>
      </div>
    </SectionCard>
  );
}