# 03: Plan checking — validation and link verification

**What to build:** A plan gets checked before it reaches me, and anything wrong with it becomes visible rather than silent. Checking has two halves that share one surface: structural validation of the plan's invariants, and verification of every link it contains. The result is a report naming every problem, plus verification outcomes written back into the plan so the rendered page can show a warning on any session whose materials could not be resolved, and show the price on a paid item.

Link checking takes an injected fetch, so it is fully testable offline.

**Blocked by:** 01.

**Spec:** `.scratch/study-plan-generator/spec.md`

**User stories covered:** 30, 33, 34, 35, 36, 37, 38. Partially covered — the enforcement half, with discovery landing in ticket 04: 31, 32; and the rejection half of 41, 42.

**Status:** ready-for-agent

- [ ] Validation rejects a plan missing required fields, carrying an outlier story without a citation, containing more than one paid item, containing a session with no free path to completion, or not containing exactly 14 sessions
- [ ] Validation reports every violation it finds, not just the first
- [ ] Every URL in a plan is status-checked
- [ ] Off-list sources require content confirmation that the page covers the claimed concept; a status-only pass is insufficient for them
- [ ] The plan's three-to-five anchor resources are content-verified regardless of tier
- [ ] A failing link triggers a search for a replacement covering the same concept, which is then re-verified
- [ ] Replacement attempts are capped at two per slot, so checking always terminates
- [ ] A slot still unresolved after retries is recorded as unresolved — never silently dropped
- [ ] An unreachable host is treated as a verification failure, not an exception that aborts the run
- [ ] Verification outcomes distinguish verified-by-status, verified-by-content, replaced-after-failure, and unresolved-after-retries, each with a timestamp
- [ ] A session carrying an unresolved material renders a visible warning; a session with fully verified materials renders none
- [ ] A paid material renders with its price; a plan with no paid material renders no price affordance
