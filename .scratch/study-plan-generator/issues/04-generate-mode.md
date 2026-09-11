# 04: Generate mode — well-served subjects

**What to build:** I run one command with a subject, my current level, my available hours per day, and the specific capability I am targeting, and I get back a real, usable plan written to its own directory, with no further questions asked of me.

The generator does the Deconstruction, Selection and Sequencing for me and shows its work — the minimal effective units it found, what it deliberately cut, and why the sessions run in the order they do, naming the endgame it started from or explaining why the subject is prerequisite-chained and must run forward. The 14 sessions each carry one compressed material set, one named artifact, and one binary self-check, sized to the hours I said I have. Sessions 6 and 11 are consolidation slots serving as catch-up when I am behind and spaced review when I am not. The generated plan is then validated, verified and rendered by the machinery from tickets 01–03.

**Scope boundary:** materials are drawn from the preferred durable tier only. Off-list source admission, anchor-resource depth and the paid item are ticket 05's job. That keeps this ticket to plan construction, and it is why the demo subject should be one the durable tier already serves well.

This is still the heaviest ticket and is mostly prompt design. Expect more than one pass.

**Blocked by:** 02, 03.

**Spec:** `.scratch/study-plan-generator/spec.md`

**User stories covered:** 1, 2, 3, 4, 8, 9, 10, 11, 12, 13, 14, 16, 18, 19, 20, 21, 22, 23, 24, 25.

**Status:** done

- [x] A single command takes subject, current level, hours per day, and target capability, and completes without asking further questions
- [x] Each plan is written to its own directory identified by a slug derived from the subject, so plans accumulate without collision
- [x] The plan data is generated first and the page rendered from it; the generator never writes HTML
- [x] The DISSS preamble presents the deconstruction into minimal effective units, the selection rationale including what was cut, and the sequencing rationale
- [x] The sequencing rationale explicitly records whether the plan runs backwards from an endgame or forwards through a prerequisite chain, and why
- [x] DISSS appears as a preamble, not as sessions — no session is spent on meta-work
- [x] Exactly 14 numbered sessions, no calendar dates
- [x] Sessions 6 and 11 are consolidation slots, identifiable as such, whose content serves both catch-up and spaced review
- [x] Every session has exactly one named artifact and exactly one self-check whose answer is unambiguously yes or no
- [x] Each session's materials are tied to that session's artifact, compressed to the minimum that supports it, and carry estimated durations
- [x] Each session's total time budget is consistent with the stated hours per day
- [x] CAFE shapes the daily blocks: compression, repetition of the highest-frequency units across sessions, and encoding hooks where the material benefits
- [x] Materials come from the preferred durable tier only; no off-list sources in this ticket
- [x] Generation runs validation and verification before writing, and refuses to write a plan that fails validation
- [x] Demo: a subject well covered by durable sources produces a site that is genuinely usable end to end

## Comments

Implemented the deterministic shell for the generator: the Claude skill
prompt remains the source of the planning intelligence, and the code is a
thin layer that turns the plan it produces into a self-contained,
slug-named plan directory. Per the ticket preamble this is "mostly
prompt design" — the deterministic contributions are concentrated in
four pieces, all behind the seams the rest of the project already uses.

- `src/slug.ts` — `slugify(subject): string`. Lowercases, collapses
  non-alphanumerics to dashes, trims edge dashes, and falls back to
  `plan` when the subject produces nothing usable (so a learner who types
  only punctuation still gets a writable directory).
- `src/generate.ts` — `generatePlan(plan, baseDir, { fetch, searchReplacement, now?, fs? })`.
  Validates first, refuses to touch disk on failure
  (`ValidationFailedError` carries every error, not just the first),
  then runs verification via the existing `verifyPlan` seam, then writes
  `plan.json` (the verified plan data) and `index.html` (rendered from
  that data) into `baseDir/<slug>/`. `fs` defaults to `node:fs/promises`
  and is injectable so tests stay offline and deterministic.
- `src/plan-types.ts` — added `Session.consolidation?: boolean` and
  exported `CONSOLIDATION_SLOTS = new Set([6, 11])` as the single place
  the consolidation-slot policy lives. `src/validation.ts` enforces it
  positionally (a session marked consolidation must be at 6 or 11; a
  session at 6 or 11 must be marked consolidation), so an off-position
  consolidation fails the gate.
- `src/renderer.ts` — sessions whose `consolidation` is true now render
  a `Consolidation` badge in the summary row and carry a
  `data-consolidation="true"` attribute on the section, so they are
  identifiable in the DOM and the page.

The fixture (`tests/fixtures/plan-fixture.ts`) was reshaped to be the
issue 04 demo: durable tier only (no off-list), with sessions 6 and 11
restyled as catch-up / spaced-review slots whose artifact, self-check
and materials all serve the dual purpose. The
`sequencingRationale` was rewritten to explicitly state the plan runs
backwards from the endgame of shipping a CLI tool and why. All four
verification states are still exercised by the fixture, session 12
still carries the unresolved material that drives the warning test,
and the lone paid material on session 2 still drives the price test,
so the verification and renderer suites remain in their previous
shape.

Time-budget consistency is now an enforced invariant: validation
rejects any session whose `estimatedTime` exceeds
`meta.hoursPerDay * 60` minutes, so a plan whose per-day sessions are
sized larger than the learner's stated hours cannot be written.

Tests: 21 new across `tests/slug.test.ts` (8) and `tests/generate.test.ts`
(8 generatePlan + 1 end-to-end demo), plus additional cases in
`tests/validation.test.ts` (3: consolidation positional checks plus
time-budget) and `tests/renderer.test.ts` (1: consolidation badge
visible on sessions 6 and 11, absent elsewhere). Full suite: 75 tests
passing, `tsc --noEmit` clean.

Code review surfaced one real concentration problem: the consolidation
slot policy was hardcoded as `6 / 11 / [6, 11]` across five files
(plan-types, validation, the fixture, and three test files). Fixed by
adding `CONSOLIDATION_SLOTS` to `plan-types.ts` and routing validation
through it; the fixture and tests still assert the literal `[6, 11]`
values, which is the right call because changing those values is a
deliberate policy change that should require test updates.

The deterministic shell does not validate "preferred tier only" — the
generation-time constraint is the skill prompt's job, and ticket 05
introduces off-list sources as a legitimate fallback. The demo test
asserts the desired property on the resulting plan (every material is
`sourceType: 'preferred'`), which is the right place for it.
