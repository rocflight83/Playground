# Generate

Read `prompts/policy.md` first — what follows is the generation duty
narrowed to the **make a fresh 14-session plan** task. The renderer, the
validator and the link-checker are downstream; your job is the plan data
and only the plan data.

## Inputs

The invocation supplies four values; missing values are inferred from
what the learner said and written into the plan; ask nothing back. One
command in, one plan out.

- **subject** — what the plan is for.
- **current level** — what the learner already knows. Written into
  `meta.currentLevel` verbatim.
- **hours per day** — the time budget per session. Bounds
  `estimatedTime` (≤ `hoursPerDay × 60`).
- **target capability** — the outcome the plan optimises for. If it fails
  the honest-target test in `prompts/policy.md`, reframe it as that file
  says, and write `meta.honestTarget` and `meta.scopeNote` as a pair.

## Produce a PlanData document

Write a single plan-data document matching `PlanData` in
`src/plan-types.ts` — that file is the contract; read it rather than
guessing field names. Every field below is loaded from there.

1. `meta`: subject, currentLevel, hoursPerDay, targetCapability,
   `generatedAt`, optional `honestTarget`/`scopeNote` as a pair, optional
   `curationLog`.
2. `disssPreamble`: deconstruction, selection rationale, cut list,
   sequencing rationale.
3. `stakes`: leave it as an empty string; the page owns it.
4. `phases`: group the 14 sessions; per-phase `outlierStory` or omitted
   per the rule in `prompts/policy.md`.
5. `sessions`: exactly 14, numbered 1–14. Sessions 6 and 11 are the
   consolidation slots — mark them `consolidation: true`, no others. Each
   carries one `artifactOneLiner`, one binary `selfCheck`, a material set,
   `estimatedTime`, `highFrequencyUnits`, optional `encodingHook`,
   optional `deliverableTemplate` per the rule in `prompts/policy.md`.
6. Every material carries `title`, `url`, `sourceType`, `estimatedDuration`,
   `verification: { status: 'verified-by-status', checkedAt: null }`
   (placeholders — verification overwrites them).

The shell validates the document, fetches every URL against the live web,
measures consumption time from the body it already fetched, warns on
mismatches, replaces failed links, and renders the page. You do not
validate, fetch, measure or render.

## What the shell prints back

Read the JSON summary in this order:

- `"ok": false` with `validationErrors` — fix every listed error and
  re-run. Nothing was written.
- `unresolved` non-empty — each entry is a link that failed verification.
  Search for a replacement covering the same concept, swap it into the
  plan data, and re-run. Two rounds of this is the cap: a slot still
  unresolved after that **stays in the plan**, where the page shows the
  learner a visible warning. Silent deletion is never the answer.
- `durationWarnings` non-empty — each entry is a material whose measured
  consumption time is more than 2× **and** more than 10 minutes from
  your `estimatedDuration` (`direction` says which way it leans). The
  shell measures from the body verification already fetched, on three
  bases: `video-metadata` (YouTube/JSON-LD/og:video/player JSON),
  `stated-read-time` (`N min read` / `N-minute read` /
  `Reading time: N min`), or `word-count` (`<main>` or `<article>` words
  at 200 wpm, with `<script>`, `<style>`, `<noscript>`, `<template>` and
  `<svg>` stripped; fewer than 100 words means unmeasurable). For each
  warning: if the measurement is right, set `estimatedDuration` to it,
  rebalance `estimatedTime` so the artifact keeps its budget, and
  re-run. If the measurement is wrong — a paywall teaser (`words` is
  small for a long article), a JavaScript-rendered shell, or a page whose
  embedded video the metadata does not describe — **keep your estimate**;
  the page then shows the measured figure beside it and the learner can
  judge. **Never** pad or trim an estimate to silence the warning.

Report the plan directory path and any surviving unresolved slot.