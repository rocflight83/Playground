import { JSDOM } from 'jsdom'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { PlanData, Session, Material } from '../src/plan-types'
import { generatePlan } from '../src/generate'
import { curatePlanDir, redoSession } from '../src/maintenance'
import type { DropAsKnownRequest, RedoSessionRequest, SwapMaterialRequest } from '../src/curation'
import type { FetchLike, ReplacementCandidate } from '../src/verification'
import { fixturePlan } from './fixtures/plan-fixture'

const okResponse = (text = 'placeholder body') => ({ ok: true, status: 200, text: async () => text })
const notFoundResponse = () => ({ ok: false, status: 404, text: async () => '' })
const baseFetch: FetchLike = async () => okResponse()
const noReplacement: () => Promise<ReplacementCandidate | null> = async () => null
const fixedClock = () => '2026-02-01T00:00:00.000Z'
const laterClock = () => '2026-02-15T12:00:00.000Z'

function clonePlan(plan: PlanData): PlanData {
  return JSON.parse(JSON.stringify(plan)) as PlanData
}

function replacementSession3(): Session {
  return {
    number: 3,
    title: 'Functions and Modules — revised',
    artifactOneLiner: 'Build a callable library module from scratch',
    materials: [
      {
        title: 'Real Python - Modules and Packages',
        url: 'https://realpython.com/python-modules-packages/',
        sourceType: 'preferred',
        estimatedDuration: 30,
        paid: false,
        verification: { status: 'verified-by-status', checkedAt: null },
      },
      {
        title: 'Doug Hellmann - PyMOTW: Modules and Imports',
        url: 'https://pymotw.com/3/modules.html',
        sourceType: 'practitioner',
        estimatedDuration: 20,
        paid: false,
        verification: { status: 'verified-by-content', checkedAt: null },
      },
    ],
    selfCheck: 'Can I structure a project as importable modules under a package?',
    estimatedTime: 60,
    highFrequencyUnits: ['module structure', 'packaging'],
    encodingHook: 'A package is a directory with an __init__.py; a module is a file in it.',
  }
}

