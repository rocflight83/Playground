# AGENTS.md

## Project overview

Deterministic shell for an "Ultralearning Study Plan Generator" Claude Code
skill. The intelligence (plan prose, source discovery) lives in the skill's
prompt design; the code here is a thin, deterministic layer that turns
structured **plan data** into a single self-contained HTML page and, later,
verifies links. The generator never emits HTML directly — data and rendering
are strictly separated.

Current state: tickets 01–08 are in place — the renderer seam, progress
state, validation + verification, generate mode, sourcing depth
(tiered discovery with off-list admission), scope honesty (a reframed
target and its scope note are validated as a pair and rendered together),
outlier stories (real, citable, removable when uncited), and
verify-on-demand mode (`src/maintenance.ts` + `npm run verify`). Ticket 09
adds per-session redo mode: a session-numbers filter on `verifyPlan` plus
`redoSession` in `src/maintenance.ts` and `npm run redo` so one named
session can be replaced in place while the other thirteen, browser
progress, and the directory name all survive untouched (see
`.scratch/study-plan-generator/`). Ticket 12 adds source breadth:
`src/publisher.ts` (a pure `publisherKey(url)` that maps a material URL
to its publisher — registrable domain with hosting-platform tenant
awareness, returning `null` for video hosts whose URL does not name the
channel) plus a per-publisher cap (`MAX_URLS_PER_PUBLISHER = 4`,
distinct URLs after normalization, enforced by `validatePlan`) and a
sanctioned `practitioner` tier (named practitioner's own talk, video
lecture or series, blog post, podcast episode, or book — content-verified
like off-list) that discovery reaches deliberately, every phase. Ticket 13
makes `estimatedDuration` mean what the learner will feel — consumption
time, measured from the body verification already fetched (video metadata,
a stated read time, or a `<main>`/`<article>` word count at 200 wpm) —
with mismatches (>2× **and** >10 min, either direction) collected into
`report.durationWarnings` and the measured figure shown next to the stated
one on the page, never as a hard failure. Ticket 14 adds an optional
`Session.deliverableTemplate` (a list of 2–8 `{id, label, prompt, kind}`
fields) for sessions whose artifact is written rather than built: the
page renders a form per templated session, answers persist in the existing
`studyPlanProgress` store under `deliverables[session][field]`, and a
"Download deliverable" button per template writes a Markdown file.
Ticket 15 adds the curation intent model: three intents — `drop-as-known`,
`swap-material`, `redo-session` — share `applyCuration(plan, request)` in
`src/curation.ts` (a pure function) plus `curatePlanDir(planDir, request,
options)` in `src/maintenance.ts` and `npm run curate`; `PlanData.curationLog?`
records every applied curation; `redoSession` is now a thin wrapper.

## Build and test commands

There is no build step. `vitest` transpiles TypeScript on the fly, and
`scripts/generate.ts` and `scripts/verify.ts` run under Node's
`--experimental-strip-types`. That is why relative imports inside `src/`
carry an explicit `.ts` extension: Node's ESM resolver requires it.

- `npm run generate -- <plan.json> [baseDir]` — generate mode: validate, verify
  and render a plan the skill produced (prints a JSON summary; `baseDir`
  defaults to `plans/`)
- `npm run verify -- <planDir>` — verify mode: re-check every URL in an
  existing plan directory and rewrite its `plan.json` and `index.html` in
  place (never allocates a new directory)
- `npm run redo -- <planDir> <sessionNumber> <replacement.json>` — redo mode
  (a one-line alias for `npm run curate` with a `redo-session` request):
  splice one replacement session into an existing plan directory, verify only
  that session's links, and rewrite `plan.json` and `index.html` in place.
  The other thirteen sessions, browser progress, and the directory name all
  survive untouched.
- `npm run curate -- <planDir> <request.json>` — curation mode: apply a
  `drop-as-known`, `swap-material`, or `redo-session` request and write the
  result back into the same directory. A refused curation leaves the
  directory byte-identical; the printed JSON names every refusal reason and
  the stage it failed at (`request`, `merged-plan`, or `verification`).
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
  modules, so tests stay offline and deterministic. The one deliberate
  exception is the end-to-end demo in `tests/generate.test.ts`, which uses the
  real `fs` adapter against a temp directory: its whole point is that a plan
  directory lands on disk, which a stub cannot show.
- Client-side behavior is tested through the renderer seam by loading the
  output into a DOM (`jsdom`, `runScripts: 'dangerously'`) and driving it —
  there is no separate seam for the page's JavaScript.
- Fixture plans must be deterministic (fixed timestamps), so re-render
  assertions are stable.

## Architecture notes

