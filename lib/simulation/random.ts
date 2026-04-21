export type SeededRandom = {
  next: () => number;
  between: (min: number, max: number) => number;
  int: (min: number, max: number) => number;
  chance: (probability: number) => boolean;
  pick: <T>(items: T[]) => T;
};

export function createSeededRandom(seed: number): SeededRandom {
  let state = Math.max(1, Math.floor(seed)) % 2147483647;

  function next() {
    // Park-Miller LCG: enkel, snabb och deterministisk för simuleringsbruk.
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  }

  return {
    next,
    between: (min, max) => min + next() * (max - min),
    int: (min, max) => Math.floor(min + next() * (max - min + 1)),
    chance: (probability) => next() < Math.min(Math.max(probability, 0), 1),
    pick: (items) => items[Math.floor(next() * items.length)],
  };
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function round(value: number, decimals = 1) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

