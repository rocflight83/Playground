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