- `.claude/skills/study-plan/SKILL.md` — the `/study-plan` skill: the planning
  intelligence (DISSS, CAFE, scope honesty, sourcing policy) and the only place
  plan prose is authored.
- `src/plan-types.ts` — the plan data model (meta, scope note, DISSS preamble,
  stakes, phases, sessions with their CAFE fields, materials, verification
  records, outlier stories with their own `verification` records, the
  optional `deliverableTemplate`, and the optional `curationLog` carrying
  every applied curation verbatim so a later undo can restore what was
  replaced), plus `CONSOLIDATION_SLOTS` and `ALREADY_KNOWN_MARKER` — the
  single homes of the consolidation-slot policy and the marker a
  drop-as-known curation appends to `meta.currentLevel`, which error
  messages and docs derive from rather than restate.
- `src/renderer.ts` — Seam 1: `renderPlan(plan): string`. A templated
  session's detail renders a fillable form with a per-template "Download
  deliverable" button; learner answers live in the page's progress store
  under `deliverables[session][field]`, never in `PlanData`. The renderer
  ignores `curationLog` — curations render exactly like any other session
  or material.
- `src/slug.ts` — `slugify(subject): string` for naming each plan's directory.
- `src/curation.ts` — `applyCuration(plan, request): PlanData`. A pure
  function that applies one of three curation intents (`drop-as-known`,
  `swap-material`, `redo-session`) and returns the new plan, or throws
  `CurationRefusedError` with every refusal reason and the stage
  (`request`, `merged-plan`, or `verification`) it failed at. No I/O, no
  `Date`, no mutation. The original session or material that was replaced
  is preserved verbatim on the appended log record so a later undo can
  restore it. Also defines the request types (`CurationRequest` and its
  three variants), `CurationOutcome`, and `CurationRefusedError`.
- `src/publisher.ts` — `publisherKey(url): string | null`, a pure function
  that maps a material URL to the publisher the per-publisher cap counts.
  Reduces subdomains to the registrable domain (`cdn.cboe.com` =
  `www.cboe.com`), names the tenant on multi-tenant hosting platforms
  (`ranaroussi.github.io`, `github.com/vollib`), and returns `null` for video
  hosts whose URL does not identify the channel (YouTube, Vimeo). Also
  exports `isForumHost(url)` for the practitioner-tier forum tripwire.
- `src/duration.ts` — `measureConsumptionMinutes(url, body): DurationMeasurement | null`,
  a pure function that maps a fetched body to consumption time in minutes.
  Three bases in precedence order: `video-metadata` (ISO-8601 duration in
  `<meta itemprop="duration">`, JSON-LD `"duration":"PT…"`,
  `<meta property="og:video:duration">`, or player JSON `lengthSeconds`),
  `stated-read-time` (`N min read` / `N-minute read` / `Reading time: N min`),
  and `word-count` (the first `<main>`/`<article>`'s words at 200 wpm, with
  `<script>`, `<style>`, `<noscript>`, `<template>` and `<svg>` blocks
  stripped; fewer than 100 words returns `null`). Paid materials and PDFs
  short-circuit to `null` so the shell never makes a second request.
- `src/validation.ts` — `validatePlan(plan): string[]`. Every error is
  reported, not just the first. This is the boundary where generated or
  hand-edited JSON becomes trusted data, so its runtime type checks are
  load-bearing rather than redundant with the `PlanData` type. Enforces the
  per-publisher cap (`MAX_URLS_PER_PUBLISHER = 4`, one error per offending
  publisher, sessions listed ascending and deduped), rejects practitioner
  tier on known forum hosts, and type-checks the measurement fields
  (`measuredDuration` positive number; `measuredBy` one of the three
  bases; both-or-neither).
