import { describe, expect, it } from 'vitest'
import type { PlanBrief } from '../src/app/intelligence'
import { ScriptedIntelligence } from '../src/app/intelligence'
import { MemoryPlanStore } from '../src/app/plan-store'
import type { Job } from '../src/app/planner'
import { Planner } from '../src/app/planner'
import type { Material, PlanData, Session } from '../src/plan-types'
import { fixturePlan } from './fixtures/plan-fixture'
import type { FetchLike, VerificationReport } from '../src/verification'

function clonePlan(plan: PlanData): PlanData {
  return JSON.parse(JSON.stringify(plan)) as PlanData
}

/**
 * Build a `FetchLike` that always returns 200 with a body echoing the
 * given material's title (so practitioner and off-list tiers pass content
 * check). Tests can override either side.
 */
function buildEchoingFetch(plan: PlanData): FetchLike {
  const materialByUrl = new Map(plan.sessions.flatMap((s) => s.materials.map((m) => [m.url, m])))
  return async (url) => {
    const material = materialByUrl.get(url)
    if (material && material.sourceType !== 'preferred') {
      return {
        ok: true,
        status: 200,
        text: async () => `${material.title}, with worked examples.`,
      }
    }
    return { ok: true, status: 200, text: async () => 'placeholder body' }
  }
}

const brief: PlanBrief = {
  subject: 'Python Programming',
  currentLevel: 'Beginner',
  hoursPerDay: 2,
  targetCapability: 'Build real-world command-line tools',
}

/** A small but valid plan the scripted intelligence can return on demand. */
function makePlan(): PlanData {
  const plan = clonePlan(fixturePlan)
  plan.meta.generatedAt = '2026-02-15T12:00:00.000Z'
  return plan
}

