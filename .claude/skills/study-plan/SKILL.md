---
name: study-plan
description: Generate a 14-session ultralearning study plan as a self-contained website.
disable-model-invocation: true
---

# /study-plan

Turn a subject into a 14-session ultralearning sprint, written to its own plan
directory as structured data plus a self-contained page.

You do the planning. The code does validation, link verification and
rendering. **Never write HTML** — you write plan data, and the shell renders it.

## Read first

The policy lives in `prompts/`. Read in this order:

- `prompts/policy.md` — the honest-target test, DISSS, the session shape and CAFE rules, the sourcing policy (two-lane search, per-publisher cap, practitioner tier, off-list bar, anchors, paid-material rule, consumption-time durations, deliverable-template rule, outlier-story rule), and the Preferred / Practitioner source lists. **Shared by every duty file.**
- `prompts/generate.md` — your duty file when producing a fresh 14-session plan.
- `prompts/replace-session.md` — your duty file when a curation replaces a session (`drop-as-known`, `redo-session`).
- `prompts/replace-material.md` — your duty file when a curation replaces one material (`swap-material`).

## Inputs

Four values from the invocation: **subject**, **current level**, **hours per day**, **target capability**. Missing values are inferred from what the learner said and stated in the plan; ask nothing back. One command in, one plan out.

## Generate

Write the plan data to a JSON file matching `PlanData` in `src/plan-types.ts` — that file is the contract; read it rather than guessing field names. Then:

```
npm run generate -- <plan.json> [baseDir]
```

It validates, verifies every URL against the live web, and writes `plan.json` and `index.html` into `baseDir/<subject-slug>/`. `baseDir` defaults to `plans/`. Regenerating the same subject writes alongside the earlier plan rather than over it, so no learner loses recorded progress.

Read the JSON it prints:

- `"ok": false` — fix every listed validation error and re-run. Nothing was written; the gate holds.
- `unresolved` non-empty — each entry is a link that failed verification. Search for a replacement covering the same concept, swap it into the plan data, and re-run. Two rounds of this is the cap: a slot still unresolved after that **stays in the plan**, where the page shows the learner a visible warning. Silent deletion is never the answer.
- `durationWarnings` non-empty — read it the way `prompts/generate.md` says: if the measurement is right, set `estimatedDuration` to it, rebalance `estimatedTime` so the artifact keeps its budget, and re-run. If the measurement is wrong (a paywall teaser, a JavaScript-rendered shell, an embedded video the metadata does not describe), keep your estimate — the page then shows the measured figure beside it and the learner can judge. Never pad or trim to silence the warning.

Report the plan directory path and any surviving unresolved slot.

## Verify mode

When a plan has been sitting on disk for weeks, links will have rotted. Re-verify mode re-checks every URL against the live web and writes the refreshed `plan.json` and `index.html` back into the **same** directory — it does not allocate a new directory and does not touch any other plan.

```
npm run verify -- <planDir>
```

`<planDir>` is the directory the generator wrote (`baseDir/<subject-slug>/`). The command prints a JSON summary identical in shape to generate mode. Read it the same way:

- `unresolved` non-empty — each entry is a link that has rotted since the last check. **The slot is preserved in `plan.json`** with its original title and URL and a status of `unresolved-after-retries`; the rendered session carries a visible "⚠ Unverified material" warning. **Do not edit HTML or delete the unresolved entry.** If you judge a replacement is genuinely better, search for it, swap it into `plan.json`, and re-run `npm run verify`. The same rule applies to outlier-story citations: a rotted citation keeps the story and the page shows a visible "⚠ Unverified citation" tag, so rot is announced rather than papered over.
- `durationWarnings` non-empty — act on it the same way as in generate mode.
- `"ok": false` with `validationErrors` — the on-disk `plan.json` is structurally invalid. Nothing was written; fix the data and re-run.
- `"ok": false` with `error` — the directory does not exist or does not contain `plan.json`. Nothing was written.

Browser checkboxes, notes, and stakes **remain intact** — progress lives in `localStorage` and re-verification does not regenerate it; only the `plan.json` and `index.html` files change. The directory name does not change. Hand-editing `plan.json` and re-rendering with `npm run generate` (writing to a *new* directory) is also a supported workflow but produces a fresh directory; use `npm run verify` when the goal is to keep the existing one.

## Curation

Three learner-initiated changes, all of which replace one session or one material while leaving the **sprint frame** intact — fourteen sessions numbered 1–14, consolidation at sessions 6 and 11, a free path through every session, at most one paid material. A request that would break the frame is refused with the reason named before any network call; the other sessions, the learner's browser progress, the directory name, and every other plan field stay untouched, because progress is keyed by session number and the replacement preserves it.

```
npm run curate -- <planDir> <request.json>
```

`<planDir>` is the directory the generator wrote (`baseDir/<subject-slug>/`). `<request.json>` is a `CurationRequest` JSON document whose shape is the module's interface in `src/curation.ts`; HTML is not accepted. The request carries the replacement already produced — sourcing is judgement work and stays with you. `at` may be omitted; the script fills the current ISO timestamp. The shell itself is pure. The replacement must equal the session / material it replaces on every identity field (`replacement.number` for sessions, the same index for materials) — the shell refuses otherwise. Verification placeholders on the replacement (`{ status: 'verified-by-status', checkedAt: null }`) are overwritten by verification.

`npm run redo -- <planDir> <sessionNumber> <replacement.json>` remains as a one-line alias for `npm run curate` with a `redo-session` request.

### Request shapes

- `drop-as-known` — the learner's `known`, your one-or-two sentence `knownSummary`, and a replacement session with the same number. Duties in `prompts/replace-session.md`.
- `swap-material` — the session, the `materialUrl`, either a `reason` or a `url` the learner trusts, and a replacement material that is always free. Duties in `prompts/replace-material.md`.
- `redo-session` — the session number and a replacement session with the same number. Duties in `prompts/replace-session.md`.

### Reading the printed JSON

- `"ok": true` — the directory was updated in place. The summary carries `planDir`, `planPath`, `htmlPath`, `intent`, `sessionNumber`, `unresolved`, and `durationWarnings`. Report any `unresolved` entries (links that failed verification — they stay on the page with a visible "⚠ Unverified material" warning). Read `durationWarnings` the same way as in generate mode.
- `"ok": false` with `refused` and `stage` — the curation was refused; the directory on disk is **byte-identical** to before. `stage` is one of `request` (the request shape broke the sprint frame), `merged-plan` (the merged plan failed validation), or `verification` (only on the swap-material url path: the learner-supplied URL did not verify, and `searchReplacement` was never called). Fix the listed `refused` reasons and re-run. The learner can supply another URL or switch to the reason path on a url-path refusal.
- `"ok": false` with `validationErrors` — the on-disk plan is structurally invalid. Nothing was written; fix the data and re-run.
- `"ok": false` with `error` — the directory or request file is wrong (missing `plan.json`, request file looks like HTML, JSON parse error, …). Nothing was written; fix and re-run.

You write the request JSON and the plan data only. You never write HTML, never touch the other thirteen sessions, and never invent the replacement.