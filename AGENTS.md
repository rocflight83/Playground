# AGENTS.md

## Project overview

Deterministic shell for an "Ultralearning Study Plan Generator" Claude Code
skill. The intelligence (plan prose, source discovery) lives in the skill's
prompt design; the code here is a thin, deterministic layer that turns
structured **plan data** into a single self-contained HTML page and, later,
verifies links. The generator never emits HTML directly — data and rendering
are strictly separated.

Current state: tickets 01–16 are in place — the renderer seam, progress
state, validation + verification, generate mode, sourcing depth
(tiered discovery with off-list admission), scope honesty (a reframed
target and its scope note are validated as a pair and rendered together),
outlier stories (real, citable, removable when uncited),
verify-on-demand mode (`src/maintenance.ts` + `npm run verify`), per-session
redo mode, source breadth (publisher cap + practitioner tier), honest
material durations, deliverable templates, the curation intent model
(`drop-as-known`, `swap-material`, `redo-session` with the fs-free
`curatePlan` extracted to `src/curation.ts`), and the shared
`prompts/policy.md` policy that makes the `/study-plan` skill a thin
front door. Ticket 17 adds the app's core under `src/app/`: a
provider-neutral `PlanStore` seam with `FilePlanStore` and
`MemoryPlanStore` adapters, an `Intelligence` seam with a `ScriptedIntelligence`
test double, a `withLimits` helper (`src/app/limits.ts`) that wraps a
fetcher with a per-call timeout and a counting semaphore, and a `Planner`
that owns the generate / curate / verify workflows as jobs with the
lifecycle `requested → sourcing → verifying → applied | refused | failed`.
A single in-flight job per plan is enforced (`PlanBusyError`); frame
refusals cost no intelligence call (the `checkCurationRequest` seam in
`src/curation.ts`); the `searchReplacement` callback is wired to
`intelligence.findReplacementUrl`. Ticket 18 puts the HTTP surface over
this — `src/app/server.ts` (`createApp`: plan list, **live page**, export
and the JSON API), the curation layer in `src/app/live/`, and `npm run
app` — with progress for the live page kept in the store through the
`window.StudyPlanStore` seam in the page script. Ticket 19 (#30) adds the
first real provider adapter, `createXaiIntelligence` in
`src/app/intelligence-xai.ts` (xAI via the `openai` client, Responses
API, server-side `web_search` + `x_search`, structured output from the
hand-written schemas in `src/app/plan-schema.ts`), `loadPrompts` in
`src/app/prompts.ts`, the unfetchable-host rule (an X post is never a
material: `isUnfetchableHost` in `src/publisher.ts`, enforced by
`validatePlan`, explained in `prompts/policy.md`), `npm run dry-run`, and
the `plans/.usage.log` usage log. Claude (#29) is the fallback adapter,
built only if a dry-run tripwire fires. Ticket 12 adds source breadth:
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
Ticket 16 makes the planning policy provider-neutral: `prompts/policy.md`
is the shared intelligence policy (honest-target test, DISSS, the session
shape, the sourcing rules, the Preferred / Practitioner source lists);
`prompts/generate.md`, `prompts/replace-session.md` and
`prompts/replace-material.md` are the path-specific duties. The
`/study-plan` skill becomes a thin front door that reads them; the local
app's `Intelligence` adapter will read the same files.

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
- `npm run app` — the local app on `http://127.0.0.1:4321/` (`PORT` to
  change): plan list, live page, export and API over the plans in `plans/`.
  `STUDY_PLAN_INTELLIGENCE` picks the adapter: `xai` (the default when
  `XAI_API_KEY` is set) or `scripted` (the default otherwise), which has
  no provider behind it, so generate and curate jobs fail with "no
  provider configured" while everything else works. `claude` is reserved
  for #29 and fails until it is built.
- `npm run dry-run -- <subject> <level> <hours> <target>` — the provider
  dry run: one generate, one drop-as-known (session 3) and one
  swap-material (session 4, "want a practitioner take") through the
  Planner against the live xAI API, printing wall time, tokens, tool
  calls by kind, list-price cost and what xAI billed, outcome and
  unresolved count per step, then the decision-8 tripwires from #30
  (cost uses the billed figure when the responses carry it). Writes the
  plan to `plans/` like any generate. Run once, by hand, with the
  human's key.
- **Environment.** `app` and `dry-run` pass `--env-file-if-exists=.env`
  (Node ≥ 22.9; no `dotenv`), so `.env` at the repo root may hold
  `XAI_API_KEY=…`. `.env` is git-ignored, but the repo folder is
  OneDrive-synced, so treat a key that lands there as one you can rotate.
  The key is never pasted into an issue, a commit or a chat. Every xAI
  call appends one JSON line (`{ at, call, model, inputTokens,
  outputTokens, cacheReadTokens, toolCalls, billedUsd?, ms }`) to
  `plans/.usage.log` (git-ignored with `plans/`); `billedUsd` is what xAI
  billed (`usage.cost_in_usd_ticks / 1e10`) when the response says.
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
  This binds `renderPlan` and the export. The **live page** the app serves
  is that same output with one layer spliced in (`/live.css`, `/live.js`
  and the progress JSON, all same-origin from the app) — the one relaxation
  of the rule, and the layer is the only code that talks to the API.
- The page script's storage goes through `getStorage`/`saveStorage`, which
  consult `window.StudyPlanStore` (`{ load(), save(data) }`) at call time
  and fall back to `localStorage`. The live layer defines it; the export
  never does. Nothing else in the script knows where progress lives.

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

- `prompts/` (repo root) — the planning intelligence's shared policy and
  duty files, read by every prompt. `prompts/policy.md` carries the
  honest-target test, DISSS, the session shape and CAFE rules, the sourcing
  policy (two-lane search, per-publisher cap, practitioner tier, off-list
  bar, anchors, paid-material rule, consumption-time durations,
  deliverable-template rule, outlier-story rule), and the Preferred /
  Practitioner source lists. `prompts/generate.md`,
  `prompts/replace-session.md` and `prompts/replace-material.md` are the
  path-specific duties. The policy files contain no commands and no
  `plan.json` references — those live in the front door.
- `.claude/skills/study-plan/SKILL.md` — the `/study-plan` skill, a thin
  front door: frontmatter, inputs, the operational sections (how to write
  the plan data, run the shell commands, read their JSON summaries), and
  the curation request shapes with pointers at `prompts/replace-session.md`
  and `prompts/replace-material.md`. The policy itself lives in
  `prompts/`; the front door and the local app's `Intelligence` adapter
  both read it.
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
  three variants), `CurationOutcome`, `CurationRefusedError`, and the
  fs-free `curatePlan(plan, request, options)` core `curatePlanDir`
  uses (and the Planner uses). `checkCurationRequest(plan, request)`
  surfaces the structural refusals at stage `request` so the Planner's
  frame check costs no intelligence call.
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
  `curatePlanDir(planDir, request, options)` which is read + `curatePlan`
  (from `src/curation.ts`) + write: read the existing `plan.json`, validate
  it, run `applyCuration` (a pure function), validate the merged plan,
  re-verify only the targeted session (and on the swap-material url path,
  only the swapped URL with `noSubstitution` so a learner-supplied URL is
  either admitted or refused), validate the verified plan, and write both
  files in place. Refusals at any stage leave the directory byte-identical.
  `redoSession(planDir, sessionNumber, replacement, ...)` is a thin wrapper
  that builds a `RedoSessionRequest` (with `at` from `options.now?.() ??
  new Date().toISOString()`) and calls `curatePlanDir`, keeping its
  number-mismatch error message verbatim so the existing CLI and tests
  pass unchanged.
- `src/app/plan-store.ts` — the persistence seam the Planner uses. A
  `PlanStore` interface (`list`, `read`, `create`, `write`,
  `readProgress`, `writeProgress`) with `FilePlanStore(baseDir, { fs? })`
  for production and `MemoryPlanStore()` for tests. `create` allocates
  the directory and seeds `plan.json`; `write` validates, renders and
  writes `plan.json` and `index.html` together, so the file:// export
  always matches the data — nothing else in the app writes plan files.
- `src/app/intelligence.ts` — the provider-neutral seam for whoever
  produces plan prose and replacements. The `Intelligence` interface
  declares `generatePlan`, `replaceSession`, `replaceMaterial`, and
  `findReplacementUrl`. Return types are `unknown` so the Planner trusts
  nothing until `validatePlan` has accepted it. `ScriptedIntelligence`
  is the test double: each method dequeues the next scripted answer
  (or `{ throw }`) and records every call so a test asserts on
  sequence rather than the network. `UnavailableIntelligence` is what
  the app runs without a provider: generate / replace calls throw
  `IntelligenceUnavailableError` (a `failed` job with that message);
  `findReplacementUrl` answers `null` so verify jobs still run.
- `src/app/intelligence-xai.ts` — `createXaiIntelligence(opts): Intelligence`,
  the xAI adapter. `instructions` = `prompts/policy.md` + the call's duty
  file; the call's context (brief, plan, session, computed units,
  `budget`, `responseSchema`) is one user message whose text is JSON —
  no prompt prose lives in TypeScript. The call's schema from
  `plan-schema.ts` (`plan`, `session_replacement`, `material`,
  `replacement_url`) is a shape hint for the model, never a gate: answers
  come back as `unknown` and `validatePlan` stays the only truth. Where
  the schema goes is `schemaChannel`: `context` (default) puts it in the
  user JSON as `responseSchema` and sends no `text.format`; `format` is
  decision 4's original `text.format` json_schema (with `strictSchema`).
  The default was switched on the #30 dry run: under `text.format`,
  strict or not, `grok-4.6` answered every call with a placeholder
  skeleton while drafting the real document in its reasoning; the same
  request without it produced full, searched, valid answers.
  `store: false` and `stream: true` on every request — a generate runs
  for minutes and the proxy this machine reaches the web through drops
  any connection idle for 60 s, so the event stream keeps it alive; the
  adapter reads only the terminal event's response. Repair rounds resend
  the previous attempt and its errors as a further user message. One
  combined tool-call cap per call kind (`maxToolCalls`, default
  30 / 8 / 3) is sent as xAI's `max_turns` and repeated in the user
  JSON's `budget`; `x_search` is offered per `xSearch` (`generate` —
  generate and replaceMaterial only, the default; `sourcing`; `off`).
  The answer is the last complete JSON document in the output text
  (prose, fences and a leading placeholder skeleton are skipped). An
  `incomplete` or `failed` response, a stream `error`, a stream with no
  terminal event, or text with no JSON document throws
  `IntelligenceError` naming the reason; client errors propagate.
  `onUsage` gets one record per call, with `billedUsd` when xAI reports
  it. The client is injected as the narrow `XaiClient` (`create` returns
  the event stream); `xaiClientOf` is the single cast from `OpenAI`. The
  adapter never verifies links.
