const USER_ID_KEY = "current_user_id";

export function getCurrentUserId(): string {
  if (typeof window === "undefined") {
    return "default-user";
  }

  const existing = localStorage.getItem(USER_ID_KEY);
  if (existing) return existing;

  const newUserId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `user-${Date.now()}`;

  localStorage.setItem(USER_ID_KEY, newUserId);
  return newUserId;
}