describe('curatePlanDir', () => {
  it('Scenario 1: drop-as-known applies the replacement and updates currentLevel on disk; only session 3 changes', async () => {
    const baseDir = await mkdtemp(join(tmpdir(), 'study-plan-curate-drop-'))
    try {
      const generated = await generatePlan(fixturePlan, baseDir, {
        fetch: baseFetch,
        searchReplacement: noReplacement,
        now: fixedClock,
      })
      const planDir = generated.planDir
      const replacement = replacementSession3()
      // Make sure the replacement satisfies the repetition floor: the fixture
      // has 'argument parsing' in session 5 and 'packaging' in session 8.
      const request: DropAsKnownRequest = {
        intent: 'drop-as-known',
        at: '2026-02-10T00:00:00.000Z',
        sessionNumber: 3,
        known: 'I already write functions and modules fluently',
        knownSummary: 'Functions, modules and packages are second nature; treat them as known.',
        replacement,
      }

      const result = await curatePlanDir(planDir, request, {
        fetch: baseFetch,
        searchReplacement: noReplacement,
        now: laterClock,
      })

      // The result carries the applied plan.
      expect(result.outcome.status).toBe('applied')
      if (result.outcome.status !== 'applied') return
      const applied = result.outcome.plan
      expect(applied.sessions.find((s) => s.number === 3)!.title).toBe(replacement.title)
      expect(applied.meta.currentLevel).toContain('Already known:')
      expect(applied.meta.currentLevel).toContain('Functions, modules and packages are second nature')

      // The on-disk plan.json reflects the change.
      const planJson = await readFile(join(planDir, 'plan.json'), 'utf8')
      const written = JSON.parse(planJson) as PlanData
      expect(written.sessions.find((s) => s.number === 3)!.title).toBe(replacement.title)
      expect(written.curationLog).toBeDefined()
      expect(written.curationLog).toHaveLength(1)
      expect(written.curationLog![0].intent).toBe('drop-as-known')
      expect(written.curationLog![0].sessionNumber).toBe(3)
      expect(written.curationLog![0].known).toBe(request.known)
      expect(written.curationLog![0].knownSummary).toBe(request.knownSummary)
      expect(written.curationLog![0].replacedSession?.title).toBe('Functions and Modules')

      // The HTML was re-rendered (the old title is gone, the new one is present).
      const html = await readFile(join(planDir, 'index.html'), 'utf8')
      expect(html).toContain('Functions and Modules — revised')
      expect(html).not.toContain('Functions and Modules<')
    } finally {
      await rm(baseDir, { recursive: true, force: true })
    }
  })

  it('Scenario 6: swap by reason fetches only the swapped URL and keeps other materials\' checkedAt intact', async () => {
    const baseDir = await mkdtemp(join(tmpdir(), 'study-plan-curate-swap-'))
    try {
      // Build a small fixture plan with one material per session, all
      // preferred, so the swap path can verify with a status check only.
      const plan = clonePlan(fixturePlan)
      const session3 = plan.sessions.find((s) => s.number === 3)!
      const targetMaterial = session3.materials[0]
      const generated = await generatePlan(plan, baseDir, {
        fetch: baseFetch,
        searchReplacement: noReplacement,
        now: fixedClock,
      })
      const planDir = generated.planDir
      // Read what generatePlan wrote and stamp every non-target session with
      // a stale timestamp so any unintended refresh is visible.
      const onDisk = JSON.parse(await readFile(join(planDir, 'plan.json'), 'utf8')) as PlanData
      for (const session of onDisk.sessions) {
        for (const material of session.materials) {
          material.verification = {
            status: 'verified-by-status',
            checkedAt: '2025-01-01T00:00:00.000Z',
          }
        }
      }
      await writeFile(join(planDir, 'plan.json'), JSON.stringify(onDisk, null, 2), 'utf8')
      // Pick another session's URL to keep the per-publisher count healthy.
      const replacementMaterial: Material = {
        title: 'Different module article',
        url: 'https://example.com/swap-target',
        sourceType: 'preferred',
        estimatedDuration: 10,
        paid: false,
        verification: { status: 'verified-by-status', checkedAt: null },
      }
      const seen: string[] = []
      const fetchImpl: FetchLike = async (url) => {
        seen.push(url)
        return okResponse()
      }

      const request: SwapMaterialRequest = {
        intent: 'swap-material',
        at: '2026-02-10T00:00:00.000Z',
        sessionNumber: 3,
        materialUrl: targetMaterial.url,
        by: { reason: 'too dense' },
        replacement: replacementMaterial,
      }
      const result = await curatePlanDir(planDir, request, {
        fetch: fetchImpl,
        searchReplacement: noReplacement,
        now: laterClock,
        anchorUrls: [],
      })

      expect(result.outcome.status).toBe('applied')
      if (result.outcome.status !== 'applied') return

      // Only the replacement URL was fetched.
      expect(seen).toEqual([replacementMaterial.url])

      const written = JSON.parse(await readFile(join(planDir, 'plan.json'), 'utf8')) as PlanData
      const swappedSession = written.sessions.find((s) => s.number === 3)!
      expect(swappedSession.materials[0].url).toBe(replacementMaterial.url)
      expect(swappedSession.materials[0].title).toBe(replacementMaterial.title)
      expect(written.curationLog).toHaveLength(1)
      expect(written.curationLog![0].intent).toBe('swap-material')
      expect(written.curationLog![0].reason).toBe('too dense')
      // Other sessions' verification timestamps are NOT refreshed to laterClock.
      for (const session of written.sessions) {
        if (session.number === 3) continue
        for (const material of session.materials) {
          expect(material.verification.checkedAt).toBe('2025-01-01T00:00:00.000Z')
        }
      }
    } finally {
      await rm(baseDir, { recursive: true, force: true })
    }
  })

  it('Scenario 10: swap by URL — page covers the concept, applied with verified-by-content', async () => {
    const baseDir = await mkdtemp(join(tmpdir(), 'study-plan-curate-swapurl-'))
    try {
      const plan = clonePlan(fixturePlan)
      const session3 = plan.sessions.find((s) => s.number === 3)!
      const targetMaterial = session3.materials[0]
      const generated = await generatePlan(plan, baseDir, {
        fetch: baseFetch,
        searchReplacement: noReplacement,
        now: fixedClock,
      })
      const planDir = generated.planDir
      const learnerUrl = 'https://learner.example.com/article-on-modules'
      const replacementMaterial: Material = {
        title: 'Learner article',
        url: learnerUrl,
        sourceType: 'off-list',
        estimatedDuration: 15,
        paid: false,
        verification: { status: 'verified-by-status', checkedAt: null },
      }
      const request: SwapMaterialRequest = {
        intent: 'swap-material',
        at: '2026-02-10T00:00:00.000Z',
        sessionNumber: 3,
        materialUrl: targetMaterial.url,
        by: { url: learnerUrl },
        replacement: replacementMaterial,
      }
      const fetchImpl: FetchLike = async (url) => {
        if (url === learnerUrl) {
          // Body covers the supplied title so the content check passes.
          return okResponse('An article about Python modules and packaging for learners.')
        }
        return okResponse()
      }
      const result = await curatePlanDir(planDir, request, {
        fetch: fetchImpl,
        searchReplacement: noReplacement,
        now: laterClock,
        anchorUrls: [],
      })

      expect(result.outcome.status).toBe('applied')
      if (result.outcome.status !== 'applied') return

      const written = JSON.parse(await readFile(join(planDir, 'plan.json'), 'utf8')) as PlanData
      const swappedSession = written.sessions.find((s) => s.number === 3)!
      expect(swappedSession.materials[0].url).toBe(learnerUrl)
      expect(swappedSession.materials[0].verification.status).toBe('verified-by-content')
      expect(written.curationLog).toHaveLength(1)
      expect(written.curationLog![0].suppliedUrl).toBe(learnerUrl)
    } finally {
      await rm(baseDir, { recursive: true, force: true })
    }
  })

  it('Scenario 11: swap by URL — page 404s, searchReplacement is NOT consulted, plan on disk is unchanged', async () => {
    const baseDir = await mkdtemp(join(tmpdir(), 'study-plan-curate-swapfail-'))
    try {
      const plan = clonePlan(fixturePlan)
      const session3 = plan.sessions.find((s) => s.number === 3)!
      const targetMaterial = session3.materials[0]
      const generated = await generatePlan(plan, baseDir, {
        fetch: baseFetch,
        searchReplacement: noReplacement,
        now: fixedClock,
      })
      const planDir = generated.planDir
      const planBefore = await readFile(join(planDir, 'plan.json'), 'utf8')
      const htmlBefore = await readFile(join(planDir, 'index.html'), 'utf8')

      const learnerUrl = 'https://learner.example.com/dead-article'
      const replacementMaterial: Material = {
        title: 'Learner article',
        url: learnerUrl,
        sourceType: 'off-list',
        estimatedDuration: 15,
        paid: false,
        verification: { status: 'verified-by-status', checkedAt: null },
      }
      const request: SwapMaterialRequest = {
        intent: 'swap-material',
        at: '2026-02-10T00:00:00.000Z',
        sessionNumber: 3,
        materialUrl: targetMaterial.url,
        by: { url: learnerUrl },
        replacement: replacementMaterial,
      }

      let replacementCalls = 0
      const fetchImpl: FetchLike = async (url) => {
        if (url === learnerUrl) return notFoundResponse()
        return okResponse()
      }
      const searchReplacement = async () => {
        replacementCalls += 1
        throw new Error('searchReplacement must not be called')
      }

      const result = await curatePlanDir(planDir, request, {
        fetch: fetchImpl,
        searchReplacement,
        now: laterClock,
        anchorUrls: [],
      })

      expect(result.outcome.status).toBe('refused')
      if (result.outcome.status !== 'refused') return
      expect(result.outcome.stage).toBe('verification')
      expect(result.outcome.reasons.some((r) => r.includes(learnerUrl))).toBe(true)
      expect(replacementCalls).toBe(0)

      // Plan on disk is byte-identical to before.
      const planAfter = await readFile(join(planDir, 'plan.json'), 'utf8')
      const htmlAfter = await readFile(join(planDir, 'index.html'), 'utf8')
      expect(planAfter).toBe(planBefore)
      expect(htmlAfter).toBe(htmlBefore)
    } finally {
      await rm(baseDir, { recursive: true, force: true })
    }
  })

  it('Scenario 14: redo-session via curatePlanDir produces the same plan and log record as redoSession', async () => {
    const baseDir = await mkdtemp(join(tmpdir(), 'study-plan-curate-redo-'))
    try {
      const plan = clonePlan(fixturePlan)
      const generated = await generatePlan(plan, baseDir, {
        fetch: baseFetch,
        searchReplacement: noReplacement,
        now: fixedClock,
      })
      const planDir = generated.planDir
      const replacement = replacementSession3()

      const request: RedoSessionRequest = {
        intent: 'redo-session',
        at: '2026-02-10T00:00:00.000Z',
        sessionNumber: 3,
        reason: 'artifact was too vague',
        replacement,
      }
      const result = await curatePlanDir(planDir, request, {
        fetch: baseFetch,
        searchReplacement: noReplacement,
        now: laterClock,
      })

      expect(result.outcome.status).toBe('applied')
      if (result.outcome.status !== 'applied') return
      const applied = result.outcome.plan
      expect(applied.sessions.find((s) => s.number === 3)!.title).toBe(replacement.title)
      expect(applied.curationLog).toHaveLength(1)
      expect(applied.curationLog![0]).toMatchObject({
        intent: 'redo-session',
        sessionNumber: 3,
        reason: 'artifact was too vague',
      })

      // And redoSession, called on the same directory at a later at, yields
      // a log with two records (the second one being redo's).
      const second = await redoSession(planDir, 3, replacement, {
        fetch: baseFetch,
        searchReplacement: noReplacement,
        now: () => '2026-02-20T00:00:00.000Z',
      })
      expect(second.plan.curationLog).toHaveLength(2)
      expect(second.plan.curationLog![1].intent).toBe('redo-session')
    } finally {
      await rm(baseDir, { recursive: true, force: true })
    }
  })

  it('request-stage refusal (paid replacement) leaves the directory byte-identical', async () => {
    const baseDir = await mkdtemp(join(tmpdir(), 'study-plan-curate-refuse-'))
    try {
      const plan = clonePlan(fixturePlan)
      const generated = await generatePlan(plan, baseDir, {
        fetch: baseFetch,
        searchReplacement: noReplacement,
        now: fixedClock,
      })
      const planDir = generated.planDir
      const planBefore = await readFile(join(planDir, 'plan.json'), 'utf8')
      const htmlBefore = await readFile(join(planDir, 'index.html'), 'utf8')

      const session3 = plan.sessions.find((s) => s.number === 3)!
      const targetMaterial = session3.materials[0]
      const replacementMaterial: Material = {
        title: 'Paid alternative',
        url: 'https://example.com/paid',
        sourceType: 'preferred',
        estimatedDuration: 20,
        paid: true,
        price: 50,
        verification: { status: 'verified-by-status', checkedAt: null },
      }
      const request: SwapMaterialRequest = {
        intent: 'swap-material',
        at: '2026-02-10T00:00:00.000Z',
        sessionNumber: 3,
        materialUrl: targetMaterial.url,
        by: { reason: 'X' },
        replacement: replacementMaterial,
      }
      const result = await curatePlanDir(planDir, request, {
        fetch: baseFetch,
        searchReplacement: noReplacement,
        now: laterClock,
      })

      expect(result.outcome.status).toBe('refused')
      if (result.outcome.status !== 'refused') return
      expect(result.outcome.stage).toBe('request')
      expect(result.outcome.reasons.some((r) => /paid/i.test(r))).toBe(true)

      const planAfter = await readFile(join(planDir, 'plan.json'), 'utf8')
      const htmlAfter = await readFile(join(planDir, 'index.html'), 'utf8')
      expect(planAfter).toBe(planBefore)
      expect(htmlAfter).toBe(htmlBefore)
    } finally {
      await rm(baseDir, { recursive: true, force: true })
    }
  })

  it('merged-plan-stage refusal (replacement drops the plan below the CAFE floor) leaves the directory byte-identical', async () => {
    const baseDir = await mkdtemp(join(tmpdir(), 'study-plan-curate-floor-'))
    try {
      const generated = await generatePlan(fixturePlan, baseDir, {
        fetch: baseFetch,
        searchReplacement: noReplacement,
        now: fixedClock,
      })
      const planDir = generated.planDir
      // The on-disk plan must still pass input validation. Pick a shared
      // unit and rewrite the plan so the floor survives only because of
      // session 3 — dropping 3 then misses the floor at the merged-plan
      // stage, because the replacement carries only an unrelated unit.
      const onDisk = JSON.parse(await readFile(join(planDir, 'plan.json'), 'utf8')) as PlanData
      const sharedUnit = 'unit-floor-anchor'
      for (const session of onDisk.sessions) {
        session.highFrequencyUnits = [`unique-${session.number}`]
      }
      // session 3 and session 1 both carry the shared unit: floor holds
      // (a unit appearing in 2 sessions is not yet a repeat of 3, but the
      // fixture has other repeats; this step strips those other repeats
      // and keeps only the one shared unit).
      // Strategy: clear every other session's units to a unique one, and
      // have sessions 1 and 3 share the shared unit.
      for (const session of onDisk.sessions) {
        session.highFrequencyUnits = [`unique-${session.number}`]
      }
      onDisk.sessions[0].highFrequencyUnits = [sharedUnit]
      onDisk.sessions[2].highFrequencyUnits = [sharedUnit]
      // sessions 3 and 1 share the unit (two sessions — still below the
      // MIN_REPEATED_UNIT_SESSIONS floor of 3). Need a third session to
      // carry it for the input plan to validate.
      onDisk.sessions[4].highFrequencyUnits = [sharedUnit]
      await writeFile(join(planDir, 'plan.json'), JSON.stringify(onDisk, null, 2), 'utf8')
      const planBefore = await readFile(join(planDir, 'plan.json'), 'utf8')
      const htmlBefore = await readFile(join(planDir, 'index.html'), 'utf8')

      // The replacement carries only an unrelated unit, so after splicing
      // it in, only sessions 1 and 5 carry the shared unit — still below
      // the 3-session floor.
      const replacement = replacementSession3()
      replacement.highFrequencyUnits = ['unique-replacement']

      const request: DropAsKnownRequest = {
        intent: 'drop-as-known',
        at: '2026-02-10T00:00:00.000Z',
        sessionNumber: 3,
        known: 'X',
        knownSummary: 'Y',
        replacement,
      }

      const result = await curatePlanDir(planDir, request, {
        fetch: baseFetch,
        searchReplacement: noReplacement,
        now: laterClock,
      })

      expect(result.outcome.status).toBe('refused')
      if (result.outcome.status !== 'refused') return
      expect(result.outcome.stage).toBe('merged-plan')
      expect(result.outcome.reasons.some((r) => /unit|repetition|floor/i.test(r))).toBe(true)

      const planAfter = await readFile(join(planDir, 'plan.json'), 'utf8')
      const htmlAfter = await readFile(join(planDir, 'index.html'), 'utf8')
      expect(planAfter).toBe(planBefore)
      expect(htmlAfter).toBe(htmlBefore)
    } finally {
      await rm(baseDir, { recursive: true, force: true })
    }
  })

  it('writes a page whose renderer output for session 3 carries the replacement artifact', async () => {
    const baseDir = await mkdtemp(join(tmpdir(), 'study-plan-curate-render-'))
    try {
      const plan = clonePlan(fixturePlan)
      const generated = await generatePlan(plan, baseDir, {
        fetch: baseFetch,
        searchReplacement: noReplacement,
        now: fixedClock,
      })
      const planDir = generated.planDir
      const replacement = replacementSession3()
      const oldTitle = plan.sessions.find((s) => s.number === 3)!.title

      const request: RedoSessionRequest = {
        intent: 'redo-session',
        at: '2026-02-10T00:00:00.000Z',
        sessionNumber: 3,
        replacement,
      }
      await curatePlanDir(planDir, request, {
        fetch: baseFetch,
        searchReplacement: noReplacement,
        now: laterClock,
      })

      const html = await readFile(join(planDir, 'index.html'), 'utf8')
      const doc = new JSDOM(html).window.document
      const session3 = doc.querySelector('.session[data-session="3"]')!
      expect(session3.querySelector('.session-title')?.textContent).toBe(replacement.title)
      expect(session3.querySelector('.session-artifact')?.textContent?.trim()).toBe(
        replacement.artifactOneLiner
      )
      expect(session3.querySelector('.self-check')?.textContent ?? '').toContain(replacement.selfCheck)
      expect(session3.querySelector('.session-title')?.textContent).not.toBe(oldTitle)
    } finally {
      await rm(baseDir, { recursive: true, force: true })
    }
  })
})
