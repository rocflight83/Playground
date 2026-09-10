import type { Material, PlanData, Session } from './plan-types'

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

const STYLE = `
:root { --bg:#fafafa; --surface:#ffffff; --fg:#14161a; --muted:#5b6572; --accent:#2f6f4f; --line:#e2e6ea; --band:#eef2f5; --warn-bg:#fff7e6; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
html { overflow-x: hidden; }
body { font: 16px/1.6 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; background: var(--bg); color: var(--fg); }
.page { max-width: 46rem; margin: 0 auto; padding: 2rem 1.25rem 6rem; }
h1 { font-size: 1.9rem; line-height: 1.2; margin: 0 0 .25rem; }
.meta { color: var(--muted); margin: 0 0 1.5rem; }
.scope-note { background: var(--warn-bg); border-left: 4px solid var(--accent); padding: .75rem 1rem; margin: 0 0 1.5rem; border-radius: 0 6px 6px 0; overflow-wrap: break-word; }
.stakes-field { display: flex; gap: .5rem; align-items: baseline; margin: 0 0 1.75rem; }
.stakes-field label { font-weight: 600; }
.stakes-field input { flex: 1; padding: .4rem .5rem; border: 1px solid var(--line); border-radius: 6px; font: inherit; background: var(--surface); color: inherit; }
.preamble { margin: 0 0 2rem; }
.preamble h2 { font-size: 1.15rem; margin: 0 0 .5rem; }
.preamble dl { margin: 0; }
.preamble dt { font-weight: 600; margin-top: .6rem; }
.preamble dd { margin: 0; color: var(--fg); overflow-wrap: break-word; }
.phase-band { display: flex; align-items: center; gap: .6rem; margin: 2rem 0 .75rem; padding: .35rem .7rem; background: var(--band); border-radius: 6px; }
.phase-title { font-weight: 700; }
.session { border: 1px solid var(--line); border-radius: 8px; margin: 0 0 .5rem; background: var(--surface); }
.session-summary { display: flex; align-items: baseline; gap: .6rem; flex-wrap: wrap; padding: .7rem .9rem; cursor: pointer; }
.session-summary:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
.session-check { align-self: center; width: 1.05rem; height: 1.05rem; margin: 0; }
.session-number { font-variant-numeric: tabular-nums; color: var(--muted); font-weight: 700; }
.session-title { font-weight: 600; }
.session-artifact { color: var(--muted); flex: 1 1 100%; overflow-wrap: break-word; }
.session-detail { padding: .25rem .9rem .9rem; border-top: 1px solid var(--line); overflow-x: auto; }
.session-detail[hidden] { display: none; }
.materials { list-style: none; margin: .6rem 0; padding: 0; }
.material { display: grid; grid-template-columns: 1fr auto auto; gap: .25rem .75rem; align-items: baseline; padding: .35rem 0; border-bottom: 1px dashed var(--line); overflow-wrap: break-word; }
.material-link { color: var(--accent); text-decoration: none; }
.material-link:hover { text-decoration: underline; }
.material-duration { color: var(--muted); white-space: nowrap; }
.material-paid { color: #a15c00; white-space: nowrap; }
.self-check { margin: .6rem 0; padding: .5rem .7rem; background: var(--band); border-radius: 6px; overflow-wrap: break-word; }
.self-check-label { font-weight: 600; }
.notes-label { display: block; font-weight: 600; margin-top: .6rem; }
.notes-area { width: 100%; min-height: 5rem; margin-top: .3rem; padding: .5rem; border: 1px solid var(--line); border-radius: 6px; font: inherit; background: var(--surface); color: inherit; }
`.trim()

const SCRIPT = `
(function () {
  function setOpen(summary, open) {
    var detail = document.getElementById(summary.getAttribute('aria-controls'));
    if (!detail) return;
    if (open) detail.removeAttribute('hidden'); else detail.setAttribute('hidden', '');
    summary.setAttribute('aria-expanded', open ? 'true' : 'false');
  }
  function toggle(summary) { setOpen(summary, summary.getAttribute('aria-expanded') !== 'true'); }
  var summaries = document.querySelectorAll('.session-summary');
  for (var i = 0; i < summaries.length; i++) {
    (function (summary) {
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
    })(summaries[i]);
  }
})();
`.trim()

