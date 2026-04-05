"use client";

type GymOption = {
  id: string | number;
  name: string;
};

type GymSelectorProps = {
  gyms: GymOption[];
  value: string;
  selectedGymName: string;
  isLoading: boolean;
  error?: string | null;
  bodyweightLabel: string;
  bodyweightId: string;
  onChange: (value: string) => void;
};

// Enkel väljare för gym/utrustning.
export default function GymSelector({
  gyms,
  value,
  selectedGymName,
  isLoading,
  error,
  bodyweightLabel,
  bodyweightId,
  onChange,
}: GymSelectorProps) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
      <label htmlFor="gym" className="text-sm font-semibold text-slate-900">
        Gym
      </label>

      <p className="mt-1 text-sm text-slate-600">
        Passet anpassas efter vald utrustning.
      </p>

      {isLoading ? (
        <p className="mt-3 text-sm text-slate-500">Hämtar gym...</p>
      ) : (
        <>
          <select
            id="gym"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="mt-3 min-h-[48px] w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 outline-none transition focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
          >
            <option value={bodyweightId}>{bodyweightLabel}</option>

            {gyms.map((gym) => (
              <option key={String(gym.id)} value={String(gym.id)}>
                {gym.name}
              </option>
            ))}
          </select>

          <p className="mt-3 text-sm text-slate-600">
            Val idag:{" "}
            <span className="font-medium text-slate-900">
              {selectedGymName}
            </span>
          </p>
        </>
      )}

      {error ? (
        <p className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {error}
        </p>
      ) : null}
    </div>
  );
}