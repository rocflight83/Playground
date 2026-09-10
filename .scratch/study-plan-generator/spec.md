# Spec: Ultralearning Study Plan Generator

Status: ready-for-agent

## Problem Statement

When I want to learn a new subject fast, I lose the first several days to meta-work: figuring out what the subject actually decomposes into, which 20% of it carries most of the value, what order to attack it in, and which of the thousands of available resources are worth my time. By the time I have a plan, my motivation has decayed and I have learned nothing.

Existing study plans I can find online have three failure modes. They are reading lists rather than practice schedules, so I can complete one without acquiring any capability. Their links rot, so half the material is dead on arrival. And they are ordered like textbooks — fundamentals first, payoff last — which means I quit before reaching anything that feels like the actual skill.

I want the meta-work done for me, honestly, with verified materials, so that Day 1 is practice.

## Solution

A Claude Code skill, `/study-plan`, that takes a subject plus a small amount of context about me and produces a self-contained static website: a 14-session ultralearning plan built on Tim Ferriss's DISSS and CAFE frameworks.

The skill does the Deconstruction, Selection and Sequencing *for* me and shows its reasoning, so the plan is auditable rather than magic. Stakes remain mine to set. Every session has one compressed material set, one concrete artifact, and one binary self-check, so completing the plan and acquiring the capability are the same act. Every link is machine-verified before the plan ships, and any gap the generator could not fill honestly is marked visibly rather than papered over.

The output is a single HTML file I open from disk. Each session has a checkbox and a notes field, and my progress persists between visits. When links rot weeks later, or a session turns out to be wrong, I can repair that piece without regenerating the whole plan or losing my progress.

## User Stories

### Generating a plan

1. As a learner, I want to invoke a single slash command with a subject, so that I can start a learning sprint without building a plan by hand.
2. As a learner, I want to state my current level, so that the plan does not start below or above where I actually am.
3. As a learner, I want to state my available hours per day, so that each session is sized to time I will actually have.
4. As a learner, I want to state the specific capability I am targeting, so that the plan optimizes for something concrete rather than for "knowing about" the subject.
5. As a learner, I want the generator to tell me when my stated target is not achievable in 14 sessions and reframe it into one that is, so that I am not working toward a wish.
6. As a learner, I want that reframing stated plainly at the top of the plan, so that I understand what I am and am not going to be able to do at the end.
7. As a learner, I want the generator to refuse to silently pretend an impossible target is possible, so that I can trust the rest of the document.
8. As a learner, I want generation to complete without further questions once I have supplied my inputs, so that the tool is repeatable and scriptable.
9. As a learner, I want each generated plan written to its own directory named for the subject, so that I can accumulate plans over time without collisions.

### Understanding how the plan was built

10. As a learner, I want to see how the subject was deconstructed into minimal effective units, so that I can judge whether the decomposition is sound.
11. As a learner, I want to see what the generator deliberately cut from the subject, so that I know what I am trading away for speed.
12. As a learner, I want a stated rationale for the session ordering, so that I can tell whether the order was reasoned about or arbitrary.
13. As a learner, I want the generator to start from the endgame and work backwards when the subject supports it, so that I touch the real skill early instead of grinding fundamentals.
14. As a learner, I want the generator to explain when a subject is prerequisite-chained and must run forward instead, so that I do not mistake a conventional order for a lazy one.
15. As a learner, I want to set my own stakes in a dedicated field near the top, so that I have a real consequence attached to abandoning the sprint.
16. As a learner, I want the DISSS reasoning presented as a preamble rather than as sessions, so that I do not spend a week of a two-week sprint on meta-work.

### Working through sessions

17. As a learner, I want 14 numbered sessions rather than 14 dated days, so that missing a day does not put me permanently "behind."
18. As a learner, I want built-in catch-up slots partway through, so that real life can interrupt the sprint without derailing it.
19. As a learner, I want those catch-up slots to double as spaced review when I am on schedule, so that no session is wasted.
20. As a learner, I want exactly one named artifact per session, so that I always know what "done" means today.
21. As a learner, I want each session's artifact to be producible within my stated hours per day, so that the plan is completable rather than aspirational.
22. As a learner, I want a binary pass/fail self-check for each artifact, so that I cannot fool myself into thinking I completed a session I did not.
23. As a learner, I want each session's study materials to be directly connected to that session's artifact, so that I am never reading something I will not immediately use.
24. As a learner, I want session materials compressed to the minimum that supports the artifact, so that I am not drowning in optional reading.
25. As a learner, I want to see roughly how long each material item takes, so that I can plan a session before starting it.
26. As a learner, I want to record notes against each session, so that I have a trail to review during the consolidation slots.
27. As a learner, I want to check off a session when complete, so that I can see my progress.
28. As a learner, I want my checkboxes and notes to persist when I close and reopen the page, so that I do not lose my progress.
29. As a learner, I want to export my progress to a file and import it back, so that a cleared browser or a new machine does not destroy two weeks of work.

