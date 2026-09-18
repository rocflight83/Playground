import type { PlanBrief, ReplaceMaterialContext, ReplaceSessionContext } from '../src/app/intelligence'
import { IntelligenceError } from '../src/app/intelligence'
import { createXaiIntelligence, type XaiIntelligenceOptions, type XaiRequest, type XaiResponse } from '../src/app/intelligence-xai'
import { fixturePlan } from './fixtures/plan-fixture'

const prompts = {
  policy: 'POLICY TEXT',
  generate: 'GENERATE DUTY',
  replaceSession: 'REPLACE SESSION DUTY',
  replaceMaterial: 'REPLACE MATERIAL DUTY',
}

const brief: PlanBrief = {
  subject: 'Python Programming',
  currentLevel: 'Beginner',
  hoursPerDay: 2,
  targetCapability: 'Build real-world command-line tools',
}

/** A fake `client.responses.create` that records params and answers with a canned response. */
function fakeClient(answer: unknown, extra: Partial<XaiResponse> = {}) {
  const calls: XaiRequest[] = []
  const client = {
    responses: {
      create: async (params: XaiRequest): Promise<XaiResponse> => {
        calls.push(params)
        return {
          status: 'completed',
          output_text: typeof answer === 'string' ? answer : JSON.stringify(answer),
          usage: { input_tokens: 100, output_tokens: 20, input_tokens_details: { cached_tokens: 0 } },
          ...extra,
        }
      },
    },
  }
  return { client, calls }
}

function build(answer: unknown, opts: Partial<XaiIntelligenceOptions> = {}, extra: Partial<XaiResponse> = {}) {
  const { client, calls } = fakeClient(answer, extra)
  const intelligence = createXaiIntelligence({ client, prompts, ...opts })
  return { intelligence, calls }
}

function userJson(params: XaiRequest, index = 0): Record<string, unknown> {
  const input = params.input
  expect(input[index].role).toBe('user')
  return JSON.parse(input[index].content) as Record<string, unknown>
}

function toolTypes(params: XaiRequest): string[] {
  return params.tools.map((t) => t.type)
}

function formatName(params: XaiRequest): string {
  return params.text.format.name
}

function sessionCtx(intent: 'drop-as-known' | 'redo-session'): ReplaceSessionContext {
  return {
    plan: fixturePlan,
    sessionNumber: 3,
    intent,
    ...(intent === 'drop-as-known' ? { known: 'I already know loops' } : { reason: 'too shallow' }),
    droppedUnits: ['loops'],
    atRiskUnits: ['iteration'],
    extendedCurrentLevel: 'Beginner\n\nAlready known: loops',
  }
}

