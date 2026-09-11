# 06: Scope honesty

**What to build:** When I ask for something that cannot happen in 14 sessions — become a neurosurgeon, add 200lb to a deadlift — the tool neither refuses me nor pretends. It reframes my target into the load-bearing fraction that is genuinely achievable at my stated hours, and says so plainly at the top of the plan in my own terms: you asked for X; in 14 sessions at N hours a day the honest target is Y.

This is a small behaviour that carries a lot of the tool's value, and it is the first thing to erode under pressure to produce impressive-looking plans. It gets its own ticket and its own tests for that reason.

**Blocked by:** 04.

**Spec:** `.scratch/study-plan-generator/spec.md`

**User stories covered:** 5, 6, 7.

**Status:** ready-for-agent

- [ ] Before planning, the generator evaluates whether the stated target is achievable in 14 sessions at the stated hours
- [ ] Targets requiring physical adaptation, credentialing, or genuinely deep domain mastery are recognised as not achievable
- [ ] An unachievable target is reframed rather than refused; a plan is still produced
- [ ] The reframed target is the load-bearing fraction of what was asked, not an unrelated substitute
- [ ] When stated and honest targets diverge, the scope note renders prominently at the top, naming both
- [ ] When they do not diverge, no scope note appears
- [ ] An unachievable target is never silently planned as though it were achievable
- [ ] The plan's sessions target the reframed capability, not the original wish

---

## Implementation guide

This section is written so the ticket can be completed by an agent with no
prior context. Follow the steps **in order**. Do not skip a step, do not
reorder them, and do not do anything the steps do not ask for. Where a step
gives exact code or text, use it verbatim.

### What already exists (do not rebuild it)

Read these before touching anything, so you know what is already done:

- `src/plan-types.ts` lines 46–56: `PlanData.meta.honestTarget?: string` and
  `PlanData.scopeNote?: string` already exist. **Do not change their types.**
- `src/renderer.ts` around line 770: `renderPlan` already renders
  `<aside class="scope-note">` when `plan.scopeNote` is set, and omits it
  otherwise. The CSS for `.scope-note` is around line 184.
- `tests/fixtures/plan-fixture.ts`: the fixture already has a divergent
  `targetCapability` / `honestTarget` pair and a `scopeNote`. **Do not edit
  the fixture.**
- `tests/renderer.test.ts` lines 114–127: two tests already cover "scope note
  shows near the top" and "scope note omitted when absent".
- `.claude/skills/study-plan/SKILL.md` "### 1. Set an honest target": a short
  paragraph exists. This ticket replaces it with a full procedure.

### What this ticket adds (the whole scope)

Three small pieces, nothing more:

1. **Validation** (`src/validation.ts`): `meta.honestTarget` and `scopeNote`
   must be present together or absent together, and `honestTarget` must
   differ from `targetCapability`. This is what makes "silent reframing"
   impossible: a plan cannot carry a reframed target without saying so, and
   cannot carry a scope note that names nothing.
2. **Renderer** (`src/renderer.ts`): the scope note names **both** targets
   structurally, taken from `meta` — not left to the prose to mention them.
   The hero "Target:" line shows the honest target when one exists, because
   that is what the sessions actually aim at.
3. **Skill** (`.claude/skills/study-plan/SKILL.md`): step 1 becomes a concrete
   decision procedure with a scope-note template, so the reframing is done
   the same way every time.

