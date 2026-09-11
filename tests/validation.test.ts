import type { PlanData } from '../src/plan-types'
import { validatePlan } from '../src/validation'
import { fixturePlan } from './fixtures/plan-fixture'

function clonePlan(plan: PlanData): PlanData {
  return JSON.parse(JSON.stringify(plan)) as PlanData
}

describe('validatePlan', () => {
  it('accepts the fixture plan with no violations', () => {
    expect(validatePlan(fixturePlan)).toEqual([])
  })

  it('rejects a plan missing required meta fields', () => {
    const plan = clonePlan(fixturePlan)
    // @ts-expect-error deliberately malformed for the test
    delete plan.meta.subject
    const errors = validatePlan(plan)
    expect(errors).toContain('meta.subject is required')
  })

  it('rejects a plan not containing exactly 14 sessions', () => {
    const plan = clonePlan(fixturePlan)
    plan.sessions = plan.sessions.slice(0, 13)
    const errors = validatePlan(plan)
    expect(errors.some((e) => e.includes('exactly 14 sessions'))).toBe(true)
  })

  it('rejects a plan with a duplicate session number', () => {
    const plan = clonePlan(fixturePlan)
    plan.sessions[1].number = plan.sessions[0].number
    const errors = validatePlan(plan)
    expect(errors.some((e) => e.includes('duplicate session number'))).toBe(true)
  })

  it('rejects a session with no free material to complete it', () => {
    const plan = clonePlan(fixturePlan)
    for (const m of plan.sessions[0].materials) m.paid = true
    const errors = validatePlan(plan)
    expect(errors.some((e) => e.includes('session 1 must have at least one free material'))).toBe(true)
  })

  it('rejects a plan with more than one paid item', () => {
    const plan = clonePlan(fixturePlan)
    plan.sessions[0].materials.push({
      title: 'Extra paid course',
      url: 'https://example.com/course',
      sourceType: 'off-list',
      estimatedDuration: 30,
      paid: true,
      price: 10,
      verification: { status: 'verified-by-status', checkedAt: '2026-01-05T09:00:00.000Z' },
    })
    const errors = validatePlan(plan)
    expect(errors.some((e) => e.includes('at most one paid material'))).toBe(true)
  })

  it('rejects an outlier story with no citation', () => {
    const plan = clonePlan(fixturePlan)
    // @ts-expect-error deliberately malformed for the test
    delete plan.phases[0].outlierStory!.citation
    const errors = validatePlan(plan)
    expect(errors).toContain('phase 0 outlierStory.citation is required (an outlier story without citation is not represented in the data at all)')
  })

  it('rejects an outlier story with a malformed citation URL', () => {
    const plan = clonePlan(fixturePlan)
    plan.phases[0].outlierStory!.citation = 'not-a-url'
    const errors = validatePlan(plan)
    expect(errors).toContain('phase 0 outlierStory.citation must be a valid http(s) URL')
  })

  it('rejects every missing outlier story field', () => {
    const plan = clonePlan(fixturePlan)
    const story = plan.phases[0].outlierStory!
    // @ts-expect-error deliberately malformed for the test
    delete story.person
    // @ts-expect-error deliberately malformed for the test
    delete story.approach
    // @ts-expect-error deliberately malformed for the test
    delete story.principle
    // @ts-expect-error deliberately malformed for the test
    delete story.citation
    const errors = validatePlan(plan)
    expect(errors).toContain('phase 0 outlierStory.person is required')
    expect(errors).toContain('phase 0 outlierStory.approach is required')
    expect(errors).toContain('phase 0 outlierStory.principle is required')
    expect(errors).toContain('phase 0 outlierStory.citation is required (an outlier story without citation is not represented in the data at all)')
  })

  it('rejects non-string outlier story fields', () => {
    const plan = clonePlan(fixturePlan)
    const story = plan.phases[0].outlierStory!
    // @ts-expect-error deliberately malformed for the test
    story.person = 42
    // @ts-expect-error deliberately malformed for the test
    story.approach = null
    // @ts-expect-error deliberately malformed for the test
    story.principle = {}
    story.citation = 'https://example.com'
    const errors = validatePlan(plan)
    expect(errors).toContain('phase 0 outlierStory.person must be a string')
    expect(errors).toContain('phase 0 outlierStory.approach must be a string')
    expect(errors).toContain('phase 0 outlierStory.principle must be a string')
  })

  it('reports every violation it finds, not just the first', () => {
    const plan = clonePlan(fixturePlan)
    // @ts-expect-error deliberately malformed for the test
    delete plan.meta.subject
    plan.sessions = plan.sessions.slice(0, 13)
    plan.sessions[1].number = plan.sessions[0].number
    const errors = validatePlan(plan)
    expect(errors.some((e) => e === 'meta.subject is required')).toBe(true)
    expect(errors.some((e) => e.includes('exactly 14 sessions'))).toBe(true)
    expect(errors.some((e) => e.includes('duplicate session number'))).toBe(true)
    expect(errors.length).toBeGreaterThanOrEqual(3)
  })

  it('rejects a session marked consolidation that is not at position 6 or 11', () => {
    const plan = clonePlan(fixturePlan)
    plan.sessions[2].consolidation = true
    const errors = validatePlan(plan)
    expect(errors.some((e) => e.includes('consolidation slots are reserved for sessions 6 and 11'))).toBe(true)
  })

  it('rejects a plan where session 6 or 11 is not marked consolidation', () => {
    const plan = clonePlan(fixturePlan)
    delete plan.sessions[5].consolidation
    const errors = validatePlan(plan)
    expect(errors.some((e) => e.includes('session 6 must be marked consolidation'))).toBe(true)
  })

  it('rejects a session whose estimatedTime exceeds the daily budget', () => {
    const plan = clonePlan(fixturePlan)
    plan.sessions[0].estimatedTime = plan.meta.hoursPerDay * 60 + 1
    const errors = validatePlan(plan)
    expect(errors.some((e) => e.includes('exceeds hoursPerDay budget'))).toBe(true)
  })
  it('accepts an empty stakes field, which the learner fills in on the page', () => {
    const plan = clonePlan(fixturePlan)
    plan.stakes = ''
    expect(validatePlan(plan)).toEqual([])
  })

  it('rejects a plan whose stakes field is missing entirely', () => {
    const plan = clonePlan(fixturePlan)
    // @ts-expect-error deliberately malformed for the test
    delete plan.stakes
    const errors = validatePlan(plan)
    expect(errors).toContain('stakes is required')
  })

  it('rejects a session that names no high-frequency units to drill', () => {
    const plan = clonePlan(fixturePlan)
    plan.sessions[0].highFrequencyUnits = []
    const errors = validatePlan(plan)
    expect(errors.some((e) => e.includes('session 1 must name at least one high-frequency unit'))).toBe(true)
  })

  it('accepts a plan with neither honestTarget nor scopeNote (targets do not diverge)', () => {
    const plan = clonePlan(fixturePlan)
    delete plan.meta.honestTarget
    delete plan.scopeNote
    expect(validatePlan(plan)).toEqual([])
  })

  it('rejects a reframed target that has no scope note (silent reframing)', () => {
    const plan = clonePlan(fixturePlan)
    delete plan.scopeNote
    const errors = validatePlan(plan)
    expect(errors).toContain(
      'scopeNote is required when meta.honestTarget is set: a reframed target must be stated at the top of the plan'
    )
  })

  it('rejects a scope note that names no reframed target', () => {
    const plan = clonePlan(fixturePlan)
    delete plan.meta.honestTarget
    const errors = validatePlan(plan)
    expect(errors).toContain(
      'meta.honestTarget is required when scopeNote is set: the scope note must name the reframed target'
    )
  })

  it('rejects an honest target identical to the stated target', () => {
    const plan = clonePlan(fixturePlan)
    plan.meta.honestTarget = plan.meta.targetCapability
    const errors = validatePlan(plan)
    expect(errors).toContain(
      'meta.honestTarget must differ from meta.targetCapability; omit both honestTarget and scopeNote when the stated target is already honest'
    )
  })

  it('rejects empty or whitespace-only scope honesty fields', () => {
    const plan = clonePlan(fixturePlan)
    plan.meta.honestTarget = ' '
    plan.scopeNote = ''
    const errors = validatePlan(plan)
    expect(errors).toContain(
      'meta.honestTarget and scopeNote must be omitted, not empty, when the stated target is already honest'
    )

    plan.meta.honestTarget = ''
    plan.scopeNote = ' '
    const secondErrors = validatePlan(plan)
    expect(secondErrors).toContain(
      'meta.honestTarget and scopeNote must be omitted, not empty, when the stated target is already honest'
    )

    plan.meta.honestTarget = ''
    plan.scopeNote = ''
    const emptyErrors = validatePlan(plan)
    expect(emptyErrors).toContain(
      'meta.honestTarget and scopeNote must be omitted, not empty, when the stated target is already honest'
    )
  })

  it('rejects a plan where no unit is repeated across sessions', () => {
    const plan = clonePlan(fixturePlan)
    plan.sessions.forEach((s, i) => {
      s.highFrequencyUnits = [`unit only used by session ${i + 1}`]
    })
    const errors = validatePlan(plan)
    expect(errors.some((e) => e.includes('no high-frequency unit is drilled in at least'))).toBe(true)
  })

  it('accepts a plan where a unit recurs across enough sessions', () => {
    expect(validatePlan(fixturePlan)).toEqual([])
  })

  it('accepts an off-list material — the durable tier is the default, not the only tier (issue 05)', () => {
    const plan = clonePlan(fixturePlan)
    plan.sessions[0].materials[0].sourceType = 'off-list'
    expect(validatePlan(plan)).toEqual([])
  })

  it('rejects a material whose sourceType is neither preferred nor off-list', () => {
    const plan = clonePlan(fixturePlan)
    // @ts-expect-error deliberately malformed for the test
    plan.sessions[0].materials[0].sourceType = 'unknown'
    const errors = validatePlan(plan)
    expect(errors.some((e) => e.includes("sourceType must be 'preferred' or 'off-list'"))).toBe(true)
  })

  it("rejects a session whose materials total more than the session's stated time", () => {
    const plan = clonePlan(fixturePlan)
    plan.sessions[0].estimatedTime = 10
    const errors = validatePlan(plan)
    expect(
      errors.some((e) => e.includes('session 1 materials total') && e.includes('exceeds'))
    ).toBe(true)
  })
})
