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

- `npm test` — run the suite once (`vitest run`)
- `npm run test:watch` — watch mode
- `npm run typecheck` — `tsc --noEmit` (must stay clean)

There is no build step; `vitest` transpiles TypeScript directly.

## Agent skills

### Issue tracker

Issues are tracked as markdown files under `.scratch/<feature>/` in this repo. See `docs/agents/issue-tracker.md`.

### Triage labels

Uses the five default triage roles plus a local `done` role: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`, `done`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
