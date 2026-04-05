"use client";

import Link from "next/link";

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
  isLoadingGyms: boolean;
  isStartingWorkout: boolean;
  isOpeningPreview: boolean;
  isDisabled: boolean;
  gymError?: string | null;
  pageError?: string | null;
  onQuickDurationSelect: (duration: number) => void;
  onDurationInputChange: (value: string) => void;
  onDurationInputBlur: () => void;
  onGymChange: (value: string) => void;
  onStartWorkout: () => void;
  onReviewFirst: () => void;
};

// Huvudkortet på home med snabb väg till pass.
export default function HomeStartCard({
  gyms,
  selectedDuration,
  durationInput,
  selectedGymId,
  selectedGymName,
  quickDurationOptions,
  bodyweightId,
  bodyweightLabel,
  isLoadingGyms,
  isStartingWorkout,
  isOpeningPreview,
  isDisabled,
  gymError,
  pageError,
  onQuickDurationSelect,
  onDurationInputChange,
  onDurationInputBlur,
  onGymChange,
  onStartWorkout,
  onReviewFirst,
}: HomeStartCardProps) {
  return (
    <SectionCard
      kicker="Starta pass"
      title="Dagens träning"
      actions={
        <Link
          href="/gyms"
          className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-slate-50"
        >
          Redigera gym
        </Link>
      }
      className="rounded-[28px] p-6"
      contentClassName="grid gap-5"
    >
      <DurationSelector
        value={selectedDuration}
        inputValue={durationInput}
        quickOptions={quickDurationOptions}
        onQuickSelect={onQuickDurationSelect}
        onInputChange={onDurationInputChange}
        onInputBlur={onDurationInputBlur}
      />

      <GymSelector
        gyms={gyms}
        value={selectedGymId}
        selectedGymName={selectedGymName}
        isLoading={isLoadingGyms}
        error={gymError}
        bodyweightLabel={bodyweightLabel}
        bodyweightId={bodyweightId}
        onChange={onGymChange}
      />

      {pageError ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {pageError}
        </div>
      ) : null}

      <div className="grid gap-3">
        <PrimaryButton onClick={onStartWorkout} disabled={isDisabled}>
          {isStartingWorkout ? "Startar pass..." : "Starta pass"}
        </PrimaryButton>

        <div className="grid gap-3 sm:grid-cols-2">
          <SecondaryButton onClick={onReviewFirst} disabled={isDisabled}>
            {isOpeningPreview ? "Öppnar..." : "Granska först"}
          </SecondaryButton>

          <SecondaryButton href="/workout/custom">
            Eget pass
          </SecondaryButton>
        </div>
      </div>
    </SectionCard>
  );
}