function renderMaterial(material: Material): string {
  const paid = material.paid
    ? '<span class="material-paid">Paid — $' + esc(String(material.price ?? 0)) + '</span>'
    : ''
  return (
    '<li class="material">' +
    '<a class="material-link" href="' + esc(material.url) + '" target="_blank" rel="noopener">' +
    esc(material.title) +
    '</a>' +
    '<span class="material-duration">' + esc(String(material.estimatedDuration)) + ' min</span>' +
    paid +
    '</li>'
  )
}

function renderSession(session: Session): string {
  const materials = session.materials.map(renderMaterial).join('')
  const detailId = 'session-detail-' + session.number
  return (
    '<section class="session" data-session="' + session.number + '">' +
    '<div class="session-summary" role="button" tabindex="0" aria-expanded="false" aria-controls="' + detailId + '">' +
    '<input class="session-check" type="checkbox" data-session="' + session.number + '" aria-label="Mark session ' + session.number + ' complete">' +
    '<span class="session-number">' + session.number + '</span>' +
    '<span class="session-title">' + esc(session.title) + '</span>' +
    '<span class="session-artifact">' + esc(session.artifactOneLiner) + '</span>' +
    '</div>' +
    '<div class="session-detail" id="' + detailId + '" hidden>' +
    '<ul class="materials">' + materials + '</ul>' +
    '<p class="self-check"><span class="self-check-label">Self-check:</span> ' + esc(session.selfCheck) + '</p>' +
    '<label class="notes-label" for="notes-' + session.number + '">Notes' +
    '<textarea class="notes-area" id="notes-' + session.number + '" data-session="' + session.number + '" placeholder="What worked, what did not, what to review."></textarea>' +
    '</label>' +
    '</div>' +
    '</section>'
  )
}

function renderPreamble(plan: PlanData): string {
  const p = plan.disssPreamble
  return (
    '<section class="preamble">' +
    '<h2>How this plan was built (DISSS)</h2>' +
    '<dl>' +
    '<dt>Deconstruction</dt><dd>' + esc(p.deconstruction) + '</dd>' +
    '<dt>Selection rationale</dt><dd>' + esc(p.selectionRationale) + '</dd>' +
    '<dt>Cut list</dt><dd>' + esc(p.cutList) + '</dd>' +
    '<dt>Sequencing rationale</dt><dd>' + esc(p.sequencingRationale) + '</dd>' +
    '</dl>' +
    '</section>'
  )
}

export function renderPlan(plan: PlanData): string {
  const rendered = new Set<number>()
  let sessionsHtml = ''
  for (const phase of plan.phases) {
    sessionsHtml +=
      '<div class="phase-band"><span class="phase-title">' + esc(phase.title) + '</span></div>'
    for (const number of phase.sessions) {
      const session = plan.sessions.find((s) => s.number === number)
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

  const scopeNote = plan.scopeNote
    ? '<aside class="scope-note"><strong>Scope:</strong> ' + esc(plan.scopeNote) + '</aside>'
    : ''

  return (
    '<!DOCTYPE html>' +
    '<html lang="en">' +
    '<head>' +
    '<meta charset="UTF-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<title>' + esc(plan.meta.subject) + ' — 14-Session Study Plan</title>' +
    '<style>' + STYLE + '</style>' +
    '</head>' +
    '<body>' +
    '<main class="page">' +
    '<h1>' + esc(plan.meta.subject) + '</h1>' +
    scopeNote +
    '<p class="meta">Target: ' + esc(plan.meta.targetCapability) + ' · Level: ' + esc(plan.meta.currentLevel) +
    ' · Hours/day: ' + esc(String(plan.meta.hoursPerDay)) + '</p>' +
    '<div class="stakes-field">' +
    '<label for="stakes">Stakes</label>' +
    '<input id="stakes" type="text" value="' + esc(plan.stakes) + '" placeholder="Set a real consequence for abandoning this sprint.">' +
    '</div>' +
    renderPreamble(plan) +
    sessionsHtml +
    '</main>' +
    '<script>' + SCRIPT + '</script>' +
    '</body>' +
    '</html>'
  )
}
