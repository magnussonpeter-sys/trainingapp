# Sprint 1 – UI Refaktor Backlog

## 🎯 Mål
Skapa grund för nytt UI och flöde utan att riva befintlig funktionalitet.

Efter sprinten:
- Ny /home
- UI-shell klart
- Draft-flöde etablerat

---

# 🧱 Fas A – App Shell

## Filer
components/app-shell/
- app-page.tsx
- app-top-bar.tsx
- section-card.tsx
- sticky-action-bar.tsx
- app-menu-sheet.tsx

---

# 🎨 Fas B – Shared UI

components/shared/
- primary-button.tsx
- secondary-button.tsx
- chip-selector.tsx

---

# 🏠 Fas C – Home UI

components/home/
- duration-selector.tsx
- gym-selector.tsx
- home-start-card.tsx
- last-workout-card.tsx
- status-summary-card.tsx

---

# 🧠 Fas D – State

hooks/use-home-preferences.ts

- Ladda senaste val
- Spara val
- Default-hantering

---

# 🔄 Fas E – Workout Draft

lib/workout-flow/
- build-workout-request.ts
- workout-draft-store.ts
- normalize-preview-workout.ts

---

# 🔗 Fas F – Integration

## Uppdatera
app/home/page.tsx

## Flöden

Start:
/home → run

Granska:
/home → preview

---

# ❌ Ingår inte

- Omskrivning av run
- Omskrivning av preview
- Backend-förändringar

---

# ✅ Definition of Done

- Home fungerar
- Tid och gym förvalda
- Starta pass fungerar
- Granska först fungerar

---

# 🚀 Nästa sprintar

## Sprint 2
- Preview

## Sprint 3
- Run

---

# 🧠 Regler

- Ändra en sida i taget
- Radera inte gammal kod direkt
- Flytta logik till hooks