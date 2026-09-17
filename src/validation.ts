import type { CurationIntent, Material, MeasurementBasis, PlanData, DeliverableField } from './plan-types.ts'
import {
  CONSOLIDATION_SLOTS,
  MAX_DELIVERABLE_FIELDS,
  MAX_URLS_PER_PUBLISHER,
  MIN_DELIVERABLE_FIELDS,
  MIN_REPEATED_UNIT_SESSIONS,
  consolidationSlotsDescription,
} from './plan-types.ts'
import { isForumHost, publisherKey } from './publisher.ts'

const KNOWN_CURATION_INTENTS: ReadonlySet<CurationIntent> = new Set([
  'drop-as-known',
  'swap-material',
  'redo-session',
])

export type ValidationError = string

function require_(errors: ValidationError[], value: unknown, message: string): void {
  if (!value) errors.push(message)
}

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/

/**
 * Reduce a material URL to the form the per-publisher cap counts as one
 * resource: lowercase scheme and host, fragment removed, trailing slash
 * removed, query kept (it distinguishes pages on some hosts).
 */
function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url)
    const host = parsed.hostname.toLowerCase()
    let path = parsed.pathname
    if (path.endsWith('/')) path = path.slice(0, -1)
    const query = parsed.search
    return `${parsed.protocol.toLowerCase()}//${host}${path}${query}`
  } catch {
    return url
  }
}

/**
 * Validate a plan document against all structural invariants.
 * Returns an array of errors, empty when the plan is valid.
 *
 * The input is typed `PlanData` for callers' convenience, but the values this
 * gate actually sees come from generated or hand-edited JSON. The runtime
 * `typeof` checks below are therefore load-bearing, not redundant with the
 * type: this is the boundary where untrusted data becomes trusted.
 */
