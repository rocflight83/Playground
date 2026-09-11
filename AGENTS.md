# AGENTS.md

## Project overview

Deterministic shell for an "Ultralearning Study Plan Generator" Claude Code
skill. The intelligence (plan prose, source discovery) lives in the skill's
prompt design; the code here is a thin, deterministic layer that turns
structured **plan data** into a single self-contained HTML page and, later,
verifies links. The generator never emits HTML directly — data and rendering
are strictly separated.

Current state: tickets 01–04 are in place — the renderer seam, progress
state, validation + verification, and the generate-mode entry point. The
`generatePlan` function takes a plan produced by the skill's prompt,
validates and verifies it, and writes plan data plus a rendered page to a
slug-named directory. Verify-on-demand and per-session redo modes are still
open tickets (see `.scratch/study-plan-generator/`).

## Build and test commands

There is no build step. TypeScript is used for type-checking only; `vitest`
transpiles it on the fly.

- `npm test` — run the whole suite once (`vitest run`)
- `npm run test:watch` — watch mode
- `npm run typecheck` — `tsc --noEmit` (run this regularly; it must stay clean)
- `npx vitest run tests/<file>.test.ts` — run a single test file

## Code style

- TypeScript, `strict` mode. No `any` unless unavoidable.
- The renderer is a **pure function of plan data**: no module-level mutable
  state, no `Date.now()`/`Math.random()`, no I/O. Rendering the same data twice
  must produce byte-identical output (re-rendering is deterministic).
- Escape all interpolated data before it enters HTML (`esc` in `src/renderer.ts`)
  so a hand-edited plan re-renders safely.
- The rendered page is fully self-contained: inline `<style>`/`<script>` only,
  no external stylesheet, script, font, or network reference at view time.

## Testing instructions

Tests live in `tests/`, colocated with a checked-in fixture plan at
`tests/fixtures/plan-fixture.ts`. Conventions (established by ticket 01 and to
be followed downstream):

- Assert **external behavior only** — what the rendered page contains, or what
  a function returns given injected dependencies. Do not assert on internal
  helpers, styling-only class names, or generated prose.
- Inject dependencies (e.g. `fetch` for verification) rather than mocking
  modules, so tests stay offline and deterministic.
- Client-side behavior is tested through the renderer seam by loading the
  output into a DOM (`jsdom`, `runScripts: 'dangerously'`) and driving it —
  there is no separate seam for the page's JavaScript.
- Fixture plans must be deterministic (fixed timestamps), so re-render
  assertions are stable.

## Architecture notes

- `src/plan-types.ts` — the plan data model (meta, scope note, DISSS preamble,
  stakes, phases, sessions, materials, verification records, outlier stories).
  This ticket fixes the model for everything downstream.
- `src/renderer.ts` — Seam 1: `renderPlan(plan): string`.
- `src/slug.ts` — `slugify(subject): string` for naming each plan's directory.
- `src/validation.ts` — `validatePlan(plan): string[]`. Every error is
  reported, not just the first.
- `src/verification.ts` — Seam 2: `verifyPlan(plan, { fetch, searchReplacement, anchorUrls?, now? })`.
  Returns a new plan with refreshed verification records plus a report.
  Replaces failed links via `searchReplacement` up to two attempts per
  slot, then records the slot `unresolved-after-retries`.
- `src/generate.ts` — `generatePlan(plan, baseDir, { fetch, searchReplacement, now?, fs? })`.
  Validates, verifies, then writes `plan.json` and `index.html` into
  `baseDir/<slug>/`. Throws `ValidationFailedError` before touching disk
  when validation fails. `fs` defaults to Node's `fs/promises`; inject a
  stub in tests.

## Security considerations

- No secrets, no network calls in the deterministic layer.
- HTML escaping of all data is the XSS guard for the hand-edit workflow.
