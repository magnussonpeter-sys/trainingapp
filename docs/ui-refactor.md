# Träningsapp – UI Refaktor (Home / Preview / Run)

## 🎯 Syfte
Skapa ett snabbt, minimalistiskt och konsekvent träningsflöde:

- Start → Run → Klar med minimalt antal klick
- Alla avancerade funktioner är valfria
- Enhetlig design mellan sidor
- Lätt att ändra i framtiden

---

# 🧠 Grundprinciper

## Två lager

### Snabbspår (default)
- Inga krav på val
- Ingen preview krävs
- Direkt till träning

### Flexlager (valfritt)
- Preview
- Justering av pass
- Feedback
- Analys

👉 Får aldrig blockera flödet

---

## Enhetlig sidstruktur

### Topbar
- Vänster: tillbaka
- Mitten: titel
- Höger: meny

### Huvudyta
1. Primär handling
2. Stödinfo
3. Valfria justeringar

### Bottom CTA
- Samma placering på alla sidor
- Sticky på mobil

---

## Designregler

- En primär knapp per vy
- Automatik > input
- Avancerat = gömt
- Samma komponenter överallt

---

# 🏠 HOME

## Syfte
Vad ska jag göra nu?

## Innehåll
- Hälsning
- Startkort (tid + gym)
- Eget pass
- Senaste pass
- Kort status

---

# 👀 PREVIEW

## Syfte
Valfri kontroll och justering

## Innehåll
- Passheader
- Lista övningar
- Byt / ta bort / lägg till
- Starta pass

---

# 🏃 RUN

## Syfte
Vad gör jag nu?

## Innehåll
- Övning
- Set
- Vikt/reps
- Spara set

---

# 🔁 Flöden

Default:
/home → /run

Alternativ:
/home → /preview → /run

---

# 🧱 Arkitektur

## Lager

### App Shell
- AppPage
- AppTopBar
- StickyActionBar
- SectionCard

### Feature-komponenter
- HomeStartCard
- PreviewExerciseCard
- CurrentExerciseCard

### Hooks
- useHomePreferences
- useWorkoutPreview
- useActiveWorkout

---

# 📱 Mobilprinciper

- Min 44px klickyta
- Sticky CTA
- Bottom sheets istället för dropdown

---

# 🎯 Slutmål

Användaren ska kunna:

1. Öppna appen
2. Trycka “Starta”
3. Träna
4. Trycka “Klar”

👉 Appen ska kännas som ett stöd – inte ett system