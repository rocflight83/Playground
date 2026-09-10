# 01: Walking skeleton — a fixture plan renders to a readable page

**What to build:** A hand-written fixture plan document renders to a single self-contained HTML file that I can open from disk and read as a study plan. The page shows the scope note, the DISSS preamble with its cut list and ordering rationale, phase bands, and all 14 numbered sessions as collapsed rows carrying number, title, artifact one-liner and a checkbox. Any session expands on click to reveal its materials with durations, its binary self-check, and a notes area. Checkboxes and notes are inert in this ticket — they render, they do not yet persist.

This ticket fixes the plan data model for everything downstream, and establishes the repository's test conventions: colocated tests, checked-in fixture plans, injected dependencies, assertions on rendered output rather than internals.

**Blocked by:** None (can start immediately).

**Spec:** `.scratch/study-plan-generator/spec.md`

**User stories covered:** 17, 47, 48, 49, 50, 52, 53, 59, 60. Partially covered — the display half only, with content quality landing in ticket 04: 6, 10, 11, 12, 16, 20, 22, 25.

**Status:** ready-for-human

- [x] A fixture plan document, checked in, exercises every part of the data model: meta, scope note, DISSS preamble, phases, 14 sessions, materials with durations and paid flags, verification records, outlier stories
- [x] Rendering that fixture produces a complete HTML document
- [x] All 14 sessions appear, in order, as collapsed rows showing number, title, artifact one-liner and checkbox
- [x] Clicking a session expands it to show materials with links and durations, the binary self-check, and a notes area; clicking again collapses it
- [x] Phase bands separate the sessions into their phases
- [x] The DISSS preamble renders, including what was cut and the sequencing rationale
- [x] The scope note renders when stated and honest targets diverge, and is absent when they do not
- [x] A stakes field renders near the top (inert in this ticket)
- [x] The output references no external stylesheet, script, or font, and works correctly opened via `file://` with no network
- [x] Rendering the same fixture twice produces identical output
- [x] The renderer is a pure function of the plan data with no hidden state, so a hand-edited plan re-renders safely
- [x] Wide content scrolls within its own container; the page never scrolls horizontally

## Comments

Implemented at the renderer seam (`src/renderer.ts`), with the data model fixed
in `src/plan-types.ts` and a deterministic fixture in
`tests/fixtures/plan-fixture.ts`. Tests in `tests/renderer.test.ts` assert
rendered output and drive expand/collapse in jsdom. Checkboxes, notes and stakes
render but are inert (no persistence — that is ticket 02). Outlier stories are
carried in the fixture data but not yet rendered (ticket 07); consolidation slots
are not marked or rendered (ticket 04). Tooling added: `tsconfig.json`,
`typescript` + `@types/jsdom`, and `test` / `test:watch` / `typecheck` scripts.
`AGENTS.md` and `CLAUDE.md` updated from their empty-project placeholders.
