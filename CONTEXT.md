# Ultralearning Study Plan Generator

A skill plus a deterministic shell that turns a learner's subject, target and
time into a fourteen-session plan rendered as one self-contained page, and
then keeps that plan honest as the learner curates it.

## Language

### The plan

**Plan**:
One learner's fourteen-session sprint toward one target capability, held as
plan data and rendered to one page.
_Avoid_: course, curriculum, schedule

**Session**:
One numbered day of the plan: an artifact, a binary self-check and the
materials that artifact needs. Its number is its identity and is what the
learner's progress is keyed by.
_Avoid_: day, lesson, module

**Material**:
One resource a session's artifact needs, identified within its session by its
URL.
_Avoid_: link, resource, source

**Sprint frame**:
The invariants every plan satisfies before and after any change: fourteen
sessions, consolidation at sessions 6 and 11, a free path through every
session, at most one paid material.
_Avoid_: schema, constraints, rules

**Consolidation slot**:
Session 6 or 11: a catch-up and spaced-review session that drills the other
sessions' high-frequency units rather than introducing its own.
_Avoid_: review day, buffer

**Current level**:
The plan's statement of what the learner already knows, which every session
and every replacement is written against. Grows by appending as sessions are
dropped as known.
_Avoid_: prior knowledge, background, profile

### Curation

**Curation**:
A learner-initiated change to a plan that replaces one session or one
material and leaves the sprint frame intact.
_Avoid_: edit, regenerate, customise

**Intent**:
The kind of curation the learner is asking for: drop-as-known, swap-material
or redo-session.
_Avoid_: action, operation, command

**Drop-as-known**:
The intent to replace a session the learner already knows with one that
advances the target, recording what is known in the current level.
_Avoid_: skip, remove, delete

**Swap-material**:
The intent to replace one material in a session with another that does the
same job, chosen either for a stated reason or from a URL the learner
supplies.
_Avoid_: change link, replace resource

**Redo-session**:
The intent to re-plan one session that is wrong, against the plan as it now
stands.
_Avoid_: regenerate session, retry

**Replacement**:
The session or material the intelligence produces to take the place of the
one being curated. Always verified before it enters the plan.
_Avoid_: new version, update

**Refusal**:
The outcome of a curation that would break the sprint frame or whose
replacement could not be verified: nothing in the plan changes and every
reason is reported.
_Avoid_: error, failure

**Curation record**:
The durable trace of one applied curation: its intent, when, why, and the
session or material it replaced.
_Avoid_: history entry, audit log

### Sourcing and verification

**Sourcing**:
The intelligence's work of choosing a session's or replacement's materials.
_Avoid_: search, lookup

**Verification**:
The shell's check that a material's URL is live and, where the bar requires
it, that its page covers the concept claimed for it.
_Avoid_: validation (which is the structural check of plan data), link check

**Intelligence**:
Whatever produces plan prose and replacements — the `/study-plan` skill today,
the app's prompts later. Never the shell. Its policy lives in `prompts/`.
_Avoid_: the model, the AI, the generator

### The app

**Store**:
Where plans, their exports and the learner's progress are kept: the plan
directory today, a database later.
_Avoid_: database, files

**Live page**:
The plan page the app serves: the rendered page plus a curation layer that
talks to the app.
_Avoid_: UI, front end, SPA

**Export**:
The self-contained copy of the plan page that loads nothing from the network
and keeps its progress in the browser.
_Avoid_: static site, download

**Job**:
One in-flight generate, curate or verify request and its stage. Lives in
memory, never in the plan.
_Avoid_: task, operation
