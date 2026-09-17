import type {
  DeliverableField,
  Material,
  OutlierStory,
  Phase,
  PlanData,
  Session,
} from './plan-types.ts'
import { isDurationMismatch } from './plan-types.ts'

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// Quiet document: one accent, paper-and-ink palette, type sized for two weeks
// of reading. `:root` is the light palette and the system default; the dark
// media query overrides it; `html[data-theme=…]` is the viewer's explicit
// choice and wins over both by specificity.
const STYLE = `
:root {
  color-scheme: light;
  --paper: #f4f0e7;
  --paper-deep: #ebe4d7;
  --paper-panel: #fbf9f4;
  --paper-line: #d6cfc1;
  --paper-line-strong: #bdb3a3;
  --ink: #26332d;
  --ink-soft: #56615a;
  --ink-faint: #737a72;
  --accent: #b45d4d;
  --accent-strong: #873f35;
  --accent-wash: #f1ded6;
  --sage-wash: #dfe6dc;
  --warn-wash: #f3e5d7;
  --paid: #986b25;
  --font-body: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --font-display: Georgia, "Times New Roman", serif;
}

@media (prefers-color-scheme: dark) {
  :root {
    color-scheme: dark;
    --paper: #1f2823;
    --paper-deep: #27322c;
    --paper-panel: #26312b;
    --paper-line: #435047;
    --paper-line-strong: #627166;
    --ink: #f0ece2;
    --ink-soft: #b7c0b7;
    --ink-faint: #97a299;
    --accent: #d27a68;
    --accent-strong: #f0a091;
    --accent-wash: #49332e;
    --sage-wash: #334239;
    --warn-wash: #49372b;
    --paid: #e6bc6a;
  }
}

html[data-theme="light"] {
  color-scheme: light;
  --paper: #f4f0e7;
  --paper-deep: #ebe4d7;
  --paper-panel: #fbf9f4;
  --paper-line: #d6cfc1;
  --paper-line-strong: #bdb3a3;
  --ink: #26332d;
  --ink-soft: #56615a;
  --ink-faint: #737a72;
  --accent: #b45d4d;
  --accent-strong: #873f35;
  --accent-wash: #f1ded6;
  --sage-wash: #dfe6dc;
  --warn-wash: #f3e5d7;
  --paid: #986b25;
}

html[data-theme="dark"] {
  color-scheme: dark;
  --paper: #1f2823;
  --paper-deep: #27322c;
  --paper-panel: #26312b;
  --paper-line: #435047;
  --paper-line-strong: #627166;
  --ink: #f0ece2;
  --ink-soft: #b7c0b7;
  --ink-faint: #97a299;
  --accent: #d27a68;
  --accent-strong: #f0a091;
  --accent-wash: #49332e;
  --sage-wash: #334239;
  --warn-wash: #49372b;
  --paid: #e6bc6a;
}

* { box-sizing: border-box; }
html, body { min-width: 0; margin: 0; padding: 0; }
html { overflow-x: hidden; background: var(--paper); color: var(--ink); }
body {
  min-height: 100vh;
  background: var(--paper);
  color: var(--ink);
  font: 17px/1.6 var(--font-body);
}
button, input, textarea { font: inherit; }
button { color: inherit; }
a { color: var(--accent-strong); }

.ledger-app {
  min-height: 100vh;
  padding-bottom: 72px;
  background: var(--paper);
  color: var(--ink);
}

.masthead, .page {
  width: min(1040px, calc(100% - 64px));
  margin: 0 auto;
}
.page { overflow-wrap: break-word; }
.scope-note, .stakes-field, .aside-stat, .hero-target, .reason, .phase-band, .session-summary, .session-detail, .material, .self-check { overflow-x: auto; }

.masthead {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 32px;
  padding: 28px 0 18px;
  border-bottom: 1px solid var(--paper-line-strong);
}
.eyebrow {
  margin: 0;
  color: var(--ink-soft);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: .18em;
  text-transform: uppercase;
}
.mode-button, .footer-action {
  border: 1px solid var(--paper-line-strong);
  background: var(--paper);
  color: var(--ink-soft);
  cursor: pointer;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: .1em;
  text-transform: uppercase;
}
.mode-button { min-width: 120px; padding: 8px 12px; }
.mode-button:hover, .footer-action:hover { border-color: var(--accent); color: var(--accent-strong); }
.mode-button:focus-visible, .footer-action:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

.hero {
  display: grid;
  grid-template-columns: minmax(0, 1.6fr) minmax(240px, .7fr);
  gap: 64px;
  padding: 52px 0 32px;
}
h1, h2 { font-family: var(--font-display); font-weight: 400; }
h1 {
  max-width: 720px;
  margin: 0 0 14px;
  font-size: clamp(40px, 5.5vw, 64px);
  line-height: 1.02;
  letter-spacing: -.035em;
}
.hero-target { max-width: 640px; margin: 0; color: var(--ink-soft); font-size: 19px; line-height: 1.55; }
.hero-target strong { color: var(--ink); font-weight: 650; }
.hero-aside { padding-top: 8px; }
.aside-rule { width: 100%; margin-bottom: 14px; border-top: 1px solid var(--paper-line-strong); }
.aside-stat {
  display: flex;
  justify-content: space-between;
  gap: 20px;
  padding: 10px 0;
  border-bottom: 1px solid var(--paper-line);
}
.aside-label, .detail-label, .reason-label, .stakes-label, .phase-meta {
  color: var(--ink-faint);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: .14em;
  text-transform: uppercase;
}
.aside-value { color: var(--ink); font-size: 15px; font-weight: 650; text-align: right; overflow-wrap: anywhere; }

.scope-note {
  max-width: 640px;
  margin: 24px 0 0;
  padding: 20px 24px 20px 26px;
  border: 1px solid var(--paper-line);
  border-left: 4px solid var(--accent);
  background: var(--accent-wash);
}
.scope-note p { margin: 0; color: var(--ink); font-size: 16px; overflow-wrap: anywhere; }
.scope-note p + p { margin-top: 8px; }
.scope-note span { font-weight: 650; }
.scope-note strong { color: var(--accent-strong); font-size: 12px; letter-spacing: .12em; text-transform: uppercase; }

.stakes-field {
  display: grid;
  grid-template-columns: 148px minmax(0, 1fr);
  align-items: center;
  gap: 16px;
  margin-bottom: 56px;
  padding: 16px 20px;
  border-top: 1px solid var(--paper-line-strong);
  border-bottom: 1px solid var(--paper-line-strong);
  background: var(--paper-deep);
}
.stakes-label { color: var(--accent-strong); }
.stakes-input {
  width: 100%;
  padding: 8px 0;
  border: 0;
  border-bottom: 1px solid var(--paper-line-strong);
  outline: none;
  background: var(--paper-deep);
  color: var(--ink);
}
.stakes-input:focus { border-color: var(--accent); }

.section-heading { margin: 0 0 20px; }
.section-heading h2 { margin: 0; font-size: 30px; letter-spacing: -.03em; }
.preamble { margin-bottom: 56px; }
.preamble-grid { display: grid; grid-template-columns: 1fr 1fr; border-top: 1px solid var(--paper-line-strong); }
.reason {
  display: grid;
  grid-template-columns: 132px minmax(0, 1fr);
  gap: 16px;
  padding: 18px 18px 18px 0;
  border-bottom: 1px solid var(--paper-line);
}
.reason:nth-child(odd) { padding-right: 24px; border-right: 1px solid var(--paper-line); }
.reason:nth-child(even) { padding-left: 24px; }
.reason-label { color: var(--accent-strong); }
.reason-text { margin: 0; color: var(--ink-soft); font-size: 16px; line-height: 1.6; overflow-wrap: anywhere; }

.plan-heading { margin-top: 64px; margin-bottom: 24px; }
.phase-band {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 22px;
  margin: 28px 0 14px;
  padding: 12px 14px 12px 0;
  border-top: 2px solid var(--ink);
  border-bottom: 1px solid var(--paper-line-strong);
}
.phase-band:first-of-type { margin-top: 0; }
.phase-title-wrap { display: flex; align-items: center; gap: 14px; }
.phase-no { color: var(--accent-strong); font: 22px var(--font-display); }
.phase-title { color: var(--ink); font-size: 14px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; }
.phase-meta { text-align: right; }

.outlier-story--empty {
  margin: 0 0 12px;
  padding: 10px 14px 10px 14px;
  border-top: 1px solid var(--paper-line);
  color: var(--ink-faint);
  font-size: 14px;
  line-height: 1.45;
}
.outlier-story--empty p { margin: 0; }

.session {
  margin: 0 0 8px 44px;
  border: 1px solid var(--paper-line);
  background: var(--paper-panel);
}
.session-summary {
  display: grid;
  grid-template-columns: 26px 40px minmax(180px, 1.1fr) minmax(230px, 1.55fr) auto;
  align-items: center;
  gap: 12px;
  min-height: 64px;
  padding: 12px 16px 12px 14px;
  cursor: pointer;
}
.session-summary:hover { background: var(--paper-deep); }
.session-summary:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
.session-check { width: 17px; height: 17px; margin: 0; accent-color: var(--accent); cursor: pointer; }
.session-number { color: var(--accent-strong); font: 20px var(--font-display); }
.session-title { color: var(--ink); font-size: 16px; font-weight: 650; overflow-wrap: anywhere; }
.session-artifact { color: var(--ink-soft); font-size: 15px; overflow-wrap: anywhere; }
.session-artifact::before { content: "→ "; color: var(--accent); }
.session-tags { display: flex; justify-content: flex-end; align-items: center; gap: 7px; flex-wrap: wrap; }
.tag {
  padding: 3px 7px;
  border: 1px solid var(--paper-line-strong);
  color: var(--ink-faint);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: .1em;
  text-transform: uppercase;
  white-space: nowrap;
}
.tag.consolidation { border-color: var(--ink-soft); color: var(--ink-soft); }
.tag.warning { border-color: var(--accent); background: var(--warn-wash); color: var(--accent-strong); }
.session-warning { flex: 0 0 auto; }
.session-detail { padding: 0 24px 24px 78px; border-top: 1px solid var(--paper-line); }
.session-detail[hidden] { display: none; }
.detail-block { padding-top: 16px; }
.detail-label { display: block; margin-bottom: 8px; color: var(--accent-strong); }
.materials { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin: 0; padding: 0; list-style: none; }
.material {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 10px;
  padding: 12px 14px;
  border: 1px solid var(--paper-line);
  background: var(--paper);
  overflow-wrap: anywhere;
}
.material-title { color: var(--ink); font-size: 15px; font-weight: 650; }
.material a { color: var(--accent-strong); text-decoration: underline; text-decoration-color: var(--paper-line-strong); text-underline-offset: 3px; }
.material a:hover, .material a:focus-visible { text-decoration-color: currentColor; }
.material-paid { grid-column: 1 / -1; color: var(--paid); font-size: 12px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; white-space: nowrap; }
.duration { color: var(--ink-soft); font-size: 13px; white-space: nowrap; }
.material-measured { grid-column: 1 / -1; color: var(--ink-soft); font-size: 13px; white-space: nowrap; }
.session-units, .session-hook { margin: 16px 0 0; color: var(--ink-soft); font-size: 15px; overflow-wrap: anywhere; }
.session-units-label, .session-hook-label { color: var(--ink); font-weight: 650; }
.session-budget { margin: 12px 0 0; color: var(--ink-soft); font-size: 15px; overflow-wrap: anywhere; }
.session-budget-label { color: var(--ink); font-weight: 650; }
.self-check {
  margin: 18px 0 0;
  padding: 14px 16px;
  border-left: 2px solid var(--ink);
  background: var(--sage-wash);
  color: var(--ink);
  font: 17px/1.55 var(--font-display);
  overflow-wrap: anywhere;
}
.self-check-label { display: block; margin-bottom: 4px; color: var(--accent-strong); font: 700 12px var(--font-body); letter-spacing: .14em; text-transform: uppercase; }
.notes-label { display: block; margin-top: 20px; color: var(--ink); font-size: 13px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
.notes-area {
  display: block;
  width: 100%;
  min-height: 84px;
  margin-top: 8px;
  resize: vertical;
  padding: 10px 12px;
  border: 1px solid var(--paper-line-strong);
  outline: none;
  background: var(--paper);
  color: var(--ink);
}
.notes-area:focus { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent-wash); }

.deliverable { margin-top: 20px; }
.deliverable-heading { margin: 0 0 10px; color: var(--ink); font-size: 15px; font-weight: 650; overflow-wrap: anywhere; }
.deliverable-field { margin-bottom: 12px; }
.deliverable-label { display: block; margin-bottom: 6px; color: var(--ink); font-size: 13px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
.deliverable-input {
  display: block;
  width: 100%;
  min-height: 84px;
  resize: vertical;
  padding: 10px 12px;
  border: 1px solid var(--paper-line-strong);
  outline: none;
  background: var(--paper);
  color: var(--ink);
  font: inherit;
}
.deliverable-input[type="text"], .deliverable-input.line { min-height: 0; height: 38px; padding: 8px 12px; }
.deliverable-input:focus { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent-wash); }
.deliverable-download {
  display: inline-block;
  margin-top: 6px;
  padding: 7px 12px;
  border: 1px solid var(--paper-line-strong);
  background: var(--paper);
  color: var(--ink-soft);
  cursor: pointer;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: .1em;
  text-transform: uppercase;
}
.deliverable-download:hover, .deliverable-download:focus-visible { border-color: var(--accent); color: var(--accent-strong); outline: none; }

.progress-spine {
  position: fixed;
  z-index: 40;
  right: 0;
  bottom: 0;
  left: 0;
  padding: 7px 24px;
  overflow-x: auto;
  border-top: 1px solid var(--paper-line-strong);
  background: var(--paper);
}
.spine-inner { width: min(1040px, 100%); margin: 0 auto; display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 18px; }
.progress-indicator { color: var(--ink); font-size: 13px; font-weight: 650; letter-spacing: .03em; white-space: nowrap; }
.progress-track { height: 2px; background: var(--paper-line); }
.progress-fill { width: 0; height: 100%; background: var(--accent); transition: width .25s ease; }
.footer-actions { display: flex; justify-content: flex-end; gap: 6px; }
.footer-action { padding: 5px 9px; }
.progress-import-label { display: inline-flex; align-items: center; }
.progress-import-label input { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { scroll-behavior: auto !important; transition-duration: .01ms !important; }
}

@media (max-width: 900px) {
  .masthead, .page { width: min(calc(100% - 48px), 760px); }
  .hero { gap: 32px; }
  .session-summary { grid-template-columns: 26px 32px minmax(160px, 1fr) auto; }
  .session-artifact { grid-column: 3 / -1; }
}

@media (max-width: 640px) {
  body { font-size: 16px; }
  .ledger-app { padding-bottom: 92px; }
  .masthead, .page { width: calc(100% - 32px); }
  .masthead { padding-top: 18px; }
  .mode-button { min-width: 104px; padding: 7px 8px; }
  .hero { display: block; padding-top: 36px; }
  h1 { max-width: 460px; font-size: clamp(36px, 11vw, 52px); }
  .hero-target { font-size: 17px; }
  .hero-aside { margin-top: 28px; }
  .stakes-field { grid-template-columns: 1fr; gap: 4px; }
  .preamble-grid { display: block; }
  .reason, .reason:nth-child(odd), .reason:nth-child(even) { grid-template-columns: 1fr; gap: 4px; padding: 14px 0; border-right: 0; }
  .section-heading h2 { font-size: 26px; }
  .phase-band { align-items: flex-start; }
  .phase-meta { max-width: 120px; }
  .session { margin-left: 0; }
  .session-summary { grid-template-columns: 22px 30px 1fr auto; gap: 8px; padding: 12px 10px; }
  .session-title { font-size: 15px; }
  .session-artifact { grid-column: 3 / -1; font-size: 14px; }
  .session-tags { grid-column: 4; grid-row: 1; }
  .session-detail { padding: 0 14px 18px 44px; }
  .materials { display: block; }
  .material + .material { margin-top: 8px; }
  .progress-spine { padding: 6px 16px; }
  .spine-inner { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 12px; }
  .progress-indicator { flex: 0 0 auto; }
  .progress-track { flex: 1 1 48px; }
  .footer-actions { flex: 1 0 100%; justify-content: flex-start; gap: 4px; }
  .footer-action { padding: 4px 8px; letter-spacing: .06em; }
}
`.trim()

