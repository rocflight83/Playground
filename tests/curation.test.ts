import type { Material, PlanData, Session } from '../src/plan-types'
import { fixturePlan } from './fixtures/plan-fixture'
import { applyCuration, CurationRefusedError, type DropAsKnownRequest, type RedoSessionRequest, type SwapMaterialRequest } from '../src/curation'

function clonePlan(plan: PlanData): PlanData {
  return JSON.parse(JSON.stringify(plan)) as PlanData
}

function deepFreezePlan(plan: PlanData): PlanData {
  return Object.freeze(JSON.parse(JSON.stringify(plan))) as PlanData
}

/** Build a replacement session whose fields fit the fixture plan's frame. */
function replacementSessionFor(plan: PlanData, number: number): Session {
  const original = plan.sessions.find((s) => s.number === number)!
  return {
    number,
    title: `Replacement ${number}`,
    artifactOneLiner: 'A different artifact for the same target',
    materials: [
      {
        title: 'Replacement material',
        url: 'https://example.com/replacement',
        sourceType: 'preferred',
        estimatedDuration: 15,
        paid: false,
        verification: { status: 'verified-by-status', checkedAt: null },
      },
    ],
    selfCheck: 'Can I do the new artifact?',
    estimatedTime: original.estimatedTime,
    highFrequencyUnits: original.highFrequencyUnits,
  }
}

