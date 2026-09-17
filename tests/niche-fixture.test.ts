import type { PlanData } from '../src/plan-types'
import { CONSOLIDATION_SLOTS } from '../src/plan-types'
import { validatePlan } from '../src/validation'
import type { FetchResponse, ReplacementCandidate } from '../src/verification'
import { verifyPlan } from '../src/verification'
import { nicheFixturePlan } from './fixtures/niche-plan-fixture'

function clonePlan(plan: PlanData): PlanData {
  return JSON.parse(JSON.stringify(plan)) as PlanData
}

function ok(text = 'placeholder body'): FetchResponse {
  return { ok: true, status: 200, text: async () => text }
}

function notFound(): FetchResponse {
  return { ok: false, status: 404, text: async () => '' }
}

const noReplacement: () => Promise<ReplacementCandidate | null> = async () => null
const fixedClock = () => '2026-02-01T00:00:00.000Z'

describe('issue 05: niche fixture exercises off-list admission', () => {
  it('is accepted by validation (the path ticket 04 forbade — off-list is now admitted)', () => {
    expect(validatePlan(nicheFixturePlan)).toEqual([])
  })

  it('carries both source tiers so the plan is genuinely mixed-tier rather than "all off-list"', () => {
    const all = nicheFixturePlan.sessions.flatMap((s) => s.materials)
    const sourceTypes = new Set(all.map((m) => m.sourceType))
    expect(sourceTypes.has('preferred')).toBe(true)
    expect(sourceTypes.has('off-list')).toBe(true)
  })

  it('carries at least one practitioner material (issue 12: the practitioner tier is first-class, and the niche fixture exercises it)', () => {
    const all = nicheFixturePlan.sessions.flatMap((s) => s.materials)
    expect(all.some((m) => m.sourceType === 'practitioner')).toBe(true)
  })

  it('passes the per-publisher cap (issue 12: no publisher dominates)', () => {
    expect(validatePlan(nicheFixturePlan)).toEqual([])
  })

  it('keeps the gate ticket 04 installed: at most one paid material and a free path through every session', () => {
    const all = nicheFixturePlan.sessions.flatMap((s) => s.materials)
    const paid = all.filter((m) => m.paid)
    expect(paid.length).toBeLessThanOrEqual(1)
    for (const session of nicheFixturePlan.sessions) {
      expect(session.materials.some((m) => !m.paid)).toBe(true)
    }
  })

  it('still pins consolidation to sessions 6 and 11', () => {
    const consolidations = nicheFixturePlan.sessions
      .filter((s) => s.consolidation)
      .map((s) => s.number)
    expect(consolidations.sort((a, b) => a - b)).toEqual(
      [...CONSOLIDATION_SLOTS].sort((a, b) => a - b)
    )
  })

  it('contains at least one preferred-tier anchor in the default-anchor selection, so the "anchors verified regardless of tier" rule actually has a preferred-tier case to exercise', () => {
    // The default-anchor set picks the longest materials. We bumped a
    // preferred-tier material's duration so the default selection includes
    // one — this test guards that property so a future fixture edit cannot
    // silently reduce the coverage.
    const all = nicheFixturePlan.sessions.flatMap((s) => s.materials)
    const longestByDuration = [...all].sort((a, b) => b.estimatedDuration - a.estimatedDuration).slice(0, 5)
    expect(longestByDuration.some((m) => m.sourceType === 'preferred')).toBe(true)
  })
})

describe('verifyPlan on the niche fixture', () => {
  it('admits off-list sources whose body covers the claimed concept, and rejects those whose body does not', async () => {
    // Each material's body repeats its own title so the body contains the
    // title's key words. The test asserts the observable contract: bodies
    // that cover the concept verify, bodies that do not fail.
    const materialByUrl = new Map(
      nicheFixturePlan.sessions.flatMap((s) => s.materials).map((m) => [m.url, m])
    )
    const failUrl = 'https://amazingribs.com/technique-and-setup/the-science-of-grilling-and-smoking/fire-management/'
    const fetchImpl = async (url: string): Promise<FetchResponse> => {
      if (url === failUrl) return ok('A page entirely about gardening; nothing about fire or meat.')
      const material = materialByUrl.get(url)
      const title = material?.title ?? 'concept'
      return ok(`${title}. ${title}. A deep treatment with practical examples and recipes.`)
    }
    const { plan, report } = await verifyPlan(nicheFixturePlan, {
      fetch: fetchImpl,
      searchReplacement: noReplacement,
      now: fixedClock,
    })

    // Every material except the gardening one should verify.
    for (const session of plan.sessions) {
      for (const material of session.materials) {
        if (material.url === failUrl) {
          expect(material.verification.status).toBe('unresolved-after-retries')
        } else {
          expect(material.verification.status).not.toBe('unresolved-after-retries')
        }
      }
    }
    expect(report.unresolvedCount).toBe(1)
  })

  it('treats a fetching exception as a verification failure, not a run abort', async () => {
    const fetchImpl = async (): Promise<FetchResponse> => {
      throw new Error('ENOTFOUND')
    }
    const { report } = await verifyPlan(nicheFixturePlan, {
      fetch: fetchImpl,
      searchReplacement: noReplacement,
      now: fixedClock,
    })
    expect(report.unresolvedCount).toBeGreaterThan(0)
  })
})