// Runs in <head>, before first paint, so a stored explicit theme never flashes
// the system palette first. The theme lives under its own key: it is a viewer
// preference, not progress, so export/import of `studyPlanProgress` ignores it.
const THEME_BOOT = `
(function () {
  try {
    var theme = window.localStorage.getItem('studyPlanTheme');
    if (theme === 'light' || theme === 'dark') document.documentElement.setAttribute('data-theme', theme);
  } catch (e) {}
})();
`.trim()

const THEME_NAMES = { system: 'System theme', light: 'Light mode', dark: 'Dark mode' } as const

const SCRIPT = `
(function () {
  var storageKey = 'studyPlanProgress';
  var themeKey = 'studyPlanTheme';
  var summaries = Array.prototype.slice.call(document.querySelectorAll('.session-summary'));
  var checks = Array.prototype.slice.call(document.querySelectorAll('.session-check'));
  var root = document.documentElement;

  // -- Storage (issue 02) ---------------------------------------------------

  function getStorage() {
    try {
      var raw = window.localStorage.getItem(storageKey);
      if (!raw) return {};
      var parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (e) {
      return {};
    }
  }

  function saveStorage(data) {
    try { window.localStorage.setItem(storageKey, JSON.stringify(data)); } catch (e) {}
  }

  function withState(mutate) {
    var state = getStorage();
    mutate(state);
    saveStorage(state);
  }

  function sessionNumberOf(element) {
    return parseInt(element.getAttribute('data-session'), 10);
  }

  // -- Accordion -------------------------------------------------------------

  function setOpen(summary, open) {
    var detail = document.getElementById(summary.getAttribute('aria-controls'));
    if (!detail) return;
    if (open) detail.removeAttribute('hidden'); else detail.setAttribute('hidden', '');
    summary.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  function toggle(summary) { setOpen(summary, summary.getAttribute('aria-expanded') !== 'true'); }

  summaries.forEach(function (summary) {
    summary.addEventListener('click', function (event) {
      if (event.target && event.target.tagName === 'INPUT') return;
      toggle(summary);
    });
    summary.addEventListener('keydown', function (event) {
      if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
        event.preventDefault();
        toggle(summary);
      }
    });
  });

  // -- Current session (issue 02: lowest unchecked expands on load) ----------

  function lowestUnchecked() {
    var lowest = null;
    checks.forEach(function (check) {
      if (check.checked) return;
      var number = sessionNumberOf(check);
      if (lowest === null || number < lowest) lowest = number;
    });
    return lowest;
  }

  function expandLowestUnchecked() {
    var number = lowestUnchecked();
    if (number === null) return;
    var summary = document.querySelector('.session[data-session="' + number + '"] .session-summary');
    if (summary) setOpen(summary, true);
  }

  // -- Progress spine ----------------------------------------------------------

  function updateProgressIndicator() {
    var complete = checks.filter(function (check) { return check.checked; }).length;
    var percent = checks.length ? (complete / checks.length) * 100 : 0;
    var indicator = document.querySelector('.progress-indicator');
    if (indicator) indicator.textContent = complete + ' of ' + checks.length + ' sessions complete';
    var fill = document.getElementById('progress-fill');
    if (fill) fill.style.width = percent + '%';
  }

  // -- Checkbox, notes and stakes persistence --------------------------------

  var state = getStorage();
  checks.forEach(function (check) {
    var number = check.getAttribute('data-session');
    check.checked = Boolean(state.checkboxes && state.checkboxes[number] === true);
    check.addEventListener('change', function () {
      withState(function (next) {
        next.checkboxes = next.checkboxes || {};
        next.checkboxes[number] = check.checked;
      });
      updateProgressIndicator();
    });
  });

  document.querySelectorAll('.notes-area').forEach(function (area) {
    var number = area.getAttribute('data-session');
    if (state.notes && state.notes[number]) area.value = state.notes[number];
    area.addEventListener('input', function () {
      withState(function (next) {
        next.notes = next.notes || {};
        if (area.value) next.notes[number] = area.value; else delete next.notes[number];
      });
    });
  });

  // Deliverable template (issue 14): page-written values live next to notes
  // and stakes under a 'deliverables' key, keyed by session number then
  // field id. An empty field removes its key; a session with no filled
  // fields leaves no empty session object behind.
  document.querySelectorAll('.deliverable-input').forEach(function (input) {
    var number = input.getAttribute('data-session');
    var field = input.getAttribute('data-field');
    if (!field) return;
    if (state.deliverables && state.deliverables[number] && state.deliverables[number][field] != null) {
      input.value = state.deliverables[number][field];
    }
    input.addEventListener('input', function () {
      withState(function (next) {
        if (input.value) {
          next.deliverables = next.deliverables || {};
          next.deliverables[number] = next.deliverables[number] || {};
          next.deliverables[number][field] = input.value;
        } else if (next.deliverables && next.deliverables[number]) {
          delete next.deliverables[number][field];
          var remaining = false;
          for (var k in next.deliverables[number]) {
            if (Object.prototype.hasOwnProperty.call(next.deliverables[number], k)) { remaining = true; break; }
          }
          if (!remaining) delete next.deliverables[number];
          if (!Object.keys(next.deliverables).length) delete next.deliverables;
        }
      });
    });
  });

  var stakes = document.getElementById('stakes');
  if (stakes) {
    if (state.stakes) stakes.value = state.stakes;
    stakes.addEventListener('input', function () {
      withState(function (next) {
        if (stakes.value) next.stakes = stakes.value; else delete next.stakes;
      });
    });
  }

  // -- Download deliverable (issue 14) -------------------------------------------
  // The Markdown is built from what the learner sees (the inputs, not storage)
  // so what they downloaded is what they reviewed. Empty fields become a
  // visible "_(not written)_" line so a reviewer sees the section is empty
  // rather than guessing where the prose begins.
  function pad2(n) { return n < 10 ? '0' + n : '' + n; }

  document.querySelectorAll('.deliverable-download').forEach(function (button) {
    button.addEventListener('click', function () {
      var number = button.getAttribute('data-session');
      if (!number) return;
      var block = document.querySelector('.session[data-session="' + number + '"] .deliverable');
      if (!block) return;
      var heading = block.querySelector('.deliverable-heading');
      var headingText = heading ? heading.textContent : '';
      var sessionTitle = (document.querySelector('.session[data-session="' + number + '"] .session-title') || {}).textContent || '';
      var fields = Array.prototype.slice.call(block.querySelectorAll('.deliverable-field'));
      var lines = [];
      lines.push('# ' + (headingText || ''));
      lines.push('');
      lines.push('Session ' + number + ': ' + sessionTitle);
      lines.push('');
      for (var i = 0; i < fields.length; i++) {
        var field = fields[i];
        var labelEl = field.querySelector('.deliverable-label');
        var inputEl = field.querySelector('.deliverable-input');
        var label = labelEl ? (labelEl.textContent || '').trim() : '';
        var value = inputEl && inputEl.value ? inputEl.value : '_(not written)_';
        lines.push('## ' + label);
        lines.push('');
        lines.push(value);
        lines.push('');
      }
      var body = lines.join('\\n');
      var blob = new Blob([body], { type: 'text/markdown' });
      var url = URL.createObjectURL(blob);
      var link = document.createElement('a');
      link.href = url;
      link.download = 'session-' + pad2(Number(number)) + '-deliverable.md';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    });
  });

  // -- Export / import ----------------------------------------------------------

  var exportButton = document.getElementById('export-progress');
  if (exportButton) exportButton.addEventListener('click', function () {
    var blob = new Blob([JSON.stringify(getStorage(), null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = 'study-plan-progress.json';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  });

  var importInput = document.getElementById('import-progress');
  if (importInput) importInput.addEventListener('change', function (event) {
    var file = event.target.files && event.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        saveStorage(JSON.parse(reader.result));
        window.location.reload();
      } catch (e) {
        window.alert('Invalid progress file format');
      }
    };
    reader.readAsText(file);
  });

  // -- Theme: system default, or the viewer's explicit choice --------------------

  var themeToggle = document.getElementById('theme-toggle');
  var themeNames = ${JSON.stringify(THEME_NAMES)};

  function labelToggle(theme) {
    if (!themeToggle) return;
    themeToggle.textContent = themeNames[theme];
    themeToggle.setAttribute('aria-label', 'Colour theme: ' + themeNames[theme] + '. Activate to change.');
  }

  function applyTheme(theme) {
    if (theme === 'system') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', theme);
    labelToggle(theme);
    try {
      if (theme === 'system') window.localStorage.removeItem(themeKey);
      else window.localStorage.setItem(themeKey, theme);
    } catch (e) {}
  }

  if (themeToggle) {
    var stored = root.getAttribute('data-theme');
    var current = stored === 'light' || stored === 'dark' ? stored : 'system';
    labelToggle(current);
    themeToggle.addEventListener('click', function () {
      current = current === 'system' ? 'light' : current === 'light' ? 'dark' : 'system';
      applyTheme(current);
    });
  }

  expandLowestUnchecked();
  updateProgressIndicator();
})();
`.trim()

