import type { PlanData } from './plan-types'

export type ValidationError = string

function require_(errors: ValidationError[], value: unknown, message: string): void {
  if (!value) errors.push(message)
}

/**
 * Validate a plan document against all structural invariants.
 * Returns an array of errors, empty when the plan is valid.
 */
export function validatePlan(plan: PlanData): ValidationError[] {
  const errors: ValidationError[] = []

  require_(errors, plan.meta.subject, 'meta.subject is required')
  require_(errors, plan.meta.targetCapability, 'meta.targetCapability is required')
  require_(errors, plan.meta.currentLevel, 'meta.currentLevel is required')
  require_(errors, plan.meta.hoursPerDay, 'meta.hoursPerDay is required')
  require_(errors, plan.meta.generatedAt, 'meta.generatedAt is required')
  require_(errors, plan.stakes, 'stakes is required')
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
