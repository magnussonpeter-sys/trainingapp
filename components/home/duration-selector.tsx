"use client";

import Link from "next/link";
import DurationSelector from "@/components/home/duration-selector";
import GymSelector from "@/components/home/gym-selector";
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

// Huvudkortet på home: minimal väg till träningsstart.
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
    <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.16em] text-slate-400">
            Starta pass
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
            Dagens träning
          </h2>
        </div>

        <Link
          href="/gyms"
          className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-slate-50"
        >
          Redigera gym
        </Link>
      </div>

      <div className="mt-6 grid gap-5">
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
      </div>
    </section>
  );
}