function renderMaterial(material: Material): string {
  const paid = material.paid
    ? '<span class="material-paid">Paid — $' + esc(String(material.price ?? 0)) + '</span>'
    : ''
  // Measurement (issue 13): a measurement that disagrees with the estimate
  // is shown next to the stated duration so the learner can weigh it.
  // The same `isDurationMismatch` the verifier used defines "disagrees", so
  // the page and the JSON summary cannot drift apart.
  let measured = ''
  const { measuredDuration, measuredBy } = material.verification
  if (
    measuredDuration !== undefined &&
    measuredBy !== undefined &&
    isDurationMismatch(material.estimatedDuration, measuredDuration)
  ) {
    const verb = measuredBy === 'video-metadata' ? 'watch' : 'read'
    measured =
      '<span class="duration material-measured">' +
      esc(String(material.estimatedDuration)) +
      ' min stated · measured ≈' +
      esc(String(measuredDuration)) +
      ' min ' +
      verb +
      '</span>'
  }
  return (
    '<li class="material">' +
    '<div class="material-title"><a class="material-link" href="' +
    esc(material.url) +
    '" target="_blank" rel="noopener">' +
    esc(material.title) +
    '</a></div>' +
    '<span class="duration material-duration">' +
    esc(String(material.estimatedDuration)) +
    ' min</span>' +
    measured +
    paid +
    '</li>'
  )
}

