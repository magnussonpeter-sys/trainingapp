# Sprint 2–3 – Preview & Run Backlog

## Syfte
Bygga vidare från sprint 1 med fokus på:
- snabb och valfri `/workout/preview`
- mycket användarvänlig `/workout/run`
- robust offline-stöd så att sparade set och övningar **inte tappas** vid förlorad internetkoppling
- konsekvent design mellan sidor
- enklare framtida ändringar genom tydlig komponent- och hook-struktur

---

# Nuvarande läge (utifrån repo)

## Det som redan finns efter sprint 1
- Gemensamt app-shell med `AppPage` och `AppTopBar`
- Home använder ett separat `HomeStartCard`
- Home-preferenser är flyttade till `use-home-preferences`

## Det som fortfarande är för tungt
- `/workout/preview/page.tsx` bär fortfarande mycket logik själv
- `/workout/run/page.tsx` bär fortfarande mycket logik själv
- `/run` måste få bättre separation mellan UI, state, persistens och nätverk

---

# Övergripande UI-principer för sprint 2 och 3

## Samma skelett på alla sidor
1. `AppTopBar`
2. huvudfokus högst upp
3. sekundär information nedanför
4. sticky CTA längst ner på mobil

## I `/preview`
Fokus: "Vill du snabbt justera innan start?"

## I `/run`
Fokus: "Vad gör jag nu?"

## Viktig regel
Det ska alltid finnas **en tydlig huvudhandling**.
Allt annat ska vara sekundärt eller dolt i sheet/meny.

---

# Sprint 2 – Preview

## Sprintmål
Gör `/workout/preview` till en ren, snabb och valfri gransknings- och redigeringssida.

## Definition of done
Användaren kan:
- öppna preview från home
- se tid, gym och passöversikt direkt
- byta övning
- ta bort övning
- lägga till övning
- justera set/reps/vila inline
- starta pass

Preview ska kännas snabb och mobilvänlig.

---

## Epic 2.1 – Flytta logik ur `/workout/preview/page.tsx`

### Skapa
- `hooks/use-workout-preview.ts`

### Flytta in i hook
- laddning av workout draft
- preview-state
- replace/remove/add/update
- validation och save tillbaka till samma draft
- loading/error-state

### Mål
`page.tsx` ska vara tunn och främst montera komponenter.

---

## Epic 2.2 – Bygg preview-komponenter

### Skapa filer
- `components/preview/preview-header.tsx`
- `components/preview/preview-meta-row.tsx`
- `components/preview/preview-exercise-list.tsx`
- `components/preview/preview-exercise-card.tsx`
- `components/preview/preview-inline-editor.tsx`

### UI-principer
- Topbar som övriga sidor
- Enkel header: passnamn, tid, gym
- Lista med övningskort
- Inline-edit i samma kort
- Sticky CTA: `Starta pass`

### Viktigt
Ingen lång AI-text i standardläge.
Ingen debug i standardläge.

---

## Epic 2.3 – Mobilvänliga edit-flöden

### Skapa filer
- `components/preview/replace-exercise-sheet.tsx`
- `components/preview/add-exercise-sheet.tsx`
- `components/shared/inline-number-stepper.tsx`
- `components/shared/confirm-sheet.tsx`

### Funktion
- `Byt` öppnar bottom sheet med relevanta alternativ
- `Lägg till övning` öppnar sökbar lista
- `Ta bort` bekräftas i sheet om det behövs
- set/reps/vila ändras inline med stepper

### Mål
2–3 tryck för de vanligaste ändringarna.

---

## Epic 2.4 – Preview ska använda samma workout draft hela vägen

### Filer att skapa/uppdatera
- `lib/workout-flow/workout-draft-store.ts`
- `lib/workout-flow/normalize-preview-workout.ts`

### Regel
- home skapar draft
- preview redigerar samma draft
- run använder samma draft

Ingen separat preview-modell.
Ingen ny generering när draft redan finns.

---

# Sprint 3 – Run

## Sprintmål
Gör `/workout/run` till appens starkaste sida: mycket snabb, tydlig och robust även offline.

## Definition of done
Användaren kan:
- fortsätta aktivt pass direkt
- spara standardset med minimalt antal tryck
- få viktförslag utan extra steg
- köra tidsövningar i samma mentala modell som repsövningar
- förlora internet utan att tappa sparade set/övningar
- avsluta pass tryggt med korrekt lokal lagring och senare sync

