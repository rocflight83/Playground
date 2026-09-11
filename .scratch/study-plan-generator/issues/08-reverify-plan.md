# 08: Re-verify an existing plan

**What to build:** Add an explicit maintenance command that reads an existing
plan directory, re-checks every URL, updates verification records, and writes
the refreshed `plan.json` and `index.html` back into that same directory.

Dead links remain in the data with status `unresolved-after-retries`; they
are never deleted. The rendered session keeps its warning. Browser progress is
preserved because the page already stores checkboxes, notes, and stakes in
`studyPlanProgress`, keyed by session number.

**Blocked by:** 04

**Spec:** `.scratch/study-plan-generator/spec.md`

**User stories covered:** 55, 56. Partially covered, alongside ticket 09: 58.

**Status:** done

## Scope and public contract

Add an in-place maintenance seam, preferably `src/maintenance.ts`:

```ts
reverifyPlanDir(planDir: string, options): Promise<MaintenanceResult>
```

It must:

1. Read `<planDir>/plan.json`.
2. Parse and validate it before making any network request or write.
3. Call the existing `verifyPlan` with injected `fetch`,
   `searchReplacement`, and `now`.
4. Validate the returned plan.
5. Write `<planDir>/plan.json` and `<planDir>/index.html` in place.
6. Return the refreshed plan, report, and both paths.

Do not call `generatePlan`: its contract deliberately allocates a new
slug-suffixed directory. Do not change the browser storage key or add progress
to `plan.json`; those are the existing preservation mechanism.

Add a CLI command with an unambiguous usage line, for example:

```text
npm run verify -- <planDir>
```

The command wires real `fetch`, uses no replacement search unless explicitly
supported by the existing CLI contract, prints a JSON summary, and exits
non-zero for invalid input or I/O failure. It must not swallow validation
errors.

## Step 0 — read the seams and baseline

Read `AGENTS.md`, `src/generate.ts`, `src/verification.ts`,
`src/validation.ts`, `src/renderer.ts`, `scripts/generate.ts`, and the
existing tests. Then run:

```text
git status --short
npm run typecheck
npm test
```

Record the passing test count. Stop if tracked changes predate your work.

Completion criterion: the baseline is green and the new in-place seam is
written down before coding.

## Step 1 — tests first

Use an injected filesystem adapter or a temporary directory; do not use the
real repository's `plans/` directory. Add tests proving:

- A healthy plan is read, every material URL is fetched, timestamps refresh,
  and exactly the existing two files are rewritten in the same directory.
- A 404 or thrown fetch produces an unresolved material whose original title
  and URL remain in `plan.json`, and the rendered session still contains the
  warning.
- Re-verifying a plan with healthy links changes verification records and
  timestamps only; subject, phases, sessions, materials, stakes, and all
  non-verification content remain equal.
- Invalid input is rejected before fetch and before either file is written.
- The CLI usage/summary points at the same directory rather than creating a
  `-2` directory.

Capture the old `plan.json` and `index.html` before calling the seam. Assert
paths and file contents through the adapter, not private helpers.

Completion criterion: new tests are red only for the missing maintenance
behavior, while the old suite remains green.

## Step 2 — implement the seam

Add the smallest filesystem capability needed to read existing files. Preserve
the current `FileSystemAdapter` behavior unless extending it is necessary;
update all adapter implementations and tests together if it is extended.

The write gate is strict: no write occurs until input validation, verification,
and output validation all succeed. The verified plan is a new object from
`verifyPlan`; do not mutate the parsed input. Keep the original unresolved
material in place because visibility of rot is part of the feature.

If the second write fails after the first succeeds, surface the error; do not
claim success or silently create a replacement directory. Atomic rename is
optional only if it can be added without broadening the adapter contract.

Completion criterion: focused maintenance tests pass and `npm run typecheck`
is clean.

## Step 3 — implement and test the CLI

Add the package script and script file. Validate argument count and that the
argument identifies a directory containing `plan.json`. Keep the CLI thin:
file reading, real `fetch`, the maintenance seam, and JSON reporting belong
there; plan policy belongs in the existing modules.

Run the CLI against a temporary copied plan directory. Confirm the directory
name is unchanged and both files are updated. Do not run it against a real
learner plan.

Completion criterion: the CLI test or manual temporary-directory check shows
in-place updates and a non-zero failure for invalid input.

## Step 4 — update skill instructions

In `.claude/skills/study-plan/SKILL.md`, add a clearly separated verify mode:

- Locate the existing plan directory and read `plan.json`.
- Run `npm run verify -- <planDir>`.
- Report refreshed links and unresolved warnings.
- Tell the learner that browser checkboxes, notes, and stakes remain because
  progress is keyed by session number and is not regenerated into the data.

Do not make the skill edit HTML or delete unresolved materials.

Completion criterion: a weaker agent can distinguish generate mode from
verify mode and has the exact command and expected unresolved-link behavior.

## Step 5 — finish

Run `npm run typecheck` and `npm test`. Check this ticket's acceptance items,
set status to `done`, and append a dated comments entry. Update/close GitHub
issue 8 only when `gh` is available and authenticated; otherwise say it was
skipped. Do not commit without an explicit request.

## Definition of done

- A command re-verifies every existing URL in place.
- Fresh verification records are written; dead URLs remain and warnings show.
- No new plan directory is created.
- Invalid plans cause no writes.
- Browser progress storage is untouched.
- Typecheck and the full suite pass.

## Comments

- 2026-09-11 — `reverifyPlanDir` added in `src/maintenance.ts`; `npm run verify` CLI
  in `scripts/verify.ts` with summary in generate-mode shape. `FileSystemAdapter`
  extended with `readFile`; both `nodeFileSystem` and the in-memory test adapters
  updated together. Tests cover: healthy plan refresh, 404 leaves title/URL in
  `plan.json` with warning on the page, only verification records change between
  runs, invalid input rejected before fetch and before write, no `-2` directory
  is created, end-to-end on the real filesystem updates in place, and CLI usage
  / no-plan.json failure paths. Skill instructions add a Verify mode section;
  `AGENTS.md` lists the new module and command.
- 2026-09-11 — Code review caught a spec gap: `verifyPlan` was deleting
  outlier stories whose citation failed, so a rotted citation would silently
  remove a story the learner had been reading. Added
  `verification?: VerificationRecord` to `OutlierStory` in
  `src/plan-types.ts`; `verifyPlan` now populates it for every story and
  accepts `keepOutlierStoriesOnFailure: true` (default false to preserve
  generate-mode behaviour). `reverifyPlanDir` passes the option; the renderer
  surfaces a "⚠ Unverified citation" tag in the story when the citation is
  unresolved. The CLI now also pre-checks that the supplied directory
  contains `plan.json` and prints a JSON error rather than a raw stack
  trace. Tests added for the new option, the warning rendering, the CLI
  pre-check, and the second-write failure surface.
