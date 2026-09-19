/*
 * The live page's curation layer (ticket 18). Served by the app at /live.js
 * and spliced into the rendered plan page immediately before the page's own
 * script, so `window.StudyPlanStore` exists when that script seeds the page.
 *
 * Three jobs:
 *   1. Progress: define `window.StudyPlanStore` seeded from the JSON the
 *      server embedded in `#live-progress`; saves go to
 *      `PUT /api/plans/:id/progress` after a short debounce.
 *   2. Curate mode: a masthead toggle; on, a rail per session (drop as
 *      known, re-plan) and a swap control per material, each opening a
 *      small inline panel that posts a curation request. The session being
 *      curated is untouched until the job is applied and the page reloads.
 *      The rail's shape is #19's variant C as prototyped (#31): two icon
 *      buttons, ✓ and ↻, hanging off the top-left of the session box, and
 *      a ⇄ icon on each material; their names live in `aria-label`/`title`.
 *   3. The request tray and the "Previously:" folds, both read from the API.
 *
 * Plain browser JS, no build step. Data reaches the DOM only through
 * `textContent` and `setAttribute`; the layer never renders plan prose —
 * the shell already did. Every class is prefixed `live-`.
 */
(function () {
  'use strict';

  var match = window.location.pathname.match(/^\/plans\/([^/]+)$/);
  if (!match) return;
  var planId = decodeURIComponent(match[1]);
  var api = '/api/plans/' + encodeURIComponent(planId);

  var POLL_MS = 1500;
  var SAVE_DEBOUNCE_MS = 500;
  var MIN_KNOWN_CHARS = 10;
  var SWAP_REASONS = ['too basic', 'too advanced', 'want a practitioner take', 'wrong format', 'dead link'];
  var STAGES = ['requested', 'sourcing', 'verifying', 'applied'];

  function noop() {}

  function jsonHeaders() { return { 'Content-Type': 'application/json' }; }

  // -- Progress (decision 4) -----------------------------------------------

  var progress = {};
  try {
    var seed = document.getElementById('live-progress');
    var parsed = seed ? JSON.parse(seed.textContent || 'null') : null;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) progress = parsed;
  } catch (e) { /* an unreadable seed means empty progress, as localStorage would */ }

  var saveTimer = null;
  var dirty = false;

  function flushProgress(keepalive) {
    if (!dirty) return;
    dirty = false;
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    var init = { method: 'PUT', headers: jsonHeaders(), body: JSON.stringify(progress) };
    if (keepalive) init.keepalive = true;
    try { fetch(api + '/progress', init).catch(noop); } catch (e) { /* nothing to do offline */ }
  }

  window.StudyPlanStore = {
    load: function () { return progress; },
    save: function (data) {
      progress = data && typeof data === 'object' && !Array.isArray(data) ? data : {};
      dirty = true;
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(function () { flushProgress(false); }, SAVE_DEBOUNCE_MS);
    }
  };
  // Import Progress reloads at once and the tray reloads on applied: a
  // pending save must not be lost to either, so the unload path flushes.
  window.addEventListener('pagehide', function () { flushProgress(true); });

  // -- DOM helpers --------------------------------------------------------

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function button(className, text, onClick) {
    var node = el('button', className, text);
    node.type = 'button';
    if (onClick) node.addEventListener('click', onClick);
    return node;
  }

  /** A glyph-only button whose name is its label and tooltip. */
  function iconButton(className, glyph, label, onClick) {
    var node = button(className, glyph, onClick);
    node.setAttribute('aria-label', label);
    node.title = label;
    return node;
  }

  function removeAll(selector) {
    var nodes = document.querySelectorAll(selector);
    for (var i = 0; i < nodes.length; i++) nodes[i].parentNode.removeChild(nodes[i]);
  }

  function sessionSections() {
    return Array.prototype.slice.call(document.querySelectorAll('.session[data-session]'));
  }

  function sectionOf(sessionNumber) {
    return document.querySelector('.session[data-session="' + Number(sessionNumber) + '"]');
  }

  function sessionNumberOf(section) {
    return parseInt(section.getAttribute('data-session'), 10);
  }

  function dateOf(iso) {
    return typeof iso === 'string' && iso.length >= 10 ? iso.slice(0, 10) : '';
  }

  // -- Request tray ---------------------------------------------------------

  var tray = el('aside', 'live-tray');
  tray.setAttribute('aria-label', 'Curation requests');
  tray.setAttribute('aria-live', 'polite');
  tray.hidden = true;
  tray.appendChild(el('div', 'live-tray-title', 'Requests'));
  var trayList = el('ul', 'live-tray-list');
  tray.appendChild(trayList);
  document.body.appendChild(tray);

  var trayRows = {};
  var localCount = 0;

  function isTerminal(stage) {
    return stage === 'applied' || stage === 'refused' || stage === 'failed';
  }

  function kindLabel(kind) {
    if (kind === 'curate') return 'Curate';
    if (kind === 'verify') return 'Verify';
    if (kind === 'generate') return 'Generate';
    return String(kind || 'Request');
  }

  function describeRequest(request) {
    var what = request.intent === 'drop-as-known' ? 'Drop as known'
      : request.intent === 'redo-session' ? 'Re-plan'
      : 'Swap material';
    return what + ' · session ' + request.sessionNumber;
  }

  function renderRow(row) {
    var li = row.li;
    while (li.firstChild) li.removeChild(li.firstChild);
    var job = row.job || {};
    var stage = job.stage || 'requested';
    li.className = 'live-tray-row live-tray-' + stage;
    li.appendChild(el('div', 'live-tray-head', row.label || kindLabel(job.kind)));

    var steps = el('div', 'live-steps');
    var position = STAGES.indexOf(stage);
    for (var i = 0; i < STAGES.length; i++) {
      if (i > 0) steps.appendChild(el('span', 'live-step-arrow', '›'));
      var cls = 'live-step';
      if (position === -1) { if (i <= 1) cls += ' live-step-done'; }
      else if (i < position) cls += ' live-step-done';
      else if (i === position) cls += ' live-step-now';
      steps.appendChild(el('span', cls, STAGES[i]));
    }
    if (stage === 'refused' || stage === 'failed') {
      steps.appendChild(el('span', 'live-step-arrow', '›'));
      var result = job.result || {};
      var word = stage === 'refused' && result.stage ? 'refused (' + result.stage + ')' : stage;
      steps.appendChild(el('span', 'live-step live-step-' + stage, word));
    }
    li.appendChild(steps);

    if (stage === 'refused') {
      var reasons = el('ul', 'live-reasons');
      var list = job.result && Array.isArray(job.result.reasons) ? job.result.reasons : [];
      for (var r = 0; r < list.length; r++) reasons.appendChild(el('li', null, list[r]));
      li.appendChild(reasons);
    } else if (stage === 'failed') {
      li.appendChild(el('p', 'live-error', job.result && job.result.error ? job.result.error : 'failed'));
    } else if (stage === 'applied' && row.reloadOnApply) {
      li.appendChild(el('p', 'live-muted', 'Applied — reloading the page…'));
    }
    if (isTerminal(stage)) {
      li.appendChild(button('live-link', 'Dismiss', function () {
        trayList.removeChild(li);
        delete trayRows[row.id];
        if (!trayList.firstChild) tray.hidden = true;
      }));
    }
  }

  // options: { label, reloadOnApply, atEnd } — label defaults to the job's
  // kind; atEnd appends (the on-load list already arrives newest first),
  // otherwise the row goes on top.
  function addRow(id, job, options) {
    var row = trayRows[id];
    if (!row) {
      row = { id: id, li: el('li', 'live-tray-row'), label: options.label || null, reloadOnApply: Boolean(options.reloadOnApply) };
      trayRows[id] = row;
      if (options.atEnd || !trayList.firstChild) trayList.appendChild(row.li);
      else trayList.insertBefore(row.li, trayList.firstChild);
    }
    row.job = job;
    tray.hidden = false;
    renderRow(row);
    return row;
  }

  function reload() {
    flushProgress(true);
    try { window.location.reload(); } catch (e) { /* not navigable here */ }
  }

  function poll(row) {
    fetch('/api/jobs/' + encodeURIComponent(row.id))
      .then(function (response) { return response.json(); })
      .then(function (job) {
        if (!job || typeof job !== 'object' || !job.stage) throw new Error('bad job');
        row.job = job;
        renderRow(row);
        if (!isTerminal(job.stage)) setTimeout(function () { poll(row); }, POLL_MS);
        else if (job.stage === 'applied' && row.reloadOnApply) reload();
      })
      .catch(function () { setTimeout(function () { poll(row); }, POLL_MS); });
  }

  function trackJob(jobId, label) {
    var row = addRow(jobId, { stage: 'requested' }, { label: label, reloadOnApply: true });
    poll(row);
  }

  function submitCuration(request) {
    var label = describeRequest(request);
    fetch(api + '/curations', { method: 'POST', headers: jsonHeaders(), body: JSON.stringify(request) })
      .then(function (response) {
        return response.json().then(function (body) { return { ok: response.ok, body: body }; });
      })
      .then(function (answer) {
        if (answer.ok && answer.body && answer.body.jobId) { trackJob(answer.body.jobId, label); return; }
        var message = answer.body && answer.body.error ? answer.body.error : 'request not accepted';
        addRow('local-' + (++localCount), { stage: 'failed', result: { error: message } }, { label: label });
      })
      .catch(function (err) {
        addRow('local-' + (++localCount), { stage: 'failed', result: { error: String(err) } }, { label: label });
      });
  }

  // Jobs already on record for this plan: show them, keep polling the live ones.
  fetch(api + '/jobs')
    .then(function (response) { return response.json(); })
    .then(function (jobs) {
      if (!Array.isArray(jobs)) return;
      for (var i = 0; i < jobs.length; i++) {
        var job = jobs[i];
        if (!job || !job.id) continue;
        var row = addRow(job.id, job, { reloadOnApply: !isTerminal(job.stage), atEnd: true });
        if (!isTerminal(job.stage)) poll(row);
      }
    })
    .catch(noop);

  // -- Curate mode ----------------------------------------------------------

  var curating = false;
  var toggle = button('live-toggle', 'Curate', function () {
    curating = !curating;
    toggle.textContent = curating ? 'Done curating' : 'Curate';
    toggle.setAttribute('aria-pressed', curating ? 'true' : 'false');
    document.body.classList.toggle('live-curating', curating);
    if (curating) mountRails(); else unmountRails();
  });
  toggle.setAttribute('aria-pressed', 'false');
  var masthead = document.querySelector('.masthead');
  (masthead || document.body).appendChild(toggle);

  function mountRails() {
    sessionSections().forEach(function (section) {
      var rail = el('div', 'live-rail');
      var drop = iconButton('live-rail-button', '✓', 'I already know this');
      if (section.getAttribute('data-consolidation') === 'true') {
        drop.disabled = true;
        drop.title = 'A consolidation session reviews the other sessions; there is nothing here to already know.';
      } else {
        drop.addEventListener('click', function () { openDropPanel(section); });
      }
      var redo = iconButton('live-rail-button', '↻', 'Re-plan this session', function () { openRedoPanel(section); });
      rail.appendChild(drop);
      rail.appendChild(redo);
      // First in the box, so DOM and keyboard order match the top-left placement.
      section.insertBefore(rail, section.firstChild);

      var rows = section.querySelectorAll('.material');
      for (var i = 0; i < rows.length; i++) attachSwap(section, rows[i]);
    });
  }

  function attachSwap(section, row) {
    var link = row.querySelector('.material-link');
    if (!link) return;
    var url = link.getAttribute('href');
    row.appendChild(iconButton('live-swap', '⇄', 'Swap this material', function () { openSwapPanel(section, row, url); }));
  }

  function unmountRails() {
    closePanel();
    removeAll('.live-rail');
    removeAll('.live-swap');
  }

  var openPanelNode = null;

  function closePanel() {
    if (openPanelNode && openPanelNode.parentNode) openPanelNode.parentNode.removeChild(openPanelNode);
    openPanelNode = null;
  }

  function openPanel(anchor, ariaLabel) {
    closePanel();
    var panel = el('div', 'live-panel');
    panel.setAttribute('role', 'group');
    panel.setAttribute('aria-label', ariaLabel);
    anchor.parentNode.insertBefore(panel, anchor.nextSibling);
    openPanelNode = panel;
    return panel;
  }

  function actionRow(primary, hint) {
    var row = el('div', 'live-panel-row');
    row.appendChild(primary);
    row.appendChild(button('live-button', 'Cancel', closePanel));
    if (hint) row.appendChild(el('span', 'live-muted', hint));
    return row;
  }

  /** Session panels sit under the summary row; the rail is first in the box and not an anchor. */
  function panelAnchor(section) {
    return section.querySelector('.session-summary') || section.lastChild;
  }

  function openDropPanel(section) {
    var n = sessionNumberOf(section);
    var panel = openPanel(panelAnchor(section), 'Drop session ' + n + ' as known');
    var label = el('label', 'live-panel-label', 'What do you already know from this session?');
    var textarea = el('textarea', 'live-textarea');
    textarea.name = 'known';
    textarea.rows = 3;
    textarea.placeholder = 'In your own words. This becomes part of your current level.';
    label.appendChild(textarea);
    panel.appendChild(label);
    var submit = button('live-button live-button-primary', 'Drop and replace', function () {
      var known = textarea.value.trim();
      if (known.length < MIN_KNOWN_CHARS) return;
      closePanel();
      submitCuration({ intent: 'drop-as-known', sessionNumber: n, known: known });
    });
    submit.disabled = true;
    textarea.addEventListener('input', function () {
      submit.disabled = textarea.value.trim().length < MIN_KNOWN_CHARS;
    });
    panel.appendChild(actionRow(submit, 'The button unlocks once you have written at least ' + MIN_KNOWN_CHARS + ' characters.'));
    textarea.focus();
  }

  function openRedoPanel(section) {
    var n = sessionNumberOf(section);
    var panel = openPanel(panelAnchor(section), 'Re-plan session ' + n);
    var input = el('input', 'live-input');
    input.type = 'text';
    input.name = 'reason';
    input.placeholder = 'What is wrong with this session? (optional)';
    var submit = button('live-button live-button-primary', 'Re-plan this session', function () {
      var request = { intent: 'redo-session', sessionNumber: n };
      var reason = input.value.trim();
      if (reason) request.reason = reason;
      closePanel();
      submitCuration(request);
    });
    input.addEventListener('keydown', function (event) { if (event.key === 'Enter') submit.click(); });
    var row = el('div', 'live-panel-row');
    row.appendChild(input);
    panel.appendChild(row);
    panel.appendChild(actionRow(submit));
    input.focus();
  }

  function openSwapPanel(section, row, materialUrl) {
    var n = sessionNumberOf(section);
    var panel = openPanel(row.lastChild, 'Swap a material in session ' + n);
    var chips = el('div', 'live-chips');
    SWAP_REASONS.forEach(function (reason) {
      chips.appendChild(button('live-chip', reason, function () {
        closePanel();
        submitCuration({ intent: 'swap-material', sessionNumber: n, materialUrl: materialUrl, by: { reason: reason } });
      }));
    });
    panel.appendChild(chips);
    var input = el('input', 'live-input');
    input.type = 'url';
    input.name = 'url';
    input.placeholder = 'or a URL of your own';
    var submit = button('live-button live-button-primary', 'Use it', function () {
      var url = input.value.trim();
      if (!url) return;
      closePanel();
      submitCuration({ intent: 'swap-material', sessionNumber: n, materialUrl: materialUrl, by: { url: url } });
    });
    input.addEventListener('keydown', function (event) { if (event.key === 'Enter') submit.click(); });
    var urlRow = el('div', 'live-panel-row');
    urlRow.appendChild(input);
    panel.appendChild(urlRow);
    panel.appendChild(actionRow(submit));
  }

  // -- "Previously:" folds ------------------------------------------------------

  function foldFor(summaryText, bodyText) {
    var fold = el('details', 'live-fold');
    fold.appendChild(el('summary', 'live-fold-summary', summaryText));
    fold.appendChild(el('p', 'live-fold-body', bodyText));
    return fold;
  }

  function verbFor(record) {
    if (record.intent === 'drop-as-known') return 'dropped as known';
    if (record.intent === 'redo-session') return 're-planned';
    return 'swapped';
  }

  function materialRowByUrl(section, url) {
    if (!url) return null;
    var links = section.querySelectorAll('.material-link');
    for (var i = 0; i < links.length; i++) {
      if (links[i].getAttribute('href') === url) return links[i].closest('.material');
    }
    return null;
  }

  function renderFolds(plan) {
    var log = plan && Array.isArray(plan.curationLog) ? plan.curationLog : [];
    // Oldest first, each prepended, so the newest record ends up on top.
    log.forEach(function (record) {
      if (!record || typeof record !== 'object') return;
      var section = sectionOf(record.sessionNumber);
      var detail = section && section.querySelector('.session-detail');
      if (!detail) return;
      var when = dateOf(record.at);
      if (record.replacedSession && typeof record.replacedSession === 'object') {
        var old = record.replacedSession;
        detail.insertBefore(
          foldFor('Previously: ' + old.title + ' · ' + verbFor(record) + (when ? ' ' + when : ''), old.artifactOneLiner || ''),
          detail.firstChild
        );
      } else if (record.replacedMaterial && typeof record.replacedMaterial === 'object') {
        var oldMaterial = record.replacedMaterial;
        var row = materialRowByUrl(section, record.suppliedUrl);
        if (row) {
          var link = row.querySelector('.material-link');
          var note = el('div', 'live-replaced');
          note.appendChild(el('span', null, 'Replaced · '));
          note.appendChild(el('s', null, oldMaterial.title));
          note.appendChild(el('span', null, ' → ' + (link ? link.textContent : '')));
          row.insertBefore(note, row.querySelector('.live-swap'));
        } else {
          detail.insertBefore(
            foldFor('Previously: ' + oldMaterial.title + ' · material ' + verbFor(record) + (when ? ' ' + when : ''), oldMaterial.url || ''),
            detail.firstChild
          );
        }
      }
    });
  }

  fetch(api)
    .then(function (response) { return response.json(); })
    .then(renderFolds)
    .catch(noop);
})();
