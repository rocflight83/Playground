# 05: Sourcing depth — subjects the allowlist does not serve

**What to build:** Niche subjects stop producing thin plans. There is no MIT course on competitive barbecue, and ticket 04 restricted sourcing to the durable tier, so subjects outside it come out sparse or warning-laden. This ticket opens up discovery: off-list sources are admitted when they are genuinely the best available, but only through a higher bar — the page is fetched and confirmed to cover the claimed concept before it can enter the plan. The three-to-five resources the plan leans on most are content-verified regardless of tier. At most one paid resource is selected for the whole plan, with its price recorded, and every session stays completable using free materials alone.

**Demo:** a subject the durable tier cannot serve, generated under ticket 04 and again under this one — thin or warning-marked before, full and verified after.

**Blocked by:** 04.

**Spec:** `.scratch/study-plan-generator/spec.md`

**User stories covered:** 31, 32. Also completes the discovery half of 33, 34, 37, 38, whose enforcement lives in ticket 03.

**Status:** ready-for-agent

- [x] Discovery still prefers the durable tier and reaches off-list only when it genuinely improves the plan
- [x] An off-list candidate is fetched and confirmed to cover the claimed concept before admission; a status-only pass never suffices
- [x] The plan's three-to-five anchor resources are identified and content-verified regardless of tier
- [x] At most one paid resource is selected per plan, with its price recorded
- [x] Every session remains completable using free materials alone, so the plan can be started today
- [x] A niche subject that produced a thin or warning-laden plan under ticket 04 now produces a full one
- [x] A well-served subject's plan does not degrade — durable sources are not displaced by off-list ones without cause