function renderDeliverableField(field: DeliverableField, sessionNumber: string): string {
  const inputId = `deliverable-${sessionNumber}-${field.id}`
  const inputClass = 'deliverable-input ' + esc(field.kind)
  const placeholder = esc(field.prompt)
  const input =
    field.kind === 'paragraph'
      ? '<textarea class="' +
        inputClass +
        '" id="' +
        inputId +
        '" data-session="' +
        sessionNumber +
        '" data-field="' +
        esc(field.id) +
        '" placeholder="' +
        placeholder +
        '"></textarea>'
      : '<input class="' +
        inputClass +
        '" type="text" id="' +
        inputId +
        '" data-session="' +
        sessionNumber +
        '" data-field="' +
        esc(field.id) +
        '" placeholder="' +
        placeholder +
        '">'
  return (
    '<div class="deliverable-field">' +
    '<label class="deliverable-label" for="' +
    inputId +
    '">' +
    esc(field.label) +
    '</label>' +
    input +
    '</div>'
  )
}

function renderDeliverable(session: Session): string {
  const template = session.deliverableTemplate
  if (!template) return ''
  const sessionNumber = esc(String(session.number))
  const fields = template.fields.map((field) => renderDeliverableField(field, sessionNumber)).join('')
  return (
    '<div class="deliverable" data-session="' +
    sessionNumber +
    '">' +
    '<span class="detail-label">Deliverable</span>' +
    '<p class="deliverable-heading">' +
    esc(session.artifactOneLiner) +
    '</p>' +
    fields +
    '<button type="button" class="deliverable-download" data-session="' +
    sessionNumber +
    '">Download deliverable</button>' +
    '</div>'
  )
}