describe('applyCuration — drop-as-known', () => {
  it('Scenario 1: drops session 3, advances currentLevel, leaves 1-2 and 4-14 byte-identical, appends one log record', () => {
    const plan = clonePlan(fixturePlan)
    const replacement = replacementSessionFor(plan, 3)
    replacement.highFrequencyUnits = ['argument parsing', 'data structures'] // add a high-freq unit so the floor holds
    const request: DropAsKnownRequest = {
      intent: 'drop-as-known',
      at: '2026-02-10T00:00:00.000Z',
      sessionNumber: 3,
      known: 'I already write functions and modules fluently',
      knownSummary: 'Functions, modules, packages are second nature; treat them as known.',
      replacement,
    }

    const next = applyCuration(plan, request)

    // Session 3 is the replacement.
    const session3 = next.sessions.find((s) => s.number === 3)!
    expect(session3.title).toBe(replacement.title)
    expect(session3.artifactOneLiner).toBe(replacement.artifactOneLiner)
    // Other sessions ride through exactly.
    const othersBefore = plan.sessions.filter((s) => s.number !== 3)
    const othersAfter = next.sessions.filter((s) => s.number !== 3)
    expect(othersAfter).toEqual(othersBefore)
    // currentLevel ends with the marker and the summary.
    expect(next.meta.currentLevel).toBe(
      plan.meta.currentLevel + '\n\nAlready known: Functions, modules, packages are second nature; treat them as known.'
    )
    // Phases untouched.
    expect(next.phases).toEqual(plan.phases)
    // Log carries one record with replacedSession and the original 3.
    expect(next.curationLog).toHaveLength(1)
    const record = next.curationLog![0]
    expect(record.intent).toBe('drop-as-known')
    expect(record.sessionNumber).toBe(3)
    expect(record.at).toBe(request.at)
    expect(record.known).toBe(request.known)
    expect(record.knownSummary).toBe(request.knownSummary)
    expect(record.replacedSession).toEqual(plan.sessions.find((s) => s.number === 3))
    expect(record.replacedSession).not.toBe(plan.sessions.find((s) => s.number === 3)) // deep copy
  })

  it('Scenario 2: refuses drop on a consolidation slot (6) at stage request, without mutating the plan', () => {
    const plan = clonePlan(fixturePlan)
    const replacement = replacementSessionFor(plan, 6)
    replacement.highFrequencyUnits = ['argument parsing', 'data structures', 'file I/O']
    const request: DropAsKnownRequest = {
      intent: 'drop-as-known',
      at: '2026-02-10T00:00:00.000Z',
      sessionNumber: 6,
      known: 'I already know the fundamentals',
      knownSummary: 'The fundamentals are well in hand.',
      replacement,
    }

    const before = JSON.stringify(plan)
    expect(() => applyCuration(plan, request)).toThrowError(CurationRefusedError)
    try {
      applyCuration(plan, request)
    } catch (err) {
      expect(err).toBeInstanceOf(CurationRefusedError)
      const e = err as CurationRefusedError
      expect(e.stage).toBe('request')
      expect(e.reasons.some((r) => /consolidation/i.test(r))).toBe(true)
      expect(e.reasons.some((r) => /6 and 11|6\b.*11\b/.test(r))).toBe(true)
    }
    expect(JSON.stringify(plan)).toBe(before)
  })

  it('Scenario 3: drops session 13; phase membership for 13 is unchanged', () => {
    const plan = clonePlan(fixturePlan)
    const phaseContaining13 = plan.phases.find((p) => p.sessions.includes(13))!
    const replacement = replacementSessionFor(plan, 13)
    replacement.highFrequencyUnits = ['error handling', 'testing', 'packaging'] // keep the floor
    const request: DropAsKnownRequest = {
      intent: 'drop-as-known',
      at: '2026-02-10T00:00:00.000Z',
      sessionNumber: 13,
      known: 'Error handling is familiar',
      knownSummary: 'Error handling and logging are familiar territory.',
      replacement,
    }

    const next = applyCuration(plan, request)
    const newPhase = next.phases.find((p) => p.title === phaseContaining13.title)!
    expect(newPhase.sessions).toEqual(phaseContaining13.sessions)
    expect(newPhase.sessions).toContain(13)
    expect(next.sessions.find((s) => s.number === 13)).toEqual(replacement)
  })

  it('Scenario 4: dropping twice (3, then 8) appends two records and chains currentLevel entries', () => {
    const plan = clonePlan(fixturePlan)
    const drop3: DropAsKnownRequest = {
      intent: 'drop-as-known',
      at: '2026-02-10T00:00:00.000Z',
      sessionNumber: 3,
      known: 'Functions',
      knownSummary: 'Functions are known.',
      replacement: (() => {
        const r = replacementSessionFor(plan, 3)
        r.highFrequencyUnits = ['argument parsing', 'data structures']
        return r
      })(),
    }
    const after3 = applyCuration(plan, drop3)
    const drop8: DropAsKnownRequest = {
      intent: 'drop-as-known',
      at: '2026-02-11T00:00:00.000Z',
      sessionNumber: 8,
      known: 'Packaging basics',
      knownSummary: 'Packaging basics are familiar.',
      replacement: (() => {
        const r = replacementSessionFor(after3, 8)
        r.highFrequencyUnits = ['packaging', 'virtual environments']
        return r
      })(),
    }
    const after4 = applyCuration(after3, drop8)
    expect(after4.curationLog).toHaveLength(2)
    expect(after4.curationLog![0].sessionNumber).toBe(3)
    expect(after4.curationLog![1].sessionNumber).toBe(8)
    expect(after4.meta.currentLevel).toContain('Already known: Functions are known.')
    expect(after4.meta.currentLevel).toContain('Already known: Packaging basics are familiar.')
    // Order: first drop first, second drop second.
    const firstIdx = after4.meta.currentLevel.indexOf('Already known: Functions are known.')
    const secondIdx = after4.meta.currentLevel.indexOf('Already known: Packaging basics are familiar.')
    expect(firstIdx).toBeLessThan(secondIdx)
  })

  it('Scenario 5: refuses at merged-plan when the drop leaves the plan below the CAFE repetition floor', () => {
    const plan = clonePlan(fixturePlan)
    // Replace every other session's highFrequencyUnits with one-offs so the
    // floor only survives on session 3's drilled units. Dropping 3 then drops
    // the plan below the floor.
    for (const session of plan.sessions) {
      if (session.number === 3) continue
      session.highFrequencyUnits = [`unique-${session.number}`]
    }
    const replacement = replacementSessionFor(plan, 3)
    replacement.highFrequencyUnits = [`unique-replacement`]
    const request: DropAsKnownRequest = {
      intent: 'drop-as-known',
      at: '2026-02-10T00:00:00.000Z',
      sessionNumber: 3,
      known: 'X',
      knownSummary: 'Y',
      replacement,
    }

    try {
      applyCuration(plan, request)
      throw new Error('expected throw')
    } catch (err) {
      expect(err).toBeInstanceOf(CurationRefusedError)
      const e = err as CurationRefusedError
      expect(e.stage).toBe('merged-plan')
      expect(e.reasons.some((r) => /unit/i.test(r))).toBe(true)
    }
  })

  it('refuses drop-as-known when knownSummary is empty', () => {
    const plan = clonePlan(fixturePlan)
    const replacement = replacementSessionFor(plan, 3)
    const request: DropAsKnownRequest = {
      intent: 'drop-as-known',
      at: '2026-02-10T00:00:00.000Z',
      sessionNumber: 3,
      known: 'X',
      knownSummary: '',
      replacement,
    }
    try {
      applyCuration(plan, request)
      throw new Error('expected throw')
    } catch (err) {
      expect(err).toBeInstanceOf(CurationRefusedError)
      const e = err as CurationRefusedError
      expect(e.stage).toBe('request')
      expect(e.reasons.some((r) => /knownSummary/i.test(r))).toBe(true)
    }
  })

  it('refuses drop-as-known when replacement.number does not match sessionNumber', () => {
    const plan = clonePlan(fixturePlan)
    const replacement = replacementSessionFor(plan, 3)
    replacement.number = 4
    const request: DropAsKnownRequest = {
      intent: 'drop-as-known',
      at: '2026-02-10T00:00:00.000Z',
      sessionNumber: 3,
      known: 'X',
      knownSummary: 'Y',
      replacement,
    }
    try {
      applyCuration(plan, request)
      throw new Error('expected throw')
    } catch (err) {
      expect(err).toBeInstanceOf(CurationRefusedError)
      const e = err as CurationRefusedError
      expect(e.stage).toBe('request')
      expect(e.reasons.some((r) => /number/i.test(r))).toBe(true)
    }
  })
})

