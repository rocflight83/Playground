# 04: Generate mode — well-served subjects

**What to build:** I run one command with a subject, my current level, my available hours per day, and the specific capability I am targeting, and I get back a real, usable plan written to its own directory, with no further questions asked of me.

The generator does the Deconstruction, Selection and Sequencing for me and shows its work — the minimal effective units it found, what it deliberately cut, and why the sessions run in the order they do, naming the endgame it started from or explaining why the subject is prerequisite-chained and must run forward. The 14 sessions each carry one compressed material set, one named artifact, and one binary self-check, sized to the hours I said I have. Sessions 6 and 11 are consolidation slots serving as catch-up when I am behind and spaced review when I am not. The generated plan is then validated, verified and rendered by the machinery from tickets 01–03.

**Scope boundary:** materials are drawn from the preferred durable tier only. Off-list source admission, anchor-resource depth and the paid item are ticket 05's job. That keeps this ticket to plan construction, and it is why the demo subject should be one the durable tier already serves well.

This is still the heaviest ticket and is mostly prompt design. Expect more than one pass.

**Blocked by:** 02, 03.

**Spec:** `.scratch/study-plan-generator/spec.md`

**User stories covered:** 1, 2, 3, 4, 8, 9, 10, 11, 12, 13, 14, 16, 18, 19, 20, 21, 22, 23, 24, 25.

**Status:** ready-for-agent

- [ ] A single command takes subject, current level, hours per day, and target capability, and completes without asking further questions
- [ ] Each plan is written to its own directory identified by a slug derived from the subject, so plans accumulate without collision
- [ ] The plan data is generated first and the page rendered from it; the generator never writes HTML
- [ ] The DISSS preamble presents the deconstruction into minimal effective units, the selection rationale including what was cut, and the sequencing rationale
- [ ] The sequencing rationale explicitly records whether the plan runs backwards from an endgame or forwards through a prerequisite chain, and why
- [ ] DISSS appears as a preamble, not as sessions — no session is spent on meta-work
- [ ] Exactly 14 numbered sessions, no calendar dates
- [ ] Sessions 6 and 11 are consolidation slots, identifiable as such, whose content serves both catch-up and spaced review
- [ ] Every session has exactly one named artifact and exactly one self-check whose answer is unambiguously yes or no
- [ ] Each session's materials are tied to that session's artifact, compressed to the minimum that supports it, and carry estimated durations
- [ ] Each session's total time budget is consistent with the stated hours per day
- [ ] CAFE shapes the daily blocks: compression, repetition of the highest-frequency units across sessions, and encoding hooks where the material benefits
- [ ] Materials come from the preferred durable tier only; no off-list sources in this ticket
- [ ] Generation runs validation and verification before writing, and refuses to write a plan that fails validation
- [ ] Demo: a subject well covered by durable sources produces a site that is genuinely usable end to end
