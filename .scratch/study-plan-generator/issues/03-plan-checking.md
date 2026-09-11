# 03: Plan checking — validation and link verification

**What to build:** A plan gets checked before it reaches me, and anything wrong with it becomes visible rather than silent. Checking has two halves that share one surface: structural validation of the plan's invariants, and verification of every link it contains. The result is a report naming every problem, plus verification outcomes written back into the plan so the rendered page can show a warning on any session whose materials could not be resolved, and show the price on a paid item.

Link checking takes an injected fetch, so it is fully testable offline.

**Blocked by:** 01.

**Spec:** `.scratch/study-plan-generator/spec.md`

**User stories covered:** 30, 33, 34, 35, 36, 37, 38. Partially covered — the enforcement half, with discovery landing in ticket 04: 31, 32; and the rejection half of 41, 42.

**Status:** done

- [x] Validation rejects a plan missing required fields, carrying an outlier story without a citation, containing more than one paid item, containing a session with no free path to completion, or not containing exactly 14 sessions
- [x] Validation reports every violation it finds, not just the first
- [x] Every URL in a plan is status-checked
- [x] Off-list sources require content confirmation that the page covers the claimed concept; a status-only pass is insufficient for them
- [x] The plan's three-to-five anchor resources are content-verified regardless of tier
- [x] A failing link triggers a search for a replacement covering the same concept, which is then re-verified
- [x] Replacement attempts are capped at two per slot, so checking always terminates
- [x] A slot still unresolved after retries is recorded as unresolved — never silently dropped
- [x] An unreachable host is treated as a verification failure, not an exception that aborts the run
- [x] Verification outcomes distinguish verified-by-status, verified-by-content, replaced-after-failure, and unresolved-after-retries, each with a timestamp
- [x] A session carrying an unresolved material renders a visible warning; a session with fully verified materials renders none
- [x] A paid material renders with its price; a plan with no paid material renders no price affordance

## Comments

Implemented `validatePlan` (`src/validation.ts`) and `verifyPlan` (`src/verification.ts`), plus a session-level warning in the renderer for unresolved materials.

- `validatePlan` checks all structural invariants in the checklist and returns every violation found, not just the first.
- `verifyPlan` takes a plan and injected `fetch`/`searchReplacement` dependencies (plus an optional injected clock) and returns a new plan with refreshed `VerificationRecord`s and a report, without mutating the input. Status-checks every material; requires content confirmation (via a fetched-text/concept match) for off-list sources and for anchor resources. `anchorUrls` lets a caller (e.g. a future generation flow) supply a more informed anchor selection; when omitted, `verifyPlan` defaults to the materials with the greatest `estimatedDuration` (up to 5), so "anchors are content-verified regardless of tier" holds unconditionally rather than only when a caller opts in.
- On failure it calls `searchReplacement` for a same-concept replacement and re-verifies it, capped at 2 replacement attempts per slot (3 total tries), after which the slot is recorded `unresolved-after-retries` with a `null` timestamp rather than being dropped. An unreachable host (fetch throwing) is caught and treated as a failure, not an unhandled exception.
- `renderer.ts` now renders a `.session-warning` badge in a session's collapsed summary row when any of its materials are `unresolved-after-retries`; sessions with fully verified materials render none. Paid-price rendering already existed from ticket 01/02 work; added a test confirming no price affordance renders when a plan has no paid material.
- Tests: `tests/validation.test.ts` (new, 8 tests), `tests/verification.test.ts` (new, 11 tests), plus 4 new cases in `tests/renderer.test.ts` for the warning and no-price-affordance behavior. Full suite: 54 tests passing, `tsc --noEmit` clean.
