# Sprint 5: Supersets

## Syfte
Denna sprint introducerar stöd för `superset` i workout-modellen utan att riskera det viktigaste flödet i appen: `home -> generate -> preview -> run -> history`.

Målet är att gå från:

- en blockmodell som i praktiken bara stöder `straight_sets`

Till:

- en blockmodell som tydligt kan bära `straight_sets` och `superset`

Samtidigt ska införandet ske gradvis:

- Sprint 5.1: datamodell + preview
- Sprint 5.2: run-stöd för superset
- Sprint 5.3: AI får använda supersets i rätt lägen
- Framtida förbättring: circuits när UX och generator är redo

---

## Produktprinciper

- `blocks` är fortsatt standardformat
- gamla workouts måste fortsätta fungera
- run-flödet får inte bli långsammare eller mer skört
- AI ska inte börja generera blocktyper som UI:t inte kan bära
- offline-first och lokal återställning är fortsatt kritiskt

---

## Datamodell

### Blocktyper

Appen ska stödja följande blocktyper:

- `straight_sets`
- `superset`

### Straight sets

Används för klassisk träningsstruktur där varje övning körs klart innan nästa.

### Superset

Används när två eller flera övningar växlas mellan för att spara tid eller para antagonistiska rörelser.

Exempel:

- A1 Hantelpress
- A2 Kabelrodd
- vila efter rundan

## Sprint 5.1

### Mål

Införa grundstöd för `superset` i datamodellen och preview.

### Ingår

- nya blocktyper i `types/workout.ts`
- bakåtkompatibel normalisering i `lib/workout-flow/normalize-preview-workout.ts`
- preview som renderar blocktyp, rounds och blockspecifik vila
- blockvis rendering i preview i stället för enbart platt lista

### Ingår inte

- riktig run-logik för superset
- timerlogik för varv
- AI-generering av riktiga supersets som standard
- drag-and-drop mellan block

### Tekniska ändringar

- `types/workout.ts`
  Lägg till `SupersetWorkoutBlock`
- `lib/workout-flow/normalize-preview-workout.ts`
  Bevara blockspecifik metadata och normalisera okända block varsamt
- `app/workout/preview/page.tsx`
  Rendera blockvis med tydlig etikett för blocktyp
- `components/preview/preview-exercise-list.tsx`
  Återanvänds block för block i preview

### UX-principer i Sprint 5.1

- användaren ska se om ett block är ett superset
- blockets coachning ska vara tydlig
- övningarna ska fortfarande gå att byta, flytta och ta bort utan extra steg
- om en workout ännu bara innehåller `straight_sets` ska preview kännas oförändrad

---

## Sprint 5.2

### Mål

Införa verkligt run-stöd för `superset`.

### Funktionellt

- visa A1 / A2 tydligt
- håll reda på aktuell runda
- vila efter rundan i stället för alltid efter varje enskilt moment
- snabb loggning ska bevaras

### Tekniskt

- utöka `hooks/use-active-workout.ts` med blockmedveten navigator
- visa blockkontext i `/workout/run`

---

## Sprint 5.3

### Mål

Låta AI börja använda `superset` på riktigt.

### Guardrails

- superset främst i kortare pass
- helst antagonistiska eller lågkonflikt-parningar
- inga två tunga högrisklyft i samma superset
- tunga huvudlyft ska fortsatt nästan alltid vara `straight_sets`

---

## Framtida förbättring: Circuits

Circuits pausas tills vidare i aktivt UI och AI-flöde.

När circuits återinförs ska de användas först när:

- generatorn kan välja dem selektivt
- preview kan redigera dem tydligt
- run-flödet känns lika snabbt och robust som för `straight_sets` och `superset`
- återkoppling och timerlogik är genomtänkt för blandade tids- och repsövningar

---

## Rekommenderad ordning

1. Sprint 5.1: datamodell + preview
2. Sprint 5.2: superset i run
3. Sprint 5.3: AI-stöd för superset
4. Framtida förbättring: circuits

---

## Definition av färdigt för Sprint 5.1

Sprint 5.1 är klar när:

- workout-typen kan bära `superset` och `circuit`
- workout-typen kan bära `superset`
- gamla workouts fortfarande laddas korrekt
- preview visar blocktyp tydligt
- preview renderar block separat
- build går igenom
- `straight_sets`-workouts fungerar exakt som tidigare
