"use client";

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

type SetProgressProps = {
  totalSets: number;
  currentSet: number;
};

export default function SetProgress({
  totalSets,
  currentSet,
}: SetProgressProps) {
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: totalSets }).map((_, index) => {
        const setNumber = index + 1;
        const active = setNumber === currentSet;
        const completed = setNumber < currentSet;

        return (
          <span
            key={setNumber}
            className={cn(
              "h-2.5 rounded-full transition-all",
              active
                ? "w-8 bg-indigo-600"
                : completed
                  ? "w-2.5 bg-slate-400"
                  : "w-2.5 bg-slate-200",
            )}
          />
        );
      })}
    </div>
  );
}