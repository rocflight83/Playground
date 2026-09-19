# Replace a session

Read `prompts/policy.md` first — what follows is the replacement duty
narrowed to two of the three curation intents: **drop-as-known** and
**redo-session**. The swap-material duty lives in
`prompts/replace-material.md`; you do not edit it here.

The shell applies the request, verifies only the targeted session's
materials, and writes the plan document and the rendered page in place.
Your job is the request JSON and only the request JSON. The shell refuses
any request that would break the **sprint frame** (14 sessions,
consolidation at 6 and 11, a free path through every session, at most
one paid material) before any network call, with every refusal reason
reported.

## Inputs the caller supplies

Treat them as a contract; if any are missing, ask back.

- the existing plan document from the target directory;
- the **session number** the learner named;
- the **intent** (`drop-as-known` or `redo-session`);
- for `drop-as-known`: the learner's `known` (their own words; defaults
  to your reading of the session's title and `highFrequencyUnits`), and
  the units the dropped session drilled;
- for `redo-session`: an optional `reason` (logged; not applied
  anywhere).

The shell will additionally need to know the units that would fall under
the CAFE repetition floor without the replaced session; you do not need
to compute this — the shell surfaces the merged-plan validation error if
the floor breaks.

## What you reply with

Two callers read this duty. When you were handed a **response schema**,
your reply is that schema filled in — `{ "session": …, "knownSummary": … }`
for drop-as-known (the shell refuses a drop whose `knownSummary` is
missing or empty), `{ "session": … }` for redo-session — and nothing
else: no request envelope, no `intent`, no `at`. When you are writing a
**request file** for the shell's curate command, the request shapes
below apply. In both cases the replacement session is written out in
full: title, materials, `highFrequencyUnits`, artifact, self-check,
`estimatedTime`. A session with empty lists or placeholder strings is not
a replacement, and a session drafted as prose in your reasoning does not
count until it is in the reply.

## Drop-as-known

*"I already know this; give me something that moves me forward."*

Request shape:

```json
{
  "intent": "drop-as-known",
  "at": "<iso>",
  "sessionNumber": 3,
  "known": "<the learner's own words about what they already know>",
  "knownSummary": "<1-2 sentences in the voice of meta.currentLevel, naming the units, not the session>",
  "replacement": { "/* a Session with number === 3 */": "..." }
}
```

Replacement duties:

- Aim the replacement at the plan's current honest target (or stated
  target when no honest target exists). The dropped session is **out of
  the way**; the replacement **advances** the target.
- Do not re-teach anything in `known` or in the extended
  `meta.currentLevel`. The replacement's `highFrequencyUnits` are the
  units it drills; if any of those units overlap with what `known`
  already covers, the artifact does not move the learner forward.
- Read the extended `currentLevel` (the prior paragraphs joined by
  `\n\nAlready known: `) before writing — it tells you what the learner
  has said is in hand across earlier drops.
- Keep drilling the plan's high-frequency units on harder material
  rather than dropping them. The shell checks the CAFE repetition floor
  on the merged plan; do not let the replacement be the one unit-list
  nobody else carries.
- When dropping a late session (11–14), there is no later session to
  advance into. **Deepen** the target (a harder artifact on the same
  target) rather than **extending** past it.
- The shell refuses when the session is a consolidation slot (6, 11).
  Use **redo-session** to rewrite a bad consolidation slot.

## Redo-session

*"This session is wrong; re-plan it."*

Request shape:

```json
{
  "intent": "redo-session",
  "at": "<iso>",
  "sessionNumber": 3,
  "reason": "<optional: what was wrong>",
  "replacement": { "/* a Session with number === 3 */": "..." }
}
```

Replacement duties:

- Read the existing plan data in the target directory and the selected
  session. Aim the replacement at the plan's current honest target (or
  stated target when no honest target exists), keeping that level,
  hours, DISSS units, and consolidation policy.
- The replacement may change title, artifact, self-check, materials,
  estimated time, CAFE fields, the consolidation flag, and the optional
  `deliverableTemplate` (a replacement session may carry its own
  template, drop the one the page was showing, or both — see the
  template rule in `prompts/policy.md`).
- Keep exactly one artifact, one binary self-check, and a free path to
  completion (one free material).
- `replacement.number` must equal `sessionNumber`. The session number is
  what preserves browser progress; the shell refuses a mismatch.
- The shell re-verifies only the replacement session's materials. Other
  sessions' verification records and timestamps ride through unchanged.