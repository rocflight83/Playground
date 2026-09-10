# 10: Visual design pass

**What to build:** The page becomes something I can look at for two straight weeks without fatigue. A quiet document: restrained palette, one accent, generous typography sized for long reading, comfortable in both light and dark, readable on a phone. Two structural elements break the quiet — the persistent slim progress spine and the phase bands separating the arc.

Note: this is a polish pass, not a vertical slice. It touches presentation only. It is demoable and self-contained, but it does not cut through the layers the way the other tickets do, and it should not be treated as a tracer bullet.

**Blocked by:** 02.

**Spec:** `.scratch/study-plan-generator/spec.md`

**User stories covered:** 45, 46, 54.

**Status:** ready-for-agent

- [ ] Quiet-document aesthetic: restrained palette, one accent, typography sized for long reading sessions
- [ ] Light and dark both supported, including the viewer's explicit choice and the system default
- [ ] The page paints its own background explicitly and never renders transparent
- [ ] The progress spine is persistent and slim
- [ ] Phase bands read clearly as structural separators
- [ ] The page is readable and usable down to phone widths
- [ ] Styles remain inlined; no external stylesheet or font is introduced
- [ ] No existing rendering or state behaviour regresses
