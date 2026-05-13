// Central lagring av workout draft
// Används av /home -> /preview -> /run
// Bygger på localStorage (fallback) + kan senare syncas mot DB

import { prepareWorkoutForStorage } from "@/lib/workout-flow/workout-storage-payload";

export const WORKOUT_DRAFT_KEY_PREFIX = "workout_draft:";
const WORKOUT_DRAFT_SESSION_KEY_PREFIX = "workout_draft_session:";

// Hämta key per user (viktigt för multi-user)
function getKey(userId: string) {
  return `${WORKOUT_DRAFT_KEY_PREFIX}${userId}`;
}

function getSessionKey(userId: string) {
  return `${WORKOUT_DRAFT_SESSION_KEY_PREFIX}${userId}`;
}

// Spara draft
export function saveWorkoutDraft(userId: string, draft: unknown) {
  const prepared = prepareWorkoutForStorage(draft);
  if (!prepared) {
    return;
  }

  try {
    localStorage.setItem(getKey(userId), JSON.stringify(prepared));
  } catch (err) {
    try {
      sessionStorage.setItem(getSessionKey(userId), JSON.stringify(prepared));
    } catch (sessionErr) {
      console.error("Failed to save workout draft", err, sessionErr);
    }
  }
}

// Hämta draft
export function getWorkoutDraft(userId: string) {
  try {
    const raw = localStorage.getItem(getKey(userId));
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error("Failed to load workout draft from localStorage", err);
  }

  try {
    const raw = sessionStorage.getItem(getSessionKey(userId));
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
    console.error("Failed to clear workout draft from localStorage", err);
  }

  try {
    sessionStorage.removeItem(getSessionKey(userId));
  } catch (err) {
    console.error("Failed to clear workout draft from sessionStorage", err);
  }
}