### Trusting the materials

30. As a learner, I want every link in the plan to have been checked before the plan reached me, so that I do not lose a session to a 404.
31. As a learner, I want the generator to prefer durable, well-known sources, so that links are less likely to rot during the sprint.
32. As a learner, I want off-list sources permitted when they are genuinely the best available, so that niche subjects are not starved of material.
33. As a learner, I want an off-list source's content actually read and confirmed relevant before inclusion, so that a page that merely returns 200 does not become a session's anchor.
34. As a learner, I want the handful of resources the plan leans on most to be verified deeply, so that the load-bearing material is trustworthy.
35. As a learner, I want the generator to search for a replacement when a source fails verification, so that a single dead link does not thin out a session.
36. As a learner, I want a visible warning on any session where no verified source could be found, so that I discover the gap before the session rather than during it.
37. As a learner, I want at most one paid resource in the whole plan, with its price shown, so that I am not surprised by the cost of starting.
38. As a learner, I want every session completable using free materials alone, so that I can begin today without waiting on a purchase or a subscription.

### Outlier stories

39. As a learner, I want real examples of people who reached this skill through an unusual route, so that I can see that the conventional path is not the only one.
40. As a learner, I want each story distilled into why the unusual approach worked, so that I get a transferable principle rather than an anecdote.
41. As a learner, I want every story to carry a working citation, so that I can verify it myself.
42. As a learner, I want a story omitted entirely rather than invented when no citable example exists, so that I never absorb a fabricated example as fact.
43. As a learner, I want stories placed at phase boundaries rather than every session, so that they motivate without becoming filler.
44. As a learner, I want subject-specific stories where they exist and well-documented general ones where they do not, so that the section is always substantive.

### Reading the site

45. As a learner, I want a clean, quiet, document-like page, so that I can read it for two weeks without visual fatigue.
46. As a learner, I want the page to respect light and dark mode, so that it is comfortable whenever I study.
47. As a learner, I want sessions collapsed by default with the current one expanded, so that I am not overwhelmed on Day 1.
48. As a learner, I want a collapsed session to still show its number, title, artifact one-liner and checkbox, so that I can skim the whole arc at a glance.
49. As a learner, I want to expand any session on demand, so that I can look ahead or back without navigating away.
50. As a learner, I want phase bands separating the arc, so that I can see the plan's structure.
51. As a learner, I want a persistent progress indicator, so that I can see how far through I am at any moment.
52. As a learner, I want the page to work from a local file with no server and no network, so that I can study offline.
53. As a learner, I want the whole plan to be a single portable HTML file, so that I can move it, email it, or publish it without breaking it.
54. As a learner, I want the page readable on a phone, so that I can review sessions away from my desk.

### Maintaining a plan

55. As a learner, I want to re-verify every link in an existing plan on demand, so that I can find rot before it costs me a session.
56. As a learner, I want re-verification to mark rotted links visibly rather than silently deleting them, so that I know what changed.
57. As a learner, I want to regenerate a single session in place, so that one bad session does not require rebuilding the plan.
58. As a learner, I want my checkboxes and notes preserved across re-verification and single-session regeneration, so that maintenance never costs me progress.
59. As a learner, I want the plan stored as structured data separate from the rendered page, so that I can hand-edit a detail and re-render.
60. As a learner, I want re-rendering to be a deterministic step over that data, so that fixing a typo does not change the design of the page.

## Implementation Decisions

### Shape of the tool

- The tool is a **Claude Code skill**, not an application or a hosted service. The intelligence is prompt design and source curation; the code is a thin deterministic shell around it.
- The skill exposes three **modes**: generate a new plan, verify an existing plan's links, and redo a single session of an existing plan.
- Inputs to generation are the subject plus three structured values: current level, hours available per day, and the specific target capability. No interactive interview.

### Data / render split

- The generator's output is **structured plan data**, never HTML. A separate deterministic renderer turns plan data into the page.
- This split is load-bearing for three reasons: link verification operates over data rather than by scraping markup; the visual design is a one-time investment shared by every plan; and repairing a session is a small data edit rather than a regeneration.
- Each plan occupies its own directory identified by a slug derived from the subject, containing the plan data file and the rendered page.

### Plan data model

The plan document carries, at minimum:

