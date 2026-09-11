---
name: study-plan
description: Generate a 14-session ultralearning study plan as a self-contained website.
disable-model-invocation: true
---

# /study-plan

Turn a subject into a 14-session ultralearning sprint, written to its own plan
directory as structured data plus a self-contained page.

You do the Deconstruction, Selection and Sequencing. The code does validation,
link verification and rendering. **Never write HTML** — you write plan data,
and `npm run generate` renders it.

## Inputs

Four values, taken from the invocation: **subject**, **current level**,
**hours per day**, **target capability**. Missing values are inferred from what
the learner said and stated in the plan; ask nothing back. One command in, one
plan out.

## Steps

### 1. Set an honest target

Decide whether the target capability is reachable in 14 sessions at the stated
hours. Targets needing physical adaptation, credentialing, or deep domain
mastery are not.

When the honest target differs from the stated one, **reframe rather than
refuse**: write the reachable version to `meta.honestTarget` and say plainly in
`scopeNote` what the learner will and will not be able to do. The scope note is
a first-class output, not an apology. Both fields stay absent when the stated
target is already honest.

### 2. Deconstruct, select, sequence

Three pieces of `disssPreamble`, each shown as reasoning the learner can audit:

- **Deconstruction**: the minimal effective units the subject breaks into. Name
  them the way you will name them again in every session's
  `highFrequencyUnits` — identical strings, so repetition is visible.
- **Selection rationale** and **cutList**: the 20% carrying most of the value,
  and what you deliberately dropped. The cut list is what the learner trades
  away for speed; it is always populated.
- **Sequencing rationale**: state explicitly whether the plan runs **backwards**
  from an endgame or **forwards** through a prerequisite chain, and why.
  Backwards is the default — it puts the real skill in week one. Forwards is
  legitimate only when each unit genuinely cannot be attempted before the last,
  and then you say so in those terms.

This is a preamble. No session is spent on meta-work.

### 3. Build 14 sessions

Each session carries exactly one named artifact, exactly one binary self-check,
and a compressed material set sized to the day.

- **Artifact** (`artifactOneLiner`): something produced, not something read.
- **Self-check**: phrased so its answer is unambiguously yes or no. "Can I
  parse two subcommands from one CLI?" — not "Do I understand argparse?"
- **Materials**: only what the artifact needs. Each carries an honest
  `estimatedDuration`, and their total must fit inside `estimatedTime`, which
  must itself fit inside `hoursPerDay × 60`. Both are enforced.
- **CAFE**: `highFrequencyUnits` names the units this session drills, drawn
  from the deconstruction. The highest-frequency units recur across the sprint
  — at least one unit appears in three or more sessions, enforced. Add an
  `encodingHook` (a mnemonic or framing that makes the material stick) only
  where the material benefits; leave it off elsewhere.

**Sessions 6 and 11 are the consolidation slots**, and only those. Mark them
`consolidation: true`. Their content serves both uses at once: catch-up when
the learner is behind, spaced review of the highest-frequency units when they
are not. Write the artifact and self-check so both readings work.

### 4. Source the materials

Durable tier only — see [Preferred sources](#preferred-sources). Off-list
sources are rejected by validation in this mode.

At most **one paid material in the whole plan**, with its `price` set, and
every session must remain completable from free materials alone. Both enforced.

Group the sessions into phases. Give a phase an `outlierStory` only when you
have a real, citable person or case: the unusual approach, the transferable
principle explaining why it worked, and a working citation URL. **No citation
means no story** — a phase without one renders without one, and nothing is
invented to fill the gap.

Leave `stakes` as an empty string. It is the learner's to fill in on the page.

### 5. Generate

Write the plan data to a JSON file matching `PlanData` in
[`src/plan-types.ts`](../../../src/plan-types.ts) — that file is the contract;
read it rather than guessing field names. Then:

```
npm run generate -- <plan.json> [baseDir]
```

It validates, verifies every URL against the live web, and writes `plan.json`
and `index.html` into `baseDir/<subject-slug>/`. `baseDir` defaults to `plans/`.
Regenerating the same subject writes alongside the earlier plan rather than
over it, so no learner loses recorded progress.

Read the JSON it prints:

- `"ok": false` — fix every listed validation error and re-run. Nothing was
  written; the gate holds.
- `unresolved` non-empty — each entry is a link that failed verification.
  Search for a replacement covering the same concept, swap it into the plan
  data, and re-run. Two rounds of this is the cap: a slot still unresolved
  after that **stays in the plan**, where the page shows the learner a visible
  warning. Silent deletion is never the answer.

Report the plan directory path and any surviving unresolved slot.

## Preferred sources

Durable, well-known, unlikely to rot inside a two-week sprint:

- Official documentation and specifications for the language, library or tool.
- Standards bodies: MDN, W3C, IETF RFCs, POSIX.
- University course material: MIT OCW, Stanford, Berkeley, CMU.
- Long-lived reference works and their official sites.
- The project's own repository and its maintained guides.
- Established technical publishers' freely readable material.

Prefer a canonical page over a blog post restating it.
