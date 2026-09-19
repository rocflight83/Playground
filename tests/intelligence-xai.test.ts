import type { PlanBrief, ReplaceMaterialContext, ReplaceSessionContext } from '../src/app/intelligence'
import { IntelligenceError } from '../src/app/intelligence'
import {
  createXaiIntelligence,
  type XaiIntelligenceOptions,
  type XaiRequest,
  type XaiResponse,
  type XaiStreamEvent,
} from '../src/app/intelligence-xai'
import { PLAN_SCHEMAS } from '../src/app/plan-schema'
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

/** The Responses API's answer as one `message` output item, the way the streamed terminal event carries it. */
function messageOutput(text: string): XaiResponse['output'] {
  return [
    { type: 'reasoning', summary: [{ type: 'summary_text', text: 'thinking…' }] },
    { type: 'message', role: 'assistant', content: [{ type: 'output_text', text }] },
  ]
}

/** The event stream the SDK yields for `stream: true`: a few deltas, then the terminal event. */
async function* streamOf(...events: XaiStreamEvent[]): AsyncGenerator<XaiStreamEvent> {
  yield { type: 'response.created' }
  yield { type: 'response.output_text.delta', delta: '{' }
  for (const event of events) yield event
}

/** A fake `client.responses.create` that records params and answers with a canned response. */
function fakeClient(answer: unknown, extra: Partial<XaiResponse> = {}, terminal: XaiStreamEvent['type'] = 'response.completed') {
  const calls: XaiRequest[] = []
  const client = {
    responses: {
      create: async (params: XaiRequest): Promise<AsyncIterable<XaiStreamEvent>> => {
        calls.push(params)
        const response: XaiResponse = {
          status: terminal === 'response.completed' ? 'completed' : 'incomplete',
          output: messageOutput(typeof answer === 'string' ? answer : JSON.stringify(answer)),
          usage: { input_tokens: 100, output_tokens: 20, input_tokens_details: { cached_tokens: 0 } },
          ...extra,
        }
        return streamOf({ type: terminal, response })
      },
    },
  }
  return { client, calls }
}

