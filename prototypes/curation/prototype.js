/*
 * PROTOTYPE — throwaway. Ticket #19: what curation looks and feels like on
 * the plan page. Three variants of the curation affordances (drop-as-known,
 * swap-material, redo-session) mounted on the real rendered plan page,
 * switchable via `?variant=A|B|C` and the floating bar at the bottom.
 *
 * State lives in memory only. "Sourcing" and "verifying" are timers, and the
 * replacements are fabricated from the session being replaced. Nothing here
 * is production code: no tests, no persistence, no error handling beyond
 * what keeps the page running.
 */
(function () {
  'use strict'

  var PLAN = window.__PROTO_PLAN__
  var SOURCING_MS = 1800
  var VERIFYING_MS = 1500
  var CONSOLIDATION = [6, 11]
  var REASON_CHIPS = ['too basic', 'too advanced', 'want a practitioner take', 'wrong format', 'dead link']

  // ------------------------------------------------------------------
  // Shared in-memory store (the same "backend stub" for every variant)
  // ------------------------------------------------------------------
  var state = {
    plan: JSON.parse(JSON.stringify(PLAN)),
    inflight: [], // { id, request, stage: 'sourcing' | 'verifying', label }
    refused: [], // { id, request, stage, reasons }
    log: [], // CurationRecord[] (+ prototype-only _replacementUrl)
  }
  state.plan.curationLog = state.log
  var nextId = 1
  var listeners = []
  function emit(sessionNumber) {
    listeners.forEach(function (fn) { fn(sessionNumber) })
  }

  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
  }
  function session(n) {
    return state.plan.sessions.filter(function (s) { return s.number === Number(n) })[0]
  }
  function isConsolidation(n) { return CONSOLIDATION.indexOf(Number(n)) !== -1 }
  function budgetFor(sess, excludingUrl) {
    var others = sess.materials.filter(function (m) { return m.url !== excludingUrl })
      .reduce(function (sum, m) { return sum + m.estimatedDuration }, 0)
    return sess.estimatedTime - others
  }
  function inflightFor(n) {
    return state.inflight.filter(function (e) { return e.request.sessionNumber === Number(n) })
  }
  function inflightForMaterial(n, url) {
    return inflightFor(n).filter(function (e) {
      return e.request.intent === 'swap-material' && e.request.materialUrl === url
    })[0]
  }
  function refusedFor(n) {
    return state.refused.filter(function (e) { return e.request.sessionNumber === Number(n) })
  }
  function recordsFor(n) {
    return state.log.filter(function (r) { return r.sessionNumber === Number(n) })
  }
  function sessionRecordsFor(n) {
    return recordsFor(n).filter(function (r) { return r.replacedSession })
  }
  function materialRecordFor(n, url) {
    return recordsFor(n).filter(function (r) { return r.replacedMaterial && r._replacementUrl === url }).pop()
  }
  function timeLabel(iso) {
    var d = new Date(iso)
    return d.toTimeString().slice(0, 5)
  }

  // --- fabricated replacements ("the intelligence") ---
  function fakeMaterial(old, by, budget) {
    var title, url
    if (by.url) {
      var host = by.url.replace(/^https?:\/\//, '').split('/')[0]
      title = 'Learner-supplied: ' + host + ' — ' + old.title.split(' ').slice(0, 4).join(' ')
      url = by.url
    } else {
      var prefix = {
        'too basic': 'Deeper treatment: ',
        'too advanced': 'Gentler introduction: ',
        'want a practitioner take': 'Practitioner talk: ',
        'wrong format': 'Video walkthrough: ',
        'dead link': 'Mirror: ',
      }[by.reason] || 'Alternative: '
      title = prefix + old.title
      url = 'https://example.org/replacement/' + encodeURIComponent(old.title.toLowerCase().replace(/\s+/g, '-'))
    }
    return {
      title: title,
      url: url,
      sourceType: by.reason === 'want a practitioner take' ? 'practitioner' : 'off-list',
      estimatedDuration: Math.min(old.estimatedDuration, budget),
      paid: false,
      verification: { status: 'verified-by-content', checkedAt: new Date().toISOString() },
    }
  }
  function fakeSession(old, mode) {
    var units = old.highFrequencyUnits
    var mats = units.slice(0, 2).map(function (u, i) {
      return {
        title: (mode === 'drop' ? 'Harder material on ' : 'Re-sourced reading on ') + u,
        url: 'https://example.org/' + mode + '/' + old.number + '/' + i,
        sourceType: i === 0 ? 'preferred' : 'off-list',
        estimatedDuration: Math.round(old.estimatedTime / 3),
        paid: false,
        verification: { status: 'verified-by-content', checkedAt: new Date().toISOString() },
      }
    })
    return {
      number: old.number,
      title: mode === 'drop' ? 'Advancing past: ' + old.title : 'Re-planned: ' + old.title,
      artifactOneLiner: mode === 'drop'
        ? 'A harder artifact that assumes ' + units.join(', ') + ' — ' + old.artifactOneLiner
        : 'Re-planned against the current target — ' + old.artifactOneLiner,
      materials: mats,
      selfCheck: mode === 'drop'
        ? 'Can I do the harder version without re-reading the basics? ' + old.selfCheck
        : old.selfCheck,
      estimatedTime: old.estimatedTime,
      highFrequencyUnits: units,
      encodingHook: old.encodingHook,
      consolidation: old.consolidation,
    }
  }
  function summarise(known, sess) {
    var text = (known || '').trim()
    if (!text) return 'Comfortable with ' + sess.highFrequencyUnits.join(', ') + '.'
    var first = text.split(/(?<=[.!?])\s/)[0]
    return first.charAt(0).toUpperCase() + first.slice(1).replace(/[.!?]?$/, '.')
  }

  // --- refusals at request stage (mirrors applyCuration's checks) ---
  function refuseAtRequest(req) {
    var reasons = []
    var sess = session(req.sessionNumber)
    if (!sess) return ['session ' + req.sessionNumber + ' not found']
    var inflight = inflightFor(req.sessionNumber)
    if (req.intent !== 'swap-material' && inflight.length) {
      reasons.push('session ' + req.sessionNumber + ' already has a curation in flight')
    }
    if (req.intent === 'swap-material' && inflight.some(function (e) { return e.request.intent !== 'swap-material' })) {
      reasons.push('session ' + req.sessionNumber + ' is being replaced; swap a material of the replacement instead')
    }
    if (req.intent === 'drop-as-known' && isConsolidation(req.sessionNumber)) {
      reasons.push('session ' + req.sessionNumber + ' is a consolidation slot (sessions 6 and 11 are catch-up and spaced-review slots); a review slot holds nothing to already know — use redo instead')
    }
    if (req.intent === 'swap-material') {
      var count = sess.materials.filter(function (m) { return m.url === req.materialUrl }).length
      if (count === 0) reasons.push('material ' + req.materialUrl + ' not found in session ' + req.sessionNumber)
      if (count > 1) reasons.push('material appears ' + count + ' times in session ' + req.sessionNumber)
      if (inflightForMaterial(req.sessionNumber, req.materialUrl)) reasons.push('that material already has a swap in flight')
      if (req.by.url !== undefined && !/^https?:\/\/\S+$/.test(req.by.url)) reasons.push('"' + req.by.url + '" is not a URL')
      if (req.by.reason !== undefined && !req.by.reason.trim()) reasons.push('a reason is required')
    }
    return reasons
  }

  function submit(req) {
    req.at = new Date().toISOString()
    var reasons = refuseAtRequest(req)
    if (reasons.length) {
      var refusal = { id: nextId++, request: req, stage: 'request', reasons: reasons }
      state.refused.push(refusal)
      emit(req.sessionNumber)
      return refusal
    }
    var entry = { id: nextId++, request: req, stage: 'sourcing' }
    state.inflight.push(entry)
    emit(req.sessionNumber)
    setTimeout(function () {
      entry.stage = 'verifying'
      emit(req.sessionNumber)
      setTimeout(function () { finish(entry) }, VERIFYING_MS)
    }, SOURCING_MS)
    return entry
  }

  function finish(entry) {
    state.inflight.splice(state.inflight.indexOf(entry), 1)
    var req = entry.request
    var sess = session(req.sessionNumber)
    // A learner-supplied URL that "404s" is a refusal after verification.
    if (req.intent === 'swap-material' && req.by.url && /404|dead|broken/i.test(req.by.url)) {
      state.refused.push({ id: entry.id, request: req, stage: 'verification',
        reasons: [req.by.url + ' could not be verified: 404 Not Found'] })
      emit(req.sessionNumber)
      return
    }
    var record = { intent: req.intent, sessionNumber: req.sessionNumber, at: req.at }
    if (req.intent === 'drop-as-known') {
      var next = fakeSession(sess, 'drop')
      record.known = req.known
      record.knownSummary = req.knownSummary
      record.replacedSession = sess
      state.plan.sessions[state.plan.sessions.indexOf(sess)] = next
      state.plan.meta.currentLevel += '\n\nAlready known: ' + req.knownSummary
    } else if (req.intent === 'redo-session') {
      var redone = fakeSession(sess, 'redo')
      if (req.reason) record.reason = req.reason
      record.replacedSession = sess
      state.plan.sessions[state.plan.sessions.indexOf(sess)] = redone
    } else {
      var idx = sess.materials.map(function (m) { return m.url }).indexOf(req.materialUrl)
      var old = sess.materials[idx]
      var replacement = fakeMaterial(old, req.by, budgetFor(sess, old.url))
      if (req.by.reason) record.reason = req.by.reason
      if (req.by.url) record.suppliedUrl = req.by.url
      record.replacedMaterial = old
      record._replacementUrl = replacement.url
      sess.materials[idx] = replacement
    }
    state.log.push(record)
    emit(req.sessionNumber)
  }

  function dismissRefusal(id) {
    state.refused = state.refused.filter(function (r) { return r.id !== Number(id) })
    emit()
  }

  // Request builders the variants call.
  var actions = {
    drop: function (n, known) {
      var sess = session(n)
      return submit({ intent: 'drop-as-known', sessionNumber: Number(n), known: known, knownSummary: summarise(known, sess) })
    },
    swapByReason: function (n, url, reason) {
      return submit({ intent: 'swap-material', sessionNumber: Number(n), materialUrl: url, by: { reason: reason } })
    },
    swapByUrl: function (n, url, newUrl) {
      return submit({ intent: 'swap-material', sessionNumber: Number(n), materialUrl: url, by: { url: newUrl } })
    },
    redo: function (n, reason) {
      return submit({ intent: 'redo-session', sessionNumber: Number(n), reason: reason || undefined })
    },
  }

  // ------------------------------------------------------------------
  // Base session markup (a port of renderer.ts's renderSession with hooks)
  // ------------------------------------------------------------------
  function baseSession(sess, hooks) {
    hooks = hooks || {}
    var n = esc(sess.number)
    var detailId = 'session-detail-' + n
    var mats = sess.materials.map(function (m, i) {
      var extra = hooks.material ? hooks.material(m, i) : {}
      return (
        '<li class="material' + (extra.cls ? ' ' + extra.cls : '') + '" data-url="' + esc(m.url) + '">' +
        (extra.replace || (
          '<div class="material-title"><a class="material-link" href="' + esc(m.url) + '" target="_blank" rel="noopener">' + esc(m.title) + '</a></div>' +
          '<span class="duration material-duration">' + esc(m.estimatedDuration) + ' min</span>' +
          (m.paid ? '<span class="material-paid">Paid — $' + esc(m.price || 0) + '</span>' : '') +
          (extra.cell || '')
        )) +
        (extra.below || '') +
        '</li>'
      )
    }).join('')
    var tags = (sess.consolidation ? '<span class="tag consolidation session-consolidation">Consolidation</span>' : '') + (hooks.tags || '')
    return (
      '<section class="session' + (hooks.cls ? ' ' + hooks.cls : '') + '" data-session="' + n + '"' + (sess.consolidation ? ' data-consolidation="true"' : '') + '>' +
      (hooks.before || '') +
      '<div class="session-summary" role="button" tabindex="0" aria-expanded="false" aria-controls="' + detailId + '">' +
      '<input class="session-check" type="checkbox" data-session="' + n + '" aria-label="Mark session ' + n + ' complete">' +
      '<span class="session-number">' + n + '</span>' +
      '<span class="session-title">' + esc(sess.title) + '</span>' +
      '<span class="session-artifact">' + esc(sess.artifactOneLiner) + '</span>' +
      '<span class="session-tags">' + tags + '</span>' +
      '</div>' +
      '<div class="session-detail" id="' + detailId + '" hidden>' +
      (hooks.detailTop || '') +
      '<div class="detail-block"><span class="detail-label">Materials</span><ul class="materials">' + mats + '</ul></div>' +
      (hooks.afterMaterials || '') +
      '<p class="session-units"><span class="session-units-label">Drills:</span> ' + sess.highFrequencyUnits.map(esc).join(', ') + '</p>' +
      (sess.encodingHook ? '<p class="session-hook"><span class="session-hook-label">Encoding hook:</span> ' + esc(sess.encodingHook) + '</p>' : '') +
      '<p class="self-check"><span class="self-check-label">Self-check</span>' + esc(sess.selfCheck) + '</p>' +
      (hooks.detailBottom || '') +
      '<label class="notes-label" for="notes-' + n + '">Notes<textarea class="notes-area" id="notes-' + n + '" data-session="' + n + '" placeholder="What worked, what did not, what to review."></textarea></label>' +
      '</div>' +
      (hooks.after || '') +
      '</section>'
    )
  }

  // Read-only rendering of an old (replaced) session, used by every variant.
  function oldSessionHtml(old) {
    return (
      '<div class="pc-old">' +
      '<div class="pc-old-title">' + esc(old.title) + '</div>' +
      '<div class="pc-old-artifact">→ ' + esc(old.artifactOneLiner) + '</div>' +
      '<ul class="pc-old-materials">' + old.materials.map(function (m) {
        return '<li><a href="' + esc(m.url) + '" target="_blank" rel="noopener">' + esc(m.title) + '</a> <span class="duration">' + esc(m.estimatedDuration) + ' min</span></li>'
      }).join('') + '</ul>' +
      '</div>'
    )
  }
  function chipsHtml(action, extraAttrs) {
    return REASON_CHIPS.map(function (r) {
      return '<button type="button" class="pc-chip" data-pc="' + action + '" data-reason="' + esc(r) + '" ' + (extraAttrs || '') + '>' + esc(r) + '</button>'
    }).join('')
  }
  function refusalHtml(refusal, cls) {
    return (
      '<div class="pc-refusal ' + (cls || '') + '" role="alert">' +
      '<span class="pc-refusal-label">Refused' + (refusal.stage === 'verification' ? ' after verification' : '') + '</span>' +
      '<ul>' + refusal.reasons.map(function (r) { return '<li>' + esc(r) + '</li>' }).join('') + '</ul>' +
      '<p class="pc-refusal-note">Nothing changed.</p>' +
      '<button type="button" class="pc-link" data-pc="dismiss" data-id="' + refusal.id + '">Dismiss</button>' +
      '</div>'
    )
  }
  function stageWord(stage) {
    return stage === 'sourcing' ? 'Sourcing a replacement…' : 'Verifying the replacement…'
  }

  // ------------------------------------------------------------------
  // DOM plumbing shared by the variants
  // ------------------------------------------------------------------
  var ui = { panel: null } // { kind, session, url }
  function panelIs(kind, n, url) {
    return ui.panel && ui.panel.kind === kind && ui.panel.session === Number(n) && (url === undefined || ui.panel.url === url)
  }
  function openPanel(kind, n, url) {
    var prev = ui.panel
    ui.panel = { kind: kind, session: Number(n), url: url }
    if (prev && prev.session !== Number(n)) renderOne(prev.session)
    renderOne(n)
    var sec = sectionOf(n)
    if (sec) setOpen(sec, true)
    var field = sec && sec.querySelector('.pc-panel textarea, .pc-panel input')
    if (field) field.focus()
  }
  function closePanel() {
    var prev = ui.panel
    ui.panel = null
    if (prev) renderOne(prev.session)
  }
  function sectionOf(n) {
    return document.querySelector('.session[data-session="' + n + '"]')
  }
  function setOpen(section, open) {
    var summary = section.querySelector('.session-summary')
    var detail = section.querySelector('.session-detail')
    summary.setAttribute('aria-expanded', open ? 'true' : 'false')
    detail.hidden = !open
  }
  function renderOne(n) {
    var sec = sectionOf(n)
    var sess = session(n)
    if (!sec || !sess) return
    var wasOpen = sec.querySelector('.session-summary').getAttribute('aria-expanded') === 'true'
    var notes = sec.querySelector('.notes-area')
    var notesValue = notes ? notes.value : ''
    var checked = sec.querySelector('.session-check').checked
    var tmp = document.createElement('div')
    tmp.innerHTML = current.sessionHtml(sess)
    var next = tmp.firstElementChild
    sec.parentNode.replaceChild(next, sec)
    setOpen(next, wasOpen)
    var nextNotes = next.querySelector('.notes-area')
    if (nextNotes) nextNotes.value = notesValue
    next.querySelector('.session-check').checked = checked
  }
  function renderAll() {
    state.plan.sessions.forEach(function (s) { renderOne(s.number) })
  }

  document.addEventListener('click', function (event) {
    var actionEl = event.target.closest('[data-pc]')
    if (actionEl) {
      event.preventDefault()
      var action = actionEl.getAttribute('data-pc')
      if (action === 'dismiss') { dismissRefusal(actionEl.getAttribute('data-id')); return }
      if (action === 'cancel') { closePanel(); return }
      current.onAction(action, actionEl, event)
      return
    }
    var summary = event.target.closest('.session-summary')
    if (summary && !event.target.closest('input, button, a, .pc-stop')) {
      var section = summary.closest('.session')
      setOpen(section, summary.getAttribute('aria-expanded') !== 'true')
    }
  })
  document.addEventListener('keydown', function (event) {
    var summary = event.target.closest && event.target.closest('.session-summary')
    if (summary && event.target === summary && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault()
      setOpen(summary.closest('.session'), summary.getAttribute('aria-expanded') !== 'true')
    }
  })
  // Keep the base page's progress indicator honest after re-rendering.
  document.addEventListener('change', function (event) {
    if (!event.target.classList.contains('session-check')) return
    var checks = document.querySelectorAll('.session-check')
    var done = document.querySelectorAll('.session-check:checked').length
    var ind = document.querySelector('.progress-indicator')
    if (ind) ind.textContent = done + ' of ' + checks.length + ' sessions complete'
    var fill = document.getElementById('progress-fill')
    if (fill) fill.style.width = (100 * done / checks.length) + '%'
  })

  function formValue(el, selector) {
    var form = el.closest('[data-pc-form]') || el.closest('.pc-panel') || el.closest('.pc-modal') || document
    var field = form.querySelector(selector)
    return field ? field.value.trim() : ''
  }
  function sessionNumberOf(el) {
    var attr = el.getAttribute('data-session')
    if (attr) return Number(attr)
    var sec = el.closest('.session')
    if (sec) return Number(sec.getAttribute('data-session'))
    var modal = el.closest('[data-session]')
    return modal ? Number(modal.getAttribute('data-session')) : NaN
  }
  function materialUrlOf(el) {
    var li = el.closest('[data-url]')
    return li ? li.getAttribute('data-url') : (ui.panel && ui.panel.url)
  }

  // ==================================================================
  // VARIANT A — Inline affordances: every action lives where its subject is
  // ==================================================================
  var VariantA = {
    key: 'A',
    name: 'Inline affordances',
    mount: function () {},
    unmount: function () {},
    sessionHtml: function (sess) {
      var n = sess.number
      var pending = inflightFor(n).filter(function (e) { return e.request.intent !== 'swap-material' })[0]
      var records = sessionRecordsFor(n)
      var refusals = refusedFor(n).filter(function (r) { return r.request.intent !== 'swap-material' })
      var tags = ''
      if (pending) tags += '<span class="tag pc-tag-pending"><span class="pc-dot"></span>' + (pending.stage === 'sourcing' ? 'Sourcing' : 'Verifying') + '</span>'
      else if (records.length) tags += '<span class="tag pc-tag-replaced">' + (records[records.length - 1].intent === 'drop-as-known' ? 'Replaced · known' : 'Re-planned') + '</span>'

      var detailTop = ''
      if (pending) {
        detailTop += '<div class="pc-a-pending"><span class="pc-dot"></span>' + stageWord(pending.stage) +
          ' <span class="pc-muted">This session stays as it is until the replacement is verified.</span></div>'
      }
      records.forEach(function (r) {
        detailTop += '<details class="pc-a-previous"><summary>' +
          (r.intent === 'drop-as-known' ? 'Previously (dropped as known ' + timeLabel(r.at) + ')' : 'Previously (re-planned ' + timeLabel(r.at) + ')') +
          ': ' + esc(r.replacedSession.title) + '</summary>' +
          (r.knownSummary ? '<p class="pc-muted">Added to your current level: <em>Already known: ' + esc(r.knownSummary) + '</em></p>' : '') +
          (r.reason ? '<p class="pc-muted">Reason: ' + esc(r.reason) + '</p>' : '') +
          oldSessionHtml(r.replacedSession) + '</details>'
      })
      refusals.forEach(function (r) { detailTop += refusalHtml(r) })

      var bottom = ''
      if (panelIs('drop', n)) {
        bottom = '<div class="pc-panel pc-a-panel" data-pc-form>' +
          '<div class="pc-panel-title">Drop session ' + n + ' as already known</div>' +
          '<p class="pc-muted">Say what you already know. It is added to your current level so later sessions and replacements stop re-teaching it.</p>' +
          '<textarea class="pc-textarea" rows="3">I already know: ' + esc(sess.highFrequencyUnits.join(', ')) + '</textarea>' +
          '<div class="pc-row"><button type="button" class="pc-btn pc-btn-primary" data-pc="a:drop:submit">Drop and replace</button><button type="button" class="pc-btn" data-pc="cancel">Cancel</button></div>' +
          '</div>'
      } else if (panelIs('redo', n)) {
        bottom = '<div class="pc-panel pc-a-panel" data-pc-form>' +
          '<div class="pc-panel-title">Re-plan session ' + n + '</div>' +
          '<input class="pc-input" type="text" placeholder="What is wrong with it? (optional)">' +
          '<div class="pc-row"><button type="button" class="pc-btn pc-btn-primary" data-pc="a:redo:submit">Re-plan</button><button type="button" class="pc-btn" data-pc="cancel">Cancel</button></div>' +
          '</div>'
      } else if (!pending) {
        bottom = '<div class="pc-a-actions">' +
          '<span class="detail-label">Curate</span>' +
          (sess.consolidation
            ? '<span class="pc-muted">Consolidation slots can\'t be dropped as known — </span>'
            : '<button type="button" class="pc-link" data-pc="a:drop">I already know this</button><span class="pc-sep">·</span>') +
          '<button type="button" class="pc-link" data-pc="a:redo">Re-plan this session</button>' +
          '</div>'
      }

      return baseSession(sess, {
        tags: tags,
        cls: pending ? 'pc-pending' : '',
        detailTop: detailTop,
        detailBottom: bottom,
        material: function (m) {
          var inflight = inflightForMaterial(n, m.url)
          if (inflight) {
            return { cls: 'pc-a-mat-pending', replace:
              '<div class="material-title pc-muted"><span class="pc-dot"></span>' + stageWord(inflight.stage) + '</div>' +
              '<span class="duration">was: ' + esc(m.title) + '</span>' }
          }
          var rec = materialRecordFor(n, m.url)
          var refusal = refusedFor(n).filter(function (r) { return r.request.intent === 'swap-material' && r.request.materialUrl === m.url })
          var below = ''
          if (rec) below += '<div class="pc-a-was">Replaced' + (rec.reason ? ' (' + esc(rec.reason) + ')' : rec.suppliedUrl ? ' with your link' : '') + ' · was: <span>' + esc(rec.replacedMaterial.title) + '</span></div>'
          refusal.forEach(function (r) { below += refusalHtml(r, 'pc-refusal-small') })
          if (panelIs('swap', n, m.url)) {
            below += '<div class="pc-panel pc-a-swap" data-pc-form>' +
              '<div class="pc-muted">Swap for one that does the same job, but is…</div>' +
              '<div class="pc-chips">' + chipsHtml('a:swap:reason') + '</div>' +
              '<div class="pc-row pc-a-urlrow"><input class="pc-input" type="url" placeholder="…or paste a URL you\'d rather use"><button type="button" class="pc-btn" data-pc="a:swap:url">Use it</button><button type="button" class="pc-btn" data-pc="cancel">Cancel</button></div>' +
              '</div>'
          }
          return { cell: '<button type="button" class="pc-link pc-a-swapbtn" data-pc="a:swap">Swap</button>', below: below }
        },
      })
    },
    onAction: function (action, el) {
      var n = sessionNumberOf(el)
      var result
      switch (action) {
        case 'a:drop': openPanel('drop', n); break
        case 'a:redo': openPanel('redo', n); break
        case 'a:swap': openPanel('swap', n, materialUrlOf(el)); break
        case 'a:drop:submit':
          result = actions.drop(n, formValue(el, 'textarea')); closePanel(); break
        case 'a:redo:submit':
          result = actions.redo(n, formValue(el, 'input')); closePanel(); break
        case 'a:swap:reason':
          result = actions.swapByReason(n, ui.panel.url, el.getAttribute('data-reason')); closePanel(); break
        case 'a:swap:url':
          var url = formValue(el, 'input')
          if (!url) return
          result = actions.swapByUrl(n, ui.panel.url, url); closePanel(); break
      }
      void result
    },
  }

  // ==================================================================
  // VARIANT B — One "Curate" menu per session, modal confirmations, and a
  // page-level curation history instead of showing the old session in place
  // ==================================================================
  var VariantB = {
    key: 'B',
    name: 'Session menu + history',
    mount: function () {
      var history = document.createElement('section')
      history.className = 'pc-b-history'
      history.id = 'pc-b-history'
      document.querySelector('main.page').appendChild(history)
      this.renderHistory()
      var modal = document.createElement('div')
      modal.id = 'pc-b-modal'
      document.body.appendChild(modal)
      this.modalRoot = modal
      this.picking = null
    },
    unmount: function () {
      var h = document.getElementById('pc-b-history'); if (h) h.remove()
      var m = document.getElementById('pc-b-modal'); if (m) m.remove()
    },
    afterRender: function () { this.renderHistory() },
    renderHistory: function () {
      var root = document.getElementById('pc-b-history')
      if (!root) return
      if (!state.log.length) { root.innerHTML = ''; return }
      root.innerHTML = '<div class="section-heading"><h2>Curation history</h2></div>' +
        '<p class="pc-muted">Every replacement, oldest first. The sessions above always show the current plan; the versions they replaced live here.</p>' +
        '<ol class="pc-b-records">' + state.log.map(function (r, i) {
          var what = r.intent === 'drop-as-known' ? 'dropped as known' : r.intent === 'redo-session' ? 're-planned' : 'material swapped'
          return '<li id="pc-b-record-' + i + '"><div class="pc-b-record-head"><strong>Session ' + r.sessionNumber + '</strong> ' + what + ' · ' + timeLabel(r.at) +
            (r.reason ? ' · ' + esc(r.reason) : '') + (r.suppliedUrl ? ' · your link' : '') + '</div>' +
            (r.knownSummary ? '<p class="pc-muted">Current level gained: <em>Already known: ' + esc(r.knownSummary) + '</em></p>' : '') +
            (r.replacedSession
              ? '<details><summary>Show the replaced session: ' + esc(r.replacedSession.title) + '</summary>' + oldSessionHtml(r.replacedSession) + '</details>'
              : '<div class="pc-muted">Was: <a href="' + esc(r.replacedMaterial.url) + '" target="_blank" rel="noopener">' + esc(r.replacedMaterial.title) + '</a> (' + esc(r.replacedMaterial.estimatedDuration) + ' min)</div>') +
            '</li>'
        }).join('') + '</ol>'
    },
    sessionHtml: function (sess) {
      var n = sess.number
      var pending = inflightFor(n)[0]
      var records = recordsFor(n)
      var refusals = refusedFor(n)
      var tags = ''
      if (records.length) {
        var idx = state.log.indexOf(records[records.length - 1])
        tags += '<a class="tag pc-tag-replaced pc-stop" href="#pc-b-record-' + idx + '">Revised ×' + records.length + '</a>'
      }
      tags += '<span class="pc-b-menuwrap pc-stop"><button type="button" class="tag pc-b-menubtn" data-pc="b:menu" aria-haspopup="menu" aria-expanded="' + (panelIs('menu', n) ? 'true' : 'false') + '">Curate ▾</button>' +
        (panelIs('menu', n)
          ? '<div class="pc-b-menu" role="menu">' +
            (sess.consolidation
              ? '<button type="button" class="pc-b-item" disabled title="Consolidation slots hold nothing to already know">Already know this</button>'
              : '<button type="button" class="pc-b-item" data-pc="b:drop">Already know this…</button>') +
            '<button type="button" class="pc-b-item" data-pc="b:pick">Swap a material…</button>' +
            '<button type="button" class="pc-b-item" data-pc="b:redo">Re-plan this session…</button>' +
            '</div>'
          : '') + '</span>'
      var before = ''
      if (pending) {
        var label = pending.request.intent === 'swap-material'
          ? 'Swapping "' + esc(sess.materials.filter(function (m) { return m.url === pending.request.materialUrl })[0].title) + '"'
          : pending.request.intent === 'drop-as-known' ? 'Dropping as known' : 'Re-planning'
        before = '<div class="pc-b-bar"><span class="pc-dot"></span>' + label + ' — ' + stageWord(pending.stage) + '</div>'
      }
      var detailTop = refusals.map(function (r) { return refusalHtml(r) }).join('')
      var picking = panelIs('pick', n)
      if (picking) detailTop += '<div class="pc-b-pickhint">Pick the material to swap. <button type="button" class="pc-link" data-pc="cancel">Cancel</button></div>'
      return baseSession(sess, {
        tags: tags,
        cls: pending ? 'pc-pending' : '',
        before: before,
        detailTop: detailTop,
        material: function (m) {
          if (picking) return { cls: 'pc-b-pickable', cell: '<button type="button" class="pc-btn pc-btn-small" data-pc="b:swap">Swap this</button>' }
          return {}
        },
      })
    },
    modal: function (html, n) {
      this.modalRoot.innerHTML = '<div class="pc-modal-backdrop" data-pc="b:close"></div><div class="pc-modal" role="dialog" aria-modal="true" data-session="' + n + '" data-pc-form>' + html + '</div>'
      var f = this.modalRoot.querySelector('textarea, input, select')
      if (f) f.focus()
    },
    closeModal: function () { this.modalRoot.innerHTML = '' },
    onAction: function (action, el) {
      var n = sessionNumberOf(el)
      var sess = session(n)
      var self = this
      switch (action) {
        case 'b:menu': panelIs('menu', n) ? closePanel() : openPanel('menu', n); break
        case 'b:close': this.closeModal(); break
        case 'b:drop':
          closePanel()
          this.modal('<h3>Drop session ' + n + ' as already known?</h3>' +
            '<p>“' + esc(sess.title) + '” will be replaced with a session that advances the target. Tell the plan what you already know so it stops re-teaching it:</p>' +
            '<textarea class="pc-textarea" rows="3" placeholder="e.g. ' + esc(sess.highFrequencyUnits.join(', ')) + '"></textarea>' +
            '<p class="pc-muted pc-b-preview">Your current level will gain a line starting <em>Already known: …</em></p>' +
            '<div class="pc-row"><button type="button" class="pc-btn pc-btn-primary" data-pc="b:drop:submit">Drop and replace</button><button type="button" class="pc-btn" data-pc="b:close">Cancel</button></div>', n)
          break
        case 'b:drop:submit':
          actions.drop(n, formValue(el, 'textarea')); this.closeModal(); break
        case 'b:redo':
          closePanel()
          this.modal('<h3>Re-plan session ' + n + '?</h3><p>“' + esc(sess.title) + '” will be re-planned against the plan as it now stands.</p>' +
            '<input class="pc-input" type="text" placeholder="What is wrong with it? (optional)">' +
            '<div class="pc-row"><button type="button" class="pc-btn pc-btn-primary" data-pc="b:redo:submit">Re-plan</button><button type="button" class="pc-btn" data-pc="b:close">Cancel</button></div>', n)
          break
        case 'b:redo:submit':
          actions.redo(n, formValue(el, 'input')); this.closeModal(); break
        case 'b:pick': openPanel('pick', n); break
        case 'b:swap':
          var url = materialUrlOf(el)
          var mat = sess.materials.filter(function (m) { return m.url === url })[0]
          closePanel()
          this.modal('<h3>Swap “' + esc(mat.title) + '”</h3>' +
            '<p>Session ' + n + ' keeps its other materials; the replacement must fit in the ' + budgetFor(sess, url) + ' min this one has.</p>' +
            '<input type="hidden" class="pc-b-url" value="' + esc(url) + '">' +
            '<label class="pc-label">Because it is… <select class="pc-select"><option value="">— choose a reason —</option>' + REASON_CHIPS.map(function (r) { return '<option>' + esc(r) + '</option>' }).join('') + '</select></label>' +
            '<div class="pc-or">or</div>' +
            '<label class="pc-label">Use this URL instead <input class="pc-input pc-b-newurl" type="url" placeholder="https://…"></label>' +
            '<div class="pc-row"><button type="button" class="pc-btn pc-btn-primary" data-pc="b:swap:submit">Find a replacement</button><button type="button" class="pc-btn" data-pc="b:close">Cancel</button></div>', n)
          break
        case 'b:swap:submit':
          var oldUrl = formValue(el, '.pc-b-url')
          var newUrl = formValue(el, '.pc-b-newurl')
          var reason = formValue(el, '.pc-select')
          var result = newUrl ? actions.swapByUrl(n, oldUrl, newUrl) : actions.swapByReason(n, oldUrl, reason)
          if (result.reasons) {
            var box = self.modalRoot.querySelector('.pc-modal')
            var old = box.querySelector('.pc-refusal'); if (old) old.remove()
            box.insertAdjacentHTML('beforeend', refusalHtml(result, 'pc-refusal-small'))
            state.refused = state.refused.filter(function (r) { return r.id !== result.id }) // shown in the modal, not the card
            renderOne(n)
          } else this.closeModal()
          break
      }
    },
  }

  // ==================================================================
  // VARIANT C — A page-level "Curate" mode: reading mode shows nothing,
  // curate mode shows a rail per session and a global request tray; the
  // session is untouched until applied, then shows a before/after comparison
  // ==================================================================
  var VariantC = {
    key: 'C',
    name: 'Curate mode + tray',
    curating: false,
    mount: function () {
      var btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'mode-button pc-c-toggle'
      btn.id = 'pc-c-toggle'
      btn.setAttribute('data-pc', 'c:toggle')
      document.querySelector('.masthead').appendChild(btn)
      var tray = document.createElement('aside')
      tray.id = 'pc-c-tray'
      tray.className = 'pc-c-tray'
      tray.setAttribute('aria-live', 'polite')
      document.body.appendChild(tray)
      this.applyMode()
    },
    unmount: function () {
      document.body.classList.remove('pc-c-curating')
      var b = document.getElementById('pc-c-toggle'); if (b) b.remove()
      var t = document.getElementById('pc-c-tray'); if (t) t.remove()
    },
    applyMode: function () {
      document.body.classList.toggle('pc-c-curating', this.curating)
      var btn = document.getElementById('pc-c-toggle')
      if (btn) btn.textContent = this.curating ? 'Done curating' : 'Curate'
      this.renderTray()
    },
    afterRender: function () { this.renderTray() },
    renderTray: function () {
      var tray = document.getElementById('pc-c-tray')
      if (!tray) return
      var items = state.inflight.map(function (e) { return { e: e, stage: e.stage } })
        .concat(state.refused.map(function (r) { return { e: r, stage: 'refused' } }))
        .concat(state.log.slice(-3).map(function (r) { return { e: { request: r, id: 'log' + state.log.indexOf(r) }, stage: 'applied' } }))
      if (!items.length) { tray.innerHTML = ''; tray.hidden = true; return }
      tray.hidden = false
      var steps = ['requested', 'sourcing', 'verifying', 'applied']
      tray.innerHTML = '<div class="pc-c-tray-title">Curation requests</div>' + items.map(function (it) {
        var r = it.e.request
        var sess = session(r.sessionNumber)
        var what = r.intent === 'drop-as-known' ? 'Drop as known' : r.intent === 'redo-session' ? 'Re-plan' : 'Swap material'
        var pos = it.stage === 'refused' ? -1 : steps.indexOf(it.stage)
        return '<div class="pc-c-item pc-c-' + it.stage + '"><div class="pc-c-item-head"><strong>' + what + '</strong> · session ' + r.sessionNumber + (sess ? ' — ' + esc(sess.title) : '') + '</div>' +
          '<div class="pc-c-steps">' + steps.map(function (s, i) {
            var cls = it.stage === 'refused' ? (i <= 1 ? 'done' : '') : i < pos ? 'done' : i === pos ? 'now' : ''
            return '<span class="pc-c-step ' + cls + '">' + s + '</span>'
          }).join('<span class="pc-c-arrow">›</span>') +
          (it.stage === 'refused' ? '<span class="pc-c-step refused">refused' + (it.e.stage === 'verification' ? ' (verification)' : ' (request)') + '</span>' : '') + '</div>' +
          (it.stage === 'refused' ? '<ul class="pc-c-reasons">' + it.e.reasons.map(function (x) { return '<li>' + esc(x) + '</li>' }).join('') + '</ul><button type="button" class="pc-link" data-pc="dismiss" data-id="' + it.e.id + '">Dismiss</button>' : '') +
          (it.stage === 'applied' ? '<div class="pc-muted"><a href="#session-detail-' + r.sessionNumber + '" data-pc="c:jump" data-session="' + r.sessionNumber + '">See the replacement</a></div>' : '') +
          '</div>'
      }).join('')
    },
    sessionHtml: function (sess) {
      var n = sess.number
      var pending = inflightFor(n)
      var records = sessionRecordsFor(n)
      var tags = ''
      if (pending.length) tags += '<span class="tag pc-tag-pending"><span class="pc-dot"></span>In the tray</span>'
      else if (records.length) tags += '<span class="tag pc-tag-replaced">Replaced</span>'
      var rail = '<div class="pc-c-rail pc-stop">' +
        (sess.consolidation
          ? '<button type="button" class="pc-c-railbtn" disabled title="Consolidation slots hold nothing to already know">✓</button>'
          : '<button type="button" class="pc-c-railbtn" data-pc="c:drop" title="I already know this">✓</button>') +
        '<button type="button" class="pc-c-railbtn" data-pc="c:redo" title="Re-plan this session">↻</button>' +
        '</div>'
      var detailTop = ''
      if (records.length) {
        var last = records[records.length - 1]
        detailTop += '<details class="pc-c-compare"' + (panelIs('compare', n) ? ' open' : '') + '><summary>Compare with the previous version (' +
          (last.intent === 'drop-as-known' ? 'dropped as known' : 're-planned') + ' ' + timeLabel(last.at) + ')</summary>' +
          '<div class="pc-c-cols"><div><div class="detail-label">Before</div>' + oldSessionHtml(last.replacedSession) + '</div>' +
          '<div><div class="detail-label">After</div>' + oldSessionHtml(sess) + '</div></div>' +
          (last.knownSummary ? '<p class="pc-muted">Current level gained: <em>Already known: ' + esc(last.knownSummary) + '</em></p>' : '') +
          '</details>'
      }
      if (panelIs('drop', n)) {
        detailTop += '<div class="pc-panel pc-c-panel" data-pc-form>' +
          '<div class="pc-panel-title">What do you already know from this session?</div>' +
          '<textarea class="pc-textarea" rows="3" placeholder="In your own words — e.g. ' + esc(sess.highFrequencyUnits.join(', ')) + '" data-pc-gate="c:drop:submit"></textarea>' +
          '<div class="pc-row"><button type="button" class="pc-btn pc-btn-primary" data-pc="c:drop:submit" disabled>Drop and replace</button><button type="button" class="pc-btn" data-pc="cancel">Cancel</button><span class="pc-muted">The button unlocks once you\'ve written it down; that text becomes part of your current level.</span></div>' +
          '</div>'
      } else if (panelIs('redo', n)) {
        detailTop += '<div class="pc-panel pc-c-panel" data-pc-form>' +
          '<div class="pc-row"><input class="pc-input" type="text" placeholder="What is wrong with this session? (optional)"><button type="button" class="pc-btn pc-btn-primary" data-pc="c:redo:submit">Re-plan</button><button type="button" class="pc-btn" data-pc="cancel">Cancel</button></div>' +
          '</div>'
      }
      return baseSession(sess, {
        tags: tags,
        before: rail,
        cls: pending.length ? 'pc-c-has-pending' : '',
        detailTop: detailTop,
        material: function (m) {
          var below = ''
          var rec = materialRecordFor(n, m.url)
          if (rec) below += '<div class="pc-a-was">Replaced · was: <span>' + esc(rec.replacedMaterial.title) + '</span></div>'
          if (panelIs('swap', n, m.url)) {
            below += '<div class="pc-panel pc-c-swap" data-pc-form>' +
              '<div class="pc-chips">' + chipsHtml('c:swap:reason') + '</div>' +
              '<div class="pc-row"><input class="pc-input" type="url" placeholder="or a URL of your own"><button type="button" class="pc-btn" data-pc="c:swap:url">Use it</button><button type="button" class="pc-btn" data-pc="cancel">Cancel</button></div>' +
              '</div>'
          }
          return { cell: '<button type="button" class="pc-c-matbtn pc-stop" data-pc="c:swap" title="Swap this material">⇄</button>', below: below }
        },
      })
    },
    onAction: function (action, el) {
      var n = sessionNumberOf(el)
      switch (action) {
        case 'c:toggle': this.curating = !this.curating; closePanel(); this.applyMode(); break
        case 'c:jump':
          var sec = sectionOf(n); if (sec) { setOpen(sec, true); sec.scrollIntoView({ behavior: 'smooth', block: 'start' }) }
          break
        case 'c:drop': openPanel('drop', n); break
        case 'c:redo': openPanel('redo', n); break
        case 'c:swap': openPanel('swap', n, materialUrlOf(el)); break
        case 'c:drop:submit': actions.drop(n, formValue(el, 'textarea')); closePanel(); break
        case 'c:redo:submit': actions.redo(n, formValue(el, 'input')); closePanel(); break
        case 'c:swap:reason': actions.swapByReason(n, ui.panel.url, el.getAttribute('data-reason')); closePanel(); break
        case 'c:swap:url':
          var url = formValue(el, 'input'); if (!url) return
          actions.swapByUrl(n, ui.panel.url, url); closePanel(); break
      }
    },
  }
  // Variant C's gated button: enable once the learner has written something.
  document.addEventListener('input', function (event) {
    var gate = event.target.getAttribute && event.target.getAttribute('data-pc-gate')
    if (!gate) return
    var btn = event.target.closest('[data-pc-form]').querySelector('[data-pc="' + gate + '"]')
    if (btn) btn.disabled = event.target.value.trim().length < 10
  })

  // ------------------------------------------------------------------
  // Switcher + state panel
  // ------------------------------------------------------------------
  var VARIANTS = [VariantA, VariantB, VariantC]
  var current = null
  function variantFromUrl() {
    var key = (new URLSearchParams(location.search).get('variant') || 'A').toUpperCase()
    return VARIANTS.filter(function (v) { return v.key === key })[0] || VariantA
  }
  function setVariant(v) {
    if (current) current.unmount()
    ui.panel = null
    current = v
    try {
      var url = new URL(location.href)
      url.searchParams.set('variant', v.key)
      history.replaceState(null, '', url.toString())
    } catch (e) { /* some browsers refuse replaceState on file:// — the bar still works */ }
    current.mount()
    renderAll()
    if (current.afterRender) current.afterRender()
    var label = document.getElementById('pc-switch-label')
    if (label) label.textContent = v.key + ' — ' + v.name
  }
  function cycle(delta) {
    var i = VARIANTS.indexOf(current)
    setVariant(VARIANTS[(i + delta + VARIANTS.length) % VARIANTS.length])
  }

  var bar = document.createElement('div')
  bar.id = 'pc-switcher'
  bar.innerHTML = '<button type="button" id="pc-prev" aria-label="Previous variant">◀</button>' +
    '<span id="pc-switch-label"></span>' +
    '<button type="button" id="pc-next" aria-label="Next variant">▶</button>' +
    '<button type="button" id="pc-state-toggle">state</button>' +
    '<span class="pc-switch-note">prototype · ←/→ to switch</span>'
  document.body.appendChild(bar)
  var statePanel = document.createElement('pre')
  statePanel.id = 'pc-state'
  statePanel.hidden = true
  document.body.appendChild(statePanel)
  function renderState() {
    if (statePanel.hidden) return
    var compact = {
      variant: current.key,
      currentLevel: state.plan.meta.currentLevel,
      inflight: state.inflight.map(function (e) { return { id: e.id, stage: e.stage, request: e.request } }),
      refused: state.refused.map(function (r) { return { id: r.id, stage: r.stage, reasons: r.reasons, intent: r.request.intent, session: r.request.sessionNumber } }),
      curationLog: state.log.map(function (r) {
        var c = {}
        Object.keys(r).forEach(function (k) {
          if (k === 'replacedSession') c[k] = '{ session ' + r[k].number + ': "' + r[k].title + '" }'
          else if (k === 'replacedMaterial') c[k] = '{ "' + r[k].title + '" }'
          else if (k[0] !== '_') c[k] = r[k]
        })
        return c
      }),
    }
    statePanel.textContent = JSON.stringify(compact, null, 2)
  }
  document.getElementById('pc-prev').addEventListener('click', function () { cycle(-1) })
  document.getElementById('pc-next').addEventListener('click', function () { cycle(1) })
  document.getElementById('pc-state-toggle').addEventListener('click', function () {
    statePanel.hidden = !statePanel.hidden
    renderState()
  })
  document.addEventListener('keydown', function (event) {
    if (event.target.closest && event.target.closest('input, textarea, select, [contenteditable]')) return
    if (event.key === 'ArrowLeft') cycle(-1)
    if (event.key === 'ArrowRight') cycle(1)
    if (event.key === 'Escape') { closePanel(); if (current === VariantB) VariantB.closeModal() }
  })

  listeners.push(function (n) {
    if (n === undefined) renderAll(); else renderOne(n)
    if (current.afterRender) current.afterRender()
    renderState()
  })

  setVariant(variantFromUrl())
})()
