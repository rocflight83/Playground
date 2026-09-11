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
    expect(errors.some((e) => e.includes('outlierStory.citation is required'))).toBe(true)
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
})
