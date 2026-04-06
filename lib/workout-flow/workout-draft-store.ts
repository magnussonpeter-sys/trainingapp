// Central lagring av workout draft
// Används av /home -> /preview -> /run
// Bygger på localStorage (fallback) + kan senare syncas mot DB

export const WORKOUT_DRAFT_KEY_PREFIX = "workout_draft:";

// Hämta key per user (viktigt för multi-user)
function getKey(userId: string) {
  return `${WORKOUT_DRAFT_KEY_PREFIX}${userId}`;
}

// Spara draft
export function saveWorkoutDraft(userId: string, draft: any) {
  try {
    localStorage.setItem(getKey(userId), JSON.stringify(draft));
  } catch (err) {
    console.error("Failed to save workout draft", err);
  }
}

// Hämta draft
export function getWorkoutDraft(userId: string) {
  try {
    const raw = localStorage.getItem(getKey(userId));
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (err) {
    console.error("Failed to load workout draft", err);
    return null;
  }
}

// Ta bort draft (t.ex efter avslutat pass)
export function clearWorkoutDraft(userId: string) {
  try {
    localStorage.removeItem(getKey(userId));
  } catch (err) {
    console.error("Failed to clear workout draft", err);
  }
}