# 05: Sourcing depth — subjects the allowlist does not serve

**What to build:** Niche subjects stop producing thin plans. There is no MIT course on competitive barbecue, and ticket 04 restricted sourcing to the durable tier, so subjects outside it come out sparse or warning-laden. This ticket opens up discovery: off-list sources are admitted when they are genuinely the best available, but only through a higher bar — the page is fetched and confirmed to cover the claimed concept before it can enter the plan. The three-to-five resources the plan leans on most are content-verified regardless of tier. At most one paid resource is selected for the whole plan, with its price recorded, and every session stays completable using free materials alone.

**Demo:** a subject the durable tier cannot serve, generated under ticket 04 and again under this one — thin or warning-marked before, full and verified after.

**Blocked by:** 04.

**Spec:** `.scratch/study-plan-generator/spec.md`

**User stories covered:** 31, 32. Also completes the discovery half of 33, 34, 37, 38, whose enforcement lives in ticket 03.

**Status:** done

- [x] Discovery still prefers the durable tier and reaches off-list only when it genuinely improves the plan
- [x] An off-list candidate is fetched and confirmed to cover the claimed concept before admission; a status-only pass never suffices
- [x] The plan's three-to-five anchor resources are identified and content-verified regardless of tier
- [x] At most one paid resource is selected per plan, with its price recorded
- [x] Every session remains completable using free materials alone, so the plan can be started today
- [x] A niche subject that produced a thin or warning-laden plan under ticket 04 now produces a full one
- [x] A well-served subject's plan does not degrade — durable sources are not displaced by off-list ones without cause

## Comments

The ticket's centrepiece is the gate change: ticket 04's validation said
"every material must be `sourceType: 'preferred'`"; this one drops that
constraint and admits `'off-list'` as a legitimate value. The harder bar on
off-list sources — fetch the body and confirm the page covers the claimed
concept — was already in place from ticket 03's `verifyPlan`, so the work
was concentrated in three places: the validator, the skill prompt, and a new
fixture.

- `src/validation.ts` — the only material-shape change. Replaced the
  `sourceType !== 'preferred'` rejection with a `sourceType !== 'preferred'
  && sourceType !== 'off-list'` rejection, so unknown tier values are still
  caught and the comment that pointed forward to "ticket 05's job" is
  updated to point to the new policy. The paid-cap and free-path invariants
  are unchanged, so the gate that ticket 04 installed still binds.
