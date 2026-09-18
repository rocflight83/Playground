# Policy

This file is shared by every prompt: it is what stays true whether you are
generating a plan, replacing a session or replacing a material. Read it
first; the duty files then narrow it to one task. It contains no commands
and no file names — those live in the path-specific duties.

## Set an honest target

Before any planning, decide whether the **target capability** is reachable
in **14 sessions** at the stated hours per day. Answer these three
questions; a "yes" to any of them means the target is **not** reachable as
stated:

1. **Physical adaptation?** Does reaching it require the body to change —
   strength, endurance, flexibility, callus, reaction time trained over
   months? (Add 200lb to a deadlift; run a sub-3 marathon; play a Chopin
   étude at tempo from scratch.)
2. **Credentialing?** Does reaching it require an exam, licence, degree,
   certification, or someone else's sign-off? (Become a neurosurgeon; pass
   the bar; get a pilot's licence.)
3. **Genuinely deep mastery?** Would an honest expert say it takes years of
   accumulated exposure regardless of hours per day? (Fluent Mandarin;
   contribute a new result in algebraic topology; be hired as a senior
   compiler engineer.)

Also fail the target if 14 × hoursPerDay hours is plainly too little for it
even without those three — for example a 40-hour target at 1 hour a day.

**If all three answers are "no" and the hours fit:** the stated target is
honest. Leave `meta.honestTarget` and `scopeNote` **absent** (not empty
strings — omit the fields). Validation rejects an `honestTarget` identical
to `targetCapability`, so do not copy it across.

**If the target is not reachable:** reframe, never refuse, and never plan
the wish as if it were reachable. A plan is always produced. To reframe:

- Keep the **subject** and the learner's **motive**; shrink the **outcome**
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
  learner's own words from the invocation:

  > You asked for [stated target]. In 14 sessions at [N] hours a day the
  > honest target is [honest target]. [One or two sentences: what makes the
  > stated target out of reach in this window, and what the honest target
  > gives the learner toward it.]

  The rendered page adds the two targets around the note itself, so the
  note's job is the plain reasoning. It is a first-class output, not an
  apology: state it flatly, in the same voice as the rest of the plan.
- Every one of the 14 sessions then aims at `honestTarget`. If a session's
  artifact only makes sense for the original wish, it is the wrong artifact.

Both fields travel together: `honestTarget` without `scopeNote`, or
`scopeNote` without `honestTarget`, is rejected by validation.

## Deconstruct, select, sequence

Three pieces of `disssPreamble`, each shown as reasoning the learner can
audit:

- **Deconstruction**: the minimal effective units the subject breaks into.
  Name them the way you will name them again in every session's
  `highFrequencyUnits` — identical strings, so repetition is visible.
- **Selection rationale** and **cutList**: the 20% carrying most of the
  value, and what you deliberately dropped. The cut list is what the
  learner trades away for speed; it is always populated.
- **Sequencing rationale**: state explicitly whether the plan runs
  **backwards** from an endgame or **forwards** through a prerequisite
  chain, and why. Backwards is the default — it puts the real skill in
  week one. Forwards is legitimate only when each unit genuinely cannot
  be attempted before the last, and then you say so in those terms.

This is a preamble. No session is spent on meta-work.

## Build the 14 sessions

Each session carries exactly one named artifact, exactly one binary
self-check, and a compressed material set sized to the day.

- **Artifact** (`artifactOneLiner`): something produced, not something
  read.
- **Self-check**: phrased so its answer is unambiguously yes or no. "Can I
  parse two subcommands from one CLI?" — not "Do I understand argparse?"
- **Materials**: only what the artifact needs. Each carries an honest
  `estimatedDuration` — **consumption time** for one read of the page or
  one watch of the video at the learner's stated level, not the time the
  learner will spend doing anything with it. The time to *do* the thing
  belongs to the artifact. Materials' totals must fit inside
  `estimatedTime`, which must itself fit inside `hoursPerDay × 60`. Both
  are enforced.
- **Time budget**: `estimatedTime` is the materials' consumption time plus
  the artifact time. **Write the artifact time as the remainder**, not
  as a separate guess: `Σ estimatedDuration` for materials,
  `estimatedTime − Σ` for the artifact. The rendered page surfaces this
  split as `N min on materials · M min on the artifact` so the learner
  sees the artifact budget visibly. **Outside the consolidation slots,
  the artifact time should be at least half of `estimatedTime`** — a
  session that is mostly reading is a reading session, not an
  ultralearning session, so cut or shorten materials rather than pad the
  estimate. This is a prompt rule, not a validator rule: a consolidation
  slot is honestly review-heavy and a validator floor would push you to
  fake the split.
- **Video**: a video's `estimatedDuration` is its runtime (one watch).
  Verification fetches the watch page and confirms it names the runtime
  in `<meta itemprop="duration">`, `<meta property="og:video:duration">`,
  the player JSON's `lengthSeconds`, or a JSON-LD `VideoObject.duration`.
  If the watch page disagrees with your estimate by more than a factor of
  2 **and** by more than 10 minutes, the shell warns — read the
  `durationWarnings` bullet in the duty that ran the command.