describe('applyCuration — swap-material', () => {
  it('Scenario 7: swapping the only free material succeeds (replacement is free); session keeps its other fields', () => {
    const plan = clonePlan(fixturePlan)
    // Session 3 has one material in the fixture.
    const session3 = plan.sessions.find((s) => s.number === 3)!
    const targetUrl = session3.materials[0].url
    const replacementMaterial: Material = {
      title: 'Different module material',
      url: 'https://example.com/different-module',
      sourceType: 'preferred',
      estimatedDuration: 10,
      paid: false,
      verification: { status: 'verified-by-status', checkedAt: null },
    }
    const request: SwapMaterialRequest = {
      intent: 'swap-material',
      at: '2026-02-10T00:00:00.000Z',
      sessionNumber: 3,
      materialUrl: targetUrl,
      by: { reason: 'wrong depth' },
      replacement: replacementMaterial,
    }
    const next = applyCuration(plan, request)
    const newSession3 = next.sessions.find((s) => s.number === 3)!
    expect(newSession3.materials).toHaveLength(session3.materials.length)
    expect(newSession3.materials[0]).toEqual(replacementMaterial)
    // Other fields preserved.
    expect(newSession3.title).toBe(session3.title)
    expect(newSession3.artifactOneLiner).toBe(session3.artifactOneLiner)
    expect(newSession3.selfCheck).toBe(session3.selfCheck)
    expect(newSession3.estimatedTime).toBe(session3.estimatedTime)
    expect(newSession3.highFrequencyUnits).toEqual(session3.highFrequencyUnits)
    expect(next.curationLog).toHaveLength(1)
    expect(next.curationLog![0].intent).toBe('swap-material')
    expect(next.curationLog![0].sessionNumber).toBe(3)
    expect(next.curationLog![0].reason).toBe('wrong depth')
    expect(next.curationLog![0].replacedMaterial).toEqual(session3.materials[0])
  })

  it('Scenario 8: swapping the paid material out is allowed (plan ends with zero paid materials)', () => {
    const plan = clonePlan(fixturePlan)
    const session2 = plan.sessions.find((s) => s.number === 2)!
    const paid = session2.materials.find((m) => m.paid)!
    const replacementMaterial: Material = {
      title: 'Free alternative',
      url: 'https://example.com/free-alternative',
      sourceType: 'preferred',
      estimatedDuration: paid.estimatedDuration,
      paid: false,
      verification: { status: 'verified-by-status', checkedAt: null },
    }
    const request: SwapMaterialRequest = {
      intent: 'swap-material',
      at: '2026-02-10T00:00:00.000Z',
      sessionNumber: 2,
      materialUrl: paid.url,
      by: { reason: 'cheaper alternative' },
      replacement: replacementMaterial,
    }
    const next = applyCuration(plan, request)
    expect(next.sessions.find((s) => s.number === 2)!.materials.find((m) => m.url === paid.url)).toBeUndefined()
    expect(next.sessions.find((s) => s.number === 2)!.materials.some((m) => m.paid)).toBe(false)
  })

  it('Scenario 9: refuses a paid replacement at stage request', () => {
    const plan = clonePlan(fixturePlan)
    const session3 = plan.sessions.find((s) => s.number === 3)!
    const targetUrl = session3.materials[0].url
    const replacementMaterial: Material = {
      title: 'Paid replacement',
      url: 'https://example.com/paid-replacement',
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
      materialUrl: targetUrl,
      by: { reason: 'X' },
      replacement: replacementMaterial,
    }
    try {
      applyCuration(plan, request)
      throw new Error('expected throw')
    } catch (err) {
      expect(err).toBeInstanceOf(CurationRefusedError)
      const e = err as CurationRefusedError
      expect(e.stage).toBe('request')
      expect(e.reasons.some((r) => /paid/i.test(r))).toBe(true)
    }
  })

  it('Scenario 12: refuses an over-budget replacement at stage request', () => {
    const plan = clonePlan(fixturePlan)
    const session4 = plan.sessions.find((s) => s.number === 4)!
    const targetUrl = session4.materials[0].url
    // session 4 estimatedTime=40, single material duration=30, so budget remaining=10
    const replacementMaterial: Material = {
      title: 'Long replacement',
      url: 'https://example.com/long',
      sourceType: 'preferred',
      estimatedDuration: 100,
      paid: false,
      verification: { status: 'verified-by-status', checkedAt: null },
    }
    const request: SwapMaterialRequest = {
      intent: 'swap-material',
      at: '2026-02-10T00:00:00.000Z',
      sessionNumber: 4,
      materialUrl: targetUrl,
      by: { reason: 'X' },
      replacement: replacementMaterial,
    }
    try {
      applyCuration(plan, request)
      throw new Error('expected throw')
    } catch (err) {
      expect(err).toBeInstanceOf(CurationRefusedError)
      const e = err as CurationRefusedError
      expect(e.stage).toBe('request')
      expect(e.reasons.some((r) => /budget|minute|10|100/i.test(r))).toBe(true)
    }
  })

  it('Scenario 13a: refuses when the material URL is not in the session', () => {
    const plan = clonePlan(fixturePlan)
    const request: SwapMaterialRequest = {
      intent: 'swap-material',
      at: '2026-02-10T00:00:00.000Z',
      sessionNumber: 3,
      materialUrl: 'https://example.com/not-in-session',
      by: { reason: 'X' },
      replacement: {
        title: 'X',
        url: 'https://example.com/x',
        sourceType: 'preferred',
        estimatedDuration: 5,
        paid: false,
        verification: { status: 'verified-by-status', checkedAt: null },
      },
    }
    try {
      applyCuration(plan, request)
      throw new Error('expected throw')
    } catch (err) {
      expect(err).toBeInstanceOf(CurationRefusedError)
      const e = err as CurationRefusedError
      expect(e.stage).toBe('request')
      expect(e.reasons.some((r) => /not found|not in/i.test(r))).toBe(true)
    }
  })

  it('Scenario 13b: refuses when the material URL appears more than once in the session', () => {
    const plan = clonePlan(fixturePlan)
    const session3 = plan.sessions.find((s) => s.number === 3)!
    const dupUrl = 'https://example.com/duplicate'
    // Mutate both materials in place to share the same URL — true duplicates.
    session3.materials[0] = { ...session3.materials[0], url: dupUrl }
    session3.materials.push({
      title: 'Different title, same URL',
      url: dupUrl,
      sourceType: 'off-list',
      estimatedDuration: 5,
      paid: false,
      verification: { status: 'verified-by-status', checkedAt: null },
    })
    const request: SwapMaterialRequest = {
      intent: 'swap-material',
      at: '2026-02-10T00:00:00.000Z',
      sessionNumber: 3,
      materialUrl: dupUrl,
      by: { reason: 'X' },
      replacement: {
        title: 'X',
        url: 'https://example.com/x',
        sourceType: 'preferred',
        estimatedDuration: 5,
        paid: false,
        verification: { status: 'verified-by-status', checkedAt: null },
      },
    }
    try {
      applyCuration(plan, request)
      throw new Error('expected throw')
    } catch (err) {
      expect(err).toBeInstanceOf(CurationRefusedError)
      const e = err as CurationRefusedError
      expect(e.stage).toBe('request')
      expect(e.reasons.some((r) => /twice|2 times|multiple|duplicate/i.test(r))).toBe(true)
    }
  })

  it('refuses a url-path swap when replacement.url does not equal by.url', () => {
    const plan = clonePlan(fixturePlan)
    const session3 = plan.sessions.find((s) => s.number === 3)!
    const targetUrl = session3.materials[0].url
    const replacementMaterial: Material = {
      title: 'X',
      url: 'https://example.com/different-url',
      sourceType: 'preferred',
      estimatedDuration: 10,
      paid: false,
      verification: { status: 'verified-by-status', checkedAt: null },
    }
    const request: SwapMaterialRequest = {
      intent: 'swap-material',
      at: '2026-02-10T00:00:00.000Z',
      sessionNumber: 3,
      materialUrl: targetUrl,
      by: { url: 'https://example.com/learner-url' },
      replacement: replacementMaterial,
    }
    try {
      applyCuration(plan, request)
      throw new Error('expected throw')
    } catch (err) {
      expect(err).toBeInstanceOf(CurationRefusedError)
      const e = err as CurationRefusedError
      expect(e.stage).toBe('request')
      expect(e.reasons.some((r) => /url/i.test(r))).toBe(true)
    }
  })

  it('records suppliedUrl on the url-path swap', () => {
    const plan = clonePlan(fixturePlan)
    const session3 = plan.sessions.find((s) => s.number === 3)!
    const targetUrl = session3.materials[0].url
    const learnerUrl = 'https://learner.example.com/article'
    const replacementMaterial: Material = {
      title: 'Learner article',
      url: learnerUrl,
      sourceType: 'off-list',
      estimatedDuration: 10,
      paid: false,
      verification: { status: 'verified-by-status', checkedAt: null },
    }
    const request: SwapMaterialRequest = {
      intent: 'swap-material',
      at: '2026-02-10T00:00:00.000Z',
      sessionNumber: 3,
      materialUrl: targetUrl,
      by: { url: learnerUrl },
      replacement: replacementMaterial,
    }
    const next = applyCuration(plan, request)
    expect(next.curationLog![0].suppliedUrl).toBe(learnerUrl)
  })
})

