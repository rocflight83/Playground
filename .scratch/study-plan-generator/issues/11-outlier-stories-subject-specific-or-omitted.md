# 11: Outlier stories are subject-specific or omitted

**What to build:** Tighten the outlier-story rule so the page never carries a
general-legend fallback (Thorp/Dalio/Simons on an options-system plan), and
when the skill finds no subject-specific case for a phase, render a visible
quiet placeholder at the phase boundary instead of leaving a silent gap. The
data model, validation, and verification shapes do not change.

**Blocked by:** 07

**Spec:** `.scratch/study-plan-generator/spec.md`

**User stories covered:** 41, 42, 44

**Resolves:** issue #14 (Spec: outlier stories are subject-specific or omitted)

**Status:** open

## Scope

This ticket has four deliverables:

1. The renderer emits a muted placeholder block immediately after any phase
   band whose `outlierStory` is absent, before that phase's first session.
   The placeholder is visibly distinct from a real story and states plainly
   that no subject-specific case was found.
2. The `/study-plan` skill stops accepting general-legend fallbacks: a story's
   named person/case must be in the plan's subject domain and recognisably
   about a high-frequency unit drilled in that phase, otherwise the story is
   omitted and the placeholder carries the silence.
3. A renderer test proves the absent phase renders both the placeholder and
   the boundary ordering. Validation, verification, and the existing
   present-case behavior tests continue to pass.
4. The data model does not gain a field. `Phase.outlierStory` stays optional;
   absence always renders the placeholder. Validation continues to permit an
   absent story.

Do not add a "looked-but-found-none" discriminator to `PlanData`. Do not
expand `OutlierStory` to a tri-state. Do not change the citation verification
flow or its outcome discriminators.

## Resolved spec questions (from issue #14)

### 1. What does "subject-specific" mean for the skill?

A real, named person or documented case whose unusual approach is in the
subject domain the plan targets AND is recognisably about a high-frequency
unit drilled in that phase. The diagnostic the skill uses:

- A reader who knows the plan's subject recognises this person as being in
  that subject (not a general legend from a wider field whose contribution
  is at one remove — Thorp, Dalio, Simons, Soros on an options-system plan).
- The transferable principle in the story maps cleanly onto one of the
  phase's `highFrequencyUnits`.

Both conditions must hold. A legend who happens to work in a related field
without the phase-unit alignment fails the rule, even if they are famous.

### 2. What does the phase render when the story is absent?

A muted placeholder block at the phase boundary, using the same wrapper
class so existing selectors that count `.outlier-story` nodes continue to
work:

```text
phase band
<empty outlier-story placeholder>
phase sessions
```

The placeholder is a single small paragraph in the placeholder/wash color,
no `<h3>`, no `<a>`, no fields. Plain text in the muted style:

> No subject-specific outlier case found for this phase.

The phrasing is tautological — it describes what the page does not carry,
not what the skill claims to have done. The skill may or may not have
searched; the placeholder is accurate either way. This also avoids claiming
a search took place when hand-edited `plan.json` arrives without a story.

### 3. Does `PlanData` need a field for "looked, found none" vs "not attempted"?

No. Both absence states render identically on the page (same placeholder,
same wording). Adding a tri-state (present / looked-found-none / not-attempted)
doubles the hand-edit surface for no learner-visible benefit and creates a
new validation seam the planner must always remember to set. The skill is
instructed to attempt at least one search per phase; absence always renders
the placeholder. The placeholder's phrasing never claims a search was made.

### 4. What does validation check?

Unchanged. The present case keeps its current checks (required string fields,
http(s) citation URL). The absent case stays optional — no field is required.
There is no tri-state to validate because no tri-state was added. The rule
"is this story subject-specific?" is a planning-time judgment, not a data
gate.

## Rules for the handoff

- Read `AGENTS.md`, this ticket, `src/plan-types.ts`, `src/renderer.ts`,
  `src/validation.ts`, `.claude/skills/study-plan/SKILL.md`, and the fixture
  before editing.
- Renderer remains a pure function of plan data: no module-level mutable
  state, no `Date.now()` / `Math.random()`, no I/O. The placeholder is part
  of the pure rendering path.
- Escape every value with `esc(...)`; the placeholder text is a constant
  so no escaping risk, but write it consistently with the rest of the
  renderer.
- Follow the repository test convention: assert external behavior, not
  internal helpers. Tests load the rendered HTML into a DOM and drive it.
- A renderer test must prove the placeholder sits between the phase band
  and the first session, not merely that its text occurs somewhere.
- A plan without `outlierStory` and a plan with `outlierStory: undefined`
  must render identically. Treat both as absence; do not introduce an
  "explicitly absent" field.
- Preserve the existing `Phase.outlierStory` contract. Do not rename, do
  not widen, do not split it.
- Preserve `OutlierStoryVerificationOutcome` and the citation-verification
  behavior of #07. The placeholder is the empty-card affordance, not a
  failure path.
- Run `npm run typecheck` after source edits and `npm test` before handoff.

## Step 0 — baseline

Run:

```text
git status --short
npm run typecheck
npm test
```

Record the passing test count. If tracked files are already modified, stop
and report the paths; do not revert them.

Completion criterion: the baseline typecheck and full suite pass (the
current count is **310 tests**), and the working-tree situation is
recorded.

## Step 1 — write failing tests

