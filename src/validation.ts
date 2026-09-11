import type { PlanData } from './plan-types.ts'
import {
  CONSOLIDATION_SLOTS,
  MIN_REPEATED_UNIT_SESSIONS,
  consolidationSlotsDescription,
} from './plan-types.ts'

export type ValidationError = string

function require_(errors: ValidationError[], value: unknown, message: string): void {
  if (!value) errors.push(message)
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
      // Sourcing is tiered: discovery prefers the durable tier, and off-list
      // sources are admitted only when they are genuinely the best available.
      // Verification — not the gate — enforces the off-list bar: a status-only
      // pass never suffices for one; the page has to be fetched and confirmed
      // to cover the claimed concept.
      if (material.sourceType !== 'preferred' && material.sourceType !== 'off-list') {
        errors.push(
          `session ${session.number} material sourceType must be 'preferred' or 'off-list', found '${material.sourceType}'`
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
      require_(
        errors,
        phase.outlierStory.citation,
        `phase ${i} outlierStory.citation is required (an outlier story without citation is not represented in the data at all)`
      )
    }
  }

  const allMaterials = sessions.flatMap((s) => s.materials ?? [])
  const paidMaterials = allMaterials.filter((m) => m.paid)
  if (paidMaterials.length > 1) {
    errors.push(`plan must have at most one paid material, found ${paidMaterials.length}`)
  }

  // CAFE repetition: the highest-frequency units must recur across sessions
  // rather than each session introducing disposable vocabulary.
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

  return errors
}