describe('applyCuration — redo-session', () => {
  it('Scenario 14 (shell side): replaces the session in place, leaves currentLevel untouched, records reason', () => {
    const plan = clonePlan(fixturePlan)
    const replacement = replacementSessionFor(plan, 3)
    replacement.highFrequencyUnits = ['module structure', 'packaging'] // keep the floor
    const request: RedoSessionRequest = {
      intent: 'redo-session',
      at: '2026-02-10T00:00:00.000Z',
      sessionNumber: 3,
      reason: 'artifact was too vague',
      replacement,
    }
    const next = applyCuration(plan, request)
    expect(next.sessions.find((s) => s.number === 3)).toEqual(replacement)
    expect(next.meta.currentLevel).toBe(plan.meta.currentLevel)
    expect(next.curationLog).toHaveLength(1)
    expect(next.curationLog![0]).toMatchObject({
      intent: 'redo-session',
      sessionNumber: 3,
      reason: 'artifact was too vague',
      replacedSession: plan.sessions.find((s) => s.number === 3),
    })
  })

  it('refuses a redo whose replacement.number does not match sessionNumber', () => {
    const plan = clonePlan(fixturePlan)
    const replacement = replacementSessionFor(plan, 3)
    replacement.number = 4
    const request: RedoSessionRequest = {
      intent: 'redo-session',
      at: '2026-02-10T00:00:00.000Z',
      sessionNumber: 3,
      replacement,
    }
    try {
      applyCuration(plan, request)
      throw new Error('expected throw')
    } catch (err) {
      expect(err).toBeInstanceOf(CurationRefusedError)
      const e = err as CurationRefusedError
      expect(e.stage).toBe('request')
      expect(e.reasons.some((r) => /number/i.test(r))).toBe(true)
    }
  })
})