export function validatePlan(plan: PlanData): ValidationError[] {
  const errors: ValidationError[] = []

  require_(errors, plan.meta.subject, 'meta.subject is required')
  require_(errors, plan.meta.targetCapability, 'meta.targetCapability is required')
  require_(errors, plan.meta.currentLevel, 'meta.currentLevel is required')
  require_(errors, plan.meta.hoursPerDay, 'meta.hoursPerDay is required')
  require_(errors, plan.meta.generatedAt, 'meta.generatedAt is required')
  // Scope honesty: a reframed target and the note explaining it travel
  // together. One without the other is either a silent reframe (sessions
  // aim at something the learner was never told about) or a note that names
  // nothing. Identical targets mean no divergence, so both must be omitted.
  if (plan.meta.honestTarget !== undefined && typeof plan.meta.honestTarget !== 'string') {
    errors.push('meta.honestTarget must be a string when present')
  }
  if (plan.scopeNote !== undefined && typeof plan.scopeNote !== 'string') {
    errors.push('scopeNote must be a string when present')
  }
  const statedTarget = typeof plan.meta.targetCapability === 'string' ? plan.meta.targetCapability.trim() : ''
  const honestTarget = typeof plan.meta.honestTarget === 'string' ? plan.meta.honestTarget.trim() : ''
  const scopeNote = typeof plan.scopeNote === 'string' ? plan.scopeNote.trim() : ''
  const hasEmptyScopeHonestyField =
    (plan.meta.honestTarget !== undefined && typeof plan.meta.honestTarget === 'string' && !honestTarget) ||
    (plan.scopeNote !== undefined && typeof plan.scopeNote === 'string' && !scopeNote)
  if (hasEmptyScopeHonestyField) {
    errors.push('meta.honestTarget and scopeNote must be omitted, not empty, when the stated target is already honest')
  }
  if (honestTarget && !scopeNote) {
    errors.push(
      'scopeNote is required when meta.honestTarget is set: a reframed target must be stated at the top of the plan'
    )
  }
  if (scopeNote && !honestTarget) {
    errors.push('meta.honestTarget is required when scopeNote is set: the scope note must name the reframed target')
  }
  if (honestTarget && honestTarget === statedTarget) {
    errors.push(
      'meta.honestTarget must differ from meta.targetCapability; omit both honestTarget and scopeNote when the stated target is already honest'
    )
  }
  // Stakes are the learner's to write, on the page, after generation. The
  // field must exist; it is empty at generation time by design.
  require_(errors, typeof plan.stakes === 'string', 'stakes is required')
  require_(errors, plan.phases?.length, 'phases is required and must not be empty')
  require_(errors, plan.sessions?.length, 'sessions is required and must not be empty')

  const sessions = plan.sessions ?? []
  const phases = plan.phases ?? []

  if (sessions.length !== 14) {
    errors.push(`plan must contain exactly 14 sessions, found ${sessions.length}`)
  }

  const sessionNumbers = sessions.map((s) => s.number)
  const seen = new Set<number>()
  for (const n of sessionNumbers) {
    if (n < 1 || n > 14) {
      errors.push(`session ${n} must be numbered 1-14 inclusive`)
    }
    if (seen.has(n)) {
      errors.push(`duplicate session number ${n}`)
    }
    seen.add(n)
  }

  for (const session of sessions) {
    require_(errors, session.title, `session ${session.number} title is required`)
    require_(errors, session.artifactOneLiner, `session ${session.number} artifactOneLiner is required`)
    require_(errors, session.selfCheck, `session ${session.number} selfCheck is required`)
    if (typeof session.estimatedTime !== 'number' || session.estimatedTime <= 0) {
      errors.push(`session ${session.number} estimatedTime must be a positive number of minutes`)
    } else {
      const dayMinutes = plan.meta.hoursPerDay * 60
      if (session.estimatedTime > dayMinutes) {
        errors.push(
          `session ${session.number} estimatedTime (${session.estimatedTime} min) exceeds hoursPerDay budget (${dayMinutes} min)`
        )
      }
    }
    if (!session.materials || session.materials.length === 0) {
      errors.push(`session ${session.number} must have at least one material`)
    } else {
      // The data model has no "required vs optional" distinction between a
      // session's materials, so "a free path to completion" is validated as
      // "at least one free material is present" — the strongest check the
      // model supports.
      const hasFree = session.materials.some((m) => !m.paid)
      if (!hasFree) {
        errors.push(`session ${session.number} must have at least one free material for completion`)
      }
    }
    for (const material of session.materials ?? []) {
      require_(errors, material.title, `session ${session.number} material title is required`)
      require_(errors, material.url, `session ${session.number} material url is required`)
      if (typeof material.estimatedDuration !== 'number' || material.estimatedDuration <= 0) {
        errors.push(`session ${session.number} material estimatedDuration must be a positive number`)
      }
      if (typeof material.paid !== 'boolean') errors.push(`session ${session.number} material paid must be a boolean`)
      if (material.paid && (typeof material.price !== 'number' || material.price <= 0)) {
        errors.push(`session ${session.number} paid material must have a positive price`)
      }
      require_(errors, material.verification, `session ${session.number} material verification is required`)
      // Sourcing is tiered: discovery prefers the durable tier (preferred),
      // reaches the practitioner tier deliberately, and admits off-list only
      // when genuinely the best available. Verification — not the gate —
      // enforces the off-list bar: a status-only pass never suffices for one;
      // the page has to be fetched and confirmed to cover the claimed concept.
      // The practitioner tier carries the same content-verification bar.
      if (
        material.sourceType !== 'preferred' &&
        material.sourceType !== 'practitioner' &&
        material.sourceType !== 'off-list'
      ) {
        errors.push(
          `session ${session.number} material sourceType must be 'preferred', 'practitioner', or 'off-list', found '${material.sourceType}'`
        )
      }
      // Forum tripwire: a forum thread cannot be admitted under the
      // practitioner tier. It is the named practitioner speaking in their own
      // voice that justifies the tier; a thread of replies is not. Such
      // resources are still admissible as off-list when genuinely the best.
      if (material.sourceType === 'practitioner' && isForumHost(material.url)) {
        errors.push(
          `session ${session.number} material '${material.title}' is a forum thread and cannot be practitioner-tier; use 'off-list' if it is genuinely the best source`
        )
      }
      // Duration measurement (issue 13): verification writes these when it
      // can measure consumption time. Hand-edited plans may set them too.
      // Both-or-neither; the renderer and the report both read them as a
      // pair, so a partial record would render an orphan. Value errors are
      // reported first so the pair error only fires on a structurally valid
      // half-record — that way the message is the right one to act on.
      const measuredDuration = material.verification.measuredDuration
      const measuredBy = material.verification.measuredBy
      const hasDuration = measuredDuration !== undefined
      const hasBasis = measuredBy !== undefined
      let durationOk = true
      let basisOk = true
      if (hasDuration) {
        if (typeof measuredDuration !== 'number' || measuredDuration <= 0) {
          errors.push(
            `session ${session.number} material measuredDuration must be a positive number when present`
          )
          durationOk = false
        }
      }
      if (hasBasis) {
        const allowed: MeasurementBasis[] = ['video-metadata', 'stated-read-time', 'word-count']
        if (typeof measuredBy !== 'string' || !allowed.includes(measuredBy as MeasurementBasis)) {
          errors.push(
            `session ${session.number} material measuredBy must be 'video-metadata', 'stated-read-time' or 'word-count' when present`
          )
          basisOk = false
        }
      }
      if ((hasDuration || hasBasis) && hasDuration !== hasBasis && durationOk && basisOk) {
        errors.push(
          `session ${session.number} material measuredDuration and measuredBy must be set together`
        )
      }
    }

    // CAFE compression: a session's materials must fit the artifact's time
    // budget, not merely be declared to. Without this, estimatedTime is a
    // claim rather than a constraint.
    const materialMinutes = (session.materials ?? []).reduce(
      (total, m) => total + (typeof m.estimatedDuration === 'number' ? m.estimatedDuration : 0),
      0
    )
    if (typeof session.estimatedTime === 'number' && materialMinutes > session.estimatedTime) {
      errors.push(
        `session ${session.number} materials total ${materialMinutes} min, which exceeds its estimatedTime of ${session.estimatedTime} min`
      )
    }

    // CAFE repetition: every session names the minimal effective units it
    // drills, so the plan-wide recurrence check below has something to see.
    if (!session.highFrequencyUnits || session.highFrequencyUnits.length === 0) {
      errors.push(`session ${session.number} must name at least one high-frequency unit it drills`)
    }
    if (session.consolidation && !CONSOLIDATION_SLOTS.has(session.number)) {
      errors.push(
        `session ${session.number} is marked consolidation but consolidation slots are reserved for sessions ${consolidationSlotsDescription()}`
      )
    }
    if (CONSOLIDATION_SLOTS.has(session.number) && !session.consolidation) {
      errors.push(`session ${session.number} must be marked consolidation`)
    }

    // Deliverable template (issue 14). The template is optional: a session
    // without one (an artifact built rather than written) produces no
    // template errors. When present, every structural violation is reported
    // separately so the message the skill acts on is the right one.
    const template = session.deliverableTemplate
    if (template !== undefined) {
      validateDeliverableTemplate(template, session.number, errors)
    }
  }

  for (let i = 0; i < phases.length; i++) {
    const phase = phases[i]
    require_(errors, phase.title, `phase ${i} title is required`)
    if (!phase.sessions || phase.sessions.length === 0) {
      errors.push(`phase ${i} must have at least one session`)
    }
    for (const num of phase.sessions ?? []) {
      if (!sessionNumbers.includes(num)) {
        errors.push(`phase ${i} references unknown session ${num}`)
      }
    }
    if (phase.outlierStory) {
      require_(errors, phase.outlierStory.person, `phase ${i} outlierStory.person is required`)
      require_(errors, phase.outlierStory.approach, `phase ${i} outlierStory.approach is required`)
      require_(errors, phase.outlierStory.principle, `phase ${i} outlierStory.principle is required`)
      require_(errors, phase.outlierStory.citation, `phase ${i} outlierStory.citation is required (an outlier story without citation is not represented in the data at all)`)
      if (typeof phase.outlierStory.person !== 'string') {
        errors.push(`phase ${i} outlierStory.person must be a string`)
      }
      if (typeof phase.outlierStory.approach !== 'string') {
        errors.push(`phase ${i} outlierStory.approach must be a string`)
      }
      if (typeof phase.outlierStory.principle !== 'string') {
        errors.push(`phase ${i} outlierStory.principle must be a string`)
      }
      if (typeof phase.outlierStory.citation !== 'string') {
        errors.push(`phase ${i} outlierStory.citation must be a string`)
      }
      if (typeof phase.outlierStory.citation === 'string') {
        const citation = phase.outlierStory.citation.trim()
        if (!citation) {
          errors.push(`phase ${i} outlierStory.citation must be a valid http(s) URL`)
        } else {
          try {
            const url = new URL(citation)
            if (!['http:', 'https:'].includes(url.protocol)) {
              errors.push(`phase ${i} outlierStory.citation must be a valid http(s) URL`)
            }
          } catch {
            errors.push(`phase ${i} outlierStory.citation must be a valid http(s) URL`)
          }
        }
      }
    }
  }

  const allMaterials = sessions.flatMap((s) => s.materials ?? [])
  const paidMaterials = allMaterials.filter((m) => m.paid)
  if (paidMaterials.length > 1) {
    errors.push(`plan must have at most one paid material, found ${paidMaterials.length}`)
  }

  // Per-publisher cap: at most MAX_URLS_PER_PUBLISHER distinct URLs from any
  // one publisher across the whole plan. The publisher is the registrable
  // domain (see `publisherKey`); video hosts whose URL does not name the
  // channel return null and are skipped. Distinct URLs are compared after
  // normalization (lowercase scheme + host, no fragment, no trailing slash,
  // query kept) so a page reused for spaced review in a later session does
  // not eat the publisher's budget. Outlier-story citations are phase-level
  // metadata, not materials, and are not counted.
  const publisherCounts = new Map<string, { distinctUrls: Set<string>; sessions: Set<number> }>()
  for (const material of allMaterials) {
    const key = publisherKey(material.url)
    if (key === null) continue
    const sessionNumber = sessions.find((s) => s.materials.includes(material as Material))?.number
    if (sessionNumber === undefined) continue
    const normalized = normalizeUrl(material.url)
    const entry = publisherCounts.get(key) ?? { distinctUrls: new Set(), sessions: new Set() }
    entry.distinctUrls.add(normalized)
    entry.sessions.add(sessionNumber)
    publisherCounts.set(key, entry)
  }
  const sortedKeys = [...publisherCounts.keys()].sort()
  for (const key of sortedKeys) {
    const { distinctUrls, sessions: sessionNumbers } = publisherCounts.get(key)!
    if (distinctUrls.size > MAX_URLS_PER_PUBLISHER) {
      const sessionList = [...sessionNumbers].sort((a, b) => a - b).join(', ')
      errors.push(
        `plan draws ${distinctUrls.size} distinct URLs from publisher '${key}' (sessions ${sessionList}); at most ${MAX_URLS_PER_PUBLISHER} per plan are allowed`
      )
    }
  }

  const sessionsPerUnit = new Map<string, number>()
  for (const session of sessions) {
    for (const unit of new Set(session.highFrequencyUnits ?? [])) {
      sessionsPerUnit.set(unit, (sessionsPerUnit.get(unit) ?? 0) + 1)
    }
  }
  const repeated = [...sessionsPerUnit.values()].some((count) => count >= MIN_REPEATED_UNIT_SESSIONS)
  if (sessionsPerUnit.size > 0 && !repeated) {
    errors.push(
      `no high-frequency unit is drilled in at least ${MIN_REPEATED_UNIT_SESSIONS} sessions; CAFE requires the highest-frequency units to repeat across the plan`
    )
  }

  if (!plan.disssPreamble) {
    errors.push('disssPreamble is required')
  } else {
    require_(errors, plan.disssPreamble.deconstruction, 'disssPreamble.deconstruction is required')
    require_(errors, plan.disssPreamble.selectionRationale, 'disssPreamble.selectionRationale is required')
    require_(errors, plan.disssPreamble.cutList, 'disssPreamble.cutList is required')
    require_(errors, plan.disssPreamble.sequencingRationale, 'disssPreamble.sequencingRationale is required')
  }

  // Curation log (issue 15). The field is optional and absent / empty is
  // valid; an applied curation always appends one record carrying what was
  // replaced, so the shape of every record is constrained by the model. The
  // renderer ignores this field, so a structurally-valid log never affects
  // the page; the check exists to catch hand-edited or partially-applied
  // records before they sneak into a future undo.
  if (plan.curationLog !== undefined) {
    validateCurationLog(plan.curationLog, errors)
  }

  return errors
}