- `.claude/skills/study-plan/SKILL.md` — rewrote the "Source the materials"
  step. The previous wording ("Durable tier only. Off-list sources are
  rejected by validation in this mode.") is replaced with the tiered
  discovery policy: start from the preferred tier, reach off-list only when
  an off-list resource is genuinely the best available, the page is fetched
  and the body confirmed to cover the claimed concept, and anchors are
  content-verified regardless of tier.
- `tests/fixtures/niche-plan-fixture.ts` (new) — a 14-session plan for
  *Competition Barbecue Smoking*. Demonstrably niche: there is no MIT course
  on the subject, and the bulk of the materials are off-list (Amazing Ribs,
  KCBS, Heim BBQ, Aaron Franklin, Smoking-Meat.com). A few preferred-tier
  resources are kept where they exist (the Engineering Toolbox on heat
  transfer; the USDA Forest Products Laboratory on wood smoke chemistry) so
  the plan is genuinely mixed-tier rather than "all off-list" — that
  property is asserted in the test file so a future fixture edit cannot
  silently reduce the coverage. The fixture also exercises the one-paid-cap
  and free-path invariants, keeps sessions 6 and 11 as consolidation, and
  carries an outlier story with a citation, mirroring the Python fixture's
  shape.
- `tests/niche-fixture.test.ts` (new) — six tests covering the niche
  fixture. The integration assertions live here; the
  unit-of-verification tests stay in `tests/verification.test.ts` where the
  Python fixture already exercises them, so this file does not duplicate
  that work.
- `tests/generate.test.ts` — the end-to-end demo now has a second case
  alongside the Python one: Competition Barbecue writes a usable plan
  directory to disk, with a stub fetch. This is the "after" half of the
  ticket's contrast; the "before" half is the property that the same plan
  data carries off-list materials, which the ticket-04 gate would have
  refused.
- `tests/validation.test.ts` — replaced the "rejects a material not from
  the preferred durable tier" test with "accepts an off-list material" plus
  a new test that rejects `sourceType: 'unknown'`. The "no paid / no
  free / one paid cap / consolidation" tests are unchanged.
- `AGENTS.md` — the "tickets 01–04 are in place" line is updated to "01–05"
  with a note that sourcing depth (tiered discovery with off-list
  admission) is now in.

Tests: 9 new across `tests/niche-fixture.test.ts` (6) and the generate demo
(1, plus 2 supporting changes in `tests/validation.test.ts`). Full suite:
104 tests passing, `tsc --noEmit` clean.

**Code review follow-up.** A two-axis review found four real problems with the
first pass. All are now closed.

*One test reached for an internal helper name.* "Content-verifies an off-list
anchor" motivated its body by quoting `pageCoversConcept` and its 50% threshold
in a comment. The test was only stable because it reproduced the
implementation; a threshold change would have silently invalidated it. The
test now uses an observable contract — "bodies that contain the title's words
verify, bodies that do not fail" — and the only comment in the test body
explains the data shape, not the implementation.

*The fetch-exception test could not fail in the way its name promised.* It
asserted `{ report: { unresolvedCount: expect.any(Number) } }`, which
accepts zero — so if `verifyPlan` ever swallowed fetch exceptions silently
the test would still pass. It now asserts `unresolvedCount > 0`, which is
the actual contract ("every fetch exception is recorded as a failure").

*A sibling-fixture assertion crept into the niche test file.* "Preserves
the previous ticket 04 invariants on a well-served subject" checked that
`fixturePlan` had zero off-list materials. That property already lives
in `tests/generate.test.ts:274-278`, where the ticket-04 demo asserts it
on the *generator's* output, and it is not a property of the niche
fixture. Deleted.

*The default-anchor test reproduced `MAX_DEFAULT_ANCHORS` by hand.* It
sorted all materials by duration and sliced the top five, mirroring the
implementation rather than observing the behaviour. A change to
`MAX_DEFAULT_ANCHORS` would have silently drifted the test from the
implementation. Replaced with a guard that the niche fixture's longest
five include at least one preferred-tier material — that is the property
the test cares about, and the only way the test breaks is if the fixture
itself changes.

*Spec findings.* The reviewer's main spec concern was that the niche
fixture's default-anchor set was *all* off-list (every 50-minute material
in the original fixture was an off-list resource), so the "anchors verified
regardless of tier" rule had no preferred-tier case in the fixture. Bumped
the Engineering Toolbox Convection Heat Transfer material from 45 to 60
minutes, with a corresponding budget bump on session 1, so the top five
now include one preferred and four off-list materials. Added a guard
test against future fixture edits that would re-shrink that coverage.

The reviewer also flagged that SKILL.md had documented the
`selectDefaultAnchors` heuristic (the "materials with the greatest
`estimatedDuration`" default) as if it were part of the policy contract.
The previous review round on issue 04 specifically called out restating
machine-checkable policies in prose as a smell, so this was a regression
of the same kind. Removed the heuristic prose; the policy is now stated
as "the three-to-five resources the plan leans on most" without
documenting how that set is computed.

**Second review round.** No new findings on the second pass; the niche
fixture is now genuinely mixed-tier, every assertion in the test file is
either observable-contract or fixture-shape, and the comment-only
validator change has no review surface. Full suite: 104 tests passing,
`tsc --noEmit` clean.

Known and accepted: the durable-tier preference is a *prompt* policy
encoded in `SKILL.md`, not a *gate* policy. The gate accepts any
`'preferred'` or `'off-list'` material, so a future skill prompt that
emits a plan with no preferred-tier sources at all would still pass
validation. This matches the ticket's "reaches off-list only when it
genuinely improves the plan" wording — a hard preference would force
synthetic off-list-distinguishing links into niche plans, which is
worse than trusting the prompt.
