# 09: Redo a single session

**What to build:** Let the planning skill produce a replacement for one named
session in an existing plan, then apply only that replacement, verify its
links, validate the whole plan, and re-render in the same directory.

This is a data-maintenance operation, not a new generation run. The target
session may change title, artifact, self-check, materials, estimated time, CAFE
fields, and consolidation content as appropriate. Every other plan field must
remain equivalent after normal JSON parsing. The existing browser progress state
remains valid because it is keyed by session number.

**Blocked by:** 08

**Spec:** `.scratch/study-plan-generator/spec.md`

**User stories covered:** 57. Partially covered, alongside ticket 08: 58.

**Status:** ready-for-agent

## Public contract

Add a narrow seam alongside issue 08's maintenance code:

```ts
redoSession(
  planDir: string,
  sessionNumber: number,
  replacement: Session,
  options: RedoOptions
): Promise<MaintenanceResult>
```

The seam reads `<planDir>/plan.json`, verifies that the replacement number
matches the requested number, replaces exactly one `sessions` entry, and then:

1. validates the merged plan before network access;
2. verifies only the replacement session's materials;
3. validates the verified merged plan again;
4. writes the same `plan.json` and `index.html` paths in place.

Use the existing injected fetch/search/clock/filesystem dependencies. Do not
call `generatePlan` (it creates a new directory). Do not re-verify the other
thirteen sessions: changing their timestamps would violate the preservation
contract.

The replacement is structured JSON supplied by the skill. The deterministic
shell does not invent titles, artifacts, prose, or sources.

## Step 0 — baseline and dependency check

Read issue 08's completed implementation, `src/plan-types.ts`,
`src/validation.ts`, `src/verification.ts`, `src/renderer.ts`, and the
skill. Run:

```text
git status --short
npm run typecheck
npm test
```

Record the count and stop if unrelated tracked changes are present.

Completion criterion: issue 08 is green and its in-place seam is understood;
do not duplicate its file I/O or CLI implementation.

## Step 1 — tests first

Add focused tests using a cloned fixture and an injected filesystem. Prove:

- Replacing session 3 changes only session 3's parsed data; all other
  sessions, phases, meta, DISSS preamble, stakes, and plan fields are equal.
- The replacement's material URLs are fetched and its verification records are
  refreshed. A failing URL remains in the replacement with
  `unresolved-after-retries` and the rendered session warning.
- The other thirteen sessions' verification records and timestamps are not
  fetched or changed.
- A replacement with the wrong number is rejected before fetch or write.
- A replacement that makes the plan invalid is rejected before write and the
  original two files remain untouched.
- The rendered HTML contains the replacement artifact and self-check and no
  stale target-session material.
- Existing progress storage is not written by the server-side seam; a DOM test
  should continue to restore state for the same session number after the page
  is re-rendered.

Use deep equality on parsed data for preservation, not string equality that
could fail because of harmless formatting.

Completion criterion: the new tests fail for the intended missing behavior,
not because the fixture or test harness is malformed.

## Step 2 — make verification support a session subset

Extend the verification seam with an optional, typed session-number filter, or
add a small exported helper that verifies selected sessions. The default
behavior must remain “verify every session” for issue 08 and existing callers.

The selected-session path must preserve all unselected session objects and
their verification records exactly. Keep the existing maximum of two
replacement attempts per material. Do not weaken validation or change the
meaning of unresolved status.

Completion criterion: existing verification tests still pass, and a focused
test proves an unselected session is neither fetched nor timestamped.

## Step 3 — implement the in-place redo seam

Reuse issue 08's read/validate/write helpers. The safe order is:

```text
read original -> validate original -> clone -> replace one session
-> validate merged plan -> verify target session
-> validate verified plan -> write plan.json and index.html
```

The original object and original files must remain unchanged on every error.
Preserve the target session's number exactly; this is what preserves its
checkbox and notes state. Preserve `stakes` and all top-level fields. Do not
silently merge old materials or old prose into the replacement.

Completion criterion: focused redo tests pass, including no-write failures,
single-session verification, rendering, and preservation.

## Step 4 — add the redo command and skill mode

Add a thin command:

```text
npm run redo -- <planDir> <sessionNumber> <replacement.json>
```

It parses the replacement JSON as `Session`, reports validation errors as
JSON, and exits non-zero without writing on failure. It must not accept HTML.

In `.claude/skills/study-plan/SKILL.md`, document redo mode as:

- Read the existing `plan.json` and the selected session.
- Re-plan only that session against the plan's current honest target (or
  stated target when no honest target exists), level, hours, DISSS units, and
  consolidation policy.
- Keep exactly one artifact, one binary self-check, and a free path to
  completion; source and verify only the replacement session.
- Write a temporary structured replacement JSON and invoke the command above.
- Report the updated directory and any unresolved replacement material.

The skill must not rewrite the other sessions and must not write HTML itself.

Completion criterion: the command and skill text agree on argument order,
replacement shape, in-place behavior, and the single-session boundary.

## Step 5 — finish and handoff

Run:

```text
npm run typecheck
npm test
```

Check every acceptance item, set status to `done`, and append a dated
comments entry naming the subset-verification seam and preservation tests.
Update/close GitHub issue 9 only if `gh` is available and authenticated;
otherwise report that it was skipped. Do not commit without an explicit
request.

## Definition of done

- One session can be replaced in place from structured data.
- Only that session is verified and changed.
- The complete merged plan is validated before either write.
- Other sessions, metadata, stakes, and browser progress remain intact.
- The page is re-rendered and unresolved replacement links remain visible.
- Typecheck and the full suite pass.

## Comments