---

# Särskilt krav – Offline/robusthet

## Hårt krav
När internetkoppling förloras får användaren **inte** tappa:
- aktiv övning
- redan sparade set
- feedback
- tillägg/ändringar i pågående pass

## Praktisk princip
UI får aldrig anta att server-sparning lyckas i samma ögonblick.

## Lösning i sprint 3
- lokal källa är primär under passet
- nätverkssparning blir sekundär sync
- varje viktig ändring skrivs direkt till lokal persistent storage
- servern uppdateras när nät finns

---

## Epic 3.1 – Flytta run-logik ur `/workout/run/page.tsx`

### Skapa
- `hooks/use-active-workout.ts`
- `hooks/use-rest-timer.ts`
- ev `hooks/use-workout-sync.ts`

### Flytta in i hook
- laddning av aktivt pass
- current exercise / current set
- save set
- nästa set / nästa övning
- skip exercise
- finish workout
- lokal persistens
- sync-state
- resume-state

### Mål
`page.tsx` blir tunn och UI-fokuserad.

---

## Epic 3.2 – Bygg run-komponenter

### Skapa filer
- `components/run/run-header.tsx`
- `components/run/current-exercise-card.tsx`
- `components/run/set-progress.tsx`
- `components/run/weight-chip-row.tsx`
- `components/run/manual-weight-input.tsx`
- `components/run/timer-panel.tsx`
- `components/run/effort-feedback-row.tsx`
- `components/run/next-exercise-hint.tsx`
- `components/run/run-options-sheet.tsx`
- `components/run/run-save-status.tsx`

### UI-principer
- en huvudhandling per skärm
- nuvarande övning högst upp
- set-progress tydligt
- snabb viktval först
- sticky CTA längst ner
- liten men tydlig status för lokal sparning/sync

---

## Epic 3.3 – Standardflöde för repsövningar ska vara extremt snabbt

### Mål
Om användaren inte vill justera något ska ett set kunna sparas med ett tryck eller nästan ett tryck.

### Regler
- vikt förifylld från historik/förslag
- reps förifyllda från plan
- `Spara set` är default-CTA
- vila startar automatiskt efter sparat set
- ingen popup efter varje set

### Komponenter
- `weight-chip-row.tsx`
- `set-progress.tsx`
- `current-exercise-card.tsx`

---

## Epic 3.4 – Tidsövningar ska följa samma logik som repsövningar

### Regler
Samma layout som vanliga set:
- övning
- set-progress
- tid
- CTA-zon

### Lägen
- redo
- timer igång
- stoppad och redo att sparas

### Viktigt
- vilotimer göms medan set-timer körs
- samma visuella språk som repsövningar

---

## Epic 3.5 – Feedback ska vara valfri och lätt att hoppa över

### Skapa/bygga
- `effort-feedback-row.tsx`

### Regler
- visa feedback efter övning, inte efter varje set
- `0 / 2 / 4 / 6+` för reps
- `light / just_right / tough` för timed
- `Hoppa över` ska finnas
- feedback får aldrig blockera nästa steg

---

## Epic 3.6 – Samla avancerade val i ett sheet

### Skapa
- `components/run/run-options-sheet.tsx`

### Innehåll
- ändra övning
- justera set/reps/rest
- lägg till övning
- hoppa över övning
- avbryt pass

### Mål
Huvudvyn blir ren, men avancerade funktioner finns kvar.

---

## Epic 3.7 – Offline-first persistens i `/run`

### Skapa/uppdatera
- `lib/workout-flow/active-workout-store.ts`
- `lib/workout-flow/session-draft-store.ts`
- ev `lib/workout-flow/pending-sync-store.ts`

### Krav
Varje gång användaren:
- sparar set
- byter övning
- lägger till/tar bort övning
- ger feedback
- går till nästa övning

ska state direkt skrivas till lokal persistent storage.

### Lagringsmodell
Ha gärna tre nivåer:
1. `active workout` – nuvarande pass
2. `session draft` – pågående loggstatus
3. `pending sync queue` – sådant som ännu inte skickats färdigt till backend

### Viktigt
- UI markerar `Sparat lokalt`
- UI markerar `Synk väntar` när nät saknas
- Vid återkomst av nät försöker appen synka i bakgrunden
- Ingen data ska kastas bara för att ett fetch-anrop misslyckas