- `src/verification.ts` — Seam 2: `verifyPlan(plan, { fetch, searchReplacement, anchorUrls?, now?, keepOutlierStoriesOnFailure?, sessionNumbers?, materialUrls?, noSubstitution? })`.
  Returns a new plan with refreshed verification records plus a report.
  Replaces failed links via `searchReplacement` up to two attempts per
  slot, then records the slot `unresolved-after-retries`. Outlier-story
  citations are recorded on the story as `verification` records; when
  `keepOutlierStoriesOnFailure` is set (maintenance mode), a story whose
  citation fails is kept with `verification.status = 'unresolved-after-retries'`
  rather than silently removed, so rot is visible on the page. When
  `sessionNumbers` is set, only those sessions' materials are fetched and
  re-timestamped; other session objects (and outlier-story citations) pass
  through unchanged, which is what single-session redo relies on. When
  `materialUrls` is set, only materials whose URL is in the set are
  fetched inside the selected sessions; others pass through with their
  records intact — used by single-material curation. When `noSubstitution`
  is set, `searchReplacement` is not consulted on failure; a single fetch
  attempt is made and a failed candidate is recorded as
  `unresolved-after-retries` — used by swap-material on the url path, so
  a learner-supplied URL is admitted on its merits or refused. Content
  verification (fetch the body, confirm it covers the claimed concept)
  applies to every non-`preferred` material and to every anchor — i.e.
  `sourceType !== 'preferred' || isAnchor`. **Measurement**: every material
  that verifies is measured from the body verification already fetched, the
  measurement is recorded on the material's verification record
  (`measuredDuration`, `measuredBy`), and mismatches (`isDurationMismatch`
  in `plan-types.ts`) are collected into `report.durationWarnings`.
  Paid materials, PDFs and unmeasurable bodies record nothing and warn
  nothing; measurement never changes a verification status, never triggers
  a replacement search, and never throws (a body that cannot be read on a
  status-only material leaves the material verified and unmeasured).
- `src/generate.ts` — `generatePlan(plan, baseDir, { fetch, searchReplacement, now?, fs? })`.
  Validates, verifies, then writes `plan.json` and `index.html` into
  `baseDir/<slug>/`, falling back to `<slug>-2`, `-3`, … when that directory
  already exists so regeneration never destroys a learner's progress. Throws
  `ValidationFailedError` before touching disk when validation fails. `fs`
  defaults to Node's `fs/promises`; inject a stub in tests.
- `src/maintenance.ts` — `reverifyPlanDir(planDir, { fetch, searchReplacement, now?, fs? })`.
  Reads the existing `plan.json`, validates it, re-runs `verifyPlan`, validates
  the result, then writes the refreshed `plan.json` and `index.html` into the
  **same** directory. The directory name is never suffixed, so a learner's
  browser progress (keyed by session number) survives untouched. Unresolved
  materials keep their original title and URL with status
  `unresolved-after-retries`; the renderer surfaces the warning. Also exports
  `curatePlanDir(planDir, request, options)` which reads the existing
  `plan.json`, validates it, runs `applyCuration` (a pure function),
  validates the merged plan, re-verifies only the targeted session (and
  on the swap-material url path, only the swapped URL with
  `noSubstitution` so a learner-supplied URL is either admitted or refused),
  validates the verified plan, and writes both files in place. Refusals at
  any stage leave the directory byte-identical. `redoSession(planDir,
  sessionNumber, replacement, ...)` is now a thin wrapper that builds a
  `RedoSessionRequest` (with `at` from `options.now?.() ?? new Date()
  .toISOString()`) and calls `curatePlanDir`, keeping its number-mismatch
  error message verbatim so the existing CLI and tests pass unchanged.
- `scripts/generate.ts` — the command behind `npm run generate`. Wires the real
  `fetch` into `generatePlan` and prints a JSON summary. Link replacement is
  deliberately not implemented here: re-sourcing a dead link is judgement work,
  so unresolved slots are reported back to the skill, which re-sources and
  re-runs.
- `scripts/verify.ts` — the command behind `npm run verify`. Wires the real
  `fetch` into `reverifyPlanDir` and prints a JSON summary in the same shape
  as generate mode.
- `scripts/redo.ts` — the command behind `npm run redo`. Wires the real
  `fetch` into `redoSession` and prints a JSON summary in the same shape as
  generate mode. The replacement is read from a JSON file (HTML is rejected
  with a JSON error), and the supplied session number must match
  `replacement.number` for the call to make it past argument validation.
- `scripts/curate.ts` — the command behind `npm run curate`. Wires the real
  `fetch` into `curatePlanDir` and prints a JSON summary shaped like
  `{ ok: true, planDir, planPath, htmlPath, intent, sessionNumber,
  unresolved, durationWarnings }` on applied, or `{ ok: false, refused,
  stage }` / `{ ok: false, validationErrors }` / `{ ok: false, error }`
  on the three refusal shapes. The request is read from a JSON file (HTML
  is rejected with a JSON error) and `at` is filled with the current time
  when omitted.
- `scripts/proxy-preload.mjs` — `--import`ed by all three commands above.
  Node's `fetch` ignores `HTTP_PROXY`/`HTTPS_PROXY`, so on a machine that only
  reaches the web through a local proxy every link check fails with a DNS or
  connect error while `curl` succeeds. The preload installs undici's
  `EnvHttpProxyAgent` when a proxy variable is set and is a no-op otherwise.

## Security considerations

- No secrets, no network calls in the deterministic layer.
- HTML escaping of all data is the XSS guard for the hand-edit workflow.