function renderSession(session: Session): string {
  const materials = session.materials.map(renderMaterial).join('')
  const sessionNo = esc(String(session.number))
  const detailId = 'session-detail-' + sessionNo
  const hasUnresolved = session.materials.some(
    (material) => material.verification.status === 'unresolved-after-retries'
  )
  const warning = hasUnresolved
    ? '<span class="tag warning session-warning">⚠ Unverified material</span>'
    : ''
  // One branch, both coupled outputs: the badge a reader sees and the
  // attribute the page's script and the tests select on cannot drift apart.
  const consolidation = session.consolidation
    ? {
        attribute: ' data-consolidation="true"',
        badge: '<span class="tag consolidation session-consolidation">Consolidation</span>',
      }
    : { attribute: '', badge: '' }
  // Time budget (issue 13): the artifact's time is the session budget minus
  // the materials' consumption time. Validator already guarantees the
  // remainder is non-negative, so the second number is always ≥ 0.
  const materialsTotal = session.materials.reduce(
    (sum, material) => sum + material.estimatedDuration,
    0
  )
  const remainder = session.estimatedTime - materialsTotal
  const budget =
    '<p class="session-budget"><span class="session-budget-label">Budget:</span> ' +
    esc(String(materialsTotal)) +
    ' min on materials · ' +
    esc(String(remainder)) +
    ' min on the artifact</p>'
  const units =
    '<p class="session-units"><span class="session-units-label">Drills:</span> ' +
    session.highFrequencyUnits.map(esc).join(', ') +
    '</p>'
  const hook = session.encodingHook
    ? '<p class="session-hook"><span class="session-hook-label">Encoding hook:</span> ' +
      esc(session.encodingHook) +
      '</p>'
    : ''
  return (
    '<section class="session" data-session="' +
    sessionNo +
    '"' +
    consolidation.attribute +
    '>' +
    '<div class="session-summary" role="button" tabindex="0" aria-expanded="false" aria-controls="' +
    detailId +
    '">' +
    '<input class="session-check" type="checkbox" data-session="' +
    sessionNo +
    '" aria-label="Mark session ' +
    sessionNo +
    ' complete">' +
    '<span class="session-number">' +
    sessionNo +
    '</span>' +
    '<span class="session-title">' +
    esc(session.title) +
    '</span>' +
    '<span class="session-artifact">' +
    esc(session.artifactOneLiner) +
    '</span>' +
    '<span class="session-tags">' +
    consolidation.badge +
    warning +
    '</span>' +
    '</div>' +
    '<div class="session-detail" id="' +
    detailId +
    '" hidden>' +
    '<div class="detail-block"><span class="detail-label">Materials</span>' +
    '<ul class="materials">' +
    materials +
    '</ul>' +
    budget +
    '</div>' +
    units +
    hook +
    '<p class="self-check"><span class="self-check-label">Self-check</span>' +
    esc(session.selfCheck) +
    '</p>' +
    renderDeliverable(session) +
    '<label class="notes-label" for="notes-' +
    sessionNo +
    '">Notes' +
    '<textarea class="notes-area" id="notes-' +
    sessionNo +
    '" data-session="' +
    sessionNo +
    '" placeholder="What worked, what did not, what to review."></textarea>' +
    '</label>' +
    '</div>' +
    '</section>'
  )
}

