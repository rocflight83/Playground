# Prototype: what curation looks and feels like on the plan page

**Throwaway.** Answers ticket [#19](https://github.com/rocflight83/Playground/issues/19)
(part of map #12). Nothing here is production code; the winning ideas get
rewritten properly when [#25](https://github.com/rocflight83/Playground/issues/25)
and the app ticket ([#20](https://github.com/rocflight83/Playground/issues/20))
are implemented.

## The question

Three variants of the curation affordances (drop-as-known, swap-material,
redo-session) mounted on the real rendered plan page, switchable via
`?variant=A|B|C`. Flip through them and answer:

1. Is per-material **swap** discoverable without clutter?
2. Does **drop as known** need a confirmation that captures what the learner
   knows — and what shape should it take?
3. Does the learner want to **see the old session** after replacement, and
   where?

Plus the two things every variant has to show: the **pending** state while a
replacement is sourced and verified, and a **refusal** (nothing changes).

## Run it

Open `prototypes/curation/index.html` in a browser. That's it.

- The floating black bar at the bottom switches variants (◀ ▶, or the ←/→
  keys). `state` opens a panel showing the in-memory `currentLevel`,
  in-flight requests, refusals and `curationLog` after every action.
- Sourcing and verifying are timers (1.8 s + 1.5 s). Replacements are
  fabricated from the session being replaced.
- A swap by URL whose URL contains `404`, `dead` or `broken` is **refused
  after verification**, to show what a refusal looks like.
- Sessions 6 and 11 are consolidation slots and refuse drop-as-known.
- State is in memory only; reload to reset.

To rebuild after editing `prototype.js` / `prototype.css` (renders the real
plan through the real renderer, then injects the prototype):

```text
node --experimental-strip-types prototypes/curation/build.ts
```

## The three variants (deliberately structurally different)

| | **A — Inline affordances** | **B — Session menu + history** | **C — Curate mode + tray** |
|---|---|---|---|
| Where the actions live | Inside the open session: a "Swap" link on every material row; "I already know this · Re-plan" row at the bottom of the detail | One always-visible **Curate ▾** button in the session's summary row; swap = "Swap a material…" then pick the row | A masthead **Curate** toggle. Reading mode shows *nothing*; curate mode shows a rail (✓ ↻) beside each session and ⇄ on each material |
| Swap input | Reason chips + a URL field, inline under the material; one click on a chip submits | Modal: reason dropdown *or* URL field | Reason chips + URL field inline under the material |
| Drop confirmation | Inline panel, textarea **prefilled** "I already know: <units>", Drop / Cancel | Modal with an empty textarea (placeholder lists the units) and a preview of the `Already known:` line | No separate confirmation: the textarea *is* the gate — the button is disabled until ≥10 characters are written |
| Pending | In place: the material row or the session detail turns into a pulsing "Sourcing… / Verifying…" and the rest dims | A status bar across the top of the session card; card dims | The session is **untouched**; requests sit in a tray (bottom-right) with `requested › sourcing › verifying › applied` |
| After replacement | New content in place; a muted collapsible **"Previously: …"** fold at the top of the detail; materials show "Replaced · ~~was~~" | New content in place, a **Revised ×N** tag linking to a **Curation history** section at the bottom of the page where the old versions live | New content in place with a collapsible **Before / After** two-column comparison at the top of the detail |
| Refusal | Inline under the material / at the top of the session detail | In the modal (request-stage) or at the top of the card (verification-stage) | In the tray |

## Known gaps (deliberate, from review)

- **Pending in A and B takes over the row / card** (dims it, disables clicks
  until applied). #25 only fixes that the *plan* is untouched until applied —
  which holds in all three — but the *page* being fully usable while pending
  is C's bet alone. Judge the pending question with that in mind.
- **Consolidation slots (6, 11)** hide or disable "drop as known" in every
  variant, so the refusal text for that case is never shown; only a greyed
  control with a tooltip.
- **Budget refusal** (replacement doesn't fit the session's remaining
  minutes) is not demonstrable: fabricated replacements always fit.
- `knownSummary` is fabricated on the page from the learner's text; in the
  real model the intelligence writes it.
- The base page's *Import Progress* button is orphaned once the sessions are
  re-rendered; don't test it here.

## How to answer

Comment on #19 with the verdict per question (a variant letter, or "the X
from B with the Y from C"), then close it. The map's "Decisions so far" gets
one line; #25 re-reads the answer before its Step 1.
