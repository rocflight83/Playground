# 10: Visual design pass

**What to build:** The page becomes something I can look at for two straight weeks without fatigue. A quiet document: restrained palette, one accent, generous typography sized for long reading, comfortable in both light and dark, readable on a phone. Two structural elements break the quiet — the persistent slim progress spine and the phase bands separating the arc.

Note: this is a polish pass, not a vertical slice. It touches presentation only. It is demoable and self-contained, but it does not cut through the layers the way the other tickets do, and it should not be treated as a tracer bullet.

**Blocked by:** 02.

**Spec:** `.scratch/study-plan-generator/spec.md`

**User stories covered:** 45, 46, 54.

**Status:** done

- [x] Quiet-document aesthetic: restrained palette, one accent, typography sized for long reading sessions
- [x] Light and dark both supported, including the viewer's explicit choice and the system default
- [x] The page paints its own background explicitly and never renders transparent
- [x] The progress spine is persistent and slim
- [x] Phase bands read clearly as structural separators
- [x] The page is readable and usable down to phone widths
- [x] Styles remain inlined; no external stylesheet or font is introduced
- [x] No existing rendering or state behaviour regresses

## Comments

- Implemented the "Paper & Ink" quiet-document system in `src/renderer.ts`: one accent, paper/ink palette, body copy at 17px (16px on phones), serif display headings, phase bands with session ranges, session tags, and responsive layouts down to 320px. Styles and scripts stay inline; the rendered CSS carries no network reference.
- Theme: `:root` is the light palette and the system default, `prefers-color-scheme: dark` overrides it, and `html[data-theme=light|dark]` is the viewer's explicit choice (a three-way toggle in the masthead). The choice persists under its own `studyPlanTheme` key — not inside `studyPlanProgress` — so progress export/import is unchanged, and a small `<head>` script applies it before first paint. `html` and `body` both paint `var(--paper)` explicitly.
- Progress: a single slim fixed spine at the foot of the page carries the "N of 14" indicator, a 2px fill and the export/import controls. Issue 02 behaviour is unchanged: nothing is written to storage on load, and checking a session updates the indicator without expanding or collapsing anything.
- Code review (two-axis) found the first cut had drifted past "presentation only". Removed on that basis: outlier-story rendering (ticket 07 owns it — the fixture data is still there), the "Honest target" line and `honestTarget` fallback (ticket 06; the scope note already carries divergence), the generation timestamp (which also removed an `Intl.DateTimeFormat` host dependency from the pure renderer), per-material verification labels, the per-session time/material-count topline, a "current session" highlight, editorial section indices and filler prose, write-on-load, and expand-on-check. Nothing on the page is set below 12px, and the unverified-material tag matches label size. Each content block that can carry long data (scope note, stakes, hero target and stats, DISSS reasons, phase bands, session summary/detail, materials, self-check) owns its horizontal overflow with `overflow-x: auto`; the `overflow-x: hidden` on `html` is only the backstop against page-level scroll. Hardcoded copy that was neither plan data nor a control (brand mark and sub-line, a hero kicker, a "Method" stat, an arc note) was removed too; the masthead eyebrow repeats the document title. On phones the spine is two rows — indicator beside the fill track, controls beneath — rather than overflowing. Material links stay underlined at rest so they read as links without hover. The session-row warning reads "⚠ Unverified material" as a tag (was a full sentence at HEAD); the scope note sits directly under the title.
- The page script was restructured while wiring it to the new markup (the export/import controls are now rendered rather than injected). Behavioural deltas from the issue 02 script, all deliberate: the `checkStorageAvailable` probe (which wrote a throwaway key and, on failure, deleted progress) is gone; `console.warn` diagnostics are gone; `getStorage` treats non-object JSON as empty state instead of crashing on the first property access.
- Validation: `npm run typecheck` clean; `npm test` 95 passing, including new jsdom tests in `tests/renderer.test.ts` for the explicit background, both theme mechanisms, theme persistence isolated from progress state, no write-on-load, accordion untouched by checking, phase-band ranges, and the single fixed progress spine.