function renderPreamble(plan: PlanData): string {
  const p = plan.disssPreamble
  const reasons = [
    ['Deconstruction', p.deconstruction],
    ['Selection rationale', p.selectionRationale],
    ['Cut list', p.cutList],
    ['Sequencing rationale', p.sequencingRationale],
  ]
    .map(
      ([label, text]) =>
        '<div class="reason"><span class="reason-label">' +
        esc(label) +
        '</span><p class="reason-text">' +
        esc(text) +
        '</p></div>'
    )
    .join('')
  return (
    '<section class="preamble">' +
    '<div class="section-heading"><h2>How this plan was built (DISSS)</h2></div>' +
    '<div class="preamble-grid">' +
    reasons +
    '</div>' +
    '</section>'
  )
}

// A contiguous run reads as a range ("Sessions 1–6"); anything else is only a count.
function phaseSpanLabel(sessions: number[]): string {
  const first = sessions[0]
  if (first === undefined) return ''
  const contiguous = sessions.every((number, i) => number === first + i)
  return contiguous
    ? 'Sessions ' + first + '–' + sessions[sessions.length - 1]
    : sessions.length + ' sessions'
}

function renderPhaseBand(phase: Phase, index: number): string {
  const spanLabel = phaseSpanLabel(phase.sessions)
  return (
    '<div class="phase-band"><div class="phase-title-wrap"><span class="phase-no">' +
    esc(String(index + 1).padStart(2, '0')) +
    '</span><span class="phase-title">' +
    esc(phase.title) +
    '</span></div><span class="phase-meta">' +
    esc(spanLabel) +
    '</span></div>'
  )
}