describe('createXaiIntelligence', () => {
  it('Scenario 1: generatePlan sends policy + generate duty, the brief as JSON, both tools, the plan format, store: false, and returns the parsed output', async () => {
    const { intelligence, calls } = build(fixturePlan)
    const answer = await intelligence.generatePlan(brief)
    expect(answer).toEqual(fixturePlan)
    expect(calls).toHaveLength(1)
    const params = calls[0]
    expect(params.model).toBe('grok-4.6')
    expect(params.instructions).toBe('POLICY TEXT\n\nGENERATE DUTY')
    expect(params.store).toBe(false)
    expect(toolTypes(params)).toEqual(['web_search', 'x_search'])
    const format = params.text.format
    expect(format.type).toBe('json_schema')
    expect(format.name).toBe('plan')
    expect(format.strict).toBe(false)
    expect(format.schema).toBeTypeOf('object')
    expect(params.max_turns).toBe(30)
    const user = userJson(params)
    expect(user.brief).toEqual(brief)
    expect((user.budget as { maxToolCalls: number }).maxToolCalls).toBe(30)
    expect((params.input as unknown[]).length).toBe(1)
  })

  it('Scenario 2: generatePlan with a repair adds the previous attempt and errors as a further user message, still with the plan format', async () => {
    const { intelligence, calls } = build(fixturePlan)
    const repair = { previous: { meta: {} }, validationErrors: ['plan must have exactly 14 sessions'] }
    await intelligence.generatePlan(brief, repair)
    const params = calls[0]
    expect((params.input as unknown[]).length).toBe(2)
    expect(userJson(params, 0).brief).toEqual(brief)
    expect(userJson(params, 1).repair).toEqual(repair)
    expect(formatName(params)).toBe('plan')
  })

  it('Scenario 3a: replaceSession (drop) passes the computed context in the user JSON, sends no x_search by default, and returns { session, knownSummary }', async () => {
    const replacement = fixturePlan.sessions[2]
    const { intelligence, calls } = build({ session: replacement, knownSummary: 'Knows loops.' })
    const result = await intelligence.replaceSession(sessionCtx('drop-as-known'))
    expect(result).toEqual({ session: replacement, knownSummary: 'Knows loops.' })
    const params = calls[0]
    expect(params.instructions).toBe('POLICY TEXT\n\nREPLACE SESSION DUTY')
    expect(toolTypes(params)).toEqual(['web_search'])
    expect(params.max_turns).toBe(8)
    const user = userJson(params)
    expect(user.droppedUnits).toEqual(['loops'])
    expect(user.atRiskUnits).toEqual(['iteration'])
    expect(user.extendedCurrentLevel).toBe('Beginner\n\nAlready known: loops')
    expect(user.known).toBe('I already know loops')
    expect(user.intent).toBe('drop-as-known')
    expect(user.sessionNumber).toBe(3)
    expect(user.plan).toEqual(fixturePlan)
    expect(formatName(params)).toBe('session_replacement')
  })

  it('Scenario 3b: replaceSession (redo) has no knownSummary; xSearch: sourcing adds the tool', async () => {
    const replacement = fixturePlan.sessions[2]
    const { intelligence, calls } = build({ session: replacement }, { xSearch: 'sourcing' })
    const result = await intelligence.replaceSession(sessionCtx('redo-session'))
    expect(result).toEqual({ session: replacement })
    expect('knownSummary' in result).toBe(false)
    expect(toolTypes(calls[0])).toEqual(['web_search', 'x_search'])
    expect(userJson(calls[0]).reason).toBe('too shallow')
  })

  it('Scenario 4: replaceMaterial passes remainingMinutes and by, sends x_search, and returns the parsed material', async () => {
    const session = fixturePlan.sessions[3]
    const material = session.materials[0]
    const ctx: ReplaceMaterialContext = {
      plan: fixturePlan,
      session,
      material,
      by: { reason: 'want a practitioner take' },
      remainingMinutes: 45,
    }
    const replacement = { ...material, url: 'https://example.com/practitioner', sourceType: 'practitioner' }
    const { intelligence, calls } = build(replacement)
    expect(await intelligence.replaceMaterial(ctx)).toEqual(replacement)
    const params = calls[0]
    expect(params.instructions).toBe('POLICY TEXT\n\nREPLACE MATERIAL DUTY')
    expect(toolTypes(params)).toEqual(['web_search', 'x_search'])
    const user = userJson(params)
    expect(user.remainingMinutes).toBe(45)
    expect(user.by).toEqual({ reason: 'want a practitioner take' })
    expect(user.material).toEqual(material)
    expect(formatName(params)).toBe('material')
  })

  it('Scenario 5: findReplacementUrl sends web_search only with the findUrl cap; returns the url, or null on { url: null }', async () => {
    const material = fixturePlan.sessions[0].materials[0]
    const found = build({ url: 'https://example.com/better' })
    expect(await found.intelligence.findReplacementUrl(material, 'loops')).toBe('https://example.com/better')
    const params = found.calls[0]
    expect(toolTypes(params)).toEqual(['web_search'])
    expect(params.max_turns).toBe(3)
    expect(userJson(params).concept).toBe('loops')
    expect(formatName(params)).toBe('replacement_url')

    const none = build({ url: null })
    expect(await none.intelligence.findReplacementUrl(material, 'loops')).toBeNull()
  })

  it('Scenario 6: an incomplete response, or non-JSON output_text, throws IntelligenceError naming the reason', async () => {
    const cut = build('', {}, { status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' } })
    await expect(cut.intelligence.generatePlan(brief)).rejects.toThrow(IntelligenceError)
    await expect(cut.intelligence.generatePlan(brief)).rejects.toThrow(/max_output_tokens/)

    const prose = build('Here is your plan: ...')
    await expect(prose.intelligence.generatePlan(brief)).rejects.toThrow(/unparseable output/)

    const empty = build('')
    await expect(empty.intelligence.generatePlan(brief)).rejects.toThrow(/unparseable output/)
  })

  it('Scenario 6b: errors from the client propagate unchanged', async () => {
    const client = {
      responses: {
        create: async (): Promise<XaiResponse> => {
          throw new Error('401 invalid api key')
        },
      },
    }
    const intelligence = createXaiIntelligence({ client, prompts })
    await expect(intelligence.generatePlan(brief)).rejects.toThrow('401 invalid api key')
  })

  it('Scenario 7: onUsage receives one record per call with tool calls and cache reads from the usage block', async () => {
    const records: unknown[] = []
    let tick = 1000
    const { intelligence } = build(
      fixturePlan,
      { onUsage: (u) => records.push(u), now: () => (tick += 250) },
      {
        usage: {
          input_tokens: 4000,
          output_tokens: 900,
          input_tokens_details: { cached_tokens: 1500 },
          server_side_tool_usage_details: { web_search_calls: 12, x_search_calls: 3, code_interpreter_calls: 0 },
        },
      }
    )
    await intelligence.generatePlan(brief)
    expect(records).toEqual([
      {
        call: 'generatePlan',
        model: 'grok-4.6',
        inputTokens: 4000,
        outputTokens: 900,
        cacheReadTokens: 1500,
        toolCalls: { web_search: 12, x_search: 3, code_interpreter: 0 },
        ms: 250,
      },
    ])
  })

  it('Scenario 7b: the older server_side_tool_usage map is read too, and cached_tokens defaults to 0 when absent', async () => {
    const records: { toolCalls: Record<string, number>; cacheReadTokens: number }[] = []
    const { intelligence } = build(
      { url: null },
      { onUsage: (u) => records.push(u) },
      { usage: { input_tokens: 10, output_tokens: 2, server_side_tool_usage: { SERVER_SIDE_TOOL_WEB_SEARCH: 2 } } }
    )
    await intelligence.findReplacementUrl(fixturePlan.sessions[0].materials[0], 'loops')
    expect(records[0].toolCalls).toEqual({ web_search: 2 })
    expect(records[0].cacheReadTokens).toBe(0)
  })

  it('models and maxToolCalls options override the defaults', async () => {
    const { intelligence, calls } = build(fixturePlan, {
      models: { generate: 'grok-4.3' },
      maxToolCalls: { generate: 5 },
    })
    await intelligence.generatePlan(brief)
    expect(calls[0].model).toBe('grok-4.3')
    expect(calls[0].max_turns).toBe(5)
    expect((userJson(calls[0]).budget as { maxToolCalls: number }).maxToolCalls).toBe(5)
  })
})
