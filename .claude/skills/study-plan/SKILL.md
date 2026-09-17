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

Before any planning, decide whether the **target capability** is reachable in
14 sessions at the stated hours per day. Answer these three questions; a
"yes" to any of them means the target is **not** reachable as stated:

1. **Physical adaptation?** Does reaching it require the body to change —
   strength, endurance, flexibility, callus, reaction time trained over
   months? (Add 200lb to a deadlift; run a sub-3 marathon; play a Chopin
   étude at tempo from scratch.)
2. **Credentialing?** Does reaching it require an exam, licence, degree,
   certification, or someone else\'s sign-off? (Become a neurosurgeon; pass
   the bar; get a pilot\'s licence.)
3. **Genuinely deep mastery?** Would an honest expert say it takes years of
   accumulated exposure regardless of hours per day? (Fluent Mandarin;
   contribute a new result in algebraic topology; be hired as a senior
   compiler engineer.)

Also fail the target if 14 × hoursPerDay hours is plainly too little for it
even without those three — for example a 40-hour target at 1 hour a day.

**If all three answers are "no" and the hours fit:** the stated target is
honest. Leave `meta.honestTarget` and `scopeNote` **absent** (not empty
strings — omit the fields). Validation rejects an `honestTarget` identical to
`targetCapability`, so do not copy it across.

**If the target is not reachable:** reframe, never refuse, and never plan
the wish as if it were reachable. A plan is always produced. To reframe:

- Keep the **subject** and the learner\'s **motive**; shrink the **outcome**
  to the load-bearing fraction reachable in 14 sessions. The honest target
  must be a real step *on the road to* the stated one, not a substitute
  topic. "Become a neurosurgeon" → "Read a head CT for the six most common
  emergencies and explain the surgical decision for each", not "learn
  first aid". "Add 200lb to my deadlift" → "Own a technically sound
  deadlift, a 14-session programme I can run, and a baseline 1RM to build
  from", not "learn about nutrition".
- Write the reframed outcome to `meta.honestTarget`. Phrase it like a
  target capability: something the learner can do at session 14.
- Write `scopeNote` using this template, filling every bracket in the
  learner\'s own words from the invocation:

  > You asked for [stated target]. In 14 sessions at [N] hours a day the
  > honest target is [honest target]. [One or two sentences: what makes the
  > stated target out of reach in this window, and what the honest target
  > gives the learner toward it.]

  The rendered page adds the two targets around the note itself, so the
  note\'s job is the plain reasoning. It is a first-class output, not an
  apology: state it flatly, in the same voice as the rest of the plan.
- Every one of the 14 sessions then aims at `honestTarget`. If a session\'s
  artifact only makes sense for the original wish, it is the wrong artifact.

Both fields travel together: `honestTarget` without `scopeNote`, or
`scopeNote` without `honestTarget`, is rejected by validation.

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
  `estimatedDuration` — **consumption time** for one read of the page or one
  watch of the video at the learner's stated level, not the time the learner
  will spend doing anything with it. The time to *do* the thing belongs to
  the artifact. Materials' totals must fit inside `estimatedTime`, which must
  itself fit inside `hoursPerDay × 60`. Both are enforced.
- **Time budget**: `estimatedTime` is the materials' consumption time plus
  the artifact time. **Write the artifact time as the remainder**, not as a
  separate guess: `Σ estimatedDuration` for materials, `estimatedTime − Σ`
  for the artifact. The rendered page surfaces this split as `N min on
  materials · M min on the artifact` so the learner sees the artifact budget
  visibly. **Outside the consolidation slots, the artifact time should be at
  least half of `estimatedTime`** — a session that is mostly reading is a
  reading session, not an ultralearning session, so cut or shorten materials
  rather than pad the estimate. This is a prompt rule, not a validator rule:
  a consolidation slot is honestly review-heavy and a validator floor would
  push you to fake the split.
- **Video**: a video's `estimatedDuration` is its runtime (one watch).
  Verification fetches the watch page and confirms it names the runtime in
  `<meta itemprop="duration">`, `<meta property="og:video:duration">`, the
  player JSON's `lengthSeconds`, or a JSON-LD `VideoObject.duration`. If the
  watch page disagrees with your estimate by more than a factor of 2 **and**
  by more than 10 minutes, the shell warns — see step 5.
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