function renderOutlierStory(story: OutlierStory): string {
  const safeCitation = esc(story.citation)
  const isUnverified = story.verification?.status === 'unresolved-after-retries'
  const warning = isUnverified
    ? '<span class="tag warning outlier-story-warning">⚠ Unverified citation</span>'
    : ''
  return (
    '<div class="outlier-story">' +
    '<h3 class="outlier-story-title">Outlier Story: ' + esc(story.person) + '</h3>' +
    '<p class="outlier-story-approach"><strong>Unusual Approach:</strong> ' + esc(story.approach) + '</p>' +
    '<p class="outlier-story-principle"><strong>Transferable Principle:</strong> ' + esc(story.principle) + '</p>' +
    '<p class="outlier-story-citation"><strong>Citation:</strong> <a href="' + safeCitation + '" target="_blank" rel="noopener">' + safeCitation + '</a>' +
    warning +
    '</p>' +
    '</div>'
  )
}

const EMPTY_OUTLIER_STORY_TEXT = 'No subject-specific outlier case found for this phase.'

function renderEmptyOutlierStory(): string {
  return (
    '<div class="outlier-story outlier-story--empty">' +
    '<p>' +
    esc(EMPTY_OUTLIER_STORY_TEXT) +
    '</p>' +
    '</div>'
  )
}