- **Meta**: subject, the target capability as stated, the reframed honest target, hours per day, current level, generation timestamp.
- **Scope note**: present only when stated and honest targets diverge; rendered prominently at the top.
- **DISSS preamble**: the deconstruction into minimal effective units, the selection rationale including what was cut, and the sequencing rationale — which explicitly records whether the plan runs backwards from an endgame or forwards through a prerequisite chain, and why.
- **Stakes**: a user-supplied field, empty at generation time, filled in by the learner in the page.
- **Phases**: ordered groupings of sessions, each with a title and an optional outlier story.
- **Sessions**: 14 of them, numbered, each with a title, a one-line artifact description, a binary self-check statement, an ordered list of materials, and an estimated time budget consistent with the learner's stated hours.
- **Materials**: each with a title, URL, source type, estimated duration, a paid flag with price where applicable, and a verification record.
- **Verification record** per link: outcome of the last check and when it was checked. States must distinguish *verified by status*, *verified by content*, *replaced after failure*, and *unresolved after retries*.
- **Outlier stories**: person or case, the unusual approach, the distilled principle explaining why it worked, and a citation URL. A story without a citation is not represented in the data at all.

### Session structure

- 14 numbered sessions, no calendar dates.
- Two of the 14 are **consolidation slots**, positioned after session 5 and after session 10. They serve as catch-up when behind and spaced review when on schedule. Their content reflects both uses.
- Sessions are shaped by CAFE: materials compressed to the minimum supporting the artifact, repetition of the highest-frequency units emphasized across sessions, and encoding hooks provided where the material benefits from them.
- Exactly one artifact and one binary self-check per session. The self-check must be phrased so that its answer is unambiguously yes or no.

### Sourcing and verification policy

- Source discovery is **tiered**. A preferred tier of durable, well-known domains is used by default. Off-list sources are permitted but must clear a higher bar: successful status check *and* content confirmation that the page covers the claimed concept.
- The three-to-five resources the plan leans on most are content-verified regardless of tier.
- Every URL in the plan is status-checked before the plan is written.
- On verification failure, the generator searches for a replacement covering the same concept and re-verifies. **Maximum two replacement attempts per slot**, so generation always terminates.
- After exhausting retries, the slot is recorded as unresolved and the renderer surfaces a visible warning on the affected session. Silent omission is prohibited.
- **At most one paid resource per plan**, with its price recorded and displayed. Every session must remain completable using only free materials — this is a hard constraint on plan validity, not a preference.
- Outlier stories follow the same discipline: real, citable, verified. No citation means the story is dropped and its absence is visible, never filled with a plausible invention.

### Scope honesty

- Before planning, the generator evaluates whether the stated target is achievable in 14 sessions at the stated hours. Targets requiring physical adaptation, credentialing, or genuinely deep domain mastery are not achievable and must not be presented as such.
- When the stated and honest targets diverge, the generator **reframes rather than refuses**, and states the reframing at the top of the plan in the learner's own terms.
- This scope note is treated as a first-class output of the tool, not an apology.

### The rendered page

- **One self-contained HTML file** per plan, with styles and behavior inlined. No build step, no bundler, no external dependencies, no network access at view time. It must work correctly when opened directly from the filesystem.
- Visual direction: quiet document. Restrained palette, one accent, generous typography, sized for long reading sessions. Both light and dark supported, and the page must never inherit a transparent background.
- Two structural elements break the quiet: a **persistent slim progress spine** and **phase bands** separating the arc.
- Sessions render as collapsed rows by default, showing number, title, artifact one-liner, checkbox, and any verification warning. The current session — the lowest-numbered unchecked one — is expanded on load. Any session can be expanded or collapsed by the learner.
- Expanded sessions show materials with links and durations, the self-check, and a notes field.
- Responsive down to phone widths. Any wide content scrolls within its own container rather than scrolling the page horizontally.

### Progress state

- Checkbox and notes state lives in the browser's local storage, **keyed by session number** so that regenerating a session or re-verifying links preserves it.
- Local storage access is wrapped defensively; the page must render correctly when storage is unavailable or empty.
- An **export/import** control writes and reads progress as a JSON file, providing recovery across browsers and machines. This is the sanctioned escape hatch, given that local storage is per-browser and can be cleared.

### Maintenance modes

- **Verify** re-checks every link in an existing plan, updates verification records with fresh outcomes and timestamps, and re-renders. Newly rotted links become visible warnings; they are not deleted.
- **Redo** regenerates a single session in place — new materials, artifact and self-check — leaving all other sessions untouched, then re-verifies that session's links and re-renders.
- Hand-editing the plan data and re-rendering is a supported workflow and must remain safe; the renderer is a pure function of the data with no hidden state.

