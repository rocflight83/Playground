# Issue tracker: Local Markdown

Issues and specs for this repo live as markdown files in `.scratch/`.

## Conventions

- One feature per directory: `.scratch/<feature-slug>/`
- The spec is `.scratch/<feature-slug>/spec.md`
- Implementation issues are one file per ticket at `.scratch/<feature-slug>/issues/<NN>-<slug>.md`, numbered from `01`, never a single combined tickets file
- Triage state is recorded as a `Status:` line near the top of each issue file (see `triage-labels.md` for the role strings)
- Comments and conversation history append to the bottom of the file under a `## Comments` heading

## GitHub Issues (pointer/index only)

`.scratch/` is the source of truth. GitHub Issues on this repo (`rocflight83/Playground`) is a
lightweight, human-facing index on top of it — not a second place to write ticket content.

- Every `.scratch/<feature-slug>/issues/NN-<slug>.md` file gets a matching GitHub issue.
- The GitHub issue body is a short pointer: a one-line summary plus the path back to the
  markdown file. Full detail (acceptance criteria, comments, status changes) stays in the
  markdown file only — do not duplicate it into the GitHub issue body.
- The GitHub issue's labels mirror the `Status:` line (see `triage-labels.md` for the label
  strings). When a ticket's `Status:` changes, update the GitHub issue's label to match.
- When a ticket is closed out or marked `wontfix`, close the corresponding GitHub issue.
- Use `gh issue create --repo rocflight83/Playground --title "<NN>: <title>" --label
  <status-label> --body "<summary>\n\nFull ticket: \`<path>\`"` to create one.

## When a skill says "publish to the issue tracker"

Create a new file under `.scratch/<feature-slug>/` (creating the directory if needed), then
open the matching GitHub pointer issue as described above.

## When a skill says "fetch the relevant ticket"

Read the file at the referenced path. The user will normally pass the path or the issue number directly.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a file with one **child** file per ticket.

- **Map**: `.scratch/<effort>/map.md` (the Notes / Decisions-so-far / Fog body).
- **Child ticket**: `.scratch/<effort>/issues/NN-<slug>.md`, numbered from `01`, with the question in the body. A `Type:` line records the ticket type (`research`/`prototype`/`grilling`/`task`); a `Status:` line records `claimed`/`resolved`.
- **Blocking**: a `Blocked by: NN, NN` line near the top. A ticket is unblocked when every file it lists is `resolved`.
- **Frontier**: scan `.scratch/<effort>/issues/` for files that are open, unblocked, and unclaimed; first by number wins.
- **Claim**: set `Status: claimed` and save before any work.
- **Resolve**: append the answer under an `## Answer` heading, set `Status: resolved`, then append a context pointer (gist + link) to the map's Decisions-so-far in `map.md`.