Add tests to `tests/renderer.test.ts` in the existing outlier-story block.
Use a `clonePlan(fixturePlan)` baseline that already has phase 0 with a
story and phases 1 and 2 without one. The new behavior tests must cover:

- The empty phase renders a `.outlier-story` node (same wrapper class as a
  real story) that lives between its phase band and its first session.
- The empty phase's placeholder is a `<p>`, has no `<h3>`, and is text-only
  (no `<a>`, no tags).
- The placeholder's visible text mentions both the absence of an outlier
  story and the phase's "no subject-specific case" framing.
- A plan whose every phase has `outlierStory` set renders no placeholder
  and the same number of `.outlier-story` nodes as phases.
- A plan with an absent story on phase 0 (the first phase) also renders the
  placeholder at the boundary.
- The existing "omits a phase story and its placeholder" test must be
  removed and replaced — its assertion that the body does not contain
  "No outlier story" is exactly the rule this ticket flips.

Run each focused test file. The new behavior tests must fail before the
implementation is added; existing tests, including the citation-warning
and escaping tests, must continue to pass.

Completion criterion: the red tests fail for the intended missing
placeholder behavior, not because of a TypeScript error or malformed test.

## Step 2 — render the placeholder

In `src/renderer.ts`, extend the rendering loop in `renderPlan` so a
phase's section reads:

```text
phase band
.outlier-story --real (when present) OR .outlier-story--empty (when absent)
phase sessions
```

The empty branch renders a small `<p>` inside a `<div class="outlier-story
outlier-story--empty">` wrapper. Style it quietly in `STYLE`:

- `--ink-faint` color
- `--paper-line` top border, no bottom border
- smaller font (`font-size: 14px`) and tighter line-height
- a left padding so it visually attaches to the phase band, not the sessions

No heading, no link, no field spans. The same `.outlier-story` class
remains on the wrapper so a future selector that targets "anything at the
phase boundary" can match both. Add a `.outlier-story--empty` modifier
class so tests and CSS can target it without a tag-based selector.

Do not introduce a second phase loop; do not reorder sessions. Do not
restructure `renderPhaseBand` or `renderOutlierStory`.

Completion criterion: the new renderer tests pass; the existing
present-case tests still pass; `npm run typecheck` is clean.

## Step 3 — tighten the skill

In `.claude/skills/study-plan/SKILL.md`, replace the outlier-story
paragraph (the bullet "Group the sessions into phases. For each phase…
no such source means omit `outlierStory` entirely") with:

- Group the sessions into phases. For each phase, look for a real, named
  person or documented case that reached the skill through an unusual
  route, **specific to the plan's subject domain and recognisably about a
  high-frequency unit drilled in this phase**. A general-legend fallback
  (a famous practitioner whose contribution is at one remove from the
  subject — Thorp, Dalio, Simons, Soros for an options-system plan) is
  not subject-specific and must be omitted, not used.
- Diagnostic: would a reader who knows the subject recognise this person
  as being in this subject, AND would the transferable principle map
  cleanly onto one of the phase's `highFrequencyUnits`? Both must hold.
- Record the unusual approach and the transferable principle explaining
  why it worked as separate fields. Put at most one `outlierStory` on a
  phase, at the phase boundary.
- Add the story only when its citation is a working URL that will pass
  the generator's verification.
- If a search returns only general-legend candidates, or returns no
  candidate whose approach aligns with the phase's high-frequency units,
  omit `outlierStory` entirely — never invent a story, use a composite,
  fall back to a general legend, or fill the gap with a placeholder. The
  generator will render a quiet "No subject-specific outlier case found
  for this phase" note at the phase boundary.
- Do at least one real search per phase; do not skip a phase in the
  search even if an early phase yields nothing.

The skill writes plan data only; it never writes HTML. The renderer
emits the visible placeholder, not the skill.

Completion criterion: the skill text describes the subject-specific
heuristic, names the general-legend pattern as a forbidden fallback, and
states that the absent case is shown by the renderer rather than by a
field the planner must remember to set.

## Step 4 — full verification and bookkeeping

Run:

```text
npm run typecheck
npm test
npx vitest run tests/renderer.test.ts
```

Then update this ticket: check every acceptance item, change status to
`done`, and append a dated `## Comments` entry summarizing the renderer,
skill, and test changes. The map issue #14's spec is resolved by this
ticket; close #14 only if `gh` is installed and authenticated, with a
comment that links to this ticket. Otherwise report that it was skipped.

Do not commit unless the human explicitly asks for a commit. Report
changed files and the final test count.

## Definition of done

- A phase without `outlierStory` renders a muted `.outlier-story--empty`
  placeholder between its phase band and its first session. The
  placeholder says plainly that no subject-specific case was found.
- A phase with `outlierStory` is unchanged: same wrapper class, same
  field layout, same escaping, same citation-warning affordance from #07.
- `OutlierStory`, `Phase.outlierStory`, the validator's present-case
  rules, and the verification flow's `kind: 'outlier-story'` outcomes
  are untouched.
- The skill defines subject-specific concretely, forbids general-legend
  fallbacks, and tells the planner to omit when no subject-specific case
  exists.
- The existing "omits a phase story and its placeholder" test is
  replaced, not preserved — its assertion encodes the old silent-gap
  rule.
- Typecheck and the full test suite pass at the same or higher count.

## Comments

_(filled in at Step 4)_