function build(
  answer: unknown,
  opts: Partial<XaiIntelligenceOptions> = {},
  extra: Partial<XaiResponse> = {},
  terminal?: XaiStreamEvent['type']
) {
  const { client, calls } = fakeClient(answer, extra, terminal)
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
  expect(params.text).toBeUndefined()
  const schema = userJson(params).responseSchema as { title?: string } | undefined
  expect(schema).toBeTypeOf('object')
  return schema?.title ?? ''
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
  it('Scenario 1: generatePlan sends policy + generate duty, the brief and the plan schema as JSON, both tools, store: false, and returns the parsed output', async () => {
    const { intelligence, calls } = build(fixturePlan)
    const answer = await intelligence.generatePlan(brief)
    expect(answer).toEqual(fixturePlan)
    expect(calls).toHaveLength(1)
    const params = calls[0]
    expect(params.model).toBe('grok-4.6')
    expect(params.instructions).toBe('POLICY TEXT\n\nGENERATE DUTY')
    expect(params.store).toBe(false)
    expect(params.stream).toBe(true)
    expect(toolTypes(params)).toEqual(['web_search', 'x_search'])
    // Default channel is `context`: the schema rides in the user JSON and no `text.format` is sent (see the module doc).
    expect(params.text).toBeUndefined()
    expect(params.max_turns).toBe(30)
    const user = userJson(params)
    expect(user.brief).toEqual(brief)
    expect((user.budget as { maxToolCalls: number }).maxToolCalls).toBe(30)
    expect(user.responseSchema).toEqual(PLAN_SCHEMAS.plan)
    expect((params.input as unknown[]).length).toBe(1)
  })

  it("Scenario 1b: schemaChannel: 'format' sends text.format json_schema instead, named for the call, strict per strictSchema", async () => {
    const loose = build(fixturePlan, { schemaChannel: 'format' })
    await loose.intelligence.generatePlan(brief)
    const format = loose.calls[0].text?.format
    expect(format).toEqual({ type: 'json_schema', name: 'plan', schema: PLAN_SCHEMAS.plan, strict: false })
    expect(userJson(loose.calls[0]).responseSchema).toBeUndefined()

    const strict = build({ url: null }, { schemaChannel: 'format', strictSchema: true })
    await strict.intelligence.findReplacementUrl(fixturePlan.sessions[0].materials[0], 'loops')
    expect(strict.calls[0].text?.format.name).toBe('replacement_url')
    expect(strict.calls[0].text?.format.strict).toBe(true)
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
    const cut = build('', {}, { incomplete_details: { reason: 'max_output_tokens' } }, 'response.incomplete')
    await expect(cut.intelligence.generatePlan(brief)).rejects.toThrow(IntelligenceError)
    await expect(cut.intelligence.generatePlan(brief)).rejects.toThrow(/max_output_tokens/)

    const prose = build('Here is your plan: {not json}')
    await expect(prose.intelligence.generatePlan(brief)).rejects.toThrow(/unparseable output/)

    const empty = build('')
    await expect(empty.intelligence.generatePlan(brief)).rejects.toThrow(/unparseable output/)
  })

  it('Scenario 6b: errors from the client propagate unchanged', async () => {
    const client = {
      responses: {
        create: async (): Promise<AsyncIterable<XaiStreamEvent>> => {
          throw new Error('401 invalid api key')
        },
      },
    }
    const intelligence = createXaiIntelligence({ client, prompts })
    await expect(intelligence.generatePlan(brief)).rejects.toThrow('401 invalid api key')
  })

  it('Scenario 7: onUsage receives one record per call with tool calls, cache reads and the billed cost from the usage block', async () => {
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
          cost_in_usd_ticks: 548692500,
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
        billedUsd: 0.05486925,
        ms: 250,
      },
    ])
  })

  it('Scenario 7b: the older server_side_tool_usage map is read too, and cached_tokens defaults to 0 when absent', async () => {
    const records: { toolCalls: Record<string, number>; cacheReadTokens: number; billedUsd?: number }[] = []
    const { intelligence } = build(
      { url: null },
      { onUsage: (u) => records.push(u) },
      { usage: { input_tokens: 10, output_tokens: 2, server_side_tool_usage: { SERVER_SIDE_TOOL_WEB_SEARCH: 2 } } }
    )
    await intelligence.findReplacementUrl(fixturePlan.sessions[0].materials[0], 'loops')
    expect(records[0].toolCalls).toEqual({ web_search: 2 })
    expect(records[0].cacheReadTokens).toBe(0)
    expect('billedUsd' in records[0]).toBe(false)
  })

  it('Scenario 11: the answer is read from the terminal event, not from deltas; a failed response or an error event throws IntelligenceError', async () => {
    const failed = build(fixturePlan, {}, { status: 'failed', error: { message: 'model overloaded' } }, 'response.failed')
    await expect(failed.intelligence.generatePlan(brief)).rejects.toThrow(IntelligenceError)
    await expect(failed.intelligence.generatePlan(brief)).rejects.toThrow(/model overloaded/)

    const client = {
      responses: {
        create: async (): Promise<AsyncIterable<XaiStreamEvent>> =>
          streamOf({ type: 'error', message: 'stream broke', code: 'server_error' }),
      },
    }
    const errored = createXaiIntelligence({ client, prompts })
    await expect(errored.generatePlan(brief)).rejects.toThrow(/stream broke/)

    const silent = { responses: { create: async (): Promise<AsyncIterable<XaiStreamEvent>> => streamOf() } }
    const ended = createXaiIntelligence({ client: silent, prompts })
    await expect(ended.generatePlan(brief)).rejects.toThrow(/ended without a terminal event/)
  })

  it('Scenario 12: the answer is the last JSON document in the output text; prose and fences around it are skipped', async () => {
    const stub = { meta: {}, disssPreamble: {}, stakes: '', phases: [], sessions: [] }
    const { intelligence } = build(`${JSON.stringify(stub)}${JSON.stringify(fixturePlan)}`)
    expect(await intelligence.generatePlan(brief)).toEqual(fixturePlan)

    const prose = build(`Session 3 is a drop, so I'll advance {past} payoffs.

\`\`\`json
${JSON.stringify({ url: 'https://example.com/b{"}' })}
\`\`\`
Done.`)
    expect(await prose.intelligence.findReplacementUrl(fixturePlan.sessions[0].materials[0], 'loops')).toBe(
      'https://example.com/b{"}'
    )

    const spaced = build(`${JSON.stringify({ url: null })}

${JSON.stringify({ url: 'https://example.com/a' })}`)
    expect(await spaced.intelligence.findReplacementUrl(fixturePlan.sessions[0].materials[0], 'loops')).toBe(
      'https://example.com/a'
    )

    // A truncated trailing document reads as prose: the last complete one wins (a cut response is `incomplete` and throws before this).
    const trailingJunk = build(`${JSON.stringify({ url: 'https://example.com/whole' })}{"url": "https://example.com/cut`)
    expect(await trailingJunk.intelligence.findReplacementUrl(fixturePlan.sessions[0].materials[0], 'loops')).toBe(
      'https://example.com/whole'
    )
  })

  it('Scenario 11b: a response whose output has no message item is unparseable output', async () => {
    const { intelligence } = build('', {}, { output: [{ type: 'reasoning', summary: [] }] })
    await expect(intelligence.generatePlan(brief)).rejects.toThrow(/unparseable output/)
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