describe('applyCuration — purity and determinism', () => {
  it('Scenario 15: pure — same plan and request yield a deep-equal result; input is not mutated', () => {
    const plan = clonePlan(fixturePlan)
    const frozen = deepFreezePlan(plan)
    const replacement = replacementSessionFor(plan, 3)
    replacement.highFrequencyUnits = ['module structure', 'packaging']
    const request: DropAsKnownRequest = {
      intent: 'drop-as-known',
      at: '2026-02-10T00:00:00.000Z',
      sessionNumber: 3,
      known: 'X',
      knownSummary: 'Y',
      replacement,
    }
    const a = applyCuration(frozen, request)
    const b = applyCuration(frozen, request)
    expect(a).toEqual(b)
    // The original is untouched.
    expect(JSON.stringify(frozen)).toBe(JSON.stringify(plan))
  })

  it('preserves the original session verbatim in the log', () => {
    const plan = clonePlan(fixturePlan)
    const replacement = replacementSessionFor(plan, 3)
    replacement.highFrequencyUnits = ['module structure', 'packaging']
    const request: DropAsKnownRequest = {
      intent: 'drop-as-known',
      at: '2026-02-10T00:00:00.000Z',
      sessionNumber: 3,
      known: 'X',
      knownSummary: 'Y',
      replacement,
    }
    const next = applyCuration(plan, request)
    // The log carries the original session's exact parsed shape.
    expect(next.curationLog![0].replacedSession).toEqual(plan.sessions.find((s) => s.number === 3))
  })

  it('keeps a pre-existing curationLog and appends to it', () => {
    const plan = clonePlan(fixturePlan)
    plan.curationLog = [
      {
        intent: 'redo-session',
        sessionNumber: 4,
        at: '2026-02-09T00:00:00.000Z',
        replacedSession: plan.sessions.find((s) => s.number === 4)!,
      },
    ]
    const replacement = replacementSessionFor(plan, 3)
    replacement.highFrequencyUnits = ['module structure', 'packaging']
    const request: DropAsKnownRequest = {
      intent: 'drop-as-known',
      at: '2026-02-10T00:00:00.000Z',
      sessionNumber: 3,
      known: 'X',
      knownSummary: 'Y',
      replacement,
    }
    const next = applyCuration(plan, request)
    expect(next.curationLog).toHaveLength(2)
    expect(next.curationLog![0]).toEqual(plan.curationLog![0])
    expect(next.curationLog![1].intent).toBe('drop-as-known')
  })
})
