import type { PlanData } from '../src/plan-types'
import { validatePlan } from '../src/validation'
import { fixturePlan } from './fixtures/plan-fixture'

function clonePlan(plan: PlanData): PlanData {
  return JSON.parse(JSON.stringify(plan)) as PlanData
}

/**
 * Build the smallest plan that passes every invariant unrelated to the
 * per-publisher cap, so a single test can pin down a publisher-breadth
 * behaviour without a 14-session fixture. URLs default to being placed on
 * consecutive sessions starting from session 1.
 */
function makeMinimalPlan(
  urls: Array<string | { session: number; url: string }>
): PlanData {
  const base: PlanData = {
    meta: {
      subject: 'X',
      targetCapability: 'X',
      hoursPerDay: 2,
      currentLevel: 'beginner',
      generatedAt: '2026-01-01T00:00:00.000Z',
    },
    disssPreamble: { deconstruction: 'x', selectionRationale: 'x', cutList: 'x', sequencingRationale: 'x' },
    stakes: '',
    phases: [{ title: 'p', sessions: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14] }],
    sessions: Array.from({ length: 14 }, (_, i) => ({
      number: i + 1,
      title: `s${i + 1}`,
      artifactOneLiner: `a${i + 1}`,
      materials: [
        {
          title: 'm',
          url: 'https://example.com/placeholder',
          sourceType: 'preferred' as const,
          estimatedDuration: 10,
          paid: false,
          verification: { status: 'verified-by-status' as const, checkedAt: '2026-01-01T00:00:00.000Z' },
        },
      ],
      selfCheck: 'x',
      estimatedTime: 60,
      highFrequencyUnits: ['u'],
      consolidation: i + 1 === 6 || i + 1 === 11,
    })),
  }
  const placement = urls.map((entry, index) =>
    typeof entry === 'string' ? { session: index + 1, url: entry } : entry
  )
  for (const { session, url } of placement) {
    base.sessions[session - 1].materials[0].url = url
  }
  return base
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

  it('rejects a material whose sourceType is none of the three accepted tiers', () => {
    const plan = clonePlan(fixturePlan)
    // @ts-expect-error deliberately malformed for the test
    plan.sessions[0].materials[0].sourceType = 'unknown'
    const errors = validatePlan(plan)
    expect(errors.some((e) => e.includes("sourceType must be 'preferred', 'practitioner', or 'off-list'"))).toBe(true)
  })

  it('accepts a practitioner-tier material (issue 12: the practitioner tier is now first-class)', () => {
    const plan = clonePlan(fixturePlan)
    plan.sessions[0].materials[0].sourceType = 'practitioner'
    expect(validatePlan(plan)).toEqual([])
  })

  it('rejects a practitioner-tier material on a forum host (issue 12: forum tripwire)', () => {
    const plan = clonePlan(fixturePlan)
    plan.sessions[0].materials[0].sourceType = 'practitioner'
    plan.sessions[0].materials[0].url = 'https://www.reddit.com/r/python/comments/abcd'
    const errors = validatePlan(plan)
    expect(errors.some((e) => e.includes("is a forum thread and cannot be practitioner-tier"))).toBe(true)
  })

  it('rejects a Hacker News practitioner-tier material (its registrable domain is ycombinator.com)', () => {
    const plan = clonePlan(fixturePlan)
    plan.sessions[0].materials[0].sourceType = 'practitioner'
    plan.sessions[0].materials[0].url = 'https://news.ycombinator.com/item?id=123'
    const errors = validatePlan(plan)
    expect(errors.some((e) => e.includes("is a forum thread and cannot be practitioner-tier"))).toBe(true)
  })

  it('accepts the same forum URL when its tier is off-list (the tripwire only rejects practitioner)', () => {
    const plan = clonePlan(fixturePlan)
    plan.sessions[0].materials[0].sourceType = 'off-list'
    plan.sessions[0].materials[0].url = 'https://www.reddit.com/r/python/comments/abcd'
    expect(validatePlan(plan)).toEqual([])
  })

  describe('unfetchable hosts (issue 30: X posts are never materials)', () => {
    for (const sourceType of ['preferred', 'practitioner', 'off-list'] as const) {
      it(`rejects an x.com material at sourceType '${sourceType}'`, () => {
        const plan = clonePlan(fixturePlan)
        plan.sessions[0].materials[0].sourceType = sourceType
        plan.sessions[0].materials[0].url = 'https://x.com/someone/status/123'
        const errors = validatePlan(plan)
        expect(errors.some((e) => e.includes('cannot be fetched by verification'))).toBe(true)
      })
    }

    it('rejects a twitter.com material too (including www)', () => {
      const plan = clonePlan(fixturePlan)
      plan.sessions[0].materials[0].url = 'https://www.twitter.com/someone/status/123'
      const errors = validatePlan(plan)
      expect(errors.some((e) => e.includes('cannot be fetched by verification'))).toBe(true)
    })

    it('still accepts a non-X off-list material (the rule is host-specific)', () => {
      const plan = clonePlan(fixturePlan)
      plan.sessions[0].materials[0].sourceType = 'off-list'
      plan.sessions[0].materials[0].url = 'https://example.com/a-blog-post'
      expect(validatePlan(plan)).toEqual([])
    })
  })

  it('enforces a per-publisher cap of 4 distinct URLs across the plan', () => {
    const plan = makeMinimalPlan([
      'https://docs.python.org/3/tutorial/introduction.html',
      'https://docs.python.org/3/tutorial/controlflow.html',
      'https://docs.python.org/3/tutorial/modules.html',
      'https://docs.python.org/3/library/argparse.html',
      'https://docs.python.org/3/library/logging.html',
    ])
    const errors = validatePlan(plan)
    expect(
      errors.some((e) => e.includes("plan draws 5 distinct URLs from publisher 'python.org'"))
    ).toBe(true)
    expect(
      errors.some((e) => e.includes('at most 4 per plan are allowed'))
    ).toBe(true)
  })

  it('lists every contributing session in the cap error, sorted ascending', () => {
    // Five docs.python.org URLs placed on sessions 1, 3, 5, 7, 9 to verify
    // the error message lists them in ascending session order, not insertion
    // order.
    const plan = makeMinimalPlan([
      { session: 1, url: 'https://docs.python.org/3/tutorial/introduction.html' },
      { session: 9, url: 'https://docs.python.org/3/tutorial/controlflow.html' },
      { session: 5, url: 'https://docs.python.org/3/tutorial/modules.html' },
      { session: 3, url: 'https://docs.python.org/3/library/argparse.html' },
      { session: 7, url: 'https://docs.python.org/3/library/logging.html' },
    ])
    const errors = validatePlan(plan)
    const capError = errors.find((e) => e.includes("publisher 'python.org'"))
    expect(capError).toBeDefined()
    expect(capError).toMatch(/sessions 1, 3, 5, 7, 9/)
  })

  it('accepts exactly 4 distinct URLs from one publisher', () => {
    const plan = makeMinimalPlan([
      'https://docs.python.org/3/tutorial/introduction.html',
      'https://docs.python.org/3/tutorial/controlflow.html',
      'https://docs.python.org/3/tutorial/modules.html',
      'https://docs.python.org/3/library/argparse.html',
    ])
    expect(validatePlan(plan)).toEqual([])
  })

  it('counts distinct URLs (after normalisation) — a repeated URL across slots does not eat the cap', () => {
    // 5 slots pointing at the same URL = 1 distinct URL = passes the cap.
    const plan = makeMinimalPlan([
      'https://docs.python.org/3/tutorial/introduction.html',
      'https://docs.python.org/3/tutorial/introduction.html',
      'https://docs.python.org/3/tutorial/introduction.html',
      'https://docs.python.org/3/tutorial/introduction.html',
      'https://docs.python.org/3/tutorial/introduction.html',
    ])
    expect(validatePlan(plan)).toEqual([])
  })

  it('treats fragment and trailing-slash variants as the same URL for the cap', () => {
    // Query strings are kept distinct (some hosts distinguish pages by
    // query), so the three non-query variants collapse to one URL and the
    // query variant adds a second. Two distinct URLs is under the cap.
    const plan = makeMinimalPlan([
      'https://docs.python.org/3/tutorial/introduction.html',
      'https://docs.python.org/3/tutorial/introduction.html#frag',
      'https://docs.python.org/3/tutorial/introduction.html/',
      'https://docs.python.org/3/tutorial/introduction.html?a=1',
    ])
    expect(validatePlan(plan)).toEqual([])
  })

  it('treats cdn. and www. of the same registrable domain as one publisher', () => {
    const plan = makeMinimalPlan([
      'https://cdn.cboe.com/page1',
      'https://www.cboe.com/page2',
      'https://cboe.com/page3',
      'https://cboe.com/page4',
      'https://cboe.com/page5',
    ])
    const errors = validatePlan(plan)
    expect(errors.some((e) => e.includes("publisher 'cboe.com'"))).toBe(true)
  })

  it('skips video hosts (publisherKey returns null) — a plan of six YouTube URLs passes', () => {
    const plan = makeMinimalPlan([
      'https://youtube.com/watch?v=a',
      'https://youtube.com/watch?v=b',
      'https://youtube.com/watch?v=c',
      'https://youtube.com/watch?v=d',
      'https://youtube.com/watch?v=e',
      'https://youtube.com/watch?v=f',
    ])
    expect(validatePlan(plan)).toEqual([])
  })

  it('counts two different github.io tenants separately', () => {
    // Six slots: three URLs on tenant A, three on tenant B. Each tenant has
    // 3 distinct URLs — under the cap. Without the tenant carve-out the
    // test would fail with a github.io violation.
    const plan = makeMinimalPlan([
      'https://ranaroussi.github.io/page1',
      'https://ranaroussi.github.io/page2',
      'https://ranaroussi.github.io/page3',
      'https://apscheduler.readthedocs.io/page1',
      'https://apscheduler.readthedocs.io/page2',
      'https://apscheduler.readthedocs.io/page3',
    ])
    expect(validatePlan(plan)).toEqual([])
  })

  it('does not count outlier-story citations against the cap', () => {
    // 4 docs.python.org material URLs (at the cap) plus an outlier-story
    // citation on the same publisher — must still pass.
    const plan = makeMinimalPlan([
      'https://docs.python.org/3/tutorial/introduction.html',
      'https://docs.python.org/3/tutorial/controlflow.html',
      'https://docs.python.org/3/tutorial/modules.html',
      'https://docs.python.org/3/library/argparse.html',
    ])
    plan.phases[0].outlierStory = {
      person: 'p',
      approach: 'a',
      principle: 'pr',
      citation: 'https://docs.python.org/3/page5',
    }
    expect(validatePlan(plan)).toEqual([])
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

describe('validatePlan type-checks a session deliverableTemplate (issue 14)', () => {
  function makeTemplateField(overrides: Record<string, unknown> = {}) {
    return {
      id: 'who-pays',
      label: 'Who pays the premium',
      prompt: 'Which party is structurally short this premium?',
      kind: 'paragraph' as const,
      ...overrides,
    }
  }

  function attachTemplate(plan: PlanData, fields: unknown[]): PlanData {
    plan.sessions[1].deliverableTemplate = { fields: fields as never }
    return plan
  }

  it('accepts a plan whose session carries a well-formed template', () => {
    const plan = attachTemplate(clonePlan(fixturePlan), [
      makeTemplateField({ id: 'who-pays', label: 'Who pays', prompt: 'Why this party?' }),
      makeTemplateField({ id: 'why-persists', label: 'Why it persists', prompt: 'Why does it keep paying?' }),
      makeTemplateField({ id: 'regime-on', label: 'Regime on', prompt: 'When is the edge harvested?' }),
      makeTemplateField({ id: 'regime-off', label: 'Regime off', prompt: 'When does it blow up?' }),
    ])
    expect(validatePlan(plan)).toEqual([])
  })

  it('accepts a plan where no session carries a template', () => {
    expect(validatePlan(fixturePlan)).toEqual([])
  })

  it('rejects a template whose fields array is not an array', () => {
    const plan = attachTemplate(clonePlan(fixturePlan), 'not-an-array' as never)
    const errors = validatePlan(plan)
    expect(errors).toContain(
      'session 2 deliverableTemplate.fields must be an array of 2 to 8 fields'
    )
  })

  it('rejects a template with fewer than 2 fields', () => {
    const plan = attachTemplate(clonePlan(fixturePlan), [makeTemplateField()])
    const errors = validatePlan(plan)
    expect(errors).toContain(
      'session 2 deliverableTemplate.fields must be an array of 2 to 8 fields'
    )
  })

  it('rejects a template with more than 8 fields', () => {
    const fields = Array.from({ length: 9 }, (_, i) =>
      makeTemplateField({ id: `field-${i}`, label: `field ${i}`, prompt: `prompt ${i}` })
    )
    const plan = attachTemplate(clonePlan(fixturePlan), fields)
    const errors = validatePlan(plan)
    expect(errors).toContain(
      'session 2 deliverableTemplate.fields must be an array of 2 to 8 fields'
    )
  })

  it('rejects a field whose id is missing', () => {
    const fields = [
      makeTemplateField({ id: 'a' }),
      makeTemplateField({ id: undefined }),
    ]
    const plan = attachTemplate(clonePlan(fixturePlan), fields)
    const errors = validatePlan(plan)
    expect(errors).toContain('session 2 deliverableTemplate field 1 id must be a slug')
  })

  it('rejects a field whose id has uppercase characters', () => {
    const fields = [
      makeTemplateField({ id: 'a' }),
      makeTemplateField({ id: 'Who-Pays' }),
    ]
    const plan = attachTemplate(clonePlan(fixturePlan), fields)
    const errors = validatePlan(plan)
    expect(errors).toContain('session 2 deliverableTemplate field 1 id must be a slug')
  })

  it('rejects a field whose id has a leading hyphen', () => {
    const fields = [
      makeTemplateField({ id: 'a' }),
      makeTemplateField({ id: '-who-pays' }),
    ]
    const plan = attachTemplate(clonePlan(fixturePlan), fields)
    const errors = validatePlan(plan)
    expect(errors).toContain('session 2 deliverableTemplate field 1 id must be a slug')
  })

  it('rejects duplicate field ids within one session', () => {
    const fields = [
      makeTemplateField({ id: 'who-pays' }),
      makeTemplateField({ id: 'who-pays' }),
    ]
    const plan = attachTemplate(clonePlan(fixturePlan), fields)
    const errors = validatePlan(plan)
    expect(errors).toContain('session 2 deliverableTemplate field ids must be unique')
  })

  it('rejects a field with a missing label', () => {
    const fields = [
      makeTemplateField(),
      makeTemplateField({ id: 'second', label: '' }),
    ]
    const plan = attachTemplate(clonePlan(fixturePlan), fields)
    const errors = validatePlan(plan)
    expect(errors).toContain('session 2 deliverableTemplate field 1 label is required')
  })

  it('rejects a field with a missing prompt', () => {
    const fields = [
      makeTemplateField(),
      makeTemplateField({ id: 'second', prompt: undefined }),
    ]
    const plan = attachTemplate(clonePlan(fixturePlan), fields)
    const errors = validatePlan(plan)
    expect(errors).toContain('session 2 deliverableTemplate field 1 prompt is required')
  })

  it('rejects a field whose kind is not line or paragraph', () => {
    const fields = [
      makeTemplateField(),
      makeTemplateField({ id: 'second', kind: 'list' }),
    ]
    const plan = attachTemplate(clonePlan(fixturePlan), fields)
    const errors = validatePlan(plan)
    expect(errors).toContain(
      "session 2 deliverableTemplate field 1 kind must be 'line' or 'paragraph'"
    )
  })

  it('reports every error on a malformed template, not just the first', () => {
    const fields = [
      { id: 'who-pays', label: '', prompt: '', kind: 'list' },
      { id: 'who-pays', label: 'a', prompt: 'b', kind: 'paragraph' },
    ]
    const plan = attachTemplate(clonePlan(fixturePlan), fields)
    const errors = validatePlan(plan)
    expect(errors).toContain('session 2 deliverableTemplate field 0 label is required')
    expect(errors).toContain('session 2 deliverableTemplate field 0 prompt is required')
    expect(errors).toContain(
      "session 2 deliverableTemplate field 0 kind must be 'line' or 'paragraph'"
    )
    expect(errors).toContain('session 2 deliverableTemplate field ids must be unique')
  })
})

describe('validatePlan type-checks the measured duration fields (issue 13)', () => {
  it('accepts a plan whose measurement fields are well-typed', () => {
    const plan = clonePlan(fixturePlan)
    plan.sessions[0].materials[0].verification = {
      status: 'verified-by-status',
      checkedAt: '2026-01-01T00:00:00.000Z',
      measuredDuration: 12,
      measuredBy: 'word-count',
    }
    expect(validatePlan(plan)).toEqual([])
  })

  it('accepts the measurement fields on every verification status', () => {
    for (const status of [
      'verified-by-status',
      'verified-by-content',
      'replaced-after-failure',
      'unresolved-after-retries',
    ] as const) {
      const plan = clonePlan(fixturePlan)
      plan.sessions[0].materials[0].verification = {
        status,
        checkedAt: status === 'unresolved-after-retries' ? null : '2026-01-01T00:00:00.000Z',
        measuredDuration: 5,
        measuredBy: 'stated-read-time',
      }
      expect(validatePlan(plan)).toEqual([])
    }
  })

  it('rejects measuredDuration that is not a positive number', () => {
    const plan = clonePlan(fixturePlan)
    plan.sessions[0].materials[0].verification = {
      status: 'verified-by-status',
      checkedAt: '2026-01-01T00:00:00.000Z',
      measuredDuration: -3,
    }
    expect(validatePlan(plan)).toEqual([
      'session 1 material measuredDuration must be a positive number when present',
    ])
  })

  it('rejects measuredBy that is not one of the three bases', () => {
    const plan = clonePlan(fixturePlan)
    plan.sessions[0].materials[0].verification = {
      status: 'verified-by-status',
      checkedAt: '2026-01-01T00:00:00.000Z',
      // @ts-expect-error deliberately malformed for the test
      measuredBy: 'vibes',
    }
    expect(validatePlan(plan)).toEqual([
      "session 1 material measuredBy must be 'video-metadata', 'stated-read-time' or 'word-count' when present",
    ])
  })

  it('rejects measuredDuration without measuredBy', () => {
    const plan = clonePlan(fixturePlan)
    plan.sessions[0].materials[0].verification = {
      status: 'verified-by-status',
      checkedAt: '2026-01-01T00:00:00.000Z',
      measuredDuration: 5,
    }
    expect(validatePlan(plan)).toEqual([
      'session 1 material measuredDuration and measuredBy must be set together',
    ])
  })

  it('rejects measuredBy without measuredDuration', () => {
    const plan = clonePlan(fixturePlan)
    plan.sessions[0].materials[0].verification = {
      status: 'verified-by-status',
      checkedAt: '2026-01-01T00:00:00.000Z',
      measuredBy: 'word-count',
    }
    expect(validatePlan(plan)).toEqual([
      'session 1 material measuredDuration and measuredBy must be set together',
    ])
  })
})

describe('validatePlan — curationLog (issue 15)', () => {
  it('accepts a plan with no curationLog (the field is optional)', () => {
    const plan = clonePlan(fixturePlan)
    delete plan.curationLog
    expect(validatePlan(plan)).toEqual([])
  })

  it('accepts a plan with an empty curationLog array', () => {
    const plan = clonePlan(fixturePlan)
    plan.curationLog = []
    expect(validatePlan(plan)).toEqual([])
  })

  it('accepts a structurally valid curationLog carrying replacedSession on drop-as-known', () => {
    const plan = clonePlan(fixturePlan)
    plan.curationLog = [
      {
        intent: 'drop-as-known',
        sessionNumber: 3,
        at: '2026-02-10T00:00:00.000Z',
        known: 'I already know functions',
        knownSummary: 'Functions are second nature.',
        replacedSession: plan.sessions.find((s) => s.number === 3)!,
      },
    ]
    expect(validatePlan(plan)).toEqual([])
  })

  it('rejects a record with an unknown intent', () => {
    const plan = clonePlan(fixturePlan)
    plan.curationLog = [
      {
        intent: 'rewrite',
        sessionNumber: 3,
        at: '2026-02-10T00:00:00.000Z',
        replacedSession: plan.sessions.find((s) => s.number === 3)!,
      } as never,
    ]
    const errors = validatePlan(plan)
    expect(errors.some((e) => /curationLog\[0\] intent/i.test(e) && /must be/i.test(e))).toBe(true)
  })

  it('rejects a record with an out-of-range sessionNumber', () => {
    const plan = clonePlan(fixturePlan)
    plan.curationLog = [
      {
        intent: 'redo-session',
        sessionNumber: 15,
        at: '2026-02-10T00:00:00.000Z',
        replacedSession: plan.sessions.find((s) => s.number === 1)!,
      },
    ]
    const errors = validatePlan(plan)
    expect(errors.some((e) => /curationLog.*0.*sessionNumber/i.test(e) && /1.*14/.test(e))).toBe(true)
  })

  it('rejects a record with an empty at', () => {
    const plan = clonePlan(fixturePlan)
    plan.curationLog = [
      {
        intent: 'redo-session',
        sessionNumber: 3,
        at: '',
        replacedSession: plan.sessions.find((s) => s.number === 3)!,
      },
    ]
    const errors = validatePlan(plan)
    expect(errors.some((e) => /curationLog.*0.*at/i.test(e) && /empty|required/i.test(e))).toBe(true)
  })

  it('rejects a record carrying both replacedSession and replacedMaterial', () => {
    const plan = clonePlan(fixturePlan)
    plan.curationLog = [
      {
        intent: 'redo-session',
        sessionNumber: 3,
        at: '2026-02-10T00:00:00.000Z',
        replacedSession: plan.sessions.find((s) => s.number === 3)!,
        replacedMaterial: plan.sessions[2].materials[0],
      },
    ]
    const errors = validatePlan(plan)
    expect(errors.some((e) => /curationLog.*0.*one of/i.test(e))).toBe(true)
  })

  it('rejects a record carrying neither replacedSession nor replacedMaterial', () => {
    const plan = clonePlan(fixturePlan)
    plan.curationLog = [
      {
        intent: 'redo-session',
        sessionNumber: 3,
        at: '2026-02-10T00:00:00.000Z',
      },
    ]
    const errors = validatePlan(plan)
    expect(errors.some((e) => /curationLog.*0.*one of/i.test(e))).toBe(true)
  })

  it('rejects a swap-material record carrying replacedSession instead of replacedMaterial', () => {
    const plan = clonePlan(fixturePlan)
    plan.curationLog = [
      {
        intent: 'swap-material',
        sessionNumber: 3,
        at: '2026-02-10T00:00:00.000Z',
        replacedSession: plan.sessions.find((s) => s.number === 3)!,
      },
    ]
    const errors = validatePlan(plan)
    expect(errors.some((e) => /curationLog.*0.*swap-material/i.test(e) && /replacedMaterial/i.test(e))).toBe(true)
  })

  it('rejects a drop-as-known record carrying replacedMaterial instead of replacedSession', () => {
    const plan = clonePlan(fixturePlan)
    plan.curationLog = [
      {
        intent: 'drop-as-known',
        sessionNumber: 3,
        at: '2026-02-10T00:00:00.000Z',
        known: 'X',
        knownSummary: 'Y',
        replacedMaterial: plan.sessions[2].materials[0],
      },
    ]
    const errors = validatePlan(plan)
    expect(errors.some((e) => /curationLog.*0.*drop-as-known/i.test(e) && /replacedSession/i.test(e))).toBe(true)
  })

  it('rejects a curationLog that is not an array', () => {
    const plan = clonePlan(fixturePlan)
    // @ts-expect-error deliberately malformed
    plan.curationLog = 'not an array'
    const errors = validatePlan(plan)
    expect(errors.some((e) => /curationLog must be an array/i.test(e))).toBe(true)
  })

  it('reports multiple invalid records by index', () => {
    const plan = clonePlan(fixturePlan)
    plan.curationLog = [
      {
        intent: 'redo-session',
        sessionNumber: 3,
        at: '',
        replacedSession: plan.sessions.find((s) => s.number === 3)!,
      },
      {
        intent: 'redo-session',
        sessionNumber: 15,
        at: '2026-02-10T00:00:00.000Z',
        replacedSession: plan.sessions.find((s) => s.number === 1)!,
      },
    ]
    const errors = validatePlan(plan)
    expect(errors.some((e) => /curationLog.*0/.test(e))).toBe(true)
    expect(errors.some((e) => /curationLog.*1/.test(e))).toBe(true)
  })
})