export function renderPlan(plan: PlanData): string {
  const rendered = new Set<number>()
  let sessionsHtml = ''
  for (const [index, phase] of plan.phases.entries()) {
    sessionsHtml += renderPhaseBand(phase, index)
    if (phase.outlierStory) {
      sessionsHtml += renderOutlierStory(phase.outlierStory)
    } else {
      sessionsHtml += renderEmptyOutlierStory()
    }
    for (const number of phase.sessions) {
      const session = plan.sessions.find((candidate) => candidate.number === number)
      if (!session || rendered.has(number)) continue
      rendered.add(number)
      sessionsHtml += renderSession(session)
    }
  }
  for (const session of plan.sessions) {
    if (rendered.has(session.number)) continue
    rendered.add(session.number)
    sessionsHtml += renderSession(session)
  }

  const sessionCount = esc(String(plan.sessions.length))
  // Both targets come from meta, not from the prose, so the note always
  // names what was asked and what the sessions actually aim at even when a
  // hand-edited scopeNote forgets to.
  const hoursWord = plan.meta.hoursPerDay === 1 ? 'hour' : 'hours'
  const scopeNote = plan.scopeNote
    ? '<aside class="scope-note" aria-label="Scope">' +
      '<p><strong>Scope</strong></p>' +
      '<p class="scope-stated">You asked for: <span>' +
      esc(plan.meta.targetCapability) +
      '</span></p>' +
      '<p class="scope-honest">In ' +
      sessionCount +
      ' sessions at ' +
      esc(String(plan.meta.hoursPerDay)) +
      ' ' +
      hoursWord +
      ' a day, the honest target is: <span>' +
      esc(plan.meta.honestTarget ?? '') +
      '</span></p>' +
      '<p class="scope-reason">' +
      esc(plan.scopeNote) +
      '</p>' +
      '</aside>'
    : ''

  return (
    '<!DOCTYPE html>' +
    '<html lang="en">' +
    '<head>' +
    '<meta charset="UTF-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<title>' +
    esc(plan.meta.subject) +
    ' — 14-Session Study Plan</title>' +
    '<style>' +
    STYLE +
    '</style>' +
    '<script>' +
    THEME_BOOT +
    '</script>' +
    '</head>' +
    '<body>' +
    '<div class="ledger-app">' +
    '<header class="masthead">' +
    '<p class="eyebrow">14-Session Study Plan</p>' +
    '<button class="mode-button" id="theme-toggle" type="button" aria-label="Colour theme: ' +
    esc(THEME_NAMES.system) +
    '. Activate to change.">' +
    esc(THEME_NAMES.system) +
    '</button>' +
    '</header>' +
    '<main class="page">' +
    '<section class="hero"><div><h1>' +
    esc(plan.meta.subject) +
    '</h1><p class="hero-target"><strong>Target:</strong> ' +
    esc(plan.meta.honestTarget ?? plan.meta.targetCapability) +
    '</p>' +
    scopeNote +
    '</div><aside class="hero-aside" aria-label="Plan summary"><div class="aside-rule"></div><div class="aside-stat"><span class="aside-label">Sessions</span><span class="aside-value">' +
    sessionCount +
    '</span></div><div class="aside-stat"><span class="aside-label">Hours / day</span><span class="aside-value">' +
    esc(String(plan.meta.hoursPerDay)) +
    '</span></div><div class="aside-stat"><span class="aside-label">Current level</span><span class="aside-value">' +
    esc(plan.meta.currentLevel) +
    '</span></div></aside></section>' +
    '<div class="stakes-field"><label class="stakes-label" for="stakes">Stakes</label><input class="stakes-input" id="stakes" type="text" value="' +
    esc(plan.stakes) +
    '" placeholder="Set a real consequence for abandoning this sprint."></div>' +
    renderPreamble(plan) +
    '<section class="section-heading plan-heading"><h2>The sessions</h2></section>' +
    sessionsHtml +
    '</main>' +
    '<footer class="progress-spine"><div class="spine-inner"><div class="progress-indicator" role="status" aria-live="polite">0 of ' +
    sessionCount +
    ' sessions complete</div><div class="progress-track" aria-hidden="true"><div class="progress-fill" id="progress-fill"></div></div><div class="footer-actions"><button class="footer-action" id="export-progress" type="button">Export Progress</button><label class="footer-action progress-import-label" for="import-progress">Import Progress<input id="import-progress" type="file" accept=".json"></label></div></div></footer>' +
    '</div>' +
    '<script>' +
    SCRIPT +
    '</script>' +
    '</body>' +
    '</html>'
  )
}
