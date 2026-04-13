---

## Future Direction (Important for Agents)

This project is under active development. The following directions are critical and must influence all code changes.

### 1. Smarter AI Workouts (High Priority)
- AI-generated workouts should improve over time
- Future logic will use:
  - previous workouts
  - exercise performance (reps left, ratings)
  - preferred equipment
- Avoid hardcoded or static generation patterns
- Do not simplify AI input/output unnecessarily

---

### 2. Workout Structure Evolution
- `blocks` is the standard workout structure
- All new logic must support `blocks`
- Future block types will include:
  - circuits
  - supersets
  - timed intervals

⚠️ Do NOT assume:
- only one block
- only straight sets
- only rep-based exercises

---

### 3. Run Flow Optimization (/workout/run)
- This is the most critical UX in the app
- Must be:
  - fast
  - reliable
  - easy to use under stress

Planned improvements:
- clearer current set/exercise tracking
- faster logging of weight/reps
- better timer behavior
- reduced number of clicks

⚠️ Do NOT:
- add unnecessary steps
- break current session state
- reset user input unintentionally

---

### 4. Progression & Feedback System
- The app will increasingly rely on:
  - suggested weights
  - user feedback (reps left, rating)
- Exercise identity must remain stable across sessions

⚠️ Do NOT:
- break exercise IDs
- disconnect exercises from history
- remove or overwrite progression data

---

### 5. Offline-First Architecture (Critical)
The app must work without internet.

This includes:
- saving workouts locally
- restoring active workouts
- syncing later via queue

⚠️ Do NOT break:
- pending sync queue
- local workout logs
- draft workouts
- active workout session restore

Data loss is unacceptable.

---

### 6. Gym & Equipment System
- Gym selection drives AI workout generation
- Equipment must flow correctly through:
  /gyms → /home → AI → preview → run

⚠️ Do NOT:
- silently fall back to "bodyweight"
- drop equipment data in transformations
- mix labels and internal equipment types incorrectly

---

### 7. Backward Compatibility
Existing stored workouts must continue to work.

⚠️ Do NOT:
- assume all workouts use latest format
- remove support for legacy fields without migration
- break history or previously saved workouts

---

### Development Guidance

When making changes:
- Prefer extending existing systems over rewriting
- Fix root causes instead of adding fallback logic
- Check full flow: home → generate → preview → run → history

If a bug appears after refactoring:
→ First check data flow and contracts before rewriting logic

---

## Agent Behavior Rules

- Always prefer minimal, targeted fixes
- For changes larger than 1–2 lines, return complete updated files
- Always include small inline code comments explaining intent