### Technology

- Node for the deterministic pieces, vanilla JavaScript and CSS in the page. No framework, no CSS library, no client-side dependencies.
- Web search and fetch capabilities available to the agent perform discovery and verification. No external API keys, no scraping infrastructure, no headless browser.

## Testing Decisions

### What makes a good test here

Tests assert **external behavior only**: given a plan data document, what does the rendered page contain, and given a set of URLs and a controlled fetch, what does the verification report say. Tests must not assert on internal helper functions, CSS class names chosen for styling, DOM structure that carries no meaning, or the exact prose of generated content.

The generation step is non-deterministic prose and is **not** unit tested. It is constrained instead by schema validation, which is tested.

### Seams

There are two, deliberately.

**Seam 1 — the renderer.** A function taking a plan document and returning a complete HTML document. This is the primary seam and the highest available point: everything about the page's structure and behavior is observable through it.

Tested through this seam:

- A representative fixture plan renders a page containing all 14 sessions in order.
- The scope note appears when stated and honest targets diverge, and is absent when they do not.
- The DISSS preamble and sequencing rationale appear.
- Sessions carrying an unresolved material render a visible warning; sessions with fully verified materials do not.
- A paid material renders with its price; a plan with no paid material renders no price affordance.
- Phase bands and outlier stories appear at phase boundaries; a phase with no citable story renders without one and without a placeholder.
- Consolidation slots render as sessions 6 and 11 positions in the sequence and are identifiable as such.
- The output is genuinely self-contained: no external stylesheet, script, or font references.
- Rendering the same fixture twice produces identical output.

**Client-side behavior is tested through this same seam** by loading the rendered output into a DOM environment and driving it — no separate seam for the page's JavaScript:

- Toggling a checkbox persists state; reloading the same markup restores it.
- The lowest-numbered unchecked session is expanded on load; when all are checked, none is force-expanded.
- Notes entered against a session persist and restore.
- Progress indicator reflects the number of checked sessions.
- Export produces a document that, when imported into a fresh page, restores checkbox and notes state exactly.
- The page renders correctly when local storage throws or returns nothing.
- State is keyed such that a plan whose session content changed but whose numbering did not retains its progress.

**Seam 2 — verification.** A function taking a plan document and an injected fetch, returning a verification report. Injecting fetch keeps every test offline and deterministic.

Tested through this seam:

- All-healthy links produce a report with no failures and updated timestamps.
- A link returning 404 is reported as failed.
- A link that fails is retried at most twice before being recorded unresolved.
- An unreachable host is treated as a failure, not an exception that aborts the run.
- Off-list sources require content confirmation; a status-only pass is insufficient for them.
- Schema validation rejects a plan missing required fields, carrying an uncitable story, containing more than one paid item, or containing a session with no free path to completion.

### Prior art

None — this is the repository's first code. These tests establish the conventions: colocated test files, fixture plan documents checked in beside them, injected dependencies rather than module mocking, and assertions on rendered output rather than on internals. Subsequent work should follow this pattern.

## Out of Scope

- Any hosted or multi-user version. No web app, no accounts, no server, no deployment.
- Cross-device or cross-browser progress sync. Export/import is the deliberate substitute.
- A general-purpose CLI usable outside Claude Code. A port is possible later; it is not this spec.
- Plan lengths other than 14 sessions, and configurable session counts.
- Scheduling, calendar integration, reminders, or notifications.
- Spaced-repetition flashcard generation or an SRS engine. The consolidation slots are the entire review mechanism.
- Automatic detection of link rot in the background. Verification is an explicit command the learner runs.
- Editing plan content from within the rendered page. Only checkbox and notes state is writable there.
- Tracking or analytics of any kind.
- An index page across multiple plans.
- Translation or localization.
- Archiving or mirroring source material against future rot.

## Further Notes

- The scope-honesty behavior is likely the most valuable single output of the tool and the easiest to erode under pressure to produce impressive-looking plans. It should be protected accordingly.
- The prohibition on fabricated outlier stories and the requirement that unresolved materials be visibly marked exist for the same reason: a plan that looks complete but contains invented or empty content is strictly worse than one that admits a gap, because the learner discovers the problem only after spending a session on it.
- The two-attempt retry cap is a termination guarantee. It should not be raised without a corresponding bound elsewhere.
- If phone access to plans becomes a real need rather than a nice-to-have, the local-storage decision is the one to revisit; the data/render split means the page could be published with a persistence capability without touching the generator.
- The consolidation slots serving double duty is a deliberate hedge against the main failure mode of two-week sprints — a missed day producing guilt and then abandonment.