async function waitForTerminal(job: Job): Promise<void> {
  const deadline = Date.now() + 5_000
  while (job.stage === 'requested' || job.stage === 'sourcing' || job.stage === 'verifying') {
    if (Date.now() > deadline) throw new Error('job did not reach a terminal stage')
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
}

function appliedReport(job: Job): { planId: string; report: VerificationReport } {
  expect(job.stage).toBe('applied')
  if (job.stage !== 'applied' || !job.result || 'error' in job.result || 'reasons' in job.result) {
    throw new Error('expected applied result with planId')
  }
  return job.result
}

function refusedResult(job: Job): { reasons: string[]; stage: 'request' | 'merged-plan' | 'verification' } {
  expect(job.stage).toBe('refused')
  if (job.stage !== 'refused' || !job.result || !('reasons' in job.result)) {
    throw new Error('expected refused result')
  }
  return job.result
}

function failedMessage(job: Job): string {
  expect(job.stage).toBe('failed')
  if (job.stage !== 'failed' || !job.result || !('error' in job.result)) {
    throw new Error('expected failed result')
  }
  return job.result.error
}

describe('Planner.generate', () => {
  it('Scenario 1: a healthy answer passes through requested → sourcing → verifying → applied; the store has one plan whose id is the slug', async () => {
    const store = new MemoryPlanStore()
    const intelligence = new ScriptedIntelligence()
    const plan = makePlan()
    intelligence.enqueuePlan(plan)
    // Pre-queue plenty of null answers so any incidental replacement
    // searches never throw — content checks pass on echoed bodies and no
    // real replacement is expected, but reserve room for the path.
    for (let i = 0; i < 16; i++) intelligence.enqueueReplacementUrl(null)
    const planner = new Planner({ store, intelligence, fetch: buildEchoingFetch(plan) })

    const job = planner.generate(brief)
    expect(job.stage).toBe('requested')
    await waitForTerminal(job)
    expect(job.stage).toBe('applied')
    const { planId, report } = appliedReport(job)
    expect(planId).toBe('python-programming')

    const summaries = await store.list()
    expect(summaries).toHaveLength(1)
    expect(summaries[0].id).toBe('python-programming')
    const stored = await store.read('python-programming')
    expect(stored.meta.subject).toBe('Python Programming')
    expect(Array.isArray(report.outcomes)).toBe(true)
  })

  it('Scenario 2: invalid attempt triggers a repair round with the validationErrors; the second answer is used', async () => {
    const store = new MemoryPlanStore()
    const intelligence = new ScriptedIntelligence()
    const broken = clonePlan(fixturePlan)
    broken.sessions.pop()
    intelligence.enqueuePlan(broken)
    intelligence.enqueuePlan(makePlan())
    // Some echo-fetched materials may still trigger replacement searches
    // (off-list / practitioner content misses). Pre-queue null answers.
    for (let i = 0; i < 16; i++) intelligence.enqueueReplacementUrl(null)
    const planForFetch = makePlan()
    const planner = new Planner({ store, intelligence, fetch: buildEchoingFetch(planForFetch) })

    const job = planner.generate(brief)
    await waitForTerminal(job)

    expect(job.stage).toBe('applied')
    expect(intelligence.calls.length).toBeGreaterThanOrEqual(2)
    const secondCall = intelligence.calls[1]
    expect(secondCall.method).toBe('generatePlan')
    const repair = secondCall.args[1] as { validationErrors: string[] } | undefined
    expect(repair).toBeDefined()
    expect(repair!.validationErrors.length).toBeGreaterThan(0)
  })

  it('Scenario 3: three failures in a row end in stage `failed`; the store is empty; three intelligence calls', async () => {
    const store = new MemoryPlanStore()
    const intelligence = new ScriptedIntelligence()
    const planForFetch = makePlan()
    const broken = clonePlan(fixturePlan)
    broken.sessions.pop()
    intelligence.enqueuePlan(broken)
    intelligence.enqueuePlan(broken)
    intelligence.enqueuePlan(broken)
    // Repair rounds still walk through the verifier (they don't persist,
    // but the verifier's fetches run). Pad the queue so no replacement
    // search ever throws on a 404.
    for (let i = 0; i < 16; i++) intelligence.enqueueReplacementUrl(null)
    const planner = new Planner({ store, intelligence, fetch: buildEchoingFetch(planForFetch) })

    const job = planner.generate(brief)
    await waitForTerminal(job)

    expect(job.stage).toBe('failed')
    expect(intelligence.calls).toHaveLength(3)
    expect(await store.list()).toEqual([])
    expect(failedMessage(job)).toBeTruthy()
  })

  it('Scenario 4: a dead link triggers up to two findReplacementUrl calls; both null answers leave the slot unresolved', async () => {
    const store = new MemoryPlanStore()
    const intelligence = new ScriptedIntelligence()
    const plan = makePlan()
    plan.sessions[0].materials[0].url = 'https://example.com/dead'
    intelligence.enqueuePlan(plan)
    // Up to two replacement searches for the dead URL; both return null.
    // Other materials either pass (with title-aware body) or, if they would
    // also need a replacement, are caught by the url-equality check below.
    intelligence.enqueueReplacementUrl(null)
    intelligence.enqueueReplacementUrl(null)
    // Pad with a few more nulls so any incidental additional calls (e.g.
    // for off-list materials whose bodies happen to miss their concept)
    // don't fail loudly.
    for (let i = 0; i < 8; i++) intelligence.enqueueReplacementUrl(null)

    // Build a material-by-url map so the test can echo each title into the
    // body. Off-list and practitioner materials pass content check; only
    // the deliberate dead URL fails.
    const materialByUrl = new Map(plan.sessions.flatMap((s) => s.materials.map((m) => [m.url, m])))
    const fetchImpl: FetchLike = async (url) => {
      if (url === 'https://example.com/dead') return { ok: false, status: 404, text: async () => '' }
      const material = materialByUrl.get(url)
      if (material && material.sourceType !== 'preferred') {
        return {
          ok: true,
          status: 200,
          text: async () => `${material.title}. A practitioner treatment with worked examples and tradeoffs.`,
        }
      }
      return { ok: true, status: 200, text: async () => 'placeholder body' }
    }
    const planner = new Planner({ store, intelligence, fetch: fetchImpl })
    const job = planner.generate(brief)
    await waitForTerminal(job)

    expect(job.stage).toBe('applied')
    const { planId, report } = appliedReport(job)
    const stored = await store.read(planId)
    const slot = stored.sessions[0].materials[0]
    expect(slot.verification.status).toBe('unresolved-after-retries')
    expect(slot.url).toBe('https://example.com/dead')
    expect(report.unresolvedCount).toBeGreaterThanOrEqual(1)
    // At least one replacement search ran for the dead link; the verifier is
    // allowed to break early once searchReplacement returns null.
    const findCallsForDead = intelligence.calls.filter((c) => {
      if (c.method !== 'findReplacementUrl') return false
      const mat = c.args[0] as Material
      return mat.title === 'Python Official Tutorial - Chapter 3'
    }).length
    expect(findCallsForDead).toBeGreaterThanOrEqual(1)
  })

  it('Scenario 9: provider throws — job ends in `failed` with the message; the store is unchanged', async () => {
    const store = new MemoryPlanStore()
    const intelligence = new ScriptedIntelligence()
    intelligence.enqueuePlan({ throw: new Error('provider down') })
    // Pad the replacement queue in case the planner reaches the verifier
    // before the throw surfaces — it won't, but the test shouldn't depend
    // on that timing.
    for (let i = 0; i < 16; i++) intelligence.enqueueReplacementUrl(null)
    const planner = new Planner({ store, intelligence, fetch: buildEchoingFetch(makePlan()) })
    const job = planner.generate(brief)
    await waitForTerminal(job)

    expect(job.stage).toBe('failed')
    expect(await store.list()).toEqual([])
    expect(failedMessage(job)).toMatch(/provider down/)
  })
})

describe('Planner.curate', () => {
  it('Scenario 5: drop-as-known passes the right context to the intelligence and applies the replacement', async () => {
    const store = new MemoryPlanStore()
    const intelligence = new ScriptedIntelligence()
    const initial = makePlan()
    initial.sessions[2].highFrequencyUnits.push('dropped-only unit')
    await store.create(initial)
    const replacementSession = makeReplacementSession(3)
    intelligence.enqueueSession({
      session: replacementSession,
      knownSummary: 'Functions and modules are familiar territory.',
    })
    const planner = new Planner({ store, intelligence, fetch: buildEchoingFetch(initial) })

    const job = planner.curate('python-programming', {
      intent: 'drop-as-known',
      sessionNumber: 3,
      known: 'I already write functions and modules fluently',
    })
    await waitForTerminal(job)

    expect(job.stage).toBe('applied')
    const { planId } = appliedReport(job)
    const stored = await store.read(planId)
    expect(stored.curationLog).toHaveLength(1)
    expect(stored.curationLog![0].intent).toBe('drop-as-known')
    expect(stored.meta.currentLevel).toContain(
      'Already known: Functions and modules are familiar territory.'
    )
    const session3 = stored.sessions.find((s) => s.number === 3)!
    expect(session3.title).toBe(replacementSession.title)

    expect(intelligence.calls).toHaveLength(1)
    const ctx = intelligence.calls[0].args[0] as {
      droppedUnits: string[]
      atRiskUnits: string[]
      extendedCurrentLevel: string
    }
    expect(ctx.droppedUnits.length).toBeGreaterThan(0)
    expect(typeof ctx.extendedCurrentLevel).toBe('string')
    expect(Array.isArray(ctx.atRiskUnits)).toBe(true)
    expect(ctx.atRiskUnits).toContain('dropped-only unit')
  })

  it('Scenario 6: a drop on a consolidation slot refuses at stage `request`; the intelligence is never called', async () => {
    const store = new MemoryPlanStore()
    const intelligence = new ScriptedIntelligence()
    const initialPlan = makePlan()
    await store.create(initialPlan)
    const planner = new Planner({ store, intelligence, fetch: buildEchoingFetch(initialPlan) })
    const job = planner.curate('python-programming', {
      intent: 'drop-as-known',
      sessionNumber: 6,
      known: 'I already know the fundamentals',
    })
    await waitForTerminal(job)

    expect(job.stage).toBe('refused')
    const refused = refusedResult(job)
    expect(refused.stage).toBe('request')
    expect(intelligence.calls).toHaveLength(0)
    const stored = await store.read('python-programming')
    expect(stored.curationLog ?? []).toEqual([])
  })

  it('Scenario 7: a swap by URL that 404s refuses at `verification`; findReplacementUrl is never called', async () => {
    const store = new MemoryPlanStore()
    const intelligence = new ScriptedIntelligence()
    const initialPlan = makePlan()
    await store.create(initialPlan)
    const deadUrl = 'https://learner.example.com/dead'
    const replacementMaterial: Material = {
      title: 'Learner article',
      url: deadUrl,
      sourceType: 'off-list',
      estimatedDuration: 10,
      paid: false,
      verification: { status: 'verified-by-status', checkedAt: null },
    }
    const fetchImpl: FetchLike = async (url) => {
      if (url === deadUrl) return { ok: false, status: 404, text: async () => '' }
      return { ok: true, status: 200, text: async () => 'placeholder body' }
    }
    const planner = new Planner({ store, intelligence, fetch: fetchImpl })
    intelligence.enqueueMaterial(replacementMaterial)
    const job = planner.curate('python-programming', {
      intent: 'swap-material',
      sessionNumber: 3,
      materialUrl: initialPlan.sessions.find((s) => s.number === 3)!.materials[0].url,
      by: { url: deadUrl },
    })
    await waitForTerminal(job)

    expect(job.stage).toBe('refused')
    const refused = refusedResult(job)
    expect(refused.stage).toBe('verification')
    const materialCall = intelligence.calls.find((call) => call.method === 'replaceMaterial')
    expect(materialCall).toBeDefined()
    expect((materialCall!.args[0] as { remainingMinutes: number }).remainingMinutes).toBeGreaterThan(0)
    expect(intelligence.calls.find((c) => c.method === 'findReplacementUrl')).toBeUndefined()
    const stored = await store.read('python-programming')
    expect(stored.curationLog ?? []).toEqual([])
  })

  it('Scenario 8: a curate while another job is in flight on the same plan throws PlanBusyError', async () => {
    const store = new MemoryPlanStore()
    const intelligence = new ScriptedIntelligence()
    const initialPlan = makePlan()
    await store.create(initialPlan)
    const planner = new Planner({ store, intelligence, fetch: buildEchoingFetch(initialPlan) })

    const verifyA = planner.verify('python-programming')
    expect(() =>
      planner.curate('python-programming', {
        intent: 'drop-as-known',
        sessionNumber: 3,
        known: 'X',
      })
    ).toThrow(/in-flight/i)
    expect(() => planner.verify('python-programming')).toThrow(/in-flight/i)
    await waitForTerminal(verifyA)
  })

  it('redo-session sources its replacement through Intelligence and preserves the reason context', async () => {
    const store = new MemoryPlanStore()
    const intelligence = new ScriptedIntelligence()
    const initialPlan = makePlan()
    await store.create(initialPlan)
    const replacementSession = makeReplacementSession(3)
    intelligence.enqueueSession({ session: replacementSession })
    const planner = new Planner({ store, intelligence, fetch: buildEchoingFetch(initialPlan) })

    const job = planner.curate('python-programming', {
      intent: 'redo-session',
      sessionNumber: 3,
      reason: 'The material was too shallow',
    })
    await waitForTerminal(job)

    expect(job.stage).toBe('applied')
    const call = intelligence.calls.find((entry) => entry.method === 'replaceSession')
    expect(call).toBeDefined()
    expect((call!.args[0] as { intent: string; reason?: string }).intent).toBe('redo-session')
    expect((call!.args[0] as { reason?: string }).reason).toBe('The material was too shallow')
  })
})

function makeReplacementSession(sessionNumber: number): Session {
  return {
    number: sessionNumber,
    title: `Replacement ${sessionNumber}`,
    artifactOneLiner: 'A different artifact for the same target',
    materials: [
      {
        title: 'Replacement material',
        url: 'https://example.com/replacement',
        sourceType: 'preferred',
        estimatedDuration: 10,
        paid: false,
        verification: { status: 'verified-by-status', checkedAt: null },
      },
    ],
    selfCheck: 'Can I do the new artifact?',
    estimatedTime: 60,
    highFrequencyUnits: ['module structure', 'packaging'],
  }
}
