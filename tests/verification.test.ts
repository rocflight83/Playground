import type { PlanData } from '../src/plan-types'
import type { FetchResponse, ReplacementCandidate } from '../src/verification'
import { verifyPlan } from '../src/verification'
import { fixturePlan } from './fixtures/plan-fixture'

function prose(words: number): string {
  return Array.from({ length: words }, () => 'word').join(' ')
}

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
    expectedUrls.push(fixturePlan.phases[0].outlierStory!.citation)
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
    expect(report.outcomes.find((outcome) => outcome.kind === 'material')?.attempts).toBe(1)
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
    expect(report.outcomes.find((outcome) => outcome.kind === 'material')?.attempts).toBe(2)
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

  it('content-verifies a non-anchor practitioner material whose body covers the claimed concept', async () => {
    const plan = clonePlan(fixturePlan)
    plan.sessions = [plan.sessions[0]]
    plan.sessions[0].materials = [plan.sessions[0].materials[0]]
    plan.sessions[0].materials[0].sourceType = 'practitioner'
    plan.sessions[0].materials[0].title = 'Argparse Guide'

    const { plan: passing } = await verifyPlan(plan, {
      fetch: async () => ok('A guide to using argparse for command-line tools.'),
      searchReplacement: noReplacement,
      anchorUrls: [],
      now: fixedClock,
    })
    expect(passing.sessions[0].materials[0].verification.status).toBe('verified-by-content')

    const { plan: failing, report } = await verifyPlan(plan, {
      fetch: async () => ok('This page is about gardening and has nothing to do with the topic.'),
      searchReplacement: noReplacement,
      anchorUrls: [],
      now: fixedClock,
    })
    expect(failing.sessions[0].materials[0].verification.status).toBe('unresolved-after-retries')
    expect(report.unresolvedCount).toBe(1)
  })

  it('rejects a practitioner material whose fetch returns 200 with an empty body (issue 12: status-only is not enough)', async () => {
    const plan = clonePlan(fixturePlan)
    plan.sessions = [plan.sessions[0]]
    plan.sessions[0].materials = [plan.sessions[0].materials[0]]
    plan.sessions[0].materials[0].sourceType = 'practitioner'
    plan.sessions[0].materials[0].title = 'Argparse Guide'

    const { plan: result } = await verifyPlan(plan, {
      fetch: async () => ok(''),
      searchReplacement: noReplacement,
      anchorUrls: [],
      now: fixedClock,
    })
    expect(result.sessions[0].materials[0].verification.status).toBe('unresolved-after-retries')
  })

  it('a non-anchor preferred material is still verified-by-status (issue 12: only off-list and practitioner escalate)', async () => {
    const plan = clonePlan(fixturePlan)
    plan.sessions = [plan.sessions[0]]
    plan.sessions[0].materials = [plan.sessions[0].materials[0]]
    plan.sessions[0].materials[0].sourceType = 'preferred'

    const { plan: result } = await verifyPlan(plan, {
      fetch: async () => ok('A page with no relation to argparse at all.'),
      searchReplacement: noReplacement,
      anchorUrls: [],
      now: fixedClock,
    })
    expect(result.sessions[0].materials[0].verification.status).toBe('verified-by-status')
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

  it('retains a story with a healthy citation and reports it separately from materials', async () => {
    const plan = clonePlan(fixturePlan)
    const citation = plan.phases[0].outlierStory!.citation
    const { plan: result, report } = await verifyPlan(plan, {
      fetch: async (url) => (url === citation ? ok() : ok()),
      searchReplacement: noReplacement,
      now: fixedClock,
    })

    // The story's text fields are unchanged, but verification is now populated.
    const story = result.phases[0].outlierStory!
    expect({ person: story.person, approach: story.approach, principle: story.principle, citation: story.citation }).toEqual(plan.phases[0].outlierStory)
    expect(story.verification).toEqual({ status: 'verified-by-status', checkedAt: fixedClock() })
    expect(report.outcomes).toContainEqual({
      kind: 'outlier-story',
      phaseIndex: 0,
      citation,
      status: 'verified-by-status',
    })
    expect(report.outcomes.every((outcome) => outcome.kind === 'material' || outcome.kind === 'outlier-story')).toBe(true)
  })

  it('removes a story whose citation fails without changing material outcomes', async () => {
    const plan = clonePlan(fixturePlan)
    const citation = plan.phases[0].outlierStory!.citation
    const materialUrls = plan.sessions.flatMap((session) => session.materials.map((material) => material.url))
    const { plan: result, report } = await verifyPlan(plan, {
      fetch: async (url) => (url === citation ? notFound() : ok()),
      searchReplacement: noReplacement,
      now: fixedClock,
    })

    expect(result.phases[0].outlierStory).toBeUndefined()
    expect(report.outcomes.filter((outcome) => outcome.kind === 'material')).toHaveLength(materialUrls.length)
    expect(report.outcomes).toContainEqual({
      kind: 'outlier-story',
      phaseIndex: 0,
      citation,
      status: 'unresolved-after-retries',
    })
    expect(report.unresolvedCount).toBe(
      report.outcomes.filter((outcome) => outcome.status === 'unresolved-after-retries').length
    )
  })

  it('removes a story when fetching its citation throws', async () => {
    const plan = clonePlan(fixturePlan)
    const citation = plan.phases[0].outlierStory!.citation
    const { plan: result } = await verifyPlan(plan, {
      fetch: async (url) => {
        if (url === citation) throw new Error('unreachable')
        return ok()
      },
      searchReplacement: noReplacement,
      now: fixedClock,
    })

    expect(result.phases[0].outlierStory).toBeUndefined()
  })

  it('keeps a story whose citation fails when keepOutlierStoriesOnFailure is set, with an unresolved verification record', async () => {
    const plan = clonePlan(fixturePlan)
    const citation = plan.phases[0].outlierStory!.citation
    const { plan: result, report } = await verifyPlan(plan, {
      fetch: async (url) => (url === citation ? notFound() : ok()),
      searchReplacement: noReplacement,
      now: fixedClock,
      keepOutlierStoriesOnFailure: true,
    })

    const story = result.phases[0].outlierStory
    expect(story).toBeDefined()
    expect(story?.citation).toBe(citation)
    expect(story?.verification).toEqual({ status: 'unresolved-after-retries', checkedAt: null })
    expect(report.outcomes).toContainEqual({
      kind: 'outlier-story',
      phaseIndex: 0,
      citation,
      status: 'unresolved-after-retries',
    })
  })

  it('keeps a story whose citation throws when keepOutlierStoriesOnFailure is set', async () => {
    const plan = clonePlan(fixturePlan)
    const citation = plan.phases[0].outlierStory!.citation
    const { plan: result } = await verifyPlan(plan, {
      fetch: async (url) => {
        if (url === citation) throw new Error('unreachable')
        return ok()
      },
      searchReplacement: noReplacement,
      now: fixedClock,
      keepOutlierStoriesOnFailure: true,
    })

    const story = result.phases[0].outlierStory
    expect(story).toBeDefined()
    expect(story?.verification?.status).toBe('unresolved-after-retries')
  })

  it('verifies only the chosen sessions when sessionNumbers is set and passes the rest through untouched', async () => {
    const plan = clonePlan(fixturePlan)
    // Stamp session 3's verification with a known timestamp so we can detect
    // any later mutation; stamp other sessions too so the assertion covers
    // "unchanged", not "coincidentally equal".
    const staleTimestamp = '2025-01-01T00:00:00.000Z'
    const freshTimestamp = '2026-06-01T00:00:00.000Z'
    const staleRecord = { status: 'verified-by-status' as const, checkedAt: staleTimestamp }
    const freshRecord = { status: 'verified-by-content' as const, checkedAt: freshTimestamp }
    for (const session of plan.sessions) {
      if (session.number === 3) {
        for (const material of session.materials) material.verification = freshRecord
      } else {
        for (const material of session.materials) material.verification = staleRecord
      }
    }
    // Snapshot every session's material URLs plus the chosen session number so
    // we can detect that the wrong session got fetched. The body returned for
    // session 3's materials echoes each material's own title so content-checking
    // practitioner materials in the fixture passes (issue 12: non-preferred
    // materials now require a content pass).
    const session3Urls = new Set(plan.sessions.find((s) => s.number === 3)!.materials.map((m) => m.url))
    const session3ByUrl = new Map(plan.sessions.find((s) => s.number === 3)!.materials.map((m) => [m.url, m]))
    const fetchedUrls: string[] = []
    const fetchImpl = async (url: string): Promise<FetchResponse> => {
      fetchedUrls.push(url)
      if (session3Urls.has(url)) {
        const material = session3ByUrl.get(url)!
        return ok(`${material.title}. A practitioner treatment with worked examples and tradeoffs.`)
      }
      return ok()
    }

    const { plan: result, report } = await verifyPlan(plan, {
      fetch: fetchImpl,
      searchReplacement: noReplacement,
      now: () => freshTimestamp,
      sessionNumbers: [3],
    })

    // Only session 3's material URLs were fetched.
    const expectedUrls = plan.sessions.find((session) => session.number === 3)!.materials.map((m) => m.url)
    expect(fetchedUrls.sort()).toEqual(expectedUrls.sort())

    // The other thirteen sessions' verification records are exactly what we
    // seeded them with — same objects, same timestamps, no fetch side effects.
    for (const session of result.sessions) {
      if (session.number === 3) continue
      for (const material of session.materials) {
        expect(material.verification).toEqual(staleRecord)
      }
    }

    // Session 3's verification records refresh to the new timestamp. The
    // fixture's session 3 carries a practitioner material, which is
    // content-verified under issue 12 — so its status is
    // `verified-by-content`, not `verified-by-status`.
    for (const material of result.sessions.find((session) => session.number === 3)!.materials) {
      expect(material.verification).toEqual({ status: 'verified-by-content', checkedAt: freshTimestamp })
    }

    // Outlier-story citations are phase-level, so a session filter excludes
    // them — no story outcome appears in the report and the citation URL was
    // not fetched.
    expect(report.outcomes.find((outcome) => outcome.kind === 'outlier-story')).toBeUndefined()
    expect(fetchedUrls).not.toContain(plan.phases[0].outlierStory!.citation)

    // The report carries the targeted session's material outcomes only.
    const materialOutcomes = report.outcomes.filter((outcome) => outcome.kind === 'material')
    expect(materialOutcomes.length).toBe(expectedUrls.length)
    expect(materialOutcomes.every((outcome) => outcome.sessionNumber === 3)).toBe(true)
  })
})