---

## Epic 3.8 – Resume, avbryt och avslut ska vara robusta

### Skapa/uppdatera
- `components/shared/confirm-sheet.tsx`
- `components/run/run-save-status.tsx`

### Krav
- om användaren lämnar sidan ska aktiv session finnas kvar
- återöppning ska kunna resume:a passet
- `Avbryt pass` ska bekräftas
- `Finish workout` ska:
  - spara loggen lokalt först
  - markera den redo för sync
  - rensa aktiv session först när lokalt state är säkert
  - visa enkel sammanfattning

### Viktigt
Om backend-sparning misslyckas ska passet ändå finnas kvar som slutfört lokalt tills sync lyckas.

---

# Noggrann UI-genomgång för `/run`

## Huvudlayout

### Topbar
- vänster: diskret tillbaka/avbryt
- mitten: `Pass pågår`
- höger: meny/option sheet

### Huvudyta
1. nuvarande övning
2. set-progress
3. vikt/reps eller tid
4. snabbval
5. CTA
6. liten nästa-övning-hint
7. valfri feedback efter övning

### Bottom
Sticky action bar:
- `Spara set`
- eller `Start` / `Stop` / `Spara set` för tidsövning

---

## Repsövning – idealflöde
1. användaren ser övning
2. set 1/3 visas tydligt
3. föreslagen vikt redan vald
4. reps redan ifyllda
5. användaren trycker `Spara set`
6. vila startar automatiskt
7. nästa set laddas direkt

### Sekundära val
- annan vikt via chips
- manuell viktinmatning
- meny för avancerade val

---

## Tidsövning – idealflöde
1. användaren ser övning
2. set 1/3 visas tydligt
3. tid visas stort
4. tryck `Start`
5. tryck `Stop`
6. tryck `Spara set`
7. vila startar automatiskt

### Viktigt
Samma visuella struktur som repsövning.
Inte ett nytt miniflödessystem.

---

## Save-status i UI
Det ska vara tydligt men diskret.
Exempel på statusrad:
- `Sparat lokalt`
- `Väntar på synk`
- `Synkat`
- `Kunde inte synka – sparat lokalt`

Detta bygger trygghet utan att störa.

---

# Rekommenderad filordning

## Sprint 2
1. `hooks/use-workout-preview.ts`
2. `components/preview/preview-header.tsx`
3. `components/preview/preview-exercise-card.tsx`
4. `components/preview/preview-exercise-list.tsx`
5. `components/preview/preview-inline-editor.tsx`
6. `components/preview/replace-exercise-sheet.tsx`
7. `components/preview/add-exercise-sheet.tsx`
8. tunnare `app/workout/preview/page.tsx`

## Sprint 3
1. `hooks/use-active-workout.ts`
2. `hooks/use-rest-timer.ts`
3. `lib/workout-flow/active-workout-store.ts`
4. `lib/workout-flow/session-draft-store.ts`
5. `lib/workout-flow/pending-sync-store.ts`
6. `components/run/run-header.tsx`
7. `components/run/current-exercise-card.tsx`
8. `components/run/set-progress.tsx`
9. `components/run/weight-chip-row.tsx`
10. `components/run/manual-weight-input.tsx`
11. `components/run/timer-panel.tsx`
12. `components/run/effort-feedback-row.tsx`
13. `components/run/next-exercise-hint.tsx`
14. `components/run/run-options-sheet.tsx`
15. `components/run/run-save-status.tsx`
16. tunnare `app/workout/run/page.tsx`

---

# Brutal prioritering

## Måste först
1. Flytta logik ur `/run/page.tsx`
2. Säkerställ lokal persistens efter varje sparat set
3. Gör `Spara set` till naturligt standardflöde
4. Gör feedback valfri
5. Samla avancerade val i options-sheet

## Kan komma lite senare
- snyggare animationer
- mer avancerad analys i preview
- mer detaljerad statistik i run

---

# Slutresultat

När sprint 2 och 3 är klara ska appen kännas så här:
- Home: snabb start
- Preview: snabb kontroll
- Run: tydlig handling, nästan inget tänkande, trygg offline-lagring

👉 Det viktigaste måttet är att användaren vågar lita på att inget försvinner mitt i ett pass, även utan internet.