- **CAFE**: `highFrequencyUnits` names the units this session drills,
  drawn from the deconstruction. The highest-frequency units recur across
  the sprint — at least one unit appears in three or more sessions,
  enforced. Add an `encodingHook` (a mnemonic or framing that makes the
  material stick) only where the material benefits; leave it off
  elsewhere.

**Sessions 6 and 11 are the consolidation slots**, and only those. Mark
them `consolidation: true`. Their content serves both uses at once:
catch-up when the learner is behind, spaced review of the
highest-frequency units when they are not. Write the artifact and
self-check so both readings work.

**Deliverable template** — emit one when the artifact is a written thing
and the self-check is answered by reading what the learner wrote, not by
running something they built. Thesis, memo, rubric, spec, playbook,
walkthrough, evaluation, from-memory rewrite: yes. A repository, module,
backtester, classifier, data loader, scheduled job, notebook, dataset:
no — the session's detail renders exactly as before. For a mixed artifact
(a strategy implemented by a coding agent from a written spec, or a
consolidation session's written catch-up reading), emit a template for the
written part only; the template's fields are the spec's sections or the
rewrite's fields, and the behind-schedule reading that finishes a missing
built artifact gets none. The validator checks structure, not
appropriateness: a heuristic on the one-liner's words would be wrong often
enough to train you to game it, so judgement lives here.

A template is a list of **2 to 8 fields**, each `{ id, label, prompt,
kind }`: a stable id (`^[a-z0-9]+(-[a-z0-9]+)*$`), the noun-phrase
heading the learner sees, the question the field answers in one
paragraph, and one of two kinds. **One field per thing the artifact's
`artifactOneLiner` names, in the order it names them.** A session that
names four parts of an argument — "who pays the premium, why the premium
persists, the regime in which it is harvested, and the regime in which
it blows up" — is four `paragraph` fields with those labels; a session's
eight-part rubric is its eight named rows as `paragraph` fields, capped
at eight, so the ranked verdict becomes the eighth field's closing line
rather than a ninth. A **`line`** field is for a title, a verdict, a
number or a one-sentence claim (use it for an artifact's headline);
**prompts are questions**, never restatements of the label ("Which party
is structurally short this premium, and why do they accept the price?",
not "Who pays?"). Never a field that asks for code, a URL to a repo, or
a screenshot — if the honest fields would be those, the artifact is
built, not written, and the template is omitted. **Ids stay meaningful**
(`alpha-source`, not `field-1`) because the page stores the learner's
answer under `<session>/<id>` and a label edit or a field reorder is
allowed to leave the answer in place; an id change orphans it.

## Source the materials

Discovery is two-lane, every phase, run deliberately rather than as a
fallback. **Lane A** is the canonical lane (the preferred tier — see
[Preferred sources](#preferred-sources)) for what a unit **is**: the
definition, the API, the spec. **Lane B** is the practitioner lane (see
[Practitioner sources](#practitioner-sources)) for how a unit is
**done**: a named practitioner's own recorded talk, video lecture or
series, blog post, podcast episode, or book. Every phase gets at least
one Lane B search before its materials are written, on the phase's
`highFrequencyUnits`, whether or not Lane A already covers them. A
subject where Lane A fully covers a unit is still paired with a Lane B
take when the session's artifact benefits from a worked example, a
walkthrough, or a judgement call the canonical page does not make (the
manual says what `cross_validate` does; a practitioner shows why
walk-forward splits are the only honest choice for a trading backtest).

Tier the resulting material:

- **`preferred`** — Lane A: canonical page for the unit. See
  [Preferred sources](#preferred-sources).
- **`practitioner`** — Lane B: a named practitioner's own material on
  how the unit is done. See [Practitioner sources](#practitioner-sources).
  Books enter through their publisher's or author's page, which carries
  the blurb verification reads.
- **`off-list`** — a niche resource genuinely the best available for
  what the session needs, neither canonical nor a practitioner's own
  take. Reach this tier deliberately, only when neither Lane A nor Lane
  B covers the unit well enough.

A subject well served by the preferred tier still pairs at least one
Lane B material per phase; a niche subject where Lane A and Lane B both
fall short gets off-list fallbacks rather than a thin plan. Off-list is
reached **deliberately** for niche units, not by default.

Verification is the bar: every non-`preferred` material (practitioner
**and** off-list) has its page fetched and the body **confirmed to cover
the claimed concept** before the resource enters the plan — same
`pageCoversConcept` test, same retries, same `unresolved-after-retries`
outcome. A status-only pass never suffices for either tier. The plan's
**three-to-five anchor resources** (the materials the plan leans on most)
are content-verified **regardless of tier**, so a preferred-tier anchor is
held to the same standard.

**Per-publisher cap: at most 4 distinct URLs per publisher in the whole
plan, where a publisher is the registrable domain (`cdn.cboe.com` and
`www.cboe.com` are one) or, on hosting platforms, the tenant
(`ranaroussi.github.io`, `github.com/vollib`); enforced by validation.**
Keep a running tally of distinct URLs per publisher as you write each
session. When the running count hits 4 for a publisher, the next material
from that publisher is replaced: Lane B first, then off-list, then a
different preferred publisher. If nothing else covers the unit, the
session keeps fewer materials — never a padding link. **A video-host URL
(`youtube.com`, `youtu.be`, `vimeo.com`) does not name the channel behind
the video**, so the cap cannot see it. Apply the same "at most 4 per
publisher" rule to a YouTube channel by hand: if you find yourself
queuing six videos from the same channel, pick another. Distinct URLs are
counted after normalization (lowercase scheme + host, fragment removed,
trailing slash removed, query kept), so a page reused for spaced review
in a later session does not eat the publisher's budget. Outlier-story
citations are phase-level metadata, not materials, and are not counted.

**Forum tripwire**: a forum thread is never practitioner-tier. Reddit,
Stack Overflow / Stack Exchange, Hacker News, Quora, Discourse
instances, mailing-list archives — all excluded from the practitioner
tier by `validatePlan`. They may still be admitted off-list under the
existing rules when they are genuinely the best available. The exclusion
lives in the validator, not in your head.

**X posts are never materials**: a post or thread on X (`x.com`,
`twitter.com`) is never a material, at any tier, because verification
cannot fetch it — the validator rejects the URL outright. What you learn
from X is a discovery signal: which practitioners are recommended, which
talk or write-up a thread is praising. Use it to find the blog post,
talk, video or repo the post points at, and *that* is the material. The
same holds for a search engine's results page: it informs sourcing but
is not itself a material.

At most **one paid material in the whole plan**, with its `price` set,
and every session must remain completable from free materials alone. Both
enforced.

Group the sessions into phases. For each phase, look for a real, named
person or documented case that reached the skill through an unusual
route, **specific to the plan's subject domain and recognisably about a
high-frequency unit drilled in this phase**. A general-legend fallback (a
famous practitioner whose contribution is at one remove from the subject —
Thorp, Dalio, Simons, Soros for an options-system plan) is not
subject-specific and must be omitted, not used. Diagnostic: would a
reader who knows the subject recognise this person as being in this
subject, **and** would the transferable principle map cleanly onto one of
the phase's `highFrequencyUnits`? Both must hold. Record the unusual
approach and the transferable principle that explains why it worked as
separate fields. At most one `outlierStory` per phase, at the phase
boundary. Add the story only when its citation is a working URL that will
pass the generator's verification. If a search returns only general-legend
candidates, or none whose approach aligns with the phase's
high-frequency units, omit `outlierStory` entirely — never invent a
story, use a composite, fall back to a general legend, or fill the gap
yourself. The renderer emits a quiet "No subject-specific outlier case
found for this phase" note at the phase boundary. Do at least one real
search per phase; do not skip later phases because an early one yielded
nothing.

The plan's renderer emits that placeholder; you write plan data only,
never HTML.

Leave `stakes` as an empty string. It is the learner's to fill in on the
page.

## Preferred sources

Durable, well-known, unlikely to rot inside a two-week sprint:

- Official documentation and specifications for the language, library or
  tool.
- Standards bodies: MDN, W3C, IETF RFCs, POSIX.
- University course material: MIT OCW, Stanford, Berkeley, CMU.
- Long-lived reference works and their official sites.
- The project's own repository and its maintained guides.
- Established technical publishers' freely readable material.

Prefer a canonical page over a blog post restating it.

## Practitioner sources

A practitioner material is one where a **named practitioner** — a person
who did the thing and is explaining how — is speaking in their own voice.
A practitioner's own recorded talk, video lecture or series, blog post,
podcast episode, or book (the book's blurb enters through the publisher
or author page). The person matters: a practitioner tier is not "a good
tutorial on topic X", it is the person who did the work telling you how.
Forum threads (Reddit, Stack Overflow / Stack Exchange, Hacker News,
Quora, Discourse instances, mailing-list archives) are never
practitioner-tier — they may still be admitted off-list when genuinely
the best. Aggregator listicles, anonymous tutorials, and content farms
are never practitioner-tier either.

What qualifies:

- A practitioner's own recorded talk or conference presentation, on
  their own site, a conference site, or YouTube (a video's watch page is
  what verification fetches; transcripts are not fetched).
- A practitioner's own video lecture series.
- A practitioner's own blog post.
- A practitioner's own podcast episode.
- A book by the practitioner, entered through the publisher's or author's
  page.

What does not qualify:

- Forum threads — always off-list at best, never practitioner.
- Aggregator listicles and content farms.
- Anonymous tutorials.
- A second-hand summary of the practitioner's work (a news write-up of a
  practitioner's results, an explainer that quotes them).

Planning-time duty for video practitioner sources: before admitting a
video, confirm from the transcript, chapters, or description that the
video **actually covers the unit** (not just its title), and set
`estimatedDuration` to the runtime (consumption time — how long one watch
takes). Verification fetches the watch page (title, description, embedded
player JSON) and confirms it covers the concept, so a title-only match
is not enough; a watch page that returns a consent or bot interstitial
fails the content check the same way any other page does, and surfaces
as `unresolved-after-retries` with the existing warning.