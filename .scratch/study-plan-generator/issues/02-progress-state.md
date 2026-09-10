# 02: Progress state

**What to build:** The page remembers what I have done. I check off a session, type notes against it, fill in my stakes, close the tab, and come back to find all of it intact. The lowest-numbered unchecked session is expanded when the page loads, so I open the file and land on today's work. A progress indicator shows how far through the plan I am. Because browser storage is per-browser and can be cleared, an export control writes my progress to a file and an import control reads it back into a fresh page.

**Blocked by:** 01.

**Spec:** `.scratch/study-plan-generator/spec.md`

**User stories covered:** 15, 26, 27, 28, 29, 51.

**Status:** done

- [x] Checking a session persists that state; reloading restores it
- [x] Notes typed against a session persist and restore
- [x] The stakes field persists and restores
- [x] State is keyed by session number, so a plan whose session content changed but whose numbering did not retains its progress
- [x] On load, the lowest-numbered unchecked session is expanded; when every session is checked, none is force-expanded
- [x] The progress indicator reflects the number of checked sessions
- [x] Export produces a document that, imported into a page with empty storage, restores checkboxes, notes and stakes exactly
- [x] The page renders correctly and remains usable when storage throws or returns nothing
- [x] Client-side behaviour is tested by driving the rendered output in a DOM environment, not through a separate seam
