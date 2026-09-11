# 07: Outlier stories

**What to build:** Render an optional, documented outlier story at each phase
boundary. A story contains a real person or case, the unusual approach, the
transferable principle, and a citation URL. Subject-specific examples are
preferred; a documented general example is acceptable when no subject-specific
example can be found.

The hard rule is: no verified citation, no story. Do not invent a story,
replace it with a composite, or render an empty placeholder.

**Blocked by:** 04

**Spec:** `.scratch/study-plan-generator/spec.md`

**User stories covered:** 39, 40, 41, 42, 43, 44

**Status:** ready-for-agent

## Scope

This ticket has four deliverables:

1. The renderer shows a phase's `outlierStory` immediately after that phase's
   band and before its first session.
2. Validation rejects malformed story fields and malformed citation URLs.
3. The verification path checks story citations. A citation that cannot be
   fetched is removed from the returned plan, so the phase renders without a
   story rather than showing an unverified claim.
4. The `/study-plan` sourcing instructions tell the planning agent when to
   add a story and when to omit one.

Do not add a new story field, a story per session, a placeholder component, or
network access to the renderer. `Phase.outlierStory` already exists in
`src/plan-types.ts`; use that contract.

## Rules for the handoff

- Read `AGENTS.md`, this ticket, `src/plan-types.ts`, `src/renderer.ts`,
  `src/validation.ts`, `src/verification.ts`, and the fixture before editing.
- Follow the repository convention: tests assert rendered behavior and return
  values, and network behavior uses injected fetch functions.
- A renderer test must prove the story is at a phase boundary, not merely that
  its text occurs somewhere in the HTML.
- Preserve the existing `VerificationReport.outcomes` meaning for material
  outcomes. If story citation outcomes are added, give them an explicit
  discriminator and test it; do not pretend a story is a session material.
- Keep rendering pure and escape every story value with `esc(...)`.
- Run `npm run typecheck` after source edits and `npm test` before handoff.

## Step 0 — baseline

Run:

```text
git status --short
npm run typecheck
npm test
```

Record the passing test count. If tracked files are already modified, stop and
report the paths; do not revert them.

Completion criterion: the baseline typecheck and full suite pass, and the
working-tree situation is recorded.

## Step 1 — write failing tests

Add tests to the existing renderer, validation, and verification test files.
Use a cloned fixture when removing or changing its story.

The tests must cover:

- A fixture phase with a story renders the person's name, approach, principle,
  and citation after the phase band and before that phase's first session.
- A cloned plan with `outlierStory` deleted renders no story block for that
  phase and no placeholder text.
- Story text containing `<` or `&` is rendered as text, not markup.
- Missing `person`, `approach`, `principle`, or `citation` produces a
  validation error.
- A citation that returns `ok: true` is retained; a citation whose fetch
  fails or returns non-OK is absent from the returned phase.
- Verification still checks every material and still reports material
  outcomes exactly as before.

Run each focused test file. The new behavior tests must fail before the
implementation is added. Existing tests must continue to pass.

Completion criterion: the red tests fail for the intended missing behavior,
not because of a TypeScript error or malformed test.

## Step 2 — render the story

In `src/renderer.ts`, extend `renderPhaseBand` or add a small pure helper so
the phase output is:

```text
phase band
optional story block
phase sessions
```

The story block should visibly label the person, unusual approach, principle,
and citation. The citation must be an escaped `href` and escaped link text.
Use the existing phase/session rendering loop; do not reorder sessions or
create a second phase loop. Omit the entire block when `outlierStory` is
absent.

Completion criterion: the focused renderer tests pass, including boundary
ordering, omission, and escaping; `npm run typecheck` is clean.

## Step 3 — validate and verify citations

In `src/validation.ts`, retain the existing required-field checks and add a
runtime URL check for a present citation. Use the same URL policy already used
for material URLs. Report every malformed story field; do not stop at the
first error.

In `src/verification.ts`, check each present phase citation with the injected
`fetch`. Do this in the same verification call as materials and return a new
plan; never mutate the input. A story citation that throws, returns `ok: false`,
or cannot be confirmed should be omitted from the returned phase. A healthy
citation leaves the story unchanged. Do not silently remove a story before
validation: a malformed input story must still be rejected by validation.

Keep timestamps deterministic through the existing `now` option. If the
report needs story outcomes, add a typed discriminator such as
`kind: 'material' | 'outlier-story'`; update only the tests and callers that
consume that report. Never assign a story a fake `sessionNumber`.

Completion criterion: focused validation and verification tests pass, the
input plan is unchanged after verification, and no story citation is fetched
outside the injected dependency.

## Step 4 — update planning instructions

In `.claude/skills/study-plan/SKILL.md`, strengthen the existing outlier-story
paragraph with this procedure:

- Look for a real, named person or documented case that used an unusual route.
- Prefer a subject-specific source; use a general documented case only when a
  subject-specific case is unavailable.
- Record the approach and the principle separately.
- Put at most one story on a phase, at the phase boundary.
- Add the story only when its citation is a working URL that will pass the
  generator's verification.
- If no such source exists, omit `outlierStory` entirely.

The skill writes plan data only; it never writes HTML.

Completion criterion: the skill text makes omission the explicit outcome when
no citable story exists, and its field names match `PlanData` exactly.

## Step 5 — full verification and bookkeeping

Run:

```text
npm run typecheck
npm test
```

Then update this ticket: check every acceptance item, change status to `done`,
and append a dated `## Comments` entry summarizing the renderer, validation,
verification, and skill changes. Update GitHub issue 7's label and close it
only if `gh` is installed and authenticated; otherwise report that it was
skipped.

Do not commit unless the human explicitly asks for a commit. Report changed
files and the final test count.

## Definition of done

- Stories render only when present and appear between their phase band and
  phase sessions.
- Every rendered story value is escaped.
- Invalid stories fail validation; unverified citations are omitted from the
  verified plan without affecting material verification.
- The skill creates stories only from real, citable cases and otherwise omits
  them.
- Typecheck and the full test suite pass.

## Comments