/**
 * Push every structural violation of `curationLog` into `errors`. Each
 * invalid record produces an error naming its index, so a plan with several
 * bad records sees all of them reported at once.
 */
function validateCurationLog(log: unknown, errors: ValidationError[]): void {
  if (!Array.isArray(log)) {
    errors.push('curationLog must be an array')
    return
  }
  for (let i = 0; i < log.length; i++) {
    const record = log[i]
    if (!record || typeof record !== 'object') {
      errors.push(`curationLog[${i}] must be an object`)
      continue
    }
    const r = record as { intent?: unknown; sessionNumber?: unknown; at?: unknown; replacedSession?: unknown; replacedMaterial?: unknown }
    if (typeof r.intent !== 'string' || !KNOWN_CURATION_INTENTS.has(r.intent as CurationIntent)) {
      errors.push(`curationLog[${i}] intent must be 'drop-as-known', 'swap-material' or 'redo-session'`)
      continue
    }
    const intent = r.intent as CurationIntent
    if (typeof r.sessionNumber !== 'number' || r.sessionNumber < 1 || r.sessionNumber > 14) {
      errors.push(`curationLog[${i}] sessionNumber must be an integer in 1-14`)
      continue
    }
    if (typeof r.at !== 'string' || r.at === '') {
      errors.push(`curationLog[${i}] at is required and must be a non-empty ISO timestamp`)
      continue
    }
    const hasSession = r.replacedSession !== undefined
    const hasMaterial = r.replacedMaterial !== undefined
    if (hasSession === hasMaterial) {
      errors.push(`curationLog[${i}] must carry exactly one of replacedSession or replacedMaterial`)
      continue
    }
    // swap-material carries the swapped-out material; the other two carry the
    // replaced session. A kind mismatch here means a hand-edit (or a future
    // bug) put the wrong slot on the record.
    if (intent === 'swap-material' && hasSession) {
      errors.push(`curationLog[${i}] intent 'swap-material' must carry replacedMaterial`)
      continue
    }
    if (intent !== 'swap-material' && hasMaterial) {
      errors.push(`curationLog[${i}] intent '${intent}' must carry replacedSession`)
      continue
    }
  }
}