Everything else on the checklist above ("before planning the generator
evaluates…", "sessions target the reframed capability") is prompt behaviour
and is delivered by piece 3. It is not testable in code; do not try to write
code for it.

### Rules that apply to every step

- Run commands from the repository root.
- After **every** edit to a file under `src/`, run `npm run typecheck`. It
  must print nothing after the `tsc --noEmit` line. If it prints errors, fix
  them before moving on.
- Run a single test file with `npx vitest run tests/<name>.test.ts`.
- Write tests **before** the code they test (steps say "RED" then "GREEN").
  At the RED step the new tests must fail; at the GREEN step they must pass.
  If a RED test already passes, you have written the wrong test — re-read the
  step.
- Never add a dependency. Never use `Date.now()`, `Math.random()`, or any I/O
  in `src/renderer.ts` or `src/validation.ts`.
- Every string that goes into HTML in `src/renderer.ts` must pass through
  `esc(...)`. No exceptions.
- Do not edit: `src/verification.ts`, `src/generate.ts`, `src/slug.ts`,
  `scripts/generate.ts`, `tests/fixtures/*`, `tests/niche-fixture.test.ts`,
  `tests/generate.test.ts`, `tests/verification.test.ts`, `tests/slug.test.ts`.
- Files in this repo use LF line endings. Keep them that way.

### Step 0 — confirm a clean starting point

Run:

```
git status --short
npm run typecheck
npm test
```

Expected: `git status --short` prints nothing (or only lines starting with
`??` for untracked files). `npm run typecheck` prints no errors. `npm test`
ends with a line like `Tests  104 passed (104)` — the number may differ
if other tickets landed since, but every test must pass. Write the number
down; Step 7 compares against it.

**If `git status --short` shows lines starting with ` M` (modified tracked
files) that you did not create, stop and ask the human to commit or stash
them first.** Do not revert them and do not commit them yourself.

### Step 1 — validation tests (RED)

Open `tests/validation.test.ts`. Find the test that starts with:

```ts
  it('rejects a plan missing required meta fields', () => {
```

Directly **after** that whole test (after its closing `})`), insert the
following four tests exactly:

```ts
  it('accepts a plan with neither honestTarget nor scopeNote (targets do not diverge)', () => {
    const plan = clonePlan(fixturePlan)
    delete plan.meta.honestTarget
    delete plan.scopeNote
    expect(validatePlan(plan)).toEqual([])
  })

  it('rejects a reframed target that has no scope note (silent reframing)', () => {
    const plan = clonePlan(fixturePlan)
    delete plan.scopeNote
    const errors = validatePlan(plan)
    expect(errors).toContain(
      'scopeNote is required when meta.honestTarget is set: a reframed target must be stated at the top of the plan'
    )
  })

  it('rejects a scope note that names no reframed target', () => {
    const plan = clonePlan(fixturePlan)
    delete plan.meta.honestTarget
    const errors = validatePlan(plan)
    expect(errors).toContain(
      'meta.honestTarget is required when scopeNote is set: the scope note must name the reframed target'
    )
  })

  it('rejects an honest target identical to the stated target', () => {
    const plan = clonePlan(fixturePlan)
    plan.meta.honestTarget = plan.meta.targetCapability
    const errors = validatePlan(plan)
    expect(errors).toContain(
      'meta.honestTarget must differ from meta.targetCapability; omit both honestTarget and scopeNote when the stated target is already honest'
    )
  })
```

Run `npx vitest run tests/validation.test.ts`.

Expected: the first new test passes; the other **three fail** (the error
strings are not produced yet). Any other outcome means the tests were pasted
in the wrong place — check that they sit inside the `describe('validatePlan'`
block.

### Step 2 — validation code (GREEN)

Open `src/validation.ts`. Find this line:

```ts
  require_(errors, plan.meta.generatedAt, 'meta.generatedAt is required')
```

Directly **after** it, insert:

```ts
  // Scope honesty: a reframed target and the note explaining it travel
  // together. One without the other is either a silent reframe (sessions
  // aim at something the learner was never told about) or a note that names
  // nothing. Identical targets mean no divergence, so both must be omitted.
  if (plan.meta.honestTarget !== undefined && typeof plan.meta.honestTarget !== 'string') {
    errors.push('meta.honestTarget must be a string when present')
  }
  if (plan.scopeNote !== undefined && typeof plan.scopeNote !== 'string') {
    errors.push('scopeNote must be a string when present')
  }
  const statedTarget = typeof plan.meta.targetCapability === 'string' ? plan.meta.targetCapability.trim() : ''
  const honestTarget = typeof plan.meta.honestTarget === 'string' ? plan.meta.honestTarget.trim() : ''
  const scopeNote = typeof plan.scopeNote === 'string' ? plan.scopeNote.trim() : ''
  if (honestTarget && !scopeNote) {
    errors.push(
      'scopeNote is required when meta.honestTarget is set: a reframed target must be stated at the top of the plan'
    )
  }
  if (scopeNote && !honestTarget) {
    errors.push('meta.honestTarget is required when scopeNote is set: the scope note must name the reframed target')
  }
  if (honestTarget && honestTarget === statedTarget) {
    errors.push(
      'meta.honestTarget must differ from meta.targetCapability; omit both honestTarget and scopeNote when the stated target is already honest'
    )
  }
```

Run `npm run typecheck` (must be clean), then
`npx vitest run tests/validation.test.ts`.

Expected: every test in the file passes, including the four you added.

### Step 3 — renderer tests (RED)

Open `tests/renderer.test.ts`. Find this test:

```ts
  it('shows the scope note prominently near the top', () => {
    const html = renderPlan(fixturePlan)
    const doc = structure(html)
    expect(doc.querySelector('.scope-note')?.textContent).toContain(fixturePlan.scopeNote!)
    expect(html.indexOf('scope-note')).toBeLessThan(html.indexOf('class="session"'))
  })

  it('omits the scope note when the targets do not diverge', () => {
    const plan = clonePlan(fixturePlan)
    delete plan.scopeNote
    const doc = structure(renderPlan(plan))
    expect(doc.querySelector('.scope-note')).toBeNull()
    expect(doc.body.textContent).not.toContain(fixturePlan.scopeNote!)
  })
```

Replace those two tests (both of them, together) with these three:

```ts
  it('shows the scope note prominently near the top, naming both the stated and the honest target', () => {
    const html = renderPlan(fixturePlan)
    const doc = structure(html)
    const note = doc.querySelector('.scope-note')
    expect(note).not.toBeNull()
    const text = note!.textContent ?? ''
    expect(text).toContain('You asked for: ' + fixturePlan.meta.targetCapability)
    expect(text).toContain(
      'In 14 sessions at ' + fixturePlan.meta.hoursPerDay + ' hours a day, the honest target is: ' + fixturePlan.meta.honestTarget
    )
    expect(text).toContain(fixturePlan.scopeNote!)
    expect(html.indexOf('scope-note')).toBeLessThan(html.indexOf('class="session"'))
  })

  it('aims the hero target line at the honest target when one exists', () => {
    const doc = structure(renderPlan(fixturePlan))
    const hero = doc.querySelector('.hero-target')?.textContent ?? ''
    expect(hero).toContain(fixturePlan.meta.honestTarget!)
    expect(hero).not.toContain(fixturePlan.meta.targetCapability)
  })

  it('omits the scope note and shows the stated target when the targets do not diverge', () => {
    const plan = clonePlan(fixturePlan)
    delete plan.meta.honestTarget
    delete plan.scopeNote
    const doc = structure(renderPlan(plan))
    expect(doc.querySelector('.scope-note')).toBeNull()
    expect(doc.body.textContent).not.toContain(fixturePlan.scopeNote!)
    expect(doc.body.textContent).not.toContain('You asked for')
    expect(doc.querySelector('.hero-target')?.textContent).toContain(plan.meta.targetCapability)
  })
```

Run `npx vitest run tests/renderer.test.ts`.

Expected: the first two of the three new tests **fail**; the third passes.
Every other test in the file still passes.

### Step 4 — renderer code (GREEN)

Open `src/renderer.ts`.

**4a.** Find this block (around line 770):

```ts
  const scopeNote = plan.scopeNote
    ? '<aside class="scope-note"><p><strong>Scope:</strong> ' + esc(plan.scopeNote) + '</p></aside>'
    : ''
```

Replace it with:

```ts
  // Both targets come from meta, not from the prose, so the note always
  // names what was asked and what the sessions actually aim at even when a
  // hand-edited scopeNote forgets to.
  const hoursWord = plan.meta.hoursPerDay === 1 ? 'hour' : 'hours'
  const scopeNote = plan.scopeNote
    ? '<aside class="scope-note" aria-label="Scope">' +
      '<p><strong>Scope</strong></p>' +
      '<p class="scope-stated">You asked for: <span>' +
      esc(plan.meta.targetCapability) +
      '</span></p>' +
      '<p class="scope-honest">In ' +
      sessionCount +
      ' sessions at ' +
      esc(String(plan.meta.hoursPerDay)) +
      ' ' +
      hoursWord +
      ' a day, the honest target is: <span>' +
      esc(plan.meta.honestTarget ?? '') +
      '</span></p>' +
      '<p class="scope-reason">' +
      esc(plan.scopeNote) +
      '</p>' +
      '</aside>'
    : ''
```

Note: `sessionCount` is already defined on the line just above this block.
Do not define it again.

**4b.** A few lines further down, find:

```ts
    '</h1><p class="hero-target"><strong>Target:</strong> ' +
    esc(plan.meta.targetCapability) +
    '</p>' +
```

Replace `esc(plan.meta.targetCapability)` on that middle line with:

```ts
    esc(plan.meta.honestTarget ?? plan.meta.targetCapability) +
```

**4c.** In the `STYLE` CSS (around line 192), find:

```css
.scope-note p { margin: 0; color: var(--ink); font-size: 16px; overflow-wrap: anywhere; }
```

Directly **after** it, add these two lines:

```css
.scope-note p + p { margin-top: 8px; }
.scope-note span { font-weight: 650; }
```

Run `npm run typecheck` (must be clean), then
`npx vitest run tests/renderer.test.ts`.

Expected: every test in the file passes.

### Step 5 — the skill's decision procedure

Open `.claude/skills/study-plan/SKILL.md`. Find the section that begins with
the heading `### 1. Set an honest target` and ends just before the heading
`### 2. Deconstruct, select, sequence`. Replace that entire section (heading
included) with the text below, verbatim:

````markdown
### 1. Set an honest target

Before any planning, decide whether the **target capability** is reachable in
14 sessions at the stated hours per day. Answer these three questions; a
"yes" to any of them means the target is **not** reachable as stated:

1. **Physical adaptation?** Does reaching it require the body to change —
   strength, endurance, flexibility, callus, reaction time trained over
   months? (Add 200lb to a deadlift; run a sub-3 marathon; play a Chopin
   étude at tempo from scratch.)
2. **Credentialing?** Does reaching it require an exam, licence, degree,
   certification, or someone else's sign-off? (Become a neurosurgeon; pass
   the bar; get a pilot's licence.)
3. **Genuinely deep mastery?** Would an honest expert say it takes years of
   accumulated exposure regardless of hours per day? (Fluent Mandarin;
   contribute a new result in algebraic topology; be hired as a senior
   compiler engineer.)

Also fail the target if 14 × hoursPerDay hours is plainly too little for it
even without those three — for example a 40-hour target at 1 hour a day.

**If all three answers are "no" and the hours fit:** the stated target is
honest. Leave `meta.honestTarget` and `scopeNote` **absent** (not empty
strings — omit the fields). Validation rejects an `honestTarget` identical to
`targetCapability`, so do not copy it across.

**If the target is not reachable:** reframe, never refuse, and never plan
the wish as if it were reachable. A plan is always produced. To reframe:

- Keep the **subject** and the learner's **motive**; shrink the **outcome**
  to the load-bearing fraction reachable in 14 sessions. The honest target
  must be a real step *on the road to* the stated one, not a substitute
  topic. "Become a neurosurgeon" → "Read a head CT for the six most common
  emergencies and explain the surgical decision for each", not "learn
  first aid". "Add 200lb to my deadlift" → "Own a technically sound
  deadlift, a 14-session programme I can run, and a baseline 1RM to build
  from", not "learn about nutrition".
- Write the reframed outcome to `meta.honestTarget`. Phrase it like a
  target capability: something the learner can do at session 14.
- Write `scopeNote` using this template, filling every bracket in the
  learner's own words from the invocation:

  > You asked for [stated target]. In 14 sessions at [N] hours a day the
  > honest target is [honest target]. [One or two sentences: what makes the
  > stated target out of reach in this window, and what the honest target
  > gives the learner toward it.]

  The rendered page adds the two targets around the note itself, so the
  note's job is the plain reasoning. It is a first-class output, not an
  apology: state it flatly, in the same voice as the rest of the plan.
- Every one of the 14 sessions then aims at `honestTarget`. If a session's
  artifact only makes sense for the original wish, it is the wrong artifact.

Both fields travel together: `honestTarget` without `scopeNote`, or
`scopeNote` without `honestTarget`, is rejected by validation.

````

(The four-backtick fence above is only so this ticket can show a fenced
block inside a fenced block. The text you paste into SKILL.md starts at
`### 1. Set an honest target` and ends after the line "…is rejected by
validation." followed by one blank line. Do not paste the four-backtick
lines.)

There is no automated test for this step. Check your work by reading
SKILL.md top to bottom once and confirming: the heading numbers still run
1 → 5 in order, and the section you pasted renders as markdown (bullets,
the `>` quote block, and backticked field names look right).

### Step 6 — documentation

Open `AGENTS.md`. In the "Project overview" section, find the sentence that
begins `Current state: tickets 01–05 are in place`. Change `01–05` to
`01–06`, and change `and sourcing depth
(tiered discovery with off-list admission).` to `sourcing depth
(tiered discovery with off-list admission), and scope honesty (a reframed
target and its scope note are validated as a pair and rendered together).`
If the sentence already says something different because another ticket
edited it, make the smallest equivalent edit.

Open `src/plan-types.ts`. Find:

```ts
    honestTarget?: string
```

Replace it with:

```ts
    /**
     * The reachable version of `targetCapability`, present only when the two
     * diverge. Travels with `scopeNote`: validation rejects one without the
     * other, and rejects an honestTarget identical to targetCapability.
     */
    honestTarget?: string
```

Then find:

```ts
  scopeNote?: string
```

Replace it with:

```ts
  /** Plain statement of the reframing, rendered at the top. Present iff `meta.honestTarget` is. */
  scopeNote?: string
```

Run `npm run typecheck`. It must be clean.

### Step 7 — full verification

Run, in this order:

```
npm run typecheck
npm test
```

Expected: typecheck prints no errors. `npm test` ends with every test
passing and the total is the Step 0 count **plus 5** (four validation tests
added, two renderer tests replaced by three). If any test fails, read its
message, fix the cause, and re-run both commands. Do not delete or skip a
failing test.

### Step 8 — ticket bookkeeping

In this file (`.scratch/study-plan-generator/issues/06-scope-honesty.md`):

- Change every `- [ ]` in the checklist near the top to `- [x]`.
- Change `**Status:** ready-for-agent` to `**Status:** done`.
- Add a `## Comments` heading at the very end of the file with one line:
  `- 2026-MM-DD: implemented; validation couples honestTarget/scopeNote, renderer names both targets, skill step 1 is a decision procedure.` (use today's date).

Then update the GitHub pointer issue (see `docs/agents/issue-tracker.md`):

```
gh issue edit 6 --repo rocflight83/Playground --remove-label ready-for-agent --add-label done
gh issue close 6 --repo rocflight83/Playground
```

If `gh` is not installed or not authenticated, skip these two commands and
say so in your final report.

### Step 9 — commit

Stage exactly these files and nothing else:

```
git add src/validation.ts src/renderer.ts src/plan-types.ts tests/validation.test.ts tests/renderer.test.ts .claude/skills/study-plan/SKILL.md AGENTS.md .scratch/study-plan-generator/issues/06-scope-honesty.md
```

Run `git status --short` and confirm only those eight files show as staged
(`M ` at the start of the line). Then commit with this message:

```
Implement scope honesty: reframed target and scope note are validated as a pair (issue 06)

Validation rejects meta.honestTarget without scopeNote (silent reframing),
scopeNote without honestTarget (a note that names nothing), and an
honestTarget identical to targetCapability. The renderer names both the
stated and the honest target inside the scope note from meta, so the prose
cannot omit them, and the hero target line shows the honest target when
one exists. The /study-plan skill's step 1 is now a three-question
reachability check with a scope-note template.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

### Definition of done

All of the following are true:

- `npm run typecheck` is clean and `npm test` passes with 5 more tests than
  at Step 0.
- `git log -1` shows the commit from Step 9 and `git status --short` shows
  no modified tracked files.
- The checklist at the top of this file is all `[x]` and Status is `done`.
- Your final report lists: the commit hash, the test count before and
  after, and whether the `gh` commands ran.
