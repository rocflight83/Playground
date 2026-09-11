import type { PlanData } from '../src/plan-types'
import type { FetchResponse, ReplacementCandidate } from '../src/verification'
import { verifyPlan } from '../src/verification'
import { fixturePlan } from './fixtures/plan-fixture'

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

describe('verifyPlan', () => {
  it('status-checks every URL in the plan', async () => {
    const seen: string[] = []
    const fetchImpl = async (url: string): Promise<FetchResponse> => {
      seen.push(url)
      return ok()
    }
    await verifyPlan(fixturePlan, { fetch: fetchImpl, searchReplacement: noReplacement, now: fixedClock })
    const expectedUrls = fixturePlan.sessions.flatMap((s) => s.materials.map((m) => m.url))
    expect(seen.sort()).toEqual(expectedUrls.sort())
  })

  it('marks an all-healthy preferred-tier link as verified-by-status with a fresh timestamp', async () => {
    const plan = clonePlan(fixturePlan)
    plan.sessions = [plan.sessions[0]]
    plan.sessions[0].materials = [plan.sessions[0].materials[0]]
    plan.sessions[0].materials[0].sourceType = 'preferred'

    const { plan: result } = await verifyPlan(plan, {
      fetch: async () => ok(),
      searchReplacement: noReplacement,
      anchorUrls: [],
      now: fixedClock,
    })

    expect(result.sessions[0].materials[0].verification).toEqual({
      status: 'verified-by-status',
      checkedAt: fixedClock(),
    })
  })

  it('requires content confirmation for an off-list source; a status-only pass is insufficient', async () => {
    const plan = clonePlan(fixturePlan)
    plan.sessions = [plan.sessions[0]]
    plan.sessions[0].materials = [plan.sessions[0].materials[0]]
    plan.sessions[0].materials[0].sourceType = 'off-list'
    plan.sessions[0].materials[0].title = 'Argparse Guide'

    const { plan: passing } = await verifyPlan(plan, {
      fetch: async () => ok('A guide to using argparse for command-line tools.'),
      searchReplacement: noReplacement,
      now: fixedClock,
    })
    expect(passing.sessions[0].materials[0].verification.status).toBe('verified-by-content')

    const { plan: failing, report } = await verifyPlan(plan, {
      fetch: async () => ok('This page is about gardening and has nothing to do with the topic.'),
      searchReplacement: noReplacement,
      now: fixedClock,
    })
    expect(failing.sessions[0].materials[0].verification.status).toBe('unresolved-after-retries')
    expect(report.unresolvedCount).toBe(1)
  })

  it('content-verifies an anchor resource regardless of its tier', async () => {
    const plan = clonePlan(fixturePlan)
    plan.sessions = [plan.sessions[0]]
    plan.sessions[0].materials = [plan.sessions[0].materials[0]]
    const anchor = plan.sessions[0].materials[0]
    anchor.sourceType = 'preferred'
    anchor.title = 'Argparse Guide'

    const { plan: result } = await verifyPlan(plan, {
      fetch: async () => ok('Nothing here about the claimed concept at all.'),
      searchReplacement: noReplacement,
      anchorUrls: [anchor.url],
      now: fixedClock,
    })

    expect(result.sessions[0].materials[0].verification.status).toBe('unresolved-after-retries')
  })

  it('defaults anchor selection to the materials with the greatest time investment when none is supplied', async () => {
    const plan = clonePlan(fixturePlan)
    const base = plan.sessions[0].materials[0]
    const durations = [100, 90, 80, 70, 60, 10]
    plan.sessions = [
      {
        ...plan.sessions[0],
        materials: durations.map((estimatedDuration, i) => ({
          ...base,
          url: `https://example.com/material-${i}`,
          sourceType: 'preferred' as const,
          estimatedDuration,
        })),
      },
    ]

    const { plan: result } = await verifyPlan(plan, {
      // Fails content confirmation but passes a bare status check, so the
      // outcome reveals whether content-checking was actually attempted.
      fetch: async () => ok('completely unrelated content'),
      searchReplacement: noReplacement,
      now: fixedClock,
    })

    const statuses = result.sessions[0].materials.map((m) => m.verification.status)
    // The top 5 by duration default to anchors and fail the content check;
    // the lightest material is not an anchor and only needs a status check.
    expect(statuses.slice(0, 5)).toEqual(Array(5).fill('unresolved-after-retries'))
    expect(statuses[5]).toBe('verified-by-status')
  })

  it('searches for a replacement on failure and re-verifies it', async () => {
    const plan = clonePlan(fixturePlan)
    plan.sessions = [plan.sessions[0]]
    plan.sessions[0].materials = [plan.sessions[0].materials[0]]
    const original = plan.sessions[0].materials[0]

    const fetchImpl = async (url: string): Promise<FetchResponse> => {
      if (url === original.url) return notFound()
      return ok()
    }
    const searchReplacement = async (): Promise<ReplacementCandidate> => ({
      title: 'Replacement Resource',
      url: 'https://example.com/replacement',
      sourceType: 'preferred',
    })

    const { plan: result, report } = await verifyPlan(plan, {
      fetch: fetchImpl,
      searchReplacement,
      anchorUrls: [],
      now: fixedClock,
    })

    const material = result.sessions[0].materials[0]
    expect(material.url).toBe('https://example.com/replacement')
    expect(material.verification.status).toBe('replaced-after-failure')
    expect(report.outcomes[0].attempts).toBe(1)
  })

  it('caps replacement attempts at two per slot so checking always terminates', async () => {
    const plan = clonePlan(fixturePlan)
    plan.sessions = [plan.sessions[0]]
    plan.sessions[0].materials = [plan.sessions[0].materials[0]]

    let searchCalls = 0
    const searchReplacement = async (
      _concept: string,
      excludedUrls: string[]
    ): Promise<ReplacementCandidate> => {
      searchCalls += 1
      return { title: 'Another dead link', url: `https://example.com/dead-${excludedUrls.length}`, sourceType: 'preferred' }
    }

    const { plan: result, report } = await verifyPlan(plan, {
      fetch: async () => notFound(),
      searchReplacement,
      now: fixedClock,
    })

    expect(searchCalls).toBe(2)
    expect(result.sessions[0].materials[0].verification.status).toBe('unresolved-after-retries')
    expect(result.sessions[0].materials[0].verification.checkedAt).toBeNull()
    expect(report.outcomes[0].attempts).toBe(2)
  })

  it('records a slot unresolved after retries rather than dropping it', async () => {
    const plan = clonePlan(fixturePlan)
    plan.sessions = [plan.sessions[0]]
    plan.sessions[0].materials = [plan.sessions[0].materials[0]]

    const { plan: result } = await verifyPlan(plan, {
      fetch: async () => notFound(),
      searchReplacement: noReplacement,
      now: fixedClock,
    })

    expect(result.sessions[0].materials.length).toBe(1)
    expect(result.sessions[0].materials[0].verification.status).toBe('unresolved-after-retries')
  })

  it('treats an unreachable host as a verification failure, not an exception that aborts the run', async () => {
    const plan = clonePlan(fixturePlan)
    plan.sessions = [plan.sessions[0]]
    plan.sessions[0].materials = [plan.sessions[0].materials[0]]

    const fetchImpl = async (): Promise<FetchResponse> => {
      throw new Error('ENOTFOUND')
    }

    await expect(
      verifyPlan(plan, { fetch: fetchImpl, searchReplacement: noReplacement, now: fixedClock })
    ).resolves.toMatchObject({
      plan: { sessions: [{ materials: [{ verification: { status: 'unresolved-after-retries' } }] }] },
    })
  })

  it('distinguishes all four verification outcomes, each with a timestamp policy', async () => {
    const plan = clonePlan(fixturePlan)
    plan.sessions = plan.sessions.slice(0, 1)
    plan.sessions[0].materials = [
      { ...plan.sessions[0].materials[0], url: 'https://example.com/status', sourceType: 'preferred', title: 'Status check' },
      { ...plan.sessions[0].materials[0], url: 'https://example.com/content', sourceType: 'off-list', title: 'guide topic' },
      { ...plan.sessions[0].materials[0], url: 'https://example.com/dead', sourceType: 'preferred', title: 'Dead link', paid: false },
      { ...plan.sessions[0].materials[0], url: 'https://example.com/unresolved', sourceType: 'preferred', title: 'Unresolved link' },
    ]

    const fetchImpl = async (url: string): Promise<FetchResponse> => {
      if (url === 'https://example.com/status') return ok()
      if (url === 'https://example.com/content') return ok('a guide about topic')
      if (url === 'https://example.com/dead') return notFound()
      if (url === 'https://example.com/replacement') return ok()
      if (url === 'https://example.com/unresolved') return notFound()
      return notFound()
    }
    const searchReplacement = async (
      concept: string
    ): Promise<ReplacementCandidate | null> => {
      if (concept === 'Dead link') {
        return { title: 'Replacement', url: 'https://example.com/replacement', sourceType: 'preferred' }
      }
      return null
    }

    const { plan: result } = await verifyPlan(plan, {
      fetch: fetchImpl,
      searchReplacement,
      anchorUrls: [],
      now: fixedClock,
    })
    const statuses = result.sessions[0].materials.map((m) => m.verification.status)
    expect(statuses).toEqual([
      'verified-by-status',
      'verified-by-content',
      'replaced-after-failure',
      'unresolved-after-retries',
    ])
    expect(result.sessions[0].materials[3].verification.checkedAt).toBeNull()
    for (const m of result.sessions[0].materials.slice(0, 3)) {
      expect(m.verification.checkedAt).toBe(fixedClock())
    }
  })

  it('does not mutate the plan it is given', async () => {
    const plan = clonePlan(fixturePlan)
    const before = JSON.stringify(plan)
    await verifyPlan(plan, { fetch: async () => ok(), searchReplacement: noReplacement, now: fixedClock })
    expect(JSON.stringify(plan)).toBe(before)
  })
})
