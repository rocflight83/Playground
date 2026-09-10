# 09: Redo a single session

**What to build:** When one session turns out to be wrong — bad materials, an artifact that misses the point — I regenerate just that session. New materials, new artifact, new self-check for that session alone; every other session is left exactly as it was. The regenerated session's links are verified and the page re-rendered. My progress on the other thirteen sessions is untouched.

**Blocked by:** 04.

**Spec:** `.scratch/study-plan-generator/spec.md`

**User stories covered:** 57. Partially covered, alongside ticket 08: 58.

**Status:** ready-for-agent

- [ ] A command regenerates one named session of an existing plan in place
- [ ] The regenerated session gets new materials, artifact and self-check consistent with the plan's target and hours
- [ ] Every other session's data is unchanged
- [ ] The regenerated session's links are verified before the plan is written
- [ ] The plan is re-validated after the edit and refuses to write if the change breaks an invariant
- [ ] The page is re-rendered from the updated data
- [ ] Checkboxes, notes and stakes are preserved for every session, including the regenerated one
