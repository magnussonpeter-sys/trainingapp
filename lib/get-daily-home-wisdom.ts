import {
  HOME_WISDOM_QUOTES,
  type HomeWisdomQuote,
} from "@/lib/home-wisdom-quotes";

const HOME_WISDOM_TIME_ZONE = "Europe/Stockholm";

function getStockholmDateKey(date: Date) {
  // Fast tidszon gör dagens visdom stabil för alla användare samma dag.
  return new Intl.DateTimeFormat("sv-CA", {
    timeZone: HOME_WISDOM_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function getDeterministicIndex(dateKey: string, length: number) {
  // Enkel hash som ger samma index för samma datumsträng varje gång.
  let hash = 0;

  for (const character of dateKey) {
    hash = (hash * 31 + character.charCodeAt(0)) % 2147483647;
  }

  return length > 0 ? hash % length : 0;
}

export function getDailyHomeWisdom(date = new Date()): HomeWisdomQuote {
  const dateKey = getStockholmDateKey(date);
  const index = getDeterministicIndex(dateKey, HOME_WISDOM_QUOTES.length);

  return HOME_WISDOM_QUOTES[index];
}