Discovery is two-lane, every phase, run deliberately rather than as a fallback.
**Lane A** is the canonical lane (the preferred tier — see
[Preferred sources](#preferred-sources)) for what a unit **is**: the
definition, the API, the spec. **Lane B** is the practitioner lane (see
[Practitioner sources](#practitioner-sources)) for how a unit is **done**:
a named practitioner's own recorded talk, video lecture or series, blog post,
podcast episode, or book. Every phase gets at least one Lane B search before
its materials are written, on the phase's `highFrequencyUnits`, whether or
not Lane A already covers them. A subject where Lane A fully covers a unit is
still paired with a Lane B take when the session's artifact benefits from a
worked example, a walkthrough, or a judgement call the canonical page does not
make (the manual says what `cross_validate` does; a practitioner shows why
walk-forward splits are the only honest choice for a trading backtest).

Tier the resulting material:

- **`preferred`** — Lane A: canonical page for the unit. See
  [Preferred sources](#preferred-sources).
- **`practitioner`** — Lane B: a named practitioner's own material on how the
  unit is done. See [Practitioner sources](#practitioner-sources). Books
  enter through their publisher's or author's page, which carries the blurb
  verification reads.
- **`off-list`** — a niche resource genuinely the best available for what the
  session needs, neither canonical nor a practitioner's own take. Reach this
  tier deliberately, only when neither Lane A nor Lane B covers the unit well
  enough.

A subject well served by the preferred tier still pairs at least one Lane B
material per phase; a niche subject where Lane A and Lane B both fall short
gets off-list fallbacks rather than a thin plan. Off-list is reached
**deliberately** for niche units, not by default.

Verification is the bar: every non-`preferred` material (practitioner **and**
off-list) has its page fetched and the body **confirmed to cover the claimed
concept** before the resource enters the plan — same `pageCoversConcept` test,
same retries, same `unresolved-after-retries` outcome. A status-only pass never
suffices for either tier. The plan's three-to-five anchor resources (the
materials the plan leans on most) are content-verified **regardless of tier**,
so a preferred-tier anchor is held to the same standard.

**Per-publisher cap: at most 4 distinct URLs per publisher in the whole plan,
where a publisher is the registrable domain (`cdn.cboe.com` and `www.cboe.com`
are one) or, on hosting platforms, the tenant (`ranaroussi.github.io`,
`github.com/vollib`); enforced by validation.** Keep a running tally of
distinct URLs per publisher as you write each session. When the running count
hits 4 for a publisher, the next material from that publisher is replaced: Lane
B first, then off-list, then a different preferred publisher. If nothing else
covers the unit, the session keeps fewer materials — never a padding link.
**A video-host URL (`youtube.com`, `youtu.be`, `vimeo.com`) does not name the
channel behind the video**, so the cap cannot see it. Apply the same
"at most 4 per publisher" rule to a YouTube channel by hand: if you find
yourself queuing six videos from the same channel, pick another. Distinct URLs
are counted after normalization (lowercase scheme + host, fragment removed,
trailing slash removed, query kept), so a page reused for spaced review in a
later session does not eat the publisher's budget. Outlier-story citations are
phase-level metadata, not materials, and are not counted.

**Forum tripwire**: a forum thread is never practitioner-tier. Reddit, Stack
Overflow / Stack Exchange, Hacker News, Quora, Discourse instances, mailing-list
archives — all excluded from the practitioner tier by `validatePlan`. They may
still be admitted off-list under the existing rules when they are genuinely
the best available. The exclusion lives in the validator, not in your head.

At most **one paid material in the whole plan**, with its `price` set, and
every session must remain completable from free materials alone. Both enforced.

Group the sessions into phases. For each phase, look for a real, named person
or documented case that reached the skill through an unusual route,
**specific to the plan's subject domain and recognisably about a high-frequency
unit drilled in this phase**. A general-legend fallback (a famous practitioner
whose contribution is at one remove from the subject — Thorp, Dalio, Simons,
Soros for an options-system plan) is not subject-specific and must be omitted,
not used. Diagnostic: would a reader who knows the subject recognise this
person as being in this subject, **and** would the transferable principle map
cleanly onto one of the phase's `highFrequencyUnits`? Both must hold. Record
the unusual approach and the transferable principle that explains why it worked
as separate fields. At most one `outlierStory` per phase, at the phase
boundary. Add the story only when its citation is a working URL that will pass
the generator's verification. If a search returns only general-legend
candidates, or none whose approach aligns with the phase's high-frequency units,
omit `outlierStory` entirely — never invent a story, use a composite, fall back
to a general legend, or fill the gap yourself. The generator renders a quiet
"No subject-specific outlier case found for this phase" note at the phase
boundary. Do at least one real search per phase; do not skip later phases
because an early one yielded nothing.

The skill writes plan data only, never HTML. The renderer emits the placeholder.

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
- `durationWarnings` non-empty — each entry is a material whose measured
  consumption time is more than 2× **and** more than 10 minutes from your
  `estimatedDuration` (`direction` says which way it leans). The shell
  measures from the body verification already fetched, on three bases:
  `video-metadata` (YouTube/JSON-LD/og:video/player JSON), `stated-read-time`
  (`N min read` / `N-minute read` / `Reading time: N min`), or `word-count`
  (`<main>` or `<article>` words at 200 wpm, with `<script>`, `<style>`,
  `<noscript>`, `<template>` and `<svg>` stripped; fewer than 100 words means
  unmeasurable). For each warning: if the measurement is right, set
  `estimatedDuration` to it, rebalance `estimatedTime` so the artifact keeps
  its budget, and re-run. If the measurement is wrong — a paywall teaser
  (`words` is small for a long article), a JavaScript-rendered shell, or a
  page whose embedded video the metadata does not describe — **keep your
  estimate**; the page then shows the measured figure beside it and the
  learner can judge. **Never** pad or trim an estimate to silence the
  warning.

Report the plan directory path and any surviving unresolved slot.

## Verify mode

When a plan has been sitting on disk for weeks, links will have rotted.
Re-verify mode re-checks every URL against the live web and writes the
refreshed `plan.json` and `index.html` back into the **same** directory — it
does not allocate a new directory and does not touch any other plan.

```
npm run verify -- <planDir>
```

`<planDir>` is the directory the generator wrote (`baseDir/<subject-slug>/`).
The command prints a JSON summary identical in shape to generate mode. Read
it the same way:

- `unresolved` non-empty — each entry is a link that has rotted since the
  last check. **The slot is preserved in `plan.json`** with its original title
  and URL and a status of `unresolved-after-retries`; the rendered session
  carries a visible "⚠ Unverified material" warning. **Do not edit HTML or
  delete the unresolved entry.** If you judge a replacement is genuinely
  better than the now-dead one, search for it, swap it into `plan.json`, and
  re-run `npm run verify` so the new link is checked and the page is
  re-rendered with the replacement. The same rule applies to outlier-story
  citations: a rotted citation keeps the story in `plan.json` and the page
  shows a visible "⚠ Unverified citation" tag next to the link, so rot is
  announced rather than papered over by silent deletion.
- `durationWarnings` non-empty — act on it the same way as in generate mode:
  if the measurement is right, update `estimatedDuration` in `plan.json`,
  rebalance `estimatedTime` so the artifact keeps its budget, and re-run
  `npm run verify` to re-measure and re-render. If the measurement is wrong
  (a paywall teaser, a JavaScript-rendered shell, an embedded video the
  metadata does not describe), keep your estimate — the page then shows the
  measured figure beside it and the learner can judge. Do not pad or trim
  an estimate to silence the warning.
- `"ok": false` with `validationErrors` — the on-disk `plan.json` is
  structurally invalid (likely a hand-edit gone wrong). Nothing was written;
  fix the data and re-run.
- `"ok": false` with `error` — the directory does not exist or does not
  contain `plan.json`. Nothing was written; pass a real plan directory
  (typically `plans/<subject-slug>/`).

Tell the learner that browser checkboxes, notes, and stakes **remain
intact** — progress lives in `localStorage` under the per-session key, and
re-verification does not regenerate that storage, only the `plan.json` and
`index.html` files in the directory. The directory name does not change.

`npm run verify` is the only maintenance step the skill runs. Hand-editing
`plan.json` and re-rendering with `npm run generate` (writing to a *new*
directory) is also a supported workflow but produces a fresh directory; use
`npm run verify` when the goal is to keep the existing one.

## Redo mode

When a single session turns out to be wrong — the artifact does not deliver,
the materials are wrong, the self-check is a moving target — re-plan that
session against the plan's current honest target (or stated target when no
honest target exists), level, hours, DISSS units, and consolidation policy,
and replace just it in place. The other thirteen sessions, the learner's
browser progress, the directory name, and every other plan field all stay
untouched, because progress is keyed by session number and the replacement
preserves it.

```
npm run redo -- <planDir> <sessionNumber> <replacement.json>
```

- `<planDir>` is the directory the generator wrote (`baseDir/<subject-slug>/`).
- `<sessionNumber>` is the integer session number being replaced (1–14).
- `<replacement.json>` is a `Session` document (see `Session` in
  [`src/plan-types.ts`](../../../src/plan-types.ts)) whose `number` equals
  `<sessionNumber>`. The replacement may change title, artifact, self-check,
  materials, estimated time, CAFE fields, and the consolidation flag. **Do not
  rewrite the other sessions** — write only the one replacement file.
- HTML is not accepted: the deterministic shell only ever works from
  structured plan data.

Re-plan the one session:

- Read the existing `plan.json` in the target directory and the selected
  session. The replacement is shaped to fit the plan the generator built:
  its DISSS units come from the same deconstruction, its level matches the
  stated current level, its time budget fits `hoursPerDay`, and its
  consolidation flag (if any) follows the same session-6 and session-11
  rule. Aim the replacement at the plan's current honest target (or stated
  target when no honest target exists), keeping that level, hours, DISSS
  units, and consolidation policy.
- Keep exactly one artifact, one binary self-check, and a free path to
  completion (one free material), same as a generated session.
- Source and verify only the replacement session's materials: the command
  re-verifies those URLs against the live web before re-rendering. Other
  sessions' links are not re-checked and their timestamps are not refreshed,
  so their previous verification records survive.

Write the temporary `replacement.json`, then run the command. Read the JSON
it prints:

- `"ok": true` — the directory was updated in place. Tell the learner the
  plan now contains the new session, and report any `unresolved` entries
  (links that failed verification — they stay on the page with a visible
  "⚠ Unverified material" warning, the same affordance as a rotted link in
  verify mode). Read `durationWarnings` the same way as in generate mode:
  set `estimatedDuration` to the measurement when it is right and
  rebalance `estimatedTime` so the artifact keeps its budget; otherwise
  keep the estimate.
- `"ok": false` with `validationErrors` — the merged plan (the existing
  twelve untouched sessions plus the replacement) failed validation.
  Fix the listed errors and re-run. Nothing was written.
- `"ok": false` with `error` — the directory or replacement file is wrong
  (missing `plan.json`, replacement's session number does not match,
  replacement file looks like HTML, JSON parse error, …). Nothing was
  written; fix and re-run.

The skill writes the replacement JSON and the plan data only. It never
writes HTML, and it never touches the other thirteen sessions.

## Preferred sources

Durable, well-known, unlikely to rot inside a two-week sprint:

- Official documentation and specifications for the language, library or tool.
- Standards bodies: MDN, W3C, IETF RFCs, POSIX.
- University course material: MIT OCW, Stanford, Berkeley, CMU.
- Long-lived reference works and their official sites.
- The project's own repository and its maintained guides.
- Established technical publishers' freely readable material.

Prefer a canonical page over a blog post restating it.

## Practitioner sources

A practitioner material is one where a **named practitioner** — a person who
did the thing and is explaining how — is speaking in their own voice. A
practitioner's own recorded talk, video lecture or series, blog post, podcast
episode, or book (the book's blurb enters through the publisher or author
page). The person matters: a practitioner tier is not "a good tutorial on
topic X", it is the person who did the work telling you how. Forum threads
(Reddit, Stack Overflow / Stack Exchange, Hacker News, Quora, Discourse
instances, mailing-list archives) are never practitioner-tier — they may
still be admitted off-list when genuinely the best. Aggregator listicles,
anonymous tutorials, and content farms are never practitioner-tier either.

What qualifies:

- A practitioner's own recorded talk or conference presentation, on their own
  site, a conference site, or YouTube (a video's watch page is what verification
  fetches; transcripts are not fetched).
- A practitioner's own video lecture series.
- A practitioner's own blog post.
- A practitioner's own podcast episode.
- A book by the practitioner, entered through the publisher's or author's page.

What does not qualify:

- Forum threads — always off-list at best, never practitioner.
- Aggregator listicles and content farms.
- Anonymous tutorials.
- A second-hand summary of the practitioner's work (a news write-up of a
  practitioner's results, an explainer that quotes them).

Planning-time duty for video practitioner sources: before admitting a video,
confirm from the transcript, chapters, or description that the video
**actually covers the unit** (not just its title), and set `estimatedDuration`
to the runtime (consumption time — how long one watch takes). Verification
fetches the watch page (title, description, embedded player JSON) and confirms
it covers the concept, so a title-only match is not enough; a watch page that
returns a consent or bot interstitial fails the content check the same way any
other page does, and surfaces as `unresolved-after-retries` with the existing
warning.
