# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Deterministic shell for the "Ultralearning Study Plan Generator" skill: a thin
TypeScript layer that renders structured plan data into a single self-contained
HTML page (and, later, verifies links). The generator's intelligence is prompt
design; the code here is deterministic and framework-free.

Read [AGENTS.md](AGENTS.md) for the full rationale, code style, architecture and
testing conventions. The key invariants: data and rendering are strictly split,
the renderer is a pure function of the data, and the output page loads nothing
from the network.

## Commands

- `npm run generate -- <plan.json> [baseDir]` — generate mode: validate, verify
  and render a plan the `/study-plan` skill produced
- `npm test` — run the suite once (`vitest run`)
- `npm run test:watch` — watch mode
- `npm run typecheck` — `tsc --noEmit` (must stay clean)

There is no build step; `vitest` transpiles TypeScript directly, and
`scripts/generate.ts` runs under Node's `--experimental-strip-types`.
The CLI commands preload `scripts/proxy-preload.mjs`, which makes `fetch`
honour `HTTP_PROXY`/`HTTPS_PROXY` when they are set (this machine needs it for
link verification) and does nothing otherwise.

## Agent skills

### Issue tracker

Issues are tracked in GitHub Issues on `rocflight83/Playground` (via the `gh` CLI). See `docs/agents/issue-tracker.md`.

### Triage labels

Uses the five default triage roles plus a local `done` role: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`, `done`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
