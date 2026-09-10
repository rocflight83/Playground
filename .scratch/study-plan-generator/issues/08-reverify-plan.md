# 08: Re-verify an existing plan

**What to build:** Weeks after generating a plan, I point the tool at it and it re-checks every link, so I find rot before it costs me a session. Links that have died since generation become visible warnings on their sessions — they are marked, never quietly deleted, so I can see what changed. My checkboxes, notes and stakes survive untouched.

**Blocked by:** 04.

**Spec:** `.scratch/study-plan-generator/spec.md`

**User stories covered:** 55, 56. Partially covered, alongside ticket 09: 58.

**Status:** ready-for-agent

- [ ] A command re-checks every link in an existing plan on demand
- [ ] Verification records are updated with fresh outcomes and timestamps
- [ ] Newly rotted links become visible warnings on their sessions
- [ ] Rotted links are marked rather than deleted, so the change is legible
- [ ] The plan is re-rendered from the updated data
- [ ] Checkboxes, notes and stakes are preserved across re-verification
- [ ] Re-verification of a plan with no rot leaves the plan's content unchanged apart from timestamps
