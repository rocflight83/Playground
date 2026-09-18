import { describe, expect, it } from 'vitest'
import { ScriptedIntelligence } from '../src/app/intelligence'

describe('ScriptedIntelligence', () => {
  it('records generatePlan calls and returns the queued answer', async () => {
    const intel = new ScriptedIntelligence()
    intel.enqueuePlan({ subject: 'Queued Plan' })
    const answer = await intel.generatePlan({
      subject: 'Anything',
      currentLevel: 'X',
      hoursPerDay: 2,
      targetCapability: 'Y',
    })
    expect(answer).toEqual({ subject: 'Queued Plan' })
    expect(intel.calls).toEqual([
      {
        method: 'generatePlan',
        args: [
          {
            subject: 'Anything',
            currentLevel: 'X',
            hoursPerDay: 2,
            targetCapability: 'Y',
          },
          undefined,
        ],
      },
    ])
  })

  it('records replaceSession and returns the queued session + knownSummary', async () => {
    const intel = new ScriptedIntelligence()
    intel.enqueueSession({ session: { number: 3, title: 'X' }, knownSummary: 'summary' })
    const answer = await intel.replaceSession({
      plan: {} as never,
      sessionNumber: 3,
      intent: 'drop-as-known',
      droppedUnits: [],
      atRiskUnits: [],
      extendedCurrentLevel: 'Beginner\n\nAlready known: X',
    })
    expect(answer.session).toEqual({ number: 3, title: 'X' })
    expect(answer.knownSummary).toBe('summary')
  })

  it('replays the queue in submit order across heterogeneous methods', async () => {
    const intel = new ScriptedIntelligence()
    intel.enqueuePlan({ first: 'plan' })
    intel.enqueuePlan({ second: 'plan' })
    intel.enqueueSession({ session: { third: 'session' } })
    const first = (await intel.generatePlan({} as never)) as { first?: string; second?: string }
    const second = (await intel.generatePlan({} as never)) as { first?: string; second?: string }
    const session = (await intel.replaceSession({} as never)) as { session: unknown }
    expect(first.first).toBe('plan')
    expect(second.second).toBe('plan')
    expect(session.session).toEqual({ third: 'session' })
  })

  it('propagates a queued throw when none of the answers apply', async () => {
    const intel = new ScriptedIntelligence()
    intel.enqueuePlan({ throw: new Error('intelligence refused') })
    await expect(intel.generatePlan({} as never)).rejects.toThrow(/refused/)
  })

  it('throws when asked for a method whose queue is empty', async () => {
    const intel = new ScriptedIntelligence()
    await expect(intel.generatePlan({} as never)).rejects.toThrow(/no queued/)
  })
})
