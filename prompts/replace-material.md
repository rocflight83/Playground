# Replace a material

Read `prompts/policy.md` first — what follows is the replacement duty
narrowed to the **swap-material** intent. The session duties live in
`prompts/replace-session.md`; you do not edit them here.

The shell applies the request, verifies only the swapped material, and
writes the plan document and the rendered page in place. Your job is the
request JSON and only the request JSON. The shell refuses any request
that would break the **sprint frame** (14 sessions, consolidation at 6
and 11, a free path through every session, at most one paid material)
before any network call, with every refusal reason reported.

## Inputs the caller supplies

Treat them as a contract; if any are missing, ask back.

- the existing plan document from the target directory;
- the **session number** the material belongs to;
- the **material URL** the learner named;
- **either** a reason (`{ "reason": "<free text>" }` — *too basic*,
  *too advanced*, *want a practitioner take*, *wrong format*, *dead
  link*, …) **or** a URL the learner supplies
  (`{ "url": "https://learner.example.com/article" }`).

## What you reply with

Two callers read this duty. When you were handed a **response schema**,
your reply is that schema filled in — the replacement `Material` itself
(`title`, `url`, `sourceType`, `estimatedDuration`, `verification`
placeholders), or `{ "url": … }` when the schema asks only for a URL —
and nothing else: no request envelope. When you are writing a **request
file** for the shell's curate command, the request shape below applies.
Either way the material is written out in full; a placeholder is not a
replacement.

## Request shape

```json
{
  "intent": "swap-material",
  "at": "<iso>",
  "sessionNumber": 3,
  "materialUrl": "https://example.com/the-material-being-swapped",
  "by": { "reason": "too dense" },
  "replacement": { "/* a Material with paid: false */": "..." }
}
```

`by` is exactly one of the two shapes. The replacement's
`estimatedDuration`, the units it serves, and the remaining budget on
the session are the shell's gate; the rest of the swap is yours.

## Replacement duties

- Same units as the old material served. The artifact still has to be
  buildable from the session's set.
- Honour the reason. *too basic* moves to a harder source on the same
  unit; *too advanced* moves to a clearer one; *want a practitioner
  take* reaches for Lane B; *wrong format* swaps a video for a written
  resource or vice versa.
- Fit the remaining budget:
  `replacement.estimatedDuration ≤ session.estimatedTime − Σ(other materials' estimatedDuration)`.
  If the replacement is too long, the shell refuses — pick something
  shorter.
- `paid: false` is required. Curation never introduces a paid material;
  swapping the only paid material out is allowed and leaves the plan
  with zero paid materials.
- **Url path** — fill in `title`, `sourceType` (`'off-list'` unless the
  URL is preferred-tier; `'practitioner'` when the URL qualifies per
  `prompts/policy.md`), and `estimatedDuration`. The URL itself is not
  changed. The shell verifies the URL to the **off-list bar** (page
  must cover the concept) and never substitutes: a learner-supplied URL
  is either admitted or refused.
- **Reason path** — the shell uses the existing verification behaviour
  (status or content check per tier; up to two replacement attempts when
  `searchReplacement` is wired, but the curate command does not wire
  it). An unverifiable replacement is written with
  `unresolved-after-retries` and the page shows the same warning as a
  rotted link.