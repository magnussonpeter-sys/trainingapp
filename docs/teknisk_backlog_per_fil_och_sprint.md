# Teknisk backlog per fil och sprint

Detta dokument bryter ner sprintplanen till konkreta ändringar per fil, i rätt ordning.

Fokus:
- minimera risk
- maximera effekt tidigt
- förbereda för cirkelträning utan att bygga allt nu

---

# 🧱 Sprint 1 – Blockstruktur + träningsmotor

## 1. types/workout.ts (STARTA HÄR)

### Ändringar
- Lägg till WorkoutBlock-typer
- Byt från `exercises` till `blocks`

```ts
export type WorkoutBlock = {
  type: "straight_sets"
  exercises: Exercise[]
}

export interface Workout {
  id: string
  name: string
  duration: number
  goal?: string
  gym?: string
  blocks: WorkoutBlock[]
  createdAt?: string
}
```

---

## 2. lib/workout-flow/normalize-preview-workout.ts

### Syfte
Bakåtkompatibilitet

### Ändringar
- Om workout.exercises finns → mappa till block

```ts
if (workout.exercises && !workout.blocks) {
  return {
    ...workout,
    blocks: [
      {
        type: "straight_sets",
        exercises: workout.exercises
      }
    ]
  }
}
```

---

## 3. lib/workout-generator.ts

### Ändringar
- Returnera `blocks` istället för `exercises`

```ts
return {
  ...,
  blocks: [
    {
      type: "straight_sets",
      exercises: generatedExercises
    }
  ]
}
```

---

## 4. app/api/workouts/generate/route.ts

### Ändringar
- Anpassa response till blocks

---

## 5. hooks/use-workout-preview.ts

### Ändringar
- Byt från `workout.exercises` till:

```ts
const block = workout.blocks[0]
block.exercises[index]
```

---

## 6. app/workout/preview/page.tsx

### Ändringar
- Rendera block istället för lista

```ts
workout.blocks.map(block => ...)
```

---

## 7. hooks/use-active-workout.ts (VIKTIGAST)

### Ändringar

Inför:
```ts
currentBlockIndex
currentExerciseIndex
```

Byt:
```ts
workout.exercises
```

till:
```ts
workout.blocks[currentBlockIndex].exercises
```

---

## 8. app/workout/run/page.tsx

### Ändringar
- Samma som ovan
- all navigation via block + index

---

# 🧱 Sprint 2 – Progression

## 1. Ny fil: lib/progression-engine.ts

```ts
export function getNextLoad(lastSet) {
  if (lastSet.repsLeft >= 4) return "increase"
  if (lastSet.repsLeft === 2) return "keep"
  return "decrease"
}
```

---

## 2. hooks/use-active-workout.ts

### Ändringar
- spara sista set per övning
- skicka till progression-engine

---

## 3. app/workout/preview/page.tsx

### Ändringar
- visa:
  - senaste vikt
  - föreslagen vikt

---

## 4. DB / localStorage

- spara senaste resultat per övning

---

# 🧱 Sprint 3 – Feedback

## 1. app/workout/summary/page.tsx

### Visa
- total volym
- set
- förändring

---

## 2. lib/workout-summary.ts

### Ändringar
- beräkna trend

---

## 3. preview + run

- visa små coach-kommentarer

---

# 🧱 Sprint 4 – Veckostruktur

## 1. /home

### Lägg till
- veckovy
- antal pass

---

## 2. settings

- träningsfrekvens

---

# 🧱 Sprint 5 – Cirkelträning

## 1. types/workout.ts

Lägg till:

```ts
{
  type: "circuit"
  exercises: Exercise[]
  rounds: number
}
```

---

## 2. run-logik

- loopa varv

---

## 3. preview

- visa cirkel

---

# 🔥 Sammanfattning

## Minsta kritiska väg

1. types/workout.ts
2. normalize-preview
3. use-active-workout
4. run/page

## Största effekt

- progression
- bättre pass
- bättre feedback

## Framtid

- cirkelträning kan läggas till utan omskrivning

---

# 🚀 Rekommendation

Börja med:

1. types/workout.ts
2. normalize-preview
3. use-active-workout

Sedan bygger vi vidare stegvis.