- `src/app/plan-schema.ts` — `PLAN_SCHEMAS`, the hand-written JSON
  schemas mirroring `plan-types.ts`. When `plan-types.ts` changes this
  file changes with it: `tests/plan-schema.test.ts` walks a fixture plan
  carrying every optional field and fails on any key the schema does not
  name, and checks xAI's strict-mode rules so `strictSchema` can be
  switched on. `zod` is declared in `package.json` but unused in `src/`;
  do not introduce it here.
- `src/app/prompts.ts` — `loadPrompts(dir = 'prompts')` reads the four
  prompt files once; the adapter itself never touches the filesystem.
- `src/app/limits.ts` — `withLimits(fetch, { timeoutMs, concurrency })`
  wraps a `FetchLike` with `AbortSignal.timeout` and a counting
  semaphore. The shell's `verifyPlan` has neither today and must not
  grow them — they are the caller's concern. `withLimits` is exported
  so ticket 18 and the CLI scripts can adopt it; default timeout is 15 s
  and default concurrency is 4.
- `src/app/planner.ts` — the only module with a workflow. `Planner` owns
  the generate, curate and verify jobs and exposes them through
  `planner.generate(brief)`, `planner.curate(planId, request)`, and
  `planner.verify(planId)`. Every job moves through the lifecycle
  `requested → sourcing → verifying → applied | refused | failed`; one
  in-flight job per plan is enforced (`PlanBusyError`). The Planner
  wraps the verification `fetch` in `withLimits` and wires
  `searchReplacement` to `intelligence.findReplacementUrl`. Generate
  runs up to two repair rounds when `validatePlan` rejects the
  intelligence's answer, passing the prior attempt and errors back; a
  third failure ends in `failed`. Curate runs the frame check first
  (frame refusals cost no intelligence call) and then assembles the
  full `CurationRequest` once the intelligence has returned. The
  Planner never re-implements `validatePlan`, `verifyPlan`, `renderPlan`,
  or `applyCuration` — it orchestrates the shell.
