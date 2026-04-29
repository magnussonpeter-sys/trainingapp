import CustomWorkoutBuilderPage from "@/components/custom-workout/custom-workout-builder-page";

export default async function WorkoutCustomBuilderRoute(props: {
  searchParams?: Promise<{ id?: string | string[]; mode?: string | string[] }>;
}) {
  const searchParams = props.searchParams ? await props.searchParams : undefined;
  const savedWorkoutId = Array.isArray(searchParams?.id)
    ? searchParams?.id[0] ?? null
    : searchParams?.id ?? null;
  const mode = Array.isArray(searchParams?.mode)
    ? searchParams?.mode[0] ?? null
    : searchParams?.mode ?? null;

  return (
    <CustomWorkoutBuilderPage
      initialSavedWorkoutId={savedWorkoutId}
      initialMode={mode === "new" ? "new" : null}
    />
  );
}
