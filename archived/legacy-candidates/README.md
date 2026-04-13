These files were moved out of the active app on 2026-04-13.

Reason:
- They appeared to belong to an older workout flow based on `/api/sessions`,
  `/api/ai-suggestion`, and the old `/generate` page.
- They were not referenced by the current `home -> preview -> run -> history`
  flow.
- They were archived instead of deleted to reduce risk while the app is still
  evolving.

Before permanent deletion, re-check:
- direct route access that users still rely on
- old docs or bookmarks
- any database tables used only by the archived routes