- `src/app/server.ts` — `createApp({ planner, store, live }): (req, res) => void`,
  a plain `http` request handler (tests drive it on an ephemeral port).
  Pages: `GET /` (plan list with a "New plan" form), `GET /plans/:id` (the
  live page: `renderPlan(plan)` with the layer spliced in immediately
  before the page's own `<script>`, so `StudyPlanStore` exists when that
  script seeds the page), `GET /plans/:id/export` (`renderPlan(plan)` byte
  for byte, as an attachment), `GET /live.js`, `GET /live.css`. API under
  `/api/`: plans (list, read, `POST` brief → generate job, `POST import`),
  curations and verify (`202 { jobId }`, `409` when the plan is busy),
  jobs (`GET /api/jobs/:id`, `GET /api/plans/:id/jobs` newest first) and
  progress (`GET`/`PUT`, object bodies only). Every `/api/*` answer is
  JSON, errors included; bodies over 2 MB are `413`. `renderLivePage` is
  exported for the page tests.
- `src/app/live/live.js` + `live.css` — the curation layer, plain browser
  JS and CSS served as-is (no build). Defines `window.StudyPlanStore`
  seeded from `#live-progress` and saves with a 500 ms debounce (flushed
  with `keepalive` on `pagehide`, so Import Progress and the reload on
  `applied` lose nothing). Curate mode (masthead toggle) adds a rail per
  session and a swap control per material — #19's variant C as
  prototyped (#31): two 30 px icon buttons, ✓ and ↻, hanging off the
  top-left of the session box in its 44 px gutter (a row inside the box
  under 640 px, where the renderer drops the gutter), and a ⇄ icon per material, all named by
  `aria-label`/`title`; requests post to the API and
  are followed in the request tray by polling `GET /api/jobs/:id`;
  `applied` reloads the page. "Previously:" folds come from
  `curationLog`; a swapped material is marked on its row only when the
  record carries `suppliedUrl` (the record has no other pointer to the
  replacement), otherwise the fold sits at the top of the session detail.
  Data reaches the DOM only through `textContent`/`setAttribute`; classes
  are prefixed `live-`.
- `scripts/app.ts` — the command behind `npm run app`. Wires
  `FilePlanStore('plans')`, the intelligence `wire-intelligence.ts`
  picks, the real `fetch`, and the live layer's files read at startup;
  binds `127.0.0.1` only.
- `scripts/wire-intelligence.ts` — shared by `app` and `dry-run`:
  `pickIntelligence(env)` maps `STUDY_PLAN_INTELLIGENCE` (`xai` /
  `scripted` / reserved `claude`) to an adapter — for `xai`, `new
  OpenAI({ baseURL: 'https://api.x.ai/v1', apiKey })` through
  `xaiClientOf`, `loadPrompts()`, and `usageLogger` appending to
  `plans/.usage.log`.
- `scripts/dry-run.ts` — the command behind `npm run dry-run`. Runs the
  Planner directly (no server) through the three steps above, prices
  each from a dated `RATES` constant (#13's list prices) beside the
  billed total from the usage records, and evaluates the decision-8
  tripwires (a–c; d is the human's) on the billed figure when known.
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
- `scripts/proxy-preload.mjs` — `--import`ed by every command above.
  Node's `fetch` ignores `HTTP_PROXY`/`HTTPS_PROXY`, so on a machine that only
  reaches the web through a local proxy every link check fails with a DNS or
  connect error while `curl` succeeds. The preload installs undici's
  `EnvHttpProxyAgent` when a proxy variable is set and is a no-op otherwise.

## Security considerations

- No secrets, no network calls in the deterministic layer. The only
  network callers are the verifier's injected `fetch` and the xAI
  adapter's injected client; tests fake both.
- HTML escaping of all data is the XSS guard for the hand-edit workflow.