/**
 * Push every structural violation of a session's deliverable template into
 * `errors`. The set of fields, id slugs, labels, prompts and kinds are
 * checked so the skill gets all the messages it needs to fix in one pass
 * rather than one per round.
 *
 * The errors are produced for `session N` with i being the zero-based index
 * in the template's fields array. The bounds error is produced once. The
 * uniqueness error is produced once even if multiple ids collide.
 */
function validateDeliverableTemplate(
  template: unknown,
  sessionNumber: number,
  errors: ValidationError[]
): void {
  const prefix = `session ${sessionNumber} deliverableTemplate`
  const fields = (template as { fields: unknown } | null | undefined)?.fields
  if (!Array.isArray(fields)) {
    errors.push(`${prefix}.fields must be an array of ${MIN_DELIVERABLE_FIELDS} to ${MAX_DELIVERABLE_FIELDS} fields`)
    return
  }
  if (fields.length < MIN_DELIVERABLE_FIELDS || fields.length > MAX_DELIVERABLE_FIELDS) {
    errors.push(`${prefix}.fields must be an array of ${MIN_DELIVERABLE_FIELDS} to ${MAX_DELIVERABLE_FIELDS} fields`)
  }
  const seenIds = new Set<string>()
  let duplicateIds = false
  for (let i = 0; i < fields.length; i++) {
    const field = fields[i] as Partial<DeliverableField> | null | undefined
    if (!field || typeof field !== 'object') {
      errors.push(`${prefix} field ${i} must be an object`)
      continue
    }
    if (typeof field.id !== 'string' || !SLUG_RE.test(field.id)) {
      errors.push(`${prefix} field ${i} id must be a slug`)
    } else if (seenIds.has(field.id)) {
      duplicateIds = true
    } else {
      seenIds.add(field.id)
    }
    if (typeof field.label !== 'string' || !field.label) {
      errors.push(`${prefix} field ${i} label is required`)
    }
    if (typeof field.prompt !== 'string' || !field.prompt) {
      errors.push(`${prefix} field ${i} prompt is required`)
    }
    if (field.kind !== 'line' && field.kind !== 'paragraph') {
      errors.push(`${prefix} field ${i} kind must be 'line' or 'paragraph'`)
    }
  }
  if (duplicateIds) {
    errors.push(`${prefix} field ids must be unique`)
  }
}