describe('verifyPlan measures consumption time on every verified material (issue 13)', () => {
  function singlePreferredNonAnchor(): PlanData {
    const plan = clonePlan(fixturePlan)
    plan.sessions = [plan.sessions[0]]
    plan.sessions[0].materials = [plan.sessions[0].materials[0]]
    plan.sessions[0].materials[0].sourceType = 'preferred'
    return plan
  }

  it('measures a 3000-word body, warns when the estimate is overstated (estimate 60, measured 15)', async () => {
    const plan = singlePreferredNonAnchor()
    plan.sessions[0].materials[0].estimatedDuration = 60
    const body = prose(3000)

    const { plan: result, report } = await verifyPlan(plan, {
      fetch: async () => ok(body),
      searchReplacement: noReplacement,
      anchorUrls: [],
      now: fixedClock,
    })

    const material = result.sessions[0].materials[0]
    expect(material.verification).toEqual({
      status: 'verified-by-status',
      checkedAt: fixedClock(),
      measuredDuration: 15,
      measuredBy: 'word-count',
    })
    expect(report.durationWarnings).toHaveLength(1)
    expect(report.durationWarnings[0]).toMatchObject({
      sessionNumber: 1,
      materialTitle: material.title,
      estimatedDuration: 60,
      measuredDuration: 15,
      measuredBy: 'word-count',
      words: 3000,
      direction: 'overstated',
    })
  })

  it('records the measurement but warns nothing when the estimate is within the band (estimate 20, measured 15)', async () => {
    const plan = singlePreferredNonAnchor()
    plan.sessions[0].materials[0].estimatedDuration = 20
    const body = prose(3000)

    const { plan: result, report } = await verifyPlan(plan, {
      fetch: async () => ok(body),
      searchReplacement: noReplacement,
      anchorUrls: [],
      now: fixedClock,
    })

    const material = result.sessions[0].materials[0]
    expect(material.verification.measuredDuration).toBe(15)
    expect(material.verification.measuredBy).toBe('word-count')
    expect(report.durationWarnings).toEqual([])
  })

  it('warns when the body dwarfs the estimate (estimate 15, measured 60)', async () => {
    const plan = singlePreferredNonAnchor()
    plan.sessions[0].materials[0].estimatedDuration = 15
    const body = prose(12000)

    const { plan: result, report } = await verifyPlan(plan, {
      fetch: async () => ok(body),
      searchReplacement: noReplacement,
      anchorUrls: [],
      now: fixedClock,
    })

    const material = result.sessions[0].materials[0]
    expect(material.verification.measuredDuration).toBe(60)
    expect(report.durationWarnings).toHaveLength(1)
    expect(report.durationWarnings[0]).toMatchObject({
      estimatedDuration: 15,
      measuredDuration: 60,
      direction: 'understated',
      words: 12000,
    })
  })

  it('measures a watch page from <meta itemprop duration> and warns when the estimate is short', async () => {
    const plan = singlePreferredNonAnchor()
    plan.sessions[0].materials[0].estimatedDuration = 10
    const body = `<!doctype html><html><head><meta itemprop="duration" content="PT45M0S"></head><body>watch</body></html>`

    const { plan: result, report } = await verifyPlan(plan, {
      fetch: async () => ok(body),
      searchReplacement: noReplacement,
      anchorUrls: [],
      now: fixedClock,
    })

    const material = result.sessions[0].materials[0]
    expect(material.verification.measuredDuration).toBe(45)
    expect(material.verification.measuredBy).toBe('video-metadata')
    expect(report.durationWarnings[0]).toMatchObject({
      estimatedDuration: 10,
      measuredDuration: 45,
      measuredBy: 'video-metadata',
      direction: 'understated',
    })
  })

  it('records nothing and warns nothing for a paid material', async () => {
    const plan = singlePreferredNonAnchor()
    const material = plan.sessions[0].materials[0]
    material.paid = true
    material.price = 19
    material.estimatedDuration = 60
    const body = prose(3000)

    const { plan: result, report } = await verifyPlan(plan, {
      fetch: async () => ok(body),
      searchReplacement: noReplacement,
      anchorUrls: [],
      now: fixedClock,
    })

    expect(result.sessions[0].materials[0].verification.measuredDuration).toBeUndefined()
    expect(result.sessions[0].materials[0].verification.measuredBy).toBeUndefined()
    expect(report.durationWarnings).toEqual([])
  })

  it('records nothing and warns nothing for a .pdf URL', async () => {
    const plan = singlePreferredNonAnchor()
    plan.sessions[0].materials[0].url = 'https://example.com/paper.pdf'
    plan.sessions[0].materials[0].estimatedDuration = 60
    const body = prose(3000)

    const { plan: result, report } = await verifyPlan(plan, {
      fetch: async () => ok(body),
      searchReplacement: noReplacement,
      anchorUrls: [],
      now: fixedClock,
    })

    expect(result.sessions[0].materials[0].verification.measuredDuration).toBeUndefined()
    expect(result.sessions[0].materials[0].verification.measuredBy).toBeUndefined()
    expect(report.durationWarnings).toEqual([])
  })

  it('records nothing and warns nothing for the placeholder body every existing test already uses', async () => {
    // Run a small representative plan with placeholder bodies and confirm
    // durationWarnings is the empty array and no material carries a measurement.
    const plan = singlePreferredNonAnchor()
    const { plan: result, report } = await verifyPlan(plan, {
      fetch: async () => ok(),
      searchReplacement: noReplacement,
      anchorUrls: [],
      now: fixedClock,
    })
    expect(result.sessions[0].materials[0].verification.measuredDuration).toBeUndefined()
    expect(result.sessions[0].materials[0].verification.measuredBy).toBeUndefined()
    expect(report.durationWarnings).toEqual([])
  })

  it('keeps status-only verified-by-status when text() rejects and records no measurement', async () => {
    const plan = singlePreferredNonAnchor()
    const fetchImpl = async (): Promise<FetchResponse> => ({
      ok: true,
      status: 200,
      text: async () => {
        throw new Error('body unavailable')
      },
    })

    const { plan: result, report } = await verifyPlan(plan, {
      fetch: fetchImpl,
      searchReplacement: noReplacement,
      anchorUrls: [],
      now: fixedClock,
    })

    const material = result.sessions[0].materials[0]
    expect(material.verification.status).toBe('verified-by-status')
    expect(material.verification.measuredDuration).toBeUndefined()
    expect(material.verification.measuredBy).toBeUndefined()
    expect(report.durationWarnings).toEqual([])
  })

  it('measures a replacement candidate on its own body', async () => {
    const plan = singlePreferredNonAnchor()
    plan.sessions[0].materials[0].estimatedDuration = 60
    const original = plan.sessions[0].materials[0]

    const fetchImpl = async (url: string): Promise<FetchResponse> => {
      if (url === original.url) return notFound()
      // Replacement body is 3000 words so a 60-min estimate produces a mismatch.
      return ok(prose(3000))
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
    expect(material.verification.measuredDuration).toBe(15)
    expect(material.verification.measuredBy).toBe('word-count')
    expect(report.durationWarnings).toHaveLength(1)
    expect(report.durationWarnings[0]).toMatchObject({
      url: 'https://example.com/replacement',
      estimatedDuration: 60,
      measuredDuration: 15,
      direction: 'overstated',
    })
  })

  it('does not change verification status, replacement attempts, or unresolvedCount because of measurement', async () => {
    // Use a fixture whose body is rich enough to trigger a measurement but
    // whose estimate is honest, so we can compare to a run on placeholder
    // bodies: same statuses, same unresolvedCount, same attempt counts.
    const placeholderPlan = singlePreferredNonAnchor()
    placeholderPlan.sessions[0].materials[0].estimatedDuration = 20
    const placeholderResult = await verifyPlan(placeholderPlan, {
      fetch: async () => ok(),
      searchReplacement: noReplacement,
      anchorUrls: [],
      now: fixedClock,
    })

    const measuredPlan = singlePreferredNonAnchor()
    measuredPlan.sessions[0].materials[0].estimatedDuration = 20
    const measuredResult = await verifyPlan(measuredPlan, {
      fetch: async () => ok(prose(3000)),
      searchReplacement: noReplacement,
      anchorUrls: [],
      now: fixedClock,
    })

    const stripTiming = (outcomes: typeof placeholderResult.report.outcomes) =>
      outcomes.map((outcome) => ({ status: outcome.status, kind: outcome.kind, attempts: 'attempts' in outcome ? outcome.attempts : undefined }))
    expect(stripTiming(measuredResult.report.outcomes)).toEqual(
      stripTiming(placeholderResult.report.outcomes)
    )
    expect(measuredResult.report.unresolvedCount).toBe(placeholderResult.report.unresolvedCount)
  })
})

describe('verifyPlan � curation filters (issue 15)', () => {
  it('materialUrls restricts fetching within the selected sessions to those URLs; others ride through with records intact', async () => {
    const plan = clonePlan(fixturePlan)
    // Pick session 3 and 5 as the targeted sessions; flip them to preferred
    // so the body doesn't need to cover the concept.
    const target1 = plan.sessions.find((s) => s.number === 3)!
    const target2 = plan.sessions.find((s) => s.number === 5)!
    target1.materials[0].sourceType = 'preferred'
    target2.materials[0].sourceType = 'preferred'
    const target1Material = target1.materials[0]
    const target2Material = target2.materials[0]
    const seen: string[] = []
    const fetchImpl = async (url: string): Promise<FetchResponse> => {
      seen.push(url)
      return ok()
    }
    const result = await verifyPlan(plan, {
      fetch: fetchImpl,
      searchReplacement: noReplacement,
      now: fixedClock,
      anchorUrls: [],
      sessionNumbers: [3, 5],
      materialUrls: [target1Material.url, target2Material.url],
    })
    expect(seen.sort()).toEqual([target1Material.url, target2Material.url].sort())
    // The targeted materials have a refreshed timestamp.
    const refreshed1 = result.plan.sessions.find((s) => s.number === 3)!.materials[0]
    const refreshed2 = result.plan.sessions.find((s) => s.number === 5)!.materials[0]
    expect(refreshed1.verification.checkedAt).toBe(fixedClock())
    expect(refreshed2.verification.checkedAt).toBe(fixedClock())
    // Non-targeted sessions are untouched (same verification record as input).
    const untouched = result.plan.sessions.find((s) => s.number === 1)!
    expect(untouched.materials[0].verification).toEqual(plan.sessions.find((s) => s.number === 1)!.materials[0].verification)
  })

  it('noSubstitution skips searchReplacement and records a failed candidate as unresolved-after-retries after a single attempt', async () => {
    const plan = clonePlan(fixturePlan)
    plan.sessions = [plan.sessions[0]]
    plan.sessions[0].materials = [plan.sessions[0].materials[0]]
    plan.sessions[0].materials[0].sourceType = 'preferred'
    const deadUrl = plan.sessions[0].materials[0].url

    let replacementCalls = 0
    const searchReplacement: () => Promise<ReplacementCandidate | null> = async () => {
      replacementCalls += 1
      return null
    }

    const result = await verifyPlan(plan, {
      fetch: async (url) => (url === deadUrl ? notFound() : ok()),
      searchReplacement,
      now: fixedClock,
      anchorUrls: [],
      noSubstitution: true,
    })
    expect(replacementCalls).toBe(0)
    expect(result.plan.sessions[0].materials[0].verification.status).toBe('unresolved-after-retries')
    expect(result.plan.sessions[0].materials[0].verification.checkedAt).toBeNull()
  })

  it('noSubstitution passes the search-replacement seam through when the first attempt succeeds', async () => {
    // The noSubstitution flag gates the failure path; the success path is the
    // standard verify flow.
    const plan = clonePlan(fixturePlan)
    plan.sessions = [plan.sessions[0]]
    plan.sessions[0].materials = [plan.sessions[0].materials[0]]
    plan.sessions[0].materials[0].sourceType = 'preferred'

    let replacementCalls = 0
    const searchReplacement: () => Promise<ReplacementCandidate | null> = async () => {
      replacementCalls += 1
      return null
    }
    const result = await verifyPlan(plan, {
      fetch: async () => ok(),
      searchReplacement,
      now: fixedClock,
      anchorUrls: [],
      noSubstitution: true,
    })
    expect(replacementCalls).toBe(0)
    expect(result.plan.sessions[0].materials[0].verification.status).toBe('verified-by-status')
  })

  it('default (no filters) behaviour is preserved: every session and every URL is fetched', async () => {
    const plan = clonePlan(fixturePlan)
    const seen: string[] = []
    const fetchImpl = async (url: string): Promise<FetchResponse> => {
      seen.push(url)
      return ok()
    }
    await verifyPlan(plan, { fetch: fetchImpl, searchReplacement: noReplacement, now: fixedClock })
    const expectedUrls = fixturePlan.sessions.flatMap((s) => s.materials.map((m) => m.url))
    expectedUrls.push(fixturePlan.phases[0].outlierStory!.citation)
    expect(seen.sort()).toEqual(expectedUrls.sort())
  })
})

describe('verifyPlan forced content checks', () => {
  it('forces a content check for a preferred learner-supplied URL', async () => {
    const plan = clonePlan(fixturePlan)
    const material = plan.sessions[2].materials[0]
    material.sourceType = 'preferred'
    const result = await verifyPlan(plan, {
      fetch: async () => ok('unrelated page'),
      searchReplacement: noReplacement,
      now: fixedClock,
      anchorUrls: [],
      sessionNumbers: [3],
      materialUrls: [material.url],
      noSubstitution: true,
      forceContentCheckUrls: [material.url],
    })
    expect(result.plan.sessions[2].materials[0].verification.status).toBe('unresolved-after-retries')
  })
})
